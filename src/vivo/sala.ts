import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../nucleo/supabase';
import { repartir, type Presente, type Quiere } from './asientos';
import { crearEnlace } from './enlace';

// Sala en vivo: la presencia de Supabase dice quién está, quién está listo y quién quiere jugar o mirar.
// Los mensajes del juego van por el enlace directo (con respaldo por Supabase). No guarda nada en la base.

export type { Presente } from './asientos';
export interface Sala {
  clave: string;
  presentes(): Presente[];
  /** `para`: la clave de una sola pestaña (si no, a todos). */
  enviar(evento: string, datos: Record<string, unknown>, para?: string): void;
  /** Listo para esa partida (0 = ya no estoy listo). */
  marcarListo(partida: number): void;
  quiero(q: Quiere): void;
  directo(clave: string): boolean;
  salir(): void;
}

/** Una pestaña = una clave: así la misma persona puede volver y retomar su asiento. */
const pestana = (() => { try { const k = sessionStorage.getItem('susto.pestana') ?? Math.random().toString(36).slice(2, 10); sessionStorage.setItem('susto.pestana', k); return k; } catch { return Math.random().toString(36).slice(2, 10); } })();

export function unirse(codigo: string, yo: { id: string; nombre: string }, quiere: Quiere, alCambio: (p: Presente[]) => void, alMensaje: (evento: string, datos: Record<string, unknown>, de: string) => void, fijos: [string, string] | null = null): Sala {
  const clave = `${yo.id}:${pestana}`;
  // `desde` se recuerda por persona y sala: si recarga, conserva su lugar en la fila
  const memoria = `susto.vivo.desde.${codigo}.${yo.id}`;
  let desde = Date.now();
  try { desde = Number(localStorage.getItem(memoria)) || desde; localStorage.setItem(memoria, String(desde)); } catch { /* sin almacenamiento */ }
  let listo = 0, lista: Presente[] = [];
  const canal: RealtimeChannel = supabase.channel(`vivo:${codigo}`, { config: { presence: { key: clave }, broadcast: { self: false } } });
  const sinDirecto = import.meta.env.DEV && new URLSearchParams(location.search).has('sinDirecto');
  const enlace = crearEnlace(canal, clave, { sinDirecto });
  enlace.alRecibir((tipo, datos, de) => alMensaje(tipo, datos, de));

  const anunciar = () => canal.track({ id: yo.id, nombre: yo.nombre, desde, listo, quiere });
  canal.on('presence', { event: 'sync' }, () => {
    const estado = canal.presenceState<{ id: string; nombre: string; desde: number; listo: number; quiere: Quiere }>();
    lista = Object.entries(estado).flatMap(([k, metas]) => metas.map((m) => ({ clave: k, id: m.id, nombre: m.nombre, desde: m.desde, listo: Number(m.listo) || 0, quiere: m.quiere ?? 'jugar' })));
    enlace.actualizar(lista.map((p) => p.clave), repartir(lista, null, fijos).anfitrion);
    alCambio(lista);
  });
  canal.subscribe((estado) => { if (estado === 'SUBSCRIBED') { anunciar(); enlace.saludar(); } });

  const sala: Sala = {
    clave,
    presentes: () => lista,
    enviar(evento, datos, para) { enlace.enviar(evento, datos, para); },
    marcarListo(partida) { listo = partida; anunciar(); },
    quiero(q) { quiere = q; anunciar(); },
    directo: enlace.directo,
    salir() { enlace.cerrar(); canal.untrack(); supabase.removeChannel(canal); },
  };
  // Solo en pruebas: el banco de pruebas mide conexiones y mensajes
  if (import.meta.env.DEV) {
    const recibidos: string[] = [];
    enlace.alRecibir((tipo, datos) => { if (tipo === 'prueba') recibidos.push(String(datos.texto)); });
    (window as unknown as Record<string, unknown>).__sala = { directos: () => lista.filter((p) => enlace.directo(p.clave)).length, presentes: () => lista.length, recibidos, enviarPrueba: (texto: string) => enlace.enviar('prueba', { texto }), enviarCrudo: (tipo: string, datos: Record<string, unknown>) => enlace.enviar(tipo, datos), senales: () => enlace.senales(), cortar: () => enlace.cortar(), esAnfitrion: () => repartir(lista, null, fijos).anfitrion === clave, depurar: () => ({ yo: clave, ...enlace.depurar(), presentes: lista.map((p) => p.clave) }) };
  }
  return sala;
}

/** Código corto y legible para compartir (sin letras que se confunden). */
export function nuevoCodigo(juego: string): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `${juego}-${Array.from({ length: 4 }, () => letras[Math.floor(Math.random() * letras.length)]).join('')}`;
}
