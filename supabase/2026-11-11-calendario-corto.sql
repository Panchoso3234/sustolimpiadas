-- Las Sustolimpiadas · 11 de noviembre · Calendario acortado (aprobado por Pancho).
-- Cruce 7: 11-12 nov · Cruce 8: 13-15 · Cruce 9: 16-17 · Cruce 10: 18-20 · Cruce 11: 21-22. Jornada 4 (x2) parte el 18.
-- La liga termina el domingo 22 de noviembre. Ejecutar UNA vez (el aviso a Discord sale cada vez que se ejecuta).

-- 1) Fechas de los cruces en la base (las usa TSUKIBET para abrir y cerrar los pronósticos)
update public.liga_cruces as c set desde = v.desde::date, hasta = v.hasta::date
from (values (7, '2026-11-11', '2026-11-12'), (8, '2026-11-13', '2026-11-15'), (9, '2026-11-16', '2026-11-17'),
             (10, '2026-11-18', '2026-11-20'), (11, '2026-11-21', '2026-11-22')) as v(n, desde, hasta)
where c.n = v.n;

-- 2) Los duelos del cruce 7 que siguen abiertos vencen el jueves 12 a las 23:59 (antes, el sábado 14)
update public.enfrentamientos set plazo = '2026-11-12'
where cruce = 7 and oficial and estado = 'pendiente' and plazo = '2026-11-14';

-- 3) Anuncio en Discord (sin emojis)
select public.avisar_discord(E'**Nuevo calendario para la recta final de la liga**\nAcortamos los últimos cruces:\n- **Cruce 7:** vence el **jueves 12 de noviembre** a las 23:59 (antes era el sábado 14). Si te falta tu duelo, juégalo ya.\n- **Cruce 8:** viernes 13 al domingo 15.\n- **Cruce 9:** lunes 16 al martes 17.\n- **Cruce 10:** miércoles 18 al viernes 20. Aquí parte la **Jornada 4: puntos x2**.\n- **Cruce 11:** sábado 21 al domingo 22.\nLa liga termina el **domingo 22 de noviembre** y ahí se conocen los 12 de la Arena. El calendario completo está en la web, pestaña Juegos > Calendario.', 'general');

-- Comprobación
select n, desde, hasta from public.liga_cruces where n >= 7 order by n;
select cruce, plazo, estado, count(*) from public.enfrentamientos where cruce >= 7 and oficial group by 1, 2, 3 order by 1, 2;
