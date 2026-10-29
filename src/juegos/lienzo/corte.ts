import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import * as THREE from 'three';
import { crearMotor2D, crearMusica, piloto, texturaBrillo, texturaDe } from './motor2d';

// Corte Maestro (29-10): fruta lanzada desde abajo y tú la cortas con trazos del dedo o del mouse. Contrarreloj de 90 s
// (el del torneo): cada fruta vale 1, los combos de un mismo trazo suman extra y las bombas restan 10 puntos y 5 segundos.
// En modo libre se elige Zen (sin bombas) o Clásico (3 vidas: cada fruta que se cae cuesta una; una bomba termina todo).
// Las tiradas salen de la semilla: en un duelo los dos reciben exactamente la misma fruta en el mismo momento.

const ALTO = 720, GRAVEDAD = 1150, DURACION = 90;
interface TipoFruta { nombre: string; r: number; piel: [string, string]; pulpa: string; centro: string; jugo: string; semillas: string; dibujo: 'redonda' | 'sandia' | 'pina' | 'frutilla' | 'kiwi' | 'limon' | 'coco' | 'platano' }
const FRUTAS: TipoFruta[] = [
  { nombre: 'Sandía', r: 46, piel: ['#3fa34d', '#1e5c2a'], pulpa: '#ff4d5e', centro: '#ff7a85', jugo: '#ff3b55', semillas: '#2a1a1a', dibujo: 'sandia' },
  { nombre: 'Naranja', r: 32, piel: ['#ffa53a', '#d9640f'], pulpa: '#ffb347', centro: '#ffd38a', jugo: '#ff9a1f', semillas: '#fff1c9', dibujo: 'redonda' },
  { nombre: 'Manzana roja', r: 31, piel: ['#ff4b4b', '#a3121f'], pulpa: '#fff4d6', centro: '#fffbea', jugo: '#ffe9a8', semillas: '#5a3416', dibujo: 'redonda' },
  { nombre: 'Manzana verde', r: 31, piel: ['#9fe05a', '#4f9a1f'], pulpa: '#f6ffd6', centro: '#ffffff', jugo: '#d9ff8a', semillas: '#5a3416', dibujo: 'redonda' },
  { nombre: 'Limón', r: 26, piel: ['#fff25a', '#d8c20f'], pulpa: '#fff7a0', centro: '#fffbd0', jugo: '#fff04a', semillas: '#fff9d8', dibujo: 'limon' },
  { nombre: 'Kiwi', r: 27, piel: ['#a07848', '#5e4120'], pulpa: '#7fcf3a', centro: '#f2ffd8', jugo: '#9be04a', semillas: '#1a1a12', dibujo: 'kiwi' },
  { nombre: 'Durazno', r: 30, piel: ['#ffb38a', '#e8624a'], pulpa: '#ffc76b', centro: '#b0541f', jugo: '#ffb05a', semillas: '#8a3d14', dibujo: 'redonda' },
  { nombre: 'Coco', r: 34, piel: ['#8a5a32', '#4a2c14'], pulpa: '#fffaf0', centro: '#ffffff', jugo: '#f4f1e8', semillas: '#fffaf0', dibujo: 'coco' },
  { nombre: 'Piña', r: 38, piel: ['#f2b630', '#a8701a'], pulpa: '#ffe26b', centro: '#fff3b0', jugo: '#ffe04a', semillas: '#e8c64a', dibujo: 'pina' },
  { nombre: 'Frutilla', r: 24, piel: ['#ff3b4f', '#b0102a'], pulpa: '#ff8a95', centro: '#ffd1d6', jugo: '#ff2e4a', semillas: '#ffe58a', dibujo: 'frutilla' },
  { nombre: 'Mango', r: 33, piel: ['#ffcf3a', '#e85a2a'], pulpa: '#ffb52e', centro: '#ffd56b', jugo: '#ffab1f', semillas: '#e89a1f', dibujo: 'redonda' },
  { nombre: 'Ciruela', r: 26, piel: ['#8a3db0', '#3e1460'], pulpa: '#ffcf5a', centro: '#ffe69a', jugo: '#c04ad0', semillas: '#6a2a10', dibujo: 'redonda' },
];
const PODERES = { congelar: { nombre: 'Congelar', color: '#7fd8ff' }, frenesi: { nombre: 'Frenesí', color: '#ff9a3a' }, doble: { nombre: 'Doble puntaje', color: '#ffd23c' } } as const;
type Poder = keyof typeof PODERES;
const HOJAS = [
  { nombre: 'Clásica', logro: '', color: ['#ffffff', '#cfe6ff'] },
  { nombre: 'Fuego', logro: 'un combo de 5', color: ['#fff3a0', '#ff6a1a'] },
  { nombre: 'Arcoíris', logro: '300 puntos en una partida', color: ['#ffffff', '#ff5f6d'] },
];
const REG = 'susto.corte';

