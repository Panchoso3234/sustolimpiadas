import { useEffect, useMemo, useState } from 'preact/hooks';
import { supabase } from '../nucleo/supabase';
import * as V from '../juegos/duelos';
import { calcularLiga } from '../juegos/liga';
import { PUNTOS_BASE, leerPuntos } from '../juegos/puntos';
import { listarAjustesCartas } from '../juegos/wcDatos';
import { recordsDeSiempre } from '../juegos/marcas';
import { armarFicha, type FichaTributo } from './foto';
import { simular, type PasoGala, type Patrocinio, type ResultadoGala } from './motor';
import { calcularCuotas } from './cuotas';
import * as FF from './ffDatos';
import { BANCO, ESCENARIOS } from './eventos';
import './fasefinal.css';

// Panel de la gala (solo organización y staff). Todo queda guardado en este navegador: si se cae, vuelve al mismo paso.
// La semilla sellada: al preparar se crea un secreto y se publica su huella (SHA-256); al apretar «Empezar» se le suma
// la hora exacta. Al final se revela el secreto y cualquiera puede repetir cada simulación con simular().

const PREMIOS = ['Comisión de dibujo + bendición lunar', 'Bendición lunar', 'Bendición lunar', 'Bendición lunar', 'Bendición lunar', 'Bendición lunar'];
const VELOCIDAD = { lento: 9000, normal: 6000, rapido: 3500 } as const;
type Vel = keyof typeof VELOCIDAD;
interface Sim { parejas: [string, string][]; solo: string | null; inicio: string | null; semilla: string | null; paso: number; ganador: string | null; huellaPron?: string }
interface Estado { tributos: FichaTributo[] | null; congelada: string | null; secreto: string; huella: string; sims: Sim[] }

