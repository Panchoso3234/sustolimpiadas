// Corre el Gran Premio con el piloto automático y anota cómo van los rivales: node pruebas/karts.mjs
// (necesita el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const p = await abrir('http://localhost:5173/?auto=1&piloto=1#/juegos/karts', { ancho: 1100, alto: 700 });
await hasta(() => p.js('!!window.__karts'), 60000);
await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Gira el celular'))?.click(), 1");
const inicio = Date.now();
let fin = false;
while (!fin && Date.now() - inicio < 330000) {
  await esperar(10000);
  const s = await p.js('window.__karts()');
  const total = (k) => k.vuelta * s.N + k.idx, yo = s.karts.find((k) => k.humano);
  console.log(`${Math.round((Date.now() - inicio) / 1000)} s · ${s.pista} · yo vuelta ${yo.vuelta} · rivales: ${s.karts.filter((k) => !k.humano).map((k) => `${((total(k) - total(yo)) / s.N).toFixed(2)}v (${k.v} m/s, ${k.destreza})`).join(' | ')}`);
  fin = !!(await p.js("document.body.innerText.includes('RESULTADO')"));
}
console.log((await p.js("document.body.innerText.match(/Puesto[\\s\\S]{0,120}/)?.[0] ?? 'sin resultado'")).replace(/\n/g, ' '));
console.log('errores:', p.errores.length ? p.errores : 'ninguno');
p.cerrar();
await limpiarPerfiles();
