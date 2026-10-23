// Juega Tanques de Juguete con el piloto de prueba y anota hasta dónde llega:
// node pruebas/tanques.mjs [veces] [carpeta para una foto]  (necesita el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const veces = Number(process.argv[2] ?? 2), carpeta = process.argv[3];
for (let i = 0; i < veces; i++) {
  const p = await abrir('http://localhost:5173/?auto=1&piloto=1&rapido=4#/juegos/tanques', { ancho: 1280, alto: 720 });
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
  await hasta(() => p.js('!!window.__tanques'), 60000);
  const inicio = Date.now();
  await esperar(6000);
  const fps = await p.js('new Promise((listo) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else listo(Math.round(n / 2)); }; requestAnimationFrame(f); })');
  if (carpeta && i === 0) { await hasta(() => p.js('window.__tanques().oleada >= 5 || window.__tanques().terminado'), 200000); await p.js("document.querySelector('[class*=tutorial], [class*=ayuda]')?.click(), 1"); await esperar(600); await p.foto(`${carpeta}/tanques-nuevo.png`); }
  await hasta(() => p.js('window.__tanques().terminado'), 400000);
  const s = await p.js('window.__tanques()');
  const lineas = await p.js("(document.body.innerText.match(/Resultado[\\s\\S]*?Vidas y tiempo\\s*\\n[^\\n]*/)?.[0] ?? '').replace(/\\n/g, ' ')");
  console.log(`oleada ${s.oleada} · vidas ${s.vidas} · puntaje ${s.puntos} · bajas ${s.bajas} · precisión ${s.disparos ? Math.round((100 * s.impactos) / s.disparos) : 0} % · ${fps} cuadros/s · ${Math.round((Date.now() - inicio) / 1000)} s\n   ${lineas}`);
  if (p.errores.length) console.log('   errores:', p.errores);
  p.cerrar();
}
await limpiarPerfiles();
