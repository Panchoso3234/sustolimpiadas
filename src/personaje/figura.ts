import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ALTO, type Kenney } from './kenney';

// Figuras chibi estilo gachapón, armadas por código a partir de una "receta" (colores, peinado, ropa y accesorios).
// Un solo molde para todos los personajes: agregar uno nuevo es escribir su receta en figuras.ts.
// El cuerpo es una figura articulada (piezas rígidas colgadas de huesos con nombres humanoides), así que usa las mismas
// animaciones que los avatares VRM (public/avatares/animaciones.json). Las piezas de cada hueso se funden en una sola
// malla con colores por vértice: unas 16 mallas por figura, livianas para una gráfica integrada.

export type Peinado = 'largo' | 'medio' | 'corto' | 'coletas' | 'cola' | 'moño';
export type Accesorio =
  | { tipo: 'cintillo'; color: string }
  | { tipo: 'lazo'; color: string; lado?: number; alto?: number; tam?: number }
  | { tipo: 'sombrero'; color: string; cinta?: string; inclinado?: number }
  | { tipo: 'cuernos'; color: string }
  | { tipo: 'orejas'; color: string; interior?: string }
  | { tipo: 'cola'; color: string; punta?: string; forma?: 'tiburon' | 'zorro' }
  | { tipo: 'halo'; color: string }
  | { tipo: 'flor'; color: string; lado?: number }
  | { tipo: 'gafas'; color: string }
  | { tipo: 'corbata'; color: string };

export interface Receta {
  nombre: string;
  juego: string;
  piel?: string;
  /** Color de los ojos (uno o dos, si son de distinto color). */
  ojos: string | [string, string];
  boca?: 'sonrisa' | 'abierta' | 'gato' | 'colmillo' | 'seria';
  pelo: { color: string; punta?: string; peinado: Peinado; mechones?: boolean };
  ropa: { arriba: string; abajo: string; falda?: boolean; borde?: string; mangas?: string; guantes?: string; medias: string; zapatos: string };
  accesorios?: Accesorio[];
}

// ── Materiales: sombreado "anime" (dos o tres tonos) ──
let degradado: THREE.DataTexture | null = null;
const tonos = () => {
  if (!degradado) {
    degradado = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    degradado.minFilter = degradado.magFilter = THREE.NearestFilter;
    degradado.needsUpdate = true;
  }
  return degradado;
};

/** Pieza suelta: una geometría con su color, ya ubicada respecto del hueso que la lleva. */
interface Pieza { geo: THREE.BufferGeometry; color: string }
const pieza = (geo: THREE.BufferGeometry, color: string, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], esc: [number, number, number] = [1, 1, 1]): Pieza => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...esc));
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  return { geo: g, color };
};
/** Funde todas las piezas de un hueso en una malla con colores por vértice. */
function fundir(piezas: Pieza[], material: THREE.Material): THREE.Mesh | null {
  if (!piezas.length) return null;
  const c = new THREE.Color();
  const geos = piezas.map(({ geo, color }) => {
    const n = geo.attributes.position.count, cols = new Float32Array(n * 3);
    c.set(color).convertSRGBToLinear();
    for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k);
    return geo;
  });
  const m = new THREE.Mesh(mergeGeometries(geos)!, material);
  m.frustumCulled = false;
  return m;
}

