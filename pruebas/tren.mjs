// Fuga del Tren: el piloto sube rampas a toda velocidad y con pocos cuadros por segundo, y se cambia de vía desde los techos.
// Ninguna rampa debe matarlo ni hacerlo tropezar; en el juego normal, ningún tren que viene de frente se mete dentro de otro.
// node pruebas/tren.mjs [techos=50]  (con el servidor de desarrollo en el puerto 5173)
import { abrir, hasta, limpiarPerfiles } from './navegador.mjs';

const meta = Number(process.argv[2] ?? 50), salida = {};
const casos = [['34 m/s a 20 cuadros/s', 'rampas=1&vel=34&paso=0.05'], ['rampas a velocidad normal', 'rampas=1'], ['juego normal', '']];
for (const [nombre, q] of casos) {
  const p = await abrir(`http://localhost:5173/?auto=1&piloto=1&${q}#/juegos/tren`, { ancho: 1000, alto: 640 });
  try {
    await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
    await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
    await hasta(() => p.js('!!window.__tren'), 90000);
    const listo = async () => { const x = await p.js('window.__tren()'); return x.terminado || (q ? x.techos >= meta : x.metros >= 2500); };
    await hasta(listo, 300000).catch(() => {});
    const x = await p.js('window.__tren()');
    console.log(nombre, JSON.stringify(x));
    if (q) {
      salida[`${nombre}: ${meta} techos sin morir`] = x.techos >= meta && !x.fin && !x.revivido;
      salida[`${nombre}: se cambió de vía desde un techo sin tropezar`] = x.desdeTecho > 0 && x.tropiezos === 0;
    } else {
      salida[`${nombre}: ningún tren de frente atraviesa a otro`] = x.cruces === 0;
      salida[`${nombre}: ninguna valla o barra a menos de 22 m detrás de un tren (hay ${x.huecoMin})`] = x.huecoMin >= 22;
    }
    salida[`${nombre}: sin errores`] = !p.errores.length;
    if (p.errores.length) console.log(p.errores.slice(0, 3));
  } catch (err) { console.log('falló:', err?.message ?? err); } finally { p.cerrar(); }
}
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).length === 9 && Object.values(salida).every(Boolean) ? 0 : 1);
