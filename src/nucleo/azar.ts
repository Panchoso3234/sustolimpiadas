import { ZONA_HORARIA } from './config.ts';

/** Número en [0, 1) que depende solo de sus argumentos: mismo resultado en todos los navegadores. */
export function azar(...partes: (string | number)[]): number {
  const s = partes.join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Generador con semilla, para armar personajes de muestra reproducibles. */
export function generador(semilla: string): () => number {
  let i = 0;
  return () => azar(semilla, i++);
}

const formatoHora = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false });

/** Hora de Chile como número decimal (21.5 = 21:30). */
export function horaChile(ms: number): number {
  const [h, m] = formatoHora.format(new Date(ms)).split(':').map(Number);
  return (h % 24) + m / 60;
}

const formatoFecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Fecha de Chile como "AAAA-MM-DD". */
export function fechaChile(ms: number): string {
  return formatoFecha.format(new Date(ms));
}

export function textoHora(h: number): string {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
