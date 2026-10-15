import { useEffect, useRef, useState } from 'preact/hooks';
import { useSesion } from '../nucleo/supabase';
import { COLUMNAS, FILAS, LADO, filaLibre, jugarConchas, recibirDisparo, repartirFlota, type Balsa, type Resultado } from './reglas';
import { nuevoCodigo, unirse, type Presente, type Sala } from './sala';
import { anunciarSala } from './vestibulo';
import { probarTableros } from './tableros';
import { probarAsientos, repartir, rondaSiguiente } from './asientos';
import * as V from '../juegos/duelos';

// Juego en vivo por turnos: Cuatro Conchas en Línea y Batalla de Balsas. Partidas amistosas (no dan puntos).
// Los dos primeros en llegar a la sala juegan; los demás miran. Si alguien se desconecta tiene 30 s para volver.

const JUEGOS = {
  conchas: { nombre: 'Cuatro Conchas en Línea', idea: 'Por turnos, deja caer conchas en una columna. Gana quien alinea cuatro (en fila, columna o diagonal).' },
  balsas: { nombre: 'Batalla de Balsas', idea: 'Esconde tus cuatro balsas y dispara por turnos al mar del rival. Gana quien hunde todas las del otro.' },
} as const;
type IdJuego = keyof typeof JUEGOS;
export const NOMBRES_VIVO: Record<string, string> = Object.fromEntries(Object.entries(JUEGOS).map(([k, v]) => [k, v.nombre]));
const ESPERA_ABANDONO = 30, CASILLAS_FLOTA = 12;

interface Disparo { de: string; i: number; res: Resultado; hundida?: number[] }
interface Estado {
  partida: number;
  asientos: [string, string] | null;
  jugadas: number[]; // conchas
  disparos: Disparo[]; // balsas, a la vista de todos
  flotasListas: string[];
  pendiente: { de: string; i: number } | null;
  /** Quién ganó por abandono en esta partida (queda firme aunque el otro vuelva). */
  abandono: string | null;
}
const inicial = (): Estado => ({ partida: 1, asientos: null, jugadas: [], disparos: [], flotasListas: [], pendiente: null, abandono: null });

/** Quién ganó una partida: el id del ganador, 'empate', o null si todavía se juega. */
export function ganadorDe(juego: IdJuego, e: Estado): string | null {
  if (e.abandono) return e.abandono;
  if (!e.asientos) return null;
  if (juego === 'conchas') { const c = jugarConchas(e.jugadas); return c.ganador ? e.asientos[c.ganador - 1] : c.empate ? 'empate' : null; }
  return e.asientos.find((id) => e.disparos.filter((d) => d.de === id && d.res !== 'agua').length >= CASILLAS_FLOTA) ?? null;
}

const entero = (x: unknown, max: number) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < max;
/** Asientos válidos: dos personas distintas y, en un oficial, justo las dos del enfrentamiento. */
export const asientosValidos = (a: unknown, fijos: [string, string] | null): a is [string, string] =>
  Array.isArray(a) && a.length === 2 && a.every((x) => typeof x === 'string') && a[0] !== a[1] && (!fijos || (fijos.includes(a[0]) && fijos.includes(a[1])));
/** Si una historia recibida tiene forma válida: protege de mensajes rotos o malintencionados. */
export function esEstado(x: unknown, fijos: [string, string] | null): x is Estado {
  const e = x as Estado;
  return !!e && typeof e === 'object' && Number.isInteger(e.partida) && e.partida >= 1 && (e.asientos === null || asientosValidos(e.asientos, fijos))
    && Array.isArray(e.jugadas) && e.jugadas.every((c) => entero(c, COLUMNAS)) && Array.isArray(e.disparos) && e.disparos.every((d) => d && typeof d.de === 'string' && entero(d.i, LADO * LADO))
    && Array.isArray(e.flotasListas) && (e.abandono === null || e.abandono === undefined || (e.asientos?.includes(e.abandono) ?? false));
}
/** En un oficial, lo guardado en el navegador vale solo si es de la ronda que el servidor dice que toca. */
export const debeReiniciar = (guardada: number, primera: number, oficial: boolean) => (oficial ? guardada !== primera : guardada < primera);

