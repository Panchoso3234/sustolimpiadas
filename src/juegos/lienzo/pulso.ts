import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';

// Pulso Neón (04-11): un cubo avanza solo por una pista de neón. Un toque salta (mantener apretado sigue saltando apenas
// toca el suelo). Pinchos, bloques para subirse, plataformas amarillas que lanzan alto, anillos que dan un salto en el
// aire (tócalos estando encima), portales que invierten la gravedad y portales de nave (mantén para subir, suelta para
// bajar). Tres pistas fijas (siempre las mismas, para aprenderlas), cada una más rápida y difícil; al morir se parte de
// nuevo (en práctica, desde el último punto de control). Puntaje: el mejor % de cada pista, monedas escondidas y un
// premio por terminarla. Barra de avance con tu mejor marca, intentos y fondo que late con la música. 3 minutos.
// Las pistas no dependen de la semilla: en un duelo los dos juegan exactamente las mismas.

const U = 40, H = 720, SUELO = H - 150, FILAS = 9, DURA = 180, S = 32, SALTO = 780, G = 2700, NAVE = 1900;
interface Pista { nombre: string; vel: number; color: string; fondo: string; tempo: number; cols: string[][]; techo: boolean[]; checkpoints: number[]; monedas: number }
type Estado = { x: number; h: number; vy: number; grav: number; nave: boolean; suelo: boolean; vivo: boolean };

// ── Trozos de pista (filas de arriba hacia abajo; la última es la del suelo). '^' pincho, 'v' pincho colgando, '#' bloque,
// 'p' lanzador, 'o' anillo, '$' moneda ──
const TROZOS: string[][][] = [
  [['..^...'], ['..^^....'], ['.##.....'], ['...$...', '..###...'], ['.^.....^...'], ['..#.....#....']],
  [['..^^^....'], ['....##...', '..####...'], ['.p.^^^^.........'], ['....o.....', '.^^^^^^.....'], ['..#.^^.#....'], ['...$.....', '..##..##..']],
  [['..^.....^^.......'], ['.....###....', '..^..###.^^.'], ['..##^^^##.....'], ['.p..^^^^^.........'], ['.....o.........', '...............', '..^^^^^^.......'], ['..$#........', '..##..^^.....']],
];

/** Margen (px) entre donde cae el cubo lanzado sin apretar desde el lanzador `cx` y el final del pincho `ultimo`. */
const margenLanzador = (cx: number, ultimo: number, vel: number) => cx * U - S + 1 + ((2 * SALTO * 1.42) / G) * vel - (ultimo * U + 28);
/** Cada lanzador del suelo con la fila de pinchos que le sigue y su margen. Lo usa el arreglo y la prueba de pistas. */
export function margenesLanzadores(cols: string[][], vel: number) {
  const r: { cx: number; desde: number; hasta: number; margen: number }[] = [];
  cols.forEach((c, cx) => {
    if (c[0] !== 'p') return;
    let desde = -1, hasta = -1;
    for (let k = cx + 1; k < cx + 14 && k < cols.length; k++) if (cols[k][0] === '^') { if (desde < 0) desde = k; hasta = k; } else if (desde >= 0) break;
    if (desde >= 0) r.push({ cx, desde, hasta, margen: margenLanzador(cx, hasta, vel) });
  });
  return r;
}

