import { supabase, type Rol } from '../nucleo/supabase';

// Acceso a los datos del versus en diferido: personas, equipos, enfrentamientos y sus marcas.
export type Lado = 'a' | 'b';

export interface Enfrentamiento {
  id: number; modo: '1v1' | '3v3'; juego: string; rondas: number; jornada: number; plazo: string | null; oficial: boolean;
  a_perfil: string | null; b_perfil: string | null; a_equipo: number | null; b_equipo: number | null;
  estado: 'pendiente' | 'cerrado' | 'anulado'; ganador: Lado | 'empate' | null; puntos_a: number; puntos_b: number; creado_por: string; creado: string;
  /** Liga (etapa 3): a qué cruce pertenece y quién no jugó ninguna ronda. */
  cruce?: number | null; no_jugo?: Lado | 'ambos' | null;
}
export interface MarcaVersus {
  enfrentamiento_id: number; perfil_id: string; ronda: number; lado: Lado; puntaje: number; terminado: boolean;
  detalle: Record<string, unknown>; creado: string; avance: string | null; reinicios: number;
}
export interface Persona { id: string; nombre: string; rol: Rol }
export interface Equipo { id: number; nombre: string; miembros: string[]; /** El capitán (staff): juega y suma, pero no pasa a la final. */ capitan?: string | null }
export type NuevoEnfrentamiento = Pick<Enfrentamiento, 'modo' | 'juego' | 'rondas' | 'jornada' | 'plazo' | 'oficial' | 'a_perfil' | 'b_perfil' | 'a_equipo' | 'b_equipo'> & { cruce?: number };

// La semilla queda fuera a propósito: no se puede leer, solo la entrega `empezar_ronda`
const COLUMNAS = 'id,modo,juego,rondas,jornada,plazo,oficial,a_perfil,b_perfil,a_equipo,b_equipo,estado,ganador,puntos_a,puntos_b,creado_por,creado';
// Con las columnas de la liga (etapa-3.sql); si la base aún no las tiene, se piden las de antes
const COLUMNAS_LIGA = `${COLUMNAS},cruce,no_jugo`;

export async function listarPersonas(): Promise<Persona[]> {
  const { data } = await supabase.from('perfiles').select('id,nombre,rol').order('nombre');
  return (data as Persona[] | null) ?? [];
}

export async function listarEquipos(): Promise<Equipo[]> {
  const [{ data: equipos }, { data: miembros }] = await Promise.all([
    supabase.from('equipos').select('id,nombre,capitan').order('id').then((r) => (r.error ? supabase.from('equipos').select('id,nombre').order('id') : r)),
    supabase.from('equipo_miembros').select('perfil_id,equipo_id'),
  ]);
  return ((equipos as { id: number; nombre: string; capitan?: string | null }[] | null) ?? []).map((e) => ({
    ...e, miembros: ((miembros as { perfil_id: string; equipo_id: number }[] | null) ?? []).filter((m) => m.equipo_id === e.id).map((m) => m.perfil_id),
  }));
}

/** `disponible` es falso mientras las tablas del versus no existan en Supabase. */
export async function listarEnfrentamientos(modo?: '1v1' | '3v3'): Promise<{ lista: Enfrentamiento[]; disponible: boolean }> {
  const pedir = (columnas: string) => { let consulta = supabase.from('enfrentamientos').select(columnas).order('id', { ascending: false }).limit(1000); if (modo) consulta = consulta.eq('modo', modo); return consulta; };
  let { data, error } = await pedir(COLUMNAS_LIGA);
  if (error) ({ data, error } = await pedir(COLUMNAS));
  return { lista: (data as Enfrentamiento[] | null) ?? [], disponible: !error };
}

export async function unEnfrentamiento(id: number): Promise<Enfrentamiento | null> {
  let { data, error } = await supabase.from('enfrentamientos').select(COLUMNAS_LIGA).eq('id', id).maybeSingle();
  if (error) ({ data } = await supabase.from('enfrentamientos').select(COLUMNAS).eq('id', id).maybeSingle());
  return (data as Enfrentamiento | null) ?? null;
}

