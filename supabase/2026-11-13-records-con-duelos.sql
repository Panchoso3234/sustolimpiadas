-- Las Sustolimpiadas · 13 de noviembre · Los Récords cuentan también los duelos 1v1 (pedido de Choi y Palta)
-- records_top (de siempre, también el récord que se ve dentro de cada juego) y records_periodo (hoy / semana) ahora
-- suman las rondas TERMINADAS de los duelos 1v1 oficiales, además de las partidas Individuales. Cada fila trae
-- `duelo` = true si ese mejor puntaje salió de un duelo (la web le pone ⚔️). Los topes contra trampas se aplican igual.
-- No cambia ningún puntaje guardado. Se puede ejecutar más de una vez.

begin;

-- Todas las marcas que cuentan para récords: Individual + rondas de duelo 1v1 oficiales (fecha de Chile)
create or replace function public.marcas_para_records() returns table (juego text, perfil_id uuid, puntaje integer, fecha date, duelo boolean)
language sql stable security definer set search_path = '' as $$
  select m.juego, m.perfil_id, m.puntaje, m.fecha, false from public.marcas m
  union all
  select e.juego, r.perfil_id, r.puntaje, (r.creado at time zone 'America/Santiago')::date, true
  from public.enfrentamiento_marcas r join public.enfrentamientos e on e.id = r.enfrentamiento_id
  where r.terminado and e.modo = '1v1' and e.oficial and e.juego is not null;
$$;
revoke all on function public.marcas_para_records() from public, anon, authenticated;

-- Cambia el tipo de lo que devuelven (columna nueva `duelo`): hay que borrarlas y crearlas de nuevo
drop function if exists public.records_top(jsonb);
create function public.records_top(p_topes jsonb default '{}'::jsonb)
returns table (juego text, perfil uuid, nombre text, puntaje integer, duelo boolean)
language sql stable security definer set search_path = '' as $$
  with mejor as (
    -- la mejor marca de cada persona en cada juego (en empate gana la Individual)
    select distinct on (m.juego, m.perfil_id) m.juego, m.perfil_id, m.puntaje, m.duelo
    from public.marcas_para_records() m
    where m.puntaje <= coalesce((p_topes ->> m.juego)::numeric, 1e12)
    order by m.juego, m.perfil_id, m.puntaje desc, m.duelo
  ),
  orden as (select mejor.*, row_number() over (partition by mejor.juego order by mejor.puntaje desc, mejor.perfil_id) as n from mejor)
  select o.juego, o.perfil_id, p.nombre, o.puntaje, o.duelo from orden o join public.perfiles p on p.id = o.perfil_id where o.n <= 3;
$$;
revoke all on function public.records_top(jsonb) from public;
grant execute on function public.records_top(jsonb) to anon, authenticated;

drop function if exists public.records_periodo(date, jsonb);
create function public.records_periodo(p_desde date, p_topes jsonb default null)
returns table (juego text, perfil uuid, nombre text, puntaje integer, duelo boolean)
language sql stable security definer set search_path = '' as $$
  with t as (select coalesce(p_topes, public.topes_dudosos()) as v),
  mejor as (
    select distinct on (m.juego, m.perfil_id) m.juego, m.perfil_id, m.puntaje, m.duelo
    from public.marcas_para_records() m, t
    where m.fecha >= p_desde and m.puntaje <= coalesce((t.v ->> m.juego)::numeric, 1e12)
    order by m.juego, m.perfil_id, m.puntaje desc, m.duelo
  ),
  orden as (select mejor.*, row_number() over (partition by mejor.juego order by mejor.puntaje desc, mejor.perfil_id) as n from mejor)
  select o.juego, o.perfil_id, p.nombre, o.puntaje, o.duelo from orden o join public.perfiles p on p.id = o.perfil_id where o.n <= 3;
$$;
revoke all on function public.records_periodo(date, jsonb) from public;
grant execute on function public.records_periodo(date, jsonb) to anon, authenticated;

commit;

-- Comprobación: récords de siempre que ahora vienen de un duelo (⚔️). Si sale alguna fila, ya funciona.
select juego, nombre, puntaje from public.records_top('{}'::jsonb) where duelo order by juego;
