-- Las Sustolimpiadas · etapa 3: liga de cruces (21 de octubre)
-- Capitanes de equipo (el staff: juega y suma para su equipo, pero no pasa a la final), número de cruce de cada duelo
-- y quién no jugó (no jugar da 0 puntos). Se ejecuta una vez en Supabase → SQL Editor; se puede volver a ejecutar.

-- Capitán de cada equipo
alter table public.equipos add column if not exists capitan uuid references public.perfiles (id) on delete set null;
grant insert (nombre, capitan), update (nombre, capitan) on public.equipos to authenticated;

-- Cruce al que pertenece cada duelo oficial (1 a 11) y quién no jugó ('a', 'b' o 'ambos'), lo anota el cierre
alter table public.enfrentamientos add column if not exists cruce smallint check (cruce is null or cruce between 1 and 30);
alter table public.enfrentamientos add column if not exists no_jugo text check (no_jugo is null or no_jugo in ('a', 'b', 'ambos'));
grant select (cruce, no_jugo) on public.enfrentamientos to anon, authenticated;
grant insert (cruce) on public.enfrentamientos to authenticated;
grant update (cruce) on public.enfrentamientos to authenticated;
create index if not exists enfrentamientos_cruce on public.enfrentamientos (cruce) where oficial;

-- El cierre ahora anota quién no jugó ninguna ronda. Si nadie jugó, no gana nadie (y nadie suma).
create or replace function public.resolver_enfrentamiento(p_id bigint, p_forzar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.enfrentamientos%rowtype;
  esperadas_a integer; esperadas_b integer; hechas_a integer; hechas_b integer; jugo_a boolean; jugo_b boolean;
  pa integer := 0; pb integer := 0; sa integer; sb integer; r integer;
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
    -- Gana quien se lleva más rondas
    for r in 1..e.rondas loop
      select coalesce(max(puntaje) filter (where lado = 'a'), 0), coalesce(max(puntaje) filter (where lado = 'b'), 0) into sa, sb
        from public.enfrentamiento_marcas where enfrentamiento_id = p_id and ronda = r and terminado;
      if sa > sb then pa := pa + 1; elsif sb > sa then pb := pb + 1; end if;
    end loop;
  else
    -- Gana el equipo que suma más entre sus integrantes
    select coalesce(sum(puntaje) filter (where lado = 'a'), 0), coalesce(sum(puntaje) filter (where lado = 'b'), 0) into pa, pb
      from public.enfrentamiento_marcas where enfrentamiento_id = p_id and terminado;
  end if;
  update public.enfrentamientos
    set estado = 'cerrado', puntos_a = pa, puntos_b = pb,
        no_jugo = case when not jugo_a and not jugo_b then 'ambos' when not jugo_a then 'a' when not jugo_b then 'b' end,
        ganador = case when not jugo_a and jugo_b then 'b' when jugo_a and not jugo_b then 'a'
                       when pa > pb then 'a' when pb > pa then 'b' else 'empate' end
    where id = p_id;
end;
$$;
revoke execute on function public.resolver_enfrentamiento(bigint, boolean) from public, anon, authenticated;
