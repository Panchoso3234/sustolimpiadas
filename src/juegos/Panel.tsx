import { useEffect, useState } from 'preact/hooks';
import { fechaChile } from '../nucleo/azar';
import { supabase } from '../nucleo/supabase';
import { TOPES, juegoPorId, nombreVersus } from './catalogo';
import * as V from './duelos';
import { CRUCES, FIN, INICIO, JORNADAS, calcularLiga, calendarioLiga, cruceDe, cuentaParaLaLiga } from './liga';
import { PUNTOS_BASE, leerPuntos, type Puntos } from './puntos';

// Mesa de control · Planificación (el calendario completo de la liga con lo que toca hacer cada día) y
// Dashboard (cómo va todo hoy: cruce en curso, quién debe duelos, inscritos y alertas).

const COLOR_CRUCE = ['#ff9a2e', '#8a5ce6', '#2fae86', '#ef5565', '#3fa3dc', '#e85aa2', '#7ab33c', '#ffd23c', '#5a6acf', '#c94a6a', '#3fb8b0'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const sumar = (fecha: string, dias: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 864e5).toISOString().slice(0, 10);
const diaSemana = (fecha: string) => (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes
const bonita = (fecha: string) => `${DIAS[diaSemana(fecha)].toLowerCase()} ${Number(fecha.slice(8))} ${MESES[Number(fecha.slice(5, 7)) - 1]}`;
const bonito = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-CL');

interface Datos { equipos: V.Equipo[]; personas: V.Persona[]; duelos: V.Enfrentamiento[]; puntos: Puntos }
function useDatos(): Datos | null {
  const [datos, setDatos] = useState<Datos | null>(null);
  useEffect(() => {
    Promise.all([V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos('1v1'), leerPuntos().catch(() => PUNTOS_BASE)])
      .then(([equipos, personas, { lista }, puntos]) => setDatos({ equipos, personas, duelos: lista.filter((d) => d.oficial && fechaChile(Date.parse(d.creado)) >= INICIO), puntos }));
  }, []);
  return datos;
}

/** Tareas del organizador por día: abrir cada cruce, recordar el plazo y cerrar. */
function tareas(): Map<string, string[]> {
  const m = new Map<string, string[]>(), poner = (f: string, t: string) => m.set(f, [...(m.get(f) ?? []), t]);
  poner(INICIO, '🎡 Sorteo de equipos en vivo');
  for (const c of CRUCES) {
    poner(c.desde, `▶ Crear y anunciar el cruce ${c.n} (juegos y rivales)`);
    poner(sumar(c.hasta, -1), `🔔 Recordar el plazo del cruce ${c.n} a quien no ha jugado`);
    poner(c.hasta, `⏰ Vence el cruce ${c.n} (a las 23:59)`);
  }
  for (const j of JORNADAS.slice(1)) poner(j.desde, `✖️ Empieza la jornada ${j.n}: anunciar el nuevo multiplicador`);
  poner('2026-10-31', '👻 Noche de Brujas en la isla');
  poner(FIN, '🏁 Fin de la liga: anunciar a los 12 de la Arena');
  return m;
}

// ───────── Planificación ─────────
/** `publico`: la versión para todos (pestaña Calendario del portal), sin las tareas del organizador. */
export function Planificacion({ publico = false }: { publico?: boolean }) {
  const datos = useDatos(), hoy = fechaChile(Date.now()), todas = tareas();
  // En la versión pública solo quedan los hitos que le importan a todos
  const lista: Map<string, string[]> = publico ? new Map([...todas].map(([f, ts]): [string, string[]] => [f, ts.filter((t) => /^(🎡|👻|🏁|✖️)/.test(t)).map((t) => t.replace('anunciar el nuevo multiplicador', 'sube el multiplicador').replace(': anunciar a los 12 de la Arena', ': se conocen los 12 de la Arena').replace('en vivo', ''))]).filter(([, ts]) => ts.length)) : todas;
  const inicioGrilla = sumar(INICIO, -diaSemana(INICIO)), dias: string[] = [];
  for (let f = inicioGrilla; f <= sumar(FIN, 6 - diaSemana(FIN)); f = sumar(f, 1)) dias.push(f);
  const cruceDelDia = (f: string) => CRUCES.find((c) => f >= c.desde && f <= c.hasta);
  const jornadaDelDia = (f: string) => JORNADAS.find((j) => f >= j.desde && f <= j.hasta);
  const ordenados = datos ? [...datos.equipos].sort((a, b) => a.id - b.id) : [], cal = calendarioLiga(ordenados.map((q) => q.id));
  const nombreEquipo = (id: number) => datos?.equipos.find((q) => q.id === id)?.nombre ?? '¿?';
  const proximas = [...lista].filter(([f]) => f >= hoy).sort(([a], [b]) => a.localeCompare(b)).slice(0, 6);
  return (
    <div class="plan">
      {publico && cruceDe(hoy) && <p class="aviso ok">{hoy < cruceDe(hoy)!.desde ? `El cruce ${cruceDe(hoy)!.n} parte el ${bonita(cruceDe(hoy)!.desde)}.` : `Ahora: cruce ${cruceDe(hoy)!.n}, hasta el ${bonita(cruceDe(hoy)!.hasta)} a las 23:59.`} Tus duelos están en Versus 1v1 (o en En vivo, si quieren jugarlo conectados).</p>}
      <p><b>11 cruces</b>, <b>2 por semana</b> (miércoles a sábado y domingo a martes), del <b>{bonita(INICIO)}</b> al <b>{bonita(FIN)}</b>. Cada persona juega <b>1 o 2 duelos por semana</b> (al mejor de 3). Cuatro jornadas con multiplicador: J1 ×1 (cruces 1-3), J2 ×1,25 (4-6), J3 ×1,5 (7-9) y J4 ×2 (10-11). La Arena va después, en la fecha que anuncies.</p>
      {!publico && <section class="bloque">
        <h2>Lo que viene</h2>
        <ul class="plan-tareas">{proximas.map(([f, ts]) => <li key={f} class={f === hoy ? 'hoy' : ''}><b>{f === hoy ? 'Hoy' : bonita(f)}</b><span>{ts.join(' · ')}</span></li>)}</ul>
      </section>}
      <div class="plan-grilla" role="grid" aria-label="Calendario de la liga">
        {DIAS.map((d) => <div key={d} class="plan-cabeza">{d}</div>)}
        {dias.map((f) => {
          const c = cruceDelDia(f), j = jornadaDelDia(f), ts = lista.get(f) ?? [];
          return (
            <div key={f} class={`plan-dia${f === hoy ? ' hoy' : ''}${!c ? ' fuera' : ''}`} style={c ? `--color:${COLOR_CRUCE[c.n - 1]}` : ''}>
              <div class="plan-num"><b>{Number(f.slice(8))}</b>{f.slice(8) === '01' || f === inicioGrilla ? <span> {MESES[Number(f.slice(5, 7)) - 1]}</span> : null}{j && j.desde === f && <em>J{j.n} ×{bonito(datos?.puntos.multiplicadores[j.n - 1] ?? 1)}</em>}</div>
              {c && <div class="plan-cruce">Cruce {c.n}{c.desde === f ? ' · abre' : c.hasta === f ? ' · vence' : ''}</div>}
              {ts.filter((t) => !t.startsWith('▶') && !t.startsWith('⏰')).map((t) => <div key={t} class="plan-nota">{t.split(' ')[0]}</div>)}
            </div>
          );
        })}
      </div>
      <h2>Los 11 cruces</h2>
      <div class="tabla-caja">
        <table class="tabla">
          <thead><tr><th>Cruce</th><th>Fechas</th><th>Jornada</th><th>Enfrentamientos</th><th>Estado</th></tr></thead>
          <tbody>
            {CRUCES.map((c, i) => {
              const hechos = datos?.duelos.filter((d) => d.cruce === c.n) ?? [], cerrados = hechos.filter((d) => d.estado === 'cerrado').length;
              const j = JORNADAS.find((x) => x.cruces.includes(c.n))!, r = cal[i];
              const estado = publico
                ? (!hechos.length ? (hoy > c.hasta ? '—' : hoy >= c.desde ? 'Se anuncia pronto' : 'Por jugar') : cerrados === hechos.length ? '✅ Terminado' : `${hoy >= c.desde ? '▶ En curso' : 'Anunciado'} · ${cerrados}/${hechos.length} duelos jugados`)
                : !hechos.length ? (hoy > c.hasta ? '⚠️ No se creó' : hoy >= c.desde ? '⚠️ Falta crearlo' : 'Por crear') : cerrados === hechos.length ? `✅ Terminado (${cerrados})` : `${hoy > c.hasta ? '⏰ Vencido' : hoy >= c.desde ? '▶ En curso' : 'Creado'} · ${cerrados}/${hechos.length} cerrados`;
              return (
                <tr key={c.n} class={hoy >= c.desde && hoy <= c.hasta ? 'zona-final' : ''}>
                  <td><span class="plan-punto" style={`background:${COLOR_CRUCE[i]}`} /> <b>{c.n}</b></td>
                  <td class="chico">{bonita(c.desde)} → {bonita(c.hasta)}</td>
                  <td>J{j.n} ×{bonito(datos?.puntos.multiplicadores[j.n - 1] ?? 1)}</td>
                  <td class="chico">{r ? <>{r.parejas.map(([a, b]) => `${nombreEquipo(a)} vs ${nombreEquipo(b)}`).join(' · ')}{r.descansa != null ? <span class="tenue"> · descansa {nombreEquipo(r.descansa)}</span> : null}</> : <span class="tenue">Se arma cuando estén los equipos</span>}{hechos.length ? <div class="tenue">Juegos: {[...new Set(hechos.map((d) => nombreVersus('1v1', d.juego)))].join(', ')}</div> : null}</td>
                  <td class="chico">{estado}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────── Dashboard ─────────
export function Dashboard() {
  const datos = useDatos(), hoy = fechaChile(Date.now()), cruce = cruceDe(hoy);
  const [extra, setExtra] = useState<{ personajes: number; partidasHoy: { perfil_id: string; juego: string; puntaje: number }[]; rondas: V.MarcaVersus[] } | null>(null);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!datos) return;
    const abiertos = datos.duelos.filter((d) => d.estado === 'pendiente').map((d) => d.id);
    Promise.all([
      supabase.from('personajes').select('perfil_id', { count: 'exact', head: true }),
      supabase.from('marcas').select('perfil_id,juego,puntaje').eq('fecha', hoy).limit(5000),
      V.marcasDe(abiertos),
    ]).then(([pj, m, rondas]) => setExtra({ personajes: pj.count ?? 0, partidasHoy: (m.data as { perfil_id: string; juego: string; puntaje: number }[] | null) ?? [], rondas }));
  }, [datos]);
  if (!datos) return <p class="tenue">Cargando…</p>;
  const { equipos, personas, duelos, puntos } = datos, nombre = (id: string | null) => personas.find((p) => p.id === id)?.nombre ?? '¿?';
  const conEquipo = new Set(equipos.flatMap((q) => q.miembros)), sinEquipo = personas.filter((p) => !conEquipo.has(p.id)), sinCuenta = equipos.flatMap((q) => (q.pendientes ?? []).map((x) => ({ ...x, equipo: q.nombre })));
  const delCruce = cruce ? duelos.filter((d) => d.cruce === cruce.n) : [], cerrados = delCruce.filter((d) => d.estado === 'cerrado'), noJugados = cerrados.filter((d) => d.no_jugo).length;
  // Cuánto falta para el plazo (fin del día en Chile, aprox. 23:59 -03:00)
  const fin = cruce ? Date.parse(`${cruce.hasta}T23:59:59-03:00`) : 0, horas = Math.max(0, Math.round((fin - Date.now()) / 36e5));
  // Quién debe: duelos pendientes y cuántas rondas lleva cada lado
  const deben = duelos.filter((d) => d.estado === 'pendiente').flatMap((d) => (['a', 'b'] as const).map((l) => {
    const id = l === 'a' ? d.a_perfil : d.b_perfil, hechas = extra?.rondas.filter((r) => r.enfrentamiento_id === d.id && r.perfil_id === id && r.terminado).length ?? 0;
    return { id, rival: l === 'a' ? d.b_perfil : d.a_perfil, juego: d.juego, hechas, rondas: d.rondas, cruce: d.cruce, plazo: d.plazo };
  })).filter((x) => x.hechas < x.rondas).sort((a, b) => (a.plazo ?? '').localeCompare(b.plazo ?? ''));
  const recordatorio = `🔔 **Recordatorio del cruce${cruce ? ` ${cruce.n}` : ''}** (vence el ${cruce ? bonita(cruce.hasta) : 'pronto'} a las 23:59)\nTodavía les falta jugar:\n${deben.map((x) => `• ${nombre(x.id)} vs ${nombre(x.rival)} — ${nombreVersus('1v1', x.juego)} (${x.hechas}/${x.rondas} rondas)`).join('\n')}\nJuegos → Versus 1v1. ¡No jugar son 0 puntos para ti y tu equipo!`;
  const { tabla, personal } = calcularLiga(equipos, personas, duelos.filter(cuentaParaLaLiga), puntos);
  const sospechosas = (extra?.partidasHoy ?? []).filter((m) => TOPES[m.juego] && m.puntaje > TOPES[m.juego]).sort((a, b) => b.puntaje / TOPES[b.juego] - a.puntaje / TOPES[a.juego]);
  const activosHoy = new Set((extra?.partidasHoy ?? []).map((m) => m.perfil_id)).size;
  return (
    <div class="dash">
      <div class="cifras">
        <div><b>{personas.length}</b><span>cuentas inscritas</span></div>
        <div><b>{extra?.personajes ?? '…'}</b><span>con personaje</span></div>
        <div><b>{equipos.length}</b><span>equipos</span></div>
        <div class={sinEquipo.length ? 'alerta' : ''}><b>{sinEquipo.length}</b><span>sin equipo</span></div>
        <div class={sinCuenta.length ? 'alerta' : ''}><b>{sinCuenta.length}</b><span>sorteados sin cuenta</span></div>
        <div><b>{extra?.partidasHoy.length ?? '…'}</b><span>partidas hoy ({activosHoy} personas)</span></div>
      </div>

      <section class="bloque">
        <h2>{cruce ? (hoy < cruce.desde ? `Próximo: cruce ${cruce.n}` : `Cruce ${cruce.n} en curso`) : 'La liga terminó'}</h2>
        {cruce && <>
          <p>{bonita(cruce.desde)} → {bonita(cruce.hasta)} · {hoy < cruce.desde ? `parte en ${Math.ceil((Date.parse(cruce.desde) - Date.parse(hoy)) / 864e5)} días` : <>quedan <b>{horas >= 48 ? `${Math.floor(horas / 24)} días` : `${horas} horas`}</b> para el plazo</>}</p>
          {delCruce.length ? <>
            <div class="pase-barra"><span style={`width:${Math.round((cerrados.length / delCruce.length) * 100)}%`} /></div>
            <p class="chico">{cerrados.length} de {delCruce.length} duelos cerrados · {delCruce.length - cerrados.length} pendientes{noJugados ? ` · ${noJugados} cerrados sin jugar` : ''}</p>
          </> : <p class="aviso atencion">Este cruce todavía no tiene duelos: créalo en la pestaña Liga (cruces).</p>}
        </>}
      </section>

      <section class="bloque">
        <h2>Quién debe duelos ({deben.length})</h2>
        {!deben.length ? <p class="tenue">Nadie debe duelos. 🎉</p> : <>
          <div class="tabla-caja"><table class="tabla">
            <thead><tr><th>Jugador</th><th>Rival</th><th>Juego</th><th>Rondas</th><th>Plazo</th></tr></thead>
            <tbody>{deben.slice(0, 40).map((x, i) => <tr key={i} class={x.plazo && x.plazo < hoy ? 'alerta' : ''}><td><b>{nombre(x.id)}</b></td><td>{nombre(x.rival)}</td><td class="chico">{nombreVersus('1v1', x.juego)}</td><td>{x.hechas}/{x.rondas}</td><td class="chico">{x.plazo ? bonita(x.plazo) : '—'}{x.cruce ? ` · C${x.cruce}` : ''}</td></tr>)}</tbody>
          </table></div>
          {!extra?.rondas.length && <p class="chico tenue">Las rondas jugadas se ven solo con tu sesión de organizador.</p>}
          <button class="boton" onClick={() => navigator.clipboard.writeText(recordatorio).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2500); }, () => {})}>{copiado ? '✓ Copiado: pégalo en Discord' : '📋 Copiar recordatorio para Discord'}</button>
        </>}
      </section>

      <div class="dash-dos">
        <section class="bloque">
          <h2>Top 5 equipos</h2>
          <ol class="dash-top">{tabla.slice(0, 5).map((l) => <li key={l.equipo.id}><span>{l.equipo.nombre}</span><b>{bonito(l.puntos)}</b></li>)}</ol>
        </section>
        <section class="bloque">
          <h2>Top 5 jugadores</h2>
          <ol class="dash-top">{personal.filter((j) => j.puntos > 0).slice(0, 5).map((j) => <li key={j.id}><span>{j.nombre}{j.staff ? ' ⭐' : ''}</span><b>{bonito(j.puntos)}</b></li>)}</ol>
          {!personal.some((j) => j.puntos > 0) && <p class="tenue chico">Todavía sin puntos.</p>}
        </section>
      </div>

      <section class="bloque">
        <h2>Alertas</h2>
        <ul class="lista">
          {sospechosas.length > 0 && <li>⚠️ <b>{sospechosas.length}</b> {sospechosas.length === 1 ? 'marca de hoy supera' : 'marcas de hoy superan'} el tope de su juego: {sospechosas.slice(0, 5).map((m) => `${nombre(m.perfil_id)} en ${juegoPorId(m.juego)?.nombre ?? m.juego} (${m.puntaje})`).join(', ')}. Revísalas en la pestaña Marcas.</li>}
          {sinEquipo.length > 0 && <li>👤 Sin equipo: {sinEquipo.map((p) => p.nombre).join(', ')}.</li>}
          {sinCuenta.length > 0 && <li>🔗 Sorteados sin cuenta (vincúlalos en Equipos): {sinCuenta.map((x) => `${x.nombre} (${x.equipo})`).join(', ')}.</li>}
          {cruce && hoy >= cruce.desde && !delCruce.length && <li>▶ El cruce {cruce.n} ya empezó y no tiene duelos creados.</li>}
          {!sospechosas.length && !sinEquipo.length && !sinCuenta.length && !(cruce && hoy >= cruce.desde && !delCruce.length) && <li class="tenue">Todo en orden.</li>}
        </ul>
      </section>
    </div>
  );
}
