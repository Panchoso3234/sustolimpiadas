import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { bola, desdeTexto } from './pixel';

// Pinball Embrujado (01-11): una mesa de pinball en una casona embrujada. Flippers con golpe fino (atrapar la pelota
// manteniendo el flipper arriba), bumpers de calabaza, fantasmas que se mueven, cuatro velas que encender (misión:
// multiplicador), órbita con combo, pasadizo secreto con bonus, multibola, salvavidas los primeros 10 s, sacudir la
// mesa con límite (si te pasas, los flippers se apagan) y pelota extra por puntaje. 3 minutos y 3 pelotas.
//
// Física a paso fijo (1/120 s) con 4 sub-pasos: a la velocidad máxima la pelota avanza menos que su radio en cada
// sub-paso, así que no atraviesa paredes ni flippers aunque el equipo vaya lento. Si queda quieta sin que sostengas
// un flipper, se la empuja (no se queda trabada).

const W = 480, H = 720, R = 9, G = 980, VMAX = 1500, DURA = 180, BOLAS = 3, SUB = 4;
type Seg = [number, number, number, number];
const PAREDES: Seg[] = [
  [20, 130, 20, 560], [20, 560, 150, 650], // izquierda y guía al flipper izquierdo
  [440, 190, 440, 560], [440, 560, 330, 650], // muro del carril y guía al flipper derecho
  [470, 120, 470, 700], [440, 700, 470, 700], [440, 560, 440, 700], // carril del lanzador
  [20, 130, 60, 62], [60, 62, 140, 26], [140, 26, 245, 14], [245, 14, 350, 26], [350, 26, 430, 62], [430, 62, 470, 120], // techo curvo
];
const BUMPERS = [[170, 205], [300, 205], [235, 295]].map(([x, y]) => ({ x, y, r: 26, golpe: -9 }));
// Las velas quedan a 40 de la pared: la pelota (18 de ancho) pasa por detrás y no se encaja (antes quedaba atrapada en una rendija de 16)
const VELAS = [300, 345, 390, 435].map((y) => ({ x: 70, y, r: 10, golpe: -9 }));
const AGUJERO = { x: 395, y: 360, r: 16 };
const FLIPPER = { largo: 80, reposo: 0.52, arriba: -0.5, vel: 20 };

