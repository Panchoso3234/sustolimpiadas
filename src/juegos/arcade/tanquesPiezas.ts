import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bosque, cielo } from '../decorado';
import { mat } from '../punteria/fisica';
import { sombra, type Escenario } from '../reflejos/motor';

// Las piezas de Tanques de Juguete que comparten el juego individual y el duelo en vivo (mismo mundo):
// la pieza con su mesa y adornos, los bloques y cajas del tablero, y el modelo de cada tanque.

export const COLS = 20, FILAS = 12, CELDA = 1.2, AN = COLS * CELDA, FO = FILAS * CELDA, R_TANQUE = 0.55;
export type Clase = 'marron' | 'gris' | 'verde' | 'rojo' | 'minador' | 'kamikaze' | 'blindado' | 'jefe';
export interface DatosClase { color: string; vel: number; bala: number; rebotes: number; cada: number; vida: number; valor: number; nombre: string }
export const CLASES: Record<Clase, DatosClase> = {
  marron: { color: '#a0703c', vel: 0, bala: 6.5, rebotes: 1, cada: 3, vida: 1, valor: 100, nombre: 'Torreta' },
  gris: { color: '#8a8f9c', vel: 2, bala: 7, rebotes: 1, cada: 2.4, vida: 1, valor: 150, nombre: 'Patrulla' },
  verde: { color: '#4caf6a', vel: 0, bala: 12, rebotes: 2, cada: 2.6, vida: 1, valor: 220, nombre: 'Francotirador' },
  rojo: { color: '#e5483a', vel: 3.4, bala: 8.5, rebotes: 1, cada: 1.1, vida: 1, valor: 260, nombre: 'Veloz' },
  minador: { color: '#d9b23a', vel: 1.7, bala: 7, rebotes: 1, cada: 3, vida: 1, valor: 200, nombre: 'Minador' },
  kamikaze: { color: '#ff7a1e', vel: 4.4, bala: 0, rebotes: 0, cada: 99, vida: 1, valor: 180, nombre: 'Kamikaze' },
  blindado: { color: '#5a6a7a', vel: 1.4, bala: 7.5, rebotes: 1, cada: 2.2, vida: 3, valor: 320, nombre: 'Blindado' },
  jefe: { color: '#9a5ae0', vel: 1.8, bala: 8, rebotes: 1, cada: 1.6, vida: 8, valor: 900, nombre: 'Jefe' },
};
// Tableros: # bloque firme, c caja que se rompe, . libre. Cada uno de 20 × 12.
export const TABLEROS = [
  ['....................', '....................', '.....##......##.....', '.....#........#.....', '....................', '........cccc........', '........cccc........', '....................', '.....#........#.....', '.....##......##.....', '....................', '....................'],
  ['....................', '...c..........c.....', '...c....##....c.....', '...c....##....c.....', '..........c.........', '..###.........###...', '..###.........###...', '.........c..........', '...c....##....c.....', '...c....##....c.....', '...c..........c.....', '....................'],
  ['....................', '..####......####....', '.....c......c.......', '.....c..cc..c.......', '.....c......c.......', '.........##.........', '.........##.........', '.....c......c.......', '.....c..cc..c.......', '.....c......c.......', '..####......####....', '....................'],
  ['....................', '....#....cc....#....', '....#..........#....', '....#...####...#....', '..cc.....##.....cc..', '.........##.........', '.........##.........', '..cc.....##.....cc..', '....#...####...#....', '....#..........#....', '....#....cc....#....', '....................'],
  ['....................', '..cc....#.......cc..', '..c.....#....#...c..', '........#....#......', '....cc..........##..', '.............c......', '......c.............', '..##..........cc....', '......#....#........', '..c...#....#.....c..', '..cc.......#....cc..', '....................'],
  ['....................', '...##..c....c..##...', '...#............#...', '.......######.......', '..c......cc......c..', '..c...#......#...c..', '..c...#......#...c..', '..c......cc......c..', '.......######.......', '...#............#...', '...##..c....c..##...', '....................'],
  ['....................', '..c.c.c.c.c.c.c.c...', '....................', '...####.....####....', '.........cc.........', '..#....#....#....#..', '..#....#....#....#..', '.........cc.........', '...####.....####....', '....................', '..c.c.c.c.c.c.c.c...', '....................'],
  ['....................', '..cc............cc..', '..c....######....c..', '.......#....#.......', '....##..........##..', '....................', '....................', '....##..........##..', '.......#....#.......', '..c....######....c..', '..cc............cc..', '....................'],
];
export const celda = (x: number, z: number): [number, number] => [Math.floor((x + AN / 2) / CELDA), Math.floor((z + FO / 2) / CELDA)];
export const centro = (cx: number, cz: number) => ({ x: -AN / 2 + (cx + 0.5) * CELDA, z: -FO / 2 + (cz + 0.5) * CELDA });
/** Empuja un tanque fuera de los bloques y de los bordes. Si otro tanque lo metió con el centro dentro de un bloque o fuera
 *  de la mesa, lo lleva a la celda libre más cercana (antes quedaba ahí, imposible de matar: reporte del 2026-10-30). */
