import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar } from '../reflejos/motor';
import { arrastre, caja, guia, mat } from './fisica';

// Minigolf del Volcán: seis hoyos por partida sobre un paño de 20 × 12. Hay doce diseñados; la semilla elige
// cuáles tocan (el primero, de calentamiento, sale siempre), así el recorrido cambia cada día pero es igual para todos.
// La pelota rebota en los muros y en las piedras; la lava cuesta un golpe y devuelve la pelota a donde estaba.
// Desde el segundo hoyo hay un bloque que va y viene cruzando el camino (puesto a mano en cada hoyo para no chocar muros).
const MX = 10, MZ = 6, RADIO = 0.3, VEL_MAX = 17, ROCE = 5.2, REBOTE = 0.72, TOPE = 8, HOYO = 0.5;
type Caja = [x: number, z: number, ancho: number, fondo: number]; // centro y tamaño
/** Bloque que se mueve: su caja en reposo, el eje por donde va y viene y cuánto se aleja. */
type Movil = [x: number, z: number, ancho: number, fondo: number, eje: 'x' | 'z', amplitud: number];
interface Hoyo { salida: [number, number]; meta: [number, number]; piedras: Caja[]; lava: Caja[]; movil?: Movil }

const TODOS: Hoyo[] = [
  { salida: [-8, 0], meta: [8, 0], piedras: [], lava: [] },
  { salida: [-8, -3.5], meta: [8, 3.5], piedras: [[0, -2, 1, 8]], lava: [], movil: [4, 0, 1, 2.2, 'z', 3.2] },
  { salida: [-8, 0], meta: [8, 0], piedras: [[-2.5, 3, 1, 6], [2.5, -3, 1, 6]], lava: [], movil: [0, 0, 1, 2, 'z', 3.5] },
  { salida: [-8, 3.5], meta: [8, 3.5], piedras: [[0, 1.5, 12, 1]], lava: [[0, -3.5, 6, 2.4]], movil: [0, 4.2, 2, 1, 'x', 4] },
  { salida: [-8, -4], meta: [7.5, 4], piedras: [[-3, -1.5, 1, 9], [3, 1.5, 1, 9]], lava: [[0, 0, 2.6, 2.6]], movil: [6, 0, 1, 2, 'z', 3.5] },
  { salida: [-8.5, 0], meta: [0, 0], piedras: [[-3.2, 0, 1, 5], [0, -3.2, 5, 1], [0, 3.2, 5, 1]], lava: [[5.5, 0, 3, 5], [-0.2, -5, 9, 1.2]], movil: [-6, 0, 1, 2, 'z', 3.5] },
  { salida: [-8, 4], meta: [8, -4], piedras: [[-4, -2, 1, 8], [0, 2, 1, 8], [4, -2, 1, 8]], lava: [], movil: [6, 1, 1, 2, 'z', 2.5] },
  { salida: [-8, 0], meta: [8, 0], piedras: [[0, 0, 3, 3]], lava: [[0, -4.5, 3, 3], [0, 4.5, 3, 3]], movil: [5, 0, 1, 2.2, 'z', 3.5] },
  { salida: [-8, -4.5], meta: [-8, 4.5], piedras: [[-3, 0, 14, 1]], lava: [[9, 0, 2, 3]], movil: [6, 0, 2, 1, 'z', 3] },
  { salida: [-8, 0], meta: [8, 0], piedras: [[-4, 3.5, 1, 5], [-4, -3.5, 1, 5], [2, 0, 1, 6]], lava: [], movil: [6, 0, 1, 2, 'z', 3.5] },
  { salida: [0, 4.5], meta: [0, -4.5], piedras: [[0, 0, 10, 1]], lava: [[-8.5, 0, 3, 2], [8.5, 0, 3, 2]], movil: [0, -2.8, 2, 1, 'x', 4] },
  { salida: [-8.5, 4.5], meta: [8.5, -4.5], piedras: [[-3, 1, 1, 10], [3, -1, 1, 10]], lava: [[0, 0, 2, 2]], movil: [6.5, 0, 1, 2, 'z', 3] },
];

/** Los seis hoyos de la partida: el de calentamiento más cinco sorteados con la semilla, en orden de dificultad. */
function elegir(semilla: string): Hoyo[] {
  const r = generador(semilla), resto = TODOS.map((_, i) => i).slice(1);
  for (let i = resto.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [resto[i], resto[k]] = [resto[k], resto[i]]; }
  return [0, ...resto.slice(0, 5).sort((a, b) => a - b)].map((i) => TODOS[i]);
}
const dentro = (x: number, z: number, [cx, cz, w, d]: Caja, margen = 0) => Math.abs(x - cx) < w / 2 + margen && Math.abs(z - cz) < d / 2 + margen;

