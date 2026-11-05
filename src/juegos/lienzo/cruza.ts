import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { desdeTexto, type Sprite } from './pixel';

// Cruza la Isla (04-11): avanzas casilla a casilla (flechas o WASD, tocar = adelante, deslizar = hacia ese lado) y
// cruzas calles con autos y camiones, ríos con troncos (algunos se hunden un rato) y vías de tren (la luz roja avisa
// antes de que pase). Los árboles no dejan pasar. Si te quedas atrás, te alcanza la marea. Tres zonas: playa, pueblo y
// volcán (ríos de lava con rocas). Monedas, racha por avanzar rápido, personajes que se desbloquean con las monedas
// juntadas (solo de adorno) y la marca de tu récord. Puntaje: 10 por fila nueva, más monedas y racha. 3 minutos y
// una vida. Todo sale de la semilla: en un duelo, el mismo mapa y los mismos autos a la misma hora.
//
// Siempre hay paso: los árboles solo aparecen en la primera fila de pasto de cada tramo (las siguientes van libres),
// y en los ríos los troncos pasan seguido.

const COLS = 9, C = 64, W = COLS * C, H = 720, DURA = 180, SALTO = 0.11;
type Tipo = 'pasto' | 'calle' | 'rio' | 'via';
interface Fila { tipo: Tipo; dir: number; vel: number; largo: number; periodo: number; fase: number; arboles: number[]; monedas: number[]; hunde: number }
const TOTAL = 'susto.cruza.monedas', RECORD = 'susto.cruza.record';
const zonaDe = (n: number) => (n < 50 ? 0 : n < 110 ? 1 : 2);
const ZONAS = [
  { nombre: 'Playa', pasto: ['#e3c27a', '#d6b46c'], calle: '#6a6a76', rio: ['#2f8fd8', '#3fa0e8'], tronco: '#8a5a32', borde: '#b07a48' },
  { nombre: 'Pueblo', pasto: ['#5fb04a', '#55a242'], calle: '#3e3e4a', rio: ['#2a6fc0', '#3478cc'], tronco: '#7a4a28', borde: '#a06a3a' },
  { nombre: 'Volcán', pasto: ['#5a4a4a', '#4e4040'], calle: '#2a2228', rio: ['#e8501a', '#ff7a1a'], tronco: '#3e3434', borde: '#6a5a5a' },
];

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'cruza', { fondo: '#5fb04a', pixel: () => 3 });
  const musica = crearMusica(m.mesa, 120);
  musica.acordes([[60, 64, 67], [57, 60, 64], [62, 65, 69], [55, 59, 62]]);
  const bot = piloto();
  const r = generador(`${c.semilla}|cruza`);
  let total = 0, record = 0;
  try { total = Number(localStorage.getItem(TOTAL)) || 0; record = Number(localStorage.getItem(RECORD)) || 0; } catch { /* sin almacenamiento */ }

  // ── Mapa: tramos de pasto, calles, ríos y vías, cada vez más difíciles ──
  const filas: Fila[] = [];
  const nueva = (tipo: Tipo, n: number): Fila => {
    const d = Math.min(1, n / 160), dir = r() < 0.5 ? -1 : 1;
    if (tipo === 'calle') { const largo = r() < 0.25 + d * 0.2 ? 2 : 1; return { tipo, dir, vel: 1.4 + d * 2.6 + r() * 1.2, largo, periodo: largo + 2.6 + r() * (4 - d * 1.5), fase: r() * 10, arboles: [], monedas: [], hunde: 0 }; }
    if (tipo === 'rio') { const largo = 2 + Math.floor(r() * (3 - d)); return { tipo, dir, vel: 1 + d * 1.6 + r() * 0.8, largo, periodo: largo + 1.4 + r() * (1.4 + d), fase: r() * 10, arboles: [], monedas: [], hunde: n > 30 && r() < 0.3 + d * 0.3 ? 4 + r() * 3 : 0 }; }
    if (tipo === 'via') return { tipo, dir, vel: 20, largo: 7, periodo: 20 * (6 + r() * 5), fase: r() * 100, arboles: [], monedas: [], hunde: 0 };
    return { tipo, dir: 1, vel: 0, largo: 0, periodo: 1, fase: 0, arboles: [], monedas: [], hunde: 0 };
  };
  const generar = (hasta: number) => {
    while (filas.length < hasta) {
      const n = filas.length;
      if (n < 4) { filas.push(nueva('pasto', n)); continue; }
      // Tramo de pasto (1 a 3 filas; árboles solo en la primera) y después un obstáculo (calles, río o vía)
      const pastos = 1 + Math.floor(r() * 3);
      for (let i = 0; i < pastos; i++) {
        const f = nueva('pasto', filas.length);
        if (i === 0) { const k = Math.floor(r() * 3); for (let j = 0; j < k; j++) { const col = Math.floor(r() * COLS); if (!f.arboles.includes(col)) f.arboles.push(col); } }
        if (r() < 0.25) { const col = Math.floor(r() * COLS); if (!f.arboles.includes(col)) f.monedas.push(col); }
        filas.push(f);
      }
      const x = r(), tipo: Tipo = x < 0.45 ? 'calle' : x < 0.85 ? 'rio' : 'via', cuantas = tipo === 'via' ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * Math.min(5, 2 + filas.length / 40));
      for (let i = 0; i < cuantas; i++) { const f = nueva(tipo, filas.length); if (tipo === 'calle' && r() < 0.15) f.monedas.push(Math.floor(r() * COLS)); filas.push(f); }
    }
  };
  generar(40);
  const fila = (n: number) => { if (n >= filas.length - 20) generar(n + 40); return filas[Math.max(0, n)]; };
  /** Tramos ocupados (en casillas) de la fila n en el tiempo t: autos, troncos o tren. */
  const tramos = (f: Fila, t: number) => {
    const res: [number, number][] = [];
    if (f.tipo === 'pasto') return res;
    const base = (((f.fase + f.dir * f.vel * t) % f.periodo) + f.periodo) % f.periodo;
    for (let x = base - f.periodo * Math.ceil((f.largo + 2) / f.periodo + 1); x < COLS + 2; x += f.periodo) res.push([x, x + f.largo]);
    return res;
  };
  const hundido = (f: Fila, t: number, x0: number) => f.hunde > 0 && ((t + x0 * 0.01 + f.fase) % (f.hunde + 2)) > f.hunde; // un rato bajo el agua
  /** ¿Se muere quien está en la fila n, en x (centro, en casillas), en el tiempo t? */
  const peligro = (n: number, x: number, t: number) => {
    const f = fila(n);
    if (f.tipo === 'pasto') return false;
    if (f.tipo === 'rio') return !tramos(f, t).some(([a, b]) => x > a - 0.2 && x < b + 0.2 && !hundido(f, t, Math.floor(a))); // basta con que parte del pollo pise el tronco
    return tramos(f, t).some(([a, b]) => x + 0.32 > a && x - 0.32 < b);
  };

  // ── Estado ──
  const yo = { fila: 0, x: 4.5, desdeFila: 0, desdeX: 4.5, salto: 1 };
  let fase: 'juego' | 'fin' = 'juego', cam = -2, marea = -4, mejor = 0, monedas = 0, racha = 0, ultimoAvance = 0, bonus = 0, proximo: string | null = null;
  const prueba = { sinPaso: 0, fuera: 0 };
  const total0 = total;
  const SKINS: [number, string, string][] = [[0, '#ffffff', '#ff8a2a'], [30, '#ffd23c', '#e8325a'], [80, '#7cffcb', '#2f6bd8'], [160, '#b06bff', '#ffd23c']];
  const skin = SKINS.filter((s) => total0 >= s[0]).pop()!;

  function mover(dir: string) {
    if (fase !== 'juego') return;
    if (yo.salto < 1) { proximo = dir; return; } // se guarda un salto
    const df = dir === 'arriba' ? 1 : dir === 'abajo' ? -1 : 0, dc = dir === 'izq' ? -1 : dir === 'der' ? 1 : 0;
    // En un río (o saltando a uno) se mueve exactamente una casilla desde donde está, sin acomodarse a la grilla: el
    // tronco va corriendo y acomodarse lo podía sacar del tronco. En tierra sí se acomoda al centro de la casilla.
    const nf = Math.max(0, yo.fila + df), nx = fila(nf).tipo === 'rio' || fila(yo.fila).tipo === 'rio' && df === 0 ? yo.x + dc : Math.round(yo.x - 0.5) + 0.5 + dc;
    if (nx < 0.5 || nx > COLS - 0.5) return;
    if (fila(nf).tipo === 'pasto' && fila(nf).arboles.includes(Math.floor(nx))) { m.mesa.sonido.tono(160, 0.05, 'square', 0.03); return; }
    yo.desdeFila = yo.fila; yo.desdeX = yo.x; yo.fila = nf; yo.x = nx; yo.salto = 0;
    m.mesa.sonido.tono(df > 0 ? 520 : 420, 0.05, 'square', 0.035);
    if (nf > mejor) {
      mejor = nf;
      racha = m.tiempo - ultimoAvance < 0.45 ? racha + 1 : 0; ultimoAvance = m.tiempo;
      if (racha >= 5 && racha % 5 === 0) { bonus += racha; const [x, y] = aPantalla(yo.x, yo.fila); m.efectos.flotar(x, y - 40, `¡Racha ${racha}! +${racha}`, '#ffd23c', 22); }
    }
  }

  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    const t = m.tiempo;
    if (!c.libre && t >= DURA) { terminar('Se acabó el tiempo'); return; }
    if (yo.salto < 1) { yo.salto = Math.min(1, yo.salto + dt / SALTO); if (yo.salto >= 1 && proximo) { const d = proximo; proximo = null; mover(d); } }
    const f = fila(yo.fila);
    // Arriba de un tronco, el tronco te lleva; también mientras saltas hacia él (si no, al caer el tronco ya se corrió)
    if (f.tipo === 'rio') { yo.x += f.dir * f.vel * dt; if (yo.salto < 1) yo.desdeX += f.dir * f.vel * dt; if (yo.x < 0.2 || yo.x > COLS - 0.2) { morir(f.tipo === 'rio' && zonaDe(yo.fila) === 2 ? 'La lava te llevó' : 'El río te llevó'); return; } }
    // Choques (al aterrizar y mientras estás ahí)
    if (yo.salto >= 0.7 && peligro(yo.fila, yo.x, t)) { morir(f.tipo === 'rio' ? (zonaDe(yo.fila) === 2 ? 'Caíste a la lava' : 'Caíste al agua') : f.tipo === 'via' ? 'Te pasó el tren' : 'Te atropelló un auto'); return; }
    // Monedas
    if (yo.salto >= 1 && f.monedas.includes(Math.floor(yo.x))) { f.monedas = f.monedas.filter((k) => k !== Math.floor(yo.x)); monedas++; total++; const [x, y] = aPantalla(yo.x, yo.fila); m.efectos.flotar(x, y - 30, '+20', '#ffd23c', 22); m.mesa.sonido.tono(1320, 0.07, 'square', 0.04); }
    // La marea sube sola (cada vez más rápido) y no deja quedarse muy atrás
    marea = Math.max(marea + (0.32 + t * 0.003) * dt, yo.fila - 9);
    if (marea >= yo.fila + 0.2) { morir('Te alcanzó la marea'); return; }
    cam += (Math.max(cam, yo.fila - 2) - cam) * Math.min(1, dt * 6);
    if (yo.x < 0 || yo.x > COLS) prueba.fuera++;
    if (toque && m.puntero.abajo) { const dx = m.puntero.x - toque[0], dy = m.puntero.y - toque[1]; if (Math.hypot(dx, dy) >= 26) { toque = null; deslizar(dx, dy); } }
    if (bot) pilotar();
    m.mesa.hud.puntos(String(total0Puntos()));
    if (!c.libre) { const q = Math.max(0, DURA - t); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`${mejor} filas · ${ZONAS[zonaDe(yo.fila)].nombre}`);
  });
  const total0Puntos = () => mejor * 10 + monedas * 20 + bonus;
  function morir(porque: string) { const [x, y] = aPantalla(yo.x, yo.fila); m.efectos.chispas(x, y, ['#ffffff', '#e8325a', '#ffd23c'], 18, 300); m.efectos.temblar(14); m.mesa.sonido.mal(); terminar(porque); }

  // ── Mandos: flechas o WASD; tocar = adelante, deslizar = hacia ese lado ──
  m.alTecla((k) => { if (bot) return; const d = k === 'ArrowUp' || k === 'w' || k === ' ' ? 'arriba' : k === 'ArrowDown' || k === 's' ? 'abajo' : k === 'ArrowLeft' || k === 'a' ? 'izq' : k === 'ArrowRight' || k === 'd' ? 'der' : null; if (d) mover(d); });
  let toque: [number, number] | null = null;
  // Respuesta inmediata: con mouse, salta al apretar; con el dedo, el deslizamiento cuenta apenas pasa de 26 unidades
  // (sin esperar a soltar) y el toque simple salta al soltar (si no, cada deslizamiento empezaría con un salto adelante)
  const deslizar = (dx: number, dy: number) => { if (Math.abs(dx) > Math.abs(dy)) mover(dx > 0 ? 'der' : 'izq'); else mover(dy < 0 ? 'arriba' : 'abajo'); };
  m.alTocar((x, y) => { if (bot) return; if (m.puntero.tipo === 'mouse') { mover('arriba'); toque = null; return; } toque = [x, y]; });
  m.alSoltar((x, y) => {
    if (bot || !toque) return;
    const dx = x - toque[0], dy = y - toque[1]; toque = null;
    if (Math.hypot(dx, dy) < 26) mover('arriba'); else deslizar(dx, dy);
  });

  // ── Bots: el bueno mira si la casilla de adelante va a estar segura al llegar y un rato después; el torpe salta a lo loco ──
  const rb = generador('bot-cruza');
  let botEspera = 0;
  function pilotar() {
    if (yo.salto < 1 || m.tiempo < botEspera) return;
    const torpe = bot === 'torpe', t = m.tiempo;
    if (torpe) { botEspera = t + 0.25 + rb() * 0.5; const x = rb(); mover(x < 0.6 ? 'arriba' : x < 0.75 ? 'izq' : x < 0.9 ? 'der' : 'abajo'); return; }
    const seguro = (n: number, x: number, desde: number, hasta: number) => {
      if (n < 0) return false;
      const f = fila(n);
      if (f.tipo === 'pasto') return !f.arboles.includes(Math.floor(x));
      for (let s = desde; s <= hasta; s += 0.05) { const xx = f.tipo === 'rio' ? x + f.dir * f.vel * s : x; /* el río lleva desde que empieza el salto */ if (xx < 0.4 || xx > COLS - 0.4 || peligro(n, xx, t + s)) return false; }
      return true;
    };
    const aqui = Math.round(yo.x - 0.5) + 0.5, marg = 0.6;
    const quedarse = seguro(yo.fila, yo.x, 0, marg);
    if (seguro(yo.fila + 1, aqui, SALTO * 0.7, SALTO + marg)) { mover('arriba'); return; }
    if (marea > yo.fila - 2.5 || !quedarse) {
      // Apurado o en peligro: busca un lado seguro (hacia el centro primero), o retrocede
      const lados = (yo.x < COLS / 2 ? ['der', 'izq'] : ['izq', 'der']) as ('der' | 'izq')[];
      for (const l of lados) { const nx = aqui + (l === 'der' ? 1 : -1); if (nx > 0 && nx < COLS && seguro(yo.fila, nx, SALTO * 0.7, SALTO + marg)) { mover(l); return; } }
      if (!quedarse && seguro(yo.fila - 1, aqui, SALTO * 0.7, SALTO + marg)) { mover('abajo'); return; }
    } else if (fila(yo.fila + 1).tipo === 'pasto' || fila(yo.fila).tipo === 'pasto') {
      // En pasto, se acomoda hacia donde la próxima fila se ve más libre
      const mejorCol = [...Array(COLS).keys()].map((k) => k + 0.5).filter((x) => !fila(yo.fila + 1).arboles.includes(Math.floor(x))).sort((a, b) => Math.abs(a - 4.5) - Math.abs(b - 4.5))[0];
      if (mejorCol !== undefined && fila(yo.fila).tipo === 'pasto' && fila(yo.fila + 1).arboles.includes(Math.floor(aqui))) { const l = mejorCol > aqui ? 'der' : 'izq'; const nx = aqui + (l === 'der' ? 1 : -1); if (!fila(yo.fila).arboles.includes(Math.floor(nx))) { mover(l); return; } }
    }
    botEspera = t + 0.04;
  }

  // ── Dibujo ──
  const esc = () => Math.min(1, (m.ancho - 8) / W), ox = () => (m.ancho - W * esc()) / 2;
  /** Centro en pantalla de la casilla (x en casillas, fila n). */
  const aPantalla = (x: number, n: number) => { const s = esc(); return [ox() + x * C * s, H - (n - cam + 1.5) * C * s] as const; };
  const P = { O: '#1b1630', B: '#ffffff', N: '#ff8a2a', A: '#ffd23c', R: '#e8325a', V: '#3fa34d', v: '#2a7a3a', K: '#8a5a32', G: '#b9b9c6', g: '#7a7a86', Z: '#2f6bd8', L: '#bfe9ff', Y: '#fff1a8' };
  const pollo = (cuerpo: string, pico: string) => desdeTexto(['..RR....', '.BBBB...', '.BOBBN..', '.BBBBNN.', 'BBBBBB..', 'BBBBBB..', '.BBBB...', '..N.N...'].map((f) => f), { ...P, B: cuerpo, N: pico });
  const YO = pollo(skin[1], skin[2]);
  const ARBOL = desdeTexto(['..vVVv..', '.vVVVVv.', 'vVVvVVVv', 'vVVVVvVv', '.vVVVVv.', '...KK...', '...KK...'], P);
  const PALMA = desdeTexto(['VV.VV.VV', '.VVVVVV.', '..VKKV..', '...KK...', '...KK...', '...KK...', '...KK...'], P);
  const ROCA = desdeTexto(['..gggg..', '.gGGGGg.', 'gGGgGGGg', 'gGGGGGGg', '.gggggg.'], P);
  const MONEDA = desdeTexto(['.AAA.', 'AABAA', 'AABAA', '.AAA.'], P);
  const auto = (color: string) => desdeTexto(['..OOOOOO..', '.OLLOLLLO.', 'OCCCCCCCCO', 'OCCCCCCCCO', '.OO....OO.'].map((f) => f), { ...P, C: color });
  const AUTOS = ['#e8325a', '#2f6bd8', '#ffd23c', '#3fa34d', '#b06bff'].map(auto);
  const CAMION = desdeTexto(['OOOOOOOOOOO.......', 'OGGGGGGGGGOOOOO...', 'OGGGGGGGGGOLLLOO..', 'OGGGGGGGGGOCCCCCO.', 'OOOOOOOOOOOOOOOOO.', '.OO....OO....OO...'], { ...P, C: '#e8325a' });
  const TREN = desdeTexto(['OOOOOOOOOOOOOOOOOOOOOOOOOOOOOO', 'OZZZLLZZZLLZZZLLZZZLLZZZZZZZZO', 'OZZZLLZZZLLZZZLLZZZLLZZZZZZZZO', 'OZZZZZZZZZZZZZZZZZZZZZZZZZZZZO', 'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOO', '.OO..OO..OO..OO..OO..OO..OO...'], P);
  m.alPixel((gp) => {
    const s = esc(), k = m.k, px = (v: number) => Math.round(v / k) * k, t = m.tiempo, x0 = ox(), cs = C * s;
    gp.fillStyle = '#123458'; gp.fillRect(0, 0, m.ancho, H);
    const desde = Math.floor(cam) - 1, hasta = Math.ceil(cam + H / cs) + 1;
    for (let n = Math.max(0, desde); n <= hasta; n++) {
      const f = fila(n), z = ZONAS[zonaDe(n)], [, cy] = aPantalla(0, n), y = px(cy - cs / 2), alto = px(cs) + k;
      if (f.tipo === 'pasto') { gp.fillStyle = z.pasto[n % 2]; gp.fillRect(0, y, m.ancho, alto); }
      else if (f.tipo === 'calle') { gp.fillStyle = z.calle; gp.fillRect(0, y, m.ancho, alto); gp.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 0; x < m.ancho; x += 40 * s) gp.fillRect(px(x), y, px(18 * s), k); }
      else if (f.tipo === 'rio') { gp.fillStyle = z.rio[n % 2]; gp.fillRect(0, y, m.ancho, alto); gp.fillStyle = 'rgba(255,255,255,.2)'; for (let x = (t * 20 * f.dir) % 30; x < m.ancho; x += 30 * s) gp.fillRect(px(x0 + x), px(cy), 4 * k, k); }
      else { gp.fillStyle = '#5a4a3a'; gp.fillRect(0, y, m.ancho, alto); gp.fillStyle = '#b9b9c6'; gp.fillRect(0, px(cy - cs * 0.22), m.ancho, k); gp.fillRect(0, px(cy + cs * 0.22), m.ancho, k); gp.fillStyle = '#8a5a32'; for (let x = 0; x < m.ancho; x += 22 * s) gp.fillRect(px(x), px(cy - cs * 0.3), 3 * k, px(cs * 0.6)); }
      // Objetos
      if (f.tipo === 'pasto') { for (const a of f.arboles) { const [x] = aPantalla(a + 0.5, n); m.sprite(zonaDe(n) === 0 ? PALMA : zonaDe(n) === 2 ? ROCA : ARBOL, x, cy, 2.4 * s); } }
      else for (const [a, b] of tramos(f, t)) {
        const [xa] = aPantalla(a, n), [xb] = aPantalla(b, n), ancho = xb - xa;
        if (xb < 0 || xa > m.ancho) continue;
        if (f.tipo === 'rio') { if (hundido(f, t, Math.floor(a))) gp.globalAlpha = 0.3; else if (hundido(f, t + 1, Math.floor(a)) && Math.floor(t * 8) % 2) gp.globalAlpha = 0.6; /* aviso: se hunde en 1 s */ gp.fillStyle = ZONAS[zonaDe(n)].tronco; gp.fillRect(px(xa + 4 * s), px(cy - cs * 0.3), px(ancho - 8 * s), px(cs * 0.6)); gp.fillStyle = ZONAS[zonaDe(n)].borde; gp.fillRect(px(xa + 4 * s), px(cy - cs * 0.3), px(ancho - 8 * s), k); gp.globalAlpha = 1; }
        else if (f.tipo === 'via') m.sprite(TREN, (xa + xb) / 2, cy, (ancho / 30 / k) * 1);
        else { const img = f.largo > 1 ? CAMION : AUTOS[Math.abs(Math.floor(a * 7 + n)) % AUTOS.length]; gp.save(); if (f.dir < 0) { gp.translate(px((xa + xb) / 2), 0); gp.scale(-1, 1); gp.translate(-px((xa + xb) / 2), 0); } m.sprite(img, (xa + xb) / 2, cy, (ancho - 6 * s) / img.width / k); gp.restore(); }
      }
      // Luz del tren: se enciende antes de que llegue
      if (f.tipo === 'via') { const viene = tramos(f, t + 1.3).some(([a, b]) => b > -1 && a < COLS + 1); if (viene) { gp.fillStyle = 'rgba(232,50,90,.18)'; gp.fillRect(0, px(cy - cs / 2), m.ancho, px(cs)); } gp.fillStyle = viene && Math.floor(t * 6) % 2 ? '#e8325a' : '#3e3e4a'; for (const lxx of [0.3, COLS - 0.7]) { const [lx] = aPantalla(lxx, n); gp.fillRect(px(lx), px(cy - cs * 0.45), 7 * k, 7 * k); } }
      for (const mo of f.monedas) { const [x] = aPantalla(mo + 0.5, n); m.sprite(MONEDA, x, cy + Math.sin(t * 4 + mo) * 3, 2 * s); }
      if (n === record && record > 0) { gp.fillStyle = '#ffd23c'; for (let x = 0; x < m.ancho; x += 6 * k) gp.fillRect(px(x), px(cy + cs / 2), 3 * k, k); }
    }
    // Bordes del mapa (fuera de las 9 columnas, más oscuro)
    gp.fillStyle = 'rgba(14,11,22,.35)'; gp.fillRect(0, 0, px(x0), H); gp.fillRect(px(x0 + W * s), 0, m.ancho, H);
    // El jugador (con saltito)
    const k2 = yo.salto, xx = yo.desdeX + (yo.x - yo.desdeX) * Math.min(1, k2), nn = yo.desdeFila + (yo.fila - yo.desdeFila) * Math.min(1, k2);
    const [px0, py0] = aPantalla(xx, nn);
    m.sprite(YO, px0, py0 - Math.sin(Math.min(1, k2) * Math.PI) * 14 * s, 2.6 * s);
    // La marea
    const [, my] = aPantalla(0, marea);
    if (my < H) { gp.fillStyle = 'rgba(47,111,216,.7)'; gp.fillRect(0, px(my), m.ancho, H); gp.fillStyle = '#bfe9ff'; for (let x = 0; x < m.ancho; x += 8 * k) gp.fillRect(px(x), px(my + Math.sin(t * 3 + x * 0.05) * 3), 4 * k, k); }
  });
  m.alDibujar(() => {
    if (fase !== 'juego') return;
    if (record > 0) { const [, ry] = aPantalla(0, record); if (ry > 80 && ry < H - 20) m.rotulo(`Récord ${record}`, m.ancho - 60, ry + 18, 14, '#ffd23c'); }
    if (!bot && m.tiempo < 6) { const tam = Math.round(Math.min(20, m.ancho / 22)); m.rotulo(m.ancho > 600 ? 'Flechas o WASD · cruza sin que te pillen · ¡que no te alcance la marea!' : 'Toca para avanzar · desliza para ir de lado', m.ancho / 2, H * 0.3, tam, '#ffffff'); }
  });

  let terminado = false, motivo = '';
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin'; motivo = porque;
    musica.parar(); m.detener();
    try { localStorage.setItem(TOTAL, String(total)); if (mejor > record) localStorage.setItem(RECORD, String(mejor)); } catch { /* sin almacenamiento */ }
    const nuevoSkin = SKINS.find((s2) => total0 < s2[0] && total >= s2[0]);
    c.alTerminar({
      puntaje: total0Puntos(),
      lineas: [['Resultado', porque], ['Filas avanzadas', `${mejor}${mejor > record && record > 0 ? ' (¡récord!)' : ''}`], ['Zona a la que llegaste', ZONAS[zonaDe(mejor)].nombre], ['Monedas', String(monedas)], ['Bonus por racha', String(bonus)], ['Monedas juntadas en total', `${total}${nuevoSkin ? ' · ¡nuevo personaje!' : ''}`]],
      detalle: { filas: mejor, monedas, bonus },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cruza = () => ({ fase, puntos: total0Puntos(), filas: mejor, monedas, terminado, motivo, fila: yo.fila, seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); musica.intensidad = 1; },
    destruir() { musica.parar(); m.destruir(); },
  };
}
