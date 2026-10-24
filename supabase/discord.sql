-- Las Sustolimpiadas · avisos automáticos en Discord
-- El sitio publica solo en un canal de tu servidor (a través de un webhook):
--   📣 cuando se crea un cruce (un mensaje con los duelos, los juegos y el plazo, mencionando a cada jugador);
--   ⚔️ cuando se cierra un duelo oficial de la liga (quién ganó y cuántos puntos se llevó);
--   ⏰ cada día a las 12:00: qué duelos vencen hoy o mañana y quién todavía no juega (mencionándolos);
--   🎃 cuando alguien llega al nivel 10, 20 o 30 del pase.
-- Además, cada noche a las 00:05 se cierran solos los duelos vencidos (antes solo pasaba al abrir la Tabla oficial).
-- Requisitos: extensiones pg_net y pg_cron activadas (Database → Extensions). Se puede volver a ejecutar sin problema.
-- La dirección del webhook queda en una tabla que nadie puede leer desde el sitio.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

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

-- Manda un mensaje al canal. Las menciones (<@id>) avisan a la persona en Discord.
-- p_canal: resultados, recordatorios, tabla, en-vivo o hazanas (sin webhook propio, usa discord_webhook)
drop function if exists public.avisar_discord(text);
create or replace function public.avisar_discord(p_texto text, p_canal text default 'general') returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  select coalesce((select valor from public.secretos where clave = 'discord_webhook_' || p_canal),
                  (select valor from public.secretos where clave = 'discord_webhook')) into v_url;
  if v_url is null or v_url not like 'https://discord.com/api/webhooks/%' then return; end if;
  perform net.http_post(url := v_url, body := jsonb_build_object('content', left(p_texto, 1990), 'allowed_mentions', jsonb_build_object('parse', jsonb_build_array('users'))));
end; $$;
revoke all on function public.avisar_discord(text, text) from public, anon, authenticated;

-- Cómo nombrar a alguien en Discord: su mención si entró con Discord, o su nombre
create or replace function public.mencion(p_uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select '<@' || i.provider_id || '>' from auth.identities i where i.user_id = p_uid and i.provider = 'discord' limit 1),
                  (select '**' || nombre || '**' from public.perfiles where id = p_uid), 'alguien');
$$;
revoke all on function public.mencion(uuid) from public, anon, authenticated;

create or replace function public.nombre_juego(p_id text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nombre from public.nombres_juegos where id = p_id), p_id);
$$;

