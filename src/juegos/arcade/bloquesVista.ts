import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { esDaltonico } from '../../nucleo/preferencias';
import type { Escenario } from '../reflejos/motor';
import { ALTO, ANCHO, OCULTAS, celdas, type Especial, type Pieza } from './bloquesNucleo';

// Lluvia de Bloques: cómo se dibuja un tablero (lo usan el modo individual y el en vivo, donde hay dos lado a lado) y
// los controles (teclado, pantalla táctil y control). Cada tipo de bloque es una malla de instancias con su propio
// dibujo en la cara, así se distinguen también sin colores (modo daltónico).

export const NOMBRE = 'Lluvia de Bloques';
/** Colores propios (no los de ningún juego conocido): violeta, calabaza, poción, rosa, vela, azul noche y hueso. */
const COLORES = ['', '#9a6bff', '#ff8a2a', '#3fe07a', '#ff5a8a', '#ffd23c', '#4aa8ff', '#e8e2d0', '#5a5866', '#ff7a1e'];
const COLORES_DALTONICO = ['', '#0072b2', '#e69f00', '#009e73', '#cc79a7', '#f0e442', '#56b4e9', '#ffffff', '#555555', '#d55e00'];
const SIMBOLOS = ['', '|', '●', '▲', 'S', 'Z', '◆', '✚', '✝', '☻'];
const BOMBA = 10, FANTASMA = 11, SOMBRA = 12;

export interface DatosTablero {
  tablero: number[]; pieza: Pieza | null; sombra: Pieza | null; cola: number[]; especialSiguiente?: Especial; guardada: number;
  hechizo: number; hechizoActivo: boolean; pendiente: number; niebla: boolean; perdio: boolean;
}

const caraDe = (color: string, simbolo: string) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = color; g.fillRect(0, 0, 64, 64);
  const brillo = g.createLinearGradient(0, 0, 64, 64); brillo.addColorStop(0, 'rgba(255,255,255,0.35)'); brillo.addColorStop(0.5, 'rgba(255,255,255,0)'); brillo.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = brillo; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 4; g.strokeRect(4, 4, 56, 56);
  g.fillStyle = 'rgba(20,10,30,0.55)'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(simbolo, 32, 35);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const texto = (s: string, color = '#ffe08a') => {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d')!; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(s, 128, 34);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  return m;
};

