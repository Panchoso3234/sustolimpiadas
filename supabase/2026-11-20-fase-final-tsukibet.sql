-- Las Sustolimpiadas · 20 de noviembre · TSUKIBET de la FASE FINAL (plan del vault, punto 6). Lo ejecuta Pancho UNA vez
-- (se puede repetir sin problema: no borra nada). Va en una sola transacción: si algo falla, no se aplica nada.
--  · Pronóstico gratis por simulación (arma el ranking) y apuesta opcional con protogemas (cuotas con margen 15 %,
--    máximo ×20, tope 320 por persona y simulación). 4 mercados: ganador, primer caído, sobrevive al baño de sangre
--    (el pronóstico elige 3) y top 3 (elige 1).
--  · Cierra cuando Pancho aprieta «Empezar» (ff_cerrar, lo controla el servidor).
--  · Paracaídas: 160 gemas (nivel 1) o 320 (nivel 2), solo entre el Día 1 y la Noche 3; 1 por persona por simulación,
--    3 por persona en la noche, máximo 2 por tributo por simulación. Las gemas se queman.
--  · Participa quien tenga al menos una partida antes del 20-11. Pancho (organización) no participa. Un tributo de esa
--    simulación puede pronosticar, pero no apostar ni mandar paracaídas.
--  · Premios del público al final (ff_premiar): 1.600 / 960 / 640 gemas al podio del ranking, título «Pronosticador
--    de la Fase Final» al primero y 160 gemas a quien pronosticó en 4 o más simulaciones.
begin;

-- ───────── Tablas ─────────
create table if not exists public.ff_sims (
  n smallint primary key check (n between 1 and 6),
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada', 'pagada')),
  tributos jsonb not null default '[]'::jsonb,   -- [{id, nombre}] de la foto congelada
  cuotas jsonb not null default '{}'::jsonb,     -- {ganador: {id: cuota}, primero: {...}, sobrevive: {...}, top3: {...}}
  participantes jsonb,                           -- ids que de verdad juegan (sin los ganadores anteriores), al cerrar
  cierre timestamptz, huella_pronosticos text,
  paso integer not null default 0, paracaidas_abiertos boolean not null default false,
  resultado jsonb                                -- {ganador, primero, sobrevive: [...], top3: [...]}
);
create table if not exists public.ff_pronosticos (
  sim smallint not null references public.ff_sims (n) on delete cascade,
  perfil_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  mercado text not null check (mercado in ('ganador', 'primero', 'sobrevive', 'top3')),
  eleccion jsonb not null check (pg_column_size(eleccion) < 400),  -- un id, o una lista de 3 ids en «sobrevive»
  creado timestamptz not null default now(),
  primary key (sim, perfil_id, mercado)
);
create table if not exists public.ff_apuestas (
  id bigint generated always as identity primary key,
  sim smallint not null references public.ff_sims (n) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  mercado text not null check (mercado in ('ganador', 'primero', 'sobrevive', 'top3')),
  tributo uuid not null, monto integer not null check (monto between 10 and 320), cuota numeric(6, 2) not null,
  pago integer, estado text not null default 'viva' check (estado in ('viva', 'ganada', 'perdida', 'devuelta')),
  creado timestamptz not null default now()
);
create index if not exists ff_apuestas_sim on public.ff_apuestas (sim);
create table if not exists public.ff_paracaidas (
  id bigint generated always as identity primary key,
  sim smallint not null references public.ff_sims (n) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  tributo uuid not null, nivel smallint not null check (nivel in (1, 2)), desde_paso integer not null,
  creado timestamptz not null default now()
);
create index if not exists ff_paracaidas_sim on public.ff_paracaidas (sim);
create table if not exists public.ff_premios (perfil_id uuid primary key references public.perfiles (id) on delete cascade, puesto smallint, puntos integer, gemas integer, titulo text, creado timestamptz not null default now());

