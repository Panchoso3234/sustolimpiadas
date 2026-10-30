import { generador } from '../../nucleo/azar';
import { grabadora } from '../fantasma';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { bola, crearSprite, desdeTexto, girado, mezcla, PAL, type Sprite } from './pixel';

// Flappy Colibrí (29-10): un solo botón. Cada toque es un aleteo; la gravedad te baja. Pasa por los huecos entre los pares de
// obstáculos sin rozarlos. Cuatro mundos (bosque, cañón con viento, ciudad, aurora con hielo que se mueve) cambian cada 25 huecos.
// Puntos: 10 por hueco (× racha de precisión hasta ×3), +5 por pasar "al ras" y +5 por flor de néctar; 3 flores dan 3 s de turbo
// invencible. Todo sale de la semilla: en un duelo los dos vuelan exactamente los mismos huecos.

const ALTO = 720, SUELO = ALTO - 62, ANCHO_OBS = 92, SEPARACION = 310, PRIMERO = 760, R = 13;
const GRAVEDAD = 2000, ALETEO = -560, CAIDA_MAX = 950;
const MEDALLAS: [string, number, string][] = [['Platino', 100, '#d9f3ff'], ['Oro', 60, '#ffcf4a'], ['Plata', 30, '#dfe6f3'], ['Bronce', 10, '#d9925a']];
interface Mundo { nombre: string; cielo: [string, string, string]; lejos: string; medio: string; cerca: string; suelo: [string, string]; obs: [string, string, string]; acordes: number[][] }
const MUNDOS: Mundo[] = [
  { nombre: 'Bosque al amanecer', cielo: ['#ffb38a', '#ffd9a8', '#bfe3ff'], lejos: '#9db7d6', medio: '#5e8f6b', cerca: '#2f5e3d', suelo: ['#6aa84f', '#3d6b2c'], obs: ['#6b4a2e', '#8a6340', '#4a3220'], acordes: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
  { nombre: 'Cañón al mediodía', cielo: ['#7cc8ff', '#a8dcff', '#fff1d0'], lejos: '#e0a477', medio: '#c47a4e', cerca: '#8c4f30', suelo: ['#d9a066', '#a8683c'], obs: ['#c97f4f', '#e6a36f', '#8f5232'], acordes: [[50, 53, 57], [48, 52, 55], [46, 50, 53], [45, 48, 52]] },
  { nombre: 'Ciudad al atardecer', cielo: ['#3b2b6b', '#e0637a', '#ffc27a'], lejos: '#6c4f8c', medio: '#3e3060', cerca: '#22183d', suelo: ['#3d3d4a', '#262631'], obs: ['#4a5068', '#6b7390', '#2e3246'], acordes: [[52, 55, 59], [48, 52, 55], [45, 48, 52], [47, 50, 54]] },
  { nombre: 'Aurora boreal', cielo: ['#04102a', '#0b2550', '#1a3f6b'], lejos: '#1f3657', medio: '#16263f', cerca: '#0c1628', suelo: ['#dfeefc', '#a9c6e3'], obs: ['#bfe6ff', '#e8f7ff', '#7fb8e0'], acordes: [[49, 52, 56], [45, 49, 52], [47, 51, 54], [44, 47, 51]] },
];
const TRAJES: { nombre: string; desde: number; cuerpo: [string, string]; garganta: string; ala: string }[] = [
  { nombre: 'Esmeralda', desde: 0, cuerpo: ['#2fbf71', '#0f6b52'], garganta: '#e8325a', ala: '#9fe6c8' },
  { nombre: 'Rubí', desde: 10, cuerpo: ['#e8325a', '#7a0f2b'], garganta: '#ffd23c', ala: '#ffb3c4' },
  { nombre: 'Zafiro', desde: 20, cuerpo: ['#2b7bff', '#0f2f7a'], garganta: '#7cffcb', ala: '#b3d4ff' },
  { nombre: 'Amatista', desde: 35, cuerpo: ['#a46bff', '#4b2276'], garganta: '#ff8fc8', ala: '#e0ccff' },
  { nombre: 'Oro', desde: 50, cuerpo: ['#ffd23c', '#b07a00'], garganta: '#ff7a1a', ala: '#fff2b3' },
  { nombre: 'Ónix', desde: 75, cuerpo: ['#3a3a48', '#0e0e14'], garganta: '#7cffcb', ala: '#9aa0b8' },
  { nombre: 'Arcoíris', desde: 100, cuerpo: ['#ff5f6d', '#47e5bc'], garganta: '#ffd23c', ala: '#ffffff' },
  { nombre: 'Cristal', desde: 150, cuerpo: ['#e8fbff', '#9be7ff'], garganta: '#b36bff', ala: '#ffffff' },
];
const REG = 'susto.colibri.record';

interface Obstaculo { i: number; x: number; centro: number; hueco: number; mueve: { amp: number; vel: number; fase: number } | null; viento: number; flor: boolean; pasado: boolean; florTomada: boolean; minLibre: number }

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'colibri', { fondo: '#bfe3ff', pixel: () => 4 });
  const musica = crearMusica(m.mesa, 112);
  const bot = piloto();
  let record = 0;
  try { record = Number(localStorage.getItem(REG)) || 0; } catch { /* sin almacenamiento */ }
  const traje = [...TRAJES].reverse().find((t) => record >= t.desde) ?? TRAJES[0];

  // ── Los obstáculos salen de la semilla (siempre pasables) ──
  const r = generador(`${c.semilla}|colibri`);
  const obs: Obstaculo[] = [];
  let previo = ALTO / 2, generados = 0;
  const generar = () => {
    const i = generados++;
    const mundo = Math.floor(i / 25) % 4, hueco = Math.max(150, 212 - i * 0.7 - (c.nivel - 1) * 4);
    const salto = 120 + Math.min(80, i * 1.5), min = 90 + hueco / 2, max = SUELO - 50 - hueco / 2;
    const centro = Math.max(min, Math.min(max, previo + (r() * 2 - 1) * salto));
    previo = centro;
    const muevese = (mundo === 1 && r() < 0.25) || (mundo === 2 && r() < 0.3) || (mundo === 3 && r() < 0.6);
    const mueve = muevese && i > 4 ? { amp: 34 + r() * 26, vel: 1.1 + r() * 0.8, fase: r() * 6.28 } : null;
    const viento = mundo === 1 && r() < 0.45 ? (r() < 0.5 ? -1 : 1) * (520 + r() * 260) : 0;
    obs.push({ i, x: PRIMERO + i * SEPARACION, centro, hueco, mueve, viento, flor: i > 2 && r() < 0.2, pasado: false, florTomada: false, minLibre: Infinity });
  };
  for (let i = 0; i < 12; i++) generar();
  const centroEn = (o: Obstaculo, t: number) => (o.mueve ? o.centro + Math.sin(t * o.mueve.vel + o.mueve.fase) * o.mueve.amp : o.centro);

  // ── Estado ──
  const yo = { y: ALTO / 2 - 40, vy: 0, d: 0, giro: 0, aleteo: 0 };
  let fase: 'espera' | 'vuelo' | 'repeticion' | 'fin' = 'espera', inicioVuelo = 0;
  let puntos = 0, huecos = 0, ras = 0, flores = 0, nectar = 0, turbos = 0, turboHasta = -1, racha = 0, mejorRacha = 0, choques = 0, mundoActual = 0, avisoMundo = 0;
  const xAve = () => Math.min(m.ancho * 0.3, 280);
  const multiplicador = () => 1 + Math.min(2, Math.floor(racha / 10));
  const velocidad = () => Math.min(335, 232 + huecos * 1.2 + (c.nivel - 1) * 8) * (m.tiempo < turboHasta ? 1.3 : 1);
  const ruta = grabadora();
  const lider = c.fantasma ?? null;
  // Últimos 3 s para la repetición en cámara lenta
  const historia: { t: number; d: number; y: number; giro: number; aleteo: number }[] = [];
  let repDesde = 0, repInicio = 0, choqueEn: { x: number; y: number } | null = null;

  const aletear = () => {
    if (fase === 'espera') { fase = 'vuelo'; inicioVuelo = m.tiempo; musica.intensidad = 1; }
    if (fase !== 'vuelo') return;
    yo.vy = ALETEO; yo.aleteo = m.tiempo;
    m.mesa.sonido.tono(880 + Math.random() * 60, 0.05, 'triangle', 0.05);
  };
  m.alTocar(() => aletear());
  m.alTecla((k) => { if (k === ' ' || k === 'ArrowUp' || k === 'w') aletear(); });

  const sumar = (p: number, x: number, y: number, texto: string, color = '#fff6c9') => { puntos += p; m.efectos.flotar(x, y, texto, color, 30); };
  const chocar = (x: number, y: number) => {
    choques++;
    choqueEn = { x, y };
    m.efectos.temblar(18); m.efectos.congelar(90);
    m.efectos.chispas(x, y, ['#ffffff', traje.cuerpo[0], traje.ala], 22, 380);
    m.mesa.sonido.tono(140, 0.3, 'sawtooth', 0.14); m.mesa.sonido.mal();
    racha = 0;
    musica.intensidad = 0;
    fase = 'repeticion'; repInicio = performance.now(); repDesde = m.tiempo - 1.6;
  };

  m.alPaso((dt) => {
    const t = m.tiempo;
    if (fase === 'espera') { yo.y = ALTO / 2 - 40 + Math.sin(t * 5) * 9; return; }
    if (fase !== 'vuelo') return;
    if (bot) pilotar();
    const v = velocidad(), x = xAve();
    yo.d += v * dt;
    // Viento del cañón: entre el obstáculo y el siguiente
    const delante = obs.find((o) => o.x + ANCHO_OBS > yo.d - 40 && o.x - SEPARACION * 0.5 < yo.d);
    const empuje = delante && delante.viento && yo.d > delante.x - SEPARACION * 0.55 && yo.d < delante.x - 30 ? delante.viento : 0;
    yo.vy = Math.min(CAIDA_MAX, yo.vy + (GRAVEDAD + empuje) * dt);
    yo.y += yo.vy * dt;
    yo.giro = Math.max(-0.5, Math.min(1.25, yo.vy / 700));
    if (yo.y - R < 0) { yo.y = R; yo.vy = 0; }
    const turbo = t < turboHasta;
    if (yo.y + R >= SUELO) {
      if (turbo) { yo.y = SUELO - R; yo.vy = ALETEO * 0.7; }
      else return chocar(x, SUELO - 4);
    }
    // Obstáculos: choque, paso "al ras", centro, flores
    for (const o of obs) {
      const sx = x + (o.x - yo.d);
      if (sx > x + 140 || sx + ANCHO_OBS < x - 140) continue;
      const cy = centroEn(o, t), arriba = cy - o.hueco / 2, abajo = cy + o.hueco / 2;
      const dentro = x + R > sx && x - R < sx + ANCHO_OBS;
      if (dentro) {
        o.minLibre = Math.min(o.minLibre, yo.y - R - arriba, abajo - (yo.y + R));
        const qx = Math.max(sx, Math.min(x, sx + ANCHO_OBS));
        const toca = (fy: number) => Math.hypot(x - qx, yo.y - fy) < R;
        const choca = (yo.y < arriba && true) || (yo.y > abajo) || toca(arriba) || toca(abajo);
        if (choca && !turbo) return chocar(x, yo.y);
      }
      if (o.flor && !o.florTomada && Math.hypot(sx + ANCHO_OBS / 2 - x, cy - yo.y) < 30) {
        o.florTomada = true; flores++; nectar++;
        sumar(5, x, yo.y - 30, '+5 néctar', '#ff8fc8');
        m.efectos.chispas(x, yo.y, ['#ff8fc8', '#fff6c9', '#ffd23c'], 14, 220, { gravedad: -80 });
        m.mesa.sonido.tono(1320, 0.12, 'sine', 0.08); m.mesa.sonido.tono(1760, 0.16, 'sine', 0.06, 0.06);
        if (nectar >= 3) { nectar = 0; turbos++; turboHasta = t + 3; m.mesa.hud.aviso('¡Turbo de néctar! 3 s invencible', 'oro', 1.4); m.efectos.temblar(5); m.mesa.sonido.tono(523, 0.4, 'triangle', 0.1, 0); m.mesa.sonido.tono(784, 0.4, 'triangle', 0.1, 0.08); }
      }
      if (!o.pasado && x - R > sx + ANCHO_OBS) {
        o.pasado = true; huecos++;
        const centrado = Math.abs(yo.y - cy) < o.hueco * 0.18;
        racha = centrado ? racha + 1 : 0; mejorRacha = Math.max(mejorRacha, racha);
        const mult = multiplicador();
        sumar(10 * mult, x + 40, yo.y - 24, mult > 1 ? `+${10 * mult} ×${mult}` : '+10');
        m.mesa.sonido.tono(1040, 0.07, 'square', 0.04);
        if (racha > 0 && racha % 10 === 0 && mult <= 3) { m.mesa.hud.aviso(`¡Precisión ×${mult}!`, 'oro', 1.1); m.mesa.sonido.bien(); }
        if (o.minLibre < 8 && !turbo) { ras++; sumar(5 * mult, x, yo.y + 34, '¡Al ras! +' + 5 * mult, '#7cffcb'); m.efectos.chispas(x, yo.y, ['#7cffcb', '#ffffff'], 10, 260); m.mesa.sonido.tono(1560, 0.08, 'triangle', 0.06); }
        musica.intensidad = racha >= 10 ? 2 : 1;
        while (generados < o.i + 12) generar();
        const nuevo = Math.floor(huecos / 25) % 4;
        if (nuevo !== mundoActual) { mundoActual = nuevo; avisoMundo = t; musica.acordes(MUNDOS[nuevo].acordes); m.mesa.hud.aviso(`Mundo ${Math.floor(huecos / 25) + 1}: ${MUNDOS[nuevo].nombre}`, 'bien', 1.6); }
      }
    }
    while (obs.length && obs[0].x + ANCHO_OBS < yo.d - 400) obs.shift();
    historia.push({ t, d: yo.d, y: yo.y, giro: yo.giro, aleteo: yo.aleteo });
    while (historia.length && historia[0].t < t - 3) historia.shift();
    ruta.anotar(t - inicioVuelo, yo.d / 100, yo.y / 10, 0);
    if (turbo && Math.random() < 0.6) m.efectos.chispas(x - 10, yo.y, ['#ffd23c', '#ff8fc8'], 1, 60, { gravedad: 0, dura: 0.3 });
    m.mesa.hud.puntos(String(puntos));
    m.mesa.hud.extra(`${huecos} huecos${multiplicador() > 1 ? ` · ×${multiplicador()}` : ''} · néctar ${'●'.repeat(nectar)}${'○'.repeat(3 - nectar)}`);
  });

  // ── Bot de pruebas: el bueno apunta al centro del próximo hueco; el torpe aletea al azar ──
  const rb = generador('bot-colibri');
  function pilotar() {
    if (bot === 'torpe') { if (rb() < 0.022) aletear(); return; }
    const x = xAve(), t = m.tiempo, o = obs.find((p) => x + (p.x - yo.d) + ANCHO_OBS > x - R);
    const meta = o ? centroEn(o, t + 0.15) + 18 : ALTO / 2;
    if (yo.y > meta && yo.vy > -120) aletear();
  }

  // ── Pixel art (8 bits): 1 píxel del arte = 4 unidades del juego (720 de alto son 180 píxeles) ──
  // Lo que se ve en este momento: en vivo, o el cuadro de la repetición en cámara lenta
  const vista = () => {
    if (fase === 'repeticion' || fase === 'fin') {
      const real = (performance.now() - repInicio) / 1000, k = Math.min(1, real / 3), tt = repDesde + k * 1.6;
      const s = historia.find((h) => h.t >= tt) ?? historia[historia.length - 1] ?? { d: yo.d, y: yo.y, giro: yo.giro, aleteo: 0, t: m.tiempo };
      return { d: s.d, t: s.t, y: s.y, giro: s.giro, aleteo: s.aleteo, real, k };
    }
    return { d: yo.d, t: m.tiempo, y: yo.y, giro: yo.giro, aleteo: yo.aleteo, real: 0, k: 0 };
  };
  const fantasmaEn = (t: number, d: number) => {
    if (!lider || fase === 'espera') return null;
    const tt = t - inicioVuelo, n = lider.ruta.length / 3, k = tt / lider.paso;
    if (k >= n - 1) return { cayo: true, sx: xAve() + lider.ruta[(n - 1) * 3] * 100 - d, y: 0 };
    const a = Math.floor(k), f = k - a;
    return { cayo: false, sx: xAve() + (lider.ruta[a * 3] * (1 - f) + lider.ruta[a * 3 + 3] * f) * 100 - d, y: (lider.ruta[a * 3 + 1] * (1 - f) + lider.ruta[a * 3 + 4] * f) * 10 };
  };
  const mundoDe = (d: number) => Math.floor(Math.max(0, (d - PRIMERO) / SEPARACION + 0.5) / 25) % 4;

  // El colibrí: cuerpo y tres posiciones de las alas, con los colores del traje
  const CUERPO = ['......OOOO......', '.....OCCCCO.....', 'OO..OCCCCEPO....', 'ODOOCCCCCCCOBBBB', '.ODDDCCCGGGO....', '..ODDDCGGGO.....', '...OOOOOOO......'];
  const ALAS = [
    { x: 3, y: 0, filas: ['.WW....', 'WWWW...', 'WWWWW..', '.WWWWW.', '..WWWWO', '...OOO.'] },
    { x: 3, y: 7, filas: ['OWWWWWO.', 'WWWWWWWO', '.OOOOOO.'] },
    { x: 3, y: 9, filas: ['...OOO.', '..WWWWO', '.WWWWW.', 'WWWWW..', '.WW....'] },
  ];
  const colores = { O: '#14101e', C: traje.cuerpo[0], D: traje.cuerpo[1], G: traje.garganta, W: traje.ala, E: '#ffffff', P: '#14101e', B: '#2a2a2a' };
  const cuerpo = desdeTexto(CUERPO, colores);
  const AVE = ALAS.map((ala) => crearSprite(16, 14, (g) => { const w = desdeTexto(ala.filas, colores); if (ala.y > 5) { g.drawImage(cuerpo, 0, 5); g.drawImage(w, ala.x, ala.y); } else { g.drawImage(w, ala.x, ala.y); g.drawImage(cuerpo, 0, 5); } }));
  const FLOR = desdeTexto(['..P.P..', '.PPPPP.', 'PPPYPPP', '.PYAYP.', 'PPPYPPP', '.PPPPP.', '..P.P..'], { P: PAL.rosado, Y: PAL.amarillo, A: '#fff6c9' });

  // Fondos por mundo: cielo en franjas con tramado, tres cordilleras (o edificios) y suelo; todo se pinta una vez
  const tramar = (g: CanvasRenderingContext2D, alto: number, colores3: readonly string[]) => {
    for (let y = 0; y < alto; y++) {
      const p = (y / alto) * (colores3.length - 1), i = Math.floor(p), f = p - i;
      for (let x = 0; x < 64; x++) { g.fillStyle = f > [0.12, 0.62, 0.37, 0.87][(x + (y % 2) * 2) % 4] ? colores3[Math.min(colores3.length - 1, i + 1)] : colores3[i]; g.fillRect(x, y, 1, 1); }
    }
  };
  const cordillera = (color: string, semilla: number, base: number, variacion: number, nieve?: string) => crearSprite(256, 180, (g) => {
    for (let x = 0; x < 256; x++) {
      const u = (x / 256) * Math.PI * 2, h = Math.round(base - variacion * (0.5 + 0.3 * Math.sin(u * 3 + semilla) + 0.2 * Math.sin(u * 7 + semilla * 2) + 0.1 * Math.sin(u * 13 + semilla)));
      g.fillStyle = color; g.fillRect(x, h, 1, 180 - h);
      if (nieve && h < base - variacion * 0.75) { g.fillStyle = nieve; g.fillRect(x, h, 1, 2); }
    }
  });
  const edificios = (color: string) => crearSprite(256, 180, (g) => {
    const rb = generador('edificios-pixel');
    let x = 0;
    while (x < 256) {
      const w = 12 + Math.floor(rb() * 14), h = 40 + Math.floor(rb() * 70);
      g.fillStyle = color; g.fillRect(x, 180 - h, w, h);
      for (let fy = 180 - h + 3; fy < 176; fy += 5) for (let fx = x + 2; fx < x + w - 2; fx += 4) if (rb() > 0.35) { g.fillStyle = rb() > 0.15 ? '#ffd67a' : '#96c8ff'; g.fillRect(fx, fy, 2, 2); }
      x += w + 1;
    }
  });
  const FONDOS = MUNDOS.map((w, k) => ({
    cielo: crearSprite(64, 180, (g) => tramar(g, 180, k === 3 ? ['#04102a', '#0b2550', '#1a3f6b'] : w.cielo)),
    lejos: cordillera(w.lejos, k * 3.1, 120, 50, k === 0 || k === 3 ? '#e8f0ff' : undefined),
    medio: cordillera(w.medio, k * 5.7 + 1, 140, 34),
    cerca: k === 2 ? edificios(w.cerca) : cordillera(w.cerca, k * 2.3 + 4, 156, 20),
    suelo: crearSprite(32, 20, (g) => { g.fillStyle = w.suelo[1]; g.fillRect(0, 0, 32, 20); g.fillStyle = w.suelo[0]; g.fillRect(0, 0, 32, 4); g.fillStyle = mezcla(w.suelo[0], '#ffffff', 0.35); g.fillRect(0, 0, 32, 1); g.fillStyle = mezcla(w.suelo[1], '#000000', 0.2); for (let x = 0; x < 32; x += 8) g.fillRect(x, 6, 4, 1); for (let x = 4; x < 32; x += 8) g.fillRect(x, 11, 3, 1); }),
  }));
  const NUBE = [desdeTexto(['....WWWW......', '..WWWWWWWW.WW..', '.WWWWWWWWWWWWW.', 'WWWWWWWWWWWWWWW', '.SSSSSSSSSSSSS.'], { W: '#ffffff', S: '#d8e4f0' }), desdeTexto(['...WWW....', '.WWWWWWW..', 'WWWWWWWWWW', '.SSSSSSSS.'], { W: '#ffffff', S: '#d8e4f0' })];
  const SOL = bola(9, 9, { borde: '#ffe9a0', sombra: '#fff2c0', base: '#fff6d0', luz: '#fffbe8' });
  // Columnas por mundo (23 píxeles de ancho): tronco con corteza, roca en estratos, edificio con ventanas, pilar de hielo
  const COLUMNAS = MUNDOS.map((_, k) => crearSprite(23, 200, (g) => {
    const rc = generador(`columna-${k}`);
    if (k === 0) { g.fillStyle = '#7a5434'; g.fillRect(0, 0, 23, 200); g.fillStyle = '#5a3a20'; for (let i = 0; i < 9; i++) { const x = 2 + Math.floor(rc() * 19); for (let y = 0; y < 200; y++) if (Math.sin(y * 0.3 + i) > -0.6) g.fillRect(x + (Math.sin(y * 0.15 + i) > 0.5 ? 1 : 0), y, 1, 1); } g.fillStyle = '#9a7048'; g.fillRect(1, 0, 2, 200); g.fillStyle = '#3a2410'; g.fillRect(21, 0, 2, 200); }
    else if (k === 1) { const cs = ['#d58a54', '#c47a4e', '#e3a06c', '#b3683e', '#cf8650']; for (let y = 0; y < 200; y++) { g.fillStyle = cs[Math.floor(y / 4) % 5]; g.fillRect(0, y, 23, 1); } g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(19, 0, 4, 200); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(0, 0, 2, 200); }
    else if (k === 2) { g.fillStyle = '#4a5068'; g.fillRect(0, 0, 23, 200); for (let y = 2; y < 200; y += 6) for (let x = 3; x < 20; x += 5) { g.fillStyle = rc() > 0.3 ? '#ffd67a' : '#2a2e40'; g.fillRect(x, y, 3, 3); } g.fillStyle = '#2e3246'; g.fillRect(21, 0, 2, 200); }
    else { g.fillStyle = '#9fd4f0'; g.fillRect(0, 0, 23, 200); g.fillStyle = '#d8f2ff'; g.fillRect(3, 0, 3, 200); g.fillStyle = '#ffffff'; for (let y = 0; y < 200; y += 9) g.fillRect(4, y, 1, 4); g.fillStyle = '#6aaed0'; g.fillRect(19, 0, 4, 200); }
  }));
  const REMATES = [
    desdeTexto(['OOOOOOOOOOOOOOOOOOOOOOOOOOO', 'OGGGLGGGGGLGGGGGGLGGGGGGGGO', 'OGGGGGGGGGGGGGGGGGGGGGGGGGO', 'OMMMMMMMMMMMMMMMMMMMMMMMMMO', 'OMMMMMMMMMMMMMMMMMMMMMMMMMO', 'OOOOOOOOOOOOOOOOOOOOOOOOOOO'], { O: '#2a1a0a', G: '#4f8f3c', L: '#7fd85a', M: '#6b4a2e' }),
    desdeTexto(['..OOOOOOOOOOOOOOOOOOOOOO...', '.ORRRRRRLRRRRRRRRRLRRRRRRO.', 'ORRRRRRRRRRRRRRRRRRRRRRRRRO', 'ORRRRRRRRRRRRRRRRRRRRRRRRRO', '.OOOOOOOOOOOOOOOOOOOOOOOOO.'], { O: '#6a3018', R: '#c97f4f', L: '#e6a36f' }),
    desdeTexto(['OOOOOOOOOOOOOOOOOOOOOOOOOOO', 'OCCCCCCCCCCCCCCCCCCCCCCCCCO', 'OLLLLLLLLLLLLLLLLLLLLLLLLLO', 'OOOOOOOOOOOOOOOOOOOOOOOOOOO'], { O: '#1a1c28', C: '#6b7390', L: '#4a5068' }),
    desdeTexto(['IIIIIIIIIIIIIIIIIIIIIIIIIII', '.IIIIIIIIIIIIIIIIIIIIIIIII.', '..I.IIII.IIIII.IIIII.III...', '..I..II...III...III...I....', '......I....I.....I.........'], { I: '#e8f7ff' }),
  ];
  const nubes = Array.from({ length: 7 }, (_, i) => ({ x: (i * 397) % 2400, y: 60 + ((i * 131) % 200), tipo: i % 2 }));

  // Fondo de un mundo: cielo, sol y nubes (o estrellas y aurora) y las tres capas con paralaje
  const pintarFondo = (gp: CanvasRenderingContext2D, mundo: number, v: ReturnType<typeof vista>) => {
    const W = m.ancho, k = m.k, F = FONDOS[mundo];
    for (let px = 0; px < W; px += 64 * k) gp.drawImage(F.cielo, px, 0, 64 * k, ALTO); // en mosaico: estirarlo deformaría el tramado
    if (mundo === 3) {
      // Estrellas que titilan y aurora en franjas que ondulan
      for (let s = 0; s < 60; s++) { if (Math.sin(v.t * 2 + s * 7) > 0.3) { gp.fillStyle = s % 5 ? '#ffffff' : '#bfe9ff'; gp.fillRect(Math.round(((s * 173 - v.d * 0.02) % W + W) % W / k) * k, Math.round(((s * 61) % 330) / k) * k, k, k); } }
      for (let b = 0; b < 3; b++) { gp.fillStyle = b === 1 ? 'rgba(180,107,255,.28)' : 'rgba(124,255,203,.28)'; for (let px = 0; px < W; px += 2 * k) { const y0 = 120 + b * 45 + Math.sin(px * 0.006 + v.t * 0.6 + b) * 45; gp.fillRect(px, Math.round(y0 / k) * k, 2 * k, Math.round((40 + Math.sin(px * 0.01 + b) * 12) / k) * k); } }
    } else {
      m.sprite(SOL, W * 0.78, mundo === 2 ? 360 : 130, mundo === 2 ? 3 : 2);
      for (const n of nubes) m.sprite(NUBE[n.tipo], ((n.x - v.d * 0.06) % (W + 300) + W + 300) % (W + 300) - 150, n.y, 2);
    }
    // Capas con paralaje: cada una se corre a su velocidad
    const capa = (img: Sprite, factor: number) => { const lado = 256 * k, off = -(((v.d * factor) % lado) + lado) % lado; for (let px = off; px < W; px += lado) gp.drawImage(img, Math.round(px / k) * k, 0, lado, ALTO); };
    capa(F.lejos, 0.12); capa(F.medio, 0.3); capa(F.cerca, 0.55);
  };
  const pintarSuelo = (gp: CanvasRenderingContext2D, mundo: number, d: number) => {
    const W = m.ancho, k = m.k, sl = 32 * k, offS = -((d % sl) + sl) % sl;
    for (let px = offS; px < W; px += sl) gp.drawImage(FONDOS[mundo].suelo, Math.round(px / k) * k, Math.round(SUELO / k) * k, sl, 20 * k);
  };
  // Cambio de mundo: el nuevo aparece sobre el anterior durante los primeros 2 huecos (unos 2,5 s), sin saltos.
  // Va por distancia y no por reloj: se pausa con el juego y la repetición del final lo muestra igual.
  const fundido = (d: number) => {
    const p = Math.max(0, (d - PRIMERO) / SEPARACION + 0.5), dentro = p % 25, mundo = mundoDe(d);
    const k = p >= 25 && dentro < 2 ? dentro / 2 : 1;
    return { mundo, anterior: (mundo + 3) % 4, k: k * k * (3 - 2 * k) };
  };
  const conFundido = (gp: CanvasRenderingContext2D, d: number, pintar: (mundo: number) => void) => {
    const f = fundido(d);
    if (f.k < 1) { pintar(f.anterior); gp.globalAlpha = f.k; }
    pintar(f.mundo);
    gp.globalAlpha = 1;
  };

  m.alPixel((gp) => {
    const v = vista(), W = m.ancho, x = xAve(), k = m.k;
    conFundido(gp, v.d, (mundo) => pintarFondo(gp, mundo, v));
    // Obstáculos
    for (const o of obs) {
      const sx = x + (o.x - v.d);
      if (sx > W + 40 || sx + ANCHO_OBS < -40) continue;
      const mk = Math.floor(o.i / 25) % 4, cy = centroEn(o, v.t), arriba = cy - o.hueco / 2, abajo = cy + o.hueco / 2, col = COLUMNAS[mk], X = Math.round(sx / k) * k;
      const hA = Math.max(1, Math.min(200, Math.round(arriba / k))), hB = Math.max(1, Math.min(200, Math.round((SUELO - abajo) / k)));
      gp.drawImage(col, 0, 200 - hA, 23, hA, X, Math.round(arriba / k) * k - hA * k, ANCHO_OBS, hA * k);
      gp.drawImage(col, 0, 0, 23, hB, X, Math.round(abajo / k) * k, ANCHO_OBS, hB * k);
      const rem = REMATES[mk];
      if (mk === 3) { gp.save(); gp.translate(X + ANCHO_OBS / 2, Math.round(arriba / k) * k); gp.drawImage(rem, -rem.width * k / 2, 0, rem.width * k, rem.height * k); gp.restore(); gp.save(); gp.translate(X + ANCHO_OBS / 2, Math.round(abajo / k) * k); gp.scale(1, -1); gp.drawImage(rem, -rem.width * k / 2, 0, rem.width * k, rem.height * k); gp.restore(); }
      else { m.sprite(rem, sx + ANCHO_OBS / 2, arriba - rem.height * k / 2); m.sprite(rem, sx + ANCHO_OBS / 2, abajo + rem.height * k / 2); }
      if (o.flor && !o.florTomada) m.sprite(FLOR, sx + ANCHO_OBS / 2, cy + Math.round(Math.sin(v.t * 3 + o.i) * 1.5) * k, 2);
      if (o.viento) { gp.fillStyle = 'rgba(255,255,255,.4)'; for (let q = 0; q < 7; q++) { const x0 = sx - SEPARACION * 0.5 + q * 30, y0 = ((v.t * 260 * Math.sign(o.viento) + q * 80) % 600 + 600) % 600; gp.fillRect(Math.round(x0 / k) * k, Math.round(y0 / k) * k, k, 10 * k); } }
    }
    // Suelo que corre
    conFundido(gp, v.d, (mundo) => pintarSuelo(gp, mundo, v.d));
    // Fantasma del líder, turbo y el colibrí (gira según su velocidad y bate las alas)
    const fa = fantasmaEn(v.t, v.d);
    const cuadroAla = (t: number, aleteo: number) => Math.floor(t * (t - aleteo < 0.25 ? 24 : 12)) % 3;
    if (fa && !fa.cayo) { gp.globalAlpha = 0.4; m.sprite(AVE[cuadroAla(v.t, v.t)], fa.sx, fa.y, 1); gp.globalAlpha = 1; }
    if (v.t < turboHasta) { gp.fillStyle = 'rgba(255,210,60,.35)'; gp.beginPath(); gp.arc(x, v.y, (30 + Math.round(Math.sin(v.t * 20)) * 4), 0, Math.PI * 2); gp.fill(); }
    m.sprite(girado(AVE[cuadroAla(v.t, v.aleteo)], v.giro * 0.75), x, v.y);
  });

  // Encima, nítidos: el nombre del fantasma (o dónde cayó)
  const encima = (g: CanvasRenderingContext2D, d: number, t: number) => {
    const fa = fantasmaEn(t, d);
    if (!fa) return;
    if (!fa.cayo) m.rotulo(c.fantasma!.nombre, fa.sx, fa.y - 32, 16, 'rgba(255,255,255,.8)');
    else if (fa.sx > -40 && fa.sx < m.ancho + 40) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([8, 8]); g.lineWidth = 2; g.beginPath(); g.moveTo(fa.sx, 0); g.lineTo(fa.sx, SUELO); g.stroke(); g.setLineDash([]); m.rotulo(`Aquí cayó ${c.fantasma!.nombre}`, fa.sx, 40, 16); }
  };

  m.alDibujar((g) => {
    const v = vista();
    encima(g, v.d, v.t);
    if (fase === 'repeticion' || fase === 'fin') {
      // Repetición: el último segundo y medio a media velocidad, con el punto del choque marcado
      g.fillStyle = 'rgba(14,20,36,.25)'; g.fillRect(0, 0, m.ancho, ALTO);
      if (choqueEn && v.k > 0.85) { g.strokeStyle = '#ff2e4d'; g.lineWidth = 4; g.beginPath(); g.arc(choqueEn.x, choqueEn.y, 26 + Math.sin(v.real * 12) * 4, 0, Math.PI * 2); g.stroke(); }
      m.rotulo('REPETICIÓN', m.ancho / 2, 70, 30, '#ffcf4a');
      if (v.real >= 3.2 && fase === 'repeticion') terminarORevivir();
      return;
    }
    const t = m.tiempo;
    m.rotulo(String(huecos), m.ancho / 2, 92, 76);
    if (multiplicador() > 1) m.rotulo(`×${multiplicador()}`, m.ancho / 2 + 70, 60, 30, '#ffcf4a');
    if (fase === 'espera') {
      m.rotulo('Toca, haz clic o pulsa Espacio para aletear', m.ancho / 2, ALTO / 2 + 90, Math.round(Math.min(34, m.ancho / 18)));
      m.rotulo(`Traje: ${traje.nombre}${record ? ` · Récord: ${record}` : ''}`, m.ancho / 2, ALTO / 2 + 140, 22, '#fff6c9');
    }
  });

  let terminado = false;
  function terminarORevivir() {
    if (c.libre) {
      // Modo libre: vuelves al centro del próximo hueco y sigues
      const o = obs.find((p) => !p.pasado) ?? obs[obs.length - 1];
      yo.y = centroEn(o, m.tiempo); yo.vy = 0; yo.d = Math.max(yo.d, o.x - 220); fase = 'espera'; choqueEn = null;
      return;
    }
    if (terminado) return;
    terminado = true; fase = 'fin';
    musica.parar(); m.detener();
    const medalla = MEDALLAS.find(([, n]) => huecos >= n);
    const nuevoRecord = huecos > record;
    try { if (nuevoRecord) localStorage.setItem(REG, String(huecos)); } catch { /* sin almacenamiento */ }
    const desbloqueado = nuevoRecord ? TRAJES.find((x) => x.desde > record && x.desde <= huecos) : undefined;
    c.alTerminar({
      puntaje: puntos,
      lineas: [
        ['Huecos', `${huecos}${nuevoRecord && record ? ' · ¡récord personal!' : ''}`], ['Medalla', medalla ? medalla[0] : '—'],
        ['Pasadas al ras', String(ras)], ['Flores de néctar', `${flores} (${turbos} ${turbos === 1 ? 'turbo' : 'turbos'})`],
        ['Mejor racha de precisión', String(mejorRacha)], ['Mundo alcanzado', `${Math.floor(huecos / 25) + 1}: ${MUNDOS[Math.floor(huecos / 25) % 4].nombre}`],
        ...(desbloqueado ? [['Traje nuevo', desbloqueado.nombre] as [string, string]] : []),
      ],
      detalle: { huecos, ras, flores, turbos, racha: mejorRacha, medalla: medalla?.[0] ?? null, seg: Math.round(m.tiempo - inicioVuelo), ruta: ruta.final() },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__colibri = () => ({ fase, puntos, huecos, ras, flores, turbos, racha, y: Math.round(yo.y), d: Math.round(yo.d), mundo: mundoActual, terminado, sig: obs.filter((o) => !o.pasado).slice(0, 2).map((o) => ({ i: o.i, x: o.x, c: Math.round(centroEn(o, m.tiempo)), h: Math.round(o.hueco), v: o.viento })), choque: choqueEn });
  return {
    empezar() { m.empezar(); musica.acordes(MUNDOS[0].acordes); if (bot) aletear(); },
    destruir() { musica.parar(); m.destruir(); },
  };
}
