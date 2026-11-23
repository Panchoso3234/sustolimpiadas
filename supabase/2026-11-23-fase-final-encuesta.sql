-- Las Sustolimpiadas · 23-nov · Encuesta de la FASE FINAL (pedido de Pancho).
-- 3 preguntas (lo mejor, lo peor, qué agregarías). Premio: 5 multis = 50 deseos, una vez por persona.
-- Se responde en la pestaña FASE FINAL, abierta para todos desde ya. Ejecutar UNA vez (se puede repetir sin daño).

create table if not exists public.ff_encuesta (
  perfil_id uuid primary key default auth.uid() references public.perfiles (id) on delete cascade,
  mejor text not null check (char_length(mejor) between 1 and 500),
  peor text not null check (char_length(peor) between 1 and 500),
  agregar text not null check (char_length(agregar) between 1 and 500),
  creado timestamptz not null default now()
);
alter table public.ff_encuesta enable row level security;
-- Cada uno ve solo su respuesta (para saber si ya respondió); se escribe solo por la función
drop policy if exists ff_encuesta_mia on public.ff_encuesta;
create policy ff_encuesta_mia on public.ff_encuesta for select to authenticated using (perfil_id = (select auth.uid()));

create or replace function public.ff_responder_encuesta(p_mejor text, p_peor text, p_agregar text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_yo uuid := (select auth.uid());
begin
  if v_yo is null then return 'Entra con Discord para responder.'; end if;
  p_mejor := btrim(coalesce(p_mejor, '')); p_peor := btrim(coalesce(p_peor, '')); p_agregar := btrim(coalesce(p_agregar, ''));
  if p_mejor = '' or p_peor = '' or p_agregar = '' then return 'Responde las 3 preguntas.'; end if;
  if greatest(char_length(p_mejor), char_length(p_peor), char_length(p_agregar)) > 500 then return 'Máximo 500 letras por respuesta.'; end if;
  insert into public.ff_encuesta (perfil_id, mejor, peor, agregar) values (v_yo, p_mejor, p_peor, p_agregar)
  on conflict (perfil_id) do nothing;
  if not found then return 'Ya respondiste la encuesta. ¡Gracias!'; end if;
  insert into public.gacha_movimientos (perfil_id, motivo, deseos) values (v_yo, 'ff-encuesta', 50)
  on conflict (perfil_id, motivo) do nothing;
  return null;
end; $$;
revoke all on function public.ff_responder_encuesta(text, text, text) from public, anon;
grant execute on function public.ff_responder_encuesta(text, text, text) to authenticated;

-- Comprobación
select count(*) as respuestas from public.ff_encuesta;

-- Para leer las respuestas después de la gala:
-- select p.nombre, e.mejor, e.peor, e.agregar, e.creado from public.ff_encuesta e join public.perfiles p on p.id = e.perfil_id order by e.creado;
