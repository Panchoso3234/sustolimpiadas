-- Las Sustolimpiadas · etapa 5: participantes que todavía no entran al sitio (21 de octubre)
-- En el sorteo se puede agregar a alguien solo con su nombre. Queda en su equipo como "pendiente" hasta que entre con
-- Discord; entonces el organizador lo vincula con su cuenta (pestaña Equipos) y pasa a ser integrante de verdad.
-- Mientras esté pendiente no puede tener duelos (los duelos necesitan una cuenta). Se ejecuta una vez en el SQL Editor.

create table if not exists public.equipo_pendientes (
  id bigint generated always as identity primary key,
  equipo_id bigint not null references public.equipos (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 40),
  es_capitan boolean not null default false,
  creado timestamptz not null default now()
);
alter table public.equipo_pendientes enable row level security;
revoke all on public.equipo_pendientes from anon, authenticated;
grant select on public.equipo_pendientes to anon, authenticated;
grant insert (equipo_id, nombre, es_capitan), update (equipo_id, nombre, es_capitan), delete on public.equipo_pendientes to authenticated;
drop policy if exists "pendientes visibles" on public.equipo_pendientes;
create policy "pendientes visibles" on public.equipo_pendientes for select using (true);
drop policy if exists "admin agrega pendientes" on public.equipo_pendientes;
create policy "admin agrega pendientes" on public.equipo_pendientes for insert to authenticated with check (public.es_admin());
drop policy if exists "admin edita pendientes" on public.equipo_pendientes;
create policy "admin edita pendientes" on public.equipo_pendientes for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "admin borra pendientes" on public.equipo_pendientes;
create policy "admin borra pendientes" on public.equipo_pendientes for delete to authenticated using (public.es_admin());

-- Vincular: la cuenta toma el lugar del pendiente en su equipo (y la capitanía, si la tenía)
create or replace function public.vincular_pendiente(p_pendiente bigint, p_perfil uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.equipo_pendientes%rowtype;
begin
  if not public.es_admin() then return 'Solo el organizador.'; end if;
  select * into v from public.equipo_pendientes where id = p_pendiente;
  if not found then return 'Ese pendiente ya no existe.'; end if;
  if not exists (select 1 from public.perfiles where id = p_perfil) then return 'Esa cuenta no existe.'; end if;
  insert into public.equipo_miembros (perfil_id, equipo_id) values (p_perfil, v.equipo_id)
    on conflict (perfil_id) do update set equipo_id = excluded.equipo_id;
  if v.es_capitan then update public.equipos set capitan = p_perfil where id = v.equipo_id; end if;
  delete from public.equipo_pendientes where id = p_pendiente;
  return '';
end; $$;
revoke execute on function public.vincular_pendiente(bigint, uuid) from public, anon;
grant execute on function public.vincular_pendiente(bigint, uuid) to authenticated;
