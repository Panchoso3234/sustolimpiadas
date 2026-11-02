import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { crearSprite, desdeTexto, type Sprite } from './pixel';

// Candy Cascada (01-11): combina 3 dulces iguales cambiando dos vecinos. 4 en línea hacen un rayo (limpia una fila o
// columna), una L o una T hacen una bomba (3 × 3) y 5 en línea un arcoíris (se lleva todos los de un color). Los
// especiales se combinan entre sí. Cada nivel tiene un objetivo (puntos, gelatina, cajas o chocolate) y movimientos
// contados; al cumplirlo, los movimientos que sobran explotan en la Cascada final. 3 minutos en el torneo.
// Todo sale de la semilla: en un duelo, los dos parten con los mismos tableros y los mismos dulces que caen.
//
// El tablero nunca queda con huecos (los dulces caen a través de los obstáculos), nunca queda en reposo con una
// combinación sin resolver y, si no quedan jugadas, se rebaraja solo.

const N = 8, CS = 72, TOP = 92, DURA = 180, TIPOS = 6;
type Especial = null | 'fila' | 'col' | 'bomba' | 'arcoiris';
interface Dulce { tipo: number; esp: Especial; oy: number; id: number }
type Bloque = null | { clase: 'caja' | 'chocolate'; vida: number };
type Objetivo = 'puntos' | 'gelatina' | 'cajas' | 'chocolate';
const OBJETIVOS: Objetivo[] = ['puntos', 'gelatina', 'cajas', 'chocolate'];
const COLORES = ['#ff3b5c', '#ff8a2a', '#ffd23c', '#3fc95a', '#3f8cff', '#b06bff'];

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'cascada', { fondo: '#2a1640', pixel: () => 3 });
  const musica = crearMusica(m.mesa, 118);
  musica.acordes([[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]);
  const bot = piloto();
  const r = generador(`${c.semilla}|cascada`);

  // ── Estado ──
  let tablero: (Dulce | null)[][] = [], bloques: Bloque[][] = [], gelatina: number[][] = [];
  let ids = 0, nivel = 0, objetivo: Objetivo = 'puntos', meta = 0, movimientos = 0, puntosNivel = 0, cascada = 0;
  let fase: 'juego' | 'fin' = 'juego', estado: 'quieto' | 'resolviendo' | 'final' = 'quieto', quitando: { r: number; c: number; t: number }[] = [];
  let puntos = 0, niveles = 0, estrellas = 0, especiales = 0, mejorCascada = 0, combos = 0, rotosEsteMov = 0, finales = 0, inactivo = 0;
  const prueba = { huecos: 0, sinResolver: 0, sinJugadas: 0, rebarajados: 0 };
  const dulce = (tipo = Math.floor(r() * TIPOS), esp: Especial = null): Dulce => ({ tipo, esp, oy: 0, id: ids++ });
  const dentro = (f: number, k: number) => f >= 0 && k >= 0 && f < N && k < N;
  const libre = (f: number, k: number) => dentro(f, k) && !bloques[f][k];
  const iguales = (a: Dulce | null, b: Dulce | null) => !!a && !!b && a.esp !== 'arcoiris' && b.esp !== 'arcoiris' && a.tipo >= 0 && a.tipo === b.tipo;

  // ── Niveles ──
  const armarNivel = () => {
    nivel++; objetivo = OBJETIVOS[(nivel - 1) % 4]; movimientos = 20 + Math.min(6, nivel); puntosNivel = 0; cascada = 0;
    bloques = Array.from({ length: N }, () => Array<Bloque>(N).fill(null)); gelatina = Array.from({ length: N }, () => Array(N).fill(0));
    if (objetivo === 'gelatina') { const n = 10 + nivel * 2; for (let i = 0; i < n; i++) gelatina[2 + Math.floor(r() * 6)][Math.floor(r() * N)] = 1; meta = gelatina.flat().filter(Boolean).length; }
    else if (objetivo === 'cajas') { const n = 6 + nivel; for (let i = 0; i < n; i++) { const f = 4 + Math.floor(r() * 4), k = Math.floor(r() * N); bloques[f][k] = { clase: 'caja', vida: nivel > 4 ? 2 : 1 }; } meta = bloques.flat().filter(Boolean).length; }
    else if (objetivo === 'chocolate') { for (let i = 0; i < 3 + Math.floor(nivel / 3); i++) bloques[6 + Math.floor(r() * 2)][Math.floor(r() * N)] = { clase: 'chocolate', vida: 1 }; meta = 0; }
    else meta = 1200 + nivel * 400;
    // Dulces sin combinaciones al partir
    tablero = Array.from({ length: N }, (_, f) => Array.from({ length: N }, (_, k) => (bloques[f][k] ? null : dulce())));
    for (let f = 0; f < N; f++) for (let k = 0; k < N; k++) { const d = tablero[f][k]; if (!d) continue; let n = 0; while (n++ < 20 && ((k >= 2 && iguales(d, tablero[f][k - 1]) && iguales(d, tablero[f][k - 2])) || (f >= 2 && iguales(d, tablero[f - 1][k]) && iguales(d, tablero[f - 2][k])))) d.tipo = Math.floor(r() * TIPOS); }
    for (let f = 0; f < N; f++) for (let k = 0; k < N; k++) if (tablero[f][k]) tablero[f][k]!.oy = -(N + 2);
    asegurarJugadas();
  };
  const restante = () => objetivo === 'puntos' ? Math.max(0, meta - puntosNivel) : objetivo === 'gelatina' ? gelatina.flat().filter(Boolean).length : objetivo === 'cajas' ? bloques.flat().filter((b) => b?.clase === 'caja').length : bloques.flat().filter((b) => b?.clase === 'chocolate').length;

  // ── Combinaciones ──
  interface Corrida { celdas: [number, number][]; dir: 'h' | 'v' }
  const corridas = (): Corrida[] => {
    const l: Corrida[] = [];
    for (let f = 0; f < N; f++) { let k = 0; while (k < N) { let j = k + 1; while (j < N && iguales(tablero[f][k], tablero[f][j])) j++; if (j - k >= 3 && tablero[f][k]) l.push({ celdas: Array.from({ length: j - k }, (_, i) => [f, k + i]), dir: 'h' }); k = j; } }
    for (let k = 0; k < N; k++) { let f = 0; while (f < N) { let j = f + 1; while (j < N && iguales(tablero[f][k], tablero[j][k])) j++; if (j - f >= 3 && tablero[f][k]) l.push({ celdas: Array.from({ length: j - f }, (_, i) => [f + i, k]), dir: 'v' }); f = j; } }
    return l;
  };
  const hayCombinacion = () => corridas().length > 0;
  const cambiar = (a: [number, number], b: [number, number]) => { const x = tablero[a[0]][a[1]]; tablero[a[0]][a[1]] = tablero[b[0]][b[1]]; tablero[b[0]][b[1]] = x; };
  const jugadaValida = (a: [number, number], b: [number, number]) => {
    const da = tablero[a[0]][a[1]], db = tablero[b[0]][b[1]];
    if (!da || !db) return false;
    if (da.esp === 'arcoiris' || db.esp === 'arcoiris' || (da.esp && db.esp)) return true;
    cambiar(a, b); const ok = hayCombinacion(); cambiar(a, b); return ok;
  };
  const jugadas = () => { const l: [[number, number], [number, number]][] = []; for (let f = 0; f < N; f++) for (let k = 0; k < N; k++) for (const [df, dk] of [[0, 1], [1, 0]]) { const b: [number, number] = [f + df, k + dk]; if (dentro(b[0], b[1]) && jugadaValida([f, k], b)) l.push([[f, k], b]); } return l; };
  /** Si no quedan jugadas, rebaraja (con la semilla) hasta que haya alguna y ninguna combinación suelta. */
  function asegurarJugadas() {
    let intentos = 0;
    while (!jugadas().length && intentos++ < 50) {
      prueba.rebarajados++;
      const lista = tablero.flat().filter((d): d is Dulce => !!d && !d.esp);
      for (const d of lista) d.tipo = Math.floor(r() * TIPOS);
      let n = 0; while (hayCombinacion() && n++ < 40) for (const run of corridas()) { const [f, k] = run.celdas[1]; tablero[f][k]!.tipo = (tablero[f][k]!.tipo + 1 + Math.floor(r() * (TIPOS - 1))) % TIPOS; }
      if (intentos === 1) m.mesa.hud.aviso('Sin jugadas: ¡se revuelven los dulces!', '', 1.2);
    }
    if (!jugadas().length) prueba.sinJugadas++;
  }

  // ── Explosiones ──
  const sumar = (n: number) => { puntos += n; puntosNivel += n; };
  const golpearVecinos = (f: number, k: number) => {
    for (const [df, dk] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const b = dentro(f + df, k + dk) ? bloques[f + df][k + dk] : null;
      if (!b) continue;
      b.vida--; if (b.vida <= 0) { bloques[f + df][k + dk] = null; sumar(b.clase === 'caja' ? 50 : 40); rotosEsteMov++; const [x, y] = centro(f + df, k + dk); m.efectos.chispas(x, y, b.clase === 'caja' ? ['#c98a5a', '#8a5a32'] : ['#6a3a1a', '#a0603a'], 8, 200); }
    }
  };
  /** Limpia un conjunto de celdas; los especiales que caen ahí disparan su efecto (en cadena). */
  const explotar = (inicio: [number, number][], crear: Map<string, Especial> = new Map()) => {
    const marcadas = new Set<string>(), cola = [...inicio];
    while (cola.length) {
      const [f, k] = cola.pop()!, clave = `${f},${k}`;
      if (!dentro(f, k) || marcadas.has(clave) || !tablero[f][k]) continue;
      marcadas.add(clave);
      const d = tablero[f][k]!;
      if (crear.has(clave)) continue; // aquí nace un especial: no se limpia
      if (d.esp === 'fila') for (let j = 0; j < N; j++) cola.push([f, j]);
      else if (d.esp === 'col') for (let j = 0; j < N; j++) cola.push([j, k]);
      else if (d.esp === 'bomba') for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) cola.push([f + a, k + b]);
      else if (d.esp === 'arcoiris') { const t = Math.floor(r() * TIPOS); for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (tablero[a][b]?.tipo === t) cola.push([a, b]); }
    }
    for (const clave of marcadas) {
      const [f, k] = clave.split(',').map(Number), nace = crear.get(clave);
      if (nace) { tablero[f][k]!.esp = nace; if (nace === 'arcoiris') tablero[f][k]!.tipo = -1; especiales++; sumar(50); continue; }
      sumar(20 * Math.max(1, cascada));
      if (gelatina[f][k]) { gelatina[f][k] = 0; sumar(30); }
      golpearVecinos(f, k);
      quitando.push({ r: f, c: k, t: 0.16 });
    }
    m.mesa.sonido.tono(520 + Math.min(10, cascada) * 70, 0.07, 'triangle', 0.06);
  };
  const resolverCombinaciones = (movidas: [number, number][]) => {
    const runs = corridas();
    if (!runs.length) return false;
    cascada++; mejorCascada = Math.max(mejorCascada, cascada);
    const crear = new Map<string, Especial>(), celdas: [number, number][] = [];
    const conteo = new Map<string, number>(); for (const run of runs) for (const [f, k] of run.celdas) conteo.set(`${f},${k}`, (conteo.get(`${f},${k}`) ?? 0) + 1);
    for (const run of runs) {
      celdas.push(...run.celdas);
      const movida = run.celdas.find(([f, k]) => movidas.some(([a, b]) => a === f && b === k)) ?? run.celdas[Math.floor(run.celdas.length / 2)];
      const cruce = run.celdas.find(([f, k]) => (conteo.get(`${f},${k}`) ?? 0) > 1);
      if (run.celdas.length >= 5) crear.set(`${movida[0]},${movida[1]}`, 'arcoiris');
      else if (cruce && !crear.has(`${cruce[0]},${cruce[1]}`)) crear.set(`${cruce[0]},${cruce[1]}`, 'bomba');
      else if (run.celdas.length === 4) crear.set(`${movida[0]},${movida[1]}`, run.dir === 'h' ? 'col' : 'fila');
    }
    // Un especial que ya estaba en la celda no se pisa: se dispara
    for (const [clave] of [...crear]) { const [f, k] = clave.split(',').map(Number); if (tablero[f][k]?.esp) crear.delete(clave); }
    explotar(celdas, crear);
    if (cascada >= 3) { const [x, y] = centro(3.5, 3.5); m.efectos.flotar(x, y, `¡Cascada ×${cascada}!`, '#ffd23c', 34); }
    return true;
  };
  /** Gravedad: en cada columna los dulces bajan a las celdas libres (pasando a través de cajas y chocolate) y arriba nacen nuevos. */
  const caer = () => {
    for (let k = 0; k < N; k++) {
      // Celdas libres de abajo hacia arriba, y los dulces que hay en ellas con la fila de donde vienen
      const celdas = Array.from({ length: N }, (_, i) => N - 1 - i).filter((f) => !bloques[f][k]);
      const dulces: [Dulce, number][] = celdas.filter((f) => tablero[f][k]).map((f) => [tablero[f][k]!, f]);
      celdas.forEach((f, i) => {
        const [d, antes] = i < dulces.length ? dulces[i] : [dulce(), -1 - (i - dulces.length)];
        d.oy = Math.min(0, d.oy) + (antes - f); // negativo: se dibuja más arriba y baja hasta su celda
        tablero[f][k] = d;
      });
    }
  };

  // ── Una jugada ──
  let seleccion: [number, number] | null = null, movidas: [number, number][] = [];
  const intentar = (a: [number, number], b: [number, number]) => {
    if (estado !== 'quieto' || fase !== 'juego' || !jugadaValida(a, b)) { if (estado === 'quieto') m.mesa.sonido.tono(180, 0.06, 'square', 0.04); return false; }
    const da = tablero[a[0]][a[1]]!, db = tablero[b[0]][b[1]]!;
    movimientos--; inactivo = 0; cascada = 0; rotosEsteMov = 0; movidas = [a, b];
    cambiar(a, b); estado = 'resolviendo';
    // Especiales combinados entre sí
    if (da.esp === 'arcoiris' || db.esp === 'arcoiris') {
      combos++; cascada = 1;
      const otro = da.esp === 'arcoiris' ? db : da, celdas: [number, number][] = [];
      if (otro.esp === 'arcoiris') { for (let f = 0; f < N; f++) for (let k = 0; k < N; k++) if (tablero[f][k]) celdas.push([f, k]); }
      else for (let f = 0; f < N; f++) for (let k = 0; k < N; k++) { const d = tablero[f][k]; if (d && d.tipo === otro.tipo) { if (otro.esp) d.esp = otro.esp; celdas.push([f, k]); } }
      celdas.push(a, b); da.esp = db.esp = null; explotar(celdas);
    } else if (da.esp && db.esp) {
      combos++; cascada = 1;
      const [f, k] = b, celdas: [number, number][] = [a, b], tipos = [da.esp, db.esp];
      const ancho = tipos.includes('bomba') && tipos.some((x) => x === 'fila' || x === 'col') ? 1 : 0;
      if (tipos.every((x) => x === 'bomba')) { for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) celdas.push([f + x, k + y]); }
      else for (let d = -ancho; d <= ancho; d++) for (let j = 0; j < N; j++) celdas.push([f + d, j], [j, k + d]);
      da.esp = db.esp = null; explotar(celdas);
    } else resolverCombinaciones(movidas);
    return true;
  };

  // ── Paso: animaciones de caída y cascadas ──
  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    const t = m.tiempo;
    if (!c.libre && t >= DURA) { terminar('Se acabó el tiempo'); return; }
    let anima = false;
    for (const fila of tablero) for (const d of fila) if (d && d.oy < 0) { d.oy = Math.min(0, d.oy + dt * 14); anima = true; }
    if (quitando.length) { for (const q of quitando) q.t -= dt; if (quitando.every((q) => q.t <= 0)) { for (const q of quitando) tablero[q.r][q.c] = null; quitando = []; caer(); } anima = true; }
    if (!anima && estado !== 'quieto') {
      if (resolverCombinaciones(movidas)) { movidas = []; }
      else if (estado === 'final') finalCascada();
      else {
        // Terminó la jugada: chocolate que crece, objetivo, jugadas disponibles
        estado = 'quieto';
        if (bloques.flat().some((b) => b?.clase === 'chocolate') && !rotosEsteMov) crecerChocolate();
        if (restante() === 0) { estado = 'final'; niveles++; const est = puntosNivel >= metaEstrellas(3) ? 3 : puntosNivel >= metaEstrellas(2) ? 2 : 1; estrellas += est; m.mesa.hud.aviso(`¡Nivel ${nivel} superado! ${'★'.repeat(est)}${'☆'.repeat(3 - est)}`, 'oro', 1.6); m.mesa.sonido.bien(); finales = Math.min(8, movimientos); }
        else if (movimientos <= 0) { m.mesa.hud.aviso(`Sin movimientos: nivel ${nivel} no superado`, 'mal', 1.4); armarNivel(); }
        else asegurarJugadas();
      }
    }
    // Invariantes de prueba (en reposo): sin huecos y sin combinaciones sueltas
    if (estado === 'quieto' && !anima) {
      for (let f = 0; f < N; f++) for (let k = 0; k < N; k++) if (!bloques[f][k] && !tablero[f][k]) prueba.huecos++;
      if (hayCombinacion()) { prueba.sinResolver++; estado = 'resolviendo'; }
      inactivo += dt;
      if (bot) pilotar();
    }
    m.mesa.hud.puntos(String(puntos));
    if (!c.libre) { const q = Math.max(0, DURA - t); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`Nv ${nivel} · ${movimientos} mov · ${textoObjetivo()}`); // corto: en celular no debe empujar el puntaje fuera de la pantalla
  });
  const metaEstrellas = (n: number) => (objetivo === 'puntos' ? meta : 1500 + nivel * 200) * (n === 3 ? 2 : n === 2 ? 1.4 : 1);
  const textoObjetivo = () => { const q = restante(); return objetivo === 'puntos' ? `${q} pts` : objetivo === 'gelatina' ? `${q} gelat.` : objetivo === 'cajas' ? `${q} cajas` : `${q} choc.`; };
  const crecerChocolate = () => {
    const opciones: [number, number][] = [];
    for (let f = 0; f < N; f++) for (let k = 0; k < N; k++) if (bloques[f][k]?.clase === 'chocolate') for (const [df, dk] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (libre(f + df, k + dk) && tablero[f + df][k + dk] && !tablero[f + df][k + dk]!.esp) opciones.push([f + df, k + dk]);
    if (!opciones.length) return;
    const [f, k] = opciones[Math.floor(r() * opciones.length)];
    bloques[f][k] = { clase: 'chocolate', vida: 1 }; tablero[f][k] = null; caer();
  };
  /** Cascada final: cada movimiento que sobró vuelve rayo a un dulce al azar y explota. */
  function finalCascada() {
    if (finales > 0) {
      const lista: [number, number][] = []; for (let f = 0; f < N; f++) for (let k = 0; k < N; k++) if (tablero[f][k] && !tablero[f][k]!.esp) lista.push([f, k]);
      const [f, k] = lista[Math.floor(r() * lista.length)] ?? [0, 0];
      if (tablero[f][k]) { tablero[f][k]!.esp = r() < 0.5 ? 'fila' : 'col'; finales--; cascada = 1; explotar([[f, k]]); return; }
      finales = 0;
    }
    estado = 'quieto'; armarNivel();
  }

  // ── Entrada: arrastrar un dulce hacia su vecino, o tocar dos vecinos ──
  const celdaEn = (x: number, y: number): [number, number] | null => { const s = esc(), [ox, oy] = origen(), k = Math.floor((x - ox) / (CS * s)), f = Math.floor((y - oy) / (CS * s)); return dentro(f, k) ? [f, k] : null; };
  m.alTocar((x, y) => {
    const celda = celdaEn(x, y); if (!celda || estado !== 'quieto') return;
    if (seleccion && Math.abs(seleccion[0] - celda[0]) + Math.abs(seleccion[1] - celda[1]) === 1) { intentar(seleccion, celda); seleccion = null; return; }
    seleccion = celda;
  });
  m.alSoltar((x, y) => {
    if (!seleccion) return;
    const s = esc(), [ox, oy] = origen(), dx = x - (ox + (seleccion[1] + 0.5) * CS * s), dy = y - (oy + (seleccion[0] + 0.5) * CS * s);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < CS * s * 0.45) return; // fue un toque: queda seleccionado
    const b: [number, number] = Math.abs(dx) > Math.abs(dy) ? [seleccion[0], seleccion[1] + Math.sign(dx)] : [seleccion[0] + Math.sign(dy), seleccion[1]];
    if (dentro(b[0], b[1])) intentar(seleccion, b);
    seleccion = null;
  });

  // ── Bots: el bueno elige la jugada que más limpia (y prefiere especiales); el torpe, cualquiera ──
  const rb = generador('bot-cascada');
  let espera = 0;
  function pilotar() {
    espera -= 1 / 120; if (espera > 0) return;
    espera = bot === 'torpe' ? 0.9 : 0.35;
    const l = jugadas(); if (!l.length) return;
    if (bot === 'torpe') { const [a, b] = l[Math.floor(rb() * l.length)]; intentar(a, b); return; }
    let mejor = l[0], nota = -1;
    for (const [a, b] of l) {
      const da = tablero[a[0]][a[1]]!, db = tablero[b[0]][b[1]]!;
      let n = da.esp && db.esp ? 40 : da.esp === 'arcoiris' || db.esp === 'arcoiris' ? 30 : 0;
      if (!n) { cambiar(a, b); for (const run of corridas()) n += run.celdas.length + (run.celdas.length >= 4 ? 8 : 0) + run.celdas.filter(([f, k]) => gelatina[f][k]).length * 2; cambiar(a, b); }
      n += Math.max(a[0], b[0]) * 0.2; // de más abajo: más cascadas
      if (n > nota) { nota = n; mejor = [a, b]; }
    }
    intentar(mejor[0], mejor[1]);
  }

  // ── Dibujo ──
  // Escala con casillas de un número entero de píxeles (sin líneas más gruesas entre columnas); la usan el dibujo y los toques
  const esc = () => { const s = Math.min(1, (m.ancho - 16) / (N * CS), (720 - TOP - 70) / (N * CS)); return (Math.floor((CS * s) / m.k) * m.k) / CS; }; // abajo quedan libres los botones de la sala
  const origen = () => { const s = esc(); return [Math.round((m.ancho - N * CS * s) / 2 / m.k) * m.k, TOP] as const; };
  const centro = (f: number, k: number) => { const s = esc(), [ox, oy] = origen(); return [ox + (k + 0.5) * CS * s, oy + (f + 0.5) * CS * s] as const; };
  const FORMAS = [
    ['...OOOOOO...', '..OCCCCCCO..', '.OCLLCCCCCO.', 'OCLLCCCCCCCO', 'OCLCCCCCCCDO', 'OCCCCCCCCCDO', 'OCCCCCCCCCDO', 'OCCCCCCCCDDO', '.OCCCCCCDDO.', '..ODDDDDDO..', '...OOOOOO...'],
    ['.....OO.....', '....OCCO....', '...OCLCCO...', '..OCLCCCCO..', '.OCCCCCCCCO.', 'OCCCCCCCCCDO', '.OCCCCCCCDO.', '..OCCCCCDO..', '...OCCCDO...', '....OCDO....', '.....OO.....'],
    ['.....OO.....', '.....OCO....', '....OCCO....', 'OOOOOCLCOOOO', 'OCCCCCLCCCCO', '.OCCCCCCCCO.', '..OCCCCCCO..', '..OCCCCCCO..', '.OCCOOOOCCO.', '.OCO....OCO.', '.OO......OO.'],
    ['OOOOOOOOOOOO', 'OCLLLLCCCCCO', 'OCLCCCCCCCDO', 'OCLCCCCCCCDO', 'OCCCCCCCCCDO', 'OCCCCCCCCCDO', 'OCCCCCCCCCDO', 'OCCCCCCCCCDO', 'OCCCCCCCCDDO', 'OCDDDDDDDDDO', 'OOOOOOOOOOOO'],
    ['.....OO.....', '....OCCO....', '....OCCO....', '...OCLCCO...', '..OCLCCCCO..', '.OCLCCCCCCO.', '.OCCCCCCCDO.', '.OCCCCCCCDO.', '..OCCCCCDO..', '...ODDDDO...', '....OOOO....'],
    ['.....OO.....', '....OCCO....', '....OCCO....', '...OCLCCO...', '...OCLCCO...', '..OCLCCCCO..', '..OCCCCCCO..', '.OCCCCCCCDO.', '.OCCCCCCCDO.', 'OCDDDDDDDDDO', 'OOOOOOOOOOOO'],
  ];
  const tono = (h: string, k: number) => { const n = parseInt(h.slice(1), 16), f = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k))); return `#${((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1)}`; };
  const DULCES = FORMAS.map((forma, i) => desdeTexto(forma, { O: '#1b0e24', C: COLORES[i], L: '#ffffff', D: tono(COLORES[i], 0.62) }));
  const RAYA_H = crearSprite(12, 11, (g) => { g.fillStyle = 'rgba(255,255,255,.9)'; for (const y of [3, 5, 7]) g.fillRect(1, y, 10, 1); });
  const RAYA_V = crearSprite(12, 11, (g) => { g.fillStyle = 'rgba(255,255,255,.9)'; for (const x of [3, 6, 9]) g.fillRect(x, 1, 1, 9); });
  const ENVOLTURA = crearSprite(14, 13, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 5, 2, 3); g.fillRect(12, 5, 2, 3); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(2, 1, 10, 11); });
  const ARCOIRIS = crearSprite(12, 12, (g) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const d = Math.hypot(x - 5.5, y - 5.5); if (d > 5.6) continue; g.fillStyle = d > 4.8 ? '#1b0e24' : COLORES[Math.floor((x + y) / 4) % 6]; g.fillRect(x, y, 1, 1); } g.fillStyle = '#ffffff'; g.fillRect(3, 3, 2, 2); });
  const CAJA = [1, 2].map((v) => desdeTexto(['OOOOOOOOOOOO', 'OMMMMMMMMMMO', 'OMDMMMMMMDMO', 'OMMDMMMMDMMO', 'OMMMDMMDMMMO', 'OMMMMDDMMMMO', 'OMMMDMMDMMMO', 'OMMDMMMMDMMO', 'OMDMMMMMMDMO', 'OMMMMMMMMMMO', 'OOOOOOOOOOOO'], { O: '#3a1e0a', M: v === 2 ? '#8a5a32' : '#c98a5a', D: '#6a3a1a' }));
  const CHOCO = desdeTexto(['OOOOOOOOOOOO', 'OCCCCOCCCCCO', 'OCLCCOCLCCCO', 'OCCCCOCCCCCO', 'OOOOOOOOOOOO', 'OCCCCCOCCCCO', 'OCLCCCOCLCCO', 'OCCCCCOCCCCO', 'OOOOOOOOOOOO', 'OCCCOCCCCCCO', 'OOOOOOOOOOOO'], { O: '#2a1208', C: '#6a3a1a', L: '#9a6a3a' });

  m.alPixel((gp) => {
    const s = esc(), [ox, oy] = origen(), t = m.tiempo, k = m.k, px = (v: number) => Math.round(v / k) * k, lado = CS * s;
    gp.fillStyle = '#2a1640'; gp.fillRect(0, 0, m.ancho, 720);
    for (let i = 0; i < 30; i++) { gp.fillStyle = COLORES[i % 6]; gp.globalAlpha = 0.18; gp.fillRect(px((i * 211) % m.ancho), px(((i * 97) % 700 + t * 12 * (1 + (i % 3))) % 720), 2 * k, 2 * k); }
    gp.globalAlpha = 1;
    gp.fillStyle = '#1b0e24'; gp.fillRect(px(ox) - 2 * k, px(oy) - 2 * k, px(N * lado) + 4 * k, px(N * lado) + 4 * k);
    for (let f = 0; f < N; f++) for (let c2 = 0; c2 < N; c2++) {
      const x = px(ox + c2 * lado), y = px(oy + f * lado);
      gp.fillStyle = (f + c2) % 2 ? '#3a2258' : '#442a66'; gp.fillRect(x, y, px(lado), px(lado));
      if (gelatina[f][c2]) { gp.fillStyle = 'rgba(255,143,200,.45)'; gp.fillRect(x + k, y + k, px(lado) - 2 * k, px(lado) - 2 * k); }
      const b = bloques[f][c2];
      if (b) gp.drawImage(b.clase === 'caja' ? CAJA[b.vida >= 2 ? 1 : 0] : CHOCO, x + k, y + k, px(lado) - 2 * k, px(lado) - 2 * k);
    }
    const pista = !bot && estado === 'quieto' && inactivo > 5 ? jugadas()[0] : null;
    gp.save(); gp.beginPath(); gp.rect(px(ox), px(oy), px(N * lado), px(N * lado)); gp.clip();
    for (let f = 0; f < N; f++) for (let c2 = 0; c2 < N; c2++) {
      const d = tablero[f][c2]; if (!d) continue;
      const q = quitando.find((x) => x.r === f && x.c === c2);
      if (q && Math.floor(q.t * 30) % 2) continue;
      const sel = seleccion && seleccion[0] === f && seleccion[1] === c2, enPista = pista && pista.some(([a, b]) => a === f && b === c2);
      const x = ox + (c2 + 0.5) * lado, y = oy + (f + 0.5 + d.oy) * lado + (enPista ? Math.round(Math.sin(t * 10) * 2) * k : 0);
      const esc2 = (lado / 12 / k) * (sel ? 0.92 : 0.8);
      m.sprite(d.esp === 'arcoiris' || d.tipo < 0 ? ARCOIRIS : DULCES[d.tipo], x, y, esc2); // un arcoíris recién usado (sin especial) se ve igual mientras desaparece
      if (d.esp === 'fila') m.sprite(RAYA_H, x, y, esc2); else if (d.esp === 'col') m.sprite(RAYA_V, x, y, esc2); else if (d.esp === 'bomba') m.sprite(ENVOLTURA, x, y, esc2);
      if (sel) { gp.strokeStyle = '#ffffff'; gp.lineWidth = k; gp.strokeRect(px(ox + c2 * lado) + k, px(oy + f * lado) + k, px(lado) - 2 * k, px(lado) - 2 * k); }
    }
    gp.restore();
  });
  m.alDibujar(() => {
    const s = esc(), [, oy] = origen();
    // El objetivo y los movimientos van en el marcador de arriba; aquí solo el aviso de pocos movimientos
    if (movimientos <= 5 && estado !== 'final') m.rotulo(`¡Quedan ${movimientos} movimientos!`, m.ancho / 2, oy + N * CS * s + 22, 20, '#ff8a6a');
    if (estado === 'final' && finales >= 0) m.rotulo('¡Cascada final!', m.ancho / 2, oy + N * CS * s / 2, Math.round(Math.min(40, m.ancho / 11)), '#ffd23c');
  });

  let terminado = false;
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin';
    musica.parar(); m.detener();
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Resultado', porque], ['Niveles superados', String(niveles)], ['Estrellas', `${estrellas} ★`], ['Especiales creados', String(especiales)], ['Combos de especiales', String(combos)], ['Mejor cascada', `×${mejorCascada}`], ['Nivel alcanzado', String(nivel)]],
      detalle: { niveles, estrellas, especiales, combos, cascada: mejorCascada, nivel },
    });
  }

  armarNivel();
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cascada = () => ({ fase, estado, puntos, nivel, niveles, movimientos, objetivo, restante: restante(), especiales, combos, terminado, seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); musica.intensidad = 1; },
    destruir() { musica.parar(); m.destruir(); },
  };
}
