import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { alrededor, bosque, cielo } from '../decorado';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario, sombra } from '../reflejos/motor';

// Defensa de la Torre: babosas de colores bajan por un camino de tierra hacia tu castillo. Pones torres en el pasto
// (ballesta, hielo, mortero y rayo), las mejoras o las vendes con las monedas que sueltan y aguantas diez oleadas; la
// última trae al Rey Babosa, que se enfurece a media vida. Hay babosas blindadas, con escudo, curanderas y madres que
// se dividen: cada torre sirve contra unas más que contra otras. Si llegan veinte babosas al castillo, pierdes.
// Puntaje: cada baja, cada oleada (más si no perdiste vidas), combos, oleadas adelantadas y, si ganas, las vidas y
// las monedas que no gastaste.

const COLS = 16, FILAS = 10, CELDA = 1.4, AN = COLS * CELDA, FO = FILAS * CELDA, OLEADAS = 10, VIDAS = 20, PAUSA = 8;
const MONEDAS_INICIO = 110, PUNTOS_POR_MONEDA = 2, TOPE_MONEDAS = 1000;
// El camino, de celda en celda (columna, fila): entra por la izquierda y llega al castillo abajo a la derecha
const VUELTAS: [number, number][] = [[-1, 1], [3, 1], [3, 7], [7, 7], [7, 2], [12, 2], [12, 6], [9, 6], [9, 8], [14, 8]];
type Tipo = 'ballesta' | 'hielo' | 'mortero' | 'rayo';
const TORRES: Record<Tipo, { nombre: string; costo: number; alcance: number; cada: number; dano: number; color: string; tecla: string; idea: string }> = {
  ballesta: { nombre: 'Ballesta', costo: 50, alcance: 3.3, cada: 0.55, dano: 2.2, color: '#c98a4a', tecla: '1', idea: 'rápida; floja contra blindadas' },
  hielo: { nombre: 'Hielo', costo: 70, alcance: 2.8, cada: 0.9, dano: 1, color: '#7fd8ff', tecla: '2', idea: 'congela y frena' },
  mortero: { nombre: 'Mortero', costo: 110, alcance: 4.4, cada: 2.1, dano: 6, color: '#5a5a66', tecla: '3', idea: 'área; rompe blindajes' },
  rayo: { nombre: 'Rayo', costo: 140, alcance: 3, cada: 1.25, dano: 3.5, color: '#ffe066', tecla: '4', idea: 'salta entre varias; rompe escudos' },
};
type Clase = 'verde' | 'rapida' | 'gorda' | 'blindada' | 'madre' | 'cria' | 'curandera' | 'escudo' | 'jefe';
interface DatosBabosa { nombre: string; vida: number; vel: number; monedas: number; puntos: number; color: string; tam: number; dano: number; icono: string }
const BABOSAS: Record<Clase, DatosBabosa> = {
  verde: { nombre: 'Verde', vida: 6, vel: 1.5, monedas: 4, puntos: 10, color: '#5ed36a', tam: 0.42, dano: 1, icono: '🟢' },
  rapida: { nombre: 'Rápida', vida: 5, vel: 2.8, monedas: 5, puntos: 15, color: '#ffd23c', tam: 0.36, dano: 1, icono: '⚡' },
  gorda: { nombre: 'Gorda', vida: 30, vel: 0.9, monedas: 10, puntos: 30, color: '#b07ae8', tam: 0.58, dano: 2, icono: '🟣' },
  blindada: { nombre: 'Blindada', vida: 16, vel: 1.15, monedas: 8, puntos: 25, color: '#8f98a8', tam: 0.5, dano: 1, icono: '🛡️' },
  madre: { nombre: 'Madre', vida: 20, vel: 1, monedas: 6, puntos: 25, color: '#ff8fc8', tam: 0.56, dano: 2, icono: '🥚' },
  cria: { nombre: 'Cría', vida: 3, vel: 2.2, monedas: 1, puntos: 5, color: '#c8ffb0', tam: 0.27, dano: 1, icono: '' },
  curandera: { nombre: 'Curandera', vida: 14, vel: 1.2, monedas: 9, puntos: 35, color: '#f4f4f4', tam: 0.46, dano: 1, icono: '➕' },
  escudo: { nombre: 'Con escudo', vida: 14, vel: 1.2, monedas: 9, puntos: 35, color: '#5aa8ff', tam: 0.48, dano: 1, icono: '🔵' },
  jefe: { nombre: 'Rey Babosa', vida: 300, vel: 0.62, monedas: 100, puntos: 600, color: '#ef4b4b', tam: 0.95, dano: 12, icono: '👑' },
};
/** Cuánto daño le hace cada torre a cada babosa (1 = normal). */
const DEBILIDAD: Partial<Record<Clase, Partial<Record<Tipo, number>>>> = {
  blindada: { ballesta: 0.35, hielo: 0.5, rayo: 0.6, mortero: 1.5 },
  jefe: { ballesta: 0.8, mortero: 1.2 },
};

/** Qué trae cada oleada: más babosas, más variadas y más seguidas a medida que avanza. */
export function oleada(n: number): Clase[] {
  const lista: Clase[] = [];
  const total = 7 + Math.round(n * 2.2);
  for (let i = 0; i < total; i++) {
    lista.push(n >= 5 && i % 8 === 7 ? 'escudo' : n >= 4 && i % 9 === 8 ? 'curandera' : n >= 3 && i % 7 === 6 ? 'madre' : n >= 2 && i % 6 === 5 ? 'blindada' : n >= 4 && i % 6 === 2 ? 'gorda' : n >= 1 && i % 5 === 4 ? 'rapida' : 'verde');
  }
  // La cola de las últimas oleadas: un grupo duro junto
  if (n >= 6) for (let i = 0; i < n - 5; i++) lista.push(i % 2 ? 'blindada' : 'gorda');
  if (n === OLEADAS - 1) lista.push('curandera', 'jefe');
  return lista;
}

const centro = (cx: number, cz: number) => ({ x: -AN / 2 + (cx + 0.5) * CELDA, z: -FO / 2 + (cz + 0.5) * CELDA });
const celda = (x: number, z: number): [number, number] => [Math.floor((x + AN / 2) / CELDA), Math.floor((z + FO / 2) / CELDA)];

