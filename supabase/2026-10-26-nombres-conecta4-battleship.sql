-- Las Sustolimpiadas · 26 de octubre: el bot no conocía los nombres nuevos (escribía "conchas" y "balsas").
-- 1) Agrega CONECTA4 y Battleship a nombres_juegos (la tabla que usa el bot de Discord).
-- 2) Duelo 65 (YCl contra Paltita): de PUCHAMON a Subway Surfers, solo si nadie jugó todavía (igual que 2026-10-26-cruce2-duelo-65.sql).
-- 3) Publica una corrección en el canal de recordatorios, mencionando solo a los seis afectados.
-- Ejecutar UNA vez (el aviso se manda cada vez que se ejecuta).

insert into public.nombres_juegos (id, nombre) values ('conchas', 'CONECTA4'), ('balsas', 'Battleship')
on conflict (id) do update set nombre = excluded.nombre;

update public.enfrentamientos e
set juego = 'tren'
where e.id = 65 and e.cruce = 2 and e.juego = 'bestias' and e.estado = 'pendiente'
  and not exists (select 1 from public.enfrentamiento_marcas m where m.enfrentamiento_id = e.id);

do $$
declare v_lineas text;
begin
  select string_agg(public.mencion(a_perfil) || ' vs ' || public.mencion(b_perfil) || ' — ' || public.nombre_juego(juego), E'\n' order by id) into v_lineas
    from public.enfrentamientos where id in (58, 65, 69);
  perform public.avisar_discord(format(E'**Corrección del cruce 2**\nEn el anuncio salieron mal tres juegos. Así quedan:\n%s\n"conchas" es CONECTA4 (el cuatro en línea) y "balsas" es Battleship (la batalla naval). Se pueden jugar en vivo con tu rival o a tu hora contra la máquina.', v_lineas), 'recordatorios');
end $$;

-- Comprobación
select id, public.nombre_juego(juego) as juego, estado from public.enfrentamientos where id in (58, 65, 69);
