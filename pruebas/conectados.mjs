// Lista de miembros: dos personas (perfiles reales, en el canal de desarrollo) se ven en línea y con su actividad.
// node pruebas/conectados.mjs <carpeta-fotos>
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';
const BASE = 'http://localhost:5173/', dir = process.argv[2] ?? '.', salida = {};
const CHOI = 'f3738cb5-4c1d-4a61-a73a-389d94065961', GIYUU = '70a6d0e3-66a9-4e1b-946c-971f9582510e';
const a = await abrir(`${BASE}?como=${CHOI}&nombre=Choi%20Yena#/juegos/records`, { ancho: 1400, alto: 850 });
const b = await abrir(`${BASE}?como=${GIYUU}&nombre=GiyuuSilly#/juegos/tinta`, { ancho: 1400, alto: 850 });
const lista = (p) => p.js('[...document.querySelectorAll(".panel-conectados .conectado:not(.fuera)")].map((x) => x.textContent)');
try {
  salida['el panel está abierto en pantalla ancha'] = await hasta(async () => !!(await a.js('!!document.querySelector(".panel-conectados")')), 15000);
  salida['A ve a los dos en línea'] = await hasta(async () => (await lista(a)).length === 2, 20000);
  salida['A ve que B mira Tinta Tramposa'] = await hasta(async () => (await lista(a)).some((x) => /GiyuuSilly.*Viendo Tinta Tramposa/.test(x)), 10000);
  await b.js('[...document.querySelectorAll("button")].find((x) => x.textContent === "Práctica (no guarda)").click(), 1');
  salida['al jugar, A ve "Practicando Tinta Tramposa"'] = await hasta(async () => (await lista(a)).some((x) => /Practicando Tinta Tramposa/.test(x)), 20000);
  salida['B sale del juego en A como jugando (punto azul)'] = !!(await a.js('!!document.querySelector(".conectado.juega")'));
  salida['los del torneo sin pestaña salen en Desconectados'] = (await a.js('document.querySelectorAll(".conectado.fuera").length')) > 5;
  salida['el botón muestra 2 en línea'] = /2/.test(await a.js('document.querySelector(".boton-miembros").textContent'));
  await a.foto(`${dir}/miembros.png`);
  b.cerrar();
  salida['al cerrar B, A lo pasa a desconectado'] = await hasta(async () => (await lista(a)).length === 1, 20000);
  await a.js('document.querySelector(".boton-miembros").click(), 1');
  salida['el botón cierra el panel'] = await hasta(async () => !(await a.js('!!document.querySelector(".panel-conectados")')), 5000);
  salida['sin errores'] = !a.errores.length; if (a.errores.length) console.log(a.errores.slice(0, 4));
} catch (e) { console.log('falló:', e?.message ?? e); } finally { a.cerrar(); try { b.cerrar(); } catch {} }
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).every(Boolean) && Object.values(salida).length === 10 ? 0 : 1);
