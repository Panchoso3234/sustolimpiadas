-- Las Sustolimpiadas · esquema de la etapa 0
-- Se ejecuta completo en Supabase → SQL Editor. Se puede volver a ejecutar sin romper nada.

create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 40),
  avatar_url text,
  rol text not null default 'jugador' check (rol in ('admin', 'guardian', 'jugador')),
  creado timestamptz not null default now()
);

create table if not exists public.personajes (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 24),
  apariencia jsonb not null check (pg_column_size(apariencia) < 4000),
  personalidad text not null default 'Tranquilo' check (char_length(personalidad) <= 20),
  voz real not null default 0.5 check (voz between 0 and 1),
  frase text not null default '' check (char_length(frase) <= 60),
  actualizado timestamptz not null default now()
);

alter table public.perfiles enable row level security;
alter table public.personajes enable row level security;

-- ¿Quien llama es el administrador?
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = (select auth.uid()) and rol = 'admin');
$$;

-- Al entrar alguien por primera vez con Discord se crea su perfil.
-- Solo la cuenta de Discord de Pancho nace como administrador, y solo si el inicio fue por Discord
-- (app_metadata lo escribe Supabase; el usuario no puede falsificarlo).
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre, avatar_url, rol)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data -> 'custom_claims' ->> 'global_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      'Participante'), 40),
    new.raw_user_meta_data ->> 'avatar_url',
    case
      when new.raw_app_meta_data ->> 'provider' = 'discord'
       and new.raw_user_meta_data ->> 'provider_id' = '336994810806140929' then 'admin'
      else 'jugador'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

create or replace function public.marcar_actualizado() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado = now();
  return new;
end;
$$;

drop trigger if exists al_editar_personaje on public.personajes;
create trigger al_editar_personaje before update on public.personajes
  for each row execute function public.marcar_actualizado();

-- Permisos: todos pueden mirar; cada uno edita solo su personaje; solo el admin cambia roles.
revoke all on public.perfiles, public.personajes from anon, authenticated;
grant select on public.perfiles, public.personajes to anon, authenticated;
grant insert, update on public.personajes to authenticated;
grant update (rol) on public.perfiles to authenticated;
revoke execute on function public.crear_perfil() from public, anon, authenticated;
revoke execute on function public.marcar_actualizado() from public, anon, authenticated;
grant execute on function public.es_admin() to anon, authenticated;

drop policy if exists "perfiles visibles" on public.perfiles;
create policy "perfiles visibles" on public.perfiles for select using (true);

drop policy if exists "admin cambia roles" on public.perfiles;
create policy "admin cambia roles" on public.perfiles for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "personajes visibles" on public.personajes;
create policy "personajes visibles" on public.personajes for select using (true);

drop policy if exists "crear el propio" on public.personajes;
create policy "crear el propio" on public.personajes for insert to authenticated
  with check (perfil_id = (select auth.uid()));

-- El administrador puede borrar un personaje (por ejemplo, por un nombre inapropiado).
grant delete on public.personajes to authenticated;
drop policy if exists "admin borra personajes" on public.personajes;
create policy "admin borra personajes" on public.personajes for delete to authenticated
  using (public.es_admin());

drop policy if exists "editar el propio" on public.personajes;
create policy "editar el propio" on public.personajes for update to authenticated
  using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));

-- ───────── Portal de juegos: marcas ─────────
-- Una fila por partida terminada. El dueño y la fecha (día de Chile) los pone el servidor, no el navegador.
create table if not exists public.marcas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  juego text not null check (char_length(juego) between 1 and 24),
  fecha date not null default ((now() at time zone 'America/Santiago')::date),
  puntaje integer not null check (puntaje between 0 and 1000000),
  detalle jsonb not null default '{}' check (pg_column_size(detalle) < 8000),
  creado timestamptz not null default now()
);
create index if not exists marcas_tabla on public.marcas (juego, fecha, puntaje desc);

alter table public.marcas enable row level security;
revoke all on public.marcas from anon, authenticated;
grant select on public.marcas to anon, authenticated;
grant insert (juego, puntaje, detalle) on public.marcas to authenticated;
grant delete on public.marcas to authenticated;

drop policy if exists "marcas visibles" on public.marcas;
create policy "marcas visibles" on public.marcas for select using (true);

