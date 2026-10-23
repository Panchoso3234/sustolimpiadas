// Las recetas y la cocina de Cocina Caótica, sin dependencias (para poder revisarlas con `node`).
// Plano: # mesón libre · L lechuga · T tomate · M carne · P pan · Q queso (cajones) · K tabla de picar · F plancha
// · O olla · D platos · E entrega · X basura · . piso.

export type Ingrediente = 'lechuga' | 'tomate' | 'carne' | 'pan' | 'queso' | 'sopa';
export type Estado = 'crudo' | 'picado' | 'cocido' | 'quemado';
/** `n`: cuántos tomates lleva la olla (solo la sopa). */
export interface Cosa { ing: Ingrediente; estado: Estado; avance: number; n?: number }

export const COCINA = [
  '##LTMPQ#O#KK#',
  '#...........#',
  'D...........F',
  '#....###....F',
  '#....X#K....#',
  '#....###....#',
  '#...........E',
  '#...........#',
  '#####DD######',
];
export const CAJONES: Record<string, Ingrediente> = { L: 'lechuga', T: 'tomate', M: 'carne', P: 'pan', Q: 'queso' };
export const EMOJI: Record<Ingrediente, string> = { lechuga: '🥬', tomate: '🍅', carne: '🥩', pan: '🍞', queso: '🧀', sopa: '🍲' };

/** Cómo tiene que ir cada ingrediente en el plato. */
export const LISTO: Record<Ingrediente, Estado> = { lechuga: 'picado', tomate: 'picado', carne: 'cocido', pan: 'crudo', queso: 'picado', sopa: 'cocido' };
export const SE_PICA: Ingrediente[] = ['lechuga', 'tomate', 'carne', 'queso'];
/** Tomates picados que necesita la olla para empezar a hervir. */
export const TOMATES_SOPA = 2;
/** Lo que hay que hacerle a cada ingrediente antes del plato (para las tarjetas de pedido). */
export const PASOS: Record<Ingrediente, string> = { lechuga: '🔪', tomate: '🔪', carne: '🔪🔥', pan: '', queso: '🔪', sopa: '🍅🍅' };

export interface Receta { nombre: string; emoji: string; ings: Ingrediente[]; valor: number; desde: number }
export const RECETAS: Receta[] = [
  { nombre: 'Ensalada', emoji: '🥗', ings: ['lechuga', 'tomate'], valor: 60, desde: 0 },
  { nombre: 'Hamburguesa', emoji: '🍔', ings: ['pan', 'carne'], valor: 80, desde: 45 },
  { nombre: 'Sopa de tomate', emoji: '🍲', ings: ['sopa', 'pan'], valor: 90, desde: 70 },
  { nombre: 'Sándwich', emoji: '🥪', ings: ['pan', 'queso', 'tomate'], valor: 90, desde: 95 },
  { nombre: 'Hamburguesa con queso', emoji: '🍔', ings: ['pan', 'carne', 'queso'], valor: 110, desde: 135 },
];

/** La hora punta (segundos desde el inicio): llegan pedidos más seguido y pagan más. Igual para los dos en un duelo. */
export const HORA_PUNTA: [number, number] = [125, 160];
export const enPunta = (t: number) => t >= HORA_PUNTA[0] && t < HORA_PUNTA[1];

/** Si un plato (sus ingredientes listos) es exactamente una receta. */
export const calza = (plato: Cosa[], r: Receta) =>
  plato.length === r.ings.length && plato.every((c) => c.estado === LISTO[c.ing]) && [...r.ings].sort().join() === plato.map((c) => c.ing).sort().join();

/** Lo que paga una entrega: el plato, la propina por rapidez (`queda`: fracción del tiempo que sobraba), el combo
 *  (entregas seguidas sin perder clientes: +10 % cada una, hasta +50 %) y la hora punta (x1,5). */
export function pago(valor: number, queda: number, combo: number, punta: boolean) {
  const propina = Math.round(valor * Math.max(0, Math.min(1, queda)) * 0.5);
  const extra = Math.round((valor + propina) * 0.1 * Math.min(5, Math.max(0, combo - 1)));
  const total = Math.round((valor + propina + extra) * (punta ? 1.5 : 1));
  return { propina, extra, total };
}

/** Revisa que la cocina se pueda jugar: medidas, cajones de todo, y cada estación con piso al lado. */
export function revisar(): string[] {
  const malos: string[] = [], at = (x: number, z: number) => COCINA[z]?.[x] ?? '#';
  if (COCINA.some((f) => f.length !== COCINA[0].length)) malos.push('medidas');
  for (const ing of Object.values(CAJONES)) if (!COCINA.join('').includes(Object.keys(CAJONES).find((k) => CAJONES[k] === ing)!)) malos.push(`falta ${ing}`);
  for (const c of 'KFDEXO') if (!COCINA.join('').includes(c)) malos.push(`falta ${c}`);
  COCINA.forEach((f, z) => [...f].forEach((c, x) => {
    if (c === '.' || c === '#') return;
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => at(x + dx, z + dz) === '.')) malos.push(`${c} sin piso al lado en ${x},${z}`);
  }));
  for (const r of RECETAS) {
    if (!calza(r.ings.map((ing) => ({ ing, estado: LISTO[ing], avance: 0 })), r)) malos.push(`receta ${r.nombre}`);
    if (r.ings.some((i) => i !== 'sopa' && !Object.values(CAJONES).includes(i))) malos.push(`sin cajón para ${r.nombre}`);
  }
  if (RECETAS.some((r, i) => i && r.desde < RECETAS[i - 1].desde)) malos.push('recetas fuera de orden');
  const a = pago(80, 1, 1, false), b = pago(80, 0, 1, false), c = pago(80, 1, 9, true);
  if (!(a.total === 120 && b.total === 80 && c.total > a.total && c.extra === 60)) malos.push(`pago ${a.total} ${b.total} ${c.total}`);
  return malos;
}
