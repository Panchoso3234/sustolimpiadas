-- Las Sustolimpiadas · 1 de noviembre · Mediciones de En vivo (Fase 0 del plan de mejora).
-- Cada jugador guarda una fila por partida en vivo: tipo de conexión, ping, cuadros por segundo, fotos del rival
-- recibidas por segundo, cortes y si terminó en vivo. Solo el organizador puede leerlas. Se puede volver a ejecutar.

create table if not exists public.vivo_metricas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  codigo text not null check (char_length(codigo) <= 60),
  juego text not null check (char_length(juego) <= 30),
  formato text not null check (formato in ('dividida', 'turnos', 'mundo')),
  oficial boolean not null default false,
  partida smallint not null default 1 check (partida between 1 and 20),
  conexion text not null check (conexion in ('directa', 'respaldo', 'mixta', 'sin datos')),
  rtt_medio integer not null default 0 check (rtt_medio between 0 and 60000),
  rtt_max integer not null default 0 check (rtt_max between 0 and 60000),
  fps_medio integer not null default 0 check (fps_medio between 0 and 1000),
  fotos_por_seg numeric not null default 0 check (fotos_por_seg between 0 and 100),
  cortes smallint not null default 0 check (cortes between 0 and 1000),
  termino_en_vivo boolean not null default false,
  segundos integer not null default 0 check (segundos between 0 and 36000),
  creado timestamptz not null default now()
);
alter table public.vivo_metricas enable row level security;
drop policy if exists vivo_metricas_insertar on public.vivo_metricas;
create policy vivo_metricas_insertar on public.vivo_metricas for insert to authenticated with check (perfil_id = auth.uid());
drop policy if exists vivo_metricas_leer on public.vivo_metricas;
create policy vivo_metricas_leer on public.vivo_metricas for select to authenticated using (public.es_admin());
grant insert on public.vivo_metricas to authenticated;
grant select on public.vivo_metricas to authenticated;

-- Resumen para el organizador (correrlo cuando quieras ver cómo va En vivo)
-- select juego, count(*) as partidas,
--        round(100.0 * count(*) filter (where conexion = 'directa') / count(*)) as pct_directa,
--        round(avg(rtt_medio)) as ping, round(avg(fps_medio)) as fps, round(avg(fotos_por_seg), 1) as fotos_seg,
--        round(100.0 * count(*) filter (where termino_en_vivo) / count(*)) as pct_terminan
-- from public.vivo_metricas where creado > now() - interval '7 days' group by juego order by partidas desc;
