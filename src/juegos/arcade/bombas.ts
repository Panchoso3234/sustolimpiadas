import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { aspectoAleatorio } from '../../personaje/catalogo';
import type { Kenney } from '../../personaje/kenney';
import { bosque, cielo, halo, ladrillo } from '../decorado';
import { mat } from '../punteria/fisica';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, mmss } from '../reflejos/motor';

// Bombas (versión 2, 26-10): tú contra tres rivales de máquina con las reglas del Bomberman de batalla.
// Tres rondas en tres arenas: la clásica de pilares, una con cintas transportadoras y otra con túneles.
// Las bombas estallan en cruz, rompen cajas y encadenan otras bombas. Las cajas esconden las mejoras de siempre
// (bomba, fuego, patines, patear, guante, fuego máximo y la calavera, que maldice y se contagia): cuáles y dónde
// lo decide la semilla, así que en un duelo los dos encuentran lo mismo. Desde el segundo 50 el patio se cierra
// en espiral hasta llenarse, y cada ronda termina con un ganador.
// Puntaje por ronda: el puesto (300/150/50) solo si rompiste cajas o eliminaste a alguien, más 200 por rival
// eliminado, 10 por caja y 20 por mejora. Esconderse ya no paga.

const COLS = 15, FILAS = 13, CELDA = 1.6, MECHA = 2.6, FUEGO = 0.55, RONDAS = 3, DURA_RONDA = 90, CIERRE = 50, PASO_CIERRE = 0.27, VEL_CINTA = 1.8, MALDITO = 12;
type Mejora = 'bomba' | 'llama' | 'vel' | 'patear' | 'guante' | 'maximo' | 'calavera';
const ICONO: Record<Mejora, string> = { bomba: '💣', llama: '🔥', vel: '👟', patear: '🦶', guante: '🧤', maximo: '🌋', calavera: '💀' };
const COLOR_MEJORA: Record<Mejora, string> = { bomba: '#3f8cff', llama: '#ff6a1e', vel: '#3fc79a', patear: '#c79bff', guante: '#f4d35e', maximo: '#e8243a', calavera: '#3a3a44' };
/** Cuántas mejoras esconden las cajas de cada ronda: muchas bombas y fuegos, pocas especiales (como en el original). */
const REPARTO: [Mejora, number][] = [['bomba', 8], ['llama', 8], ['vel', 4], ['patear', 2], ['guante', 2], ['maximo', 1], ['calavera', 2]];
type Maldicion = 'lento' | 'rapido' | 'diarrea' | 'seco' | 'chispa';
const MALDICIONES: Maldicion[] = ['lento', 'rapido', 'diarrea', 'seco', 'chispa'];
const AVISO_MALDICION: Record<Maldicion, string> = { lento: '¡Calavera: vas lento!', rapido: '¡Calavera: vas demasiado rápido!', diarrea: '¡Calavera: sueltas bombas sin parar!', seco: '¡Calavera: no puedes poner bombas!', chispa: '¡Calavera: tu fuego es mínimo!' };
const PUNTOS = { puesto: [300, 150, 50, 0], eliminado: 200, caja: 10, mejora: 20 };
const COLORES = ['#3f8cff', '#ef5565', '#3fc79a', '#ffb02e'];
const ESQUINAS: [number, number][] = [[1, 1], [COLS - 2, FILAS - 2], [COLS - 2, 1], [1, FILAS - 2]];

