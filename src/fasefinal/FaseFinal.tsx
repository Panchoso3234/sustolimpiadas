import { useEffect, useState } from 'preact/hooks';
import { useSesion } from '../nucleo/supabase';
import * as V from '../juegos/duelos';
import { EQUIPOS_A_LA_FINAL, INDIVIDUALES_FINAL, calcularLiga, type LineaJugador } from '../juegos/liga';
import { PUNTOS_BASE, leerPuntos } from '../juegos/puntos';
import { listarAjustesCartas } from '../juegos/wcDatos';
import { Gala } from './Gala';
import { Tsukibet } from './Tsukibet';

// FASE FINAL (ex «Arena», decisión del 19-11): gala simulada el lunes 23-11 a las 21:00. El nombre lo ven todos;
// el contenido, solo la organización y el staff mientras se construye. El resto ve «Fase 2 en construcción».
// Plan completo: vault, «02 Proyectos/TORNEO VALE Y RIGO/Fase Final - planificación.md».

export function FaseFinal() {
  const sesion = useSesion();
  const rol = sesion.perfil?.rol;
  // Solo en desarrollo: ?ffprueba muestra el panel con tributos inventados (para probar sin iniciar sesión)
  if (import.meta.env.DEV && location.search.includes('ffprueba')) return <div class="pagina pagina-ancha arena"><Gala /></div>;
  if (sesion.cargando) return <div class="pagina arena"><p class="tenue">Cargando…</p></div>;
  if (rol !== 'admin' && rol !== 'guardian') return <EnConstruccion />;
  return <VistaStaff rolAdmin={rol === 'admin'} />;
}

function EnConstruccion() {
  return (
    <div class="pagina arena">
      <div class="porton" aria-hidden="true"><span /><span /></div>
      <div class="sigla">Fase 2</div>
      <h1>FASE FINAL</h1>
      <p><b>Fase 2 en construcción.</b> La gala es el <b>lunes 23 de noviembre a las 21:00</b> y se transmite en Discord.</p>
      <p>Entran los integrantes de los {EQUIPOS_A_LA_FINAL} mejores equipos de la tabla oficial al cierre del cruce 11 (el staff no entra) y los {INDIVIDUALES_FINAL} mejores puntajes personales de quienes quedan fuera.</p>
      <p class="tenue">Cada punto que ganes en la liga mejora tus posibilidades adentro.</p>
      <Tsukibet />
    </div>
  );
}

/** Lo que ve el staff mientras se construye: quiénes clasificarían hoy. */
function VistaStaff({ rolAdmin }: { rolAdmin: boolean }) {
  const [personal, setPersonal] = useState<LineaJugador[] | null>(null);
  useEffect(() => {
    (async () => {
      const [equipos, personas, { lista }, puntos, ausencias, cartas] = await Promise.all([V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos('1v1'), leerPuntos().catch(() => PUNTOS_BASE), V.listarAusencias(), listarAjustesCartas()]);
      setPersonal(calcularLiga(equipos, personas, lista, puntos, ausencias, cartas).personal);
    })();
  }, []);
  const tributos = (personal ?? []).filter((j) => j.clasifica);
  return (
    <div class="pagina pagina-ancha arena">
      <div class="sigla">Fase 2 · vista del staff</div>
      <h1>FASE FINAL</h1>
      <p class="aviso">Solo la organización y el staff ven esta página. El público ve «Fase 2 en construcción». Gala: <b>lunes 23-11, 21:00</b>.</p>
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