interface Babosa { clase: Clase; vida: number; max: number; escudo: number; escudoMax: number; d: number; lento: number; viva: boolean; furia: boolean; malla: THREE.Group; cuerpo: THREE.Mesh; piel: THREE.Material; barra: THREE.Mesh; barraEscudo: THREE.Mesh | null; burbuja: THREE.Mesh | null; salto: number; cura: number; lentoFactor?: number }
type Prioridad = 'primera' | 'fuerte' | 'ultima';
interface Torre { tipo: Tipo; nivel: number; cx: number; cz: number; x: number; z: number; recarga: number; invertido: number; prioridad: Prioridad; malla: THREE.Group; cabeza: THREE.Object3D; estrellas: THREE.Group }
interface Tiro { x: number; z: number; y: number; desde: { x: number; z: number }; hacia: { x: number; z: number }; blanco: Babosa | null; t: number; dura: number; tipo: Tipo; dano: number; nivel: number; malla: THREE.Mesh }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: AN + 2, alto: FO * Math.sin(1.05) + 3.4, centro: [0, 0, 0.4], inclinacion: 1.05, sinPlaya: true });
  cielo(e.escena, '#bfe8ff', '#e8f7ff');
  const r = generador(`${c.semilla}|defensa`), fuerza = 1 + (c.nivel - 1) * 0.12;

  // ── El camino: puntos y largo de cada tramo ──
  const puntos = VUELTAS.map(([cx, cz]) => centro(cx, cz)), tramos: number[] = [];
  for (let i = 1; i < puntos.length; i++) tramos.push(Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].z - puntos[i - 1].z));
  const LARGO = tramos.reduce((a, b) => a + b, 0);
  const enCamino = (d: number) => {
    d = Math.max(0, d);
    for (let i = 0; i < tramos.length; i++) {
      if (d <= tramos[i]) { const f = d / tramos[i], a = puntos[i], b = puntos[i + 1]; return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, ang: Math.atan2(b.x - a.x, b.z - a.z) }; }
      d -= tramos[i];
    }
    const p = puntos[puntos.length - 1];
    return { x: p.x, z: p.z, ang: 0 };
  };
  const camino = new Set<string>();
  for (let i = 1; i < VUELTAS.length; i++) {
    const [ax, az] = VUELTAS[i - 1], [bx, bz] = VUELTAS[i];
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let z = Math.min(az, bz); z <= Math.max(az, bz); z++) if (x >= 0) camino.add(`${x},${z}`);
  }

  // ── El prado: pasto a cuadros, camino de tierra, árboles alrededor y el castillo ──
  const pasto = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA * 0.98, 0.3, CELDA * 0.98), new THREE.MeshLambertMaterial(), COLS * FILAS);
  const o = new THREE.Object3D(), tono = new THREE.Color();
  let n = 0;
  for (let cz = 0; cz < FILAS; cz++) for (let cx = 0; cx < COLS; cx++) {
    const p = centro(cx, cz), tierra = camino.has(`${cx},${cz}`);
    o.position.set(p.x, tierra ? -0.2 : -0.15, p.z); o.updateMatrix();
    pasto.setMatrixAt(n, o.matrix);
    pasto.setColorAt(n++, tono.set(tierra ? ((cx + cz) % 2 ? '#d9b07a' : '#d2a670') : (cx + cz) % 2 ? '#7cc85a' : '#72bf51'));
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(AN + 1, 0.6, FO + 1), mat('#6a4a2e'));
  base.position.y = -0.62;
  e.escena.add(pasto, base);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat('#8fd06c'));
  suelo.rotation.x = -Math.PI / 2; suelo.position.y = -0.9;
  e.escena.add(suelo);
  const fin = puntos[puntos.length - 1], inicio = centro(0, 1);
  const portal = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.14, 8, 24), new THREE.MeshBasicMaterial({ color: '#b46cff' }));
  portal.position.set(inicio.x - CELDA * 0.6, 0.7, inicio.z); portal.rotation.y = Math.PI / 2;
  e.escena.add(portal);
  await bosque(e.escena, 'pueblo', 'tree', alrededor(r, 26, AN + 1, FO + 1, 1.2, 5, [1.2, 2.2]).map((p) => ({ ...p, y: -0.9 }))).catch(() => null);
  // Flores en el pasto, piedritas al borde del camino y una cerca de madera alrededor
  const decor = new THREE.Object3D(), tonoDecor = new THREE.Color();
  const flores = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshLambertMaterial(), 140);
  const piedras = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.11, 0), mat('#9a948a'), 120);
  let nf = 0, np = 0;
  for (let cz = 0; cz < FILAS; cz++) for (let cx = 0; cx < COLS; cx++) {
    const p = centro(cx, cz), tierra = camino.has(`${cx},${cz}`);
    if (!tierra && nf < 140 && r() < 0.55) for (let k = 0; k < 2 && nf < 140; k++) { decor.position.set(p.x + (r() - 0.5) * CELDA * 0.8, 0.04, p.z + (r() - 0.5) * CELDA * 0.8); decor.scale.setScalar(1); decor.updateMatrix(); flores.setMatrixAt(nf, decor.matrix); flores.setColorAt(nf++, tonoDecor.set(['#ffffff', '#ffd23c', '#ff7ab8', '#c79bff'][Math.floor(r() * 4)])); }
    if (tierra && np < 120) for (let k = 0; k < 2 && np < 120; k++) { const lado = r() < 0.5 ? -1 : 1, enX = r() < 0.5; decor.position.set(p.x + (enX ? lado * CELDA * 0.46 : (r() - 0.5) * CELDA), -0.06, p.z + (enX ? (r() - 0.5) * CELDA : lado * CELDA * 0.46)); decor.rotation.set(r() * 3, r() * 3, 0); decor.scale.setScalar(0.7 + r() * 0.7); decor.updateMatrix(); piedras.setMatrixAt(np++, decor.matrix); }
  }
  flores.count = nf; piedras.count = np;
  e.escena.add(flores, piedras);
  const cerca = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), mat('#8a5a38'), 80);
  let nc = 0;
  for (let i = 0; i <= COLS; i += 1) for (const z of [-FO / 2 - 0.35, FO / 2 + 0.35]) { decor.position.set(-AN / 2 + i * CELDA, 0.1, z); decor.rotation.set(0, 0, 0); decor.scale.setScalar(1); decor.updateMatrix(); cerca.setMatrixAt(nc++, decor.matrix); }
  for (let i = 1; i < FILAS; i++) for (const x of [-AN / 2 - 0.35, AN / 2 + 0.35]) { decor.position.set(x, 0.1, -FO / 2 + i * CELDA); decor.updateMatrix(); if (nc < 80) cerca.setMatrixAt(nc++, decor.matrix); }
  cerca.count = nc;
  e.escena.add(cerca);
  for (const [w, d, x, z] of [[AN + 0.7, 0.06, 0, -FO / 2 - 0.35], [AN + 0.7, 0.06, 0, FO / 2 + 0.35], [0.06, FO + 0.7, -AN / 2 - 0.35, 0], [0.06, FO + 0.7, AN / 2 + 0.35, 0]]) for (const y of [0.18, 0.32]) { const tabla = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), mat('#a0703c')); tabla.position.set(x, y, z); e.escena.add(tabla); }
  const texNube = (() => { const c2 = document.createElement('canvas'); c2.width = c2.height = 64; const g2 = c2.getContext('2d')!, gr = g2.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,30,0,0.22)'); gr.addColorStop(1, 'rgba(0,30,0,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c2); })();
  const nubes = [0, 1, 2].map((i) => { const n = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.5), new THREE.MeshBasicMaterial({ map: texNube, transparent: true, depthWrite: false })); n.rotation.x = -Math.PI / 2; n.position.set(-AN / 2 + i * 9, 0.08, -3 + i * 3); e.escena.add(n); return n; });

  // El castillo: torre de piedra con almenas, techo rojo y bandera
  const castillo = new THREE.Group(), piedra = mat('#c9c0b0');
  const torreon = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.9, 10), piedra);
  torreon.position.y = 0.95; castillo.add(torreon);
  for (let i = 0; i < 8; i++) { const almena = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), piedra), a = (i / 8) * Math.PI * 2; almena.position.set(Math.cos(a) * 0.72, 2.05, Math.sin(a) * 0.72); castillo.add(almena); }
  const techo = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1, 10), mat('#d9443a')); techo.position.y = 2.6; castillo.add(techo);
  const asta = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7), mat('#5a3a22')); asta.position.y = 3.4; castillo.add(asta);
  const bandera = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ color: '#ffd23c', side: THREE.DoubleSide })); bandera.position.set(0.26, 3.6, 0); castillo.add(bandera);
  const puerta = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.1), mat('#5a3a22')); puerta.position.set(-0.6, 0.35, 0.45); puerta.rotation.y = -0.9; castillo.add(puerta);
  for (const lado of [-1, 1]) {
    const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 1.3, 8), piedra); torre.position.set(-0.2, 0.65, lado * 1.15); castillo.add(torre);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 8), mat('#3f6ad9')); punta.position.set(-0.2, 1.65, lado * 1.15); castillo.add(punta);
    const muro = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.8), piedra); muro.position.set(-0.2, 0.4, lado * 0.6); castillo.add(muro);
  }
  castillo.position.set(fin.x + CELDA * 0.9, 0, fin.z);
  castillo.scale.setScalar(0.72); // es lo más alto de la cancha: en el borde de la foto se ve muy inclinado
  const sombraCastillo = sombra(1.1);
  sombraCastillo.position.set(fin.x + CELDA * 0.9, 0.04, fin.z);
  e.escena.add(castillo, sombraCastillo);
  let golpeCastillo = 0;

  // ── Babosas: un cuerpo blando con ojos, su barra de vida y lo que la distingue (casco, escudo, cruz, crías) ──
  const geoCuerpo = new THREE.SphereGeometry(1, 14, 10), geoOjo = new THREE.SphereGeometry(0.22, 8, 6), geoPupila = new THREE.SphereGeometry(0.11, 6, 5);
  const blanco = new THREE.MeshBasicMaterial({ color: '#ffffff' }), negro = new THREE.MeshBasicMaterial({ color: '#1a1a22' });
  const matBurbuja = new THREE.MeshBasicMaterial({ color: '#7fc8ff', transparent: true, opacity: 0.28, depthWrite: false });
  const babosas: Babosa[] = [], hieloMat = new THREE.MeshStandardMaterial({ color: '#a8e6ff', roughness: 0.8, flatShading: true, emissive: '#5fc8ff', emissiveIntensity: 0.35 });
  const nacer = (clase: Clase, ola: number, d = 0) => {
    const datos = BABOSAS[clase], g = new THREE.Group(), cuerpo = new THREE.Mesh(geoCuerpo, mat(datos.color));
    cuerpo.scale.set(1, 0.75, 1.1); cuerpo.position.y = 0.7;
    g.add(cuerpo);
    for (const lado of [-1, 1]) { const ojo = new THREE.Mesh(geoOjo, blanco), pupila = new THREE.Mesh(geoPupila, negro); ojo.position.set(lado * 0.38, 1.05, 0.78); pupila.position.set(lado * 0.38, 1.07, 0.96); g.add(ojo, pupila); }
    if (clase === 'jefe') { const corona = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.6, 5), mat('#ffd23c')); corona.position.y = 1.6; g.add(corona); }
    if (clase === 'blindada') { const casco = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#5a6170')); casco.position.y = 0.95; casco.scale.set(1.05, 0.7, 1.15); g.add(casco); }
    if (clase === 'curandera') for (const [w, h] of [[0.7, 0.2], [0.2, 0.7]]) { const cruz = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), mat('#ef4b4b')); cruz.position.set(0, 1.25, 0.2); cruz.rotation.x = -0.6; g.add(cruz); }
    if (clase === 'madre') for (let i = 0; i < 3; i++) { const huevo = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat('#c8ffb0')); huevo.position.set((i - 1) * 0.35, 1.2, -0.35); g.add(huevo); }
    let burbuja: THREE.Mesh | null = null;
    if (clase === 'escudo' || clase === 'jefe') { burbuja = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 12), matBurbuja); burbuja.position.y = 0.8; g.add(burbuja); }
    g.scale.setScalar(datos.tam);
    const barra = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.12), new THREE.MeshBasicMaterial({ color: '#3fe07a' }));
    barra.position.y = 2.3; g.add(barra);
    let barraEscudo: THREE.Mesh | null = null;
    if (burbuja) { barraEscudo = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: '#5aa8ff' })); barraEscudo.position.y = 2.48; g.add(barraEscudo); }
    g.add(sombra(0.9));
    e.escena.add(g);
    // La vida sube con cada oleada (más rápido al final); el jefe no, ya es enorme
    const escala = clase === 'jefe' ? 1 : 1 + ola * 0.24 + ola * ola * 0.01;
    const vida = Math.round(datos.vida * escala * fuerza), escudo = clase === 'escudo' ? Math.round(vida * 1.2) : clase === 'jefe' ? Math.round(vida * 0.25) : 0;
    babosas.push({ clase, vida, max: vida, escudo, escudoMax: escudo, d, lento: 0, viva: true, furia: false, malla: g, cuerpo, piel: cuerpo.material as THREE.Material, barra, barraEscudo, burbuja, salto: r() * 6, cura: 0 });
  };

  // ── Torres ──
  const torres = new Map<string, Torre>();
  const armarTorre = (tipo: Tipo, cx: number, cz: number): Torre => {
    const p = centro(cx, cz), g = new THREE.Group();
    const pie = tipo === 'ballesta' ? new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), mat('#a0703c')) : tipo === 'hielo' ? new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.7, 6), mat('#bfe6f5')) : tipo === 'rayo' ? new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 0.9, 8), mat('#4a4a6a')) : new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.68, 0.6, 10), mat('#6a6a72'));
    pie.position.y = tipo === 'rayo' ? 0.45 : 0.35; g.add(pie);
    if (tipo === 'ballesta') for (const y of [0.15, 0.55]) { const faja = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.08, 0.94), mat('#5a3a22')); faja.position.y = y; g.add(faja); }
    if (tipo === 'mortero') for (let i = 0; i < 6; i++) { const almena = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), mat('#55555c')), a = (i / 6) * Math.PI * 2; almena.position.set(Math.cos(a) * 0.55, 0.7, Math.sin(a) * 0.55); g.add(almena); }
    const cabeza = new THREE.Group();
    if (tipo === 'ballesta') {
      const caja = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.8), mat('#8a5a38')), arco = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 14, Math.PI), mat('#5a3a22'));
      arco.rotation.x = -Math.PI / 2; arco.position.z = 0.28; cabeza.add(caja, arco);
    } else if (tipo === 'hielo') {
      const cristal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: '#9fe6ff', emissive: '#4fc8ff', emissiveIntensity: 0.6, flatShading: true }));
      cristal.position.y = 0.25; cabeza.add(cristal);
    } else if (tipo === 'rayo') {
      const esfera = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffd23c', emissiveIntensity: 0.9, flatShading: true }));
      esfera.position.y = 0.35; cabeza.add(esfera);
      for (let i = 0; i < 3; i++) { const aro = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 4, 16), mat('#c9a227')); aro.rotation.x = Math.PI / 2; aro.position.y = -0.1 - i * 0.18; cabeza.add(aro); }
    } else {
      const canon = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.6, 10), mat('#3a3a44'));
      canon.rotation.x = 0.6; canon.position.y = 0.2; cabeza.add(canon);
    }
    cabeza.position.y = tipo === 'rayo' ? 1.1 : 0.95; g.add(cabeza);
    const estrellas = new THREE.Group(); estrellas.position.y = 0.75; g.add(estrellas);
    g.position.set(p.x, 0, p.z);
    e.escena.add(g);
    e.chispas(p.x, 0.8, p.z, ['#ffffff', TORRES[tipo].color, '#ffd23c'], 16, 4);
    return { tipo, nivel: 1, cx, cz, x: p.x, z: p.z, recarga: 0, invertido: TORRES[tipo].costo, prioridad: 'primera', malla: g, cabeza, estrellas };
  };
  const alcance = (t: Torre) => TORRES[t.tipo].alcance + (t.nivel - 1) * 0.4;
  const mejora = (t: Torre) => Math.round(TORRES[t.tipo].costo * (0.75 + 0.35 * t.nivel));
  const venta = (t: Torre) => Math.round(t.invertido * 0.6);
  const lentitud = (t: Torre) => 0.45 - (t.nivel - 1) * 0.08; // a qué velocidad quedan las congeladas

  // ── Disparos ──
  const tiros: Tiro[] = [];
  const geoTiro = new THREE.SphereGeometry(0.13, 8, 6);
  const rayos: { linea: THREE.Line; hasta: number }[] = [];
  const matRayo = new THREE.LineBasicMaterial({ color: '#fff3a0' });
  let reloj = 0; // reloj de la simulación (corre al doble con ⏩)
  const disparar = (t: Torre, b: Babosa) => {
    const pos = enCamino(b.d), dano = TORRES[t.tipo].dano * (1 + (t.nivel - 1) * 0.55);
    t.cabeza.rotation.y = Math.atan2(pos.x - t.x, pos.z - t.z);
    if (t.tipo === 'rayo') {
      // El rayo salta de babosa en babosa (más saltos con cada nivel) y se ve al instante
      const golpeadas: Babosa[] = [b], cadena = [new THREE.Vector3(t.x, 1.45, t.z), new THREE.Vector3(pos.x, 0.6, pos.z)];
      for (let k = 0; k < 1 + t.nivel; k++) {
        const ult = enCamino(golpeadas[golpeadas.length - 1].d);
        let sig: Babosa | null = null, dmin = 1.8;
        for (const o of babosas) { if (!o.viva || golpeadas.includes(o)) continue; const p = enCamino(o.d), dd = Math.hypot(p.x - ult.x, p.z - ult.z); if (dd < dmin) { dmin = dd; sig = o; } }
        if (!sig) break;
        golpeadas.push(sig); const p = enCamino(sig.d); cadena.push(new THREE.Vector3(p.x, 0.6, p.z));
      }
      golpeadas.forEach((g, i) => golpear(g, dano * Math.pow(0.8, i), 'rayo'));
      const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints(cadena.flatMap((p, i) => (i ? [new THREE.Vector3((p.x + cadena[i - 1].x) / 2 + (r() - 0.5) * 0.3, (p.y + cadena[i - 1].y) / 2 + 0.3, (p.z + cadena[i - 1].z) / 2 + (r() - 0.5) * 0.3), p] : [p]))), matRayo);
      e.escena.add(linea); rayos.push({ linea, hasta: reloj + 0.14 });
      e.sonido.tono(1800, 0.08, { tipo: 'sawtooth', vol: 0.05, hasta: 400 });
      return;
    }
    // El mortero apunta adonde estará la babosa cuando caiga la bala
    const hacia = t.tipo === 'mortero' ? enCamino(Math.min(LARGO, b.d + velocidadDe(b) * 0.9)) : pos;
    const malla = new THREE.Mesh(geoTiro, new THREE.MeshBasicMaterial({ color: t.tipo === 'hielo' ? '#bff0ff' : t.tipo === 'mortero' ? '#2a2a30' : '#ffd8a0' }));
    if (t.tipo === 'mortero') malla.scale.setScalar(1.8 + (t.nivel - 1) * 0.3);
    e.escena.add(malla);
    tiros.push({ x: t.x, z: t.z, y: 1.1, desde: { x: t.x, z: t.z }, hacia: { x: hacia.x, z: hacia.z }, blanco: t.tipo === 'mortero' ? null : b, t: 0, dura: t.tipo === 'mortero' ? 0.9 : 0.25, tipo: t.tipo, dano, nivel: t.nivel, malla });
    if (t.tipo === 'mortero') e.sonido.tono(120, 0.18, { tipo: 'square', vol: 0.12, hasta: 60 }); else e.sonido.tono(t.tipo === 'hielo' ? 1200 : 700, 0.05, { tipo: 'triangle', vol: 0.06 });
  };
  const velocidadDe = (b: Babosa) => {
    const base = BABOSAS[b.clase].vel * (b.furia ? 1.6 : 1);
    if (!(b.lento > reloj)) return base;
    // Las rápidas y el jefe resisten la mitad del frío
    const frio = b.lentoFactor ?? 0.45;
    return base * (b.clase === 'rapida' || b.clase === 'jefe' ? (1 + frio) / 2 : frio);
  };

  // ── Estado ──
  let monedas = MONEDAS_INICIO, vidas = VIDAS, marcador = 0, bajas = 0, ola = -1, cola: Clase[] = [], proximoNacer = 0, pausaHasta = 3, empezado = false, terminado = false, elegido: Tipo = 'ballesta';
  let vidasAlEmpezarOla = VIDAS, combo = 0, ultimaBaja = -9, mejorCombo = 0, adelantadas = 0, puntosAdelanto = 0, perfectas = 0, velocidad = 1;
  const desglose = { bajas: 0, oleadas: 0, combos: 0 };
  const terminar = (gano: boolean) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    // Al ganar suman las vidas que quedan y las monedas que no gastaste (guardar es arriesgado: menos torres)
    const bonoVidas = gano ? 500 + vidas * 30 : 0, bonoMonedas = gano ? Math.min(TOPE_MONEDAS, monedas * PUNTOS_POR_MONEDA) : 0;
    marcador += bonoVidas + bonoMonedas;
    c.alTerminar({
      puntaje: marcador,
      lineas: [
        ['Resultado', gano ? '¡Defendiste el castillo!' : `Caíste en la oleada ${ola + 1}`],
        ['Babosas derrotadas', `${bajas} (${desglose.bajas} pts)`],
        ['Oleadas', `${desglose.oleadas} pts${perfectas ? ` · ${perfectas} perfectas` : ''}`],
        ['Combos', `${desglose.combos} pts (mejor ×${mejorCombo})`],
        ['Oleadas adelantadas', `${adelantadas} (${puntosAdelanto} pts)`],
        ['Vidas del castillo', `${Math.max(0, vidas)}${gano ? ` (+${bonoVidas})` : ''}`],
        ['Monedas sin usar', gano ? `${monedas} (+${bonoMonedas})` : `${monedas} (solo suman si ganas)`],
      ],
      detalle: { oleada: ola + 1, bajas, vidas: Math.max(0, vidas), gano, monedas },
    });
  };
  const siguienteOleada = (apurada: boolean) => {
    if (apurada) {
      // Adelantar es arriesgado: da monedas y puntos por el tiempo que te saltaste
      const quedaba = Math.max(0, pausaHasta - reloj), extra = Math.round(quedaba * 3), pts = Math.round(quedaba * 8);
      if (extra) { monedas += extra; marcador += pts; puntosAdelanto += pts; adelantadas++; e.hud.aviso(`¡Al ataque! +${extra} 🪙 +${pts} pts`, 'oro', 1.1); }
    }
    ola++;
    cola = oleada(ola);
    vidasAlEmpezarOla = vidas;
    proximoNacer = reloj + 0.4;
    pausaHasta = Infinity;
    if (!apurada) e.hud.aviso(ola === OLEADAS - 1 ? '¡Oleada final: el Rey Babosa!' : `Oleada ${ola + 1}`, 'oro', 1.4);
    e.sonido.efecto('campana', 0.4);
  };

  // ── Barra de torres (teclas 1 a 4), velocidad y botón para adelantar la oleada ──
  const barra = document.createElement('div');
  barra.className = 'defensa-barra';
  const botones = (Object.keys(TORRES) as Tipo[]).map((tipo) => {
    const b = document.createElement('button');
    b.className = 'boton';
    b.title = TORRES[tipo].idea;
    b.innerHTML = `<b>${TORRES[tipo].tecla}</b> ${TORRES[tipo].nombre} <small>${TORRES[tipo].costo} 🪙</small>`;
    b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); elegido = tipo; seleccion = null; });
    barra.appendChild(b);
    return { tipo, b };
  });
  const rapido = document.createElement('button');
  rapido.className = 'boton';
  rapido.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); velocidad = velocidad === 1 ? 2 : 1; });
  barra.appendChild(rapido);
  c.caja.appendChild(barra);
  const ya = document.createElement('button');
  ya.className = 'boton mando-accion';
  ya.textContent = '¡Oleada!';
  let pideOleada = false;
  ya.addEventListener('pointerdown', (ev) => { ev.preventDefault(); pideOleada = true; });
  c.caja.appendChild(ya);

  // Panel de la torre elegida: mejorar, vender y a quién apunta
  let seleccion: Torre | null = null;
  const panel = document.createElement('div');
  Object.assign(panel.style, { position: 'absolute', left: '10px', top: '64px', display: 'none', flexDirection: 'column', gap: '6px', padding: '8px 10px', borderRadius: '12px', background: 'rgba(20,32,58,.88)', color: '#f3ecdc', font: '700 13px Nunito, sans-serif', zIndex: '3', minWidth: '170px' });
  const titulo = document.createElement('div');
  const accion = (texto: string, f: () => void) => { const b = document.createElement('button'); b.className = 'boton'; Object.assign(b.style, { padding: '6px 10px', fontSize: '.85rem' }); b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); f(); }); b.textContent = texto; return b; };
  const bMejorar = accion('', () => mejorar()), bVender = accion('', () => vender()), bApunta = accion('', () => cambiarPrioridad());
  panel.append(titulo, bMejorar, bVender, bApunta);
  c.caja.appendChild(panel);
  const NOMBRE_PRIORIDAD: Record<Prioridad, string> = { primera: 'la primera', fuerte: 'la más fuerte', ultima: 'la última' };
  const pintarPanel = () => {
    panel.style.display = seleccion && !terminado ? 'flex' : 'none';
    if (!seleccion) return;
    const t = seleccion;
    titulo.textContent = `${TORRES[t.tipo].nombre} · nivel ${t.nivel}`;
    bMejorar.textContent = t.nivel >= 3 ? 'Nivel máximo' : `⬆ Mejorar (U) · ${mejora(t)} 🪙`;
    bMejorar.disabled = t.nivel >= 3 || monedas < mejora(t);
    bVender.textContent = `💰 Vender (V) · +${venta(t)} 🪙`;
    bApunta.textContent = `🎯 Apunta a ${NOMBRE_PRIORIDAD[t.prioridad]} (T)`;
  };
  const mejorar = () => {
    const t = seleccion;
    if (!t || t.nivel >= 3) return;
    const costo = mejora(t);
    if (monedas < costo) { e.hud.aviso(`Faltan ${costo - monedas} 🪙`, 'mal', 0.8); e.sonido.mal(); return; }
    monedas -= costo; t.invertido += costo; t.nivel++;
    const estrella = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffd23c' }));
    estrella.position.set((t.nivel - 2.5) * 0.3, 0, 0.62); t.estrellas.add(estrella);
    t.malla.scale.setScalar(1 + (t.nivel - 1) * 0.12);
    t.cabeza.traverse((x) => { const m = (x as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && 'emissive' in m && m.emissive) m.emissiveIntensity = 0.6 + t.nivel * 0.25; });
    e.chispas(t.x, 1.2, t.z, ['#ffd23c', '#ffffff'], 20, 5); e.sonido.bien();
  };
  const vender = () => {
    const t = seleccion;
    if (!t) return;
    monedas += venta(t);
    e.escena.remove(t.malla); torres.delete(`${t.cx},${t.cz}`);
    e.flotante(`+${venta(t)} 🪙`, t.x, 1.2, t.z, 'oro'); e.sonido.efecto('madera', 0.5);
    seleccion = null;
  };
  const cambiarPrioridad = () => { if (seleccion) seleccion.prioridad = seleccion.prioridad === 'primera' ? 'fuerte' : seleccion.prioridad === 'fuerte' ? 'ultima' : 'primera'; };
  e.escuchar(window, 'keydown', (ev) => {
    const t = (Object.keys(TORRES) as Tipo[]).find((k) => TORRES[k].tecla === ev.key);
    if (t) { elegido = t; seleccion = null; }
    const k = ev.key.toLowerCase();
    if (k === 'u') mejorar(); else if (k === 'v') vender(); else if (k === 't') cambiarPrioridad(); else if (k === 'f') velocidad = velocidad === 1 ? 2 : 1; else if (k === 'escape') seleccion = null;
    if (ev.key === ' ') { pideOleada = true; ev.preventDefault(); }
  });

  // Fantasma de la torre bajo el mouse con su alcance, y anillo de la torre elegida
  const anillo = () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; e.escena.add(m); return m; };
  const fantasma = anillo(), marcaSeleccion = anillo();
  (marcaSeleccion.material as THREE.MeshBasicMaterial).color.set('#ffd23c');
  let bajo: [number, number] | null = null;
  const libre = (cx: number, cz: number) => cx >= 0 && cz >= 0 && cx < COLS && cz < FILAS && !camino.has(`${cx},${cz}`) && !torres.has(`${cx},${cz}`);
  const construir = (tipo: Tipo, cx: number, cz: number) => {
    const costo = TORRES[tipo].costo;
    if (!libre(cx, cz)) return false;
    if (monedas < costo) { e.hud.aviso(`Faltan ${costo - monedas} 🪙`, 'mal', 0.8); e.sonido.mal(); return false; }
    monedas -= costo;
    torres.set(`${cx},${cz}`, armarTorre(tipo, cx, cz));
    e.sonido.efecto('madera', 0.6);
    return true;
  };
  e.escuchar(e.lienzo, 'pointermove', (ev) => { const p = e.enSuelo(ev); bajo = p ? celda(p.x, p.z) : null; });
  e.escuchar(e.lienzo, 'pointerleave', () => { bajo = null; });
  e.escuchar(e.lienzo, 'pointerdown', (ev) => {
    if (!empezado || terminado) return;
    const p = e.enSuelo(ev);
    if (!p) return;
    const [cx, cz] = celda(p.x, p.z), hay = torres.get(`${cx},${cz}`);
    // Tocar una torre la elige (antes la mejoraba de una, y se gastaban monedas sin querer); tocar pasto construye
    if (hay) { seleccion = seleccion === hay ? null : hay; return; }
    seleccion = null;
    construir(elegido, cx, cz);
  });

  // ── Pilotos de prueba (solo en desarrollo): "?piloto=1" juega razonable y "?piloto=flojo" con pocas ballestas ──
  const parametros = new URLSearchParams(location.search), piloto = import.meta.env.DEV ? parametros.get('piloto') : null;
  const aceleracion = import.meta.env.DEV ? Math.max(1, Number(parametros.get('rapido')) || 1) : 1;
  const cobertura = (cx: number, cz: number, radio: number) => { const p = centro(cx, cz); let n2 = 0; for (let d = 0; d < LARGO; d += 0.5) { const q = enCamino(d); if (Math.hypot(q.x - p.x, q.z - p.z) <= radio) n2++; } return n2; };
  const mejoresCeldas: [number, number][] = [];
  if (piloto) { for (let cz = 0; cz < FILAS; cz++) for (let cx = 0; cx < COLS; cx++) if (libre(cx, cz)) mejoresCeldas.push([cx, cz]); mejoresCeldas.sort((a, b) => cobertura(b[0], b[1], 3.2) - cobertura(a[0], a[1], 3.2)); }
  const PLAN: Tipo[] = ['ballesta', 'ballesta', 'hielo', 'mortero', 'ballesta', 'rayo', 'mortero', 'hielo', 'rayo', 'ballesta', 'mortero', 'rayo'];
  let pilotoEn = 0;
  const pilotear = () => {
    if (!piloto || reloj < pilotoEn) return;
    pilotoEn = reloj + 0.5;
    if (piloto === 'flojo') { if (torres.size < 4) { const lugar = mejoresCeldas.find(([x, z]) => libre(x, z)); if (lugar && monedas >= 50) construir('ballesta', ...lugar); } return; }
    const siguiente = PLAN[torres.size];
    const lugar = mejoresCeldas.find(([x, z]) => libre(x, z));
    if (siguiente && lugar && monedas >= TORRES[siguiente].costo) { construir(siguiente, ...lugar); return; }
    if (siguiente && torres.size < 6) return;
    const barata = [...torres.values()].filter((t) => t.nivel < 3).sort((a, b) => mejora(a) - mejora(b))[0];
    if (barata && monedas >= mejora(barata)) { seleccion = barata; mejorar(); seleccion = null; }
  };
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__defensa = () => ({ ola: ola + 1, vidas, monedas, marcador, bajas, torres: torres.size, terminado });

  // ── Simulación (corre en pasos; con ⏩ dos por cuadro) ──
  const golpear = (b: Babosa, dano: number, tipo: Tipo) => {
    if (!b.viva) return;
    dano *= DEBILIDAD[b.clase]?.[tipo] ?? 1;
    // El escudo recibe el golpe primero; el rayo y el mortero lo rompen mejor
    if (b.escudo > 0) {
      const contra = dano * (tipo === 'rayo' ? 1.8 : tipo === 'mortero' ? 1.4 : 0.8);
      b.escudo -= contra;
      if (b.escudo > 0) return;
      dano = -b.escudo / (contra / dano); b.escudo = 0;
      const p = enCamino(b.d); e.chispas(p.x, 0.9, p.z, ['#7fc8ff', '#ffffff'], 16, 4); e.sonido.tono(900, 0.12, { tipo: 'triangle', vol: 0.08, hasta: 300 });
    }
    b.vida -= dano;
    if (b.clase === 'jefe' && !b.furia && b.vida < b.max / 2 && b.vida > 0) {
      // El Rey Babosa se enfurece: más rápido y llama crías
      b.furia = true; e.hud.aviso('¡El Rey Babosa se enfurece!', 'mal', 1.6); e.temblar(0.6); e.sonido.mal();
      for (let i = 0; i < 4; i++) nacer('cria', ola, Math.max(0, b.d - 0.4 - i * 0.35));
    }
    if (b.vida > 0) return;
    b.viva = false; e.escena.remove(b.malla);
    const datos = BABOSAS[b.clase], p = enCamino(b.d);
    // Las monedas por baja bajan con las oleadas (al final cuesta más juntar)
    const gana = Math.max(1, Math.round(datos.monedas * (1 - Math.min(0.35, ola * 0.04))));
    monedas += gana; marcador += datos.puntos; desglose.bajas += datos.puntos; bajas++;
    combo = reloj - ultimaBaja < 1.5 ? combo + 1 : 1; ultimaBaja = reloj; mejorCombo = Math.max(mejorCombo, combo);
    if (combo >= 3) { const extra = Math.min(20, combo * 2); marcador += extra; desglose.combos += extra; if (combo % 5 === 0) e.hud.aviso(`¡Combo ×${combo}!`, 'oro', 0.8); }
    if (b.clase === 'madre') for (let i = 0; i < 3; i++) nacer('cria', ola, Math.max(0, b.d - i * 0.35));
    e.chispas(p.x, 0.6, p.z, [datos.color, '#ffffff', '#ffd23c'], b.clase === 'jefe' ? 60 : 14, b.clase === 'jefe' ? 8 : 4);
    e.flotante(`+${gana} 🪙`, p.x, 1.4, p.z, 'oro');
    e.sonido.tono(b.clase === 'jefe' ? 200 : 520, 0.12, { tipo: 'sine', vol: 0.12, hasta: b.clase === 'jefe' ? 80 : 900 });
    if (b.clase === 'jefe') e.temblar(1);
  };
  const objetivo = (tr: Torre) => {
    let mejor: Babosa | null = null;
    for (const b of babosas) {
      if (!b.viva) continue;
      const p = enCamino(b.d);
      if (Math.hypot(p.x - tr.x, p.z - tr.z) > alcance(tr)) continue;
      if (!mejor || (tr.prioridad === 'primera' ? b.d > mejor.d : tr.prioridad === 'ultima' ? b.d < mejor.d : b.vida + b.escudo > mejor.vida + mejor.escudo)) mejor = b;
    }
    return mejor;
  };
  const simular = (paso: number) => {
    reloj += paso;
    pilotear();
    // Oleadas: una pausa para construir y después salen seguidas (más rápido al final)
    if (pausaHasta !== Infinity && (reloj >= pausaHasta || pideOleada)) siguienteOleada(pideOleada && reloj < pausaHasta);
    pideOleada = false;
    if (cola.length && reloj >= proximoNacer) { nacer(cola.shift()!, ola); proximoNacer = reloj + Math.max(0.45, 0.8 - ola * 0.04); }
    // Babosas: avanzan, las curanderas curan a las cercanas, y las que llegan dañan el castillo
    for (const b of babosas) {
      if (!b.viva) continue;
      b.d += velocidadDe(b) * paso;
      if (b.clase === 'curandera' && reloj > b.cura) {
        b.cura = reloj + 1;
        const yo2 = enCamino(b.d);
        for (const o2 of babosas) { if (!o2.viva || o2 === b) continue; const p = enCamino(o2.d); if (Math.hypot(p.x - yo2.x, p.z - yo2.z) < 1.8 && o2.vida < o2.max) { o2.vida = Math.min(o2.max, o2.vida + o2.max * 0.05); e.chispas(p.x, 1, p.z, ['#7dff9a', '#ffffff'], 3, 1.5); } }
      }
      if (b.d >= LARGO) {
        b.viva = false; e.escena.remove(b.malla);
        const dano = BABOSAS[b.clase].dano;
        vidas -= dano;
        golpeCastillo = 0.6;
        e.temblar(dano > 2 ? 0.8 : 0.3); e.sonido.mal();
        e.chispas(castillo.position.x, 1.4, castillo.position.z, ['#c9c0b0', '#8a8278', '#ffffff'], 10 + dano * 3, 4);
        e.flotante(`-${dano} ❤`, fin.x, 2, fin.z, 'mal');
        if (vidas <= 0) return terminar(false);
      }
    }
    // Torres: cada una apunta según su prioridad
    for (const tr of torres.values()) {
      if (reloj < tr.recarga) continue;
      const b = objetivo(tr);
      if (!b) continue;
      disparar(tr, b);
      tr.recarga = reloj + TORRES[tr.tipo].cada / (1 + (tr.nivel - 1) * 0.18);
    }
    // Balas: las de ballesta y hielo siguen a su blanco (si muere, buscan otra cerca); las del mortero caen en arco
    for (let i = tiros.length - 1; i >= 0; i--) {
      const s = tiros[i];
      s.t += paso;
      if (s.blanco && !s.blanco.viva) {
        let otra: Babosa | null = null, dmin = 2;
        for (const b of babosas) { if (!b.viva) continue; const p = enCamino(b.d), dd = Math.hypot(p.x - s.x, p.z - s.z); if (dd < dmin) { dmin = dd; otra = b; } }
        s.blanco = otra;
        if (!otra) { e.escena.remove(s.malla); tiros.splice(i, 1); continue; }
      }
      if (s.blanco) { const p = enCamino(s.blanco.d); s.hacia = { x: p.x, z: p.z }; }
      const f = Math.min(1, s.t / s.dura);
      s.x = s.desde.x + (s.hacia.x - s.desde.x) * f; s.z = s.desde.z + (s.hacia.z - s.desde.z) * f;
      s.y = s.tipo === 'mortero' ? 1.1 + Math.sin(f * Math.PI) * 3 : 1.1 - f * 0.5;
      s.malla.position.set(s.x, s.y, s.z);
      if (f < 1) continue;
      e.escena.remove(s.malla); tiros.splice(i, 1);
      if (s.tipo === 'mortero') {
        const area = 1.3 + (s.nivel - 1) * 0.2;
        e.chispas(s.x, 0.3, s.z, ['#ff9a2e', '#ffd23c', '#3a3a44'], 22 + s.nivel * 6, 5); e.temblar(0.15); e.sonido.ruido(0.25, 0.18);
        for (const b of babosas) { const p = enCamino(b.d); if (b.viva && Math.hypot(p.x - s.x, p.z - s.z) < area) golpear(b, s.dano, 'mortero'); }
      } else if (s.blanco) {
        if (s.tipo === 'hielo') { s.blanco.lento = reloj + 2.2; s.blanco.lentoFactor = Math.min(s.blanco.lento > reloj && s.blanco.lentoFactor ? s.blanco.lentoFactor : 1, 0.45 - (s.nivel - 1) * 0.08); }
        golpear(s.blanco, s.dano, s.tipo);
      }
    }
    // ¿Oleada terminada?
    if (pausaHasta === Infinity && !cola.length && babosas.every((b) => !b.viva)) {
      for (const b of babosas) e.escena.remove(b.malla);
      babosas.length = 0;
      const perfecta = vidas === vidasAlEmpezarOla, pts = 100 + (perfecta ? 50 : 0), oro = 15 + ola * 3;
      marcador += pts; desglose.oleadas += pts; monedas += oro; if (perfecta) perfectas++;
      e.sonido.bien();
      e.chispas(fin.x, 2.5, fin.z, ['#ffd23c', '#3f8cff', '#ffffff', '#ef5565'], 40, 6);
      if (ola >= OLEADAS - 1) return terminar(true);
      pausaHasta = reloj + PAUSA;
      e.hud.aviso(`¡Oleada ${ola + 1} superada!${perfecta ? ' Perfecta' : ''} +${pts} pts +${oro} 🪙`, 'oro', 1.6);
    }
  };

  const resumen = (lista: Clase[]) => {
    const cuenta = new Map<Clase, number>();
    for (const k of lista) cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
    return [...cuenta].filter(([k]) => BABOSAS[k].icono).map(([k, n2]) => `${BABOSAS[k].icono}${n2}`).join(' ');
  };
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    portal.rotation.z += dt * 2;
    if (Math.floor(t * 6) !== Math.floor((t - dt) * 6)) e.chispas(portal.position.x, portal.position.y, portal.position.z, ['#b46cff', '#e0c3ff'], 2, 1.2);
    for (const nube of nubes) { nube.position.x += dt * 0.6; if (nube.position.x > AN / 2 + 5) nube.position.x = -AN / 2 - 5; }
    bandera.rotation.y = Math.sin(t * 3) * 0.3;
    golpeCastillo = Math.max(0, golpeCastillo - dt * 2);
    castillo.rotation.z = Math.sin(t * 40) * 0.05 * golpeCastillo;
    for (const { tipo, b } of botones) { b.classList.toggle('activo', tipo === elegido && !seleccion); b.classList.toggle('caro', monedas < TORRES[tipo].costo); }
    rapido.textContent = velocidad === 1 ? '⏩ x2 (F)' : '▶ x1 (F)';
    rapido.classList.toggle('activo', velocidad > 1);
    ya.style.visibility = empezado && !terminado && pausaHasta !== Infinity ? 'visible' : 'hidden';
    if (seleccion && !torres.has(`${seleccion.cx},${seleccion.cz}`)) seleccion = null;
    pintarPanel();
    // Fantasma: blanco si se puede construir (rojo si faltan monedas), oculto en el camino y sobre torres
    fantasma.visible = !!bajo && !seleccion && libre(...bajo);
    if (bajo && fantasma.visible) {
      const p = centro(...bajo);
      fantasma.position.set(p.x, 0.06, p.z); fantasma.scale.setScalar(TORRES[elegido].alcance);
      (fantasma.material as THREE.MeshBasicMaterial).color.set(monedas >= TORRES[elegido].costo ? '#ffffff' : '#ff6a6a');
    }
    marcaSeleccion.visible = !!seleccion;
    if (seleccion) { marcaSeleccion.position.set(seleccion.x, 0.07, seleccion.z); marcaSeleccion.scale.setScalar(alcance(seleccion)); }
    for (const tr of torres.values()) if (tr.tipo === 'hielo' || tr.tipo === 'rayo') tr.cabeza.rotation.y += dt * (tr.tipo === 'rayo' ? 2.5 : 1.5);
    for (let i = rayos.length - 1; i >= 0; i--) if (reloj > rayos[i].hasta) { e.escena.remove(rayos[i].linea); rayos[i].linea.geometry.dispose(); rayos.splice(i, 1); }
    if (empezado && !terminado) {
      const paso = Math.min(dt, 0.05);
      for (let k = 0; k < velocidad * aceleracion && !terminado; k++) simular(paso);
    }
    // Dibujo de las babosas
    for (const b of babosas) {
      if (!b.viva) continue;
      const p = enCamino(b.d), brinco = Math.abs(Math.sin(t * 7 * (b.furia ? 1.8 : 1) + b.salto));
      b.malla.position.set(p.x, brinco * 0.15, p.z);
      b.malla.rotation.y = p.ang;
      b.cuerpo.scale.set(1 + brinco * 0.12, 0.75 - brinco * 0.1, 1.1);
      b.cuerpo.material = b.lento > reloj ? hieloMat : b.piel;
      b.barra.scale.x = Math.max(0.01, b.vida / b.max); b.barra.position.x = -(1 - b.barra.scale.x) / 2;
      b.barra.lookAt(e.camara.position);
      if (b.barraEscudo && b.burbuja) {
        const f = b.escudoMax ? b.escudo / b.escudoMax : 0;
        b.barraEscudo.visible = b.burbuja.visible = f > 0;
        b.barraEscudo.scale.x = Math.max(0.01, f); b.barraEscudo.position.x = -(1 - b.barraEscudo.scale.x) / 2; b.barraEscudo.lookAt(e.camara.position);
      }
    }
    if (terminado) return;
    const espera = pausaHasta !== Infinity ? ` · sigue en ${Math.max(0, Math.ceil(pausaHasta - reloj))} · próxima: ${resumen(oleada(ola + 1))}` : '';
    e.hud.tiempo(`❤ ${Math.max(0, vidas)}`);
    e.hud.extra(`Oleada ${Math.max(1, ola + 1)}/${OLEADAS} · ${monedas} 🪙${espera}`);
    e.hud.puntos(marcador);
  });

  e.hud.tiempo(`❤ ${VIDAS}`);
  e.hud.extra(`Pon torres en el pasto · ${monedas} 🪙 · próxima: ${resumen(oleada(0))}`);
  return { empezar() { e.empezar(); empezado = true; }, destruir: e.destruir };
}
