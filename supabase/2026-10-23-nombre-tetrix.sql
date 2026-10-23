-- Las Sustolimpiadas · 23 de octubre: nombre del juego nuevo en los avisos de Discord
insert into public.nombres_juegos (id, nombre) values ('bloques', 'TETRIX')
on conflict (id) do update set nombre = excluded.nombre;
