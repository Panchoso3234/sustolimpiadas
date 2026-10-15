import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { aspectoAleatorio } from '../../personaje/catalogo';
import type { Kenney } from '../../personaje/kenney';
import { bosque, cielo, pasto, type Planta } from '../decorado';
import { crearMando } from '../mando';
import { volumen } from '../sonido';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, sombra } from '../reflejos/motor';
import { fundir } from '../../nucleo/fundir';

// Gran Premio: tres vueltas en karts contra cinco rivales de máquina. Acelera solo; se dobla con flechas o el dedo.
// Derrapar (mantener Espacio o el botón mientras se dobla) carga un turbo: chispas azules, luego naranjas.
// Las cajas de colores dan un objeto (turbo o plátano) y las monedas suben la velocidad máxima.
// La pista sale de una de tres trazadas según la semilla: mismo circuito para todos en un mismo desafío.

const ANCHO = 10, N = 1100, ESCALA = 2.1, VUELTAS = 3, LIMITE = 210, VMAX = 25, RADIO_KART = 1.05;
const TRAZADAS: [string, [number, number][]][] = [
  ['Circuito del Volcán', [[0, 34], [34, 30], [50, 12], [42, -10], [22, -16], [12, -34], [-18, -38], [-42, -22], [-46, 4], [-30, 24]]],
  ['Bahía de las Curvas', [[0, 34], [30, 38], [52, 22], [46, -2], [54, -26], [30, -40], [8, -26], [-14, -40], [-42, -32], [-48, -6], [-30, 12], [-38, 30]]],
  ['Valle Serpiente', [[-10, 34], [24, 34], [44, 18], [26, 2], [44, -16], [24, -36], [-10, -32], [-30, -40], [-48, -20], [-32, 0], [-48, 18]]],
];
const VEHICULOS = ['vehicle-racer', 'vehicle-speedster', 'vehicle-racer-low', 'vehicle-vintage-racer', 'vehicle-drag-racer', 'vehicle-monster-truck'];
type Objeto = 'turbo' | 'banana' | null;

interface Kart {
  id: number; humano: boolean; x: number; z: number; ang: number; v: number; giro: number;
  idx: number; vuelta: number; mitad: boolean; fin: number;
  derrape: boolean; carga: number; turbo: number; trompo: number; objeto: Objeto; monedas: number;
  carril: number; destreza: number; usarEn: number;
  grupo: THREE.Group; ruedas: THREE.Object3D[]; piloto: Kenney; sombra: THREE.Mesh;
}

