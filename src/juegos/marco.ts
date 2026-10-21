import type { Aspecto } from '../personaje/catalogo';
import type { Fantasma } from './fantasma';

// El contrato entre el portal y cualquier juego, sea del motor que sea.
// El portal se encarga de la pantalla previa, la cuenta regresiva, el resultado y el guardado;
// el juego solo arma su escena, espera a `empezar` y avisa cuando terminó.

export interface Resultado {
  puntaje: number;
  /** Desglose que se muestra en la pantalla de resultado: [qué, cuánto]. */
  lineas: [string, string][];
  /** Resumen de la partida que se guarda junto a la marca, para revisar puntajes dudosos. */
  detalle: Record<string, unknown>;
  /** En vivo: el puntaje de los dos lados y quién ganó. */
  vivo?: { a: number; b: number; ganador: 'a' | 'b' | 'empate' };
}

/** Lo que reciben los juegos "mismo mundo" en vivo (Sumo y Tanques): el anfitrión simula y los demás dibujan. */
export interface ContextoVivo {
  rol: 'a' | 'b' | 'espectador';
  nombres: { a: string; b: string };
  /** El personaje de cada jugador. */
  aspectos: { a: Aspecto; b: Aspecto };
  /** Si esta pestaña lleva la simulación (cambia si el anfitrión se va). */
  simulo(): boolean;
  /** Si hay conexión directa: sin ella se manda menos seguido. */
  directo(): boolean;
  /** Con `alAnfitrion`, solo le llega a quien simula (el mando, por ejemplo). */
  enviar(tipo: string, datos: Record<string, unknown>, alAnfitrion?: boolean): void;
  /** `lado`: qué jugador lo mandó (null si no es un jugador sentado). */
  alRecibir(f: (tipo: string, datos: Record<string, unknown>, lado: 'a' | 'b' | null, deAnfitrion: boolean) => void): void;
}

export interface Contexto {
  caja: HTMLElement;
  /** Igual para todos durante el día: mismo desafío para todos. */
  semilla: string;
  aspecto: Aspecto;
  /** Dificultad de 1 a 4: sube con cada jornada del torneo. En un enfrentamiento es la de su jornada, igual para ambos lados. */
  nivel: number;
  alTerminar(r: Resultado): void;
  /** Solo cuando la partida se juega en vivo. */
  vivo?: ContextoVivo;
  /** Jugando contra el líder del día: su recorrido grabado (la semilla ya es la suya). */
  fantasma?: Fantasma;
}

/** Lo que la sala le avisa a los motores para la partida que parte (shortcut: un valor compartido; basta porque hay una sola partida a la vez). */
export const ajustesPartida = { pausable: true, /** En vivo: resolución más baja, para que ande liviano. */ vivo: false, /** El lienzo guarda su imagen para mandarle fotos al rival (espejo). */ foto: false };

/** Jornada del torneo (1 a 4) de una fecha "AAAA-MM-DD" (las mismas fechas que JORNADAS en liga.ts); antes del 21 de octubre cuenta como la 1. */
export const jornadaDe = (fecha: string) => (fecha <= '2026-10-31' ? 1 : fecha <= '2026-11-10' ? 2 : fecha <= '2026-11-21' ? 3 : 4);

export interface Partida {
  empezar(): void;
  destruir(): void;
}

export type CrearJuego = (c: Contexto) => Promise<Partida>;

/** Cada juego se descarga recién cuando alguien lo abre. */
export const CARGADORES: Record<string, () => Promise<CrearJuego>> = {
  rodillos: () => import('./carreras/pistas').then((m) => m.rodillos),
  puertas: () => import('./carreras/pistas').then((m) => m.puertas),
  karts: () => import('./arcade/karts').then((m) => m.crear),
  tren: () => import('./arcade/tren').then((m) => m.crear),
  tanques: () => import('./arcade/tanques').then((m) => m.crear),
  bombas: () => import('./arcade/bombas').then((m) => m.crear),
  defensa: () => import('./arcade/defensa').then((m) => m.crear),
  museo: () => import('./arcade/museo').then((m) => m.crear),
  tiro: () => import('./arcade/tiro').then((m) => m.crear),
  cocina: () => import('./arcade/cocina').then((m) => m.crear),
  billar: () => import('./arcade/billar').then((m) => m.crear),
  triples: () => import('./arcade/triples').then((m) => m.crear),
  agujero: () => import('./arcade/agujero').then((m) => m.crear),
  serpientes: () => import('./arcade/serpientes').then((m) => m.crear),
  laberinto: () => import('./arcade/laberinto').then((m) => m.crear),
  escobas: () => import('./arcade/escobas').then((m) => m.crear),
  huevo: () => import('./arena/juegos').then((m) => m.huevo),
  sumo: () => import('./arena/juegos').then((m) => m.sumo),
  futbol: () => import('./arena/juegos').then((m) => m.futbol),
  faro: () => import('./arena/juegos').then((m) => m.faro),
  bajo: () => import('./tablero/pujas').then((m) => m.bajo),
  torre: () => import('./reflejos/torre').then((m) => m.crear),
  numeros: () => import('./tablero/mentales').then((m) => m.numeros),
  tinta: () => import('./tablero/mentales').then((m) => m.tinta),
  eco: () => import('./tablero/mentales').then((m) => m.eco),
  parejas: () => import('./tablero/parejas').then((m) => m.crear),
  buscaconchas: () => import('./tablero/buscaconchas').then((m) => m.crear),
  luces: () => import('./tablero/luces').then((m) => m.crear),
  cartero: () => import('./tablero/cartero').then((m) => m.crear),
  cofre: () => import('./tablero/cofre').then((m) => m.crear),
  palabra: () => import('./tablero/palabra').then((m) => m.crear),
  totem: () => import('./punteria/totem').then((m) => m.crear),
  catapulta: () => import('./punteria/catapulta').then((m) => m.crear),
  bolos: () => import('./punteria/bolos').then((m) => m.crear),
  minigolf: () => import('./punteria/minigolf').then((m) => m.crear),
  calabazas: () => import('./punteria/calabazas').then((m) => m.crear),
  cocos: () => import('./reflejos/cocos').then((m) => m.crear),
  cangrejos: () => import('./reflejos/cangrejos').then((m) => m.crear),
  tambores: () => import('./reflejos/tambores').then((m) => m.crear),
  semaforo: () => import('./reflejos/semaforo').then((m) => m.crear),
};
