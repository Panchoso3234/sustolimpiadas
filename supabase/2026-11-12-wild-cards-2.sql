-- Las Sustolimpiadas · 12 de noviembre · WILD CARDS 2.0 (catálogo aprobado por Pancho el 11-11)
-- 64 cartas (24 comunes, 18 raras, 11 épicas, 11 legendarias), más puntos según la rareza y legendaria más probable
-- para los de abajo (28/16/5/2 %). Sale Cambio de Órbita del sorteo (queda en la tabla solo por el historial).
-- Requiere haber ejecutado antes supabase/2026-11-11-wild-cards.sql. Se puede ejecutar más de una vez.
-- Las cartas ya sorteadas no se tocan. Va en una sola transacción: si algo falla, no se aplica nada.
-- Catálogo y probabilidades generados desde src/juegos/wildcards.ts (las pruebas comprueban que coincidan).

-- Antes: ¿ya se sortearon cartas del cruce 8 con el catálogo viejo? (si sale más de 0, avisar antes de seguir)
select count(*) as cartas_ya_sorteadas_cruce_8 from public.wild_cards where cruce = 8;

begin;

-- ───────── Tablas: cartas retiradas y tiradas más grandes ─────────
alter table public.wc_cartas add column if not exists activa boolean not null default true;
alter table public.wild_cards drop constraint if exists wild_cards_dado_check;
alter table public.wild_cards add constraint wild_cards_dado_check check (dado between 1 and 18);

