-- Las Sustolimpiadas · 24 de octubre: el bot de Discord avisa más cosas y por canal.
--   1. Resumen al cerrar cada cruce: cómo quedó cada enfrentamiento de equipos, el bono y cómo se movió la tabla.
--   2. Tabla de posiciones semanal (domingo a las 23:00 de Chile): equipos, mejores jugadores y el corte de la final.
--   3. Aviso de duelo en vivo con el enlace para mirarlo.
--   5. Hazañas: remontadas en los duelos, torre completa de PUCHAMON y récords del día (todas las noches a las 23:55).
--   6. Cuenta regresiva a la final en cada resumen de cruce y, al cerrar el último cruce, quiénes van a la final.
--   7. Cada aviso va a su canal: resultados, recordatorios, tabla, en-vivo y hazanas. Un canal sin webhook propio usa el general.
-- Los mensajes van sin emojis. Se puede volver a ejecutar sin problema: no publica nada por sí solo.

-- ───────── 7. Un webhook por canal ─────────
-- Avisos que ya se mandaron (para no repetir el resumen de un cruce)
create table if not exists public.avisos_enviados (clave text primary key, creado timestamptz not null default now());
alter table public.avisos_enviados enable row level security;
revoke all on public.avisos_enviados from anon, authenticated;

drop function if exists public.avisar_discord(text);
create or replace function public.avisar_discord(p_texto text, p_canal text default 'general') returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  select coalesce((select valor from public.secretos where clave = 'discord_webhook_' || p_canal),
                  (select valor from public.secretos where clave = 'discord_webhook')) into v_url;
  if v_url is null or v_url not like 'https://discord.com/api/webhooks/%' then return; end if;
  perform net.http_post(url := v_url, body := jsonb_build_object('content', left(p_texto, 1990), 'allowed_mentions', jsonb_build_object('parse', jsonb_build_array('users'))));
end; $$;
revoke all on function public.avisar_discord(text, text) from public, anon, authenticated;

-- ───────── Tablas de la liga (las mismas reglas que la Tabla oficial de la web) ─────────
-- Cada duelo: ganar, empatar o perder según ajustes (hoy 7, 6 y 4) y no jugar 0, por el multiplicador de la jornada.
-- Bono de cruce: +5 (por el multiplicador) al equipo que gana 2 duelos de su enfrentamiento. `p_hasta`: hasta qué cruce contar.
create or replace function public.puntos_liga(p_hasta smallint default null)
returns table (perfil uuid, equipo_id bigint, puntos numeric, ganados integer, bono boolean)
language sql stable security definer set search_path = '' as $$
  with p as (select coalesce((select valor from public.ajustes where clave = 'puntos'), '{}'::jsonb) as v),
  d as (
    select e.id, e.cruce, e.ganador, e.no_jugo, e.a_perfil, e.b_perfil,
      coalesce((p.v -> 'multiplicadores' ->> (e.jornada - 1))::numeric, 1) as mult, p.v
    from public.enfrentamientos e, p
    where e.oficial and e.modo = '1v1' and e.estado = 'cerrado' and e.ganador is not null
      and (e.creado at time zone 'America/Santiago')::date >= date '2026-10-21'
      and (p_hasta is null or e.cruce <= p_hasta)
  ),
  lados as (
    select d.*, l.lado, l.perfil, (select m.equipo_id from public.equipo_miembros m where m.perfil_id = l.perfil) as eq
    from d cross join lateral (values ('a', d.a_perfil), ('b', d.b_perfil)) as l(lado, perfil)
  ),
  duelos as (
    select perfil, eq,
      case when no_jugo in (lado, 'ambos') then 0
        when ganador = 'empate' then mult * coalesce((v ->> 'empate')::numeric, 6)
        when ganador = lado then mult * coalesce((v ->> 'victoria')::numeric, 7)
        else mult * coalesce((v ->> 'derrota')::numeric, 4) end as pts,
      (ganador = lado and coalesce(no_jugo, '') not in (lado, 'ambos'))::integer as gano
    from lados
  ),
  pares as (
    select a.cruce, a.mult, least(a.eq, b.eq) as e1, greatest(a.eq, b.eq) as e2, case when a.ganador = 'a' then a.eq else b.eq end as gana
    from lados a join lados b on b.id = a.id and a.lado = 'a' and b.lado = 'b'
    where a.cruce is not null and a.eq is not null and b.eq is not null and a.eq <> b.eq and a.ganador <> 'empate'
  ),
  bonos as (select gana as eq, 5 * max(mult) as pts from pares group by cruce, e1, e2, gana having count(*) >= 2)
  select perfil, eq, pts, gano, false from duelos
  union all
  select null, eq, pts, 0, true from bonos;
