-- Las Sustolimpiadas · 27 de octubre · Vuelve el Equipo 12: Thecrytik (nuevo), Faby (cuenta "🪷 bunnyx 🪷") y LaL.
-- · Faby sale del Equipo 11 y LaL del Equipo 10 (los dos vuelven a quedar de 3).
-- · Los puntos van con la persona: lo que LaL sumó cuenta otra vez para el Equipo 12.
-- · Cruce 2, Equipo 2 contra Equipo 12 (como estaba en el calendario):
--     Vale contra LaL, Memoria de Pez (ya existe, duelo 54: sigue igual)
--     Chima contra Thecrytik, Golpe Maestro (nuevo)
--     Choi Yena contra Faby, Serpientes (nuevo; PUCHAMON no se usa)
--   Mismo plazo del cruce (28/10, 23:59), al mejor de 3. Al crearlos, el bot anuncia solo los duelos nuevos.
-- Ejecutar UNA vez.

begin;

update public.equipos set nombre = 'Equipo 12' where id = 36;
update public.equipo_miembros set equipo_id = 36 where perfil_id = '4c124c13-48bf-47fb-ab71-ec37439d76b9' and equipo_id = 34; -- LaL: Equipo 10 → 12
update public.equipo_miembros set equipo_id = 36 where perfil_id = 'bd688fcd-ca39-4784-acc0-3e3c09fdd033' and equipo_id = 35; -- Faby: Equipo 11 → 12
insert into public.equipo_miembros (perfil_id, equipo_id)
select '2d95b2d1-4fc2-4c50-8f32-ac70e8c34e12', 36 -- Thecrytik
where not exists (select 1 from public.equipo_miembros where perfil_id = '2d95b2d1-4fc2-4c50-8f32-ac70e8c34e12');

commit;

-- Aviso del cambio de equipos (antes del anuncio de los duelos)
select public.avisar_discord(format(E'**Vuelve el Equipo 12**\nLlega %s al torneo y se arma de nuevo el Equipo 12 con %s y %s. Los equipos 10 y 11 vuelven a ser de 3. Los puntos que ya sumó cada persona se van con ella.\nEn el cruce 2 el Equipo 12 enfrenta al Equipo 2: el duelo de Vale contra LaL sigue igual y se suman dos duelos nuevos.',
  public.mencion('2d95b2d1-4fc2-4c50-8f32-ac70e8c34e12'), public.mencion('bd688fcd-ca39-4784-acc0-3e3c09fdd033'), public.mencion('4c124c13-48bf-47fb-ab71-ec37439d76b9')), 'recordatorios');

-- Los dos duelos nuevos del cruce 2 (si no existen ya). El aviso de Discord sale solo, con la lista de duelos nuevos.
insert into public.enfrentamientos (modo, juego, rondas, jornada, plazo, oficial, a_perfil, b_perfil, cruce, creado_por)
select '1v1', d.juego, 3, 1, date '2026-10-28', true, d.a::uuid, d.b::uuid, 2, '1165612d-d842-4386-a6fd-9fedfd73b198'
from (values
  ('museo', '66ba9fcc-69fe-4ab4-b86b-a07459cc89ac', '2d95b2d1-4fc2-4c50-8f32-ac70e8c34e12'),     -- Chima contra Thecrytik
  ('serpientes', 'f3738cb5-4c1d-4a61-a73a-389d94065961', 'bd688fcd-ca39-4784-acc0-3e3c09fdd033') -- Choi Yena contra Faby
) as d (juego, a, b)
where not exists (select 1 from public.enfrentamientos e where e.cruce = 2 and ((e.a_perfil = d.a::uuid and e.b_perfil = d.b::uuid) or (e.a_perfil = d.b::uuid and e.b_perfil = d.a::uuid)));

-- Comprobación
select q.id, q.nombre, string_agg(p.nombre, ', ') as integrantes
from public.equipos q left join public.equipo_miembros m on m.equipo_id = q.id left join public.perfiles p on p.id = m.perfil_id
where q.id in (26, 34, 35, 36) group by q.id, q.nombre order by q.id;
select e.id, public.nombre_juego(e.juego) as juego, a.nombre as a, b.nombre as b, e.estado
from public.enfrentamientos e join public.perfiles a on a.id = e.a_perfil join public.perfiles b on b.id = e.b_perfil
where e.cruce = 2 and (e.a_perfil in (select perfil_id from public.equipo_miembros where equipo_id = 36) or e.b_perfil in (select perfil_id from public.equipo_miembros where equipo_id = 36));
