// Mide cuánto tarda el creador en mostrar las miniaturas de "Armar uno propio": node pruebas/creador.mjs
// (necesita el servidor de desarrollo en el puerto 5173)
import { abrir, hasta, limpiarPerfiles } from './navegador.mjs';

for (let vez = 1; vez <= 2; vez++) {
  const p = await abrir('http://localhost:5173/?auto=1#/personaje', { ancho: 1280, alto: 800 });
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Crear el mío'))"), 60000);
  await p.js("localStorage.removeItem('susto.personaje'), [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Crear el mío')).click(), 1");
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Armar uno propio'))"), 10000);
  const t0 = Date.now();
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Armar uno propio')).click(), 1");
  const listo = await hasta(() => p.js("document.querySelectorAll('.creador img').length > 10 && !document.querySelector('.creador .hueco')"), 60000);
  const n = await p.js("document.querySelectorAll('.creador img').length");
  // Escribir en el nombre: antes rearmaba el modelo entero con cada letra
  const t1 = Date.now();
  const escribir = await p.js(`(async () => { const i = [...document.querySelectorAll('.creador input')].find((x) => x.type === 'text'); if (!i) return 'sin campo de nombre a la vista'; for (const l of 'Pancho prueba') { i.value += l; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => requestAnimationFrame(r)); } return 'ok'; })()`);
  console.log(`vez ${vez}: ${listo ? `${n} miniaturas en ${Date.now() - t0} ms` : 'no terminó'} · escribir 13 letras: ${escribir} en ${Date.now() - t1} ms · errores: ${p.errores.length ? p.errores.join(' | ') : 'ninguno'}`);
  p.cerrar();
}
await limpiarPerfiles();