/** Un tablero dibujado con su centro en x = `cx`. Las filas visibles van de y = 0 (abajo) a y = 20 (arriba). */
export function crearTableroVisual(e: Escenario, cx: number, titulo = '') {
  const grupo = new THREE.Group(); grupo.position.x = cx; e.escena.add(grupo);
  const VIS = ALTO - OCULTAS;
  // Marco: fondo oscuro con cuadrícula, borde que brilla y paneles de guardada y siguientes
  const fondo = new THREE.Mesh(new THREE.BoxGeometry(ANCHO + 0.4, VIS + 0.4, 0.3), new THREE.MeshStandardMaterial({ color: '#120e22', roughness: 0.9 }));
  fondo.position.set(0, VIS / 2, -0.55); grupo.add(fondo);
  const lineasGrilla: number[] = [];
  for (let x = 0; x <= ANCHO; x++) lineasGrilla.push(x - ANCHO / 2, 0, -0.38, x - ANCHO / 2, VIS, -0.38);
  for (let y = 0; y <= VIS; y++) lineasGrilla.push(-ANCHO / 2, y, -0.38, ANCHO / 2, y, -0.38);
  const geoGrilla = new THREE.BufferGeometry(); geoGrilla.setAttribute('position', new THREE.Float32BufferAttribute(lineasGrilla, 3));
  grupo.add(new THREE.LineSegments(geoGrilla, new THREE.LineBasicMaterial({ color: '#2e2650' })));
  const matBorde = new THREE.MeshBasicMaterial({ color: '#b17cff' });
  for (const [w, h, x, y] of [[0.25, VIS + 0.7, -ANCHO / 2 - 0.32, VIS / 2], [0.25, VIS + 0.7, ANCHO / 2 + 0.32, VIS / 2], [ANCHO + 0.9, 0.25, 0, -0.32]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), matBorde); b.position.set(x, y, -0.2); grupo.add(b); }
  for (const [x, rotulo] of [[-ANCHO / 2 - 3.1, 'GUARDA'], [ANCHO / 2 + 3.1, 'SIGUEN']] as const) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.6, rotulo === 'GUARDA' ? 4 : 13, 0.2), new THREE.MeshStandardMaterial({ color: '#1a1430', roughness: 0.9 }));
    panel.position.set(x, rotulo === 'GUARDA' ? VIS - 2.2 : VIS - 6.7, -0.55); grupo.add(panel);
    const r = texto(rotulo, '#c9b8ff'); r.position.set(x, VIS + 0.5, -0.3); r.scale.setScalar(0.8); grupo.add(r);
  }
  if (titulo) { const nombre = texto(titulo, '#ffffff'); nombre.position.set(0, VIS + 1.3, -0.3); nombre.scale.set(1.6, 1.6, 1); grupo.add(nombre); }
  // Barra del hechizo (izquierda) y de la basura que viene (derecha)
  const barraHechizo = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1, 0.3), new THREE.MeshBasicMaterial({ color: '#b17cff' }));
  const barraBasura = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1, 0.3), new THREE.MeshBasicMaterial({ color: '#ff3b4e' }));
  grupo.add(barraHechizo, barraBasura);
  // Niebla (evento): tapa las filas de arriba
  const niebla = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO + 0.4, 9), new THREE.MeshBasicMaterial({ color: '#6a5a8a', transparent: true, opacity: 0.92, depthWrite: false }));
  niebla.position.set(0, VIS - 4.5, 0.6); niebla.visible = false; grupo.add(niebla);
  // Los bloques: una malla de instancias por tipo
  const daltonico = esDaltonico(), paleta = daltonico ? COLORES_DALTONICO : COLORES;
  const geo = new RoundedBoxGeometry(0.94, 0.94, 0.6, 2, 0.12);
  const materiales: THREE.Material[] = [];
  for (let k = 1; k <= 9; k++) materiales[k] = new THREE.MeshStandardMaterial({ map: caraDe(paleta[k], SIMBOLOS[k]), roughness: 0.4, metalness: 0.1, emissive: paleta[k], emissiveIntensity: 0.12 });
  materiales[BOMBA] = new THREE.MeshStandardMaterial({ map: caraDe('#2a2a34', '✸'), roughness: 0.3, emissive: '#ff3b2e', emissiveIntensity: 0.25 });
  materiales[FANTASMA] = new THREE.MeshStandardMaterial({ map: caraDe('#d8e0ff', '👻'), transparent: true, opacity: 0.6, emissive: '#a0a8ff', emissiveIntensity: 0.3 });
  materiales[SOMBRA] = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false });
  const mallas: THREE.InstancedMesh[] = [];
  for (let k = 1; k <= SOMBRA; k++) { const m = new THREE.InstancedMesh(geo, materiales[k], 280); m.count = 0; m.frustumCulled = false; grupo.add(m); mallas[k] = m; }
  // Destellos de las filas que se borran
  const destellos = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })); m.position.z = 0.5; grupo.add(m); return { m, desde: -9 }; });
  const o = new THREE.Object3D();
  const poner = (tipo: number, x: number, y: number, escala = 1) => {
    const m = mallas[tipo]; if (!m || m.count >= 280) return;
    o.position.set(x, y, 0); o.scale.setScalar(escala); o.updateMatrix(); m.setMatrixAt(m.count++, o.matrix);
  };
  const enX = (x: number) => x - ANCHO / 2 + 0.5, enY = (y: number) => ALTO - 1 - y + 0.5;
  const mini = (t: number, px: number, py: number, especial: Especial = null) => {
    const cs = celdas({ t, r: 0, x: 0, y: 0, especial: null }), mx = cs.reduce((a, c) => a + c[0], 0) / 4, my = cs.reduce((a, c) => a + c[1], 0) / 4;
    for (const [x, y] of cs) poner(especial === 'bomba' ? BOMBA : especial === 'fantasma' ? FANTASMA : especial === 'calabaza' ? 9 : t + 1, px + (x - mx) * 0.62, py - (y - my) * 0.62, 0.6);
  };
  let reloj = 0, sacude = 0;
  return {
    grupo,
    dibujar(d: DatosTablero, t: number, dt: number) {
      reloj = t;
      for (let k = 1; k <= SOMBRA; k++) if (mallas[k]) mallas[k].count = 0;
      for (let y = OCULTAS; y < ALTO; y++) for (let x = 0; x < ANCHO; x++) { const c = d.tablero[y * ANCHO + x]; if (c) poner(c, enX(x), enY(y)); }
      if (d.sombra && d.pieza && d.sombra.y !== d.pieza.y) for (const [x, y] of celdas(d.sombra)) if (y >= OCULTAS) poner(SOMBRA, enX(x), enY(y), 0.9);
      if (d.pieza) { const tipo = d.pieza.especial === 'bomba' ? BOMBA : d.pieza.especial === 'fantasma' ? FANTASMA : d.pieza.especial === 'calabaza' ? 9 : d.pieza.t + 1; for (const [x, y] of celdas(d.pieza)) if (y >= OCULTAS) poner(tipo, enX(x), enY(y)); }
      if (d.guardada >= 0) mini(d.guardada, -ANCHO / 2 - 3.1, ALTO - OCULTAS - 2.4);
      d.cola.slice(0, 5).forEach((tp, i) => mini(tp, ANCHO / 2 + 3.1, ALTO - OCULTAS - 2.2 - i * 2.5, i === 0 ? d.especialSiguiente ?? null : null));
      for (let k = 1; k <= SOMBRA; k++) if (mallas[k]) mallas[k].instanceMatrix.needsUpdate = true;
      const VISh = ALTO - OCULTAS, h = Math.max(0.01, d.hechizo * VISh), p = Math.min(VISh, d.pendiente);
      barraHechizo.scale.y = h; barraHechizo.position.set(-ANCHO / 2 - 0.75, h / 2, -0.2);
      (barraHechizo.material as THREE.MeshBasicMaterial).color.set(d.hechizoActivo ? '#ffffff' : d.hechizo >= 1 ? (Math.sin(t * 10) > 0 ? '#ffe08a' : '#b17cff') : '#b17cff');
      barraBasura.visible = p > 0; barraBasura.scale.y = Math.max(0.01, p); barraBasura.position.set(ANCHO / 2 + 0.75, p / 2, -0.2);
      niebla.visible = d.niebla; if (d.niebla) (niebla.material as THREE.MeshBasicMaterial).opacity = 0.85 + Math.sin(t * 2) * 0.07;
      matBorde.color.set(d.perdio ? '#ff3b4e' : d.hechizoActivo ? '#ffe08a' : '#b17cff');
      for (const ds of destellos) { const edad = t - ds.desde; (ds.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - edad * 4); }
      sacude = Math.max(0, sacude - dt * 3);
      grupo.position.x = cx + (sacude ? Math.sin(t * 60) * 0.15 * sacude : 0);
    },
    /** Destello y chispas en las filas que se borraron (y del tablero, antes de borrarlas). */
    lineas(filas: number[], colores: string[] = ['#ffffff', '#ffe08a', '#b17cff']) {
      filas.forEach((y, i) => { const ds = destellos[i % 4]; ds.desde = reloj; ds.m.position.y = enY(y); e.chispas(cx, enY(y), 0.6, colores, 18, 5); });
      if (filas.length >= 4) sacude = 1;
    },
    sacudir() { sacude = 1; },
    enMundo: (x: number, y: number) => new THREE.Vector3(cx + enX(x), enY(y), 0.6),
  };
}

