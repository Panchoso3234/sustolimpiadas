-- Las Sustolimpiadas · 26 de octubre · Cruce 2, duelo 65 (YCl contra Paltita): a los dos no les gustó PUCHAMON.
-- Se cambia por Subway Surfers (tren), que no salió en ningún otro duelo del cruce 2.
-- Solo cambia si nadie jugó todavía ninguna ronda de ese duelo (si ya hay rondas, no hace nada).

begin;
update public.enfrentamientos e
set juego = 'tren'
where e.id = 65 and e.cruce = 2 and e.juego = 'bestias' and e.estado = 'pendiente'
  and not exists (select 1 from public.enfrentamiento_marcas m where m.enfrentamiento_id = e.id);
commit;

-- Comprobación: debe decir tren
select id, juego, estado, cruce from public.enfrentamientos where id = 65;
