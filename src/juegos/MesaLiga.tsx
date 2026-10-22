import { useEffect, useState } from 'preact/hooks';
import { fechaChile } from '../nucleo/azar';
import { supabase } from '../nucleo/supabase';
import { VERSUS, juegoPorId, nombreVersus } from './catalogo';
import * as V from './duelos';
import { CRUCES, calendarioDeEquipos, jornadaDe } from './liga';

// Mesa de control · Liga: los 11 cruces del todos contra todos. Para cada cruce se sortean 3 juegos (sin repetir en la
// jornada) y quién enfrenta a quién dentro de cada par de equipos; al confirmar se crean los duelos oficiales
// (mejor de 3, con plazo hasta el último día del cruce).

const RONDAS = 3;
/** Juegos que sirven para un duelo 1v1 en diferido. */
const juegosDuelo = () => VERSUS.filter((t) => t.modo === '1v1' && t.base && !t.vivo && juegoPorId(t.base)?.listo).map((t) => t.base!);

interface Borrador { cruce: number; juegos: string[]; duelos: { a: string; b: string; juego: string; equipos: [number, number] }[] }

export function MesaLiga() {
  const [equipos, setEquipos] = useState<V.Equipo[]>([]), [personas, setPersonas] = useState<V.Persona[]>([]), [duelos, setDuelos] = useState<V.Enfrentamiento[]>([]);
  const [borrador, setBorrador] = useState<Borrador | null>(null), [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null), [creando, setCreando] = useState(false);
  const cargar = async () => {
    const [q, p, { lista }] = await Promise.all([V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos('1v1')]);
    setEquipos(q); setPersonas(p); setDuelos(lista.filter((d) => d.oficial));
  };
  useEffect(() => { cargar(); }, []);

  const calendario = calendarioDeEquipos(equipos);
  const nombreEquipo = (id: number) => equipos.find((q) => q.id === id)?.nombre ?? '¿?';
  const nombre = (id: string) => personas.find((p) => p.id === id)?.nombre ?? 'Participante';
  const delCruce = (n: number) => duelos.filter((d) => d.cruce === n);
  const hoy = fechaChile(Date.now());

  /** Quiénes juegan por un equipo: en orden al azar, pero si son 4, primero los que menos duelos de liga llevan (así rota quién descansa). */
  const alineacion = (miembros: string[]) => {
    const jugados = (id: string) => duelos.filter((d) => d.cruce && (d.a_perfil === id || d.b_perfil === id)).length;
    return V.mezclar(miembros).sort((x, y) => jugados(x) - jugados(y));
  };
  /** Borra los duelos de un cruce (o de todos): para rehacerlo si hubo un error o cambiaron los equipos. */
  const borrarCruces = async (n: number | null) => {
    let consulta = supabase.from('enfrentamientos').delete().eq('oficial', true);
    consulta = n === null ? consulta.not('cruce', 'is', null) : consulta.eq('cruce', n);
    const { error } = await consulta;
    setAviso(error ? { texto: error.message, ok: false } : { texto: n === null ? 'Se borraron todos los duelos de los cruces. Ya puedes crearlos de nuevo.' : `Se borraron los duelos del cruce ${n}. Puedes volver a prepararlo.`, ok: true });
    setBorrador(null);
    cargar();
  };
  /** Sortea juegos (sin repetir los ya usados en la misma jornada) y rivales dentro de cada par de equipos. */
  const preparar = (n: number, juegosFijos?: string[]) => {
    const jornada = jornadaDe(CRUCES[n - 1].desde);
    const usados = new Set(duelos.filter((d) => d.cruce && jornadaDe(CRUCES[d.cruce - 1]?.desde ?? '') === jornada).map((d) => d.juego));
    const disponibles = juegosDuelo().filter((j) => !usados.has(j));
    const juegos = juegosFijos ?? V.mezclar(disponibles.length >= 3 ? disponibles : juegosDuelo()).slice(0, 3);
    const lista: Borrador['duelos'] = [];
    for (const [ea, eb] of calendario[n - 1]?.parejas ?? []) {
      const qa = alineacion(equipos.find((q) => q.id === ea)?.miembros ?? []), qb = alineacion(equipos.find((q) => q.id === eb)?.miembros ?? []);
      for (let i = 0; i < Math.min(qa.length, qb.length, 3); i++) lista.push({ a: qa[i], b: qb[i], juego: juegos[i % juegos.length], equipos: [ea, eb] });
    }
    setBorrador({ cruce: n, juegos, duelos: lista });
    setAviso(null);
  };
  /** Duelos que le faltan a un cruce ya creado (alguien se vinculó tarde): se agregan sin tocar los que existen. */
  const faltantes = (n: number): Borrador['duelos'] => {
    const hechos = delCruce(n), juegos = [...new Set(hechos.map((d) => d.juego))], lista: Borrador['duelos'] = [];
    const ocupados = new Set(hechos.flatMap((d) => [d.a_perfil, d.b_perfil]));
    for (const [ea, eb] of calendario[n - 1]?.parejas ?? []) {
      const ma = equipos.find((q) => q.id === ea)?.miembros ?? [], mb = equipos.find((q) => q.id === eb)?.miembros ?? [];
      const dePareja = hechos.filter((d) => (ma.includes(d.a_perfil!) && mb.includes(d.b_perfil!)) || (mb.includes(d.a_perfil!) && ma.includes(d.b_perfil!)));
      const qa = alineacion(ma.filter((id) => !ocupados.has(id))), qb = alineacion(mb.filter((id) => !ocupados.has(id)));
      const libres = juegos.filter((j) => !dePareja.some((d) => d.juego === j));
      for (let i = 0; i < Math.min(qa.length, qb.length, 3 - dePareja.length); i++) lista.push({ a: qa[i], b: qb[i], juego: libres[i] ?? juegos[i % juegos.length], equipos: [ea, eb] });
    }
    return lista;
  };
  const completar = (n: number) => {
    const lista = faltantes(n);
    if (!lista.length) return setAviso({ texto: `Al cruce ${n} no le falta ningún duelo (o sus rivales siguen sin cuenta).`, ok: true });
    setBorrador({ cruce: n, juegos: [...new Set(delCruce(n).map((d) => d.juego))], duelos: lista });
    setAviso(null);
  };
  const crear = async () => {
    if (!borrador) return;
    setCreando(true);
    const c = CRUCES[borrador.cruce - 1];
    const error = await V.crearEnfrentamientos(borrador.duelos.map((d) => ({ modo: '1v1', juego: d.juego, rondas: RONDAS, jornada: jornadaDe(c.desde), plazo: c.hasta, oficial: true, a_perfil: d.a, b_perfil: d.b, a_equipo: null, b_equipo: null, cruce: borrador.cruce })));
    setCreando(false);
    if (error) return setAviso({ texto: error.includes('cruce') ? 'Falta ejecutar supabase/etapa-3.sql en Supabase (la columna "cruce" todavía no existe).' : error, ok: false });
    setAviso({ texto: `Cruce ${borrador.cruce} creado: ${borrador.duelos.length} duelos oficiales. ¡A anunciarlo en Discord!`, ok: true });
    setBorrador(null);
    cargar();
  };

  if (!equipos.length) return <p class="aviso atencion">Primero arma los equipos (pestaña Sorteo de equipos).</p>;
  return (
    <div class="liga-mesa">
      <p>Todos contra todos: {equipos.length} equipos en {calendario.length} cruces. En cada cruce se juegan {calendario[0]?.parejas.length ?? 0} enfrentamientos de equipo contra equipo (3 duelos 1v1 al mejor de {RONDAS}){calendario[0]?.descansa != null ? ' y descansa un equipo' : ''}. Los duelos se crean como oficiales, con plazo hasta el último día del cruce.</p>
      {calendario.length !== CRUCES.length && <p class="aviso atencion">Con {equipos.length} equipos salen {calendario.length} cruces, pero el calendario tiene {CRUCES.length} fechas. Lo ideal son 11 o 12 equipos.</p>}
      {aviso && <p class={`aviso ${aviso.ok ? 'ok' : 'error'}`}>{aviso.texto}</p>}
      {borrador && (
        <section class="bloque liga-borrador">
          <h2>Cruce {borrador.cruce} · {delCruce(borrador.cruce).length ? 'duelos que faltan' : 'vista previa'}</h2>
          <p>Juegos: {borrador.juegos.map((j, i) => <b key={j}>{i ? ' · ' : ''}Duelo {i + 1}: {nombreVersus('1v1', j)}</b>)}</p>
          {(() => {
            // Quienes siguen sin cuenta no pueden tener duelos: su duelo falta hasta que se vinculen
            const ids = new Set((calendario[borrador.cruce - 1]?.parejas ?? []).flat()), faltan = equipos.filter((q) => ids.has(q.id)).flatMap((q) => (q.pendientes ?? []).map((x) => `${x.nombre} (${q.nombre})`));
            return faltan.length ? <p class="aviso atencion">Sin cuenta todavía: {faltan.join(', ')}. Sus duelos no se crean; vincúlalos en la pestaña Equipos y vuelve a preparar el cruce si quieres incluirlos.</p> : null;
          })()}
          <div class="tabla-caja"><table class="tabla">
            <thead><tr><th>Enfrentamiento</th><th>Duelo</th><th>Juego</th></tr></thead>
            <tbody>{borrador.duelos.map((d, i) => <tr key={i}><td class="tenue chico">{nombreEquipo(d.equipos[0])} vs {nombreEquipo(d.equipos[1])}</td><td><b>{nombre(d.a)}</b> vs <b>{nombre(d.b)}</b></td><td>{nombreVersus('1v1', d.juego)}</td></tr>)}</tbody>
          </table></div>
          <div class="fila">
            {!delCruce(borrador.cruce).length && <><button class="boton" onClick={() => preparar(borrador.cruce)}>🎡 Sortear otros juegos</button>
            <button class="boton" onClick={() => preparar(borrador.cruce, borrador.juegos)}>🔀 Sortear otros rivales</button></>}
            <button class="boton principal" disabled={creando} onClick={crear}>{creando ? 'Creando…' : `Crear los ${borrador.duelos.length} duelos`}</button>
            <button class="boton" onClick={() => setBorrador(null)}>Cancelar</button>
          </div>
        </section>
      )}
      {duelos.some((d) => d.cruce) && <div class="fila"><BotonDoble texto="Borrar todos los cruces creados" alConfirmar={() => borrarCruces(null)} /><span class="chico tenue">Borra los duelos de los cruces (también los ya jugados, y sus puntos). Úsalo si cambian los equipos.</span></div>}
      <ol class="liga-cruces">
        {calendario.map((r, i) => {
          const c = CRUCES[i], hechos = delCruce(i + 1), cerrados = hechos.filter((d) => d.estado === 'cerrado').length, ahora = c && hoy >= c.desde && hoy <= c.hasta;
          return (
            <li key={i} class={`${ahora ? 'ahora' : ''}${hechos.length ? ' creado' : ''}`}>
              <div class="liga-cruce-cabeza"><b>Cruce {i + 1}</b><span class="tenue chico">{c ? `${V.fechaCorta(c.desde)} al ${V.fechaCorta(c.hasta)} · jornada ${jornadaDe(c.desde)}` : 'sin fecha'}{ahora ? ' · EN CURSO' : ''}</span></div>
              <ul>{r.parejas.map(([a, b]) => <li key={`${a}-${b}`}>{nombreEquipo(a)} <span class="tenue">vs</span> {nombreEquipo(b)}</li>)}</ul>
              {r.descansa != null && <span class="chico tenue">Descansa: {nombreEquipo(r.descansa)}</span>}
              {hechos.length
                ? <span class="chico">{cerrados} de {hechos.length} duelos cerrados · {[...new Set(hechos.map((d) => nombreVersus('1v1', d.juego)))].join(', ')}</span>
                : <button class="boton" onClick={() => preparar(i + 1)}>Preparar cruce {i + 1}</button>}
              {hechos.length > 0 && <button class="boton" onClick={() => completar(i + 1)}>➕ Agregar duelos que faltan</button>}
              {hechos.length > 0 && <BotonDoble texto={`Borrar el cruce ${i + 1}`} alConfirmar={() => borrarCruces(i + 1)} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Botón que pide un segundo toque antes de hacer algo que no se puede deshacer. */
function BotonDoble({ texto, alConfirmar }: { texto: string; alConfirmar(): void }) {
  const [armado, setArmado] = useState(false);
  return <button class={`boton${armado ? ' peligro' : ''}`} onBlur={() => setArmado(false)} onClick={() => { if (armado) { setArmado(false); alConfirmar(); } else setArmado(true); }}>{armado ? `¿Seguro? ${texto}` : texto}</button>;
}
