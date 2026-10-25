// Conchas y Balsas contra la máquina: se juega una partida completa de cada uno. node pruebas/maquina.mjs <carpeta-fotos>
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';
const BASE = 'http://localhost:5173/', dir = process.argv[2] ?? '.', salida = {};
const p = await abrir(`${BASE}#/juegos/maquina/conchas`, { ancho: 1100, alto: 900 });
const turno = () => p.js('document.querySelector(".vivo-turno")?.textContent ?? ""');
try {
  await hasta(async () => (await p.js('document.querySelectorAll(".conchas-col").length')) === 7, 20000);
  // Juego siempre la primera columna libre hasta que termine
  for (let n = 0; n < 30; n++) {
    const t = await turno();
    if (/Ganaste|Ganó la máquina|Empate/.test(t)) break;
    if (/Tu turno/.test(t)) await p.js('[...document.querySelectorAll(".conchas-col")].find((b) => !b.disabled)?.click(), 1');
    await esperar(600);
  }
  salida['Conchas: la partida termina'] = /Ganaste|Ganó la máquina|Empate/.test(await turno());
  salida['Conchas: la máquina juega'] = (await p.js('document.querySelectorAll(".concha.j2, .concha.j1").length')) >= 8;
  await p.foto(`${dir}/maquina-conchas.png`);
  await p.js('location.hash = "#/juegos/maquina/balsas", 1');
  await hasta(async () => (await p.js('document.querySelectorAll(".agua-c").length')) === 128, 15000);
  await p.js('[...document.querySelectorAll("button")].find((b) => b.textContent === "Flota lista").click(), 1');
  for (let n = 0; n < 140; n++) {
    const t = await turno();
    if (/Ganaste|hundió tu flota/.test(t)) break;
    if (/Tu turno/.test(t)) await p.js('[...document.querySelectorAll(".mar-caja")[1].querySelectorAll(".agua-c")].find((b) => !b.disabled)?.click(), 1');
    await esperar(650);
  }
  salida['Balsas: la partida termina'] = /Ganaste|hundió tu flota/.test(await turno());
  await p.foto(`${dir}/maquina-balsas.png`);
  salida['sin errores'] = !p.errores.length; if (p.errores.length) console.log(p.errores);
} catch (e) { console.log('falló:', e?.message ?? e); } finally { p.cerrar(); }
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).length === 4 && Object.values(salida).every(Boolean) ? 0 : 1);
