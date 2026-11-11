// Wild Cards: lectura y acciones contra la base (supabase/2026-11-11-wild-cards.sql). El motor puro está en wildcards.ts.
import { supabase } from '../nucleo/supabase';
import type { AjusteCarta } from './liga';
import type { Rareza } from './wildcards';

/** Una carta sorteada tal como la devuelve wc_lista: si está boca abajo para quien mira, `carta` y `dado` vienen vacíos. */
export interface WildCard {
  id: number; cruce: number; equipo_id: number; rareza: Rareza; carta: string | null; origen: number | null; dado: number | null; duelo: number | null;
  usada: boolean; anulada: boolean; motivo: string | null; revelada: boolean; puesto: number | null; datos: Record<string, unknown>; creado: string;
}
export interface AjusteGuardado extends AjusteCarta { detalle: string }

/** Si el SQL aún no se ejecutó, todo devuelve vacío en vez de romper la página. */
export async function listarWildCards(cruce?: number): Promise<WildCard[]> {
  const { data, error } = await supabase.rpc('wc_lista', cruce ? { p_cruce: cruce } : {});
  return error ? [] : ((data as WildCard[] | null) ?? []);
}
export async function listarAjustesCartas(): Promise<AjusteGuardado[]> {
  const { data, error } = await supabase.from('wc_ajustes').select('cruce,equipo_id,puntos,detalle');
  return error ? [] : ((data as AjusteGuardado[] | null) ?? []).map((x) => ({ ...x, puntos: Number(x.puntos) }));
}

const mensaje = (e: { message: string } | null) => (e ? (e.message.includes('Could not find the function') ? 'Falta ejecutar supabase/2026-11-11-wild-cards.sql en Supabase.' : e.message) : null);

export async function sortearCarta(cruce: number, equipo: number): Promise<{ id?: number; error?: string }> {
  const { data, error } = await supabase.rpc('wc_sortear', { p_cruce: cruce, p_equipo: equipo });
  return error ? { error: mensaje(error)! } : { id: data as number };
}
/** Las funciones de acción devuelven null si salió bien, o el motivo en palabras. */
async function accion(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.rpc(fn, args);
  return mensaje(error) ?? ((data as string | null) || null);
}
export const usarCarta = (id: number, datos: Record<string, unknown>) => accion('wc_usar', { p_id: id, p_datos: datos });
export const anularCarta = (id: number, motivo: string) => accion('wc_anular', { p_id: id, p_motivo: motivo });
export const anunciarCartas = (cruce: number) => accion('wc_anunciar', { p_cruce: cruce });
export const revelarCartas = (cruce: number, ajustes: { equipo: number; puntos: number; detalle: string }[], textos: string[]) =>
  accion('wc_revelar', { p_cruce: cruce, p_ajustes: ajustes, p_textos: textos });
