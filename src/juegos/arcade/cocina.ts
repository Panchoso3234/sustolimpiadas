import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario, limitar, mmss, sombra } from '../reflejos/motor';
import { decidir, rumbo } from './cocinaPiloto';
import { CAJONES, COCINA, EMOJI, LISTO, PASOS, RECETAS, SE_PICA, TOMATES_SOPA, calza, enPunta, pago, type Cosa, type Ingrediente, type Receta } from './cocinaRecetas';

// Cocina Caótica: llegan clientes al comedor con su pedido y un tiempo límite. Tomas ingredientes de los cajones, los
// picas en la tabla, la carne se asa en la plancha (¡se quema y hasta se prende fuego si la olvidas!), la sopa hierve
// en la olla, armas el plato y lo entregas en la ventanilla. Entregar rápido deja propina y entregar seguido arma
// combos; en la hora punta llegan más pedidos y pagan más. Un turno de tres minutos y medio.

const COLS = COCINA[0].length, FILAS = COCINA.length, CELDA = 1.3, AN = COLS * CELDA, FO = FILAS * CELDA, DURA = 210;
const PICAR = 1.2, COCER = 4.5, QUEMAR = 9.5, FUEGO = 4, APAGAR = 1.1, SOPA = 7, SOPA_QUEMA = 25, ALCANCE = 1.5;
const VEL = 4.8, ACEL = 14, FRENO = 16, IMPULSO = 11, R = 0.36, ALTO_MANO = 0.74;
const centro = (cx: number, cz: number) => ({ x: -AN / 2 + (cx + 0.5) * CELDA, z: -FO / 2 + (cz + 0.5) * CELDA });
const celda = (x: number, z: number): [number, number] => [Math.floor((x + AN / 2) / CELDA), Math.floor((z + FO / 2) / CELDA)];

/** Lo que hay sobre un mesón, una tabla, la plancha o la olla: una cosa suelta o un plato con cosas. */
interface Encima { cosa?: Cosa; plato?: Cosa[] }
interface Estacion {
  tipo: string; cx: number; cz: number; x: number; z: number; encima: Encima; malla: THREE.Group | null;
  /** Segundos que lleva prendida (0: sin fuego), cuánto se ha apagado y desde cuándo está quemada la carne. */
  fuego: number; apagar: number; humeando: number; ui: HTMLElement | null;
}
interface Cliente { g: THREE.Group; x: number; z: number; ir: { x: number; z: number }; asiento: number; sale: boolean; burbuja: THREE.Sprite }
interface Pedido { receta: Receta; desde: number; dura: number; tarjeta: HTMLElement; marcas: string; cliente: Cliente }
interface Particula { m: THREE.Mesh; vy: number; crece: number; vida: number; total: number }

