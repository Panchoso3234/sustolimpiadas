-- Las Sustolimpiadas · 25 de octubre: pestaña Récords (hoy / semana / siempre, y récords de versus) y la Copa Individual.
-- La Copa es APARTE del torneo: cada día, en cada juego, la mejor marca de cada persona da puntos según su puesto
-- (del "Primer puesto" al "Último puesto" de la Mesa de control, hoy 10 a 2). Nunca se suma a la liga ni a los equipos.
-- Las partidas dudosas (sobre el tope de su juego) no cuentan en nada. Se puede volver a ejecutar sin problema.

-- Topes de partida dudosa (los mismos de la web, para los avisos del bot que no reciben los topes del navegador)
create or replace function public.topes_dudosos() returns jsonb language sql immutable as $$
  select '{"rodillos":2000,"puertas":2000,"huevo":3400,"sumo":1600,"futbol":3000,"faro":1800,"bajo":1000,"torre":2400,"cocos":2600,"cangrejos":1700,"numeros":1300,"tinta":1700,"eco":2800,"parejas":1000,"buscaconchas":1800,"luces":1800,"cartero":1000,"cofre":1300,"palabra":1000,"totem":1000,"catapulta":2800,"bolos":750,"minigolf":1000,"karts":2300,"tren":25000,"tanques":16000,"bombas":4200,"agujero":14000,"serpientes":5000,"defensa":10000,"museo":5000,"tiro":9000,"cocina":6000,"billar":8000,"triples":9000,"calabazas":3500,"laberinto":9000,"escobas":4000,"bloques":120000,"bestias":15000}'::jsonb
$$;

-- Top 3 de cada juego desde una fecha (hoy, esta semana…), sin dudosas
create or replace function public.records_periodo(p_desde date, p_topes jsonb default null)
returns table (juego text, perfil uuid, nombre text, puntaje integer)
language sql stable security definer set search_path = '' as $$
  with t as (select coalesce(p_topes, public.topes_dudosos()) as v),
  mejor as (
    select m.juego, m.perfil_id, max(m.puntaje) as puntaje
    from public.marcas m, t
    where m.fecha >= p_desde and m.puntaje <= coalesce((t.v ->> m.juego)::numeric, 1e12)
    group by m.juego, m.perfil_id
  ),
  orden as (select mejor.*, row_number() over (partition by mejor.juego order by mejor.puntaje desc, mejor.perfil_id) as n from mejor)
  select o.juego, o.perfil_id, p.nombre, o.puntaje from orden o join public.perfiles p on p.id = o.perfil_id where o.n <= 3;
$$;
revoke all on function public.records_periodo(date, jsonb) from public;
grant execute on function public.records_periodo(date, jsonb) to anon, authenticated;

-- Copa Individual entre dos fechas: puntos por puesto de cada día y juego (empates comparten puesto)
create or replace function public.copa_individual(p_desde date, p_hasta date, p_topes jsonb default null)
returns table (perfil uuid, nombre text, puntos numeric, primeros integer, podios integer, partidas integer)
language sql stable security definer set search_path = '' as $$
  with t as (select coalesce(p_topes, public.topes_dudosos()) as v),
  aj as (select coalesce((select valor from public.ajustes where clave = 'puntos'), '{}'::jsonb) as v),
  mejor as (
    select m.fecha, m.juego, m.perfil_id, max(m.puntaje) as puntaje
    from public.marcas m, t
    where m.fecha between p_desde and p_hasta and m.puntaje <= coalesce((t.v ->> m.juego)::numeric, 1e12)
    group by m.fecha, m.juego, m.perfil_id
  ),
  puesto as (
    select mejor.*, rank() over (partition by fecha, juego order by puntaje desc) - 1 as pos, count(*) over (partition by fecha, juego) as total from mejor
  ),
  pts as (
    select pu.perfil_id, pu.pos,
      case when pu.total <= 1 then coalesce((aj.v ->> 'individualMax')::numeric, 10)
        else round(coalesce((aj.v ->> 'individualMax')::numeric, 10) - (coalesce((aj.v ->> 'individualMax')::numeric, 10) - coalesce((aj.v ->> 'individualMin')::numeric, 2)) * pu.pos / (pu.total - 1), 2) end as puntos
    from puesto pu, aj
  )
  select x.perfil_id, p.nombre, trim_scale(sum(x.puntos)), count(*) filter (where x.pos = 0)::int, count(*) filter (where x.pos <= 2)::int, count(*)::int
  from pts x join public.perfiles p on p.id = x.perfil_id
  group by x.perfil_id, p.nombre
  order by sum(x.puntos) desc, count(*) filter (where x.pos = 0) desc;
