import type { Contexto, Partida, Resultado } from '../../juegos/marco';

// "Mismo mundo" en vivo: los dos jugadores (y los espectadores) ven la misma arena. Quien es anfitrión de la sala
// simula todo (física, bots y los dos jugadores) y reparte el estado unas 15 veces por segundo; los demás mandan
// solo su mando (al anfitrión) y dibujan lo que llega, suavizado. Cada juego describe su estado (todo serializable),
// cómo avanza y cómo se dibuja.
//
// Quién manda: cada vez que una pestaña empieza a simular abre una "época" nueva. Se aceptan estados solo del
// anfitrión; dentro de una época, el más nuevo. Si llega una época nueva pero su mundo va atrás (el anfitrión
// recargó, o volvió de un corte), no se acepta: se le manda el mundo que uno tiene y el anfitrión sigue desde ahí.

export type Lado = 'a' | 'b';
export interface Vista<E, I> {
  /** El escenario llama a esta función en cada cuadro (solo para dibujar). */
  alCuadro(f: (t: number, dt: number) => void): void;
  dibujar(e: E, dt: number): void;
  /** Lo que el jugador está apretando ahora. */
  entrada(): I;
  empezar(): void;
  destruir(): void;
}
export interface JuegoMundo<E, I> {
  inicial(semilla: string, nivel: number): E;
  quieto(): I;
  /** Avanza la simulación (solo quien simula). */
  paso(e: E, entradas: Record<Lado, I>, dt: number): void;
  /** Segundos de juego que lleva el estado: sirve para saber qué mundo va más adelante. */
  tiempo(e: E): number;
  terminado(e: E): boolean;
  resultado(e: E, lado: Lado): Resultado;
  valido(x: unknown): x is E;
  entradaValida(x: unknown): x is I;
  escena(c: Contexto, e0: E, yo: Lado | null): Promise<Vista<E, I>>;
}

const PASO = 1 / 60;
const nuevaEpoca = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export async function crearMundo<E, I>(c: Contexto, juego: JuegoMundo<E, I>): Promise<Partida> {
  const v = c.vivo!, yo: Lado | null = v.rol === 'espectador' ? null : v.rol;
  let e = juego.inicial(c.semilla, c.nivel), k = 0, ep = '', miEpoca = '', empezado = false, terminado = false, cerrado = false;
  let resto = 0, antes = performance.now(), envio = 0, mando = 0, ultimoRescate = 0, mandado = '';
  const entradas: Record<Lado, I> = { a: juego.quieto(), b: juego.quieto() };
  const vista = await juego.escena(c, e, yo);
  const mandarMundo = () => v.enviar('mundo', { ep: miEpoca, k: ++k, e: e as unknown as Record<string, unknown> });

  v.alRecibir((tipo, d, lado, deAnfitrion) => {
    if (tipo === 'mundo' && deAnfitrion && !v.simulo() && typeof d.ep === 'string' && Number.isInteger(d.k) && juego.valido(d.e)) {
      const nueva = d.ep !== ep;
      if (!nueva && ((d.k as number) <= k || (d.k as number) > k + 1000)) return;
      // Una época nueva con el mundo atrasado: le paso el mío (a lo más una vez por segundo) en vez de retroceder
      if (nueva && juego.tiempo(d.e) < juego.tiempo(e) - 1) {
        if (performance.now() - ultimoRescate > 1000) { ultimoRescate = performance.now(); v.enviar('rescate', { e: e as unknown as Record<string, unknown> }, true); }
        return;
      }
      e = d.e; ep = d.ep as string; k = d.k as number;
      return;
    }
    // Quien simula toma el mundo de otro si ese va más adelante (recargó o volvió de un corte)
    if (tipo === 'rescate' && v.simulo() && (lado || deAnfitrion) && juego.valido(d.e) && juego.tiempo(d.e) > juego.tiempo(e) + 0.5) { e = d.e; terminado = false; return; }
    if (tipo === 'entrada' && lado && lado !== yo && juego.entradaValida(d.i)) entradas[lado] = d.i;
  });

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    if (yo) c.alTerminar(juego.resultado(e, yo));
  };

  // La simulación y los envíos van con su propio reloj, no con el dibujo: si la pestaña del anfitrión queda
  // oculta el navegador frena el dibujo, pero esto sigue (más lento: se ponen al día hasta 1 s de una vez)
  const tic = () => {
    if (cerrado) return;
    const ahora = performance.now(), dt = Math.min(1, (ahora - antes) / 1000);
    antes = ahora;
    if (!empezado) return;
    const simulo = v.simulo();
    if (simulo && !miEpoca) { miEpoca = nuevaEpoca(); ep = miEpoca; }
    if (!simulo) miEpoca = '';
    if (yo && !terminado) {
      entradas[yo] = vista.entrada();
      // Mi mando va solo al anfitrión: cuando cambia, y si no, cada medio segundo (sin conexión directa, más lento)
      const texto = JSON.stringify(entradas[yo]), cada = v.directo() ? 66 : 200;
      if (!simulo && ahora - mando > cada && (texto !== mandado || ahora - mando > 500)) { mando = ahora; mandado = texto; v.enviar('entrada', { i: entradas[yo] as unknown as Record<string, unknown> }, true); }
    }
    if (simulo) {
      if (!terminado) {
        resto = Math.min(resto + dt, 1);
        while (resto >= PASO) { juego.paso(e, entradas, PASO); resto -= PASO; }
      }
      // Terminado o no, el estado se sigue mandando (así a nadie le falta el final), más lento sin conexión directa
      if (ahora - envio > (v.directo() ? 66 : 200)) { envio = ahora; mandarMundo(); }
    }
    if (juego.terminado(e)) terminar();
  };
  const reloj = setInterval(tic, 1000 / 60);
  vista.alCuadro((_t, dt) => vista.dibujar(e, dt));

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mundo = { estado: () => e, simulo: () => v.simulo(), k: () => k };
  return {
    empezar() { vista.empezar(); antes = performance.now(); empezado = true; },
    destruir() { cerrado = true; clearInterval(reloj); vista.destruir(); },
  };
}

/** Acerca un valor a otro, suave y sin depender de los cuadros por segundo (para dibujar lo que llega por la red). */
export const suave = (desde: number, hacia: number, dt: number, rapidez = 14) => (Math.abs(hacia - desde) > 4 ? hacia : desde + (hacia - desde) * (1 - Math.exp(-rapidez * dt)));
/** Lo mismo para un ángulo (por el camino corto). */
export const suaveAngulo = (desde: number, hacia: number, dt: number, rapidez = 14) => {
  let d = hacia - desde;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return desde + d * (1 - Math.exp(-rapidez * dt));
};
/** Número finito (para validar lo que llega de otra persona). */
export const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** Entero entre `desde` y `hasta` (incluidos). */
export const entre = (x: unknown, desde: number, hasta: number) => Number.isInteger(x) && (x as number) >= desde && (x as number) <= hasta;
