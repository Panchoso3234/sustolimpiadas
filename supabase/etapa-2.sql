-- Las Sustolimpiadas · etapa 2: vitrina del pase de temporada y predicciones de los duelos en vivo
-- Se ejecuta una vez en Supabase → SQL Editor (también está al final de esquema.sql). Se puede volver a ejecutar sin romper nada.

-- ───────── Vitrina: lo que cada participante lleva puesto del pase ─────────
-- El nivel y los logros los calcula el sitio de las partidas guardadas; aquí solo queda lo elegido para mostrarlo a los demás
-- (título, marco, efecto y adornos de su casa en la isla). Es un adorno: no da puntos del torneo.
create table if not exists public.vitrinas (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  titulo text check (titulo is null or char_length(titulo) <= 20),
  marco text check (marco is null or char_length(marco) <= 20),
  efecto text check (efecto is null or char_length(efecto) <= 20),
  nivel integer not null default 1 check (nivel between 1 and 30),
  logros integer not null default 0 check (logros between 0 and 500),
  deco text[] not null default '{}' check (array_length(deco, 1) is null or array_length(deco, 1) <= 12),
  actualizado timestamptz not null default now()
);
alter table public.vitrinas enable row level security;
drop policy if exists "vitrinas visibles" on public.vitrinas;
create policy "vitrinas visibles" on public.vitrinas for select using (true);
drop policy if exists "crear la propia vitrina" on public.vitrinas;
create policy "crear la propia vitrina" on public.vitrinas for insert to authenticated with check (perfil_id = (select auth.uid()));
drop policy if exists "editar la propia vitrina" on public.vitrinas;
create policy "editar la propia vitrina" on public.vitrinas for update to authenticated using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));

-- ───────── Predicciones de los duelos en vivo (calabazas ficticias, sin dinero) ─────────
-- Cada duelo en vivo se anota al empezar (lo hacen los dos jugadores; el primero gana). Desde ese momento no se aceptan
-- predicciones. Al terminar, los jugadores anotan quién ganó (una sola vez). Cada persona parte con 100 calabazas.
create table if not exists public.vivo_partidas (
  id text primary key check (char_length(id) <= 120),
  juego text not null check (char_length(juego) <= 30),
  a uuid not null references public.perfiles (id) on delete cascade,
  b uuid not null references public.perfiles (id) on delete cascade,
  empezo timestamptz not null default now(),
  ganador text check (ganador is null or ganador = 'empate' or char_length(ganador) = 36)
);
create table if not exists public.predicciones (
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  partida text not null check (char_length(partida) <= 120),
  elegido uuid not null references public.perfiles (id) on delete cascade,
  monto integer not null check (monto between 5 and 100),
  creado timestamptz not null default now(),
  primary key (perfil_id, partida)
);
alter table public.vivo_partidas enable row level security;
alter table public.predicciones enable row level security;
drop policy if exists "partidas en vivo visibles" on public.vivo_partidas;
create policy "partidas en vivo visibles" on public.vivo_partidas for select using (true);
drop policy if exists "predicciones visibles" on public.predicciones;
create policy "predicciones visibles" on public.predicciones for select using (true);
-- No hay políticas de escritura: todo pasa por las funciones de abajo, que revisan las reglas.

-- Calabazas de una persona: 100 + lo ganado − lo perdido; lo apostado en duelos sin terminar queda apartado
-- (si el duelo no parte en 3 horas o no se cierra en 6, se devuelve).
create or replace function public.saldo_calabazas(p_uid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select 100 + coalesce(sum(case
    when v.id is null then case when p.creado < now() - interval '3 hours' then 0 else -p.monto end -- el duelo nunca partió: se devuelve
    when v.ganador is null then case when v.empezo < now() - interval '6 hours' then 0 else -p.monto end -- nunca se cerró: se devuelve
    when v.ganador = 'empate' or p.perfil_id in (v.a, v.b) then 0
    when v.ganador = p.elegido::text then p.monto
    else -p.monto end), 0)::integer
  from public.predicciones p left join public.vivo_partidas v on v.id = p.partida
  where p.perfil_id = p_uid;
$$;

create or replace function public.predecir(p_partida text, p_elegido uuid, p_monto integer) returns text
language plpgsql security definer set search_path = '' as $$
declare yo uuid := (select auth.uid());
begin
  if yo is null then return 'Entra con Discord para predecir.'; end if;
  if p_elegido = yo then return 'No puedes predecir tu propio duelo.'; end if;
  if exists (select 1 from public.vivo_partidas where id = p_partida) then return 'El duelo ya empezó: las predicciones están cerradas.'; end if;
  if p_monto < 5 or p_monto > 100 then return 'Se apuesta entre 5 y 100 calabazas.'; end if;
  if public.saldo_calabazas(yo) < p_monto then return 'No te alcanzan las calabazas.'; end if;
  insert into public.predicciones (perfil_id, partida, elegido, monto) values (yo, p_partida, p_elegido, p_monto)
    on conflict (perfil_id, partida) do update set elegido = excluded.elegido, monto = excluded.monto, creado = now();
  return '';
end; $$;

create or replace function public.empezar_vivo(p_partida text, p_juego text, p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) not in (p_a, p_b) or p_a = p_b then return; end if;
  insert into public.vivo_partidas (id, juego, a, b) values (p_partida, p_juego, p_a, p_b) on conflict (id) do nothing;
end; $$;

create or replace function public.cerrar_vivo(p_partida text, p_ganador text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.vivo_partidas set ganador = p_ganador
   where id = p_partida and ganador is null and (select auth.uid()) in (a, b)
     and (p_ganador = 'empate' or p_ganador = a::text or p_ganador = b::text);
end; $$;

-- Tabla de adivinos: calabazas, aciertos y predicciones terminadas de cada uno
create or replace function public.adivinos() returns table (perfil_id uuid, nombre text, calabazas integer, aciertos integer, jugadas integer)
language sql stable security definer set search_path = '' as $$
  select p.perfil_id, f.nombre, public.saldo_calabazas(p.perfil_id),
    count(*) filter (where v.ganador = p.elegido::text)::integer,
    count(*) filter (where v.ganador is not null and v.ganador <> 'empate')::integer
  from public.predicciones p join public.perfiles f on f.id = p.perfil_id left join public.vivo_partidas v on v.id = p.partida
  group by p.perfil_id, f.nombre order by 3 desc, 4 desc limit 50;
$$;

grant execute on function public.saldo_calabazas(uuid), public.adivinos() to anon, authenticated;
grant execute on function public.predecir(text, uuid, integer), public.empezar_vivo(text, text, uuid, uuid), public.cerrar_vivo(text, text) to authenticated;
