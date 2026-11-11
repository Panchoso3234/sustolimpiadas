-- Las Sustolimpiadas · 11 de noviembre · WILD CARDS (desde el cruce 8)
-- Una carta por equipo y cruce, sorteada en la Mesa de control (pestaña «🃏 Wild Cards»). El azar lo decide esta base:
-- la ruleta de la web solo muestra lo que ya salió. Las cartas automáticas quedan boca abajo hasta que Pancho las revela
-- al cerrar el cruce; ahí se guardan sus puntos en wc_ajustes, que suman en la tabla de la web y en la del bot.
-- Catálogo y probabilidades generados desde src/juegos/wildcards.ts (no editarlos a mano aquí).
-- Se puede ejecutar más de una vez sin problema. No toca ningún cruce anterior.
-- Va en una sola transacción: si algo falla, no se aplica nada.
begin;

-- ───────── Configuración ─────────
insert into public.ajustes (clave, valor) values ('wild_cards', '{"desde_cruce": 8}')
on conflict (clave) do update set valor = excluded.valor;

-- ───────── Tablas ─────────
create table if not exists public.wc_cartas (
  id text primary key check (id ~ '^[a-z_]{2,20}$'),
  nombre text not null check (char_length(nombre) <= 40),
  emoji text not null check (char_length(emoji) <= 8),
  rareza text not null check (rareza in ('comun', 'rara', 'epica', 'legendaria')),
  tipo text not null check (tipo in ('auto', 'decision')),
  efecto text not null check (char_length(efecto) <= 200)
);
create table if not exists public.wc_probabilidades (
  desde smallint primary key check (desde between 1 and 12),
  hasta smallint not null check (hasta between 1 and 12),
  comun numeric not null, rara numeric not null, epica numeric not null, legendaria numeric not null,
  check (comun + rara + epica + legendaria = 100)
);
create table if not exists public.wild_cards (
  id bigint generated always as identity primary key,
  cruce smallint not null check (cruce between 1 and 11),
  equipo_id bigint not null references public.equipos (id) on delete cascade,
  carta text not null references public.wc_cartas (id),
  origen bigint references public.wild_cards (id) on delete cascade,   -- la carta que la trajo (Doble Carta, Ruleta Rusa, Mano de Dios)
  puesto smallint check (puesto between 1 and 12),                      -- puesto del equipo al sortear
  dado smallint check (dado between 1 and 4),                           -- Dado de la Suerte
  duelo bigint references public.enfrentamientos (id) on delete set null, -- duelo afectado por una carta de decisión
  datos jsonb not null default '{}'::jsonb check (pg_column_size(datos) < 2000),
  usada boolean not null default false,
  anulada boolean not null default false,
  motivo text check (motivo is null or char_length(motivo) <= 200),
  revelada boolean not null default false,
  creado timestamptz not null default now(),
  creado_por uuid references public.perfiles (id) on delete set null
);
create unique index if not exists wild_cards_una_por_cruce on public.wild_cards (cruce, equipo_id) where origen is null;
create index if not exists wild_cards_equipo on public.wild_cards (equipo_id);
create index if not exists wild_cards_origen on public.wild_cards (origen);
create index if not exists wild_cards_duelo on public.wild_cards (duelo);
create table if not exists public.wc_ajustes (
  cruce smallint not null check (cruce between 1 and 11),
  equipo_id bigint not null references public.equipos (id) on delete cascade,
  puntos numeric(8, 2) not null,
  detalle text not null default '' check (char_length(detalle) <= 600),
  creado timestamptz not null default now(),
  primary key (cruce, equipo_id)
);
create index if not exists wc_ajustes_equipo on public.wc_ajustes (equipo_id);

-- RLS: el catálogo, las probabilidades y los puntos ya revelados son públicos; las cartas solo por funciones.
alter table public.wc_cartas enable row level security;
alter table public.wc_probabilidades enable row level security;
alter table public.wild_cards enable row level security;
alter table public.wc_ajustes enable row level security;
revoke insert, update, delete on public.wc_cartas, public.wc_probabilidades, public.wc_ajustes from anon, authenticated;
revoke all on public.wild_cards from anon, authenticated;
drop policy if exists "catálogo visible" on public.wc_cartas;
create policy "catálogo visible" on public.wc_cartas for select to anon, authenticated using (true);
drop policy if exists "probabilidades visibles" on public.wc_probabilidades;
create policy "probabilidades visibles" on public.wc_probabilidades for select to anon, authenticated using (true);
drop policy if exists "ajustes visibles" on public.wc_ajustes;
create policy "ajustes visibles" on public.wc_ajustes for select to anon, authenticated using (true);

