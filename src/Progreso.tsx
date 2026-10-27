import { Tsukibet } from './Tsukibet';
import { useEffect, useRef, useState } from 'preact/hooks';
import { supabase, useSesion } from './nucleo/supabase';
import { juegoPorId } from './juegos/catalogo';
import {
  NIVELES, PREMIOS, cargarDatos, datosDeMuestra, experiencia, guardarVitrina, limpiarVitrina, logros, premio, semana, vitrinaLocal, vitrinas, vitrinasActivas,
  type Categoria, type Datos, type Experiencia, type Logro, type Premio, type Semana, type Vitrina,
} from './juegos/progreso';

// Progreso de cada participante: el pase de temporada (niveles y premios), los logros con su porcentaje,
// el resumen de la semana para compartir en Discord y la tabla de adivinos de los duelos en vivo.

const PESTANAS = [
  { ruta: 'pase', titulo: 'Pase de temporada' },
  { ruta: 'logros', titulo: 'Logros' },
  { ruta: 'semana', titulo: 'Mi semana' },
  { ruta: 'tsukibet', titulo: 'TSUKIBET' },
  { ruta: 'adivinos', titulo: 'Adivinos' },
];
const SITIO = 'https://panchoso3234.github.io/sustolimpiadas/';

/** Nombre con su marco y título del pase (se usa también en perfiles y tablas). */
export function Firma({ nombre, vitrina }: { nombre: string; vitrina?: Vitrina | null }) {
  const t = premio('titulo', vitrina?.titulo);
  return <span class={`firma${vitrina?.marco ? ` marco-${vitrina.marco}` : ''}`}><b>{nombre}</b>{t && <small>{t.icono} {t.nombre}</small>}</span>;
}

export function Progreso({ sub }: { sub: string }) {
  const sesion = useSesion(), pestana = PESTANAS.some((p) => p.ruta === sub) ? sub : 'pase';
  const [datos, setDatos] = useState<Datos | null>(null);
  const [vit, setVit] = useState<Vitrina>(vitrinaLocal);
  const muestra = import.meta.env.DEV && new URLSearchParams(location.search).has('muestra');
  useEffect(() => { if (muestra) setDatos(datosDeMuestra()); }, []);
  useEffect(() => {
    if (!sesion.usuarioId || muestra) return;
    let vigente = true;
    Promise.all([cargarDatos(sesion.usuarioId), vitrinas()]).then(([d, todas]) => { if (!vigente) return; setDatos(d); const mia = todas.get(d.id); if (mia) setVit(mia); });
    return () => { vigente = false; };
  }, [sesion.usuarioId]);

  const lista = datos ? logros(datos) : [], ganados = lista.filter((x) => x.tiene).length, xp = datos ? experiencia(datos, ganados) : null;
  // La vitrina guarda el nivel y los logros al día, para que la casa y el perfil los muestren
  useEffect(() => {
    if (!datos || !xp || !sesion.usuarioId || (vit.nivel === xp.nivel && vit.logros === ganados)) return;
    const nueva = limpiarVitrina({ ...vit, nivel: xp.nivel, logros: ganados, deco: vit.deco.length ? vit.deco : PREMIOS.filter((p) => p.tipo === 'deco' && p.nivel <= xp.nivel).map((p) => p.id) });
    setVit(nueva);
    guardarVitrina(sesion.usuarioId, nueva);
  }, [datos]);

  return (
    <div class="pagina progreso">
      <div class="sigla">Progreso</div>
      <h1>Tu temporada</h1>
      <nav class="modos" aria-label="Secciones del progreso">
        {PESTANAS.map((p) => <a key={p.ruta} href={`#/progreso/${p.ruta}`} class={pestana === p.ruta ? 'activa' : ''}>{p.titulo}</a>)}
      </nav>
      {pestana === 'tsukibet' ? <Tsukibet />
        : pestana === 'adivinos' ? <Adivinos usuarioId={sesion.usuarioId} />
        : !sesion.usuarioId && !muestra ? <p class="aviso atencion">Entra con Discord para ver tu pase, tus logros y tu semana: se calculan de las partidas guardadas en la tabla.</p>
        : !datos || !xp ? <p class="tenue">Calculando tu progreso…</p>
        : pestana === 'logros' ? <Logros lista={lista} />
        : pestana === 'semana' ? <MiSemana s={semana(datos, lista)} nombre={datos.nombre} vit={vit} xp={xp} ganados={ganados} total={lista.length} />
        : <Pase xp={xp} vit={vit} nombre={datos.nombre} cambiar={(v) => { setVit(v); guardarVitrina(sesion.usuarioId, v); }} />}
    </div>
  );
}

