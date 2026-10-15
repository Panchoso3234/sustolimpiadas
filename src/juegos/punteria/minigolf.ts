import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generador } from '../../nucleo/azar';
import { aspectoAleatorio } from '../../personaje/catalogo';
import { cargar } from '../../nucleo/modelos';
import { bosque, cielo, halo, humo, ladrillo, lava, pasto, type Planta } from '../decorado';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, sombra } from '../reflejos/motor';
import { arrastre, guia, mat } from './fisica';

// Minigolf del Volcán: seis hoyos por partida sobre un paño de 20 × 12, en una meseta al pie de un volcán activo.
// Hay doce hoyos diseñados; la semilla elige cuáles tocan (el primero, de calentamiento, sale siempre).
// La física es plana y hecha a mano: rebotes en muros y piedras, hongos que rebotan con más fuerza,
// portales que teletransportan, lava que cuesta un golpe y un gólem de piedra que va y viene cruzando el camino.
// Antes de cada hoyo la cámara lo recorre, y con "Vista libre" se puede girar y acercar la cámara a gusto.
const MX = 10, MZ = 6, RADIO = 0.3, VEL_MAX = 17, ROCE = 5.2, REBOTE = 0.72, TOPE = 8, HOYO = 0.5, HONGO = 0.55, PORTAL = 0.5;
type Caja = [x: number, z: number, ancho: number, fondo: number]; // centro y tamaño
/** Bloque que se mueve: su caja en reposo, el eje por donde va y viene y cuánto se aleja. */
type Movil = [x: number, z: number, ancho: number, fondo: number, eje: 'x' | 'z', amplitud: number];
interface Hoyo {
  nombre: string; par: number; salida: [number, number]; meta: [number, number]; piedras: Caja[]; lava: Caja[]; movil?: Movil;
  hongos?: [number, number][];
  /** Entrada y salida de un portal. */
  portal?: [[number, number], [number, number]];
}

const TODOS: Hoyo[] = [
  { nombre: 'Calentamiento', par: 2, salida: [-8, 0], meta: [8, 0], piedras: [], lava: [] },
  { nombre: 'La Pared', par: 3, salida: [-8, -3.5], meta: [8, 3.5], piedras: [[0, -2, 1, 8]], lava: [], movil: [4, 0, 1, 2.2, 'z', 3.2] },
  { nombre: 'El Zigzag', par: 3, salida: [-8, 0], meta: [8, 0], piedras: [[-2.5, 3, 1, 6], [2.5, -3, 1, 6]], lava: [], movil: [0, 0, 1, 2, 'z', 3.5], hongos: [[-6, -3.5], [6, 3.5]] },
  { nombre: 'Río de Lava', par: 3, salida: [-8, 3.5], meta: [8, 3.5], piedras: [[0, 1.5, 12, 1]], lava: [[0, -3.5, 6, 2.4]], movil: [0, 4.2, 2, 1, 'x', 4] },
  { nombre: 'Las Puertas', par: 3, salida: [-8, -4], meta: [7.5, 4], piedras: [[-3, -1.5, 1, 9], [3, 1.5, 1, 9]], lava: [[0, 0, 2.6, 2.6]], movil: [6, 0, 1, 2, 'z', 3.5] },
  { nombre: 'La Caldera', par: 3, salida: [-8.5, 0], meta: [0, 0], piedras: [[-3.2, 0, 1, 5], [0, -3.2, 5, 1], [0, 3.2, 5, 1]], lava: [[5.5, 0, 3, 5], [-0.2, -5, 9, 1.2]], movil: [-6, 0, 1, 2, 'z', 3.5] },
  { nombre: 'El Tridente', par: 3, salida: [-8, 4], meta: [8, -4], piedras: [[-4, -2, 1, 8], [0, 2, 1, 8], [4, -2, 1, 8]], lava: [], movil: [6, 1, 1, 2, 'z', 2.5] },
  { nombre: 'La Roca', par: 3, salida: [-8, 0], meta: [8, 0], piedras: [[0, 0, 3, 3]], lava: [[0, -4.5, 3, 3], [0, 4.5, 3, 3]], movil: [5, 0, 1, 2.2, 'z', 3.5], hongos: [[-4, -3.2], [-4, 3.2]] },
  { nombre: 'La Vuelta', par: 4, salida: [-8, -4.5], meta: [-8, 4.5], piedras: [[-3, 0, 14, 1]], lava: [[9, 0, 2, 3]], movil: [6, 0, 2, 1, 'z', 3], portal: [[1.5, -5.1], [-2.5, 3.2]] },
  { nombre: 'El Embudo', par: 3, salida: [-8, 0], meta: [8, 0], piedras: [[-4, 3.5, 1, 5], [-4, -3.5, 1, 5], [2, 0, 1, 6]], lava: [], movil: [6, 0, 1, 2, 'z', 3.5] },
  { nombre: 'El Puente', par: 3, salida: [0, 4.5], meta: [0, -4.5], piedras: [[0, 0, 10, 1]], lava: [[-8.5, 0, 3, 2], [8.5, 0, 3, 2]], movil: [0, -2.8, 2, 1, 'x', 4], hongos: [[-6.5, -3.2], [6.5, 3.2]] },
  { nombre: 'La Diagonal', par: 3, salida: [-8.5, 4.5], meta: [8.5, -4.5], piedras: [[-3, 1, 1, 10], [3, -1, 1, 10]], lava: [[0, 0, 2, 2]], movil: [6.5, 0, 1, 2, 'z', 3] },
];

