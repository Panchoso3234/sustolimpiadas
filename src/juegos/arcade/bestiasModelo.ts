import * as THREE from 'three';
import { TIPOS, especie, type Forma } from './bestiasDatos';

// Arma cada criatura de Bestiario en código, con un estilo de animación 3D cuidado: sombreado suave en varios tonos,
// contorno fino del color de cada pieza, ojos con iris del color de su tipo, pupila, brillos y párpados que dan la
// expresión, y anatomía de verdad (muslos, patas con dedos, hombros, manos, cuello y hocico). Cada forma de cuerpo
// deja "anclas" (cabeza, lomo, cola, manos, pies) y los rasgos se pegan ahí. Las crías tienen la cabeza más grande;
// las evoluciones, proporciones más adultas.

const GRADIENTE = (() => { const t = new THREE.DataTexture(new Uint8Array([96, 140, 182, 218, 255]), 5, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const materiales = new Map<string, THREE.Material>();
const guardar = <T extends THREE.Material>(k: string, crear: () => T): T => { let m = materiales.get(k) as T | undefined; if (!m) { m = crear(); materiales.set(k, m); } return m; };
/** Mezcla un color con blanco (>0) o negro (<0). */
const tono = (color: string, k: number) => `#${new THREE.Color(color).lerp(new THREE.Color(k > 0 ? '#ffffff' : '#000000'), Math.abs(k)).getHexString()}`;
const toon = (color: string) => guardar(color, () => new THREE.MeshToonMaterial({ color, gradientMap: GRADIENTE }));
const brillo = (color: string) => guardar(`b${color}`, () => new THREE.MeshBasicMaterial({ color }));
const vidrio = (color: string) => guardar(`v${color}`, () => new THREE.MeshToonMaterial({ color, gradientMap: GRADIENTE, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
/** El contorno es del mismo color que la pieza, mucho más oscuro (no negro): se ve dibujado pero no caricaturesco. */
const borde = (color: string) => guardar(`c${color}`, () => new THREE.MeshBasicMaterial({ color: tono(color, -0.62), side: THREE.BackSide }));
const ESFERA = new THREE.SphereGeometry(1, 28, 20), CONO = new THREE.ConeGeometry(1, 1, 16), CILINDRO = new THREE.CylinderGeometry(1, 1, 1, 14);
const CAPSULA = new THREE.CapsuleGeometry(1, 1, 8, 16), MEDIA = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
const TORO = new THREE.TorusGeometry(1, 0.1, 8, 28), ARCO = new THREE.TorusGeometry(1, 0.13, 6, 14, 1.3);
type V = [number, number, number];

export interface Bestia {
  grupo: THREE.Group; cuerpo: THREE.Group; alto: number; flota: boolean; electrica: boolean;
  llamas: THREE.Object3D[]; alas: { o: THREE.Object3D; base: number; eje: 'z' | 'y' }[];
}

export function crearBestia(n: number): Bestia {
  const sp = especie(n), F: Forma = sp.forma, cuerpo = new THREE.Group(), grupo = new THREE.Group();
  grupo.add(cuerpo);
  const llamas: THREE.Object3D[] = [], alas: Bestia['alas'] = [];
  const cabezon = sp.legendaria ? 0.95 : sp.etapa === 1 ? 1.0 : sp.etapa === 2 ? 0.88 : 0.78;
  const rasgo = (r: string) => F.rasgos.includes(r);
  const oscuro = tono(F.color, -0.3), claro = tono(F.color, 0.28), iris = sp.tipos[0] === 'lucha' ? '#5a3a22' : tono(TIPOS[sp.tipos[0]].color, -0.42);

  /** Una pieza con su contorno (`b` = false para detalles chicos que no lo necesitan). */
  const pieza = (geo: THREE.BufferGeometry, mat: THREE.Material | string, p: V, esc: V, rot: V = [0, 0, 0], padre: THREE.Object3D = cuerpo, b = true) => {
    const m = new THREE.Mesh(geo, typeof mat === 'string' ? toon(mat) : mat);
    m.position.set(...p); m.scale.set(...esc); m.rotation.set(...rot);
    if (b) { const c = new THREE.Mesh(geo, borde(typeof mat === 'string' ? mat : `#${((mat as THREE.MeshBasicMaterial).color ?? new THREE.Color('#888888')).getHexString()}`)); c.scale.setScalar(1.035); m.add(c); }
    padre.add(m);
    return m;
  };
  const esfera = (color: string | THREE.Material, p: V, r: V | number, rot?: V, b = true, padre: THREE.Object3D = cuerpo) => pieza(ESFERA, color, p, typeof r === 'number' ? [r, r, r] : r, rot, padre, b);
  const cono = (color: string | THREE.Material, p: V, r: number, h: number, rot: V = [0, 0, 0], b = true) => pieza(CONO, color, p, [r, h, r], rot, cuerpo, b);
  const palo = (color: string, p: V, r: number, largo: number, rot: V, b = false) => pieza(CILINDRO, color, p, [r, largo, r], rot, cuerpo, b);
  const capsula = (color: string, p: V, r: number, largo: number, rot: V = [0, 0, 0], b = true) => pieza(CAPSULA, color, p, [r, largo, r], rot, cuerpo, b);
  const mas = (a: V, dx: number, dy: number, dz: number): V => [a[0] + dx, a[1] + dy, a[2] + dz];
  /** Una pata con muslo, pierna y pie con tres dedos. */
  const pata = (x: number, z: number, alto: number, grosor: number, color = F.color) => {
    esfera(color, [x, alto * 0.82, z], grosor * 1.45);
    capsula(color, [x, alto * 0.42, z + 0.01], grosor * 0.85, alto * 0.34);
    esfera(oscuro, [x, grosor * 0.55, z + grosor * 0.35], [grosor * 1.15, grosor * 0.62, grosor * 1.4]);
    for (const k of [-1, 0, 1]) esfera(oscuro, [x + k * grosor * 0.62, grosor * 0.45, z + grosor * 1.55], grosor * 0.36, undefined, false);
    return [x, grosor * 0.5, z + grosor * 1.7] as V;
  };
  /** Un brazo con hombro, antebrazo y mano. */
  const brazo = (l: number, hombro: V, largo: number, grosor: number): V => {
    esfera(F.color, hombro, grosor * 1.3);
    const codo = mas(hombro, l * largo * 0.42, -largo * 0.62, largo * 0.32);
    capsula(F.color, [(hombro[0] + codo[0]) / 2, (hombro[1] + codo[1]) / 2, (hombro[2] + codo[2]) / 2], grosor, largo * 0.55, [0.45, 0, l * 0.62]);
    const mano = mas(codo, l * 0.02, -0.04, 0.03);
    esfera(F.color, mano, grosor * 1.2);
    for (const k of [-1, 0, 1]) esfera(claro, mas(mano, k * grosor * 0.6, -grosor * 0.55, grosor * 0.85), grosor * 0.38, undefined, false);
    return mano;
  };

  // ── Cuerpo según su forma; deja las anclas para los rasgos ──
  let cab: V = [0, 0.9, 0.05], rc = 0.3 * cabezon, lomo: V = [0, 0.7, -0.2], cola: V = [0, 0.4, -0.3], torso: V = [0, 0.5, 0];
  const manos: V[] = [], pies: V[] = [];
  let camino: V[] = [];
  let forma: V = [1, 1, 1];
  switch (F.cuerpo) {
    case 'cuadrupedo': {
      const s0 = rasgo('patas-largas') ? 0.2 : 0, fino = rasgo('patas-largas') ? 0.86 : 1;
      esfera(F.color, [0, 0.44 + s0, -0.04], [0.37 * fino, 0.31 * fino, 0.5]);
      esfera(F.color, [0, 0.5 + s0, 0.22], [0.29 * fino, 0.29 * fino, 0.27]);
      esfera(F.color, [0, 0.46 + s0, -0.32], [0.3 * fino, 0.28 * fino, 0.28]);
      esfera(F.panza, [0, 0.36 + s0 * 1.1, 0.1], [0.25 * fino, 0.2 * fino, 0.38], undefined, false);
      for (const [x, z] of [[-0.19, 0.26], [0.19, 0.26], [-0.2, -0.32], [0.2, -0.32]]) pies.push(pata(x * fino, z, 0.38 + s0, 0.07));
      esfera(F.color, [0, 0.68 + s0, 0.34], [0.15, 0.24, 0.16], [-0.5, 0, 0]);
      cab = [0, 0.76 + s0 + rc * 0.3, 0.46]; lomo = [0, 0.78 + s0, -0.06]; cola = [0, 0.5 + s0, -0.58]; torso = [0, 0.44 + s0, -0.04];
      forma = [1, 0.96, 1.08];
      break;
    }
    case 'bipedo': {
      esfera(F.color, [0, 0.48, 0], [0.33, 0.35, 0.29]);
      esfera(F.color, [0, 0.68, 0.01], [0.29, 0.26, 0.25]);
      esfera(F.panza, [0, 0.52, 0.18], [0.23, 0.3, 0.13], undefined, false);
      for (const x of [-0.17, 0.17]) pies.push(pata(x, 0.0, 0.34, 0.085));
      const fuerte = rasgo('brazos-fuertes');
      for (const l of [-1, 1]) manos.push(brazo(l, [l * (fuerte ? 0.32 : 0.28), 0.74, 0.03], fuerte ? 0.5 : 0.36, fuerte ? 0.095 : 0.06));
      cab = [0, 0.86 + rc * 0.82, 0.04]; lomo = [0, 0.66, -0.25]; cola = [0, 0.3, -0.26]; torso = [0, 0.55, 0];
      forma = [1.04, 0.96, 1];
      break;
    }
    case 'ave': {
      esfera(F.color, [0, 0.44, -0.02], [0.33, 0.33, 0.4], [-0.35, 0, 0]);
      esfera(F.panza, [0, 0.4, 0.17], [0.25, 0.27, 0.17], undefined, false);
      for (const x of [-0.11, 0.11]) {
        palo('#d89030', [x, 0.12, 0.02], 0.026, 0.2, [0, 0, 0]);
        for (const k of [-0.5, 0, 0.5]) capsula('#d89030', [x + k * 0.05, 0.02, 0.07], 0.016, 0.08, [Math.PI / 2, k, 0], false);
      }
      cab = [0, 0.76 + rc * 0.42, 0.12]; lomo = [0, 0.6, -0.2]; cola = [0, 0.4, -0.4]; torso = [0, 0.44, -0.02];
      break;
    }
    case 'oruga': {
      [[-0.56, 0.13], [-0.38, 0.16], [-0.2, 0.18], [-0.02, 0.2]].forEach(([z, r], i) => {
        esfera(i % 2 ? F.color : claro, [0, r + 0.02, z], [r, r * 0.95, r * 1.05]);
        for (const l of [-1, 1]) esfera(F.panza, [l * r * 0.62, 0.04, z + 0.02], [0.04, 0.04, 0.04], undefined, false);
      });
      cab = [0, 0.38, 0.2]; rc = 0.25; lomo = [0, 0.42, -0.1]; cola = [0, 0.16, -0.68]; torso = [0, 0.2, -0.25];
      break;
    }
    case 'capullo': {
      esfera(F.color, [0, 0.52, 0], [0.3, 0.52, 0.28]);
      cono(F.color, [0, 1.08, -0.02], 0.1, 0.2);
      for (let i = 0; i < 5; i++) pieza(TORO, oscuro, [0, 0.16 + i * 0.16, 0], [0.29 - Math.abs(i - 2) * 0.045, 0.29 - Math.abs(i - 2) * 0.045, 0.6], [Math.PI / 2, 0, 0], cuerpo, false);
      cab = [0, 0.76, 0.02]; rc = 0.25; lomo = [0, 0.7, -0.25]; cola = [0, 0.1, -0.2]; torso = [0, 0.52, 0];
      break;
    }
    case 'mariposa': {
      capsula(F.color, [0, 0.52, 0], 0.1, 0.34);
      esfera(F.panza, [0, 0.48, 0.07], [0.08, 0.2, 0.05], undefined, false);
      cab = [0, 0.88, 0.04]; rc = 0.21 * cabezon; lomo = [0, 0.6, -0.08]; cola = [0, 0.26, 0]; torso = [0, 0.52, 0];
      for (const l of [-1, 1]) for (const y of [0.34, 0.5]) palo(oscuro, [l * 0.12, y, 0.06], 0.016, 0.18, [0.6, 0, l * 0.9]);
      break;
    }
    case 'marino': {
      esfera(F.color, [0, 0.36, -0.08], [0.39, 0.35, 0.56]);
      esfera(F.panza, [0, 0.28, 0.12], [0.31, 0.25, 0.4], undefined, false);
      esfera(F.color, [0, 0.2, -0.6], [0.24, 0.15, 0.28]);
      esfera(F.color, [0, 0.56, 0.32], [0.24, 0.25, 0.24]);
      cab = [0, 0.66 + rc * 0.25, 0.44]; lomo = [0, 0.7, -0.12]; cola = [0, 0.16, -0.82]; torso = [0, 0.36, -0.08];
      forma = [1.05, 0.95, 1.05];
      break;
    }
    case 'flotante': {
      esfera(F.color, [0, 0.74, 0], [0.37, 0.4, 0.35]);
      esfera(F.panza, [0, 0.64, 0.15], [0.27, 0.25, 0.21], undefined, false);
      cono(F.color, [0, 0.36, -0.06], 0.3, 0.42, [Math.PI + 0.25, 0, 0]);
      for (const l of [-1, 1]) { esfera(F.color, [l * 0.37, 0.66, 0.1], [0.09, 0.15, 0.09], [0, 0, l * 0.5]); manos.push([l * 0.42, 0.55, 0.14]); }
      cab = [0, 0.8, 0.04]; rc = 0.35; lomo = [0, 1.08, -0.05]; cola = [0, 0.2, -0.12]; torso = [0, 0.74, 0];
      break;
    }
    case 'serpiente': {
      const puntos: V[] = [];
      for (let i = 0; i <= 28; i++) { const t = i / 28; puntos.push([Math.sin(t * Math.PI * 1.7 + 0.4) * 0.32, 0.12 + t * 1.15, -0.42 + Math.sin(t * Math.PI * 1.2) * 0.3 + t * 0.25]); }
      puntos.forEach((p, i) => { const t = i / 28, r = 0.075 + Math.sin(t * Math.PI * 0.9) * 0.1 + t * 0.04; esfera(F.color, p, r, undefined, i % 2 === 0); if (i >= 18 && i % 2 === 0) esfera(F.panza, [p[0], p[1] - r * 0.1, p[2] + r * 0.45], [r * 0.72, r * 0.85, r * 0.6], undefined, false); });
      cab = [puntos[28][0], puntos[28][1] + 0.1, puntos[28][2] + 0.2]; rc = 0.25; lomo = puntos[21]; cola = puntos[0]; torso = puntos[16]; camino = puntos;
      forma = [0.95, 0.88, 1.22];
      for (const l of [-1, 1]) { const h = puntos[20]; capsula(F.color, [h[0] + l * 0.18, h[1] - 0.1, h[2] + 0.05], 0.045, 0.14, [0.6, 0, l * 0.8]); const m: V = [h[0] + l * 0.27, h[1] - 0.17, h[2] + 0.1]; manos.push(m); for (const k of [-1, 0, 1]) cono('#ffffff', mas(m, k * 0.03, -0.02, 0.03), 0.014, 0.06, [Math.PI / 2, 0, 0], false); }
      break;
    }
    case 'rana': {
      esfera(F.color, [0, 0.32, -0.05], [0.41, 0.29, 0.39]);
      esfera(F.panza, [0, 0.25, 0.14], [0.31, 0.21, 0.27], undefined, false);
      for (const l of [-1, 1]) {
        esfera(F.color, [l * 0.34, 0.18, -0.16], [0.15, 0.14, 0.27]);
        esfera(oscuro, [l * 0.37, 0.04, 0.07], [0.13, 0.04, 0.16], undefined, false);
        for (const k of [-1, 0, 1]) esfera(claro, [l * 0.37 + k * 0.06, 0.03, 0.22], 0.035, undefined, false);
        capsula(F.color, [l * 0.23, 0.13, 0.25], 0.06, 0.1);
        for (const k of [-1, 0, 1]) esfera(claro, [l * 0.24 + k * 0.04, 0.03, 0.33], 0.028, undefined, false);
      }
      cab = [0, 0.52, 0.2]; rc = 0.3 * cabezon; lomo = [0, 0.58, -0.12]; cola = [0, 0.2, -0.44]; torso = [0, 0.32, -0.05];
      forma = [1.28, 0.82, 1];
      break;
    }
  }

  // ── Cabeza ──
  const [hx, hy, hz] = cab;
  const hocicoLargo = rasgo('hocico-largo') || rasgo('hocico-fino');
  if (F.cuerpo === 'flotante' || F.cuerpo === 'capullo') { /* la cabeza es el mismo cuerpo */ }
  else esfera(rasgo('cabeza-clara') ? F.panza : F.color, cab, [rc * forma[0], rc * forma[1], rc * forma[2]]);
  const enCabeza = (yaw: number, pitch: number, d = 1): V => [hx + Math.sin(yaw) * Math.cos(pitch) * rc * d * forma[0], hy + Math.sin(pitch) * rc * d * forma[1], hz + Math.cos(yaw) * Math.cos(pitch) * rc * d * forma[2]];
  // Hocico: largo en los reptiles y dragones, corto y redondo en los mamíferos; con nariz
  const conHocico = hocicoLargo || rasgo('hocico') || ['cuadrupedo', 'marino'].includes(F.cuerpo);
  if (conHocico) {
    const fino = rasgo('hocico-fino'), largo = hocicoLargo ? 0.62 : 0.42, p = enCabeza(0, -0.32, 0.72 + largo * 0.4);
    esfera(hocicoLargo && !fino ? F.color : F.panza, p, [rc * (fino ? 0.32 : 0.46), rc * (fino ? 0.26 : 0.34), rc * largo]);
    if (fino) esfera('#2a1a22', mas(p, 0, rc * 0.06, rc * largo * 0.95), [rc * 0.08, rc * 0.06, rc * 0.06], undefined, false);
    if (hocicoLargo && !fino) esfera(F.panza, mas(p, 0, -rc * 0.14, rc * 0.04), [rc * 0.4, rc * 0.18, rc * largo * 0.9], undefined, false);
    if (!fino) for (const l of [-1, 1]) esfera('#2a1a22', mas(p, l * rc * 0.12, rc * 0.14, rc * largo * 0.92), rc * 0.045, undefined, false);
    if (!hocicoLargo && F.cuerpo !== 'marino') esfera('#2a1a22', mas(p, 0, rc * 0.18, rc * largo * 0.86), [rc * 0.11, rc * 0.08, rc * 0.07], undefined, false);
    pieza(CAPSULA, '#3a2028', mas(p, 0, -rc * 0.2, rc * largo * 0.75), [rc * 0.02, rc * 0.22, rc * 0.02], [0, 0, Math.PI / 2], cuerpo, false);
  }

  // ── Ojos: esclerótica, iris del color de su tipo, pupila, dos brillos y un párpado que da la expresión ──
  const grande = F.cuerpo === 'rana' ? 1.15 : sp.etapa === 1 ? 1.12 : 1;
  for (const l of [-1, 1]) {
    const yaw = l * (F.cuerpo === 'rana' ? 0.62 : conHocico ? 0.5 : 0.4), pitch = F.cuerpo === 'rana' ? 0.6 : conHocico ? 0.2 : 0.1;
    const p = enCabeza(yaw, pitch, F.cuerpo === 'rana' ? 1.02 : rasgo('mascara') ? 0.97 : 0.86), r = rc * 0.25 * grande;
    const ojo = new THREE.Group(); ojo.position.set(...p); ojo.lookAt(p[0] + (p[0] - hx), p[1] + (p[1] - hy) * 0.25, p[2] + (p[2] - hz) * 1.4); cuerpo.add(ojo);
    if (F.cuerpo === 'rana') esfera(F.color, [0, -r * 0.1, -r * 0.62], [r * 1.25, r * 1.25, r * 1.0], undefined, true, ojo);
    const alto = F.ojos === 'serenos' ? 0.85 : F.ojos === 'feroces' ? 0.95 : 1.12;
    esfera('#fbfaf2', [0, 0, 0], [r, r * alto, r * 0.5], undefined, true, ojo);
    esfera(rasgo('ojos-brillo') ? brillo(F.acento) : iris, [0, -r * 0.06, r * 0.3], [r * 0.74, r * 0.82 * alto, r * 0.3], undefined, false, ojo);
    esfera('#120c16', [0, -r * 0.06, r * 0.44], [r * 0.4, r * 0.5 * alto, r * 0.18], undefined, false, ojo);
    esfera(brillo('#ffffff'), [r * 0.22 * -l, r * 0.28 * alto, r * 0.58], [r * 0.2, r * 0.2, r * 0.08], undefined, false, ojo);
    esfera(brillo('#ffffff'), [-r * 0.2 * -l, -r * 0.3 * alto, r * 0.55], [r * 0.09, r * 0.09, r * 0.05], undefined, false, ojo);
    // Párpado de su mismo color: caído hacia adentro (fiero) o a media altura (sereno)
    if (F.ojos === 'feroces') esfera(F.cuerpo === 'flotante' ? F.color : F.color, [0, r * 0.78 * alto, r * 0.06], [r * 1.22, r * 0.5, r * 0.62], [0, 0, l * 0.42], false, ojo);
    if (F.ojos === 'serenos') esfera(F.color, [0, r * 0.62, r * 0.06], [r * 1.18, r * 0.5, r * 0.62], [0, 0, -l * 0.08], false, ojo);
  }
  // Boca: una línea suave (sin la sonrisa de dibujo); los fieros de fuego, dragón y lucha muestran colmillos
  if (!conHocico && F.cuerpo !== 'capullo') {
    const p = enCabeza(0, F.cuerpo === 'rana' ? 0.0 : -0.36, 0.98);
    pieza(ARCO, '#3a2028', mas(p, 0, rc * 0.2, 0), [rc * 0.2, rc * 0.2, rc * 0.2], [0, 0, -Math.PI / 2 - 0.65], cuerpo, false);
  }
  if (F.ojos === 'feroces' && (sp.tipos.includes('fuego') || sp.tipos.includes('dragon'))) {
    const p = conHocico ? enCabeza(0, -0.48, 1.12) : enCabeza(0, -0.42, 0.96);
    for (const l of [-1, 1]) cono('#ffffff', mas(p, l * rc * 0.12, -rc * 0.04, 0), rc * 0.04, rc * 0.12, [Math.PI, 0, 0], false);
  }

  // ── Rasgos ──
  const flama = (p: V, tam: number) => {
    const g = new THREE.Group(); g.position.set(...p); cuerpo.add(g);
    pieza(ESFERA, brillo('#ff6a1a'), [0, tam * 0.2, 0], [tam * 0.36, tam * 0.3, tam * 0.36], [0, 0, 0], g, false);
    for (const [x, z, h, inc] of [[0, 0, 1, 0], [-0.16, 0.05, 0.72, 0.45], [0.17, -0.04, 0.66, -0.5], [0.04, -0.16, 0.58, 0.2]]) pieza(CONO, brillo('#ff6a1a'), [x * tam, tam * (0.2 + h * 0.42), z * tam], [tam * 0.26, tam * h, tam * 0.26], [z * 2, 0, inc], g, false);
    pieza(CONO, brillo('#ffb020'), [0, tam * 0.4, tam * 0.05], [tam * 0.22, tam * 0.65, tam * 0.22], [0, 0, 0], g, false);
    pieza(CONO, brillo('#fff2a0'), [0, tam * 0.3, tam * 0.1], [tam * 0.12, tam * 0.4, tam * 0.12], [0, 0, 0], g, false);
    llamas.push(g);
  };
  /** Cola en cadena de esferas que se afinan; devuelve la punta. */
  const colaCadena = (n2: number, r: number, sube: number, color = F.color): V => {
    let p = cola;
    for (let i = 0; i < n2; i++) { p = [p[0], p[1] + sube * (i + 1) * 0.45, p[2] - r * 1.15]; esfera(color, p, r * (1 - i * 0.17)); }
    return p;
  };
  for (const r of F.rasgos) switch (r) {
    case 'mejillas': for (const l of [-1, 1]) esfera(tono('#ff8a7a', 0.15), enCabeza(l * 0.78, -0.22, 0.95), [rc * 0.16, rc * 0.1, rc * 0.05], [0, l * 0.78, 0], false); break;
    case 'llamas-lomo': for (let i = 0; i < 3; i++) flama(mas(lomo, 0, 0.04 - i * 0.05, 0.14 - i * 0.18), 0.32 - i * 0.06); break;
    case 'cola-larga': colaCadena(4, 0.085, 0.06); break;
    case 'cola-llama': flama(colaCadena(4, 0.1, 0.08), 0.3); break;
    case 'cola-corta': esfera(F.color, cola, 0.08); break;
    case 'cola-esponjosa': {
      const c0 = mas(cola, 0, 0.3, -0.22);
      esfera(F.color, c0, [0.2, 0.4, 0.22], [-0.55, 0, 0]);
      esfera(F.color, mas(c0, 0, 0.26, 0.06), [0.18, 0.2, 0.18]);
      esfera(F.panza, mas(c0, 0, 0.36, 0.14), [0.13, 0.13, 0.13], undefined, false);
      break;
    }
    case 'cola-aleta': { const p = colaCadena(2, 0.09, 0.12); esfera(F.acento, mas(p, 0, 0.1, -0.08), [0.035, 0.22, 0.17], [0.4, 0, 0]); break; }
    case 'cola-anillos': { let p = cola; for (let i = 0; i < 6; i++) { p = mas(p, 0, 0.08, -0.08); esfera(i % 2 ? F.acento : F.color, p, 0.12 - i * 0.008); } break; }
    case 'cola-plumas': for (const l of [-1, -0.5, 0, 0.5, 1]) esfera(l === 0 ? F.acento : tono(F.color, -0.15), mas(cola, l * 0.09, 0.02, -0.17), [0.065, 0.025, 0.28], [0.2, l * 0.35, 0]); break;
    case 'cola-espiritu': cono(F.color, mas(cola, 0.05, 0, -0.04), 0.16, 0.36, [Math.PI + 0.6, 0, 0.4]); break;
    case 'cresta': for (let i = 0; i < 3; i++) cono(F.acento, enCabeza(Math.PI, 1.25 - i * 0.3, 0.95), rc * 0.13, rc * (0.7 - i * 0.14), [-0.7 - i * 0.3, 0, 0]); break;
    case 'garras': for (const p of [...manos, ...pies]) for (const k of [-1, 0, 1]) cono('#fff6e0', mas(p, k * 0.035, -0.01, 0.03), 0.018, 0.06, [Math.PI / 2, 0, 0], false); break;
    case 'cuernos': for (const l of [-1, 1]) { cono(tono(F.panza, -0.05), enCabeza(l * 0.42, 0.7, 0.98), rc * 0.12, rc * 0.85, [-0.75, 0, l * -0.3]); } break;
    case 'melena': for (let i = 0; i < 7; i++) { const a = -1.2 + (i / 6) * 2.4; cono(F.acento, enCabeza(a, 0.2 + Math.cos(a) * 0.15, 0.82), rc * 0.16, rc * 0.7, [-1.1, a * 0.6, 0]); } break;
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
    case 'orejas-puntas': for (const l of [-1, 1]) { cono(F.color, enCabeza(l * 0.5, 0.78, 0.92), rc * 0.26, rc * 0.95, [0, 0, -l * 0.38]); cono(tono(F.panza, -0.1), enCabeza(l * 0.5, 0.76, 0.99), rc * 0.13, rc * 0.55, [0.12, 0, -l * 0.38], false); cono(F.acento, enCabeza(l * 0.62, 1.08, 0.98), rc * 0.12, rc * 0.3, [0, 0, -l * 0.38], false); } break;
    case 'orejas-redondas': for (const l of [-1, 1]) { esfera(F.color, enCabeza(l * 0.68, 0.66, 0.95), [rc * 0.28, rc * 0.28, rc * 0.11]); esfera(tono(F.panza, -0.08), enCabeza(l * 0.68, 0.66, 1.01), [rc * 0.16, rc * 0.16, rc * 0.05], undefined, false); } break;
    case 'orejas-largas': for (const l of [-1, 1]) { esfera(F.color, enCabeza(l * 0.95, 0.38, 1.08), [rc * 0.56, rc * 0.16, rc * 0.26], [0, 0, l * 0.35]); esfera(tono(F.panza, -0.05), enCabeza(l * 0.95, 0.38, 1.12), [rc * 0.4, rc * 0.08, rc * 0.16], [0, 0, l * 0.35], false); } break;
    case 'orejas-zorro': for (const l of [-1, 1]) { cono(F.color, enCabeza(l * 0.48, 0.76, 0.9), rc * 0.3, rc * 0.88, [0, 0, -l * 0.32]); cono(F.panza, enCabeza(l * 0.48, 0.74, 0.97), rc * 0.17, rc * 0.55, [0.12, 0, -l * 0.32], false); cono(oscuro, enCabeza(l * 0.48, 0.98, 0.96), rc * 0.14, rc * 0.28, [0, 0, -l * 0.32], false); } break;
    case 'orejas-aleta': for (const l of [-1, 1]) { esfera(tono(F.color, 0.3), enCabeza(l * 1.25, 0.35, 0.95), [rc * 0.08, rc * 0.42, rc * 0.3], [0.7, 0, l * 0.35]); esfera(tono(F.color, 0.55), enCabeza(l * 1.25, 0.32, 1.0), [rc * 0.05, rc * 0.28, rc * 0.18], [0.7, 0, l * 0.35], false); } break;
    case 'manchas': for (let i = 0; i < 6; i++) esfera(F.panza, mas(lomo, Math.sin(i * 2.4) * 0.16, -0.02 - (i % 2) * 0.05, Math.cos(i * 1.7) * 0.2), [0.05, 0.022, 0.05], undefined, false); break;
    case 'hojas-cuello': for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; esfera(i % 2 ? '#7ac74c' : '#5aa83a', [Math.sin(a) * rc * 0.95 + hx, hy - rc * 0.82, Math.cos(a) * rc * 0.82 + hz - 0.05], [0.11, 0.032, 0.06], [0, a, 0.5]); } break;
    case 'orbe': { esfera(brillo(F.acento), enCabeza(0, 0.42, 1.0), rc * 0.14); esfera(brillo('#ffffff'), enCabeza(0.05, 0.47, 1.12), rc * 0.04, undefined, false); break; }
    case 'antenas': case 'antenas-chispa': for (const l of [-1, 1]) {
      const base = enCabeza(l * 0.3, 0.88, 0.95);
      palo(oscuro, mas(base, l * 0.05, 0.12, 0.02), 0.013, 0.26, [0.2, 0, -l * 0.35]);
      esfera(r === 'antenas-chispa' ? brillo('#bff0ff') : F.acento, mas(base, l * 0.1, 0.25, 0.05), 0.042, undefined, r !== 'antenas-chispa');
    } break;
    case 'membrana': for (const l of [-1, 1]) esfera(tono(F.acento, 0.1), mas(torso, l * 0.32, -0.04, -0.03), [0.05, 0.27, 0.19], [0, 0, l * 0.15]); break;
    case 'pico-gancho': { const p = enCabeza(0, -0.05, 0.98); cono('#f2c03a', p, rc * 0.2, rc * 0.42, [Math.PI / 2 + 0.5, 0, 0]); cono('#3a3030', mas(p, 0, -rc * 0.14, rc * 0.14), rc * 0.08, rc * 0.18, [Math.PI - 0.2, 0, 0], false); break; }
    case 'pico': { const p = enCabeza(0, -0.12, 0.98); cono('#f0a030', p, rc * 0.2, rc * 0.52, [Math.PI / 2, 0, 0]); cono('#c87a20', mas(p, 0, -rc * 0.06, -rc * 0.02), rc * 0.15, rc * 0.36, [Math.PI / 2 + 0.25, 0, 0], false); break; }
    case 'antifaz': for (const l of [-1, 1]) esfera(F.acento, enCabeza(l * 0.42, 0.08, 0.86), [rc * 0.35, rc * 0.24, rc * 0.2], [0, l * 0.4, 0], false); break;
    case 'alas-plumas': for (const l of [-1, 1]) {
      const ala = new THREE.Group(); ala.position.set(l * 0.3, torso[1] + 0.1, torso[2] - 0.02); cuerpo.add(ala);
      esfera(F.color, [l * 0.06, -0.02, -0.06], [0.1, 0.24, 0.17], [0.4, 0, l * 0.25], true, ala);
      for (let k = 0; k < 4; k++) esfera(k % 2 ? oscuro : tono(F.color, -0.15), [l * 0.08, -0.14 - k * 0.02, -0.14 - k * 0.07], [0.05, 0.17, 0.06], [0.9, 0, l * 0.2], false, ala);
      alas.push({ o: ala, base: 0, eje: 'z' });
    } break;
    case 'alas-membrana': for (const l of [-1, 1]) {
      const ala = new THREE.Group(); ala.position.set(l * 0.18, lomo[1] + 0.06, lomo[2]); cuerpo.add(ala);
      const forma2 = new THREE.Shape(), pt = (x: number, y: number): [number, number] => [l * x, y];
      forma2.moveTo(...pt(0, 0)); forma2.lineTo(...pt(0.52, 0.5)); forma2.lineTo(...pt(0.95, 0.12));
      forma2.quadraticCurveTo(...pt(0.78, 0.08), ...pt(0.7, -0.1)); forma2.quadraticCurveTo(...pt(0.56, -0.02), ...pt(0.42, -0.2)); forma2.quadraticCurveTo(...pt(0.26, -0.06), ...pt(0.06, -0.12)); forma2.lineTo(...pt(0, 0));
      const tela = new THREE.Mesh(new THREE.ShapeGeometry(forma2, 6), guardar(`m${F.color}`, () => new THREE.MeshToonMaterial({ color: tono(F.color, 0.3), gradientMap: GRADIENTE, side: THREE.DoubleSide })));
      tela.rotation.y = l * 0.35; ala.add(tela);
      const hueso = (a: [number, number], b: [number, number], g: number) => { const dx = b[0] - a[0], dy = b[1] - a[1], largo = Math.hypot(dx, dy); const h = pieza(CILINDRO, oscuro, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.005], [g, largo, g], [0, 0, Math.atan2(-dx, dy)], tela, false); return h; };
      const codo = pt(0.52, 0.5);
      hueso(pt(0, 0), codo, 0.028); for (const d of [pt(0.95, 0.12), pt(0.7, -0.1), pt(0.42, -0.2)]) hueso(codo, d, 0.014);
      pieza(CONO, '#fff6e0', [codo[0], codo[1] + 0.04, 0], [0.025, 0.08, 0.025], [0, 0, -l * 0.3], tela, false);
      alas.push({ o: ala, base: 0, eje: 'z' });
    } break;
    case 'alas-cristal': for (const l of [-1, 1]) for (const [y, s] of [[0.66, 1], [0.38, 0.72]] as [number, number][]) {
      const ala = new THREE.Group(); ala.position.set(l * 0.06, y, -0.04); cuerpo.add(ala);
      esfera(vidrio(F.acento), [l * 0.3 * s, 0.05 * s, 0], [0.32 * s, 0.26 * s, 0.012], [0, 0, l * 0.3], false, ala);
      pieza(TORO, F.color, [l * 0.3 * s, 0.05 * s, 0], [0.32 * s, 0.26 * s, 0.5], [0, 0, l * 0.3], ala, false);
      for (const k of [0.4, 0.75]) pieza(CILINDRO, F.color, [l * 0.3 * s * k, 0.05 * s * k, 0], [0.008, 0.3 * s, 0.008], [0, 0, l * (0.3 + 1.2)], ala, false);
      esfera(brillo(F.panza), [l * 0.42 * s, 0.12 * s, 0.01], 0.035 * s, undefined, false, ala);
      alas.push({ o: ala, base: 0, eje: 'y' });
    } break;
    case 'caparazon': {
      const enLomo = F.cuerpo === 'bipedo';
      const centro: V = enLomo ? [0, 0.6, -0.18] : [0, 0.52, -0.05];
      pieza(MEDIA, F.acento, centro, enLomo ? [0.35, 0.42, 0.28] : [0.46, 0.33, 0.56], enLomo ? [-Math.PI / 2, 0, 0] : [0, 0, 0]);
      if (enLomo) pieza(TORO, F.panza, centro, [0.35, 0.42, 0.45], [0, 0, 0], cuerpo, false);
      // Placas del caparazón: una central y cinco alrededor
      const placa = tono(F.acento, -0.18);
      if (enLomo) { esfera(placa, [0, 0.62, -0.47], [0.12, 0.14, 0.02], undefined, false); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; esfera(placa, [Math.cos(a) * 0.22, 0.62 + Math.sin(a) * 0.26, -0.42], [0.07, 0.07, 0.02], undefined, false); } }
      else { esfera(placa, [0, 0.85, -0.05], [0.14, 0.02, 0.16], undefined, false); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; esfera(placa, [Math.cos(a) * 0.27, 0.78, -0.05 + Math.sin(a) * 0.32], [0.08, 0.02, 0.09], undefined, false); } }
      break;
    }
    case 'canones': for (const l of [-1, 1]) { palo('#8a8f9c', [l * 0.24, 0.98, -0.2], 0.065, 0.42, [0.95, 0, 0], true); esfera('#3a3f4a', [l * 0.24, 1.15, -0.02], [0.06, 0.06, 0.03], undefined, false); pieza(TORO, '#5a5f6a', [l * 0.24, 1.14, -0.03], [0.07, 0.07, 0.3], [0.95, 0, 0], cuerpo, false); } break;
    case 'placas': for (let i = 0; i < 5; i++) pieza(new THREE.TorusGeometry(1, 0.15, 8, 22, Math.PI), i % 2 ? tono(F.acento, -0.12) : F.acento, [0, torso[1] + 0.08, torso[2] + 0.32 - i * 0.16], [0.36, 0.3, 0.5], [0, 0, 0], cuerpo, true); break;
    case 'espinas-lomo': for (let i = 0; i < 4; i++) cono(F.acento, mas(lomo, 0, 0.04 - Math.abs(i - 1.5) * 0.03, 0.18 - i * 0.13), 0.06, 0.2, [-0.3, 0, 0]); break;
    case 'espinas-hielo': for (let i = 0; i < 4; i++) cono(vidrio('#d8f4ff'), mas(lomo, (i % 2 ? 1 : -1) * 0.08, 0.02, 0.12 - i * 0.12), 0.07, 0.26, [-0.2, 0, (i % 2 ? -1 : 1) * 0.3], false); break;
    case 'bigotes': case 'bigotes-dragon': for (const l of [-1, 1]) for (const k of r === 'bigotes' ? [-1, 0, 1] : [0]) {
      const p = enCabeza(l * 0.3, -0.38, 1.08), largo = r === 'bigotes' ? 0.17 : 0.5;
      palo(r === 'bigotes' ? '#f4f4f4' : F.acento, mas(p, l * largo * 0.45, k * 0.025 - (r === 'bigotes' ? 0 : 0.1), 0.02), 0.008, largo, [0, 0, l * (Math.PI / 2 - 0.25 + k * 0.12)]);
    } break;
    case 'colmillos': for (const l of [-1, 1]) cono('#ffffff', enCabeza(l * 0.16, -0.7, 1.05), rc * 0.07, rc * 0.6, [Math.PI, 0, 0]); break;
    case 'aletas': for (const l of [-1, 1]) { esfera(F.color, mas(torso, l * 0.37, -0.22, 0.26), [0.17, 0.04, 0.12], [0, l * 0.4, l * 0.3]); esfera(F.color, mas(cola, l * 0.13, 0, -0.06), [0.14, 0.03, 0.09], [0, l * 0.5, 0]); } break;
    case 'cara-mono': esfera(F.panza, enCabeza(0, -0.05, 0.6), [rc * 0.78 * forma[0], rc * 0.7, rc * 0.45], undefined, false); break;
    case 'orejas-lado': for (const l of [-1, 1]) { esfera(F.color, enCabeza(l * 1.45, 0.12, 0.98), [rc * 0.1, rc * 0.27, rc * 0.25], [0, l * 0.2, 0]); esfera(F.panza, enCabeza(l * 1.42, 0.12, 1.04), [rc * 0.05, rc * 0.17, rc * 0.15], [0, l * 0.2, 0], false); } break;
    case 'ceja': esfera(oscuro, enCabeza(0, 0.38, 0.86), [rc * 0.72, rc * 0.16, rc * 0.3], undefined, false); break;
    case 'mascara': for (const l of [-1, 1]) esfera(F.acento, enCabeza(l * 0.42, 0.1, 0.95), [rc * 0.4, rc * 0.28, rc * 0.09], [0, l * 0.42, l * -0.2], false); break;
    case 'guantes': for (const p of manos) { esfera(F.acento, p, 0.125); pieza(TORO, '#fff6e0', mas(p, 0, 0.06, -0.04), [0.1, 0.1, 0.5], [Math.PI / 2 - 0.4, 0, 0], cuerpo, false); } break;
    case 'cinturon': { pieza(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true), guardar(`d${F.acento}`, () => new THREE.MeshToonMaterial({ color: F.acento, gradientMap: GRADIENTE, side: THREE.DoubleSide })), [0, 0.44, 0], [0.345, 0.09, 0.305], [0, 0, 0], cuerpo, false); esfera('#ffd23c', [0, 0.44, 0.3], [0.08, 0.07, 0.03]); break; }
    case 'bolsa-garganta': esfera(F.acento, enCabeza(0, -0.78, 0.82), [rc * 0.55, rc * 0.42, rc * 0.42]); break;
    case 'farol': {
      // Un farol en la mano: argolla, armazón de fierro y una llama adentro
      const m = manos[1] ?? mas(torso, 0.4, -0.2, 0.15), base = mas(m, 0.02, -0.22, 0.04);
      palo('#3a2f2a', mas(m, 0.01, -0.06, 0.02), 0.012, 0.12, [0, 0, 0]);
      pieza(CILINDRO, vidrio('#ffe0a0'), base, [0.08, 0.16, 0.08], [0, 0, 0], cuerpo, false);
      for (const y of [0.09, -0.09]) palo('#3a2f2a', mas(base, 0, y, 0), 0.095, 0.025, [0, 0, 0]);
      flama(mas(base, 0, -0.06, 0), 0.12);
      break;
    }
    case 'llama-farol': flama(mas(lomo, 0, -0.02, 0), 0.3); break;
    case 'nubes': for (const i of [3, 12]) for (let k = 0; k < 4; k++) { const p = camino[i]; esfera('#ffffff', mas(p, (k - 1.5) * 0.12, -0.08 + (k % 2) * 0.05, 0.05), 0.09 + (k % 2) * 0.03); } break;
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
  b.cuerpo.scale.y = b.cuerpo.scale.x * (1 + Math.sin(t * 2.6 + fase) * 0.018);
  b.cuerpo.position.y = base + (b.flota ? Math.sin(t * 1.8 + fase) * b.alto * 0.035 : 0);
  b.cuerpo.rotation.z = Math.sin(t * 1.3 + fase) * 0.015;
  for (const [i, l] of b.llamas.entries()) l.scale.set(1 + Math.sin(t * 17 + i) * 0.1, 1 + Math.sin(t * 13 + i * 2) * 0.2, 1);
  for (const [i, a] of b.alas.entries()) { const v = Math.sin(t * (b.flota ? 9 : 3.5) + fase + (i % 2) * 0.2) * (b.flota ? 0.42 : 0.14); if (a.eje === 'z') a.o.rotation.z = (a.o.position.x > 0 ? 1 : -1) * v; else a.o.rotation.y = (a.o.position.x > 0 ? -1 : 1) * v; }
}
