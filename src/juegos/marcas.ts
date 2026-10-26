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

type Historial = Record<string, { puntaje: number; hora: number }[]>;
/** Las últimas 5 partidas de un juego en este navegador (la más nueva al final), para ver si vas mejorando. */
export function historial(juego: string): { puntaje: number; hora: number }[] {
  try { return (JSON.parse(localStorage.getItem('susto.historial') ?? '{}') as Historial)[juego] ?? []; } catch { return []; }
}
function anotarHistorial(juego: string, puntaje: number) {
  try {
    const todo = JSON.parse(localStorage.getItem('susto.historial') ?? '{}') as Historial;
    todo[juego] = [...(todo[juego] ?? []), { puntaje, hora: Date.now() }].slice(-5);
    localStorage.setItem('susto.historial', JSON.stringify(todo));
  } catch { /* sin almacenamiento */ }
}

export type Guardado ='nube' | 'local' | 'sin-sesion';

/** Anota la marca. Devuelve dónde quedó y si fue la mejor del día en este navegador. */
export async function guardarMarca(juego: string, fecha: string, puntaje: number, detalle: Record<string, unknown>, usuarioId: string | null): Promise<{ donde: Guardado; esMejor: boolean }> {
  const esMejor = anotarLocal(juego, fecha, puntaje);
  anotarHistorial(juego, puntaje);
  if (!usuarioId) return { donde: 'sin-sesion', esMejor };
  // La fecha y el dueño los pone el servidor: desde aquí solo viajan el juego, el puntaje y el resumen
  const { error } = await supabase.from('marcas').insert({ juego, puntaje, detalle });
  records.delete(juego); // los récords se vuelven a pedir con la marca nueva
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

const records = new Map<string, { hora: number; filas: Promise<Fila[]> }>();
let todos: { hora: number; mapa: Promise<Map<string, Fila[]> | null> } | null = null;

/** Los top 3 de todos los juegos en una sola consulta (supabase/2026-10-25-records.sql). Null si falta ese SQL. */
function todosLosRecords(): Promise<Map<string, Fila[]> | null> {
  if (todos && Date.now() - todos.hora < 60_000) return todos.mapa;
  const mapa = Promise.resolve(supabase.rpc('records_top', { p_topes: SIN_TOPES })).then(({ data, error }) => {
    if (error || !Array.isArray(data)) return null;
    const m = new Map<string, Fila[]>();
    for (const f of data as { juego: string; perfil: string; nombre: string; puntaje: number }[]) {
      const lista = m.get(f.juego) ?? [];
      lista.push({ perfil: f.perfil, nombre: f.nombre ?? 'Participante', puntaje: f.puntaje });
      m.set(f.juego, lista);
    }
    for (const lista of m.values()) lista.sort((a, b) => b.puntaje - a.puntaje);
    return m;
  }, () => null);
  todos = { hora: Date.now(), mapa };
  return mapa;
}

/** Récords históricos de un juego: la mejor marca de siempre de las 3 mejores personas (se recuerda un minuto). */
export async function recordsDelJuego(juego: string): Promise<Fila[]> {
  const mapa = await todosLosRecords();
  if (mapa) return mapa.get(juego) ?? [];
  return recordsSueltos(juego);
}

/** Respaldo mientras no exista la función de récords: una consulta por juego. */
function recordsSueltos(juego: string): Promise<Fila[]> {
  const guardado = records.get(juego);
  if (guardado && Date.now() - guardado.hora < 60_000) return guardado.filas;
  const consulta = supabase.from('marcas').select('perfil_id,puntaje,perfiles(nombre)').eq('juego', juego);
  const filas = Promise.resolve(consulta.order('puntaje', { ascending: false }).limit(500)
    .then(({ data }) => {
      const vistos = new Set<string>(), mejores: Fila[] = [];
      for (const f of data ?? []) {
        const perfil = f.perfil_id as string;
        if (vistos.has(perfil)) continue;
        vistos.add(perfil);
        const rel = f.perfiles as unknown as { nombre: string } | { nombre: string }[] | null;
        mejores.push({ perfil, nombre: (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre) ?? 'Participante', puntaje: f.puntaje as number });
        if (mejores.length === 3) break;
      }
      return mejores;
    }, () => [] as Fila[]));
  records.set(juego, { hora: Date.now(), filas });
  return filas;
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

// Ya no hay partidas dudosas (26-10): se manda un objeto vacío para que las funciones de la base no descarten nada,
// aunque todavía no se haya pegado el SQL que deja vacío topes_dudosos()
const SIN_TOPES = {};

/** Top 3 de cada juego desde una fecha (hoy, esta semana). Null si falta 2026-10-25-records-copa.sql. */
export async function recordsDesde(desde: string): Promise<Map<string, Fila[]> | null> {
  const { data, error } = await supabase.rpc('records_periodo', { p_desde: desde, p_topes: SIN_TOPES });
  if (error || !Array.isArray(data)) return null;
  const m = new Map<string, Fila[]>();
  for (const f of data as { juego: string; perfil: string; nombre: string; puntaje: number }[]) m.set(f.juego, [...(m.get(f.juego) ?? []), { perfil: f.perfil, nombre: f.nombre ?? 'Participante', puntaje: f.puntaje }]);
  for (const lista of m.values()) lista.sort((a, b) => b.puntaje - a.puntaje);
  return m;
}
/** Todos los récords de siempre (top 3 de cada juego), o null si falta el SQL de récords. */
export const recordsDeSiempre = () => todosLosRecords();

/** Copa Individual (aparte del torneo): puntos por puesto de cada día y juego, sumados entre dos fechas. Null si falta el SQL. */
export interface FilaCopa { perfil: string; nombre: string; puntos: number; primeros: number; podios: number; partidas: number }
export async function copaIndividual(desde: string, hasta: string): Promise<FilaCopa[] | null> {
  const { data, error } = await supabase.rpc('copa_individual', { p_desde: desde, p_hasta: hasta, p_topes: SIN_TOPES });
  if (error || !Array.isArray(data)) return null;
  return (data as FilaCopa[]).map((f) => ({ ...f, nombre: f.nombre ?? 'Participante', puntos: Number(f.puntos) }));
}

/** Récords de versus que necesitan las rondas: mejor ronda de cada juego y remontadas. Null si falta el SQL. */
export interface RecordVersus { tipo: 'mejor_ronda' | 'remontadas'; juego: string | null; perfil: string; nombre: string; valor: number; enfrentamiento: number | null }
export async function recordsVersus(): Promise<RecordVersus[] | null> {
  const { data, error } = await supabase.rpc('records_versus', { p_topes: SIN_TOPES });
  return error || !Array.isArray(data) ? null : (data as RecordVersus[]);
}

/** Mi mejor marca de siempre en cada juego. */
export async function misMejores(perfil: string): Promise<Map<string, number>> {
  const { data } = await supabase.from('marcas').select('juego,puntaje').eq('perfil_id', perfil).order('puntaje', { ascending: false }).limit(3000);
  const m = new Map<string, number>();
  for (const f of data ?? []) { const j = f.juego as string; if (!m.has(j)) m.set(j, f.puntaje as number); }
  return m;
}
