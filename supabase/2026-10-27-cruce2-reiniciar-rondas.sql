-- Las Sustolimpiadas · 27 de octubre · Cruce 2: Memoria de Pez, Carrera de Escobas y Minigolf cambiaron de versión
-- (la escala de puntos es otra). Para que nadie compare una ronda vieja contra una nueva, se borran las rondas ya
-- jugadas de esos tres duelos y se juegan de nuevo con la versión nueva:
--   54 Vale contra LaL (Memoria de Pez) · 60 Rigoberto? contra Izuki× (Carrera de Escobas) · 62 Ratalia contra Schrödinger (Minigolf)
-- Solo toca duelos pendientes del cruce 2. Ejecutar UNA vez, después de publicar (al final avisa a los seis en Discord).

-- Antes: qué rondas había (para tener registro)
select enfrentamiento_id, ronda, lado, puntaje, terminado from public.enfrentamiento_marcas where enfrentamiento_id in (54, 60, 62) order by 1, 2, 3;

begin;
delete from public.enfrentamiento_marcas m
using public.enfrentamientos e
where e.id = m.enfrentamiento_id and e.id in (54, 60, 62) and e.cruce = 2 and e.estado = 'pendiente';
update public.enfrentamientos set puntos_a = 0, puntos_b = 0 where id in (54, 60, 62) and cruce = 2 and estado = 'pendiente';
commit;

do $$
declare v_lineas text;
begin
  select string_agg(public.mencion(a_perfil) || ' vs ' || public.mencion(b_perfil) || ' — ' || public.nombre_juego(juego), E'\n' order by id) into v_lineas
    from public.enfrentamientos where id in (54, 60, 62);
  perform public.avisar_discord(format(E'**Cruce 2: tres duelos parten de cero**\nMemoria de Pez, Carrera de Escobas y Minigolf tienen versión nueva y su puntaje cambió de escala. Para que el duelo sea parejo, las rondas que ya habían jugado se borraron y se juegan de nuevo con la versión nueva (mismo plazo, hasta el 28/10 a las 23:59):\n%s', v_lineas), 'recordatorios');
end $$;

-- Comprobación: no deben quedar rondas
select enfrentamiento_id, count(*) from public.enfrentamiento_marcas where enfrentamiento_id in (54, 60, 62) group by 1;
