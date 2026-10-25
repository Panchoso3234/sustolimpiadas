import { useEffect, useRef, useState } from 'preact/hooks';
import { fechaChile, generador } from '../nucleo/azar';
import { supabase, useSesion } from '../nucleo/supabase';
import { aspectoAleatorio, normalizarAspecto, type Aspecto } from '../personaje/catalogo';
import * as V from '../juegos/duelos';
import { JUEGOS } from '../juegos/catalogo';
import { CARGADORES, ajustesPartida, type ContextoVivo, type CrearJuego, type Partida as Juego } from '../juegos/marco';
import { aspectoDe, puntajeEnPantalla } from '../juegos/Sala';
import { repartir, rondasDistintas, rondaSiguiente } from './asientos';
import { capturar, limpiar } from './espejo';
import { DUELOS } from './formatos';
import { asientosValidos, debeReiniciar, identidadVivo, rondaComun, type Oficial } from './PantallaVivo';
import { BotonAvisar } from '../juegos/BotonAvisar';
import { Carita } from '../personaje/Carita';
import { Prediccion, cerrarVivo, empezarVivo, idPartidaVivo } from './Prediccion';
import { PuntosDuelo } from './PuntosDuelo';
import { unirse, type Presente, type Sala } from './sala';
import { COLOR_LADO, ladoDe, type Lado } from './tablero';
import { anunciarSala } from './vestibulo';

// Duelo en vivo con el juego individual de siempre, en pantalla dividida o por turnos (ver `formatos.ts`).
// Cada jugador corre su propia partida en su navegador (mismo desafío que el diferido) y manda su puntaje,
// lo que lleva y fotos de su pantalla; el rival y los espectadores las ven al lado. En un oficial cada uno
// guarda su propio resultado, igual que en diferido: el servidor compara y reparte los puntos.
const ESPERA_ABANDONO = 30;
interface Estado { partida: number; asientos: [string, string] | null; v: number; puntos: Record<Lado, number | null>; abandono: string | null; /** Cuándo parte (reloj del anfitrión). */ inicio: number | null }
const nueva = (partida = 1): Estado => ({ partida, asientos: null, v: 0, puntos: { a: null, b: null }, abandono: null, inicio: null });
/** Margen para que los dos alcancen a cargar el juego antes de la cuenta común. */
const MARGEN_INICIO = 6000;
const puntajeValido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= -1e6 && n <= 1e7;
const LADOS: Lado[] = ['a', 'b'];
// Los juegos del mismo mundo tienen su propia versión para dos (el anfitrión simula; ver mundo/red.ts)
const MUNDOS: Record<string, () => Promise<CrearJuego>> = {
  sumo: () => import('./mundo/sumo').then((m) => m.sumo),
  tanques: () => import('./mundo/tanques').then((m) => m.tanques),
  bloques: () => import('./mundo/bloques').then((m) => m.bloques),
  bestias: () => import('../juegos/arcade/bestias').then((m) => m.crear),
};
/** El personaje de otra persona (o uno sorteado, si no tiene o es invitado). */
async function aspectoDeOtro(id: string): Promise<Aspecto> {
  try { const { data } = await supabase.from('personajes').select('apariencia').eq('perfil_id', id).maybeSingle(); if (data) return normalizarAspecto(data.apariencia); } catch { /* invitado o sin conexión */ }
  return aspectoAleatorio(generador(`personaje|${id}`));
}