// ── Controles ──
export interface Acciones { mover(dx: number): void; girar(dir: 1 | -1 | 2): void; caer(): void; guardar(): void; hechizo(): void }
/** Teclado, botones en pantalla, gestos y control. `bajando()` dice si se mantiene la caída suave; `tic(dt)` repite los movimientos mantenidos. */
export function crearControles(e: Escenario, caja: HTMLElement, a: Acciones) {
  let izq = false, der = false, abajo = false, mantenido = 0, repetir = 0, dir = 0;
  const DAS = 0.16, ARR = 0.045;
  e.escuchar(window, 'keydown', (ev) => {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(k)) ev.preventDefault();
    if (ev.repeat) return;
    if (k === 'ArrowLeft') { izq = true; a.mover(-1); dir = -1; mantenido = 0; }
    else if (k === 'ArrowRight') { der = true; a.mover(1); dir = 1; mantenido = 0; }
    else if (k === 'ArrowDown') abajo = true;
    else if (k === ' ') a.caer();
    else if (k === 'ArrowUp' || k === 'x') a.girar(1);
    else if (k === 'z') a.girar(-1);
    else if (k === 'a') a.girar(2);
    else if (k === 'c' || k === 'Shift') a.guardar();
    else if (k === 'e' || k === 'v') a.hechizo();
  });
  e.escuchar(window, 'keyup', (ev) => { if (ev.key === 'ArrowLeft') izq = false; if (ev.key === 'ArrowRight') der = false; if (ev.key === 'ArrowDown') abajo = false; });
  e.escuchar(window, 'blur', () => { izq = der = abajo = false; });
  // Botones en pantalla (celular): grandes, abajo
  const barra = document.createElement('div');
  barra.className = 'bloques-botones';
  Object.assign(barra.style, { position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', display: 'flex', gap: '6px', zIndex: '3', flexWrap: 'wrap', justifyContent: 'center' });
  const boton = (txt: string, titulo: string, abajoF: () => void, arriba?: () => void) => {
    const b = document.createElement('button'); b.className = 'boton'; b.textContent = txt; b.title = titulo;
    Object.assign(b.style, { minWidth: '52px', minHeight: '48px', fontSize: '1.2rem', padding: '6px 10px', touchAction: 'none', background: 'rgba(20,32,58,.85)' });
    b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); abajoF(); if (navigator.vibrate) navigator.vibrate(8); });
    for (const fin of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(fin, () => arriba?.());
    barra.appendChild(b); return b;
  };
  const tactil = matchMedia('(pointer: coarse)').matches;
  if (tactil) {
    boton('◀', 'Mover a la izquierda', () => { izq = true; a.mover(-1); dir = -1; mantenido = 0; }, () => { izq = false; });
    boton('▶', 'Mover a la derecha', () => { der = true; a.mover(1); dir = 1; mantenido = 0; }, () => { der = false; });
    boton('↺', 'Girar a la izquierda', () => a.girar(-1));
    boton('↻', 'Girar a la derecha', () => a.girar(1));
    boton('▼', 'Bajar rápido', () => { abajo = true; }, () => { abajo = false; });
    boton('⤓', 'Caída instantánea', () => a.caer());
    boton('⇄', 'Guardar', () => a.guardar());
    boton('✦', 'Hechizo', () => a.hechizo());
    caja.appendChild(barra);
  }
  // Gestos sobre el tablero: arrastrar mueve, tocar gira, deslizar rápido hacia abajo deja caer
  let gesto: { x: number; y: number; t: number; pasos: number; bajo: number } | null = null;
  e.escuchar(e.lienzo, 'pointerdown', (ev) => { if (ev.pointerType === 'mouse') return; gesto = { x: ev.clientX, y: ev.clientY, t: performance.now(), pasos: 0, bajo: 0 }; });
  e.escuchar(e.lienzo, 'pointermove', (ev) => {
    if (!gesto) return;
    const paso = Math.max(22, e.lienzo.clientWidth / 28), dx = ev.clientX - gesto.x, pasos = Math.trunc(dx / paso);
    while (gesto.pasos < pasos) { a.mover(1); gesto.pasos++; }
    while (gesto.pasos > pasos) { a.mover(-1); gesto.pasos--; }
    abajo = ev.clientY - gesto.y > paso * 1.5 && Math.abs(dx) < paso;
  });
  e.escuchar(e.lienzo, 'pointerup', (ev) => {
    if (!gesto) return;
    const dt = performance.now() - gesto.t, dy = ev.clientY - gesto.y, dx = ev.clientX - gesto.x;
    if (dy > 60 && dt < 260 && Math.abs(dx) < 50) a.caer();
    else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 300) a.girar(ev.clientX > e.lienzo.getBoundingClientRect().left + e.lienzo.clientWidth / 2 ? 1 : -1);
    gesto = null; abajo = false;
  });
  // Control: cruceta o palanca para mover, A/B giran, Y gira 180°, gatillo derecho deja caer, L1 guarda, gatillo izquierdo hechizo
  const antes: boolean[] = [];
  let padIzq = false, padDer = false, padAbajo = false;
  const leerControl = () => {
    const pad = typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()].find((p) => p?.connected) : null;
    if (!pad) { padIzq = padDer = padAbajo = false; return; }
    const b = (i: number) => !!pad.buttons[i]?.pressed, nuevo = (i: number) => b(i) && !antes[i];
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    const l = b(14) || ax < -0.5, rr = b(15) || ax > 0.5;
    if (l && !padIzq) { a.mover(-1); dir = -1; mantenido = 0; }
    if (rr && !padDer) { a.mover(1); dir = 1; mantenido = 0; }
    padIzq = l; padDer = rr; padAbajo = b(13) || ay > 0.5;
    if (nuevo(0)) a.girar(1); if (nuevo(1)) a.girar(-1); if (nuevo(3)) a.girar(2);
    if (nuevo(7) || nuevo(5) || nuevo(12)) a.caer(); if (nuevo(4)) a.guardar(); if (nuevo(6) || nuevo(2)) a.hechizo();
    pad.buttons.forEach((x, i) => { antes[i] = x.pressed; });
  };
  return {
    bajando: () => abajo || padAbajo,
    tic(dt: number) {
      leerControl();
      const l = izq || padIzq, rr = der || padDer;
      if (!l && !rr) { mantenido = 0; return; }
      const d = l && rr ? dir : l ? -1 : 1;
      mantenido += dt;
      if (mantenido < DAS) return;
      repetir += dt;
      while (repetir >= ARR) { repetir -= ARR; a.mover(d); }
    },
    destruir() { barra.remove(); },
  };
}

