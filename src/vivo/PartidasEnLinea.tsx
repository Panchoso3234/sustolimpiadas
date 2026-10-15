import { useEffect, useState } from 'preact/hooks';
import { escucharSalas, type InfoSala } from './vestibulo';
import { NOMBRES_VIVO } from './PantallaVivo';

// Partidas en línea: todas las salas en vivo abiertas, para mirarlas (o sumarse si falta un rival en un amistoso).
const ESTADO: Record<InfoSala['estado'], string> = { esperando: 'Esperando rival', jugando: 'Jugando', terminada: 'Terminada' };

export function PartidasEnLinea() {
  const [salas, setSalas] = useState<InfoSala[] | null>(null);
  useEffect(() => escucharSalas(setSalas), []);
  return (
    <>
      <h1>Partidas en línea</h1>
      <p>Las partidas en vivo que se están jugando ahora. Entra a mirar: el ojo 👁 cuenta cuántas personas están mirando.</p>
      {!salas ? <p class="tenue">Buscando partidas…</p> : !salas.length ? <p class="tenue">No hay partidas en este momento. Crea una en la pestaña En vivo.</p> : (
        <div class="rejilla-juegos">
          {salas.map((s) => (
            <div key={s.codigo} class="tarjeta partida-en-linea" data-codigo={s.codigo} style="--tono:#4fd1ff">
              <img class="foto" src={`${import.meta.env.BASE_URL}juegos/${s.juego}.png`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <span class="vivo-ojo partida-ojo">👁 {s.espectadores}</span>
              <h3>{NOMBRES_VIVO[s.juego] ?? s.juego}</h3>
              <p><b>{s.a || '¿?'}</b> vs <b>{s.b || '¿?'}</b>{s.oficial ? ' · oficial' : ' · amistoso'}</p>
              <span class="pie">
                <span class="premia">{s.estado === 'jugando' && s.turno ? `Turno de ${s.turno}` : ESTADO[s.estado]}</span>
                <span class="fila">
                  {s.estado === 'esperando' && !s.oficial && <a class="estado" href={`#/juegos/vivo/${s.codigo}`}>Jugar</a>}
                  <a class="estado" href={`#/juegos/mirar/${s.codigo}`}>Mirar</a>
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
