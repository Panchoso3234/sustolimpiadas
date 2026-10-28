import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { supabase, useSesion } from './nucleo/supabase';
import { BANNERS, ECONOMIA, OBJETOS, TASAS, objeto, pozo, type Banner, type Objeto, type Pieza } from '../supabase/functions/_shared/gachapon.ts';
import { Avatar, COLOR_RAREZA, Muestra, Nombre, PIEZAS, Portada, avisarVitrina, vitrinasGacha, type VitrinaG } from './gacha/cosmeticos';
import { Carita } from './personaje/Carita';

// Gachapón (modelo Hoyoverse): banners de evento por tiempo limitado, uno permanente y uno de principiante. Las protogemas
// se ganan jugando (misiones del día, niveles del pase, logros, duelos, TSUKIBET) y se canjean por deseos (160 = 1).
// Todo se decide en el servidor: la función "gachapon" calcula y acredita; gacha_tirar elige el premio con su pity.

interface Billetera { protogemas: number; deseos: number; polvo: number }
interface Mision { id: string; texto: string; va: number; meta: number; hecha: boolean; cobrada: boolean; protogemas: number }
interface Estado { nivel: number; xp: number; enNivel: number; paraSubir: number; billetera: Billetera; misiones: Mision[]; bonoMisiones: { protogemas: number; cobrado: boolean }; porCobrar: { motivo: string; texto: string; protogemas?: number; deseos?: number }[]; cobrado: Estado['porCobrar'] }
interface Contador { grupo: string; pity5: number; pity4: number; garantizado5: boolean; garantizado4: boolean; total: number }
interface Tirada { objeto: string; rareza: number; numero: number | null; nuevo: boolean; destacado: boolean }
const PESTANAS = [['', 'Deseos'], ['misiones', 'Misiones'], ['tienda', 'Tienda'], ['coleccion', 'Colección'], ['estilo', 'Mi estilo'], ['historial', 'Historial']] as const;
const miles = (n: number) => Math.round(n).toLocaleString('es-CL');
const estrellas = (n: number) => '★'.repeat(n);

function falta(hasta: string, ahora: number) {
  const ms = Date.parse(hasta) - ahora;
  if (ms <= 0) return 'terminó';
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
  return d > 60 ? 'permanente' : d >= 1 ? `termina en ${d} d ${h} h` : `termina en ${h} h ${Math.floor((ms % 36e5) / 6e4)} min`;
}

