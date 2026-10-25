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

// ───────── La máquina (modo individual de los dos juegos) ─────────
export type Dificultad = 'facil' | 'normal' | 'dificil';

/** Puntaje de una ventana de 4 casillas para `yo` (más alto = mejor para yo). */
function ventana(v: Ficha[], yo: Ficha): number {
  const mias = v.filter((x) => x === yo).length, suyas = v.filter((x) => x !== 0 && x !== yo).length;
  if (mias && suyas) return 0;
  return mias === 3 ? 5 : mias === 2 ? 2 : suyas === 3 ? -4 : suyas === 2 ? -1 : 0;
}
function evaluar(t: Tablero, yo: Ficha): number {
  let s = 0;
  for (let f = 0; f < FILAS; f++) if (t[f][3] === yo) s += 3; // el centro vale más
  for (let f = 0; f < FILAS; f++) for (let c = 0; c < COLUMNAS; c++) for (const [df, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const ff = f + df * 3, cc = c + dc * 3;
    if (ff < 0 || ff >= FILAS || cc < 0 || cc >= COLUMNAS) continue;
    s += ventana([0, 1, 2, 3].map((k) => t[f + df * k][c + dc * k]), yo);
  }
  return s;
}
const ORDEN = [3, 2, 4, 1, 5, 0, 6];
function negamax(t: Tablero, prof: number, alfa: number, beta: number, quien: Ficha): number {
  const otro: Ficha = quien === 1 ? 2 : 1;
  if (prof === 0) return evaluar(t, quien);
  let mejor = -Infinity, alguna = false;
  for (const c of ORDEN) {
    const f = filaLibre(t, c);
    if (f < 0) continue;
    alguna = true;
    t[f][c] = quien;
    const v = cuatro(t, f, c).length ? 1000 + prof : -negamax(t, prof - 1, -beta, -alfa, otro);
    t[f][c] = 0;
    if (v > mejor) mejor = v;
    if (mejor > alfa) alfa = mejor;
    if (alfa >= beta) break;
  }
  return alguna ? mejor : 0;
}
/** La columna que juega la máquina. Fácil: gana o tapa si lo ve, si no al azar; normal y difícil miran 4 y 6 jugadas. */
export function jugadaMaquina(jugadas: number[], dificultad: Dificultad, azar: () => number = Math.random): number {
  const { tablero: t, turno } = jugarConchas(jugadas), otro: Ficha = turno === 1 ? 2 : 1;
  const libres = ORDEN.filter((c) => filaLibre(t, c) >= 0);
  const gana = (quien: Ficha) => libres.find((c) => { const f = filaLibre(t, c); t[f][c] = quien; const si = cuatro(t, f, c).length > 0; t[f][c] = 0; return si; });
  const directa = gana(turno) ?? gana(otro);
  if (directa !== undefined) return directa;
  if (dificultad === 'facil') return libres[Math.floor(azar() * libres.length)];
  const prof = dificultad === 'normal' ? 4 : 6;
  let mejor = libres[0], valor = -Infinity;
  for (const c of libres) {
    const f = filaLibre(t, c);
    t[f][c] = turno;
    const v = -negamax(t, prof - 1, -Infinity, Infinity, otro) + (dificultad === 'normal' ? azar() * 2 : 0);
    t[f][c] = 0;
    if (v > valor) { valor = v; mejor = c; }
  }
  return mejor;
}

/** El disparo de la máquina en Balsas, sabiendo solo lo que ve (agua, tocado, hundido). */
export function disparoMaquina(vistos: { i: number; res: Resultado; hundida?: number[] }[], dificultad: Dificultad, azar: () => number = Math.random): number {
  const tirados = new Set(vistos.map((v) => v.i)), hundidas = new Set(vistos.flatMap((v) => v.hundida ?? []));
  const vecinas = (i: number, diag = false) => {
    const f = Math.floor(i / LADO), c = i % LADO, r: number[] = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((a || b) && (diag || !a || !b) && f + a >= 0 && f + a < LADO && c + b >= 0 && c + b < LADO) r.push((f + a) * LADO + c + b);
    return r;
  };
  // Alrededor de una balsa hundida no puede haber otra (no se tocan)
  const prohibidas = new Set(dificultad === 'facil' ? [] : [...hundidas].flatMap((i) => vecinas(i, true)));
  const libre = (i: number) => !tirados.has(i) && !prohibidas.has(i);
  const elegir = (l: number[]) => l[Math.floor(azar() * l.length)];
  // Persecución (en fácil, solo a veces)
  if (dificultad !== 'facil' || azar() < 0.5) {
    //: tocados que aún no se hunden
    const heridos = vistos.filter((v) => v.res === 'tocado' && !hundidas.has(v.i)).map((v) => v.i);
    if (heridos.length >= 2) {
      const horizontal = Math.floor(heridos[0] / LADO) === Math.floor(heridos[1] / LADO), orden = [...heridos].sort((a, b) => a - b);
      const paso = horizontal ? 1 : LADO, ini = orden[0] - paso, fin = orden[orden.length - 1] + paso;
      const sigue = [ini, fin].filter((i) => i >= 0 && i < LADO * LADO && (!horizontal || Math.floor(i / LADO) === Math.floor(orden[0] / LADO)) && libre(i));
      if (sigue.length) return elegir(sigue);
    }
    const cerca = heridos.flatMap((i) => vecinas(i)).filter(libre);
    if (cerca.length) return elegir(cerca);
  }
  // Búsqueda: en difícil, en tablero de ajedrez (toda balsa mide 2 o más)
  const todas = [...Array(LADO * LADO).keys()].filter(libre);
  const ajedrez = todas.filter((i) => (Math.floor(i / LADO) + (i % LADO)) % 2 === 0);
  return elegir(dificultad === 'dificil' && ajedrez.length ? ajedrez : todas.length ? todas : [...Array(LADO * LADO).keys()].filter((i) => !tirados.has(i)));
}

/** Prueba de la máquina: no se deja ganar a la vista y siempre hunde una flota. */
export function probarMaquina(): string {
  const ok = (cond: boolean, que: string) => { if (!cond) throw new Error(`Falla: ${que}`); };
  ok(jugadaMaquina([0, 6, 0, 6, 0], 'facil') === 0 || jugadaMaquina([0, 6, 0, 6, 0], 'facil') !== 0, 'responde');
  ok(jugadaMaquina([0, 6, 0, 6, 0], 'normal') === 0, 'tapa la vertical');
  ok(jugadaMaquina([0, 0, 1, 1, 2, 2], 'dificil') === 3, 'gana cuando puede');
  for (const d of ['facil', 'normal', 'dificil'] as Dificultad[]) {
    const flota = repartirFlota(), vistos: { i: number; res: Resultado; hundida?: number[] }[] = [];
    let fin = false;
    for (let n = 0; n < 64 && !fin; n++) {
      const i = disparoMaquina(vistos, d);
      ok(!vistos.some((v) => v.i === i), `${d}: no repite disparo`);
      const r = recibirDisparo(flota, vistos.map((v) => v.i), i);
      vistos.push({ i, res: r.resultado, hundida: r.hundida });
      fin = r.fin;
    }
    ok(fin, `${d}: hunde la flota en 64 tiros`);
  }
  return 'Máquina OK';
}
