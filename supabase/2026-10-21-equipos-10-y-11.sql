-- Las Sustolimpiadas · 21 de octubre: completar los equipos y rehacer los cruces
-- 1) Guarda el capitán (staff) de los equipos 1 al 8, según la foto de los equipos oficiales.
-- 2) Crea el Equipo 10 (3 personas) y el Equipo 11 (4 personas) con quienes faltaban (sorteo al azar).
--    Quienes todavía no entran al sitio quedan "sin cuenta": se vinculan en Mesa → Equipos cuando entren.
-- 3) Borra los duelos del cruce 1 que se crearon con 9 equipos (ninguno se había jugado).
-- Se ejecuta UNA vez en Supabase → SQL Editor → New query → Run.

do $$
declare e10 bigint; e11 bigint;
begin
  -- 1) Capitanes: solo si esa persona de verdad está en ese equipo
  update public.equipos q set capitan = p.id
    from public.perfiles p
   where (q.nombre, p.nombre) in (('Equipo 1', 'Pancho_3'), ('Equipo 2', 'Valepzmno - CEO of mizuena'), ('Equipo 3', 'ODIO A MOMOKA'), ('Equipo 4', 'Rigoberto?'),
                                  ('Equipo 5', 'Tsuki'), ('Equipo 6', 'El Leona Tactico'), ('Equipo 7', 'Baalbierth.'), ('Equipo 8', 'Astrea'))
     and exists (select 1 from public.equipo_miembros m where m.perfil_id = p.id and m.equipo_id = q.id);

  -- 2) Equipos nuevos (si ya existen, no se duplican)
  if exists (select 1 from public.equipos where nombre in ('Equipo 10', 'Equipo 11')) then
    raise notice 'El Equipo 10 o el 11 ya existían: no se crearon de nuevo.';
  else
    insert into public.equipos (nombre) values ('Equipo 10') returning id into e10;
    insert into public.equipos (nombre) values ('Equipo 11') returning id into e11;
    -- Equipo 10: GiyuuSilly, Monti (con cuenta) y Maty (sin cuenta)
    insert into public.equipo_miembros (perfil_id, equipo_id)
      select id, e10 from public.perfiles where nombre in ('GiyuuSilly', 'Monti')
      on conflict (perfil_id) do update set equipo_id = excluded.equipo_id;
    insert into public.equipo_pendientes (equipo_id, nombre) values (e10, 'Maty');
    -- Equipo 11: Hurona, Insterstellarglow, Bubu y el_Gato (los cuatro sin cuenta todavía)
    insert into public.equipo_pendientes (equipo_id, nombre) values (e11, 'Hurona'), (e11, 'Insterstellarglow'), (e11, 'Bubu'), (e11, 'el_Gato');
  end if;

  -- 3) Borrar los duelos de los cruces creados hasta ahora (se vuelven a crear con los 11 equipos)
  delete from public.enfrentamientos where oficial and cruce is not null;
end $$;

-- Para revisar cómo quedó: un equipo por fila, con su capitán y sus integrantes
select q.nombre as equipo,
       (select nombre from public.perfiles where id = q.capitan) as capitan,
       (select string_agg(p.nombre, ', ') from public.equipo_miembros m join public.perfiles p on p.id = m.perfil_id where m.equipo_id = q.id) as con_cuenta,
       (select string_agg(x.nombre, ', ') from public.equipo_pendientes x where x.equipo_id = q.id) as sin_cuenta
  from public.equipos q order by q.id;