export function Gachapon({ sub }: { sub: string }) {
  const sesion = useSesion(), yo = sesion.usuarioId;
  const pestana = PESTANAS.some(([k]) => k === sub) ? sub : '';
  const [estado, setEstado] = useState<Estado | null>(null), [error, setError] = useState(''), [ocupado, setOcupado] = useState(false);
  const [contadores, setContadores] = useState<Contador[]>([]), [inventario, setInventario] = useState<Map<string, number>>(new Map());
  const [vit, setVit] = useState<VitrinaG | null>(null), [toast, setToast] = useState(''), [ahora, setAhora] = useState(Date.now());
  const [tirada, setTirada] = useState<Tirada[] | null>(null);

  const llamar = async (accion: 'estado' | 'reclamar') => {
    const { data, error } = await supabase.functions.invoke('gachapon', { body: { accion } });
    if (error || data?.error) { setError(data?.error ?? 'El Gachapón todavía no está activado.'); return null; }
    setError(''); setEstado(data as Estado); return data as Estado;
  };
  const cargarMio = async () => {
    if (!yo) return;
    const [c, i, v] = await Promise.all([
      supabase.from('gacha_estado').select('grupo,pity5,pity4,garantizado5,garantizado4,total').eq('perfil_id', yo),
      supabase.from('gacha_inventario').select('objeto_id,cantidad').eq('perfil_id', yo),
      vitrinasGacha(true),
    ]);
    setContadores((c.data as Contador[] | null) ?? []);
    setInventario(new Map(((i.data ?? []) as { objeto_id: string; cantidad: number }[]).map((x) => [x.objeto_id, x.cantidad])));
    setVit(v.get(yo) ?? null);
  };
  useEffect(() => { if (yo) { llamar('estado'); cargarMio(); } }, [yo]);
  useEffect(() => { const r = setInterval(() => setAhora(Date.now()), 30_000); return () => clearInterval(r); }, []);
  const avisar = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3500); };

  const reclamar = async () => {
    setOcupado(true);
    const e = await llamar('reclamar');
    setOcupado(false);
    if (e?.cobrado.length) {
      const p = e.cobrado.reduce((s, x) => s + (x.protogemas ?? 0), 0), d = e.cobrado.reduce((s, x) => s + (x.deseos ?? 0), 0);
      avisar(`Recibiste ${p ? `${miles(p)} protogemas` : ''}${p && d ? ' y ' : ''}${d ? `${d} ${d === 1 ? 'deseo' : 'deseos'}` : ''}.`);
    }
  };
  const canjear = async (origen: 'protogemas' | 'polvo', cantidad: number) => {
    const { error } = await supabase.rpc('gacha_canjear', { p_origen: origen, p_cantidad: cantidad });
    if (error) return avisar(error.message);
    avisar(`Canjeaste ${cantidad} ${cantidad === 1 ? 'deseo' : 'deseos'}.`);
    await llamar('estado');
  };
  const tirar = async (b: Banner, cantidad: 1 | 10) => {
    setOcupado(true);
    const { data, error } = await supabase.rpc('gacha_tirar', { p_banner: b.id, p_cantidad: cantidad });
    setOcupado(false);
    if (error) return avisar(error.message);
    setTirada((data as { resultados: Tirada[] }).resultados);
    llamar('estado'); cargarMio();
  };
  const equipar = async (pieza: Pieza, id: string | null) => {
    const { error } = await supabase.rpc('gacha_equipar', { p_pieza: pieza, p_objeto: id });
    if (error) return avisar(error.message);
    avisarVitrina(); await cargarMio();
  };

  const b = estado?.billetera, porCobrar = estado?.porCobrar ?? [];
  const cobrar = { p: porCobrar.reduce((s, x) => s + (x.protogemas ?? 0), 0), d: porCobrar.reduce((s, x) => s + (x.deseos ?? 0), 0) };
  return (
    <div class="pagina gacha">
      <header class="gacha-cabeza">
        <h1 class="gacha-titulo">Gachapón</h1>
        {b && <div class="gacha-monedas">
          <span class="gacha-moneda proto" title="Protogemas: 160 = 1 deseo"><i aria-hidden="true">◆</i>{miles(b.protogemas)}</span>
          <span class="gacha-moneda deseo" title="Deseos: para tirar en el Gachapón"><i aria-hidden="true">✦</i>{miles(b.deseos)}</span>
          <span class="gacha-moneda polvo" title="Polvo estelar: 5 = 1 deseo"><i aria-hidden="true">✧</i>{miles(b.polvo)}</span>
        </div>}
      </header>
      <nav class="modos" aria-label="Secciones del Gachapón">
        {PESTANAS.map(([k, t]) => <a key={k} href={`#/gachapon${k ? `/${k}` : ''}`} class={pestana === k ? 'activa' : ''}>{t}{k === 'misiones' && porCobrar.length > 0 && <i class="globo">{porCobrar.length}</i>}</a>)}
      </nav>
      {!yo && <p class="aviso atencion">Entra con Discord para tener tu Gachapón: misiones, deseos y tu colección.</p>}
      {yo && error && <p class="aviso atencion">{error}</p>}
      {toast && <p class="gacha-toast" role="status">{toast}</p>}
      {yo && porCobrar.length > 0 && pestana !== 'misiones' && (
        <button class="gacha-reclamar-flotante" onClick={reclamar} disabled={ocupado}>Reclamar {cobrar.p ? `${miles(cobrar.p)} ◆` : ''}{cobrar.p && cobrar.d ? ' + ' : ''}{cobrar.d ? `${cobrar.d} ✦` : ''}</button>
      )}

      {pestana === '' && <Deseos ahora={ahora} b={b} contadores={contadores} tirar={tirar} canjear={canjear} ocupado={ocupado} yo={yo} />}
      {pestana === 'misiones' && yo && estado && <Misiones e={estado} reclamar={reclamar} ocupado={ocupado} />}
      {pestana === 'tienda' && yo && b && <Tienda b={b} canjear={canjear} />}
      {pestana === 'coleccion' && <Coleccion inventario={inventario} />}
      {pestana === 'estilo' && yo && <MiEstilo inventario={inventario} vit={vit} equipar={equipar} yo={yo} nombre={sesion.perfil?.nombre ?? 'Tú'} />}
      {pestana === 'historial' && yo && <Historial yo={yo} />}
      {tirada && <Animacion resultados={tirada} cerrar={() => setTirada(null)} cara={yo ? <Carita perfil={yo} tam={64} /> : undefined} nombre={sesion.perfil?.nombre ?? 'Tú'} />}
    </div>
  );
}

