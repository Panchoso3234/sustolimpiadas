// En vivo con un jugador en "iPhone" (táctil, sin pantalla completa): mientras juega, su partida debe tapar el sitio.
// Casos: pantalla dividida (cocos), por turnos (gemas) y tablero (conchas).
// node pruebas/iphoneVivo.mjs  (con el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const iphone = async (url) => {
  const p = await abrir('about:blank', { ancho: 390, alto: 844 });
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await p.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });" });
  await p.cdp('Page.navigate', { url });
  return p;
};
const listo = (p) => hasta(() => p.js("(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '¡Listo!'); if (x) x.click(); return !!x; })()"), 30000);
// Cuánto del alto tapa la zona enfocada y si lo de arriba a la izquierda es parte de ella (y no el encabezado del sitio)
const medir = (p) => p.js(`(() => { const z = document.querySelector('.enfocada'); if (!z) return null; const r = z.getBoundingClientRect();
  return { alto: Math.round(r.height), ventana: innerHeight, arriba: Math.round(r.top), tapa: z.contains(document.elementFromPoint(20, 20)) }; })()`);

const salida = {};
for (const [juego, nombre] of [['cocos', 'dividida'], ['gemas', 'turnos'], ['conchas', 'tablero']]) {
  const sala = `${juego}-I${Math.floor(Math.random() * 900 + 100)}`;
  const a = await iphone(`http://localhost:5173/?invitado=a#/juegos/vivo/${sala}`);
  const b = await abrir(`http://localhost:5173/?invitado=b#/juegos/vivo/${sala}`, { ancho: 900, alto: 700 });
  try {
    await listo(a); await listo(b);
    const vio = await hasta(() => a.js("!!document.querySelector('.enfocada')"), 90000);
    await esperar(1500);
    const m = vio ? await medir(a) : null;
    await a.foto(`pruebas/resumen/iphone-vivo-${juego}.png`);
    salida[`${nombre} (${juego})`] = m ? `${m.alto}/${m.ventana} px desde y=${m.arriba} · tapa el encabezado: ${m.tapa}` : 'nunca se enfocó';
    if (a.errores.length) salida[`${nombre} errores`] = a.errores;
  } finally { a.cerrar(); b.cerrar(); await esperar(1000); }
}
console.log(salida);
await limpiarPerfiles();
