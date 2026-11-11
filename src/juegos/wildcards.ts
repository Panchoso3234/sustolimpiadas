// Wild Cards (desde el cruce 8): una carta por equipo y cruce, sorteada en la Mesa de control.
// Este archivo es puro (sin Supabase): catálogo, probabilidades y el motor que calcula los puntos de cada carta.
// Lo usan la web (tabla, Mesa de control, página pública) y el script que genera el catálogo para la base.

export type Rareza = 'comun' | 'rara' | 'epica' | 'legendaria';
export interface Carta { id: string; nombre: string; emoji: string; rareza: Rareza; tipo: 'auto' | 'decision'; efecto: string }

export const DESDE_CRUCE = 8;

export const RAREZAS: Record<Rareza, { nombre: string; color: string }> = {
  comun: { nombre: 'Común', color: '#b8c0cc' },
  rara: { nombre: 'Rara', color: '#4aa8ff' },
  epica: { nombre: 'Épica', color: '#b46cff' },
  legendaria: { nombre: 'Legendaria', color: '#ffc83d' },
};

const c = (id: string, emoji: string, nombre: string, rareza: Rareza, tipo: Carta['tipo'], efecto: string): Carta => ({ id, emoji, nombre, rareza, tipo, efecto });
export const CARTAS: Carta[] = [
  c('escudo', '🛡️', 'Escudo de Arena', 'comun', 'auto', 'Cada derrota vale +1 punto base.'),
  c('hinchada', '📣', 'La Hinchada', 'comun', 'auto', '+1 punto base por cada duelo ganado.'),
  c('consuelo', '🧃', 'Premio de Consuelo', 'comun', 'auto', 'Si el equipo gana 0 o 1 duelo: +3 puntos base.'),
  c('dado', '🎲', 'Dado de la Suerte', 'comun', 'auto', 'Se tira un dado de 1 a 4: suma esos puntos base.'),
  c('bebida', '🥤', 'Bebida Energética', 'comun', 'auto', 'Si el equipo gana al menos un duelo: +2 puntos base.'),
  c('pelo', '🪶', 'Por un Pelo', 'comun', 'auto', '+1 punto base por cada duelo ganado 2-1.'),
  c('cancha', '🎯', 'Elige tu Cancha', 'comun', 'decision', 'El equipo elige el juego de 1 de sus duelos.'),
  c('segunda', '🔁', 'Segunda Vuelta', 'comun', 'decision', 'Un jugador repite 1 ronda y se queda con su mejor puntaje.'),
  c('doble_nada', '⚡', 'Doble o Nada', 'rara', 'decision', 'Se marca 1 duelo antes de jugarlo: si lo gana vale el doble; si lo pierde, 0.'),
  c('muralla', '🧱', 'La Muralla', 'rara', 'auto', 'Cada derrota vale como empate (+2 puntos base).'),
  c('iman', '🧲', 'Imán', 'rara', 'auto', '+2 puntos base por cada duelo ganado.'),
  c('barrida', '🧹', 'Barrida', 'rara', 'auto', 'Si gana los 3 duelos: +8 puntos base.'),
  c('trampa', '🪤', 'Trampa', 'rara', 'auto', 'El rival pierde 1 punto base por cada duelo que pierda contra este equipo.'),
  c('cambio_rivales', '🔀', 'Cambio de Rivales', 'rara', 'decision', 'El equipo decide quién de los suyos juega contra quién.'),
  c('ruleta', '🎰', 'Ruleta Rusa', 'rara', 'auto', 'Se gira otra vez: 50 % gana además una carta Épica, 50 % nada.'),
  c('racha', '🔥', 'En Racha', 'epica', 'auto', 'Todos los puntos del equipo en el cruce valen ×1,25.'),
  c('contraataque', '🦅', 'Contraataque', 'epica', 'auto', 'Por cada duelo ganado, el rival pierde 2 puntos base.'),
  c('sed', '🩸', 'Sed de Sangre', 'epica', 'auto', 'Si gana la serie (2 o 3 duelos): +6 puntos base.'),
  c('congelar', '🧊', 'Congelar', 'epica', 'auto', 'La carta del rival no se aplica este cruce (no sirve contra legendarias).'),
  c('doble_carta', '🃏', 'Doble Carta', 'epica', 'auto', 'En vez de esta, el equipo recibe 2 cartas (común o rara) y usa ambas.'),
  c('revancha', '🔄', 'Revancha Total', 'epica', 'decision', 'Un duelo perdido se vuelve a jugar completo, con un desafío nuevo, y vale el segundo.'),
  c('corona', '👑', 'La Corona', 'legendaria', 'auto', 'Todos los puntos del equipo en el cruce valen ×1,5.'),
  c('agujero', '🕳️', 'Agujero Negro', 'legendaria', 'auto', 'Por cada duelo ganado, le roba 3 puntos base al rival.'),
  c('orbita', '🪐', 'Cambio de Órbita', 'legendaria', 'auto', 'Si el rival hizo más puntos en el cruce, se intercambian.'),
  c('mano', '✋', 'Mano de Dios', 'legendaria', 'decision', 'Elige cualquier carta común, rara o épica, y además +4 puntos base.'),
];
export const cartaPorId = (id: string) => CARTAS.find((x) => x.id === id);

