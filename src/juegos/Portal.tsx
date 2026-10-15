import { useEffect, useState } from 'preact/hooks';
import { fechaChile } from '../nucleo/azar';
import { useSesion } from '../nucleo/supabase';
import { JUEGOS, MOTORES, ORDEN_MOTORES, juegoPorId, type Juego } from './catalogo';
import * as V from './duelos';
import { marcaLocal } from './marcas';
import { alternarFavorito, favoritos } from '../nucleo/preferencias';
import { Duelo, PestanaVersus } from './PantallaVersus';
import { Posiciones } from './Posiciones';
import { Sala } from './Sala';
import { Vivo } from '../vivo/PantallaVivo';

// Portal de juegos: tres modos (individual, versus 1v1 y versus 3v3) y la tabla del torneo. Cada juego se abre en su "sala".
const MODOS = [
  { ruta: '', titulo: 'Individual', bajada: 'Marcas del día' },
  { ruta: '1v1', titulo: 'Versus 1v1', bajada: 'Uno contra uno' },
  { ruta: '3v3', titulo: 'Versus 3v3', bajada: 'Equipo contra equipo' },
  { ruta: 'vivo', titulo: 'En vivo', bajada: 'Conectados a la vez' },
  { ruta: 'posiciones', titulo: 'Posiciones', bajada: 'Tabla del torneo' },
];

/** Cuántos enfrentamientos esperan a que esta persona juegue, por modo. */
function usePendientes(usuarioId: string | null): Record<string, number> {
  const [cuenta, setCuenta] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!usuarioId) return setCuenta({});
    let vigente = true;
    (async () => {
      const [equipos, { lista }] = await Promise.all([V.listarEquipos(), V.listarEnfrentamientos()]);
      const mios = lista.filter((e) => e.estado === 'pendiente' && V.ladoDe(e, usuarioId, equipos));
      const marcas = await V.marcasDe(mios.map((e) => e.id));
      const nueva: Record<string, number> = {};
      for (const e of mios) {
        const hechas = marcas.filter((m) => m.enfrentamiento_id === e.id && m.perfil_id === usuarioId && m.terminado).length;
        if (hechas < (e.modo === '1v1' ? e.rondas : 1)) nueva[e.modo] = (nueva[e.modo] ?? 0) + 1;
      }
      if (vigente) setCuenta(nueva);
    })();
    return () => { vigente = false; };
  }, [usuarioId]);
  return cuenta;
}

export function Portal({ sub, extra }: { sub: string; extra: string }) {
  const sesion = useSesion(), pendientes = usePendientes(sesion.usuarioId);
  if (sub === 'duelo') return <Duelo key={extra} id={Number(extra)} />;
  if (sub === 'mirar') return <div class="pagina portal"><Vivo codigo={extra} mirar /></div>;
  const juego = juegoPorId(sub);
  if (juego?.listo) return <Sala key={juego.id} juego={juego} />;
  const modo = MODOS.some((m) => m.ruta === sub) ? sub : '';
  return (
    <div class="pagina portal">
      <div class="sigla">Portal de juegos</div>
      <nav class="modos" aria-label="Modos de juego">
        {MODOS.map((m) => (
          <a key={m.ruta} href={`#/juegos${m.ruta ? `/${m.ruta}` : ''}`} class={modo === m.ruta ? 'activa' : ''} aria-current={modo === m.ruta ? 'page' : undefined}>
            <b>{m.titulo}{pendientes[m.ruta] ? <i class="globo" aria-label={`${pendientes[m.ruta]} por jugar`}>{pendientes[m.ruta]}</i> : null}</b><span>{m.bajada}</span>
          </a>
        ))}
      </nav>
      {modo === '' ? <Grilla /> : modo === 'posiciones' ? <Posiciones /> : modo === 'vivo' ? <Vivo codigo={extra} /> : <PestanaVersus key={modo} modo={modo as '1v1' | '3v3'} preset={extra} />}
    </div>
  );
}

