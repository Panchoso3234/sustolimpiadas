import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { TIPOS, especie, type Forma } from './bestiasDatos';

// Arma cada criatura de Bestiario en código. El cuerpo, la cabeza y la cola son mallas orgánicas: formas simples
// (elipsoides y tubos) que se funden suavemente entre sí (campo de distancia + marching cubes), con los colores
// pintados en la malla (panza, manchas, antifaz, mejillas). Encima van los detalles: ojos con iris y brillos, cuernos,
// llamas, alas, caparazones. El material tiene sombreado en tonos, una textura de piel según la especie (escamas,
// pelo, plumas) y luz de borde; el contorno sale de la misma malla. La cabeza y la cola están articuladas y se mueven
// con resortes. Cada malla se calcula una vez por especie y se guarda.

type V = [number, number, number];
const GRADIENTE = (() => { const t = new THREE.DataTexture(new Uint8Array([92, 138, 182, 222, 255]), 5, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const materiales = new Map<string, THREE.Material>();
const guardar = <T extends THREE.Material>(k: string, crear: () => T): T => { let m = materiales.get(k) as T | undefined; if (!m) { m = crear(); materiales.set(k, m); } return m; };
/** Mezcla un color con blanco (>0) o negro (<0). */
const tono = (color: string, k: number) => `#${new THREE.Color(color).lerp(new THREE.Color(k > 0 ? '#ffffff' : '#000000'), Math.abs(k)).getHexString()}`;

/** Patrones de piel, calculados en el sombreador según la posición en el cuerpo. */
type Patron = 0 | 1 | 2 | 3 | 4;
const PIEL = `
  float pielEscamas(vec3 p) { vec3 q = p * 18.0; vec2 c = vec2(q.x + q.z, q.y + 0.5 * q.x); vec2 f = fract(c) - 0.5; return smoothstep(0.32, 0.5, length(f)); }
  float pielPelo(vec3 p) { return 0.5 + 0.5 * sin(p.y * 55.0 + sin(p.x * 17.0 + p.z * 13.0) * 2.0); }
  float pielPlumas(vec3 p) { float f = fract(p.y * 11.0 + abs(sin(p.x * 9.0 + p.z * 7.0)) * 0.6); return smoothstep(0.55, 1.0, f); }
  float pielCorteza(vec3 p) { return 0.5 + 0.5 * sin(p.x * 90.0 + sin(p.y * 12.0) * 3.0); }`;
/** Material de dibujo animado con luz de borde y (opcional) colores por vértice y patrón de piel. */
const toonMat = (color: string, porVertice = false, patron: Patron = 0, borde = 0.35) => guardar(`t${color}${porVertice}${patron}${borde}`, () => {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: GRADIENTE, vertexColors: porVertice });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPos = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vPos;${PIEL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${patron === 1 ? 'diffuseColor.rgb *= 1.0 - 0.07 * pielEscamas(vPos);' : patron === 2 ? 'diffuseColor.rgb *= 0.975 + 0.035 * pielPelo(vPos);' : patron === 3 ? 'diffuseColor.rgb *= 1.0 - 0.06 * pielPlumas(vPos);' : patron === 4 ? 'diffuseColor.rgb *= 0.97 + 0.04 * pielCorteza(vPos);' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\nfloat bordeLuz = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);\ntotalEmissiveRadiance += diffuseColor.rgb * bordeLuz * ${borde.toFixed(2)} + vec3(0.03) * bordeLuz;`);
  };
  m.customProgramCacheKey = () => `bestia${patron}${borde}`;
  return m;
});
const brillo = (color: string) => guardar(`b${color}`, () => new THREE.MeshBasicMaterial({ color }));
const vidrio = (color: string) => guardar(`v${color}`, () => new THREE.MeshToonMaterial({ color, gradientMap: GRADIENTE, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
/** Contorno: la misma malla inflada por sus normales, de un color muy oscuro del cuerpo. */
const contorno = (color: string, grosor: number) => guardar(`c${color}${grosor}`, () => {
  const m = new THREE.MeshBasicMaterial({ color: tono(color, -0.65), side: THREE.BackSide });
  m.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${grosor.toFixed(4)};`); };
  m.customProgramCacheKey = () => `contorno${grosor}`;
  return m;
});
const bordeSimple = (color: string) => guardar(`s${color}`, () => new THREE.MeshBasicMaterial({ color: tono(color, -0.62), side: THREE.BackSide }));
const ESFERA = new THREE.SphereGeometry(1, 28, 20), CONO = new THREE.ConeGeometry(1, 1, 16), CILINDRO = new THREE.CylinderGeometry(1, 1, 1, 14);
const MEDIA = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), TORO = new THREE.TorusGeometry(1, 0.1, 8, 28);
const CAPSULA = new THREE.CapsuleGeometry(1, 1, 6, 12), ARCO = new THREE.TorusGeometry(1, 0.13, 6, 14, 1.3);

// ── Formas que se funden: elipsoides y tubos (cono redondeado), con su color y su parte (cuerpo, cabeza o cola) ──
type Parte = 'cuerpo' | 'cabeza' | 'cola';
interface Prim { tipo: 0 | 1; c: V; r: V; a: V; b: V; r1: number; r2: number; inv: THREE.Matrix3 | null; color: THREE.Color; parte: Parte; pinta: boolean; k: number; centro: V; radio: number }
const sdf = (p: Prim, x: number, y: number, z: number) => {
  if (p.tipo === 0) {
    let dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2];
    if (p.inv) { const e = p.inv.elements; const tx = e[0] * dx + e[3] * dy + e[6] * dz, ty = e[1] * dx + e[4] * dy + e[7] * dz, tz = e[2] * dx + e[5] * dy + e[8] * dz; dx = tx; dy = ty; dz = tz; }
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
/** Malla orgánica de un grupo de formas (y sus pinturas): campo de distancia suave + marching cubes. */
function mallar(formas: Prim[], pinturas: Prim[], res: number): THREE.BufferGeometry | null {
  if (!formas.length) return null;
  const min: V = [Infinity, Infinity, Infinity], max: V = [-Infinity, -Infinity, -Infinity];
  for (const f of formas) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], f.centro[i] - f.radio); max[i] = Math.max(max[i], f.centro[i] + f.radio); }
  const lado = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) + 0.16, medio: V = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  let mc = cubos.get(res);
  if (!mc) { mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, true, 60000); cubos.set(res, mc); }
  const n = mc.size, half = mc.halfsize, esc = lado / 2, campo = mc.field, paleta = mc.palette, col = new THREE.Color();
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = medio[0] + ((x - half) / half) * esc, py = medio[1] + ((y - half) / half) * esc, pz = medio[2] + ((z - half) / half) * esc;
    let d = Infinity, w = 0, cr = 0, cg = 0, cb = 0;
    for (const f of formas) {
      const ex = px - f.centro[0], ey = py - f.centro[1], ez = pz - f.centro[2], lejos = Math.sqrt(ex * ex + ey * ey + ez * ez) - f.radio;
      const di = lejos > 0.12 ? lejos : sdf(f, px, py, pz);
      d = d === Infinity ? di : smin(d, di, f.k);
      const wi = Math.exp(-28 * Math.max(-0.12, di));
      w += wi; cr += f.color.r * wi; cg += f.color.g * wi; cb += f.color.b * wi;
    }
    col.setRGB(cr / w, cg / w, cb / w);
    // Pinturas: cambian el color donde la piel queda adentro de ellas, con un borde suave
    for (const pt of pinturas) { const dp = sdf(pt, px, py, pz); if (dp < 0.025) col.lerp(pt.color, Math.min(1, (0.025 - dp) / 0.05)); }
    const i = x + y * n + z * n * n;
    campo[i] = 80 - d * 700;
    paleta[i * 3] = col.r; paleta[i * 3 + 1] = col.g; paleta[i * 3 + 2] = col.b;
  }
  mc.update();
  const cuenta = mc.count, pos = mc.positionArray.slice(0, cuenta * 3), nor = mc.normalArray.slice(0, cuenta * 3), colores = mc.colorArray.slice(0, cuenta * 3);
  for (let i = 0; i < cuenta; i++) { pos[i * 3] = medio[0] + pos[i * 3] * esc; pos[i * 3 + 1] = medio[1] + pos[i * 3 + 1] * esc; pos[i * 3 + 2] = medio[2] + pos[i * 3 + 2] * esc; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  g.computeBoundingSphere();
  return g;
}

