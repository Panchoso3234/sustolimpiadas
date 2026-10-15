import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bosque, cielo } from '../decorado';
import { mat } from '../punteria/fisica';
import { sombra, type Escenario } from '../reflejos/motor';

// Las piezas de Tanques de Juguete que comparten el juego individual y el duelo en vivo (mismo mundo):
// la mesa con sus adornos, los bloques y cajas del tablero, y el modelo de cada tanque.

export const COLS = 20, FILAS = 12, CELDA = 1.2, AN = COLS * CELDA, FO = FILAS * CELDA, R_TANQUE = 0.55;
export type Clase = 'marron' | 'gris' | 'verde' | 'rojo' | 'jefe';
export const CLASES: Record<Clase, { color: string; vel: number; bala: number; rebotes: number; cada: number; vida: number; valor: number; nombre: string }> = {
  marron: { color: '#a0703c', vel: 0, bala: 6.5, rebotes: 1, cada: 3, vida: 1, valor: 100, nombre: 'Torreta' },
  gris: { color: '#8a8f9c', vel: 2, bala: 7, rebotes: 1, cada: 2.4, vida: 1, valor: 150, nombre: 'Patrulla' },
  verde: { color: '#4caf6a', vel: 0, bala: 12, rebotes: 2, cada: 2.6, vida: 1, valor: 220, nombre: 'Francotirador' },
  rojo: { color: '#e5483a', vel: 3.4, bala: 8.5, rebotes: 1, cada: 1.1, vida: 1, valor: 260, nombre: 'Veloz' },
  jefe: { color: '#9a5ae0', vel: 1.8, bala: 8, rebotes: 1, cada: 1.6, vida: 6, valor: 900, nombre: 'Jefe' },
};
// Tableros: # bloque firme, c caja que se rompe, . libre. Cada uno de 20 × 12.
export const TABLEROS = [
  ['....................', '....................', '.....##......##.....', '.....#........#.....', '....................', '........cccc........', '........cccc........', '....................', '.....#........#.....', '.....##......##.....', '....................', '....................'],
  ['....................', '...c..........c.....', '...c....##....c.....', '...c....##....c.....', '..........c.........', '..###.........###...', '..###.........###...', '.........c..........', '...c....##....c.....', '...c....##....c.....', '...c..........c.....', '....................'],
  ['....................', '..####......####....', '.....c......c.......', '.....c..cc..c.......', '.....c......c.......', '.........##.........', '.........##.........', '.....c......c.......', '.....c..cc..c.......', '.....c......c.......', '..####......####....', '....................'],
  ['....................', '....#....cc....#....', '....#..........#....', '....#...####...#....', '..cc.....##.....cc..', '.........##.........', '.........##.........', '..cc.....##.....cc..', '....#...####...#....', '....#..........#....', '....#....cc....#....', '....................'],
  ['....................', '..cc............cc..', '..c....######....c..', '.......#....#.......', '....##..........##..', '....................', '....................', '....##..........##..', '.......#....#.......', '..c....######....c..', '..cc............cc..', '....................'],
];
export const celda = (x: number, z: number): [number, number] => [Math.floor((x + AN / 2) / CELDA), Math.floor((z + FO / 2) / CELDA)];
export const centro = (cx: number, cz: number) => ({ x: -AN / 2 + (cx + 0.5) * CELDA, z: -FO / 2 + (cz + 0.5) * CELDA });

