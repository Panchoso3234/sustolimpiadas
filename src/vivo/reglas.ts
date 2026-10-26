// Reglas de CONECTA4 y Battleship, sin nada de red: las usan el desafío en diferido, el juego
// en vivo y la práctica contra la máquina, y se pueden probar solas.

// ───────── CONECTA4: 7 columnas × 6 filas; gana quien alinea cuatro ─────────
// Variante Pop Out (la oficial del juego de mesa): en tu turno, en vez de poner, puedes sacar una concha tuya de la
// fila de abajo y todo lo de arriba baja. Si al sacar quedan cuatro en línea de los dos, gana quien sacó.
export const COLUMNAS = 7, FILAS = 6;
export type Ficha = 0 | 1 | 2; // 0 vacío, 1 primer jugador, 2 segundo
export type Tablero = Ficha[][]; // [fila][columna], la fila 0 es la de abajo
/** Una jugada: 0 a 6 pone en esa columna; desde SACAR saca la concha del fondo de la columna `jugada - SACAR`. */
export const SACAR = COLUMNAS;
export const esSacar = (j: number) => j >= SACAR;

export const tableroVacio = (): Tablero => Array.from({ length: FILAS }, () => Array<Ficha>(COLUMNAS).fill(0));

/** Fila donde cae una concha en esa columna, o -1 si está llena. */
export const filaLibre = (t: Tablero, col: number) => t.findIndex((fila) => fila[col] === 0);

const ORDEN = [3, 2, 4, 1, 5, 0, 6];
/** Las jugadas posibles de `quien`, de la columna central hacia afuera. */
export function legales(t: Tablero, quien: Ficha, popout: boolean): number[] {
  const lista = ORDEN.filter((c) => filaLibre(t, c) >= 0);
  if (popout) for (const c of ORDEN) if (t[0][c] === quien) lista.push(SACAR + c);
  return lista;
}
/** Hace la jugada en el tablero y devuelve cómo deshacerla. */
function hacer(t: Tablero, j: number, quien: Ficha): () => void {
  if (!esSacar(j)) { const f = filaLibre(t, j); t[f][j] = quien; return () => { t[f][j] = 0; }; }
  const c = j - SACAR, antes = t.map((fila) => fila[c]);
  for (let f = 0; f < FILAS - 1; f++) t[f][c] = t[f + 1][c];
  t[FILAS - 1][c] = 0;
  return () => antes.forEach((v, f) => { t[f][c] = v; });
}