interface Jugador { id: number; x: number; z: number; vivo: boolean; bombas: number; llama: number; vel: number; patear: boolean; guante: boolean; mal: { tipo: Maldicion; hasta: number } | null; mira: [number, number]; tunel: number; k: Kenney; aro: THREE.Mesh; camino: [number, number][]; piensa: number; humano: boolean; ia: boolean }
interface Bomba { cx: number; cz: number; x: number; z: number; t: number; de: Jugador; llama: number; malla: THREE.Group; mecha: THREE.Mesh; desliza: [number, number] | null; rapidez: number; libres: Set<number>; vuela?: { x: number; z: number; desde: number } }
interface Arena { nombre: string; densidad: number; cintas: Map<number, [number, number]>; tuneles: Map<number, [number, number]> }
/** Celda → [desde, hasta] en que quema (o se cierra el patio). */
type Peligro = Map<number, [number, number]>;

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: COLS * CELDA + 1, alto: FILAS * CELDA * Math.sin(1.05) + 3.5, centro: [0, 0, 0.6], inclinacion: 1.05, sinPlaya: true });
  cielo(e.escena, '#6fa8dc', '#d9ecff');
  const mando = crearMando(e, c.caja, 'Bomba');
  const r = generador(`${c.semilla}|bombas`);
  const AN = COLS * CELDA, FO = FILAS * CELDA;
  const centro = (cx: number, cz: number) => ({ x: -AN / 2 + (cx + 0.5) * CELDA, z: -FO / 2 + (cz + 0.5) * CELDA });
  const celda = (x: number, z: number): [number, number] => [Math.floor((x + AN / 2) / CELDA), Math.floor((z + FO / 2) / CELDA)];
  const clave = (cx: number, cz: number) => cz * COLS + cx;
  const nivel = Math.min(4, Math.max(1, c.nivel));

  // ── Las tres arenas ──
  const ARENAS: Arena[] = (() => {
    const clasica: Arena = { nombre: 'Arena clásica', densidad: 0.75, cintas: new Map(), tuneles: new Map() };
    // Cintas: un anillo que corre en sentido horario y arrastra a jugadores y bombas
    const cintas: Arena = { nombre: 'Cintas transportadoras', densidad: 0.8, cintas: new Map(), tuneles: new Map() };
    for (let x = 3; x < 11; x++) cintas.cintas.set(clave(x, 3), [1, 0]);
    for (let z = 3; z < 9; z++) cintas.cintas.set(clave(11, z), [0, 1]);
    for (let x = 11; x > 3; x--) cintas.cintas.set(clave(x, 9), [-1, 0]);
    for (let z = 9; z > 3; z--) cintas.cintas.set(clave(3, z), [0, -1]);
    // Túneles: dos pares de agujeros que te llevan al otro lado del patio
    const tuneles: Arena = { nombre: 'Túneles', densidad: 0.75, cintas: new Map(), tuneles: new Map() };
    for (const [a, b] of [[[3, 5], [11, 7]], [[7, 1], [7, 11]]] as [number, number][][]) { tuneles.tuneles.set(clave(a[0], a[1]), b); tuneles.tuneles.set(clave(b[0], b[1]), a); }
    return [clasica, cintas, tuneles];
  })();
  let arena = ARENAS[0];

  // ── El patio: losas, pasto alrededor, muralla de piedra, antorchas y banderines ──
  const losa = ladrillo('#cdbfa6', '#a8987e', 2);
  losa.repeat.set(COLS / 2, FILAS / 2);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(AN, FO), new THREE.MeshLambertMaterial({ map: losa }));
  piso.rotation.x = -Math.PI / 2;
  const pasto = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: '#6aa85a' }));
  pasto.rotation.x = -Math.PI / 2;
  pasto.position.y = -0.02;
  e.escena.add(pasto, piso);
  await bosque(e.escena, 'naturaleza', 'tree_pineRoundA', Array.from({ length: 30 }, () => { const a = r() * 6.28; return { x: Math.cos(a) * (AN / 2 + 4 + r() * 10), z: Math.sin(a) * (FO / 2 + 4 + r() * 8), alto: 4 + r() * 3, giro: r() * 6 }; }));

  // Bloques: muros firmes (piedra) y cajas que se rompen (madera), como instancias
  const piedra = ladrillo('#9a97a6', '#6d6a78', 3);
  const lienzo = (dibujar: (g: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    dibujar(cv.getContext('2d')!);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  // Caja de madera: tablones, marco oscuro y refuerzo en X
  const madera = lienzo((g) => {
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#c99a5a' : '#bb8c4f'; g.fillRect(0, i * 16, 64, 16); }
    g.strokeStyle = '#7a4b2c'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
    g.lineWidth = 5; g.beginPath(); g.moveTo(6, 6); g.lineTo(58, 58); g.moveTo(58, 6); g.lineTo(6, 58); g.stroke();
  });
  const firmes = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA, 1.5, CELDA).translate(0, 0.75, 0), new THREE.MeshLambertMaterial({ map: piedra }), COLS * FILAS);
  const cajas = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA * 0.92, 1.2, CELDA * 0.92).translate(0, 0.6, 0), new THREE.MeshLambertMaterial({ map: madera }), COLS * FILAS);
  cajas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  e.escena.add(firmes, cajas);
  // Antorchas en las esquinas de la muralla
  const brillo = new THREE.SpriteMaterial({ map: halo('rgba(255,170,60,0.85)'), depthWrite: false, blending: THREE.AdditiveBlending });
  const llamas: THREE.Sprite[] = [];
  for (const [cx, cz] of [[0, 0], [COLS - 1, 0], [0, FILAS - 1], [COLS - 1, FILAS - 1], [7, 0], [7, FILAS - 1]]) {
    const p = centro(cx, cz), palo = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 6), mat('#5d3a22')), fuego = new THREE.Sprite(brillo);
    palo.position.set(p.x, 1.95, p.z);
    fuego.position.set(p.x, 2.55, p.z);
    fuego.scale.set(1.6, 1.6, 1);
    e.escena.add(palo, fuego);
    llamas.push(fuego);
  }
  // Cinta: flechas amarillas sobre goma oscura, que avanzan
  const texCinta = lienzo((g) => {
    g.fillStyle = '#3b3b44'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#2c2c33'; for (let i = 0; i < 64; i += 8) g.fillRect(0, i, 64, 3);
    g.fillStyle = '#f4c430'; g.beginPath(); g.moveTo(32, 10); g.lineTo(54, 34); g.lineTo(42, 34); g.lineTo(42, 54); g.lineTo(22, 54); g.lineTo(22, 34); g.lineTo(10, 34); g.closePath(); g.fill();
  });
  texCinta.wrapS = texCinta.wrapT = THREE.RepeatWrapping;
  const matCinta = new THREE.MeshLambertMaterial({ map: texCinta }), geoLosa = new THREE.PlaneGeometry(CELDA * 0.98, CELDA * 0.98).rotateX(-Math.PI / 2);
  const decorado = new THREE.Group();
  e.escena.add(decorado);

  // ── Estado del tablero ──
  // 0 libre · 1 muro · 2 caja · 3 cierre (muro que cae al final de la ronda)
  let tablero: number[][] = [];
  const ocultas = new Map<number, Mejora>(); // celda de una caja → la mejora que esconde
  const mejoras = new Map<number, { tipo: Mejora; malla: THREE.Group; nace: number }>();
  const fuego = new Map<number, number>(); // celda → hasta cuándo arde
  const quienQuemo = new Map<number, Jugador>(); // celda → dueño de la bomba que la incendió
  const bombas: Bomba[] = [];
  const geoFuego = new THREE.BoxGeometry(CELDA * 0.92, 0.9, CELDA * 0.92);
  const matFuego = new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.85 });
  const llamarada = new THREE.InstancedMesh(geoFuego, matFuego, COLS * FILAS);
  llamarada.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  llamarada.frustumCulled = false; // las llamas aparecen en cualquier celda: la esfera calculada al inicio no las cubre
  // Alcance a la vista: la cruz que va a quemar cada bomba, más roja cuanto menos le queda
  const alcance = new THREE.InstancedMesh(geoLosa, new THREE.MeshBasicMaterial({ color: '#ff3b2e', transparent: true, opacity: 0.2, depthWrite: false }), COLS * FILAS);
  alcance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  alcance.frustumCulled = false;
  e.escena.add(llamarada, alcance);
  const o = new THREE.Object3D();

  // Las mejoras: una placa de color con su ícono encima
  const texMejora = new Map<Mejora, THREE.Texture>();
  const iconoDe = (m: Mejora) => {
    let t = texMejora.get(m);
    if (!t) {
      t = lienzo((g) => { g.fillStyle = COLOR_MEJORA[m]; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke(); g.font = '34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ICONO[m], 32, 35); });
      texMejora.set(m, t);
    }
    return t;
  };
  const soltarMejora = (tipo: Mejora, x: number, z: number, t: number) => {
    const p = centro(x, z), g = new THREE.Group(), placa = new THREE.Mesh(new THREE.BoxGeometry(CELDA * 0.7, 0.18, CELDA * 0.7), mat(COLOR_MEJORA[tipo])), icono = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconoDe(tipo) }));
    placa.position.y = 0.09; icono.position.y = 0.95; icono.scale.set(1.05, 1.05, 1);
    g.add(placa, icono);
    g.position.set(p.x, 0, p.z);
    e.escena.add(g);
    mejoras.set(clave(x, z), { tipo, malla: g, nace: t + FUEGO }); // no la quema el mismo fuego que la soltó
  };

  const pintarBloques = () => {
    let f = 0, k = 0;
    tablero.forEach((fila, cz) => fila.forEach((v, cx) => {
      const p = centro(cx, cz);
      o.position.set(p.x, 0, p.z); o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0); o.updateMatrix();
      if (v === 1 || v === 3) firmes.setMatrixAt(f++, o.matrix);
      if (v === 2) cajas.setMatrixAt(k++, o.matrix);
    }));
    firmes.count = f; cajas.count = k;
    firmes.instanceMatrix.needsUpdate = cajas.instanceMatrix.needsUpdate = true;
  };
  const armarTablero = (ronda: number) => {
    arena = ARENAS[ronda % ARENAS.length];
    const rr = generador(`${c.semilla}|ronda${ronda}`);
    tablero = Array.from({ length: FILAS }, (_, cz) => Array.from({ length: COLS }, (_, cx) => {
      if (cx === 0 || cz === 0 || cx === COLS - 1 || cz === FILAS - 1 || (cx % 2 === 0 && cz % 2 === 0)) return 1;
      // Las esquinas de salida, las cintas y los túneles quedan libres
      if (ESQUINAS.some(([ex, ez]) => Math.abs(ex - cx) + Math.abs(ez - cz) <= 1) || arena.cintas.has(clave(cx, cz)) || arena.tuneles.has(clave(cx, cz))) return 0;
      return rr() < arena.densidad ? 2 : 0;
    }));
    // Qué esconde cada caja: de la semilla de la ronda, rompa quien la rompa
    ocultas.clear();
    const conCaja: number[] = [];
    tablero.forEach((fila, cz) => fila.forEach((v, cx) => { if (v === 2) conCaja.push(clave(cx, cz)); }));
    for (let i = conCaja.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [conCaja[i], conCaja[j]] = [conCaja[j], conCaja[i]]; }
    let n = 0;
    for (const [tipo, cuantas] of REPARTO) for (let i = 0; i < cuantas && n < conCaja.length; i++) ocultas.set(conCaja[n++], tipo);
    for (const m of mejoras.values()) e.escena.remove(m.malla);
    mejoras.clear();
    fuego.clear();
    for (const b of bombas) e.escena.remove(b.malla);
    bombas.length = 0;
    decorado.clear();
    for (const [k, [dx, dz]] of arena.cintas) {
      const p = centro(k % COLS, Math.floor(k / COLS)), m = new THREE.Mesh(geoLosa, matCinta);
      m.position.set(p.x, 0.015, p.z); m.rotation.y = Math.atan2(-dx, -dz);
      decorado.add(m);
    }
    const coloresTunel = ['#b06cff', '#2ec4ff'];
    [...arena.tuneles.keys()].forEach((k, i) => {
      const p = centro(k % COLS, Math.floor(k / COLS)), color = coloresTunel[i < 2 ? 0 : 1];
      const hoyo = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#15121c' }));
      const aro = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.1, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
      hoyo.position.set(p.x, 0.02, p.z); aro.position.set(p.x, 0.06, p.z);
      decorado.add(hoyo, aro);
    });
    pintarBloques();
  };

  // ── Jugadores ──
  const piloto = import.meta.env.DEV && new URLSearchParams(location.search).has('piloto');
  const personajes = await Promise.all([0, 1, 2, 3].map((i) => e.personaje(i === 0 ? c.aspecto : aspectoAleatorio(generador(`${c.semilla}|bombista${i}`)), 1.5)));
  const jugadores: Jugador[] = personajes.map((k, i) => {
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.45, i === 0 ? 0.72 : 0.6, 20), new THREE.MeshBasicMaterial({ color: COLORES[i], side: THREE.DoubleSide }));
    aro.rotation.x = -Math.PI / 2;
    e.escena.add(aro);
    return { id: i, x: 0, z: 0, vivo: true, bombas: 1, llama: 2, vel: 3.6, patear: false, guante: false, mal: null, mira: [0, 1], tunel: -1, k, aro, camino: [], piensa: 0, humano: i === 0, ia: i !== 0 || piloto };
  });
  const yo = jugadores[0];
  const reiniciar = () => jugadores.forEach((j, i) => {
    const p = centro(...ESQUINAS[i]);
    Object.assign(j, { x: p.x, z: p.z, vivo: true, bombas: 1, llama: 2, vel: j.ia && !j.humano && c.libre ? 2.6 : 3.6, patear: false, guante: false, mal: null, mira: [0, 1], tunel: -1, camino: [], piensa: r() * 0.5 });
    j.k.grupo.visible = j.aro.visible = true;
    j.k.grupo.scale.y = Math.abs(j.k.grupo.scale.x);
    j.k.animar('idle');
  });
  const maldicion = (j: Jugador, t: number) => (j.mal && t < j.mal.hasta ? j.mal.tipo : null);
  const velDe = (j: Jugador, t: number) => { const m = maldicion(j, t); return m === 'lento' ? 2.2 : m === 'rapido' ? 7.5 : j.vel; };
  const llamaDe = (j: Jugador, t: number) => (maldicion(j, t) === 'chispa' ? 1 : j.llama);

  const bombaEn = (cx: number, cz: number) => bombas.find((b) => b.cx === cx && b.cz === cz);
  /** Si un jugador puede pararse en la celda (las bombas que acaba de dejar no lo atrapan). */
  const pasable = (cx: number, cz: number, j?: Jugador) => {
    if (cx < 0 || cz < 0 || cx >= COLS || cz >= FILAS || tablero[cz][cx] !== 0) return false;
    const b = bombaEn(cx, cz);
    return !b || (!!j && b.libres.has(j.id));
  };
  const puedePoner = (j: Jugador, t: number) => { const [cx, cz] = celda(j.x, j.z); return maldicion(j, t) !== 'seco' && !bombaEn(cx, cz) && bombas.filter((b) => b.de === j).length < j.bombas; };

  const ponerBomba = (j: Jugador, t: number) => {
    if (!puedePoner(j, t)) return false;
    const [cx, cz] = celda(j.x, j.z);
    const p = centro(cx, cz), g = new THREE.Group(), cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), mat('#26262e')), mecha = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6).translate(0, 0.2, 0), mat('#c9a86a'));
    cuerpo.position.y = 0.5; mecha.position.y = 0.98;
    const tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), mat(COLORES[j.id]));
    tapa.position.y = 0.97;
    g.add(cuerpo, mecha, tapa);
    g.position.set(p.x, 0, p.z);
    e.escena.add(g);
    // Quien está sobre la celda al ponerla puede salir de ella
    const libres = new Set(jugadores.filter((x) => x.vivo && clave(...celda(x.x, x.z)) === clave(cx, cz)).map((x) => x.id));
    bombas.push({ cx, cz, x: p.x, z: p.z, t: t + MECHA, de: j, llama: llamaDe(j, t), malla: g, mecha, desliza: null, rapidez: 9, libres });
    if (j.humano) e.sonido.efecto('click', 0.5);
    return true;
  };
  /** Guante: levanta la bomba que tienes a los pies y la lanza tres casillas hacia donde miras (si cae en algo, sigue de largo). */
  const lanzar = (j: Jugador, t: number) => {
    const [cx, cz] = celda(j.x, j.z), b = bombaEn(cx, cz);
    if (!b || b.vuela) return false;
    const [dx, dz] = j.mira, ancho = COLS - 2, alto = FILAS - 2;
    for (let k = 3; k < 3 + ancho + alto; k++) {
      const x = 1 + ((((cx - 1 + dx * k) % ancho) + ancho) % ancho), z = 1 + ((((cz - 1 + dz * k) % alto) + alto) % alto);
      if (tablero[z][x] !== 0 || bombaEn(x, z)) continue;
      const p = centro(x, z);
      b.vuela = { x: b.x, z: b.z, desde: t };
      b.cx = x; b.cz = z; b.x = p.x; b.z = p.z; b.desliza = null; b.t = Math.max(b.t, t + 0.9);
      b.libres = new Set(jugadores.filter((q) => q.vivo && clave(...celda(q.x, q.z)) === clave(x, z)).map((q) => q.id));
      e.sonido.efecto('soltar', 0.5);
      return true;
    }
    return false;
  };

  /** Celdas que alcanzaría una explosión en cruz. */
  const cruz = (cx: number, cz: number, llama: number) => {
    const lista: [number, number][] = [[cx, cz]];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= llama; k++) {
      const x = cx + dx * k, z = cz + dz * k, v = tablero[z]?.[x];
      if (v === undefined || v === 1 || v === 3) break;
      lista.push([x, z]);
      if (v === 2) break;
    }
    return lista;
  };
  let cajasYo = 0, cajasRonda = 0, elimYo = 0, elimRonda = 0, mejorasYo = 0;
  const estallar = (b: Bomba, t: number) => {
    const i = bombas.indexOf(b);
    if (i < 0) return;
    bombas.splice(i, 1);
    e.escena.remove(b.malla);
    for (const [x, z] of cruz(b.cx, b.cz, b.llama)) {
      fuego.set(clave(x, z), t + FUEGO);
      quienQuemo.set(clave(x, z), b.de);
      if (tablero[z][x] === 2) {
        tablero[z][x] = 0;
        const p = centro(x, z);
        e.chispas(p.x, 0.8, p.z, ['#c99a5a', '#8a5a38', '#ffd23c'], 8, 4);
        if (b.de === yo) { cajasYo++; cajasRonda++; e.flotante(`+${PUNTOS.caja}`, p.x, 1.6, p.z, ''); }
        const tipo = ocultas.get(clave(x, z));
        if (tipo) soltarMejora(tipo, x, z, t);
      } else {
        // El fuego quema las mejoras que ya estaban en el suelo
        const m = mejoras.get(clave(x, z));
        if (m && t > m.nace) { e.escena.remove(m.malla); mejoras.delete(clave(x, z)); }
      }
      const otra = bombaEn(x, z);
      if (otra && !otra.vuela) otra.t = Math.min(otra.t, t + 0.08); // reacción en cadena
    }
    pintarBloques();
    e.chispas(b.x, 1, b.z, ['#ff6a1e', '#ffd23c', '#3a3a44'], 22, 6);
    e.temblar(0.35);
    e.sonido.ruido(0.4, 0.28);
  };

  // ── Rondas y cierre del patio ──
  let ronda = 0, inicioRonda = 0, ganadas = 0, empezado = false, terminado = false, entreRondas = -1, cierres = 0, ptsPuestos = 0;
  const puestos: number[] = [];
  const ordenCierre: [number, number][] = [];
  { // espiral desde el borde hacia adentro
    let x0 = 1, z0 = 1, x1 = COLS - 2, z1 = FILAS - 2;
    while (x0 <= x1 && z0 <= z1) {
      for (let x = x0; x <= x1; x++) ordenCierre.push([x, z0]);
      for (let z = z0 + 1; z <= z1; z++) ordenCierre.push([x1, z]);
      for (let x = x1 - 1; x >= x0; x--) ordenCierre.push([x, z1]);
      for (let z = z1 - 1; z > z0; z--) ordenCierre.push([x0, z]);
      x0++; z0++; x1--; z1--;
    }
  }
  const turnoCierre = new Map(ordenCierre.map(([x, z], i) => [clave(x, z), i]));

  // ── Máquina: sabe cuándo estalla cada celda (con cadenas) y solo pone una bomba si tiene a tiempo una salida segura ──
  const peligros = (t: number, extra?: Bomba): Peligro => {
    const lista = extra ? [...bombas, extra] : bombas, en = (x: number, z: number) => lista.find((b) => b.cx === x && b.cz === z);
    const cuando = new Map(lista.map((b) => [b, b.t] as [Bomba, number]));
    for (let vuelta = 0; vuelta < 4; vuelta++) for (const b of lista) for (const [x, z] of cruz(b.cx, b.cz, b.llama)) {
      const otra = en(x, z);
      if (otra && otra !== b && cuando.get(otra)! > cuando.get(b)! + 0.08) cuando.set(otra, cuando.get(b)! + 0.08);
    }
    const p: Peligro = new Map(), marcar = (k: number, desde: number, hasta: number) => { const a = p.get(k); p.set(k, a ? [Math.min(a[0], desde), Math.max(a[1], hasta)] : [desde, hasta]); };
    for (const b of lista) { const tb = cuando.get(b)!; for (const [x, z] of cruz(b.cx, b.cz, b.llama)) marcar(clave(x, z), tb, tb + FUEGO); }
    for (const [k, hasta] of fuego) marcar(k, t - 1, hasta);
    if (!c.libre && t - inicioRonda > CIERRE - 6) for (let i = cierres; i < ordenCierre.length; i++) {
      const cae = inicioRonda + CIERRE + i * PASO_CIERRE;
      if (cae > t + 5) break;
      marcar(clave(...ordenCierre[i]), cae, Infinity);
    }
    return p;
  };
  const vecinos = (x: number, z: number): [number, number][] => {
    const v: [number, number][] = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]], otro = arena.tuneles.get(clave(x, z));
    if (otro) v.push(otro);
    return v;
  };
  const camino = (previo: Map<number, number>, inicio: number, fin: number) => {
    const lista: [number, number][] = [];
    for (let k = fin; k !== inicio; k = previo.get(k)!) lista.unshift([k % COLS, Math.floor(k / COLS)]);
    return lista;
  };
  /** Ruta a una celda que no va a quemar, sin pisar ninguna mientras arde (cuenta el tiempo que tarda en llegar). */
  const rutaSegura = (j: Jugador, t: number, p: Peligro, max = 9) => {
    const desde = celda(j.x, j.z), inicio = clave(...desde), paso = CELDA / velDe(j, t), previo = new Map<number, number>([[inicio, -1]]);
    let capa: [number, number][] = [desde];
    for (let d = 0; d <= max && capa.length; d++) {
      const sig: [number, number][] = [];
      for (const [x, z] of capa) {
        if (!p.has(clave(x, z))) return camino(previo, inicio, clave(x, z));
        if (d === max) continue;
        for (const [nx, nz] of vecinos(x, z)) {
          const k = clave(nx, nz);
          if (previo.has(k) || !pasable(nx, nz, j)) continue;
          const llega = t + 0.1 + (d + 0.5) * paso, q = p.get(k);
          if (q && llega < q[1] + 0.05 && llega + paso > q[0] - 0.15) continue;
          previo.set(k, clave(x, z)); sig.push([nx, nz]);
        }
      }
      capa = sig;
    }
    return null;
  };
  /** Ruta más corta a una celda que cumpla la meta, sin pasar por ninguna celda con peligro. */
  const buscar = (j: Jugador, meta: (x: number, z: number) => boolean, p: Peligro, max = 120) => {
    const desde = celda(j.x, j.z), inicio = clave(...desde), previo = new Map<number, number>([[inicio, -1]]), cola: [number, number][] = [desde];
    for (let i = 0; i < cola.length && i < max; i++) {
      const [x, z] = cola[i];
      if (meta(x, z)) return camino(previo, inicio, clave(x, z));
      for (const [nx, nz] of vecinos(x, z)) {
        const k = clave(nx, nz);
        if (previo.has(k) || !pasable(nx, nz, j) || p.has(k)) continue;
        previo.set(k, clave(x, z)); cola.push([nx, nz]);
      }
    }
    return null;
  };
  const pensar = (j: Jugador, t: number, p: Peligro) => {
    const aqui = celda(j.x, j.z), tr = t - inicioRonda;
    j.piensa = t + (c.libre ? 0.6 : 0.36 - nivel * 0.05) + r() * 0.2;
    if (p.has(clave(...aqui))) {
      j.camino = rutaSegura(j, t, p) ?? buscar(j, (x, z) => !p.has(clave(x, z)), new Map()) ?? [];
      j.piensa = t + 0.12;
      return;
    }
    const rivales = jugadores.filter((x) => x.vivo && x !== j), agresion = c.libre ? 0.2 : 0.42 + nivel * 0.08, llama = llamaDe(j, t);
    const alcanza = cruz(aqui[0], aqui[1], llama), enLinea = rivales.some((x) => alcanza.some(([a, b]) => clave(a, b) === clave(...celda(x.x, x.z))));
    if ((enLinea || alcanza.some(([x, z]) => tablero[z][x] === 2)) && puedePoner(j, t) && r() < (enLinea ? agresion + 0.3 : agresion)) {
      const falsa = { cx: aqui[0], cz: aqui[1], t: t + MECHA, llama, libres: new Set([j.id]) } as Bomba;
      const huida = rutaSegura(j, t, peligros(t, falsa), 7);
      if (huida?.length && ponerBomba(j, t)) { j.camino = huida; j.piensa = t + 0.3; return; }
    }
    // A quién va a buscar: según la jornada, uno, dos o los tres rivales te persiguen a ti
    const cerca = (a: Jugador) => Math.abs(a.x - j.x) + Math.abs(a.z - j.z);
    const presa = !c.libre && j !== yo && yo.vivo && j.id <= nivel ? yo : [...rivales].sort((a, b) => cerca(a) - cerca(b))[0];
    const linea = new Set(presa ? cruz(...celda(presa.x, presa.z), Math.min(llama, 4)).map(([a, b]) => clave(a, b)) : []);
    const quedan = tablero.reduce((s, f) => s + f.filter((v) => v === 2).length, 0);
    const mejora = (x: number, z: number) => { const m = mejoras.get(clave(x, z)); return !!m && m.tipo !== 'calavera'; };
    const juntoCaja = (x: number, z: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => tablero[z + dz]?.[x + dx] === 2);
    const enLaPresa = (x: number, z: number) => linea.has(clave(x, z));
    let ruta: [number, number][] | null;
    if (!c.libre && tr > CIERRE - 4) {
      // El patio se cierra: hacia el centro, y si se puede, en línea con la presa
      const adentro = (x: number, z: number) => (turnoCierre.get(clave(x, z)) ?? 0) > cierres + 30;
      ruta = buscar(j, (x, z) => adentro(x, z) && enLaPresa(x, z), p) ?? buscar(j, adentro, p);
    } else {
      const cazar = tr > 22 || quedan < 25;
      ruta = buscar(j, mejora, p, 30) ?? (cazar ? buscar(j, enLaPresa, p) : null) ?? buscar(j, juntoCaja, p) ?? buscar(j, enLaPresa, p);
    }
    j.camino = (ruta ?? []).slice(0, 8);
  };

  // ── Movimiento sobre la grilla: avanza por los pasillos y se acomoda al centro de la fila o columna ──
  const mover = (j: Jugador, dx: number, dz: number, paso: number, girar = true) => {
    const [cx, cz] = celda(j.x, j.z), p = centro(cx, cz);
    if (Math.abs(dx) > Math.abs(dz)) {
      const s = Math.sign(dx), sig = [cx + s, cz] as const;
      if (girar) { j.mira = [s, 0]; j.k.grupo.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; }
      if (Math.abs(j.z - p.z) > 0.05) { j.z += Math.sign(p.z - j.z) * Math.min(paso, Math.abs(p.z - j.z)); return; }
      if (pasable(sig[0], sig[1], j) || s * (p.x - j.x) > 0.02) j.x += s * Math.min(paso, pasable(sig[0], sig[1], j) ? paso : Math.abs(p.x - j.x));
      else if (j.patear && girar) { const b = bombaEn(...sig); if (b && !b.desliza && !b.vuela) { b.desliza = [s, 0]; b.rapidez = 9; } }
    } else if (dz) {
      const s = Math.sign(dz), sig = [cx, cz + s] as const;
      if (girar) { j.mira = [0, s]; j.k.grupo.rotation.y = s > 0 ? 0 : Math.PI; }
      if (Math.abs(j.x - p.x) > 0.05) { j.x += Math.sign(p.x - j.x) * Math.min(paso, Math.abs(p.x - j.x)); return; }
      if (pasable(sig[0], sig[1], j) || s * (p.z - j.z) > 0.02) j.z += s * Math.min(paso, pasable(sig[0], sig[1], j) ? paso : Math.abs(p.z - j.z));
      else if (j.patear && girar) { const b = bombaEn(...sig); if (b && !b.desliza && !b.vuela) { b.desliza = [0, s]; b.rapidez = 9; } }
    }
  };

  const nuevaRonda = (t: number) => {
    armarTablero(ronda);
    reiniciar();
    inicioRonda = t; cierres = 0; cajasRonda = 0; elimRonda = 0;
    e.hud.aviso(`${!c.libre && ronda === RONDAS - 1 ? '¡Ronda final!' : `Ronda ${ronda + 1}`} · ${arena.nombre}`, 'oro', 1.6);
  };
  const morir = (j: Jugador, por?: Jugador) => {
    if (!j.vivo) return;
    j.vivo = false;
    j.aro.visible = false;
    j.k.animar('die', true);
    setTimeout(() => { if (!j.vivo) j.k.grupo.visible = false; }, 900);
    e.chispas(j.x, 1.2, j.z, [COLORES[j.id], '#ffffff'], 20, 5);
    if (por === yo && j !== yo) { elimYo++; elimRonda++; e.flotante(`+${PUNTOS.eliminado}`, j.x, 2, j.z, 'oro'); }
    if (j === yo) { e.sonido.mal(); e.hud.aviso('¡Te alcanzó!', 'mal', 1.2); }
  };
  const puntaje = () => ptsPuestos + elimYo * PUNTOS.eliminado + cajasYo * PUNTOS.caja + mejorasYo * PUNTOS.mejora;
  const terminar = () => {
    terminado = true;
    e.detener();
    c.alTerminar({
      puntaje: puntaje(),
      lineas: [['Rondas ganadas', `${ganadas} de ${RONDAS}`], ['Puestos', puestos.map((p) => `${p}.º`).join(' · ')], ['Rivales que eliminaste', String(elimYo)], ['Cajas rotas', String(cajasYo)], ['Mejoras tomadas', String(mejorasYo)]],
      detalle: { version: 2, ganadas, puestos, eliminados: elimYo, cajas: cajasYo, mejoras: mejorasYo },
    });
  };
  const cerrarRonda = (t: number) => {
    const otros = jugadores.filter((x) => x.vivo && x !== yo).length, puesto = yo.vivo ? (otros ? 2 : 1) : 1 + otros;
    const activo = cajasRonda > 0 || elimRonda > 0, pts = activo ? PUNTOS.puesto[puesto - 1] : 0;
    puestos.push(puesto);
    if (!c.libre) ptsPuestos += pts;
    if (puesto === 1) { ganadas++; e.hud.aviso(activo ? `¡Ganaste la ronda! +${pts}` : '¡Ganaste! Pero sin romper cajas ni eliminar a nadie, no suma', activo ? 'oro' : '', 2); e.chispas(yo.x, 1.5, yo.z, ['#ffd23c', '#3f8cff', '#ffffff'], 50, 7); e.sonido.bien(); yo.k.animar('emote-yes'); }
    else if (pts) e.hud.aviso(`${puesto}.º lugar · +${pts}`, '', 1.6);
    entreRondas = t + 2.2;
  };

  // Solo en pruebas: ?ronda=N empieza en esa arena
  if (import.meta.env.DEV) { const n = Number(new URLSearchParams(location.search).get('ronda')); if (n >= 1 && n <= RONDAS) ronda = n - 1; }
  armarTablero(ronda);
  reiniciar();
  e.hud.tiempo(c.libre ? '∞' : mmss(DURA_RONDA));
  e.hud.puntos(0);
  let foco = { x: 0, z: 0.6 };
  e.alCuadro((t, dt) => {
    for (const f of llamas) f.scale.setScalar(1.5 + Math.sin(t * 13 + f.position.x) * 0.15);
    texCinta.offset.y = -t * (VEL_CINTA / CELDA);
    if (empezado && !terminado) {
      if (entreRondas >= 0) {
        if (t < entreRondas) return;
        entreRondas = -1;
        if (++ronda >= RONDAS && !c.libre) return terminar();
        nuevaRonda(t);
      }
      const tr = t - inicioRonda, paso = Math.min(dt, 0.05);
      let p: Peligro | null = null;
      // Movimiento
      for (const j of jugadores) {
        if (!j.vivo) continue;
        let dx = 0, dz = 0;
        if (!j.ia) { dx = mando.x; dz = mando.z; if (mando.tomarAccion() && !(j.guante && lanzar(j, t))) ponerBomba(j, t); }
        else {
          p ??= peligros(t);
          if (t > j.piensa) pensar(j, t, p);
          const sig = j.camino[0], [cx, cz] = celda(j.x, j.z);
          if (sig) {
            // Un túnel: primero al centro del agujero, que lo lleva al otro lado
            const lejos = Math.abs(sig[0] - cx) + Math.abs(sig[1] - cz) > 1, meta = centro(...(lejos ? [cx, cz] as [number, number] : sig));
            dx = meta.x - j.x; dz = meta.z - j.z;
            if (!lejos && Math.hypot(dx, dz) < 0.08) { j.camino.shift(); dx = dz = 0; }
            else if (!pasable(sig[0], sig[1], j)) j.camino = [];
            // Si va tranquilo y el próximo paso se volvió peligroso, espera y lo piensa de nuevo
            else if (!p.has(clave(cx, cz)) && p.has(clave(...sig))) { j.camino = []; dx = dz = 0; j.piensa = Math.min(j.piensa, t + 0.1); }
          }
        }
        const moviendo = Math.abs(dx) > 0.15 || Math.abs(dz) > 0.15;
        if (moviendo) mover(j, dx, dz, velDe(j, t) * paso);
        j.k.animar(moviendo ? 'sprint' : 'idle');
        // Cintas y túneles
        let [cx, cz] = celda(j.x, j.z);
        const cinta = arena.cintas.get(clave(cx, cz));
        if (cinta) mover(j, cinta[0], cinta[1], VEL_CINTA * paso, false);
        [cx, cz] = celda(j.x, j.z);
        const destino = arena.tuneles.get(clave(cx, cz));
        if (!destino) j.tunel = -1;
        else if (j.tunel !== clave(cx, cz)) {
          const a = centro(cx, cz);
          if (Math.hypot(j.x - a.x, j.z - a.z) < 0.3) {
            const b = centro(...destino);
            e.chispas(a.x, 0.6, a.z, ['#b06cff', '#2ec4ff'], 12, 3);
            j.x = b.x; j.z = b.z; j.tunel = clave(...destino);
            e.chispas(b.x, 0.6, b.z, ['#b06cff', '#2ec4ff'], 12, 3);
            if (j.humano) e.sonido.tono(700, 0.2, { tipo: 'sine', vol: 0.08, hasta: 1400 });
            [cx, cz] = destino;
          }
        }
        // Mejoras
        const m = mejoras.get(clave(cx, cz));
        if (m) {
          e.escena.remove(m.malla); mejoras.delete(clave(cx, cz));
          if (m.tipo === 'bomba') j.bombas = Math.min(8, j.bombas + 1);
          if (m.tipo === 'llama') j.llama = Math.min(8, j.llama + 1);
          if (m.tipo === 'maximo') j.llama = 8;
          if (m.tipo === 'vel') j.vel = Math.min(6.2, j.vel + 0.55);
          if (m.tipo === 'patear') j.patear = true;
          if (m.tipo === 'guante') j.guante = true;
          if (m.tipo === 'calavera') { j.mal = { tipo: MALDICIONES[Math.floor(r() * MALDICIONES.length)], hasta: t + MALDITO }; if (j.humano) e.hud.aviso(AVISO_MALDICION[j.mal.tipo], 'mal', 1.8); }
          if (j.humano) {
            if (m.tipo !== 'calavera') { mejorasYo++; e.sonido.efecto('campana', 0.5); e.flotante(`${ICONO[m.tipo]} +${PUNTOS.mejora}`, j.x, 2, j.z, 'oro'); }
            else e.sonido.mal();
          }
        }
        // La calavera: hace lo suyo y se contagia al tocar a otro
        const mal = maldicion(j, t);
        if (mal === 'diarrea') ponerBomba(j, t);
        if (mal) {
          (j.aro.material as THREE.MeshBasicMaterial).color.set(Math.sin(t * 16) > 0 ? '#222' : COLORES[j.id]);
          for (const otro of jugadores) if (otro !== j && otro.vivo && !maldicion(otro, t) && Math.hypot(otro.x - j.x, otro.z - j.z) < 0.8) {
            otro.mal = { ...j.mal! };
            if (otro.humano) e.hud.aviso(`Te contagiaron: ${AVISO_MALDICION[otro.mal.tipo].toLowerCase()}`, 'mal', 1.8);
          }
        } else (j.aro.material as THREE.MeshBasicMaterial).color.set(COLORES[j.id]);
        // Las bombas dejan de ser "propias" apenas el jugador sale de su celda
        for (const b of bombas) if (b.libres.has(j.id) && (b.cx !== cx || b.cz !== cz)) b.libres.delete(j.id);
      }
      // Bombas: vuelan si las lanzaron, deslizan si las patearon o van en una cinta, y estallan a su hora
      let n = 0;
      const marcadas = new Set<number>();
      for (const b of [...bombas]) {
        const queda = Math.max(0, b.t - t);
        b.malla.scale.setScalar(1 + Math.max(0, Math.sin((t - b.t) * 18)) * 0.12 * (queda < 1 ? 2 : 1));
        b.mecha.scale.y = Math.max(0.05, Math.min(1, queda / MECHA));
        if (b.vuela) {
          const f = Math.min(1, (t - b.vuela.desde) / 0.45);
          b.malla.position.set(b.vuela.x + (b.x - b.vuela.x) * f, Math.sin(f * Math.PI) * 2.5, b.vuela.z + (b.z - b.vuela.z) * f);
          if (f >= 1) { b.vuela = undefined; b.malla.position.y = 0; }
          continue;
        }
        if (!b.desliza) { const cinta = arena.cintas.get(clave(b.cx, b.cz)); if (cinta) { b.desliza = cinta; b.rapidez = VEL_CINTA; } }
        if (b.desliza) {
          const [sx, sz] = b.desliza, nx = b.cx + sx, nz = b.cz + sz, q = centro(nx, nz);
          const libre = tablero[nz]?.[nx] === 0 && !bombaEn(nx, nz) && !jugadores.some((x) => x.vivo && clave(...celda(x.x, x.z)) === clave(nx, nz));
          if (!libre) { b.desliza = null; const a = centro(b.cx, b.cz); b.x = a.x; b.z = a.z; }
          else {
            b.x += Math.sign(q.x - b.x) * Math.min(Math.abs(q.x - b.x), b.rapidez * dt); b.z += Math.sign(q.z - b.z) * Math.min(Math.abs(q.z - b.z), b.rapidez * dt);
            if (Math.hypot(q.x - b.x, q.z - b.z) < 0.01) { b.cx = nx; b.cz = nz; if (b.rapidez < 9) b.desliza = arena.cintas.get(clave(nx, nz)) ?? null; }
          }
          b.malla.position.set(b.x, 0, b.z);
        }
        if (t >= b.t) { estallar(b, t); continue; }
        if (Math.random() < dt * 20) e.chispas(b.x, 0.98 + 0.4 * (queda / MECHA), b.z, ['#ffd23c', '#ff6a1e'], 1, 1.2);
        // La cruz que va a quemar
        for (const [x, z] of cruz(b.cx, b.cz, b.llama)) {
          const k = clave(x, z);
          if (marcadas.has(k)) continue;
          marcadas.add(k);
          const a = centro(x, z);
          o.position.set(a.x, 0.03, a.z); o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0); o.updateMatrix();
          alcance.setMatrixAt(n++, o.matrix);
        }
      }
      alcance.count = n;
      alcance.instanceMatrix.needsUpdate = true;
      // Fuego: dibuja las llamas y quema a quien esté dentro
      n = 0;
      for (const [k, hasta] of [...fuego]) {
        if (t > hasta) { fuego.delete(k); continue; }
        const x = k % COLS, z = Math.floor(k / COLS), a = centro(x, z), vida = (hasta - t) / FUEGO;
        o.position.set(a.x, 0.45, a.z); o.scale.set(vida, 0.4 + vida, vida); o.updateMatrix();
        llamarada.setMatrixAt(n++, o.matrix);
        for (const j of jugadores) if (j.vivo && clave(...celda(j.x, j.z)) === k) morir(j, quienQuemo.get(k));
      }
      llamarada.count = n;
      llamarada.instanceMatrix.needsUpdate = true;
      // El patio se cierra en espiral hasta llenarse
      if (!c.libre && tr > CIERRE) {
        const deben = Math.min(ordenCierre.length, Math.floor((tr - CIERRE) / PASO_CIERRE) + 1);
        let cambio = false;
        while (cierres < deben) {
          const [x, z] = ordenCierre[cierres++];
          if (tablero[z][x] === 1) continue;
          tablero[z][x] = 3; cambio = true;
          const b = bombaEn(x, z); if (b) { e.escena.remove(b.malla); bombas.splice(bombas.indexOf(b), 1); }
          const m = mejoras.get(clave(x, z)); if (m) { e.escena.remove(m.malla); mejoras.delete(clave(x, z)); }
          for (const j of jugadores) if (j.vivo && clave(...celda(j.x, j.z)) === clave(x, z)) morir(j);
          const a = centro(x, z); e.chispas(a.x, 1.4, a.z, ['#9a97a6', '#6d6a78'], 4, 2);
        }
        if (cambio) { pintarBloques(); e.temblar(0.08); }
        if (cierres === 1) e.hud.aviso('¡El patio se está cerrando!', 'mal', 1.4);
      }
      const vivos = jugadores.filter((x) => x.vivo);
      if (!yo.vivo || vivos.length <= 1 || (!c.libre && tr >= DURA_RONDA)) cerrarRonda(t);
      if (!c.libre) e.hud.tiempo(mmss(Math.max(0, DURA_RONDA - tr)));
      const mal = maldicion(yo, t);
      e.hud.extra(`${c.libre ? `Ronda ${ronda + 1}` : `Ronda ${ronda + 1}/${RONDAS}`} · ${ICONO.bomba}${yo.bombas} ${ICONO.llama}${yo.llama}${yo.vel > 3.7 ? ' ' + ICONO.vel : ''}${yo.patear ? ' ' + ICONO.patear : ''}${yo.guante ? ' ' + ICONO.guante : ''}${mal ? ` ${ICONO.calavera}${Math.ceil(yo.mal!.hasta - t)}` : ''}`);
      e.hud.puntos(puntaje());
    }
    for (const j of jugadores) { j.k.grupo.position.set(j.x, 0, j.z); j.aro.position.set(j.x, 0.03, j.z); }
    for (const m of mejoras.values()) { m.malla.children[1].position.y = 0.95 + Math.sin(t * 3 + m.malla.position.x) * 0.12; }
    // En un celular parado el patio entero se ve chico: la cámara se acerca y sigue al jugador
    const parado = e.lienzo.clientHeight > e.lienzo.clientWidth, suave = 1 - Math.exp(-4 * dt);
    const meta = parado ? { x: Math.max(-6, Math.min(6, yo.x)), z: Math.max(-6, Math.min(6, yo.z)) + 3.6 } : { x: 0, z: 0.6 };
    foco = { x: foco.x + (meta.x - foco.x) * suave, z: foco.z + (meta.z - foco.z) * suave };
    e.enfocar(foco.x, 0, foco.z, parado ? 0.58 : 1);
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__bombas = () => ({ ronda, arena: arena.nombre, puntaje: puntaje(), puestos: [...puestos], vivos: jugadores.filter((j) => j.vivo).map((j) => j.id), cajas: cajasYo, elim: elimYo, terminado });

  return { empezar() { e.empezar(); empezado = true; inicioRonda = e.reloj(); e.hud.aviso(`Ronda ${ronda + 1} · ${arena.nombre}`, 'oro', 1.4); }, destruir: e.destruir };
}