// ───────── Deseos: banners ─────────
function Deseos({ ahora, b, contadores, tirar, canjear, ocupado, yo }: { ahora: number; b?: Billetera; contadores: Contador[]; tirar: (b: Banner, n: 1 | 10) => void; canjear: (o: 'protogemas', n: number) => void; ocupado: boolean; yo: string | null }) {
  const activos = BANNERS.filter((x) => Date.parse(x.desde) <= ahora && ahora < Date.parse(x.hasta));
  const [elegido, setElegido] = useState(activos[0]?.id ?? 'firmamento'), [detalles, setDetalles] = useState(false);
  const ban = activos.find((x) => x.id === elegido) ?? activos[0];
  if (!ban) return <p class="tenue">No hay banners abiertos.</p>;
  const c = contadores.find((x) => x.grupo === ban.grupo), p = pozo(ban);
  const quedanPrincipiante = ban.grupo === 'principiante' ? ECONOMIA.principianteMax - (c?.total ?? 0) : null;
  const costo10 = ban.grupo === 'principiante' ? ECONOMIA.principianteCosto10 : 10;
  const pide = async (n: 1 | 10) => {
    const costo = n === 10 ? costo10 : 1, faltan = costo - (b?.deseos ?? 0);
    if (faltan > 0) {
      if ((b?.protogemas ?? 0) >= faltan * ECONOMIA.precioDeseo && confirm(`Te faltan ${faltan} ${faltan === 1 ? 'deseo' : 'deseos'}. ¿Canjear ${miles(faltan * ECONOMIA.precioDeseo)} protogemas?`)) { await canjear('protogemas', faltan); return tirar(ban, n); }
      return alert(`Te faltan ${faltan} ${faltan === 1 ? 'deseo' : 'deseos'}. Juega tus misiones del día o canjea en la Tienda.`);
    }
    tirar(ban, n);
  };
  const proximo = BANNERS.filter((x) => x.grupo === 'evento' && Date.parse(x.desde) > ahora).sort((x, y) => Date.parse(x.desde) - Date.parse(y.desde))[0];
  return (
    <>
      <div class="gacha-selector" role="tablist">
        {activos.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === ban.id} class={`gacha-pestana${x.id === ban.id ? ' activa' : ''}`} style={`--c1:${x.c[0]};--c2:${x.c[1]}`} onClick={() => setElegido(x.id)}>
            <small>{x.grupo === 'evento' ? 'Evento' : x.grupo === 'permanente' ? 'Permanente' : 'Principiante'}</small>{x.nombre}
          </button>
        ))}
      </div>
      <section class={`gacha-banner ${ban.grupo}`} style={`--c1:${ban.c[0]};--c2:${ban.c[1]};--c3:${ban.c[2]}`}>
        <div class="gacha-banner-texto">
          <span class="gacha-etiqueta">{ban.grupo === 'evento' ? 'Deseo de evento · tiempo limitado' : ban.grupo === 'permanente' ? 'Deseo permanente' : 'Deseo de principiante'}</span>
          <h2>{ban.nombre}</h2>
          <p class="gacha-lema">{ban.lema}</p>
          {p.destacado5 && <p><b class="r5">{estrellas(5)} {p.destacado5.nombre}</b><br /><span class="chico">{p.destacado5.descripcion}</span></p>}
          {ban.grupo === 'permanente' && <p class="chico">5★ posibles: {p.cinco.map((o) => o.nombre).join(' · ')}</p>}
          {p.destacados4.length > 0 && <p class="chico"><b class="r4">{estrellas(4)} destacados:</b> {p.destacados4.map((o) => o.nombre).join(' · ')}</p>}
          <p class="chico gacha-reloj">{falta(ban.hasta, ahora)}</p>
        </div>
        <div class="gacha-banner-arte">{p.destacado5 ? <Muestra o={p.destacado5} nombre="Tu nombre" /> : <Muestra o={p.cinco[Math.floor(ahora / 6e4) % p.cinco.length]} nombre="Tu nombre" />}</div>
      </section>
      {yo && <div class="gacha-pity">
        <span>Deseos desde tu último 5★: <b>{c?.pity5 ?? 0}</b> / 90</span>
        {ban.grupo === 'evento' && <span>{c?.garantizado5 ? <b class="r5">El próximo 5★ es el destacado (garantizado)</b> : '50/50 en el próximo 5★'}</span>}
        <span>4★ asegurado en {10 - (c?.pity4 ?? 0)}</span>
        {quedanPrincipiante !== null && <span>Te quedan <b>{quedanPrincipiante}</b> de 20</span>}
      </div>}
      <div class="gacha-acciones">
        <button class="boton" onClick={() => setDetalles(true)}>Detalles</button>
        <a class="boton" href="#/gachapon/historial">Historial</a>
        <span class="gacha-espacio" />
        <button class="gacha-tirar" disabled={!yo || ocupado || quedanPrincipiante === 0} onClick={() => pide(1)}><b>Deseo ×1</b><small>✦ 1</small></button>
        <button class="gacha-tirar diez" disabled={!yo || ocupado || (quedanPrincipiante !== null && quedanPrincipiante < 10)} onClick={() => pide(10)}><b>Deseo ×10</b><small>✦ {costo10}{costo10 < 10 ? ' (descuento)' : ''}</small></button>
      </div>
      {proximo && <p class="tenue chico">Próximo banner: <b>{proximo.nombre}</b> desde el {new Date(proximo.desde).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}, con {objeto(proximo.destacado5)?.nombre}.</p>}
      {detalles && <Detalles ban={ban} cerrar={() => setDetalles(false)} />}
    </>
  );
}

