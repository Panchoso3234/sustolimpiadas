-- Las Sustolimpiadas · 15 de noviembre · La tabla de posiciones como IMAGEN en Discord (y el corte de la final en 6).
-- Los 3 avisos que pegaban la tabla en texto ahora la mandan como imagen (Edge Function `tabla`):
--   · resumen al cerrar cada cruce (resultados), · tabla semanal del domingo (tabla), · revelación de Wild Cards (resultados).
-- Si la imagen falla, la función publica el texto de siempre (nunca queda un aviso vacío). Además se corrige un error
-- viejo: el bot ponía el «corte de la final» después del 4.º; desde el 03-11 pasan los 6 mejores equipos.
-- Requiere la Edge Function `tabla` desplegada. Se puede ejecutar más de una vez. No toca puntos.

begin;

-- Tabla en texto (respaldo): corte de la final después del 6.º
create or replace function public.texto_tabla(p_hasta smallint default null, p_antes smallint default null) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(format('%s. %s · %s pts%s%s', t.pos, t.nombre, public.pts(t.puntos),
      case when a.pos is null or a.pos = t.pos then '' when a.pos > t.pos then format(' (sube %s)', a.pos - t.pos) else format(' (baja %s)', t.pos - a.pos) end,
      case when t.pos = 6 then E'\n------ corte de la final ------' else '' end), E'\n' order by t.pos)
  from public.tabla_equipos(p_hasta) t left join public.tabla_equipos(p_antes) a on p_antes is not null and a.equipo_id = t.equipo_id;
$$;
revoke all on function public.texto_tabla(smallint, smallint) from public, anon, authenticated;

