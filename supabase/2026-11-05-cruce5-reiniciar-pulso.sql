-- Las Sustolimpiadas · 5 de noviembre · Cruce 5: Pulso Neón tiene pistas nuevas (obstáculos a golpe de música, pista 3
-- más pareja) y suma 50 por cada punto de control. Como cambia el puntaje, se borran las rondas ya jugadas de los
-- duelos de Pulso abiertos del cruce 5 y se juegan de nuevo con la versión nueva (mismo plazo).
-- Duelos: 110, 111, 114, 115, 124, 125 y 126. Solo toca los que siguen pendientes. Ejecutar UNA vez, después de publicar.

-- Antes: qué rondas había (para tener registro)
select enfrentamiento_id, ronda, lado, puntaje, terminado from public.enfrentamiento_marcas
where enfrentamiento_id in (110, 111, 114, 115, 124, 125, 126) order by 1, 2, 3;

begin;
delete from public.enfrentamiento_marcas m
using public.enfrentamientos e
where e.id = m.enfrentamiento_id and e.id in (110, 111, 114, 115, 124, 125, 126) and e.cruce = 5 and e.estado = 'pendiente' and e.juego = 'pulso';
update public.enfrentamientos set puntos_a = 0, puntos_b = 0
where id in (110, 111, 114, 115, 124, 125, 126) and cruce = 5 and estado = 'pendiente' and juego = 'pulso';
commit;

-- Aviso en Discord a los jugadores de esos duelos (sin emojis)
do $$
declare v_lineas text;
begin
  select string_agg(public.mencion(a_perfil) || ' vs ' || public.mencion(b_perfil), E'\n' order by id) into v_lineas
    from public.enfrentamientos where id in (110, 111, 114, 115, 124, 125, 126) and estado = 'pendiente' and juego = 'pulso';
  if v_lineas is not null then
    perform public.avisar_discord(format(E'**Cruce 5: los duelos de Pulso Neón parten de cero**\nPulso Neón tiene mejoras: los obstáculos caen a golpe de la música, la pista 3 es más pareja y cada punto de control que alcances suma 50 puntos. Como cambió el puntaje, las rondas que ya habían jugado se borraron y se juegan de nuevo con la versión nueva (mismo plazo):\n%s', v_lineas), 'recordatorios');
  end if;
end $$;

-- Comprobación: no deben quedar rondas
select enfrentamiento_id, count(*) from public.enfrentamiento_marcas where enfrentamiento_id in (110, 111, 114, 115, 124, 125, 126) group by 1;
