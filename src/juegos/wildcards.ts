// Wild Cards 2.1 (desde el cruce 8): una carta por equipo y cruce, sorteada en la Mesa de control.
// 2.1 (12-11, opiniones de Palta, LewVan, Chui y Hishore): sin robos, legendarias hasta +22, misiones y 1-2 sin legendaria.
// Este archivo es puro (sin Supabase): catálogo, probabilidades y el motor que calcula los puntos de cada carta.
// Lo usan la web (tabla, Mesa de control, pestaña Wild Cards) y las pruebas, que también comprueban que el SQL tenga
// el mismo catálogo. Catálogo aprobado por Pancho el 11-11 (PDF «Wild Cards 2.0 - catálogo» en el vault).

export type Rareza = 'comun' | 'rara' | 'epica' | 'legendaria';
/** `max`: lo más que suma (en puntos base) por cruce, para mostrarlo y para las pruebas de techo. */
export interface Carta { id: string; nombre: string; emoji: string; rareza: Rareza; tipo: 'auto' | 'decision'; efecto: string; max: string }

export const DESDE_CRUCE = 8;

export const RAREZAS: Record<Rareza, { nombre: string; color: string }> = {
  comun: { nombre: 'Común', color: '#b8c0cc' },
  rara: { nombre: 'Rara', color: '#4aa8ff' },
  epica: { nombre: 'Épica', color: '#b46cff' },
  legendaria: { nombre: 'Legendaria', color: '#ffc83d' },
};
/** Lo más que una carta de cada rareza puede sumar en puntos base por cruce (sin contar multiplicadores). */
export const TECHO: Record<Rareza, number> = { comun: 6, rara: 14, epica: 25, legendaria: 22 };

