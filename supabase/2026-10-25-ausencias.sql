-- Las Sustolimpiadas · 25 de octubre: victorias por ausencia.
-- Cuando el rival de un cruce nunca entró a la web (sigue "sin cuenta" en su equipo), no se puede crear su duelo. Desde la
-- Mesa de liga el organizador le da la victoria a quien sí estaba: suma lo mismo que ganar un duelo (7 por el multiplicador),
-- cuenta para el bono de cruce y el ausente queda en 0. El bot lo avisa en el canal de resultados.
-- Se puede volver a ejecutar sin problema: no publica nada por sí solo.

create table if not exists public.ausencias (
  id bigint generated always as identity primary key,
  cruce smallint not null check (cruce between 1 and 30),
  jornada smallint not null default 1 check (jornada between 1 and 4),
  perfil_id uuid not null references public.perfiles (id) on delete cascade, -- quien estaba (gana)
  equipo_rival bigint not null references public.equipos (id) on delete cascade, -- el equipo del ausente
  ausente text not null check (char_length(ausente) between 1 and 40), -- nombre de la persona sin cuenta
  creado timestamptz not null default now(),
  unique (cruce, perfil_id)
);
alter table public.ausencias enable row level security;
revoke all on public.ausencias from anon, authenticated;
grant select on public.ausencias to anon, authenticated;
grant insert (cruce, jornada, perfil_id, equipo_rival, ausente), delete on public.ausencias to authenticated;
drop policy if exists "ausencias visibles" on public.ausencias;
create policy "ausencias visibles" on public.ausencias for select using (true);
drop policy if exists "admin da ausencias" on public.ausencias;
create policy "admin da ausencias" on public.ausencias for insert to authenticated with check (public.es_admin());
drop policy if exists "admin quita ausencias" on public.ausencias;
create policy "admin quita ausencias" on public.ausencias for delete to authenticated using (public.es_admin());

-- Aviso del bot al dar una victoria por ausencia
create or replace function public.aviso_ausencia() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_pts numeric;
begin
  select trim_scale(round(coalesce((valor ->> 'victoria')::numeric, 7) * coalesce((valor -> 'multiplicadores' ->> (new.jornada - 1))::numeric, 1), 2)) into v_pts
    from public.ajustes where clave = 'puntos';
  perform public.avisar_discord(format('Cruce %s: %s gana por ausencia a **%s** (%s), que nunca entró a la web. **+%s** para %s (también para %s).',
    new.cruce, public.mencion(new.perfil_id), new.ausente, coalesce((select nombre from public.equipos where id = new.equipo_rival), 'su equipo'),
    coalesce(v_pts, 7), public.mencion(new.perfil_id), coalesce(public.nombre_equipo(new.perfil_id), 'su equipo')), 'resultados');
  return new;
end; $$;
drop trigger if exists aviso_ausencia on public.ausencias;
create trigger aviso_ausencia after insert on public.ausencias for each row execute function public.aviso_ausencia();

-- Puntos de la liga (los mismos que la web), ahora con las victorias por ausencia
create or replace function public.puntos_liga(p_hasta smallint default null)
returns table (perfil uuid, equipo_id bigint, puntos numeric, ganados integer, bono boolean)
language sql stable security definer set search_path = '' as $$
  with p as (select coalesce((select valor from public.ajustes where clave = 'puntos'), '{}'::jsonb) as v),
  d as (
    select e.id, e.cruce, e.ganador, e.no_jugo, e.a_perfil, e.b_perfil,
      coalesce((p.v -> 'multiplicadores' ->> (e.jornada - 1))::numeric, 1) as mult, p.v
    from public.enfrentamientos e, p
    where e.oficial and e.modo = '1v1' and e.estado = 'cerrado' and e.ganador is not null
      and (e.creado at time zone 'America/Santiago')::date >= date '2026-10-21'
      and (p_hasta is null or e.cruce <= p_hasta)
  ),
  lados as (
    select d.*, l.lado, l.perfil, (select m.equipo_id from public.equipo_miembros m where m.perfil_id = l.perfil) as eq
    from d cross join lateral (values ('a', d.a_perfil), ('b', d.b_perfil)) as l(lado, perfil)
  ),
  duelos as (
    select perfil, eq,
      case when no_jugo in (lado, 'ambos') then 0
        when ganador = 'empate' then mult * coalesce((v ->> 'empate')::numeric, 6)
        when ganador = lado then mult * coalesce((v ->> 'victoria')::numeric, 7)
        else mult * coalesce((v ->> 'derrota')::numeric, 4) end as pts,
      (ganador = lado and coalesce(no_jugo, '') not in (lado, 'ambos'))::integer as gano
    from lados
  ),
  aus as (
    select x.cruce, x.perfil_id as perfil, m.equipo_id as eq, x.equipo_rival,
      coalesce((p.v -> 'multiplicadores' ->> (x.jornada - 1))::numeric, 1) as mult, p.v
    from public.ausencias x join public.equipo_miembros m on m.perfil_id = x.perfil_id, p
    where p_hasta is null or x.cruce <= p_hasta
  ),
  pares as (
    select a.cruce, a.mult, least(a.eq, b.eq) as e1, greatest(a.eq, b.eq) as e2, case when a.ganador = 'a' then a.eq else b.eq end as gana
    from lados a join lados b on b.id = a.id and a.lado = 'a' and b.lado = 'b'
    where a.cruce is not null and a.eq is not null and b.eq is not null and a.eq <> b.eq and a.ganador <> 'empate'
    union all
    select cruce, mult, least(eq, equipo_rival), greatest(eq, equipo_rival), eq from aus where eq <> equipo_rival
  ),
  bonos as (select gana as eq, 5 * max(mult) as pts from pares group by cruce, e1, e2, gana having count(*) >= 2)
  select perfil, eq, pts, gano, false from duelos
  union all
  select perfil, eq, mult * coalesce((v ->> 'victoria')::numeric, 7), 1, false from aus
  union all
  select null, eq, pts, 0, true from bonos;
