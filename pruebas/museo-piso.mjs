// Ladrón del Museo: al escapar de un piso, el siguiente debe armarse aunque el modelo de un guardia no llegue nunca
// (reporte del 2026-10-30: el piso 2 quedaba a medio armar y el ladrón ya no se podía mover).
// node pruebas/museo-piso.mjs  (con el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const salida = {};
for (const [nombre, q] of [['modelos normales', ''], ['modelos de guardias que nunca llegan', 'colgar=1']]) {
  const p = await abrir(`http://localhost:5173/?auto=1&${q}#/juegos/museo`, { ancho: 900, alto: 560 });
  try {
    await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
    await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
    await hasta(() => p.js('!!window.__museo'), 60000);
    await esperar(5000);
    const t0 = Date.now();
    await p.js('window.__museo(true), 1');
    await hasta(() => p.js('window.__museo().piso === 2 && !window.__museo().cargando'), 20000).catch(() => {});
    const x = await p.js('window.__museo()'), seg = Math.round((Date.now() - t0) / 100) / 10;
    console.log(nombre, JSON.stringify(x), `${seg} s`);
    salida[`${nombre}: pasa al piso 2 y se puede seguir jugando (${seg} s)`] = x.piso === 2 && !x.cargando && x.guardias === 2;
    salida[`${nombre}: sin errores`] = !p.errores.length;
    if (p.errores.length) console.log(p.errores.slice(0, 3));
  } catch (err) { console.log('falló:', err?.message ?? err); } finally { p.cerrar(); }
}
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).length === 4 && Object.values(salida).every(Boolean) ? 0 : 1);
