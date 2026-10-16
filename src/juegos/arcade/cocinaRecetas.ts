// Las recetas y la cocina de Cocina Caótica, sin dependencias (para poder revisarlas con `node`).
// Plano: # mesón libre · L lechuga · T tomate · M carne · P pan · Q queso (cajones) · K tabla de picar · F plancha
// · D platos · E entrega · X basura · . piso.

export type Ingrediente = 'lechuga' | 'tomate' | 'carne' | 'pan' | 'queso';
export type Estado = 'crudo' | 'picado' | 'cocido' | 'quemado';
export interface Cosa { ing: Ingrediente; estado: Estado; avance: number }

export const COCINA = [
  '##LTMPQ###KK#',
  '#...........#',
  'D...........F',
  '#....###....F',
  '#....X##....#',
  '#....###....#',
  '#...........E',
  '#...........#',
  '#####DD######',
];
export const CAJONES: Record<string, Ingrediente> = { L: 'lechuga', T: 'tomate', M: 'carne', P: 'pan', Q: 'queso' };
export const EMOJI: Record<Ingrediente, string> = { lechuga: '🥬', tomate: '🍅', carne: '🥩', pan: '🍞', queso: '🧀' };

/** Cómo tiene que ir cada ingrediente en el plato. */
export const LISTO: Record<Ingrediente, Estado> = { lechuga: 'picado', tomate: 'picado', carne: 'cocido', pan: 'crudo', queso: 'picado' };
export const SE_PICA: Ingrediente[] = ['lechuga', 'tomate', 'carne', 'queso'];

export interface Receta { nombre: string; emoji: string; ings: Ingrediente[]; valor: number; desde: number }
export const RECETAS: Receta[] = [
  { nombre: 'Ensalada', emoji: '🥗', ings: ['lechuga', 'tomate'], valor: 60, desde: 0 },
  { nombre: 'Hamburguesa', emoji: '🍔', ings: ['pan', 'carne'], valor: 80, desde: 45 },
  { nombre: 'Sándwich', emoji: '🥪', ings: ['pan', 'queso', 'tomate'], valor: 90, desde: 90 },
  { nombre: 'Hamburguesa con queso', emoji: '🧀', ings: ['pan', 'carne', 'queso'], valor: 110, desde: 130 },
];

/** Si un plato (sus ingredientes listos) es exactamente una receta. */
export const calza = (plato: Cosa[], r: Receta) =>
  plato.length === r.ings.length && plato.every((c) => c.estado === LISTO[c.ing]) && [...r.ings].sort().join() === plato.map((c) => c.ing).sort().join();

/** Revisa que la cocina se pueda jugar: medidas, cajones de todo, y cada estación con piso al lado. */
export function revisar(): string[] {
  const malos: string[] = [], at = (x: number, z: number) => COCINA[z]?.[x] ?? '#';
  if (COCINA.some((f) => f.length !== COCINA[0].length)) malos.push('medidas');
  for (const ing of Object.values(CAJONES)) if (!COCINA.join('').includes(Object.keys(CAJONES).find((k) => CAJONES[k] === ing)!)) malos.push(`falta ${ing}`);
  for (const c of 'KFDEX') if (!COCINA.join('').includes(c)) malos.push(`falta ${c}`);
  COCINA.forEach((f, z) => [...f].forEach((c, x) => {
    if (c === '.' || c === '#') return;
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => at(x + dx, z + dz) === '.')) malos.push(`${c} sin piso al lado en ${x},${z}`);
  }));
  for (const r of RECETAS) if (!calza(r.ings.map((ing) => ({ ing, estado: LISTO[ing], avance: 0 })), r)) malos.push(`receta ${r.nombre}`);
  return malos;
}
