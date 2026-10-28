-- Las Sustolimpiadas · 27 de octubre · Gachapón (modelo Hoyoverse). Archivo armado por pruebas/gachapon-sql.mjs: no editar a mano.
-- Seguridad: nadie escribe directo en estas tablas. Las protogemas y deseos entran solo por la función "gachapon"
-- (servidor, con su propia llave) y cada recompensa tiene un motivo único: no se puede cobrar dos veces.
-- Las tiradas, canjes y equipar pasan por funciones de la base que revisan el saldo y el inventario. El azar es del servidor.
-- Se puede volver a ejecutar sin problema.

-- ───────── Marcas: freno a las partidas en ráfaga (la experiencia del pase sale de ellas) ─────────
-- Mínimo 3 segundos entre dos partidas guardadas de la misma persona y máximo 150 al día (el récord real es 86).
create or replace function public.marcas_freno() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.marcas m where m.perfil_id = new.perfil_id and m.creado > now() - interval '3 seconds') then
    raise exception 'Demasiado rápido: espera unos segundos entre partidas.';
  end if;
  if (select count(*) from public.marcas m where m.perfil_id = new.perfil_id and m.fecha = new.fecha) >= 150 then
    raise exception 'Llegaste al máximo de 150 partidas guardadas por día.';
  end if;
  return new;
end; $$;
drop trigger if exists marcas_freno on public.marcas;
create trigger marcas_freno before insert on public.marcas for each row execute function public.marcas_freno();

-- ───────── Catálogo y banners (se llenan al final desde el código) ─────────
create table if not exists public.gacha_objetos (
  id text primary key, nombre text not null, rareza smallint not null check (rareza in (3, 4, 5)),
  piezas text[] not null, serie text not null, exclusivo text
);
create table if not exists public.gacha_banners (
  id text primary key, nombre text not null, grupo text not null check (grupo in ('evento', 'permanente', 'principiante')),
  desde timestamptz not null, hasta timestamptz not null, destacado5 text, destacados4 text[] not null default '{}'
);

-- ───────── Billetera y libro de movimientos ─────────
create table if not exists public.gacha_billetera (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  protogemas integer not null default 0 check (protogemas >= 0),
  deseos integer not null default 0 check (deseos >= 0),
  polvo integer not null default 0 check (polvo >= 0),
  actualizado timestamptz not null default now()
);
create table if not exists public.gacha_movimientos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  motivo text not null check (char_length(motivo) between 1 and 80),
  protogemas integer not null default 0, deseos integer not null default 0, polvo integer not null default 0,
  creado timestamptz not null default now(),
  unique (perfil_id, motivo)
);
create index if not exists gacha_movimientos_persona on public.gacha_movimientos (perfil_id, creado desc);

-- Cada movimiento actualiza la billetera; si deja algo en negativo, la base lo rechaza (y se deshace todo)
create or replace function public.gacha_mover() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Primero se actualiza (un insert con saldo negativo fallaría por la regla de "no negativo" aunque la fila exista)
  update public.gacha_billetera set protogemas = protogemas + new.protogemas, deseos = deseos + new.deseos, polvo = polvo + new.polvo, actualizado = now()
  where perfil_id = new.perfil_id;
  if not found then
    insert into public.gacha_billetera (perfil_id, protogemas, deseos, polvo) values (new.perfil_id, new.protogemas, new.deseos, new.polvo);
  end if;
  return new;
end; $$;
drop trigger if exists gacha_mover on public.gacha_movimientos;
create trigger gacha_mover after insert on public.gacha_movimientos for each row execute function public.gacha_mover();