/** Los seis hoyos de la partida: el de calentamiento más cinco sorteados con la semilla, en orden de dificultad. */
function elegir(semilla: string): Hoyo[] {
  const r = generador(semilla), resto = TODOS.map((_, i) => i).slice(1);
  for (let i = resto.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [resto[i], resto[k]] = [resto[k], resto[i]]; }
  return [0, ...resto.slice(0, 5).sort((a, b) => a - b)].map((i) => TODOS[i]);
}
const dentro = (x: number, z: number, [cx, cz, w, d]: Caja, margen = 0) => Math.abs(x - cx) < w / 2 + margen && Math.abs(z - cz) < d / 2 + margen;
const NOMBRE_GOLPES = (golpes: number, par: number) => golpes === 1 ? '¡Hoyo en uno!' : golpes - par <= -2 ? '¡Águila!' : golpes - par === -1 ? '¡Birdie!' : golpes === par ? 'Par' : golpes - par === 1 ? 'Bogey' : `+${golpes - par}`;
const suave = (x: number) => x * x * (3 - 2 * x);

export async function crear(c: Contexto): Promise<Partida> {
  // Solo en pruebas: "?hoyo=8" parte directo en ese hoyo
  const probar = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('hoyo') ?? NaN) : NaN;
  const HOYOS = Number.isInteger(probar) && TODOS[probar] ? [TODOS[probar], ...elegir(c.semilla).slice(1)] : elegir(c.semilla), deco = generador('minigolf-decorado');
  const e = crearEscenario(c.caja, { ancho: 25.5, alto: 15, centro: [0, 0, -0.6], inclinacion: 0.6, sinPlaya: true });
  e.camara.far = 260;
  e.camara.updateProjectionMatrix();
  cielo(e.escena, '#4f6fc9', '#ffcf9a', '#f39a7a');
  e.escena.fog = new THREE.Fog('#f5b48c', 70, 190);

  // ── Meseta y paño ──
  const tierra = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#5a4438' }));
  tierra.rotation.x = -Math.PI / 2;
  tierra.position.y = -1.3;
  const prado = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.3, 14), new THREE.MeshLambertMaterial({ color: '#5aa257', flatShading: true }));
  prado.scale.set(19, 1, 13);
  prado.position.y = -0.66;
  const telaPano = pasto('#62bf6b', '#55ac5e', 2);
  telaPano.repeat.set(10, 1);
  const pano = new THREE.Mesh(new THREE.PlaneGeometry(MX * 2, MZ * 2), new THREE.MeshLambertMaterial({ map: telaPano }));
  pano.rotation.x = -Math.PI / 2;
  pano.position.y = 0.04;
  e.escena.add(tierra, prado, pano);
  // Bordes de madera con una moldura clara encima
  for (const [x, z, w, d] of [[0, -MZ - 0.25, MX * 2 + 1, 0.5], [0, MZ + 0.25, MX * 2 + 1, 0.5], [-MX - 0.25, 0, 0.5, MZ * 2], [MX + 0.25, 0, 0.5, MZ * 2]]) {
    const borde = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), mat('#7a4b2c')), moldura = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08), mat('#e8c58e'));
    borde.position.set(x, 0.3, z);
    moldura.position.set(x, 0.64, z);
    e.escena.add(borde, moldura);
  }

  // ── El volcán: cono facetado, vetas de lava, cráter encendido y humo ──
  const cono = new THREE.CylinderGeometry(3, 26, 20, 13, 6).toNonIndexed(), colores: number[] = [], tono = new THREE.Color();
  const pos = cono.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const alto = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, veta = deco() < 0.13 + Math.max(0, alto) * 0.012;
    tono.set(veta ? (deco() < 0.5 ? '#ff6a1e' : '#ffa23a') : alto > 5 ? '#3d2f2c' : deco() < 0.5 ? '#4f3d37' : '#5e4a40');
    for (let k = 0; k < 3; k++) colores.push(tono.r, tono.g, tono.b);
  }
  cono.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
  const volcan = new THREE.Mesh(cono, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  volcan.position.set(4, 8.7, -42);
  const telaLava = lava();
  const crater = new THREE.Mesh(new THREE.CircleGeometry(2.9, 13), new THREE.MeshBasicMaterial({ map: telaLava }));
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(4, 18.72, -42);
  const resplandor = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(255,140,60,0.7)'), depthWrite: false, fog: false }));
  resplandor.scale.set(16, 10, 1);
  resplandor.position.set(4, 20, -42.5);
  const lejano = new THREE.Mesh(new THREE.ConeGeometry(16, 13, 8), new THREE.MeshLambertMaterial({ color: '#6c5a64', flatShading: true }));
  lejano.position.set(-34, 5, -60);
  e.escena.add(volcan, crater, resplandor, lejano);
  const fumarola = humo(e.escena, 4, 19.2, -42, '#8d7f80', 7, 2.2);

  // Río de lava detrás de la cancha, que fluye
  const telaRio = lava();
  telaRio.repeat.set(14, 1);
  const rio = new THREE.Mesh(new THREE.PlaneGeometry(130, 2.6), new THREE.MeshBasicMaterial({ map: telaRio }));
  rio.rotation.x = -Math.PI / 2;
  rio.position.set(0, -1.22, -16);
  const telaPozas = lava();

  // ── Adornos de Kenney, como instancias ──
  const anillo = (cuantos: number, desde: number, hasta: number, alto: [number, number], fuera = (p: Planta) => Math.abs(p.z + 16) < 2.4) => {
    const lista: Planta[] = [];
    while (lista.length < cuantos) {
      const a = deco() * Math.PI * 2, d = desde + deco() * (hasta - desde), p = { x: Math.cos(a) * (MX + d), z: Math.sin(a) * (MZ + d * 0.8), alto: alto[0] + deco() * (alto[1] - alto[0]), giro: deco() * 6.28, y: -1.3 };
      // Lo que queda delante de la cámara se va más a los lados, para no tapar la cancha
      if (p.z > MZ + 1.5 && Math.abs(p.x) < MX + 4) continue;
      if (!fuera(p)) lista.push(p);
    }
    return lista;
  };
  const enPrado = (p: Planta) => ({ ...p, y: Math.hypot(p.x / 19, p.z / 13) < 1 ? 0 : -1.3 });
  rio.renderOrder = -1;
  e.escena.add(rio);
  await Promise.all([
    bosque(e.escena, 'naturaleza', 'tree_pineRoundA', anillo(14, 6, 18, [3, 5]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'tree_pineTallB', anillo(10, 9, 24, [4.5, 7]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'tree_palmTall', anillo(5, 5, 10, [3.2, 4.2]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'rock_largeA', anillo(9, 3, 20, [1, 2.2]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'rock_tallB', anillo(6, 8, 25, [2.5, 4.5])),
    bosque(e.escena, 'naturaleza', 'plant_bushLarge', anillo(12, 1.2, 6, [0.7, 1.2]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'mushroom_redGroup', anillo(6, 1, 5, [0.4, 0.7]).map(enPrado)),
    bosque(e.escena, 'plataformas', 'flowers-tall', anillo(14, 0.8, 5, [0.35, 0.6]).map(enPrado)),
    bosque(e.escena, 'naturaleza', 'stone_largeA', Array.from({ length: 22 }, (_, i) => ({ x: -55 + i * 5 + deco() * 2, z: -16 + (i % 2 ? 1.8 : -1.8), alto: 0.7 + deco() * 0.6, giro: deco() * 6, y: -1.3 }))),
  ]);

  // Molino de minigolf con aspas que giran, y un castillo de adorno
  const [molino, castillo] = await Promise.all([e.objeto('minigolf', 'windmill', 4.2), e.objeto('minigolf', 'castle', 2.6)]);
  molino.position.set(-15, 0, -9);
  molino.rotation.y = 0.5;
  castillo.position.set(16.5, 0, -9);
  
  castillo.rotation.y = -0.4;
  const aspas = molino.getObjectByName('blades');
  e.escena.add(molino, castillo);

  // Dos espectadores que festejan (o se lamentan) cada hoyo
  const publico = await Promise.all([0, 1].map((i) => e.personaje(aspectoAleatorio(generador(`${c.semilla}|publico${i}`)), 1.7)));
  publico[0].grupo.position.set(-6.5, 0, -7.6);
  publico[1].grupo.position.set(7, 0, -7.6);
  publico.forEach((k) => { k.grupo.rotation.y = 0; k.animar('idle'); });
  const festejar = (bien: boolean) => publico.forEach((k, i) => setTimeout(() => e.gesto(k, bien ? 'emote-yes' : 'emote-no', 1.2), i * 150));

  // Pájaros que vuelan en círculos alrededor del volcán
  const pajaros = Array.from({ length: 4 }, (_, i) => {
    const g = new THREE.Group(), ala = new THREE.PlaneGeometry(0.9, 0.35), m = new THREE.MeshBasicMaterial({ color: '#3a2f3a', side: THREE.DoubleSide });
    const izq = new THREE.Mesh(ala, m), der = new THREE.Mesh(ala, m);
    izq.position.x = -0.45; der.position.x = 0.45;
    g.add(izq, der);
    g.userData = { izq, der, fase: i * 1.6, radio: 9 + i * 2.2, alto: 16 + i * 1.3 };
    e.escena.add(g);
    return g;
  });

  // ── Piezas de cada hoyo ──
  const piezas = new THREE.Group(), telaMuro = ladrillo('#9a8f96', '#5d5560', 3);
  const hueco = new THREE.Mesh(new THREE.CircleGeometry(HOYO, 24), new THREE.MeshBasicMaterial({ color: '#140e0b' }));
  const aro = new THREE.Mesh(new THREE.RingGeometry(HOYO, HOYO + 0.1, 24), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  hueco.rotation.x = aro.rotation.x = -Math.PI / 2;
  const bandera = new THREE.Group(), tela = await e.pieza('minigolf', 'flag-red', 2.3);
  tela.position.y = 1.15;
  bandera.add(tela);
  const salidaMarca = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshLambertMaterial({ color: '#3e8a46' }));
  salidaMarca.rotation.x = -Math.PI / 2;
  const pelota = new THREE.Mesh(new THREE.SphereGeometry(RADIO, 16, 12), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  const sombraPelota = sombra(0.34);
  // Estela: bolitas que siguen a la pelota y se desvanecen
  const estela = Array.from({ length: 7 }, (_, i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(RADIO * (0.85 - i * 0.09), 8, 6), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.4 - i * 0.05, depthWrite: false })); b.visible = false; return b; });
  e.escena.add(piezas, hueco, aro, bandera, salidaMarca, pelota, sombraPelota, ...estela);
  const [hongoModelo, golfista] = await Promise.all([cargar('naturaleza', 'mushroom_redTall'), e.personaje(c.aspecto, 1.55)]);
  const puntosGuia = guia(e.escena, 9, '#fff6c4');

  // El gólem: el bloque que se mueve tiene ojos que siguen a la pelota
  let golem: THREE.Group | null = null, pupilas: THREE.Mesh[] = [];
  const crearGolem = (w: number, d: number) => {
    const g = new THREE.Group(), tex = telaMuro.clone();
    tex.repeat.set(Math.max(w, d), 1);
    tex.needsUpdate = true;
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), new THREE.MeshLambertMaterial({ map: tex, color: '#d8714f' }));
    cuerpo.position.y = 0.45;
    g.add(cuerpo);
    pupilas = [];
    for (const lado of [-1, 1]) {
      const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })), pupila = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#1a1010' }));
      ojo.position.set(lado * Math.min(0.25, w / 4), 0.95, Math.min(0.25, d / 4));
      pupila.position.copy(ojo.position);
      g.add(ojo, pupila);
      pupilas.push(pupila);
    }
    return g;
  };

  interface Hongo { x: number; z: number; malla: THREE.Object3D; golpe: number }
  let hongos: Hongo[] = [], portales: THREE.Mesh[] = [], pozas: { x: number; z: number; w: number; d: number }[] = [];
  let movilAhora: Caja | null = null;
  let actual = 0, golpes = 0, total = 0, terminado = false, empezado = false, cambio = -1, presenta = 0, enfriaPortal = 0, burbujas = 0;
  const tarjeta: number[] = [];
  const bola = { x: 0, z: 0 }, vel = { x: 0, z: 0 }, previa = { x: 0, z: 0 }, rastro: { x: number; z: number }[] = [];
  const quieta = () => vel.x === 0 && vel.z === 0;

  const montar = (t: number) => {
    const h = HOYOS[actual];
    piezas.clear();
    for (const [x, z, w, d] of h.piedras) {
      const tex = telaMuro.clone();
      tex.repeat.set(Math.max(w, d) / 1.5, 1);
      tex.needsUpdate = true;
      const muro = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), new THREE.MeshLambertMaterial({ map: tex })), tapa = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08), mat('#c9bfc4'));
      muro.position.set(x, 0.4, z);
      tapa.position.set(x, 0.84, z);
      piezas.add(muro, tapa);
    }
    pozas = h.lava.map(([x, z, w, d]) => ({ x, z, w, d }));
    for (const { x, z, w, d } of pozas) {
      const tex = telaPozas.clone();
      tex.repeat.set(w / 3, d / 3);
      tex.needsUpdate = true;
      const borde = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.35, d + 0.35), new THREE.MeshLambertMaterial({ color: '#3a2a26' })), poza = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex }));
      borde.rotation.x = poza.rotation.x = -Math.PI / 2;
      borde.position.set(x, 0.05, z);
      poza.position.set(x, 0.06, z);
      poza.userData.lava = tex;
      piezas.add(borde, poza);
    }
    hongos = (h.hongos ?? []).map(([x, z]) => {
      const m = hongoModelo.clone(), medida = new THREE.Box3().setFromObject(hongoModelo), s = 1.5 / Math.max(0.01, medida.max.y - medida.min.y);
      const g = new THREE.Group();
      m.scale.setScalar(s);
      m.position.y = -medida.min.y * s;
      g.add(m);
      g.position.set(x, 0.04, z);
      piezas.add(g);
      return { x, z, malla: g, golpe: -9 };
    });
    portales = [];
    if (h.portal) h.portal.forEach(([x, z], i) => {
      const anillo = new THREE.Mesh(new THREE.TorusGeometry(PORTAL, 0.09, 6, 20), new THREE.MeshBasicMaterial({ color: i ? '#ffb7f5' : '#b07bff' }));
      const remolino = new THREE.Mesh(new THREE.CircleGeometry(PORTAL, 20), new THREE.MeshBasicMaterial({ color: i ? '#ff7ae0' : '#7a4dff', transparent: true, opacity: 0.6 }));
      anillo.rotation.x = remolino.rotation.x = -Math.PI / 2;
      anillo.position.set(x, 0.12, z);
      remolino.position.set(x, 0.07, z);
      piezas.add(anillo, remolino);
      portales.push(anillo);
    });
    golem = h.movil ? crearGolem(h.movil[2], h.movil[3]) : null;
    if (golem) piezas.add(golem);
    movilAhora = null;
    hueco.position.set(h.meta[0], 0.07, h.meta[1]);
    aro.position.set(h.meta[0], 0.068, h.meta[1]);
    bandera.position.set(h.meta[0], 0, h.meta[1]);
    salidaMarca.position.set(h.salida[0], 0.05, h.salida[1]);
    bola.x = previa.x = h.salida[0]; bola.z = previa.z = h.salida[1];
    vel.x = vel.z = 0;
    rastro.length = 0;
    golpes = 0;
    presenta = t;
    e.hud.tiempo(`Hoyo ${actual + 1} de ${HOYOS.length}`);
    e.hud.aviso(`${h.nombre} · Par ${h.par}`, '', 1.8);
  };

  // ── Cámara: presentación de cada hoyo y vista libre ──
  const base = { pos: e.camara.position.clone(), mira: new THREE.Vector3(0, 0, -0.6) }, PRESENTA = 1.9;
  const orbita = new OrbitControls(e.camara, e.lienzo);
  orbita.enabled = false;
  orbita.enableDamping = true;
  orbita.minDistance = 5;
  orbita.maxDistance = 38;
  orbita.maxPolarAngle = 1.38;
  let libre = false;
  const botonVista = document.createElement('button');
  botonVista.className = 'boton golf-vista';
  botonVista.textContent = '🎥 Vista libre';
  const alternarVista = () => {
    libre = !libre;
    orbita.enabled = libre;
    botonVista.textContent = libre ? '⛳ Volver al tiro' : '🎥 Vista libre';
    if (libre) { orbita.target.set(bola.x, 0, bola.z); orbita.update(); e.hud.aviso('Arrastra para girar · rueda o dos dedos para acercar', '', 1.8); }
    else { e.camara.position.copy(base.pos); e.camara.lookAt(base.mira); }
  };
  botonVista.addEventListener('click', alternarVista);
  c.caja.appendChild(botonVista);
  e.escuchar(window, 'keydown', (ev) => { if (ev.key.toLowerCase() === 'v') alternarVista(); });

  const velocidad = (dx: number, dy: number, fuerza: number) => { const largo = Math.hypot(dx, dy) || 1; return { x: (-dx / largo) * VEL_MAX * fuerza, z: (-dy / largo) * VEL_MAX * fuerza }; };
  const tiro = arrastre(e, () => empezado && !terminado && !libre && quieta() && cambio < 0 && e.reloj() - presenta > PRESENTA, (t) => {
    const v = velocidad(t.dx, t.dy, t.fuerza);
    previa.x = bola.x; previa.z = bola.z;
    vel.x = v.x; vel.z = v.z;
    golpes++; total++;
    e.gesto(golfista, 'attack-melee-right', 0.6);
    if (t.fuerza > 0.85) e.temblar(0.15);
    if (!e.sonido.efecto('leve')) e.sonido.tono(520, 0.06, { tipo: 'square', vol: 0.15 });
  });

  const terminar = () => {
    terminado = true;
    e.detener();
    c.alTerminar({
      puntaje: Math.max(0, 1000 - (total - HOYOS.length) * 45),
      lineas: [['Golpes en total', String(total)], ['Hoyos en uno', String(tarjeta.filter((g) => g === 1).length)], ['Tarjeta', tarjeta.join(' · ')], ['Par del recorrido', String(HOYOS.reduce((s, h) => s + h.par, 0))]],
      detalle: { tarjeta, total },
    });
  };
  const cerrarHoyo = (t: number, texto: string, clase: string) => {
    tarjeta.push(golpes);
    vel.x = vel.z = 0;
    e.hud.aviso(texto, clase, 1.4);
    cambio = t + 1.6;
  };

  /** Saca la pelota de una caja si la está tocando y, si iba hacia ella, la hace rebotar. */
  const chocar = ([cx, cz, w, d]: Caja) => {
    const px = limitar(bola.x, cx - w / 2, cx + w / 2), pz = limitar(bola.z, cz - d / 2, cz + d / 2), nx = bola.x - px, nz = bola.z - pz, lejos = Math.hypot(nx, nz);
    if (lejos >= RADIO) return;
    // Si quedó metida justo en el borde (la empujó el bloque que se mueve), sale por el lado más cercano
    const ux = lejos ? nx / lejos : bola.x - cx >= 0 ? 1 : -1, uz = lejos ? nz / lejos : 0, hacia = vel.x * ux + vel.z * uz;
    bola.x = px + ux * RADIO; bola.z = pz + uz * RADIO;
    if (hacia < 0) { vel.x -= (1 + REBOTE) * hacia * ux; vel.z -= (1 + REBOTE) * hacia * uz; e.sonido.tono(240, 0.04, { tipo: 'square', vol: 0.06 }); }
  };
  // Un paso corto de la pelota: avanza, rebota en bordes, piedras, hongos y el gólem
  const paso = (dt: number, t: number) => {
    const h = HOYOS[actual];
    bola.x += vel.x * dt; bola.z += vel.z * dt;
    if (Math.abs(bola.x) > MX - RADIO) { bola.x = Math.sign(bola.x) * (MX - RADIO); vel.x *= -REBOTE; }
    if (Math.abs(bola.z) > MZ - RADIO) { bola.z = Math.sign(bola.z) * (MZ - RADIO); vel.z *= -REBOTE; }
    for (const piedra of h.piedras) chocar(piedra);
    if (movilAhora) chocar(movilAhora);
    for (const hg of hongos) {
      const dx = bola.x - hg.x, dz = bola.z - hg.z, d = Math.hypot(dx, dz);
      if (d >= RADIO + HONGO || d === 0) continue;
      // El hongo devuelve la pelota con más fuerza que un muro
      const nx = dx / d, nz = dz / d, hacia = vel.x * nx + vel.z * nz;
      bola.x = hg.x + nx * (RADIO + HONGO); bola.z = hg.z + nz * (RADIO + HONGO);
      if (hacia >= 0) continue;
      vel.x -= 2 * hacia * nx; vel.z -= 2 * hacia * nz;
      const rapidez = Math.hypot(vel.x, vel.z), nueva = Math.min(VEL_MAX, Math.max(rapidez * 1.2, 7));
      vel.x *= nueva / rapidez; vel.z *= nueva / rapidez;
      hg.golpe = t;
      e.sonido.tono(330, 0.18, { tipo: 'sine', vol: 0.25, hasta: 720 });
      e.chispas(hg.x, 1, hg.z, ['#ff5a4a', '#ffffff'], 8, 3);
    }
    const rapidez = Math.hypot(vel.x, vel.z), nueva = Math.max(0, rapidez - ROCE * dt);
    if (nueva < 0.15) vel.x = vel.z = 0; else { vel.x *= nueva / rapidez; vel.z *= nueva / rapidez; }
  };

  const mira = new THREE.Vector3(), desde = new THREE.Vector3();
  montar(0);
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    const h = HOYOS[actual] ?? HOYOS[HOYOS.length - 1];
    // Ambiente
    telaLava.offset.x += dt * 0.05;
    telaRio.offset.x -= dt * 0.08;
    telaRio.offset.y = Math.sin(t * 0.7) * 0.05;
    telaPozas.offset.set(Math.sin(t * 0.4) * 0.3, t * 0.06);
    for (const o of piezas.children) { const tex = o.userData.lava as THREE.Texture | undefined; if (tex) tex.offset.copy(telaPozas.offset); }
    fumarola.avanzar(dt);
    if (aspas) aspas.rotation.z += dt * 1.3;
    for (const p of pajaros) {
      const { izq, der, fase, radio, alto } = p.userData, a = t * 0.25 + fase;
      p.position.set(4 + Math.cos(a) * radio, alto + Math.sin(a * 2) * 0.6, -42 + Math.sin(a) * radio * 0.6);
      p.rotation.y = -a;
      izq.rotation.z = Math.sin(t * 8 + fase) * 0.6; der.rotation.z = -izq.rotation.z;
    }
    for (const hg of hongos) { const s = t - hg.golpe < 0.3 ? 1 + Math.sin((t - hg.golpe) * 21) * 0.25 : 1; hg.malla.scale.set(s, 2 - s, s); }
    for (const p of portales) p.rotation.z = t * 3;
    if (t > burbujas && pozas.length) {
      burbujas = t + 0.35;
      const p = pozas[Math.floor(Math.random() * pozas.length)];
      e.chispas(p.x + (Math.random() - 0.5) * p.w, 0.15, p.z + (Math.random() - 0.5) * p.d, ['#ffb02e', '#ff6a1e'], 2, 1.6);
    }

    // Pelota, estela, bandera y golfista
    pelota.position.set(bola.x, RADIO + 0.04, bola.z);
    pelota.rotation.x += vel.z * dt / RADIO;
    pelota.rotation.z -= vel.x * dt / RADIO;
    pelota.visible = sombraPelota.visible = cambio < 0 || t < cambio - 1.2;
    sombraPelota.position.set(bola.x + 0.08, 0.05, bola.z + 0.08);
    if (!quieta()) { rastro.unshift({ x: bola.x, z: bola.z }); if (rastro.length > 14) rastro.pop(); } else if (rastro.length) rastro.pop();
    estela.forEach((b, i) => { const p = rastro[i * 2 + 1]; b.visible = !!p && pelota.visible; if (p) b.position.set(p.x, RADIO + 0.04, p.z); });
    tela.rotation.y = Math.sin(t * 3) * 0.25;
    const v = tiro.tirando ? velocidad(tiro.dx, tiro.dy, tiro.fuerza) : null;
    puntosGuia.forEach((p, i) => { p.visible = !!v && tiro.fuerza > 0.12; if (v) { const s = (i + 1) * 0.045; p.position.set(bola.x + v.x * s, 0.3, bola.z + v.z * s); p.scale.setScalar(1 - i * 0.07); } });
    if (quieta() && cambio < 0) {
      // El golfista se para detrás de la pelota, mirando hacia donde se va a tirar
      const dir = v ? Math.atan2(v.x, v.z) : Math.atan2(h.meta[0] - bola.x, h.meta[1] - bola.z);
      golfista.grupo.position.set(limitar(bola.x - Math.sin(dir) * 0.9, -MX + 0.4, MX - 0.4), 0.04, limitar(bola.z - Math.cos(dir) * 0.9, -MZ + 0.4, MZ - 0.4));
      golfista.grupo.rotation.y = dir;
    }
    if (golem) for (const p of pupilas) {
      const dx = bola.x - golem.position.x, dz = bola.z - golem.position.z, d = Math.hypot(dx, dz) || 1;
      p.position.x = (p.position.x > 0 ? 1 : -1) * Math.min(0.25, (movilAhora?.[2] ?? 1) / 4) + (dx / d) * 0.09;
      p.position.z = Math.min(0.25, (movilAhora?.[3] ?? 1) / 4) + 0.06 + (dz / d) * 0.06;
    }

    const m = h.movil;
    if (m && !terminado && golem) {
      const corre = Math.sin(t * 1.2 * (1 + (c.nivel - 1) * 0.12)) * m[5];
      movilAhora = [m[0] + (m[4] === 'x' ? corre : 0), m[1] + (m[4] === 'z' ? corre : 0), m[2], m[3]];
      golem.position.set(movilAhora[0], 0.04 + Math.abs(Math.sin(t * 4.8)) * 0.08, movilAhora[1]);
      if (quieta()) chocar(movilAhora); // si la pelota está parada en su camino, la empuja
    }

    // Cámara: vista libre, presentación del hoyo o la vista de tiro
    if (libre) orbita.update();
    else if (t - presenta < PRESENTA && !terminado) {
      const k = suave(limitar((t - presenta) / PRESENTA, 0, 1));
      desde.set(h.meta[0] + 3.5, 3.2, h.meta[1] + 5);
      e.camara.position.lerpVectors(desde, base.pos, k);
      mira.set(h.meta[0], 0.5, h.meta[1]).lerp(base.mira, k);
      e.camara.lookAt(mira);
    } else { base.pos.copy(e.camara.position); }

    if (terminado || t <= 0) return;
    e.hud.extra(`Par ${h.par} · Golpes: ${golpes}`);
    e.hud.puntos(Math.max(0, 1000 - Math.max(0, total - HOYOS.length) * 45));
    if (cambio >= 0) {
      if (t < cambio) return;
      cambio = -1;
      if (++actual >= HOYOS.length) return terminar();
      return montar(t);
    }
    if (quieta()) return;
    for (let i = 0; i < 4 && !quieta(); i++) {
      paso(Math.min(dt, 0.05) / 4, t);
      if (Math.hypot(bola.x - h.meta[0], bola.z - h.meta[1]) < HOYO && Math.hypot(vel.x, vel.z) < 10) {
        const nombre = NOMBRE_GOLPES(golpes, h.par), bueno = golpes <= h.par;
        e.sonido.bien();
        e.chispas(h.meta[0], 0.6, h.meta[1], golpes === 1 ? ['#ffd23c', '#ff5a4a', '#5ad1ff', '#ffffff'] : ['#ffffff', '#ffd23c'], golpes === 1 ? 70 : bueno ? 36 : 14, golpes === 1 ? 8 : 5);
        if (golpes === 1) { e.temblar(0.6); e.chispas(4, 19, -42, ['#ff6a1e', '#ffb02e', '#3a2a26'], 50, 9); }
        e.gesto(golfista, bueno ? 'emote-yes' : 'idle', 1.2);
        festejar(bueno);
        return cerrarHoyo(t, golpes === 1 ? '¡Hoyo en uno!' : `${nombre} · ${golpes} ${golpes === 1 ? 'golpe' : 'golpes'}`, bueno ? 'oro' : '');
      }
      if (h.portal && t > enfriaPortal) {
        const [entrada, salida] = h.portal;
        if (Math.hypot(bola.x - entrada[0], bola.z - entrada[1]) < PORTAL * 0.8) {
          e.chispas(entrada[0], 0.4, entrada[1], ['#b07bff', '#ffffff'], 14, 3);
          const r = Math.hypot(vel.x, vel.z) || 1;
          bola.x = salida[0] + (vel.x / r) * (PORTAL + 0.1); bola.z = salida[1] + (vel.z / r) * (PORTAL + 0.1);
          rastro.length = 0;
          enfriaPortal = t + 0.6;
          e.chispas(salida[0], 0.4, salida[1], ['#ff7ae0', '#ffffff'], 14, 3);
          e.sonido.tono(880, 0.25, { tipo: 'triangle', vol: 0.2, hasta: 220 });
        }
      }
      if (h.lava.some((l) => dentro(bola.x, bola.z, l))) {
        // Lava: un golpe de castigo y de vuelta al punto anterior
        e.chispas(bola.x, 0.3, bola.z, ['#ff6a1e', '#ffd23c', '#3a2a26'], 18, 4);
        golpes++; total++;
        bola.x = previa.x; bola.z = previa.z; vel.x = vel.z = 0;
        rastro.length = 0;
        e.sonido.mal();
        e.temblar(0.25);
        e.gesto(golfista, 'emote-no', 1);
        e.hud.aviso('¡Lava! +1 golpe', 'mal', 0.9);
      }
    }
    if (quieta() && golpes >= TOPE) { festejar(false); cerrarHoyo(t, `Tope de ${TOPE} golpes`, 'mal'); }
  });

  return {
    empezar() { e.empezar(); empezado = true; },
    destruir() { orbita.dispose(); e.destruir(); },
  };
}
