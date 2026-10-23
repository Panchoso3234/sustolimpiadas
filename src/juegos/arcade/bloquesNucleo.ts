// Lluvia de Bloques: el núcleo, sin dependencias (se prueba con node: pruebas/bloques.mjs). Un tablero de 10 × 20 (más 2
// filas ocultas arriba) donde caen piezas de 4 bloques que se giran y encajan para completar líneas. Todo lo que depende
// del azar sale de la semilla: dos jugadores con la misma semilla reciben las mismas piezas, especiales, eventos y basura.
// El estado es un objeto plano (sirve para mandarlo por la red en el modo en vivo).

export const ANCHO = 10, ALTO = 22, OCULTAS = 2;
export const PIEZAS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;
export type Especial = 'bomba' | 'calabaza' | 'fantasma' | null;
export type Evento = 'niebla' | 'viento' | 'lapidas';
export type Giro = 1 | -1 | 2;
/** Celdas: 0 vacía, 1 a 7 una pieza, 8 basura (lápida), 9 calabaza. */
export interface Pieza { t: number; r: number; x: number; y: number; especial: Especial }
export interface Objetivo { tipo: 'cuadruples' | 'lineas' | 'combo' | 'maestros'; meta: number; lleva: number; hecho: boolean }
export interface Estado {
  semilla: string; n: number; tiempo: number; tablero: number[]; pieza: Pieza | null; cola: number[]; especiales: Especial[];
  guardada: number; puedeGuardar: boolean; lineas: number; nivel: number; puntos: number; combo: number; b2b: boolean; perdio: boolean;
  caida: number; asentar: number; movidas: number; ultimoGiro: boolean; basura: { filas: number; hueco: number; llega: number }[];
  mandadas: number; hechizo: number; hechizoHasta: number; cuadruples: number; maestros: number; mejorCombo: number; limpios: number;
  eventos: boolean; especialesOn: boolean; evento: Evento | null; eventoHasta: number; proximoEvento: number; anuncio: Evento | null; viento: number;
  objetivo: Objetivo | null; piezas: number;
}
/** Lo que pasó al asentar una pieza (para dibujar efectos y mandar ataques). */
export interface Asiento { lineas: number[]; maestro: boolean; limpio: boolean; combo: number; ataque: number; puntos: number; b2b: boolean; bomba: { x: number; y: number } | null; texto: string }

// ── Azar con semilla (mulberry32 sobre un hash de texto) ──
const hash = (s: string) => { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; };
export const azar = (semilla: string, que: string, n: number) => { let a = hash(`${semilla}|${que}|${n}`); a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ── Formas: cada pieza en su caja (4 × 4 la larga, 2 × 2 la cuadrada, 3 × 3 el resto); los giros se calculan ──
const FORMAS: number[][][] = [
  [[0, 1], [1, 1], [2, 1], [3, 1]], // I
  [[0, 0], [1, 0], [0, 1], [1, 1]], // O
  [[1, 0], [0, 1], [1, 1], [2, 1]], // T
  [[1, 0], [2, 0], [0, 1], [1, 1]], // S
  [[0, 0], [1, 0], [1, 1], [2, 1]], // Z
  [[0, 0], [0, 1], [1, 1], [2, 1]], // J
  [[2, 0], [0, 1], [1, 1], [2, 1]], // L
];
const CAJA = [4, 2, 3, 3, 3, 3, 3];
/** Las 4 casillas de una pieza (x, y en el tablero; y crece hacia abajo). */
export function celdas(p: Pieza): [number, number][] {
  const n = CAJA[p.t];
  return FORMAS[p.t].map(([cx, cy]) => {
    let x = cx, y = cy;
    for (let k = 0; k < ((p.r % 4) + 4) % 4; k++) [x, y] = [n - 1 - y, x];
    return [p.x + x, p.y + y];
  });
}
const cabe = (e: Estado, p: Pieza) => celdas(p).every(([x, y]) => x >= 0 && x < ANCHO && y < ALTO && (y < 0 || e.tablero[y * ANCHO + x] === 0));
// ── Giros con SRS (el sistema estándar de los juegos competitivos) y los de 180° de SRS+ ──
// Estados: 0 = como sale, 1 = girada a la derecha (R), 2 = media vuelta, 3 = a la izquierda (L). Las tablas usan "y hacia
// arriba" como en todas las guías; al probarlas se invierte la y (aquí crece hacia abajo).
type Patadas = Record<string, [number, number][]>;
const SRS_JLSTZ: Patadas = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const SRS_I: Patadas = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
/** Media vuelta (SRS+): primero en su lugar, después hacia arriba y a los lados. */
const MEDIA_VUELTA: Patadas = {
  '0>2': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]], '2>0': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  '1>3': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]], '3>1': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]],
};
export const patadas = (t: number, desde: number, hacia: number): [number, number][] => {
  const clave = `${desde}>${hacia}`;
  return (Math.abs(desde - hacia) === 2 ? MEDIA_VUELTA : t === 0 ? SRS_I : SRS_JLSTZ)[clave] ?? [[0, 0]];
};

