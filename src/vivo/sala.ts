import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../nucleo/supabase';

// Sala en vivo sobre Supabase Realtime: presencia (quién está, quién está listo) y mensajes entre navegadores.
// No guarda nada en la base: el estado de cada partida se arma con los mensajes y cada navegador lo respalda en el suyo.

export interface Presente { clave: string; id: string; nombre: string; desde: number; listo: boolean }
export interface Sala {
  /** Quiénes están conectados ahora, en orden de llegada. Los dos primeros son los jugadores; el resto mira. */
  presentes(): Presente[];
  enviar(evento: string, datos: Record<string, unknown>): void;
  marcarListo(si: boolean): void;
  salir(): void;
}

/** Una pestaña = una clave: así la misma persona puede volver y retomar su asiento. */
const pestana = (() => { try { const k = sessionStorage.getItem('susto.pestana') ?? Math.random().toString(36).slice(2, 10); sessionStorage.setItem('susto.pestana', k); return k; } catch { return Math.random().toString(36).slice(2, 10); } })();

export function unirse(codigo: string, yo: { id: string; nombre: string }, alCambio: (p: Presente[]) => void, alMensaje: (evento: string, datos: Record<string, unknown>) => void): Sala {
  const clave = `${yo.id}:${pestana}`;
  // `desde` se recuerda por persona y sala: si recarga, conserva su lugar en la fila
  const memoria = `susto.vivo.desde.${codigo}.${yo.id}`;
  let desde = Date.now();
  try { desde = Number(localStorage.getItem(memoria)) || desde; localStorage.setItem(memoria, String(desde)); } catch { /* sin almacenamiento */ }
  let listo = false, lista: Presente[] = [];
  const canal: RealtimeChannel = supabase.channel(`vivo:${codigo}`, { config: { presence: { key: clave }, broadcast: { self: false } } });

  const anunciar = () => canal.track({ id: yo.id, nombre: yo.nombre, desde, listo });
  canal.on('presence', { event: 'sync' }, () => {
    const estado = canal.presenceState<{ id: string; nombre: string; desde: number; listo: boolean }>();
    const vistos = new Map<string, Presente>();
    // Una persona con dos pestañas cuenta una vez (la que llegó primero)
    for (const [k, metas] of Object.entries(estado)) for (const m of metas) {
      const previo = vistos.get(m.id);
      if (!previo || m.desde < previo.desde) vistos.set(m.id, { clave: k, id: m.id, nombre: m.nombre, desde: m.desde, listo: m.listo });
    }
    lista = [...vistos.values()].sort((a, b) => a.desde - b.desde);
    alCambio(lista);
  });
  canal.on('broadcast', { event: '*' }, ({ event, payload }) => alMensaje(event, (payload ?? {}) as Record<string, unknown>));
  canal.subscribe((estado) => { if (estado === 'SUBSCRIBED') anunciar(); });

  return {
    presentes: () => lista,
    enviar(evento, datos) { canal.send({ type: 'broadcast', event: evento, payload: datos }); },
    marcarListo(si) { listo = si; anunciar(); },
    salir() { canal.untrack(); supabase.removeChannel(canal); },
  };
}

/** Código corto y legible para compartir (sin letras que se confunden). */
export function nuevoCodigo(juego: string): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `${juego}-${Array.from({ length: 4 }, () => letras[Math.floor(Math.random() * letras.length)]).join('')}`;
}
