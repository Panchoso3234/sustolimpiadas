// Capturas de los juegos nuevos a media partida (velocidad normal), en computador y en celular, para revisarlas a ojo.
// node pruebas/nuevosFotos.mjs <carpeta> [juegos separados por coma]
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const [carpeta, lista = 'lapidas,cascada,burbujas,pinball,pesca'] = process.argv.slice(2);
for (const juego of lista.split(',')) for (const [nombre, ancho, alto] of [['pc', 1300, 800], ['cel', 390, 844]]) {
  const p = await abrir(`http://localhost:5173/?auto=1&piloto=1&semilla=foto#/juegos/${juego}`, { ancho, alto });
  try {
    await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
    await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
    await hasta(() => p.js(`!!window.__${juego}`), 60000);
    await esperar(14000);
    await p.foto(`${carpeta}/${juego}-${nombre}-juego.png`);
    console.log(juego, nombre, 'ok', p.errores.length ? p.errores[0] : '');
  } catch (err) { console.log(juego, nombre, 'falló', err?.message ?? err); } finally { p.cerrar(); }
}
await limpiarPerfiles();
process.exit(0);