const CLAVE = (ensayo: boolean) => (ensayo ? 'susto.fasefinal.ensayo' : 'susto.fasefinal');
const sha = async (txt: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const nuevoSecreto = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const simVacia = (): Sim => ({ parejas: [], solo: null, inicio: null, semilla: null, paso: 0, ganador: null });
function leer(ensayo: boolean): Estado | null { try { return JSON.parse(localStorage.getItem(CLAVE(ensayo)) ?? 'null'); } catch { return null; } }
function guardar(ensayo: boolean, e: Estado) { try { localStorage.setItem(CLAVE(ensayo), JSON.stringify(e)); } catch { /* sin almacenamiento */ } }

const rotos = new Set<string>();
function Avatar({ t, tam = 64 }: { t?: FichaTributo; tam?: number }) {
  const [, refrescar] = useState(0);
  if (!t) return null;
  const tamano = `width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.45)}px`;
  // Si el enlace del ícono ya no sirve (cambió su foto en Discord), queda la inicial
  const inicial = <span class="ff-avatar ff-inicial" style={tamano} aria-hidden="true">{t.nombre.slice(0, 1).toUpperCase()}</span>;
  return t.avatar && !rotos.has(t.avatar) ? <img class="ff-avatar" src={t.avatar} alt="" width={tam} height={tam} style={tamano} onError={() => { rotos.add(t.avatar!); refrescar((x) => x + 1); }} /> : inicial;
}

export function Gala() {
  const [ensayo, setEnsayo] = useState(false);
  const [e, setE] = useState<Estado | null>(null);
  const [vista, setVista] = useState<'preparar' | 'presentacion' | number | 'resultados'>('preparar');
  const [vivo, setVivo] = useState<{ fichas: FichaTributo[]; reservas: FichaTributo[] } | null>(null);
  const [aviso, setAviso] = useState('');
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  useEffect(() => { supabase.from('perfiles').select('id,nombre').then(({ data }) => setNombres(new Map(((data ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre])))); }, []);

  // Estado guardado (o uno nuevo con su secreto)
  useEffect(() => {
    (async () => {
      const previo = leer(ensayo);
      if (previo) { setE(previo); return; }
      const secreto = nuevoSecreto();
      const nuevo: Estado = { tributos: null, congelada: null, secreto, huella: await sha(secreto), sims: PREMIOS.map(simVacia) };
      guardar(ensayo, nuevo); setE(nuevo);
    })();
  }, [ensayo]);
  const poner = (f: (x: Estado) => Estado) => setE((x) => { if (!x) return x; const y = f(x); guardar(ensayo, y); return y; });

  // La foto en vivo (quiénes clasificarían hoy), para congelarla
  useEffect(() => {
    if (import.meta.env.DEV && location.search.includes('ffprueba')) {
      const falsos = Array.from({ length: 16 }, (_, i): FichaTributo => ({ id: `p${i}`, nombre: `Tributo ${i + 1}`, distrito: `Equipo ${Math.floor(i / 3) + 1}`, poder: i / 15, atributo: i % 3 ? 'Astucia' : 'Fuerza', avatar: null, titulo: `${i + 2} duelos ganados en la liga`, puntos: 100 + i * 37, ganados: i + 2, jugados: 9, primeros: i % 4, podios: i % 5, atributos: {}, entrada: i > 12 ? 'especial' : 'equipo' }));
      setVivo({ fichas: falsos, reservas: falsos.slice(0, 2).map((f) => ({ ...f, id: `r${f.id}`, nombre: `Reserva ${f.nombre}` })) });
      return;
    }
    (async () => {
      const [equipos, personas, { lista }, puntos, ausencias, cartas, records, perfiles] = await Promise.all([V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos('1v1'), leerPuntos().catch(() => PUNTOS_BASE), V.listarAusencias(), listarAjustesCartas(), recordsDeSiempre(), supabase.from('perfiles').select('id,avatar_url')]);
      const { personal } = calcularLiga(equipos, personas, lista, puntos, ausencias, cartas);
      const avatares = new Map(((perfiles.data ?? []) as { id: string; avatar_url: string | null }[]).map((p) => [p.id, p.avatar_url]));
      const fichas = armarFicha(personal, lista, records, avatares);
      const fuera = personal.filter((j) => !j.clasifica && !j.staff && j.puntos > 0).slice(0, 8).map((j) => ({ ...j, clasifica: 'especial' as const }));
      setVivo({ fichas, reservas: armarFicha(fuera, lista, records, avatares) });
    })();
  }, []);

  if (!e) return <p class="tenue">Cargando…</p>;
  const tributos = e.tributos ?? [];
  const porId = new Map(tributos.map((t) => [t.id, t]));
  const ganadores = e.sims.map((s) => s.ganador).filter(Boolean) as string[];

  return (
    <div class="ff-gala">
      <nav class="ff-pestanas" aria-label="Gala">
        <button class={vista === 'preparar' ? 'activa' : ''} onClick={() => setVista('preparar')}>Preparar</button>
        <button class={vista === 'presentacion' ? 'activa' : ''} disabled={!tributos.length} onClick={() => setVista('presentacion')}>Presentación</button>
        {e.sims.map((s, i) => <button key={i} class={vista === i ? 'activa' : ''} disabled={!tributos.length || (i > 0 && !e.sims[i - 1].ganador)} onClick={() => setVista(i)}>Simulación {i + 1}{s.ganador ? ' ✓' : ''}</button>)}
        <button class={vista === 'resultados' ? 'activa' : ''} onClick={() => setVista('resultados')}>Resultados</button>
        <label class="ff-ensayo"><input type="checkbox" checked={ensayo} onChange={(ev) => { setE(null); setEnsayo(ev.currentTarget.checked); }} /> Modo ensayo (no toca la gala real)</label>
      </nav>
      {aviso && <p class="aviso ok" role="status">{aviso}</p>}

      {vista === 'preparar' && <Preparar e={e} vivo={vivo} poner={poner} avisar={setAviso} ensayo={ensayo} />}
      {vista === 'presentacion' && <Presentacion tributos={tributos} />}
      {typeof vista === 'number' && <Simulacion k={vista} e={e} ensayo={ensayo} nombres={nombres} porId={porId} fuera={ganadores.filter((g) => g !== e.sims[vista].ganador)} poner={poner} alTerminar={() => setVista(vista < 5 ? vista + 1 : 'resultados')} />}
      {vista === 'resultados' && <Resultados e={e} porId={porId} avisar={setAviso} ensayo={ensayo} />}
    </div>
  );
}

function Preparar({ e, vivo, poner, avisar, ensayo }: { e: Estado; vivo: { fichas: FichaTributo[]; reservas: FichaTributo[] } | null; poner: (f: (x: Estado) => Estado) => void; avisar: (t: string) => void; ensayo: boolean }) {
  const lista = e.tributos ?? vivo?.fichas ?? [];
  const empezada = e.sims.some((s) => s.inicio);
  const copiar = (t: string, ok: string) => navigator.clipboard?.writeText(t).then(() => avisar(ok), () => avisar('No se pudo copiar: selecciona el texto a mano.'));
  return (
    <section class="ff-preparar">
      <h2>1. Tributos {e.congelada ? <span class="tenue chico">(foto congelada el {new Date(e.congelada).toLocaleString('es-CL')})</span> : <span class="tenue chico">(en vivo: así quedaría si la liga cerrara ahora)</span>}</h2>
      {!vivo && !e.tributos && <p class="tenue">Calculando la tabla…</p>}
      <div class="tabla-caja"><table class="tabla">
        <thead><tr><th></th><th>Tributo</th><th>Distrito</th><th>Título</th><th>Atributo</th><th>Poder</th><th>Entra por</th>{e.tributos && !empezada && <th></th>}</tr></thead>
        <tbody>{lista.map((t) => (
          <tr key={t.id}><td><Avatar t={t} tam={32} /></td><td><b>{t.nombre}</b></td><td>{t.distrito}</td><td class="chico">{t.titulo}</td><td>{t.atributo ?? '—'}</td><td>{Math.round(t.poder * 100)}</td><td class="chico">{t.entrada === 'equipo' ? 'Equipo' : 'Puntaje'}</td>
            {e.tributos && !empezada && <td><button class="boton" onClick={() => poner((x) => ({ ...x, tributos: x.tributos!.filter((y) => y.id !== t.id) }))}>Quitar</button></td>}</tr>
        ))}</tbody>
      </table></div>
      <div class="ff-acciones">
        <button class="boton principal" disabled={!vivo || empezada} onClick={() => poner((x) => ({ ...x, tributos: vivo!.fichas, congelada: new Date().toISOString() }))}>{e.tributos ? 'Volver a congelar con la tabla actual' : 'Congelar la foto ahora'}</button>
        <span class="tenue chico">Se congela el lunes 23 a las 00:00, después del cierre del cruce 11. Los reemplazos se agregan desde Reservas hasta las 18:00.</span>
      </div>
      {e.tributos && !empezada && vivo && (
        <details class="ff-reservas"><summary>Reservas (siguientes mejores puntajes personales)</summary>
          <ul>{vivo.reservas.filter((r) => !e.tributos!.some((t) => t.id === r.id)).map((r) => (
            <li key={r.id}><Avatar t={r} tam={24} /> <b>{r.nombre}</b> · {r.puntos.toLocaleString('es-CL')} pts <button class="boton" onClick={() => poner((x) => ({ ...x, tributos: [...x.tributos!, r] }))}>Agregar</button></li>
          ))}</ul>
        </details>
      )}
      <PublicarTsukibet tributos={e.tributos} ensayo={ensayo} avisar={avisar} />
      <h2>3. Semilla sellada</h2>
      <p>Publica esta huella en Discord <b>antes</b> de la gala. Al final se revela el secreto y cualquiera puede comprobar que nada se arregló.</p>
      <p class="ff-huella"><code>{e.huella}</code> <button class="boton" onClick={() => copiar(`Huella de la semilla de la FASE FINAL (SHA-256): ${e.huella}`, 'Huella copiada.')}>Copiar para Discord</button></p>
      {ensayo && <p class="aviso">Modo ensayo: nada de esto toca la gala real. Puedes borrar el ensayo y partir de nuevo.</p>}
      {ensayo && <button class="boton" onClick={() => { try { localStorage.removeItem(CLAVE(true)); } catch { /* */ } location.reload(); }}>Borrar el ensayo</button>}
    </section>
  );
}

function Presentacion({ tributos }: { tributos: FichaTributo[] }) {
  const [i, setI] = useState(0);
  const t = tributos[Math.min(i, tributos.length - 1)];
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'ArrowRight' || ev.key === ' ') { ev.preventDefault(); setI((x) => Math.min(tributos.length - 1, x + 1)); } if (ev.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); };
    addEventListener('keydown', tecla); return () => removeEventListener('keydown', tecla);
  }, [tributos.length]);
  if (!t) return null;
  return (
    <section class="ff-escena ff-presentacion" aria-live="polite">
      <div class="ff-contador">Tributo {i + 1} de {tributos.length}</div>
      <Avatar t={t} tam={180} />
      <h2 class="ff-nombre">{t.nombre}</h2>
      <p class="ff-distrito">Distrito de origen: <b>{t.distrito}</b></p>
      <p class="ff-titulo">«{t.titulo}»</p>
      <ul class="ff-numeros">
        <li><b>{t.puntos.toLocaleString('es-CL')}</b>puntos en la liga</li>
        <li><b>{t.ganados}/{t.jugados}</b>duelos ganados</li>
        <li><b>{t.primeros}</b>récords</li>
        {t.atributo && <li><b>{t.atributo}</b>su fuerte</li>}
      </ul>
      <div class="ff-controles"><button class="boton" disabled={i === 0} onClick={() => setI(i - 1)}>← Anterior</button><button class="boton principal" disabled={i >= tributos.length - 1} onClick={() => setI(i + 1)}>Siguiente →</button></div>
    </section>
  );
}

