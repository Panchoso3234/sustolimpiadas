import { fechaChile, generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { crearSprite, desdeTexto, mezcla, type Sprite } from './pixel';

// Fusión de Gemas (29-10): una rejilla hexagonal de 7 × 7. Pones una gema por turno; tres o más iguales que se tocan se
// fusionan en la gema del nivel siguiente, en la casilla donde pusiste la última, y si esa forma otro grupo, sigue la
// cadena. Siete niveles (cuarzo → estrella); tres diamantes forman una estrella que limpia todo a su alrededor.
// Termina cuando la rejilla se llena (o a los 4 minutos en el torneo). La secuencia de gemas sale de la semilla.

const ALTO = 720, COLS = 7, FILAS = 7, N = COLS * FILAS, VACIA = -1, PIEDRA = 9, PRISMA = 7, DURACION = 240;
const NIVELES = [
  { nombre: 'Cuarzo', valor: 10, color: ['#ffffff', '#f3c9e8', '#b98fb0'] },
  { nombre: 'Ámbar', valor: 30, color: ['#fff0b3', '#ffad33', '#b05f00'] },
  { nombre: 'Esmeralda', valor: 80, color: ['#c9ffe0', '#2fcf7a', '#0d6b3a'] },
  { nombre: 'Zafiro', valor: 200, color: ['#cfe3ff', '#3f7bff', '#132f8a'] },
  { nombre: 'Rubí', valor: 500, color: ['#ffd0d6', '#ff2e55', '#8a0a22'] },
  { nombre: 'Diamante', valor: 1200, color: ['#ffffff', '#9fe9ff', '#3aa6c9'] },
  { nombre: 'Estrella', valor: 3000, color: ['#fffbe0', '#ffd23c', '#c98a00'] },
];
const fila = (i: number) => Math.floor(i / COLS), col = (i: number) => i % COLS;
const vecinos = (i: number) => {
  const r = fila(i), c = col(i), d = r % 2 ? [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]] : [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]];
  return d.map(([dc, dr]) => [c + dc, r + dr]).filter(([x, y]) => x >= 0 && x < COLS && y >= 0 && y < FILAS).map(([x, y]) => y * COLS + x);
};
const VECINOS = Array.from({ length: N }, (_, i) => vecinos(i));
const cubo = (i: number) => { const r = fila(i), q = col(i) - (r - (r & 1)) / 2; return [q, r, -q - r]; };
const distancia = (a: number, b: number) => { const [x1, y1, z1] = cubo(a), [x2, y2, z2] = cubo(b); return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2)); };
const grupo = (g: number[], i: number, nivel: number) => {
  const visto = new Set([i]), cola = [i];
  while (cola.length) { const a = cola.pop()!; for (const v of VECINOS[a]) if (!visto.has(v) && g[v] === nivel) { visto.add(v); cola.push(v); } }
  return [...visto];
};
interface Paso { celdas: number[]; nivel: number }
interface Resolucion { nivel: number; pasos: Paso[]; piedras: number[]; estrella: number[] | null; puntos: number }
/** Pone una gema y resuelve la cadena completa (modifica `g`). */
function resolver(g: number[], i: number, gema: number, flujo: number): Resolucion {
  let nivel = gema;
  if (gema === PRISMA) { nivel = 0; for (let n = 5; n >= 0; n--) { g[i] = n; if (grupo(g, i, n).length >= 3) { nivel = n; break; } } }
  g[i] = nivel;
  const pasos: Paso[] = [], piedras: number[] = [];
  let puntos = 0, estrella: number[] | null = null;
  while (nivel < 6) {
    const celdas = grupo(g, i, nivel);
    if (celdas.length < 3) break;
    pasos.push({ celdas, nivel });
    puntos += NIVELES[nivel].valor * celdas.length * pasos.length;
    for (const c of celdas) { if (c !== i) g[c] = VACIA; for (const v of VECINOS[c]) if (g[v] === PIEDRA) { g[v] = VACIA; piedras.push(v); } }
    nivel++; g[i] = nivel;
  }
  if (nivel === 6) {
    // La estrella revienta: limpia todo a dos casillas y da un bono gigante
    estrella = [];
    for (let k = 0; k < N; k++) if (distancia(i, k) <= 2 && g[k] !== VACIA) { estrella.push(k); g[k] = VACIA; }
    puntos += NIVELES[6].valor + estrella.length * 100;
  }
  puntos = Math.round(puntos * flujo);
  return { nivel, pasos, piedras, estrella, puntos };
}

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'gemas', { fondo: '#141028', pixel: (ancho) => (ancho < 700 ? 2 : 3) });
  const musica = crearMusica(m.mesa, 92);
  musica.acordes([[50, 54, 57], [47, 50, 54], [43, 47, 50], [45, 49, 52]]);
  const bot = piloto();
  // Reto del día (modo libre): la misma semilla para todos ese día
  const hoy = fechaChile(Date.now()), reto = !!c.libre;
  const semilla = reto ? `reto-gemas-${hoy}` : c.semilla;
  const rGemas = generador(`${semilla}|gemas`), rPiedras = generador(`${semilla}|piedras`);
  const conDeshacer = !!(c.libre || c.practica);

  // ── Estado ──
  let g: number[] = Array(N).fill(VACIA), turno = 0, puntos = 0, mejorCadena = 0, fusiones = 0, estrellas = 0, piedrasRotas = 0, flujoTurnos = 0;
  const sacar = () => { turno++; if (turno % 25 === 0) return PRISMA; const k = rGemas(), alto = Math.min(0.35, turno / 300); return k < 0.62 - alto ? 0 : k < 0.92 - alto * 0.4 ? 1 : k < 0.985 ? 2 : 3; };
  let actual = sacar(), siguiente = sacar(), guardada: number | null = null, yaGuardo = false;
  let martillo = true, martilloArmado = false, deshacer = conDeshacer, foto: string | null = null;
  let ultimoTurno = 0, inicio = 0, fin = '', animaHasta = 0, terminado = false;
  // Piedras desde el turno 40, cada 8 turnos
  for (let k = 0; k < 4; k++) { const i = Math.floor(rGemas() * N); if (g[i] === VACIA) g[i] = k < 2 ? 0 : 1; } // unas gemas sueltas para empezar

  // ── Animación: gemas que vuelan al centro, la nueva que aparece, destellos ──
  const vuelos: { de: number; a: number; nivel: number; t0: number }[] = [];
  const nace: number[] = Array(N).fill(-9);
  let anillos: { i: number; t0: number; color: string; tam: number }[] = [];

  // ── Geometría ──
  let s = 30, ox = 0, oy = 0, panel = { x: 0, y: 0, w: 0, h: 0, horizontal: true };
  const medir = () => {
    const ancho = m.ancho, ancha = ancho > 900;
    const areaW = ancha ? ancho - 330 : ancho - 20, areaH = ancha ? ALTO - 40 : ALTO - 380; // angosta: deja el marcador arriba, el panel y los botones del sitio abajo
    s = Math.min(areaW / (Math.sqrt(3) * (COLS + 0.5)), areaH / (1.5 * (FILAS - 1) + 2));
    const w = Math.sqrt(3) * s * (COLS + 0.5), h = 1.5 * s * (FILAS - 1) + 2 * s;
    ox = (ancha ? (ancho - 300 - w) / 2 : (ancho - w) / 2) + (Math.sqrt(3) * s) / 2; oy = (ancha ? (ALTO - h) / 2 : 74) + s;
    panel = ancha ? { x: ancho - 300, y: 60, w: 270, h: ALTO - 120, horizontal: false } : { x: 10, y: 74 + h + 14, w: ancho - 20, h: 175, horizontal: true };
  };
  const centro = (i: number) => [ox + Math.sqrt(3) * s * (col(i) + 0.5 * (fila(i) & 1)), oy + 1.5 * s * fila(i)] as const;
  const celdaEn = (x: number, y: number) => { let mejor = -1, d = s * 0.95; for (let i = 0; i < N; i++) { const [cx, cy] = centro(i), e = Math.hypot(cx - x, cy - y); if (e < d) { d = e; mejor = i; } } return mejor; };
  // Botones del panel
  const botones = () => {
    const p = panel, b = (k: number, n: number) => p.horizontal ? { x: p.x + (p.w / n) * k + 4, y: p.y + 100, w: p.w / n - 8, h: 64 } : { x: p.x, y: p.y + 300 + k * 78, w: p.w, h: 66 };
    return { guardar: b(0, 3), martillo: b(1, 3), deshacer: b(2, 3) };
  };
  const dentro = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  // ── Jugar un turno ──
  const instantanea = () => JSON.stringify({ g, turno, puntos, actual, siguiente, guardada, yaGuardo, martillo, mejorCadena, fusiones, estrellas, piedrasRotas, flujoTurnos });
  function poner(i: number) {
    if (terminado || g[i] !== VACIA || m.tiempo < animaHasta) return false;
    if (deshacer) foto = instantanea();
    const t = m.tiempo, flujo = turno > 2 && t - ultimoTurno < 2 ? 1.1 : 1;
    if (flujo > 1) flujoTurnos++;
    ultimoTurno = t;
    const gema = actual, res = resolver(g, i, gema, flujo);
    puntos += res.puntos;
    // Animación de la cadena: cada eslabón tarda 0,3 s
    res.pasos.forEach((p, k) => {
      const t0 = t + k * 0.3;
      for (const cel of p.celdas) if (cel !== i) vuelos.push({ de: cel, a: i, nivel: p.nivel, t0 });
      anillos.push({ i, t0: t0 + 0.22, color: NIVELES[p.nivel + 1].color[1], tam: 1 + k * 0.4 });
      despues(t0 + 0.22, () => {
        const [x, y] = centro(i), mult = k + 1;
        m.efectos.chispas(x, y, NIVELES[Math.min(6, p.nivel + 1)].color, 14 + k * 6, 260 + k * 60);
        m.efectos.flotar(x, y - s, mult >= 5 ? `¡×${mult} LEGENDARIA!` : mult > 1 ? `¡Fusión ×${mult}!` : `+${NIVELES[p.nivel].valor * p.celdas.length}`, mult > 1 ? '#ffcf4a' : '#fff6c9', 28 + k * 7);
        m.efectos.temblar(3 + k * 3); m.efectos.congelar(30 + k * 10);
        m.mesa.sonido.tono(392 * Math.pow(1.26, k), 0.18, 'triangle', 0.08); m.mesa.sonido.tono(784 * Math.pow(1.26, k), 0.22, 'sine', 0.05, 0.05);
      });
    });
    nace[i] = t + res.pasos.length * 0.3;
    if (res.pasos.length) { fusiones += res.pasos.length; mejorCadena = Math.max(mejorCadena, res.pasos.length); animaHasta = t + res.pasos.length * 0.3; }
    else m.mesa.sonido.tono(520 + gema * 60, 0.07, 'triangle', 0.05);
    if (res.pasos.length >= 4 && !martillo) { martillo = true; m.mesa.hud.aviso('Cadena de 4: el martillo se recarga', 'oro', 1.4); }
    if (res.piedras.length) { piedrasRotas += res.piedras.length; for (const p of res.piedras) despues(t + 0.3, () => { const [x, y] = centro(p); m.efectos.chispas(x, y, ['#8a8a9a', '#5a5a6a', '#c9c9d6'], 14, 260); }); }
    if (res.estrella) {
      estrellas++;
      const te = t + res.pasos.length * 0.3;
      animaHasta = te + 2;
      despues(te, () => { m.mesa.hud.aviso('¡Gema estrella!', 'oro', 2); m.efectos.temblar(22); m.mesa.sonido.tono(523, 0.6, 'triangle', 0.1); m.mesa.sonido.tono(659, 0.6, 'triangle', 0.1, 0.12); m.mesa.sonido.tono(784, 0.6, 'triangle', 0.1, 0.24); m.mesa.sonido.tono(1046, 0.9, 'triangle', 0.09, 0.36); });
      for (const k of res.estrella) despues(te + 0.4 + distancia(i, k) * 0.25, () => { const [x, y] = centro(k); m.efectos.chispas(x, y, NIVELES[6].color, 12, 340); });
      despues(te + 1.4, () => { const [x, y] = centro(i); m.efectos.flotar(x, y - s, `+${NIVELES[6].valor + res.estrella!.length * 100}`, '#ffd23c', 48); });
      estrellaAnim = { i, t0: te };
    }
    musica.intensidad = res.pasos.length >= 2 ? 2 : 1;
    // Siguiente gema y piedras
    actual = siguiente; siguiente = sacar(); yaGuardo = false;
    if (turno >= 40 && turno % 8 === 0) {
      const vacias = g.map((v, k) => (v === VACIA && k !== i ? k : -1)).filter((k) => k >= 0);
      if (vacias.length > 2) { const p = vacias[Math.floor(rPiedras() * vacias.length)]; g[p] = PIEDRA; nace[p] = animaHasta; despues(animaHasta, () => { m.mesa.sonido.tono(110, 0.2, 'square', 0.06); m.efectos.temblar(4); }); }
    }
    revisarFin();
    return true;
  }
  const revisarFin = () => {
    if (g.some((v) => v === VACIA)) return;
    if (martillo) { martilloArmado = true; m.mesa.hud.aviso('Rejilla llena: usa el martillo en una casilla', 'mal', 2.4); return; }
    fin = 'Se llenó la rejilla'; despues(animaHasta + 0.6, terminar);
  };
  function golpear(i: number) {
    if (!martillo || g[i] === VACIA || m.tiempo < animaHasta) return;
    martillo = false; martilloArmado = false;
    const [x, y] = centro(i);
    m.efectos.chispas(x, y, g[i] === PIEDRA ? ['#8a8a9a', '#5a5a6a'] : NIVELES[g[i]].color, 20, 320);
    m.efectos.temblar(10); m.mesa.sonido.tono(140, 0.2, 'square', 0.1);
    g[i] = VACIA;
  }
  function cambiar() {
    if (yaGuardo || m.tiempo < animaHasta) return;
    yaGuardo = true;
    if (guardada === null) { guardada = actual; actual = siguiente; siguiente = sacar(); }
    else [guardada, actual] = [actual, guardada];
    m.mesa.sonido.tono(660, 0.06, 'triangle', 0.05);
  }
  function volver() {
    if (!deshacer || !foto) return;
    const f = JSON.parse(foto);
    ({ g, turno, puntos, actual, siguiente, guardada, yaGuardo, martillo, mejorCadena, fusiones, estrellas, piedrasRotas, flujoTurnos } = f);
    deshacer = false; foto = null;
    m.mesa.hud.aviso('Jugada deshecha (una vez por partida)', '', 1.4);
  }
  const esperas: { t: number; f: () => void }[] = [];
  const despues = (t: number, f: () => void) => esperas.push({ t, f });
  let estrellaAnim: { i: number; t0: number } | null = null;

  m.alTocar((x, y) => {
    if (terminado) return;
    const b = botones();
    if (dentro(x, y, b.guardar)) return cambiar();
    if (dentro(x, y, b.martillo)) { if (martillo) martilloArmado = !martilloArmado; return; }
    if (dentro(x, y, b.deshacer)) return volver();
    const i = celdaEn(x, y);
    if (i < 0) return;
    if (martilloArmado) golpear(i); else poner(i);
  });
  m.alTecla((k) => { if (k === 'g' || k === 'c') cambiar(); if (k === 'm' && martillo) martilloArmado = !martilloArmado; if (k === 'z') volver(); });

  // ── Bots de prueba: el bueno prueba cada casilla (y la gema guardada) y elige la mejor; el torpe pone al azar ──
  const rb = generador('bot-gemas');
  let botEspera = 0;
  const evaluar = (i: number, gema: number) => {
    const copia = g.slice(), res = resolver(copia, i, gema, 1);
    // Además de los puntos: preferir juntar iguales sin fusionar y dejar espacio libre
    let junta = 0;
    for (const v of VECINOS[i]) if (copia[v] === copia[i]) junta += 30 * (copia[i] + 1);
    return res.puntos + junta + copia.filter((v) => v === VACIA).length * 4 - (gema >= 2 ? fila(i) === 3 && col(i) === 3 ? 20 : 0 : 0);
  };
  function pilotar() {
    const t = m.tiempo;
    if (t < botEspera || t < animaHasta) return;
    botEspera = t + 0.25;
    const vacias = g.map((v, k) => (v === VACIA ? k : -1)).filter((k) => k >= 0);
    if (martilloArmado || !vacias.length) { const llenas = g.map((v, k) => (v !== VACIA ? k : -1)).filter((k) => k >= 0); golpear(llenas[Math.floor(rb() * llenas.length)]); return; }
    if (bot === 'torpe') { poner(vacias[Math.floor(rb() * vacias.length)]); return; }
    let mejor = -1, valor = -Infinity, conGuardada = false;
    for (const i of vacias) {
      const a = evaluar(i, actual);
      if (a > valor) { valor = a; mejor = i; conGuardada = false; }
      if (!yaGuardo && guardada !== null) { const b = evaluar(i, guardada); if (b > valor) { valor = b; mejor = i; conGuardada = true; } }
    }
    if (conGuardada) cambiar();
    poner(mejor);
  }

  // ── Paso ──
  m.alPaso(() => {
    const t = m.tiempo;
    for (let k = esperas.length - 1; k >= 0; k--) if (t >= esperas[k].t) { const e = esperas.splice(k, 1)[0]; e.f(); }
    if (terminado) return;
    if (bot) pilotar();
    const jugado = t - inicio;
    if (!c.libre) {
      const quedan = DURACION - jugado;
      m.mesa.hud.tiempo(`${Math.max(0, Math.floor(quedan / 60))}:${String(Math.max(0, Math.floor(quedan % 60))).padStart(2, '0')}`);
      if (quedan <= 0 && !fin) { fin = 'Se acabó el tiempo'; terminar(); return; }
    } else m.mesa.hud.tiempo(`Reto del día ${hoy.slice(5)}`);
    m.mesa.hud.puntos(String(puntos));
    m.mesa.hud.extra(`Turno ${turno - 1}${mejorCadena > 1 ? ` · cadena ×${mejorCadena}` : ''}${t - ultimoTurno < 2 && turno > 3 ? ' · Flujo +10 %' : ''}`);
    anillos = anillos.filter((a) => t - a.t0 < 0.6);
    for (let k = vuelos.length - 1; k >= 0; k--) if (t > vuelos[k].t0 + 0.3) vuelos.splice(k, 1);
    if (estrellaAnim && t > estrellaAnim.t0 + 2) estrellaAnim = null;
  });

  // ── Dibujo ──
  const hexa = (gr: CanvasRenderingContext2D, x: number, y: number, r: number) => { gr.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; gr.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } gr.closePath(); };
  const forma = (gr: CanvasRenderingContext2D, nivel: number, r: number) => {
    gr.beginPath();
    const poli = (n: number, rot: number, rx = r, ry = r) => { for (let k = 0; k < n; k++) { const a = rot + (k * Math.PI * 2) / n; gr.lineTo(Math.cos(a) * rx, Math.sin(a) * ry); } gr.closePath(); };
    if (nivel === 0) poli(6, 0, r * 0.8, r * 0.95);
    else if (nivel === 1) { gr.ellipse(0, 0, r * 0.82, r * 0.9, 0, 0, Math.PI * 2); }
    else if (nivel === 2) poli(8, Math.PI / 8, r * 0.78, r * 0.95);
    else if (nivel === 3) { gr.moveTo(0, -r); gr.lineTo(r * 0.75, -r * 0.1); gr.lineTo(0, r); gr.lineTo(-r * 0.75, -r * 0.1); gr.closePath(); }
    else if (nivel === 4) { gr.moveTo(0, r * 0.95); gr.bezierCurveTo(-r * 1.2, 0, -r * 0.6, -r * 1.05, 0, -r * 0.45); gr.bezierCurveTo(r * 0.6, -r * 1.05, r * 1.2, 0, 0, r * 0.95); }
    else if (nivel === 5) { gr.moveTo(-r * 0.9, -r * 0.3); gr.lineTo(-r * 0.5, -r * 0.8); gr.lineTo(r * 0.5, -r * 0.8); gr.lineTo(r * 0.9, -r * 0.3); gr.lineTo(0, r); gr.closePath(); }
    else { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r; gr.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } gr.closePath(); }
  };
  const texto = (gr: CanvasRenderingContext2D, txt: string, x: number, y: number, tam: number, color = '#ffffff', alinea: CanvasTextAlign = 'center') => {
    gr.font = `900 ${tam}px Nunito, sans-serif`; gr.textAlign = alinea; gr.textBaseline = 'middle';
    gr.lineWidth = tam * 0.14; gr.strokeStyle = 'rgba(10,8,24,.85)'; gr.strokeText(txt, x, y); gr.fillStyle = color; gr.fillText(txt, x, y);
  };
  const caja = (gr: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, activo: boolean, etiqueta: string) => {
    gr.fillStyle = activo ? 'rgba(255,207,74,.18)' : 'rgba(255,255,255,.06)'; gr.strokeStyle = activo ? '#ffcf4a' : 'rgba(255,255,255,.2)'; gr.lineWidth = 2;
    gr.beginPath(); gr.roundRect(r.x, r.y, r.w, r.h, 12); gr.fill(); gr.stroke();
    // En pantallas angostas, solo la primera palabra (Guardar, Martillo, Deshacer)
    texto(gr, r.w < 140 ? (activo ? '¡Elige!' : etiqueta.split(/[ :(]/)[0]) : etiqueta, r.x + r.w / 2, r.y + r.h / 2, Math.min(20, r.w / 7), activo ? '#ffcf4a' : '#ffffff');
  };

  // Vista previa: el grupo que se formaría en la casilla bajo el puntero
  const vistaPrevia = () => {
    const bajo = celdaEn(m.puntero.x, m.puntero.y);
    if (bajo < 0 || g[bajo] !== VACIA || martilloArmado || m.tiempo < animaHasta || bot) return { bajo: bot ? -1 : bajo, previa: [] as number[] };
    const copia = g.slice(), res = resolver(copia, bajo, actual, 1);
    return { bajo, previa: res.pasos.flatMap((p) => p.celdas) };
  };
  /** Cada gema que se ve (rejilla, las que vuelan, la estrella y el panel), con su lugar y tamaño. Lo usan el 2D y el 3D. */
  const cadaGema = (t: number, poner: (nivel: number, x: number, y: number, r: number, latido: number) => void) => {
    const enVuelo = new Set(vuelos.filter((v) => t < v.t0 + 0.25).map((v) => v.de));
    for (let i = 0; i < N; i++) {
      if (g[i] === VACIA || enVuelo.has(i)) continue;
      const [x, y] = centro(i), k = t < nace[i] ? 0 : Math.min(1, (t - nace[i]) / 0.18);
      if (k <= 0) continue;
      // Latido: dos iguales juntas a punto de fusionarse
      const casi = g[i] < 6 && grupo(g, i, g[i]).length === 2 ? 1 : 0;
      poner(g[i], x, y, s * 0.72 * (k < 1 ? 0.6 + k * 0.55 : 1), casi);
    }
    for (const v of vuelos) {
      if (t < v.t0) { const [x, y] = centro(v.de); poner(v.nivel, x, y, s * 0.72, 0); continue; }
      const k = (t - v.t0) / 0.25;
      if (k >= 1) continue;
      const [x1, y1] = centro(v.de), [x2, y2] = centro(v.a), e = k * k;
      poner(v.nivel, x1 + (x2 - x1) * e, y1 + (y2 - y1) * e, s * 0.72 * (1 - k * 0.4), 0);
    }
    if (estrellaAnim) { const k = (t - estrellaAnim.t0) / 2; if (k >= 0 && k < 1) { const [x, y] = centro(estrellaAnim.i); poner(6, x, y, s * (0.8 + Math.sin(k * Math.PI) * 0.8), 0); } }
    const p = panel;
    if (p.horizontal) {
      const w3 = p.w / 3;
      poner(actual, p.x + w3 * 0.5, p.y + 52, 30, 0); poner(siguiente, p.x + w3 * 1.5, p.y + 52, 22, 0);
      if (guardada !== null) poner(guardada, p.x + w3 * 2.5, p.y + 52, 22, 0);
    } else {
      poner(actual, p.x + p.w / 2, p.y + 70, 46, 0); poner(siguiente, p.x + p.w * 0.27, p.y + 228, 26, 0);
      if (guardada !== null) poner(guardada, p.x + p.w * 0.73, p.y + 228, 26, 0);
      // Escalera de niveles, para saber qué viene
      for (let n = 0; n < 7; n++) poner(n, p.x + 20 + n * ((p.w - 40) / 6), p.y + p.h + 10, 14, 0);
    }
  };

  // ── Pixel art (8 bits): gemas facetadas, casillas de piedra y cueva. Cada sprite se genera una vez por tamaño ──
  const hex = (h: number, sa: number, l: number) => { const a = sa * Math.min(l, 1 - l), f = (n: number) => { const k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; };
  // Tonos por nivel: contorno, sombra, base, luz y brillo
  const TONOS = NIVELES.map((n) => [mezcla(n.color[2], '#000000', 0.5), n.color[2], n.color[1], n.color[0], '#ffffff']);
  const ARCOIRIS = Array.from({ length: 6 }, (_, i) => [hex(i * 60, 0.7, 0.2), hex(i * 60, 0.85, 0.42), hex(i * 60, 0.95, 0.6), hex(i * 60, 1, 0.8), '#ffffff']);
  const PIEDRA_T = ['#22222c', '#4a4a56', '#6e6e7a', '#9a9aa6', '#c9c9d6'];
  const cacheGemas = new Map<string, Sprite>();
  const spriteGema = (nivel: number, radio: number, tono = 0): Sprite => {
    const rp = Math.max(3, Math.round(radio)), clave = `${nivel}|${rp}|${tono}`;
    const listo = cacheGemas.get(clave);
    if (listo) return listo;
    const lado = rp * 2 + 3, c = lado / 2;
    const mascara = crearSprite(lado, lado, (g) => { g.translate(c, c); g.fillStyle = '#ffffff'; if (nivel === PIEDRA) { g.beginPath(); g.ellipse(0, 0, rp * 0.9, rp * 0.75, 0, 0, Math.PI * 2); } else forma(g, nivel === PRISMA ? 0 : nivel, rp); g.fill(); });
    const datos = mascara.getContext('2d')!.getImageData(0, 0, lado, lado).data;
    const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < lado && y < lado && datos[(y * lado + x) * 4 + 3] > 127;
    const pal = nivel === PIEDRA ? PIEDRA_T : nivel === PRISMA ? ARCOIRIS[tono % 6] : TONOS[nivel];
    const redonda = nivel === 1 || nivel === PIEDRA;
    const s = crearSprite(lado, lado, (g) => {
      for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) {
        if (!dentro(x, y)) continue;
        let color: string;
        if (!dentro(x - 1, y) || !dentro(x + 1, y) || !dentro(x, y - 1) || !dentro(x, y + 1)) color = pal[0];
        else {
          const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy) / rp;
          if (redonda) {
            // Cabujón y piedra: sombreado esférico
            const nz = Math.sqrt(Math.max(0, 1 - d * d)), luz = (-0.55 * dx - 0.6 * dy) / rp + 0.6 * nz;
            color = luz < 0.15 ? pal[1] : luz < 0.62 ? pal[2] : pal[3];
            if (nivel === 1 && dx < -rp * 0.25 && dx > -rp * 0.55 && dy < -rp * 0.3 && dy > -rp * 0.6) color = pal[4];
          } else if (d < 0.36) color = (x + y) % 5 === 0 ? pal[2] : pal[3]; // la mesa de la gema, clara
          else {
            // Facetas: el ángulo decide qué cara es, y cada cara recibe la luz de arriba a la izquierda
            const caras = nivel === 2 ? 8 : nivel === 0 ? 6 : 8, ang = Math.atan2(dy, dx), cara = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * caras);
            const medio = (cara + 0.5) / caras * Math.PI * 2 - Math.PI, luz = Math.cos(medio - Math.atan2(-0.6, -0.55));
            color = luz > 0.55 ? pal[3] : luz > -0.25 ? pal[2] : pal[1];
          }
        }
        g.fillStyle = color; g.fillRect(x, y, 1, 1);
      }
      // Brillos: un par de píxeles blancos arriba a la izquierda
      if (nivel !== PIEDRA) { g.fillStyle = '#ffffff'; const bx = Math.round(c - rp * 0.4), by = Math.round(c - rp * 0.45); if (dentro(bx, by)) g.fillRect(bx, by, 1, 1); if (rp > 6 && dentro(bx + 1, by)) g.fillRect(bx + 1, by, 1, 1); if (rp > 6 && dentro(bx, by + 1)) g.fillRect(bx, by + 1, 1, 1); }
    });
    cacheGemas.set(clave, s);
    return s;
  };
  // Casillas: hexágono de piedra con borde iluminado arriba y sombra abajo (normal, bajo el puntero, vista previa)
  const cacheCasillas = new Map<string, Sprite>();
  const spriteCasilla = (radio: number, estado: 0 | 1 | 2): Sprite => {
    const rp = Math.max(4, Math.round(radio)), clave = `${rp}|${estado}`;
    const listo = cacheCasillas.get(clave);
    if (listo) return listo;
    const lado = rp * 2 + 3, c = lado / 2;
    const mascara = crearSprite(lado, lado, (g) => { g.fillStyle = '#ffffff'; hexa(g, c, c, rp); g.fill(); });
    const datos = mascara.getContext('2d')!.getImageData(0, 0, lado, lado).data;
    const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < lado && y < lado && datos[(y * lado + x) * 4 + 3] > 127;
    const [base, luz, sombra, borde] = estado === 2 ? ['#5a4410', '#ffcf4a', '#3a2a08', '#1a1004'] : estado === 1 ? ['#3a3070', '#5a4ea0', '#221a48', '#0c0818'] : ['#251d46', '#3a3068', '#15102c', '#0a0716'];
    const s = crearSprite(lado, lado, (g) => {
      for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) {
        if (!dentro(x, y)) continue;
        const arriba = !dentro(x, y - 1) || !dentro(x - 1, y), abajo = !dentro(x, y + 1) || !dentro(x + 1, y);
        g.fillStyle = arriba && abajo ? borde : !dentro(x, y - 2) || !dentro(x - 2, y) ? luz : !dentro(x, y + 2) || !dentro(x + 2, y) ? sombra : (x * 7 + y * 3) % 11 === 0 ? sombra : base;
        g.fillRect(x, y, 1, 1);
      }
    });
    cacheCasillas.set(clave, s);
    return s;
  };
  // Cueva de cristal: fondo con tramado, estalactitas y estalagmitas de cristal (se rehace solo si cambia el tamaño)
  let cueva: Sprite | null = null, claveCueva = '';
  const pintarCueva = (w: number, h: number) => crearSprite(w, h, (g) => {
    const cs = ['#07051a', '#110c2c', '#1c1640', '#2a2158'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - w / 2) / w, (y - h / 2) / h) * 2.2, p = Math.max(0, Math.min(2.99, (1 - d) * 3)), i = Math.floor(p), f = p - i;
      g.fillStyle = f > [0.12, 0.62, 0.37, 0.87][(x % 2) + (y % 2) * 2] ? cs[Math.min(3, i + 1)] : cs[i]; g.fillRect(x, y, 1, 1);
    }
    const rc = generador('cueva-pixel');
    for (let k = 0; k < Math.round(w / 9); k++) {
      const abajo = k % 2 === 1, x = Math.floor(rc() * w), alto = 10 + Math.floor(rc() * h * 0.22), ancho = 3 + Math.floor(rc() * 5);
      for (let j = 0; j < alto; j++) { const a = Math.max(1, Math.round(ancho * (1 - j / alto))), y = abajo ? h - 1 - j : j; g.fillStyle = '#4a3a8a'; g.fillRect(x - Math.floor(a / 2), y, a, 1); g.fillStyle = '#7a64c8'; g.fillRect(x - Math.floor(a / 2), y, 1, 1); }
    }
  });
  const DESTELLO = desdeTexto(['..W..', '..W..', 'WWWWW', '..W..', '..W..'], { W: '#ffffff' });

  m.alPixel((gp) => {
    medir();
    const t = m.tiempo, k = m.k, aw = Math.ceil(m.ancho / k), ah = Math.ceil(ALTO / k);
    if (claveCueva !== `${aw}x${ah}`) { claveCueva = `${aw}x${ah}`; cueva = pintarCueva(aw, ah); }
    gp.drawImage(cueva!, 0, 0, aw * k, ah * k);
    for (let q = 0; q < 26; q++) if (Math.sin(t * 1.5 + q * 1.7) > 0.55) { gp.fillStyle = q % 3 ? '#b9a8ff' : '#7fd8ff'; gp.fillRect(Math.round(((q * 197) % m.ancho) / k) * k, Math.round(((q * 113) % ALTO) / k) * k, k, k); }
    const { bajo, previa } = vistaPrevia();
    for (let i = 0; i < N; i++) { const [x, y] = centro(i); m.sprite(spriteCasilla((s * 0.95) / k, previa.includes(i) ? 2 : i === bajo ? 1 : 0), x, y); }
    cadaGema(t, (nivel, x, y, r, latido) => {
      const rr = (r * (1 + latido * 0.08 * Math.sin(t * 8))) / k;
      if (nivel >= 4 && nivel < 7) { gp.fillStyle = NIVELES[nivel].color[1]; gp.globalAlpha = 0.18 + 0.08 * Math.sin(t * 3 + x); gp.beginPath(); gp.arc(x, y, r * 1.45, 0, Math.PI * 2); gp.fill(); gp.globalAlpha = 1; }
      m.sprite(spriteGema(nivel, rr, nivel === PRISMA ? Math.floor(t * 6) % 6 : 0), x, y); // solo el prisma cambia de color
      // Destello que pasa de vez en cuando por una faceta
      if (nivel !== PIEDRA && Math.sin(t * 1.7 + x * 0.05 + y * 0.031) > 0.965) m.sprite(DESTELLO, x + r * 0.35, y - r * 0.35);
    });
    for (const a of anillos) { const q = (t - a.t0) / 0.6; if (q < 0) continue; const [x, y] = centro(a.i); gp.strokeStyle = a.color; gp.globalAlpha = 1 - q; gp.lineWidth = 2 * k; gp.beginPath(); gp.arc(x, y, s * (0.6 + q * 1.6 * a.tam), 0, Math.PI * 2); gp.stroke(); gp.globalAlpha = 1; }
    if (estrellaAnim) { const q = (t - estrellaAnim.t0) / 2; if (q >= 0 && q < 1) { const [x, y] = centro(estrellaAnim.i); gp.fillStyle = `rgba(255,230,140,${(1 - q) * 0.5})`; gp.beginPath(); gp.arc(x, y, s * (1 + q * 6), 0, Math.PI * 2); gp.fill(); } }
  });

  m.alDibujar((gr) => {
    medir();
    const t = m.tiempo;
    // Panel: textos y botones (las gemas del panel las pone cadaGema). Se guardan como imagen y solo se redibujan
    // cuando algo cambia: escribir texto con borde en cada cuadro es de lo más caro del lienzo 2D.
    const p = panel, b = botones();
    const clave = [m.ancho, actual, yaGuardo, martillo, martilloArmado, deshacer && !!foto].join('|');
    if (clave !== clavePanel) { clavePanel = clave; pintarPanel(); }
    gr.drawImage(panelCache, 0, 0, m.ancho, ALTO);
    if (turno <= 3 && !bot) texto(gr, 'Toca una casilla para poner la gema. Tres iguales juntas se fusionan.', m.ancho / 2, p.horizontal ? p.y + p.h + 22 : ALTO - 20, Math.min(20, m.ancho / 24), '#fff6c9');
  });
  let clavePanel = '';
  const panelCache = document.createElement('canvas');
  function pintarPanel() {
    const ESC = 1.5, gr = panelCache.getContext('2d')!;
    panelCache.width = Math.ceil(m.ancho * ESC); panelCache.height = ALTO * ESC;
    gr.setTransform(ESC, 0, 0, ESC, 0, 0);
    const p = panel, b = botones();
    if (p.horizontal) {
      const w3 = p.w / 3;
      texto(gr, 'Ahora', p.x + w3 * 0.5, p.y + 10, 16, '#c9bfff'); texto(gr, 'Después', p.x + w3 * 1.5, p.y + 10, 16, '#c9bfff'); texto(gr, 'Guardada', p.x + w3 * 2.5, p.y + 10, 16, '#c9bfff');
    } else {
      texto(gr, 'Ahora', p.x + p.w / 2, p.y, 20, '#c9bfff');
      texto(gr, actual === PRISMA ? 'Prisma (comodín)' : NIVELES[actual].nombre, p.x + p.w / 2, p.y + 135, 18);
      texto(gr, 'Después', p.x + p.w * 0.27, p.y + 180, 16, '#c9bfff'); texto(gr, 'Guardada', p.x + p.w * 0.73, p.y + 180, 16, '#c9bfff');
    }
    caja(gr, b.guardar, false, yaGuardo ? 'Guardar (ya)' : 'Guardar (G)');
    caja(gr, b.martillo, martilloArmado, martillo ? (martilloArmado ? 'Toca una casilla' : 'Martillo (M)') : 'Martillo: cadena 4');
    caja(gr, b.deshacer, false, conDeshacer ? (deshacer && foto ? 'Deshacer (Z)' : 'Deshacer: usado') : 'Deshacer: no en duelos');
  }

  function terminar() {
    if (terminado) return;
    terminado = true;
    musica.parar(); m.detener();
    if (reto) try { const k = `susto.gemas.reto.${hoy}`; if (puntos > Number(localStorage.getItem(k) || 0)) localStorage.setItem(k, String(puntos)); } catch { /* sin almacenamiento */ }
    const mayor = Math.max(...g.filter((v) => v >= 0 && v < 7), 0);
    c.alTerminar({
      puntaje: puntos,
      lineas: [
        ['Resultado', fin], ['Turnos', String(turno - 2)], ['Fusiones', String(fusiones)], ['Mejor cadena', mejorCadena ? `×${mejorCadena}` : '—'],
        ['Gemas estrella', String(estrellas)], ['Piedras rotas', String(piedrasRotas)], ['Turnos en flujo', String(flujoTurnos)], ['Gema mayor en la rejilla', NIVELES[mayor].nombre],
      ],
      detalle: { turnos: turno - 2, fusiones, cadena: mejorCadena, estrellas, piedras: piedrasRotas, flujo: flujoTurnos },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__gemas = () => ({ puntos, turno, fusiones, mejorCadena, estrellas, piedrasRotas, vacias: g.filter((v) => v === VACIA).length, terminado });
  return {
    empezar() { m.empezar(); inicio = m.tiempo; ultimoTurno = -9; musica.intensidad = 1; },
    destruir() { musica.parar(); m.destruir(); },
  };
}
