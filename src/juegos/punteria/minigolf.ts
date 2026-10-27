import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { aspectoAleatorio } from '../../personaje/catalogo';
import { cargar } from '../../nucleo/modelos';
import { bosque, cielo, halo, humo, ladrillo, lava, pasto, type Planta } from '../decorado';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, sombra } from '../reflejos/motor';
import { alCambiarVolumen, volumen } from '../sonido';
import { guia, mat } from './fisica';

// Minigolf del Volcán (versión 2, 27-10): nueve hoyos por partida en una meseta al pie de un volcán activo.
// Hay veinte hoyos diseñados (la semilla elige ocho más el de calentamiento, de menor a mayor dificultad), con canchas
// que no son solo rectángulos: forma de L, cañones en diagonal, octágonos; con lomas, rampas para saltar, un valle,
// una cima, un molino con aspas, lagos, trampas de arena, lava, hongos que rebotan, portales y un gólem que patrulla.
// La pelota tiene altura: sube y baja pendientes, salta desde las rampas y, con el tiro elevado, vuela por el aire
// (con roce del aire y efecto al caer). La cámara se gira y se acerca en cualquier momento (arrastrando fuera de la
// pelota, rueda o dos dedos, botones o teclado). Puntaje por hoyo contra su par y racha de pares; música tranquila.

const MX = 10, MZ = 6, RADIO = 0.3, VEL_MAX = 17, VEL_ELEVADO = 13, ROCE = 5.2, REBOTE = 0.72, TOPE = 8, HOYO = 0.5, HONGO = 0.55, PORTAL = 0.5;
const G = 16, AIRE = 0.3, ESCALON = 0.15, MURO = 0.8, RELOJ_TIRO = 30, ARRASTRE_MAX = 4.5;
/** Puntos por hoyo: par 150, cada golpe bajo el par +75, hoyo en uno +150 extra, cada golpe sobre el par −30 (mínimo 20). */
const PUNTOS = { par: 150, bajo: 75, enUno: 150, sobre: 30, minimo: 20, racha: 25 };
type Caja = [x: number, z: number, ancho: number, fondo: number]; // centro y tamaño
/** Bloque que se mueve: su caja en reposo, el eje por donde va y viene y cuánto se aleja. */
type Movil = [x: number, z: number, ancho: number, fondo: number, eje: 'x' | 'z', amplitud: number];
interface Piso { caja: Caja; alto: number }
/** Rampa: sube de `desde` (en el lado menor de su eje) a `hasta` (en el lado mayor). */
interface Rampa { caja: Caja; eje: 'x' | 'z'; desde: number; hasta: number }
interface Hoyo {
  nombre: string; par: number; idea: string; salida: [number, number]; meta: [number, number];
  /** Contorno de la cancha (si no, el rectángulo de 20 × 12). */
  forma?: [number, number][];
  piedras: Caja[]; lava: Caja[]; agua?: Caja[]; arena?: Caja[]; pisos?: Piso[]; rampas?: Rampa[]; movil?: Movil;
  hongos?: [number, number][];
  /** Entrada y salida de un portal. */
  portal?: [[number, number], [number, number]];
  /** Molino: túnel en (x, z) que se recorre de oeste a este; sus aspas tapan la entrada a ratos. */
  molino?: [number, number];
}
const RECTANGULO: [number, number][] = [[-MX, -MZ], [MX, -MZ], [MX, MZ], [-MX, MZ]];

// En orden de dificultad (el primero, de calentamiento, sale siempre)
const TODOS: Hoyo[] = [
  { nombre: 'Calentamiento', par: 2, idea: 'Un tiro derecho para tomarle la mano.', salida: [-8, 0], meta: [8, 0], piedras: [], lava: [] },
  { nombre: 'La Loma', par: 3, idea: 'Sube la loma con la fuerza justa: si te quedas corto, la pelota vuelve rodando.', salida: [-8, 0], meta: [7, 1.5], piedras: [[6.5, -2.2, 0.8, 2.6]], lava: [], pisos: [{ caja: [6, 0, 8, 12], alto: 0.6 }], rampas: [{ caja: [1, 0, 2, 12], eje: 'x', desde: 0, hasta: 0.6 }] },
  { nombre: 'La Pared', par: 3, idea: 'Un muro del castillo en ruinas y un gólem guardián que patrulla la salida.', salida: [-8, -3.5], meta: [8, 3.5], piedras: [[0, -2, 1, 8]], lava: [], movil: [4, 0, 1, 2.2, 'z', 3.2] },
  { nombre: 'El Zigzag', par: 3, idea: 'Dos muros de piedra; los hongos de las esquinas devuelven la pelota con fuerza.', salida: [-8, 0], meta: [8, 0], piedras: [[-2.5, 3, 1, 6], [2.5, -3, 1, 6]], lava: [], movil: [0, 0, 1, 2, 'z', 3.5], hongos: [[-6, -3.5], [6, 3.5]] },
  { nombre: 'La Ele', par: 3, idea: 'Una curva cerrada: usa el hongo de la esquina para doblar.', forma: [[-10, -6], [-3, -6], [-3, 2], [10, 2], [10, 6], [-10, 6]], salida: [-6.5, -4], meta: [8, 4], piedras: [], lava: [], hongos: [[-8.6, 4.6]] },
  { nombre: 'El Lago', par: 3, idea: 'Rodea el lago (si cae al agua, un golpe de castigo) y cuidado con la arena junto al hoyo.', salida: [-8, 0], meta: [7.5, 0], piedras: [], lava: [], agua: [[0, 0, 6, 5]], arena: [[5.5, -2.6, 3, 2.4], [5.5, 2.6, 3, 2.4]] },
  { nombre: 'El Valle', par: 3, idea: 'Dos laderas te devuelven al centro: úsalas para pasar la roca.', salida: [-8, 0], meta: [8, 0], piedras: [[-1, 0, 1, 3]], lava: [], rampas: [{ caja: [0, -4, 20, 4], eje: 'z', desde: 0.7, hasta: 0 }, { caja: [0, 4, 20, 4], eje: 'z', desde: 0, hasta: 0.7 }] },
  { nombre: 'Río de Lava', par: 3, idea: 'Un río de lava corta la cancha y el gólem cuida el paso de abajo.', salida: [-8, 3.5], meta: [8, 3.5], piedras: [[0, 1.5, 12, 1]], lava: [[0, -3.5, 6, 2.4]], movil: [0, 4.2, 2, 1, 'x', 4] },
  { nombre: 'El Molino', par: 3, idea: 'El clásico: pasa por el túnel del molino cuando las aspas dejan libre la entrada.', salida: [-8, 0], meta: [7, 0], piedras: [[0, -3.5, 1.6, 5], [0, 3.5, 1.6, 5]], lava: [], molino: [0, 0] },
  { nombre: 'Las Puertas', par: 3, idea: 'Dos portones de piedra con un pozo de lava entre ellos.', salida: [-8, -4], meta: [7.5, 4], piedras: [[-3, -1.5, 1, 9], [3, 1.5, 1, 9]], lava: [[0, 0, 2.6, 2.6]], movil: [6, 0, 1, 2, 'z', 3.5] },
  { nombre: 'La Roca', par: 3, idea: 'Una roca en medio y dos pozos de lava a los lados; los hongos ayudan a rodearla.', salida: [-8, 0], meta: [8, 0], piedras: [[0, 0, 3, 3]], lava: [[0, -4.5, 3, 3], [0, 4.5, 3, 3]], movil: [5, 0, 1, 2.2, 'z', 3.5], hongos: [[-4, -3.2], [-4, 3.2]] },
  { nombre: 'El Embudo', par: 3, idea: 'Muros que encierran la salida y un último muro antes del hoyo.', salida: [-8, 0], meta: [8, 0], piedras: [[-4, 3.5, 1, 5], [-4, -3.5, 1, 5], [2, 0, 1, 6]], lava: [], movil: [6, 0, 1, 2, 'z', 3.5] },
  { nombre: 'El Desfiladero', par: 3, idea: 'Un cañón angosto entre rocas: rebota en las paredes con cuidado.', forma: [[-10, -6], [-5, -6], [10, 1], [10, 6], [5, 6], [-10, -1]], salida: [-8, -4], meta: [7.5, 3.5], piedras: [[0, -0.5, 1, 1.5]], lava: [] },
  { nombre: 'La Caldera', par: 3, idea: 'El hoyo está dentro de la caldera, abierta solo hacia la lava.', salida: [-8.5, 0], meta: [0, 0], piedras: [[-3.2, 0, 1, 5], [0, -3.2, 5, 1], [0, 3.2, 5, 1]], lava: [[5.5, 0, 3, 5], [-0.2, -5, 9, 1.2]], movil: [-6, 0, 1, 2, 'z', 3.5] },
  { nombre: 'El Tridente', par: 3, idea: 'Tres muros alternados: un slalom de bandas.', salida: [-8, 4], meta: [8, -4], piedras: [[-4, -2, 1, 8], [0, 2, 1, 8], [4, -2, 1, 8]], lava: [], movil: [6, 1, 1, 2, 'z', 2.5] },
  { nombre: 'El Puente', par: 3, idea: 'Un muro largo al centro; por los lados, lava; los hongos te pasan al otro lado.', salida: [0, 4.5], meta: [0, -4.5], piedras: [[0, 0, 10, 1]], lava: [[-8.5, 0, 3, 2], [8.5, 0, 3, 2]], movil: [0, -2.8, 2, 1, 'x', 4], hongos: [[-6.5, -3.2], [6.5, 3.2]] },
  { nombre: 'La Diagonal', par: 3, idea: 'Dos muros cruzados y un pozo de lava en el medio.', salida: [-8.5, 4.5], meta: [8.5, -4.5], piedras: [[-3, 1, 1, 10], [3, -1, 1, 10]], lava: [[0, 0, 2, 2]], movil: [6.5, 0, 1, 2, 'z', 3] },
  { nombre: 'El Salto', par: 3, idea: 'Salta el río de lava por la rampa o crúzalo por el paso de abajo, más largo.', salida: [-8, -3], meta: [7, -3], piedras: [], lava: [[0, -1.25, 3, 9.5]], rampas: [{ caja: [-3.5, -1.25, 3, 9.5], eje: 'x', desde: 0, hasta: 0.7 }] },
  { nombre: 'La Cima', par: 4, idea: 'El hoyo está en la cima: muy suave y la pelota vuelve, muy fuerte y se pasa.', salida: [-8, 0], meta: [3, 0], piedras: [], lava: [], hongos: [[-5, -4], [-5, 4]], pisos: [{ caja: [3, 0, 3, 3], alto: 0.8 }], rampas: [{ caja: [0, 0, 3, 3], eje: 'x', desde: 0, hasta: 0.8 }, { caja: [6, 0, 3, 3], eje: 'x', desde: 0.8, hasta: 0 }, { caja: [3, -3, 3, 3], eje: 'z', desde: 0, hasta: 0.8 }, { caja: [3, 3, 3, 3], eje: 'z', desde: 0.8, hasta: 0 }] },
  { nombre: 'El Anfiteatro', par: 3, idea: 'El hoyo está dentro de un muro abierto hacia el este: da la vuelta o usa los hongos.', forma: [[-6, -6], [6, -6], [10, -2], [10, 2], [6, 6], [-6, 6], [-10, 2], [-10, -2]], salida: [-8, 0], meta: [0, 0], piedras: [[-1.6, 0, 0.6, 3.8], [0, -1.6, 3.8, 0.6], [0, 1.6, 3.8, 0.6]], lava: [], hongos: [[6, -3], [6, 3], [8.3, 0]] },
  { nombre: 'La Vuelta', par: 4, idea: 'Un muro largo te obliga a dar la vuelta, o a usar el portal.', salida: [-8, -4.5], meta: [-8, 4.5], piedras: [[-3, 0, 14, 1]], lava: [[9, 0, 2, 3]], movil: [6, 0, 2, 1, 'z', 3], portal: [[1.5, -5.1], [-2.5, 3.2]] },
];