/** La pieza: alfombra, mesa de madera y adornos gigantes de juguete. */
export async function montarSala(e: Escenario) {
  cielo(e.escena, '#ffe2c4', '#ffcf9e');
  const pintar = (w: number, h: number, f: (g: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; f(cv.getContext('2d')!); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const madera = pintar(128, 128, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d8a874' : '#cf9d68'; g.fillRect(0, i * 16, 128, 16); g.fillStyle = 'rgba(90,50,20,0.25)'; g.fillRect(0, i * 16 + 15, 128, 1); g.fillRect(((i * 47) % 128), i * 16, 1, 16); } });
  madera.repeat.set(AN / 6, FO / 6);
  const alfombra = pintar(64, 64, (g) => { g.fillStyle = '#5b7fd6'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#6b8fe6'; for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 8, 64); } });
  alfombra.repeat.set(30, 30);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ map: alfombra }));
  piso.rotation.x = -Math.PI / 2;
  piso.position.y = -1.2;
  const mesa = new THREE.Mesh(new THREE.BoxGeometry(AN + 1.6, 1.2, FO + 1.6), [mat('#8a5a38'), mat('#8a5a38'), new THREE.MeshLambertMaterial({ map: madera }), mat('#8a5a38'), mat('#8a5a38'), mat('#8a5a38')]);
  mesa.position.y = -0.6;
  e.escena.add(piso, mesa);
  const [autoGigante, autoGigante2, blaster] = await Promise.all([e.objeto('juguetes', 'vehicle-monster-truck', 5), e.objeto('juguetes', 'vehicle-speedster', 3.2), e.objeto('blaster', 'crate-wide', 2)]);
  autoGigante.position.set(-AN / 2 - 6, -1.2, -FO / 2 - 3);
  autoGigante.rotation.y = 0.6;
  autoGigante2.position.set(AN / 2 + 6, -1.2, -FO / 2 - 1);
  autoGigante2.rotation.y = -0.9;
  blaster.position.set(AN / 2 + 5, -1.2, FO / 2 + 2);
  e.escena.add(autoGigante, autoGigante2, blaster);
  await bosque(e.escena, 'plataformas', 'star', [{ x: -AN / 2 - 4, z: 5, alto: 2, giro: 0.4, y: -1.2 }, { x: AN / 2 + 3.5, z: -7, alto: 1.6, giro: 1, y: -1.2 }]);
}

/** Bloques de juguete (con sus botones encima) y cajas, como instancias. `armar` dibuja una grilla; `romper` saca una caja. */
export async function crearBloques(e: Escenario) {
  const geoBloque = mergeGeometries([new THREE.BoxGeometry(CELDA * 0.98, 1, CELDA * 0.98).translate(0, 0.5, 0), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => new THREE.CylinderGeometry(0.17, 0.17, 0.16, 10).translate(a * CELDA * 0.24, 1.08, b * CELDA * 0.24))]);
  const bloques = new THREE.InstancedMesh(geoBloque, new THREE.MeshLambertMaterial(), COLS * FILAS + 80);
  e.escena.add(bloques);
  // La caja del paquete es larga y baja: se ajusta a una celda y se levanta un poco
  const caja0 = await e.objeto('blaster', 'crate-medium', CELDA * 0.92, 'largo');
  caja0.scale.set(caja0.scale.x * 1.6, caja0.scale.y * 2.2, caja0.scale.z);
  const COLORES_BLOQUE = ['#ef5565', '#ffb02e', '#3fc79a', '#3f8cff', '#ffd23c', '#c79bff'];
  const cajas = new Map<string, THREE.Object3D>();
  return {
    armar(grilla: string[][]) {
      for (const cj of cajas.values()) e.escena.remove(cj);
      cajas.clear();
      const o = new THREE.Object3D(), color = new THREE.Color();
      let i = 0;
      const poner = (x: number, z: number, alto: number, tono: string) => { o.position.set(x, 0, z); o.scale.set(1, alto, 1); o.updateMatrix(); bloques.setMatrixAt(i, o.matrix); bloques.setColorAt(i++, color.set(tono)); };
      // Borde de la mesa
      for (let cx = -1; cx <= COLS; cx++) for (const cz of [-1, FILAS]) { const p = centro(cx, cz); poner(p.x, p.z, 0.9, COLORES_BLOQUE[(cx + cz + 20) % 6]); }
      for (let cz = 0; cz < FILAS; cz++) for (const cx of [-1, COLS]) { const p = centro(cx, cz); poner(p.x, p.z, 0.9, COLORES_BLOQUE[(cx + cz + 20) % 6]); }
      grilla.forEach((fila, cz) => fila.forEach((t, cx) => {
        const p = centro(cx, cz);
        if (t === '#') poner(p.x, p.z, 1, COLORES_BLOQUE[(cx * 3 + cz) % 6]);
        if (t === 'c') { const cj = caja0.clone(); cj.position.set(p.x, 0, p.z); cj.rotation.y = (cx + cz) % 2 ? Math.PI / 2 : 0; e.escena.add(cj); cajas.set(`${cx},${cz}`, cj); }
      }));
      bloques.count = i;
      bloques.instanceMatrix.needsUpdate = true;
      bloques.instanceColor!.needsUpdate = true;
    },
    /** Saca la caja de esa celda; devuelve si había una. */
    romper(cx: number, cz: number) {
      const clave = `${cx},${cz}`, cj = cajas.get(clave);
      if (!cj) return false;
      e.escena.remove(cj);
      cajas.delete(clave);
      return true;
    },
  };
}

/** Un tanque: cuerpo con orugas, torreta y cañón (y su sombra), ya puesto en la escena. */
export function mallaTanque(e: Escenario, color: string, { jefe = false, franja = false } = {}) {
  const grande = jefe ? 1.35 : 1;
  const cuerpo = new THREE.Group(), base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.36, 1.05), mat(color));
  base.position.y = 0.32;
  cuerpo.add(base);
  for (const lado of [-1, 1]) { const oruga = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 1.15), mat('#2f2f38')); oruga.position.set(lado * 0.5, 0.18, 0); cuerpo.add(oruga); }
  const torreta = new THREE.Group(), domo = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.26, 12), mat(color)), canon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 8), mat('#3a3a44'));
  domo.position.y = 0.63;
  canon.rotation.x = Math.PI / 2;
  canon.position.set(0, 0.66, 0.45);
  torreta.add(domo, canon);
  if (franja) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.06, 0.3), mat('#ffffff')); f.position.y = 0.51; cuerpo.add(f); }
  if (jefe) { for (let k = 0; k < 4; k++) { const pua = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), mat('#ffd23c')); const a = (k / 4) * Math.PI * 2; pua.position.set(Math.cos(a) * 0.25, 0.85, Math.sin(a) * 0.25); torreta.add(pua); } }
  cuerpo.scale.setScalar(grande);
  torreta.scale.setScalar(grande);
  const s = sombra(0.7 * grande);
  e.escena.add(cuerpo, torreta, s);
  return { cuerpo, torreta, sombra: s };
}

/** La bala de espuma (del paquete Blaster), mirando hacia adelante. */
export async function mallaDardo(e: Escenario) {
  const d = await e.objeto('blaster', 'bullet-foam-thick', 0.5).catch(() => null) ?? new THREE.Group().add(new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), mat('#ff7a3c')));
  d.rotation.x = Math.PI / 2;
  return d;
}

/** Una mina: base amarilla y una luz roja que parpadea (el segundo hijo). */
export function mallaMina() {
  const m = new THREE.Group(), base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 12), mat('#ffd23c')), luz = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b2e' }));
  base.position.y = 0.06; luz.position.y = 0.16;
  m.add(base, luz);
  return m;
}