/** Pruebas de las reglas de la sala: devuelve la lista de fallas. */
export function probarSala(): string[] {
  const fallas: string[] = [], igual = (que: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) fallas.push(`${que}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  const base = { ...inicial(), asientos: ['ana', 'beto'] as [string, string] };
  igual('conchas: gana la primera', ganadorDe('conchas', { ...base, jugadas: [0, 1, 0, 1, 0, 1, 0] }), 'ana');
  igual('conchas: sigue', ganadorDe('conchas', { ...base, jugadas: [0, 1] }), null);
  igual('abandono manda', ganadorDe('conchas', { ...base, jugadas: [0, 1, 0, 1, 0, 1, 0], abandono: 'beto' }), 'beto');
  igual('historia rota', esEstado({ partida: 9, jugadas: 'x' }, null), false);
  igual('historia con intruso en oficial', esEstado({ ...base, asientos: ['ana', 'intruso'] }, ['ana', 'beto']), false);
  igual('historia buena', esEstado({ ...base, jugadas: [3, 4] }, ['ana', 'beto']), true);
  igual('columna fuera del tablero', esEstado({ ...base, jugadas: [9] }, null), false);
  igual('oficial: ronda distinta se reinicia', debeReiniciar(3, 1, true), true);
  igual('oficial: misma ronda se conserva', debeReiniciar(2, 2, true), false);
  igual('amistoso: solo hacia adelante', debeReiniciar(3, 1, false), false);
  return fallas;
}

/** Quién soy: la cuenta de Discord, o un invitado con nombre al azar (las partidas en vivo son amistosas). */
function identidad(usuarioId: string | null, nombre: string | undefined): { id: string; nombre: string } {
  if (usuarioId) return { id: usuarioId, nombre: nombre ?? 'Participante' };
  // Solo en pruebas: "?invitado=b" da otra identidad, para jugar contra uno mismo en dos pestañas
  const prueba = import.meta.env.DEV ? new URLSearchParams(location.search).get('invitado') : null;
  if (prueba) return { id: `inv-${prueba}`, nombre: `Invitado ${prueba.toUpperCase()}` };
  try {
    let id = localStorage.getItem('susto.invitado');
    if (!id) { id = `inv-${Math.random().toString(36).slice(2, 6)}`; localStorage.setItem('susto.invitado', id); }
    return { id, nombre: `Invitado ${id.slice(4).toUpperCase()}` };
  } catch { return { id: `inv-${Math.random().toString(36).slice(2, 6)}`, nombre: 'Invitado' }; }
}

/** Datos de un enfrentamiento oficial que se juega en su sala `enf-<id>`. */
export interface Oficial { e: V.Enfrentamiento; personas: V.Persona[]; /** Rondas que ya abrí y que ya guardé, según el servidor. */ empezadas: number[]; jugadas: number[] }

/** Sala de un enfrentamiento oficial: primero carga quiénes juegan y qué rondas faltan. */
function SalaOficial({ id, mirar }: { id: number; mirar: boolean }) {
  const sesion = useSesion();
  const [datos, setDatos] = useState<Oficial | null | 'no'>(null);
  useEffect(() => {
    if (sesion.cargando) return;
    Promise.all([V.unEnfrentamiento(id), V.listarPersonas(), V.marcasDe([id])]).then(([e, personas, marcas]) => {
      if (!e || !e.a_perfil || !e.b_perfil || !(e.juego in JUEGOS)) return setDatos('no');
      const mias = marcas.filter((m) => m.perfil_id === sesion.usuarioId);
      setDatos({ e, personas, empezadas: mias.map((m) => m.ronda), jugadas: mias.filter((m) => m.terminado).map((m) => m.ronda) });
    });
  }, [id, sesion.cargando, sesion.usuarioId]);
  if (datos === null) return <p class="tenue">Cargando el enfrentamiento…</p>;
  if (datos === 'no') return <><h1>Enfrentamiento no encontrado</h1><p><a class="boton" href="#/juegos/1v1">Volver a Versus 1v1</a></p></>;
  return <SalaVivo codigo={`enf-${id}`} mirar={mirar} oficial={datos} />;
}

export function Vivo({ codigo, mirar = false }: { codigo: string; mirar?: boolean }) {
  const [entrar, setEntrar] = useState('');
  if (/^enf-\d+$/.test(codigo)) return <SalaOficial key={codigo} id={Number(codigo.slice(4))} mirar={mirar} />;
  if (codigo) return <SalaVivo key={codigo} codigo={codigo} mirar={mirar} />;
  const crear = (juego: IdJuego) => { location.hash = `#/juegos/vivo/${nuevoCodigo(juego)}`; };
  return (
    <>
      <h1>Juego en vivo</h1>
      <p>Partidas por turnos con otra persona conectada al mismo tiempo. Crea una sala y comparte el enlace; los dos primeros en entrar juegan y el resto puede mirar. Por ahora son amistosas: no dan puntos del torneo.</p>
      <div class="rejilla-juegos">
        {(Object.keys(JUEGOS) as IdJuego[]).map((j) => (
          <div key={j} class="tarjeta" style="--tono:#ffe08a">
            <img class="foto" src={`${import.meta.env.BASE_URL}juegos/${j}.png`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <h3>{JUEGOS[j].nombre}</h3>
            <p>{JUEGOS[j].idea}</p>
            <span class="pie"><span class="premia">En vivo</span><button class="boton principal" onClick={() => crear(j)}>Crear sala</button></span>
          </div>
        ))}
      </div>
      <section class="bloque">
        <h2>Entrar a una sala</h2>
        <div class="formulario">
          <label>Código de la sala<input class="texto" value={entrar} placeholder="por ejemplo conchas-K7QF" onInput={(e) => setEntrar(e.currentTarget.value.trim())} /></label>
          <button class="boton principal" disabled={!/^(conchas|balsas)-[A-Z0-9]{4}$/i.test(entrar)} onClick={() => { const [j, c] = entrar.split('-'); location.hash = `#/juegos/vivo/${j.toLowerCase()}-${c.toUpperCase()}`; }}>Entrar</button>
        </div>
      </section>
    </>
  );
}

function SalaVivo({ codigo, mirar = false, oficial }: { codigo: string; mirar?: boolean; oficial?: Oficial }) {
  const sesion = useSesion();
  const juego = (oficial?.e.juego ?? codigo.split('-')[0]) as IdJuego, valido = !!JUEGOS[juego];
  const yo = identidad(sesion.usuarioId, sesion.perfil?.nombre);
  // En una sala oficial juegan solo los dos del enfrentamiento (con su cuenta); el resto mira
  const fijos = oficial ? [oficial.e.a_perfil!, oficial.e.b_perfil!] as [string, string] : null;
  const quiere = mirar || (fijos && !fijos.includes(yo.id)) ? 'mirar' : 'jugar';
  const [presentes, setPresentes] = useState<Presente[]>([]);
  // En un oficial se parte en la primera ronda que falta (por si el respaldo del navegador quedó atrás)
  const primera = oficial ? rondaSiguiente(oficial.jugadas, oficial.e.rondas) ?? oficial.e.rondas : 1;
  const [estado, setEstado] = useState<Estado>(() => { let e = inicial(); try { e = { ...e, ...JSON.parse(localStorage.getItem(`susto.vivo.${codigo}`) ?? '{}') }; } catch { /* sin respaldo */ } return debeReiniciar(e.partida, primera, !!oficial) ? { ...inicial(), partida: primera } : e; });
  const [aviso, setAviso] = useState('');
  const [flota, setFlota] = useState<Balsa[] | null>(() => { try { return JSON.parse(localStorage.getItem(`susto.vivo.flota.${codigo}`) ?? 'null'); } catch { return null; } });
  const [ausente, setAusente] = useState<number | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const sala = useRef<Sala | null>(null), est = useRef(estado), miFlota = useRef(flota);
  // Lo que el manejador de mensajes necesita saber del último dibujo (se creó una sola vez, al entrar)
  const sentadosRef = useRef<string[]>([]), anfitrionRef = useRef<string | null>(null), guardarRef = useRef<(e: Estado) => void>(() => undefined);
  est.current = estado;
  miFlota.current = flota;
  const cambiar = (f: (e: Estado) => Estado) => setEstado((e) => (est.current = f(e)));

  // Respaldo en el navegador: si se recarga o se corta, se retoma
  useEffect(() => { try { localStorage.setItem(`susto.vivo.${codigo}`, JSON.stringify(estado)); } catch { /* sin almacenamiento */ } }, [estado]);
  useEffect(() => { try { localStorage.setItem(`susto.vivo.flota.${codigo}`, JSON.stringify(flota)); } catch { /* sin almacenamiento */ } }, [flota]);
  // Reloj para la cuenta del abandono
  useEffect(() => { const r = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(r); }, []);

  useEffect(() => {
    if (sesion.cargando || !valido) return;
    let ultimoPedido = 0;
    // Pedir la historia completa, a lo más una vez cada 3 s (cada pedido hace hablar al anfitrión)
    const pedirHistoria = () => { if (Date.now() - ultimoPedido > 3000) { ultimoPedido = Date.now(); s.enviar('pedir', {}); } };
    const s = unirse(codigo, yo, quiere, setPresentes, (evento, d, de) => {
      const e = est.current, quien = de.split(':')[0];
      // Solo cuentan los mensajes de juego de quienes están sentados; la historia, también del anfitrión.
      // shortcut: el remitente (`de`) se puede falsificar por el respaldo de Supabase; frena a un espectador común,
      // no a alguien que reescriba la página. Blindarlo de verdad pide canales privados con RLS en Supabase.
      const sentados = e.asientos ?? fijos ?? sentadosRef.current, sentado = sentados.includes(quien), deAnfitrion = de === anfitrionRef.current;
      if (evento === 'pedir') { if (e.asientos && s.clave === anfitrionRef.current) s.enviar('historia', { ...e }); return; }
      if (evento === 'historia') {
        if (!(deAnfitrion || sentado) || !esEstado(d, fijos)) return;
        // Quien vuelve se queda con la historia más avanzada
        const otra: Estado = { ...inicial(), ...d, abandono: d.abandono ?? null };
        const avance = (x: Estado) => x.jugadas.length + x.disparos.length + x.flotasListas.length + (x.abandono ? 1 : 0);
        if (otra.partida > e.partida || (otra.partida === e.partida && (avance(otra) > avance(e) || (!e.asientos && otra.asientos)))) cambiar(() => ({ ...otra, pendiente: null }));
        return;
      }
      if (!sentado) return;
      if (evento === 'revancha') {
        if (d.partida !== e.partida + 1) return;
        // Cierro la ronda anterior con lo que vio quien pidió la revancha (por si me llegó antes que la última jugada)
        if (esEstado(d.previa, fijos) && d.previa.partida === e.partida) guardarRef.current({ ...inicial(), ...d.previa });
        cambiar(() => ({ ...inicial(), partida: e.partida + 1 }));
        setFlota(null);
        s.marcarListo(0);
        return;
      }
      if (evento === 'abandono') { if (d.partida === e.partida && typeof d.ganador === 'string' && e.asientos?.includes(d.ganador)) cambiar((x) => (x.abandono ? x : { ...x, abandono: d.ganador as string })); return; }
      // Si llega algo que no calza con lo que tengo (me perdí el inicio o una jugada), pido la historia completa
      if (d.partida !== e.partida) { if ((d.partida as number) > e.partida) pedirHistoria(); return; } // mensaje de otra partida de esta sala
      const deJuego = ['jugada', 'flota-lista', 'disparo', 'resultado'].includes(evento);
      if ((deJuego && !e.asientos) || (evento === 'jugada' && (d.n as number) > e.jugadas.length)) pedirHistoria();
      if (evento === 'empieza') { if (deAnfitrion && asientosValidos(d.asientos, fijos)) cambiar((x) => (x.asientos ? x : { ...x, asientos: d.asientos as [string, string] })); return; }
      if (!e.asientos || e.abandono) return;
      if (evento === 'jugada') {
        // Solo la jugada de quien tiene el turno, en una columna que existe
        if (e.asientos[jugarConchas(e.jugadas).turno - 1] !== quien || !entero(d.col, COLUMNAS)) return;
        cambiar((x) => (d.n === x.jugadas.length ? { ...x, jugadas: [...x.jugadas, d.col as number] } : x));
      }
      if (evento === 'flota-lista') { if (d.de === quien) cambiar((x) => (x.flotasListas.includes(quien) ? x : { ...x, flotasListas: [...x.flotasListas, quien] })); }
      if ((evento === 'disparo' && (d.de !== quien || e.asientos[e.disparos.length % 2] !== quien || !entero(d.i, LADO * LADO))) || (evento === 'resultado' && d.de === quien)) return;
      if (evento === 'disparo') {
        if (e.asientos?.includes(yo.id) && d.de !== yo.id && miFlota.current) {
          // Me dispararon: respondo con lo que pasó en mi mar (mis balsas no salen de mi navegador)
          const recibidos = e.disparos.filter((x) => x.de !== yo.id).map((x) => x.i);
          if (recibidos.includes(d.i as number)) return;
          const r = recibirDisparo(miFlota.current, recibidos, d.i as number), nuevo: Disparo = { de: d.de as string, i: d.i as number, res: r.resultado, hundida: r.hundida };
          s.enviar('resultado', { partida: e.partida, ...nuevo });
          cambiar((x) => ({ ...x, disparos: [...x.disparos, nuevo], pendiente: null }));
        } else cambiar((x) => ({ ...x, pendiente: x.pendiente ?? { de: d.de as string, i: d.i as number } }));
      }
      if (evento === 'resultado') cambiar((x) => (x.disparos.some((k) => k.de === d.de && k.i === d.i) ? { ...x, pendiente: null } : { ...x, disparos: [...x.disparos, { de: d.de as string, i: d.i as number, res: d.res as Resultado, hundida: d.hundida as number[] | undefined }], pendiente: null }));
    }, fijos);
    sala.current = s;
    const pedir = setTimeout(() => s.enviar('pedir', {}), 800);
    return () => { clearTimeout(pedir); s.salir(); };
  }, [codigo, sesion.cargando, yo.id, valido]);

  const { asientos } = estado;
  const reparto = repartir(presentes, asientos, fijos), sentados = reparto.jugadores;
  sentadosRef.current = sentados;
  anfitrionRef.current = repartir(presentes, null, fijos).anfitrion; // el mismo anfitrión que usa el enlace
  const nombre = (id: string) => presentes.find((p) => p.id === id)?.nombre ?? oficial?.personas.find((p) => p.id === id)?.nombre ?? 'Jugador';
  const mio = sentados.indexOf(yo.id), soyJugador = mio >= 0, rivalId = mio === 0 ? sentados[1] : sentados[0];

  // Cómo va la partida
  const conchas = jugarConchas(estado.jugadas);
  const flotasOk = estado.flotasListas.length === 2;
  const ganador = ganadorDe(juego, estado), terminada = ganador !== null;
  const turnoDe = juego === 'conchas' ? sentados[conchas.turno - 1] : sentados[estado.disparos.length % 2];

  // Abandono: si el rival no está mientras se juega, corre la cuenta
  const rivalPresente = presentes.some((p) => p.id === rivalId);
  const corre = !!asientos && soyJugador && !terminada && !rivalPresente && presentes.length > 0;
  useEffect(() => { setAusente((a) => (corre ? a ?? Date.now() : null)); }, [corre]);
  const quedan = ausente ? Math.max(0, ESPERA_ABANDONO - Math.floor((ahora - ausente) / 1000)) : null;
  const ganeAbandono = quedan === 0;
  // El abandono queda firme: se guarda en la partida y se avisa a todos, aunque el rival vuelva después
  useEffect(() => {
    if (!ganeAbandono || estado.abandono || !soyJugador) return;
    cambiar((x) => (x.abandono ? x : { ...x, abandono: yo.id }));
    sala.current?.enviar('abandono', { partida: estado.partida, ganador: yo.id });
  }, [ganeAbandono]);

  // Quien llega con la partida empezada recibe la historia del anfitrión sin tener que pedirla
  useEffect(() => { if (asientos && reparto.anfitrion === sala.current?.clave) sala.current?.enviar('historia', { ...est.current }); }, [presentes.length]);

  // Antes de empezar: los dos jugadores marcan Listo y el anfitrión da la partida
  const listos = sentados.length === 2 && sentados.every((id) => presentes.some((p) => p.id === id && p.listo === estado.partida));
  useEffect(() => {
    if (asientos || !listos || reparto.anfitrion !== sala.current?.clave) return;
    // En cada revancha parte el otro: las partidas pares dan vuelta el orden
    const a = (estado.partida % 2 ? [...sentados] : [...sentados].reverse()) as [string, string];
    sala.current?.enviar('empieza', { partida: estado.partida, asientos: a });
    cambiar((x) => ({ ...x, asientos: a }));
  }, [listos, !!asientos]);

  // El anfitrión anuncia la sala en Partidas en línea (y la retira al salir)
  const anuncio = useRef(anunciarSala());
  useEffect(() => () => anuncio.current.cerrar(), []);
  useEffect(() => {
    if (!valido) return;
    const soyAnfitrion = !!reparto.anfitrion && reparto.anfitrion === sala.current?.clave, fin = terminada;
    anuncio.current.poner(soyAnfitrion ? { codigo, juego, a: sentados[0] ? nombre(sentados[0]) : '', b: sentados[1] ? nombre(sentados[1]) : '', estado: !asientos ? 'esperando' : fin ? 'terminada' : 'jugando', turno: asientos && !fin && turnoDe ? nombre(turnoDe) : '', espectadores: reparto.espectadores.length, oficial: !!oficial, desde: Date.now() } : null);
  });

  // Enfrentamiento oficial: cada jugador abre su ronda al empezar y guarda su resultado al terminar, una sola vez cada cosa.
  // La verdad la tiene el servidor (qué rondas ya abrí o guardé); en la sesión se recuerda lo que va en camino.
  const ronda = estado.partida, total = oficial?.e.rondas ?? 1, idOficial = oficial?.e.id;
  const abiertas = useRef(new Set(oficial?.empezadas ?? [])), guardadas = useRef(new Set(oficial?.jugadas ?? []));
  const abrir = () => {
    if (!idOficial || abiertas.current.has(ronda)) return;
    abiertas.current.add(ronda);
    V.empezarRonda(idOficial, ronda).then((r) => {
      if (!r.error) return;
      setAviso(r.error);
      // Un error que no es definitivo (se cortó la red) se reintenta en unos segundos
      if (!/ya jugaste|ya no está abierto|no eres parte/i.test(r.error)) { abiertas.current.delete(ronda); setTimeout(abrir, 5000); }
    });
  };
  useEffect(() => { if (asientos && soyJugador) abrir(); }, [idOficial, !!asientos, soyJugador, ronda]);
  const guardar = (e: Estado) => {
    const g = ganadorDe(juego, e);
    if (!idOficial || !g || !e.asientos?.includes(yo.id) || guardadas.current.has(e.partida)) return;
    guardadas.current.add(e.partida);
    // El detalle lleva la partida completa, para que la Mesa de control pueda revisar un resultado discutido
    V.terminarRonda(idOficial, e.partida, g === yo.id ? 1 : 0, { vivo: true, contra: e.asientos.find((x) => x !== yo.id), abandono: !!e.abandono, jugadas: e.jugadas, disparos: e.disparos.map((x) => [x.de === yo.id ? 'yo' : 'rival', x.i, x.res]) }).then((error) => {
      if (!error || /no está en juego/i.test(error)) { if (!error) setAviso(''); return; }
      setAviso(`No se pudo guardar el resultado (se reintenta): ${error}`);
      guardadas.current.delete(e.partida);
      setTimeout(() => guardarRef.current(est.current.partida === e.partida ? est.current : e), 5000);
    });
  };
  guardarRef.current = guardar;
  useEffect(() => { if (terminada && soyJugador) guardar(estado); }, [terminada, soyJugador, ronda]);

  if (!valido) return <><h1>Sala no encontrada</h1><p><a class="boton" href="#/juegos/vivo">Volver al juego en vivo</a></p></>;
  if (sesion.cargando) return <p class="tenue">Cargando…</p>;

  const jugarColumna = (col: number) => {
    if (!asientos || terminada || turnoDe !== yo.id || filaLibre(conchas.tablero, col) < 0) return;
    sala.current?.enviar('jugada', { partida: estado.partida, n: estado.jugadas.length, col });
    cambiar((x) => ({ ...x, jugadas: [...x.jugadas, col] }));
  };
  const disparar = (i: number) => {
    if (!asientos || !flotasOk || terminada || turnoDe !== yo.id || estado.pendiente || estado.disparos.some((d) => d.de === yo.id && d.i === i)) return;
    sala.current?.enviar('disparo', { partida: estado.partida, de: yo.id, i });
    cambiar((x) => ({ ...x, pendiente: { de: yo.id, i } }));
  };
  const flotaLista = () => {
    if (!flota) return;
    sala.current?.enviar('flota-lista', { partida: estado.partida, de: yo.id });
    cambiar((x) => (x.flotasListas.includes(yo.id) ? x : { ...x, flotasListas: [...x.flotasListas, yo.id] }));
  };
  const revancha = () => {
    if (!asientos) return;
    // La partida siguiente pide Listo de nuevo a los dos (así nadie juega una ronda con el rival ausente)
    sala.current?.enviar('revancha', { partida: estado.partida + 1, previa: { ...estado } });
    cambiar(() => ({ ...inicial(), partida: estado.partida + 1 }));
    setFlota(null);
    sala.current?.marcarListo(0);
  };
  const copiar = () => navigator.clipboard?.writeText(location.href).catch(() => undefined);
  const yoListo = presentes.some((p) => p.id === yo.id && p.listo === estado.partida);

  const resultado = !ganador ? ''
    : estado.abandono ? (estado.abandono === yo.id ? `¡Ganaste por abandono! ${nombre(rivalId)} no volvió a tiempo.` : `${nombre(estado.abandono)} ganó por abandono.`)
    : ganador === 'empate' ? 'Empate: el tablero se llenó'
    : juego === 'conchas' ? `Ganó ${nombre(ganador)}` : `Ganó ${nombre(ganador)}: hundió toda la flota`;

  return (
    <div class="vivo">
      <div class="sigla">{oficial ? `En vivo · oficial · ronda ${ronda} de ${total}` : `En vivo · amistoso · sala ${codigo}`}</div>
      {aviso && <p class="aviso atencion">{aviso}</p>}
      <h1>{JUEGOS[juego].nombre}</h1>
      <div class="fila vivo-cabecera">
        <span class="vivo-ojo" title="Personas mirando">👁 {reparto.espectadores.length}</span>
        {!asientos && !soyJugador && sentados.length < 2 && <button class="boton principal vivo-quiero" onClick={() => sala.current?.quiero('jugar')}>Quiero jugar</button>}
      </div>
      <p class="tenue">{JUEGOS[juego].idea}</p>
      <div class="fila"><button class="boton" onClick={copiar}>Copiar enlace de la sala</button><a class="boton" href="#/juegos/vivo">Salir</a></div>

      <ul class="vivo-gente">
        {presentes.map((p) => (
          <li key={p.clave} class={sentados.includes(p.id) ? 'juega' : ''}>
            <b>{p.nombre}{p.id === yo.id ? ' (tú)' : ''}</b>
            <span class="tenue chico">{sentados.includes(p.id) ? `Jugador ${sentados.indexOf(p.id) + 1}${!asientos ? (p.listo === estado.partida ? ' · listo' : ' · esperando') : ''}` : 'Mirando'}</span>
          </li>
        ))}
        {asientos && asientos.filter((id) => !presentes.some((p) => p.id === id)).map((id) => <li key={id} class="fuera"><b>{nombre(id)}</b><span class="tenue chico">desconectado</span></li>)}
      </ul>

      {!asientos && (
        sentados.length < 2 ? <p class="aviso atencion">Esperando a otra persona. Comparte el enlace de la sala.</p>
          : soyJugador ? <button class="boton principal grande" onClick={() => sala.current?.marcarListo(yoListo ? 0 : estado.partida)}>{yoListo ? 'Ya no estoy listo' : '¡Listo!'}</button>
          : <p class="tenue">La partida parte cuando los dos jugadores marquen Listo. Tú miras.</p>
      )}

      {asientos && quedan !== null && quedan > 0 && <p class="aviso atencion">{nombre(rivalId)} se desconectó. Si no vuelve en {quedan} s, ganas por abandono.</p>}
      {asientos && !resultado && !(juego === 'balsas' && !flotasOk) && <p class={`vivo-turno${turnoDe === yo.id ? ' mio' : ''}`}>{turnoDe === yo.id ? 'Tu turno' : `Turno de ${nombre(turnoDe)}`}</p>}
      {resultado && <p class="aviso ok vivo-fin">{resultado}</p>}

      {asientos && juego === 'conchas' && (
        <div class="conchas" aria-label="Tablero de Cuatro Conchas">
          {Array.from({ length: COLUMNAS }, (_, c) => (
            <button key={c} class="conchas-col" disabled={terminada || turnoDe !== yo.id} onClick={() => jugarColumna(c)} aria-label={`Columna ${c + 1}`}>
              {Array.from({ length: FILAS }, (_, k) => FILAS - 1 - k).map((f) => {
                const v = conchas.tablero[f][c], gana = conchas.ganador > 0 && conchas.linea.some(([lf, lc]) => lf === f && lc === c);
                return <span key={f} class={`concha${v ? ` j${v}` : ''}${gana ? ' gana' : ''}`} />;
              })}
            </button>
          ))}
        </div>
      )}

      {asientos && juego === 'balsas' && (
        <>
          {soyJugador && !estado.flotasListas.includes(yo.id) && (
            <div class="fila">
              <button class="boton" onClick={() => setFlota(repartirFlota())}>{flota ? 'Otra distribución' : 'Repartir mis balsas'}</button>
              <button class="boton principal" disabled={!flota} onClick={flotaLista}>Flota lista</button>
            </div>
          )}
          {!flotasOk && <p class="tenue">Cada jugador reparte sus balsas y aprieta "Flota lista". Las balsas del rival nunca llegan a tu navegador.</p>}
          <div class="mares">
            {sentados.map((dueno) => {
              const esMio = dueno === yo.id, contra = estado.disparos.filter((d) => d.de !== dueno);
              const barcos = esMio ? new Set((flota ?? []).flatMap((b) => b.casillas)) : new Set<number>();
              const hundidas = new Set(contra.flatMap((d) => d.hundida ?? []));
              return (
                <div key={dueno} class="mar-caja">
                  <div class="sigla">{esMio ? 'Tu mar' : `Mar de ${nombre(dueno)}`}</div>
                  <div class="mar">
                    {Array.from({ length: LADO * LADO }, (_, i) => {
                      const tiro = contra.find((d) => d.i === i), espera = estado.pendiente && estado.pendiente.de !== dueno && estado.pendiente.i === i;
                      const puede = !esMio && soyJugador && !tiro && flotasOk && !terminada && turnoDe === yo.id && !estado.pendiente;
                      return <button key={i} class={`agua-c${barcos.has(i) ? ' barco' : ''}${tiro ? ` ${tiro.res}` : ''}${hundidas.has(i) ? ' hundido' : ''}${espera ? ' espera' : ''}`} disabled={!puede} onClick={() => disparar(i)} aria-label={`Fila ${Math.floor(i / LADO) + 1}, columna ${(i % LADO) + 1}`} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {resultado && (oficial && ronda >= total
        ? <div class="fila"><a class="boton principal" href={`#/juegos/duelo/${oficial.e.id}`}>Enfrentamiento terminado: ver resultado</a></div>
        : soyJugador && <div class="fila"><button class="boton principal" onClick={revancha}>{oficial ? 'Siguiente ronda' : 'Revancha'}</button></div>)}
    </div>
  );
}

// Solo en pruebas: las reglas de asientos se pueden correr desde el banco de pruebas
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__vivo = { probarAsientos, probarSala, probarTableros };