/** Los nueve hoyos de la partida: el de calentamiento más ocho sorteados con la semilla, en orden de dificultad. */
function elegir(semilla: string): Hoyo[] {
  const r = generador(semilla), resto = TODOS.map((_, i) => i).slice(1);
  for (let i = resto.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [resto[i], resto[k]] = [resto[k], resto[i]]; }
  return [0, ...resto.slice(0, 8).sort((a, b) => a - b)].map((i) => TODOS[i]);
}
const dentro = (x: number, z: number, [cx, cz, w, d]: Caja, margen = 0) => Math.abs(x - cx) < w / 2 + margen && Math.abs(z - cz) < d / 2 + margen;
const NOMBRE_GOLPES = (golpes: number, par: number) => golpes === 1 ? '¡Hoyo en uno!' : golpes - par <= -2 ? '¡Águila!' : golpes - par === -1 ? '¡Birdie!' : golpes === par ? 'Par' : golpes - par === 1 ? 'Bogey' : `+${golpes - par}`;
const suave = (x: number) => x * x * (3 - 2 * x);
/** Puntos de un hoyo según sus golpes y su par. */
export const puntosHoyo = (golpes: number, par: number) => {
  const dif = golpes - par;
  if (dif <= 0) return PUNTOS.par + PUNTOS.bajo * -dif + (golpes === 1 ? PUNTOS.enUno : 0);
  return Math.max(PUNTOS.minimo, PUNTOS.par - PUNTOS.sobre * dif);
};
/** Altura del terreno en (x, z): pisos elevados y rampas. */
export const altoEn = (h: Hoyo, x: number, z: number) => {
  let y = 0;
  for (const p of h.pisos ?? []) if (dentro(x, z, p.caja)) y = Math.max(y, p.alto);
  for (const r of h.rampas ?? []) {
    if (!dentro(x, z, r.caja)) continue;
    const [cx, cz, w, d] = r.caja, f = r.eje === 'x' ? (x - (cx - w / 2)) / w : (z - (cz - d / 2)) / d;
    y = Math.max(y, r.desde + (r.hasta - r.desde) * limitar(f, 0, 1));
  }
  return y;
};
const dentroDe = (forma: [number, number][], x: number, z: number) => {
  let si = false;
  for (let i = 0, j = forma.length - 1; i < forma.length; j = i++) {
    const [xi, zi] = forma[i], [xj, zj] = forma[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) si = !si;
  }
  return si;
};

