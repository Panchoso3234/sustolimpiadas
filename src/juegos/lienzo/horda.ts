import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crearKenney, type Kenney } from '../../personaje/kenney';
import { crearMotor2D, crearMusica, piloto, texturaBrillo, texturaDe } from './motor2d';

// Horda Infinita (29-10): solo te mueves; tus armas atacan solas. Oleadas de monstruos llegan desde todos lados, sueltan
// cristales de experiencia y al subir de nivel eliges 1 de 3 mejoras. Arma al máximo + su objeto pasivo = arma
// evolucionada (sale de los cofres de los minijefes). En el torneo duras 5 minutos: al minuto 4 llega el jefe.
// En modo libre son 10 minutos, eliges personaje y el oro guardado da mejoras permanentes.
// Oleadas, mejoras ofrecidas y botín salen de la semilla.

const ALTO = 720;
type ArmaId = 'espada' | 'cuchillos' | 'rayo' | 'aura' | 'bumeran' | 'meteoros' | 'lanza' | 'escudo';
type PasivoId = 'velocidad' | 'area' | 'dano' | 'iman' | 'armadura' | 'vida' | 'enfriamiento' | 'suerte';
const ARMAS: Record<ArmaId, { nombre: string; color: string; desc: string; pasivo: PasivoId; evo: string }> = {
  espada: { nombre: 'Espada giratoria', color: '#dfe6f3', desc: 'Hojas que giran a tu alrededor', pasivo: 'dano', evo: 'Tormenta de Acero' },
  cuchillos: { nombre: 'Cuchillos', color: '#ffcf4a', desc: 'Lanza cuchillos hacia donde caminas', pasivo: 'enfriamiento', evo: 'Mil Dagas' },
  rayo: { nombre: 'Rayo en cadena', color: '#7fd8ff', desc: 'Un rayo que salta entre enemigos', pasivo: 'suerte', evo: 'Tormenta Eléctrica' },
  aura: { nombre: 'Aura de fuego', color: '#ff7a3a', desc: 'Quema a los que se acercan', pasivo: 'vida', evo: 'Sol Interior' },
  bumeran: { nombre: 'Bumerán', color: '#7cffcb', desc: 'Va al más cercano y vuelve', pasivo: 'velocidad', evo: 'Huracán' },
  meteoros: { nombre: 'Meteoros', color: '#ff5a6a', desc: 'Caen del cielo sobre los enemigos', pasivo: 'area', evo: 'Lluvia de Estrellas' },
  lanza: { nombre: 'Lanza perforante', color: '#c79bff', desc: 'Atraviesa filas enteras', pasivo: 'armadura', evo: 'Lanza Celestial' },
  escudo: { nombre: 'Escudo de cristal', color: '#9fe9ff', desc: 'Onda que empuja y daña', pasivo: 'iman', evo: 'Bastión' },
};
const PASIVOS: Record<PasivoId, { nombre: string; desc: string; color: string }> = {
  velocidad: { nombre: 'Botas', desc: '+8 % de velocidad', color: '#7cffcb' },
  area: { nombre: 'Lupa', desc: '+10 % de área', color: '#ff5a6a' },
  dano: { nombre: 'Guantes', desc: '+10 % de daño', color: '#dfe6f3' },
  iman: { nombre: 'Imán', desc: '+30 % de alcance para recoger', color: '#9fe9ff' },
  armadura: { nombre: 'Armadura', desc: '−1 de daño recibido', color: '#c79bff' },
  vida: { nombre: 'Corazón', desc: '+20 de vida máxima y cura', color: '#ff7a3a' },
  enfriamiento: { nombre: 'Reloj de arena', desc: '−8 % de espera entre ataques', color: '#ffcf4a' },
  suerte: { nombre: 'Trébol', desc: '+10 % de golpe crítico', color: '#7fd8ff' },
};
const LISTA_ARMAS = Object.keys(ARMAS) as ArmaId[], LISTA_PASIVOS = Object.keys(PASIVOS) as PasivoId[];
type TipoEnemigo = 'limo' | 'lobo' | 'golem' | 'hechicero' | 'avispa' | 'minijefe' | 'jefe';
const ENEMIGOS: Record<TipoEnemigo, { nombre: string; vida: number; vel: number; r: number; dano: number; xp: number; color: string }> = {
  limo: { nombre: 'Limos', vida: 10, vel: 72, r: 13, dano: 6, xp: 1, color: '#5fd16a' },
  lobo: { nombre: 'Lobos', vida: 9, vel: 125, r: 12, dano: 7, xp: 1, color: '#9aa3b8' },
  golem: { nombre: 'Gólems', vida: 70, vel: 42, r: 20, dano: 12, xp: 4, color: '#a8784a' },
  hechicero: { nombre: 'Hechiceros', vida: 18, vel: 60, r: 13, dano: 6, xp: 2, color: '#b06bff' },
  avispa: { nombre: 'Avispas', vida: 4, vel: 150, r: 8, dano: 4, xp: 1, color: '#ffd23c' },
  minijefe: { nombre: 'Minijefes', vida: 500, vel: 55, r: 34, dano: 20, xp: 25, color: '#e8483a' },
  jefe: { nombre: 'Jefe', vida: 6000, vel: 70, r: 52, dano: 28, xp: 0, color: '#3a2a5a' },
};
const PERSONAJES = [
  { id: 'guerrero', nombre: 'Guerrero', arma: 'espada' as ArmaId, logro: '', vida: 20, vel: 0 },
  { id: 'arquera', nombre: 'Arquera', arma: 'cuchillos' as ArmaId, logro: 'Sobrevive 3 minutos', vida: 0, vel: 0.1 },
  { id: 'maga', nombre: 'Maga', arma: 'rayo' as ArmaId, logro: 'Derrota 500 enemigos en una partida', vida: -10, vel: 0 },
];
const REG = 'susto.horda';

