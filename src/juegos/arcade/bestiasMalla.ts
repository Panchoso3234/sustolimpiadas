import { MeshBasicMaterial } from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

// Las mallas orgánicas de Bestiario: formas simples (elipsoides y tubos) que se funden con un campo de distancia suave
// y se convierten en malla con marching cubes, con el color pintado en cada vértice. Todo son datos simples, así que
// esto corre igual en la página o en un Web Worker (para no trabar el juego mientras se calcula).

export type V = [number, number, number];
/** Una forma: elipsoide (0) o tubo que se afina (1). `inv`: giro inverso del elipsoide (matriz 3×3 por columnas). */
export interface Prim { tipo: 0 | 1; c: V; r: V; a: V; b: V; r1: number; r2: number; inv: number[] | null; color: V; parte: string; k: number; centro: V; radio: number }
export interface MallaDatos { pos: Float32Array; nor: Float32Array; col: Float32Array }

export const sdf = (p: Prim, x: number, y: number, z: number) => {
  if (p.tipo === 0) {
    let dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2];
    if (p.inv) { const e = p.inv; const tx = e[0] * dx + e[3] * dy + e[6] * dz, ty = e[1] * dx + e[4] * dy + e[7] * dz, tz = e[2] * dx + e[5] * dy + e[8] * dz; dx = tx; dy = ty; dz = tz; }
    const [rx, ry, rz] = p.r, ax = dx / rx, ay = dy / ry, az = dz / rz, k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = dx / (rx * rx), by = dy / (ry * ry), bz = dz / (rz * rz), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
  }
  const [ax, ay, az] = p.a, bax = p.b[0] - ax, bay = p.b[1] - ay, baz = p.b[2] - az, pax = x - ax, pay = y - ay, paz = z - az;
  const t = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const qx = pax - bax * t, qy = pay - bay * t, qz = paz - baz * t;
  return Math.sqrt(qx * qx + qy * qy + qz * qz) - (p.r1 + (p.r2 - p.r1) * t);
};
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

const cubos = new Map<number, MarchingCubes>();
/** La malla de un grupo de formas y sus pinturas (las pinturas solo cambian el color donde la piel queda adentro). */
export function mallar(formas: Prim[], pinturas: Prim[], res: number): MallaDatos | null {
  if (!formas.length) return null;
  const min: V = [Infinity, Infinity, Infinity], max: V = [-Infinity, -Infinity, -Infinity];
  for (const f of formas) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], f.centro[i] - f.radio); max[i] = Math.max(max[i], f.centro[i] + f.radio); }
  const lado = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) + 0.16, medio: V = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  let mc = cubos.get(res);
  if (!mc) { mc = new MarchingCubes(res, new MeshBasicMaterial(), false, true, 60000); cubos.set(res, mc); }
  const n = mc.size, half = mc.halfsize, esc = lado / 2, campo = mc.field, paleta = mc.palette;
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = medio[0] + ((x - half) / half) * esc, py = medio[1] + ((y - half) / half) * esc, pz = medio[2] + ((z - half) / half) * esc;
    let d = Infinity, w = 0, cr = 0, cg = 0, cb = 0;
    for (const f of formas) {
      const ex = px - f.centro[0], ey = py - f.centro[1], ez = pz - f.centro[2], lejos = Math.sqrt(ex * ex + ey * ey + ez * ez) - f.radio;
      const di = lejos > 0.12 ? lejos : sdf(f, px, py, pz);
      d = d === Infinity ? di : smin(d, di, f.k);
      const wi = Math.exp(-28 * Math.max(-0.12, di));
      w += wi; cr += f.color[0] * wi; cg += f.color[1] * wi; cb += f.color[2] * wi;
    }
    let r = cr / w, g = cg / w, b = cb / w;
    for (const pt of pinturas) { const dp = sdf(pt, px, py, pz); if (dp < 0.025) { const k = Math.min(1, (0.025 - dp) / 0.05); r += (pt.color[0] - r) * k; g += (pt.color[1] - g) * k; b += (pt.color[2] - b) * k; } }
    const i = x + y * n + z * n * n;
    campo[i] = 80 - d * 700;
    paleta[i * 3] = r; paleta[i * 3 + 1] = g; paleta[i * 3 + 2] = b;
  }
  mc.update();
  const cuenta = mc.count, pos = mc.positionArray.slice(0, cuenta * 3), nor = mc.normalArray.slice(0, cuenta * 3), col = mc.colorArray.slice(0, cuenta * 3);
  for (let i = 0; i < cuenta; i++) { pos[i * 3] = medio[0] + pos[i * 3] * esc; pos[i * 3 + 1] = medio[1] + pos[i * 3 + 1] * esc; pos[i * 3 + 2] = medio[2] + pos[i * 3 + 2] * esc; }
  return { pos, nor, col };
}

/** Pedido al trabajador: las partes de una especie, cada una con sus formas, pinturas y resolución. */
export interface Pedido { n: number; partes: { nombre: string; formas: Prim[]; pinturas: Prim[]; res: number }[] }
export interface Respuesta { n: number; mallas: Record<string, MallaDatos | null> }
export const resolverPedido = (p: Pedido): Respuesta => ({ n: p.n, mallas: Object.fromEntries(p.partes.map((x) => [x.nombre, mallar(x.formas, x.pinturas, x.res)])) });
