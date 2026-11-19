// Cuotas de TSUKIBET Fase Final: se simulan N galas con parejas al azar y se mira cuántas veces pasa cada cosa.
// Cuota = 0,85 / probabilidad (margen 15 %), entre ×1,05 y ×20 (plan del vault, punto 6). Sin Supabase.
import { simular, type Escenario, type Evento, type Tributo } from './motor';

export type Mercado = 'ganador' | 'primero' | 'sobrevive' | 'top3';
export const MERCADOS: Record<Mercado, string> = { ganador: 'Ganador', primero: 'Primer caído', sobrevive: 'Sobrevive al baño de sangre', top3: 'Llega al top 3' };
export type Cuotas = Record<Mercado, Record<string, number>>;

export const cuotaDe = (p: number) => Math.round(Math.min(20, Math.max(1.05, 0.85 / Math.max(p, 1e-9))) * 100) / 100;

/** Corre por tandas para no congelar la página; `alAvanzar` recibe de 0 a 1. */
export async function calcularCuotas(tributos: Tributo[], banco: Evento[], escenarios: Escenario[], n = 10000, alAvanzar?: (x: number) => void): Promise<{ cuotas: Cuotas; prob: Record<Mercado, Record<string, number>> }> {
  const cuenta: Record<Mercado, Record<string, number>> = { ganador: {}, primero: {}, sobrevive: {}, top3: {} };
  const sumar = (m: Mercado, id: string) => { cuenta[m][id] = (cuenta[m][id] ?? 0) + 1; };
  const ids = tributos.map((t) => t.id);
  for (let i = 0; i < n; i++) {
    // Parejas al azar, como la ruleta (con un generador simple y fijo por vuelta, para que el cálculo sea repetible)
    let s = (i + 1) * 2654435761 % 4294967296;
    const orden = [...ids].sort(() => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; });
    const parejas: [string, string][] = [];
    for (let k = 0; k + 1 < orden.length; k += 2) parejas.push([orden[k], orden[k + 1]]);
    const g = simular(tributos, parejas, banco, escenarios, `cuotas-${i}`);
    sumar('ganador', g.ganador);
    if (g.caidas[0]) sumar('primero', g.caidas[0]);
    for (const id of g.sobrevivenBano) sumar('sobrevive', id);
    for (const id of g.top3) sumar('top3', id);
    if (i % 250 === 249) { alAvanzar?.((i + 1) / n); await new Promise((r) => setTimeout(r, 0)); }
  }
  const prob = { ganador: {}, primero: {}, sobrevive: {}, top3: {} } as Record<Mercado, Record<string, number>>;
  const cuotas = { ganador: {}, primero: {}, sobrevive: {}, top3: {} } as Cuotas;
  for (const m of Object.keys(cuenta) as Mercado[]) for (const id of ids) { prob[m][id] = (cuenta[m][id] ?? 0) / n; cuotas[m][id] = cuotaDe(prob[m][id]); }
  return { cuotas, prob };
}
