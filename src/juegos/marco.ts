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
}

export interface Contexto {
  caja: HTMLElement;
  /** Igual para todos durante el día: mismo desafío para todos. */
  semilla: string;
  aspecto: Aspecto;
  alTerminar(r: Resultado): void;
}

export interface Partida {
  empezar(): void;
  destruir(): void;
}

export type CrearJuego = (c: Contexto) => Promise<Partida>;

/** Cada juego se descarga recién cuando alguien lo abre. */
export const CARGADORES: Record<string, () => Promise<CrearJuego>> = {
  numeros: () => import('./tablero/mentales').then((m) => m.numeros),
  tinta: () => import('./tablero/mentales').then((m) => m.tinta),
  eco: () => import('./tablero/mentales').then((m) => m.eco),
  calculo: () => import('./tablero/mentales').then((m) => m.calculo),
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
