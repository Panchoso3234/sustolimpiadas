-- Las Sustolimpiadas · 16 de noviembre · Los que dejan un equipo siguen sumando para él (EX-MIEMBROS en la base)
-- Problema: la web ya sabía que los duelos jugados por Chima (Umamigos) y GiyuuSilly (Equipo 11) siguen sumando para
-- su equipo, pero la base no: la tabla del bot, la cuenta regresiva, el sorteo de Wild Cards, los clasificados a la
-- final y La Cuarta les quitaban esos puntos (Umamigos aparecía muy abajo).
-- Ahora la base tiene su propia lista (ex_miembros) y puntos_liga la usa. No cambia ningún resultado: solo asigna
-- esos puntos al equipo correcto. Se puede ejecutar más de una vez.

begin;

create table if not exists public.ex_miembros (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  equipo_id bigint not null references public.equipos (id) on delete cascade,
  desde date not null default ((now() at time zone 'America/Santiago')::date)
);
alter table public.ex_miembros enable row level security;
drop policy if exists "ex_miembros visibles" on public.ex_miembros;
create policy "ex_miembros visibles" on public.ex_miembros for select using (true);
grant select on public.ex_miembros to anon, authenticated;

-- Los mismos de src/juegos/duelos.ts (EX_MIEMBROS)
insert into public.ex_miembros (perfil_id, equipo_id, desde) values
  ('70a6d0e3-66a9-4e1b-946c-971f9582510e', 35, '2026-10-29'),  -- GiyuuSilly, Equipo 11 (lo reemplaza Argyrus)
  ('66ba9fcc-69fe-4ab4-b86b-a07459cc89ac', 26, '2026-11-13')   -- Chima, Umamigos (lo reemplaza Zerok)
on conflict (perfil_id) do update set equipo_id = excluded.equipo_id, desde = excluded.desde;

-- El equipo de una persona para contar puntos: el actual o, si se retiró, el que tenía
create or replace function public.equipo_puntos(p_perfil uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((select m.equipo_id from public.equipo_miembros m where m.perfil_id = p_perfil),
                  (select x.equipo_id from public.ex_miembros x where x.perfil_id = p_perfil));
$$;
revoke all on function public.equipo_puntos(uuid) from public, anon, authenticated;

-- puntos_liga (igual que en 2026-11-11-wild-cards.sql) con el equipo de cada persona por equipo_puntos
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
    select d.*, l.lado, l.perfil, public.equipo_puntos(l.perfil) as eq
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
    select x.cruce, x.perfil_id as perfil, public.equipo_puntos(x.perfil_id) as eq, x.equipo_rival,
      coalesce((p.v -> 'multiplicadores' ->> (x.jornada - 1))::numeric, 1) as mult, p.v
    from public.ausencias x, p
    where (p_hasta is null or x.cruce <= p_hasta) and public.equipo_puntos(x.perfil_id) is not null
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
  select null, eq, pts, 0, true from bonos
  union all
  select null, w.equipo_id, w.puntos, 0, true from public.wc_ajustes w where p_hasta is null or w.cruce <= p_hasta;
$$;
revoke all on function public.puntos_liga(smallint) from public, anon, authenticated;

commit;

-- Comprobación (no publica nada): la tabla de la base, que ahora debe coincidir con la Tabla oficial de la web
select t.pos, t.nombre, public.pts(t.puntos) as puntos from public.tabla_equipos() t order by t.pos;