/** Probabilidad de cada rareza según el puesto en la tabla. Si un puesto quedaba en dos grupos, va al de más abajo. */
export const PROBABILIDADES = [
  { desde: 1, hasta: 2, comun: 68, rara: 22, epica: 8, legendaria: 2 },
  { desde: 3, hasta: 5, comun: 60, rara: 25, epica: 12, legendaria: 3 },
  { desde: 6, hasta: 8, comun: 45, rara: 30, epica: 15, legendaria: 10 },
  { desde: 9, hasta: 12, comun: 30, rara: 28, epica: 22, legendaria: 20 },
];
export const rarezasPara = (puesto: number) => PROBABILIDADES.find((g) => puesto >= g.desde && puesto <= g.hasta) ?? PROBABILIDADES[PROBABILIDADES.length - 1];
/** La misma regla que usa wc_sortear en la base: r entre 0 y 100, acumulando común → rara → épica → legendaria. */
export function rarezaPorAzar(puesto: number, r: number): Rareza {
  const g = rarezasPara(puesto);
  return r < g.comun ? 'comun' : r < g.comun + g.rara ? 'rara' : r < g.comun + g.rara + g.epica ? 'epica' : 'legendaria';
}

// ───────── Motor ─────────
/** Un duelo de un cruce visto como equipo contra equipo (también las victorias por ausencia). */
export interface DueloEquipo { id: number; a: number; b: number; ganador: 'a' | 'b' | 'empate'; noJugo: 'a' | 'b' | 'ambos' | null; rondasA: number; rondasB: number }
/** Una carta sorteada. `origen`: la carta que la trajo (Doble Carta, Ruleta Rusa, Mano de Dios). `duelo`: el marcado con Doble o Nada. */
export interface CartaJugada { id: number; equipo: number; carta: string; origen?: number | null; dado?: number | null; duelo?: number | null; anulada?: boolean }
export interface Ajuste { equipo: number; puntos: number; detalle: string[] }

/** Datos mínimos de un duelo y de una ausencia, tal como vienen de la base. */
interface DueloBase { id: number; modo: string; oficial: boolean; estado: string; cruce?: number | null; a_perfil: string | null; b_perfil: string | null; ganador: string | null; no_jugo?: string | null; puntos_a: number; puntos_b: number }
interface AusenciaBase { id: number; cruce: number; perfil_id: string; equipo_rival: number }

/** Los duelos oficiales cerrados de un cruce como equipo contra equipo. Una ausencia es una victoria del presente (id negativo). */
export function duelosDelCruce(cruce: number, duelos: DueloBase[], equipoDe: Map<string, number>, ausencias: AusenciaBase[]): DueloEquipo[] {
  const lista: DueloEquipo[] = [];
  for (const d of duelos) {
    if (d.cruce !== cruce || !d.oficial || d.modo !== '1v1' || d.estado !== 'cerrado' || !d.ganador) continue;
    const a = equipoDe.get(d.a_perfil ?? ''), b = equipoDe.get(d.b_perfil ?? '');
    if (a == null || b == null || a === b) continue;
    lista.push({ id: d.id, a, b, ganador: d.ganador as DueloEquipo['ganador'], noJugo: (d.no_jugo ?? null) as DueloEquipo['noJugo'], rondasA: d.puntos_a, rondasB: d.puntos_b });
  }
  for (const x of ausencias) {
    const a = equipoDe.get(x.perfil_id);
    if (x.cruce === cruce && a != null && a !== x.equipo_rival) lista.push({ id: -x.id, a, b: x.equipo_rival, ganador: 'a', noJugo: 'b', rondasA: 0, rondasB: 0 });
  }
  return lista;
}

