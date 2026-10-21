-- Las Sustolimpiadas · etapa 4: el organizador puede borrar una cuenta inscrita (21 de octubre)
-- Borra la cuenta de inicio de sesión y, en cascada, su perfil, personaje, marcas, equipo, vitrina, predicciones y los
-- duelos donde jugaba. Si la persona vuelve a entrar con Discord, se le crea una cuenta nueva desde cero.
-- No se puede borrar la propia cuenta ni la de otro organizador. Se ejecuta una vez en Supabase → SQL Editor.

create or replace function public.borrar_cuenta(p_uid uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then return 'Solo el organizador puede borrar cuentas.'; end if;
  if p_uid = (select auth.uid()) then return 'No puedes borrar tu propia cuenta.'; end if;
  if exists (select 1 from public.perfiles where id = p_uid and rol = 'admin') then return 'No se puede borrar la cuenta de otro organizador.'; end if;
  delete from auth.users where id = p_uid;
  if not found then delete from public.perfiles where id = p_uid; end if; -- por si solo quedaba el perfil
  return '';
end; $$;
revoke execute on function public.borrar_cuenta(uuid) from public, anon;
grant execute on function public.borrar_cuenta(uuid) to authenticated;