// ── Estado nuevo ──
const RONDA_EVENTOS = 38;
export function nuevo(semilla: string, opciones: { especiales?: boolean; eventos?: boolean; objetivo?: boolean } = {}): Estado {
  const e: Estado = {
    semilla, n: 0, tiempo: 0, tablero: Array(ANCHO * ALTO).fill(0), pieza: null, cola: [], especiales: [], guardada: -1, puedeGuardar: true,
    lineas: 0, nivel: 1, puntos: 0, combo: -1, b2b: false, perdio: false, caida: 0, asentar: 0, movidas: 0, ultimoGiro: false, basura: [], mandadas: 0,
    hechizo: 0, hechizoHasta: 0, cuadruples: 0, maestros: 0, mejorCombo: 0, limpios: 0, eventos: !!opciones.eventos, especialesOn: !!opciones.especiales,
    evento: null, eventoHasta: 0, proximoEvento: RONDA_EVENTOS, anuncio: null, viento: 0, objetivo: null, piezas: 0,
  };
  if (opciones.objetivo) {
    const tipos: Objetivo['tipo'][] = ['cuadruples', 'lineas', 'combo', 'maestros'], tipo = tipos[Math.floor(azar(semilla, 'objetivo', 0) * tipos.length)];
    e.objetivo = { tipo, meta: { cuadruples: 3, lineas: 40, combo: 5, maestros: 2 }[tipo], lleva: 0, hecho: false };
  }
  rellenar(e);
  sacar(e);
  return e;
}
/** Bolsa de 7: cada 7 piezas salen todas, en orden al azar (con la semilla). */
function rellenar(e: Estado) {
  while (e.cola.length < 7) {
    const bolsa = [0, 1, 2, 3, 4, 5, 6];
    for (let i = 6; i > 0; i--) { const k = Math.floor(azar(e.semilla, 'bolsa', e.n++) * (i + 1)); [bolsa[i], bolsa[k]] = [bolsa[k], bolsa[i]]; }
    for (const t of bolsa) {
      e.cola.push(t);
      // Especiales de vez en cuando (no la primera bolsa): bomba, calabaza o fantasma
      const r = e.especialesOn && e.n > 14 ? azar(e.semilla, 'especial', e.n) : 1;
      e.especiales.push(r < 0.035 ? 'bomba' : r < 0.06 ? 'calabaza' : r < 0.085 ? 'fantasma' : null);
    }
  }
}
function sacar(e: Estado, t?: number) {
  const tipo = t ?? e.cola.shift()!, especial = t === undefined ? e.especiales.shift() ?? null : null;
  rellenar(e);
  const p: Pieza = { t: tipo, r: 0, x: tipo === 1 ? 4 : 3, y: tipo === 0 ? 0 : 1, especial };
  e.pieza = p; e.caida = 0; e.asentar = 0; e.movidas = 0; e.ultimoGiro = false; e.piezas++;
  if (!cabe(e, p)) { p.y--; if (!cabe(e, p)) { e.perdio = true; e.pieza = null; } }
}