// ── Sonido: efectos y una música sintetizada que acelera con el nivel ──
export function crearSonidos(e: Escenario, semilla: string) {
  const tono = (f: number, d: number, o: Parameters<Escenario['sonido']['tono']>[2] = {}) => e.sonido.tono(f, d, o);
  // Una melodía propia en escala menor (no es ninguna canción conocida): se elige con la semilla
  const ESCALA = [220, 246.9, 261.6, 293.7, 329.6, 349.2, 392, 440, 493.9, 523.3];
  const frase = Array.from({ length: 16 }, (_, i) => ESCALA[(i * 7 + semilla.length * 3 + (i % 3) * 2) % ESCALA.length]);
  let nota = 0, proxima = 0;
  return {
    mover: () => tono(320, 0.025, { tipo: 'square', vol: 0.025 }),
    girar: () => tono(520, 0.04, { tipo: 'triangle', vol: 0.05 }),
    asentar: () => tono(140, 0.07, { tipo: 'sine', vol: 0.12 }),
    caer: () => { tono(180, 0.08, { tipo: 'square', vol: 0.07, hasta: 90 }); e.temblar(0.12); },
    lineas: (n: number) => { const base = [0, 523, 587, 659, 784][Math.min(4, n)]; for (let i = 0; i < n; i++) tono(base * (1 + i * 0.25), 0.18, { tipo: 'triangle', vol: 0.1, cuando: (e.sonido.ctx?.currentTime ?? 0) + i * 0.06 }); },
    mal: () => tono(90, 0.4, { tipo: 'sawtooth', vol: 0.12, hasta: 50 }),
    hechizo: () => { tono(300, 0.6, { tipo: 'sine', vol: 0.12, hasta: 1200 }); tono(450, 0.6, { tipo: 'sine', vol: 0.08, hasta: 1800 }); },
    musica(t: number, nivel: number, activa: boolean) {
      if (!activa || t < proxima) return;
      proxima = t + Math.max(0.16, 0.34 - nivel * 0.012);
      const f = frase[nota++ % frase.length];
      tono(f / 2, 0.14, { tipo: 'triangle', vol: 0.035 });
      if (nota % 4 === 1) tono(f / 4, 0.3, { tipo: 'sine', vol: 0.04 });
    },
  };
}

