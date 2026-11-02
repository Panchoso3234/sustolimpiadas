-- Las Sustolimpiadas · 2 de noviembre · Cruce 4: Pinball Embrujado tiene física nueva (pelota más grande, gravedad
-- más suave, flippers más largos, slingshots y salvavidas de 15 s): el puntaje cambia de escala (unas 3 veces más).
-- Para que nadie compare una ronda vieja contra una nueva, se borran las rondas ya jugadas de los 4 duelos de Pinball
-- abiertos y se juegan de nuevo con la versión nueva: 91, 96, 101 y 108.
-- Solo toca duelos pendientes del cruce 4. Ejecutar UNA vez, después de publicar (al final avisa a los ocho en Discord).
-- Bubble Shot no necesita reinicio: solo cambiaron la mira y los controles, no el puntaje.

-- Antes: qué rondas había (para tener registro)
select enfrentamiento_id, ronda, lado, puntaje, terminado from public.enfrentamiento_marcas where enfrentamiento_id in (91, 96, 101, 108) order by 1, 2, 3;

begin;
delete from public.enfrentamiento_marcas m
using public.enfrentamientos e
where e.id = m.enfrentamiento_id and e.id in (91, 96, 101, 108) and e.cruce = 4 and e.estado = 'pendiente';
update public.enfrentamientos set puntos_a = 0, puntos_b = 0 where id in (91, 96, 101, 108) and cruce = 4 and estado = 'pendiente';
commit;

do $$
declare v_lineas text;
begin
  select string_agg(public.mencion(a_perfil) || ' vs ' || public.mencion(b_perfil) || ' — ' || public.nombre_juego(juego), E'\n' order by id) into v_lineas
    from public.enfrentamientos where id in (91, 96, 101, 108) and estado = 'pendiente';
  perform public.avisar_discord(format(E'**Cruce 4: los duelos de Pinball parten de cero**\nPinball Embrujado tiene mejoras: pelota más grande y visible, caída más suave, flippers más largos, rebotadores sobre los flippers y salvavidas de 15 s. Como el puntaje cambió de escala, las rondas que ya habían jugado se borraron y se juegan de nuevo con la versión nueva (mismo plazo):\n%s', v_lineas), 'recordatorios');
end $$;

-- Comprobación: no deben quedar rondas
select enfrentamiento_id, count(*) from public.enfrentamiento_marcas where enfrentamiento_id in (91, 96, 101, 108) group by 1;
