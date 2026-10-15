import type { Aspecto } from '../personaje/catalogo';

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

/** Lo que reciben los juegos que se juegan en vivo (desde la tanda 2). */
export interface ContextoVivo {
  rol: 'a' | 'b' | 'espectador';
  nombres: { a: string; b: string };
  enviar(tipo: string, datos: Record<string, unknown>): void;
  alRecibir(f: (tipo: string, datos: Record<string, unknown>, de: string) => void): void;
  /** Aviso grande que ven todos en la sala ("Es el turno de Vale"). */
  avisar(texto: string): void;
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
}

/** Lo que la sala le avisa a los motores para la partida que parte (shortcut: un valor compartido; basta porque hay una sola partida a la vez). */
export const ajustesPartida = { pausable: true };

/** Jornada del torneo (1 a 4) de una fecha "AAAA-MM-DD": parten los viernes desde el 16 de octubre; antes cuenta como la 1. */
export const jornadaDe = (fecha: string) => Math.min(4, Math.max(1, Math.floor((Date.parse(fecha) - Date.parse('2026-10-16')) / (7 * 864e5)) + 1));

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
  agujero: () => import('./arcade/agujero').then((m) => m.crear),
  serpientes: () => import('./arcade/serpientes').then((m) => m.crear),
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
  cocos: () => import('./reflejos/cocos').then((m) => m.crear),
  cangrejos: () => import('./reflejos/cangrejos').then((m) => m.crear),
  tambores: () => import('./reflejos/tambores').then((m) => m.crear),
  semaforo: () => import('./reflejos/semaforo').then((m) => m.crear),
};