export async function crear(c: Contexto): Promise<Partida> {
  // Solo en pruebas: "?hoyo=8" parte directo en ese hoyo
  const probar = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('hoyo') ?? NaN) : NaN;
  const HOYOS = Number.isInteger(probar) && TODOS[probar] ? [TODOS[probar], ...elegir(c.semilla).slice(1)] : elegir(c.semilla), deco = generador('minigolf-decorado');
  const e = crearEscenario(c.caja, { ancho: 25.5, alto: 15, centro: [0, 0, -0.6], inclinacion: 0.6, sinPlaya: true });
  e.camara.far = 260;
  e.camara.updateProjectionMatrix();
  cielo(e.escena, '#4f6fc9', '#ffcf9a', '#f39a7a');
  e.escena.fog = new THREE.Fog('#f5b48c', 70, 190);

  // ── Meseta ──
  const tierra = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#5a4438' }));
  tierra.rotation.x = -Math.PI / 2;
  tierra.position.y = -1.3;
  const prado = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.3, 14), new THREE.MeshLambertMaterial({ color: '#41703c', flatShading: true }));
  prado.scale.set(19, 1, 13);
  prado.position.y = -0.66;
  const telaPano = pasto('#62bf6b', '#55ac5e', 2);
  telaPano.wrapS = telaPano.wrapT = THREE.RepeatWrapping;
  telaPano.repeat.set(0.5, 1 / 12);
  e.escena.add(tierra, prado);

  // ── El volcán: cono facetado, vetas de lava, cráter encendido y humo ──
  const cono = new THREE.CylinderGeometry(3, 26, 20, 13, 6).toNonIndexed(), colores: number[] = [], tono = new THREE.Color();
  const pos = cono.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const alto = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, veta = deco() < 0.13 + Math.max(0, alto) * 0.012;
    tono.set(veta ? (deco() < 0.5 ? '#ff6a1e' : '#ffa23a') : alto > 5 ? '#3d2f2c' : deco() < 0.5 ? '#4f3d37' : '#5e4a40');
    for (let k = 0; k < 3; k++) colores.push(tono.r, tono.g, tono.b);
  }
  cono.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  const volcan = new THREE.Mesh(cono, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  volcan.position.set(4, 8.7, -42);
  const telaLava = lava();
  const crater = new THREE.Mesh(new THREE.CircleGeometry(2.9, 13), new THREE.MeshBasicMaterial({ map: telaLava }));
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(4, 18.72, -42);
  const resplandor = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(255,140,60,0.7)'), depthWrite: false, fog: false }));
  resplandor.scale.set(16, 10, 1);
  resplandor.position.set(4, 20, -42.5);
  const lejano = new THREE.Mesh(new THREE.ConeGeometry(16, 13, 8), new THREE.MeshLambertMaterial({ color: '#6c5a64', flatShading: true }));
  lejano.position.set(-34, 5, -60);
  e.escena.add(volcan, crater, resplandor, lejano);
  const fumarola = humo(e.escena, 4, 19.2, -42, '#8d7f80', 7, 2.2);

  // Río de lava detrás de la cancha, que fluye
  const telaRio = lava();
  telaRio.repeat.set(14, 1);
  const rio = new THREE.Mesh(new THREE.PlaneGeometry(130, 2.6), new THREE.MeshBasicMaterial({ map: telaRio }));
  rio.rotation.x = -Math.PI / 2;
  rio.position.set(0, -1.22, -16);
  const telaPozas = lava();

  // ── Adornos de Kenney, como instancias ──
  const anillo = (cuantos: number, desde: number, hasta: number, alto: [number, number], fuera = (p: Planta) => Math.abs(p.z + 16) < 2.4) => {
    const lista: Planta[] = [];
    while (lista.length < cuantos) {
      const a = deco() * Math.PI * 2, d = desde + deco() * (hasta - desde), p = { x: Math.cos(a) * (MX + d), z: Math.sin(a) * (MZ + d * 0.8), alto: alto[0] + deco() * (alto[1] - alto[0]), giro: deco() * 6.28, y: -1.3 };
      if (p.z > MZ + 1.5 && Math.abs(p.x) < MX + 4) continue;
      if (!fuera(p)) lista.push(p);
    }
    return lista;
  };
  const enPrado = (p: Planta) => ({ ...p, y: Math.hypot(p.x / 19, p.z / 13) < 1 ? 0 : -1.3 });
  rio.renderOrder = -1;
  e.escena.add(rio);
  await Promise.all([
    bosque(e.escena, 'naturaleza', 'tree_pineRoundA', anillo(14, 6, 18, [3, 5]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'tree_pineTallB', anillo(10, 9, 24, [4.5, 7]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'tree_palmTall', anillo(5, 5, 10, [3.2, 4.2]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'rock_largeA', anillo(9, 3, 20, [1, 2.2]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'rock_tallB', anillo(6, 8, 25, [2.5, 4.5])),
    bosque(e.escena, 'naturaleza', 'plant_bushLarge', anillo(12, 1.2, 6, [0.7, 1.2]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'mushroom_redGroup', anillo(6, 1, 5, [0.4, 0.7]).map(enPrado)),
    bosque(e.escena, 'plataformas', 'flowers-tall', anillo(14, 0.8, 5, [0.35, 0.6]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'stone_largeA', Array.from({ length: 22 }, (_, i) => ({ x: -55 + i * 5 + deco() * 2, z: -16 + (i % 2 ? 1.8 : -1.8), alto: 0.7 + deco() * 0.6, giro: deco() * 6, y: -1.3 }))),
  ]);

  // Castillo de adorno
  const castillo = await e.objeto('minigolf', 'castle', 2.6);
  castillo.position.set(16.5, 0, -9);
  castillo.rotation.y = -0.4;
  e.escena.add(castillo);

  // Dos espectadores que festejan (o se lamentan) cada hoyo
  const publico = await Promise.all([0, 1].map((i) => e.personaje(aspectoAleatorio(generador(`${c.semilla}|publico${i}`)), 1.7)));
  publico[0].grupo.position.set(-6.5, 0, -7.6);
  publico[1].grupo.position.set(7, 0, -7.6);
  publico.forEach((k) => { k.grupo.rotation.y = 0; k.animar('idle'); });
  const festejar = (bien: boolean) => publico.forEach((k, i) => setTimeout(() => e.gesto(k, bien ? 'emote-yes' : 'emote-no', 1.2), i * 150));

  // Pájaros que vuelan en círculos alrededor del volcán
  const pajaros = Array.from({ length: 4 }, (_, i) => {
    const g = new THREE.Group(), ala = new THREE.PlaneGeometry(0.9, 0.35), m = new THREE.MeshBasicMaterial({ color: '#3a2f3a', side: THREE.DoubleSide });
    const izq = new THREE.Mesh(ala, m), der = new THREE.Mesh(ala, m);
    izq.position.x = -0.45; der.position.x = 0.45;
    g.add(izq, der);
    g.userData = { izq, der, fase: i * 1.6, radio: 9 + i * 2.2, alto: 16 + i * 1.3 };
    e.escena.add(g);
    return g;
  });

  // ── La pelota: hoyuelos (relieve), barniz y una línea de alineación que muestra cómo gira ──
  const hoyuelos = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 128);
    for (let fila = 0; fila < 16; fila++) for (let col = 0; col < 32; col++) {
      const x = col * 8 + (fila % 2 ? 4 : 0) + 4, y = fila * 8 + 4, grad = g.createRadialGradient(x, y, 0.5, x, y, 3.6);
      grad.addColorStop(0, '#9a9a9a'); grad.addColorStop(1, '#ffffff');
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; return t;
  })();
  const pelota = new THREE.Mesh(new THREE.SphereGeometry(RADIO, 48, 32), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.2, bumpMap: hoyuelos, bumpScale: 0.9, sheen: 0.2 }));
  const linea = new THREE.Mesh(new THREE.TorusGeometry(RADIO * 1.002, 0.012, 6, 40), new THREE.MeshBasicMaterial({ color: '#ff5a2a' }));
  pelota.add(linea);
  const sombraPelota = sombra(0.34);
  // Estela: bolitas que siguen a la pelota y se desvanecen
  const estela = Array.from({ length: 7 }, (_, i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(RADIO * (0.85 - i * 0.09), 8, 6), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.4 - i * 0.05, depthWrite: false })); b.visible = false; return b; });

  // ── Piezas de cada hoyo ──
  const piezas = new THREE.Group(), telaMuro = ladrillo('#9a8f96', '#5d5560', 3);
  const hueco = new THREE.Mesh(new THREE.CircleGeometry(HOYO, 24), new THREE.MeshBasicMaterial({ color: '#140e0b' }));
  const aro = new THREE.Mesh(new THREE.RingGeometry(HOYO, HOYO + 0.1, 24), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  hueco.rotation.x = aro.rotation.x = -Math.PI / 2;
  const bandera = new THREE.Group(), tela = await e.pieza('minigolf', 'flag-red', 2.3);
  tela.position.y = 1.15;
  bandera.add(tela);
  const salidaMarca = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshLambertMaterial({ color: '#3e8a46' }));
  salidaMarca.rotation.x = -Math.PI / 2;
  e.escena.add(piezas, hueco, aro, bandera, salidaMarca, pelota, sombraPelota, ...estela);
  const [hongoModelo, golfista] = await Promise.all([cargar('naturaleza', 'mushroom_redTall'), e.personaje(c.aspecto, 1.55)]);
  const puntosGuia = guia(e.escena, 16, '#fff6c4');

  // El gólem: el bloque que se mueve tiene ojos que siguen a la pelota
  let golem: THREE.Group | null = null, pupilas: THREE.Mesh[] = [];
  const crearGolem = (w: number, d: number) => {
    const g = new THREE.Group(), tex = telaMuro.clone();
    tex.repeat.set(Math.max(w, d), 1);
    tex.needsUpdate = true;
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), new THREE.MeshLambertMaterial({ map: tex, color: '#d8714f' }));
    cuerpo.position.y = 0.45;
    g.add(cuerpo);
    pupilas = [];
    for (const lado of [-1, 1]) {
      const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })), pupila = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#1a1010' }));
      ojo.position.set(lado * Math.min(0.25, w / 4), 0.95, Math.min(0.25, d / 4));
      pupila.position.copy(ojo.position);
      g.add(ojo, pupila);
      pupilas.push(pupila);
    }
    return g;
  };

  interface Hongo { x: number; z: number; malla: THREE.Object3D; golpe: number }
  let hongos: Hongo[] = [], portales: THREE.Mesh[] = [], pozas: { x: number; z: number; w: number; d: number }[] = [], aguas: THREE.Mesh[] = [];
  let movilAhora: Caja | null = null, aspas: THREE.Group | null = null, tapado = false, forma: [number, number][] = RECTANGULO, bordes: [[number, number], [number, number]][] = [];
  let actual = 0, golpes = 0, total = 0, puntos = 0, racha = 0, terminado = false, empezado = false, cambio = -1, presenta = 0, enfriaPortal = 0, burbujas = 0, limiteTiro = Infinity;
  const tarjeta: number[] = [];
  const bola = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 }, previa = { x: 0, z: 0 }, rastro: { x: number; y: number; z: number }[] = [];
  let elevado = false, enVuelo = false, tiroAlto = false;
  const alto = (x: number, z: number) => altoEn(HOYOS[Math.min(actual, HOYOS.length - 1)], x, z);
  const quieta = () => vel.x === 0 && vel.z === 0 && vel.y === 0;

  const matPasto = new THREE.MeshLambertMaterial({ map: telaPano }), matLoma = new THREE.MeshLambertMaterial({ color: '#5fb866' }), matTierra = mat('#7a5a3a');
  const montar = (t: number) => {
    const h = HOYOS[actual];
    piezas.clear();
    // Cancha: su forma, con un borde de madera en cada lado
    forma = h.forma ?? RECTANGULO;
    bordes = forma.map((p, i) => [p, forma[(i + 1) % forma.length]] as [[number, number], [number, number]]);
    const contorno = new THREE.Shape(forma.map(([x, z]) => new THREE.Vector2(x, -z)));
    const pano = new THREE.Mesh(new THREE.ShapeGeometry(contorno), matPasto);
    pano.rotation.x = -Math.PI / 2; pano.position.y = 0.04;
    piezas.add(pano);
    const area = forma.reduce((s, [x, z], i) => { const [x2, z2] = forma[(i + 1) % forma.length]; return s + x * z2 - x2 * z; }, 0), sentido = Math.sign(area) || 1;
    for (const [[x1, z1], [x2, z2]] of bordes) {
      const largo = Math.hypot(x2 - x1, z2 - z1), nx = ((z2 - z1) / largo) * sentido, nz = (-(x2 - x1) / largo) * sentido, ang = Math.atan2(z2 - z1, x2 - x1);
      const borde = new THREE.Mesh(new THREE.BoxGeometry(largo + 0.5, 0.6, 0.5), mat('#7a4b2c')), moldura = new THREE.Mesh(new THREE.BoxGeometry(largo + 0.58, 0.1, 0.58), mat('#e8c58e'));
      borde.position.set((x1 + x2) / 2 + nx * 0.25, 0.3, (z1 + z2) / 2 + nz * 0.25); borde.rotation.y = -ang;
      moldura.position.set(borde.position.x, 0.64, borde.position.z); moldura.rotation.y = -ang;
      piezas.add(borde, moldura);
    }
    // Lomas y rampas
    for (const p of h.pisos ?? []) {
      const [x, z, w, d] = p.caja, bloque = new THREE.Mesh(new THREE.BoxGeometry(w, p.alto, d), [matTierra, matTierra, matLoma, matTierra, matTierra, matTierra]);
      bloque.position.set(x, p.alto / 2 + 0.04, z);
      piezas.add(bloque);
    }
    for (const r of h.rampas ?? []) {
      const [x, z, w, d] = r.caja, geo = new THREE.BoxGeometry(w, 1, d, 1, 1, 1), ps = geo.attributes.position;
      for (let i = 0; i < ps.count; i++) {
        const px = ps.getX(i) + x, pz = ps.getZ(i) + z;
        ps.setY(i, ps.getY(i) > 0 ? altoEn({ ...h, pisos: [], rampas: [r] }, limitar(px, x - w / 2 + 0.001, x + w / 2 - 0.001), limitar(pz, z - d / 2 + 0.001, z + d / 2 - 0.001)) + 0.04 : 0);
      }
      geo.computeVertexNormals();
      const malla = new THREE.Mesh(geo, [matTierra, matTierra, matLoma, matTierra, matTierra, matTierra]);
      malla.position.set(x, 0, z);
      piezas.add(malla);
    }
    for (const [x, z, w, d] of h.piedras) {
      const tex = telaMuro.clone(), y0 = altoEn(h, x, z);
      tex.repeat.set(Math.max(w, d) / 1.5, 1);
      tex.needsUpdate = true;
      const muro = new THREE.Mesh(new THREE.BoxGeometry(w, MURO, d), new THREE.MeshLambertMaterial({ map: tex })), tapa = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08), mat('#c9bfc4'));
      muro.position.set(x, y0 + MURO / 2, z);
      tapa.position.set(x, y0 + MURO + 0.04, z);
      piezas.add(muro, tapa);
    }
    pozas = h.lava.map(([x, z, w, d]) => ({ x, z, w, d }));
    for (const { x, z, w, d } of pozas) {
      const tex = telaPozas.clone();
      tex.repeat.set(w / 3, d / 3);
      tex.needsUpdate = true;
      const borde = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.35, d + 0.35), new THREE.MeshLambertMaterial({ color: '#3a2a26' })), poza = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex }));
      borde.rotation.x = poza.rotation.x = -Math.PI / 2;
      borde.position.set(x, 0.05, z);
      poza.position.set(x, 0.06, z);
      poza.userData.lava = tex;
      piezas.add(borde, poza);
    }
    // Lagos (azules, con orilla) y trampas de arena
    aguas = [];
    for (const [x, z, w, d] of h.agua ?? []) {
      const orilla = new THREE.Mesh(new THREE.CircleGeometry(1, 24), mat('#d9c48a')), lago = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshLambertMaterial({ color: '#3f9bd8', transparent: true, opacity: 0.92 }));
      orilla.scale.set(w / 2 + 0.3, d / 2 + 0.3, 1); lago.scale.set(w / 2, d / 2, 1);
      orilla.rotation.x = lago.rotation.x = -Math.PI / 2;
      orilla.position.set(x, 0.05, z); lago.position.set(x, 0.065, z);
      piezas.add(orilla, lago); aguas.push(lago);
    }
    for (const [x, z, w, d] of h.arena ?? []) {
      const banco = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshLambertMaterial({ color: '#ead39a' }));
      banco.scale.set(w / 2, d / 2, 1); banco.rotation.x = -Math.PI / 2; banco.position.set(x, 0.06, z);
      piezas.add(banco);
    }
    hongos = (h.hongos ?? []).map(([x, z]) => {
      const m = hongoModelo.clone(), medida = new THREE.Box3().setFromObject(hongoModelo), s = 1.5 / Math.max(0.01, medida.max.y - medida.min.y);
      const g = new THREE.Group();
      m.scale.setScalar(s);
      m.position.y = -medida.min.y * s;
      g.add(m);
      g.position.set(x, altoEn(h, x, z) + 0.04, z);
      piezas.add(g);
      return { x, z, malla: g, golpe: -9 };
    });
    portales = [];
    if (h.portal) h.portal.forEach(([x, z], i) => {
      const anillo = new THREE.Mesh(new THREE.TorusGeometry(PORTAL, 0.09, 6, 20), new THREE.MeshBasicMaterial({ color: i ? '#ffb7f5' : '#b07bff' }));
      const remolino = new THREE.Mesh(new THREE.CircleGeometry(PORTAL, 20), new THREE.MeshBasicMaterial({ color: i ? '#ff7ae0' : '#7a4dff', transparent: true, opacity: 0.6 }));
      anillo.rotation.x = remolino.rotation.x = -Math.PI / 2;
      anillo.position.set(x, 0.12, z);
      remolino.position.set(x, 0.07, z);
      piezas.add(anillo, remolino);
      portales.push(anillo);
    });
    // Molino: techo sobre el túnel y cuatro aspas que giran delante de la entrada
    aspas = null;
    if (h.molino) {
      const [mx, mz] = h.molino, techo = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 2.4), mat('#c97a4a')), tejado = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.4, 4), mat('#8a3a2a'));
      techo.position.set(mx, 1.35, mz); tejado.position.set(mx, 2.5, mz); tejado.rotation.y = Math.PI / 4;
      aspas = new THREE.Group();
      for (let k = 0; k < 4; k++) { const aspa = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.55, 0.36), mat('#f3ead6')); aspa.position.y = -0.78; const brazo = new THREE.Group(); brazo.rotation.x = (k * Math.PI) / 2; brazo.add(aspa); aspas.add(brazo); }
      aspas.position.set(mx - 1.05, 1.62, mz);
      piezas.add(techo, tejado, aspas);
    }
    golem = h.movil ? crearGolem(h.movil[2], h.movil[3]) : null;
    if (golem) piezas.add(golem);
    movilAhora = null;
    const ym = altoEn(h, h.meta[0], h.meta[1]);
    hueco.position.set(h.meta[0], ym + 0.07, h.meta[1]);
    aro.position.set(h.meta[0], ym + 0.068, h.meta[1]);
    bandera.position.set(h.meta[0], ym, h.meta[1]);
    salidaMarca.position.set(h.salida[0], altoEn(h, h.salida[0], h.salida[1]) + 0.05, h.salida[1]);
    bola.x = previa.x = h.salida[0]; bola.z = previa.z = h.salida[1]; bola.y = altoEn(h, bola.x, bola.z);
    vel.x = vel.y = vel.z = 0;
    rastro.length = 0;
    golpes = 0;
    presenta = t;
    limiteTiro = Infinity;
    e.hud.tiempo(`Hoyo ${actual + 1} de ${HOYOS.length}`);
    e.hud.aviso(`${h.nombre} · Par ${h.par}`, '', 1.8);
    ideaHoyo.textContent = h.idea;
    camara.modo = 'general';
  };

  // ── Cámara: se orbita alrededor de un punto (la cancha o la pelota), se gira y se acerca en cualquier momento ──
  const PRESENTA = 1.9;
  const camara = { yaw: 0, pitch: 0.62, dist: 17, modo: 'general' as 'general' | 'pelota', centro: new THREE.Vector3(0, 0, -0.6) };
  // Para la vista general, la distancia en que cabe toda la cancha (22 × 14 con los bordes) según la pantalla
  const distGeneral = () => { const tan = Math.tan(THREE.MathUtils.degToRad(e.camara.fov / 2)); return Math.max(9 / tan, 12 / (tan * e.camara.aspect)) * 1.02; };
  const ubicarCamara = (dt: number, ya = false) => {
    const meta = camara.modo === 'pelota' ? new THREE.Vector3(bola.x, bola.y, bola.z) : new THREE.Vector3(0, 0, e.camara.aspect < 1 ? 0.6 : -0.6);
    camara.centro.lerp(meta, ya ? 1 : 1 - Math.exp(-5 * dt));
    const { yaw, pitch, dist } = camara;
    e.camara.position.set(camara.centro.x + Math.sin(yaw) * Math.cos(pitch) * dist, camara.centro.y + Math.sin(pitch) * dist, camara.centro.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    e.camara.lookAt(camara.centro);
  };
  const vistaGeneral = () => { camara.modo = 'general'; camara.yaw = 0; camara.pitch = 0.62; camara.dist = distGeneral(); };
  const detrasDeLaPelota = () => {
    const h = HOYOS[actual];
    camara.modo = 'pelota'; camara.yaw = Math.atan2(bola.x - h.meta[0], bola.z - h.meta[1]); camara.pitch = 0.5; camara.dist = 7;
  };
  const girar = (d: number) => { camara.yaw += d; };
  const acercar = (f: number) => { camara.dist = limitar(camara.dist * f, 3.5, 34); };

  // Controles en pantalla (a la derecha, para no tapar los botones de la sala)
  const panel = document.createElement('div');
  panel.className = 'golf-controles';
  const boton = (texto: string, titulo: string, f: () => void) => { const b = document.createElement('button'); b.className = 'boton'; b.textContent = texto; b.title = titulo; b.setAttribute('aria-label', titulo); b.addEventListener('click', (ev) => { ev.stopPropagation(); f(); b.blur(); }); panel.appendChild(b); return b; };
  boton('⟲', 'Girar la cámara a la izquierda (A o ←)', () => girar(-0.4));
  boton('⟳', 'Girar la cámara a la derecha (D o →)', () => girar(0.4));
  boton('＋', 'Acercar (W o ↑)', () => acercar(0.8));
  boton('－', 'Alejar (S o ↓)', () => acercar(1.25));
  boton('🎯', 'Detrás de la pelota (C)', detrasDeLaPelota);
  boton('🗺', 'Vista general (V)', vistaGeneral);
  const botonTiro = boton('⛳ Rodado', 'Tiro rodado o elevado (E)', () => alternarTiro());
  const botonMusica = boton('🎵', 'Música (M)', () => alternarMusica());
  const ideaHoyo = document.createElement('div');
  ideaHoyo.className = 'golf-idea';
  c.caja.append(panel, ideaHoyo);
  const alternarTiro = () => { elevado = !elevado; botonTiro.textContent = elevado ? '⛰ Elevado' : '⛳ Rodado'; botonTiro.classList.toggle('principal', elevado); e.hud.aviso(elevado ? 'Tiro elevado: vuela por el aire y frena al caer' : 'Tiro rodado', '', 1.1); };
  e.escuchar(window, 'keydown', (ev) => {
    const k = ev.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') girar(-0.12); else if (k === 'd' || k === 'arrowright') girar(0.12);
    else if (k === 'w' || k === 'arrowup') acercar(0.92); else if (k === 's' || k === 'arrowdown') acercar(1.08);
    else if (k === 'c') detrasDeLaPelota(); else if (k === 'v') vistaGeneral(); else if (k === 'e') alternarTiro(); else if (k === 'm') alternarMusica();
    else return;
    ev.preventDefault();
  });

  // ── El tiro: se arrastra desde la pelota hacia atrás; arrastrar en otra parte mueve la cámara ──
  const rayo = new THREE.Raycaster(), plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), punto = new THREE.Vector3(), ndc = new THREE.Vector2();
  const enCancha = (ev: PointerEvent) => {
    const r = e.lienzo.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    rayo.setFromCamera(ndc, e.camara);
    plano.constant = -bola.y;
    return rayo.ray.intersectPlane(plano, punto) ? punto.clone() : null;
  };
  const pelotaEnPantalla = () => { const p = new THREE.Vector3(bola.x, bola.y + RADIO, bola.z).project(e.camara), r = e.lienzo.getBoundingClientRect(); return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }; };
  const puedeTirar = () => empezado && !terminado && quieta() && cambio < 0 && e.reloj() - presenta > PRESENTA;
  const tiro = { tirando: false, dx: 0, dz: 0, fuerza: 0 };
  const dedos = new Map<number, { x: number; y: number }>();
  let arrastreCamara: { x: number; y: number } | null = null, pellizco = 0;
  e.escuchar(e.lienzo, 'pointerdown', (ev) => {
    dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    e.lienzo.setPointerCapture(ev.pointerId);
    if (dedos.size === 2) { tiro.tirando = false; arrastreCamara = null; const [a, b] = [...dedos.values()]; pellizco = Math.hypot(a.x - b.x, a.y - b.y); return; }
    const p = pelotaEnPantalla(), cerca = Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < Math.max(56, e.lienzo.clientHeight * 0.08);
    if (cerca && puedeTirar()) { tiro.tirando = true; tiro.fuerza = 0; tiro.dx = tiro.dz = 0; }
    else arrastreCamara = { x: ev.clientX, y: ev.clientY };
  });
  e.escuchar(e.lienzo, 'pointermove', (ev) => {
    if (!dedos.has(ev.pointerId)) return;
    dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (dedos.size === 2) { const [a, b] = [...dedos.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pellizco) acercar(pellizco / d); pellizco = d; return; }
    if (tiro.tirando) {
      const p = enCancha(ev);
      if (!p) return;
      const dx = bola.x - p.x, dz = bola.z - p.z, largo = Math.hypot(dx, dz);
      tiro.fuerza = Math.min(1, largo / ARRASTRE_MAX); tiro.dx = largo ? dx / largo : 0; tiro.dz = largo ? dz / largo : 0;
    } else if (arrastreCamara) {
      camara.yaw -= (ev.clientX - arrastreCamara.x) * 0.008;
      camara.pitch = limitar(camara.pitch + (ev.clientY - arrastreCamara.y) * 0.005, 0.18, 1.4);
      arrastreCamara = { x: ev.clientX, y: ev.clientY };
    }
  });
  const soltar = (ev: PointerEvent) => {
    dedos.delete(ev.pointerId);
    if (dedos.size < 2) pellizco = 0;
    arrastreCamara = null;
    if (!tiro.tirando) return;
    tiro.tirando = false;
    if (tiro.fuerza > 0.06 && puedeTirar()) golpear(tiro.dx, tiro.dz, tiro.fuerza, elevado);
  };
  e.escuchar(e.lienzo, 'pointerup', soltar);
  e.escuchar(e.lienzo, 'pointercancel', soltar);
  e.escuchar(e.lienzo, 'wheel', (ev) => { ev.preventDefault(); acercar(ev.deltaY > 0 ? 1.1 : 0.9); });

  /** Golpe: rodado (por el suelo, hasta 17 m/s) o elevado (sale hacia arriba y vuela, hasta 13 m/s). */
  function golpear(dx: number, dz: number, fuerza: number, alto: boolean) {
    previa.x = bola.x; previa.z = bola.z;
    const v = (alto ? VEL_ELEVADO : VEL_MAX) * fuerza;
    vel.x = dx * v * (alto ? 0.82 : 1); vel.z = dz * v * (alto ? 0.82 : 1); vel.y = alto ? v * 0.62 : 0;
    enVuelo = alto; tiroAlto = alto;
    golpes++; total++;
    limiteTiro = Infinity;
    e.gesto(golfista, 'attack-melee-right', 0.6);
    if (fuerza > 0.85) e.temblar(0.15);
    if (!e.sonido.efecto('leve')) e.sonido.tono(alto ? 420 : 520, 0.06, { tipo: 'square', vol: 0.15 });
  }

  const terminar = () => {
    terminado = true;
    e.detener();
    const parTotal = HOYOS.reduce((s, h) => s + h.par, 0);
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Golpes en total', `${total} (par ${parTotal})`], ['Hoyos en uno', String(tarjeta.filter((g) => g === 1).length)], ['Tarjeta', tarjeta.join(' · ')], ['Mejor racha de pares', String(mejorRacha)]],
      detalle: { version: 2, tarjeta, total, par: parTotal, hoyos: HOYOS.map((h) => h.nombre) },
    });
  };
  let mejorRacha = 0;
  const cerrarHoyo = (t: number, texto: string, clase: string) => {
    const h = HOYOS[actual], pts = puntosHoyo(golpes, h.par);
    racha = golpes <= h.par ? racha + 1 : 0;
    mejorRacha = Math.max(mejorRacha, racha);
    const bono = racha >= 2 ? PUNTOS.racha * (racha - 1) : 0;
    puntos += pts + bono;
    tarjeta.push(golpes);
    vel.x = vel.y = vel.z = 0;
    e.hud.aviso(`${texto} · +${pts}${bono ? ` · racha +${bono}` : ''}`, clase, 1.6);
    cambio = t + 1.8;
  };

  /** Saca la pelota de una caja si la está tocando y, si iba hacia ella, la hace rebotar (si vuela por encima, no la toca). */
  const chocar = ([cx, cz, w, d]: Caja, tope = Infinity) => {
    if (bola.y > tope) return;
    const px = limitar(bola.x, cx - w / 2, cx + w / 2), pz = limitar(bola.z, cz - d / 2, cz + d / 2), nx = bola.x - px, nz = bola.z - pz, lejos = Math.hypot(nx, nz);
    if (lejos >= RADIO) return;
    const ux = lejos ? nx / lejos : bola.x - cx >= 0 ? 1 : -1, uz = lejos ? nz / lejos : 0, hacia = vel.x * ux + vel.z * uz;
    bola.x = px + ux * RADIO; bola.z = pz + uz * RADIO;
    if (hacia < 0) { vel.x -= (1 + REBOTE) * hacia * ux; vel.z -= (1 + REBOTE) * hacia * uz; e.sonido.tono(240, 0.04, { tipo: 'square', vol: 0.06 }); }
  };
  /** Rebote contra los bordes de la cancha (cualquier forma). */
  const chocarBordes = () => {
    for (const [[x1, z1], [x2, z2]] of bordes) {
      const sx = x2 - x1, sz = z2 - z1, l2 = sx * sx + sz * sz, k = limitar(((bola.x - x1) * sx + (bola.z - z1) * sz) / l2, 0, 1);
      const px = x1 + sx * k, pz = z1 + sz * k, nx = bola.x - px, nz = bola.z - pz, d = Math.hypot(nx, nz);
      if (d >= RADIO || d === 0) continue;
      const ux = nx / d, uz = nz / d, hacia = vel.x * ux + vel.z * uz;
      bola.x = px + ux * RADIO; bola.z = pz + uz * RADIO;
      if (hacia < 0) { vel.x -= (1 + REBOTE) * hacia * ux; vel.z -= (1 + REBOTE) * hacia * uz; }
    }
    // Por si se coló: de vuelta adentro
    if (!dentroDe(forma, bola.x, bola.z)) { bola.x = previa.x; bola.z = previa.z; vel.x = vel.z = 0; }
  };
  // Un paso corto de la pelota: pendientes, vuelo, roce, escalones, bordes, piedras, hongos, molino y gólem
  const paso = (dt: number, t: number) => {
    const h = HOYOS[actual], suelo = alto(bola.x, bola.z), enSuelo = bola.y <= suelo + 0.02 && vel.y <= 0.01;
    let vyTerreno = 0;
    if (enSuelo) {
      const ep = 0.05, gx = (alto(bola.x + ep, bola.z) - alto(bola.x - ep, bola.z)) / (2 * ep), gz = (alto(bola.x, bola.z + ep) - alto(bola.x, bola.z - ep)) / (2 * ep);
      // Una pelota que rueda siente 5/7 de la gravedad en la pendiente
      vel.x -= G * (5 / 7) * gx * dt; vel.z -= G * (5 / 7) * gz * dt;
      // En pendiente el roce es menor que la gravedad: la pelota no se queda pegada a media loma, vuelve rodando
      const pendiente = Math.hypot(gx, gz), enArena = (h.arena ?? []).some((a) => dentro(bola.x, bola.z, a)), rapidez = Math.hypot(vel.x, vel.z), nueva = Math.max(0, rapidez - ROCE * (enArena ? 4 : 1) * Math.max(0.2, 1 - pendiente * 3.5) * dt);
      if (rapidez > 0) { vel.x *= nueva / rapidez; vel.z *= nueva / rapidez; }
      // Velocidad vertical que trae: la pendiente medida hacia atrás (en el borde de una rampa, hacia adelante ya no hay rampa)
      const rr = Math.hypot(vel.x, vel.z);
      vyTerreno = rr > 0.01 ? ((suelo - alto(bola.x - (vel.x / rr) * 0.05, bola.z - (vel.z / rr) * 0.05)) / 0.05) * rr : 0;
      if (nueva < 0.15 && Math.hypot(gx, gz) < 0.02) { vel.x = vel.z = 0; }
    } else {
      // En el aire: gravedad y roce del aire
      vel.y -= G * dt;
      const f = 1 - AIRE * dt; vel.x *= f; vel.z *= f;
    }
    // Avance por ejes: un escalón más alto que la pelota la frena como un muro
    const nx = bola.x + vel.x * dt;
    if (alto(nx, bola.z) > bola.y + ESCALON) vel.x *= -REBOTE; else bola.x = nx;
    const nz = bola.z + vel.z * dt;
    if (alto(bola.x, nz) > bola.y + ESCALON) vel.z *= -REBOTE; else bola.z = nz;
    // Altura: pegada al suelo, o despega si el suelo cae más rápido que ella (fin de una rampa o borde de una loma)
    const piso = alto(bola.x, bola.z);
    if (enSuelo) {
      const esperado = bola.y + vyTerreno * dt;
      if (piso < esperado - 0.04 && Math.hypot(vel.x, vel.z) > 2) { vel.y = Math.max(0, vyTerreno); bola.y = esperado; enVuelo = true; }
      else { bola.y = piso; vel.y = 0; }
    } else {
      bola.y += vel.y * dt;
      if (bola.y <= piso) {
        bola.y = piso;
        if (vel.y < -2.5) { vel.y = -vel.y * 0.3; e.sonido.tono(180, 0.05, { tipo: 'sine', vol: 0.1 }); }
        else vel.y = 0;
        // El efecto de un tiro elevado frena la pelota al caer
        if (enVuelo) { const f = tiroAlto ? 0.6 : 0.85; vel.x *= f; vel.z *= f; enVuelo = vel.y > 0; if (!enVuelo) tiroAlto = false; }
      }
    }
    chocarBordes();
    for (const piedra of h.piedras) chocar(piedra, altoEn(h, piedra[0], piedra[1]) + MURO);
    if (movilAhora) chocar(movilAhora, MURO + 0.1);
    if (h.molino && tapado) chocar([h.molino[0] - 1.05, h.molino[1], 0.24, 2], 1.6);
    for (const hg of hongos) {
      const dx = bola.x - hg.x, dz = bola.z - hg.z, d = Math.hypot(dx, dz);
      if (d >= RADIO + HONGO || d === 0 || bola.y > altoEn(h, hg.x, hg.z) + 1.4) continue;
      // El hongo devuelve la pelota con más fuerza que un muro
      const ux = dx / d, uz = dz / d, hacia = vel.x * ux + vel.z * uz;
      bola.x = hg.x + ux * (RADIO + HONGO); bola.z = hg.z + uz * (RADIO + HONGO);
      if (hacia >= 0) continue;
      vel.x -= 2 * hacia * ux; vel.z -= 2 * hacia * uz;
      const rapidez = Math.hypot(vel.x, vel.z), nueva = Math.min(VEL_MAX, Math.max(rapidez * 1.2, 7));
      vel.x *= nueva / rapidez; vel.z *= nueva / rapidez;
      hg.golpe = t;
      e.sonido.tono(330, 0.18, { tipo: 'sine', vol: 0.25, hasta: 720 });
      e.chispas(hg.x, 1, hg.z, ['#ff5a4a', '#ffffff'], 8, 3);
    }
  };

  // ── Música tranquila, hecha en el momento (acordes suaves y unas notas sueltas); se apaga con M ──
  let musicaOn = (() => { try { return localStorage.getItem('susto.golfMusica') !== 'no'; } catch { return true; } })(), musicaGain: GainNode | null = null, compas = 0, proximo = 0, latido = 0;
  const ACORDES = [[130.8, 164.8, 196, 246.9], [110, 130.8, 164.8, 196], [87.3, 110, 130.8, 164.8], [98, 123.5, 146.8, 196]], ESCALA = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
  const nivelMusica = () => (musicaOn ? 0.16 * volumen() : 0);
  const programar = () => {
    const ctx = e.sonido.ctx;
    if (!ctx || !musicaGain) return;
    while (proximo < ctx.currentTime + 2) {
      const acorde = ACORDES[compas % ACORDES.length], t0 = Math.max(proximo, ctx.currentTime), dura = 4;
      for (const f of acorde) {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 1.2); g.gain.linearRampToValueAtTime(0.0001, t0 + dura + 0.6);
        osc.connect(g).connect(musicaGain); osc.start(t0); osc.stop(t0 + dura + 0.7);
      }
      for (let k = 0; k < 3; k++) {
        if (Math.random() < 0.35) continue;
        const osc = ctx.createOscillator(), g = ctx.createGain(), tn = t0 + 0.4 + k * 1.2 + Math.random() * 0.3;
        osc.type = 'triangle'; osc.frequency.value = ESCALA[Math.floor(Math.random() * ESCALA.length)];
        g.gain.setValueAtTime(0.0001, tn); g.gain.linearRampToValueAtTime(0.035, tn + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, tn + 1.4);
        osc.connect(g).connect(musicaGain); osc.start(tn); osc.stop(tn + 1.5);
      }
      compas++; proximo = t0 + dura;
    }
  };
  const iniciarMusica = () => {
    const ctx = e.sonido.ctx;
    if (!ctx || musicaGain) return;
    const filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 1400;
    musicaGain = ctx.createGain(); musicaGain.gain.value = nivelMusica();
    musicaGain.connect(filtro).connect(ctx.destination);
    proximo = ctx.currentTime + 0.2;
    programar();
    latido = window.setInterval(programar, 1000);
  };
  const quitarVolumen = alCambiarVolumen(() => { if (musicaGain) musicaGain.gain.value = nivelMusica(); });
  const alternarMusica = () => {
    musicaOn = !musicaOn;
    try { localStorage.setItem('susto.golfMusica', musicaOn ? 'si' : 'no'); } catch { /* sin almacenamiento */ }
    if (musicaGain) musicaGain.gain.value = nivelMusica();
    botonMusica.classList.toggle('apagado', !musicaOn);
    e.hud.aviso(musicaOn ? 'Música encendida' : 'Música apagada', '', 0.9);
  };
  botonMusica.classList.toggle('apagado', !musicaOn);

  montar(0);
  vistaGeneral();
  ubicarCamara(0, true);
  e.hud.puntos(0);
  const desde = new THREE.Vector3(), mira = new THREE.Vector3(), eje = new THREE.Vector3(), giro = new THREE.Quaternion();
  e.alCuadro((t, dt) => {
    const h = HOYOS[actual] ?? HOYOS[HOYOS.length - 1];
    // Ambiente
    telaLava.offset.x += dt * 0.05;
    telaRio.offset.x -= dt * 0.08;
    telaRio.offset.y = Math.sin(t * 0.7) * 0.05;
    telaPozas.offset.set(Math.sin(t * 0.4) * 0.3, t * 0.06);
    for (const o of piezas.children) { const tex = o.userData.lava as THREE.Texture | undefined; if (tex) tex.offset.copy(telaPozas.offset); }
    for (const a of aguas) (a.material as THREE.MeshLambertMaterial).opacity = 0.86 + Math.sin(t * 2) * 0.06;
    fumarola.avanzar(dt);
    for (const p of pajaros) {
      const { izq, der, fase, radio, alto: ay } = p.userData, a = t * 0.25 + fase;
      p.position.set(4 + Math.cos(a) * radio, ay + Math.sin(a * 2) * 0.6, -42 + Math.sin(a) * radio * 0.6);
      p.rotation.y = -a;
      izq.rotation.z = Math.sin(t * 8 + fase) * 0.6; der.rotation.z = -izq.rotation.z;
    }
    for (const hg of hongos) { const s = t - hg.golpe < 0.3 ? 1 + Math.sin((t - hg.golpe) * 21) * 0.25 : 1; hg.malla.scale.set(s, 2 - s, s); }
    for (const p of portales) p.rotation.z = t * 3;
    // Aspas: una aspa abajo tapa la entrada del túnel
    if (aspas) { const ang = t * 1.1; aspas.rotation.x = ang; const resto = ((ang % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); tapado = resto < 0.42 || resto > Math.PI / 2 - 0.42; } else tapado = false;
    if (t > burbujas && pozas.length) {
      burbujas = t + 0.35;
      const p = pozas[Math.floor(Math.random() * pozas.length)];
      e.chispas(p.x + (Math.random() - 0.5) * p.w, 0.15, p.z + (Math.random() - 0.5) * p.d, ['#ffb02e', '#ff6a1e'], 2, 1.6);
    }

    // Pelota: rueda según su velocidad (la línea muestra el giro), sombra que se achica al volar, estela
    pelota.position.set(bola.x, bola.y + RADIO + 0.04, bola.z);
    const rap = Math.hypot(vel.x, vel.z);
    if (rap > 0.01) { eje.set(vel.z, 0, -vel.x).normalize(); giro.setFromAxisAngle(eje, (rap * dt) / RADIO); pelota.quaternion.premultiply(giro); }
    pelota.visible = sombraPelota.visible = cambio < 0 || t < cambio - 1.2;
    const sobre = bola.y - alto(bola.x, bola.z);
    sombraPelota.position.set(bola.x + 0.08, alto(bola.x, bola.z) + 0.05, bola.z + 0.08);
    sombraPelota.scale.setScalar(Math.max(0.4, 1 - sobre * 0.25));
    if (!quieta()) { rastro.unshift({ x: bola.x, y: bola.y, z: bola.z }); if (rastro.length > 14) rastro.pop(); } else if (rastro.length) rastro.pop();
    estela.forEach((b, i) => { const p = rastro[i * 2 + 1]; b.visible = !!p && pelota.visible; if (p) b.position.set(p.x, p.y + RADIO + 0.04, p.z); });
    tela.rotation.y = Math.sin(t * 3) * 0.25;
    // Guía: rodado, una línea; elevado, el arco del vuelo
    const apunta = tiro.tirando && tiro.fuerza > 0.06;
    puntosGuia.forEach((p, i) => {
      p.visible = apunta;
      if (!apunta) return;
      const v = (elevado ? VEL_ELEVADO : VEL_MAX) * tiro.fuerza, s = (i + 1) * (elevado ? 0.06 : 0.04);
      if (elevado) { const vh = v * 0.82, vy = v * 0.62; p.position.set(bola.x + tiro.dx * vh * s, bola.y + 0.3 + vy * s - 0.5 * G * s * s, bola.z + tiro.dz * vh * s); }
      else p.position.set(bola.x + tiro.dx * v * s, bola.y + 0.3, bola.z + tiro.dz * v * s);
      p.visible = p.position.y > alto(p.position.x, p.position.z) - 0.1 && dentroDe(forma, p.position.x, p.position.z);
      p.scale.setScalar(1 - i * 0.04);
    });
    if (quieta() && cambio < 0) {
      // El golfista se para detrás de la pelota, mirando hacia donde se va a tirar
      const dir = apunta ? Math.atan2(tiro.dx, tiro.dz) : Math.atan2(h.meta[0] - bola.x, h.meta[1] - bola.z);
      const gx = bola.x - Math.sin(dir) * 0.9, gz = bola.z - Math.cos(dir) * 0.9;
      golfista.grupo.position.set(gx, alto(gx, gz) + 0.04, gz);
      golfista.grupo.rotation.y = dir;
    }
    if (golem) for (const p of pupilas) {
      const dx = bola.x - golem.position.x, dz = bola.z - golem.position.z, d = Math.hypot(dx, dz) || 1;
      p.position.x = (p.position.x > 0 ? 1 : -1) * Math.min(0.25, (movilAhora?.[2] ?? 1) / 4) + (dx / d) * 0.09;
      p.position.z = Math.min(0.25, (movilAhora?.[3] ?? 1) / 4) + 0.06 + (dz / d) * 0.06;
    }
    const m = h.movil;
    if (m && !terminado && golem) {
      const corre = Math.sin(t * 1.2 * (1 + (c.nivel - 1) * 0.12)) * m[5];
      movilAhora = [m[0] + (m[4] === 'x' ? corre : 0), m[1] + (m[4] === 'z' ? corre : 0), m[2], m[3]];
      golem.position.set(movilAhora[0], 0.04 + Math.abs(Math.sin(t * 4.8)) * 0.08, movilAhora[1]);
      if (quieta()) chocar(movilAhora); // si la pelota está parada en su camino, la empuja
    }

    // Cámara: presentación del hoyo y después la órbita libre (sigue a la pelota si está en modo pelota)
    if (t - presenta < PRESENTA && !terminado) {
      const k = suave(limitar((t - presenta) / PRESENTA, 0, 1));
      ubicarCamara(dt, true);
      desde.set(h.meta[0] + 3.5, 3.2 + alto(h.meta[0], h.meta[1]), h.meta[1] + 5);
      mira.set(h.meta[0], 0.5, h.meta[1]).lerp(camara.centro, k);
      e.camara.position.lerpVectors(desde, e.camara.position.clone(), k);
      e.camara.lookAt(mira);
    } else ubicarCamara(dt);

    if (terminado || t <= 0) return;
    e.hud.extra(`Par ${h.par} · Golpes: ${golpes}${racha >= 2 ? ` · racha ${racha}` : ''}`);
    e.hud.puntos(puntos);
    if (cambio >= 0) {
      if (t < cambio) return;
      cambio = -1;
      if (++actual >= HOYOS.length) { if (!c.libre) return terminar(); actual = 0; } // modo libre: los hoyos vuelven a empezar
      return montar(t);
    }
    // Reloj de tiro: 30 s para pegarle (si no, cuenta un golpe)
    if (quieta()) {
      if (limiteTiro === Infinity && t - presenta > PRESENTA) limiteTiro = t + RELOJ_TIRO;
      const queda = Math.ceil(limiteTiro - t);
      e.hud.tiempo(queda <= 10 ? `⏱ ${queda} s` : `Hoyo ${actual + 1} de ${HOYOS.length}`);
      if (t >= limiteTiro && !c.libre && !tiro.tirando) { golpes++; total++; limiteTiro = t + RELOJ_TIRO; e.sonido.mal(); e.hud.aviso('¡Se acabó el tiempo! +1 golpe', 'mal', 1.2); }
      if (golpes >= TOPE && !c.libre) { festejar(false); cerrarHoyo(t, `Tope de ${TOPE} golpes`, 'mal'); }
      return;
    }
    for (let i = 0; i < 6 && !quieta(); i++) {
      paso(Math.min(dt, 0.05) / 6, t);
      const ym = alto(h.meta[0], h.meta[1]);
      if (Math.hypot(bola.x - h.meta[0], bola.z - h.meta[1]) < HOYO && bola.y <= ym + 0.05 && Math.hypot(vel.x, vel.z) < 10) {
        const nombre = NOMBRE_GOLPES(golpes, h.par), bueno = golpes <= h.par;
        e.sonido.bien();
        e.chispas(h.meta[0], ym + 0.6, h.meta[1], golpes === 1 ? ['#ffd23c', '#ff5a4a', '#5ad1ff', '#ffffff'] : ['#ffffff', '#ffd23c'], golpes === 1 ? 70 : bueno ? 36 : 14, golpes === 1 ? 8 : 5);
        if (golpes === 1) { e.temblar(0.6); e.chispas(4, 19, -42, ['#ff6a1e', '#ffb02e', '#3a2a26'], 50, 9); }
        e.gesto(golfista, bueno ? 'emote-yes' : 'idle', 1.2);
        festejar(bueno);
        return cerrarHoyo(t, golpes === 1 ? '¡Hoyo en uno!' : `${nombre} · ${golpes} ${golpes === 1 ? 'golpe' : 'golpes'}`, bueno ? 'oro' : '');
      }
      if (h.portal && t > enfriaPortal) {
        const [entrada, salida] = h.portal;
        if (Math.hypot(bola.x - entrada[0], bola.z - entrada[1]) < PORTAL * 0.8) {
          e.chispas(entrada[0], 0.4, entrada[1], ['#b07bff', '#ffffff'], 14, 3);
          const r = Math.hypot(vel.x, vel.z) || 1;
          bola.x = salida[0] + (vel.x / r) * (PORTAL + 0.1); bola.z = salida[1] + (vel.z / r) * (PORTAL + 0.1);
          rastro.length = 0;
          enfriaPortal = t + 0.6;
          e.chispas(salida[0], 0.4, salida[1], ['#ff7ae0', '#ffffff'], 14, 3);
          e.sonido.tono(880, 0.25, { tipo: 'triangle', vol: 0.2, hasta: 220 });
        }
      }
      // Lava o agua (solo si la pelota toca el suelo ahí): un golpe de castigo y de vuelta al punto anterior
      const abajo = bola.y <= 0.05;
      const enLava = abajo && h.lava.some((l) => dentro(bola.x, bola.z, l)), enAgua = abajo && (h.agua ?? []).some(([ax, az, aw, ad]) => ((bola.x - ax) / (aw / 2)) ** 2 + ((bola.z - az) / (ad / 2)) ** 2 < 1);
      if (enLava || enAgua) {
        e.chispas(bola.x, 0.3, bola.z, enLava ? ['#ff6a1e', '#ffd23c', '#3a2a26'] : ['#bfe6ff', '#3f9bd8', '#ffffff'], 18, 4);
        golpes++; total++;
        bola.x = previa.x; bola.z = previa.z; bola.y = alto(bola.x, bola.z); vel.x = vel.y = vel.z = 0;
        rastro.length = 0;
        e.sonido.mal();
        e.temblar(0.25);
        e.gesto(golfista, 'emote-no', 1);
        e.hud.aviso(enLava ? '¡Lava! +1 golpe' : '¡Al agua! +1 golpe', 'mal', 0.9);
      }
    }
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__golf = { traza: () => ({ ...bola, vx: vel.x, vy: vel.y, vuelo: enVuelo }), estado: () => ({ hoyo: actual, nombre: HOYOS[actual]?.nombre, par: HOYOS[actual]?.par, bola: { ...bola }, quieta: quieta(), golpes, total, puntos, meta: HOYOS[actual]?.meta, terminado, puede: puedeTirar() }), golpear: (dx: number, dz: number, f: number, alto = false) => { if (puedeTirar()) { const l = Math.hypot(dx, dz) || 1; golpear(dx / l, dz / l, f, alto); } } };

  return {
    empezar() { e.empezar(); empezado = true; iniciarMusica(); e.hud.aviso('Arrastra desde la pelota para tirar · fuera de ella, mueves la cámara', '', 3); },
    destruir() { clearInterval(latido); quitarVolumen(); musicaGain?.disconnect(); e.destruir(); },
  };
}
