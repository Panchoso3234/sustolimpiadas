// Subway Surfers: la pausa detiene el tren, un deslizamiento largo cambia un solo carril y nunca se cierran las tres vías.
// node pruebas/trenControles.mjs [corridas=6]  (con el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const corridas = Number(process.argv[2] ?? 6), salida = {};
const practicar = async (q) => {
  const p = await abrir(`http://localhost:5173/?${q}#/juegos/tren`, { ancho: 1000, alto: 640 });
  await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
  await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
  const listo = await hasta(() => p.js('!!window.__tren && window.__tren().metros > 2'), 90000);
  if (!listo) { console.log('el juego no partió:', await p.js("document.querySelector('.sala')?.className + ' | ' + (document.querySelector('.aviso.error')?.innerText ?? 'sin aviso')"), p.consola.slice(0, 3)); await p.foto('C:/Users/tarif/AppData/Local/Temp/claude/C--Users-tarif-Desktop-Cerebro/a689af5f-775b-4455-802e-e51dd73682d6/scratchpad/nopartio.png'); }
  return p;
};
const estado = (p) => p.js('window.__tren()');

// 1. Pausa: con el juego pausado 3 s, el tren no avanza ni un metro
{
  const p = await practicar('');
  await p.js("window.dispatchEvent(new CustomEvent('susto-pausa', { detail: true })), 1");
  await esperar(300);
  const antes = await estado(p);
  await esperar(3000);
  const despues = await estado(p);
  console.log('pausa:', antes.z, '→', despues.z);
  salida['la pausa detiene el tren'] = Math.abs(despues.z - antes.z) < 0.01;
  await p.js("window.dispatchEvent(new CustomEvent('susto-pausa', { detail: false })), 1");
  await esperar(600);
  salida['al seguir, el tren vuelve a correr'] = (await estado(p)).z < despues.z - 1;
  salida['pausa sin errores'] = !p.errores.length;
  p.cerrar();
}

// 2. Un deslizamiento largo hacia un lado cambia un solo carril; dos deslizamientos separados, dos carriles
{
  const p = await practicar('inmortal=1');
  const deslizar = (desde, hasta, levantar) => p.js(`(() => {
    const c = document.querySelector('.juego-caja canvas'), r = c.getBoundingClientRect(), y = r.top + r.height / 2;
    const ev = (tipo, x) => c.dispatchEvent(new PointerEvent(tipo, { pointerId: 7, clientX: r.left + x, clientY: y, bubbles: true, pointerType: 'touch' }));
    ${desde !== null ? `ev('pointerdown', ${desde});` : ''}
    return new Promise((listo) => { let x = ${desde ?? 'null'} ?? ${hasta}; const paso = () => { x += 3; ev('pointermove', Math.min(x, ${hasta})); if (x < ${hasta}) requestAnimationFrame(paso); else { ${levantar ? `ev('pointerup', ${hasta});` : ''} setTimeout(() => listo(1), 300); } }; paso(); });
  })()`);
  const g0 = (await estado(p)).gestos;
  await deslizar(200, 650, true);
  const g1 = (await estado(p)).gestos;
  console.log('cambios de carril pedidos por un gesto lento de 450 px:', g1 - g0);
  salida['un deslizamiento largo cambia un solo carril'] = g1 - g0 === 1;
  // Volver al centro y probar dos gestos separados hacia la izquierda
  const deslizarIzq = () => p.js(`(() => { const c = document.querySelector('.juego-caja canvas'), r = c.getBoundingClientRect(), y = r.top + r.height / 2;
    const ev = (tipo, x) => c.dispatchEvent(new PointerEvent(tipo, { pointerId: 8, clientX: r.left + x, clientY: y, bubbles: true, pointerType: 'touch' }));
    ev('pointerdown', 600); return new Promise((listo) => { let x = 600; const paso = () => { x -= 20; ev('pointermove', x); if (x > 480) requestAnimationFrame(paso); else { ev('pointerup', x); setTimeout(() => listo(1), 300); } }; paso(); }); })()`);
  const d0 = (await estado(p)).gestos;
  await deslizarIzq(); await deslizarIzq();
  const d1 = (await estado(p)).gestos;
  console.log('cambios pedidos por dos gestos separados:', d1 - d0);
  salida['dos deslizamientos separados cambian dos carriles'] = d1 - d0 === 2;
  if (p.errores.length) console.log(p.errores.slice(0, 3));
  salida['controles sin errores'] = !p.errores.filter((x) => !/setPointerCapture|NotFoundError/.test(x)).length;
  p.cerrar();
}

// 3. Muros: corriendo miles de metros (sin morir) nunca deben quedar las tres vías tapadas a la vez
const muros = async (q) => {
  let total = 0;
  for (let i = 0; i < corridas; i++) {
    const p = await practicar(`piloto=1&inmortal=1&vel=24&paso=0.05${q}`);
    await hasta(async () => (await estado(p)).metros >= 3000, 240000).catch(() => {});
    const x = await estado(p);
    total += x.muros;
    p.cerrar();
  }
  return total;
};
const sinArreglo = await muros('&sinarreglo=1'), conArreglo = await muros('');
console.log(`muros en ${corridas} corridas de 3.000 m: sin el arreglo ${sinArreglo}, con el arreglo ${conArreglo}`);
salida['con el arreglo no hay muros de tres trenes'] = conArreglo === 0;

for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).every(Boolean) ? 0 : 1);
