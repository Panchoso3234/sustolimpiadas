-- Las Sustolimpiadas · Gachapón (modelo Hoyoverse). Plantilla: el archivo para ejecutar lo arma
-- `node pruebas/gachapon-sql.mjs` agregando al final el catálogo y los banners de supabase/functions/_shared/gachapon.ts.
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
  -- public.mencion etiqueta con @ a quien tiene Discord vinculado (si no, pone su nombre en negrita)
  perform public.avisar_discord(format('%s consiguió un objeto de 5 estrellas en el Gachapón: **%s** (banner %s, deseo número %s). https://panchoso3234.github.io/sustolimpiadas/#/gachapon',
    public.mencion(new.perfil_id), coalesce(v_que, new.objeto_id), coalesce(v_donde, new.banner_id), coalesce(new.numero::text, '?')));
  insert into public.avisos (perfil_id, tipo, texto, enlace)
  select p.id, 'gachapon', left(coalesce(v_quien, 'Alguien') || ' consiguió ' || coalesce(v_que, 'un objeto') || ' (5 estrellas) en el Gachapón.', 300), '#/gachapon'
  from public.perfiles p where p.id <> new.perfil_id;
  return new;
end; $$;
drop trigger if exists gacha_anunciar on public.gacha_tiradas;
create trigger gacha_anunciar after insert on public.gacha_tiradas for each row when (new.rareza = 5) execute function public.gacha_anunciar();
