import { useEffect, useRef, useState } from 'preact/hooks';
import { useSesion } from '../nucleo/supabase';
import { COLUMNAS, FILAS, LADO, filaLibre, jugarConchas, recibirDisparo, repartirFlota, type Balsa, type Resultado } from './reglas';
import { nuevoCodigo, unirse, type Presente, type Sala } from './sala';

// Juego en vivo por turnos: Cuatro Conchas en Línea y Batalla de Balsas. Partidas amistosas (no dan puntos).
// Los dos primeros en llegar a la sala juegan; los demás miran. Si alguien se desconecta tiene 30 s para volver.

const JUEGOS = {
  conchas: { nombre: 'Cuatro Conchas en Línea', idea: 'Por turnos, deja caer conchas en una columna. Gana quien alinea cuatro (en fila, columna o diagonal).' },
  balsas: { nombre: 'Batalla de Balsas', idea: 'Esconde tus cuatro balsas y dispara por turnos al mar del rival. Gana quien hunde todas las del otro.' },
} as const;
type IdJuego = keyof typeof JUEGOS;
const ESPERA_ABANDONO = 30, CASILLAS_FLOTA = 12;

interface Disparo { de: string; i: number; res: Resultado; hundida?: number[] }
interface Estado {
  partida: number;
  asientos: [string, string] | null;
  jugadas: number[]; // conchas
  disparos: Disparo[]; // balsas, a la vista de todos
  flotasListas: string[];
  pendiente: { de: string; i: number } | null;
}
const inicial = (): Estado => ({ partida: 1, asientos: null, jugadas: [], disparos: [], flotasListas: [], pendiente: null });

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

