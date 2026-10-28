// Arma supabase/2026-10-27-gachapon.sql: la plantilla gachapon-base.sql más el catálogo y los banners del código
// (supabase/functions/_shared/gachapon.ts), para que la base y la web nunca se contradigan.
// Uso: node --experimental-strip-types pruebas/gachapon-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const { OBJETOS, BANNERS } = await import('../supabase/functions/_shared/gachapon.ts');
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const arr = (a) => `array[${a.map(q).join(', ')}]::text[]`;
const objetos = OBJETOS.map((o) => `  (${q(o.id)}, ${q(o.nombre)}, ${o.rareza}, ${arr(o.piezas)}, ${q(o.serie)}, ${q(o.exclusivo)})`).join(',\n');
const banners = BANNERS.map((b) => `  (${q(b.id)}, ${q(b.nombre)}, ${q(b.grupo)}, ${q(b.desde)}, ${q(b.hasta)}, ${q(b.destacado5)}, ${arr(b.destacados4)})`).join(',\n');
const base = readFileSync(new URL('../supabase/gachapon-base.sql', import.meta.url), 'utf8').replace(/^-- Las Sustolimpiadas · Gachapón \(modelo Hoyoverse\)\. Plantilla:.*\n-- `node.*\n/m, '-- Las Sustolimpiadas · 27 de octubre · Gachapón (modelo Hoyoverse). Archivo armado por pruebas/gachapon-sql.mjs: no editar a mano.\n');
const sql = `${base}
-- ───────── Catálogo (${OBJETOS.length} objetos) y banners (${BANNERS.length}) ─────────
insert into public.gacha_objetos (id, nombre, rareza, piezas, serie, exclusivo) values
${objetos}
on conflict (id) do update set nombre = excluded.nombre, rareza = excluded.rareza, piezas = excluded.piezas, serie = excluded.serie, exclusivo = excluded.exclusivo;
insert into public.gacha_banners (id, nombre, grupo, desde, hasta, destacado5, destacados4) values
${banners}
on conflict (id) do update set nombre = excluded.nombre, grupo = excluded.grupo, desde = excluded.desde, hasta = excluded.hasta, destacado5 = excluded.destacado5, destacados4 = excluded.destacados4;

-- ───────── Aviso de lanzamiento en la campana (una vez por persona) ─────────
insert into public.avisos (perfil_id, tipo, texto, enlace)
select p.id, 'gachapon-nuevo', 'Abrió el Gachapón: 10 deseos de regalo, misiones diarias y el banner Velo de Medianoche con Luna Carmesí (5 estrellas). Reclama tus recompensas.', '#/gachapon'
from public.perfiles p
where not exists (select 1 from public.avisos a where a.perfil_id = p.id and a.tipo = 'gachapon-nuevo');

-- Comprobación
select 'objetos' as gachapon, (select count(*) from public.gacha_objetos) = ${OBJETOS.length} as ok
union all select 'banners', (select count(*) from public.gacha_banners) = ${BANNERS.length}
union all select 'freno de marcas', exists (select 1 from pg_trigger where tgname = 'marcas_freno')
union all select 'anuncio de 5 estrellas', exists (select 1 from pg_trigger where tgname = 'gacha_anunciar');
`;
writeFileSync(new URL('../supabase/2026-10-27-gachapon.sql', import.meta.url), sql);
console.log(`listo: ${OBJETOS.length} objetos, ${BANNERS.length} banners`);