function Simulacion({ k, e, ensayo, nombres, porId, fuera, poner, alTerminar }: { k: number; e: Estado; ensayo: boolean; nombres: Map<string, string>; porId: Map<string, FichaTributo>; fuera: string[]; poner: (f: (x: Estado) => Estado) => void; alTerminar: () => void }) {
  const s = e.sims[k];
  const participantes = (e.tributos ?? []).filter((t) => !fuera.includes(t.id));
  const [girando, setGirando] = useState(false);
  const [auto, setAuto] = useState(false);
  const [vel, setVel] = useState<Vel>('normal');
  const [oculto, setOculto] = useState(false);
  const [zoom, setZoom] = useState(1);
  const ponerSim = (f: (x: Sim) => Sim) => poner((x) => ({ ...x, sims: x.sims.map((y, i) => (i === k ? f(y) : y)) }));
  // Paracaídas del público (TSUKIBET): cambian la simulación desde el paso siguiente; los anteriores no se mueven
  const [paracaidas, setParacaidas] = useState<FF.ParacaidasFF[]>([]);
  const patrocinios: Patrocinio[] = paracaidas.map((x) => ({ tributo: x.tributo, desdePaso: x.desde_paso, fuerza: x.nivel }));
  const resultado: ResultadoGala | null = useMemo(() => (s.semilla ? simular(participantes, s.parejas, BANCO, ESCENARIOS, s.semilla, patrocinios) : null), [s.semilla, s.parejas, participantes.length, paracaidas.length]);
  const pasos: PasoGala[] = resultado?.pasos ?? [];
  const total = pasos.length + 1; // + el podio
  const fin = s.paso >= pasos.length;

  const girar = () => {
    setGirando(true);
    const ids = participantes.map((t) => t.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const parejas: [string, string][] = [];
    for (let i = 0; i + 1 < ids.length; i += 2) parejas.push([ids[i], ids[i + 1]]);
    setTimeout(() => { ponerSim((x) => ({ ...x, parejas, solo: ids.length % 2 ? ids[ids.length - 1] : null })); setGirando(false); }, 1200);
  };
  const empezar = async () => {
    // El servidor cierra los pronósticos y entrega su hora y la huella de los pronósticos: entran a la semilla
    const cierre = ensayo ? null : await FF.cerrar(k + 1, participantes.map((t) => t.id));
    const inicio = cierre?.cierre ?? new Date().toISOString(), huellaPron = cierre?.huella ?? '';
    const semilla = await sha(`${e.secreto}|sim${k + 1}|${inicio}|${huellaPron}`);
    ponerSim((x) => ({ ...x, inicio, semilla, huellaPron, paso: 0 }));
  };
  // En cada paso: avisar al servidor (habilita los paracaídas entre el Día 1 y la Noche 3) y leer los que llegaron
  useEffect(() => {
    if (ensayo || !s.semilla || s.ganador) return;
    const limite = pasos.findIndex((p) => p.titulo === 'Cañonazos · Noche 3');
    const abiertos = s.paso >= 1 && s.paso < pasos.length && (limite < 0 || s.paso < limite);
    FF.avanzar(k + 1, s.paso, abiertos);
    FF.paracaidas(k + 1).then((l) => { if (l.length !== paracaidas.length) setParacaidas(l); });
  }, [s.paso, s.semilla, pasos.length]);
  const mover = (d: number) => ponerSim((x) => ({ ...x, paso: Math.max(0, Math.min(total - 1, x.paso + d)) }));

  // Modo automático y atajos: espacio/→ siguiente, ← atrás, A automático, P pausa, H esconde el panel, + y − zoom
  useEffect(() => {
    if (!auto || !s.semilla || fin) return;
    const id = setTimeout(() => mover(1), VELOCIDAD[vel]); return () => clearTimeout(id);
  }, [auto, s.paso, s.semilla, vel, fin]);
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === 'INPUT') return;
      if (ev.key === ' ' || ev.key === 'ArrowRight') { ev.preventDefault(); if (s.semilla) mover(1); }
      else if (ev.key === 'ArrowLeft') mover(-1);
      else if (ev.key === 'a' || ev.key === 'A') setAuto(true);
      else if (ev.key === 'p' || ev.key === 'P') setAuto(false);
      else if (ev.key === 'h' || ev.key === 'H') setOculto((x) => !x);
      else if (ev.key === '+') setZoom((z) => Math.min(1.8, z + 0.1));
      else if (ev.key === '-') setZoom((z) => Math.max(0.7, z - 0.1));
    };
    addEventListener('keydown', tecla); return () => removeEventListener('keydown', tecla);
  }, [s.semilla, total]);

  const nombre = (id: string) => porId.get(id)?.nombre ?? id;
  const resaltar = (texto: string, ids: string[]) => {
    const nombres = ids.map(nombre).sort((a, b) => b.length - a.length);
    if (!nombres.length) return texto;
    const re = new RegExp(`(${nombres.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return texto.split(re).map((parte, i) => (nombres.includes(parte) ? <b key={i}>{parte}</b> : parte));
  };

  // Antes de empezar: ruleta de parejas
  if (!s.semilla) return (
    <section class="ff-escena">
      <h2>Simulación {k + 1} · premio: {PREMIOS[k]}</h2>
      <p class="tenue">{participantes.length} tributos{fuera.length ? ` (sin los ganadores anteriores: ${fuera.map(nombre).join(', ')})` : ''}. La ruleta arma parejas al azar: el «distrito nuevo». Todos pueden eliminar a todos.</p>
      <div class={`ff-parejas${girando ? ' girando' : ''}`}>
        {s.parejas.map(([a, b], i) => <div key={i} class="ff-pareja"><span class="ff-dist">Distrito {i + 1}</span><Avatar t={porId.get(a)} tam={56} /><b>{nombre(a)}</b><span class="tenue">y</span><Avatar t={porId.get(b)} tam={56} /><b>{nombre(b)}</b></div>)}
        {s.solo && <div class="ff-pareja"><span class="ff-dist">Sin pareja</span><Avatar t={porId.get(s.solo)} tam={56} /><b>{nombre(s.solo)}</b></div>}
      </div>
      <div class="ff-controles">
        <button class="boton" disabled={girando} onClick={girar}>{s.parejas.length ? 'Volver a girar' : 'Girar la ruleta'}</button>
        <button class="boton principal" disabled={!s.parejas.length || girando} onClick={empezar}>Empezar la simulación</button>
      </div>
    </section>
  );

  const paso = pasos[s.paso];
  return (
    <section class={`ff-escena ff-sim${oculto ? ' transmision' : ''}`} style={{ '--ff-zoom': zoom }}>
      {!fin && paso && <>
        <div class="ff-contador">Simulación {k + 1} · paso {s.paso + 1} de {pasos.length}</div>
        <h2 class={`ff-etapa ff-${paso.tipo}`}>{paso.titulo}</h2>
        {paso.intro && <p class="ff-intro">{paso.intro}</p>}
        {paracaidas.filter((x) => x.desde_paso === s.paso).map((x) => <p key={x.id} class="ff-paracaidas">🪂 Paracaídas de {nombres.get(x.perfil_id) ?? 'alguien del público'} para <b>{nombre(x.tributo)}</b>{x.nivel === 2 ? ' (grande)' : ''}</p>)}
        <ul class="ff-lineas">{paso.lineas.map((l, i) => (
          <li key={i} class={l.muertos.length ? 'fatal' : ''}>
            <span class="ff-caras">{l.tributos.map((id) => <Avatar key={id} t={porId.get(id)} tam={paso.tipo === 'caidos' ? 64 : 40} />)}</span>
            <span>{paso.tipo === 'caidos' ? <>💥 {l.texto}</> : resaltar(l.texto, l.tributos)}</span>
          </li>
        ))}</ul>
      </>}
      {fin && resultado && (
        <div class="ff-podio">
          <h2>Ganador de la simulación {k + 1}</h2>
          <Avatar t={porId.get(resultado.ganador)} tam={200} />
          <p class="ff-nombre">{nombre(resultado.ganador)}</p>
          <p class="ff-distrito">{porId.get(resultado.ganador)?.distrito} · premio: <b>{PREMIOS[k]}</b></p>
          <ol class="ff-top">{resultado.top3.slice(1).map((id, i) => <li key={id} value={i + 2}><Avatar t={porId.get(id)} tam={40} /> {nombre(id)}</li>)}</ol>
          {!s.ganador ? <button class="boton principal" onClick={async () => {
            // Paga TSUKIBET con el resultado (no en el ensayo)
            if (!ensayo) await FF.registrarResultado(k + 1, { ganador: resultado.ganador, primero: resultado.caidas[0], sobrevive: resultado.sobrevivenBano, top3: resultado.top3 });
            ponerSim((x) => ({ ...x, ganador: resultado.ganador })); alTerminar();
          }}>Confirmar y seguir</button> : <p class="tenue">Ganador guardado.</p>}
        </div>
      )}
      {!oculto && (
        <div class="ff-controles ff-panel">
          <button class="boton" disabled={s.paso === 0} onClick={() => mover(-1)}>← Atrás</button>
          <button class="boton principal" disabled={fin} onClick={() => mover(1)}>Siguiente →</button>
          <button class="boton" aria-pressed={auto} onClick={() => setAuto(!auto)}>{auto ? 'Pausa (P)' : 'Automático (A)'}</button>
          <select value={vel} onChange={(ev) => setVel(ev.currentTarget.value as Vel)} aria-label="Velocidad"><option value="lento">Lento</option><option value="normal">Normal</option><option value="rapido">Rápido</option></select>
          <span class="tenue chico">H esconde este panel · + y − cambian el tamaño del texto</span>
        </div>
      )}
    </section>
  );
}

function Resultados({ e, porId, avisar, ensayo }: { e: Estado; porId: Map<string, FichaTributo>; avisar: (t: string) => void; ensayo: boolean }) {
  const nombre = (id: string | null) => (id ? porId.get(id)?.nombre ?? id : '—');
  const texto = [
    '**FASE FINAL · resultados**',
    ...e.sims.map((s, i) => `Simulación ${i + 1}: **${nombre(s.ganador)}** (${PREMIOS[i]})`),
    '', `Semilla: secreto \`${e.secreto}\` (huella publicada: \`${e.huella}\`).`,
    ...e.sims.filter((s) => s.inicio).map((s, i) => `Simulación ${i + 1}: cierre ${s.inicio} · huella de pronósticos ${s.huellaPron || '—'} · semilla ${s.semilla}`),
  ].join('\n');
  return (
    <section class="ff-escena">
      <h2>Tabla de la noche</h2>
      <div class="tabla-caja"><table class="tabla"><thead><tr><th>Simulación</th><th>Ganador</th><th>Premio</th></tr></thead>
        <tbody>{e.sims.map((s, i) => <tr key={i}><td>{i + 1}</td><td><b>{nombre(s.ganador)}</b></td><td>{PREMIOS[i]}</td></tr>)}</tbody></table></div>
      <p class="chico">Al terminar, revela el secreto: con él, la hora de inicio y la lista de parejas, cualquiera puede repetir cada simulación.</p>
      <textarea class="ff-resumen" readOnly rows={12} value={texto} />
      <div class="ff-controles">
        <button class="boton principal" onClick={() => navigator.clipboard?.writeText(texto).then(() => avisar('Resumen copiado.'), () => avisar('No se pudo copiar.'))}>Copiar resumen para Discord</button>
        {!ensayo && <button class="boton" disabled={!e.sims.every((s) => s.ganador)} onClick={async () => avisar((await FF.premiar()) ?? 'Premios del público entregados: 1.600, 960 y 640 gemas al podio y 160 a quien pronosticó en 4 o más simulaciones.')}>Entregar premios del público (TSUKIBET)</button>}
      </div>
    </section>
  );
}

