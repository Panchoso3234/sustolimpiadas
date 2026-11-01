-- Las Sustolimpiadas · 31 de octubre · Guerra de Tanques: un tanque de máquina quedó metido en el mapa y no se podía
-- matar (arreglado en f333da9). Se borran SOLO los intentos de ODIO A MOMOKA en su duelo pendiente de Guerra de Tanques,
-- para que los juegue de nuevo. Los del rival no se tocan y el desafío (semilla) sigue igual, para que sea parejo.
-- Ejecutar UNA vez en el editor SQL de Supabase. Si encuentra más de un perfil o más de un duelo, se detiene sin borrar nada.

-- 1) Antes: qué intentos hay (para tener registro)
select e.id as duelo, p.nombre, m.lado, m.ronda, m.puntaje, m.terminado
from public.enfrentamientos e
join public.enfrentamiento_marcas m on m.enfrentamiento_id = e.id
join public.perfiles p on p.id = m.perfil_id
where e.juego = 'tanques' and e.estado = 'pendiente'
  and (e.a_perfil in (select id from public.perfiles where nombre ilike '%momoka%')
    or e.b_perfil in (select id from public.perfiles where nombre ilike '%momoka%'))
order by e.id, m.lado, m.ronda;

-- 2) Borrar solo los intentos de ODIO A MOMOKA
do $$
declare v_perfil uuid; v_duelo bigint; v_n int; v_borradas int;
begin
  select count(*) into v_n from public.perfiles where nombre ilike '%momoka%';
  if v_n <> 1 then raise exception 'Se esperaba 1 perfil con "momoka" y hay %', v_n; end if;
  select id into v_perfil from public.perfiles where nombre ilike '%momoka%';

  select count(*) into v_n from public.enfrentamientos
    where juego = 'tanques' and estado = 'pendiente' and v_perfil in (a_perfil, b_perfil);
  if v_n <> 1 then raise exception 'Se esperaba 1 duelo pendiente de Guerra de Tanques y hay %', v_n; end if;
  select id into v_duelo from public.enfrentamientos
    where juego = 'tanques' and estado = 'pendiente' and v_perfil in (a_perfil, b_perfil);

  delete from public.enfrentamiento_marcas where enfrentamiento_id = v_duelo and perfil_id = v_perfil;
  get diagnostics v_borradas = row_count;
  raise notice 'Duelo %: se borraron % intentos de ODIO A MOMOKA', v_duelo, v_borradas;
end $$;

-- 3) Comprobación: ODIO A MOMOKA ya no debe aparecer en ese duelo (el rival queda igual)
select e.id as duelo, p.nombre, count(*) as intentos
from public.enfrentamientos e
join public.enfrentamiento_marcas m on m.enfrentamiento_id = e.id
join public.perfiles p on p.id = m.perfil_id
where e.juego = 'tanques' and e.estado = 'pendiente'
  and (e.a_perfil in (select id from public.perfiles where nombre ilike '%momoka%')
    or e.b_perfil in (select id from public.perfiles where nombre ilike '%momoka%'))
group by e.id, p.nombre;
