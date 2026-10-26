-- Las Sustolimpiadas · 26 de octubre: Lava Loca 2.0 y Puertas Falsas 2.0.
-- Los juegos cambiaron por completo (otra pista, otro puntaje), así que sus récords parten de cero.
-- Las marcas viejas NO se borran: pasan a llamarse "Lava Loca (versión 1)" y "Puertas Falsas (versión 1)".
-- Ejecutar una sola vez, justo después de publicar (las marcas nuevas traen "version": 2 en su detalle y no se tocan).

begin;

insert into public.nombres_juegos (id, nombre) values ('rodillos-v1', 'Lava Loca (versión 1)'), ('puertas-v1', 'Puertas Falsas (versión 1)')
  on conflict (id) do update set nombre = excluded.nombre;

update public.marcas set juego = juego || '-v1'
where juego in ('rodillos', 'puertas') and coalesce(detalle ->> 'version', '1') <> '2';

commit;

-- Comprobación: cuántas marcas quedaron en cada uno
select juego, count(*) from public.marcas where juego in ('rodillos', 'puertas', 'rodillos-v1', 'puertas-v1') group by juego order by juego;
