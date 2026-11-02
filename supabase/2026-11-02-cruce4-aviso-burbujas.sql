-- Las Sustolimpiadas · 2 de noviembre · Cruce 4: aviso de las mejoras de Bubble Shot a quienes tienen ese duelo abierto
-- (99, 106 y 107). No borra nada: solo cambiaron la mira y los controles, el puntaje es el mismo.
-- Ejecutar UNA vez, después de publicar (manda el aviso cada vez que se ejecuta).

do $$
declare v_lineas text;
begin
  select string_agg(public.mencion(a_perfil) || ' vs ' || public.mencion(b_perfil) || ' — ' || public.nombre_juego(juego), E'\n' order by id) into v_lineas
    from public.enfrentamientos where id in (99, 106, 107) and estado = 'pendiente';
  if v_lineas is null then return; end if;
  perform public.avisar_discord(format(E'**Cruce 4: Bubble Shot con puntería mejorada**\nLa mira ahora se mueve suave (antes avanzaba a saltitos), marca cada rebote y muestra una burbuja fantasma en la casilla exacta donde va a caer. Con el teclado, Shift + flechas para el ajuste fino; en celular, arrastra a los lados en cualquier parte de la pantalla y suelta para disparar (arrastra hacia abajo para cancelar).\nEl puntaje no cambió: lo que ya jugaron sigue valiendo. Mismo plazo:\n%s', v_lineas), 'recordatorios');
end $$;
