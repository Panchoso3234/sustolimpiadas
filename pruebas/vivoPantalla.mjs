// En vivo, pantalla dividida: mientras juegas, tu juego ocupa todo el ancho y el rival va en una ventanita
// (o en una barra, en los juegos sin espejo). Antes el juego tenía 2/3 del ancho (reporte de Infinite, 2026-10-31).
// node pruebas/vivoPantalla.mjs [carpeta-fotos]   (con el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const fotos = process.argv[2], salida = {};
const caso = async (juego) => {
  const sala = `${juego}-P${Math.floor(Math.random() * 900 + 100)}`;
  const a = await abrir(`http://localhost:5173/?invitado=a#/juegos/vivo/${sala}`, { ancho: 1280, alto: 800 });
  const b = await abrir(`http://localhost:5173/?invitado=b#/juegos/vivo/${sala}`, { ancho: 1280, alto: 800 });
  const listo = (p) => hasta(() => p.js("(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '¡Listo!'); if (x) x.click(); return !!x; })()"), 30000);
  try {
    await listo(a); await listo(b);
    await hasta(() => a.js("window.__duelo?.fase() === 'jugando'"), 40000);
    await esperar(2500);
    const m = await a.js(`(() => {
      const zona = document.querySelector('.duelo-zona'), mio = document.querySelector('.duelo-mio');
      const z = zona.getBoundingClientRect(), j = mio.getBoundingClientRect();
      return { clase: zona.className, ancho: Math.round(j.width / z.width * 100), alto: Math.round(j.height), vent: !!document.querySelector('.duelo-ventanita'), barra: !!document.querySelector('.duelo-barra-rival') };
    })()`);
    console.log(juego, JSON.stringify(m));
    salida[`${juego}: tu juego usa todo el ancho (${m.ancho} %)`] = m.ancho >= 98;
    salida[`${juego}: tu juego mide al menos 600 px de alto (${m.alto})`] = m.alto >= 600;
    salida[`${juego}: el rival va en ${juego === 'laberinto' ? 'una barra' : 'una ventanita'}`] = juego === 'laberinto' ? m.barra && !m.vent : m.vent && !m.barra;
    salida[`${juego}: sin errores`] = !a.errores.length && !b.errores.length;
    if (a.errores.length) console.log(a.errores.slice(0, 3));
    if (juego !== 'laberinto') { await esperar(6000); const ve = await a.js("(() => { const l = window.__duelo.lado(); return window.__duelo.foto(l === 'a' ? 'b' : 'a'); })()"); console.log(juego, 'ventanita con imagen del rival:', ve); salida[`${juego}: la ventanita muestra la pantalla del rival`] = ve; }
    if (fotos) await a.foto(`${fotos}/vivo-${juego}.png`);
  } catch (err) { console.log(juego, 'falló:', err?.message ?? err); } finally { a.cerrar(); b.cerrar(); }
};
await caso('colibri');
await caso('laberinto');
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).length === 9 && Object.values(salida).every(Boolean) ? 0 : 1);
