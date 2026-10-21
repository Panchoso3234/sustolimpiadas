import { useEffect, useState } from 'preact/hooks';
import { fechaChile } from '../nucleo/azar';
import { VERSUS, juegoPorId, nombreVersus } from './catalogo';
import * as V from './duelos';
import { CRUCES, calendarioLiga, jornadaDe } from './liga';

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

  const ordenados = [...equipos].sort((a, b) => a.id - b.id), calendario = calendarioLiga(ordenados.map((q) => q.id));
  const nombreEquipo = (id: number) => equipos.find((q) => q.id === id)?.nombre ?? '¿?';
  const nombre = (id: string) => personas.find((p) => p.id === id)?.nombre ?? 'Participante';
  const delCruce = (n: number) => duelos.filter((d) => d.cruce === n);
  const hoy = fechaChile(Date.now());

  /** Sortea juegos (sin repetir los ya usados en la misma jornada) y rivales dentro de cada par de equipos. */
  const preparar = (n: number, juegosFijos?: string[]) => {
    const jornada = jornadaDe(CRUCES[n - 1].desde);
    const usados = new Set(duelos.filter((d) => d.cruce && jornadaDe(CRUCES[d.cruce - 1]?.desde ?? '') === jornada).map((d) => d.juego));
    const disponibles = juegosDuelo().filter((j) => !usados.has(j));
    const juegos = juegosFijos ?? V.mezclar(disponibles.length >= 3 ? disponibles : juegosDuelo()).slice(0, 3);
    const lista: Borrador['duelos'] = [];
    for (const [ea, eb] of calendario[n - 1]?.parejas ?? []) {
      const qa = V.mezclar(equipos.find((q) => q.id === ea)?.miembros ?? []), qb = V.mezclar(equipos.find((q) => q.id === eb)?.miembros ?? []);
      for (let i = 0; i < Math.min(qa.length, qb.length, 3); i++) lista.push({ a: qa[i], b: qb[i], juego: juegos[i % juegos.length], equipos: [ea, eb] });
    }
    setBorrador({ cruce: n, juegos, duelos: lista });
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
      {calendario.length !== CRUCES.length && <p class="aviso atencion">Con {equipos.length} equipos salen {calendario.length} cruces, pero el calendario tiene {CRUCES.length} fechas. Lo ideal son 11 equipos (33 personas).</p>}
      {aviso && <p class={`aviso ${aviso.ok ? 'ok' : 'error'}`}>{aviso.texto}</p>}
      {borrador && (
        <section class="bloque liga-borrador">
          <h2>Cruce {borrador.cruce} · vista previa</h2>
          <p>Juegos: {borrador.juegos.map((j, i) => <b key={j}>{i ? ' · ' : ''}Duelo {i + 1}: {nombreVersus('1v1', j)}</b>)}</p>
          <div class="tabla-caja"><table class="tabla">
            <thead><tr><th>Enfrentamiento</th><th>Duelo</th><th>Juego</th></tr></thead>
            <tbody>{borrador.duelos.map((d, i) => <tr key={i}><td class="tenue chico">{nombreEquipo(d.equipos[0])} vs {nombreEquipo(d.equipos[1])}</td><td><b>{nombre(d.a)}</b> vs <b>{nombre(d.b)}</b></td><td>{nombreVersus('1v1', d.juego)}</td></tr>)}</tbody>
          </table></div>
          <div class="fila">
            <button class="boton" onClick={() => preparar(borrador.cruce)}>🎡 Sortear otros juegos</button>
            <button class="boton" onClick={() => preparar(borrador.cruce, borrador.juegos)}>🔀 Sortear otros rivales</button>
            <button class="boton principal" disabled={creando} onClick={crear}>{creando ? 'Creando…' : `Crear los ${borrador.duelos.length} duelos`}</button>
            <button class="boton" onClick={() => setBorrador(null)}>Cancelar</button>
          </div>
        </section>
      )}
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
            </li>
          );
        })}
      </ol>
    </div>
  );
}