$$;
revoke all on function public.puntos_liga(smallint) from public, anon, authenticated;

-- Resumen del cruce: las victorias por ausencia cuentan en el marcador de cada enfrentamiento
create or replace function public.resumen_cruce(p_cruce smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_enfr text; v_quedan integer; v_corte text; v_ultimo integer := 11; v_lista text;
begin
  with d as (
    select e.ganador, ma.equipo_id as qa, mb.equipo_id as qb
    from public.enfrentamientos e
    join public.equipo_miembros ma on ma.perfil_id = e.a_perfil join public.equipo_miembros mb on mb.perfil_id = e.b_perfil
    where e.oficial and e.modo = '1v1' and e.cruce = p_cruce and e.estado = 'cerrado'
    union all
    select 'a', m.equipo_id, x.equipo_rival from public.ausencias x join public.equipo_miembros m on m.perfil_id = x.perfil_id where x.cruce = p_cruce),
  pares as (
    select least(qa, qb) as e1, greatest(qa, qb) as e2,
      count(*) filter (where (ganador = 'a' and qa = least(qa, qb)) or (ganador = 'b' and qb = least(qa, qb))) as v1,
      count(*) filter (where (ganador = 'a' and qa = greatest(qa, qb)) or (ganador = 'b' and qb = greatest(qa, qb))) as v2
    from d where qa <> qb group by 1, 2)
  select string_agg(format('%s %s - %s %s%s', q1.nombre, v1, v2, q2.nombre,
      case when v1 >= 2 then format(' (bono para %s)', q1.nombre) when v2 >= 2 then format(' (bono para %s)', q2.nombre) else '' end), E'\n' order by q1.nombre)
  into v_enfr
  from pares join public.equipos q1 on q1.id = e1 join public.equipos q2 on q2.id = e2;

  v_quedan := v_ultimo - p_cruce;
  select format('%s está a %s pts del 4.º lugar (%s).', t5.nombre, public.pts(t4.puntos - t5.puntos), t4.nombre) into v_corte
  from public.tabla_equipos() t4 join public.tabla_equipos() t5 on t5.pos = 5 where t4.pos = 4;

  perform public.avisar_discord(format(E'**Cruce %s cerrado**\n%s\n\n**Así queda la tabla**\n%s\n\n%s',
    p_cruce, coalesce(v_enfr, 'Sin enfrentamientos de equipos.'), public.texto_tabla(null, nullif(p_cruce - 1, 0)::smallint),
    case when v_quedan > 0 then format('Quedan %s cruces para la final. %s', v_quedan, coalesce(v_corte, ''))
         else 'Terminó la fase de cruces.' end), 'resultados');

  if p_cruce >= v_ultimo then
    select string_agg(format('%s · %s%s', public.mencion(c.perfil), coalesce(public.nombre_equipo(c.perfil), 'sin equipo'),
        case when c.como = 'especial' then ' (por puntaje personal)' else '' end), E'\n')
      into v_lista from public.clasificados_final() c;
    perform public.avisar_discord(format(E'**Estos son los clasificados a la final**\n%s\n\nFelicidades a todos. Pronto avisamos las fechas de la final.', coalesce(v_lista, 'Todavía no hay clasificados.')), 'tabla');
  end if;
end; $$;
revoke all on function public.resumen_cruce(smallint) from public, anon, authenticated;
