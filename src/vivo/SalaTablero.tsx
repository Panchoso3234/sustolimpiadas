import { useEffect, useRef, useState } from 'preact/hooks';
import { useSesion } from '../nucleo/supabase';
import * as V from '../juegos/duelos';
import { crearMesa, type Mesa } from '../juegos/tablero/mesa';
import { repartir, rondaSiguiente } from './asientos';
import { asientosValidos, debeReiniciar, identidadVivo, type Oficial } from './PantallaVivo';
import { unirse, type Presente, type Sala } from './sala';
import { ladoDe, type Lado, type Marcador } from './tablero';
import { TABLEROS } from './tableros';
import { anunciarSala } from './vestibulo';

// La sala de los juegos de mesa en vivo. El anfitrión aplica las acciones, avanza el reloj y reparte el estado;
// los demás lo dibujan. Asientos, ojo, Partidas en línea, abandono y guardado oficial funcionan igual que en Conchas.
const ESPERA_ABANDONO = 30, CUENTA = 3;
interface Partida { partida: number; asientos: [string, string] | null; v: number; e: unknown; t: number; fin: { a: number; b: number } | null; abandono: string | null }
const nueva = (partida = 1): Partida => ({ partida, asientos: null, v: 0, e: null, t: -CUENTA, fin: null, abandono: null });

