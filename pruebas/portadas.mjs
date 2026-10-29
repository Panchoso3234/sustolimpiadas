// Portadas de 640 × 360 para los juegos de lienzo: juega el bot unos segundos y recorta el centro del lienzo.
// node pruebas/portadas.mjs colibri:6 corte:8 ...   (necesita el servidor de desarrollo en el puerto 5173)
import { writeFileSync } from 'node:fs';
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

for (const arg of process.argv.slice(2)) {
  const [juego, seg] = arg.split(':');
  const p = await abrir(`http://localhost:5173/?auto=1&piloto=1#/juegos/${juego}`, { ancho: 1400, alto: 900 });
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
  await hasta(() => p.js(`!!window.__${juego}`), 60000);
  await esperar(Number(seg) * 1000);
  const r = await p.js("(() => { const b = document.querySelector('canvas.lienzo2d-canvas').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()");
  const h = Math.min(r.h - 60, (r.w * 9) / 16), w = (h * 16) / 9;
  const foto = await p.cdp('Page.captureScreenshot', { format: 'png', clip: { x: r.x + (r.w - w) / 2, y: r.y + 30 + (r.h - 60 - h) / 2, width: w, height: h, scale: 360 / h } });
  writeFileSync(`public/juegos/${juego}.png`, Buffer.from(foto.result.data, 'base64'));
  console.log('portada', juego, p.errores.length ? p.errores : 'sin errores');
  p.cerrar();
}
await limpiarPerfiles();
process.exit(0);
