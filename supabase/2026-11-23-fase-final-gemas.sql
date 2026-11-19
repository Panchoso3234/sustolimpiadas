-- Las Sustolimpiadas · lunes 23 de noviembre · 2.500 protogemas para todos al empezar la Fase 2 (plan, punto 6).
-- Ejecutar UNA vez, el lunes después de congelar la foto. Repetirlo no paga dos veces (motivo único por persona).
insert into public.gacha_movimientos (perfil_id, motivo, protogemas)
select id, 'ff-regalo-2500', 2500 from public.perfiles
on conflict (perfil_id, motivo) do nothing;

-- Comprobación: cuántos recibieron
select count(*) as recibieron from public.gacha_movimientos where motivo = 'ff-regalo-2500';
