-- Las Sustolimpiadas · 22 de octubre: llegó LaL (Manolo) → 12 equipos, todos de 3
-- Se revolvieron al azar los 9 últimos inscritos (cuidando que cada equipo tenga al menos 1 persona con cuenta):
--   Equipo 10: GiyuuSilly, el_Gato, o_Maty_o
--   Equipo 11: Izuki, Bubu, Monti
--   Equipo 12: Junior, Insterstellarglow, LaL
-- Sin cuenta todavía: el_Gato, Izuki, Bubu, Junior, Insterstellarglow (se vinculan en Mesa → Equipos cuando entren).
-- No toca los equipos 1 al 9. Si se ejecuta de nuevo, no duplica nada.

do $$
declare e10 bigint; e11 bigint; e12 bigint;
begin
  select id into e10 from public.equipos where nombre = 'Equipo 10';
  if e10 is null then insert into public.equipos (nombre) values ('Equipo 10') returning id into e10; end if;
  select id into e11 from public.equipos where nombre = 'Equipo 11';
  if e11 is null then insert into public.equipos (nombre) values ('Equipo 11') returning id into e11; end if;
  select id into e12 from public.equipos where nombre = 'Equipo 12';
  if e12 is null then insert into public.equipos (nombre) values ('Equipo 12') returning id into e12; end if;

  -- Con cuenta
  insert into public.equipo_miembros (perfil_id, equipo_id)
    select id, case nombre when 'GiyuuSilly' then e10 when 'o_Maty_o' then e10 when 'Monti' then e11 when 'LaL' then e12 end
      from public.perfiles where nombre in ('GiyuuSilly', 'o_Maty_o', 'Monti', 'LaL')
    on conflict (perfil_id) do update set equipo_id = excluded.equipo_id;

  -- Sin cuenta
  delete from public.equipo_pendientes where equipo_id in (e10, e11, e12);
  insert into public.equipo_pendientes (equipo_id, nombre) values
    (e10, 'el_Gato'),
    (e11, 'Izuki'), (e11, 'Bubu'),
    (e12, 'Junior'), (e12, 'Insterstellarglow');

  -- Por si ya se había creado algún cruce con 11 equipos (se vuelve a crear con los 12)
  delete from public.enfrentamientos where oficial and cruce is not null;
end $$;

-- Para revisar: deberían salir 12 equipos, todos con 3 personas en total
select q.nombre as equipo,
       (select nombre from public.perfiles where id = q.capitan) as capitan,
       (select string_agg(p.nombre, ', ') from public.equipo_miembros m join public.perfiles p on p.id = m.perfil_id where m.equipo_id = q.id) as con_cuenta,
       (select string_agg(x.nombre, ', ') from public.equipo_pendientes x where x.equipo_id = q.id) as sin_cuenta
  from public.equipos q order by q.id;
