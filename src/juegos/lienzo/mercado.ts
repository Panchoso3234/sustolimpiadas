import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { desdeTexto, type Sprite } from './pixel';

// Mercado Loco (04-11), idea propia: por una cinta de la feria pasan productos y hay que arrastrar cada uno a su canasto
// (frutas, verduras, pescado, pan o huevos) antes de que se caiga al final. Con el teclado: los números 1 a 5 mandan
// el producto que va más adelante (el marcado) a ese canasto. Los clientes piden pedidos ("2 paltas y 1 marraqueta");
// lo que ordenas va sumando al pedido y completarlo da propina (más si es rápido). Hora punta (cinta rápida y puntaje
// doble), huevos que se rompen si los arrastras brusco, el casero que regatea (pedido doble), el gato que se roba el
// pescado (tócalo para espantarlo), pregones en pantalla y, en el nivel 3, canastos que cambian de lugar.
// Puntaje: 10 por producto bien puesto (con racha), pedidos y propinas; los errores restan. 3 minutos.
// Todo sale de la semilla: en un duelo, la misma cinta, los mismos pedidos y los mismos gatos.

const W = 640, H = 720, DURA = 180, CINTA_Y = 300, CANASTO_Y = 560;
type Grupo = 'frutas' | 'verduras' | 'pescado' | 'pan' | 'huevos';
const GRUPOS: Grupo[] = ['frutas', 'verduras', 'pescado', 'pan', 'huevos'];
const NOMBRE_GRUPO: Record<Grupo, string> = { frutas: 'Frutas', verduras: 'Verduras', pescado: 'Pescado', pan: 'Pan', huevos: 'Huevos' };
type Clase = 'palta' | 'manzana' | 'platano' | 'tomate' | 'choclo' | 'lechuga' | 'reineta' | 'jurel' | 'marraqueta' | 'hallulla' | 'huevo';
const PRODUCTOS: Record<Clase, { grupo: Grupo; nombre: string; plural: string }> = {
  palta: { grupo: 'frutas', nombre: 'palta', plural: 'paltas' }, manzana: { grupo: 'frutas', nombre: 'manzana', plural: 'manzanas' }, platano: { grupo: 'frutas', nombre: 'plátano', plural: 'plátanos' },
  tomate: { grupo: 'frutas', nombre: 'tomate', plural: 'tomates' }, choclo: { grupo: 'verduras', nombre: 'choclo', plural: 'choclos' }, lechuga: { grupo: 'verduras', nombre: 'lechuga', plural: 'lechugas' },
  reineta: { grupo: 'pescado', nombre: 'reineta', plural: 'reinetas' }, jurel: { grupo: 'pescado', nombre: 'jurel', plural: 'jureles' },
  marraqueta: { grupo: 'pan', nombre: 'marraqueta', plural: 'marraquetas' }, hallulla: { grupo: 'pan', nombre: 'hallulla', plural: 'hallullas' },
  huevo: { grupo: 'huevos', nombre: 'huevo', plural: 'huevos' },
};
const CLASES = Object.keys(PRODUCTOS) as Clase[];
const PREGONES = ['¡A luca la palta, casera!', '¡Lleve, lleve, que se acaba!', '¡Tomates de verdad, no de supermercado!', '¡La reineta fresquita!', '¡Marraqueta calentita!', '¡Tres por mil, casero!', '¡Aproveche, que mañana sube!', '¡Choclo pa\' la humita!'];
interface Producto { id: number; clase: Clase; x: number; y: number; agarrado: boolean; robado: boolean }
interface Pedido { items: { clase: Clase; falta: number; total: number }[]; doble: boolean; desde: number; hasta: number }

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'mercado', { fondo: '#ffe3a8', pixel: () => 3 });
  const musica = crearMusica(m.mesa, 132);
  musica.acordes([[62, 66, 69], [67, 71, 74], [64, 67, 71], [69, 73, 76]]);
  const bot = piloto();
  const r = generador(`${c.semilla}|mercado`);

  // ── Estado ──
  let productos: Producto[] = [], ids = 0, proximo = 0.8, orden: Grupo[] = [...GRUPOS];
  let fase: 'juego' | 'fin' = 'juego', puntos = 0, bien = 0, mal = 0, caidos = 0, rotos = 0, robados = 0, pedidos = 0, propinas = 0, racha = 0, mejorRacha = 0;
  let pedido: Pedido | null = null, proximoPedido = 4, punta = { desde: 45, hasta: 0 }, nivel = 1, proximoCambio = 0;
  let gato: { x: number; meta: number | null; huye: boolean; hasta: number } | null = null, proximoGato = 35, pregon = { texto: '', hasta: 0 }, proximoPregon = 8;
  let arrastre: { p: Producto; dx: number; dy: number; ultimo: [number, number, number] } | null = null;
  const prueba = { perdidos: 0, fuera: 0 };
  const enPunta = () => m.tiempo >= punta.desde && m.tiempo < punta.hasta;
  const velocidadCinta = () => (70 + Math.min(70, m.tiempo * 0.35)) * (enPunta() ? 1.7 : 1);
  const xCanasto = (g: Grupo) => (orden.indexOf(g) + 0.5) * (W / 5);

  const nuevoPedido = () => {
    const doble = m.tiempo > 50 && r() < 0.25, n = 1 + Math.floor(r() * (m.tiempo > 90 ? 3 : 2)), items: Pedido['items'] = [];
    for (let i = 0; i < n; i++) { const clase = CLASES[Math.floor(r() * CLASES.length)], cant = (1 + Math.floor(r() * 2)) * (doble ? 2 : 1); const ya = items.find((x) => x.clase === clase); if (ya) { ya.falta += cant; ya.total += cant; } else items.push({ clase, falta: cant, total: cant }); }
    pedido = { items, doble, desde: m.tiempo, hasta: m.tiempo + (doble ? 40 : 28) };
    m.mesa.hud.aviso(doble ? 'El casero regatea: ¡pedido doble, propina doble!' : 'Nuevo pedido', doble ? 'oro' : '', 1.2);
  };
  /** Lo que más pide el cliente sale más seguido en la cinta (así el pedido siempre se puede completar). */
  const claseAlAzar = (): Clase => {
    const falta = pedido?.items.filter((x) => x.falta > 0) ?? [];
    if (falta.length && r() < 0.45) return falta[Math.floor(r() * falta.length)].clase;
    return CLASES[Math.floor(r() * CLASES.length)];
  };

  // ── Poner un producto en un canasto (lo usan el arrastre, el teclado y los bots) ──
  function poner(p: Producto, g: Grupo) {
    productos = productos.filter((x) => x !== p);
    const e = PRODUCTOS[p.clase], [sx, sy] = aPantalla(xCanasto(g), CANASTO_Y - 30);
    if (e.grupo !== g) { mal++; racha = 0; sumar(-15, sx, sy, '#e8325a'); m.mesa.sonido.mal(); m.efectos.temblar(5); return; }
    bien++; racha++; mejorRacha = Math.max(mejorRacha, racha);
    sumar((10 + Math.min(10, Math.floor(racha / 5) * 2)) * (enPunta() ? 2 : 1), sx, sy, '#3fa34d');
    m.efectos.chispas(sx, sy, ['#ffd23c', '#ffffff', '#3fa34d'], 8, 200);
    m.mesa.sonido.tono(660 + Math.min(8, racha) * 40, 0.08, 'square', 0.04);
    const item = pedido?.items.find((x) => x.clase === p.clase && x.falta > 0);
    if (item && pedido) {
      item.falta--;
      if (pedido.items.every((x) => x.falta === 0)) {
        const rapidez = Math.max(0, 1 - (m.tiempo - pedido.desde) / (pedido.hasta - pedido.desde)), propina = Math.round(20 + 40 * rapidez) * (pedido.doble ? 2 : 1);
        pedidos++; propinas += propina; sumar(50 * (pedido.doble ? 2 : 1) + propina, m.ancho / 2, 150, '#ffd23c');
        m.mesa.hud.aviso(`¡Pedido listo! Propina ${propina}`, 'oro', 1.4); m.mesa.sonido.bien(); pedido = null; proximoPedido = m.tiempo + 2;
      }
    }
  }
  function sumar(n: number, x: number, y: number, color: string) { puntos = Math.max(0, puntos + n); m.efectos.flotar(x, y, n > 0 ? `+${n}` : `${n}`, color, 24); }
  /** El producto que va más adelante en la cinta (el que se cae primero). */
  const primero = () => productos.filter((p) => !p.agarrado && !p.robado).reduce<Producto | null>((a, b) => (!a || b.x > a.x ? b : a), null);

  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    const t = m.tiempo;
    if (!c.libre && t >= DURA) { terminar('Cerró la feria'); return; }
    // Niveles: 1 (tranquilo), 2 (más rápido) y 3 (canastos que cambian de lugar)
    const nuevoNivel = t >= 120 ? 3 : t >= 60 ? 2 : 1;
    if (nuevoNivel !== nivel) { nivel = nuevoNivel; m.mesa.hud.aviso(nivel === 3 ? 'Nivel 3: ¡los canastos cambian de lugar!' : `Nivel ${nivel}`, 'oro', 1.6); proximoCambio = t + 3; }
    if (nivel === 3 && t >= proximoCambio) { proximoCambio = t + 15; for (let i = orden.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; } m.mesa.hud.aviso('¡Se movieron los canastos!', 'mal', 1); m.efectos.temblar(4); }
    // Hora punta cada 45 s, por 12 s
    if (t >= punta.desde && punta.hasta < punta.desde) { punta.hasta = t + 12; m.mesa.hud.aviso('¡HORA PUNTA! Cinta rápida, puntaje doble', 'oro', 1.6); }
    if (punta.hasta > punta.desde && t >= punta.hasta) punta = { desde: t + 33, hasta: 0 };
    // Cinta
    if (t >= proximo) {
      productos.push({ id: ids++, clase: claseAlAzar(), x: -30, y: CINTA_Y, agarrado: false, robado: false });
      proximo = t + Math.max(0.55, 1.5 - t * 0.005) / (enPunta() ? 1.8 : 1) * (0.8 + r() * 0.4);
    }
    const v = velocidadCinta();
    for (const p of productos) if (!p.agarrado) {
      if (p.robado) { p.y -= 30 * dt; continue; }
      p.x += v * dt;
      if (p.y !== CINTA_Y) p.y += Math.sign(CINTA_Y - p.y) * Math.min(Math.abs(CINTA_Y - p.y), 400 * dt);
    }
    for (const p of productos) if (!p.agarrado && !p.robado && p.x > W + 20) { caidos++; racha = 0; sumar(-10, aPantalla(W - 30, CINTA_Y)[0], aPantalla(0, CINTA_Y - 40)[1], '#e8325a'); m.mesa.sonido.tono(140, 0.15, 'sawtooth', 0.05); }
    productos = productos.filter((p) => p.agarrado || (p.robado ? p.y > CINTA_Y - 60 : p.x <= W + 20));
    for (const p of productos) if (p.x < -60 || p.y < 0 || p.y > H) prueba.fuera++;
    // Pedidos
    if (!pedido && t >= proximoPedido) nuevoPedido();
    if (pedido && t >= pedido.hasta) { m.mesa.hud.aviso('El cliente se aburrió y se fue', 'mal', 1.2); pedido = null; proximoPedido = t + 3; }
    // El gato: entra por la derecha, va por un pescado de la cinta y se lo lleva (tócalo para espantarlo)
    if (!gato && t >= proximoGato) { gato = { x: W + 40, meta: null, huye: false, hasta: t + 14 }; proximoGato = t + 25 + r() * 15; m.mesa.hud.aviso('¡Ojo! Viene el gato por el pescado', 'mal', 1.2); }
    if (gato) {
      const pez = productos.find((p) => p.id === gato!.meta) ?? productos.filter((p) => PRODUCTOS[p.clase].grupo === 'pescado' && !p.agarrado && !p.robado).sort((a, b) => b.x - a.x)[0];
      gato.meta = pez?.id ?? null;
      if (gato.huye || t > gato.hasta) gato.x += 260 * dt;
      else if (pez) { const d = pez.x - gato.x; gato.x += Math.sign(d) * Math.min(Math.abs(d), 150 * dt); if (Math.abs(d) < 12 && !pez.agarrado) { pez.robado = true; robados++; racha = 0; sumar(-15, ...aPantalla(pez.x, CINTA_Y - 50), '#e8325a'); gato.huye = true; m.mesa.sonido.tono(700, 0.1, 'sawtooth', 0.05); m.mesa.sonido.tono(500, 0.15, 'sawtooth', 0.05, 0.1); } }
      else gato.x += (W - 60 - gato.x) * Math.min(1, dt);
      if (gato.x > W + 60 && (gato.huye || t > gato.hasta)) gato = null;
    }
    // Pregones (solo de adorno)
    if (t >= proximoPregon) { pregon = { texto: PREGONES[Math.floor(Math.random() * PREGONES.length)], hasta: t + 3 }; proximoPregon = t + 12 + Math.random() * 8; }
    // Arrastre: el producto sigue al puntero; los huevos se rompen si se mueven muy brusco
    if (arrastre && !bot) {
      const [x, y] = aCampo(m.puntero.x, m.puntero.y), p = arrastre.p;
      p.x = x - arrastre.dx; p.y = y - arrastre.dy;
      // La rapidez se mide cada 0,08 s (el mouse avisa a 60 por segundo y la física corre a 120: medir cada paso la duplica)
      const [ux, uy, ut] = arrastre.ultimo, rapidez = t - ut >= 0.08 ? Math.hypot(x - ux, y - uy) / (t - ut) : 0;
      if (t - ut >= 0.08) arrastre.ultimo = [x, y, t];
      if (p.clase === 'huevo' && rapidez > 2600) { rotos++; racha = 0; productos = productos.filter((q) => q !== p); arrastre = null; sumar(-20, ...aPantalla(p.x, p.y), '#e8325a'); m.efectos.chispas(...aPantalla(p.x, p.y), ['#fff1c9', '#ffd23c'], 12, 220); m.mesa.hud.aviso('¡Se rompió el huevo! Con cuidado', 'mal', 1); m.mesa.sonido.mal(); }
    }
    if (bot) pilotar();
    m.mesa.hud.puntos(String(puntos));
    if (!c.libre) { const q = Math.max(0, DURA - t); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`Nv ${nivel}${racha >= 5 ? ` · racha ${racha}` : ''}${enPunta() ? ' · ×2' : ''}`);
  });

  // ── Mandos ──
  m.alTocar((x, y) => {
    if (bot || fase !== 'juego') return;
    const [cx, cy] = aCampo(x, y);
    if (gato && !gato.huye && Math.abs(cx - gato.x) < 50 && Math.abs(cy - (CINTA_Y - 40)) < 50) { gato.huye = true; sumar(10, x, y - 20, '#ffd23c'); m.mesa.hud.aviso('¡Fuera, gato!', 'oro', 0.8); m.mesa.sonido.tono(900, 0.08, 'square', 0.05); return; }
    const alcance = 40 / Math.max(0.4, esc()), p = productos.filter((q) => !q.robado && Math.hypot(q.x - cx, q.y - cy) < alcance).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    if (p) { p.agarrado = true; arrastre = { p, dx: cx - p.x, dy: cy - p.y, ultimo: [cx, cy, m.tiempo] }; }
  });
  m.alSoltar((x, y) => {
    if (!arrastre) return;
    const p = arrastre.p, [cx, cy] = aCampo(x, y); arrastre = null; p.agarrado = false;
    if (!productos.includes(p)) return;
    if (cy > CANASTO_Y - 90 && cx >= -10 && cx <= W + 10) { const g = orden[Math.max(0, Math.min(4, Math.floor(cx / (W / 5))))]; poner(p, g); } // fuera del puesto no cae en ningún canasto
    // Si no cae en un canasto, vuelve a la cinta donde quedó
  });
  m.alTecla((k) => { const n = Number(k); if (!bot && n >= 1 && n <= 5) { const p = primero(); if (p) poner(p, orden[n - 1]); } });

  // ── Bots: el bueno manda cada producto a su canasto apenas lo ve (y espanta al gato); el torpe tarda y se equivoca ──
  const rb = generador('bot-mercado');
  let botEspera = 1;
  function pilotar() {
    const torpe = bot === 'torpe';
    if (m.tiempo < botEspera) return;
    if (gato && !gato.huye && !torpe && gato.x < W) { gato.huye = true; botEspera = m.tiempo + 0.3; return; }
    const p = primero();
    if (!p || p.x < (torpe ? W * 0.55 : 40)) return;
    botEspera = m.tiempo + (torpe ? 0.7 + rb() * 0.9 : 0.42);
    const g = torpe && rb() < 0.18 ? GRUPOS[Math.floor(rb() * 5)] : PRODUCTOS[p.clase].grupo;
    poner(p, g);
  }

  // ── Dibujo ──
  const esc = () => Math.min(1, (m.ancho - 8) / W), origen = () => { const s = esc(); return [(m.ancho - W * s) / 2, (H - H * s) * 0.45] as const; };
  const aPantalla = (x: number, y: number) => { const s = esc(), [ox, oy] = origen(); return [ox + x * s, oy + y * s] as const; };
  const aCampo = (x: number, y: number) => { const s = esc(), [ox, oy] = origen(); return [(x - ox) / s, (y - oy) / s] as const; };
  const C = { O: '#2a1a0a', V: '#3fa34d', v: '#7fd85a', A: '#ffd23c', a: '#c98a00', R: '#e8325a', r: '#7a0f2b', B: '#f4f1ea', G: '#b9b9c6', g: '#7a7a86', P: '#e3b07a', p: '#b07a48', N: '#ff8a2a', K: '#4a2c14', L: '#bfe9ff', C: '#2f6bd8', Y: '#fff1c9', T: '#ff5a2a', t: '#c03a10' };
  const SPR: Record<Clase, Sprite> = {
    palta: desdeTexto(['..OOO..', '.OVVVO.', 'OVvvvVO', 'OVvKvVO', 'OVvKvVO', 'OVvvvVO', '.OOOOO.'], C),
    // La manzana: roja oscura, alta, con palito café y hoja; el tomate: anaranjado, ancho y con corona verde de estrella
    manzana: desdeTexto(['...K.V.', '...KVV.', '.OOKOO.', 'ORRRRRO', 'ORBRRRO', 'ORRRRRO', '.OrRrO.', '..OOO..'], C),
    platano: desdeTexto(['......O', '.....OA', '....OAO', '...OAAO', 'OOAAAO.', 'OAAAO..', '.OOO...'], C),
    tomate: desdeTexto(['.V.V.V.V.', '..VVVVV..', 'OTTTVTTTO', 'TBTTTTTTT', 'TTTTTTTTT', 'OtTTTTTtO', '.OOOOOOO.'], C),
    choclo: desdeTexto(['.V.O.V.', '.VOAOV.', '.VAaAV.', '.VAAaV.', '..VaAV.', '..VAV..', '...V...'], C),
    lechuga: desdeTexto(['.OvOvO.', 'OvVvVvO', 'OVvVvVO', 'OvVvVvO', 'OVvVvVO', '.OVVVO.', '..OOO..'], C),
    reineta: desdeTexto(['.OOOO...O', 'OGBGGO.OG', 'OOGGGGOGO', 'OGGGGGOGO', '.OggggO.O', '..OOOO...'], C),
    jurel: desdeTexto(['.OOOOO..O', 'OCBCCCOOC', 'OCCCCCCCO', 'OLLLLLOOC', '.OOOOO..O'], C),
    marraqueta: desdeTexto(['.OOO.OOO.', 'OPPPOPPPO', 'OPYPOPYPO', 'OPPPOPPPO', 'OpppOpppO', '.OOO.OOO.'], C),
    hallulla: desdeTexto(['..OOOOO..', '.OPPPPPO.', 'OPYP.PYPO', 'OPPPPPPPO', '.OpppppO.', '..OOOOO..'], C),
    huevo: desdeTexto(['..OOO..', '.OBBBO.', 'OBBYBBO', 'OBBBBBO', 'OBBBBBO', '.OGBGO.', '..OOO..'], C),
  };
  const ICONO: Record<Grupo, Sprite> = { frutas: SPR.manzana, verduras: SPR.lechuga, pescado: SPR.reineta, pan: SPR.marraqueta, huevos: SPR.huevo };
  const CANASTO = desdeTexto(['OOOOOOOOOOOOOOOO', 'OpPpPpPpPpPpPpPO', '.OPpPpPpPpPpPpO.', '.OpPpPpPpPpPpPO.', '.OPpPpPpPpPpPpO.', '..OpPpPpPpPpPO..', '..OOOOOOOOOOOO..'], C);
  const GATO = desdeTexto(['O...O.....', 'OO.OO.....', 'ONNNO.....', 'NBNBN....O', 'NNNNNNNNNO', '.NNNNNNNN.', '.N.N..N.N.'], C);
  const TOLDO = ['#e8325a', '#f4f1ea'];
  m.alPixel((gp) => {
    const s = esc(), k = m.k, px = (v: number) => Math.round(v / k) * k, [ox] = origen(), t = m.tiempo;
    // Feria: toldo a rayas arriba, puestos al fondo y piso de baldosas
    gp.fillStyle = '#ffe3a8'; gp.fillRect(0, 0, m.ancho, H);
    for (let x = 0, i = 0; x < m.ancho; x += 40, i++) { gp.fillStyle = enPunta() && Math.floor(t * 4) % 2 ? (i % 2 ? '#ff8a2a' : '#ffd23c') : TOLDO[i % 2]; gp.fillRect(px(x), 0, px(40) + k, px(46)); gp.fillRect(px(x + 8), px(46), px(24), px(8)); }
    { const [, py] = aPantalla(0, CINTA_Y + 40); gp.fillStyle = '#d9c39a'; gp.fillRect(0, px(py), m.ancho, H); gp.fillStyle = '#c9b088'; for (let x = 0; x < m.ancho; x += 24 * k) for (let y = py; y < H; y += 24 * k) if (((x + y) / (24 * k)) % 2 < 1) gp.fillRect(px(x), px(y), 12 * k, 12 * k); }
    // Cinta transportadora (con rayas que avanzan)
    const [cx0, cy] = aPantalla(0, CINTA_Y);
    gp.fillStyle = '#3e3e4a'; gp.fillRect(px(cx0), px(cy - 26 * s), px(W * s), px(52 * s));
    gp.fillStyle = '#5a5a66'; const corre = (t * velocidadCinta() * s) % (40 * s); for (let x = corre; x < W * s; x += 40 * s) gp.fillRect(px(cx0 + x), px(cy - 26 * s), 2 * k, px(52 * s));
    gp.fillStyle = '#1b1630'; gp.fillRect(px(cx0), px(cy + 26 * s), px(W * s), 2 * k);
    { const [fx] = aPantalla(W, 0); gp.fillStyle = 'rgba(232,50,90,.6)'; gp.fillRect(px(fx) - 3 * k, px(cy - 26 * s), 3 * k, px(52 * s)); }
    // Canastos con su ícono (en el nivel 3 se ve el cambio de lugar)
    // Canasto donde caería lo que arrastras: se ilumina (solo muestra dónde cae, no si es el correcto)
    const destino = arrastre && arrastre.p.y > CANASTO_Y - 90 ? orden[Math.max(0, Math.min(4, Math.floor(arrastre.p.x / (W / 5))))] : null;
    for (const g of GRUPOS) {
      const [x, y] = aPantalla(xCanasto(g), CANASTO_Y);
      if (g === destino) { gp.fillStyle = 'rgba(255,210,60,.45)'; gp.fillRect(px(x - (W / 10) * s), px(y - 46 * s), px((W / 5) * s), px(92 * s)); }
      m.sprite(CANASTO, x, y, 2.4 * s); m.sprite(ICONO[g], x, y - 6 * s, 1.6 * s);
    }
    // El pedido con dibujos: cada producto que pide el cliente, en fila
    if (pedido) { const items = pedido.items, paso = 70 * s, x0 = m.ancho / 2 - ((items.length - 1) * paso) / 2, [, py] = aPantalla(0, 168); items.forEach((it, i) => { if (it.falta === 0) gp.globalAlpha = 0.35; m.sprite(SPR[it.clase], x0 + i * paso, py, 2.2 * Math.max(s, 0.75)); gp.globalAlpha = 1; }); }
    // Productos
    const marcado = primero();
    for (const p of productos) {
      const [x, y] = aPantalla(p.x, p.y);
      if (p === marcado && !bot) { gp.fillStyle = '#ffd23c'; gp.fillRect(px(x - 24 * s), px(y + 22 * s), px(48 * s), 2 * k); }
      if (p.robado) gp.globalAlpha = 0.6;
      m.sprite(SPR[p.clase], x, y, (p.agarrado ? 3.4 : 3) * Math.max(s, 0.75)); // en celular no se achican tanto: hay que poder agarrarlos
      gp.globalAlpha = 1;
    }
    if (gato) { const [x, y] = aPantalla(gato.x, CINTA_Y - 44); gp.save(); if (gato.huye || gato.x < (productos.find((p) => p.id === gato!.meta)?.x ?? -1)) { gp.translate(px(x), 0); gp.scale(-1, 1); gp.translate(-px(x), 0); } m.sprite(GATO, x, y + (Math.floor(t * 8) % 2) * k, 1.8 * s); gp.restore(); }
    void ox;
  });
  m.alDibujar(() => {
    if (fase !== 'juego') return;
    const s = esc(), tam = Math.round(Math.max(13, Math.min(20, 20 * s + 4)));
    // Pedido del cliente arriba de la cinta
    if (pedido) {
      const queda = Math.max(0, pedido.hasta - m.tiempo), texto = pedido.items.map((x) => `${x.total - x.falta}/${x.total} ${x.total === 1 ? PRODUCTOS[x.clase].nombre : PRODUCTOS[x.clase].plural}`).join(' · ');
      m.rotulo(`${pedido.doble ? 'Casero (doble): ' : 'Pedido: '}${texto}`, m.ancho / 2, aPantalla(0, 120)[1], tam, pedido.doble ? '#ffd23c' : '#ffffff');
      m.rotulo(`${Math.ceil(queda)} s`, m.ancho / 2, aPantalla(0, 120)[1] + tam * 1.3, Math.round(tam * 0.8), queda < 6 ? '#ff8fc8' : '#fff6c9');
    }
    if (m.tiempo < pregon.hasta) m.rotulo(pregon.texto, m.ancho / 2, aPantalla(0, 200)[1], Math.round(tam * 0.9), '#ff8a2a');
    for (const g of GRUPOS) { const [x, y] = aPantalla(xCanasto(g), CANASTO_Y + 40); m.rotulo(s > 0.8 ? `${orden.indexOf(g) + 1} ${NOMBRE_GRUPO[g]}` : NOMBRE_GRUPO[g], x, y, Math.round(tam * 0.75), '#4a2c14'); }
    if (!bot && m.tiempo < 7) m.rotulo(s > 0.8 ? 'Arrastra cada producto a su canasto · o aprieta 1 a 5' : 'Arrastra cada producto a su canasto', m.ancho / 2, aPantalla(0, 420)[1], tam, '#4a2c14');
  });

  let terminado = false;
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin';
    musica.parar(); m.detener();
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Resultado', porque], ['Bien ordenados', String(bien)], ['Pedidos completos', String(pedidos)], ['Propinas', String(propinas)], ['Mejor racha', String(mejorRacha)], ['Al canasto equivocado', String(mal)], ['Se cayeron de la cinta', String(caidos)], ['Huevos rotos', String(rotos)], ['Pescados robados por el gato', String(robados)]],
      detalle: { bien, pedidos, propinas, racha: mejorRacha, mal, caidos, rotos, robados },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mercado = () => ({ fase, puntos, bien, mal, caidos, pedidos, robados, nivel, terminado, seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); musica.intensidad = 1; },
    destruir() { musica.parar(); m.destruir(); },
  };
}
