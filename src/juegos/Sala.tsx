import { useEffect, useRef, useState } from 'preact/hooks';
import { fechaChile, generador } from '../nucleo/azar';
import { supabase, useSesion } from '../nucleo/supabase';
import { aspectoAleatorio, normalizarAspecto, normalizarPersonaje, type Aspecto } from '../personaje/catalogo';
import { HORIZONTALES, JUEGOS, MOTORES, TOPES, VERSUS, type Juego } from './catalogo';
import { Records } from './Records';
import { guardarMarca, historial, marcaLocal, tablaDelDia, type Fila, type Guardado } from './marcas';
import { clipsActivos } from '../nucleo/preferencias';
import { entregarClip, grabarClips, type Clips } from './clips';
import { Firma } from '../Progreso';
import { vitrinaLocal, vitrinas, type Vitrina } from './progreso';
import { CON_FANTASMA, decodificar, liderDelDia, type Fantasma } from './fantasma';
import { CARGADORES, ajustesPartida, jornadaDe, type Partida, type Resultado } from './marco';
import { estaCallado, fanfarria, silenciar } from './sonido';

// La "sala" envuelve a cualquier juego: pantalla previa, cuenta regresiva, partida, resultado y guardado.
// Sirve para el modo individual (marcas del día, intentos libres) y para una ronda de versus (un solo intento).

/** Una ronda de un enfrentamiento: el desafío lo entrega el servidor y solo se puede jugar una vez. */
export interface Reto {
  titulo: string;
  aviso: string;
  volver: string;
  /** Dónde practicar el mismo juego sin gastar el intento. */
  practica: string;
  /** Gasta el intento y devuelve la semilla. Si no se puede, lanza un error con el motivo. */
  empezar(): Promise<string>;
  /** Envía el resultado. Devuelve el motivo si falló. */
  terminar(r: Resultado): Promise<string | null>;
  /** Cada 2 segundos mientras se juega: cuánto lleva, por si la partida se corta. */
  latido?(puntaje: number): void;
  /** Jornada del enfrentamiento: fija la dificultad, igual para ambos lados. */
  nivel?: number;
}

/** Los puntos que muestra el marcador del juego ("120 pts"); los juegos que muestran avance ("3 / 10") cuentan 0. */
export const puntajeEnPantalla = (caja: HTMLElement | null) => Number(caja?.querySelector('.juego-hud .dato:last-child')?.textContent?.match(/(\d+)\s*pts/)?.[1] ?? 0);

export async function aspectoDe(usuarioId: string | null): Promise<Aspecto> {
  if (usuarioId) {
    const { data } = await supabase.from('personajes').select('apariencia').eq('perfil_id', usuarioId).maybeSingle();
    if (data) return normalizarAspecto(data.apariencia);
  }
  // Sin personaje guardado: el borrador del creador, o un invitado cualquiera
  try {
    const crudo = localStorage.getItem('susto.personaje');
    if (crudo) return normalizarPersonaje(JSON.parse(crudo)).apariencia;
  } catch { /* sin almacenamiento */ }
  return aspectoAleatorio(generador('invitado'));
}

