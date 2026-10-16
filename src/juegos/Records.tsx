import { useEffect, useState } from 'preact/hooks';
import { Carita } from '../personaje/Carita';
import { recordsDelJuego, type Fila } from './marcas';

const MEDALLAS = ['🥇', '🥈', '🥉'];

/** Top 3 histórico de un juego: la mejor marca de siempre de cada persona, con su personaje y su nombre. */
export function Records({ juego, unidad, compacto = false, version = 0 }: { juego: string; unidad?: string; compacto?: boolean; version?: number }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  useEffect(() => {
    let vigente = true;
    recordsDelJuego(juego).then((f) => { if (vigente) setFilas(f); });
    return () => { vigente = false; };
  }, [juego, version]);
  if (!filas) return <p class="records-vacio tenue chico">{compacto ? ' ' : 'Cargando récords…'}</p>;
  if (!filas.length) return <p class="records-vacio tenue chico">Sin récords todavía: el primero es tuyo.</p>;
  return (
    <ol class={`records${compacto ? ' compacto' : ''}`} aria-label="Récords históricos">
      {filas.map((f, i) => (
        <li key={f.perfil}>
          <span class="medalla" aria-label={`Puesto ${i + 1}`}>{MEDALLAS[i]}</span>
          <Carita perfil={f.perfil} tam={compacto ? 24 : 32} />
          {compacto ? <span class="quien">{f.nombre}</span> : <a class="quien" href={`#/perfil/${f.perfil}`}>{f.nombre}</a>}
          <b>{f.puntaje}{!compacto && unidad ? ` ${unidad}` : ''}</b>
        </li>
      ))}
    </ol>
  );
}
