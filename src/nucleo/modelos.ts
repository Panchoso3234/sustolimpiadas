import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Modelos 3D de artistas (paquetes de Kenney, licencia CC0), servidos desde public/modelos.
export type Paquete = 'pueblo' | 'naturaleza';
/** Paquetes que usan los juegos además de los de la isla. */
export type Origen = Paquete | 'pirata' | 'comida' | 'minigolf';
const RAIZ = `${import.meta.env.BASE_URL}modelos/`;
const cargador = new GLTFLoader();
const cargados = new Map<string, Promise<THREE.Group>>();

// El paquete de naturaleza viene en tonos turquesa y naranjo: se lleva a la paleta de ValRigo
const TINTES: Record<string, string> = {
  leafsGreen: '#62b25c', leafsDark: '#3f8f5a', leafsFall: '#e8923a', woodBark: '#8a5a38', woodBarkDark: '#6b4a2b', woodBirch: '#e9dcc0',
  grass: '#6cc070', dirt: '#9b6f4e', stone: '#9a97a6', stoneDark: '#7d7a88', sand: '#f2deae', wood: '#a06a3c', water: '#58c0ea',
};
const materiales = new Map<string, THREE.MeshStandardMaterial>();

function material(original: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const clave = original.map ? `tex|${original.map.uuid}` : `${original.name}|${original.color.getHexString()}`;
  let m = materiales.get(clave);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: original.map ? '#ffffff' : TINTES[original.name] ?? original.color, map: original.map, roughness: 0.88, flatShading: true });
    m.name = original.name;
    materiales.set(clave, m);
  }
  return m;
}

/** Carga un modelo (una sola vez) con los materiales de la isla. `userData.piso` es cuánto hay que subirlo para que apoye en el suelo. */
export function cargar(paquete: Origen, nombre: string): Promise<THREE.Group> {
  const clave = `${paquete}/${nombre}`;
  let promesa = cargados.get(clave);
  if (!promesa) {
    promesa = cargador.loadAsync(`${RAIZ}${clave}.glb`).then((gltf) => {
      const raiz = gltf.scene;
      raiz.traverse((o) => {
        const malla = o as THREE.Mesh;
        if (!malla.isMesh) return;
        malla.material = material(malla.material as THREE.MeshStandardMaterial);
        malla.castShadow = malla.receiveShadow = true;
      });
      raiz.updateMatrixWorld(true);
      raiz.userData.piso = -new THREE.Box3().setFromObject(raiz).min.y;
      return raiz;
    });
    cargados.set(clave, promesa);
  }
  return promesa;
}

export interface Siembra { x: number; y: number; z: number; s: number; giro: number }

/** Dibuja muchas copias de un modelo de una sola vez (instancias), que es la forma barata de llenar un bosque. */
export function sembrar(modelo: THREE.Group, puntos: Siembra[]): THREE.Group {
  const grupo = new THREE.Group(), o = new THREE.Object3D(), m = new THREE.Matrix4();
  modelo.traverse((hijo) => {
    const malla = hijo as THREE.Mesh;
    if (!malla.isMesh) return;
    const copias = new THREE.InstancedMesh(malla.geometry, malla.material, puntos.length);
    puntos.forEach((p, i) => {
      o.position.set(p.x, p.y + modelo.userData.piso * p.s, p.z);
      o.rotation.set(0, p.giro, 0);
      o.scale.setScalar(p.s);
      o.updateMatrix();
      copias.setMatrixAt(i, m.multiplyMatrices(o.matrix, malla.matrixWorld));
    });
    copias.castShadow = copias.receiveShadow = true;
    grupo.add(copias);
  });
  return grupo;
}

/** Una copia suelta de un modelo, ya apoyada en la altura `y`. */
export async function copia(paquete: Paquete, nombre: string, p: { x: number; y: number; z: number }, escala: number, giro = 0): Promise<THREE.Object3D> {
  const modelo = await cargar(paquete, nombre), o = modelo.clone();
  o.position.set(p.x, p.y + modelo.userData.piso * escala, p.z);
  o.rotation.y = giro;
  o.scale.setScalar(escala);
  return o;
}

let taller: { render: THREE.WebGLRenderer; escena: THREE.Scene; camara: THREE.PerspectiveCamera; pivote: THREE.Group } | null = null;
const fotos = new Map<string, Promise<string>>();

/** Foto de un modelo para la galería. */
export function fotoModelo(paquete: Origen, nombre: string, tam = 160): Promise<string> {
  const clave = `${paquete}/${nombre}/${tam}`;
  let promesa = fotos.get(clave);
  if (!promesa) {
    promesa = cargar(paquete, nombre).then((modelo) => {
      if (!taller) {
        const render = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        render.setPixelRatio(1);
        const escena = new THREE.Scene(), pivote = new THREE.Group();
        escena.add(new THREE.HemisphereLight('#ffffff', '#6a7a9a', 1.5), pivote);
        const sol = new THREE.DirectionalLight('#ffffff', 2.2);
        sol.position.set(3, 5, 4);
        escena.add(sol);
        taller = { render, escena, camara: new THREE.PerspectiveCamera(30, 1, 0.05, 100), pivote };
      }
      const { render, escena, camara, pivote } = taller;
      render.setSize(tam, tam, false);
      const o = modelo.clone(), caja = new THREE.Box3().setFromObject(modelo), centro = caja.getCenter(new THREE.Vector3());
      const radio = Math.max(0.05, caja.getSize(new THREE.Vector3()).length() / 2);
      pivote.add(o);
      camara.position.set(centro.x + radio * 2.2, centro.y + radio * 1.7, centro.z + radio * 2.6);
      camara.lookAt(centro);
      render.render(escena, camara);
      pivote.remove(o);
      return render.domElement.toDataURL();
    });
    fotos.set(clave, promesa);
  }
  return promesa;
}

export async function listaModelos(): Promise<Record<Paquete, string[]>> {
  return (await fetch(`${RAIZ}lista.json`)).json();
}
