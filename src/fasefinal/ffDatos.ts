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

// Sin la columna historial (pesa): se lee aparte, solo en la pestaña Historial
const COLUMNAS_SIM = 'n,estado,tributos,cuotas,participantes,cierre,huella_pronosticos,paso,paracaidas_abiertos,resultado';
export async function listarSims(): Promise<SimFF[]> { const { data, error } = await supabase.from('ff_sims').select(COLUMNAS_SIM).order('n'); return error ? [] : ((data as SimFF[] | null) ?? []); }
export async function misPronosticos(): Promise<{ sim: number; mercado: Mercado; eleccion: string | string[] }[]> { const { data, error } = await supabase.from('ff_pronosticos').select('sim,mercado,eleccion'); return error ? [] : ((data ?? []) as never); }
export async function misApuestas(): Promise<ApuestaFF[]> { const { data, error } = await supabase.from('ff_apuestas').select('*').order('id'); return error ? [] : ((data as ApuestaFF[] | null) ?? []); }
export async function paracaidas(sim: number): Promise<ParacaidasFF[]> { const { data, error } = await supabase.from('ff_paracaidas').select('*').eq('sim', sim).order('id'); return error ? [] : ((data as ParacaidasFF[] | null) ?? []); }
export async function ranking(): Promise<{ perfil_id: string; nombre: string; puntos: number; sims: number }[]> { const { data, error } = await supabase.rpc('ff_ranking'); return error ? [] : ((data ?? []) as never); }
export async function premios(): Promise<{ perfil_id: string; puesto: number; puntos: number; gemas: number; titulo: string | null }[]> { const { data, error } = await supabase.from('ff_premios').select('*').order('puesto'); return error ? [] : ((data ?? []) as never); }
export async function miSaldo(id: string | null): Promise<number | null> { if (!id) return null; const { data } = await supabase.from('gacha_billetera').select('protogemas').eq('perfil_id', id).maybeSingle(); return (data as { protogemas: number } | null)?.protogemas ?? 0; }

export const pronosticar = (sim: number, mercado: Mercado, eleccion: string | string[]) => accion('ff_pronosticar', { p_sim: sim, p_mercado: mercado, p_eleccion: eleccion });
// Encuesta post-gala (5 multis = 50 deseos). null = no se puede saber (falta el SQL o no hay sesión)
export async function miEncuesta(yo: string): Promise<boolean | null> { const { data, error } = await supabase.from('ff_encuesta').select('perfil_id').eq('perfil_id', yo).maybeSingle(); return error ? null : !!data; }
export const responderEncuesta = (mejor: string, peor: string, agregar: string) => accion('ff_responder_encuesta', { p_mejor: mejor, p_peor: peor, p_agregar: agregar });
export const apostar = (sim: number, mercado: Mercado, tributo: string, monto: number) => accion('ff_apostar', { p_sim: sim, p_mercado: mercado, p_tributo: tributo, p_monto: monto });
export const mandarParacaidas = (sim: number, tributo: string, nivel: 1 | 2) => accion('ff_paracaidas_mandar', { p_sim: sim, p_tributo: tributo, p_nivel: nivel });
export const publicar = (sims: { n: number; tributos: { id: string; nombre: string }[]; cuotas: Cuotas }[]) => accion('ff_publicar', { p_sims: sims });
export const avanzar = (sim: number, paso: number, abiertos: boolean) => supabase.rpc('ff_avanzar', { p_sim: sim, p_paso: paso, p_paracaidas: abiertos }).then(() => undefined, () => undefined);
export const registrarResultado = (sim: number, r: { ganador: string; primero: string; sobrevive: string[]; top3: string[] }) => accion('ff_resultado', { p_sim: sim, p_resultado: r });
/** Relato completo de una simulación oficial, para la pestaña Historial (todo con nombres, ya listo para mostrar). */
export interface HistorialFF { n: number; premio: string; fecha: string | null; ritmo: string; dias: number; tributos: number; ganador: string; top3: string[];
  eliminaciones: { nombre: string; n: number }[]; paracaidas: { de: string; para: string; nivel: number }[];
  pasos: { tipo: string; titulo: string; intro?: string; lineas: { t: string; m: string[] }[] }[] }
export const guardarHistorial = (sim: number, h: HistorialFF) => accion('ff_guardar_historial', { p_sim: sim, p_historial: h });
export async function listarHistorial(): Promise<HistorialFF[]> { const { data, error } = await supabase.from('ff_sims').select('n,historial').not('historial', 'is', null).order('n'); return error ? [] : ((data ?? []) as { historial: HistorialFF }[]).map((x) => x.historial); }
export const premiar = () => accion('ff_premiar', {});
/** Cierra los pronósticos (al apretar «Empezar»): devuelve la hora del servidor y la huella, o null si no se pudo. */
export async function cerrar(sim: number, participantes: string[]): Promise<{ cierre: string; huella: string } | null> {
  const { data, error } = await supabase.rpc('ff_cerrar', { p_sim: sim, p_participantes: participantes });
  return error || !data ? null : (data as { cierre: string; huella: string });
}
