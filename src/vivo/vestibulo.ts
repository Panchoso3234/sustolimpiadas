import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../nucleo/supabase';

// El vestíbulo: un canal de presencia donde cada anfitrión anuncia su sala. Partidas en línea solo escucha.
// Son mensajes de presencia (el plan gratis permite 20 por segundo): se anuncia solo cuando algo cambia.

export interface InfoSala { codigo: string; juego: string; a: string; b: string; estado: 'esperando' | 'jugando' | 'terminada'; turno: string; espectadores: number; oficial: boolean; desde: number }
const CANAL = 'vivo:salas';

export function anunciarSala() {
  let canal: RealtimeChannel | null = null, ultimo = '', listo = false, pendiente: InfoSala | null = null;
  const enviar = () => { if (canal && listo) { if (pendiente) canal.track(pendiente); else canal.untrack(); } };
  return {
    poner(info: InfoSala | null) {
      // `desde` cambia en cada llamada: no cuenta para decidir si hay algo nuevo que anunciar
      const texto = JSON.stringify(info && { ...info, desde: 0 });
      if (texto === ultimo) return;
      ultimo = texto; pendiente = info;
      if (!canal && info) {
        canal = supabase.channel(CANAL, { config: { presence: { key: info.codigo } } });
        canal.subscribe((e) => { if (e === 'SUBSCRIBED') { listo = true; enviar(); } });
      } else enviar();
    },
    cerrar() { if (canal) { canal.untrack(); supabase.removeChannel(canal); } canal = null; listo = false; ultimo = ''; },
  };
}

export function escucharSalas(f: (lista: InfoSala[]) => void): () => void {
  const canal = supabase.channel(CANAL);
  canal.on('presence', { event: 'sync' }, () => {
    const estado = canal.presenceState<InfoSala>();
    // Si dos pestañas anuncian la misma sala (cambió el anfitrión), vale la más reciente
    const porSala = new Map<string, InfoSala>();
    for (const metas of Object.values(estado)) for (const m of metas) { const previa = porSala.get(m.codigo); if (!previa || m.desde > previa.desde) porSala.set(m.codigo, m); }
    f([...porSala.values()].sort((a, b) => (a.estado === 'jugando' ? 0 : 1) - (b.estado === 'jugando' ? 0 : 1) || b.espectadores - a.espectadores));
  });
  canal.subscribe();
  return () => { supabase.removeChannel(canal); };
}
