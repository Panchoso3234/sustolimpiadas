import * as THREE from 'three';
import { azar } from '../nucleo/azar';
import { SEMILLA_ISLA } from '../nucleo/config';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fundir } from '../nucleo/fundir';
import { cargar, copia, sembrar, type Paquete, type Siembra } from '../nucleo/modelos';
import { ANILLO, BANCOS, CASAS, CENTRO, PUENTE, PUENTE_NORTE, RADIO_PUEBLO, RIO, SITIOS, borde, caminos, costa, distRio, distTramo, polar, sueloFirme, terreno } from './cerebro';

// Escenario de la isla ValRigo: relieve, pueblo, bosques, costa, volcán, cielo y todo lo que se mueve solo.
// Todo se arma por código con figuras de pocas caras y sombreado facetado (estilo low-poly).
const PI = Math.PI;
const COLORES_CASAS = ['#e8573a', '#3fa3dc', '#8a5ce6', '#2fae86', '#7a8799', '#e85aa2', '#7ab33c'];
const PAREDES = ['#ffe9dc', '#e6f5ff', '#efe6ff', '#e2f8ee', '#f1f3f5', '#ffe6f2', '#eef8dc'];
export const LETRAS = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η'];
export const NOMBRES_LETRAS = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Épsilon', 'Zeta', 'Eta'];
const ALEGRES = ['#ef5565', '#ffd84a', '#3f8cff', '#5fc46a', '#ff7ab8', '#ff9a2e'];
const OTONO = ['#f2b632', '#e8923a', '#d9653b', '#7cba5a', '#5fa85a', '#c9c94a', '#f0c94a'];
const PINOS = ['#3f8f5a', '#357a52', '#4a9a5e'];

type V3 = [number, number, number];
type Sitio = { x: number; z: number; y?: number };

