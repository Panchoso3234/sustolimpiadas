import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ALTO, type Kenney } from './kenney';

// Avatares anime en formato VRM (por ahora, los chibis de public/avatares/chibis). Se arman con la misma "cara" que
// los personajes de Kenney (grupo + animar), así cualquier juego los usa sin cambios. Las animaciones salen de
// public/avatares/animaciones.json (ver herramientas/animaciones.mjs) y se aplican a los huesos humanoides del VRM.

const RAIZ = `${import.meta.env.BASE_URL}avatares/`;
interface Pista { hueso: string; tipo: 'q' | 'p'; tiempos: number[]; valores: number[] }
interface Animacion { duracion: number; repite: boolean; pistas: Pista[] }

let animaciones: Promise<Record<string, Animacion>> | null = null;
const archivos = new Map<string, Promise<ArrayBuffer>>();
const cargador = new GLTFLoader().register((p) => new VRMLoaderPlugin(p));

/** Los chibis de la galería (de "Xmas Chibis", CC0): id y nombre. */
export const CHIBIS: [string, string][] = [
  ['chibi-01', 'Elel Silverbell'], ['chibi-02', 'Paws Chestnut'], ['chibi-03', 'Holy Garland'], ['chibi-04', 'Comet Kringle'],
  ['chibi-05', 'Frosty Claus'], ['chibi-06', 'Merry Yulelog'], ['chibi-07', 'Pip Poinsettia'], ['chibi-08', 'Crystal Yuletide'],
  ['chibi-09', 'Thumper Cranberry'], ['chibi-10', 'Clara Nutcracker'], ['chibi-11', 'Whisker Eggnog'], ['chibi-12', 'Piney Tinselbaum'],
  ['chibi-13', 'Nick North'], ['chibi-14', 'Krampus Wreath'], ['chibi-15', 'Cookie Gingerbread'], ['chibi-16', 'Snore Stocking'],
];

/** Si un id de avatar anime es válido (los que se guardan en la apariencia). */
export const esVrm = (id: unknown): id is string => typeof id === 'string' && /^chibi-\d{2}$/.test(id);
export const retratoVrm = (id: string) => `${RAIZ}chibis/${id}.jpg`;

const bajar = (url: string) => {
  let p = archivos.get(url);
  if (!p) { p = fetch(url).then((r) => { if (!r.ok) throw new Error(`No se pudo cargar ${url}`); return r.arrayBuffer(); }); archivos.set(url, p); p.catch(() => archivos.delete(url)); }
  return p;
};

/** Las animaciones pasadas a los huesos de este VRM (los VRM viejos, 0.x, miran al revés: se espeja). */
function clipsPara(vrm: VRM, todas: Record<string, Animacion>) {
  const viejo = vrm.meta?.metaVersion === '0', cadera = vrm.humanoid.getNormalizedBoneNode('hips');
  const altoCadera = cadera ? cadera.getWorldPosition(new THREE.Vector3()).y - vrm.scene.getWorldPosition(new THREE.Vector3()).y : 1;
  const clips: Record<string, { clip: THREE.AnimationClip; repite: boolean }> = {};
  for (const [nombre, a] of Object.entries(todas)) {
    const pistas: THREE.KeyframeTrack[] = [];
    for (const p of a.pistas) {
      const nodo = vrm.humanoid.getNormalizedBoneNode(p.hueso as never);
      if (!nodo) continue;
      if (p.tipo === 'q') pistas.push(new THREE.QuaternionKeyframeTrack(`${nodo.name}.quaternion`, p.tiempos, viejo ? p.valores.map((v, i) => (i % 2 === 0 ? -v : v)) : p.valores));
      else pistas.push(new THREE.VectorKeyframeTrack(`${nodo.name}.position`, p.tiempos, p.valores.map((v, i) => (viejo && i % 3 !== 1 ? -v : v) * altoCadera)));
    }
    clips[nombre] = { clip: new THREE.AnimationClip(nombre, a.duracion, pistas), repite: a.repite };
  }
  return clips;
}

export async function crearVrm(id: string): Promise<Kenney> {
  animaciones ??= fetch(`${RAIZ}animaciones.json`).then((r) => r.json());
  const [datos, todas] = await Promise.all([bajar(`${RAIZ}chibis/${id}.vrm`), animaciones]);
  const gltf = await cargador.parseAsync(datos, '');
  const vrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene);
  VRMUtils.rotateVRM0(vrm); // los VRM 0.x miran hacia atrás: así todos miran hacia +Z, como los de Kenney
  // El material anime (MToon, con contorno) pesa mucho en una gráfica integrada: con 9 chibis bajaba a 30 cuadros.
  // Los chibis están pintados para verse sin luces, así que un material simple con la misma textura se ve igual.
  vrm.scene.traverse((o) => {
    o.frustumCulled = false;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const original = [m.material].flat()[0] as THREE.Material & { map?: THREE.Texture | null; color?: THREE.Color; isMToonMaterial?: boolean };
    if (!original.isMToonMaterial) return;
    m.material = new THREE.MeshBasicMaterial({ map: original.map ?? null, color: original.color ?? 0xffffff, transparent: original.transparent, alphaTest: original.alphaTest, side: original.side });
    if (m.geometry.groups.length > 1) m.geometry.clearGroups(); // el segundo grupo era el contorno
  });

  const grupo = new THREE.Group();
  grupo.add(vrm.scene);
  const clips = clipsPara(vrm, todas), mixer = new THREE.AnimationMixer(vrm.scene);
  let actual = '', accion: THREE.AnimationAction | null = null;
  grupo.userData.avanzar = (dt: number) => { mixer.update(dt); vrm.update(dt); };
  grupo.userData.vrm = vrm;
  grupo.userData.mixer = mixer;
  const api: Kenney = {
    grupo, ranuras: [],
    animar(nombre, unaVez = false) {
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
  api.animar('idle');
  mixer.update(0); vrm.update(0);
  // Mismo alto que los personajes de Kenney, con los pies en el suelo (medido ya en la pose de reposo)
  grupo.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(vrm.scene, true), alto = Math.max(0.01, caja.max.y - caja.min.y);
  vrm.scene.scale.setScalar(ALTO / alto);
  vrm.scene.position.y = -caja.min.y * (ALTO / alto);
  grupo.userData.kenney = api;
  return api;
}
