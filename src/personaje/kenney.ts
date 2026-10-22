import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BASES, type Aspecto } from './catalogo';
import { ponerSombrero } from './modelo';

// Personajes armados con los modelos de Kenney (Mini Characters, CC0): cabeza y cuerpo se eligen por separado,
// cada color de su paleta se puede cambiar, traen animaciones de artista y llevan nuestros accesorios.
const RAIZ = `${import.meta.env.BASE_URL}modelos/personajes/`;
const AYUDAS = ['', 'aid-glasses', 'aid-sunglasses', 'aid-mask'];
export const ALTO = 2.05; // los modelos miden 1 de alto; se llevan a este tamaño

interface Base { escena: THREE.Group; clips: THREE.AnimationClip[] }
const cargador = new GLTFLoader();
const bases = new Map<string, Promise<Base>>();
let paleta: Promise<ImageData> | null = null;
const MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
const liso = (color: string, emisivo = false) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, emissive: emisivo ? color : '#000000', emissiveIntensity: emisivo ? 0.6 : 0 });

function base(archivo: string): Promise<Base> {
  let p = bases.get(archivo);
  if (!p) { p = cargador.loadAsync(`${RAIZ}${archivo}.glb`).then((g) => ({ escena: g.scene, clips: g.animations })); bases.set(archivo, p); }
  return p;
}

function leerPaleta(): Promise<ImageData> {
  paleta ??= new Promise((listo, error) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      listo(g.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = error;
    img.src = `${RAIZ}Textures/colormap.png`;
  });
  return paleta;
}

export interface Ranura { id: string; parte: 'cabeza' | 'cuerpo'; color: string }
const hsl = { h: 0, s: 0, l: 0 };

/** Lo que sale de leer la paleta para una malla: no cambia, así que se calcula una vez por modelo y se reutiliza. */
interface Analisis { grupos: string[]; base: Float32Array; luz: Float32Array; ranuras: { id: string; color: string }[]; brillo: Map<string, number> }
const analisis = new WeakMap<THREE.BufferGeometry, Analisis>();