-- ───────── Contadores (pity), inventario, historial, vitrina y misiones del día ─────────
create table if not exists public.gacha_estado (
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  grupo text not null check (grupo in ('evento', 'permanente', 'principiante')),
  pity5 integer not null default 0, pity4 integer not null default 0,
  garantizado5 boolean not null default false, garantizado4 boolean not null default false,
  total integer not null default 0,
  primary key (perfil_id, grupo)
);
create table if not exists public.gacha_inventario (
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  objeto_id text not null references public.gacha_objetos (id),
  cantidad integer not null default 1, primero timestamptz not null default now(),
  primary key (perfil_id, objeto_id)
);
create table if not exists public.gacha_tiradas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  banner_id text not null, objeto_id text not null, rareza smallint not null, numero integer,
  creado timestamptz not null default now()
);
create index if not exists gacha_tiradas_persona on public.gacha_tiradas (perfil_id, id desc);
create table if not exists public.gacha_vitrina (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  nivel integer not null default 1, xp integer not null default 0,
  marco text, placa text, tinta text, portada text, emblema text, titulo text, aura text, burbuja text,
  actualizado timestamptz not null default now()
);
create table if not exists public.gacha_misiones (
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  fecha date not null, ids text[] not null,
  primary key (perfil_id, fecha)
);