const c = (id: string, emoji: string, nombre: string, rareza: Rareza, tipo: Carta['tipo'], efecto: string, max: string): Carta => ({ id, emoji, nombre, rareza, tipo, efecto, max });
export const CARTAS: Carta[] = [
  // ── Comunes (hasta +6 base) ──
  c('escudo', '🛡️', 'Escudo de Arena', 'comun', 'auto', 'Cada derrota suma +2 base.', '+6'),
  c('hinchada', '📣', 'La Hinchada', 'comun', 'auto', '+2 base por cada duelo ganado.', '+6'),
  c('consuelo', '🧃', 'Premio de Consuelo', 'comun', 'auto', 'Si el equipo gana 0 o 1 duelo: +5 base.', '+5'),
  c('dado', '🎲', 'Dado de la Suerte', 'comun', 'auto', 'Se tira un dado de 1 a 6 y se suma lo que salga.', '+6'),
  c('bebida', '🥤', 'Bebida Energética', 'comun', 'auto', 'Si el equipo gana al menos un duelo: +3 base.', '+3'),
  c('pelo', '🪶', 'Por un Pelo', 'comun', 'auto', '+2 base por cada duelo ganado 2-1.', '+6'),
  c('cancha', '🎯', 'Elige tu Cancha', 'comun', 'decision', 'El equipo elige el juego de 1 de sus duelos.', '—'),
  c('segunda', '🔁', 'Segunda Vuelta', 'comun', 'decision', 'Un jugador repite 1 ronda y se queda con su mejor puntaje.', '—'),
  c('moneda', '🪙', 'Moneda al Aire', 'comun', 'auto', 'Se lanza una moneda: cara +6 base, sello nada.', '+6'),
  c('madrugador', '🌅', 'Madrugador', 'comun', 'auto', '+2 base por cada duelo del equipo que termine antes del último día del cruce.', '+6'),
  c('caballeros', '🤝', 'Pacto de Caballeros', 'comun', 'auto', 'Cada empate suma +3 base (máximo +6).', '+6'),
  c('honor', '🎖️', 'Ronda de Honor', 'comun', 'auto', '+2 base por cada ronda ganada en un duelo perdido (máximo +6).', '+6'),
  c('mosqueteros', '🤺', 'Tres Mosqueteros', 'comun', 'auto', 'Si los 3 jugadores del equipo juegan su duelo: +5 base.', '+5'),
  c('calentamiento', '🏃', 'Calentamiento', 'comun', 'auto', 'Si el equipo no pierde ningún duelo 0-2: +3 base.', '+3'),
  c('boleto', '🎟️', 'Boleto de Entrada', 'comun', 'auto', '+3 base, pase lo que pase.', '+3'),
  c('amuleto', '🍀', 'Amuleto', 'comun', 'auto', 'Si el equipo pierde la serie: +3 base.', '+3'),
  c('primer_golpe', '👊', 'Primer Golpe', 'comun', 'auto', 'Si el equipo gana el primer duelo del cruce que se cierra: +3 base.', '+3'),
  c('cierre_oro', '🏁', 'Cierre de Oro', 'comun', 'auto', 'Si el equipo gana el último duelo del cruce que se cierra: +3 base.', '+3'),
  c('paciencia', '🐢', 'Paciencia', 'comun', 'auto', '+2 base por cada duelo que se va a 3 rondas.', '+6'),
  c('pancarta', '🪧', 'Pancarta', 'comun', 'auto', '+2 base por cada duelo ganado 2-0.', '+6'),
  c('libreta', '📓', 'Libreta de Récords', 'comun', 'auto', '+2 base por cada duelo perdido en que el equipo igual sumó más puntaje de juego que el rival.', '+6'),
  c('abrazo', '🫂', 'Abrazo de Grupo', 'comun', 'auto', 'Si el cruce termina con 1 victoria, 1 empate y 1 derrota: +5 base.', '+5'),
  c('sorteo_chico', '🎁', 'Sorteo Chico', 'comun', 'auto', 'Se tira un dado de 6: si sale 5 o 6, +6 base.', '+6'),
  c('ultimo_aliento', '💨', 'Último Aliento', 'comun', 'auto', 'Si el equipo pierde los 3 duelos: +6 base.', '+6'),
  // ── Raras (hasta +14 base) ──
  c('doble_nada', '⚡', 'Doble o Nada', 'rara', 'decision', 'Se marca 1 duelo antes de jugarlo: si lo gana, +14 base; si no, nada (nunca resta).', '+14'),
  c('muralla', '🧱', 'La Muralla', 'rara', 'auto', 'Cada derrota suma +4 base.', '+12'),
  c('iman', '🧲', 'Imán', 'rara', 'auto', '+4 base por cada duelo ganado.', '+12'),
  c('barrida', '🧹', 'Barrida', 'rara', 'auto', 'Si el equipo gana los 3 duelos: +14 base.', '+14'),
  c('encargo', '📜', 'Encargo', 'rara', 'auto', 'Misión al azar: ganar un duelo 2-0, terminar los 3 duelos antes del último día o ganar una ronda en cada duelo. Si la cumple, +10 base.', '+10'),
  c('cambio_rivales', '🔀', 'Cambio de Rivales', 'rara', 'decision', 'El equipo decide quién de los suyos juega contra quién.', '—'),
  c('ruleta', '🎰', 'Ruleta Rusa', 'rara', 'auto', 'Se gira otra vez: 50 % gana además una carta Épica, 50 % nada.', 'carta'),
  c('dado_grande', '🎳', 'Dado Grande', 'rara', 'auto', 'Se tiran dos dados de 6 y se suma el total (de 2 a 12).', '+12'),
  c('remontada', '📈', 'Remontada', 'rara', 'auto', 'Si el equipo está del puesto 7 hacia abajo: +4 base por cada duelo ganado.', '+12'),
  c('ola', '🌊', 'Ola de Rondas', 'rara', 'auto', '+2 base por cada ronda ganada en el cruce (máximo +12).', '+12'),
  c('fortaleza', '🏰', 'Fortaleza', 'rara', 'auto', 'Si el equipo no pierde ningún duelo: +12 base.', '+12'),
  c('caja', '📦', 'Caja Misteriosa', 'rara', 'auto', 'Al revelar se sortea un premio entre +2 y +14 base.', '+14'),
  c('seguro', '🦺', 'Seguro de Vida', 'rara', 'auto', 'Si el equipo pierde la serie: +10 base.', '+10'),
  c('tictac', '⏱️', 'Tic-Tac', 'rara', 'auto', '+4 base por cada duelo del equipo que termine antes del último día del cruce.', '+12'),
  c('golpe_mesa', '🔨', 'Golpe de Mesa', 'rara', 'auto', '+4 base por cada duelo ganado 2-0.', '+12'),
  c('espejo', '🪞', 'Espejo', 'rara', 'auto', 'Copia la carta del rival si es común o rara y da puntos sola. Si no se puede copiar, +6 base.', '+14'),
  c('comodin', '🤹', 'Comodín', 'rara', 'auto', 'Al revelar, se convierte en la carta común que más puntos le habría dado.', '+6'),
  c('bis', '🎤', 'Bis', 'rara', 'decision', 'Dos jugadores distintos repiten 1 ronda cada uno y se quedan con su mejor puntaje.', '—'),
  // ── Épicas (hasta +25 base) ──
  c('racha', '🔥', 'En Racha', 'epica', 'auto', 'Todos los puntos del equipo en el cruce valen ×1,25.', '×1,25'),
  c('contrato', '📑', 'Contrato', 'epica', 'auto', 'Si cumple 2 de estas 3 misiones: ganar un duelo 2-0, terminar los 3 duelos antes del último día o ganar una ronda en cada duelo: +16 base.', '+16'),
  c('sed', '🩸', 'Sed de Sangre', 'epica', 'auto', 'Si el equipo gana la serie (2 o 3 duelos): +15 base.', '+15'),
  c('congelar', '🧊', 'Congelar', 'epica', 'auto', 'La carta del rival no se aplica este cruce (no sirve contra legendarias).', '—'),
  c('doble_carta', '🃏', 'Doble Carta', 'epica', 'auto', 'En vez de esta, el equipo recibe 2 cartas (común o rara) y usa ambas.', '2 cartas'),
  c('revancha', '🔄', 'Revancha Total', 'epica', 'decision', 'Un duelo perdido se vuelve a jugar completo, con un desafío nuevo, y vale el segundo.', '—'),
  c('fenix', '☄️', 'Fénix', 'epica', 'auto', 'Si el equipo pierde los 3 duelos: +20 base.', '+20'),
  c('todo_nada', '💣', 'Todo o Nada', 'epica', 'decision', 'Se marcan 2 duelos antes de jugarlos: si gana los dos, +25 base; si no, nada (nunca resta).', '+25'),
  c('pacto_hierro', '⛓️', 'Pacto de Hierro', 'epica', 'auto', 'Si los 3 duelos terminan igual (3 victorias, 3 empates o 3 derrotas): +20 base.', '+20'),
  c('estrellas', '🌠', 'Lluvia de Estrellas', 'epica', 'auto', '+3 base por cada duelo ganado y +1 por cada ronda ganada (máximo +15).', '+15'),
  c('gran_angular', '🔭', 'Gran Angular', 'epica', 'auto', '+8 base por cada duelo ganado, si el rival está más arriba en la tabla.', '+24'),
  // ── Legendarias (hasta +22 base: como mucho, casi un cruce perfecto) ──
  c('corona', '👑', 'La Corona', 'legendaria', 'auto', 'Todos los puntos del equipo en el cruce valen ×1,3.', '×1,3'),
  c('hazana', '🏛️', 'Hazaña', 'legendaria', 'auto', 'Misión al azar: ganar los 3 duelos, ganar 2 duelos 2-0 o ganarle la serie a un equipo de más arriba. Si la cumple, +20 base; si no, +6.', '+20'),
  c('mano', '✋', 'Mano de Dios', 'legendaria', 'decision', 'Elige cualquier carta común, rara o épica, y además +6 base.', 'carta +6'),
  c('big_bang', '💥', 'Big Bang', 'legendaria', 'auto', 'Se tiran dos dados de 6 y se suma el total más 6 (de 8 a 18).', '+18'),
  c('leyenda', '🏆', 'Leyenda Viva', 'legendaria', 'auto', '+6 base por cada duelo ganado y +4 más si gana los 3.', '+22'),
  c('tridente', '🔱', 'Tridente', 'legendaria', 'auto', 'Cada derrota suma +4 base y cada victoria también.', '+12'),
  c('eclipse', '🌑', 'Eclipse', 'legendaria', 'auto', 'Anula la carta del rival (también las legendarias) y suma +6 base.', '+6'),
  c('supernova', '🌟', 'Supernova', 'legendaria', 'auto', '+6 base de entrada y +4 por cada duelo ganado.', '+18'),
  c('titan', '🗿', 'Titán', 'legendaria', 'auto', '+6 base de entrada y cada derrota suma +4 más.', '+18'),
  c('boveda', '🐉', 'Bóveda del Dragón', 'legendaria', 'auto', 'Se tiran tres dados de 6 y se suma el total (de 3 a 18).', '+18'),
  c('rey_isla', '🏝️', 'Rey de la Isla', 'legendaria', 'auto', '+15 base si el equipo está del puesto 9 al 12; si no, +8 base.', '+15'),
];
export const cartaPorId = (id: string) => CARTAS.find((x) => x.id === id);
/** Cartas que ya no salen en el sorteo (quedan en la base solo por el historial y no hacen nada). 2.1: fuera los robos. */
export const RETIRADAS = ['orbita', 'trampa', 'contraataque', 'agujero'];
/** Cartas cuyo azar lo tira la base al sortearlas (columna `dado`): el rango de cada una. En las misiones, cuál salió. */
export const TIRADAS: Record<string, [number, number]> = { dado: [1, 6], moneda: [1, 2], sorteo_chico: [1, 6], dado_grande: [2, 12], caja: [2, 14], big_bang: [2, 12], boveda: [3, 18], encargo: [1, 3], hazana: [1, 3] };
/** Texto de cada misión, en el orden de la tirada (1, 2, 3). Contrato usa las del Encargo. */
export const MISIONES: Record<string, string[]> = {
  encargo: ['ganar un duelo 2-0', 'terminar los 3 duelos antes del último día', 'ganar al menos una ronda en cada duelo'],
  hazana: ['ganar los 3 duelos', 'ganar 2 duelos 2-0', 'ganarle la serie a un equipo de más arriba en la tabla'],
};

