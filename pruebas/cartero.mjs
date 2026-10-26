// Ruta del Cartero 2.0: un bot que entrega la mejor ruta lo más rápido posible y otro que entrega las casas en orden (1, 2, 3...).
// El perfecto debe sacar mucho más; los dos deben poder terminar los tres repartos. node pruebas/cartero.mjs
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';
const p = await abrir('http://localhost:5173/#/juegos', { ancho: 1100, alto: 760 }), salida = {};
await p.js('try { localStorage.setItem("susto.panelMiembros", "no"); localStorage.setItem("susto.reglasVistas", JSON.stringify(["cartero"])) } catch {}; 1');
const fase = () => p.js('([...(document.querySelector(".sala")?.classList ?? [])].find((x) => x.startsWith("fase-")) ?? "").slice(5)');
async function jugar(bot, pausa) {
  await p.js('location.hash = "#/juegos"; setTimeout(() => { location.hash = "#/juegos/cartero"; }, 300), 1'); await esperar(2500);
  await p.js('[...document.querySelectorAll("button")].find((b) => b.textContent === "Práctica (no guarda)")?.click(), 1');
  if (!(await hasta(async () => (await fase()) === 'jugando', 40000))) return null;
  for (let rep = 0; rep < 3; rep++) {
    await hasta(async () => (await p.js('window.__cartero?.().reparto')) === rep && (await p.js('window.__cartero?.().ruta.length')) === 0, 8000);
    const est = await p.js('window.__cartero()');
    const orden = bot === 'perfecto' ? est.optimo : Array.from({ length: est.casas }, (_, i) => i + 1);
    for (const i of orden) { await p.js(`document.querySelectorAll(".mapa g.casa")[${i - 1}].dispatchEvent(new MouseEvent("click", { bubbles: true })), 1`); await esperar(pausa); }
    await p.js('[...document.querySelectorAll("button")].find((b) => b.textContent === "Entregar").click(), 1');
    await esperar(300);
  }
  await hasta(async () => (await fase()) === 'resultado', 10000);
  const pts = Number(await p.js('document.querySelector(".puntaje b")?.textContent'));
  console.log(bot, pts, 'pts ·', await p.js('[...document.querySelectorAll(".desglose div")].map((d) => d.textContent).join(" · ")'));
  return pts;
}
try {
  const a = await jugar('perfecto', 150), b = await jugar('en orden', 150);
  salida['el perfecto termina los tres repartos'] = a > 2000;
  salida['entregar en orden saca bastante menos'] = b < a * 0.75;
  salida['sin errores'] = !p.errores.length; if (p.errores.length) console.log(p.errores.slice(0, 3));
} catch (e) { console.log('falló:', e?.message ?? e); } finally { p.cerrar(); }
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).length === 3 && Object.values(salida).every(Boolean) ? 0 : 1);
