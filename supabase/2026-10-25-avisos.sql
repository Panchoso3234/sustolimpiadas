-- Las Sustolimpiadas · 25 de octubre: avisos personales en la web (la campana) y "Avisar a mi rival".
--  · Tabla `avisos`: cada persona ve solo los suyos; llegan al instante (tiempo real).
--  · avisar_rival(duelo): quien juega un duelo pendiente le avisa a su rival que lo espera en vivo. Le llega en la campana
--    y en Discord (canal en-vivo, con mención). Una vez cada 10 minutos por duelo y persona.
--  · rondas_jugadas(duelo): qué rondas terminó cada lado (sin puntajes), para que la sala en vivo sepa qué ronda toca.
-- Se puede volver a ejecutar sin problema: no publica nada por sí solo.

create table if not exists public.avisos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles (id) on delete cascade, -- a quién le llega
  de uuid references public.perfiles (id) on delete set null,               -- quién lo mandó (si fue una persona)
  tipo text not null check (char_length(tipo) between 1 and 30),
  enfrentamiento_id bigint references public.enfrentamientos (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 300),
  enlace text check (enlace is null or char_length(enlace) <= 200),
  leido boolean not null default false,
  creado timestamptz not null default now()
);
create index if not exists avisos_por_persona on public.avisos (perfil_id, creado desc);
alter table public.avisos enable row level security;
revoke all on public.avisos from anon, authenticated;
grant select, update (leido) on public.avisos to authenticated;
drop policy if exists "mis avisos" on public.avisos;
create policy "mis avisos" on public.avisos for select to authenticated using (perfil_id = (select auth.uid()));
drop policy if exists "marcar mis avisos" on public.avisos;
create policy "marcar mis avisos" on public.avisos for update to authenticated using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));

-- Que los avisos lleguen al instante (tiempo real de Supabase)
do $$ begin
  alter publication supabase_realtime add table public.avisos;
exception when duplicate_object or undefined_object then null; end $$;

create or replace function public.avisar_rival(p_enf bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.enfrentamientos%rowtype; v_yo uuid := (select auth.uid()); v_rival uuid; v_ultimo timestamptz; v_enlace text;
begin
  if v_yo is null then return 'Hay que entrar con Discord.'; end if;
  select * into e from public.enfrentamientos where id = p_enf;
  if not found or e.estado <> 'pendiente' or e.modo <> '1v1' then return 'Este duelo ya no está abierto.'; end if;
  if v_yo = e.a_perfil then v_rival := e.b_perfil; elsif v_yo = e.b_perfil then v_rival := e.a_perfil; else return 'No eres parte de este duelo.'; end if;
  select max(creado) into v_ultimo from public.avisos where tipo = 'vivo' and de = v_yo and enfrentamiento_id = p_enf;
  if v_ultimo is not null and v_ultimo > now() - interval '10 minutes' then
    return format('Ya le avisaste hace poco. Puedes volver a avisar en %s min.', ceil(extract(epoch from (v_ultimo + interval '10 minutes' - now())) / 60));
  end if;
  v_enlace := '#/juegos/vivo/enf-' || p_enf;
  insert into public.avisos (perfil_id, de, tipo, enfrentamiento_id, texto, enlace)
    values (v_rival, v_yo, 'vivo', p_enf, format('%s te espera en vivo para su duelo de %s', coalesce((select nombre from public.perfiles where id = v_yo), 'Tu rival'), public.nombre_juego(e.juego)), v_enlace);
  perform public.avisar_discord(format('%s, %s te espera en vivo para su duelo de **%s**. Entra aquí: https://panchoso3234.github.io/sustolimpiadas/%s',
    public.mencion(v_rival), public.mencion(v_yo), public.nombre_juego(e.juego), v_enlace), 'en-vivo');
  return '';
end; $$;
revoke all on function public.avisar_rival(bigint) from public, anon;
grant execute on function public.avisar_rival(bigint) to authenticated;

-- Qué rondas terminó cada lado de un duelo (sin puntajes): solo para los dos que lo juegan
create or replace function public.rondas_jugadas(p_enf bigint) returns table (lado text, ronda smallint)
language sql stable security definer set search_path = '' as $$
  select m.lado, m.ronda from public.enfrentamiento_marcas m join public.enfrentamientos e on e.id = m.enfrentamiento_id
  where m.enfrentamiento_id = p_enf and m.terminado and (select auth.uid()) in (e.a_perfil, e.b_perfil);
$$;
revoke all on function public.rondas_jugadas(bigint) from public, anon;
grant execute on function public.rondas_jugadas(bigint) to authenticated;

-- También a la campana: la muerte súbita les avisa a los dos que les toca una ronda extra
create or replace function public.aviso_muerte_subita_web() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.rondas <= old.rondas or new.muerte_subita <= old.muerte_subita or new.estado <> 'pendiente' then return new; end if;
  insert into public.avisos (perfil_id, tipo, enfrentamiento_id, texto, enlace)
  select p, 'muerte_subita', new.id, format('Muerte súbita en %s: quedaron iguales, se juega una ronda extra', public.nombre_juego(new.juego)), '#/juegos/duelo/' || new.id
  from unnest(array[new.a_perfil, new.b_perfil]) p where p is not null;
  return new;
end; $$;
drop trigger if exists aviso_muerte_subita_web on public.enfrentamientos;
create trigger aviso_muerte_subita_web after update on public.enfrentamientos for each row execute function public.aviso_muerte_subita_web();
