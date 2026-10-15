import type { Contexto, Partida, Resultado } from '../../juegos/marco';

// "Mismo mundo" en vivo: los dos jugadores (y los espectadores) ven la misma arena. Quien es anfitrión de la sala
// simula todo (física, bots y los dos jugadores) y reparte el estado unas 15 veces por segundo; los demás mandan
// solo su mando y dibujan lo que llega, suavizado. Si el anfitrión se va, el nuevo sigue desde el último estado.
// Cada juego describe su estado (todo serializable), cómo avanza y cómo se dibuja.

export type Lado = 'a' | 'b';
export interface Vista<E, I> {
  /** El escenario llama a esta función en cada cuadro. */
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
  terminado(e: E): boolean;
  resultado(e: E, lado: Lado): Resultado;
  valido(x: unknown): x is E;
  entradaValida(x: unknown): x is I;
  escena(c: Contexto, e0: E, yo: Lado | null): Promise<Vista<E, I>>;
}

const PASO = 1 / 60;

export async function crearMundo<E, I>(c: Contexto, juego: JuegoMundo<E, I>): Promise<Partida> {
  const v = c.vivo!, yo: Lado | null = v.rol === 'espectador' ? null : v.rol;
  let e = juego.inicial(c.semilla, c.nivel), k = 0, empezado = false, terminado = false, resto = 0, envio = 0, mando = 0;
  const entradas: Record<Lado, I> = { a: juego.quieto(), b: juego.quieto() };
  const vista = await juego.escena(c, e, yo);

  v.alRecibir((tipo, d, lado, deAnfitrion) => {
    // El estado lo manda quien simula; se acepta el más nuevo (también al cambiar de anfitrión)
    if (tipo === 'mundo' && !v.simulo() && (deAnfitrion || lado) && Number.isInteger(d.k) && (d.k as number) > k && juego.valido(d.e)) { e = d.e; k = d.k as number; }
    if (tipo === 'entrada' && lado && lado !== yo && juego.entradaValida(d.i)) entradas[lado] = d.i;
  });

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    // Quien simula repite el estado final para que nadie se quede sin verlo
    if (v.simulo()) for (const ms of [0, 400, 1200]) setTimeout(() => v.enviar('mundo', { k: ++k, e: e as unknown as Record<string, unknown> }), ms);
    if (yo) c.alTerminar(juego.resultado(e, yo));
  };

  vista.alCuadro((_t, dt) => {
    if (empezado && !terminado) {
      const ahora = performance.now();
      if (yo) {
        entradas[yo] = vista.entrada();
        // Mi mando le llega al que simula unas 15 veces por segundo
        if (!v.simulo() && ahora - mando > 66) { mando = ahora; v.enviar('entrada', { i: entradas[yo] as unknown as Record<string, unknown> }); }
      }
      if (v.simulo()) {
        resto = Math.min(resto + dt, 0.1);
        while (resto >= PASO) { juego.paso(e, entradas, PASO); resto -= PASO; }
        // Sin conexión directa todo pasa por Supabase: menos seguido
        if (ahora - envio > (v.directo() ? 66 : 200)) { envio = ahora; v.enviar('mundo', { k: ++k, e: e as unknown as Record<string, unknown> }); }
      }
      if (juego.terminado(e)) terminar();
    }
    vista.dibujar(e, dt);
  });

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mundo = { estado: () => e, simulo: () => v.simulo(), k: () => k };
  return { empezar() { vista.empezar(); empezado = true; }, destruir: vista.destruir };
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
