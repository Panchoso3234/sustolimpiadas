// Reglas de los juegos en vivo por turnos, sin nada de red: se pueden probar solas.

// ───────── Cuatro Conchas en Línea: 7 columnas × 6 filas; gana quien alinea cuatro ─────────
export const COLUMNAS = 7, FILAS = 6;
export type Ficha = 0 | 1 | 2; // 0 vacío, 1 primer jugador, 2 segundo
export type Tablero = Ficha[][]; // [fila][columna], la fila 0 es la de abajo

export const tableroVacio = (): Tablero => Array.from({ length: FILAS }, () => Array<Ficha>(COLUMNAS).fill(0));

/** Fila donde cae una concha en esa columna, o -1 si está llena. */
export const filaLibre = (t: Tablero, col: number) => t.findIndex((fila) => fila[col] === 0);

/** Aplica las jugadas en orden (cada una es una columna; empieza el jugador 1). Devuelve el tablero y cómo va. */
export function jugarConchas(jugadas: number[]): { tablero: Tablero; turno: 1 | 2; ganador: 0 | 1 | 2; empate: boolean; linea: [number, number][] } {
  const t = tableroVacio();
  let turno: 1 | 2 = 1, ganador: 0 | 1 | 2 = 0, linea: [number, number][] = [];
  for (const col of jugadas) {
    if (ganador) break;
    const fila = filaLibre(t, col);
    if (fila < 0) continue; // jugada inválida: se ignora
    t[fila][col] = turno;
    linea = cuatro(t, fila, col);
    if (linea.length) ganador = turno;
    turno = turno === 1 ? 2 : 1;
  }
  const empate = !ganador && t[FILAS - 1].every((c) => c !== 0);
  return { tablero: t, turno, ganador, empate, linea };
}

/** Si la concha recién puesta en (fila, col) forma cuatro en línea, las casillas de esa línea. */
function cuatro(t: Tablero, fila: number, col: number): [number, number][] {
  const quien = t[fila][col];
  for (const [df, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const linea: [number, number][] = [[fila, col]];
    for (const s of [1, -1]) {
      let f = fila + df * s, c = col + dc * s;
      while (f >= 0 && f < FILAS && c >= 0 && c < COLUMNAS && t[f][c] === quien) { linea.push([f, c]); f += df * s; c += dc * s; }
    }
    if (linea.length >= 4) return linea;
  }
  return [];
}

// ───────── Batalla de Balsas: 8 × 8, cuatro balsas (4, 3, 3 y 2 casillas) ─────────
export const LADO = 8, FLOTA = [4, 3, 3, 2];
export interface Balsa { casillas: number[] } // índices fila * LADO + columna
export type Resultado = 'agua' | 'tocado' | 'hundido';

/** Reparte la flota al azar, sin balsas tocándose (ni en diagonal). */
export function repartirFlota(azar: () => number = Math.random): Balsa[] {
  for (;;) {
    const ocupado = new Set<number>(), flota: Balsa[] = [];
    let bien = true;
    for (const largo of FLOTA) {
      let puesta = false;
      for (let intento = 0; intento < 200 && !puesta; intento++) {
        const horizontal = azar() < 0.5, f = Math.floor(azar() * (horizontal ? LADO : LADO - largo + 1)), c = Math.floor(azar() * (horizontal ? LADO - largo + 1 : LADO));
        const casillas = Array.from({ length: largo }, (_, k) => (f + (horizontal ? 0 : k)) * LADO + c + (horizontal ? k : 0));
        const choca = casillas.some((i) => { const fi = Math.floor(i / LADO), ci = i % LADO; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (fi + a >= 0 && fi + a < LADO && ci + b >= 0 && ci + b < LADO && ocupado.has((fi + a) * LADO + ci + b)) return true; return false; });
        if (choca) continue;
        casillas.forEach((i) => ocupado.add(i));
        flota.push({ casillas });
        puesta = true;
      }
      if (!puesta) { bien = false; break; }
    }
    if (bien) return flota;
  }
}

/** Qué pasa con un disparo a la casilla `i`, dados los disparos anteriores que recibió esta flota. */
export function recibirDisparo(flota: Balsa[], recibidos: number[], i: number): { resultado: Resultado; hundida?: number[]; fin: boolean } {
  const todos = [...recibidos, i], balsa = flota.find((b) => b.casillas.includes(i));
  if (!balsa) return { resultado: 'agua', fin: false };
  const hundida = balsa.casillas.every((k) => todos.includes(k));
  const fin = flota.every((b) => b.casillas.every((k) => todos.includes(k)));
  return hundida ? { resultado: 'hundido', hundida: balsa.casillas, fin } : { resultado: 'tocado', fin };
}

/** Comprobación rápida de las reglas (en desarrollo, desde la consola: `(await import('/src/vivo/reglas.ts')).probar()`). */
export function probar(): string {
  const ok = (cond: boolean, que: string) => { if (!cond) throw new Error(`Falla: ${que}`); };
  ok(jugarConchas([0, 1, 0, 1, 0, 1, 0]).ganador === 1, 'vertical');
  ok(jugarConchas([0, 0, 1, 1, 2, 2, 3]).ganador === 1, 'horizontal');
  ok(jugarConchas([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]).ganador === 1, 'diagonal');
  ok(jugarConchas([0, 0, 0, 0, 0, 0, 0]).tablero[5][0] === 2, 'columna llena ignora la séptima');
  const flota = repartirFlota();
  ok(flota.length === 4 && new Set(flota.flatMap((b) => b.casillas)).size === 12, 'flota de 12 casillas sin choques');
  const todas = flota.flatMap((b) => b.casillas), ultimo = recibirDisparo(flota, todas.slice(0, -1), todas[todas.length - 1]);
  ok(ultimo.fin && ultimo.resultado === 'hundido', 'último disparo hunde y termina');
  ok(recibirDisparo(flota, [], [...Array(64).keys()].find((i) => !todas.includes(i))!).resultado === 'agua', 'agua');
  return 'Reglas OK';
}
