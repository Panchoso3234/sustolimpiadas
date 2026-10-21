import { useEffect, useRef, useState } from 'preact/hooks';
import { supabase } from '../nucleo/supabase';
import * as V from './duelos';

// Sorteo de equipos con dos ruletas grandes, para hacerlo en vivo (compartiendo pantalla en Discord).
// Primero los capitanes (el staff): la ruleta de persona solo trae capitanes y la de equipo, equipos sin capitán.
// Después los participantes: la ruleta de equipo solo trae equipos con cupo (los de capitán tienen 2 cupos; los demás, 3).
// El avance queda guardado en el navegador (si se recarga, sigue donde iba) y al final se guarda en el torneo.

export const CAPITANES = ['Vale', 'Rigo', 'Pancho', 'Leona', 'Tsuki', 'Astrea', 'Baal', 'Never'];
/** Capitanes cuyo nombre de Discord no se parece al suyo. */
const ALIAS: Record<string, string[]> = { Never: ['ODIO A MOMOKA'] };
const COLORES = ['#ff9a2e', '#8a5ce6', '#2fae86', '#ef5565', '#3fa3dc', '#e85aa2', '#7ab33c', '#ffd23c', '#5a6acf', '#c94a6a', '#3fb8b0', '#d9653b'];
const MEMORIA = 'susto.sorteo';

