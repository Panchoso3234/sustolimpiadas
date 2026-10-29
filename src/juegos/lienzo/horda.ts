import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { bola, crearSprite, desdeTexto, espejo, girado, PAL, silueta, type Sprite } from './pixel';

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
  const m = crearMotor2D(c, 'horda', { fondo: '#2d4a2a', pixel: (ancho) => 2 * Math.min(1, ancho / 500) });
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
    if (m.puntero.tipo !== 'mouse') palanca = { x, y }; // con el mouse no hace falta apretar: se camina hacia el cursor
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
    else if (!dx && !dy && modoMouse()) {
      // Hacia el cursor; cerca del personaje (zona muerta) se queda quieto, y acelera suave al alejarse
      const px = m.puntero.x - m.ancho / 2, py = m.puntero.y - ALTO / 2, l = Math.hypot(px, py), muerta = 30;
      if (l > muerta) { const f = Math.min(1, (l - muerta) / 40); dx = (px / l) * f; dy = (py / l) * f; }
    }
    return [dx, dy];
  };
  const modoMouse = () => !bot && m.puntero.tipo === 'mouse' && m.puntero.dentro;
  let ultimaDir: [number, number] = [0, 0];

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
    ultimaDir = dir as [number, number];
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
  const zoom = () => Math.min(1, m.ancho / 500);
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
  // ── Pixel art (8 bits): cada sprite se dibuja una sola vez; en cada cuadro solo se copian. 1 píxel del arte = 2 del mundo ──
  const ojos = (x: number, y: number, sep: number, blanco: string = PAL.blanco, pupila: string = PAL.negro) => (g: CanvasRenderingContext2D) => {
    for (const lado of [-1, 1]) { const ox = Math.round(x + lado * sep); g.fillStyle = blanco; g.fillRect(ox, y, 2, 2); g.fillStyle = pupila; g.fillRect(ox + (lado > 0 ? 1 : 0), y + 1, 1, 1); }
  };
  const verde = { borde: '#1e5c2a', sombra: '#3fa34d', base: '#5fd16a', luz: '#9ff08a', brillo: '#e8ffe0' };
  const lobo = (piernas: string[]) => desdeTexto(['..........O..O', '.........OGOOGO', 'O.......OGGGGGO', 'GO.....OGGGGEGNO', '.GOOOOOGGGGGGGO', '.OGGGGGGGGGLLO', '.OGGGGGGGGLLO', ...piernas], { O: '#3e3e4a', G: '#9aa3b8', L: '#d9dde8', E: PAL.amarillo, N: PAL.negro });
  const GOLEM = ['...OOOOOO...', '..OLLLLLBO..', '..OBEBBEBO..', '..OBBBBBDO..', 'OOOOOOOOOOOO', 'OLBBBBBBBBDO', 'OBBLBBBBBDDO', 'OBBBBBBBBBDO', 'OOOBBBBBBOOO', '..OBBDDBBO..', '..OBBOOBBO..', '..ODDO.ODDO', '..OOO..OOOO'];
  const golem = (B: string, D: string, L: string) => desdeTexto(GOLEM, { O: '#3a2010', B, D, L, E: PAL.amarillo });
  const avispa = (alas: string[], patas: string) => desdeTexto([...alas, '.OYYOYYO.', 'OYOYYOYEO', 'OYOYYOYYO', '.OYYOYYO.', patas], { O: '#1a1a1a', Y: PAL.amarillo, W: '#ffffff', E: PAL.rojo });
  const HEROE: Record<'frente' | 'espalda' | 'lado', string[]> = {
    frente: ['..OOOOOO..', '.OHHHHHHO.', 'OHHHHHHHHO', 'OHSSSSSSHO', 'OSSESSESSO', '.OSSSSSSO.', '..OOCCOO..', '.OCCCCCCO.', 'OSOCCDCOSO', 'OSOCCDCOSO', '.OOCCCCOO.', '..OCDDCO..'],
    espalda: ['..OOOOOO..', '.OHHHHHHO.', 'OHHHHHHHHO', 'OHHHHHHHHO', 'OHHHHHHHHO', '.OHHHHHHO.', '..OOCCOO..', '.OCCCCCCO.', 'OSOCDDCOSO', 'OSOCDDCOSO', '.OOCCCCOO.', '..OCDDCO..'],
    lado: ['..OOOOO...', '.OHHHHHO..', 'OHHHHHHHO.', 'OHHHSSSSO.', 'OHHSSSESO.', '.OHSSSSSO.', '..OOCCOO..', '..OCCCCO..', '..OCCDSO..', '..OCCDSO..', '..OCCCCO..', '..OCDDCO..'],
  };
  const PIERNAS = [['..OCOOCO..', '..OBO.OBO.', '..OOO.OOO.'], ['..OCOOCO..', '.OBO...OBO', '.OOO...OOO']];
  const COLORES_HEROE = [
    { H: '#6a3a1a', C: '#3f7bff', D: '#1d3a6e', B: '#4a2c14' },
    { H: '#e8b04a', C: '#2fcf7a', D: '#1e5c2a', B: '#5a3416' },
    { H: '#f4f1ea', C: '#7a3ad0', D: '#3a2a5a', B: '#2a1450' },
  ];
  const heroe = COLORES_HEROE.map((col) => Object.fromEntries((['frente', 'espalda', 'lado'] as const).map((v) => [v, PIERNAS.map((p) => desdeTexto([...HEROE[v], ...p], { O: PAL.negro, S: PAL.piel, E: PAL.negro, ...col }))])) as Record<'frente' | 'espalda' | 'lado', Sprite[]>);
  const cristal = (L: string, M: string, D: string) => desdeTexto(['..L..', '.LML.', 'LMMMD', 'MMMMD', '.MMD.', '..D..'], { L, M, D });
  const SPR = {
    limo: [bola(7, 6, verde, ojos(7, 5, 3)), bola(8, 5, verde, ojos(8, 4, 3))],
    lobo: [lobo(['..OGO..OGO', '..OO....OO']), lobo(['...OGO.OGO', '...OO...OO'])],
    golem: [golem('#a8784a', '#8a6038', '#d9a87a')],
    minijefe: [golem('#e8483a', '#a8283a', '#ff9a8a')],
    hechicero: [desdeTexto(['.....O.....', '....OVO....', '...OVVVO...', '..OVVWVVO..', '.OOOOOOOOO.', '..OSSSSSO..', '..OSESESO..', '..OSSSSSO.Y', '...OVVVO..O', '..OVVWVVOOO', '.OVVVWVVVO.', '.OVVVWVVVO.', 'OVVVVWVVVVO', 'OVVVVVVVVVO', 'OOOOOOOOOOO'], { O: '#2a1450', V: PAL.violeta, W: PAL.lila, S: '#e8c9a8', E: PAL.negro, Y: PAL.amarillo })],
    avispa: [avispa(['..WW.WW..', '..WWWWW..'], '..O...O..'), avispa(['.........', '.........'], 'WWO...OWW')],
    jefe: [bola(22, 22, { borde: '#120a20', sombra: '#2a1a40', base: '#3a2a5a', luz: '#5a4a8a', brillo: '#8a7ab8' }, (g, w) => {
      g.fillStyle = PAL.amarillo; for (let k = -2; k <= 2; k++) g.fillRect(Math.round(w / 2 + k * 6 - 2), 2 + Math.abs(k) * 2, 4, 7 - Math.abs(k));
      g.fillStyle = PAL.dorado; g.fillRect(Math.round(w / 2 - 14), 8, 28, 3);
      ojos(w / 2 - 1, 20, 7, PAL.rojo, '#5a0010')(g);
    })],
    cristal: [cristal('#cfe3ff', PAL.celeste, PAL.azul), cristal('#e0fff0', PAL.menta, PAL.verde), cristal('#ffd0d6', PAL.rojo, PAL.rojoOscuro)],
    oro: bola(3, 3, { borde: PAL.dorado, sombra: '#e0a020', base: PAL.amarillo, luz: '#fff0a0', brillo: '#ffffff' }),
    comida: desdeTexto(['...OOOO..', '..ORRRRO.', '.ORRMRRRO', '.ORRRRRRO', '..ORRRROWW', '...OOOO.WW'], { O: '#5a2a10', R: '#c96a3a', M: '#e8955a', W: '#fff1d0' }),
    iman: desdeTexto(['ORRO.ORRO', 'ORRO.ORRO', 'ORRO.ORRO', 'ORRRRRRRO', '.ORRRRRO.', 'GG.....GG'], { O: '#5a0010', R: PAL.rojo, G: PAL.grisClaro }),
    bomba: bola(5, 5, { borde: PAL.negro, sombra: '#1a1a22', base: '#3a3a48', luz: '#6a6a7a', brillo: '#b9b9c6' }, (g, w) => { g.fillStyle = PAL.madera; g.fillRect(Math.round(w / 2), 0, 1, 2); }),
    cofre: desdeTexto(['.OOOOOOOOOO.', 'OMMMMMMMMMMO', 'OMMMMMMMMMMO', 'OYYYYYYYYYYO', 'OMMMMOYOMMMO', 'OMMMMOOOMMMO', 'OMMMMMMMMMMO', 'ODDDDDDDDDDO', '.OOOOOOOOOO.'], { O: '#3a1a08', M: '#9a5a1a', D: '#6a3a10', Y: PAL.amarillo }),
    antorcha: [0, 1].map((f) => desdeTexto([f ? '..Y..' : '.Y...', f ? '.YRY.' : '.YRY.', 'YRRRY', 'YRARY', '.RAR.', '.OOO.', '..M..', '..M..', '..M..', '..M..', '..M..', '.OOO.'], { Y: PAL.amarillo, R: PAL.naranjo, A: '#fff6c9', O: '#3a2010', M: PAL.cafe })),
    espada: desdeTexto(['.W.', 'WLW', 'WLW', 'WLW', 'WLW', 'WLW', 'WLW', 'GGG', '.M.', '.M.'], { W: '#dfe6f3', L: '#ffffff', G: PAL.amarillo, M: PAL.cafe }),
    espadaEvo: desdeTexto(['.W.', 'WLW', 'WLW', 'WLW', 'WLW', 'WLW', 'WLW', 'GGG', '.M.', '.M.'], { W: PAL.hielo, L: '#ffffff', G: PAL.menta, M: PAL.azul }),
    cuchillo: desdeTexto(['MM.WWW.', 'MMWWWLL', 'MM.WWW.'], { M: PAL.cafe, W: '#dfe6f3', L: '#ffffff' }),
    lanza: desdeTexto(['MMMMMMMMMMWW.', 'MMMMMMMMMMWLL', 'MMMMMMMMMMWW.'], { M: PAL.lila, W: '#dfe6f3', L: '#ffffff' }),
    bumeran: desdeTexto(['OOOO...', 'OMMMO..', 'OMOOMO.', '.O..OMO', '.....OO'], { O: '#0a4a30', M: PAL.menta }),
    orbe: bola(3, 3, { borde: '#4a1a7a', sombra: PAL.violeta, base: '#d06bff', luz: '#f0c0ff', brillo: '#ffffff' }),
    meteoro: bola(6, 6, { borde: '#7a1a08', sombra: PAL.naranjoOscuro, base: PAL.naranjo, luz: PAL.amarillo, brillo: '#ffffff' }),
    piedra: bola(6, 4, { borde: PAL.grisOscuro, sombra: PAL.gris, base: '#9a9aa6', luz: PAL.grisClaro }),
    arbusto: bola(8, 6, { borde: '#0e3a14', sombra: PAL.verdeOscuro, base: '#2f6b2a', luz: PAL.verde, brillo: PAL.verdeClaro }),
    sombra: crearSprite(14, 5, (g) => { g.fillStyle = 'rgba(0,0,0,.28)'; for (let y = 0; y < 5; y++) { const w = Math.round(14 * Math.sqrt(1 - ((y - 2) / 2.6) ** 2)); g.fillRect(7 - w / 2, y, w, 1); } }),
  };
  // Pradera: un mosaico de 128 × 128 píxeles con pasto, matas y flores, que se repite
  const PASTO = crearSprite(128, 128, (g) => {
    g.fillStyle = '#4a8a40'; g.fillRect(0, 0, 128, 128);
    const rp = generador('pasto-pixel');
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const n = Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) + Math.sin(y * 0.09 + x * 0.03);
      if (n > 1.1 && (x + y) % 2 === 0) { g.fillStyle = '#56994a'; g.fillRect(x, y, 1, 1); } else if (n < -1.1 && (x + y) % 2 === 0) { g.fillStyle = '#3f7a38'; g.fillRect(x, y, 1, 1); }
    }
    for (let k = 0; k < 90; k++) { const x = Math.floor(rp() * 126), y = Math.floor(rp() * 125); g.fillStyle = '#2f6b2a'; g.fillRect(x, y + 1, 1, 2); g.fillRect(x + 1, y, 1, 3); g.fillStyle = '#7fd85a'; g.fillRect(x + 1, y, 1, 1); }
    const flores = [PAL.amarillo, PAL.rosado, PAL.blanco, PAL.lila];
    for (let k = 0; k < 14; k++) { const x = 1 + Math.floor(rp() * 125), y = 1 + Math.floor(rp() * 125); g.fillStyle = flores[k % 4]; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); g.fillStyle = PAL.amarillo; g.fillRect(x, y, 1, 1); }
  });
  const sx = (x: number) => (x - yo.x) * zoom() + m.ancho / 2, sy = (y: number) => (y - yo.y) * zoom() + ALTO / 2;

  m.alPixel((gp) => {
    const t = m.tiempo, z = zoom(), vw = m.ancho / z, vh = ALTO / z, k = m.k;
    // Suelo
    const lado = 128 * k, ox = ((sx(0) % lado) + lado) % lado - lado, oy = ((sy(0) % lado) + lado) % lado - lado;
    for (let x = ox; x < m.ancho; x += lado) for (let y = oy; y < ALTO; y += lado) gp.drawImage(PASTO, Math.round(x / k) * k, Math.round(y / k) * k, lado, lado);
    const x0 = Math.floor((yo.x - vw / 2) / 128) - 1, y0 = Math.floor((yo.y - vh / 2) / 128) - 1;
    for (let cx = x0; cx < x0 + vw / 128 + 3; cx++) for (let cy = y0; cy < y0 + vh / 128 + 3; cy++) {
      const h = hash(cx, cy);
      if (h > 0.93) m.sprite(SPR.piedra, sx(cx * 128 + 64), sy(cy * 128 + 64));
      else if (h < 0.05) m.sprite(SPR.arbusto, sx(cx * 128 + 40), sy(cy * 128 + 70));
    }
    // Aura, avisos de meteoros y cosas sueltas
    const aura = armas.get('aura');
    if (aura) { const rad = (70 + (aura.nivel + (aura.evo ? 3 : 0)) * 10) * mult.area * z; gp.fillStyle = aura.evo ? 'rgba(255,220,90,.22)' : 'rgba(255,122,58,.2)'; gp.beginPath(); gp.arc(m.ancho / 2, ALTO / 2, rad, 0, Math.PI * 2); gp.fill(); gp.strokeStyle = aura.evo ? 'rgba(255,240,150,.5)' : 'rgba(255,150,80,.45)'; gp.lineWidth = k; gp.stroke(); }
    for (const me of meteoros) { const q = Math.max(0, 1 - Math.max(0, me.t - jt) / 0.6); gp.fillStyle = `rgba(255,60,40,${0.15 + q * 0.25})`; gp.beginPath(); gp.ellipse(sx(me.x), sy(me.y), me.r * q * z, me.r * q * z * 0.7, 0, 0, Math.PI * 2); gp.fill(); }
    for (const s of sueltos) {
      const X = sx(s.x), Y = sy(s.y);
      if (X < -40 || X > m.ancho + 40 || Y < -40 || Y > ALTO + 40) continue;
      const salto = Math.round(Math.sin(t * 5 + s.x) * 1.5) * k;
      if (s.tipo === 'xp') m.sprite(SPR.cristal[s.valor >= 4 ? 2 : s.valor >= 2 ? 1 : 0], X, Y + salto);
      else if (s.tipo === 'cofre') { gp.fillStyle = 'rgba(255,210,60,.25)'; gp.beginPath(); gp.arc(X, Y, (14 + Math.sin(t * 5) * 2) * k, 0, Math.PI * 2); gp.fill(); m.sprite(SPR.cofre, X, Y + salto); }
      else m.sprite(SPR[s.tipo], X, Y + salto);
    }
    for (const a of antorchas) m.sprite(SPR.antorcha[Math.floor(t * 8 + a.x) & 1], sx(a.x), sy(a.y) - 8 * k);
    // Enemigos (de atrás hacia adelante) con su sombra y el destello blanco al recibir un golpe
    const visibles = enemigos.filter((e) => Math.abs(e.x - yo.x) < vw / 2 + 60 && Math.abs(e.y - yo.y) < vh / 2 + 60).sort((a, b) => a.y - b.y);
    for (const e of visibles) {
      const X = sx(e.x), Y = sy(e.y), lista = SPR[e.tipo], cuadro = lista[Math.floor(t * 6 + e.id) % lista.length];
      const escala = e.tipo === 'minijefe' ? 2 : 1, alto = cuadro.height * k * escala;
      m.sprite(SPR.sombra, X, Y + alto * 0.35, e.r > 20 ? 2 : 1);
      let img = e.tipo === 'lobo' && e.x > yo.x ? espejo(cuadro) : cuadro;
      if (t - e.golpe < 0.08) img = silueta(img);
      m.sprite(img, X, Y - (e.tipo === 'avispa' ? 6 * k : 0), escala);
      if ((e.tipo === 'golem' || e.tipo === 'minijefe') && e.vida < e.max) { const w = e.r * 2 * z; gp.fillStyle = PAL.negro; gp.fillRect(Math.round((X - w / 2) / k) * k, Math.round((Y - alto * 0.65) / k) * k, w, k); gp.fillStyle = PAL.rojo; gp.fillRect(Math.round((X - w / 2) / k) * k, Math.round((Y - alto * 0.65) / k) * k, w * (e.vida / e.max), k); }
      if (e.tipo === 'jefe' && t < e.carga) { gp.strokeStyle = PAL.rojo; gp.lineWidth = 2 * k; gp.beginPath(); gp.moveTo(X, Y); gp.lineTo(X + e.cx * 300 * z, Y + e.cy * 300 * z); gp.stroke(); }
    }
    // Protagonista: mira hacia donde camina y mueve las piernas
    const vista = Math.abs(yo.dirX) > Math.abs(yo.dirY) ? 'lado' : yo.dirY < 0 ? 'espalda' : 'frente', anda = fase === 'juego' && (Math.abs(ultimaDir[0]) + Math.abs(ultimaDir[1]) > 0.05);
    let img = heroe[personaje][vista][anda ? Math.floor(t * 8) % 2 : 0];
    if (vista === 'lado' && yo.dirX < 0) img = espejo(img);
    m.sprite(SPR.sombra, m.ancho / 2, ALTO / 2 + 7 * k);
    if (!(jt - yo.golpeado < 0.15 && Math.floor(t * 30) % 2 === 0)) m.sprite(jt - yo.golpeado < 0.1 ? silueta(img, PAL.rojo) : img, m.ancho / 2, ALTO / 2 - 2 * k);
    // Armas
    const esp = armas.get('espada');
    if (esp) {
      const lv = esp.nivel + (esp.evo ? 3 : 0), n = esp.evo ? 5 : [1, 2, 2, 3, 3][esp.nivel - 1], rad = (75 + lv * 4) * mult.area;
      for (let q = 0; q < n; q++) { const a = jt * (esp.evo ? 4.5 : 3.2) + (q * Math.PI * 2) / n; m.sprite(girado(esp.evo ? SPR.espadaEvo : SPR.espada, a + Math.PI / 2), sx(yo.x + Math.cos(a) * rad), sy(yo.y + Math.sin(a) * rad), mult.area > 1.25 ? 2 : 1); }
    }
    for (const b of balas) {
      const X = sx(b.x), Y = sy(b.y);
      if (b.enemiga) { m.sprite(SPR.orbe, X, Y); continue; }
      const id = LISTA_ARMAS[b.arma], a = Math.atan2(b.vy, b.vx);
      m.sprite(id === 'bumeran' ? girado(SPR.bumeran, t * 18) : girado(id === 'lanza' ? SPR.lanza : SPR.cuchillo, a), X, Y);
    }
    for (const me of meteoros) { const q = Math.max(0, me.t - jt) / 0.6; m.sprite(SPR.meteoro, sx(me.x + q * 160), sy(me.y) - q * 260 * z, me.r > 70 ? 2 : 1); }
    gp.lineCap = 'square';
    for (let q = rayos.length - 1; q >= 0; q--) { const ry = rayos[q], edad = jt - ry.t; if (edad > 0.15) { rayos.splice(q, 1); continue; } for (const [ancho, color] of [[3 * k, PAL.celeste], [k, '#ffffff']] as const) { gp.strokeStyle = color; gp.lineWidth = ancho; gp.beginPath(); ry.puntos.forEach(([x, y], i) => { const j = i ? Math.round((hash(i, Math.floor(t * 30)) - 0.5) * 4) * k : 0; if (i) gp.lineTo(sx(x) + j, sy(y) + j); else gp.moveTo(sx(x), sy(y)); }); gp.stroke(); } }
    for (let q = ondas.length - 1; q >= 0; q--) { const o = ondas[q], edad = (jt - o.t) / 0.35; if (edad > 1) { ondas.splice(q, 1); continue; } gp.strokeStyle = o.color; gp.globalAlpha = 1 - edad; gp.lineWidth = 2 * k; gp.beginPath(); gp.arc(sx(o.x), sy(o.y), o.r * (0.4 + edad * 0.6) * z, 0, Math.PI * 2); gp.stroke(); gp.globalAlpha = 1; }
    // Luz del día: tarde, atardecer y noche cuando llega el jefe
    const dia = Math.min(1, jt / JEFE_EN), noche = jefe ? 1 : Math.max(0, (dia - 0.75) / 0.25);
    if (dia > 0.4) { gp.fillStyle = `rgba(255,120,40,${Math.min(0.14, (dia - 0.4) * 0.3) * (1 - noche)})`; gp.fillRect(0, 0, m.ancho, ALTO); }
    if (noche > 0) { gp.fillStyle = `rgba(20,24,70,${noche * 0.38})`; gp.fillRect(0, 0, m.ancho, ALTO); for (const a of antorchas) { gp.fillStyle = `rgba(255,170,60,${noche * 0.18})`; gp.beginPath(); gp.arc(sx(a.x), sy(a.y), 70 * z, 0, Math.PI * 2); gp.fill(); } }
  });

  m.alDibujar((g) => {
    const z = zoom(), vw = m.ancho / z, vh = ALTO / z;
    g.save();
    g.scale(z, z);
    g.translate(vw / 2 - yo.x, vh / 2 - yo.y);
    // Números de daño
    for (let k = numeros.length - 1; k >= 0; k--) { const n = numeros[k], edad = jt - n.t; if (edad > 0.6) { numeros.splice(k, 1); continue; } m.rotulo(String(n.v), n.x, n.y - edad * 40 - 10, n.critico ? 22 : 15, n.critico ? '#ffd23c' : '#ffffff', 1 - edad / 0.6); }
    g.globalAlpha = 1;
    g.restore();
    // Con el mouse: una flecha junto al personaje muestra hacia dónde va
    if (modoMouse() && fase === 'juego') { const [dx, dy] = ultimaDir, l = Math.hypot(dx, dy); if (l > 0.05) { const a = Math.atan2(dy, dx), cx = m.ancho / 2 + Math.cos(a) * 46, cy = ALTO / 2 + Math.sin(a) * 46; g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.moveTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); g.lineTo(cx + Math.cos(a + 2.4) * 8, cy + Math.sin(a + 2.4) * 8); g.lineTo(cx + Math.cos(a - 2.4) * 8, cy + Math.sin(a - 2.4) * 8); g.fill(); } }
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
    if (jt < 6 && fase === 'juego' && !bot) m.rotulo('Muévete con el mouse (apunta hacia donde quieres ir), WASD o arrastrando el dedo: tus armas atacan solas', m.ancho / 2, ALTO - 50, Math.round(Math.min(22, m.ancho / 22)), '#fff6c9');
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

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__horda = () => ({ fase, x: Math.round(yo.x), y: Math.round(yo.y), puntos: Math.round(jt * 20) + puntos + oro * 5, seg: Math.round(jt), nivel: yo.nivel, vida: Math.round(yo.vida), muertes, enemigos: enemigos.length, armas: [...armas].map(([id, w]) => `${id}${w.nivel}${w.evo ? '+' : ''}`), terminado });
  return {
    empezar() { m.empezar(); if (fase === 'juego') empezarPartida(); },
    destruir() { musica.parar(); m.destruir(); },
  };
}