export const chocarMuros = (t: { x: number; z: number }, solido: (cx: number, cz: number) => boolean) => {
  if (solido(...celda(t.x, t.z))) {
    let mejor: { x: number; z: number } | null = null, dm = Infinity;
    for (let a = 0; a < COLS; a++) for (let b = 0; b < FILAS; b++) { if (solido(a, b)) continue; const p = centro(a, b), d = Math.hypot(p.x - t.x, p.z - t.z); if (d < dm) { dm = d; mejor = p; } }
    if (mejor) { t.x = mejor.x; t.z = mejor.z; }
    return;
  }
  const [cx, cz] = celda(t.x, t.z);
  for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
    if (!solido(a, b)) continue;
    const p = centro(a, b), px = Math.min(Math.max(t.x, p.x - CELDA / 2), p.x + CELDA / 2), pz = Math.min(Math.max(t.z, p.z - CELDA / 2), p.z + CELDA / 2), dx = t.x - px, dz = t.z - pz, d = Math.hypot(dx, dz);
    if (d >= R_TANQUE || d === 0) continue;
    t.x = px + (dx / d) * R_TANQUE; t.z = pz + (dz / d) * R_TANQUE;
  }
};

const pintar = (w: number, h: number, f: (g: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; f(cv.getContext('2d')!); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

/** La pieza: piso de madera, alfombra, mesa y alrededor un cuarto de niño con juguetes gigantes. */
export async function montarSala(e: Escenario) {
  cielo(e.escena, '#ffe2c4', '#ffcf9e');
  const madera = pintar(128, 128, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d8a874' : '#cf9d68'; g.fillRect(0, i * 16, 128, 16); g.fillStyle = 'rgba(90,50,20,0.25)'; g.fillRect(0, i * 16 + 15, 128, 1); g.fillRect(((i * 47) % 128), i * 16, 1, 16); } });
  madera.repeat.set(AN / 6, FO / 6);
  const tablas = pintar(128, 128, (g) => { for (let i = 0; i < 4; i++) { g.fillStyle = ['#9a6a42', '#a8784c', '#8f6038', '#a06e46'][i]; g.fillRect(0, i * 32, 128, 32); g.fillStyle = 'rgba(40,20,5,0.35)'; g.fillRect(0, i * 32 + 31, 128, 1); g.fillRect((i * 53) % 128, i * 32, 1, 32); } });
  tablas.repeat.set(40, 40);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ map: tablas }));
  piso.rotation.x = -Math.PI / 2; piso.position.y = -1.2;
  // Alfombra redonda con anillos de colores bajo la mesa
  const alfombra = pintar(256, 256, (g) => { const colores = ['#5b7fd6', '#ffd23c', '#ef5565', '#3fc79a', '#5b7fd6', '#c79bff']; for (let i = 0; i < 6; i++) { g.fillStyle = colores[i]; g.beginPath(); g.arc(128, 128, 128 - i * 20, 0, Math.PI * 2); g.fill(); } });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(AN * 0.85, 48), new THREE.MeshLambertMaterial({ map: alfombra })); rug.rotation.x = -Math.PI / 2; rug.position.y = -1.19;
  const mesa = new THREE.Mesh(new THREE.BoxGeometry(AN + 1.6, 1.2, FO + 1.6), [mat('#8a5a38'), mat('#8a5a38'), new THREE.MeshLambertMaterial({ map: madera }), mat('#8a5a38'), mat('#8a5a38'), mat('#8a5a38')]);
  mesa.position.y = -0.6;
  e.escena.add(piso, rug, mesa);
  // Luz de la ventana sobre el piso (un rectángulo claro inclinado)
  const ventana = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.22, depthWrite: false }));
  ventana.rotation.set(-Math.PI / 2, 0, 0.5); ventana.position.set(AN / 2 + 5, -1.18, FO / 2 + 1); e.escena.add(ventana);
  const cuarto = new THREE.Group();
  // Repisa con libros al fondo
  const repisa = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 1.4), mat('#7a4a2a')); repisa.position.set(-4, 1.3, -FO / 2 - 4.5); cuarto.add(repisa);
  for (let fila = 0; fila < 2; fila++) for (let i = 0; i < 16; i++) { const alto = 1.2 + ((i * 7) % 5) * 0.12, libro = new THREE.Mesh(new THREE.BoxGeometry(0.45, alto, 1), mat(['#ef5565', '#3f8cff', '#ffd23c', '#3fc79a', '#c79bff', '#ff9a2e'][(i + fila * 3) % 6])); libro.position.set(-8.6 + i * 0.58, 0 + fila * 2.1 + alto / 2 - 0.4, -FO / 2 - 3.85); cuarto.add(libro); }
  // Cubos de letras, una pelota, lápices de colores y una caja de juguetes
  const letras = ['A', 'B', 'C', 'S', 'U', 'T'];
  letras.forEach((l, i) => {
    const t = pintar(64, 64, (g) => { g.fillStyle = ['#ffd23c', '#3fc79a', '#ef5565', '#3f8cff', '#ff9a2e', '#c79bff'][i]; g.fillRect(0, 0, 64, 64); g.fillStyle = '#ffffff'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(l, 32, 35); });
    const cubo = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshLambertMaterial({ map: t }));
    const [x, z, y] = [[-AN / 2 - 3.5, FO / 2 + 1, 0], [-AN / 2 - 2.2, FO / 2 + 1.8, 0], [-AN / 2 - 2.9, FO / 2 + 1.4, 1.4], [AN / 2 + 3, -FO / 2 - 1.5, 0], [AN / 2 + 4.4, -FO / 2 - 1.2, 0], [AN / 2 + 3.7, -FO / 2 - 1.3, 1.4]][i];
    cubo.position.set(x, -0.5 + y, z); cubo.rotation.y = i * 0.4; cuarto.add(cubo);
  });
  const pelota = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 14), new THREE.MeshLambertMaterial({ map: pintar(64, 32, (g) => { for (let i = 0; i < 6; i++) { g.fillStyle = ['#ef5565', '#ffffff', '#3f8cff', '#ffffff', '#ffd23c', '#ffffff'][i]; g.fillRect((i * 64) / 6, 0, 64 / 6 + 1, 32); } }) }));
  pelota.position.set(AN / 2 + 3.4, 0.1, FO / 2 + 2.6); pelota.rotation.z = 0.5; cuarto.add(pelota);
  for (let i = 0; i < 5; i++) { const lapiz = new THREE.Group(), color = ['#ef5565', '#3f8cff', '#3fc79a', '#ffd23c', '#c79bff'][i]; const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3, 6), mat(color)); const punta = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 6), mat('#f2d2a0')); punta.position.y = 1.7; lapiz.add(cuerpo, punta); lapiz.rotation.set(Math.PI / 2, 0, 0.3 + i * 0.12); lapiz.position.set(-AN / 2 - 1.8 + i * 0.36, -1.03, -FO / 2 - 1.2); cuarto.add(lapiz); }
  const cajaJuguetes = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 2.6), mat('#3fa3d9')); cajaJuguetes.position.set(AN / 2 + 6, 0, 3); cuarto.add(cajaJuguetes);
  const tapa = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 2.8), mat('#ffd23c')); tapa.position.set(AN / 2 + 6, 1.35, 3); tapa.rotation.z = 0.25; cuarto.add(tapa);
  // Lámpara de pie con su pantalla
  const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), mat('#3a3a44')); pie.position.set(-AN / 2 - 5, 2.3, -FO / 2 - 2); cuarto.add(pie);
  const pantalla = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.3, 16, 1, true), new THREE.MeshLambertMaterial({ color: '#fff0c8', side: THREE.DoubleSide, emissive: '#ffd27a', emissiveIntensity: 0.5 })); pantalla.position.set(-AN / 2 - 5, 5.9, -FO / 2 - 2); cuarto.add(pantalla);
  e.escena.add(cuarto);
  const calida = new THREE.PointLight('#ffd9a0', 8, 26, 1.4); calida.position.set(-AN / 2 - 5, 5.2, -FO / 2 - 2); e.escena.add(calida);
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