-- ───────── Catálogo y probabilidades ─────────
insert into public.wc_cartas (id, nombre, emoji, rareza, tipo, efecto) values
  ('escudo', 'Escudo de Arena', '🛡️', 'comun', 'auto', 'Cada derrota suma +2 base.'),
  ('hinchada', 'La Hinchada', '📣', 'comun', 'auto', '+2 base por cada duelo ganado.'),
  ('consuelo', 'Premio de Consuelo', '🧃', 'comun', 'auto', 'Si el equipo gana 0 o 1 duelo: +5 base.'),
  ('dado', 'Dado de la Suerte', '🎲', 'comun', 'auto', 'Se tira un dado de 1 a 6 y se suma lo que salga.'),
  ('bebida', 'Bebida Energética', '🥤', 'comun', 'auto', 'Si el equipo gana al menos un duelo: +3 base.'),
  ('pelo', 'Por un Pelo', '🪶', 'comun', 'auto', '+2 base por cada duelo ganado 2-1.'),
  ('cancha', 'Elige tu Cancha', '🎯', 'comun', 'decision', 'El equipo elige el juego de 1 de sus duelos.'),
  ('segunda', 'Segunda Vuelta', '🔁', 'comun', 'decision', 'Un jugador repite 1 ronda y se queda con su mejor puntaje.'),
  ('moneda', 'Moneda al Aire', '🪙', 'comun', 'auto', 'Se lanza una moneda: cara +6 base, sello nada.'),
  ('madrugador', 'Madrugador', '🌅', 'comun', 'auto', '+2 base por cada duelo del equipo que termine antes del último día del cruce.'),
  ('caballeros', 'Pacto de Caballeros', '🤝', 'comun', 'auto', 'Cada empate suma +3 base (máximo +6).'),
  ('honor', 'Ronda de Honor', '🎖️', 'comun', 'auto', '+2 base por cada ronda ganada en un duelo perdido (máximo +6).'),
  ('mosqueteros', 'Tres Mosqueteros', '🤺', 'comun', 'auto', 'Si los 3 jugadores del equipo juegan su duelo: +5 base.'),
  ('calentamiento', 'Calentamiento', '🏃', 'comun', 'auto', 'Si el equipo no pierde ningún duelo 0-2: +3 base.'),
  ('boleto', 'Boleto de Entrada', '🎟️', 'comun', 'auto', '+3 base, pase lo que pase.'),
  ('amuleto', 'Amuleto', '🍀', 'comun', 'auto', 'Si el equipo pierde la serie: +3 base.'),
  ('primer_golpe', 'Primer Golpe', '👊', 'comun', 'auto', 'Si el equipo gana el primer duelo del cruce que se cierra: +3 base.'),
  ('cierre_oro', 'Cierre de Oro', '🏁', 'comun', 'auto', 'Si el equipo gana el último duelo del cruce que se cierra: +3 base.'),
  ('paciencia', 'Paciencia', '🐢', 'comun', 'auto', '+2 base por cada duelo que se va a 3 rondas.'),
  ('pancarta', 'Pancarta', '🪧', 'comun', 'auto', '+2 base por cada duelo ganado 2-0.'),
  ('libreta', 'Libreta de Récords', '📓', 'comun', 'auto', '+2 base por cada duelo perdido en que el equipo igual sumó más puntaje de juego que el rival.'),
  ('abrazo', 'Abrazo de Grupo', '🫂', 'comun', 'auto', 'Si el cruce termina con 1 victoria, 1 empate y 1 derrota: +5 base.'),
  ('sorteo_chico', 'Sorteo Chico', '🎁', 'comun', 'auto', 'Se tira un dado de 6: si sale 5 o 6, +6 base.'),
  ('ultimo_aliento', 'Último Aliento', '💨', 'comun', 'auto', 'Si el equipo pierde los 3 duelos: +6 base.'),
  ('doble_nada', 'Doble o Nada', '⚡', 'rara', 'decision', 'Se marca 1 duelo antes de jugarlo: si lo gana, +14 base; si lo pierde, vale 0.'),
  ('muralla', 'La Muralla', '🧱', 'rara', 'auto', 'Cada derrota suma +4 base.'),
  ('iman', 'Imán', '🧲', 'rara', 'auto', '+4 base por cada duelo ganado.'),
  ('barrida', 'Barrida', '🧹', 'rara', 'auto', 'Si el equipo gana los 3 duelos: +14 base.'),
  ('trampa', 'Trampa', '🪤', 'rara', 'auto', 'El rival pierde 2 puntos base por cada duelo que pierda contra este equipo.'),
  ('cambio_rivales', 'Cambio de Rivales', '🔀', 'rara', 'decision', 'El equipo decide quién de los suyos juega contra quién.'),
  ('ruleta', 'Ruleta Rusa', '🎰', 'rara', 'auto', 'Se gira otra vez: 50 % gana además una carta Épica, 50 % nada.'),
  ('dado_grande', 'Dado Grande', '🎳', 'rara', 'auto', 'Se tiran dos dados de 6 y se suma el total (de 2 a 12).'),
  ('remontada', 'Remontada', '📈', 'rara', 'auto', 'Si el equipo está del puesto 7 hacia abajo: +4 base por cada duelo ganado.'),
  ('ola', 'Ola de Rondas', '🌊', 'rara', 'auto', '+2 base por cada ronda ganada en el cruce (máximo +12).'),
  ('fortaleza', 'Fortaleza', '🏰', 'rara', 'auto', 'Si el equipo no pierde ningún duelo: +12 base.'),
  ('caja', 'Caja Misteriosa', '📦', 'rara', 'auto', 'Al revelar se sortea un premio entre +2 y +14 base.'),
  ('seguro', 'Seguro de Vida', '🦺', 'rara', 'auto', 'Si el equipo pierde la serie: +10 base.'),
  ('tictac', 'Tic-Tac', '⏱️', 'rara', 'auto', '+4 base por cada duelo del equipo que termine antes del último día del cruce.'),
  ('golpe_mesa', 'Golpe de Mesa', '🔨', 'rara', 'auto', '+4 base por cada duelo ganado 2-0.'),
  ('espejo', 'Espejo', '🪞', 'rara', 'auto', 'Copia la carta del rival si es común o rara y da puntos sola. Si no se puede copiar, +6 base.'),
  ('comodin', 'Comodín', '🤹', 'rara', 'auto', 'Al revelar, se convierte en la carta común que más puntos le habría dado.'),
  ('bis', 'Bis', '🎤', 'rara', 'decision', 'Dos jugadores distintos repiten 1 ronda cada uno y se quedan con su mejor puntaje.'),
  ('racha', 'En Racha', '🔥', 'epica', 'auto', 'Todos los puntos del equipo en el cruce valen ×1,25.'),
  ('contraataque', 'Contraataque', '🦅', 'epica', 'auto', 'Por cada duelo ganado, el rival pierde 5 puntos base.'),
  ('sed', 'Sed de Sangre', '🩸', 'epica', 'auto', 'Si el equipo gana la serie (2 o 3 duelos): +15 base.'),
  ('congelar', 'Congelar', '🧊', 'epica', 'auto', 'La carta del rival no se aplica este cruce (no sirve contra legendarias).'),
  ('doble_carta', 'Doble Carta', '🃏', 'epica', 'auto', 'En vez de esta, el equipo recibe 2 cartas (común o rara) y usa ambas.'),
  ('revancha', 'Revancha Total', '🔄', 'epica', 'decision', 'Un duelo perdido se vuelve a jugar completo, con un desafío nuevo, y vale el segundo.'),
  ('fenix', 'Fénix', '☄️', 'epica', 'auto', 'Si el equipo pierde los 3 duelos: +20 base.'),
  ('todo_nada', 'Todo o Nada', '💣', 'epica', 'decision', 'Se marcan 2 duelos antes de jugarlos: si gana los dos, +25 base; si no, nada (nunca resta).'),
  ('pacto_hierro', 'Pacto de Hierro', '⛓️', 'epica', 'auto', 'Si los 3 duelos terminan igual (3 victorias, 3 empates o 3 derrotas): +20 base.'),
  ('estrellas', 'Lluvia de Estrellas', '🌠', 'epica', 'auto', '+5 base por cada duelo ganado y +2 por cada ronda ganada (máximo +25).'),
  ('gran_angular', 'Gran Angular', '🔭', 'epica', 'auto', '+8 base por cada duelo ganado, si el rival está más arriba en la tabla.'),
  ('corona', 'La Corona', '👑', 'legendaria', 'auto', 'Todos los puntos del equipo en el cruce valen ×1,3.'),
  ('agujero', 'Agujero Negro', '🕳️', 'legendaria', 'auto', 'Por cada duelo ganado: +6 base para el equipo y −6 base para el rival.'),
  ('mano', 'Mano de Dios', '✋', 'legendaria', 'decision', 'Elige cualquier carta común, rara o épica, y además +6 base.'),
  ('big_bang', 'Big Bang', '💥', 'legendaria', 'auto', 'Se tiran dos dados de 6 y el total se multiplica por 3 (de 6 a 36).'),
  ('leyenda', 'Leyenda Viva', '🏆', 'legendaria', 'auto', '+12 base por cada duelo ganado y +6 más si gana los 3.'),
  ('tridente', 'Tridente', '🔱', 'legendaria', 'auto', 'Cada derrota suma +6 base y cada victoria también.'),
  ('eclipse', 'Eclipse', '🌑', 'legendaria', 'auto', 'Anula la carta del rival (también las legendarias) y suma +12 base.'),
  ('supernova', 'Supernova', '🌟', 'legendaria', 'auto', '+14 base de entrada y +7 por cada duelo ganado.'),
  ('titan', 'Titán', '🗿', 'legendaria', 'auto', '+10 base de entrada y cada derrota suma +9 más.'),
  ('boveda', 'Bóveda del Dragón', '🐉', 'legendaria', 'auto', 'Se tiran tres dados de 6 y el total se multiplica por 2 (de 6 a 36).'),
  ('rey_isla', 'Rey de la Isla', '🏝️', 'legendaria', 'auto', '+30 base si el equipo está del puesto 9 al 12; si no, +15 base.')