interface Bola { x: number; y: number; vx: number; vy: number; enCarril: boolean; quieta: number; atrapada: number }
interface Flipper { px: number; py: number; lado: 1 | -1; ang: number; w: number; arriba: boolean }

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'pinball', { fondo: '#1b1030', pixel: () => 3 });
  const musica = crearMusica(m.mesa, 128);
  musica.acordes([[50, 53, 57], [46, 50, 53], [48, 51, 55], [45, 48, 52]]);
  const bot = piloto();
  const r = generador(`${c.semilla}|pinball`);
  for (const x of [...VELAS, ...BUMPERS]) x.golpe = -9; // son de todo el módulo: cada partida parte limpia

  // ── Estado ──
  const flippers: Flipper[] = [{ px: 150, py: 650, lado: 1, ang: FLIPPER.reposo, w: 0, arriba: false }, { px: 330, py: 650, lado: -1, ang: FLIPPER.reposo, w: 0, arriba: false }];
  let bolas: Bola[] = [], reserva = BOLAS - 1, fase: 'juego' | 'fin' = 'juego', puntos = 0, mult = 1, salvaHasta = 0, salvaLista = true, carga = 0, cargando = false;
  let velasEncendidas = [false, false, false, false], misiones = 0, fantasmasGolpeados = 0, orbitas = 0, ultimaOrbita = -9, comboOrbita = 0, agujeros = 0, extras = 0, proximaExtra = 25000;
  let sacudidas: number[] = [], tiltHasta = 0, multibola = 0, bumpersGolpes = 0, maxMult = 1;
  const fantasmas = [0, 1].map((i) => ({ x: 120 + i * 240, y: 400 + i * 40, r: 16, dir: i ? -1 : 1, vel: 60 + r() * 40, golpe: -9 }));
  const prueba = { fugas: 0, trabadas: 0 };
  const nuevaBola = (): Bola => ({ x: 455, y: 680, vx: 0, vy: 0, enCarril: true, quieta: 0, atrapada: 0 });
  bolas = [nuevaBola()];

  const sumar = (n: number, x: number, y: number, color = '#fff6c9') => {
    const v = n * mult; puntos += v; const [sx, sy] = aPantalla(x, y); m.efectos.flotar(sx, sy, `+${v}`, color, 20);
    if (puntos >= proximaExtra) { proximaExtra = Math.round(proximaExtra * 2.4); extras++; reserva++; m.mesa.hud.aviso('¡Pelota extra!', 'oro', 1.4); m.mesa.sonido.bien(); }
  };
  // Con 1080 la pelota sube ~595: siempre sale del carril (la salida está 480 más arriba)
  const lanzar = (fuerza: number) => {
    for (const b of bolas) if (b.enCarril && b.vy === 0) { b.vy = -(1080 + Math.min(1, fuerza) * 420); if (salvaLista) { salvaLista = false; salvaHasta = m.tiempo + 10; } m.mesa.sonido.tono(200, 0.2, 'sawtooth', 0.07); }
  };
  const sacudir = () => {
    const t = m.tiempo; sacudidas = sacudidas.filter((x) => t - x < 10); sacudidas.push(t);
    if (sacudidas.length > 3) { tiltHasta = t + 3; sacudidas = []; m.mesa.hud.aviso('¡TILT! Flippers apagados 3 s', 'mal', 1.2); m.mesa.sonido.mal(); return; }
    for (const b of bolas) if (!b.enCarril) { b.vx += (r() - 0.5) * 160; b.vy -= 120; }
    m.efectos.temblar(8);
  };
  const iniciarMultibola = () => {
    if (bolas.length >= 3) return;
    multibola++; for (let i = bolas.length; i < 3; i++) bolas.push({ x: 200 + i * 40, y: 120, vx: (i - 1.5) * 200, vy: 100, enCarril: false, quieta: 0, atrapada: 0 });
    salvaHasta = m.tiempo + 6; m.mesa.hud.aviso('¡MULTIBOLA!', 'oro', 1.6); m.efectos.temblar(12);
  };

  // ── Colisiones (empujan la pelota fuera del objeto: nunca queda dentro) ──
  const contraSegmento = (b: Bola, x0: number, y0: number, x1: number, y1: number, rest: number, vxs = 0, vys = 0) => {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((b.x - x0) * dx + (b.y - y0) * dy) / l2));
    const qx = x0 + dx * t, qy = y0 + dy * t, ex = b.x - qx, ey = b.y - qy, d = Math.hypot(ex, ey);
    if (d >= R || d === 0) return false;
    const nx = ex / d, ny = ey / d;
    b.x = qx + nx * R; b.y = qy + ny * R;
    const rvx = b.vx - vxs, rvy = b.vy - vys, vn = rvx * nx + rvy * ny;
    if (vn < 0) { b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny; }
    return true;
  };
  const contraCirculo = (b: Bola, cx: number, cy: number, cr: number) => {
    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
    if (d >= cr + R || d === 0) return false;
    const nx = dx / d, ny = dy / d; b.x = cx + nx * (cr + R); b.y = cy + ny * (cr + R);
    const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
    return true;
  };
  const puntaFlipper = (f: Flipper) => [f.px + Math.cos(f.ang) * FLIPPER.largo * f.lado, f.py + Math.sin(f.ang) * FLIPPER.largo] as const;

  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    const t = m.tiempo;
    if (!c.libre && t >= DURA) { terminar('Se acabó el tiempo'); return; }
    // Mandos: flippers (teclas o tocar cada mitad), lanzador y sacudir
    const enCarril = bolas.some((b) => b.enCarril && b.vy === 0);
    if (bot) pilotar();
    else {
      const toque = m.puntero.abajo && !enCarril;
      flippers[0].arriba = m.teclas.has('ArrowLeft') || m.teclas.has('a') || m.teclas.has('z') || (toque && m.puntero.x < m.ancho / 2);
      flippers[1].arriba = m.teclas.has('ArrowRight') || m.teclas.has('d') || m.teclas.has('m') || (toque && m.puntero.x >= m.ancho / 2);
      const pulsa = m.teclas.has(' ') || m.teclas.has('ArrowDown') || (m.puntero.abajo && enCarril);
      if (enCarril && pulsa) { cargando = true; carga = Math.min(1, carga + dt * 1.2); } else if (cargando) { lanzar(carga); cargando = false; carga = 0; }
    }
    const apagados = t < tiltHasta;
    for (const f of flippers) {
      const meta = f.arriba && !apagados ? FLIPPER.arriba : FLIPPER.reposo, antes = f.ang;
      f.ang += Math.max(-FLIPPER.vel * dt, Math.min(FLIPPER.vel * dt, meta - f.ang)); f.w = (f.ang - antes) / dt;
    }
    for (const g of fantasmas) { g.x += g.dir * g.vel * dt; if (g.x < 100 || g.x > 380) { g.dir *= -1; g.x = Math.max(100, Math.min(380, g.x)); } }
    // Bolas, en sub-pasos
    const h = dt / SUB;
    for (const b of bolas) for (let s = 0; s < SUB; s++) {
      if (b.atrapada > 0) { b.atrapada -= h; if (b.atrapada <= 0) { b.x = AGUJERO.x - AGUJERO.r - R - 2; b.vx = -380; b.vy = 260; } continue; }
      if (b.enCarril && b.vy === 0) { b.x = 455; b.y = 680; continue; }
      b.vy += G * h;
      const v = Math.hypot(b.vx, b.vy); if (v > VMAX) { b.vx *= VMAX / v; b.vy *= VMAX / v; }
      b.x += b.vx * h; b.y += b.vy * h;
      if (b.enCarril && b.y < 200) b.enCarril = false;
      for (const [x0, y0, x1, y1] of PAREDES) contraSegmento(b, x0, y0, x1, y1, 0.45);
      // Compuerta de un solo sentido arriba del carril: la pelota sale, pero no vuelve a entrar
      // (antes volvía al lanzador y cada relanzamiento daba otra órbita gratis)
      if (!b.enCarril && b.x > 440 - R && b.y > 182 - R && b.y < 200 && b.vy > 0) contraSegmento(b, 440, 190, 470, 190, 0.3);
      for (const f of flippers) {
        // Velocidad de la superficie del flipper donde toca (gira alrededor de su eje; el derecho gira al revés)
        const [tx, ty] = puntaFlipper(f), wa = f.w * f.lado, rx = b.x - f.px, ry = b.y - f.py;
        if (contraSegmento(b, f.px, f.py, tx, ty, 0.25, -wa * ry, wa * rx) && Math.abs(f.w) > 2) m.mesa.sonido.tono(240, 0.04, 'square', 0.04);
      }
      for (const bu of BUMPERS) if (contraCirculo(b, bu.x, bu.y, bu.r)) {
        const d = Math.hypot(b.x - bu.x, b.y - bu.y); b.vx += ((b.x - bu.x) / d) * 380; b.vy += ((b.y - bu.y) / d) * 380;
        if (t - bu.golpe < 0.12) continue; // el rebote siempre; los puntos, con una pausa corta
        bu.golpe = t; bumpersGolpes++;
        sumar(100, bu.x, bu.y - 30); m.mesa.sonido.tono(880, 0.05, 'triangle', 0.06); const [sx, sy] = aPantalla(bu.x, bu.y); m.efectos.chispas(sx, sy, ['#ff8a2a', '#ffd23c'], 6, 200);
      }
      for (const g of fantasmas) if (t - g.golpe > 0.4 && contraCirculo(b, g.x, g.y, g.r)) {
        g.golpe = t; fantasmasGolpeados++; sumar(250, g.x, g.y - 24, '#bfe9ff'); m.mesa.sonido.tono(1200, 0.12, 'sine', 0.06);
        if (fantasmasGolpeados % 6 === 0) iniciarMultibola();
      }
      VELAS.forEach((vela, i) => {
        if (contraCirculo(b, vela.x, vela.y, vela.r) && !velasEncendidas[i] && t - vela.golpe > 1) {
          velasEncendidas[i] = true; for (const x of VELAS) x.golpe = t; sumar(200, vela.x + 30, vela.y); m.mesa.sonido.tono(660 + i * 110, 0.08, 'triangle', 0.06);
          if (velasEncendidas.every(Boolean)) { misiones++; mult = Math.min(5, mult + 1); maxMult = Math.max(maxMult, mult); velasEncendidas = [false, false, false, false]; sumar(2000, 240, 400, '#ffd23c'); m.mesa.hud.aviso(`¡Cuatro velas! Multiplicador ×${mult}`, 'oro', 1.6); m.efectos.temblar(10); }
        }
      });
      if (Math.hypot(b.x - AGUJERO.x, b.y - AGUJERO.y) < AGUJERO.r) { b.atrapada = 1; b.x = AGUJERO.x; b.y = AGUJERO.y; b.vx = b.vy = 0; agujeros++; sumar(1500, AGUJERO.x, AGUJERO.y - 30, '#b06bff'); m.mesa.hud.aviso('¡Pasadizo secreto! +bonus', 'oro', 1.2); }
      // Órbita: cruzar arriba por el centro, de lado a lado; seguidas en 4 s hacen combo
      if (b.y < 60 && Math.abs(b.vx) > 200 && Math.abs(b.x - 245) < 12 && t - ultimaOrbita > 0.6) {
        comboOrbita = t - ultimaOrbita < 4 ? Math.min(3, comboOrbita + 1) : 1; ultimaOrbita = t; orbitas++; sumar(300 * comboOrbita, 245, 90, '#7cffcb'); // combo con tope ×3 (sin tope daba millones)
        if (comboOrbita > 1) m.mesa.hud.aviso(`¡Órbita ×${comboOrbita}!`, 'oro', 0.8);
      }
      if (b.x < 0 || b.x > W || b.y < 0) { prueba.fugas++; b.x = Math.max(R, Math.min(W - R, b.x)); b.y = Math.max(R, b.y); }
    }
    // Si una pelota vuelve a caer al carril, queda lista para lanzarse otra vez
    for (const b of bolas) if (b.x > 440 && b.y > 600 && Math.abs(b.vy) < 60 && !(b.enCarril && b.vy === 0)) { b.enCarril = true; b.vx = b.vy = 0; b.x = 455; b.y = 680; }
    // Pelota quieta sin sostener un flipper: se empuja
    const sostiene = flippers.some((f) => f.arriba);
    for (const b of bolas) {
      if ((b.enCarril && b.vy === 0) || b.atrapada > 0) { b.quieta = 0; continue; }
      b.quieta = Math.hypot(b.vx, b.vy) < 25 && !sostiene ? b.quieta + dt : 0;
      if (b.quieta > 4) { prueba.trabadas++; b.quieta = 0; b.vy = -500; b.vx = (r() - 0.5) * 300; }
    }
    // Pelotas que se van por abajo
    const vivas = bolas.filter((b) => b.y < H + 20);
    if (vivas.length < bolas.length) {
      const perdidas = bolas.length - vivas.length; bolas = vivas;
      // El salvavidas se da una vez por pelota nueva: al salvar, el relanzamiento ya no trae otro (antes se renovaba para siempre)
      if (t < salvaHasta) { salvaHasta = 0; for (let i = 0; i < perdidas; i++) bolas.push(nuevaBola()); m.mesa.hud.aviso('¡Salvada! La pelota vuelve', 'bien', 1); }
      else if (!bolas.length) {
        m.efectos.temblar(10); m.mesa.sonido.mal(); mult = Math.max(1, mult - 1);
        if (reserva <= 0 && !c.libre) { terminar('Sin pelotas'); return; }
        if (reserva > 0) reserva--;
        bolas = [nuevaBola()]; salvaLista = true; m.mesa.hud.aviso(`Pelota perdida · quedan ${reserva + 1}`, 'mal', 1.2);
      }
    }
    m.mesa.hud.puntos(String(puntos));
    if (!c.libre) { const q = Math.max(0, DURA - t); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`Pelotas ${'●'.repeat(Math.max(0, reserva + 1))} · ×${mult}${t < salvaHasta ? ' · salvavidas' : ''}${t < tiltHasta ? ' · TILT' : ''}`);
  });
  m.alTecla((k) => { if (k === 't' || k === 'Shift') sacudir(); });

  // ── Bots: el bueno golpea cuando la pelota baja hacia su flipper; el torpe golpea al azar ──
  const rb = generador('bot-pinball');
  function pilotar() {
    if (bolas.some((b) => b.enCarril && b.vy === 0)) lanzar(0.6 + rb() * 0.4);
    flippers[0].arriba = flippers[1].arriba = false;
    // El torpe golpea de vez en cuando, sin mirar la pelota
    if (bot === 'torpe') { flippers[0].arriba = rb() < 0.012; flippers[1].arriba = rb() < 0.012; return; }
    // El bueno: golpea con el flipper de su lado cuando la pelota baja hacia la zona de los flippers
    for (const b of bolas) {
      if (b.enCarril || b.y < 545 || b.y > 668) continue;
      // Si la tiene atrapada (casi quieta sobre el flipper), suelta y golpea: si no, la sostendría para siempre
      const atrapada = Math.hypot(b.vx, b.vy) < 120;
      if (b.vy > -60) flippers[b.x < W / 2 ? 0 : 1].arriba = atrapada ? Math.floor(m.tiempo * 3) % 2 === 0 : true;
    }
  }

  // ── Dibujo ──
  const esc = () => Math.min(1, (m.ancho - 16) / W), origen = () => { const s = esc(); return [(m.ancho - W * s) / 2, (H - H * s) / 2] as const; };
  const aPantalla = (x: number, y: number) => { const s = esc(), [ox, oy] = origen(); return [ox + x * s, oy + y * s] as const; };
  const BOLA = bola(5, 5, { borde: '#3a3a48', sombra: '#9aa0b8', base: '#dfe6f3', luz: '#ffffff', brillo: '#ffffff' });
  const CALABAZA = bola(9, 8, { borde: '#6a2a08', sombra: '#c95a10', base: '#ff8a2a', luz: '#ffb36a' }, (g, w, hh) => { g.fillStyle = '#2a1408'; g.fillRect(Math.round(w / 2) - 4, Math.round(hh / 2) - 2, 2, 2); g.fillRect(Math.round(w / 2) + 2, Math.round(hh / 2) - 2, 2, 2); g.fillRect(Math.round(w / 2) - 3, Math.round(hh / 2) + 2, 6, 1); g.fillStyle = '#3fa34d'; g.fillRect(Math.round(w / 2), 0, 2, 2); });
  const FANTASMA = desdeTexto(['...WWWW...', '.WWWWWWWW.', 'WWWWWWWWWW', 'WWOWWWWOWW', 'WWOWWWWOWW', 'WWWWWWWWWW', 'WWWWWWWWWW', 'WWWWWWWWWW', 'W.WW.WW.WW'], { W: '#e8f0ff', O: '#1b1030' });
  const VELA = [false, true].map((on) => desdeTexto(on ? ['..Y..', '.YRY.', '..R..', 'CCCCC', 'CCCCC', 'CCCCC', 'CCCCC'] : ['.....', '.....', '..K..', 'CCCCC', 'CCCCC', 'CCCCC', 'CCCCC'], { Y: '#ffd23c', R: '#ff8a2a', K: '#3a3a48', C: '#f4f1ea' }));
  /** Escala para que el dibujo mida lo mismo que el objeto con que choca la pelota (diámetro en unidades del juego). */
  const escalaPara = (img: { width: number }, diametro: number) => Math.max(0.2, (diametro * esc()) / (img.width * m.k));
  m.alPixel((gp) => {
    const s = esc(), [ox, oy] = origen(), t = m.tiempo, k = m.k, px = (v: number) => Math.round(v / k) * k;
    gp.fillStyle = '#120a22'; gp.fillRect(0, 0, m.ancho, H);
    gp.fillStyle = '#24163e'; gp.fillRect(px(ox), px(oy), px(W * s), px(H * s));
    for (let y = 0; y < H; y += 40) for (let x = 0; x < W; x += 40) if ((x + y) % 80 === 0) { const [sx, sy] = aPantalla(x, y); gp.fillStyle = '#2a1a48'; gp.fillRect(px(sx), px(sy), px(40 * s), px(40 * s)); }
    { const [sx, sy] = aPantalla(AGUJERO.x, AGUJERO.y); gp.fillStyle = '#0a0612'; gp.beginPath(); gp.arc(sx, sy, AGUJERO.r * s, 0, Math.PI * 2); gp.fill(); gp.strokeStyle = '#b06bff'; gp.lineWidth = k; gp.stroke(); }
    VELAS.forEach((vela, i) => { const [sx, sy] = aPantalla(vela.x, vela.y); m.sprite(VELA[velasEncendidas[i] ? 1 : 0], sx, sy, escalaPara(VELA[0], vela.r * 2)); });
    for (const bu of BUMPERS) { const [sx, sy] = aPantalla(bu.x, bu.y); m.sprite(CALABAZA, sx, sy, escalaPara(CALABAZA, bu.r * 2)); }
    for (const g of fantasmas) { const [sx, sy] = aPantalla(g.x, g.y + Math.sin(t * 3 + g.x * 0.01) * 4); gp.globalAlpha = t - g.golpe < 0.3 ? 0.4 : 0.9; m.sprite(FANTASMA, sx, sy, escalaPara(FANTASMA, g.r * 2.2)); gp.globalAlpha = 1; }
    const linea = (x0: number, y0: number, x1: number, y1: number, color: string, grosor: number) => { const [a, b] = aPantalla(x0, y0), [c2, d] = aPantalla(x1, y1), n = Math.max(1, Math.ceil(Math.hypot(c2 - a, d - b) / k)); gp.fillStyle = color; for (let i = 0; i <= n; i++) { const x = a + ((c2 - a) * i) / n, y = b + ((d - b) * i) / n; gp.fillRect(px(x) - (grosor * k) / 2, px(y) - (grosor * k) / 2, grosor * k, grosor * k); } };
    for (const [x0, y0, x1, y1] of PAREDES) linea(x0, y0, x1, y1, '#7a5aa0', 2);
    for (const f of flippers) { const [tx, ty] = puntaFlipper(f); linea(f.px, f.py, tx, ty, t < tiltHasta ? '#5a5a66' : '#ffd23c', 4); }
    if (t < salvaHasta) { const [a, b] = aPantalla(240, 700); gp.fillStyle = Math.floor(t * 4) % 2 ? '#7cffcb' : '#3fa37a'; gp.fillRect(px(a) - 3 * k, px(b), 6 * k, 2 * k); }
    if (cargando) { const [a, b] = aPantalla(455, 700); gp.fillStyle = '#ff3b5c'; gp.fillRect(px(a) - k, px(b - carga * 80 * s), 2 * k, px(carga * 80 * s)); }
    for (const b of bolas) { const [sx, sy] = aPantalla(b.x, b.y); m.sprite(BOLA, sx, sy, escalaPara(BOLA, R * 2)); }
  });
  m.alDibujar(() => {
    if (fase !== 'juego' || bot) return;
    if (bolas.some((b) => b.enCarril && b.vy === 0)) m.rotulo('Mantén Espacio (o toca) para cargar y suelta para lanzar', m.ancho / 2, aPantalla(0, 470)[1], Math.round(Math.min(20, m.ancho / 26)), '#fff6c9');
    if (m.tiempo < 8) m.rotulo('Flippers: ← → (o A/D, o toca a cada lado) · T sacude', m.ancho / 2, aPantalla(0, 510)[1], Math.round(Math.min(18, m.ancho / 28)), '#c9bfff');
  });

  let terminado = false;
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin';
    musica.parar(); m.detener();
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Resultado', porque], ['Misiones de velas', String(misiones)], ['Multiplicador máximo', `×${maxMult}`], ['Fantasmas golpeados', String(fantasmasGolpeados)], ['Órbitas', String(orbitas)], ['Pasadizos secretos', String(agujeros)], ['Multibolas', String(multibola)], ['Pelotas extra', String(extras)]],
      detalle: { misiones, fantasmas: fantasmasGolpeados, orbitas, agujeros, multibola, extras, bumpers: bumpersGolpes },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pinball = () => ({ fase, puntos, mult, reserva, bolas: bolas.length, misiones, fantasmas: fantasmasGolpeados, orbitas, agujeros, bumpers: bumpersGolpes, extras, multibola, pos: bolas.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy)]), terminado, seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); musica.intensidad = 1; },
    destruir() { musica.parar(); m.destruir(); },
  };
}