// ── Cara: ojos, cejas, mejillas y boca dibujados en una textura ──
function cara(r: Receta): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  const [ojoIzq, ojoDer] = typeof r.ojos === 'string' ? [r.ojos, r.ojos] : r.ojos;
  const ojo = (cx: number, color: string) => {
    const cy = 128, rx = 27, ry = 36;
    g.save();
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
    g.clip();
    const iris = g.createLinearGradient(0, cy - ry, 0, cy + ry);
    iris.addColorStop(0, new THREE.Color(color).multiplyScalar(0.45).getStyle()); iris.addColorStop(0.55, color); iris.addColorStop(1, new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.45).getStyle());
    g.beginPath(); g.ellipse(cx, cy + 3, rx - 3, ry - 2, 0, 0, Math.PI * 2); g.fillStyle = iris; g.fill();
    g.beginPath(); g.ellipse(cx, cy + 2, 10, 15, 0, 0, Math.PI * 2); g.fillStyle = new THREE.Color(color).multiplyScalar(0.25).getStyle(); g.fill();
    g.restore();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(cx - 9, cy - 13, 8, 10, -0.4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx + 10, cy + 16, 4, 0, Math.PI * 2); g.fill();
    // Pestaña de arriba, gruesa, como en el anime
    g.strokeStyle = '#2a1d24'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.ellipse(cx, cy + 2, rx + 2, ry, 0, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(cx + (cx < 128 ? -rx - 2 : rx + 2), cy - 12); g.lineTo(cx + (cx < 128 ? -rx - 9 : rx + 9), cy - 18); g.stroke();
  };
  ojo(84, ojoIzq); ojo(172, ojoDer);
  // Cejas del color del pelo
  g.strokeStyle = new THREE.Color(r.pelo.color).multiplyScalar(0.7).getStyle(); g.lineWidth = 5;
  for (const cx of [84, 172]) { g.beginPath(); g.moveTo(cx - 20, 70); g.quadraticCurveTo(cx, 60, cx + 20, 70); g.stroke(); }
  // Mejillas sonrojadas
  g.fillStyle = 'rgba(255,120,140,0.35)';
  for (const cx of [62, 194]) { g.beginPath(); g.ellipse(cx, 178, 20, 10, 0, 0, Math.PI * 2); g.fill(); }
  // Boca
  g.strokeStyle = '#a0383f'; g.lineWidth = 4; g.fillStyle = '#c94a55';
  const b = r.boca ?? 'sonrisa';
  if (b === 'sonrisa') { g.beginPath(); g.arc(128, 188, 9, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  else if (b === 'abierta') { g.beginPath(); g.ellipse(128, 192, 10, 8, 0, 0, Math.PI); g.fill(); }
  else if (b === 'gato') { g.beginPath(); g.moveTo(116, 188); g.quadraticCurveTo(122, 196, 128, 188); g.quadraticCurveTo(134, 196, 140, 188); g.stroke(); }
  else if (b === 'colmillo') { g.beginPath(); g.ellipse(128, 190, 12, 7, 0, 0, Math.PI); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(121, 190); g.lineTo(125, 197); g.lineTo(129, 190); g.fill(); }
  else { g.beginPath(); g.moveTo(121, 192); g.lineTo(135, 192); g.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ── El esqueleto: huesos con nombres humanoides, en pose T, mirando hacia +Z (la izquierda de la figura es +X) ──
const HUESOS: [string, string | null, [number, number, number]][] = [
  ['hips', null, [0, 0.62, 0]], ['spine', 'hips', [0, 0.06, 0]], ['chest', 'spine', [0, 0.1, 0]], ['upperChest', 'chest', [0, 0.1, 0]],
  ['neck', 'upperChest', [0, 0.1, 0]], ['head', 'neck', [0, 0.06, 0]],
  ['leftShoulder', 'upperChest', [0.05, 0.05, 0]], ['leftUpperArm', 'leftShoulder', [0.1, 0, 0]], ['leftLowerArm', 'leftUpperArm', [0.17, 0, 0]], ['leftHand', 'leftLowerArm', [0.15, 0, 0]],
  ['rightShoulder', 'upperChest', [-0.05, 0.05, 0]], ['rightUpperArm', 'rightShoulder', [-0.1, 0, 0]], ['rightLowerArm', 'rightUpperArm', [-0.17, 0, 0]], ['rightHand', 'rightLowerArm', [-0.15, 0, 0]],
  ['leftUpperLeg', 'hips', [0.09, -0.04, 0]], ['leftLowerLeg', 'leftUpperLeg', [0, -0.25, 0]], ['leftFoot', 'leftLowerLeg', [0, -0.25, 0]], ['leftToes', 'leftFoot', [0, -0.05, 0.08]],
  ['rightUpperLeg', 'hips', [-0.09, -0.04, 0]], ['rightLowerLeg', 'rightUpperLeg', [0, -0.25, 0]], ['rightFoot', 'rightLowerLeg', [0, -0.25, 0]], ['rightToes', 'rightFoot', [0, -0.05, 0.08]],
];

// Geometrías base (se reutilizan)
const esfera = new THREE.SphereGeometry(1, 24, 16), cilindro = new THREE.CylinderGeometry(1, 1, 1, 16), cono = new THREE.ConeGeometry(1, 1, 16);
const capsula = (r: number, largo: number) => new THREE.CapsuleGeometry(r, largo, 4, 12);
/** Cápsula a lo largo del eje X (brazos), desde 0 hasta `largo` (hacia + o − según el lado). */
const brazo = (r: number, largo: number, s: number, color: string) => pieza(capsula(r, largo), color, [(s * largo) / 2, 0, 0], [0, 0, Math.PI / 2]);
/** Cápsula hacia abajo (piernas), desde 0 hasta −largo. */
const pierna = (r: number, largo: number, color: string) => pieza(capsula(r, largo), color, [0, -largo / 2, 0]);

export function crearFigura(r: Receta): Kenney {
  const piel = r.piel ?? '#ffeae0', o = r.ropa, pelo = r.pelo.color, punta = r.pelo.punta ?? pelo;
  const piezas: Record<string, Pieza[]> = {};
  const poner = (hueso: string, p: Pieza) => (piezas[hueso] ??= []).push(p);

  // ── Cuerpo ──
  poner('neck', pieza(cilindro, piel, [0, 0.03, 0], [0, 0, 0], [0.05, 0.12, 0.05]));
  poner('spine', pieza(cilindro, o.arriba, [0, 0.08, 0], [0, 0, 0], [0.13, 0.26, 0.1]));
  poner('chest', pieza(esfera, o.arriba, [0, 0.08, 0], [0, 0, 0], [0.15, 0.13, 0.11]));
  poner('upperChest', pieza(esfera, o.mangas ?? o.arriba, [0.11, 0.04, 0], [0, 0, 0], [0.06, 0.06, 0.06]));
  poner('upperChest', pieza(esfera, o.mangas ?? o.arriba, [-0.11, 0.04, 0], [0, 0, 0], [0.06, 0.06, 0.06]));
  if (o.falda) {
    poner('hips', pieza(cono, o.abajo, [0, -0.06, 0], [0, 0, 0], [0.24, 0.3, 0.2]));
    poner('hips', pieza(cilindro, o.borde ?? o.abajo, [0, -0.205, 0], [0, 0, 0], [0.24, 0.025, 0.2]));
    poner('hips', pieza(cilindro, o.abajo, [0, 0.03, 0], [0, 0, 0], [0.13, 0.12, 0.1]));
  } else {
    poner('hips', pieza(esfera, o.abajo, [0, -0.02, 0], [0, 0, 0], [0.15, 0.09, 0.11]));
    for (const s of [1, -1]) poner('hips', pieza(cilindro, o.abajo, [s * 0.075, -0.09, 0], [0, 0, 0], [0.075, 0.1, 0.075]));
  }
  for (const [lado, s] of [['left', 1], ['right', -1]] as const) {
    poner(`${lado}UpperArm`, brazo(0.045, 0.13, s, o.mangas ?? o.arriba));
    poner(`${lado}LowerArm`, brazo(0.04, 0.11, s, o.guantes ?? piel));
    poner(`${lado}Hand`, pieza(esfera, o.guantes ?? piel, [s * 0.04, 0, 0], [0, 0, 0], [0.055, 0.05, 0.045]));
    poner(`${lado}UpperLeg`, pierna(0.06, 0.18, o.falda ? o.medias : o.abajo));
    poner(`${lado}LowerLeg`, pierna(0.052, 0.19, o.medias));
    poner(`${lado}Foot`, pieza(esfera, o.zapatos, [0, -0.025, 0.035], [0, 0, 0], [0.065, 0.05, 0.1]));
  }

  // ── Cabeza: cara, pelo y accesorios (todo cuelga del hueso "head") ──
  const C: [number, number, number] = [0, 0.33, 0.02], R = 0.4; // centro y radio de la cabeza
  const en = (x: number, y: number, z: number): [number, number, number] => [C[0] + x, C[1] + y, C[2] + z];
  poner('head', pieza(esfera, piel, C, [0, 0, 0], [R, R * 0.93, R * 0.95]));
  // Casquete de pelo (arriba y atrás) y nuca
  poner('head', pieza(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), pelo, en(0, 0.0, 0.0), [0.22, 0, 0], [R * 1.08, R * 1.03, R * 1.07]));
  poner('head', pieza(new THREE.SphereGeometry(1, 24, 16, Math.PI, Math.PI, 0, Math.PI * 0.82), pelo, en(0, 0, -0.01), [0, 0, 0], [R * 1.07, R * 1.0, R * 1.06]));
  // Flequillo: mechones en abanico sobre la frente
  for (let i = -4; i <= 4; i++) {
    // Cada mechón cae sobre la frente: la base arriba (cerca del casquete) y la punta hacia abajo y un poco afuera
    // Las puntas terminan sobre las cejas, así los ojos se ven completos
    const a = i * 0.19, largo = 0.19 - Math.abs(i) * 0.008 + (i % 2 ? 0.025 : 0), y = 0.075 + largo / 2;
    poner('head', pieza(cono, pelo, en(Math.sin(a) * R * 0.99, y, Math.cos(a) * R * 0.97), [Math.PI - 0.3, a, 0], [0.12, largo, 0.04]));
  }
  // Mechones a los lados de la cara
  if (r.pelo.mechones !== false) for (const s of [1, -1]) { poner('head', pieza(capsula(0.04, 0.26), pelo, en(s * R * 0.9, -0.08, R * 0.42), [0.12, 0, s * 0.06], [1, 1, 0.55])); poner('head', pieza(cono, punta, en(s * R * 0.92, -0.3, R * 0.44), [Math.PI + 0.1, 0, 0], [0.04, 0.1, 0.025])); }
  // El peinado
  const p = r.pelo.peinado;
  if (p === 'largo' || p === 'medio') {
    const largo = p === 'largo' ? 0.95 : 0.55;
    poner('head', pieza(capsula(0.33, largo), pelo, en(0, -0.08 - largo / 2, -0.17), [0.08, 0, 0], [1, 1, 0.42]));
    poner('head', pieza(capsula(0.2, largo * 0.35), punta, en(0, -0.12 - largo, -0.2), [0.08, 0, 0], [1.3, 1, 0.42]));
  } else if (p === 'coletas') {
    for (const s of [1, -1]) {
      poner('head', pieza(esfera, punta, en(s * R * 0.95, R * 0.25, -0.05), [0, 0, 0], [0.07, 0.07, 0.07]));
      poner('head', pieza(capsula(0.11, 0.5), pelo, en(s * (R + 0.12), -0.15, -0.08), [0, 0, s * 0.35], [1, 1, 0.8]));
    }
  } else if (p === 'cola') {
    poner('head', pieza(capsula(0.12, 0.55), pelo, en(0, -0.18, -R - 0.06), [0.3, 0, 0], [1, 1, 0.8]));
  } else if (p === 'moño') {
    poner('head', pieza(esfera, pelo, en(0, R * 0.55, -R * 0.7), [0, 0, 0], [0.17, 0.15, 0.15]));
  } else {
    poner('head', pieza(capsula(0.3, 0.06), pelo, en(0, -0.15, -0.12), [0, 0, 0], [1.05, 1, 0.6]));
  }
  // Accesorios
  for (const a of r.accesorios ?? []) {
    if (a.tipo === 'cintillo') poner('head', pieza(new THREE.TorusGeometry(R * 1.08, 0.03, 8, 32, Math.PI), a.color, en(0, 0, 0.0), [-0.15, 0, 0], [1, 1.0, 1]));
    else if (a.tipo === 'lazo') {
      const s = a.lado ?? 1, t = a.tam ?? 1, y = a.alto ?? 0.3, x = s * R * 0.85, z = 0;
      for (const k of [1, -1]) poner('head', pieza(cono, a.color, en(x, y, z + k * 0.08 * t), [Math.PI / 2 * k, 0, 0], [0.06 * t, 0.15 * t, 0.025 * t]));
      poner('head', pieza(esfera, a.color, en(x, y, z), [0, 0, 0], [0.04 * t, 0.04 * t, 0.04 * t]));
      for (const k of [1, -1]) poner('head', pieza(cono, a.color, en(x, y - 0.1 * t, z + k * 0.03 * t), [0, 0, Math.PI], [0.03 * t, 0.16 * t, 0.012 * t]));
    } else if (a.tipo === 'sombrero') {
      const inc = a.inclinado ?? 0.25;
      poner('head', pieza(cilindro, a.color, en(0.08, R * 1.02, 0), [0, 0, -inc], [0.27, 0.025, 0.27]));
      poner('head', pieza(cilindro, a.color, en(0.1, R * 1.02 + 0.12, 0), [0, 0, -inc], [0.17, 0.24, 0.17]));
      if (a.cinta) poner('head', pieza(cilindro, a.cinta, en(0.085, R * 1.02 + 0.04, 0), [0, 0, -inc], [0.175, 0.04, 0.175]));
    } else if (a.tipo === 'cuernos') for (const s of [1, -1]) poner('head', pieza(cono, a.color, en(s * R * 0.5, R * 0.88, 0), [0, 0, -s * 0.4], [0.05, 0.2, 0.05]));
    else if (a.tipo === 'orejas') for (const s of [1, -1]) {
      poner('head', pieza(cono, a.color, en(s * R * 0.55, R * 0.92, -0.02), [0, 0, -s * 0.3], [0.1, 0.2, 0.05]));
      if (a.interior) poner('head', pieza(cono, a.interior, en(s * R * 0.55, R * 0.9, 0.02), [0, 0, -s * 0.3], [0.06, 0.13, 0.03]));
    } else if (a.tipo === 'halo') poner('head', pieza(new THREE.TorusGeometry(0.22, 0.02, 8, 32), a.color, en(0, R * 1.25, 0), [Math.PI / 2, 0, 0]));
    else if (a.tipo === 'flor') { const s = a.lado ?? 1; for (let k = 0; k < 5; k++) { const ang = (k / 5) * Math.PI * 2; poner('head', pieza(esfera, a.color, en(s * R * 0.8 + Math.cos(ang) * 0.045, R * 0.45 + Math.sin(ang) * 0.045, 0.18), [0, 0, 0], [0.035, 0.035, 0.02])); } poner('head', pieza(esfera, '#ffe066', en(s * R * 0.8, R * 0.45, 0.19), [0, 0, 0], [0.025, 0.025, 0.02])); }
    else if (a.tipo === 'gafas') for (const s of [1, -1]) poner('head', pieza(new THREE.TorusGeometry(0.075, 0.01, 6, 20), a.color, en(s * 0.16, -0.02, R * 0.92)));
    else if (a.tipo === 'corbata') { poner('upperChest', pieza(cono, a.color, [0, -0.06, 0.11], [Math.PI, 0, 0], [0.04, 0.12, 0.02])); poner('upperChest', pieza(esfera, a.color, [0, 0.02, 0.11], [0, 0, 0], [0.035, 0.03, 0.025])); }
    else if (a.tipo === 'cola') {
      const tiburon = a.forma !== 'zorro';
      poner('hips', pieza(cono, a.color, [0, -0.05, -0.22], [-Math.PI / 2 - 0.4, 0, 0], tiburon ? [0.08, 0.35, 0.06] : [0.1, 0.32, 0.1]));
      if (a.punta) poner('hips', pieza(cono, a.punta, [0, -0.17, -0.37], [-Math.PI / 2 - 0.4, 0, 0], tiburon ? [0.05, 0.12, 0.03] : [0.06, 0.1, 0.06]));
      if (tiburon) poner('hips', pieza(cono, a.color, [0, 0.02, -0.25], [-0.6, 0, 0], [0.03, 0.12, 0.015]));
    }
  }

  // ── Armar: huesos, mallas fundidas por hueso y la cara encima de la cabeza ──
  const grupo = new THREE.Group(), material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: tonos() });
  const nodos: Record<string, THREE.Object3D> = {};
  for (const [nombre, padre, pos] of HUESOS) {
    const n = new THREE.Object3D(); n.name = `figura_${nombre}`; n.position.set(...pos);
    (padre ? nodos[padre] : grupo).add(n); nodos[nombre] = n;
    const m = fundir(piezas[nombre] ?? [], material);
    if (m) n.add(m);
  }
  const L = Math.PI * 0.62, caraM = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, 24, 16, Math.PI / 2 - L / 2, L, Math.PI * 0.3, Math.PI * 0.48), new THREE.MeshBasicMaterial({ map: cara(r), transparent: true, depthWrite: false }));
  caraM.position.set(...C); caraM.scale.set(1, 0.93, 0.95); caraM.frustumCulled = false;
  nodos.head.add(caraM);

  // Mismo alto que los demás personajes (la figura mide ~2 de alto)
  grupo.scale.setScalar(ALTO / 1.95);
  return animarFigura(grupo, nodos);
}

