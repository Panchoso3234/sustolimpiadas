import type { Reglas } from '../tablero';
import { parejas } from './parejas';
import { numeros } from './numeros';

// Los juegos de mesa que se juegan en vivo. La clave es el id del juego (el mismo de su foto y de su versus).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TABLEROS: Record<string, Reglas<any>> = { parejas, numeros };

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
  // Cazanúmeros
  let n = numeros.inicial('prueba', 1);
  n = numeros.accion(n, { n: 1 }, 'a', 1)!;
  igual('números: el que sigue es tuyo', [n.duenos[0], n.sigue], ['a', 2]);
  igual('números: tocar uno ya tomado no castiga', numeros.accion(n, { n: 1 }, 'b', 1.1), null);
  n = numeros.accion(n, { n: 5 }, 'b', 1.2)!;
  igual('números: tocar uno adelantado resta', n.errores.b, 1);
  igual('números: antes de partir no vale', numeros.accion(numeros.inicial('x', 1), { n: 1 }, 'a', -1), null);
  igual('números: marcador', numeros.marcador(n, 2), { a: 10, b: -3, fin: false });
  return fallas;
}
