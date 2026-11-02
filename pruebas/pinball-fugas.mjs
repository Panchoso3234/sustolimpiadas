// node pruebas/pinball-fugas.mjs (servidor de desarrollo en el puerto 5173). 3 partidas por bot, a velocidad real.
// Mide por dónde se va la pelota en Pinball (centro entre flippers o costados) y cuánto vive cada una.
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';
const partida = async (piloto, semilla) => {
  const p = await abrir(`http://localhost:5173/?auto=1&piloto=${piloto}&semilla=${semilla}#/juegos/pinball`, { ancho: 1000, alto: 760 });
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
  await hasta(() => p.js('!!window.__pinball'), 60000);
  // Se registra en la página: cada 1/60 s, la última posición de cada pelota antes de desaparecer
  await p.js(`(() => { window.__fugas = []; let previo = [], t0 = performance.now(), nace = performance.now();
    const mirar = () => { const s = window.__pinball?.(); if (!s || s.terminado) return; const pos = s.pos;
      if (pos.length < previo.length || (previo.length === 1 && pos.length === 1 && previo[0][1] > 600 && pos[0][1] >= 670 && pos[0][0] > 440 && previo[0][0] < 440)) {
        for (const b of previo) if (b[1] > 560 && b[0] < 440) window.__fugas.push({ x: b[0], y: b[1], vx: b[2], vy: b[3], vida: Math.round((performance.now() - nace) / 100) / 10 });
        nace = performance.now(); }
      previo = pos; requestAnimationFrame(mirar); };
    requestAnimationFrame(mirar); return 1; })()`);
  await hasta(() => p.js('window.__pinball().terminado'), 400000).catch(() => {});
  const s = await p.js('window.__pinball()'), fugas = await p.js('window.__fugas');
  p.cerrar();
  return { s, fugas };
};
const todas = { '1': [], torpe: [] }, puntos = { '1': [], torpe: [] }, duracion = { '1': [], torpe: [] };
for (const piloto of ['torpe', '1']) for (const semilla of ['a', 'b', 'c']) {
  const { s, fugas } = await partida(piloto, semilla);
  todas[piloto].push(...fugas); puntos[piloto].push(s.puntos); duracion[piloto].push(s.seg);
  console.log(piloto, semilla, 'puntos', s.puntos, 'duró', s.seg, 's · caídas', fugas.length);
}
for (const piloto of ['torpe', '1']) {
  const f = todas[piloto], centro = f.filter((x) => x.x > 205 && x.x < 275).length, izq = f.filter((x) => x.x <= 205).length, der = f.filter((x) => x.x >= 275).length;
  const vida = f.map((x) => x.vida).sort((a, b) => a - b);
  console.log(`\n${piloto === '1' ? 'BUENO' : 'TORPE'}: ${f.length} caídas · por el centro ${centro} · por la izquierda ${izq} · por la derecha ${der}`);
  console.log('  vida de cada pelota (s): mediana', vida[Math.floor(vida.length / 2)], '· mínimo', vida[0], '· máximo', vida[vida.length - 1]);
  console.log('  x de cada caída:', f.map((x) => x.x).join(', '));
  console.log('  velocidad al caer (vy):', f.map((x) => x.vy).join(', '));
}
await limpiarPerfiles(); process.exit(0);
