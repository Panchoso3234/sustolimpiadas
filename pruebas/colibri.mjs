// Prueba Vuelo Colibrí: el bot bueno vuela lejos, el torpe cae pronto, sin errores, en escritorio y celular.
// node pruebas/colibri.mjs  (necesita el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const partida = async (piloto, ancho, alto, foto) => {
  const p = await abrir(`http://localhost:5173/?auto=1&piloto=${piloto}#/juegos/colibri`, { ancho, alto });
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
  await hasta(() => p.js('!!window.__colibri'), 60000);
  let s;
  for (let i = 0; i < 60; i++) {
    await esperar(1000);
    s = await p.js('window.__colibri?.()');
    if (foto && i === 12) await p.foto(foto);
    if (!s || s.terminado) break;
  }
  const fps = await p.js('new Promise((listo) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else listo(n); }; requestAnimationFrame(f); })');
  console.log(`${piloto} ${ancho}px: ${JSON.stringify(s)} · ${fps} cuadros/s`);
  const errores = p.errores;
  p.cerrar();
  return { s, errores };
};

let malos = 0;
const ok = (c, t) => { console.log(`${c ? 'OK  ' : 'MAL '} ${t}`); if (!c) malos++; };
const bueno = await partida('1', 1300, 800, process.argv[2] ? `${process.argv[2]}/colibri-escritorio.png` : null);
const torpe = await partida('torpe', 1300, 800);
const cel = await partida('1', 390, 844, process.argv[2] ? `${process.argv[2]}/colibri-celular.png` : null);
ok(bueno.s && bueno.s.huecos >= 20, `el bot bueno pasa 20 huecos o más (${bueno.s?.huecos})`);
ok(torpe.s && torpe.s.terminado && torpe.s.huecos < 5, `el torpe cae antes de 5 huecos (${torpe.s?.huecos})`);
ok(cel.s && cel.s.huecos >= 10, `en celular el bot pasa 10 o más (${cel.s?.huecos})`);
ok(![bueno, torpe, cel].some((x) => x.errores.length), `sin errores ${JSON.stringify([...bueno.errores, ...torpe.errores, ...cel.errores])}`);
await limpiarPerfiles();
process.exit(malos ? 1 : 0);
