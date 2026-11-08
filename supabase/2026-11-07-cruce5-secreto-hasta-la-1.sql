-- Las Sustolimpiadas · 7 de noviembre · EXTENSIÓN SECRETA: el cruce 5 se puede jugar hasta el domingo 08/11 a la 01:00
-- (hora de Chile = 04:00 UTC). Sin aviso, sin cambios en la página: el plazo de los duelos sigue en 07/11.
-- Cómo: cerrar_vencidos() (la llama la web al abrir la tabla y el cron de las 00:05) se salta el cruce 5 hasta la 01:00.
-- Los duelos siguen 'pendiente', así que se pueden jugar (empezar_ronda solo exige eso). Como no se cierra nada, el bot
-- no publica nada. A la 01:00 un trabajo único deja la función como estaba, cierra todo el cruce 5 y ahí el bot publica
-- lo de siempre: cada resultado, «Cruce 5 cerrado» con la tabla, y El Diario.
-- También se apaga hasta la 01:00 el aviso de muerte súbita (si un duelo empata en rondas, avisaría con fecha nueva).
-- Ejecutar TODO de una vez, ANTES de las 00:00 del 08/11. Se puede ejecutar más de una vez.

-- 0) Antes: deben salir los 10 duelos abiertos del cruce 5 (si sale vacío, llega tarde: avísame)
select id, juego, plazo, estado from public.enfrentamientos where cruce = 5 and estado = 'pendiente' order by id;

-- 1) Freno: hasta la 01:00 del 08/11 no se cierra ningún duelo del cruce 5
create or replace function public.cerrar_vencidos() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  fila record;
  cuantos integer := 0;
begin
  for fila in select id from public.enfrentamientos where estado = 'pendiente' and plazo is not null and plazo < (now() at time zone 'America/Santiago')::date
      and not (cruce = 5 and now() < timestamptz '2026-11-08 01:00:00-03') loop
    perform public.resolver_enfrentamiento(fila.id, true);
    cuantos := cuantos + 1;
  end loop;
  return cuantos;
end;
$$;
alter table public.enfrentamientos disable trigger aviso_muerte_subita;

-- 2) Ahazui: todas sus rondas del #118, de nuevo (si ya lo hiciste, no pasa nada)
delete from public.enfrentamiento_marcas m
using public.enfrentamientos e
where e.id = m.enfrentamiento_id and e.id = 118 and e.estado = 'pendiente'
  and m.perfil_id = 'f19146ec-9e50-4d6b-8583-ceed187f3ac4';

-- 3) A la 01:00 de Chile (04:00 UTC del 08/11): función original, cierre del cruce 5, Diario
select cron.unschedule('cerrar-cruce-5') where exists (select 1 from cron.job where jobname = 'cerrar-cruce-5');
select cron.schedule('cerrar-cruce-5', '0 4 8 11 *', $c$
  do $x$ declare v_id bigint; begin
    execute $f$
      create or replace function public.cerrar_vencidos() returns integer
      language plpgsql security definer set search_path = '' as $b$
      declare fila record; cuantos integer := 0;
      begin
        for fila in select id from public.enfrentamientos where estado = 'pendiente' and plazo is not null and plazo < (now() at time zone 'America/Santiago')::date loop
          perform public.resolver_enfrentamiento(fila.id, true);
          cuantos := cuantos + 1;
        end loop;
        return cuantos;
      end; $b$
    $f$;
    alter table public.enfrentamientos enable trigger aviso_muerte_subita;
    -- Todos los del cruce 5 a la fuerza (también un duelo que haya entrado a muerte súbita en la hora extra)
    for v_id in select id from public.enfrentamientos where cruce = 5 and estado = 'pendiente' order by id loop
      perform public.resolver_enfrentamiento(v_id, true);
    end loop;
    update public.enfrentamientos set plazo = '2026-11-07' where cruce = 5 and plazo > '2026-11-07';
    perform public.diario_automatico();
    perform cron.unschedule('cerrar-cruce-5');
  end $x$;
$c$);

-- 4) Comprobación
--    a) debe salir 'cerrar-cruce-5' con '0 4 8 11 *'; 'cerrar-vencidos' y 'diario-cruces' quedan como siempre
select jobname, schedule, active from cron.job where jobname in ('cerrar-vencidos', 'cerrar-cruce-5', 'diario-cruces');
--    b) el freno puesto: debe decir true
select pg_get_functiondef('public.cerrar_vencidos()'::regprocedure) like '%2026-11-08 01:00%' as freno_puesto;
--    c) a Ahazui no le debe quedar ninguna ronda en el #118
select ronda, puntaje from public.enfrentamiento_marcas
where enfrentamiento_id = 118 and perfil_id = 'f19146ec-9e50-4d6b-8583-ceed187f3ac4';