export async function crear(c: Contexto): Promise<Partida> {
  const HOYOS = elegir(c.semilla);
  const e = crearEscenario(c.caja, { ancho: 27, alto: 15.5, centro: [0, 0, -0.4], inclinacion: 1.08 });

  // Paño, bordes y volcán de fondo
  const pano = new THREE.Mesh(new THREE.PlaneGeometry(MX * 2, MZ * 2), new THREE.MeshStandardMaterial({ color: '#5fb86a', roughness: 1 }));
  pano.rotation.x = -Math.PI / 2;
  pano.position.y = 0.04;
  e.escena.add(pano);
  for (const [x, z, w, d] of [[0, -MZ - 0.25, MX * 2 + 1, 0.5], [0, MZ + 0.25, MX * 2 + 1, 0.5], [-MX - 0.25, 0, 0.5, MZ * 2], [MX + 0.25, 0, 0.5, MZ * 2]]) {
    const borde = caja(w, 0.7, d, '#8a5a38');
    borde.position.set(x, 0.35, z);
    e.escena.add(borde);
  }
  const volcan = new THREE.Mesh(new THREE.ConeGeometry(7, 7, 7, 1, true), mat('#6b5a52')), crater = new THREE.Mesh(new THREE.CircleGeometry(1.9, 7), new THREE.MeshBasicMaterial({ color: '#ff7a2e' }));
  volcan.position.set(0, 2.2, -14);
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(0, 5.6, -14);
  e.escena.add(volcan, crater);

  const piezas = new THREE.Group(), matLava = new THREE.MeshBasicMaterial({ color: '#ff6a1e' });
  const hueco = new THREE.Mesh(new THREE.CircleGeometry(HOYO, 20), new THREE.MeshBasicMaterial({ color: '#1c1410' })), bandera = new THREE.Group();
  hueco.rotation.x = -Math.PI / 2;
  const tela = await e.pieza('minigolf', 'flag-red', 2.3);
  tela.position.y = 1.15;
  bandera.add(tela);
  const pelota = new THREE.Mesh(new THREE.SphereGeometry(RADIO, 14, 10), mat('#ffffff'));
  const bloque = caja(1, 0.8, 1, '#c0452f');
  e.escena.add(piezas, hueco, bandera, pelota, bloque);
  let movilAhora: Caja | null = null;
  const puntosGuia = guia(e.escena, 8);

  let actual = 0, golpes = 0, total = 0, terminado = false, empezado = false, cambio = -1;
  const tarjeta: number[] = [];
  const pos = { x: 0, z: 0 }, vel = { x: 0, z: 0 }, previa = { x: 0, z: 0 };
  const quieta = () => vel.x === 0 && vel.z === 0;

  const montar = () => {
    const h = HOYOS[actual];
    piezas.clear();
    for (const [x, z, w, d] of h.piedras) { const p = caja(w, 0.8, d, '#9a97a6'); p.position.set(x, 0.4, z); piezas.add(p); }
    for (const [x, z, w, d] of h.lava) { const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), matLava); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.06, z); piezas.add(l); }
    bloque.visible = !!h.movil;
    if (h.movil) bloque.scale.set(h.movil[2], 1, h.movil[3]);
    movilAhora = null;
    hueco.position.set(h.meta[0], 0.07, h.meta[1]);
    bandera.position.set(h.meta[0], 0, h.meta[1]);
    pos.x = previa.x = h.salida[0]; pos.z = previa.z = h.salida[1];
    vel.x = vel.z = 0;
    golpes = 0;
    e.hud.tiempo(`Hoyo ${actual + 1} de ${HOYOS.length}`);
  };

  const velocidad = (dx: number, dy: number, fuerza: number) => { const largo = Math.hypot(dx, dy) || 1; return { x: (-dx / largo) * VEL_MAX * fuerza, z: (-dy / largo) * VEL_MAX * fuerza }; };
  const tiro = arrastre(e, () => empezado && !terminado && quieta() && cambio < 0, (t) => {
    const v = velocidad(t.dx, t.dy, t.fuerza);
    previa.x = pos.x; previa.z = pos.z;
    vel.x = v.x; vel.z = v.z;
    golpes++; total++;
    if (!e.sonido.efecto('leve')) e.sonido.tono(520, 0.06, { tipo: 'square', vol: 0.15 });
  });

  const terminar = () => {
    terminado = true;
    e.detener();
    c.alTerminar({
      puntaje: Math.max(0, 1000 - (total - HOYOS.length) * 45),
      lineas: [['Golpes en total', String(total)], ['Hoyos en uno', String(tarjeta.filter((g) => g === 1).length)], ['Tarjeta', tarjeta.join(' · ')]],
      detalle: { tarjeta, total },
    });
  };
  const cerrarHoyo = (t: number, texto: string, clase: string) => {
    tarjeta.push(golpes);
    vel.x = vel.z = 0;
    e.hud.aviso(texto, clase, 1.1);
    cambio = t + 1.2;
  };

  /** Saca la pelota de una caja si la está tocando y, si iba hacia ella, la hace rebotar. */
  const chocar = ([cx, cz, w, d]: Caja) => {
    const px = limitar(pos.x, cx - w / 2, cx + w / 2), pz = limitar(pos.z, cz - d / 2, cz + d / 2), nx = pos.x - px, nz = pos.z - pz, lejos = Math.hypot(nx, nz);
    if (lejos >= RADIO) return;
    // Si quedó metida justo en el borde (la empujó el bloque que se mueve), sale por el lado más cercano
    const ux = lejos ? nx / lejos : pos.x - cx >= 0 ? 1 : -1, uz = lejos ? nz / lejos : 0, hacia = vel.x * ux + vel.z * uz;
    pos.x = px + ux * RADIO; pos.z = pz + uz * RADIO;
    if (hacia < 0) { vel.x -= (1 + REBOTE) * hacia * ux; vel.z -= (1 + REBOTE) * hacia * uz; e.sonido.tono(240, 0.04, { tipo: 'square', vol: 0.06 }); }
  };
  // Un paso corto de la pelota: avanza, rebota en bordes, piedras y el bloque que se mueve
  const paso = (dt: number) => {
    const h = HOYOS[actual];
    pos.x += vel.x * dt; pos.z += vel.z * dt;
    if (Math.abs(pos.x) > MX - RADIO) { pos.x = Math.sign(pos.x) * (MX - RADIO); vel.x *= -REBOTE; }
    if (Math.abs(pos.z) > MZ - RADIO) { pos.z = Math.sign(pos.z) * (MZ - RADIO); vel.z *= -REBOTE; }
    for (const piedra of h.piedras) chocar(piedra);
    if (movilAhora) chocar(movilAhora);
    const rapidez = Math.hypot(vel.x, vel.z), nueva = Math.max(0, rapidez - ROCE * dt);
    if (nueva < 0.15) vel.x = vel.z = 0; else { vel.x *= nueva / rapidez; vel.z *= nueva / rapidez; }
  };

  montar();
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    pelota.position.set(pos.x, RADIO + 0.04, pos.z);
    pelota.visible = cambio < 0 || t < cambio - 0.9;
    tela.rotation.y = Math.sin(t * 3) * 0.25;
    const v = tiro.tirando ? velocidad(tiro.dx, tiro.dy, tiro.fuerza) : null;
    puntosGuia.forEach((p, i) => { p.visible = !!v && tiro.fuerza > 0.12; if (v) { const s = (i + 1) * 0.045; p.position.set(pos.x + v.x * s, 0.3, pos.z + v.z * s); } });
    const m = HOYOS[actual]?.movil;
    if (m && !terminado) {
      const corre = Math.sin(t * 1.2 * (1 + (c.nivel - 1) * 0.12)) * m[5];
      movilAhora = [m[0] + (m[4] === 'x' ? corre : 0), m[1] + (m[4] === 'z' ? corre : 0), m[2], m[3]];
      bloque.position.set(movilAhora[0], 0.4, movilAhora[1]);
      if (quieta()) chocar(movilAhora); // si la pelota está parada en su camino, la empuja
    }
    if (terminado || t <= 0) return;
    e.hud.extra(`Golpes: ${golpes}`);
    e.hud.puntos(Math.max(0, 1000 - Math.max(0, total - HOYOS.length) * 45));
    if (cambio >= 0) {
      if (t < cambio) return;
      cambio = -1;
      if (++actual >= HOYOS.length) return terminar();
      return montar();
    }
    if (quieta()) return;
    const h = HOYOS[actual];
    for (let i = 0; i < 4 && !quieta(); i++) {
      paso(Math.min(dt, 0.05) / 4);
      if (Math.hypot(pos.x - h.meta[0], pos.z - h.meta[1]) < HOYO && Math.hypot(vel.x, vel.z) < 10) {
        e.sonido.bien();
        return cerrarHoyo(t, golpes === 1 ? '¡Hoyo en uno!' : `Adentro en ${golpes}`, 'oro');
      }
      if (h.lava.some((l) => dentro(pos.x, pos.z, l))) {
        // Lava: un golpe de castigo y de vuelta al punto anterior
        golpes++; total++;
        pos.x = previa.x; pos.z = previa.z; vel.x = vel.z = 0;
        e.sonido.mal();
        e.hud.aviso('¡Lava! +1 golpe', 'mal', 0.9);
      }
    }
    if (quieta() && golpes >= TOPE) cerrarHoyo(t, `Tope de ${TOPE} golpes`, 'mal');
  });

  return { empezar() { e.empezar(); empezado = true; }, destruir: e.destruir };
}
