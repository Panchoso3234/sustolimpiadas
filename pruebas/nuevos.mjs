// Prueba común de los juegos nuevos (01-11): muchas partidas con bots, contadores de problemas en 0, el bot bueno saca
// más que el torpe, la misma semilla da lo mismo, celular sin errores, cuadros por segundo y capturas.
// node pruebas/nuevos.mjs <juego> <invariantes,separadas,por,coma> [partidas=8] [carpeta-fotos]
// (con el servidor de desarrollo en el puerto 5173; los juegos corren 4 veces más rápido con ?rapido=4, misma física)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const [juego, inv = '', nArg = '8', fotos] = process.argv.slice(2), N = Number(nArg), invariantes = inv.split(',').filter(Boolean);
const salida = {}, hook = `window.__${juego}`;
const partida = async ({ piloto, semilla, ancho = 1000, alto = 640, rapido = 4, foto, fps = false }) => {
  const p = await abrir(`http://localhost:5173/?auto=1&piloto=${piloto}&rapido=${rapido}&semilla=${semilla}#/juegos/${juego}`, { ancho, alto });
  try {
    await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
    await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
    await hasta(() => p.js(`!!${hook}`), 60000);
    let cuadros = null;
    if (fps) { await esperar(8000); cuadros = await p.js('new Promise((listo) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else listo(Math.round(n / 3)); }; requestAnimationFrame(f); })'); }
    if (foto) { await esperar(9000); await p.foto(foto); }
    await hasta(() => p.js(`${hook}().terminado`), 260000).catch(() => {});
    const x = await p.js(`${hook}()`);
    return { x, errores: p.errores.slice(0, 3), cuadros };
  } catch (err) { return { x: null, errores: [String(err?.message ?? err)] }; } finally { p.cerrar(); }
};
const lote = async (lista) => { const r = []; for (let i = 0; i < lista.length; i += 4) r.push(...(await Promise.all(lista.slice(i, i + 4).map(partida)))); return r; };
const mediana = (l) => { const s = [...l].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

// 1-3. Muchas partidas con semillas distintas
const buenos = await lote(Array.from({ length: N }, (_, i) => ({ piloto: '1', semilla: `b${i}` })));
const torpes = await lote(Array.from({ length: N }, (_, i) => ({ piloto: 'torpe', semilla: `t${i}` })));
for (const [nombre, lista] of [['bueno', buenos], ['torpe', torpes]]) {
  const ok = lista.filter((r) => r.x?.terminado);
  console.log(nombre, lista.map((r) => r.x ? `${r.x.puntos}${r.x.terminado ? '' : '(sin terminar)'}` : 'falló').join(' · '));
  salida[`${nombre}: las ${N} partidas terminan`] = ok.length === N;
  salida[`${nombre}: sin errores en la consola`] = lista.every((r) => !r.errores.length);
  if (lista.some((r) => r.errores.length)) console.log(nombre, 'errores:', lista.find((r) => r.errores.length).errores);
  for (const k of invariantes) { const total = lista.reduce((a, r) => a + (r.x?.[k] ?? 0), 0); salida[`${nombre}: "${k}" en 0 (hay ${total})`] = total === 0; }
}
const mb = mediana(buenos.map((r) => r.x?.puntos ?? 0)), mt = mediana(torpes.map((r) => r.x?.puntos ?? 0));
salida[`el bueno saca claramente más (mediana ${mb} contra ${mt})`] = mb > mt * 1.5 && mb > 0;
// 4. La misma semilla, dos veces
const [d1, d2] = await Promise.all([partida({ piloto: '1', semilla: 'fija' }), partida({ piloto: '1', semilla: 'fija' })]);
salida[`la misma semilla da lo mismo (${d1.x?.puntos} y ${d2.x?.puntos})`] = !!d1.x && d1.x.puntos === d2.x?.puntos;
// 5. Celular
const cel = await partida({ piloto: '1', semilla: 'cel', ancho: 390, alto: 844, foto: fotos && `${fotos}/${juego}-celular.png` });
salida['celular: termina sin errores'] = !!cel.x?.terminado && !cel.errores.length;
// 6-7. Cuadros por segundo a velocidad normal y captura de computador
const vel = await partida({ piloto: '1', semilla: 'fps', rapido: 1, ancho: 1300, alto: 800, fps: true, foto: fotos && `${fotos}/${juego}-escritorio.png` });
salida[`cuadros por segundo a velocidad normal: ${vel.cuadros}`] = (vel.cuadros ?? 0) >= 50;
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).every(Boolean) ? 0 : 1);
