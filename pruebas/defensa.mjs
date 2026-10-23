// Juega Defensa de la Torre con los pilotos de prueba y anota hasta dónde llegan:
// node pruebas/defensa.mjs [veces]  (necesita el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const veces = Number(process.argv[2] ?? 2);
const jugar = async (piloto) => {
  const p = await abrir(`http://localhost:5173/?auto=1&piloto=${piloto}&rapido=6#/juegos/defensa`, { ancho: 1100, alto: 700 });
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
  await hasta(() => p.js('!!window.__defensa'), 60000);
  const inicio = Date.now();
  let fps = 0;
  await esperar(6000);
  fps = await p.js('new Promise((listo) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else listo(Math.round(n / 2)); }; requestAnimationFrame(f); })');
  await hasta(() => p.js('window.__defensa().terminado'), 400000);
  const s = await p.js('window.__defensa()');
  const lineas = await p.js("(document.body.innerText.match(/Resultado[\\s\\S]*?Monedas sin usar\\s*\\n[^\\n]*/)?.[0] ?? '').replace(/\\n/g, ' ')");
  console.log(`${piloto.padEnd(6)} · oleada ${s.ola} · vidas ${s.vidas} · puntaje ${s.marcador} · monedas ${s.monedas} · torres ${s.torres} · ${fps} cuadros/s · ${Math.round((Date.now() - inicio) / 1000)} s\n        ${lineas}`);
  if (p.errores.length) console.log('        errores:', p.errores);
  p.cerrar();
};
for (let i = 0; i < veces; i++) { await jugar('1'); await jugar('flojo'); }
await limpiarPerfiles();