export async function crear(c: Contexto): Promise<Partida> {
  const r = generador(c.semilla), [nombrePista, puntos] = TRAZADAS[Math.floor(r() * TRAZADAS.length)];
  const e = crearEscenario(c.caja, { ancho: 20, alto: 12, centro: [0, 0, 0], inclinacion: 0.4, sinPlaya: true });
  e.camara.fov = 62;
  e.camara.far = 600;
  e.camara.updateProjectionMatrix();
  cielo(e.escena, '#4d8fe0', '#d9f0ff');
  e.escena.fog = new THREE.Fog('#cfe8fb', 120, 400);
  const mando = crearMando(e, c.caja, 'Derrapar', 'Objeto');

  // ── La pista: una curva cerrada muestreada en N puntos, con su tangente y su normal ──
  const curva = new THREE.CatmullRomCurve3(puntos.map(([x, z]) => new THREE.Vector3(x * ESCALA, 0, z * ESCALA)), true, 'centripetal');
  const P = curva.getSpacedPoints(N).slice(0, N), T = P.map((_, i) => new THREE.Vector3().subVectors(P[(i + 1) % N], P[(i + N - 1) % N]).normalize());
  const NOR = T.map((t) => new THREE.Vector3(t.z, 0, -t.x)); // a la izquierda de la marcha
  const largo = curva.getLength();

  const cinta = (desde: number, hasta: number, y: number, material: THREE.Material, vPorMetro: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const p = P[i % N], n = NOR[i % N], v = (i / N) * largo * vPorMetro;
      pos.push(p.x + n.x * desde, y, p.z + n.z * desde, p.x + n.x * hasta, y, p.z + n.z * hasta);
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
  const telaPasto = pasto('#6fbf5e', '#64b055', 2);
  telaPasto.repeat.set(140, 140);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshLambertMaterial({ map: telaPasto }));
  suelo.rotation.x = -Math.PI / 2;
  e.escena.add(suelo);
  cinta(-ANCHO / 2 - 3, ANCHO / 2 + 3, 0.01, new THREE.MeshLambertMaterial({ color: '#d9c48f' }), 0.1); // banquina de arena
  cinta(-ANCHO / 2, ANCHO / 2, 0.03, new THREE.MeshLambertMaterial({ map: asfalto }), 1 / 8);
  cinta(ANCHO / 2, ANCHO / 2 + 0.9, 0.04, new THREE.MeshLambertMaterial({ map: bordillo }), 1 / 2);
  cinta(-ANCHO / 2 - 0.9, -ANCHO / 2, 0.04, new THREE.MeshLambertMaterial({ map: bordillo }), 1 / 2);
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

  // ── Adornos: graderías junto a la meta, árboles, carpas y conos, siempre lejos del asfalto ──
  const lejosDePista = (x: number, z: number, d: number) => { for (let i = 0; i < N; i += 4) if (Math.hypot(P[i].x - x, P[i].z - z) < d) return false; return true; };
  const deco = generador('karts-decorado');
  const sueltos = (cuantos: number, cerca: number, alto: [number, number]): Planta[] => {
    const lista: Planta[] = [];
    for (let intento = 0; lista.length < cuantos && intento < cuantos * 30; intento++) {
      const x = (deco() - 0.5) * 170 * ESCALA, z = (deco() - 0.5) * 140 * ESCALA;
      if (lejosDePista(x, z, ANCHO / 2 + cerca)) lista.push({ x, z, alto: alto[0] + deco() * (alto[1] - alto[0]), giro: deco() * 6 });
    }
    return lista;
  };
  const grada = await e.objeto('carreras', 'grandStandCovered', 3.2), tribuna = new THREE.Group(), lado = NOR[0];
  for (let k = -3; k <= 3; k++) {
    const g = grada.clone(), p = P[(N + k * 4) % N];
    g.position.set(p.x + lado.x * (ANCHO / 2 + 6), 0, p.z + lado.z * (ANCHO / 2 + 6));
    g.rotation.y = Math.atan2(-lado.x, -lado.z);
    tribuna.add(g);
  }
  fundir(tribuna);
  e.escena.add(tribuna);
  const conos: Planta[] = [];
  for (let i = 0; i < N; i += 22) {
    const curva2 = T[i].angleTo(T[(i + 12) % N]);
    if (curva2 < 0.25) continue;
    const giraIzq = T[i].x * T[(i + 12) % N].z - T[i].z * T[(i + 12) % N].x < 0, s = giraIzq ? -1 : 1; // conos por fuera de la curva
    conos.push({ x: P[i].x + NOR[i].x * s * (ANCHO / 2 + 2), z: P[i].z + NOR[i].z * s * (ANCHO / 2 + 2), alto: 0.8, giro: 0 });
  }
  await Promise.all([
    bosque(e.escena, 'naturaleza', 'tree_pineRoundB', sueltos(110, 7, [4, 8])),
    bosque(e.escena, 'naturaleza', 'tree_default', sueltos(60, 7, [4, 6.5])),
    bosque(e.escena, 'naturaleza', 'tree_pineTallA', sueltos(40, 9, [7, 10])),
    bosque(e.escena, 'naturaleza', 'rock_largeC', sueltos(30, 6, [1, 2.6])),
    bosque(e.escena, 'naturaleza', 'plant_bushLarge', sueltos(70, 5, [0.8, 1.4])),
    bosque(e.escena, 'naturaleza', 'flower_redA', sueltos(60, 3, [0.4, 0.7])),
    bosque(e.escena, 'juguetes', 'item-cone', conos),
    bosque(e.escena, 'carreras', 'tent', sueltos(6, 8, [3, 3.5])),
    bosque(e.escena, 'carreras', 'billboard', sueltos(8, 7, [4, 4.5])),
    bosque(e.escena, 'carreras', 'flagCheckers', sueltos(10, 3.5, [3, 3.5])),
  ]);

  const sierra = new THREE.Group();
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + deco() * 0.2, alto = 40 + deco() * 60, m = new THREE.Mesh(new THREE.ConeGeometry(alto * 0.9, alto, 6 + Math.floor(deco() * 3)), new THREE.MeshLambertMaterial({ color: deco() < 0.5 ? '#7d9a8f' : '#8ea7b0', flatShading: true }));
    m.position.set(Math.cos(a) * 330, alto / 2 - 4, Math.sin(a) * 330);
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
    piloto.animar('sit');
    grupo.add(piloto.grupo);
    const s = sombra(1.3);
    s.scale.set(1, 1.7, 1);
    e.escena.add(grupo, s);
    const ruedas: THREE.Object3D[] = [];
    auto.traverse((o) => { if (o.name.startsWith('wheel')) ruedas.push(o); });
    // Parrilla de salida: dos columnas detrás de la meta; tú partes cuarto
    const puesto = [3, 0, 1, 2, 4, 5][i], fila = Math.floor(puesto / 2), col = puesto % 2 ? -1 : 1, k = (N - 8 - fila * 7) % N;
    const x = P[k].x + NOR[k].x * col * 2.2, z = P[k].z + NOR[k].z * col * 2.2;
    return {
      id: i, humano: i === 0, x, z, ang: Math.atan2(T[k].x, T[k].z), v: 0, giro: 0, idx: k, vuelta: -1, mitad: true, fin: 0,
      derrape: false, carga: 0, turbo: 0, trompo: 0, objeto: null, monedas: 0,
      carril: (r() - 0.5) * 4.5, destreza: 0.86 + (c.nivel - 1) * 0.035 + i * 0.012 + r() * 0.03, usarEn: 0,
      grupo, ruedas, piloto, sombra: s,
    };
  });
  const yo = karts[0];

  // ── Cajas de objetos y monedas sobre la pista ──
  const [caja0, moneda0, platano0] = await Promise.all([e.objeto('juguetes', 'item-box', 1.3), e.objeto('juguetes', 'item-coin-gold', 0.9), e.objeto('juguetes', 'item-banana', 0.9)]);
  interface Cosa { x: number; z: number; malla: THREE.Object3D; vuelve: number; tipo: 'caja' | 'moneda' }
  const cosas: Cosa[] = [];
  const poner = (i: number, lateral: number, tipo: Cosa['tipo']) => {
    const malla = (tipo === 'caja' ? caja0 : moneda0).clone(), x = P[i].x + NOR[i].x * lateral, z = P[i].z + NOR[i].z * lateral;
    malla.position.set(x, tipo === 'caja' ? 0.5 : 0.4, z);
    e.escena.add(malla);
    cosas.push({ x, z, malla, vuelve: 0, tipo });
  };
  for (const f of [0.18, 0.52, 0.8]) for (const l of [-3, -1, 1, 3]) poner(Math.floor(f * N), l, 'caja');
  for (const f of [0.08, 0.33, 0.44, 0.66, 0.9]) { const lat = (r() - 0.5) * 5; for (let k = 0; k < 6; k++) poner(Math.floor(f * N) + k * 5, lat, 'moneda'); }
  const platanos: { x: number; z: number; malla: THREE.Object3D }[] = [];
  const soltarPlatano = (k: Kart) => {
    const malla = platano0.clone(), x = k.x - Math.sin(k.ang) * 2.4, z = k.z - Math.cos(k.ang) * 2.4;
    malla.position.set(x, 0, z);
    e.escena.add(malla);
    platanos.push({ x, z, malla });
  };

  // ── Interfaz: objeto en mano y minimapa ──
  const panel = document.createElement('div');
  panel.className = 'kart-objeto';
  c.caja.appendChild(panel);
  const mapa = document.createElement('canvas');
  mapa.className = 'kart-mapa';
  mapa.width = 170; mapa.height = 130;
  c.caja.appendChild(mapa);
  const minX = Math.min(...P.map((p) => p.x)), maxX = Math.max(...P.map((p) => p.x)), minZ = Math.min(...P.map((p) => p.z)), maxZ = Math.max(...P.map((p) => p.z));
  const escala = Math.min(150 / (maxX - minX), 110 / (maxZ - minZ)), aMapa = (x: number, z: number): [number, number] => [10 + (x - minX) * escala, 10 + (z - minZ) * escala];
  const pintarMapa = () => {
    const g = mapa.getContext('2d')!;
    g.clearRect(0, 0, 170, 130);
    g.strokeStyle = 'rgba(20,32,58,.75)'; g.lineWidth = 9; g.lineJoin = 'round'; g.beginPath();
    P.forEach((p, i) => { const [a, b] = aMapa(p.x, p.z); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
    g.closePath(); g.stroke();
    g.strokeStyle = '#e8e4d8'; g.lineWidth = 3; g.stroke();
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
  const progreso = (k: Kart) => k.vuelta * N + k.idx;
  const buscar = (k: Kart) => {
    let mejor = k.idx, d = Infinity;
    for (let s = -12; s <= 30; s++) { const i = (k.idx + s + N) % N, dd = (P[i].x - k.x) ** 2 + (P[i].z - k.z) ** 2; if (dd < d) { d = dd; mejor = i; } }
    const antes = k.idx;
    k.idx = mejor;
    if (mejor > N * 0.45 && mejor < N * 0.55) k.mitad = true;
    if (antes > N * 0.85 && mejor < N * 0.15 && k.mitad) { k.vuelta++; k.mitad = false; return true; }
    if (antes < N * 0.15 && mejor > N * 0.85 && k.vuelta >= 0) { k.vuelta--; k.mitad = true; } // retrocedió por la meta
    return false;
  };
  const lateral = (k: Kart) => (k.x - P[k.idx].x) * NOR[k.idx].x + (k.z - P[k.idx].z) * NOR[k.idx].z;
  const usarObjeto = (k: Kart, t: number) => {
    if (!k.objeto) return;
    if (k.objeto === 'turbo') { k.turbo = t + 1.5; if (k.humano) { e.sonido.tono(300, 0.4, { tipo: 'sawtooth', vol: 0.15, hasta: 900 }); e.temblar(0.25); } }
    else soltarPlatano(k);
    k.objeto = null;
  };

  let empezado = false, terminado = false, chispaEn = 0, inicio = 0, objetoAntes = false;
  const mover = (k: Kart, t: number, dt: number, giroPedido: number, frena: boolean, derrapa: boolean) => {
    const fuera = Math.abs(lateral(k)) > ANCHO / 2 + 0.6;
    const tope = VMAX * (k.humano ? 1 : k.destreza) * (1 + k.monedas * 0.012) * (t < k.turbo ? 1.4 : 1) * (fuera ? 0.55 : 1);
    if (t < k.trompo) { k.v *= Math.pow(0.15, dt); k.ang += 11 * dt; }
    else {
      if (frena) k.v = Math.max(-6, k.v - 34 * dt);
      else k.v += (k.v < tope ? 16 : -22) * dt;
      // Derrape: dobla más y carga turbo mientras se mantiene
      const derrapando = derrapa && Math.abs(giroPedido) > 0.3 && k.v > 12;
      if (derrapando && !k.derrape) { k.derrape = true; k.carga = 0; k.giro = Math.sign(giroPedido); }
      if (k.derrape && !derrapando) {
        k.derrape = false;
        const extra = k.carga > 1.3 ? 1.1 : k.carga > 0.6 ? 0.55 : 0;
        if (extra) { k.turbo = Math.max(k.turbo, t + extra); if (k.humano) { e.sonido.tono(500, 0.3, { tipo: 'square', vol: 0.12, hasta: 1100 }); e.chispas(k.x, 0.6, k.z, ['#ffb02e', '#fff07a'], 14, 4); } }
      }
      if (k.derrape) k.carga += dt;
      const manejo = limitar(k.v / 9, -1, 1) * (k.derrape ? 2.6 + giroPedido * k.giro * 0.9 : 2.1);
      k.ang -= (k.derrape ? k.giro * 0.55 + giroPedido * 0.45 : giroPedido) * manejo * dt;
    }
    const dx = Math.sin(k.ang), dz = Math.cos(k.ang), resbala = k.derrape ? k.giro * k.v * 0.12 : 0;
    k.x += (dx * k.v + dz * resbala) * dt;
    k.z += (dz * k.v - dx * resbala) * dt;
    // Muro invisible lejos del asfalto: no hay atajos por el pasto
    const lat = lateral(k);
    if (Math.abs(lat) > ANCHO / 2 + 5) { const s = Math.sign(lat) * (Math.abs(lat) - ANCHO / 2 - 5); k.x -= NOR[k.idx].x * s; k.z -= NOR[k.idx].z * s; k.v *= 0.92; if (k.humano && k.v > 10) e.temblar(0.15); }
    return buscar(k);
  };

  const terminar = (t: number) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    motor?.stop();
    const orden = [...karts].sort((a, b) => (a.fin && b.fin ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1 : progreso(b) - progreso(a))), puesto = orden.indexOf(yo) + 1;
    const tiempo = yo.fin ? yo.fin - inicio : t, bono = yo.fin ? Math.max(0, Math.round((LIMITE - tiempo) * 4)) : 0;
    const base = [1000, 800, 650, 520, 420, 340][puesto - 1];
    if (puesto === 1) yo.piloto.animar('emote-yes');
    c.alTerminar({
      puntaje: base + yo.monedas * 15 + bono,
      lineas: [['Puesto', `${puesto}º de 6`], ['Pista', nombrePista], ['Tiempo', yo.fin ? `${tiempo.toFixed(1)} s` : 'No terminó'], ['Monedas', String(yo.monedas)], ['Bono de tiempo', String(bono)]],
      detalle: { puesto, seg: Math.round(tiempo * 10) / 10, monedas: yo.monedas, pista: nombrePista },
    });
  };

  /** Cuánto debe girar un kart para seguir su carril (lo usan los rivales). */
  const rumbo = (k: Kart, t: number) => {
    const adelante = Math.floor(10 + Math.max(0, k.v) * 0.45), m = (k.idx + adelante) % N, carril = k.carril + Math.sin(t * 0.3 + k.id) * 1.2;
    let dif = Math.atan2(P[m].x + NOR[m].x * carril - k.x, P[m].z + NOR[m].z * carril - k.z) - k.ang;
    while (dif > Math.PI) dif -= Math.PI * 2;
    while (dif < -Math.PI) dif += Math.PI * 2;
    return dif;
  };
  // Solo en pruebas: "?piloto=1" maneja solo (para fotos y para probar la pista)
  const automatico = import.meta.env.DEV && new URLSearchParams(location.search).has('piloto');
  const objetivo = new THREE.Vector3(), mira = new THREE.Vector3();
  const camara = (dt: number, inmediata = false) => {
    const dx = Math.sin(yo.ang), dz = Math.cos(yo.ang), atras = 7.5 + Math.max(0, yo.v) * 0.05;
    objetivo.set(yo.x - dx * atras, 3.4, yo.z - dz * atras);
    e.camara.position.lerp(objetivo, inmediata ? 1 : 1 - Math.exp(-11 * dt));
    mira.set(yo.x + dx * 5, 1, yo.z + dz * 5);
    e.camara.lookAt(mira);
    const fov = 62 + (e.reloj() < yo.turbo ? 10 : 0);
    if (Math.abs(e.camara.fov - fov) > 0.1) { e.camara.fov += (fov - e.camara.fov) * Math.min(1, dt * 5); e.camara.updateProjectionMatrix(); }
  };

  e.hud.tiempo(`Vuelta 1/${VUELTAS}`);
  e.hud.puntos(0);
  camara(0, true);
  e.alCuadro((t, dt) => {
    if (empezado && !terminado) {
      if (!motor) { encenderMotor(); inicio = t; }
      // Jugador
      const pidoObjeto = mando.agachado;
      if (pidoObjeto && !objetoAntes) usarObjeto(yo, t);
      objetoAntes = pidoObjeto;
      const giro = automatico ? limitar(-rumbo(yo, t) * 2.2, -1, 1) : mando.x;
      if (mover(yo, t, dt, giro, mando.z > 0.5, mando.pulsada || (automatico && Math.abs(giro) > 0.5)) && yo.vuelta >= 1) {
        if (yo.vuelta >= VUELTAS) { yo.fin = t; e.hud.aviso('¡Meta!', 'oro', 1.5); e.chispas(yo.x, 2, yo.z, ['#ffd23c', '#ffffff', '#ef5565'], 60, 7); return terminar(t); }
        e.hud.aviso(yo.vuelta === VUELTAS - 1 ? '¡Última vuelta!' : `Vuelta ${yo.vuelta + 1}`, 'oro', 1.2);
        e.sonido.efecto('campana', 0.6);
      }
      // Rivales: siguen la pista con su carril, y usan sus objetos
      for (const k of karts) {
        if (k.humano) continue;
        const dif = rumbo(k, t);
        // Goma elástica: los muy atrasados apuran y los muy adelantados aflojan
        const ventaja = progreso(k) - progreso(yo);
        k.destreza = limitar(k.destreza + (ventaja < -N * 0.25 ? 0.02 : ventaja > N * 0.25 ? -0.02 : 0) * dt, 0.78, 1.02);
        if (k.objeto && t > k.usarEn && (k.objeto === 'turbo' || ventaja > 0)) usarObjeto(k, t);
        if (k.fin) { k.v *= 0.98; continue; }
        if (mover(k, t, dt, limitar(-dif * 2.2, -1, 1), false, false) && k.vuelta >= VUELTAS) k.fin = t;
      }
      // Choques entre karts
      for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) {
        const a = karts[i], b = karts[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= RADIO_KART * 2 || d === 0) continue;
        const nx = dx / d, nz = dz / d, sobra = (RADIO_KART * 2 - d) / 2;
        a.x -= nx * sobra; a.z -= nz * sobra; b.x += nx * sobra; b.z += nz * sobra;
        a.v *= 0.97; b.v *= 0.97;
        if ((a.humano || b.humano) && sobra > 0.15) { e.sonido.efecto('golpe', 0.4); e.temblar(0.12); }
      }
      // Cajas, monedas y plátanos
      for (const o of cosas) {
        o.malla.visible = t >= o.vuelve;
        if (!o.malla.visible) continue;
        o.malla.rotation.y = t * 2;
        o.malla.position.y = (o.tipo === 'caja' ? 0.5 : 0.4) + Math.sin(t * 3 + o.x) * 0.15;
        for (const k of karts) {
          if (Math.hypot(k.x - o.x, k.z - o.z) > 1.4) continue;
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
        const p = platanos[i], k = karts.find((k) => Math.hypot(k.x - p.x, k.z - p.z) < 1.2);
        if (!k) continue;
        k.trompo = t + 1.1; k.derrape = false;
        e.escena.remove(p.malla);
        platanos.splice(i, 1);
        if (k.humano) { e.sonido.mal(); e.temblar(0.35); e.hud.aviso('¡Plátano!', 'mal', 0.8); }
      }
      if (t >= LIMITE) return terminar(t);
      // Marcador
      const orden = [...karts].sort((a, b) => progreso(b) - progreso(a)), puesto = orden.indexOf(yo) + 1;
      e.hud.tiempo(`Vuelta ${Math.min(VUELTAS, Math.max(1, yo.vuelta + 1))}/${VUELTAS}`);
      e.hud.extra(`${puesto}º de 6 · 🪙 ${yo.monedas}`);
      e.hud.puntos([1000, 800, 650, 520, 420, 340][puesto - 1] + yo.monedas * 15);
      if (motor && volMotor) motor.frequency.value = 60 + Math.max(0, yo.v) * 7 + (t < yo.turbo ? 60 : 0);
    }
    // Dibujo de los karts
    for (const k of karts) {
      k.grupo.position.set(k.x, Math.abs(Math.sin(t * 20 + k.id)) * 0.04 * Math.min(1, k.v / 10), k.z);
      k.grupo.rotation.y = k.ang + (k.derrape ? k.giro * 0.35 : 0);
      k.grupo.rotation.z = k.derrape ? -k.giro * 0.06 : 0;
      k.sombra.position.set(k.x, 0.06, k.z);
      k.sombra.rotation.z = -k.ang;
      for (const w of k.ruedas) w.rotation.x += k.v * dt * 2;
      // Chispas del derrape: azules y luego naranjas
      if (k.derrape && k.carga > 0.6 && t > chispaEn) {
        const atras = 1.1, cx = k.x - Math.sin(k.ang) * atras, cz = k.z - Math.cos(k.ang) * atras;
        e.chispas(cx, 0.3, cz, k.carga > 1.3 ? ['#ff9a2e', '#fff07a'] : ['#5ad1ff', '#ffffff'], 3, 2);
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
