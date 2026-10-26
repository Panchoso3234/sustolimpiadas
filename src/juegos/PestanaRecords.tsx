import { useEffect, useState } from 'preact/hooks';
import { fechaChile } from '../nucleo/azar';
import { useSesion } from '../nucleo/supabase';
import { Carita } from '../personaje/Carita';
import { JUEGOS, juegoPorId } from './catalogo';
import * as V from './duelos';
import { CRUCES, FIN, INICIO, calcularLiga, cuentaParaLaLiga, type LineaJugador } from './liga';
import { copaIndividual, misMejores, recordsDeSiempre, recordsDesde, recordsVersus, type Fila, type FilaCopa, type RecordVersus } from './marcas';
import { PUNTOS_BASE, leerPuntos } from './puntos';

// Pestañas Récords y Copa Individual. Cada sección va por separado: lo individual no se mezcla con los versus ni con la liga,
// y la Copa Individual nunca suma al torneo.

const bonito = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-CL');
const nombreJuego = (id: string) => juegoPorId(id)?.nombre ?? id;
/** El lunes de la semana de una fecha "AAAA-MM-DD". */
export const lunesDe = (fecha: string) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

function Quien({ perfil, nombre }: { perfil: string; nombre: string }) {
  return <a class="quien" href={`#/perfil/${perfil}`}><Carita perfil={perfil} tam={24} /> {nombre}</a>;
}

function Secciones<T extends string>({ opciones, valor, cambiar }: { opciones: [T, string][]; valor: T; cambiar: (v: T) => void }) {
  return (
    <nav class="modos sub-modos" aria-label="Secciones">
      {opciones.map(([v, t]) => <button key={v} type="button" class={valor === v ? 'activa' : ''} aria-pressed={valor === v} onClick={() => cambiar(v)}><b>{t}</b></button>)}
    </nav>
  );
}

// ───────── Récords ─────────

export function PestanaRecords() {
  const [seccion, setSeccion] = useState<'individual' | 'versus' | 'liga' | 'mios'>('individual');
  return (
    <>
      <h1>Récords</h1>
      <Secciones opciones={[['individual', 'Individual'], ['versus', 'Versus'], ['liga', 'Liga'], ['mios', 'Mis récords']]} valor={seccion} cambiar={setSeccion} />
      {seccion === 'individual' ? <RecordsIndividual /> : seccion === 'versus' ? <RecordsVersus /> : seccion === 'liga' ? <RecordsLiga /> : <MisRecords />}
    </>
  );
}

