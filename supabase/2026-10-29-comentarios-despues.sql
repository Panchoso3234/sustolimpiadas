-- Las Sustolimpiadas · 29 de octubre · Comentarios después del duelo (pedido de Palta: "para el show").
-- La misma tabla de declaraciones ahora guarda dos frases por jugador y duelo: 'antes' (como siempre) y 'despues'
-- (una vez cerrado el duelo). Mismo largo (140), mismo filtro, la organización las puede ocultar y La Cuarta las cita.
-- Ejecutar UNA vez, antes de publicar la web nueva.

alter table public.declaraciones add column if not exists momento text not null default 'antes';
alter table public.declaraciones drop constraint if exists declaraciones_momento_check;
alter table public.declaraciones add constraint declaraciones_momento_check check (momento in ('antes', 'despues'));
alter table public.declaraciones drop constraint if exists declaraciones_pkey;
alter table public.declaraciones add primary key (enfrentamiento_id, perfil_id, momento);

-- Antes del duelo: igual que hasta ahora, pero solo toca la frase de 'antes'
create or replace function public.declarar(p_enf bigint, p_texto text) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.enfrentamientos%rowtype; v_yo uuid := (select auth.uid()); v_rival uuid; v_texto text := btrim(coalesce(p_texto, '')); v_nueva boolean; v_nombre text;
begin
  if v_yo is null then return 'Hay que entrar con Discord.'; end if;
  select * into e from public.enfrentamientos where id = p_enf;
  if not found or e.modo <> '1v1' or e.estado <> 'pendiente' then return 'Este duelo ya no está abierto.'; end if;
  if v_yo = e.a_perfil then v_rival := e.b_perfil; elsif v_yo = e.b_perfil then v_rival := e.a_perfil; else return 'No eres parte de este duelo.'; end if;
  if exists (select 1 from public.enfrentamiento_marcas m where m.enfrentamiento_id = p_enf and m.perfil_id = v_yo) then return 'Ya empezaste a jugar: tu declaración quedó como estaba.'; end if;
  if v_texto = '' then delete from public.declaraciones where enfrentamiento_id = p_enf and perfil_id = v_yo and momento = 'antes'; return null; end if;
  if char_length(v_texto) > 140 then return 'Máximo 140 caracteres.'; end if;
  if v_texto ~* '(conchetumare|conchatumare|ctm|culia[od]|hijo de puta|maric[oó]n|weon culiao)' then return 'Esa frase no pasa el filtro. Picante sí, ofensivo no.'; end if;
  v_nueva := not exists (select 1 from public.declaraciones where enfrentamiento_id = p_enf and perfil_id = v_yo and momento = 'antes');
  insert into public.declaraciones (enfrentamiento_id, perfil_id, texto, momento) values (p_enf, v_yo, v_texto, 'antes')
  on conflict (enfrentamiento_id, perfil_id, momento) do update set texto = excluded.texto, actualizado = now();
  if v_nueva and v_rival is not null then
    select nombre into v_nombre from public.perfiles where id = v_yo;
    insert into public.avisos (perfil_id, de, tipo, enfrentamiento_id, texto, enlace)
    values (v_rival, v_yo, 'declaracion', p_enf, left(coalesce(v_nombre, 'Tu rival') || ' dejó una declaración antes de su duelo: «' || v_texto || '»', 300), '#/juegos/1v1');
  end if;
  return null;
end; $$;
revoke all on function public.declarar(bigint, text) from public, anon;
grant execute on function public.declarar(bigint, text) to authenticated;

-- Después del duelo: solo con el duelo cerrado y solo quienes lo jugaron. Se puede cambiar o borrar (texto vacío).
create or replace function public.comentar_duelo(p_enf bigint, p_texto text) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.enfrentamientos%rowtype; v_yo uuid := (select auth.uid()); v_rival uuid; v_texto text := btrim(coalesce(p_texto, '')); v_nueva boolean; v_nombre text;
begin
  if v_yo is null then return 'Hay que entrar con Discord.'; end if;
  select * into e from public.enfrentamientos where id = p_enf;
  if not found or e.modo <> '1v1' then return 'Este duelo no existe.'; end if;
  if e.estado <> 'cerrado' then return 'Podrás comentar cuando el duelo termine.'; end if;
  if v_yo = e.a_perfil then v_rival := e.b_perfil; elsif v_yo = e.b_perfil then v_rival := e.a_perfil; else return 'No eres parte de este duelo.'; end if;
  if v_texto = '' then delete from public.declaraciones where enfrentamiento_id = p_enf and perfil_id = v_yo and momento = 'despues'; return null; end if;
  if char_length(v_texto) > 140 then return 'Máximo 140 caracteres.'; end if;
  if v_texto ~* '(conchetumare|conchatumare|ctm|culia[od]|hijo de puta|maric[oó]n|weon culiao)' then return 'Ese comentario no pasa el filtro. Picante sí, ofensivo no.'; end if;
  v_nueva := not exists (select 1 from public.declaraciones where enfrentamiento_id = p_enf and perfil_id = v_yo and momento = 'despues');
  insert into public.declaraciones (enfrentamiento_id, perfil_id, texto, momento) values (p_enf, v_yo, v_texto, 'despues')
  on conflict (enfrentamiento_id, perfil_id, momento) do update set texto = excluded.texto, actualizado = now();
  if v_nueva and v_rival is not null then
    select nombre into v_nombre from public.perfiles where id = v_yo;
    insert into public.avisos (perfil_id, de, tipo, enfrentamiento_id, texto, enlace)
    values (v_rival, v_yo, 'declaracion', p_enf, left(coalesce(v_nombre, 'Tu rival') || ' comentó su duelo contigo: «' || v_texto || '»', 300), '#/juegos/duelo/' || p_enf);
  end if;
  return null;
end; $$;
revoke all on function public.comentar_duelo(bigint, text) from public, anon;
grant execute on function public.comentar_duelo(bigint, text) to authenticated;

-- Moderación: ahora se oculta cada frase por separado (antes o después)
drop function if exists public.ocultar_declaracion(bigint, uuid, boolean);
create or replace function public.ocultar_declaracion(p_enf bigint, p_perfil uuid, p_oculta boolean, p_momento text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo la organización puede moderar'; end if;
  update public.declaraciones set oculta = p_oculta where enfrentamiento_id = p_enf and perfil_id = p_perfil and momento = p_momento;
end; $$;
revoke all on function public.ocultar_declaracion(bigint, uuid, boolean, text) from public, anon;
grant execute on function public.ocultar_declaracion(bigint, uuid, boolean, text) to authenticated;

-- Aviso a todos en la campana (una vez)
insert into public.avisos (perfil_id, tipo, texto, enlace)
select p.id, 'comentarios-nuevo', 'Nuevo: cuando termina un duelo puedes dejar tu comentario (140 caracteres). Tu rival lo ve y La Cuarta lo puede citar.', '#/juegos/1v1'
from public.perfiles p
where not exists (select 1 from public.avisos a where a.perfil_id = p.id and a.tipo = 'comentarios-nuevo');

-- Comprobación: debe mostrar la columna momento y las dos funciones
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'declaraciones' and column_name = 'momento'
union all select 'comentar_duelo' where to_regprocedure('public.comentar_duelo(bigint,text)') is not null
union all select 'ocultar_declaracion' where to_regprocedure('public.ocultar_declaracion(bigint,uuid,boolean,text)') is not null;
