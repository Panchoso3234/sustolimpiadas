// Revisa Cocina Caótica sin navegador: la cocina, las recetas, el pago y las decisiones del piloto (que también
// guían el tutorial). node pruebas/cocina.mjs
import { register } from 'node:module';

// El código del juego importa sin extensión (como lo resuelve Vite): aquí se le agrega ".ts"
register(`data:text/javascript,${encodeURIComponent("export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith('.') && !/\\.\\w+$/.test(s)) return n(s + '.ts', c); throw e; } }")}`);
const { decidir, rumbo } = await import('../src/juegos/arcade/cocinaPiloto.ts');
const { COCINA, LISTO, RECETAS, revisar } = await import('../src/juegos/arcade/cocinaRecetas.ts');

const salida = {};
const malos = revisar();
salida[`la cocina y sus recetas${malos.length ? ` (${malos.join(', ')})` : ''}`] = !malos.length;

// Una cocina vacía con estaciones como las del juego
const estaciones = () => COCINA.flatMap((f, cz) => [...f].flatMap((tipo, cx) => (tipo === '.' ? [] : [{ tipo, cx, cz, encima: {}, fuego: 0 }])));
const receta = (n) => RECETAS.find((r) => r.nombre === n);
const listo = (ing) => ({ ing, estado: LISTO[ing], avance: 0 });
const v = (extra) => ({ mano: {}, estaciones: estaciones(), pedidos: [receta('Ensalada')], desde: [6, 6], ...extra });

let d = decidir(v());
salida['con las manos libres va a un cajón de la ensalada'] = ['L', 'T'].includes(d?.est.tipo);
d = decidir(v({ mano: { cosa: { ing: 'lechuga', estado: 'crudo', avance: 0 } } }));
salida['lo crudo va a la tabla'] = d?.est.tipo === 'K';
d = decidir(v({ mano: { plato: [listo('lechuga'), listo('tomate')] } }));
salida['el plato completo va a la ventanilla'] = d?.est.tipo === 'E';
d = decidir(v({ mano: { cosa: { ing: 'carne', estado: 'quemado', avance: 0 } } }));
salida['lo quemado va a la basura'] = d?.est.tipo === 'X';
const conFuego = estaciones(); conFuego.find((s) => s.tipo === 'F').fuego = 2;
d = decidir({ ...v(), estaciones: conFuego });
salida['el fuego se apaga primero (manteniendo)'] = d?.est.tipo === 'F' && d.mantener;
const sopa = estaciones(); sopa.find((s) => s.tipo === 'O').encima = { cosa: { ing: 'sopa', estado: 'cocido', avance: 8 } };
d = decidir({ ...v({ pedidos: [receta('Sopa de tomate')], mano: { plato: [listo('pan')] } }), estaciones: sopa });
salida['con plato y sopa lista va a servir a la olla'] = d?.est.tipo === 'O';
d = decidir(v({ mano: { plato: [listo('lechuga')] } }));
salida['un plato a medias se deja en un mesón alcanzable'] = d?.est.tipo === '#' && !!rumbo(6, 6, d.est);
// Cada estación tiene camino desde el centro
salida['todas las estaciones (menos esquinas) tienen camino'] = estaciones().filter((s) => s.tipo !== '#').every((s) => !!rumbo(6, 6, s));

for (const [k, ok] of Object.entries(salida)) console.log(`${ok ? 'OK  ' : 'MAL '} ${k}`);
process.exit(Object.values(salida).every(Boolean) ? 0 : 1);
