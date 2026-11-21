-- Las Sustolimpiadas · 21 de noviembre · Wild Cards del CRUCE 11 (acuerdo entre los equipos, decidido por Pancho).
--  · Aura recibe sí o sí una legendaria: «La Corona de Aura», todos sus puntos del cruce ×1,6. La carta muestra su valor
--    real (×1,6), no se disfraza de otra.
--  · Los demás equipos solo reciben comunes o raras (sin Ruleta Rusa ni Doble Carta, que pueden traer una épica).
--  · Desde el cruce 12 (no existe) todo vuelve a la regla normal; los cruces 8 a 10 no se tocan.
-- Ejecutar UNA vez, ANTES de girar las ruletas del cruce 11. Se puede repetir sin problema.
begin;

-- La carta especial: existe en el catálogo, pero el sorteo normal nunca la elige (activa = false)
insert into public.wc_cartas (id, nombre, emoji, rareza, tipo, efecto) values
  ('corona_aura', 'La Corona de Aura', '👑', 'legendaria', 'auto', 'Carta especial del cruce 11: todos los puntos del equipo en el cruce valen ×1,6.')
on conflict (id) do update set nombre = excluded.nombre, emoji = excluded.emoji, rareza = excluded.rareza, tipo = excluded.tipo, efecto = excluded.efecto;
update public.wc_cartas set activa = false where id = 'corona_aura';

-- Sortear (solo admin): la misma de 2026-11-13-wc-anuncio-sorteo.sql + la regla del cruce 11
create or replace function public.wc_sortear(p_cruce smallint, p_equipo bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_desde smallint; v_puesto smallint; g public.wc_probabilidades%rowtype; r numeric; v_rareza text; v_carta text; v_id bigint;
begin
  if not public.es_admin() then raise exception 'Solo la organización sortea las Wild Cards.'; end if;
  select coalesce((valor ->> 'desde_cruce')::smallint, 8) into v_desde from public.ajustes where clave = 'wild_cards';
  if p_cruce < coalesce(v_desde, 8) then raise exception 'Las Wild Cards parten en el cruce %.', coalesce(v_desde, 8); end if;
  if not exists (select 1 from public.enfrentamientos e join public.equipo_miembros m on m.perfil_id in (e.a_perfil, e.b_perfil)
                 where e.cruce = p_cruce and e.oficial and e.modo = '1v1' and e.estado <> 'anulado' and m.equipo_id = p_equipo) then
    raise exception 'Ese equipo no tiene duelos en el cruce %: primero sortea los duelos.', p_cruce;
  end if;
  if exists (select 1 from public.wild_cards where cruce = p_cruce and equipo_id = p_equipo and origen is null) then
    raise exception 'Ese equipo ya tiene su Wild Card en este cruce.';
  end if;
  select t.pos into v_puesto from public.tabla_equipos() t where t.equipo_id = p_equipo;
  v_puesto := coalesce(v_puesto, 12);
  select * into g from public.wc_probabilidades where v_puesto between desde and hasta;
  if not found then select * into g from public.wc_probabilidades order by desde desc limit 1; end if;
  r := random() * 100;
  if p_cruce = 11 then
    -- Regla del cruce 11: Aura, su Corona ×1,6; el resto, común o rara (en la proporción de su puesto)
    if p_equipo = (select id from public.equipos where nombre = 'Aura') then
      v_rareza := 'legendaria'; v_carta := 'corona_aura';
    else
      v_rareza := case when r < 100 * g.comun / nullif(g.comun + g.rara, 0) then 'comun' else 'rara' end;
      select id into v_carta from public.wc_cartas where rareza = v_rareza and activa and id not in ('ruleta', 'doble_carta') order by random() limit 1;
    end if;
  else
    v_rareza := case when r < g.comun then 'comun' when r < g.comun + g.rara then 'rara' when r < g.comun + g.rara + g.epica then 'epica' else 'legendaria' end;
    select id into v_carta from public.wc_cartas where rareza = v_rareza and activa order by random() limit 1;
  end if;
  insert into public.wild_cards (cruce, equipo_id, carta, puesto, dado, creado_por)
  values (p_cruce, p_equipo, v_carta, v_puesto, public.wc_tirar(v_carta), (select auth.uid()))
  returning id into v_id;
  -- Cartas que traen otras: se resuelven al tiro (sin anidar Doble Carta ni Ruleta Rusa)
  if v_carta = 'ruleta' and random() < 0.5 then
    perform public.wc_hija(v_id, (select id from public.wc_cartas where rareza = 'epica' and activa and id <> 'doble_carta' order by random() limit 1));
  elsif v_carta = 'doble_carta' then
    perform public.wc_hija(v_id, x.id) from (select id from public.wc_cartas where rareza in ('comun', 'rara') and activa and id <> 'ruleta' order by random() limit 2) x;
  end if;
  insert into public.avisos (perfil_id, tipo, texto, enlace)
  select m.perfil_id, 'wildcard', format('🃏 Tu equipo recibió una Wild Card %s %s para el cruce %s.', public.wc_rareza_emoji(v_rareza), public.wc_rareza_nombre(v_rareza), p_cruce), '#/juegos/wildcards'
  from public.equipo_miembros m where m.equipo_id = p_equipo;
  perform public.wc_anunciar_carta(v_id);
  return v_id;
end; $$;
revoke all on function public.wc_sortear(smallint, bigint) from public, anon;
grant execute on function public.wc_sortear(smallint, bigint) to authenticated;

commit;

-- Comprobación: la carta especial existe y no sale en el sorteo normal; Aura existe con ese nombre
select id, nombre, rareza, activa from public.wc_cartas where id = 'corona_aura';
select id, nombre from public.equipos where nombre = 'Aura';
