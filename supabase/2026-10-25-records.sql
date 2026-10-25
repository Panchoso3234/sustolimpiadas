-- Las Sustolimpiadas · 25 de octubre: récords de todos los juegos en una sola consulta (antes eran 37, una por juego)
-- y sin las partidas dudosas (las que pasan el tope de su juego). La web manda los topes de cada juego.
-- Se puede volver a ejecutar sin problema.

create or replace function public.records_top(p_topes jsonb default '{}'::jsonb)
returns table (juego text, perfil uuid, nombre text, puntaje integer)
language sql stable security definer set search_path = '' as $$
  with mejor as (
    select m.juego, m.perfil_id, max(m.puntaje) as puntaje
    from public.marcas m
    where m.puntaje <= coalesce((p_topes ->> m.juego)::numeric, 1e12)
    group by m.juego, m.perfil_id
  ),
  orden as (select mejor.*, row_number() over (partition by mejor.juego order by mejor.puntaje desc, mejor.perfil_id) as n from mejor)
  select o.juego, o.perfil_id, p.nombre, o.puntaje from orden o join public.perfiles p on p.id = o.perfil_id where o.n <= 3;
$$;
revoke all on function public.records_top(jsonb) from public;
grant execute on function public.records_top(jsonb) to anon, authenticated;
