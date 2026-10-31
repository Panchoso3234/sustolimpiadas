// Guerra de Tanques: ningún tanque debe quedar metido en un bloque ni fuera de la mesa, aunque otro lo empuje
// (reporte del 2026-10-30: un tanque de máquina quedó dentro del mapa y no se podía matar).
// Prueba la versión en vivo, que es lógica pura: un jugador empuja a cada tanque de máquina en las cuatro direcciones.
// node pruebas/tanques-muros.mjs  (con el servidor de desarrollo en el puerto 5173)
import { abrir, hasta, limpiarPerfiles } from './navegador.mjs';

const p = await abrir('http://localhost:5173/', { ancho: 600, alto: 400 });
let ok = false;
try {
  await hasta(() => p.js('document.readyState === "complete"'), 60000);
  const r = await p.js(`(async () => {
    const { tanquesMundo } = await import('/src/vivo/mundo/tanques.ts');
    const { celda, COLS, FILAS } = await import('/src/juegos/arcade/tanquesPiezas.ts');
    const fuera = (e, q) => { const [cx, cz] = celda(q.x, q.z); return cx < 0 || cz < 0 || cx >= COLS || cz >= FILAS || e.grilla[cz][cx] !== '.'; };
    const quieto = tanquesMundo.quieto(), malos = [];
    // Para cada tanque de máquina y cada dirección: el jugador A se pone al lado y lo empuja 10 s seguidos
    for (const k of [2, 3]) for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const e = tanquesMundo.inicial('muros', 1), bot = e.tq[k], a = e.tq[0];
      Object.assign(e.tq[1], { x: 99, vivo: false, vuelve: 1e9, vidas: 0 });
      a.x = bot.x - dx * 1.2; a.z = bot.z - dz * 1.2;
      let peor = 0;
      for (let n = 0; n < 600; n++) {
        a.inv = 1e9; e.balas.length = 0;
        tanquesMundo.paso(e, { a: { ...quieto, x: dx, z: dz }, b: quieto }, 1 / 60);
        if (bot.vivo && fuera(e, bot)) peor++;
      }
      if (peor) malos.push(bot.quien + ' empujado hacia ' + [dx, dz] + ': ' + peor + ' cuadros dentro de un bloque o fuera de la mesa');
    }
    return malos;
  })()`);
  console.log(r.length ? r.join('\n') : 'ningún caso');
  ok = !r.length && !p.errores.length;
  if (p.errores.length) console.log(p.errores.slice(0, 3));
} catch (err) { console.log('falló:', err?.message ?? err); } finally { p.cerrar(); }
console.log(`${ok ? 'OK  ' : 'MAL '} en vivo: empujar a un tanque de máquina no lo mete en un bloque ni lo saca de la mesa`);
await limpiarPerfiles();
process.exit(ok ? 0 : 1);
