import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, crearMusica, piloto } from './motor2d';
import { bola, crearSprite, type Sprite } from './pixel';

// Bubble Shot (01-11): dispara burbujas hacia un techo de burbujas. Tres o más del mismo color que se tocan revientan, y
// las que quedan colgando caen (valen más). Mira con línea de puntos que muestra el rebote, burbuja siguiente a la vista
// (se puede cambiar), especiales (bomba, arcoíris y rayo), criaturas atrapadas que valen extra, disparo perfecto con
// rebote, combo por disparos seguidos que revientan, y el techo que baja cada tantos disparos (con aviso).
// 3 minutos y 3 vidas (se pierde una si las burbujas llegan a la línea). Todo sale de la semilla.
//
// La trayectoria se calcula una sola vez, con la misma función que dibuja la mira: la burbuja cae exactamente donde
// la mira mostraba. Después de cada disparo se quitan las que quedaron sin unión al techo: nunca queda una flotando.

const R = 22, COLS = 11, W = COLS * 2 * R, FILA = R * Math.sqrt(3), TOP = 70, CANON_Y = 664, LIMITE = 584, H = 720, DURA = 180, VIDAS = 3, VEL = 1150;
const COLORES = ['#ff3b5c', '#ffd23c', '#3fc95a', '#3f8cff', '#b06bff', '#ff8a2a'];
type Especial = null | 'bomba' | 'arcoiris' | 'rayo';
interface Burbuja { color: number; esp: Especial; criatura: boolean }
interface Disparo { color: number; esp: Especial; camino: [number, number][]; destino: [number, number]; i: number; t: number; reboto: boolean }

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'burbujas', { fondo: '#10203a', pixel: () => 3 });
  const musica = crearMusica(m.mesa, 120);
  musica.acordes([[57, 61, 64], [54, 57, 61], [50, 54, 57], [52, 56, 59]]);
  const bot = piloto();
  const r = generador(`${c.semilla}|burbujas`);

  // ── Rejilla hexagonal: las filas alternan su corrimiento (desfase cambia cuando baja el techo) ──
  let grilla: (Burbuja | null)[][] = [], desfase = 0;
  const corre = (f: number) => (f + desfase) % 2 === 1;
  const columnas = (f: number) => (corre(f) ? COLS - 1 : COLS);
  const pos = (f: number, k: number): [number, number] => [R + k * 2 * R + (corre(f) ? R : 0), TOP + R + f * FILA];
  const valida = (f: number, k: number) => f >= 0 && k >= 0 && k < columnas(f);
  const en = (f: number, k: number) => (valida(f, k) ? grilla[f]?.[k] ?? null : null);
  const vecinos = (f: number, k: number): [number, number][] => { const d = corre(f) ? 0 : -1; return ([[f, k - 1], [f, k + 1], [f - 1, k + d], [f - 1, k + d + 1], [f + 1, k + d], [f + 1, k + d + 1]] as [number, number][]).filter(([a, b]) => valida(a, b)); };
  const asegurarFila = (f: number) => { while (grilla.length <= f) grilla.push(Array(COLS).fill(null)); };

  // ── Estado ──
  let version = 0, miraClave = '', mira: ReturnType<typeof trayectoria> = null;
  let nivel = 0, colores = 4, actual: Burbuja, siguiente: Burbuja, disparo: Disparo | null = null, angulo = -Math.PI / 2, disparos = 0, hastaTecho = 8, inicioNivel = 0;
  let fase: 'juego' | 'fin' = 'juego', puntos = 0, vidas = VIDAS, combo = 0, mejorCombo = 0, reventadas = 0, caidas = 0, criaturas = 0, perfectos = 0, niveles = 0;
  const prueba = { flotando: 0, encimadas: 0, fugas: 0, atascados: 0 };
  const nuevaBurbuja = (): Burbuja => {
    const presentes = [...new Set(grilla.flat().filter((b): b is Burbuja => !!b && !b.esp).map((b) => b.color))];
    const lista = presentes.length ? presentes : Array.from({ length: colores }, (_, i) => i), x = r();
    return { color: lista[Math.floor(r() * lista.length)], esp: x < 0.05 ? 'bomba' : x < 0.09 ? 'arcoiris' : x < 0.12 ? 'rayo' : null, criatura: false };
  };
  const filaNueva = (f: number) => Array.from({ length: COLS }, (_, k) => (k < columnas(f) ? { color: Math.floor(r() * colores), esp: null, criatura: r() < 0.04 } as Burbuja : null));
  const armarNivel = () => {
    version++; nivel++; colores = Math.min(6, 3 + Math.ceil(nivel / 2)); desfase = 0; grilla = []; disparos = 0; hastaTecho = Math.max(4, 9 - nivel); inicioNivel = m.tiempo;
    const filas = Math.min(9, 4 + nivel), forma = Math.floor(r() * 3);
    for (let f = 0; f < filas; f++) { asegurarFila(f); grilla[f] = filaNueva(f); if (forma === 1) for (let k = 0; k < columnas(f); k++) if (f > 1 && Math.abs(k - COLS / 2) < f - 2) grilla[f][k] = null; if (forma === 2 && f % 3 === 2) for (let k = 0; k < columnas(f); k += 3) grilla[f][k] = null; }
    quitarSueltas(false);
    actual = nuevaBurbuja(); siguiente = nuevaBurbuja();
  };

  // ── Trayectoria: avanza de a 3 unidades, rebota en las paredes y se detiene al tocar una burbuja o el techo ──
  const trayectoria = (ang: number, color: number) => {
    let x = W / 2, y = CANON_Y, vx = Math.cos(ang), vy = Math.sin(ang), reboto = false;
    const camino: [number, number][] = [[x, y]];
    for (let n = 0; n < 2000; n++) {
      x += vx * 3; y += vy * 3;
      if (x < R) { x = R; vx = Math.abs(vx); reboto = true; camino.push([x, y]); } else if (x > W - R) { x = W - R; vx = -Math.abs(vx); reboto = true; camino.push([x, y]); }
      let toca = y <= TOP + R;
      // Solo las filas cercanas (rendimiento: antes revisaba todo el tablero en cada paso de 3 unidades)
      const fc = Math.floor((y - TOP) / FILA);
      if (!toca) for (let f = Math.max(0, fc - 1); f <= fc + 1 && f < grilla.length && !toca; f++) for (let k = 0; k < columnas(f); k++) { if (!grilla[f][k]) continue; const [bx, by] = pos(f, k); if ((bx - x) ** 2 + (by - y) ** 2 < (2 * R * 0.88) ** 2) { toca = true; break; } }
      if (toca) {
        // La celda vacía más cercana (en las filas cercanas)
        let mejor: [number, number] = [0, 0], d = Infinity;
        const f0 = Math.max(0, Math.floor((y - TOP) / FILA) - 1);
        for (let f = f0; f <= f0 + 2; f++) for (let k = 0; k < columnas(f); k++) { if (en(f, k)) continue; const [bx, by] = pos(f, k), q = (bx - x) ** 2 + (by - y) ** 2; if (q < d && (f === 0 || vecinos(f, k).some(([a, b]) => en(a, b)))) { d = q; mejor = [f, k]; } }
        if (d === Infinity) for (let k = 0; k < COLS; k++) { const [bx] = pos(0, k), q = (bx - x) ** 2; if (!en(0, k) && q < d) { d = q; mejor = [0, k]; } }
        camino.push(pos(mejor[0], mejor[1]));
        return { camino, destino: mejor, reboto, color };
      }
    }
    return null;
  };
  const apuntarValido = (ang: number) => Math.max(-Math.PI + 0.14, Math.min(-0.14, ang));

  // ── Disparar y resolver ──
  const disparar = () => {
    if (disparo || fase !== 'juego') return;
    const tr = trayectoria(angulo, actual.color);
    if (!tr) { prueba.atascados++; return; }
    disparo = { color: actual.color, esp: actual.esp, camino: tr.camino, destino: tr.destino, i: 0, t: 0, reboto: tr.reboto };
    actual = siguiente; siguiente = nuevaBurbuja(); disparos++;
    m.mesa.sonido.tono(700, 0.05, 'square', 0.05);
  };
  const cambiarBurbuja = () => { if (disparo) return; [actual, siguiente] = [siguiente, actual]; m.mesa.sonido.tono(990, 0.04, 'triangle', 0.04); };
  const grupo = (f: number, k: number, mismo: (b: Burbuja) => boolean) => {
    const visto = new Set<string>(), cola: [number, number][] = [[f, k]], lista: [number, number][] = [];
    while (cola.length) { const [a, b] = cola.pop()!, cl = `${a},${b}`; if (visto.has(cl)) continue; visto.add(cl); const x = en(a, b); if (!x || !mismo(x)) continue; lista.push([a, b]); for (const v of vecinos(a, b)) cola.push(v); }
    return lista;
  };
  const centroPantalla = (f: number, k: number) => { const [x, y] = pos(f, k); return aPantalla(x, y); };
  const reventar = (lista: [number, number][], base: number) => {
    for (const [f, k] of lista) {
      const b = en(f, k); if (!b) continue;
      if (b.criatura) { criaturas++; puntos += 100; const [sx, sy] = centroPantalla(f, k); m.efectos.flotar(sx, sy, '¡Rescatada! +100', '#7cffcb', 22); }
      const [sx, sy] = centroPantalla(f, k); m.efectos.chispas(sx, sy, [COLORES[b.color] ?? '#ffffff', '#ffffff'], 6, 220);
      grilla[f][k] = null; puntos += base;
    }
  };
  /** Las que no tienen unión con el techo caen (y valen más). */
  function quitarSueltas(contar = true) {
    const unidas = new Set<string>();
    for (let k = 0; k < columnas(0); k++) if (en(0, k)) for (const [a, b] of grupo(0, k, () => true)) unidas.add(`${a},${b}`);
    let n = 0;
    for (let f = 0; f < grilla.length; f++) for (let k = 0; k < COLS; k++) if (grilla[f][k] && !unidas.has(`${f},${k}`)) { if (contar) { reventar([[f, k]], 20); caidas++; } else grilla[f][k] = null; n++; }
    return n;
  }
  const aterrizar = (d: Disparo) => {
    version++;
    const [f, k] = d.destino;
    asegurarFila(f);
    if (grilla[f][k]) prueba.encimadas++;
    // El arcoíris toma el color más común entre sus vecinos
    let color = d.color;
    if (d.esp === 'arcoiris') { const cuenta = new Map<number, number>(); for (const [a, b] of vecinos(f, k)) { const x = en(a, b); if (x) cuenta.set(x.color, (cuenta.get(x.color) ?? 0) + 1); } color = [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? color; }
    grilla[f][k] = { color, esp: null, criatura: false };
    let lista: [number, number][] = [];
    if (d.esp === 'bomba') lista = [[f, k], ...vecinos(f, k), ...vecinos(f, k).flatMap(([a, b]) => vecinos(a, b))];
    else if (d.esp === 'rayo') lista = Array.from({ length: columnas(f) }, (_, j) => [f, j] as [number, number]);
    else { const g = grupo(f, k, (b) => b.color === color); if (g.length >= 3) lista = g; }
    if (lista.length) {
      combo++; mejorCombo = Math.max(mejorCombo, combo);
      const mult = Math.min(5, combo), antes = puntos;
      reventadas += lista.filter(([a, b]) => en(a, b)).length;
      reventar(lista, 10 * mult);
      quitarSueltas();
      if (d.reboto) { perfectos++; puntos += 50; m.mesa.hud.aviso('¡Disparo perfecto! +50', 'oro', 0.8); }
      const [sx, sy] = centroPantalla(f, k); m.efectos.flotar(sx, sy, `+${puntos - antes}${mult > 1 ? ` ×${mult}` : ''}`, mult > 1 ? '#ffd23c' : '#fff6c9', 26);
      m.mesa.sonido.tono(660 + mult * 90, 0.08, 'triangle', 0.07); m.efectos.temblar(Math.min(10, lista.length));
    } else { combo = 0; m.mesa.sonido.tono(300, 0.05, 'square', 0.04); }
    // El techo baja cada tantos disparos
    if (disparos >= hastaTecho) { disparos = 0; bajarTecho(); }
    while (grilla.length && grilla[grilla.length - 1].every((x) => !x)) grilla.pop();
    // Invariante de prueba: ninguna burbuja flotando
    const n = (() => { const unidas = new Set<string>(); for (let j = 0; j < columnas(0); j++) if (en(0, j)) for (const [a, b] of grupo(0, j, () => true)) unidas.add(`${a},${b}`); return grilla.flatMap((fila, a) => fila.map((x, b) => (x && !unidas.has(`${a},${b}`) ? 1 : 0))).reduce<number>((s, v) => s + v, 0); })();
    prueba.flotando += n;
    if (!grilla.flat().some(Boolean)) { niveles++; const rapidez = Math.max(0, Math.round((90 - (m.tiempo - inicioNivel)) * 6)); puntos += 300 + rapidez; m.mesa.hud.aviso(`¡Tablero limpio! +${300 + rapidez}`, 'oro', 1.4); m.mesa.sonido.bien(); armarNivel(); return; }
    // ¿Llegaron a la línea?
    const baja = grilla.some((fila, a) => fila.some((x, b) => x && pos(a, b)[1] + R >= LIMITE));
    if (baja) {
      vidas--; combo = 0; m.efectos.temblar(16); m.mesa.sonido.mal();
      if (vidas <= 0 && !c.libre) { terminar('Las burbujas llegaron a la línea'); return; }
      if (vidas <= 0) vidas = VIDAS;
      m.mesa.hud.aviso(`¡Llegaron a la línea! Quedan ${vidas} ♥`, 'mal', 1.4);
      grilla = grilla.slice(0, Math.max(1, grilla.length - 4)); quitarSueltas(false);
    }
  };
  const bajarTecho = () => {
    // Con pocas burbujas el techo ya no agrega filas: así siempre se puede limpiar el tablero
    if (grilla.flat().filter(Boolean).length < 24) return;
    desfase = 1 - desfase;
    grilla.unshift(filaNueva(0));
    // Las demás filas conservan su corrimiento real (el desfase cambió y se corrieron una fila): nada se mueve de lado
    m.mesa.hud.aviso('¡El techo bajó!', 'mal', 0.9); m.efectos.temblar(8); m.mesa.sonido.tono(120, 0.25, 'sawtooth', 0.08);
  };

  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    const t = m.tiempo;
    if (!c.libre && t >= DURA) { terminar('Se acabó el tiempo'); return; }
    // Apuntar: hacia el puntero, o con las flechas
    if (bot) pilotar();
    else if (m.teclas.has('ArrowLeft') || m.teclas.has('a')) angulo = apuntarValido(angulo - 1.6 * dt);
    else if (m.teclas.has('ArrowRight') || m.teclas.has('d')) angulo = apuntarValido(angulo + 1.6 * dt);
    else if (m.puntero.dentro || m.puntero.abajo) { const [x, y] = aCampo(m.puntero.x, m.puntero.y); if (y < CANON_Y - 10) angulo = apuntarValido(Math.atan2(y - CANON_Y, x - W / 2)); }
    // La burbuja en vuelo sigue su camino ya calculado
    if (disparo) {
      disparo.t += dt;
      let avance = VEL * dt;
      while (avance > 0 && disparo.i < disparo.camino.length - 1) {
        const [x0, y0] = disparo.camino[disparo.i], [x1, y1] = disparo.camino[disparo.i + 1], l = Math.hypot(x1 - x0, y1 - y0);
        if (l <= avance) { avance -= l; disparo.i++; } else { disparo.camino[disparo.i] = [x0 + ((x1 - x0) / l) * avance, y0 + ((y1 - y0) / l) * avance]; avance = 0; }
      }
      const [x, y] = disparo.camino[disparo.i];
      if (x < 0 || x > W || y < 0 || y > H) prueba.fugas++;
      if (disparo.t > 4) prueba.atascados++;
      if (disparo.i >= disparo.camino.length - 1 || disparo.t > 4) { const d = disparo; disparo = null; aterrizar(d); }
    }
    m.mesa.hud.puntos(String(puntos));
    if (!c.libre) { const q = Math.max(0, DURA - t); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`${'♥'.repeat(Math.max(0, vidas))} · Nv ${nivel} · techo ${hastaTecho - disparos}${combo >= 2 ? ` · ×${Math.min(5, combo)}` : ''}`); // corto: el puntaje siempre a la vista
  });
  m.alSoltar((x, y) => { const [cx, cy] = aCampo(x, y); if (Math.hypot(cx - (W / 2 + 70), cy - CANON_Y) < 30) return cambiarBurbuja(); if (cy < CANON_Y - 10) disparar(); });
  m.alTecla((k) => { if (k === ' ' || k === 'ArrowUp' || k === 'w') disparar(); if (k === 'x' || k === 'c') cambiarBurbuja(); });

  // ── Bots: el bueno prueba muchos ángulos (con la misma trayectoria del juego) y elige el que más revienta ──
  const rb = generador('bot-burbujas');
  let espera = 0;
  function pilotar() {
    if (disparo) return;
    espera -= 1 / 120; if (espera > 0) return;
    espera = bot === 'torpe' ? 1.2 : 0.5;
    if (bot === 'torpe') { angulo = apuntarValido(-Math.PI / 2 + (rb() - 0.5) * 2.4); disparar(); return; }
    let mejor = -Math.PI / 2, nota = -1, cambiar = false;
    for (const usar of [actual, siguiente]) for (let i = 0; i <= 60; i++) {
      const ang = apuntarValido(-Math.PI + 0.14 + (i / 60) * (Math.PI - 0.28)), tr = trayectoria(ang, usar.color); if (!tr) continue;
      const [f, k] = tr.destino; asegurarFila(f); grilla[f][k] = { color: usar.color, esp: null, criatura: false };
      const g = usar.esp ? 4 : grupo(f, k, (b) => b.color === usar.color).length; grilla[f][k] = null;
      const n = (g >= 3 ? g * 2 : 0) + f * 0.1 + (tr.reboto ? 0.5 : 0) - (usar === siguiente ? 0.3 : 0);
      if (n > nota) { nota = n; mejor = ang; cambiar = usar === siguiente; }
    }
    if (cambiar) cambiarBurbuja();
    angulo = mejor; disparar();
  }

  // ── Dibujo ──
  const esc = () => Math.min(1, (m.ancho - 16) / W), origen = () => { const s = esc(); return [(m.ancho - W * s) / 2, (H - H * s) / 2] as const; };
  const aPantalla = (x: number, y: number) => { const s = esc(), [ox, oy] = origen(); return [ox + x * s, oy + y * s] as const; };
  const aCampo = (x: number, y: number) => { const s = esc(), [ox, oy] = origen(); return [(x - ox) / s, (y - oy) / s] as const; };
  const tono = (h: string, k: number) => { const n = parseInt(h.slice(1), 16), f = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k))); return `#${((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1)}`; };
  const BURBUJA = COLORES.map((col) => bola(6.5, 6.5, { borde: tono(col, 0.4), sombra: tono(col, 0.7), base: col, luz: tono(col, 1.35), brillo: '#ffffff' }));
  const ARCOIRIS = crearSprite(15, 15, (g) => { for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) { const d = Math.hypot(x - 7, y - 7); if (d > 7) continue; g.fillStyle = d > 6.2 ? '#1b0e24' : COLORES[Math.floor((x + y) / 5) % 6]; g.fillRect(x, y, 1, 1); } g.fillStyle = '#fff'; g.fillRect(4, 4, 2, 2); });
  const BOMBA = bola(6.5, 6.5, { borde: '#0e0b16', sombra: '#2a2a36', base: '#4a4a5a', luz: '#8a8a9a', brillo: '#ffffff' }, (g, w) => { g.fillStyle = '#ffd23c'; g.fillRect(Math.round(w / 2), 0, 1, 2); g.fillStyle = '#ff3b5c'; g.fillRect(Math.round(w / 2), 0, 1, 1); });
  const RAYO = crearSprite(15, 15, (g) => { g.drawImage(BURBUJA[1], 0, 0); g.fillStyle = '#ffffff'; g.fillRect(2, 7, 11, 1); g.fillRect(6, 5, 3, 5); });
  const CRIATURA = crearSprite(7, 5, (g) => { g.fillStyle = '#fff6c9'; g.fillRect(1, 1, 5, 4); g.fillStyle = '#0e0b16'; g.fillRect(2, 2, 1, 1); g.fillRect(4, 2, 1, 1); });
  const spriteDe = (b: { color: number; esp: Especial }): Sprite => (b.esp === 'arcoiris' ? ARCOIRIS : b.esp === 'bomba' ? BOMBA : b.esp === 'rayo' ? RAYO : BURBUJA[b.color]);
  const burbujasFondo = Array.from({ length: 26 }, (_, i) => ({ x: (i * 197) % 1600, v: 10 + (i % 5) * 6, r: 1 + (i % 3) }));

  m.alPixel((gp) => {
    const s = esc(), [ox, oy] = origen(), t = m.tiempo, k = m.k, px = (v: number) => Math.round(v / k) * k, e = (2 * R * s) / 15 / k;
    gp.fillStyle = '#0c1a33'; gp.fillRect(0, 0, m.ancho, H);
    for (const b of burbujasFondo) { gp.fillStyle = 'rgba(127,180,255,.18)'; gp.fillRect(px(b.x % m.ancho), px(H - ((t * b.v + b.x) % H)), b.r * k, b.r * k); }
    gp.fillStyle = '#132a4d'; gp.fillRect(px(ox), px(oy), px(W * s), px(H * s));
    gp.fillStyle = '#26467a'; gp.fillRect(px(ox), px(oy + TOP * s) - k, px(W * s), k);
    // Línea límite
    const [, ly] = aPantalla(0, LIMITE); gp.fillStyle = 'rgba(255,59,92,.6)'; for (let x = 0; x < W * s; x += 6 * k) gp.fillRect(px(ox + x), px(ly), 3 * k, k);
    // Burbujas
    for (let f = 0; f < grilla.length; f++) for (let j = 0; j < COLS; j++) {
      const b = grilla[f][j]; if (!b) continue;
      const [x, y] = aPantalla(...pos(f, j)); m.sprite(spriteDe(b), x, y, e);
      if (b.criatura) m.sprite(CRIATURA, x, y + Math.round(Math.sin(t * 4 + j) * 1) * k, e * 0.9);
    }
    // Mira: puntos hasta donde va a caer, con el rebote
    if (!disparo && fase === 'juego') {
      const clave = `${angulo.toFixed(3)}|${version}`;
      if (clave !== miraClave) { miraClave = clave; mira = trayectoria(angulo, actual.color); }
      const tr = mira;
      if (tr) { gp.fillStyle = 'rgba(255,255,255,.7)'; let acum = 0; for (let i = 0; i < tr.camino.length - 1; i++) { const [x0, y0] = tr.camino[i], [x1, y1] = tr.camino[i + 1], l = Math.hypot(x1 - x0, y1 - y0); for (let d = (24 - (acum % 24)) % 24; d < l; d += 24) { const [sx, sy] = aPantalla(x0 + ((x1 - x0) * d) / l, y0 + ((y1 - y0) * d) / l); gp.fillRect(px(sx) - k, px(sy) - k, 2 * k, 2 * k); } acum += l; } const [dx, dy] = aPantalla(...pos(tr.destino[0], tr.destino[1])); gp.strokeStyle = 'rgba(255,255,255,.5)'; gp.lineWidth = k; gp.strokeRect(px(dx - R * s), px(dy - R * s), px(2 * R * s), px(2 * R * s)); }
    }
    if (disparo) { const [x, y] = aPantalla(...disparo.camino[disparo.i]); m.sprite(spriteDe(disparo), x, y, e); }
    // Cañón: la burbuja actual y la siguiente
    const [cx, cy] = aPantalla(W / 2, CANON_Y);
    gp.fillStyle = '#5a6a8a'; for (let d = 0; d < 34 * s; d += k) gp.fillRect(px(cx + Math.cos(angulo) * d) - k, px(cy + Math.sin(angulo) * d) - k, 3 * k, 3 * k);
    if (!disparo) m.sprite(spriteDe(actual), cx, cy, e);
    const [nx, ny] = aPantalla(W / 2 + 70, CANON_Y); m.sprite(spriteDe(siguiente), nx, ny, e * 0.75);
  });
  m.alDibujar(() => {
    const [nx, ny] = aPantalla(W / 2 + 70, CANON_Y + 30);
    m.rotulo('siguiente (X)', nx, ny, 13, '#9fc4ff');
    if (!bot && m.tiempo < 6) m.rotulo('Apunta con el mouse o el dedo y suelta para disparar', m.ancho / 2, aPantalla(0, 610)[1], Math.round(Math.min(22, m.ancho / 24)), '#fff6c9');
  });

  let terminado = false;
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin';
    musica.parar(); m.detener();
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Resultado', porque], ['Tableros limpios', String(niveles)], ['Burbujas reventadas', String(reventadas)], ['Burbujas que cayeron', String(caidas)], ['Criaturas rescatadas', String(criaturas)], ['Disparos perfectos', String(perfectos)], ['Mejor combo', `×${Math.min(5, mejorCombo)}`]],
      detalle: { niveles, reventadas, caidas, criaturas, perfectos, combo: mejorCombo, vidas: Math.max(0, vidas) },
    });
  }

  armarNivel();
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__burbujas = () => ({ fase, puntos, nivel, niveles, vidas, reventadas, caidas, quedan: grilla.flat().filter(Boolean).length, terminado, seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); musica.intensidad = 1; },
    destruir() { musica.parar(); m.destruir(); },
  };
}