/** Publica las 6 simulaciones en TSUKIBET con sus cuotas (10.000 galas con parejas al azar). */
function PublicarTsukibet({ tributos, ensayo, avisar }: { tributos: FichaTributo[] | null; ensayo: boolean; avisar: (t: string) => void }) {
  const [avance, setAvance] = useState<number | null>(null);
  const [vista, setVista] = useState<Awaited<ReturnType<typeof calcularCuotas>> | null>(null);
  if (!tributos) return null;
  const correr = async () => {
    setAvance(0);
    const r = await calcularCuotas(tributos, BANCO, ESCENARIOS, 10000, setAvance);
    setVista(r); setAvance(null);
    if (ensayo) { avisar('Cuotas calculadas (modo ensayo: no se publicó nada).'); return; }
    const lista = tributos.map((t) => ({ id: t.id, nombre: t.nombre }));
    const error = await FF.publicar(PREMIOS.map((_, i) => ({ n: i + 1, tributos: lista, cuotas: r.cuotas })));
    avisar(error ?? 'TSUKIBET publicado: las 6 simulaciones quedan abiertas a pronósticos y apuestas.');
  };
  const top = vista ? tributos.map((t) => [t, vista.prob.ganador[t.id] ?? 0] as const).sort((a, b) => b[1] - a[1]) : [];
  return (
    <>
      <h2>2. TSUKIBET</h2>
      <p class="chico">Calcula las cuotas con 10.000 galas y abre los pronósticos y apuestas de las 6 simulaciones. Se cierran solas al apretar «Empezar» en cada una.</p>
      <button class="boton principal" disabled={avance != null} onClick={correr}>{avance != null ? `Calculando… ${Math.round(avance * 100)} %` : ensayo ? 'Calcular cuotas (ensayo)' : 'Calcular cuotas y publicar TSUKIBET'}</button>
      {vista && <div class="tabla-caja"><table class="tabla"><thead><tr><th>Tributo</th><th>Gana</th><th>Cuota ganador</th><th>Cuota primer caído</th><th>Cuota sobrevive</th><th>Cuota top 3</th></tr></thead>
        <tbody>{top.map(([t, p]) => <tr key={t.id}><td>{t.nombre}</td><td>{(p * 100).toFixed(1)} %</td><td>×{vista.cuotas.ganador[t.id]}</td><td>×{vista.cuotas.primero[t.id]}</td><td>×{vista.cuotas.sobrevive[t.id]}</td><td>×{vista.cuotas.top3[t.id]}</td></tr>)}</tbody></table></div>}
    </>
  );
}
