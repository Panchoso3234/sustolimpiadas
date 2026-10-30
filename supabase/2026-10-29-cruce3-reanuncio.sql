-- Las Sustolimpiadas · 29 de octubre · Vuelve a anunciar el cruce 3 con los nombres correctos de los juegos
-- (el primer anuncio salió con "corte", "horda", "colibri" y "gemas" porque faltaban en nombres_juegos).
-- Antes: ejecutar 2026-10-29-nombres-juegos.sql. Ejecutar UNA vez (manda un aviso cada vez).

do $$
declare v_lineas text; v_plazo date;
begin
  select max(plazo) into v_plazo from public.enfrentamientos where cruce = 3 and oficial;
  select string_agg(public.mencion(a_perfil) || ' vs ' || public.mencion(b_perfil) || ' — ' || public.nombre_juego(juego), E'\n' order by id) into v_lineas
    from public.enfrentamientos where cruce = 3 and oficial;
  perform public.avisar_discord(format(E'**Corrección del cruce 3.** En el anuncio anterior algunos juegos salieron con su nombre interno. Así quedan los duelos:\nPlazo: hasta el %s a las 23:59 (hora de Chile). Cada duelo es al mejor de 3.\n%s\nFlappy Colibrí, Corte Maestro, Fusión de Gemas y Horda Infinita son los juegos nuevos: puedes practicarlos antes en Juegos.\nSe juega en la web: Juegos → Versus 1v1 (a tu hora o en vivo con tu rival). No jugar son 0 puntos para ti y tu equipo.',
    to_char(v_plazo, 'DD/MM'), v_lineas), 'recordatorios');
end $$;

-- Comprobación: los duelos anunciados
select id, public.nombre_juego(juego) as juego, estado from public.enfrentamientos where cruce = 3 order by id;
