-- Las Sustolimpiadas · 4 de noviembre · El cierre normal de las 00:05 corrió antes del cambio y cerró los 4 duelos
-- pendientes del cruce 4 (94, 102, 105 y 108) como ausencia. Se reabren tal como estaban, para que se jueguen hasta
-- las 06:00 (cuando corre 'cerrar-cruce-4'). Ejecutar ANTES de las 00:20 (El Diario automático).

begin;
-- Partidas a medias que el cierre forzado dio por terminadas: vuelven a estar en curso
update public.enfrentamiento_marcas set terminado = false, detalle = detalle - 'interrumpido'
  where enfrentamiento_id in (94, 102, 105, 108) and detalle ? 'interrumpido';
update public.enfrentamientos
  set estado = 'pendiente', puntos_a = 0, puntos_b = 0, ganador = null, no_jugo = null, desempate = null
  where id in (94, 102, 105, 108) and cruce = 4;
-- Para que el resumen del cruce 4 se mande de nuevo a las 06:00, con los resultados reales
delete from public.avisos_enviados where clave = 'cruce-4';
commit;

-- Comprobación: los 4 en 'pendiente'
select id, estado from public.enfrentamientos where id in (94, 102, 105, 108) order by id;