drop policy if exists "anotar la propia" on public.marcas;
create policy "anotar la propia" on public.marcas for insert to authenticated
  with check (perfil_id = (select auth.uid()));

-- El administrador puede borrar una marca dudosa.
drop policy if exists "admin borra marcas" on public.marcas;
create policy "admin borra marcas" on public.marcas for delete to authenticated
  using (public.es_admin());

-- ───────── Portal de juegos: ajustes, equipos y versus ─────────
-- Puntos del torneo y otros valores que el organizador cambia desde la Mesa de control.
create table if not exists public.ajustes (
  clave text primary key check (char_length(clave) between 1 and 40),
  valor jsonb not null check (pg_column_size(valor) < 4000)
);
alter table public.ajustes enable row level security;
revoke all on public.ajustes from anon, authenticated;
grant select on public.ajustes to anon, authenticated;
grant insert, update on public.ajustes to authenticated;
drop policy if exists "ajustes visibles" on public.ajustes;
create policy "ajustes visibles" on public.ajustes for select using (true);
drop policy if exists "admin crea ajustes" on public.ajustes;
create policy "admin crea ajustes" on public.ajustes for insert to authenticated with check (public.es_admin());
drop policy if exists "admin cambia ajustes" on public.ajustes;
create policy "admin cambia ajustes" on public.ajustes for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- Equipos de 3. Cada persona está a lo más en un equipo.
create table if not exists public.equipos (
  id bigint generated always as identity primary key,
  nombre text not null check (char_length(nombre) between 1 and 30),
  creado timestamptz not null default now()
);
create table if not exists public.equipo_miembros (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  equipo_id bigint not null references public.equipos (id) on delete cascade
);
create index if not exists miembros_por_equipo on public.equipo_miembros (equipo_id);
alter table public.equipos enable row level security;
alter table public.equipo_miembros enable row level security;
revoke all on public.equipos, public.equipo_miembros from anon, authenticated;
grant select on public.equipos, public.equipo_miembros to anon, authenticated;
grant insert (nombre), update (nombre), delete on public.equipos to authenticated;
grant insert, update, delete on public.equipo_miembros to authenticated;
drop policy if exists "equipos visibles" on public.equipos;
create policy "equipos visibles" on public.equipos for select using (true);
drop policy if exists "admin crea equipos" on public.equipos;
create policy "admin crea equipos" on public.equipos for insert to authenticated with check (public.es_admin());
drop policy if exists "admin edita equipos" on public.equipos;
create policy "admin edita equipos" on public.equipos for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "admin borra equipos" on public.equipos;
create policy "admin borra equipos" on public.equipos for delete to authenticated using (public.es_admin());
drop policy if exists "miembros visibles" on public.equipo_miembros;
create policy "miembros visibles" on public.equipo_miembros for select using (true);
drop policy if exists "admin agrega miembros" on public.equipo_miembros;
create policy "admin agrega miembros" on public.equipo_miembros for insert to authenticated with check (public.es_admin());
drop policy if exists "admin mueve miembros" on public.equipo_miembros;
create policy "admin mueve miembros" on public.equipo_miembros for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "admin quita miembros" on public.equipo_miembros;
create policy "admin quita miembros" on public.equipo_miembros for delete to authenticated using (public.es_admin());

-- Enfrentamientos en diferido: cada lado juega el mismo desafío a su hora y después se compara.
-- 1v1: lados = personas, se juega a 1, 3 o 5 rondas. 3v3: lados = equipos, cada integrante juega una vez y se suma.
create table if not exists public.enfrentamientos (
  id bigint generated always as identity primary key,
  modo text not null check (modo in ('1v1', '3v3')),
  juego text not null check (char_length(juego) between 1 and 24),
  rondas smallint not null default 1 check (rondas in (1, 3, 5)),
  jornada smallint not null default 1 check (jornada between 1 and 4),
  plazo date,
  oficial boolean not null default false,
  a_perfil uuid references public.perfiles (id) on delete cascade,
  b_perfil uuid references public.perfiles (id) on delete cascade,
  a_equipo bigint references public.equipos (id) on delete cascade,
  b_equipo bigint references public.equipos (id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'cerrado', 'anulado')),
  ganador text check (ganador in ('a', 'b', 'empate')),
  puntos_a integer not null default 0,
  puntos_b integer not null default 0,
  semilla text not null default md5(gen_random_uuid()::text),
  creado_por uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  creado timestamptz not null default now(),
  check ((modo = '1v1' and a_perfil is not null and b_perfil is not null and a_perfil <> b_perfil and a_equipo is null and b_equipo is null)
      or (modo = '3v3' and a_equipo is not null and b_equipo is not null and a_equipo <> b_equipo and a_perfil is null and b_perfil is null))
);
create index if not exists enfrentamientos_estado on public.enfrentamientos (estado, modo);

