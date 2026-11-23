import { useEffect, useState } from 'preact/hooks';
import { supabase, useSesion } from '../nucleo/supabase';
import * as V from '../juegos/duelos';
import { EQUIPOS_A_LA_FINAL, INDIVIDUALES_FINAL, calcularLiga, type LineaJugador } from '../juegos/liga';
import { PUNTOS_BASE, leerPuntos } from '../juegos/puntos';
import { listarAjustesCartas } from '../juegos/wcDatos';
import { Gala } from './Gala';
import { Tsukibet } from './Tsukibet';
import { AVATAR_MANUAL } from './foto';
import './fasefinal.css';

// FASE FINAL (ex «Arena», decisión del 19-11): gala simulada el lunes 23-11 a las 21:00. El nombre lo ven todos;
// el panel de la gala, solo la organización. El público ve los tributos, las reglas y TSUKIBET (desde el 23-11).
// Plan completo: vault, «02 Proyectos/TORNEO VALE Y RIGO/Fase Final - planificación.md».

export function FaseFinal() {
  const sesion = useSesion();
  const rol = sesion.perfil?.rol;
  // Solo en desarrollo: ?ffprueba muestra el panel con tributos inventados (para probar sin iniciar sesión)
  if (import.meta.env.DEV && location.search.includes('ffprueba')) return <div class="pagina pagina-ancha arena"><Gala /></div>;
  if (sesion.cargando) return <div class="pagina arena"><p class="tenue">Cargando…</p></div>;
  if (rol !== 'admin' && rol !== 'guardian') return <VistaPublica />;
  return <VistaStaff rolAdmin={rol === 'admin'} />;
}

/** La liga ya cerró: quiénes clasificaron (tabla oficial en vivo; los reemplazos de las 18:00 se ven solos). */
function useTributos() {
  const [personal, setPersonal] = useState<LineaJugador[] | null>(null);
  const [avatares, setAvatares] = useState<Map<string, string | null>>(new Map());
  const [orden, setOrden] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const [equipos, personas, { lista }, puntos, ausencias, cartas, perfiles] = await Promise.all([V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos('1v1'), leerPuntos().catch(() => PUNTOS_BASE), V.listarAusencias(), listarAjustesCartas(), supabase.from('perfiles').select('id,avatar_url')]);
      const liga = calcularLiga(equipos, personas, lista, puntos, ausencias, cartas);
      setPersonal(liga.personal); setOrden(liga.tabla.map((l) => l.equipo.nombre));
      setAvatares(new Map(((perfiles.data ?? []) as { id: string; avatar_url: string | null }[]).map((p) => [p.id, p.avatar_url])));
    })();
  }, []);
  return { personal, avatares, orden };
}

function Foto({ id, nombre, avatares }: { id: string; nombre: string; avatares: Map<string, string | null> }) {
  const [roto, setRoto] = useState(false);
  const src = AVATAR_MANUAL[id] ?? avatares.get(id) ?? null;
  return src && !roto ? <img class="ffp-foto" src={src} alt="" loading="lazy" onError={() => setRoto(true)} /> : <span class="ffp-foto ffp-inicial" aria-hidden="true">{[...nombre.replace(/[^\p{L}\p{N}]/gu, '')][0] ?? '?'}</span>;
}