$$;
revoke all on function public.puntos_liga(smallint) from public, anon, authenticated;

create or replace function public.tabla_equipos(p_hasta smallint default null)
returns table (pos integer, equipo_id bigint, nombre text, puntos numeric, ganados integer)
language sql stable security definer set search_path = '' as $$
  select (row_number() over (order by coalesce(sum(x.puntos), 0) desc, coalesce(sum(x.ganados), 0) desc, q.nombre))::integer,
    q.id, q.nombre, coalesce(sum(x.puntos), 0), coalesce(sum(x.ganados), 0)::integer
  from public.equipos q left join public.puntos_liga(p_hasta) x on x.equipo_id = q.id
  group by q.id, q.nombre;
$$;
revoke all on function public.tabla_equipos(smallint) from public, anon, authenticated;

-- Jugadores con su puntaje personal; staff = capitán de un equipo o cuenta de administración (no clasifica a la final)
create or replace function public.tabla_jugadores(p_hasta smallint default null)
returns table (pos integer, perfil uuid, equipo_id bigint, puntos numeric, ganados integer, staff boolean)
language sql stable security definer set search_path = '' as $$
  select (row_number() over (order by coalesce(sum(x.puntos), 0) desc, coalesce(sum(x.ganados), 0) desc))::integer,
    m.perfil_id, m.equipo_id, coalesce(sum(x.puntos), 0), coalesce(sum(x.ganados), 0)::integer,
    exists (select 1 from public.equipos q where q.capitan = m.perfil_id) or exists (select 1 from public.perfiles f where f.id = m.perfil_id and f.rol <> 'jugador')
  from public.equipo_miembros m left join public.puntos_liga(p_hasta) x on x.perfil = m.perfil_id and not x.bono
  group by m.perfil_id, m.equipo_id;
$$;
revoke all on function public.tabla_jugadores(smallint) from public, anon, authenticated;

-- Quiénes irían a la final hoy: los participantes (sin staff) de los 4 mejores equipos y, hasta completar 12, los mejores puntajes personales
create or replace function public.clasificados_final() returns table (perfil uuid, como text)
language sql stable security definer set search_path = '' as $$
  with top as (select equipo_id from public.tabla_equipos() where pos <= 4),
  j as (select * from public.tabla_jugadores() where not staff),
  por_equipo as (select perfil, 'equipo'::text as como, puntos from j where equipo_id in (select equipo_id from top)),
  resto as (select perfil, 'especial'::text as como, puntos from j where equipo_id not in (select equipo_id from top) and puntos > 0
            order by puntos desc limit greatest(0, 12 - (select count(*) from por_equipo)))
  select perfil, como from por_equipo union all select perfil, como from resto;
$$;
revoke all on function public.clasificados_final() from public, anon, authenticated;

create or replace function public.pts(p numeric) returns text language sql immutable as $$ select trim_scale(round(p, 2))::text $$;

-- Texto de la tabla de equipos: posición, nombre y puntos, con la raya del corte de la final después del 4.º
create or replace function public.texto_tabla(p_hasta smallint default null, p_antes smallint default null) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(format('%s. %s · %s pts%s%s', t.pos, t.nombre, public.pts(t.puntos),
      case when a.pos is null or a.pos = t.pos then '' when a.pos > t.pos then format(' (sube %s)', a.pos - t.pos) else format(' (baja %s)', t.pos - a.pos) end,
      case when t.pos = 4 then E'\n------ corte de la final ------' else '' end), E'\n' order by t.pos)
  from public.tabla_equipos(p_hasta) t left join public.tabla_equipos(p_antes) a on p_antes is not null and a.equipo_id = t.equipo_id;
