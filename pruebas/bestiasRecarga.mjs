// Bestiario en vivo: un jugador recarga la página a mitad del duelo y el combate debe terminar igual para los dos.
// node pruebas/bestiasRecarga.mjs  (con el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const BASE = 'http://localhost:5173/', sala = `bestias-R${Math.floor(Math.random() * 900 + 100)}`;
const url = (q) => `${BASE}?invitado=${q}&piloto=1#/juegos/vivo/${sala}`;
const a = await abrir(url('a'), { ancho: 1400, alto: 800 }), b = await abrir(url('b'), { ancho: 1400, alto: 800 });
const salida = {};
const estado = (p) => p.js('window.__bestias?.().combate ?? null');
const listo = (p) => hasta(() => p.js(`(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '¡Listo!'); if (x) x.click(); return !!x; })()`), 30000);
try {
  await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 2, 30000);
  await listo(a); await listo(b);
  await hasta(async () => ((await estado(a))?.turno ?? 0) >= 3, 120000);
  const antes = await estado(b);
  console.log('B recarga en el turno', antes?.turno);
  await b.js('location.reload(), 1');
  await esperar(4000);
  // Si la sala pide confirmar de nuevo, se confirma
  await hasta(() => b.js(`(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '¡Listo!'); if (x) x.click(); return !!window.__bestias?.().combate; })()`), 60000);
  salida['B vuelve al duelo después de recargar'] = true;
  const texto = (p) => p.js('document.querySelector(".duelo-fin")?.textContent');
  salida['el duelo termina para los dos'] = await hasta(async () => !!(await texto(a)) && (await texto(a)) === (await texto(b)), 400000);
  const [x, y] = [await estado(a), await estado(b)];
  console.log('A', JSON.stringify(x), '\nB', JSON.stringify(y));
  salida['los dos llegan al mismo combate'] = !!x && x.ganador !== null && JSON.stringify(x) === JSON.stringify(y);
  salida['sin errores'] = !a.errores.length && !b.errores.length;
  if (!salida['sin errores']) console.log(a.errores, b.errores);
} catch (err) { console.log('falló:', err?.message ?? err); } finally { a.cerrar(); b.cerrar(); }
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).length >= 4 && Object.values(salida).every(Boolean) ? 0 : 1);