// ── Animaciones (las mismas de los VRM: cada hueso recibe su rotación en pose T) ──
interface Pista { hueso: string; tipo: 'q' | 'p'; tiempos: number[]; valores: number[] }
let animaciones: Promise<Record<string, { duracion: number; repite: boolean; pistas: Pista[] }>> | null = null;
export const cargarAnimaciones = () => (animaciones ??= fetch(`${import.meta.env.BASE_URL}avatares/animaciones.json`).then((r) => r.json()));
let cargadas: Record<string, { duracion: number; repite: boolean; pistas: Pista[] }> | null = null;
cargarAnimaciones().then((a) => { cargadas = a; }).catch(() => undefined);

function animarFigura(grupo: THREE.Group, nodos: Record<string, THREE.Object3D>): Kenney {
  const mixer = new THREE.AnimationMixer(grupo), clips: Record<string, { clip: THREE.AnimationClip; repite: boolean }> = {};
  const altoCadera = nodos.hips.position.y;
  const armar = (todas: NonNullable<typeof cargadas>) => {
    for (const [nombre, a] of Object.entries(todas)) {
      const pistas = a.pistas.filter((p) => nodos[p.hueso]).map((p) => (p.tipo === 'q'
        ? new THREE.QuaternionKeyframeTrack(`${nodos[p.hueso].name}.quaternion`, p.tiempos, p.valores)
        : new THREE.VectorKeyframeTrack(`${nodos[p.hueso].name}.position`, p.tiempos, p.valores.map((v) => v * altoCadera))));
      clips[nombre] = { clip: new THREE.AnimationClip(nombre, a.duracion, pistas), repite: a.repite };
    }
  };
  let actual = '', accion: THREE.AnimationAction | null = null, pendiente = 'idle';
  const api: Kenney = {
    grupo, ranuras: [],
    animar(nombre, unaVez = false) {
      pendiente = nombre;
      if (!cargadas) return;
      if (!Object.keys(clips).length) armar(cargadas);
      if (nombre === actual) return;
      actual = nombre;
      const c = clips[nombre] ?? clips.idle;
      if (!c) return;
      const nueva = mixer.clipAction(c.clip).reset();
      const vez = unaVez || !c.repite;
      nueva.setLoop(vez ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      nueva.clampWhenFinished = vez;
      nueva.play();
      if (accion && accion !== nueva) nueva.crossFadeFrom(accion, 0.18, false);
      accion = nueva;
    },
  };
  grupo.userData.avanzar = (dt: number) => { if (cargadas && !actual) api.animar(pendiente); mixer.update(dt); };
  grupo.userData.kenney = api;
  grupo.userData.figura = true;
  api.animar('idle');
  return api;
}