function Detalles({ ban, cerrar }: { ban: Banner; cerrar: () => void }) {
  const p = pozo(ban), pct = (x: number) => `${(x * 100).toFixed(3).replace('.', ',')} %`;
  return (
    <div class="gacha-modal" role="dialog" aria-label="Detalles del banner" onClick={cerrar}>
      <div class="gacha-modal-caja" onClick={(e) => e.stopPropagation()}>
        <button class="boton gacha-cerrar" onClick={cerrar} aria-label="Cerrar">×</button>
        <h2>{ban.nombre} · probabilidades</h2>
        <table class="tabla"><tbody>
          <tr><th class="r5">5★</th><td>Base {pct(TASAS.base5)} · consolidada 1,600 % (incluye la garantía)</td></tr>
          <tr><th class="r4">4★</th><td>Base {pct(TASAS.base4)} · consolidada 13,000 %</td></tr>
          <tr><th class="r3">3★</th><td>Base 94,300 % · consolidada 85,400 %</td></tr>
        </tbody></table>
        <ul>
          <li>Garantizas un 5★ como máximo cada <b>90</b> deseos. Desde el deseo 74, la probabilidad sube 6 % en cada deseo.</li>
          <li>Garantizas un objeto 4★ o superior cada <b>10</b> deseos.</li>
          {ban.grupo === 'evento' && <li>Cada 5★ tiene 50 % de ser el destacado (<b>{p.destacado5?.nombre}</b>). Si no lo es, el siguiente 5★ <b>será el destacado</b>. Lo mismo con los 4★ destacados.</li>}
          <li>Los contadores se guardan entre banners del mismo tipo (todos los de evento comparten el suyo).</li>
          <li>Cada 4★ te da 5 de polvo estelar y cada 5★ te da 20. Con 5 de polvo canjeas 1 deseo en la Tienda.</li>
          {ban.grupo === 'principiante' && <li>Solo 20 deseos por persona: 10 cuestan 8.</li>}
        </ul>
        <h3>Lo que puede salir</h3>
        {[...(p.destacado5 ? [p.destacado5] : []), ...p.cinco, ...p.destacados4, ...p.cuatro.filter((o) => !ban.destacados4.includes(o.id)), ...p.tres].map((o) => (
          <span key={o.id} class={`gacha-chip r${o.rareza}${o.id === ban.destacado5 || ban.destacados4.includes(o.id) ? ' destacado' : ''}`}>{estrellas(o.rareza)} {o.nombre}</span>
        ))}
      </div>
    </div>
  );
}

