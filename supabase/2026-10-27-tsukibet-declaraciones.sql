-- Las Sustolimpiadas · 27 de octubre · TSUKIBET (pronósticos por cruce) y Declaraciones antes del duelo.
-- TSUKIBET: antes de que empiece un cruce, cada persona pronostica quién gana cada enfrentamiento de equipos (y si quiere,
-- el marcador). Cierra a las 00:00 del día en que empieza el cruce; hasta entonces nadie ve los pronósticos ajenos.
-- El puntaje lo calcula la web con los resultados (son públicos), igual que La Cuarta.
-- Declaraciones: cada jugador de un duelo 1v1 pendiente deja una frase de hasta 140 caracteres, editable hasta que empieza
-- a jugar. La organización puede ocultarla. Se puede volver a ejecutar sin problema.

-- ───────── Las fechas de los cruces (las mismas de la web) ─────────
create table if not exists public.liga_cruces (n smallint primary key, desde date not null, hasta date not null);
insert into public.liga_cruces (n, desde, hasta) values
  (1, '2026-10-21', '2026-10-25'), (2, '2026-10-26', '2026-10-28'), (3, '2026-10-29', '2026-10-31'), (4, '2026-11-01', '2026-11-03'),
  (5, '2026-11-04', '2026-11-07'), (6, '2026-11-08', '2026-11-10'), (7, '2026-11-11', '2026-11-14'), (8, '2026-11-15', '2026-11-17'),
  (9, '2026-11-18', '2026-11-21'), (10, '2026-11-22', '2026-11-24'), (11, '2026-11-25', '2026-11-28')
on conflict (n) do update set desde = excluded.desde, hasta = excluded.hasta;
alter table public.liga_cruces enable row level security;
revoke all on public.liga_cruces from anon, authenticated;
grant select on public.liga_cruces to anon, authenticated;
drop policy if exists "ver cruces" on public.liga_cruces;
create policy "ver cruces" on public.liga_cruces for select to anon, authenticated using (true);

-- Abierto: todavía no empieza el cruce (hora de Chile) y empieza dentro de 7 días
create or replace function public.tsukibet_abierto(p_cruce integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.liga_cruces c where c.n = p_cruce
    and (now() at time zone 'America/Santiago')::date < c.desde
    and c.desde <= (now() at time zone 'America/Santiago')::date + 7);
$$;
grant execute on function public.tsukibet_abierto(integer) to anon, authenticated;

-- ───────── TSUKIBET ─────────
create table if not exists public.tsukibet (
  cruce smallint not null references public.liga_cruces (n),
  perfil_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  equipo_a bigint not null references public.equipos (id) on delete cascade,
  equipo_b bigint not null references public.equipos (id) on delete cascade,
  ganador bigint not null,
  marcador text check (marcador in ('3-0', '2-1')),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  primary key (cruce, perfil_id, equipo_a, equipo_b),
  check (equipo_a < equipo_b),
  check (ganador = equipo_a or ganador = equipo_b)
);
alter table public.tsukibet enable row level security;
revoke all on public.tsukibet from anon, authenticated;
grant select on public.tsukibet to anon, authenticated;
grant insert, update, delete on public.tsukibet to authenticated; -- update completo: el upsert de la web reescribe todas las columnas (las políticas cuidan el resto)
-- Los míos siempre; los de los demás, recién cuando cierra (así nadie copia)
drop policy if exists "ver pronosticos" on public.tsukibet;
create policy "ver pronosticos" on public.tsukibet for select to anon, authenticated
  using (perfil_id = (select auth.uid()) or not public.tsukibet_abierto(cruce));
drop policy if exists "pronosticar" on public.tsukibet;
create policy "pronosticar" on public.tsukibet for insert to authenticated
  with check (perfil_id = (select auth.uid()) and public.tsukibet_abierto(cruce));
