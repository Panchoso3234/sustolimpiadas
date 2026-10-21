import { useEffect, useState } from 'preact/hooks';
import { fechaChile } from '../nucleo/azar';
import * as V from './duelos';
import { BONO_CRUCE, CUPOS_FINAL, EQUIPOS_A_LA_FINAL, INICIO, calcularLiga, cruceDe, type LineaEquipo, type LineaJugador } from './liga';
import { PUNTOS_BASE, leerPuntos, type Puntos } from './puntos';

// Tabla oficial del torneo. Solo suma duelos oficiales creados desde el 21 de octubre (ver liga.ts):
// las partidas individuales, los amistosos y los duelos de prueba no cuentan.

const bonito = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-CL');

export function Posiciones() {
  const [datos, setDatos] = useState<{ tabla: LineaEquipo[]; personal: LineaJugador[]; personas: V.Persona[]; puntos: Puntos } | null>(null);
  useEffect(() => {
    (async () => {
      await V.cerrarVencidos();
      const [equipos, personas, { lista }, puntos] = await Promise.all([V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos('1v1'), leerPuntos().catch(() => PUNTOS_BASE)]);
      setDatos({ ...calcularLiga(equipos, personas, lista, puntos), personas, puntos });
    })();
  }, []);

  const hoy = fechaChile(Date.now()), cruce = cruceDe(hoy);
  if (!datos) return <><h1>Tabla oficial</h1><p class="tenue">Cargando…</p></>;
  const { tabla, personal, personas, puntos: p } = datos, nombre = (id: string | null) => personas.find((x) => x.id === id)?.nombre ?? '';
  const m = p.multiplicadores.map((x) => `×${bonito(x)}`).join(', ');
  return (
    <>
      <h1>Tabla oficial</h1>
      <p>Solo suman los <b>duelos oficiales</b> de la liga: ganar <b>{p.victoria}</b>, empatar <b>{p.empate}</b>, perder <b>{p.derrota}</b> y no jugar <b>0</b>, por el multiplicador de cada jornada ({m}). Los puntos van al jugador y a su equipo. El equipo que gana 2 de los 3 duelos de su enfrentamiento suma <b>+{BONO_CRUCE}</b> (también multiplicado). Las partidas individuales y los amistosos no cuentan.</p>
      {cruce && <p class="aviso ok">{hoy < cruce.desde ? `El cruce ${cruce.n} parte el ${V.fechaCorta(cruce.desde)}.` : `En curso: cruce ${cruce.n} de 11, hasta el ${V.fechaCorta(cruce.hasta)}.`} Tus duelos están en Juegos → Versus 1v1.</p>}
      {!tabla.length ? <p class="aviso atencion">Todavía no hay equipos.</p> : (
        <>
          <h2>Equipos</h2>
          <div class="tabla-caja">
            <table class="tabla posiciones">
              <thead><tr><th>#</th><th>Equipo</th><th>J1</th><th>J2</th><th>J3</th><th>J4</th><th title="Ganados, empatados y perdidos (y sin jugar)">G-E-P</th><th>Bonos</th><th>Total</th></tr></thead>
              <tbody>
                {tabla.map((l, i) => (
                  <tr key={l.equipo.id} class={i < EQUIPOS_A_LA_FINAL && l.puntos > 0 ? 'zona-final' : ''}>
                    <td>{i + 1}</td>
                    <td><b>{l.equipo.nombre}</b><br /><span class="tenue chico">{[...l.equipo.miembros.map((id) => `${id === l.capitan ? '⭐ ' : ''}${nombre(id) || 'Participante'}`), ...(l.equipo.pendientes ?? []).map((x) => `${x.es_capitan ? '⭐ ' : ''}${x.nombre} (sin cuenta)`)].join(', ') || 'Sin integrantes'}</span></td>
                    {l.porJornada.map((n, k) => <td key={k} class="tenue">{bonito(n)}</td>)}
                    <td>{l.ganados}-{l.empatados}-{l.perdidos}{l.sinJugar ? <span class="tenue chico"> ({l.sinJugar} sin jugar)</span> : null}</td>
                    <td>{bonito(l.bonos)}</td>
                    <td><b class="total">{bonito(l.puntos)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="tenue chico">⭐ Capitán (staff): juega y suma para su equipo, pero no pasa a la final. Resaltados: los {EQUIPOS_A_LA_FINAL} equipos que hoy clasificarían.</p>

          <h2>Puntaje personal y camino a la final</h2>
          <p class="chico">A la Arena entran {CUPOS_FINAL}: los participantes de los {EQUIPOS_A_LA_FINAL} mejores equipos (sin el staff) y, para completar, los mejores puntajes personales.</p>
          <div class="tabla-caja">
            <table class="tabla">
              <thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th>G-E-P</th><th>Puntos</th><th>Si terminara hoy</th></tr></thead>
              <tbody>
                {personal.map((j, i) => (
                  <tr key={j.id} class={j.clasifica ? 'zona-final' : ''}>
                    <td>{i + 1}</td>
                    <td><a href={`#/perfil/${j.id}`}>{j.nombre}</a></td>
                    <td class="tenue chico">{j.equipo?.nombre ?? '—'}</td>
                    <td>{j.ganados}-{j.empatados}-{j.perdidos}{j.sinJugar ? <span class="tenue chico"> ({j.sinJugar} s/j)</span> : null}</td>
                    <td><b>{bonito(j.puntos)}</b></td>
                    <td class="chico">{j.staff ? <span class="tenue">⭐ Staff</span> : j.clasifica === 'equipo' ? '✅ Por su equipo' : j.clasifica === 'especial' ? '🎟️ Cupo especial' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p class="tenue chico">La liga parte el {V.fechaCorta(INICIO)}. Dos cruces por semana (miércoles a sábado y domingo a martes) hasta el 28 de noviembre; los duelos se cierran solos cuando juegan los dos o cuando vence su plazo.</p>
    </>
  );
}
