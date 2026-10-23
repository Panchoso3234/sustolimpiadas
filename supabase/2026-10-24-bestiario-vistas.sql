-- Bestiario: las criaturas que cada persona ha visto (para que el Bestiario viaje con la cuenta y no solo con el navegador).
-- Cada uno solo puede leer y escribir la suya. Ejecutar una vez en el editor SQL de Supabase.
create table if not exists public.bestiario_vistas (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  vistas smallint[] not null default '{}' check (array_length(vistas, 1) is null or array_length(vistas, 1) <= 60),
  actualizado timestamptz not null default now()
);
alter table public.bestiario_vistas enable row level security;
revoke all on public.bestiario_vistas from anon, authenticated;
grant select, insert, update on public.bestiario_vistas to authenticated;
drop policy if exists "ver el propio bestiario" on public.bestiario_vistas;
create policy "ver el propio bestiario" on public.bestiario_vistas for select to authenticated using (perfil_id = (select auth.uid()));
drop policy if exists "crear el propio bestiario" on public.bestiario_vistas;
create policy "crear el propio bestiario" on public.bestiario_vistas for insert to authenticated with check (perfil_id = (select auth.uid()));
drop policy if exists "editar el propio bestiario" on public.bestiario_vistas;
create policy "editar el propio bestiario" on public.bestiario_vistas for update to authenticated using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));
