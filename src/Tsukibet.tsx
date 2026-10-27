import { useEffect, useState } from 'preact/hooks';
import { supabase, useSesion } from './nucleo/supabase';
import { fechaChile } from './nucleo/azar';
import * as V from './juegos/duelos';
import { CRUCES, calendarioDeEquipos } from './juegos/liga';
import { MARCADORES, clavePareja, puntuar, reparto, resultadosCruce, type Pronostico, type ResultadoPareja } from '../supabase/functions/_shared/tsukibet.ts';

// TSUKIBET: pronósticos de cada enfrentamiento de equipos del próximo cruce. Cierra a las 00:00 del día en que empieza;
// hasta entonces nadie ve lo que eligieron los demás (lo cuida la base). El puntaje sale de los resultados públicos.

interface Fila { cruce: number; perfil_id: string; equipo_a: number; equipo_b: number; ganador: number; marcador: string | null }
interface Datos { equipos: V.Equipo[]; personas: V.Persona[]; duelos: V.Enfrentamiento[]; ausencias: V.Ausencia[]; pronosticos: Pronostico[]; cuantos: number; falta: boolean }
const fecha = (f: string) => f.split('-').reverse().slice(0, 2).join('/');
const pct = (x: number) => `${Math.round(x * 100)}%`;

function cuentaAtras(desde: string, ahora: number) {
  const ms = Date.parse(`${desde}T00:00:00-03:00`) - ahora;
  if (ms <= 0) return 'cerrado';
  const h = Math.floor(ms / 36e5), d = Math.floor(h / 24);
  return d >= 1 ? `cierra en ${d} ${d === 1 ? 'día' : 'días'} y ${h % 24} h` : `cierra en ${h} h ${Math.floor((ms % 36e5) / 6e4)} min`;
}

