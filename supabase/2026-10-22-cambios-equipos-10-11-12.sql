-- Las Sustolimpiadas · 22 de octubre: cambios pedidos por Pancho en los equipos 10, 11 y 12
--   GiyuuSilly: Equipo 10 → Equipo 11
--   o_Maty_o:   Equipo 11 → Equipo 10
--   Bubu (sin cuenta) ↔ Junior: Bubu pasa al Equipo 12 y Junior al Equipo 10
-- Queda: Equipo 10 = Schrödinger, o_Maty_o, Junior · Equipo 11 = Monti, GiyuuSilly, Izuki · Equipo 12 = LaL, Bubu, Insterstellarglow
-- Si se ejecuta de nuevo, no cambia nada más.

update public.equipo_miembros m
   set equipo_id = q.id
  from public.perfiles p, public.equipos q
 where m.perfil_id = p.id
   and (p.nombre, q.nombre) in (('GiyuuSilly', 'Equipo 11'), ('o_Maty_o', 'Equipo 10'), ('Junior', 'Equipo 10'));

update public.equipo_pendientes x
   set equipo_id = (select id from public.equipos where nombre = 'Equipo 12')
 where x.nombre = 'Bubu';

-- Para revisar
select q.nombre as equipo,
       (select string_agg(p.nombre, ', ') from public.equipo_miembros m join public.perfiles p on p.id = m.perfil_id where m.equipo_id = q.id) as con_cuenta,
       (select string_agg(x.nombre, ', ') from public.equipo_pendientes x where x.equipo_id = q.id) as sin_cuenta
  from public.equipos q where q.nombre in ('Equipo 10', 'Equipo 11', 'Equipo 12') order by q.id;