function Tabla({ juego, fecha, usuarioId, version }: { juego: Juego; fecha: string; usuarioId: string | null; version: number }) {
  const [estado, setEstado] = useState<{ filas: Fila[]; disponible: boolean } | null>(null);
  const [vits, setVits] = useState<Map<string, Vitrina>>(new Map());
  useEffect(() => { vitrinas().then(setVits).catch(() => {}); }, []);
  useEffect(() => {
    let vigente = true;
    tablaDelDia(juego.id, fecha).then((r) => { if (vigente) setEstado(r); });
    return () => { vigente = false; };
  }, [juego.id, fecha, version]);

  if (!estado) return <p class="tenue chico">Cargando la tabla…</p>;
  if (!estado.disponible) return <p class="tenue chico">La tabla compartida todavía no está activada; por ahora tu marca queda anotada en este navegador.</p>;
  if (!estado.filas.length) return <p class="tenue chico">Nadie ha marcado hoy. La primera marca es tuya.</p>;
  const retable = VERSUS.some((t) => t.modo === '1v1' && t.base === juego.id), total = estado.filas.length, mio = estado.filas.findIndex((f) => f.perfil === usuarioId), top = estado.filas.slice(0, 8);
  const fila = (f: Fila, i: number) => (
    <li key={f.perfil} class={f.perfil === usuarioId ? 'mia' : ''}>
      <span class="puesto">{i + 1}</span><a class="quien" href={`#/perfil/${f.perfil}`}><Firma nombre={f.nombre} vitrina={vits.get(f.perfil)} /></a><b>{f.puntaje}</b>
      {usuarioId && f.perfil !== usuarioId && retable && <a class="retar-mini" href={`#/juegos/1v1/${f.perfil}.${juego.id}`} title={`Retar a ${f.nombre} a un duelo amistoso`}>Retar</a>}
    </li>
  );
  // Cuánto le falta para pasar a la persona de arriba (al empatar no se sube, así que se pide un punto más)
  const falta = mio > 0 ? estado.filas[mio - 1].puntaje - estado.filas[mio].puntaje + 1 : 0;
  return (
    <>
      {mio > 0 && <p class="falta chico">Te faltan <b>{falta}</b> para subir al puesto {mio}.</p>}
      {mio === 0 && total > 1 && <p class="falta chico">Vas primero hoy. ¡Defiende el puesto!</p>}
      <ol class="marcas">{top.map(fila)}{mio >= top.length && fila(estado.filas[mio], mio)}</ol>
    </>
  );
}

/** Tus últimas 5 partidas de este juego (en este navegador), como barritas, para ver si vas mejorando. */
function Historial({ juego, unidad, version }: { juego: string; unidad: string; version: number }) {
  const lista = historial(juego), tope = Math.max(1, ...lista.map((h) => h.puntaje));
  if (!lista.length) return null;
  const [primera, ultima] = [lista[0].puntaje, lista[lista.length - 1].puntaje];
  return (
    <div class="historial" key={version}>
      <div class="sigla">Tus últimas partidas</div>
      <ol>{lista.map((h, i) => <li key={h.hora} class={i === lista.length - 1 ? 'nueva' : ''} title={new Date(h.hora).toLocaleString('es-CL')}><span style={`height:${Math.max(6, (h.puntaje / tope) * 100)}%`} /><b>{h.puntaje}</b></li>)}</ol>
      {lista.length > 1 && <p class="chico tenue">{ultima > primera ? `Vas subiendo: +${ultima - primera} ${unidad} desde la primera.` : ultima < primera ? 'Bajaste un poco: ¡la próxima sale mejor!' : 'Parejo: misma marca que al principio.'}</p>}
    </div>
  );
}

/** El efecto del pase al hacer tu mejor marca: lluvia de dulces, murciélagos o fuegos artificiales. */
const LLUVIAS: Record<string, string[]> = { dulces: ['🍬', '🍭', '🍫', '🍬'], murcielagos: ['🦇'], fuegos: ['🎆', '✨', '🎇'] };
function Lluvia({ efecto }: { efecto: string }) {
  const caen = LLUVIAS[efecto];
  if (!caen) return null;
  return <div class="lluvia" aria-hidden="true">{Array.from({ length: 26 }, (_, i) => <span key={i} style={`left:${(i * 37) % 100}%;animation-delay:${(i % 9) * 0.18}s;font-size:${1.3 + (i % 4) * 0.35}rem`}>{caen[i % caen.length]}</span>)}</div>;
}

/** El resultado como texto para pegar en Discord, con una barra de emojis según qué tan cerca quedó del tope del juego. */
function textoResultado(juego: Juego, r: Resultado, mejor: boolean, contra: Fantasma | null): string {
  const tope = TOPES[juego.id], llenos = tope ? Math.max(0, Math.min(10, Math.round((r.puntaje / tope) * 10 * 1.6))) : 0;
  const barra = tope ? '🟧'.repeat(llenos) + '⬛'.repeat(10 - llenos) : '';
  return [
    `🎃 Las Sustolimpiadas · ${juego.nombre}`,
    `🏆 ${r.puntaje} ${juego.unidad}${mejor ? ' · ¡mi mejor marca de hoy!' : ''}`,
    barra,
    ...r.lineas.slice(0, 3).map(([que, cuanto]) => `▫️ ${que}: ${cuanto}`),
    contra ? (r.puntaje > contra.puntaje ? `👻 Le gané al fantasma de ${contra.nombre} (${contra.puntaje})` : `👻 El fantasma de ${contra.nombre} me ganó por ${contra.puntaje - r.puntaje + 1}`) : '',
    `¿Me superas? https://panchoso3234.github.io/sustolimpiadas/#/juegos/${juego.id}`,
  ].filter(Boolean).join('\n');
}

