import * as THREE from 'three';
import { fundir } from '../nucleo/fundir';
import type { Apariencia } from './catalogo';
import { dibujarCara, sombra } from './cara';

// Personaje 3D armado con figuras simples. Origen en los pies, mira hacia +Z, mide cerca de 1,8 unidades.
const R = 0.4; // radio de la cabeza
const PI = Math.PI;
// Forma de la cabeza: [ancho, alto, fondo, mandíbula]. Mandíbula > 0 afina el mentón, < 0 lo ensancha.
const FORMAS = [[1, 1, 1, 0.12], [0.92, 1.1, 0.95, 0.22], [1.1, 0.96, 1, 0.1], [1.04, 0.88, 1, 0.05], [1.03, 0.98, 1, -0.1], [1.05, 1.02, 0.98, 0.42], [0.88, 1.18, 0.94, 0.18], [0.94, 1, 0.98, -0.28]];
const CUBREN = new Set([1, 4, 12, 14, 15]); // sombreros que tapan el pelo de arriba
const MANGA_LARGA = new Set([2, 3, 7, 8, 11]);

// Material mate con volumen: recibe luz suave y sombras, como una figura de arcilla.
const toon = (color: string, doble = false) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, side: doble ? THREE.DoubleSide : THREE.FrontSide });
const luz = (color: string) => new THREE.MeshBasicMaterial({ color });

function pieza(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  return o;
}
const esfera = (r: number, ws = 18, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
const cilindro = (r1: number, r2: number, h: number, seg = 16) => new THREE.CylinderGeometry(r1, r2, h, seg);
const capsula = (r: number, largo: number) => new THREE.CapsuleGeometry(r, largo, 4, 10);
const caja = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

function casquete(r: number, theta: number, inclinacion: number, m: THREE.Material): THREE.Mesh {
  const o = pieza(new THREE.SphereGeometry(r, 28, 16, 0, PI * 2, 0, theta), m);
  o.rotation.x = inclinacion;
  return o;
}
// En SphereGeometry el frente (+Z) está en phi = π/2 y la nuca en phi = 3π/2.
const sector = (r: number, phi0: number, phiL: number, thetaL: number, m: THREE.Material) =>
  pieza(new THREE.SphereGeometry(r, 24, 16, phi0, phiL, 0, thetaL), m);

function geoCabeza(mandibula: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(R, 40, 28), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / R;
    if (y < 0) {
      p.setX(i, p.getX(i) * (1 - mandibula * y * y));
      p.setZ(i, p.getZ(i) * (1 - mandibula * 0.6 * y * y));
    }
  }
  g.computeVertexNormals();
  return g;
}