alter table public.ff_sims enable row level security;
alter table public.ff_pronosticos enable row level security;
alter table public.ff_apuestas enable row level security;
alter table public.ff_paracaidas enable row level security;
alter table public.ff_premios enable row level security;
revoke all on public.ff_sims, public.ff_pronosticos, public.ff_apuestas, public.ff_paracaidas, public.ff_premios from anon, authenticated;
grant select on public.ff_sims, public.ff_paracaidas, public.ff_premios to anon, authenticated;
grant select on public.ff_pronosticos, public.ff_apuestas to authenticated;
drop policy if exists "ff sims visibles" on public.ff_sims;
create policy "ff sims visibles" on public.ff_sims for select to anon, authenticated using (true);
drop policy if exists "ff paracaidas visibles" on public.ff_paracaidas;
create policy "ff paracaidas visibles" on public.ff_paracaidas for select to anon, authenticated using (true);
drop policy if exists "ff premios visibles" on public.ff_premios;
create policy "ff premios visibles" on public.ff_premios for select to anon, authenticated using (true);
-- Pronósticos y apuestas: cada uno ve los suyos (los demás se ven en el resumen, solo después del cierre)
drop policy if exists "ff mis pronosticos" on public.ff_pronosticos;
create policy "ff mis pronosticos" on public.ff_pronosticos for select to authenticated using (perfil_id = (select auth.uid()) or public.es_admin());
drop policy if exists "ff mis apuestas" on public.ff_apuestas;
create policy "ff mis apuestas" on public.ff_apuestas for select to authenticated using (perfil_id = (select auth.uid()) or public.es_admin());

-- ───────── Quién puede ─────────
-- Devuelve null si puede, o el motivo. p_jugar: true para apuestas y paracaídas (un tributo de la simulación no puede).
create or replace function public.ff_motivo(p_sim smallint, p_jugar boolean) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when (select auth.uid()) is null then 'Entra con Discord para participar.'
    when exists (select 1 from public.perfiles where id = (select auth.uid()) and rol = 'admin') then 'La organización no participa en TSUKIBET.'
    when not exists (select 1 from public.marcas where perfil_id = (select auth.uid()) and fecha < '2026-11-20') then 'Solo participan quienes jugaron al menos una partida antes del 20 de noviembre.'
    when p_jugar and exists (select 1 from public.ff_sims s where s.n = p_sim and exists (select 1 from jsonb_array_elements(s.tributos) t where t ->> 'id' = (select auth.uid())::text)) then 'Eres tributo de esta simulación: puedes pronosticar, pero no apostar ni mandar paracaídas.'
  end;
$$;
grant execute on function public.ff_motivo(smallint, boolean) to authenticated;