// ───────── La animación del deseo: estrella fugaz del color de la mejor rareza, y luego cada objeto ─────────
function Animacion({ resultados, cerrar, cara, nombre }: { resultados: Tirada[]; cerrar: () => void; cara?: ComponentChildren; nombre: string }) {
  const mejor = Math.max(...resultados.map((r) => r.rareza));
  const [fase, setFase] = useState<'cielo' | number | 'resumen'>('cielo');
  useEffect(() => { if (fase === 'cielo') { const t = setTimeout(() => setFase(0), mejor === 5 ? 3200 : 2400); return () => clearTimeout(t); } }, [fase]);
  const siguiente = () => {
    if (fase === 'cielo') return setFase(0);
    if (typeof fase === 'number') return setFase(fase + 1 < resultados.length ? fase + 1 : resultados.length > 1 ? 'resumen' : (cerrar(), 'resumen'));
    cerrar();
  };
  const r = typeof fase === 'number' ? resultados[fase] : null, o = r ? objeto(r.objeto) : null;
  return (
    <div class={`gacha-deseo m${mejor}`} onClick={siguiente} role="dialog" aria-label="Resultado del deseo">
      <button class="boton gacha-saltar" onClick={(e) => { e.stopPropagation(); setFase(resultados.length > 1 ? 'resumen' : 0); }}>Saltar</button>
      {fase === 'cielo' && (
        <div class="gacha-cielo" aria-hidden="true">
          {Array.from({ length: 40 }, (_, i) => <i key={i} class="astro" style={`--x:${(i * 37) % 100};--y:${(i * 53) % 100};--d:${i % 7}`} />)}
          {resultados.slice(0, resultados.length > 1 ? 5 : 1).map((_, i) => <span key={i} class="fugaz" style={`--i:${i}`} />)}
        </div>
      )}
      {r && o && (
        <div key={fase} class={`gacha-revela r${r.rareza}`} style={`--rc:${COLOR_RAREZA[r.rareza]}`}>
          <div class="gacha-estallido" aria-hidden="true" />
          <div class="gacha-revela-arte"><Muestra o={o} nombre={nombre} cara={cara} /></div>
          <div class="gacha-revela-texto">
            <span class="gacha-estrellas">{estrellas(r.rareza)}</span>
            <h2>{o.nombre}</h2>
            <p class="chico">{o.descripcion}</p>
            <p class="chico">{r.nuevo ? <b class="gacha-nuevo">NUEVO</b> : 'Repetido'}{r.rareza >= 4 ? ` · +${r.rareza === 5 ? ECONOMIA.polvo5 : ECONOMIA.polvo4} polvo estelar` : ''}{r.destacado ? ' · ¡Destacado!' : ''}{r.numero ? ` · deseo ${r.numero}` : ''}</p>
            <p class="tenue chico">Toca para seguir · {(fase as number) + 1} de {resultados.length}</p>
          </div>
        </div>
      )}
      {fase === 'resumen' && (
        <div class="gacha-resumen">
          {[...resultados].sort((a, b) => b.rareza - a.rareza).map((t, i) => { const x = objeto(t.objeto)!; return (
            <div key={i} class={`gacha-carta r${t.rareza}`} style={`--rc:${COLOR_RAREZA[t.rareza]};--i:${i}`}>
              <span class="gacha-carta-arte"><Muestra o={x} nombre={nombre} /></span><span class="gacha-estrellas">{estrellas(t.rareza)}</span><b>{x.nombre}</b>{t.nuevo && <small class="gacha-nuevo">NUEVO</small>}
            </div>
          ); })}
          <p class="tenue chico gacha-cerrar-resumen">Toca para cerrar</p>
        </div>
      )}
    </div>
  );
}

