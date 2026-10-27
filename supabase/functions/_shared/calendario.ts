// El calendario de la liga, compartido por la web (src/juegos/liga.ts) y por las funciones de Supabase (el Diario).
// Sin dependencias: Deno y Vite lo leen igual.

/**
 * Los 11 cruces, dos por semana para no agobiar: miércoles a sábado (4 días) y domingo a martes (3 días).
 * Así cada persona juega 1 o 2 duelos por semana. La liga termina el sábado 28 de noviembre.
 */
// El cruce 1 se extendió un día (hasta el domingo 25-10); por eso el cruce 2 pasó al 26-28 y el 3 al 29-31 (decisión del 26-10)
export const CRUCES = [
  { n: 1, desde: '2026-10-21', hasta: '2026-10-25' }, { n: 2, desde: '2026-10-26', hasta: '2026-10-28' },
  { n: 3, desde: '2026-10-29', hasta: '2026-10-31' }, { n: 4, desde: '2026-11-01', hasta: '2026-11-03' },
  { n: 5, desde: '2026-11-04', hasta: '2026-11-07' }, { n: 6, desde: '2026-11-08', hasta: '2026-11-10' },
  { n: 7, desde: '2026-11-11', hasta: '2026-11-14' }, { n: 8, desde: '2026-11-15', hasta: '2026-11-17' },
  { n: 9, desde: '2026-11-18', hasta: '2026-11-21' }, { n: 10, desde: '2026-11-22', hasta: '2026-11-24' },
  { n: 11, desde: '2026-11-25', hasta: '2026-11-28' },
];
/**
 * Calendario de todos contra todos (método del círculo): para cada cruce, las parejas de equipos y el que descansa.
 * Con un número impar de equipos se agrega un "descanso"; así cada equipo descansa exactamente una vez.
 */
export function calendarioLiga<T>(equipos: T[]): { parejas: [T, T][]; descansa: T | null }[] {
  const lista: (T | null)[] = [...equipos];
  if (lista.length % 2) lista.push(null);
  const n = lista.length, rondas: { parejas: [T, T][]; descansa: T | null }[] = [];
  for (let r = 0; r < n - 1; r++) {
    const parejas: [T, T][] = [];
    let descansa: T | null = null;
    for (let i = 0; i < n / 2; i++) {
      const a = lista[i], b = lista[n - 1 - i];
      if (a === null) descansa = b; else if (b === null) descansa = a;
      else parejas.push(r % 2 ? [b, a] : [a, b]); // alternar quién es "A" para que nadie sea siempre el mismo lado
    }
    rondas.push({ parejas, descansa });
    lista.splice(1, 0, lista.pop()!); // el primero queda fijo; los demás giran
  }
  return rondas;
}

/** El calendario oficial: equipos del más nuevo al más antiguo (con 12 equipos nadie descansa; con impares, descansa primero el más nuevo). */
export const calendarioDeEquipos = (equipos: { id: number }[]) => calendarioLiga([...equipos].sort((a, b) => b.id - a.id).map((q) => q.id));

