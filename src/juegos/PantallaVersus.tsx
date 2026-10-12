import { useEffect, useState } from 'preact/hooks';
import { useSesion } from '../nucleo/supabase';
import { JUEGOS, MOTORES, VERSUS, juegoPorId, nombreVersus } from './catalogo';
import { PUNTOS_BASE, leerPuntos, puntosVersus, type Puntos } from './puntos';
import { Sala, type Reto } from './Sala';
import * as V from './duelos';

// Versus en diferido: cada lado juega el mismo desafío a su hora, con un solo intento, y el servidor compara.

interface Datos { personas: V.Persona[]; equipos: V.Equipo[]; lista: V.Enfrentamiento[]; marcas: V.MarcaVersus[]; disponible: boolean }

async function cargar(modo: '1v1' | '3v3'): Promise<Datos> {
  await V.cerrarVencidos();
  const [personas, equipos, { lista, disponible }] = await Promise.all([V.listarPersonas(), V.listarEquipos(), V.listarEnfrentamientos(modo)]);
  return { personas, equipos, lista, disponible, marcas: await V.marcasDe(lista.map((e) => e.id)) };
}

/** Tipos de versus que ya se pueden jugar en diferido en un modo. */
const jugables = (modo: '1v1' | '3v3') => VERSUS.filter((t) => t.modo === modo && t.base && juegoPorId(t.base)?.listo);