export function crearMundo(escena: THREE.Scene, clima: 0 | 1 | 2) {
  const mundo = new THREE.Group();
  escena.add(mundo);
  const animados: ((seg: number, noche: number) => void)[] = [];
  const nocturnos: { mat: THREE.MeshStandardMaterial; base: number; max: number }[] = [];
  const interactivos: THREE.Object3D[] = [];
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const al = (i: number, tema: string) => azar(SEMILLA_ISLA, tema, i);

  const m = (color: string) => { let x = mats.get(color); if (!x) { x = new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true }); mats.set(color, x); } return x; };
  /** Material que brilla de noche (ventanas, faroles, calabazas). */
  const brillo = (color: string, emisivo: string, base = 0, max = 1.2) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: emisivo, emissiveIntensity: base });
    nocturnos.push({ mat, base, max });
    return mat;
  };
  /** Material con dibujo y relieve: tejas, tablones, piedra o estuco. */
  const textura = (tipo: 'tejas' | 'madera' | 'piedra' | 'estuco', color: string, rx = 2, ry = 2, girar = false) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = color; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.fillStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 3;
    if (tipo === 'tejas') for (let fila = 0; fila < 4; fila++) for (let k = -1; k < 5; k++) { const x = k * 32 + (fila % 2) * 16, y = fila * 32; g.beginPath(); g.arc(x + 16, y, 16, 0, PI); g.stroke(); g.fillRect(x + 4, y + 2, 24, 6); }
    if (tipo === 'madera') for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32, 128); g.stroke(); g.fillRect(k * 32 + 6, (k * 37) % 100, 3, 40); }
    if (tipo === 'piedra') for (let fila = 0; fila < 4; fila++) { g.beginPath(); g.moveTo(0, fila * 32); g.lineTo(128, fila * 32); g.stroke(); for (let k = 0; k < 3; k++) { const x = k * 43 + (fila % 2) * 21; g.beginPath(); g.moveTo(x, fila * 32); g.lineTo(x, fila * 32 + 32); g.stroke(); g.fillRect(x + 5, fila * 32 + 5, 14, 5); } }
    if (tipo === 'estuco') for (let k = 0; k < 90; k++) { g.fillStyle = k % 2 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.12)'; g.fillRect(al(k, 'ex') * 128, al(k, 'ey') * 128, 3, 3); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace;
    if (girar) { t.center.set(0.5, 0.5); t.rotation = PI / 2; }
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.4, roughness: 0.9 });
  };

  const pon = (padre: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], p: V3 = [0, 0, 0], rot?: V3, esc?: V3) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(...p);
    if (rot) o.rotation.set(...rot);
    if (esc) o.scale.set(...esc);
    o.castShadow = o.receiveShadow = true;
    padre.add(o);
    return o;
  };
  const cubo = new THREE.BoxGeometry(1, 1, 1), bola = new THREE.IcosahedronGeometry(1, 2), bolita = new THREE.IcosahedronGeometry(1, 1), roca = new THREE.DodecahedronGeometry(1, 0);
  const caja = (padre: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, p: V3, rot?: V3) => pon(padre, cubo, mat, p, rot, [w, h, d]);
  const esfera = (padre: THREE.Object3D, mat: THREE.Material, r: number, p: V3, esc: V3 = [1, 1, 1]) => pon(padre, bola, mat, p, undefined, [r * esc[0], r * esc[1], r * esc[2]]);
  const piedraEn = (padre: THREE.Object3D, mat: THREE.Material, r: number, p: V3, i = 0) => pon(padre, roca, mat, p, [al(i, 'pa') * 3, al(i, 'pb') * 3, 0], [r, r * 0.8, r]);
  const cil = (padre: THREE.Object3D, mat: THREE.Material, r1: number, r2: number, h: number, p: V3, seg = 10, rot?: V3) => pon(padre, new THREE.CylinderGeometry(r1, r2, h, seg), mat, p, rot);
  const cono = (padre: THREE.Object3D, mat: THREE.Material, r: number, h: number, p: V3, seg = 10, rot?: V3) => pon(padre, new THREE.ConeGeometry(r, h, seg), mat, p, rot);
  /** Techo a dos aguas con la cumbrera a lo ancho. */
  const techo = (padre: THREE.Object3D, mat: THREE.Material, ancho: number, fondo: number, alto: number, p: V3) => {
    const r = fondo / 1.732;
    return pon(padre, new THREE.CylinderGeometry(r, r, ancho, 3, 1, false, PI / 2), mat, [p[0], p[1] + alto / 3, p[2]], [0, 0, PI / 2], [alto / (1.5 * r), 1, 1]);
  };
  const grupo = (p: Sitio, giro = 0, padre: THREE.Object3D = mundo) => { const g = new THREE.Group(); g.position.set(p.x, p.y ?? terreno(p.x, p.z), p.z); g.rotation.y = giro; padre.add(g); return g; };
  const haciaCentro = (p: { x: number; z: number }) => Math.atan2(CENTRO.x - p.x, CENTRO.z - p.z);
  const tocable = <T extends THREE.Object3D>(o: T, info: string): T => { o.userData.info = info; interactivos.push(o); return o; };
  const texto = (lineas: string[], ancho: number, alto: number, fondo = '#233760', color = '#f3ecdc', fuente = 'Nunito, sans-serif') => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = Math.round((512 * alto) / ancho);
    const g = c.getContext('2d')!;
    g.fillStyle = fondo; g.fillRect(0, 0, c.width, c.height);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const paso = c.height / (lineas.length + 1);
    lineas.forEach((linea, i) => {
      let tam = Math.min(lineas.length === 1 ? c.height * 0.72 : i === 0 ? 58 : 38, paso * 0.85 * (lineas.length === 1 ? 2 : 1));
      const f = () => `${i === 0 ? 800 : 600} ${tam}px ${fuente}`;
      g.font = f();
      while (g.measureText(linea).width > c.width - 40 && tam > 12) { tam -= 2; g.font = f(); }
      g.fillStyle = i === 0 && lineas.length > 1 ? '#ffe08a' : color;
      g.fillText(linea, c.width / 2, paso * (i + 1));
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t });
  };
  const cartel = (padre: THREE.Object3D, lineas: string[], ancho: number, alto: number, p: V3, rot?: V3, fondo?: string, color?: string, fuente?: string) => {
    const o = pon(padre, new THREE.PlaneGeometry(ancho, alto), texto(lineas, ancho, alto, fondo, color, fuente), p, rot);
    o.castShadow = false;
    return o;
  };
  const instancias = (geo: THREE.BufferGeometry, lista: { p: V3; e: V3; r?: V3; c: string }[]) => {
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), lista.length);
    const o = new THREE.Object3D(), color = new THREE.Color();
    lista.forEach((it, i) => {
      o.position.set(...it.p); o.scale.set(...it.e); o.rotation.set(...(it.r ?? [0, 0, 0])); o.updateMatrix();
      im.setMatrixAt(i, o.matrix); im.setColorAt(i, color.set(it.c));
    });
    im.castShadow = im.receiveShadow = true;
    mundo.add(im);
    return im;
  };

  const madera = textura('madera', '#8a5a34', 2, 1), piedra = textura('piedra', '#9a97a6', 2, 1), blanco = m('#f3ecdc'), oscuro = m('#1c1826'), verde = m('#3f9d6b'), verde2 = m('#57b86f');
  const palo = m('#7a5230'), gris = m('#8d8a99');
  const ventana = brillo('#ffe9a8', '#ffd45a');
  const farol = brillo('#fff3c4', '#ffd45a', 0, 1.8);
  const zapallo = brillo('#ff8a1e', '#ff6a00', 0.05, 1.1);
  const llama = brillo('#ff9a2e', '#ff7a1c', 0.6, 1.8);

  // ───────── Relieve ─────────
  const tramos = caminos();
  const enCamino = (x: number, z: number, margen: number) => tramos.some(([a, b]) => distTramo(x, z, a, b) < margen);
  const LADO = 150, DIV = 220;
  const plano = new THREE.PlaneGeometry(LADO * 2, LADO * 2, DIV, DIV);
  plano.rotateX(-PI / 2);
  for (let i = 0, pp = plano.attributes.position; i < pp.count; i++) pp.setY(i, terreno(pp.getX(i), pp.getZ(i)));
  const ps = plano.toNonIndexed().attributes.position, vertices: number[] = [], colores: number[] = [];
  const tinta = new THREE.Color(), FONDO = new THREE.Color('#2a78a8'), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  for (let i = 0; i < ps.count; i += 3) {
    va.fromBufferAttribute(ps, i); vb.fromBufferAttribute(ps, i + 1); vc.fromBufferAttribute(ps, i + 2);
    const x = (va.x + vb.x + vc.x) / 3, h = (va.y + vb.y + vc.y) / 3, z = (va.z + vb.z + vc.z) / 3;
    if (h < -1.56) continue; // mar adentro no hace falta suelo: lo cubre el fondo
    vertices.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
    const pendiente = vb.sub(va).cross(vc.sub(va)).normalize().y; // 1 = plano, 0 = pared
    const dc = Math.hypot(x - CENTRO.x, z - CENTRO.z), aOrilla = costa(Math.atan2(x, z)) - Math.hypot(x, z);
    let color: string;
    if (h < 0.3) color = '#dcc890';
    else if (aOrilla < 9 && h < 1.15 && pendiente > 0.8) color = '#f2deae';
    else if (pendiente < 0.74) color = h > 9 ? '#8b8794' : '#9b6f4e';
    else if (h > 11.6) color = '#f4f7fb'; // nieve en la cumbre
    else if (h > 10.2) color = '#8b8794';
    else if (dc < 7) color = '#e9dcc0';
    else if (Math.abs(dc - ANILLO) < 1.15 || enCamino(x, z, 1.15)) color = '#d9bd8a';
    else if (distRio(x, z) < 1.8 && Math.hypot(x - PUENTE.x, z - PUENTE.z) > 2.6) color = '#a8926a';
    else {
      const v = Math.sin(x * 0.21 + z * 0.13) + Math.cos(x * 0.09 - z * 0.17);
      color = h > 6 ? '#5fa05a' : v > 0.9 ? '#a5d46a' : v > 0.1 ? '#84cc6c' : v > -0.8 ? '#72c066' : '#63b45e';
    }
    tinta.set(color).multiplyScalar(0.95 + al(i, 'tono') * 0.1);
    if (h < 0) tinta.lerp(FONDO, Math.min(1, -h / 1.5)); // la arena se funde con el fondo al hundirse
    for (let k = 0; k < 3; k++) colores.push(tinta.r, tinta.g, tinta.b);
  }
  const geoSuelo = new THREE.BufferGeometry();
  geoSuelo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geoSuelo.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  geoSuelo.computeVertexNormals();
  pon(mundo, geoSuelo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })).castShadow = false;

  // ───────── Mar: fondo, agua translúcida y espuma ─────────
  pon(mundo, new THREE.CircleGeometry(700, 48), new THREE.MeshStandardMaterial({ color: '#2a78a8', roughness: 1 }), [0, -1.6, 0], [-PI / 2, 0, 0]).castShadow = false;
  const olas = document.createElement('canvas');
  olas.width = olas.height = 256;
  const go = olas.getContext('2d')!;
  go.fillStyle = '#808080'; go.fillRect(0, 0, 256, 256);
  go.strokeStyle = '#d0d0d0'; go.lineWidth = 6; go.lineCap = 'round';
  for (let i = 0; i < 16; i++) { const x = al(i, 'ox') * 256, y = al(i, 'oy') * 256; go.beginPath(); go.moveTo(x, y); go.quadraticCurveTo(x + 24, y - 10, x + 48, y); go.stroke(); }
  const texMar = new THREE.CanvasTexture(olas);
  texMar.wrapS = texMar.wrapT = THREE.RepeatWrapping;
  texMar.repeat.set(90, 90);
  const matMar = new THREE.MeshStandardMaterial({ color: '#2e9fd8', transparent: true, opacity: 0.78, roughness: 0.25, metalness: 0.1, bumpMap: texMar, bumpScale: 2.2, depthWrite: false });
  const mar = pon(mundo, new THREE.CircleGeometry(700, 64), matMar, [0, 0, 0], [-PI / 2, 0, 0]);
  mar.castShadow = false;
  animados.push((seg) => { texMar.offset.set(seg * 0.003, seg * 0.006); });
  const contorno = (extra: number) => {
    const s = new THREE.Shape();
    for (let i = 0; i <= 140; i++) {
      const a = (i / 140) * PI * 2, r = costa(a) + extra;
      if (i) s.lineTo(Math.sin(a) * r, -Math.cos(a) * r); else s.moveTo(Math.sin(a) * r, -Math.cos(a) * r);
    }
    return s;
  };
  const franja = (dentro: number, fuera: number, y: number, fase: number) => {
    const s = contorno(fuera);
    s.holes.push(contorno(dentro));
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false });
    const o = pon(mundo, new THREE.ShapeGeometry(s), mat, [0, y, 0], [-PI / 2, 0, 0]);
    o.castShadow = o.receiveShadow = false;
    animados.push((seg) => { const v = Math.sin(seg * 0.9 + fase); o.scale.setScalar(1 + v * 0.006); mat.opacity = 0.35 + v * 0.25; });
  };
  franja(0.2, 1.1, 0.04, 0); franja(2, 2.6, 0.03, 2.2);

  // ───────── Río y cascada ─────────
  const cinta = (puntos: { x: number; z: number }[], ancho: number, alturaDe: (x: number, z: number) => number, mat: THREE.Material) => {
    const v: number[] = [], idx: number[] = [];
    const finos: { x: number; z: number }[] = [];
    for (let i = 1; i < puntos.length; i++) for (let k = 0; k < 8; k++) finos.push({ x: puntos[i - 1].x + ((puntos[i].x - puntos[i - 1].x) * k) / 8, z: puntos[i - 1].z + ((puntos[i].z - puntos[i - 1].z) * k) / 8 });
    finos.push(puntos[puntos.length - 1]);
    finos.forEach((p, i) => {
      const q = finos[Math.min(i + 1, finos.length - 1)], o = finos[Math.max(i - 1, 0)];
      const dx = q.x - o.x, dz = q.z - o.z, largo = Math.hypot(dx, dz) || 1, nx = -dz / largo, nz = dx / largo, y = alturaDe(p.x, p.z);
      v.push(p.x + nx * ancho, y, p.z + nz * ancho, p.x - nx * ancho, y, p.z - nz * ancho);
      if (i) { const b = i * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const o = pon(mundo, geo, mat);
    o.castShadow = false;
    return o;
  };
  const matRio = new THREE.MeshStandardMaterial({ color: '#58c0ea', transparent: true, opacity: 0.9, roughness: 0.2, side: THREE.DoubleSide });
  cinta(RIO, 1.35, (x, z) => Math.max(0.05, sueloFirme(x, z) - 0.55), matRio);
  const salto = [{ x: -8, z: -74 }, { x: -14, z: -68 }, { x: -20, z: -62 }];
  cinta(salto, 1, (x, z) => sueloFirme(x, z) + 0.18, new THREE.MeshStandardMaterial({ color: '#d8f2ff', transparent: true, opacity: 0.92, roughness: 0.3, side: THREE.DoubleSide }));
  const bruma = Array.from({ length: 6 }, () => pon(mundo, bolita, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false })));
  bruma.forEach((b) => { b.castShadow = false; });
  animados.push((seg) => bruma.forEach((b, i) => {
    const t = (seg * 0.6 + i / bruma.length) % 1;
    b.position.set(RIO[0].x + Math.sin(i * 2.2) * 1.2, terreno(RIO[0].x, RIO[0].z) + 0.4 + t * 1.6, RIO[0].z + Math.cos(i * 1.7) * 1.2);
    b.scale.setScalar(0.3 + t * 0.6);
    (b.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t);
  }));
  for (let i = 0; i < 7; i++) piedraEn(mundo, gris, 0.7 + al(i, 'cr') * 0.7, [RIO[0].x + (al(i, 'cx') - 0.5) * 7, terreno(RIO[0].x, RIO[0].z) + 0.5, RIO[0].z + (al(i, 'cz2') - 0.5) * 6], i);
  // Puente del camino al faro
  for (const [sitio, desde] of [[PUENTE, polar(-52, 30)], [PUENTE_NORTE, polar(-160, 30)]]) {
    const puente = grupo({ ...sitio, y: sueloFirme(sitio.x, sitio.z) }, Math.atan2(sitio.x - desde.x, sitio.z - desde.z));
    caja(puente, madera, 2.6, 0.18, 7.4, [0, 0.1, 0]);
    for (const s of [-1, 1]) { caja(puente, palo, 0.12, 0.12, 7.4, [s * 1.25, 1, 0]); for (const z of [-3.5, -1.2, 1.2, 3.5]) caja(puente, palo, 0.14, 1.1, 0.14, [s * 1.25, 0.55, z]); }
  }
  // Mirador de la cascada
  const mirador = grupo(SITIOS.cascada);
  for (let i = 0; i < 5; i++) { const a = -2.4 + i * 0.5; caja(mirador, palo, 0.12, 1, 0.12, [Math.sin(a) * 2.6, 0.5, Math.cos(a) * 2.6]); }
  caja(mirador, palo, 1.8, 0.12, 0.6, [1.2, 0.5, 1]);

  // ───────── Plaza ─────────
  const plaza = tocable(grupo({ ...CENTRO, y: 1.5 }), 'fuente');
  cil(plaza, piedra, 2.1, 2.3, 0.55, [0, 0.28, 0], 16);
  cil(plaza, m('#4fb8f0'), 1.85, 1.85, 0.08, [0, 0.56, 0], 16);
  cil(plaza, piedra, 0.28, 0.4, 1.5, [0, 1.1, 0]);
  cil(plaza, piedra, 0.9, 0.3, 0.3, [0, 1.95, 0], 12);
  const gotas = Array.from({ length: 12 }, () => esfera(plaza, m('#bfe6ff'), 0.07, [0, 2, 0]));
  animados.push((seg) => gotas.forEach((gota, i) => {
    const t = (seg * 0.7 + i / gotas.length) % 1, a = (i / gotas.length) * PI * 2;
    gota.position.set(Math.sin(a) * t * 1.5, 2.1 + t * 1.6 - t * t * 3.1, Math.cos(a) * t * 1.5);
  }));
  for (const b of BANCOS) {
    const banco = grupo({ x: b.x, z: b.z, y: 1.5 }, (b.grados * PI) / 180 + PI);
    caja(banco, madera, 2.3, 0.12, 0.65, [0, 0.5, 0]);
    caja(banco, madera, 2.3, 0.6, 0.1, [0, 0.85, -0.32]);
    for (const s of [-1, 1]) caja(banco, oscuro, 0.1, 0.5, 0.55, [s * 1, 0.25, 0]);
  }
  const postes = [0, 60, 120, 180, 240, 300].map((gr) => polar(gr + 30, 7.6));
  postes.forEach((p, i) => {
    cil(mundo, palo, 0.07, 0.09, 3.4, [p.x, 3.2, p.z], 6);
    const q = postes[(i + 1) % postes.length];
    for (let k = 1; k < 7; k++) {
      const f = k / 7, cae = Math.sin(f * PI) * 0.5;
      cono(mundo, m(ALEGRES[(i + k) % ALEGRES.length]), 0.2, 0.42, [p.x + (q.x - p.x) * f, 4.6 - cae, p.z + (q.z - p.z) * f], 3, [PI, Math.atan2(q.x - p.x, q.z - p.z), 0]).scale.z = 0.15;
    }
  });
  const tablon = (sitio: Sitio, giro: number, info: string, lineas: string[], color: string) => {
    const t = tocable(grupo({ ...sitio, y: 1.5 }, giro), info);
    for (const s of [-1, 1]) cil(t, palo, 0.14, 0.14, 3.8, [s * 2.4, 1.9, 0], 8);
    caja(t, madera, 5.6, 3, 0.18, [0, 2.9, 0]);
    techo(t, textura('tejas', color, 5, 1, true), 6.2, 1.2, 0.6, [0, 4.4, 0]);
    cartel(t, lineas, 5.2, 2.6, [0, 2.9, 0.1]);
    return t;
  };
  tablon(SITIOS.tablero, 0, 'tabla', ['TABLA DE POSICIONES', 'Se estrena el viernes 16', 'Toca para abrir'], '#ef5565');
  tablon(SITIOS.eventos, PI, 'eventos', ['TABLÓN DE EVENTOS', 'Calendario del torneo', 'Toca para abrir'], '#3f8cff');
  const ruleta = tocable(grupo({ ...SITIOS.ruleta, y: 1.5 }, 0.5), 'ruleta');
  cil(ruleta, palo, 0.15, 0.2, 2.2, [0, 1.1, 0], 8);
  const disco = document.createElement('canvas');
  disco.width = disco.height = 256;
  const gd = disco.getContext('2d')!;
  for (let i = 0; i < 12; i++) { gd.fillStyle = ALEGRES[i % ALEGRES.length]; gd.beginPath(); gd.moveTo(128, 128); gd.arc(128, 128, 126, (i / 12) * PI * 2, ((i + 1) / 12) * PI * 2); gd.fill(); }
  gd.fillStyle = '#f3ecdc'; gd.beginPath(); gd.arc(128, 128, 22, 0, PI * 2); gd.fill();
  const texDisco = new THREE.CanvasTexture(disco);
  texDisco.colorSpace = THREE.SRGBColorSpace;
  const eje = new THREE.Group();
  eje.position.set(0, 2.6, 0.2);
  eje.rotation.x = PI / 2;
  ruleta.add(eje);
  const rueda = pon(eje, new THREE.CylinderGeometry(1.5, 1.5, 0.16, 28), [palo, new THREE.MeshBasicMaterial({ map: texDisco }), palo]);
  cono(ruleta, m('#ffd84a'), 0.16, 0.4, [0, 4.25, 0.3], 4, [PI, 0, 0]);
  animados.push((seg) => { rueda.rotation.y = seg * 0.5; });
  const atril = tocable(grupo({ ...SITIOS.atril, y: 1.5 }, -0.5), 'atril');
  for (const [x, z] of [[-0.5, 0.2], [0.5, 0.2], [0, -0.5]]) cil(atril, palo, 0.05, 0.05, 2.4, [x * 0.8, 1.15, z * 0.8], 6, [z < 0 ? 0.25 : -0.12, 0, x * -0.15]);
  caja(atril, blanco, 1.5, 1.2, 0.06, [0, 1.75, 0.12]);
  caja(atril, m('#4fb8f0'), 1.3, 0.5, 0.02, [0, 2, 0.16]);
  caja(atril, m('#69c46d'), 1.3, 0.5, 0.02, [0, 1.5, 0.16]);
  esfera(atril, m('#ffd84a'), 0.18, [0.35, 2.05, 0.17], [1, 1, 0.1]);
  const kiosko = tocable(grupo({ ...SITIOS.kiosko, y: 1.5 }, PI), 'diario');
  caja(kiosko, textura('madera', '#c98d5a', 3, 1), 2.6, 1.9, 2.2, [0, 0.95, 0]);
  caja(kiosko, madera, 2.9, 0.14, 0.7, [0, 1, -1.3]);
  cono(kiosko, textura('tejas', '#ef5565', 6, 2), 2.4, 1.2, [0, 2.5, 0], 4, [0, PI / 4, 0]);
  cartel(kiosko, ['EL DIARIO'], 2.2, 0.55, [0, 1.6, -1.12], [0, PI, 0], '#f3ecdc', '#14203a', '"Alfa Slab One", serif');
  for (let i = 0; i < 4; i++) caja(kiosko, blanco, 0.55, 0.05, 0.4, [-0.8 + (i % 2) * 0.08, 1.1 + i * 0.05, -1.3]);
  const escenario = tocable(grupo({ ...SITIOS.escenario, y: 1.5 }, PI), 'escenario');
  cil(escenario, m('#8a5fd0'), 2.8, 3, 0.5, [0, 0.25, 0], 20);
  caja(escenario, m('#3a2a66'), 5.6, 3.6, 0.3, [0, 2.3, 2.4]);
  for (const s of [-1, 1]) { caja(escenario, oscuro, 0.8, 1.4, 0.7, [s * 2.2, 1.2, 1.6]); cil(escenario, palo, 0.09, 0.09, 4.4, [s * 2.7, 2.2, 2.2], 6); }
  caja(escenario, oscuro, 5.6, 0.14, 0.14, [0, 4.3, 2.1]);
  ['#ef5565', '#ffd84a', '#4fb8f0', '#5fc46a'].forEach((color, i) => esfera(escenario, brillo(color, color, 0.3, 2), 0.2, [-1.8 + i * 1.2, 4.1, 2.1]));
  cil(escenario, oscuro, 0.03, 0.03, 1.3, [0, 1.15, -0.9], 6);
  esfera(escenario, oscuro, 0.1, [0, 1.85, -0.9]);

  // Faroles a lo largo de los caminos
  const puntosFarol = [...[0, 45, 90, 135, 180, 225, 270, 315].map((gr) => polar(gr + 22, ANILLO + 1.2)), ...[4, 90, -52, 160, -160].flatMap((gr) => [polar(gr + 4, 19), polar(gr - 4, 25)]), polar(176, 17), polar(184, 22)];
  for (const p of puntosFarol) {
    const f = grupo(p);
    cil(f, oscuro, 0.07, 0.11, 3, [0, 1.5, 0], 6);
    esfera(f, farol, 0.24, [0, 3.15, 0]);
    cono(f, oscuro, 0.3, 0.2, [0, 3.45, 0], 6);
  }
  const luzPlaza = new THREE.PointLight('#ffd98a', 0, 40, 1.4);
  luzPlaza.position.set(CENTRO.x, 7, CENTRO.z);
  mundo.add(luzPlaza);
  for (const gr of [4, 90, 180, -52]) {
    const s = grupo(polar(gr + 9, ANILLO + 1.4), (gr * PI) / 180);
    cil(s, palo, 0.07, 0.07, 2.2, [0, 1.1, 0], 6);
    caja(s, m('#ffd84a'), 1, 0.3, 0.06, [0.3, 1.9, 0]);
    caja(s, m('#4fb8f0'), 1, 0.3, 0.06, [-0.3, 1.5, 0], [0, 1.2, 0]);
  }

  // ───────── Casas club ─────────
  CASAS.forEach((c, i) => {
    const casa = tocable(grupo({ x: c.x, z: c.z }, Math.atan2(c.puerta.x - c.x, c.puerta.z - c.z)), `casa-${i}`);
    const color = m(COLORES_CASAS[i]), pared = textura('estuco', PAREDES[i], 2, 2), tejas = textura('tejas', COLORES_CASAS[i], 7, 2, true);
    caja(casa, piedra, 5.5, 0.3, 4.7, [0, 0.15, 0]);
    caja(casa, pared, 5, 2.6, 4.2, [0, 1.6, 0]);
    caja(casa, pared, 4.4, 2, 3.8, [0, 3.9, 0]);
    caja(casa, color, 5.2, 0.16, 4.4, [0, 2.95, 0]);
    techo(casa, tejas, 5, 4.4, 1.9, [0, 4.9, 0]);
    caja(casa, textura('piedra', '#a5523a', 1, 2), 0.6, 1.6, 0.6, [1.4, 6, -0.8]);
    caja(casa, madera, 5.2, 0.2, 1.7, [0, 0.4, 2.95]);
    caja(casa, color, 5.4, 0.18, 1.9, [0, 3, 2.95]);
    for (const x of [-2.3, -0.85, 0.85, 2.3]) cil(casa, blanco, 0.14, 0.16, 2.45, [x, 1.72, 3.55], 10);
    caja(casa, piedra, 1.7, 0.2, 0.5, [0, 0.2, 4.05]);
    caja(casa, color, 0.95, 1.75, 0.1, [0, 1.38, 2.14]);
    esfera(casa, m('#ffd84a'), 0.06, [0.3, 1.35, 2.22]);
    for (const [x, y, z] of [[-1.55, 1.85, 2.13], [1.55, 1.85, 2.13], [-1.25, 4, 1.93], [0, 4, 1.93], [1.25, 4, 1.93]] as V3[]) {
      caja(casa, blanco, 1.02, 1.08, 0.06, [x, y, z - 0.01]);
      caja(casa, ventana, 0.82, 0.88, 0.08, [x, y, z]);
    }
    caja(casa, oscuro, 1.5, 1.2, 0.1, [0, 3.72, 3.8]);
    cartel(casa, [LETRAS[i]], 1.3, 1, [0, 3.72, 3.86], undefined, '#14203a', '#ffe08a', 'Georgia, serif');
    cil(casa, palo, 0.05, 0.05, 2.6, [2.3, 6, 1.6], 6);
    caja(casa, color, 1, 0.6, 0.04, [2.85, 6.95, 1.6]);
    for (let x = -3.3; x <= 3.31; x += 0.66) if (Math.abs(x) > 1.1) caja(casa, blanco, 0.12, 0.75, 0.12, [x, 0.38, 6]);
    for (const s of [-1, 1]) { caja(casa, blanco, 2.2, 0.08, 0.06, [s * 2.25, 0.55, 6]); caja(casa, blanco, 0.06, 0.08, 2.9, [s * 3.3, 0.55, 4.55]); }
    cil(casa, palo, 0.05, 0.05, 0.9, [1.25, 0.45, 6.2], 6);
    caja(casa, color, 0.34, 0.26, 0.5, [1.25, 1, 6.2]);
    for (const [x, z, r] of [[-2.9, 3.3, 0.55], [2.9, 3.3, 0.5], [-2.6, 5.2, 0.42]]) esfera(casa, i % 2 ? verde : verde2, r, [x, r * 0.7, z], [1, 0.8, 1]);
    esfera(casa, zapallo, 0.3, [-1.5, 0.82, 3.9], [1.15, 0.85, 1.15]);
  });

  // ───────── Alcaldía con torre del reloj ─────────
  const torre = tocable(grupo({ ...SITIOS.torre, y: 1.5 }, haciaCentro(SITIOS.torre)), 'alcaldia');
  caja(torre, textura('estuco', '#f1e3c4', 3, 2), 6.4, 3, 3.8, [0, 1.5, 0]);
  techo(torre, textura('tejas', '#a5523a', 8, 2, true), 6.8, 4.2, 1.6, [0, 3, 0]);
  caja(torre, textura('piedra', '#e8d7b0', 2, 6), 2.6, 8.4, 2.6, [0, 4.2, 0.2]);
  caja(torre, gris, 3, 0.3, 3, [0, 8.5, 0.2]);
  cono(torre, textura('tejas', '#a5523a', 6, 2), 2, 2.2, [0, 9.75, 0.2], 4, [0, PI / 4, 0]);
  cil(torre, blanco, 0.95, 0.95, 0.1, [0, 6.9, 1.52], 20, [PI / 2, 0, 0]);
  const manos = [0.5, 0.75].map((largo, i) => {
    const pivote = new THREE.Group();
    pivote.position.set(0, 6.9, 1.6 + i * 0.02);
    torre.add(pivote);
    caja(pivote, oscuro, 0.08 - i * 0.03, largo, 0.03, [0, largo / 2, 0]);
    return pivote;
  });
  caja(torre, palo, 1.1, 1.9, 0.1, [0, 0.95, 1.92]);
  for (const s of [-1, 1]) { caja(torre, ventana, 0.8, 1, 0.08, [s * 2.2, 1.7, 1.92]); cil(torre, blanco, 0.16, 0.18, 2.6, [s * 1.1, 1.3, 2.3], 10); }
  cartel(torre, ['ALCALDÍA'], 2.4, 0.5, [0, 3.3, 1.56], undefined, '#14203a', '#ffe08a', 'Graduate, serif');

  // ───────── Cafetería, mercado y cancha ─────────
  const cafe = tocable(grupo({ ...SITIOS.cafe, y: 1.5 }, haciaCentro(SITIOS.cafe)), 'cafe');
  caja(cafe, textura('estuco', '#ffd7a8', 2, 2), 4.2, 2.8, 3, [0, 1.4, 0]);
  caja(cafe, m('#a5523a'), 4.5, 0.25, 3.3, [0, 2.9, 0]);
  for (let i = 0; i < 6; i++) caja(cafe, m(i % 2 ? '#f3ecdc' : '#ef5565'), 0.7, 0.08, 1.5, [-1.75 + i * 0.7, 2.45, 2.1], [0.35, 0, 0]);
  caja(cafe, palo, 0.9, 1.7, 0.1, [-1.1, 0.85, 1.52]);
  caja(cafe, ventana, 1.6, 1.1, 0.08, [0.9, 1.6, 1.52]);
  cartel(cafe, ['CAFÉ'], 1.8, 0.5, [0, 3.35, 1.4], undefined, '#14203a', '#ffe08a', '"Alfa Slab One", serif');
  for (const s of [-1, 1]) {
    cil(cafe, blanco, 0.6, 0.6, 0.06, [s * 1.5, 0.75, 3.6], 12);
    cil(cafe, oscuro, 0.05, 0.05, 2.2, [s * 1.5, 1.1, 3.6], 6);
    cono(cafe, m(s > 0 ? '#ffd84a' : '#4fb8f0'), 1.05, 0.5, [s * 1.5, 2.3, 3.6], 8);
  }
  const mercado = tocable(grupo({ ...SITIOS.mercado, y: 1.5 }, haciaCentro(SITIOS.mercado)), 'mercado');
  [-1, 1].forEach((s, k) => {
    caja(mercado, madera, 2.1, 0.85, 1, [s * 1.3, 0.43, 0]);
    for (const [x, z] of [[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45]]) cil(mercado, palo, 0.05, 0.05, 2.3, [s * 1.3 + x, 1.15, z], 6);
    for (let i = 0; i < 4; i++) caja(mercado, m(i % 2 ? '#f3ecdc' : ALEGRES[k * 2 + 2]), 0.55, 0.07, 1.3, [s * 1.3 - 0.83 + i * 0.55, 2.35, 0.1], [0.25, 0, 0]);
    for (let i = 0; i < 6; i++) esfera(mercado, m(ALEGRES[(i + k) % ALEGRES.length]), 0.14, [s * 1.3 - 0.7 + (i % 3) * 0.7, 0.97, -0.2 + Math.floor(i / 3) * 0.4]);
  });
  const ch = SITIOS.cancha;
  const pista = document.createElement('canvas');
  pista.width = 256; pista.height = 164;
  const gp = pista.getContext('2d')!;
  gp.fillStyle = '#c9714d'; gp.fillRect(0, 0, 256, 164);
  gp.strokeStyle = '#fff'; gp.lineWidth = 4; gp.strokeRect(10, 10, 236, 144);
  gp.beginPath(); gp.moveTo(128, 10); gp.lineTo(128, 154); gp.stroke();
  gp.beginPath(); gp.arc(128, 82, 28, 0, PI * 2); gp.stroke();
  const texPista = new THREE.CanvasTexture(pista);
  texPista.colorSpace = THREE.SRGBColorSpace;
  pon(mundo, new THREE.PlaneGeometry(7.2, 4.6), new THREE.MeshStandardMaterial({ map: texPista, roughness: 0.9 }), [ch.x, 1.56, ch.z], [-PI / 2, 0, 0]).castShadow = false;
  for (const s of [-1, 1]) {
    const arco = grupo({ x: ch.x + s * 3.4, z: ch.z, y: 1.5 });
    for (const z of [-0.9, 0.9]) cil(arco, blanco, 0.06, 0.06, 1.5, [0, 0.75, z], 6);
    caja(arco, blanco, 0.1, 0.1, 1.9, [0, 1.5, 0]);
  }
  esfera(mundo, blanco, 0.22, [ch.x + 0.8, 1.74, ch.z + 0.6]);

  // ───────── Laguna ─────────
  const laguna = grupo({ ...SITIOS.laguna, y: 1.5 });
  cil(laguna, new THREE.MeshStandardMaterial({ color: '#3fa7d6', roughness: 0.2, transparent: true, opacity: 0.9 }), 2.7, 2.7, 0.06, [0, 0.04, 0], 20).castShadow = false;
  for (let i = 0; i < 11; i++) { const a = (i / 11) * PI * 2; piedraEn(laguna, gris, 0.32 + al(i, 'lr') * 0.25, [Math.sin(a) * 2.75, 0.15, Math.cos(a) * 2.75], i); }
  for (let i = 0; i < 5; i++) cil(laguna, verde2, 0.3, 0.3, 0.03, [(al(i, 'nx') - 0.5) * 3, 0.09, (al(i, 'nz') - 0.5) * 3], 8);
  for (let i = 0; i < 5; i++) { const a = 2.2 + i * 0.25; cil(laguna, verde, 0.03, 0.03, 1.2, [Math.sin(a) * 2.3, 0.6, Math.cos(a) * 2.3], 5); cil(laguna, palo, 0.06, 0.06, 0.3, [Math.sin(a) * 2.3, 1.25, Math.cos(a) * 2.3], 6); }

  // ───────── Volcán y portón de la arena ─────────
  const vol = grupo({ ...SITIOS.volcan, y: terreno(SITIOS.volcan.x, SITIOS.volcan.z) - 1.5 });
  cil(vol, m('#5a4a66'), 3, 10.5, 13, [0, 6.5, 0], 9);
  const lava = brillo('#ff5a3c', '#ff3a1c', 1, 1.6);
  cil(vol, lava, 2.6, 2.6, 0.3, [0, 12.95, 0], 9).castShadow = false;
  for (let i = 0; i < 10; i++) { const a = al(i, 'va') * PI * 2; piedraEn(vol, m('#4a3c56'), 0.9 + al(i, 'vr') * 1.2, [Math.sin(a) * 10.5, 0.8, Math.cos(a) * 10.5], i); }
  const humo = Array.from({ length: 7 }, () => pon(vol, bolita, new THREE.MeshBasicMaterial({ color: '#b8b3c4', transparent: true, opacity: 0.5, depthWrite: false })));
  humo.forEach((h) => { h.castShadow = h.receiveShadow = false; });
  animados.push((seg) => humo.forEach((h, i) => {
    const t = (seg * 0.07 + i / humo.length) % 1;
    h.position.set(Math.sin(i * 2.1 + t * 3) * (0.5 + t * 3), 13.5 + t * 14, Math.cos(i * 1.7) * t * 2.5);
    h.scale.setScalar(1.2 + t * 3.4);
    (h.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
  }));
  const porton = tocable(grupo(SITIOS.porton), 'arena');
  caja(porton, oscuro, 5, 5, 4, [0, 2.3, -2.4]);
  caja(porton, oscuro, 3.5, 3.8, 0.5, [0, 1.9, -0.3]);
  for (const s of [-1, 1]) { caja(porton, piedra, 1, 4.4, 1.1, [s * 2.25, 2.2, 0.1]); caja(porton, gris, 1.2, 0.3, 1.3, [s * 2.25, 4.5, 0.1]); }
  caja(porton, piedra, 5.7, 0.95, 1.2, [0, 4.5, 0.1]);
  cono(porton, gris, 0.9, 0.9, [0, 5.4, 0.1], 4, [0, PI / 4, 0]);
  const cadena = brillo('#ef5565', '#ef5565', 0.7, 1.5);
  for (const s of [-1, 1]) caja(porton, cadena, 4.7, 0.2, 0.12, [0, 1.95, 0.02], [0, 0, s * 0.82]);
  cartel(porton, ['LA ARENA', 'Sellada hasta el 13 de nov'], 3.6, 1.2, [0, 6.5, 0.3], [-0.25, 0, 0]);
  const flamas = [-1, 1].map((s) => { cil(porton, palo, 0.07, 0.07, 1.1, [s * 2.25, 2.4, 0.8], 6, [0.5, 0, 0]); return cono(porton, llama, 0.24, 0.6, [s * 2.25, 3.15, 1.1], 7); });
  const luzPorton = new THREE.PointLight('#ff4a3a', 14, 18, 1.6);
  luzPorton.position.set(SITIOS.porton.x, terreno(SITIOS.porton.x, SITIOS.porton.z) + 3, SITIOS.porton.z + 3);
  mundo.add(luzPorton);
  animados.push((seg) => { flamas.forEach((f, i) => f.scale.set(1, 0.85 + Math.sin(seg * 9 + i * 2) * 0.2, 1)); luzPorton.intensity = 22 + Math.sin(seg * 2.2) * 9; });

  // ───────── Faro en el acantilado ─────────
  const faro = tocable(grupo(SITIOS.faro), 'faro');
  faro.scale.setScalar(1.25);
  for (let i = 0; i < 4; i++) cil(faro, i % 2 ? blanco : m('#ef5565'), 1.5 - (i + 1) * 0.14, 1.5 - i * 0.14, 2.1, [0, 1.05 + i * 2.1, 0], 12);
  cil(faro, oscuro, 1.35, 1.35, 0.2, [0, 8.5, 0], 12);
  cil(faro, farol, 0.7, 0.7, 1.1, [0, 9.15, 0], 10);
  cono(faro, m('#ef5565'), 1.05, 1, [0, 10.2, 0], 10);
  caja(faro, palo, 0.7, 1.4, 0.1, [0, 0.7, 1.5]);
  const giroFaro = new THREE.Group();
  giroFaro.position.y = 9.15;
  faro.add(giroFaro);
  const matHaz = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const haz = pon(giroFaro, new THREE.ConeGeometry(3.2, 34, 14, 1, true), matHaz, [17, 0, 0], [0, 0, PI / 2]);
  haz.castShadow = haz.receiveShadow = false;
  animados.push((seg, noche) => { giroFaro.rotation.y = seg * 0.55; matHaz.opacity = noche * 0.2; });

  // ───────── Molino de viento ─────────
  const molino = tocable(grupo(SITIOS.molino, haciaCentro(SITIOS.molino)), 'molino');
  cil(molino, textura('piedra', '#f1e9d6', 4, 3), 1.7, 2.5, 6.4, [0, 3.2, 0], 10);
  cono(molino, textura('tejas', '#c0452f', 6, 2), 2.1, 2, [0, 7.4, 0], 10);
  caja(molino, palo, 0.9, 1.7, 0.2, [0, 0.85, 2.35]);
  caja(molino, ventana, 0.7, 0.8, 0.2, [0, 3.8, 1.95]);
  const aspas = new THREE.Group();
  aspas.position.set(0, 5.9, 2.2);
  molino.add(aspas);
  cil(aspas, palo, 0.2, 0.2, 0.9, [0, 0, -0.2], 8, [PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const brazo = new THREE.Group();
    brazo.rotation.z = (i * PI) / 2;
    aspas.add(brazo);
    caja(brazo, palo, 0.14, 4.6, 0.1, [0, 2.3, 0]);
    caja(brazo, m('#f6f0e0'), 1.1, 3.4, 0.05, [0.6, 2.8, 0]);
    for (let k = 0; k < 4; k++) caja(brazo, palo, 1.1, 0.06, 0.08, [0.6, 1.3 + k * 1, 0.02]);
  }
  animados.push((seg) => { aspas.rotation.z = seg * 0.5; });

  // ───────── Granja ─────────
  const granja = tocable(grupo(SITIOS.granja, haciaCentro(SITIOS.granja)), 'granja');
  caja(granja, textura('madera', '#c0452f', 4, 1), 5, 3.2, 4, [0, 1.6, -3.5]);
  techo(granja, textura('tejas', '#7a4a3a', 7, 2, true), 5.4, 4.6, 2, [0, 3.2, -3.5]);
  caja(granja, blanco, 1.8, 2.2, 0.1, [0, 1.1, -1.48]);
  caja(granja, m('#c0452f'), 0.12, 2.6, 0.12, [0, 1.3, -1.42], [0, 0, 0.7]);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; if (Math.abs(a - PI) < 0.5) continue; caja(granja, palo, 0.14, 0.9, 0.14, [Math.sin(a) * 7.6, 0.45, Math.cos(a) * 7.6 + 0.5]); }
  for (let fila = 0; fila < 4; fila++) { caja(granja, m('#8a5a38'), 4.4, 0.16, 0.6, [-3.2, 0.08, 1.2 + fila * 1.1]); for (let k = 0; k < 6; k++) esfera(granja, k % 2 ? verde : verde2, 0.2, [-5.1 + k * 0.76, 0.32, 1.2 + fila * 1.1]); }
  for (const [x, z] of [[3.6, 3.4], [4.6, 2.2]]) cil(granja, m('#e8c56a'), 0.6, 0.6, 0.9, [x, 0.6, z], 12, [PI / 2, 0, 0.3]);
  const ovejas = Array.from({ length: 6 }, (_, i) => {
    const o = new THREE.Group();
    esfera(o, blanco, 0.5, [0, 0.62, 0], [1.25, 0.9, 0.9]);
    esfera(o, oscuro, 0.22, [0.62, 0.72, 0]);
    for (const [x, z] of [[-0.3, -0.2], [-0.3, 0.2], [0.35, -0.2], [0.35, 0.2]]) cil(o, oscuro, 0.06, 0.06, 0.36, [x, 0.18, z], 5);
    granja.add(o);
    return { o, x: 1 + (al(i, 'ovx') - 0.3) * 6, z: 1.5 + al(i, 'ovz') * 4.5, fase: i * 1.7 };
  });
  animados.push((seg) => ovejas.forEach((ov) => {
    const a = seg * 0.12 + ov.fase;
    ov.o.position.set(ov.x + Math.sin(a) * 0.9, Math.abs(Math.sin(seg * 3 + ov.fase)) * 0.04, ov.z + Math.cos(a * 0.8) * 0.7);
    ov.o.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a * 0.8) * 0.8) - PI / 2;
  }));

  // ───────── Campamento ─────────
  const camping = tocable(grupo(SITIOS.camping), 'camping');
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; piedraEn(camping, gris, 0.18, [Math.sin(a) * 0.6, 0.1, -3 + Math.cos(a) * 0.6], i); }
  cono(camping, llama, 0.3, 0.8, [0, 0.5, -3], 7);
  for (const s of [-1, 1]) cil(camping, palo, 0.24, 0.24, 1.7, [s * 1.7, 0.24, -3], 8, [PI / 2, 0, s * 0.4]);

  // ───────── Playa, fogata y muelle ─────────
  const pl = SITIOS.playa;
  [[-7, -0.5, '#ef5565'], [-2.5, 1.8, '#4fb8f0'], [3, 0.3, '#ffd84a'], [-11, -2, '#ff7ab8'], [8, 1.5, '#5fc46a']].forEach(([dx, dz, color], i) => {
    const s = grupo({ x: pl.x + (dx as number), z: pl.z + (dz as number) });
    cil(s, blanco, 0.05, 0.05, 2.6, [0, 1.3, 0], 6, [0, 0, 0.12]);
    cono(s, m(color as string), 1.5, 0.7, [-0.15, 2.6, 0], 8);
    caja(s, m(ALEGRES[(i + 2) % ALEGRES.length]), 0.9, 0.04, 1.9, [1.3, 0.04, 0.2], [0, 0.3, 0]);
  });
  const castillo = grupo({ x: pl.x + 5.5, z: pl.z + 2.4 });
  for (const [x, z] of [[0, 0], [0.5, 0.1], [-0.45, 0.2]]) { cil(castillo, m('#e2c98c'), 0.24, 0.28, 0.5, [x, 0.25, z], 8); cono(castillo, m('#e2c98c'), 0.26, 0.3, [x, 0.65, z], 8); }
  esfera(mundo, m('#ef5565'), 0.3, [pl.x + 1, terreno(pl.x + 1, pl.z + 3) + 0.3, pl.z + 3]);
  const fogata = grupo(SITIOS.fogata);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2; piedraEn(fogata, gris, 0.2, [Math.sin(a) * 0.7, 0.1, Math.cos(a) * 0.7], i); }
  for (let i = 0; i < 3; i++) cil(fogata, palo, 0.12, 0.12, 1.2, [0, 0.2, 0], 8, [PI / 2, 0, (i * PI) / 3]);
  const fuego = [0.45, 0.3].map((r, i) => cono(fogata, llama, r, 1.1 - i * 0.3, [i * 0.12, 0.7, i * -0.1], 8));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2 + 0.6; cil(fogata, palo, 0.26, 0.26, 1.9, [Math.sin(a) * 2.3, 0.26, Math.cos(a) * 2.3], 8, [PI / 2, 0, a]); }
  const chispas = Array.from({ length: 8 }, () => pon(fogata, bolita, new THREE.MeshBasicMaterial({ color: '#ffd45a', transparent: true })));
  chispas.forEach((c) => { c.castShadow = false; });
  const luzFogata = new THREE.PointLight('#ff9a2e', 0, 22, 1.6);
  luzFogata.position.set(SITIOS.fogata.x, terreno(SITIOS.fogata.x, SITIOS.fogata.z) + 1.6, SITIOS.fogata.z);
  mundo.add(luzFogata);
  animados.push((seg, noche) => {
    fuego.forEach((f, i) => f.scale.set(1, 0.85 + Math.sin(seg * 8 + i * 3) * 0.22, 1));
    chispas.forEach((c, i) => {
      const t = (seg * 0.5 + i / chispas.length) % 1;
      c.position.set(Math.sin(i * 2.4) * 0.3 + Math.sin(seg + i) * 0.15, 0.9 + t * 2.4, Math.cos(i * 1.9) * 0.3);
      c.scale.setScalar(0.05 * (1 - t));
      c.visible = noche > 0.2;
    });
    luzFogata.intensity = noche * (55 + Math.sin(seg * 7) * 9);
  });
  const muelle = tocable(grupo({ x: 98, z: 2, y: 0 }), 'muelle');
  caja(muelle, madera, 18.5, 0.2, 2.5, [0, 0.98, 0]);
  for (const x of [-8, -4, 0, 4, 8.8]) for (const s of [-1, 1]) cil(muelle, m('#5e3e22'), 0.17, 0.17, 3.4, [x, 0, s * 1.15], 8);
  caja(muelle, m('#b98a52'), 0.8, 0.8, 0.8, [3, 1.48, -0.7]); caja(muelle, m('#c79a62'), 0.6, 0.6, 0.6, [3.9, 1.38, -0.75], [0, 0.4, 0]);
  cil(muelle, m('#8a5a38'), 0.38, 0.38, 0.9, [-1.5, 1.53, 0.75], 10);
  const bote = new THREE.Group();
  bote.position.set(5, 0.1, 2.8);
  muelle.add(bote);
  esfera(bote, m('#a5523a'), 1, [0, 0, 0], [1.9, 0.5, 0.8]);
  caja(bote, palo, 0.25, 0.08, 1.3, [0, 0.3, 0]);
  animados.push((seg) => { bote.position.y = 0.12 + Math.sin(seg * 1.3) * 0.07; bote.rotation.z = Math.sin(seg * 0.9) * 0.07; });
  const peces = Array.from({ length: 3 }, (_, i) => ({ o: esfera(mundo, m('#ffb14a'), 0.28, [0, -1, 0], [1.6, 0.6, 0.35]), x: 103 + i * 4, z: -4 - i * 3, fase: i * 2.3 }));
  animados.push((seg) => peces.forEach((pz) => {
    const t = ((seg * 0.25 + pz.fase) % 1) * 3; // salta durante un tercio del ciclo
    pz.o.visible = t < 1;
    pz.o.position.set(pz.x + t * 1.6, Math.sin(t * PI) * 1.4 - 0.2, pz.z);
    pz.o.rotation.z = (0.5 - t) * 1.6;
  }));

  // ───────── Bosques y vegetación ─────────
  const troncos: { p: V3; e: V3; c: string }[] = [], copas: { p: V3; e: V3; r?: V3; c: string }[] = [], conos: { p: V3; e: V3; c: string }[] = [];
  const arboles: (Siembra & { pino: boolean })[] = [], palmas: Siembra[] = [];
  const plantar = (x: number, z: number, i: number, pino: boolean) => {
    const y = terreno(x, z), s = 1 + al(i, 'ts') * 0.8;
    arboles.push({ x, y, z, s: s * (pino ? 3.9 : 3.5), giro: al(i, 'tgiro') * 6.3, pino });
    troncos.push({ p: [x, y + s * 0.9, z], e: [s, s * 1.8, s], c: pino ? '#6b4a2b' : '#8a5a38' });
    if (pino) {
      const color = PINOS[i % PINOS.length];
      [[1.7, 1.5], [2.7, 1.15], [3.6, 0.8]].forEach(([alto, radio]) => conos.push({ p: [x, y + s * alto, z], e: [s * radio, s * 1.7, s * radio], c: color }));
    } else {
      const color = OTONO[Math.floor(al(i, 'tc') * OTONO.length)];
      copas.push({ p: [x, y + s * 2.7, z], e: [s * 1.5, s * 1.35, s * 1.5], r: [al(i, 'tr') * 3, al(i, 'tq') * 3, 0], c: color });
      copas.push({ p: [x + s * 0.8, y + s * 2.2, z + s * 0.3], e: [s * 1.05, s * 0.95, s * 1.05], r: [al(i, 'tq') * 3, 0, 0], c: color });
    }
  };
  const lejosDeSitios = (x: number, z: number, margen: number) => Object.values(SITIOS).every((s) => Math.hypot(x - s.x, z - s.z) > margen);
  let plantados = 0;
  const lejosDeCasas = (x: number, z: number) => CASAS.every((c) => Math.hypot(x - c.x, z - c.z) > 8.5 && distTramo(x, z, c, c.puerta) > 3);
  for (let i = 0; i < 8000 && plantados < 640; i++) {
    const x = (al(i, 'tx') - 0.5) * 290, z = (al(i, 'tz') - 0.5) * 290;
    if (!lejosDeCasas(x, z)) continue;
    if (costa(Math.atan2(x, z)) - Math.hypot(x, z) < 9 || Math.hypot(x - CENTRO.x, z - CENTRO.z) < RADIO_PUEBLO + 4) continue;
    const h = terreno(x, z);
    if (h > 10.5 || h < 1.2 || Math.hypot(x - SITIOS.volcan.x, z - SITIOS.volcan.z) < 15 || Math.hypot(x - SITIOS.lago.x, z - SITIOS.lago.z) < 11) continue;
    if (Math.sin(x * 0.07 + 2) + Math.cos(z * 0.06 - 1) < -0.3 && al(i, 'tb') > 0.2) continue; // deja claros entre los bosques
    if (enCamino(x, z, 2.8) || distRio(x, z) < 3.8 || !lejosDeSitios(x, z, 7)) continue;
    plantar(x, z, i, h > 4.2 || al(i, 'tp') < 0.3);
    plantados++;
  }
  [20, 44, 60, 80, 100, 121, 136, 150, 172, -20, -40, -62, -82, -99, -121, -150, -172].forEach((gr, i) => { const p = polar(gr, 26.5 + al(i, 'pr') * 2); plantar(p.x, p.z, 5000 + i, i % 5 === 0); });
  // Versión hecha por código: solo se usa si los modelos de artistas no cargan
  const vegetacionSimple = () => {
    instancias(new THREE.CylinderGeometry(0.2, 0.3, 1, 6), troncos);
    instancias(bolita, copas);
    instancias(new THREE.ConeGeometry(1, 1, 7), conos);
    instancias(bolita, matas); instancias(new THREE.IcosahedronGeometry(1, 0), flores).castShadow = false; instancias(roca, rocas);
    palmas.forEach((p, i) => palmera(p, i));
  };

  const matas: { p: V3; e: V3; c: string }[] = [], flores: { p: V3; e: V3; c: string }[] = [], rocas: { p: V3; e: V3; r?: V3; c: string }[] = [];
  for (let i = 0; i < 2800 && matas.length < 300; i++) {
    const x = (al(i, 'bx') - 0.5) * 280, z = (al(i, 'bz') - 0.5) * 280, dc = Math.hypot(x - CENTRO.x, z - CENTRO.z);
    if (!lejosDeCasas(x, z) || Math.hypot(x - SITIOS.lago.x, z - SITIOS.lago.z) < 10) continue;
    if (costa(Math.atan2(x, z)) - Math.hypot(x, z) < 8 || (dc < RADIO_PUEBLO && (dc < 13.8 || dc > 16.2)) || enCamino(x, z, 1.9) || distRio(x, z) < 3.4 || !lejosDeSitios(x, z, 4.5)) continue;
    const y = terreno(x, z), r = 0.4 + al(i, 'bs') * 0.45;
    if (y > 10) continue;
    matas.push({ p: [x, y + r * 0.5, z], e: [r * 1.2, r * 0.8, r * 1.2], c: i % 3 ? '#4fa862' : '#6cc070' });
    for (let k = 0; k < 3; k++) flores.push({ p: [x + (al(i * 3 + k, 'fx') - 0.5) * 3, terreno(x, z) + 0.16, z + (al(i * 3 + k, 'fz') - 0.5) * 3], e: [0.13, 0.13, 0.13], c: ['#ffffff', '#ffd84a', '#ff7ab8', '#b388ff', '#ef5565'][(i + k) % 5] });
  }
  for (let i = 0; i < 44; i++) { const p = borde(i * 8.2 + al(i, 'rg') * 4, -2 + al(i, 'rd') * 5), r = 0.6 + al(i, 'rr') * 1.1; rocas.push({ p: [p.x, Math.max(0, terreno(p.x, p.z)) + r * 0.2, p.z], e: [r, r * 0.75, r], r: [al(i, 'ra') * 3, al(i, 'rb') * 3, 0], c: '#8d8a99' }); }
  for (let i = 0; i < 26; i++) { const a = al(i, 'ma') * PI * 2, d = 11 + al(i, 'md') * 13, x = SITIOS.volcan.x + Math.sin(a) * d, z = SITIOS.volcan.z + Math.cos(a) * d, r = 0.7 + al(i, 'mr2') * 1.3; rocas.push({ p: [x, terreno(x, z) + r * 0.3, z], e: [r, r * 0.8, r], r: [al(i, 'mb') * 3, al(i, 'mc') * 3, 0], c: '#7d7a88' }); }
  for (let i = 0; i < 22; i++) { const p = borde(al(i, 'sa') * 360, -(14 + al(i, 'sd') * 40)), r = 1.4 + al(i, 'sr') * 2.2; rocas.push({ p: [p.x, r * 0.2, p.z], e: [r, r * 0.8, r], r: [al(i, 'sb') * 3, al(i, 'sc') * 3, 0], c: '#6f6c7d' }); }
  const palmera = (sitio: Sitio, i: number, padre: THREE.Object3D = mundo) => {
    const palma = grupo(sitio, al(i, 'pg') * 6, padre);
    palma.rotation.z = (al(i, 'pz') - 0.5) * 0.3;
    for (let k = 0; k < 4; k++) cil(palma, m('#8a5a38'), 0.2 - k * 0.02, 0.24 - k * 0.02, 1.1, [k * 0.12, 0.5 + k * 1, 0], 7, [0, 0, -0.12]);
    for (let k = 0; k < 7; k++) {
      const hoja = new THREE.Group();
      hoja.position.set(0.42, 4.2, 0);
      hoja.rotation.set(0, (k / 7) * PI * 2, -0.45);
      palma.add(hoja);
      pon(hoja, bolita, verde, [1.25, 0, 0], undefined, [1.4, 0.07, 0.42]);
    }
    for (const [x, z] of [[0.6, 0.15], [0.3, -0.2], [0.25, 0.25]]) pon(palma, bolita, m('#6b4a2b'), [x, 3.95, z], undefined, [0.17, 0.17, 0.17]);
  };
  [-40, -30, -12, 20, 28, 40, 55, 70, 110, 130, 150, 170, -60, -85, -110, -135, -160, -175].forEach((gr, i) => {
    const p = borde(gr + al(i, 'pa2') * 4, 3 + al(i, 'pd') * 3);
    palmas.push({ ...p, y: terreno(p.x, p.z), s: 3.6 + al(i, 'ps') * 1.6, giro: al(i, 'pg') * 6.3 });
  });

  // ───────── Modelos de artistas (Kenney, CC0) ─────────
  const FRONDOSOS = ['tree_default', 'tree_default_fall', 'tree_oak', 'tree_oak_fall', 'tree_detailed', 'tree_detailed_fall', 'tree_fat', 'tree_simple_fall', 'tree_tall'];
  const CONIFERAS = ['tree_pineRoundC', 'tree_pineTallA', 'tree_pineDefaultA', 'tree_cone', 'tree_pineRoundA'];
  const PALMERAS = ['tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall'];
  const ARBUSTOS = ['plant_bush', 'plant_bushLarge', 'plant_bushDetailed'], FLORES = ['flower_redA', 'flower_yellowA', 'flower_purpleA', 'flower_yellowC', 'flower_purpleB'];
  const PIEDRAS = ['stone_largeA', 'stone_largeC', 'stone_largeE', 'stone_tallB', 'stone_tallD', 'stone_smallA'], HONGOS = ['mushroom_redGroup', 'mushroom_tanGroup', 'mushroom_redTall'];
  const usar = (nombres: string[]) => Promise.all(nombres.map((n) => cargar('naturaleza', n)));
  const repartir = (modelos: THREE.Group[], puntos: Siembra[], tema: string) => modelos.forEach((modelo, k) => {
    const mios = puntos.filter((_, i) => Math.floor(al(i, tema) * modelos.length) === k);
    if (mios.length) mundo.add(sembrar(modelo, mios));
  });
  const aSiembra = (lista: { p: V3; e: V3 }[], escala: number, baja: number): Siembra[] => lista.map((it, i) => ({ x: it.p[0], y: it.p[1] - it.e[1] * baja, z: it.p[2], s: it.e[0] * escala, giro: al(i, 'sg') * 6.3 }));
  Promise.all([usar(FRONDOSOS), usar(CONIFERAS), usar(PALMERAS), usar(ARBUSTOS), usar(FLORES), usar(PIEDRAS), usar(HONGOS)]).then(([frondosos, coniferas, palmeras, arbustos, floresM, piedras, hongos]) => {
    repartir(frondosos, arboles.filter((a) => !a.pino), 'mf');
    repartir(coniferas, arboles.filter((a) => a.pino), 'mc');
    repartir(palmeras, palmas, 'mp');
    repartir(arbustos, aSiembra(matas, 2.6, 0.6), 'ma');
    repartir(floresM, aSiembra(flores, 22, 1.2), 'mfl');
    repartir(piedras, aSiembra(rocas, 2.3, 0.3), 'mr');
    repartir(hongos, arboles.filter((_, i) => i % 5 === 0).map((a) => ({ ...a, x: a.x + 1.3, z: a.z + 0.9, y: terreno(a.x + 1.3, a.z + 0.9), s: 2.6 })), 'mh');
  }).catch(vegetacionSimple);

  // Piezas sueltas: carpas, canoa, cultivos, puestos, carreta y molino de agua
  const suelta = (paquete: Paquete, nombre: string, p: { x: number; z: number; y?: number }, escala: number, giro = 0, padre: THREE.Object3D = mundo) =>
    copia(paquete, nombre, { x: p.x, y: p.y ?? terreno(p.x, p.z), z: p.z }, escala, giro).then((o) => { padre.add(o); }).catch(() => undefined);
  suelta('naturaleza', 'tent_detailedOpen', { x: -2.6, z: 0.5, y: 0 }, 5, 0.5, camping);
  suelta('naturaleza', 'tent_smallOpen', { x: 2.6, z: 1.2, y: 0 }, 5, -0.6, camping);
  suelta('naturaleza', 'log_stack', { x: 4.2, z: -2.4, y: 0 }, 3.2, 0.4, camping);
  suelta('naturaleza', 'canoe', borde(84, 2.5), 4.2, 0.7);
  suelta('naturaleza', 'canoe_paddle', borde(85.5, 2.8), 4.2, 0.2);
  for (let i = 0; i < 5; i++) suelta('naturaleza', 'crop_pumpkin', { x: 2.2 + i * 1, z: 5.6, y: 0 }, 3.4, i, granja);
  for (let i = 0; i < 6; i++) suelta('naturaleza', i % 2 ? 'crops_cornStageD' : 'crops_cornStageC', { x: 2.2 + i * 0.85, z: 6.8, y: 0 }, 3.2, i, granja);
  suelta('naturaleza', 'statue_obelisk', polar(180, 21.5), 4.2);
  suelta('naturaleza', 'sign', polar(8, 31), 4, PI);
  suelta('pueblo', 'stall-red', { x: -4.4, z: 0.2, y: 0 }, 1.25, 0, mercado);
  suelta('pueblo', 'stall-green', { x: 4.4, z: 0.2, y: 0 }, 1.25, 0, mercado);
  suelta('pueblo', 'cart', polar(118, 13.6), 1.2, 1.1);
  suelta('pueblo', 'cart-high', { x: 4.6, z: 4.6, y: 0 }, 1.2, 0.6, granja);
  suelta('pueblo', 'watermill', { x: PUENTE.x - 3.4, z: PUENTE.z - 8 }, 1.7, 0.3);
  suelta('pueblo', 'lantern', polar(-16, 23.6), 1.3);

  // ───────── Zonas nuevas: lago, ruinas, cementerio y caleta ─────────
  const lago = tocable(grupo(SITIOS.lago), 'lago');
  cil(lago, new THREE.MeshStandardMaterial({ color: '#3fa7d6', roughness: 0.2, transparent: true, opacity: 0.9 }), 9, 9, 0.08, [0, 0.06, 0], 28).castShadow = false;
  for (let i = 0; i < 20; i++) { const a = (i / 20) * PI * 2; piedraEn(lago, gris, 0.5 + al(i, 'lgr') * 0.5, [Math.sin(a) * 9.2, 0.2, Math.cos(a) * 9.2], i); }
  esfera(lago, m('#72c066'), 1, [1.5, 0.1, 1], [2.6, 0.5, 2.2]);
  suelta('naturaleza', 'tree_oak', { x: 1.5, z: 1, y: 0.4 }, 3.4, 1, lago);
  for (let i = 0; i < 5; i++) suelta('naturaleza', i % 2 ? 'lily_small' : 'lily_large', { x: Math.sin(i * 1.9) * 5.5, z: Math.cos(i * 1.9) * 5.5, y: 0.1 }, 3.5, i, lago);
  const embarcadero = new THREE.Group();
  embarcadero.rotation.y = Math.atan2(-6.8, -6.8);
  lago.add(embarcadero);
  caja(embarcadero, madera, 1.6, 0.18, 5.4, [0, 0.42, 6.6]);
  for (const z of [4.4, 8.8]) for (const s of [-1, 1]) cil(embarcadero, palo, 0.12, 0.12, 1, [s * 0.7, 0.1, z], 6);
  suelta('naturaleza', 'canoe', { x: -3.6, z: 3, y: 0.08 }, 4, 0.9, lago);

  const ruinas = tocable(grupo(SITIOS.ruinas), 'ruinas');
  cil(ruinas, piedra, 5.6, 5.9, 0.2, [0, 0.1, 0], 18);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2; suelta('naturaleza', i % 3 === 1 ? 'statue_columnDamaged' : 'statue_column', { x: Math.sin(a) * 4.6, z: Math.cos(a) * 4.6, y: 0.2 }, 4.4, a, ruinas); }
  suelta('naturaleza', 'statue_head', { x: 0, z: 0, y: 0.2 }, 5, 0.6, ruinas);
  suelta('naturaleza', 'statue_ring', { x: 2.4, z: -1.6, y: 0.2 }, 4, 1.2, ruinas);
  suelta('naturaleza', 'statue_block', { x: -2.6, z: 1.8, y: 0.2 }, 4, 0.3, ruinas);

  const cementerio = tocable(grupo(SITIOS.cementerio), 'cementerio');
  for (let i = 0; i < 22; i++) { const a = (i / 22) * PI * 2; if (Math.abs(a - PI * 1.25) < 0.35) continue; caja(cementerio, oscuro, 0.12, 1.2, 0.12, [Math.sin(a) * 6.6, 0.6, Math.cos(a) * 6.6]); }
  for (let i = 0; i < 11; i++) {
    const x = ((i % 4) - 1.5) * 2.4 + al(i, 'tbx') * 0.6, z = (Math.floor(i / 4) - 1) * 2.8 + al(i, 'tbz') * 0.6, lapida = new THREE.Group();
    lapida.position.set(x, 0, z);
    lapida.rotation.set(0, (al(i, 'tby') - 0.5) * 0.5, (al(i, 'tbi') - 0.5) * 0.25);
    cementerio.add(lapida);
    caja(lapida, gris, 0.8, 0.9, 0.22, [0, 0.45, 0]);
    cil(lapida, gris, 0.4, 0.4, 0.22, [0, 0.9, 0], 10, [PI / 2, 0, 0]);
  }
  const seco = new THREE.Group();
  seco.position.set(4.2, 0, -3.6);
  cementerio.add(seco);
  cil(seco, m('#3a2f3a'), 0.18, 0.34, 3.4, [0, 1.7, 0], 6);
  for (const [gz, gy, alto] of [[0.9, 0, 2.6], [-0.8, 2, 3], [0.6, 4, 3.5], [-1.1, 5.2, 2.2]]) { const rama = new THREE.Group(); rama.position.y = alto; rama.rotation.set(0, gy, gz); seco.add(rama); cil(rama, m('#3a2f3a'), 0.05, 0.1, 1.5, [0, 0.75, 0], 5); }
  for (const [x, z] of [[-4.6, 4.4], [1.2, 5], [-1, -4.8]]) esfera(cementerio, zapallo, 0.34, [x, 0.3, z], [1.15, 0.85, 1.15]);
  const matFantasma = new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0, depthWrite: false });
  const fantasmas = [0, 1, 2].map((i) => { const f = new THREE.Group(); cementerio.add(f); pon(f, bola, matFantasma, [0, 0.4, 0], undefined, [0.5, 0.65, 0.5]).castShadow = false; pon(f, new THREE.ConeGeometry(0.5, 0.9, 8), matFantasma, [0, -0.3, 0], [PI, 0, 0]).castShadow = false; return { f, fase: i * 2.1 }; });
  animados.push((seg, noche) => {
    matFantasma.opacity = noche * 0.75;
    fantasmas.forEach(({ f, fase }) => f.position.set(Math.sin(seg * 0.3 + fase) * 3.6, 2.2 + Math.sin(seg * 1.1 + fase) * 0.5, Math.cos(seg * 0.23 + fase * 1.7) * 3.6));
  });

  const caleta = tocable(grupo(SITIOS.caleta, haciaCentro(SITIOS.caleta)), 'caleta'); // el frente mira a tierra; el muellecito sale hacia el mar
  [[-3.4, 0], [3.2, 1.2]].forEach(([x, z], i) => {
    const choza = new THREE.Group();
    choza.position.set(x, 0, z);
    caleta.add(choza);
    for (const [px, pz] of [[-1.1, -1], [1.1, -1], [-1.1, 1], [1.1, 1]]) cil(choza, palo, 0.12, 0.12, 2, [px, 0.6, pz], 6);
    caja(choza, madera, 2.8, 0.16, 2.6, [0, 1.6, 0]);
    caja(choza, textura('madera', i ? '#c98d5a' : '#b97a4a', 2, 1), 2.4, 1.7, 2.2, [0, 2.5, 0]);
    techo(choza, textura('tejas', i ? '#3f8cff' : '#2fae86', 5, 2, true), 3, 2.8, 1.2, [0, 3.35, 0]);
    caja(choza, ventana, 0.7, 0.7, 0.1, [0.5, 2.6, -1.12]);
  });
  for (const x of [-0.8, 0, 0.8]) { cil(caleta, palo, 0.05, 0.05, 1.8, [x, 0.9, 4.2], 5); }
  caja(caleta, palo, 2, 0.06, 0.06, [0, 1.7, 4.2]);
  for (let i = 0; i < 5; i++) esfera(caleta, m('#ffb14a'), 0.16, [-0.8 + i * 0.4, 1.45, 4.2], [0.5, 1.4, 0.3]);
  caja(caleta, madera, 1.8, 0.16, 7, [0, 0.9, -5.4]);
  for (const z of [-3, -6, -8.6]) for (const s of [-1, 1]) cil(caleta, palo, 0.12, 0.12, 2.6, [s * 0.8, 0, z], 6);
  esfera(caleta, m('#3f8cff'), 1, [2.4, 0.15, -7.4], [1.8, 0.45, 0.75]);

  // Árboles donde antes estaban las casas del pueblo
  [32, -32, 72, -72, 108, -108, 142].forEach((gr, i) => { const p = polar(gr, 20 + (i % 3)); plantar(p.x, p.z, 6000 + i, false); const q = polar(gr + 7, 23.5); plantar(q.x, q.z, 6100 + i, i % 2 === 0); });

  // Islotes mar adentro
  [[160, 90], [-170, -50], [62, -178]].forEach(([x, z], i) => {
    const isla = grupo({ x, z, y: 0 });
    esfera(isla, m('#f2deae'), 1, [0, -0.3, 0], [9 - i, 1.3, 7 - i]);
    esfera(isla, m('#72c066'), 1, [0, 0.2, 0], [5.5 - i, 1.1, 4.5 - i]);
    palmera({ x: 0.5, z: 0, y: 1.1 }, 40 + i, isla);
    piedraEn(isla, gris, 1.3, [-3, 0.6, 1.5], i);
    if (i === 0) { caja(isla, madera, 0.9, 0.6, 0.6, [2.4, 1.2, -0.6], [0, 0.5, 0]); caja(isla, m('#ffd84a'), 0.95, 0.12, 0.65, [2.4, 1.52, -0.6], [0, 0.5, 0]); }
  });

  // Calabazas de temporada
  [...BANCOS.map((b) => polar(b.grados + 16, 5.9)), polar(172, 22.5), polar(188, 22.5), { x: 5.4, z: 10.8 }, { x: -11.2, z: 11.5 }, polar(60, 14.6), polar(-150, 16.5), { x: 36, z: -25 }, { x: 28, z: 38 }].forEach((p, i) => {
    const r = 0.26 + al(i, 'cz') * 0.16, y = terreno(p.x, p.z);
    esfera(mundo, zapallo, r, [p.x, y + r * 0.8, p.z], [1.15, 0.85, 1.15]);
    cil(mundo, verde, 0.03, 0.05, 0.14, [p.x, y + r * 1.75, p.z], 6);
  });

  // ───────── Cielo ─────────
  const estrellas: number[] = [];
  for (let i = 0; i < 450; i++) {
    const a = i * 2.39996, y = 0.1 + ((i * 0.6180339) % 1) * 0.9, r = Math.sqrt(1 - y * y);
    estrellas.push(Math.cos(a) * r * 560, y * 560, Math.sin(a) * r * 560);
  }
  const geoEstrellas = new THREE.BufferGeometry();
  geoEstrellas.setAttribute('position', new THREE.Float32BufferAttribute(estrellas, 3));
  const matEstrellas = new THREE.PointsMaterial({ color: '#ffffff', size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
  mundo.add(new THREE.Points(geoEstrellas, matEstrellas));
  const astro = (r: number, color: string) => { const o = pon(mundo, new THREE.SphereGeometry(r, 20, 14), new THREE.MeshBasicMaterial({ color, fog: false })); o.castShadow = o.receiveShadow = false; return o; };
  const astroSol = astro(18, '#fff1a8'), astroLuna = astro(14, '#ffe9b8');

  const matNube = new THREE.MeshBasicMaterial({ color: clima === 2 ? '#aab2c2' : '#ffffff', transparent: true, opacity: 0.92, fog: false });
  const nubes = Array.from({ length: clima === 0 ? 8 : 18 }, (_, i) => {
    const n = new THREE.Group();
    for (let k = 0; k < 4; k++) { const b = pon(n, bola, matNube, [(k - 1.5) * 8, al(i * 7 + k, 'ny') * 3, al(i * 7 + k, 'nz2') * 5], undefined, [(6 + al(i * 7 + k, 'nr') * 5) * 1.25, (6 + al(i * 7 + k, 'nr') * 5) * 0.6, 6 + al(i * 7 + k, 'nr') * 5]); b.castShadow = b.receiveShadow = false; }
    n.userData = { z: -220 + al(i, 'nubez') * 440, y: 70 + al(i, 'nubey') * 40, v: 1 + al(i, 'nubev') * 1.8, x0: al(i, 'nubex') * 600 };
    mundo.add(n);
    return n;
  });
  animados.push((seg) => nubes.forEach((n) => n.position.set(((n.userData.x0 + seg * n.userData.v) % 600) - 300, n.userData.y, n.userData.z)));

  const gaviotas = Array.from({ length: 7 }, (_, i) => {
    const ave = new THREE.Group();
    const alas = [-1, 1].map((s) => { const piv = new THREE.Group(); ave.add(piv); caja(piv, blanco, 0.9, 0.05, 0.3, [s * 0.45, 0, 0]); return piv; });
    esfera(ave, blanco, 0.16, [0, 0, 0], [1, 1, 1.8]);
    mundo.add(ave);
    return { ave, alas, radio: 30 + i * 9, alto: 22 + i * 3.5, fase: i * 1.3, v: 0.13 + i * 0.015 };
  });
  animados.push((seg, noche) => gaviotas.forEach((gv) => {
    const a = seg * gv.v + gv.fase;
    gv.ave.visible = noche < 0.6;
    gv.ave.position.set(Math.sin(a) * gv.radio, gv.alto + Math.sin(seg * 0.4 + gv.fase) * 1.5, Math.cos(a) * gv.radio + 4);
    gv.ave.rotation.y = a + PI / 2;
    gv.alas.forEach((ala, i) => { ala.rotation.z = (i ? -1 : 1) * Math.sin(seg * 6 + gv.fase) * 0.6; });
  }));

  const velero = new THREE.Group();
  esfera(velero, m('#a5523a'), 1, [0, 0.3, 0], [3.2, 0.8, 1.2]);
  cil(velero, palo, 0.08, 0.08, 5.2, [0, 3, 0], 6);
  cono(velero, blanco, 2.2, 4.4, [0.9, 3.3, 0], 3).scale.z = 0.08;
  mundo.add(velero);
  animados.push((seg) => { const a = seg * 0.025; velero.position.set(Math.sin(a) * 176, Math.sin(seg) * 0.12, Math.cos(a) * 176); velero.rotation.set(0, a, Math.sin(seg * 0.8) * 0.05); });

  const globo = new THREE.Group();
  esfera(globo, m('#ef5565'), 3.4, [0, 4.6, 0], [1, 1.15, 1]);
  esfera(globo, m('#ffd84a'), 3.45, [0, 4.6, 0], [1.01, 0.42, 1.01]);
  cono(globo, m('#ef5565'), 1.6, 2.4, [0, 0.9, 0], 10, [PI, 0, 0]);
  caja(globo, madera, 1.3, 1, 1.3, [0, -1.6, 0]);
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) cil(globo, palo, 0.02, 0.02, 2.4, [x, 0, z], 4);
  mundo.add(globo);
  globo.scale.setScalar(0.8);
  animados.push((seg) => { const a = seg * 0.03 + 2; globo.position.set(Math.sin(a) * 84, 48 + Math.sin(seg * 0.3) * 3, Math.cos(a * 0.8) * 76); });

  // Luciérnagas de noche y mariposas de día, alrededor de la plaza y la laguna
  const N_BICHOS = 90, bichos = new Float32Array(N_BICHOS * 3), basesBichos: number[] = [];
  for (let i = 0; i < N_BICHOS; i++) { const p = i % 3 ? polar(al(i, 'lg') * 360, 4 + al(i, 'lr2') * 22) : { x: SITIOS.laguna.x + (al(i, 'lx') - 0.5) * 7, z: SITIOS.laguna.z + (al(i, 'lz') - 0.5) * 7 }; basesBichos.push(p.x, 2.2 + al(i, 'ly') * 2.5, p.z); }
  const geoBichos = new THREE.BufferGeometry();
  geoBichos.setAttribute('position', new THREE.BufferAttribute(bichos, 3));
  const matBichos = new THREE.PointsMaterial({ color: '#d6ff7a', size: 3, sizeAttenuation: false, transparent: true, opacity: 0 });
  mundo.add(new THREE.Points(geoBichos, matBichos));
  animados.push((seg, noche) => {
    matBichos.color.set(noche > 0.5 ? '#d6ff7a' : '#ffe14a');
    matBichos.opacity = noche > 0.5 ? noche * (0.6 + Math.sin(seg * 3) * 0.3) : (1 - noche) * 0.9;
    const v = noche > 0.5 ? 1 : 2.6; // las mariposas aletean más rápido
    for (let i = 0; i < N_BICHOS; i++) { bichos[i * 3] = basesBichos[i * 3] + Math.sin(seg * 0.7 * v + i) * 0.9; bichos[i * 3 + 1] = basesBichos[i * 3 + 1] + Math.sin(seg * 1.1 * v + i * 2) * 0.5; bichos[i * 3 + 2] = basesBichos[i * 3 + 2] + Math.cos(seg * 0.6 * v + i) * 0.9; }
    geoBichos.attributes.position.needsUpdate = true;
  });

  if (clima === 2) {
    const N = 1400, gotasLluvia = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { gotasLluvia[i * 3] = (al(i, 'rx') - 0.5) * 220; gotasLluvia[i * 3 + 1] = al(i, 'ry') * 60; gotasLluvia[i * 3 + 2] = (al(i, 'rz') - 0.5) * 220; }
    const geoLluvia = new THREE.BufferGeometry();
    geoLluvia.setAttribute('position', new THREE.BufferAttribute(gotasLluvia, 3));
    mundo.add(new THREE.Points(geoLluvia, new THREE.PointsMaterial({ color: '#cfe6ff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
    let anterior = 0;
    animados.push((seg) => {
      const dt = Math.min(0.1, seg - anterior); anterior = seg;
      for (let i = 0; i < N; i++) { gotasLluvia[i * 3 + 1] -= dt * 30; if (gotasLluvia[i * 3 + 1] < 0) gotasLluvia[i * 3 + 1] += 60; }
      geoLluvia.attributes.position.needsUpdate = true;
    });
  }

  // ───────── Luces ─────────
  const cielo = new THREE.HemisphereLight('#dff1ff', '#8a9a6a', 1.2);
  const sol = new THREE.DirectionalLight('#fff4e0', 2.6);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -165, right: 165, top: 165, bottom: -165, near: 20, far: 620 });
  sol.shadow.bias = -0.0006;
  sol.shadow.normalBias = 0.5;
  sol.shadow.autoUpdate = false; // se recalculan cada pocos cuadros, no en todos
  mundo.add(cielo, sol, sol.target);

  // Solo las cosas grandes proyectan sombra: los detalles chicos casi no se notan y cuestan mucho
  mundo.updateMatrixWorld(true);
  const medida = new THREE.Vector3();
  mundo.traverse((o) => {
    const malla = o as THREE.Mesh;
    if (!malla.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || !malla.castShadow) return;
    if (!malla.geometry.boundingSphere) malla.geometry.computeBoundingSphere();
    malla.getWorldScale(medida);
    if (malla.geometry.boundingSphere!.radius * Math.max(medida.x, medida.y, medida.z) < 0.8) malla.castShadow = false;
  });

  // Se detecta qué se mueve (corriendo las animaciones en dos instantes) y todo lo demás se funde en pocas mallas
  const huella = (o: THREE.Object3D) => `${o.position.toArray()}|${o.quaternion.toArray()}|${o.scale.toArray()}`;
  const antes = new Map<THREE.Object3D, string>();
  for (const f of animados) f(1, 0.5);
  mundo.traverse((o) => { antes.set(o, huella(o)); });
  for (const f of animados) f(7.31, 0.5);
  mundo.traverse((o) => { if (antes.get(o) !== huella(o)) o.userData.movil = true; });
  for (const mano of manos) mano.userData.movil = true;
  // Lo que se puede tocar también se funde con el paisaje; para tocarlo queda una figura invisible con su misma forma
  mundo.updateMatrixWorld(true);
  const inversa = new THREE.Matrix4().copy(mundo.matrixWorld).invert();
  const formas = interactivos.map((o) => {
    const piezas: THREE.BufferGeometry[] = [];
    o.traverse((x) => {
      const malla = x as THREE.Mesh;
      if (!malla.isMesh || (x as THREE.InstancedMesh).isInstancedMesh) return;
      const g = malla.geometry.index ? malla.geometry.toNonIndexed() : malla.geometry.clone();
      for (const nombre of Object.keys(g.attributes)) if (nombre !== 'position') g.deleteAttribute(nombre);
      g.morphAttributes = {};
      piezas.push(g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inversa, malla.matrixWorld)));
    });
    const forma = new THREE.Mesh(mergeGeometries(piezas, false) ?? new THREE.BufferGeometry());
    piezas.forEach((g) => g.dispose());
    forma.visible = false; // no se dibuja, pero el puntero sí la encuentra
    forma.userData.info = o.userData.info;
    delete o.userData.info;
    mundo.add(forma);
    return forma;
  });
  interactivos.splice(0, interactivos.length, ...formas);
  fundir(mundo);

  const DIA = new THREE.Color('#9fd8ff'), NOCHE = new THREE.Color('#0d1830'), ATARDECER = new THREE.Color('#ffa56a'), GRIS = new THREE.Color('#a4b0c0');
  const MAR_DIA = new THREE.Color('#2e9fd8'), MAR_NOCHE = new THREE.Color('#12406d');
  const fondo = new THREE.Color();
  const niebla = new THREE.Fog(fondo, 380, 980);
  escena.background = fondo;
  escena.fog = niebla;

  return {
    interactivos,
    /** Con sombras o sin ellas, y con qué detalle (lado del mapa de sombras en píxeles). */
    calidad(sombras: boolean, detalle = 2048) {
      sol.castShadow = sombras;
      if (sol.shadow.mapSize.x !== detalle) { sol.shadow.mapSize.set(detalle, detalle); sol.shadow.map?.dispose(); sol.shadow.map = null; }
    },
    /** Marca que las sombras deben recalcularse en el próximo cuadro. */
    refrescarSombras() {
      sol.shadow.needsUpdate = true;
    },
    /** Ajusta cielo, luces y todo lo animado a la hora de Chile (0–24). */
    actualizar(hora: number, ms: number) {
      const seg = ms / 1000;
      // n: 0 de día, 1 de noche, con transición al amanecer y al atardecer
      const n = hora < 5.5 || hora >= 21 ? 1 : hora < 7.5 ? 1 - (hora - 5.5) / 2 : hora < 19 ? 0 : (hora - 19) / 2;
      const transicion = 1 - Math.abs(2 * n - 1);
      const nublado = clima === 0 ? 0 : clima === 1 ? 0.35 : 0.7;
      fondo.copy(DIA).lerp(GRIS, nublado).lerp(NOCHE, n).lerp(ATARDECER, transicion * 0.55 * (1 - nublado));
      niebla.color.copy(fondo);
      matMar.color.copy(MAR_DIA).lerp(MAR_NOCHE, Math.max(n, nublado * 0.5));
      cielo.intensity = (1.2 - n * 0.75) * (1 - nublado * 0.2);
      sol.intensity = (2.6 - n * 2.15) * (1 - nublado * 0.45);
      sol.color.set(n > 0.5 ? '#9ab4ff' : transicion > 0.3 ? '#ffd2a0' : '#fff4e0');
      matEstrellas.opacity = n * (1 - nublado);
      matNube.opacity = 0.92 - n * 0.55;

      // El sol sale por un lado y se pone por el otro; la luna va opuesta
      const arco = ((hora - 6) / 12) * PI;
      astroSol.position.set(Math.cos(arco) * 380, Math.sin(arco) * 300, -260);
      astroLuna.position.set(-Math.cos(arco) * 360, -Math.sin(arco) * 290, -260);
      astroSol.visible = clima !== 2;
      const fuente = n > 0.5 ? astroLuna.position : astroSol.position;
      sol.position.set(fuente.x * 0.45, Math.max(120, Math.abs(fuente.y) * 0.7), 110).setLength(260);

      manos[0].rotation.z = -((hora % 12) / 12) * PI * 2;
      manos[1].rotation.z = -(hora % 1) * PI * 2;
      for (const x of nocturnos) x.mat.emissiveIntensity = x.base + (x.max - x.base) * n;
      luzPlaza.intensity = n * 90;
      for (const f of animados) f(seg, n);
      return n;
    },
  };
}
