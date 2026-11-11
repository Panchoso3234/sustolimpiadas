import { useEffect, useMemo, useState } from 'preact/hooks';
import { fechaChile } from '../nucleo/azar';
import * as V from './duelos';
import { juegoPorId, nombreVersus } from './catalogo';
import { CRUCES, JORNADAS, calcularLiga, cruceDe } from './liga';
import { juegosDuelo } from './MesaLiga';
import { PUNTOS_BASE, leerPuntos, type Puntos } from './puntos';
import { CartaWild } from './CartaWild';
import * as W from './wcDatos';
import { CARTAS, DESDE_CRUCE, RAREZAS, calcularAjustes, cartaPorId, duelosDelCruce, puntosChile, rarezasPara, textosRevelacion, type Rareza } from './wildcards';

// Mesa de control · Wild Cards. Pancho gira la ruleta de cada equipo; el resultado lo decide la base (wc_sortear) y la ruleta
// solo gira hasta él. Aquí también se usan las cartas de decisión, se anuncia en Discord y se revelan los puntos al cerrar el cruce.

const ORDEN: Rareza[] = ['comun', 'rara', 'epica', 'legendaria'];
const quieto = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const GIRO_MS = 3400;

/** Ángulo (desde arriba, en sentido del reloj) dentro del sector de la rareza, con algo de azar para que no caiga siempre igual. */
function anguloDe(puesto: number, rareza: Rareza) {
  const g = rarezasPara(puesto);
  let ini = 0;
  for (const r of ORDEN) { if (r === rareza) break; ini += g[r]; }
  const ancho = g[rareza];
  return (ini + ancho / 2 + (Math.random() - 0.5) * ancho * 0.6) * 3.6;
}

function Ruleta({ puesto, giro, girando }: { puesto: number; giro: number; girando: boolean }) {
  const g = rarezasPara(puesto);
  let acum = 0;
  const partes = ORDEN.map((r) => { const ini = acum; acum += g[r]; return `${RAREZAS[r].color} ${ini * 3.6}deg ${acum * 3.6}deg`; });
  return (
    <div class="wc-ruleta-caja">
      <div class={`wc-ruleta${girando ? ' girando' : ''}`}>
        <span class="wc-puntero" aria-hidden="true" />
        <div class="wc-disco" style={{ background: `conic-gradient(${partes.join(', ')})`, transform: `rotate(${giro}deg)`, transitionDuration: quieto() ? '0ms' : `${GIRO_MS}ms` }} />
        <span class="wc-eje" aria-hidden="true">🃏</span>
      </div>
      <ul class="wc-leyenda" aria-label={`Probabilidades del puesto ${puesto}`}>
        {ORDEN.map((r) => <li key={r}><i style={{ background: RAREZAS[r].color }} />{RAREZAS[r].nombre} <b>{g[r]} %</b></li>)}
      </ul>
    </div>
  );
}

interface Base { equipos: V.Equipo[]; personas: V.Persona[]; lista: V.Enfrentamiento[]; puntos: Puntos; ausencias: V.Ausencia[]; ajustes: W.AjusteGuardado[] }
interface Datos { duelos: V.Enfrentamiento[]; equipoDe: Map<string, number>; persona: (id: string | null) => string; nombreEq: (id: number) => string }

