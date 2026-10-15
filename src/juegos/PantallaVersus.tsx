import { useEffect, useState } from 'preact/hooks';
import { fechaChile } from '../nucleo/azar';
import { supabase, useSesion } from '../nucleo/supabase';
import { JUEGOS, MOTORES, VERSUS, juegoPorId, nombreVersus } from './catalogo';
import { PUNTOS_BASE, leerPuntos, puntosVersus, type Puntos } from './puntos';
import { Sala, type Reto } from './Sala';
import * as V from './duelos';
import { TABLEROS } from '../vivo/tableros';
import { DUELOS } from '../vivo/formatos';
import { PuntosDuelo } from '../vivo/PuntosDuelo';

// Versus en diferido: cada lado juega el mismo desafío a su hora, con un solo intento, y el servidor compara.

interface Datos { personas: V.Persona[]; equipos: V.Equipo[]; lista: V.Enfrentamiento[]; marcas: V.MarcaVersus[]; disponible: boolean }

async function cargar(modo: '1v1' | '3v3'): Promise<Datos> {
  await V.cerrarVencidos();
  const [personas, equipos, { lista, disponible }] = await Promise.all([V.listarPersonas(), V.listarEquipos(), V.listarEnfrentamientos(modo)]);
  return { personas, equipos, lista, disponible, marcas: await V.marcasDe(lista.map((e) => e.id)) };
}

/** Tipos de versus que ya se pueden jugar en diferido en un modo. */
const jugables = (modo: '1v1' | '3v3') => VERSUS.filter((t) => t.modo === modo && t.base && (t.vivo || juegoPorId(t.base)?.listo));
/** Si un enfrentamiento se juega solo en vivo (su sala es `enf-<id>`). */
const esVivo = (e: { modo: string; juego: string }) => !!VERSUS.find((t) => t.modo === e.modo && t.base === e.juego)?.vivo;
/** Si un enfrentamiento se puede jugar en vivo (solo en vivo, o un juego de mesa que también tiene diferido). */
export const seJuegaEnVivo = (e: { modo: string; juego: string }) => esVivo(e) || (e.modo === '1v1' && (e.juego in TABLEROS || e.juego in DUELOS));