-- Aviso con la tabla como imagen. p_antes: cruce con que se comparan las flechas (null = sin flechas).
-- p_cruce_wc: cruce cuyos puntos de Wild Cards se muestran en la columna WC (null = sin columna).
create or replace function public.avisar_tabla(p_texto text, p_canal text, p_titulo text, p_subtitulo text,
  p_hasta smallint default null, p_antes smallint default null, p_cruce_wc smallint default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_clave text; v_filas jsonb; v_respaldo text := public.texto_tabla(p_hasta, p_antes);
begin
  select valor into v_clave from public.secretos where clave = 'diario_clave';
  if v_clave is null then perform public.avisar_discord(p_texto || E'\n\n' || coalesce(v_respaldo, ''), p_canal); return; end if;
  select jsonb_agg(jsonb_build_object('pos', t.pos, 'nombre', t.nombre, 'puntos', t.puntos, 'antes', a.pos, 'cartas', w.puntos) order by t.pos)
    into v_filas
  from public.tabla_equipos(p_hasta) t
  left join public.tabla_equipos(p_antes) a on p_antes is not null and a.equipo_id = t.equipo_id
  left join public.wc_ajustes w on p_cruce_wc is not null and w.cruce = p_cruce_wc and w.equipo_id = t.equipo_id;
  perform net.http_post(
    url := 'https://glkoujvomcnpqdpakbxa.supabase.co/functions/v1/tabla',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-diario-clave', v_clave),
    body := jsonb_build_object('texto', p_texto, 'canal', p_canal, 'titulo', p_titulo, 'subtitulo', p_subtitulo,
                               'filas', coalesce(v_filas, '[]'::jsonb), 'respaldo', coalesce(v_respaldo, '')),
    timeout_milliseconds := 60000);
end; $$;
revoke all on function public.avisar_tabla(text, text, text, text, smallint, smallint, smallint) from public, anon, authenticated;

-- Resumen del cruce (igual que en 2026-10-25-ausencias.sql) con la tabla como imagen y el corte en el 6.º
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
  select format('%s está a %s pts del 6.º lugar (%s).', t7.nombre, public.pts(t6.puntos - t7.puntos), t6.nombre) into v_corte
  from public.tabla_equipos() t6 join public.tabla_equipos() t7 on t7.pos = 7 where t6.pos = 6;

  perform public.avisar_tabla(
    format(E'**Cruce %s cerrado**\n%s\n\n%s\n**Así queda la tabla** 👇', p_cruce, coalesce(v_enfr, 'Sin enfrentamientos de equipos.'),
      case when v_quedan > 0 then format('Quedan %s cruces para la final. %s', v_quedan, coalesce(v_corte, '')) else 'Terminó la fase de cruces.' end),
    'resultados', format('Cruce %s cerrado', p_cruce),
    format('Tabla de equipos al %s', to_char((now() at time zone 'America/Santiago')::date, 'DD-MM-YYYY')),
    null, nullif(p_cruce - 1, 0)::smallint, null);

  if p_cruce >= v_ultimo then
    select string_agg(format('%s · %s%s', public.mencion(c.perfil), coalesce(public.nombre_equipo(c.perfil), 'sin equipo'),
        case when c.como = 'especial' then ' (por puntaje personal)' else '' end), E'\n')
      into v_lista from public.clasificados_final() c;
    perform public.avisar_discord(format(E'**Estos son los clasificados a la final**\n%s\n\nFelicidades a todos. Pronto avisamos las fechas de la final.', coalesce(v_lista, 'Todavía no hay clasificados.')), 'tabla');
  end if;
end; $$;
revoke all on function public.resumen_cruce(smallint) from public, anon, authenticated;

-- Tabla semanal (domingo 23:00): la tabla como imagen; los mejores jugadores siguen en texto
create or replace function public.tabla_semanal() returns void
language plpgsql security definer set search_path = '' as $$
declare v_jug text;
begin
  if not exists (select 1 from public.puntos_liga()) then return; end if;
  select string_agg(format('%s. %s · %s · %s pts', j.pos, public.mencion(j.perfil), coalesce(public.nombre_equipo(j.perfil), 'sin equipo'), public.pts(j.puntos)), E'\n' order by j.pos)
    into v_jug from public.tabla_jugadores() j where j.pos <= 5 and j.puntos > 0;
  perform public.avisar_tabla(
    format(E'**Tabla de la semana** 👇\n\n**Mejores jugadores**\n%s\n\nA la final pasan los 6 mejores equipos.', coalesce(v_jug, 'Todavía nadie suma puntos.')),
    'tabla', 'Tabla de la semana', format('Domingo %s', to_char((now() at time zone 'America/Santiago')::date, 'DD-MM-YYYY')), null, null, null);
end; $$;
revoke all on function public.tabla_semanal() from public, anon, authenticated;

-- Revelar Wild Cards (igual que en 2026-11-11-wild-cards.sql) con la tabla como imagen y la columna WC del cruce
create or replace function public.wc_revelar(p_cruce smallint, p_ajustes jsonb, p_textos text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare v_texto text;
begin
  if not public.es_admin() then return 'Solo la organización revela las cartas.'; end if;
  if exists (select 1 from public.enfrentamientos where cruce = p_cruce and oficial and modo = '1v1' and estado = 'pendiente') then
    return 'Todavía hay duelos abiertos en este cruce: se revela cuando cierren todos.';
  end if;
  delete from public.wc_ajustes where cruce = p_cruce;
  insert into public.wc_ajustes (cruce, equipo_id, puntos, detalle)
  select p_cruce, x.equipo, x.puntos, left(coalesce(x.detalle, ''), 600)
  from jsonb_to_recordset(p_ajustes) as x(equipo bigint, puntos numeric, detalle text) where x.puntos <> 0;
  update public.wild_cards set revelada = true where cruce = p_cruce;
  insert into public.avisos_enviados (clave) values ('wc-' || p_cruce) on conflict do nothing;
  if not found then return 'Puntos actualizados (ya se había anunciado antes).'; end if;
  foreach v_texto in array coalesce(p_textos, '{}') loop perform public.avisar_discord(left(v_texto, 1950), 'resultados'); end loop;
  perform public.avisar_tabla(format('**Así queda la tabla con las Wild Cards del cruce %s** 👇', p_cruce), 'resultados',
    format('Wild Cards del cruce %s', p_cruce), 'La columna WC muestra lo que sumó cada carta (ya con el multiplicador)',
    null, null, p_cruce);
  insert into public.avisos (perfil_id, tipo, texto, enlace)
  select p.id, 'wc-revela-' || p_cruce, format('🃏 Se revelaron las Wild Cards del cruce %s. Mira quién dio vuelta la tabla.', p_cruce), '#/wildcards'
  from public.perfiles p where not exists (select 1 from public.avisos a where a.perfil_id = p.id and a.tipo = 'wc-revela-' || p_cruce);
  return null;
end; $$;
revoke all on function public.wc_revelar(smallint, jsonb, text[]) from public, anon;
grant execute on function public.wc_revelar(smallint, jsonb, text[]) to authenticated;

commit;

-- Comprobación (no publica nada): las 12 filas que irían en la imagen
select t.pos, t.nombre, public.pts(t.puntos) as puntos from public.tabla_equipos() t order by t.pos;
