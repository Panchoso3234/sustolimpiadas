import { generador } from '../../nucleo/azar';
import { grabadora } from '../fantasma';
import type { Contexto, Partida } from '../marco';
import * as THREE from 'three';
import { crearMotor2D, crearMusica, piloto, texturaBrillo, texturaDe } from './motor2d';

// Vuelo Colibrí (29-10): un solo botón. Cada toque es un aleteo; la gravedad te baja. Pasa por los huecos entre los pares de
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
  const m = crearMotor2D(c, 'colibri', { fondo: '#bfe3ff', tres: true });
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

  // ── Dibujo ──
  const nubes = Array.from({ length: 9 }, (_, i) => ({ x: (i * 397) % 2400, y: 60 + ((i * 131) % 220), s: 0.6 + ((i * 7) % 5) / 6 }));
  const cerros = (semilla: number, alturaBase: number, var1: number) => Array.from({ length: 64 }, (_, i) => alturaBase - Math.abs(Math.sin(i * 0.9 + semilla) * var1 + Math.sin(i * 0.37 + semilla * 2) * var1 * 0.6));
  const capas = MUNDOS.map((_, k) => ({ lejos: cerros(k * 3.1, 470, 120), medio: cerros(k * 5.7 + 1, 540, 70), cerca: cerros(k * 2.3 + 4, 610, 40) }));
  const dibujarCapa = (g: CanvasRenderingContext2D, alturas: number[], desplaz: number, color: string, paso = 64) => {
    g.fillStyle = color; g.beginPath(); g.moveTo(0, ALTO);
    const n = alturas.length, off = ((desplaz % (paso * n)) + paso * n) % (paso * n), ini = Math.floor(off / paso);
    for (let k = 0; k <= Math.ceil(m.ancho / paso) + 1; k++) g.lineTo(k * paso - (off % paso), alturas[(ini + k) % n]);
    g.lineTo(m.ancho, ALTO); g.closePath(); g.fill();
  };
  const mundoDe = (d: number) => Math.floor(Math.max(0, (d - PRIMERO) / SEPARACION + 0.5) / 25) % 4;
  const fondo = (g: CanvasRenderingContext2D, d: number, t: number) => {
    const w = MUNDOS[mundoDe(d)], k = mundoDe(d), cielo = g.createLinearGradient(0, 0, 0, SUELO);
    cielo.addColorStop(0, w.cielo[0]); cielo.addColorStop(0.55, w.cielo[1]); cielo.addColorStop(1, w.cielo[2]);
    g.fillStyle = cielo; g.fillRect(0, 0, m.ancho, ALTO);
    if (k === 3) {
      // Estrellas y aurora que ondula
      g.fillStyle = '#ffffff';
      for (let s = 0; s < 70; s++) { g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + s)); g.fillRect((s * 173 - d * 0.02) % m.ancho < 0 ? 0 : ((s * 173 - d * 0.02) % m.ancho + m.ancho) % m.ancho, (s * 61) % 330, 2, 2); }
      for (let b = 0; b < 3; b++) {
        const gr = g.createLinearGradient(0, 60, 0, 330); gr.addColorStop(0, 'rgba(124,255,203,0)'); gr.addColorStop(0.5, b === 1 ? 'rgba(180,107,255,.35)' : 'rgba(124,255,203,.35)'); gr.addColorStop(1, 'rgba(124,255,203,0)');
        g.globalAlpha = 1; g.fillStyle = gr; g.beginPath(); g.moveTo(0, 330);
        for (let x = 0; x <= m.ancho; x += 30) g.lineTo(x, 120 + b * 50 + Math.sin(x * 0.006 + t * 0.6 + b) * 50);
        g.lineTo(m.ancho, 330); g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    } else {
      // Sol (o sol de atardecer) y nubes
      g.fillStyle = k === 2 ? 'rgba(255,190,120,.9)' : 'rgba(255,250,220,.85)';
      g.beginPath(); g.arc(m.ancho * 0.78, k === 2 ? 360 : 130, k === 2 ? 70 : 46, 0, Math.PI * 2); g.fill();
      for (const n of nubes) {
        const x = ((n.x - d * 0.06) % (m.ancho + 300) + m.ancho + 300) % (m.ancho + 300) - 150;
        g.fillStyle = k === 2 ? 'rgba(255,180,190,.55)' : 'rgba(255,255,255,.8)';
        g.beginPath(); g.ellipse(x, n.y, 70 * n.s, 22 * n.s, 0, 0, Math.PI * 2); g.ellipse(x + 40 * n.s, n.y - 12 * n.s, 46 * n.s, 22 * n.s, 0, 0, Math.PI * 2); g.ellipse(x - 38 * n.s, n.y - 6 * n.s, 40 * n.s, 18 * n.s, 0, 0, Math.PI * 2); g.fill();
      }
    }
    dibujarCapa(g, capas[k].lejos, d * 0.12, w.lejos);
    dibujarCapa(g, capas[k].medio, d * 0.3, w.medio, 48);
    if (k === 2) {
      // Edificios con ventanas encendidas
      for (let b = 0; b < 30; b++) {
        const bw = 60 + ((b * 37) % 50), bh = 120 + ((b * 71) % 170), x = ((b * 113 - d * 0.5) % 3400 + 3400) % 3400 - 200;
        if (x > m.ancho) continue;
        g.fillStyle = w.cerca; g.fillRect(x, SUELO - bh, bw, bh);
        g.fillStyle = 'rgba(255,214,120,.75)';
        for (let fy = SUELO - bh + 12; fy < SUELO - 14; fy += 20) for (let fx = x + 8; fx < x + bw - 10; fx += 16) if (((fx * 7 + fy * 3 + b) % 5) > 1) g.fillRect(fx, fy, 7, 9);
      }
    } else dibujarCapa(g, capas[k].cerca, d * 0.55, w.cerca, 40);
    // Suelo con textura que corre
    const sg = g.createLinearGradient(0, SUELO, 0, ALTO); sg.addColorStop(0, w.suelo[0]); sg.addColorStop(1, w.suelo[1]);
    g.fillStyle = sg; g.fillRect(0, SUELO, m.ancho, ALTO - SUELO);
    g.fillStyle = 'rgba(0,0,0,.12)';
    for (let x = -((d) % 36); x < m.ancho; x += 36) g.fillRect(x, SUELO + 8, 18, 4);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, SUELO, m.ancho, 4);
  };
  const obstaculo = (g: CanvasRenderingContext2D, o: Obstaculo, sx: number, cy: number) => {
    const k = Math.floor(o.i / 25) % 4, w = MUNDOS[k], arriba = cy - o.hueco / 2, abajo = cy + o.hueco / 2;
    const cuerpo = g.createLinearGradient(sx, 0, sx + ANCHO_OBS, 0);
    cuerpo.addColorStop(0, w.obs[2]); cuerpo.addColorStop(0.35, w.obs[1]); cuerpo.addColorStop(1, w.obs[0]);
    g.globalAlpha = k === 3 ? 0.88 : 1;
    g.fillStyle = cuerpo;
    g.fillRect(sx, -10, ANCHO_OBS, arriba + 10); g.fillRect(sx, abajo, ANCHO_OBS, SUELO - abajo);
    // Remate de cada pieza según el mundo: corteza, estratos de roca, cornisa o filo de hielo
    g.fillStyle = w.obs[2];
    if (k === 0) { g.fillRect(sx - 6, arriba - 24, ANCHO_OBS + 12, 24); g.fillRect(sx - 6, abajo, ANCHO_OBS + 12, 24); g.fillStyle = '#4f8f3c'; g.fillRect(sx - 6, abajo - 6, ANCHO_OBS + 12, 8); g.fillRect(sx - 6, arriba - 2, ANCHO_OBS + 12, 6); g.fillStyle = 'rgba(0,0,0,.15)'; for (let yy = abajo + 40; yy < SUELO; yy += 34) g.fillRect(sx + 14, yy, ANCHO_OBS - 28, 3); for (let yy = arriba - 40; yy > 0; yy -= 34) g.fillRect(sx + 14, yy, ANCHO_OBS - 28, 3); }
    else if (k === 1) { g.fillStyle = 'rgba(80,30,10,.18)'; for (let yy = abajo + 18; yy < SUELO; yy += 22) g.fillRect(sx, yy, ANCHO_OBS, 6); for (let yy = arriba - 18; yy > 0; yy -= 22) g.fillRect(sx, yy, ANCHO_OBS, 6); g.fillStyle = w.obs[2]; g.beginPath(); g.moveTo(sx - 8, arriba); g.lineTo(sx + ANCHO_OBS + 8, arriba); g.lineTo(sx + ANCHO_OBS - 10, arriba - 22); g.lineTo(sx + 12, arriba - 18); g.fill(); g.beginPath(); g.moveTo(sx - 8, abajo); g.lineTo(sx + ANCHO_OBS + 8, abajo); g.lineTo(sx + ANCHO_OBS - 14, abajo + 20); g.lineTo(sx + 8, abajo + 24); g.fill(); }
    else if (k === 2) { g.fillRect(sx - 8, arriba - 16, ANCHO_OBS + 16, 16); g.fillRect(sx - 8, abajo, ANCHO_OBS + 16, 16); g.fillStyle = 'rgba(255,214,120,.7)'; for (let yy = abajo + 30; yy < SUELO - 10; yy += 26) for (let xx = sx + 12; xx < sx + ANCHO_OBS - 14; xx += 22) g.fillRect(xx, yy, 10, 12); for (let yy = arriba - 40; yy > 0; yy -= 26) for (let xx = sx + 12; xx < sx + ANCHO_OBS - 14; xx += 22) g.fillRect(xx, yy, 10, 12); }
    else { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(sx, arriba); g.lineTo(sx + ANCHO_OBS / 2, arriba + 26); g.lineTo(sx + ANCHO_OBS, arriba); g.fill(); g.beginPath(); g.moveTo(sx, abajo); g.lineTo(sx + ANCHO_OBS / 2, abajo - 26); g.lineTo(sx + ANCHO_OBS, abajo); g.fill(); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(sx + 10, 0, 8, arriba); g.fillRect(sx + 10, abajo, 8, SUELO - abajo); }
    g.globalAlpha = 1;
    // Viento: corrientes que suben o bajan
    if (o.viento) {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
      for (let s = 0; s < 7; s++) { const x0 = sx - SEPARACION * 0.5 + s * 30, fase = ((m.tiempo * 260 * Math.sign(o.viento) + s * 80) % 600 + 600) % 600; g.beginPath(); g.moveTo(x0, fase); g.lineTo(x0, fase + 40 * -Math.sign(o.viento)); g.stroke(); }
    }
    // Flor de néctar en el hueco
    if (o.flor && !o.florTomada) {
      const fx = sx + ANCHO_OBS / 2, fy = cy + Math.sin(m.tiempo * 3 + o.i) * 5;
      for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2 + m.tiempo; g.fillStyle = '#ff8fc8'; g.beginPath(); g.ellipse(fx + Math.cos(a) * 9, fy + Math.sin(a) * 9, 8, 5, a, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#ffd23c'; g.beginPath(); g.arc(fx, fy, 6, 0, Math.PI * 2); g.fill();
    }
  };
  const ave = (g: CanvasRenderingContext2D, x: number, y: number, giro: number, aleteo: number, t: number, fantasma = false) => {
    g.save(); g.translate(x, y); g.rotate(giro * 0.75);
    if (fantasma) g.globalAlpha = 0.35;
    const [c1, c2] = traje.nombre === 'Arcoíris' ? [`hsl(${(t * 120) % 360} 85% 60%)`, `hsl(${(t * 120 + 120) % 360} 85% 45%)`] : traje.cuerpo;
    // Alas: un borrón que bate rápido (más rápido justo después de aletear)
    const bate = Math.sin(t * (t - aleteo < 0.25 ? 70 : 38)), ala = g.createLinearGradient(0, -20, 0, 6);
    ala.addColorStop(0, 'rgba(255,255,255,.1)'); ala.addColorStop(1, traje.ala);
    g.fillStyle = ala; g.globalAlpha = (fantasma ? 0.3 : 0.75);
    g.beginPath(); g.ellipse(-2, -6, 8, 22 * Math.abs(bate) + 4, -0.5 + bate * 0.3, 0, Math.PI * 2); g.fill();
    g.globalAlpha = fantasma ? 0.35 : 1;
    // Cola, cuerpo, garganta, ojo y pico largo
    g.fillStyle = c2; g.beginPath(); g.moveTo(-14, 2); g.lineTo(-30, -4); g.lineTo(-30, 8); g.closePath(); g.fill();
    const cuerpo = g.createLinearGradient(-14, -10, 14, 10); cuerpo.addColorStop(0, c1); cuerpo.addColorStop(1, c2);
    g.fillStyle = cuerpo; g.beginPath(); g.ellipse(0, 0, 17, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = traje.garganta; g.beginPath(); g.ellipse(9, 4, 7, 5, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(9, -3, 3.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0e1424'; g.beginPath(); g.arc(10, -3, 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(15, -1); g.lineTo(36, 1); g.stroke();
    g.restore();
    g.globalAlpha = 1;
  };
  const textoGrande = (g: CanvasRenderingContext2D, texto: string, x: number, y: number, tam: number, color = '#ffffff') => {
    g.font = `900 ${tam}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = tam * 0.16; g.strokeStyle = 'rgba(14,20,36,.8)'; g.strokeText(texto, x, y); g.fillStyle = color; g.fillText(texto, x, y);
  };
  const escena = (g: CanvasRenderingContext2D, d: number, t: number, y: number, giro: number, aleteo: number) => {
    fondo(g, d, t);
    const x = xAve();
    for (const o of obs) { const sx = x + (o.x - d); if (sx < m.ancho + 40 && sx + ANCHO_OBS > -40) obstaculo(g, o, sx, centroEn(o, t)); }
    // Fantasma del líder: su colibrí transparente a su altura (y dónde cayó)
    if (lider && fase !== 'espera') {
      const tt = t - inicioVuelo, n = lider.ruta.length / 3, k = tt / lider.paso;
      if (k < n - 1) { const a = Math.floor(k), f = k - a, gy = (lider.ruta[a * 3 + 1] * (1 - f) + lider.ruta[a * 3 + 4] * f) * 10, gd = (lider.ruta[a * 3] * (1 - f) + lider.ruta[a * 3 + 3] * f) * 100; ave(g, x + gd - d, gy, 0, t, t, true); g.font = '800 16px Nunito, sans-serif'; g.fillStyle = 'rgba(255,255,255,.7)'; g.textAlign = 'center'; g.fillText(c.fantasma!.nombre, x + gd - d, gy - 30); }
      else { const gd = lider.ruta[(n - 1) * 3] * 100, sx = x + gd - d; if (sx > -40 && sx < m.ancho + 40) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, SUELO); g.stroke(); g.setLineDash([]); g.font = '800 16px Nunito, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.fillText(`Aquí cayó ${c.fantasma!.nombre}`, sx, 40); } }
    }
    if (t < turboHasta) { g.fillStyle = 'rgba(255,210,60,.25)'; g.beginPath(); g.arc(x, y, 30 + Math.sin(t * 20) * 3, 0, Math.PI * 2); g.fill(); }
    ave(g, x, y, giro, aleteo, t);
  };

  // ── Capa 3D: paralaje con capas que solo se desplazan (nada se repinta), obstáculos con volumen y un colibrí iridiscente ──
  const T = m.tres;
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
  if (T) {
    const E = T.escena;
    E.environment = T.entorno(); E.environmentIntensity = 0.35;
    const cielo = new THREE.HemisphereLight(0xffffff, 0x445533, 1.2); E.add(cielo);
    const sol = new THREE.DirectionalLight(0xfff2dd, 2); sol.position.set(0.6, 0.7, 1); E.add(sol);
    // Fondo de cada mundo: cielo, tres cordilleras (o edificios) y suelo, pintados una vez
    const cordillera = (ancho: number, alto: number, color: string, semilla: number, alturaMin: number, variacion: number) => texturaDe(ancho, alto, (cg) => {
      cg.fillStyle = color; cg.beginPath(); cg.moveTo(0, alto);
      for (let x = 0; x <= ancho; x += 8) { const u = (x / ancho) * Math.PI * 2; cg.lineTo(x, alturaMin + variacion * (0.5 + 0.3 * Math.sin(u * 3 + semilla) + 0.2 * Math.sin(u * 7 + semilla * 2) + 0.1 * Math.sin(u * 13 + semilla))); }
      cg.lineTo(ancho, alto); cg.closePath(); cg.fill();
      cg.fillStyle = 'rgba(255,255,255,.06)'; for (let k = 0; k < 40; k++) cg.fillRect((k * 97) % ancho, alturaMin + variacion * 0.8 + ((k * 31) % 60), 30, 2);
    }, true);
    const edificios = (color: string) => texturaDe(1024, 512, (cg) => {
      const rb = generador('edificios');
      let x = 0;
      while (x < 1024) {
        const w = 50 + rb() * 60, h = 160 + rb() * 300;
        cg.fillStyle = color; cg.fillRect(x, 512 - h, w, h);
        for (let fy = 512 - h + 12; fy < 500; fy += 20) for (let fx = x + 8; fx < x + w - 10; fx += 16) if (rb() > 0.35) { cg.fillStyle = rb() > 0.15 ? 'rgba(255,214,120,.85)' : 'rgba(150,200,255,.7)'; cg.fillRect(fx, fy, 7, 9); }
        x += w + 4;
      }
    }, true);
    const cieloDe = (c0: string, c1: string, c2: string) => texturaDe(4, 256, (cg) => { const gr = cg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, c0); gr.addColorStop(0.55, c1); gr.addColorStop(1, c2); cg.fillStyle = gr; cg.fillRect(0, 0, 4, 256); });
    const sueloDe = (c0: string, c1: string) => texturaDe(256, 64, (cg) => { const gr = cg.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, c0); gr.addColorStop(1, c1); cg.fillStyle = gr; cg.fillRect(0, 0, 256, 64); cg.fillStyle = 'rgba(255,255,255,.22)'; cg.fillRect(0, 0, 256, 3); cg.fillStyle = 'rgba(0,0,0,.14)'; for (let x = 0; x < 256; x += 36) cg.fillRect(x, 10, 18, 4); }, true);
    // Las capas se repiten solo a lo ancho: repetir hacia arriba deja una línea en el borde
    const soloAncho = <X extends THREE.Texture>(t: X) => { t.wrapT = THREE.ClampToEdgeWrapping; return t; };
    const fondos = MUNDOS.map((w, k) => ({
      cielo: cieloDe(...w.cielo), suelo: sueloDe(...w.suelo),
      lejos: soloAncho(cordillera(512, 256, w.lejos, k * 3.1, 70, 140)), medio: soloAncho(cordillera(512, 256, w.medio, k * 5.7 + 1, 120, 100)),
      cerca: soloAncho(k === 2 ? edificios(w.cerca) : cordillera(1024, 256, w.cerca, k * 2.3 + 4, 150, 70)),
    }));
    const plano = (z: number, transparente: boolean) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: transparente, depthWrite: !transparente, toneMapped: false })); p.position.z = z; E.add(p); return p; };
    const fCielo = plano(-950, false), fLejos = plano(-900, true), fMedio = plano(-850, true), fCerca = plano(-800, true), fSuelo = plano(300, false);
    // Sol, nubes, estrellas y aurora
    const brillo = (color: THREE.ColorRepresentation, op: number) => new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrillo(), color, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const astro = brillo(0xfff2c0, 0.9); astro.position.z = -940; E.add(astro);
    const texNube = texturaDe(256, 128, (cg) => { cg.fillStyle = '#ffffff'; for (const [x, y, rx, ry] of [[128, 78, 90, 34], [90, 60, 50, 36], [160, 52, 60, 40], [60, 80, 40, 24], [200, 80, 44, 24]]) { cg.beginPath(); cg.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); cg.fill(); } });
    const nubes = Array.from({ length: 8 }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texNube, transparent: true, depthWrite: false, opacity: 0.85 })); s.position.z = -930 + i; E.add(s); return { s, x: (i * 397) % 2400, y: 60 + ((i * 131) % 220), k: 0.6 + ((i * 7) % 5) / 6 }; });
    const geoEstrellas = new THREE.BufferGeometry(), pos: number[] = [];
    for (let k = 0; k < 120; k++) pos.push(((k * 173) % 2600), -((k * 61) % 340), -945);
    geoEstrellas.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const estrellas = new THREE.Points(geoEstrellas, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false })); E.add(estrellas);
    const texAurora = texturaDe(8, 256, (cg) => { const gr = cg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(124,255,203,0)'); gr.addColorStop(0.5, 'rgba(124,255,203,.55)'); gr.addColorStop(1, 'rgba(124,255,203,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, 8, 256); });
    const auroras = [0, 1, 2].map((b) => { const geo = new THREE.PlaneGeometry(1, 1, 40, 1); const me = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texAurora, color: b === 1 ? 0xb46bff : 0x7cffcb, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); me.position.z = -940 + b; E.add(me); return me; });
    // Obstáculos: materiales por mundo
    const corteza = texturaDe(128, 256, (cg) => { cg.fillStyle = '#7a5434'; cg.fillRect(0, 0, 128, 256); const rc = generador('corteza'); for (let k = 0; k < 40; k++) { cg.fillStyle = `rgba(40,24,10,${0.2 + rc() * 0.4})`; const x = rc() * 128; cg.fillRect(x, 0, 2 + rc() * 4, 256); } for (let k = 0; k < 30; k++) { cg.fillStyle = 'rgba(255,230,190,.08)'; cg.fillRect(rc() * 128, rc() * 256, 10, 2); } }, true);
    const estratos = texturaDe(64, 256, (cg) => { const cs = ['#d58a54', '#c47a4e', '#e3a06c', '#b3683e', '#cf8650']; for (let y = 0; y < 256; y += 16) { cg.fillStyle = cs[(y / 16) % 5]; cg.fillRect(0, y, 64, 16); } cg.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < 256; y += 16) cg.fillRect(0, y, 64, 2); }, true);
    const ventanas = texturaDe(128, 128, (cg) => { cg.fillStyle = '#4a5068'; cg.fillRect(0, 0, 128, 128); const rv = generador('ventanas'); for (let y = 8; y < 128; y += 26) for (let x = 10; x < 128; x += 28) { cg.fillStyle = rv() > 0.3 ? '#ffd67a' : '#2a2e40'; cg.fillRect(x, y, 14, 16); } }, true);
    const ventanasLuz = texturaDe(128, 128, (cg) => { cg.fillStyle = '#000000'; cg.fillRect(0, 0, 128, 128); const rv = generador('ventanas'); for (let y = 8; y < 128; y += 26) for (let x = 10; x < 128; x += 28) { cg.fillStyle = rv() > 0.3 ? '#ffc65a' : '#000000'; cg.fillRect(x, y, 14, 16); } }, true);
    const MATS = [
      { cuerpo: new THREE.MeshStandardMaterial({ map: corteza, roughness: 0.92 }), remate: new THREE.MeshStandardMaterial({ color: 0x4a7a2c, roughness: 0.8 }) },
      { cuerpo: new THREE.MeshStandardMaterial({ map: estratos, roughness: 0.95, flatShading: true }), remate: new THREE.MeshStandardMaterial({ color: 0x9a5530, roughness: 0.9, flatShading: true }) },
      { cuerpo: new THREE.MeshStandardMaterial({ map: ventanas, emissiveMap: ventanasLuz, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.6 }), remate: new THREE.MeshStandardMaterial({ color: 0x2e3246, roughness: 0.5, metalness: 0.4 }) },
      { cuerpo: new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.86, emissive: 0x16324a, envMapIntensity: 1.6 }), remate: new THREE.MeshStandardMaterial({ color: 0xe8f7ff, roughness: 0.05, emissive: 0x2a4a6a, envMapIntensity: 2 }) },
    ];
    const pieza = (k: number, alto: number): THREE.BufferGeometry => {
      const geo = k === 0 ? new THREE.CylinderGeometry(ANCHO_OBS / 2, ANCHO_OBS / 2, alto, 16) : k === 1 ? new THREE.CylinderGeometry(ANCHO_OBS / 2 - 2, ANCHO_OBS / 2 + 4, alto, 7) : new THREE.BoxGeometry(ANCHO_OBS, alto, k === 2 ? 80 : 70);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (k === 2 ? 0.75 : 1), uv.getY(i) * (alto / (k === 2 ? 128 : 256)));
      return geo;
    };
    const geoRemate = [new THREE.CylinderGeometry(54, 54, 22, 16), new THREE.CylinderGeometry(60, 52, 22, 7), new THREE.BoxGeometry(110, 16, 92), new THREE.ConeGeometry(46, 30, 4)];
    const geoPetalo = new THREE.SphereGeometry(1, 10, 6).scale(9, 5, 3), geoCentro = new THREE.SphereGeometry(6, 10, 8);
    const matPetalo = new THREE.MeshStandardMaterial({ color: 0xff8fc8, roughness: 0.5, emissive: 0x5a1a3a }), matCentro = new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0x5a4000 });
    const obs3d = new Map<Obstaculo, THREE.Group>();
    const crearObs = (o: Obstaculo) => {
      const k = Math.floor(o.i / 25) % 4, grupo = new THREE.Group(), mt = MATS[k];
      const arriba = o.centro - o.hueco / 2, abajo = o.centro + o.hueco / 2, extra = o.mueve ? o.mueve.amp + 20 : 20;
      const hA = arriba + 200 + extra, hB = SUELO - abajo + 120 + extra;
      const sup = new THREE.Mesh(pieza(k, hA), mt.cuerpo); sup.position.y = -(arriba - hA / 2); grupo.add(sup);
      const inf = new THREE.Mesh(pieza(k, hB), mt.cuerpo); inf.position.y = -(abajo + hB / 2); grupo.add(inf);
      const r1 = new THREE.Mesh(geoRemate[k], mt.remate), r2 = new THREE.Mesh(geoRemate[k], mt.remate);
      r1.position.y = -(arriba - 11); r2.position.y = -(abajo + 11);
      if (k === 3) { r1.position.y = -(arriba + 14); r1.rotation.z = Math.PI; r2.position.y = -(abajo - 14); r1.rotation.y = r2.rotation.y = Math.PI / 4; }
      grupo.add(r1, r2);
      if (o.flor) {
        const flor = new THREE.Group();
        for (let p = 0; p < 5; p++) { const pe = new THREE.Mesh(geoPetalo, matPetalo), a = (p / 5) * Math.PI * 2; pe.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0); pe.rotation.z = a; flor.add(pe); }
        flor.add(new THREE.Mesh(geoCentro, matCentro));
        const b = brillo(0xff8fc8, 0.5); b.scale.setScalar(70); b.position.z = -5; flor.add(b);
        flor.position.set(0, -o.centro, 40); grupo.add(flor); grupo.userData.flor = flor;
      }
      E.add(grupo);
      return grupo;
    };
    // El colibrí: cuerpo y cabeza iridiscentes (cambian de color con el ángulo de la luz), alas que baten con estela
    const crearAve = (fantasma: boolean) => {
      const g3 = new THREE.Group(), mat = (color: string, extra: THREE.MeshPhysicalMaterialParameters = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.15, iridescence: fantasma ? 0 : 1, iridescenceIOR: 1.45, iridescenceThicknessRange: [250, 700], transparent: fantasma, opacity: fantasma ? 0.4 : 1, depthWrite: !fantasma, ...extra });
      const cuerpo = mat(traje.cuerpo[0]), lomo = mat(traje.cuerpo[1]), garganta = mat(traje.garganta, { emissive: traje.garganta, emissiveIntensity: 0.25 });
      const esf = new THREE.SphereGeometry(1, 18, 12);
      const torso = new THREE.Mesh(esf, cuerpo); torso.scale.set(17, 11, 11); g3.add(torso);
      const espalda = new THREE.Mesh(esf, lomo); espalda.scale.set(14, 7, 9); espalda.position.set(-3, 4, 0); g3.add(espalda);
      const cabeza = new THREE.Mesh(esf, cuerpo); cabeza.scale.setScalar(8.5); cabeza.position.set(10, 4, 0); g3.add(cabeza);
      const gola = new THREE.Mesh(esf, garganta); gola.scale.set(7, 5, 8); gola.position.set(11, -2.5, 1); g3.add(gola);
      const ojoB = new THREE.Mesh(esf, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: fantasma, opacity: fantasma ? 0.4 : 1 })); ojoB.scale.setScalar(3.2); ojoB.position.set(13, 6, 6.5); g3.add(ojoB);
      const ojoN = new THREE.Mesh(esf, new THREE.MeshBasicMaterial({ color: 0x0e1424, transparent: fantasma, opacity: fantasma ? 0.4 : 1 })); ojoN.scale.setScalar(1.9); ojoN.position.set(14.2, 6, 8.6); g3.add(ojoN);
      const pico = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.6, 22, 6), mat('#2a2a2a', { iridescence: 0 })); pico.rotation.z = -Math.PI / 2 - 0.08; pico.position.set(28, 3, 0); g3.add(pico);
      const cola = new THREE.Mesh(new THREE.ConeGeometry(5.5, 18, 4), lomo); cola.rotation.z = Math.PI / 2 + 0.15; cola.scale.z = 0.4; cola.position.set(-23, 1, 0); g3.add(cola);
      const forma = new THREE.Shape(); forma.moveTo(0, 0); forma.bezierCurveTo(-6, 10, -8, 22, -2, 30); forma.bezierCurveTo(4, 22, 5, 8, 0, 0);
      const geoAla = new THREE.ShapeGeometry(forma, 8);
      const matAla = new THREE.MeshStandardMaterial({ color: traje.ala, transparent: true, opacity: fantasma ? 0.25 : 0.72, side: THREE.DoubleSide, depthWrite: false, roughness: 0.4 });
      const alas = [1, -1].map((lado) => { const pivote = new THREE.Group(), a = new THREE.Mesh(geoAla, matAla); pivote.position.set(-1, 6, lado * 5); pivote.add(a); g3.add(pivote); return pivote; });
      const estela = brillo(traje.ala, fantasma ? 0.1 : 0.3); estela.scale.set(26, 46, 1); estela.position.set(-2, 18, -4); g3.add(estela);
      E.add(g3);
      return { g3, alas, estela, cuerpo, lomo };
    };
    const ave3d = crearAve(false), fantasma3d = lider ? crearAve(true) : null;
    const aura = brillo(0xffd23c, 0.5); aura.scale.setScalar(80); E.add(aura);
    const poseAve = (a: ReturnType<typeof crearAve>, x: number, y: number, giro: number, aleteo: number, t: number) => {
      a.g3.position.set(x, -y, 100); a.g3.rotation.z = -giro * 0.75;
      const bate = Math.sin(t * (t - aleteo < 0.25 ? 70 : 38));
      a.alas[0].rotation.x = 0.25 + bate * 0.9; a.alas[1].rotation.x = -0.25 - bate * 0.9;
      a.alas[0].rotation.z = a.alas[1].rotation.z = 0.35 + bate * 0.15;
      a.estela.material.opacity = (t - aleteo < 0.25 ? 0.4 : 0.22);
    };
    let mundoVisto = -1;
    m.antes3d(() => {
      const v = vista(), W = m.ancho, x = xAve();
      const k = Math.floor(Math.max(0, (v.d - PRIMERO) / SEPARACION + 0.5) / 25) % 4;
      if (k !== mundoVisto) {
        mundoVisto = k;
        const f = fondos[k];
        (fCielo.material as THREE.MeshBasicMaterial).map = f.cielo; (fLejos.material as THREE.MeshBasicMaterial).map = f.lejos; (fMedio.material as THREE.MeshBasicMaterial).map = f.medio; (fCerca.material as THREE.MeshBasicMaterial).map = f.cerca; (fSuelo.material as THREE.MeshBasicMaterial).map = f.suelo;
        for (const p of [fCielo, fLejos, fMedio, fCerca, fSuelo]) (p.material as THREE.MeshBasicMaterial).needsUpdate = true;
        const luces = [[0xfff2dd, 0x5a7a3a, 1.2, 2], [0xffffff, 0x8a5a3a, 1.3, 2.3], [0xffb0a0, 0x2a1a3a, 0.9, 1.4], [0x9ab8ff, 0x0a1428, 0.7, 1.1]][k];
        cielo.color.setHex(luces[0]); cielo.groundColor.setHex(luces[1]); cielo.intensity = luces[2]; sol.intensity = luces[3];
        sol.position.set(k === 2 ? 1 : 0.6, k === 2 ? 0.25 : 0.7, 1);
        for (const n of nubes) n.s.material.color.setHex(k === 2 ? 0xffb4c0 : 0xffffff);
        astro.material.color.setHex(k === 2 ? 0xffaa66 : k === 3 ? 0xdfe8ff : 0xfff2c0);
      }
      // Capas: cada una se corre a su velocidad (más lejos, más lento)
      const capa = (p: THREE.Mesh, z: number, alto: number, base: number, factor: number, texAncho: number) => {
        p.position.set(W / 2, -(base - alto / 2), z); p.scale.set(W, alto, 1);
        const t = (p.material as THREE.MeshBasicMaterial).map!; t.repeat.set(W / texAncho, 1); t.offset.x = (v.d * factor) / texAncho;
      };
      fCielo.position.set(W / 2, -ALTO / 2, -950); fCielo.scale.set(W, ALTO, 1);
      capa(fLejos, -900, 360, SUELO + 10, 0.12, 900); capa(fMedio, -850, 300, SUELO + 10, 0.3, 700);
      capa(fCerca, -800, k === 2 ? 340 : 230, SUELO + 10, 0.55, k === 2 ? 1400 : 1000);
      capa(fSuelo, 300, ALTO - SUELO, ALTO, 1, 256);
      astro.position.set(W * 0.78, -(k === 2 ? 360 : 130), -940); astro.scale.setScalar(k === 2 ? 260 : k === 3 ? 120 : 190); astro.visible = true;
      for (const n of nubes) { n.s.visible = k !== 3; const nx = ((n.x - v.d * 0.06) % (W + 300) + W + 300) % (W + 300) - 150; n.s.position.set(nx, -n.y, n.s.position.z); n.s.scale.set(200 * n.k, 100 * n.k, 1); }
      estrellas.visible = k === 3; (estrellas.material as THREE.PointsMaterial).opacity = 0.6 + 0.4 * Math.sin(v.t * 2);
      auroras.forEach((a, b) => {
        a.visible = k === 3;
        if (!a.visible) return;
        const p = a.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) { const u = p.getX(i) + 0.5; p.setY(i, (p.getY(i) > 0 ? 0.5 : -0.5) + Math.sin(u * 7 + v.t * 0.6 + b) * 0.25); }
        p.needsUpdate = true;
        a.position.set(W / 2, -(170 + b * 50), -940 + b); a.scale.set(W * 1.1, 200, 1);
      });
      // Obstáculos visibles
      const vistos = new Set<Obstaculo>();
      for (const o of obs) {
        const sx = x + (o.x - v.d);
        if (sx > W + 120 || sx + ANCHO_OBS < -120) continue;
        vistos.add(o);
        let g3 = obs3d.get(o);
        if (!g3) { g3 = crearObs(o); obs3d.set(o, g3); }
        g3.position.set(sx + ANCHO_OBS / 2, -(centroEn(o, v.t) - o.centro), 0);
        const flor = g3.userData.flor as THREE.Group | undefined;
        if (flor) { flor.visible = !o.florTomada; flor.rotation.z = v.t; flor.position.y = -o.centro + Math.sin(v.t * 3 + o.i) * 5; }
      }
      for (const [o, g3] of obs3d) if (!vistos.has(o)) { E.remove(g3); g3.traverse((q) => { const me = q as THREE.Mesh; if (me.isMesh && me.geometry !== geoPetalo && me.geometry !== geoCentro && !(geoRemate as THREE.BufferGeometry[]).includes(me.geometry)) me.geometry.dispose(); const sp = q as THREE.Sprite; if (sp.isSprite) sp.material.dispose(); }); obs3d.delete(o); }
      // Ave, fantasma del líder y turbo
      if (traje.nombre === 'Arcoíris') { ave3d.cuerpo.color.setHSL((v.t * 0.33) % 1, 0.85, 0.6); ave3d.lomo.color.setHSL((v.t * 0.33 + 0.33) % 1, 0.85, 0.45); }
      poseAve(ave3d, x, v.y, v.giro, v.aleteo, v.t);
      if (fantasma3d) { const f = fantasmaEn(v.t, v.d); fantasma3d.g3.visible = !!f && !f.cayo; if (f && !f.cayo) poseAve(fantasma3d, f.sx, f.y, 0, v.t, v.t); }
      aura.visible = v.t < turboHasta; aura.position.set(x, -v.y, 90); aura.scale.setScalar(80 + Math.sin(v.t * 20) * 6);
    });
  }

  // Encima del 3D: las corrientes de viento y el nombre del fantasma (o dónde cayó)
  const encima = (g: CanvasRenderingContext2D, d: number, t: number) => {
    const x = xAve();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
    for (const o of obs) {
      if (!o.viento) continue;
      const sx = x + (o.x - d);
      if (sx > m.ancho + 200 || sx + ANCHO_OBS < -40) continue;
      for (let k = 0; k < 7; k++) { const x0 = sx - SEPARACION * 0.5 + k * 30, y0 = ((t * 260 * Math.sign(o.viento) + k * 80) % 600 + 600) % 600; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y0 + 40 * -Math.sign(o.viento)); g.stroke(); }
    }
    const fa = fantasmaEn(t, d);
    if (!fa) return;
    if (!fa.cayo) m.rotulo(c.fantasma!.nombre, fa.sx, fa.y - 32, 16, 'rgba(255,255,255,.8)');
    else if (fa.sx > -40 && fa.sx < m.ancho + 40) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(fa.sx, 0); g.lineTo(fa.sx, SUELO); g.stroke(); g.setLineDash([]); m.rotulo(`Aquí cayó ${c.fantasma!.nombre}`, fa.sx, 40, 16); }
  };

  m.alDibujar((g) => {
    const v = vista();
    if (T) encima(g, v.d, v.t); else escena(g, v.d, v.t, v.y, v.giro, v.aleteo);
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
    if (t - avisoMundo < 2.2 && avisoMundo) m.rotulo(MUNDOS[mundoActual].nombre, m.ancho / 2, 180, 40, '#fff6c9');
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