function VistaPublica() {
  const { personal, avatares, orden } = useTributos();
  const tributos = (personal ?? []).filter((j) => j.clasifica);
  const porEquipo = new Map<string, LineaJugador[]>();
  for (const j of tributos.filter((x) => x.clasifica === 'equipo')) porEquipo.set(j.equipo?.nombre ?? '—', [...(porEquipo.get(j.equipo?.nombre ?? '—') ?? []), j]);
  const especiales = tributos.filter((j) => j.clasifica === 'especial');
  const tarjeta = (j: LineaJugador) => <li key={j.id}><Foto id={j.id} nombre={j.nombre} avatares={avatares} /><b>{j.nombre}</b><span class="tenue chico">{j.puntos.toLocaleString('es-CL')} pts</span></li>;
  return (
    <div class="pagina pagina-ancha arena">
      <div class="sigla">Fase 2</div>
      <h1>FASE FINAL</h1>
      <p class="ffp-titular">La gala es el <b>lunes 23 de noviembre a las 21:00</b>, en vivo por Discord.</p>
      <p>Son <b>6 simulaciones</b>, todos contra todos. Quien gana una sale de las siguientes, así que habrá 6 ganadores distintos. Premios: la 1.ª da comisión de dibujo + bendición lunar; las otras 5, bendición lunar.</p>
      <h2>Los {tributos.length || ''} tributos</h2>
      {!personal ? <p class="tenue">Cargando…</p> : <>
        <p class="tenue chico">Por su equipo: los integrantes (sin staff) de los {EQUIPOS_A_LA_FINAL} mejores equipos de la tabla. Cupo especial: los {INDIVIDUALES_FINAL} mejores puntajes personales del resto.</p>
        <div class="ffp-equipos">
          {[...porEquipo].sort(([a], [b]) => orden.indexOf(a) - orden.indexOf(b)).map(([equipo, js], i) => <section key={equipo} class="ffp-equipo"><h3><span class="tenue">{i + 1}.º</span> {equipo}</h3><ul>{js.map(tarjeta)}</ul></section>)}
          {especiales.length > 0 && <section class="ffp-equipo ffp-especial"><h3>Cupo especial</h3><ul>{especiales.map(tarjeta)}</ul></section>}
        </div>
      </>}
      <p class="aviso">Si eres tributo y no puedes estar, avisa <b>antes de las 18:00</b>: entra el siguiente mejor puntaje personal.</p>
      <h2>Cómo jugar TSUKIBET</h2>
      <ul class="ffp-reglas">
        <li><b>Pronóstico gratis:</b> ganador (10 puntos), primer caído (5), 3 que sobreviven al baño de sangre (1 por acierto) y top 3 (3). Suma para el ranking del público.</li>
        <li><b>Apuesta (opcional):</b> de 10 a 320 protogemas por simulación. Si aciertas, cobras lo apostado por la cuota (el ×). Cuota alta = menos probable.</li>
        <li><b>Paracaídas en vivo:</b> entre el Día 1 y la Noche 3 ayuda a tu favorito desde la etapa siguiente: normal (160) o fuerte (320). 1 por simulación y 3 en la noche.</li>
        <li>Todo cierra cuando empieza cada simulación. Los tributos pueden pronosticar, pero no apostar ni mandar paracaídas.</li>
      </ul>
      <Tsukibet />
    </div>
  );
}

/** Lo que ve el staff mientras se construye: quiénes clasificarían hoy. */
function VistaStaff({ rolAdmin }: { rolAdmin: boolean }) {
  const { personal } = useTributos();
  const tributos = (personal ?? []).filter((j) => j.clasifica);
  return (
    <div class="pagina pagina-ancha arena">
      <div class="sigla">Fase 2 · vista del staff</div>
      <h1>FASE FINAL</h1>
      <p class="aviso">Solo la organización y el staff ven esta página. El público ve la lista de tributos y TSUKIBET. Gala: <b>lunes 23-11, 21:00</b>.</p>
      <h2>Tributos si la liga cerrara hoy ({tributos.length})</h2>
      {!personal ? <p class="tenue">Cargando…</p> : (
        <div class="tabla-caja">
          <table class="tabla">
            <thead><tr><th>#</th><th>Tributo</th><th>Distrito (equipo)</th><th>Puntos</th><th>Cómo entra</th></tr></thead>
            <tbody>{tributos.map((j, i) => (
              <tr key={j.id}><td>{i + 1}</td><td><b>{j.nombre}</b></td><td>{j.equipo?.nombre ?? '—'}</td><td>{j.puntos.toLocaleString('es-CL')}</td><td class="chico">{j.clasifica === 'equipo' ? 'Por su equipo' : 'Puntaje personal'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p class="tenue chico">La lista se congela el lunes 23 a las 00:00. Reemplazos (si alguien no está o no quiere participar): el siguiente mejor puntaje personal, hasta las 18:00.</p>
      <Tsukibet />
      {rolAdmin && <><h2>Panel de la gala</h2><Gala /></>}
    </div>
  );
}