function ponerPelo(cabeza: THREE.Group, tipo: number, m: THREE.Material, cubierto: boolean) {
  const tapa = (incl = -0.42, r = R * 1.05, theta = 0.5 * PI) => { if (!cubierto) cabeza.add(casquete(r, theta, incl, m)); };
  const adorno = (o: THREE.Object3D) => { if (!cubierto) cabeza.add(o); };
  const nuca = (thetaL: number) => cabeza.add(sector(R * 1.06, PI - 0.45, PI + 0.9, thetaL, m));
  switch (tipo) {
    case 1: tapa(); break;
    case 2: tapa(); cabeza.add(sector(R * 1.07, PI / 2 - 0.8, 1.6, 0.36 * PI, m)); break;
    case 3: tapa(-0.35); nuca(0.78 * PI); break;
    case 4: {
      tapa(-0.35); nuca(0.8 * PI);
      const caida = pieza(new THREE.CapsuleGeometry(R * 0.62, R * 1.1, 4, 12), m, 0, -R * 0.75, -R * 0.55);
      caida.scale.set(1.25, 1, 0.55);
      cabeza.add(caida);
      break;
    }
    case 5: {
      tapa();
      cabeza.add(pieza(esfera(R * 0.28), m, 0, R * 0.35, -R * 1.05));
      const cola = pieza(capsula(R * 0.16, R * 0.7), m, 0, -R * 0.2, -R * 1.28);
      cola.rotation.x = 0.45;
      cabeza.add(cola);
      break;
    }
    case 6:
      tapa();
      for (const s of [-1, 1]) { const c = pieza(esfera(R * 0.34), m, s * R * 1.05, -R * 0.3, -R * 0.2); c.scale.set(1, 1.5, 1); cabeza.add(c); }
      break;
    case 7:
      tapa();
      for (const s of [-1, 1]) adorno(pieza(esfera(R * 0.33), m, s * R * 0.62, R * 0.95, -R * 0.1));
      break;
    case 8: { const afro = casquete(R * 1.38, 0.6 * PI, -0.5, m); afro.position.y = R * 0.05; adorno(afro); break; }
    case 9: { const cresta = pieza(esfera(R), m, 0, R * 0.62, -R * 0.1); cresta.scale.set(0.16, 0.62, 1); adorno(cresta); break; }
    case 10: {
      tapa();
      const arriba = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * PI * 2;
        const dir = new THREE.Vector3(Math.sin(ang) * 0.62, 0.8, Math.cos(ang) * 0.62 - 0.25).normalize();
        const punta = pieza(new THREE.ConeGeometry(R * 0.2, R * 0.55, 8), m);
        punta.position.copy(dir).multiplyScalar(R * 1.12);
        punta.quaternion.setFromUnitVectors(arriba, dir);
        adorno(punta);
      }
      break;
    }
    case 11: tapa(-0.2, R * 1.07, 0.52 * PI); break;
    case 12:
      tapa(-0.35); nuca(0.6 * PI);
      for (const s of [-1, 1]) cabeza.add(pieza(capsula(R * 0.13, R * 0.9), m, s * R * 0.84, -R * 0.75, R * 0.22));
      break;
    case 13: tapa(-0.42, R * 1.012); break;
    case 14: { tapa(); const copete = pieza(esfera(R * 0.42), m, 0, R * 0.84, R * 0.5); copete.scale.set(1.15, 0.8, 1.1); adorno(copete); break; }
    case 15:
      for (let i = 0; i < 26; i++) {
        const th = (0.1 + 0.5 * ((i * 0.618) % 1)) * PI, ph = i * 2.4;
        const dir = new THREE.Vector3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
        if (dir.z > 0.45 && dir.y < 0.6) continue; // deja la cara despejada
        adorno(pieza(esfera(R * 0.3, 10, 8), m, dir.x * R, dir.y * R, dir.z * R));
      }
      break;
    case 16: tapa(); adorno(pieza(esfera(R * 0.3), m, 0, R * 1.12, -R * 0.3)); break;
    case 17: tapa(-0.35); cabeza.add(sector(R * 1.07, PI - 1.15, PI + 2.3, 0.72 * PI, m)); break;
    case 18: tapa(); cabeza.add(sector(R * 1.075, PI / 2 - 0.2, 1.3, 0.4 * PI, m)); break;
    case 19:
      tapa(-0.35);
      for (let i = 0; i < 9; i++) {
        const ph = PI - 0.6 + (i / 8) * (PI + 1.2);
        cabeza.add(pieza(capsula(R * 0.09, R * 0.95), m, -Math.cos(ph) * R, -R * 0.45, Math.sin(ph) * R));
      }
      break;
  }
}