drop policy if exists "cambiar pronostico" on public.tsukibet;
create policy "cambiar pronostico" on public.tsukibet for update to authenticated
  using (perfil_id = (select auth.uid()) and public.tsukibet_abierto(cruce)) with check (perfil_id = (select auth.uid()) and public.tsukibet_abierto(cruce));
drop policy if exists "borrar pronostico" on public.tsukibet;
create policy "borrar pronostico" on public.tsukibet for delete to authenticated
  using (perfil_id = (select auth.uid()) and public.tsukibet_abierto(cruce));

-- Cuántas personas ya pronosticaron (se puede ver aunque esté abierto: no revela qué eligieron)
create or replace function public.tsukibet_cuantos(p_cruce integer) returns integer
language sql stable security definer set search_path = '' as $$
  select count(distinct perfil_id)::integer from public.tsukibet where cruce = p_cruce;
$$;
grant execute on function public.tsukibet_cuantos(integer) to anon, authenticated;

-- Avisos: cuando abre (a la campana de todos y al canal de noticias) y 12 horas antes de cerrar (a quien no ha pronosticado)
create or replace function public.tsukibet_avisos() returns void
language plpgsql security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/Santiago')::date; c record;
begin
  select * into c from public.liga_cruces where desde > v_hoy and desde <= v_hoy + 7 order by n limit 1;
  if c.n is null then return; end if;
  if not exists (select 1 from public.avisos_enviados where clave = 'tsukibet-abre-' || c.n) then
    insert into public.avisos_enviados (clave) values ('tsukibet-abre-' || c.n);
    insert into public.avisos (perfil_id, tipo, texto, enlace)
    select id, 'tsukibet', 'TSUKIBET abrió para el cruce ' || c.n || ': pronostica quién gana cada enfrentamiento antes del ' || to_char(c.desde, 'DD/MM') || '.', '#/progreso/tsukibet'
    from public.perfiles;
    perform public.avisar_discord('**TSUKIBET abrió para el cruce ' || c.n || '.** Pronostica quién gana cada enfrentamiento de equipos antes de las 00:00 del ' || to_char(c.desde, 'DD/MM') || '. Acertar contra la mayoría da puntos extra: https://panchoso3234.github.io/sustolimpiadas/#/progreso/tsukibet', 'diario');
  end if;
  if c.desde = v_hoy + 1 and not exists (select 1 from public.avisos_enviados where clave = 'tsukibet-cierra-' || c.n) then
    insert into public.avisos_enviados (clave) values ('tsukibet-cierra-' || c.n);
    insert into public.avisos (perfil_id, tipo, texto, enlace)
    select p.id, 'tsukibet', 'Última llamada: TSUKIBET del cruce ' || c.n || ' cierra esta noche a las 00:00 y todavía no pronosticas.', '#/progreso/tsukibet'
    from public.perfiles p
    where not exists (select 1 from public.tsukibet t where t.cruce = c.n and t.perfil_id = p.id);
  end if;
end; $$;
revoke all on function public.tsukibet_avisos() from public, anon, authenticated;

-- Todos los días a las 12:00 de Chile (15:00 UTC)
select cron.unschedule('tsukibet-avisos') where exists (select 1 from cron.job where jobname = 'tsukibet-avisos');
select cron.schedule('tsukibet-avisos', '0 15 * * *', 'select public.tsukibet_avisos()');

-- ───────── Declaraciones antes del duelo ─────────
create table if not exists public.declaraciones (
  enfrentamiento_id bigint not null references public.enfrentamientos (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 140),
  oculta boolean not null default false,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  primary key (enfrentamiento_id, perfil_id)
);
alter table public.declaraciones enable row level security;
revoke all on public.declaraciones from anon, authenticated;
grant select on public.declaraciones to anon, authenticated;
drop policy if exists "ver declaraciones" on public.declaraciones;
create policy "ver declaraciones" on public.declaraciones for select to anon, authenticated
  using (not oculta or perfil_id = (select auth.uid()) or public.es_admin());

