import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { halo, ladrillo, nocheEmbrujada } from '../decorado';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario, mmss, sombra } from '../reflejos/motor';

// Laberinto Embrujado: un laberinto de noche, con tu linterna como única luz (alumbra hacia donde caminas). Junta las
// velas para abrir la reja de salida y pasar al piso siguiente (más grande, con más fantasmas y otro estilo: cripta,
// biblioteca o jardín de calabazas). La linterna se gasta: las pilas la recargan. Un toque de Espacio lanza un destello
// corto; manteniéndolo, uno cargado que llega más lejos y espanta hasta a la Dama de Blanco. Los destellos solo afectan
// a los fantasmas a la vista. Hay fantasmas errantes, cazadores, atraviesamuros y chillones; objetos (reloj, botas,
// amuleto, llave y mapa), telarañas, tablas que crujen y puertas secretas. Si un fantasma te toca pierdes una vida.
// Los laberintos y el andar de los fantasmas salen de la semilla: lo mismo para todos en un mismo desafío.

// Versión 2 (26-10): nadie pasaba del piso 2 (poco tiempo, todas las velas obligatorias y un Cazador que no soltaba).
// Ahora: 3 minutos más 45 s por piso superado, la reja se abre con el 75 % de las velas, se puede pasar rozando a un
// fantasma pegado a la pared, la pila dura más y espantar muchos fantasmas en un mismo piso da cada vez menos.
const DURA = 180, EXTRA_PISO = 45, VIDAS = 3, T = 2.4, VEL = 4.3, RADIO = 0.42, ALTO_MURO = 1.7, CARGA = 0.6;
/** Velas que abren la reja (fracción del total), con y sin la llave dorada. */
const PARA_ABRIR = 0.75, PARA_ABRIR_LLAVE = 0.5, TODAS = 150, TOQUE = 0.7, ATRAPA = 0.85, PILA_DURA = 110;
type Especie = 'errante' | 'cazador' | 'muros' | 'chillon' | 'dama';
const ESPECIES: Record<Especie, { color: string; brillo: string; vel: number; olfato: number; nombre: string; puntos: number }> = {
  errante: { color: '#eef2ff', brillo: '#8890b8', vel: 1, olfato: 5, nombre: 'Errante', puntos: 100 },
  cazador: { color: '#ffd0d0', brillo: '#c04848', vel: 1.08, olfato: 8, nombre: 'Cazador', puntos: 150 },
  muros: { color: '#c8ffd8', brillo: '#3a9a5a', vel: 0.55, olfato: 9, nombre: 'Atraviesamuros', puntos: 150 },
  chillon: { color: '#fff4b0', brillo: '#b0a040', vel: 1, olfato: 7, nombre: 'Chillón', puntos: 150 },
  dama: { color: '#ffffff', brillo: '#d0d8ff', vel: 0.92, olfato: 14, nombre: 'Dama de Blanco', puntos: 400 },
};
type Objeto = 'reloj' | 'botas' | 'amuleto' | 'llave' | 'mapa';
const OBJETOS: Record<Objeto, { color: string; nombre: string }> = {
  reloj: { color: '#ffd23c', nombre: 'Reloj de arena: +15 s' }, botas: { color: '#ff7ab8', nombre: 'Botas: más rápido' }, amuleto: { color: '#5ad1ff', nombre: 'Amuleto: aguanta un toque' },
  llave: { color: '#ffb02e', nombre: 'Llave dorada: la reja se abre con la mitad de las velas' }, mapa: { color: '#b0ff7a', nombre: 'Mapa: ves todo el piso' },
};
/** El estilo de cada piso: muro, tapa del muro, piso y color de la neblina. */
const ESTILOS = [
  { nombre: 'Cripta', muro: ['#5d5a70', '#2b2838'], tapa: '#8a84a3', piso: ['#34303f', '#1f1b27'], niebla: '#3a2f5a' },
  { nombre: 'Biblioteca embrujada', muro: ['#6b4a32', '#2e1f14'], tapa: '#a07a52', piso: ['#3f2c1e', '#22170e'], niebla: '#4a3020' },
  { nombre: 'Jardín de calabazas', muro: ['#2f6b3a', '#173a1e'], tapa: '#4a9a52', piso: ['#3a3a26', '#1f2214'], niebla: '#2a4a2a' },
];
interface Fantasma { especie: Especie; g: THREE.Group; cuerpo: THREE.Mesh; falda: THREE.Mesh; x: number; z: number; hacia: { i: number; j: number } | null; susto: number; fase: number; alerta: number; previo: { i: number; j: number } | null; cae: number; ultimoChillido: number }
interface Cosa { x: number; z: number; i: number; j: number; malla: THREE.Object3D; tomada: boolean }
interface Item extends Cosa { tipo: Objeto }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 14, alto: 10, centro: [0, 0, 0], inclinacion: 1.1, sinPlaya: true });
  e.camara.far = 260; e.camara.updateProjectionMatrix();
  const mando = crearMando(e, c.caja, 'Linterna');
  const r0 = generador(`${c.semilla}|laberinto`);
  const noche = await nocheEmbrujada(e.escena, r0, { ancho: 50, fondo: 50, desde: 2, hasta: 18, niebla: [30, 120] });
  // Más oscuro que el resto de la noche: la luz la pone tu linterna
  e.escena.traverse((o) => { const l = o as THREE.Light; if (l.isLight && !(l as THREE.PointLight).isPointLight) l.intensity *= 0.55; });

  const [k] = await Promise.all([e.personaje(c.aspecto, 1.25)]);
  const sombraYo = sombra(0.45); e.escena.add(sombraYo);
  // Linterna: un cono hacia donde caminas y un halo chico alrededor
  const linterna = new THREE.SpotLight('#ffd9a0', 60, 14, 0.62, 0.55, 1.4), apunta = new THREE.Object3D();
  linterna.target = apunta;
  const halito = new THREE.PointLight('#ffd9a0', 8, 4, 1.6);
  e.escena.add(linterna, apunta, halito);
  const farolito = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe2a8' }));
  e.escena.add(farolito);
  const destello = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 32), new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  destello.rotation.x = -Math.PI / 2; e.escena.add(destello);
  const cargaAro = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32, 1, 0, 0.01), new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  cargaAro.rotation.x = -Math.PI / 2; e.escena.add(cargaAro);
  const brujula = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 3), new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: 0.85, depthWrite: false }));
  brujula.rotation.order = 'YXZ'; brujula.rotation.x = Math.PI / 2; e.escena.add(brujula);
  const escudoMalla = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), new THREE.MeshBasicMaterial({ color: '#5ad1ff', transparent: true, opacity: 0.22, depthWrite: false })); escudoMalla.visible = false; e.escena.add(escudoMalla);

  // Materiales que se reusan en cada piso
  const texturas = ESTILOS.map((s) => { const muro = ladrillo(s.muro[0], s.muro[1], 4), piso = ladrillo(s.piso[0], s.piso[1], 3); piso.repeat.set(32, 32); return { muro: new THREE.MeshLambertMaterial({ map: muro }), tapa: mat(s.tapa), piso: new THREE.MeshLambertMaterial({ map: piso }) }; });
  const matSecreta = new THREE.MeshLambertMaterial({ map: ladrillo('#6a6680', '#36324a', 4) });
  const geoMuro = new THREE.BoxGeometry(T, ALTO_MURO, T), geoTapa = new THREE.BoxGeometry(T + 0.12, 0.18, T + 0.12);
  const resplandorVela = new THREE.SpriteMaterial({ map: halo('rgba(255,190,90,0.9)'), depthWrite: false, blending: THREE.AdditiveBlending });
  const resplandorPila = new THREE.SpriteMaterial({ map: halo('rgba(120,255,170,0.9)'), depthWrite: false, blending: THREE.AdditiveBlending });
  const resplandorAntorcha = new THREE.SpriteMaterial({ map: halo('rgba(255,140,60,0.8)'), depthWrite: false, blending: THREE.AdditiveBlending });
  const matAsustado = new THREE.MeshLambertMaterial({ color: '#7fb4ff', emissive: '#2a4cc0', transparent: true, opacity: 0.8 });
  const matFantasma = (Object.keys(ESPECIES) as Especie[]).reduce((m, k2) => ({ ...m, [k2]: new THREE.MeshLambertMaterial({ color: ESPECIES[k2].color, emissive: ESPECIES[k2].brillo, transparent: true, opacity: k2 === 'muros' ? 0.55 : 0.85 }) }), {} as Record<Especie, THREE.MeshLambertMaterial>);
  const geoCabeza = new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), geoFalda = new THREE.CylinderGeometry(0.55, 0.7, 0.9, 14, 1, true);
  const geoOjo = new THREE.SphereGeometry(0.09, 6, 4), matOjo = new THREE.MeshBasicMaterial({ color: '#141020' }), matOjoRojo = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
  const matTela = new THREE.MeshBasicMaterial({ color: '#e8e8f0', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const texTela = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d')!; g.strokeStyle = 'rgba(240,240,255,0.85)'; g.lineWidth = 1.5; for (let a = 0; a < 8; a++) { g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos((a * Math.PI) / 4) * 30, 32 + Math.sin((a * Math.PI) / 4) * 30); g.stroke(); } for (let rr = 6; rr < 32; rr += 6) { g.beginPath(); for (let a = 0; a <= 8; a++) g.lineTo(32 + Math.cos((a * Math.PI) / 4) * rr, 32 + Math.sin((a * Math.PI) / 4) * rr); g.stroke(); } return new THREE.CanvasTexture(cv); })();
  matTela.map = texTela; matTela.color.set('#ffffff'); matTela.opacity = 0.75;

  // Ceniza que cae despacio sobre todo el laberinto
  const CENIZA = 160, ceniza = new Float32Array(CENIZA * 3);
  for (let i = 0; i < CENIZA; i++) ceniza.set([(r0() - 0.5) * 40, r0() * 9, (r0() - 0.5) * 40], i * 3);
  const geoCeniza = new THREE.BufferGeometry(); geoCeniza.setAttribute('position', new THREE.BufferAttribute(ceniza, 3));
  const puntosCeniza = new THREE.Points(geoCeniza, new THREE.PointsMaterial({ color: '#b8b0c8', size: 0.08, transparent: true, opacity: 0.6, depthWrite: false }));
  e.escena.add(puntosCeniza);

  // ── Estado de la partida y del piso ──
  let N = 0, mapa: boolean[][] = [], salida = { i: 0, j: 0 }, grupoPiso: THREE.Group | null = null, visto: boolean[][] = [];
  let velas: Cosa[] = [], pilas: Cosa[] = [], items: Item[] = [], telas: { i: number; j: number }[] = [], tablas: { i: number; j: number; ultima: number }[] = [], secretas: { i: number; j: number; n: number }[] = [];
  let fantasmas: Fantasma[] = [], reja: THREE.Mesh | null = null, portal: THREE.Mesh | null = null, bloquesSecretos: THREE.InstancedMesh | null = null, rj = generador('');
  const yo = { x: 0, z: 0, ang: 0, vidas: VIDAS, invencible: 0 };
  let reloj = 0, limite = c.libre ? Infinity : DURA, piso = 0, bateria = 1, puntos = 0, velasTotal = 0, espantados = 0, pisos = 0, empezado = false, terminado = false, abierta = false, avisoPila = false;
  let botas = 0, amuleto = false, llave = false, mapaHasta = 0, inicioPiso = 0, vidasPiso = VIDAS, combo = 0, ultimaVela = -9, latido = 0, espantadosPiso = 0;
  const necesarias = () => Math.ceil(velasTotal * (llave ? PARA_ABRIR_LLAVE : PARA_ABRIR));
  const desglose = { velas: 0, combos: 0, pisos: 0, fantasmas: 0, final: 0 };

  const enMundo = (i: number) => (i - N) * T; // el centro de la casilla i (el laberinto queda centrado en el origen)
  const casilla = (x: number) => Math.round(x / T + N);
  const libre = (i: number, j: number) => i >= 0 && j >= 0 && i <= 2 * N && j <= 2 * N && !mapa[i][j];
  /** Si entre dos puntos no hay muros (para la luz del destello y para que los fantasmas te vean). */
  const aLaVista = (x1: number, z1: number, x2: number, z2: number) => {
    const pasos = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.4);
    for (let n = 1; n < pasos; n++) if (!libre(casilla(x1 + ((x2 - x1) * n) / pasos), casilla(z1 + ((z2 - z1) * n) / pasos))) return false;
    return true;
  };

  /** Arma un piso nuevo: laberinto por "backtracking" con atajos, puertas secretas, velas, pilas, objetos, trampas, fantasmas y la reja. */
  const armarPiso = () => {
    if (grupoPiso) { e.escena.remove(grupoPiso); grupoPiso.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); }); }
    for (const f of fantasmas) e.escena.remove(f.g);
    const r = generador(`${c.semilla}|laberinto|${piso}`);
    rj = generador(`${c.semilla}|laberinto|fantasmas|${piso}`);
    const estilo = ESTILOS[piso % ESTILOS.length], tex = texturas[piso % ESTILOS.length];
    N = 6 + Math.min(3, piso) + (c.nivel > 2 ? 1 : 0);
    const L = 2 * N + 1;
    mapa = Array.from({ length: L }, () => Array(L).fill(true));
    visto = Array.from({ length: L }, () => Array(L).fill(false));
    const pila: [number, number][] = [[1, 1]];
    mapa[1][1] = false;
    while (pila.length) {
      const [i, j] = pila[pila.length - 1];
      const vecinos = ([[2, 0], [-2, 0], [0, 2], [0, -2]] as const).map(([a, b]) => [i + a, j + b] as [number, number]).filter(([a, b]) => a > 0 && b > 0 && a < L - 1 && b < L - 1 && mapa[a][b]);
      if (!vecinos.length) { pila.pop(); continue; }
      const [a, b] = vecinos[Math.floor(r() * vecinos.length)];
      mapa[(i + a) / 2][(j + b) / 2] = false; mapa[a][b] = false;
      pila.push([a, b]);
    }
    // Atajos: se abren algunos muros sueltos para que haya vueltas por donde escapar
    for (let n = 0; n < N * 2; n++) {
      const i = 1 + Math.floor(r() * (L - 2)), j = 1 + Math.floor(r() * (L - 2));
      if (mapa[i][j] && ((i % 2 === 1 && j % 2 === 0) || (i % 2 === 0 && j % 2 === 1))) mapa[i][j] = false;
    }
    // Puertas secretas: muros de un poco otro color que se abren cuando pasas al lado
    secretas = [];
    for (let n = 0; n < 40 && secretas.length < 2 + Math.min(2, piso); n++) {
      const i = 1 + Math.floor(r() * (L - 2)), j = 1 + Math.floor(r() * (L - 2));
      if (mapa[i][j] && ((i % 2 === 1 && j % 2 === 0) || (i % 2 === 0 && j % 2 === 1)) && !secretas.some((s) => s.i === i && s.j === j)) secretas.push({ i, j, n: secretas.length });
    }
    salida = { i: L - 2, j: L - 2 };

    const g = new THREE.Group();
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(L * T + 8, L * T + 8), tex.piso);
    suelo.rotation.x = -Math.PI / 2; g.add(suelo);
    const muros: [number, number][] = [];
    for (let i = 0; i < L; i++) for (let j = 0; j < L; j++) if (mapa[i][j] && !secretas.some((s) => s.i === i && s.j === j)) muros.push([i, j]);
    const bloques = new THREE.InstancedMesh(geoMuro, tex.muro, muros.length), tapas = new THREE.InstancedMesh(geoTapa, tex.tapa, muros.length + secretas.length), o = new THREE.Object3D();
    muros.forEach(([i, j], n) => {
      o.position.set(enMundo(i), ALTO_MURO / 2, enMundo(j)); o.updateMatrix(); bloques.setMatrixAt(n, o.matrix);
      o.position.y = ALTO_MURO + 0.09; o.updateMatrix(); tapas.setMatrixAt(n, o.matrix);
    });
    bloquesSecretos = new THREE.InstancedMesh(geoMuro, matSecreta, Math.max(1, secretas.length));
    secretas.forEach((s, n) => { o.position.set(enMundo(s.i), ALTO_MURO / 2, enMundo(s.j)); o.updateMatrix(); bloquesSecretos!.setMatrixAt(n, o.matrix); o.position.y = ALTO_MURO + 0.09; o.updateMatrix(); tapas.setMatrixAt(muros.length + n, o.matrix); });
    bloquesSecretos.count = secretas.length;
    g.add(bloques, tapas, bloquesSecretos);
    // Casillas libres (lejos de la entrada): ahí van velas, pilas, objetos y trampas
    const libres: [number, number][] = [];
    for (let i = 1; i < L - 1; i++) for (let j = 1; j < L - 1; j++) if (!mapa[i][j] && (i + j > 4) && !(i === salida.i && j === salida.j)) libres.push([i, j]);
    const sacar = () => libres.splice(Math.floor(r() * libres.length), 1)[0];
    velas = Array.from({ length: 6 + N }, () => {
      const [i, j] = sacar(), v = new THREE.Group();
      const cera = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8), mat('#f4ecd8')); cera.position.y = 0.25;
      const llama = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), new THREE.MeshBasicMaterial({ color: '#ffcf5a' })); llama.position.y = 0.6;
      const luz = new THREE.Sprite(resplandorVela); luz.scale.setScalar(1.6); luz.position.y = 0.6;
      const plato = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 10), mat('#8a7a5a'));
      v.add(cera, llama, luz, plato); v.position.set(enMundo(i), 0, enMundo(j)); g.add(v);
      return { x: v.position.x, z: v.position.z, i, j, malla: v, tomada: false };
    });
    velasTotal = velas.length;
    pilas = Array.from({ length: 3 + Math.min(2, piso) }, () => {
      const [i, j] = sacar(), p = new THREE.Group();
      const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.45, 10), mat('#3fc79a')), polo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), mat('#d8dde8'));
      tubo.position.y = 0.45; polo.position.y = 0.72;
      const luz = new THREE.Sprite(resplandorPila); luz.scale.setScalar(1.4); luz.position.y = 0.5;
      p.add(tubo, polo, luz); p.position.set(enMundo(i), 0, enMundo(j)); g.add(p);
      return { x: p.position.x, z: p.position.z, i, j, malla: p, tomada: false };
    });
    // Dos objetos por piso
    const tipos = Object.keys(OBJETOS) as Objeto[];
    items = Array.from({ length: 2 }, () => {
      const [i, j] = sacar(), tipo = tipos[Math.floor(r() * tipos.length)], m = new THREE.Group();
      const gema = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), new THREE.MeshStandardMaterial({ color: OBJETOS[tipo].color, emissive: OBJETOS[tipo].color, emissiveIntensity: 0.6, flatShading: true })); gema.position.y = 0.7;
      const luz = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(255,255,255,0.6)'), color: OBJETOS[tipo].color, depthWrite: false, blending: THREE.AdditiveBlending })); luz.scale.setScalar(1.3); luz.position.y = 0.7;
      m.add(gema, luz); m.position.set(enMundo(i), 0, enMundo(j)); g.add(m);
      return { x: m.position.x, z: m.position.z, i, j, malla: m, tomada: false, tipo };
    });
    // Trampas: telarañas que frenan y tablas que crujen
    telas = Array.from({ length: 2 + Math.min(3, piso) }, () => { const [i, j] = sacar(); const m = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.9, T * 0.9), matTela); m.rotation.x = -Math.PI / 2; m.position.set(enMundo(i), 0.03, enMundo(j)); g.add(m); return { i, j }; });
    tablas = Array.from({ length: 3 }, () => { const [i, j] = sacar(); for (let n = 0; n < 3; n++) { const tabla = new THREE.Mesh(new THREE.BoxGeometry(T * 0.8, 0.05, 0.36), mat(n % 2 ? '#6a4a2a' : '#5a3d22')); tabla.position.set(enMundo(i), 0.03, enMundo(j) + (n - 1) * 0.42); tabla.rotation.y = (n - 1) * 0.05; g.add(tabla); } return { i, j, ultima: -9 }; });
    // Adornos: calaveras, telarañas en las esquinas de los muros y antorchas (con calabazas en el jardín)
    const muroAlLado = (i: number, j: number): [number, number] | null => { for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (mapa[i + a]?.[j + b]) return [a, b]; return null; };
    const adornos = libres.slice(0, Math.min(libres.length, 22));
    const calaveras = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), mat(estilo.nombre === 'Jardín de calabazas' ? '#e8761a' : '#e8e2d0'), adornos.length);
    adornos.forEach(([i, j], n) => { const lado = muroAlLado(i, j) ?? [0, 0]; o.position.set(enMundo(i) + lado[0] * T * 0.38, 0.14, enMundo(j) + lado[1] * T * 0.38); o.scale.set(1, estilo.nombre === 'Jardín de calabazas' ? 0.8 : 1, 1); o.updateMatrix(); calaveras.setMatrixAt(n, o.matrix); });
    o.scale.set(1, 1, 1);
    g.add(calaveras);
    for (const [i, j] of libres.slice(22, 34)) {
      const lado = muroAlLado(i, j); if (!lado) continue;
      const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), matTela); tela.position.set(enMundo(i) + lado[0] * T * 0.46, ALTO_MURO - 0.3, enMundo(j) + lado[1] * T * 0.46); tela.lookAt(enMundo(i), ALTO_MURO - 0.3, enMundo(j)); g.add(tela);
    }
    for (const [i, j] of libres.slice(34, 42)) {
      const lado = muroAlLado(i, j); if (!lado) continue;
      const x = enMundo(i) + lado[0] * T * 0.44, z = enMundo(j) + lado[1] * T * 0.44;
      const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 5), mat('#3a2a1a')); palo.position.set(x, 1.2, z);
      const fuego = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 6), new THREE.MeshBasicMaterial({ color: '#ff9a3c' })); fuego.position.set(x, 1.55, z); fuego.userData.fuego = true;
      const luz = new THREE.Sprite(resplandorAntorcha); luz.scale.setScalar(1.8); luz.position.set(x, 1.55, z);
      g.add(palo, fuego, luz);
    }
    // Reja de salida (cerrada hasta juntar las velas) con su portal
    const sx = enMundo(salida.i), sz = enMundo(salida.j);
    for (const d of [-1, 1]) { const poste = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.6, 0.35), mat('#2a2633')); poste.position.set(sx + d * 0.9, 1.3, sz); g.add(poste); }
    const arco = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 16, Math.PI), mat('#2a2633')); arco.position.set(sx, 2.6, sz); g.add(arco);
    reja = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.5), new THREE.MeshBasicMaterial({ color: '#1a1422', transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    reja.position.set(sx, 1.25, sz); g.add(reja);
    portal = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), new THREE.MeshBasicMaterial({ color: '#b17cff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    portal.position.set(sx, 1.3, sz + 0.02); g.add(portal);
    if (e.escena.fog) (e.escena.fog as THREE.Fog).color.set(estilo.niebla);
    e.escena.add(g);
    grupoPiso = g;
    abierta = false;
    // Fantasmas: nacen lejos de la entrada; cada piso suma especies nuevas
    const lista: Especie[] = ['errante', 'errante'];
    if (piso >= 1) lista.push('cazador');
    if (piso >= 2) lista.push('chillon', 'muros');
    if (piso >= 3) lista.push('dama');
    while (lista.length < 2 + Math.min(4, piso + c.nivel)) lista.push(piso >= 2 ? 'cazador' : 'errante');
    fantasmas = lista.map((especie, n) => {
      const lejos = libres.filter(([a, b]) => a + b > N * 2), [i, j] = lejos.length ? lejos[Math.floor(r() * lejos.length)] : sacar();
      const f = new THREE.Group(), material = matFantasma[especie], cabeza = new THREE.Mesh(geoCabeza, material), falda = new THREE.Mesh(geoFalda, material);
      cabeza.position.y = 0.9; falda.position.y = 0.45; f.add(cabeza, falda);
      for (const d of [-1, 1]) { const ojo = new THREE.Mesh(geoOjo, especie === 'cazador' || especie === 'dama' ? matOjoRojo : matOjo); ojo.position.set(d * 0.2, 1.1, 0.48); ojo.scale.set(1, 1.6, 0.5); f.add(ojo); }
      if (especie === 'dama') { f.scale.setScalar(1.3); const velo = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 14, 1, true), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#a0a8ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide })); velo.position.y = 1; f.add(velo); }
      if (especie === 'chillon') { const boca = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), matOjo); boca.position.set(0, 0.85, 0.5); boca.scale.set(1, 1.4, 0.5); f.add(boca); }
      f.position.set(enMundo(i), 0, enMundo(j)); e.escena.add(f);
      return { especie, g: f, cuerpo: cabeza, falda, x: f.position.x, z: f.position.z, hacia: null, susto: 0, fase: n * 1.7, alerta: 0, previo: null, cae: 0, ultimoChillido: -9 };
    });
    yo.x = enMundo(1); yo.z = enMundo(1); yo.ang = 0;
    inicioPiso = reloj; vidasPiso = yo.vidas; espantadosPiso = 0;
    e.hud.aviso(`Piso ${piso + 1}: ${estilo.nombre}${piso >= 3 ? ' · cuidado con la Dama de Blanco' : piso === 2 ? ' · llegan el Chillón y el Atraviesamuros' : piso === 1 ? ' · llega el Cazador' : ''}`, 'oro', 2);
  };

  /** Paso del camino más corto (por casillas) desde (i, j) hacia el destino; null si está muy lejos. */
  const hacia = (i: number, j: number, di: number, dj: number, tope: number): { i: number; j: number } | null => {
    const L = 2 * N + 1, previo = new Map<number, number>(), cola = [i * L + j];
    previo.set(i * L + j, -1);
    for (let n = 0; n < cola.length; n++) {
      const a = cola[n], ai = Math.floor(a / L), aj = a % L;
      if (ai === di && aj === dj) {
        let paso = a, largo = 0;
        while (previo.get(paso) !== i * L + j && previo.get(paso) !== -1) { paso = previo.get(paso)!; largo++; }
        return largo > tope ? null : { i: Math.floor(paso / L), j: paso % L };
      }
      for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const b = (ai + x) * L + aj + y; if (libre(ai + x, aj + y) && !previo.has(b)) { previo.set(b, a); cola.push(b); } }
    }
    return null;
  };
  /** Distancia por pasillos (en casillas) de (i, j) a todas: la usan la brújula y la reaparición. */
  const distancias = (i: number, j: number) => {
    const L = 2 * N + 1, d = new Map<number, number>([[i * L + j, 0]]), cola = [i * L + j];
    for (let n = 0; n < cola.length; n++) { const a = cola[n], ai = Math.floor(a / L), aj = a % L; for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const b = (ai + x) * L + aj + y; if (libre(ai + x, aj + y) && !d.has(b)) { d.set(b, d.get(a)! + 1); cola.push(b); } } }
    return (a: number, b: number) => d.get(a * L + b) ?? Infinity;
  };

  const terminar = (porque: string) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    const porTiempo = porque === 'Se acabó el tiempo';
    if (porTiempo) { const bono = yo.vidas * 150; puntos += bono; desglose.final += bono; }
    k.animar(porTiempo ? 'emote-yes' : 'die', true);
    c.alTerminar({
      puntaje: puntos,
      lineas: [
        ['Pisos superados', `${pisos} (${desglose.pisos} pts con bonos)`],
        ['Velas', `${puntosVelas} (${desglose.velas} pts + ${desglose.combos} de combos)`],
        ['Fantasmas espantados', `${espantados} (${desglose.fantasmas} pts)`],
        ['Vidas al final', `${Math.max(0, yo.vidas)}${desglose.final ? ` (+${desglose.final})` : ''}`],
        ['Fin', porque],
      ],
      detalle: { version: 2, pisos, velas: puntosVelas, espantados, vidas: yo.vidas },
    });
  };
  let puntosVelas = 0;

  // ── Reaparecer en un lugar seguro: cerca de la entrada, lejos de los fantasmas ──
  const reaparecer = () => {
    const d = distancias(1, 1);
    let mejor = { i: 1, j: 1 }, nota = -Infinity;
    for (let i = 1; i < 2 * N; i++) for (let j = 1; j < 2 * N; j++) {
      if (!libre(i, j) || d(i, j) > 8) continue;
      const lejos = Math.min(...fantasmas.map((f) => Math.hypot(casilla(f.x) - i, casilla(f.z) - j)));
      const n = Math.min(lejos, 8) - d(i, j) * 0.2;
      if (n > nota) { nota = n; mejor = { i, j }; }
    }
    yo.x = enMundo(mejor.i); yo.z = enMundo(mejor.j);
    for (const f of fantasmas) if (Math.hypot(f.x - yo.x, f.z - yo.z) < T * 5) { f.susto = reloj + 3; f.hacia = null; }
  };
  /** Un fantasma espantado y atrapado se desvanece y vuelve en el rincón más lejos de ti. */
  const devolver = (f: Fantasma) => {
    let mejor = { i: 2 * N - 1, j: 1 }, nota = -1;
    for (let n = 0; n < 24; n++) { const i = 1 + 2 * Math.floor(rj() * N), j = 1 + 2 * Math.floor(rj() * N), dd = Math.hypot(i - casilla(yo.x), j - casilla(yo.z)); if (libre(i, j) && dd > nota) { nota = dd; mejor = { i, j }; } }
    f.x = enMundo(mejor.i); f.z = enMundo(mejor.j); f.hacia = null; f.susto = 0; f.cae = 0;
  };

  // ── Aviso de peligro: borde rojo cuando un fantasma que no ves se acerca ──
  const peligro = document.createElement('div');
  peligro.className = 'laberinto-peligro';
  c.caja.appendChild(peligro);

  // ── Minimapa (se revela al explorar) ──
  const minimapa = document.createElement('canvas');
  minimapa.width = minimapa.height = 130; minimapa.className = 'kart-mapa';
  Object.assign(minimapa.style, { width: '130px', height: '130px' });
  c.caja.appendChild(minimapa);
  const pintarMapa = () => {
    const g = minimapa.getContext('2d')!, L = 2 * N + 1, k2 = 126 / L, todo = reloj < mapaHasta;
    g.clearRect(0, 0, 130, 130);
    g.fillStyle = 'rgba(10,8,20,.72)'; g.fillRect(0, 0, 130, 130);
    for (let i = 0; i < L; i++) for (let j = 0; j < L; j++) {
      if (!todo && !visto[i][j]) continue;
      g.fillStyle = mapa[i][j] ? '#6a6480' : '#2a2436'; g.fillRect(2 + i * k2, 2 + j * k2, k2 + 0.5, k2 + 0.5);
    }
    const punto = (i: number, j: number, color: string, rr: number) => { g.fillStyle = color; g.beginPath(); g.arc(2 + (i + 0.5) * k2, 2 + (j + 0.5) * k2, rr, 0, 6.3); g.fill(); };
    for (const v of velas) if (!v.tomada && (todo || visto[v.i][v.j])) punto(v.i, v.j, '#ffcf5a', 2);
    for (const it of items) if (!it.tomada && (todo || visto[it.i][it.j])) punto(it.i, it.j, OBJETOS[it.tipo].color, 2.2);
    if (todo || visto[salida.i][salida.j]) punto(salida.i, salida.j, abierta ? '#b17cff' : '#6a4a8a', 3);
    for (const f of fantasmas) if (todo || Math.hypot(f.x - yo.x, f.z - yo.z) < T * 3.5) punto(casilla(f.x), casilla(f.z), '#ff6a8a', 2.2);
    punto(casilla(yo.x), casilla(yo.z), '#ffffff', 3);
  };

  // ── Destello: un toque = corto; mantener (CARGA s) = cargado ──
  let apretadoDesde = -1, pulsadaAntes = false;
  const lanzarDestello = (cargado: boolean) => {
    const costo = cargado ? 0.3 : 0.12, alcance = (cargado ? 8 : 5) * (T / 2.4);
    if (bateria < costo) { e.hud.aviso('Sin pila para el destello', '', 0.8); return; }
    bateria -= costo;
    destello.position.set(yo.x, 0.3, yo.z); destello.userData.desde = reloj; destello.userData.grande = cargado;
    e.sonido.tono(cargado ? 1600 : 1200, cargado ? 0.4 : 0.25, { tipo: 'triangle', vol: 0.14, hasta: 300 });
    for (const f of fantasmas) {
      if (Math.hypot(f.x - yo.x, f.z - yo.z) > alcance || !aLaVista(yo.x, yo.z, f.x, f.z)) continue;
      if (f.especie === 'dama' && !cargado) { e.flotante('¡No le basta!', f.x, 2, f.z, 'mal'); continue; }
      f.susto = reloj + (cargado ? 5 : 3.5); f.hacia = null;
    }
  };

  // Piloto de prueba (solo en desarrollo): "?piloto=1" va por las velas, esquiva fantasmas y usa el destello; "?rapido=N" acelera
  const parametros = new URLSearchParams(location.search), automatico = import.meta.env.DEV && parametros.has('piloto');
  const aceleracion = import.meta.env.DEV ? Math.max(1, Number(parametros.get('rapido')) || 1) : 1;
  let pilotoDestello = 0;
  const pilotear = () => {
    const mi = casilla(yo.x), mj = casilla(yo.z);
    const amenaza = fantasmas.filter((f) => reloj > f.susto && !f.cae && Math.hypot(f.x - yo.x, f.z - yo.z) < T * 3 && (f.especie === 'muros' || aLaVista(yo.x, yo.z, f.x, f.z))).sort((a, b) => Math.hypot(a.x - yo.x, a.z - yo.z) - Math.hypot(b.x - yo.x, b.z - yo.z))[0];
    if (amenaza && bateria > 0.15 && reloj > pilotoDestello) { pilotoDestello = reloj + 0.8; lanzarDestello(amenaza.especie === 'dama' && bateria > 0.3); }
    // Sin pila o recién gastado el destello: huye a la casilla vecina que más lo aleja
    if (amenaza && reloj > amenaza.susto && Math.hypot(amenaza.x - yo.x, amenaza.z - yo.z) < T * 1.6) {
      const huida = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => ({ i: mi + a, j: mj + b })).filter((p) => libre(p.i, p.j)).sort((a, b) => Math.hypot(enMundo(b.i) - amenaza.x, enMundo(b.j) - amenaza.z) - Math.hypot(enMundo(a.i) - amenaza.x, enMundo(a.j) - amenaza.z))[0];
      if (huida) return [enMundo(huida.i) - yo.x, enMundo(huida.j) - yo.z];
    }
    const d = distancias(mi, mj), objetivos: { i: number; j: number }[] = abierta ? [salida] : [...velas.filter((v) => !v.tomada), ...(bateria < 0.4 ? pilas.filter((p) => !p.tomada) : []), ...items.filter((x) => !x.tomada)];
    const meta = objetivos.sort((a, b) => d(a.i, a.j) - d(b.i, b.j))[0];
    if (!meta) return [0, 0];
    const p = hacia(mi, mj, meta.i, meta.j, 999);
    if (!p) return [0, 0];
    return [enMundo(p.i) - yo.x, enMundo(p.j) - yo.z];
  };
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__laberinto = () => ({ piso: piso + 1, vidas: yo.vidas, puntos, bateria, terminado });

  const camara = (dt: number, ya = false) => {
    const parada = e.lienzo.clientHeight > e.lienzo.clientWidth ? 1.35 : 1;
    const objetivo = new THREE.Vector3(yo.x, 19 * parada, yo.z + 8.5 * parada);
    e.camara.position.lerp(objetivo, ya ? 1 : 1 - Math.exp(-6 * dt));
    e.camara.lookAt(yo.x, 0, yo.z - 0.6);
  };
  armarPiso();
  camara(0, true);
  e.hud.tiempo(mmss(c.libre ? 0 : DURA)); e.hud.puntos(0);
  let caminando = false;

  const simular = (paso: number) => {
    reloj += paso;
    const t = reloj;
    // Movimiento con choque contra los muros, un eje a la vez para resbalar por las paredes
    let mx = mando.x, mz = mando.z;
    if (automatico) [mx, mz] = pilotear();
    const largo = Math.hypot(mx, mz), mi = casilla(yo.x), mj = casilla(yo.z);
    if (largo > 0.15) {
      const enTela = telas.some((x) => x.i === mi && x.j === mj), rapidez = VEL * (t < botas ? 1.35 : 1) * (enTela ? 0.5 : 1);
      const v = (rapidez * paso * Math.min(1, largo)) / Math.max(1, largo);
      const choca = (x: number, z: number) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([a, b]) => !libre(casilla(x + a * RADIO), casilla(z + b * RADIO)));
      if (!choca(yo.x + mx * v, yo.z)) yo.x += mx * v;
      if (!choca(yo.x, yo.z + mz * v)) yo.z += mz * v;
      // Giro suave: el personaje y la linterna no saltan de golpe a la nueva dirección
      let dif = Math.atan2(mx, mz) - yo.ang; while (dif > Math.PI) dif -= Math.PI * 2; while (dif < -Math.PI) dif += Math.PI * 2;
      yo.ang += dif * Math.min(1, paso * 14);
    }
    if (largo > 0.15 !== caminando) { caminando = largo > 0.15; k.animar(caminando ? 'walk' : 'idle'); }
    // Lo que ves queda en el mapa
    const ni = casilla(yo.x), nj = casilla(yo.z);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (visto[ni + a]?.[nj + b] !== undefined) visto[ni + a][nj + b] = true;
    // Puertas secretas: se abren al pasar al lado
    for (const s of secretas) if (mapa[s.i][s.j] && Math.abs(s.i - ni) + Math.abs(s.j - nj) === 1) {
      mapa[s.i][s.j] = false;
      const o = new THREE.Object3D(); o.position.set(enMundo(s.i), -5, enMundo(s.j)); o.updateMatrix(); bloquesSecretos?.setMatrixAt(s.n, o.matrix); if (bloquesSecretos) bloquesSecretos.instanceMatrix.needsUpdate = true;
      e.chispas(enMundo(s.i), 1, enMundo(s.j), ['#9a94b8', '#ffffff'], 20, 3); e.sonido.ruido(0.3, 0.12); e.hud.aviso('¡Un pasadizo secreto!', 'oro', 1);
    }
    // Tablas que crujen: avisan a los fantasmas cercanos dónde estás
    for (const tb of tablas) if (tb.i === ni && tb.j === nj && t > tb.ultima + 3) {
      tb.ultima = t; e.sonido.tono(90, 0.35, { tipo: 'sawtooth', vol: 0.08, hasta: 60 }); e.hud.aviso('*crac*', 'mal', 0.7);
      for (const f of fantasmas) if (Math.hypot(f.x - yo.x, f.z - yo.z) < T * 9) f.alerta = t + 4;
    }
    // Linterna: se gasta sola; un toque lanza el destello corto y mantener lo carga
    bateria = Math.max(0, bateria - paso / PILA_DURA);
    const pulsada = mando.pulsada;
    if (pulsada && !pulsadaAntes) apretadoDesde = t;
    if (!pulsada && pulsadaAntes && apretadoDesde >= 0) { lanzarDestello(t - apretadoDesde >= CARGA); apretadoDesde = -1; }
    pulsadaAntes = pulsada;
    if (bateria < 0.2 && !avisoPila) { avisoPila = true; e.hud.aviso('¡Se acaba la pila! Busca una verde', '', 1.4); }
    if (bateria > 0.3) avisoPila = false;
    // Velas (con combo si las juntas seguidas), pilas y objetos
    for (const v of velas) if (!v.tomada && Math.hypot(v.x - yo.x, v.z - yo.z) < 0.85) {
      v.tomada = true; v.malla.visible = false; puntos += 50; desglose.velas += 50; puntosVelas++;
      combo = t - ultimaVela < 5 ? combo + 1 : 1; ultimaVela = t;
      const extra = combo >= 2 ? Math.min(50, (combo - 1) * 10) : 0; puntos += extra; desglose.combos += extra;
      e.flotante(extra ? `+${50 + extra} combo ×${combo}` : '+50', v.x, 1, v.z, 'bien'); e.sonido.tono(880, 0.12, { tipo: 'sine', vol: 0.12 }); e.sonido.tono(1320, 0.16, { tipo: 'sine', vol: 0.1, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.08 });
    }
    const tomadas = velas.filter((x) => x.tomada).length;
    if (!abierta && tomadas >= necesarias()) { abierta = true; e.hud.aviso(tomadas < velasTotal ? `¡La reja se abrió! Sal, o junta las ${velasTotal - tomadas} velas que faltan (+${TODAS} por todas)` : '¡La reja se abrió! Busca la salida', 'oro', 2); e.sonido.bien(); }
    for (const p of pilas) if (!p.tomada && Math.hypot(p.x - yo.x, p.z - yo.z) < 0.85) { p.tomada = true; p.malla.visible = false; bateria = Math.min(1, bateria + 0.45); e.hud.aviso('Pila: +45 %', 'oro', 0.8); e.sonido.efecto('campana', 0.5); }
    for (const it of items) if (!it.tomada && Math.hypot(it.x - yo.x, it.z - yo.z) < 0.85) {
      it.tomada = true; it.malla.visible = false;
      if (it.tipo === 'reloj') limite += 15; else if (it.tipo === 'botas') botas = t + 8; else if (it.tipo === 'amuleto') amuleto = true; else if (it.tipo === 'llave') llave = true; else mapaHasta = t + 6;
      e.hud.aviso(OBJETOS[it.tipo].nombre, 'oro', 1.4); e.sonido.bien(); e.chispas(it.x, 1, it.z, [OBJETOS[it.tipo].color, '#ffffff'], 20, 4);
    }
    // Salida: con la reja abierta, se pasa al piso siguiente (bono por rapidez y por no perder vidas)
    if (abierta && Math.hypot(enMundo(salida.i) - yo.x, enMundo(salida.j) - yo.z) < 1) {
      const rapido = Math.max(0, Math.round((60 - (t - inicioPiso)) * 6)), limpio = yo.vidas === vidasPiso ? 150 : 0, todas = tomadas === velasTotal ? TODAS : 0, total = 300 + rapido + limpio + todas;
      pisos++; piso++; puntos += total; desglose.pisos += total; llave = false; limite += EXTRA_PISO;
      e.chispas(yo.x, 1, yo.z, ['#b17cff', '#ffd23c', '#ffffff'], 40, 6);
      e.hud.aviso(`¡Piso superado! +300${rapido ? ` +${rapido} rápido` : ''}${limpio ? ' +150 sin daño' : ''}${todas ? ` +${TODAS} todas las velas` : ''} · +${EXTRA_PISO} s`, 'oro', 2.2);
      armarPiso(); camara(0, true);
      return;
    }
    // Fantasmas: de casilla en casilla (el atraviesamuros va derecho); si te huelen o les avisan te persiguen, y si
    // están asustados huyen. Los primeros 4 s y mientras eres invencible no persiguen.
    const base = 2.4 + Math.min(1.2, piso * 0.3) + (c.nivel - 1) * 0.15;
    for (const f of fantasmas) {
      const datos = ESPECIES[f.especie], asustado = t < f.susto, vel = Math.min(VEL * 0.95, base * datos.vel) * (c.libre ? 0.6 : 1);
      if (f.cae > 0) { f.cae += paso; f.g.scale.setScalar(Math.max(0.01, (f.especie === 'dama' ? 1.3 : 1) * (1 - f.cae * 2.5))); if (f.cae > 0.4) { devolver(f); f.g.scale.setScalar(f.especie === 'dama' ? 1.3 : 1); } continue; }
      const fi = casilla(f.x), fj = casilla(f.z), cerca = Math.hypot(f.x - yo.x, f.z - yo.z), ve = aLaVista(f.x, f.z, yo.x, yo.z);
      // El chillón, si te ve, avisa a todos
      if (f.especie === 'chillon' && !asustado && ve && cerca < T * 6 && t > f.ultimoChillido + 5) { f.ultimoChillido = t; e.sonido.tono(1800, 0.4, { tipo: 'sawtooth', vol: 0.06, hasta: 2600 }); e.hud.aviso('¡El Chillón te vio!', 'mal', 1); for (const o2 of fantasmas) o2.alerta = t + 5; }
      const persigue = !asustado && t > yo.invencible && t - inicioPiso > 4;
      if (f.especie === 'muros' && persigue && cerca < T * datos.olfato) {
        // Atraviesa paredes: va derecho hacia ti
        const v = Math.min(cerca, vel * paso); f.x += ((yo.x - f.x) / cerca) * v; f.z += ((yo.z - f.z) / cerca) * v; f.g.rotation.y = Math.atan2(yo.x - f.x, yo.z - f.z); f.hacia = null;
      } else {
        if (!f.hacia || Math.hypot(enMundo(f.hacia.i) - f.x, enMundo(f.hacia.j) - f.z) < 0.05) {
          if (!libre(fi, fj)) { f.hacia = null; let mejor: { i: number; j: number } | null = null; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (libre(fi + a, fj + b)) mejor = { i: fi + a, j: fj + b }; f.hacia = mejor; }
          else {
            const opciones = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => ({ i: fi + a, j: fj + b })).filter((p) => libre(p.i, p.j));
            const olfato = t < f.alerta ? 20 : datos.olfato + piso;
            const sigue = persigue ? hacia(fi, fj, ni, nj, olfato) : null;
            if (sigue) f.hacia = sigue;
            else if (asustado) f.hacia = opciones.sort((a, b) => Math.hypot(b.i - ni, b.j - nj) - Math.hypot(a.i - ni, a.j - nj))[0] ?? null;
            else { const sin = opciones.filter((p) => !f.previo || p.i !== f.previo.i || p.j !== f.previo.j), lista = sin.length ? sin : opciones; f.hacia = lista[Math.floor(rj() * lista.length)] ?? null; }
          }
          f.previo = { i: fi, j: fj };
        }
        if (f.hacia) {
          const dx = enMundo(f.hacia.i) - f.x, dz = enMundo(f.hacia.j) - f.z, d = Math.hypot(dx, dz), v = Math.min(d, (asustado ? vel * 0.6 : vel) * paso);
          if (d > 0) { f.x += (dx / d) * v; f.z += (dz / d) * v; f.g.rotation.y = Math.atan2(dx, dz); }
        }
      }
      // ¿Te tocó?
      const distancia = Math.hypot(f.x - yo.x, f.z - yo.z);
      if (distancia < (asustado ? ATRAPA : TOQUE)) {
        if (asustado) {
          // Espantar muchos en el mismo piso vale cada vez menos (desde el quinto, la mitad): explorar sigue valiendo más
          const vale = espantadosPiso >= 4 ? Math.round(datos.puntos / 2) : datos.puntos;
          espantados++; espantadosPiso++; puntos += vale; desglose.fantasmas += vale; f.cae = 0.001;
          e.flotante(`+${vale} ¡Buu!`, f.x, 1.6, f.z, 'oro'); e.chispas(f.x, 1, f.z, ['#ffffff', '#7fb4ff'], 24, 5); e.sonido.tono(1400, 0.3, { tipo: 'sine', vol: 0.1, hasta: 200 });
        } else if (t > yo.invencible) {
          if (amuleto) { amuleto = false; yo.invencible = t + 2; e.hud.aviso('¡El amuleto te salvó!', 'oro', 1.2); e.chispas(yo.x, 1, yo.z, ['#5ad1ff', '#ffffff'], 24, 5); f.susto = t + 3; continue; }
          yo.vidas--; yo.invencible = t + 3;
          e.temblar(0.7); e.sonido.mal(); e.chispas(yo.x, 1, yo.z, ['#ffffff', '#b17cff'], 24, 5);
          if (yo.vidas <= 0) return terminar('Te atraparon los fantasmas');
          e.hud.aviso(`¡Buuu! Te quedan ${yo.vidas}`, '', 1.3);
          reaparecer();
        }
      }
    }
    // Latido: más rápido mientras más cerca está un fantasma
    const masCerca = Math.min(...fantasmas.map((f) => (t < f.susto ? Infinity : Math.hypot(f.x - yo.x, f.z - yo.z))));
    const oculto = Math.min(...fantasmas.map((f) => (t < f.susto || f.cae || aLaVista(yo.x, yo.z, f.x, f.z) ? Infinity : Math.hypot(f.x - yo.x, f.z - yo.z))));
    peligro.style.opacity = oculto < T * 3.5 ? String(Math.min(0.85, (1 - oculto / (T * 3.5)) * 1.1)) : '0';
    if (masCerca < T * 3 && t > latido) { latido = t + 0.25 + (masCerca / (T * 3)) * 0.7; e.sonido.tono(55, 0.12, { tipo: 'sine', vol: 0.18 }); e.sonido.tono(48, 0.1, { tipo: 'sine', vol: 0.14, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.14 }); }
    if (t >= limite) return terminar('Se acabó el tiempo');
  };

  e.alCuadro((t, dt) => {
    noche.avanzar(t);
    if (empezado && !terminado && t > 0) {
      const paso = Math.min(dt, 0.05);
      for (let n = 0; n < aceleracion && !terminado; n++) simular(paso);
      if (!terminado) {
        const tomadas = velas.filter((x) => x.tomada).length;
        const extras = [reloj < botas ? 'botas' : '', amuleto ? 'amuleto' : '', llave ? 'llave' : '', reloj < mapaHasta ? 'mapa' : ''].filter(Boolean).join(', ');
        e.hud.tiempo(mmss(Number.isFinite(limite) ? Math.max(0, limite - reloj) : reloj));
        e.hud.extra(`Piso ${piso + 1} · 🕯️ ${tomadas}/${abierta ? velasTotal : necesarias()} · 🔦 ${Math.round(bateria * 100)} % · ${'❤️'.repeat(Math.max(0, yo.vidas))}${extras ? ` · ${extras}` : ''}`);
        e.hud.puntos(puntos);
      }
    }
    // Dibujo: personaje, linterna en cono (más corta con poca pila), carga del destello, brújula y la reja
    k.grupo.position.set(yo.x, 0, yo.z); k.grupo.rotation.y = yo.ang;
    k.grupo.visible = reloj > yo.invencible || Math.sin(t * 30) > 0;
    sombraYo.position.set(yo.x, 0.04, yo.z);
    farolito.position.set(yo.x + Math.sin(yo.ang + 0.7) * 0.35, 0.95, yo.z + Math.cos(yo.ang + 0.7) * 0.35);
    linterna.position.set(yo.x - Math.sin(yo.ang) * 0.5, 2.4, yo.z - Math.cos(yo.ang) * 0.5);
    apunta.position.set(yo.x + Math.sin(yo.ang) * 5, 0, yo.z + Math.cos(yo.ang) * 5);
    linterna.distance = 6 + bateria * 10; linterna.intensity = 25 + bateria * 55 + (bateria < 0.15 ? Math.sin(t * 40) * 15 : 0);
    halito.position.set(yo.x, 1.6, yo.z);
    const dd = reloj - (destello.userData.desde ?? -9);
    (destello.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - dd * 1.6); destello.scale.setScalar(1 + dd * (destello.userData.grande ? 30 : 18));
    const cargando = apretadoDesde >= 0 ? Math.min(1, (reloj - apretadoDesde) / CARGA) : 0;
    cargaAro.visible = cargando > 0.05; cargaAro.position.set(yo.x, 0.08, yo.z);
    if (cargaAro.visible) { cargaAro.geometry.dispose(); cargaAro.geometry = new THREE.RingGeometry(0.55, 0.68, 32, 1, 0, Math.PI * 2 * cargando); (cargaAro.material as THREE.MeshBasicMaterial).color.set(cargando >= 1 ? '#ffffff' : '#ffcf5a'); }
    escudoMalla.visible = amuleto; escudoMalla.position.set(yo.x, 0.9, yo.z);
    // Brújula: a la vela más cercana por los pasillos, o a la salida si la reja está abierta
    // Con la reja abierta, la brújula apunta a la salida (las velas que faltan siguen en el mapa)
    const d = distancias(casilla(yo.x), casilla(yo.z)), meta = abierta ? salida : velas.filter((v) => !v.tomada).sort((a, b) => d(a.i, a.j) - d(b.i, b.j))[0];
    brujula.visible = !!meta && empezado && !terminado;
    if (meta) {
      const sig = hacia(casilla(yo.x), casilla(yo.z), meta.i, meta.j, 999), hx = sig ? enMundo(sig.i) : enMundo(meta.i), hz = sig ? enMundo(sig.j) : enMundo(meta.j), ang = Math.atan2(hx - yo.x, hz - yo.z);
      brujula.position.set(yo.x + Math.sin(ang) * 1.1, 0.12, yo.z + Math.cos(ang) * 1.1); brujula.rotation.y = ang;
      (brujula.material as THREE.MeshBasicMaterial).color.set(abierta ? '#b17cff' : '#ffcf5a');
    }
    if (reja && portal) { (reja.material as THREE.MeshBasicMaterial).opacity = abierta ? Math.max(0, (reja.material as THREE.MeshBasicMaterial).opacity - dt) : 0.9; (portal.material as THREE.MeshBasicMaterial).opacity = abierta ? 0.55 + Math.sin(t * 4) * 0.2 : 0; portal.rotation.z = t; }
    for (const v of velas) if (!v.tomada) v.malla.children[1].scale.y = 1 + Math.sin(t * 14 + v.x) * 0.2;
    for (const p of pilas) if (!p.tomada) { p.malla.rotation.y = t * 2; p.malla.position.y = Math.sin(t * 3 + p.x) * 0.1; }
    for (const it of items) if (!it.tomada) { it.malla.rotation.y = t * 1.6; it.malla.position.y = Math.sin(t * 2.5 + it.z) * 0.12; }
    grupoPiso?.children.forEach((o) => { if (o.userData.fuego) o.scale.y = 1 + Math.sin(t * 17 + o.position.x * 3) * 0.2; });
    // Fantasmas: flotan, se ven azules si están asustados y dejan una estela tenue cerca de ti
    for (const f of fantasmas) {
      const asustado = reloj < f.susto, material = asustado ? matAsustado : matFantasma[f.especie];
      f.cuerpo.material = material; f.falda.material = material;
      f.g.position.set(f.x, 0.25 + Math.sin(t * 3 + f.fase) * 0.15, f.z);
      if (Math.hypot(f.x - yo.x, f.z - yo.z) < T * 4 && Math.floor(t * 8 + f.fase) !== Math.floor((t - dt) * 8 + f.fase)) e.chispas(f.x, 0.9, f.z, [asustado ? '#7fb4ff' : ESPECIES[f.especie].color], 1, 0.4);
    }
    // Ceniza que cae alrededor tuyo
    for (let i = 0; i < CENIZA; i++) { ceniza[i * 3 + 1] -= dt * 0.6; if (ceniza[i * 3 + 1] < 0) { ceniza[i * 3 + 1] = 9; ceniza[i * 3] = yo.x + (r0() - 0.5) * 40; ceniza[i * 3 + 2] = yo.z + (r0() - 0.5) * 40; } }
    geoCeniza.attributes.position.needsUpdate = true;
    pintarMapa();
    camara(dt);
  });

  return { empezar() { e.empezar(); empezado = true; k.animar('idle'); e.hud.aviso('¡Junta las velas! Con 3 de cada 4 se abre la reja (mantén Espacio para el destello cargado)', 'oro', 2); }, destruir: e.destruir };
}
