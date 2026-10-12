import { supabase } from '../nucleo/supabase';

// Cuántos puntos del torneo vale cada cosa. Los valores viven en la tabla `ajustes` y se cambian desde la Mesa de control.
export interface Puntos { victoria: number; empate: number; derrota: number; individualMax: number; individualMin: number; multiplicadores: number[] }

export const PUNTOS_BASE: Puntos = { victoria: 10, empate: 6, derrota: 3, individualMax: 10, individualMin: 2, multiplicadores: [1, 1.25, 1.5, 2] };

const numero = (valor: unknown, porDefecto: number) => (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 1000 ? valor : porDefecto);

export function normalizarPuntos(dato: unknown): Puntos {
  const d = (dato && typeof dato === 'object' ? dato : {}) as Record<string, unknown>, m = Array.isArray(d.multiplicadores) ? d.multiplicadores : [];
  return {
    victoria: numero(d.victoria, PUNTOS_BASE.victoria), empate: numero(d.empate, PUNTOS_BASE.empate), derrota: numero(d.derrota, PUNTOS_BASE.derrota),
    individualMax: numero(d.individualMax, PUNTOS_BASE.individualMax), individualMin: numero(d.individualMin, PUNTOS_BASE.individualMin),
    multiplicadores: PUNTOS_BASE.multiplicadores.map((base, i) => numero(m[i], base)),
  };
}

let cache: Promise<Puntos> | null = null;

export function leerPuntos(): Promise<Puntos> {
  cache ??= Promise.resolve(supabase.from('ajustes').select('valor').eq('clave', 'puntos').maybeSingle()).then(({ data }) => normalizarPuntos(data?.valor), () => PUNTOS_BASE);
  return cache;
}

export async function guardarPuntos(p: Puntos): Promise<string | null> {
  const { error } = await supabase.from('ajustes').upsert({ clave: 'puntos', valor: p });
  if (!error) cache = Promise.resolve(p);
  return error?.message ?? null;
}

const redondo = (n: number) => Math.round(n * 100) / 100;

/** Individual: del máximo (primer puesto) al mínimo (último), repartido parejo. `puesto` parte en 0. */
export function puntosPorPuesto(p: Puntos, puesto: number, total: number): number {
  if (total <= 1) return p.individualMax;
  return redondo(p.individualMax - ((p.individualMax - p.individualMin) * puesto) / (total - 1));
}

export function puntosVersus(p: Puntos, resultado: 'gana' | 'empata' | 'pierde', jornada: number): number {
  const base = resultado === 'gana' ? p.victoria : resultado === 'empata' ? p.empate : p.derrota;
  return redondo(base * (p.multiplicadores[jornada - 1] ?? 1));
}
