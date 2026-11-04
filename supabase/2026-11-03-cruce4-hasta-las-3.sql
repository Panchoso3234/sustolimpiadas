-- Las Sustolimpiadas · 3 de noviembre · El cruce 4 se extiende: se puede jugar hasta el miércoles 04/11 a las 03:00
-- (hora de Chile). El cierre automático de cada noche (00:05) se salta hoy y corre UNA vez a las 03:00 (06:00 UTC),
-- seguido del Diario; después vuelve solo al de siempre. Sin aviso en Discord. Ejecutar UNA vez, ANTES de las 00:05 del 04/11.

-- 0) Antes: cuántos duelos del cruce 4 siguen abiertos (si da 0, el cierre ya corrió y esto llega tarde)
select count(*) as abiertos_cruce_4 from public.enfrentamientos where cruce = 4 and estado = 'pendiente';

-- 1) Mover el cierre de esta noche a las 03:00
select cron.unschedule('cerrar-vencidos');
select cron.schedule('cerrar-cruce-4', '0 6 4 11 *', $c$
  do $x$ begin
    perform public.cerrar_vencidos();
    perform public.diario_automatico();
    perform cron.schedule('cerrar-vencidos', '5 3 * * *', 'select public.cerrar_vencidos()');
    perform cron.unschedule('cerrar-cruce-4');
  end $x$;
$c$);

-- 2) Comprobación: debe aparecer 'cerrar-cruce-4' y NO 'cerrar-vencidos' (vuelve solo después de las 03:00)
select jobname, schedule from cron.job where jobname in ('cerrar-vencidos', 'cerrar-cruce-4');