export function ponerSombrero(cabeza: THREE.Group, tipo: number, color: string) {
  const m = toon(color, true);
  const cil = (r1: number, r2: number, h: number, y: number, abierto = false, mat: THREE.Material = m) =>
    cabeza.add(pieza(new THREE.CylinderGeometry(r1, r2, h, 24, 1, abierto), mat, 0, y, 0));
  switch (tipo) {
    case 1: {
      cabeza.add(casquete(R * 1.1, 0.5 * PI, -0.25, m));
      const visera = pieza(caja(R * 1.05, 0.03, R * 0.7), m, 0, R * 0.3, R * 1.18);
      visera.rotation.x = 0.18;
      cabeza.add(visera);
      break;
    }
    case 2: cil(R * 0.98, R * 0.98, 0.04, R * 0.8); cil(R * 0.6, R * 0.6, R * 1.0, R * 1.3); break;
    case 3:
      cil(R * 0.62, R * 0.62, R * 0.32, R * 1.02, true);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * PI * 2;
        cabeza.add(pieza(new THREE.ConeGeometry(R * 0.12, R * 0.3, 6), m, Math.sin(ang) * R * 0.62, R * 1.32, Math.cos(ang) * R * 0.62));
      }
      break;
    case 4:
      cabeza.add(casquete(R * 1.1, 0.5 * PI, -0.3, m));
      cabeza.add(pieza(esfera(R * 0.2), toon('#f3ecdc'), 0, R * 1.12, -R * 0.34));
      break;
    case 5:
      cil(R * 1.4, R * 1.4, 0.04, R * 0.78);
      cabeza.add(pieza(new THREE.ConeGeometry(R * 0.72, R * 1.5, 24), m, 0, R * 1.53, 0));
      break;
    case 6:
      for (const s of [-1, 1]) { const c = pieza(new THREE.ConeGeometry(R * 0.16, R * 0.55, 10), m, s * R * 0.58, R * 0.98, 0); c.rotation.z = -s * 0.4; cabeza.add(c); }
      break;
    case 7: {
      const aro = pieza(new THREE.TorusGeometry(R * 0.55, 0.03, 8, 28), luz('#ffe08a'), 0, R * 1.42, 0);
      aro.rotation.x = PI / 2;
      cabeza.add(aro);
      break;
    }
    case 8:
      for (const s of [-1, 1]) { const o = pieza(new THREE.ConeGeometry(R * 0.26, R * 0.44, 4), m, s * R * 0.55, R * 0.98, 0); o.rotation.z = -s * 0.25; cabeza.add(o); }
      break;
    case 9:
      for (const s of [-1, 1]) { const l = pieza(esfera(R * 0.26), m, s * R * 0.3, R * 1.08, 0); l.scale.set(1.2, 0.8, 0.5); cabeza.add(l); }
      cabeza.add(pieza(esfera(R * 0.12), m, 0, R * 1.08, 0));
      break;
    case 10: {
      const zapallo = pieza(esfera(R * 0.6), toon('#ff8a1e'), 0, R * 1.3, 0);
      zapallo.scale.set(1.2, 0.8, 1.2);
      cabeza.add(zapallo);
      cabeza.add(pieza(cilindro(R * 0.07, R * 0.1, R * 0.3, 8), toon('#3f9d6b'), 0, R * 1.85, 0));
      break;
    }
    case 11: cil(R * 1.55, R * 1.55, 0.04, R * 0.8); cil(R * 0.52, R * 0.68, R * 0.8, R * 1.2); break;
    case 12:
      cabeza.add(casquete(R * 1.08, 0.42 * PI, -0.3, m));
      for (const s of [-1, 1]) cabeza.add(pieza(esfera(R * 0.16), m, s * R * 0.14, R * 0.42, -R * 1.08));
      break;
    case 13: {
      const banda = pieza(new THREE.TorusGeometry(R * 1.06, 0.035, 8, 24, PI), toon('#2b3047'));
      cabeza.add(banda);
      for (const s of [-1, 1]) { const copa = pieza(cilindro(R * 0.32, R * 0.32, 0.13, 20), m, s * R * 1.06, -R * 0.02, 0); copa.rotation.z = PI / 2; cabeza.add(copa); }
      break;
    }
    case 14:
      cabeza.add(casquete(R * 1.13, 0.55 * PI, -0.2, m));
      cabeza.add(pieza(caja(R * 0.18, R * 0.06, R * 2.1), toon('#f3ecdc'), 0, R * 1.12, -R * 0.2));
      break;
    case 15: {
      const blanco = toon('#f3ecdc');
      cil(R * 0.82, R * 0.86, R * 0.4, R * 0.95, false, blanco);
      const globo = pieza(esfera(R * 0.78), blanco, 0, R * 1.5, 0);
      globo.scale.set(1.2, 0.75, 1.2);
      cabeza.add(globo);
      break;
    }
    case 16:
      for (const s of [-1, 1]) {
        const tallo = pieza(cilindro(0.012, 0.012, R * 0.7, 6), toon('#2b3047'), s * R * 0.4, R * 1.25, 0);
        tallo.rotation.z = -s * 0.3;
        cabeza.add(tallo);
        cabeza.add(pieza(esfera(R * 0.13, 10, 8), m, s * R * 0.5, R * 1.6, 0));
      }
      break;
  }
}

export interface Partes { cabeza: THREE.Group; brazoI: THREE.Group; brazoD: THREE.Group; piernaI: THREE.Group; piernaD: THREE.Group }

