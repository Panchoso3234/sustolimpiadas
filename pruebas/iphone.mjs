// Mide cuánto de la pantalla ocupa el juego en un "iPhone" (táctil, sin pantalla completa, como Safari en iOS):
// node pruebas/iphone.mjs [juego]  (necesita el servidor de desarrollo en el puerto 5173)
// Imprime, por tamaño, el alto del lienzo sobre el alto de la ventana, cuántas filas ocupa la botonera,
// los cuadros por segundo y guarda una captura en pruebas/resumen/.
import { mkdirSync } from 'node:fs';
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const juego = process.argv[2] ?? 'corte';
const TAMANOS = [[390, 844, 'iphone14'], [375, 667, 'iphoneSE'], [844, 390, 'horizontal']];
mkdirSync('pruebas/resumen', { recursive: true });

for (const [ancho, alto, nombre] of TAMANOS) {
  const p = await abrir('about:blank', { ancho, alto });
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 2, mobile: true });
  await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await p.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  // Safari en iPhone no permite pantalla completa en páginas
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });" });
  await p.cdp('Page.navigate', { url: `http://localhost:5173/?auto=1#/juegos/${juego}` });
  const jugando = await hasta(() => p.js("!!document.querySelector('.sala.fase-jugando canvas')"), 60000);
  await esperar(2500);
  const m = await p.js(`(() => {
    const lienzo = document.querySelector('.sala .juego-caja canvas').getBoundingClientRect();
    const botones = [...document.querySelectorAll('.sala-salir .boton')].map((b) => Math.round(b.getBoundingClientRect().top));
    return { lienzo: Math.round(lienzo.height), arriba: Math.round(lienzo.top), ventana: innerHeight, filas: new Set(botones).size,
      desborde: document.documentElement.scrollWidth > innerWidth };
  })()`);
  const fps = await p.js('new Promise((listo) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else listo(Math.round(n / 2)); }; requestAnimationFrame(f); })');
  await p.foto(`pruebas/resumen/iphone-${juego}-${nombre}.png`);
  console.log(`${nombre.padEnd(10)} ${ancho}x${alto} · jugando ${jugando} · lienzo ${m.lienzo}/${m.ventana} px = ${Math.round((100 * m.lienzo) / m.ventana)} % · empieza en y=${m.arriba} · botonera ${m.filas} fila(s) · ${fps} cuadros/s${m.desborde ? ' · ¡DESBORDA A LO ANCHO!' : ''}`);
  if (p.errores.length) console.log('   errores:', p.errores);
  p.cerrar();
  await esperar(800);
}
await limpiarPerfiles();
