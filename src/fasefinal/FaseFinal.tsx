import { useEffect, useState } from 'preact/hooks';
import { supabase, useSesion } from '../nucleo/supabase';
import * as V from '../juegos/duelos';
import { EQUIPOS_A_LA_FINAL, INDIVIDUALES_FINAL, calcularLiga, type LineaJugador } from '../juegos/liga';
import { PUNTOS_BASE, leerPuntos } from '../juegos/puntos';
import { listarAjustesCartas } from '../juegos/wcDatos';
import { Gala, PREMIOS } from './Gala';
import { FondoPixel, Retrato } from './Escena';
import * as FF from './ffDatos';
import { Tsukibet } from './Tsukibet';
import { PREGUNTAS } from './eventosPersonales';
import { AVATAR_MANUAL, type FichaTributo } from './foto';
import './fasefinal.css';

// FASE FINAL (ex «Arena», decisión del 19-11): gala simulada el lunes 23-11 a las 21:00. El nombre lo ven todos;
// el panel de la gala, solo la organización. El público ve los tributos, las reglas y TSUKIBET (desde el 23-11).
// Plan completo: vault, «02 Proyectos/TORNEO VALE Y RIGO/Fase Final - planificación.md».

export function FaseFinal() {
  const sesion = useSesion();
  const rol = sesion.perfil?.rol;
  // Solo en desarrollo: ?ffprueba muestra la vista de organización (panel con tributos inventados) sin iniciar sesión
  if (import.meta.env.DEV && location.search.includes('ffprueba')) return <Organizacion rolAdmin />;
  if (sesion.cargando) return <div class="pagina arena"><p class="tenue">Cargando…</p></div>;
  if (rol !== 'admin' && rol !== 'guardian') return <VistaPublica />;
  return <Organizacion rolAdmin={rol === 'admin'} />;
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

// Hora de la gala en Chile (verano, UTC−3)
const GALA = new Date('2026-11-23T21:00:00-03:00').getTime();
const COLORES = ['#ffd23c', '#7cffcb', '#ff7ab6', '#7fb4ff', '#ff9a3c', '#b98cff'];
const ficha = (id: string, nombre: string, avatares: Map<string, string | null>) => ({ id, nombre, avatar: AVATAR_MANUAL[id] ?? avatares.get(id) ?? null }) as FichaTributo;
const dos = (n: number) => String(n).padStart(2, '0');

/** Cartel 8 bits: cuenta regresiva hasta las 21:00, «EN VIVO» durante la gala y «TERMINADA» con los 6 ganadores. */
function Cartel({ terminadas }: { terminadas: number }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(id); }, []);
  const falta = Math.max(0, GALA - ahora), h = Math.floor(falta / 3.6e6), m = Math.floor(falta / 6e4) % 60, sg = Math.floor(falta / 1000) % 60;
  const fin = terminadas >= PREMIOS.length;
  return (
    <section class="ffp-cartel">
      <FondoPixel fondo={fin ? 'podio' : 'noche'} />
      <div class="ffp-cartel-texto">
        <p class="ffp-chico">LAS SUSTOLIMPIADAS · FASE 2</p>
        <h1>FASE FINAL</h1>
        {fin ? <p class="ffp-grande">¡GALA TERMINADA!</p>
          : falta > 0 ? <><p class="ffp-chico">LA GALA EMPIEZA EN</p><p class="ffp-reloj">{dos(h)}:{dos(m)}:{dos(sg)}</p><p class="ffp-chico">LUNES 23 DE NOVIEMBRE · 21:00 · EN VIVO POR DISCORD</p></>
          : <p class="ffp-grande ffp-vivo">● EN VIVO AHORA <span>simulación {Math.min(terminadas + 1, PREMIOS.length)} de {PREMIOS.length}</span></p>}
      </div>
    </section>
  );
}