function analizar(geo: THREE.BufferGeometry, datos: ImageData, parte: Ranura['parte']): Analisis {
  const uv = geo.attributes.uv, c = new THREE.Color(), base = new Float32Array(uv.count * 3), luz = new Float32Array(uv.count);
  const lado = (v: number, n: number) => Math.min(n - 1, Math.floor((((v % 1) + 1) % 1) * n));
  const porVertice: string[] = [], hexes: string[] = [], cuentas = new Map<string, Map<string, number>>();
  for (let i = 0; i < uv.count; i++) {
    const px = lado(uv.getX(i), datos.width), py = lado(uv.getY(i), datos.height), k = (py * datos.width + px) * 4;
    const hex = `#${[datos.data[k], datos.data[k + 1], datos.data[k + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    // La paleta de Kenney es una grilla: cada columna (y franja de 4 filas) es un color con sus luces y sombras
    const grupo = `${parte}|c${Math.floor((px * 16) / datos.width)}b${Math.floor((py * 4) / datos.height)}`;
    porVertice.push(grupo); hexes.push(hex);
    const cuenta = cuentas.get(grupo) ?? new Map<string, number>();
    cuenta.set(hex, (cuenta.get(hex) ?? 0) + 1);
    cuentas.set(grupo, cuenta);
    c.set(hex);
    base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b;
    luz[i] = c.getHSL(hsl, THREE.SRGBColorSpace).l;
  }
  const ranuras: Analisis['ranuras'] = [], brillo = new Map<string, number>(); // color más usado de cada grupo: es el que se muestra y se cambia
  for (const [grupo, cuenta] of cuentas) {
    const hex = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
    ranuras.push({ id: grupo, color: hex });
    brillo.set(grupo, c.set(hex).getHSL(hsl, THREE.SRGBColorSpace).l);
  }
  const a = { grupos: porVertice, base, luz, ranuras, brillo };
  analisis.set(geo, a);
  return a;
}

/**
 * Pasa los colores de la paleta a cada vértice. Los tonos parecidos de una misma parte (por ejemplo las luces y
 * sombras del pelo) forman una sola "ranura" que se cambia de una vez, conservando sus diferencias de brillo.
 */
function pintar(malla: THREE.SkinnedMesh, datos: ImageData, cambios: Record<string, string>, ranuras: Ranura[]) {
  const parte = malla.name === 'head-mesh' ? 'cabeza' : 'cuerpo';
  const a = analisis.get(malla.geometry) ?? analizar(malla.geometry, datos, parte);
  for (const r of a.ranuras) ranuras.push({ ...r, parte });
  const geo = malla.geometry.clone(), colores = a.base.slice(), c = new THREE.Color();
  // El tono elegido de cada ranura cambiada, una sola vez (antes se recalculaba en cada vértice)
  const elegidos = new Map<string, { h: number; s: number; l: number }>();
  for (const [grupo, color] of Object.entries(cambios)) if (a.brillo.has(grupo)) elegidos.set(grupo, c.set(color).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace));
  if (elegidos.size) a.grupos.forEach((grupo, i) => {
    const elegido = elegidos.get(grupo);
    if (!elegido) return;
    c.setHSL(elegido.h, elegido.s, Math.min(0.97, Math.max(0.03, elegido.l + a.luz[i] - a.brillo.get(grupo)!)), THREE.SRGBColorSpace);
    colores[i * 3] = c.r; colores[i * 3 + 1] = c.g; colores[i * 3 + 2] = c.b;
  });
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  malla.geometry = geo;
  malla.material = MATERIAL;
  malla.castShadow = malla.receiveShadow = true;
  malla.frustumCulled = false;
}

const pieza = (padre: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; padre.add(o); return o; };

/** Objeto para la mano. Nace en la mano y se extiende hacia arriba. Medidas en unidades del modelo (el personaje mide 1). */
function crearObjeto(tipo: number, color: string): THREE.Group {
  const g = new THREE.Group(), cil = (r: number, h: number) => new THREE.CylinderGeometry(r, r, h, 6);
  switch (tipo) {
    case 1: pieza(g, cil(0.003, 0.62), liso('#f3ecdc'), 0, 0.31, 0); pieza(g, new THREE.IcosahedronGeometry(0.085, 2), liso(color), 0, 0.68, 0).scale.y = 1.15; break;
    case 2: pieza(g, new THREE.BoxGeometry(0.02, 0.25, 0.006), liso('#d8dde8'), 0, 0.16, 0); pieza(g, new THREE.BoxGeometry(0.08, 0.015, 0.015), liso('#ffd84a'), 0, 0.03, 0); break;
    case 3: pieza(g, cil(0.006, 0.2), liso('#1f1b2b'), 0, 0.1, 0); pieza(g, new THREE.OctahedronGeometry(0.032), liso('#ffe08a', true), 0, 0.22, 0); break;
    case 4: pieza(g, cil(0.005, 0.15), liso('#f3ecdc'), 0, 0.075, 0); pieza(g, new THREE.CylinderGeometry(0.05, 0.05, 0.015, 16), liso(color), 0, 0.18, 0).rotation.x = Math.PI / 2; break;
    case 5: pieza(g, cil(0.006, 0.37), liso('#7a5230'), 0, 0.18, 0); pieza(g, new THREE.BoxGeometry(0.14, 0.09, 0.006), liso(color), 0.07, 0.31, 0); break;
    case 6: pieza(g, new THREE.IcosahedronGeometry(0.055, 1), liso('#ff8a1e', true), 0, -0.06, 0).scale.set(1.15, 0.9, 1.15); break;
  }
  return g;
}

/** Accesorio de espalda. Nace en el centro de la espalda y se extiende hacia atrás. */
function crearEspalda(tipo: number, color: string): THREE.Group {
  const g = new THREE.Group();
  switch (tipo) {
    case 1: pieza(g, new THREE.BoxGeometry(0.17, 0.19, 0.09), liso(color), 0, 0, -0.045); pieza(g, new THREE.BoxGeometry(0.11, 0.07, 0.03), liso('#2b3047'), 0, -0.04, -0.1); break;
    case 2: for (const s of [-1, 1]) { const ala = pieza(g, new THREE.IcosahedronGeometry(0.1, 1), liso('#f3ecdc'), s * 0.15, 0.06, -0.03); ala.scale.set(1.3, 0.9, 0.15); ala.rotation.z = s * -0.5; } break;
    case 3: for (const s of [-1, 1]) { const ala = pieza(g, new THREE.ConeGeometry(0.15, 0.25, 3), liso('#3a2a55'), s * 0.17, 0.07, -0.03); ala.scale.z = 0.12; ala.rotation.z = s * -1.2; } break;
    case 4: {
      const curva = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, -0.15, -0.12), new THREE.Vector3(0.03, -0.07, -0.19), new THREE.Vector3(0.04, 0.04, -0.18)]);
      pieza(g, new THREE.TubeGeometry(curva, 12, 0.018, 6), liso(color));
      break;
    }
    case 5: pieza(g, new THREE.CylinderGeometry(0.13, 0.21, 0.34, 14, 1, true, Math.PI / 2 + 0.3, Math.PI - 0.6), new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, side: THREE.DoubleSide }), 0, -0.09, 0.11); break;
  }
  return g;
}

/** Punto de la malla más lejano al hueso dado, entre los vértices que ese hueso mueve: sirve para hallar la mano. */
function puntaDe(malla: THREE.SkinnedMesh, hueso: string): THREE.Vector3 | null {
  const indice = malla.skeleton.bones.findIndex((b) => b.name === hueso);
  if (indice < 0) return null;
  const origen = malla.skeleton.bones[indice].getWorldPosition(new THREE.Vector3());
  const pos = malla.geometry.attributes.position, si = malla.geometry.attributes.skinIndex, sw = malla.geometry.attributes.skinWeight, v = new THREE.Vector3();
  let mejor: THREE.Vector3 | null = null, lejos = -1;
  for (let i = 0; i < pos.count; i++) {
    let k = 0;
    for (let j = 1; j < 4; j++) if (sw.getComponent(i, j) > sw.getComponent(i, k)) k = j;
    if (si.getComponent(i, k) !== indice) continue;
    v.fromBufferAttribute(pos, i).applyMatrix4(malla.matrixWorld);
    const d = v.distanceTo(origen);
    if (d > lejos) { lejos = d; mejor = v.clone(); }
  }
  return mejor;
}

export interface Kenney { grupo: THREE.Group; ranuras: Ranura[]; animar(nombre: string, unaVez?: boolean): void }

export async function crearKenney(a: Aspecto): Promise<Kenney> {
  // Avatar anime (VRM): se carga aparte y solo cuando alguien lo usa
  if (a.vrm) return (await import('./vrm')).crearVrm(a.vrm);
  const [cuerpo, cabeza, datos, ayuda] = await Promise.all([
    base(`character-${BASES[a.cuerpo]}`), base(`character-${BASES[a.cabeza]}`), leerPaleta(), a.lentes > 0 ? base(AYUDAS[a.lentes]) : null,
  ]);
  const grupo = new THREE.Group(), ranuras: Ranura[] = [];
  const partes: { raiz: THREE.Object3D; mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[] }[] = [];
  const mallas: Record<string, { malla: THREE.SkinnedMesh; raiz: THREE.Object3D }> = {};

  // Si cabeza y cuerpo vienen de modelos distintos se instancian los dos, mostrando de cada uno solo su parte.
  // Comparten nombres de huesos y animaciones, así que se mueven exactamente igual.
  const usar = (b: Base, mostrar: 'body-mesh' | 'head-mesh' | 'ambas') => {
    const raiz = SkeletonUtils.clone(b.escena);
    raiz.traverse((o) => {
      const malla = o as THREE.SkinnedMesh;
      if (!malla.isSkinnedMesh) return;
      if (mostrar !== 'ambas' && malla.name !== mostrar) { malla.visible = false; return; }
      pintar(malla, datos, a.colores, ranuras);
      mallas[malla.name] = { malla, raiz };
    });
    grupo.add(raiz);
    partes.push({ raiz, mixer: new THREE.AnimationMixer(raiz), clips: b.clips });
  };
  if (a.cabeza === a.cuerpo) usar(cuerpo, 'ambas');
  else { usar(cuerpo, 'body-mesh'); usar(cabeza, 'head-mesh'); }

  // Accesorios: se ubican con el personaje en su pose de reposo y se cuelgan del hueso que corresponde, para que sigan la animación
  grupo.updateMatrixWorld(true);
  const cajaDe = (m: THREE.SkinnedMesh) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld); };
  const colgar = (o: THREE.Object3D, de: { raiz: THREE.Object3D }, hueso: string) => { grupo.add(o); grupo.updateMatrixWorld(true); de.raiz.getObjectByName(hueso)?.attach(o); };
  const cab = mallas['head-mesh'], cue = mallas['body-mesh'];
  if (cab) {
    const caja = cajaDe(cab.malla), centro = caja.getCenter(new THREE.Vector3()), tam = caja.getSize(new THREE.Vector3());
    if (a.sombrero > 0) {
      const gorro = new THREE.Group();
      ponerSombrero(gorro, a.sombrero, a.colorSombrero);
      gorro.scale.setScalar((Math.max(tam.x, tam.z) / 0.8) * 1.02);
      // Los sombreros se diseñaron para una cabeza redonda; estas son más bajas que anchas, así que se bajan lo que sobra
      gorro.position.set(centro.x, centro.y + (tam.y - Math.max(tam.x, tam.z)) / 2 + tam.y * 0.05, centro.z);
      gorro.traverse((o) => { o.castShadow = true; });
      colgar(gorro, cab, 'head');
    }
    if (ayuda) {
      // Lentes y mascarilla del propio paquete: se centran en la cara, a la altura de los ojos o de la boca
      const lente = ayuda.escena.clone();
      lente.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { (m.material as THREE.MeshStandardMaterial).flatShading = true; m.castShadow = true; } });
      const cajaL = new THREE.Box3().setFromObject(lente), medio = cajaL.getCenter(new THREE.Vector3()), fondo = cajaL.getSize(new THREE.Vector3()).z;
      lente.position.set(centro.x - medio.x, caja.min.y + tam.y * (a.lentes === 3 ? 0.3 : 0.5) - medio.y, caja.max.z - fondo * 0.35 - medio.z);
      colgar(lente, cab, 'head');
    }
  }
  if (cue) {
    const caja = cajaDe(cue.malla), tam = caja.getSize(new THREE.Vector3());
    const mano = a.objeto > 0 ? puntaDe(cue.malla, 'arm-right') : null, brazo = cue.raiz.getObjectByName('arm-right');
    if (mano && brazo) {
      // La mano se ubica en la pose de reposo y el objeto se cuelga derecho estando el personaje ya quieto,
      // para que apunte hacia arriba cuando el brazo cuelga
      const enBrazo = brazo.worldToLocal(mano.clone());
      for (const p of partes) { const quieto = p.clips.find((c) => c.name === 'idle'); if (quieto) { p.mixer.clipAction(quieto).play(); p.mixer.update(0); } }
      grupo.updateMatrixWorld(true);
      const objeto = crearObjeto(a.objeto, a.colorAccesorio);
      objeto.position.copy(brazo.localToWorld(enBrazo));
      colgar(objeto, cue, 'arm-right');
    }
    if (a.espalda > 0) {
      const espalda = crearEspalda(a.espalda, a.colorAccesorio);
      espalda.position.set(0, caja.min.y + tam.y * 0.68, caja.min.z + tam.z * 0.3);
      colgar(espalda, cue, 'torso');
    }
  }

  const alto = ALTO * (0.92 + a.altura * 0.16), ancho = ALTO * (0.9 + a.contextura * 0.2);
  grupo.scale.set(ancho, alto, ancho);
  grupo.userData.avanzar = (dt: number) => { for (const p of partes) p.mixer.update(dt); };
  let actual = '';
  const api: Kenney = {
    grupo, ranuras,
    animar(nombre, unaVez = false) {
      if (nombre === actual) return;
      actual = nombre;
      for (const p of partes) {
        const clip = p.clips.find((c) => c.name === nombre) ?? p.clips.find((c) => c.name === 'idle');
        if (!clip) continue;
        p.mixer.stopAllAction();
        const accion = p.mixer.clipAction(clip).reset();
        accion.setLoop(unaVez ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        accion.clampWhenFinished = unaVez;
        accion.play();
      }
    },
  };
  api.animar('idle');
  grupo.userData.kenney = api;
  return api;
}
