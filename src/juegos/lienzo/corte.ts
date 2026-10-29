import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { bola, crearSprite, desdeTexto, girado, media, mezcla, PAL, type Sprite } from './pixel';

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
  const m = crearMotor2D(c, 'corte', { fondo: '#2a1c14', pixel: () => 4 });
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
  const rFrenesi = generador(`${c.semilla}|frenesi`);
  const lanzar = (tipo: Cosa['tipo'], x: number, apice: number, vx: number, extra: Partial<Cosa> = {}, az = r) => {
    const fruta = tipo === 'fruta' ? Math.floor(az() * FRUTAS.length) : tipo === 'poder' ? -1 : 2;
    const rad = tipo === 'bomba' ? 30 : tipo === 'dorada' ? 40 : tipo === 'poder' ? 30 : FRUTAS[fruta].r;
    cosas.push({ id: ids++, tipo, fruta, x, y: ALTO + rad + 10, vx, vy: -Math.sqrt(2 * GRAVEDAD * (ALTO + rad + 10 - apice)), giro: az() * 6, vgiro: (az() - 0.5) * 5, r: rad, viva: true, golpes: 0, quietaHasta: 0, ultimoGolpe: -1, ...extra });
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
        m.efectos.flotar(o.x + (Math.random() - 0.5) * 60, o.y - 40, `+${v}`, '#ffd23c', 28);
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
      m.mesa.sonido.tono(320 + Math.random() * 80, 0.09, 'sawtooth', 0.05); m.mesa.sonido.tono(1200 + combo * 90, 0.05, 'triangle', 0.04, 0.01);
    }
  }
  const partir = (o: Cosa, ang: number) => {
    const n = Math.sin(ang), k = -Math.cos(ang), fruta = o.tipo === 'poder' ? -1 : o.fruta;
    for (const lado of [1, -1] as const) mitades.push({ x: o.x + n * lado * 6, y: o.y + k * lado * 6, vx: o.vx * 0.6 + n * lado * 120, vy: Math.min(o.vy, 0) * 0.4 + k * lado * 120 - 60, giro: ang, vgiro: lado * (2 + Math.random() * 2), corte: ang, lado, fruta, r: o.r, vida: 0 });
    const color = fruta >= 0 ? FRUTAS[fruta].jugo : '#ffe04a';
    m.efectos.chispas(o.x, o.y, [color, color, '#ffffff'], 16, 340, { forma: 'gota', gravedad: 900, tam: 4 });
    m.efectos.congelar(25);
    if (!m.calma && manchas.length < 14) manchas.push({ x: o.x, y: o.y, r: o.r * (0.9 + Math.random() * 0.5), color, vida: 0, gotas: [] });
    tajos.push({ x: o.x, y: o.y, ang, r: o.r, t: m.tiempo });
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
    if (t >= proximaOla) proximaOla = t + ola(jugado);
    if (activo('frenesi') && rFrenesi() < dt * 9) { const izq = rFrenesi() < 0.5; lanzar('fruta', izq ? -20 : m.ancho + 20, 120 + rFrenesi() * 300, (izq ? 1 : -1) * m.ancho * (0.4 + rFrenesi() * 0.3), {}, rFrenesi); }
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

  // ── Pixel art (8 bits): 1 píxel del arte = 4 unidades del juego (720 de alto son 180 píxeles) ──
  const tonos = (f: TipoFruta) => ({ borde: mezcla(f.piel[1], '#000000', 0.55), sombra: f.piel[1], base: mezcla(f.piel[0], f.piel[1], 0.3), luz: f.piel[0], brillo: mezcla(f.piel[0], '#ffffff', 0.65) });
  const SPR_FRUTA = FRUTAS.map((f) => {
    const rp = f.r / 4, ex = { limon: 1.22, sandia: 1.12, kiwi: 1.1, pina: 0.86 }[f.dibujo as string] ?? 1, ey = { limon: 0.86, pina: 1.12, frutilla: 1.06 }[f.dibujo as string] ?? 1;
    return bola(rp * ex, rp * ey, tonos(f), (g, w, h) => {
      const cx = Math.floor(w / 2);
      g.globalCompositeOperation = 'source-atop';
      if (f.dibujo === 'sandia') { g.fillStyle = '#1e5c2a'; for (let x = 2; x < w - 1; x += 4) for (let y = 0; y < h; y++) g.fillRect(x + (Math.sin(y * 0.7) > 0 ? 1 : 0), y, 1, 1); }
      else if (f.dibujo === 'frutilla') { g.fillStyle = f.semillas; for (let y = 3; y < h - 1; y += 3) for (let x = 2 + (y % 2); x < w - 1; x += 3) g.fillRect(x, y, 1, 1); }
      else if (f.dibujo === 'pina') { g.fillStyle = 'rgba(110,60,10,.75)'; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0) g.fillRect(x, y, 1, 1); }
      else if (f.dibujo === 'kiwi' || f.dibujo === 'coco') { g.fillStyle = 'rgba(40,22,8,.45)'; for (let y = 1; y < h; y += 2) for (let x = (y * 3) % 3; x < w; x += 3) g.fillRect(x, y, 1, 1); }
      g.globalCompositeOperation = 'source-over';
      // Tallo y hoja (manzanas, durazno, mango, ciruela), corona (piña) y hojas (frutilla), dentro del borde de arriba
      if (f.dibujo === 'redonda') { g.fillStyle = '#5a3416'; g.fillRect(cx, 0, 1, 3); g.fillStyle = PAL.verde; g.fillRect(cx + 1, 0, 3, 1); g.fillRect(cx + 1, 1, 2, 1); }
      if (f.dibujo === 'pina' || f.dibujo === 'frutilla') { g.fillStyle = PAL.verde; for (let k = -2; k <= 2; k++) g.fillRect(cx + k * 2, 0, 1, 3 - Math.abs(k)); g.fillStyle = PAL.verdeClaro; g.fillRect(cx, 0, 1, 2); }
    });
  });
  const SPR_MITAD = FRUTAS.map((f) => media(f.r / 4, f.piel[1], f.pulpa, f.centro, f.semillas, f.dibujo === 'kiwi' ? 7 : f.dibujo === 'sandia' ? 6 : 3));
  const SPR_BOMBA = bola(7.5, 7.5, { borde: PAL.negro, sombra: '#1c1c26', base: '#3a3a48', luz: '#6a6a7a', brillo: '#c9c9d6' }, (g, w) => { g.fillStyle = PAL.gris; g.fillRect(Math.round(w / 2) - 2, 0, 4, 2); });
  const SPR_MECHA = desdeTexto(['..M', '.M.', 'M..'], { M: PAL.madera });
  const SPR_CHISPA = [desdeTexto(['.Y.', 'YAY', '.Y.'], { Y: PAL.amarillo, A: '#ffffff' }), desdeTexto(['Y.Y', '.A.', 'Y.Y'], { Y: PAL.naranjo, A: PAL.amarillo })];
  const SPR_ORO = bola(10, 10, { borde: '#7a5200', sombra: PAL.dorado, base: '#ffc83a', luz: '#ffe88a', brillo: '#ffffff' });
  const platanoDe = (cuerpo: string, luz: string) => desdeTexto(['.........OO.', '........OYO.', '.......OYYO.', 'O.....OYYLO.', 'OOOOOOYYLO..', '.OYYYYYLLO..', '..OOOOOOO...'], { O: '#5a3a0a', Y: cuerpo, L: luz });
  const SPR_PODER: Record<Poder, Sprite> = { congelar: platanoDe('#9fe0ff', '#e8f8ff'), frenesi: platanoDe('#ffb04a', '#ffe0a0'), doble: platanoDe('#ffe45a', '#fff6c0') };
  // Tabla de madera: cuatro tablas de 32 píxeles, cada una con su tono, vetas y nudos al azar; se repiten a lo ancho
  const SPR_TABLA = crearSprite(128, 180, (g) => {
    const rt = generador('tabla-pixel');
    for (const [x0, base, osc] of [[0, '#9a6638', '#7e5028'], [32, '#a8703e', '#8a5a2e'], [64, '#a06a3a', '#82522a'], [96, '#b07646', '#8e5e32']] as const) {
      g.fillStyle = base; g.fillRect(x0, 0, 32, 180);
      g.fillStyle = osc; for (let v = 0; v < 6; v++) { const xv = x0 + 3 + v * 5; for (let y = 0; y < 180; y++) g.fillRect(xv + Math.round(Math.sin(y * 0.08 + v + x0) * 1.2), y, 1, 1); }
      g.fillStyle = '#c8905a'; for (let k = 0; k < 40; k++) g.fillRect(x0 + 1 + Math.floor(rt() * 30), Math.floor(rt() * 180), 1, 3);
      for (let q = 0; q < (rt() < 0.5 ? 1 : 2); q++) { const nx = x0 + 6 + Math.floor(rt() * 18), ny = 10 + Math.floor(rt() * 160); g.fillStyle = '#5a3416'; g.fillRect(nx, ny, 5, 3); g.fillRect(nx + 1, ny - 1, 3, 5); g.fillStyle = '#7a4a22'; g.fillRect(nx + 2, ny + 1, 1, 1); }
      g.fillStyle = '#3a2010'; g.fillRect(x0 + 31, 0, 1, 180);
    }
  });
  const manchaDe = new Map<string, Sprite>();
  const SPR_MANCHA = (color: string) => {
    let s = manchaDe.get(color);
    if (!s) { const rm = generador(color); s = crearSprite(24, 24, (g) => { g.fillStyle = color; for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const d = Math.hypot(x - 12, y - 12); if (d < 6.5 || (d < 11 && rm() < 0.25 * (11 - d) / 4.5)) g.fillRect(x, y, 1, 1); } }); manchaDe.set(color, s); }
    return s;
  };
  // Tajos: la línea del corte que atraviesa la fruta, un instante
  const tajos: { x: number; y: number; ang: number; r: number; t: number }[] = [];

  m.alPixel((gp) => {
    const t = m.tiempo, k = m.k;
    for (let x = 0; x < m.ancho; x += 128 * k) gp.drawImage(SPR_TABLA, x, 0, 128 * k, 180 * k);
    // Jugo en la tabla, que se seca en tres etapas
    for (const s of manchas) { gp.globalAlpha = s.vida < 1.1 ? 0.6 : s.vida < 2.2 ? 0.38 : 0.18; m.sprite(SPR_MANCHA(s.color), s.x, s.y, s.r > 40 ? 2 : 1); }
    gp.globalAlpha = 1;
    for (const h of mitades) m.sprite(girado(h.fruta >= 0 ? SPR_MITAD[h.fruta] : SPR_ORO, h.giro + (h.lado === 1 ? 0 : Math.PI)), h.x, h.y);
    for (const o of cosas) {
      if (o.tipo === 'fruta') m.sprite(girado(SPR_FRUTA[o.fruta], o.giro), o.x, o.y);
      else if (o.tipo === 'bomba') {
        // Aviso rojo que parpadea alrededor de la bomba, y la mecha que chispea
        if (Math.floor(t * 8) % 2 === 0) { gp.strokeStyle = PAL.rojo; gp.lineWidth = k; gp.beginPath(); gp.arc(o.x, o.y, o.r + 2 * k, 0, Math.PI * 2); gp.stroke(); }
        m.sprite(SPR_BOMBA, o.x, o.y); m.sprite(SPR_MECHA, o.x + 4 * k, o.y - 9 * k); m.sprite(SPR_CHISPA[Math.floor(t * 12) % 2], o.x + 6 * k, o.y - 11 * k);
      } else if (o.tipo === 'dorada') { gp.fillStyle = 'rgba(255,210,60,.25)'; gp.beginPath(); gp.arc(o.x, o.y, o.r * 1.5 + Math.round(Math.sin(t * 8)) * k, 0, Math.PI * 2); gp.fill(); m.sprite(SPR_ORO, o.x, o.y); }
      else { gp.fillStyle = PODERES[o.poder!].color; gp.globalAlpha = 0.3 + 0.15 * Math.sin(t * 10); gp.beginPath(); gp.arc(o.x, o.y, o.r * 1.4, 0, Math.PI * 2); gp.fill(); gp.globalAlpha = 1; m.sprite(girado(SPR_PODER[o.poder!], o.giro), o.x, o.y); }
    }
    if (activo('congelar')) { gp.fillStyle = 'rgba(127,216,255,.18)'; gp.fillRect(0, 0, m.ancho, ALTO); }
  });

  // ── La hoja: una curva suave por los puntos del trazo, ancha en la punta y fina en la cola, con núcleo blanco y brillo ──
  const curva = (p: { x: number; y: number; t: number }[]) => {
    const out: { x: number; y: number; t: number }[] = [];
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
      for (let s = 0; s < 4; s++) {
        const u = s / 4, u2 = u * u, u3 = u2 * u, cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), t: p1.t + (p2.t - p1.t) * u });
      }
    }
    out.push(p[p.length - 1]);
    return out;
  };
  const DURA_HOJA = 0.12;
  const dibujarHoja = (g: CanvasRenderingContext2D, estela: { x: number; y: number; t: number }[], t: number) => {
    const pts = curva(estela.filter((p) => t - p.t < DURA_HOJA));
    if (pts.length < 3) return;
    const n = pts.length, normales = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const vida = Math.max(0, 1 - (t - p.t) / DURA_HOJA), w = 8 * Math.pow(i / (n - 1), 0.75) * (0.35 + 0.65 * vida);
      return [-dy / l, dx / l, w] as const;
    });
    const forma = (s: number) => {
      g.beginPath();
      pts.forEach((p, i) => { const [nx, ny, w] = normales[i]; g.lineTo(p.x + nx * w * s, p.y + ny * w * s); });
      for (let i = n - 1; i >= 0; i--) { const [nx, ny, w] = normales[i]; g.lineTo(pts[i].x - nx * w * s, pts[i].y - ny * w * s); }
      g.closePath(); g.fill();
      const punta = pts[n - 1], wp = normales[n - 1][2] * s * 0.55; g.beginPath(); g.arc(punta.x, punta.y, wp, 0, Math.PI * 2); g.fill();
    };
    const nombre = hojas[hoja].nombre, brillo = nombre === 'Fuego' ? '#ff6a1a' : nombre === 'Arcoíris' ? `hsl(${(t * 300) % 360} 95% 62%)` : '#7fc4ff';
    const medio = nombre === 'Fuego' ? '#ffd23c' : nombre === 'Arcoíris' ? `hsl(${(t * 300 + 120) % 360} 95% 75%)` : '#dff0ff';
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.28; g.fillStyle = brillo; forma(2.6);
    g.globalAlpha = 0.75; g.fillStyle = medio; forma(1.4);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1; g.fillStyle = '#ffffff'; forma(0.6);
  };

  m.alDibujar((g) => {
    const t = m.tiempo;
    for (const o of cosas) if (o.tipo === 'dorada' && o.quietaHasta) m.rotulo(`×${o.golpes}`, o.x, o.y - o.r - 34, 30, '#ffd23c');
    // Tajos: línea blanca nítida en el ángulo exacto del corte, que se apaga en 0,15 s
    for (let i = tajos.length - 1; i >= 0; i--) {
      const s = tajos[i], edad = (t - s.t) / 0.15;
      if (edad >= 1) { tajos.splice(i, 1); continue; }
      const dx = Math.cos(s.ang) * s.r * 1.4, dy = Math.sin(s.ang) * s.r * 1.4;
      g.lineCap = 'round'; g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,240,200,${0.5 * (1 - edad)})`; g.lineWidth = 10 * (1 - edad); g.beginPath(); g.moveTo(s.x - dx, s.y - dy); g.lineTo(s.x + dx, s.y + dy); g.stroke();
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = `rgba(255,255,255,${1 - edad})`; g.lineWidth = 3 * (1 - edad) + 1; g.beginPath(); g.moveTo(s.x - dx, s.y - dy); g.lineTo(s.x + dx, s.y + dy); g.stroke();
    }
    const estela = bot ? estelaBot.filter((p) => t - p.t < DURA_HOJA) : m.puntero.estela;
    if (bot) estelaBot.splice(0, estelaBot.length - estela.length);
    dibujarHoja(g, estela, t);
    g.globalAlpha = 1;
    if (destello > 0) { g.fillStyle = `rgba(255,255,255,${destello * (m.calma ? 0.25 : 0.8)})`; g.fillRect(0, 0, m.ancho, ALTO); }
    if (fase === 'inicio') {
      g.fillStyle = 'rgba(14,20,36,.6)'; g.fillRect(0, 0, m.ancho, ALTO);
      m.rotulo('CORTE MAESTRO', m.ancho / 2, 150, Math.round(Math.min(72, m.ancho / 9)), '#ffcf4a');
      m.rotulo('Modo libre: elige cómo jugar', m.ancho / 2, 230, 26);
      m.rotulo('Zen', m.ancho / 4, 380, 52, '#7cffcb'); m.rotulo('90 s sin bombas (1)', m.ancho / 4, 440, 20);
      m.rotulo('Clásico', (m.ancho * 3) / 4, 380, 52, '#ff8a6a'); m.rotulo('3 vidas (2)', (m.ancho * 3) / 4, 440, 20);
      m.rotulo(`Hoja: ${hojas[hoja].nombre}${hojas.length > 1 ? ' · T para cambiar' : ''}`, m.ancho / 2, 600, 20, '#fff6c9');
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
