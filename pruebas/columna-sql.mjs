// Arma el SQL que guarda la columna de Claudio Palma de un cruce (como borrador) y la publica.
//   node pruebas/columna-sql.mjs <cruce>   (lee supabase/columnas/cruce-<n>.txt)
// Va entre $columna$ … $columna$: así el texto no necesita escapar comillas.
import { readFileSync } from 'node:fs';

const cruce = Number(process.argv[2]);
const texto = readFileSync(new URL(`../supabase/columnas/cruce-${cruce}.txt`, import.meta.url), 'utf8').trim();
if (!cruce || texto.includes('$columna$')) throw new Error('Cruce inválido o texto con $columna$');
if (texto.length > 4000) throw new Error(`La columna tiene ${texto.length} caracteres (máximo 4000)`);
console.log(`-- Columna de Claudio Palma del cruce ${cruce} (${texto.length} caracteres). Ejecutar UNA vez: publica y avisa.
insert into public.columnas (cruce, texto) values (${cruce}, $columna$${texto}$columna$)
on conflict (cruce) do update set texto = excluded.texto where public.columnas.estado = 'borrador';

select public.publicar_columna(${cruce}::smallint) as resultado; -- vacío (null) = publicada`);
