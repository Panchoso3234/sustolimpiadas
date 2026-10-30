// El bot de Discord toma los nombres de los juegos de la tabla nombres_juegos; si falta uno, escribe su id ("corte").
// Este script arma el SQL que la deja igual al catálogo del sitio. Correrlo cada vez que se agrega o renombra un juego:
//   node pruebas/nombres-sql.mjs > supabase/<fecha>-nombres-juegos.sql   (y ejecutarlo en el SQL Editor)
import { readFileSync } from 'node:fs';

const cat = readFileSync(new URL('../src/juegos/catalogo.ts', import.meta.url), 'utf8');
const juegos = [...cat.matchAll(/j\(\d+, '([a-z0-9]+)', '([^']+)'/g)].map((m) => [m[1], m[2]]);
if (juegos.length < 40) throw new Error(`Solo se leyeron ${juegos.length} juegos del catálogo: revisar el patrón`);
const texto = (s) => `'${s.replaceAll("'", "''")}'`;
console.log(`-- Nombres de los juegos para el bot (generado desde src/juegos/catalogo.ts: ${juegos.length} juegos).
insert into public.nombres_juegos (id, nombre) values
${juegos.map(([id, nombre]) => `  (${texto(id)}, ${texto(nombre)})`).join(',\n')}
on conflict (id) do update set nombre = excluded.nombre;

-- Comprobación: debe dar ${juegos.length}
select count(*) from public.nombres_juegos where id in (${juegos.map(([id]) => texto(id)).join(', ')});`);
