import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { bola, crearSprite, desdeTexto, type Sprite } from './pixel';

// Pesca Nocturna (01-11): pesca en un lago de noche desde un bote. Mantén para cargar el lanzamiento y suelta; el
// anzuelo baja y lo guías de lado. Cuando un pez pica, se pelea: mantén para recoger sin que la tensión del sedal pase
// el límite (si se pasa, se corta). Peces con comportamiento propio (los que huyen, los que pelean, los que saltan), de
// común a legendario, carnadas (brillante atrae a los raros; pesada baja rápido), eventos (cardumen, luna llena,
// tormenta), combo por capturas seguidas, basura que resta tiempo, álbum de especies y el Rey del Lago al final.
// 3 minutos. Todo sale de la semilla: en un duelo, los mismos peces en los mismos lugares.
//
// El anzuelo nunca sale del agua ni queda trabado (si pasa 25 s sin novedad, vuelve solo) y la tensión siempre se ve.

const W = 600, H = 720, AGUA = 270, FONDO = 700, DURA = 180, BOTE_Y = 238;
type Especie = 'sardina' | 'trucha' | 'salmon' | 'linterna' | 'fantasma' | 'bota' | 'lata' | 'rey';
const ESPECIES: Record<Especie, { nombre: string; rareza: string; pts: number; talla: [number, number]; vel: number; prof: [number, number]; fuerza: number; huye?: boolean; salta?: boolean; basura?: boolean; color: string }> = {
  sardina: { nombre: 'Sardina plateada', rareza: 'Común', pts: 50, talla: [10, 20], vel: 90, prof: [310, 450], fuerza: 0.3, color: '#b9c6d6' },
  trucha: { nombre: 'Trucha arcoíris', rareza: 'Poco común', pts: 120, talla: [25, 45], vel: 70, prof: [380, 560], fuerza: 0.5, salta: true, color: '#ff8fc8' },
  salmon: { nombre: 'Salmón lunar', rareza: 'Raro', pts: 300, talla: [50, 80], vel: 110, prof: [450, 640], fuerza: 0.7, color: '#ff8a2a' },
  linterna: { nombre: 'Pez linterna', rareza: 'Épico', pts: 600, talla: [30, 50], vel: 60, prof: [560, 680], fuerza: 0.55, huye: true, color: '#7cffcb' },
  fantasma: { nombre: 'Pez fantasma', rareza: 'Legendario', pts: 1500, talla: [90, 140], vel: 80, prof: [580, 680], fuerza: 0.85, salta: true, huye: true, color: '#e8f0ff' },
  bota: { nombre: 'Bota vieja', rareza: 'Basura', pts: 0, talla: [28, 32], vel: 0, prof: [660, 690], fuerza: 0.2, basura: true, color: '#6a4a2e' },
  lata: { nombre: 'Lata oxidada', rareza: 'Basura', pts: 0, talla: [10, 12], vel: 0, prof: [640, 690], fuerza: 0.15, basura: true, color: '#9aa0b8' },
  rey: { nombre: 'Rey del Lago', rareza: 'Jefe', pts: 4000, talla: [220, 260], vel: 70, prof: [520, 640], fuerza: 1, salta: true, color: '#b06bff' },
};
type Carnada = 'normal' | 'brillante' | 'pesada';
interface Pez { id: number; especie: Especie; x: number; y: number; vx: number; talla: number; fase: number }
const ALBUM = 'susto.pesca.album';

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'pesca', { fondo: '#0a1428', pixel: () => 3 });
  const musica = crearMusica(m.mesa, 92);
  musica.acordes([[45, 52, 57], [43, 50, 55], [41, 48, 53], [40, 47, 52]]);
  const bot = piloto();
  const r = generador(`${c.semilla}|pesca`), rPez = generador(`${c.semilla}|pesca-peces`);
  let album = new Set<string>();
  try { album = new Set(JSON.parse(localStorage.getItem(ALBUM) || '[]')); } catch { /* sin almacenamiento */ }

  // ── Estado ──
  let peces: Pez[] = [], ids = 0;
  const bote = { x: W / 2 };
  const anzuelo = { x: W / 2, y: AGUA, vx: 0, vy: 0, desde: 0 };
  let fase: 'juego' | 'fin' = 'juego', modo: 'listo' | 'cargando' | 'volando' | 'bajando' | 'subiendo' | 'pelea' = 'listo', carga = 0;
  let pelea: { pez: Pez; tension: number; progreso: number; suelto: number; tiron: number } | null = null;
  let carnada: Carnada = 'normal', usos = { brillante: 3, pesada: 3 }, evento: '' | 'cardumen' | 'luna' | 'tormenta' = '', proximoEvento = 40, finEvento = 0, reyHecho = false;
  let puntos = 0, capturas = 0, combo = 0, mejorCombo = 0, cortados = 0, basura = 0, nuevas = 0, castigo = 0, mayor: { nombre: string; talla: number } | null = null;
  const prueba = { anzueloFuera: 0, trabados: 0, tensionInvalida: 0 };

  const especieAlAzar = (): Especie => {
    const x = rPez(), brillo = carnada === 'brillante' ? 0.08 : 0, luna = evento === 'luna' ? 0.06 : 0;
    if (x < 0.02 + luna) return 'fantasma';
    if (x < 0.08 + brillo + luna) return 'linterna';
    if (x < 0.2 + brillo) return 'salmon';
    if (x < 0.42) return 'trucha';
    return 'sardina';
  };
  const nacer = (especie: Especie = especieAlAzar(), lado = rPez() < 0.5 ? -1 : 1) => {
    const e = ESPECIES[especie], y = e.prof[0] + rPez() * (e.prof[1] - e.prof[0]);
    peces.push({ id: ids++, especie, x: e.vel ? (lado < 0 ? -40 : W + 40) : 40 + rPez() * (W - 80), y, vx: -lado * e.vel * (0.8 + rPez() * 0.4), talla: e.talla[0] + rPez() * (e.talla[1] - e.talla[0]), fase: rPez() * 6 });
  };
  for (let i = 0; i < 7; i++) { nacer(); peces[peces.length - 1].x = 40 + rPez() * (W - 80); }
  nacer('bota'); nacer('lata');

  // ── Lanzar, guiar, recoger ──
  const soltar = () => {
    if (modo !== 'cargando') return;
    const distancia = 60 + carga * 230, lado = anzuelo.x < bote.x ? -1 : 1;
    anzuelo.x = bote.x; anzuelo.y = BOTE_Y - 30; anzuelo.vx = lado * distancia * 1.6; anzuelo.vy = -260; anzuelo.desde = m.tiempo;
    modo = 'volando'; carga = 0; m.mesa.sonido.tono(500, 0.12, 'sine', 0.05, 0); m.mesa.sonido.tono(300, 0.15, 'sine', 0.04, 0.1);
  };
  const recoger = () => { if (modo === 'bajando') { modo = 'subiendo'; m.mesa.sonido.tono(420, 0.08, 'triangle', 0.04); } };
  const cambiarCarnada = () => {
    if (modo !== 'listo') return;
    const orden: Carnada[] = ['normal', 'brillante', 'pesada']; let i = orden.indexOf(carnada);
    for (let n = 0; n < 3; n++) { i = (i + 1) % 3; const cn = orden[i]; if (cn === 'normal' || usos[cn] > 0) { carnada = cn; break; } }
    m.mesa.hud.aviso(`Carnada: ${carnada === 'normal' ? 'normal' : carnada === 'brillante' ? `brillante (atrae raros) · ${usos.brillante}` : `pesada (baja rápido) · ${usos.pesada}`}`, '', 1);
  };
  const morder = (p: Pez) => {
    modo = 'pelea'; pelea = { pez: p, tension: 0.2, progreso: 0.15, suelto: 0, tiron: m.tiempo + 1 };
    peces = peces.filter((x) => x !== p);
    if (carnada !== 'normal') { usos[carnada]--; if (usos[carnada] <= 0) carnada = 'normal'; }
    const e = ESPECIES[p.especie]; m.mesa.hud.aviso(e.basura ? '¡Algo pesado…!' : '¡Picó! Mantén para recoger', 'oro', 1); m.efectos.temblar(6); m.mesa.sonido.tono(880, 0.1, 'square', 0.06);
  };
  const terminarPelea = (atrapado: boolean) => {
    if (!pelea) return;
    const p = pelea.pez, e = ESPECIES[p.especie], [sx, sy] = aPantalla(anzuelo.x, anzuelo.y);
    pelea = null; modo = 'subiendo';
    if (!atrapado) { cortados++; combo = 0; m.mesa.hud.aviso('¡Se cortó el sedal!', 'mal', 1.2); m.mesa.sonido.mal(); m.efectos.temblar(10); return; }
    if (e.basura) { basura++; castigo += 5; combo = 0; m.mesa.hud.aviso(`${e.nombre}: −5 s`, 'mal', 1.2); m.mesa.sonido.tono(160, 0.2, 'sawtooth', 0.06); return; }
    capturas++; combo++; mejorCombo = Math.max(mejorCombo, combo);
    const mult = 1 + Math.min(2, Math.floor(combo / 3)), avg = (e.talla[0] + e.talla[1]) / 2, valor = Math.round(e.pts * (p.talla / avg) * mult);
    puntos += valor;
    if (!album.has(p.especie)) { album.add(p.especie); nuevas++; puntos += 100; m.mesa.hud.aviso(`¡Nuevo en el álbum! ${e.nombre} (${e.rareza})`, 'oro', 1.8); try { localStorage.setItem(ALBUM, JSON.stringify([...album])); } catch { /* sin almacenamiento */ } }
    else m.mesa.hud.aviso(`${e.nombre} · ${Math.round(p.talla)} cm`, 'oro', 1.2);
    if (!mayor || p.talla > mayor.talla) mayor = { nombre: e.nombre, talla: Math.round(p.talla) };
    m.efectos.flotar(sx, sy - 30, `+${valor}${mult > 1 ? ` ×${mult}` : ''}`, '#ffd23c', 28); m.efectos.chispas(sx, sy, [e.color, '#ffffff'], 14, 260); m.mesa.sonido.bien();
    if (p.especie === 'rey') m.efectos.temblar(24);
  };

  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    const t = m.tiempo + castigo;
    if (!c.libre && t >= DURA) { terminar('Se acabó el tiempo'); return; }
    // Eventos: cardumen, luna llena (más raros) y tormenta (más tirones)
    if (m.tiempo >= proximoEvento) { const l = ['cardumen', 'luna', 'tormenta'] as const; evento = l[Math.floor(r() * 3)]; finEvento = m.tiempo + 18; proximoEvento = m.tiempo + 45; m.mesa.hud.aviso(evento === 'cardumen' ? '¡Un cardumen pasa!' : evento === 'luna' ? '¡Luna llena: salen los raros!' : '¡Tormenta! El sedal tira más', 'oro', 1.6); if (evento === 'cardumen') for (let i = 0; i < 8; i++) nacer('sardina', 1); }
    if (evento && m.tiempo > finEvento) evento = '';
    if (!reyHecho && !c.libre && t >= DURA - 35) { reyHecho = true; nacer('rey'); m.mesa.hud.aviso('¡Apareció el Rey del Lago!', 'oro', 2); m.efectos.temblar(12); }
    // Peces: nadan de lado; los que huyen se alejan del anzuelo (salvo con carnada brillante)
    for (const p of peces) {
      const e = ESPECIES[p.especie];
      p.fase += dt; p.x += p.vx * dt; p.y += Math.sin(p.fase * 1.5) * 8 * dt;
      if (e.huye && carnada !== 'brillante' && modo === 'bajando' && Math.hypot(p.x - anzuelo.x, p.y - anzuelo.y) < 90) p.x += Math.sign(p.x - anzuelo.x) * 120 * dt;
    }
    peces = peces.filter((p) => p.x > -80 && p.x < W + 80);
    while (peces.filter((p) => !ESPECIES[p.especie].basura).length < 7) nacer();
    // Mandos
    if (bot) pilotar();
    else {
      const izq = m.teclas.has('ArrowLeft') || m.teclas.has('a'), der = m.teclas.has('ArrowRight') || m.teclas.has('d');
      const meta = izq ? -1 : der ? 1 : 0, px = m.puntero.dentro || m.puntero.abajo ? aCampo(m.puntero.x, m.puntero.y)[0] : null;
      if (modo === 'bajando') { if (meta) anzuelo.x += meta * 220 * dt; else if (px !== null) anzuelo.x += Math.max(-220 * dt, Math.min(220 * dt, px - anzuelo.x)); }
      if (modo === 'listo' || modo === 'cargando') { if (meta) bote.x += meta * 200 * dt; else if (px !== null && !m.puntero.abajo) bote.x += Math.max(-200 * dt, Math.min(200 * dt, px - bote.x)); }
      const aprieta = m.teclas.has(' ') || m.puntero.abajo;
      if (modo === 'listo' && aprieta) { modo = 'cargando'; carga = 0; }
      if (modo === 'cargando') { if (aprieta) carga = Math.min(1, carga + dt * 0.9); else soltar(); }
      if (pelea) pelea.suelto = aprieta ? 0 : pelea.suelto + dt;
      tirar(aprieta, dt);
    }
    bote.x = Math.max(60, Math.min(W - 60, bote.x));
    // Anzuelo
    if (modo === 'volando') { anzuelo.vy += 700 * dt; anzuelo.x += anzuelo.vx * dt; anzuelo.y += anzuelo.vy * dt; if (anzuelo.y >= AGUA) { anzuelo.y = AGUA; modo = 'bajando'; anzuelo.desde = m.tiempo; m.efectos.chispas(...aPantalla(anzuelo.x, AGUA), ['#7fb4ff', '#ffffff'], 8, 160); } }
    else if (modo === 'bajando') {
      anzuelo.y += (carnada === 'pesada' ? 150 : 85) * dt;
      for (const p of peces) { const e = ESPECIES[p.especie]; if (Math.hypot(p.x - anzuelo.x, p.y - anzuelo.y) < Math.max(14, p.talla * 0.25) && !(e.huye && carnada !== 'brillante' && p.especie !== 'rey' && rPez() < 0.5)) { morder(p); break; } }
      if (anzuelo.y >= FONDO - 4 || m.tiempo - anzuelo.desde > 25) { if (m.tiempo - anzuelo.desde > 25) prueba.trabados++; modo = 'subiendo'; }
    } else if (modo === 'subiendo') { anzuelo.y -= 420 * dt; anzuelo.x += (bote.x - anzuelo.x) * Math.min(1, dt * 3); if (anzuelo.y <= AGUA) { modo = 'listo'; anzuelo.y = AGUA; } }
    else if (modo === 'pelea' && pelea) { anzuelo.x += Math.sin(m.tiempo * 3 + pelea.pez.id) * 60 * dt; anzuelo.y = AGUA + (1 - pelea.progreso) * (pelea.pez.y - AGUA); }
    else if (modo === 'listo' || modo === 'cargando') { anzuelo.x = bote.x + 40; anzuelo.y = AGUA; }
    anzuelo.x = Math.max(10, Math.min(W - 10, anzuelo.x));
    if (modo !== 'volando' && (anzuelo.y < AGUA - 1 || anzuelo.y > FONDO + 1 || anzuelo.x < 0 || anzuelo.x > W)) prueba.anzueloFuera++;
    m.mesa.hud.puntos(String(puntos));
    if (!c.libre) { const q = Math.max(0, DURA - t); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`${capturas} peces${combo >= 3 ? ` · ×${1 + Math.min(2, Math.floor(combo / 3))}` : ''}${carnada !== 'normal' ? ` · ${carnada}` : ''}`); // corto: el puntaje siempre a la vista (los eventos salen como aviso)
  });
  /** La pelea: mantener recoge (la tensión sube); soltar afloja (la tensión baja, el pez recupera algo de sedal). */
  function tirar(recogiendo: boolean, dt: number) {
    if (!pelea) return;
    const e = ESPECIES[pelea.pez.especie], tormenta = evento === 'tormenta' ? 1.3 : 1;
    if (recogiendo) { pelea.progreso += (0.32 - e.fuerza * 0.14) * dt; pelea.tension += (0.45 + e.fuerza * 0.55) * tormenta * dt; }
    else { pelea.tension -= 0.8 * dt; pelea.progreso -= e.fuerza * 0.06 * dt; }
    if (m.tiempo >= pelea.tiron) { pelea.tiron = m.tiempo + 1.2 + r() * 1.6; pelea.tension += (e.salta ? 0.22 : 0.12) * e.fuerza * tormenta; if (e.salta) { const [sx, sy] = aPantalla(anzuelo.x, AGUA); m.efectos.chispas(sx, sy, ['#7fb4ff', '#ffffff'], 10, 240); } }
    pelea.tension = Math.max(0, pelea.tension); pelea.progreso = Math.max(0, pelea.progreso);
    if (!Number.isFinite(pelea.tension) || !Number.isFinite(pelea.progreso)) { prueba.tensionInvalida++; pelea.tension = 0.5; pelea.progreso = 0.5; }
    if (pelea.tension >= 1) terminarPelea(false);
    else if (pelea.progreso >= 1) terminarPelea(true);
    else if (pelea.suelto > 4) { m.mesa.hud.aviso('Se soltó el pez', 'mal', 1); combo = 0; pelea = null; modo = 'subiendo'; }
  }
  m.alTecla((k) => { if (k === 'c' || k === 'x') cambiarCarnada(); if ((k === 'ArrowUp' || k === 'w') && !bot) recoger(); });
  m.alTocar((x, y) => { const [cx, cy] = aCampo(x, y); if (modo === 'bajando' && cy < AGUA) recoger(); if (modo === 'listo' && Math.abs(cx - (W - 60)) < 50 && Math.abs(cy - 60) < 30) cambiarCarnada(); });

  // ── Bots: el bueno lanza hacia el pez más valioso, guía el anzuelo y maneja la tensión; el torpe hace todo a medias ──
  const rb = generador('bot-pesca');
  let botMeta: Pez | null = null, botCambio = 0;
  function pilotar() {
    const torpe = bot === 'torpe';
    if (modo === 'listo') {
      const objetivos = peces.filter((p) => !ESPECIES[p.especie].basura).sort((a, b) => ESPECIES[b.especie].pts - ESPECIES[a.especie].pts);
      botMeta = torpe ? objetivos[Math.floor(rb() * objetivos.length)] ?? null : objetivos[0] ?? null;
      modo = 'cargando'; carga = 0; anzuelo.x = botMeta && botMeta.x < bote.x ? bote.x - 1 : bote.x + 1;
      return;
    }
    if (modo === 'cargando') { const quiere = botMeta ? Math.min(1, Math.max(0, (Math.abs(botMeta.x - bote.x) - 60) / 230)) : 0.5; carga += 0.9 / 120; if (carga >= (torpe ? rb() : quiere)) soltar(); return; }
    if (modo === 'bajando') {
      if (botMeta && !peces.includes(botMeta)) botMeta = null;
      const meta = torpe ? (m.tiempo > botCambio ? ((botCambio = m.tiempo + 1), anzuelo.x + (rb() - 0.5) * 200) : anzuelo.x) : botMeta ? botMeta.x + botMeta.vx * 0.3 : anzuelo.x;
      anzuelo.x += Math.max(-220 / 120, Math.min(220 / 120, meta - anzuelo.x));
      if (!torpe && botMeta && anzuelo.y > botMeta.y + 40) recoger();
      return;
    }
    if (pelea) { const umbral = torpe ? 0.6 + rb() * 0.5 : 0.7; const aprieta = pelea.tension < umbral; pelea.suelto = aprieta ? 0 : pelea.suelto + 1 / 120; tirar(aprieta, 1 / 120); }
  }

  // ── Dibujo ──
  const esc = () => Math.min(1, (m.ancho - 16) / W), origen = () => { const s = esc(); return [(m.ancho - W * s) / 2, (H - H * s) / 2] as const; };
  const aPantalla = (x: number, y: number) => { const s = esc(), [ox, oy] = origen(); return [ox + x * s, oy + y * s] as const; };
  const aCampo = (x: number, y: number) => { const s = esc(), [ox, oy] = origen(); return [(x - ox) / s, (y - oy) / s] as const; };
  const pezSprite = (color: string, oscuro: string) => desdeTexto(['....OOOO.....', '..OOCCCCOO.OO', '.OCLCCCCCCOCO', 'OCEOCCCCCCCCO', 'OCCCCCCCCDOCO', '.ODDDDDDDDO.O', '..OOOOOOOO...'], { O: '#0a1428', C: color, L: '#ffffff', E: '#0a1428', D: oscuro });
  const tono = (h: string, k: number) => { const n = parseInt(h.slice(1), 16), f = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k))); return `#${((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1)}`; };
  const SPR: Record<Especie, Sprite> = {
    sardina: pezSprite('#b9c6d6', '#7a8aa0'), trucha: pezSprite('#ff8fc8', '#3fa37a'), salmon: pezSprite('#ff8a2a', '#c95a10'), linterna: pezSprite('#7cffcb', '#2a7a6a'),
    fantasma: pezSprite('#e8f0ff', '#9aa0b8'), rey: pezSprite('#b06bff', '#4a2276'),
    bota: desdeTexto(['..OOOO..', '..OMMO..', '..OMMO..', '..OMMO..', 'OOOMMOOO', 'OMMMMMMO', 'OOOOOOOO'], { O: '#2a1a0a', M: '#6a4a2e' }),
    lata: desdeTexto(['OOOO', 'OGGO', 'ORRO', 'OGGO', 'OOOO'], { O: '#2a2a36', G: '#9aa0b8', R: '#c94a4a' }),
  };
  const BOTE = desdeTexto(['..........P.....', '..........P.....', '....BBBB..P.....', '....BKKB..P.....', 'MMMMMMMMMMMMMMMM', '.MWWWWWWWWWWWWM.', '..MMMMMMMMMMMM..'], { M: '#5a3a1e', W: '#8a5a32', B: '#3f6bd8', K: '#ffd9b3', P: '#c9a227' });
  const LUNA = bola(12, 12, { borde: '#c9c2a0', sombra: '#e8e0b8', base: '#f8f1d0', luz: '#fffbe8' });
  const BRILLO = crearSprite(3, 3, (g) => { g.fillStyle = '#fff6c9'; g.fillRect(1, 0, 1, 3); g.fillRect(0, 1, 3, 1); });
  m.alPixel((gp) => {
    const s = esc(), [ox, oy] = origen(), t = m.tiempo, k = m.k, px = (v: number) => Math.round(v / k) * k;
    gp.fillStyle = evento === 'tormenta' ? '#0c0f1c' : '#0e1630'; gp.fillRect(0, 0, m.ancho, H);
    for (let i = 0; i < 40; i++) if (evento !== 'tormenta' && Math.sin(t * 2 + i) > -0.3) m.sprite(BRILLO, ((i * 173) % m.ancho), (i * 37) % 200, 1);
    if (m.ancho - (ox + W * s) > 90 || evento === 'luna') m.sprite(LUNA, evento === 'luna' ? m.ancho / 2 : ox + W * s + 50, evento === 'luna' ? 175 : 190, evento === 'luna' ? 1.6 : 1); // lejos del marcador de arriba
    if (evento === 'tormenta' && Math.floor(t * 3) % 11 === 0) { gp.fillStyle = 'rgba(255,255,255,.25)'; gp.fillRect(0, 0, m.ancho, H); }
    // Agua por capas (más oscura al fondo)
    for (let y = AGUA; y < FONDO + 20; y += 12) { const [, sy] = aPantalla(0, y); gp.fillStyle = tono('#1d3a6e', 1 - (y - AGUA) / 700); gp.fillRect(px(ox), px(sy), px(W * s), px(12 * s) + k); }
    { const [, sy] = aPantalla(0, AGUA); gp.fillStyle = '#7fb4ff'; for (let x = 0; x < W * s; x += 4 * k) gp.fillRect(px(ox + x), px(sy + Math.sin(t * 2 + x * 0.05) * 2), 2 * k, k); }
    { const [, sy] = aPantalla(0, FONDO); gp.fillStyle = '#3a2a1a'; gp.fillRect(px(ox), px(sy), px(W * s), px(30 * s)); }
    for (const p of peces) { const [sx, sy] = aPantalla(p.x, p.y), img = SPR[p.especie], e = ESPECIES[p.especie]; const tam = Math.max(0.6, (p.talla / (e.basura ? 16 : 30)) * s); gp.save(); if (p.vx > 0) { gp.translate(px(sx), 0); gp.scale(-1, 1); gp.translate(-px(sx), 0); } if (p.especie === 'fantasma') gp.globalAlpha = 0.7; m.sprite(img, sx, sy, Math.min((p.especie === 'rey' ? 7 : 3.4) * s, tam)); gp.restore(); }
    // Bote, sedal y anzuelo
    const [bx, by] = aPantalla(bote.x, BOTE_Y); m.sprite(BOTE, bx, by, 3 * s);
    const [ax, ay] = aPantalla(anzuelo.x, anzuelo.y), [rx, ry] = aPantalla(bote.x + 6, BOTE_Y - 30);
    const n = Math.max(1, Math.ceil(Math.hypot(ax - rx, ay - ry) / k)); gp.fillStyle = pelea && pelea.tension > 0.75 ? '#ff3b5c' : '#dfe6f3'; for (let i = 0; i <= n; i += 2) gp.fillRect(px(rx + ((ax - rx) * i) / n), px(ry + ((ay - ry) * i) / n), k, k);
    gp.fillStyle = carnada === 'brillante' ? '#ffd23c' : carnada === 'pesada' ? '#7a7a86' : '#ff8fc8'; gp.fillRect(px(ax) - k, px(ay) - k, 2 * k, 2 * k);
    if (pelea) { const [fx, fy] = aPantalla(anzuelo.x, anzuelo.y + 10); m.sprite(SPR[pelea.pez.especie], fx, fy, Math.min((pelea.pez.especie === 'rey' ? 7 : 3.4) * s, Math.max(0.6, (pelea.pez.talla / 30) * s))); }
  });
  m.alDibujar((g) => {
    if (fase !== 'juego') return;
    // Barras: carga del lanzamiento y tensión del sedal (siempre a la vista durante la pelea)
    const [bx, by] = aPantalla(bote.x, BOTE_Y - 70);
    if (modo === 'cargando') { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(bx - 50, by, 100, 12); g.fillStyle = '#ffd23c'; g.fillRect(bx - 50, by, 100 * carga, 12); }
    if (pelea) {
      const w = Math.min(320, m.ancho - 40), x0 = m.ancho / 2 - w / 2, y0 = 72;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x0, y0, w, 16); g.fillStyle = pelea.tension > 0.75 ? '#ff3b5c' : pelea.tension > 0.5 ? '#ffd23c' : '#7cffcb'; g.fillRect(x0, y0, w * Math.min(1, pelea.tension), 16);
      g.fillStyle = 'rgba(255,59,92,.35)'; g.fillRect(x0 + w * 0.85, y0, w * 0.15, 16);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x0, y0 + 22, w, 8); g.fillStyle = '#7fb4ff'; g.fillRect(x0, y0 + 22, w * Math.min(1, pelea.progreso), 8);
      m.rotulo(`Tensión · ${ESPECIES[pelea.pez.especie].nombre === 'Rey del Lago' ? '¡el Rey!' : 'mantén para recoger'}`, m.ancho / 2, y0 + 46, 16, '#ffffff');
    }
    if (!bot && modo === 'listo' && m.tiempo < 12) m.rotulo('Mantén apretado para cargar y suelta para lanzar · C cambia la carnada', m.ancho / 2, aPantalla(0, 180)[1], Math.round(Math.min(20, m.ancho / 28)), '#fff6c9');
  });

  let terminado = false;
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin';
    musica.parar(); m.detener();
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Resultado', porque], ['Peces atrapados', String(capturas)], ['El más grande', mayor ? `${mayor.nombre} · ${mayor.talla} cm` : '—'], ['Especies nuevas en el álbum', String(nuevas)], ['Mejor combo', String(mejorCombo)], ['Sedales cortados', String(cortados)], ['Basura pescada', String(basura)]],
      detalle: { capturas, mayor: mayor?.talla ?? 0, nuevas, combo: mejorCombo, cortados, basura },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pesca = () => ({ fase, modo, puntos, capturas, cortados, basura, combo, evento, terminado, seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); musica.intensidad = 1; },
    destruir() { musica.parar(); m.destruir(); },
  };
}