export function Vivo({ codigo }: { codigo: string }) {
  const [entrar, setEntrar] = useState('');
  if (codigo) return <SalaVivo key={codigo} codigo={codigo} />;
  const crear = (juego: IdJuego) => { location.hash = `#/juegos/vivo/${nuevoCodigo(juego)}`; };
  return (
    <>
      <h1>Juego en vivo</h1>
      <p>Partidas por turnos con otra persona conectada al mismo tiempo. Crea una sala y comparte el enlace; los dos primeros en entrar juegan y el resto puede mirar. Por ahora son amistosas: no dan puntos del torneo.</p>
      <div class="rejilla-juegos">
        {(Object.keys(JUEGOS) as IdJuego[]).map((j) => (
          <div key={j} class="tarjeta" style="--tono:#ffe08a">
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

function SalaVivo({ codigo }: { codigo: string }) {
  const sesion = useSesion();
  const juego = codigo.split('-')[0] as IdJuego, valido = !!JUEGOS[juego];
  const yo = identidad(sesion.usuarioId, sesion.perfil?.nombre);
  const [presentes, setPresentes] = useState<Presente[]>([]);
  const [estado, setEstado] = useState<Estado>(() => { try { return { ...inicial(), ...JSON.parse(localStorage.getItem(`susto.vivo.${codigo}`) ?? '{}') }; } catch { return inicial(); } });
  const [flota, setFlota] = useState<Balsa[] | null>(() => { try { return JSON.parse(localStorage.getItem(`susto.vivo.flota.${codigo}`) ?? 'null'); } catch { return null; } });
  const [ausente, setAusente] = useState<number | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const sala = useRef<Sala | null>(null), est = useRef(estado), miFlota = useRef(flota);
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
    const s = unirse(codigo, yo, setPresentes, (evento, d) => {
      const e = est.current;
      if (evento === 'pedir') { if (e.asientos) s.enviar('historia', { ...e }); return; }
      if (evento === 'historia') {
        // Quien vuelve se queda con la historia más avanzada
        const otra = d as unknown as Estado;
        const avance = (x: Estado) => x.jugadas.length + x.disparos.length + x.flotasListas.length;
        if (otra.partida > e.partida || (otra.partida === e.partida && (avance(otra) > avance(e) || (!e.asientos && otra.asientos)))) cambiar(() => ({ ...otra, pendiente: null }));
        return;
      }
      if (evento === 'revancha') { cambiar(() => ({ ...inicial(), partida: d.partida as number, asientos: d.asientos as [string, string] })); setFlota(null); return; }
      if (d.partida !== e.partida) return; // mensaje de otra partida de esta sala
      if (evento === 'empieza') cambiar((x) => (x.asientos ? x : { ...x, asientos: d.asientos as [string, string] }));
      if (evento === 'jugada') cambiar((x) => (d.n === x.jugadas.length ? { ...x, jugadas: [...x.jugadas, d.col as number] } : x));
      if (evento === 'flota-lista') cambiar((x) => (x.flotasListas.includes(d.de as string) ? x : { ...x, flotasListas: [...x.flotasListas, d.de as string] }));
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
    });
    sala.current = s;
    const pedir = setTimeout(() => s.enviar('pedir', {}), 800);
    return () => { clearTimeout(pedir); s.salir(); };
  }, [codigo, sesion.cargando, yo.id, valido]);

  const { asientos } = estado;
  const sentados = (asientos ?? presentes.slice(0, 2).map((p) => p.id)) as string[];
  const nombre = (id: string) => presentes.find((p) => p.id === id)?.nombre ?? 'Jugador';
  const mio = sentados.indexOf(yo.id), soyJugador = mio >= 0, rivalId = mio === 0 ? sentados[1] : sentados[0];

  // Cómo va la partida
  const conchas = jugarConchas(estado.jugadas);
  const flotasOk = estado.flotasListas.length === 2;
  const ganadorBalsas = asientos?.find((id) => estado.disparos.filter((d) => d.de === id && d.res !== 'agua').length >= CASILLAS_FLOTA);
  const terminada = juego === 'conchas' ? conchas.ganador > 0 || conchas.empate : !!ganadorBalsas;
  const turnoDe = juego === 'conchas' ? sentados[conchas.turno - 1] : sentados[estado.disparos.length % 2];

  // Abandono: si el rival no está mientras se juega, corre la cuenta
  const rivalPresente = presentes.some((p) => p.id === rivalId);
  const corre = !!asientos && soyJugador && !terminada && !rivalPresente && presentes.length > 0;
  useEffect(() => { setAusente((a) => (corre ? a ?? Date.now() : null)); }, [corre]);
  const quedan = ausente ? Math.max(0, ESPERA_ABANDONO - Math.floor((ahora - ausente) / 1000)) : null;
  const ganeAbandono = quedan === 0;

  // Antes de empezar: los dos primeros marcan Listo y el primero da la partida
  const listos = presentes.length >= 2 && presentes.slice(0, 2).every((p) => p.listo);
  useEffect(() => {
    if (asientos || !listos || presentes[0]?.id !== yo.id) return;
    const a: [string, string] = [presentes[0].id, presentes[1].id];
    sala.current?.enviar('empieza', { partida: estado.partida, asientos: a });
    cambiar((x) => ({ ...x, asientos: a }));
  }, [listos, !!asientos]);

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
    const a: [string, string] = [asientos[1], asientos[0]], partida = estado.partida + 1; // en la revancha parte el otro
    sala.current?.enviar('revancha', { partida, asientos: a });
    cambiar(() => ({ ...inicial(), partida, asientos: a }));
    setFlota(null);
  };
  const copiar = () => navigator.clipboard?.writeText(location.href).catch(() => undefined);
  const yoListo = presentes.find((p) => p.id === yo.id)?.listo ?? false;

  const resultado = ganeAbandono ? `¡Ganaste por abandono! ${nombre(rivalId)} no volvió.`
    : juego === 'conchas' ? (conchas.ganador ? `Ganó ${nombre(sentados[conchas.ganador - 1])}` : conchas.empate ? 'Empate: el tablero se llenó' : '')
    : ganadorBalsas ? `Ganó ${nombre(ganadorBalsas)}: hundió toda la flota` : '';

  return (
    <div class="vivo">
      <div class="sigla">En vivo · amistoso · sala {codigo}</div>
      <h1>{JUEGOS[juego].nombre}</h1>
      <p class="tenue">{JUEGOS[juego].idea}</p>
      <div class="fila"><button class="boton" onClick={copiar}>Copiar enlace de la sala</button><a class="boton" href="#/juegos/vivo">Salir</a></div>

      <ul class="vivo-gente">
        {presentes.map((p, i) => (
          <li key={p.clave} class={sentados.includes(p.id) || (!asientos && i < 2) ? 'juega' : ''}>
            <b>{p.nombre}{p.id === yo.id ? ' (tú)' : ''}</b>
            <span class="tenue chico">{sentados.includes(p.id) ? `Jugador ${sentados.indexOf(p.id) + 1}${!asientos ? (p.listo ? ' · listo' : ' · esperando') : ''}` : 'Mirando'}</span>
          </li>
        ))}
        {asientos && asientos.filter((id) => !presentes.some((p) => p.id === id)).map((id) => <li key={id} class="fuera"><b>{nombre(id)}</b><span class="tenue chico">desconectado</span></li>)}
      </ul>

      {!asientos && (
        presentes.length < 2 ? <p class="aviso atencion">Esperando a otra persona. Comparte el enlace de la sala.</p>
          : soyJugador ? <button class="boton principal grande" onClick={() => sala.current?.marcarListo(!yoListo)}>{yoListo ? 'Ya no estoy listo' : '¡Listo!'}</button>
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

      {resultado && soyJugador && <div class="fila"><button class="boton principal" onClick={revancha}>Revancha</button></div>}
    </div>
  );
}