create table if not exists public.enfrentamiento_marcas (
  enfrentamiento_id bigint not null references public.enfrentamientos (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  ronda smallint not null check (ronda between 1 and 5),
  lado text not null check (lado in ('a', 'b')),
  puntaje integer not null default 0 check (puntaje between 0 and 1000000),
  detalle jsonb not null default '{}' check (pg_column_size(detalle) < 8000),
  terminado boolean not null default false,
  creado timestamptz not null default now(),
  primary key (enfrentamiento_id, perfil_id, ronda)
);

alter table public.enfrentamientos enable row level security;
alter table public.enfrentamiento_marcas enable row level security;
revoke all on public.enfrentamientos, public.enfrentamiento_marcas from anon, authenticated;
-- La semilla no se puede leer: solo la entrega `empezar_ronda`, en el momento de jugar.
grant select (id, modo, juego, rondas, jornada, plazo, oficial, a_perfil, b_perfil, a_equipo, b_equipo, estado, ganador, puntos_a, puntos_b, creado_por, creado) on public.enfrentamientos to anon, authenticated;
grant insert (modo, juego, rondas, jornada, plazo, oficial, a_perfil, b_perfil, a_equipo, b_equipo) on public.enfrentamientos to authenticated;
grant update (estado, ganador, puntos_a, puntos_b, plazo, jornada) on public.enfrentamientos to authenticated;
grant delete on public.enfrentamientos to authenticated;
grant select, delete on public.enfrentamiento_marcas to authenticated;

drop policy if exists "enfrentamientos visibles" on public.enfrentamientos;
create policy "enfrentamientos visibles" on public.enfrentamientos for select using (true);
-- Oficiales: solo el administrador. Amistosos: cualquiera, 1v1 y siendo uno mismo el lado A.
drop policy if exists "crear enfrentamiento" on public.enfrentamientos;
create policy "crear enfrentamiento" on public.enfrentamientos for insert to authenticated
  with check (public.es_admin() or (oficial = false and modo = '1v1' and a_perfil = (select auth.uid())));
drop policy if exists "admin corrige enfrentamientos" on public.enfrentamientos;
create policy "admin corrige enfrentamientos" on public.enfrentamientos for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "admin borra enfrentamientos" on public.enfrentamientos;
create policy "admin borra enfrentamientos" on public.enfrentamientos for delete to authenticated using (public.es_admin());

-- Las marcas del rival no se ven hasta que el enfrentamiento se cierra.
drop policy if exists "marcas de versus" on public.enfrentamiento_marcas;
create policy "marcas de versus" on public.enfrentamiento_marcas for select to authenticated
  using (perfil_id = (select auth.uid()) or public.es_admin()
    or exists (select 1 from public.enfrentamientos e where e.id = enfrentamiento_id and e.estado <> 'pendiente'));
drop policy if exists "admin borra marcas de versus" on public.enfrentamiento_marcas;
create policy "admin borra marcas de versus" on public.enfrentamiento_marcas for delete to authenticated using (public.es_admin());

-- De qué lado juega una persona en un enfrentamiento ('a', 'b' o nada).
create or replace function public.lado_de(p_enf bigint, p_uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when e.modo = '1v1' and e.a_perfil = p_uid then 'a'
    when e.modo = '1v1' and e.b_perfil = p_uid then 'b'
    when e.modo = '3v3' and exists (select 1 from public.equipo_miembros m where m.equipo_id = e.a_equipo and m.perfil_id = p_uid) then 'a'
    when e.modo = '3v3' and exists (select 1 from public.equipo_miembros m where m.equipo_id = e.b_equipo and m.perfil_id = p_uid) then 'b'
  end
  from public.enfrentamientos e where e.id = p_enf;
$$;

-- Cierra un enfrentamiento cuando ya jugaron todos (o a la fuerza, si lo pide el administrador).
create or replace function public.resolver_enfrentamiento(p_id bigint, p_forzar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.enfrentamientos%rowtype;
  esperadas_a integer; esperadas_b integer; hechas_a integer; hechas_b integer;
  pa integer := 0; pb integer := 0; sa integer; sb integer; r integer;
begin
  select * into e from public.enfrentamientos where id = p_id for update;
  if not found or e.estado <> 'pendiente' then return; end if;
  if e.modo = '1v1' then
    esperadas_a := e.rondas; esperadas_b := e.rondas;
  else
    select least(3, count(*)) into esperadas_a from public.equipo_miembros where equipo_id = e.a_equipo;
    select least(3, count(*)) into esperadas_b from public.equipo_miembros where equipo_id = e.b_equipo;
  end if;
  select count(*) filter (where lado = 'a'), count(*) filter (where lado = 'b') into hechas_a, hechas_b
    from public.enfrentamiento_marcas where enfrentamiento_id = p_id and terminado;
  if not p_forzar and (hechas_a < esperadas_a or hechas_b < esperadas_b) then return; end if;
  if e.modo = '1v1' then
    -- Gana quien se lleva más rondas
    for r in 1..e.rondas loop
      select coalesce(max(puntaje) filter (where lado = 'a'), 0), coalesce(max(puntaje) filter (where lado = 'b'), 0) into sa, sb
        from public.enfrentamiento_marcas where enfrentamiento_id = p_id and ronda = r and terminado;
      if sa > sb then pa := pa + 1; elsif sb > sa then pb := pb + 1; end if;
    end loop;
  else
    -- Gana el equipo que suma más entre sus integrantes
    select coalesce(sum(puntaje) filter (where lado = 'a'), 0), coalesce(sum(puntaje) filter (where lado = 'b'), 0) into pa, pb
      from public.enfrentamiento_marcas where enfrentamiento_id = p_id and terminado;
  end if;
  update public.enfrentamientos
    set estado = 'cerrado', puntos_a = pa, puntos_b = pb,
        ganador = case when pa > pb then 'a' when pb > pa then 'b' else 'empate' end
    where id = p_id;
end;
$$;

-- Empezar una ronda gasta el intento y entrega la semilla del desafío. Solo se puede una vez por ronda.
create or replace function public.empezar_ronda(p_enf bigint, p_ronda integer) returns text
language plpgsql security definer set search_path = '' as $$
declare
  e public.enfrentamientos%rowtype;
  mi_lado text;
begin
  if (select auth.uid()) is null then raise exception 'Hay que entrar con Discord.'; end if;
  select * into e from public.enfrentamientos where id = p_enf;
  if not found or e.estado <> 'pendiente' then raise exception 'Este enfrentamiento ya no está abierto.'; end if;
  mi_lado := public.lado_de(p_enf, (select auth.uid()));
  if mi_lado is null then raise exception 'No eres parte de este enfrentamiento.'; end if;
  if p_ronda < 1 or p_ronda > e.rondas or (e.modo = '3v3' and p_ronda <> 1) then raise exception 'Esa ronda no existe.'; end if;
  begin
    insert into public.enfrentamiento_marcas (enfrentamiento_id, perfil_id, ronda, lado) values (p_enf, (select auth.uid()), p_ronda, mi_lado);
  exception when unique_violation then
    raise exception 'Ya jugaste esta ronda.';
  end;
  return e.semilla || '|r' || p_ronda;
end;
$$;

create or replace function public.terminar_ronda(p_enf bigint, p_ronda integer, p_puntaje integer, p_detalle jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.enfrentamiento_marcas set puntaje = p_puntaje, detalle = coalesce(p_detalle, '{}'::jsonb), terminado = true
    where enfrentamiento_id = p_enf and perfil_id = (select auth.uid()) and ronda = p_ronda and not terminado;
  if not found then raise exception 'Esta ronda no está en juego.'; end if;
  perform public.resolver_enfrentamiento(p_enf, false);
end;
$$;

-- El administrador cierra con lo que haya (quien no jugó queda en cero) o manda a repetir con un desafío nuevo.
create or replace function public.cerrar_enfrentamiento(p_enf bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo el organizador.'; end if;
  perform public.resolver_enfrentamiento(p_enf, true);
end;
$$;

create or replace function public.repetir_enfrentamiento(p_enf bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo el organizador.'; end if;
  delete from public.enfrentamiento_marcas where enfrentamiento_id = p_enf;
  update public.enfrentamientos set estado = 'pendiente', ganador = null, puntos_a = 0, puntos_b = 0, semilla = md5(gen_random_uuid()::text) where id = p_enf;
end;
$$;

revoke execute on function public.resolver_enfrentamiento(bigint, boolean) from public, anon, authenticated;
revoke execute on function public.lado_de(bigint, uuid) from public, anon;
revoke execute on function public.empezar_ronda(bigint, integer) from public, anon;
revoke execute on function public.terminar_ronda(bigint, integer, integer, jsonb) from public, anon;
revoke execute on function public.cerrar_enfrentamiento(bigint) from public, anon;
revoke execute on function public.repetir_enfrentamiento(bigint) from public, anon;
grant execute on function public.lado_de(bigint, uuid) to authenticated;
grant execute on function public.empezar_ronda(bigint, integer) to authenticated;
grant execute on function public.terminar_ronda(bigint, integer, integer, jsonb) to authenticated;
grant execute on function public.cerrar_enfrentamiento(bigint) to authenticated;
grant execute on function public.repetir_enfrentamiento(bigint) to authenticated;

-- ───────── Tabla de posiciones y cierre automático ─────────
-- Mejor marca de cada equipo en cada juego y jornada. Las jornadas son semanas desde el viernes 16 de octubre de 2026.
create or replace function public.marcas_por_equipo() returns table (equipo_id bigint, juego text, jornada integer, puntaje integer)
language sql stable security definer set search_path = '' as $$
  select q.equipo_id, m.juego, ((m.fecha - date '2026-10-16') / 7 + 1)::integer, max(m.puntaje)::integer
  from public.marcas m
  join public.equipo_miembros q on q.perfil_id = m.perfil_id
  where m.fecha between date '2026-10-16' and date '2026-11-12'
  group by q.equipo_id, m.juego, ((m.fecha - date '2026-10-16') / 7 + 1);
$$;

-- Cierra los enfrentamientos cuyo plazo ya pasó (día de Chile), con lo que se haya jugado. Quien no jugó queda en cero.
-- La puede llamar cualquiera porque no decide nada: solo aplica la regla del plazo.
create or replace function public.cerrar_vencidos() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  fila record;
  cuantos integer := 0;
begin
  for fila in select id from public.enfrentamientos where estado = 'pendiente' and plazo is not null and plazo < (now() at time zone 'America/Santiago')::date loop
    perform public.resolver_enfrentamiento(fila.id, true);
    cuantos := cuantos + 1;
  end loop;
  return cuantos;
end;
$$;

revoke execute on function public.marcas_por_equipo() from public;
revoke execute on function public.cerrar_vencidos() from public;
grant execute on function public.marcas_por_equipo() to anon, authenticated;
grant execute on function public.cerrar_vencidos() to anon, authenticated;

-- ───────── Un intento al día en los juegos de acertijo fijo ─────────
-- Quien termina estos juegos ya conoce la solución, así que solo vale la primera partida del día.
-- Primero se borran las repeticiones que ya existan (se conserva la primera de cada persona, juego y día).
delete from public.marcas m using public.marcas n
  where m.juego in ('palabra', 'parejas', 'buscaconchas', 'luces', 'cartero', 'cofre', 'bajo', 'subasta')
    and n.perfil_id = m.perfil_id and n.juego = m.juego and n.fecha = m.fecha and n.id < m.id;
create unique index if not exists marcas_una_vez on public.marcas (perfil_id, juego, fecha)
  where juego in ('palabra', 'parejas', 'buscaconchas', 'luces', 'cartero', 'cofre', 'bajo', 'subasta');

-- ───────── Desafío nuevo en cada intento (14 de octubre) ─────────
-- Ya no hay juegos de un solo intento al día: se quita la restricción.
drop index if exists public.marcas_una_vez;
