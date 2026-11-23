import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { PasoGala, ResultadoGala } from './motor';
import type { FichaTributo } from './foto';
import { ESCENARIOS } from './eventos';

// FASE FINAL en 8 bits (pedido de Pancho del 22-11): un evento a la vez, grande y legible para transmitir por Discord;
// cartel por etapa, texto que se escribe letra por letra, suspenso antes de cada muerte, cañonazos uno por uno, barra
// de tributos abajo, retratos pixelados y fondos pixel art por etapa. Se avanza con clic (izquierdo o derecho), espacio
// o flechas. Todo es solo presentación: el resultado lo decide el motor con la semilla.

const quieto = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const escenarioDe = new Map(ESCENARIOS.map((x) => [x.titulo, x.id]));

// ───────── Retratos pixelados ─────────
const cache = new Map<string, Promise<string | null>>();
/** Reduce la imagen a n×n píxeles (recorte centrado) para que se vea 8 bits al agrandarla. Si no se puede, null. */
function pixelar(src: string, n: number): Promise<string | null> {
  const clave = `${src}|${n}`;
  if (!cache.has(clave)) cache.set(clave, new Promise((ok) => {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    img.onload = () => {
      try {
        const cv = document.createElement('canvas'); cv.width = n; cv.height = n;
        const g = cv.getContext('2d')!, lado = Math.min(img.naturalWidth, img.naturalHeight);
        g.imageSmoothingEnabled = true;
        g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, n, n);
        ok(cv.toDataURL('image/png'));
      } catch { ok(null); }
    };
    img.onerror = () => ok(null);
    img.src = src;
  }));
  return cache.get(clave)!;
}
const ICONO_ESTADO = { herido: '🩸', envenenado: '🧪', hambriento: '🍖' } as const;

export function Retrato({ t, tam = 56, muerto = false, activo = false, estados = [] }: { t?: FichaTributo; tam?: number; muerto?: boolean; activo?: boolean; estados?: string[] }) {
  const [pix, setPix] = useState<string | null>(null);
  const [roto, setRoto] = useState(false);
  useEffect(() => { setPix(null); setRoto(false); if (t?.avatar) pixelar(t.avatar, 28).then(setPix); }, [t?.avatar]);
  if (!t) return null;
  const src = pix ?? (t.avatar && !roto ? t.avatar : null);
  return (
    <span class={`ff8-retrato${muerto ? ' muerto' : ''}${activo ? ' activo' : ''}`} style={`width:${tam}px;height:${tam}px`} title={t.nombre}>
      {src ? <img src={src} alt="" onError={() => setRoto(true)} /> : <span class="ff8-inicial" style={`font-size:${Math.round(tam * 0.4)}px`}>{([...t.nombre.replace(/[^\p{L}\p{N}]/gu, '')][0] ?? '?').toUpperCase()}</span>}
      {muerto && <span class="ff8-x" aria-hidden="true">✕</span>}
      {!muerto && estados.length > 0 && <span class="ff8-estados" aria-label={estados.join(', ')}>{[...new Set(estados)].map((e) => ICONO_ESTADO[e as keyof typeof ICONO_ESTADO] ?? '').join('')}</span>}
    </span>
  );
}

