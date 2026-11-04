-- Las Sustolimpiadas · 4 de noviembre · El cierre del cruce 4 (y todo lo que el bot manda a Discord al cerrar:
-- resultados, resumen del cruce y El Diario) se mueve de las 03:00 a las 06:00 de hoy 04/11 (09:00 UTC). Sin aviso.
-- Reemplaza el trabajo 'cerrar-cruce-4' de 2026-11-03-cruce4-hasta-las-3.sql. Se puede ejecutar más de una vez.

select cron.unschedule('cerrar-cruce-4') where exists (select 1 from cron.job where jobname = 'cerrar-cruce-4');
select cron.unschedule('cerrar-vencidos') where exists (select 1 from cron.job where jobname = 'cerrar-vencidos');
select cron.schedule('cerrar-cruce-4', '0 9 4 11 *', $c$
  do $x$ begin
    perform public.cerrar_vencidos();
    perform public.diario_automatico();
    perform cron.schedule('cerrar-vencidos', '5 3 * * *', 'select public.cerrar_vencidos()');
    perform cron.unschedule('cerrar-cruce-4');
  end $x$;
$c$);

-- Comprobación: debe aparecer solo 'cerrar-cruce-4' con '0 9 4 11 *'
select jobname, schedule from cron.job where jobname in ('cerrar-vencidos', 'cerrar-cruce-4');
