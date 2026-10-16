// Pasa las animaciones de la "Universal Animation Library" de Quaternius (CC0, https://quaternius.com) al esqueleto
// estándar de los avatares VRM, una sola vez: node herramientas/animaciones.mjs <ruta al .glb de Godot>
// Deja public/avatares/animaciones.json: por cada animación, la rotación de cada hueso humanoide (en el espacio
// "normalizado" de three-vrm, de pie en pose T y mirando hacia +Z) y la altura de la cadera relativa a la del modelo.
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const entrada = process.argv[2];
if (!entrada) throw new Error('Falta la ruta al AnimationLibrary_Godot_Standard.glb');

// Hueso de la librería (rig de Rigify) → hueso humanoide de VRM
const HUESOS = {
  'DEF-hips': 'hips', 'DEF-spine.001': 'spine', 'DEF-spine.002': 'chest', 'DEF-spine.003': 'upperChest', 'DEF-neck': 'neck', 'DEF-head': 'head',
  'DEF-shoulder.L': 'leftShoulder', 'DEF-upper_arm.L': 'leftUpperArm', 'DEF-forearm.L': 'leftLowerArm', 'DEF-hand.L': 'leftHand',
  'DEF-shoulder.R': 'rightShoulder', 'DEF-upper_arm.R': 'rightUpperArm', 'DEF-forearm.R': 'rightLowerArm', 'DEF-hand.R': 'rightHand',
  'DEF-thigh.L': 'leftUpperLeg', 'DEF-shin.L': 'leftLowerLeg', 'DEF-foot.L': 'leftFoot', 'DEF-toe.L': 'leftToes',
  'DEF-thigh.R': 'rightUpperLeg', 'DEF-shin.R': 'rightLowerLeg', 'DEF-foot.R': 'rightFoot', 'DEF-toe.R': 'rightToes',
};
// three.js limpia los nombres de los nodos (quita los puntos): se usan así
const HUESOS_LIMPIOS = Object.fromEntries(Object.entries(HUESOS).map(([k, v]) => [THREE.PropertyBinding.sanitizeNodeName(k), v]));
const limpio = (n) => THREE.PropertyBinding.sanitizeNodeName(n);
// Nombre que usan los juegos → animación de la librería (y si se repite)
const CLIPS = {
  idle: ['Idle_Loop', true], walk: ['Walk_Loop', true], sprint: ['Jog_Fwd_Loop', true], correr: ['Sprint_Loop', true], jump: ['Jump_Loop', true],
  die: ['Death01', false], sit: ['Sitting_Idle_Loop', true], manejar: ['Driving_Loop', true], 'emote-yes': ['Dance_Loop', true], 'emote-no': ['Hit_Head', false],
  'holding-both': ['Idle_Torch_Loop', true], 'holding-right': ['Pistol_Idle_Loop', true], 'attack-melee-right': ['Punch_Jab', false],
  agacharse: ['Crouch_Idle_Loop', true], empujar: ['Push_Loop', true], saludar: ['Interact', false],
};

const datos = readFileSync(entrada);
const gltf = await new Promise((ok, mal) => new GLTFLoader().parse(datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength), '', ok, mal));
const escena = gltf.scene, porNombre = (n) => gltf.animations.find((a) => a.name === n);

// La pose de referencia: el primer cuadro de A_TPose (la librería trae su propia pose T)
const mixer = new THREE.AnimationMixer(escena);
mixer.clipAction(porNombre('A_TPose')).play(); mixer.update(0);
escena.updateMatrixWorld(true);
const reposo = {};
for (const nombre of Object.keys(HUESOS_LIMPIOS)) {
  const n = escena.getObjectByName(nombre);
  reposo[nombre] = { invRot: n.getWorldQuaternion(new THREE.Quaternion()).invert(), padre: n.parent.getWorldQuaternion(new THREE.Quaternion()), local: n.quaternion.clone() };
}
// Hacia dónde mira el esqueleto: de la cadera a los dedos del pie izquierdo/derecho no sirve; se usa el pecho:
// de la cadera hacia el hombro izquierdo es "izquierda", y su cruce con "arriba" da el frente
const pos = (n) => escena.getObjectByName(limpio(n)).getWorldPosition(new THREE.Vector3());
const izquierda = pos('DEF-upper_arm.L').sub(pos('DEF-upper_arm.R')).normalize();
const arriba = pos('DEF-head').sub(pos('DEF-hips')).normalize();
const frente = new THREE.Vector3().crossVectors(izquierda, arriba).normalize();
// Giro que lleva ese frente a +Z (el de los VRM normalizados), aplicado a todo
const giro = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(frente.x, 0, frente.z).normalize(), new THREE.Vector3(0, 0, 1));
const giroInv = giro.clone().invert();
const altoCadera = pos('DEF-hips').y;
console.log('frente', frente.toArray().map((v) => v.toFixed(2)), 'izquierda', izquierda.toArray().map((v) => v.toFixed(2)), 'cadera', altoCadera.toFixed(3));
mixer.stopAllAction();

const r4 = (v) => Math.round(v * 10000) / 10000;
const salida = {};
const q = new THREE.Quaternion();
for (const [nuestro, [suyo, repite]] of Object.entries(CLIPS)) {
  const clip = porNombre(suyo);
  if (!clip) { console.log('falta', suyo); continue; }
  const pistas = [];
  for (const pista of clip.tracks) {
    const punto = pista.name.lastIndexOf('.'), hueso = pista.name.slice(0, punto), prop = pista.name.slice(punto + 1), vrm = HUESOS_LIMPIOS[hueso];
    if (!vrm) continue;
    const ref = reposo[hueso];
    if (prop === 'quaternion') {
      const valores = [];
      for (let i = 0; i < pista.values.length; i += 4) {
        // Rotación del hueso respecto de su pose T, expresada en el mundo, y después girada para mirar a +Z
        q.fromArray(pista.values, i).premultiply(ref.padre).multiply(ref.invRot);
        q.premultiply(giro).multiply(giroInv);
        valores.push(r4(q.x), r4(q.y), r4(q.z), r4(q.w));
      }
      pistas.push({ hueso: vrm, tipo: 'q', tiempos: Array.from(pista.times, r4), valores });
    } else if (prop === 'position' && vrm === 'hips') {
      const valores = [], v = new THREE.Vector3();
      for (let i = 0; i < pista.values.length; i += 3) {
        // La posición de la cadera en el mundo (sin el nodo raíz), girada y medida en "altos de cadera"
        v.fromArray(pista.values, i).applyMatrix4(escena.getObjectByName(hueso).parent.matrixWorld).applyQuaternion(giro).divideScalar(altoCadera);
        valores.push(r4(v.x), r4(v.y), r4(v.z));
      }
      pistas.push({ hueso: vrm, tipo: 'p', tiempos: Array.from(pista.times, r4), valores });
    }
  }
  salida[nuestro] = { duracion: r4(clip.duration), repite, pistas };
  console.log('listo', nuestro, '←', suyo, pistas.length, 'pistas');
}
writeFileSync('public/avatares/animaciones.json', JSON.stringify(salida));
console.log('KB', Math.round(JSON.stringify(salida).length / 1024));
