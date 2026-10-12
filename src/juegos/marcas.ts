import { supabase } from '../nucleo/supabase';

// Marcas de los juegos. Siempre se anotan en el navegador (para que cada uno vea su mejor marca aunque no haya
// entrado con Discord) y, con sesión iniciada, también en la tabla `marcas` de Supabase, que es la que vale.
const CLAVE = 'susto.marcas';

interface Local { [juego: string]: { [fecha: string]: { mejor: number; intentos: number } } }

function leer(): Local {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Local; } catch { return {}; }
}

export function marcaLocal(juego: string, fecha: string): { mejor: number; intentos: number } | null {
  return leer()[juego]?.[fecha] ?? null;
}

function anotarLocal(juego: string, fecha: string, puntaje: number): boolean {
  const todo = leer(), dias = (todo[juego] ??= {}), hoy = (dias[fecha] ??= { mejor: 0, intentos: 0 });
  const esMejor = hoy.intentos === 0 || puntaje > hoy.mejor;
  hoy.intentos++;
  if (esMejor) hoy.mejor = puntaje;
  // Solo se conservan los últimos días, para no llenar el almacenamiento
  for (const vieja of Object.keys(dias).sort().slice(0, -14)) delete dias[vieja];
  try { localStorage.setItem(CLAVE, JSON.stringify(todo)); } catch { /* sin almacenamiento */ }
  return esMejor;
}

export type Guardado = 'nube' | 'local' | 'sin-sesion';

/** Anota la marca. Devuelve dónde quedó y si fue la mejor del día en este navegador. */
export async function guardarMarca(juego: string, fecha: string, puntaje: number, detalle: Record<string, unknown>, usuarioId: string | null): Promise<{ donde: Guardado; esMejor: boolean }> {
  const esMejor = anotarLocal(juego, fecha, puntaje);
  if (!usuarioId) return { donde: 'sin-sesion', esMejor };
  // La fecha y el dueño los pone el servidor: desde aquí solo viajan el juego, el puntaje y el resumen
  const { error } = await supabase.from('marcas').insert({ juego, puntaje, detalle });
  return { donde: error ? 'local' : 'nube', esMejor };
}

export interface Fila { perfil: string; nombre: string; puntaje: number }
export interface MarcaSuelta { id: number; perfil: string; nombre: string; juego: string; puntaje: number; detalle: unknown }

/** Las marcas más altas de un día (todas, no solo la mejor de cada persona), para que el organizador revise. */
export async function marcasDelDia(fecha: string, juego: string): Promise<MarcaSuelta[]> {
  let consulta = supabase.from('marcas').select('id,perfil_id,juego,puntaje,detalle,perfiles(nombre)').eq('fecha', fecha).order('puntaje', { ascending: false }).limit(200);
  if (juego) consulta = consulta.eq('juego', juego);
  const { data } = await consulta;
  return (data ?? []).map((f) => {
    const rel = f.perfiles as unknown as { nombre: string } | { nombre: string }[] | null;
    return { id: f.id as number, perfil: f.perfil_id as string, nombre: (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre) ?? 'Participante', juego: f.juego as string, puntaje: f.puntaje as number, detalle: f.detalle };
  });
}

export async function borrarMarca(id: number): Promise<string | null> {
  const { error } = await supabase.from('marcas').delete().eq('id', id);
  return error?.message ?? null;
}

/** Mejor marca de cada persona en un juego y un día, de mayor a menor. `disponible` es falso si la tabla aún no existe. */
export async function tablaDelDia(juego: string, fecha: string): Promise<{ filas: Fila[]; disponible: boolean }> {
  const { data, error } = await supabase.from('marcas').select('perfil_id,puntaje,perfiles(nombre)').eq('juego', juego).eq('fecha', fecha).order('puntaje', { ascending: false }).limit(400);
  if (error || !data) return { filas: [], disponible: false };
  const vistos = new Set<string>(), filas: Fila[] = [];
  for (const f of data) {
    const perfil = f.perfil_id as string;
    if (vistos.has(perfil)) continue;
    vistos.add(perfil);
    const rel = f.perfiles as unknown as { nombre: string } | { nombre: string }[] | null;
    filas.push({ perfil, nombre: (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre) ?? 'Participante', puntaje: f.puntaje as number });
  }
  return { filas, disponible: true };
}