export function SalaDuelo({ codigo, mirar = false, oficial }: { codigo: string; mirar?: boolean; oficial?: Oficial }) {
  const sesion = useSesion();
  const juego = oficial?.e.juego ?? codigo.split('-')[0], formato = DUELOS[juego], ficha = JUEGOS.find((j) => j.id === juego);
  const yo = identidadVivo(sesion.usuarioId, sesion.perfil?.nombre);
  const fijos = oficial ? [oficial.e.a_perfil!, oficial.e.b_perfil!] as [string, string] : null;
  const quiere = mirar || (fijos && !fijos.includes(yo.id)) ? 'mirar' : 'jugar';
  const primera = oficial ? (oficial.rivalJugadas ? rondaComun(oficial.jugadas, oficial.rivalJugadas, oficial.e.rondas) : rondaSiguiente(oficial.jugadas, oficial.e.rondas)) ?? oficial.e.rondas : 1;
  const [p, setP] = useState<Estado>(() => { let g = nueva(primera); try { g = { ...g, ...JSON.parse(localStorage.getItem(`susto.vivo.${codigo}`) ?? '{}') }; } catch { /* sin respaldo */ } return debeReiniciar(g.partida, primera, !!oficial) ? nueva(primera) : g; });
  const [presentes, setPresentes] = useState<Presente[]>([]);
  const [aviso, setAviso] = useState(''), [ahora, setAhora] = useState(Date.now()), [ausente, setAusente] = useState<number | null>(null);
  // Lo que lleva cada uno mientras juega (llega cada medio segundo)
  const [llevan, setLlevan] = useState<Record<Lado, number>>({ a: 0, b: 0 });
  const [fase, setFase] = useState<'nada' | 'cargando' | 'cuenta' | 'jugando' | 'listo'>('nada'), [cuenta, setCuenta] = useState(3);
  const oyenteMundo = useRef<Parameters<ContextoVivo['alRecibir']>[0] | null>(null);
  const sala = useRef<Sala | null>(null), est = useRef(p), anfitrionRef = useRef<string | null>(null), sentadosRef = useRef<string[]>([]);
  const fijar = (y: Estado) => { est.current = y; setP(y); };
  // Conexión con cada pestaña: ida y vuelta en ms y cuánto adelanta su reloj al mío (para la cuenta común)
  const red = useRef(new Map<string, { rtt: number; desfase: number }>()), [, setPulso] = useState(0);
  const mandar = (y: Estado) => sala.current?.enviar('estado', y as unknown as Record<string, unknown>);

  useEffect(() => { try { localStorage.setItem(`susto.vivo.${codigo}`, JSON.stringify(p)); } catch { /* sin almacenamiento */ } }, [p]);
  useEffect(() => { const r = setInterval(() => setAhora(Date.now()), 500); return () => clearInterval(r); }, []);

  // El espejo: la última foto de cada lado, pintada en su pantallita
  const espejos = useRef<Record<Lado, HTMLDivElement | null>>({ a: null, b: null }), fotos = useRef<Record<Lado, { img?: string; html?: string } | null>>({ a: null, b: null });
  const pintarEspejo = (l: Lado) => {
    const caja = espejos.current[l], f = fotos.current[l];
    if (!caja || !f) return;
    if (typeof f.img === 'string' && f.img.startsWith('data:image/jpeg;base64,')) {
      let img = caja.querySelector(':scope > img') as HTMLImageElement | null;
      if (!img) { caja.replaceChildren(); img = document.createElement('img'); img.alt = ''; caja.appendChild(img); }
      img.src = f.img;
    } else if (typeof f.html === 'string') {
      const limpio = limpiar(f.html);
      if (limpio) { const marco = document.createElement('div'); marco.className = 'espejo-mesa'; marco.appendChild(limpio); caja.replaceChildren(marco); }
    }
  };

  /** Anota el puntaje final de un lado (lo hacen todos igual al recibirlo). */
  const anotar = (lado: Lado, puntaje: number) => {
    const x = est.current;
    if (!x.asientos || x.puntos[lado] !== null || x.abandono) return;
    fijar({ ...x, puntos: { ...x.puntos, [lado]: puntaje }, v: x.v + 1 });
  };

  useEffect(() => {
    if (sesion.cargando || !formato) return;
    let ultimoPedido = 0;
    const pedir = () => { if (Date.now() - ultimoPedido > 3000) { ultimoPedido = Date.now(); s.enviar('pedir', {}); } };
    const s = unirse(codigo, yo, quiere, setPresentes, (evento, d, de) => {
      const x = est.current, quien = de.split(':')[0], sentados = x.asientos ?? fijos ?? sentadosRef.current, sentado = sentados.includes(quien), deAnfitrion = de === anfitrionRef.current;
      // shortcut: el remitente se puede falsificar por el respaldo de Supabase; frena a un espectador común (ver tanda 1)
      if (evento === 'pedir') { if (s.clave === anfitrionRef.current) s.enviar('estado', x as unknown as Record<string, unknown>); return; }
      if (evento === 'ping') { if (typeof d.t === 'number') s.enviar('pong', { t: d.t, ahora: Date.now() }, de); return; }
      if (evento === 'pong') {
        if (typeof d.t !== 'number' || typeof d.ahora !== 'number') return;
        const rtt = Math.max(0, Date.now() - d.t), previo = red.current.get(de), desfase = d.ahora + rtt / 2 - Date.now();
        // Se suaviza: un mensaje que llegó tarde por el respaldo no mueve de golpe la cuenta
        red.current.set(de, previo ? { rtt: Math.round(previo.rtt * 0.6 + rtt * 0.4), desfase: previo.desfase * 0.6 + desfase * 0.4 } : { rtt, desfase });
        setPulso((n) => n + 1);
        return;
      }
      if (evento === 'estado') {
        const pts = d.puntos as Record<string, unknown> | undefined;
        if (!(deAnfitrion || sentado) || !Number.isInteger(d.partida) || !Number.isInteger(d.v) || !pts || !LADOS.every((l) => pts[l] === null || puntajeValido(pts[l]))) return;
        if (d.asientos !== null && !asientosValidos(d.asientos, fijos)) return;
        // Los puntajes se escriben una sola vez: si el mensaje trae uno que me falta, lo anoto aunque la versión no sea mayor
        if (d.partida === x.partida && x.asientos) for (const l of LADOS) if (x.puntos[l] === null && pts[l] !== null) anotar(l, pts[l] as number);
        if ((d.partida as number) < x.partida || ((d.partida as number) === x.partida && (d.v as number) <= est.current.v)) return;
        // Si ya sé el puntaje de alguien que el otro aún no anotó, no lo pierdo
        const misma = d.partida === x.partida, puntos = { a: (pts.a as number | null) ?? (misma ? est.current.puntos.a : null), b: (pts.b as number | null) ?? (misma ? est.current.puntos.b : null) };
        const asientos = d.asientos as [string, string] | null;
        fijar({ partida: d.partida as number, asientos, v: d.v as number, puntos, abandono: typeof d.abandono === 'string' && asientos?.includes(d.abandono) ? d.abandono : null, inicio: typeof d.inicio === 'number' && Number.isFinite(d.inicio) ? d.inicio : null });
        return;
      }
      if ((evento === 'mundo' || evento === 'entrada' || evento === 'rescate') && d.partida === x.partida && (sentado || deAnfitrion)) { oyenteMundo.current?.(evento, d, x.asientos ? ladoDe(x.asientos, quien) : null, deAnfitrion); return; }
      if (!sentado) return;
      const lado = x.asientos ? ladoDe(x.asientos, quien) : null;
      if (evento === 'resultado') { if (lado && d.partida === x.partida && puntajeValido(d.puntaje)) { anotar(lado, d.puntaje); if (quien !== yo.id) suyas.current.add(x.partida); } return; }
      if (evento === 'marcador') { if (lado && d.partida === x.partida && puntajeValido(d.puntaje)) setLlevan((v) => ({ ...v, [lado]: d.puntaje as number })); return; }
      if (evento === 'foto') { if (lado && d.partida === x.partida && String(d.img ?? '').length < 150000 && String(d.html ?? '').length < 90000) { fotos.current[lado] = { img: d.img as string | undefined, html: d.html as string | undefined }; pintarEspejo(lado); } return; }
      if (evento === 'revancha') { if (Number.isInteger(d.partida) && (d.partida as number) > x.partida && rondaLibre(d.partida as number)) { fijar(nueva(d.partida as number)); s.marcarListo(0); } return; }
      if (evento === 'abandono') { if (d.partida === x.partida && typeof d.ganador === 'string' && x.asientos?.includes(d.ganador) && !x.abandono) fijar({ ...x, abandono: d.ganador, v: x.v + 1 }); return; }
    }, fijos);
    sala.current = s;
    const t0 = setTimeout(() => s.enviar('pedir', {}), 800);
    // Medir la conexión cada 2 s (sirve para mostrarla y para sincronizar la cuenta)
    const tPing = setInterval(() => s.enviar('ping', { t: Date.now() }), 2000);
    // Quien llega tarde o recarga pide el estado; si el anfitrión no contestó, lo vuelve a pedir
    const t1 = setInterval(() => { if (!est.current.asientos) pedir(); }, 5000);
    return () => { clearTimeout(t0); clearInterval(t1); clearInterval(tPing); s.salir(); };
  }, [codigo, sesion.cargando, yo.id]);

  const { asientos, puntos } = p;
  const reparto = repartir(presentes, asientos, fijos), sentados = reparto.jugadores;
  sentadosRef.current = sentados;
  anfitrionRef.current = repartir(presentes, null, fijos).anfitrion;
  const soyAnfitrion = !!anfitrionRef.current && anfitrionRef.current === sala.current?.clave;
  const nombre = (id: string) => presentes.find((x) => x.id === id)?.nombre ?? oficial?.personas.find((x) => x.id === id)?.nombre ?? 'Jugador';
  const miLado = asientos ? ladoDe(asientos, yo.id) : null, soyJugador = sentados.includes(yo.id), rivalId = sentados.find((id) => id !== yo.id) ?? '';
  const listos = sentados.length === 2 && sentados.every((id) => presentes.some((x) => x.id === id && x.listo === p.partida));
  const yoListo = presentes.some((x) => x.id === yo.id && x.listo === p.partida);
  const rivalEnOtraRonda = !!oficial && presentes.some((x) => x.id === rivalId && rondasDistintas(p.partida, x.listo));
  const fin = !!asientos && puntos.a !== null && puntos.b !== null;
  const turno: Lado | null = !asientos || fin || p.abandono || formato !== 'turnos' ? null : puntos.a === null ? 'a' : 'b';
  const leToca = (l: Lado) => !!asientos && !fin && !p.abandono && puntos[l] === null && (formato === 'dividida' || turno === l);
  const nombres = asientos ? { a: nombre(asientos[0]), b: nombre(asientos[1]) } : { a: '', b: '' };

  // El anfitrión arma la partida cuando los dos están listos (los asientos se alternan en cada revancha)
  useEffect(() => {
    if (!formato || asientos || !listos || !soyAnfitrion) return;
    const y: Estado = { ...est.current, asientos: (p.partida % 2 ? [...sentados] : [...sentados].reverse()) as [string, string], v: est.current.v + 1, puntos: { a: null, b: null }, abandono: null, inicio: Date.now() + MARGEN_INICIO };
    fijar(y);
    mandar(y);
  }, [listos, !!asientos, soyAnfitrion]);
  // El anfitrión reparte el estado cada 3 s, por si a alguien le faltó un mensaje
  useEffect(() => {
    if (!soyAnfitrion || !asientos) return;
    const r = setInterval(() => mandar(est.current), 3000);
    return () => clearInterval(r);
  }, [soyAnfitrion, !!asientos]);

  // Siguiente ronda: la primera que yo no haya jugado (en diferido o en vivo); en un amistoso, la que sigue
  const guardadas = useRef(new Set(oficial?.jugadas ?? [])), suyas = useRef(new Set(oficial?.rivalJugadas ?? []));
  const rondaLibre = (n: number) => !oficial || (n <= oficial.e.rondas && !(guardadas.current.has(n) && (!oficial.rivalJugadas || suyas.current.has(n))));
  const siguiente = oficial ? (oficial.rivalJugadas ? rondaComun([...guardadas.current, p.partida], [...suyas.current, p.partida], oficial.e.rondas) : rondaSiguiente([...guardadas.current, p.partida], oficial.e.rondas)) : p.partida + 1;

  // Mi partida: corre en mi navegador cuando me toca
  const miCaja = useRef<HTMLDivElement>(null), partidaJuego = useRef<Juego | null>(null), corrida = useRef(0), vuelta = useRef(0);
  const cerrarJuego = () => { vuelta.current++; partidaJuego.current?.destruir(); partidaJuego.current = null; };
  useEffect(() => () => { cerrarJuego(); ajustesPartida.vivo = ajustesPartida.foto = false; }, []);
  /** Mi puntaje final: se avisa a todos y, en un oficial, se guarda como en el diferido. */
  const publicar = (puntaje: number, detalle: Record<string, unknown> = {}, guardar = true) => {
    const x = est.current, lado = x.asientos ? ladoDe(x.asientos, yo.id) : null;
    if (!lado || x.puntos[lado] !== null) return;
    anotar(lado, puntaje);
    sala.current?.enviar('resultado', { partida: x.partida, puntaje });
    if (oficial && guardar) {
      guardadas.current.add(x.partida);
      V.terminarRonda(oficial.e.id, x.partida, puntaje, { ...detalle, vivo: true }).then((error) => { if (error) setAviso(`No se pudo guardar tu resultado: ${error}`); });
    }
  };
  const correr = async () => {
    const x = est.current, mio = ++vuelta.current;
    corrida.current = x.partida;
    setFase('cargando');
    try {
      const mundo = formato === 'mundo', lado = x.asientos ? ladoDe(x.asientos, yo.id) : null;
      const [crear, aspecto, aspectos] = await Promise.all([(mundo ? MUNDOS : CARGADORES)[juego](), aspectoDe(sesion.usuarioId), mundo && x.asientos ? Promise.all(x.asientos.map((id) => (id === yo.id ? aspectoDe(sesion.usuarioId) : aspectoDeOtro(id)))) : null]);
      let semilla = `${juego}|${codigo}|${x.partida}`;
      if (oficial && lado) {
        // La semilla la da el servidor (la misma del diferido). Si la ronda ya se jugó o se cortó, vale lo que quedó guardado
        const r = await V.empezarRonda(oficial.e.id, x.partida);
        if (!r.semilla) {
          const m = (await V.marcasDe([oficial.e.id])).find((k) => k.perfil_id === yo.id && k.ronda === x.partida);
          setFase('listo');
          if (m) { setAviso('Tu partida de esta ronda ya había empezado: vale lo que llevabas.'); publicar(m.puntaje, {}, false); } else { setFase('nada'); setAviso(r.error ?? 'No se pudo abrir la ronda.'); }
          return;
        }
        // En el mismo mundo todos (también los espectadores) arman la misma arena: la semilla es la de la sala
        if (!mundo) semilla = r.semilla;
      }
      if (mio !== vuelta.current || !miCaja.current) return;
      ajustesPartida.pausable = false; // en vivo el reloj no se detiene al cambiar de pestaña
      ajustesPartida.vivo = true;
      ajustesPartida.foto = !mundo; // las fotos del espejo solo hacen falta cuando cada uno ve un juego distinto
      const vivo: ContextoVivo | undefined = mundo && aspectos && x.asientos ? {
        rol: lado ?? 'espectador', nombres: { a: nombre(x.asientos[0]), b: nombre(x.asientos[1]) }, aspectos: { a: aspectos[0], b: aspectos[1] },
        simulo: () => !!anfitrionRef.current && anfitrionRef.current === sala.current?.clave,
        directo: () => { const s = sala.current; return !!s && (s.clave === anfitrionRef.current ? s.presentes().filter((y) => y.clave !== s.clave).every((y) => s.directo(y.clave)) : !!anfitrionRef.current && s.directo(anfitrionRef.current)); },
        enviar: (tipo, datos, alAnfitrion) => sala.current?.enviar(tipo, { ...datos, partida: x.partida }, alAnfitrion ? anfitrionRef.current ?? undefined : undefined),
        alRecibir: (f) => { oyenteMundo.current = f; },
      } : undefined;
      const j = await crear({
        caja: miCaja.current, semilla, aspecto, nivel: oficial?.e.jornada ?? 1, vivo,
        alTerminar(r) {
          if (mio !== vuelta.current) return;
          publicar(r.puntaje, r.detalle);
          // En el mismo mundo se sigue mirando hasta que termine el otro; si no, se deja ver un momento y se libera el juego
          if (mundo) return;
          setFase('listo');
          setTimeout(() => { if (mio === vuelta.current) cerrarJuego(); }, 2500);
        },
      });
      if (mio !== vuelta.current) return j.destruir();
      partidaJuego.current = j;
      setFase('cuenta');
      // Si el anfitrión fijó la hora, la cuenta 3-2-1 termina justo ahí para los dos; si no (o ya pasó), parte de inmediato
      const delAnfitrion = anfitrionRef.current ? red.current.get(anfitrionRef.current)?.desfase ?? 0 : 0, soyYo = anfitrionRef.current === sala.current?.clave;
      const meta = est.current.inicio && formato !== 'turnos' ? est.current.inicio - (soyYo ? 0 : delAnfitrion) : 0;
      const espera = meta - 2250 - Date.now();
      if (espera > 0 && espera < MARGEN_INICIO + 5000) { setCuenta(0); await new Promise((listo) => setTimeout(listo, espera)); if (mio !== vuelta.current) return; }
      for (let n = 3; n >= 1; n--) { setCuenta(n); await new Promise((listo) => setTimeout(listo, 750)); if (mio !== vuelta.current) return; }
      setFase('jugando');
      j.empezar();
    } catch {
      if (mio === vuelta.current) { setFase('nada'); setAviso('No se pudo cargar el juego. Revisa tu conexión.'); }
    }
  };
  const mia = miLado ? leToca(miLado) : false;
  const correJuego = formato === 'mundo' ? !!asientos && !fin && !p.abandono && (!miLado || puntos[miLado] === null || fase !== 'nada') : mia;
  useEffect(() => { if (correJuego && corrida.current !== p.partida) correr(); }, [correJuego, p.partida]);
  // Al terminar el duelo se libera el juego (en el mismo mundo seguía abierto para mirar)
  useEffect(() => { if (fin || p.abandono) { cerrarJuego(); if (fase !== 'nada') setFase('listo'); } }, [fin, !!p.abandono]);
  // Cambio de partida (revancha): se cierra la anterior
  useEffect(() => { if (corrida.current && corrida.current !== p.partida) { cerrarJuego(); setFase('nada'); corrida.current = 0; } fotos.current = { a: null, b: null }; setLlevan({ a: 0, b: 0 }); }, [p.partida]);

  // Mientras juego: lo que llevo cada medio segundo y una foto de mi pantalla (más seguido si hay conexión directa)
  useEffect(() => {
    if (fase !== 'jugando' || !miLado) return;
    let n = 0;
    const r = setInterval(() => {
      const s = sala.current, caja = miCaja.current, x = est.current;
      if (!s || !caja) return;
      n++;
      const directo = soyAnfitrion ? s.presentes().filter((y) => y.clave !== s.clave).every((y) => s.directo(y.clave)) : !!anfitrionRef.current && s.directo(anfitrionRef.current);
      const cada = !directo ? 8 : formato === 'dividida' ? 2 : 1; // sin conexión directa todo pasa por Supabase: una foto cada 2 s
      if (n % 2 === 0) {
        const lleva = puntajeEnPantalla(caja);
        s.enviar('marcador', { partida: x.partida, puntaje: lleva });
        setLlevan((v) => ({ ...v, [miLado]: lleva }));
        if (oficial && n % 8 === 0) V.latidoRonda(oficial.e.id, x.partida, lleva);
      }
      if (formato !== 'mundo' && n % cada === 0 && s.presentes().length > 1) { const f = capturar(caja, formato === 'turnos' ? 360 : 260); if (f) s.enviar('foto', { partida: x.partida, ...f }); }
    }, 250);
    return () => clearInterval(r);
  }, [fase, miLado, soyAnfitrion]);

  // Mi resultado se repite cada 3 s hasta que el duelo termine: si un mensaje se perdió, el duelo no se queda pegado
  const miPuntaje = miLado ? puntos[miLado] : null;
  useEffect(() => {
    if (miPuntaje === null || fin || p.abandono) return;
    const r = setInterval(() => sala.current?.enviar('resultado', { partida: est.current.partida, puntaje: miPuntaje }), 3000);
    return () => clearInterval(r);
  }, [miPuntaje, fin, !!p.abandono, p.partida]);

  // Abandono en un amistoso: si el rival se va y no vuelve en 30 s, gana quien se quedó. En un oficial
  // no hace falta: lo que cada uno alcanzó a jugar queda guardado y el que se fue puede jugar su ronda en diferido.
  const rivalPresente = presentes.some((x) => x.id === rivalId);
  const corre = !oficial && !!asientos && soyJugador && !fin && !p.abandono && !rivalPresente && presentes.length > 0;
  useEffect(() => { setAusente((a) => (corre ? a ?? Date.now() : null)); }, [corre]);
  const quedan = ausente ? Math.max(0, ESPERA_ABANDONO - Math.floor((ahora - ausente) / 1000)) : null;
  useEffect(() => {
    if (quedan !== 0 || p.abandono || !soyJugador) return;
    const y = { ...est.current, abandono: yo.id, v: est.current.v + 1 };
    fijar(y);
    sala.current?.enviar('abandono', { partida: y.partida, ganador: yo.id });
  }, [quedan === 0]);

  // Partidas en línea
  const anuncio = useRef<ReturnType<typeof anunciarSala> | null>(null);
  anuncio.current ??= anunciarSala();
  useEffect(() => () => anuncio.current?.cerrar(), []);
  useEffect(() => {
    anuncio.current?.poner(soyAnfitrion && formato ? { codigo, juego, a: sentados[0] ? nombre(sentados[0]) : '', b: sentados[1] ? nombre(sentados[1]) : '', estado: !asientos ? 'esperando' : fin || p.abandono ? 'terminada' : 'jugando', turno: turno ? nombres[turno] : '', espectadores: reparto.espectadores.length, oficial: !!oficial, desde: Date.now() } : null);
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__duelo = { estado: () => est.current, lado: () => miLado, fase: () => fase, terminar: (n: number) => { setFase('listo'); cerrarJuego(); publicar(n); }, foto: (l: Lado) => !!espejos.current[l]?.firstChild };

  // Predicciones: los jugadores anotan el duelo al partir (se cierran las apuestas) y quién ganó al terminar
  const pareja = asientos ?? (sentados.length === 2 ? sentados : null);
  const idVivo = pareja ? idPartidaVivo(codigo, fechaChile(Date.now()), p.partida, pareja) : '';
  const ganadorVivo = p.abandono ?? (fin && asientos ? (puntos.a! > puntos.b! ? asientos[0] : puntos.b! > puntos.a! ? asientos[1] : 'empate') : null);
  useEffect(() => { if (idVivo && asientos && soyJugador && sesion.usuarioId) empezarVivo(idVivo, juego, asientos[0], asientos[1]); }, [idVivo, !!asientos]);
  useEffect(() => { if (idVivo && ganadorVivo && soyJugador && sesion.usuarioId) cerrarVivo(idVivo, ganadorVivo); }, [idVivo, ganadorVivo]);

  if (!formato || !ficha) return <><h1>Sala no encontrada</h1><p><a class="boton" href="#/juegos/vivo">Volver al juego en vivo</a></p></>;
  if (sesion.cargando) return <p class="tenue">Cargando…</p>;

  const ganador = p.abandono ?? (fin && asientos ? (puntos.a! > puntos.b! ? asientos[0] : puntos.b! > puntos.a! ? asientos[1] : 'empate') : null);
  const textoFin = !ganador ? '' : p.abandono ? (p.abandono === yo.id ? '¡Ganaste por abandono!' : `${nombre(p.abandono)} ganó por abandono.`)
    : ganador === 'empate' ? `Empate: ${puntos.a} a ${puntos.b}` : `Ganó ${nombre(ganador)} · ${puntos.a} a ${puntos.b}`;
  const revancha = () => { if (!siguiente) return; sala.current?.enviar('revancha', { partida: siguiente }); fijar(nueva(siguiente)); sala.current?.marcarListo(0); };
  const jugandoYo = fase === 'cargando' || fase === 'cuenta' || fase === 'jugando';
  const pantallita = (l: Lado, grande = false) => (
    <div class={`duelo-pantalla${grande ? ' grande' : ''}`} style={`--color:${COLOR_LADO[l]}`}>
      <div class="duelo-nombre"><b>{nombres[l]}</b><span>{puntos[l] !== null ? `terminó · ${puntos[l]}` : leToca(l) ? `jugando${llevan[l] ? ` · ${llevan[l]}` : ''}` : formato === 'turnos' ? 'espera su turno' : ''}</span></div>
      <div class="duelo-espejo" ref={(el) => { espejos.current[l] = el; if (el && !el.firstChild) pintarEspejo(l); }} />
    </div>
  );
  // Qué se ve: mi juego (si me toca) y las pantallas de los demás
  const otros = formato === 'mundo' ? [] : LADOS.filter((l) => l !== miLado && (formato === 'dividida' || turno === l));

  return (
    <div class="vivo duelo-vivo">
      <div class="sigla">{oficial ? `En vivo · oficial · ronda ${p.partida} de ${oficial.e.rondas}` : `En vivo · amistoso · sala ${codigo}`} · {formato === 'dividida' ? 'pantalla dividida' : formato === 'turnos' ? 'por turnos' : juego === 'bloques' || juego === 'bestias' ? 'cara a cara' : 'mismo mundo'}</div>
      {aviso && <p class="aviso atencion">{aviso}</p>}
      <h1>{ficha.nombre}</h1>
      <div class="fila vivo-cabecera">
        <span class="vivo-ojo" title="Personas mirando">👁 {reparto.espectadores.length}</span>
        {!asientos && !soyJugador && sentados.length < 2 && !oficial && <button class="boton principal vivo-quiero" onClick={() => sala.current?.quiero('jugar')}>Quiero jugar</button>}
      </div>
      {!asientos && <p class="tenue">{juego === 'bestias' ? 'Cara a cara por turnos: los dos eligen 3 criaturas del mismo sorteo y combaten de frente, Nv. 50. Cada turno tiene 30 segundos (si se acaba, la máquina elige por ti). Gana quien deja sin criaturas al otro.' : juego === 'bloques' ? 'Cara a cara: cada uno su tablero, lado a lado. Cada línea que completas le manda lápidas a tu rival; gana quien lo llena hasta arriba (o el mejor puntaje a los 3 minutos).' : formato === 'mundo' ? 'Los dos en la misma arena, contra bots que atacan a ambos. Gana el mejor puntaje.' : formato === 'dividida' ? 'Los dos juegan al mismo tiempo el mismo desafío, cada uno su partida, y ven la pantalla del otro. Gana el mejor puntaje.' : 'Por turnos: primero juega uno mientras el otro mira, y después al revés, con el mismo desafío. Gana el mejor puntaje.'} {ficha.controles}</p>}
      {!asientos ? (
        <div class="sala-espera">
          {[0, 1].map((i) => {
            const id = sentados[i] ?? (fijos ? fijos[i] : null), aqui = !!id && presentes.some((x) => x.id === id), listo = !!id && presentes.some((x) => x.id === id && x.listo === p.partida);
            const clave = id ? presentes.find((x) => x.id === id)?.clave : undefined, conexion = clave && clave !== sala.current?.clave ? red.current.get(clave) : undefined;
            const directo = !!clave && clave !== sala.current?.clave && !!sala.current?.directo(clave);
            return (
              <div key={i} class={`asiento${listo ? ' listo' : aqui ? ' aqui' : ''}`} style={`--color:${COLOR_LADO[i === 0 ? 'a' : 'b']}`}>
                {id && !id.startsWith('inv-') ? <Carita perfil={id} tam={56} /> : <span class="asiento-vacio">?</span>}
                <b>{id ? nombre(id) : 'Esperando a alguien'}{id === yo.id ? ' (tú)' : ''}</b>
                <span class={`chip-estado ${listo ? 'listo' : aqui ? 'aqui' : 'fuera'}`}>{listo ? 'Listo' : aqui ? 'Conectado' : id ? 'No ha entrado' : 'Libre'}</span>
                {conexion && <span class="tenue chico">{directo ? 'Conexión directa' : 'Conexión por respaldo (más lenta)'} · {conexion.rtt} ms</span>}
                {oficial && id && !aqui && id !== yo.id && soyJugador && <BotonAvisar id={oficial.e.id} />}
              </div>
            );
          })}
        </div>
      ) : (
        <ul class="vivo-gente">
          {sentados.map((id) => <li key={id} class="juega"><b>{nombre(id)}{id === yo.id ? ' (tú)' : ''}</b><span class="tenue chico">{asientos.indexOf(id) === 0 ? 'Azul' : 'Rojo'}{presentes.some((x) => x.id === id) ? '' : ' · desconectado'}</span></li>)}
        </ul>
      )}
      {!soyJugador && pareja && idVivo && <Prediccion partida={idVivo} a={{ id: pareja[0], nombre: nombre(pareja[0]) }} b={{ id: pareja[1], nombre: nombre(pareja[1]) }} abierta={!asientos} ganador={ganadorVivo} usuarioId={sesion.usuarioId} />}
      {!asientos && (sentados.length < 2 ? <p class="aviso atencion">Esperando a otra persona. Comparte el enlace de la sala.</p>
        : rivalEnOtraRonda ? <p class="aviso atencion">Tu rival está en otra ronda (ya jugó una a su hora): terminen esta ronda en diferido.</p>
        : soyJugador ? <button class="boton principal grande" onClick={() => sala.current?.marcarListo(yoListo ? 0 : p.partida)}>{yoListo ? 'Ya no estoy listo' : '¡Listo!'}</button>
        : <p class="tenue">La partida parte cuando los dos jugadores marquen Listo. Tú miras.</p>)}
      {quedan !== null && quedan > 0 && <p class="aviso atencion">{nombre(rivalId)} se desconectó. Si no vuelve en {quedan} s, ganas por abandono.</p>}
      {oficial && asientos && !fin && soyJugador && !rivalPresente && <p class="aviso atencion">{nombre(rivalId)} se desconectó. Tu resultado se guarda igual; tu rival puede jugar su ronda a su hora.</p>}
      {mia && fase === 'nada' && corrida.current === p.partida && <div class="fila"><button class="boton principal grande" onClick={() => { setAviso(''); correr(); }}>Reintentar mi partida</button></div>}
      {turno && <p class={`duelo-turno${turno === miLado ? ' mio' : ''}`}>{turno === miLado ? '¡Es tu turno!' : `Es el turno de ${nombres[turno]}`}</p>}
      {asientos && !ganador && (
        <div class={`duelo-zona ${formato}${jugandoYo || fase === 'listo' ? ' con-juego' : ''}`}>
          <div class="sala duelo-mio" hidden={!jugandoYo}>
            <div class="juego-caja" ref={miCaja} />
            {fase === 'cuenta' && (cuenta ? <div class="sala-cuenta" key={cuenta}>{cuenta}</div> : <div class="duelo-cargando">Esperando a que tu rival termine de cargar…</div>)}
            {fase === 'cargando' && <div class="duelo-cargando">Preparando tu partida…</div>}
          </div>
          {!jugandoYo && miLado && puntos[miLado] !== null && <div class="duelo-listo"><b>{puntos[miLado]}</b><span>{formato === 'turnos' || puntos[miLado === 'a' ? 'b' : 'a'] === null ? `Terminaste. Ahora mira a ${nombres[miLado === 'a' ? 'b' : 'a']}.` : 'Terminaste.'}</span></div>}
          {otros.length > 0 && <div class="duelo-otros">{otros.map((l) => pantallita(l, formato === 'turnos' || !miLado))}</div>}
        </div>
      )}
      {textoFin && <p class="aviso ok vivo-fin duelo-fin">{textoFin}</p>}
      {ganador && asientos && !p.abandono && (
        <div class="duelo-resultado">
          {LADOS.map((l) => (
            <div key={l} class={`duelo-resultado-lado${ganador === asientos[l === 'a' ? 0 : 1] ? ' gano' : ''}`} style={`--color:${COLOR_LADO[l]}`}>
              <span>{nombres[l]}</span><b>{puntos[l]}</b>{ganador === asientos[l === 'a' ? 0 : 1] && <i>Ganó la ronda</i>}
            </div>
          ))}
          <button class="boton" onClick={(ev) => { const t = `${ficha.nombre} en vivo${oficial ? ` (ronda ${p.partida})` : ''}: ${nombres.a} ${puntos.a} contra ${nombres.b} ${puntos.b}. ${ganador === 'empate' ? 'Empate.' : `Ganó ${nombre(ganador)}.`}`; navigator.clipboard?.writeText(t).then(() => { ev.currentTarget.textContent = 'Copiado'; }, () => undefined); }}>Copiar resultado para Discord</button>
        </div>
      )}
      {oficial && ganador && !siguiente && <PuntosDuelo id={oficial.e.id} />}
      {ganador && (oficial && !siguiente
        ? <div class="fila"><a class="boton principal" href={`#/juegos/duelo/${oficial.e.id}`}>Enfrentamiento terminado: ver resultado</a></div>
        : soyJugador && <div class="fila"><button class="boton principal" onClick={revancha}>{oficial ? 'Siguiente ronda' : 'Revancha'}</button></div>)}
    </div>
  );
}