export function construir(n: number): Pista {
  const r = generador(`pulso|pista|${n}`), vel = [300, 335, 370][n], tempo = [120, 132, 146][n];
  const cols: string[][] = [], techo: boolean[] = [], checkpoints: number[] = [];
  let monedas = 0;
  const vacio = (k: number, conTecho = false) => { for (let i = 0; i < k; i++) { cols.push(Array(FILAS).fill('.')); techo.push(conTecho); } };
  const poner = (trozo: string[], invertido = false, conTecho = false) => {
    const ancho = Math.max(...trozo.map((f) => f.length)), filas = trozo.length;
    for (let x = 0; x < ancho; x++) {
      const col = Array(FILAS).fill('.');
      trozo.forEach((f, i) => { let ch = f[x] ?? '.'; const fila = filas - 1 - i; if (ch === '$') monedas++; if (invertido) { ch = ch === '^' ? 'v' : ch; col[FILAS - 2 - fila] = ch; } else col[fila] = ch; });
      cols.push(col); techo.push(conTecho);
    }
  };
  vacio(14);
  const largo = [300, 380, 460][n];
  while (cols.length < largo) {
    checkpoints.push(cols.length);
    const x = r();
    if (cols.length > 60 && x < 0.14) {
      // Tramo con la gravedad al revés: portal, trozos colgando del techo, portal de vuelta
      vacio(1, true); cols[cols.length - 1][4] = 'G'; vacio(3, true);
      const colgantes = TROZOS[Math.max(0, n - 1)].filter((t) => !t.join('').match(/[po]/)); // sin lanzadores ni anillos
      for (let i = 0; i < 2; i++) { poner(colgantes[Math.floor(r() * colgantes.length)], true, true); vacio(3, true); }
      cols[cols.length - 1][4] = 'G'; vacio(4);
    } else if (cols.length > 80 && x < 0.26) {
      // Tramo en nave: pilares con un hueco que va cambiando de altura
      vacio(1, true); cols[cols.length - 1][4] = 'N'; vacio(6, true);
      let hueco = 1; // el primer hueco va abajo (la nave parte del suelo) y después cambia de a una fila
      for (let i = 0; i < 6 + n * 2; i++) {
        hueco = Math.max(1, Math.min(5, hueco + Math.floor(r() * 3) - 1));
        const col = Array(FILAS).fill('.'); for (let f = 0; f < FILAS - 1; f++) if (f < hueco || f > hueco + 3) col[f] = '#';
        if (i === 3) { col[hueco + 1] = '$'; monedas++; }
        cols.push(col); techo.push(true); vacio(4, true);
      }
      cols[cols.length - 1][4] = 'C'; vacio(5);
    } else {
      const nivel = Math.min(n, Math.floor(r() * (n + 1.6)));
      // 3. Al ritmo: el primer obstáculo del trozo cae justo en un golpe de la música de la pista
      const trozo = TROZOS[Math.min(2, nivel)][Math.floor(r() * TROZOS[0].length)], abajo = trozo[trozo.length - 1], primero = Math.max(0, abajo.search(/[^.]/));
      const golpe = (vel * 60) / tempo / U, donde = cols.length + primero, extra = Math.round(Math.ceil(donde / golpe) * golpe) - donde;
      vacio(Math.max(0, extra));
      poner(trozo);
      vacio(3 + Math.floor(r() * 2) + (n === 2 ? 1 : 0));
    }
  }
  vacio(8); cols.push(Array(FILAS).fill('F')); techo.push(false); vacio(10);
  // Arreglo 07-11: un lanzador que, montado sin hacer nada, deja caer al cubo sobre los pinchos (pista 3 al 90%) se
  // corrige quitando pinchos del final hasta tener margen. Solo toca los tramos con margen negativo: el resto no cambia.
  for (const l of margenesLanzadores(cols, vel)) if (l.margen < 0) for (let k = l.hasta; k >= l.desde && margenLanzador(l.cx, k, vel) < 24; k--) cols[k][0] = '.';
  // Validador: en desarrollo, un lanzador sin margen es un error de consola (las pruebas con bots fallan si hay errores)
  if (import.meta.env?.DEV) for (const l of margenesLanzadores(cols, vel)) if (l.margen < 0) console.error(`Pulso: lanzador sin margen en pista ${n + 1}, col ${l.cx}`);
  return { nombre: ['Pulso Inicial', 'Neón Nocturno', 'Tormenta Eléctrica'][n], vel, color: ['#3ff0ff', '#ff3fd8', '#ffd23c'][n], fondo: ['#0a0f2a', '#1a0a2a', '#200a10'][n], tempo, cols, techo, checkpoints, monedas };
}

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'pulso', { fondo: '#0a0f2a', pixel: () => 3 });
  const pistas = [0, 1, 2].map(construir);
  const musica = crearMusica(m.mesa, pistas[0].tempo);
  const bot = piloto();

  // ── Estado ──
  let p = 0, pista = pistas[0], yo: Estado = inicial(0), fase: 'juego' | 'fin' = 'juego', intentos = 1, desde = 0, muerto = 0;
  const controles = [new Set<number>(), new Set<number>(), new Set<number>()], mejor = [0, 0, 0], terminadas = [false, false, false], monedasDe = [new Set<number>(), new Set<number>(), new Set<number>()];
  let tomadasIntento = new Set<number>(), anillosUsados = new Set<number>(), apretado = false, nuevoToque = false;
  const prueba = { atascado: 0 };
  let aire = 0, estelaCuenta = 0, ultimaMuerte: { p: number; x: number; h: number } | null = null;
  const estela: [number, number][] = [];
  function inicial(x: number): Estado { return { x, h: 0, vy: 0, grav: -1, nave: false, suelo: true, vivo: true }; }
  const largoPista = () => pista.cols.length * U;
  const porcentaje = () => Math.min(100, Math.floor((yo.x / ((pista.cols.length - 10) * U)) * 100));

  // ── Física (también la usa el bot para mirar adelante) ──
  const celda = (cx: number, f: number) => (f < 0 ? '#' : f >= FILAS - 1 ? (pista.techo[cx] && f === FILAS - 1 ? '#' : '.') : pista.cols[cx]?.[f] ?? '.');
  /** Avanza un paso; devuelve eventos (portal, anillo, moneda) por id de celda. */
  function paso(e: Estado, dt: number, aprieta: boolean, toque: boolean, efectos = false) {
    if (!e.vivo) return;
    e.x += pista.vel * dt;
    if (e.nave) { e.vy += (aprieta ? NAVE : -NAVE) * dt * -e.grav; e.vy = Math.max(-480, Math.min(480, e.vy)); }
    else { e.vy += G * e.grav * dt; if (e.suelo && aprieta) { e.vy = -e.grav * SALTO; e.suelo = false; } }
    const antes = e.h; e.h += e.vy * dt; e.suelo = false;
    const c0 = Math.floor(e.x / U), c1 = Math.floor((e.x + S - 1) / U);
    for (let cx = c0; cx <= c1; cx++) for (let f = -1; f < FILAS; f++) {
      const ch = celda(cx, f), y0 = f * U, y1 = y0 + U;
      if (ch === '.') continue;
      if (ch === '#') {
        if (e.h + S <= y0 || e.h >= y1) continue;
        // Aterriza sobre (o contra el techo con la gravedad invertida); si no, choque de lado: muere
        if (e.grav < 0 && antes >= y1 - 1 && e.vy <= 0) { e.h = y1; e.vy = 0; e.suelo = true; }
        else if (e.grav > 0 && antes + S <= y0 + 1 && e.vy >= 0) { e.h = y0 - S; e.vy = 0; e.suelo = true; }
        else if (e.nave && (antes >= y1 - 1 || antes + S <= y0 + 1)) { e.h = antes >= y1 - 1 ? y1 : y0 - S; e.vy = 0; }
        // Margen amable: si casi alcanzó a subirse (le faltaron menos de 12 unidades), se sube igual
        else if (!e.nave && e.grav < 0 && e.vy <= 0 && e.h > y1 - 12 && celda(cx, f + 1) !== '#') { e.h = y1; e.vy = 0; e.suelo = true; }
        else if (!e.nave && e.grav > 0 && e.vy >= 0 && e.h + S < y0 + 12 && celda(cx, f - 1) !== '#') { e.h = y0 - S; e.vy = 0; e.suelo = true; }
        else { e.vivo = false; return; }
      } else if (ch === '^' || ch === 'v') {
        const px0 = cx * U + 12, px1 = cx * U + 28, py0 = ch === '^' ? y0 : y0 + U - 22, py1 = ch === '^' ? y0 + 22 : y1;
        if (e.x + S > px0 && e.x < px1 && e.h + S > py0 && e.h < py1) { e.vivo = false; return; }
      } else if (ch === 'p') { if (e.h <= y0 + 12 && e.x + S > cx * U && e.x < cx * U + U) { e.vy = -e.grav * SALTO * 1.42; e.suelo = false; if (efectos) m.mesa.sonido.tono(880, 0.08, 'square', 0.04); } }
      else if (ch === 'o') { const id = cx * 16 + f; if (toque && !usados(efectos).has(id) && Math.abs(e.h + S / 2 - (y0 + U / 2)) < 38) { usados(efectos).add(id); e.vy = -e.grav * SALTO; if (efectos) { m.mesa.sonido.tono(1040, 0.08, 'square', 0.04); m.efectos.chispas(...aPantalla(cx * U + U / 2, f * U + U / 2), [pista.color, '#ffffff'], 8, 160); } } }
      else if (ch === 'G' || ch === 'N' || ch === 'C') {
        const id = cx * 16 + f;
        if (!usados(efectos).has(id)) {
          usados(efectos).add(id);
          if (ch === 'G') e.grav *= -1; else e.nave = ch === 'N';
          if (efectos) { m.mesa.sonido.tono(ch === 'G' ? 300 : 600, 0.2, 'triangle', 0.06); m.efectos.temblar(4); }
        }
      } else if (ch === '$' && efectos) { const id = cx * 16 + f; if (!tomadasIntento.has(id) && Math.abs(e.h + S / 2 - (y0 + U / 2)) < 34) { tomadasIntento.add(id); m.mesa.sonido.tono(1320, 0.08, 'square', 0.04); m.efectos.flotar(...aPantalla(cx * U, y0), '¡Moneda!', '#ffd23c', 22); } }
      else if (ch === 'F' && efectos) { terminarPista(); return; }
    }
    // Portales (ocupan toda la columna): se activan al pasar por su columna
    for (let f = 0; f < FILAS; f++) { const ch = pista.cols[c0]?.[f]; if ((ch === 'G' || ch === 'N' || ch === 'C') && !usados(efectos).has(c0 * 16 + f)) { usados(efectos).add(c0 * 16 + f); if (ch === 'G') e.grav *= -1; else e.nave = ch === 'N'; if (efectos) { m.mesa.sonido.tono(ch === 'G' ? 300 : 600, 0.2, 'triangle', 0.06); m.efectos.temblar(4); } } }
    if (e.h < -2 || e.h + S > FILAS * U + 2) e.vivo = false;
  }
  let usadosSim = new Set<number>();
  const usados = (real: boolean) => (real ? anillosUsados : usadosSim);

  const muertes: string[] = [];
  function morir() {
    if (import.meta.env.DEV) { if (muertes.length > 2) muertes.shift(); const cx = Math.floor(yo.x / U); muertes.push(`x=${Math.round(yo.x)} h=${Math.round(yo.h)} vy=${Math.round(yo.vy)} cols=${[cx - 1, cx, cx + 1, cx + 2].map((c) => (pista.cols[c] ?? []).join("")).join("|")}`); }
    const [x, y] = aPantalla(yo.x + S / 2, yo.h + S / 2);
    m.efectos.chispas(x, y, [pista.color, '#ffffff'], 24, 360); m.efectos.temblar(10); m.mesa.sonido.mal();
    mejor[p] = Math.max(mejor[p], porcentaje());
    muerto = 0.7; ultimaMuerte = { p, x: yo.x, h: yo.h }; estela.length = 0;
  }
  function reaparecer() {
    intentos++;
    const cp = c.practica ? [...pista.checkpoints].reverse().find((x) => x * U < yo.x - U * 2) ?? 0 : 0;
    yo = inicial(cp * U); anillosUsados = new Set(); tomadasIntento = new Set(); desde = cp;
    // En práctica, los portales que ya pasaste antes del punto de control siguen valiendo
    if (cp) { const e = inicial(0); for (let x = 0; x < cp * U; x += pista.vel / 120) { paso(e, 1 / 120, false, false); if (!e.vivo) break; } yo.grav = e.vivo ? e.grav : -1; yo.nave = e.vivo && e.nave; anillosUsados = new Set(usadosSim); usadosSim = new Set(); }
  }
  function terminarPista() {
    mejor[p] = 100; terminadas[p] = true;
    for (const id of tomadasIntento) monedasDe[p].add(id);
    m.mesa.hud.aviso(`¡${pista.nombre} completa!`, 'oro', 1.6); m.mesa.sonido.bien(); m.efectos.temblar(8);
    estela.length = 0;
    if (p < 2) { p++; pista = pistas[p]; yo = inicial(0); anillosUsados = new Set(); tomadasIntento = new Set(); musica.acordes(p === 1 ? [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]] : [[52, 55, 59], [48, 52, 55], [50, 53, 57], [47, 50, 54]]); m.mesa.hud.aviso(`Pista ${p + 1}: ${pista.nombre}`, 'oro', 1.6); }
    else terminar('¡Terminaste las tres pistas!');
  }
  const total = () => controles.reduce((a, c) => a + c.size * 50, 0) + mejor.reduce((a, x, i) => a + (i === p && fase === 'juego' && muerto <= 0 ? Math.max(x, porcentaje()) : x) * 10, 0) + monedasDe.reduce((a, s) => a + s.size * 100, 0) + terminadas.filter(Boolean).length * 500;

  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    if (!c.libre && m.tiempo >= DURA) { mejor[p] = Math.max(mejor[p], porcentaje()); terminar('Se acabó el tiempo'); return; }
    if (muerto > 0) { muerto -= dt; if (muerto <= 0) reaparecer(); return; }
    let aprieta = apretado || m.teclas.has(' ') || m.teclas.has('ArrowUp') || m.teclas.has('w') || m.puntero.abajo, toque = nuevoToque;
    if (bot) [aprieta, toque] = pilotar();
    nuevoToque = false;
    paso(yo, dt, aprieta, toque || (aprieta && !yo.nave && !yo.suelo), true);
    if (fase !== 'juego') return;
    aire = yo.suelo ? 0 : aire + dt;
    if ((estelaCuenta = (estelaCuenta + 1) % 4) === 0) { estela.push([yo.x, yo.h]); if (estela.length > 6) estela.shift(); }
    if (!yo.vivo) { morir(); return; }
    if (yo.x > largoPista()) prueba.atascado++;
    for (const cp of pista.checkpoints) if (cp > 14 && yo.x >= cp * U && !controles[p].has(cp)) { controles[p].add(cp); const [x, y] = aPantalla(yo.x, yo.h + S + 30); m.efectos.flotar(x, y, '+50', pista.color, 20); }
    m.mesa.hud.puntos(String(total()));
    if (!c.libre) { const q = Math.max(0, DURA - m.tiempo); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`Pista ${p + 1} · ${porcentaje()}% · intento ${intentos}`);
  });
  m.alTecla((k) => { if (k === ' ' || k === 'ArrowUp' || k === 'w') nuevoToque = true; });
  m.alTocar(() => { nuevoToque = true; });

  // ── Bot: mira 0,8 s hacia adelante simulando la física con distintas formas de apretar y elige la que sobrevive ──
  const rb = generador('bot-pulso');
  let botPlan: [boolean, number] = [false, 0], botHasta = 0;
  function pilotar(): [boolean, boolean] {
    const torpe = bot === 'torpe';
    if (m.tiempo < botHasta) { const a = botPlan[1] > 0; botPlan[1]--; return [a, a]; }
    botHasta = m.tiempo + (torpe ? 0.05 + rb() * 0.08 : 1 / 60);
    // Políticas: apretar desde el paso d durante l pasos. Si alguna que empieza más tarde sobrevive, ahora no aprieta
    // (así salta en el último momento seguro, no antes); si solo sobreviven las que empiezan ya, aprieta.
    const vive = (d: number, l: number) => {
      const e = { ...yo }; usadosSim = new Set(anillosUsados);
      for (let i = 0; i < 110; i++) { const ap = i >= d && i < d + l; paso(e, 1 / 120, ap, ap); if (!e.vivo) return i; }
      return 999;
    };
    const largos = yo.nave ? [4, 10, 20, 40] : [2, 12, 40];
    // Si sin apretar sobrevive, no aprieta. Si no: busca la ventana de momentos en que apretar sirve y aprieta cuando
    // esa ventana se está por cerrar (con un margen), como un jugador que salta "justo"; si nada sirve, lo que más dure.
    const sinApretar = vive(0, 0);
    let mejorOp = 0;
    if (sinApretar !== 999 && sinApretar < 60) {
      const sirve = (d: number) => largos.find((l) => vive(d, l) === 999);
      const ahora = sirve(0);
      if (ahora !== undefined) { let ultimo = 0; for (let d = 2; d <= 40 && d < sinApretar; d += 2) { if (sirve(d) === undefined) break; ultimo = d; } if (ultimo <= 4) mejorOp = ahora; }
      else { let luego = false; for (let d = 2; d <= 40 && d < sinApretar; d += 2) if (sirve(d) !== undefined) { luego = true; break; } if (!luego) { let mejorVida = sinApretar; for (const l of largos) { const v = vive(0, l); if (v > mejorVida) { mejorVida = v; mejorOp = l; } } } }
    }
    if (torpe && rb() < 0.12) mejorOp = rb() < 0.5 ? 0 : 30;
    botPlan = [mejorOp > 0, mejorOp];
    return [mejorOp > 0, mejorOp > 0];
  }

  // ── Dibujo ──
  const cam = () => yo.x - m.ancho * 0.3;
  const aPantalla = (x: number, h: number) => [x - cam(), SUELO - h] as const;
  m.alPixel((gp, ) => {
    const k = m.k, px = (v: number) => Math.round(v / k) * k, t = m.tiempo, beat = (t * pista.tempo / 60) % 1, pulso = 1 - beat;
    gp.fillStyle = pista.fondo; gp.fillRect(0, 0, m.ancho, H);
    // Rayas del fondo que se mueven y laten con el pulso
    gp.fillStyle = pista.color; gp.globalAlpha = 0.08 + pulso * 0.1;
    for (let x = -((cam() * 0.3) % 80); x < m.ancho; x += 80) gp.fillRect(px(x), 0, 2 * k, SUELO - FILAS * U);
    for (let i = 0; i < 6; i++) gp.fillRect(0, px(60 + i * 40 + pulso * 6), m.ancho, k);
    gp.globalAlpha = 1;
    // Suelo y techo
    gp.fillStyle = '#05060f'; gp.fillRect(0, SUELO, m.ancho, H - SUELO);
    gp.fillStyle = pista.color; gp.fillRect(0, SUELO, m.ancho, k);
    const c0 = Math.max(0, Math.floor(cam() / U) - 1), c1 = Math.ceil((cam() + m.ancho) / U) + 1;
    for (let cx = c0; cx <= c1 && cx < pista.cols.length; cx++) {
      const x = px(cx * U - cam());
      if (pista.techo[cx]) { gp.fillStyle = '#05060f'; gp.fillRect(x, 0, px(U) + k, px(SUELO - FILAS * U + U)); gp.fillStyle = pista.color; gp.fillRect(x, px(SUELO - FILAS * U + U), px(U) + k, k); }
      for (let f = 0; f < FILAS; f++) {
        const ch = pista.cols[cx][f]; if (ch === '.') continue;
        const y = px(SUELO - (f + 1) * U);
        if (ch === '#') { gp.fillStyle = '#10142e'; gp.fillRect(x, y, px(U), px(U)); gp.fillStyle = pista.color; gp.fillRect(x, y, px(U), k); gp.fillRect(x, y, k, px(U)); gp.fillRect(x + px(U) - k, y, k, px(U)); gp.fillRect(x, y + px(U) - k, px(U), k); }
        else if (ch === '^' || ch === 'v') {
          // Contorno neón y punta blanca: así cada pincho se distingue del vecino y se cuentan de un vistazo
          for (let i = 0; i < 10; i++) { const w = (10 - i) * 2 * k, yy = ch === '^' ? y + px(U) - (i + 1) * 2 * k : y + i * 2 * k; gp.fillStyle = pista.color; gp.fillRect(x + px(U / 2) - w / 2 - k, yy, w + 2 * k, 2 * k); if (w > 2 * k) { gp.fillStyle = '#ffffff'; gp.fillRect(x + px(U / 2) - w / 2 + k, yy, w - 2 * k, 2 * k); } }
        }
        else if (ch === 'p') {
          gp.fillStyle = '#ffd23c'; gp.fillRect(x + 4 * k, y + px(U) - 3 * k, px(U) - 8 * k, 3 * k);
          // Flecha que late y el arco por donde te lanza (dejándote llevar)
          const sube = Math.round(pulso * 2) * k; gp.fillRect(x + px(U / 2) - k, y + px(U) - 12 * k - sube, 2 * k, 6 * k); gp.fillRect(x + px(U / 2) - 3 * k, y + px(U) - 10 * k - sube, 6 * k, 2 * k);
          if (f === 0) { const v0 = SALTO * 1.42, vuelo = (2 * v0) / G; gp.globalAlpha = 0.35 + pulso * 0.25; for (let i = 1; i < 12; i++) { const tt = (vuelo * i) / 12, ax = cx * U - S / 2 + 1 + pista.vel * tt, ah = v0 * tt - (G * tt * tt) / 2 + S / 2; gp.fillRect(px(ax - cam()), px(SUELO - ah), 2 * k, 2 * k); } gp.globalAlpha = 1; }
        }
        else if (ch === 'o') { const usado = anillosUsados.has(cx * 16 + f); gp.fillStyle = usado ? 'rgba(255,210,60,.3)' : '#ffd23c'; const r0 = 10 + pulso * 3; for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; gp.fillRect(px(x + U / 2 + Math.cos(an) * r0), px(y + U / 2 + Math.sin(an) * r0), 2 * k, 2 * k); } }
        else if (ch === '$') { if (!tomadasIntento.has(cx * 16 + f) && !monedasDe[p].has(cx * 16 + f)) { gp.fillStyle = '#ffd23c'; gp.fillRect(x + 12, y + 10, 16, 20); gp.fillStyle = '#fff1a8'; gp.fillRect(x + 18, y + 14, 4, 12); } }
        else if (ch === 'G' || ch === 'N' || ch === 'C') { gp.fillStyle = ch === 'G' ? '#ffd23c' : ch === 'N' ? '#ff3fd8' : '#3ff0ff'; gp.globalAlpha = 0.6 + pulso * 0.3; gp.fillRect(x + 10, px(SUELO - FILAS * U), 3 * k, FILAS * U); gp.fillRect(x + 22, px(SUELO - FILAS * U), 3 * k, FILAS * U); gp.globalAlpha = 1; }
        else if (ch === 'F') { gp.fillStyle = Math.floor(t * 8) % 2 ? '#ffffff' : pista.color; gp.fillRect(x, px(SUELO - FILAS * U), 2 * k, FILAS * U); }
      }
    }
    // Marca de la última muerte en esta pista
    if (ultimaMuerte && ultimaMuerte.p === p) { const [mx, my] = aPantalla(ultimaMuerte.x + S / 2, ultimaMuerte.h + S / 2); gp.fillStyle = '#ff4d6d'; gp.globalAlpha = 0.7; for (let i = -3; i <= 3; i++) { gp.fillRect(px(mx + i * k * 2), px(my + i * k * 2), 2 * k, 2 * k); gp.fillRect(px(mx + i * k * 2), px(my - i * k * 2), 2 * k, 2 * k); } gp.globalAlpha = 1; }
    // Estela de cuadritos detrás del cubo
    if (muerto <= 0 && !yo.nave) estela.forEach(([ex, eh], i) => { const [sx, sy] = aPantalla(ex, eh + S); gp.globalAlpha = (i + 1) / (estela.length + 2) * 0.5; gp.fillStyle = pista.color; const lado = px(S * (0.3 + (0.4 * i) / estela.length)); gp.fillRect(px(sx + S / 2 - lado / 2), px(sy + S / 2 - lado / 2), lado, lado); });
    gp.globalAlpha = 1;
    // El cubo (gira en el aire; en nave es un triángulo)
    if (muerto <= 0) {
      const [x, y] = aPantalla(yo.x, yo.h + S);
      if (yo.nave) { gp.fillStyle = '#ff3fd8'; gp.fillRect(px(x), px(y + S * 0.3), px(S), px(S * 0.4)); gp.fillStyle = '#ffffff'; gp.fillRect(px(x + S * 0.6), px(y + S * 0.35), px(S * 0.25), px(S * 0.15)); }
      else {
        gp.save(); gp.translate(px(x + S / 2), px(y + S / 2)); if (!yo.suelo) gp.rotate(Math.round(Math.min(1, aire / ((2 * SALTO) / G)) * 4) * (Math.PI / 8) * -yo.grav); // un cuarto de vuelta por salto: aterriza derecho
        gp.fillStyle = pista.color; gp.fillRect(-S / 2, -S / 2, S, S); gp.fillStyle = '#0a0f2a'; gp.fillRect(-S / 2 + 6, -S / 2 + 6, S - 12, S - 12); gp.fillStyle = pista.color; gp.fillRect(-4, -4, 8, 8);
        gp.restore();
      }
    }
  });
  m.alDibujar((g) => {
    if (fase !== 'juego') return;
    // Barra de avance con la mejor marca
    const w = Math.min(420, m.ancho - 60), x0 = (m.ancho - w) / 2, y0 = 70;
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x0, y0, w, 8);
    g.fillStyle = pista.color; g.fillRect(x0, y0, (w * porcentaje()) / 100, 8);
    if (mejor[p] > 0) { g.fillStyle = '#ffffff'; g.fillRect(x0 + (w * mejor[p]) / 100 - 1, y0 - 4, 2, 16); }
    if (!bot && m.tiempo < 5) { const tam = Math.round(Math.min(20, m.ancho / 22)); m.rotulo('Toca (o Espacio) para saltar · mantén para seguir saltando', m.ancho / 2, H * 0.28, tam, '#ffffff'); m.rotulo('En la nave: mantén para subir, suelta para bajar', m.ancho / 2, H * 0.28 + tam * 1.5, Math.round(tam * 0.8), '#ff3fd8'); }
    if (muerto > 0) m.rotulo(`${porcentaje()}%`, m.ancho / 2, H * 0.4, 40, '#ffffff');
  });

  let terminado = false;
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin';
    musica.parar(); m.detener();
    c.alTerminar({
      puntaje: total(),
      lineas: [['Resultado', porque], ...pistas.map((x, i) => [`Pista ${i + 1}: ${x.nombre}`, `${mejor[i]}%${terminadas[i] ? ' ✔' : ''} · ${controles[i].size}/${x.checkpoints.filter((cp) => cp > 14).length} puntos de control · monedas ${monedasDe[i].size}/${x.monedas}`] as [string, string]), ['Intentos', String(intentos)]],
      detalle: { pistas: mejor, terminadas: terminadas.filter(Boolean).length, monedas: monedasDe.reduce((a, s) => a + s.size, 0), intentos },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pulso = () => ({ fase, puntos: total(), pista: p + 1, mejor: [...mejor], intentos, terminado, muertes, seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); musica.intensidad = 2; },
    destruir() { musica.parar(); m.destruir(); },
  };
}