on conflict (id) do update set nombre = excluded.nombre, emoji = excluded.emoji, rareza = excluded.rareza, tipo = excluded.tipo, efecto = excluded.efecto, activa = true;
update public.wc_cartas set activa = false where id = 'orbita';
insert into public.wc_probabilidades (desde, hasta, comun, rara, epica, legendaria) values
  (1, 2, 68, 22, 8, 2),
  (3, 5, 58, 25, 12, 5),
  (6, 8, 39, 30, 15, 16),
  (9, 12, 22, 28, 22, 28)
on conflict (desde) do update set hasta = excluded.hasta, comun = excluded.comun, rara = excluded.rara, epica = excluded.epica, legendaria = excluded.legendaria;

-- ───────── Tiradas: el azar de cada carta lo decide la base al sortearla (columna dado) ─────────
create or replace function public.wc_tirar(p_carta text) returns smallint
language sql volatile set search_path = '' as $$
  select (case p_carta
    when 'dado' then 1 + floor(random() * 6)                                  -- dado: 1 a 6
    when 'moneda' then 1 + floor(random() * 2)                                -- moneda: 1 a 2 (2 = cara)
    when 'sorteo_chico' then 1 + floor(random() * 6)                          -- sorteo_chico: 1 a 6
    when 'dado_grande' then 2 + floor(random() * 6) + floor(random() * 6)     -- dado_grande: 2 a 12
    when 'caja' then 2 + floor(random() * 13)                                 -- caja: 2 a 14
    when 'big_bang' then 2 + floor(random() * 6) + floor(random() * 6)        -- big_bang: 2 a 12
    when 'boveda' then 3 + floor(random() * 6) + floor(random() * 6) + floor(random() * 6)   -- boveda: 3 a 18
  end)::smallint;
