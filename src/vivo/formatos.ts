// Los 1v1 en vivo que reusan el juego individual tal cual, en uno de dos formatos (decisión de Pancho, 2026-10-15):
//  · dividida: los dos juegan a la vez su propia partida, con el mismo desafío; cada uno ve la pantalla del otro al lado.
//  · turnos: "Es el turno de Pancho" (Vale y los espectadores miran) y después al revés. Gana el mejor puntaje.
// Nunca un tablero común donde las cosas son de quien las toca primero.
//  · mundo: los dos en la misma arena, con bots que atacan a ambos (el anfitrión simula; ver mundo/red.ts).
export type Formato = 'dividida' | 'turnos' | 'mundo';

export const DUELOS: Record<string, Formato> = {
  numeros: 'dividida',
  tinta: 'dividida',
  cangrejos: 'dividida',
  cocos: 'dividida',
  torre: 'dividida',
  cartero: 'dividida',
  tren: 'dividida',
  bombas: 'dividida',
  serpientes: 'dividida',
  karts: 'dividida',
  defensa: 'dividida',
  totem: 'turnos',
  bolos: 'turnos',
  minigolf: 'turnos',
  agujero: 'turnos',
  sumo: 'mundo',
  tanques: 'mundo',
};
