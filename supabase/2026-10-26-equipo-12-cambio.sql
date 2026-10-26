-- Las Sustolimpiadas · 26 de octubre · Equipo 12: salen Bubu e Interstellar Glow, entran Faby (Umbra8525) y Gojira.
-- Más robusto que 2026-10-26-equipo-12-sin-dudosas.sql: saca a los dos tanto si están como "pendientes" (sin cuenta)
-- como si ya tenían su cuenta vinculada, y no depende de cómo se escribió el nombre (mayúsculas, espacios, Inster/Inter).
-- Faby y Gojira quedan como "pendientes"; el organizador les vincula la cuenta desde la Mesa → Equipos.
-- Las victorias por ausencia y las rondas ya jugadas no se tocan. Se puede volver a ejecutar sin problema.

begin;

-- Fuera, si estaban como pendientes
delete from public.equipo_pendientes
where equipo_id = (select id from public.equipos where nombre = 'Equipo 12')
  and (lower(nombre) like '%bubu%' or lower(replace(nombre, ' ', '')) like '%stellarglow%');

-- Fuera, si ya tenían cuenta en el equipo (la cuenta sigue existiendo, solo deja el Equipo 12)
delete from public.equipo_miembros m
using public.perfiles p
where p.id = m.perfil_id
  and m.equipo_id = (select id from public.equipos where nombre = 'Equipo 12')
  and (lower(p.nombre) like '%bubu%' or lower(replace(p.nombre, ' ', '')) like '%stellarglow%');

-- Entran Faby y Gojira como pendientes
insert into public.equipo_pendientes (equipo_id, nombre)
select q.id, n.nombre
from public.equipos q, (values ('Faby (Umbra8525)'), ('Gojira')) as n (nombre)
where q.nombre = 'Equipo 12'
  and not exists (select 1 from public.equipo_pendientes p where p.equipo_id = q.id and p.nombre = n.nombre);

commit;

-- Comprobación: el Equipo 12 sin Bubu ni Interstellar Glow, y con Faby y Gojira (pendientes hasta que les vincules la cuenta)
select 'integrante' as tipo, p.nombre from public.equipo_miembros m join public.perfiles p on p.id = m.perfil_id
  where m.equipo_id = (select id from public.equipos where nombre = 'Equipo 12')
union all
select 'pendiente', nombre from public.equipo_pendientes where equipo_id = (select id from public.equipos where nombre = 'Equipo 12');