// ───────── Pase ─────────
const TIPO: Record<Premio['tipo'], string> = { titulo: 'Título', marco: 'Marco', deco: 'Para tu casa', efecto: 'Efecto al ganar' };

function Pase({ xp, vit, nombre, cambiar }: { xp: Experiencia; vit: Vitrina; nombre: string; cambiar(v: Vitrina): void }) {
  const [guardado, setGuardado] = useState('');
  const usar = (p: Premio) => {
    const v = { ...vit, nivel: Math.max(vit.nivel, xp.nivel) };
    if (p.tipo === 'deco') v.deco = vit.deco.includes(p.id) ? vit.deco.filter((x) => x !== p.id) : [...vit.deco, p.id];
    else v[p.tipo] = vit[p.tipo] === p.id ? null : p.id;
    cambiar(limpiarVitrina(v));
    setGuardado(vitrinasActivas() ? 'Guardado: así te ven los demás.' : 'Guardado en este navegador. Los demás lo verán cuando el organizador active la vitrina.');
  };
  const enUso = (p: Premio) => (p.tipo === 'deco' ? vit.deco.includes(p.id) : vit[p.tipo] === p.id);
  const lleno = xp.nivel >= NIVELES;
  return (
    <>
      <section class="bloque pase-cabeza">
        <div class="pase-nivel"><span>Nivel</span><b>{xp.nivel}</b><span>de {NIVELES}</span></div>
        <div class="pase-barra-caja">
          <div class="pase-barra"><span style={`width:${lleno ? 100 : Math.round((xp.enNivel / xp.paraSubir) * 100)}%`} /></div>
          <p class="chico">{lleno ? '¡Pase completo! Eres de lo mejor del torneo.' : <>Te faltan <b>{xp.paraSubir - xp.enNivel}</b> de experiencia para el nivel {xp.nivel + 1}.</>} · {xp.total} en total</p>
          <div class="pase-desglose">{xp.desglose.map(([k, v]) => <span key={k}>{k}: <b>{v}</b></span>)}</div>
        </div>
        <div class="pase-vista"><span class="chico tenue">Así te ven:</span><Firma nombre={nombre} vitrina={vit} /></div>
      </section>
      <details class="bloque como-ganar">
        <summary>¿Cómo se gana experiencia?</summary>
        <ul class="lista">
          <li><b>Cada partida:</b> 10, y hasta 30 más según qué tan buena fue tu marca (cuentan hasta 15 partidas por juego al día).</li>
          <li><b>Cada día que juegas:</b> 20 · <b>cada juego nuevo que pruebas:</b> 40.</li>
          <li><b>Duelos:</b> 15 por jugarlos y 60 más por ganarlos.</li>
          <li><b>Cada logro:</b> 50. Revisa la pestaña Logros.</li>
        </ul>
      </details>
      {guardado && <p class="aviso ok">{guardado}</p>}
      <ol class="pase-niveles">
        {PREMIOS.map((p) => {
          const abierto = p.nivel <= xp.nivel;
          return (
            <li key={p.nivel} class={`${abierto ? 'abierto' : ''}${enUso(p) ? ' en-uso' : ''}${p.nivel === xp.nivel + 1 ? ' proximo' : ''}`}>
              <span class="pase-num">{p.nivel}</span>
              <span class="pase-icono" aria-hidden="true">{abierto ? p.icono : '🔒'}</span>
              <b>{p.nombre}</b>
              <span class="chico tenue">{TIPO[p.tipo]}</span>
              {p.tipo === 'marco' && <span class={`firma mini marco-${p.id}`}><b>Aa</b></span>}
              {abierto ? <button class={`boton${enUso(p) ? ' principal' : ''}`} onClick={() => usar(p)}>{enUso(p) ? (p.tipo === 'deco' ? 'En tu casa ✓' : 'En uso ✓') : p.tipo === 'deco' ? 'Poner en mi casa' : 'Usar'}</button>
                : <span class="chico tenue">Nivel {p.nivel}</span>}
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ───────── Logros ─────────
const ORDEN: Categoria[] = ['Primeros pasos', 'Constancia', 'Duelos y fantasmas', 'Hazañas', 'Expertos', 'Secretos'];

function Logros({ lista }: { lista: Logro[] }) {
  const [filtro, setFiltro] = useState<'todos' | 'tiene' | 'falta'>('todos');
  const ganados = lista.filter((x) => x.tiene).length, pct = Math.round((ganados / lista.length) * 100);
  return (
    <>
      <section class="bloque logros-cabeza">
        <div class="logros-anillo" style={`--pct:${pct}`}><b>{pct}%</b></div>
        <div>
          <h2>{ganados} de {lista.length} logros</h2>
          <p class="tenue">{pct >= 100 ? '¡Los tienes todos! Eres leyenda.' : pct >= 50 ? 'Vas más que a la mitad. ¡A completarlos!' : 'Cada logro da 50 de experiencia para el pase. Algunos son secretos: descúbrelos jugando.'}</p>
          <div class="pestanas">
            {([['todos', 'Todos'], ['tiene', 'Obtenidos'], ['falta', 'Por conseguir']] as const).map(([k, t]) => <button key={k} class={filtro === k ? 'activa' : ''} onClick={() => setFiltro(k)}>{t}</button>)}
          </div>
        </div>
      </section>
      {ORDEN.map((cat) => {
        const deCat = lista.filter((x) => x.categoria === cat), visibles = deCat.filter((x) => filtro === 'todos' || (filtro === 'tiene') === x.tiene);
        if (!visibles.length) return null;
        return (
          <section class="bloque" key={cat}>
            <h2>{cat} <span class="tenue chico">{deCat.filter((x) => x.tiene).length}/{deCat.length}</span></h2>
            <ul class="logros">
              {visibles.map((x) => {
                const oculto = x.secreto && !x.tiene;
                return <li key={x.id} class={x.tiene ? 'tiene' : ''}><span class="logro-icono" aria-hidden="true">{oculto ? '❓' : x.icono}</span><b>{oculto ? 'Logro secreto' : x.nombre}</b><span>{oculto ? 'Sigue jugando para descubrirlo.' : x.como}</span></li>;
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}

// ───────── Mi semana (tarjeta para compartir) ─────────
function dibujarTarjeta(cv: HTMLCanvasElement, s: Semana, nombre: string, vit: Vitrina, xp: Experiencia, ganados: number, total: number) {
  const W = 1080, H = 1350, g = cv.getContext('2d')!;
  cv.width = W; cv.height = H;
  const fondo = g.createLinearGradient(0, 0, W, H); fondo.addColorStop(0, '#1b1238'); fondo.addColorStop(0.55, '#3a1f4a'); fondo.addColorStop(1, '#7a3a1a');
  g.fillStyle = fondo; g.fillRect(0, 0, W, H);
  // Luna y estrellas
  g.fillStyle = 'rgba(255,240,200,0.12)'; g.beginPath(); g.arc(880, 190, 170, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(880, 190, 95, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + ((i * 37) % 10) / 15})`; g.fillRect((i * 173) % W, (i * 97) % 520, 3, 3); }
  const texto = (t: string, x: number, y: number, tam: number, color: string, fuente = 'Nunito', peso = 800, alinear: CanvasTextAlign = 'left') => { g.font = `${peso} ${tam}px "${fuente}", sans-serif`; g.fillStyle = color; g.textAlign = alinear; g.fillText(t, x, y); };
  texto('LAS SUSTOLIMPIADAS', 70, 110, 34, '#ffe08a', 'Graduate', 400);
  texto('Mi semana', 70, 200, 92, '#ff9a2e', 'Alfa Slab One', 400);
  texto(nombre.slice(0, 24), 70, 290, 64, '#f3ecdc');
  const t = premio('titulo', vit.titulo);
  texto(t ? `${t.icono} ${t.nombre}` : `Nivel ${xp.nivel} del pase`, 70, 345, 36, '#a9b6d6', 'Nunito', 600);
  const corta = (f: string) => f.split('-').reverse().slice(0, 2).join('/');
  texto(`Del ${corta(s.desde)} al ${corta(s.hasta)}`, 70, 400, 30, '#a9b6d6', 'Nunito', 600);
  // Cifras en tarjetas
  const cifras: [string, string][] = [[String(s.partidas), 'partidas'], [String(s.juegos), 'juegos distintos'], [String(s.dias), 'días jugados'], [String(s.racha), 'días seguidos']];
  cifras.forEach(([n, que], i) => {
    const x = 70 + (i % 2) * 480, y = 450 + Math.floor(i / 2) * 210;
    g.fillStyle = 'rgba(20,32,58,0.72)'; g.beginPath(); g.roundRect(x, y, 450, 180, 28); g.fill();
    texto(n, x + 36, y + 110, 88, '#ffe08a', 'Alfa Slab One', 400); texto(que, x + 36, y + 155, 32, '#f3ecdc', 'Nunito', 700);
  });
  const fila = (y: number, etiqueta: string, valor: string) => { texto(etiqueta, 70, y, 30, '#a9b6d6', 'Nunito', 700); texto(valor.slice(0, 36), 70, y + 48, 44, '#f3ecdc'); };
  fila(930, 'Juego favorito', s.favorito ? juegoPorId(s.favorito)?.nombre ?? s.favorito : '—');
  fila(1035, 'Mejor marca', s.mejor ? `${s.mejor.puntaje} en ${juegoPorId(s.mejor.juego)?.nombre ?? s.mejor.juego}` : '—');
  texto(`⚔️ ${s.ganados}/${s.duelos} duelos ganados`, 600, 965, 34, '#f3ecdc', 'Nunito', 700);
  texto(`🏅 ${ganados}/${total} logros${s.nuevosLogros ? ` (+${s.nuevosLogros})` : ''}`, 600, 1025, 34, '#f3ecdc', 'Nunito', 700);
  texto(`🎃 Nivel ${xp.nivel} del pase`, 600, 1085, 34, '#f3ecdc', 'Nunito', 700);
  // Barra del pase y pie
  g.fillStyle = 'rgba(20,32,58,0.8)'; g.beginPath(); g.roundRect(70, 1150, 940, 30, 15); g.fill();
  g.fillStyle = '#ff9a2e'; g.beginPath(); g.roundRect(70, 1150, Math.max(30, 940 * (xp.nivel >= NIVELES ? 1 : xp.enNivel / xp.paraSubir)), 30, 15); g.fill();
  texto('¿Me superas? panchoso3234.github.io/sustolimpiadas', W / 2, 1270, 32, '#ffe08a', 'Nunito', 800, 'center');
}

function MiSemana({ s, nombre, vit, xp, ganados, total }: { s: Semana; nombre: string; vit: Vitrina; xp: Experiencia; ganados: number; total: number }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState(''), [aviso, setAviso] = useState('');
  useEffect(() => {
    if (!lienzo.current) return;
    document.fonts.ready.then(() => { if (!lienzo.current) return; dibujarTarjeta(lienzo.current, s, nombre, vit, xp, ganados, total); setImg(lienzo.current.toDataURL('image/png')); });
  }, [s.partidas, vit.titulo, xp.nivel]);
  const texto = `🎃 Mi semana en Las Sustolimpiadas\n🎮 ${s.partidas} partidas en ${s.juegos} juegos · 📅 ${s.dias} días\n⭐ Favorito: ${s.favorito ? juegoPorId(s.favorito)?.nombre ?? s.favorito : '—'}\n🏆 Mejor marca: ${s.mejor ? `${s.mejor.puntaje} en ${juegoPorId(s.mejor.juego)?.nombre ?? s.mejor.juego}` : '—'}\n⚔️ Duelos ganados: ${s.ganados}/${s.duelos} · 🏅 Logros: ${ganados}/${total} · Nivel ${xp.nivel} del pase\n${SITIO}`;
  const copiarImagen = async () => {
    try {
      const blob = await new Promise<Blob | null>((r) => lienzo.current!.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob! })]);
      setAviso('Imagen copiada: pégala en Discord con Ctrl+V.');
    } catch { setAviso('Tu navegador no deja copiar imágenes: usa Descargar.'); }
  };
  const copiarTexto = async () => { try { await navigator.clipboard.writeText(texto); setAviso('Texto copiado: pégalo en Discord.'); } catch { setAviso('No se pudo copiar.'); } };
  return (
    <section class="bloque semana">
      <p>Tu resumen de los últimos 7 días, listo para presumir en Discord. Se actualiza cada vez que juegas.</p>
      <canvas ref={lienzo} hidden />
      {img ? <img class="semana-tarjeta" src={img} alt={`Resumen de la semana de ${nombre}: ${s.partidas} partidas en ${s.juegos} juegos`} /> : <p class="tenue">Dibujando tu tarjeta…</p>}
      <div class="fila">
        <button class="boton principal" onClick={copiarImagen}>Copiar imagen</button>
        <a class="boton" href={img} download={`mi-semana-${s.hasta}.png`}>Descargar</a>
        <button class="boton" onClick={copiarTexto}>Copiar como texto</button>
      </div>
      {aviso && <p class="aviso ok">{aviso}</p>}
    </section>
  );
}

// ───────── Adivinos ─────────
interface Adivino { perfil_id: string; nombre: string; calabazas: number; aciertos: number; jugadas: number }

function Adivinos({ usuarioId }: { usuarioId: string | null }) {
  const [filas, setFilas] = useState<Adivino[] | null>(null), [mias, setMias] = useState<number | null>(null), [falta, setFalta] = useState(false);
  useEffect(() => {
    supabase.rpc('adivinos').then(({ data, error }) => { if (error) setFalta(true); setFilas((data as Adivino[] | null) ?? []); });
    if (usuarioId) supabase.rpc('saldo_calabazas', { p_uid: usuarioId }).then(({ data }) => { if (typeof data === 'number') setMias(data); });
  }, [usuarioId]);
  return (
    <>
      <section class="bloque">
        <h2>🔮 Adivinos</h2>
        <p>Cuando mires un duelo en vivo, antes de que parta puedes <b>predecir quién gana</b> apostando calabazas (son de mentira: no hay dinero de por medio). Todos parten con <b>100 🎃</b>. Si aciertas, ganas lo que apostaste; si fallas, lo pierdes; en empate se devuelve.</p>
        {mias !== null && <p class="aviso ok">Tienes <b>{mias} 🎃</b>.</p>}
        {falta && <p class="aviso atencion">Las predicciones todavía no están activadas en la base de datos (el organizador tiene que activarlas una vez).</p>}
      </section>
      <section class="bloque">
        <h2>Tabla de adivinos</h2>
        {!filas ? <p class="tenue">Cargando…</p> : !filas.length ? <p class="tenue">Nadie ha predicho todavía. ¡Mira un duelo en vivo y sé el primero!</p> : (
          <ol class="marcas">{filas.map((f, i) => <li key={f.perfil_id} class={f.perfil_id === usuarioId ? 'mia' : ''}><span class="puesto">{i + 1}</span><a class="quien" href={`#/perfil/${f.perfil_id}`}>{f.nombre}</a><b>{f.calabazas} 🎃</b><span class="torneo">{f.aciertos}/{f.jugadas} aciertos</span></li>)}</ol>
        )}
      </section>
    </>
  );
}