-- ───────── Catálogo y probabilidades (generados desde src/juegos/wildcards.ts) ─────────
insert into public.wc_cartas (id, nombre, emoji, rareza, tipo, efecto) values
  ('escudo', 'Escudo de Arena', '🛡️', 'comun', 'auto', 'Cada derrota vale +1 punto base.'),
  ('hinchada', 'La Hinchada', '📣', 'comun', 'auto', '+1 punto base por cada duelo ganado.'),
  ('consuelo', 'Premio de Consuelo', '🧃', 'comun', 'auto', 'Si el equipo gana 0 o 1 duelo: +3 puntos base.'),
  ('dado', 'Dado de la Suerte', '🎲', 'comun', 'auto', 'Se tira un dado de 1 a 4: suma esos puntos base.'),
  ('bebida', 'Bebida Energética', '🥤', 'comun', 'auto', 'Si el equipo gana al menos un duelo: +2 puntos base.'),
  ('pelo', 'Por un Pelo', '🪶', 'comun', 'auto', '+1 punto base por cada duelo ganado 2-1.'),
  ('cancha', 'Elige tu Cancha', '🎯', 'comun', 'decision', 'El equipo elige el juego de 1 de sus duelos.'),
  ('segunda', 'Segunda Vuelta', '🔁', 'comun', 'decision', 'Un jugador repite 1 ronda y se queda con su mejor puntaje.'),
  ('doble_nada', 'Doble o Nada', '⚡', 'rara', 'decision', 'Se marca 1 duelo antes de jugarlo: si lo gana vale el doble; si lo pierde, 0.'),
  ('muralla', 'La Muralla', '🧱', 'rara', 'auto', 'Cada derrota vale como empate (+2 puntos base).'),
  ('iman', 'Imán', '🧲', 'rara', 'auto', '+2 puntos base por cada duelo ganado.'),
  ('barrida', 'Barrida', '🧹', 'rara', 'auto', 'Si gana los 3 duelos: +8 puntos base.'),
  ('trampa', 'Trampa', '🪤', 'rara', 'auto', 'El rival pierde 1 punto base por cada duelo que pierda contra este equipo.'),
  ('cambio_rivales', 'Cambio de Rivales', '🔀', 'rara', 'decision', 'El equipo decide quién de los suyos juega contra quién.'),
  ('ruleta', 'Ruleta Rusa', '🎰', 'rara', 'auto', 'Se gira otra vez: 50 % gana además una carta Épica, 50 % nada.'),
  ('racha', 'En Racha', '🔥', 'epica', 'auto', 'Todos los puntos del equipo en el cruce valen ×1,25.'),
  ('contraataque', 'Contraataque', '🦅', 'epica', 'auto', 'Por cada duelo ganado, el rival pierde 2 puntos base.'),
  ('sed', 'Sed de Sangre', '🩸', 'epica', 'auto', 'Si gana la serie (2 o 3 duelos): +6 puntos base.'),
  ('congelar', 'Congelar', '🧊', 'epica', 'auto', 'La carta del rival no se aplica este cruce (no sirve contra legendarias).'),
  ('doble_carta', 'Doble Carta', '🃏', 'epica', 'auto', 'En vez de esta, el equipo recibe 2 cartas (común o rara) y usa ambas.'),
  ('revancha', 'Revancha Total', '🔄', 'epica', 'decision', 'Un duelo perdido se vuelve a jugar completo, con un desafío nuevo, y vale el segundo.'),
  ('corona', 'La Corona', '👑', 'legendaria', 'auto', 'Todos los puntos del equipo en el cruce valen ×1,5.'),
  ('agujero', 'Agujero Negro', '🕳️', 'legendaria', 'auto', 'Por cada duelo ganado, le roba 3 puntos base al rival.'),
  ('orbita', 'Cambio de Órbita', '🪐', 'legendaria', 'auto', 'Si el rival hizo más puntos en el cruce, se intercambian.'),
  ('mano', 'Mano de Dios', '✋', 'legendaria', 'decision', 'Elige cualquier carta común, rara o épica, y además +4 puntos base.')