$$;
revoke all on function public.texto_tabla(smallint, smallint) from public, anon, authenticated;

-- ───────── 1 y 6. Resumen al cerrar un cruce, con la cuenta regresiva y, en el último, los clasificados ─────────
create or replace function public.resumen_cruce(p_cruce smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_enfr text; v_quedan integer; v_corte text; v_ultimo integer := 11; v_lista text;
begin
  -- Cada enfrentamiento de equipos: victorias de cada lado y el bono
  with d as (
    select e.ganador, ma.equipo_id as qa, mb.equipo_id as qb
    from public.enfrentamientos e
    join public.equipo_miembros ma on ma.perfil_id = e.a_perfil join public.equipo_miembros mb on mb.perfil_id = e.b_perfil
    where e.oficial and e.modo = '1v1' and e.cruce = p_cruce and e.estado = 'cerrado'),
  pares as (
    select least(qa, qb) as e1, greatest(qa, qb) as e2,
      count(*) filter (where (ganador = 'a' and qa = least(qa, qb)) or (ganador = 'b' and qb = least(qa, qb))) as v1,
      count(*) filter (where (ganador = 'a' and qa = greatest(qa, qb)) or (ganador = 'b' and qb = greatest(qa, qb))) as v2
    from d where qa <> qb group by 1, 2)
  select string_agg(format('%s %s - %s %s%s', q1.nombre, v1, v2, q2.nombre,
      case when v1 >= 2 then format(' (bono para %s)', q1.nombre) when v2 >= 2 then format(' (bono para %s)', q2.nombre) else '' end), E'\n' order by q1.nombre)
  into v_enfr
  from pares join public.equipos q1 on q1.id = e1 join public.equipos q2 on q2.id = e2;

  v_quedan := v_ultimo - p_cruce;
  select format('%s está a %s pts del 4.º lugar (%s).', t5.nombre, public.pts(t4.puntos - t5.puntos), t4.nombre) into v_corte
  from public.tabla_equipos() t4 join public.tabla_equipos() t5 on t5.pos = 5 where t4.pos = 4;

  perform public.avisar_discord(format(E'**Cruce %s cerrado**\n%s\n\n**Así queda la tabla**\n%s\n\n%s',
    p_cruce, coalesce(v_enfr, 'Sin enfrentamientos de equipos.'), public.texto_tabla(null, nullif(p_cruce - 1, 0)::smallint),
    case when v_quedan > 0 then format('Quedan %s cruces para la final. %s', v_quedan, coalesce(v_corte, ''))
         else 'Terminó la fase de cruces.' end), 'resultados');

  if p_cruce >= v_ultimo then
    select string_agg(format('%s · %s%s', public.mencion(c.perfil), coalesce(public.nombre_equipo(c.perfil), 'sin equipo'),
        case when c.como = 'especial' then ' (por puntaje personal)' else '' end), E'\n')
      into v_lista from public.clasificados_final() c;
    perform public.avisar_discord(format(E'**Estos son los clasificados a la final**\n%s\n\nFelicidades a todos. Pronto avisamos las fechas de la final.', coalesce(v_lista, 'Todavía no hay clasificados.')), 'tabla');
  end if;
end; $$;
revoke all on function public.resumen_cruce(smallint) from public, anon, authenticated;

-- Se dispara cuando se cierra el último duelo pendiente de un cruce (de a uno o con el cierre nocturno de vencidos)
create or replace function public.aviso_resumen_cruce() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado <> 'cerrado' or old.estado = 'cerrado' or not new.oficial or new.cruce is null or new.modo <> '1v1' then return new; end if;
  if exists (select 1 from public.enfrentamientos where oficial and modo = '1v1' and cruce = new.cruce and estado = 'pendiente') then return new; end if;
  insert into public.avisos_enviados (clave) values ('cruce-' || new.cruce) on conflict do nothing;
  if found then perform public.resumen_cruce(new.cruce); end if;
  return new;
end; $$;
drop trigger if exists aviso_resumen_cruce on public.enfrentamientos;
create trigger aviso_resumen_cruce after update on public.enfrentamientos for each row execute function public.aviso_resumen_cruce();

-- ───────── 2. Tabla semanal: domingo a las 23:00 de Chile ─────────
create or replace function public.tabla_semanal() returns void
language plpgsql security definer set search_path = '' as $$
declare v_jug text;
begin
  if not exists (select 1 from public.puntos_liga()) then return; end if;
  select string_agg(format('%s. %s · %s · %s pts', j.pos, public.mencion(j.perfil), coalesce(public.nombre_equipo(j.perfil), 'sin equipo'), public.pts(j.puntos)), E'\n' order by j.pos)
    into v_jug from public.tabla_jugadores() j where j.pos <= 5 and j.puntos > 0;
  perform public.avisar_discord(format(E'**Tabla de la semana**\n%s\n\n**Mejores jugadores**\n%s\n\nA la final pasan los 4 primeros equipos y se completan 12 cupos con los mejores puntajes personales.',
    public.texto_tabla(), coalesce(v_jug, 'Todavía nadie suma puntos.')), 'tabla');
end; $$;
revoke all on function public.tabla_semanal() from public, anon, authenticated;

-- ───────── 3. Duelo en vivo: aviso con el enlace para mirarlo (uno por sala y día) ─────────
create or replace function public.aviso_vivo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sala text := split_part(new.id, '|', 1);
begin
  insert into public.avisos_enviados (clave) values (format('vivo-%s-%s', v_sala, split_part(new.id, '|', 2))) on conflict do nothing;
  if not found then return new; end if;
  perform public.avisar_discord(format(E'**En vivo ahora:** %s contra %s en %s.\nMíralo y predice quién gana: https://panchoso3234.github.io/sustolimpiadas/#/juegos/mirar/%s',
    public.mencion(new.a), public.mencion(new.b), public.nombre_juego(new.juego), v_sala), 'en-vivo');
  return new;
end; $$;
drop trigger if exists aviso_vivo on public.vivo_partidas;
create trigger aviso_vivo after insert on public.vivo_partidas for each row execute function public.aviso_vivo();

-- ───────── 5. Hazañas ─────────
-- Resultado de un duelo, ahora con remontadas (ganar el mejor de 3 después de perder la primera ronda)
create or replace function public.aviso_duelo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_p jsonb; v_mult numeric; v_gana uuid; v_pierde uuid; v_juego text; v_texto text; v_victoria numeric; v_empate numeric; v_derrota numeric;
  v_lado text; v_r1_gana integer; v_r1_pierde integer; v_remontada text;
begin
  if new.estado <> 'cerrado' or old.estado = 'cerrado' or not new.oficial or new.cruce is null or new.modo <> '1v1' then return new; end if;
  select valor into v_p from public.ajustes where clave = 'puntos';
  v_mult := coalesce((v_p -> 'multiplicadores' ->> (new.jornada - 1))::numeric, 1);
  v_victoria := trim_scale(round(coalesce((v_p ->> 'victoria')::numeric, 7) * v_mult, 2));
  v_empate := trim_scale(round(coalesce((v_p ->> 'empate')::numeric, 6) * v_mult, 2));
  v_derrota := trim_scale(round(coalesce((v_p ->> 'derrota')::numeric, 4) * v_mult, 2));
  v_juego := public.nombre_juego(new.juego);
  if new.no_jugo = 'ambos' then
    v_texto := format('Cruce %s · %s: %s y %s no jugaron (0 puntos para los dos).', new.cruce, v_juego, public.mencion(new.a_perfil), public.mencion(new.b_perfil));
  elsif new.ganador = 'empate' then
    v_texto := format('Cruce %s · %s: **empate** entre %s y %s (%s-%s). **+%s** para cada uno y su equipo.', new.cruce, v_juego, public.mencion(new.a_perfil), public.mencion(new.b_perfil), new.puntos_a, new.puntos_b, v_empate);
  else
    v_gana := case when new.ganador = 'a' then new.a_perfil else new.b_perfil end;
    v_pierde := case when new.ganador = 'a' then new.b_perfil else new.a_perfil end;
    v_texto := format('Cruce %s · %s: %s le ganó a %s %s.' || E'\n' || 'Ganador: %s suma **+%s** (también para %s).' || E'\n' || '%s',
      new.cruce, v_juego, public.mencion(v_gana), public.mencion(v_pierde),
      case when new.no_jugo is not null then '(no se presentó)' else format('%s-%s', greatest(new.puntos_a, new.puntos_b), least(new.puntos_a, new.puntos_b)) end,
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

-- Torre completa de PUCHAMON (una vez por persona y día)
create or replace function public.aviso_torre() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.juego <> 'bestias' or coalesce((new.detalle ->> 'ganados')::integer, 0) < 5 then return new; end if;
  insert into public.avisos_enviados (clave) values (format('torre-%s-%s', new.perfil_id, new.fecha)) on conflict do nothing;
  if found then
    perform public.avisar_discord(format('**Hazaña:** %s superó la torre completa de %s y venció a la legendaria (%s pts).', public.mencion(new.perfil_id), public.nombre_juego('bestias'), new.puntaje), 'hazanas');
  end if;
  return new;
end; $$;
drop trigger if exists aviso_torre on public.marcas;
create trigger aviso_torre after insert on public.marcas for each row execute function public.aviso_torre();

-- Récords del día: cada noche, los juegos donde alguien superó la mejor marca histórica (solo juegos con 30 partidas o más)
create or replace function public.records_del_dia() returns void
language plpgsql security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/Santiago')::date; v_lineas text;
begin
  with antes as (select juego, max(puntaje) as tope, count(*) as n from public.marcas where fecha < v_hoy group by juego),
  hoy as (select distinct on (juego) juego, perfil_id, puntaje from public.marcas where fecha = v_hoy order by juego, puntaje desc, creado)
  select string_agg(format('%s: %s con %s pts (el récord anterior era %s)', public.nombre_juego(h.juego), public.mencion(h.perfil_id), h.puntaje, a.tope), E'\n' order by public.nombre_juego(h.juego))
    into v_lineas from hoy h join antes a on a.juego = h.juego where a.n >= 30 and h.puntaje > a.tope;
  if v_lineas is not null then perform public.avisar_discord(format(E'**Récords históricos rotos hoy**\n%s', v_lineas), 'hazanas'); end if;
end; $$;
revoke all on function public.records_del_dia() from public, anon, authenticated;

-- Niveles 10, 20 y 30 del pase (ahora sin emojis y en el canal de hazañas)
create or replace function public.aviso_nivel() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_meta integer;
begin
  select max(m) into v_meta from unnest(array[10, 20, 30]) m where m > coalesce(case when tg_op = 'UPDATE' then old.nivel end, 1) and m <= new.nivel;
  if v_meta is null then return new; end if;
  perform public.avisar_discord(format('%s llegó al **nivel %s** del pase de temporada. %s', public.mencion(new.perfil_id), v_meta,
    case v_meta when 30 then '¡Pase completo!' when 20 then '¡Ya ve la torre de campeón!' else '¡Va con todo!' end), 'hazanas');
  return new;
end; $$;

-- ───────── 7. Los avisos que ya existían, en su canal y sin emojis ─────────
create or replace function public.duelos_faltantes(p_cruce smallint) returns text
language sql stable security definer set search_path = '' as $$
  with d as (select a_perfil, b_perfil from public.enfrentamientos where oficial and cruce = p_cruce and modo = '1v1'),
  pares as (
    select distinct ma.equipo_id as ta, mb.equipo_id as tb
      from d join public.equipo_miembros ma on ma.perfil_id = d.a_perfil join public.equipo_miembros mb on mb.perfil_id = d.b_perfil),
  libres as (
    select equipo_id, quien, row_number() over (partition by equipo_id order by orden, quien) as n from (
      select m.equipo_id, public.mencion(m.perfil_id) as quien, 0 as orden from public.equipo_miembros m
       where not exists (select 1 from d where m.perfil_id in (d.a_perfil, d.b_perfil))
      union all
      select x.equipo_id, '**' || x.nombre || '** (sin cuenta)', 1 from public.equipo_pendientes x) s)
  select string_agg(format('- %s vs %s  ·  %s vs %s', la.quien, lb.quien, qa.nombre, qb.nombre), E'\n' order by qa.nombre, la.n)
    from pares p
    join libres la on la.equipo_id = p.ta
    join libres lb on lb.equipo_id = p.tb and lb.n = la.n
    join public.equipos qa on qa.id = p.ta
    join public.equipos qb on qb.id = p.tb;
$$;
revoke all on function public.duelos_faltantes(smallint) from public, anon, authenticated;

create or replace function public.aviso_cruce() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cruce smallint; v_plazo date; v_lineas text; v_faltan text; v_antes integer;
begin
  for v_cruce in select distinct cruce from nuevos where oficial and cruce is not null loop
    select max(plazo) into v_plazo from nuevos where cruce = v_cruce;
    select count(*) - (select count(*) from nuevos where cruce = v_cruce) into v_antes from public.enfrentamientos where cruce = v_cruce and oficial;
    select string_agg(public.mencion(a_perfil) || ' vs ' || public.mencion(b_perfil) || ' — ' || public.nombre_juego(juego), E'\n' order by id) into v_lineas
      from nuevos where cruce = v_cruce;
    perform public.avisar_discord(format(E'%s\nPlazo: hasta el %s a las 23:59 (hora de Chile). Cada duelo es al mejor de 3.\n%s\nSe juega en la web: Juegos → Versus 1v1 (a tu hora o en vivo con tu rival). No jugar son 0 puntos para ti y tu equipo.',
      case when v_antes > 0 then format('**Cruce %s: nuevos duelos listos para jugar**', v_cruce) else format('**Cruce %s creado.** Estos duelos ya se pueden jugar:', v_cruce) end,
      to_char(v_plazo, 'DD/MM'), v_lineas), 'recordatorios');
    v_faltan := public.duelos_faltantes(v_cruce);
    if v_faltan is not null then
      perform public.avisar_discord(format(E'**Cruce %s: duelos que todavía no se pueden jugar**\nFalta que estas personas entren a la web con Discord y creen su personaje. Apenas entren, se activa su duelo.\n%s',
        v_cruce, v_faltan), 'recordatorios');
    end if;
  end loop;
  return null;
end; $$;

create or replace function public.recordatorio_cruces() returns void
language plpgsql security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/Santiago')::date; v_dia date; v_lineas text;
begin
  foreach v_dia in array array[v_hoy, v_hoy + 1] loop
    select string_agg(format('- %s — %s (%s/%s rondas)', public.mencion(x.perfil), public.nombre_juego(x.juego), x.hechas, x.rondas), E'\n') into v_lineas
    from (
      select e.juego, e.rondas, l.perfil,
        (select count(*) from public.enfrentamiento_marcas m where m.enfrentamiento_id = e.id and m.perfil_id = l.perfil and m.terminado) as hechas
      from public.enfrentamientos e
      cross join lateral (values (e.a_perfil), (e.b_perfil)) as l(perfil)
      where e.oficial and e.estado = 'pendiente' and e.plazo = v_dia and e.modo = '1v1'
    ) x where x.hechas < x.rondas;
    if v_lineas is not null then
      perform public.avisar_discord(format(E'**%s vencen duelos de la liga** (a las 23:59). Todavía les falta jugar:\n%s\nJuegos → Versus 1v1. No jugar son 0 puntos.',
        case when v_dia = v_hoy then 'HOY' else 'Mañana' end, v_lineas), 'recordatorios');
    end if;
  end loop;
end; $$;
revoke all on function public.recordatorio_cruces() from public, anon, authenticated;

-- ───────── Horarios (pg_cron trabaja en hora UTC; Chile está en UTC-3) ─────────
select cron.unschedule(jobname) from cron.job where jobname in ('tabla-semanal', 'records-del-dia');
select cron.schedule('tabla-semanal', '0 2 * * 1', 'select public.tabla_semanal()');      -- domingo 23:00 de Chile
select cron.schedule('records-del-dia', '55 2 * * *', 'select public.records_del_dia()'); -- todos los días 23:55 de Chile
