import { aspectoBase, type Aspecto, type Personaje } from './catalogo';

// Personajes listos para elegir: homenaje de fans a los personajes de Amphoreus (Honkai: Star Rail, de HoYoverse),
// armados con las mismas piezas de Kenney del creador. No usan modelos ni imágenes oficiales: se reconocen por
// el peinado, la paleta y los accesorios. Quien elige uno no lo puede editar; lo usa tal cual.

export const FRANQUICIA = 'Amphoreus · Honkai: Star Rail';

// Qué parte del color de cada cabeza es el pelo (índice de cabeza en BASES). Las cabezas 0, 4, 6 y 11 tienen el pelo
// del mismo color que los ojos, así que solo sirven para pelo oscuro; la 7 es calva y la 8 trae gorra.
const PELO: Record<number, string[]> = { 1: ['c11b3'], 2: ['c3b3'], 3: ['c11b3'], 5: ['c13b3', 'c11b3'], 9: ['c11b3'], 10: ['c13b3'] };
// Colores de ropa de cada cuerpo, del más claro al más oscuro (la piel de manos y brazos no se toca).
const ROPA: Record<number, string[]> = {
  0: ['c9b3', 'c15b2', 'c7b3', 'c11b2'], 1: ['c5b2', 'c9b3', 'c15b2', 'c1b3'], 2: ['c9b3', 'c11b2', 'c9b2', 'c3b3'], 3: ['c9b3', 'c3b3', 'c1b3'],
  4: ['c9b3', 'c7b3', 'c11b2', 'c1b3'], 5: ['c9b3', 'c7b3', 'c5b2', 'c11b2', 'c15b2', 'c3b3', 'c1b3'], 6: ['c9b3', 'c5b2', 'c3b2', 'c11b2'],
  7: ['c9b2', 'c11b2'], 8: ['c5b2', 'c11b2', 'c3b3', 'c1b3'], 9: ['c9b3', 'c9b2', 'c1b3'], 10: ['c9b3', 'c5b2', 'c3b3', 'c1b3'], 11: ['c3b2', 'c3b3', 'c1b3'],
};
const PIEL_CLARA = '#efba94';

interface Receta {
  cabeza: number; cuerpo: number;
  pelo?: string;
  /** Colores de la ropa, de claro a oscuro: se reparten parejo entre las partes de ropa del cuerpo. */
  ropa: string[];
  /** Otros colores de la cabeza (cintillo, adorno, o tapar lentes con color piel). */
  extraCabeza?: Record<string, string>;
  sombrero?: number; colorSombrero?: string; lentes?: number; objeto?: number; espalda?: number; colorAccesorio?: string;
  altura?: number; contextura?: number;
}

function armar(r: Receta): Aspecto {
  const colores: Record<string, string> = {};
  for (const g of PELO[r.cabeza] ?? []) if (r.pelo) colores[`cabeza|${g}`] = r.pelo;
  for (const [g, c] of Object.entries(r.extraCabeza ?? {})) colores[`cabeza|${g}`] = c;
  const grupos = ROPA[r.cuerpo] ?? [];
  grupos.forEach((g, i) => { colores[`cuerpo|${g}`] = r.ropa[Math.round((i * (r.ropa.length - 1)) / Math.max(1, grupos.length - 1))]; });
  const base = aspectoBase();
  return {
    ...base, cabeza: r.cabeza, cuerpo: r.cuerpo, colores,
    sombrero: r.sombrero ?? 0, colorSombrero: r.colorSombrero ?? base.colorSombrero, lentes: r.lentes ?? 0,
    objeto: r.objeto ?? 0, espalda: r.espalda ?? 0, colorAccesorio: r.colorAccesorio ?? base.colorAccesorio,
    altura: r.altura ?? 0.5, contextura: r.contextura ?? 0.5,
  };
}

export interface Preseleccionado { id: string; nombre: string; titulo: string; personaje: Personaje }

const p = (id: string, nombre: string, titulo: string, personalidad: string, frase: string, voz: number, receta: Receta): Preseleccionado =>
  ({ id, nombre, titulo, personaje: { nombre, personalidad, frase, voz, apariencia: { ...armar(receta), preset: id } } });

