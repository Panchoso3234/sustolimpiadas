// Juega un juego con su piloto de prueba y anota el resultado:
// node pruebas/piloto.mjs <juego> [veces] [rapido] [foto.png]  (necesita el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const juego = process.argv[2] ?? 'cocina', veces = Number(process.argv[3] ?? 1), rapido = Number(process.argv[4] ?? 4), foto = process.argv[5];
for (let i = 0; i < veces; i++) {
  const p = await abrir(`http://localhost:5173/?auto=1&piloto=1&rapido=${rapido}#/juegos/${juego}`, { ancho: 1280, alto: 720 });
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
  const inicio = Date.now();
  await esperar(9000);
  const fps = await p.js('new Promise((listo) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else listo(Math.round(n / 2)); }; requestAnimationFrame(f); })');
  if (foto && i === 0) { await esperar(rapido > 1 ? 8000 : 30000); await p.js("document.querySelector('[class*=tutorial], [class*=ayuda]')?.click(), 1"); await esperar(500); await p.foto(foto); }
  await hasta(() => p.js("document.body.innerText.includes('RESULTADO')"), 400000);
  const texto = await p.js("(document.body.innerText.match(/RESULTADO[\\s\\S]*?(Entra con Discord|Jugar otra vez)/)?.[0] ?? '').replace(/\\n+/g, ' · ')");
  console.log(`${fps} cuadros/s · ${Math.round((Date.now() - inicio) / 1000)} s · ${texto}`);
  if (p.errores.length) console.log('   errores:', p.errores);
  p.cerrar();
}
await limpiarPerfiles();