interface Cosa {
  id: number; tipo: 'fruta' | 'bomba' | 'dorada' | 'poder'; fruta: number; poder?: Poder;
  x: number; y: number; vx: number; vy: number; giro: number; vgiro: number; r: number;
  viva: boolean; golpes: number; quietaHasta: number; ultimoGolpe: number;
}
interface Mitad { x: number; y: number; vx: number; vy: number; giro: number; vgiro: number; corte: number; lado: 1 | -1; fruta: number; r: number; vida: number }
interface Mancha { x: number; y: number; r: number; color: string; vida: number; gotas: { dx: number; dy: number; r: number }[] }

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'corte', { fondo: '#2a1c14', tres: true });
  const musica = crearMusica(m.mesa, 124);
  musica.acordes([[52, 55, 59], [48, 52, 55], [50, 53, 57], [47, 50, 54]]);
  const bot = piloto();
  let guardado = { hoja: 0, fuego: false, arcoiris: false, record: 0 };
  try { guardado = { ...guardado, ...JSON.parse(localStorage.getItem(REG) || '{}') }; } catch { /* sin almacenamiento */ }
  const hojas = HOJAS.filter((_, i) => i === 0 || (i === 1 && guardado.fuego) || (i === 2 && guardado.arcoiris));
  let hoja = Math.min(guardado.hoja, hojas.length - 1);

  // Modo: en el torneo siempre contrarreloj; en libre se elige al tocar la pantalla de inicio
  let modo: 'contrarreloj' | 'zen' | 'clasico' = c.libre ? 'zen' : 'contrarreloj';
  let fase: 'inicio' | 'juego' | 'fin' = c.libre && !bot ? 'inicio' : 'juego';

  // ── Las tiradas salen de la semilla ──
  const r = generador(`${c.semilla}|corte`);
  const cosas: Cosa[] = [], mitades: Mitad[] = [], manchas: Mancha[] = [];
  let ids = 0, proximaOla = 1.2, olas = 0, proximaDorada = 22 + r() * 14, proximoPoder = 14 + r() * 10;
  const lanzar = (tipo: Cosa['tipo'], x: number, apice: number, vx: number, extra: Partial<Cosa> = {}) => {
    const fruta = tipo === 'fruta' ? Math.floor(r() * FRUTAS.length) : tipo === 'poder' ? -1 : 2;
    const rad = tipo === 'bomba' ? 30 : tipo === 'dorada' ? 40 : tipo === 'poder' ? 30 : FRUTAS[fruta].r;
    cosas.push({ id: ids++, tipo, fruta, x, y: ALTO + rad + 10, vx, vy: -Math.sqrt(2 * GRAVEDAD * (ALTO + rad + 10 - apice)), giro: r() * 6, vgiro: (r() - 0.5) * 5, r: rad, viva: true, golpes: 0, quietaHasta: 0, ultimoGolpe: -1, ...extra });
    lanzadas += tipo === 'fruta' ? 1 : 0;
  };
  // Coreografías: sueltas, abanico, lluvia, cruce de lado a lado y torre de 6 (para el combo perfecto)
  const ola = (t: number) => {
    olas++;
    const W = m.ancho, dific = Math.min(1, t / 70), bombas = modo !== 'zen' ? (r() < 0.25 + dific * 0.35 ? 1 + (r() < dific * 0.4 ? 1 : 0) : 0) : 0;
    const tipo = olas < 3 ? 'sueltas' : (['sueltas', 'sueltas', 'abanico', 'lluvia', 'cruce', 'torre'] as const)[Math.floor(r() * 6)];
    const haciaCentro = (x: number) => (W / 2 - x) * (0.25 + r() * 0.3);
    if (tipo === 'sueltas') { const n = 1 + Math.floor(r() * (2 + dific * 3)); for (let i = 0; i < n; i++) { const x = W * (0.15 + r() * 0.7); lanzar('fruta', x, 90 + r() * 260, haciaCentro(x)); } }
    else if (tipo === 'abanico') { const n = 5, x = W * (0.35 + r() * 0.3); for (let i = 0; i < n; i++) lanzar('fruta', x, 110 + Math.abs(i - 2) * 50, (i - 2) * 150); }
    else if (tipo === 'lluvia') { const n = 6; for (let i = 0; i < n; i++) esperas.push({ t: t + i * 0.22, f: () => { const x = W * (0.12 + (i / (n - 1)) * 0.76); lanzar('fruta', x, 120 + r() * 160, haciaCentro(x) * 0.4); } }); }
    else if (tipo === 'cruce') { const izq = r() < 0.5; for (let i = 0; i < 4; i++) esperas.push({ t: t + i * 0.3, f: () => { const x = izq ? W * 0.04 : W * 0.96; lanzar('fruta', x, 160 + r() * 140, (izq ? 1 : -1) * W * 0.55); } }); }
    else { const x = W * (0.3 + r() * 0.4); for (let i = 0; i < 6; i++) lanzar('fruta', x, 120 + i * 62, 0); }
    for (let b = 0; b < bombas; b++) { const x = W * (0.2 + r() * 0.6); lanzar('bomba', x, 140 + r() * 220, haciaCentro(x)); }
    return Math.max(1.05, 2.3 - dific * 1.1) + (tipo === 'lluvia' || tipo === 'cruce' ? 0.5 : 0);
  };
  const esperas: { t: number; f: () => void }[] = [];

  // ── Estado ──
  let puntos = 0, lanzadas = 0, cortadas = 0, perdidas = 0, vidas = 3, bombasCortadas = 0, mejorCombo = 0, precisos = 0, golpesDorada = 0;
  let tiempoLimite = DURACION, inicio = 0, fin = '';
  const porTipo = FRUTAS.map(() => 0);
  const poderes: Record<Poder, number> = { congelar: -1, frenesi: -1, doble: -1 };
  let combo = 0, ultimoCorte = -9, comboX = 0, comboY = 0, trazoAbajo = false;
  const activo = (p: Poder) => m.tiempo < poderes[p];
  const sumar = (p: number) => { const v = p * (activo('doble') ? 2 : 1); puntos += v; return v; };

  // ── El corte ──
  const distSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, k = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    return Math.hypot(px - (ax + dx * k), py - (ay + dy * k));
  };
  const cerrarCombo = () => {
    if (combo >= 3) {
      const bono = combo >= 5 ? 10 : combo === 4 ? 5 : 3;
      sumar(bono); mejorCombo = Math.max(mejorCombo, combo);
      m.efectos.flotar(comboX, comboY - 50, `¡Combo de ${combo}! +${bono}`, '#ffcf4a', 40);
      m.efectos.temblar(6);
      for (let i = 0; i < combo; i++) m.mesa.sonido.tono(523 * Math.pow(1.122, i), 0.12, 'triangle', 0.07, i * 0.05);
      if (combo >= 5 && !guardado.fuego) { guardado.fuego = true; m.mesa.hud.aviso('Hoja nueva: Fuego', 'oro', 1.6); }
    }
    mejorCombo = Math.max(mejorCombo, combo);
    combo = 0;
  };
  function cortar(ax: number, ay: number, bx: number, by: number) {
    if (fase !== 'juego') return;
    const largo = Math.hypot(bx - ax, by - ay);
    if (largo < 2.5) return; // un trazo lento no corta
    const ang = Math.atan2(by - ay, bx - ax), t = m.tiempo;
    for (const o of cosas) {
      if (!o.viva || distSeg(o.x, o.y, ax, ay, bx, by) > o.r * 0.9) continue;
      if (o.tipo === 'bomba') { explotar(o); continue; }
      if (o.tipo === 'dorada') {
        if (t - o.ultimoGolpe < 0.07) continue;
        o.ultimoGolpe = t; o.golpes++; golpesDorada++;
        if (!o.quietaHasta) { o.quietaHasta = t + 3; o.vx = 0; o.vy = 0; }
        const v = sumar(1);
        m.efectos.flotar(o.x + (r() - 0.5) * 60, o.y - 40, `+${v}`, '#ffd23c', 28);
        m.efectos.chispas(o.x, o.y, ['#ffd23c', '#fff6c9'], 8, 260);
        m.mesa.sonido.tono(700 + o.golpes * 40, 0.06, 'square', 0.04);
        if (o.golpes >= 15) reventarDorada(o);
        continue;
      }
      o.viva = false;
      if (o.tipo === 'poder') { activar(o.poder!, o.x, o.y); partir(o, ang); continue; }
      cortadas++; porTipo[o.fruta]++;
      const preciso = distSeg(o.x, o.y, ax, ay, bx, by) < o.r * 0.22;
      const v = sumar(preciso ? 2 : 1);
      if (preciso) { precisos++; m.efectos.flotar(o.x, o.y - o.r - 24, `¡Preciso! +${v}`, '#7cffcb', 24); }
      else m.efectos.flotar(o.x, o.y - o.r - 10, `+${v}`, '#fff6c9', 26);
      partir(o, ang);
      combo = t - ultimoCorte < 0.2 || (trazoAbajo && combo > 0) ? combo + 1 : 1;
      ultimoCorte = t; comboX = o.x; comboY = o.y;
      m.mesa.sonido.tono(320 + r() * 80, 0.09, 'sawtooth', 0.05); m.mesa.sonido.tono(1200 + combo * 90, 0.05, 'triangle', 0.04, 0.01);
    }
  }
  const partir = (o: Cosa, ang: number) => {
    const n = Math.sin(ang), k = -Math.cos(ang), fruta = o.tipo === 'poder' ? -1 : o.fruta;
    for (const lado of [1, -1] as const) mitades.push({ x: o.x + n * lado * 6, y: o.y + k * lado * 6, vx: o.vx * 0.6 + n * lado * 120, vy: Math.min(o.vy, 0) * 0.4 + k * lado * 120 - 60, giro: ang, vgiro: lado * (2 + r() * 2), corte: ang, lado, fruta, r: o.r, vida: 0 });
    const color = fruta >= 0 ? FRUTAS[fruta].jugo : '#ffe04a';
    m.efectos.chispas(o.x, o.y, [color, color, '#ffffff'], 16, 340, { forma: 'gota', gravedad: 900, tam: 4 });
    m.efectos.congelar(25);
    if (!m.calma && manchas.length < 14) manchas.push({ x: o.x, y: o.y, r: o.r * (0.9 + r() * 0.5), color, vida: 0, gotas: Array.from({ length: 7 }, () => ({ dx: (r() - 0.5) * o.r * 3, dy: (r() - 0.5) * o.r * 3, r: 4 + r() * o.r * 0.35 })) });
  };
  const explotar = (o: Cosa) => {
    o.viva = false; bombasCortadas++;
    m.efectos.temblar(26); m.efectos.congelar(120);
    m.efectos.chispas(o.x, o.y, ['#ffffff', '#ffd23c', '#ff6a1a', '#3a3a3a'], 40, 620);
    m.mesa.sonido.tono(90, 0.5, 'sawtooth', 0.16); m.mesa.sonido.tono(60, 0.6, 'square', 0.1, 0.05); m.mesa.sonido.mal();
    try { navigator.vibrate?.(180); } catch { /* sin vibración */ }
    destello = 1;
    combo = 0;
    if (modo === 'clasico') { fin = 'Cortaste una bomba'; terminar(); return; }
    puntos = Math.max(0, puntos - 10); tiempoLimite -= 5;
    m.efectos.flotar(o.x, o.y - 40, '−10 y −5 s', '#ff5a6a', 36);
    m.mesa.hud.aviso('¡Bomba! −10 puntos y −5 segundos', 'mal', 1.4);
  };
  const reventarDorada = (o: Cosa) => {
    o.viva = false;
    const v = sumar(5);
    m.efectos.flotar(o.x, o.y - 70, `¡Dorada ×${o.golpes}! +${v}`, '#ffd23c', 44);
    m.efectos.chispas(o.x, o.y, ['#ffd23c', '#fff6c9', '#ffffff'], 40, 520);
    m.efectos.temblar(10);
    partir(o, 0.6);
    m.mesa.sonido.tono(523, 0.3, 'triangle', 0.1); m.mesa.sonido.tono(784, 0.4, 'triangle', 0.1, 0.1); m.mesa.sonido.tono(1046, 0.5, 'triangle', 0.08, 0.2);
  };
  const activar = (p: Poder, x: number, y: number) => {
    poderes[p] = m.tiempo + 5;
    m.efectos.flotar(x, y - 40, PODERES[p].nombre, PODERES[p].color, 40);
    m.mesa.hud.aviso(`¡${PODERES[p].nombre}! 5 segundos`, 'oro', 1.4);
    m.mesa.sonido.tono(660, 0.25, 'triangle', 0.09); m.mesa.sonido.tono(990, 0.3, 'triangle', 0.08, 0.08);
    musica.intensidad = 2;
  };
  let destello = 0;

  // ── Entrada: el trazo del dedo o del mouse ──
  let prev: { x: number; y: number } | null = null;
  m.alTocar((x, y) => {
    if (fase === 'inicio') { modo = x < m.ancho / 2 ? 'zen' : 'clasico'; empezarJuego(); return; }
    prev = { x, y }; trazoAbajo = true;
  });
  m.alSoltar(() => { prev = null; trazoAbajo = false; });
  m.alTecla((k) => {
    if (k === 't' && hojas.length > 1) { hoja = (hoja + 1) % hojas.length; m.mesa.hud.aviso(`Hoja: ${hojas[hoja].nombre}`, '', 1); }
    if (fase === 'inicio' && (k === '1' || k === '2')) { modo = k === '1' ? 'zen' : 'clasico'; empezarJuego(); }
  });
  const empezarJuego = () => { fase = 'juego'; inicio = m.tiempo; proximaOla = m.tiempo + 0.8; musica.intensidad = 1; };

  // ── Bots de prueba: el bueno corta en línea recta por fruta y esquiva bombas; el torpe raya al azar ──
  const rb = generador('bot-corte');
  let botTrazo: { ax: number; ay: number; bx: number; by: number; k: number } | null = null, botEspera = 0;
  function pilotar() {
    const t = m.tiempo;
    if (botTrazo) {
      const k0 = botTrazo.k, k1 = Math.min(1, k0 + 0.08);
      const ax = botTrazo.ax + (botTrazo.bx - botTrazo.ax) * k0, ay = botTrazo.ay + (botTrazo.by - botTrazo.ay) * k0;
      const bx = botTrazo.ax + (botTrazo.bx - botTrazo.ax) * k1, by = botTrazo.ay + (botTrazo.by - botTrazo.ay) * k1;
      cortar(ax, ay, bx, by); estelaBot.push({ x: bx, y: by, t });
      botTrazo.k = k1;
      if (k1 >= 1) { botTrazo = null; trazoAbajo = false; }
      return;
    }
    if (t < botEspera) return;
    if (bot === 'torpe') {
      botEspera = t + 0.7 + rb() * 0.8;
      const x = m.ancho * rb(), y = 150 + rb() * 400, a = rb() * 6.28;
      botTrazo = { ax: x, ay: y, bx: x + Math.cos(a) * 160, by: y + Math.sin(a) * 160, k: 0 }; trazoAbajo = true;
      return;
    }
    const blanco = cosas.filter((o) => o.viva && o.tipo !== 'bomba' && o.y < ALTO - 60 && o.y > 40).sort((a, b) => b.y - a.y)[0];
    if (!blanco) return;
    const bombas = cosas.filter((o) => o.viva && o.tipo === 'bomba');
    for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4, 1.2, -1.2]) {
      const dx = Math.cos(a) * 110, dy = Math.sin(a) * 110, t2 = { ax: blanco.x - dx, ay: blanco.y - dy, bx: blanco.x + dx, by: blanco.y + dy, k: 0 };
      if (bombas.some((b) => distSeg(b.x, b.y, t2.ax, t2.ay, t2.bx, t2.by) < b.r + 40)) continue;
      botTrazo = t2; trazoAbajo = true; botEspera = t + (blanco.tipo === 'dorada' ? 0.02 : 0.12); return;
    }
    botEspera = t + 0.1;
  }
  const estelaBot: { x: number; y: number; t: number }[] = [];

  // ── Paso de la simulación ──
  m.alPaso((dt) => {
    const t = m.tiempo;
    if (fase !== 'juego') return;
    if (bot) pilotar();
    else if (prev && m.puntero.abajo) { cortar(prev.x, prev.y, m.puntero.x, m.puntero.y); prev = { x: m.puntero.x, y: m.puntero.y }; }
    if (combo && t - ultimoCorte > 0.2 && !trazoAbajo) cerrarCombo();
    else if (combo && t - ultimoCorte > 0.45) cerrarCombo();
    const jugado = t - inicio;
    // Olas, fruta dorada y plátanos de poder (todo con la semilla)
    if (t >= proximaOla) proximaOla = t + ola(jugado) * (activo('frenesi') ? 0.35 : 1);
    if (activo('frenesi') && r() < dt * 7) { const izq = r() < 0.5; lanzar('fruta', izq ? -20 : m.ancho + 20, 120 + r() * 300, (izq ? 1 : -1) * m.ancho * (0.4 + r() * 0.3)); }
    if (jugado >= proximaDorada && modo !== 'clasico') { proximaDorada = jugado + 25 + r() * 15; lanzar('dorada', m.ancho * (0.3 + r() * 0.4), 200 + r() * 80, 0); }
    if (jugado >= proximoPoder && modo !== 'clasico') { proximoPoder = jugado + 16 + r() * 10; const p = (['congelar', 'frenesi', 'doble'] as Poder[])[Math.floor(r() * 3)]; const x = m.ancho * (0.25 + r() * 0.5); lanzar('poder', x, 150 + r() * 150, (m.ancho / 2 - x) * 0.3, { poder: p }); }
    for (let i = esperas.length - 1; i >= 0; i--) if (t >= esperas[i].t) { esperas[i].f(); esperas.splice(i, 1); }
    const lento = activo('congelar') ? 0.35 : 1, d = dt * lento;
    for (const o of cosas) {
      if (!o.viva) continue;
      if (o.quietaHasta) { if (t > o.quietaHasta) { reventarDorada(o); } continue; }
      o.vy += GRAVEDAD * d; o.x += o.vx * d; o.y += o.vy * d; o.giro += o.vgiro * d;
      if (o.tipo === 'bomba' && r() < 0.5) m.efectos.chispas(o.x + Math.cos(o.giro - 1) * o.r, o.y + Math.sin(o.giro - 1) * o.r - 4, ['#ffd23c', '#ff6a1a'], 1, 90, { gravedad: -50, dura: 0.25, tam: 2 });
      if (o.y > ALTO + o.r + 20 && o.vy > 0) {
        o.viva = false;
        if (o.tipo === 'fruta') {
          perdidas++;
          if (modo === 'clasico') { vidas--; m.mesa.sonido.tono(200, 0.2, 'triangle', 0.08); m.efectos.flotar(Math.max(40, Math.min(m.ancho - 40, o.x)), ALTO - 40, '✕', '#ff5a6a', 48); if (vidas <= 0) { fin = 'Se te cayeron 3 frutas'; terminar(); return; } }
        }
      }
    }
    for (let i = cosas.length - 1; i >= 0; i--) if (!cosas[i].viva) cosas.splice(i, 1);
    for (let i = mitades.length - 1; i >= 0; i--) { const h = mitades[i]; h.vida += dt; h.vy += GRAVEDAD * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.giro += h.vgiro * dt; if (h.y > ALTO + 120) mitades.splice(i, 1); }
    for (let i = manchas.length - 1; i >= 0; i--) { manchas[i].vida += dt; if (manchas[i].vida > 3.2) manchas.splice(i, 1); }
    destello = Math.max(0, destello - dt * 2.5);
    if (!Object.values(poderes).some((v) => t < v)) musica.intensidad = 1;
    // Reloj y marcador
    const quedan = tiempoLimite - jugado;
    if (modo !== 'clasico') {
      m.mesa.hud.tiempo(`${Math.max(0, Math.ceil(quedan))} s`);
      if (quedan <= 0) { fin = modo === 'zen' ? 'Terminó la sesión zen' : 'Se acabó el tiempo'; terminar(); return; }
    } else m.mesa.hud.tiempo(`${'♥'.repeat(vidas)}${'♡'.repeat(3 - vidas)}`);
    m.mesa.hud.puntos(String(puntos));
    const act = (Object.keys(poderes) as Poder[]).filter(activo).map((p) => PODERES[p].nombre);
    m.mesa.hud.extra(act.length ? act.join(' · ') : `${cortadas} cortadas${mejorCombo >= 3 ? ` · mejor combo ${mejorCombo}` : ''}`);
  });

  // ── Dibujo ──
  const fruta = (g: CanvasRenderingContext2D, f: TipoFruta, rad: number) => {
    const grad = g.createRadialGradient(-rad * 0.35, -rad * 0.4, rad * 0.1, 0, 0, rad);
    grad.addColorStop(0, f.piel[0]); grad.addColorStop(1, f.piel[1]);
    g.fillStyle = grad;
    if (f.dibujo === 'limon') { g.beginPath(); g.ellipse(0, 0, rad * 1.15, rad * 0.85, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(rad * 1.15, 0, 6, 4, 0, 0, Math.PI * 2); g.fill(); }
    else if (f.dibujo === 'frutilla') { g.beginPath(); g.moveTo(0, rad * 1.2); g.bezierCurveTo(-rad * 1.4, rad * 0.2, -rad, -rad, 0, -rad * 0.8); g.bezierCurveTo(rad, -rad, rad * 1.4, rad * 0.2, 0, rad * 1.2); g.fill(); g.fillStyle = f.semillas; for (let i = 0; i < 9; i++) g.fillRect(-rad * 0.6 + (i % 3) * rad * 0.5 + ((i / 3) | 0) * 2, -rad * 0.3 + ((i / 3) | 0) * rad * 0.45, 2.5, 3.5); g.fillStyle = '#3fa34d'; g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; g.moveTo(0, -rad * 0.8); g.lineTo(Math.cos(a) * rad * 0.7, -rad * 0.8 + Math.sin(a) * rad * 0.35 + 8); } g.lineWidth = 5; g.strokeStyle = '#3fa34d'; g.stroke(); return; }
    else if (f.dibujo === 'pina') { g.beginPath(); g.ellipse(0, 4, rad * 0.8, rad, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(120,70,10,.55)'; g.lineWidth = 2; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 10 - 20, -rad); g.lineTo(i * 10 + 20, rad + 4); g.stroke(); g.beginPath(); g.moveTo(i * 10 + 20, -rad); g.lineTo(i * 10 - 20, rad + 4); g.stroke(); } g.fillStyle = '#3f9a3a'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 5, -rad + 6); g.lineTo(i * 12, -rad - 26 + Math.abs(i) * 6); g.lineTo(i * 5 + 6, -rad + 6); g.fill(); } return; }
    else { g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fill(); }
    if (f.dibujo === 'sandia') { g.strokeStyle = 'rgba(15,60,25,.6)'; g.lineWidth = 5; for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(i * rad * 0.32, 0, rad * 0.12, rad * 0.95, 0, 0, Math.PI * 2); g.stroke(); } }
    if (f.dibujo === 'kiwi') { g.fillStyle = 'rgba(60,40,20,.35)'; for (let i = 0; i < 20; i++) g.fillRect(Math.cos(i * 2.4) * rad * 0.7, Math.sin(i * 2.4) * rad * 0.7, 2, 2); }
    if (f.dibujo === 'coco') { g.fillStyle = '#2e1a0c'; for (const [x, y] of [[-6, -8], [6, -8], [0, 2]]) { g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); } }
    if (f.dibujo === 'redonda') { g.strokeStyle = '#5a3416'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -rad + 4); g.lineTo(3, -rad - 10); g.stroke(); g.fillStyle = '#4fae3a'; g.beginPath(); g.ellipse(10, -rad - 6, 10, 5, -0.5, 0, Math.PI * 2); g.fill(); }
    // Brillo
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-rad * 0.38, -rad * 0.42, rad * 0.28, rad * 0.16, -0.6, 0, Math.PI * 2); g.fill();
  };
  const pulpa = (g: CanvasRenderingContext2D, f: TipoFruta, rad: number) => {
    // Media fruta vista desde el corte: borde de piel, pulpa, centro y semillas
    g.fillStyle = f.piel[1]; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI); g.fill();
    g.fillStyle = f.pulpa; g.beginPath(); g.arc(0, 0, rad * (f.dibujo === 'sandia' ? 0.85 : 0.9), 0, Math.PI); g.fill();
    g.fillStyle = f.centro; g.beginPath(); g.ellipse(0, 0, rad * 0.5, rad * 0.3, 0, 0, Math.PI); g.fill();
    g.fillStyle = f.semillas;
    const n = f.dibujo === 'kiwi' ? 14 : f.dibujo === 'sandia' ? 8 : 3;
    for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI, d = rad * (f.dibujo === 'kiwi' ? 0.42 : 0.55); g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.8, 2.6, 4, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(-rad, -1, rad * 2, 3);
  };
  const bomba = (g: CanvasRenderingContext2D, rad: number, t: number) => {
    const grad = g.createRadialGradient(-rad * 0.3, -rad * 0.35, 2, 0, 0, rad);
    grad.addColorStop(0, '#5a5a6a'); grad.addColorStop(1, '#121218');
    g.fillStyle = grad; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ff2e4d'; g.lineWidth = 3 + Math.sin(t * 18) * 1.5; g.beginPath(); g.arc(0, 0, rad + 3, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#7a7a86'; g.fillRect(-7, -rad - 8, 14, 9);
    g.strokeStyle = '#c9a46a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -rad - 8); g.quadraticCurveTo(10, -rad - 20, 6, -rad - 28); g.stroke();
    g.fillStyle = '#ffffff'; g.font = `900 ${rad * 0.9}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✕', 0, 2);
  };
  const dorada = (g: CanvasRenderingContext2D, rad: number, t: number, golpes: number) => {
    g.fillStyle = 'rgba(255,210,60,.25)'; g.beginPath(); g.arc(0, 0, rad * 1.5 + Math.sin(t * 8) * 4, 0, Math.PI * 2); g.fill();
    const grad = g.createRadialGradient(-rad * 0.3, -rad * 0.35, 2, 0, 0, rad);
    grad.addColorStop(0, '#fff6c9'); grad.addColorStop(0.5, '#ffd23c'); grad.addColorStop(1, '#b07a00');
    g.fillStyle = grad; g.beginPath(); g.arc(0, 0, rad * (1 + golpes * 0.012), 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-rad * 0.35, -rad * 0.4, rad * 0.3, rad * 0.17, -0.6, 0, Math.PI * 2); g.fill();
  };
  const platano = (g: CanvasRenderingContext2D, rad: number, p: Poder) => {
    g.fillStyle = PODERES[p].color; g.globalAlpha = 0.3; g.beginPath(); g.arc(0, 0, rad * 1.4, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.fillStyle = p === 'congelar' ? '#bfe9ff' : p === 'frenesi' ? '#ffc06b' : '#ffe45a';
    g.strokeStyle = '#7a5a10'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-rad, -rad * 0.3); g.quadraticCurveTo(0, rad * 1.1, rad, -rad * 0.5); g.quadraticCurveTo(0, rad * 0.4, -rad, -rad * 0.3); g.fill(); g.stroke();
    g.fillStyle = '#4a3410'; g.fillRect(rad - 4, -rad * 0.6, 7, 6);
  };
  const madera = (g: CanvasRenderingContext2D) => {
    // Tablas de madera de fondo, con vetas
    const n = Math.ceil(m.ancho / 160);
    for (let i = 0; i < n; i++) {
      const x = i * 160, tono = 0.85 + ((i * 37) % 10) / 60;
      const gr = g.createLinearGradient(x, 0, x + 160, 0);
      gr.addColorStop(0, `rgb(${Math.round(110 * tono)},${Math.round(72 * tono)},${Math.round(44 * tono)})`); gr.addColorStop(1, `rgb(${Math.round(92 * tono)},${Math.round(58 * tono)},${Math.round(34 * tono)})`);
      g.fillStyle = gr; g.fillRect(x, 0, 160, ALTO);
      g.strokeStyle = 'rgba(40,22,10,.25)'; g.lineWidth = 2;
      for (let v = 0; v < 6; v++) { g.beginPath(); const vx = x + 18 + v * 24; g.moveTo(vx, 0); for (let y = 0; y <= ALTO; y += 60) g.lineTo(vx + Math.sin(y * 0.01 + i + v) * 6, y); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, 0, 4, ALTO);
    }
    const vin = g.createRadialGradient(m.ancho / 2, ALTO / 2, ALTO * 0.3, m.ancho / 2, ALTO / 2, ALTO);
    vin.addColorStop(0, 'rgba(0,0,0,0)'); vin.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = vin; g.fillRect(0, 0, m.ancho, ALTO);
  };
  const textoGrande = (g: CanvasRenderingContext2D, texto: string, x: number, y: number, tam: number, color = '#ffffff') => {
    g.font = `900 ${tam}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = tam * 0.16; g.strokeStyle = 'rgba(14,20,36,.85)'; g.strokeText(texto, x, y); g.fillStyle = color; g.fillText(texto, x, y);
  };

  // ── Capa 3D: fruta con volumen, mitades que muestran la pulpa, tabla iluminada. Sin sombras reales ni postproceso. ──
  const T = m.tres;
  if (T) {
    const E = T.escena;
    E.environment = T.entorno();
    E.environmentIntensity = 0.35;
    E.add(new THREE.HemisphereLight(0xfff1dc, 0x3a2414, 1.1));
    const sol = new THREE.DirectionalLight(0xfff0d8, 2.2); sol.position.set(-0.5, 0.8, 1); E.add(sol);
    // Tabla de madera: tablas con vetas, pintadas una vez y repetidas
    const texMadera = texturaDe(1024, 1024, (cg) => {
      for (let i = 0; i < 6; i++) {
        const x = i * 171, tono = 0.85 + ((i * 37) % 10) / 60;
        const gr = cg.createLinearGradient(x, 0, x + 171, 0);
        gr.addColorStop(0, `rgb(${Math.round(150 * tono)},${Math.round(98 * tono)},${Math.round(58 * tono)})`); gr.addColorStop(1, `rgb(${Math.round(124 * tono)},${Math.round(78 * tono)},${Math.round(44 * tono)})`);
        cg.fillStyle = gr; cg.fillRect(x, 0, 171, 1024);
        cg.strokeStyle = 'rgba(60,32,14,.28)'; cg.lineWidth = 2;
        for (let v = 0; v < 9; v++) { cg.beginPath(); const vx = x + 10 + v * 18; cg.moveTo(vx, 0); for (let y = 0; y <= 1024; y += 32) cg.lineTo(vx + Math.sin(y * 0.012 + i * 3 + v) * 5, y); cg.stroke(); }
        cg.fillStyle = 'rgba(70,40,18,.5)'; cg.beginPath(); cg.ellipse(x + 60 + (i * 53) % 60, 200 + (i * 311) % 600, 9, 15, 0, 0, Math.PI * 2); cg.fill();
        cg.fillStyle = 'rgba(0,0,0,.45)'; cg.fillRect(x, 0, 4, 1024);
      }
    }, true);
    const tabla = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: texMadera, bumpMap: texMadera, bumpScale: 2, roughness: 0.75 }));
    tabla.position.z = -500; E.add(tabla);
    // Viñeta suave encima de la tabla
    const vineta = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, map: texturaDe(256, 256, (cg) => { const gr = cg.createRadialGradient(128, 128, 60, 128, 128, 182); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.55)'); cg.fillStyle = gr; cg.fillRect(0, 0, 256, 256); }) }));
    vineta.position.z = 500; E.add(vineta);
    // Piel y pulpa de cada fruta, pintadas una vez
    const rt = generador('texturas-corte');
    const pieles = FRUTAS.map((f) => texturaDe(256, 128, (cg) => {
      const gr = cg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, f.piel[0]); gr.addColorStop(0.5, f.piel[0]); gr.addColorStop(1, f.piel[1]);
      cg.fillStyle = gr; cg.fillRect(0, 0, 256, 128);
      if (f.dibujo === 'sandia') { cg.fillStyle = 'rgba(15,60,25,.75)'; for (let i = 0; i < 9; i++) { cg.beginPath(); for (let y = 0; y <= 128; y += 8) cg.lineTo(i * 28.4 + Math.sin(y * 0.2 + i) * 4, y); for (let y = 128; y >= 0; y -= 8) cg.lineTo(i * 28.4 + 10 + Math.sin(y * 0.2 + i) * 4, y); cg.fill(); } }
      else if (f.dibujo === 'frutilla') { cg.fillStyle = f.semillas; for (let i = 0; i < 70; i++) cg.fillRect(rt() * 256, 20 + rt() * 100, 3, 4); }
      else if (f.dibujo === 'kiwi' || f.dibujo === 'coco') { for (let i = 0; i < 900; i++) { cg.fillStyle = `rgba(${f.dibujo === 'coco' ? '40,22,8' : '60,40,20'},${rt() * 0.4})`; cg.fillRect(rt() * 256, rt() * 128, 1 + rt() * 2, 3 + rt() * 4); } }
      else if (f.dibujo === 'pina') { cg.strokeStyle = 'rgba(110,60,10,.7)'; cg.lineWidth = 3; for (let i = -10; i < 20; i++) { cg.beginPath(); cg.moveTo(i * 22, 0); cg.lineTo(i * 22 + 128, 128); cg.stroke(); cg.beginPath(); cg.moveTo(i * 22 + 128, 0); cg.lineTo(i * 22, 128); cg.stroke(); } }
      else { for (let i = 0; i < 300; i++) { cg.fillStyle = `rgba(255,255,255,${rt() * 0.12})`; cg.fillRect(rt() * 256, rt() * 128, 2, 2); cg.fillStyle = `rgba(0,0,0,${rt() * 0.08})`; cg.fillRect(rt() * 256, rt() * 128, 2, 2); } }
    }, true));
    const pulpas = FRUTAS.map((f) => texturaDe(256, 256, (cg) => {
      cg.fillStyle = f.piel[1]; cg.beginPath(); cg.arc(128, 128, 128, 0, Math.PI * 2); cg.fill();
      const gr = cg.createRadialGradient(128, 128, 10, 128, 128, 116); gr.addColorStop(0, f.centro); gr.addColorStop(0.45, f.pulpa); gr.addColorStop(1, f.pulpa);
      cg.fillStyle = gr; cg.beginPath(); cg.arc(128, 128, f.dibujo === 'sandia' ? 108 : 118, 0, Math.PI * 2); cg.fill();
      if (f.dibujo === 'limon' || f.nombre === 'Naranja') { cg.strokeStyle = 'rgba(255,255,255,.55)'; cg.lineWidth = 3; for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; cg.beginPath(); cg.moveTo(128, 128); cg.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); cg.stroke(); } }
      cg.fillStyle = f.semillas;
      const n = f.dibujo === 'kiwi' ? 26 : f.dibujo === 'sandia' ? 14 : 5, d = f.dibujo === 'kiwi' ? 40 : 62;
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; cg.save(); cg.translate(128 + Math.cos(a) * d * (0.8 + rt() * 0.4), 128 + Math.sin(a) * d * (0.8 + rt() * 0.4)); cg.rotate(a); cg.beginPath(); cg.ellipse(0, 0, 4, 7, 0, 0, Math.PI * 2); cg.fill(); cg.restore(); }
      cg.fillStyle = 'rgba(255,255,255,.18)'; cg.beginPath(); cg.ellipse(100, 92, 40, 18, -0.6, 0, Math.PI * 2); cg.fill();
    }));
    const matPiel = FRUTAS.map((f, i) => new THREE.MeshStandardMaterial({ map: pieles[i], roughness: f.dibujo === 'kiwi' || f.dibujo === 'coco' ? 0.95 : 0.35, metalness: 0 }));
    const matPulpa = FRUTAS.map((_, i) => new THREE.MeshStandardMaterial({ map: pulpas[i], roughness: 0.45 }));
    const esfera = new THREE.SphereGeometry(1, 28, 18), cupula = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const tapa = new THREE.CircleGeometry(1, 28); tapa.rotateX(Math.PI / 2);
    const matTallo = new THREE.MeshStandardMaterial({ color: 0x5a3416, roughness: 0.8 }), matHoja = new THREE.MeshStandardMaterial({ color: 0x3fa34d, roughness: 0.6 });
    const tallo = new THREE.CylinderGeometry(0.06, 0.08, 0.45, 6), hoja = new THREE.SphereGeometry(1, 10, 6).scale(0.38, 0.08, 0.18), cono = new THREE.ConeGeometry(0.16, 0.9, 5);
    // Una plantilla por fruta (cuerpo, tallo, hojas); cada fruta en juego es un clon que comparte geometría y material
    const plantillas = FRUTAS.map((f, i) => {
      const grupo = new THREE.Group(), cuerpo = new THREE.Mesh(esfera, matPiel[i]);
      if (f.dibujo === 'limon') cuerpo.scale.set(1.18, 0.86, 0.86);
      else if (f.dibujo === 'sandia') cuerpo.scale.set(1.12, 0.95, 0.95);
      else if (f.dibujo === 'kiwi') cuerpo.scale.set(1.12, 0.86, 0.86);
      else if (f.dibujo === 'pina') cuerpo.scale.set(0.82, 1.08, 0.82);
      else if (f.dibujo === 'frutilla') cuerpo.scale.set(0.95, 1.12, 0.95);
      else if (f.nombre === 'Mango') cuerpo.scale.set(1.12, 0.92, 0.85);
      grupo.add(cuerpo);
      if (f.dibujo === 'redonda') { const t1 = new THREE.Mesh(tallo, matTallo); t1.position.y = 1.05; grupo.add(t1); if (f.nombre.startsWith('Manzana') || f.nombre === 'Durazno') { const h1 = new THREE.Mesh(hoja, matHoja); h1.position.set(0.3, 1.12, 0); h1.rotation.z = 0.5; grupo.add(h1); } }
      if (f.dibujo === 'pina' || f.dibujo === 'frutilla') for (let k = 0; k < (f.dibujo === 'pina' ? 7 : 5); k++) { const c1 = new THREE.Mesh(cono, matHoja), a = (k / 7) * Math.PI * 2; c1.position.set(Math.cos(a) * 0.18, f.dibujo === 'pina' ? 1.35 : 1.05, Math.sin(a) * 0.18); c1.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5 + (f.dibujo === 'frutilla' ? Math.PI / 2.2 * Math.sign(Math.cos(a) || 1) : 0)); if (f.dibujo === 'frutilla') c1.scale.set(1, 0.6, 1); grupo.add(c1); }
      return grupo;
    });
    const matBomba = new THREE.MeshStandardMaterial({ color: 0x1c1c26, metalness: 0.7, roughness: 0.28, envMapIntensity: 1.5 });
    const matMecha = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.9 });
    const matOro = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 1, roughness: 0.18, envMapIntensity: 2.2, emissive: 0x3a2400 });
    const arco = new THREE.TorusGeometry(0.85, 0.3, 10, 22, 2.3);
    const matPoder: Record<Poder, THREE.Material> = { congelar: new THREE.MeshStandardMaterial({ color: 0xbfe9ff, roughness: 0.2, emissive: 0x1a4a6a }), frenesi: new THREE.MeshStandardMaterial({ color: 0xffb04a, roughness: 0.35, emissive: 0x5a2000 }), doble: new THREE.MeshStandardMaterial({ color: 0xffe45a, roughness: 0.3, emissive: 0x4a3a00 }) };
    const nuevoBrillo = (color: THREE.ColorRepresentation, opacidad: number) => new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrillo(), color, opacity: opacidad, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const texSombra = texturaDe(64, 64, (cg) => { const gr = cg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, 64, 64); });
    const texMancha = texturaDe(128, 128, (cg) => { cg.fillStyle = '#ffffff'; cg.beginPath(); cg.arc(64, 64, 34, 0, Math.PI * 2); cg.fill(); const rm = generador('mancha'); for (let k = 0; k < 9; k++) { const a = rm() * 6.28, d = 30 + rm() * 26; cg.beginPath(); cg.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + rm() * 9, 0, Math.PI * 2); cg.fill(); } });
    const geoTapon = new THREE.CylinderGeometry(0.28, 0.3, 0.3, 8), geoMecha = new THREE.TorusGeometry(0.35, 0.05, 5, 10, 1.6);
    const crear3d = (o: Cosa): THREE.Group => {
      let g3: THREE.Group;
      if (o.tipo === 'fruta') g3 = plantillas[o.fruta].clone();
      else if (o.tipo === 'bomba') {
        g3 = new THREE.Group(); g3.add(new THREE.Mesh(esfera, matBomba));
        const tapon = new THREE.Mesh(geoTapon, matBomba); tapon.position.y = 1; g3.add(tapon);
        const mecha = new THREE.Mesh(geoMecha, matMecha); mecha.position.set(0.35, 1.15, 0); g3.add(mecha);
        const chispa = nuevoBrillo(0xffb02a, 1); chispa.position.set(0.68, 1.45, 0.2); chispa.scale.setScalar(0.9); g3.add(chispa);
        const aviso = nuevoBrillo(0xff2e4d, 0.45); aviso.scale.setScalar(3.2); aviso.position.z = -1; g3.add(aviso);
        g3.userData.chispa = chispa; g3.userData.aviso = aviso;
      } else if (o.tipo === 'dorada') { g3 = new THREE.Group(); g3.add(new THREE.Mesh(esfera, matOro)); const b = nuevoBrillo(0xffd23c, 0.55); b.scale.setScalar(3.4); b.position.z = -1; g3.add(b); }
      else { g3 = new THREE.Group(); g3.add(new THREE.Mesh(arco, matPoder[o.poder!])); const b = nuevoBrillo(PODERES[o.poder!].color, 0.5); b.scale.setScalar(3); b.position.z = -1; g3.add(b); }
      const sombra = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSombra, depthWrite: false, transparent: true }));
      sombra.scale.setScalar(2.4); g3.userData.sombra = sombra; E.add(sombra);
      E.add(g3);
      return g3;
    };
    const mitad3d = (h: Mitad): THREE.Group => {
      const g3 = new THREE.Group(), piel = h.fruta >= 0 ? matPiel[h.fruta] : matOro, carne = h.fruta >= 0 ? matPulpa[h.fruta] : matOro;
      g3.add(new THREE.Mesh(cupula, piel), new THREE.Mesh(tapa, carne));
      g3.rotation.order = 'ZYX';
      E.add(g3);
      return g3;
    };
    const vivos3d = new Map<number, THREE.Group>(), mitades3d = new Map<Mitad, THREE.Group>(), manchas3d = new Map<Mancha, THREE.Mesh>();
    const quitar = (g3: THREE.Object3D) => { E.remove(g3); const s = g3.userData.sombra as THREE.Sprite | undefined; if (s) { E.remove(s); s.material.dispose(); } g3.traverse((x) => { const sp = x as THREE.Sprite; if (sp.isSprite) sp.material.dispose(); }); };
    m.antes3d(() => {
      const t = m.tiempo, W = m.ancho;
      tabla.position.set(W / 2, -ALTO / 2, -500); tabla.scale.set(W, ALTO, 1);
      texMadera.repeat.set(W / 1024, ALTO / 1024);
      vineta.position.set(W / 2, -ALTO / 2, 500); vineta.scale.set(W, ALTO, 1);
      // Fruta en el aire, con su sombra en la tabla (más chica y corrida mientras más alta va)
      const vistos = new Set<number>();
      for (const o of cosas) {
        vistos.add(o.id);
        let g3 = vivos3d.get(o.id);
        if (!g3) { g3 = crear3d(o); vivos3d.set(o.id, g3); }
        const quieta = o.tipo === 'dorada' && o.quietaHasta;
        g3.position.set(o.x, -o.y, 0);
        g3.scale.setScalar(o.r * (o.tipo === 'dorada' ? 1 + o.golpes * 0.012 : 1));
        if (quieta) g3.rotation.set(Math.sin(t * 20) * 0.08 * Math.min(1, o.golpes), t * 3, 0);
        else g3.rotation.set(o.giro * 0.5, o.giro * 0.8, o.giro);
        if (o.tipo === 'bomba') { (g3.userData.chispa as THREE.Sprite).material.opacity = 0.6 + Math.random() * 0.4; (g3.userData.aviso as THREE.Sprite).material.opacity = 0.3 + 0.25 * Math.sin(t * 14); g3.rotation.set(0, o.giro * 0.4, Math.sin(o.giro) * 0.3); }
        const s = g3.userData.sombra as THREE.Sprite;
        s.position.set(o.x + 26, -o.y - 34, -480); s.scale.setScalar(o.r * 2.4);
      }
      for (const [id, g3] of vivos3d) if (!vistos.has(id)) { quitar(g3); vivos3d.delete(id); }
      // Mitades: la cara cortada mira a la cámara y dan vueltas al caer
      for (const h of mitades) {
        let g3 = mitades3d.get(h);
        if (!g3) { g3 = mitad3d(h); mitades3d.set(h, g3); }
        g3.position.set(h.x, -h.y, 20);
        g3.scale.setScalar(h.r);
        g3.rotation.set(-0.95 + Math.sin(h.vida * 3) * 0.3 * h.lado, h.vida * 1.5 * h.lado, h.giro + (h.lado === 1 ? 0 : Math.PI));
      }
      for (const [h, g3] of mitades3d) if (!mitades.includes(h)) { quitar(g3); mitades3d.delete(h); }
      // Jugo sobre la tabla, que se seca
      for (const s of manchas) {
        let me = manchas3d.get(s);
        if (!me) { me = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texMancha, color: s.color, transparent: true, depthWrite: false })); me.rotation.z = s.x; manchas3d.set(s, me); E.add(me); }
        me.position.set(s.x, -s.y, -490); me.scale.setScalar(s.r * 3.4);
        (me.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 * (1 - s.vida / 3.2));
      }
      for (const [s, me] of manchas3d) if (!manchas.includes(s)) { E.remove(me); me.geometry.dispose(); (me.material as THREE.Material).dispose(); manchas3d.delete(s); }
    });
  }

  m.alDibujar((g) => {
    const t = m.tiempo;
    if (!T) {
    madera(g);
    // Manchas de jugo en la tabla (se secan)
    for (const s of manchas) {
      g.globalAlpha = Math.max(0, 0.55 * (1 - s.vida / 3.2)); g.fillStyle = s.color;
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
      for (const d of s.gotas) { g.beginPath(); g.arc(s.x + d.dx, s.y + d.dy, d.r, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
    if (activo('congelar')) { g.fillStyle = 'rgba(127,216,255,.16)'; g.fillRect(0, 0, m.ancho, ALTO); }
    // Mitades que caen girando
    for (const h of mitades) {
      g.save(); g.translate(h.x, h.y); g.rotate(h.giro + (h.lado === 1 ? 0 : Math.PI));
      if (h.fruta >= 0) pulpa(g, FRUTAS[h.fruta], h.r);
      else { g.fillStyle = '#ffd23c'; g.beginPath(); g.arc(0, 0, h.r, 0, Math.PI); g.fill(); }
      g.restore();
    }
    for (const o of cosas) {
      g.save(); g.translate(o.x, o.y); g.rotate(o.tipo === 'dorada' ? 0 : o.giro);
      if (o.tipo === 'fruta') fruta(g, FRUTAS[o.fruta], o.r);
      else if (o.tipo === 'bomba') bomba(g, o.r, t);
      else if (o.tipo === 'dorada') dorada(g, o.r, t, o.golpes);
      else platano(g, o.r, o.poder!);
      g.restore();
    }
    } else if (activo('congelar')) { g.fillStyle = 'rgba(127,216,255,.16)'; g.fillRect(0, 0, m.ancho, ALTO); }
    for (const o of cosas) if (o.tipo === 'dorada' && o.quietaHasta) textoGrande(g, `×${o.golpes}`, o.x, o.y - o.r - 34, 30, '#ffd23c');
    // La estela de la hoja
    const estela = bot ? estelaBot.filter((p) => t - p.t < 0.12) : m.puntero.estela;
    if (bot) { estelaBot.splice(0, estelaBot.length - estela.length); }
    if (estela.length > 1) {
      const [c1, c2] = hojas[hoja].color;
      // Brillo de la hoja: una pasada ancha y suave en modo aditivo, y el filo encima
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      g.strokeStyle = hojas[hoja].nombre === 'Fuego' ? 'rgba(255,120,30,.35)' : hojas[hoja].nombre === 'Arcoíris' ? 'rgba(255,120,200,.3)' : 'rgba(160,200,255,.3)';
      g.lineWidth = 26; g.beginPath(); g.moveTo(estela[0].x, estela[0].y); for (const p of estela) g.lineTo(p.x, p.y); g.stroke();
      g.globalCompositeOperation = 'source-over';
      for (let i = 1; i < estela.length; i++) {
        const k = i / estela.length, a = estela[i - 1], b = estela[i];
        g.strokeStyle = hojas[hoja].nombre === 'Arcoíris' ? `hsl(${(i * 30 + t * 400) % 360} 90% 65%)` : k > 0.6 ? c1 : c2;
        g.lineWidth = 3 + k * 9; g.lineCap = 'round'; g.globalAlpha = 0.25 + k * 0.75;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (destello > 0) { g.fillStyle = `rgba(255,255,255,${destello * (m.calma ? 0.25 : 0.8)})`; g.fillRect(0, 0, m.ancho, ALTO); }
    if (fase === 'inicio') {
      g.fillStyle = 'rgba(14,20,36,.6)'; g.fillRect(0, 0, m.ancho, ALTO);
      textoGrande(g, 'CORTE MAESTRO', m.ancho / 2, 150, Math.min(72, m.ancho / 9), '#ffcf4a');
      textoGrande(g, 'Modo libre: elige cómo jugar', m.ancho / 2, 230, 26);
      textoGrande(g, 'Zen', m.ancho / 4, 380, 52, '#7cffcb'); textoGrande(g, '90 s sin bombas (1)', m.ancho / 4, 440, 20);
      textoGrande(g, 'Clásico', (m.ancho * 3) / 4, 380, 52, '#ff8a6a'); textoGrande(g, '3 vidas (2)', (m.ancho * 3) / 4, 440, 20);
      textoGrande(g, `Hoja: ${hojas[hoja].nombre}${hojas.length > 1 ? ' · T para cambiar' : ''}`, m.ancho / 2, 600, 20, '#fff6c9');
    }
  });

  let terminado = false;
  function terminar() {
    if (terminado) return;
    terminado = true; fase = 'fin';
    cerrarCombo();
    musica.parar(); m.detener();
    if (puntos >= 300) guardado.arcoiris = true;
    guardado.hoja = hoja; guardado.record = Math.max(guardado.record, puntos);
    try { localStorage.setItem(REG, JSON.stringify(guardado)); } catch { /* sin almacenamiento */ }
    const favorita = porTipo.indexOf(Math.max(...porTipo));
    const precision = lanzadas ? Math.round((cortadas / lanzadas) * 100) : 0;
    c.alTerminar({
      puntaje: puntos,
      lineas: [
        ['Resultado', fin], ['Frutas cortadas', `${cortadas} de ${lanzadas}`], ['Precisión', `${precision} %`], ['Mejor combo', mejorCombo >= 3 ? String(mejorCombo) : '—'],
        ['Cortes precisos', String(precisos)], ['Golpes a la dorada', String(golpesDorada)], ['Bombas', String(bombasCortadas)],
        ['Fruta favorita', porTipo[favorita] ? `${FRUTAS[favorita].nombre} (${porTipo[favorita]})` : '—'],
      ],
      detalle: { modo, cortadas, lanzadas, perdidas, combo: mejorCombo, precisos, dorada: golpesDorada, bombas: bombasCortadas, porTipo },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__corte = () => ({ fase, modo, puntos, cortadas, lanzadas, perdidas, mejorCombo, bombas: bombasCortadas, precisos, dorada: golpesDorada, enPantalla: cosas.length, terminado });
  return {
    empezar() { m.empezar(); if (fase === 'juego') empezarJuego(); },
    destruir() { musica.parar(); m.destruir(); },
  };
}
