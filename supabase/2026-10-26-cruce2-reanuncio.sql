-- Las Sustolimpiadas · 26 de octubre · Vuelve a anunciar el cruce 2 tras la reorganización de equipos, con los mismos
-- juegos que salieron (ahora con los nombres CONECTA4 y Battleship, y Subway Surfers en el duelo de YCl contra Paltita).
-- Arma la lista con los duelos que existen en la base en ese momento. Ejecutar UNA vez (manda un aviso cada vez).

do $$
declare v_lineas text; v_plazo date;
begin
  select max(plazo) into v_plazo from public.enfrentamientos where cruce = 2 and oficial;
  select string_agg(public.mencion(a_perfil) || ' vs ' || public.mencion(b_perfil) || ' — ' || public.nombre_juego(juego), E'\n' order by id) into v_lineas
    from public.enfrentamientos where cruce = 2 and oficial;
  perform public.avisar_discord(format(E'**Cruce 2 actualizado.** Después del cambio de equipos, estos son los duelos:\nPlazo: hasta el %s a las 23:59 (hora de Chile). Cada duelo es al mejor de 3.\n%s\nEl Equipo 2 descansa este cruce, salvo el duelo de Vale contra LaL, que ya había empezado y sigue en pie.\nSe juega en la web: Juegos → Versus 1v1 (a tu hora o en vivo con tu rival). No jugar son 0 puntos para ti y tu equipo.',
    to_char(v_plazo, 'DD/MM'), v_lineas), 'recordatorios');
end $$;

-- Comprobación: los duelos anunciados
select id, public.nombre_juego(juego) as juego, estado from public.enfrentamientos where cruce = 2 order by id;
