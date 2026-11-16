-- Las Sustolimpiadas · 15 de noviembre · BOT DE DISCORD 2.0: anuncios automáticos al canal «anuncios bot»
-- (secretos.discord_webhook_anuncios; si falta, van al canal general). Cinco funciones nuevas:
--   1. Recordatorio de rondas pendientes: el de las 12:00 (penúltimo y último día) se muda al canal nuevo y se suma
--      uno a las 20:00 del día de cierre, solo con quienes todavía deben rondas.
--   2. Tarjeta de duelo terminado (imagen) apenas los dos terminan sus rondas. Los que cierra el sistema por plazo
--      no tienen tarjeta (ya salen en el resumen del cruce).
--   3. Récord nuevo al momento (imagen): una partida Individual o una ronda de duelo oficial ⚔️ que supera el 1.º
--      de un juego. Respeta los topes contra trampas, no avisa el primer récord de un juego y máximo 1 aviso por
--      juego cada 10 minutos.
--   4. MVP de la jornada (imagen) al cerrar los cruces 3, 6, 9 y 11.
--   5. Cuenta regresiva a la final (imagen) después de cada resumen de cruce y a las 12:00 del 20, 21 y 22-11.
-- Las imágenes las dibuja la Edge Function `tabla` (tipo + datos). Si la imagen falla, sale el texto.
-- Los disparadores están protegidos: si algo falla, el puntaje se guarda igual (nunca bloquean el juego).
-- Requiere 2026-11-15-tabla-imagen.sql. Se puede ejecutar más de una vez. No toca puntos.

begin;