export function SalaTablero({ codigo, mirar = false, oficial }: { codigo: string; mirar?: boolean; oficial?: Oficial }) {
  const sesion = useSesion();
  const juego = oficial?.e.juego ?? codigo.split('-')[0], reglas = TABLEROS[juego];
  const yo = identidadVivo(sesion.usuarioId, sesion.perfil?.nombre);
  const fijos = oficial ? [oficial.e.a_perfil!, oficial.e.b_perfil!] as [string, string] : null;
  const quiere = mirar || (fijos && !fijos.includes(yo.id)) ? 'mirar' : 'jugar';
  const primera = oficial ? rondaSiguiente(oficial.jugadas, oficial.e.rondas) ?? oficial.e.rondas : 1;
  const [p, setP] = useState<Partida>(() => { let g = nueva(primera); try { g = { ...g, ...JSON.parse(localStorage.getItem(`susto.vivo.${codigo}`) ?? '{}') }; } catch { /* sin respaldo */ } return debeReiniciar(g.partida, primera, !!oficial) ? nueva(primera) : g; });
  const [presentes, setPresentes] = useState<Presente[]>([]);
  const [aviso, setAviso] = useState(''), [ahora, setAhora] = useState(Date.now()), [ausente, setAusente] = useState<number | null>(null);
  const sala = useRef<Sala | null>(null), est = useRef(p), recibido = useRef(performance.now()), anfitrionRef = useRef<string | null>(null), sentadosRef = useRef<string[]>([]);
  // `est` lo actualiza solo `fijar` (junto con la hora en que llegó): si se copiara aquí, el reloj volvería atrás
  // `t` vale en el momento en que llegó (o se calculó) el estado: el reloj local lo adelanta
  const fijar = (y: Partida) => { est.current = y; recibido.current = performance.now(); setP(y); };
  const mandar = (y: Partida) => sala.current?.enviar('estado', y as unknown as Record<string, unknown>);
  // Sin partida armada (o ya terminada) el reloj no corre
  const tAhora = () => est.current.t + (!est.current.asientos || est.current.fin || est.current.abandono ? 0 : (performance.now() - recibido.current) / 1000);

  useEffect(() => { try { localStorage.setItem(`susto.vivo.${codigo}`, JSON.stringify(p)); } catch { /* sin almacenamiento */ } }, [p]);
  useEffect(() => { const r = setInterval(() => setAhora(Date.now()), 250); return () => clearInterval(r); }, []);

  /** El anfitrión aplica una acción y reparte el estado nuevo. */
  const aplicar = (lado: Lado | null, a: Record<string, unknown>) => {
    const x = est.current;
    if (!reglas || !lado || !x.asientos || x.e == null || x.fin || x.abandono || !a || typeof a !== 'object') return;
    const t = tAhora(), e = reglas.accion(x.e as never, a, lado, t);
    if (!e) return;
    const y = { ...x, e, v: x.v + 1, t };
    fijar(y);
    mandar(y);
  };

  useEffect(() => {
    if (sesion.cargando || !reglas) return;
    let ultimoPedido = 0;
    const pedir = () => { if (Date.now() - ultimoPedido > 3000) { ultimoPedido = Date.now(); s.enviar('pedir', {}); } };
    const s = unirse(codigo, yo, quiere, setPresentes, (evento, d, de) => {
      const x = est.current, quien = de.split(':')[0], sentados = x.asientos ?? fijos ?? sentadosRef.current, sentado = sentados.includes(quien), deAnfitrion = de === anfitrionRef.current;
      // shortcut: el remitente se puede falsificar por el respaldo de Supabase; frena a un espectador común (ver tanda 1)
      if (evento === 'pedir') { if (x.asientos && s.clave === anfitrionRef.current) s.enviar('estado', { ...x, t: tAhora() }); return; }
      if (evento === 'estado') {
        if (!(deAnfitrion || sentado) || !Number.isInteger(d.partida) || !asientosValidos(d.asientos, fijos) || !reglas.valido(d.e) || !Number.isInteger(d.v) || typeof d.t !== 'number') return;
        if ((d.partida as number) < x.partida || ((d.partida as number) === x.partida && (d.v as number) <= x.v)) {
          // Un estado igual pero con el reloj al día solo corrige el reloj (el anfitrión lo manda cada 2 s)
          if (d.partida === x.partida && d.v === x.v) { est.current = { ...x, t: d.t as number }; recibido.current = performance.now(); }
          return;
        }
        const fin = d.fin && typeof d.fin === 'object' ? d.fin as Partida['fin'] : null;
        fijar({ partida: d.partida as number, asientos: d.asientos as [string, string], v: d.v as number, e: d.e, t: d.t as number, fin, abandono: typeof d.abandono === 'string' && (d.asientos as string[]).includes(d.abandono) ? d.abandono : null });
        return;
      }
      if (!sentado) return;
      if (evento === 'revancha') { if (d.partida === x.partida + 1) { fijar(nueva(x.partida + 1)); s.marcarListo(0); } return; }
      if (evento === 'abandono') { if (d.partida === x.partida && typeof d.ganador === 'string' && x.asientos?.includes(d.ganador) && !x.abandono) fijar({ ...x, abandono: d.ganador, v: x.v + 1, t: tAhora() }); return; }
      if (evento === 'accion' && s.clave === anfitrionRef.current) {
        if (d.partida !== x.partida) { if ((d.partida as number) > x.partida) pedir(); return; }
        if (x.asientos) aplicar(ladoDe(x.asientos, quien), d.a as Record<string, unknown>);
      }
    }, fijos);
    sala.current = s;
    const t0 = setTimeout(() => s.enviar('pedir', {}), 800);
    return () => { clearTimeout(t0); s.salir(); };
  }, [codigo, sesion.cargando, yo.id]);

  const { asientos } = p;
  const reparto = repartir(presentes, asientos, fijos), sentados = reparto.jugadores;
  sentadosRef.current = sentados;
  anfitrionRef.current = repartir(presentes, null, fijos).anfitrion; // el mismo anfitrión que usa el enlace
  const soyAnfitrion = !!anfitrionRef.current && anfitrionRef.current === sala.current?.clave;
  const nombre = (id: string) => presentes.find((x) => x.id === id)?.nombre ?? oficial?.personas.find((x) => x.id === id)?.nombre ?? 'Jugador';
  const miLado = asientos ? ladoDe(asientos, yo.id) : null, soyJugador = sentados.includes(yo.id), rivalId = sentados.find((id) => id !== yo.id) ?? '';
  const listos = sentados.length === 2 && sentados.every((id) => presentes.some((x) => x.id === id && x.listo === p.partida));
  const yoListo = presentes.some((x) => x.id === yo.id && x.listo === p.partida);
  const rivalEnOtraRonda = !!oficial && presentes.some((x) => x.id === rivalId && x.listo > 0 && x.listo !== p.partida);

  // Abrir la ronda (oficial) y armar el estado inicial: lo hace el anfitrión cuando los dos están listos
  const abiertas = useRef(new Set(oficial?.empezadas ?? [])), guardadas = useRef(new Set(oficial?.jugadas ?? []));
  useEffect(() => {
    if (!reglas || asientos || !listos || !soyAnfitrion) return;
    const a = (p.partida % 2 ? [...sentados] : [...sentados].reverse()) as [string, string];
    const arrancar = (semilla: string) => { const y: Partida = { ...est.current, asientos: a, e: reglas.inicial(semilla, oficial?.e.jornada ?? 1), v: 1, t: -CUENTA, fin: null, abandono: null }; fijar(y); mandar(y); };
    if (!oficial) return arrancar(`${codigo}|${p.partida}`);
    // En un oficial, la semilla la da el servidor (la misma para los dos): el anfitrión abre su ronda y la usa
    abiertas.current.add(p.partida);
    V.empezarRonda(oficial.e.id, p.partida).then((r) => { if (r.semilla) arrancar(r.semilla); else setAviso(r.error ?? 'No se pudo abrir la ronda.'); });
  }, [listos, !!asientos, soyAnfitrion]);
  // El otro jugador del oficial abre su propia ronda al ver el tablero
  useEffect(() => {
    if (!oficial || !asientos || !soyJugador || abiertas.current.has(p.partida)) return;
    abiertas.current.add(p.partida);
    V.empezarRonda(oficial.e.id, p.partida).then((r) => { if (r.error && !/ya jugaste/i.test(r.error)) setAviso(r.error); });
  }, [!!asientos, soyJugador, p.partida]);

  // Reloj del anfitrión: avanza el juego, revisa el final y reparte el estado (cada 2 s aunque no cambie)
  useEffect(() => {
    if (!reglas || !soyAnfitrion || !asientos || p.fin || p.abandono) return;
    let ultimoEnvio = 0;
    const r = setInterval(() => {
      const x = est.current;
      if (x.e == null || x.fin || x.abandono) return;
      const t = tAhora(), e = reglas.tic?.(x.e as never, t) ?? x.e, m: Marcador = reglas.marcador(e as never, t);
      const cambio = e !== x.e || m.fin;
      if (!cambio && performance.now() - ultimoEnvio < 2000) return;
      const y = { ...x, e, t, v: x.v + (cambio ? 1 : 0), fin: m.fin ? { a: m.a, b: m.b } : null };
      if (cambio) fijar(y); else { est.current = y; recibido.current = performance.now(); }
      mandar(y);
      ultimoEnvio = performance.now();
    }, 100);
    return () => clearInterval(r);
  }, [soyAnfitrion, !!asientos, !!p.fin, !!p.abandono, p.partida]);

  // Abandono firme (igual que en Conchas)
  const rivalPresente = presentes.some((x) => x.id === rivalId), corre = !!asientos && soyJugador && !p.fin && !p.abandono && !rivalPresente && presentes.length > 0;
  useEffect(() => { setAusente((a) => (corre ? a ?? Date.now() : null)); }, [corre]);
  const quedan = ausente ? Math.max(0, ESPERA_ABANDONO - Math.floor((ahora - ausente) / 1000)) : null;
  useEffect(() => {
    if (quedan !== 0 || p.abandono || !soyJugador) return;
    const y = { ...est.current, abandono: yo.id, v: est.current.v + 1, t: tAhora() };
    fijar(y);
    sala.current?.enviar('abandono', { partida: y.partida, ganador: yo.id });
  }, [quedan === 0]);

  // Guardar el resultado oficial: cada jugador guarda su propio puntaje
  const resultado = p.abandono ? { gano: p.abandono } : p.fin && asientos ? { gano: p.fin.a > p.fin.b ? asientos[0] : p.fin.b > p.fin.a ? asientos[1] : 'empate' } : null;
  useEffect(() => {
    if (!oficial || !resultado || !miLado || guardadas.current.has(p.partida)) return;
    guardadas.current.add(p.partida);
    // El puntaje guardado decide quién gana en el servidor: en un abandono vale 1 a 0
    const propio = p.abandono ? (p.abandono === yo.id ? 1 : 0) : Math.max(0, Math.round((p.fin![miLado] - Math.min(p.fin!.a, p.fin!.b, 0)) * 10));
    V.terminarRonda(oficial.e.id, p.partida, propio, { vivo: true, juego, abandono: !!p.abandono, marcador: p.fin }).then((error) => { if (error && !/no está en juego/i.test(error)) { guardadas.current.delete(p.partida); setAviso(`No se pudo guardar el resultado: ${error}`); } });
  }, [!!resultado, p.partida]);

  // Partidas en línea
  const anuncio = useRef<ReturnType<typeof anunciarSala> | null>(null);
  anuncio.current ??= anunciarSala();
  useEffect(() => () => anuncio.current?.cerrar(), []);
  useEffect(() => {
    anuncio.current?.poner(soyAnfitrion && reglas ? { codigo, juego, a: sentados[0] ? nombre(sentados[0]) : '', b: sentados[1] ? nombre(sentados[1]) : '', estado: !asientos ? 'esperando' : resultado ? 'terminada' : 'jugando', turno: '', espectadores: reparto.espectadores.length, oficial: !!oficial, desde: Date.now() } : null);
  });

  // La mesa: se arma una vez por partida y se repinta con cada estado y cada décima de segundo
  const caja = useRef<HTMLDivElement>(null), mesa = useRef<{ m: Mesa; pintar: (e: never, t: number, n: { a: string; b: string }) => void; partida: number } | null>(null);
  const enviarAccion = (a: Record<string, unknown>) => { if (!miLado) return; if (soyAnfitrion) aplicar(miLado, a); else sala.current?.enviar('accion', { partida: est.current.partida, a }); };
  const enviarRef = useRef(enviarAccion);
  enviarRef.current = enviarAccion;
  const nombresRef = useRef({ a: '', b: '' });
  if (asientos) nombresRef.current = { a: nombre(asientos[0]), b: nombre(asientos[1]) };
  useEffect(() => {
    if (!reglas || !caja.current || !asientos || p.e == null) return;
    if (mesa.current?.partida !== p.partida) {
      mesa.current?.m.destruir();
      const m = crearMesa(caja.current, `${juego} vivo-mesa`);
      m.empezar();
      mesa.current = { m, pintar: reglas.dibujar(m, (a) => enviarRef.current(a), miLado), partida: p.partida };
    }
    mesa.current.pintar(p.e as never, tAhora(), nombresRef.current);
  });
  useEffect(() => {
    const r = setInterval(() => { if (mesa.current && est.current.e != null && mesa.current.partida === est.current.partida) mesa.current.pintar(est.current.e as never, tAhora(), nombresRef.current); }, 100);
    return () => { clearInterval(r); mesa.current?.m.destruir(); };
  }, []);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tablero = { estado: () => est.current.e, lado: () => miLado, t: tAhora, enviar: (a: Record<string, unknown>) => enviarRef.current(a) };

  if (!reglas) return <><h1>Sala no encontrada</h1><p><a class="boton" href="#/juegos/vivo">Volver al juego en vivo</a></p></>;
  if (sesion.cargando) return <p class="tenue">Cargando…</p>;
  const t = tAhora();
  const textoFin = !resultado ? '' : p.abandono ? (p.abandono === yo.id ? '¡Ganaste por abandono!' : `${nombre(p.abandono)} ganó por abandono.`)
    : resultado.gano === 'empate' ? `Empate ${p.fin!.a} a ${p.fin!.b}` : `Ganó ${nombre(resultado.gano)} · ${p.fin!.a} a ${p.fin!.b}`;
  const revancha = () => { sala.current?.enviar('revancha', { partida: p.partida + 1 }); fijar(nueva(p.partida + 1)); sala.current?.marcarListo(0); };

  return (
    <div class="vivo">
      <div class="sigla">{oficial ? `En vivo · oficial · ronda ${p.partida} de ${oficial.e.rondas}` : `En vivo · amistoso · sala ${codigo}`}</div>
      {aviso && <p class="aviso atencion">{aviso}</p>}
      <h1>{reglas.nombre}</h1>
      <div class="fila vivo-cabecera">
        <span class="vivo-ojo" title="Personas mirando">👁 {reparto.espectadores.length}</span>
        {!asientos && !soyJugador && sentados.length < 2 && !oficial && <button class="boton principal vivo-quiero" onClick={() => sala.current?.quiero('jugar')}>Quiero jugar</button>}
      </div>
      <p class="tenue">{reglas.idea}</p>
      <ul class="vivo-gente">
        {sentados.map((id, i) => <li key={id} class="juega"><b>{nombre(id)}{id === yo.id ? ' (tú)' : ''}</b><span class="tenue chico">{(asientos ? asientos.indexOf(id) : i) === 0 ? 'Azul' : 'Rojo'}{!asientos ? (presentes.some((x) => x.id === id && x.listo === p.partida) ? ' · listo' : ' · esperando') : presentes.some((x) => x.id === id) ? '' : ' · desconectado'}</span></li>)}
      </ul>
      {!asientos && (sentados.length < 2 ? <p class="aviso atencion">Esperando a otra persona. Comparte el enlace de la sala.</p>
        : rivalEnOtraRonda ? <p class="aviso atencion">Tu rival está en otra ronda (ya jugó una a su hora): terminen esta ronda en diferido.</p>
        : soyJugador ? <button class="boton principal grande" onClick={() => sala.current?.marcarListo(yoListo ? 0 : p.partida)}>{yoListo ? 'Ya no estoy listo' : '¡Listo!'}</button>
        : <p class="tenue">La partida parte cuando los dos jugadores marquen Listo. Tú miras.</p>)}
      {quedan !== null && quedan > 0 && <p class="aviso atencion">{nombre(rivalId)} se desconectó. Si no vuelve en {quedan} s, ganas por abandono.</p>}
      {asientos && t < 0 && !resultado && <div class="tablero-cuenta">{Math.ceil(-t)}</div>}
      <div ref={caja} class="tablero-caja" />
      {textoFin && <p class="aviso ok vivo-fin tablero-fin">{textoFin}</p>}
      {resultado && (oficial && p.partida >= oficial.e.rondas
        ? <div class="fila"><a class="boton principal" href={`#/juegos/duelo/${oficial.e.id}`}>Enfrentamiento terminado: ver resultado</a></div>
        : soyJugador && <div class="fila"><button class="boton principal" onClick={revancha}>{oficial ? 'Siguiente ronda' : 'Revancha'}</button></div>)}
    </div>
  );
}