export function MesaWildCards() {
  const hoy = fechaChile(Date.now());
  const [cruce, setCruce] = useState(Math.max(DESDE_CRUCE, cruceDe(hoy)?.n ?? DESDE_CRUCE));
  const [base, setBase] = useState<Base | null>(null);
  const [cartas, setCartas] = useState<W.WildCard[]>([]);
  const [sel, setSel] = useState<number | null>(null); // equipo elegido
  const [giro, setGiro] = useState(0);
  const [girando, setGirando] = useState(false);
  const [aviso, setAviso] = useState(''); const [error, setError] = useState('');
  const [armado, setArmado] = useState(''); // botones que piden dos toques

  const cargarCartas = async (n = cruce) => setCartas(await W.listarWildCards(n));
  const cargar = async () => {
    const [equipos, personas, { lista }, puntos, ausencias, ajustes] = await Promise.all([V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos('1v1'), leerPuntos().catch(() => PUNTOS_BASE), V.listarAusencias(), W.listarAjustesCartas()]);
    setBase({ equipos, personas, lista, puntos, ausencias, ajustes });
    await cargarCartas();
  };
  useEffect(() => { cargar(); }, []);
  useEffect(() => { setSel(null); cargarCartas(cruce); }, [cruce]);

  const d = useMemo(() => {
    if (!base) return null;
    const { tabla } = calcularLiga(base.equipos, base.personas, base.lista, base.puntos, base.ausencias, base.ajustes);
    const puesto = new Map(tabla.map((l, i) => [l.equipo.id, i + 1]));
    const equipoDe = new Map(base.equipos.flatMap((q) => q.miembros.map((m) => [m, q.id] as [string, number])));
    const duelos = base.lista.filter((e) => e.cruce === cruce && e.oficial && e.modo === '1v1' && e.estado !== 'anulado');
    const rival = new Map<number, number>();
    for (const e of duelos) { const a = equipoDe.get(e.a_perfil ?? ''), b = equipoDe.get(e.b_perfil ?? ''); if (a && b && a !== b) { rival.set(a, b); rival.set(b, a); } }
    const enCruce = [...rival.keys()].sort((x, y) => (puesto.get(x) ?? 99) - (puesto.get(y) ?? 99));
    const nombreEq = (id: number) => base.equipos.find((q) => q.id === id)?.nombre ?? `Equipo ${id}`;
    const persona = (id: string | null) => base.personas.find((p) => p.id === id)?.nombre ?? '—';
    const jornada = JORNADAS.find((j) => j.cruces.includes(cruce))?.n ?? 4, mult = base.puntos.multiplicadores[jornada - 1] ?? 1;
    return { puesto, equipoDe, duelos, rival, enCruce, nombreEq, persona, mult };
  }, [base, cruce]);

  if (!base || !d) return <p class="tenue">Cargando…</p>;
  const principal = (eq: number) => cartas.find((c) => c.equipo_id === eq && c.origen == null);
  const hijas = (id: number) => cartas.filter((c) => c.origen === id);
  const abiertos = d.duelos.filter((e) => e.estado === 'pendiente').length;
  const listo = (txt: string | null, ok: string) => { if (txt) { setError(txt); setAviso(''); } else { setAviso(ok); setError(''); } };
  const dosToques = (clave: string, hacer: () => void) => { if (armado === clave) { setArmado(''); hacer(); } else setArmado(clave); };

  const girar = async (eq: number) => {
    setError(''); setAviso(''); setSel(eq);
    const r = await W.sortearCarta(cruce, eq);
    if (r.error) return setError(r.error);
    const nuevas = await W.listarWildCards(cruce);
    const c = nuevas.find((x) => x.id === r.id);
    if (!c) { setCartas(nuevas); return setError('La carta se sorteó, pero no se pudo leer. Recarga la página.'); }
    const objetivo = anguloDe(d.puesto.get(eq) ?? 12, c.rareza);
    setGirando(true); setCartas(nuevas);
    setGiro((g) => g + 360 * 5 + ((((-objetivo - g) % 360) + 360) % 360));
    setTimeout(() => setGirando(false), quieto() ? 0 : GIRO_MS + 100);
  };

  // Vista previa de la revelación: el mismo motor que guardará los puntos
  const duelosEq = duelosDelCruce(cruce, d.duelos, d.equipoDe, base.ausencias);
  const jugadas = cartas.filter((c) => c.carta).map((c) => ({ id: c.id, equipo: c.equipo_id, carta: c.carta!, origen: c.origen, dado: c.dado, duelo: c.duelo, anulada: c.anulada }));
  const ajustes = calcularAjustes(duelosEq, jugadas, d.mult);
  const revelado = base.ajustes.some((a) => a.cruce === cruce) || cartas.some((c) => c.revelada);
  const revelar = async () => {
    const nombres = new Map(d.enCruce.map((eq) => [eq, d.nombreEq(eq)]));
    const textos = textosRevelacion(cruce, cartas.filter((c) => c.carta && !c.anulada).map((c) => ({ equipo: c.equipo_id, carta: c.carta!, rareza: c.rareza })), ajustes, nombres);
    listo(await W.revelarCartas(cruce, ajustes.map((a) => ({ equipo: a.equipo, puntos: a.puntos, detalle: a.detalle.join(' · ') })), textos), 'Cartas reveladas: los puntos ya cuentan en la tabla y salió el anuncio en Discord.');
    await cargar();
  };

  const seleccion = sel != null ? principal(sel) : undefined;
  return (
    <div class="wc-mesa">
      <div class="wc-barra">
        <label>Cruce <select value={cruce} onChange={(e) => setCruce(Number(e.currentTarget.value))}>
          {CRUCES.filter((c) => c.n >= DESDE_CRUCE).map((c) => <option key={c.n} value={c.n}>{c.n} ({V.fechaCorta(c.desde)} al {V.fechaCorta(c.hasta)})</option>)}
        </select></label>
        <span class="tenue chico">{d.enCruce.length ? `${cartas.filter((c) => c.origen == null).length} de ${d.enCruce.length} equipos con carta. Multiplicador ×${String(d.mult).replace('.', ',')}.` : 'Este cruce todavía no tiene duelos sorteados (pestaña Liga).'}</span>
      </div>
      {error && <p class="aviso error" role="alert">{error}</p>}
      {aviso && <p class="aviso ok" role="status">{aviso}</p>}

      <div class="wc-escenario">
        <Ruleta puesto={sel != null ? d.puesto.get(sel) ?? 12 : 12} giro={giro} girando={girando} />
        <div class="wc-revelacion" aria-live="polite">
          {seleccion
            ? <>
                <CartaWild carta={seleccion.carta} rareza={seleccion.rareza} dado={seleccion.dado} tam="grande" deFrente={!girando} />
                <p class="wc-quien"><b>{d.nombreEq(seleccion.equipo_id)}</b>, puesto {seleccion.puesto ?? '?'} al sortear</p>
                {hijas(seleccion.id).length > 0 && !girando && <div class="wc-hijas">{hijas(seleccion.id).map((h) => <CartaWild key={h.id} carta={h.carta} rareza={h.rareza} dado={h.dado} tam="chica" nota={h.anulada ? 'anulada' : h.usada ? 'usada' : undefined} />)}</div>}
              </>
            : <p class="tenue">{sel != null ? (girando ? 'Girando…' : 'Este equipo todavía no tiene carta.') : 'Elige un equipo de la lista y gira su ruleta.'}</p>}
        </div>
      </div>

      <div class="tabla-caja">
        <table class="tabla wc-equipos">
          <thead><tr><th>#</th><th>Equipo</th><th>Rival</th><th>Probabilidad</th><th>Carta</th></tr></thead>
          <tbody>
            {d.enCruce.map((eq) => {
              const c = principal(eq), p = d.puesto.get(eq) ?? 12, g = rarezasPara(p), k = c?.carta ? cartaPorId(c.carta) : undefined;
              return (
                <tr key={eq} class={sel === eq ? 'elegida' : ''}>
                  <td>{p}</td>
                  <td><b>{d.nombreEq(eq)}</b></td>
                  <td class="tenue">{d.nombreEq(d.rival.get(eq)!)}</td>
                  <td><span class="wc-barra-prob" title={ORDEN.map((r) => `${RAREZAS[r].nombre} ${g[r]} %`).join(', ')}>{ORDEN.map((r) => <i key={r} style={{ width: `${g[r]}%`, background: RAREZAS[r].color }} />)}</span><span class="chico tenue"> legendaria {g.legendaria} %</span></td>
                  <td>{c
                    ? <button class="boton wc-mini" disabled={girando} onClick={() => setSel(eq)}><span style={{ color: RAREZAS[c.rareza].color }}>●</span> {k ? `${k.emoji} ${k.nombre}` : RAREZAS[c.rareza].nombre}{c.anulada ? ' (anulada)' : c.usada ? ' (usada)' : ''}</button>
                    : <button class="boton principal" disabled={girando} onClick={() => girar(eq)}>Girar ruleta</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {seleccion && !girando && [seleccion, ...hijas(seleccion.id)].filter((c) => c.carta && !c.anulada && !c.usada && cartaPorId(c.carta)?.tipo === 'decision').map((c) => (
        <AccionCarta key={c.id} carta={c} cruce={cruce} d={d} alTerminar={async (txt, ok) => { listo(txt, ok); await cargar(); }} />
      ))}
      {seleccion && !girando && !seleccion.anulada && (
        <div class="wc-anular">
          <label>Anular esta carta (queda registrado con el motivo) <input id="wc-motivo" maxLength={200} placeholder="Motivo" /></label>
          <button class={`boton${armado === `anular-${seleccion.id}` ? ' peligro' : ''}`} onClick={() => dosToques(`anular-${seleccion.id}`, async () => {
            const motivo = (document.getElementById('wc-motivo') as HTMLInputElement | null)?.value ?? '';
            listo(await W.anularCarta(seleccion.id, motivo), 'Carta anulada.'); await cargarCartas();
          })}>{armado === `anular-${seleccion.id}` ? '¿Seguro? Toca otra vez' : 'Anular'}</button>
        </div>
      )}

      <h2>Anunciar y revelar</h2>
      <div class="wc-acciones">
        <button class="boton" disabled={!cartas.length} onClick={() => dosToques('anunciar', async () => listo(await W.anunciarCartas(cruce), 'Anuncio enviado a Discord.'))}>
          {armado === 'anunciar' ? '¿Mandar a Discord? Toca otra vez' : 'Anunciar las cartas en Discord'}</button>
        <span class="chico tenue">Un solo mensaje con la rareza de cada equipo. Solo las cartas de decisión muestran su nombre.</span>
      </div>
      {abiertos > 0
        ? <p class="tenue chico">La revelación se habilita cuando cierren los {abiertos} duelos que siguen abiertos en este cruce.</p>
        : cartas.length > 0 && <>
            <p class="chico">{revelado ? 'Este cruce ya se reveló. Si cambió algo, puedes volver a aplicar: actualiza los puntos sin repetir el anuncio.' : 'Vista previa, con el mismo cálculo que se guardará:'}</p>
            <div class="tabla-caja"><table class="tabla">
              <thead><tr><th>Equipo</th><th>Puntos de cartas</th><th>Detalle</th></tr></thead>
              <tbody>{ajustes.filter((a) => a.puntos || a.detalle.length).map((a) => <tr key={a.equipo}><td><b>{d.nombreEq(a.equipo)}</b></td><td><b>{puntosChile(a.puntos)}</b></td><td class="chico">{a.detalle.join(' · ') || '—'}</td></tr>)}</tbody>
            </table></div>
            <button class="boton principal" onClick={() => dosToques('revelar', revelar)}>{armado === 'revelar' ? '¿Revelar y aplicar? Toca otra vez' : revelado ? 'Volver a aplicar los puntos' : 'Revelar y aplicar'}</button>
          </>}
    </div>
  );
}

/** Controles de una carta de decisión. */
function AccionCarta({ carta, cruce, d, alTerminar }: { carta: W.WildCard; cruce: number; d: Datos; alTerminar: (txt: string | null, ok: string) => void }) {
  const k = cartaPorId(carta.carta!)!, eq = carta.equipo_id;
  const mios = d.duelos.filter((e) => d.equipoDe.get(e.a_perfil ?? '') === eq || d.equipoDe.get(e.b_perfil ?? '') === eq);
  const ladoDe = (e: V.Enfrentamiento) => (d.equipoDe.get(e.a_perfil ?? '') === eq ? 'a' : 'b');
  const pendientes = mios.filter((e) => e.estado === 'pendiente'), perdidos = mios.filter((e) => e.estado === 'cerrado' && e.ganador !== ladoDe(e) && e.ganador !== 'empate');
  const etiqueta = (e: V.Enfrentamiento) => `${d.persona(e.a_perfil)} vs ${d.persona(e.b_perfil)} (${nombreVersus('1v1', e.juego)})`;
  const [duelo, setDuelo] = useState(0);
  const [juego, setJuego] = useState('');
  const [ronda, setRonda] = useState(1);
  const [elegida, setElegida] = useState('');
  const [asignacion, setAsignacion] = useState<Record<number, string>>(() => Object.fromEntries(pendientes.map((e) => [e.id, (ladoDe(e) === 'a' ? e.a_perfil : e.b_perfil) ?? ''])));
  const jugadores = pendientes.map((e) => (ladoDe(e) === 'a' ? e.a_perfil : e.b_perfil)).filter(Boolean) as string[];
  const usar = async (datos: Record<string, unknown>, ok: string) => alTerminar(await W.usarCarta(carta.id, datos), ok);
  const selectDuelo = (lista: V.Enfrentamiento[]) => (
    <label>Duelo <select value={duelo} onChange={(e) => setDuelo(Number(e.currentTarget.value))}>
      <option value={0}>Elige…</option>{lista.map((e) => <option key={e.id} value={e.id}>{etiqueta(e)}</option>)}
    </select></label>
  );
  return (
    <section class="wc-accion" aria-label={`Usar ${k.nombre}`}>
      <h3>{k.emoji} {k.nombre} · {d.nombreEq(eq)}</h3>
      <p class="chico tenue">{k.efecto}</p>
      {k.id === 'cancha' && <>{selectDuelo(pendientes)}
        <label>Juego <select value={juego} onChange={(e) => setJuego(e.currentTarget.value)}><option value="">Elige…</option>
          {[...new Set(juegosDuelo(cruce))].map((j) => <option key={j} value={j}>{juegoPorId(j)?.nombre ?? j}</option>)}</select></label>
        <button class="boton principal" disabled={!duelo || !juego} onClick={() => usar({ duelo, juego }, 'Juego cambiado y anunciado.')}>Cambiar el juego</button></>}
      {k.id === 'doble_nada' && <>{selectDuelo(pendientes)}<button class="boton principal" disabled={!duelo} onClick={() => usar({ duelo }, 'Duelo apostado y anunciado.')}>Apostar este duelo</button></>}
      {k.id === 'revancha' && <>{selectDuelo(perdidos)}<button class="boton principal" disabled={!duelo} onClick={() => usar({ duelo }, 'El duelo se reabrió desde cero.')}>Jugar de nuevo este duelo</button></>}
      {k.id === 'segunda' && <>{selectDuelo(pendientes)}
        <label>Ronda <select value={ronda} onChange={(e) => setRonda(Number(e.currentTarget.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <button class="boton principal" disabled={!duelo} onClick={() => { const e = pendientes.find((x) => x.id === duelo)!; usar({ duelo, ronda, perfil: ladoDe(e) === 'a' ? e.a_perfil : e.b_perfil }, 'Ronda habilitada para repetir.'); }}>Habilitar la repetición</button></>}
      {k.id === 'cambio_rivales' && <>
        {pendientes.map((e) => <label key={e.id}>{etiqueta(e)} <select value={asignacion[e.id]} onChange={(ev) => setAsignacion({ ...asignacion, [e.id]: ev.currentTarget.value })}>
          {jugadores.map((p) => <option key={p} value={p}>{d.persona(p)}</option>)}</select></label>)}
        <button class="boton principal" onClick={() => usar({ asignacion: pendientes.map((e) => ({ duelo: e.id, perfil: asignacion[e.id] })) }, 'Rivales cambiados y anunciados.')}>Guardar el cambio</button></>}
      {k.id === 'mano' && <>
        <label>Carta <select value={elegida} onChange={(e) => setElegida(e.currentTarget.value)}><option value="">Elige…</option>
          {CARTAS.filter((x) => x.rareza !== 'legendaria' && x.id !== 'doble_carta' && x.id !== 'ruleta').map((x) => <option key={x.id} value={x.id}>{x.emoji} {x.nombre} ({RAREZAS[x.rareza].nombre})</option>)}</select></label>
        <button class="boton principal" disabled={!elegida} onClick={() => usar({ carta: elegida }, 'Carta elegida.')}>Elegir esta carta</button></>}
    </section>
  );
}
