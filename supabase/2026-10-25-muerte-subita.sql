-- Las Sustolimpiadas · 25 de octubre: muerte súbita en los duelos 1v1.
-- Si los dos jugaron y quedan iguales en rondas ganadas, el duelo no se cierra: se agrega una ronda más (con un desafío
-- nuevo) y el bot avisa. Puede haber hasta 2 rondas extra. Si siguen iguales, o si vence el plazo antes de jugarlas,
-- desempata la suma de puntaje de las rondas que jugaron los dos y, si también es igual, la mejor ronda de cada uno.
-- Solo si todo es idéntico queda empate. El plazo se corre un día si la muerte súbita aparece el último día.
-- Se puede volver a ejecutar sin problema.

alter table public.enfrentamientos add column if not exists muerte_subita smallint not null default 0;
alter table public.enfrentamientos add column if not exists desempate text check (desempate is null or desempate in ('suma', 'mejor_ronda'));
grant select (muerte_subita, desempate) on public.enfrentamientos to anon, authenticated;
-- Las rondas extra pasan del máximo de 5 que se permitía al crear
alter table public.enfrentamientos drop constraint if exists enfrentamientos_rondas_check;
alter table public.enfrentamientos add constraint enfrentamientos_rondas_check check (rondas between 1 and 8);

