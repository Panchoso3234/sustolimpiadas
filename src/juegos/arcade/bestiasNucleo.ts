import { ATAQUES, FORCEJEO, eficacia, especie, type Ataque, type EstadoAlterado, type Stat, type Tipo } from './bestiasDatos';

// El combate de Bestiario, puro y sin dibujo (para probarlo con `node` y para que en vivo los dos navegadores lleguen al
// mismo resultado): cada turno los dos lados eligen una acción, se ordenan (cambios y objetos primero, después
// prioridad y velocidad) y se resuelven. Todo el azar sale de la semilla guardada en el combate. El resultado es una
// lista de eventos que la vista cuenta y anima en orden.

export const NIVEL = 50;
/** Una criatura del equipo: su número (al nivel 50) o su número y su nivel. */
export type Miembro = number | { n: number; nivel: number };
export interface Luchador {
  n: number; nivel: number; ps: number; max: number; stats: Record<Stat, number>; etapas: Record<Stat, number>;
  estado: EstadoAlterado | null; sueno: number; toxico: number; confusion: number; pp: number[];
}
export interface Lado { equipo: Luchador[]; activo: number; pociones: number; curas: number; protegido: boolean; protecciones: number; retrocede: boolean; actuo: boolean }
export interface Combate { lados: [Lado, Lado]; turno: number; azar: number; ganador: 0 | 1 | null }
export type Accion = { tipo: 'atacar'; i: number } | { tipo: 'cambiar'; a: number } | { tipo: 'objeto'; cual: 'pocion' | 'cura' };
export type Evento =
  | { t: 'ataque'; lado: number; ataque: string }
  | { t: 'daño'; lado: number; ps: number; efic: number; critico: boolean; propio?: 'rebote' | 'estado' | 'confusion' }
  | { t: 'cura'; lado: number; ps: number }
  | { t: 'estado'; lado: number; estado: EstadoAlterado }
  | { t: 'confusion'; lado: number }
  | { t: 'stat'; lado: number; stat: Stat; cambio: number; tope?: boolean }
  | { t: 'cambio'; lado: number; a: number }
  | { t: 'debilitado'; lado: number }
  | { t: 'texto'; lado: number; clave: Texto; extra?: string }
  | { t: 'fin'; ganador: 0 | 1 };
/** Mensajes que la vista arma con el nombre de la criatura. */
export type Texto = 'falla' | 'noAfecta' | 'seProtegio' | 'protege' | 'retrocede' | 'dormido' | 'despierta' | 'congelado' | 'descongela' | 'paralizado'
  | 'confundido' | 'sinConfusion' | 'seGolpea' | 'sinEfecto' | 'yaTiene' | 'pocion' | 'cura' | 'forcejeo' | 'sinPP' | 'curaEstado';

