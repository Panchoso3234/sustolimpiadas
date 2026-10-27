-- Las Sustolimpiadas · 26 de octubre · Se disuelve el Equipo 12 (no se completó).
-- · Gojira sale del torneo (su cuenta queda, sin equipo).
-- · LaL pasa al Equipo 10 y Faby (cuenta "🪷 bunnyx 🪷") al Equipo 11: quedan dos equipos de 4. En cada cruce juegan 3
--   y descansa quien lleve más duelos (la web ya rota sola).
-- · Los puntos van con la persona: lo que LaL sumó en el cruce 1 ahora cuenta para el Equipo 10 (decisión de Pancho).
-- · El Equipo 12 queda vacío, con el nombre "Equipo 12 (disuelto)": así el calendario de todos contra todos no se
--   reordena; el equipo al que le tocaba enfrentarlo, descansa ese cruce. No aparece en la tabla (web ni bot).
-- · Cruce 2: el Equipo 2 descansa. Se anulan Chima contra Gojira (53) y Vale contra LaL (54), solo si nadie jugó una ronda.
-- Ejecutar UNA vez (al final publica el aviso en Discord).

begin;

delete from public.enfrentamientos e
where e.id in (53, 54) and e.cruce = 2 and e.estado = 'pendiente'
  and not exists (select 1 from public.enfrentamiento_marcas m where m.enfrentamiento_id = e.id);

delete from public.equipo_miembros where equipo_id = 36 and perfil_id = '150148ac-e264-4467-85e0-def3e943a934'; -- Gojira
update public.equipo_miembros set equipo_id = 34 where equipo_id = 36 and perfil_id = '4c124c13-48bf-47fb-ab71-ec37439d76b9'; -- LaL → Equipo 10
update public.equipo_miembros set equipo_id = 35 where equipo_id = 36 and perfil_id = 'bd688fcd-ca39-4784-acc0-3e3c09fdd033'; -- Faby → Equipo 11
delete from public.equipo_pendientes where equipo_id = 36;
update public.equipos set nombre = 'Equipo 12 (disuelto)' where id = 36;

-- La tabla del bot deja fuera a los equipos sin nadie (igual que la web)
create or replace function public.tabla_equipos(p_hasta smallint default null)
returns table (pos integer, equipo_id bigint, nombre text, puntos numeric, ganados integer)
language sql stable security definer set search_path = '' as $$
  select (row_number() over (order by coalesce(sum(x.puntos), 0) desc, coalesce(sum(x.ganados), 0) desc, q.nombre))::integer,
    q.id, q.nombre, coalesce(sum(x.puntos), 0), coalesce(sum(x.ganados), 0)::integer
  from public.equipos q left join public.puntos_liga(p_hasta) x on x.equipo_id = q.id
  where exists (select 1 from public.equipo_miembros m where m.equipo_id = q.id)
     or exists (select 1 from public.equipo_pendientes p where p.equipo_id = q.id)
  group by q.id, q.nombre;
$$;
revoke all on function public.tabla_equipos(smallint) from public, anon, authenticated;

commit;

select public.avisar_discord(format(E'**Cambios en los equipos**\nEl Equipo 12 no se pudo completar y se disuelve:\n- %s pasa al Equipo 10.\n- %s pasa al Equipo 11.\n- Gojira no podrá participar.\nLos equipos 10 y 11 quedan de 4: en cada cruce juegan 3 y rotan quién descansa. Los puntos que ya sumó cada persona se van con ella a su equipo nuevo.\nEn el cruce 2, el Equipo 2 descansa (se anulan sus duelos contra el Equipo 12). Desde ahora, al equipo que le toque el Equipo 12 en el calendario, descansa ese cruce.',
  public.mencion('4c124c13-48bf-47fb-ab71-ec37439d76b9'), public.mencion('bd688fcd-ca39-4784-acc0-3e3c09fdd033')), 'recordatorios');

-- Comprobación
select q.id, q.nombre, string_agg(p.nombre, ', ') as integrantes
from public.equipos q left join public.equipo_miembros m on m.equipo_id = q.id left join public.perfiles p on p.id = m.perfil_id
where q.id in (34, 35, 36) group by q.id, q.nombre order by q.id;
select id, juego from public.enfrentamientos where id in (53, 54); -- no debe salir nada