-- ───────── Publicar las simulaciones (solo admin, al congelar la foto) ─────────
-- p_sims = [{n, tributos: [{id, nombre}], cuotas: {...}}]. Solo toca las que siguen abiertas y sin pronósticos cerrados.
create or replace function public.ff_publicar(p_sims jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare x jsonb;
begin
  if not public.es_admin() then return 'Solo la organización publica las simulaciones.'; end if;
  for x in select * from jsonb_array_elements(p_sims) loop
    insert into public.ff_sims (n, tributos, cuotas) values ((x ->> 'n')::smallint, x -> 'tributos', x -> 'cuotas')
    on conflict (n) do update set tributos = excluded.tributos, cuotas = excluded.cuotas where public.ff_sims.estado = 'abierta';
  end loop;
  return null;
end; $$;
revoke all on function public.ff_publicar(jsonb) from public, anon;
grant execute on function public.ff_publicar(jsonb) to authenticated;

-- ───────── Pronosticar (gratis) ─────────
create or replace function public.ff_pronosticar(p_sim smallint, p_mercado text, p_eleccion jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.ff_sims%rowtype; v_motivo text; v_ids text[];
begin
  v_motivo := public.ff_motivo(p_sim, false); if v_motivo is not null then return v_motivo; end if;
  select * into s from public.ff_sims where n = p_sim;
  if not found or s.estado <> 'abierta' then return 'Los pronósticos de esta simulación ya cerraron.'; end if;
  v_ids := case when jsonb_typeof(p_eleccion) = 'array' then array(select jsonb_array_elements_text(p_eleccion)) else array[p_eleccion #>> '{}'] end;
  if p_mercado = 'sobrevive' and (cardinality(v_ids) <> 3 or (select count(distinct x) from unnest(v_ids) x) <> 3) then return 'En «sobrevive al baño de sangre» se eligen 3 tributos distintos.'; end if;
  if p_mercado <> 'sobrevive' and cardinality(v_ids) <> 1 then return 'Elige un tributo.'; end if;
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from jsonb_array_elements(s.tributos) t where t ->> 'id' = x)) then return 'Ese tributo no está en la simulación.'; end if;
  insert into public.ff_pronosticos (sim, perfil_id, mercado, eleccion) values (p_sim, (select auth.uid()), p_mercado, p_eleccion)
  on conflict (sim, perfil_id, mercado) do update set eleccion = excluded.eleccion, creado = now();
  return null;
end; $$;
grant execute on function public.ff_pronosticar(smallint, text, jsonb) to authenticated;

-- ───────── Apostar (con protogemas) ─────────
create or replace function public.ff_apostar(p_sim smallint, p_mercado text, p_tributo uuid, p_monto integer) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.ff_sims%rowtype; v_motivo text; v_cuota numeric; v_ya integer; v_id bigint;
begin
  v_motivo := public.ff_motivo(p_sim, true); if v_motivo is not null then return v_motivo; end if;
  select * into s from public.ff_sims where n = p_sim for update;
  if not found or s.estado <> 'abierta' then return 'Las apuestas de esta simulación ya cerraron.'; end if;
  v_cuota := (s.cuotas -> p_mercado ->> p_tributo::text)::numeric;
  if v_cuota is null then return 'No hay cuota para ese tributo en ese mercado.'; end if;
  if p_monto is null or p_monto < 10 then return 'La apuesta mínima es de 10 protogemas.'; end if;
  select coalesce(sum(monto), 0) into v_ya from public.ff_apuestas where sim = p_sim and perfil_id = (select auth.uid()) and estado = 'viva';
  if v_ya + p_monto > 320 then return format('El tope es de 320 protogemas por simulación (ya llevas %s).', v_ya); end if;
  insert into public.ff_apuestas (sim, perfil_id, mercado, tributo, monto, cuota) values (p_sim, (select auth.uid()), p_mercado, p_tributo, p_monto, v_cuota) returning id into v_id;
  begin
    insert into public.gacha_movimientos (perfil_id, motivo, protogemas) values ((select auth.uid()), 'ff-apuesta-' || v_id, -p_monto);
  exception when check_violation then
    delete from public.ff_apuestas where id = v_id; return 'No te alcanzan las protogemas.';
  end;
  return null;
end; $$;
grant execute on function public.ff_apostar(smallint, text, uuid, integer) to authenticated;

-- ───────── Cerrar (admin, al apretar «Empezar») ─────────
-- Devuelve la hora del servidor y la huella de todos los pronósticos: entran a la semilla de la simulación.
create or replace function public.ff_cerrar(p_sim smallint, p_participantes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_huella text; v_hora timestamptz := now();
begin
  if not public.es_admin() then raise exception 'Solo la organización cierra las simulaciones.'; end if;
  select md5(coalesce(string_agg(perfil_id::text || mercado || eleccion::text, '|' order by perfil_id, mercado), '')) into v_huella from public.ff_pronosticos where sim = p_sim;
  update public.ff_sims set estado = 'cerrada', cierre = coalesce(cierre, v_hora), huella_pronosticos = coalesce(huella_pronosticos, v_huella), participantes = coalesce(participantes, p_participantes), paso = 0
  where n = p_sim and estado = 'abierta';
  -- Apuestas a tributos que no juegan esta simulación (ya ganaron una anterior): se devuelven
  update public.ff_apuestas a set estado = 'devuelta', pago = a.monto
  where a.sim = p_sim and a.estado = 'viva' and not exists (select 1 from jsonb_array_elements_text(p_participantes) x where x = a.tributo::text);
  insert into public.gacha_movimientos (perfil_id, motivo, protogemas)
  select perfil_id, 'ff-devuelta-' || id, monto from public.ff_apuestas where sim = p_sim and estado = 'devuelta' on conflict (perfil_id, motivo) do nothing;
  return (select jsonb_build_object('cierre', cierre, 'huella', huella_pronosticos) from public.ff_sims where n = p_sim);
end; $$;
revoke all on function public.ff_cerrar(smallint, jsonb) from public, anon;
grant execute on function public.ff_cerrar(smallint, jsonb) to authenticated;

-- ───────── Avanzar (admin, en cada paso): habilita los paracaídas entre el Día 1 y la Noche 3 ─────────
create or replace function public.ff_avanzar(p_sim smallint, p_paso integer, p_paracaidas boolean) returns void
language sql security definer set search_path = '' as $$
  update public.ff_sims set paso = p_paso, paracaidas_abiertos = p_paracaidas where n = p_sim and estado = 'cerrada' and public.es_admin();
$$;
revoke all on function public.ff_avanzar(smallint, integer, boolean) from public, anon;
grant execute on function public.ff_avanzar(smallint, integer, boolean) to authenticated;

-- ───────── Mandar un paracaídas (público, durante la simulación) ─────────
create or replace function public.ff_paracaidas_mandar(p_sim smallint, p_tributo uuid, p_nivel smallint) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.ff_sims%rowtype; v_motivo text; v_id bigint; v_costo integer := case p_nivel when 2 then 320 else 160 end;
begin
  v_motivo := public.ff_motivo(p_sim, true); if v_motivo is not null then return v_motivo; end if;
  select * into s from public.ff_sims where n = p_sim for update;
  if not found or s.estado <> 'cerrada' or not s.paracaidas_abiertos then return 'Ahora no se pueden mandar paracaídas (solo entre el Día 1 y la Noche 3 de una simulación en curso).'; end if;
  if not exists (select 1 from jsonb_array_elements_text(s.participantes) x where x = p_tributo::text) then return 'Ese tributo no está en esta simulación.'; end if;
  if exists (select 1 from public.ff_paracaidas where sim = p_sim and perfil_id = (select auth.uid())) then return 'Ya mandaste tu paracaídas en esta simulación.'; end if;
  if (select count(*) from public.ff_paracaidas where perfil_id = (select auth.uid())) >= 3 then return 'Ya mandaste los 3 paracaídas de la noche.'; end if;
  if (select count(*) from public.ff_paracaidas where sim = p_sim and tributo = p_tributo) >= 2 then return 'Ese tributo ya recibió 2 paracaídas en esta simulación.'; end if;
  insert into public.ff_paracaidas (sim, perfil_id, tributo, nivel, desde_paso) values (p_sim, (select auth.uid()), p_tributo, p_nivel, s.paso + 1) returning id into v_id;
  begin
    insert into public.gacha_movimientos (perfil_id, motivo, protogemas) values ((select auth.uid()), 'ff-paracaidas-' || v_id, -v_costo);
  exception when check_violation then
    delete from public.ff_paracaidas where id = v_id; return 'No te alcanzan las protogemas.';
  end;
  return null;
end; $$;
grant execute on function public.ff_paracaidas_mandar(smallint, uuid, smallint) to authenticated;

-- ───────── Resultado y pagos (admin, al confirmar el ganador) ─────────
-- p_resultado = {ganador, primero, sobrevive: [ids], top3: [ids]}
create or replace function public.ff_resultado(p_sim smallint, p_resultado jsonb) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then return 'Solo la organización registra el resultado.'; end if;
  update public.ff_sims set resultado = p_resultado, estado = 'pagada', paracaidas_abiertos = false where n = p_sim and estado = 'cerrada';
  if not found then return 'Esa simulación no está en curso (¿ya se pagó?).'; end if;
  update public.ff_apuestas a set
    estado = case when (a.mercado = 'ganador' and a.tributo::text = p_resultado ->> 'ganador')
                    or (a.mercado = 'primero' and a.tributo::text = p_resultado ->> 'primero')
                    or (a.mercado = 'sobrevive' and p_resultado -> 'sobrevive' ? a.tributo::text)
                    or (a.mercado = 'top3' and p_resultado -> 'top3' ? a.tributo::text) then 'ganada' else 'perdida' end
  where a.sim = p_sim and a.estado = 'viva';
  update public.ff_apuestas set pago = floor(monto * cuota) where sim = p_sim and estado = 'ganada' and pago is null;
  insert into public.gacha_movimientos (perfil_id, motivo, protogemas)
  select perfil_id, 'ff-pago-' || id, pago from public.ff_apuestas where sim = p_sim and estado = 'ganada' on conflict (perfil_id, motivo) do nothing;
  return null;
end; $$;
revoke all on function public.ff_resultado(smallint, jsonb) from public, anon;
grant execute on function public.ff_resultado(smallint, jsonb) to authenticated;

-- ───────── Ranking de pronósticos (puntos: ganador 10, primer caído 5, top 3 3, sobrevive 1 por acierto) ─────────
create or replace function public.ff_ranking() returns table (perfil_id uuid, nombre text, puntos integer, sims integer)
language sql stable security definer set search_path = '' as $$
  select p.perfil_id, f.nombre, sum(case
      when p.mercado = 'ganador' and p.eleccion #>> '{}' = s.resultado ->> 'ganador' then 10
      when p.mercado = 'primero' and p.eleccion #>> '{}' = s.resultado ->> 'primero' then 5
      when p.mercado = 'top3' and s.resultado -> 'top3' ? (p.eleccion #>> '{}') then 3
      when p.mercado = 'sobrevive' then (select count(*) from jsonb_array_elements_text(p.eleccion) x where s.resultado -> 'sobrevive' ? x)
      else 0 end)::integer, count(distinct p.sim)::integer
  from public.ff_pronosticos p join public.ff_sims s on s.n = p.sim and s.estado = 'pagada' join public.perfiles f on f.id = p.perfil_id
  group by p.perfil_id, f.nombre order by 3 desc, 4 desc;
$$;
grant execute on function public.ff_ranking() to anon, authenticated;

-- Cuántos pronosticaron cada cosa (solo de simulaciones ya cerradas: antes, nadie ve lo de los demás)
create or replace function public.ff_resumen(p_sim smallint) returns table (mercado text, tributo text, votos integer)
language sql stable security definer set search_path = '' as $$
  select p.mercado, x, count(*)::integer from public.ff_pronosticos p join public.ff_sims s on s.n = p.sim and s.estado <> 'abierta',
    lateral (select jsonb_array_elements_text(case when jsonb_typeof(p.eleccion) = 'array' then p.eleccion else jsonb_build_array(p.eleccion) end) x) e
  where p.sim = p_sim group by 1, 2 order by 1, 3 desc;
$$;
grant execute on function public.ff_resumen(smallint) to anon, authenticated;

-- ───────── Premios del público (admin, al terminar la noche; se puede repetir sin pagar dos veces) ─────────
create or replace function public.ff_premiar() returns text
language plpgsql security definer set search_path = '' as $$
declare r record; i integer := 0; v_gemas integer;
begin
  if not public.es_admin() then return 'Solo la organización entrega los premios.'; end if;
  for r in select * from public.ff_ranking() loop
    i := i + 1;
    v_gemas := case i when 1 then 1600 when 2 then 960 when 3 then 640 else 0 end + case when r.sims >= 4 then 160 else 0 end;
    insert into public.ff_premios (perfil_id, puesto, puntos, gemas, titulo) values (r.perfil_id, i, r.puntos, v_gemas, case when i = 1 then 'Pronosticador de la Fase Final' end)
    on conflict (perfil_id) do update set puesto = excluded.puesto, puntos = excluded.puntos, gemas = excluded.gemas, titulo = excluded.titulo;
    if v_gemas > 0 then insert into public.gacha_movimientos (perfil_id, motivo, protogemas) values (r.perfil_id, 'ff-premio-publico', v_gemas) on conflict (perfil_id, motivo) do nothing; end if;
  end loop;
  return null;
end; $$;
revoke all on function public.ff_premiar() from public, anon;
grant execute on function public.ff_premiar() to authenticated;

commit;

-- Comprobación
select n, estado from public.ff_sims order by n;