function RecordsIndividual() {
  const [periodo, setPeriodo] = useState<'hoy' | 'semana' | 'siempre'>('siempre');
  const [mapa, setMapa] = useState<Map<string, Fila[]> | null | undefined>(undefined);
  useEffect(() => {
    let vigente = true;
    setMapa(undefined);
    const hoy = fechaChile(Date.now());
    (periodo === 'siempre' ? recordsDeSiempre() : recordsDesde(periodo === 'hoy' ? hoy : lunesDe(hoy))).then((m) => { if (vigente) setMapa(m); });
    return () => { vigente = false; };
  }, [periodo]);
  return (
    <>
      <p>La mejor marca de cada persona en cada juego.</p>
      <Secciones opciones={[['hoy', 'Hoy'], ['semana', 'Esta semana'], ['siempre', 'Siempre']]} valor={periodo} cambiar={setPeriodo} />
      {mapa === undefined ? <p class="tenue">Cargando…</p> : mapa === null ? <p class="aviso atencion">Los récords por periodo todavía no están activados en la base de datos.</p> : (
        <div class="records-grilla">
          {JUEGOS.filter((j) => j.listo).map((j) => {
            const filas = mapa.get(j.id) ?? [];
            return (
              <section key={j.id} class="records-juego">
                <h3><a href={`#/juegos/${j.id}`}>{j.nombre}</a></h3>
                {filas.length ? <ol class="records">{filas.map((f, i) => <li key={f.perfil}><span class="puesto">{i + 1}</span><Quien perfil={f.perfil} nombre={f.nombre} /><b>{f.puntaje}</b></li>)}</ol> : <p class="tenue chico">Sin marcas {periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'todavía'}.</p>}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

interface LineaVersus { id: string; duelos: number; ganados: number; perdidos: number; racha: number; rachaMax: number; sinPerder: number }

/** Estadísticas de versus 1v1 de cada persona, de los duelos cerrados que se jugaron (sin "no jugó"). Exportada para la prueba. */
export function estadisticasVersus(duelos: V.Enfrentamiento[]): Map<string, LineaVersus> {
  const m = new Map<string, LineaVersus>();
  const jugados = duelos.filter((d) => d.modo === '1v1' && d.estado === 'cerrado' && d.ganador && !d.no_jugo).sort((a, b) => a.creado.localeCompare(b.creado) || a.id - b.id);
  for (const d of jugados) for (const lado of ['a', 'b'] as const) {
    const id = lado === 'a' ? d.a_perfil : d.b_perfil;
    if (!id) continue;
    const l = m.get(id) ?? { id, duelos: 0, ganados: 0, perdidos: 0, racha: 0, rachaMax: 0, sinPerder: 0 };
    l.duelos++;
    if (d.ganador === lado) { l.ganados++; l.racha++; l.sinPerder++; l.rachaMax = Math.max(l.rachaMax, l.racha); }
    else if (d.ganador === 'empate') { l.racha = 0; l.sinPerder++; }
    else { l.perdidos++; l.racha = 0; l.sinPerder = 0; }
    m.set(id, l);
  }
  return m;
}

function Podio<T>({ titulo, lista, valor, nota }: { titulo: string; lista: T[]; valor: (x: T) => [string, string, string]; nota?: string }) {
  return (
    <section class="records-juego">
      <h3>{titulo}</h3>
      {nota && <p class="tenue chico">{nota}</p>}
      {lista.length ? <ol class="records">{lista.slice(0, 3).map((x, i) => { const [perfil, nombre, v] = valor(x); return <li key={perfil + i}><span class="puesto">{i + 1}</span><Quien perfil={perfil} nombre={nombre} /><b>{v}</b></li>; })}</ol> : <p class="tenue chico">Todavía nadie.</p>}
    </section>
  );
}

function useVersus() {
  const [datos, setDatos] = useState<{ lineas: LineaVersus[]; personas: V.Persona[]; extra: RecordVersus[] | null } | null>(null);
  useEffect(() => {
    Promise.all([V.listarEnfrentamientos('1v1'), V.listarPersonas(), recordsVersus()]).then(([{ lista }, personas, extra]) => setDatos({ lineas: [...estadisticasVersus(lista).values()], personas, extra }));
  }, []);
  return datos;
}

function RecordsVersus() {
  const datos = useVersus();
  if (!datos) return <p class="tenue">Cargando…</p>;
  const { lineas, personas, extra } = datos, nombre = (id: string) => personas.find((p) => p.id === id)?.nombre ?? 'Participante';
  const top = (f: (l: LineaVersus) => number, min = 1) => lineas.filter((l) => f(l) >= min).sort((a, b) => f(b) - f(a) || b.duelos - a.duelos);
  const fila = (f: (l: LineaVersus) => number, sufijo: string) => (l: LineaVersus): [string, string, string] => [l.id, nombre(l.id), `${f(l)} ${sufijo}`];
  const invictos = lineas.filter((l) => l.duelos >= 2 && l.perdidos === 0).sort((a, b) => b.ganados - a.ganados || b.duelos - a.duelos);
  const remontadas = (extra ?? []).filter((x) => x.tipo === 'remontadas').sort((a, b) => b.valor - a.valor);
  const mejores = (extra ?? []).filter((x) => x.tipo === 'mejor_ronda' && x.juego).sort((a, b) => nombreJuego(a.juego!).localeCompare(nombreJuego(b.juego!)));
  return (
    <>
      <p>Duelos 1v1 cerrados (oficiales y amistosos). Los que alguien no jugó no cuentan.</p>
      <div class="records-grilla">
        <Podio titulo="Más victorias" lista={top((l) => l.ganados)} valor={fila((l) => l.ganados, 'ganados')} />
        <Podio titulo="Mejor racha de victorias" lista={top((l) => l.rachaMax, 2)} valor={fila((l) => l.rachaMax, 'seguidas')} />
        <Podio titulo="Sin perder ahora" lista={top((l) => l.sinPerder, 2)} valor={fila((l) => l.sinPerder, 'duelos')} nota="Duelos seguidos sin derrota, hasta hoy." />
        <Podio titulo="Invictos" lista={invictos} valor={(l) => [l.id, nombre(l.id), `${l.ganados}-${l.duelos - l.ganados - l.perdidos}-0`]} nota="Dos duelos o más y ninguna derrota (G-E-P)." />
        <Podio titulo="Más duelos jugados" lista={top((l) => l.duelos)} valor={fila((l) => l.duelos, 'duelos')} />
        {extra && <Podio titulo="Remontadas" lista={remontadas} valor={(x) => [x.perfil, x.nombre, `${x.valor}`]} nota="Perdió la primera ronda y aun así ganó el duelo." />}
      </div>
      <h2>Mejor ronda de cada juego</h2>
      {!extra ? <p class="aviso atencion">Las mejores rondas todavía no están activadas en la base de datos.</p> : !mejores.length ? <p class="tenue">Todavía no hay rondas.</p> : (
        <div class="tabla-caja"><table class="tabla"><thead><tr><th>Juego</th><th>Jugador</th><th>Puntaje</th></tr></thead>
          <tbody>{mejores.map((x) => <tr key={x.juego!}><td>{nombreJuego(x.juego!)}</td><td><Quien perfil={x.perfil} nombre={x.nombre} /></td><td><b>{x.valor}</b></td></tr>)}</tbody></table></div>
      )}
    </>
  );
}

// ───────── Liga ─────────

/** `mejor`: el jugador con más puntos del cruce si es uno solo; si empatan varios, cuántos ganaron su duelo. */
interface Cruce { n: number; parejas: { a: string; b: string; va: number; vb: number }[]; mejor: LineaJugador | null; ganadores: number }

function RecordsLiga() {
  const [datos, setDatos] = useState<{ cruces: Cruce[]; bonos: { nombre: string; bonos: number }[]; barridas: { cruce: number; gana: string; pierde: string }[] } | null>(null);
  useEffect(() => {
    (async () => {
      const [equipos, personas, { lista }, puntos, ausencias] = await Promise.all([V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos('1v1'), leerPuntos().catch(() => PUNTOS_BASE), V.listarAusencias()]);
      const equipoDe = (id: string | null) => equipos.find((q) => id && q.miembros.includes(id)) ?? null;
      const hoy = fechaChile(Date.now()), cruces: Cruce[] = [], barridas: { cruce: number; gana: string; pierde: string }[] = [];
      for (const c of CRUCES.filter((x) => x.desde <= hoy)) {
        const duelos = lista.filter((d) => d.cruce === c.n), aus = ausencias.filter((a) => a.cruce === c.n);
        // Victorias de cada equipo contra cada rival en este cruce (los duelos y las victorias por ausencia)
        const v = new Map<string, number>(), suma = (gana: number, pierde: number) => { const k = `${gana}|${pierde}`; v.set(k, (v.get(k) ?? 0) + 1); };
        const parejas = new Set<string>();
        for (const d of duelos.filter(cuentaParaLaLiga)) {
          const qa = equipoDe(d.a_perfil), qb = equipoDe(d.b_perfil);
          if (!qa || !qb || qa.id === qb.id) continue;
          parejas.add(`${Math.min(qa.id, qb.id)}|${Math.max(qa.id, qb.id)}`);
          if (d.ganador === 'a') suma(qa.id, qb.id); else if (d.ganador === 'b') suma(qb.id, qa.id);
        }
        for (const a of aus) { const q = equipoDe(a.perfil_id); if (q && q.id !== a.equipo_rival) { parejas.add(`${Math.min(q.id, a.equipo_rival)}|${Math.max(q.id, a.equipo_rival)}`); suma(q.id, a.equipo_rival); } }
        const nombreEq = (id: number) => equipos.find((q) => q.id === id)?.nombre ?? 'Equipo';
        const lineas = [...parejas].map((k) => { const [x, y] = k.split('|').map(Number); return { a: nombreEq(x), b: nombreEq(y), va: v.get(`${x}|${y}`) ?? 0, vb: v.get(`${y}|${x}`) ?? 0 }; });
        for (const l of lineas) if (Math.max(l.va, l.vb) === 3 && Math.min(l.va, l.vb) === 0) barridas.push({ cruce: c.n, gana: l.va === 3 ? l.a : l.b, pierde: l.va === 3 ? l.b : l.a });
        const { personal } = calcularLiga(equipos, personas, duelos, puntos, aus);
        const unico = personal[0]?.puntos > 0 && !(personal[1]?.puntos >= personal[0].puntos);
        cruces.push({ n: c.n, parejas: lineas, mejor: unico ? personal[0] : null, ganadores: personal.filter((j) => j.ganados > 0).length });
      }
      const { tabla } = calcularLiga(equipos, personas, lista, puntos, ausencias);
      setDatos({ cruces: cruces.reverse(), bonos: tabla.filter((l) => l.bonos > 0).sort((a, b) => b.bonos - a.bonos).map((l) => ({ nombre: l.equipo.nombre, bonos: l.bonos })), barridas });
    })();
  }, []);
  if (!datos) return <p class="tenue">Cargando…</p>;
  return (
    <>
      <p>Solo duelos oficiales de la liga (y victorias por ausencia).</p>
      <div class="records-grilla">
        <section class="records-juego"><h3>Más bonos de cruce</h3>
          {datos.bonos.length ? <ol class="records">{datos.bonos.slice(0, 3).map((b, i) => <li key={b.nombre}><span class="puesto">{i + 1}</span><span class="quien">{b.nombre}</span><b>+{bonito(b.bonos)}</b></li>)}</ol> : <p class="tenue chico">Todavía nadie.</p>}
        </section>
        <section class="records-juego"><h3>Victorias 3-0</h3>
          {datos.barridas.length ? <ul class="records">{datos.barridas.map((b, i) => <li key={i}><span class="barrida"><b>{b.gana}</b> a {b.pierde}</span><span class="tenue chico">cruce {b.cruce}</span></li>)}</ul> : <p class="tenue chico">Todavía ninguna.</p>}
        </section>
      </div>
      <h2>Historial de cruces</h2>
      {!datos.cruces.length ? <p class="tenue">Todavía no empieza ningún cruce.</p> : datos.cruces.map((c) => (
        <section key={c.n} class="records-cruce">
          <h3>Cruce {c.n}{c.mejor ? <span class="tenue chico"> · mejor jugador: <Quien perfil={c.mejor.id} nombre={c.mejor.nombre} /> ({bonito(c.mejor.puntos)} pts)</span> : c.ganadores > 0 && <span class="tenue chico"> · {c.ganadores} {c.ganadores === 1 ? 'jugador ganó su duelo' : 'jugadores ganaron su duelo'}</span>}</h3>
          {c.parejas.length ? <ul class="cruce-lista">{c.parejas.map((l, i) => <li key={i}><span class={l.va > l.vb ? 'gano' : ''}>{l.a}</span> <b>{l.va}-{l.vb}</b> <span class={l.vb > l.va ? 'gano' : ''}>{l.b}</span></li>)}</ul> : <p class="tenue chico">Sin duelos cerrados todavía.</p>}
        </section>
      ))}
    </>
  );
}

// ───────── Mis récords ─────────

function MisRecords() {
  const sesion = useSesion(), yo = sesion.usuarioId, versus = useVersus();
  const [datos, setDatos] = useState<{ mios: Map<string, number>; podio: Map<string, number>; copa: { puesto: number; fila: FilaCopa } | null } | null>(null);
  useEffect(() => {
    if (!yo) return;
    Promise.all([misMejores(yo), recordsDeSiempre(), copaIndividual(INICIO, FIN)]).then(([mios, siempre, copa]) => {
      const podio = new Map<string, number>();
      for (const [j, filas] of siempre ?? []) { const i = filas.findIndex((f) => f.perfil === yo); if (i >= 0) podio.set(j, i + 1); }
      const i = copa?.findIndex((f) => f.perfil === yo) ?? -1;
      setDatos({ mios, podio, copa: copa && i >= 0 ? { puesto: i + 1, fila: copa[i] } : null });
    });
  }, [yo]);
  if (sesion.cargando) return <p class="tenue">Cargando…</p>;
  if (!yo) return <p class="aviso atencion">Entra con tu cuenta para ver tus récords.</p>;
  if (!datos) return <p class="tenue">Cargando…</p>;
  const mv = versus?.lineas.find((l) => l.id === yo);
  const juegos = JUEGOS.filter((j) => datos.mios.has(j.id)).sort((a, b) => (datos.podio.get(a.id) ?? 9) - (datos.podio.get(b.id) ?? 9) || a.nombre.localeCompare(b.nombre));
  return (
    <>
      <div class="mis-resumen">
        <div><span class="tenue chico">Copa Individual</span><b>{datos.copa ? `${datos.copa.puesto}.º · ${bonito(datos.copa.fila.puntos)} pts` : 'Sin puntos'}</b></div>
        <div><span class="tenue chico">Versus 1v1</span><b>{mv ? `${mv.ganados} ganados de ${mv.duelos}` : 'Sin duelos'}</b></div>
        <div><span class="tenue chico">Mejor racha</span><b>{mv ? `${mv.rachaMax} seguidas` : '—'}</b></div>
        <div><span class="tenue chico">Récords en el podio</span><b>{datos.podio.size}</b></div>
      </div>
      <h2>Mi mejor marca en cada juego</h2>
      {!juegos.length ? <p class="tenue">Todavía no tienes partidas guardadas.</p> : (
        <div class="tabla-caja"><table class="tabla"><thead><tr><th>Juego</th><th>Mi mejor marca</th><th>Récord de siempre</th></tr></thead>
          <tbody>{juegos.map((j) => <tr key={j.id} class={datos.podio.get(j.id) === 1 ? 'zona-final' : ''}><td><a href={`#/juegos/${j.id}`}>{j.nombre}</a></td><td><b>{datos.mios.get(j.id)}</b></td><td>{datos.podio.has(j.id) ? `${datos.podio.get(j.id)}.º lugar` : <span class="tenue">fuera del podio</span>}</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}

// ───────── Copa Individual ─────────

export function PestanaCopa() {
  const hoy = fechaChile(Date.now());
  const [periodo, setPeriodo] = useState<'hoy' | 'semana' | 'temporada'>('semana');
  const [filas, setFilas] = useState<FilaCopa[] | null | undefined>(undefined);
  const [p, setP] = useState(PUNTOS_BASE);
  useEffect(() => { leerPuntos().then(setP, () => undefined); }, []);
  useEffect(() => {
    let vigente = true;
    setFilas(undefined);
    copaIndividual(periodo === 'hoy' ? hoy : periodo === 'semana' ? lunesDe(hoy) : INICIO, periodo === 'temporada' ? FIN : hoy).then((f) => { if (vigente) setFilas(f); });
    return () => { vigente = false; };
  }, [periodo]);
  const yo = useSesion().usuarioId;
  return (
    <div class="copa">
      <h1>Copa Individual</h1>
      <p>Va <b>aparte del torneo</b>: nunca suma a la liga ni a los equipos. Cada día, en cada juego, tu mejor marca da puntos según tu puesto: <b>{bonito(p.individualMax)}</b> al primero y bajando parejo hasta <b>{bonito(p.individualMin)}</b> al último (si empatan, comparten puesto). Cada lunes el bot anuncia el podio de la semana.</p>
      <Secciones opciones={[['hoy', 'Hoy (en curso)'], ['semana', 'Esta semana'], ['temporada', 'Temporada']]} valor={periodo} cambiar={setPeriodo} />
      {filas === undefined ? <p class="tenue">Cargando…</p> : filas === null ? <p class="aviso atencion">La Copa Individual todavía no está activada en la base de datos.</p> : !filas.length ? <p class="tenue">Nadie suma todavía en este periodo.</p> : (
        <div class="tabla-caja">
          <table class="tabla copa-tabla">
            <thead><tr><th>#</th><th>Jugador</th><th title="Días y juegos en que quedó primero">Primeros</th><th title="Días y juegos en que quedó entre los 3 primeros">Podios</th><th title="Días y juegos en que tuvo marca">Marcas</th><th>Puntos</th></tr></thead>
            <tbody>{filas.map((f, i) => <tr key={f.perfil} class={`${i < 3 ? 'copa-podio' : ''}${f.perfil === yo ? ' mia' : ''}`}><td>{i + 1}</td><td><Quien perfil={f.perfil} nombre={f.nombre} /></td><td>{f.primeros}</td><td>{f.podios}</td><td>{f.partidas}</td><td><b class="total">{bonito(f.puntos)}</b></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
