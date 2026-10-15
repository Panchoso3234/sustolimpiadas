import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { fundir } from '../../nucleo/fundir';
import { bosque, cielo, halo, ladrillo, pasto, type Planta } from '../decorado';
import { mat } from '../punteria/fisica';
import type { Obstaculo, Mundo } from './motor';

// Ambientación de las canchas de arena: granja (Caza del Huevo), estadio (Fuchibol) y acantilado de noche (Rey del Faro).
// Todo lo fijo se funde o se dibuja como instancias; lo que se anima es poco y barato.

const plano = (ancho: number, fondo: number, material: THREE.Material, y = 0.03) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, fondo), material);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
};

/** Fardo de paja: cilindro dorado con amarras. */
function fardo(r: number): THREE.Group {
  const g = new THREE.Group(), cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 1.2, 12), mat('#e6be55'));
  cuerpo.position.y = r * 0.6;
  g.add(cuerpo);
  for (const y of [0.3, 0.9]) { const amarra = new THREE.Mesh(new THREE.TorusGeometry(r + 0.01, 0.04, 4, 16), mat('#9a6a2c')); amarra.rotation.x = Math.PI / 2; amarra.position.y = r * 1.2 * y; g.add(amarra); }
  return g;
}

/** Hongo saltarín: sombrero rojo con pintas sobre un tallo. */
function hongo(r: number): THREE.Group {
  const g = new THREE.Group(), tallo = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.55, r * 1.1, 10), mat('#f3e6cf'));
  const sombrero = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e8473a'));
  tallo.position.y = r * 0.55;
  sombrero.position.y = r * 1.05;
  g.add(tallo, sombrero);
  for (let i = 0; i < 6; i++) { const a = i * 1.05, pinta = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 6, 4), mat('#ffffff')); pinta.position.set(Math.cos(a) * r * 0.7, r * 1.05 + r * 0.72, Math.sin(a) * r * 0.7); g.add(pinta); }
  return g;
}

/** Cerca de madera alrededor de un rectángulo. */
async function cerca(m: Mundo, ancho: number, fondo: number, margen = 0.55) {
  const largo = 2.6, puntos: Planta[] = [];
  for (let x = -ancho / 2 + largo / 2; x < ancho / 2; x += largo) { puntos.push({ x, z: -fondo / 2 - margen, alto: 0.9, giro: 0 }, { x, z: fondo / 2 + margen, alto: 0.9, giro: Math.PI }); }
  for (let z = -fondo / 2 + largo / 2; z < fondo / 2; z += largo) { puntos.push({ x: -ancho / 2 - margen, z, alto: 0.9, giro: -Math.PI / 2 }, { x: ancho / 2 + margen, z, alto: 0.9, giro: Math.PI / 2 }); }
  await bosque(m.e.escena, 'naturaleza', 'fence_simple', puntos);
}

// ───────────────────────── Granja ─────────────────────────

/** Obstáculos de la granja: cuatro fardos y dos hongos saltarines, simétricos para que ningún equipo tenga ventaja. */
export const OBSTACULOS_GRANJA = (): Obstaculo[] => [
  { x: -4.6, z: -3.9, r: 0.85 }, { x: 4.6, z: -3.9, r: 0.85 }, { x: -4.6, z: 3.9, r: 0.85 }, { x: 4.6, z: 3.9, r: 0.85 },
  { x: 0, z: -5.4, r: 0.6, rebote: 1.6 }, { x: 0, z: 5.4, r: 0.6, rebote: 1.6 },
];