/** Probabilidad de cada rareza según el puesto en la tabla (2.1: los puestos 1 y 2 nunca sacan legendaria). */
export const PROBABILIDADES = [
  { desde: 1, hasta: 2, comun: 70, rara: 22, epica: 8, legendaria: 0 },
  { desde: 3, hasta: 5, comun: 60, rara: 25, epica: 12, legendaria: 3 },
  { desde: 6, hasta: 8, comun: 40, rara: 30, epica: 15, legendaria: 15 },
  { desde: 9, hasta: 12, comun: 20, rara: 28, epica: 22, legendaria: 30 },
];
export const rarezasPara = (puesto: number) => PROBABILIDADES.find((g) => puesto >= g.desde && puesto <= g.hasta) ?? PROBABILIDADES[PROBABILIDADES.length - 1];
/** La misma regla que usa wc_sortear en la base: r entre 0 y 100, acumulando común → rara → épica → legendaria. */
export function rarezaPorAzar(puesto: number, r: number): Rareza {
  const g = rarezasPara(puesto);
  return r < g.comun ? 'comun' : r < g.comun + g.rara ? 'rara' : r < g.comun + g.rara + g.epica ? 'epica' : 'legendaria';
}

// ───────── Motor ─────────
/**
 * Un duelo de un cruce visto como equipo contra equipo (también las victorias por ausencia).
 * Opcionales (vienen de las rondas jugadas; la Mesa de control los calcula): `antes` = terminó antes del último día del
 * cruce; `orden` = en qué lugar se cerró dentro del cruce (0 = el primero); `sumaA`/`sumaB` = puntaje de juego sumado.
 */