export function PestanaVersus({ modo }: { modo: '1v1' | '3v3' }) {
  const sesion = useSesion();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [puntos, setPuntos] = useState<Puntos>(PUNTOS_BASE);
  const recargar = () => cargar(modo).then(setDatos);
  useEffect(() => { recargar(); leerPuntos().then(setPuntos); }, [modo]);

  const yo = sesion.usuarioId, tipos = VERSUS.filter((t) => t.modo === modo);
  const miEquipo = datos?.equipos.find((q) => yo && q.miembros.includes(yo));
  const mios = (datos?.lista ?? []).map((e) => ({ e, lado: V.ladoDe(e, yo, datos!.equipos) })).filter((x): x is { e: V.Enfrentamiento; lado: V.Lado } => x.lado !== null);
  const pendientes = mios.filter((x) => x.e.estado === 'pendiente'), cerrados = mios.filter((x) => x.e.estado === 'cerrado');
  const nombre = (e: V.Enfrentamiento, lado: V.Lado) => V.nombreLado(e, lado, datos!.personas, datos!.equipos);
  const otro = (lado: V.Lado): V.Lado => (lado === 'a' ? 'b' : 'a');

  return (
    <>
      <h1>{modo === '1v1' ? 'Uno contra uno' : 'Equipo contra equipo'}</h1>
      <p>{modo === '1v1'
        ? 'Tú y tu rival juegan el mismo desafío, cada uno a su hora y con un solo intento por ronda. Cuando ambos jugaron, se compara y hay ganador.'
        : 'Cada integrante del equipo juega una vez el mismo desafío, a su hora y con un solo intento. Se suman los tres y gana el equipo con más.'}
        {' '}Ganar da {puntos.victoria} puntos, empatar {puntos.empate} y perder {puntos.derrota}, por el multiplicador de la jornada.</p>

      {!datos ? <p class="tenue">Cargando…</p>
        : !datos.disponible ? <p class="aviso atencion">El versus todavía no está activado: falta que el organizador ejecute el último bloque de la base de datos.</p>
        : !yo ? <p class="aviso atencion">Entra con Discord para ver tus enfrentamientos.</p>
        : (
          <>
            {modo === '3v3' && (
              <section class="bloque">
                <h2>Mi equipo</h2>
                {miEquipo
                  ? <p><b>{miEquipo.nombre}</b> · {miEquipo.miembros.map((id) => datos.personas.find((p) => p.id === id)?.nombre ?? 'Participante').join(', ')}</p>
                  : <p class="tenue">Todavía no tienes equipo. Los equipos se sortean en La Llegada.</p>}
              </section>
            )}

            <section class="bloque">
              <h2>Mis enfrentamientos</h2>
              {!pendientes.length && <p class="tenue">No tienes enfrentamientos pendientes.</p>}
              <ul class="duelos">
                {pendientes.map(({ e, lado }) => {
                  const hechas = datos.marcas.filter((m) => m.enfrentamiento_id === e.id && m.perfil_id === yo).length, total = e.modo === '1v1' ? e.rondas : 1;
                  return (
                    <li key={e.id}>
                      <span class="quienes"><b>{nombreVersus(e.modo, e.juego)}</b><span>contra {nombre(e, otro(lado))} · {e.oficial ? `jornada ${e.jornada}` : 'amistoso'} · {V.fechaCorta(e.plazo) === 'sin plazo' ? 'sin plazo' : `hasta el ${V.fechaCorta(e.plazo)}`}</span></span>
                      {hechas < total
                        ? <a class="boton principal" href={`#/juegos/duelo/${e.id}`}>{total > 1 ? `Jugar ronda ${hechas + 1} de ${total}` : 'Jugar mi turno'}</a>
                        : <span class="tenue chico">Ya jugaste. Falta {e.modo === '1v1' ? 'tu rival' : 'el resto'}.</span>}
                    </li>
                  );
                })}
              </ul>
            </section>

            {cerrados.length > 0 && (
              <section class="bloque">
                <h2>Historial</h2>
                <ul class="duelos">
                  {cerrados.map(({ e, lado }) => {
                    const como = e.ganador === 'empate' ? 'empata' : e.ganador === lado ? 'gana' : 'pierde';
                    const mias = lado === 'a' ? e.puntos_a : e.puntos_b, suyas = lado === 'a' ? e.puntos_b : e.puntos_a;
                    return (
                      <li key={e.id} class={como}>
                        <span class="quienes"><b>{como === 'gana' ? 'Ganaste' : como === 'empata' ? 'Empate' : 'Perdiste'} · {mias} a {suyas}</b><span>{nombreVersus(e.modo, e.juego)} contra {nombre(e, otro(lado))}</span></span>
                        <span class="tenue chico">{e.oficial ? `+${puntosVersus(puntos, como, e.jornada)} pts del torneo` : 'amistoso'}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {modo === '1v1' && <Retar yo={yo} personas={datos.personas} alCrear={recargar} />}
          </>
        )}

      <section class="motor" style="--tono:#ffe08a">
        <h2>Tipos de enfrentamiento</h2>
        <div class="rejilla-juegos">
          {tipos.map((t) => {
            const base = t.base ? juegoPorId(t.base) : undefined, abierto = !!base?.listo;
            return (
              <div key={t.id} class={`tarjeta${abierto ? '' : ' cerrada'}`} style={base ? `--tono:${MOTORES[base.motor].color}` : undefined}>
                <h3>{t.nombre}</h3>
                <p>{t.idea}</p>
                <span class="pie"><span class="premia">{base ? `Sobre ${base.nombre}` : 'Juego en vivo'}</span><span class="estado">{abierto ? 'Disponible' : base ? 'Pronto' : 'Pronto, en vivo'}</span></span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

/** Amistoso: cualquiera reta a cualquiera, sin puntos para el torneo. */
function Retar({ yo, personas, alCrear }: { yo: string; personas: V.Persona[]; alCrear(): void }) {
  const opciones = jugables('1v1');
  const [buscar, setBuscar] = useState('');
  const [rival, setRival] = useState('');
  const [juego, setJuego] = useState(opciones[0]?.base ?? '');
  const [rondas, setRondas] = useState(1);
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);
  const filtradas = personas.filter((p) => p.id !== yo && p.nombre.toLowerCase().includes(buscar.trim().toLowerCase()));

  const crear = async () => {
    if (!rival || !juego) return setAviso({ texto: 'Elige a quién retar y en qué juego.', ok: false });
    const error = await V.crearEnfrentamientos([{ modo: '1v1', juego, rondas, jornada: 1, plazo: null, oficial: false, a_perfil: yo, b_perfil: rival, a_equipo: null, b_equipo: null }]);
    setAviso(error ? { texto: `No se pudo crear: ${error}`, ok: false } : { texto: 'Reto creado. Aparece arriba, en tus enfrentamientos, y también en los de tu rival.', ok: true });
    if (!error) alCrear();
  };

  return (
    <section class="bloque">
      <h2>Retar a alguien (amistoso)</h2>
      <p class="tenue chico">Sirve para practicar: no da puntos del torneo.</p>
      <div class="formulario">
        <label>Buscar rival<input class="texto" value={buscar} onInput={(e) => setBuscar(e.currentTarget.value)} placeholder="Escribe un nombre" /></label>
        <label>Rival
          <select class="texto" value={rival} onChange={(e) => setRival(e.currentTarget.value)}>
            <option value="">Elige…</option>
            {filtradas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label>Juego
          <select class="texto" value={juego} onChange={(e) => setJuego(e.currentTarget.value)}>
            {opciones.map((t) => <option key={t.id} value={t.base}>{t.nombre}</option>)}
          </select>
        </label>
        <label>Formato
          <select class="texto" value={rondas} onChange={(e) => setRondas(Number(e.currentTarget.value))}>
            <option value={1}>A una ronda</option><option value={3}>Mejor de 3</option><option value={5}>Mejor de 5</option>
          </select>
        </label>
        <button class="boton principal" onClick={crear}>Retar</button>
      </div>
      {aviso && <p class={`aviso ${aviso.ok ? 'ok' : 'error'}`}>{aviso.texto}</p>}
    </section>
  );
}

/** La ronda que a esta persona le toca jugar en un enfrentamiento. */
export function Duelo({ id }: { id: number }) {
  const sesion = useSesion();
  const [estado, setEstado] = useState<{ e: V.Enfrentamiento | null; equipos: V.Equipo[]; personas: V.Persona[]; marcas: V.MarcaVersus[] } | null>(null);
  useEffect(() => {
    if (!Number.isFinite(id)) return setEstado({ e: null, equipos: [], personas: [], marcas: [] });
    Promise.all([V.unEnfrentamiento(id), V.listarEquipos(), V.listarPersonas(), V.marcasDe([id])]).then(([e, equipos, personas, marcas]) => setEstado({ e, equipos, personas, marcas }));
  }, [id, sesion.usuarioId]);

  const mensaje = (texto: string) => <div class="pagina"><div class="sigla">Enfrentamiento</div><h1>{texto}</h1><p><a class="boton" href="#/juegos/1v1">Volver a los enfrentamientos</a></p></div>;
  if (!estado || sesion.cargando) return <div class="pagina"><p>Cargando…</p></div>;
  const { e } = estado, juego = e ? JUEGOS.find((x) => x.id === e.juego) : undefined;
  if (!e || !juego?.listo) return mensaje('Este enfrentamiento no existe');
  const lado = V.ladoDe(e, sesion.usuarioId, estado.equipos), volver = `#/juegos/${e.modo}`;
  if (!lado) return mensaje(sesion.usuarioId ? 'No eres parte de este enfrentamiento' : 'Entra con Discord para jugar');
  if (e.estado !== 'pendiente') return mensaje('Este enfrentamiento ya está cerrado');
  const total = e.modo === '1v1' ? e.rondas : 1, jugadas = new Set(estado.marcas.filter((m) => m.perfil_id === sesion.usuarioId).map((m) => m.ronda));
  let ronda = 1;
  while (ronda <= total && jugadas.has(ronda)) ronda++;
  if (ronda > total) return mensaje('Ya jugaste todas tus rondas');

  const rival = V.nombreLado(e, lado === 'a' ? 'b' : 'a', estado.personas, estado.equipos);
  const reto: Reto = {
    titulo: `${nombreVersus(e.modo, e.juego)} · contra ${rival}${total > 1 ? ` · ronda ${ronda} de ${total}` : ''}`,
    aviso: 'Tienes un solo intento. Si sales o recargas a mitad de partida, el intento se pierde. Tu rival juega exactamente el mismo desafío.',
    volver,
    practica: `#/juegos/${e.juego}`,
    async empezar() {
      const r = await V.empezarRonda(e.id, ronda);
      if (!r.semilla) throw new Error(r.error);
      return r.semilla;
    },
    terminar: (r) => V.terminarRonda(e.id, ronda, r.puntaje, r.detalle),
  };
  return <Sala key={`${e.id}-${ronda}`} juego={juego} reto={reto} />;
}
