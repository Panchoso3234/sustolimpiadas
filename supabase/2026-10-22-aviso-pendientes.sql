-- Las Sustolimpiadas · 22 de octubre: el aviso de Discord del cruce también lista los duelos que todavía no se pueden jugar
-- 1) Mensaje 1: los duelos ya creados (se pueden jugar desde ya), cada uno con su juego.
-- 2) Mensaje 2, al final: los duelos que faltan porque alguien todavía no entra a la web (para que estén al tanto).
-- Si después se agregan duelos con "➕ Agregar duelos que faltan", el aviso dice "nuevos duelos" (no "cruce creado")
-- y vuelve a listar los que siguen faltando.
-- También deja los nombres de los juegos igual que en la web (el nombre del juego, también en los duelos). Se puede volver a ejecutar sin problema.

insert into public.nombres_juegos (id, nombre) values
  ('tinta', 'Tinta Tramposa'),
  ('cangrejos', 'Mata-Cangrejos'),
  ('numeros', 'Cazanúmeros'),
  ('eco', 'Eco del Templo'),
  ('cocos', 'Cocos al Vuelo'),
  ('parejas', 'Parejas del Arrecife'),
  ('bolos', 'Bolos de Coco'),
  ('totem', 'Tiro al Tótem'),
  ('cofre', 'El Cofre o la Ola'),
  ('cartero', 'Ruta del Cartero'),
  ('minigolf', 'Minigolf del Volcán'),
  ('sumo', 'Sumo de Balsas'),
  ('karts', 'Gran Premio'),
  ('tren', 'Fuga del Tren'),
  ('tanques', 'Tanques de Juguete'),
  ('bombas', 'Bombas'),
  ('agujero', 'Agujero Negro'),
  ('defensa', 'Defensa de la Torre'),
  ('museo', 'Ladrón del Museo'),
  ('tiro', 'Galería de Tiro'),
  ('cocina', 'Cocina Caótica'),
  ('billar', 'Billar'),
  ('triples', 'Triples'),
  ('serpientes', 'Serpientes'),
  ('calabazas', 'Torre de Calabazas'),
  ('laberinto', 'Laberinto Embrujado'),
  ('escobas', 'Carrera de Escobas'),
  ('torre', 'Torre Tambaleante')
on conflict (id) do update set nombre = excluded.nombre;

-- Los duelos que le faltan a un cruce: en cada enfrentamiento ya armado, se juntan los que no tienen duelo de cada lado
-- (primero los que tienen cuenta, después los "sin cuenta"), en orden.
-- shortcut: un enfrentamiento sin ningún duelo creado (equipo entero sin cuenta) no aparece; si pasa, avisarlo a mano.
create or replace function public.duelos_faltantes(p_cruce smallint) returns text
language sql stable security definer set search_path = '' as $$
  with d as (select a_perfil, b_perfil from public.enfrentamientos where oficial and cruce = p_cruce and modo = '1v1'),
  pares as (
    select distinct ma.equipo_id as ta, mb.equipo_id as tb
      from d join public.equipo_miembros ma on ma.perfil_id = d.a_perfil join public.equipo_miembros mb on mb.perfil_id = d.b_perfil),
  libres as (
    select equipo_id, quien, row_number() over (partition by equipo_id order by orden, quien) as n from (
      select m.equipo_id, public.mencion(m.perfil_id) as quien, 0 as orden from public.equipo_miembros m
       where not exists (select 1 from d where m.perfil_id in (d.a_perfil, d.b_perfil))
      union all
      select x.equipo_id, '**' || x.nombre || '** (sin cuenta)', 1 from public.equipo_pendientes x) s)
  select string_agg(format('⏳ %s vs %s  ·  %s vs %s', la.quien, lb.quien, qa.nombre, qb.nombre), E'\n' order by qa.nombre, la.n)
    from pares p
    join libres la on la.equipo_id = p.ta
    join libres lb on lb.equipo_id = p.tb and lb.n = la.n
    join public.equipos qa on qa.id = p.ta
    join public.equipos qb on qb.id = p.tb;
$$;
revoke all on function public.duelos_faltantes(smallint) from public, anon, authenticated;

-- 📣 Cruce creado (o duelos agregados): un mensaje con los duelos listos y, al final, otro con los que faltan
create or replace function public.aviso_cruce() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cruce smallint; v_plazo date; v_lineas text; v_faltan text; v_antes integer;
begin
  for v_cruce in select distinct cruce from nuevos where oficial and cruce is not null loop
    select max(plazo) into v_plazo from nuevos where cruce = v_cruce;
    select count(*) - (select count(*) from nuevos where cruce = v_cruce) into v_antes from public.enfrentamientos where cruce = v_cruce and oficial;
    select string_agg(public.mencion(a_perfil) || ' vs ' || public.mencion(b_perfil) || ' — ' || public.nombre_juego(juego), E'\n' order by id) into v_lineas
      from nuevos where cruce = v_cruce;
    perform public.avisar_discord(format(E'%s\n⏰ Plazo: hasta el %s a las 23:59 (hora de Chile). Cada duelo es al mejor de 3.\n%s\n👉 Juégalo en el sitio: Juegos → Versus 1v1 (a tu hora o en vivo con tu rival). ¡No jugar son 0 puntos para ti y tu equipo!',
      case when v_antes > 0 then format('➕ **Cruce %s: nuevos duelos listos para jugar**', v_cruce) else format('📣 **¡Cruce %s creado!** Estos duelos ya se pueden jugar:', v_cruce) end,
      to_char(v_plazo, 'DD/MM'), v_lineas));
    v_faltan := public.duelos_faltantes(v_cruce);
    if v_faltan is not null then
      perform public.avisar_discord(format(E'⏳ **Cruce %s: duelos que todavía no se pueden jugar**\nFalta que estas personas entren a la web con Discord y creen su personaje. Apenas entren, se activa su duelo.\n%s',
        v_cruce, v_faltan));
    end if;
  end loop;
  return null;
end; $$;
drop trigger if exists aviso_cruce on public.enfrentamientos;
create trigger aviso_cruce after insert on public.enfrentamientos referencing new table as nuevos for each statement execute function public.aviso_cruce();
