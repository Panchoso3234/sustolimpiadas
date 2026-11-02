import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { bola, crearSprite, desdeTexto, type Sprite } from './pixel';

// Rompe Lápidas (01-11): rompe ladrillos en un cementerio de noche. Mueve la paleta con el mouse, el dedo o las flechas;
// la pelota rompe lápidas de 1, 2 o 3 golpes (las de piedra no se rompen). Poderes que caen: paleta larga, multibola,
// pelota de fuego, imán, láser y barrera. Combo por lápidas seguidas sin tocar la paleta. Cada 5 niveles, un guardián.
// 2 min 30 s en el torneo y 3 vidas; en modo libre, sin reloj. Todo sale de la semilla: en un duelo, los mismos niveles.
//
// Física a paso fijo (1/120 s): la pelota avanza a lo más 6 unidades por paso (720/120) y la lápida más delgada mide 22, así que
// nunca atraviesa nada aunque el equipo vaya a 20 cuadros por segundo. La pelota siempre lleva velocidad vertical mínima
// (no queda rebotando de lado a lado) y, si pasa 10 s sin tocar nada útil, se corrige sola.

const W = 600, H = 720, COLS = 10, CW = W / COLS, FH = 26, TOPE_Y = 92, PALETA_Y = 664, PALETA_H = 14, R = 7;
const V0 = 460, VMAX = 720, DURA = 150, VIDAS = 3;
type Poder = 'larga' | 'multi' | 'fuego' | 'iman' | 'laser' | 'barrera' | 'vida';
const PODERES: Record<Poder, { color: string; nombre: string }> = {
  larga: { color: '#7cffcb', nombre: 'Paleta larga' }, multi: { color: '#ffd23c', nombre: 'Multibola' },
  fuego: { color: '#ff6a2a', nombre: 'Pelota de fuego' }, iman: { color: '#b06bff', nombre: 'Imán' },
  laser: { color: '#ff3b5c', nombre: 'Láser' }, barrera: { color: '#7fb4ff', nombre: 'Barrera' }, vida: { color: '#ff8fc8', nombre: '+1 vida' },
};
interface Lapida { c: number; f: number; vida: number; max: number; piedra: boolean }
interface Pelota { x: number; y: number; vx: number; vy: number; pegada: number | null; util: number }
interface Caida { x: number; y: number; tipo: Poder }
interface Tiro { x: number; y: number; enemigo: boolean }
interface Jefe { x: number; vida: number; max: number; dir: number; proximo: number }

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'lapidas', { fondo: '#0e0b16', pixel: () => 3 });
  const musica = crearMusica(m.mesa, 124);
  musica.acordes([[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 44, 47]]);
  const bot = piloto();
  const r = generador(`${c.semilla}|lapidas`), rPoder = generador(`${c.semilla}|lapidas-poder`);

  // ── Estado ──
  let lapidas: Lapida[] = [], nivel = 0, jefe: Jefe | null = null, inicioNivel = 0;
  let pelotas: Pelota[] = [], caidas: Caida[] = [], tiros: Tiro[] = [];
  const paleta = { x: W / 2, ancho: 96 };
  let fase: 'juego' | 'fin' = 'juego', vidas = VIDAS, puntos = 0, combo = 0, mejorCombo = 0, rotas = 0, poderesTomados = 0, jefes = 0, niveles = 0;
  let largaHasta = 0, fuegoHasta = 0, imanHasta = 0, laserHasta = 0, proximoLaser = 0, barrera = 0, aturdidaHasta = 0, velocidad = V0;
  const prueba = { fugas: 0, dentro: 0, rescates: 0, horizontales: 0 };
  const nuevaPelota = (): Pelota => ({ x: paleta.x, y: PALETA_Y - R - 1, vx: 0, vy: 0, pegada: 0, util: 0 });

  // ── Niveles: figuras simétricas sacadas de la semilla; siempre hay algo que romper ──
  const armarNivel = () => {
    nivel++; lapidas = []; jefe = null; inicioNivel = m.tiempo;
    if (nivel % 5 === 0) jefe = { x: W / 2, vida: 18 + nivel * 2, max: 18 + nivel * 2, dir: 1, proximo: m.tiempo + 2 };
    const filas = Math.min(8, 2 + nivel), forma = Math.floor(r() * 4), corrimiento = jefe ? 3 : 0;
    for (let f = 0; f < filas; f++) for (let col = 0; col < COLS / 2; col++) {
      const lleno = forma === 0 ? true : forma === 1 ? (f + col) % 2 === 0 || f === 0 : forma === 2 ? col >= f - 2 : r() < 0.75;
      if (!lleno) continue;
      const dura = Math.min(3, 1 + (r() < 0.12 * nivel ? 1 : 0) + (r() < 0.05 * nivel ? 1 : 0));
      const piedra = nivel > 2 && f === filas - 1 && col % 3 === 1 && r() < 0.5;
      for (const cc of [col, COLS - 1 - col]) lapidas.push({ c: cc, f: f + corrimiento, vida: dura, max: dura, piedra });
    }
    if (!lapidas.some((l) => !l.piedra) && !jefe) lapidas.push({ c: 4, f: 0, vida: 1, max: 1, piedra: false });
    pelotas = [nuevaPelota()]; caidas = []; tiros = [];
  };
  const quedan = () => lapidas.some((l) => !l.piedra) || !!jefe;
  const rect = (l: Lapida) => ({ x0: l.c * CW + 2, x1: (l.c + 1) * CW - 2, y0: TOPE_Y + l.f * FH + 2, y1: TOPE_Y + (l.f + 1) * FH - 2 });
  armarNivel();

  // ── Campo en pantalla: se centra y se achica si la pantalla es angosta ──
  const esc = () => Math.min(1, (m.ancho - 24) / W), origen = () => { const s = esc(); return [(m.ancho - W * s) / 2, (H - H * s) / 2] as const; };
  const aPantalla = (x: number, y: number) => { const s = esc(), [ox, oy] = origen(); return [ox + x * s, oy + y * s] as const; };
  const aCampo = (x: number, y: number) => { const s = esc(), [ox, oy] = origen(); return [(x - ox) / s, (y - oy) / s] as const; };

  const anchoPaleta = () => (m.tiempo < largaHasta ? 150 : 96) * (m.tiempo < aturdidaHasta ? 0.6 : 1);
  const lanzar = () => {
    for (const p of pelotas) if (p.pegada !== null) {
      const a = -Math.PI / 2 + Math.max(-0.9, Math.min(0.9, p.pegada / 60)) * 0.9;
      p.vx = Math.cos(a) * velocidad; p.vy = Math.sin(a) * velocidad; p.pegada = null; p.util = 0;
      m.mesa.sonido.tono(660, 0.06, 'square', 0.05);
    }
  };
  /** Velocidad vertical mínima: nunca queda rebotando de lado a lado. */
  const corregir = (p: Pelota) => {
    const v = Math.hypot(p.vx, p.vy) || velocidad, minV = v * 0.38;
    if (Math.abs(p.vy) < minV) { prueba.horizontales++; p.vy = (p.vy < 0 ? -1 : 1) * minV; p.vx = (Math.sign(p.vx) || 1) * Math.sqrt(Math.max(0, v * v - minV * minV)); }
  };
  const sumar = (n: number, x: number, y: number, color = '#fff6c9') => { puntos += n; const [sx, sy] = aPantalla(x, y); m.efectos.flotar(sx, sy, `+${n}`, color, 22); };
  const derrotarJefe = () => { if (!jefe) return; jefes++; sumar(500, jefe.x, TOPE_Y + 32, '#ffd23c'); m.mesa.hud.aviso('¡Derrotaste al guardián!', 'oro', 1.6); m.efectos.temblar(20); jefe = null; };
  const romper = (l: Lapida, fuerza: number) => {
    if (l.piedra) { m.mesa.sonido.tono(180, 0.05, 'square', 0.04); return; }
    l.vida -= fuerza; combo++; mejorCombo = Math.max(mejorCombo, combo);
    if (l.vida > 0) { m.mesa.sonido.tono(420 + l.vida * 80, 0.05, 'square', 0.05); return; }
    const mult = Math.min(5, 1 + Math.floor(combo / 4)), { x0, x1, y0, y1 } = rect(l), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    rotas++; lapidas.splice(lapidas.indexOf(l), 1);
    sumar(10 * l.max * mult, cx, cy, mult > 1 ? '#ffd23c' : '#fff6c9');
    const [sx, sy] = aPantalla(cx, cy); m.efectos.chispas(sx, sy, ['#b9b9c6', '#7a7a86', '#7cffcb'], 8, 220);
    m.mesa.sonido.tono(520 + Math.min(8, combo) * 60, 0.06, 'triangle', 0.06);
    if (combo % 8 === 0) { m.mesa.hud.aviso(`¡Combo ×${mult}!`, 'oro', 0.9); m.efectos.temblar(4); }
    if (rPoder() < 0.18) { const tipos = (Object.keys(PODERES) as Poder[]).filter((x) => x !== 'vida'); caidas.push({ x: cx, y: cy, tipo: rPoder() < 0.05 ? 'vida' : tipos[Math.floor(rPoder() * tipos.length)] }); }
    velocidad = Math.min(VMAX, velocidad + 4);
  };
  const tomarPoder = (t: Poder) => {
    poderesTomados++; puntos += 20;
    const ahora = m.tiempo;
    if (t === 'larga') largaHasta = ahora + 12;
    else if (t === 'multi') {
      const base = pelotas.find((p) => p.pegada === null) ?? pelotas[0], v = Math.hypot(base.vx, base.vy) || velocidad;
      for (const a of [-0.5, 0.5]) { if (pelotas.length >= 6) break; const ang = Math.atan2(base.vy || -v, base.vx) + a, nueva: Pelota = { x: base.x, y: Math.min(base.y, PALETA_Y - R - 2), vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, pegada: null, util: 0 }; corregir(nueva); pelotas.push(nueva); }
    }
    else if (t === 'fuego') fuegoHasta = ahora + 8;
    else if (t === 'iman') imanHasta = ahora + 12;
    else if (t === 'laser') laserHasta = ahora + 8;
    else if (t === 'barrera') barrera = 1;
    else vidas = Math.min(5, vidas + 1);
    m.mesa.hud.aviso(PODERES[t].nombre, 'oro', 1); m.mesa.sonido.tono(880, 0.1, 'triangle', 0.07); m.mesa.sonido.tono(1320, 0.12, 'triangle', 0.06, 0.06);
  };
  const perderVida = () => {
    vidas--; combo = 0; largaHasta = fuegoHasta = imanHasta = laserHasta = 0;
    m.efectos.temblar(14); m.mesa.sonido.mal();
    if (vidas <= 0 && !c.libre) { terminar('Sin vidas'); return; }
    if (vidas <= 0) vidas = VIDAS;
    m.mesa.hud.aviso(`¡Pelota perdida! Quedan ${vidas} ♥`, 'mal', 1.2);
    pelotas = [nuevaPelota()]; caidas = [];
  };

  // Rebote contra un rectángulo: por el lado de menor penetración (la pelota nunca queda dentro)
  const rebotar = (p: Pelota, x0: number, x1: number, y0: number, y1: number, atraviesa: boolean) => {
    const qx = Math.max(x0, Math.min(p.x, x1)), qy = Math.max(y0, Math.min(p.y, y1)), dx = p.x - qx, dy = p.y - qy;
    if (dx * dx + dy * dy > R * R) return false;
    if (atraviesa) return true;
    const pi = p.x - (x0 - R), pd = x1 + R - p.x, ps = p.y - (y0 - R), pa = y1 + R - p.y, menor = Math.min(pi, pd, ps, pa);
    if (menor === pi) { p.x = x0 - R; p.vx = -Math.abs(p.vx); } else if (menor === pd) { p.x = x1 + R; p.vx = Math.abs(p.vx); }
    else if (menor === ps) { p.y = y0 - R; p.vy = -Math.abs(p.vy); } else { p.y = y1 + R; p.vy = Math.abs(p.vy); }
    return true;
  };

  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    const t = m.tiempo;
    if (!c.libre && t >= DURA) { terminar('Se acabó el tiempo'); return; }
    // Paleta: sigue al puntero (mouse o dedo) o a las flechas
    paleta.ancho = anchoPaleta();
    let meta = paleta.x;
    if (bot) meta = pilotar();
    else if (m.teclas.has('ArrowLeft') || m.teclas.has('a')) meta = paleta.x - 760 * dt;
    else if (m.teclas.has('ArrowRight') || m.teclas.has('d')) meta = paleta.x + 760 * dt;
    else if (m.puntero.dentro || m.puntero.abajo) meta = aCampo(m.puntero.x, m.puntero.y)[0];
    paleta.x = Math.max(paleta.ancho / 2, Math.min(W - paleta.ancho / 2, paleta.x + Math.max(-1400 * dt, Math.min(1400 * dt, meta - paleta.x))));
    if (t < laserHasta && t >= proximoLaser) { proximoLaser = t + 0.5; tiros.push({ x: paleta.x - paleta.ancho / 2 + 6, y: PALETA_Y - 4, enemigo: false }, { x: paleta.x + paleta.ancho / 2 - 6, y: PALETA_Y - 4, enemigo: false }); m.mesa.sonido.tono(1500, 0.03, 'square', 0.03); }
    // Pelotas
    for (const p of pelotas) {
      if (p.pegada !== null) { p.x = paleta.x + p.pegada; p.y = PALETA_Y - R - 1; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.util += dt;
      if (p.x < R) { p.x = R; p.vx = Math.abs(p.vx); } else if (p.x > W - R) { p.x = W - R; p.vx = -Math.abs(p.vx); }
      if (p.y < TOPE_Y - 30 + R) { p.y = TOPE_Y - 30 + R; p.vy = Math.abs(p.vy); }
      // Lápidas (la de fuego atraviesa las que rompe; en las de piedra rebota igual)
      for (const l of [...lapidas]) {
        const q = rect(l), fuego = t < fuegoHasta && !l.piedra;
        if (rebotar(p, q.x0, q.x1, q.y0, q.y1, fuego)) { romper(l, fuego ? 3 : 1); if (!l.piedra) p.util = 0; if (!fuego) break; }
      }
      if (jefe && rebotar(p, jefe.x - 90, jefe.x + 90, TOPE_Y, TOPE_Y + 64, false)) {
        jefe.vida -= t < fuegoHasta ? 2 : 1; p.util = 0; m.efectos.temblar(5); m.mesa.sonido.tono(160, 0.08, 'sawtooth', 0.07);
        if (jefe.vida <= 0) derrotarJefe();
      }
      // Paleta: el ángulo depende de dónde pega (centro: arriba; puntas: hasta 62°)
      if (p.vy > 0 && p.y + R >= PALETA_Y && p.y - R <= PALETA_Y + PALETA_H && Math.abs(p.x - paleta.x) <= paleta.ancho / 2 + R) {
        const k = Math.max(-1, Math.min(1, (p.x - paleta.x) / (paleta.ancho / 2))), v = Math.min(VMAX, Math.max(velocidad, Math.hypot(p.vx, p.vy))), a = -Math.PI / 2 + k * 1.08;
        p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.y = PALETA_Y - R - 0.5; p.util = 0; combo = 0;
        if (t < imanHasta) { p.pegada = p.x - paleta.x; p.vx = p.vy = 0; }
        m.mesa.sonido.tono(330, 0.05, 'square', 0.05);
      }
      if (barrera && p.vy > 0 && p.y + R >= PALETA_Y + 30) { barrera = 0; p.y = PALETA_Y + 30 - R; p.vy = -Math.abs(p.vy); m.efectos.temblar(4); }
      // Rescate: 10 s sin tocar nada útil (atrapada entre piedras) → se tuerce hacia abajo
      if (p.pegada === null && p.util > 10) { prueba.rescates++; p.util = 0; const v = Math.hypot(p.vx, p.vy); p.vx = v * 0.5 * (p.x < W / 2 ? 1 : -1); p.vy = v * 0.87; }
      if (p.pegada === null) corregir(p);
      // Invariantes de prueba: deben quedar en 0
      if (p.x < 0 || p.x > W || p.y < TOPE_Y - 30) prueba.fugas++;
      for (const l of lapidas) { const q = rect(l); if (p.x > q.x0 + 1 && p.x < q.x1 - 1 && p.y > q.y0 + 1 && p.y < q.y1 - 1 && !(t < fuegoHasta && !l.piedra)) prueba.dentro++; }
    }
    pelotas = pelotas.filter((p) => p.y - R <= H);
    if (!pelotas.length) { perderVida(); if (fase !== 'juego') return; }
    // Poderes que caen
    for (const k2 of caidas) k2.y += 170 * dt;
    caidas = caidas.filter((k2) => {
      if (k2.y > PALETA_Y - 8 && k2.y < PALETA_Y + PALETA_H + 8 && Math.abs(k2.x - paleta.x) < paleta.ancho / 2 + 10) { tomarPoder(k2.tipo); return false; }
      return k2.y < H + 20;
    });
    // Tiros: los del láser suben; los del guardián bajan (si tocan la paleta, la achican 4 s)
    for (const x of tiros) x.y += (x.enemigo ? 300 : -720) * dt;
    tiros = tiros.filter((x) => {
      if (x.enemigo) {
        if (x.y > PALETA_Y - 6 && x.y < PALETA_Y + PALETA_H && Math.abs(x.x - paleta.x) < paleta.ancho / 2) { aturdidaHasta = t + 4; m.mesa.hud.aviso('¡Te alcanzó el guardián!', 'mal', 0.9); m.efectos.temblar(8); return false; }
        return x.y < H;
      }
      for (const l of lapidas) { const q = rect(l); if (x.x > q.x0 && x.x < q.x1 && x.y > q.y0 && x.y < q.y1) { romper(l, 1); return false; } }
      if (jefe && Math.abs(x.x - jefe.x) < 90 && x.y < TOPE_Y + 64) { jefe.vida--; if (jefe.vida <= 0) derrotarJefe(); return false; }
      return x.y > TOPE_Y - 40;
    });
    if (jefe) {
      jefe.x += jefe.dir * (70 + nivel * 4) * dt; if (jefe.x < 100 || jefe.x > W - 100) { jefe.dir *= -1; jefe.x = Math.max(100, Math.min(W - 100, jefe.x)); }
      if (t >= jefe.proximo) { jefe.proximo = t + Math.max(1.1, 2.4 - nivel * 0.08); tiros.push({ x: jefe.x, y: TOPE_Y + 70, enemigo: true }); }
    }
    // Nivel limpio: bonus por rapidez y siguiente
    if (!quedan()) {
      niveles++;
      const rapidez = Math.max(0, Math.round((60 - (t - inicioNivel)) * 8));
      puntos += 200 + rapidez;
      m.mesa.hud.aviso(`¡Nivel ${nivel} limpio! +${200 + rapidez}`, 'oro', 1.4); m.mesa.sonido.bien();
      armarNivel();
    }
    m.mesa.hud.puntos(String(puntos));
    if (!c.libre) { const q = Math.max(0, DURA - t); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`${'♥'.repeat(Math.max(0, vidas))} · Nivel ${nivel}${combo >= 4 ? ` · combo ×${Math.min(5, 1 + Math.floor(combo / 4))}` : ''}`);
  });
  m.alTocar(() => lanzar());
  m.alTecla((k) => { if (k === ' ' || k === 'ArrowUp' || k === 'w') lanzar(); });

  // ── Bots de prueba: el bueno ataja donde va a caer la pelota (y los poderes si puede); el torpe llega tarde ──
  const rb = generador('bot-lapidas');
  let botError = 0, botCambio = 0;
  function pilotar(): number {
    if (pelotas.some((p) => p.pegada !== null) && m.tiempo > 0.4) lanzar();
    const bajando = pelotas.filter((p) => p.pegada === null && p.vy > 0).sort((a, b) => b.y - a.y)[0];
    let meta = W / 2;
    if (bajando) {
      // Dónde cruza la altura de la paleta, con los rebotes en las paredes
      const ancho = W - 2 * R;
      let x = bajando.x + bajando.vx * ((PALETA_Y - R - bajando.y) / bajando.vy) - R;
      x = ((x % (2 * ancho)) + 2 * ancho) % (2 * ancho); if (x > ancho) x = 2 * ancho - x; meta = x + R;
      const caida = caidas.find((k2) => k2.y > 420 && Math.abs(k2.x - meta) < 120);
      if (caida && bajando.y < 350) meta = caida.x;
    } else { const caida = caidas.find((k2) => k2.y > 350); if (caida) meta = caida.x; }
    if (bot === 'torpe') { if (m.tiempo > botCambio) { botCambio = m.tiempo + 0.4; botError = (rb() - 0.5) * 260; } return meta + botError; }
    return meta + Math.sin(m.tiempo * 3) * paleta.ancho * 0.25; // le pega con distintas partes para variar el ángulo
  }

  // ── Pixel art (8 bits) ──
  const LAPIDA = [1, 2, 3].map((n) => desdeTexto(['...OOOOOOOOO...', '..OGGGGGGGGGO..', '.OGLLLLLLLLLGO.', 'OGLLL.KKK.LLLGO', 'OGLLLL.K.LLLLGO', 'OGLLLLLLLLLLLGO', 'OOOOOOOOOOOOOOO'], { O: '#14101e', G: ['#5a6a8a', '#6a5a9a', '#8a4a6a'][n - 1], L: ['#9aa8c6', '#a99ad6', '#d68aa6'][n - 1], K: '#2a2440' }));
  const RAJADA = desdeTexto(['...............', '.......O.......', '......O........', '.......OO......', '........O......', '...............', '...............'], { O: '#14101e' });
  const PIEDRA = desdeTexto(['OOOOOOOOOOOOOOO', 'OSSSSSSSSSSSSSO', 'OSDSSSSDSSSSDSO', 'OSSSSDSSSSDSSSO', 'OSDSSSSSDSSSSSO', 'OSSSSSSSSSSSSSO', 'OOOOOOOOOOOOOOO'], { O: '#14101e', S: '#4e4e5c', D: '#2e2e38' });
  const PELOTA = bola(2.5, 2.5, { borde: '#2a1a40', sombra: '#b9b9c6', base: '#f4f1ea', luz: '#ffffff' });
  const FUEGO = bola(2.5, 2.5, { borde: '#7a1a08', sombra: '#ff6a2a', base: '#ffb02e', luz: '#fff2a0' });
  const LUNA = bola(14, 14, { borde: '#c9c2a0', sombra: '#e8e0b8', base: '#f8f1d0', luz: '#fffbe8' });
  const PODER = Object.fromEntries((Object.keys(PODERES) as Poder[]).map((t) => [t, crearSprite(9, 6, (g) => { g.fillStyle = '#14101e'; g.fillRect(0, 0, 9, 6); g.fillStyle = PODERES[t].color; g.fillRect(1, 1, 7, 4); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(1, 1, 7, 1); })])) as Record<Poder, Sprite>;
  const JEFE = desdeTexto(['......OOOOOOOOOOOOOOOOOOOOOOOOOOOOOO......', '....OOGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGOO....', '...OGGLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLGGO...', '..OGLLLLLLLLLLLRRLLLLLLLLRRLLLLLLLLLLLGO..', '.OGLLLLLLLLLLLLRRLLLLLLLLRRLLLLLLLLLLLLGO.', 'OGLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLGO', 'OGLLLLLLLLLLLLLLLLLLKKLLLLLLLLLLLLLLLLLLGO', 'OGLLLLLLLLLLLLLLLKKKKKKKKLLLLLLLLLLLLLLLGO', 'OGLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLGO', 'OGLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLGO', 'OGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGO', 'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO'], { O: '#14101e', G: '#4a3a6a', L: '#7a6aa0', R: '#ff3b5c', K: '#2a2440' });
  const CESPED = crearSprite(16, 8, (g) => { g.fillStyle = '#1e3a2a'; g.fillRect(0, 0, 16, 8); g.fillStyle = '#2f5a3a'; for (let x = 0; x < 16; x += 3) g.fillRect(x, 0, 1, 2 + (x % 2)); });
  const estrellas = Array.from({ length: 40 }, (_, i) => ({ x: (i * 173) % 1600, y: (i * 61) % 260 }));

  m.alPixel((gp) => {
    const s = esc(), [ox, oy] = origen(), t = m.tiempo, k = m.k, px = (v: number) => Math.round(v / k) * k;
    gp.fillStyle = '#141029'; gp.fillRect(0, 0, m.ancho, H);
    for (const e of estrellas) if (Math.sin(t * 2 + e.x) > -0.4) { gp.fillStyle = '#c9c2ff'; gp.fillRect(px(e.x % m.ancho), px(e.y), k, k); }
    // La luna, solo si cabe al lado de la cancha (en celular taparía el marcador)
    if (m.ancho - (ox + W * s) > 110) m.sprite(LUNA, ox + W * s + (m.ancho - ox - W * s) / 2, 190, 1);
    const yc = oy + (TOPE_Y - 30) * s, hc = (H - TOPE_Y + 30) * s;
    gp.fillStyle = '#1b1630'; gp.fillRect(px(ox), px(yc), px(W * s), px(hc));
    gp.fillStyle = '#3a2a5a'; gp.fillRect(px(ox) - k, px(yc), k, px(hc)); gp.fillRect(px(ox + W * s), px(yc), k, px(hc)); gp.fillRect(px(ox) - k, px(yc) - k, px(W * s) + 2 * k, k);
    for (let x = 0; x < W * s; x += 16 * k) gp.drawImage(CESPED, px(ox + x), px(oy + (H - 24) * s), Math.min(16 * k, W * s - x), 8 * k);
    for (const l of lapidas) {
      const q = rect(l), [x0, y0] = aPantalla(q.x0, q.y0), w = px((q.x1 - q.x0) * s), h = px((q.y1 - q.y0) * s);
      gp.drawImage(l.piedra ? PIEDRA : LAPIDA[l.max - 1], px(x0), px(y0), w, h);
      if (!l.piedra && l.vida < l.max) gp.drawImage(RAJADA, px(x0), px(y0), w, h);
    }
    if (jefe) {
      const [x0, y0] = aPantalla(jefe.x - 90, TOPE_Y); gp.drawImage(JEFE, px(x0), px(y0), px(180 * s), px(64 * s));
      const [bx, by] = aPantalla(jefe.x - 90, TOPE_Y - 14); gp.fillStyle = '#14101e'; gp.fillRect(px(bx), px(by), px(180 * s), 2 * k); gp.fillStyle = '#ff3b5c'; gp.fillRect(px(bx), px(by), px(180 * s * (jefe.vida / jefe.max)), 2 * k);
    }
    for (const x of tiros) { const [sx, sy] = aPantalla(x.x, x.y); gp.fillStyle = x.enemigo ? '#ff3b5c' : '#7cffcb'; gp.fillRect(px(sx) - k, px(sy) - 2 * k, 2 * k, 4 * k); }
    for (const k2 of caidas) { const [sx, sy] = aPantalla(k2.x, k2.y); m.sprite(PODER[k2.tipo], sx, sy, s < 0.8 ? 1.5 : 2); }
    if (barrera) { const [x0, y0] = aPantalla(0, PALETA_Y + 30); gp.fillStyle = 'rgba(127,180,255,.7)'; gp.fillRect(px(x0), px(y0), px(W * s), k); }
    const [pxx, pyy] = aPantalla(paleta.x - paleta.ancho / 2, PALETA_Y);
    gp.fillStyle = '#14101e'; gp.fillRect(px(pxx) - k, px(pyy) - k, px(paleta.ancho * s) + 2 * k, px(PALETA_H * s) + 2 * k);
    gp.fillStyle = t < aturdidaHasta ? '#7a7a86' : t < imanHasta ? '#b06bff' : t < laserHasta ? '#ff3b5c' : '#e3b07a'; gp.fillRect(px(pxx), px(pyy), px(paleta.ancho * s), px(PALETA_H * s));
    gp.fillStyle = 'rgba(255,255,255,.45)'; gp.fillRect(px(pxx), px(pyy), px(paleta.ancho * s), k);
    for (const p of pelotas) { const [sx, sy] = aPantalla(p.x, p.y); m.sprite(t < fuegoHasta ? FUEGO : PELOTA, sx, sy, s < 0.8 ? 1.5 : 2); }
  });
  m.alDibujar(() => {
    if (fase !== 'juego') return;
    if (pelotas.some((p) => p.pegada !== null) && !bot && m.tiempo - inicioNivel < 30) m.rotulo('Toca, haz clic o pulsa Espacio para lanzar', m.ancho / 2, aPantalla(0, 520)[1], Math.round(Math.min(26, m.ancho / 22)), '#fff6c9');
    const activos = ([[largaHasta, 'Paleta larga'], [fuegoHasta, 'Fuego'], [imanHasta, 'Imán'], [laserHasta, 'Láser']] as [number, string][]).filter(([h]) => h > m.tiempo).map(([h, n]) => `${n} ${Math.ceil(h - m.tiempo)} s`);
    if (barrera) activos.push('Barrera');
    if (activos.length) m.rotulo(activos.join(' · '), m.ancho / 2, aPantalla(0, TOPE_Y - 46)[1], 16, '#7cffcb'); // arriba de la cancha: abajo están los botones de la sala
  });

  let terminado = false;
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin';
    musica.parar(); m.detener();
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Resultado', porque], ['Niveles limpios', String(niveles)], ['Lápidas rotas', String(rotas)], ['Mejor combo', String(mejorCombo)], ['Guardianes derrotados', String(jefes)], ['Poderes tomados', String(poderesTomados)], ['Vidas que quedaron', String(Math.max(0, vidas))]],
      detalle: { niveles, rotas, combo: mejorCombo, jefes, poderes: poderesTomados, vidas: Math.max(0, vidas) },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__lapidas = () => ({ fase, puntos, nivel, niveles, rotas, vidas, pelotas: pelotas.length, quedan: lapidas.filter((l) => !l.piedra).length, jefe: jefe ? jefe.vida : null, velocidad: Math.round(velocidad), terminado, seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); musica.intensidad = 1; },
    destruir() { musica.parar(); m.destruir(); },
  };
}
