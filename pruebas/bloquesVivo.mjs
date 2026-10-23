// TETRIX en vivo: dos jugadores (con el piloto de prueba) y un espectador.
// node pruebas/bloquesVivo.mjs [foto.png]  (con el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const BASE = 'http://localhost:5173/', foto = process.argv[2];
const sala = `bloques-B${Math.floor(Math.random() * 900 + 100)}`;
const a = await abrir(`${BASE}?invitado=a&piloto=1#/juegos/vivo/${sala}`, { ancho: 1400, alto: 800 }), b = await abrir(`${BASE}?invitado=b&piloto=1#/juegos/vivo/${sala}`, { ancho: 1400, alto: 800 }), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`, { ancho: 1400, alto: 800 });
const salida = {};
try {
  await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 3, 30000);
  for (const p of [a, b]) await hasta(() => p.js(`(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '¡Listo!'); if (x) x.click(); return !!x; })()`), 30000);
  salida['los tres entran a jugar o mirar'] = await hasta(async () => (await a.js('window.__duelo?.fase()')) === 'jugando' && (await b.js('window.__duelo?.fase()')) === 'jugando' && (await c.js('window.__duelo?.fase()')) === 'jugando', 60000);
  await esperar(8000);
  const va = await a.js('window.__bloquesVivo()'), vb = await b.js('window.__bloquesVivo()'), vc = await c.js('window.__bloquesVivo()');
  salida['cada jugador ve el tablero del otro'] = !!va?.rival && !!vb?.rival;
  salida['el espectador no juega'] = vc && vc.mio === null;
  salida['lo que ve A del rival coincide con B (puntos cercanos)'] = !!va?.rival && Math.abs(va.rival.puntos - vb.mio.puntos) < 2500;
  if (foto) { await c.js("document.querySelector('[class*=tutorial], [class*=ayuda]')?.click(), 1"); await esperar(300); await a.foto(foto); }
  salida['llegan lápidas (ataques) a alguno'] = await hasta(async () => ((await a.js('window.__bloquesVivo().mio.recibidas')) ?? 0) + ((await b.js('window.__bloquesVivo().mio.recibidas')) ?? 0) > 0, 120000);
  const texto = (p) => p.js('document.querySelector(".duelo-fin")?.textContent');
  salida['el duelo termina igual para los tres'] = await hasta(async () => { const [u, v, w] = [await texto(a), await texto(b), await texto(c)]; return !!u && u === v && u === w; }, 260000);
  console.log('final:', await texto(a));
  console.log('A:', JSON.stringify(await a.js('window.__bloquesVivo?.()')), '\nB:', JSON.stringify(await b.js('window.__bloquesVivo?.()')));
  salida['sin errores'] = !a.errores.length && !b.errores.length && !c.errores.length;
  if (!salida['sin errores']) console.log(a.errores, b.errores, c.errores);
} finally { a.cerrar(); b.cerrar(); c.cerrar(); }
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).every(Boolean) ? 0 : 1);