$$;
revoke all on function public.wc_tirar(text) from public, anon, authenticated;

-- Carta hija (la trae Doble Carta, Ruleta Rusa o Mano de Dios), con su tirada si la tiene.
create or replace function public.wc_hija(p_madre bigint, p_carta text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare m public.wild_cards%rowtype; v_id bigint;
begin
  select * into m from public.wild_cards where id = p_madre;
  insert into public.wild_cards (cruce, equipo_id, carta, origen, puesto, dado, creado_por)
  values (m.cruce, m.equipo_id, p_carta, m.id, m.puesto, public.wc_tirar(p_carta), (select auth.uid()))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.wc_hija(bigint, text) from public, anon, authenticated;

-- ───────── Sortear (solo admin): igual que antes, pero solo cartas activas y con las tiradas nuevas ─────────
create or replace function public.wc_sortear(p_cruce smallint, p_equipo bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_desde smallint; v_puesto smallint; g public.wc_probabilidades%rowtype; r numeric; v_rareza text; v_carta text; v_id bigint;
begin
  if not public.es_admin() then raise exception 'Solo la organización sortea las Wild Cards.'; end if;
  select coalesce((valor ->> 'desde_cruce')::smallint, 8) into v_desde from public.ajustes where clave = 'wild_cards';
  if p_cruce < coalesce(v_desde, 8) then raise exception 'Las Wild Cards parten en el cruce %.', coalesce(v_desde, 8); end if;
  if not exists (select 1 from public.enfrentamientos e join public.equipo_miembros m on m.perfil_id in (e.a_perfil, e.b_perfil)
                 where e.cruce = p_cruce and e.oficial and e.modo = '1v1' and e.estado <> 'anulado' and m.equipo_id = p_equipo) then
    raise exception 'Ese equipo no tiene duelos en el cruce %: primero sortea los duelos.', p_cruce;
  end if;
  if exists (select 1 from public.wild_cards where cruce = p_cruce and equipo_id = p_equipo and origen is null) then
    raise exception 'Ese equipo ya tiene su Wild Card en este cruce.';
  end if;
  select t.pos into v_puesto from public.tabla_equipos() t where t.equipo_id = p_equipo;
  v_puesto := coalesce(v_puesto, 12);
  select * into g from public.wc_probabilidades where v_puesto between desde and hasta;
  if not found then select * into g from public.wc_probabilidades order by desde desc limit 1; end if;
  r := random() * 100;
  v_rareza := case when r < g.comun then 'comun' when r < g.comun + g.rara then 'rara' when r < g.comun + g.rara + g.epica then 'epica' else 'legendaria' end;
  select id into v_carta from public.wc_cartas where rareza = v_rareza and activa order by random() limit 1;
  insert into public.wild_cards (cruce, equipo_id, carta, puesto, dado, creado_por)
  values (p_cruce, p_equipo, v_carta, v_puesto, public.wc_tirar(v_carta), (select auth.uid()))
  returning id into v_id;
  -- Cartas que traen otras: se resuelven al tiro (sin anidar Doble Carta ni Ruleta Rusa)
  if v_carta = 'ruleta' and random() < 0.5 then
    perform public.wc_hija(v_id, (select id from public.wc_cartas where rareza = 'epica' and activa and id <> 'doble_carta' order by random() limit 1));
  elsif v_carta = 'doble_carta' then
    perform public.wc_hija(v_id, x.id) from (select id from public.wc_cartas where rareza in ('comun', 'rara') and activa and id <> 'ruleta' order by random() limit 2) x;
  end if;
  insert into public.avisos (perfil_id, tipo, texto, enlace)
  select m.perfil_id, 'wildcard', format('🃏 Tu equipo recibió una Wild Card %s %s para el cruce %s.', public.wc_rareza_emoji(v_rareza), public.wc_rareza_nombre(v_rareza), p_cruce), '#/juegos/wildcards'
  from public.equipo_miembros m where m.equipo_id = p_equipo;
  return v_id;
end; $$;
revoke all on function public.wc_sortear(smallint, bigint) from public, anon;
grant execute on function public.wc_sortear(smallint, bigint) to authenticated;

-- ───────── Usar una carta de decisión (solo admin) ─────────
-- Devuelve null si salió bien, o el motivo por el que no se pudo.
create or replace function public.wc_usar(p_id bigint, p_datos jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  w public.wild_cards%rowtype; e public.enfrentamientos%rowtype; v_lado text; v_eq text; v_enf bigint; v_perfil uuid; v_ronda integer;
  v_prev integer; v_carta text; v_rareza text; v_actuales uuid[]; v_nuevos uuid[]; x jsonb; v_juego text; v_ids bigint[]; v_hechas jsonb;
begin
  if not public.es_admin() then return 'Solo la organización usa las cartas.'; end if;
  select * into w from public.wild_cards where id = p_id for update;
  if not found then return 'No existe esa carta.'; end if;
  if w.anulada then return 'Esa carta fue anulada.'; end if;
  if w.usada then return 'Esa carta ya se usó.'; end if;
  select nombre into v_eq from public.equipos where id = w.equipo_id;

  -- Duelo pedido (las cartas que actúan sobre un duelo)
  if w.carta in ('cancha', 'doble_nada', 'segunda', 'revancha') then
    v_enf := (p_datos ->> 'duelo')::bigint;
    select * into e from public.enfrentamientos where id = v_enf and cruce = w.cruce and oficial and modo = '1v1';
    if not found then return 'Ese duelo no es de este cruce.'; end if;
    v_lado := case when public.wc_equipo_de(e.a_perfil) = w.equipo_id then 'a' when public.wc_equipo_de(e.b_perfil) = w.equipo_id then 'b' end;
    if v_lado is null then return 'Ese duelo no es de este equipo.'; end if;
  end if;

  if w.carta in ('cancha', 'doble_nada') then
    if e.estado <> 'pendiente' or exists (select 1 from public.enfrentamiento_marcas where enfrentamiento_id = e.id) then
      return 'Esta carta se usa antes de que alguien juegue ese duelo.';
    end if;
    if w.carta = 'cancha' then
      v_juego := p_datos ->> 'juego';
      if v_juego is null or char_length(v_juego) > 30 then return 'Falta el juego.'; end if;
      update public.enfrentamientos set juego = v_juego where id = e.id;
      perform public.avisar_discord(format('🎯 **Elige tu Cancha** · %s eligió **%s** para su duelo %s vs %s.', v_eq, public.nombre_juego(v_juego), public.mencion(e.a_perfil), public.mencion(e.b_perfil)), 'recordatorios');
    else
      perform public.avisar_discord(format('⚡ **Doble o Nada** · %s apostó su duelo %s vs %s (%s): si lo gana suma +14 base; si lo pierde, vale 0.', v_eq, public.mencion(e.a_perfil), public.mencion(e.b_perfil), public.nombre_juego(e.juego)), 'recordatorios');
    end if;
    update public.wild_cards set usada = true, duelo = e.id, datos = coalesce(p_datos, '{}'::jsonb) where id = w.id;
    return null;

  elsif w.carta = 'segunda' then
    v_perfil := (p_datos ->> 'perfil')::uuid; v_ronda := (p_datos ->> 'ronda')::integer;
    if e.estado <> 'pendiente' then return 'El duelo ya se cerró: la Segunda Vuelta se usa antes de que el duelo termine.'; end if;
    if v_perfil is distinct from (case when v_lado = 'a' then e.a_perfil else e.b_perfil end) then return 'Ese jugador no es del equipo en este duelo.'; end if;
    select puntaje into v_prev from public.enfrentamiento_marcas where enfrentamiento_id = e.id and perfil_id = v_perfil and ronda = v_ronda and terminado;
    if not found then return 'Esa ronda todavía no se ha jugado.'; end if;
    delete from public.enfrentamiento_marcas where enfrentamiento_id = e.id and perfil_id = v_perfil and ronda = v_ronda;
    update public.wild_cards set usada = true, duelo = e.id, datos = jsonb_build_object('perfil', v_perfil, 'ronda', v_ronda, 'previo', v_prev) where id = w.id;
    perform public.avisar_discord(format('🔁 **Segunda Vuelta** · %s puede repetir su ronda %s (se queda con el mejor puntaje).', public.mencion(v_perfil), v_ronda), 'recordatorios');
    return null;

  elsif w.carta = 'revancha' then
    if e.estado <> 'cerrado' or e.ganador = v_lado or e.ganador = 'empate' then return 'La Revancha Total se usa en un duelo perdido y ya cerrado.'; end if;
    if e.plazo is not null and e.plazo < (now() at time zone 'America/Santiago')::date then return 'Ya pasó el plazo del cruce.'; end if;
    if exists (select 1 from public.wc_ajustes where cruce = w.cruce) then return 'Las cartas de este cruce ya se revelaron.'; end if;
    delete from public.enfrentamiento_marcas where enfrentamiento_id = e.id;
    update public.enfrentamientos set estado = 'pendiente', ganador = null, puntos_a = 0, puntos_b = 0, no_jugo = null, desempate = null,
      muerte_subita = 0, rondas = 3, semilla = md5(gen_random_uuid()::text) where id = e.id;
    delete from public.avisos_enviados where clave = 'cruce-' || w.cruce;
    update public.wild_cards set usada = true, duelo = e.id where id = w.id;
    perform public.avisar_discord(format('🔄 **Revancha Total** · %s vuelve a jugar su duelo %s vs %s desde cero, con un desafío nuevo.', v_eq, public.mencion(e.a_perfil), public.mencion(e.b_perfil)), 'recordatorios');
    return null;

  elsif w.carta = 'cambio_rivales' then
    -- p_datos.asignacion = [{duelo, perfil}, ...]: el mismo grupo de jugadores del equipo, repartido distinto
    if exists (select 1 from public.enfrentamientos d where d.cruce = w.cruce and d.oficial and d.modo = '1v1'
               and w.equipo_id in (public.wc_equipo_de(d.a_perfil), public.wc_equipo_de(d.b_perfil))
               and (d.estado <> 'pendiente' or exists (select 1 from public.enfrentamiento_marcas k where k.enfrentamiento_id = d.id))) then
      return 'El Cambio de Rivales se usa antes de que el equipo juegue cualquiera de sus duelos.';
    end if;
    select array_agg(p order by p) into v_actuales from (
      select case when public.wc_equipo_de(d.a_perfil) = w.equipo_id then d.a_perfil else d.b_perfil end as p
      from public.enfrentamientos d where d.cruce = w.cruce and d.oficial and d.modo = '1v1' and d.estado = 'pendiente'
        and w.equipo_id in (public.wc_equipo_de(d.a_perfil), public.wc_equipo_de(d.b_perfil))) s;
    select array_agg((y ->> 'perfil')::uuid order by (y ->> 'perfil')::uuid) into v_nuevos from jsonb_array_elements(p_datos -> 'asignacion') y;
    if v_actuales is distinct from v_nuevos then return 'La asignación tiene que usar a los mismos jugadores del equipo, uno por duelo.'; end if;
    for x in select * from jsonb_array_elements(p_datos -> 'asignacion') loop
      select * into e from public.enfrentamientos where id = (x ->> 'duelo')::bigint and cruce = w.cruce;
      if not found then return 'Uno de los duelos no es de este cruce.'; end if;
      if public.wc_equipo_de(e.a_perfil) = w.equipo_id then update public.enfrentamientos set a_perfil = (x ->> 'perfil')::uuid where id = e.id;
      elsif public.wc_equipo_de(e.b_perfil) = w.equipo_id then update public.enfrentamientos set b_perfil = (x ->> 'perfil')::uuid where id = e.id;
      else return 'Uno de los duelos no es de este equipo.'; end if;
    end loop;
    update public.wild_cards set usada = true, datos = p_datos where id = w.id;
    perform public.avisar_discord(format('🔀 **Cambio de Rivales** · %s reordenó quién juega contra quién en el cruce %s. Revisen sus duelos en la web.', v_eq, w.cruce), 'recordatorios');
    return null;

  elsif w.carta = 'mano' then
    v_carta := p_datos ->> 'carta';
    select rareza into v_rareza from public.wc_cartas where id = v_carta;
    if v_rareza is null or v_rareza = 'legendaria' or v_carta in ('doble_carta', 'ruleta') or not (select activa from public.wc_cartas where id = v_carta) then return 'Con Mano de Dios se elige una carta común, rara o épica (no Doble Carta ni Ruleta Rusa).'; end if;
    perform public.wc_hija(w.id, v_carta);
    update public.wild_cards set usada = true, datos = jsonb_build_object('carta', v_carta) where id = w.id;
    perform public.avisar_discord(format('✋ **Mano de Dios** · %s eligió una carta y se lleva +6 puntos base. Se revela al cerrar el cruce.', v_eq), 'recordatorios');
    return null;
  elsif w.carta = 'todo_nada' then
    -- p_datos.duelos = [id, id]: dos duelos del equipo que nadie ha empezado
    select array_agg(distinct value::bigint) into v_ids from jsonb_array_elements_text(coalesce(p_datos -> 'duelos', '[]'::jsonb));
    if coalesce(array_length(v_ids, 1), 0) <> 2 then return 'Todo o Nada marca exactamente 2 duelos distintos.'; end if;
    foreach v_enf in array v_ids loop
      select * into e from public.enfrentamientos where id = v_enf and cruce = w.cruce and oficial and modo = '1v1';
      if not found then return 'Uno de los duelos no es de este cruce.'; end if;
      if w.equipo_id is distinct from public.wc_equipo_de(e.a_perfil) and w.equipo_id is distinct from public.wc_equipo_de(e.b_perfil) then return 'Uno de los duelos no es de este equipo.'; end if;
      if e.estado <> 'pendiente' or exists (select 1 from public.enfrentamiento_marcas where enfrentamiento_id = e.id) then
        return 'Todo o Nada se usa antes de que alguien juegue esos duelos.';
      end if;
    end loop;
    update public.wild_cards set usada = true, datos = jsonb_build_object('duelos', to_jsonb(v_ids)) where id = w.id;
    perform public.avisar_discord(format('💣 **Todo o Nada** · %s apostó dos de sus duelos del cruce %s: si gana los dos, se lleva +25 puntos base.', v_eq, w.cruce), 'recordatorios');
    return null;

  elsif w.carta = 'bis' then
    -- p_datos.repeticiones = [{duelo, perfil, ronda}, {duelo, perfil, ronda}]: dos jugadores distintos del equipo
    if jsonb_array_length(coalesce(p_datos -> 'repeticiones', '[]'::jsonb)) <> 2
       or (p_datos -> 'repeticiones' -> 0 ->> 'perfil') = (p_datos -> 'repeticiones' -> 1 ->> 'perfil') then
      return 'Bis necesita 2 jugadores distintos, con una ronda cada uno.';
    end if;
    v_hechas := '[]'::jsonb;
    for x in select * from jsonb_array_elements(p_datos -> 'repeticiones') loop
      v_perfil := (x ->> 'perfil')::uuid; v_ronda := (x ->> 'ronda')::integer;
      select * into e from public.enfrentamientos where id = (x ->> 'duelo')::bigint and cruce = w.cruce and oficial and modo = '1v1';
      if not found then return 'Uno de los duelos no es de este cruce.'; end if;
      if e.estado <> 'pendiente' then return 'Bis se usa antes de que el duelo termine.'; end if;
      v_lado := case when public.wc_equipo_de(e.a_perfil) = w.equipo_id then 'a' when public.wc_equipo_de(e.b_perfil) = w.equipo_id then 'b' end;
      if v_lado is null or v_perfil is distinct from (case when v_lado = 'a' then e.a_perfil else e.b_perfil end) then return 'Uno de los jugadores no es del equipo en ese duelo.'; end if;
      select puntaje into v_prev from public.enfrentamiento_marcas where enfrentamiento_id = e.id and perfil_id = v_perfil and ronda = v_ronda and terminado;
      if not found then return 'Una de esas rondas todavía no se ha jugado.'; end if;
      v_hechas := v_hechas || jsonb_build_array(jsonb_build_object('duelo', e.id, 'perfil', v_perfil, 'ronda', v_ronda, 'previo', v_prev));
    end loop;
    -- Recién con las dos comprobadas se borran las rondas (el trigger wc_segunda_vuelta guarda el mejor puntaje)
    for x in select * from jsonb_array_elements(v_hechas) loop
      delete from public.enfrentamiento_marcas where enfrentamiento_id = (x ->> 'duelo')::bigint and perfil_id = (x ->> 'perfil')::uuid and ronda = (x ->> 'ronda')::integer;
    end loop;
    update public.wild_cards set usada = true, datos = jsonb_build_object('repeticiones', v_hechas) where id = w.id;
    perform public.avisar_discord(format('🎤 **Bis** · %s y %s pueden repetir una ronda cada uno (se quedan con el mejor puntaje).', public.mencion((v_hechas -> 0 ->> 'perfil')::uuid), public.mencion((v_hechas -> 1 ->> 'perfil')::uuid)), 'recordatorios');
    return null;
  end if;
  return 'Esta carta funciona sola: no hay que usarla.';
end; $$;
revoke all on function public.wc_usar(bigint, jsonb) from public, anon;
grant execute on function public.wc_usar(bigint, jsonb) to authenticated;

-- ───────── Segunda Vuelta y Bis: al terminar la ronda repetida queda el mejor puntaje ─────────
create or replace function public.wc_segunda_vuelta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_prev integer; v_i integer;
begin
  select id, (datos ->> 'previo')::integer into v_id, v_prev from public.wild_cards
  where carta = 'segunda' and usada and not anulada and duelo = new.enfrentamiento_id
    and datos ->> 'perfil' = new.perfil_id::text and (datos ->> 'ronda')::integer = new.ronda and not (datos ? 'aplicada')
  limit 1;
  if v_id is not null then
    new.puntaje := greatest(new.puntaje, v_prev);
    update public.wild_cards set datos = datos || '{"aplicada": true}'::jsonb where id = v_id;
    return new;
  end if;
  select w.id, (r.n - 1)::integer, (r.x ->> 'previo')::integer into v_id, v_i, v_prev
  from public.wild_cards w, jsonb_array_elements(w.datos -> 'repeticiones') with ordinality r(x, n)
  where w.carta = 'bis' and w.usada and not w.anulada
    and (r.x ->> 'duelo')::bigint = new.enfrentamiento_id and r.x ->> 'perfil' = new.perfil_id::text
    and (r.x ->> 'ronda')::integer = new.ronda and not (r.x ? 'aplicada')
  limit 1;
  if v_id is not null then
    new.puntaje := greatest(new.puntaje, v_prev);
    update public.wild_cards set datos = jsonb_set(datos, array['repeticiones', v_i::text, 'aplicada'], 'true'::jsonb) where id = v_id;
  end if;
  return new;
end; $$;

commit;

-- Comprobación: 64 cartas activas (24, 18, 11, 11) y Cambio de Órbita fuera del sorteo
select rareza, count(*) filter (where activa) as activas, count(*) filter (where not activa) as retiradas from public.wc_cartas group by rareza order by 1;
select * from public.wc_probabilidades order by desde;
