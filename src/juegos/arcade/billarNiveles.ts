// Los desafíos de Billar, sin dependencias (para poder revisarlos con `node`). La mesa mide ANCHO × FONDO, centrada en 0.

export const ANCHO = 11, FONDO = 5.6, RADIO = 0.2, BOCA = 0.36;
export const TRONERAS: [number, number][] = [[-ANCHO / 2, -FONDO / 2], [0, -FONDO / 2 - 0.08], [ANCHO / 2, -FONDO / 2], [-ANCHO / 2, FONDO / 2], [0, FONDO / 2 + 0.08], [ANCHO / 2, FONDO / 2]];
/** Dónde va la bola blanca al empezar (y al volver después de caer en una tronera). */
export const SALIDA: [number, number] = [-ANCHO / 4, 0];

export type Regla = 'todas' | 'orden' | 'negra';
export interface Bola { x: number; z: number; n: number; dorada?: boolean; negra?: boolean }
export interface Desafio { nombre: string; regla: Regla; tiros: number; bolas: Bola[]; postes?: [number, number, number][] }

/** Un triángulo de bolas con la punta en `x0` mirando a la blanca. */
const triangulo = (x0: number, filas: number, desde = 1): Bola[] => {
  const bolas: Bola[] = [], d = RADIO * 2.02;
  for (let f = 0; f < filas; f++) for (let i = 0; i <= f; i++) bolas.push({ x: x0 + f * d * 0.866, z: (i - f / 2) * d, n: desde + bolas.length });
  return bolas;
};

export const DESAFIOS: Desafio[] = [
  { nombre: 'Calentando', regla: 'todas', tiros: 5, bolas: [{ x: 2, z: 0, n: 1 }, { x: 3.4, z: -1.6, n: 2 }, { x: 3.6, z: 1.7, n: 3 }] },
  { nombre: 'En orden', regla: 'orden', tiros: 7, bolas: [{ x: 1, z: -1.2, n: 1 }, { x: 3.8, z: 1.5, n: 2 }, { x: -1.5, z: 1.8, n: 3 }, { x: 4.3, z: -1.9, n: 4 }] },
  { nombre: 'Postes', regla: 'todas', tiros: 6, bolas: [{ x: 3, z: 0, n: 1 }, { x: 4.2, z: -1.8, n: 2 }, { x: 4.2, z: 1.8, n: 3 }, { x: 0.8, z: 2, n: 4 }], postes: [[1.2, 0, 0.32], [2.6, -1.4, 0.26], [2.6, 1.4, 0.26]] },
  { nombre: 'La negra al final', regla: 'negra', tiros: 8, bolas: [...triangulo(2.4, 3).map((b, i) => (i === 4 ? { ...b, n: 8, negra: true } : b))] },
  { nombre: 'El triángulo', regla: 'todas', tiros: 10, bolas: triangulo(2.2, 4) },
  { nombre: 'Bolas de oro', regla: 'todas', tiros: 6, bolas: [{ x: 1.5, z: -1.5, n: 1 }, { x: 1.5, z: 1.5, n: 2 }, { x: 3.2, z: 0, n: 3, dorada: true }, { x: 4.4, z: -2, n: 4 }, { x: 4.4, z: 2, n: 5 }, { x: -2, z: -2.1, n: 6, dorada: true }] },
];

/** Revisa que cada desafío se pueda jugar: bolas dentro de la mesa, sin encimarse ni tapar troneras ni la salida. */
export function revisar(d: Desafio): string[] {
  const malos: string[] = [], todas = [...d.bolas.map((b) => [b.x, b.z, RADIO] as const), [SALIDA[0], SALIDA[1], RADIO] as const, ...(d.postes ?? []).map(([x, z, r]) => [x, z, r] as const)];
  for (const [x, z, r] of todas) {
    if (Math.abs(x) > ANCHO / 2 - r || Math.abs(z) > FONDO / 2 - r) malos.push(`fuera de la mesa ${x},${z}`);
    for (const [tx, tz] of TRONERAS) if (Math.hypot(x - tx, z - tz) < BOCA + r + 0.2) malos.push(`tapa una tronera ${x},${z}`);
  }
  todas.forEach(([x, z, r], i) => todas.forEach(([x2, z2, r2], k) => { if (k > i && Math.hypot(x - x2, z - z2) < r + r2 - 0.001) malos.push(`encimadas ${x.toFixed(2)},${z.toFixed(2)}`); }));
  if (d.regla === 'negra' && d.bolas.filter((b) => b.negra).length !== 1) malos.push('una negra');
  if (new Set(d.bolas.map((b) => b.n)).size !== d.bolas.length) malos.push('números repetidos');
  return malos;
}