/** Mis enfrentamientos 1v1 pendientes que se juegan en vivo: van en la pestaña En vivo. */
export function MisEnVivo() {
  const sesion = useSesion(), yo = sesion.usuarioId;
  const [datos, setDatos] = useState<Datos | null>(null);
  useEffect(() => { if (yo) cargar('1v1').then(setDatos); }, [yo]);
  if (!yo) return <section class="bloque"><h2>Mis enfrentamientos</h2><p class="aviso atencion">Entra con Discord para ver tus enfrentamientos.</p></section>;
  if (!datos?.disponible) return null;
  const mios = datos.lista.filter((e) => e.estado === 'pendiente' && seJuegaEnVivo(e)).map((e) => ({ e, lado: V.ladoDe(e, yo, datos.equipos) })).filter((x): x is { e: V.Enfrentamiento; lado: V.Lado } => x.lado !== null);
  return (
    <section class="bloque">
      <h2>Mis enfrentamientos</h2>
      {!mios.length && <p class="tenue">No tienes enfrentamientos en vivo pendientes. Para retar a alguien, ve a Versus 1v1.</p>}
      <ul class="duelos">
        {mios.map(({ e, lado }) => {
          const hechas = datos.marcas.filter((m) => m.enfrentamiento_id === e.id && m.perfil_id === yo && m.terminado).length;
          return (
            <li key={e.id}>
              <span class="quienes"><b>{nombreVersus(e.modo, e.juego)}</b><span>contra {V.nombreLado(e, lado === 'a' ? 'b' : 'a', datos.personas, datos.equipos)} · {e.oficial ? `jornada ${e.jornada}` : 'amistoso'} · {e.rondas > 1 ? `ronda ${Math.min(hechas + 1, e.rondas)} de ${e.rondas} · ` : ''}{V.fechaCorta(e.plazo) === 'sin plazo' ? 'sin plazo' : `hasta el ${V.fechaCorta(e.plazo)}`}{!esVivo(e) ? ' · si no pueden a la vez, en Versus 1v1 (Diferido)' : ''}</span></span>
              {hechas < e.rondas ? <a class="boton principal" href={`#/juegos/vivo/enf-${e.id}`}>Jugar en vivo</a> : <span class="tenue chico">Ya jugaste. Falta tu rival.</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Cuánto ha jugado cada integrante del equipo hoy y en la jornada (las jornadas parten los viernes desde el 16 de octubre). */
function EstadoEquipo({ equipo, personas }: { equipo: V.Equipo; personas: V.Persona[] }) {
  const [cuentas, setCuentas] = useState<Record<string, { hoy: number; jornada: number; juegos: number }> | null>(null);
  const hoy = fechaChile(Date.now()), dias = Math.floor((Date.parse(hoy) - Date.parse('2026-10-16')) / 864e5);
  const inicio = dias < 0 ? hoy : fechaChile(Date.parse('2026-10-16T12:00:00Z') + (dias - (dias % 7)) * 864e5);
  useEffect(() => {
    supabase.from('marcas').select('perfil_id,juego,fecha').in('perfil_id', equipo.miembros).gte('fecha', inicio).limit(3000).then(({ data }) => {
      const r: Record<string, { hoy: number; jornada: number; juegos: number }> = {};
      for (const id of equipo.miembros) {
        const suyas = ((data as { perfil_id: string; juego: string; fecha: string }[] | null) ?? []).filter((m) => m.perfil_id === id);
        r[id] = { hoy: suyas.filter((m) => m.fecha === hoy).length, jornada: suyas.length, juegos: new Set(suyas.map((m) => m.juego)).size };
      }
      setCuentas(r);
    });
  }, [equipo.id]);
  return (
    <ul class="estado-equipo">
      {equipo.miembros.map((id) => {
        const c = cuentas?.[id];
        return (
          <li key={id} class={c?.hoy ? 'activo' : ''}>
            <a href={`#/perfil/${id}`}><b>{personas.find((p) => p.id === id)?.nombre ?? 'Participante'}</b></a>
            <span class="tenue chico">{!c ? '…' : `${c.hoy ? `✓ jugó hoy (${c.hoy})` : 'no ha jugado hoy'} · ${c.jornada} partidas en ${c.juegos} juegos esta ${dias < 0 ? 'jornada (aún no parte)' : 'jornada'}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function PestanaVersus({ modo, preset = '' }: { modo: '1v1' | '3v3'; preset?: string }) {
  const sesion = useSesion();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [puntos, setPuntos] = useState<Puntos>(PUNTOS_BASE);
  // "#/juegos/1v1/<persona>.<juego>": llega desde el botón Retar de una tabla, con rival y juego ya elegidos
  const [rivalPre, juegoPre = ''] = preset.split('.');
  const [elegido, setElegido] = useState(juegoPre);
  const irARetar = () => document.getElementById('retar')?.scrollIntoView({ behavior: 'smooth' });
  const recargar = () => cargar(modo).then(setDatos);
  useEffect(() => { recargar(); leerPuntos().then(setPuntos); }, [modo]);
  useEffect(() => { if (preset && datos) setTimeout(irARetar, 50); }, [preset, !!datos]);

  const yo = sesion.usuarioId, tipos = VERSUS.filter((t) => t.modo === modo);
  const miEquipo = datos?.equipos.find((q) => yo && q.miembros.includes(yo));
  const mios = (datos?.lista ?? []).map((e) => ({ e, lado: V.ladoDe(e, yo, datos!.equipos) })).filter((x): x is { e: V.Enfrentamiento; lado: V.Lado } => x.lado !== null);
  // En el diferido no van los que se juegan solo en vivo (están en En vivo → 1v1)
  const pendientes = mios.filter((x) => x.e.estado === 'pendiente' && !esVivo(x.e)), cerrados = mios.filter((x) => x.e.estado === 'cerrado');
  const nombre = (e: V.Enfrentamiento, lado: V.Lado) => V.nombreLado(e, lado, datos!.personas, datos!.equipos);
  const otro = (lado: V.Lado): V.Lado => (lado === 'a' ? 'b' : 'a');

  return (
    <>
      <h1>{modo === '1v1' ? 'Uno contra uno' : 'Equipo contra equipo'}</h1>
      <p>{modo === '1v1'
        ? 'Lo ideal es jugar en vivo: si tu enfrentamiento lo permite, aprieta "Jugar en vivo" y juéguenlo conectados a la vez. El diferido es solo para cuando no pueden a la misma hora: cada uno juega el mismo desafío a su hora, con un solo intento por ronda, y al final se compara.'
        : 'Muy pronto el 3v3 se jugará en vivo. Mientras tanto, cada integrante del equipo juega una vez el mismo desafío, a su hora y con un solo intento. Se suman los tres y gana el equipo con más.'}
        {' '}Ganar da {puntos.victoria} puntos, empatar {puntos.empate} y perder {puntos.derrota}, por el multiplicador de la jornada.</p>
      {sesion.usuarioId && (
        <div class="fila">
          {modo === '1v1' && <button class="boton principal" onClick={irARetar}>Retar a alguien</button>}
          {sesion.perfil?.rol === 'admin' && <a class="boton" href="#/admin">Crear enfrentamientos oficiales (Mesa de control)</a>}
        </div>
      )}
      {modo === '3v3' && <p class="tenue chico">Los enfrentamientos entre equipos los arma el organizador, una vez sorteados los equipos.</p>}

      {!datos ? <p class="tenue">Cargando…</p>
        : !datos.disponible ? <p class="aviso atencion">El versus todavía no está activado: falta que el organizador ejecute el último bloque de la base de datos.</p>
        : !yo ? <p class="aviso atencion">Entra con Discord para ver tus enfrentamientos.</p>
        : (
          <>
            {modo === '3v3' && (
              <section class="bloque">
                <h2>Mi equipo</h2>
                {miEquipo
                  ? <><p><b>{miEquipo.nombre}</b></p><EstadoEquipo equipo={miEquipo} personas={datos.personas} /></>
                  : <p class="tenue">Todavía no tienes equipo. Los equipos se sortean en La Llegada.</p>}
              </section>
            )}

            <section class="bloque">
              <h2>Mis enfrentamientos</h2>
              {modo === '1v1' && <p class="tenue chico">Para jugarlos en vivo, ve a <a href="#/juegos/vivo">En vivo → 1v1</a>. Aquí se juegan a tu hora.</p>}
              {!pendientes.length && <p class="tenue">No tienes enfrentamientos pendientes.</p>}
              <ul class="duelos">
                {pendientes.map(({ e, lado }) => {
                  const hechas = datos.marcas.filter((m) => m.enfrentamiento_id === e.id && m.perfil_id === yo && m.terminado).length, total = e.modo === '1v1' ? e.rondas : 1;
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
                        <a class="quienes" href={`#/juegos/duelo/${e.id}`}><b>{como === 'gana' ? 'Ganaste' : como === 'empata' ? 'Empate' : 'Perdiste'} · {mias} a {suyas}</b><span>{nombreVersus(e.modo, e.juego)} contra {nombre(e, otro(lado))} · ver detalle</span></a>
                        <span class="tenue chico">{e.oficial ? `+${puntosVersus(puntos, como, e.jornada)} pts del torneo` : 'amistoso'}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {modo === '1v1' && <Retar yo={yo} personas={datos.personas} alCrear={recargar} elegido={elegido} rivalInicial={rivalPre} />}
          </>
        )}

      <section class="motor" style="--tono:#ffe08a">
        <h2>Tipos de enfrentamiento</h2>
        <div class="rejilla-juegos">
          {tipos.map((t) => {
            const base = t.base ? juegoPorId(t.base) : undefined, abierto = !!base?.listo, puede = abierto && modo === '1v1' && !!yo && !!datos?.disponible;
            // Los que ya se juegan en vivo llevan a la pestaña En vivo
            if (t.vivo) return <a key={t.id} class="tarjeta activa" href="#/juegos/vivo" style="--tono:#ffe08a"><img class="foto" src={`${import.meta.env.BASE_URL}juegos/${t.base}.png`} alt="" loading="lazy" onError={(ev) => { ev.currentTarget.style.display = 'none'; }} /><h3>{t.nombre}</h3><p>{t.idea}</p><span class="pie"><span class="premia">Juego en vivo</span><span class="estado">Jugar en vivo</span></span></a>;
            return (
              <div key={t.id} onClick={puede ? () => { setElegido(t.base!); irARetar(); } : undefined} class={`tarjeta${abierto ? '' : ' cerrada'}${puede ? ' activa' : ''}`} style={base ? `--tono:${MOTORES[base.motor].color}` : undefined}>
                {t.base && <img class="foto" src={`${import.meta.env.BASE_URL}juegos/${t.base}.png`} alt="" loading="lazy" onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />}
                <h3>{t.nombre}</h3>
                <p>{t.idea}</p>
                <span class="pie"><span class="premia">{base ? `Sobre ${base.nombre}` : 'Juego en vivo'}</span><span class="estado">{puede ? 'Retar' : abierto ? 'Disponible' : base ? 'Pronto' : 'Pronto, en vivo'}</span></span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

/** Amistoso: cualquiera reta a cualquiera, sin puntos para el torneo. */
function Retar({ yo, personas, alCrear, elegido, rivalInicial }: { yo: string; personas: V.Persona[]; alCrear(): void; elegido: string; rivalInicial: string }) {
  const opciones = jugables('1v1');
  const [buscar, setBuscar] = useState('');
  const [rival, setRival] = useState(rivalInicial !== yo && personas.some((p) => p.id === rivalInicial) ? rivalInicial : '');
  const [juego, setJuego] = useState(opciones[0]?.base ?? '');
  useEffect(() => { if (elegido) setJuego(elegido); }, [elegido]);
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
    <section class="bloque" id="retar">
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
  // Los que se juegan solo en vivo tienen su propia sala
  if (e && esVivo(e) && e.estado === 'pendiente') { location.hash = `#/juegos/vivo/enf-${e.id}`; return null; }
  if (!e || (!juego?.listo && !esVivo(e))) return mensaje('Este enfrentamiento no existe');
  const lado = V.ladoDe(e, sesion.usuarioId, estado.equipos), volver = `#/juegos/${e.modo}`;
  if (e.estado === 'cerrado') return <ResultadoDuelo e={e} lado={lado} marcas={estado.marcas} personas={estado.personas} equipos={estado.equipos} />;
  if (!lado) return mensaje(sesion.usuarioId ? 'No eres parte de este enfrentamiento' : 'Entra con Discord para jugar');
  if (e.estado !== 'pendiente') return mensaje('Este enfrentamiento fue anulado');
  const mias = estado.marcas.filter((m) => m.perfil_id === sesion.usuarioId);
  const total = e.modo === '1v1' ? e.rondas : 1, jugadas = new Set(mias.filter((m) => m.terminado).map((m) => m.ronda));
  let ronda = 1;
  while (ronda <= total && jugadas.has(ronda)) ronda++;
  if (ronda > total) return mensaje('Ya jugaste todas tus rondas');
  const previa = mias.find((m) => m.ronda === ronda); // partida que se cortó a medias

  const rival = V.nombreLado(e, lado === 'a' ? 'b' : 'a', estado.personas, estado.equipos);
  const reto: Reto = {
    titulo: `${nombreVersus(e.modo, e.juego)} · contra ${rival}${total > 1 ? ` · ronda ${ronda} de ${total}` : ''}`,
    aviso: previa
      ? 'Tu partida de esta ronda se cortó. Si fue en los primeros 10 segundos, puedes jugarla de nuevo una vez; si no, vale lo que alcanzaste a llevar.'
      : 'Tienes un solo intento. Si cierras la pestaña en los primeros 10 segundos, puedes empezar de nuevo una vez; después, vale lo que llevabas. Tu rival juega exactamente el mismo desafío.',
    volver,
    practica: `#/juegos/${e.juego}`,
    async empezar() {
      const r = await V.empezarRonda(e.id, ronda);
      if (!r.semilla) throw new Error(r.error);
      return r.semilla;
    },
    terminar: (r) => V.terminarRonda(e.id, ronda, r.puntaje, r.detalle),
    nivel: e.jornada,
    latido: (puntaje) => V.latidoRonda(e.id, ronda, puntaje),
  };
  if (!juego) return mensaje('Este enfrentamiento se juega en vivo');
  return <Sala key={`${e.id}-${ronda}`} juego={juego} reto={reto} />;
}

/** "mejorRacha" → "Mejor racha" */
const legible = (clave: string) => { const t = clave.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase(); return t[0].toUpperCase() + t.slice(1); };

function Celda({ m }: { m?: V.MarcaVersus }) {
  if (!m) return <td class="tenue">No jugó</td>;
  const datos = Object.entries(m.detalle ?? {}).filter(([k, v]) => k !== 'semilla' && k !== 'interrumpido' && ['number', 'string', 'boolean'].includes(typeof v));
  return (
    <td>
      <b class="grande">{m.puntaje}</b>{V.cortada(m) && <span class="etiqueta">se cortó</span>}
      {datos.length > 0 && <dl class="desglose chico">{datos.map(([k, v]) => <div key={k}><dt>{legible(k)}</dt><dd>{v === true ? 'sí' : v === false ? 'no' : String(v)}</dd></div>)}</dl>}
    </td>
  );
}

/** Resultado completo de un enfrentamiento cerrado: rondas, desglose lado a lado, puntos del torneo y revancha. */
function ResultadoDuelo({ e, lado, marcas, personas, equipos }: { e: V.Enfrentamiento; lado: V.Lado | null; marcas: V.MarcaVersus[]; personas: V.Persona[]; equipos: V.Equipo[] }) {
  const sesion = useSesion();
  const [puntos, setPuntos] = useState<Puntos>(PUNTOS_BASE);
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);
  useEffect(() => { leerPuntos().then(setPuntos); }, []);
  const yo = lado ?? 'a', el = yo === 'a' ? 'b' : 'a', n = (l: V.Lado) => V.nombreLado(e, l, personas, equipos);
  const como = e.ganador === 'empate' ? 'empata' : e.ganador === yo ? 'gana' : 'pierde';
  const delLado = (l: V.Lado) => marcas.filter((m) => m.lado === l);
  const filas = e.modo === '1v1'
    ? Array.from({ length: e.rondas }, (_, i) => ({ titulo: `Ronda ${i + 1}`, a: delLado(yo).find((m) => m.ronda === i + 1), b: delLado(el).find((m) => m.ronda === i + 1) }))
    : Array.from({ length: 3 }, (_, i) => {
      const a = delLado(yo)[i], b = delLado(el)[i], quien = (m?: V.MarcaVersus) => personas.find((p) => p.id === m?.perfil_id)?.nombre ?? '—';
      return { titulo: `${quien(a)} / ${quien(b)}`, a, b };
    });
  const revancha = async () => {
    const otro = yo === 'a' ? e.b_perfil : e.a_perfil;
    const error = await V.crearEnfrentamientos([{ modo: '1v1', juego: e.juego, rondas: e.rondas, jornada: 1, plazo: null, oficial: false, a_perfil: sesion.usuarioId, b_perfil: otro, a_equipo: null, b_equipo: null }]);
    setAviso(error ? { texto: `No se pudo crear: ${error}`, ok: false } : { texto: 'Revancha creada: ya aparece en tus enfrentamientos y en los de tu rival.', ok: true });
  };

  return (
    <div class="pagina">
      <div class="sigla">{nombreVersus(e.modo, e.juego)} · {e.oficial ? `jornada ${e.jornada}` : 'amistoso'}</div>
      <h1>{lado ? (como === 'gana' ? '¡Ganaste!' : como === 'empata' ? 'Empate' : 'Perdiste') : e.ganador === 'empate' ? 'Empate' : `Ganó ${n(e.ganador as V.Lado)}`}</h1>
      <p class="marcador-duelo"><b>{n(yo)}</b> {yo === 'a' ? e.puntos_a : e.puntos_b} <span class="tenue">a</span> {yo === 'a' ? e.puntos_b : e.puntos_a} <b>{n(el)}</b>
        <span class="tenue chico"> · {e.modo === '1v1' ? 'rondas ganadas' : 'puntos sumados'}</span></p>
      {e.oficial && e.modo === '1v1' ? <PuntosDuelo id={e.id} /> : lado && <p>{e.oficial ? `Para el torneo: +${puntosVersus(puntos, como, e.jornada)} puntos (jornada ${e.jornada}).` : 'Amistoso: no da puntos del torneo.'}</p>}
      {marcas.length > 0 && <div class="tabla-caja">
        <table class="tabla duelo-detalle">
          <thead><tr><th>{e.modo === '1v1' ? 'Ronda' : 'Integrantes'}</th><th>{n(yo)}</th><th>{n(el)}</th></tr></thead>
          <tbody>{filas.map((f, i) => <tr key={i}><th>{f.titulo}</th><Celda m={f.a} /><Celda m={f.b} /></tr>)}</tbody>
        </table>
      </div>}
      {!marcas.length && <p class="tenue chico">Entra con Discord para ver el detalle de cada ronda.</p>}
      <div class="fila">
        {lado && e.modo === '1v1' && sesion.usuarioId && <button class="boton principal" onClick={revancha}>Pedir revancha</button>}
        <a class="boton" href={`#/juegos/${e.modo}`}>Volver a los enfrentamientos</a>
      </div>
      {aviso && <p class={`aviso ${aviso.ok ? 'ok' : 'error'}`}>{aviso.texto}</p>}
    </div>
  );
}