// ───────── Misiones y recompensas ─────────
function Misiones({ e, reclamar, ocupado }: { e: Estado; reclamar: () => void; ocupado: boolean }) {
  const hechas = e.misiones.filter((m) => m.hecha).length;
  return (
    <>
      <section class="bloque gacha-nivel">
        <h2>Pase de temporada · nivel {e.nivel} de 50</h2>
        <div class="gacha-barra"><i style={`width:${Math.min(100, (e.enNivel / Math.max(1, e.paraSubir)) * 100)}%`} /></div>
        <p class="chico tenue">{miles(e.enNivel)} / {miles(e.paraSubir)} de experiencia para el nivel {Math.min(50, e.nivel + 1)}. Cada nivel da {ECONOMIA.nivel} protogemas (cada 5 niveles, {ECONOMIA.nivelHito}). La experiencia sale de jugar.</p>
      </section>
      <section class="bloque">
        <h2>Misiones de hoy · {hechas} de {e.misiones.length}</h2>
        <ul class="gacha-misiones">{e.misiones.map((m) => (
          <li key={m.id} class={m.hecha ? 'hecha' : ''}>
            <span>{m.texto}</span>
            <span class="gacha-progreso"><i style={`width:${(m.va / m.meta) * 100}%`} /></span>
            <small>{m.va}/{m.meta}</small>
            <b class="proto">◆ {m.protogemas}{m.cobrada ? ' ✓' : ''}</b>
          </li>
        ))}
          <li class={hechas === e.misiones.length ? 'hecha bono' : 'bono'}><span>Completa las {e.misiones.length} misiones</span><span /><small /><b class="proto">◆ {e.bonoMisiones.protogemas}{e.bonoMisiones.cobrado ? ' ✓' : ''}</b></li>
        </ul>
        <p class="tenue chico">Las misiones cambian cada día a las 00:00 (hora de Chile). Al día: {miles(ECONOMIA.mision * ECONOMIA.misionesPorDia + ECONOMIA.bonoMisiones)} protogemas, o sea 5 deseos.</p>
      </section>
      <section class="bloque">
        <h2>Por reclamar</h2>
        {!e.porCobrar.length ? <p class="tenue">Nada pendiente. Juega, sube de nivel, gana duelos y acierta en TSUKIBET.</p> : (
          <>
            <ul class="gacha-recompensas">{e.porCobrar.slice(0, 30).map((p) => <li key={p.motivo}><span>{p.texto}</span><b>{p.protogemas ? `◆ ${miles(p.protogemas)}` : ''}{p.deseos ? ` ✦ ${p.deseos}` : ''}</b></li>)}</ul>
            {e.porCobrar.length > 30 && <p class="tenue chico">Y {e.porCobrar.length - 30} más.</p>}
            <button class="gacha-tirar diez" onClick={reclamar} disabled={ocupado}><b>Reclamar todo</b></button>
          </>
        )}
      </section>
      <section class="bloque">
        <h2>Cómo se ganan</h2>
        <ul class="chico">
          <li>Misiones del día: {ECONOMIA.mision} cada una y {ECONOMIA.bonoMisiones} si completas todas.</li>
          <li>Subir un nivel del pase: {ECONOMIA.nivel} protogemas ({ECONOMIA.nivelHito} en los niveles 5, 10, 15…).</li>
          <li>Logros: de 100 a 320 protogemas según la dificultad (los secretos dan más).</li>
          <li>Ganar un duelo oficial: {ECONOMIA.dueloGanadoDeseos} deseos.</li>
          <li>TSUKIBET: {ECONOMIA.aciertoTsukibet} protogemas por acierto y {ECONOMIA.plenoDeseos} deseos si aciertas todo el cruce.</li>
          <li>Regalo de inauguración: {ECONOMIA.bienvenidaDeseos} deseos.</li>
        </ul>
      </section>
    </>
  );
}

