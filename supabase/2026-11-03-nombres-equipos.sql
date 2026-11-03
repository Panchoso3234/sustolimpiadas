-- Las Sustolimpiadas · 3 de noviembre · Nombres de los equipos (los que ya eligieron; el resto sigue como "Equipo N").
-- La web, la tabla, la Mesa, el bot de Discord y La Cuarta toman el nombre de esta tabla. Se puede ejecutar más de una vez.

update public.equipos set nombre = 'Amantes del Pan' where nombre = 'Equipo 1';
update public.equipos set nombre = 'Umamigos🪐' where nombre = 'Equipo 2';
update public.equipos set nombre = 'Los Folanos' where nombre = 'Equipo 3';
update public.equipos set nombre = 'Aura' where nombre = 'Equipo 5';
update public.equipos set nombre = 'Seguidores de la Exultación' where nombre = 'Equipo 8';

-- Comprobación: los 12 equipos con su nombre
select id, nombre from public.equipos order by id;
