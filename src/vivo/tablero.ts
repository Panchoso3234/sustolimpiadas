import type { Mesa } from '../juegos/tablero/mesa';

// Motor de "tablero en vivo": cada juego son reglas puras más una forma de dibujarse en la mesa.
// El anfitrión aplica las acciones (con su reloj) y reparte el estado; los demás solo dibujan.
// Así cualquier juego de mesa se juega en vivo sin repetir la parte de red.

export type Lado = 'a' | 'b';
export interface Marcador { a: number; b: number; fin: boolean }
export interface Reglas<E> {
  id: string; nombre: string; idea: string;
  inicial(semilla: string, nivel: number): E;
  /** La acción de un lado en el segundo `t` de la partida; null si no corresponde (no es su turno, llegó tarde…). */
  accion(e: E, a: Record<string, unknown>, lado: Lado, t: number): E | null;
  /** Avance por tiempo, que corre solo el anfitrión diez veces por segundo; null si no cambia nada. */
  tic?(e: E, t: number): E | null;
  marcador(e: E, t: number): Marcador;
  /** Si un estado recibido tiene la forma de este juego (protege de mensajes rotos). */
  valido(e: unknown): e is E;
  /** Arma lo fijo una vez y devuelve cómo pintar cada estado. `yo` es null para quien mira. */
  dibujar(m: Mesa, enviar: (a: Record<string, unknown>) => void, yo: Lado | null): (e: E, t: number, nombres: { a: string; b: string }) => void;
}
export const COLOR_LADO: Record<Lado, string> = { a: '#3f8cff', b: '#ef5565' };
export const otro = (l: Lado): Lado => (l === 'a' ? 'b' : 'a');
export const ladoDe = (asientos: [string, string], id: string): Lado | null => (asientos[0] === id ? 'a' : asientos[1] === id ? 'b' : null);
export const entero = (x: unknown, desde: number, hasta: number) => Number.isInteger(x) && (x as number) >= desde && (x as number) < hasta;
export const esLado = (x: unknown): x is Lado => x === 'a' || x === 'b';
