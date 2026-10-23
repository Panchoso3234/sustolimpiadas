// Prueba Serpientes: que el cursor dirija de verdad (también con turbo) y una partida con el piloto automático.
// node pruebas/serpientes.mjs  (necesita el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const empezar = async (p) => {
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
  await hasta(() => p.js('!!window.__serpientes'), 60000);
  await esperar(4000); // cuenta regresiva
};
const grados = (a) => Math.round((((a * 180) / Math.PI) % 360 + 360) % 360);

// 1) El cursor: se apunta a 8 lugares de la pantalla y la serpiente debe terminar yendo hacia allá
const p = await abrir('http://localhost:5173/?auto=1#/juegos/serpientes', { ancho: 1200, alto: 800 });
await empezar(p);
let malos = 0;
for (const [nombre, dx, dy, turbo] of [['derecha', 250, 0], ['abajo', 0, 220], ['izquierda', -250, 0], ['arriba', 0, -220], ['diagonal', 180, 180, true], ['cerca de la cabeza', 40, -30], ['izquierda con turbo', -250, 20, true], ['arriba con turbo', 10, -220, true]]) {
  const mover = (tipo) => `(() => { const c = document.querySelector('canvas'), r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('${tipo}', { clientX: r.left + r.width / 2 + ${dx}, clientY: r.top + r.height / 2 + ${dy}, pointerType: 'mouse', bubbles: true, pointerId: 1 })); return 1; })()`;
  if (turbo) await p.js(mover('pointerdown'));
  for (let i = 0; i < 8; i++) { await p.js(mover('pointermove')); await esperar(150); }
  const s = await p.js('window.__serpientes()');
  if (turbo) await p.js("window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse' })), 1");
  if (!s.viva) { console.log(`${nombre}: la serpiente murió antes de medir`); break; }
  const dif = Math.abs(((s.ang - s.meta + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const esperado = Math.atan2(dx, dy); // pantalla: derecha = +x del jardín, abajo = +z (aprox. por la inclinación)
  const contra = Math.abs(((s.ang - esperado + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const ok = dif < 0.35 && contra < 0.6;
  malos += ok ? 0 : 1;
  console.log(`${ok ? 'OK  ' : 'MAL '} ${nombre}: rumbo ${grados(s.ang)}°, apunta ${grados(s.meta)}°, cursor en ${grados(esperado)}°`);
}
console.log('errores:', p.errores.length ? p.errores : 'ninguno');
p.cerrar();

// 2) Partida con el piloto automático: muertes, cuerpos que revientan y cuadros por segundo
const q = await abrir('http://localhost:5173/?auto=1&piloto=1#/juegos/serpientes', { ancho: 1200, alto: 800 });
await empezar(q);
for (let i = 0; i < 6; i++) {
  const fps = await q.js('new Promise((listo) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else listo(Math.round(n / 2)); }; requestAnimationFrame(f); })');
  const s = await q.js('window.__serpientes?.()');
  console.log(`cuadros/s ${fps} · largo ${Math.round(s.masa)} · vivas ${s.vivas} · eliminadas ${s.eliminadas} · reventando ${s.cadaveres} · ${s.viva ? 'viva' : 'cayó'}`);
  if (await q.js("document.body.innerText.includes('RESULTADO')")) break;
  await esperar(6000);
}
console.log('errores:', q.errores.length ? q.errores : 'ninguno');
q.cerrar();
await limpiarPerfiles();
process.exit(malos ? 1 : 0);