// ── Acciones del jugador ──
const reiniciarAsiento = (e: Estado) => { if (e.movidas < 15) { e.asentar = 0; e.movidas++; } };
export function mover(e: Estado, dx: number) {
  const p = e.pieza; if (!p || e.perdio) return false;
  const q = { ...p, x: p.x + dx };
  if (!cabe(e, q)) return false;
  e.pieza = q; e.ultimoGiro = false; reiniciarAsiento(e);
  return true;
}
export function girar(e: Estado, dir: Giro) {
  const p = e.pieza; if (!p || e.perdio || p.t === 1) return false;
  const desde = ((p.r % 4) + 4) % 4, hacia = (((p.r + dir) % 4) + 4) % 4;
  for (const [dx, dy] of patadas(p.t, desde, hacia)) {
    const q = { ...p, r: hacia, x: p.x + dx, y: p.y - dy };
    if (cabe(e, q)) { e.pieza = q; e.ultimoGiro = true; reiniciarAsiento(e); return true; }
  }
  return false;
}
/** Baja una fila (caída suave): 1 punto. */
export function bajar(e: Estado) {
  const p = e.pieza; if (!p || e.perdio) return false;
  const q = { ...p, y: p.y + 1 };
  if (!cabe(e, q)) return false;
  e.pieza = q; e.puntos += 1; e.caida = 0; e.ultimoGiro = false;
  return true;
}
/** Dónde caería la pieza (la pieza fantasma). La fantasma especial atraviesa bloques hasta el hueco más bajo donde cabe. */
export function sombra(e: Estado): Pieza | null {
  const p = e.pieza; if (!p) return null;
  if (p.especial === 'fantasma') { for (let y = ALTO; y >= p.y; y--) { const q = { ...p, y }; if (cabe(e, q)) return q; } }
  let q = p; while (cabe(e, { ...q, y: q.y + 1 })) q = { ...q, y: q.y + 1 };
  return q;
}
/** Caída instantánea: 2 puntos por fila y se asienta de una. */
export function caerYa(e: Estado): Asiento | null {
  const p = e.pieza, s = sombra(e); if (!p || !s || e.perdio) return null;
  e.puntos += Math.max(0, s.y - p.y) * 2; e.pieza = s;
  return asentar(e);
}
export function guardar(e: Estado) {
  const p = e.pieza; if (!p || !e.puedeGuardar || e.perdio) return false;
  const antes = e.guardada; e.guardada = p.t; e.puedeGuardar = false;
  if (antes < 0) sacar(e); else sacar(e, antes);
  e.puedeGuardar = false;
  return true;
}
/** Hechizo: con la barra llena, 8 s sin gravedad y con los puntos al doble. */
export function hechizar(e: Estado) {
  if (e.hechizo < 1 || e.tiempo < e.hechizoHasta) return false;
  e.hechizo = 0; e.hechizoHasta = e.tiempo + 8;
  return true;
}