const PERFIL_TORSO: [number, number][] = [[0, 0.3], [0.16, 0.3], [0.2, 0.4], [0.195, 0.58], [0.235, 0.8], [0.215, 0.9], [0.1, 0.97], [0, 0.975]];
function radioTorso(y: number): number {
  for (let i = 2; i < PERFIL_TORSO.length - 1; i++) {
    const [r0, y0] = PERFIL_TORSO[i - 1], [r1, y1] = PERFIL_TORSO[i];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0.1;
}

/** `detalle` es el ancho del lienzo de la cara: 1024 en el creador, 512 en la isla. */
export function crearPersonaje(a: Apariencia, detalle = 1024): THREE.Group {
  const grupo = new THREE.Group();
  const c = 0.85 + a.contextura * 0.35;
  const piel = toon(a.piel);
  const ropa = toon(a.colorRopa);
  const ropa2 = toon(a.colorRopa2);
  const negro = toon('#1f1b2b');
  const blanco = toon('#f3ecdc');
  const pantalon = toon(a.ropa === 5 ? a.piel : a.colorPantalon);
  const frente = (y: number) => radioTorso(y) * c * 0.8; // dónde queda el pecho a esa altura

  // Torso
  const mTorso = a.ropa === 4 ? ropa2 : a.ropa === 11 ? negro : ropa;
  const torso = pieza(new THREE.LatheGeometry(PERFIL_TORSO.map(([r, y]) => new THREE.Vector2(r, y)), 24), mTorso);
  torso.scale.set(c, 1, c * 0.8);
  grupo.add(torso);
  grupo.add(pieza(cilindro(0.07, 0.08, 0.12, 12), piel, 0, 1.0, 0));
  const anillo = (y: number, grosor: number, m: THREE.Material, r = radioTorso(y)) => {
    const t = pieza(new THREE.TorusGeometry(r, grosor, 8, 28), m, 0, y, 0);
    t.rotation.x = PI / 2;
    t.scale.set(c, c * 0.8, 1);
    grupo.add(t);
  };
  const parche = (ancho: number, alto: number, y: number, m: THREE.Material, x = 0, extra = 0.004) =>
    grupo.add(pieza(caja(ancho, alto, 0.02), m, x, y, frente(y) + extra));

  switch (a.ropa) {
    case 1: anillo(0.5, 0.016, ropa2); anillo(0.62, 0.016, ropa2); anillo(0.74, 0.016, ropa2); break;
    case 2: anillo(0.34, 0.03, ropa2); anillo(0.95, 0.025, ropa2, 0.12); parche(0.08, 0.1, 0.78, ropa2, -0.09 * c); break;
    case 3: {
      const capucha = pieza(esfera(0.2), toon(sombra(a.colorRopa, 0.82)), 0, 0.98, -0.1);
      capucha.scale.set(1, 0.8, 0.9);
      grupo.add(capucha);
      parche(0.2, 0.09, 0.46, toon(sombra(a.colorRopa, 0.82)));
      break;
    }
    case 4: {
      const peto = pieza(cilindro(0.205 * c, 0.2 * c, 0.26, 20), toon(a.colorPantalon), 0, 0.45, 0);
      peto.scale.z = 0.82;
      grupo.add(peto);
      for (const s of [-1, 1]) parche(0.045, 0.32, 0.74, toon(a.colorPantalon), s * 0.09 * c, 0.012);
      break;
    }
    case 5: grupo.add(pieza(cilindro(0.17 * c, 0.34 * c, 0.3, 20), ropa, 0, 0.36, 0)); break;
    case 7: parche(0.11, 0.26, 0.78, blanco); parche(0.045, 0.22, 0.77, ropa2, 0, 0.016); break;
    case 8:
      for (const s of [-1, 1]) { const cuello = pieza(caja(0.1, 0.05, 0.03), toon(sombra(a.colorRopa, 1.25)), s * 0.06, 0.95, 0.09); cuello.rotation.z = s * 0.5; grupo.add(cuello); }
      for (const y of [0.82, 0.7, 0.58]) grupo.add(pieza(esfera(0.014, 8, 6), blanco, 0, y, frente(y) + 0.008));
      break;
    case 9: anillo(0.97, 0.05, ropa2, 0.12); parche(0.09, 0.26, 0.8, ropa2, 0.07, 0.03); break;
    case 10: parche(0.13, 0.15, 0.74, ropa2); anillo(0.36, 0.02, ropa2); break;
    case 11:
      parche(0.03, 0.3, 0.72, blanco);
      [0.84, 0.76, 0.68, 0.6].forEach((y, i) => parche(0.26 - i * 0.03, 0.025, y, blanco));
      break;
    case 12: {
      grupo.add(pieza(cilindro(0.11, 0.4 * c, 0.44, 22), ropa, 0, 0.76, 0));
      const franja = pieza(cilindro(0.34 * c, 0.385 * c, 0.05, 22), ropa2, 0, 0.6, 0);
      grupo.add(franja);
      break;
    }
  }

  // Brazos y piernas cuelgan de un pivote para poder animarlos
  const manga = a.ropa === 6 ? piel : a.ropa === 2 || a.ropa === 4 ? ropa2 : a.ropa === 11 ? negro : ropa;
  const antebrazo = MANGA_LARGA.has(a.ropa) ? manga : piel;
  const brazo = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * (0.235 * c + 0.03), 0.84, 0);
    g.rotation.z = s * 0.16;
    g.add(pieza(capsula(0.062, 0.16), manga, 0, -0.13, 0));
    g.add(pieza(capsula(0.052, 0.14), antebrazo, 0, -0.31, 0));
    g.add(pieza(esfera(0.066, 12, 10), piel, 0, -0.45, 0));
    grupo.add(g);
    return g;
  };
  const zapatos = toon(a.colorZapatos), suela = toon(sombra(a.colorZapatos, 0.55));
  const pierna = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.1, 0.34, 0);
    g.add(pieza(cilindro(0.082, 0.07, 0.3, 12), pantalon, 0, -0.13, 0));
    const zapato = pieza(esfera(0.085, 12, 10), zapatos, 0, -0.3, 0.04);
    zapato.scale.set(1, 0.62, 1.5);
    g.add(zapato);
    const base = pieza(cilindro(0.085, 0.09, 0.03, 12), suela, 0, -0.335, 0.04);
    base.scale.z = 1.5;
    g.add(base);
    grupo.add(g);
    return g;
  };
  const partes: Partes = { cabeza: new THREE.Group(), brazoI: brazo(-1), brazoD: brazo(1), piernaI: pierna(-1), piernaD: pierna(1) };

  // Espalda
  const atras = (y: number) => -frente(y);
  switch (a.espalda) {
    case 1:
      grupo.add(pieza(caja(0.3, 0.34, 0.16), ropa2, 0, 0.66, atras(0.66) - 0.07));
      grupo.add(pieza(caja(0.2, 0.12, 0.05), toon(sombra(a.colorRopa2, 0.8)), 0, 0.58, atras(0.58) - 0.17));
      break;
    case 2:
      for (const s of [-1, 1]) { const ala = pieza(esfera(0.2), blanco, s * 0.3, 0.8, atras(0.8) - 0.05); ala.scale.set(1.3, 0.9, 0.14); ala.rotation.z = s * -0.5; grupo.add(ala); }
      break;
    case 3:
      for (const s of [-1, 1]) { const ala = pieza(new THREE.ConeGeometry(0.3, 0.5, 3), toon('#3a2a55'), s * 0.34, 0.82, atras(0.82) - 0.05); ala.scale.z = 0.12; ala.rotation.z = s * -1.2; grupo.add(ala); }
      break;
    case 4: {
      const curva = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.36, -0.14), new THREE.Vector3(0, 0.3, -0.38), new THREE.Vector3(0.05, 0.46, -0.52), new THREE.Vector3(0.08, 0.68, -0.5)]);
      grupo.add(pieza(new THREE.TubeGeometry(curva, 14, 0.035, 8), toon(a.colorPelo)));
      break;
    }
    case 5: {
      const capa = pieza(new THREE.CylinderGeometry(0.25 * c, 0.42 * c, 0.64, 20, 1, true, PI / 2 + 0.3, PI - 0.6), toon(a.colorRopa2, true), 0, 0.62, 0);
      grupo.add(capa);
      break;
    }
  }

  // Objeto en la mano derecha
  if (a.objeto > 0) {
    const mano = new THREE.Group();
    mano.position.set(0, -0.45, 0.07);
    const pon = (geo: THREE.BufferGeometry, m: THREE.Material, y: number, x = 0) => { const o = pieza(geo, m, x, y, 0); mano.add(o); return o; };
    switch (a.objeto) {
      case 1: pon(cilindro(0.006, 0.006, 1.25, 5), blanco, 0.62); pon(esfera(0.17), ropa2, 1.37).scale.y = 1.15; break;
      case 2: pon(caja(0.04, 0.5, 0.012), toon('#d8dde8'), 0.32); pon(caja(0.16, 0.03, 0.03), toon('#ffd84a'), 0.06); pon(cilindro(0.018, 0.018, 0.1, 8), negro, 0); break;
      case 3: pon(cilindro(0.012, 0.012, 0.4, 6), negro, 0.2); pon(new THREE.OctahedronGeometry(0.065), luz('#ffe08a'), 0.44); break;
      case 4: pon(cilindro(0.01, 0.01, 0.3, 6), blanco, 0.15); pon(cilindro(0.1, 0.1, 0.03, 20), ropa2, 0.36).rotation.x = PI / 2; break;
      case 5: pon(cilindro(0.012, 0.012, 0.75, 6), toon('#7a5230'), 0.36); pon(caja(0.28, 0.18, 0.012), ropa, 0.62, 0.15); break;
      case 6: {
        const farol = pon(esfera(0.11), new THREE.MeshStandardMaterial({ color: '#ff8a1e', roughness: 0.7, emissive: '#ff6a00', emissiveIntensity: 0.5 }), -0.12);
        farol.scale.set(1.15, 0.9, 1.15);
        pon(cilindro(0.015, 0.02, 0.05, 6), toon('#3f9d6b'), -0.01);
        break;
      }
    }
    partes.brazoD.add(mano);
  }

  // Cabeza con la cara dibujada
  const [ancho, alto, fondo, mandibula] = FORMAS[a.cabeza];
  const cabeza = partes.cabeza;
  cabeza.position.y = 1.38;
  cabeza.scale.set(ancho, alto, fondo);
  const lienzo = document.createElement('canvas');
  lienzo.width = detalle;
  lienzo.height = detalle / 2;
  dibujarCara(lienzo.getContext('2d')!, a, detalle / 1024);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  const craneo = pieza(geoCabeza(mandibula), new THREE.MeshStandardMaterial({ map: textura, roughness: 0.72 }));
  craneo.rotation.y = -PI / 2; // lleva el centro del lienzo al frente
  cabeza.add(craneo);
  for (const s of [-1, 1]) { const oreja = pieza(esfera(R * 0.2, 10, 8), piel, s * R * 0.97, -R * 0.05, 0); oreja.scale.set(0.5, 1, 1); cabeza.add(oreja); }

  // Narices con volumen (las demás van dibujadas en la cara)
  const pielNariz = toon(sombra(a.piel, 0.93));
  if (a.nariz === 5) cabeza.add(pieza(esfera(R * 0.16, 12, 10), pielNariz, 0, -R * 0.12, R * 0.98));
  if (a.nariz === 6) { const n = pieza(esfera(R * 0.13, 12, 10), pielNariz, 0, -R * 0.08, R * 1.0); n.scale.set(0.9, 0.8, 1.3); n.rotation.x = -0.5; cabeza.add(n); }
  if (a.nariz === 7) { const n = pieza(esfera(R * 0.23, 12, 10), pielNariz, 0, -R * 0.14, R * 0.96); n.scale.set(1, 1.1, 1); cabeza.add(n); }
  if (a.nariz === 8) { const n = pieza(new THREE.ConeGeometry(R * 0.14, R * 0.42, 10), pielNariz, 0, -R * 0.08, R * 1.04); n.rotation.x = 2.1; cabeza.add(n); }

  ponerPelo(cabeza, a.pelo, toon(a.colorPelo, true), CUBREN.has(a.sombrero));
  ponerSombrero(cabeza, a.sombrero, a.colorSombrero);
  grupo.add(cabeza);

  grupo.userData.partes = partes;
  grupo.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  // Cada parte que se anima queda como unas pocas mallas; el resto del cuerpo, igual
  for (const parte of Object.values(partes) as THREE.Group[]) { fundir(parte); parte.userData.movil = true; }
  fundir(grupo);
  grupo.scale.setScalar(0.9 + a.altura * 0.2);
  return grupo;
}

/** Balanceo de brazos y piernas. `fuerza` 0 = quieto, 1 = caminando. */
export function animarPaso(grupo: THREE.Group, t: number, fuerza: number) {
  const p = grupo.userData.partes as Partes | undefined;
  if (!p) return;
  const v = Math.sin(t * 9) * fuerza;
  p.brazoI.rotation.x = v * 0.7;
  p.brazoD.rotation.x = -v * 0.7;
  p.piernaI.rotation.x = -v * 0.6;
  p.piernaD.rotation.x = v * 0.6;
}

export function liberar(objeto: THREE.Object3D) {
  objeto.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined;
    if (mat && !Array.isArray(mat)) { mat.map?.dispose(); mat.dispose(); }
  });
}