export async function granja(m: Mundo, obstaculos: Obstaculo[], colores: string[], nidos: { x: number; z: number }[]) {
  const { e, ancho, fondo } = m, r = generador('granja');
  cielo(e.escena, '#5fb2ec', '#e2f4ff');
  const telaPasto = pasto('#78c46c', '#6cb562', 2);
  telaPasto.repeat.set(ancho / 2, 1);
  e.escena.add(plano(400, 400, new THREE.MeshLambertMaterial({ color: '#86c06a' }), 0), plano(ancho + 0.6, fondo + 0.6, new THREE.MeshLambertMaterial({ color: '#a97c50' }), 0.015), plano(ancho, fondo, new THREE.MeshLambertMaterial({ map: telaPasto })));
  for (const o of obstaculos) {
    o.malla = o.rebote ? hongo(o.r) : fardo(o.r);
    o.malla.position.set(o.x, 0, o.z);
    o.malla.rotation.y = r() * 6;
    e.escena.add(o.malla);
  }
  // Nidos de paja con un banderín del color de cada equipo
  nidos.forEach((n, i) => {
    const nido = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.32, 6, 22), mat('#c99a4a'));
    nido.rotation.x = -Math.PI / 2;
    nido.position.set(n.x, 0.12, n.z);
    const asta = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), mat('#6b4a2b')), tela = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshLambertMaterial({ color: colores[i], side: THREE.DoubleSide }));
    asta.position.set(n.x + (i ? 1.7 : -1.7), 1.3, n.z - 1.6);
    tela.position.set(asta.position.x + 0.45, 2.3, asta.position.z);
    tela.userData.flamea = true;
    e.escena.add(nido, asta, tela);
  });
  await cerca(m, ancho, fondo);

  // Granero detrás de la cancha
  const granero = new THREE.Group(), muros = new THREE.Mesh(new THREE.BoxGeometry(7, 3.6, 4.5), mat('#c0392b'));
  muros.position.y = 1.8;
  const techo = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 7.4, 3, 1), mat('#5b2c22'));
  techo.rotation.set(0, 0, Math.PI / 2);
  techo.rotation.x = Math.PI / 2;
  techo.position.y = 4.3;
  const puerta = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), mat('#f4ead2')), cruz = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.2), mat('#8e2a20'));
  puerta.position.set(0, 1.2, 2.26);
  cruz.position.set(0, 1.2, 2.27);
  granero.add(muros, techo, puerta, cruz);
  granero.position.set(-6, 0, -fondo / 2 - 6.5);
  fundir(granero);
  e.escena.add(granero);

  // Maizal, árboles, troncos y gallinas
  const maiz: Planta[] = [];
  for (let f = 0; f < 4; f++) for (let k = 0; k < 9; k++) maiz.push({ x: 2 + k * 1.3, z: -fondo / 2 - 4 - f * 1.4, alto: 1.6 + r() * 0.4, giro: r() * 6 });
  const anillo = (cuantos: number, alto: [number, number]): Planta[] => Array.from({ length: cuantos }, () => {
    const a = r() * Math.PI * 2, d = 3 + r() * 14;
    return { x: Math.cos(a) * (ancho / 2 + d), z: Math.min(-fondo / 2 - 2, Math.sin(a) * (fondo / 2 + d)), alto: alto[0] + r() * (alto[1] - alto[0]), giro: r() * 6 };
  });
  await Promise.all([
    bosque(e.escena, 'naturaleza', 'crops_cornStageD', maiz),
    bosque(e.escena, 'naturaleza', 'tree_oak', anillo(9, [3.5, 5])),
    bosque(e.escena, 'naturaleza', 'tree_default', anillo(7, [4, 6])),
    bosque(e.escena, 'naturaleza', 'log_stack', [{ x: -11, z: -fondo / 2 - 3, alto: 0.9, giro: 0.3 }, { x: 13.5, z: 2, alto: 0.8, giro: 1.2 }]),
    bosque(e.escena, 'naturaleza', 'flower_yellowA', anillo(14, [0.4, 0.6]).map((p) => ({ ...p, z: p.z + 1 }))),
  ]);
  const gallinas = Array.from({ length: 6 }, (_, i) => {
    const g = new THREE.Group(), cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), mat('#fbf6ec')), cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat('#fbf6ec'));
    const cresta = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.14), mat('#e23b2e')), pico = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), mat('#f2a51e'));
    cuerpo.scale.set(1, 0.85, 1.2);
    cuerpo.position.y = 0.3;
    cabeza.position.set(0, 0.6, 0.28);
    cresta.position.set(0, 0.78, 0.28);
    pico.rotation.x = Math.PI / 2;
    pico.position.set(0, 0.58, 0.46);
    g.add(cuerpo, cabeza, cresta, pico);
    g.userData = { x: (i % 2 ? 1 : -1) * (ancho / 2 + 2 + r() * 3), z: -fondo / 2 - 1.5 - r() * 3, rumbo: r() * 6, pausa: 0, picotea: 0, cabeza };
    e.escena.add(g);
    return g;
  });
  const telas = e.escena.children.filter((o) => o.userData.flamea);
  e.alCuadro((t, dt) => {
    for (const tela of telas) tela.rotation.y = Math.sin(t * 3 + tela.position.x) * 0.3;
    for (const g of gallinas) {
      const d = g.userData;
      if (t < d.pausa) { d.cabeza.position.y = 0.6 - Math.max(0, Math.sin(t * 14)) * 0.18; continue; }
      if (r() < dt * 0.6) { d.pausa = t + 0.8 + r() * 1.5; d.rumbo += (r() - 0.5) * 2.5; }
      d.x += Math.sin(d.rumbo) * dt * 1.1; d.z += Math.cos(d.rumbo) * dt * 1.1;
      // No entran a la cancha
      if (Math.abs(d.x) < ancho / 2 + 1.2 && Math.abs(d.z) < fondo / 2 + 1.2) { d.rumbo += Math.PI; d.x += Math.sin(d.rumbo) * 0.2; d.z += Math.cos(d.rumbo) * 0.2; }
      if (Math.hypot(d.x, d.z) > 26) d.rumbo = Math.atan2(-d.x, -d.z);
      g.position.set(d.x, Math.abs(Math.sin(t * 12)) * 0.06, d.z);
      g.rotation.y = d.rumbo;
    }
  });
}

