import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../nucleo/supabase';
import { fechaChile } from '../nucleo/azar';
import { JUEGOS, TOPES, VERSUS, juegoPorId, nombreVersus } from './catalogo';
import { borrarMarca, marcasDelDia, type MarcaSuelta } from './marcas';
import { PUNTOS_BASE, guardarPuntos, leerPuntos, type Puntos } from './puntos';
import * as V from './duelos';

// Mesa de control del organizador: equipos, enfrentamientos oficiales y puntos del torneo.

type Aviso = { texto: string; ok: boolean } | null;
const Mensaje = ({ aviso }: { aviso: Aviso }) => (aviso ? <p class={`aviso ${aviso.ok ? 'ok' : 'error'}`}>{aviso.texto}</p> : null);
const NO_ACTIVADO = 'Esta sección todavía no está activada: falta ejecutar en Supabase el último bloque de supabase/esquema.sql.';

/** Botón que pide un segundo toque para confirmar algo que no se puede deshacer. */
function Confirmar({ texto, alConfirmar, clase = 'boton' }: { texto: string; alConfirmar(): void; clase?: string }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => { if (!armado) return; const t = setTimeout(() => setArmado(false), 4000); return () => clearTimeout(t); }, [armado]);
  return <button class={clase} onClick={() => { if (armado) { setArmado(false); alConfirmar(); } else setArmado(true); }}>{armado ? '¿Seguro? Toca de nuevo' : texto}</button>;
}

