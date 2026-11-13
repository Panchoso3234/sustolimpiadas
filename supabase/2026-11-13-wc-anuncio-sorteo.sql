-- Las Sustolimpiadas · 13 de noviembre · Wild Cards: el bot anuncia cada carta en Discord apenas se gira la ruleta.
-- Pedido de Pancho: el mensaje nombra al equipo y menciona a sus integrantes.
--   · Carta de decisión: se dice cuál es y qué hace (se usa antes de jugar).
--   · Carta automática: solo la rareza; qué carta es se sabrá al final del cruce (sigue siendo secreta).
-- Es la misma wc_sortear de 2026-11-12-wild-cards-2.sql con el aviso al final. Se puede ejecutar más de una vez.

begin;

-- Mensaje de Discord de una carta recién sorteada (canal recordatorios)
create or replace function public.wc_anunciar_carta(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.wild_cards%rowtype; k public.wc_cartas%rowtype; v_eq text; v_gente text;
begin
  select * into w from public.wild_cards where id = p_id;
  select * into k from public.wc_cartas where id = w.carta;
  select nombre into v_eq from public.equipos where id = w.equipo_id;
  select string_agg(public.mencion(m.perfil_id), ' ') into v_gente from public.equipo_miembros m where m.equipo_id = w.equipo_id;
  if k.tipo = 'decision' then
    perform public.avisar_discord(format(E'🃏 **Wild Card · Cruce %s** · **%s** %s\n%s %s **%s** (%s): %s\nEs de decisión: avísenle a la organización cómo la quieren usar antes de jugar.',
      w.cruce, v_eq, coalesce(v_gente, ''), public.wc_rareza_emoji(k.rareza), k.emoji, k.nombre, public.wc_rareza_nombre(k.rareza), k.efecto), 'recordatorios');
  else
    perform public.avisar_discord(format(E'🃏 **Wild Card · Cruce %s** · **%s** %s\nLes salió una carta %s **%s** boca abajo. Qué carta es y cuánto suma se sabrá al final del cruce.',
      w.cruce, v_eq, coalesce(v_gente, ''), public.wc_rareza_emoji(k.rareza), public.wc_rareza_nombre(k.rareza)), 'recordatorios');
  end if;
end; $$;
revoke all on function public.wc_anunciar_carta(bigint) from public, anon, authenticated;

-- Sortear (solo admin): igual que antes + el anuncio de la carta
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
  v_rareza := case when r < g.comun then 'comun' when r < g.comun + g.rara then 'rara' when r < g.comun + g.rara + g.epica then 'epica' else 'legendaria' end;
  select id into v_carta from public.wc_cartas where rareza = v_rareza and activa order by random() limit 1;
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

-- Comprobación: debe decir «sí» (la ruleta ya llama al anuncio)
select case when pg_get_functiondef('public.wc_sortear(smallint, bigint)'::regprocedure) like '%wc_anunciar_carta%' then 'sí' else 'no' end as anuncia_al_sortear;
