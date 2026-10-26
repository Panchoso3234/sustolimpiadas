// Lava Loca y Puertas Falsas 2.0: los bots tontos deben sacar poco y el perfecto mucho.
//  · saltador (Lava Loca): mantiene "adelante" y salta cada 0,35 s sin mirar.
//  · azar (Puertas Falsas): corre hacia una puerta al azar en cada muro, sin recordar nada.
//  · perfecto (Puertas Falsas): conoce las puertas buenas (gancho de desarrollo) y corre derecho a ellas.
// node pruebas/carreras.mjs [veces]   (con el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const veces = Number(process.argv[2] ?? 2), salida = {};
const p = await abrir('http://localhost:5173/#/juegos', { ancho: 1100, alto: 700 });
await esperar(2000);
await p.js('try { localStorage.setItem("susto.panelMiembros", "no"); localStorage.setItem("susto.reglasVistas", JSON.stringify(["rodillos", "puertas"])) } catch {}; 1');
const fase = () => p.js('([...(document.querySelector(".sala")?.classList ?? [])].find((x) => x.startsWith("fase-")) ?? "").slice(5)');
const tecla = (tipo, key) => p.js(`window.dispatchEvent(new KeyboardEvent("${tipo}", { key: ${JSON.stringify(key)} })), 1`);
const soltarTodo = async () => { for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight', ' ']) await tecla('keyup', k); };

async function partida(juego, bot) {
  await p.js(`location.hash = "#/juegos"; setTimeout(() => { location.hash = "#/juegos/${juego}"; }, 300), 1`); await esperar(2500);
  await p.js('[...document.querySelectorAll("button")].find((b) => b.textContent === "Práctica (no guarda)")?.click(), 1');
  if (!(await hasta(async () => (await fase()) === 'jugando', 60000))) return null;
  await tecla('keydown', 'ArrowUp');
  const t0 = Date.now();
  let lado = '';
  while ((await fase()) === 'jugando' && Date.now() - t0 < 170000) {
    if (bot === 'saltador') { await tecla('keydown', ' '); await esperar(60); await tecla('keyup', ' '); await esperar(290); continue; }
    const yo = await p.js('window.__carrera?.()'), buenas = await p.js('window.__puertasBuenas?.()');
    if (!yo || !buenas) { await esperar(100); continue; }
    // La próxima fila de puertas por delante
    const delante = buenas.filter((b) => b.z < yo.z - 0.3).sort((a, b) => b.z - a.z);
    let objetivo = 0;
    if (bot === 'perfecto' && delante.length) objetivo = delante[0].x;
    if (bot === 'azar') { const z = delante[0]?.z ?? 0; if (!partida.z || partida.z !== z || yo.fallos !== partida.f) { partida.z = z; partida.f = yo.fallos; partida.x = (Math.random() - 0.5) * 8; } objetivo = partida.x; }
    const quiero = Math.abs(objetivo - yo.x) < 0.25 ? '' : objetivo > yo.x ? 'ArrowRight' : 'ArrowLeft';
    if (quiero !== lado) { if (lado) await tecla('keyup', lado); if (quiero) await tecla('keydown', quiero); lado = quiero; }
    await esperar(50);
  }
  await soltarTodo();
  const pts = await p.js('document.querySelector(".puntaje b")?.textContent');
  const lineas = await p.js('[...document.querySelectorAll(".desglose div")].map((d) => d.textContent).join(" · ")');
  console.log(`${juego} · ${bot}: ${pts} pts · ${lineas}`);
  return Number(pts);
}

try {
  for (let i = 0; i < veces; i++) {
    const s = await partida('rodillos', 'saltador'); (salida.saltador ??= []).push(s);
    const a = await partida('puertas', 'azar'); (salida.azar ??= []).push(a);
    const b = await partida('puertas', 'perfecto'); (salida.perfecto ??= []).push(b);
  }
} catch (e) { console.log('falló:', e?.message ?? e); }
const prom = (l) => Math.round((l ?? []).reduce((s, x) => s + (x ?? 0), 0) / Math.max(1, (l ?? []).length));
console.log('promedios →', 'saltador (Lava Loca):', prom(salida.saltador), '· azar (Puertas):', prom(salida.azar), '· perfecto (Puertas):', prom(salida.perfecto));
const ok = prom(salida.azar) < prom(salida.perfecto) / 3;
console.log(`${ok ? 'OK  ' : 'MAL '} el bot al azar saca menos de un tercio del perfecto en Puertas Falsas`);
console.log(`${p.errores.length ? 'MAL ' : 'OK  '} sin errores`, p.errores.slice(0, 3));
p.cerrar(); await limpiarPerfiles(); process.exit(ok && !p.errores.length ? 0 : 1);
