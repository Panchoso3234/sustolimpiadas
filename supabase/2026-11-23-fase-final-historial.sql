-- Las Sustolimpiadas · 23-nov · Historial de la FASE FINAL (pedido de Pancho): cada simulación oficial guarda su relato
-- completo (etapas, eventos, muertes, cañonazos, paracaídas y podio) al confirmarla en el panel. Lo ven todos en
-- FASE FINAL → Historial. Ejecutar UNA vez (se puede repetir sin daño). El ensayo no guarda nada.

alter table public.ff_sims add column if not exists historial jsonb;

create or replace function public.ff_guardar_historial(p_sim smallint, p_historial jsonb) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then return 'Solo la organización guarda el historial.'; end if;
  if p_historial is null or jsonb_typeof(p_historial) <> 'object' then return 'Historial vacío.'; end if;
  if pg_column_size(p_historial) > 1000000 then return 'El historial es demasiado grande.'; end if;
  update public.ff_sims set historial = p_historial where n = p_sim and resultado is not null;
  if not found then return 'Esa simulación todavía no tiene resultado.'; end if;
  return null;
end; $$;
revoke all on function public.ff_guardar_historial(smallint, jsonb) from public, anon;
grant execute on function public.ff_guardar_historial(smallint, jsonb) to authenticated;

-- Comprobación: debe salir la columna «historial»
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ff_sims' and column_name = 'historial';