/** Estadísticas al nivel 50 (como con el máximo de potencial y sin entrenamiento extra). */
export const calcular = (n: number, nivel = NIVEL) => {
  const b = especie(n).base, otro = (v: number) => Math.floor(((2 * v + 31) * nivel) / 100) + 5;
  return { ps: Math.floor(((2 * b.ps + 31) * nivel) / 100) + nivel + 10, stats: { at: otro(b.at), def: otro(b.def), ate: otro(b.ate), dfe: otro(b.dfe), vel: otro(b.vel) } };
};
const nuevoLuchador = (m: Miembro): Luchador => {
  const n = typeof m === 'number' ? m : m.n, nivel = typeof m === 'number' ? NIVEL : m.nivel, c = calcular(n, nivel);
  return { n, nivel, ps: c.ps, max: c.ps, stats: c.stats, etapas: { at: 0, def: 0, ate: 0, dfe: 0, vel: 0 }, estado: null, sueno: 0, toxico: 0, confusion: 0, pp: especie(n).ataques.map((id) => ATAQUES[id].pp) };
};
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export function nuevoCombate(semilla: string, a: Miembro[], b: Miembro[], objetos = { pociones: 2, curas: 1 }): Combate {
  const lado = (eq: Miembro[]): Lado => ({ equipo: eq.map(nuevoLuchador), activo: 0, pociones: objetos.pociones, curas: objetos.curas, protegido: false, protecciones: 0, retrocede: false, actuo: false });
  return { lados: [lado(a), lado(b)], turno: 0, azar: hash(semilla), ganador: null };
}
/** Número al azar entre 0 y 1 (mulberry32 con el estado dentro del combate, así se puede copiar y repetir). */
export function azar(c: Combate) {
  c.azar = (c.azar + 0x6d2b79f5) >>> 0;
  let t = c.azar;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const activo = (c: Combate, lado: number) => c.lados[lado].equipo[c.lados[lado].activo];
export const tipos = (l: Luchador): Tipo[] => especie(l.n).tipos;
const mult = (etapa: number) => (etapa >= 0 ? (2 + etapa) / 2 : 2 / (2 - etapa));
/** La estadística con sus subidas o bajadas (y la parálisis, que frena). */
export const efectiva = (l: Luchador, s: Stat) => Math.floor(l.stats[s] * mult(l.etapas[s]) * (s === 'vel' && l.estado === 'paralizado' ? 0.5 : 1));
export const ataqueDe = (l: Luchador, i: number): Ataque => (i < 0 ? FORCEJEO : ATAQUES[especie(l.n).ataques[i]]);
export const vivos = (lado: Lado) => lado.equipo.filter((l) => l.ps > 0).length;

/** El daño de un ataque: la fórmula clásica (nivel, poder, ataque contra defensa), mismo tipo x1,5, eficacia, crítico y azar. */
export function calcularDano(atacante: Luchador, defensor: Luchador, at: Ataque, critico: boolean, aleatorio: number) {
  const fisico = at.cat === 'fisico';
  // El crítico ignora las bajadas propias del atacante y las subidas de la defensa del rival
  const A = fisico ? (critico ? Math.max(efectiva(atacante, 'at'), atacante.stats.at) : efectiva(atacante, 'at')) : (critico ? Math.max(efectiva(atacante, 'ate'), atacante.stats.ate) : efectiva(atacante, 'ate'));
  const D = fisico ? (critico ? Math.min(efectiva(defensor, 'def'), defensor.stats.def) : efectiva(defensor, 'def')) : (critico ? Math.min(efectiva(defensor, 'dfe'), defensor.stats.dfe) : efectiva(defensor, 'dfe'));
  const poder = at.efecto?.dobleSiEstado && defensor.estado ? at.poder * 2 : at.poder;
  let d = Math.floor(Math.floor((Math.floor((2 * atacante.nivel) / 5 + 2) * poder * A) / D) / 50) + 2;
  if (critico) d = Math.floor(d * 1.5);
  d = Math.floor((d * aleatorio) / 100);
  if (at !== FORCEJEO && tipos(atacante).includes(at.tipo)) d = Math.floor(d * 1.5);
  const efic = at === FORCEJEO ? 1 : eficacia(at.tipo, tipos(defensor));
  d = Math.floor(d * efic);
  if (fisico && atacante.estado === 'quemado') d = Math.floor(d / 2);
  return { dano: efic === 0 ? 0 : Math.max(1, d), efic };
}

/** Lo que puede hacer un lado: atacar con los ataques con PP (o forcejear), cambiar a quien esté vivo y usar objetos. */
export function acciones(c: Combate, lado: number): Accion[] {
  const L = c.lados[lado], yo = activo(c, lado), r: Accion[] = [];
  yo.pp.forEach((pp, i) => { if (pp > 0) r.push({ tipo: 'atacar', i }); });
  if (!r.length) r.push({ tipo: 'atacar', i: -1 });
  L.equipo.forEach((l, a) => { if (a !== L.activo && l.ps > 0) r.push({ tipo: 'cambiar', a }); });
  if (L.pociones > 0 && yo.ps < yo.max) r.push({ tipo: 'objeto', cual: 'pocion' });
  if (L.curas > 0 && (yo.estado || yo.confusion)) r.push({ tipo: 'objeto', cual: 'cura' });
  return r;
}
/** Si a un lado le debilitaron la criatura y tiene con quién reemplazarla. */
export const necesitaCambio = (c: Combate, lado: number) => c.ganador === null && activo(c, lado).ps <= 0 && vivos(c.lados[lado]) > 0;

const INMUNE: Partial<Record<EstadoAlterado, Tipo>> = { quemado: 'fuego', paralizado: 'electrico', congelado: 'hielo', envenenado: 'veneno', toxico: 'veneno' };

export function resolverTurno(c: Combate, decisiones: [Accion, Accion]): Evento[] {
  const ev: Evento[] = [];
  if (c.ganador !== null) return ev;
  c.turno++;
  for (const L of c.lados) { L.protegido = false; L.retrocede = false; L.actuo = false; }
  const orden = [0, 1].map((lado) => {
    const d = decisiones[lado], yo = activo(c, lado);
    const prioridad = d.tipo === 'cambiar' ? 7 : d.tipo === 'objeto' ? 6 : ataqueDe(yo, d.i).prioridad ?? 0;
    return { lado, d, prioridad, vel: efectiva(yo, 'vel'), empate: azar(c) };
  }).sort((x, y) => y.prioridad - x.prioridad || y.vel - x.vel || x.empate - y.empate);
  for (const { lado, d } of orden) {
    if (c.ganador !== null) break;
    const L = c.lados[lado];
    if (activo(c, lado).ps <= 0) continue;
    if (d.tipo === 'cambiar') cambiar(c, lado, d.a, ev);
    else if (d.tipo === 'objeto') usarObjeto(c, lado, d.cual, ev);
    else usarAtaque(c, lado, d.i, ev);
    L.actuo = true;
    revisarFin(c, ev);
  }
  // Fin del turno: quemaduras y venenos
  for (const lado of [0, 1]) {
    if (c.ganador !== null) break;
    const yo = activo(c, lado);
    if (yo.ps <= 0) continue;
    if (yo.estado === 'quemado' || yo.estado === 'envenenado' || yo.estado === 'toxico') {
      const frac = yo.estado === 'quemado' ? 1 / 16 : yo.estado === 'envenenado' ? 1 / 8 : Math.min(15, ++yo.toxico) / 16;
      danar(c, lado, Math.max(1, Math.floor(yo.max * frac)), ev, { efic: 1, critico: false, propio: 'estado' });
      revisarFin(c, ev);
    }
  }
  return ev;
}

/** Entra otra criatura (por elección o porque la anterior se debilitó). */
export function cambiar(c: Combate, lado: number, a: number, ev: Evento[]) {
  const L = c.lados[lado], sale = activo(c, lado);
  if (a === L.activo || !L.equipo[a] || L.equipo[a].ps <= 0) return;
  sale.etapas = { at: 0, def: 0, ate: 0, dfe: 0, vel: 0 }; sale.confusion = 0;
  if (sale.estado === 'toxico') sale.toxico = 0;
  L.activo = a; L.protecciones = 0;
  ev.push({ t: 'cambio', lado, a });
}

function usarObjeto(c: Combate, lado: number, cual: 'pocion' | 'cura', ev: Evento[]) {
  const L = c.lados[lado], yo = activo(c, lado);
  if (cual === 'pocion' && L.pociones > 0) {
    L.pociones--;
    ev.push({ t: 'texto', lado, clave: 'pocion' });
    curar(c, lado, Math.floor(yo.max / 2), ev);
  } else if (cual === 'cura' && L.curas > 0) {
    L.curas--;
    yo.estado = null; yo.sueno = 0; yo.toxico = 0; yo.confusion = 0;
    ev.push({ t: 'texto', lado, clave: 'curaEstado' });
  }
}

function curar(c: Combate, lado: number, cuanto: number, ev: Evento[]) {
  const yo = activo(c, lado), ps = Math.min(cuanto, yo.max - yo.ps);
  if (ps <= 0) { ev.push({ t: 'texto', lado, clave: 'sinEfecto' }); return; }
  yo.ps += ps;
  ev.push({ t: 'cura', lado, ps });
}

function danar(c: Combate, lado: number, cuanto: number, ev: Evento[], info: { efic: number; critico: boolean; propio?: 'rebote' | 'estado' | 'confusion' }) {
  const yo = activo(c, lado), ps = Math.min(yo.ps, cuanto);
  yo.ps -= ps;
  ev.push({ t: 'daño', lado, ps, ...info });
  if (yo.ps <= 0) ev.push({ t: 'debilitado', lado });
}

function revisarFin(c: Combate, ev: Evento[]) {
  if (c.ganador !== null) return;
  const sinA = vivos(c.lados[0]) === 0, sinB = vivos(c.lados[1]) === 0;
  // Si caen los dos a la vez, gana quien atacó (el otro se debilitó por su propio rebote o por el estado)
  if (sinA || sinB) { c.ganador = sinA && sinB ? (c.lados[0].actuo ? 0 : 1) : sinA ? 1 : 0; ev.push({ t: 'fin', ganador: c.ganador }); }
}

/** Pone un problema de estado si se puede (cada criatura tiene uno a la vez y algunos tipos son inmunes). */
function ponerEstado(c: Combate, lado: number, estado: EstadoAlterado, ev: Evento[], avisar: boolean) {
  const yo = activo(c, lado);
  if (yo.ps <= 0) return;
  if (yo.estado || (INMUNE[estado] && tipos(yo).includes(INMUNE[estado]!))) { if (avisar) ev.push({ t: 'texto', lado, clave: yo.estado ? 'yaTiene' : 'sinEfecto' }); return; }
  yo.estado = estado;
  if (estado === 'dormido') yo.sueno = 1 + Math.floor(azar(c) * 3);
  if (estado === 'toxico') yo.toxico = 0;
  ev.push({ t: 'estado', lado, estado });
}
function cambiarStats(c: Combate, lado: number, cambios: Partial<Record<Stat, number>>, ev: Evento[]) {
  const yo = activo(c, lado);
  if (yo.ps <= 0) return;
  for (const [s, v] of Object.entries(cambios) as [Stat, number][]) {
    const antes = yo.etapas[s];
    yo.etapas[s] = Math.max(-6, Math.min(6, antes + v));
    ev.push({ t: 'stat', lado, stat: s, cambio: yo.etapas[s] - antes || v, tope: yo.etapas[s] === antes });
  }
}

function usarAtaque(c: Combate, lado: number, i: number, ev: Evento[]) {
  const rival = 1 - lado, L = c.lados[lado], yo = activo(c, lado), el = activo(c, rival);
  if (L.retrocede) { ev.push({ t: 'texto', lado, clave: 'retrocede' }); return; }
  const at = ataqueDe(yo, i);
  // Lo que puede impedir atacar: sueño, hielo, parálisis y confusión
  if (yo.estado === 'dormido') {
    yo.sueno--;
    if (yo.sueno > 0) { ev.push({ t: 'texto', lado, clave: 'dormido' }); return; }
    yo.estado = null; ev.push({ t: 'texto', lado, clave: 'despierta' });
  }
  if (yo.estado === 'congelado') {
    if (at.efecto?.descongela || azar(c) < 0.2) { yo.estado = null; ev.push({ t: 'texto', lado, clave: 'descongela' }); }
    else { ev.push({ t: 'texto', lado, clave: 'congelado' }); return; }
  }
  if (yo.estado === 'paralizado' && azar(c) < 0.25) { ev.push({ t: 'texto', lado, clave: 'paralizado' }); return; }
  if (yo.confusion > 0) {
    yo.confusion--;
    if (yo.confusion === 0) ev.push({ t: 'texto', lado, clave: 'sinConfusion' });
    else {
      ev.push({ t: 'texto', lado, clave: 'confundido' });
      if (azar(c) < 1 / 3) {
        ev.push({ t: 'texto', lado, clave: 'seGolpea' });
        const golpe = calcularDano(yo, yo, { ...FORCEJEO, poder: 40, tipo: 'normal' }, false, 100);
        danar(c, lado, golpe.dano, ev, { efic: 1, critico: false, propio: 'confusion' });
        return;
      }
    }
  }
  if (i >= 0) yo.pp[i] = Math.max(0, yo.pp[i] - 1);
  else ev.push({ t: 'texto', lado, clave: 'forcejeo' });
  ev.push({ t: 'ataque', lado, ataque: i < 0 ? 'forcejeo' : especie(yo.n).ataques[i] });
  const ef = at.efecto;
  // Protección: cada uso seguido tiene un tercio de la probabilidad del anterior
  if (ef?.protege) {
    if (azar(c) < 1 / 3 ** L.protecciones) { L.protegido = true; L.protecciones++; ev.push({ t: 'texto', lado, clave: 'protege' }); }
    else { L.protecciones = 0; ev.push({ t: 'texto', lado, clave: 'falla' }); }
    return;
  }
  L.protecciones = 0;
  const alRival = at.cat !== 'estado' || ef?.aQuien === 'rival' || !!ef?.estado || !!ef?.confusion;
  if (alRival && el.ps <= 0) { ev.push({ t: 'texto', lado, clave: 'falla' }); return; }
  if (alRival && c.lados[rival].protegido) { ev.push({ t: 'texto', lado: rival, clave: 'seProtegio' }); return; }
  if (alRival && at.precision > 0 && azar(c) * 100 >= at.precision) { ev.push({ t: 'texto', lado, clave: 'falla' }); return; }
  // Ataques de estado
  if (at.cat === 'estado') {
    if (ef?.cura) { curar(c, lado, Math.floor(yo.max * ef.cura), ev); return; }
    if (ef?.estado) {
      // Los ataques eléctricos de estado no afectan a los de Tierra (como Onda Trueno)
      if (eficacia(at.tipo, tipos(el)) === 0) { ev.push({ t: 'texto', lado: rival, clave: 'noAfecta' }); return; }
      ponerEstado(c, rival, ef.estado, ev, true);
    }
    if (ef?.confusion) { if (el.confusion > 0) ev.push({ t: 'texto', lado: rival, clave: 'yaTiene' }); else { el.confusion = 2 + Math.floor(azar(c) * 4); ev.push({ t: 'confusion', lado: rival }); } }
    if (ef?.stats) cambiarStats(c, ef.aQuien === 'yo' ? lado : rival, ef.stats, ev);
    return;
  }
  // Ataques que dañan
  const critico = azar(c) < (at.critico ? 1 / 8 : 1 / 24), aleatorio = 85 + Math.floor(azar(c) * 16);
  const { dano, efic } = calcularDano(yo, el, at, critico, aleatorio);
  if (efic === 0) { ev.push({ t: 'texto', lado: rival, clave: 'noAfecta' }); return; }
  const antes = el.ps;
  danar(c, rival, dano, ev, { efic, critico });
  const hecho = antes - el.ps;
  if (el.estado === 'congelado' && at.tipo === 'fuego' && el.ps > 0) { el.estado = null; ev.push({ t: 'texto', lado: rival, clave: 'descongela' }); }
  if (ef?.drena && yo.ps > 0) curar(c, lado, Math.max(1, Math.floor(hecho * ef.drena)), ev);
  if (ef?.rebote && yo.ps > 0) danar(c, lado, Math.max(1, Math.floor(hecho * ef.rebote)), ev, { efic: 1, critico: false, propio: 'rebote' });
  // Efectos secundarios (con su probabilidad)
  if (ef && (ef.estado || ef.confusion || ef.retroceso || ef.stats)) {
    if (ef.stats && ef.aQuien === 'yo' && ef.prob === undefined) cambiarStats(c, lado, ef.stats, ev);
    else if (azar(c) * 100 < (ef.prob ?? 100)) {
      if (ef.estado) ponerEstado(c, rival, ef.estado, ev, false);
      if (ef.confusion && el.ps > 0 && el.confusion === 0) { el.confusion = 2 + Math.floor(azar(c) * 4); ev.push({ t: 'confusion', lado: rival }); }
      if (ef.retroceso && !c.lados[rival].actuo) c.lados[rival].retrocede = true;
      if (ef.stats) cambiarStats(c, ef.aQuien === 'yo' ? lado : rival, ef.stats, ev);
    }
  }
}

/** Copia profunda (para que la IA pruebe jugadas sin tocar el combate de verdad). */
export const copiar = (c: Combate): Combate => JSON.parse(JSON.stringify(c));
