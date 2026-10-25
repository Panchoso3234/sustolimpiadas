import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { aspectoAleatorio } from '../../personaje/catalogo';
import type { Kenney } from '../../personaje/kenney';
import { bosque, cielo, pasto, type Planta } from '../decorado';
import { figuraFantasma, grabadora } from '../fantasma';
import { crearMando } from '../mando';
import { volumen } from '../sonido';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, sombra } from '../reflejos/motor';
import { fundir } from '../../nucleo/fundir';

// Gran Premio: vueltas en karts contra cinco rivales de máquina. Acelera solo; se dobla con flechas, el dedo o el control.
// Derrapar (mantener Espacio, el botón o A/R1 del control mientras se dobla) hace patinar la cola y carga un mini turbo:
// chispas azules, luego naranjas y al final moradas. Durante el derrape la dirección elige qué tan cerrada es la curva.
// Las cajas de colores dan un objeto (turbo o plátano) y las monedas suben la velocidad máxima.
// La pista sale de una de cuatro trazadas según la semilla: mismo circuito para todos en un mismo desafío.

const ANCHO = 10, ESCALA = 3, VMAX = 25, RADIO_KART = 1.05, MURO = ANCHO / 2 + 5.2, PASO_FISICA = 1 / 60;
const TRAZADAS: { nombre: string; vueltas: number; puntos: [number, number][] }[] = [
  { nombre: 'Circuito del Volcán', vueltas: 3, puntos: [[0, 34], [34, 30], [50, 12], [42, -10], [22, -16], [12, -34], [-18, -38], [-42, -22], [-46, 4], [-30, 24]] },
  { nombre: 'Bahía de las Curvas', vueltas: 3, puntos: [[0, 34], [30, 38], [52, 22], [46, -2], [54, -26], [30, -40], [8, -26], [-14, -40], [-42, -32], [-48, -6], [-30, 12], [-38, 30]] },
  { nombre: 'Valle Serpiente', vueltas: 3, puntos: [[-10, 34], [24, 34], [44, 18], [26, 2], [44, -16], [24, -36], [-10, -32], [-30, -40], [-48, -20], [-32, 0], [-48, 18]] },
  { nombre: 'Gran Vuelta de la Isla', vueltas: 2, puntos: [[0, 44], [32, 46], [56, 34], [62, 10], [44, -2], [60, -20], [52, -44], [24, -50], [10, -30], [-8, -48], [-36, -50], [-58, -34], [-52, -10], [-30, -4], [-44, 14], [-60, 30], [-36, 46]] },
];
const VEHICULOS = ['vehicle-racer', 'vehicle-speedster', 'vehicle-racer-low', 'vehicle-vintage-racer', 'vehicle-drag-racer', 'vehicle-monster-truck'];
/** Mini turbo según cuánto se cargó el derrape: [segundos de carga, segundos de turbo, colores de las chispas]. */
const NIVELES_TURBO: [number, number, string[]][] = [[2.1, 1.5, ['#c46bff', '#ffffff']], [1.2, 1.05, ['#ff9a2e', '#fff07a']], [0.55, 0.6, ['#5ad1ff', '#ffffff']]];
type Objeto = 'turbo' | 'banana' | null;

interface Kart {
  id: number; humano: boolean; x: number; z: number; ang: number; v: number; vl: number; volante: number;
  idx: number; vuelta: number; mitad: boolean; fin: number; px: number; pz: number;
  derrape: boolean; giro: number; carga: number; turbo: number; trompo: number; salto: number; giroVis: number;
  objeto: Objeto; monedas: number; carril: number; destreza: number; usarEn: number; curvaTurbo: boolean;
  grupo: THREE.Group; ruedas: THREE.Object3D[]; piloto: Kenney; sombra: THREE.Mesh;
}