export interface DueloEquipo { id: number; a: number; b: number; ganador: 'a' | 'b' | 'empate'; noJugo: 'a' | 'b' | 'ambos' | null; rondasA: number; rondasB: number; antes?: boolean; orden?: number; sumaA?: number; sumaB?: number }
/**
 * Una carta sorteada. `origen`: la carta que la trajo (Doble Carta, Ruleta Rusa, Mano de Dios). `dado`: la tirada de la base.
 * `duelo`: el marcado con Doble o Nada. `duelos`: los dos de Todo o Nada. `puesto`: el del equipo al sortear.
 */
export interface CartaJugada { id: number; equipo: number; carta: string; origen?: number | null; dado?: number | null; duelo?: number | null; duelos?: number[] | null; puesto?: number | null; anulada?: boolean }
export interface Ajuste { equipo: number; puntos: number; detalle: string[] }

/** Datos mínimos de un duelo, de una ausencia y de una ronda, tal como vienen de la base. */
interface DueloBase { id: number; modo: string; oficial: boolean; estado: string; cruce?: number | null; plazo?: string | null; a_perfil: string | null; b_perfil: string | null; ganador: string | null; no_jugo?: string | null; puntos_a: number; puntos_b: number }
interface AusenciaBase { id: number; cruce: number; perfil_id: string; equipo_rival: number }
interface MarcaBase { enfrentamiento_id: number; lado: string; puntaje: number; creado: string }