// ── Asentar: líneas, puntaje, combos, ataque y especiales ──
const LINEAS = [0, 100, 300, 500, 800], MAESTRO = [400, 800, 1200, 1600], ATAQUE = [0, 0, 1, 2, 4], ATAQUE_MAESTRO = [0, 2, 4, 6], COMBO_ATAQUE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
const lleno = (e: Estado, y: number) => { for (let x = 0; x < ANCHO; x++) if (!e.tablero[y * ANCHO + x]) return false; return true; };
/** Giro maestro: la última acción fue un giro, es la pieza T y 3 de las 4 esquinas de su caja están ocupadas. */
const esMaestro = (e: Estado, p: Pieza) => {
  if (p.t !== 2 || !e.ultimoGiro) return false;
  const ocupada = (x: number, y: number) => x < 0 || x >= ANCHO || y >= ALTO || (y >= 0 && e.tablero[y * ANCHO + x] !== 0);
  return [[0, 0], [2, 0], [0, 2], [2, 2]].filter(([a, b]) => ocupada(p.x + a, p.y + b)).length >= 3;
};
export function asentar(e: Estado): Asiento | null {
  const p = e.pieza; if (!p) return null;
  const maestro = esMaestro(e, p);
  for (const [x, y] of celdas(p)) if (y >= 0) e.tablero[y * ANCHO + x] = p.especial === 'calabaza' ? 9 : p.t + 1;
  if (celdas(p).every(([, y]) => y < OCULTAS)) { e.perdio = true; e.pieza = null; return null; } // quedó entera arriba: se llenó
  let bomba: { x: number; y: number } | null = null;
  // Bomba: rompe el cuadro de 3 × 3 alrededor de su centro (y los bloques de encima caen)
  if (p.especial === 'bomba') {
    const cs = celdas(p), cx = Math.round(cs.reduce((a, c) => a + c[0], 0) / 4), cy = Math.round(cs.reduce((a, c) => a + c[1], 0) / 4);
    bomba = { x: cx, y: cy };
    let rotas = 0;
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) if (x >= 0 && x < ANCHO && y >= 0 && y < ALTO && e.tablero[y * ANCHO + x]) { e.tablero[y * ANCHO + x] = 0; rotas++; }
    for (let x = Math.max(0, cx - 1); x <= Math.min(ANCHO - 1, cx + 1); x++) asentarColumna(e, x);
    e.puntos += rotas * 20 * e.nivel;
  }
  // Calabaza: rellena los huecos de la fila más baja que toca (esa fila se completa)
  if (p.especial === 'calabaza') { const y = Math.max(...celdas(p).map(([, yy]) => yy)); for (let x = 0; x < ANCHO; x++) if (!e.tablero[y * ANCHO + x]) e.tablero[y * ANCHO + x] = 9; }
  const lineas: number[] = [];
  for (let y = 0; y < ALTO; y++) if (lleno(e, y)) lineas.push(y);
  const doble = e.tiempo < e.hechizoHasta ? 2 : 1;
  for (const y of lineas) { e.tablero.splice(y * ANCHO, ANCHO); e.tablero.unshift(...Array(ANCHO).fill(0)); }
  const n = lineas.length, limpio = n > 0 && e.tablero.every((c) => c === 0);
  let puntos = 0, ataque = 0, texto = '';
  const dificil = n === 4 || (maestro && n > 0);
  if (n > 0) {
    e.combo++;
    puntos = (maestro ? MAESTRO[n - 1] : LINEAS[n]) * e.nivel;
    if (dificil && e.b2b) { puntos = Math.round(puntos * 1.5); ataque += 1; }
    puntos += 50 * e.combo * e.nivel;
    ataque += maestro ? ATAQUE_MAESTRO[n] : ATAQUE[n];
    ataque += COMBO_ATAQUE[Math.min(e.combo, COMBO_ATAQUE.length - 1)];
    if (limpio) { puntos += 1500 * e.nivel; ataque += 6; e.limpios++; }
    texto = maestro ? `¡Giro maestro ${['', 'sencillo', 'doble', 'triple'][n] ?? ''}!` : n === 4 ? '¡Cuádruple!' : n === 3 ? 'Triple' : n === 2 ? 'Doble' : '';
    if (e.combo >= 2) texto = `${texto ? `${texto} · ` : ''}Combo ×${e.combo}`;
    if (dificil && e.b2b) texto = `${texto} · ¡Otra vez!`;
    if (limpio) texto = '¡Tablero limpio!';
    e.b2b = dificil ? true : n > 0 ? false : e.b2b;
    if (n === 4) e.cuadruples++;
    if (maestro) e.maestros++;
    e.mejorCombo = Math.max(e.mejorCombo, e.combo);
    e.lineas += n;
    e.nivel = Math.min(20, 1 + Math.floor(e.lineas / 10));
    e.hechizo = Math.min(1, e.hechizo + n * 0.08);
  } else e.combo = -1;
  if (maestro && n === 0) { puntos += 100 * e.nivel; texto = 'Giro maestro'; }
  puntos *= doble;
  e.puntos += puntos;
  // El ataque primero cancela la basura que venía; lo que sobra se manda al rival
  let restante = ataque;
  while (restante > 0 && e.basura.length) { const b = e.basura[0], usa = Math.min(b.filas, restante); b.filas -= usa; restante -= usa; if (!b.filas) e.basura.shift(); }
  e.mandadas += restante;
  // Desafío del día
  if (e.objetivo && !e.objetivo.hecho) {
    const o = e.objetivo;
    o.lleva = o.tipo === 'cuadruples' ? e.cuadruples : o.tipo === 'lineas' ? e.lineas : o.tipo === 'combo' ? e.mejorCombo : e.maestros;
    if (o.lleva >= o.meta) { o.hecho = true; e.puntos += 1500; texto = `${texto ? `${texto} · ` : ''}¡Desafío cumplido! +1500`; }
  }
  e.puedeGuardar = true;
  // La basura que ya llegó sube por abajo (solo cuando no hiciste líneas)
  if (!n) entrarBasura(e);
  sacar(e);
  return { lineas, maestro, limpio, combo: Math.max(0, e.combo), ataque: restante, puntos, b2b: dificil && e.b2b, bomba, texto };
}
function asentarColumna(e: Estado, x: number) {
  const col: number[] = [];
  for (let y = 0; y < ALTO; y++) if (e.tablero[y * ANCHO + x]) col.push(e.tablero[y * ANCHO + x]);
  for (let y = 0; y < ALTO; y++) e.tablero[y * ANCHO + x] = 0;
  col.reverse().forEach((c, i) => { e.tablero[(ALTO - 1 - i) * ANCHO + x] = c; });
}

