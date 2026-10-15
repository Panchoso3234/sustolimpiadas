import { useEffect, useRef, useState } from 'preact/hooks';
import { useSesion } from '../nucleo/supabase';
import * as V from '../juegos/duelos';
import { JUEGOS } from '../juegos/catalogo';
import { CARGADORES, ajustesPartida, type Partida as Juego } from '../juegos/marco';
import { aspectoDe, puntajeEnPantalla } from '../juegos/Sala';
import { repartir, rondasDistintas, rondaSiguiente } from './asientos';
import { capturar, limpiar } from './espejo';
import { DUELOS } from './formatos';
import { asientosValidos, debeReiniciar, identidadVivo, type Oficial } from './PantallaVivo';
import { PuntosDuelo } from './PuntosDuelo';
import { unirse, type Presente, type Sala } from './sala';
import { COLOR_LADO, ladoDe, type Lado } from './tablero';
import { anunciarSala } from './vestibulo';

// Duelo en vivo con el juego individual de siempre, en pantalla dividida o por turnos (ver `formatos.ts`).
// Cada jugador corre su propia partida en su navegador (mismo desafío que el diferido) y manda su puntaje,
// lo que lleva y fotos de su pantalla; el rival y los espectadores las ven al lado. En un oficial cada uno
// guarda su propio resultado, igual que en diferido: el servidor compara y reparte los puntos.
const ESPERA_ABANDONO = 30;
interface Estado { partida: number; asientos: [string, string] | null; v: number; puntos: Record<Lado, number | null>; abandono: string | null }
const nueva = (partida = 1): Estado => ({ partida, asientos: null, v: 0, puntos: { a: null, b: null }, abandono: null });
const puntajeValido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= -1e6 && n <= 1e7;
const LADOS: Lado[] = ['a', 'b'];