$$;
revoke all on function public.copa_individual(date, date, jsonb) from public;
grant execute on function public.copa_individual(date, date, jsonb) to anon, authenticated;

-- Récords de versus que necesitan las rondas (que no todos pueden leer): mejor ronda de cada juego y remontadas por persona
create or replace function public.records_versus(p_topes jsonb default null)
returns table (tipo text, juego text, perfil uuid, nombre text, valor integer, enfrentamiento bigint)
language sql stable security definer set search_path = '' as $$
  with t as (select coalesce(p_topes, public.topes_dudosos()) as v),
  rondas as (
    select e.id, e.juego, m.perfil_id, m.puntaje, row_number() over (partition by e.juego order by m.puntaje desc, m.creado) as n
    from public.enfrentamiento_marcas m join public.enfrentamientos e on e.id = m.enfrentamiento_id, t
    where e.estado = 'cerrado' and e.modo = '1v1' and m.terminado and m.puntaje <= coalesce((t.v ->> e.juego)::numeric, 1e12)
  ),
  primera as (
    select e.id, case e.ganador when 'a' then e.a_perfil else e.b_perfil end as gana,
      max(m.puntaje) filter (where m.lado = e.ganador) as suya, max(m.puntaje) filter (where m.lado <> e.ganador) as otra
    from public.enfrentamientos e join public.enfrentamiento_marcas m on m.enfrentamiento_id = e.id and m.ronda = 1 and m.terminado
    where e.estado = 'cerrado' and e.modo = '1v1' and e.ganador in ('a', 'b') and e.rondas > 1
    group by e.id
  )
  select 'mejor_ronda', r.juego, r.perfil_id, p.nombre, r.puntaje, r.id from rondas r join public.perfiles p on p.id = r.perfil_id where r.n = 1
  union all
  select 'remontadas', null, x.gana, p.nombre, count(*)::int, null from primera x join public.perfiles p on p.id = x.gana where x.suya < x.otra group by x.gana, p.nombre;
$$;
revoke all on function public.records_versus(jsonb) from public;
grant execute on function public.records_versus(jsonb) to anon, authenticated;

-- Aviso de los lunes (00:10 de Chile): podio de la Copa de la semana que terminó y cómo va la temporada
create or replace function public.copa_semanal() returns void
language plpgsql security definer set search_path = '' as $$
declare v_hasta date := (now() at time zone 'America/Santiago')::date - 1; v_desde date := v_hasta - 6; v_semana text; v_temporada text;
begin
  select string_agg(format('%s. %s · %s pts · primeros puestos: %s', c.n, public.mencion(c.perfil), public.pts(c.puntos), c.primeros), E'\n' order by c.n)
    into v_semana from (select x.*, row_number() over (order by x.puntos desc, x.primeros desc) as n from public.copa_individual(v_desde, v_hasta) x) c where c.n <= 3;
  if v_semana is null then return; end if;
  select string_agg(format('%s. %s · %s pts', c.n, c.nombre, public.pts(c.puntos)), E'\n' order by c.n)
    into v_temporada from (select x.*, row_number() over (order by x.puntos desc, x.primeros desc) as n from public.copa_individual('2026-10-21', v_hasta) x) c where c.n <= 5;
  perform public.avisar_discord(format(E'**Copa Individual · semana del %s al %s**\n%s\n\n**Temporada**\n%s\n\nLa Copa Individual va aparte del torneo: cada día, en cada juego, tu mejor marca da de 10 a 2 puntos según tu puesto. No suma a la liga ni a los equipos.',
    to_char(v_desde, 'DD-MM'), to_char(v_hasta, 'DD-MM'), v_semana, v_temporada), 'hazanas');
end; $$;
revoke all on function public.copa_semanal() from public, anon, authenticated;

select cron.unschedule('copa-semanal') where exists (select 1 from cron.job where jobname = 'copa-semanal');
select cron.schedule('copa-semanal', '10 3 * * 1', 'select public.copa_semanal()'); -- lunes 00:10 de Chile