type Fase = 'previa' | 'cargando' | 'cuenta' | 'jugando' | 'resultado' | 'error';

export function Sala({ juego, reto }: { juego: Juego; reto?: Reto }) {
  const sesion = useSesion();
  const caja = useRef<HTMLDivElement>(null), partida = useRef<Partida | null>(null), turno = useRef(0);
  const [fase, setFase] = useState<Fase>('previa');
  const [cuenta, setCuenta] = useState(3);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [guardado, setGuardado] = useState<{ donde: Guardado; esMejor: boolean } | null>(null);
  const [envio, setEnvio] = useState<{ error: string | null } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [version, setVersion] = useState(0);
  const [callado, setCallado] = useState(estaCallado);
  const [ayuda, setAyuda] = useState(false);
  const [tutorial, setTutorial] = useState(true);
  const [girar, setGirar] = useState(true);
  const [pausa, setPausa] = useState(false);
  const [completa, setCompleta] = useState(false);
  const [avance, setAvance] = useState(0);
  // Fantasma del líder: quién es (si su marca trae recorrido) y si la partida en curso es contra él
  const [lider, setLider] = useState<Fantasma | null>(null);
  const contra = useRef<Fantasma | null>(null);
  // Clips: grabación continua del lienzo mientras dura la partida
  const clips = useRef<Clips | null>(null);
  const [clip, setClip] = useState('');
  const [copiado, setCopiado] = useState(false);
  const sala = useRef<HTMLDivElement>(null);
  const fecha = useRef(fechaChile(Date.now())).current, motor = MOTORES[juego.motor];
  const usuarioId = sesion.usuarioId, usuario = useRef(usuarioId);
  usuario.current = usuarioId;

  const cerrar = () => { turno.current++; clips.current?.detener(); clips.current = null; partida.current?.destruir(); partida.current = null; };
  const sacarClip = async () => {
    if (!clips.current || clip === 'preparando') return;
    setClip('preparando');
    const listo = await clips.current.guardar();
    if (!listo) { setClip('No se pudo grabar el clip en este navegador.'); setTimeout(() => setClip(''), 3000); return; }
    const como = await entregarClip(listo.blob, `sustolimpiadas-${juego.id}-${fecha}.${listo.extension}`);
    setClip(como === 'compartido' ? '¡Clip compartido!' : '🎬 Clip descargado: súbelo a Discord');
    setTimeout(() => setClip(''), 3500);
  };
  useEffect(() => cerrar, []);

  // Práctica: se juega igual, pero la marca no se guarda en ninguna parte
  const practica = useRef(false);
  const jugar = async (soloPractica = false, contraLider: Fantasma | null = null) => {
    cerrar();
    practica.current = !reto && soloPractica;
    contra.current = reto ? null : contraLider;
    const mio = turno.current;
    setFase('cargando');
    setResultado(null);
    setGuardado(null);
    setEnvio(null);
    setMotivo('');
    try {
      const [crear, aspecto] = await Promise.all([CARGADORES[juego.id](), aspectoDe(usuario.current)]);
      // En un enfrentamiento el intento se gasta aquí, cuando el juego ya está descargado
      const semilla = reto ? await reto.empezar() : contra.current?.semilla ?? `${juego.id}|${fecha}|${Math.random().toString(36).slice(2, 10)}`;
      if (mio !== turno.current || !caja.current) return;
      ajustesPartida.pausable = !reto; // en un enfrentamiento el reloj no se detiene al cambiar de pestaña
      ajustesPartida.vivo = ajustesPartida.foto = false;
      const nueva = await crear({
        caja: caja.current, semilla, aspecto, nivel: reto?.nivel ?? jornadaDe(fecha), fantasma: contra.current ?? undefined,
        alTerminar(r) {
          if (mio !== turno.current) return;
          setResultado(r);
          setFase('resultado');
          if (reto) { fanfarria(false); reto.terminar(r).then((error) => { if (mio === turno.current) setEnvio({ error }); }); }
          else if (practica.current) fanfarria(false);
          else {
            const previa = marcaLocal(juego.id, fecha);
            fanfarria(!previa || r.puntaje > previa.mejor);
            const prueba = import.meta.env.DEV ? decodificar(r.detalle.ruta) : null;
            if (prueba) try { localStorage.setItem(`susto.fantasmaPrueba.${juego.id}`, JSON.stringify({ nombre: 'Prueba', puntaje: r.puntaje, semilla, ...prueba })); localStorage.setItem('susto.pesoDetalle', String(JSON.stringify(r.detalle).length)); } catch { /* sin almacenamiento */ }
            const vsLider = contra.current ? { lider: contra.current.nombre, venceLider: r.puntaje > contra.current.puntaje } : {};
            guardarMarca(juego.id, fecha, r.puntaje, { ...r.detalle, semilla, ...vsLider }, usuario.current).then((g) => { if (mio === turno.current) { setGuardado(g); setVersion((v) => v + 1); } });
          }
        },
      });
      if (mio !== turno.current) return nueva.destruir();
      partida.current = nueva;
      const lienzo = caja.current?.querySelector('canvas');
      if (lienzo && clipsActivos()) clips.current = grabarClips(lienzo);
      // Cuenta regresiva: 3, 2, 1 y parte
      setFase('cuenta');
      setTutorial(true);
      for (let n = 3; n >= 1; n--) {
        setCuenta(n);
        await new Promise((listo) => setTimeout(listo, 750));
        if (mio !== turno.current) return;
      }
      setFase('jugando');
      setAyuda(true);
      setTutorial(false);
      setTimeout(() => { if (mio === turno.current) setAyuda(false); }, 6000);
      nueva.empezar();
    } catch (e) {
      if (mio !== turno.current) return;
      console.error(e);
      const texto = e instanceof Error ? e.message : String(e);
      // Una versión nueva del sitio: los archivos viejos ya no existen (la página se recarga sola, ver main.tsx)
      if (/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(texto)) setMotivo('Hay una versión nueva del sitio. Recarga la página (Ctrl+F5 o desliza hacia abajo en el celular) y vuelve a intentar.');
      else if (/WebGL|context/i.test(texto)) setMotivo('Tu navegador no pudo abrir los gráficos 3D. Cierra otras pestañas con juegos, activa la aceleración por hardware o prueba con otro navegador.');
      else setMotivo(reto ? texto : '');
      setFase('error');
    }
  };

  // El líder del día con recorrido grabado (se vuelve a pedir al volver a la previa o al resultado: puede haber cambiado)
  useEffect(() => {
    if (reto || !CON_FANTASMA.has(juego.id) || (fase !== 'previa' && fase !== 'resultado')) return;
    let vigente = true;
    liderDelDia(juego.id, fecha, usuarioId).then((l) => { if (vigente) setLider(l); }).catch(() => {});
    return () => { vigente = false; };
  }, [fase, usuarioId, version]);

  // Solo en pruebas: "?auto=1" parte la partida sin tocar nada, para tomar capturas; "&foto=1" además esconde todo lo que no es el juego
  useEffect(() => {
    const prueba = new URLSearchParams(location.search);
    if (!import.meta.env.DEV || reto || !prueba.has('auto')) return;
    if (prueba.has('foto')) document.body.classList.add('foto');
    jugar();
  }, []);

  // En un enfrentamiento: aviso antes de cerrar la pestaña y latido con lo que se lleva
  useEffect(() => {
    if (!reto || (fase !== 'cuenta' && fase !== 'jugando')) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    const latir = () => reto.latido?.(puntajeEnPantalla(caja.current));
    const reloj = fase === 'jugando' ? setInterval(latir, 2000) : undefined;
    if (fase === 'jugando') latir();
    return () => { window.removeEventListener('beforeunload', avisar); clearInterval(reloj); };
  }, [fase]);

  const salir = () => { pausar(false); cerrar(); setFase('previa'); };

  // Pausa a mano (solo en el modo individual): los motores la tratan igual que cambiar de pestaña
  const pausar = (si: boolean) => { setPausa(si); window.dispatchEvent(new CustomEvent('susto-pausa', { detail: si })); };
  useEffect(() => { if (fase !== 'jugando' && pausa) pausar(false); }, [fase]);

  // Pantalla completa de toda la sala (en iPhone el navegador no la permite: el botón no aparece)
  const puedeCompleta = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  useEffect(() => {
    const f = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => { document.removeEventListener('fullscreenchange', f); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);
  const alternarCompleta = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else sala.current?.requestFullscreen().catch(() => {}); };

  // Barra de carga: avanza sola hacia el 90 % mientras se descarga el juego y llega al 100 % cuando está listo
  useEffect(() => {
    if (fase !== 'cargando') { setAvance(0); return; }
    const t0 = performance.now(), reloj = setInterval(() => setAvance(Math.round(90 * (1 - Math.exp(-(performance.now() - t0) / 2500)))), 120);
    return () => clearInterval(reloj);
  }, [fase]);

  // Atajos: Enter juega (o juega otra vez), Esc sale de la partida, P pausa
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const escribiendo = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, a, button');
      if (escribiendo || e.repeat) return;
      if (e.key === 'Enter' && (fase === 'previa' || fase === 'resultado') && !(reto && fase === 'resultado')) { e.preventDefault(); jugar(fase === 'resultado' && practica.current); }
      else if (e.key === 'Escape' && !reto && (fase === 'jugando' || fase === 'cuenta') && !document.fullscreenElement) salir();
      else if ((e.key === 'p' || e.key === 'P') && !reto && fase === 'jugando') pausar(!pausa);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fase, pausa]);

  // El próximo juego abierto que todavía no juegas hoy, para encadenar la ronda del día
  const siguiente = (() => {
    const abiertos = JUEGOS.filter((j) => j.listo), desde = abiertos.findIndex((j) => j.id === juego.id);
    return [...abiertos.slice(desde + 1), ...abiertos.slice(0, desde)].find((j) => !marcaLocal(j.id, fecha)) ?? null;
  })();
  const local = marcaLocal(juego.id, fecha), volver = reto?.volver ?? '#/juegos';

  return (
    <div class={`sala fase-${fase}`} style={`--tono:${motor.color}`} ref={sala}>
      <div class="juego-caja" ref={caja} />
      {(fase === 'cuenta' || fase === 'jugando') && (
        <div class="sala-salir">
          {!reto && <button class="boton" title="Salir (Esc)" onClick={salir}>Salir</button>}
          {!reto && fase === 'jugando' && <button class="boton" aria-pressed={pausa} title="Pausa (P)" onClick={(ev) => { pausar(!pausa); ev.currentTarget.blur(); }}>{pausa ? 'Seguir' : 'Pausa'}</button>}
          <button class="boton" aria-pressed={callado} onClick={(ev) => { silenciar(!callado); setCallado(!callado); ev.currentTarget.blur(); }}>{callado ? 'Sonido: no' : 'Sonido: sí'}</button>
          {fase === 'jugando' && <button class="boton" aria-label="Cómo se juega" title="Cómo se juega" onClick={(ev) => { setAyuda(false); setTutorial(true); if (!reto) pausar(true); ev.currentTarget.blur(); }}>?</button>}
          {clips.current && fase === 'jugando' && <button class="boton" title="Guarda en video los últimos segundos de la partida" disabled={clip === 'preparando'} onClick={(ev) => { sacarClip(); ev.currentTarget.blur(); }}>🎬 Clip</button>}
          {puedeCompleta && <button class="boton" aria-pressed={completa} aria-label={completa ? 'Salir de pantalla completa' : 'Pantalla completa'} title="Pantalla completa" onClick={(ev) => { alternarCompleta(); ev.currentTarget.blur(); }}>{completa ? '⤡' : '⛶'}</button>}
        </div>
      )}
      {fase === 'jugando' && pausa && !tutorial && (
        <div class="sala-pausa" role="dialog" aria-label="Juego en pausa">
          <b>En pausa</b>
          <p class="chico">El reloj está detenido.</p>
          <button class="boton principal grande" onClick={() => pausar(false)}>Seguir jugando</button>
        </div>
      )}
      {clip && <div class="clip-aviso" role="status">{clip === 'preparando' ? '🎬 Preparando tu clip…' : clip}</div>}
      {fase === 'cuenta' && <div class="sala-cuenta" key={cuenta} aria-live="assertive">{cuenta}</div>}
      {(fase === 'cuenta' || fase === 'jugando') && tutorial && (fase === 'cuenta' || !ayuda) && (
        <div class="sala-tutorial" role="button" tabIndex={0} title="Toca para cerrar" onClick={() => { setTutorial(false); if (fase === 'jugando' && !reto) pausar(false); }}><b>Cómo se juega</b><p>{juego.controles}</p><span class="chico tenue">Toca para cerrar</span></div>
      )}
      {(fase === 'cuenta' || fase === 'jugando') && HORIZONTALES.has(juego.id) && girar && <button class="sala-girar" onClick={() => setGirar(false)}><b>↻ Gira el celular</b><span>Este juego se ve mejor de lado. Toca para seguir así.</span></button>}
      {fase === 'jugando' && ayuda && <div class="sala-teclas" aria-hidden="true">{juego.controles}</div>}
      {(fase === 'previa' || fase === 'cargando' || fase === 'error') && (
        <div class="sala-telon">
          <div class="sala-panel">
            <div class="sigla">{reto ? reto.titulo : `${motor.nombre} · juego ${juego.numero}`}</div>
            <h1>{juego.nombre}</h1>
            <p>{juego.idea}</p>
            <div class="como"><b>Cómo se juega</b><p>{juego.controles}</p></div>
            {reto
              ? <p class="aviso atencion">{reto.aviso}</p>
              : <p class="chico tenue">Premia: {juego.premia.toLowerCase()}. {local ? `Tu mejor marca de hoy: ${local.mejor} ${juego.unidad} en ${local.intentos} ${local.intentos === 1 ? 'intento' : 'intentos'}.` : 'Todavía no juegas hoy.'}</p>}
            {fase === 'error' && <p class="aviso error">{motivo || 'No se pudo cargar el juego. Revisa tu conexión y prueba de nuevo.'}</p>}
            {fase === 'cargando' && (
              <div class="carga" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance} aria-label="Cargando el juego">
                <span style={`width:${avance}%`} /><b>{avance} %</b>
              </div>
            )}
            <div class="fila">
              {!(reto && fase === 'error') && <button class="boton principal grande" disabled={fase === 'cargando'} onClick={() => jugar()}>{fase === 'cargando' ? 'Preparando…' : reto ? 'Jugar mi intento' : 'Jugar'}</button>}
              {reto && fase !== 'error' && <a class="boton" href={reto.practica}>Practicar primero</a>}
              {!reto && <button class="boton" disabled={fase === 'cargando'} onClick={() => jugar(true)} title="Juegas igual, pero la marca no se guarda">Práctica (no guarda)</button>}
              {!reto && lider && <button class="boton fantasma-boton" disabled={fase === 'cargando'} onClick={() => jugar(false, lider)} title="El mismo recorrido que hizo el líder de hoy, con su fantasma corriendo a tu lado">👻 Correr contra {lider.nombre} ({lider.puntaje})</button>}
              <a class="boton" href={volver}>{reto ? 'Volver a mis enfrentamientos' : 'Volver al portal'}</a>
            </div>
            {reto && <p class="chico tenue">Practicar abre el mismo juego en modo individual, con un desafío distinto: no gasta tu intento.</p>}
            {!reto && <Historial juego={juego.id} unidad={juego.unidad} version={version} />}
            {!reto && <><div class="sigla">Récords históricos</div><Records juego={juego.id} unidad={juego.unidad} version={version} /></>}
            {!reto && <><div class="sigla">Tabla de hoy</div><Tabla juego={juego} fecha={fecha} usuarioId={usuarioId} version={version} /></>}
            {!reto && <p class="chico tenue atajos">Atajos: Enter para jugar · P para pausar · Esc para salir.</p>}
          </div>
        </div>
      )}
      {fase === 'resultado' && guardado?.esMejor && vitrinaLocal().efecto && <Lluvia efecto={vitrinaLocal().efecto!} />}
      {fase === 'resultado' && resultado && (
        <div class="sala-telon">
          <div class="sala-panel">
            <div class="sigla">{juego.nombre} · resultado</div>
            <div class="puntaje"><b>{resultado.puntaje}</b><span>{juego.unidad}</span></div>
            {guardado?.esMejor && <p class="aviso ok">Es tu mejor marca de hoy.</p>}
            {contra.current && <p class={resultado.puntaje > contra.current.puntaje ? 'aviso ok' : 'aviso'}>{resultado.puntaje > contra.current.puntaje ? `👻 ¡Le ganaste al fantasma de ${contra.current.nombre}! (${contra.current.puntaje})` : `👻 El fantasma de ${contra.current.nombre} sigue arriba: ${contra.current.puntaje}. Te faltaron ${contra.current.puntaje - resultado.puntaje + 1}.`}</p>}
            <dl class="desglose">{resultado.lineas.map(([que, cuanto]) => <div key={que}><dt>{que}</dt><dd>{cuanto}</dd></div>)}</dl>
            {reto ? (
              <p class={envio?.error ? 'aviso error' : 'chico tenue'}>
                {!envio ? 'Enviando tu resultado…' : envio.error ? `No se pudo enviar el resultado: ${envio.error}` : 'Resultado enviado. Verás quién ganó cuando tu rival también haya jugado.'}
              </p>
            ) : (
              <p class="chico tenue">
                {practica.current ? 'Partida de práctica: no se guardó en ninguna parte.'
                  : !guardado ? 'Guardando tu marca…'
                  : guardado.donde === 'nube' ? 'Marca guardada en la tabla.'
                  : guardado.donde === 'sin-sesion' ? 'Entra con Discord para que tu marca aparezca en la tabla. Por ahora quedó anotada en este navegador.'
                  : 'No se pudo guardar en la tabla compartida; quedó anotada en este navegador.'}
              </p>
            )}
            <div class="fila">
              {!reto && <button class="boton principal grande" onClick={() => jugar(practica.current)}>{practica.current ? 'Practicar otra vez' : 'Jugar otra vez'}</button>}
              {!reto && lider && <button class="boton fantasma-boton" onClick={() => jugar(false, lider)}>👻 Contra {lider.nombre}</button>}
              {!reto && siguiente && <a class="boton" href={`#/juegos/${siguiente.id}`} title="El próximo juego que todavía no juegas hoy">Siguiente: {siguiente.nombre} →</a>}
              <a class={reto ? 'boton principal grande' : 'boton'} href={volver}>{reto ? 'Volver a mis enfrentamientos' : 'Volver al portal'}</a>
            </div>
            <button class="boton clip-boton" onClick={() => navigator.clipboard.writeText(textoResultado(juego, resultado, !!guardado?.esMejor, contra.current)).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2500); }, () => {})}>{copiado ? '✓ Copiado: pégalo en Discord' : '📋 Copiar mi resultado para Discord'}</button>
            {clips.current && <button class="boton clip-boton" disabled={clip === 'preparando'} onClick={sacarClip}>🎬 Guardar la jugada en video (los últimos segundos)</button>}
            {!reto && !siguiente && <p class="aviso ok">¡Jugaste todos los juegos de hoy!</p>}
            {!reto && <Historial juego={juego.id} unidad={juego.unidad} version={version} />}
            {!reto && <><div class="sigla">Récords históricos</div><Records juego={juego.id} unidad={juego.unidad} version={version} /></>}
            {!reto && <><div class="sigla">Tabla de hoy</div><Tabla juego={juego} fecha={fecha} usuarioId={usuarioId} version={version} /></>}
          </div>
        </div>
      )}
    </div>
  );
}
