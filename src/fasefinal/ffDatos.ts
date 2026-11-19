// TSUKIBET Fase Final contra la base (supabase/2026-11-20-fase-final-tsukibet.sql). Si el SQL aún no se ejecutó,
// las lecturas devuelven vacío y las acciones avisan qué falta, en vez de romper la página.
import { supabase } from '../nucleo/supabase';
import type { Cuotas, Mercado } from './cuotas';

export interface SimFF { n: number; estado: 'abierta' | 'cerrada' | 'pagada'; tributos: { id: string; nombre: string }[]; cuotas: Cuotas; participantes: string[] | null; cierre: string | null; huella_pronosticos: string | null; paso: number; paracaidas_abiertos: boolean; resultado: { ganador: string; primero: string; sobrevive: string[]; top3: string[] } | null }
export interface ApuestaFF { id: number; sim: number; mercado: Mercado; tributo: string; monto: number; cuota: number; pago: number | null; estado: string }
export interface ParacaidasFF { id: number; sim: number; perfil_id: string; tributo: string; nivel: 1 | 2; desde_paso: number }

const FALTA = 'Falta ejecutar supabase/2026-11-20-fase-final-tsukibet.sql en Supabase.';
const mensaje = (e: { message: string } | null) => (e ? (/does not exist|Could not find/.test(e.message) ? FALTA : e.message) : null);
async function accion(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.rpc(fn, args);
  return mensaje(error) ?? ((data as string | null) || null);
}

export async function listarSims(): Promise<SimFF[]> { const { data, error } = await supabase.from('ff_sims').select('*').order('n'); return error ? [] : ((data as SimFF[] | null) ?? []); }
export async function misPronosticos(): Promise<{ sim: number; mercado: Mercado; eleccion: string | string[] }[]> { const { data, error } = await supabase.from('ff_pronosticos').select('sim,mercado,eleccion'); return error ? [] : ((data ?? []) as never); }
export async function misApuestas(): Promise<ApuestaFF[]> { const { data, error } = await supabase.from('ff_apuestas').select('*').order('id'); return error ? [] : ((data as ApuestaFF[] | null) ?? []); }
export async function paracaidas(sim: number): Promise<ParacaidasFF[]> { const { data, error } = await supabase.from('ff_paracaidas').select('*').eq('sim', sim).order('id'); return error ? [] : ((data as ParacaidasFF[] | null) ?? []); }
export async function ranking(): Promise<{ perfil_id: string; nombre: string; puntos: number; sims: number }[]> { const { data, error } = await supabase.rpc('ff_ranking'); return error ? [] : ((data ?? []) as never); }
export async function premios(): Promise<{ perfil_id: string; puesto: number; puntos: number; gemas: number; titulo: string | null }[]> { const { data, error } = await supabase.from('ff_premios').select('*').order('puesto'); return error ? [] : ((data ?? []) as never); }
export async function miSaldo(id: string | null): Promise<number | null> { if (!id) return null; const { data } = await supabase.from('gacha_billetera').select('protogemas').eq('perfil_id', id).maybeSingle(); return (data as { protogemas: number } | null)?.protogemas ?? 0; }

export const pronosticar = (sim: number, mercado: Mercado, eleccion: string | string[]) => accion('ff_pronosticar', { p_sim: sim, p_mercado: mercado, p_eleccion: eleccion });
export const apostar = (sim: number, mercado: Mercado, tributo: string, monto: number) => accion('ff_apostar', { p_sim: sim, p_mercado: mercado, p_tributo: tributo, p_monto: monto });
export const mandarParacaidas = (sim: number, tributo: string, nivel: 1 | 2) => accion('ff_paracaidas_mandar', { p_sim: sim, p_tributo: tributo, p_nivel: nivel });
export const publicar = (sims: { n: number; tributos: { id: string; nombre: string }[]; cuotas: Cuotas }[]) => accion('ff_publicar', { p_sims: sims });
export const avanzar = (sim: number, paso: number, abiertos: boolean) => supabase.rpc('ff_avanzar', { p_sim: sim, p_paso: paso, p_paracaidas: abiertos }).then(() => undefined, () => undefined);
export const registrarResultado = (sim: number, r: { ganador: string; primero: string; sobrevive: string[]; top3: string[] }) => accion('ff_resultado', { p_sim: sim, p_resultado: r });
export const premiar = () => accion('ff_premiar', {});
/** Cierra los pronósticos (al apretar «Empezar»): devuelve la hora del servidor y la huella, o null si no se pudo. */
export async function cerrar(sim: number, participantes: string[]): Promise<{ cierre: string; huella: string } | null> {
  const { data, error } = await supabase.rpc('ff_cerrar', { p_sim: sim, p_participantes: participantes });
  return error || !data ? null : (data as { cierre: string; huella: string });
}
