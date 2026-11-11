// El calendario de la liga, compartido por la web (src/juegos/liga.ts) y por las funciones de Supabase (el Diario).
// Sin dependencias: Deno y Vite lo leen igual.

/**
 * Los 11 cruces. Al principio iban dos por semana (miércoles a sábado y domingo a martes).
 * Desde el 11-11 el calendario se acortó: los cruces 7 a 11 duran 2 o 3 días y la liga termina el domingo 22 de noviembre.
 */
// El cruce 3 se extendió 2 horas: cierra el domingo 01-11 a las 02:00 y ahí parte el 4 (decisión del 31-10)
// El cruce 1 se extendió un día (hasta el domingo 25-10); por eso el cruce 2 pasó al 26-28 y el 3 al 29-31 (decisión del 26-10)
export const CRUCES: { n: number; desde: string; hasta: string; cierre?: string }[] = [
  { n: 1, desde: '2026-10-21', hasta: '2026-10-25' }, { n: 2, desde: '2026-10-26', hasta: '2026-10-28' },
  { n: 3, desde: '2026-10-29', hasta: '2026-10-31', cierre: 'domingo 01/11 a las 02:00' }, { n: 4, desde: '2026-11-01', hasta: '2026-11-03', cierre: 'miércoles 04/11 a las 03:00' },
  { n: 5, desde: '2026-11-04', hasta: '2026-11-07' }, { n: 6, desde: '2026-11-08', hasta: '2026-11-10' },
  { n: 7, desde: '2026-11-11', hasta: '2026-11-12' }, { n: 8, desde: '2026-11-13', hasta: '2026-11-15' },
  { n: 9, desde: '2026-11-16', hasta: '2026-11-17' }, { n: 10, desde: '2026-11-18', hasta: '2026-11-20' },
  { n: 11, desde: '2026-11-21', hasta: '2026-11-22' },
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

