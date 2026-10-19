import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../nucleo/supabase';

// Predicciones de los espectadores en un duelo en vivo: antes de que parta, quien mira apuesta calabazas ficticias
// a quién gana (las reglas y el saldo los lleva la base: ver supabase/etapa-2.sql). Los jugadores no pueden apostar.

export interface Lado { id: string; nombre: string }
const MONTOS = [10, 25, 50];

/** Identificador de un duelo en vivo: sala, día, número de partida y los dos jugadores (igual para todos los que miran). */
export const idPartidaVivo = (codigo: string, fecha: string, partida: number, ids: string[]) => `${codigo}|${fecha}|${partida}|${[...ids].sort().map((x) => x.slice(0, 8)).join('-')}`.slice(0, 120);

export function Prediccion({ partida, a, b, abierta, ganador, usuarioId }: { partida: string; a: Lado; b: Lado; abierta: boolean; ganador: string | null; usuarioId: string | null }) {
  const [saldo, setSaldo] = useState<number | null>(null), [mia, setMia] = useState<{ elegido: string; monto: number } | null>(null);
  const [monto, setMonto] = useState(10), [aviso, setAviso] = useState(''), [falta, setFalta] = useState(false);
  useEffect(() => {
    if (!usuarioId) return;
    supabase.rpc('saldo_calabazas', { p_uid: usuarioId }).then(({ data, error }) => { if (error) setFalta(true); else setSaldo(data as number); });
    supabase.from('predicciones').select('elegido,monto').eq('perfil_id', usuarioId).eq('partida', partida).maybeSingle().then(({ data }) => setMia(data as { elegido: string; monto: number } | null));
  }, [usuarioId, partida, ganador]);

  if (falta) return null; // la base todavía no tiene las predicciones activadas
  if (!usuarioId) return <div class="prediccion"><b>🔮 ¿Quién gana?</b><p class="chico tenue">Entra con Discord para predecir con calabazas.</p></div>;
  const predecir = async (elegido: Lado) => {
    const { data, error } = await supabase.rpc('predecir', { p_partida: partida, p_elegido: elegido.id, p_monto: monto });
    if (error || data) { setAviso(error ? 'No se pudo guardar tu predicción.' : String(data)); return; }
    setMia({ elegido: elegido.id, monto }); setAviso('');
    supabase.rpc('saldo_calabazas', { p_uid: usuarioId }).then(({ data: s }) => setSaldo(s as number));
  };
  const nombreDe = (id: string) => (id === a.id ? a.nombre : b.nombre);
  return (
    <div class="prediccion">
      <b>🔮 ¿Quién gana?</b>
      {saldo !== null && <span class="chico tenue"> Tienes {saldo} 🎃</span>}
      {ganador && mia ? (
        ganador === 'empate' ? <p>Empate: tus {mia.monto} 🎃 vuelven a ti.</p>
          : ganador === mia.elegido ? <p class="aviso ok">¡Acertaste! Ganas {mia.monto} 🎃 por apostar a {nombreDe(mia.elegido)}.</p>
          : <p class="aviso">Esta vez no: pierdes {mia.monto} 🎃. ¡La próxima!</p>
      ) : abierta ? (
        <>
          <div class="fila">
            {MONTOS.map((x) => <button key={x} class={`boton${monto === x ? ' principal' : ''}`} disabled={saldo !== null && saldo + (mia?.monto ?? 0) < x} onClick={() => setMonto(x)}>{x} 🎃</button>)}
          </div>
          <div class="fila">
            {[a, b].map((l, i) => <button key={l.id} class={`boton prediccion-${i ? 'rojo' : 'azul'}${mia?.elegido === l.id ? ' elegido' : ''}`} onClick={() => predecir(l)}>Gana {l.nombre}</button>)}
          </div>
          {mia && <p class="chico">Apostaste {mia.monto} 🎃 a <b>{nombreDe(mia.elegido)}</b>. Puedes cambiarla hasta que parta el duelo.</p>}
        </>
      ) : mia ? <p class="chico">Apostaste {mia.monto} 🎃 a <b>{nombreDe(mia.elegido)}</b>. ¡A mirar!</p>
        : <p class="chico tenue">Las predicciones se cerraron al partir el duelo.</p>}
      {aviso && <p class="aviso atencion">{aviso}</p>}
      <a class="chico" href="#/progreso/adivinos">Ver la tabla de adivinos</a>
    </div>
  );
}

/** Lo que hacen los jugadores: anotar el duelo al partir (cierra las predicciones) y anotar quién ganó al terminar. */
export const empezarVivo = (partida: string, juego: string, a: string, b: string) => { supabase.rpc('empezar_vivo', { p_partida: partida, p_juego: juego, p_a: a, p_b: b }).then(() => undefined, () => undefined); };
export const cerrarVivo = (partida: string, ganador: string) => { supabase.rpc('cerrar_vivo', { p_partida: partida, p_ganador: ganador }).then(() => undefined, () => undefined); };
