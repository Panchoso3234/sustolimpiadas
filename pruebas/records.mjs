// Pestañas Récords (4 secciones) y Copa Individual: cargan sin errores. node pruebas/records.mjs <carpeta-fotos>
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';
const BASE = 'http://localhost:5173/', dir = process.argv[2] ?? '.', salida = {};
const p = await abrir(`${BASE}#/juegos/records`, { ancho: 1200, alto: 900 });
const clic = (t) => p.js(`[...document.querySelectorAll('.sub-modos button')].find((x) => x.textContent === ${JSON.stringify(t)})?.click(), 1`);
const texto = () => p.js('document.querySelector(".portal")?.innerText ?? ""');
try {
  salida['Individual · Siempre muestra récords'] = await hasta(async () => (await p.js('document.querySelectorAll(".records-juego li").length')) > 0, 20000);
  await p.foto(`${dir}/rec-individual.png`);
  await clic('Hoy'); await esperar(2500); console.log('Hoy:', (await texto()).slice(0, 200).replace(/\n/g, ' | '));
  await clic('Versus'); salida['Versus carga'] = await hasta(async () => /Más victorias/.test(await texto()), 15000); await esperar(1500); await p.foto(`${dir}/rec-versus.png`);
  await clic('Liga'); salida['Liga carga'] = await hasta(async () => /Historial de cruces/i.test(await texto()), 15000); await esperar(800); await p.foto(`${dir}/rec-liga.png`);
  await clic('Mis récords'); salida['Mis récords responde'] = await hasta(async () => /Entra con tu cuenta|Mi mejor marca/.test(await texto()), 15000);
  await p.js('location.hash = "#/juegos/copa", 1');
  salida['Copa carga'] = await hasta(async () => /Va aparte del torneo/.test(await texto()), 15000); await esperar(2000); await p.foto(`${dir}/copa.png`);
  salida['sin errores'] = !p.errores.length; if (p.errores.length) console.log(p.errores);
} catch (e) { console.log('falló:', e?.message ?? e); } finally { p.cerrar(); }
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).length === 6 && Object.values(salida).every(Boolean) ? 0 : 1);