/** Un resorte amortiguado (para la cabeza, la cola y las partes que se balancean). */
interface Resorte { x: number; v: number; meta: number; k: number; amort: number }
const resorte = (k = 60, amort = 9): Resorte => ({ x: 0, v: 0, meta: 0, k, amort });
const avanzarResorte = (r: Resorte, dt: number) => { r.v += ((r.meta - r.x) * r.k - r.v * r.amort) * dt; r.x += r.v * dt; };

export interface Bestia {
  grupo: THREE.Group; cuerpo: THREE.Group; alto: number; flota: boolean; electrica: boolean;
  llamas: THREE.Object3D[]; alas: { o: THREE.Object3D; base: number; eje: 'z' | 'y' }[];
  /** Partes articuladas y su física. */
  cabeza: THREE.Object3D | null; cola: THREE.Object3D | null; ojos: THREE.Object3D[];
  fisica: { cabezaY: Resorte; cabezaX: Resorte; colaY: Resorte; colaX: Resorte; estira: Resorte; parpadeo: number; ultimo: number };
  /** Lo que la pantalla le pide: mirar hacia un lado (radianes), inclinarse, estirarse o aplastarse. */
  pose: { mira: number; inclina: number; estira: number };
}
/** Un empujón a los resortes (al recibir un golpe, al saltar o al lanzarse). */
export function sacudir(b: Bestia, fuerza: number) {
  b.fisica.colaY.v += fuerza * 6; b.fisica.colaX.v -= fuerza * 4; b.fisica.cabezaX.v += fuerza * 3; b.fisica.estira.v -= fuerza * 2.5;
}

interface Plano { formas: Prim[]; pinturas: Prim[]; detalles: (destinos: Record<Parte, THREE.Object3D>) => void; cab: V; cola: V; flota: boolean; llamas: THREE.Object3D[]; alas: Bestia['alas']; ojos: THREE.Object3D[]; bordeCuerpo: string }
const geometrias = new Map<number, Record<Parte, THREE.BufferGeometry | null>>();

export function crearBestia(n: number): Bestia {
  const sp = especie(n), F: Forma = sp.forma;
  const plano = planear(n);
  // Las mallas orgánicas se calculan una sola vez por especie
  let g = geometrias.get(n);
  if (!g) {
    const de = (p: Parte, res: number) => mallar(plano.formas.filter((f) => f.parte === p), plano.pinturas.filter((f) => f.parte === p), res);
    g = { cuerpo: de('cuerpo', 60), cabeza: de('cabeza', 46), cola: de('cola', 36) };
    geometrias.set(n, g);
  }
  const grupo = new THREE.Group(), cuerpo = new THREE.Group();
  grupo.add(cuerpo);
  const patron: Patron = F.rasgos.includes('hocico-largo') || F.cuerpo === 'serpiente' || n === 19 ? 1 : F.cuerpo === 'ave' ? 3 : sp.tipos.includes('planta') ? 4 : ['cuadrupedo', 'bipedo'].includes(F.cuerpo) ? 2 : 0;
  const material = toonMat('#ffffff', true, patron, sp.tipos.includes('fantasma') ? 0.45 : 0.2);
  const malla = (geo: THREE.BufferGeometry | null, padre: THREE.Object3D) => {
    if (!geo) return;
    padre.add(new THREE.Mesh(geo, material), new THREE.Mesh(geo, contorno(plano.bordeCuerpo, 0.012)));
  };
  // Cabeza y cola cuelgan de un pivote (el cuello y la base de la cola) para poder girarlas
  const pivote = (p: V) => { const piv = new THREE.Group(), dentro = new THREE.Group(); piv.position.set(...p); dentro.position.set(-p[0], -p[1], -p[2]); piv.add(dentro); cuerpo.add(piv); return { piv, dentro }; };
  const cab = pivote(plano.cab), col = pivote(plano.cola);
  malla(g.cuerpo, cuerpo); malla(g.cabeza, cab.dentro); malla(g.cola, col.dentro);
  plano.detalles({ cuerpo, cabeza: cab.dentro, cola: col.dentro });

  // ── Medir y llevar a su altura, con los pies en el suelo (los que flotan, un poco arriba) ──
  cuerpo.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(cuerpo), medida = caja.getSize(new THREE.Vector3());
  const escala = F.alto / Math.max(0.01, medida.y);
  cuerpo.scale.setScalar(escala);
  cuerpo.position.y = -caja.min.y * escala;
  if (plano.flota) cuerpo.position.y += F.alto * 0.18;
  grupo.userData.base = cuerpo.position.y;
  grupo.userData.escala = escala;
  return {
    grupo, cuerpo, alto: F.alto * (plano.flota ? 1.18 : 1), flota: plano.flota, electrica: sp.tipos.includes('electrico'), llamas: plano.llamas, alas: plano.alas,
    cabeza: g.cabeza ? cab.piv : null, cola: g.cola ? col.piv : null, ojos: plano.ojos,
    fisica: { cabezaY: resorte(40, 8), cabezaX: resorte(40, 8), colaY: resorte(22, 3.5), colaX: resorte(26, 4), estira: resorte(90, 10), parpadeo: 2 + (n % 5) * 0.4, ultimo: -1 },
    pose: { mira: 0, inclina: 0, estira: 0 },
  };
}

/** Respira, parpadea, mueve la cabeza y la cola con sus resortes, aletea, flota y hace bailar sus llamas. */
export function animarBestia(b: Bestia, t: number, fase = 0) {
  const f = b.fisica, dt = f.ultimo < 0 ? 0 : Math.min(0.05, Math.max(0, t - f.ultimo));
  f.ultimo = t;
  const base = b.grupo.userData.base as number, esc = b.grupo.userData.escala as number;
  // Cuerpo: respiración, estirón o aplastón (con resorte) e inclinación
  f.estira.meta = b.pose.estira; avanzarResorte(f.estira, dt);
  const respira = Math.sin(t * 2.6 + fase) * 0.018, e = f.estira.x;
  b.cuerpo.scale.set(esc * (1 - e * 0.5), esc * (1 + respira + e), esc * (1 - e * 0.5));
  b.cuerpo.position.y = base + (b.flota ? Math.sin(t * 1.8 + fase) * b.alto * 0.035 : 0);
  b.cuerpo.rotation.x += (b.pose.inclina - b.cuerpo.rotation.x) * Math.min(1, dt * 10);
  b.cuerpo.rotation.z = Math.sin(t * 1.3 + fase) * 0.015;
  // Cabeza: mira hacia donde le piden, con un leve vaivén
  if (b.cabeza) {
    f.cabezaY.meta = b.pose.mira + Math.sin(t * 0.7 + fase) * 0.12; f.cabezaX.meta = Math.sin(t * 1.1 + fase * 2) * 0.05;
    avanzarResorte(f.cabezaY, dt); avanzarResorte(f.cabezaX, dt);
    b.cabeza.rotation.set(f.cabezaX.x, f.cabezaY.x, 0);
  }
  // Cola: se balancea sola y se sacude con los golpes
  if (b.cola) {
    f.colaY.meta = Math.sin(t * 1.9 + fase) * 0.22; f.colaX.meta = Math.sin(t * 1.3 + fase) * 0.06;
    avanzarResorte(f.colaY, dt); avanzarResorte(f.colaX, dt);
    b.cola.rotation.set(f.colaX.x, f.colaY.x, 0);
  }
  // Parpadeo cada unos segundos
  f.parpadeo -= dt;
  const cierra = f.parpadeo < 0.12 && f.parpadeo > 0 ? 0.1 : 1;
  if (f.parpadeo <= 0) f.parpadeo = 2.5 + (Math.sin(t * 13.7 + fase) + 1) * 1.6;
  for (const o of b.ojos) o.scale.y = cierra;
  for (const [i, l] of b.llamas.entries()) l.scale.set(1 + Math.sin(t * 17 + i) * 0.1, 1 + Math.sin(t * 13 + i * 2) * 0.2, 1);
  for (const [i, a] of b.alas.entries()) { const v = Math.sin(t * (b.flota ? 9 : 3.5) + fase + (i % 2) * 0.2) * (b.flota ? 0.42 : 0.14) + f.colaY.v * 0.01; if (a.eje === 'z') a.o.rotation.z = (a.o.position.x > 0 ? 1 : -1) * v; else a.o.rotation.y = (a.o.position.x > 0 ? -1 : 1) * v; }
}