-- Dejar, cambiar o borrar (texto vacío) la frase. Devuelve null si salió bien, o el motivo.
create or replace function public.declarar(p_enf bigint, p_texto text) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.enfrentamientos%rowtype; v_yo uuid := (select auth.uid()); v_rival uuid; v_texto text := btrim(coalesce(p_texto, '')); v_nueva boolean; v_nombre text;
begin
  if v_yo is null then return 'Hay que entrar con Discord.'; end if;
  select * into e from public.enfrentamientos where id = p_enf;
  if not found or e.modo <> '1v1' or e.estado <> 'pendiente' then return 'Este duelo ya no está abierto.'; end if;
  if v_yo = e.a_perfil then v_rival := e.b_perfil; elsif v_yo = e.b_perfil then v_rival := e.a_perfil; else return 'No eres parte de este duelo.'; end if;
  if exists (select 1 from public.enfrentamiento_marcas m where m.enfrentamiento_id = p_enf and m.perfil_id = v_yo) then return 'Ya empezaste a jugar: tu declaración quedó como estaba.'; end if;
  if v_texto = '' then delete from public.declaraciones where enfrentamiento_id = p_enf and perfil_id = v_yo; return null; end if;
  if char_length(v_texto) > 140 then return 'Máximo 140 caracteres.'; end if;
  if v_texto ~* '(conchetumare|conchatumare|ctm|culia[od]|hijo de puta|maric[oó]n|weon culiao)' then return 'Esa frase no pasa el filtro. Picante sí, ofensivo no.'; end if;
  v_nueva := not exists (select 1 from public.declaraciones where enfrentamiento_id = p_enf and perfil_id = v_yo);
  insert into public.declaraciones (enfrentamiento_id, perfil_id, texto) values (p_enf, v_yo, v_texto)
  on conflict (enfrentamiento_id, perfil_id) do update set texto = excluded.texto, actualizado = now();
  -- La primera vez, a tu rival le llega a la campana
  if v_nueva and v_rival is not null then
    select nombre into v_nombre from public.perfiles where id = v_yo;
    insert into public.avisos (perfil_id, de, tipo, enfrentamiento_id, texto, enlace)
    values (v_rival, v_yo, 'declaracion', p_enf, left(coalesce(v_nombre, 'Tu rival') || ' dejó una declaración antes de su duelo: «' || v_texto || '»', 300), '#/juegos/1v1');
  end if;
  return null;
end; $$;
revoke all on function public.declarar(bigint, text) from public, anon;
grant execute on function public.declarar(bigint, text) to authenticated;

-- Moderación: la organización oculta o vuelve a mostrar una frase
create or replace function public.ocultar_declaracion(p_enf bigint, p_perfil uuid, p_oculta boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo la organización puede moderar'; end if;
  update public.declaraciones set oculta = p_oculta where enfrentamiento_id = p_enf and perfil_id = p_perfil;
end; $$;
revoke all on function public.ocultar_declaracion(bigint, uuid, boolean) from public, anon;
grant execute on function public.ocultar_declaracion(bigint, uuid, boolean) to authenticated;

-- ───────── Aviso de lanzamiento (una sola vez por persona) y apertura del próximo cruce ─────────
insert into public.avisos (perfil_id, tipo, texto, enlace)
select p.id, 'declaraciones-nuevo', 'Nuevo: antes de cada duelo puedes dejar tu declaración (140 caracteres). Tu rival la ve y La Cuarta la cita.', '#/juegos/1v1'
from public.perfiles p
where not exists (select 1 from public.avisos a where a.perfil_id = p.id and a.tipo = 'declaraciones-nuevo');
select public.tsukibet_avisos();

-- Comprobación
select 'cruces' as tsukibet, (select count(*) from public.liga_cruces) = 11 as ok
union all select 'tabla tsukibet', to_regclass('public.tsukibet') is not null
union all select 'declaraciones', to_regclass('public.declaraciones') is not null
union all select 'cruce abierto', exists (select 1 from public.liga_cruces c where public.tsukibet_abierto(c.n));
