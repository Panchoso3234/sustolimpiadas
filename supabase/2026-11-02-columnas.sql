-- Las Sustolimpiadas · 2 de noviembre · La columna de Claudio Palma (una por cruce).
-- Se guarda como borrador; la organización la lee y la aprueba, y recién ahí se publica: en ¡El Diario! (junto a la
-- edición de La Cuarta del mismo cruce), en Discord por el webhook propio de Claudio (un solo recuadro, sin cortar el texto) y con
-- un aviso a todos en la campana. Ejecutar UNA vez.

create table if not exists public.columnas (
  cruce smallint primary key,
  texto text not null check (char_length(texto) between 200 and 4000),
  estado text not null default 'borrador' check (estado in ('borrador', 'publicada')),
  creado timestamptz not null default now(),
  publicada timestamptz
);
alter table public.columnas enable row level security;
revoke all on public.columnas from anon, authenticated;
grant select on public.columnas to anon, authenticated;
drop policy if exists "ver columnas" on public.columnas;
create policy "ver columnas" on public.columnas for select to anon, authenticated
  using (estado = 'publicada' or public.es_admin());

-- Publicar: solo la organización (o desde el SQL Editor). Devuelve null si salió bien, o el motivo.
create or replace function public.publicar_columna(p_cruce smallint) returns text
language plpgsql security definer set search_path = '' as $$
declare v_texto text; v_estado text; v_url text;
begin
  if (select auth.uid()) is not null and not public.es_admin() then return 'Solo la organización publica la columna.'; end if;
  select texto, estado into v_texto, v_estado from public.columnas where cruce = p_cruce;
  if v_texto is null then return 'No hay columna para ese cruce.'; end if;
  if v_estado = 'publicada' then return 'Esa columna ya estaba publicada.'; end if;
  update public.columnas set estado = 'publicada', publicada = now() where cruce = p_cruce;
  -- Discord: un recuadro (embed) admite 4.096 caracteres; varios mensajes podrían llegar desordenados
  -- Solo por el webhook propio de Claudio (su nombre y su foto); nunca por el del diario
  select valor into v_url from public.secretos where clave = 'discord_webhook_columna';
  if v_url like 'https://discord.com/api/webhooks/%' then
    -- El nombre y la foto los pone el webhook (se configuran en Discord); aquí va el recuadro con estilo de La Cuarta
    perform net.http_post(url := v_url, body := jsonb_build_object(
      'content', '**Salió la columna del cruce ' || p_cruce || '.** De esta tribuna no se salva nadie.',
      'allowed_mentions', jsonb_build_object('parse', jsonb_build_array()),
      'embeds', jsonb_build_array(jsonb_build_object(
        'author', jsonb_build_object('name', 'OPINIÓN · Claudio Palma, columnista de la casa'),
        'title', 'Desde la tribuna · cruce ' || p_cruce,
        'url', 'https://panchoso3234.github.io/sustolimpiadas/#/diario/' || p_cruce,
        'description', left(v_texto, 4000),
        'color', 16750126,
        'footer', jsonb_build_object('text', 'Las Sustolimpiadas · ¡El Diario! · Las opiniones de Claudio no representan a la organización. Bueno, a veces sí.'),
        'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))));
  end if;
  if v_url is null or v_url not like 'https://discord.com/api/webhooks/%' then
    v_estado := 'Publicada en la web, pero no salió a Discord: falta el secreto discord_webhook_columna.';
  else v_estado := null; end if;
  insert into public.avisos (perfil_id, tipo, texto, enlace)
  select p.id, 'columna-' || p_cruce, 'Salió la columna de Claudio Palma sobre el cruce ' || p_cruce || '. De esa tribuna no se salva nadie.', '#/diario/' || p_cruce
  from public.perfiles p
  where not exists (select 1 from public.avisos a where a.perfil_id = p.id and a.tipo = 'columna-' || p_cruce);
  return v_estado;
end; $$;
revoke all on function public.publicar_columna(smallint) from public, anon;
grant execute on function public.publicar_columna(smallint) to authenticated;

-- Comprobación
select to_regclass('public.columnas') as tabla, to_regprocedure('public.publicar_columna(smallint)') as funcion;