-- ───────── Aviso con tarjeta (imagen) al canal de anuncios ─────────
create or replace function public.avisar_tarjeta(p_tipo text, p_datos jsonb, p_texto text, p_respaldo text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare v_clave text;
begin
  select valor into v_clave from public.secretos where clave = 'diario_clave';
  if v_clave is null then perform public.avisar_discord(p_texto || E'\n' || coalesce(p_respaldo, ''), 'anuncios'); return; end if;
  perform net.http_post(
    url := 'https://glkoujvomcnpqdpakbxa.supabase.co/functions/v1/tabla',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-diario-clave', v_clave),
    body := jsonb_build_object('tipo', p_tipo, 'datos', p_datos, 'texto', p_texto, 'canal', 'anuncios', 'respaldo', coalesce(p_respaldo, '')),
    timeout_milliseconds := 60000);
end; $$;
revoke all on function public.avisar_tarjeta(text, jsonb, text, text) from public, anon, authenticated;

-- Una persona como la piden las tarjetas: nombre, avatar y equipo
create or replace function public.persona_tarjeta(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('nombre', coalesce(p.nombre, 'Participante'), 'avatar', p.avatar_url, 'equipo', public.nombre_equipo(p_uid))
  from public.perfiles p where p.id = p_uid;
$$;
revoke all on function public.persona_tarjeta(uuid) from public, anon, authenticated;

-- ───────── 1. Recordatorio de rondas pendientes (12:00 penúltimo y último día; 20:00 último día) ─────────
drop function if exists public.recordatorio_cruces();
create or replace function public.recordatorio_cruces(p_ultimo_aviso boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/Santiago')::date; v_dia date; v_lineas text;
begin
  foreach v_dia in array case when p_ultimo_aviso then array[v_hoy] else array[v_hoy, v_hoy + 1] end loop
    select string_agg(format('- %s — %s (%s/%s rondas)', public.mencion(x.perfil), public.nombre_juego(x.juego), x.hechas, x.rondas), E'\n') into v_lineas
    from (
      select e.juego, e.rondas, l.perfil,
        (select count(*) from public.enfrentamiento_marcas m where m.enfrentamiento_id = e.id and m.perfil_id = l.perfil and m.terminado) as hechas
      from public.enfrentamientos e
      cross join lateral (values (e.a_perfil), (e.b_perfil)) as l(perfil)
      where e.oficial and e.estado = 'pendiente' and e.plazo = v_dia and e.modo = '1v1'
    ) x where x.hechas < x.rondas;
    if v_lineas is not null then
      perform public.avisar_discord(case when p_ultimo_aviso
        then format(E'🚨 **Últimas horas: los duelos cierran HOY a las 23:59** y todavía les falta jugar:\n%s\nJuegos → Versus 1v1. No jugar son 0 puntos para ti y tu equipo.', v_lineas)
        else format(E'⏰ **%s vencen duelos de la liga** (a las 23:59). Todavía les falta jugar:\n%s\nJuegos → Versus 1v1. No jugar son 0 puntos.',
               case when v_dia = v_hoy then 'HOY' else 'Mañana' end, v_lineas) end, 'anuncios');
    end if;
  end loop;
end; $$;
revoke all on function public.recordatorio_cruces(boolean) from public, anon, authenticated;

-- ───────── 2. Tarjeta de duelo terminado ─────────
create or replace function public.anuncio_duelo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_mult numeric; v_pa numeric; v_pb numeric; v_juego text;
begin
  if new.estado <> 'cerrado' or old.estado = 'cerrado' or not new.oficial or new.modo <> '1v1' or new.ganador is null or new.no_jugo is not null then return new; end if;
  -- Solo si los dos terminaron todas sus rondas (los que cierra el sistema por plazo no tienen tarjeta)
  if (select count(*) from public.enfrentamiento_marcas m where m.enfrentamiento_id = new.id and m.lado = 'a' and m.terminado) < new.rondas
     or (select count(*) from public.enfrentamiento_marcas m where m.enfrentamiento_id = new.id and m.lado = 'b' and m.terminado) < new.rondas then return new; end if;
  select coalesce(valor, '{}'::jsonb) into v from public.ajustes where clave = 'puntos';
  v := coalesce(v, '{}'::jsonb);
  v_mult := coalesce((v -> 'multiplicadores' ->> (new.jornada - 1))::numeric, 1);
  v_pa := v_mult * case when new.ganador = 'empate' then coalesce((v ->> 'empate')::numeric, 6) when new.ganador = 'a' then coalesce((v ->> 'victoria')::numeric, 7) else coalesce((v ->> 'derrota')::numeric, 4) end;
  v_pb := v_mult * case when new.ganador = 'empate' then coalesce((v ->> 'empate')::numeric, 6) when new.ganador = 'b' then coalesce((v ->> 'victoria')::numeric, 7) else coalesce((v ->> 'derrota')::numeric, 4) end;
  v_juego := public.nombre_juego(new.juego);
  perform public.avisar_tarjeta('duelo',
    jsonb_build_object('cruce', new.cruce, 'juego', v_juego, 'ganador', new.ganador, 'mult', v_mult,
      'a', public.persona_tarjeta(new.a_perfil) || jsonb_build_object('rondas', new.puntos_a, 'pts', v_pa),
      'b', public.persona_tarjeta(new.b_perfil) || jsonb_build_object('rondas', new.puntos_b, 'pts', v_pb)),
    format('⚔️ **Duelo terminado** · %s %s-%s %s · %s', public.mencion(new.a_perfil), new.puntos_a, new.puntos_b, public.mencion(new.b_perfil), v_juego));
  return new;
exception when others then return new; -- un aviso nunca bloquea el cierre de un duelo
end; $$;
drop trigger if exists anuncio_duelo on public.enfrentamientos;
create trigger anuncio_duelo after update on public.enfrentamientos for each row execute function public.anuncio_duelo();

-- ───────── 3. Récord nuevo al momento ─────────
create or replace function public.anunciar_record(p_juego text, p_perfil uuid, p_puntaje integer, p_duelo boolean,
  p_marca bigint, p_enf bigint, p_ronda smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tope numeric := coalesce((public.topes_dudosos() ->> p_juego)::numeric, 1e12); v_prev integer; v_de uuid; v_juego text;
begin
  if p_puntaje > v_tope then return; end if;
  -- El mejor anterior (Individual o ronda de duelo oficial), sin contar la marca recién guardada
  select x.puntaje, x.perfil_id into v_prev, v_de from (
    select m.puntaje, m.perfil_id from public.marcas m where m.juego = p_juego and m.id is distinct from p_marca and m.puntaje <= v_tope
    union all
    select r.puntaje, r.perfil_id from public.enfrentamiento_marcas r join public.enfrentamientos e on e.id = r.enfrentamiento_id
    where e.juego = p_juego and e.oficial and e.modo = '1v1' and r.terminado and r.puntaje <= v_tope
      and not (r.enfrentamiento_id = p_enf and r.perfil_id = p_perfil and r.ronda = p_ronda)
  ) x order by x.puntaje desc limit 1;
  if v_prev is null or p_puntaje <= v_prev then return; end if;  -- sin récord previo no se avisa (el primero de un juego)
  -- Máximo un aviso por juego cada 10 minutos
  insert into public.avisos_enviados (clave) values (format('record-%s-%s', p_juego, floor(extract(epoch from now()) / 600)::bigint)) on conflict do nothing;
  if not found then return; end if;
  v_juego := public.nombre_juego(p_juego);
  perform public.avisar_tarjeta('record',
    jsonb_build_object('juego', v_juego, 'persona', public.persona_tarjeta(p_perfil), 'puntaje', p_puntaje, 'anterior', v_prev,
      'de', coalesce((select nombre from public.perfiles where id = v_de), 'alguien'), 'duelo', p_duelo),
    format('🏆 **Nuevo récord en %s**%s · %s hizo **%s** (antes %s de %s)', v_juego, case when p_duelo then ' ⚔️ en duelo' else '' end,
      public.mencion(p_perfil), public.pts(p_puntaje), public.pts(v_prev), coalesce((select nombre from public.perfiles where id = v_de), 'alguien')));
end; $$;
revoke all on function public.anunciar_record(text, uuid, integer, boolean, bigint, bigint, smallint) from public, anon, authenticated;

create or replace function public.record_individual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.anunciar_record(new.juego, new.perfil_id, new.puntaje, false, new.id, null, null);
  return new;
exception when others then return new; -- nunca impide guardar una marca
end; $$;
drop trigger if exists record_individual on public.marcas;
create trigger record_individual after insert on public.marcas for each row execute function public.record_individual();

create or replace function public.record_duelo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_juego text;
begin
  if not new.terminado or (tg_op = 'UPDATE' and old.terminado) then return new; end if;
  select e.juego into v_juego from public.enfrentamientos e where e.id = new.enfrentamiento_id and e.oficial and e.modo = '1v1';
  if v_juego is not null then perform public.anunciar_record(v_juego, new.perfil_id, new.puntaje, true, null, new.enfrentamiento_id, new.ronda); end if;
  return new;
exception when others then return new; -- nunca impide guardar una ronda
end; $$;
drop trigger if exists record_duelo on public.enfrentamiento_marcas;
create trigger record_duelo after insert or update of terminado on public.enfrentamiento_marcas for each row execute function public.record_duelo();

-- ───────── 4. MVP de la jornada (jornadas: 1-3, 4-6, 7-9 y 10-11) ─────────
create or replace function public.mvp_jornada(p_jornada integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_desde smallint; v_hasta smallint; v_mvp record; v_eq record; v_gan record;
begin
  v_desde := (array[1, 4, 7, 10])[p_jornada]; v_hasta := (array[3, 6, 9, 11])[p_jornada];
  if v_desde is null then return; end if;
  with ahora as (select perfil, sum(puntos) as pts, sum(ganados) as gan from public.puntos_liga(v_hasta) where not bono and perfil is not null group by perfil),
       antes as (select perfil, sum(puntos) as pts, sum(ganados) as gan from public.puntos_liga((v_desde - 1)::smallint) where not bono and perfil is not null group by perfil),
       j as (select a.perfil, a.pts - coalesce(b.pts, 0) as pts, a.gan - coalesce(b.gan, 0) as gan from ahora a left join antes b on b.perfil = a.perfil)
  select * into v_mvp from j where j.pts > 0 order by j.pts desc, j.gan desc limit 1;
  if v_mvp is null then return; end if;
  with ahora as (select perfil, sum(ganados) as gan, sum(puntos) as pts from public.puntos_liga(v_hasta) where not bono and perfil is not null group by perfil),
       antes as (select perfil, sum(ganados) as gan from public.puntos_liga((v_desde - 1)::smallint) where not bono and perfil is not null group by perfil)
  select a.perfil, a.gan - coalesce(b.gan, 0) as gan into v_gan from ahora a left join antes b on b.perfil = a.perfil
  where a.perfil <> v_mvp.perfil order by a.gan - coalesce(b.gan, 0) desc, a.pts desc limit 1;
  select t.nombre, b.pos - t.pos as sube, t.pos into v_eq
  from public.tabla_equipos(v_hasta) t join public.tabla_equipos((v_desde - 1)::smallint) b on b.equipo_id = t.equipo_id
  where v_desde > 1 and b.pos > t.pos order by b.pos - t.pos desc, t.pos limit 1;
  perform public.avisar_tarjeta('mvp',
    jsonb_build_object('jornada', p_jornada,
      'jugador', public.persona_tarjeta(v_mvp.perfil) || jsonb_build_object('puntos', v_mvp.pts, 'victorias', v_mvp.gan),
      'equipo', case when v_eq is null then null else jsonb_build_object('nombre', v_eq.nombre, 'sube', v_eq.sube, 'puesto', v_eq.pos) end,
      'ganador', case when v_gan is null or v_gan.gan <= 0 then null else public.persona_tarjeta(v_gan.perfil) || jsonb_build_object('victorias', v_gan.gan) end),
    format('⭐ **MVP de la jornada %s**: %s con %s pts', p_jornada, public.mencion(v_mvp.perfil), public.pts(v_mvp.pts)));
end; $$;
revoke all on function public.mvp_jornada(integer) from public, anon, authenticated;

-- ───────── 5. Cuenta regresiva a la final (fin de los cruces: 22-11) ─────────
create or replace function public.cuenta_regresiva() returns void
language plpgsql security definer set search_path = '' as $$
declare v_fin date := date '2026-11-22'; v_dias integer := v_fin - (now() at time zone 'America/Santiago')::date; v_filas jsonb; v_7 jsonb;
begin
  if v_dias < 0 then return; end if;
  select jsonb_agg(jsonb_build_object('pos', t.pos, 'nombre', t.nombre, 'puntos', t.puntos) order by t.pos) into v_filas from public.tabla_equipos() t where t.pos <= 6;
  select jsonb_build_object('nombre', t.nombre, 'puntos', t.puntos) into v_7 from public.tabla_equipos() t where t.pos = 7;
  perform public.avisar_tarjeta('cuenta', jsonb_build_object('dias', v_dias, 'fecha', to_char(v_fin, 'DD-MM'), 'filas', coalesce(v_filas, '[]'::jsonb), 'septimo', v_7),
    case when v_dias > 0 then format('⏳ **Quedan %s %s para el fin de los cruces.** Así va la pelea por la final:', v_dias, case when v_dias = 1 then 'día' else 'días' end)
         else '⏳ **Hoy es el último día de cruces.** Así va la pelea por la final:' end,
    public.texto_tabla());
end; $$;
revoke all on function public.cuenta_regresiva() from public, anon, authenticated;

-- Al cerrar un cruce: MVP (si cierra una jornada) y cuenta regresiva (mientras queden cruces)
create or replace function public.anuncios_cierre_cruce(p_cruce smallint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_cruce in (3, 6, 9, 11) then perform public.mvp_jornada(case p_cruce when 3 then 1 when 6 then 2 when 9 then 3 else 4 end); end if;
  if p_cruce < 11 then perform public.cuenta_regresiva(); end if;
exception when others then null; -- un anuncio nunca rompe el cierre del cruce
end; $$;
revoke all on function public.anuncios_cierre_cruce(smallint) from public, anon, authenticated;

-- El disparador del resumen (igual que en 2026-10-24-bot-avisos.sql) ahora también lanza los anuncios
create or replace function public.aviso_resumen_cruce() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado <> 'cerrado' or old.estado = 'cerrado' or not new.oficial or new.cruce is null or new.modo <> '1v1' then return new; end if;
  if exists (select 1 from public.enfrentamientos where oficial and modo = '1v1' and cruce = new.cruce and estado = 'pendiente') then return new; end if;
  insert into public.avisos_enviados (clave) values ('cruce-' || new.cruce) on conflict do nothing;
  if found then
    perform public.resumen_cruce(new.cruce);
    perform public.anuncios_cierre_cruce(new.cruce);
  end if;
  return new;
end; $$;

-- ───────── Tareas automáticas (hora UTC; Chile está en UTC-3) ─────────
select cron.unschedule(jobname) from cron.job where jobname in ('recordatorio-cruces', 'recordatorio-cierre', 'cuenta-regresiva');
select cron.schedule('recordatorio-cruces', '0 15 * * *', 'select public.recordatorio_cruces()');        -- 12:00
select cron.schedule('recordatorio-cierre', '0 23 * * *', 'select public.recordatorio_cruces(true)');   -- 20:00
select cron.schedule('cuenta-regresiva', '0 15 20-22 11 *', 'select public.cuenta_regresiva()');        -- 12:00 del 20 al 22-11

commit;

-- Comprobación: los disparadores y tareas nuevas (no publica nada)
select tgname from pg_trigger where tgname in ('anuncio_duelo', 'record_individual', 'record_duelo', 'aviso_resumen_cruce') order by 1;
select jobname, schedule from cron.job where jobname in ('recordatorio-cruces', 'recordatorio-cierre', 'cuenta-regresiva') order by 1;
