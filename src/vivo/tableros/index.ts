import type { Reglas } from '../tablero';
import { parejas } from './parejas';

// Los juegos de mesa que se juegan en vivo. La clave es el id del juego (el mismo de su foto y de su versus).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TABLEROS: Record<string, Reglas<any>> = { parejas };

/** Pruebas de las reglas de los tableros: devuelve la lista de fallas. */
export function probarTableros(): string[] {
  const fallas: string[] = [], igual = (que: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) fallas.push(`${que}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  // Parejas
  let p = parejas.inicial('prueba', 1);
  const par = (f: string) => p.cartas.map((x, i) => (x === f ? i : -1)).filter((i) => i >= 0);
  const [x, y] = par(p.cartas.find((f) => f !== 'medusa')!);
  igual('parejas: no es tu turno', parejas.accion(p, { i: x }, 'b', 1), null);
  p = parejas.accion(p, { i: x }, 'a', 1)!; p = parejas.accion(p, { i: y }, 'a', 1.5)!;
  igual('parejas: acierto suma y sigue el turno', [p.puntos.a, p.turno], [1, 'a']);
  const otraFigura = p.cartas.find((f, i) => f !== 'medusa' && !p.duenas[i] && f !== p.cartas[x])!, [u] = par(otraFigura), v = p.cartas.findIndex((f, i) => f !== 'medusa' && f !== otraFigura && !p.duenas[i]);
  p = parejas.accion(p, { i: u }, 'a', 2)!; p = parejas.accion(p, { i: v }, 'a', 2.2)!;
  igual('parejas: fallo espera antes de pasar', p.turno, 'a');
  igual('parejas: tocar mientras se tapan no vale', parejas.accion(p, { i: x }, 'a', 2.5), null);
  p = parejas.tic!(p, 3.5)!;
  igual('parejas: tras el fallo pasa el turno', [p.turno, p.abiertas.length], ['b', 0]);
  const m = p.cartas.indexOf('medusa');
  p = parejas.accion(p, { i: m }, 'b', 4)!;
  igual('parejas: la medusa resta y pasa el turno', [p.puntos.b, p.turno], [-1, 'a']);
  igual('parejas: estado roto no vale', parejas.valido({ cartas: 'x' }), false);
  return fallas;
}