// ───────── Tienda ─────────
function Tienda({ b, canjear }: { b: Billetera; canjear: (o: 'protogemas' | 'polvo', n: number) => void }) {
  const fila = (origen: 'protogemas' | 'polvo', precio: number, simbolo: string, nombre: string, saldo: number) => (
    <article class="gacha-oferta">
      <span class="gacha-oferta-icono" aria-hidden="true">✦</span>
      <div><b>Deseo</b><p class="chico tenue">{precio} {nombre} = 1 deseo. Tienes {miles(saldo)}.</p></div>
      <div class="fila">
        <button class="boton" disabled={saldo < precio} onClick={() => canjear(origen, 1)}>×1 · {simbolo} {precio}</button>
        <button class="boton principal" disabled={saldo < precio * 10} onClick={() => canjear(origen, 10)}>×10 · {simbolo} {miles(precio * 10)}</button>
        <button class="boton" disabled={saldo < precio} onClick={() => canjear(origen, Math.min(100, Math.floor(saldo / precio)))}>Todo ({Math.min(100, Math.floor(saldo / precio))})</button>
      </div>
    </article>
  );
  return (
    <section class="bloque">
      <h2>Tienda estelar</h2>
      {fila('protogemas', ECONOMIA.precioDeseo, '◆', 'protogemas', b.protogemas)}
      {fila('polvo', ECONOMIA.polvoPorDeseo, '✧', 'de polvo estelar', b.polvo)}
      <p class="tenue chico">No hay nada que comprar con dinero, ni ahora ni nunca: todo se gana jugando.</p>
    </section>
  );
}

// ───────── Colección ─────────
function Coleccion({ inventario }: { inventario: Map<string, number> }) {
  const series = [...new Set(OBJETOS.map((o) => o.serie))];
  const tengo = OBJETOS.filter((o) => inventario.has(o.id)).length;
  return (
    <>
      <section class="bloque"><h2>Tu colección · {tengo} de {OBJETOS.length} ({Math.round((tengo / OBJETOS.length) * 100)} %)</h2><div class="gacha-barra"><i style={`width:${(tengo / OBJETOS.length) * 100}%`} /></div></section>
      {series.map((s) => {
        const de = OBJETOS.filter((o) => o.serie === s).sort((a, b) => b.rareza - a.rareza), n = de.filter((o) => inventario.has(o.id)).length;
        return (
          <section key={s} class="bloque">
            <h2>{s} <span class="tenue chico">{n} de {de.length}</span></h2>
            <div class="gacha-album">{de.map((o) => <Ficha key={o.id} o={o} tiene={inventario.get(o.id) ?? 0} />)}</div>
          </section>
        );
      })}
    </>
  );
}
function Ficha({ o, tiene, onClick, puesto }: { o: Objeto; tiene: number; onClick?: () => void; puesto?: boolean }) {
  return (
    <button class={`gacha-ficha r${o.rareza}${tiene ? '' : ' silueta'}${puesto ? ' puesto' : ''}`} style={`--rc:${COLOR_RAREZA[o.rareza]}`} onClick={onClick} disabled={!onClick} title={o.descripcion}>
      <span class="gacha-ficha-arte">{tiene ? <Muestra o={o} /> : <span class="gacha-interrogante">?</span>}</span>
      <span class="gacha-estrellas">{estrellas(o.rareza)}</span>
      <b>{tiene || o.rareza < 5 ? o.nombre : '???'}</b>
      {tiene > 1 && <small>×{tiene}</small>}
      {o.exclusivo && <small class="tenue">Exclusivo de evento</small>}
    </button>
  );
}

