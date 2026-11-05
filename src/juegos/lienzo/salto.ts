import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, mezclar, piloto } from './motor2d';
import { desdeTexto, type Sprite } from './pixel';

// Salto Estelar (04-11): un astronauta salta solo de plataforma en plataforma hacia arriba; tú lo mueves a los lados
// (flechas o A/D, el mouse, o tocando la mitad izquierda o derecha). Si cae fuera de la pantalla, se acaba. Plataformas
// que se mueven, que se rompen (no sirven para saltar) y que desaparecen después de un salto; resortes, cohete, escudo,
// enemigos que se pisan, monedas, el fondo que cambia con la altura (de la isla al espacio) y la marca de tu récord a la
// altura donde caíste la mejor vez. Puntaje: 10 por metro, más monedas y enemigos pisados. 3 minutos y una vida.
// Todo sale de la semilla: en un duelo, las mismas plataformas para los dos.
//
// Siempre hay un camino: entre dos plataformas que sirven nunca hay más distancia que un salto (las que se rompen son
// extra), y ningún enemigo queda encima de la única plataforma alcanzable.

const W = 480, H = 720, DURA = 180, G = 1500, SALTO = 900, RESORTE = 1500, ALCANCE = (SALTO * SALTO) / (2 * G); // 270
const RECORD = 'susto.salto.record';
type Clase = 'normal' | 'movil' | 'fragil' | 'fugaz';
interface Plataforma { id: number; x: number; y: number; ancho: number; clase: Clase; vx: number; rota: boolean; usada: boolean; resorte: boolean }
interface Cosa { id: number; tipo: 'moneda' | 'cohete' | 'escudo' | 'enemigo'; x: number; y: number; vx: number; viva: boolean; base: number }

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'salto', { fondo: '#7fc8ff', pixel: () => 3 });
  const musica = crearMusica(m.mesa, 124);
  musica.acordes([[60, 64, 67], [65, 69, 72], [57, 60, 64], [67, 71, 74]]);
  const bot = piloto();
  const r = generador(`${c.semilla}|salto`);
  let record = 0;
  try { record = Number(localStorage.getItem(RECORD)) || 0; } catch { /* sin almacenamiento */ }

  // ── Estado ──
  const yo = { x: W / 2, y: 600, vx: 0, vy: -SALTO, mira: 1 };
  let plataformas: Plataforma[] = [], cosas: Cosa[] = [], ids = 0, techo = 660, ultimaUtil = 660;
  let camY = 0, fase: 'juego' | 'fin' = 'juego', cohete = 0, escudo = 0, maxAltura = 0, monedas = 0, pisados = 0, resortes = 0, cohetes = 0;
  // Inclinación del celular (grados de lado); en iPhone hay que pedir permiso con un toque
  let inclinacion: number | null = null;
  const alInclinar = (ev: DeviceOrientationEvent) => { if (ev.gamma !== null) inclinacion = ev.gamma; };
  if (!bot && matchMedia('(pointer: coarse)').matches) {
    const pedir = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (typeof pedir === 'function') m.alTocar(() => { pedir().then((r) => { if (r === 'granted') m.mesa.escuchar('deviceorientation', alInclinar); }).catch(() => {}); });
    else m.mesa.escuchar('deviceorientation', alInclinar);
  }
  const prueba = { sinCamino: 0, atascado: 0 };
  /** Distancia de lado, considerando que salir por un borde es entrar por el otro (el astronauta se ve en los dos). */
  const distX = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, W + 28 - d); };
  const altura = () => Math.max(0, Math.round((660 - yo.y) / 20)); // en metros

  const agregar = (x: number, y: number, clase: Clase, resorte = false) => {
    const ancho = clase === 'movil' ? 64 : 72;
    const p: Plataforma = { id: ids++, x: Math.max(ancho / 2 + 4, Math.min(W - ancho / 2 - 4, x)), y, ancho, clase, vx: clase === 'movil' ? (r() < 0.5 ? -1 : 1) * (60 + r() * 60) : 0, rota: false, usada: false, resorte };
    plataformas.push(p); return p;
  };
  agregar(W / 2, 660, 'normal');
  /** Sigue armando hacia arriba: la dificultad sube con la altura. */
  const generar = () => {
    while (techo > camY - 300) {
      const metros = (660 - techo) / 20, d = Math.min(1, metros / 900);
      const salto = Math.min(ALCANCE * 0.82, 70 + d * 150 + r() * (40 + d * 30));
      techo -= salto;
      const x = 40 + r() * (W - 80), z = r();
      const clase: Clase = metros > 40 && z < 0.08 + d * 0.22 ? 'movil' : metros > 120 && z < 0.12 + d * 0.3 ? 'fugaz' : 'normal';
      const p = agregar(x, techo, clase, metros > 20 && r() < 0.06);
      if (ultimaUtil - techo > ALCANCE * 0.9) prueba.sinCamino++;
      ultimaUtil = techo;
      // Extras: una frágil de adorno (trampa), monedas, enemigos y poderes
      if (metros > 60 && r() < 0.18 + d * 0.2) agregar(40 + r() * (W - 80), techo + salto * (0.3 + r() * 0.4), 'fragil');
      if (r() < 0.3) cosas.push({ id: ids++, tipo: 'moneda', x: p.x, y: techo - 40, vx: 0, viva: true, base: techo - 40 });
      if (metros > 150 && r() < 0.04 + d * 0.06) {
        // El enemigo flota a media altura, lejos de la plataforma que se acaba de poner
        const ex = p.x > W / 2 ? 60 + r() * 120 : W - 60 - r() * 120;
        cosas.push({ id: ids++, tipo: 'enemigo', x: ex, y: techo - salto * 0.5, vx: (r() < 0.5 ? -1 : 1) * (30 + d * 50), viva: true, base: ex });
      }
      if (metros > 80 && r() < 0.025) cosas.push({ id: ids++, tipo: r() < 0.5 ? 'cohete' : 'escudo', x: p.x, y: techo - 34, vx: 0, viva: true, base: techo - 34 });
    }
  };
  generar();

  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    if (!c.libre && m.tiempo >= DURA) { terminar('Se acabó el tiempo'); return; }
    // Mando: aceleración a los lados
    let meta = 0;
    if (bot) meta = pilotar();
    else {
      const izq = m.teclas.has('ArrowLeft') || m.teclas.has('a'), der = m.teclas.has('ArrowRight') || m.teclas.has('d');
      if (izq || der) meta = izq ? -1 : 1;
      else if (m.puntero.abajo && m.puntero.tipo !== 'mouse') meta = m.puntero.x < m.ancho / 2 ? -1 : 1;
      else if (inclinacion !== null) meta = Math.abs(inclinacion) < 4 ? 0 : Math.max(-1, Math.min(1, inclinacion / 22));
      else if (m.puntero.dentro && m.puntero.tipo === 'mouse') { const [px] = aMundo(m.puntero.x, 0); const d = px - yo.x; meta = Math.abs(d) < 8 ? 0 : Math.max(-1, Math.min(1, d / 60)); }
    }
    yo.vx += (meta * 420 - yo.vx) * Math.min(1, dt * 10);
    if (meta) yo.mira = Math.sign(meta);
    yo.x += yo.vx * dt;
    if (yo.x < -14) yo.x += W + 28; else if (yo.x > W + 14) yo.x -= W + 28; // sale por un lado, entra por el otro
    // Vertical
    const antes = yo.y;
    if (cohete > 0) { cohete -= dt; yo.vy = -1300; if (cohete <= 0) { yo.vy = -SALTO; m.mesa.hud.aviso('Se acabó el cohete', '', 0.8); } }
    else yo.vy += G * dt;
    yo.y += yo.vy * dt;
    if (escudo > 0) escudo -= dt;
    // Plataformas
    for (const p of plataformas) {
      if (p.clase === 'movil') { p.x += p.vx * dt; if (p.x < p.ancho / 2 + 4 || p.x > W - p.ancho / 2 - 4) p.vx *= -1; }
      if (p.rota || cohete > 0 || yo.vy <= 0) continue;
      if (antes + 16 <= p.y && yo.y + 16 >= p.y && distX(yo.x, p.x) < p.ancho / 2 + 10) {
        if (p.clase === 'fragil') { p.rota = true; m.efectos.chispas(...aPantalla(p.x, p.y), ['#8a5a32', '#b07a48'], 10, 200); m.mesa.sonido.tono(150, 0.12, 'square', 0.05); continue; }
        yo.y = p.y - 16; yo.vy = p.resorte ? -RESORTE : -SALTO;
        if (p.resorte) { resortes++; m.mesa.sonido.tono(520, 0.18, 'square', 0.05); m.mesa.sonido.tono(880, 0.15, 'square', 0.04, 0.08); m.efectos.temblar(4); }
        else m.mesa.sonido.tono(300 + Math.min(400, altura()), 0.07, 'triangle', 0.05);
        if (p.clase === 'fugaz') { if (p.usada) p.rota = true; p.usada = true; }
        m.efectos.chispas(...aPantalla(yo.x, p.y), ['#ffffff', '#bfe9ff'], 4, 90);
      }
    }
    // Monedas, poderes y enemigos
    for (const o of cosas) {
      if (!o.viva) continue;
      if (o.tipo === 'enemigo') { o.x += o.vx * dt; if (Math.abs(o.x - o.base) > 70) o.vx *= -1; o.y += Math.sin(m.tiempo * 3 + o.id) * 10 * dt; }
      const dx = distX(o.x, yo.x), dy = o.y - yo.y;
      if (o.tipo === 'enemigo') {
        if (dx < 28 && Math.abs(dy) < 30) {
          if ((yo.vy > 0 && dy > 6) || cohete > 0) { o.viva = false; pisados++; puntos(100, o.x, o.y, '#ff8fc8'); if (cohete <= 0) yo.vy = -SALTO * 1.05; m.efectos.temblar(6); m.mesa.sonido.bien(); }
          else if (escudo > 0) { o.viva = false; escudo = 0; m.mesa.hud.aviso('¡El escudo te salvó!', 'oro', 1); m.efectos.temblar(10); }
          else { terminar('Te atrapó un bicho espacial'); return; }
        }
      } else if (dx < 24 && Math.abs(dy) < 26) {
        o.viva = false;
        if (o.tipo === 'moneda') { monedas++; puntos(25, o.x, o.y, '#ffd23c'); m.mesa.sonido.tono(1320, 0.07, 'square', 0.04); }
        else if (o.tipo === 'cohete') { cohete = 2.6; cohetes++; m.mesa.hud.aviso('¡Cohete!', 'oro', 1); m.efectos.temblar(8); }
        else { escudo = 12; m.mesa.hud.aviso('Escudo: te salva de un bicho', 'oro', 1.2); }
      }
    }
    // Cámara: solo sube
    camY = Math.min(camY, yo.y - H * 0.45);
    maxAltura = Math.max(maxAltura, altura());
    generar();
    plataformas = plataformas.filter((p) => p.y < camY + H + 80);
    cosas = cosas.filter((o) => o.y < camY + H + 80 && (o.viva || o.y > camY - 100));
    if (yo.y > camY + H + 40) { terminar('Te caíste'); return; }
    musica.intensidad = cohete > 0 ? 2 : maxAltura > 300 ? 2 : 1;
    m.mesa.hud.puntos(String(total()));
    if (!c.libre) { const q = Math.max(0, DURA - m.tiempo); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`${maxAltura} m${escudo > 0 ? ' · escudo' : ''}`);
  });
  let extra = 0;
  const total = () => maxAltura * 10 + extra;
  function puntos(n: number, x: number, y: number, color: string) { extra += n; const [sx, sy] = aPantalla(x, y); m.efectos.flotar(sx, sy - 20, `+${n}`, color, 24); }

  // ── Bots: el bueno apunta a la plataforma útil más alta que alcanza (o a la de abajo si cae) y esquiva bichos ──
  const rb = generador('bot-salto');
  let botMeta: Plataforma | null = null, botRuido = 0, botCambio = 0;
  function pilotar(): number {
    const torpe = bot === 'torpe';
    const sirve = (p: Plataforma) => !p.rota && p.clase !== 'fragil' && p.y > camY + 20;
    const bajo = plataformas.filter((p) => sirve(p) && p.y > yo.y + 16);
    // Alcanzable: llega a esa altura y, al bajar, alcanza a estar encima de lado
    const llegada = (p: Plataforma) => { const sube = yo.y + 16 - p.y, disc = yo.vy * yo.vy - 2 * G * sube; return yo.vy < 0 && disc > 2 * G * 10 ? (-yo.vy + Math.sqrt(disc)) / G : -1; };
    const alcanzables = plataformas.filter((p) => sirve(p) && p.y <= yo.y + 16 && llegada(p) > 0 && Math.abs(p.x + p.vx * llegada(p) - yo.x) - p.ancho / 2 < 400 * llegada(p));
    if (yo.vy < 0 && alcanzables.length) botMeta = alcanzables.reduce((a, b) => (b.y < a.y ? b : a));
    else if (yo.vy >= 0) {
      // Cayendo: la más cercana por debajo a la que alcanza a llegar de lado
      const t = (p: Plataforma) => Math.sqrt((2 * Math.max(1, p.y - yo.y)) / G) + 0.05;
      const ok = bajo.filter((p) => Math.abs(p.x - yo.x) - p.ancho / 2 < 420 * t(p) + 10);
      botMeta = ok.sort((a, b) => a.y - b.y)[0] ?? bajo.sort((a, b) => a.y - b.y)[0] ?? botMeta;
    }
    if (torpe && m.tiempo > botCambio) { botCambio = m.tiempo + 0.4 + rb(); botRuido = (rb() - 0.5) * 260; }
    let destino = botMeta ? botMeta.x + (botMeta.vx * 0.2) : W / 2;
    if (torpe) destino += botRuido;
    // Esquivar bichos cercanos que no se pueden pisar
    for (const o of cosas) if (o.viva && o.tipo === 'enemigo' && Math.abs(o.y - yo.y) < 90 && !(yo.vy > 0 && o.y > yo.y)) destino += (yo.x < o.x ? -1 : 1) * 90;
    const d = destino - yo.x;
    return Math.abs(d) < 6 ? 0 : Math.max(-1, Math.min(1, d / 40));
  }

  // ── Dibujo ──
  const esc = () => Math.min(1, (m.ancho - 8) / W), ox = () => (m.ancho - W * esc()) / 2;
  const aPantalla = (x: number, y: number) => [ox() + x * esc(), (y - camY) * esc() + (H - H * esc())] as const;
  const aMundo = (x: number, y: number) => [(x - ox()) / esc(), (y - (H - H * esc())) / esc() + camY] as const;
  const P = { O: '#0e0b16', B: '#f4f1ea', S: '#b9b9c6', V: '#7fb4ff', C: '#2f6bd8', N: '#ff8a2a', A: '#ffd23c', R: '#e8325a', M: '#7a3ad0', L: '#b06bff', G: '#3fa34d', g: '#7fd85a', c: '#8a5a32', m: '#b07a48', H: '#bfe9ff', E: '#7cffcb' };
  const ASTRO = desdeTexto(['...OOOO...', '..OBBBBO..', '.OBVVVVBO.', '.OBVHVVBO.', '.OBVVVVBO.', '..OBBBBO..', '.OSBBBBSO.', 'OSBBNNBBSO', 'OSBBBBBBSO', '.OBBOOBBO.', '.OBO..OBO.', '.OOO..OOO.'], P);
  const ASTRO_ESCUDO = desdeTexto(['...EEEE...', '..EBBBBE..', '.EBVVVVBE.', '.EBVHVVBE.', '.EBVVVVBE.', '..EBBBBE..', '.ESBBBBSE.', 'ESBBNNBBSE', 'ESBBBBBBSE', '.EBBOOBBE.', '.EBE..EBE.', '.EEE..EEE.'], P);
  const plat = (cuerpo: string, borde: string, n = 24) => desdeTexto([borde.repeat(n), cuerpo.repeat(n), cuerpo.repeat(n), borde.repeat(n)], P);
  const SPR: Record<Clase, Sprite> = { normal: plat('G', 'g'), movil: plat('C', 'V', 21), fragil: plat('c', 'm'), fugaz: plat('H', 'B') };
  const RES = desdeTexto(['.SSSS.', 'S....S', '.SSSS.', 'S....S'], P);
  const MONEDA = desdeTexto(['.AAA.', 'AABAA', 'AABAA', 'AABAA', '.AAA.'], P);
  const COHETE = desdeTexto(['..R..', '.RBR.', '.BVB.', '.BBB.', 'RBBBR', 'R.N.R', '..A..'], P);
  const ESCUDO = desdeTexto(['.EEEEE.', 'EEBBBEE', 'EBBEBBE', 'EBEEEBE', '.EBBBE.', '..EEE..'], P);
  const BICHO = desdeTexto(['.L.....L.', '..L...L..', '.MMMMMMM.', 'MMBOMBOMM', 'MMMMMMMMM', 'M.MMMMM.M', 'M.M...M.M'], P);
  // Fondo por altura: isla, cielo, nubes, atardecer, noche y espacio
  const CIELOS: [number, string][] = [[0, '#7fc8ff'], [150, '#5aa8f0'], [350, '#ff9a6a'], [550, '#4a2a7a'], [800, '#141030'], [1100, '#05040c']];
  const cieloEn = (metros: number) => { for (let i = CIELOS.length - 1; i >= 0; i--) if (metros >= CIELOS[i][0]) { const [a, ca] = CIELOS[i], sig = CIELOS[i + 1]; return sig ? mezclar(ca, sig[1], Math.min(1, (metros - a) / (sig[0] - a))) : ca; } return CIELOS[0][1]; };
  const ESTRELLAS = Array.from({ length: 60 }, (_, i) => [((i * 197) % 997) / 997, ((i * 389) % 911) / 911] as const);
  m.alPixel((gp) => {
    const s = esc(), k = m.k, px = (v: number) => Math.round(v / k) * k, metros = Math.max(0, (660 - camY - H / 2) / 20);
    gp.fillStyle = cieloEn(metros); gp.fillRect(0, 0, m.ancho, H);
    // Estrellas (desde el atardecer) y nubes (abajo), con paralaje lento
    if (metros > 450) { gp.fillStyle = '#fff6c9'; const a = Math.min(1, (metros - 450) / 300); gp.globalAlpha = a; for (const [ex, ey] of ESTRELLAS) gp.fillRect(px(ex * m.ancho), px(((ey * H * 2 - camY * 0.05) % H + H) % H), k, k); gp.globalAlpha = 1; }
    if (metros < 600) { gp.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 6; i++) { const y = ((i * 260 - camY * 0.3) % (H + 200) + H + 200) % (H + 200) - 100, x = ((i * 337) % 600) / 600 * m.ancho; gp.fillRect(px(x), px(y), px(90), px(18)); gp.fillRect(px(x + 20), px(y - 12), px(50), px(14)); } }
    // Isla al partir
    { const [, iy] = aPantalla(0, 690); if (iy < H + 40) { gp.fillStyle = '#3fa34d'; gp.fillRect(0, px(iy), m.ancho, H); gp.fillStyle = '#e3b07a'; gp.fillRect(0, px(iy + 30 * s), m.ancho, H); } }
    // Marca del récord
    if (record > 0) { const [, ry] = aPantalla(0, 660 - record * 20); if (ry > 0 && ry < H) { gp.fillStyle = '#ffd23c'; for (let x = 0; x < m.ancho; x += 6 * k) gp.fillRect(px(x), px(ry), 3 * k, k); } }
    for (const p of plataformas) {
      if (p.rota) continue;
      const [x, y] = aPantalla(p.x, p.y);
      if (y < -20 || y > H + 20) continue;
      if (p.clase === 'fugaz' && p.usada) gp.globalAlpha = 0.45;
      m.sprite(SPR[p.clase], x, y + 6 * s, s);
      gp.globalAlpha = 1;
      if (p.resorte) m.sprite(RES, x, y - 6 * s, 1.4 * s);
    }
    for (const o of cosas) {
      if (!o.viva) continue;
      const [x, y] = aPantalla(o.x, o.y + (o.tipo === 'moneda' ? Math.sin(m.tiempo * 4 + o.id) * 3 : 0));
      if (y < -30 || y > H + 30) continue;
      m.sprite(o.tipo === 'moneda' ? MONEDA : o.tipo === 'cohete' ? COHETE : o.tipo === 'escudo' ? ESCUDO : BICHO, x, y, (o.tipo === 'enemigo' ? 1.5 : 1.3) * s);
    }
    const [ax, ay] = aPantalla(yo.x, yo.y);
    if (cohete > 0) { gp.fillStyle = Math.floor(m.tiempo * 20) % 2 ? '#ffd23c' : '#ff8a2a'; gp.fillRect(px(ax) - 2 * k, px(ay + 18 * s), 4 * k, px(14 * s)); }
    gp.save(); if (yo.mira < 0) { gp.translate(px(ax), 0); gp.scale(-1, 1); gp.translate(-px(ax), 0); }
    m.sprite(escudo > 0 ? ASTRO_ESCUDO : ASTRO, ax, ay, 1.4 * s);
    if (yo.x < 22 || yo.x > W - 22) { const [bx] = aPantalla(yo.x < 22 ? yo.x + W + 28 : yo.x - W - 28, yo.y); m.sprite(escudo > 0 ? ASTRO_ESCUDO : ASTRO, bx, ay, 1.4 * s); }
    gp.restore();
    // En pantallas anchas, los costados se oscurecen: ahí termina la zona de juego (sales por un lado y entras por el otro)
    const borde = ox();
    if (borde > 4) { gp.fillStyle = 'rgba(14,11,22,.45)'; gp.fillRect(0, 0, px(borde), H); gp.fillRect(px(borde + W * s), 0, m.ancho, H); gp.fillStyle = 'rgba(255,255,255,.35)'; gp.fillRect(px(borde) - k, 0, k, H); gp.fillRect(px(borde + W * s), 0, k, H); }
  });
  m.alDibujar((g) => {
    if (fase !== 'juego') return;
    for (const o of cosas) if (o.viva && o.tipo === 'enemigo' && o.y < camY - 10 && o.y > camY - 520) { const [x] = aPantalla(o.x, o.y), y = 78, a = 0.5 + 0.5 * Math.sin(m.tiempo * 10); g.globalAlpha = 0.6 + a * 0.4; g.fillStyle = '#ff3b5c'; g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x - 11, y + 6); g.lineTo(x + 11, y + 6); g.closePath(); g.fill(); g.globalAlpha = 1; }
    if (record > 0) { const [, ry] = aPantalla(0, 660 - record * 20); if (ry > 70 && ry < H - 10) m.rotulo(`Récord ${record} m`, m.ancho - 70, ry - 12, 14, '#ffd23c'); }
    if (!bot && m.tiempo < 6) { const tam = Math.round(Math.min(20, m.ancho / 22)); m.rotulo(m.ancho > 600 ? 'Muévete con las flechas o el mouse · salta solo' : 'Toca a la izquierda o a la derecha', m.ancho / 2, H * 0.3, tam, '#ffffff'); }
  });

  let terminado = false, motivo = '';
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin'; motivo = porque;
    musica.parar(); m.detener();
    if (maxAltura > record) { try { localStorage.setItem(RECORD, String(maxAltura)); } catch { /* sin almacenamiento */ } }
    m.efectos.temblar(12); m.mesa.sonido.mal();
    c.alTerminar({
      puntaje: total(),
      lineas: [['Resultado', porque], ['Altura máxima', `${maxAltura} m${maxAltura > record && record > 0 ? ' (¡récord!)' : ''}`], ['Monedas', String(monedas)], ['Bichos pisados', String(pisados)], ['Resortes', String(resortes)], ['Cohetes', String(cohetes)]],
      detalle: { altura: maxAltura, monedas, pisados, resortes, cohetes },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__salto = () => ({ fase, puntos: total(), altura: maxAltura, monedas, pisados, terminado, motivo, yo: { x: Math.round(yo.x), y: Math.round(yo.y), vy: Math.round(yo.vy) }, cerca: plataformas.filter((p) => Math.abs(p.y - yo.y) < 400).map((p) => [Math.round(p.x), Math.round(p.y), p.clase, p.rota, p.resorte]), seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); musica.intensidad = 1; },
    destruir() { musica.parar(); m.destruir(); },
  };
}
