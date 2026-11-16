// Sorteo del juego de cada duelo de liga mirando el historial de los dos jugadores (15-11, pedido de Pancho):
// nadie juega un juego más de MAX_VECES en los cruces, y NO_TOCAR bloquea juegos a personas puntuales. Puro (sin
// Supabase) para poder probarlo: lo usan MesaLiga.tsx y pruebas/sorteo-test.mjs.

/** Cuántas veces como máximo juega una persona el mismo juego en los cruces. */
export const MAX_VECES = 1;
/** Juegos que a ciertas personas no les deben tocar nunca más (perfil → juegos). */
export const NO_TOCAR: Record<string, string[]> = {
  '40b6ec64-ddf4-475c-898c-a8826a7835f5': ['mercado'], // andy (15-11)
  '04a4d011-6e1e-45b5-a0f2-a7e2fef5fe6f': ['mercado'], // El Leona Tactico (15-11)
};

interface DueloBase { cruce?: number | null; juego: string | null; a_perfil: string | null; b_perfil: string | null; estado: string }
export type Veces = Map<string, Map<string, number>>;

/** Cuántas veces jugó cada persona cada juego en los duelos de los cruces (sin los anulados). */
export function vecesPorJugador(duelos: DueloBase[]): Veces {
  const v: Veces = new Map();
  for (const d of duelos) {
    if (!d.cruce || !d.juego || d.estado === 'anulado') continue;
    for (const p of [d.a_perfil, d.b_perfil]) if (p) { const m = v.get(p) ?? new Map<string, number>(); m.set(d.juego, (m.get(d.juego) ?? 0) + 1); v.set(p, m); }
  }
  return v;
}
export const vecesDe = (v: Veces, perfil: string, juego: string) => v.get(perfil)?.get(juego) ?? 0;
const bloqueado = (v: Veces, perfil: string, juego: string) => vecesDe(v, perfil, juego) >= MAX_VECES || !!NO_TOCAR[perfil]?.includes(juego);

/**
 * Un juego para el duelo a vs b, con las probabilidades de la tabla, entre los que ninguno de los dos tenga bloqueados.
 * Si no queda ninguno (no debería pasar), relaja: primero solo respeta NO_TOCAR y, si tampoco, usa la tabla completa.
 * `forzado` avisa que se tuvo que relajar la regla.
 */
export function elegirJuego(tabla: { juego: string; p: number }[], a: string, b: string, v: Veces, azar: () => number = Math.random): { juego: string; forzado: boolean } {
  const tirar = (lista: { juego: string; p: number }[]) => {
    const total = lista.reduce((s, x) => s + x.p, 0);
    let k = azar() * total;
    return (lista.find((x) => (k -= x.p) < 0) ?? lista[lista.length - 1]).juego;
  };
  const libres = tabla.filter((x) => !bloqueado(v, a, x.juego) && !bloqueado(v, b, x.juego));
  if (libres.length) return { juego: tirar(libres), forzado: false };
  const sinVeto = tabla.filter((x) => !NO_TOCAR[a]?.includes(x.juego) && !NO_TOCAR[b]?.includes(x.juego));
  return { juego: tirar(sinVeto.length ? sinVeto : tabla), forzado: true };
}
