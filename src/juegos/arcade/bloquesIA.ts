import { ALTO, ANCHO, celdas, type Estado, type Pieza } from './bloquesNucleo';

// Un jugador de máquina para Lluvia de Bloques (solo para pruebas: el piloto y el rival de práctica en vivo). Prueba
// todos los giros y columnas y elige la jugada que deja el tablero más bajo, parejo y sin huecos.

const cabe = (t: number[], p: Pieza) => celdas(p).every(([x, y]) => x >= 0 && x < ANCHO && y < ALTO && (y < 0 || t[y * ANCHO + x] === 0));

function nota(t: number[]) {
  let alturas = 0, huecos = 0, bache = 0, lineas = 0, previa = -1;
  for (let y = 0; y < ALTO; y++) { let llena = true; for (let x = 0; x < ANCHO; x++) if (!t[y * ANCHO + x]) llena = false; if (llena) lineas++; }
  for (let x = 0; x < ANCHO; x++) {
    let h = 0, techo = false;
    for (let y = 0; y < ALTO; y++) { if (t[y * ANCHO + x]) { if (!techo) h = ALTO - y; techo = true; } else if (techo) huecos++; }
    alturas += h;
    if (previa >= 0) bache += Math.abs(h - previa);
    previa = h;
  }
  return -0.51 * alturas + 0.76 * lineas - 0.36 * huecos - 0.18 * bache;
}

/** La mejor posición para la pieza actual: { r, x } (o null si no hay pieza). */
export function mejorJugada(e: Estado): { r: number; x: number } | null {
  const p = e.pieza;
  if (!p) return null;
  let mejor: { r: number; x: number } | null = null, mejorNota = -Infinity;
  for (let r = 0; r < 4; r++) for (let x = -3; x < ANCHO + 1; x++) {
    let q: Pieza = { ...p, r, x, y: p.y };
    if (!cabe(e.tablero, q)) continue;
    while (cabe(e.tablero, { ...q, y: q.y + 1 })) q = { ...q, y: q.y + 1 };
    const t = e.tablero.slice();
    for (const [cx, cy] of celdas(q)) if (cy >= 0) t[cy * ANCHO + cx] = 1;
    const n = nota(t);
    if (n > mejorNota) { mejorNota = n; mejor = { r, x }; }
  }
  return mejor;
}
