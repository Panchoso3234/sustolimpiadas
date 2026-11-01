-- Las Sustolimpiadas · 31 de octubre · El cruce 3 se extiende 2 horas: se puede jugar hasta el domingo 01/11 a las 02:00
-- (hora de Chile). El cierre automático de cada noche (00:05) se salta hoy y corre UNA vez a las 02:00 (05:00 UTC);
-- después vuelve solo al de siempre. Ejecutar UNA vez, ANTES de las 00:05 del 01/11.

-- 0) Antes: cuántos duelos del cruce 3 siguen abiertos (si da 0, el cierre ya corrió y esto llega tarde)
select count(*) as abiertos_cruce_3 from public.enfrentamientos where cruce = 3 and estado = 'pendiente';

-- 1) Mover el cierre de esta noche a las 02:00
select cron.unschedule('cerrar-vencidos');
select cron.schedule('cerrar-cruce-3', '0 5 1 11 *', $c$
  do $x$ begin
    perform public.cerrar_vencidos();
    perform cron.schedule('cerrar-vencidos', '5 3 * * *', 'select public.cerrar_vencidos()');
    perform cron.unschedule('cerrar-cruce-3');
  end $x$;
$c$);

-- 2) Aviso en Discord
select public.avisar_discord(E'⏰ **El cruce 3 se extiende 2 horas.** Se puede jugar hasta el domingo 01/11 a las **02:00** (hora de Chile). A esa hora se cierra y empieza el cruce 4.', 'recordatorios');

-- 3) Comprobación: debe aparecer 'cerrar-cruce-3' y NO 'cerrar-vencidos' (vuelve solo después de las 02:00)
select jobname, schedule from cron.job where jobname in ('cerrar-vencidos', 'cerrar-cruce-3');