// ───────── Mi estilo: ponerse lo que uno tiene ─────────
function MiEstilo({ inventario, vit, equipar, yo, nombre }: { inventario: Map<string, number>; vit: VitrinaG | null; equipar: (p: Pieza, id: string | null) => void; yo: string; nombre: string }) {
  const [pieza, setPieza] = useState<Pieza>('marco');
  const mios = OBJETOS.filter((o) => inventario.has(o.id) && o.piezas.includes(pieza));
  const v = vit ?? ({ perfil_id: yo, nivel: 1 } as VitrinaG);
  return (
    <>
      <section class="bloque gacha-espejo">
        <h2>Así te ven</h2>
        <MuestraPropia v={v} nombre={nombre} yo={yo} />
      </section>
      <nav class="modos" aria-label="Pieza">{PIEZAS.map((p) => <button key={p.pieza} class={pieza === p.pieza ? 'activa' : ''} onClick={() => setPieza(p.pieza)}>{p.nombre}</button>)}</nav>
      <section class="bloque">
        {!mios.length ? <p class="tenue">Todavía no tienes objetos para esta pieza. ¡A pedir deseos!</p> : (
          <div class="gacha-album">
            <button class={`gacha-ficha${!v[pieza] ? ' puesto' : ''}`} onClick={() => equipar(pieza, null)}><span class="gacha-ficha-arte"><span class="gacha-interrogante">∅</span></span><b>Nada</b></button>
            {mios.map((o) => <Ficha key={o.id} o={o} tiene={inventario.get(o.id)!} puesto={v[pieza] === o.id} onClick={() => equipar(pieza, o.id)} />)}
          </div>
        )}
      </section>
    </>
  );
}
function MuestraPropia({ v, nombre, yo }: { v: VitrinaG; nombre: string; yo: string }) {
  return (
    <Portada id={v.portada}>
      <span class="gx-muestra-perfil"><Avatar v={v} enLinea tam={64}><Carita perfil={yo} tam={64} /></Avatar><Nombre v={v} nombre={nombre} titulo /><span class="gacha-nivel-chip">Nv {v.nivel}</span></span>
    </Portada>
  );
}

// ───────── Historial ─────────
function Historial({ yo }: { yo: string }) {
  const [filas, setFilas] = useState<{ banner_id: string; objeto_id: string; rareza: number; numero: number | null; creado: string }[] | null>(null);
  useEffect(() => { supabase.from('gacha_tiradas').select('banner_id,objeto_id,rareza,numero,creado').eq('perfil_id', yo).order('id', { ascending: false }).limit(200).then(({ data }) => setFilas((data as typeof filas) ?? [])); }, [yo]);
  if (!filas) return <p class="tenue">Cargando…</p>;
  return (
    <section class="bloque">
      <h2>Historial de deseos</h2>
      {!filas.length ? <p class="tenue">Todavía no pides ningún deseo.</p> : (
        <table class="tabla gacha-historial"><thead><tr><th>Objeto</th><th>Rareza</th><th>Banner</th><th>Fecha</th></tr></thead><tbody>
          {filas.map((f, i) => <tr key={i} class={`r${f.rareza}`}><td>{objeto(f.objeto_id)?.nombre ?? f.objeto_id}{f.numero && f.rareza === 5 ? ` (deseo ${f.numero})` : ''}</td><td>{estrellas(f.rareza)}</td><td>{BANNERS.find((x) => x.id === f.banner_id)?.nombre ?? f.banner_id}</td><td>{new Date(f.creado).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td></tr>)}
        </tbody></table>
      )}
    </section>
  );
}
