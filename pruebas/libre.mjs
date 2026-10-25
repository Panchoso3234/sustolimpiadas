// Modo libre: en cada juego se abre, se adelanta el reloj bien pasado su límite y la partida sigue; "Terminar" vuelve a la pantalla previa.
// node pruebas/libre.mjs <carpeta-fotos>
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';
const BASE = 'http://localhost:5173/', dir = process.argv[2] ?? '.', salida = {};
const JUEGOS = ['tinta', 'numeros', 'parejas', 'buscaconchas', 'catapulta', 'minigolf', 'tren', 'serpientes', 'karts', 'bloques'];
const p = await abrir(`${BASE}#/juegos`, { ancho: 1100, alto: 800 });
const fase = () => p.js('([...(document.querySelector(".sala")?.classList ?? [])].find((x) => x.startsWith("fase-")) ?? "").slice(5)');
try {
  for (const j of JUEGOS) {
    await p.js(`location.hash = "#/juegos/${j}", 1`);
    const hay = await hasta(async () => (await p.js('[...document.querySelectorAll("button")].some((b) => b.textContent === "Modo libre")')), 15000);
    if (!hay) { salida[`${j}: tiene el botón Modo libre`] = false; continue; }
    await p.js('[...document.querySelectorAll("button")].find((b) => b.textContent === "Modo libre").click(), 1');
    const juega = await hasta(async () => (await fase()) === 'jugando', 40000);
    await esperar(800);
    await p.js('window.__juego?.saltar(900), 1'); // 15 minutos: más que cualquier límite
    await esperar(2500);
    const sigue = juega && (await fase()) === 'jugando';
    if (j === 'catapulta' || j === 'bloques') await p.foto(`${dir}/libre-${j}.png`);
    await p.js('[...document.querySelectorAll(".sala-salir button")].find((b) => b.textContent === "Terminar")?.click(), 1');
    const vuelve = await hasta(async () => (await fase()) === 'previa', 8000);
    salida[`${j}: sigue tras pasar el límite y Terminar vuelve`] = sigue && vuelve;
    if (!sigue || !vuelve) console.log(j, { juega, fase: await fase() });
  }
  salida['sin errores'] = !p.errores.length; if (p.errores.length) console.log(p.errores.slice(0, 5));
} catch (e) { console.log('falló:', e?.message ?? e); } finally { p.cerrar(); }
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).length === JUEGOS.length + 1 && Object.values(salida).every(Boolean) ? 0 : 1);