/** Marcas que a esta persona le toca ver: las propias siempre; las del rival solo cuando el enfrentamiento cerró. */
export async function marcasDe(ids: number[]): Promise<MarcaVersus[]> {
  // Sin sesión no hay marcas que ver: se evita una consulta que la base rechazaría
  if (!ids.length || !(await supabase.auth.getSession()).data.session) return [];
  const { data, error } = await supabase.from('enfrentamiento_marcas').select('enfrentamiento_id,perfil_id,ronda,lado,puntaje,terminado,detalle,creado,avance,reinicios').in('enfrentamiento_id', ids);
  if (!error) return (data as MarcaVersus[] | null) ?? [];
  // Si la base aún no tiene las columnas nuevas (falta volver a ejecutar esquema.sql), se piden las de antes
  const viejo = await supabase.from('enfrentamiento_marcas').select('enfrentamiento_id,perfil_id,ronda,lado,puntaje,terminado').in('enfrentamiento_id', ids);
  return ((viejo.data as MarcaVersus[] | null) ?? []).map((m) => ({ ...m, detalle: {}, creado: '', avance: null, reinicios: 0 }));
}

export async function crearEnfrentamientos(filas: NuevoEnfrentamiento[]): Promise<string | null> {
  if (!filas.length) return 'No hay enfrentamientos que crear.';
  const { error } = await supabase.from('enfrentamientos').insert(filas);
  return error?.message ?? null;
}

export async function empezarRonda(id: number, ronda: number): Promise<{ semilla?: string; error?: string }> {
  const { data, error } = await supabase.rpc('empezar_ronda', { p_enf: id, p_ronda: ronda });
  if (data === '') return { error: 'Tu partida anterior de esta ronda se cortó después de los primeros 10 segundos, así que vale lo que alcanzaste a llevar. Vuelve a tus enfrentamientos para ver la ronda siguiente.' };
  return error || typeof data !== 'string' ? { error: error?.message ?? 'No se pudo empezar la ronda.' } : { semilla: data };
}

/** Avisa cuánto lleva la partida en curso; si se corta, vale esto. No espera respuesta. */
export function latidoRonda(id: number, ronda: number, puntaje: number): void {
  supabase.rpc('latido_ronda', { p_enf: id, p_ronda: ronda, p_puntaje: Math.max(0, Math.round(puntaje)) }).then(() => undefined, () => undefined);
}

/** Una ronda se cortó si quedó a medias o si se cerró con lo guardado. */
export const cortada = (m: MarcaVersus) => !!m.detalle?.interrumpido || (!m.terminado && !!m.avance && Date.now() - Date.parse(m.avance) > 30_000);

export async function terminarRonda(id: number, ronda: number, puntaje: number, detalle: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.rpc('terminar_ronda', { p_enf: id, p_ronda: ronda, p_puntaje: puntaje, p_detalle: detalle });
  return error?.message ?? null;
}

/** De qué lado juega alguien, o nada si no participa. */
export function ladoDe(e: Enfrentamiento, usuarioId: string | null, equipos: Equipo[]): Lado | null {
  if (!usuarioId) return null;
  if (e.modo === '1v1') return e.a_perfil === usuarioId ? 'a' : e.b_perfil === usuarioId ? 'b' : null;
  const mio = equipos.find((q) => q.miembros.includes(usuarioId))?.id;
  return mio === undefined ? null : mio === e.a_equipo ? 'a' : mio === e.b_equipo ? 'b' : null;
}

export function nombreLado(e: Enfrentamiento, lado: Lado, personas: Persona[], equipos: Equipo[]): string {
  if (e.modo === '1v1') { const id = lado === 'a' ? e.a_perfil : e.b_perfil; return personas.find((p) => p.id === id)?.nombre ?? 'Participante'; }
  const id = lado === 'a' ? e.a_equipo : e.b_equipo;
  return equipos.find((q) => q.id === id)?.nombre ?? 'Equipo';
}

export function mezclar<T>(lista: T[]): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [copia[i], copia[k]] = [copia[k], copia[i]]; }
  return copia;
}

/** Parejas al azar; si son impares, uno descansa. */
export function sortearParejas<T>(ids: T[]): [T, T][] {
  const m = mezclar(ids), parejas: [T, T][] = [];
  for (let i = 0; i + 1 < m.length; i += 2) parejas.push([m[i], m[i + 1]]);
  return parejas;
}

export function todosContraTodos<T>(ids: T[]): [T, T][] {
  const parejas: [T, T][] = [];
  for (let i = 0; i < ids.length; i++) for (let k = i + 1; k < ids.length; k++) parejas.push([ids[i], ids[k]]);
  return parejas;
}

/** Aplica la regla del plazo: cierra lo vencido con lo que se haya jugado. Si la función aún no existe, no pasa nada. */
export async function cerrarVencidos(): Promise<void> {
  await supabase.rpc('cerrar_vencidos');
}

export const fechaCorta =(f: string | null) => (f ? f.split('-').reverse().slice(0, 2).join('/') : 'sin plazo');