/** Fecha de Chile (AAAA-MM-DD) de un instante. */
const diaChile = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

/**
 * Los duelos oficiales cerrados de un cruce como equipo contra equipo. Una ausencia es una victoria del presente (id negativo).
 * Con `marcas` (las rondas jugadas) se agregan la hora de cierre y el puntaje de juego, que usan algunas cartas.
 */
export function duelosDelCruce(cruce: number, duelos: DueloBase[], equipoDe: Map<string, number>, ausencias: AusenciaBase[], marcas: MarcaBase[] = []): DueloEquipo[] {
  const lista: DueloEquipo[] = [];
  const cierre = new Map<number, string>();
  for (const m of marcas) if ((cierre.get(m.enfrentamiento_id) ?? '') < m.creado) cierre.set(m.enfrentamiento_id, m.creado);
  for (const d of duelos) {
    if (d.cruce !== cruce || !d.oficial || d.modo !== '1v1' || d.estado !== 'cerrado' || !d.ganador) continue;
    const a = equipoDe.get(d.a_perfil ?? ''), b = equipoDe.get(d.b_perfil ?? '');
    if (a == null || b == null || a === b) continue;
    const propias = marcas.filter((m) => m.enfrentamiento_id === d.id), fin = cierre.get(d.id);
    const extra: Partial<DueloEquipo> = propias.length ? {
      antes: !!fin && !!d.plazo && diaChile(fin) < d.plazo,
      sumaA: propias.filter((m) => m.lado === 'a').reduce((s, m) => s + m.puntaje, 0),
      sumaB: propias.filter((m) => m.lado === 'b').reduce((s, m) => s + m.puntaje, 0),
    } : {};
    lista.push({ id: d.id, a, b, ganador: d.ganador as DueloEquipo['ganador'], noJugo: (d.no_jugo ?? null) as DueloEquipo['noJugo'], rondasA: d.puntos_a, rondasB: d.puntos_b, ...extra });
  }
  // Orden de cierre dentro del cruce (solo los duelos con rondas jugadas)
  [...lista].filter((d) => cierre.has(d.id)).sort((x, y) => cierre.get(x.id)!.localeCompare(cierre.get(y.id)!)).forEach((d, i) => { d.orden = i; });
  for (const x of ausencias) {
    const a = equipoDe.get(x.perfil_id);
    if (x.cruce === cruce && a != null && a !== x.equipo_rival) lista.push({ id: -x.id, a, b: x.equipo_rival, ganador: 'a', noJugo: 'b', rondasA: 0, rondasB: 0 });
  }
  return lista;
}

const BASE = { v: 7, e: 6, d: 4, nj: 0 }, BONO = 5;
const redondear = (x: number) => Math.round(x * 100) / 100;
const firmar = (x: number) => (x >= 0 ? `+${redondear(x)}` : `−${redondear(-x)}`);