/** Seis casillas: se van llenando con el ganador de cada simulación (lo guarda el panel al confirmar). */
function Muro({ sims, avatares }: { sims: FF.SimFF[]; avatares: Map<string, string | null> }) {
  return (
    <div class="ffp-muro">
      {PREMIOS.map((premio, k) => {
        const s = sims.find((x) => x.n === k + 1), g = s?.resultado?.ganador, nombre = s?.tributos.find((t) => t.id === g)?.nombre ?? '';
        return (
          <div key={k} class={g ? 'ffp-casilla ganada' : 'ffp-casilla'}>
            <span class="ffp-chico">SIMULACIÓN {k + 1}</span>
            {g ? <><span class="ffp-corona" aria-hidden="true">♛</span><Retrato t={ficha(g, nombre, avatares)} tam={64} activo /><b>{nombre}</b></> : <span class="ffp-incognita" aria-label="por jugar">?</span>}
            <span class="tenue chico">{premio}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Encuesta de 3 preguntas, abierta desde el 23-11 para todos; responderla da 5 multis (50 deseos). */
function Encuesta() {
  const sesion = useSesion();
  const [ya, setYa] = useState<boolean | null>(null);
  const [r, setR] = useState({ mejor: '', peor: '', agregar: '' });
  const [ocupado, setOcupado] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (sesion.usuarioId) FF.miEncuesta(sesion.usuarioId).then(setYa); }, [sesion.usuarioId]);
  const preguntas: [keyof typeof r, string][] = [['mejor', '¿Qué es lo que más te ha gustado del torneo y de la Fase Final?'], ['peor', '¿Qué no te gustó o qué mejorarías?'], ['agregar', '¿Qué le agregarías para la próxima?']];
  const enviar = async () => {
    setOcupado(true); setError('');
    try { const e = await FF.responderEncuesta(r.mejor, r.peor, r.agregar); if (e && !e.startsWith('Ya respondiste')) setError(e); else setYa(true); } finally { setOcupado(false); }
  };
  return (
    <section class="ffp-encuesta">
      <h2>Encuesta de Las Sustolimpiadas · premio: 5 multis</h2>
      {!sesion.usuarioId ? <p>Entra con Discord para responder y llevarte <b>5 multis (50 deseos)</b>.</p>
        : ya === null ? <p class="tenue">La encuesta todavía no está disponible.</p>
        : ya ? <p class="ffp-gracias">¡Gracias por responder! Tus <b>5 multis (50 deseos)</b> ya están en el Gachapón.</p>
        : <>
          <p>Responde 3 preguntas y te llevas <b>5 multis (50 deseos)</b> para el Gachapón. Una vez por persona.</p>
          {preguntas.map(([k, txt]) => <label key={k} class="ffp-pregunta">{txt}<textarea rows={2} maxLength={500} value={r[k]} onInput={(ev) => setR({ ...r, [k]: ev.currentTarget.value })} /></label>)}
          {error && <p class="aviso">{error}</p>}
          <button class="boton principal" disabled={ocupado || !r.mejor.trim() || !r.peor.trim() || !r.agregar.trim()} onClick={enviar}>{ocupado ? 'Enviando…' : 'Enviar y recibir 5 multis'}</button>
        </>}
    </section>
  );
}

/** Historial público: el relato completo de cada simulación oficial (se guarda al confirmarla en el panel). */
function Historial() {
  const [lista, setLista] = useState<FF.HistorialFF[] | null>(null);
  const [sel, setSel] = useState(0);
  const leer = () => FF.listarHistorial().then((l) => { setLista(l); setSel((x) => Math.min(x, Math.max(0, l.length - 1))); });
  useEffect(() => { leer(); const id = setInterval(leer, 60000); return () => clearInterval(id); }, []);
  if (!lista) return <p class="tenue">Cargando el historial…</p>;
  if (!lista.length) return <section class="ffp-historial"><h2>Historial de la gala</h2><p class="tenue">Todavía no termina ninguna simulación oficial. Aquí quedará el relato completo de cada una: etapas, eventos, cañonazos, paracaídas y podio.</p></section>;
  const h = lista[sel];
  return (
    <section class="ffp-historial">
      <h2>Historial de la gala</h2>
      <div class="ffp-selector" role="tablist">{lista.map((x, i) => <button key={x.n} role="tab" aria-selected={i === sel} class={i === sel ? 'activo' : ''} onClick={() => setSel(i)}>Simulación {x.n}</button>)}</div>
      <div class="ffp-hcab">
        <p class="ffp-chico">SIMULACIÓN {h.n} · {h.premio}</p>
        <p class="ffp-grande">♛ {h.ganador}</p>
        <p class="tenue chico">{h.fecha ? new Date(h.fecha).toLocaleString('es-CL') : ''} · ritmo {h.ritmo} · {h.dias} días · {h.tributos} tributos</p>
        <ol class="ffp-podio">{h.top3.map((x, i) => <li key={i}><b>{['1.º', '2.º', '3.º'][i]}</b> {x}</li>)}</ol>
        {h.eliminaciones.length > 0 && <p class="chico">Más eliminaciones: {h.eliminaciones.slice(0, 3).map((x) => `${x.nombre} (${x.n})`).join(', ')}</p>}
        {h.paracaidas.length > 0 && <p class="chico">Paracaídas: {h.paracaidas.map((x) => `${x.de} → ${x.para}${x.nivel === 2 ? ' (grande)' : ''}`).join(' · ')}</p>}
      </div>
      {h.pasos.map((p, i) => (
        <details key={i} class={`ffp-etapa ${p.tipo}`} open={i < 2}>
          <summary>{p.titulo}{p.tipo === 'caidos' ? '' : ` · ${p.lineas.length} eventos`}</summary>
          {p.intro && <p class="tenue"><i>{p.intro}</i></p>}
          <ul>{p.lineas.map((l, j) => <li key={j} class={l.m.length ? 'muerte' : ''}>{l.m.length ? '💀 ' : ''}{l.t}</li>)}</ul>
        </details>
      ))}
    </section>
  );
}

function VistaPublica() {
  const [pestana, setPestana] = useState<'portada' | 'historial'>('portada');
  return (
    <>
      <div class="ffp-selector ffp-pestanas" role="tablist" aria-label="FASE FINAL">
        <button role="tab" aria-selected={pestana === 'portada'} class={pestana === 'portada' ? 'activo' : ''} onClick={() => setPestana('portada')}>Portada</button>
        <button role="tab" aria-selected={pestana === 'historial'} class={pestana === 'historial' ? 'activo' : ''} onClick={() => setPestana('historial')}>📜 Historial</button>
      </div>
      {pestana === 'portada' ? <Portada /> : <div class="pagina pagina-ancha arena"><Historial /></div>}
    </>
  );
}

function Portada() {
  const { personal, avatares, orden } = useTributos();
  const [sims, setSims] = useState<FF.SimFF[]>([]);
  useEffect(() => { const leer = () => FF.listarSims().then(setSims); leer(); const id = setInterval(leer, 30000); return () => clearInterval(id); }, []);
  const tributos = (personal ?? []).filter((j) => j.clasifica);
  const rango = (j: LineaJugador) => (j.clasifica === 'especial' ? 99 : orden.indexOf(j.equipo?.nombre ?? ''));
  const ordenados = [...tributos].sort((a, b) => rango(a) - rango(b) || b.puntos - a.puntos);
  const terminadas = sims.filter((s) => s.resultado).length;
  return (
    <div class="pagina pagina-ancha arena">
      <Cartel terminadas={terminadas} />
      <Encuesta />
      <p>Son <b>6 simulaciones</b>, todos contra todos. Quien gana una sale de las siguientes, así que habrá 6 ganadores distintos.</p>
      <h2>Campeones de la noche</h2>
      <Muro sims={sims} avatares={avatares} />
      <h2>Los {tributos.length || ''} tributos</h2>
      {!personal ? <p class="tenue">Cargando…</p> : <>
        <p class="tenue chico">Por su equipo: los integrantes (sin staff) de los {EQUIPOS_A_LA_FINAL} mejores equipos de la tabla. Cupo especial: los {INDIVIDUALES_FINAL} mejores puntajes personales del resto.</p>
        <ul class="ffp-cromos">
          {ordenados.map((j) => {
            const r = rango(j), color = r === 99 ? '#e8e1cc' : COLORES[r % COLORES.length], ganador = sims.some((s) => s.resultado?.ganador === j.id);
            return (
              <li key={j.id} class="ffp-cromo" style={`--c:${color}`}>
                {ganador && <span class="ffp-corona" title="Ganó una simulación">♛</span>}
                <Retrato t={ficha(j.id, j.nombre, avatares)} tam={72} />
                <b class="ffp-nombre">{j.nombre}</b>
                <span class="ffp-equipo-n">{j.clasifica === 'especial' ? 'Cupo especial' : j.equipo?.nombre}</span>
                <span class="ffp-datos"><span>{j.puntos.toLocaleString('es-CL')} pts</span><span>{j.ganados}G · {j.perdidos}P</span></span>
              </li>
            );
          })}
        </ul>
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

/** Organización y staff: selector entre lo que ve el público y la administración de la FASE FINAL (se recuerda la última). */
function Organizacion({ rolAdmin }: { rolAdmin: boolean }) {
  const [vista, setVista] = useState<'admin' | 'publico'>(() => { try { return localStorage.getItem('ff-vista') === 'publico' ? 'publico' : 'admin'; } catch { return 'admin'; } });
  const cambiar = (v: 'admin' | 'publico') => { setVista(v); try { localStorage.setItem('ff-vista', v); } catch { /* sin almacenamiento */ } };
  return (
    <>
      <div class="ffp-selector" role="tablist" aria-label="Vista de FASE FINAL">
        <button role="tab" aria-selected={vista === 'admin'} class={vista === 'admin' ? 'activo' : ''} onClick={() => cambiar('admin')}>⚙ Administración</button>
        <button role="tab" aria-selected={vista === 'publico'} class={vista === 'publico' ? 'activo' : ''} onClick={() => cambiar('publico')}>👁 Lo que ve el público</button>
      </div>
      {vista === 'publico' ? <VistaPublica /> : <VistaStaff rolAdmin={rolAdmin} />}
    </>
  );
}

/** Respuestas de la encuesta (solo admin; la base solo se las entrega al admin). */
function Respuestas() {
  const [lista, setLista] = useState<{ perfil_id: string; mejor: string; peor: string; agregar: string; creado: string }[] | null>(null);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState('');
  const leer = async () => {
    const [r, p] = await Promise.all([supabase.from('ff_encuesta').select('perfil_id,mejor,peor,agregar,creado').order('creado', { ascending: false }), supabase.from('perfiles').select('id,nombre')]);
    if (r.error) { setError(/does not exist|Could not find/.test(r.error.message) ? 'Falta ejecutar supabase/2026-11-23-fase-final-encuesta.sql en Supabase.' : r.error.message); setLista([]); return; }
    setError(''); setLista((r.data ?? []) as never);
    setNombres(new Map(((p.data ?? []) as { id: string; nombre: string }[]).map((x) => [x.id, x.nombre])));
  };
  useEffect(() => { leer(); }, []);
  return (
    <section class="ffp-respuestas">
      <h2>Respuestas de la encuesta {lista ? `(${lista.length})` : ''} <button class="boton" onClick={leer}>Actualizar</button></h2>
      {error && <p class="aviso">{error}</p>}
      {!lista ? <p class="tenue">Cargando…</p> : !lista.length ? <p class="tenue">Todavía nadie responde.</p> : (
        <ul>{lista.map((x) => (
          <li key={x.perfil_id}>
            <p class="ffp-quien"><b>{nombres.get(x.perfil_id) ?? 'Alguien'}</b> <span class="tenue chico">{new Date(x.creado).toLocaleString('es-CL')}</span></p>
            <p><b>Lo que más le gustó:</b> {x.mejor}</p>
            <p><b>Lo que no le gustó / mejoraría:</b> {x.peor}</p>
            <p><b>Qué agregaría:</b> {x.agregar}</p>
          </li>
        ))}</ul>
      )}
    </section>
  );
}

/** Preguntas «¿Quién…?» para mostrar entre simulaciones (pantalla compartida). */
function Preguntas() {
  const [i, setI] = useState(0); const [ver, setVer] = useState(false);
  const q = PREGUNTAS[i];
  const mover = (d: number) => { setI((x) => (x + d + PREGUNTAS.length) % PREGUNTAS.length); setVer(false); };
  return (
    <section class="ffp-pregunta-caja">
      <p class="ffp-chico">PREGUNTA PARA EL PÚBLICO · {i + 1} DE {PREGUNTAS.length}</p>
      <p class="ffp-pregunta-texto">{q.pregunta}</p>
      <ol class="ffp-opciones">{q.opciones.map((o, k) => <li key={k} class={ver && k === q.correcta ? 'correcta' : ver ? 'apagada' : ''}>{o}{ver && k === q.correcta ? ' ✔' : ''}</li>)}</ol>
      {ver && q.nota && <p class="tenue">{q.nota}</p>}
      <div class="ff-controles">
        <button class="boton" onClick={() => mover(-1)}>← Anterior</button>
        <button class="boton principal" onClick={() => setVer(!ver)}>{ver ? 'Ocultar respuesta' : 'Mostrar respuesta'}</button>
        <button class="boton" onClick={() => mover(1)}>Siguiente →</button>
      </div>
    </section>
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
      <p class="aviso">Solo la organización y el staff ven esta vista. Usa «Lo que ve el público» para revisar la portada. Gala: <b>lunes 23-11, 21:00</b>.</p>
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
      {rolAdmin && <><h2>Panel de la gala</h2><Gala /><h2>Preguntas para el público</h2><Preguntas /><Respuestas /></>}
    </div>
  );
}