-- ───────── Permisos: leer sí; escribir, solo por las funciones ─────────
do $$ declare t text; begin
  foreach t in array array['gacha_objetos', 'gacha_banners', 'gacha_billetera', 'gacha_movimientos', 'gacha_estado', 'gacha_inventario', 'gacha_tiradas', 'gacha_vitrina', 'gacha_misiones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
-- Públicos: el catálogo, los banners, lo que cada uno tiene (su colección) y lo que lleva puesto
drop policy if exists "ver objetos" on public.gacha_objetos;
create policy "ver objetos" on public.gacha_objetos for select to anon, authenticated using (true);
drop policy if exists "ver banners" on public.gacha_banners;
create policy "ver banners" on public.gacha_banners for select to anon, authenticated using (true);
drop policy if exists "ver colecciones" on public.gacha_inventario;
create policy "ver colecciones" on public.gacha_inventario for select to anon, authenticated using (true);
drop policy if exists "ver vitrinas" on public.gacha_vitrina;
create policy "ver vitrinas" on public.gacha_vitrina for select to anon, authenticated using (true);
-- Privados: lo de cada uno
drop policy if exists "mi billetera" on public.gacha_billetera;
create policy "mi billetera" on public.gacha_billetera for select to authenticated using (perfil_id = (select auth.uid()));
drop policy if exists "mis movimientos" on public.gacha_movimientos;
create policy "mis movimientos" on public.gacha_movimientos for select to authenticated using (perfil_id = (select auth.uid()));
drop policy if exists "mis contadores" on public.gacha_estado;
create policy "mis contadores" on public.gacha_estado for select to authenticated using (perfil_id = (select auth.uid()));
drop policy if exists "mis tiradas" on public.gacha_tiradas;
create policy "mis tiradas" on public.gacha_tiradas for select to authenticated using (perfil_id = (select auth.uid()));
drop policy if exists "mis misiones" on public.gacha_misiones;
create policy "mis misiones" on public.gacha_misiones for select to authenticated using (perfil_id = (select auth.uid()));

-- ───────── Canjear en la tienda: 160 protogemas o 5 de polvo estelar = 1 deseo ─────────
create or replace function public.gacha_canjear(p_origen text, p_cantidad integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_yo uuid := (select auth.uid()); v_precio integer; v_saldo integer;
begin
  if v_yo is null then raise exception 'Hay que entrar con Discord.'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 100 then raise exception 'Cantidad inválida.'; end if;
  if p_origen not in ('protogemas', 'polvo') then raise exception 'Solo se canjean protogemas o polvo estelar.'; end if;
  v_precio := case p_origen when 'protogemas' then 160 else 5 end * p_cantidad;
  select case p_origen when 'protogemas' then protogemas else polvo end into v_saldo from public.gacha_billetera where perfil_id = v_yo for update;
  if coalesce(v_saldo, 0) < v_precio then raise exception 'No te alcanza: necesitas % y tienes %.', v_precio, coalesce(v_saldo, 0); end if;
  insert into public.gacha_movimientos (perfil_id, motivo, protogemas, polvo, deseos)
  values (v_yo, 'canje-' || gen_random_uuid(), case p_origen when 'protogemas' then -v_precio else 0 end, case p_origen when 'polvo' then -v_precio else 0 end, p_cantidad);
  return (select to_jsonb(b) from public.gacha_billetera b where perfil_id = v_yo);
end; $$;
revoke all on function public.gacha_canjear(text, integer) from public, anon;
grant execute on function public.gacha_canjear(text, integer) to authenticated;

-- ───────── Tirar: 1 o 10 deseos. Probabilidades del modelo Hoyoverse ─────────
-- 5★: 0,6 %; desde la tirada 74 sube 6 % por tirada; la 90 es segura. 4★: 5,1 %; la 9 tiene 56,1 % y la 10 es segura.
-- Banner de evento: 50 % de que el 5★ sea el destacado; si no lo es, el siguiente 5★ lo es seguro. Igual con los 4★ destacados.
-- Los contadores se comparten entre los banners del mismo grupo y se arrastran de un banner al siguiente.
create or replace function public.gacha_tirar(p_banner text, p_cantidad integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := (select auth.uid()); b public.gacha_banners%rowtype; e public.gacha_estado%rowtype;
  v_costo integer; v_saldo integer; i integer; r double precision; p5 double precision; p4 double precision;
  v_rar integer; v_obj text; v_num integer; v_nuevo boolean; v_dest boolean; v_polvo integer := 0; v_lote text := gen_random_uuid()::text;
  v_res jsonb := '[]'::jsonb;
begin
  if v_yo is null then raise exception 'Hay que entrar con Discord.'; end if;
  if p_cantidad not in (1, 10) then raise exception 'Se tira de a 1 o de a 10.'; end if;
  select * into b from public.gacha_banners where id = p_banner;
  if not found or now() < b.desde or now() >= b.hasta then raise exception 'Ese banner no está abierto.'; end if;
  insert into public.gacha_estado (perfil_id, grupo) values (v_yo, b.grupo) on conflict do nothing;
  select * into e from public.gacha_estado where perfil_id = v_yo and grupo = b.grupo for update;
  v_costo := p_cantidad;
  if b.grupo = 'principiante' then
    if e.total + p_cantidad > 20 then raise exception 'Ya usaste tus 20 deseos de principiante.'; end if;
    if p_cantidad = 10 then v_costo := 8; end if;
  end if;
  select deseos into v_saldo from public.gacha_billetera where perfil_id = v_yo for update;
  if coalesce(v_saldo, 0) < v_costo then raise exception 'Necesitas % deseos y tienes %.', v_costo, coalesce(v_saldo, 0); end if;
  insert into public.gacha_movimientos (perfil_id, motivo, deseos) values (v_yo, 'tirada-' || v_lote, -v_costo);

  for i in 1..p_cantidad loop
    e.pity5 := e.pity5 + 1; e.pity4 := e.pity4 + 1; e.total := e.total + 1;
    p5 := case when e.pity5 >= 90 then 1 when e.pity5 >= 74 then least(1, 0.006 + 0.06 * (e.pity5 - 73)) else 0.006 end;
    p4 := case when e.pity4 >= 10 then 1 when e.pity4 >= 9 then 0.561 else 0.051 end;
    r := random(); v_dest := false; v_num := null;
    if r < p5 then
      v_rar := 5; v_num := e.pity5; e.pity5 := 0;
      if b.grupo = 'evento' and b.destacado5 is not null and (e.garantizado5 or random() < 0.5) then
        v_obj := b.destacado5; e.garantizado5 := false; v_dest := true;
      else
        select id into v_obj from public.gacha_objetos where rareza = 5 and exclusivo is null order by random() limit 1;
        if b.grupo = 'evento' then e.garantizado5 := true; end if;
      end if;
      v_polvo := v_polvo + 20;
    elsif r < p5 + p4 then
      v_rar := 4; v_num := e.pity4; e.pity4 := 0;
      if b.grupo = 'evento' and cardinality(b.destacados4) > 0 and (e.garantizado4 or random() < 0.5) then
        v_obj := b.destacados4[1 + floor(random() * cardinality(b.destacados4))::integer]; e.garantizado4 := false; v_dest := true;
      else
        select id into v_obj from public.gacha_objetos where rareza = 4 and exclusivo is null and not (id = any (b.destacados4)) order by random() limit 1;
        if b.grupo = 'evento' then e.garantizado4 := true; end if;
      end if;
      v_polvo := v_polvo + 5;
    else
      v_rar := 3;
      select id into v_obj from public.gacha_objetos where rareza = 3 order by random() limit 1;
    end if;
    v_nuevo := not exists (select 1 from public.gacha_inventario where perfil_id = v_yo and objeto_id = v_obj);
    insert into public.gacha_inventario (perfil_id, objeto_id) values (v_yo, v_obj)
    on conflict (perfil_id, objeto_id) do update set cantidad = public.gacha_inventario.cantidad + 1;
    insert into public.gacha_tiradas (perfil_id, banner_id, objeto_id, rareza, numero) values (v_yo, b.id, v_obj, v_rar, v_num);
    v_res := v_res || jsonb_build_object('objeto', v_obj, 'rareza', v_rar, 'numero', v_num, 'nuevo', v_nuevo, 'destacado', v_dest);
  end loop;

  update public.gacha_estado set pity5 = e.pity5, pity4 = e.pity4, garantizado5 = e.garantizado5, garantizado4 = e.garantizado4, total = e.total
  where perfil_id = v_yo and grupo = b.grupo;
  if v_polvo > 0 then insert into public.gacha_movimientos (perfil_id, motivo, polvo) values (v_yo, 'polvo-' || v_lote, v_polvo); end if;
  return jsonb_build_object('resultados', v_res, 'pity5', e.pity5, 'pity4', e.pity4, 'garantizado5', e.garantizado5, 'total', e.total);
end; $$;
revoke all on function public.gacha_tirar(text, integer) from public, anon;
grant execute on function public.gacha_tirar(text, integer) to authenticated;

-- ───────── Ponerse un objeto (solo si lo tienes y sirve para esa pieza); null lo saca ─────────
create or replace function public.gacha_equipar(p_pieza text, p_objeto text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_yo uuid := (select auth.uid());
begin
  if v_yo is null then raise exception 'Hay que entrar con Discord.'; end if;
  if p_pieza not in ('marco', 'placa', 'tinta', 'portada', 'emblema', 'titulo', 'aura', 'burbuja') then raise exception 'Pieza inválida.'; end if;
  if p_objeto is not null and not exists (
    select 1 from public.gacha_inventario i join public.gacha_objetos o on o.id = i.objeto_id
    where i.perfil_id = v_yo and i.objeto_id = p_objeto and p_pieza = any (o.piezas)) then
    raise exception 'No tienes ese objeto para esa pieza.';
  end if;
  insert into public.gacha_vitrina (perfil_id) values (v_yo) on conflict do nothing;
  execute format('update public.gacha_vitrina set %I = $1, actualizado = now() where perfil_id = $2', p_pieza) using p_objeto, v_yo;
end; $$;
revoke all on function public.gacha_equipar(text, text) from public, anon;
grant execute on function public.gacha_equipar(text, text) to authenticated;

-- ───────── 5★: anuncio en el canal de anuncios (el de los cruces) y en la campana de todos ─────────
create or replace function public.gacha_anunciar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_quien text; v_que text; v_donde text;
begin
  select nombre into v_quien from public.perfiles where id = new.perfil_id;
  select nombre into v_que from public.gacha_objetos where id = new.objeto_id;
  select nombre into v_donde from public.gacha_banners where id = new.banner_id;
  perform public.avisar_discord(format('**%s** consiguió un objeto de 5 estrellas en el Gachapón: **%s** (banner %s, deseo número %s). https://panchoso3234.github.io/sustolimpiadas/#/gachapon',
    coalesce(v_quien, 'Alguien'), coalesce(v_que, new.objeto_id), coalesce(v_donde, new.banner_id), coalesce(new.numero::text, '?')));
  insert into public.avisos (perfil_id, tipo, texto, enlace)
  select p.id, 'gachapon', left(coalesce(v_quien, 'Alguien') || ' consiguió ' || coalesce(v_que, 'un objeto') || ' (5 estrellas) en el Gachapón.', 300), '#/gachapon'
  from public.perfiles p where p.id <> new.perfil_id;
  return new;
end; $$;
drop trigger if exists gacha_anunciar on public.gacha_tiradas;
create trigger gacha_anunciar after insert on public.gacha_tiradas for each row when (new.rareza = 5) execute function public.gacha_anunciar();

-- ───────── Catálogo (78 objetos) y banners (6) ─────────
insert into public.gacha_objetos (id, nombre, rareza, piezas, serie, exclusivo) values
  ('luna-carmesi', 'Luna Carmesí', 5, array['marco', 'placa', 'tinta', 'portada', 'aura', 'emblema', 'titulo', 'burbuja']::text[], 'Velo de Medianoche', 'velo-medianoche'),
  ('leviatan-abisal', 'Leviatán Abisal', 5, array['marco', 'placa', 'tinta', 'portada', 'aura', 'emblema', 'titulo', 'burbuja']::text[], 'Marea Estelar', 'marea-estelar'),
  ('kitsune-sakura', 'Kitsune de Nueve Colas', 5, array['marco', 'placa', 'tinta', 'portada', 'aura', 'emblema', 'titulo', 'burbuja']::text[], 'Sakura Eterna', 'kitsune-sakura'),
  ('corona-campeon', 'Corona del Campeón', 5, array['marco', 'placa', 'tinta', 'portada', 'aura', 'emblema', 'titulo', 'burbuja']::text[], 'Coronación', 'coronacion'),
  ('nebula-violeta', 'Nébula Violeta', 5, array['marco', 'placa', 'tinta', 'portada', 'aura', 'emblema', 'titulo', 'burbuja']::text[], 'Los Cinco Eternos', null),
  ('fenix-solar', 'Fénix Solar', 5, array['marco', 'placa', 'tinta', 'portada', 'aura', 'emblema', 'titulo', 'burbuja']::text[], 'Los Cinco Eternos', null),
  ('glaciar-boreal', 'Glaciar Boreal', 5, array['marco', 'placa', 'tinta', 'portada', 'aura', 'emblema', 'titulo', 'burbuja']::text[], 'Los Cinco Eternos', null),
  ('bosque-esmeralda', 'Bosque Esmeralda', 5, array['marco', 'placa', 'tinta', 'portada', 'aura', 'emblema', 'titulo', 'burbuja']::text[], 'Los Cinco Eternos', null),
  ('neon-cibernetico', 'Neón Cibernético', 5, array['marco', 'placa', 'tinta', 'portada', 'aura', 'emblema', 'titulo', 'burbuja']::text[], 'Los Cinco Eternos', null),
  ('marco-murcielagos', 'Marco Vuelo de Murciélagos', 4, array['marco']::text[], 'Velo de Medianoche', 'velo-medianoche'),
  ('marco-coral', 'Marco Arrecife', 4, array['marco']::text[], 'Marea Estelar', 'marea-estelar'),
  ('marco-torii', 'Marco Torii', 4, array['marco']::text[], 'Sakura Eterna', 'kitsune-sakura'),
  ('marco-laurel', 'Marco Laurel Dorado', 4, array['marco']::text[], 'Coronación', 'coronacion'),
  ('marco-prisma', 'Marco Prisma', 4, array['marco']::text[], 'Firmamento', null),
  ('marco-eclipse', 'Marco Eclipse', 4, array['marco']::text[], 'Firmamento', null),
  ('marco-runas', 'Marco Runas', 4, array['marco']::text[], 'Firmamento', null),
  ('marco-cometa', 'Marco Cometa', 4, array['marco']::text[], 'Firmamento', null),
  ('marco-sakura', 'Marco Pétalo', 4, array['marco']::text[], 'Firmamento', null),
  ('placa-niebla', 'Placa Niebla de Medianoche', 4, array['placa']::text[], 'Velo de Medianoche', 'velo-medianoche'),
  ('placa-burbujas', 'Placa Burbujas', 4, array['placa']::text[], 'Marea Estelar', 'marea-estelar'),
  ('placa-abanico', 'Placa Abanico', 4, array['placa']::text[], 'Sakura Eterna', 'kitsune-sakura'),
  ('placa-podio', 'Placa Podio', 4, array['placa']::text[], 'Coronación', 'coronacion'),
  ('placa-galaxia', 'Placa Galaxia', 4, array['placa']::text[], 'Firmamento', null),
  ('placa-atardecer', 'Placa Atardecer', 4, array['placa']::text[], 'Firmamento', null),
  ('placa-matrix', 'Placa Código', 4, array['placa']::text[], 'Firmamento', null),
  ('placa-arcade', 'Placa Arcade', 4, array['placa']::text[], 'Firmamento', null),
  ('tinta-sangre', 'Tinta Sangre de Luna', 4, array['tinta']::text[], 'Velo de Medianoche', 'velo-medianoche'),
  ('tinta-marea', 'Tinta Marea', 4, array['tinta']::text[], 'Marea Estelar', 'marea-estelar'),
  ('tinta-cerezo', 'Tinta Cerezo', 4, array['tinta']::text[], 'Sakura Eterna', 'kitsune-sakura'),
  ('tinta-oro', 'Tinta Oro', 4, array['tinta']::text[], 'Coronación', 'coronacion'),
  ('tinta-arcoiris', 'Tinta Arcoíris', 4, array['tinta']::text[], 'Firmamento', null),
  ('tinta-plasma', 'Tinta Plasma', 4, array['tinta']::text[], 'Firmamento', null),
  ('tinta-lava', 'Tinta Lava', 4, array['tinta']::text[], 'Firmamento', null),
  ('tinta-hielo', 'Tinta Escarcha', 4, array['tinta']::text[], 'Firmamento', null),
  ('aura-fuego-fatuo', 'Aura Fuego Fatuo', 4, array['aura']::text[], 'Firmamento', null),
  ('aura-solar', 'Aura Solar', 4, array['aura']::text[], 'Firmamento', null),
  ('aura-toxica', 'Aura Tóxica', 4, array['aura']::text[], 'Firmamento', null),
  ('aura-rosa', 'Aura Corazón', 4, array['aura']::text[], 'Sakura Eterna', 'kitsune-sakura'),
  ('burbuja-comic', 'Burbuja Cómic', 4, array['burbuja']::text[], 'Firmamento', null),
  ('burbuja-pergamino', 'Burbuja Pergamino', 4, array['burbuja']::text[], 'Firmamento', null),
  ('burbuja-neon', 'Burbuja Neón', 4, array['burbuja']::text[], 'Firmamento', null),
  ('portada-cumbre', 'Portada Cumbre Nevada', 4, array['portada']::text[], 'Firmamento', null),
  ('portada-ciudad', 'Portada Ciudad Nocturna', 4, array['portada']::text[], 'Firmamento', null),
  ('portada-playa', 'Portada Isla al Atardecer', 4, array['portada']::text[], 'Firmamento', null),
  ('tit-rey-lag', 'Título «Rey del Lag»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-intocable', 'Título «El Intocable»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-mano-seda', 'Título «Mano de Seda»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-30', 'Título «Pesadilla del 3-0»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-ultimo', 'Título «Último en Rendirse»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-tryhard', 'Título «Tryhard Certificado»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-casual', 'Título «Casual de Corazón»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-insomne', 'Título «Insomne Profesional»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-suerte', 'Título «Bendecido por el RNG»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-mala-suerte', 'Título «Maldito por el RNG»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-revancha', 'Título «Pide Revancha»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-calabaza', 'Título «Calabaza con Patas»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-estratega', 'Título «Gran Estratega»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-velocista', 'Título «Dedos Rápidos»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-fantasma', 'Título «Fantasma del Portal»', 3, array['titulo']::text[], 'Títulos', null),
  ('tit-tsukibet', 'Título «Vidente de TSUKIBET»', 3, array['titulo']::text[], 'Títulos', null),
  ('emb-estrella', 'Emblema Estrella', 3, array['emblema']::text[], 'Emblemas', null),
  ('emb-luna', 'Emblema Luna', 3, array['emblema']::text[], 'Emblemas', null),
  ('emb-rayo', 'Emblema Rayo', 3, array['emblema']::text[], 'Emblemas', null),
  ('emb-corazon', 'Emblema Corazón', 3, array['emblema']::text[], 'Emblemas', null),
  ('emb-calavera', 'Emblema Calavera', 3, array['emblema']::text[], 'Emblemas', null),
  ('emb-diamante', 'Emblema Diamante', 3, array['emblema']::text[], 'Emblemas', null),
  ('emb-llama', 'Emblema Llama', 3, array['emblema']::text[], 'Emblemas', null),
  ('emb-hoja', 'Emblema Hoja', 3, array['emblema']::text[], 'Emblemas', null),
  ('emb-corona', 'Emblema Corona', 3, array['emblema']::text[], 'Emblemas', null),
  ('emb-ojo', 'Emblema Ojo', 3, array['emblema']::text[], 'Emblemas', null),
  ('col-menta', 'Color Menta', 3, array['tinta']::text[], 'Colores', null),
  ('col-calabaza', 'Color Calabaza', 3, array['tinta']::text[], 'Colores', null),
  ('col-lavanda', 'Color Lavanda', 3, array['tinta']::text[], 'Colores', null),
  ('col-cielo', 'Color Cielo', 3, array['tinta']::text[], 'Colores', null),
  ('col-rosa', 'Color Chicle', 3, array['tinta']::text[], 'Colores', null),
  ('col-limon', 'Color Limón', 3, array['tinta']::text[], 'Colores', null),
  ('col-coral', 'Color Coral', 3, array['tinta']::text[], 'Colores', null),
  ('col-plata', 'Color Plata', 3, array['tinta']::text[], 'Colores', null)
on conflict (id) do update set nombre = excluded.nombre, rareza = excluded.rareza, piezas = excluded.piezas, serie = excluded.serie, exclusivo = excluded.exclusivo;
insert into public.gacha_banners (id, nombre, grupo, desde, hasta, destacado5, destacados4) values
  ('velo-medianoche', 'Velo de Medianoche', 'evento', '2026-10-27T00:00:00-03:00', '2026-11-03T00:00:00-03:00', 'luna-carmesi', array['marco-murcielagos', 'placa-niebla', 'tinta-sangre']::text[]),
  ('marea-estelar', 'Marea Estelar', 'evento', '2026-11-03T00:00:00-03:00', '2026-11-11T00:00:00-03:00', 'leviatan-abisal', array['marco-coral', 'placa-burbujas', 'tinta-marea']::text[]),
  ('kitsune-sakura', 'Sakura Eterna', 'evento', '2026-11-11T00:00:00-03:00', '2026-11-20T00:00:00-03:00', 'kitsune-sakura', array['marco-torii', 'placa-abanico', 'tinta-cerezo']::text[]),
  ('coronacion', 'Coronación', 'evento', '2026-11-20T00:00:00-03:00', '2026-11-30T00:00:00-03:00', 'corona-campeon', array['marco-laurel', 'placa-podio', 'tinta-oro']::text[]),
  ('firmamento', 'Firmamento Eterno', 'permanente', '2026-10-27T00:00:00-03:00', '2027-12-31T00:00:00-03:00', null, array[]::text[]),
  ('primer-deseo', 'Primer Deseo', 'principiante', '2026-10-27T00:00:00-03:00', '2027-12-31T00:00:00-03:00', null, array[]::text[])
on conflict (id) do update set nombre = excluded.nombre, grupo = excluded.grupo, desde = excluded.desde, hasta = excluded.hasta, destacado5 = excluded.destacado5, destacados4 = excluded.destacados4;

-- ───────── Aviso de lanzamiento en la campana (una vez por persona) ─────────
insert into public.avisos (perfil_id, tipo, texto, enlace)
select p.id, 'gachapon-nuevo', 'Abrió el Gachapón: 10 deseos de regalo, misiones diarias y el banner Velo de Medianoche con Luna Carmesí (5 estrellas). Reclama tus recompensas.', '#/gachapon'
from public.perfiles p
where not exists (select 1 from public.avisos a where a.perfil_id = p.id and a.tipo = 'gachapon-nuevo');

-- Comprobación
select 'objetos' as gachapon, (select count(*) from public.gacha_objetos) = 78 as ok
union all select 'banners', (select count(*) from public.gacha_banners) = 6
union all select 'freno de marcas', exists (select 1 from pg_trigger where tgname = 'marcas_freno')
union all select 'anuncio de 5 estrellas', exists (select 1 from pg_trigger where tgname = 'gacha_anunciar');
