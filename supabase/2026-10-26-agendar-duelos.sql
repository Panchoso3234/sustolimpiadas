-- Las Sustolimpiadas · 26 de octubre: agendar duelos.
--  · Cualquiera de los dos jugadores de un duelo 1v1 pendiente propone una hora (antes de que venza el plazo). Al rival le llega
--    a la campana y a Discord; puede confirmarla o proponer otra. Proponer otra hora borra la confirmación anterior.
--  · 10 minutos antes de la hora, a los dos les llega un recordatorio (campana y Discord, canal en-vivo) con el enlace a la sala.
-- Se puede volver a ejecutar sin problema.

create table if not exists public.agendas (
  enfrentamiento_id bigint primary key references public.enfrentamientos (id) on delete cascade,
  hora timestamptz not null,
  propuso uuid not null references public.perfiles (id) on delete cascade,
  confirmada boolean not null default false,
  recordada boolean not null default false,
  creado timestamptz not null default now()
);
alter table public.agendas enable row level security;
revoke all on public.agendas from anon, authenticated;
grant select on public.agendas to anon, authenticated;
drop policy if exists "agendas visibles" on public.agendas;
create policy "agendas visibles" on public.agendas for select using (true);

-- La hora en palabras, en hora de Chile (por ejemplo "lun 26/10 a las 21:30")
create or replace function public.hora_chile(p timestamptz) returns text language sql stable set search_path = '' as $$
  select (array['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'])[extract(dow from p at time zone 'America/Santiago')::int + 1]
    || ' ' || to_char(p at time zone 'America/Santiago', 'DD/MM') || ' a las ' || to_char(p at time zone 'America/Santiago', 'HH24:MI');
$$;