/** Un fondo de Halloween detrás del tablero: caldero que burbujea, calabazas, velas, lápidas y neblina. */
export function crearFondo(e: Escenario, ancho: number) {
  const g = new THREE.Group();
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(ancho + 40, 30), new THREE.MeshStandardMaterial({ color: '#1a1424', roughness: 1 }));
  suelo.rotation.x = -Math.PI / 2; suelo.position.set(0, -0.6, -6); g.add(suelo);
  const pared = new THREE.Mesh(new THREE.PlaneGeometry(ancho + 40, 40), new THREE.MeshStandardMaterial({ color: '#191230', roughness: 1 }));
  pared.position.set(0, 12, -9); g.add(pared);
  const luna = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: '#fff4c8' })); luna.position.set(ancho / 2 - 1, 18, -8.9); g.add(luna);
  for (const lado of [-1, 1]) {
    const x = lado * (ancho / 2 + 1.5);
    const caldero = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), new THREE.MeshStandardMaterial({ color: '#1c1c22', roughness: 0.4, metalness: 0.5 }));
    caldero.position.set(x, 1, -2); g.add(caldero);
    const pocion = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: '#5aff8a' })); pocion.rotation.x = -Math.PI / 2; pocion.position.set(x, 1.65, -2); pocion.userData.pocion = true; g.add(pocion);
    for (let i = 0; i < 3; i++) { const calabaza = new THREE.Mesh(new THREE.SphereGeometry(0.6 + i * 0.12, 12, 10), new THREE.MeshStandardMaterial({ color: '#e8761a', roughness: 0.7 })); calabaza.scale.y = 0.75; calabaza.position.set(x + lado * (1.6 + i * 1.3), 0, 0.5 - i); g.add(calabaza); }
    for (let i = 0; i < 3; i++) { const lapida = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.3), new THREE.MeshStandardMaterial({ color: '#4a4658' })); lapida.position.set(x + lado * (2 + i * 1.6), 0.4, -5 - i); lapida.rotation.z = (i - 1) * 0.08; g.add(lapida); }
    for (let i = 0; i < 2; i++) { const vela = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.7, 8), new THREE.MeshStandardMaterial({ color: '#f4ecd8' })); vela.position.set(x - lado * (0.6 - i * 1.4), 0, 1.4); g.add(vela); const llama = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), new THREE.MeshBasicMaterial({ color: '#ffcf5a' })); llama.position.set(x - lado * (0.6 - i * 1.4), 0.48, 1.4); llama.userData.llama = true; g.add(llama); }
  }
  e.escena.add(g);
  const luz = new THREE.PointLight('#8a5aff', 10, 30, 1.4); luz.position.set(0, 10, 6); e.escena.add(luz);
  return {
    avanzar(t: number, hechizo: boolean) {
      g.children.forEach((o) => { if (o.userData.llama) o.scale.y = 1 + Math.sin(t * 14 + o.position.x) * 0.2; if (o.userData.pocion) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(hechizo ? '#ffe08a' : '#5aff8a'); });
      luz.intensity = (hechizo ? 16 : 9) + Math.sin(t * 2) * 1.5;
    },
    burbujas(n: number) { for (const lado of [-1, 1]) e.chispas(lado * (ancho / 2 + 1.5), 1.8, -2, ['#5aff8a', '#b0ffcc'], 4 + n * 3, 2.5); },
  };
}
