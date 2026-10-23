// Abre el Billar en el navegador sin ventana, saca fotos, tira unas bolas y mide cuadros por segundo:
// node pruebas/billarVista.mjs [carpeta para las fotos]  (necesita el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const carpeta = process.argv[2] ?? '.';
const p = await abrir('http://localhost:5173/?auto=1#/juegos/billar', { ancho: 1280, alto: 720 });
await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
await hasta(() => p.js('!!window.__billar'), 60000);
await esperar(4500);
await p.js("document.querySelector('[class*=tutorial], [class*=ayuda]')?.click(), 1");
await esperar(800);
await p.foto(`${carpeta}/billar-mesa.png`);
const fps = await p.js('new Promise((listo) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else listo(Math.round(n / 3)); }; requestAnimationFrame(f); })');
console.log('cuadros por segundo:', fps);
// Tres tiros hacia la primera bola que queda
for (let i = 0; i < 3; i++) {
  await p.js("(() => { const b = window.__billar.bolas(), bl = b[0], o = b.find((x) => x.n && !x.dentro); window.__billar.tirar(0.55, Math.atan2(o.x - bl.x, o.z - bl.z)); return 1; })()");
  await esperar(400);
  if (i === 0) await p.foto(`${carpeta}/billar-tiro.png`);
  await hasta(() => p.js('!window.__billar.estado().rodando'), 20000);
  await esperar(2200);
  console.log('después del tiro', i + 1, JSON.stringify(await p.js('window.__billar.estado()')));
}
console.log('errores:', p.errores.length ? p.errores : 'ninguno');
p.cerrar();
await limpiarPerfiles();
