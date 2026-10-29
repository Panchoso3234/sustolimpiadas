// Vistazo a un juego de lienzo: juega el bot unos segundos, mide cuadros por segundo y saca una foto.
// node pruebas/vistazo.mjs <juego> <segundos> <carpeta> [ancho alto]   (servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const [juego, seg, carpeta, ancho = 1300, alto = 800] = process.argv.slice(2);
const p = await abrir(`http://localhost:5173/?auto=1&piloto=1#/juegos/${juego}`, { ancho: Number(ancho), alto: Number(alto) });
await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
await hasta(() => p.js(`!!window.__${juego}`), 60000);
await esperar(Number(seg) * 1000);
const fps = await p.js('new Promise((listo) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else listo(Math.round(n / 2)); }; requestAnimationFrame(f); })');
const capa3d = await p.js("(() => { const c = document.querySelector('canvas.lienzo3d'); if (!c) return null; const gl = c.getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'sí'; })()");
await p.foto(`${carpeta}/${juego}-${ancho}.png`);
console.log(`${juego} ${ancho}px: ${fps} cuadros/s · 3D ${capa3d ?? 'no'} · ${JSON.stringify(await p.js(`window.__${juego}?.()`))} · ${JSON.stringify(await p.js("window.__lienzo?.()"))}}`);
console.log('errores:', p.errores.length ? p.errores.slice(0, 3) : 'ninguno');
p.cerrar();
await limpiarPerfiles();
process.exit(0);