/** Lo que ve un equipo de sus duelos del cruce. */
interface Vista { id: number; res: 'v' | 'e' | 'd' | 'nj'; propias: number; rival: number; antes: boolean; orden?: number; suma?: number; sumaRival?: number }
interface Contexto { v: Vista[]; ganados: number; perdidos: number; empates: number; rondas: number; puesto: number | null; puestoRival: number | null; primero?: number; ultimo?: number }

/** Puntos base que suma una carta automática de puntos (sin multiplicadores). `null` = esta carta no suma así. */
function puntosDe(id: string, x: CartaJugada, k: Contexto): number | null {
  const { v, ganados, perdidos, empates, rondas } = k;
  const ganaCon = (p: number, r: number) => v.filter((y) => y.res === 'v' && y.propias === p && y.rival === r).length;
  const pierdeSerie = v.filter((y) => y.res === 'd' || y.res === 'nj').length >= 2;
  const tresDerrotas = v.length === 3 && v.every((y) => y.res === 'd' || y.res === 'nj');
  const dado = x.dado ?? 0;
  const misionEncargo = (n: number) => n === 1 ? ganaCon(2, 0) >= 1 : n === 2 ? v.length >= 3 && v.every((y) => y.antes) : n === 3 ? v.length >= 3 && v.every((y) => y.res !== 'nj' && y.propias >= 1) : false;
  const misionHazana = (n: number) => n === 1 ? ganados === 3 : n === 2 ? ganaCon(2, 0) >= 2 : n === 3 ? ganados >= 2 && k.puesto != null && k.puestoRival != null && k.puestoRival < k.puesto : false;
  switch (id) {
    case 'escudo': return 2 * perdidos;
    case 'hinchada': return 2 * ganados;
    case 'consuelo': return ganados <= 1 ? 5 : 0;
    case 'dado': return dado;
    case 'bebida': return ganados >= 1 ? 3 : 0;
    case 'pelo': return 2 * ganaCon(2, 1);
    case 'moneda': return dado === 2 ? 6 : 0;
    case 'madrugador': return 2 * v.filter((y) => y.antes).length;
    case 'caballeros': return Math.min(6, 3 * empates);
    case 'honor': return Math.min(6, 2 * v.filter((y) => y.res === 'd').reduce((s, y) => s + y.propias, 0));
    case 'mosqueteros': return v.length >= 3 && v.every((y) => y.res !== 'nj') ? 5 : 0;
    case 'calentamiento': return v.some((y) => y.res === 'd' && y.propias === 0 && y.rival >= 2) ? 0 : 3;
    case 'boleto': return 3;
    case 'amuleto': return pierdeSerie ? 3 : 0;
    case 'primer_golpe': return v.some((y) => y.res === 'v' && y.orden != null && y.orden === k.primero) ? 3 : 0;
    case 'cierre_oro': return v.some((y) => y.res === 'v' && y.orden != null && y.orden === k.ultimo) ? 3 : 0;
    case 'paciencia': return 2 * Math.min(3, v.filter((y) => y.propias + y.rival >= 3).length);
    case 'pancarta': return 2 * ganaCon(2, 0);
    case 'libreta': return 2 * Math.min(3, v.filter((y) => y.res === 'd' && (y.suma ?? 0) > (y.sumaRival ?? 0)).length);
    case 'abrazo': return ganados === 1 && empates === 1 && perdidos === 1 ? 5 : 0;
    case 'sorteo_chico': return dado >= 5 ? 6 : 0;
    case 'ultimo_aliento': return tresDerrotas ? 6 : 0;
    case 'muralla': return 4 * perdidos;
    case 'iman': return 4 * ganados;
    case 'barrida': return ganados === 3 ? 14 : 0;
    case 'dado_grande': return dado;
    case 'remontada': return (k.puesto ?? 0) >= 7 ? 4 * ganados : 0;
    case 'ola': return Math.min(12, 2 * rondas);
    case 'fortaleza': return v.length > 0 && v.every((y) => y.res === 'v' || y.res === 'e') ? 12 : 0;
    case 'caja': return dado;
    case 'seguro': return pierdeSerie ? 10 : 0;
    case 'tictac': return 4 * v.filter((y) => y.antes).length;
    case 'golpe_mesa': return 4 * ganaCon(2, 0);
    case 'sed': return ganados >= 2 ? 15 : 0;
    case 'fenix': return tresDerrotas ? 20 : 0;
    case 'pacto_hierro': return v.length === 3 && (ganados === 3 || empates === 3 || v.every((y) => y.res === 'd' || y.res === 'nj')) ? 20 : 0;
    case 'estrellas': return Math.min(15, 3 * ganados + rondas);
    case 'gran_angular': return k.puesto != null && k.puestoRival != null && k.puestoRival < k.puesto ? 8 * ganados : 0;
    case 'encargo': return misionEncargo(dado) ? 10 : 0;
    case 'contrato': return [1, 2, 3].filter(misionEncargo).length >= 2 ? 16 : 0;
    case 'hazana': return misionHazana(dado) ? 20 : 6;
    case 'mano': return 6;
    case 'big_bang': return dado + 6;
    case 'leyenda': return 6 * ganados + (ganados === 3 ? 4 : 0);
    case 'tridente': return 4 * (ganados + perdidos);
    case 'eclipse': return 6;
    case 'supernova': return 6 + 4 * ganados;
    case 'titan': return 6 + 4 * perdidos;
    case 'boveda': return dado;
    case 'rey_isla': return (k.puesto ?? 0) >= 9 ? 15 : 8;
    default: return null;
  }
}
/** Las comunes que el Comodín puede imitar: las que no dependen de una tirada ni de una decisión. */
const IMITABLES = CARTAS.filter((k) => k.rareza === 'comun' && k.tipo === 'auto' && !(k.id in TIRADAS)).map((k) => k.id);