/** Un dibujo en un lienzo convertido en textura (pisos, maderas, carteles). */
function lienzo(ancho: number, alto: number, pintar: (g: CanvasRenderingContext2D) => void, repetir?: [number, number]) {
  const cv = document.createElement('canvas'); cv.width = ancho; cv.height = alto;
  pintar(cv.getContext('2d')!);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  if (repetir) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...repetir); }
  return tex;
}
const FUENTE_EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const texturasCartel = new Map<string, THREE.Texture>();
/** Cartel con un emoji (o texto corto), siempre de frente a la cámara. */
function cartel(texto: string, fondo = '#fff6dc', tam = 0.9) {
  const clave = `${texto}|${fondo}`;
  let tex = texturasCartel.get(clave);
  if (!tex) {
    tex = lienzo(128, 128, (g) => {
      if (fondo !== 'none') { g.fillStyle = fondo; g.beginPath(); g.roundRect(8, 8, 112, 112, 28); g.fill(); g.lineWidth = 7; g.strokeStyle = '#5a3a22'; g.stroke(); }
      g.font = `72px ${FUENTE_EMOJI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(texto, 64, 70);
    });
    texturasCartel.set(clave, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(tam, tam, 1);
  return s;
}

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: AN + 8, alto: FO * Math.sin(1.08) + 3.4, centro: [0, 0, 0.5], inclinacion: 1.08, sinPlaya: true });
  e.escena.background = new THREE.Color('#3b2a3a');
  const mando = crearMando(e, c.caja, 'Tomar / Dejar', 'Impulso');
  const botonAccion = c.caja.querySelector<HTMLElement>('.mando-accion:not(.segunda)');
  // Los pedidos salen de su propio generador: así en un duelo los dos reciben los mismos aunque jueguen distinto
  const azarPedidos = generador(`${c.semilla}|cocina`), apuro = 1 + (c.nivel - 1) * 0.08;
  const parametros = new URLSearchParams(location.search), piloto = import.meta.env.DEV && parametros.has('piloto');
  const aceleracion = import.meta.env.DEV ? Math.max(1, Number(parametros.get('rapido')) || 1) : 1;

  // Luz cálida de restaurante
  for (const [x, z] of [[-AN / 4, 1], [AN / 4, 1]]) { const l = new THREE.PointLight('#ffc98a', 14, 0, 1.6); l.position.set(x, 5, z); e.escena.add(l); }

  // ── El piso: cerámica a cuadros en la cocina, tablas de madera en el comedor y la despensa ──
  const texPiso = lienzo(128, 128, (g) => {
    g.fillStyle = '#d9cdb2'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) { g.fillStyle = (i + k) % 2 ? '#f3ecdb' : '#5b9aa8'; g.fillRect(i * 64 + 2, k * 64 + 2, 60, 60); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(i * 64 + 6, k * 64 + 6, 24, 6); }
  }, [COLS / 2, FILAS / 2]);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(AN, FO), new THREE.MeshLambertMaterial({ map: texPiso }));
  piso.rotation.x = -Math.PI / 2; e.escena.add(piso);
  const texTablas = lienzo(64, 128, (g) => {
    for (let i = 0; i < 4; i++) { g.fillStyle = ['#a8703f', '#9a6436', '#b07a48', '#94603a'][i]; g.fillRect(i * 16, 0, 16, 128); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(i * 16, 0, 1.5, 128); g.fillRect(i * 16, (i * 37) % 128, 16, 1.5); }
  }, [3, 6]);
  for (const lado of [-1, 1]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(4.5, FO + 6), new THREE.MeshLambertMaterial({ map: texTablas })); t.rotation.x = -Math.PI / 2; t.position.set(lado * (AN / 2 + 2.25), -0.01, 1.5); e.escena.add(t); }

  // ── Mesones: mueble de madera con puertas y cubierta de mármol (acero en la plancha y la olla) ──
  const texMueble = lienzo(64, 64, (g) => {
    g.fillStyle = '#8a5634'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#9c6640'; g.fillRect(5, 8, 54, 50);
    g.strokeStyle = '#5e3820'; g.lineWidth = 2; g.strokeRect(5, 8, 54, 50); g.fillStyle = '#e8c070'; g.fillRect(28, 14, 8, 3);
  });
  const texMarmol = lienzo(64, 64, (g) => {
    g.fillStyle = '#f1ebdd'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(120,110,100,${0.08 + (i % 5) * 0.03})`; g.fillRect((i * 37) % 64, (i * 23) % 64, 2, 2); }
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0, 0, 64, 3);
  });
  const estaciones: Estacion[] = [];
  const mesones = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA * 0.98, 0.9, CELDA * 0.98), new THREE.MeshLambertMaterial({ map: texMueble }), COLS * FILAS);
  const cubiertas = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA, 0.08, CELDA), new THREE.MeshLambertMaterial({ map: texMarmol }), COLS * FILAS);
  const o = new THREE.Object3D(), tono = new THREE.Color();
  let n = 0;
  COCINA.forEach((fila, cz) => [...fila].forEach((t, cx) => {
    if (t === '.') return;
    const p = centro(cx, cz);
    o.position.set(p.x, 0.45, p.z); o.updateMatrix(); mesones.setMatrixAt(n, o.matrix); mesones.setColorAt(n, tono.set(t === 'E' ? '#9fe0b0' : t === 'X' ? '#8a8a96' : '#ffffff'));
    o.position.set(p.x, 0.94, p.z); o.updateMatrix(); cubiertas.setMatrixAt(n, o.matrix); cubiertas.setColorAt(n++, tono.set(t === 'F' || t === 'O' ? '#7a7f8c' : t === 'E' ? '#bff0cc' : CAJONES[t] ? '#c9a27a' : '#ffffff'));
    estaciones.push({ tipo: t, cx, cz, x: p.x, z: p.z, encima: {}, malla: null, fuego: 0, apagar: 0, humeando: 0, ui: null });
  }));
  mesones.count = cubiertas.count = n;
  e.escena.add(mesones, cubiertas);
  const de = (t: string) => estaciones.filter((s) => s.tipo === t);

  // ── Paredes: azulejos, ventanas con cortinas, repisas con frascos, ollas colgadas y apliques de luz ──
  const texAzulejo = lienzo(64, 64, (g) => {
    g.fillStyle = '#c9c2b4'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { g.fillStyle = (i + k) % 5 ? '#f6f2e8' : '#8fd0de'; g.fillRect(i * 16 + 1, k * 16 + 1, 14, 14); }
  }, [AN / 1.2, 2.5]);
  const pared = new THREE.Mesh(new THREE.BoxGeometry(AN + 9.6, 3.2, 0.3), new THREE.MeshLambertMaterial({ map: texAzulejo }));
  pared.position.set(0, 1.6, -FO / 2 - 0.15); e.escena.add(pared);
  const zocalo = new THREE.Mesh(new THREE.BoxGeometry(AN + 9.6, 0.5, 0.32), mat('#6a3f2a')); zocalo.position.set(0, 0.25, -FO / 2 - 0.15); e.escena.add(zocalo);
  const cielo = new THREE.MeshBasicMaterial({ color: '#a9e4ff' }), cortina = mat('#d9443a');
  for (const x of [-AN / 3, 3.5]) {
    const marco = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.3, 0.06), mat('#7a4a2a')); marco.position.set(x, 2.3, -FO / 2 + 0.01);
    const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 1.05), cielo); vidrio.position.set(x, 2.3, -FO / 2 + 0.05);
    const cruz = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.03), mat('#7a4a2a')); cruz.position.set(x, 2.3, -FO / 2 + 0.07);
    e.escena.add(marco, vidrio, cruz);
    for (const lado of [-1, 1]) { const tela = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.4, 0.04), cortina); tela.position.set(x + lado * 1.12, 2.3, -FO / 2 + 0.1); e.escena.add(tela); }
  }
  // Repisa con frascos de colores sobre la plancha y la tabla
  const repisa = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.36), mat('#7a4a2a')); repisa.position.set(AN / 2 - 2.2, 2.05, -FO / 2 + 0.2); e.escena.add(repisa);
  const frascoG = new THREE.CylinderGeometry(0.1, 0.1, 0.26, 10);
  ['#e8423a', '#f2c94c', '#6cc04a', '#c26a5a', '#f3ecdb', '#e07a2a', '#8fd0de'].forEach((col, i) => { const f = new THREE.Mesh(frascoG, mat(col)); f.position.set(AN / 2 - 3.5 + i * 0.42, 2.22, -FO / 2 + 0.2); const tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 10), mat('#5a5a66')); tapa.position.set(f.position.x, 2.37, f.position.z); e.escena.add(f, tapa); });
  for (let i = 0; i < 4; i++) {
    const olla = new THREE.Mesh(new THREE.CylinderGeometry(0.28 - i * 0.03, 0.28 - i * 0.03, 0.06, 16), new THREE.MeshStandardMaterial({ color: i % 2 ? '#c9ccd6' : '#b87333', metalness: 0.6, roughness: 0.35 }));
    olla.rotation.x = Math.PI / 2; olla.position.set(-0.9 + i * 0.75, 2.25 - i * 0.04, -FO / 2 + 0.05);
    const mango = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.04), mat('#2a2a33')); mango.position.set(-0.9 + i * 0.75, 2.65 - i * 0.04, -FO / 2 + 0.05);
    e.escena.add(olla, mango);
  }
  const focos: THREE.MeshStandardMaterial[] = [];
  for (const x of [-AN / 2 + 1, -1.9, 1.9, AN / 2 - 0.6]) {
    const pantalla = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.24, 14, 1, true), mat('#2f5d50')); pantalla.position.set(x, 2.95, -FO / 2 + 0.25);
    const foco = new THREE.MeshStandardMaterial({ color: '#fff2c4', emissive: '#ffcf70', emissiveIntensity: 1.2 }); focos.push(foco);
    const bombilla = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), foco); bombilla.position.set(x, 2.84, -FO / 2 + 0.25);
    e.escena.add(pantalla, bombilla);
  }
  // Muros bajos a los lados (dejan ver el comedor y la despensa)
  for (const lado of [-1, 1]) { const muro = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, FO + 0.6), new THREE.MeshLambertMaterial({ map: texAzulejo })); muro.position.set(lado * (AN / 2 + 0.15), 0.55, 0); e.escena.add(muro); }

  // Despensa a la izquierda: refrigerador, estante con sacos y cajas
  const DX = -AN / 2 - 2.2;
  const refri = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.3, 1.0), mat('#e8eef2')); refri.position.set(DX, 1.15, -FO / 2 + 0.8);
  const manija = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), mat('#7a7f8c')); manija.position.set(DX + 0.5, 1.5, -FO / 2 + 1.32);
  const linea = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, 0.02), mat('#9aa3ad')); linea.position.set(DX, 1.6, -FO / 2 + 1.31);
  e.escena.add(refri, manija, linea);
  for (const lado of [-1, 1]) { const costado = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.72), mat('#5e3820')); costado.position.set(DX + lado * 0.82, 0.95, 0.6); e.escena.add(costado); }
  for (let i = 0; i < 3; i++) { const estante = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.7), mat('#7a4a2a')); estante.position.set(DX, 0.4 + i * 0.6, 0.6); e.escena.add(estante); }
  const sacoG = new THREE.SphereGeometry(0.26, 10, 8);
  [[-0.45, 0.45, '#d9c39a'], [0.1, 0.45, '#cbb48a'], [0.5, 1.05, '#e0a85a'], [-0.3, 1.05, '#6cc04a'], [0.2, 1.65, '#e8423a'], [-0.45, 1.65, '#f2c94c']].forEach(([x, y, col]) => { const s = new THREE.Mesh(sacoG, mat(col as string)); s.scale.y = 0.75; s.position.set(DX + (x as number), (y as number) + 0.16, 0.6); e.escena.add(s); });
  for (let i = 0; i < 3; i++) { const caja = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.6), mat(i % 2 ? '#b07a48' : '#9a6436')); caja.position.set(DX + (i - 1) * 0.5, 0.25 + (i === 1 ? 0.5 : 0), 3.4); caja.rotation.y = i * 0.3; e.escena.add(caja); }

  // Comedor a la derecha: mesas redondas con manteles y sillas; los clientes llegan, esperan y se van
  const MX = AN / 2 + 2.1, ASIENTOS: { x: number; z: number }[] = [];
  for (const mz of [-3.2, -0.4, 2.4]) {
    const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.7, 8), mat('#3a2a22')); pata.position.set(MX, 0.35, mz);
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 18), mat('#f3ecdb')); mesa.position.set(MX, 0.72, mz);
    const mantel = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 0.18, 18, 1, true), mat('#d9443a')); mantel.position.set(MX, 0.64, mz);
    const vela = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8), new THREE.MeshBasicMaterial({ color: '#fff2c4' })); vela.position.set(MX, 0.83, mz);
    e.escena.add(pata, mesa, mantel, vela);
    for (const lado of [-1, 1]) { const silla = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), mat('#7a4a2a')); silla.position.set(MX + lado * 0.85, 0.42, mz); const respaldo = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.4), mat('#7a4a2a')); respaldo.position.set(MX + lado * 1.05, 0.7, mz); e.escena.add(silla, respaldo); ASIENTOS.push({ x: MX + lado * 0.85, z: mz }); }
  }
  const PUERTA = { x: MX, z: FO / 2 + 3 };

  // ── Ingredientes: enteros y picados (en trocitos), y sus colores al cocinarse ──
  const colorDe = (k: Cosa) => (k.estado === 'quemado' ? '#2a2a2a' : k.ing === 'carne' ? (k.estado === 'cocido' ? '#7a4a2a' : '#d9706a') : { lechuga: '#6cc04a', tomate: '#e8423a', pan: '#e0a85a', queso: '#f5cf4a', sopa: '#e0552f' }[k.ing]);
  const trozoG = new THREE.BoxGeometry(0.13, 0.08, 0.13), bolaG = new THREE.SphereGeometry(0.2, 12, 8), platoG = new THREE.CylinderGeometry(0.36, 0.28, 0.06, 18);
  const malla = (k: Cosa): THREE.Group => {
    const g = new THREE.Group(), m = mat(colorDe(k));
    if (k.ing === 'sopa') {
      const tazon = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.18, 14), mat('#f3ecdb')); tazon.position.y = 0.09;
      const caldo = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 14), m); caldo.position.y = 0.17; g.add(tazon, caldo);
    } else if (k.estado === 'picado' || (k.ing === 'carne' && k.estado !== 'crudo')) {
      if (k.ing === 'carne') { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 12), m); h.position.y = 0.05; g.add(h); }
      else for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(trozoG, m); t.position.set(Math.cos(i * 1.3) * 0.13, 0.04 + (i === 4 ? 0.06 : 0), Math.sin(i * 1.3) * 0.13); t.rotation.y = i; g.add(t); }
    } else if (k.ing === 'pan') {
      const abajo = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.08, 14), m); abajo.position.y = 0.04;
      const arriba = new THREE.Mesh(bolaG, mat('#d8963e')); arriba.scale.set(1.2, 0.55, 1.2); arriba.position.y = 0.12; g.add(abajo, arriba);
    } else if (k.ing === 'queso') { const q = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 3), m); q.position.y = 0.08; g.add(q); }
    else if (k.ing === 'carne') { const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.28), m); c2.position.y = 0.07; const grasa = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.03, 0.06), mat('#f5d6d0')); grasa.position.set(0, 0.1, 0.06); g.add(c2, grasa); }
    else if (k.ing === 'tomate') { const s = new THREE.Mesh(bolaG, m); s.position.y = 0.18; const tallo = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.06, 5), mat('#3f8a2a')); tallo.position.y = 0.38; g.add(s, tallo); }
    else { for (let i = 0; i < 3; i++) { const hoja = new THREE.Mesh(bolaG, mat(i ? '#7fd05a' : '#5aae3a')); hoja.scale.set(1.15 - i * 0.2, 0.7, 1.15 - i * 0.2); hoja.position.y = 0.14 + i * 0.06; g.add(hoja); } }
    return g;
  };
  const mallaPlato = (cosas: Cosa[]) => {
    const g = new THREE.Group(), plato = new THREE.Mesh(platoG, mat('#ffffff')), borde = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 20), mat('#8fd0de'));
    plato.position.y = 0.03; borde.rotation.x = Math.PI / 2; borde.position.y = 0.06; g.add(plato, borde);
    cosas.forEach((k, i) => { const m = malla(k); m.scale.setScalar(0.72); m.position.set(Math.cos(i * 2.1) * 0.12, 0.06 + i * 0.05, Math.sin(i * 2.1) * 0.12); g.add(m); });
    return g;
  };

  // ── Lo fijo de cada estación ──
  const cuchillos = new Map<Estacion, THREE.Group>(), planchas = new Map<Estacion, { brasa: THREE.MeshStandardMaterial; llamas: THREE.Mesh[] }>();
  let olla: { est: Estacion; caldo: THREE.Mesh; colorCaldo: THREE.MeshStandardMaterial; brasa: THREE.MeshStandardMaterial } | null = null;
  let campana: THREE.Group | null = null, tapa: THREE.Group | null = null, flecha: THREE.Mesh | null = null;
  const llamaG = new THREE.ConeGeometry(0.16, 0.5, 7), llamaM = [new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.9, depthWrite: false }), new THREE.MeshBasicMaterial({ color: '#ffd23c', transparent: true, opacity: 0.9, depthWrite: false })];
  for (const est of estaciones) {
    const ing = CAJONES[est.tipo];
    if (ing) {
      // Cajón de madera con listones, lleno de su ingrediente, y su cartel
      for (const lado of [-1, 1]) { const liston = new THREE.Mesh(new THREE.BoxGeometry(CELDA * 0.92, 0.24, 0.07), mat('#8a5a38')); liston.position.set(est.x, 1.08, est.z + lado * CELDA * 0.43); e.escena.add(liston); }
      for (const [dx, dz, s2] of [[-0.2, -0.12, 1], [0.2, -0.1, 0.95], [0, 0.16, 1.05], [-0.22, 0.2, 0.85], [0.24, 0.22, 0.9]]) { const m = malla({ ing, estado: 'crudo', avance: 0 }); m.scale.setScalar(s2 * 0.85); m.position.set(est.x + dx, 0.98, est.z + dz); m.rotation.y = dx * 9; e.escena.add(m); }
      const s = cartel(EMOJI[ing]); s.position.set(est.x, 1.75, est.z - 0.25); e.escena.add(s);
    }
    if (est.tipo === 'F') {
      // Plancha: placa de acero con estrías que se pone roja mientras asa; llamas escondidas por si se prende fuego
      const brasa = new THREE.MeshStandardMaterial({ color: '#2a2a30', emissive: '#ff3a1a', emissiveIntensity: 0, metalness: 0.5, roughness: 0.5 });
      const placa = new THREE.Mesh(new THREE.BoxGeometry(CELDA * 0.86, 0.06, CELDA * 0.86), brasa); placa.position.set(est.x, 1.0, est.z); e.escena.add(placa);
      for (let i = -2; i <= 2; i++) { const estria = new THREE.Mesh(new THREE.BoxGeometry(CELDA * 0.8, 0.012, 0.035), mat('#16161a')); estria.position.set(est.x, 1.035, est.z + i * 0.2); e.escena.add(estria); }
      const perilla = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), mat('#d9443a')); perilla.rotation.x = Math.PI / 2; perilla.position.set(est.x - 0.3, 0.7, est.z + CELDA / 2); e.escena.add(perilla);
      const llamas = [0, 1, 2, 3, 4].map((i) => { const l = new THREE.Mesh(llamaG, llamaM[i % 2]); l.position.set(est.x + Math.cos(i * 1.3) * 0.28, 1.25, est.z + Math.sin(i * 1.3) * 0.28); l.visible = false; e.escena.add(l); return l; });
      planchas.set(est, { brasa, llamas });
    }
    if (est.tipo === 'O') {
      const brasa = new THREE.MeshStandardMaterial({ color: '#222228', emissive: '#ff3a1a', emissiveIntensity: 0 });
      const aro = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 20), brasa); aro.rotation.x = Math.PI / 2; aro.position.set(est.x, 1.0, est.z);
      const acero = new THREE.MeshStandardMaterial({ color: '#c9ccd6', metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide });
      const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.5, 20, 1, true), acero); cuerpo.position.set(est.x, 1.27, est.z);
      const fondoO = new THREE.Mesh(new THREE.CircleGeometry(0.38, 20), acero); fondoO.rotation.x = -Math.PI / 2; fondoO.position.set(est.x, 1.03, est.z);
      for (const lado of [-1, 1]) { const asa = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 10, Math.PI), mat('#2a2a33')); asa.position.set(est.x + lado * 0.46, 1.42, est.z); asa.rotation.y = Math.PI / 2; e.escena.add(asa); }
      const colorCaldo = new THREE.MeshStandardMaterial({ color: '#e0552f', roughness: 0.4 });
      const caldo = new THREE.Mesh(new THREE.CircleGeometry(0.39, 20), colorCaldo); caldo.rotation.x = -Math.PI / 2; caldo.visible = false;
      caldo.position.set(est.x, 1.1, est.z);
      e.escena.add(aro, cuerpo, fondoO, caldo);
      const s = cartel('🍲'); s.position.set(est.x, 1.95, est.z - 0.3); s.scale.setScalar(0.75); e.escena.add(s);
      olla = { est, caldo, colorCaldo, brasa };
    }
    if (est.tipo === 'K') {
      const tabla = new THREE.Mesh(new THREE.BoxGeometry(CELDA * 0.82, 0.06, CELDA * 0.62), mat('#d9a35a')); tabla.position.set(est.x, 1.0, est.z);
      // Cuchillo grande: hoja brillante con mango oscuro; gira desde el mango al picar
      const cuchillo = new THREE.Group(), hoja = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.17), new THREE.MeshStandardMaterial({ color: '#e8ecf2', metalness: 0.85, roughness: 0.2 }));
      const mango = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.09), mat('#b8402a')); hoja.position.x = -0.36; mango.position.x = 0.05;
      const filo = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.032, 0.025), mat('#4a4f5a')); filo.position.set(-0.36, 0, 0.085); cuchillo.add(filo); cuchillo.add(hoja, mango);
      cuchillo.position.set(est.x + 0.36, 1.1, est.z + 0.24); e.escena.add(tabla, cuchillo); cuchillos.set(est, cuchillo);
      const s = cartel('🔪'); s.position.set(est.x, 1.75, est.z - 0.3); s.scale.setScalar(0.72); e.escena.add(s);
    }
    if (est.tipo === 'E') {
      // Ventanilla: campana de llamar y una lámpara térmica encima
      campana = new THREE.Group();
      const domo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e0c050', metalness: 0.7, roughness: 0.25 }));
      const boton = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), mat('#2a2a33')); boton.position.y = 0.18;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 14), mat('#2a2a33')); campana.add(base, domo, boton);
      campana.position.set(est.x - 0.35, 0.98, est.z + 0.38); e.escena.add(campana);
      flecha = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshBasicMaterial({ color: '#3fe07a' })); flecha.rotation.z = Math.PI; flecha.position.set(est.x, 2.5, est.z); e.escena.add(flecha);
      const s = cartel('🛎️', '#bff0cc'); s.position.set(est.x + 0.2, 1.7, est.z + 0.1); s.scale.setScalar(0.75); e.escena.add(s);
    }
    if (est.tipo === 'D') for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(platoG, mat('#ffffff')); p.position.set(est.x, 1.0 + i * 0.06, est.z); const b = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.02, 5, 18), mat('#8fd0de')); b.rotation.x = Math.PI / 2; b.position.set(est.x, 1.03 + i * 0.06, est.z); e.escena.add(p, b); }
    if (est.tipo === 'X') {
      // Tacho con tapa con bisagra: se abre cuando lo tienes enfrente
      const tacho = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.36, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#3a3a44', side: THREE.DoubleSide }));
      tacho.position.set(est.x, 1.15, est.z);
      tapa = new THREE.Group(); const disco = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 16), mat('#3fae6a')); disco.position.z = 0.44; tapa.add(disco);
      tapa.position.set(est.x, 1.35, est.z - 0.44); e.escena.add(tacho, tapa);
      const s = cartel('🗑️'); s.position.set(est.x, 1.95, est.z); s.scale.setScalar(0.72); e.escena.add(s);
    }
    // Indicador sobre las estaciones que trabajan solas: barra de avance y un ícono de estado
    if (est.tipo === 'K' || est.tipo === 'F' || est.tipo === 'O') {
      est.ui = document.createElement('div'); est.ui.className = 'cocina-estado'; est.ui.innerHTML = '<b></b><span><i></i></span>'; c.caja.appendChild(est.ui);
    }
  }
  const dibujarEncima = (est: Estacion) => {
    if (est.tipo === 'E' || est.tipo === 'O') return;
    if (est.malla) e.escena.remove(est.malla);
    est.malla = est.encima.plato ? mallaPlato(est.encima.plato) : est.encima.cosa ? malla(est.encima.cosa) : null;
    if (est.malla) { est.malla.position.set(est.x, est.tipo === 'F' ? 1.03 : 0.99, est.z); e.escena.add(est.malla); }
  };

  // ── El resaltado de la estación que tienes enfrente: un marco que late y la acción escrita encima ──
  const marco = new THREE.Group(), marcoM = new THREE.MeshBasicMaterial({ color: '#ffe36b', transparent: true, opacity: 0.9, depthWrite: false });
  for (const [x, z, w, d] of [[0, -0.6, 1.26, 0.07], [0, 0.6, 1.26, 0.07], [-0.6, 0, 0.07, 1.26], [0.6, 0, 0.07, 1.26]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), marcoM); b.position.set(x, 0, z); marco.add(b); }
  marco.visible = false; e.escena.add(marco);
  const etiqueta = document.createElement('div'); etiqueta.className = 'cocina-accion'; c.caja.appendChild(etiqueta);
  const guia = document.createElement('div'); guia.className = 'cocina-guia'; c.caja.appendChild(guia);
  const punta = document.createElement('div'); punta.className = 'cocina-punta'; punta.textContent = '¡Hora punta! Pagan x1,5'; c.caja.appendChild(punta);
  const flechaGuia = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.45, 4), new THREE.MeshBasicMaterial({ color: '#ffe36b' })); flechaGuia.rotation.z = Math.PI; flechaGuia.visible = false; e.escena.add(flechaGuia);

  // ── El cocinero ──
  const yo = await e.personaje(c.aspecto, 1.35), sombraYo = sombra(0.4);
  yo.grupo.rotation.order = 'YXZ';
  const gorro = new THREE.Group(), escalaYo = yo.grupo.scale.y;
  const banda = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 14), mat('#ffffff')), copa = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), mat('#ffffff'));
  copa.position.y = 0.2; copa.scale.y = 0.8; gorro.add(banda, copa);
  gorro.scale.setScalar(1 / escalaYo); gorro.position.y = 1.36 / escalaYo; yo.grupo.add(gorro);
  e.escena.add(sombraYo);
  const inicio = centro(6, 6);
  let px = inicio.x, pz = inicio.z, vx = 0, vz = 0, ang = Math.PI;
  let mano: Encima = {}, enMano: THREE.Group | null = null;
  const dibujarMano = () => { if (enMano) e.escena.remove(enMano); enMano = mano.plato ? mallaPlato(mano.plato) : mano.cosa ? malla(mano.cosa) : null; if (enMano) { enMano.scale.setScalar(0.85); e.escena.add(enMano); } };

  // Humo, vapor y burbujas: esferitas que suben, crecen y se apagan
  const particulas: Particula[] = [], bolitaG = new THREE.SphereGeometry(0.1, 6, 5);
  const humoM = { blanco: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }), negro: new THREE.MeshBasicMaterial({ color: '#2a2a2a', transparent: true, opacity: 0.55, depthWrite: false }), burbuja: new THREE.MeshBasicMaterial({ color: '#ff8a6a', transparent: true, opacity: 0.8, depthWrite: false }) };
  const soltar = (x: number, y: number, z: number, tipo: keyof typeof humoM, vida = 1.4, crece = 0.7, vy = 0.8) => {
    if (particulas.length > 70) return;
    const m = new THREE.Mesh(bolitaG, humoM[tipo]); m.position.set(x, y, z); m.scale.setScalar(tipo === 'burbuja' ? 0.4 : 0.8); e.escena.add(m);
    particulas.push({ m, vy, crece, vida, total: vida });
  };

  // ── Clientes del comedor: cuerpo, cabeza y una burbuja con lo que pidieron ──
  const cuerpoG = new THREE.CylinderGeometry(0.17, 0.24, 0.62, 10), cabezaG = new THREE.SphereGeometry(0.19, 12, 10), ojoG = new THREE.SphereGeometry(0.03, 6, 4);
  const ROPA = ['#4a7ab8', '#d97a3a', '#7a4ab8', '#3fae6a', '#d9443a', '#e8b84a', '#4ab8b0'], PIEL = ['#f2c9a0', '#d9a378', '#a86f48', '#7a4a2a'];
  const clientes: Cliente[] = [], ocupados = new Set<number>();
  const nuevoCliente = (emoji: string): Cliente => {
    const libres = ASIENTOS.map((_, i) => i).filter((i) => !ocupados.has(i)), asiento = libres.length ? libres[Math.floor(Math.random() * libres.length)] : -1;
    if (asiento >= 0) ocupados.add(asiento);
    const g = new THREE.Group(), cuerpo = new THREE.Mesh(cuerpoG, mat(ROPA[Math.floor(Math.random() * ROPA.length)])), cabeza = new THREE.Mesh(cabezaG, mat(PIEL[Math.floor(Math.random() * PIEL.length)]));
    cuerpo.position.y = 0.31; cabeza.position.y = 0.8; g.add(cuerpo, cabeza);
    for (const lado of [-1, 1]) { const ojo = new THREE.Mesh(ojoG, mat('#1a1a22')); ojo.position.set(lado * 0.07, 0.84, 0.16); g.add(ojo); }
    const burbuja = cartel(emoji, '#ffffff', 0.5); burbuja.position.y = 1.45; g.add(burbuja);
    const destino = asiento >= 0 ? ASIENTOS[asiento] : { x: MX - 1, z: FO / 2 };
    g.position.set(PUERTA.x, 0, PUERTA.z); e.escena.add(g);
    const cl: Cliente = { g, x: PUERTA.x, z: PUERTA.z, ir: destino, asiento, sale: false, burbuja };
    clientes.push(cl);
    return cl;
  };
  const despedir = (cl: Cliente, feliz: boolean) => {
    cl.sale = true; cl.ir = PUERTA; ocupados.delete(cl.asiento);
    cl.burbuja.material = cartel(feliz ? '😋' : '😠', feliz ? '#d8ffe0' : '#ffd6d6', 0.5).material;
    if (feliz) e.chispas(cl.x, 1.4, cl.z, ['#ff6b9a', '#ffd23c'], 8, 2.5);
  };

  // ── Pedidos (tarjetas arriba) ──
  const tablero = document.createElement('div');
  tablero.className = 'cocina-pedidos';
  c.caja.appendChild(tablero);
  // En cajas angostas (el duelo en vivo, pantallas chicas) las tarjetas van compactas para no tapar la cocina
  const medirTablero = new ResizeObserver(() => tablero.classList.toggle('compacta', c.caja.clientWidth < 1100));
  medirTablero.observe(c.caja);
  const pedidos: Pedido[] = [];
  let reloj = 0, proximo = 1, puntos = 0, entregados = 0, perdidos = 0, propinas = 0, combo = 0, mejorCombo = 0, ultimaEntrega = -99, empezado = false, terminado = false;
  let picandoHasta = 0, impulsoHasta = 0, impulsoListo = 0, gesto = '', gestoHasta = 0, pop = 0, campanaHasta = 0, multaFuego = 0, avisoPunta = false;
  let frente: Estacion | null = null;
  const nuevoPedido = (t: number) => {
    const posibles = RECETAS.filter((x) => t >= x.desde), receta = posibles[Math.floor(azarPedidos() * posibles.length)];
    const tarjeta = document.createElement('div');
    tarjeta.className = 'cocina-pedido';
    tarjeta.innerHTML = `<i></i><div class="cab"><b>${receta.emoji}</b><span>${receta.nombre}</span><em>${receta.valor}</em></div><ul>${receta.ings.map((i) => `<li data-ing="${i}">${EMOJI[i]}${PASOS[i] ? `<small>${PASOS[i]}</small>` : ''}</li>`).join('')}</ul>`;
    tablero.appendChild(tarjeta);
    pedidos.push({ receta, desde: t, dura: Math.max(46, 66 - t / 10) / apuro, tarjeta, marcas: '', cliente: nuevoCliente(receta.emoji) });
    e.sonido.tono(1320, 0.07, { tipo: 'triangle', vol: 0.12 });
  };
  const quitarTarjeta = (p: Pedido, clase: string) => { p.tarjeta.classList.add(clase); window.setTimeout(() => p.tarjeta.remove(), 450); };

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    e.detener();
    yo.animar('emote-yes');
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Platos entregados', String(entregados)], ['Pedidos perdidos', String(perdidos)], ['Propinas', String(propinas)], ['Mejor combo', `x${mejorCombo}`]],
      detalle: { entregados, perdidos, propinas, mejorCombo },
    });
  };

  const entregar = (i: number, est: Estacion) => {
    const p = pedidos[i], queda = 1 - (reloj - p.desde) / p.dura;
    combo = reloj - ultimaEntrega < 35 ? combo + 1 : 1; ultimaEntrega = reloj; mejorCombo = Math.max(mejorCombo, combo);
    const pg = pago(p.receta.valor, queda, combo, enPunta(reloj));
    puntos += pg.total; propinas += pg.propina; entregados++;
    mano = {};
    quitarTarjeta(p, 'servido'); pedidos.splice(i, 1); despedir(p.cliente, true);
    e.flotante(`+${pg.total}`, est.x, 2.1, est.z, 'oro');
    if (pg.propina >= 5) window.setTimeout(() => e.flotante(`propina +${pg.propina}`, est.x - 0.8, 2.6, est.z, 'bien'), 180);
    if (combo > 1) window.setTimeout(() => e.flotante(`¡Combo x${combo}!`, est.x - 1.2, 3.1, est.z, 'oro'), 360);
    e.chispas(est.x, 1.5, est.z, ['#ffd23c', '#3fe07a', '#ffffff'], 26, 5);
    e.sonido.tono(1568, 0.5, { tipo: 'sine', vol: 0.22 }); e.sonido.tono(2093, 0.4, { tipo: 'sine', vol: 0.12, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.02 });
    e.sonido.bien();
    campanaHasta = reloj + 0.35; gesto = 'emote-yes'; gestoHasta = reloj + 0.7;
  };

  /** Lo que hace la acción con esta estación según lo que tengas en las manos. Con `mirar` solo dice qué haría
   *  (el texto del resaltado y del botón); sin `mirar` lo hace. Un texto que empieza con "!" es por qué no se puede. */
  const hacer = (est: Estacion, mirar: boolean): string => {
    const ing = CAJONES[est.tipo], aqui = est.encima, libre = !mano.cosa && !mano.plato;
    const no = (txt: string) => { if (!mirar) { e.hud.aviso(txt, 'mal', 0.9); e.sonido.tono(220, 0.08, { tipo: 'square', vol: 0.05 }); } return `!${txt}`; };
    const noVa = (plato: Cosa[], k: Cosa) => (k.estado !== LISTO[k.ing] ? (k.estado === 'quemado' ? 'Está quemado: a la basura' : k.ing === 'carne' ? (k.estado === 'picado' ? 'Primero ásala en la plancha' : 'Pícala y ásala primero') : 'Primero pícalo en la tabla') : plato.some((x) => x.ing === k.ing) ? 'El plato ya tiene eso' : '');
    if (est.fuego) return mirar ? 'Mantén: apagar el fuego 🧯' : no('¡Mantén la acción para apagar!');
    if (ing) {
      if (libre) { if (mirar) return `Tomar ${EMOJI[ing]}`; mano = { cosa: { ing, estado: 'crudo', avance: 0 } }; return ''; }
      if (mano.plato) { const k: Cosa = { ing, estado: 'crudo', avance: 0 }, malo = noVa(mano.plato, k); if (malo) return no(malo); if (mirar) return `Sumar ${EMOJI[ing]} al plato`; mano.plato.push(k); return ''; }
      return no('Tienes las manos llenas');
    }
    if (est.tipo === 'D') {
      if (libre) return mirar ? 'Tomar un plato 🍽️' : ((mano = { plato: [] }), '');
      if (mano.cosa) { const malo = noVa([], mano.cosa); if (malo) return no(malo); return mirar ? 'Servir en un plato 🍽️' : ((mano = { plato: [mano.cosa] }), ''); }
      return no('Ya tienes un plato');
    }
    if (est.tipo === 'X') {
      if (libre) return no('No tienes nada que botar');
      if (mano.plato && !mano.plato.length) return no('El plato ya está vacío');
      if (mirar) return mano.cosa ? 'Botar 🗑️' : 'Vaciar el plato 🗑️';
      mano = mano.cosa ? {} : { plato: [] }; soltar(est.x, 1.3, est.z, 'blanco', 0.6, 1.2, 1.4); e.sonido.ruido(0.18, 0.12);
      return '';
    }
    if (est.tipo === 'E') {
      if (!mano.plato) return no(mano.cosa ? 'Ponlo en un plato primero' : 'Trae un plato listo');
      if (!mano.plato.length) return no('El plato está vacío');
      const i = pedidos.findIndex((p) => calza(mano.plato!, p.receta));
      if (i < 0) return no('Nadie pidió eso');
      if (mirar) return `Entregar ${pedidos[i].receta.emoji}`;
      entregar(i, est);
      return '';
    }
    if (est.tipo === 'O') {
      const s = aqui.cosa;
      if (mano.cosa) {
        const k = mano.cosa;
        if (k.ing !== 'tomate') return no('En la olla va tomate picado');
        if (k.estado !== 'picado') return no('Pica el tomate primero');
        if (s && (s.estado !== 'crudo' || (s.n ?? 0) >= TOMATES_SOPA)) return no('La olla ya está llena');
        if (mirar) return 'Echar 🍅 a la olla';
        aqui.cosa = s ? { ...s, n: (s.n ?? 0) + 1 } : { ing: 'sopa', estado: 'crudo', avance: 0, n: 1 }; mano = {};
        for (let i = 0; i < 4; i++) soltar(est.x + (Math.random() - 0.5) * 0.4, 1.2, est.z, 'burbuja', 0.5, 0.2, 1.6);
        e.sonido.tono(320, 0.15, { tipo: 'sine', vol: 0.15, hasta: 120 });
        return '';
      }
      if (mano.plato) {
        if (!s || s.estado === 'crudo') return no(s ? 'La sopa todavía no está lista' : 'La olla está vacía');
        if (s.estado === 'quemado') return no('Se quemó: vacíala con las manos libres');
        const sopa: Cosa = { ing: 'sopa', estado: 'cocido', avance: 0 }, malo = noVa(mano.plato, sopa);
        if (malo) return no(malo);
        if (mirar) return 'Servir la sopa 🍲';
        mano.plato.push(sopa); aqui.cosa = undefined;
        return '';
      }
      if (s?.estado === 'quemado') { if (mirar) return 'Vaciar la olla 🗑️'; aqui.cosa = undefined; for (let i = 0; i < 5; i++) soltar(est.x, 1.4, est.z, 'negro'); return ''; }
      return no(s?.estado === 'cocido' ? 'Trae un plato para servir' : s ? 'Espera a que hierva' : `Echa ${TOMATES_SOPA} tomates picados`);
    }
    // Mesón, tabla o plancha: dejar, tomar o juntar
    if (est.tipo === 'F') {
      if (mano.cosa && mano.cosa.ing !== 'carne') return no('En la plancha solo va la carne');
      if (mano.cosa?.estado === 'crudo') return no('Pica la carne primero');
      if (mano.plato && !aqui.cosa) return no('Deja el plato en un mesón');
    }
    if (est.tipo === 'K' && mano.plato && !aqui.cosa) return no('Deja el plato en un mesón');
    if (!aqui.cosa && !aqui.plato) {
      if (libre) return '';
      if (mirar) return est.tipo === 'F' ? 'Poner a la plancha 🔥' : est.tipo === 'K' ? 'Dejar en la tabla 🔪' : 'Dejar aquí';
      est.encima = mano; mano = {};
      if (est.tipo === 'F') e.sonido.ruido(0.3, 0.12);
      return '';
    }
    if (libre) { if (mirar) return `Tomar ${aqui.plato ? '🍽️' : EMOJI[aqui.cosa!.ing]}`; mano = aqui; est.encima = {}; est.humeando = 0; return ''; }
    if (mano.plato && aqui.cosa) { const malo = noVa(mano.plato, aqui.cosa); if (malo) return no(malo); if (mirar) return `Sumar ${EMOJI[aqui.cosa.ing]} al plato`; mano.plato.push(aqui.cosa); est.encima = {}; return ''; }
    if (mano.cosa && aqui.plato) { const malo = noVa(aqui.plato, mano.cosa); if (malo) return no(malo); if (mirar) return `Sumar ${EMOJI[mano.cosa.ing]} al plato`; aqui.plato.push(mano.cosa); mano = {}; return ''; }
    if (mano.plato && aqui.plato) {
      if (!mano.plato.length) return no('Tu plato está vacío');
      const malo = mano.plato.map((k) => noVa(aqui.plato!, k)).find(Boolean);
      if (malo) return no(malo);
      if (mirar) return 'Juntar los platos';
      aqui.plato.push(...mano.plato); mano = {};
      return '';
    }
    return no('Tienes las manos llenas');
  };
  const actuar = (est: Estacion) => {
    if (hacer(est, false).startsWith('!')) return;
    dibujarEncima(est); dibujarMano(); pop = 0.16;
    e.sonido.efecto(mano.cosa || mano.plato ? 'click' : 'madera', 0.45) || e.sonido.tono(520, 0.05, { tipo: 'triangle', vol: 0.12 });
  };
  const porPicar = (est: Estacion | null) => !!est && est.tipo === 'K' && !mano.cosa && !mano.plato && !!est.encima.cosa && est.encima.cosa.estado === 'crudo' && SE_PICA.includes(est.encima.cosa.ing);

  // ── Piloto de prueba (solo en desarrollo): "?piloto=1" cocina solo; "?rapido=N" acelera. La misma decisión
  //    dibuja la flecha del tutorial durante el primer pedido ──
  let pilotoToque = 0;
  const vistaPiloto = (soloPrimero: boolean) => ({ mano, estaciones, desde: celda(px, pz), pedidos: (soloPrimero ? pedidos.slice(0, 1) : pedidos).map((p) => p.receta) });
  const pilotear = (): { x: number; z: number; toque: boolean; mantener: boolean } => {
    const d = decidir(vistaPiloto(false)), quieto = { x: 0, z: 0, toque: false, mantener: false };
    if (!d) return quieto;
    const [cx, cz] = celda(px, pz), sig = rumbo(cx, cz, d.est);
    if (!sig) return quieto;
    const q = centro(sig[0], sig[1]), llegue = sig[0] === cx && sig[1] === cz && Math.hypot(q.x - px, q.z - pz) < 0.32;
    const meta = llegue ? (d.est as Estacion) : q, dx = meta.x - px, dz = meta.z - pz, l = Math.hypot(dx, dz) || 1;
    const listo = llegue && frente === d.est, toque = listo && !d.mantener && reloj > pilotoToque;
    if (toque) pilotoToque = reloj + 0.22;
    return { x: dx / l, z: dz / l, toque, mantener: listo && d.mantener };
  };
  const textoGuia = (): string => {
    const d = decidir(vistaPiloto(true));
    if (!d) return '';
    const t = d.est.tipo, k = mano.cosa;
    if (CAJONES[t]) return mano.plato ? `Suma ${EMOJI[CAJONES[t]]} al plato desde su cajón` : `Toma ${EMOJI[CAJONES[t]]} de su cajón`;
    if (t === 'K') return d.mantener ? 'Mantén Espacio (o el botón) para picar 🔪' : k ? 'Déjalo en la tabla para picarlo 🔪' : mano.plato ? 'Suma lo picado al plato' : 'Toma lo que ya picaste';
    if (t === 'F') return k ? 'Ponla en la plancha: se asa sola 🔥' : 'Saca la carne antes de que se queme';
    if (t === 'D') return k ? 'Llévalo a la pila de platos para servirlo 🍽️' : 'Toma un plato 🍽️';
    if (t === '#') return mano.plato ? 'Deja el plato en un mesón' : k ? 'Súmalo al plato que dejaste' : 'Toma el plato del mesón';
    if (t === 'E') return 'Entrégalo en la ventanilla verde 🛎️';
    if (t === 'X') return 'Bótalo en la basura 🗑️';
    if (t === 'O') return k ? 'Échalo a la olla 🍲' : 'Sirve la sopa con un plato';
    return '';
  };

  // ── Simulación: paso a paso con el reloj de la partida (así la pausa congela también la plancha) ──
  let entrada = { x: 0, z: 0, toque: false, mantener: false, impulso: false }, impulsoAntes = false;
  const simular = (paso: number) => {
    reloj += paso;
    const t = reloj;
    const pide = piloto ? { ...pilotear(), impulso: false } : entrada;
    entrada = { ...entrada, toque: false, impulso: false };
    // Moverse: acelera y frena suave; el impulso es un empujón corto hacia donde miras
    const largo = Math.hypot(pide.x, pide.z), fuerza = Math.min(1, largo);
    if (pide.impulso && t > impulsoListo) {
      impulsoHasta = t + 0.17; impulsoListo = t + 0.85; vx = Math.sin(ang) * IMPULSO; vz = Math.cos(ang) * IMPULSO;
      e.sonido.ruido(0.15, 0.08); e.chispas(px, 0.2, pz, ['#d9cdb2', '#ffffff'], 6, 1.6);
    }
    if (t > impulsoHasta) {
      const qx = largo > 0.15 ? (pide.x / Math.max(1, largo)) * VEL * fuerza : 0, qz = largo > 0.15 ? (pide.z / Math.max(1, largo)) * VEL * fuerza : 0;
      const k = 1 - Math.exp(-(largo > 0.15 ? ACEL : FRENO) * paso);
      vx += (qx - vx) * k; vz += (qz - vz) * k;
    }
    px += vx * paso; pz += vz * paso;
    // Chocar con los mesones: se empuja fuera y se quita la velocidad contra el mueble, así resbala por el borde
    const [cx, cz] = celda(px, pz);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
      if ((COCINA[b]?.[a] ?? '#') === '.') continue;
      const p = centro(a, b), qx = limitar(px, p.x - CELDA / 2, p.x + CELDA / 2), qz = limitar(pz, p.z - CELDA / 2, p.z + CELDA / 2), dx = px - qx, dz = pz - qz, d = Math.hypot(dx, dz);
      if (d < R && d > 1e-6) { const nx = dx / d, nz = dz / d; px = qx + nx * R; pz = qz + nz * R; const contra = vx * nx + vz * nz; if (contra < 0) { vx -= contra * nx; vz -= contra * nz; } }
    }
    // Girar suave hacia donde pides ir (aunque estés contra un mesón, para poder encararlo)
    if (largo > 0.15) {
      let d = Math.atan2(pide.x, pide.z) - ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      ang += d * (1 - Math.exp(-18 * paso));
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
    }
    // La estación que tienes enfrente: la más cercana a un punto delante tuyo, sin cambiar por poco (para que no parpadee)
    const fx = px + Math.sin(ang) * 0.75, fz = pz + Math.cos(ang) * 0.75;
    let mejor: Estacion | null = null, nota = 1.05;
    const puntaje = (s: Estacion) => { const dx = s.x - px, dz = s.z - pz, d = Math.hypot(dx, dz); return d > ALCANCE || (dx * Math.sin(ang) + dz * Math.cos(ang)) / d < 0.25 ? 99 : Math.hypot(s.x - fx, s.z - fz); };
    for (const s of estaciones) { const v = puntaje(s); if (v < nota) { nota = v; mejor = s; } }
    if (frente && mejor !== frente && puntaje(frente) < nota + 0.18) mejor = frente;
    frente = mejor;
    // En la tabla, con las manos libres y algo por picar, mantener pica; frente al fuego, mantener apaga; si no, la acción toma o deja
    if (frente && porPicar(frente) && (pide.mantener || pide.toque)) {
      const k = frente.encima.cosa!;
      k.avance += (pide.mantener ? paso : 0.06) / PICAR;
      if (Math.floor(t * 7) !== Math.floor((t - paso) * 7)) { e.sonido.tono(900 + Math.random() * 300, 0.035, { tipo: 'square', vol: 0.06 }); e.chispas(frente.x, 1.1, frente.z, [colorDe(k)], 2, 1.4); }
      picandoHasta = t + 0.12;
      if (k.avance >= 1) { k.estado = 'picado'; k.avance = 0; dibujarEncima(frente); e.chispas(frente.x, 1.15, frente.z, [colorDe(k), '#ffffff'], 12, 2.6); e.sonido.tono(1200, 0.08, { tipo: 'triangle', vol: 0.15 }); }
    } else if (frente?.fuego && pide.mantener) {
      frente.apagar += paso;
      if (Math.floor(t * 8) !== Math.floor((t - paso) * 8)) { e.chispas(frente.x, 1.3, frente.z, ['#ffffff', '#d8f4ff'], 5, 2); e.sonido.ruido(0.1, 0.08); }
      if (frente.apagar >= APAGAR) { frente.fuego = 0; frente.apagar = 0; frente.encima = {}; frente.humeando = 0; dibujarEncima(frente); e.hud.aviso('¡Fuego apagado!', 'bien', 1); for (let i = 0; i < 6; i++) soltar(frente.x, 1.3, frente.z, 'blanco'); }
    } else if (pide.toque && frente) actuar(frente);
    // Plancha: la carne picada se asa sola, se quema si te olvidas y, quemada un rato, se prende fuego (y el fuego se pasa)
    for (const est of estaciones) {
      const k = est.encima.cosa;
      if (est.fuego) {
        est.fuego += paso;
        if (!pide.mantener || frente !== est) est.apagar = Math.max(0, est.apagar - paso * 0.5);
        if (est.fuego > 10) for (const otra of de('F')) if (!otra.fuego && Math.abs(otra.cz - est.cz) + Math.abs(otra.cx - est.cx) === 1) { otra.fuego = 0.01; otra.encima = {}; dibujarEncima(otra); e.hud.aviso('¡El fuego se pasó a la otra plancha!', 'mal', 1.2); }
        continue;
      }
      if (est.tipo === 'F' && k?.ing === 'carne' && k.estado !== 'crudo') {
        k.avance += paso;
        const antes = k.estado;
        if (k.avance >= QUEMAR) k.estado = 'quemado'; else if (k.avance >= COCER) k.estado = 'cocido';
        if (antes !== k.estado) {
          dibujarEncima(est);
          if (k.estado === 'cocido') { e.sonido.efecto('campana', 0.4) || e.sonido.tono(1046, 0.2, { tipo: 'triangle', vol: 0.15 }); e.flotante('¡Lista!', est.x, 1.9, est.z, 'oro'); }
          else { e.sonido.mal(); e.hud.aviso('¡Se quemó la carne! Sácala antes de que arda', 'mal', 1.3); e.temblar(0.25); }
        }
        if (k.estado === 'quemado') { est.humeando += paso; if (est.humeando >= FUEGO) { est.fuego = 0.01; e.hud.aviso('¡Fuego en la plancha! Mantén la acción para apagar', 'mal', 1.6); e.temblar(0.4); e.sonido.ruido(0.5, 0.2); } }
      }
      if (est.tipo === 'O' && k?.ing === 'sopa' && (k.n ?? 0) >= TOMATES_SOPA && k.estado !== 'quemado') {
        k.avance += paso;
        const antes = k.estado;
        if (k.avance >= SOPA_QUEMA) k.estado = 'quemado'; else if (k.avance >= SOPA) k.estado = 'cocido';
        if (antes !== k.estado) {
          if (k.estado === 'cocido') { e.flotante('¡Sopa lista!', est.x, 1.9, est.z, 'oro'); e.sonido.efecto('campana', 0.4) || e.sonido.tono(988, 0.2, { tipo: 'triangle', vol: 0.15 }); }
          else { e.sonido.mal(); e.hud.aviso('¡Se quemó la sopa!', 'mal', 1.1); }
        }
      }
    }
    // El fuego cuesta puntos mientras arda
    const ardiendo = estaciones.filter((s) => s.fuego).length;
    if (ardiendo) { multaFuego += paso * ardiendo; if (multaFuego >= 1) { multaFuego -= 1; puntos = Math.max(0, puntos - 5); } }
    // Pedidos: llegan cada vez más seguido (y en la hora punta, mucho más); si se acaba su tiempo, se pierden
    const hora = enPunta(t);
    if (hora && !avisoPunta) { avisoPunta = true; e.hud.aviso('¡Hora punta! Los pedidos pagan x1,5', 'oro', 1.8); e.sonido.tono(784, 0.15, { tipo: 'square', vol: 0.08 }); e.sonido.tono(1046, 0.25, { tipo: 'square', vol: 0.08, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.15 }); }
    if (t >= proximo && pedidos.length < (hora ? 5 : 4)) { nuevoPedido(t); proximo = t + (Math.max(10, 23 - t / 12) / apuro) * (hora ? 0.55 : 1); }
    for (let i = pedidos.length - 1; i >= 0; i--) {
      const p = pedidos[i];
      if (1 - (t - p.desde) / p.dura > 0) continue;
      quitarTarjeta(p, 'perdido'); despedir(p.cliente, false); pedidos.splice(i, 1);
      perdidos++; combo = 0; puntos = Math.max(0, puntos - 20);
      e.hud.aviso(`Se fue un cliente enojado: ${p.receta.nombre}`, 'mal', 1.2); e.sonido.mal();
    }
    if (t >= DURA) terminar();
  };

  // ── Dibujo de cada cuadro ──
  const v3 = new THREE.Vector3();
  const enPantalla = (el: HTMLElement, x: number, y: number, z: number) => { v3.set(x, y, z).project(e.camara); el.style.left = `${(v3.x * 0.5 + 0.5) * 100}%`; el.style.top = `${(-v3.y * 0.5 + 0.5) * 100}%`; };
  const BAJO = [110, 146.83, 130.81, 98];
  let golpe = -1, chisporroteo = 0, ultimoTexto = '', ultimaGuia = '';
  const musica = (t: number) => {
    if (!e.sonido.ctx) return;
    const n2 = Math.floor(t / (enPunta(reloj) ? 0.2 : 0.26));
    if (n2 === golpe) return;
    golpe = n2;
    const f = BAJO[Math.floor(n2 / 8) % 4], en = n2 % 8;
    if (en % 4 === 0) e.sonido.tono(f, 0.24, { tipo: 'triangle', vol: 0.07 });
    if (en === 3 || en === 7) { e.sonido.tono(f * 4, 0.12, { tipo: 'triangle', vol: 0.022 }); e.sonido.tono(f * 5, 0.12, { tipo: 'triangle', vol: 0.018 }); e.sonido.tono(f * 6, 0.12, { tipo: 'triangle', vol: 0.016 }); }
    if (en % 2 === 1) e.sonido.ruido(0.025, 0.012);
  };
  const dibujar = (t: number, dt: number) => {
    // El cocinero: inclinado al correr, rebote al caminar con carga, gesto al entregar y "pop" al tomar o dejar
    const rapidez = Math.hypot(vx, vz), carga = !!(mano.cosa || mano.plato);
    pop = Math.max(0, pop - dt);
    const rebote = rapidez > 0.4 ? Math.abs(Math.sin(t * 13)) * 0.05 * Math.min(1, rapidez / VEL) : 0;
    yo.grupo.position.set(px, rebote, pz); yo.grupo.rotation.y = ang;
    yo.grupo.rotation.x = Math.min(0.18, rapidez * 0.025) * (reloj < impulsoHasta ? 2 : 1);
    const s0 = yo.grupo.userData.escala0 ?? (yo.grupo.userData.escala0 = yo.grupo.scale.y), aplasta = pop > 0 ? Math.sin((pop / 0.16) * Math.PI) * 0.08 : 0;
    yo.grupo.scale.y = s0 * (1 - aplasta);
    sombraYo.position.set(px, 0.02, pz);
    const picando = reloj < picandoHasta;
    yo.animar(terminado ? 'emote-yes' : reloj < gestoHasta ? gesto : picando ? 'attack-melee-right' : carga ? 'holding-both' : rapidez > 3.2 ? 'sprint' : rapidez > 0.5 ? 'walk' : 'idle');
    if (enMano) enMano.position.set(px + Math.sin(ang) * 0.42, ALTO_MANO + rebote + Math.sin(t * 13) * 0.02 * Math.min(1, rapidez), pz + Math.cos(ang) * 0.42);
    // Cuchillos: pican sobre lo que está en la tabla
    for (const [est, cu] of cuchillos) {
      const activo = picando && frente === est;
      cu.position.set(est.x + (activo ? 0.25 : 0.36), 1.06 + (activo ? 0.14 : 0), est.z + (activo ? 0.02 : 0.24));
      cu.rotation.set(activo ? 1.4 : 0, activo ? 0.2 : 0.5, activo ? -Math.abs(Math.sin(t * 22)) * 0.6 : 0);
    }
    // Planchas: brillo, chisporroteo, humo y llamas
    let asando = false;
    for (const [est, pl] of planchas) {
      const k = est.encima.cosa, cocina = k?.ing === 'carne' && k.estado !== 'crudo';
      asando ||= cocina && k.estado !== 'quemado';
      pl.brasa.emissiveIntensity = est.fuego ? 1.2 + Math.sin(t * 20) * 0.3 : cocina ? 0.45 + Math.sin(t * 8) * 0.15 : 0;
      for (const [i, l] of pl.llamas.entries()) { l.visible = est.fuego > 0; if (l.visible) { l.scale.set(1, 0.8 + Math.abs(Math.sin(t * 11 + i * 1.7)) * 0.9, 1); l.position.y = 1.2 + l.scale.y * 0.2; } }
      if (cocina && Math.random() < dt * (k.estado === 'quemado' ? 9 : 4)) soltar(est.x + (Math.random() - 0.5) * 0.35, 1.15, est.z + (Math.random() - 0.5) * 0.3, k.estado === 'quemado' ? 'negro' : 'blanco');
      if (cocina && k.estado !== 'quemado' && Math.random() < dt * 3) e.chispas(est.x, 1.1, est.z, ['#ffb03c', '#ffe08a'], 1, 1.8);
      if (est.fuego && Math.random() < dt * 10) soltar(est.x + (Math.random() - 0.5) * 0.4, 1.6, est.z, 'negro', 1.8, 1, 1.2);
    }
    if (asando) { chisporroteo -= dt; if (chisporroteo <= 0) { chisporroteo = 0.09; e.sonido.ruido(0.08, 0.018); } }
    // Olla: nivel y color del caldo, burbujas al hervir y vapor cuando está lista
    if (olla) {
      const s = olla.est.encima.cosa, hierve = !!s && (s.n ?? 0) >= TOMATES_SOPA && s.estado !== 'quemado';
      olla.caldo.visible = !!s;
      if (s) { olla.caldo.position.y = 1.1 + Math.min(TOMATES_SOPA, s.n ?? 1) * 0.1 + (hierve ? Math.sin(t * 9) * 0.01 : 0); olla.colorCaldo.color.set(s.estado === 'quemado' ? '#3a2418' : s.estado === 'cocido' ? '#e8452a' : '#f08a6a'); }
      olla.brasa.emissiveIntensity = hierve ? 0.6 + Math.sin(t * 7) * 0.2 : 0;
      if (hierve && Math.random() < dt * 8) soltar(olla.est.x + (Math.random() - 0.5) * 0.5, olla.caldo.position.y, olla.est.z + (Math.random() - 0.5) * 0.5, 'burbuja', 0.4, 0.4, 0.5);
      if (s && s.estado !== 'crudo' && Math.random() < dt * 4) soltar(olla.est.x, 1.5, olla.est.z, s.estado === 'quemado' ? 'negro' : 'blanco', 1.6, 0.9, 0.7);
      if (hierve && Math.random() < dt * 2) e.sonido.tono(260 + Math.random() * 200, 0.05, { tipo: 'sine', vol: 0.04, hasta: 500 });
    }
    for (let i = particulas.length - 1; i >= 0; i--) {
      const p = particulas[i];
      p.vida -= dt; p.m.position.y += p.vy * dt; p.m.scale.multiplyScalar(1 + p.crece * dt);
      if (p.vida <= 0) { e.escena.remove(p.m); particulas.splice(i, 1); } else if (p.vida < 0.3) p.m.scale.multiplyScalar(1 - dt * 3);
    }
    // Tacho, campana y la flecha de la ventanilla (solo cuando llevas un plato que alguien pidió)
    if (tapa) tapa.rotation.x += ((frente?.tipo === 'X' ? -1.2 : 0) - tapa.rotation.x) * Math.min(1, dt * 12);
    if (campana) campana.scale.y = reloj < campanaHasta ? 1 - Math.abs(Math.sin(t * 40)) * 0.25 : 1;
    const listoParaEntregar = !!mano.plato?.length && pedidos.some((p) => calza(mano.plato!, p.receta));
    if (flecha) { flecha.visible = listoParaEntregar; flecha.position.y = 2.5 + Math.sin(t * 5) * 0.15; }
    // Resaltado: marco que late sobre la estación de enfrente y lo que haría la acción
    const queHace = frente ? (porPicar(frente) ? 'Mantén: picar 🔪' : hacer(frente, true)) : '';
    marco.visible = !!frente && !terminado && queHace !== '';
    if (frente && marco.visible) {
      marco.position.set(frente.x, 1.02, frente.z); marco.scale.setScalar(1 + Math.sin(t * 7) * 0.025);
      marcoM.color.set(queHace.startsWith('!') ? '#ff8a8a' : '#ffe36b'); marcoM.opacity = 0.65 + Math.sin(t * 7) * 0.25;
    }
    const texto = terminado ? '' : queHace;
    if (texto !== ultimoTexto) {
      ultimoTexto = texto;
      etiqueta.textContent = texto.replace(/^!/, '');
      etiqueta.className = `cocina-accion${texto ? ' visible' : ''}${texto.startsWith('!') ? ' no' : ''}`;
      if (botonAccion) botonAccion.textContent = texto && !texto.startsWith('!') ? texto.replace('Mantén: ', '✋ ') : 'Tomar / Dejar';
    }
    if (frente && texto) enPantalla(etiqueta, frente.x, 1.75, frente.z);
    // Estado de la tabla, las planchas y la olla: barra grande e ícono
    for (const est of estaciones) {
      if (!est.ui) continue;
      const k = est.encima.cosa;
      let avance = 0, icono = '', color = '#3fe07a', alerta = false;
      if (est.fuego) { icono = '🔥'; avance = est.apagar / APAGAR; color = '#8fd0ff'; alerta = true; }
      else if (est.tipo === 'K' && k?.estado === 'crudo' && SE_PICA.includes(k.ing)) { avance = k.avance; icono = k.avance > 0 ? '🔪' : ''; }
      else if (est.tipo === 'F' && k?.ing === 'carne' && k.estado !== 'crudo') {
        if (k.estado === 'picado') avance = k.avance / COCER;
        else if (k.estado === 'cocido') { avance = (k.avance - COCER) / (QUEMAR - COCER); color = '#ff8a3a'; icono = k.avance > QUEMAR - 2 ? '⚠️' : '✅'; alerta = k.avance > QUEMAR - 2; }
        else { icono = '💨'; alerta = true; avance = est.humeando / FUEGO; color = '#ff4a4a'; }
      } else if (est.tipo === 'O' && k) {
        if (k.estado === 'crudo') { icono = `🍅${k.n ?? 0}/${TOMATES_SOPA}`; avance = (k.n ?? 0) >= TOMATES_SOPA ? k.avance / SOPA : 0; }
        else if (k.estado === 'cocido') { icono = k.avance > SOPA_QUEMA - 4 ? '⚠️' : '✅'; avance = (k.avance - SOPA) / (SOPA_QUEMA - SOPA); color = '#ff8a3a'; alerta = k.avance > SOPA_QUEMA - 4; }
        else icono = '💨';
      }
      const visible = avance > 0.01 || !!icono;
      est.ui.classList.toggle('visible', visible);
      if (!visible) continue;
      est.ui.classList.toggle('alerta', alerta);
      const [b, barra] = [est.ui.firstElementChild as HTMLElement, est.ui.lastElementChild as HTMLElement];
      if (b.textContent !== icono) b.textContent = icono;
      barra.style.visibility = avance > 0.01 ? 'visible' : 'hidden';
      const fill = barra.firstElementChild as HTMLElement; fill.style.width = `${Math.min(1, avance) * 100}%`; fill.style.background = color;
      enPantalla(est.ui, est.x, est.cz ? 2.0 : 1.4, est.z + (est.cz ? 0 : 0.35));
    }
    // Tarjetas: barra de tiempo y lo que ya tiene el plato que mejor le calza (el de tus manos o uno de un mesón)
    const platos = [mano.plato, ...estaciones.map((s) => s.encima.plato)].filter((p): p is Cosa[] => !!p);
    for (const p of pedidos) {
      const queda = Math.max(0, 1 - (reloj - p.desde) / p.dura), barra = p.tarjeta.firstElementChild as HTMLElement;
      barra.style.width = `${queda * 100}%`; barra.style.background = queda > 0.55 ? '#3fae6a' : queda > 0.3 ? '#f2b33c' : '#e8423a';
      p.tarjeta.classList.toggle('apuro', queda < 0.3);
      let mejorPlato: Cosa[] = [];
      for (const pl of platos) if (pl.every((k) => p.receta.ings.includes(k.ing) && k.estado === LISTO[k.ing]) && pl.length > mejorPlato.length) mejorPlato = pl;
      const marcas = p.receta.ings.map((i) => (mejorPlato.some((k) => k.ing === i) ? 1 : 0)).join('');
      if (marcas !== p.marcas) { p.marcas = marcas; p.tarjeta.querySelectorAll('li').forEach((li, i) => li.classList.toggle('hecho', marcas[i] === '1')); p.tarjeta.classList.toggle('completo', !marcas.includes('0')); }
    }
    // Clientes: caminan a su mesa, esperan y se van (contentos o enojados)
    for (let i = clientes.length - 1; i >= 0; i--) {
      const cl = clientes[i], dx = cl.ir.x - cl.x, dz = cl.ir.z - cl.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const v = Math.min(d, dt * (cl.sale ? 2.6 : 2.0)); cl.x += (dx / d) * v; cl.z += (dz / d) * v; cl.g.rotation.y = Math.atan2(dx, dz); }
      else if (!cl.sale) cl.g.rotation.y = Math.atan2(-1, 0) * (cl.x > MX ? 1 : -1);
      cl.g.position.set(cl.x, d > 0.05 ? Math.abs(Math.sin(t * 10 + i)) * 0.06 : 0, cl.z);
      cl.burbuja.position.y = 1.45 + Math.sin(t * 3 + i) * 0.04;
      if (cl.sale && d <= 0.05) { e.escena.remove(cl.g); clientes.splice(i, 1); }
    }
    // Tutorial: durante el primer pedido, una flecha sobre la estación que sigue y lo que hay que hacer
    const tutorial = empezado && !terminado && !piloto && entregados === 0 && pedidos.length > 0;
    const pasoGuia = tutorial ? textoGuia() : '';
    if (pasoGuia !== ultimaGuia) { ultimaGuia = pasoGuia; guia.textContent = pasoGuia; guia.classList.toggle('visible', !!pasoGuia); }
    const dGuia = tutorial ? decidir(vistaPiloto(true)) : null;
    flechaGuia.visible = !!dGuia && dGuia.est !== frente;
    if (dGuia) flechaGuia.position.set((dGuia.est as Estacion).x, 2.2 + Math.sin(t * 5) * 0.15, (dGuia.est as Estacion).z);
    // Hora punta: luces que laten y cartel
    const hora = empezado && !terminado && enPunta(reloj);
    punta.classList.toggle('visible', hora);
    for (const f of focos) { f.emissive.set(hora ? '#ff7a4a' : '#ffcf70'); f.emissiveIntensity = hora ? 1 + Math.sin(t * 8) * 0.5 : 1.2; }
    if (empezado && !terminado) musica(t);
  };

  let previo = 0;
  e.hud.tiempo(mmss(DURA)); e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    // Lo que pidió el jugador en este cuadro: el toque y el impulso cuentan una vez
    const impulso = mando.agachado;
    entrada = { x: mando.x, z: mando.z, toque: mando.tomarAccion() || entrada.toque, mantener: mando.pulsada, impulso: (impulso && !impulsoAntes) || entrada.impulso };
    impulsoAntes = impulso;
    let avance = Math.max(0, t - previo);
    previo = t;
    if (empezado && !terminado) {
      avance = Math.min(0.1, avance) * aceleracion;
      while (avance > 1e-6 && !terminado) { const p = Math.min(0.05, avance); avance -= p; simular(p); }
    }
    dibujar(t, dt);
    if (!terminado) {
      e.hud.tiempo(mmss(Math.max(0, DURA - reloj)));
      e.hud.extra(`${entregados} ${entregados === 1 ? 'entregado' : 'entregados'}${combo > 1 ? ` · combo x${combo}` : ''}${enPunta(reloj) ? ' · ¡hora punta!' : ''}`);
      e.hud.puntos(puntos);
    }
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cocina = () => ({ px, pz, ang, reloj, celda: celda(px, pz), frente: frente?.tipo ?? null, mano: JSON.stringify(mano), puntos, entregados, perdidos, combo, pedidos: pedidos.map((p) => p.receta.nombre), meta: ((d) => (d ? `${d.est.tipo}${d.est.cx},${d.est.cz}${d.mantener ? '+' : ''}` : null))(decidir(vistaPiloto(false))), mesas: estaciones.filter((s) => s.encima.cosa || s.encima.plato).map((s) => `${s.tipo}${s.cx},${s.cz}:${s.encima.plato ? `[${s.encima.plato.map((k) => k.ing).join()}]` : `${s.encima.cosa!.ing}-${s.encima.cosa!.estado}`}`).join(' '), fuego: estaciones.filter((s) => s.fuego).length, ir(cx: number, cz: number, mira: number) { const p = centro(cx, cz); px = p.x; pz = p.z; ang = mira; vx = vz = 0; }, poner(cx: number, cz: number, cosa: Cosa | null) { const s = estaciones.find((x) => x.cx === cx && x.cz === cz); if (s) { s.encima = cosa ? { cosa } : {}; dibujarEncima(s); } }, saltar(seg: number) { reloj += seg; proximo = Math.min(proximo, reloj + 0.5); }, prender(cx: number, cz: number) { const s = estaciones.find((x) => x.cx === cx && x.cz === cz); if (s) s.fuego = 0.01; }, tener(cosa: Cosa | null, plato?: Ingrediente[]) { mano = plato ? { plato: plato.map((ing) => ({ ing, estado: LISTO[ing], avance: 0 })) } : cosa ? { cosa } : {}; dibujarMano(); } });

  return {
    empezar() { e.empezar(); empezado = true; },
    destruir() { medirTablero.disconnect(); for (const s of estaciones) s.ui?.remove(); e.destruir(); },
  };
}