// ── Basura (lápidas): llega con un hueco, avisa antes y sube por abajo ──
/** Agrega filas de basura a la cola (`llega`: desde cuándo puede subir). El hueco sale de la semilla compartida. */
export function recibir(e: Estado, filas: number, n: number, demora = 1.2) {
  if (filas <= 0) return;
  const hueco = Math.floor(azar(e.semilla, 'hueco', n) * ANCHO);
  e.basura.push({ filas, hueco, llega: e.tiempo + demora });
}
function entrarBasura(e: Estado) {
  while (e.basura.length && e.basura[0].llega <= e.tiempo) {
    const b = e.basura.shift()!;
    for (let k = 0; k < b.filas; k++) {
      if (e.tablero.slice(0, ANCHO).some((c) => c)) e.perdio = true; // lo de arriba se sale del tablero
      e.tablero.splice(0, ANCHO);
      const fila = Array(ANCHO).fill(8); fila[b.hueco] = 0;
      e.tablero.push(...fila);
    }
  }
}
export const basuraPendiente = (e: Estado) => e.basura.reduce((a, b) => a + b.filas, 0);

// ── El paso del tiempo: gravedad, asentado con demora, eventos y viento ──
export const segundosPorFila = (nivel: number) => Math.max(0.05, 0.85 * Math.pow(0.82, nivel - 1));
export function paso(e: Estado, dt: number, bajando = false): Asiento | null {
  if (e.perdio) return null;
  e.tiempo += dt;
  // Eventos de Halloween: se anuncian 3 s antes
  if (e.eventos) {
    if (!e.anuncio && !e.evento && e.tiempo >= e.proximoEvento - 3) { const tipos: Evento[] = ['niebla', 'viento', 'lapidas']; e.anuncio = tipos[Math.floor(azar(e.semilla, 'evento', Math.round(e.proximoEvento)) * 3)]; }
    if (e.anuncio && e.tiempo >= e.proximoEvento) {
      e.evento = e.anuncio; e.anuncio = null; e.eventoHasta = e.tiempo + (e.evento === 'lapidas' ? 0.1 : 10); e.proximoEvento += RONDA_EVENTOS;
      if (e.evento === 'lapidas') recibir(e, 1, Math.round(e.tiempo * 10), 0);
      e.viento = e.tiempo + 2.5;
    }
    if (e.evento && e.tiempo >= e.eventoHasta) e.evento = null;
    // Viento: cada 2,5 s empuja la pieza una casilla
    if (e.evento === 'viento' && e.tiempo >= e.viento) { e.viento = e.tiempo + 2.5; mover(e, azar(e.semilla, 'viento', Math.round(e.tiempo * 10)) < 0.5 ? -1 : 1); }
  }
  if (!e.pieza) return null;
  const quieto = e.tiempo < e.hechizoHasta && !bajando; // con el hechizo no hay gravedad
  const p = e.pieza, abajo = cabe(e, { ...p, y: p.y + 1 });
  if (abajo) {
    e.asentar = 0;
    if (quieto) return null;
    e.caida += dt;
    const cada = bajando ? Math.min(0.04, segundosPorFila(e.nivel)) : segundosPorFila(e.nivel);
    while (e.caida >= cada && cabe(e, { ...e.pieza!, y: e.pieza!.y + 1 })) { e.caida -= cada; e.pieza = { ...e.pieza!, y: e.pieza!.y + 1 }; e.ultimoGiro = false; if (bajando) e.puntos += 1; }
    return null;
  }
  e.asentar += dt;
  if (e.asentar >= 0.5) return asentar(e);
  return null;
}

/** Para el modo en vivo: el tablero en texto compacto (una letra por celda) para mandarlo por la red. */
export const comprimir = (e: Estado) => e.tablero.slice(OCULTAS * ANCHO).map((c) => '.IOTSZJLXC'[c]).join('');
export const descomprimir = (s: string) => [...s].map((ch) => Math.max(0, '.IOTSZJLXC'.indexOf(ch)));