on conflict (id) do update set nombre = excluded.nombre, emoji = excluded.emoji, rareza = excluded.rareza, tipo = excluded.tipo, efecto = excluded.efecto;
insert into public.wc_probabilidades (desde, hasta, comun, rara, epica, legendaria) values
  (1, 2, 68, 22, 8, 2),
  (3, 5, 60, 25, 12, 3),
  (6, 8, 45, 30, 15, 10),
  (9, 12, 30, 28, 22, 20)
on conflict (desde) do update set hasta = excluded.hasta, comun = excluded.comun, rara = excluded.rara, epica = excluded.epica, legendaria = excluded.legendaria;

-- ───────── Ayudas ─────────
create or replace function public.wc_equipo_de(p_perfil uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select equipo_id from public.equipo_miembros where perfil_id = p_perfil limit 1;
$$;
revoke all on function public.wc_equipo_de(uuid) from public, anon, authenticated;

create or replace function public.wc_rareza_emoji(p_rareza text) returns text
language sql immutable set search_path = '' as $$
  select case p_rareza when 'comun' then '⚪' when 'rara' then '🔵' when 'epica' then '🟣' else '🟡' end;
$$;
create or replace function public.wc_rareza_nombre(p_rareza text) returns text
language sql immutable set search_path = '' as $$
  select case p_rareza when 'comun' then 'común' when 'rara' then 'rara' when 'epica' then 'épica' else 'LEGENDARIA' end;
$$;

-- Carta hija (la trae Doble Carta, Ruleta Rusa o Mano de Dios). Si es el dado, se tira ahí mismo.
create or replace function public.wc_hija(p_madre bigint, p_carta text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare m public.wild_cards%rowtype; v_id bigint;
begin
  select * into m from public.wild_cards where id = p_madre;
  insert into public.wild_cards (cruce, equipo_id, carta, origen, puesto, dado, creado_por)
  values (m.cruce, m.equipo_id, p_carta, m.id, m.puesto, case when p_carta = 'dado' then 1 + floor(random() * 4)::smallint end, (select auth.uid()))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.wc_hija(bigint, text) from public, anon, authenticated;

-- ───────── Sortear (solo admin) ─────────
-- Elige la rareza según el puesto actual del equipo y una carta al azar de esa rareza. Devuelve el id de la carta.
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
  select id into v_carta from public.wc_cartas where rareza = v_rareza order by random() limit 1;
  insert into public.wild_cards (cruce, equipo_id, carta, puesto, dado, creado_por)
  values (p_cruce, p_equipo, v_carta, v_puesto, case when v_carta = 'dado' then 1 + floor(random() * 4)::smallint end, (select auth.uid()))
  returning id into v_id;
  -- Cartas que traen otras: se resuelven al tiro (sin anidar Doble Carta ni Ruleta Rusa)
  if v_carta = 'ruleta' and random() < 0.5 then
    perform public.wc_hija(v_id, (select id from public.wc_cartas where rareza = 'epica' and id <> 'doble_carta' order by random() limit 1));
  elsif v_carta = 'doble_carta' then
    perform public.wc_hija(v_id, x.id) from (select id from public.wc_cartas where rareza in ('comun', 'rara') and id <> 'ruleta' order by random() limit 2) x;
  end if;
  insert into public.avisos (perfil_id, tipo, texto, enlace)
  select m.perfil_id, 'wildcard', format('🃏 Tu equipo recibió una Wild Card %s %s para el cruce %s.', public.wc_rareza_emoji(v_rareza), public.wc_rareza_nombre(v_rareza), p_cruce), '#/wildcards'
  from public.equipo_miembros m where m.equipo_id = p_equipo;
  return v_id;
end; $$;
revoke all on function public.wc_sortear(smallint, bigint) from public, anon;
grant execute on function public.wc_sortear(smallint, bigint) to authenticated;

-- ───────── Ver las cartas ─────────
-- Todos ven la rareza. El nombre (y el dado) solo si: es de decisión, ya se reveló, eres del equipo o eres organizador.
create or replace function public.wc_lista(p_cruce smallint default null)
returns table (id bigint, cruce smallint, equipo_id bigint, rareza text, carta text, origen bigint, dado smallint, duelo bigint,
               usada boolean, anulada boolean, motivo text, revelada boolean, puesto smallint, datos jsonb, creado timestamptz)
language sql stable security definer set search_path = '' as $$
  with yo as (select public.es_admin() as admin, public.wc_equipo_de((select auth.uid())) as equipo)
  select w.id, w.cruce, w.equipo_id, k.rareza,
    case when v.ve then w.carta end, w.origen, case when v.ve then w.dado end, w.duelo,
    w.usada, w.anulada, w.motivo, w.revelada, w.puesto, case when v.ve then w.datos else '{}'::jsonb end, w.creado
  from public.wild_cards w join public.wc_cartas k on k.id = w.carta, yo,
    lateral (select yo.admin or w.revelada or k.tipo = 'decision' or w.equipo_id = yo.equipo as ve) v
  where p_cruce is null or w.cruce = p_cruce
  order by w.cruce, w.equipo_id, w.id;
$$;
revoke all on function public.wc_lista(smallint) from public;
grant execute on function public.wc_lista(smallint) to anon, authenticated;

-- ───────── Usar una carta de decisión (solo admin) ─────────
-- Devuelve null si salió bien, o el motivo por el que no se pudo.
create or replace function public.wc_usar(p_id bigint, p_datos jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  w public.wild_cards%rowtype; e public.enfrentamientos%rowtype; v_lado text; v_eq text; v_enf bigint; v_perfil uuid; v_ronda integer;
  v_prev integer; v_carta text; v_rareza text; v_actuales uuid[]; v_nuevos uuid[]; x jsonb; v_juego text;
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
      perform public.avisar_discord(format('⚡ **Doble o Nada** · %s apostó su duelo %s vs %s (%s): si lo gana vale el doble; si lo pierde, 0.', v_eq, public.mencion(e.a_perfil), public.mencion(e.b_perfil), public.nombre_juego(e.juego)), 'recordatorios');
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
    if v_rareza is null or v_rareza = 'legendaria' or v_carta in ('doble_carta', 'ruleta') then return 'Con Mano de Dios se elige una carta común, rara o épica (no Doble Carta ni Ruleta Rusa).'; end if;
    perform public.wc_hija(w.id, v_carta);
    update public.wild_cards set usada = true, datos = jsonb_build_object('carta', v_carta) where id = w.id;
    perform public.avisar_discord(format('✋ **Mano de Dios** · %s eligió una carta y se lleva +4 puntos base. Se revela al cerrar el cruce.', v_eq), 'recordatorios');
    return null;
  end if;
  return 'Esta carta funciona sola: no hay que usarla.';
end; $$;
revoke all on function public.wc_usar(bigint, jsonb) from public, anon;
grant execute on function public.wc_usar(bigint, jsonb) to authenticated;

-- ───────── Anular (solo admin, con motivo) ─────────
create or replace function public.wc_anular(p_id bigint, p_motivo text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then return 'Solo la organización anula cartas.'; end if;
  if coalesce(char_length(trim(p_motivo)), 0) < 3 then return 'Escribe el motivo de la anulación.'; end if;
  update public.wild_cards set anulada = true, motivo = left(trim(p_motivo), 200) where id = p_id or origen = p_id;
  if not found then return 'No existe esa carta.'; end if;
  return null;
end; $$;
revoke all on function public.wc_anular(bigint, text) from public, anon;
grant execute on function public.wc_anular(bigint, text) to authenticated;

-- ───────── Anunciar las cartas del cruce en Discord (solo admin) ─────────
create or replace function public.wc_anunciar(p_cruce smallint) returns text
language plpgsql security definer set search_path = '' as $$
declare v_lineas text;
begin
  if not public.es_admin() then return 'Solo la organización anuncia.'; end if;
  select string_agg(format('%s **%s** · %s', public.wc_rareza_emoji(k.rareza), q.nombre,
      case when k.tipo = 'decision' then format('%s %s', k.emoji, k.nombre) else format('carta %s boca abajo', public.wc_rareza_nombre(k.rareza)) end), E'\n' order by q.nombre)
    into v_lineas
  from public.wild_cards w join public.wc_cartas k on k.id = w.carta join public.equipos q on q.id = w.equipo_id
  where w.cruce = p_cruce and w.origen is null and not w.anulada;
  if v_lineas is null then return 'Todavía no hay cartas sorteadas en este cruce.'; end if;
  perform public.avisar_discord(format(E'🃏 **WILD CARDS · CRUCE %s**\nCada equipo ya tiene su carta. Las de decisión se ven; las demás se revelan cuando cierre el cruce.\n\n%s\n\nTodas las cartas: https://panchoso3234.github.io/sustolimpiadas/#/wildcards', p_cruce, v_lineas), 'recordatorios');
  return null;
end; $$;
revoke all on function public.wc_anunciar(smallint) from public, anon;
grant execute on function public.wc_anunciar(smallint) to authenticated;

-- ───────── Revelar y aplicar (solo admin) ─────────
-- La web calcula los puntos con el motor (src/juegos/wildcards.ts) y Pancho los confirma. Aquí se guardan, se revelan las
-- cartas y, la primera vez, se anuncia en Discord y en la campana. Repetirlo solo actualiza los puntos.
create or replace function public.wc_revelar(p_cruce smallint, p_ajustes jsonb, p_textos text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare v_texto text;
begin
  if not public.es_admin() then return 'Solo la organización revela las cartas.'; end if;
  if exists (select 1 from public.enfrentamientos where cruce = p_cruce and oficial and modo = '1v1' and estado = 'pendiente') then
    return 'Todavía hay duelos abiertos en este cruce: se revela cuando cierren todos.';
  end if;
  delete from public.wc_ajustes where cruce = p_cruce;
  insert into public.wc_ajustes (cruce, equipo_id, puntos, detalle)
  select p_cruce, x.equipo, x.puntos, left(coalesce(x.detalle, ''), 600)
  from jsonb_to_recordset(p_ajustes) as x(equipo bigint, puntos numeric, detalle text) where x.puntos <> 0;
  update public.wild_cards set revelada = true where cruce = p_cruce;
  insert into public.avisos_enviados (clave) values ('wc-' || p_cruce) on conflict do nothing;
  if not found then return 'Puntos actualizados (ya se había anunciado antes).'; end if;
  foreach v_texto in array coalesce(p_textos, '{}') loop perform public.avisar_discord(left(v_texto, 1950), 'resultados'); end loop;
  perform public.avisar_discord(format(E'**Así queda la tabla con las Wild Cards del cruce %s**\n%s', p_cruce, public.texto_tabla()), 'resultados');
  insert into public.avisos (perfil_id, tipo, texto, enlace)
  select p.id, 'wc-revela-' || p_cruce, format('🃏 Se revelaron las Wild Cards del cruce %s. Mira quién dio vuelta la tabla.', p_cruce), '#/wildcards'
  from public.perfiles p where not exists (select 1 from public.avisos a where a.perfil_id = p.id and a.tipo = 'wc-revela-' || p_cruce);
  return null;
end; $$;
revoke all on function public.wc_revelar(smallint, jsonb, text[]) from public, anon;
grant execute on function public.wc_revelar(smallint, jsonb, text[]) to authenticated;

-- ───────── Segunda Vuelta: al terminar la ronda repetida queda el mejor puntaje ─────────
create or replace function public.wc_segunda_vuelta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_prev integer;
begin
  select id, (datos ->> 'previo')::integer into v_id, v_prev from public.wild_cards
  where carta = 'segunda' and usada and not anulada and duelo = new.enfrentamiento_id
    and datos ->> 'perfil' = new.perfil_id::text and (datos ->> 'ronda')::integer = new.ronda and not (datos ? 'aplicada')
  limit 1;
  if v_id is not null then
    new.puntaje := greatest(new.puntaje, v_prev);
    update public.wild_cards set datos = datos || '{"aplicada": true}'::jsonb where id = v_id;
  end if;
  return new;
end; $$;
drop trigger if exists wc_segunda_vuelta on public.enfrentamiento_marcas;
create trigger wc_segunda_vuelta before update on public.enfrentamiento_marcas
  for each row when (new.terminado and not old.terminado) execute function public.wc_segunda_vuelta();

-- ───────── puntos_liga: igual que antes (2026-10-25-ausencias.sql) + los puntos de las Wild Cards ─────────
create or replace function public.puntos_liga(p_hasta smallint default null)
returns table (perfil uuid, equipo_id bigint, puntos numeric, ganados integer, bono boolean)
language sql stable security definer set search_path = '' as $$
  with p as (select coalesce((select valor from public.ajustes where clave = 'puntos'), '{}'::jsonb) as v),
  d as (
    select e.id, e.cruce, e.ganador, e.no_jugo, e.a_perfil, e.b_perfil,
      coalesce((p.v -> 'multiplicadores' ->> (e.jornada - 1))::numeric, 1) as mult, p.v
    from public.enfrentamientos e, p
    where e.oficial and e.modo = '1v1' and e.estado = 'cerrado' and e.ganador is not null
      and (e.creado at time zone 'America/Santiago')::date >= date '2026-10-21'
      and (p_hasta is null or e.cruce <= p_hasta)
  ),
  lados as (
    select d.*, l.lado, l.perfil, (select m.equipo_id from public.equipo_miembros m where m.perfil_id = l.perfil) as eq
    from d cross join lateral (values ('a', d.a_perfil), ('b', d.b_perfil)) as l(lado, perfil)
  ),
  duelos as (
    select perfil, eq,
      case when no_jugo in (lado, 'ambos') then 0
        when ganador = 'empate' then mult * coalesce((v ->> 'empate')::numeric, 6)
        when ganador = lado then mult * coalesce((v ->> 'victoria')::numeric, 7)
        else mult * coalesce((v ->> 'derrota')::numeric, 4) end as pts,
      (ganador = lado and coalesce(no_jugo, '') not in (lado, 'ambos'))::integer as gano
    from lados
  ),
  aus as (
    select x.cruce, x.perfil_id as perfil, m.equipo_id as eq, x.equipo_rival,
      coalesce((p.v -> 'multiplicadores' ->> (x.jornada - 1))::numeric, 1) as mult, p.v
    from public.ausencias x join public.equipo_miembros m on m.perfil_id = x.perfil_id, p
    where p_hasta is null or x.cruce <= p_hasta
  ),
  pares as (
    select a.cruce, a.mult, least(a.eq, b.eq) as e1, greatest(a.eq, b.eq) as e2, case when a.ganador = 'a' then a.eq else b.eq end as gana
    from lados a join lados b on b.id = a.id and a.lado = 'a' and b.lado = 'b'
    where a.cruce is not null and a.eq is not null and b.eq is not null and a.eq <> b.eq and a.ganador <> 'empate'
    union all
    select cruce, mult, least(eq, equipo_rival), greatest(eq, equipo_rival), eq from aus where eq <> equipo_rival
  ),
  bonos as (select gana as eq, 5 * max(mult) as pts from pares group by cruce, e1, e2, gana having count(*) >= 2)
  select perfil, eq, pts, gano, false from duelos
  union all
  select perfil, eq, mult * coalesce((v ->> 'victoria')::numeric, 7), 1, false from aus
  union all
  select null, eq, pts, 0, true from bonos
  union all
  select null, w.equipo_id, w.puntos, 0, true from public.wc_ajustes w where p_hasta is null or w.cruce <= p_hasta;
$$;
revoke all on function public.puntos_liga(smallint) from public, anon, authenticated;

commit;

-- ───────── Comprobación ─────────
select (select count(*) from public.wc_cartas) as cartas_25,
       (select count(*) from public.wc_probabilidades) as grupos_4,
       (select valor from public.ajustes where clave = 'wild_cards') as configuracion,
       to_regprocedure('public.wc_sortear(smallint,bigint)') is not null as sortear_ok,
       exists (select 1 from pg_trigger where tgname = 'wc_segunda_vuelta') as disparador_ok;
