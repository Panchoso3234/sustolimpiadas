-- Las Sustolimpiadas · 27 de octubre · La Cuarta (el diario del torneo).
-- Al terminar cada cruce (cuando ya no queda ningún duelo pendiente), la base llama a la función "diario" de Supabase:
-- redacta la edición, dibuja las portadas, las guarda en el bucket público "diario", deja la edición en la web
-- (pestaña Diario) y la publica en el canal del Diario de Discord. Desde la Mesa se puede generar un borrador o publicar a mano.
-- Antes: guardar el webhook del canal de noticias en secretos (discord_webhook_diario). La función se puede desplegar
-- después (npx supabase functions deploy diario --no-verify-jwt --project-ref glkoujvomcnpqdpakbxa). Se puede volver a ejecutar sin problema.

-- ───────── Ediciones ─────────
create table if not exists public.diario_ediciones (
  cruce smallint primary key check (cruce between 1 and 30),
  numero smallint not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'publicado')),
  contenido jsonb not null,
  imagenes text[] not null default '{}',
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  publicado timestamptz
);
alter table public.diario_ediciones enable row level security;
revoke all on public.diario_ediciones from anon, authenticated;
grant select on public.diario_ediciones to anon, authenticated;
drop policy if exists "diario publicado" on public.diario_ediciones;
create policy "diario publicado" on public.diario_ediciones for select to anon, authenticated using (estado = 'publicado' or public.es_admin());

-- ───────── Reacciones de los lectores (para la mejora continua): una por persona y edición ─────────
create table if not exists public.diario_votos (
  cruce smallint not null references public.diario_ediciones (cruce) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade default auth.uid(),
  voto text not null check (voto in ('buena', 'polemica', 'numeros', 'floja')),
  creado timestamptz not null default now(),
  primary key (cruce, perfil_id)
);
alter table public.diario_votos enable row level security;
revoke all on public.diario_votos from anon, authenticated;
grant select on public.diario_votos to anon, authenticated;
grant insert, update on public.diario_votos to authenticated;
drop policy if exists "ver votos" on public.diario_votos;
create policy "ver votos" on public.diario_votos for select to anon, authenticated using (true);
drop policy if exists "mi voto" on public.diario_votos;
create policy "mi voto" on public.diario_votos for insert to authenticated with check (perfil_id = auth.uid());
drop policy if exists "cambiar mi voto" on public.diario_votos;
create policy "cambiar mi voto" on public.diario_votos for update to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- ───────── Imágenes: bucket público ─────────
insert into storage.buckets (id, name, public) values ('diario', 'diario', true) on conflict (id) do update set public = true;

-- ───────── La clave con que la base llama a la función (nadie más la conoce) ─────────
insert into public.secretos (clave, valor) values ('diario_clave', md5(gen_random_uuid()::text || clock_timestamp()::text)) on conflict (clave) do nothing;

-- ───────── Pedir una edición (la usa el cron y, desde la Mesa, solo el admin) ─────────
create or replace function public.diario_llamar(p_cruce integer, p_publicar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_clave text;
begin
  select valor into v_clave from public.secretos where clave = 'diario_clave';
  if v_clave is null then return; end if;
  perform net.http_post(
    url := 'https://glkoujvomcnpqdpakbxa.supabase.co/functions/v1/diario',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-diario-clave', v_clave),
    body := jsonb_build_object('cruce', p_cruce, 'publicar', p_publicar),
    timeout_milliseconds := 120000);
end; $$;
revoke all on function public.diario_llamar(integer, boolean) from public, anon, authenticated;

create or replace function public.pedir_diario(p_cruce integer, p_publicar boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo la organización puede pedir el Diario'; end if;
  perform public.diario_llamar(p_cruce, p_publicar);
end; $$;
revoke all on function public.pedir_diario(integer, boolean) from public, anon;
grant execute on function public.pedir_diario(integer, boolean) to authenticated;

-- ───────── Automático: el cruce que recién terminó (sin duelos pendientes) y todavía no tiene edición publicada ─────────
-- Solo mira cruces cuyo plazo venció en los últimos 3 días: no publica de golpe cruces viejos.
create or replace function public.diario_automatico() returns void
language plpgsql security definer set search_path = '' as $$
declare v_cruce integer;
begin
  select e.cruce into v_cruce
  from public.enfrentamientos e
  where e.oficial and e.modo = '1v1' and e.cruce is not null
  group by e.cruce
  having bool_and(e.estado <> 'pendiente') and max(e.plazo) >= ((now() at time zone 'America/Santiago')::date - 3)
     and not exists (select 1 from public.diario_ediciones d where d.cruce = e.cruce and d.estado = 'publicado')
  order by e.cruce
  limit 1;
  if v_cruce is not null then perform public.diario_llamar(v_cruce, true); end if;
end; $$;
revoke all on function public.diario_automatico() from public, anon, authenticated;

-- Todos los días a las 00:20 de Chile (03:20 UTC), después de que se cierran los duelos vencidos (00:05)
select cron.unschedule('diario-cruces') where exists (select 1 from cron.job where jobname = 'diario-cruces');
select cron.schedule('diario-cruces', '20 3 * * *', 'select public.diario_automatico()');

-- ───────── Aviso de lanzamiento en la campana de todas las cuentas (una sola vez por persona) ─────────
insert into public.avisos (perfil_id, tipo, texto, enlace)
select p.id, 'diario-nuevo', 'Nueva sección ¡El Diario!: La Cuarta te contará todas las noticias del torneo, jornada por jornada.', '#/diario'
from public.perfiles p
where not exists (select 1 from public.avisos a where a.perfil_id = p.id and a.tipo = 'diario-nuevo');

-- Comprobación
select 'clave lista' as diario, exists (select 1 from public.secretos where clave = 'diario_clave') as ok
union all select 'webhook del canal', exists (select 1 from public.secretos where clave = 'discord_webhook_diario')
union all select 'bucket', exists (select 1 from storage.buckets where id = 'diario');