// ───────── Fondos pixel art (lienzo chico agrandado sin suavizar) ─────────
type Fondo = 'dia' | 'noche' | 'bano' | 'banquete' | 'caidos' | 'podio' | string;
function dibujar(g: CanvasRenderingContext2D, fondo: Fondo, t: number) {
  const W = 192, H = 108, px = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const noche = fondo === 'noche' || fondo === 'caidos' || fondo === 'apagon' || fondo === 'podio';
  const cielo = noche ? ['#0b1026', '#111a3a', '#18244a'] : fondo === 'bano' ? ['#5a1a2a', '#8a2a3a', '#c2523a'] : fondo === 'incendio' ? ['#3a1408', '#7a2a10', '#c24a18'] : fondo === 'temporal' || fondo === 'niebla' ? ['#3a4250', '#4e5868', '#6a7484'] : ['#3d7fd6', '#5a98e2', '#86b8ee'];
  for (let i = 0; i < 3; i++) px(0, (i * 60) / 3, W, 21, cielo[i]);
  if (noche) for (let i = 0; i < 40; i++) { const x = (i * 53) % W, y = (i * 29) % 55; if (Math.sin(t * 2 + i) > -0.3) px(x, y, 1, 1, i % 3 ? '#7fb4ff' : '#fff6c9'); }
  if (noche) { px(152, 8, 8, 12, '#fff1a8'); px(150, 10, 12, 8, '#fff1a8'); px(156, 9, 6, 8, cielo[0]); } // luna creciente
  else if (fondo !== 'temporal' && fondo !== 'niebla' && fondo !== 'incendio') { px(152, 10, 14, 14, '#ffd23c'); px(155, 13, 8, 8, '#fff1a8'); }
  // Cerros, bosque y suelo
  for (let x = 0; x < W; x += 4) px(x, 52 + Math.sin(x / 17) * 6, 4, 60, noche ? '#16283e' : '#2f6a3a');
  for (let x = -6; x < W; x += 11) { const y = 62 + ((x * 7) % 5); px(x + 3, y - 10, 4, 10, noche ? '#0e1a2a' : '#245a2c'); px(x, y - 16, 10, 8, noche ? '#122236' : '#2e7a36'); px(x + 2, y - 20, 6, 5, noche ? '#122236' : '#3a8a40'); }
  px(0, 80, W, 28, noche ? '#1a2a3a' : '#c9a86a'); for (let x = 0; x < W; x += 6) px(x, 80, 3, 1, noche ? '#24384c' : '#b0904e');
  // Cornucopia (baño de sangre y banquete)
  if (fondo === 'bano' || fondo === 'banquete') { px(80, 66, 34, 14, '#c9a24a'); px(74, 70, 8, 8, '#a88334'); px(70, 73, 5, 4, '#8a6a28'); px(112, 64, 6, 18, '#e8c86a'); if (fondo === 'banquete') for (let i = 0; i < 4; i++) px(84 + i * 7, 76, 5, 4, ['#e8325a', '#2f6bd8', '#3fa34d', '#ffd23c'][i]); }
  // Efectos de los escenarios de arena
  const k = Math.floor(t * 12);
  if (fondo === 'temporal') for (let i = 0; i < 60; i++) px((i * 37 + k * 3) % W, (i * 23 + k * 7) % H, 1, 3, '#a8c8ff');
  if (fondo === 'helada') for (let i = 0; i < 50; i++) px((i * 37 + k) % W, (i * 19 + k * 2) % H, 1, 1, '#ffffff');
  if (fondo === 'incendio') for (let i = 0; i < 26; i++) { const x = (i * 29) % W, h = 6 + ((i * 7 + k) % 9); px(x, 80 - h, 4, h, i % 2 ? '#ff7a1a' : '#ffd23c'); }
  if (fondo === 'niebla') for (let i = 0; i < 5; i++) { g.globalAlpha = 0.25; px(((k * 2 + i * 50) % (W + 60)) - 60, 40 + i * 10, 80, 8, '#e6ecf2'); g.globalAlpha = 1; }
  if (fondo === 'sismo') for (let i = 0; i < 6; i++) px(20 + i * 30, 82 + (i % 3), 14, 1, '#3a2a1a');
  if (fondo === 'marea') for (let x = 0; x < W; x += 2) px(x, 74 + Math.sin(x / 9 + t * 3) * 3, 2, 34, '#2f8fd8');
  if (fondo === 'jaurias') for (let i = 0; i < 5; i++) { const x = 30 + i * 32; px(x, 68, 2, 2, '#ff3030'); px(x + 4, 68, 2, 2, '#ff3030'); }
  if (fondo === 'apagon') { g.globalAlpha = 0.55; px(0, 0, W, H, '#000000'); g.globalAlpha = 1; }
  if (fondo === 'caidos') { g.globalAlpha = 0.35; px(0, 0, W, H, '#3a0a14'); g.globalAlpha = 1; }
  if (fondo === 'podio') for (let i = 0; i < 40; i++) px((i * 41 + k * (1 + (i % 3))) % W, (i * 17 + k * 2) % H, 2, 2, ['#ffd23c', '#e8325a', '#7cffcb', '#7fb4ff'][i % 4]);
}
export function FondoPixel({ fondo }: { fondo: Fondo }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const g = cv.getContext('2d')!; let id = 0, ultimo = 0;
    const cuadro = (ms: number) => { if (ms - ultimo > 90) { ultimo = ms; dibujar(g, fondo, ms / 1000); } if (!quieto()) id = requestAnimationFrame(cuadro); };
    dibujar(g, fondo, 0); if (!quieto()) id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, [fondo]);
  return <canvas ref={ref} class="ff8-fondo" width={192} height={108} aria-hidden="true" />;
}