export async function crear(c: Contexto): Promise<Partida> {
  const r = generador(c.semilla), pista = TRAZADAS[Math.floor(r() * TRAZADAS.length)], VUELTAS = pista.vueltas;
  const e = crearEscenario(c.caja, { ancho: 20, alto: 12, centro: [0, 0, 0], inclinacion: 0.4, sinPlaya: true });
  e.camara.fov = 62;
  e.camara.far = 700;
  e.camara.updateProjectionMatrix();
  cielo(e.escena, '#4d8fe0', '#d9f0ff');
  e.escena.fog = new THREE.Fog('#cfe8fb', 140, 460);
  const mando = crearMando(e, c.caja, 'Derrapar', 'Objeto');

  // ── La pista: una curva cerrada muestreada cada ~0,55 m, con su tangente y su normal ──
  const curva = new THREE.CatmullRomCurve3(pista.puntos.map(([x, z]) => new THREE.Vector3(x * ESCALA, 0, z * ESCALA)), true, 'centripetal');
  const largo = curva.getLength(), N = Math.round(largo / 0.55);
  const P = curva.getSpacedPoints(N).slice(0, N), T = P.map((_, i) => new THREE.Vector3().subVectors(P[(i + 1) % N], P[(i + N - 1) % N]).normalize());
  const NOR = T.map((t) => new THREE.Vector3(t.z, 0, -t.x)); // a la izquierda de la marcha
  // Tiempo máximo según el largo; el bono de tiempo se normaliza para que valga lo mismo en todas las pistas
  const LIMITE = Math.round((VUELTAS * largo) / 10 + 20);

  const cinta = (desde: number, hasta: number, y: number, material: THREE.Material, vPorMetro: number, alto = 0) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const p = P[i % N], n = NOR[i % N], v = (i / N) * largo * vPorMetro;
      // Plana (suelo) o de pie (muro): en el muro los dos bordes están en el mismo lugar, uno abajo y otro arriba
      if (alto) pos.push(p.x + n.x * desde, y, p.z + n.z * desde, p.x + n.x * desde, y + alto, p.z + n.z * desde);
      else pos.push(p.x + n.x * desde, y, p.z + n.z * desde, p.x + n.x * hasta, y, p.z + n.z * hasta);
      uv.push(0, v, 1, v);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    e.escena.add(m);
    return m;
  };
  const pintar = (ancho: number, alto: number, f: (g: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas'); cv.width = ancho; cv.height = alto; f(cv.getContext('2d')!);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const asfalto = pintar(64, 128, (g) => {
    g.fillStyle = '#4a4d57'; g.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.07)`; g.fillRect(Math.random() * 64, Math.random() * 128, 2, 2); }
    g.fillStyle = '#f2f2e8'; g.fillRect(30, 0, 4, 60);
  });
  const bordillo = pintar(8, 64, (g) => { g.fillStyle = '#e8443a'; g.fillRect(0, 0, 8, 32); g.fillStyle = '#f7f7f0'; g.fillRect(0, 32, 8, 32); });
  const valla = pintar(8, 64, (g) => { g.fillStyle = '#2f6fd6'; g.fillRect(0, 0, 8, 32); g.fillStyle = '#f7f7f0'; g.fillRect(0, 32, 8, 32); });
  const telaPasto = pasto('#6fbf5e', '#64b055', 2);
  telaPasto.repeat.set(160, 160);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ map: telaPasto }));
  suelo.rotation.x = -Math.PI / 2;
  e.escena.add(suelo);
  cinta(-ANCHO / 2 - 3, ANCHO / 2 + 3, 0.01, new THREE.MeshLambertMaterial({ color: '#d9c48f' }), 0.1); // banquina de arena
  cinta(-ANCHO / 2, ANCHO / 2, 0.03, new THREE.MeshLambertMaterial({ map: asfalto }), 1 / 8);
  cinta(ANCHO / 2, ANCHO / 2 + 0.9, 0.04, new THREE.MeshLambertMaterial({ map: bordillo }), 1 / 2);
  cinta(-ANCHO / 2 - 0.9, -ANCHO / 2, 0.04, new THREE.MeshLambertMaterial({ map: bordillo }), 1 / 2);
  // Vallas a los dos lados: se ve hasta dónde se puede ir (antes el límite era invisible)
  const materialValla = new THREE.MeshLambertMaterial({ map: valla, side: THREE.DoubleSide });
  cinta(MURO, 0, 0, materialValla, 1 / 3, 0.9);
  cinta(-MURO, 0, 0, materialValla, 1 / 3, 0.9);
  // Línea de meta a cuadros y su arco
  const cuadros = pintar(64, 16, (g) => { for (let i = 0; i < 16; i++) for (let k = 0; k < 4; k++) { g.fillStyle = (i + k) % 2 ? '#ffffff' : '#111111'; g.fillRect(i * 4, k * 4, 4, 4); } });
  const meta = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, 1.6), new THREE.MeshLambertMaterial({ map: cuadros }));
  meta.rotation.x = -Math.PI / 2;
  meta.rotation.z = Math.atan2(T[0].x, T[0].z);
  meta.position.set(P[0].x, 0.05, P[0].z);
  const arco = await e.objeto('juguetes', 'gate-finish', 6.5);
  arco.scale.x *= 1.15;
  arco.position.copy(P[0]);
  arco.rotation.y = Math.atan2(T[0].x, T[0].z);
  e.escena.add(meta, arco);

  // ── Adornos: graderías junto a la meta, árboles, carpas y conos, siempre fuera de las vallas ──
  const lejosDePista = (x: number, z: number, d: number) => { for (let i = 0; i < N; i += 6) if (Math.hypot(P[i].x - x, P[i].z - z) < d) return false; return true; };
  const deco = generador('karts-decorado');
  const sueltos = (cuantos: number, cerca: number, alto: [number, number]): Planta[] => {
    const lista: Planta[] = [];
    for (let intento = 0; lista.length < cuantos && intento < cuantos * 30; intento++) {
      const x = (deco() - 0.5) * 140 * ESCALA, z = (deco() - 0.5) * 120 * ESCALA;
      if (lejosDePista(x, z, MURO + cerca)) lista.push({ x, z, alto: alto[0] + deco() * (alto[1] - alto[0]), giro: deco() * 6 });
    }
    return lista;
  };
  const grada = await e.objeto('carreras', 'grandStandCovered', 3.2), tribuna = new THREE.Group(), lado = NOR[0];
  for (let k = -3; k <= 3; k++) {
    const g = grada.clone(), p = P[(N + k * 6) % N];
    g.position.set(p.x + lado.x * (MURO + 4), 0, p.z + lado.z * (MURO + 4));
    g.rotation.y = Math.atan2(-lado.x, -lado.z);
    tribuna.add(g);
  }
  fundir(tribuna);
  e.escena.add(tribuna);
  // Conos por fuera de las curvas, entre la arena y la valla (no estorban: el kart pasa entre la arena y la valla)
  const conos: Planta[] = [];
  for (let i = 0; i < N; i += 30) {
    const curva2 = T[i].angleTo(T[(i + 16) % N]);
    if (curva2 < 0.25) continue;
    const giraIzq = T[i].x * T[(i + 16) % N].z - T[i].z * T[(i + 16) % N].x < 0, s = giraIzq ? -1 : 1;
    conos.push({ x: P[i].x + NOR[i].x * s * (MURO + 0.8), z: P[i].z + NOR[i].z * s * (MURO + 0.8), alto: 0.8, giro: 0 });
  }
  await Promise.all([
    bosque(e.escena, 'naturaleza', 'tree_pineRoundB', sueltos(160, 6, [4, 8])),
    bosque(e.escena, 'naturaleza', 'tree_default', sueltos(90, 6, [4, 6.5])),
    bosque(e.escena, 'naturaleza', 'tree_pineTallA', sueltos(60, 8, [7, 10])),
    bosque(e.escena, 'naturaleza', 'rock_largeC', sueltos(40, 4, [1, 2.6])),
    bosque(e.escena, 'naturaleza', 'plant_bushLarge', sueltos(100, 2, [0.8, 1.4])),
    bosque(e.escena, 'naturaleza', 'flower_redA', sueltos(80, 1, [0.4, 0.7])),
    bosque(e.escena, 'juguetes', 'item-cone', conos),
    bosque(e.escena, 'carreras', 'tent', sueltos(8, 6, [3, 3.5])),
    bosque(e.escena, 'carreras', 'billboard', sueltos(12, 4, [4, 4.5])),
    bosque(e.escena, 'carreras', 'flagCheckers', sueltos(14, 1.5, [3, 3.5])),
  ]);

  const sierra = new THREE.Group();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + deco() * 0.2, alto = 50 + deco() * 70, m = new THREE.Mesh(new THREE.ConeGeometry(alto * 0.9, alto, 6 + Math.floor(deco() * 3)), new THREE.MeshLambertMaterial({ color: deco() < 0.5 ? '#7d9a8f' : '#8ea7b0', flatShading: true }));
    m.position.set(Math.cos(a) * 420, alto / 2 - 4, Math.sin(a) * 420);
    m.rotation.y = deco() * 6;
    sierra.add(m);
  }
  fundir(sierra);
  e.escena.add(sierra);

  // ── Karts: un auto de juguete con el piloto sentado encima ──
  const [modelos, pilotos] = await Promise.all([
    Promise.all(VEHICULOS.map((v) => e.objeto('juguetes', v, 2.5, 'largo'))),
    Promise.all(Array.from({ length: 6 }, (_, i) => e.personaje(i === 0 ? c.aspecto : aspectoAleatorio(generador(`${c.semilla}|piloto${i}`)), 1.5))),
  ]);
  const elegidos = [Math.floor(r() * VEHICULOS.length)];
  while (elegidos.length < 6) { const v = (elegidos[elegidos.length - 1] + 1) % VEHICULOS.length; elegidos.push(v); }
  const karts: Kart[] = pilotos.map((piloto, i) => {
    const grupo = new THREE.Group(), auto = modelos[elegidos[i]].clone();
    auto.rotation.y = Math.PI; // los autos de Kenney miran hacia -z
    grupo.add(auto);
    piloto.grupo.position.set(0, 0.45, -0.15);
    piloto.animar(piloto.grupo.userData.vrm ? 'manejar' : 'sit'); // los avatares anime tienen su propia pose de manejar
    grupo.add(piloto.grupo);
    const s = sombra(1.3);
    s.scale.set(1, 1.7, 1);
    e.escena.add(grupo, s);
    const ruedas: THREE.Object3D[] = [];
    auto.traverse((o) => { if (o.name.startsWith('wheel')) ruedas.push(o); });
    // Parrilla de salida: dos columnas detrás de la meta; tú partes cuarto
    const puesto = [3, 0, 1, 2, 4, 5][i], fila = Math.floor(puesto / 2), col = puesto % 2 ? -1 : 1, k = (N - 14 - fila * 12) % N;
    const x = P[k].x + NOR[k].x * col * 2.2, z = P[k].z + NOR[k].z * col * 2.2;
    return {
      id: i, humano: i === 0, x, z, ang: Math.atan2(T[k].x, T[k].z), v: 0, vl: 0, volante: 0, idx: k, vuelta: -1, mitad: true, fin: 0, px: x, pz: z,
      derrape: false, giro: 0, carga: 0, turbo: 0, trompo: 0, salto: 0, giroVis: 0, objeto: null, monedas: 0,
      // Los rivales ahora son más rápidos: los de adelante igualan tu velocidad y aprovechan las curvas
      carril: (r() - 0.5) * 3, destreza: Math.min(0.99, 0.925 + (c.nivel - 1) * 0.03 + i * 0.011 + r() * 0.025), usarEn: 0, curvaTurbo: false,
      grupo, ruedas, piloto, sombra: s,
    };
  });
  const yo = karts[0];

  // ── Cajas de objetos y monedas sobre la pista ──
  const [caja0, moneda0, platano0] = await Promise.all([e.objeto('juguetes', 'item-box', 1.3), e.objeto('juguetes', 'item-coin-gold', 0.9), e.objeto('juguetes', 'item-banana', 0.9)]);
  interface Cosa { x: number; z: number; malla: THREE.Object3D; vuelve: number; tipo: 'caja' | 'moneda' }
  const cosas: Cosa[] = [];
  const poner = (i: number, lateral: number, tipo: Cosa['tipo']) => {
    i %= N;
    const malla = (tipo === 'caja' ? caja0 : moneda0).clone(), x = P[i].x + NOR[i].x * lateral, z = P[i].z + NOR[i].z * lateral;
    malla.position.set(x, tipo === 'caja' ? 0.5 : 0.4, z);
    e.escena.add(malla);
    cosas.push({ x, z, malla, vuelve: 0, tipo });
  };
  for (const f of [0.15, 0.4, 0.62, 0.85]) for (const l of [-3, -1, 1, 3]) poner(Math.floor(f * N), l, 'caja');
  for (const f of [0.06, 0.22, 0.31, 0.48, 0.55, 0.72, 0.78, 0.93]) { const lat = (r() - 0.5) * 6; for (let k = 0; k < 6; k++) poner(Math.floor(f * N) + k * 7, lat, 'moneda'); }
  const platanos: { x: number; z: number; malla: THREE.Object3D }[] = [];
  const soltarPlatano = (k: Kart) => {
    const malla = platano0.clone(), x = k.x - Math.sin(k.ang) * 2.4, z = k.z - Math.cos(k.ang) * 2.4;
    malla.position.set(x, 0, z);
    e.escena.add(malla);
    platanos.push({ x, z, malla });
  };

  // ── Interfaz: objeto en mano y minimapa (la pista se dibuja una sola vez; en cada cuadro solo los puntos) ──
  const panel = document.createElement('div');
  panel.className = 'kart-objeto';
  c.caja.appendChild(panel);
  const mapa = document.createElement('canvas');
  mapa.className = 'kart-mapa';
  mapa.width = 170; mapa.height = 130;
  c.caja.appendChild(mapa);
  const minX = Math.min(...P.map((p) => p.x)), maxX = Math.max(...P.map((p) => p.x)), minZ = Math.min(...P.map((p) => p.z)), maxZ = Math.max(...P.map((p) => p.z));
  const escala = Math.min(150 / (maxX - minX), 110 / (maxZ - minZ)), aMapa = (x: number, z: number): [number, number] => [10 + (x - minX) * escala, 10 + (z - minZ) * escala];
  const fondoMapa = document.createElement('canvas');
  fondoMapa.width = 170; fondoMapa.height = 130;
  {
    const g = fondoMapa.getContext('2d')!;
    g.strokeStyle = 'rgba(20,32,58,.75)'; g.lineWidth = 9; g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i < N; i += 3) { const [a, b] = aMapa(P[i].x, P[i].z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }
    g.closePath(); g.stroke();
    g.strokeStyle = '#e8e4d8'; g.lineWidth = 3; g.stroke();
  }
  const pintarMapa = () => {
    const g = mapa.getContext('2d')!;
    g.clearRect(0, 0, 170, 130);
    g.drawImage(fondoMapa, 0, 0);
    for (const k of [...karts].reverse()) { const [a, b] = aMapa(k.x, k.z); g.fillStyle = k.humano ? '#ffd23c' : '#ef5565'; g.beginPath(); g.arc(a, b, k.humano ? 5 : 3.5, 0, 6.3); g.fill(); if (k.humano) { g.strokeStyle = '#14203a'; g.lineWidth = 1.5; g.stroke(); } }
  };

  // ── Motor del sonido: un zumbido que sube con la velocidad ──
  let motor: OscillatorNode | null = null, volMotor: GainNode | null = null;
  const encenderMotor = () => {
    const ctx = e.sonido.ctx;
    if (!ctx) return;
    motor = ctx.createOscillator(); volMotor = ctx.createGain();
    const filtro = ctx.createBiquadFilter();
    motor.type = 'sawtooth'; filtro.type = 'lowpass'; filtro.frequency.value = 600; volMotor.gain.value = 0.035 * volumen();
    motor.connect(filtro).connect(volMotor).connect(ctx.destination);
    motor.start();
  };

  // ── Física de un kart ──
  // El kart tiene rumbo (ang), velocidad hacia adelante (v) y deslizamiento de costado (vl). Con agarre normal el
  // deslizamiento se apaga rápido; derrapando el agarre baja y la cola patina, pero de forma suave y controlable.
  const progreso = (k: Kart) => k.vuelta * N + k.idx;
  const buscar = (k: Kart) => {
    let mejor = k.idx, d = Infinity;
    for (let s = -16; s <= 40; s++) { const i = (k.idx + s + N) % N, dd = (P[i].x - k.x) ** 2 + (P[i].z - k.z) ** 2; if (dd < d) { d = dd; mejor = i; } }
    const antes = k.idx;
    k.idx = mejor;
    if (mejor > N * 0.45 && mejor < N * 0.55) k.mitad = true;
    if (antes > N * 0.85 && mejor < N * 0.15 && k.mitad) { k.vuelta++; k.mitad = false; return true; }
    if (antes < N * 0.15 && mejor > N * 0.85 && k.vuelta >= 0) { k.vuelta--; k.mitad = true; } // retrocedió por la meta
    return false;
  };
  const lateral = (k: Kart) => (k.x - P[k.idx].x) * NOR[k.idx].x + (k.z - P[k.idx].z) * NOR[k.idx].z;
  /** Velocidad en el mundo (x, z) a partir de la del kart, y al revés. */
  const velMundo = (k: Kart): [number, number] => { const dx = Math.sin(k.ang), dz = Math.cos(k.ang); return [dx * k.v + dz * k.vl, dz * k.v - dx * k.vl]; };
  const fijarVel = (k: Kart, wx: number, wz: number) => { const dx = Math.sin(k.ang), dz = Math.cos(k.ang); k.v = wx * dx + wz * dz; k.vl = wx * dz - wz * dx; };
  const usarObjeto = (k: Kart, t: number) => {
    if (!k.objeto) return;
    if (k.objeto === 'turbo') { k.turbo = Math.max(k.turbo, t + 1.6); if (k.humano) { e.sonido.tono(300, 0.4, { tipo: 'sawtooth', vol: 0.15, hasta: 900 }); e.temblar(0.25); } }
    else soltarPlatano(k);
    k.objeto = null;
  };
  const soltarDerrape = (k: Kart, t: number) => {
    k.derrape = false;
    const nivel = NIVELES_TURBO.find(([carga]) => k.carga >= carga);
    if (!nivel) return;
    k.turbo = Math.max(k.turbo, t + nivel[1]);
    if (k.humano) { e.sonido.tono(500, 0.3, { tipo: 'square', vol: 0.12, hasta: 1100 }); e.chispas(k.x, 0.6, k.z, nivel[2], 16, 4); }
  };

  let empezado = false, terminado = false, chispaEn = 0, inicio = 0, objetoAntes = false;
  const mover = (k: Kart, t: number, dt: number, giroPedido: number, frena: boolean, derrapa: boolean) => {
    k.px = k.x; k.pz = k.z;
    const lat = lateral(k), enArena = Math.abs(lat) > ANCHO / 2 + 0.6, enPasto = Math.abs(lat) > ANCHO / 2 + 3;
    const conTurbo = t < k.turbo;
    const tope = VMAX * (k.humano ? 1 : k.destreza) * (1 + k.monedas * 0.012) * (conTurbo ? 1.35 : 1) * (enPasto ? 0.45 : enArena ? 0.62 : 1);
    // Volante suave: el teclado no gira de golpe (evita los volantazos que sacaban de la pista)
    k.volante += (giroPedido - k.volante) * Math.min(1, dt * (Math.abs(giroPedido) > Math.abs(k.volante) ? 7 : 10));
    if (t < k.trompo) { k.v *= Math.pow(0.15, dt); k.vl *= Math.pow(0.1, dt); k.ang += 9 * dt; k.derrape = false; }
    else {
      if (frena) k.v = Math.max(-6, k.v - 30 * dt);
      else if (k.v < tope) k.v += (conTurbo ? 30 : 15 * (1 - (k.v / tope) * 0.45)) * dt;
      else k.v = Math.max(tope, k.v - 18 * dt);
      // Derrape: se empieza con el botón y doblando; dura mientras se mantenga el botón
      if (!k.derrape && derrapa && Math.abs(k.volante) > 0.25 && k.v > 10 && !enPasto) { k.derrape = true; k.carga = 0; k.giro = Math.sign(k.volante); k.salto = t + 0.18; }
      if (k.derrape && (!derrapa || k.v < 7)) soltarDerrape(k, t);
      if (k.derrape) k.carga += dt * (Math.abs(k.volante) > 0.2 && Math.sign(k.volante) === k.giro ? 1.25 : 0.8); // apretar hacia la curva carga más rápido
      // Cuánto dobla: crece con la velocidad hasta ~9 m/s y baja un poco a fondo para que no sea nervioso
      const rapidez = limitar(Math.abs(k.v) / 9, 0, 1) * (1 - 0.22 * limitar(k.v / VMAX, 0, 1)) * Math.sign(k.v || 1);
      // Derrapando, el giro siempre va hacia la curva; la dirección solo lo abre (0,35) o lo cierra (1,35)
      const giro = k.derrape ? k.giro * (0.85 + 0.5 * k.volante * k.giro) : k.volante;
      k.ang -= giro * rapidez * (k.derrape ? 2.15 : 2.3) * dt;
      // Agarre: sin derrape el deslizamiento se va en ~0,1 s; derrapando la cola patina hacia afuera, pero poco
      const meta = k.derrape ? k.giro * k.v * 0.07 : 0;
      k.vl += (meta - k.vl) * Math.min(1, dt * (k.derrape ? 3.5 : 11));
    }
    const [wx, wz] = velMundo(k);
    k.x += wx * dt;
    k.z += wz * dt;
    const vuelta = buscar(k);
    // Valla: el kart rebota y se endereza hacia la pista, sin quedar pegado
    const lat2 = lateral(k), limite = MURO - RADIO_KART * 0.8;
    if (Math.abs(lat2) > limite) {
      const s = Math.sign(lat2), n = NOR[k.idx], sobra = Math.abs(lat2) - limite;
      k.x -= n.x * s * sobra; k.z -= n.z * s * sobra;
      const [vx, vz] = velMundo(k), contra = (vx * n.x + vz * n.z) * s; // velocidad hacia la valla
      if (contra > 0) {
        const tx = vx - n.x * s * contra * 1.3, tz = vz - n.z * s * contra * 1.3; // quita lo que va hacia la valla y rebota un poco
        fijarVel(k, tx * 0.9, tz * 0.9);
        // Se endereza un poco hacia donde va la pista
        let dif = Math.atan2(T[k.idx].x, T[k.idx].z) - k.ang;
        while (dif > Math.PI) dif -= Math.PI * 2;
        while (dif < -Math.PI) dif += Math.PI * 2;
        k.ang += dif * Math.min(1, contra * 0.04);
        if (k.derrape) k.derrape = false;
        if (k.humano && contra > 6) { e.sonido.efecto('golpe', 0.35); e.temblar(0.15); }
      }
    }
    return vuelta;
  };

  const terminar = (t: number) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    motor?.stop();
    const orden = [...karts].sort((a, b) => (a.fin && b.fin ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1 : progreso(b) - progreso(a))), puesto = orden.indexOf(yo) + 1;
    const tiempo = yo.fin ? yo.fin - inicio : t, bono = yo.fin ? Math.max(0, Math.round(((LIMITE - tiempo) / LIMITE) * 840)) : 0;
    const base = [1000, 800, 650, 520, 420, 340][puesto - 1];
    if (puesto === 1) yo.piloto.animar('emote-yes');
    c.alTerminar({
      puntaje: base + yo.monedas * 15 + bono,
      lineas: [['Puesto', `${puesto}º de 6`], ['Pista', pista.nombre], ['Tiempo', yo.fin ? `${tiempo.toFixed(1)} s` : 'No terminó'], ['Monedas', String(yo.monedas)], ['Bono de tiempo', String(bono)]],
      detalle: { puesto, seg: Math.round(tiempo * 10) / 10, monedas: yo.monedas, pista: pista.nombre, ruta: ruta.final() },
    });
  };

  /** Hacia dónde dobla la pista más adelante (positivo: a la izquierda) y qué tan cerrado. */
  const curvaAdelante = (k: Kart, desde: number, hasta: number) => {
    const a = T[(k.idx + desde) % N], b = T[(k.idx + hasta) % N];
    return Math.sign(a.x * b.z - a.z * b.x) * a.angleTo(b);
  };
  /** Cuánto debe girar un kart para seguir su carril (lo usan los rivales): toman la curva por dentro. */
  const rumbo = (k: Kart, t: number) => {
    const adelante = Math.floor(16 + Math.max(0, k.v) * 0.8), m = (k.idx + adelante) % N, curvo = curvaAdelante(k, 10, 70);
    const carril = limitar(k.carril * 0.5 + Math.sin(t * 0.3 + k.id) * 0.8 - Math.sign(curvo) * limitar(Math.abs(curvo) * 4, 0, 3), -ANCHO / 2 + 1.3, ANCHO / 2 - 1.3);
    let dif = Math.atan2(P[m].x + NOR[m].x * carril - k.x, P[m].z + NOR[m].z * carril - k.z) - k.ang;
    while (dif > Math.PI) dif -= Math.PI * 2;
    while (dif < -Math.PI) dif += Math.PI * 2;
    return dif;
  };
  // Solo en pruebas: "?piloto=1" maneja solo (para fotos y para probar la pista)
  const automatico = import.meta.env.DEV && new URLSearchParams(location.search).has('piloto');
  const objetivo = new THREE.Vector3(), mira = new THREE.Vector3();
  let angCamara = yo.ang;
  const camara = (dt: number, inmediata = false) => {
    // La cámara sigue el rumbo con un poco de retraso: en el derrape se nota cómo patina la cola
    let dif = yo.ang - angCamara;
    while (dif > Math.PI) dif -= Math.PI * 2;
    while (dif < -Math.PI) dif += Math.PI * 2;
    angCamara += inmediata ? dif : dif * Math.min(1, dt * 6);
    const dx = Math.sin(angCamara), dz = Math.cos(angCamara), atras = 7.5 + Math.max(0, yo.v) * 0.06;
    objetivo.set(yo.x - dx * atras, 3.4, yo.z - dz * atras);
    e.camara.position.lerp(objetivo, inmediata ? 1 : 1 - Math.exp(-12 * dt));
    mira.set(yo.x + dx * 6, 1, yo.z + dz * 6);
    e.camara.lookAt(mira);
    const fov = 62 + (e.reloj() < yo.turbo ? 10 : 0);
    if (Math.abs(e.camara.fov - fov) > 0.1) { e.camara.fov += (fov - e.camara.fov) * Math.min(1, dt * 5); e.camara.updateProjectionMatrix(); }
  };
  /** Distancia de un punto al tramo que recorrió el kart en el paso (para no saltarse monedas a toda velocidad). */
  const cerca = (k: Kart, x: number, z: number) => {
    const sx = k.x - k.px, sz = k.z - k.pz, l2 = sx * sx + sz * sz, u = l2 ? limitar(((x - k.px) * sx + (z - k.pz) * sz) / l2, 0, 1) : 0;
    return Math.hypot(k.px + sx * u - x, k.pz + sz * u - z);
  };

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__karts = () => ({ pista: pista.nombre, N, karts: karts.map((k) => ({ humano: k.humano, vuelta: k.vuelta, idx: k.idx, v: +k.v.toFixed(1), destreza: +k.destreza.toFixed(3), fin: k.fin })) });
  e.hud.tiempo(`Vuelta 1/${VUELTAS}`);
  e.hud.puntos(0);
  camara(0, true);
  // Fantasma del líder (si se juega contra él) y grabación del propio recorrido
  const ruta = grabadora(), lider = c.fantasma ? figuraFantasma(e.escena, c.fantasma, 1.6) : null;

  /** Un paso de la carrera (corto, para que a toda velocidad no se atraviesen karts, vallas ni monedas). */
  const paso = (t: number, dt: number) => {
    // Jugador
    const pidoObjeto = mando.agachado;
    if (pidoObjeto && !objetoAntes) usarObjeto(yo, t);
    objetoAntes = pidoObjeto;
    const giro = automatico ? limitar(-rumbo(yo, t) * 2.2, -1, 1) : mando.x;
    if (mover(yo, t, dt, giro, mando.z > 0.5, mando.pulsada || (automatico && Math.abs(curvaAdelante(yo, 5, 60)) > 0.6)) && yo.vuelta >= 1) {
      if (yo.vuelta >= VUELTAS && !c.libre) { yo.fin = t; e.hud.aviso('¡Meta!', 'oro', 1.5); e.chispas(yo.x, 2, yo.z, ['#ffd23c', '#ffffff', '#ef5565'], 60, 7); terminar(t); return; }
      e.hud.aviso(c.libre ? `Vuelta ${yo.vuelta + 1}` : yo.vuelta === VUELTAS - 1 ? '¡Última vuelta!' : `Vuelta ${yo.vuelta + 1}`, 'oro', 1.2);
      e.sonido.efecto('campana', 0.6);
    }
    // Rivales: siguen la pista por dentro de las curvas, frenan un poco en las cerradas y sacan mini turbos
    for (const k of karts) {
      if (k.humano) continue;
      const dif = rumbo(k, t), curvo = Math.abs(curvaAdelante(k, 4, Math.floor(30 + k.v * 1.2)));
      // Goma elástica: los muy atrasados apuran y los muy adelantados aflojan (pero menos que antes)
      const ventaja = progreso(k) - progreso(yo);
      k.destreza = limitar(k.destreza + (ventaja < -N * 0.2 ? 0.025 : ventaja > N * 0.15 ? -0.02 : 0) * dt, 0.86, 1.03);
      if (k.objeto && t > k.usarEn && (k.objeto === 'turbo' ? curvo < 0.3 : ventaja > 0)) usarObjeto(k, t);
      if (k.fin) { mover(k, t, dt, limitar(-dif * 2.4, -1, 1), k.v > 12, false); continue; } // ya llegó: sigue de paseo
      // En una curva larga aprovechan para cargar un mini turbo y lo sueltan al salir
      if (curvo > 0.9 && k.v > 14) k.curvaTurbo = true;
      else if (curvo < 0.35) k.curvaTurbo = false;
      const frena = curvo > 0.8 && k.v > VMAX * (1.05 - limitar(curvo - 0.8, 0, 1.2) * 0.3);
      if (mover(k, t, dt, limitar(-dif * 2.4, -1, 1), frena, k.curvaTurbo && k.destreza > 0.92) && k.vuelta >= VUELTAS) k.fin = t;
    }
    // Choques entre karts: se empujan y se reparten el golpe según hacia dónde iban
    for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i], b = karts[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= RADIO_KART * 2 || d === 0) continue;
      const nx = dx / d, nz = dz / d, sobra = (RADIO_KART * 2 - d) / 2;
      a.x -= nx * sobra; a.z -= nz * sobra; b.x += nx * sobra; b.z += nz * sobra;
      const [ax, az] = velMundo(a), [bx, bz] = velMundo(b), acerca = (ax - bx) * nx + (az - bz) * nz;
      if (acerca > 0) {
        const imp = acerca * 0.65; // medio elástico
        fijarVel(a, ax - nx * imp, az - nz * imp);
        fijarVel(b, bx + nx * imp, bz + nz * imp);
        if ((a.humano || b.humano) && acerca > 3) { e.sonido.efecto('golpe', 0.4); e.temblar(0.12); }
      }
    }
    // Cajas, monedas y plátanos (se revisa todo el tramo recorrido, no solo dónde quedó el kart)
    for (const o of cosas) {
      if (t < o.vuelve) continue;
      for (const k of karts) {
        if (cerca(k, o.x, o.z) > 1.5) continue;
        if (o.tipo === 'caja') {
          o.vuelve = t + 4;
          if (!k.objeto) { k.objeto = r() < (k.humano && progreso(k) < Math.max(...karts.map(progreso)) - 40 ? 0.75 : 0.5) ? 'turbo' : 'banana'; k.usarEn = t + 1 + r() * 4; }
          if (k.humano) { e.sonido.efecto('click', 0.6); e.chispas(o.x, 1, o.z, ['#5ad1ff', '#ff7ae0', '#ffd23c'], 12, 4); }
        } else {
          o.vuelve = t + 6;
          k.monedas = Math.min(10, k.monedas + 1);
          if (k.humano) { e.sonido.tono(988, 0.08, { tipo: 'square', vol: 0.1 }); e.sonido.tono(1319, 0.12, { tipo: 'square', vol: 0.1, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.07 }); }
        }
        break;
      }
    }
    for (let i = platanos.length - 1; i >= 0; i--) {
      const p = platanos[i], k = karts.find((k) => cerca(k, p.x, p.z) < 1.2);
      if (!k) continue;
      k.trompo = t + 1.1; k.derrape = false;
      e.escena.remove(p.malla);
      platanos.splice(i, 1);
      if (k.humano) { e.sonido.mal(); e.temblar(0.35); e.hud.aviso('¡Plátano!', 'mal', 0.8); }
    }
  };

  e.alCuadro((t, dt) => {
    if (empezado && !terminado) {
      ruta.anotar(t, yo.x, 0.3, yo.z); lider?.mover(t);
      if (!motor) { encenderMotor(); inicio = t; }
      const pasos = Math.max(1, Math.ceil(dt / PASO_FISICA));
      for (let s = 0; s < pasos && !terminado; s++) paso(t - dt + (dt * (s + 1)) / pasos, dt / pasos);
      if (terminado) return;
      if (t >= LIMITE && !c.libre) return terminar(t); // modo libre: vueltas sin fin y sin reloj
      // Marcador
      const orden = [...karts].sort((a, b) => progreso(b) - progreso(a)), puesto = orden.indexOf(yo) + 1;
      e.hud.tiempo(c.libre ? `Vuelta ${Math.max(1, yo.vuelta + 1)}` : `Vuelta ${Math.min(VUELTAS, Math.max(1, yo.vuelta + 1))}/${VUELTAS}`);
      e.hud.extra(`${puesto}º de 6 · 🪙 ${yo.monedas}`);
      e.hud.puntos([1000, 800, 650, 520, 420, 340][puesto - 1] + yo.monedas * 15);
      if (motor && volMotor) motor.frequency.value = 60 + Math.max(0, yo.v) * 7 + (t < yo.turbo ? 60 : 0);
    }
    // Cajas y monedas: giran y flotan (siempre visibles salvo mientras reaparecen)
    for (const o of cosas) {
      o.malla.visible = t >= o.vuelve;
      if (!o.malla.visible) continue;
      o.malla.rotation.y = t * 2;
      o.malla.position.y = (o.tipo === 'caja' ? 0.5 : 0.4) + Math.sin(t * 3 + o.x) * 0.15;
    }
    // Dibujo de los karts
    for (const k of karts) {
      k.giroVis += ((k.derrape ? k.giro * 0.32 : 0) - k.giroVis) * Math.min(1, dt * 8);
      const brinco = t < k.salto ? Math.sin(((k.salto - t) / 0.18) * Math.PI) * 0.25 : 0;
      k.grupo.position.set(k.x, brinco + Math.abs(Math.sin(t * 20 + k.id)) * 0.04 * Math.min(1, k.v / 10), k.z);
      k.grupo.rotation.y = k.ang + k.giroVis;
      k.grupo.rotation.z = -k.giroVis * 0.18;
      k.sombra.position.set(k.x, 0.06, k.z);
      k.sombra.rotation.z = -k.ang;
      for (const w of k.ruedas) w.rotation.x += k.v * dt * 2;
      // Chispas del derrape: azules, naranjas y moradas según la carga
      const nivel = k.derrape ? NIVELES_TURBO.find(([carga]) => k.carga >= carga) : undefined;
      if (nivel && t > chispaEn) {
        const atras = 1.1, cx = k.x - Math.sin(k.ang) * atras, cz = k.z - Math.cos(k.ang) * atras;
        e.chispas(cx, 0.3, cz, nivel[2], 3, 2);
        if (k.humano) chispaEn = t + 0.06;
      }
      if (t < k.turbo && k.humano && t > chispaEn) { e.chispas(k.x - Math.sin(k.ang) * 1.4, 0.5, k.z - Math.cos(k.ang) * 1.4, ['#ff6a1e', '#ffd23c'], 3, 1.5); chispaEn = t + 0.05; }
    }
    for (const p of platanos) p.malla.rotation.y = t;
    panel.textContent = yo.objeto === 'turbo' ? '🔥' : yo.objeto === 'banana' ? '🍌' : '';
    panel.classList.toggle('lleno', !!yo.objeto);
    pintarMapa();
    camara(dt);
  });

  return {
    empezar() { e.empezar(); empezado = true; e.hud.aviso('¡Ya!', 'oro', 0.8); },
    destruir() { try { motor?.stop(); } catch { /* ya estaba detenido */ } e.destruir(); },
  };
}