// ───────── Equipos ─────────
export function Equipos() {
  const [personas, setPersonas] = useState<V.Persona[]>([]);
  const [equipos, setEquipos] = useState<V.Equipo[]>([]);
  const [activado, setActivado] = useState(true);
  const [aviso, setAviso] = useState<Aviso>(null);

  const cargar = async () => {
    const { error } = await supabase.from('equipos').select('id').limit(1);
    setActivado(!error);
    const [p, q] = await Promise.all([V.listarPersonas(), V.listarEquipos()]);
    setPersonas(p);
    setEquipos(q);
  };
  useEffect(() => { cargar(); }, []);

  const hecho = (error: { message: string } | null, bien: string) => { setAviso(error ? { texto: error.message, ok: false } : { texto: bien, ok: true }); cargar(); };
  const nombreDe = (id: string) => personas.find((p) => p.id === id)?.nombre ?? 'Participante';
  const conEquipo = new Set(equipos.flatMap((q) => q.miembros)), sueltos = personas.filter((p) => !conEquipo.has(p.id));

  // Sorteo: el staff se reparte primero, uno por equipo mientras alcance, para que ningún equipo quede lleno de staff
  const sortear = async () => {
    const cantidad = Math.floor(personas.length / 3);
    if (cantidad < 2) return setAviso({ texto: 'Se necesitan al menos 6 personas inscritas para sortear equipos.', ok: false });
    const orden = [...V.mezclar(personas.filter((p) => p.rol !== 'jugador')), ...V.mezclar(personas.filter((p) => p.rol === 'jugador'))].slice(0, cantidad * 3);
    const { data, error } = await supabase.from('equipos').insert(Array.from({ length: cantidad }, (_, i) => ({ nombre: `Equipo ${i + 1}` }))).select('id');
    if (error || !data) return hecho(error, '');
    const ids = (data as { id: number }[]).map((f) => f.id);
    const r = await supabase.from('equipo_miembros').insert(orden.map((p, i) => ({ perfil_id: p.id, equipo_id: ids[i % cantidad] })));
    hecho(r.error, `Sorteo hecho: ${cantidad} equipos de 3.${personas.length % 3 ? ` Quedaron ${personas.length % 3} personas sin equipo; ubícalas a mano.` : ''}`);
  };

  const borrarTodo = async () => hecho((await supabase.from('equipos').delete().gt('id', 0)).error, 'Equipos borrados.');
  const crear = async () => hecho((await supabase.from('equipos').insert({ nombre: `Equipo ${equipos.length + 1}` })).error, 'Equipo creado.');
  const renombrar = async (id: number, nombre: string) => { if (nombre.trim()) hecho((await supabase.from('equipos').update({ nombre: nombre.trim().slice(0, 30) }).eq('id', id)).error, 'Nombre guardado.'); };
  const borrar = async (id: number) => hecho((await supabase.from('equipos').delete().eq('id', id)).error, 'Equipo borrado.');
  const mover = async (perfil: string, destino: string) => {
    if (destino === '') return hecho((await supabase.from('equipo_miembros').delete().eq('perfil_id', perfil)).error, 'Persona sacada del equipo.');
    hecho((await supabase.from('equipo_miembros').upsert({ perfil_id: perfil, equipo_id: Number(destino) })).error, 'Persona movida.');
  };

  // Pendientes (sorteados sin cuenta): se vinculan con su cuenta cuando entran con Discord
  const vincular = async (pendiente: number, perfil: string) => {
    if (!perfil) return;
    const { data, error } = await supabase.rpc('vincular_pendiente', { p_pendiente: pendiente, p_perfil: perfil });
    hecho(error ?? (data ? { message: String(data) } : null), 'Cuenta vinculada: ya es integrante del equipo.');
  };
  const ponerCapitan = async (equipo: number, perfil: string) => hecho((await supabase.from('equipos').update({ capitan: perfil || null }).eq('id', equipo)).error, perfil ? 'Capitán guardado.' : 'El equipo quedó sin capitán.');
  const quitarPendiente = async (id: number) => hecho((await supabase.from('equipo_pendientes').delete().eq('id', id)).error, 'Pendiente quitado.');
  const sinCuenta = equipos.flatMap((q) => q.pendientes ?? []).length;

  if (!activado) return <p class="aviso atencion">{NO_ACTIVADO}</p>;
  return (
    <>
      {sinCuenta > 0 && <p class="aviso atencion">{sinCuenta} {sinCuenta === 1 ? 'persona sorteada todavía no tiene' : 'personas sorteadas todavía no tienen'} cuenta. Cuando entren con Discord, elige su cuenta en "Vincular con…" dentro de su equipo. Mientras tanto no se les pueden crear duelos.</p>}
      <p>Equipos de 3 al azar. El staff se reparte primero para que quede distribuido. Después del sorteo puedes mover gente, cambiar nombres o armar reemplazos.</p>
      <Mensaje aviso={aviso} />
      <div class="fila">
        {equipos.length === 0
          ? <button class="boton principal" onClick={sortear}>Sortear equipos de 3 ({personas.length} inscritos)</button>
          : <Confirmar texto="Borrar todos los equipos" alConfirmar={borrarTodo} />}
        <button class="boton" onClick={crear}>Crear equipo vacío</button>
      </div>
      {equipos.length > 0 && <p class="tenue chico">Borrar un equipo borra también sus enfrentamientos 3v3.</p>}
      <div class="rejilla-equipos">
        {equipos.map((q) => (
          <div key={q.id} class="equipo">
            <input class="texto" aria-label="Nombre del equipo" defaultValue={q.nombre} onBlur={(e) => { if (e.currentTarget.value !== q.nombre) renombrar(q.id, e.currentTarget.value); }} />
            <ul>
              {q.miembros.map((id) => {
                const p = personas.find((x) => x.id === id);
                return (
                  <li key={id}>
                    <span>{nombreDe(id)}{p && p.rol !== 'jugador' ? <em> staff</em> : null}</span>
                    <select aria-label={`Mover a ${nombreDe(id)}`} value={q.id} onChange={(e) => mover(id, e.currentTarget.value)}>
                      {equipos.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                      <option value="">Sin equipo</option>
                    </select>
                  </li>
                );
              })}
              {(q.pendientes ?? []).map((x) => (
                <li key={`p${x.id}`} class="pendiente">
                  <span>{x.es_capitan ? '⭐ ' : ''}{x.nombre}<em class="sin-cuenta"> sin cuenta</em></span>
                  <select aria-label={`Vincular a ${x.nombre} con su cuenta`} value="" onChange={(e) => vincular(x.id, e.currentTarget.value)}>
                    <option value="">Vincular con…</option>
                    {sueltos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  <Confirmar texto="Quitar" alConfirmar={() => quitarPendiente(x.id)} />
                </li>
              ))}
              {q.miembros.length === 0 && !(q.pendientes ?? []).length && <li class="tenue">Sin integrantes</li>}
            </ul>
            <label class="chico">⭐ Capitán (staff: no pasa a la final)
              <select value={q.capitan ?? ''} onChange={(e) => ponerCapitan(q.id, e.currentTarget.value)}>
                <option value="">Sin capitán (pueden pasar todos)</option>
                {q.miembros.map((id) => <option key={id} value={id}>{nombreDe(id)}</option>)}
              </select>
            </label>
            <span class={`chico ${q.miembros.length + (q.pendientes?.length ?? 0) >= 3 ? 'tenue' : 'alerta'}`}>{q.miembros.length + (q.pendientes?.length ?? 0)} de 3{q.pendientes?.length ? ` (${q.pendientes.length} sin cuenta)` : ''}</span>
            <Confirmar texto="Borrar equipo" alConfirmar={() => borrar(q.id)} />
          </div>
        ))}
      </div>
      {sueltos.length > 0 && equipos.length > 0 && (
        <>
          <h2>Sin equipo</h2>
          <ul class="duelos">
            {sueltos.map((p) => (
              <li key={p.id}>
                <span class="quienes"><b>{p.nombre}</b></span>
                <select aria-label={`Equipo para ${p.nombre}`} value="" onChange={(e) => mover(p.id, e.currentTarget.value)}>
                  <option value="">Asignar a…</option>
                  {equipos.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// ───────── Enfrentamientos ─────────
export function Enfrentamientos() {
  const [personas, setPersonas] = useState<V.Persona[]>([]);
  const [equipos, setEquipos] = useState<V.Equipo[]>([]);
  const [lista, setLista] = useState<V.Enfrentamiento[]>([]);
  const [marcas, setMarcas] = useState<V.MarcaVersus[]>([]);
  const [activado, setActivado] = useState(true);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [modo, setModo] = useState<'1v1' | '3v3'>('1v1');
  const [juego, setJuego] = useState('');
  const [rondas, setRondas] = useState(1);
  const [jornada, setJornada] = useState(1);
  const [plazo, setPlazo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [ver, setVer] = useState<'pendiente' | 'cerrado' | 'anulado'>('pendiente');

  const cargar = async () => {
    const [p, q, r] = await Promise.all([V.listarPersonas(), V.listarEquipos(), V.listarEnfrentamientos()]);
    setPersonas(p); setEquipos(q); setLista(r.lista); setActivado(r.disponible);
    setMarcas(await V.marcasDe(r.lista.map((e) => e.id)));
  };
  useEffect(() => { cargar(); }, []);

  const tipos = VERSUS.filter((t) => t.modo === modo && t.base && (t.vivo || juegoPorId(t.base)?.listo));
  useEffect(() => { setJuego(tipos[0]?.base ?? ''); setA(''); setB(''); }, [modo]);

  const lados = modo === '1v1' ? personas.map((p) => ({ id: p.id, nombre: p.nombre })) : equipos.map((q) => ({ id: String(q.id), nombre: `${q.nombre} (${q.miembros.length})` }));
  const visibles = lados.filter((l) => l.nombre.toLowerCase().includes(buscar.trim().toLowerCase()));
  const fila = (x: string, y: string): V.NuevoEnfrentamiento => ({
    modo, juego, rondas: modo === '1v1' ? rondas : 1, jornada, plazo: plazo || null, oficial: true,
    a_perfil: modo === '1v1' ? x : null, b_perfil: modo === '1v1' ? y : null, a_equipo: modo === '3v3' ? Number(x) : null, b_equipo: modo === '3v3' ? Number(y) : null,
  });
  const crear = async (parejas: [string, string][], bien: string) => {
    if (!juego) return setAviso({ texto: 'Elige el juego.', ok: false });
    const error = await V.crearEnfrentamientos(parejas.map(([x, y]) => fila(x, y)));
    setAviso(error ? { texto: error, ok: false } : { texto: bien, ok: true });
    cargar();
  };
  const uno = () => (a && b && a !== b ? crear([[a, b]], 'Enfrentamiento creado.') : setAviso({ texto: 'Elige dos lados distintos.', ok: false }));
  const ids = lados.map((l) => l.id), total = (ids.length * (ids.length - 1)) / 2;

  const actualizar = async (id: number, cambios: Partial<V.Enfrentamiento>, bien: string) => {
    const { error } = await supabase.from('enfrentamientos').update(cambios).eq('id', id);
    setAviso(error ? { texto: error.message, ok: false } : { texto: bien, ok: true });
    cargar();
  };
  const llamar = async (funcion: string, id: number, bien: string) => {
    const { error } = await supabase.rpc(funcion, { p_enf: id });
    setAviso(error ? { texto: error.message, ok: false } : { texto: bien, ok: true });
    cargar();
  };
  const borrar = async (id: number) => {
    const { error } = await supabase.from('enfrentamientos').delete().eq('id', id);
    setAviso(error ? { texto: error.message, ok: false } : { texto: 'Enfrentamiento borrado.', ok: true });
    cargar();
  };

  if (!activado) return <p class="aviso atencion">{NO_ACTIVADO}</p>;
  const mostrados = lista.filter((e) => e.estado === ver);
  return (
    <>
      <p>Los enfrentamientos oficiales dan puntos del torneo. Cada lado juega a su hora, con un solo intento; el resultado se calcula solo cuando ambos jugaron. Los amistosos que crean los jugadores también aparecen aquí.</p>
      <Mensaje aviso={aviso} />
      <div class="formulario">
        <label>Modo
          <select class="texto" value={modo} onChange={(e) => setModo(e.currentTarget.value as '1v1' | '3v3')}><option value="1v1">Versus 1v1</option><option value="3v3">Versus 3v3</option></select>
        </label>
        <label>Juego
          <select class="texto" value={juego} onChange={(e) => setJuego(e.currentTarget.value)}>{tipos.map((t) => <option key={t.id} value={t.base}>{t.nombre}</option>)}</select>
        </label>
        {modo === '1v1' && (
          <label>Formato
            <select class="texto" value={rondas} onChange={(e) => setRondas(Number(e.currentTarget.value))}><option value={1}>A una ronda</option><option value={3}>Mejor de 3</option><option value={5}>Mejor de 5</option></select>
          </label>
        )}
        <label>Jornada
          <select class="texto" value={jornada} onChange={(e) => setJornada(Number(e.currentTarget.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>Jornada {n}</option>)}</select>
        </label>
        <label>Plazo<input class="texto" type="date" value={plazo} onInput={(e) => setPlazo(e.currentTarget.value)} /></label>
      </div>
      <div class="formulario">
        <label>Buscar<input class="texto" value={buscar} onInput={(e) => setBuscar(e.currentTarget.value)} placeholder={modo === '1v1' ? 'Nombre de la persona' : 'Nombre del equipo'} /></label>
        <label>Lado A
          <select class="texto" value={a} onChange={(e) => setA(e.currentTarget.value)}><option value="">Elige…</option>{visibles.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select>
        </label>
        <label>Lado B
          <select class="texto" value={b} onChange={(e) => setB(e.currentTarget.value)}><option value="">Elige…</option>{visibles.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select>
        </label>
        <button class="boton principal" onClick={uno}>Crear enfrentamiento</button>
      </div>
      <div class="fila">
        <Confirmar texto={`Sortear rivales (${Math.floor(ids.length / 2)} enfrentamientos)`} alConfirmar={() => crear(V.sortearParejas(ids), 'Rivales sorteados.')} />
        <Confirmar texto={`Todos contra todos (${total} enfrentamientos)`} alConfirmar={() => crear(V.todosContraTodos(ids), 'Calendario completo creado.')} />
      </div>
      <p class="tenue chico">Los dos botones usan el modo, juego, formato, jornada y plazo elegidos arriba, y consideran a {modo === '1v1' ? 'todas las personas inscritas' : 'todos los equipos'}.</p>

      <div class="modos">
        {(['pendiente', 'cerrado', 'anulado'] as const).map((x) => <button key={x} class={ver === x ? 'activa' : ''} onClick={() => setVer(x)}>{x === 'pendiente' ? 'Pendientes' : x === 'cerrado' ? 'Cerrados' : 'Anulados'} ({lista.filter((e) => e.estado === x).length})</button>)}
      </div>
      <div class="tabla-caja">
        <table class="tabla">
          <thead><tr><th>Enfrentamiento</th><th>Lados</th><th>Jornada</th><th>Avance</th><th>Resultado</th><th>Acciones</th></tr></thead>
          <tbody>
            {mostrados.map((e) => {
              const na = V.nombreLado(e, 'a', personas, equipos), nb = V.nombreLado(e, 'b', personas, equipos);
              const hechas = (lado: V.Lado) => marcas.filter((m) => m.enfrentamiento_id === e.id && m.lado === lado && m.terminado).length;
              const esperadas = (lado: V.Lado) => (e.modo === '1v1' ? e.rondas : Math.min(3, equipos.find((q) => q.id === (lado === 'a' ? e.a_equipo : e.b_equipo))?.miembros.length ?? 0));
              return (
                <tr key={e.id}>
                  <td><b>{nombreVersus(e.modo, e.juego)}</b><br /><span class="tenue chico">{e.modo}{e.modo === '1v1' && e.rondas > 1 ? ` · mejor de ${e.rondas}` : ''} · {e.oficial ? 'oficial' : 'amistoso'}</span></td>
                  <td>{na} <span class="tenue">vs</span> {nb}</td>
                  <td>{e.jornada}<br /><span class="tenue chico">{V.fechaCorta(e.plazo)}</span></td>
                  <td>{hechas('a')}/{esperadas('a')} · {hechas('b')}/{esperadas('b')}{(() => { const n = marcas.filter((m) => m.enfrentamiento_id === e.id && V.cortada(m)).length; return n ? <><br /><span class="alerta chico">{n} {n === 1 ? 'partida cortada' : 'partidas cortadas'}</span></> : null; })()}</td>
                  <td>{e.estado === 'cerrado' ? <>{e.puntos_a} a {e.puntos_b}<br /><span class="tenue chico">{e.ganador === 'empate' ? 'Empate' : `Gana ${e.ganador === 'a' ? na : nb}`}</span></> : e.estado === 'anulado' ? 'Anulado' : '—'}</td>
                  <td>
                    <div class="acciones">
                      {e.estado === 'pendiente' && <Confirmar texto="Cerrar ahora" alConfirmar={() => llamar('cerrar_enfrentamiento', e.id, 'Cerrado con lo jugado hasta ahora.')} />}
                      {e.estado !== 'anulado' && <Confirmar texto="Anular" alConfirmar={() => actualizar(e.id, { estado: 'anulado', ganador: null }, 'Enfrentamiento anulado.')} />}
                      <Confirmar texto="Repetir" alConfirmar={() => llamar('repetir_enfrentamiento', e.id, 'Se borraron las marcas: se juega de nuevo, con un desafío distinto.')} />
                      <select aria-label="Dar el triunfo" value="" onChange={(ev) => { const g = ev.currentTarget.value as V.Lado | 'empate' | ''; if (g) actualizar(e.id, { estado: 'cerrado', ganador: g }, 'Resultado corregido.'); }}>
                        <option value="">Dar el triunfo a…</option><option value="a">{na}</option><option value="b">{nb}</option><option value="empate">Empate</option>
                      </select>
                      <Confirmar texto="Borrar" alConfirmar={() => borrar(e.id)} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {mostrados.length === 0 && <tr><td colSpan={6} class="tenue">No hay enfrentamientos aquí.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ───────── Marcas ─────────
/** Todas las partidas de un día, de mayor a menor. Las que superan el tope de su juego salen marcadas para revisar. */
export function Marcas() {
  const [fecha, setFecha] = useState(() => fechaChile(Date.now()));
  const [juego, setJuego] = useState('');
  const [lista, setLista] = useState<MarcaSuelta[] | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const cargar = () => { setLista(null); marcasDelDia(fecha, juego).then(setLista); };
  useEffect(cargar, [fecha, juego]);
  const borrar = async (id: number) => {
    const error = await borrarMarca(id);
    setAviso(error ? { texto: error, ok: false } : { texto: 'Marca borrada.', ok: true });
    cargar();
  };
  const dudosas = (lista ?? []).filter((m) => m.puntaje > (TOPES[m.juego] ?? Infinity)).length;
  return (
    <>
      <p>Los puntajes se calculan en el navegador de cada jugador, así que una marca imposible es señal de trampa o de un error del juego. Aquí ves todas las partidas del día; las que pasan el máximo razonable de su juego salen marcadas.</p>
      <Mensaje aviso={aviso} />
      <div class="formulario">
        <label>Día<input class="texto" type="date" value={fecha} onInput={(e) => { if (e.currentTarget.value) setFecha(e.currentTarget.value); }} /></label>
        <label>Juego
          <select class="texto" value={juego} onChange={(e) => setJuego(e.currentTarget.value)}>
            <option value="">Todos</option>
            {JUEGOS.filter((j) => j.listo).map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
          </select>
        </label>
      </div>
      {lista && <p class={dudosas ? 'alerta' : 'tenue chico'}>{dudosas ? `${dudosas} ${dudosas === 1 ? 'marca dudosa' : 'marcas dudosas'} este día.` : `${lista.length} partidas, ninguna dudosa.`}</p>}
      <div class="tabla-caja">
        <table class="tabla">
          <thead><tr><th>Quién</th><th>Juego</th><th>Puntaje</th><th>Resumen de la partida</th><th></th></tr></thead>
          <tbody>
            {(lista ?? []).map((m) => {
              const dudosa = m.puntaje > (TOPES[m.juego] ?? Infinity);
              return (
                <tr key={m.id} class={dudosa ? 'dudosa' : ''}>
                  <td>{m.nombre}</td>
                  <td>{juegoPorId(m.juego)?.nombre ?? m.juego}</td>
                  <td><b>{m.puntaje}</b>{dudosa && <span class="alerta"> · sobre {TOPES[m.juego]}</span>}</td>
                  <td class="tenue chico">{JSON.stringify(m.detalle).slice(0, 110)}</td>
                  <td><Confirmar texto="Borrar" alConfirmar={() => borrar(m.id)} /></td>
                </tr>
              );
            })}
            {lista && lista.length === 0 && <tr><td colSpan={5} class="tenue">Nadie jugó ese día.</td></tr>}
            {!lista && <tr><td colSpan={5} class="tenue">Cargando…</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ───────── Puntos ─────────
export function AjustePuntos() {
  const [p, setP] = useState<Puntos>(PUNTOS_BASE);
  const [aviso, setAviso] = useState<Aviso>(null);
  useEffect(() => { leerPuntos().then(setP); }, []);
  const campo = (etiqueta: string, valor: number, poner: (n: number) => Puntos, paso = 1) => (
    <label>{etiqueta}<input class="texto" type="number" min={0} step={paso} value={valor} onInput={(e) => { const n = Number(e.currentTarget.value); if (Number.isFinite(n) && n >= 0) setP(poner(n)); }} /></label>
  );
  const guardar = async () => { const error = await guardarPuntos(p); setAviso(error ? { texto: `No se pudo guardar: ${error}`, ok: false } : { texto: 'Puntos guardados.', ok: true }); };
  return (
    <>
      <p>Cuántos puntos del torneo vale cada resultado de un duelo oficial (no jugar siempre da 0, y el bono por ganar un enfrentamiento de cruce es +5; ambos se multiplican por la jornada). Desde el 21 de octubre la tabla oficial solo suma duelos: los valores del modo individual quedan sin uso.</p>
      <Mensaje aviso={aviso} />
      <h2>Versus (1v1 y 3v3)</h2>
      <div class="formulario">
        {campo('Ganar', p.victoria, (n) => ({ ...p, victoria: n }))}
        {campo('Empatar', p.empate, (n) => ({ ...p, empate: n }))}
        {campo('Perder', p.derrota, (n) => ({ ...p, derrota: n }))}
      </div>
      <h2>Individual</h2>
      <div class="formulario">
        {campo('Primer puesto', p.individualMax, (n) => ({ ...p, individualMax: n }))}
        {campo('Último puesto', p.individualMin, (n) => ({ ...p, individualMin: n }))}
      </div>
      <h2>Multiplicador por jornada</h2>
      <div class="formulario">
        {p.multiplicadores.map((m, i) => campo(`Jornada ${i + 1}`, m, (n) => ({ ...p, multiplicadores: p.multiplicadores.map((x, k) => (k === i ? n : x)) }), 0.05))}
      </div>
      <div class="fila">
        <button class="boton principal" onClick={guardar}>Guardar puntos</button>
        <button class="boton" onClick={() => setP(PUNTOS_BASE)}>Volver a 10 / 6 / 3</button>
      </div>
    </>
  );
}