create or replace function public.agendar_duelo(p_enf bigint, p_hora timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.enfrentamientos%rowtype; v_yo uuid := (select auth.uid()); v_rival uuid; v_fin timestamptz; v_texto text;
begin
  if v_yo is null then return 'Hay que entrar con Discord.'; end if;
  select * into e from public.enfrentamientos where id = p_enf;
  if not found or e.estado <> 'pendiente' or e.modo <> '1v1' then return 'Este duelo ya no está abierto.'; end if;
  if v_yo = e.a_perfil then v_rival := e.b_perfil; elsif v_yo = e.b_perfil then v_rival := e.a_perfil; else return 'No eres parte de este duelo.'; end if;
  if p_hora < now() + interval '15 minutes' then return 'Elige una hora con al menos 15 minutos de anticipación.'; end if;
  v_fin := case when e.plazo is null then now() + interval '14 days' else ((e.plazo + 1)::timestamp at time zone 'America/Santiago') end;
  if p_hora >= v_fin then return 'Esa hora queda después del plazo del duelo.'; end if;
  insert into public.agendas (enfrentamiento_id, hora, propuso, confirmada, recordada) values (p_enf, p_hora, v_yo, false, false)
    on conflict (enfrentamiento_id) do update set hora = excluded.hora, propuso = excluded.propuso, confirmada = false, recordada = false, creado = now();
  v_texto := format('%s propone jugar su duelo de %s el %s', coalesce((select nombre from public.perfiles where id = v_yo), 'Tu rival'), public.nombre_juego(e.juego), public.hora_chile(p_hora));
  insert into public.avisos (perfil_id, de, tipo, enfrentamiento_id, texto, enlace) values (v_rival, v_yo, 'agenda', p_enf, v_texto, '#/juegos/1v1');
  perform public.avisar_discord(format('%s, %s propone jugar su duelo de **%s** el **%s** (hora de Chile). Confírmalo o propón otra hora en Juegos → Versus 1v1: https://panchoso3234.github.io/sustolimpiadas/#/juegos/1v1',
    public.mencion(v_rival), public.mencion(v_yo), public.nombre_juego(e.juego), public.hora_chile(p_hora)), 'en-vivo');
  return '';
end; $$;
revoke all on function public.agendar_duelo(bigint, timestamptz) from public, anon;
grant execute on function public.agendar_duelo(bigint, timestamptz) to authenticated;

create or replace function public.confirmar_agenda(p_enf bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.enfrentamientos%rowtype; a public.agendas%rowtype; v_yo uuid := (select auth.uid());
begin
  if v_yo is null then return 'Hay que entrar con Discord.'; end if;
  select * into e from public.enfrentamientos where id = p_enf;
  select * into a from public.agendas where enfrentamiento_id = p_enf;
  if not found then return 'Ese duelo no tiene hora propuesta.'; end if;
  if e.estado <> 'pendiente' then return 'Este duelo ya no está abierto.'; end if;
  if v_yo not in (e.a_perfil, e.b_perfil) or v_yo = a.propuso then return 'La confirma tu rival, no quien la propuso.'; end if;
  if a.hora < now() then return 'Esa hora ya pasó: propón otra.'; end if;
  update public.agendas set confirmada = true where enfrentamiento_id = p_enf;
  insert into public.avisos (perfil_id, de, tipo, enfrentamiento_id, texto, enlace)
    values (a.propuso, v_yo, 'agenda', p_enf, format('%s confirmó su duelo de %s el %s', coalesce((select nombre from public.perfiles where id = v_yo), 'Tu rival'), public.nombre_juego(e.juego), public.hora_chile(a.hora)), '#/juegos/1v1');
  perform public.avisar_discord(format('Duelo agendado: %s vs %s, **%s**, el **%s** (hora de Chile). 10 minutos antes les llega un recordatorio.',
    public.mencion(e.a_perfil), public.mencion(e.b_perfil), public.nombre_juego(e.juego), public.hora_chile(a.hora)), 'en-vivo');
  return '';
end; $$;
revoke all on function public.confirmar_agenda(bigint) from public, anon;
grant execute on function public.confirmar_agenda(bigint) to authenticated;

-- Cada 5 minutos: recordatorio a los dos jugadores cuando faltan 10 minutos o menos (una sola vez por agenda)
create or replace function public.recordar_agendas() returns void
language plpgsql security definer set search_path = '' as $$
declare a record; v_enlace text;
begin
  for a in
    select g.enfrentamiento_id, g.hora, g.confirmada, e.a_perfil, e.b_perfil, e.juego
      from public.agendas g join public.enfrentamientos e on e.id = g.enfrentamiento_id
     where not g.recordada and e.estado = 'pendiente' and g.hora between now() and now() + interval '12 minutes'
  loop
    update public.agendas set recordada = true where enfrentamiento_id = a.enfrentamiento_id;
    v_enlace := '#/juegos/vivo/enf-' || a.enfrentamiento_id;
    insert into public.avisos (perfil_id, tipo, enfrentamiento_id, texto, enlace)
      select p, 'agenda', a.enfrentamiento_id, format('En 10 minutos: tu duelo de %s (%s)', public.nombre_juego(a.juego), to_char(a.hora at time zone 'America/Santiago', 'HH24:MI')), v_enlace
        from unnest(array[a.a_perfil, a.b_perfil]) as p;
    perform public.avisar_discord(format('%s y %s: su duelo de **%s** es a las **%s**%s. Entren a la sala: https://panchoso3234.github.io/sustolimpiadas/%s',
      public.mencion(a.a_perfil), public.mencion(a.b_perfil), public.nombre_juego(a.juego), to_char(a.hora at time zone 'America/Santiago', 'HH24:MI'),
      case when a.confirmada then '' else ' (la hora no se alcanzó a confirmar)' end, v_enlace), 'en-vivo');
  end loop;
end; $$;
revoke all on function public.recordar_agendas() from public, anon, authenticated;

select cron.unschedule('recordar-agendas') where exists (select 1 from cron.job where jobname = 'recordar-agendas');
select cron.schedule('recordar-agendas', '*/5 * * * *', 'select public.recordar_agendas()');
