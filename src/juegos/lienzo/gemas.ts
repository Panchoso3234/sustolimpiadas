import { fechaChile, generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import * as THREE from 'three';
import { crearMotor2D, crearMusica, piloto, texturaBrillo, texturaDe } from './motor2d';

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
  const m = crearMotor2D(c, 'gemas', { fondo: '#141028', tres: true });
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
  const gema = (gr: CanvasRenderingContext2D, nivel: number, x: number, y: number, r: number, t: number, latido = 0) => {
    gr.save(); gr.translate(x, y);
    const k = 1 + latido * 0.06 * Math.sin(t * 8);
    gr.scale(k, k);
    if (nivel === PIEDRA) {
      const gp = gr.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
      gp.addColorStop(0, '#9a9aa8'); gp.addColorStop(1, '#3e3e4a');
      gr.fillStyle = gp; gr.beginPath(); for (let q = 0; q < 7; q++) { const a = (q / 7) * Math.PI * 2, rr = r * (0.75 + ((q * 37) % 5) / 25); gr.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } gr.closePath(); gr.fill();
      gr.strokeStyle = 'rgba(0,0,0,.35)'; gr.lineWidth = 2; gr.beginPath(); gr.moveTo(-r * 0.3, -r * 0.4); gr.lineTo(0, 0); gr.lineTo(r * 0.2, r * 0.4); gr.stroke();
      gr.restore(); return;
    }
    if (nivel === PRISMA) {
      forma(gr, 0, r);
      const gp = gr.createLinearGradient(-r, -r, r, r);
      for (let q = 0; q <= 6; q++) gp.addColorStop(q / 6, `hsl(${(q * 60 + t * 120) % 360} 90% 65%)`);
      gr.fillStyle = gp; gr.fill(); gr.strokeStyle = '#ffffff'; gr.lineWidth = 2; gr.stroke();
      gr.restore(); return;
    }
    const [c1, c2, c3] = NIVELES[nivel].color;
    if (nivel >= 5) { gr.fillStyle = nivel === 6 ? 'rgba(255,210,60,.3)' : 'rgba(159,233,255,.25)'; gr.beginPath(); gr.arc(0, 0, r * 1.25 + Math.sin(t * 4) * 2, 0, Math.PI * 2); gr.fill(); }
    // Reflejo que se mueve con el puntero
    const lx = (m.puntero.x - x) / m.ancho, ly = (m.puntero.y - y) / ALTO;
    const gp = gr.createRadialGradient(-r * 0.35 + lx * r, -r * 0.4 + ly * r, r * 0.08, 0, 0, r * 1.05);
    gp.addColorStop(0, c1); gp.addColorStop(0.45, c2); gp.addColorStop(1, c3);
    forma(gr, nivel, r); gr.fillStyle = gp; gr.fill();
    gr.strokeStyle = 'rgba(255,255,255,.55)'; gr.lineWidth = 1.5; gr.stroke();
    // Facetas
    gr.strokeStyle = 'rgba(255,255,255,.28)'; gr.lineWidth = 1;
    gr.beginPath(); gr.moveTo(-r * 0.45, -r * 0.2); gr.lineTo(0, -r * 0.5); gr.lineTo(r * 0.45, -r * 0.2); gr.lineTo(0, r * 0.45); gr.closePath(); gr.stroke();
    gr.fillStyle = 'rgba(255,255,255,.7)'; gr.beginPath(); gr.ellipse(-r * 0.28 + lx * r * 0.4, -r * 0.42 + ly * r * 0.4, r * 0.16, r * 0.08, -0.6, 0, Math.PI * 2); gr.fill();
    const brillo = (Math.sin(t * 2 + x * 0.05 + y * 0.03) + 1) / 2;
    if (brillo > 0.93) { gr.fillStyle = '#ffffff'; gr.globalAlpha = (brillo - 0.93) * 14; gr.beginPath(); gr.arc(r * 0.3, -r * 0.3, 3, 0, Math.PI * 2); gr.fill(); gr.globalAlpha = 1; }
    gr.restore();
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

  // ── Capa 3D: gemas talladas con reflejos de verdad (material físico con mapa de entorno), sin postproceso ──
  const T = m.tres;
  if (T) {
    const E = T.escena;
    E.environment = T.entorno();
    E.add(new THREE.HemisphereLight(0xc9b8ff, 0x140c28, 0.8));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4); sol.position.set(-0.4, 0.7, 1); E.add(sol);
    // Una luz que sigue al puntero: los reflejos de las facetas se mueven con el mouse
    const luz = new THREE.PointLight(0xfff0d0, 2.4, 0, 0); E.add(luz);
    // Fondo: cueva de cristal pintada una vez
    const cueva = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ toneMapped: false, map: texturaDe(1024, 576, (cg) => {
      const fondo = cg.createRadialGradient(512, 288, 40, 512, 288, 620); fondo.addColorStop(0, '#2c2258'); fondo.addColorStop(1, '#07051a');
      cg.fillStyle = fondo; cg.fillRect(0, 0, 1024, 576);
      const rc = generador('cueva');
      for (let k = 0; k < 26; k++) {
        const borde = k % 2 ? 576 : 0, x = rc() * 1024, h = 60 + rc() * 140, w = 18 + rc() * 30, dir = borde ? -1 : 1;
        const gr = cg.createLinearGradient(x, borde, x, borde + dir * h); gr.addColorStop(0, 'rgba(120,90,220,.55)'); gr.addColorStop(1, 'rgba(190,160,255,.12)');
        cg.fillStyle = gr; cg.beginPath(); cg.moveTo(x - w / 2, borde); cg.lineTo(x + (rc() - 0.5) * 20, borde + dir * h); cg.lineTo(x + w / 2, borde); cg.fill();
      }
      for (let k = 0; k < 160; k++) { cg.fillStyle = `rgba(200,180,255,${0.05 + rc() * 0.3})`; cg.beginPath(); cg.arc(rc() * 1024, rc() * 576, 0.6 + rc() * 2, 0, Math.PI * 2); cg.fill(); }
    }) }));
    cueva.position.z = -900; E.add(cueva);
    // Casillas: una sola malla instanciada (49 hexágonos de piedra con el borde biselado)
    const geoHex = new THREE.CylinderGeometry(0.86, 1, 0.3, 6, 1); geoHex.rotateX(Math.PI / 2);
    const casillas = new THREE.InstancedMesh(geoHex, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, flatShading: true }), N);
    E.add(casillas);
    const COLOR_CASILLA = new THREE.Color(0x231c44), COLOR_BAJO = new THREE.Color(0x40357a), COLOR_PREVIA = new THREE.Color(0x8a6414);
    // Geometrías de cada gema (tamaño 1, de frente a la cámara)
    const torno = (pts: [number, number][], lados: number) => { const ge = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), lados); return ge; };
    const extruir = (forma: THREE.Shape) => { const ge = new THREE.ExtrudeGeometry(forma, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.16, bevelSegments: 1, curveSegments: 8 }); ge.center(); ge.computeBoundingSphere(); ge.scale(1 / ge.boundingSphere!.radius, 1 / ge.boundingSphere!.radius, 1 / ge.boundingSphere!.radius); return ge; };
    const corazon = new THREE.Shape(); corazon.moveTo(0, -1); corazon.bezierCurveTo(-1.3, -0.1, -0.8, 1.05, 0, 0.45); corazon.bezierCurveTo(0.8, 1.05, 1.3, -0.1, 0, -1);
    const estrella = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? 0.45 : 1; if (k) estrella.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else estrella.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const brillante = torno([[0, -1], [0.98, 0.12], [0.72, 0.42], [0.42, 0.5], [0, 0.5]], 8); brillante.rotateX(Math.PI / 2);
    const esmeralda = new THREE.CylinderGeometry(0.62, 0.92, 0.55, 8, 1); esmeralda.rotateX(Math.PI / 2); esmeralda.scale(0.85, 1.08, 1);
    const geos: THREE.BufferGeometry[] = [
      torno([[0, -1], [0.55, -0.72], [0.55, 0.45], [0, 1]], 6), // cuarzo: prisma hexagonal con punta
      new THREE.IcosahedronGeometry(0.92, 1).scale(0.86, 1, 0.62), // ámbar: cabujón
      esmeralda,
      new THREE.OctahedronGeometry(1).scale(0.74, 1.05, 0.5), // zafiro
      extruir(corazon), // rubí
      brillante, // diamante: talla brillante, la mesa hacia la cámara
      extruir(estrella),
    ];
    const piedraGeo = new THREE.DodecahedronGeometry(0.85, 0).scale(1, 0.9, 0.7);
    // Material estándar (liviano) para casi todas; solo el diamante y el prisma llevan iridiscencia
    const mats: THREE.Material[] = NIVELES.map((n, k) => k === 5
      ? new THREE.MeshPhysicalMaterial({ color: 0xcff2ff, metalness: 0, roughness: 0.03, flatShading: true, envMapIntensity: 1.8, iridescence: 0.8, iridescenceIOR: 1.7, emissive: 0x1a4a5a })
      : new THREE.MeshStandardMaterial({ color: n.color[1], metalness: k === 6 ? 0.8 : 0.1, roughness: k === 1 ? 0.28 : 0.1, flatShading: k !== 1, envMapIntensity: k === 6 ? 1.3 : 0.9, emissive: new THREE.Color(n.color[2]).multiplyScalar(k === 6 ? 0.3 : 0.3) }));
    const matPrisma = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.05, flatShading: true, iridescence: 1, iridescenceIOR: 2, iridescenceThicknessRange: [200, 900], envMapIntensity: 1.6 });
    const matPiedra = new THREE.MeshStandardMaterial({ color: 0x777788, roughness: 0.92, metalness: 0, flatShading: true });
    // Mallas y brillos reutilizables: cada imagen se toman los que hacen falta y el resto se esconde
    const mallas: THREE.Mesh[] = [], brillos: THREE.Sprite[] = [];
    let nMallas = 0, nBrillos = 0;
    const malla = () => { let o = mallas[nMallas]; if (!o) { o = new THREE.Mesh(geos[0], mats[0]); mallas.push(o); E.add(o); } nMallas++; o.visible = true; return o; };
    const brillo = (x: number, y: number, r: number, color: string, alfa: number) => {
      let o = brillos[nBrillos];
      if (!o) { o = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrillo(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); brillos.push(o); E.add(o); }
      nBrillos++; o.visible = true; o.position.set(x, -y, -40); o.scale.set(r, r, 1);
      o.material.color.set(color); o.material.opacity = alfa;
    };
    const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), esc = new THREE.Vector3();
    m.antes3d(() => {
      medir();
      const t = m.tiempo, px = m.puntero.x, py = m.puntero.y;
      cueva.position.set(m.ancho / 2, -ALTO / 2, -900); cueva.scale.set(Math.max(m.ancho, ALTO * 16 / 9), Math.max(ALTO, m.ancho * 9 / 16), 1);
      luz.position.set(px || m.ancho / 2, -(py || ALTO / 2), 420);
      const { bajo, previa } = vistaPrevia();
      for (let i = 0; i < N; i++) {
        const [x, y] = centro(i);
        mat4.compose(v.set(x, -y, -36), q.identity(), esc.set(s * 0.95, s * 0.95, s));
        casillas.setMatrixAt(i, mat4);
        casillas.setColorAt(i, previa.includes(i) ? COLOR_PREVIA : i === bajo ? COLOR_BAJO : COLOR_CASILLA);
      }
      casillas.instanceMatrix.needsUpdate = true; casillas.instanceColor!.needsUpdate = true;
      nMallas = 0; nBrillos = 0;
      cadaGema(t, (nivel, x, y, r, latido) => {
        const o = malla(), k = 1 + latido * 0.07 * Math.sin(t * 8);
        o.geometry = nivel === PIEDRA ? piedraGeo : nivel === PRISMA ? geos[0] : geos[nivel];
        o.material = nivel === PIEDRA ? matPiedra : nivel === PRISMA ? matPrisma : mats[nivel];
        o.position.set(x, -y, 0);
        o.scale.setScalar(r * k);
        // Se inclinan un poco hacia el puntero y se mecen: las facetas cambian de brillo
        o.rotation.set((py - y) / ALTO * 0.7 + Math.sin(t * 0.9 + x * 0.02) * 0.12, (px - x) / m.ancho * 0.9 + Math.cos(t * 0.7 + y * 0.03) * 0.15, nivel === 0 || nivel === PRISMA ? Math.sin(t * 0.5 + x) * 0.1 : 0);
        if (nivel >= 4 && nivel < 7) brillo(x, y, r * 3.4, NIVELES[nivel].color[1], 0.28 + 0.12 * Math.sin(t * 3 + x));
        else if (nivel === PRISMA) brillo(x, y, r * 3.2, `hsl(${(t * 90) % 360} 90% 65%)`, 0.35);
        if (latido) brillo(x, y, r * 2.6, '#ffffff', 0.12 + 0.1 * Math.sin(t * 8));
        // Destello que pasa de vez en cuando por una faceta
        const d = Math.sin(t * 1.7 + x * 0.05 + y * 0.031);
        if (d > 0.96 && nivel !== PIEDRA) brillo(x + r * 0.35, y - r * 0.35, r * (d - 0.96) * 40, '#ffffff', 0.9);
      });
      // Polvo de cristal que flota delante de la cueva
      for (let k = 0; k < 18; k++) {
        const x = ((k * 211 + t * (8 + (k % 5) * 3)) % (m.ancho + 40)) - 20, y = (k * 137 + Math.sin(t * 0.4 + k) * 30) % ALTO;
        brillo(x, y, 6 + (k % 4) * 3, k % 3 ? '#b9a8ff' : '#7fd8ff', 0.25 + 0.2 * Math.sin(t * 1.3 + k));
      }
      for (let k = nMallas; k < mallas.length; k++) mallas[k].visible = false;
      for (let k = nBrillos; k < brillos.length; k++) brillos[k].visible = false;
    });
  }

  m.alDibujar((gr) => {
    medir();
    const t = m.tiempo;
    if (!T) {
      // Respaldo sin WebGL: fondo, casillas y gemas dibujadas en 2D
      const fondo = gr.createRadialGradient(m.ancho / 2, ALTO / 2, 50, m.ancho / 2, ALTO / 2, Math.max(m.ancho, ALTO));
      fondo.addColorStop(0, '#2a2152'); fondo.addColorStop(1, '#0a0818');
      gr.fillStyle = fondo; gr.fillRect(0, 0, m.ancho, ALTO);
      for (let k = 0; k < 40; k++) { const x = (k * 197) % m.ancho, y = (k * 113) % ALTO, b = (Math.sin(t * 1.5 + k) + 1) / 2; gr.fillStyle = `rgba(190,170,255,${0.08 + b * 0.25})`; gr.beginPath(); gr.arc(x, y, 1.5 + (k % 3), 0, Math.PI * 2); gr.fill(); }
      const { bajo, previa } = vistaPrevia();
      for (let i = 0; i < N; i++) {
        const [x, y] = centro(i);
        hexa(gr, x, y, s * 0.96);
        gr.fillStyle = previa.includes(i) ? 'rgba(255,207,74,.28)' : i === bajo ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.05)';
        gr.fill(); gr.strokeStyle = previa.includes(i) ? '#ffcf4a' : 'rgba(180,160,255,.22)'; gr.lineWidth = 2; gr.stroke();
      }
      cadaGema(t, (nivel, x, y, r, latido) => gema(gr, nivel, x, y, r, t, latido));
    }
    for (const a of anillos) { const k = (t - a.t0) / 0.6; if (k < 0) continue; const [x, y] = centro(a.i); gr.strokeStyle = a.color; gr.globalAlpha = 1 - k; gr.lineWidth = 6; gr.beginPath(); gr.arc(x, y, s * (0.6 + k * 1.6 * a.tam), 0, Math.PI * 2); gr.stroke(); gr.globalAlpha = 1; }
    if (estrellaAnim) {
      const k = (t - estrellaAnim.t0) / 2;
      if (k >= 0 && k < 1) { const [x, y] = centro(estrellaAnim.i); gr.fillStyle = `rgba(255,230,140,${(1 - k) * 0.5})`; gr.beginPath(); gr.arc(x, y, s * (1 + k * 6), 0, Math.PI * 2); gr.fill(); }
    }
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
