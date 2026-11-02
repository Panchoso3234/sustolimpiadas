// Bubble Shot: capturas de la mira a 20°, 45° y 80° (con el mouse) en computador y celular, y que el disparo caiga
// en la casilla que mostró la mira (50 disparos con el bot bueno: la mira y el disparo usan la misma trayectoria).
// node pruebas/burbujas-mira.mjs <carpeta>   (servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const carpeta = process.argv[2];
for (const [ancho, alto] of [[1300, 800], [390, 844]]) {
  const p = await abrir('http://localhost:5173/?auto=1#/juegos/burbujas', { ancho, alto });
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
  await hasta(() => p.js('!!window.__burbujas'), 60000);
  await esperar(4500);
  for (const grados of [20, 45, 80]) {
    // El cañón está abajo al centro del lienzo: se pone el mouse a 300 px en ese ángulo, hacia la izquierda
    await p.js(`(() => { const c = document.querySelector('canvas.lienzo2d-canvas'), b = c.getBoundingClientRect(), a = ${grados} * Math.PI / 180;
      const cx = b.left + b.width / 2, cy = b.top + b.height * (664 / 720);
      c.dispatchEvent(new PointerEvent('pointermove', { clientX: cx - Math.cos(a) * 300, clientY: cy - Math.sin(a) * 300, pointerType: 'mouse', bubbles: true, pointerId: 1 })); return 1; })()`);
    await esperar(400);
    await p.foto(`${carpeta}/burbujas-mira-${grados}-${ancho}.png`);
  }
  console.log(`${ancho}px: capturas listas · errores`, p.errores.length ? p.errores.slice(0, 2) : 'ninguno');
  p.cerrar();
}
await limpiarPerfiles();
process.exit(0);