// ───────────────────────── Estadio ─────────────────────────

/** Pelota de fútbol: icosaedro con sus doce pentágonos negros. */
export function balon(radio: number): THREE.Mesh {
  const base = new THREE.IcosahedronGeometry(1, 0), vertices: THREE.Vector3[] = [];
  for (let i = 0; i < base.attributes.position.count; i++) vertices.push(new THREE.Vector3().fromBufferAttribute(base.attributes.position, i).normalize());
  const geo = new THREE.IcosahedronGeometry(radio, 1), pos = geo.attributes.position, colores: number[] = [], p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    let negro = false;
    for (let k = 0; k < 3 && !negro; k++) { p.fromBufferAttribute(pos, i + k).normalize(); negro = vertices.some((v) => v.distanceToSquared(p) < 1e-4); }
    for (let k = 0; k < 3; k++) colores.push(...(negro ? [0.12, 0.12, 0.14] : [0.97, 0.97, 0.95]));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

export interface Estadio { festejar(equipo: number): void; marcador(a: number, b: number): void }

export async function estadio(m: Mundo, arco: number, colores: string[]): Promise<Estadio> {
  const { e, ancho, fondo } = m, r = generador('estadio');
  cielo(e.escena, '#13203d', '#6f8fc4', '#30497a');
  const telaPasto = pasto('#5fb35f', '#53a254', 2);
  telaPasto.repeat.set(6.5, 1);
  const blanco = new THREE.MeshBasicMaterial({ color: '#f2f7ee' });
  e.escena.add(plano(400, 400, new THREE.MeshLambertMaterial({ color: '#2f5f35' }), 0), plano(ancho + 3, fondo + 3, new THREE.MeshLambertMaterial({ color: '#46914a' }), 0.012), plano(ancho, fondo, new THREE.MeshLambertMaterial({ map: telaPasto })));
  // Líneas: bordes, medio, círculo central y áreas
  const lineas = new THREE.Group(), linea = (x: number, z: number, w: number, d: number) => { const l = plano(w, d, blanco, 0.045); l.position.x = x; l.position.z = z; lineas.add(l); };
  linea(0, -fondo / 2, ancho, 0.12); linea(0, fondo / 2, ancho, 0.12); linea(-ancho / 2, 0, 0.12, fondo); linea(ancho / 2, 0, 0.12, fondo); linea(0, 0, 0.12, fondo);
  for (const lado of [-1, 1]) { linea(lado * (ancho / 2 - 3), 0, 0.12, 8); linea(lado * (ancho / 2 - 1.5), -4, 3, 0.12); linea(lado * (ancho / 2 - 1.5), 4, 3, 0.12); }
  const circulo = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.42, 40), blanco);
  circulo.rotation.x = -Math.PI / 2;
  circulo.position.y = 0.045;
  lineas.add(circulo);
  fundir(lineas);
  e.escena.add(lineas);

  // Arcos con red
  const red = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.strokeRect(0, 0, 32, 32); return c; })());
  red.wrapS = red.wrapT = THREE.RepeatWrapping;
  for (const lado of [-1, 1]) {
    const x0 = lado * (ancho / 2), g = new THREE.Group(), poste = mat('#ffffff');
    for (const z of [-arco, arco]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.3, 8), poste); p.position.set(x0, 1.15, z); g.add(p); }
    const travesano = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, arco * 2 + 0.24, 8), poste);
    travesano.rotation.x = Math.PI / 2;
    travesano.position.set(x0, 2.3, 0);
    const telaRed = red.clone(); telaRed.repeat.set(arco * 4, 4); telaRed.needsUpdate = true;
    const matRed = new THREE.MeshBasicMaterial({ map: telaRed, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const fondoRed = new THREE.Mesh(new THREE.PlaneGeometry(arco * 2, 2.3), matRed);
    fondoRed.position.set(x0 + lado * 1.4, 1.15, 0);
    fondoRed.rotation.y = Math.PI / 2;
    const techoRed = new THREE.Mesh(new THREE.PlaneGeometry(1.4, arco * 2), matRed);
    techoRed.rotation.x = -Math.PI / 2;
    techoRed.position.set(x0 + lado * 0.7, 2.3, 0);
    const piso = plano(1.4, arco * 2, new THREE.MeshLambertMaterial({ color: colores[lado < 0 ? 0 : 1] }), 0.04);
    piso.position.x = x0 + lado * 0.7;
    g.add(travesano, fondoRed, techoRed, piso);
    for (const z of [-arco, arco]) { const lado2 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), matRed); lado2.position.set(x0 + lado * 0.7, 1.15, z); g.add(lado2); }
    e.escena.add(g);
  }

  // Graderías de Kenney a los lados largos, con público (una instancia por persona)
  const grada = await e.objeto('carreras', 'grandStandCovered', 2.4);
  const tribunas = new THREE.Group();
  for (const lado of [-1, 1]) for (let x = -ancho / 2 - 2; x <= ancho / 2 + 2; x += 2.05) {
    const g = grada.clone();
    g.scale.multiplyScalar(1);
    g.position.set(x, 0, lado * (fondo / 2 + 3.6));
    g.rotation.y = lado < 0 ? 0 : Math.PI;
    tribunas.add(g);
  }
  fundir(tribunas);
  e.escena.add(tribunas);
  const PERSONAS = 220, gente = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.5, 0.3), new THREE.MeshLambertMaterial(), PERSONAS);
  const ubicaciones: { x: number; y: number; z: number; equipo: number; fase: number }[] = [], o = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < PERSONAS; i++) {
    const lado = i % 2 ? 1 : -1, fila = Math.floor(r() * 3), x = -ancho / 2 - 2.5 + r() * (ancho + 5), equipo = x < 0 ? 0 : 1;
    ubicaciones.push({ x, y: 0.75 + fila * 0.62, z: lado * (fondo / 2 + 2.85 + fila * 0.72), equipo, fase: r() * 6 });
    gente.setColorAt(i, color.set(r() < 0.75 ? colores[equipo] : ['#f5d6b8', '#ffd23c', '#ffffff'][Math.floor(r() * 3)]));
  }
  gente.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  e.escena.add(gente);

  // Focos en las esquinas y banderines
  const [foco, banderin] = await Promise.all([e.objeto('carreras', 'lightPostLarge', 7), e.objeto('carreras', 'flagCheckers', 1.5)]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const f = foco.clone(); f.position.set(x * (ancho / 2 + 4.5), 0, z * (fondo / 2 + 5.5)); f.rotation.y = Math.atan2(-x, -z); e.escena.add(f);
    const b = banderin.clone(); b.position.set(x * (ancho / 2 + 0.2), 0, z * (fondo / 2 + 0.2)); e.escena.add(b);
  }

  // Marcador gigante detrás de la tribuna del fondo
  const lienzo = document.createElement('canvas');
  lienzo.width = 512; lienzo.height = 160;
  const pantalla = new THREE.CanvasTexture(lienzo);
  pantalla.colorSpace = THREE.SRGBColorSpace;
  const tablero = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.5), new THREE.MeshBasicMaterial({ map: pantalla }));
  tablero.position.set(0, 6.4, -fondo / 2 - 7);
  const marco = new THREE.Mesh(new THREE.BoxGeometry(8.5, 3, 0.3), mat('#1d2233'));
  marco.position.set(0, 6.4, -fondo / 2 - 7.2);
  for (const x of [-3, 3]) { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5, 0.35), mat('#1d2233')); pata.position.set(x, 2.5, -fondo / 2 - 7.2); e.escena.add(pata); }
  e.escena.add(marco, tablero);
  const marcador = (a: number, b: number, texto = '') => {
    const g = lienzo.getContext('2d')!;
    g.fillStyle = '#0d1220'; g.fillRect(0, 0, 512, 160);
    g.fillStyle = colores[0]; g.fillRect(0, 0, 18, 160);
    g.fillStyle = colores[1]; g.fillRect(494, 0, 18, 160);
    g.textAlign = 'center'; g.fillStyle = '#ffe08a';
    g.font = 'bold 30px sans-serif'; g.fillText(texto || 'FUCHIBOL', 256, 40);
    g.font = 'bold 92px sans-serif'; g.fillStyle = '#ffffff'; g.fillText(`${a}  -  ${b}`, 256, 138);
    pantalla.needsUpdate = true;
  };
  marcador(0, 0);

  let fiesta = -9, quien = 0;
  e.alCuadro((t) => {
    const salta = t - fiesta < 3;
    ubicaciones.forEach((u, i) => {
      const brinco = salta && u.equipo === quien ? Math.abs(Math.sin(t * 9 + u.fase)) * 0.5 : Math.max(0, Math.sin(t * 2 + u.fase)) * 0.06;
      o.position.set(u.x, u.y + brinco, u.z);
      o.rotation.y = Math.sin(t + u.fase) * 0.2;
      o.updateMatrix();
      gente.setMatrixAt(i, o.matrix);
    });
    gente.instanceMatrix.needsUpdate = true;
  });
  return {
    festejar(equipo) { fiesta = e.reloj(); quien = equipo; },
    marcador: (a, b) => marcador(a, b, '¡GOOOL!'),
  };
}