create or replace function public.resolver_enfrentamiento(p_id bigint, p_forzar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.enfrentamientos%rowtype;
  esperadas_a integer; esperadas_b integer; hechas_a integer; hechas_b integer; jugo_a boolean; jugo_b boolean;
  pa integer := 0; pb integer := 0; sa integer; sb integer; r integer;
  suma_a bigint := 0; suma_b bigint := 0; mejor_a integer := 0; mejor_b integer := 0; v_desempate text; v_ganador text;
begin
  select * into e from public.enfrentamientos where id = p_id for update;
  if not found or e.estado <> 'pendiente' then return; end if;
  -- Al cerrar a la fuerza, una partida que quedó a medias vale lo último que el juego alcanzó a guardar
  if p_forzar then
    update public.enfrentamiento_marcas set terminado = true, detalle = detalle || '{"interrumpido": true}'::jsonb
      where enfrentamiento_id = p_id and not terminado;
  end if;
  if e.modo = '1v1' then
    esperadas_a := e.rondas; esperadas_b := e.rondas;
  else
    select least(3, count(*)) into esperadas_a from public.equipo_miembros where equipo_id = e.a_equipo;
    select least(3, count(*)) into esperadas_b from public.equipo_miembros where equipo_id = e.b_equipo;
  end if;
  select count(*) filter (where lado = 'a'), count(*) filter (where lado = 'b') into hechas_a, hechas_b
    from public.enfrentamiento_marcas where enfrentamiento_id = p_id and terminado;
  if not p_forzar and (hechas_a < esperadas_a or hechas_b < esperadas_b) then return; end if;
  jugo_a := hechas_a > 0; jugo_b := hechas_b > 0;
  if e.modo = '1v1' then
    -- Gana quien se lleva más rondas; para el desempate se anotan la suma y la mejor ronda de las que jugaron los dos
    for r in 1..e.rondas loop
      select max(puntaje) filter (where lado = 'a'), max(puntaje) filter (where lado = 'b') into sa, sb
        from public.enfrentamiento_marcas where enfrentamiento_id = p_id and ronda = r and terminado;
      if coalesce(sa, 0) > coalesce(sb, 0) then pa := pa + 1; elsif coalesce(sb, 0) > coalesce(sa, 0) then pb := pb + 1; end if;
      if sa is not null and sb is not null then
        suma_a := suma_a + sa; suma_b := suma_b + sb; mejor_a := greatest(mejor_a, sa); mejor_b := greatest(mejor_b, sb);
      end if;
    end loop;
    -- Muerte súbita: los dos jugaron y quedaron iguales en rondas
    if jugo_a and jugo_b and pa = pb and not p_forzar and e.muerte_subita < 2 then
      update public.enfrentamientos
        set rondas = rondas + 1, muerte_subita = muerte_subita + 1,
            plazo = case when plazo is null then null else greatest(plazo, (now() at time zone 'America/Santiago')::date + 1) end
        where id = p_id;
      return;
    end if;
  else
    -- Gana el equipo que suma más entre sus integrantes
    select coalesce(sum(puntaje) filter (where lado = 'a'), 0), coalesce(sum(puntaje) filter (where lado = 'b'), 0) into pa, pb
      from public.enfrentamiento_marcas where enfrentamiento_id = p_id and terminado;
  end if;
  v_ganador := case when not jugo_a and jugo_b then 'b' when jugo_a and not jugo_b then 'a'
                    when pa > pb then 'a' when pb > pa then 'b' else 'empate' end;
  -- Desempate de un 1v1 igualado: suma de puntaje y, si sigue igual, la mejor ronda
  if e.modo = '1v1' and v_ganador = 'empate' and jugo_a and jugo_b then
    if suma_a <> suma_b then v_ganador := case when suma_a > suma_b then 'a' else 'b' end; v_desempate := 'suma';
    elsif mejor_a <> mejor_b then v_ganador := case when mejor_a > mejor_b then 'a' else 'b' end; v_desempate := 'mejor_ronda';
    end if;
  end if;
  update public.enfrentamientos
    set estado = 'cerrado', puntos_a = pa, puntos_b = pb, desempate = v_desempate,
        no_jugo = case when not jugo_a and not jugo_b then 'ambos' when not jugo_a then 'a' when not jugo_b then 'b' end,
        ganador = v_ganador
    where id = p_id;
end;
$$;
revoke execute on function public.resolver_enfrentamiento(bigint, boolean) from public, anon, authenticated;

-- Aviso del bot cuando un duelo oficial pasa a muerte súbita
create or replace function public.aviso_muerte_subita() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.rondas <= old.rondas or new.muerte_subita <= old.muerte_subita or new.estado <> 'pendiente' or not new.oficial then return new; end if;
  perform public.avisar_discord(format(E'**Muerte súbita** · Cruce %s · %s: %s y %s quedaron iguales en rondas.\nSe juega una ronda más (la %s), con un desafío nuevo. Plazo: hasta el %s a las 23:59.',
    coalesce(new.cruce::text, '-'), public.nombre_juego(new.juego), public.mencion(new.a_perfil), public.mencion(new.b_perfil), new.rondas,
    coalesce(to_char(new.plazo, 'DD/MM'), 'sin plazo')), 'resultados');
  return new;
end; $$;
drop trigger if exists aviso_muerte_subita on public.enfrentamientos;
create trigger aviso_muerte_subita after update on public.enfrentamientos for each row execute function public.aviso_muerte_subita();

-- Resultado de un duelo: ahora dice si se definió por suma de puntaje o por la mejor ronda
create or replace function public.aviso_duelo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_p jsonb; v_mult numeric; v_gana uuid; v_pierde uuid; v_juego text; v_texto text; v_victoria numeric; v_empate numeric; v_derrota numeric;
  v_lado text; v_r1_gana integer; v_r1_pierde integer; v_remontada text; v_como text;
begin
  if new.estado <> 'cerrado' or old.estado = 'cerrado' or not new.oficial or new.cruce is null or new.modo <> '1v1' then return new; end if;
  select valor into v_p from public.ajustes where clave = 'puntos';
  v_mult := coalesce((v_p -> 'multiplicadores' ->> (new.jornada - 1))::numeric, 1);
  v_victoria := trim_scale(round(coalesce((v_p ->> 'victoria')::numeric, 7) * v_mult, 2));
  v_empate := trim_scale(round(coalesce((v_p ->> 'empate')::numeric, 6) * v_mult, 2));
  v_derrota := trim_scale(round(coalesce((v_p ->> 'derrota')::numeric, 4) * v_mult, 2));
  v_juego := public.nombre_juego(new.juego);
  v_como := case new.desempate when 'suma' then ' (iguales en rondas: ganó por suma de puntaje)' when 'mejor_ronda' then ' (iguales en rondas y en suma: ganó por su mejor ronda)' else '' end
    || case when new.muerte_subita > 0 then format(' tras %s %s de muerte súbita', new.muerte_subita, case when new.muerte_subita = 1 then 'ronda' else 'rondas' end) else '' end;
  if new.no_jugo = 'ambos' then
    v_texto := format('Cruce %s · %s: %s y %s no jugaron (0 puntos para los dos).', new.cruce, v_juego, public.mencion(new.a_perfil), public.mencion(new.b_perfil));
  elsif new.ganador = 'empate' then
    v_texto := format('Cruce %s · %s: **empate** entre %s y %s (%s-%s)%s. **+%s** para cada uno y su equipo.', new.cruce, v_juego, public.mencion(new.a_perfil), public.mencion(new.b_perfil), new.puntos_a, new.puntos_b, v_como, v_empate);
  else
    v_gana := case when new.ganador = 'a' then new.a_perfil else new.b_perfil end;
    v_pierde := case when new.ganador = 'a' then new.b_perfil else new.a_perfil end;
    v_texto := format('Cruce %s · %s: %s le ganó a %s %s%s.' || E'\n' || 'Ganador: %s suma **+%s** (también para %s).' || E'\n' || '%s',
      new.cruce, v_juego, public.mencion(v_gana), public.mencion(v_pierde),
      case when new.no_jugo is not null then '(no se presentó)' else format('%s-%s', greatest(new.puntos_a, new.puntos_b), least(new.puntos_a, new.puntos_b)) end, v_como,
      public.mencion(v_gana), v_victoria, coalesce(public.nombre_equipo(v_gana), 'su equipo'),
      case when new.no_jugo is not null then format('%s no se presentó: 0 puntos.', public.mencion(v_pierde))
        else format('Perdedor: %s suma solo **+%s** (también para %s).', public.mencion(v_pierde), v_derrota, coalesce(public.nombre_equipo(v_pierde), 'su equipo')) end);
    -- Remontada: el ganador perdió la primera ronda
    if new.rondas > 1 and new.no_jugo is null then
      v_lado := new.ganador;
      select max(puntaje) filter (where lado = v_lado), max(puntaje) filter (where lado <> v_lado) into v_r1_gana, v_r1_pierde
        from public.enfrentamiento_marcas where enfrentamiento_id = new.id and ronda = 1 and terminado;
      if v_r1_gana < v_r1_pierde then
        v_remontada := format('**Remontada:** %s perdió la primera ronda de %s contra %s y aun así ganó el duelo.', public.mencion(v_gana), v_juego, public.mencion(v_pierde));
      end if;
    end if;
  end if;
  perform public.avisar_discord(v_texto, 'resultados');
  if v_remontada is not null then perform public.avisar_discord(v_remontada, 'hazanas'); end if;
  return new;
end; $$;