const FILTROS = [['todos', 'Todos'], ['favoritos', 'Favoritos'], ['pendientes', 'Sin jugar hoy'], ['jugados', 'Jugados hoy']] as const;
type Filtro = (typeof FILTROS)[number][0];

function Grilla() {
  const fecha = fechaChile(Date.now()), listos = JUEGOS.filter((j) => j.listo).length;
  const [favs, setFavs] = useState(favoritos);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [buscar, setBuscar] = useState('');
  const texto = buscar.trim().toLowerCase();
  const pasa = (j: Juego) => (!texto || `${j.nombre} ${j.idea}`.toLowerCase().includes(texto))
    && (filtro === 'todos' || (filtro === 'favoritos' ? favs.includes(j.id) : j.listo && (filtro === 'jugados') === !!marcaLocal(j.id, fecha)));
  const visibles = JUEGOS.filter(pasa);
  return (
    <>
      <h1>Elige tu juego</h1>
      <p>Cada partida trae un desafío nuevo, así que no sirve memorizar. Juega las veces que quieras: vale tu mejor marca del día. Van {listos} de {JUEGOS.length} juegos abiertos.</p>
      <div class="filtros">
        <input class="texto" type="search" placeholder="Buscar un juego" aria-label="Buscar un juego" value={buscar} onInput={(e) => setBuscar(e.currentTarget.value)} />
        <div class="modos" role="group" aria-label="Filtrar juegos">
          {FILTROS.map(([id, nombre]) => <button key={id} class={filtro === id ? 'activa' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{nombre}</button>)}
        </div>
      </div>
      {!visibles.length && <p class="tenue">{filtro === 'favoritos' && !favs.length ? 'Todavía no marcas favoritos: toca la estrella ☆ de un juego.' : 'Ningún juego calza con el filtro.'}</p>}
      {ORDEN_MOTORES.filter((m) => visibles.some((j) => j.motor === m)).map((m) => (
        <section key={m} class="motor" style={`--tono:${MOTORES[m].color}`}>
          <h2>{MOTORES[m].nombre}</h2>
          <div class="rejilla-juegos">
            {visibles.filter((j) => j.motor === m).map((j) => <Tarjeta key={j.id} juego={j} fecha={fecha} favorito={favs.includes(j.id)} alternar={() => setFavs(alternarFavorito(j.id))} />)}
          </div>
        </section>
      ))}
    </>
  );
}

function Tarjeta({ juego, fecha, favorito, alternar }: { juego: Juego; fecha: string; favorito: boolean; alternar(): void }) {
  const marca = juego.listo ? marcaLocal(juego.id, fecha) : null;
  const dentro = (
    <>
      {/* La foto de cada juego se toma del propio juego; si falta, la tarjeta queda solo con texto */}
      {juego.listo && <img class="foto" src={`${import.meta.env.BASE_URL}juegos/${juego.id}.png`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <span class="numero">{String(juego.numero).padStart(2, '0')}</span>
      <button class={`estrella${favorito ? ' puesta' : ''}`} aria-pressed={favorito} aria-label={favorito ? 'Quitar de favoritos' : 'Marcar como favorito'} onClick={(e) => { e.preventDefault(); e.stopPropagation(); alternar(); }}>{favorito ? '★' : '☆'}</button>
      <h3>{juego.nombre}</h3>
      <p>{juego.idea}</p>
      <span class="pie">
        <span class="premia">{juego.premia}</span>
        <span class={`estado${marca ? ' hecho' : ''}`}>{juego.listo ? (marca ? `✓ Jugado hoy · ${marca.mejor}` : 'Jugar') : juego.soloVivo ? 'Solo en vivo' : 'Pronto'}</span>
      </span>
    </>
  );
  return juego.listo ? <a class="tarjeta" href={`#/juegos/${juego.id}`}>{dentro}</a> : <div class="tarjeta cerrada" aria-disabled="true">{dentro}</div>;
}