interface Enemigo { id: number; tipo: TipoEnemigo; x: number; y: number; vida: number; max: number; r: number; vel: number; golpe: number; cd: number[]; empujeX: number; empujeY: number; disparo: number; fase: number; carga: number; cx: number; cy: number }
interface Bala { x: number; y: number; vx: number; vy: number; dano: number; vida: number; r: number; arma: number; perfora: number; golpeados: Set<number> | null; enemiga: boolean; vuelve?: { ox: number; oy: number; ida: number } }
interface Suelto { x: number; y: number; tipo: 'xp' | 'oro' | 'comida' | 'iman' | 'bomba' | 'cofre'; valor: number; atraido: boolean }
interface Antorcha { x: number; y: number }
interface Oferta { tipo: 'arma' | 'pasivo' | 'oro'; id: string; nivel: number; evoluciona: boolean }

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'horda', { fondo: '#2d4a2a', tres: true });
  const musica = crearMusica(m.mesa, 132);
  musica.acordes([[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 44, 47]]);
  const bot = piloto();
  const r = generador(`${c.semilla}|horda`), rOfertas = generador(`${c.semilla}|ofertas`), rBotin = generador(`${c.semilla}|botin`);
  let guardado = { oro: 0, arquera: false, maga: false, numeros: true, personaje: 0 };
  try { guardado = { ...guardado, ...JSON.parse(localStorage.getItem(REG) || '{}') }; } catch { /* sin almacenamiento */ }
  const DURACION = c.libre ? 600 : 300, JEFE_EN = DURACION - 60;
  const permanentes = c.libre ? { vida: Math.min(50, Math.floor(guardado.oro / 300) * 5), vel: Math.min(0.15, Math.floor(guardado.oro / 600) * 0.03), dano: Math.min(0.25, Math.floor(guardado.oro / 900) * 0.05) } : { vida: 0, vel: 0, dano: 0 };
  const desbloqueados = PERSONAJES.map((p, i) => i === 0 || (i === 1 && guardado.arquera) || (i === 2 && guardado.maga));

  // ── Estado ──
  let fase: 'personaje' | 'juego' | 'elegir' | 'cofre' | 'fin' = c.libre && !bot ? 'personaje' : 'juego';
  let personaje = 0;
  const yo = { x: 0, y: 0, vida: 100, max: 100, dirX: 1, dirY: 0, golpeado: -9, nivel: 1, xp: 0 };
  const armas = new Map<ArmaId, { nivel: number; evo: boolean; espera: number }>();
  const pasivos = new Map<PasivoId, number>();
  const enemigos: Enemigo[] = [], balas: Bala[] = [], sueltos: Suelto[] = [], antorchas: Antorcha[] = [];
  const rayos: { puntos: [number, number][]; t: number }[] = [], ondas: { x: number; y: number; r: number; t: number; color: string }[] = [], meteoros: { x: number; y: number; t: number; r: number; dano: number }[] = [];
  const numeros: { x: number; y: number; v: number; t: number; critico: boolean }[] = [];
  let jt = 0, ids = 0, puntos = 0, oro = 0, muertes = 0, minijefes = 0, jefeMuerto = false, jefe: Enemigo | null = null, fin = '';
  let proximaAntorcha = 8, proximoMinijefe = c.libre ? 120 : 90, ofertas: Oferta[] = [], cofre: { lista: string[]; t: number } | null = null, pendientesNivel = 0;
  const danoPorArma: Record<string, number> = {}, muertesPorTipo: Record<string, number> = {}, muertesPorMinuto: number[] = [];
  const nv = (p: PasivoId) => pasivos.get(p) ?? 0;
  const mult = { get vel() { return 1 + nv('velocidad') * 0.08 + PERSONAJES[personaje].vel + permanentes.vel; }, get area() { return 1 + nv('area') * 0.1; }, get dano() { return 1 + nv('dano') * 0.1 + permanentes.dano; }, get espera() { return 1 - nv('enfriamiento') * 0.08; }, get iman() { return 60 * (1 + nv('iman') * 0.3); }, get critico() { return 0.05 + nv('suerte') * 0.1; } };

  const empezarPartida = () => {
    const p = PERSONAJES[personaje];
    yo.max = 100 + p.vida + permanentes.vida; yo.vida = yo.max;
    armas.set(p.arma, { nivel: 1, evo: false, espera: 0.5 });
    fase = 'juego'; musica.intensidad = 1;
  };

  // ── Rejilla espacial para los choques ──
  const CELDA = 64, rejilla = new Map<number, Enemigo[]>();
  const clave = (cx: number, cy: number) => (cx + 5000) * 10000 + (cy + 5000);
  const armarRejilla = () => { rejilla.clear(); for (const e of enemigos) { const k = clave(Math.floor(e.x / CELDA), Math.floor(e.y / CELDA)); const l = rejilla.get(k); if (l) l.push(e); else rejilla.set(k, [e]); } };
  const cerca = (x: number, y: number, rad: number, f: (e: Enemigo) => void) => {
    const x0 = Math.floor((x - rad) / CELDA), x1 = Math.floor((x + rad) / CELDA), y0 = Math.floor((y - rad) / CELDA), y1 = Math.floor((y + rad) / CELDA);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const l = rejilla.get(clave(cx, cy)); if (l) for (const e of l) if (e.vida > 0 && (e.x - x) ** 2 + (e.y - y) ** 2 < (rad + e.r) ** 2) f(e); }
  };
  const masCercano = (x: number, y: number, max = 600) => { let mejor: Enemigo | null = null, d = max * max; for (const e of enemigos) { const q = (e.x - x) ** 2 + (e.y - y) ** 2; if (e.vida > 0 && q < d) { d = q; mejor = e; } } return mejor; };

  /** Del mundo a la pantalla (los efectos del motor se dibujan sin la cámara). */
  const pant = (x: number, y: number) => { const z = zoom(); return [(x - yo.x) * z + m.ancho / 2, (y - yo.y) * z + ALTO / 2] as const; };
  // ── Daño ──
  const herir = (e: Enemigo, base: number, arma: number, empuje = 0, dx = 0, dy = 0) => {
    if (e.vida <= 0) return;
    const critico = rBotin() < mult.critico, v = Math.round(base * mult.dano * (critico ? 2 : 1));
    e.vida -= v; e.golpe = jt;
    const nombre = LISTA_ARMAS[arma] ?? 'otro'; danoPorArma[nombre] = (danoPorArma[nombre] ?? 0) + v;
    if (empuje && e.tipo !== 'jefe') { const l = Math.hypot(dx, dy) || 1; e.empujeX += (dx / l) * empuje * (e.tipo === 'minijefe' ? 0.2 : 1); e.empujeY += (dy / l) * empuje * (e.tipo === 'minijefe' ? 0.2 : 1); }
    if (guardado.numeros && numeros.length < 120) numeros.push({ x: e.x + (rBotin() - 0.5) * 10, y: e.y - e.r, v, t: jt, critico });
    if (e.vida <= 0) morir(e);
  };
  const morir = (e: Enemigo) => {
    muertes++; muertesPorTipo[e.tipo] = (muertesPorTipo[e.tipo] ?? 0) + 1;
    const minuto = Math.floor(jt / 60); muertesPorMinuto[minuto] = (muertesPorMinuto[minuto] ?? 0) + 1;
    const datos = ENEMIGOS[e.tipo];
    puntos += e.tipo === 'minijefe' ? 1000 : e.tipo === 'jefe' ? 5000 : 8;
    if (datos.xp) sueltos.push({ x: e.x, y: e.y, tipo: 'xp', valor: datos.xp, atraido: false });
    if (rBotin() < 0.015) sueltos.push({ x: e.x + 8, y: e.y, tipo: 'oro', valor: 5, atraido: false });
    if (e.tipo === 'minijefe') { minijefes++; sueltos.push({ x: e.x, y: e.y, tipo: 'cofre', valor: 1, atraido: false }); m.efectos.temblar(14); m.mesa.hud.aviso('¡Minijefe derrotado! Suelta un cofre', 'oro', 1.6); }
    if (e.tipo === 'jefe') { jefeMuerto = true; jefe = null; m.efectos.temblar(30); m.efectos.congelar(200); fin = '¡Derrotaste al jefe!'; }
    if (enemigos.length < 250 || e.tipo !== 'avispa') m.efectos.chispas(...pant(e.x, e.y), [datos.color, '#ffffff'], e.r > 20 ? 24 : 5, e.r > 20 ? 400 : 160, { gravedad: 0, dura: 0.35 });
    if (rBotin() < 0.2) m.mesa.sonido.tono(300 + rBotin() * 200, 0.04, 'square', 0.025);
  };
  const herirJugador = (v: number) => {
    if (jt - yo.golpeado < 0.5) return;
    yo.golpeado = jt;
    yo.vida -= Math.max(1, v - nv('armadura'));
    m.efectos.temblar(8); m.mesa.sonido.tono(160, 0.12, 'sawtooth', 0.08);
    try { navigator.vibrate?.(40); } catch { /* sin vibración */ }
    if (yo.vida <= 0) { yo.vida = 0; fin = 'Te derrotaron'; terminar(); }
  };

  // ── Aparición de enemigos (más cada minuto) ──
  const queTipo = (t: number): TipoEnemigo => {
    const k = r(), min = t / 60;
    if (min < 1) return k < 0.85 ? 'limo' : 'lobo';
    if (min < 2) return k < 0.5 ? 'limo' : k < 0.85 ? 'lobo' : 'hechicero';
    if (min < 3) return k < 0.3 ? 'limo' : k < 0.55 ? 'lobo' : k < 0.75 ? 'golem' : k < 0.88 ? 'hechicero' : 'avispa';
    return k < 0.2 ? 'limo' : k < 0.4 ? 'lobo' : k < 0.55 ? 'golem' : k < 0.67 ? 'hechicero' : 'avispa';
  };
  const radioVista = () => Math.max(m.ancho / zoom(), ALTO / zoom()) / 2 + 50;
  const aparecer = (tipo: TipoEnemigo, ang = r() * Math.PI * 2, dist = radioVista()) => {
    const d = ENEMIGOS[tipo], escala = 1 + (jt / 60) * 0.45;
    const vida = Math.round(d.vida * (tipo === 'jefe' ? 1 : escala));
    const e: Enemigo = { id: ids++, tipo, x: yo.x + Math.cos(ang) * dist, y: yo.y + Math.sin(ang) * dist, vida, max: vida, r: d.r, vel: d.vel * (0.9 + r() * 0.2), golpe: -9, cd: [0, 0, 0, 0, 0, 0, 0, 0], empujeX: 0, empujeY: 0, disparo: jt + 1 + r() * 2, fase: 0, carga: 0, cx: 0, cy: 0 };
    enemigos.push(e);
    return e;
  };
  let acumAparicion = 0;
  const aparicionesPorSegundo = (t: number) => Math.min(30, 3.5 + t * 0.07 + (t > 180 ? (t - 180) * 0.08 : 0));
  const MAX_ENEMIGOS = 500;

  // ── Mejoras ──
  const evolucionables = () => LISTA_ARMAS.filter((a) => { const w = armas.get(a); return w && w.nivel >= 5 && !w.evo && nv(ARMAS[a].pasivo) > 0; });
  const generarOfertas = () => {
    const pool: Oferta[] = [];
    for (const a of LISTA_ARMAS) { const w = armas.get(a); if (w ? w.nivel < 5 : armas.size < 6) pool.push({ tipo: 'arma', id: a, nivel: (w?.nivel ?? 0) + 1, evoluciona: false }); }
    for (const p of LISTA_PASIVOS) { const n = nv(p); if (n ? n < 5 : pasivos.size < 6) pool.push({ tipo: 'pasivo', id: p, nivel: n + 1, evoluciona: false }); }
    // Marca lo que acerca a una evolución
    for (const o of pool) o.evoluciona = o.tipo === 'arma' ? !!pasivos.get(ARMAS[o.id as ArmaId].pasivo) || false : LISTA_ARMAS.some((a) => armas.has(a) && ARMAS[a].pasivo === o.id);
    const lista: Oferta[] = [];
    while (lista.length < 3 && pool.length) {
      // La suerte favorece lo que ya tienes
      const pesos = pool.map((o) => (o.nivel > 1 ? 1.5 + nv('suerte') * 0.2 : 1));
      let k = rOfertas() * pesos.reduce((a, b) => a + b, 0), i = 0;
      while (k > pesos[i]) { k -= pesos[i]; i++; }
      lista.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
    }
    while (lista.length < 3) lista.push({ tipo: 'oro', id: 'oro', nivel: 1, evoluciona: false });
    return lista;
  };
  const aplicar = (o: Oferta) => {
    if (o.tipo === 'arma') { const w = armas.get(o.id as ArmaId); if (w) w.nivel++; else armas.set(o.id as ArmaId, { nivel: 1, evo: false, espera: 0.3 }); }
    else if (o.tipo === 'pasivo') { pasivos.set(o.id as PasivoId, nv(o.id as PasivoId) + 1); if (o.id === 'vida') { yo.max += 20; yo.vida = Math.min(yo.max, yo.vida + 30); } }
    else { oro += 25; yo.vida = Math.min(yo.max, yo.vida + 20); }
    m.mesa.sonido.tono(660, 0.12, 'triangle', 0.08); m.mesa.sonido.tono(990, 0.16, 'triangle', 0.07, 0.07);
  };
  const subirNivel = () => { pendientesNivel++; if (fase === 'juego') abrirOfertas(); };
  const abrirOfertas = () => { ofertas = generarOfertas(); fase = 'elegir'; pendientesNivel--; m.mesa.sonido.tono(523, 0.2, 'triangle', 0.08); m.mesa.sonido.tono(784, 0.3, 'triangle', 0.08, 0.1); };
  const elegir = (k: number) => {
    if (fase !== 'elegir' || !ofertas[k]) return;
    aplicar(ofertas[k]);
    fase = 'juego';
    if (pendientesNivel > 0) abrirOfertas();
  };
  const abrirCofre = () => {
    const k = rBotin(), n = k < 0.1 ? 5 : k < 0.4 ? 3 : 1, lista: string[] = [];
    for (let i = 0; i < n; i++) {
      const evo = evolucionables()[0];
      if (evo) { armas.get(evo)!.evo = true; lista.push(`¡EVOLUCIÓN! ${ARMAS[evo].evo}`); continue; }
      const o = generarOfertas()[0];
      aplicar(o);
      lista.push(o.tipo === 'arma' ? `${ARMAS[o.id as ArmaId].nombre} nv. ${o.nivel}` : o.tipo === 'pasivo' ? `${PASIVOS[o.id as PasivoId].nombre} nv. ${o.nivel}` : 'Oro +25');
    }
    cofre = { lista, t: m.tiempo }; fase = 'cofre';
    m.efectos.temblar(12);
    for (let i = 0; i < 6; i++) m.mesa.sonido.tono(523 * Math.pow(1.122, i), 0.2, 'triangle', 0.07, i * 0.09);
  };

  // ── Armas ──
  const IDX = Object.fromEntries(LISTA_ARMAS.map((a, i) => [a, i])) as Record<ArmaId, number>;
  const disparar = (x: number, y: number, ang: number, vel: number, dano: number, rad: number, arma: ArmaId, perfora: number, vida = 1.6, extra: Partial<Bala> = {}) =>
    balas.push({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, dano, vida, r: rad, arma: IDX[arma], perfora, golpeados: new Set(), enemiga: false, ...extra });
  const usarArmas = (dt: number) => {
    const A = mult.area;
    for (const [id, w] of armas) {
      const lv = w.nivel + (w.evo ? 3 : 0), i = IDX[id];
      if (id === 'espada') {
        const n = w.evo ? 5 : [1, 2, 2, 3, 3][w.nivel - 1], rad = (75 + lv * 4) * A;
        for (let k = 0; k < n; k++) { const a = jt * (w.evo ? 4.5 : 3.2) + (k * Math.PI * 2) / n, x = yo.x + Math.cos(a) * rad, y = yo.y + Math.sin(a) * rad; cerca(x, y, 20 * A, (e) => { if (jt > e.cd[i]) { e.cd[i] = jt + 0.4; herir(e, 10 + lv * 4, i, 120, e.x - yo.x, e.y - yo.y); } }); }
        continue;
      }
      if (id === 'aura') {
        if (w.evo) yo.vida = Math.min(yo.max, yo.vida + dt * 1.5);
        if ((w.espera -= dt) > 0) continue;
        w.espera = 0.5;
        cerca(yo.x, yo.y, (70 + lv * 10) * A, (e) => herir(e, 4 + lv * 2, i));
        continue;
      }
      if ((w.espera -= dt) > 0) continue;
      const blanco = masCercano(yo.x, yo.y, 520);
      if (id === 'cuchillos') {
        w.espera = Math.max(0.25, 1 - w.nivel * 0.08) * mult.espera * (w.evo ? 0.5 : 1);
        const n = w.evo ? 8 : w.nivel, base = Math.atan2(yo.dirY, yo.dirX);
        for (let k = 0; k < n; k++) disparar(yo.x, yo.y, base + (k - (n - 1) / 2) * 0.12, 560, 8 + lv * 3, 7, id, w.evo ? 3 : 1, 1.2);
      } else if (id === 'rayo') {
        w.espera = 1.6 * mult.espera * (w.evo ? 0.6 : 1);
        if (!blanco) { w.espera = 0.2; continue; }
        const puntosRayo: [number, number][] = [[yo.x, yo.y]], vistos = new Set<number>();
        let actual: Enemigo | null = blanco;
        for (let k = 0; k <= w.nivel + (w.evo ? 4 : 0) && actual; k++) {
          puntosRayo.push([actual.x, actual.y]); vistos.add(actual.id); herir(actual, 14 + lv * 5, i);
          let sig: Enemigo | null = null, d = (140 * A) ** 2;
          cerca(actual.x, actual.y, 140 * A, (e) => { const q = (e.x - actual!.x) ** 2 + (e.y - actual!.y) ** 2; if (!vistos.has(e.id) && q < d) { d = q; sig = e; } });
          actual = sig;
        }
        rayos.push({ puntos: puntosRayo, t: jt });
        m.mesa.sonido.tono(1400, 0.05, 'sawtooth', 0.03);
      } else if (id === 'bumeran') {
        w.espera = 1.4 * mult.espera;
        if (!blanco) { w.espera = 0.2; continue; }
        const n = w.evo ? 3 : 1 + Math.floor(w.nivel / 3), base = Math.atan2(blanco.y - yo.y, blanco.x - yo.x);
        for (let k = 0; k < n; k++) disparar(yo.x, yo.y, base + (k - (n - 1) / 2) * 0.5, 420, 12 + lv * 4, (w.evo ? 20 : 13) * A, id, 999, 3, { golpeados: null, vuelve: { ox: yo.x, oy: yo.y, ida: 0.7 } });
      } else if (id === 'meteoros') {
        w.espera = 2.2 * mult.espera;
        const vivos = enemigos.filter((e) => e.vida > 0 && Math.abs(e.x - yo.x) < m.ancho / zoom() / 2 && Math.abs(e.y - yo.y) < ALTO / zoom() / 2);
        const n = w.nivel * (w.evo ? 2 : 1);
        for (let k = 0; k < n; k++) { const e = vivos[Math.floor(rBotin() * vivos.length)]; const x = e ? e.x : yo.x + (rBotin() - 0.5) * 400, y = e ? e.y : yo.y + (rBotin() - 0.5) * 300; meteoros.push({ x, y, t: jt + 0.6 + k * 0.08, r: 60 * A * (w.evo ? 1.4 : 1), dano: 25 + lv * 8 }); }
      } else if (id === 'lanza') {
        w.espera = 1.2 * mult.espera;
        if (!blanco) { w.espera = 0.2; continue; }
        const n = 1 + Math.floor(w.nivel / 2) + (w.evo ? 2 : 0), base = Math.atan2(blanco.y - yo.y, blanco.x - yo.x);
        for (let k = 0; k < n; k++) disparar(yo.x, yo.y, base + (k - (n - 1) / 2) * 0.18, 700, 18 + lv * 6, (w.evo ? 14 : 9) * A, id, 999, 1.2);
      } else if (id === 'escudo') {
        w.espera = 3 * mult.espera * (w.evo ? 0.6 : 1);
        const rad = (110 + lv * 15) * A;
        cerca(yo.x, yo.y, rad, (e) => herir(e, 10 + lv * 5, i, 260, e.x - yo.x, e.y - yo.y));
        ondas.push({ x: yo.x, y: yo.y, r: rad, t: jt, color: ARMAS.escudo.color });
      }
    }
  };

  // ── Entrada: teclas o arrastrar (palanca virtual) ──
  let palanca: { x: number; y: number } | null = null;
  m.alTocar((x, y) => {
    if (fase === 'personaje') { const k = Math.floor((x / m.ancho) * 3); if (desbloqueados[k]) { personaje = k; empezarPartida(); } return; }
    if (fase === 'elegir') { const k = tarjetaEn(x, y); if (k >= 0) elegir(k); return; }
    if (fase === 'cofre') { if (m.tiempo - cofre!.t > 1.2) { fase = 'juego'; cofre = null; if (pendientesNivel > 0) abrirOfertas(); } return; }
    palanca = { x, y };
  });
  m.alSoltar(() => { palanca = null; });
  m.alTecla((k) => {
    if (fase === 'elegir' && ['1', '2', '3'].includes(k)) elegir(Number(k) - 1);
    if (fase === 'personaje' && ['1', '2', '3'].includes(k) && desbloqueados[Number(k) - 1]) { personaje = Number(k) - 1; empezarPartida(); }
    if (fase === 'cofre' && (k === ' ' || k === 'Enter') && m.tiempo - cofre!.t > 1.2) { fase = 'juego'; cofre = null; if (pendientesNivel > 0) abrirOfertas(); }
    if (k === 'n') { guardado.numeros = !guardado.numeros; m.mesa.hud.aviso(`Números de daño: ${guardado.numeros ? 'sí' : 'no'}`, '', 1); }
  });
  const direccion = () => {
    let dx = 0, dy = 0;
    const T = m.teclas;
    if (T.has('ArrowLeft') || T.has('a')) dx--; if (T.has('ArrowRight') || T.has('d')) dx++;
    if (T.has('ArrowUp') || T.has('w')) dy--; if (T.has('ArrowDown') || T.has('s')) dy++;
    if (palanca && m.puntero.abajo) { const px = m.puntero.x - palanca.x, py = m.puntero.y - palanca.y, l = Math.hypot(px, py); if (l > 8) { dx = px / Math.max(l, 50); dy = py / Math.max(l, 50); } }
    return [dx, dy];
  };

  // ── Bots de prueba: el bueno huye del grupo y recoge cristales; el torpe camina al azar ──
  const rb = generador('bot-horda');
  let botDir = [1, 0], botCambio = 0;
  const pilotar = (): [number, number] => {
    if (fase === 'elegir') { const k = bot === 'torpe' ? Math.floor(rb() * 3) : Math.max(0, ofertas.findIndex((o) => o.evoluciona || (o.tipo === 'arma' && armas.has(o.id as ArmaId)))); elegir(k); return [0, 0]; }
    if (fase === 'cofre') { if (m.tiempo - cofre!.t > 1.3) { fase = 'juego'; cofre = null; if (pendientesNivel > 0) abrirOfertas(); } return [0, 0]; }
    if (bot === 'torpe') { if (jt > botCambio) { botCambio = jt + 1; const a = rb() * Math.PI * 2; botDir = [Math.cos(a), Math.sin(a)]; } return botDir as [number, number]; }
    let fx = 0, fy = 0;
    for (const e of enemigos) { const dx = yo.x - e.x, dy = yo.y - e.y, d2 = dx * dx + dy * dy; if (d2 < (e.tipo === 'jefe' || e.tipo === 'minijefe' ? 220 : 95) ** 2) { const w = (e.tipo === 'jefe' || e.tipo === 'minijefe' ? 4 : 1) / Math.max(400, d2); fx += dx * w; fy += dy * w; } }
    for (const b of balas) if (b.enemiga) { const dx = yo.x - b.x, dy = yo.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 150 * 150) { fx += (dx * 2) / Math.max(200, d2); fy += (dy * 2) / Math.max(200, d2); } }
    const premio = sueltos.filter((s) => s.tipo !== 'xp' || (s.x - yo.x) ** 2 + (s.y - yo.y) ** 2 < 250 ** 2).sort((a, b) => (a.x - yo.x) ** 2 + (a.y - yo.y) ** 2 - ((b.x - yo.x) ** 2 + (b.y - yo.y) ** 2))[0];
    const amenaza = Math.hypot(fx, fy);
    if (amenaza < 0.004) { const e = masCercano(yo.x, yo.y, 400); if (e && e.tipo !== 'jefe') { const dx = e.x - yo.x, dy = e.y - yo.y, l = Math.hypot(dx, dy) || 1; fx += (dx / l) * 0.02; fy += (dy / l) * 0.02; } }
    if (premio && amenaza < 0.02) { const dx = premio.x - yo.x, dy = premio.y - yo.y, l = Math.hypot(dx, dy) || 1; fx += (dx / l) * 0.03; fy += (dy / l) * 0.03; }
    // Girar alrededor (kite) para no quedar encerrado
    fx += -fy * 0.4; fy += fx * 0.1;
    const l = Math.hypot(fx, fy);
    return l > 0.001 ? [fx / l, fy / l] : [0, 0];
  };

  // ── Paso ──
  m.alPaso((dt) => {
    if (fase === 'fin' || fase === 'personaje') return;
    const dir = bot ? pilotar() : direccion();
    if (fase !== 'juego') return;
    jt += dt;
    // Movimiento
    let [dx, dy] = dir; const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    if (l > 0.05) { yo.dirX = dx / Math.max(l, 1e-6); yo.dirY = dy / Math.max(l, 1e-6); }
    const vel = 170 * mult.vel;
    yo.x += dx * vel * dt; yo.y += dy * vel * dt;
    // Aparición
    acumAparicion += aparicionesPorSegundo(jt) * dt;
    while (acumAparicion >= 1) {
      acumAparicion--;
      if (enemigos.length >= MAX_ENEMIGOS) continue;
      const tipo = queTipo(jt);
      if (tipo === 'avispa') { const a = r() * Math.PI * 2; for (let k = 0; k < 6; k++) aparecer('avispa', a + (r() - 0.5) * 0.3); }
      else aparecer(tipo);
    }
    if (jt >= proximoMinijefe && jt < JEFE_EN) { proximoMinijefe += c.libre ? 120 : 90; aparecer('minijefe'); m.mesa.hud.aviso('¡Se acerca un minijefe!', 'mal', 1.6); }
    if (!jefe && !jefeMuerto && jt >= JEFE_EN) { jefe = aparecer('jefe'); jefe.vida = jefe.max = Math.round(6000 * (c.libre ? 2 : 1)); m.mesa.hud.aviso('¡EL JEFE FINAL!', 'mal', 2.4); m.efectos.temblar(20); musica.intensidad = 2; musica.acordes([[40, 43, 47], [41, 44, 48], [38, 41, 45], [39, 43, 46]]); }
    if (jt >= proximaAntorcha) { proximaAntorcha = jt + 14 + r() * 10; const a = r() * Math.PI * 2, d = 250 + r() * 250; antorchas.push({ x: yo.x + Math.cos(a) * d, y: yo.y + Math.sin(a) * d }); if (antorchas.length > 8) antorchas.shift(); }
    armarRejilla();
    // Enemigos: van hacia ti, se separan entre sí y algunos disparan
    for (const e of enemigos) {
      if (e.vida <= 0) continue;
      let ex = yo.x - e.x, ey = yo.y - e.y; const d = Math.hypot(ex, ey) || 1; ex /= d; ey /= d;
      let v = e.vel;
      if (e.tipo === 'hechicero') { if (d < 260) v = -e.vel * 0.5; if (jt > e.disparo && d < 500) { e.disparo = jt + 2.6; balas.push({ x: e.x, y: e.y, vx: ex * 210, vy: ey * 210, dano: 7, vida: 3, r: 7, arma: -1, perfora: 1, golpeados: null, enemiga: true }); } }
      if (e.tipo === 'jefe') {
        // Patrones del jefe: carga, círculo de proyectiles e invocación
        if (jt > e.disparo) {
          e.fase = (e.fase + 1) % 3; e.disparo = jt + 4;
          if (e.fase === 0) { e.carga = jt + 1.1; e.cx = ex; e.cy = ey; m.mesa.hud.aviso('¡Carga!', 'mal', 0.8); }
          else if (e.fase === 1) for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; balas.push({ x: e.x, y: e.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, dano: 12, vida: 4, r: 9, arma: -1, perfora: 1, golpeados: null, enemiga: true }); }
          else for (let k = 0; k < 8; k++) aparecer('lobo', (k / 8) * Math.PI * 2, 120).x = e.x + Math.cos(k) * 80;
        }
        if (jt < e.carga) { if (jt > e.carga - 0.6) { ex = e.cx; ey = e.cy; v = 520; } else v = 0; }
      }
      e.x += (ex * v + e.empujeX) * dt; e.y += (ey * v + e.empujeY) * dt;
      e.empujeX *= Math.pow(0.002, dt); e.empujeY *= Math.pow(0.002, dt);
      if (d < e.r + 14) herirJugador(ENEMIGOS[e.tipo].dano);
      if (d > radioVista() * 2.2 && e.tipo !== 'jefe' && e.tipo !== 'minijefe') { const a = Math.atan2(-ey, -ex) + Math.PI + (r() - 0.5); e.x = yo.x + Math.cos(a) * radioVista(); e.y = yo.y + Math.sin(a) * radioVista(); }
    }
    // Separación (solo con los de la misma celda: barato y suficiente)
    for (const l2 of rejilla.values()) for (let a = 0; a < l2.length; a++) for (let b = a + 1; b < l2.length && b < a + 6; b++) {
      const p = l2[a], q = l2[b], dx2 = q.x - p.x, dy2 = q.y - p.y, dd = Math.hypot(dx2, dy2), min = p.r + q.r;
      if (dd > 0.01 && dd < min) { const k = ((min - dd) / dd) * 0.25; p.x -= dx2 * k; p.y -= dy2 * k; q.x += dx2 * k; q.y += dy2 * k; }
    }
    if (fase !== 'juego') return;
    usarArmas(dt);
    // Balas
    for (const b of balas) {
      b.vida -= dt;
      if (b.vuelve) { b.vuelve.ida -= dt; if (b.vuelve.ida < 0) { const ax = yo.x - b.x, ay = yo.y - b.y, l3 = Math.hypot(ax, ay) || 1; b.vx = (ax / l3) * 480; b.vy = (ay / l3) * 480; if (l3 < 20) b.vida = 0; } }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.enemiga) {
        if (armas.get('escudo')?.evo && Math.hypot(b.x - yo.x, b.y - yo.y) < 90) { b.vida = 0; continue; }
        if (Math.hypot(b.x - yo.x, b.y - yo.y) < b.r + 12) { herirJugador(b.dano); b.vida = 0; }
        continue;
      }
      cerca(b.x, b.y, b.r, (e) => {
        if (b.vida <= 0) return;
        if (b.golpeados) { if (b.golpeados.has(e.id)) return; b.golpeados.add(e.id); }
        else { if (jt < e.cd[b.arma]) return; e.cd[b.arma] = jt + 0.4; }
        herir(e, b.dano, b.arma, 60, b.vx, b.vy);
        if (--b.perfora <= 0) b.vida = 0;
      });
      for (const t of antorchas) if (Math.hypot(t.x - b.x, t.y - b.y) < 20) romperAntorcha(t);
    }
    for (let k = balas.length - 1; k >= 0; k--) if (balas[k].vida <= 0) balas.splice(k, 1);
    for (const t of [...antorchas]) if (Math.hypot(t.x - yo.x, t.y - yo.y) < 90 * mult.area && armas.has('aura')) romperAntorcha(t);
    // Meteoros
    for (let k = meteoros.length - 1; k >= 0; k--) { const me = meteoros[k]; if (jt >= me.t) { cerca(me.x, me.y, me.r, (e) => herir(e, me.dano, IDX.meteoros, 140, e.x - me.x, e.y - me.y)); ondas.push({ x: me.x, y: me.y, r: me.r, t: jt, color: '#ff8a3a' }); m.efectos.chispas(...pant(me.x, me.y), ['#ffd23c', '#ff6a1a', '#ffffff'], 10, 260, { gravedad: 0 }); meteoros.splice(k, 1); } }
    for (let k = enemigos.length - 1; k >= 0; k--) if (enemigos[k].vida <= 0) enemigos.splice(k, 1);
    // Recoger
    const iman = mult.iman;
    for (const s of sueltos) {
      const dx3 = yo.x - s.x, dy3 = yo.y - s.y, d = Math.hypot(dx3, dy3);
      if (d < iman || s.atraido) { s.atraido = true; const v = Math.max(300, 700 - d); s.x += (dx3 / (d || 1)) * v * dt; s.y += (dy3 / (d || 1)) * v * dt; }
      if (d < 18) { recoger(s); s.valor = -1; }
    }
    for (let k = sueltos.length - 1; k >= 0; k--) if (sueltos[k].valor < 0) sueltos.splice(k, 1);
    if (sueltos.length > 400) sueltos.splice(0, sueltos.length - 400);
    // Fin por tiempo
    if (jefeMuerto) { puntos += Math.round((DURACION - jt) * 20); terminar(); return; }
    if (jt >= DURACION) { fin = 'Sobreviviste'; terminar(); return; }
    // Marcador
    const marca = Math.round(jt * 20) + puntos + oro * 5;
    const quedan = Math.max(0, DURACION - jt);
    m.mesa.hud.tiempo(`${Math.floor(quedan / 60)}:${String(Math.floor(quedan % 60)).padStart(2, '0')}`);
    m.mesa.hud.puntos(String(marca));
    m.mesa.hud.extra(`Nv. ${yo.nivel} · ${muertes} derrotados${oro ? ` · ${oro} oro` : ''}`);
    if (!jefe) musica.intensidad = enemigos.length > 150 ? 2 : 1;
  });
  const xpParaNivel = () => 5 + yo.nivel * 6 + Math.max(0, yo.nivel - 20) * 10;
  const recoger = (s: Suelto) => {
    if (s.tipo === 'xp') { yo.xp += s.valor; while (yo.xp >= xpParaNivel()) { yo.xp -= xpParaNivel(); yo.nivel++; subirNivel(); } if (rBotin() < 0.3) m.mesa.sonido.tono(1100 + rBotin() * 300, 0.04, 'sine', 0.025); }
    else if (s.tipo === 'oro') { oro += s.valor; m.mesa.sonido.tono(1500, 0.06, 'triangle', 0.04); }
    else if (s.tipo === 'comida') { yo.vida = Math.min(yo.max, yo.vida + 30); m.efectos.flotar(m.ancho / 2, ALTO / 2 - 40, '+30 vida', '#7cffcb', 26); }
    else if (s.tipo === 'iman') { for (const o of sueltos) if (o.tipo === 'xp') o.atraido = true; m.mesa.hud.aviso('¡Imán! Todos los cristales vienen a ti', 'oro', 1.2); }
    else if (s.tipo === 'bomba') { const R = radioVista(); for (const e of enemigos) if (e.tipo !== 'jefe' && Math.hypot(e.x - yo.x, e.y - yo.y) < R) herir(e, 9999, -1); m.efectos.temblar(24); destello = 1; m.mesa.sonido.tono(80, 0.5, 'sawtooth', 0.12); }
    else if (s.tipo === 'cofre') abrirCofre();
  };
  const romperAntorcha = (t: Antorcha) => {
    const i = antorchas.indexOf(t); if (i < 0) return; antorchas.splice(i, 1);
    const k = rBotin(), tipo: Suelto['tipo'] = k < 0.45 ? 'comida' : k < 0.75 ? 'oro' : k < 0.88 ? 'iman' : 'bomba';
    sueltos.push({ x: t.x, y: t.y, tipo, valor: tipo === 'oro' ? 25 : 1, atraido: false });
    m.efectos.chispas(...pant(t.x, t.y), ['#ffd23c', '#ff6a1a'], 14, 200);
  };
  let destello = 0;

  // ── Dibujo ──
  const zoom = () => Math.min(1, m.ancho / 640);
  const tarjetas = () => {
    const vertical = m.ancho < 700, w = vertical ? m.ancho - 40 : Math.min(300, (m.ancho - 80) / 3), h = vertical ? 150 : 300;
    return [0, 1, 2].map((k) => vertical ? { x: 20, y: 140 + k * (h + 16), w, h } : { x: m.ancho / 2 - (w * 3 + 40) / 2 + k * (w + 20), y: 210, w, h });
  };
  const tarjetaEn = (x: number, y: number) => tarjetas().findIndex((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h);
  const texto = (g: CanvasRenderingContext2D, txt: string, x: number, y: number, tam: number, color = '#ffffff', alinea: CanvasTextAlign = 'center') => {
    g.font = `900 ${tam}px Nunito, sans-serif`; g.textAlign = alinea; g.textBaseline = 'middle';
    g.lineWidth = tam * 0.15; g.strokeStyle = 'rgba(10,14,24,.85)'; g.strokeText(txt, x, y); g.fillStyle = color; g.fillText(txt, x, y);
  };
  const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const pintarEnemigo = (g: CanvasRenderingContext2D, e: Enemigo, t: number) => {
    const d = ENEMIGOS[e.tipo], blanco = t - e.golpe < 0.08;
    g.save(); g.translate(e.x, e.y);
    const color = blanco ? '#ffffff' : d.color;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, e.r * 0.8, e.r, e.r * 0.35, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = color;
    const salto = Math.abs(Math.sin(t * 8 + e.id)) * 3;
    if (e.tipo === 'limo') { g.beginPath(); g.ellipse(0, -salto * 0.5, e.r * (1 + salto * 0.03), e.r * (0.85 - salto * 0.02), 0, Math.PI, 0); g.lineTo(e.r, e.r * 0.5); g.lineTo(-e.r, e.r * 0.5); g.fill(); }
    else if (e.tipo === 'lobo') { const a = Math.atan2(yo.y - e.y, yo.x - e.x); g.rotate(a); g.beginPath(); g.moveTo(e.r * 1.3, 0); g.lineTo(-e.r, -e.r * 0.8); g.lineTo(-e.r * 0.6, 0); g.lineTo(-e.r, e.r * 0.8); g.closePath(); g.fill(); g.rotate(-a); }
    else if (e.tipo === 'golem' || e.tipo === 'minijefe') { g.fillRect(-e.r, -e.r - salto * 0.3, e.r * 2, e.r * 1.8); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(-e.r, e.r * 0.3, e.r * 2, e.r * 0.5); }
    else if (e.tipo === 'hechicero') { g.beginPath(); g.moveTo(0, -e.r * 1.5); g.lineTo(e.r, e.r); g.lineTo(-e.r, e.r); g.closePath(); g.fill(); g.fillStyle = '#ffd23c'; g.beginPath(); g.arc(e.r * 0.9, -e.r * 0.3, 4, 0, Math.PI * 2); g.fill(); }
    else if (e.tipo === 'avispa') { g.beginPath(); g.ellipse(0, 0, e.r, e.r * 0.7, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(-2, -e.r * 0.8, e.r * 0.6, e.r * 0.3 * Math.abs(Math.sin(t * 40)), 0, 0, Math.PI * 2); g.fill(); }
    else { // jefe
      g.beginPath(); g.arc(0, 0, e.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = blanco ? '#ffffff' : '#7a3aff'; g.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.35; g.lineTo(Math.cos(a) * e.r * 1.4, Math.sin(a) * e.r * 1.4); g.lineTo(Math.cos(a + 0.17) * e.r * 0.9, Math.sin(a + 0.17) * e.r * 0.9); } g.fill();
      if (t < e.carga) { g.strokeStyle = '#ff2e4d'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(e.cx * 300, e.cy * 300); g.stroke(); }
    }
    // Ojos
    if (e.tipo !== 'avispa') { g.fillStyle = e.tipo === 'jefe' || e.tipo === 'minijefe' ? '#ffd23c' : '#ffffff'; const ojo = Math.max(2, e.r * 0.18); g.beginPath(); g.arc(-e.r * 0.3, -e.r * 0.15, ojo, 0, Math.PI * 2); g.arc(e.r * 0.3, -e.r * 0.15, ojo, 0, Math.PI * 2); g.fill(); g.fillStyle = '#121218'; g.beginPath(); g.arc(-e.r * 0.3, -e.r * 0.12, ojo * 0.5, 0, Math.PI * 2); g.arc(e.r * 0.3, -e.r * 0.12, ojo * 0.5, 0, Math.PI * 2); g.fill(); }
    if (e.tipo === 'minijefe' || e.tipo === 'golem') { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(-e.r, -e.r - 12, e.r * 2, 5); g.fillStyle = '#ff5a6a'; g.fillRect(-e.r, -e.r - 12, e.r * 2 * (e.vida / e.max), 5); }
    g.restore();
  };
  const pintarHeroe = (g: CanvasRenderingContext2D, t: number) => {
    const p = PERSONAJES[personaje], golpeado = jt - yo.golpeado < 0.15, paso = Math.sin(t * 12) * 2;
    g.save(); g.translate(yo.x, yo.y);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(0, 14, 14, 5, 0, 0, Math.PI * 2); g.fill();
    const capa = p.id === 'guerrero' ? '#3f7bff' : p.id === 'arquera' ? '#2fcf7a' : '#b06bff';
    g.fillStyle = golpeado ? '#ffffff' : capa; g.beginPath(); g.moveTo(-12, 12 + paso * 0.3); g.lineTo(12, 12 - paso * 0.3); g.lineTo(8, -6); g.lineTo(-8, -6); g.closePath(); g.fill();
    g.fillStyle = golpeado ? '#ffffff' : '#ffd9b3'; g.beginPath(); g.arc(0, -12, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = p.id === 'maga' ? '#5a2a8a' : p.id === 'arquera' ? '#8a5a2a' : '#c9ced8';
    if (p.id === 'maga') { g.beginPath(); g.moveTo(-11, -15); g.lineTo(11, -15); g.lineTo(2, -36); g.closePath(); g.fill(); }
    else { g.beginPath(); g.arc(0, -15, 10, Math.PI, 0); g.fill(); }
    g.fillStyle = '#121218'; g.fillRect(yo.dirX * 3 - 4, -13, 2.5, 3); g.fillRect(yo.dirX * 3 + 2, -13, 2.5, 3);
    g.restore();
    // Barra de vida
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(yo.x - 22, yo.y + 22, 44, 6);
    g.fillStyle = yo.vida / yo.max < 0.3 ? '#ff2e4d' : '#5fd16a'; g.fillRect(yo.x - 22, yo.y + 22, 44 * (yo.vida / yo.max), 6);
  };

  // ── Capa 3D: vista isométrica. Los enemigos van por lotes (una llamada de dibujo por tipo, aunque sean 500),
  // con sombras de mancha; el protagonista es el personaje del jugador. La cámara ve el suelo igual que la vista 2D
  // (mismas coordenadas en pantalla), así los números, rayos y ondas del lienzo 2D quedan en su lugar. ──
  const T = m.tres;
  const INCLINA = 0.75; // la cámara mira el suelo a unos 43° (se ven el volumen y las caras)
  if (T) {
    const E = T.escena;
    E.environment = T.entorno(); E.environmentIntensity = 0.25;
    E.fog = new THREE.Fog(0x9fc4e8, 1800, 3200);
    const camara = new THREE.OrthographicCamera(-640, 640, 360, -360, 1, 4000);
    T.camara = camara;
    const cielo = new THREE.HemisphereLight(0xdff0ff, 0x3a5a2a, 1.3), sol = new THREE.DirectionalLight(0xfff0d0, 2.1);
    sol.position.set(-0.5, 1, 0.4); E.add(cielo, sol, sol.target);
    // Pradera: una textura de pasto con flores que se repite; el plano sigue al jugador y la textura se corre
    const texPasto = texturaDe(512, 512, (cg) => {
      cg.fillStyle = '#4a8a40'; cg.fillRect(0, 0, 512, 512);
      const rp = generador('pasto');
      for (let k = 0; k < 18; k++) { cg.fillStyle = rp() < 0.5 ? 'rgba(70,130,60,.5)' : 'rgba(50,100,45,.5)'; cg.beginPath(); cg.ellipse(rp() * 512, rp() * 512, 40 + rp() * 80, 30 + rp() * 60, rp() * 3, 0, Math.PI * 2); cg.fill(); }
      for (let k = 0; k < 2200; k++) { cg.fillStyle = `rgba(${rp() < 0.5 ? '30,70,30' : '120,180,90'},${0.3 + rp() * 0.4})`; cg.fillRect(rp() * 512, rp() * 512, 2, 5 + rp() * 5); }
      for (let k = 0; k < 40; k++) { cg.fillStyle = ['#ffd23c', '#ff8fc8', '#ffffff', '#b06bff'][k % 4]; const x = rp() * 512, y = rp() * 512; for (let p = 0; p < 4; p++) cg.fillRect(x + Math.cos(p * 1.57) * 3, y + Math.sin(p * 1.57) * 3, 3, 3); }
    }, true);
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: texPasto, roughness: 1 }));
    suelo.rotation.x = -Math.PI / 2; E.add(suelo);
    // Piedras y arbustos fijos del mundo (por casilla, siempre los mismos)
    const geoPiedra = new THREE.DodecahedronGeometry(1, 0), geoArbusto = new THREE.IcosahedronGeometry(1, 1);
    const piedras = new THREE.InstancedMesh(geoPiedra, new THREE.MeshStandardMaterial({ color: 0x8a8a96, roughness: 0.9, flatShading: true }), 80);
    const arbustos = new THREE.InstancedMesh(geoArbusto, new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.9, flatShading: true }), 80);
    E.add(piedras, arbustos);
    // Sombras de mancha (una sola malla instanciada para todo lo que pisa el suelo)
    const texSombra = texturaDe(64, 64, (cg) => { const gr = cg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, 64, 64); });
    const geoSombra = new THREE.PlaneGeometry(1, 1); geoSombra.rotateX(-Math.PI / 2);
    const sombras = new THREE.InstancedMesh(geoSombra, new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false }), MAX_ENEMIGOS + 20);
    sombras.position.y = 0.5; E.add(sombras);
    // Enemigos: cuerpo y ojos en una sola geometría con colores por vértice (el destello del golpe es el color de la instancia)
    const pintar = (geo: THREE.BufferGeometry, color: string) => { const c3 = new THREE.Color(color), n = geo.attributes.position.count, cs = new Float32Array(n * 3); for (let i = 0; i < n; i++) cs.set([c3.r, c3.g, c3.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(cs, 3)); return geo.index ? geo.toNonIndexed() : geo; };
    const ojos = (x: number, y: number, z: number, r: number, color = '#ffffff') => [-1, 1].flatMap((lado) => [pintar(new THREE.SphereGeometry(r, 8, 6).translate(lado * x, y, z), color), pintar(new THREE.SphereGeometry(r * 0.5, 6, 4).translate(lado * x, y, z + r * 0.7), '#121218')]);
    const unir = (partes: THREE.BufferGeometry[]) => mergeGeometries(partes.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
    const GEO: Record<TipoEnemigo, THREE.BufferGeometry> = {
      limo: unir([pintar(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 0.85, 1).translate(0, 0.25, 0), '#5fd16a'), ...ojos(0.32, 0.55, 0.72, 0.18)]),
      lobo: unir([pintar(new THREE.ConeGeometry(0.7, 2, 6).rotateX(Math.PI / 2).translate(0, 0.7, 0.1), '#9aa3b8'), pintar(new THREE.ConeGeometry(0.22, 0.5, 4).translate(-0.3, 1.25, 0.5), '#7a8296'), pintar(new THREE.ConeGeometry(0.22, 0.5, 4).translate(0.3, 1.25, 0.5), '#7a8296'), ...ojos(0.25, 0.95, 0.85, 0.13, '#ffd23c')]),
      golem: unir([pintar(new THREE.BoxGeometry(1.8, 1.5, 1.2).translate(0, 0.9, 0), '#a8784a'), pintar(new THREE.BoxGeometry(1, 0.8, 0.9).translate(0, 2, 0.1), '#8a6038'), pintar(new THREE.BoxGeometry(0.5, 1.2, 0.5).translate(-1.2, 0.8, 0), '#8a6038'), pintar(new THREE.BoxGeometry(0.5, 1.2, 0.5).translate(1.2, 0.8, 0), '#8a6038'), ...ojos(0.25, 2.05, 0.55, 0.13, '#ffd23c')]),
      hechicero: unir([pintar(new THREE.ConeGeometry(0.9, 2.2, 8).translate(0, 1.1, 0), '#7a3ad0'), pintar(new THREE.SphereGeometry(0.42, 10, 8).translate(0, 2.1, 0), '#e8c9a8'), pintar(new THREE.ConeGeometry(0.5, 1, 8).translate(0, 2.7, 0), '#5a2a9a'), pintar(new THREE.SphereGeometry(0.25, 8, 6).translate(0.9, 1.4, 0.3), '#ffd23c'), ...ojos(0.15, 2.15, 0.38, 0.08, '#121218')]),
      avispa: unir([pintar(new THREE.SphereGeometry(0.8, 10, 8).scale(1, 0.8, 1.2).translate(0, 1.2, 0), '#ffd23c'), pintar(new THREE.TorusGeometry(0.72, 0.12, 4, 12).translate(0, 1.2, 0), '#1a1a1a'), pintar(new THREE.SphereGeometry(0.6, 6, 4).scale(1.4, 0.2, 0.7).translate(0, 1.85, -0.2), '#ffffff'), ...ojos(0.25, 1.35, 0.85, 0.15, '#121218')]),
      minijefe: new THREE.BufferGeometry(), jefe: new THREE.BufferGeometry(),
    };
    GEO.minijefe = GEO.golem.clone(); // el minijefe es un gólem grande y rojo (lo tiñe el color de la instancia)
    GEO.jefe = unir([pintar(new THREE.SphereGeometry(1, 20, 14).scale(1, 1.1, 1).translate(0, 1.1, 0), '#3a2a5a'), ...[-2, -1, 0, 1, 2].map((k) => pintar(new THREE.ConeGeometry(0.18, 0.8, 4).translate(k * 0.3, 2.3 - Math.abs(k) * 0.12, 0.2), '#ffd23c')), ...ojos(0.35, 1.4, 0.9, 0.18, '#ff2e4d')]);
    const matEnemigo = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
    const TIPOS = Object.keys(ENEMIGOS) as TipoEnemigo[];
    const lotes = Object.fromEntries(TIPOS.map((tp) => { const l = new THREE.InstancedMesh(GEO[tp], matEnemigo, tp === 'jefe' ? 2 : tp === 'minijefe' ? 8 : MAX_ENEMIGOS); l.frustumCulled = false; E.add(l); return [tp, l]; })) as unknown as Record<TipoEnemigo, THREE.InstancedMesh>;
    // Cosas sueltas
    const geoCristal = new THREE.OctahedronGeometry(1).scale(0.6, 1, 0.6);
    const cristales = new THREE.InstancedMesh(geoCristal, new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.2, emissive: 0x223366, flatShading: true }), 420);
    cristales.frustumCulled = false; E.add(cristales);
    const matOro = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 1, roughness: 0.25, emissive: 0x3a2400 });
    const OBJ: Record<string, () => THREE.Object3D> = {
      oro: () => { const me = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 2.5, 14), matOro); me.rotation.x = Math.PI / 2; return me; },
      comida: () => { const g3 = new THREE.Group(); const carne = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8).scale(11, 8, 9), new THREE.MeshStandardMaterial({ color: 0xc96a3a, roughness: 0.6 })); const hueso = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 14, 6), new THREE.MeshStandardMaterial({ color: 0xfff1d0 })); hueso.rotation.z = 1.1; hueso.position.set(10, 4, 0); g3.add(carne, hueso); return g3; },
      iman: () => { const me = new THREE.Mesh(new THREE.TorusGeometry(9, 3, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xff2e4d, metalness: 0.4, roughness: 0.3 })); return me; },
      bomba: () => { const g3 = new THREE.Group(); g3.add(new THREE.Mesh(new THREE.SphereGeometry(10, 14, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.6, roughness: 0.3 }))); const ch = brillo(0xffb02a, 1); ch.position.set(6, 14, 0); ch.scale.setScalar(14); g3.add(ch); return g3; },
      cofre: () => { const g3 = new THREE.Group(); g3.add(new THREE.Mesh(new THREE.BoxGeometry(34, 20, 22), new THREE.MeshStandardMaterial({ color: 0x9a5a1a, roughness: 0.7 }))); const tapa = new THREE.Mesh(new THREE.BoxGeometry(36, 8, 24), matOro); tapa.position.y = 13; g3.add(tapa); const b = brillo(0xffd23c, 0.6); b.scale.setScalar(110); b.position.y = 10; g3.add(b); return g3; },
    };
    const brillo = (color: THREE.ColorRepresentation, op: number) => new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrillo(), color, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const objetos = new Map<Suelto, THREE.Object3D>();
    // Antorchas: palo, fuego y su luz (falsa: un brillo aditivo en el suelo, que de noche se nota)
    const antorchas3d = new Map<Antorcha, THREE.Group>();
    const crearAntorcha = () => { const g3 = new THREE.Group(); const palo = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 34, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a1a })); palo.position.y = 17; const fuego = brillo(0xff8a3a, 1); fuego.position.y = 40; fuego.scale.set(26, 38, 1); const halo = brillo(0xffa040, 0.35); halo.position.y = 30; halo.scale.setScalar(150); g3.add(palo, fuego, halo); g3.userData = { fuego, halo }; E.add(g3); return g3; };
    // Proyectiles: un lote por clase
    const geoCuchillo = new THREE.ConeGeometry(3, 18, 4).rotateZ(-Math.PI / 2), geoLanza = new THREE.CylinderGeometry(1.5, 1.5, 34, 5).rotateZ(Math.PI / 2), geoBumeran = new THREE.TorusGeometry(10, 3, 5, 10, 4), geoBola = new THREE.SphereGeometry(1, 10, 8);
    const loteBala = (geo: THREE.BufferGeometry, color: number, emisivo: number) => { const l = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, emissive: emisivo, roughness: 0.3, metalness: 0.5 }), 300); l.frustumCulled = false; E.add(l); return l; };
    const lCuchillo = loteBala(geoCuchillo, 0xffe08a, 0x553300), lLanza = loteBala(geoLanza, 0xc79bff, 0x401a6a), lBumeran = loteBala(geoBumeran, 0x7cffcb, 0x0a4a30), lBola = loteBala(geoBola, 0xd06bff, 0x8a2ad0);
    const espadas = Array.from({ length: 5 }, () => { const g3 = new THREE.Group(); const hoja = new THREE.Mesh(new THREE.BoxGeometry(5, 34, 1.5).translate(0, 17, 0), new THREE.MeshStandardMaterial({ color: 0xdfe6f3, metalness: 0.9, roughness: 0.2, emissive: 0x4a5a7a })); const guarda = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 3), new THREE.MeshStandardMaterial({ color: 0xa8784a })); g3.add(hoja, guarda); E.add(g3); g3.visible = false; return { g3, hoja }; });
    const meteoros3d = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(14, 0), new THREE.MeshStandardMaterial({ color: 0xff7a3a, emissive: 0xff4a10, emissiveIntensity: 1.2, flatShading: true }), 40);
    meteoros3d.frustumCulled = false; E.add(meteoros3d);
    const auraSuelo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texturaBrillo(), color: 0xff7a3a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    auraSuelo.position.y = 1; E.add(auraSuelo);
    // El protagonista: el personaje del jugador (mientras carga, una figura simple)
    const heroe = new THREE.Group(); E.add(heroe);
    const simple = new THREE.Group();
    { simple.scale.setScalar(1.35); const capa = new THREE.Mesh(new THREE.ConeGeometry(12, 28, 8).translate(0, 14, 0), new THREE.MeshStandardMaterial({ color: 0x3f7bff })); const cara = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 10).translate(0, 32, 0), new THREE.MeshStandardMaterial({ color: 0xffd9b3 })); simple.add(capa, cara); heroe.add(simple); }
    // Anillo de luz bajo el protagonista: siempre se sabe dónde está, aunque lo rodeen
    const anillo = new THREE.Mesh(new THREE.RingGeometry(26, 34, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    anillo.position.y = 1.5; E.add(anillo);
    let avatar: Kenney | null = null, caminando = false;
    if (c.aspecto) crearKenney(c.aspecto).then((k) => {
      if (!m.tres) return;
      const caja = new THREE.Box3().setFromObject(k.grupo), alto = Math.max(0.01, caja.max.y - caja.min.y);
      k.grupo.scale.multiplyScalar(62 / alto);
      heroe.remove(simple); heroe.add(k.grupo); avatar = k;
    }).catch(() => { /* se queda la figura simple */ });
    const golpeado = new THREE.Color(), mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), esc = new THREE.Vector3(), eje = new THREE.Vector3(0, 1, 0), BLANCO = new THREE.Color(3, 3, 3);
    const NORMAL = new THREE.Color(0xffffff), ROJIZO = new THREE.Color(0xff6a5a), giroBumeran = new THREE.Euler(-Math.PI / 2, 0, 0), giroMeteoro = new THREE.Euler();
    let previo = performance.now();
    m.antes3d(() => {
      const ahora = performance.now(), dtReal = Math.min(0.1, (ahora - previo) / 1000); previo = ahora;
      const t = m.tiempo, z = zoom(), vw = m.ancho / z, vh = ALTO / z;
      // Cámara: mira al jugador desde arriba a 60°; el alto visible se ajusta para que el suelo coincida con la vista 2D
      camara.left = -vw / 2; camara.right = vw / 2; camara.top = (vh * Math.sin(INCLINA)) / 2; camara.bottom = -(vh * Math.sin(INCLINA)) / 2;
      camara.updateProjectionMatrix();
      const D = 1500, sx = m.sacudida.x / z, sy = m.sacudida.y / z;
      camara.position.set(yo.x + sx, D * Math.sin(INCLINA), yo.y + D * Math.cos(INCLINA) + sy);
      camara.lookAt(yo.x + sx, 0, yo.y + sy);
      // Luz del día que avanza: tarde, atardecer y noche cuando llega el jefe
      const k = Math.min(1, jt / JEFE_EN), noche = jefe ? 1 : Math.max(0, (k - 0.75) / 0.25);
      cielo.color.setRGB(0.87 - noche * 0.5, 0.94 - noche * 0.55 - k * 0.1, 1 - noche * 0.3); cielo.intensity = 1.3 - noche * 0.6;
      sol.color.setRGB(1, 0.94 - k * 0.25, 0.82 - k * 0.4); sol.intensity = 2.1 - noche * 1.5;
      E.fog!.color.setRGB(0.62 - noche * 0.5, 0.77 - noche * 0.6, 0.91 - noche * 0.6);
      T.render.setClearColor(E.fog!.color);
      // Suelo y decoración
      const lado = Math.max(vw, vh) * 2.2;
      suelo.position.set(yo.x, 0, yo.y); suelo.scale.set(lado, lado, 1);
      texPasto.repeat.set(lado / 512, lado / 512); texPasto.offset.set((yo.x - lado / 2) / 512, -(yo.y + lado / 2) / 512);
      let np = 0, na = 0;
      const cx0 = Math.floor((yo.x - vw / 2) / 128) - 1, cy0 = Math.floor((yo.y - vh / 2) / 128) - 1;
      for (let cx = cx0; cx < cx0 + vw / 128 + 3; cx++) for (let cy = cy0; cy < cy0 + vh / 128 + 3; cy++) {
        const h = hash(cx, cy);
        if (h > 0.93 && np < 80) { mat4.compose(v3.set(cx * 128 + 64, 4, cy * 128 + 64), q.setFromAxisAngle(eje, h * 30), esc.set(16, 10, 13)); piedras.setMatrixAt(np++, mat4); }
        else if (h < 0.06 && na < 80) { mat4.compose(v3.set(cx * 128 + 40, 12, cy * 128 + 70), q.identity(), esc.set(26, 18, 22)); arbustos.setMatrixAt(na++, mat4); }
      }
      piedras.count = np; arbustos.count = na; piedras.instanceMatrix.needsUpdate = arbustos.instanceMatrix.needsUpdate = true;
      // Enemigos
      const cuenta = Object.fromEntries(TIPOS.map((tp) => [tp, 0])) as Record<TipoEnemigo, number>;
      let ns = 0;
      for (const e of enemigos) {
        if (Math.abs(e.x - yo.x) > vw / 2 + 80 || Math.abs(e.y - yo.y) > vh / 2 + 120) continue;
        const l = lotes[e.tipo], i = cuenta[e.tipo]++;
        if (i >= (e.tipo === 'jefe' ? 2 : e.tipo === 'minijefe' ? 8 : MAX_ENEMIGOS)) continue;
        const salto = e.tipo === 'limo' ? Math.abs(Math.sin(t * 7 + e.id)) * 5 : e.tipo === 'avispa' ? 8 + Math.sin(t * 9 + e.id) * 3 : Math.abs(Math.sin(t * 9 + e.id)) * 2;
        const aplasta = e.tipo === 'limo' ? 1 - Math.abs(Math.sin(t * 7 + e.id)) * 0.15 : 1;
        mat4.compose(v3.set(e.x, salto, e.y), q.setFromAxisAngle(eje, Math.atan2(yo.x - e.x, yo.y - e.y)), esc.set(e.r * (2 - aplasta), e.r * aplasta, e.r));
        l.setMatrixAt(i, mat4);
        l.setColorAt(i, t - e.golpe < 0.08 ? BLANCO : (e.tipo === 'minijefe' ? ROJIZO : NORMAL));
        if (ns < sombras.count) { mat4.compose(v3.set(e.x, 0, e.y), q.identity(), esc.set(e.r * 2.6, 1, e.r * 2)); sombras.setMatrixAt(ns++, mat4); }
      }
      for (const tp of TIPOS) { const l = lotes[tp]; l.count = Math.min(cuenta[tp], tp === 'jefe' ? 2 : tp === 'minijefe' ? 8 : MAX_ENEMIGOS); l.instanceMatrix.needsUpdate = true; if (l.instanceColor) l.instanceColor.needsUpdate = true; }
      // Protagonista y su sombra
      heroe.position.set(yo.x, 0, yo.y);
      anillo.position.set(yo.x, 1.5, yo.y); (anillo.material as THREE.MeshBasicMaterial).color.setHex(yo.vida / yo.max < 0.3 ? 0xff2e4d : 0x7fd8ff);
      const [dx, dy] = [yo.dirX, yo.dirY], mueve = fase === 'juego' && (bot || m.teclas.size > 0 || (palanca && m.puntero.abajo));
      heroe.rotation.y = Math.atan2(dx, dy);
      heroe.visible = !(jt - yo.golpeado < 0.15 && Math.floor(t * 30) % 2 === 0);
      if (avatar) { if (mueve !== caminando) { caminando = !!mueve; avatar.animar(caminando ? 'sprint' : 'idle'); } (avatar.grupo.userData.avanzar as (d: number) => void)?.(fase === 'juego' ? dtReal : 0); }
      mat4.compose(v3.set(yo.x, 0, yo.y), q.identity(), esc.set(40, 1, 30)); sombras.setMatrixAt(ns++, mat4);
      sombras.count = ns; sombras.instanceMatrix.needsUpdate = true;
      // Cristales y cosas sueltas
      let nc = 0;
      const vivos = new Set<Suelto>();
      for (const s of sueltos) {
        if (Math.abs(s.x - yo.x) > vw / 2 + 40 || Math.abs(s.y - yo.y) > vh / 2 + 60) continue;
        if (s.tipo === 'xp') {
          if (nc >= 420) continue;
          mat4.compose(v3.set(s.x, 8 + Math.sin(t * 4 + s.x) * 2, s.y), q.setFromAxisAngle(eje, t * 2 + s.y), esc.setScalar(s.valor >= 4 ? 9 : s.valor >= 2 ? 7.5 : 6));
          cristales.setMatrixAt(nc, mat4); cristales.setColorAt(nc, golpeado.set(s.valor >= 4 ? 0xff5a6a : s.valor >= 2 ? 0x7cffcb : 0x7fb4ff)); nc++;
          continue;
        }
        vivos.add(s);
        let o3 = objetos.get(s);
        if (!o3) { o3 = OBJ[s.tipo](); objetos.set(s, o3); E.add(o3); }
        o3.position.set(s.x, 10 + Math.sin(t * 3 + s.x) * 3, s.y); o3.rotation.y = t * 1.5;
      }
      cristales.count = nc; cristales.instanceMatrix.needsUpdate = true; if (cristales.instanceColor) cristales.instanceColor.needsUpdate = true;
      for (const [s, o3] of objetos) if (!vivos.has(s)) { E.remove(o3); objetos.delete(s); }
      // Antorchas
      for (const a of antorchas) { let g3 = antorchas3d.get(a); if (!g3) { g3 = crearAntorcha(); antorchas3d.set(a, g3); } g3.position.set(a.x, 0, a.y); const fu = g3.userData.fuego as THREE.Sprite; fu.scale.set(24 + Math.sin(t * 13 + a.x) * 4, 36 + Math.sin(t * 17) * 5, 1); (g3.userData.halo as THREE.Sprite).material.opacity = 0.15 + noche * 0.4; }
      for (const [a, g3] of antorchas3d) if (!antorchas.includes(a)) { E.remove(g3); antorchas3d.delete(a); }
      // Armas
      const esp = armas.get('espada'), nEsp = esp ? (esp.evo ? 5 : [1, 2, 2, 3, 3][esp.nivel - 1]) : 0;
      espadas.forEach((s, k) => {
        s.g3.visible = k < nEsp;
        if (!s.g3.visible || !esp) return;
        const lv = esp.nivel + (esp.evo ? 3 : 0), rad = (75 + lv * 4) * mult.area, a = jt * (esp.evo ? 4.5 : 3.2) + (k * Math.PI * 2) / nEsp;
        s.g3.position.set(yo.x + Math.cos(a) * rad, 18, yo.y + Math.sin(a) * rad);
        s.g3.rotation.set(-Math.PI / 2, 0, -a - Math.PI / 2); s.g3.scale.setScalar(mult.area);
        (s.hoja.material as THREE.MeshStandardMaterial).color.setHex(esp.evo ? 0x9fe9ff : 0xdfe6f3);
      });
      const n = { c: 0, l: 0, b: 0, e: 0 };
      for (const b of balas) {
        const a = Math.atan2(b.vy, b.vx);
        if (b.enemiga) { mat4.compose(v3.set(b.x, 16, b.y), q.identity(), esc.setScalar(b.r)); lBola.setMatrixAt(n.e++, mat4); continue; }
        const id = LISTA_ARMAS[b.arma];
        if (id === 'bumeran') { mat4.compose(v3.set(b.x, 14, b.y), q.setFromEuler((giroBumeran.z = t * 18, giroBumeran)), esc.setScalar(b.r / 10)); lBumeran.setMatrixAt(n.b++, mat4); }
        else if (id === 'lanza') { mat4.compose(v3.set(b.x, 16, b.y), q.setFromAxisAngle(eje, -a), esc.setScalar(b.r / 9)); lLanza.setMatrixAt(n.l++, mat4); }
        else { mat4.compose(v3.set(b.x, 16, b.y), q.setFromAxisAngle(eje, -a), esc.setScalar(1)); lCuchillo.setMatrixAt(n.c++, mat4); }
      }
      lCuchillo.count = n.c; lLanza.count = n.l; lBumeran.count = n.b; lBola.count = n.e;
      for (const l of [lCuchillo, lLanza, lBumeran, lBola]) l.instanceMatrix.needsUpdate = true;
      let nm = 0;
      for (const me of meteoros) { const k2 = Math.max(0, me.t - jt) / 0.6; if (nm < 40) { mat4.compose(v3.set(me.x + k2 * 160, k2 * 500, me.y - k2 * 60), q.setFromEuler(giroMeteoro.set(t * 5, t * 3, 0)), esc.setScalar(me.r / 60)); meteoros3d.setMatrixAt(nm++, mat4); } }
      meteoros3d.count = nm; meteoros3d.instanceMatrix.needsUpdate = true;
      const au = armas.get('aura');
      auraSuelo.visible = !!au;
      if (au) { const rad = (70 + (au.nivel + (au.evo ? 3 : 0)) * 10) * mult.area; auraSuelo.position.set(yo.x, 1, yo.y); auraSuelo.scale.set(rad * 2.2, 1, rad * 2.2); (auraSuelo.material as THREE.MeshBasicMaterial).color.setHex(au.evo ? 0xffdc5a : 0xff7a3a); (auraSuelo.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 6) * 0.08; }
    });
  }

  m.alDibujar((g) => {
    const t = m.tiempo, z = zoom(), vw = m.ancho / z, vh = ALTO / z;
    g.save();
    g.scale(z, z);
    g.translate(vw / 2 - yo.x, vh / 2 - yo.y);
    if (!T) {
    // Pradera: pasto con flores y piedras deterministas por casilla
    const x0 = Math.floor((yo.x - vw / 2) / 128) - 1, y0 = Math.floor((yo.y - vh / 2) / 128) - 1;
    g.fillStyle = '#3f7a3a'; g.fillRect(yo.x - vw / 2 - 10, yo.y - vh / 2 - 10, vw + 20, vh + 20);
    for (let cx = x0; cx < x0 + vw / 128 + 3; cx++) for (let cy = y0; cy < y0 + vh / 128 + 3; cy++) {
      const h = hash(cx, cy);
      g.fillStyle = h < 0.5 ? '#457f3f' : '#3a7035'; g.fillRect(cx * 128, cy * 128, 128, 128);
      for (let k = 0; k < 5; k++) { const hx = hash(cx * 7 + k, cy * 13 - k), hy = hash(cx * 11 - k, cy * 5 + k); g.fillStyle = k === 0 && h > 0.7 ? '#ffd23c' : k === 1 && h > 0.8 ? '#ff8fc8' : 'rgba(30,70,30,.6)'; g.fillRect(cx * 128 + hx * 120, cy * 128 + hy * 120, k < 2 ? 5 : 3, k < 2 ? 5 : 8); }
      if (h > 0.93) { g.fillStyle = '#7a7a86'; g.beginPath(); g.ellipse(cx * 128 + 64, cy * 128 + 64, 14, 9, 0, 0, Math.PI * 2); g.fill(); }
    }
    // Antorchas
    for (const a of antorchas) { g.fillStyle = '#5a3a1a'; g.fillRect(a.x - 4, a.y - 10, 8, 24); g.fillStyle = '#ff8a3a'; g.beginPath(); g.ellipse(a.x, a.y - 16 + Math.sin(t * 10) * 1.5, 8, 12, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffd23c'; g.beginPath(); g.ellipse(a.x, a.y - 14, 4, 7, 0, 0, Math.PI * 2); g.fill(); }
    }
    // Meteoros por caer (sombra que crece)
    for (const me of meteoros) { const k = Math.max(0, 1 - Math.max(0, me.t - jt) / 0.6); g.fillStyle = `rgba(255,60,40,${0.15 + k * 0.25})`; g.beginPath(); g.arc(me.x, me.y, me.r * k, 0, Math.PI * 2); g.fill(); }
    if (!T) {
    // Cosas sueltas
    for (const s of sueltos) {
      if (s.tipo === 'xp') { g.fillStyle = s.valor >= 4 ? '#ff5a6a' : s.valor >= 2 ? '#7cffcb' : '#7fb4ff'; g.beginPath(); g.moveTo(s.x, s.y - 7); g.lineTo(s.x + 5, s.y); g.lineTo(s.x, s.y + 7); g.lineTo(s.x - 5, s.y); g.closePath(); g.fill(); }
      else if (s.tipo === 'oro') { g.fillStyle = '#ffd23c'; g.beginPath(); g.arc(s.x, s.y, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = '#b07a00'; g.fillRect(s.x - 1, s.y - 4, 2, 8); }
      else if (s.tipo === 'comida') { g.fillStyle = '#c96a3a'; g.beginPath(); g.ellipse(s.x, s.y, 11, 8, 0.4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff1d0'; g.fillRect(s.x + 6, s.y - 9, 4, 8); }
      else if (s.tipo === 'iman') { g.strokeStyle = '#ff2e4d'; g.lineWidth = 6; g.beginPath(); g.arc(s.x, s.y, 9, Math.PI, 0); g.stroke(); g.fillStyle = '#dfe6f3'; g.fillRect(s.x - 12, s.y, 6, 6); g.fillRect(s.x + 6, s.y, 6, 6); }
      else if (s.tipo === 'bomba') { g.fillStyle = '#1a1a22'; g.beginPath(); g.arc(s.x, s.y, 10, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffd23c'; g.beginPath(); g.arc(s.x + 6, s.y - 11, 3 + Math.sin(t * 20), 0, Math.PI * 2); g.fill(); }
      else { g.fillStyle = 'rgba(255,210,60,.35)'; g.beginPath(); g.arc(s.x, s.y, 26 + Math.sin(t * 5) * 4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#b06a1a'; g.fillRect(s.x - 16, s.y - 10, 32, 22); g.fillStyle = '#ffd23c'; g.fillRect(s.x - 16, s.y - 4, 32, 4); g.fillRect(s.x - 3, s.y - 6, 6, 8); }
    }
    // Aura
    const aura = armas.get('aura');
    if (aura) { const rad = (70 + (aura.nivel + (aura.evo ? 3 : 0)) * 10) * mult.area, gr = g.createRadialGradient(yo.x, yo.y, rad * 0.3, yo.x, yo.y, rad); gr.addColorStop(0, 'rgba(255,122,58,0)'); gr.addColorStop(0.8, aura.evo ? 'rgba(255,220,90,.28)' : 'rgba(255,122,58,.22)'); gr.addColorStop(1, 'rgba(255,122,58,0)'); g.fillStyle = gr; g.beginPath(); g.arc(yo.x, yo.y, rad, 0, Math.PI * 2); g.fill(); }
    // Enemigos (de lejos a cerca en y, para que se superpongan bien)
    const vistos = enemigos.filter((e) => Math.abs(e.x - yo.x) < vw / 2 + 60 && Math.abs(e.y - yo.y) < vh / 2 + 60).sort((a, b) => a.y - b.y);
    for (const e of vistos) pintarEnemigo(g, e, t);
    pintarHeroe(g, t);
    // Espadas
    const esp = armas.get('espada');
    if (esp) {
      const lv = esp.nivel + (esp.evo ? 3 : 0), n = esp.evo ? 5 : [1, 2, 2, 3, 3][esp.nivel - 1], rad = (75 + lv * 4) * mult.area;
      for (let k = 0; k < n; k++) { const a = jt * (esp.evo ? 4.5 : 3.2) + (k * Math.PI * 2) / n; g.save(); g.translate(yo.x + Math.cos(a) * rad, yo.y + Math.sin(a) * rad); g.rotate(a + Math.PI / 2); g.fillStyle = esp.evo ? '#9fe9ff' : '#dfe6f3'; g.beginPath(); g.moveTo(0, -22 * mult.area); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill(); g.fillStyle = '#a8784a'; g.fillRect(-7, 6, 14, 4); g.restore(); }
    }
    // Balas
    for (const b of balas) {
      if (b.enemiga) { g.fillStyle = '#d06bff'; g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2); g.fill(); continue; }
      const id = LISTA_ARMAS[b.arma], a = Math.atan2(b.vy, b.vx);
      g.save(); g.translate(b.x, b.y);
      if (id === 'bumeran') { g.rotate(t * 18); g.strokeStyle = ARMAS.bumeran.color; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, b.r, 0, Math.PI * 1.2); g.stroke(); }
      else if (id === 'lanza') { g.rotate(a); g.fillStyle = ARMAS.lanza.color; g.fillRect(-b.r * 3, -2, b.r * 4, 4); g.beginPath(); g.moveTo(b.r * 1.8, 0); g.lineTo(b.r, -5); g.lineTo(b.r, 5); g.fill(); }
      else { g.rotate(a); g.fillStyle = ARMAS.cuchillos.color; g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -3); g.lineTo(-6, 3); g.closePath(); g.fill(); }
      g.restore();
    }
    }
    for (let k = rayos.length - 1; k >= 0; k--) { const ry = rayos[k], edad = jt - ry.t; if (edad > 0.15) { rayos.splice(k, 1); continue; } g.strokeStyle = '#bfefff'; g.lineWidth = 3; g.globalAlpha = 1 - edad / 0.15; g.beginPath(); ry.puntos.forEach(([x, y], q) => { const jx = q ? (hash(q, Math.floor(t * 30)) - 0.5) * 14 : 0; if (q) g.lineTo(x + jx, y + jx); else g.moveTo(x, y); }); g.stroke(); g.globalAlpha = 1; }
    for (let k = ondas.length - 1; k >= 0; k--) { const o = ondas[k], edad = (jt - o.t) / 0.35; if (edad > 1) { ondas.splice(k, 1); continue; } g.strokeStyle = o.color; g.globalAlpha = 1 - edad; g.lineWidth = 6; g.beginPath(); g.arc(o.x, o.y, o.r * (0.4 + edad * 0.6), 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
    // Números de daño
    for (let k = numeros.length - 1; k >= 0; k--) { const n = numeros[k], edad = jt - n.t; if (edad > 0.6) { numeros.splice(k, 1); continue; } m.rotulo(String(n.v), n.x, n.y - edad * 40 - (T ? n.critico ? 30 : 22 : 0), n.critico ? 22 : 15, n.critico ? '#ffd23c' : '#ffffff', 1 - edad / 0.6); }
    g.globalAlpha = 1;
    g.restore();
    // Interfaz: barra de experiencia, jefe y pantallas de elección
    const UI = 58;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, UI, m.ancho, 10);
    g.fillStyle = '#7fb4ff'; g.fillRect(0, UI, m.ancho * (yo.xp / xpParaNivel()), 10);
    m.rotulo(`Nv. ${yo.nivel}`, m.ancho - 40, UI + 24, 16);
    if (jefe && jefe.vida > 0) { const w = Math.min(600, m.ancho - 40); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(m.ancho / 2 - w / 2, UI + 40, w, 18); g.fillStyle = '#b02a4a'; g.fillRect(m.ancho / 2 - w / 2, UI + 40, w * (jefe.vida / jefe.max), 18); m.rotulo('Rey de la Horda', m.ancho / 2, UI + 28, 18, '#ffcf4a'); }
    // Íconos de la build
    let ix = 12;
    for (const [id, w] of armas) { g.fillStyle = w.evo ? '#ffd23c' : 'rgba(0,0,0,.45)'; g.fillRect(ix, UI + 14, 26, 26); g.fillStyle = ARMAS[id].color; g.fillRect(ix + 4, UI + 18, 18, 18); m.rotulo(String(w.nivel), ix + 20, UI + 36, 11); ix += 30; }
    if (destello > 0) { g.fillStyle = `rgba(255,255,255,${destello * (m.calma ? 0.3 : 0.85)})`; g.fillRect(0, 0, m.ancho, ALTO); destello = Math.max(0, destello - 0.04); }
    if (palanca && m.puntero.abajo) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.beginPath(); g.arc(palanca.x, palanca.y, 50, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(255,255,255,.35)'; const dx = m.puntero.x - palanca.x, dy = m.puntero.y - palanca.y, l = Math.min(50, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); g.beginPath(); g.arc(palanca.x + Math.cos(a) * l, palanca.y + Math.sin(a) * l, 20, 0, Math.PI * 2); g.fill(); }
    if (jt < 6 && fase === 'juego' && !bot) m.rotulo('Muévete con WASD, las flechas o arrastrando el dedo: tus armas atacan solas', m.ancho / 2, ALTO - 50, Math.round(Math.min(22, m.ancho / 22)), '#fff6c9');
    if (fase === 'elegir') {
      g.fillStyle = 'rgba(8,10,20,.72)'; g.fillRect(0, 0, m.ancho, ALTO);
      texto(g, `¡Nivel ${yo.nivel}! Elige una mejora`, m.ancho / 2, 100, Math.min(40, m.ancho / 12), '#ffcf4a');
      tarjetas().forEach((tj, k) => {
        const o = ofertas[k]; if (!o) return;
        const info = o.tipo === 'arma' ? ARMAS[o.id as ArmaId] : o.tipo === 'pasivo' ? PASIVOS[o.id as PasivoId] : { nombre: 'Bolsa de oro', desc: '+25 de oro y +20 de vida', color: '#ffd23c' };
        g.fillStyle = 'rgba(30,36,60,.95)'; g.strokeStyle = o.evoluciona ? '#ffd23c' : info.color; g.lineWidth = 3;
        g.beginPath(); g.roundRect(tj.x, tj.y, tj.w, tj.h, 14); g.fill(); g.stroke();
        const vertical = tj.h < 200;
        g.fillStyle = info.color; g.beginPath(); g.arc(vertical ? tj.x + 50 : tj.x + tj.w / 2, vertical ? tj.y + tj.h / 2 : tj.y + 70, 30, 0, Math.PI * 2); g.fill();
        const tx = vertical ? tj.x + 95 : tj.x + tj.w / 2, al: CanvasTextAlign = vertical ? 'left' : 'center';
        texto(g, `${k + 1}. ${info.nombre}`, tx, vertical ? tj.y + 34 : tj.y + 130, 20, '#ffffff', al);
        texto(g, o.tipo === 'oro' ? '' : o.nivel === 1 ? '¡Nuevo!' : `Nivel ${o.nivel}`, tx, vertical ? tj.y + 64 : tj.y + 162, 16, '#7cffcb', al);
        texto(g, info.desc, tx, vertical ? tj.y + 94 : tj.y + 200, 15, '#dfe6f3', al);
        if (o.evoluciona) texto(g, o.tipo === 'arma' ? `★ Evoluciona con ${PASIVOS[ARMAS[o.id as ArmaId].pasivo].nombre}` : '★ Ayuda a evolucionar un arma', tx, vertical ? tj.y + 124 : tj.y + 250, 14, '#ffd23c', al);
      });
    }
    if (fase === 'cofre' && cofre) {
      const k = Math.min(1, (m.tiempo - cofre.t) / 1);
      g.fillStyle = 'rgba(8,10,20,.75)'; g.fillRect(0, 0, m.ancho, ALTO);
      g.fillStyle = `rgba(255,210,60,${0.2 + k * 0.3})`; g.beginPath(); g.arc(m.ancho / 2, 240, 80 + k * 120, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b06a1a'; g.fillRect(m.ancho / 2 - 60, 220, 120, 70); g.fillStyle = '#8a4a10'; g.save(); g.translate(m.ancho / 2 - 60, 220); g.rotate(-k * 0.9); g.fillRect(0, -30, 120, 30); g.restore();
      texto(g, '¡Cofre!', m.ancho / 2, 120, 44, '#ffcf4a');
      cofre.lista.forEach((s, q) => { if (k * cofre!.lista.length > q) texto(g, s, m.ancho / 2, 350 + q * 44, s.startsWith('¡EVO') ? 28 : 22, s.startsWith('¡EVO') ? '#ffd23c' : '#ffffff'); });
      if (k >= 1) texto(g, 'Toca para seguir', m.ancho / 2, ALTO - 60, 20, '#c9bfff');
    }
    if (fase === 'personaje') {
      g.fillStyle = 'rgba(8,10,20,.8)'; g.fillRect(0, 0, m.ancho, ALTO);
      texto(g, 'HORDA INFINITA', m.ancho / 2, 100, Math.min(64, m.ancho / 9), '#ffcf4a');
      texto(g, 'Modo libre: elige tu personaje', m.ancho / 2, 160, 22);
      PERSONAJES.forEach((p, k) => {
        const x = (m.ancho / 3) * (k + 0.5), ok = desbloqueados[k];
        texto(g, `${k + 1}. ${p.nombre}`, x, 300, Math.min(30, m.ancho / 14), ok ? '#ffffff' : '#6a6a7a');
        texto(g, ARMAS[p.arma].nombre, x, 345, Math.min(18, m.ancho / 22), ok ? ARMAS[p.arma].color : '#6a6a7a');
        if (!ok) texto(g, `🔒 ${p.logro}`, x, 385, Math.min(14, m.ancho / 28), '#ff8a6a');
      });
      if (permanentes.vida || permanentes.vel || permanentes.dano) texto(g, `Mejoras permanentes (${guardado.oro} de oro guardado): +${permanentes.vida} vida · +${Math.round(permanentes.vel * 100)} % velocidad · +${Math.round(permanentes.dano * 100)} % daño`, m.ancho / 2, 520, Math.min(18, m.ancho / 30), '#7cffcb');
      else texto(g, 'El oro que juntes aquí se guarda y da mejoras permanentes (solo en modo libre)', m.ancho / 2, 520, Math.min(18, m.ancho / 30), '#c9bfff');
    }
  });

  let terminado = false;
  function terminar() {
    if (terminado) return;
    terminado = true; fase = 'fin';
    musica.parar(); m.detener();
    const total = Math.round(jt * 20) + puntos + oro * 5;
    if (jt >= 180) guardado.arquera = true;
    if (muertes >= 500) guardado.maga = true;
    if (c.libre) guardado.oro += oro;
    try { localStorage.setItem(REG, JSON.stringify(guardado)); } catch { /* sin almacenamiento */ }
    const mejorMin = muertesPorMinuto.reduce((b, v, i) => ((v ?? 0) > (muertesPorMinuto[b] ?? 0) ? i : b), 0);
    const porArma = Object.entries(danoPorArma).filter(([k]) => k !== 'otro').sort((a, b) => b[1] - a[1]).map(([k, v]) => `${ARMAS[k as ArmaId].nombre} ${v}`).join(' · ');
    const porTipo = Object.entries(muertesPorTipo).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${ENEMIGOS[k as TipoEnemigo].nombre} ${v}`).join(' · ');
    const build = [...[...armas].map(([id, w]) => (w.evo ? ARMAS[id].evo : `${ARMAS[id].nombre} ${w.nivel}`)), ...[...pasivos].map(([id, n]) => `${PASIVOS[id].nombre} ${n}`)].join(' · ');
    c.alTerminar({
      puntaje: total,
      lineas: [
        ['Resultado', fin], ['Tiempo', `${Math.floor(jt / 60)}:${String(Math.floor(jt % 60)).padStart(2, '0')}`], ['Nivel', String(yo.nivel)], ['Derrotados', String(muertes)],
        ['Minijefes', String(minijefes)], ['Oro', String(oro)], ['Daño por arma', porArma || '—'], ['Enemigos', porTipo || '—'], ['Tu build', build], ['Mejor minuto', `minuto ${mejorMin + 1} (${muertesPorMinuto[mejorMin] ?? 0} derrotados)`],
      ],
      detalle: { seg: Math.round(jt), nivel: yo.nivel, muertes, minijefes, jefe: jefeMuerto, oro, armas: [...armas].map(([id, w]) => `${id}${w.nivel}${w.evo ? '+' : ''}`) },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__horda = () => ({ fase, puntos: Math.round(jt * 20) + puntos + oro * 5, seg: Math.round(jt), nivel: yo.nivel, vida: Math.round(yo.vida), muertes, enemigos: enemigos.length, armas: [...armas].map(([id, w]) => `${id}${w.nivel}${w.evo ? '+' : ''}`), terminado });
  return {
    empezar() { m.empezar(); if (fase === 'juego') empezarPartida(); },
    destruir() { musica.parar(); m.destruir(); },
  };
}