const texOruga = pintar(16, 64, (g) => { g.fillStyle = '#2f2f38'; g.fillRect(0, 0, 16, 64); g.fillStyle = '#4a4a56'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 8, 16, 3); });

/** Un tanque: cuerpo con orugas (que avanzan con `rodar`), torreta y cañón (y su sombra), ya puesto en la escena. */
export function mallaTanque(e: Escenario, color: string, { jefe = false, franja = false, clase = '' as Clase | '' } = {}) {
  const grande = jefe ? 1.35 : 1;
  const cuerpo = new THREE.Group(), base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.36, 1.05), mat(color));
  base.position.y = 0.32;
  cuerpo.add(base);
  const tex = texOruga.clone(); tex.needsUpdate = true; tex.repeat.set(1, 1.4);
  const matOruga = new THREE.MeshLambertMaterial({ map: tex });
  for (const lado of [-1, 1]) { const oruga = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 1.15), matOruga); oruga.position.set(lado * 0.5, 0.18, 0); cuerpo.add(oruga); }
  const torreta = new THREE.Group(), domo = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.26, 12), mat(color)), canon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 8), mat('#3a3a44'));
  domo.position.y = 0.63;
  canon.rotation.x = Math.PI / 2;
  canon.position.set(0, 0.66, 0.45);
  torreta.add(domo, canon);
  if (franja) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.06, 0.3), mat('#ffffff')); f.position.y = 0.51; cuerpo.add(f); }
  if (jefe) { for (let k = 0; k < 4; k++) { const pua = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), mat('#ffd23c')); const a = (k / 4) * Math.PI * 2; pua.position.set(Math.cos(a) * 0.25, 0.85, Math.sin(a) * 0.25); torreta.add(pua); } }
  // Lo que distingue a cada tanque nuevo
  if (clase === 'blindado') { const placa = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.42, 0.14), mat('#9aa6b4')); placa.position.set(0, 0.36, 0.56); cuerpo.add(placa); }
  if (clase === 'kamikaze') { const bomba = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat('#2a2a30')); bomba.position.y = 0.72; const mecha = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 4), mat('#ffd23c')); mecha.position.y = 1.02; torreta.add(bomba, mecha); canon.visible = false; domo.visible = false; }
  if (clase === 'minador') { const carga = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10), mat('#ffd23c')); carga.position.set(0, 0.55, -0.32); cuerpo.add(carga); }
  cuerpo.scale.setScalar(grande);
  torreta.scale.setScalar(grande);
  const s = sombra(0.7 * grande);
  e.escena.add(cuerpo, torreta, s);
  return { cuerpo, torreta, sombra: s, canon, rodar: (d: number) => { tex.offset.y -= d * 0.9; } };
}

/** La bala de espuma (del paquete Blaster), mirando hacia adelante. */
export async function mallaDardo(e: Escenario) {
  const d = await e.objeto('blaster', 'bullet-foam-thick', 0.5).catch(() => null) ?? new THREE.Group().add(new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), mat('#ff7a3c')));
  d.rotation.x = Math.PI / 2;
  return d;
}

/** Una mina: base amarilla (o negra si es enemiga) y una luz roja que parpadea (el segundo hijo). */
export function mallaMina(enemiga = false) {
  const m = new THREE.Group(), base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 12), mat(enemiga ? '#2a2a30' : '#ffd23c')), luz = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b2e' }));
  base.position.y = 0.06; luz.position.y = 0.16;
  m.add(base, luz);
  return m;
}
