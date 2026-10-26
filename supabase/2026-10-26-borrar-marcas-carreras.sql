-- Las Sustolimpiadas · 26 de octubre: borrar todas las marcas de Lava Loca y Puertas Falsas (versión vieja y nueva),
-- para que los récords se armen de cero con la configuración actual. Esto NO se puede deshacer.
-- Ojo: esas partidas también dejan de contar para la experiencia del pase, los logros y la Copa Individual de días pasados.

begin;
delete from public.marcas where juego in ('rodillos', 'puertas', 'rodillos-v1', 'puertas-v1');
delete from public.nombres_juegos where id in ('rodillos-v1', 'puertas-v1');
commit;

-- Comprobación: debe dar 0
select count(*) as quedan from public.marcas where juego in ('rodillos', 'puertas', 'rodillos-v1', 'puertas-v1');