/** Si la concha en (fila, col) forma cuatro en línea, las casillas de esa línea. */
function cuatro(t: Tablero, fila: number, col: number): [number, number][] {
  const quien = t[fila][col];
  if (!quien) return [];
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
/** Una línea de cuatro de `quien` en todo el tablero (tras sacar se mueve una columna entera). */
function lineaDe(t: Tablero, quien: Ficha): [number, number][] {
  for (let f = 0; f < FILAS; f++) for (let c = 0; c < COLUMNAS; c++) if (t[f][c] === quien) { const l = cuatro(t, f, c); if (l.length) return l; }
  return [];
}
/** Quién queda ganando justo después de la jugada `j` de `quien` (ya hecha): 0 si nadie. */
function ganaTras(t: Tablero, j: number, quien: Ficha): { ganador: 0 | 1 | 2; linea: [number, number][] } {
  if (!esSacar(j)) { const f = t.findIndex((fila, k) => fila[j] !== 0 && (k === FILAS - 1 || t[k + 1][j] === 0)), l = cuatro(t, f, j); return l.length ? { ganador: quien as 1 | 2, linea: l } : { ganador: 0, linea: [] }; }
  const mia = lineaDe(t, quien);
  if (mia.length) return { ganador: quien as 1 | 2, linea: mia };
  const otro: Ficha = quien === 1 ? 2 : 1, suya = lineaDe(t, otro);
  return suya.length ? { ganador: otro, linea: suya } : { ganador: 0, linea: [] };
}

export interface EstadoConchas { tablero: Tablero; turno: 1 | 2; ganador: 0 | 1 | 2; empate: boolean; linea: [number, number][] }
/** Aplica las jugadas en orden (empieza el jugador 1). Las jugadas inválidas se ignoran. */
export function jugarConchas(jugadas: number[], popout = false): EstadoConchas {
  const t = tableroVacio();
  let turno: 1 | 2 = 1, ganador: 0 | 1 | 2 = 0, linea: [number, number][] = [];
  for (const j of jugadas) {
    if (ganador) break;
    if (!legales(t, turno, popout).includes(j)) continue;
    hacer(t, j, turno);
    ({ ganador, linea } = ganaTras(t, j, turno));
    turno = turno === 1 ? 2 : 1;
  }
  // Tablero lleno: empate (en Pop Out, solo si quien juega no tiene ninguna concha que sacar)
  const empate = !ganador && t[FILAS - 1].every((c) => c !== 0) && !(popout && t[0].includes(turno));
  return { tablero: t, turno, ganador, empate, linea };
}

/** Las jugadas que ganaban al instante y no se hicieron: [número de jugada, quién, una jugada ganadora]. */
export function ganadasPerdidas(jugadas: number[], popout = false): { n: number; quien: 1 | 2; jugada: number }[] {
  const lista: { n: number; quien: 1 | 2; jugada: number }[] = [];
  for (let n = 0; n < jugadas.length; n++) {
    const { tablero: t, turno, ganador } = jugarConchas(jugadas.slice(0, n), popout);
    if (ganador) break;
    const ganan = legales(t, turno, popout).filter((j) => { const deshacer = hacer(t, j, turno), si = ganaTras(t, j, turno).ganador === turno; deshacer(); return si; });
    if (ganan.length && !ganan.includes(jugadas[n])) lista.push({ n: n + 1, quien: turno, jugada: ganan[0] });
  }
  return lista;
}
export const nombreJugada = (j: number) => (esSacar(j) ? `sacar de la columna ${j - SACAR + 1}` : `columna ${j + 1}`);

// ───────── Battleship: 10 × 10, cinco balsas (5, 4, 3, 3 y 2 casillas), como el juego clásico ─────────
export const LADO = 10, FLOTA = [5, 4, 3, 3, 2], CASILLAS_FLOTA = FLOTA.reduce((s, x) => s + x, 0);
export interface Balsa { casillas: number[] } // índices fila * LADO + columna
export type Resultado = 'agua' | 'tocado' | 'hundido';

/** Las casillas de una balsa de `largo` que parte en `ancla` (arriba o a la izquierda); null si se sale del mar. */
export function casillasDe(ancla: number, largo: number, horizontal: boolean): number[] | null {
  const f = Math.floor(ancla / LADO), c = ancla % LADO;
  if (ancla < 0 || ancla >= LADO * LADO || (horizontal ? c + largo > LADO : f + largo > LADO)) return null;
  return Array.from({ length: largo }, (_, k) => (f + (horizontal ? 0 : k)) * LADO + c + (horizontal ? k : 0));
}
/** Las casillas vecinas (con diagonales) de una casilla. */
const alrededor = (i: number) => {
  const f = Math.floor(i / LADO), c = i % LADO, r: number[] = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (f + a >= 0 && f + a < LADO && c + b >= 0 && c + b < LADO) r.push((f + a) * LADO + c + b);
  return r;
};
/** Si una flota cumple las reglas: los largos de FLOTA, en línea recta, dentro del mar y sin tocarse (ni en diagonal). */
export function flotaValida(x: unknown): x is Balsa[] {
  if (!Array.isArray(x) || x.length !== FLOTA.length) return false;
  const largos = x.map((b) => (Array.isArray(b?.casillas) ? b.casillas.length : 0)).sort((a, b) => b - a);
  if (largos.join() !== [...FLOTA].sort((a, b) => b - a).join()) return false;
  const duenas = new Map<number, number>();
  for (const [k, b] of (x as Balsa[]).entries()) {
    const cs = [...b.casillas].sort((a, z) => a - z);
    if (!cs.every((i) => Number.isInteger(i))) return false;
    const recta = casillasDe(cs[0], cs.length, true)?.join() === cs.join() || casillasDe(cs[0], cs.length, false)?.join() === cs.join();
    if (!recta) return false;
    for (const i of cs) duenas.set(i, k);
  }
  return [...duenas].every(([i, k]) => alrededor(i).every((v) => !duenas.has(v) || duenas.get(v) === k));
}
/** Mueve (o gira) la balsa `k` para que parta en `ancla`; null si no cabe ahí. */
export function moverBalsa(flota: Balsa[], k: number, ancla: number, horizontal: boolean): Balsa[] | null {
  const casillas = casillasDe(ancla, flota[k].casillas.length, horizontal);
  if (!casillas) return null;
  const nueva = flota.map((b, j) => (j === k ? { casillas } : b));
  return flotaValida(nueva) ? nueva : null;
}
export const esHorizontal = (b: Balsa) => b.casillas.length < 2 || b.casillas[1] - b.casillas[0] === 1;

/** Reparte la flota al azar, sin balsas tocándose (ni en diagonal). */
export function repartirFlota(azar: () => number = Math.random): Balsa[] {
  for (;;) {
    const ocupado = new Set<number>(), flota: Balsa[] = [];
    let bien = true;
    for (const largo of FLOTA) {
      let puesta = false;
      for (let intento = 0; intento < 200 && !puesta; intento++) {
        const horizontal = azar() < 0.5, casillas = casillasDe(Math.floor(azar() * LADO * LADO), largo, horizontal);
        if (!casillas || casillas.some((i) => alrededor(i).some((v) => ocupado.has(v)))) continue;
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
/** Balsas que siguen a flote (no hundidas del todo). */
export const aFlote = (flota: Balsa[], recibidos: number[]) => flota.filter((b) => !b.casillas.every((k) => recibidos.includes(k))).length;
/** El radar (una vez por batalla): cuántas casillas con balsa hay en el cuadrado de 3 × 3 con centro en `i`. */
export const radar = (flota: Balsa[], i: number) => alrededor(i).filter((v) => flota.some((b) => b.casillas.includes(v))).length;

/** Comprobación rápida de las reglas (en desarrollo, desde la consola: `(await import('/src/vivo/reglas.ts')).probar()`). */
export function probar(): string {
  const ok = (cond: boolean, que: string) => { if (!cond) throw new Error(`Falla: ${que}`); };
  ok(jugarConchas([0, 1, 0, 1, 0, 1, 0]).ganador === 1, 'vertical');
  ok(jugarConchas([0, 0, 1, 1, 2, 2, 3]).ganador === 1, 'horizontal');
  ok(jugarConchas([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]).ganador === 1, 'diagonal');
  ok(jugarConchas([0, 0, 0, 0, 0, 0, 0]).tablero[5][0] === 2, 'columna llena ignora la séptima');
  ok(jugarConchas([0, 1, SACAR + 0]).tablero[0][0] === 1, 'sin Pop Out no se saca');
  // Pop Out: el 1 saca su concha del fondo de la columna 3 y baja la del 2… y la suya de arriba
  const p = jugarConchas([3, 3, 4, 4, 5, 5, SACAR + 3], true);
  ok(p.tablero[0][3] === 2 && p.tablero[1][3] === 0 && p.turno === 2, 'Pop Out baja la columna');
  ok(jugarConchas([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3], true).ganador === 1, 'Pop Out también gana poniendo');
  ok(ganadasPerdidas([0, 6, 0, 6, 0, 6, 1]).some((x) => x.n === 7 && x.quien === 1 && x.jugada === 0), 'detecta la jugada ganadora que se pasó');
  const flota = repartirFlota();
  ok(flota.length === FLOTA.length && new Set(flota.flatMap((b) => b.casillas)).size === CASILLAS_FLOTA && flotaValida(flota), 'flota completa y válida');
  const todas = flota.flatMap((b) => b.casillas), ultimo = recibirDisparo(flota, todas.slice(0, -1), todas[todas.length - 1]);
  ok(ultimo.fin && ultimo.resultado === 'hundido', 'último disparo hunde y termina');
  ok(recibirDisparo(flota, [], [...Array(LADO * LADO).keys()].find((i) => !todas.includes(i))!).resultado === 'agua', 'agua');
  ok(radar(flota, flota[0].casillas[1]) >= 3, 'el radar cuenta casillas cercanas');
  ok(moverBalsa(flota, 0, LADO * LADO - 1, true) === null, 'no se sale del mar');
  return 'Reglas OK';
}

// ───────── La máquina ─────────
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
function negamax(t: Tablero, prof: number, alfa: number, beta: number, quien: Ficha, popout: boolean): number {
  const otro: Ficha = quien === 1 ? 2 : 1;
  if (prof === 0) return evaluar(t, quien);
  let mejor = -Infinity, alguna = false;
  for (const j of legales(t, quien, popout)) {
    alguna = true;
    const deshacer = hacer(t, j, quien), { ganador } = ganaTras(t, j, quien);
    const v = ganador === quien ? 1000 + prof : ganador ? -(1000 + prof) : -negamax(t, prof - 1, -beta, -alfa, otro, popout);
    deshacer();
    if (v > mejor) mejor = v;
    if (mejor > alfa) alfa = mejor;
    if (alfa >= beta) break;
  }
  return alguna ? mejor : 0;
}
// Qué tan humana es la máquina (2026-10-26: la de antes miraba 6 jugadas y "predecía" todo; a un jugador casual le ganaba siempre).
// tapa: probabilidad de ver tu amenaza a la vista; mira: jugadas que calcula; ruido: cuánto se equivoca al elegir.
const MAQUINA: Record<Dificultad, { tapa: number; mira: number; ruido: number }> = { facil: { tapa: 0.6, mira: 0, ruido: 0 }, normal: { tapa: 0.75, mira: 1, ruido: 6 }, dificil: { tapa: 0.9, mira: 2, ruido: 4 } };
/** La jugada de la máquina: gana si lo ve, tapa tu amenaza (no siempre) y si no, calcula unas jugadas con algo de error. */
export function jugadaMaquina(jugadas: number[], dificultad: Dificultad, azar: () => number = Math.random, popout = false): number {
  const { tablero: t, turno } = jugarConchas(jugadas, popout), otro: Ficha = turno === 1 ? 2 : 1;
  const mias = legales(t, turno, popout);
  const resultado = (j: number, quien: Ficha) => { const deshacer = hacer(t, j, quien), g = ganaTras(t, j, quien).ganador; deshacer(); return g; };
  // Gana si puede; si no, tapa la columna donde el rival ganaría poniendo
  const nivel = MAQUINA[dificultad], ve = azar() < nivel.tapa;
  const directa = mias.find((j) => resultado(j, turno) === turno) ?? (ve ? legales(t, otro, false).find((c) => mias.includes(c) && resultado(c, otro) === otro) : undefined);
  if (directa !== undefined) return directa;
  const seguras = mias.filter((j) => resultado(j, turno) !== otro);
  const opciones = seguras.length ? seguras : mias;
  if (!nivel.mira) return opciones[Math.floor(azar() * opciones.length)];
  const prof = popout ? Math.min(nivel.mira, 3) : nivel.mira;
  let mejor = opciones[0], valor = -Infinity;
  for (const j of opciones) {
    const deshacer = hacer(t, j, turno);
    const v = -negamax(t, prof - 1, -Infinity, Infinity, otro, popout) + azar() * nivel.ruido;
    deshacer();
    if (v > valor) { valor = v; mejor = j; }
  }
  return mejor;
}

/** El disparo de la máquina en Balsas, sabiendo solo lo que ve (agua, tocado, hundido). */
export function disparoMaquina(vistos: { i: number; res: Resultado; hundida?: number[] }[], dificultad: Dificultad, azar: () => number = Math.random): number {
  const tirados = new Set(vistos.map((v) => v.i)), hundidas = new Set(vistos.flatMap((v) => v.hundida ?? []));
  const vecinas = (i: number, diag = false) => alrededor(i).filter((v) => v !== i && (diag || Math.floor(v / LADO) === Math.floor(i / LADO) || v % LADO === i % LADO));
  // Alrededor de una balsa hundida no puede haber otra (no se tocan)
  const prohibidas = new Set(dificultad === 'facil' ? [] : [...hundidas].flatMap((i) => vecinas(i, true)));
  const libre = (i: number) => !tirados.has(i) && !prohibidas.has(i);
  const elegir = (l: number[]) => l[Math.floor(azar() * l.length)];
  // Persecución (en fácil, solo a veces)
  if (dificultad !== 'facil' || azar() < 0.5) {
    // tocados que aún no se hunden
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
  ok(jugadaMaquina([0, 6, 0, 6, 0], 'dificil', () => 0) === 0, 'tapa la vertical (cuando la ve)');
  ok(jugadaMaquina([0, 0, 1, 1, 2, 2], 'dificil', () => 0.99) === 3, 'gana cuando puede');
  ok(jugadaMaquina([0, 6, 0, 6, 0], 'dificil', () => 0, true) === 0, 'tapa la vertical en Pop Out');
  for (const d of ['facil', 'normal', 'dificil'] as Dificultad[]) {
    const flota = repartirFlota(), vistos: { i: number; res: Resultado; hundida?: number[] }[] = [];
    let fin = false;
    for (let n = 0; n < LADO * LADO && !fin; n++) {
      const i = disparoMaquina(vistos, d);
      ok(!vistos.some((v) => v.i === i), `${d}: no repite disparo`);
      const r = recibirDisparo(flota, vistos.map((v) => v.i), i);
      vistos.push({ i, res: r.resultado, hundida: r.hundida });
      fin = r.fin;
    }
    ok(fin, `${d}: hunde la flota`);
  }
  return 'Máquina OK';
}
