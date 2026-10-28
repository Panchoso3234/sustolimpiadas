import { useEffect, useState } from 'preact/hooks';
import { supabase, useSesion } from '../nucleo/supabase';
import type { Persona } from './duelos';
import { burbuja, useVitrinasGacha } from '../gacha/cosmeticos';

// Declaraciones antes del duelo: cada jugador deja una frase (140 caracteres) que ve su rival y cita La Cuarta.
// Se puede cambiar hasta empezar a jugar; la base lo comprueba (función declarar). La organización puede ocultarlas.

interface Frase { perfil_id: string; texto: string; oculta: boolean }
const MAX = 140;

export function Declaraciones({ enf, a, b, personas, editable, titulo }: { enf: number; a: string | null; b: string | null; personas: Persona[]; editable: boolean; titulo?: string }) {
  const sesion = useSesion(), yo = sesion.usuarioId, admin = sesion.perfil?.rol === 'admin';
  const vit = useVitrinasGacha();
  const [frases, setFrases] = useState<Frase[] | null>(null), [borrador, setBorrador] = useState(''), [aviso, setAviso] = useState(''), [editando, setEditando] = useState(false);
  const cargar = () => supabase.from('declaraciones').select('perfil_id,texto,oculta').eq('enfrentamiento_id', enf).then(({ data, error }) => setFrases(error ? null : ((data as Frase[] | null) ?? [])));
  useEffect(() => { cargar(); }, [enf, yo]);
  if (frases === null) return null; // la tabla todavía no existe
  const nombre = (id: string) => personas.find((p) => p.id === id)?.nombre ?? 'Participante';
  const mia = frases.find((f) => f.perfil_id === yo), soyParte = yo === a || yo === b;
  const guardar = async (texto: string) => {
    const { data, error } = await supabase.rpc('declarar', { p_enf: enf, p_texto: texto });
    if (error || data) return setAviso(error?.message ?? String(data));
    setAviso(''); setEditando(false); cargar();
  };
  const ocultar = async (f: Frase) => { await supabase.rpc('ocultar_declaracion', { p_enf: enf, p_perfil: f.perfil_id, p_oculta: !f.oculta }); cargar(); };
  const otras = frases.filter((f) => f.perfil_id !== yo || !editable);

  return (
    <div class="declaraciones">
      {titulo && otras.length > 0 && <h2>{titulo}</h2>}
      {otras.map((f) => (
        <p key={f.perfil_id} class={`declaracion${f.oculta ? ' oculta' : ''}${burbuja(vit.get(f.perfil_id)).class}`} style={burbuja(vit.get(f.perfil_id)).style}>
          <b>{nombre(f.perfil_id)}{f.perfil_id === yo ? ' (tú)' : ''}:</b> «{f.texto}»{f.oculta && <span class="tenue chico"> (oculta por la organización)</span>}
          {admin && <button class="boton chico" onClick={() => ocultar(f)}>{f.oculta ? 'Mostrar' : 'Ocultar'}</button>}
        </p>
      ))}
      {editable && soyParte && (editando || !mia ? (
        <form class="declarar" onSubmit={(ev) => { ev.preventDefault(); guardar(borrador); }}>
          <label class="chico" for={`decl-${enf}`}>Tu declaración antes del duelo (la ve tu rival y la puede citar La Cuarta)</label>
          <div class="fila">
            <input id={`decl-${enf}`} maxLength={MAX} value={borrador} placeholder="Ej.: Este juego es mío." onInput={(ev) => setBorrador((ev.target as HTMLInputElement).value)} />
            <span class="tenue chico">{MAX - borrador.length}</span>
            <button class="boton principal" disabled={!borrador.trim()}>Declarar</button>
            {mia && <button type="button" class="boton" onClick={() => setEditando(false)}>Cancelar</button>}
          </div>
        </form>
      ) : (
        <p class="declaracion mia">
          <b>Tú:</b> «{mia.texto}»{mia.oculta && <span class="tenue chico"> (oculta por la organización)</span>}
          <button class="boton chico" onClick={() => { setBorrador(mia.texto); setEditando(true); }}>Cambiar</button>
          <button class="boton chico" onClick={() => guardar('')}>Borrar</button>
        </p>
      ))}
      {aviso && <p class="aviso atencion chico">{aviso}</p>}
    </div>
  );
}
