import * as THREE from 'three';
import { especie, type Forma } from './bestiasDatos';

// Arma cada criatura de Bestiario con piezas simples (esferas, cápsulas y conos) en estilo de dibujo animado: sombreado
// en tres tonos y contorno oscuro. Cada forma de cuerpo deja "anclas" (cabeza, lomo, cola, manos) y los rasgos se
// pegan ahí. Las crías tienen la cabeza más grande; las evoluciones, proporciones más adultas.

const GRADIENTE = (() => { const t = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const materiales = new Map<string, THREE.Material>();
const toon = (color: string) => { let m = materiales.get(color); if (!m) { m = new THREE.MeshToonMaterial({ color, gradientMap: GRADIENTE }); materiales.set(color, m); } return m; };
const brillo = (color: string) => { const k = `b${color}`; let m = materiales.get(k); if (!m) { m = new THREE.MeshBasicMaterial({ color }); materiales.set(k, m); } return m; };
const vidrio = (color: string) => { const k = `v${color}`; let m = materiales.get(k); if (!m) { m = new THREE.MeshToonMaterial({ color, gradientMap: GRADIENTE, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }); materiales.set(k, m); } return m; };
const BORDE = new THREE.MeshBasicMaterial({ color: '#2b1e2e', side: THREE.BackSide });
const ESFERA = new THREE.SphereGeometry(1, 22, 16), CONO = new THREE.ConeGeometry(1, 1, 14), CILINDRO = new THREE.CylinderGeometry(1, 1, 1, 12);
const CAPSULA = new THREE.CapsuleGeometry(1, 1, 6, 12), MEDIA = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);

/** Mezcla un color con blanco (>0) o negro (<0). */
const tono = (color: string, k: number) => `#${new THREE.Color(color).lerp(new THREE.Color(k > 0 ? '#ffffff' : '#000000'), Math.abs(k)).getHexString()}`;
type V = [number, number, number];

export interface Bestia {
  grupo: THREE.Group; cuerpo: THREE.Group; alto: number; flota: boolean; electrica: boolean;
  llamas: THREE.Object3D[]; alas: { o: THREE.Object3D; base: number; eje: 'z' | 'y' }[];
}

export function crearBestia(n: number): Bestia {
  const sp = especie(n), F: Forma = sp.forma, cuerpo = new THREE.Group(), grupo = new THREE.Group();
  grupo.add(cuerpo);
  const llamas: THREE.Object3D[] = [], alas: Bestia['alas'] = [];
  const cabezon = sp.etapa === 1 ? 1.12 : sp.etapa === 2 ? 0.96 : 0.84;
  /** Una pieza con su contorno. */
  const pieza = (geo: THREE.BufferGeometry, mat: THREE.Material | string, p: V, esc: V, rot: V = [0, 0, 0], padre: THREE.Object3D = cuerpo, borde = true) => {
    const m = new THREE.Mesh(geo, typeof mat === 'string' ? toon(mat) : mat);
    m.position.set(...p); m.scale.set(...esc); m.rotation.set(...rot);
    if (borde) { const b = new THREE.Mesh(geo, BORDE); b.scale.setScalar(1.06); m.add(b); }
    padre.add(m);
    return m;
  };
  const esfera = (color: string | THREE.Material, p: V, r: V | number, rot?: V, borde = true) => pieza(ESFERA, color, p, typeof r === 'number' ? [r, r, r] : r, rot, cuerpo, borde);
  const cono = (color: string | THREE.Material, p: V, r: number, h: number, rot: V = [0, 0, 0], borde = true) => pieza(CONO, color, p, [r, h, r], rot, cuerpo, borde);
  const palo = (color: string, p: V, r: number, largo: number, rot: V) => pieza(CILINDRO, color, p, [r, largo, r], rot, cuerpo, false);
  const capsula = (color: string, p: V, r: number, largo: number, rot: V = [0, 0, 0]) => pieza(CAPSULA, color, p, [r, largo, r], rot);
  const oscuro = tono(F.color, -0.35), claro = tono(F.color, 0.3);

  // ── Cuerpo según su forma; deja las anclas para los rasgos ──
  let cab: V = [0, 0.9, 0.05], rc = 0.3 * cabezon, lomo: V = [0, 0.7, -0.2], cola: V = [0, 0.4, -0.3], torso: V = [0, 0.5, 0], manos: V[] = [], pies: V[] = [];
  const hoja = sp.etapa === 1 ? 1 : 0.9;
  switch (F.cuerpo) {
    case 'cuadrupedo': {
      esfera(F.color, [0, 0.42, -0.05], [0.42, 0.33, 0.52]);
      esfera(F.panza, [0, 0.36, 0.08], [0.3, 0.24, 0.4], undefined, false);
      for (const [x, z] of [[-0.22, 0.24], [0.22, 0.24], [-0.22, -0.28], [0.22, -0.28]]) { capsula(F.color, [x, 0.17, z], 0.09, 0.16); esfera(oscuro, [x, 0.04, z + 0.03], [0.1, 0.06, 0.12], undefined, false); pies.push([x, 0.04, z + 0.1]); }
      cab = [0, 0.66 + rc * 0.4, 0.42]; lomo = [0, 0.74, -0.08]; cola = [0, 0.48, -0.55]; torso = [0, 0.42, -0.05];
      esfera(F.color, [0, 0.58, 0.28], [0.17, 0.2, 0.17], undefined, false);
      break;
    }
    case 'bipedo': {
      esfera(F.color, [0, 0.55, 0], [0.32, 0.4, 0.28]);
      esfera(F.panza, [0, 0.5, 0.17], [0.24, 0.3, 0.13], undefined, false);
      for (const x of [-0.15, 0.15]) { capsula(F.color, [x, 0.18, 0], 0.11, 0.14); esfera(oscuro, [x, 0.05, 0.06], [0.13, 0.07, 0.17], undefined, false); pies.push([x, 0.05, 0.2]); }
      for (const l of [-1, 1]) { capsula(F.color, [l * 0.34, 0.6, 0.06], 0.075, 0.2, [0.3, 0, l * 0.7]); manos.push([l * 0.43, 0.48, 0.12]); }
      cab = [0, 0.92 + rc * 0.7, 0.03]; lomo = [0, 0.68, -0.24]; cola = [0, 0.34, -0.24]; torso = [0, 0.55, 0];
      break;
    }
    case 'ave': {
      esfera(F.color, [0, 0.42, 0], [0.34, 0.33, 0.37]);
      esfera(F.panza, [0, 0.38, 0.17], [0.25, 0.26, 0.17], undefined, false);
      for (const x of [-0.11, 0.11]) { palo('#e8a030', [x, 0.08, 0.02], 0.025, 0.16, [0, 0, 0]); esfera('#e8a030', [x, 0.02, 0.07], [0.07, 0.025, 0.09], undefined, false); }
      cab = [0, 0.74 + rc * 0.45, 0.1]; lomo = [0, 0.58, -0.22]; cola = [0, 0.42, -0.36]; torso = [0, 0.42, 0];
      break;
    }
    case 'oruga': {
      [[0, 0.18, -0.5, 0.15], [0, 0.2, -0.3, 0.18], [0, 0.22, -0.08, 0.2]].forEach(([x, y, z, r], i) => { esfera(i % 2 ? F.color : claro, [x, y, z], r); esfera(F.panza, [x, 0.08, z + 0.02], [r * 0.8, 0.06, r * 0.8], undefined, false); });
      cab = [0, 0.34, 0.2]; rc = 0.27; lomo = [0, 0.4, -0.1]; cola = [0, 0.18, -0.62]; torso = [0, 0.22, -0.2];
      break;
    }
    case 'capullo': {
      esfera(F.color, [0, 0.5, 0], [0.3, 0.5, 0.28]);
      cono(F.color, [0, 1.02, -0.02], 0.12, 0.2);
      for (let i = 0; i < 4; i++) pieza(new THREE.TorusGeometry(1, 0.06, 6, 20), oscuro, [0, 0.22 + i * 0.17, 0], [0.29 - Math.abs(i - 1.5) * 0.04, 0.29 - Math.abs(i - 1.5) * 0.04, 0.29], [Math.PI / 2, 0, 0], cuerpo, false);
      cab = [0, 0.72, 0.02]; rc = 0.26; lomo = [0, 0.7, -0.25]; cola = [0, 0.1, -0.2]; torso = [0, 0.5, 0];
      break;
    }
    case 'mariposa': {
      capsula(F.color, [0, 0.55, 0], 0.09, 0.32);
      cab = [0, 0.86, 0.04]; rc = 0.2 * cabezon; lomo = [0, 0.6, -0.08]; cola = [0, 0.3, 0]; torso = [0, 0.55, 0];
      for (const l of [-1, 1]) for (const y of [0.32, 0.5]) palo(oscuro, [l * 0.1, y, 0.06], 0.018, 0.16, [0.6, 0, l * 0.9]);
      break;
    }
    case 'marino': {
      esfera(F.color, [0, 0.34, -0.06], [0.38, 0.33, 0.55]);
      esfera(F.panza, [0, 0.27, 0.12], [0.3, 0.24, 0.38], undefined, false);
      esfera(F.color, [0, 0.16, -0.6], [0.22, 0.12, 0.26]);
      cab = [0, 0.58 + rc * 0.3, 0.42]; lomo = [0, 0.66, -0.1]; cola = [0, 0.14, -0.78]; torso = [0, 0.34, -0.06];
      break;
    }
    case 'flotante': {
      esfera(F.color, [0, 0.72, 0], [0.38, 0.4, 0.36]);
      esfera(F.panza, [0, 0.64, 0.16], [0.26, 0.24, 0.2], undefined, false);
      for (const l of [-1, 1]) { esfera(F.color, [l * 0.4, 0.66, 0.08], [0.1, 0.13, 0.1]); manos.push([l * 0.44, 0.6, 0.1]); }
      cab = [0, 0.78, 0.04]; rc = 0.36; lomo = [0, 1.04, -0.05]; cola = [0, 0.38, -0.05]; torso = [0, 0.72, 0];
      break;
    }
    case 'serpiente': {
      const puntos: V[] = [];
      for (let i = 0; i <= 11; i++) { const t = i / 11; puntos.push([Math.sin(t * Math.PI * 2.2) * 0.32, 0.3 + t * 0.62 + Math.sin(t * Math.PI) * 0.12, -0.7 + t * 0.9]); }
      puntos.forEach((p, i) => { const r = 0.07 + (i / 11) * 0.11; esfera(i % 3 === 1 ? claro : F.color, p, r); if (i % 2 === 0) esfera(F.panza, [p[0], p[1] - r * 0.4, p[2] + r * 0.3], [r * 0.75, r * 0.5, r * 0.6], undefined, false); });
      cab = [puntos[11][0], puntos[11][1] + 0.12, puntos[11][2] + 0.14]; rc = 0.2; lomo = puntos[8]; cola = puntos[0]; torso = puntos[6];
      for (const l of [-1, 1]) { capsula(F.color, [puntos[8][0] + l * 0.17, puntos[8][1] - 0.08, puntos[8][2] + 0.05], 0.04, 0.12, [0.6, 0, l * 0.8]); manos.push([puntos[8][0] + l * 0.24, puntos[8][1] - 0.14, puntos[8][2] + 0.08]); }
      break;
    }
    case 'rana': {
      esfera(F.color, [0, 0.3, -0.04], [0.4, 0.28, 0.38]);
      esfera(F.panza, [0, 0.24, 0.14], [0.3, 0.2, 0.26], undefined, false);
      for (const l of [-1, 1]) { esfera(F.color, [l * 0.33, 0.16, -0.16], [0.14, 0.13, 0.26]); esfera(oscuro, [l * 0.36, 0.03, 0.06], [0.12, 0.04, 0.14], undefined, false); capsula(F.color, [l * 0.22, 0.12, 0.24], 0.06, 0.1); esfera(oscuro, [l * 0.24, 0.03, 0.3], [0.08, 0.03, 0.08], undefined, false); }
      cab = [0, 0.5, 0.2]; rc = 0.3 * cabezon; lomo = [0, 0.56, -0.12]; cola = [0, 0.2, -0.42]; torso = [0, 0.3, -0.04];
      break;
    }
  }
  // ── Cabeza, ojos, boca ──
  const [hx, hy, hz] = cab;
  if (F.cuerpo !== 'flotante') {
    if (F.cuerpo === 'rana') esfera(F.color, cab, [rc * 1.25, rc * 0.85, rc]);
    else if (F.cuerpo === 'capullo') { /* la cabeza es el mismo capullo */ }
    else esfera(F.color, cab, rc);
  }
  const enCabeza = (yaw: number, pitch: number, d = 1): V => [hx + Math.sin(yaw) * Math.cos(pitch) * rc * d, hy + Math.sin(pitch) * rc * d, hz + Math.cos(yaw) * Math.cos(pitch) * rc * d];
  const rasgo = (r: string) => F.rasgos.includes(r);
  // Hocico para los que tienen cara alargada
  if (['cuadrupedo', 'marino'].includes(F.cuerpo) || rasgo('bigotes-dragon')) { esfera(F.panza, enCabeza(0, -0.38, 0.88), [rc * 0.48, rc * 0.36, rc * 0.42]); esfera('#2b1e2e', enCabeza(0, -0.12, 1.02), rc * 0.1, undefined, false); }
  const ojoGrande = F.cuerpo === 'rana' ? 1.35 : F.cuerpo === 'flotante' ? 1.05 : 1;
  for (const l of [-1, 1]) {
    const yaw = l * (F.cuerpo === 'rana' ? 0.6 : 0.42), pitch = F.cuerpo === 'rana' ? 0.55 : 0.12;
    const p = enCabeza(yaw, pitch, 0.9), r = rc * 0.27 * ojoGrande;
    const ojo = new THREE.Group(); ojo.position.set(...p); ojo.lookAt(p[0] + (p[0] - hx), p[1] + (p[1] - hy) * 0.3, p[2] + (p[2] - hz)); cuerpo.add(ojo);
    if (F.cuerpo === 'rana') pieza(ESFERA, F.color, [0, 0, -r * 0.3], [r * 1.25, r * 1.25, r * 1.1], [0, 0, 0], ojo);
    const alto = F.ojos === 'serenos' ? 0.62 : 1.15;
    pieza(ESFERA, '#ffffff', [0, 0, 0], [r, r * alto, r * 0.5], [0, 0, 0], ojo);
    pieza(ESFERA, '#1e1426', [0, -r * 0.05, r * 0.3], [r * 0.68, r * 0.82 * alto, r * 0.4], [0, 0, 0], ojo, false);
    pieza(ESFERA, brillo('#ffffff'), [r * 0.25, r * 0.3 * alto, r * 0.62], [r * 0.24, r * 0.24, r * 0.1], [0, 0, 0], ojo, false);
    if (F.ojos === 'feroces') pieza(new THREE.BoxGeometry(1, 1, 1), '#2b1e2e', [-l * r * 0.1, r * 1.05, r * 0.3], [r * 1.6, r * 0.28, r * 0.3], [0, 0, l * 0.45], ojo, false);
    if (F.ojos === 'serenos') pieza(ESFERA, F.color, [0, r * 0.45, r * 0.12], [r * 1.08, r * 0.55, r * 0.5], [0, 0, 0], ojo, false);
  }
  // Boca: una sonrisa chiquita (o seria en los feroces)
  const boca = pieza(new THREE.TorusGeometry(1, 0.22, 5, 12, Math.PI), '#2b1e2e', enCabeza(0, F.cuerpo === 'rana' ? 0.05 : -0.3, 1.0), [rc * 0.13, rc * 0.1, rc * 0.1], [Math.PI, 0, 0], cuerpo, false);
  if (F.ojos === 'feroces') boca.scale.y *= 0.5;

  // ── Rasgos ──
  const alrededor = (base: V, dx: number, dy: number, dz: number): V => [base[0] + dx, base[1] + dy, base[2] + dz];
  const flama = (p: V, tam: number) => {
    const g = new THREE.Group(); g.position.set(...p); cuerpo.add(g);
    pieza(CONO, brillo('#ff7a1a'), [0, tam * 0.5, 0], [tam * 0.45, tam, tam * 0.45], [0, 0, 0], g, false);
    pieza(CONO, brillo('#ffd23c'), [0, tam * 0.38, tam * 0.05], [tam * 0.26, tam * 0.65, tam * 0.26], [0, 0, 0], g, false);
    llamas.push(g);
  };
  const colaCadena = (n2: number, r: number, sube: number, color = F.color): V => {
    let p = cola;
    for (let i = 0; i < n2; i++) { p = [p[0], p[1] + sube * (i + 1) * 0.5, p[2] - r * 1.2]; esfera(color, p, r * (1 - i * 0.18)); }
    return p;
  };
  for (const r of F.rasgos) switch (r) {
    case 'mejillas': for (const l of [-1, 1]) esfera('#ff9a8a', enCabeza(l * 0.75, -0.25, 0.92), [rc * 0.18, rc * 0.12, rc * 0.06], [0, l * 0.75, 0], false); break;
    case 'llamas-lomo': for (let i = 0; i < 3; i++) flama(alrededor(lomo, 0, 0.06 - i * 0.05, 0.12 - i * 0.17), 0.3 - i * 0.05); break;
    case 'cola-larga': colaCadena(3, 0.09, 0.08); break;
    case 'cola-llama': flama(colaCadena(3, 0.1, 0.1), 0.26); break;
    case 'cola-corta': esfera(F.color, cola, 0.08); break;
    case 'cola-esponjosa': {
      const c0 = alrededor(cola, 0, 0.28, -0.2);
      esfera(F.color, c0, [0.19, 0.38, 0.2], [-0.55, 0, 0]);
      esfera(F.panza, alrededor(c0, 0, 0.3, 0.12), [0.14, 0.15, 0.14], [-0.3, 0, 0]);
      break;
    }
    case 'cola-aleta': { const p = colaCadena(2, 0.09, 0.12); esfera(F.acento, alrededor(p, 0, 0.1, -0.08), [0.04, 0.2, 0.16], [0.4, 0, 0]); break; }
    case 'cola-anillos': { let p = cola; for (let i = 0; i < 5; i++) { p = alrededor(p, 0, 0.09, -0.09); esfera(i % 2 ? F.acento : F.color, p, 0.11 - i * 0.008); } break; }
    case 'cola-plumas': for (const l of [-1, 0, 1]) esfera(l ? F.color : F.acento, alrededor(cola, l * 0.1, 0.02, -0.15), [0.08, 0.03, 0.26], [0.2, l * 0.4, 0]); break;
    case 'cola-espiritu': cono(F.color, alrededor(cola, 0, -0.02, -0.06), 0.2, 0.42, [Math.PI + 0.4, 0, 0]); break;
    case 'cresta': for (let i = 0; i < 3; i++) cono(F.acento, enCabeza(0, 0.95 - i * 0.35, 1.0), rc * 0.16, rc * (0.6 - i * 0.12), [-0.4 - i * 0.35, 0, 0]); break;
    case 'garras': for (const p of [...manos, ...pies]) for (const k of [-1, 0, 1]) cono('#fff6e0', alrededor(p, k * 0.04, 0, 0.02), 0.022, 0.07, [Math.PI / 2, 0, 0], false); break;
    case 'cuernos': for (const l of [-1, 1]) cono(F.panza, enCabeza(l * 0.45, 0.75, 0.95), rc * 0.13, rc * 0.75, [-0.6, 0, l * -0.35]); break;
    case 'astas': case 'astas-flor': for (const l of [-1, 1]) {
      const base = enCabeza(l * 0.35, 0.85, 0.95);
      palo('#8a6038', alrededor(base, l * 0.08, 0.18, -0.02), 0.03, 0.36, [0, 0, -l * 0.4]);
      const punta = alrededor(base, l * 0.16, 0.36, -0.04);
      palo('#8a6038', alrededor(punta, l * 0.06, 0.06, 0), 0.022, 0.18, [0, 0, -l * 1.1]);
      palo('#8a6038', alrededor(punta, -l * 0.02, 0.1, 0), 0.022, 0.2, [0, 0, l * 0.3]);
      esfera('#7ac74c', alrededor(punta, l * 0.14, 0.1, 0), [0.06, 0.03, 0.04], [0, 0, l * 0.6], false);
      if (r === 'astas-flor') for (const [dx, dy] of [[l * 0.12, 0.14], [-l * 0.03, 0.22], [l * 0.04, 0.02]]) { esfera(F.acento, alrededor(punta, dx, dy, 0), 0.06); esfera(brillo('#fff2a0'), alrededor(punta, dx, dy, 0.05), 0.025, undefined, false); }
    } break;
    case 'brote': { palo('#5a8a2a', enCabeza(0, 0.95, 1.0), 0.02, 0.12, [0, 0, 0]); for (const l of [-1, 1]) esfera('#7ac74c', alrededor(enCabeza(0, 0.95, 1.0), l * 0.06, 0.07, 0), [0.07, 0.025, 0.045], [0, 0, -l * 0.5]); break; }
    case 'orejas-puntas': for (const l of [-1, 1]) { cono(F.color, enCabeza(l * 0.55, 0.75, 0.9), rc * 0.24, rc * 0.7, [0, 0, -l * 0.45]); cono(F.acento, enCabeza(l * 0.55, 0.8, 0.98), rc * 0.13, rc * 0.42, [0.1, 0, -l * 0.45], false); } break;
    case 'orejas-redondas': for (const l of [-1, 1]) { esfera(F.color, enCabeza(l * 0.7, 0.65, 0.95), [rc * 0.3, rc * 0.3, rc * 0.12]); esfera(F.panza, enCabeza(l * 0.7, 0.65, 1.02), [rc * 0.17, rc * 0.17, rc * 0.06], undefined, false); } break;
    case 'orejas-largas': for (const l of [-1, 1]) esfera(F.color, enCabeza(l * 0.95, 0.35, 1.05), [rc * 0.55, rc * 0.17, rc * 0.25], [0, 0, l * 0.35]); break;
    case 'orejas-zorro': for (const l of [-1, 1]) { cono(F.color, enCabeza(l * 0.5, 0.78, 0.92), rc * 0.32, rc * 0.85, [0, 0, -l * 0.35]); cono(oscuro, enCabeza(l * 0.5, 0.95, 1.0), rc * 0.16, rc * 0.3, [0, 0, -l * 0.35], false); } break;
    case 'orejas-aleta': for (const l of [-1, 1]) esfera(F.acento, enCabeza(l * 1.05, 0.25, 1.0), [rc * 0.12, rc * 0.45, rc * 0.35], [0.3, 0, l * 0.5]); break;
    case 'manchas': for (let i = 0; i < 5; i++) esfera(F.panza, alrededor(lomo, Math.sin(i * 2.4) * 0.16, -0.02 - (i % 2) * 0.05, Math.cos(i * 1.7) * 0.18), [0.05, 0.025, 0.05], undefined, false); break;
    case 'hojas-cuello': for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; esfera(i % 2 ? '#7ac74c' : '#5aa83a', [Math.sin(a) * rc * 0.95 + hx, hy - rc * 0.85, Math.cos(a) * rc * 0.8 + hz - 0.05], [0.1, 0.035, 0.06], [0, a, 0.5]); } break;
    case 'orbe': esfera(brillo(F.acento), enCabeza(0, 0.4, 1.0), rc * 0.15); break;
    case 'antenas': case 'antenas-chispa': for (const l of [-1, 1]) {
      const base = enCabeza(l * 0.3, 0.9, 0.95);
      palo(oscuro, alrededor(base, l * 0.05, 0.12, 0.02), 0.014, 0.26, [0.2, 0, -l * 0.35]);
      esfera(r === 'antenas-chispa' ? brillo(F.acento === '#4a5aa8' ? '#8ad8ff' : F.acento) : F.acento, alrededor(base, l * 0.1, 0.25, 0.05), 0.045, undefined, r !== 'antenas-chispa');
    } break;
    case 'membrana': for (const l of [-1, 1]) esfera(F.acento, alrededor(torso, l * 0.33, -0.05, -0.02), [0.06, 0.28, 0.2], [0, 0, l * 0.15]); break;
    case 'pico': cono('#f0a030', enCabeza(0, -0.15, 1.0), rc * 0.2, rc * 0.5, [Math.PI / 2, 0, 0]); break;
    case 'alas-plumas': for (const l of [-1, 1]) {
      const ala = new THREE.Group(); ala.position.set(l * 0.3, torso[1] + 0.08, torso[2] - 0.02); cuerpo.add(ala);
      pieza(ESFERA, F.color, [l * 0.12, -0.02, -0.04], [0.15, 0.24, 0.07], [0.3, 0, l * 0.4], ala);
      pieza(ESFERA, oscuro, [l * 0.16, -0.12, -0.12], [0.1, 0.16, 0.05], [0.5, 0, l * 0.5], ala);
      alas.push({ o: ala, base: 0, eje: 'z' });
    } break;
    case 'alas-membrana': for (const l of [-1, 1]) {
      const ala = new THREE.Group(); ala.position.set(l * 0.18, lomo[1] + 0.05, lomo[2]); cuerpo.add(ala);
      const membrana = tono(F.color, 0.25);
      pieza(CILINDRO, oscuro, [l * 0.22, 0.2, -0.05], [0.03, 0.5, 0.03], [0, 0, -l * 0.9], ala, false);
      for (const [k, ang] of [[0, 0.5], [1, 1.1], [2, 1.7]]) pieza(CILINDRO, oscuro, [l * (0.42 - k * 0.05), 0.28 - k * 0.12, -0.06], [0.018, 0.34, 0.018], [0, 0, -l * ang], ala, false);
      pieza(ESFERA, membrana, [l * 0.36, 0.14, -0.07], [0.26, 0.2, 0.015], [0, 0, -l * 0.5], ala);
      pieza(ESFERA, membrana, [l * 0.3, -0.02, -0.07], [0.2, 0.14, 0.015], [0, 0, -l * 1.0], ala);
      alas.push({ o: ala, base: 0, eje: 'z' });
    } break;
    case 'alas-cristal': for (const l of [-1, 1]) for (const [y, s] of [[0.65, 1], [0.38, 0.7]] as [number, number][]) {
      const ala = new THREE.Group(); ala.position.set(l * 0.06, y, -0.04); cuerpo.add(ala);
      pieza(ESFERA, vidrio(F.acento), [l * 0.3 * s, 0.05 * s, 0], [0.32 * s, 0.26 * s, 0.015], [0, 0, l * 0.3], ala, false);
      pieza(new THREE.TorusGeometry(1, 0.05, 4, 24), F.color, [l * 0.3 * s, 0.05 * s, 0], [0.32 * s, 0.26 * s, 0.6], [0, 0, l * 0.3], ala, false);
      esfera(brillo(F.panza), [l * (0.06 + 0.3 * s), y + 0.06 * s, -0.03], 0.04 * s, undefined, false);
      alas.push({ o: ala, base: 0, eje: 'y' });
    } break;
    case 'caparazon': {
      const enLomo = F.cuerpo === 'bipedo';
      pieza(MEDIA, F.acento, enLomo ? [0, 0.6, -0.16] : [0, 0.5, -0.05], enLomo ? [0.34, 0.4, 0.26] : [0.47, 0.32, 0.56], enLomo ? [-Math.PI / 2, 0, 0] : [0, 0, 0]);
      pieza(new THREE.TorusGeometry(1, 0.08, 6, 24), F.panza, enLomo ? [0, 0.6, -0.17] : [0, 0.5, -0.05], enLomo ? [0.34, 0.4, 0.3] : [0.48, 0.56, 0.3], enLomo ? [0, 0, 0] : [Math.PI / 2, 0, 0], cuerpo, false);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const p: V = enLomo ? [Math.cos(a) * 0.17, 0.62 + Math.sin(a) * 0.2, -0.38] : [Math.cos(a) * 0.22, 0.76, -0.05 + Math.sin(a) * 0.26]; esfera(tono(F.acento, -0.2), p, [0.06, enLomo ? 0.06 : 0.015, enLomo ? 0.015 : 0.06], undefined, false); }
      break;
    }
    case 'canones': for (const l of [-1, 1]) { palo('#7a7f8c', [l * 0.22, 0.98, -0.18], 0.06, 0.38, [0.9, 0, 0]); esfera('#4a4f5a', [l * 0.22, 1.13, 0.0], [0.065, 0.065, 0.03], undefined, false); } break;
    case 'placas': for (let i = 0; i < 4; i++) pieza(new THREE.TorusGeometry(1, 0.12, 6, 20, Math.PI), F.acento, [0, torso[1] + 0.02, torso[2] + 0.28 - i * 0.18], [0.42, 0.34, 0.6], [0, 0, 0], cuerpo, true); break;
    case 'espinas-lomo': for (let i = 0; i < 4; i++) cono(F.acento, alrededor(lomo, 0, 0.04 - Math.abs(i - 1.5) * 0.03, 0.16 - i * 0.12), 0.06, 0.18, [-0.3, 0, 0]); break;
    case 'espinas-hielo': for (let i = 0; i < 4; i++) cono(vidrio('#d8f4ff'), alrededor(lomo, (i % 2 ? 1 : -1) * 0.08, 0.02, 0.12 - i * 0.12), 0.07, 0.24, [-0.2, 0, (i % 2 ? -1 : 1) * 0.3], false); break;
    case 'bigotes': case 'bigotes-dragon': for (const l of [-1, 1]) for (const k of r === 'bigotes' ? [-1, 1] : [0]) {
      const p = enCabeza(l * 0.35, -0.35, 1.0), largo = r === 'bigotes' ? 0.18 : 0.45;
      palo(r === 'bigotes' ? '#ffffff' : F.acento, alrededor(p, l * largo * 0.45, k * 0.02 - (r === 'bigotes' ? 0 : 0.08), 0.02), 0.01, largo, [0, 0, l * (Math.PI / 2 - 0.25 + k * 0.12)]);
    } break;
    case 'colmillos': for (const l of [-1, 1]) cono('#ffffff', enCabeza(l * 0.15, -0.65, 0.95), rc * 0.07, rc * 0.55, [Math.PI, 0, 0]); break;
    case 'aletas': for (const l of [-1, 1]) { esfera(F.color, alrededor(torso, l * 0.36, -0.2, 0.25), [0.16, 0.04, 0.12], [0, l * 0.4, l * 0.3]); esfera(F.color, alrededor(cola, l * 0.12, 0, -0.06), [0.13, 0.03, 0.08], [0, l * 0.5, 0]); } break;
    case 'mascara': esfera(F.acento, enCabeza(0, 0.12, 0.62), [rc * 0.95, rc * 0.3, rc * 0.5], undefined, false); break;
    case 'guantes': for (const p of manos) esfera(F.acento, p, 0.12); break;
    case 'cinturon': { pieza(new THREE.TorusGeometry(1, 0.1, 6, 24), F.acento, [0, 0.42, 0], [0.31, 0.31, 0.3], [Math.PI / 2, 0, 0]); esfera('#ffd23c', [0, 0.42, 0.29], [0.08, 0.07, 0.03]); break; }
    case 'bolsa-garganta': esfera(F.acento, enCabeza(0, -0.75, 0.8), [rc * 0.55, rc * 0.4, rc * 0.4]); break;
    case 'llama-farol': { pieza(new THREE.TorusGeometry(1, 0.15, 6, 16), '#5a4a3a', alrededor(lomo, 0, 0.02, 0), [0.11, 0.11, 0.11], [Math.PI / 2, 0, 0]); flama(alrededor(lomo, 0, 0.0, 0), 0.32); break; }
    case 'nubes': for (const i of [1, 4, 7]) for (let k = 0; k < 3; k++) esfera('#ffffff', [Math.sin((i / 11) * Math.PI * 2.2) * 0.32 + (k - 1) * 0.12, 0.2 + (i / 11) * 0.62 - 0.1, -0.7 + (i / 11) * 0.9 + (k % 2) * 0.05], 0.09 + (k % 2) * 0.03); break;
    case 'flota': break;
  }

  // ── Medir y llevar a su altura, con los pies en el suelo (los que flotan, un poco arriba) ──
  cuerpo.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(cuerpo), medida = caja.getSize(new THREE.Vector3());
  const escala = F.alto / Math.max(0.01, medida.y);
  cuerpo.scale.setScalar(escala);
  cuerpo.position.y = -caja.min.y * escala;
  const flota = ['flotante', 'serpiente', 'mariposa'].includes(F.cuerpo) || rasgo('flota');
  if (flota) cuerpo.position.y += F.alto * 0.18;
  grupo.userData.base = cuerpo.position.y;
  return { grupo, cuerpo, alto: F.alto * (flota ? 1.18 : 1), flota, electrica: sp.tipos.includes('electrico'), llamas, alas };
}

/** Respira, aletea, flota y hace bailar sus llamas (llamar en cada cuadro). */
export function animarBestia(b: Bestia, t: number, fase = 0) {
  const base = b.grupo.userData.base as number;
  b.cuerpo.scale.y = b.cuerpo.scale.x * (1 + Math.sin(t * 3 + fase) * 0.025);
  b.cuerpo.position.y = base + (b.flota ? Math.sin(t * 2 + fase) * b.alto * 0.04 : 0);
  for (const [i, l] of b.llamas.entries()) l.scale.set(1 + Math.sin(t * 17 + i) * 0.12, 1 + Math.sin(t * 13 + i * 2) * 0.22, 1);
  for (const [i, a] of b.alas.entries()) { const v = Math.sin(t * (b.flota ? 9 : 4) + fase + (i % 2) * 0.2) * (b.flota ? 0.45 : 0.18); if (a.eje === 'z') a.o.rotation.z = (a.o.position.x > 0 ? 1 : -1) * v; else a.o.rotation.y = (a.o.position.x > 0 ? -1 : 1) * v; }
}

export function soltarBestia(b: Bestia) { b.grupo.removeFromParent(); }