export function Tsukibet() {
  const sesion = useSesion(), yo = sesion.usuarioId;
  const [d, setD] = useState<Datos | null>(null), [aviso, setAviso] = useState(''), [ahora, setAhora] = useState(Date.now());
  const hoy = fechaChile(ahora);
  const abierto = CRUCES.find((c) => c.desde > hoy && Date.parse(c.desde) - Date.parse(hoy) <= 7 * 864e5) ?? null;
  const cargar = async () => {
    const [equipos, personas, { lista }, ausencias, filas, cuantos] = await Promise.all([
      V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos('1v1'), V.listarAusencias(),
      supabase.from('tsukibet').select('cruce,perfil_id,equipo_a,equipo_b,ganador,marcador').limit(5000),
      abierto ? supabase.rpc('tsukibet_cuantos', { p_cruce: abierto.n }) : Promise.resolve({ data: 0 }),
    ]);
    const pronosticos = ((filas.data ?? []) as Fila[]).map((f) => ({ cruce: f.cruce, perfil: f.perfil_id, a: f.equipo_a, b: f.equipo_b, ganador: f.ganador, marcador: f.marcador }));
    setD({ equipos, personas, duelos: lista.filter((e) => e.oficial && e.cruce != null), ausencias, pronosticos, cuantos: Number(cuantos.data ?? 0), falta: !!filas.error });
  };
  useEffect(() => { cargar(); const t = setInterval(() => setAhora(Date.now()), 30_000); return () => clearInterval(t); }, [yo]);
  if (!d) return <p class="tenue">Cargando TSUKIBET…</p>;

  const equipo = (id: number) => d.equipos.find((q) => q.id === id);
  const equipoDe = (perfil: string) => d.equipos.find((q) => q.miembros.includes(perfil))?.id ?? null;
  const nombre = (id: string) => d.personas.find((p) => p.id === id)?.nombre ?? 'Participante';
  // Las parejas de un cruce: de sus duelos oficiales si ya existen; si no, del calendario
  const parejas = (n: number): [number, number][] => {
    const vistas = new Map<string, [number, number]>();
    for (const e of d.duelos.filter((x) => x.cruce === n && x.a_perfil && x.b_perfil)) {
      const qa = equipoDe(e.a_perfil!), qb = equipoDe(e.b_perfil!);
      if (qa != null && qb != null && qa !== qb) vistas.set(clavePareja(qa, qb), [qa, qb]);
    }
    if (vistas.size) return [...vistas.values()];
    return (calendarioDeEquipos(d.equipos)[n - 1]?.parejas ?? []).filter(([a, b]) => equipo(a)?.miembros.length && equipo(b)?.miembros.length);
  };
  const resultados = (n: number) => resultadosCruce(n, d.duelos.map((e) => ({ cruce: e.cruce ?? null, a: e.a_perfil, b: e.b_perfil, ganador: e.ganador, estado: e.estado })), d.ausencias.map((x) => ({ cruce: x.cruce, perfil: x.perfil_id, equipoRival: x.equipo_rival })), equipoDe);
  const mio = (n: number, a: number, b: number) => d.pronosticos.find((p) => p.cruce === n && p.perfil === yo && clavePareja(p.a, p.b) === clavePareja(a, b));

  const elegir = async (a: number, b: number, ganador: number, marcador: string | null) => {
    if (!abierto || !yo) return;
    const fila = { cruce: abierto.n, perfil_id: yo, equipo_a: Math.min(a, b), equipo_b: Math.max(a, b), ganador, marcador, actualizado: new Date().toISOString() };
    const { error } = await supabase.from('tsukibet').upsert(fila);
    if (error) return setAviso(`No se pudo guardar: ${error.message}`);
    setAviso('');
    setD({ ...d, pronosticos: [...d.pronosticos.filter((p) => !(p.cruce === abierto.n && p.perfil === yo && clavePareja(p.a, p.b) === clavePareja(a, b))), { cruce: abierto.n, perfil: yo, a: fila.equipo_a, b: fila.equipo_b, ganador, marcador }] });
  };

  // Cruces ya cerrados con pronósticos: tabla de cada uno y de la temporada
  const cerrados = CRUCES.filter((c) => c.desde <= hoy && d.pronosticos.some((p) => p.cruce === c.n));
  const porCruce = cerrados.map((c) => ({ c, res: resultados(c.n), tabla: puntuar(d.pronosticos.filter((p) => p.cruce === c.n), resultados(c.n)) }));
  const temporada = new Map<string, { puntos: number; aciertos: number; perfectos: number }>();
  for (const { tabla } of porCruce) for (const t of tabla) { const s = temporada.get(t.perfil) ?? { puntos: 0, aciertos: 0, perfectos: 0 }; s.puntos += t.puntos; s.aciertos += t.aciertos; if (t.perfecto) s.perfectos++; temporada.set(t.perfil, s); }
  const general = [...temporada].sort((x, y) => y[1].puntos - x[1].puntos || y[1].aciertos - x[1].aciertos);
  const listos = abierto ? parejas(abierto.n).filter(([a, b]) => mio(abierto.n, a, b)).length : 0, total = abierto ? parejas(abierto.n).length : 0;

  return (
    <>
      <section class="bloque tsukibet-cabeza">
        <h2 class="tsukibet-logo">TSUKI<b>BET</b></h2>
        <p>Pronostica quién gana cada enfrentamiento de equipos del próximo cruce. <b>Ganador correcto: 3 puntos.</b> Marcador exacto: +2. Si aciertas contra la mayoría (menos del 30% eligió ese equipo): +1. No hay dinero ni calabazas en juego: solo la gloria y la tabla.</p>
        <p class="tenue chico">Nadie ve lo que eligieron los demás hasta que cierra. Puedes cambiar tus pronósticos hasta las 00:00 del día en que empieza el cruce.</p>
        {d.falta && <p class="aviso atencion">TSUKIBET todavía no está activado en la base de datos.</p>}
        {aviso && <p class="aviso atencion">{aviso}</p>}
      </section>

      {abierto && !d.falta && (
        <section class="bloque tsukibet-abierto">
          <h2>Cruce {abierto.n} · del {fecha(abierto.desde)} al {fecha(abierto.hasta)}</h2>
          <p class="fila"><span class="tsukibet-reloj">{cuentaAtras(abierto.desde, ahora)}</span><span class="tenue">{d.cuantos} {d.cuantos === 1 ? 'persona ya pronosticó' : 'personas ya pronosticaron'}</span>{yo && <span class={listos === total ? 'aviso ok chico' : 'tenue'}>Tienes {listos} de {total}</span>}</p>
          {!yo && <p class="aviso atencion">Entra con Discord para pronosticar.</p>}
          <div class="tsukibet-parejas">{parejas(abierto.n).map(([a, b]) => {
            const m = mio(abierto.n, a, b);
            return (
              <article key={clavePareja(a, b)} class={`tsukibet-pareja${m ? ' lista' : ''}`}>
                <div class="tsukibet-equipos">
                  {[a, b].map((q, i) => (
                    <>
                      {i === 1 && <span class="tsukibet-vs">VS</span>}
                      <button key={q} class={`tsukibet-equipo${m?.ganador === q ? ' elegido' : ''}`} disabled={!yo} aria-pressed={m?.ganador === q} onClick={() => elegir(a, b, q, m?.marcador ?? null)}>
                        <b>{equipo(q)?.nombre ?? `Equipo ${q}`}</b>
                        <small>{(equipo(q)?.miembros ?? []).map(nombre).join(' · ')}</small>
                      </button>
                    </>
                  ))}
                </div>
                {m && <div class="fila tsukibet-marcador"><span class="tenue chico">¿Marcador?</span>{MARCADORES.map((x) => <button key={x} class={`boton${m.marcador === x ? ' principal' : ''}`} onClick={() => elegir(a, b, m.ganador, m.marcador === x ? null : x)}>{x}</button>)}</div>}
              </article>
            );
          })}</div>
        </section>
      )}
      {!abierto && <p class="tenue">No hay un cruce abierto para pronosticar ahora mismo. Abre 7 días antes de que empiece cada cruce.</p>}

      {porCruce.slice().reverse().map(({ c, res, tabla }) => (
        <section key={c.n} class="bloque">
          <h2>Cruce {c.n} · así votaron y así salió</h2>
          <ul class="tsukibet-resultados">{parejas(c.n).map(([a, b]) => {
            const r: ResultadoPareja | undefined = res.get(clavePareja(a, b)), rep = reparto(d.pronosticos.filter((p) => p.cruce === c.n), a, b, a), m = mio(c.n, a, b);
            return (
              <li key={clavePareja(a, b)}>
                <div class="fila"><b>{equipo(a)?.nombre}</b><span class="tsukibet-barra" style={`--parte:${rep.parte * 100}%`} title={`${pct(rep.parte)} con ${equipo(a)?.nombre}`}><i /></span><b>{equipo(b)?.nombre}</b></div>
                <span class="chico tenue">{rep.total ? `${pct(rep.parte)} con ${equipo(a)?.nombre} · ${pct(1 - rep.parte)} con ${equipo(b)?.nombre}` : 'Nadie pronosticó'}{' · '}{r?.terminado ? (r.ganador ? `ganó ${equipo(r.ganador)?.nombre} ${r.marcador}` : 'empate') : 'en juego'}</span>
                {m && <span class={`chico ${r?.terminado ? (r.ganador === m.ganador ? 'tsukibet-bien' : 'tsukibet-mal') : 'tenue'}`}> · Tú: {equipo(m.ganador)?.nombre}{m.marcador ? ` ${m.marcador}` : ''}</span>}
              </li>
            );
          })}</ul>
          {tabla.length > 0 && <ol class="marcas">{tabla.slice(0, 10).map((t, i) => <li key={t.perfil} class={t.perfil === yo ? 'mia' : ''}><span class="puesto">{i + 1}</span><a class="quien" href={`#/perfil/${t.perfil}`}>{nombre(t.perfil)}{t.perfecto ? ' · PLENO' : ''}</a><b>{t.puntos} pts</b></li>)}</ol>}
        </section>
      ))}

      <section class="bloque">
        <h2>Tabla de la temporada</h2>
        {!general.length ? <p class="tenue">Todavía no hay cruces cerrados con pronósticos. La tabla aparece cuando cierre el primero.</p> : (
          <ol class="marcas">{general.slice(0, 20).map(([id, s], i) => <li key={id} class={id === yo ? 'mia' : ''}><span class="puesto">{i + 1}</span><a class="quien" href={`#/perfil/${id}`}>{nombre(id)}</a><b>{s.puntos} pts</b><span class="tenue chico">{s.aciertos} aciertos{s.perfectos ? ` · ${s.perfectos} plenos` : ''}</span></li>)}</ol>
        )}
      </section>
    </>
  );
}
