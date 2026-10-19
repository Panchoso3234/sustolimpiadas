-- Las Sustolimpiadas · avisos automáticos en Discord (opcional)
-- Publica en un canal de Discord, a través de un webhook, cuando alguien le quita el récord del día a otra persona,
-- cuando se cierra un duelo y cuando alguien llega a los niveles 10, 20 y 30 del pase de temporada.
-- Pasos: 1) activar la extensión pg_net (Database → Extensions); 2) ejecutar este archivo en el SQL Editor;
-- 3) guardar la dirección del webhook con la línea del final (reemplazando el texto entre comillas).
-- La dirección queda en una tabla sin permisos de lectura: nadie la puede ver desde el sitio.

create extension if not exists pg_net with schema extensions;

create table if not exists public.secretos (clave text primary key, valor text not null);
alter table public.secretos enable row level security; -- sin políticas: solo la leen las funciones de aquí abajo
revoke all on public.secretos from anon, authenticated;

create table if not exists public.nombres_juegos (id text primary key, nombre text not null);
insert into public.nombres_juegos (id, nombre) values
  ('rodillos', 'Rodillos del Volcán'),
  ('puertas', 'Puertas Falsas'),
  ('huevo', 'Caza del Huevo'),
  ('sumo', 'Sumo de Balsas'),
  ('futbol', 'Fuchibol'),
  ('faro', 'Rey del Faro'),
  ('totem', 'Tiro al Tótem'),
  ('catapulta', 'Catapulta de Sandías'),
  ('bolos', 'Bolos de Coco'),
  ('minigolf', 'Minigolf del Volcán'),
  ('cocos', 'Cocos al Vuelo'),
  ('cangrejos', 'Mata-Cangrejos'),
  ('numeros', 'Cazanúmeros'),
  ('tinta', 'Tinta Tramposa'),
  ('parejas', 'Parejas del Arrecife'),
  ('buscaconchas', 'Erizos Ocultos'),
  ('luces', 'Luces del Faro'),
  ('cartero', 'Ruta del Cartero'),
  ('cofre', 'El Cofre o la Ola'),
  ('bajo', 'El Más Bajo'),
  ('torre', 'Torre Tambaleante'),
  ('palabra', 'Palabra del Día'),
  ('eco', 'Eco del Templo'),
  ('karts', 'Gran Premio'),
  ('tren', 'Fuga del Tren'),
  ('tanques', 'Tanques de Juguete'),
  ('bombas', 'Bombas'),
  ('agujero', 'Agujero Negro'),
  ('serpientes', 'Serpientes'),
  ('defensa', 'Defensa de la Torre'),
  ('museo', 'Ladrón del Museo'),
  ('tiro', 'Galería de Tiro'),
  ('cocina', 'Cocina Caótica'),
  ('billar', 'Billar'),
  ('triples', 'Triples'),
  ('calabazas', 'Torre de Calabazas'),
  ('laberinto', 'Laberinto Embrujado'),
  ('escobas', 'Carrera de Escobas')
on conflict (id) do update set nombre = excluded.nombre;

-- Manda un mensaje al canal (si no hay webhook guardado, no hace nada)
create or replace function public.avisar_discord(p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  select valor into v_url from public.secretos where clave = 'discord_webhook';
  if v_url is null or v_url not like 'https://discord.com/api/webhooks/%' then return; end if;
  perform net.http_post(url := v_url, body := jsonb_build_object('content', left(p_texto, 1900), 'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)));
end; $$;
revoke all on function public.avisar_discord(text) from public, anon, authenticated;

-- Récord del día robado: la marca nueva supera a la mejor del día de otra persona
create or replace function public.aviso_record() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_previo record; v_nombre text; v_juego text;
begin
  select m.perfil_id, m.puntaje, p.nombre into v_previo from public.marcas m join public.perfiles p on p.id = m.perfil_id
   where m.juego = new.juego and m.fecha = new.fecha and m.id <> new.id order by m.puntaje desc limit 1;
  if v_previo is null or new.puntaje <= v_previo.puntaje or v_previo.perfil_id = new.perfil_id then return new; end if;
  select nombre into v_nombre from public.perfiles where id = new.perfil_id;
  select coalesce((select nombre from public.nombres_juegos where id = new.juego), new.juego) into v_juego;
  perform public.avisar_discord(format('🏆 **%s** le quitó el récord del día de **%s** a %s: **%s** puntos (antes %s). ¿Quién se lo quita? https://panchoso3234.github.io/sustolimpiadas/#/juegos/%s', v_nombre, v_juego, v_previo.nombre, new.puntaje, v_previo.puntaje, new.juego));
  return new;
end; $$;
drop trigger if exists aviso_record on public.marcas;
create trigger aviso_record after insert on public.marcas for each row execute function public.aviso_record();

-- Duelo cerrado (diferido o en vivo oficial)
create or replace function public.aviso_duelo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_a text; v_b text; v_juego text;
begin
  if new.estado <> 'cerrado' or old.estado = 'cerrado' then return new; end if;
  if new.modo = '1v1' then
    select nombre into v_a from public.perfiles where id = new.a_perfil; select nombre into v_b from public.perfiles where id = new.b_perfil;
  else
    select nombre into v_a from public.equipos where id = new.a_equipo; select nombre into v_b from public.equipos where id = new.b_equipo;
  end if;
  select coalesce((select nombre from public.nombres_juegos where id = new.juego), new.juego) into v_juego;
  perform public.avisar_discord(case new.ganador
    when 'empate' then format('⚔️ Duelo %s en **%s**: **%s** y **%s** empataron %s a %s.', new.modo, v_juego, v_a, v_b, new.puntos_a, new.puntos_b)
    when 'a' then format('⚔️ Duelo %s%s en **%s**: **%s** le ganó a %s, %s a %s.', new.modo, case when new.oficial then ' oficial' else '' end, v_juego, v_a, v_b, new.puntos_a, new.puntos_b)
    else format('⚔️ Duelo %s%s en **%s**: **%s** le ganó a %s, %s a %s.', new.modo, case when new.oficial then ' oficial' else '' end, v_juego, v_b, v_a, new.puntos_b, new.puntos_a) end);
  return new;
end; $$;
drop trigger if exists aviso_duelo on public.enfrentamientos;
create trigger aviso_duelo after update on public.enfrentamientos for each row execute function public.aviso_duelo();

-- Niveles 10, 20 y 30 del pase de temporada
create or replace function public.aviso_nivel() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_nombre text; v_meta integer;
begin
  select max(m) into v_meta from unnest(array[10, 20, 30]) m where m > coalesce(case when tg_op = 'UPDATE' then old.nivel end, 1) and m <= new.nivel;
  if v_meta is null then return new; end if;
  select nombre into v_nombre from public.perfiles where id = new.perfil_id;
  perform public.avisar_discord(format('🎃 **%s** llegó al **nivel %s** del pase de temporada. %s', v_nombre, v_meta, case v_meta when 30 then '¡Pase completo! 👑' when 20 then '¡Ya tiene la Torre a la vista!' else '¡Va con todo!' end));
  return new;
end; $$;
drop trigger if exists aviso_nivel on public.vitrinas;
create trigger aviso_nivel after insert or update of nivel on public.vitrinas for each row execute function public.aviso_nivel();

-- 3) Guardar la dirección del webhook (pega la tuya entre las comillas y ejecuta solo esta línea):
-- insert into public.secretos (clave, valor) values ('discord_webhook', 'https://discord.com/api/webhooks/...') on conflict (clave) do update set valor = excluded.valor;