interface EquipoSorteo { nombre: string; capitan: string | null; miembros: string[] }
/** `extras`: participantes agregados a mano que todavía no tienen cuenta (su id empieza con "pend-"). */
interface Estado { equipos: EquipoSorteo[]; capitanes: string[]; historial: { persona: string; equipo: number }[]; extras?: Extra[] }
interface Extra { id: string; nombre: string }
const esPendiente = (id: string) => id.startsWith('pend-');
const nuevoExtra = (nombre: string): Extra => ({ id: `pend-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nombre: nombre.trim().slice(0, 40) });
interface Item { id: string; texto: string; color: string }

/** Coincidencia flexible entre el nombre de Discord y el del capitán ("Pancho 🎃" sirve para "Pancho"). */
const limpio = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const parecido = (nombre: string, buscado: string) => [buscado, ...(ALIAS[buscado] ?? [])].some((b) => limpio(nombre).includes(limpio(b)));

// ───────── La ruleta ─────────
function Ruleta({ titulo, items, girar, alTerminar, elegido }: { titulo: string; items: Item[]; girar: number; alTerminar(i: number): void; elegido: string | null }) {
  const lienzo = useRef<HTMLCanvasElement>(null), angulo = useRef(0), sonido = useRef<AudioContext | null>(null);
  const dibujar = () => {
    const cv = lienzo.current;
    if (!cv) return;
    const g = cv.getContext('2d')!, T = cv.width, c = T / 2, r = c - 10, n = Math.max(1, items.length), paso = (Math.PI * 2) / n;
    g.clearRect(0, 0, T, T);
    g.save(); g.translate(c, c); g.rotate(angulo.current);
    if (!items.length) { g.fillStyle = '#233760'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); }
    items.forEach((it, i) => {
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, i * paso, (i + 1) * paso); g.closePath();
      g.fillStyle = it.color; g.fill();
      g.strokeStyle = '#14203a'; g.lineWidth = 3; g.stroke();
      g.save(); g.rotate((i + 0.5) * paso); g.textAlign = 'right'; g.textBaseline = 'middle';
      const tam = Math.max(14, Math.min(34, (r * paso) * 0.55));
      g.font = `800 ${tam}px Nunito, sans-serif`; g.fillStyle = '#14203a';
      let texto = it.texto;
      while (g.measureText(texto).width > r * 0.72 && texto.length > 3) texto = texto.slice(0, -2) + '…';
      g.fillText(texto, r - 18, 0);
      g.restore();
    });
    g.restore();
    // Centro y aguja (arriba)
    g.fillStyle = '#14203a'; g.beginPath(); g.arc(c, c, r * 0.13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(c, c, r * 0.07, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe08a'; g.strokeStyle = '#14203a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(c - 26, 4); g.lineTo(c + 26, 4); g.lineTo(c, 56); g.closePath(); g.fill(); g.stroke();
  };
  useEffect(dibujar, [items]);
  // Girar: cada vez que `girar` cambia, sortea un sector y anima hasta dejarlo bajo la aguja
  useEffect(() => {
    if (!girar || !items.length) return;
    const n = items.length, paso = (Math.PI * 2) / n, meta = Math.floor(Math.random() * n), azar = (Math.random() - 0.5) * paso * 0.7;
    const inicio = angulo.current, base = -Math.PI / 2 - (meta + 0.5) * paso + azar;
    let fin = base; while (fin < inicio + Math.PI * 2 * 6) fin += Math.PI * 2;
    const dura = 4800, t0 = performance.now();
    try { sonido.current ??= new AudioContext(); } catch { sonido.current = null; }
    let ultimo = Math.floor((inicio + Math.PI / 2) / paso), vivo = true;
    const cuadro = (ahora: number) => {
      if (!vivo) return;
      const k = Math.min(1, (ahora - t0) / dura), suave = 1 - Math.pow(1 - k, 4);
      angulo.current = inicio + (fin - inicio) * suave;
      const sector = Math.floor((angulo.current + Math.PI / 2) / paso);
      if (sector !== ultimo && sonido.current) {
        ultimo = sector;
        const ctx = sonido.current, o = ctx.createOscillator(), v = ctx.createGain();
        o.frequency.value = 900; v.gain.setValueAtTime(0.06, ctx.currentTime); v.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        o.connect(v).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.06);
      }
      dibujar();
      if (k < 1) requestAnimationFrame(cuadro); else alTerminar(meta);
    };
    requestAnimationFrame(cuadro);
    return () => { vivo = false; };
  }, [girar]);
  return (
    <div class="ruleta">
      <h3>{titulo}</h3>
      <canvas ref={lienzo} width={760} height={760} aria-label={`${titulo}: ${items.length} opciones`} />
      <p class={`ruleta-sale${elegido ? ' lleno' : ''}`} aria-live="polite">{elegido ?? '—'}</p>
    </div>
  );
}

// ───────── La pantalla del sorteo ─────────
export function Sorteo() {
  const [personas, setPersonas] = useState<V.Persona[]>([]);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [fase, setFase] = useState<'persona' | 'equipo' | 'girando-persona' | 'girando-equipo'>('persona');
  const [persona, setPersona] = useState<string | null>(null);
  const [giroP, setGiroP] = useState(0), [giroE, setGiroE] = useState(0);
  const [sale, setSale] = useState<{ p: string | null; e: string | null }>({ p: null, e: null });
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);
  const [auto, setAuto] = useState(false);
  const pantalla = useRef<HTMLDivElement>(null), restantes = useRef(0); // cuántas personas quedan (para el giro seguido)

  useEffect(() => { V.listarPersonas().then(setPersonas); }, []);
  // Recuperar un sorteo a medias
  useEffect(() => { try { const g = JSON.parse(localStorage.getItem(MEMORIA) ?? 'null'); if (g?.equipos) setEstado(g); } catch { /* nada */ } }, []);
  useEffect(() => { if (estado) try { localStorage.setItem(MEMORIA, JSON.stringify(estado)); } catch { /* sin almacenamiento */ } }, [estado]);

  const extras = estado?.extras ?? [], todos: { id: string; nombre: string }[] = [...personas, ...extras];
  const nombre = (id: string) => todos.find((p) => p.id === id)?.nombre ?? '¿?';
  const preparar = (capitanes: string[], nuevos: Extra[]) => {
    const cuantos = Math.max(capitanes.length, Math.ceil((personas.length + nuevos.length) / 3));
    setEstado({ capitanes, historial: [], extras: nuevos, equipos: Array.from({ length: cuantos }, (_, i) => ({ nombre: `Equipo ${i + 1}`, capitan: null, miembros: [] })) });
    setSale({ p: null, e: null }); setPersona(null); setFase('persona');
  };
  if (!personas.length) return <p class="tenue">Cargando inscritos…</p>;
  if (!estado) {
    const sugeridos = personas.filter((p) => CAPITANES.some((c) => parecido(p.nombre, c))).map((p) => p.id);
    return <Preparar personas={personas} sugeridos={sugeridos} alEmpezar={preparar} />;
  }

  const ubicados = new Set(estado.equipos.flatMap((q) => q.miembros));
  const capitanesPendientes = estado.capitanes.filter((id) => !ubicados.has(id));
  const enCapitanes = capitanesPendientes.length > 0;
  const pendientes = enCapitanes ? capitanesPendientes : todos.map((p) => p.id).filter((id) => !ubicados.has(id) && !estado.capitanes.includes(id));
  const cupo = (q: EquipoSorteo) => (enCapitanes ? !q.capitan : q.miembros.length < 3);
  const equiposLibres = estado.equipos.map((q, i) => ({ q, i })).filter(({ q }) => cupo(q));
  const terminado = !pendientes.length || !equiposLibres.length;
  const itemsP: Item[] = pendientes.map((id, i) => ({ id, texto: nombre(id), color: COLORES[i % COLORES.length] }));
  restantes.current = itemsP.length;
  const itemsE: Item[] = equiposLibres.map(({ q, i }) => ({ id: String(i), texto: q.nombre, color: COLORES[i % COLORES.length] }));

  const girarPersona = () => { if (fase !== 'persona' || terminado) return; setSale({ p: null, e: null }); setFase('girando-persona'); setGiroP((n) => n + 1); };
  const girarEquipo = () => { if (fase !== 'equipo') return; setFase('girando-equipo'); setGiroE((n) => n + 1); };
  const salioPersona = (k: number) => {
    const id = pendientes[k];
    setPersona(id); setSale({ p: nombre(id), e: null }); setFase('equipo');
    // Si queda una sola opción de equipo, igual se gira (es parte del show), pero en automático se encadena
    if (auto) setTimeout(() => { setFase('girando-equipo'); setGiroE((n) => n + 1); }, 900);
  };
  const salioEquipo = (k: number) => {
    const destino = equiposLibres[k]?.i;
    if (destino === undefined || !persona) return;
    setSale((s) => ({ ...s, e: estado.equipos[destino].nombre }));
    setEstado((e) => {
      if (!e) return e;
      const equipos = e.equipos.map((q, i) => (i !== destino ? q : { ...q, miembros: [...q.miembros, persona], capitan: enCapitanes ? persona : q.capitan, nombre: enCapitanes && q.nombre.startsWith('Equipo ') ? `Equipo de ${nombre(persona)}` : q.nombre }));
      return { ...e, equipos, historial: [...e.historial, { persona, equipo: destino }] };
    });
    setPersona(null); setFase('persona');
    if (auto) setTimeout(() => { if (!restantes.current) return; setSale({ p: null, e: null }); setFase('girando-persona'); setGiroP((n) => n + 1); }, 1800);
  };
  const deshacer = () => {
    const ultimo = estado.historial[estado.historial.length - 1];
    if (!ultimo || fase.startsWith('girando')) return;
    setEstado({ ...estado, historial: estado.historial.slice(0, -1), equipos: estado.equipos.map((q, i) => (i !== ultimo.equipo ? q : { ...q, miembros: q.miembros.filter((x) => x !== ultimo.persona), capitan: q.capitan === ultimo.persona ? null : q.capitan, nombre: q.capitan === ultimo.persona ? `Equipo ${i + 1}` : q.nombre })) });
    setPersona(null); setSale({ p: null, e: null }); setFase('persona');
  };
  // A mitad del sorteo: sumar a alguien que llegó tarde (si faltan cupos, se agrega un equipo)
  const agregar = (nombreNuevo: string) => {
    if (!nombreNuevo.trim()) return;
    const extra = nuevoExtra(nombreNuevo), total = todos.length + 1, equipos = [...estado.equipos];
    while (equipos.length < Math.ceil(total / 3)) equipos.push({ nombre: `Equipo ${equipos.length + 1}`, capitan: null, miembros: [] });
    setEstado({ ...estado, extras: [...extras, extra], equipos });
  };
  const renombrar = (i: number, nombreNuevo: string) => setEstado({ ...estado, equipos: estado.equipos.map((q, k) => (k === i ? { ...q, nombre: nombreNuevo.slice(0, 30) || q.nombre } : q)) });

  const guardar = async () => {
    setAviso(null);
    const borrar = await supabase.from('equipos').delete().gt('id', 0);
    if (borrar.error) return setAviso({ texto: borrar.error.message, ok: false });
    let r = await supabase.from('equipos').insert(estado.equipos.map((q) => ({ nombre: q.nombre, capitan: q.capitan && !esPendiente(q.capitan) ? q.capitan : null }))).select('id');
    let sinCapitan = false;
    if (r.error) { sinCapitan = true; r = await supabase.from('equipos').insert(estado.equipos.map((q) => ({ nombre: q.nombre }))).select('id'); }
    if (r.error || !r.data) return setAviso({ texto: r.error?.message ?? 'No se pudieron crear los equipos.', ok: false });
    const ids = (r.data as { id: number }[]).map((f) => f.id);
    const m = await supabase.from('equipo_miembros').insert(estado.equipos.flatMap((q, i) => q.miembros.filter((id) => !esPendiente(id)).map((perfil_id) => ({ perfil_id, equipo_id: ids[i] }))));
    if (m.error) return setAviso({ texto: m.error.message, ok: false });
    // Los que aún no tienen cuenta quedan como pendientes de su equipo, hasta vincularlos en la pestaña Equipos
    const sinCuenta = estado.equipos.flatMap((q, i) => q.miembros.filter(esPendiente).map((id) => ({ equipo_id: ids[i], nombre: nombre(id), es_capitan: q.capitan === id })));
    const pend = sinCuenta.length ? await supabase.from('equipo_pendientes').insert(sinCuenta) : { error: null };
    if (pend.error) return setAviso({ texto: `Equipos guardados, pero no los ${sinCuenta.length} sin cuenta: falta ejecutar supabase/etapa-5.sql (${pend.error.message}).`, ok: false });
    setAviso({ texto: `¡Listo! ${ids.length} equipos guardados en el torneo.${sinCuenta.length ? ` ${sinCuenta.length} quedaron pendientes de cuenta: vincúlalos en la pestaña Equipos cuando entren.` : ''}${sinCapitan ? ' Falta ejecutar supabase/etapa-3.sql para guardar quién es capitán.' : ''}`, ok: !sinCapitan });
  };
  const completa = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else pantalla.current?.requestFullscreen().catch(() => {}); };

  return (
    <div class="sorteo" ref={pantalla}>
      <div class="sorteo-cabeza">
        <div>
          <div class="sigla">{enCapitanes ? 'Fase 1 · capitanes' : terminado ? 'Sorteo terminado' : 'Fase 2 · participantes'}</div>
          <h2>{enCapitanes ? `Quedan ${capitanesPendientes.length} capitanes` : terminado ? '¡Equipos listos!' : `Quedan ${pendientes.length} participantes`}</h2>
        </div>
        <div class="fila">
          <label class="sorteo-marcar"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.currentTarget.checked)} /> Girar seguido</label>
          <button class="boton" onClick={deshacer} disabled={!estado.historial.length || fase.startsWith('girando')}>Deshacer</button>
          <button class="boton" onClick={completa}>Pantalla completa</button>
          <AgregarNombre alAgregar={agregar} />
        </div>
      </div>
      <div class="sorteo-cuerpo">
        <div class="sorteo-ruletas">
          <Ruleta titulo={enCapitanes ? '¿Qué capitán?' : '¿Quién?'} items={itemsP} girar={giroP} alTerminar={salioPersona} elegido={sale.p} />
          <Ruleta titulo="¿A qué equipo?" items={itemsE} girar={giroE} alTerminar={salioEquipo} elegido={sale.e} />
          <div class="sorteo-botones">
            <button class="boton principal grande" disabled={fase !== 'persona' || terminado} onClick={girarPersona}>🎡 Girar persona</button>
            <button class="boton principal grande" disabled={fase !== 'equipo'} onClick={girarEquipo}>🎡 Girar equipo</button>
          </div>
        </div>
        <div class="sorteo-equipos">
          {estado.equipos.map((q, i) => (
            <div key={i} class={`sorteo-equipo${sale.e === q.nombre ? ' recien' : ''}`} style={`--color:${COLORES[i % COLORES.length]}`}>
              <input class="texto" value={q.nombre} aria-label={`Nombre del equipo ${i + 1}`} onChange={(e) => renombrar(i, e.currentTarget.value)} />
              <ol>
                {[0, 1, 2].map((k) => {
                  const id = q.miembros[k];
                  return <li key={k} class={id ? 'ocupado' : ''}>{id ? <>{q.capitan === id && <span title="Capitán (staff)">⭐ </span>}{nombre(id)}{q.capitan === id && <em> capitán</em>}{esPendiente(id) && <em class="sin-cuenta"> sin cuenta</em>}</> : <span class="tenue">libre</span>}</li>;
                })}
              </ol>
              {!q.capitan && !enCapitanes && <span class="chico tenue">Sin staff: pueden pasar los 3</span>}
            </div>
          ))}
        </div>
      </div>
      {terminado && (
        <div class="sorteo-final">
          {pendientes.length > 0 && <p class="aviso atencion">Quedaron sin equipo (no alcanzaron los cupos): {pendientes.map(nombre).join(', ')}.</p>}
          <p>Al guardar se reemplazan los equipos que haya en el torneo por estos (los duelos 1v1 no se tocan).</p>
          <div class="fila">
            <ConfirmarBoton texto="Guardar equipos en el torneo" alConfirmar={guardar} />
            <ConfirmarBoton texto="Empezar el sorteo de nuevo" alConfirmar={() => { try { localStorage.removeItem(MEMORIA); } catch { /* nada */ } setEstado(null); }} />
          </div>
        </div>
      )}
      {aviso && <p class={`aviso ${aviso.ok ? 'ok' : 'error'}`}>{aviso.texto}</p>}
    </div>
  );
}

function ConfirmarBoton({ texto, alConfirmar }: { texto: string; alConfirmar(): void }) {
  const [armado, setArmado] = useState(false);
  return <button class={`boton${armado ? ' principal' : ''}`} onClick={() => { if (armado) { setArmado(false); alConfirmar(); } else setArmado(true); }} onBlur={() => setArmado(false)}>{armado ? `¿Seguro? ${texto}` : texto}</button>;
}

/** Antes de girar: confirmar quiénes son los capitanes (vienen marcados los que se llaman como el staff). */
function Preparar({ personas, sugeridos, alEmpezar }: { personas: V.Persona[]; sugeridos: string[]; alEmpezar(capitanes: string[], extras: Extra[]): void }) {
  const [capitanes, setCapitanes] = useState<string[]>(sugeridos);
  const [extras, setExtras] = useState<Extra[]>([]);
  const todos = [...personas, ...extras], total = todos.length;
  const equipos = Math.max(capitanes.length, Math.ceil(total / 3)), faltan = CAPITANES.filter((c) => !todos.some((p) => capitanes.includes(p.id) && parecido(p.nombre, c)));
  return (
    <div class="sorteo-preparar">
      <p>Hay <b>{personas.length}</b> personas inscritas{extras.length ? <> y <b>{extras.length}</b> agregadas a mano</> : null}: salen <b>{equipos} equipos</b> de 3 ({capitanes.length} con capitán y {equipos - capitanes.length} solo de participantes).{total % 3 ? ` Ojo: ${total} no se divide en grupos de 3; ${3 - (total % 3)} cupo(s) quedarán libres.` : ''}</p>
      {faltan.length > 0 && <p class="aviso atencion">No encontré entre los inscritos a: {faltan.join(', ')}. Agrégalos abajo con su nombre (y márcalos como capitán), o márcalos a mano si su nombre en Discord es distinto.</p>}
      <div class="sorteo-agregar-bloque">
        <b>¿Falta alguien que todavía no entra al sitio?</b>
        <p class="chico tenue">Agrégalo con su nombre: entra al sorteo igual y queda "sin cuenta" en su equipo. Cuando entre con Discord, lo vinculas en la pestaña Equipos (hasta entonces no se le pueden crear duelos).</p>
        <AgregarNombre alAgregar={(n) => setExtras((x) => [...x, nuevoExtra(n)])} />
      </div>
      <p class="chico tenue">Toca un nombre para marcarlo o desmarcarlo como capitán. Solo pueden participar quienes ya entraron al sitio con Discord.</p>
      <div class="sorteo-personas">
        {todos.map((p) => <button key={p.id} class={`chip-persona${capitanes.includes(p.id) ? ' capitan' : ''}${esPendiente(p.id) ? ' sin-cuenta' : ''}`} onClick={() => setCapitanes((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}>{capitanes.includes(p.id) ? '⭐ ' : ''}{p.nombre}{esPendiente(p.id) ? ' (sin cuenta)' : ''}</button>)}
      </div>
      {extras.length > 0 && <p class="chico">Agregados a mano (toca para quitar): {extras.map((x) => <button key={x.id} class="boton quitar" title="Quitar" onClick={() => { setExtras((l) => l.filter((y) => y.id !== x.id)); setCapitanes((c) => c.filter((y) => y !== x.id)); }}>{x.nombre} ✕</button>)}</p>}
      <button class="boton principal grande" onClick={() => alEmpezar(capitanes, extras)}>Empezar el sorteo ({capitanes.length} capitanes)</button>
    </div>
  );
}

/** Campo chico para sumar a alguien por su nombre. */
function AgregarNombre({ alAgregar }: { alAgregar(nombre: string): void }) {
  const [texto, setTexto] = useState('');
  const listo = () => { if (texto.trim()) { alAgregar(texto); setTexto(''); } };
  return (
    <form class="sorteo-agregar" onSubmit={(e) => { e.preventDefault(); listo(); }}>
      <input class="texto" value={texto} maxLength={40} placeholder="Nombre de quien falta" aria-label="Nombre del participante a agregar" onInput={(e) => setTexto(e.currentTarget.value)} />
      <button class="boton" type="submit" disabled={!texto.trim()}>+ Agregar</button>
    </form>
  );
}
