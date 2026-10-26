-- Las Sustolimpiadas · 26 de octubre: Ruta del Cartero 2.0 y Laberinto Embrujado 2.0.
-- Borra todas las marcas anteriores de los dos juegos, para que los récords se armen solo con la versión nueva.
-- Ejecutar después de publicar. Las marcas nuevas traen "version": 2 en su detalle y NO se borran (se puede repetir sin miedo).
-- Esto NO se puede deshacer: esas partidas también dejan de contar para la experiencia del pase, los logros y la Copa de días pasados.

begin;
delete from public.marcas
where juego in ('cartero', 'laberinto') and coalesce(detalle ->> 'version', '1') <> '2';
commit;

-- Comprobación: solo deben quedar marcas de la versión 2 (o ninguna)
select juego, count(*) as marcas, count(*) filter (where detalle ->> 'version' = '2') as version_2
from public.marcas where juego in ('cartero', 'laberinto') group by juego;
