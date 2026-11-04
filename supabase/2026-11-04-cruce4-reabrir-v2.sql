-- Las Sustolimpiadas · 4 de noviembre · Segunda reapertura. La web llama a cerrar_vencidos() cada vez que alguien abre
-- la tabla o un duelo, y esa función cierra todo lo que tiene plazo anterior a hoy: por eso los 4 duelos se volvieron
-- a cerrar al instante. Ahora se les pone plazo de hoy (04/11), así la web no los toca, y el trabajo de las 06:00 los
-- cierra uno por uno a la fuerza.

begin;
update public.enfrentamiento_marcas set terminado = false, detalle = detalle - 'interrumpido'
  where enfrentamiento_id in (94, 102, 105, 108) and detalle ? 'interrumpido';
update public.enfrentamientos
  set estado = 'pendiente', puntos_a = 0, puntos_b = 0, ganador = null, no_jugo = null, desempate = null, plazo = '2026-11-04'
  where id in (94, 102, 105, 108) and cruce = 4;
delete from public.avisos_enviados where clave = 'cruce-4';
commit;

-- El trabajo de las 06:00 ahora cierra estos 4 a la fuerza y deja el plazo como estaba (03/11)
select cron.unschedule('cerrar-cruce-4') where exists (select 1 from cron.job where jobname = 'cerrar-cruce-4');
select cron.schedule('cerrar-cruce-4', '0 9 4 11 *', $c$
  do $x$ declare v_id bigint; begin
    for v_id in select id from public.enfrentamientos where id in (94, 102, 105, 108) and estado = 'pendiente' loop
      perform public.resolver_enfrentamiento(v_id, true);
    end loop;
    update public.enfrentamientos set plazo = '2026-11-03' where id in (94, 102, 105, 108);
    perform public.cerrar_vencidos();
    perform public.diario_automatico();
    perform cron.schedule('cerrar-vencidos', '5 3 * * *', 'select public.cerrar_vencidos()');
    perform cron.unschedule('cerrar-cruce-4');
  end $x$;
$c$);

-- Comprobación: los 4 en 'pendiente' con plazo 2026-11-04, y el trabajo de las 06:00
select id, estado, plazo from public.enfrentamientos where id in (94, 102, 105, 108) order by id;
select jobname, schedule from cron.job where jobname in ('cerrar-vencidos', 'cerrar-cruce-4');