const BASE = { v: 7, e: 6, d: 4, nj: 0 }, BONO = 5;
const redondear = (x: number) => Math.round(x * 100) / 100;
const firmar = (x: number) => (x >= 0 ? `+${redondear(x)}` : `−${redondear(-x)}`);

/**
 * Puntos extra (o en contra) de cada equipo por las Wild Cards de un cruce, ya multiplicados por la jornada.
 * Orden fijo: resultado → cambios por duelo → bonos → multiplicadores de carta → robos → Cambio de Órbita → mínimo 0 → × jornada.
 */
export function calcularAjustes(duelos: DueloEquipo[], cartas: CartaJugada[], mult: number): Ajuste[] {
  const porId = new Map(cartas.map((x) => [x.id, x]));
  const rareza = (x: CartaJugada) => cartaPorId(x.carta)?.rareza;
  const protegida = (x: CartaJugada) => rareza(x) === 'legendaria' || (x.origen != null && porId.get(x.origen) != null && rareza(porId.get(x.origen)!) === 'legendaria');
  const pares = new Map<string, DueloEquipo[]>();
  for (const d of duelos) { const k = `${Math.min(d.a, d.b)}-${Math.max(d.a, d.b)}`; pares.set(k, [...(pares.get(k) ?? []), d]); }
  const salida: Ajuste[] = [];

  for (const lista of pares.values()) {
    const equipos = [lista[0].a, lista[0].b];
    const vista = (eq: number) => lista.map((d) => {
      const lado = d.a === eq ? 'a' : 'b', propias = lado === 'a' ? d.rondasA : d.rondasB, rival = lado === 'a' ? d.rondasB : d.rondasA;
      const res = d.noJugo === lado || d.noJugo === 'ambos' ? 'nj' : d.ganador === 'empate' ? 'e' : d.ganador === lado ? 'v' : 'd';
      return { id: d.id, res, propias, rival } as const;
    });
    const activas0 = (eq: number) => cartas.filter((x) => x.equipo === eq && !x.anulada);
    const tieneCongelar = (eq: number) => activas0(eq).some((x) => x.carta === 'congelar');
    // Congelar se evalúa a la vez para los dos: si ambos lo tienen, se congelan mutuamente
    const activas = (eq: number, rivalEq: number) => activas0(eq).filter((x) => !tieneCongelar(rivalEq) || protegida(x));
    const estado = equipos.map((eq, i) => {
      const rivalEq = equipos[1 - i], v = vista(eq), mias = activas(eq, rivalEq), tiene = (id: string) => mias.filter((x) => x.carta === id);
      const ganados = v.filter((x) => x.res === 'v').length, perdidos = v.filter((x) => x.res === 'd').length;
      const original = v.reduce((s, x) => s + BASE[x.res], 0) + (lista.filter((d) => d.ganador === (d.a === eq ? 'a' : 'b')).length >= 2 ? BONO : 0);
      const detalle: string[] = [];
      let total = original;
      const sumar = (id: string, base: number, veces = 1) => {
        for (const x of tiene(id)) { const n = base * veces; if (!n) continue; total += n; const k = cartaPorId(x.carta)!; detalle.push(`${k.emoji} ${k.nombre}: ${firmar(n)} base`); }
      };
      // Cambios por duelo
      sumar('escudo', 1, perdidos);
      sumar('muralla', 2, perdidos);
      for (const x of tiene('doble_nada')) {
        const d = v.find((y) => y.id === x.duelo); const n = d?.res === 'v' ? BASE.v : d?.res === 'd' ? -BASE.d : 0;
        if (n) { total += n; detalle.push(`⚡ Doble o Nada: ${firmar(n)} base`); }
      }
      // Bonos fijos
      sumar('hinchada', 1, ganados);
      sumar('consuelo', ganados <= 1 ? 3 : 0);
      for (const x of tiene('dado')) if (x.dado) { total += x.dado; detalle.push(`🎲 Dado de la Suerte (salió ${x.dado}): +${x.dado} base`); }
      sumar('bebida', ganados >= 1 ? 2 : 0);
      sumar('pelo', 1, v.filter((x) => x.res === 'v' && x.propias === 2 && x.rival === 1).length);
      sumar('iman', 2, ganados);
      sumar('barrida', ganados === 3 ? 8 : 0);
      sumar('sed', ganados >= 2 ? 6 : 0);
      sumar('mano', 4);
      sumar('agujero', 3, ganados);
      // Multiplicadores de carta
      for (const [id, f] of [['racha', 1.25], ['corona', 1.5]] as const) for (const x of tiene(id)) {
        const n = total * (f - 1); total += n; const k = cartaPorId(x.carta)!; detalle.push(`${k.emoji} ${k.nombre} (×${String(f).replace('.', ',')}): ${firmar(n)} base`);
      }
      // Robos que este equipo le hace al rival
      const robos = [['trampa', 1], ['contraataque', 2], ['agujero', 3]].flatMap(([id, n]) => tiene(id as string).map((x) => ({ carta: x.carta, n: (n as number) * ganados }))).filter((x) => x.n > 0);
      return { eq, original, total, detalle, robos, orbita: tiene('orbita').length > 0 };
    });
    // Robos recibidos
    for (const [i, yo] of estado.entries()) for (const r of estado[1 - i].robos) {
      const k = cartaPorId(r.carta)!; yo.total -= r.n; yo.detalle.push(`${k.emoji} ${k.nombre} del rival: −${r.n} base`);
    }
    for (const yo of estado) if (yo.total < 0) { yo.detalle.push('Mínimo del cruce: no baja de 0'); yo.total = 0; }
    // Cambio de Órbita (si los dos la tienen, se cancelan)
    const [p, q] = estado;
    if (p.orbita !== q.orbita) {
      const [quien, otro] = p.orbita ? [p, q] : [q, p];
      if (otro.total > quien.total) {
        [quien.total, otro.total] = [otro.total, quien.total];
        quien.detalle.push('🪐 Cambio de Órbita: se intercambian los puntos del cruce'); otro.detalle.push('🪐 Cambio de Órbita del rival: se intercambian los puntos del cruce');
      }
    } else if (p.orbita) { p.detalle.push('🪐 Dos Cambios de Órbita: se cancelan'); q.detalle.push('🪐 Dos Cambios de Órbita: se cancelan'); }
    for (const yo of estado) salida.push({ equipo: yo.eq, puntos: redondear((yo.total - yo.original) * mult), detalle: yo.detalle });
  }
  return salida;
}