/** El plano de una criatura: sus formas fundidas, sus pinturas y una función que pega los detalles. */
function planear(n: number): Plano {
  const sp = especie(n), F = sp.forma, rasgo = (r: string) => F.rasgos.includes(r);
  const formas: Prim[] = [], pinturas: Prim[] = [], llamas: THREE.Object3D[] = [], alas: Bestia['alas'] = [], ojos: THREE.Object3D[] = [];
  const cabezon = sp.legendaria ? 0.95 : sp.etapa === 1 ? 1.0 : sp.etapa === 2 ? 0.88 : 0.78;
  const oscuro = tono(F.color, -0.3), claro = tono(F.color, 0.28), iris = sp.tipos[0] === 'lucha' ? '#5a3a22' : tono(TIPOS[sp.tipos[0]].color, -0.42);
  let parte: Parte = 'cuerpo';
  const mas = (a: V, dx: number, dy: number, dz: number): V => [a[0] + dx, a[1] + dy, a[2] + dz];
  /** Una forma que se funde: elipsoide (con giro opcional). `k` = qué tan suave se une. */
  const elipse = (color: string, c: V, r: V | number, rot?: V, k = 0.07, pinta = false) => {
    const rr: V = typeof r === 'number' ? [r, r, r] : r;
    const inv = rot && (rot[0] || rot[1] || rot[2]) ? new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot))).transpose() : null;
    (pinta ? pinturas : formas).push({ tipo: 0, c, r: rr, a: c, b: c, r1: 0, r2: 0, inv, color: new THREE.Color(color), parte, pinta, k, centro: c, radio: Math.max(...rr) });
  };
  /** Tubo de `a` a `b` que se afina de r1 a r2 (sirve para patas, colas, cuellos, orejas). */
  const tubo = (color: string, a: V, b: V, r1: number, r2: number, k = 0.06) => {
    const c: V = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], largo = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    formas.push({ tipo: 1, c, r: [0, 0, 0], a, b, r1, r2, inv: null, color: new THREE.Color(color), parte, pinta: false, k, centro: c, radio: largo / 2 + Math.max(r1, r2) });
  };
  const pintar = (color: string, c: V, r: V | number, rot?: V) => elipse(color, c, r, rot, 0.05, true);
  const pata = (x: number, z: number, alto: number, grosor: number) => {
    const cadera: V = [x, alto * 0.92, z], rodilla: V = [x, alto * 0.45, z + grosor * 0.4], pie: V = [x, grosor * 0.6, z + grosor * 0.9];
    elipse(F.color, cadera, grosor * 1.7);
    tubo(F.color, cadera, rodilla, grosor * 1.2, grosor * 0.95); tubo(F.color, rodilla, pie, grosor * 0.95, grosor * 0.9);
    elipse(F.color, mas(pie, 0, -grosor * 0.1, grosor * 0.35), [grosor * 1.2, grosor * 0.65, grosor * 1.45], undefined, 0.04);
    for (const k of [-1, 0, 1]) elipse(F.color, [x + k * grosor * 0.62, grosor * 0.42, z + grosor * 2.15], grosor * 0.38, undefined, 0.025);
    pintar(oscuro, [x, grosor * 0.35, z + grosor * 1.6], [grosor * 1.5, grosor * 0.5, grosor * 1.2]);
    return [x, grosor * 0.45, z + grosor * 2.4] as V;
  };
  const brazo = (l: number, hombro: V, largo: number, grosor: number): V => {
    const codo = mas(hombro, l * largo * 0.38, -largo * 0.55, largo * 0.3), mano = mas(codo, l * largo * 0.06, -largo * 0.32, largo * 0.12);
    elipse(F.color, hombro, grosor * 1.4);
    tubo(F.color, hombro, codo, grosor * 1.1, grosor * 0.9); tubo(F.color, codo, mano, grosor * 0.9, grosor * 0.85);
    elipse(F.color, mano, grosor * 1.25, undefined, 0.04);
    for (const k of [-1, 0, 1]) elipse(F.color, mas(mano, k * grosor * 0.55, -grosor * 0.7, grosor * 0.7), grosor * 0.4, undefined, 0.025);
    return mano;
  };

  // ── Cuerpo según su forma ──
  let cab: V = [0, 0.9, 0.05], rc = 0.3 * cabezon, lomo: V = [0, 0.7, -0.2], cola: V = [0, 0.4, -0.3], torso: V = [0, 0.5, 0], cuello: V = [0, 0.7, 0];
  const manos: V[] = [], pies: V[] = [], camino: V[] = [];
  let forma: V = [1, 1, 1], cabezaAparte = true;
  switch (F.cuerpo) {
    case 'cuadrupedo': {
      const s0 = rasgo('patas-largas') ? 0.2 : 0, fino = rasgo('patas-largas') ? 0.86 : 1;
      elipse(F.color, [0, 0.45 + s0, -0.04], [0.36 * fino, 0.3 * fino, 0.5]);
      elipse(F.color, [0, 0.5 + s0, 0.22], [0.29 * fino, 0.29 * fino, 0.27]);
      elipse(F.color, [0, 0.46 + s0, -0.32], [0.3 * fino, 0.28 * fino, 0.28]);
      pintar(F.panza, [0, 0.3 + s0, 0.08], [0.27 * fino, 0.17 * fino, 0.44]);
      pintar(F.panza, [0, 0.46 + s0, 0.4], [0.2, 0.22, 0.12]);
      for (const [x, z] of [[-0.19, 0.24], [0.19, 0.24], [-0.2, -0.32], [0.2, -0.32]]) pies.push(pata(x * fino, z, 0.4 + s0, 0.068));
      cuello = [0, 0.68 + s0, 0.36];
      tubo(F.color, [0, 0.5 + s0, 0.24], cuello, 0.17, 0.15);
      cab = [0, 0.78 + s0 + rc * 0.3, 0.47]; lomo = [0, 0.77 + s0, -0.06]; cola = [0, 0.52 + s0, -0.58]; torso = [0, 0.45 + s0, -0.04];
      forma = [1, 0.96, 1.08];
      break;
    }
    case 'bipedo': {
      elipse(F.color, [0, 0.48, 0], [0.33, 0.35, 0.29]);
      elipse(F.color, [0, 0.69, 0.01], [0.29, 0.26, 0.25]);
      pintar(F.panza, [0, 0.52, 0.2], [0.24, 0.32, 0.14]);
      for (const x of [-0.17, 0.17]) pies.push(pata(x, 0.0, 0.34, 0.085));
      const fuerte = rasgo('brazos-fuertes');
      for (const l of [-1, 1]) manos.push(brazo(l, [l * (fuerte ? 0.32 : 0.28), 0.76, 0.03], fuerte ? 0.5 : 0.38, fuerte ? 0.09 : 0.058));
      cuello = [0, 0.84, 0.02];
      tubo(F.color, [0, 0.72, 0.01], cuello, 0.17, 0.15);
      cab = [0, 0.86 + rc * 0.82, 0.04]; lomo = [0, 0.66, -0.25]; cola = [0, 0.32, -0.26]; torso = [0, 0.55, 0];
      forma = [1.04, 0.96, 1];
      break;
    }
    case 'ave': {
      elipse(F.color, [0, 0.44, -0.02], [0.33, 0.33, 0.4], [-0.35, 0, 0]);
      pintar(F.panza, [0, 0.38, 0.2], [0.25, 0.27, 0.16]);
      cuello = [0, 0.66, 0.08];
      tubo(F.color, [0, 0.55, 0.04], cuello, 0.17, 0.15);
      cab = [0, 0.76 + rc * 0.42, 0.12]; lomo = [0, 0.6, -0.2]; cola = [0, 0.42, -0.4]; torso = [0, 0.44, -0.02];
      break;
    }
    case 'oruga': {
      cabezaAparte = false;
      [[-0.56, 0.13], [-0.38, 0.16], [-0.2, 0.18], [-0.02, 0.2]].forEach(([z, r], i) => { elipse(i % 2 ? F.color : claro, [0, r + 0.02, z], [r, r * 0.95, r * 1.05], undefined, 0.035); for (const l of [-1, 1]) elipse(F.panza, [l * r * 0.62, 0.05, z + 0.02], 0.045, undefined, 0.02); });
      elipse(F.color, [0, 0.38, 0.2], 0.25, undefined, 0.05);
      cab = [0, 0.38, 0.2]; rc = 0.25; lomo = [0, 0.42, -0.1]; cola = [0, 0.16, -0.68]; torso = [0, 0.22, -0.25];
      break;
    }
    case 'capullo': {
      cabezaAparte = false;
      elipse(F.color, [0, 0.52, 0], [0.3, 0.52, 0.28]);
      tubo(F.color, [0, 0.98, -0.01], [0, 1.18, -0.03], 0.11, 0.015);
      cab = [0, 0.76, 0.02]; rc = 0.25; lomo = [0, 0.7, -0.25]; cola = [0, 0.1, -0.2]; torso = [0, 0.52, 0];
      break;
    }
    case 'mariposa': {
      tubo(F.color, [0, 0.3, 0], [0, 0.76, 0.01], 0.075, 0.1);
      pintar(F.panza, [0, 0.48, 0.08], [0.08, 0.2, 0.05]);
      cuello = [0, 0.78, 0.02];
      cab = [0, 0.88, 0.04]; rc = 0.21 * cabezon; lomo = [0, 0.6, -0.08]; cola = [0, 0.26, 0]; torso = [0, 0.52, 0];
      break;
    }
    case 'marino': {
      elipse(F.color, [0, 0.36, -0.08], [0.39, 0.35, 0.56]);
      tubo(F.color, [0, 0.3, -0.4], [0, 0.17, -0.74], 0.24, 0.12);
      pintar(F.panza, [0, 0.24, 0.12], [0.32, 0.22, 0.45]);
      cuello = [0, 0.6, 0.34];
      tubo(F.color, [0, 0.46, 0.2], cuello, 0.25, 0.23);
      cab = [0, 0.66 + rc * 0.25, 0.44]; lomo = [0, 0.7, -0.12]; cola = [0, 0.16, -0.82]; torso = [0, 0.36, -0.08];
      forma = [1.05, 0.95, 1.05];
      break;
    }
    case 'flotante': {
      cabezaAparte = false;
      elipse(F.color, [0, 0.74, 0], [0.37, 0.4, 0.35]);
      tubo(F.color, [0, 0.55, -0.04], [0.08, 0.12, -0.2], 0.26, 0.015);
      pintar(F.panza, [0, 0.62, 0.18], [0.27, 0.25, 0.2]);
      for (const l of [-1, 1]) { tubo(F.color, [l * 0.3, 0.72, 0.05], [l * 0.46, 0.56, 0.14], 0.085, 0.07); manos.push([l * 0.47, 0.54, 0.15]); }
      cab = [0, 0.8, 0.04]; rc = 0.35; lomo = [0, 1.08, -0.05]; cola = [0, 0.2, -0.12]; torso = [0, 0.74, 0];
      break;
    }
    case 'serpiente': {
      for (let i = 0; i <= 28; i++) { const t = i / 28; camino.push([Math.sin(t * Math.PI * 1.7 + 0.4) * 0.32, 0.12 + t * 1.15, -0.42 + Math.sin(t * Math.PI * 1.2) * 0.3 + t * 0.25]); }
      const radio = (i: number) => { const t = i / 28; return 0.075 + Math.sin(t * Math.PI * 0.9) * 0.1 + t * 0.04; };
      for (let i = 0; i < 28; i += 2) tubo(F.color, camino[i], camino[i + 2], radio(i), radio(i + 2), 0.05);
      for (let i = 18; i < 28; i += 2) pintar(F.panza, mas(camino[i], 0, -radio(i) * 0.1, radio(i) * 0.6), [radio(i) * 0.75, radio(i) * 0.9, radio(i) * 0.5]);
      cuello = camino[26];
      cab = [camino[28][0], camino[28][1] + 0.1, camino[28][2] + 0.2]; rc = 0.25; lomo = camino[21]; cola = camino[0]; torso = camino[16];
      for (const l of [-1, 1]) { const h = camino[20], m: V = [h[0] + l * 0.27, h[1] - 0.17, h[2] + 0.1]; tubo(F.color, mas(h, l * 0.08, 0, 0.02), m, 0.05, 0.035); manos.push(m); }
      forma = [0.95, 0.88, 1.22];
      break;
    }
    case 'rana': {
      elipse(F.color, [0, 0.32, -0.05], [0.41, 0.29, 0.39]);
      pintar(F.panza, [0, 0.22, 0.16], [0.32, 0.22, 0.3]);
      for (const l of [-1, 1]) {
        elipse(F.color, [l * 0.34, 0.18, -0.16], [0.15, 0.14, 0.27]);
        elipse(F.color, [l * 0.37, 0.05, 0.07], [0.12, 0.05, 0.16], undefined, 0.04);
        tubo(F.color, [l * 0.22, 0.22, 0.2], [l * 0.24, 0.05, 0.28], 0.06, 0.05);
        for (const k of [-1, 0, 1]) { elipse(claro, [l * 0.37 + k * 0.06, 0.03, 0.22], 0.035, undefined, 0.02); elipse(claro, [l * 0.24 + k * 0.045, 0.03, 0.34], 0.028, undefined, 0.02); }
      }
      cuello = [0, 0.42, 0.12];
      cab = [0, 0.52, 0.2]; rc = 0.3 * cabezon; lomo = [0, 0.58, -0.12]; cola = [0, 0.2, -0.44]; torso = [0, 0.32, -0.05];
      forma = [1.28, 0.82, 1];
      break;
    }
  }

  // ── Cabeza (en su propia parte, para que gire) ──
  const [hx, hy, hz] = cab;
  const enCabeza = (yaw: number, pitch: number, d = 1): V => [hx + Math.sin(yaw) * Math.cos(pitch) * rc * d * forma[0], hy + Math.sin(pitch) * rc * d * forma[1], hz + Math.cos(yaw) * Math.cos(pitch) * rc * d * forma[2]];
  const hocicoLargo = rasgo('hocico-largo') || rasgo('hocico-fino'), fino = rasgo('hocico-fino');
  const conHocico = hocicoLargo || rasgo('hocico') || ['cuadrupedo', 'marino'].includes(F.cuerpo);
  if (cabezaAparte) {
    parte = 'cabeza';
    elipse(rasgo('cabeza-clara') ? F.panza : F.color, cab, [rc * forma[0], rc * forma[1], rc * forma[2]]);
    if (F.cuerpo !== 'mariposa') tubo(F.color, mas(cuello, 0, -0.04, -0.02), mas(cab, 0, -rc * 0.5, -rc * 0.2), 0.14, 0.13);
  }
  let narizP: V | null = null, largoHocico = 0;
  if (conHocico) {
    largoHocico = hocicoLargo ? 0.62 : 0.42;
    const p = enCabeza(0, -0.32, 0.72 + largoHocico * 0.4);
    elipse(hocicoLargo && !fino ? F.color : F.panza, p, [rc * (fino ? 0.32 : 0.46), rc * (fino ? 0.26 : 0.34), rc * largoHocico], undefined, 0.06);
    if (hocicoLargo && !fino) pintar(F.panza, mas(p, 0, -rc * 0.14, rc * 0.04), [rc * 0.4, rc * 0.18, rc * largoHocico * 0.9]);
    narizP = p;
  }
  // Pinturas de la cara
  if (rasgo('cara-mono')) pintar(F.panza, enCabeza(0, -0.05, 0.62), [rc * 0.8 * forma[0], rc * 0.72, rc * 0.5]);
  if (rasgo('mejillas')) for (const l of [-1, 1]) pintar(tono('#ff8a7a', 0.15), enCabeza(l * 0.78, -0.22, 0.95), [rc * 0.16, rc * 0.11, rc * 0.12]);
  if (rasgo('mascara') || rasgo('antifaz')) for (const l of [-1, 1]) pintar(F.acento, enCabeza(l * 0.42, 0.1, 0.92), [rc * 0.42, rc * 0.3, rc * 0.2], [0, l * 0.42, l * -0.2]);
  if (rasgo('ceja')) pintar(oscuro, enCabeza(0, 0.38, 0.9), [rc * 0.72, rc * 0.16, rc * 0.3]);
  // Orejas que nacen de la cabeza (se funden con ella)
  for (const r of F.rasgos) {
    if (r === 'orejas-puntas') for (const l of [-1, 1]) { const a = enCabeza(l * 0.5, 0.72, 0.8), b = enCabeza(l * 0.72, 1.25, 1.55); tubo(F.color, a, b, rc * 0.24, rc * 0.03, 0.05); pintar(F.acento, mas(b, 0, -rc * 0.05, 0), rc * 0.18); }
    if (r === 'orejas-zorro') for (const l of [-1, 1]) { const a = enCabeza(l * 0.48, 0.74, 0.8), b = enCabeza(l * 0.62, 1.2, 1.62); tubo(F.color, a, b, rc * 0.3, rc * 0.035, 0.05); pintar(oscuro, b, rc * 0.2); }
    if (r === 'orejas-redondas') for (const l of [-1, 1]) { elipse(F.color, enCabeza(l * 0.68, 0.66, 1.02), [rc * 0.28, rc * 0.28, rc * 0.12], undefined, 0.05); pintar(tono(F.panza, -0.08), enCabeza(l * 0.68, 0.66, 1.12), [rc * 0.16, rc * 0.16, rc * 0.06]); }
    if (r === 'orejas-largas') for (const l of [-1, 1]) tubo(F.color, enCabeza(l * 0.8, 0.4, 0.85), enCabeza(l * 1.25, 0.42, 1.65), rc * 0.15, rc * 0.1, 0.05);
    if (r === 'orejas-lado') for (const l of [-1, 1]) { elipse(F.color, enCabeza(l * 1.45, 0.12, 1.02), [rc * 0.1, rc * 0.27, rc * 0.25], [0, l * 0.2, 0], 0.04); pintar(F.panza, enCabeza(l * 1.42, 0.12, 1.1), [rc * 0.06, rc * 0.17, rc * 0.15]); }
    if (r === 'orejas-aleta') for (const l of [-1, 1]) tubo(tono(F.color, 0.3), enCabeza(l * 1.1, 0.3, 0.85), enCabeza(l * 1.55, 0.55, 1.35), rc * 0.2, rc * 0.08, 0.05);
    if (r === 'bolsa-garganta') elipse(F.acento, enCabeza(0, -0.78, 0.82), [rc * 0.55, rc * 0.42, rc * 0.42], undefined, 0.05);
  }
  parte = 'cuerpo';

  // ── Formas del cuerpo que también se funden: colas, aletas, membranas, manchas ──
  const colaInicio = cola;
  const colaTubo = (n2: number, r: number, sube: number, color = F.color): V => {
    parte = 'cola';
    let p = cola, rr = r;
    for (let i = 0; i < n2; i++) { const q: V = [p[0], p[1] + sube * (i + 1) * 0.45, p[2] - r * 1.4]; tubo(color, p, q, rr, rr * 0.8, 0.05); p = q; rr *= 0.8; }
    parte = 'cuerpo';
    return p;
  };
  let puntaCola: V | null = null;
  for (const r of F.rasgos) switch (r) {
    case 'cola-larga': puntaCola = colaTubo(4, 0.09, 0.06); break;
    case 'cola-llama': puntaCola = colaTubo(4, 0.1, 0.08); break;
    case 'cola-corta': parte = 'cola'; elipse(F.color, cola, 0.09); parte = 'cuerpo'; break;
    case 'cola-esponjosa': { parte = 'cola'; const c0 = mas(cola, 0, 0.3, -0.22); tubo(F.color, mas(cola, 0, 0.02, 0.06), c0, 0.1, 0.19); elipse(F.color, c0, [0.2, 0.36, 0.22], [-0.55, 0, 0]); elipse(F.color, mas(c0, 0, 0.26, 0.06), [0.17, 0.2, 0.17]); pintar(F.panza, mas(c0, 0, 0.38, 0.14), 0.15); parte = 'cuerpo'; break; }
    case 'cola-aleta': { const p = colaTubo(2, 0.09, 0.12); parte = 'cola'; elipse(F.acento, mas(p, 0, 0.1, -0.08), [0.035, 0.22, 0.17], [0.4, 0, 0], 0.03); parte = 'cuerpo'; break; }
    case 'cola-anillos': { parte = 'cola'; let p = cola; for (let i = 0; i < 6; i++) { const q = mas(p, 0, 0.08, -0.08); tubo(F.color, p, q, 0.12 - i * 0.008, 0.11 - i * 0.008, 0.03); if (i % 2) pintar(F.acento, q, 0.13 - i * 0.008); p = q; } parte = 'cuerpo'; break; }
    case 'cola-plumas': parte = 'cola'; for (const l of [-1, -0.5, 0, 0.5, 1]) elipse(l === 0 ? F.acento : tono(F.color, -0.15), mas(cola, l * 0.09, 0.02, -0.17), [0.065, 0.025, 0.28], [0.2, l * 0.35, 0], 0.03); parte = 'cuerpo'; break;
    case 'membrana': for (const l of [-1, 1]) elipse(tono(F.acento, 0.1), mas(torso, l * 0.32, -0.04, -0.03), [0.05, 0.27, 0.19], [0, 0, l * 0.15], 0.05); break;
    case 'aletas': for (const l of [-1, 1]) { elipse(F.color, mas(torso, l * 0.37, -0.22, 0.26), [0.17, 0.04, 0.12], [0, l * 0.4, l * 0.3], 0.05); elipse(F.color, mas(cola, l * 0.13, 0, -0.06), [0.14, 0.03, 0.09], [0, l * 0.5, 0], 0.04); } break;
    case 'manchas': for (let i = 0; i < 6; i++) pintar(F.panza, mas(lomo, Math.sin(i * 2.4) * 0.16, 0.02 - (i % 2) * 0.05, Math.cos(i * 1.7) * 0.2), [0.06, 0.06, 0.06]); break;
  }

  // ── Detalles que no se funden (se pegan en la parte que corresponde) ──
  const flota = ['flotante', 'serpiente', 'mariposa'].includes(F.cuerpo) || rasgo('flota');
  const detalles = (destinos: Record<Parte, THREE.Object3D>) => {
    let padre = destinos.cuerpo;
    const pieza = (geo: THREE.BufferGeometry, mat: THREE.Material | string, p: V, esc: V, rot: V = [0, 0, 0], en: THREE.Object3D = padre, borde = true) => {
      const m = new THREE.Mesh(geo, typeof mat === 'string' ? toonMat(mat) : mat);
      m.position.set(...p); m.scale.set(...esc); m.rotation.set(...rot);
      if (borde) { const c = new THREE.Mesh(geo, bordeSimple(typeof mat === 'string' ? mat : `#${((mat as THREE.MeshBasicMaterial).color ?? new THREE.Color('#888888')).getHexString()}`)); c.scale.setScalar(1.04); m.add(c); }
      en.add(m);
      return m;
    };
    const esfera = (color: string | THREE.Material, p: V, r: V | number, rot?: V, b = true, en: THREE.Object3D = padre) => pieza(ESFERA, color, p, typeof r === 'number' ? [r, r, r] : r, rot, en, b);
    const cono = (color: string | THREE.Material, p: V, r: number, h: number, rot: V = [0, 0, 0], b = true) => pieza(CONO, color, p, [r, h, r], rot, padre, b);
    const palo = (color: string, p: V, r: number, largo: number, rot: V, b = false) => pieza(CILINDRO, color, p, [r, largo, r], rot, padre, b);
    const flama = (p: V, tam: number) => {
      const g = new THREE.Group(); g.position.set(...p); padre.add(g);
      pieza(ESFERA, brillo('#ff6a1a'), [0, tam * 0.2, 0], [tam * 0.36, tam * 0.3, tam * 0.36], [0, 0, 0], g, false);
      for (const [x, z, h, inc] of [[0, 0, 1, 0], [-0.16, 0.05, 0.72, 0.45], [0.17, -0.04, 0.66, -0.5], [0.04, -0.16, 0.58, 0.2]]) pieza(CONO, brillo('#ff6a1a'), [x * tam, tam * (0.2 + h * 0.42), z * tam], [tam * 0.26, tam * h, tam * 0.26], [z * 2, 0, inc], g, false);
      pieza(CONO, brillo('#ffb020'), [0, tam * 0.4, tam * 0.05], [tam * 0.22, tam * 0.65, tam * 0.22], [0, 0, 0], g, false);
      pieza(CONO, brillo('#fff2a0'), [0, tam * 0.3, tam * 0.1], [tam * 0.12, tam * 0.4, tam * 0.12], [0, 0, 0], g, false);
      llamas.push(g);
    };

    // Cabeza: nariz, boca, ojos y rasgos de la cabeza
    padre = cabezaAparte ? destinos.cabeza : destinos.cuerpo;
    if (narizP) {
      const p = narizP, largo = largoHocico;
      if (fino) esfera('#2a1a22', mas(p, 0, rc * 0.06, rc * largo * 0.95), [rc * 0.08, rc * 0.06, rc * 0.06], undefined, false);
      else { for (const l of [-1, 1]) esfera('#2a1a22', mas(p, l * rc * 0.12, rc * 0.14, rc * largo * 0.92), rc * 0.045, undefined, false); if (!hocicoLargo && F.cuerpo !== 'marino') esfera('#2a1a22', mas(p, 0, rc * 0.18, rc * largo * 0.86), [rc * 0.11, rc * 0.08, rc * 0.07], undefined, false); }
      pieza(CAPSULA, '#3a2028', mas(p, 0, -rc * 0.2, rc * largo * 0.75), [rc * 0.02, rc * 0.22, rc * 0.02], [0, 0, Math.PI / 2], padre, false);
    }
    const grande = F.cuerpo === 'rana' ? 1.15 : sp.etapa === 1 ? 1.12 : 1;
    for (const l of [-1, 1]) {
      const yaw = l * (F.cuerpo === 'rana' ? 0.62 : conHocico ? 0.5 : 0.4), pitch = F.cuerpo === 'rana' ? 0.6 : conHocico ? 0.2 : 0.1;
      const p = enCabeza(yaw, pitch, F.cuerpo === 'rana' ? 1.02 : 0.9), r = rc * 0.25 * grande;
      const base = new THREE.Group(); base.position.set(...p); base.lookAt(p[0] + (p[0] - hx), p[1] + (p[1] - hy) * 0.25, p[2] + (p[2] - hz) * 1.4); padre.add(base);
      if (F.cuerpo === 'rana') esfera(F.color, [0, -r * 0.1, -r * 0.62], [r * 1.25, r * 1.25, r * 1.0], undefined, true, base);
      const ojo = new THREE.Group(); base.add(ojo); ojos.push(ojo);
      const alto = F.ojos === 'serenos' ? 0.85 : F.ojos === 'feroces' ? 0.95 : 1.12;
      esfera('#fbfaf2', [0, 0, 0], [r, r * alto, r * 0.5], undefined, true, ojo);
      esfera(rasgo('ojos-brillo') ? brillo(F.acento) : iris, [0, -r * 0.06, r * 0.3], [r * 0.74, r * 0.82 * alto, r * 0.3], undefined, false, ojo);
      esfera('#120c16', [0, -r * 0.06, r * 0.44], [r * 0.4, r * 0.5 * alto, r * 0.18], undefined, false, ojo);
      esfera(brillo('#ffffff'), [r * 0.22 * -l, r * 0.28 * alto, r * 0.58], [r * 0.2, r * 0.2, r * 0.08], undefined, false, ojo);
      esfera(brillo('#ffffff'), [-r * 0.2 * -l, -r * 0.3 * alto, r * 0.55], [r * 0.09, r * 0.09, r * 0.05], undefined, false, ojo);
      // Párpado de su mismo color: caído hacia adentro (fiero) o a media altura (sereno)
      if (F.ojos === 'feroces') esfera(F.color, [0, r * 0.78 * alto, r * 0.06], [r * 1.22, r * 0.5, r * 0.62], [0, 0, l * 0.42], false, base);
      if (F.ojos === 'serenos') esfera(F.color, [0, r * 0.62, r * 0.06], [r * 1.18, r * 0.5, r * 0.62], [0, 0, -l * 0.08], false, base);
    }
    if (!conHocico && F.cuerpo !== 'capullo') { const p = enCabeza(0, F.cuerpo === 'rana' ? 0.0 : -0.36, 0.98); pieza(ARCO, '#3a2028', mas(p, 0, rc * 0.2, 0), [rc * 0.2, rc * 0.2, rc * 0.2], [0, 0, -Math.PI / 2 - 0.65], padre, false); }
    if (F.ojos === 'feroces' && (sp.tipos.includes('fuego') || sp.tipos.includes('dragon'))) { const p = conHocico ? enCabeza(0, -0.48, 1.12) : enCabeza(0, -0.42, 0.96); for (const l of [-1, 1]) cono('#ffffff', mas(p, l * rc * 0.12, -rc * 0.04, 0), rc * 0.04, rc * 0.12, [Math.PI, 0, 0], false); }
    for (const r of F.rasgos) switch (r) {
      case 'cresta': for (let i = 0; i < 3; i++) cono(F.acento, enCabeza(Math.PI, 1.25 - i * 0.3, 0.95), rc * 0.13, rc * (0.7 - i * 0.14), [-0.7 - i * 0.3, 0, 0]); break;
      case 'cuernos': for (const l of [-1, 1]) cono(tono(F.panza, -0.05), enCabeza(l * 0.42, 0.7, 0.98), rc * 0.12, rc * 0.85, [-0.75, 0, l * -0.3]); break;
      case 'melena': for (let i = 0; i < 7; i++) { const a = -1.2 + (i / 6) * 2.4; cono(F.acento, enCabeza(a + Math.PI, 0.3, 0.85), rc * 0.15, rc * 0.7, [-1.4, a * 0.5, 0]); } break;
      case 'astas': case 'astas-flor': for (const l of [-1, 1]) {
        const base = enCabeza(l * 0.35, 0.82, 0.95), tronco = '#8a6038';
        palo(tronco, mas(base, l * 0.08, 0.18, -0.02), 0.032, 0.38, [0, 0, -l * 0.4], true);
        const punta = mas(base, l * 0.16, 0.36, -0.04);
        palo(tronco, mas(punta, l * 0.07, 0.06, 0), 0.022, 0.2, [0, 0, -l * 1.1], true);
        palo(tronco, mas(punta, -l * 0.02, 0.11, 0), 0.022, 0.22, [0, 0, l * 0.3], true);
        for (const [dx, dy] of [[l * 0.16, 0.1], [l * 0.02, 0.22]]) esfera('#6ab84a', mas(punta, dx, dy, 0), [0.06, 0.028, 0.04], [0, 0, l * 0.6], false);
        if (r === 'astas-flor') for (const [dx, dy] of [[l * 0.15, 0.13], [-l * 0.03, 0.24], [l * 0.05, 0.02]]) { for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; esfera(F.acento, mas(punta, dx + Math.cos(a) * 0.03, dy + Math.sin(a) * 0.03, 0), [0.03, 0.03, 0.015], undefined, false); } esfera(brillo('#fff2a0'), mas(punta, dx, dy, 0.01), 0.02, undefined, false); }
      } break;
      case 'brote': { const b0 = enCabeza(0, 0.92, 1.0); palo('#5a8a2a', mas(b0, 0, 0.05, 0), 0.018, 0.12, [0, 0, 0]); for (const l of [-1, 1]) esfera('#7ac74c', mas(b0, l * 0.06, 0.11, 0), [0.07, 0.022, 0.042], [0, 0, -l * 0.5]); break; }
      case 'orbe': { esfera(brillo(F.acento), enCabeza(0, 0.42, 1.0), rc * 0.14); esfera(brillo('#ffffff'), enCabeza(0.05, 0.47, 1.12), rc * 0.04, undefined, false); break; }
      case 'antenas': for (const l of [-1, 1]) { const base = enCabeza(l * 0.3, 0.88, 0.95); palo(oscuro, mas(base, l * 0.05, 0.12, 0.02), 0.013, 0.26, [0.2, 0, -l * 0.35]); esfera(F.acento, mas(base, l * 0.1, 0.25, 0.05), 0.042); } break;
      case 'pico': { const p = enCabeza(0, -0.12, 0.98); cono('#f0a030', p, rc * 0.2, rc * 0.52, [Math.PI / 2, 0, 0]); cono('#c87a20', mas(p, 0, -rc * 0.06, -rc * 0.02), rc * 0.15, rc * 0.36, [Math.PI / 2 + 0.25, 0, 0], false); break; }
      case 'pico-gancho': { const p = enCabeza(0, -0.05, 0.98); cono('#f2c03a', p, rc * 0.2, rc * 0.42, [Math.PI / 2 + 0.5, 0, 0]); cono('#3a3030', mas(p, 0, -rc * 0.14, rc * 0.14), rc * 0.08, rc * 0.18, [Math.PI - 0.2, 0, 0], false); break; }
      case 'bigotes': case 'bigotes-dragon': for (const l of [-1, 1]) for (const k of r === 'bigotes' ? [-1, 0, 1] : [0]) { const p = enCabeza(l * 0.3, -0.38, 1.08), largo = r === 'bigotes' ? 0.17 : 0.5; palo(r === 'bigotes' ? '#f4f4f4' : F.acento, mas(p, l * largo * 0.45, k * 0.025 - (r === 'bigotes' ? 0 : 0.1), 0.02), 0.008, largo, [0, 0, l * (Math.PI / 2 - 0.25 + k * 0.12)]); } break;
      case 'colmillos': for (const l of [-1, 1]) cono('#ffffff', enCabeza(l * 0.16, -0.7, 1.05), rc * 0.07, rc * 0.6, [Math.PI, 0, 0]); break;
      case 'hojas-cuello': for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; esfera(i % 2 ? '#7ac74c' : '#5aa83a', [Math.sin(a) * rc * 0.95 + hx, hy - rc * 0.82, Math.cos(a) * rc * 0.82 + hz - 0.05], [0.11, 0.032, 0.06], [0, a, 0.5]); } break;
    }

    // Cuerpo
    padre = destinos.cuerpo;
    for (const r of F.rasgos) switch (r) {
      case 'llamas-lomo': for (let i = 0; i < 3; i++) flama(mas(lomo, 0, 0.04 - i * 0.05, 0.14 - i * 0.18), 0.32 - i * 0.06); break;
      case 'llama-farol': flama(mas(lomo, 0, -0.02, 0), 0.3); break;
      case 'garras': for (const p of [...manos, ...pies]) for (const k of [-1, 0, 1]) cono('#fff6e0', mas(p, k * 0.035, -0.01, 0.0), 0.016, 0.055, [Math.PI / 2, 0, 0], false); break;
      case 'alas-plumas': for (const l of [-1, 1]) {
        const ala = new THREE.Group(); ala.position.set(l * 0.3, torso[1] + 0.1, torso[2] - 0.02); padre.add(ala);
        esfera(F.color, [l * 0.06, -0.02, -0.06], [0.1, 0.24, 0.17], [0.4, 0, l * 0.25], true, ala);
        for (let k = 0; k < 4; k++) esfera(k % 2 ? oscuro : tono(F.color, -0.15), [l * 0.08, -0.14 - k * 0.02, -0.14 - k * 0.07], [0.05, 0.17, 0.06], [0.9, 0, l * 0.2], false, ala);
        alas.push({ o: ala, base: 0, eje: 'z' });
      } break;
      case 'alas-membrana': for (const l of [-1, 1]) {
        const ala = new THREE.Group(); ala.position.set(l * 0.18, lomo[1] + 0.06, lomo[2]); padre.add(ala);
        const forma2 = new THREE.Shape(), pt = (x: number, y: number): [number, number] => [l * x, y];
        forma2.moveTo(...pt(0, 0)); forma2.lineTo(...pt(0.52, 0.5)); forma2.lineTo(...pt(0.95, 0.12));
        forma2.quadraticCurveTo(...pt(0.78, 0.08), ...pt(0.7, -0.1)); forma2.quadraticCurveTo(...pt(0.56, -0.02), ...pt(0.42, -0.2)); forma2.quadraticCurveTo(...pt(0.26, -0.06), ...pt(0.06, -0.12)); forma2.lineTo(...pt(0, 0));
        const tela = new THREE.Mesh(new THREE.ShapeGeometry(forma2, 6), guardar(`m${F.color}`, () => new THREE.MeshToonMaterial({ color: tono(F.color, 0.3), gradientMap: GRADIENTE, side: THREE.DoubleSide })));
        tela.rotation.y = l * 0.35; ala.add(tela);
        const hueso = (a: [number, number], b: [number, number], g: number) => { const dx = b[0] - a[0], dy = b[1] - a[1], largo = Math.hypot(dx, dy); pieza(CILINDRO, oscuro, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.005], [g, largo, g], [0, 0, Math.atan2(-dx, dy)], tela, false); };
        const codo = pt(0.52, 0.5);
        hueso(pt(0, 0), codo, 0.028); for (const d of [pt(0.95, 0.12), pt(0.7, -0.1), pt(0.42, -0.2)]) hueso(codo, d, 0.014);
        pieza(CONO, '#fff6e0', [codo[0], codo[1] + 0.04, 0], [0.025, 0.08, 0.025], [0, 0, -l * 0.3], tela, false);
        alas.push({ o: ala, base: 0, eje: 'z' });
      } break;
      case 'alas-cristal': for (const l of [-1, 1]) for (const [y, s] of [[0.66, 1], [0.38, 0.72]] as [number, number][]) {
        const ala = new THREE.Group(); ala.position.set(l * 0.06, y, -0.04); padre.add(ala);
        esfera(vidrio(F.acento), [l * 0.3 * s, 0.05 * s, 0], [0.32 * s, 0.26 * s, 0.012], [0, 0, l * 0.3], false, ala);
        pieza(TORO, F.color, [l * 0.3 * s, 0.05 * s, 0], [0.32 * s, 0.26 * s, 0.5], [0, 0, l * 0.3], ala, false);
        for (const k of [0.4, 0.75]) pieza(CILINDRO, F.color, [l * 0.3 * s * k, 0.05 * s * k, 0], [0.008, 0.3 * s, 0.008], [0, 0, l * (0.3 + 1.2)], ala, false);
        esfera(brillo(F.panza), [l * 0.42 * s, 0.12 * s, 0.01], 0.035 * s, undefined, false, ala);
        alas.push({ o: ala, base: 0, eje: 'y' });
      } break;
      case 'caparazon': {
        const enLomo = F.cuerpo === 'bipedo', centro: V = enLomo ? [0, 0.6, -0.18] : [0, 0.52, -0.05];
        pieza(MEDIA, F.acento, centro, enLomo ? [0.35, 0.42, 0.28] : [0.46, 0.33, 0.56], enLomo ? [-Math.PI / 2, 0, 0] : [0, 0, 0]);
        if (enLomo) pieza(TORO, F.panza, centro, [0.35, 0.42, 0.45], [0, 0, 0], padre, false);
        const placa = tono(F.acento, -0.18);
        if (enLomo) { esfera(placa, [0, 0.62, -0.47], [0.12, 0.14, 0.02], undefined, false); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; esfera(placa, [Math.cos(a) * 0.22, 0.62 + Math.sin(a) * 0.26, -0.42], [0.07, 0.07, 0.02], undefined, false); } }
        else { esfera(placa, [0, 0.85, -0.05], [0.14, 0.02, 0.16], undefined, false); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; esfera(placa, [Math.cos(a) * 0.27, 0.78, -0.05 + Math.sin(a) * 0.32], [0.08, 0.02, 0.09], undefined, false); } }
        break;
      }
      case 'canones': for (const l of [-1, 1]) { palo('#8a8f9c', [l * 0.24, 0.98, -0.2], 0.065, 0.42, [0.95, 0, 0], true); esfera('#3a3f4a', [l * 0.24, 1.15, -0.02], [0.06, 0.06, 0.03], undefined, false); pieza(TORO, '#5a5f6a', [l * 0.24, 1.14, -0.03], [0.07, 0.07, 0.3], [0.95, 0, 0], padre, false); } break;
      case 'placas': for (let i = 0; i < 5; i++) pieza(new THREE.TorusGeometry(1, 0.15, 8, 22, Math.PI), i % 2 ? tono(F.acento, -0.12) : F.acento, [0, torso[1] + 0.08, torso[2] + 0.32 - i * 0.16], [0.36, 0.3, 0.5], [0, 0, 0], padre, true); break;
      case 'espinas-lomo': for (let i = 0; i < 4; i++) cono(F.acento, mas(lomo, 0, 0.04 - Math.abs(i - 1.5) * 0.03, 0.18 - i * 0.13), 0.06, 0.2, [-0.3, 0, 0]); break;
      case 'espinas-hielo': for (let i = 0; i < 4; i++) cono(vidrio('#d8f4ff'), mas(lomo, (i % 2 ? 1 : -1) * 0.08, 0.02, 0.12 - i * 0.12), 0.07, 0.26, [-0.2, 0, (i % 2 ? -1 : 1) * 0.3], false); break;
      case 'guantes': for (const p of manos) { esfera(F.acento, p, 0.125); pieza(TORO, '#fff6e0', mas(p, 0, 0.06, -0.04), [0.1, 0.1, 0.5], [Math.PI / 2 - 0.4, 0, 0], padre, false); } break;
      case 'cinturon': { pieza(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true), guardar(`d${F.acento}`, () => new THREE.MeshToonMaterial({ color: F.acento, gradientMap: GRADIENTE, side: THREE.DoubleSide })), [0, 0.44, 0], [0.345, 0.09, 0.305], [0, 0, 0], padre, false); esfera('#ffd23c', [0, 0.44, 0.3], [0.08, 0.07, 0.03]); break; }
      case 'farol': {
        const m = manos[1] ?? mas(torso, 0.4, -0.2, 0.15), base = mas(m, 0.02, -0.22, 0.04);
        palo('#3a2f2a', mas(m, 0.01, -0.06, 0.02), 0.012, 0.12, [0, 0, 0]);
        pieza(CILINDRO, vidrio('#ffe0a0'), base, [0.08, 0.16, 0.08], [0, 0, 0], padre, false);
        for (const y of [0.09, -0.09]) palo('#3a2f2a', mas(base, 0, y, 0), 0.095, 0.025, [0, 0, 0]);
        flama(mas(base, 0, -0.06, 0), 0.12);
        break;
      }
      case 'nubes': for (const i of [3, 12]) for (let k = 0; k < 4; k++) { const p = camino[i]; esfera('#ffffff', mas(p, (k - 1.5) * 0.12, -0.08 + (k % 2) * 0.05, 0.05), 0.09 + (k % 2) * 0.03); } break;
    }
    if (F.cuerpo === 'capullo') for (let i = 0; i < 5; i++) pieza(TORO, oscuro, [0, 0.16 + i * 0.16, 0], [0.29 - Math.abs(i - 2) * 0.045, 0.29 - Math.abs(i - 2) * 0.045, 0.6], [Math.PI / 2, 0, 0], padre, false);
    if (F.cuerpo === 'mariposa') for (const l of [-1, 1]) for (const y of [0.34, 0.5]) palo(oscuro, [l * 0.12, y, 0.06], 0.016, 0.18, [0.6, 0, l * 0.9]);
    if (F.cuerpo === 'ave') for (const x of [-0.11, 0.11]) { palo('#d89030', [x, 0.12, 0.02], 0.026, 0.2, [0, 0, 0]); for (const k of [-0.5, 0, 0.5]) pieza(CAPSULA, '#d89030', [x + k * 0.05, 0.02, 0.07], [0.016, 0.08, 0.016], [Math.PI / 2, k, 0], padre, false); }

    // Cola: la llama en la punta va en la cola, para que se mueva con ella
    padre = destinos.cola;
    if (puntaCola && rasgo('cola-llama')) flama(puntaCola, 0.3);
  };
  return { formas, pinturas, detalles, cab: cabezaAparte ? mas(cuello, 0, 0.02, 0) : cab, cola: colaInicio, flota, llamas, alas, ojos, bordeCuerpo: F.color };
}