// ───────────────────────── Faro de noche ─────────────────────────

export interface Faro {
  /** Mueve la luz: centro, radio y si está prendida. */
  luz(x: number, z: number, radio: number, encendida: number): void;
  /** Pone la corona sobre quien va primero (o la esconde). */
  corona(x: number, z: number, visible: boolean): void;
}

export async function acantilado(m: Mundo): Promise<Faro> {
  const { e, ancho, fondo } = m, r = generador('faro');
  cielo(e.escena, '#03060f', '#1e2f5c', '#0b1430');
  e.escena.fog = new THREE.Fog('#0d1834', 30, 90);
  // Meseta de piedra con laja, acantilado y mar
  const laja = ladrillo('#4a5878', '#2b3550', 3);
  laja.repeat.set(ancho / 3, fondo / 3);
  const roca = mat('#2c3446');
  const meseta = new THREE.Mesh(new THREE.BoxGeometry(ancho + 1.4, 4, fondo + 1.4), roca);
  meseta.position.y = -1.98;
  const telaMar = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; g.fillStyle = '#0e2a52'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,170,255,${0.08 + Math.random() * 0.12})`; g.fillRect(Math.random() * 64, Math.random() * 64, 6 + Math.random() * 10, 1.5); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); return t; })();
  const mar = plano(400, 400, new THREE.MeshLambertMaterial({ map: telaMar }), -2.6);
  const espuma = new THREE.Mesh(new THREE.RingGeometry(1, 1.06, 40), new THREE.MeshBasicMaterial({ color: '#9fc4ff', transparent: true, opacity: 0.35 }));
  espuma.rotation.x = -Math.PI / 2;
  espuma.scale.set(ancho * 0.78, fondo * 0.95, 1);
  espuma.position.y = -2.55;
  e.escena.add(meseta, mar, espuma, plano(ancho, fondo, new THREE.MeshLambertMaterial({ map: laja })));
  // Rocas alrededor de la meseta
  const rocas: Planta[] = [];
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2 + r() * 0.2; rocas.push({ x: Math.cos(a) * (ancho / 2 + 1.6 + r() * 2), z: Math.sin(a) * (fondo / 2 + 1.6 + r() * 2), alto: 1.2 + r() * 2.2, giro: r() * 6, y: -2.6 }); }
  await Promise.all([bosque(e.escena, 'naturaleza', 'stone_largeB', rocas.filter((_, i) => i % 2)), bosque(e.escena, 'naturaleza', 'stone_tallC', rocas.filter((_, i) => !(i % 2)))]);
  // Faroles en las esquinas, con su resplandor
  const farol = await e.objeto('pueblo', 'lantern', 1.3), resplandor = new THREE.SpriteMaterial({ map: halo('rgba(255,200,110,0.8)'), depthWrite: false, blending: THREE.AdditiveBlending });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const f = farol.clone(), b = new THREE.Sprite(resplandor);
    f.position.set(x * (ancho / 2 + 0.2), 0, z * (fondo / 2 + 0.2));
    b.position.set(f.position.x, 1.1, f.position.z);
    b.scale.set(3, 3, 1);
    e.escena.add(f, b);
  }

  // El faro: torre de piedra del paquete pirata, con linterna encendida y techo rojo
  const ALTO = 7.5, torre = await e.objeto('pirata', 'tower-complete-large', ALTO);
  const xf = -ancho / 2 - 2.5, zf = -fondo / 2 - 2.5, cima = -2.6 + ALTO;
  torre.position.set(xf, -2.6, zf);
  const islote = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.2, 2.2, 9), roca);
  islote.position.set(xf, -1.6, zf);
  const linterna = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.3, 10), new THREE.MeshBasicMaterial({ color: '#fff3b0' }));
  linterna.position.set(xf, cima + 0.6, zf);
  const techo = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.4, 10), mat('#c23b30'));
  techo.position.set(xf, cima + 1.95, zf);
  const brillo = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(255,236,150,0.9)'), depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  brillo.scale.set(9, 9, 1);
  brillo.position.copy(linterna.position);
  e.escena.add(islote, torre, linterna, techo, brillo);
  // Haz que gira sobre el mar y haz que baja a la cancha
  const matHaz = new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const giro = new THREE.Group(), largo = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 3, 40, 12, 1, true), matHaz);
  largo.rotation.z = Math.PI / 2;
  largo.position.x = 20;
  giro.add(largo);
  giro.position.copy(linterna.position);
  const bajada = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1, 1, 16, 1, true), matHaz.clone());
  (bajada.material as THREE.MeshBasicMaterial).opacity = 0.16;
  e.escena.add(giro, bajada);
  // La mancha de luz en la cancha y su borde (el borde es lo que cuenta para sumar)
  const mancha = plano(1, 1, new THREE.MeshBasicMaterial({ map: halo('rgba(255,230,130,0.75)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0.06);
  const borde = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.85 }));
  borde.rotation.x = -Math.PI / 2;
  borde.position.y = 0.07;
  e.escena.add(mancha, borde);

  // Cielo con estrellas y luna
  const estrellas = new Float32Array(900);
  for (let i = 0; i < 300; i++) { const a = r() * Math.PI * 2, b = 0.15 + r() * 1.2, d = 120; estrellas.set([Math.cos(a) * Math.cos(b) * d, Math.sin(b) * d, Math.sin(a) * Math.cos(b) * d - 30], i * 3); }
  const cielito = new THREE.BufferGeometry();
  cielito.setAttribute('position', new THREE.BufferAttribute(estrellas, 3));
  e.escena.add(new THREE.Points(cielito, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, fog: false })));
  const luna = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(235,240,255,1)'), fog: false }));
  luna.scale.set(10, 10, 1);
  luna.position.set(-30, 40, -80);
  e.escena.add(luna);

  // Corona dorada que flota sobre quien va primero
  const corona = new THREE.Group(), oro = new THREE.MeshBasicMaterial({ color: '#ffd23c' });
  const aro = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 10, 1, true), oro);
  corona.add(aro);
  for (let i = 0; i < 5; i++) { const punta = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), oro); const a = (i / 5) * Math.PI * 2; punta.position.set(Math.cos(a) * 0.3, 0.18, Math.sin(a) * 0.3); corona.add(punta); }
  corona.visible = false;
  e.escena.add(corona);

  const arriba = new THREE.Vector3(0, 1, 0), hacia = new THREE.Vector3();
  e.alCuadro((t, dt) => {
    giro.rotation.y += dt * 0.7;
    telaMar.offset.set(t * 0.01, t * 0.006);
    espuma.scale.set(ancho * (0.78 + Math.sin(t * 1.3) * 0.01), fondo * (0.95 + Math.sin(t * 1.3) * 0.012), 1);
    corona.rotation.y = t * 2;
  });
  return {
    luz(x, z, radio, encendida) {
      mancha.position.x = borde.position.x = x;
      mancha.position.z = borde.position.z = z;
      mancha.scale.set(radio * 2.6, radio * 2.6, 1);
      borde.scale.setScalar(radio);
      mancha.visible = borde.visible = bajada.visible = encendida > 0;
      (mancha.material as THREE.MeshBasicMaterial).opacity = encendida;
      // El haz va desde la linterna hasta la mancha
      hacia.set(x, 0, z).sub(linterna.position);
      const dist = hacia.length();
      bajada.scale.set(radio, dist, radio);
      bajada.position.copy(linterna.position).addScaledVector(hacia, 0.5);
      bajada.quaternion.setFromUnitVectors(arriba, hacia.normalize().negate());
    },
    corona(x, z, visible) { corona.visible = visible; corona.position.set(x, 2.55 + Math.sin(e.reloj() * 3) * 0.08, z); },
  };
}
