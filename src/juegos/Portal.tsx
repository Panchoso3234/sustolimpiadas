import { useEffect, useState } from 'preact/hooks';
import { fechaChile } from '../nucleo/azar';
import { useSesion } from '../nucleo/supabase';
import { JUEGOS, MOTORES, ORDEN_MOTORES, juegoPorId, type Juego } from './catalogo';
import * as V from './duelos';
import { marcaLocal } from './marcas';
import { alternarFavorito, favoritos } from '../nucleo/preferencias';
import { Duelo, PestanaVersus, seJuegaEnVivo } from './PantallaVersus';
import { CARGADORES } from './marco';
import { Posiciones } from './Posiciones';
import { Records } from './Records';
import { Sala } from './Sala';
import { Vivo } from '../vivo/PantallaVivo';
import { PartidasEnLinea } from '../vivo/PartidasEnLinea';

// Portal de juegos: individual, versus en diferido, en vivo (1v1 y 3v3), partidas en línea y la tabla del torneo.
// La meta es que todo enfrentamiento sea en vivo; el diferido queda para cuando los dos no pueden a la misma hora.
const MODOS = [
  { ruta: '', titulo: 'Individual', bajada: 'Marcas del día' },
  { ruta: '1v1', titulo: 'Versus 1v1 (Diferido)', bajada: 'Si no pueden a la vez' },
  { ruta: 'vivo', titulo: 'En vivo', bajada: '1v1 y 3v3, conectados' },
  { ruta: 'en-linea', titulo: 'Partidas en línea', bajada: 'Mirar en directo' },
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
        // Los que se juegan en vivo se avisan en la pestaña En vivo
        const pestana = seJuegaEnVivo(e) ? 'vivo' : e.modo;
        if (hechas < (e.modo === '1v1' ? e.rondas : 1)) nueva[pestana] = (nueva[pestana] ?? 0) + 1;
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
  const modo = sub === '3v3' || MODOS.some((m) => m.ruta === sub) ? sub : '';
  // El 3v3 vive dentro de la pestaña En vivo
  const pestana = modo === '3v3' ? 'vivo' : modo, cuenta = (r: string) => (r === 'vivo' ? (pendientes.vivo ?? 0) + (pendientes['3v3'] ?? 0) : pendientes[r]);
  return (
    <div class="pagina portal">
      <div class="sigla">Portal de juegos</div>
      <nav class="modos" aria-label="Modos de juego">
        {MODOS.map((m) => (
          <a key={m.ruta} href={`#/juegos${m.ruta ? `/${m.ruta}` : ''}`} class={pestana === m.ruta ? 'activa' : ''} aria-current={pestana === m.ruta ? 'page' : undefined}>
            <b>{m.titulo}{cuenta(m.ruta) ? <i class="globo" aria-label={`${cuenta(m.ruta)} por jugar`}>{cuenta(m.ruta)}</i> : null}</b><span>{m.bajada}</span>
          </a>
        ))}
      </nav>
      {pestana === 'vivo' && !extra && (
        <nav class="modos sub-modos" aria-label="En vivo">
          <a href="#/juegos/vivo" class={modo === 'vivo' ? 'activa' : ''} aria-current={modo === 'vivo' ? 'page' : undefined}><b>1v1</b></a>
          <a href="#/juegos/3v3" class={modo === '3v3' ? 'activa' : ''} aria-current={modo === '3v3' ? 'page' : undefined}><b>3v3</b></a>
        </nav>
      )}
      {modo === '' ? <Grilla /> : modo === 'posiciones' ? <Posiciones /> : modo === 'vivo' ? <Vivo codigo={extra} /> : modo === 'en-linea' ? <PartidasEnLinea /> : <PestanaVersus key={modo} modo={modo as '1v1' | '3v3'} preset={extra} />}
    </div>
  );
}

const FILTROS = [['todos', 'Todos'], ['favoritos', 'Favoritos'], ['pendientes', 'Sin jugar hoy'], ['jugados', 'Jugados hoy']] as const;
type Filtro = (typeof FILTROS)[number][0];

// Al volver de un juego, el portal queda como estaba: mismo filtro, misma búsqueda y misma altura de la página
const RECUERDO = 'susto.portal';
const recuerdo = (): { filtro?: Filtro; buscar?: string; y?: number } => { try { return JSON.parse(sessionStorage.getItem(RECUERDO) ?? '{}'); } catch { return {}; } };
const recordar = (cambio: { filtro?: Filtro; buscar?: string; y?: number }) => { try { sessionStorage.setItem(RECUERDO, JSON.stringify({ ...recuerdo(), ...cambio })); } catch { /* sin almacenamiento */ } };
const desplazable = () => document.querySelector('main');

function Grilla() {
  const fecha = fechaChile(Date.now()), listos = JUEGOS.filter((j) => j.listo).length;
  const [favs, setFavs] = useState(favoritos);
  const [filtro, setFiltroCrudo] = useState<Filtro>(() => recuerdo().filtro ?? 'todos');
  const [buscar, setBuscarCrudo] = useState(() => recuerdo().buscar ?? '');
  const setFiltro = (f: Filtro) => { setFiltroCrudo(f); recordar({ filtro: f }); };
  const setBuscar = (b: string) => { setBuscarCrudo(b); recordar({ buscar: b }); };
  useEffect(() => {
    const y = recuerdo().y;
    if (y) requestAnimationFrame(() => desplazable()?.scrollTo(0, y));
  }, []);
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
      {juego.listo && <Records juego={juego.id} compacto />}
      <span class="pie">
        <span class="premia">{juego.premia}</span>
        <span class={`estado${marca ? ' hecho' : ''}`}>{juego.listo ? (marca ? `✓ Jugado hoy · ${marca.mejor}` : 'Jugar') : juego.soloVivo ? 'Solo en vivo' : 'Pronto'}</span>
      </span>
    </>
  );
  // Al apuntar o tocar la tarjeta el juego empieza a descargarse, para que abra más rápido
  const precargar = () => { CARGADORES[juego.id]?.().catch(() => undefined); };
  return juego.listo
    ? <a class="tarjeta" href={`#/juegos/${juego.id}`} onPointerEnter={precargar} onTouchStart={precargar} onClick={() => recordar({ y: desplazable()?.scrollTop ?? 0 })}>{dentro}</a>
    : <div class="tarjeta cerrada" aria-disabled="true">{dentro}</div>;
}
