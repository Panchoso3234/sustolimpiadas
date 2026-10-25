// Sala de espera en vivo: los dos asientos con su estado y su conexión, y la cuenta común (los dos parten casi a la vez).
// node pruebas/vivoEspera.mjs  (con el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const BASE = 'http://localhost:5173/', salida = {};
const juego = process.env.JUEGO ?? 'tinta', sala = `${juego}-E${Math.floor(Math.random() * 900 + 100)}`;
const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`, { ancho: 1100, alto: 800 }), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`, { ancho: 1100, alto: 800 });
try {
  await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 2, 20000);
  const asientos = (p) => p.js("[...document.querySelectorAll('.asiento')].map((x) => x.textContent)");
  salida['se ven los dos asientos conectados'] = await hasta(async () => { const t = await asientos(a); return t.length === 2 && t.every((x) => /Conectado/.test(x)); }, 15000);
  salida['se muestra la conexión con el rival en ms'] = await hasta(async () => (await asientos(a)).some((x) => /Conexión (directa|por respaldo).*\d+ ms/.test(x)), 15000);
  await a.foto(process.argv[2] ?? 'espera.png');
  await a.js("[...document.querySelectorAll('button')].find((x) => x.textContent === '¡Listo!')?.click(), 1");
  salida['al marcar Listo, el asiento lo muestra'] = await hasta(async () => (await asientos(b)).some((x) => /Listo/.test(x)), 10000);
  await b.js("[...document.querySelectorAll('button')].find((x) => x.textContent === '¡Listo!')?.click(), 1");
  // Cuándo empieza a jugar cada uno (según su propio reloj, que en esta prueba es el mismo)
  const marcar = (p) => p.js(`new Promise((listo) => { const r = setInterval(() => { if (window.__duelo?.fase() === 'jugando') { clearInterval(r); listo(Date.now()); } }, 20); setTimeout(() => { clearInterval(r); listo(0); }, 60000); })`);
  const [ta, tb] = await Promise.all([marcar(a), marcar(b)]);
  console.log('diferencia al partir:', Math.abs(ta - tb), 'ms');
  salida['los dos parten (a menos de 600 ms)'] = ta > 0 && tb > 0 && Math.abs(ta - tb) < 600;
  salida['sin errores'] = !a.errores.length && !b.errores.length;
  if (!salida['sin errores']) console.log(a.errores, b.errores);
} catch (err) { console.log('falló:', err?.message ?? err); } finally { a.cerrar(); b.cerrar(); }
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).length === 5 && Object.values(salida).every(Boolean) ? 0 : 1);
