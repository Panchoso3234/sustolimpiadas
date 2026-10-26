-- Las Sustolimpiadas · 26 de octubre
-- 1) Equipo 12: salen Bubu e Insterstellarglow (nunca entraron a la web) y entran Faby (Umbra8525) y Gojira.
--    Quedan como "pendientes" con su nombre; el organizador los vincula con su cuenta desde la Mesa → Equipos.
--    Las victorias por ausencia del cruce 1 no se tocan (ya se jugaron así).
-- 2) Se acaban las partidas dudosas: los récords, la Copa Individual y el aviso de los lunes cuentan todos los puntajes.
-- Se puede volver a ejecutar sin problema.

begin;

delete from public.equipo_pendientes
where equipo_id = (select id from public.equipos where nombre = 'Equipo 12')
  and nombre in ('Bubu', 'Insterstellarglow');

insert into public.equipo_pendientes (equipo_id, nombre)
select q.id, n.nombre
from public.equipos q, (values ('Faby (Umbra8525)'), ('Gojira')) as n (nombre)
where q.nombre = 'Equipo 12'
  and not exists (select 1 from public.equipo_pendientes p where p.equipo_id = q.id and p.nombre = n.nombre);

-- Sin topes: las funciones de récords y de la Copa ya no descartan ningún puntaje
create or replace function public.topes_dudosos() returns jsonb language sql immutable as $$ select '{}'::jsonb $$;

commit;

-- Comprobación: el Equipo 12 debe mostrar a su integrante con cuenta y a Faby y Gojira como pendientes
select 'integrante' as tipo, p.nombre from public.equipo_miembros m join public.perfiles p on p.id = m.perfil_id
  where m.equipo_id = (select id from public.equipos where nombre = 'Equipo 12')
union all
select 'pendiente', nombre from public.equipo_pendientes where equipo_id = (select id from public.equipos where nombre = 'Equipo 12');
