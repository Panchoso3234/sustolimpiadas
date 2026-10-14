import { useEffect, useRef, useState } from 'preact/hooks';
import { fechaChile, generador } from '../nucleo/azar';
import { supabase, useSesion } from '../nucleo/supabase';
import { aspectoAleatorio, normalizarAspecto, normalizarPersonaje, type Aspecto } from '../personaje/catalogo';
import { MOTORES, VERSUS, type Juego } from './catalogo';
import { guardarMarca, marcaLocal, tablaDelDia, type Fila, type Guardado } from './marcas';
import { CARGADORES, type Partida, type Resultado } from './marco';
import { PUNTOS_BASE, leerPuntos, puntosPorPuesto, type Puntos } from './puntos';
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
}

/** Los puntos que muestra el marcador del juego ("120 pts"); los juegos que muestran avance ("3 / 10") cuentan 0. */
const puntajeEnPantalla = (caja: HTMLElement | null) => Number(caja?.querySelector('.juego-hud .dato:last-child')?.textContent?.match(/(\d+)\s*pts/)?.[1] ?? 0);

async function aspectoDe(usuarioId: string | null): Promise<Aspecto> {
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
  const [puntos, setPuntos] = useState<Puntos>(PUNTOS_BASE);
  useEffect(() => { leerPuntos().then(setPuntos); }, []);
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
      <span class="puesto">{i + 1}</span><a class="quien" href={`#/perfil/${f.perfil}`}>{f.nombre}</a><b>{f.puntaje}</b><span class="torneo" title="Puntos del torneo por este puesto">+{puntosPorPuesto(puntos, i, total)}</span>
      {usuarioId && f.perfil !== usuarioId && retable && <a class="retar-mini" href={`#/juegos/1v1/${f.perfil}.${juego.id}`} title={`Retar a ${f.nombre} a un duelo amistoso`}>Retar</a>}
    </li>
  );
  return <ol class="marcas">{top.map(fila)}{mio >= top.length && fila(estado.filas[mio], mio)}</ol>;
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
  const fecha = useRef(fechaChile(Date.now())).current, motor = MOTORES[juego.motor];
  const usuarioId = sesion.usuarioId, usuario = useRef(usuarioId);
  usuario.current = usuarioId;

  const cerrar = () => { turno.current++; partida.current?.destruir(); partida.current = null; };
  useEffect(() => cerrar, []);

  // Práctica: se juega igual, pero la marca no se guarda en ninguna parte
  const practica = useRef(false);
  const jugar = async (soloPractica = false) => {
    cerrar();
    practica.current = !reto && soloPractica;
    const mio = turno.current;
    setFase('cargando');
    setResultado(null);
    setGuardado(null);
    setEnvio(null);
    setMotivo('');
    try {
      const [crear, aspecto] = await Promise.all([CARGADORES[juego.id](), aspectoDe(usuario.current)]);
      // En un enfrentamiento el intento se gasta aquí, cuando el juego ya está descargado
      const semilla = reto ? await reto.empezar() : `${juego.id}|${fecha}|${Math.random().toString(36).slice(2, 10)}`;
      if (mio !== turno.current || !caja.current) return;
      const nueva = await crear({
        caja: caja.current, semilla, aspecto,
        alTerminar(r) {
          if (mio !== turno.current) return;
          setResultado(r);
          setFase('resultado');
          if (reto) { fanfarria(false); reto.terminar(r).then((error) => { if (mio === turno.current) setEnvio({ error }); }); }
          else if (practica.current) fanfarria(false);
          else {
            const previa = marcaLocal(juego.id, fecha);
            fanfarria(!previa || r.puntaje > previa.mejor);
            guardarMarca(juego.id, fecha, r.puntaje, { ...r.detalle, semilla }, usuario.current).then((g) => { if (mio === turno.current) { setGuardado(g); setVersion((v) => v + 1); } });
          }
        },
      });
      if (mio !== turno.current) return nueva.destruir();
      partida.current = nueva;
      // Cuenta regresiva: 3, 2, 1 y parte
      setFase('cuenta');
      for (let n = 3; n >= 1; n--) {
        setCuenta(n);
        await new Promise((listo) => setTimeout(listo, 750));
        if (mio !== turno.current) return;
      }
      setFase('jugando');
      nueva.empezar();
    } catch (e) {
      if (mio !== turno.current) return;
      setMotivo(reto && e instanceof Error ? e.message : '');
      setFase('error');
    }
  };

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

  const salir = () => { cerrar(); setFase('previa'); };
  const local = marcaLocal(juego.id, fecha), volver = reto?.volver ?? '#/juegos';

  return (
    <div class={`sala fase-${fase}`} style={`--tono:${motor.color}`}>
      <div class="juego-caja" ref={caja} />
      {(fase === 'cuenta' || fase === 'jugando') && (
        <div class="sala-salir">
          {!reto && <button class="boton" onClick={salir}>Salir</button>}
          <button class="boton" aria-pressed={callado} onClick={(ev) => { silenciar(!callado); setCallado(!callado); ev.currentTarget.blur(); }}>{callado ? 'Sonido: no' : 'Sonido: sí'}</button>
        </div>
      )}
      {fase === 'cuenta' && <div class="sala-cuenta" key={cuenta} aria-live="assertive">{cuenta}</div>}
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
            <div class="fila">
              {!(reto && fase === 'error') && <button class="boton principal grande" disabled={fase === 'cargando'} onClick={() => jugar()}>{fase === 'cargando' ? 'Preparando…' : reto ? 'Jugar mi intento' : 'Jugar'}</button>}
              {reto && fase !== 'error' && <a class="boton" href={reto.practica}>Practicar primero</a>}
              {!reto && <button class="boton" disabled={fase === 'cargando'} onClick={() => jugar(true)} title="Juegas igual, pero la marca no se guarda">Práctica (no guarda)</button>}
              <a class="boton" href={volver}>{reto ? 'Volver a mis enfrentamientos' : 'Volver al portal'}</a>
            </div>
            {reto && <p class="chico tenue">Practicar abre el mismo juego en modo individual, con un desafío distinto: no gasta tu intento.</p>}
            {!reto && <><div class="sigla">Tabla de hoy</div><Tabla juego={juego} fecha={fecha} usuarioId={usuarioId} version={version} /></>}
          </div>
        </div>
      )}
      {fase === 'resultado' && resultado && (
        <div class="sala-telon">
          <div class="sala-panel">
            <div class="sigla">{juego.nombre} · resultado</div>
            <div class="puntaje"><b>{resultado.puntaje}</b><span>{juego.unidad}</span></div>
            {guardado?.esMejor && <p class="aviso ok">Es tu mejor marca de hoy.</p>}
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
              <a class={reto ? 'boton principal grande' : 'boton'} href={volver}>{reto ? 'Volver a mis enfrentamientos' : 'Volver al portal'}</a>
            </div>
            {!reto && <><div class="sigla">Tabla de hoy</div><Tabla juego={juego} fecha={fecha} usuarioId={usuarioId} version={version} /></>}
          </div>
        </div>
      )}
    </div>
  );
}