export function SalaDuelo({ codigo, mirar = false, oficial }: { codigo: string; mirar?: boolean; oficial?: Oficial }) {
  const sesion = useSesion();
  const juego = oficial?.e.juego ?? codigo.split('-')[0], formato = DUELOS[juego], ficha = JUEGOS.find((j) => j.id === juego);
  const yo = identidadVivo(sesion.usuarioId, sesion.perfil?.nombre);
  const fijos = oficial ? [oficial.e.a_perfil!, oficial.e.b_perfil!] as [string, string] : null;
  const quiere = mirar || (fijos && !fijos.includes(yo.id)) ? 'mirar' : 'jugar';
  const primera = oficial ? rondaSiguiente(oficial.jugadas, oficial.e.rondas) ?? oficial.e.rondas : 1;
  const [p, setP] = useState<Estado>(() => { let g = nueva(primera); try { g = { ...g, ...JSON.parse(localStorage.getItem(`susto.vivo.${codigo}`) ?? '{}') }; } catch { /* sin respaldo */ } return debeReiniciar(g.partida, primera, !!oficial) ? nueva(primera) : g; });
  const [presentes, setPresentes] = useState<Presente[]>([]);
  const [aviso, setAviso] = useState(''), [ahora, setAhora] = useState(Date.now()), [ausente, setAusente] = useState<number | null>(null);
  // Lo que lleva cada uno mientras juega (llega cada medio segundo)
  const [llevan, setLlevan] = useState<Record<Lado, number>>({ a: 0, b: 0 });
  const [fase, setFase] = useState<'nada' | 'cargando' | 'cuenta' | 'jugando' | 'listo'>('nada'), [cuenta, setCuenta] = useState(3);
  const sala = useRef<Sala | null>(null), est = useRef(p), anfitrionRef = useRef<string | null>(null), sentadosRef = useRef<string[]>([]);
  const fijar = (y: Estado) => { est.current = y; setP(y); };
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
      if (evento === 'estado') {
        const pts = d.puntos as Record<string, unknown> | undefined;
        if (!(deAnfitrion || sentado) || !Number.isInteger(d.partida) || !Number.isInteger(d.v) || !pts || !LADOS.every((l) => pts[l] === null || puntajeValido(pts[l]))) return;
        if (d.asientos !== null && !asientosValidos(d.asientos, fijos)) return;
        if ((d.partida as number) < x.partida || ((d.partida as number) === x.partida && (d.v as number) <= x.v)) return;
        // Si ya sé el puntaje de alguien que el otro aún no anotó, no lo pierdo
        const misma = d.partida === x.partida, puntos = { a: (pts.a as number | null) ?? (misma ? x.puntos.a : null), b: (pts.b as number | null) ?? (misma ? x.puntos.b : null) };
        const asientos = d.asientos as [string, string] | null;
        fijar({ partida: d.partida as number, asientos, v: d.v as number, puntos, abandono: typeof d.abandono === 'string' && asientos?.includes(d.abandono) ? d.abandono : null });
        return;
      }
      if (!sentado) return;
      const lado = x.asientos ? ladoDe(x.asientos, quien) : null;
      if (evento === 'resultado') { if (lado && d.partida === x.partida && puntajeValido(d.puntaje)) anotar(lado, d.puntaje); return; }
      if (evento === 'marcador') { if (lado && d.partida === x.partida && puntajeValido(d.puntaje)) setLlevan((v) => ({ ...v, [lado]: d.puntaje as number })); return; }
      if (evento === 'foto') { if (lado && d.partida === x.partida) { fotos.current[lado] = { img: d.img as string | undefined, html: d.html as string | undefined }; pintarEspejo(lado); } return; }
      if (evento === 'revancha') { if (Number.isInteger(d.partida) && (d.partida as number) > x.partida && rondaLibre(d.partida as number)) { fijar(nueva(d.partida as number)); s.marcarListo(0); } return; }
      if (evento === 'abandono') { if (d.partida === x.partida && typeof d.ganador === 'string' && x.asientos?.includes(d.ganador) && !x.abandono) fijar({ ...x, abandono: d.ganador, v: x.v + 1 }); return; }
    }, fijos);
    sala.current = s;
    const t0 = setTimeout(() => s.enviar('pedir', {}), 800);
    // Quien llega tarde o recarga pide el estado; si el anfitrión no contestó, lo vuelve a pedir
    const t1 = setInterval(() => { if (!est.current.asientos) pedir(); }, 5000);
    return () => { clearTimeout(t0); clearInterval(t1); s.salir(); };
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
    const y: Estado = { ...est.current, asientos: (p.partida % 2 ? [...sentados] : [...sentados].reverse()) as [string, string], v: est.current.v + 1, puntos: { a: null, b: null }, abandono: null };
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
  const guardadas = useRef(new Set(oficial?.jugadas ?? []));
  const rondaLibre = (n: number) => !oficial || (n <= oficial.e.rondas && !guardadas.current.has(n));
  const siguiente = oficial ? rondaSiguiente([...guardadas.current, p.partida], oficial.e.rondas) : p.partida + 1;

  // Mi partida: corre en mi navegador cuando me toca
  const miCaja = useRef<HTMLDivElement>(null), partidaJuego = useRef<Juego | null>(null), corrida = useRef(0), vuelta = useRef(0);
  const cerrarJuego = () => { vuelta.current++; partidaJuego.current?.destruir(); partidaJuego.current = null; };
  useEffect(() => () => { cerrarJuego(); ajustesPartida.vivo = false; }, []);
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
      const [crear, aspecto] = await Promise.all([CARGADORES[juego](), aspectoDe(sesion.usuarioId)]);
      let semilla = `${juego}|${codigo}|${x.partida}`;
      if (oficial) {
        // La semilla la da el servidor (la misma del diferido). Si la ronda ya se jugó o se cortó, vale lo que quedó guardado
        const r = await V.empezarRonda(oficial.e.id, x.partida);
        if (!r.semilla) {
          const m = (await V.marcasDe([oficial.e.id])).find((k) => k.perfil_id === yo.id && k.ronda === x.partida);
          setFase('listo');
          if (m) { setAviso('Tu partida de esta ronda ya había empezado: vale lo que llevabas.'); publicar(m.puntaje, {}, false); } else setAviso(r.error ?? 'No se pudo abrir la ronda.');
          return;
        }
        semilla = r.semilla;
      }
      if (mio !== vuelta.current || !miCaja.current) return;
      ajustesPartida.pausable = false; // en vivo el reloj no se detiene al cambiar de pestaña
      ajustesPartida.vivo = true;
      const j = await crear({
        caja: miCaja.current, semilla, aspecto, nivel: oficial?.e.jornada ?? 1,
        alTerminar(r) {
          if (mio !== vuelta.current) return;
          setFase('listo');
          publicar(r.puntaje, r.detalle);
          // Se deja ver un momento cómo terminó y después se libera la memoria del juego
          setTimeout(() => { if (mio === vuelta.current) cerrarJuego(); }, 2500);
        },
      });
      if (mio !== vuelta.current) return j.destruir();
      partidaJuego.current = j;
      setFase('cuenta');
      for (let n = 3; n >= 1; n--) { setCuenta(n); await new Promise((listo) => setTimeout(listo, 750)); if (mio !== vuelta.current) return; }
      setFase('jugando');
      j.empezar();
    } catch {
      if (mio === vuelta.current) { setFase('nada'); corrida.current = 0; setAviso('No se pudo cargar el juego. Revisa tu conexión.'); }
    }
  };
  const mia = miLado ? leToca(miLado) : false;
  useEffect(() => { if (mia && corrida.current !== p.partida) correr(); }, [mia, p.partida]);
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
      const cada = directo ? 1 : 6; // sin conexión directa todo pasa por Supabase: menos fotos
      if (n % 2 === 0) {
        const lleva = puntajeEnPantalla(caja);
        s.enviar('marcador', { partida: x.partida, puntaje: lleva });
        setLlevan((v) => ({ ...v, [miLado]: lleva }));
        if (oficial && n % 8 === 0) V.latidoRonda(oficial.e.id, x.partida, lleva);
      }
      if (n % cada === 0) { const f = capturar(caja, formato === 'turnos' ? 400 : 320); if (f) s.enviar('foto', { partida: x.partida, ...f }); }
    }, 250);
    return () => clearInterval(r);
  }, [fase, miLado, soyAnfitrion]);

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
  const otros = LADOS.filter((l) => l !== miLado && (formato === 'dividida' || turno === l));

  return (
    <div class="vivo duelo-vivo">
      <div class="sigla">{oficial ? `En vivo · oficial · ronda ${p.partida} de ${oficial.e.rondas}` : `En vivo · amistoso · sala ${codigo}`} · {formato === 'dividida' ? 'pantalla dividida' : 'por turnos'}</div>
      {aviso && <p class="aviso atencion">{aviso}</p>}
      <h1>{ficha.nombre}</h1>
      <div class="fila vivo-cabecera">
        <span class="vivo-ojo" title="Personas mirando">👁 {reparto.espectadores.length}</span>
        {!asientos && !soyJugador && sentados.length < 2 && !oficial && <button class="boton principal vivo-quiero" onClick={() => sala.current?.quiero('jugar')}>Quiero jugar</button>}
      </div>
      {!asientos && <p class="tenue">{formato === 'dividida' ? 'Los dos juegan al mismo tiempo el mismo desafío, cada uno su partida, y ven la pantalla del otro. Gana el mejor puntaje.' : 'Por turnos: primero juega uno mientras el otro mira, y después al revés, con el mismo desafío. Gana el mejor puntaje.'} {ficha.controles}</p>}
      <ul class="vivo-gente">
        {sentados.map((id, i) => <li key={id} class="juega"><b>{nombre(id)}{id === yo.id ? ' (tú)' : ''}</b><span class="tenue chico">{(asientos ? asientos.indexOf(id) : i) === 0 ? 'Azul' : 'Rojo'}{!asientos ? (presentes.some((x) => x.id === id && x.listo === p.partida) ? ' · listo' : ' · esperando') : presentes.some((x) => x.id === id) ? '' : ' · desconectado'}</span></li>)}
      </ul>
      {!asientos && (sentados.length < 2 ? <p class="aviso atencion">Esperando a otra persona. Comparte el enlace de la sala.</p>
        : rivalEnOtraRonda ? <p class="aviso atencion">Tu rival está en otra ronda (ya jugó una a su hora): terminen esta ronda en diferido.</p>
        : soyJugador ? <button class="boton principal grande" onClick={() => sala.current?.marcarListo(yoListo ? 0 : p.partida)}>{yoListo ? 'Ya no estoy listo' : '¡Listo!'}</button>
        : <p class="tenue">La partida parte cuando los dos jugadores marquen Listo. Tú miras.</p>)}
      {quedan !== null && quedan > 0 && <p class="aviso atencion">{nombre(rivalId)} se desconectó. Si no vuelve en {quedan} s, ganas por abandono.</p>}
      {oficial && asientos && !fin && soyJugador && !rivalPresente && <p class="aviso atencion">{nombre(rivalId)} se desconectó. Tu resultado se guarda igual; tu rival puede jugar su ronda a su hora.</p>}
      {turno && <p class={`duelo-turno${turno === miLado ? ' mio' : ''}`}>{turno === miLado ? '¡Es tu turno!' : `Es el turno de ${nombres[turno]}`}</p>}
      {asientos && !ganador && (
        <div class={`duelo-zona ${formato}${jugandoYo || fase === 'listo' ? ' con-juego' : ''}`}>
          <div class="sala duelo-mio" hidden={!jugandoYo}>
            <div class="juego-caja" ref={miCaja} />
            {fase === 'cuenta' && <div class="sala-cuenta" key={cuenta}>{cuenta}</div>}
            {fase === 'cargando' && <div class="duelo-cargando">Preparando tu partida…</div>}
          </div>
          {!jugandoYo && miLado && puntos[miLado] !== null && <div class="duelo-listo"><b>{puntos[miLado]}</b><span>{formato === 'turnos' || puntos[miLado === 'a' ? 'b' : 'a'] === null ? `Terminaste. Ahora mira a ${nombres[miLado === 'a' ? 'b' : 'a']}.` : 'Terminaste.'}</span></div>}
          {otros.length > 0 && <div class="duelo-otros">{otros.map((l) => pantallita(l, formato === 'turnos' || !miLado))}</div>}
        </div>
      )}
      {textoFin && <p class="aviso ok vivo-fin duelo-fin">{textoFin}</p>}
      {oficial && ganador && !siguiente && <PuntosDuelo id={oficial.e.id} />}
      {ganador && (oficial && !siguiente
        ? <div class="fila"><a class="boton principal" href={`#/juegos/duelo/${oficial.e.id}`}>Enfrentamiento terminado: ver resultado</a></div>
        : soyJugador && <div class="fila"><button class="boton principal" onClick={revancha}>{oficial ? 'Siguiente ronda' : 'Revancha'}</button></div>)}
    </div>
  );
}