// ───────── Mensaje de Discord al revelar ─────────
const EMOJI_RAREZA: Record<Rareza, string> = { comun: '⚪', rara: '🔵', epica: '🟣', legendaria: '🟡' };
export const puntosChile = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(redondear(n)).toLocaleString('es-CL')}`;

/** El anuncio de la revelación, en partes de menos de 1.900 caracteres (Discord corta en 2.000). */
export function textosRevelacion(cruce: number, cartas: { equipo: number; carta: string; rareza: Rareza }[], ajustes: { equipo: number; puntos: number; detalle: string[] }[], nombres: Map<number, string>): string[] {
  const bloques = [...nombres.keys()].filter((eq) => cartas.some((x) => x.equipo === eq) || ajustes.some((a) => a.equipo === eq && a.puntos)).map((eq) => {
    const propias = cartas.filter((x) => x.equipo === eq).map((x) => { const k = cartaPorId(x.carta); return `${EMOJI_RAREZA[x.rareza]} ${k ? `${k.emoji} ${k.nombre}` : x.carta}`; });
    const a = ajustes.find((x) => x.equipo === eq);
    const lineas = [`**${nombres.get(eq)}** · ${propias.join(' + ') || 'sin carta'} → **${puntosChile(a?.puntos ?? 0)}**`, ...(a?.detalle ?? []).map((d) => `  └ ${d}`)];
    return lineas.join('\n');
  });
  const textos: string[] = [];
  let actual = `🃏 **SE REVELAN LAS WILD CARDS · CRUCE ${cruce}**\nLos puntos ya incluyen el multiplicador de la jornada.\n`;
  for (const b of bloques) {
    const bloque = b.length > 1800 ? `${b.slice(0, 1797)}…` : b;
    if (actual.length + bloque.length + 2 > 1900) { textos.push(actual.trimEnd()); actual = ''; }
    actual += `\n${bloque}\n`;
  }
  if (actual.trim()) textos.push(actual.trimEnd());
  return textos;
}
