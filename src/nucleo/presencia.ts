import type { RealtimeChannel } from '@supabase/supabase-js';
import { juegoPorId } from '../juegos/catalogo';
import { supabase } from './supabase';

// Quién está conectado y qué hace, como la lista de miembros de Discord. Va por la presencia de Supabase Realtime
// (no se guarda nada en la base): cada pestaña con sesión anuncia su actividad y todos la ven al instante.

export interface Actividad { texto: string; /** Dónde se puede ir a ver (una sala en vivo, la ficha del juego). */ enlace?: string; juega?: boolean; desde: number }
export interface Conectado { id: string; nombre: string; estado: 'activo' | 'ausente'; actividad: Actividad }

// En desarrollo va por otro canal, para que las pruebas no aparezcan en el sitio publicado
const CANAL = import.meta.env.DEV ? 'conectados-dev' : 'conectados', AUSENTE_TRAS = 60_000;
let canal: RealtimeChannel | null = null, yo: { id: string; nombre: string } | null = null, listo = false;
let juego: Actividad | null = null, ausente = false, tAusente = 0, ultimo = '';
let lista: Conectado[] = [];
const oyentes = new Set<(l: Conectado[]) => void>();

/** Qué hace alguien según la página donde está. */
export function actividadDeRuta(hash: string): Omit<Actividad, 'desde'> {
  const [seccion = 'inicio', sub = '', extra = ''] = hash.replace(/^#\/?/, '').split('/');
  if (seccion === 'juegos') {
    if (sub === 'vivo' && extra) { const j = juegoPorId(extra.split('-')[0]); return { texto: j ? `En una sala en vivo de ${j.nombre}` : 'En un duelo en vivo', enlace: `#/juegos/mirar/${extra}` }; }
    if (sub === 'mirar') return { texto: 'Mirando un duelo en vivo', enlace: `#/juegos/mirar/${extra}` };
    if (sub === 'maquina') return { texto: `Jugando ${extra === 'balsas' ? 'Batalla de Balsas' : 'Cuatro Conchas'} contra la máquina` };
    const j = juegoPorId(sub);
    if (j) return { texto: `Viendo ${j.nombre}`, enlace: `#/juegos/${j.id}` };
    const textos: Record<string, string> = { '': 'En el portal de juegos', '1v1': 'Revisando sus duelos', vivo: 'En la sala de espera en vivo', '3v3': 'En la sala de espera en vivo', 'en-linea': 'Mirando partidas en línea', posiciones: 'Mirando la tabla oficial', calendario: 'Mirando el calendario', records: 'Mirando los récords', copa: 'Mirando la Copa Individual', duelo: 'Revisando un duelo' };
    return { texto: textos[sub] ?? 'En el portal de juegos' };
  }
  const textos: Record<string, string> = { inicio: 'En la portada', isla: 'Paseando por la isla', personaje: 'Arreglando su personaje', progreso: 'Mirando su progreso', arena: 'En la Arena', perfil: 'Viendo un perfil', ajustes: 'En los ajustes', admin: 'En la Mesa de control', modelos: 'En la galería' };
  return { texto: textos[seccion] ?? 'Dando una vuelta' };
}

let desdeRuta = Date.now(), rutaPrevia = '';
function anunciar() {
  if (!canal || !listo || !yo) return;
  const hash = location.hash;
  if (hash !== rutaPrevia) { rutaPrevia = hash; desdeRuta = Date.now(); }
  const actividad: Actividad = juego ?? { ...actividadDeRuta(hash), desde: desdeRuta };
  const datos = { id: yo.id, nombre: yo.nombre, estado: ausente ? 'ausente' : 'activo', actividad };
  const firma = JSON.stringify(datos);
  if (firma === ultimo) return;
  ultimo = firma;
  canal.track(datos);
}

function leer() {
  if (!canal) return;
  const estado = canal.presenceState<Conectado>(), porId = new Map<string, Conectado>();
  // Con varias pestañas abiertas vale la más "viva": jugando antes que activa, y activa antes que ausente
  const peso = (c: Conectado) => (c.estado === 'activo' ? 2 : 0) + (c.actividad?.juega ? 1 : 0);
  for (const metas of Object.values(estado)) for (const c of metas) {
    if (typeof c?.id !== 'string' || typeof c.nombre !== 'string' || !c.actividad) continue;
    const previo = porId.get(c.id);
    if (!previo || peso(c) > peso(previo)) porId.set(c.id, { id: c.id, nombre: c.nombre.slice(0, 40), estado: c.estado === 'ausente' ? 'ausente' : 'activo', actividad: { texto: String(c.actividad.texto).slice(0, 80), enlace: typeof c.actividad.enlace === 'string' && c.actividad.enlace.startsWith('#/') ? c.actividad.enlace : undefined, juega: !!c.actividad.juega, desde: Number(c.actividad.desde) || Date.now() } });
  }
  lista = [...porId.values()];
  for (const f of oyentes) f(lista);
}

function abrir() {
  if (canal) return;
  canal = supabase.channel(CANAL, { config: { presence: { key: yo?.id ?? `mira-${Math.random().toString(36).slice(2)}` } } });
  canal.on('presence', { event: 'sync' }, leer).subscribe((estado) => { if (estado === 'SUBSCRIBED') { listo = true; ultimo = ''; anunciar(); } });
}

/** Se llama cuando se sabe quién eres (o que no hay sesión: entonces solo se mira, sin aparecer). */
export function iniciarPresencia(quien: { id: string; nombre: string } | null) {
  // Solo en pruebas: ?como=<id de perfil>&nombre=… se hace pasar por esa persona en el canal de desarrollo
  const q = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
  if (q?.get('como')) quien = { id: q.get('como')!, nombre: q.get('nombre') ?? 'Prueba' };
  if (canal && (quien?.id ?? null) !== (yo?.id ?? null)) { supabase.removeChannel(canal); canal = null; listo = false; }
  yo = quien;
  abrir();
}

/** La sala avisa cuando empiezas o terminas una partida (null al salir). */
export function fijarJuego(a: Omit<Actividad, 'desde'> | null) {
  juego = a ? { ...a, juega: true, desde: Date.now() } : null;
  anunciar();
}

export function escucharConectados(f: (l: Conectado[]) => void): () => void {
  oyentes.add(f);
  f(lista);
  return () => { oyentes.delete(f); };
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => anunciar());
  // Ausente: la pestaña lleva un minuto en segundo plano
  document.addEventListener('visibilitychange', () => {
    clearTimeout(tAusente);
    if (document.hidden) tAusente = window.setTimeout(() => { ausente = true; anunciar(); }, AUSENTE_TRAS);
    else if (ausente) { ausente = false; anunciar(); }
  });
}
