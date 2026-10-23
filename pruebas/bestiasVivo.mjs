// Bestiario en vivo: dos jugadores (con el piloto de prueba) y un espectador.
// node pruebas/bestiasVivo.mjs [carpeta-fotos]  (con el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const BASE = 'http://localhost:5173/', fotos = process.argv[2];
const sala = `bestias-B${Math.floor(Math.random() * 900 + 100)}`;
const a = await abrir(`${BASE}?invitado=a&piloto=1#/juegos/vivo/${sala}`, { ancho: 1400, alto: 800 }), b = await abrir(`${BASE}?invitado=b&piloto=1#/juegos/vivo/${sala}`, { ancho: 1400, alto: 800 }), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`, { ancho: 1400, alto: 800 });
const salida = {};
const estado = (p) => p.js('window.__bestias?.().combate ?? null');
try {
  await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 3, 30000);
  for (const p of [a, b]) await hasta(() => p.js(`(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '¡Listo!'); if (x) x.click(); return !!x; })()`), 30000);
  salida['los tres entran'] = await hasta(async () => (await a.js('window.__duelo?.fase()')) === 'jugando' && (await b.js('window.__duelo?.fase()')) === 'jugando' && (await c.js('window.__duelo?.fase()')) === 'jugando', 60000);
  salida['empieza el combate con los mismos equipos'] = await hasta(async () => { const [x, y, z] = [await estado(a), await estado(b), await estado(c)]; return !!x && !!y && !!z && x.yo === y.yo && x.el === y.el && x.yo === z.yo; }, 90000);
  await esperar(15000);
  if (fotos) { for (const [p, n] of [[a, 'a'], [b, 'b'], [c, 'c']]) { await p.js("document.querySelectorAll('.sala-tutorial, .sala-teclas').forEach((x) => x.remove()), 1"); await p.foto(`${fotos}/v-${n}.png`); } }
  const texto = (p) => p.js('document.querySelector(".duelo-fin")?.textContent');
  salida['el duelo termina igual para los tres'] = await hasta(async () => { const [u, v, w] = [await texto(a), await texto(b), await texto(c)]; return !!u && u === v && u === w; }, 400000);
  const [x, y, z] = [await estado(a), await estado(b), await estado(c)];
  console.log('final:', await texto(a), '\nA', JSON.stringify(x), '\nB', JSON.stringify(y), '\nC', JSON.stringify(z));
  salida['los dos jugadores llegan al mismo combate (turnos, ganador y vida)'] = !!x && x.ganador !== null && JSON.stringify(x) === JSON.stringify(y);
  // El espectador narra lo mismo, a lo más unos turnos atrás (la sala cierra la partida al mostrar el resultado)
  salida['el espectador sigue el mismo combate'] = !!z && z.turno >= x.turno - 4;
  salida['sin errores'] = !a.errores.length && !b.errores.length && !c.errores.length;
  if (!salida['sin errores']) console.log(a.errores, b.errores, c.errores);
} finally { a.cerrar(); b.cerrar(); c.cerrar(); }
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).every(Boolean) ? 0 : 1);