// ───────── La escena: un «momento» a la vez ─────────
export type Momento = { tipo: 'cartel'; paso: number } | { tipo: 'evento'; paso: number; i: number } | { tipo: 'canon'; paso: number; i: number } | { tipo: 'silencio'; paso: number } | { tipo: 'fin' };
export function armarMomentos(pasos: PasoGala[]): Momento[] {
  const m: Momento[] = [];
  pasos.forEach((p, paso) => {
    m.push({ tipo: 'cartel', paso });
    if (p.tipo === 'caidos') { const con = p.lineas.filter((l) => l.tributos.length); if (con.length) con.forEach((_, i) => m.push({ tipo: 'canon', paso, i })); else m.push({ tipo: 'silencio', paso }); }
    else p.lineas.forEach((_, i) => m.push({ tipo: 'evento', paso, i }));
  });
  m.push({ tipo: 'fin' });
  return m;
}
/** Etapa (índice de paso) de un momento; el «fin» cuenta como la última. */
export const pasoDe = (m: Momento | undefined, pasos: PasoGala[]) => (!m || m.tipo === 'fin' ? pasos.length : m.paso);

const VEL = { lento: 7000, normal: 4500, rapido: 2500 } as const;
export type Velocidad = keyof typeof VEL;

interface PropsEscena {
  pasos: PasoGala[]; resultado: ResultadoGala; porId: Map<string, FichaTributo>; participantes: string[];
  cursor: number; mover: (d: number) => void; titulo: string; premio: string;
  paracaidas: { id: number; desde_paso: number; nombre: string; tributo: string; nivel: number }[];
  alFinal: ComponentChildren;
}
export function Escena({ pasos, resultado, porId, participantes, cursor, mover, titulo, premio, paracaidas, alFinal }: PropsEscena) {
  const momentos = useMemo(() => armarMomentos(pasos), [pasos]);
  const m = momentos[Math.min(cursor, momentos.length - 1)];
  const caja = useRef<HTMLDivElement>(null);
  const [letras, setLetras] = useState(0);
  const [suspenso, setSuspenso] = useState(false);
  const [auto, setAuto] = useState(false);
  const [vel, setVel] = useState<Velocidad>('normal');
  const [panel, setPanel] = useState(true);
  const [historial, setHistorial] = useState(false);
  const [zoom, setZoom] = useState(1);
  const nombre = (id: string) => porId.get(id)?.nombre ?? '—';

  // Muertos y estados hasta este momento (inclusive), para la barra y los retratos
  const { muertos, estados } = useMemo(() => {
    const muertos = new Set<string>(), estados = new Map<string, string[]>();
    for (let k = 0; k <= Math.min(cursor, momentos.length - 1); k++) {
      const x = momentos[k]; if (x.tipo !== 'evento') continue;
      const l = pasos[x.paso].lineas[x.i];
      for (const d of l.muertos) muertos.add(d);
      for (const s of l.estados ?? []) estados.set(s.id, [...(estados.get(s.id) ?? []), s.tipo]);
      for (const c of l.curados ?? []) estados.delete(c);
    }
    return { muertos, estados };
  }, [cursor, momentos]);
  const linea = m.tipo === 'evento' || m.tipo === 'canon' ? pasos[m.paso].lineas[m.i] : null;
  const texto = m.tipo === 'evento' ? linea!.texto : '';
  const fatal = m.tipo === 'evento' && linea!.muertos.length > 0;

  // Suspenso antes de una muerte y texto que se escribe letra por letra
  useEffect(() => {
    setLetras(quieto() ? texto.length : 0);
    if (fatal && !quieto()) { setSuspenso(true); const id = setTimeout(() => setSuspenso(false), 1100); return () => clearTimeout(id); }
    setSuspenso(false);
  }, [cursor]);
  useEffect(() => {
    if (suspenso || letras >= texto.length) return;
    const id = setTimeout(() => setLetras((x) => Math.min(texto.length, x + 2)), 24);
    return () => clearTimeout(id);
  }, [letras, suspenso, texto]);
  const escribiendo = m.tipo === 'evento' && (suspenso || letras < texto.length);
  const avanzar = () => { if (suspenso) { setSuspenso(false); return; } if (escribiendo) { setLetras(texto.length); return; } mover(1); };

  // Automático: cuando termina de escribirse, espera y avanza
  useEffect(() => {
    if (!auto || escribiendo || m.tipo === 'fin') return;
    const id = setTimeout(() => mover(1), m.tipo === 'cartel' ? Math.min(2500, VEL[vel]) : VEL[vel]);
    return () => clearTimeout(id);
  }, [auto, escribiendo, cursor, vel]);

  // Teclado: espacio, Enter y → avanzan; ← retrocede; A automático; P pausa; H panel; F pantalla completa; + y − zoom
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.tagName === 'SELECT') return;
      if (ev.key === ' ' || ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); avanzar(); }
      else if (ev.key === 'ArrowLeft') mover(-1);
      else if (ev.key === 'a' || ev.key === 'A') setAuto(true);
      else if (ev.key === 'p' || ev.key === 'P') setAuto(false);
      else if (ev.key === 'h' || ev.key === 'H') setPanel((x) => !x);
      else if (ev.key === 'f' || ev.key === 'F') pantallaCompleta();
      else if (ev.key === '+') setZoom((z) => Math.min(1.6, z + 0.1));
      else if (ev.key === '-') setZoom((z) => Math.max(0.7, z - 0.1));
    };
    addEventListener('keydown', tecla); return () => removeEventListener('keydown', tecla);
  });
  const pantallaCompleta = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else caja.current?.requestFullscreen?.().catch(() => {}); };

  const paso = m.tipo === 'fin' ? null : pasos[m.paso];
  const fondo: Fondo = m.tipo === 'fin' ? 'podio' : paso!.tipo === 'arena' ? escenarioDe.get(paso!.titulo) ?? 'dia' : paso!.tipo;
  const vivosAhora = participantes.filter((id) => !muertos.has(id)).length;
  // Cuántos quedaban después de este cañonazo
  // Los muertos ya cayeron durante la noche: se cuenta hacia atrás desde los cañonazos que faltan en esta lista
  const quedanTrasCanon = m.tipo === 'canon' ? vivosAhora + pasos[m.paso].lineas.filter((l) => l.tributos.length).length - (m.i + 1) : 0;
  const resaltar = (txt: string, ids: string[]) => {
    const nombres = ids.map(nombre).sort((a, b) => b.length - a.length);
    if (!nombres.length) return txt;
    const re = new RegExp(`(${nombres.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return txt.split(re).map((parte, i) => (nombres.includes(parte) ? <b key={i}>{parte}</b> : parte));
  };
  const lluvia = paracaidas.filter((p) => p.desde_paso === (m.tipo === 'fin' ? -1 : m.paso) && m.tipo === 'cartel');
  const vistos = paso && paso.tipo !== 'caidos' && m.tipo === 'evento' ? paso.lineas.slice(0, m.i) : [];

  // Momentos destacados para el podio
  const masElim = Object.entries(resultado.eliminaciones).sort((a, b) => b[1] - a[1])[0];
  const heridas = new Map<string, number>();
  for (const p of pasos) for (const l of p.lineas) for (const s of l.estados ?? []) heridas.set(s.id, (heridas.get(s.id) ?? 0) + 1);
  const porfiado = [...heridas].filter(([id]) => resultado.top3.includes(id)).sort((a, b) => b[1] - a[1])[0];

  return (
    <div ref={caja} class={`ff8-escena${panel ? '' : ' transmision'}`} style={`--ff8-zoom:${zoom}`}
      onClick={(ev) => { if ((ev.target as HTMLElement).closest('button, select, label, .ff8-panel, .ff8-historial')) return; avanzar(); }}
      onContextMenu={(ev) => { ev.preventDefault(); avanzar(); }}>
      <FondoPixel fondo={fondo} />
      <div class="ff8-cabecera"><span>{titulo}</span><span>Vivos: <b>{m.tipo === 'fin' ? 1 : m.tipo === 'canon' ? quedanTrasCanon : vivosAhora}</b> / {participantes.length}</span></div>

      <div class="ff8-centro" aria-live="polite">
        {m.tipo === 'cartel' && paso && (
          <div class={`ff8-cartel ff8-${paso.tipo}`}>
            <h2>{paso.tipo === 'caidos' ? 'Cañonazos' : paso.titulo}</h2>
            {paso.tipo === 'caidos' && <p>{paso.titulo.replace('Cañonazos · ', '')}</p>}
            {paso.intro && <p class="ff8-intro">{paso.intro}</p>}
            {lluvia.map((p) => <p key={p.id} class="ff8-paracaidas">🪂 Paracaídas de {p.nombre} para <b>{nombre(p.tributo)}</b>{p.nivel === 2 ? ' (grande)' : ''}</p>)}
          </div>
        )}
        {m.tipo === 'evento' && linea && (
          <>
            {vistos.length > 0 && <ul class="ff8-previos">{vistos.slice(-2).map((l, i) => <li key={i}>{l.texto}</li>)}</ul>}
            <div class="ff8-caras">{linea.tributos.map((id) => <Retrato key={id} t={porId.get(id)} tam={96} muerto={!suspenso && !escribiendo && linea.muertos.includes(id)} activo estados={estados.get(id) ?? []} />)}</div>
            <div class={`ff8-dialogo${fatal ? ' fatal' : ''}`}>
              {suspenso ? <p class="ff8-suspenso">. . .</p> : <p>{resaltar(texto.slice(0, letras), linea.tributos)}{escribiendo && <span class="ff8-cursor">▌</span>}</p>}
              {!escribiendo && (linea.objetos ?? []).map((o) => <p key={o.id + o.objeto} class="ff8-extra">🎒 {nombre(o.id)} consigue: {o.objeto}</p>)}
            </div>
          </>
        )}
        {m.tipo === 'canon' && linea && (
          <div class="ff8-canon">
            <p class="ff8-boom">💥 BOOM</p>
            <Retrato t={porId.get(linea.tributos[0])} tam={140} muerto />
            <h2>{nombre(linea.tributos[0])}</h2>
            <p>{porId.get(linea.tributos[0])?.distrito}</p>
            <p class="ff8-quedan">Quedan {quedanTrasCanon} tributos</p>
          </div>
        )}
        {m.tipo === 'silencio' && <div class="ff8-canon"><h2>Silencio</h2><p>Esta noche no sonó ningún cañonazo.</p></div>}
        {m.tipo === 'fin' && (
          <div class="ff8-podio">
            <p class="ff8-corona">👑</p>
            <Retrato t={porId.get(resultado.ganador)} tam={170} />
            <h2>{nombre(resultado.ganador)}</h2>
            <p>{porId.get(resultado.ganador)?.distrito} · premio: <b>{premio}</b></p>
            <ol class="ff8-top">{resultado.top3.slice(1).map((id, i) => <li key={id} value={i + 2}><Retrato t={porId.get(id)} tam={48} muerto /> {nombre(id)}</li>)}</ol>
            <ul class="ff8-destacados">
              {masElim && <li>⚔️ Más eliminaciones: <b>{nombre(masElim[0])}</b> ({masElim[1]})</li>}
              {resultado.caidas[0] && <li>🕯️ Primer caído: <b>{nombre(resultado.caidas[0])}</b></li>}
              {porfiado && <li>🩹 El más porfiado: <b>{nombre(porfiado[0])}</b> (sobrevivió a {porfiado[1]} {porfiado[1] === 1 ? 'herida' : 'heridas'})</li>}
            </ul>
            {alFinal}
          </div>
        )}
      </div>

      <div class="ff8-barra" aria-label="Tributos">
        {participantes.map((id) => <Retrato key={id} t={porId.get(id)} tam={40} muerto={muertos.has(id)} activo={!!linea?.tributos.includes(id)} estados={estados.get(id) ?? []} />)}
      </div>

      {panel && (
        <div class="ff8-panel">
          <button class="boton" disabled={cursor === 0} onClick={() => mover(-1)}>← Atrás</button>
          <button class="boton principal" disabled={m.tipo === 'fin'} onClick={avanzar}>Siguiente →</button>
          <button class="boton" aria-pressed={auto} onClick={() => setAuto(!auto)}>{auto ? 'Pausa (P)' : 'Automático (A)'}</button>
          <select value={vel} onChange={(ev) => setVel(ev.currentTarget.value as Velocidad)} aria-label="Velocidad"><option value="lento">Lento</option><option value="normal">Normal</option><option value="rapido">Rápido</option></select>
          <button class="boton" onClick={() => setHistorial(!historial)}>Historial</button>
          <button class="boton" onClick={pantallaCompleta}>Pantalla completa (F)</button>
          <span class="chico">Clic o clic derecho avanza · H esconde este panel · + y − tamaño</span>
        </div>
      )}
      {historial && paso && (
        <aside class="ff8-historial"><h3>{paso.titulo}</h3><ol>{paso.lineas.slice(0, m.tipo === 'evento' ? m.i + 1 : paso.lineas.length).map((l, i) => <li key={i}>{l.texto}</li>)}</ol></aside>
      )}
    </div>
  );
}

// ───────── Presentación tipo «selección de personaje» ─────────
export function Presentacion8({ tributos }: { tributos: FichaTributo[] }) {
  const [i, setI] = useState(0);
  const t = tributos[Math.min(i, tributos.length - 1)];
  const max = { puntos: Math.max(1, ...tributos.map((x) => x.puntos)), ganados: Math.max(1, ...tributos.map((x) => x.ganados)), primeros: Math.max(1, ...tributos.map((x) => x.primeros)) };
  const sig = () => setI((x) => Math.min(tributos.length - 1, x + 1)), ant = () => setI((x) => Math.max(0, x - 1));
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'ArrowRight' || ev.key === ' ') { ev.preventDefault(); sig(); } if (ev.key === 'ArrowLeft') ant(); };
    addEventListener('keydown', tecla); return () => removeEventListener('keydown', tecla);
  }, [tributos.length]);
  if (!t) return null;
  const barra = (v: number, m: number) => <span class="ff8-barrita" aria-hidden="true">{Array.from({ length: 10 }, (_, k) => <i key={k} class={k < Math.round((v / m) * 10) ? 'lleno' : ''} />)}</span>;
  return (
    <div class="ff8-escena ff8-presentacion" onClick={(ev) => { if (!(ev.target as HTMLElement).closest('button')) sig(); }} onContextMenu={(ev) => { ev.preventDefault(); sig(); }}>
      <FondoPixel fondo="noche" />
      <div class="ff8-cabecera"><span>Presentación de tributos</span><span>{i + 1} / {tributos.length}</span></div>
      <div class="ff8-centro">
        <div class="ff8-ficha">
          <Retrato t={t} tam={180} />
          <div>
            <h2>{t.nombre}</h2>
            <p>Distrito de origen: <b>{t.distrito}</b></p>
            <p class="ff8-titulo">«{t.titulo}»</p>
            <dl class="ff8-stats">
              <dt>Puntos</dt><dd>{barra(t.puntos, max.puntos)} {t.puntos.toLocaleString('es-CL')}</dd>
              <dt>Duelos</dt><dd>{barra(t.ganados, max.ganados)} {t.ganados}/{t.jugados}</dd>
              <dt>Récords</dt><dd>{barra(t.primeros, max.primeros)} {t.primeros}</dd>
              {t.atributo && <><dt>Fuerte</dt><dd>{t.atributo}</dd></>}
            </dl>
          </div>
        </div>
      </div>
      <div class="ff8-panel"><button class="boton" disabled={i === 0} onClick={ant}>← Anterior</button><button class="boton principal" disabled={i >= tributos.length - 1} onClick={sig}>Siguiente →</button><span class="chico">Clic, clic derecho o flechas</span></div>
    </div>
  );
}