/**
 * Puntos extra (o en contra) de cada equipo por las Wild Cards de un cruce, ya multiplicados por la jornada.
 * Orden fijo: Eclipse → Congelar → puntos de cada carta (también Espejo y Comodín) → multiplicadores de carta
 * → × jornada.
 */
export function calcularAjustes(duelos: DueloEquipo[], cartas: CartaJugada[], mult: number): Ajuste[] {
  const porId = new Map(cartas.map((x) => [x.id, x]));
  const rareza = (x: CartaJugada) => cartaPorId(x.carta)?.rareza;
  const protegida = (x: CartaJugada) => rareza(x) === 'legendaria' || (x.origen != null && porId.get(x.origen) != null && rareza(porId.get(x.origen)!) === 'legendaria');
  const pares = new Map<string, DueloEquipo[]>();
  for (const d of duelos) { const k = `${Math.min(d.a, d.b)}-${Math.max(d.a, d.b)}`; pares.set(k, [...(pares.get(k) ?? []), d]); }
  const salida: Ajuste[] = [];
  const ordenes = duelos.map((d) => d.orden).filter((o): o is number => o != null);
  const primero = ordenes.length ? Math.min(...ordenes) : undefined, ultimo = ordenes.length ? Math.max(...ordenes) : undefined;

  for (const lista of pares.values()) {
    const equipos = [lista[0].a, lista[0].b];
    const vista = (eq: number): Vista[] => lista.map((d) => {
      const lado = d.a === eq ? 'a' : 'b', propias = lado === 'a' ? d.rondasA : d.rondasB, rival = lado === 'a' ? d.rondasB : d.rondasA;
      const res = d.noJugo === lado || d.noJugo === 'ambos' ? 'nj' : d.ganador === 'empate' ? 'e' : d.ganador === lado ? 'v' : 'd';
      return { id: d.id, res, propias, rival, antes: !!d.antes, orden: d.orden, suma: lado === 'a' ? d.sumaA : d.sumaB, sumaRival: lado === 'a' ? d.sumaB : d.sumaA };
    });
    const todas = (eq: number) => cartas.filter((x) => x.equipo === eq && !x.anulada);
    const tiene0 = (eq: number, id: string) => todas(eq).some((x) => x.carta === id);
    // Eclipse: si solo un equipo lo tiene, anula todas las cartas del otro. Si los dos lo tienen, se anulan entre sí.
    const eclipsado = (eq: number, rivalEq: number) => tiene0(rivalEq, 'eclipse') && !tiene0(eq, 'eclipse');
    // Congelar se evalúa a la vez para los dos: si ambos lo tienen, se congelan mutuamente. No toca legendarias.
    const congeladoPor = (rivalEq: number, eq: number) => !eclipsado(rivalEq, eq) && tiene0(rivalEq, 'congelar');
    const activas = (eq: number, rivalEq: number) => (eclipsado(eq, rivalEq) ? [] : todas(eq).filter((x) => !congeladoPor(rivalEq, eq) || protegida(x)));
    const principal = (eq: number) => todas(eq).find((x) => x.origen == null);

    const estado = equipos.map((eq, i) => {
      const rivalEq = equipos[1 - i], v = vista(eq), mias = activas(eq, rivalEq);
      const ganados = v.filter((x) => x.res === 'v').length, perdidos = v.filter((x) => x.res === 'd').length, empates = v.filter((x) => x.res === 'e').length;
      const k: Contexto = { v, ganados, perdidos, empates, rondas: v.reduce((s, x) => s + x.propias, 0), puesto: principal(eq)?.puesto ?? null, puestoRival: principal(rivalEq)?.puesto ?? null, primero, ultimo };
      const original = v.reduce((s, x) => s + BASE[x.res], 0) + (ganados >= 2 ? BONO : 0);
      const detalle: string[] = [];
      let total = original;
      const anotar = (x: CartaJugada, n: number, nota = '') => { if (!n) return; total += n; const c = cartaPorId(x.carta)!; detalle.push(`${c.emoji} ${c.nombre}${nota}: ${firmar(n)} base`); };
      if (eclipsado(eq, rivalEq)) detalle.push('🌑 Eclipse del rival: tus cartas no se aplican');
      for (const x of mias) {
        if (x.carta === 'doble_nada') {
          const d = v.find((y) => y.id === x.duelo); anotar(x, d?.res === 'v' ? 14 : 0);
        } else if (x.carta === 'todo_nada') {
          const ds = (x.duelos ?? []).map((id) => v.find((y) => y.id === id));
          anotar(x, ds.length === 2 && ds.every((d) => d?.res === 'v') ? 25 : 0);
        } else if (x.carta === 'espejo') {
          const suya = principal(rivalEq), kc = suya ? cartaPorId(suya.carta) : undefined;
          const copia = suya && kc && (kc.rareza === 'comun' || kc.rareza === 'rara') && kc.id !== 'espejo' && kc.id !== 'comodin' ? puntosDe(kc.id, { ...suya, equipo: eq }, k) : null;
          anotar(x, copia ?? 6, copia != null ? ` (copió ${kc!.nombre})` : '');
        } else if (x.carta === 'comodin') {
          const mejor = IMITABLES.map((id) => [id, puntosDe(id, x, k) ?? 0] as const).sort((p, q) => q[1] - p[1])[0];
          anotar(x, mejor[1], ` (como ${cartaPorId(mejor[0])!.nombre})`);
        } else {
          const n = puntosDe(x.carta, x, k), mision = MISIONES[x.carta]?.[(x.dado ?? 0) - 1];
          const nota = mision ? ` (${mision}: misión ${n === (x.carta === 'hazana' ? 20 : 10) ? 'cumplida' : 'no cumplida'})` : x.dado != null && x.carta in TIRADAS ? ` (salió ${x.dado})` : '';
          if (n != null) anotar(x, n, nota);
        }
      }
      // Multiplicadores de carta
      for (const [id, f] of [['racha', 1.25], ['corona', 1.3]] as const) for (const x of mias.filter((y) => y.carta === id)) {
        const n = total * (f - 1); total += n; const c = cartaPorId(x.carta)!; detalle.push(`${c.emoji} ${c.nombre} (×${String(f).replace('.', ',')}): ${firmar(n)} base`);
      }
      return { eq, original, total, detalle };
    });
    // 2.1: ya no hay robos (Trampa, Contraataque y Agujero Negro quedaron retirados): ninguna carta resta puntos.
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