create or replace function public.nombre_equipo(p_uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select q.nombre from public.equipo_miembros m join public.equipos q on q.id = m.equipo_id where m.perfil_id = p_uid;
$$;

-- El aviso viejo de "récord del día robado" ya no corresponde (lo individual no suma a la liga)
drop trigger if exists aviso_record on public.marcas;

-- 📣 Cruce creado: se crean los 15 duelos de una vez, así que se avisa una sola vez por cruce
create or replace function public.aviso_cruce() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cruce smallint; v_plazo date; v_juegos text; v_lineas text;
begin
  for v_cruce in select distinct cruce from nuevos where oficial and cruce is not null loop
    select max(plazo) into v_plazo from nuevos where cruce = v_cruce;
    select string_agg(distinct public.nombre_juego(juego), ', ') into v_juegos from nuevos where cruce = v_cruce;
    select string_agg(public.mencion(a_perfil) || ' vs ' || public.mencion(b_perfil) || ' — ' || public.nombre_juego(juego), E'\n' order by id) into v_lineas
      from nuevos where cruce = v_cruce;
    perform public.avisar_discord(format(E'📣 **¡Cruce %s creado!** Juegos: **%s**.\n⏰ Plazo: hasta el %s a las 23:59 (hora de Chile). Cada duelo es al mejor de 3.\n%s\n👉 Juégalo en el sitio: Juegos → Versus 1v1. ¡No jugar son 0 puntos para ti y tu equipo!',
      v_cruce, v_juegos, to_char(v_plazo, 'DD/MM'), v_lineas));
  end loop;
  return null;
end; $$;
drop trigger if exists aviso_cruce on public.enfrentamientos;
create trigger aviso_cruce after insert on public.enfrentamientos referencing new table as nuevos for each statement execute function public.aviso_cruce();

-- ⚔️ Duelo oficial de la liga cerrado
create or replace function public.aviso_duelo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_p jsonb; v_mult numeric; v_gana uuid; v_pierde uuid; v_juego text; v_texto text; v_victoria numeric; v_empate numeric; v_derrota numeric;
begin
  if new.estado <> 'cerrado' or old.estado = 'cerrado' or not new.oficial or new.cruce is null or new.modo <> '1v1' then return new; end if;
  select valor into v_p from public.ajustes where clave = 'puntos';
  v_mult := coalesce((v_p -> 'multiplicadores' ->> (new.jornada - 1))::numeric, 1);
  v_victoria := trim_scale(round(coalesce((v_p ->> 'victoria')::numeric, 7) * v_mult, 2));
  v_empate := trim_scale(round(coalesce((v_p ->> 'empate')::numeric, 6) * v_mult, 2));
  v_derrota := trim_scale(round(coalesce((v_p ->> 'derrota')::numeric, 4) * v_mult, 2));
  v_juego := public.nombre_juego(new.juego);
  if new.no_jugo = 'ambos' then
    v_texto := format('Cruce %s · %s: %s y %s no jugaron (0 puntos para los dos).', new.cruce, v_juego, public.mencion(new.a_perfil), public.mencion(new.b_perfil));
  elsif new.ganador = 'empate' then
    v_texto := format('Cruce %s · %s: **empate** entre %s y %s (%s-%s). **+%s** para cada uno y su equipo.', new.cruce, v_juego, public.mencion(new.a_perfil), public.mencion(new.b_perfil), new.puntos_a, new.puntos_b, v_empate);
  else
    v_gana := case when new.ganador = 'a' then new.a_perfil else new.b_perfil end;
    v_pierde := case when new.ganador = 'a' then new.b_perfil else new.a_perfil end;
    v_texto := format('Cruce %s · %s: %s le ganó a %s %s.' || E'\n' || 'Ganador: %s suma **+%s** (también para %s).' || E'\n' || '%s',
      new.cruce, v_juego, public.mencion(v_gana), public.mencion(v_pierde),
      case when new.no_jugo is not null then '(no se presentó)' else format('%s-%s', greatest(new.puntos_a, new.puntos_b), least(new.puntos_a, new.puntos_b)) end,
      public.mencion(v_gana), v_victoria, coalesce(public.nombre_equipo(v_gana), 'su equipo'),
      case when new.no_jugo is not null then format('%s no se presentó: 0 puntos.', public.mencion(v_pierde))
        else format('Perdedor: %s suma solo **+%s** (también para %s).', public.mencion(v_pierde), v_derrota, coalesce(public.nombre_equipo(v_pierde), 'su equipo')) end);
  end if;
  perform public.avisar_discord(v_texto);
  return new;
end; $$;
drop trigger if exists aviso_duelo on public.enfrentamientos;
create trigger aviso_duelo after update on public.enfrentamientos for each row execute function public.aviso_duelo();

-- 🎃 Niveles 10, 20 y 30 del pase
create or replace function public.aviso_nivel() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_meta integer;
begin
  select max(m) into v_meta from unnest(array[10, 20, 30]) m where m > coalesce(case when tg_op = 'UPDATE' then old.nivel end, 1) and m <= new.nivel;
  if v_meta is null then return new; end if;
  perform public.avisar_discord(format('🎃 %s llegó al **nivel %s** del pase de temporada. %s', public.mencion(new.perfil_id), v_meta, case v_meta when 30 then '¡Pase completo! 👑' when 20 then '¡Ya ve la torre de campeón!' else '¡Va con todo!' end));
  return new;
end; $$;
drop trigger if exists aviso_nivel on public.vitrinas;
create trigger aviso_nivel after insert or update of nivel on public.vitrinas for each row execute function public.aviso_nivel();

-- ⏰ Recordatorio diario: duelos de la liga que vencen hoy o mañana y quién todavía no completa sus rondas
create or replace function public.recordatorio_cruces() returns void
language plpgsql security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/Santiago')::date; v_dia date; v_lineas text;
begin
  foreach v_dia in array array[v_hoy, v_hoy + 1] loop
    select string_agg(format('• %s — %s (%s/%s rondas)', public.mencion(x.perfil), public.nombre_juego(x.juego), x.hechas, x.rondas), E'\n') into v_lineas
    from (
      select e.juego, e.rondas, l.perfil,
        (select count(*) from public.enfrentamiento_marcas m where m.enfrentamiento_id = e.id and m.perfil_id = l.perfil and m.terminado) as hechas
      from public.enfrentamientos e
      cross join lateral (values (e.a_perfil), (e.b_perfil)) as l(perfil)
      where e.oficial and e.estado = 'pendiente' and e.plazo = v_dia and e.modo = '1v1'
    ) x where x.hechas < x.rondas;
    if v_lineas is not null then
      perform public.avisar_discord(format(E'⏰ **%s** vencen duelos de la liga (a las 23:59). Todavía les falta jugar:\n%s\nJuegos → Versus 1v1. ¡No jugar son 0 puntos!',
        case when v_dia = v_hoy then '¡HOY' || '!' else 'Mañana' end, v_lineas));
    end if;
  end loop;
end; $$;
revoke all on function public.recordatorio_cruces() from public, anon, authenticated;

-- Tareas automáticas (hora UTC; Chile está en UTC-3): recordatorio a las 12:00 y cierre de vencidos a las 00:05
select cron.unschedule(jobname) from cron.job where jobname in ('recordatorio-cruces', 'cerrar-vencidos');
select cron.schedule('recordatorio-cruces', '0 15 * * *', 'select public.recordatorio_cruces()');
select cron.schedule('cerrar-vencidos', '5 3 * * *', 'select public.cerrar_vencidos()');
