-- Las Sustolimpiadas · 24 de octubre: el aviso de duelo cerrado usa los puntos de la tabla ajustes (los mismos que muestra la web:
-- hoy ganar 7, empatar 6 y perder 4, por el multiplicador de la jornada) y dice cuánto suma cada jugador con su equipo.
-- Antes tenía 10 y 3 escritos a mano. Se puede ejecutar más de una vez (no publica nada por sí solo).

create or replace function public.aviso_duelo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_p jsonb; v_mult numeric; v_gana uuid; v_pierde uuid; v_juego text; v_texto text; v_victoria numeric; v_empate numeric; v_derrota numeric;
begin
  if new.estado <> 'cerrado' or old.estado = 'cerrado' or not new.oficial or new.cruce is null or new.modo <> '1v1' then return new; end if;
  select valor into v_p from public.ajustes where clave = 'puntos';
  v_mult := coalesce((v_p -> 'multiplicadores' ->> (new.jornada - 1))::numeric, 1);
  v_victoria := trim_scale(round(coalesce((v_p ->> 'victoria')::numeric, 7) * v_mult, 2));
  v_empate := trim_scale(round(coalesce((v_p ->> 'empate')::numeric, 6) * v_mult, 2));
  v_derrota := trim_scale(round(coalesce((v_p ->> 'derrota')::numeric, 4) * v_mult, 2));
  v_juego := public.nombre_juego(new.juego);
  if new.no_jugo = 'ambos' then
    v_texto := format('Cruce %s · %s: %s y %s no jugaron (0 puntos para los dos).', new.cruce, v_juego, public.mencion(new.a_perfil), public.mencion(new.b_perfil));
  elsif new.ganador = 'empate' then
    v_texto := format('Cruce %s · %s: **empate** entre %s y %s (%s-%s). **+%s** para cada uno y su equipo.', new.cruce, v_juego, public.mencion(new.a_perfil), public.mencion(new.b_perfil), new.puntos_a, new.puntos_b, v_empate);
  else
    v_gana := case when new.ganador = 'a' then new.a_perfil else new.b_perfil end;
    v_pierde := case when new.ganador = 'a' then new.b_perfil else new.a_perfil end;
    v_texto := format('Cruce %s · %s: %s le ganó a %s %s.' || E'\n' || 'Ganador: %s suma **+%s** (también para %s).' || E'\n' || '%s',
      new.cruce, v_juego, public.mencion(v_gana), public.mencion(v_pierde),
      case when new.no_jugo is not null then '(no se presentó)' else format('%s-%s', greatest(new.puntos_a, new.puntos_b), least(new.puntos_a, new.puntos_b)) end,
      public.mencion(v_gana), v_victoria, coalesce(public.nombre_equipo(v_gana), 'su equipo'),
      case when new.no_jugo is not null then format('%s no se presentó: 0 puntos.', public.mencion(v_pierde))
        else format('Perdedor: %s suma solo **+%s** (también para %s).', public.mencion(v_pierde), v_derrota, coalesce(public.nombre_equipo(v_pierde), 'su equipo')) end);
  end if;
  perform public.avisar_discord(v_texto);
  return new;
end; $$;
