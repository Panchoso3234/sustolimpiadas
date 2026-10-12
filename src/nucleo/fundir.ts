import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const QUEDAN = ['position', 'normal', 'uv'];

/**
 * Junta en una sola malla por material todas las piezas fijas de un grupo, para dibujar mucho menos.
 * Se saltan las ramas marcadas con `userData.movil` (se animan) o `userData.info` (se funden aparte, para poder tocarlas).
 */
export function fundir(grupo: THREE.Object3D) {
  grupo.updateMatrixWorld(true);
  const inversa = new THREE.Matrix4().copy(grupo.matrixWorld).invert(), local = new THREE.Matrix4();
  const lotes = new Map<string, THREE.Mesh[]>();
  const recorrer = (o: THREE.Object3D) => {
    if (o.userData.movil || o.userData.info) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material)) {
      const clave = `${m.material.uuid}|${m.castShadow}`;
      const lote = lotes.get(clave);
      if (lote) lote.push(m); else lotes.set(clave, [m]);
    }
    for (const hijo of [...o.children]) recorrer(hijo);
  };
  for (const hijo of [...grupo.children]) recorrer(hijo);

  for (const mallas of lotes.values()) {
    if (mallas.length < 2) continue;
    const piezas = mallas.map((m) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const nombre of Object.keys(g.attributes)) if (!QUEDAN.includes(nombre)) g.deleteAttribute(nombre);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(local.multiplyMatrices(inversa, m.matrixWorld));
      return g;
    });
    const unida = mergeGeometries(piezas, false);
    piezas.forEach((g) => g.dispose());
    if (!unida) continue;
    const malla = new THREE.Mesh(unida, mallas[0].material);
    malla.castShadow = mallas[0].castShadow;
    malla.receiveShadow = true;
    malla.matrixAutoUpdate = false;
    grupo.add(malla);
    for (const m of mallas) m.parent?.remove(m);
  }
}