// Índices: sombreros 1 Gorra, 3 Corona, 7 Aureola, 8 Orejas de gato · lentes 1 Lentes · objetos 2 Espada, 3 Varita, 5 Bandera
// · espalda 2 Alas de ángel, 5 Capa (ver catalogo.ts)
export const PRESELECCIONADOS: Preseleccionado[] = [
  p('phainon', 'Phainon', 'El que carga el fuego', 'Competitivo', 'Mientras quede luz, sigo adelante.', 0.45,
    { cabeza: 9, cuerpo: 9, pelo: '#f2f2f6', ropa: ['#f5f3ea', '#3f6fd1', '#1f2a4a'], objeto: 2, colorAccesorio: '#e8c56a', altura: 0.7 }),
  p('aglaea', 'Aglaea', 'La tejedora dorada', 'Tranquilo', 'Cada hilo cuenta una historia.', 0.6,
    { cabeza: 5, cuerpo: 4, pelo: '#e8c56a', ropa: ['#fff6dc', '#e8c56a', '#b8813f', '#6b4a2b'], extraCabeza: { c15b2: '#e8c56a' }, sombrero: 3, colorSombrero: '#e8c56a', altura: 0.75 }),
  p('tribbie', 'Tribbie', 'La pequeña de las puertas', 'Payaso', '¡Tres veces más alegría!', 0.95,
    { cabeza: 1, cuerpo: 1, pelo: '#fbe3ee', ropa: ['#ffffff', '#f5b8c8', '#ff7ab8', '#6b4a6b'], sombrero: 7, colorSombrero: '#ffd84a', altura: 0.05, contextura: 0.35 }),
  p('mydei', 'Mydei', 'El príncipe guerrero', 'Competitivo', 'La fuerza se gana peleando.', 0.25,
    { cabeza: 10, cuerpo: 7, pelo: '#7a1f2b', ropa: ['#c0392b', '#5a1a1a'], extraCabeza: { c7b3: PIEL_CLARA, c9b3: PIEL_CLARA }, objeto: 2, espalda: 5, colorAccesorio: '#c0392b', altura: 0.95, contextura: 1 }),
  p('castorice', 'Castorice', 'La doncella de las mariposas', 'Tímido', 'Mejor no me toques…', 0.55,
    { cabeza: 5, cuerpo: 4, pelo: '#e9e4f5', ropa: ['#3a2a55', '#2b2140', '#7b5cff', '#141018'], extraCabeza: { c15b2: '#7b5cff' }, espalda: 5, colorAccesorio: '#2b2140', altura: 0.7, contextura: 0.35 }),
  p('anaxa', 'Anaxa', 'El erudito', 'Soñador', 'Todo se puede explicar.', 0.4,
    { cabeza: 10, cuerpo: 10, pelo: '#4fc9a8', ropa: ['#f3f6f8', '#2fb8a8', '#2b4a5a', '#1c2630'], extraCabeza: { c7b3: '#2fb8a8' }, altura: 0.65 }),
  p('hyacine', 'Hyacine', 'La sanadora del cielo', 'Tranquilo', '¿Te duele algo? Déjame ver.', 0.75,
    { cabeza: 3, cuerpo: 2, pelo: '#ff9ec4', ropa: ['#ffffff', '#9fd6ff', '#ff9ec4', '#6b7a99'], objeto: 3, colorAccesorio: '#9fd6ff', altura: 0.45 }),
  p('cipher', 'Cipher', 'La ladrona escurridiza', 'Payaso', 'Lo que es tuyo… ahora es mío.', 0.8,
    { cabeza: 2, cuerpo: 0, pelo: '#f3d27a', extraCabeza: { c9b2: '#7b5cff' }, ropa: ['#d9c8ff', '#7b5cff', '#3a2a55', '#1c1826'], sombrero: 8, colorSombrero: '#f3d27a', altura: 0.4, contextura: 0.35 }),
  p('cerydra', 'Cerydra', 'La comandante', 'Competitivo', 'Cada pieza en su lugar.', 0.45,
    { cabeza: 3, cuerpo: 5, pelo: '#e8c56a', ropa: ['#f3ecdc', '#c9a24a', '#c0392b', '#8a1f2b', '#2b2140', '#1c1826', '#14101a'], sombrero: 1, colorSombrero: '#1c1826', objeto: 5, colorAccesorio: '#c0392b', altura: 0.7 }),
  p('hysilens', 'Hysilens', 'La voz del mar', 'Soñador', 'Escucha el canto de las olas.', 0.65,
    { cabeza: 5, cuerpo: 2, pelo: '#7fc8e8', extraCabeza: { c15b2: '#3fa9d6' }, ropa: ['#e6f6ff', '#3fa9d6', '#1f6fa8', '#123a5a'], altura: 0.6 }),
  p('cyrene', 'Cyrene', 'La de los recuerdos', 'Soñador', 'Te estaba esperando.', 0.85,
    { cabeza: 2, cuerpo: 4, pelo: '#ffb3d1', extraCabeza: { c9b2: '#ffffff' }, ropa: ['#ffffff', '#ffd6e6', '#ff9ec4', '#9a6a8a'], espalda: 2, colorAccesorio: '#ffffff', altura: 0.55 }),
  p('dan-heng-terrae', 'Dan Heng', 'Permansor Terrae', 'Tranquilo', 'La tierra recuerda.', 0.35,
    { cabeza: 11, cuerpo: 11, ropa: ['#5ac487', '#2f6b4a', '#1c2a22'], objeto: 2, colorAccesorio: '#e8c56a', altura: 0.7 }),
];

export const preseleccionado = (id: string | undefined) => PRESELECCIONADOS.find((x) => x.id === id);
