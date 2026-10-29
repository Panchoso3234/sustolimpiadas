// Prueba común de los juegos de lienzo: bot bueno contra bot torpe, en escritorio y celular, sin errores.
// node pruebas/lienzo.mjs <juego> [carpeta-para-fotos]   (necesita el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const [juego, fotos] = process.argv.slice(2);
const partida = async (piloto, ancho, alto, foto) => {
  const p = await abrir(`http://localhost:5173/?auto=1&piloto=${piloto}#/juegos/${juego}`, { ancho, alto });
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
  await hasta(() => p.js(`!!window.__${juego}`), 60000);
  let s;
  for (let i = 0; i < 400; i++) {
    await esperar(1000);
    s = await p.js(`window.__${juego}?.()`);
    if (foto && i === 20) await p.foto(foto);
    if (!s || s.terminado) break;
  }
  console.log(`${piloto} ${ancho}px: ${JSON.stringify(s)}`);
  const errores = p.errores;
  p.cerrar();
  return { s, errores };
};
const bueno = await partida('1', 1300, 800, fotos && `${fotos}/${juego}-escritorio.png`);
const torpe = await partida('torpe', 1300, 800);
const cel = await partida('1', 390, 844, fotos && `${fotos}/${juego}-celular.png`);
const malos = [bueno, torpe, cel].filter((x) => !x.s?.terminado).length;
console.log(`${malos ? 'MAL ' : 'OK  '} las tres partidas terminaron`);
console.log(`${bueno.s.puntos > torpe.s.puntos * 2 ? 'OK  ' : 'MAL '} el bueno (${bueno.s.puntos}) saca más del doble que el torpe (${torpe.s.puntos})`);
const errores = [...bueno.errores, ...torpe.errores, ...cel.errores];
console.log(`${errores.length ? 'MAL ' : 'OK  '} sin errores ${JSON.stringify(errores)}`);
await limpiarPerfiles();
process.exit(0);
