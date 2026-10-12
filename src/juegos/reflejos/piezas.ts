import * as THREE from 'three';

// Piezas propias del motor de reflejos, en el mismo estilo low-poly de los modelos de Kenney.
// Los paquetes de Kenney que tenemos no traen cocos, cangrejos, tortugas, tambores ni tikis.
const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (color: string) => {
  let m = mats.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }); mats.set(color, m); }
  return m;
};
const pieza = (padre: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  padre.add(o);
  return o;
};
const bola = (r: number, detalle = 1) => new THREE.IcosahedronGeometry(r, detalle);

function ojos(g: THREE.Object3D, separacion: number, y: number, z: number, r: number) {
  for (const s of [-1, 1]) {
    pieza(g, bola(r), mat('#ffffff'), s * separacion, y, z);
    pieza(g, bola(r * 0.5), mat('#1c1a22'), s * separacion, y, z + r * 0.75);
  }
}

export function crearCoco(dorado = false): THREE.Group {
  const g = new THREE.Group();
  pieza(g, bola(0.48), dorado ? new THREE.MeshStandardMaterial({ color: '#ffc93c', roughness: 0.4, metalness: 0.3, flatShading: true, emissive: '#b8860b', emissiveIntensity: 0.35 }) : mat('#7a4f2a')).scale.y = 1.08;
  if (!dorado) for (const [x, y] of [[-0.13, 0.12], [0.13, 0.12], [0, -0.1]]) pieza(g, bola(0.07, 0), mat('#3d2613'), x, y, 0.43);
  return g;
}

export function crearCangrejo(dorado = false): THREE.Group {
  const g = new THREE.Group(), rojo = mat(dorado ? '#ffc93c' : '#e8503f'), oscuro = mat(dorado ? '#d99a1c' : '#b93a2f');
  pieza(g, bola(0.5), rojo, 0, 0.36, 0).scale.set(1.25, 0.62, 0.9);
  for (const s of [-1, 1]) {
    pieza(g, new THREE.CylinderGeometry(0.04, 0.04, 0.26, 5), oscuro, s * 0.2, 0.72, 0.22);
    for (let i = 0; i < 3; i++) pieza(g, new THREE.BoxGeometry(0.34, 0.07, 0.08), oscuro, s * 0.68, 0.16, -0.2 + i * 0.2).rotation.z = s * -0.5;
    // Tenazas en alto
    pieza(g, new THREE.BoxGeometry(0.1, 0.34, 0.1), oscuro, s * 0.72, 0.56, 0.2).rotation.z = s * -0.5;
    pieza(g, bola(0.2), rojo, s * 0.86, 0.82, 0.2).scale.set(1, 1.2, 0.7);
  }
  ojos(g, 0.2, 0.88, 0.24, 0.1);
  return g;
}

export function crearTortuga(): THREE.Group {
  const g = new THREE.Group(), verde = mat('#4fa868'), claro = mat('#a9dd8a');
  const caparazon = pieza(g, new THREE.SphereGeometry(0.56, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), verde, 0, 0.22, 0);
  caparazon.scale.set(1.1, 0.85, 1.2);
  pieza(g, new THREE.CylinderGeometry(0.62, 0.66, 0.12, 8), mat('#3b8452'), 0, 0.2, 0).scale.set(1.1, 1, 1.2);
  pieza(g, bola(0.26), claro, 0, 0.42, 0.72);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pieza(g, bola(0.2), claro, sx * 0.62, 0.14, sz * 0.42).scale.set(1.3, 0.45, 0.9);
  ojos(g, 0.13, 0.5, 0.88, 0.07);
  return g;
}

/** Montículo de arena con un hoyo, del que asoman los bichos. */
export function crearHoyo(): THREE.Group {
  const g = new THREE.Group();
  pieza(g, new THREE.CylinderGeometry(1.0, 1.45, 0.4, 10), mat('#e6cc94'), 0, 0.2, 0);
  const boca = pieza(g, new THREE.CircleGeometry(0.92, 16), new THREE.MeshBasicMaterial({ color: '#4a3520' }), 0, 0.405, 0);
  boca.rotation.x = -Math.PI / 2;
  return g;
}

export function crearCanasta(): THREE.Group {
  const g = new THREE.Group(), mimbre = new THREE.MeshStandardMaterial({ color: '#c79a55', roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  pieza(g, new THREE.CylinderGeometry(0.95, 0.62, 0.7, 10, 1, true), mimbre, 0, 0.35, 0);
  pieza(g, new THREE.CylinderGeometry(0.62, 0.62, 0.06, 10), mat('#a87c3f'), 0, 0.03, 0);
  pieza(g, new THREE.TorusGeometry(0.95, 0.07, 5, 12), mat('#a87c3f'), 0, 0.7, 0).rotation.x = Math.PI / 2;
  return g;
}

export interface Tambor { grupo: THREE.Group; parche: THREE.Mesh; aro: THREE.MeshStandardMaterial }

export function crearTambor(color: string): Tambor {
  const grupo = new THREE.Group(), aro = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, emissive: color, emissiveIntensity: 0 });
  pieza(grupo, new THREE.CylinderGeometry(1.15, 0.85, 1.5, 10), mat('#8a5a38'), 0, 0.75, 0);
  for (const y of [0.3, 1.42]) pieza(grupo, new THREE.TorusGeometry(y > 1 ? 1.16 : 0.92, 0.09, 5, 12), aro, 0, y, 0).rotation.x = Math.PI / 2;
  const parche = pieza(grupo, new THREE.CylinderGeometry(1.08, 1.08, 0.08, 14), mat('#f3e6c8'), 0, 1.52, 0);
  return { grupo, parche, aro };
}

export interface Tiki { grupo: THREE.Group; ojos: THREE.MeshStandardMaterial; boca: THREE.Mesh }

/** Tótem tiki de 1 de alto (se escala). Sus ojos cambian de color y su boca se abre. */
export function crearTiki(): Tiki {
  const grupo = new THREE.Group(), madera = mat('#9b6a3c'), tallada = mat('#6f4826');
  const ojosMat = new THREE.MeshStandardMaterial({ color: '#2b2118', roughness: 0.5, flatShading: true, emissive: '#000000', emissiveIntensity: 1 });
  pieza(grupo, new THREE.BoxGeometry(0.52, 0.86, 0.4), madera, 0, 0.43, 0);
  pieza(grupo, new THREE.BoxGeometry(0.62, 0.12, 0.46), tallada, 0, 0.92, 0); // corona
  pieza(grupo, new THREE.BoxGeometry(0.66, 0.08, 0.5), tallada, 0, 0.04, 0); // base
  pieza(grupo, new THREE.BoxGeometry(0.5, 0.07, 0.08), tallada, 0, 0.76, 0.21); // ceja
  pieza(grupo, new THREE.BoxGeometry(0.1, 0.2, 0.1), tallada, 0, 0.52, 0.22); // nariz
  for (const s of [-1, 1]) {
    pieza(grupo, new THREE.BoxGeometry(0.15, 0.13, 0.06), ojosMat, s * 0.14, 0.64, 0.21);
    pieza(grupo, new THREE.BoxGeometry(0.08, 0.3, 0.3), tallada, s * 0.3, 0.55, 0); // orejas
  }
  pieza(grupo, new THREE.BoxGeometry(0.36, 0.2, 0.05), tallada, 0, 0.26, 0.2);
  const boca = pieza(grupo, new THREE.BoxGeometry(0.3, 0.14, 0.06), mat('#1c1410'), 0, 0.26, 0.21);
  boca.scale.y = 0.15;
  return { grupo, ojos: ojosMat, boca };
}
