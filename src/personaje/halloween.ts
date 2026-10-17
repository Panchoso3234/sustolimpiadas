import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kenney } from './kenney';

// Disfraces de Halloween para los chibis: se repinta la textura por pieza (conservando el sombreado pintado a mano),
// se esconden las piezas navideñas (estrellas, aureolas, acebo) y se agregan accesorios hechos aquí mismo.
// Una "pieza" es cada parte suelta de la malla (gorro, ojo, bufanda), numeradas de arriba abajo.

type Clase = 'todo' | 'rojo' | 'verde' | 'dorado' | 'azul' | 'claro' | 'palido' | 'color' | 'piel' | 'oscuro';
/** Pinta los píxeles de las piezas `p` (o de todas) que sean de la clase `si` con el color `a`. `liso` borra dibujos
 *  (renos, copos), `vendas` dibuja vendas de momia, `no` deja fuera algunas clases y `piel` permite pintar también los
 *  tonos de piel (por defecto se respetan). Los tintes se aplican en orden: uno posterior pisa a uno anterior. */
interface Tinte { p: number[] | 'todas'; a: string; si?: Clase; no?: Clase[]; liso?: boolean; piel?: boolean; vendas?: boolean }
type Accesorio = ['calabaza'] | ['bruja', string, string] | ['mago', string] | ['paja'] | ['cuernos', string] | ['orejasLobo', string]
  | ['alas', string] | ['alasHada', string] | ['capa', string, string] | ['cubeta'] | ['fantasmita'] | ['sabana'] | ['tornillos']
  | ['patasArana', string] | ['guadana'] | ['tricornio'] | ['corona', number] | ['flores'] | ['cola', string] | ['costillas']
  | ['orejasZorro', string, string] | ['colasZorro', string, number];
/** `fantasma`: el cuerpo queda medio transparente y teñido de ese color. */
interface Disfraz { tenir: Tinte[]; ocultar?: number[]; accesorios: Accesorio[]; fantasma?: string }

const NARANJA = '#f07a1a', NEGRO = '#26202e', MORADO = '#5b2a86', CARMESI = '#b3203a', NOCHE = '#1d1a22', HUESO = '#efe9dc';

/** Los disfraces por id de avatar: "chibi-NN-h" es el primero de cada chibi, "chibi-NN-h2" el segundo y "chibi-NN-z" las zorritas. */
export const DISFRACES: Record<string, Disfraz> = {
  'chibi-01-h': { ocultar: [0], accesorios: [['calabaza']],
    tenir: [{ p: [17], a: '#4a2a78' }, { p: [16], a: NARANJA }, { p: [18, 19], a: NEGRO }] },
  'chibi-02-h': { ocultar: [0, 1], accesorios: [['orejasLobo', '#6f7488']],
    tenir: [{ p: [2, 31, 32], a: '#6f7488' }, { p: [21], a: MORADO }, { p: [10, 22], a: NARANJA }] },
  'chibi-03-h': { ocultar: [0, 1], accesorios: [['cuernos', '#d02840'], ['alas', NEGRO]],
    tenir: [{ p: [2], a: '#3a2246' }, { p: [4, 5, 6, 7, 8, 11], a: NARANJA }, { p: [23, 24, 28], a: NEGRO },
      { p: [25, 26, 27], a: CARMESI, piel: true }, { p: [29, 30, 31, 32], a: NEGRO, piel: true }] },
  'chibi-04-h': { accesorios: [['fantasmita']],
    tenir: [{ p: [2, 7, 27], a: '#2b2433' }, { p: [25, 28, 29, 31, 32], a: NARANJA }, { p: [30], a: '#7a3fb0' }, { p: [8], a: '#7dff9a' }] },
  'chibi-05-h': { accesorios: [['cubeta']],
    tenir: [{ p: [2, 7], a: '#3b2350', piel: true }, { p: [1], si: 'verde', a: NARANJA }, { p: [18, 22], si: 'rojo', a: NARANJA }, { p: [18, 22], si: 'verde', a: '#3b2350' },
      { p: [23, 25, 26], a: NARANJA }, { p: [24], a: MORADO }, { p: [29, 30], a: '#4a2a78', piel: true }] },
  'chibi-06-h': { accesorios: [],
    tenir: [{ p: [0, 16], si: 'color', a: '#2a2433', piel: true }, { p: [1, 2], a: '#ffd34d' }, { p: [17, 18, 19], a: NARANJA }] },
  'chibi-07-h': { ocultar: [0, 16], accesorios: [['bruja', NEGRO, '#7dd36b']],
    tenir: [{ p: [13], si: 'rojo', a: NEGRO }, { p: [13], si: 'dorado', a: '#7a3fb0' }, { p: [14, 15], a: NARANJA }] },
  'chibi-08-h': { accesorios: [['fantasmita']],
    tenir: [{ p: [24, 25, 26, 27, 28], a: '#3d2a63' }, { p: [0], a: '#e2dcf4' }, { p: [1], a: '#8f86b8' }] },
  'chibi-09-h': { accesorios: [],
    tenir: [{ p: [0, 16], a: '#3a2a4a', piel: true }, { p: [15, 17], a: NARANJA }, { p: [18, 19], a: CARMESI, piel: true }, { p: [5], a: '#b7a6ff' }] },
  'chibi-10-h': { ocultar: [5, 6, 9, 10], accesorios: [['capa', '#1f1a26', CARMESI]],
    tenir: [{ p: [0, 22], si: 'rojo', a: '#1f1a26' }, { p: [0, 22], si: 'dorado', a: CARMESI, piel: true }, { p: [1, 2, 20, 21, 25], a: CARMESI }] },
  'chibi-11-h': { accesorios: [['alas', '#2a2433']],
    tenir: [{ p: [0], a: '#3b2a55' }, { p: [13], si: 'azul', a: '#2a2433' }, { p: [14, 15, 16], a: NARANJA }, { p: [17], a: MORADO }] },
  'chibi-12-h': { ocultar: [0, 1, 5, 6], accesorios: [['bruja', '#3a2350', '#f08a24']],
    tenir: [{ p: [24], a: '#6a35a8' }, { p: [2, 4, 7, 8], a: '#b7a6ff' },
      { p: [20, 21, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42], a: '#f08a24' }, { p: [43, 44], a: '#4a2f70', piel: true }] },
  'chibi-13-h': { accesorios: [['paja']],
    tenir: [{ p: [17], si: 'verde', a: '#d0661e' }, { p: [0], si: 'dorado', a: '#7a3fb0', piel: true }, { p: [0], no: ['dorado'], a: '#d9b45a', piel: true }] },
  'chibi-14-h': { accesorios: [['capa', '#1f1a26', '#c0283c']],
    tenir: [{ p: [0], a: '#1f1a26' }, { p: [13], si: 'rojo', a: '#7a1020' }] },
  'chibi-15-h': { accesorios: [['cubeta']],
    tenir: [{ p: [0], si: 'rojo', a: NARANJA }, { p: [0], si: 'palido', a: '#2a2433', piel: true }, { p: [0], si: 'verde', a: MORADO },
      { p: [3], si: 'rojo', a: MORADO }, { p: [18], a: NARANJA }] },
  'chibi-16-h': { accesorios: [['fantasmita']],
    tenir: [{ p: [0], si: 'palido', a: NARANJA, piel: true }, { p: [0], si: 'rojo', a: '#2a2433' }, { p: [2], a: '#ffd34d', piel: true },
      { p: [14], no: ['verde', 'azul'], a: NARANJA, liso: true, piel: true }, { p: [14], si: 'verde', a: MORADO }] },

  // ---- Segundo disfraz ----
  'chibi-01-h2': { accesorios: [], // Momia
    tenir: [{ p: [0, 1, 3, 4, 5, 12, 16, 17, 18, 19, 20, 21, 22], a: '#e6dcc4', liso: true, vendas: true, piel: true }] },
  'chibi-02-h2': { accesorios: [], // Osito zombi
    tenir: [{ p: 'todas', si: 'piel', a: '#9cbf8c', piel: true }, { p: [0, 1, 2, 31, 32], a: '#6b5a48' }, { p: [10, 22], a: '#7a1f2a' }, { p: [21], a: '#4a6b3a' }] },
  'chibi-03-h2': { ocultar: [0, 1], accesorios: [['sabana']], // Fantasmita de sábana
    tenir: [{ p: [29, 30, 31, 32], a: NEGRO, piel: true }] },
  'chibi-04-h2': { accesorios: [], // Wendigo
    tenir: [{ p: 'todas', si: 'piel', a: '#d8d2c4', piel: true }, { p: [2, 7, 27], a: '#3d3229' }, { p: [25, 28, 29, 31, 32], a: '#5a1a1a' },
      { p: [30], a: '#c8ccd4' }, { p: [8], a: NOCHE }] },
  'chibi-05-h2': { ocultar: [0, 1, 2, 4, 7], accesorios: [['calabaza'], ['corona', 0.72]], // Rey calabaza
    tenir: [{ p: [18, 22], si: 'rojo', a: '#4f7a2a' }, { p: [18, 22], si: 'verde', a: NARANJA }, { p: [23, 25, 26], a: '#ffd34d' }, { p: [29, 30], a: '#4f7a2a', piel: true }] },
  'chibi-06-h2': { accesorios: [['mago', '#2e2466']], // Hechicero
    tenir: [{ p: [0, 16], si: 'color', a: '#2e2466', piel: true }, { p: [1, 2], a: '#7de0ff' }, { p: [17, 18, 19], a: '#ffd34d' }] },
  'chibi-07-h2': { ocultar: [16], accesorios: [['patasArana', NOCHE]], // Araña
    tenir: [{ p: [0], a: NOCHE, piel: true }, { p: [1], a: '#4a2f70' }, { p: [13], si: 'rojo', a: NOCHE }, { p: [13], si: 'dorado', a: '#6a35a8' }, { p: [14, 15], a: CARMESI }] },
  'chibi-08-h2': { accesorios: [['alasHada', '#8a4fd8']], // Hada oscura
    tenir: [{ p: [24, 25, 26, 27, 28], a: '#2a1d3d' }, { p: [0], a: '#6a35a8' }, { p: [1], a: '#5b4a8a' }] },
  'chibi-09-h2': { accesorios: [['capa', NOCHE, '#3b2a55'], ['guadana']], // Segador
    tenir: [{ p: [0, 16], a: NOCHE, piel: true }, { p: [15, 17], a: MORADO }, { p: [18, 19], a: '#c8ccd4', piel: true }, { p: [5], a: '#e8e4f6' }] },
  'chibi-10-h2': { ocultar: [0, 1, 2, 5, 6, 9, 10], accesorios: [['tricornio']], fantasma: '#a8e6ff', // Fantasma pirata
    tenir: [{ p: [22], si: 'rojo', a: '#2f6f7a' }, { p: [22], si: 'dorado', a: '#ffd34d', piel: true }] },
  'chibi-11-h2': { ocultar: [14, 15, 16], accesorios: [['capa', NOCHE, '#c0283c']], // Vampiro
    tenir: [{ p: [0], a: NOCHE }, { p: [13], si: 'azul', a: '#5a0f1f' }, { p: [12, 17], a: '#c0283c' }] },
  'chibi-12-h2': { ocultar: [0, 1, 5, 6], accesorios: [['flores']], // Catrina
    tenir: [{ p: 'todas', si: 'piel', a: '#f6f1e8', piel: true }, { p: [24], a: NOCHE }, { p: [2, 4, 7, 8], a: '#2a2433' },
      { p: [20, 21, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42], a: '#d6336c' }, { p: [43, 44], a: NOCHE, piel: true }] },
  'chibi-13-h2': { accesorios: [['orejasLobo', '#5a5560'], ['cola', '#5a5560']], // Hombre lobo
    tenir: [{ p: [0], a: '#4a4550', piel: true }, { p: [17], si: 'verde', a: '#4a3a2a' }, { p: [16], a: '#7a1f2a' }] },
  'chibi-14-h2': { accesorios: [['tornillos']], // Frankenstein
    tenir: [{ p: [2], a: '#8fb88a', piel: true }, { p: [0], a: NOCHE }, { p: [13], si: 'rojo', a: '#2a2a35' }] },
  'chibi-15-h2': { ocultar: [0, 3], accesorios: [['bruja', '#ff7ab8', '#7dd36b'], ['cubeta']], // Bruja caramelo
    tenir: [{ p: [18], a: '#ff7ab8' }, { p: [17], si: 'color', a: '#b388ff' }] },
  'chibi-16-h2': { accesorios: [['costillas']], // Esqueleto
    tenir: [{ p: 'todas', si: 'piel', a: HUESO, piel: true }, { p: [14], no: ['verde', 'azul'], a: NOCHE, liso: true, piel: true },
      { p: [14], si: 'verde', a: '#3a3a44' }, { p: [0], no: ['oscuro'], a: NOCHE, piel: true }] },

  // ---- Zorritas (id "chibi-NN-z"; ver ZORRITAS en vrm.ts) ----
  'chibi-03-z': { ocultar: [0, 1], accesorios: [['orejasZorro', '#c8321e', '#fff1e6'], ['colasZorro', '#c8321e', 3]], // Zorrita Roja
    tenir: [{ p: [2], a: '#c8321e' }, { p: [4, 5, 6, 7, 8, 11], a: '#ffd9a0' }] },
  'chibi-08-z': { accesorios: [['orejasZorro', '#f4f1fb', '#ffb3c6'], ['colasZorro', '#f4f1fb', 5]], // Kitsune Blanca
    tenir: [{ p: [0], a: '#f6f3ff' }, { p: [1], a: '#d9d2ee' }, { p: [24, 25, 26, 27, 28], a: CARMESI }] },
  'chibi-12-z': { ocultar: [0, 1, 5, 6], accesorios: [['orejasZorro', '#d4501f', '#fff1e6'], ['colasZorro', '#d4501f', 3]], // Bruja Zorra
    tenir: [{ p: [2, 4, 7, 8], a: '#d4501f' }, { p: [24], a: '#2a2433' }] },
};

/** Número de pieza de cada vértice (componentes conexos, uniendo vértices que comparten posición), de arriba abajo. */
function piezas(g: THREE.BufferGeometry) {
  const pos = g.attributes.position, idx = g.index!.array, n = pos.count;
  const padre = Int32Array.from({ length: n }, (_, i) => i);
  const raiz = (i: number) => { while (padre[i] !== i) i = padre[i] = padre[padre[i]]; return i; };
  const unir = (a: number, b: number) => { a = raiz(a); b = raiz(b); if (a !== b) padre[a] = b; };
  for (let t = 0; t < idx.length; t += 3) { unir(idx[t], idx[t + 1]); unir(idx[t], idx[t + 2]); }
  const clave = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const c = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const otro = clave.get(c); if (otro === undefined) clave.set(c, i); else unir(i, otro);
  }
  const alto = new Map<number, number>();
  for (let i = 0; i < n; i++) { const r = raiz(i); alto.set(r, Math.max(alto.get(r) ?? -Infinity, pos.getY(i))); }
  const num = new Map([...alto.keys()].sort((a, b) => alto.get(b)! - alto.get(a)!).map((r, j) => [r, j]));
  return Int32Array.from({ length: n }, (_, i) => num.get(raiz(i))!);
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function rgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h * 6) % 2) - 1)), m = l - c / 2, k = Math.floor(h * 6) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const hex = (c: string) => hsl(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16));

const esPiel = (h: number, s: number, l: number) => h > 0.01 && h < 0.11 && s > 0.25 && s < 0.85 && l > 0.55 && l < 0.93;
const esClaro = (s: number, l: number) => (l > 0.8 && s < 0.5) || (s < 0.12 && l > 0.6);
function deClase(c: Clase, h: number, s: number, l: number) {
  switch (c) {
    case 'todo': return true;
    case 'claro': return esClaro(s, l);
    case 'palido': return l > 0.72;
    case 'color': return s > 0.3 && l > 0.22 && !esClaro(s, l);
    case 'rojo': return (h < 0.03 || h > 0.93) && s > 0.35 && l > 0.15 && l < 0.85;
    case 'dorado': return h >= 0.07 && h < 0.17 && s > 0.45 && l > 0.3 && l < 0.85;
    case 'verde': return h >= 0.17 && h < 0.47 && s > 0.15 && l > 0.12;
    case 'azul': return h >= 0.47 && h < 0.72 && s > 0.15 && l > 0.12;
    case 'piel': return esPiel(h, s, l);
    case 'oscuro': return l < 0.25;
  }
}

/** Repinta la textura: el tono y la saturación pasan al color pedido; la luz se corre para que el promedio quede en
 *  la del color pedido, conservando las sombras (o las del dibujo borroso, si es `liso`). */
function repintar(img: CanvasImageSource & { width: number; height: number }, g: THREE.BufferGeometry, pieza: Int32Array, tintes: Tinte[]) {
  const w = img.width, h = img.height, lienzo = document.createElement('canvas');
  lienzo.width = w; lienzo.height = h;
  const cx = lienzo.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(img, 0, 0);
  const datos = cx.getImageData(0, 0, w, h), px = datos.data, original = new Uint8ClampedArray(px);
  let borroso: Uint8ClampedArray | null = null;
  if (tintes.some((t) => t.liso)) {
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const bx = b.getContext('2d', { willReadFrequently: true })!; bx.filter = `blur(${Math.round(w / 45)}px)`; bx.drawImage(img, 0, 0);
    borroso = bx.getImageData(0, 0, w, h).data;
  }
  const uv = g.attributes.uv, idx = g.index!.array, mascara = document.createElement('canvas');
  mascara.width = w; mascara.height = h;
  const mx = mascara.getContext('2d', { willReadFrequently: true })!;
  const periodo = w / 40; // ancho de las vendas de momia, en píxeles de la textura
  for (const t of tintes) {
    const todas = t.p === 'todas', set = new Set<number>(t.p === 'todas' ? [] : t.p);
    mx.clearRect(0, 0, w, h); mx.fillStyle = mx.strokeStyle = '#fff'; mx.lineWidth = 2; mx.beginPath();
    for (let i = 0; i < idx.length; i += 3) {
      if (!todas && !set.has(pieza[idx[i]])) continue;
      for (let e = 0; e < 3; e++) { const v = idx[i + e], x = uv.getX(v) * w, y = uv.getY(v) * h; if (e) mx.lineTo(x, y); else mx.moveTo(x, y); }
      mx.closePath();
    }
    mx.fill(); mx.stroke();
    const m = mx.getImageData(0, 0, w, h).data, [ht, st, lt] = hex(t.a), elegidos: number[] = [];
    let suma = 0;
    for (let o = 0; o < px.length; o += 4) {
      if (!m[o + 3]) continue;
      const [hh, ss, ll] = hsl(original[o], original[o + 1], original[o + 2]);
      if (!t.piel && t.si !== 'piel' && esPiel(hh, ss, ll)) continue;
      if (!deClase(t.si ?? 'todo', hh, ss, ll) || t.no?.some((c) => deClase(c, hh, ss, ll))) continue;
      const luz = borroso && t.liso ? hsl(borroso[o], borroso[o + 1], borroso[o + 2])[2] : ll;
      elegidos.push(o, luz); suma += luz;
    }
    const media = suma / Math.max(1, elegidos.length / 2);
    const frac = (v: number) => ((v % 1) + 1) % 1;
    for (let j = 0; j < elegidos.length; j += 2) {
      const o = elegidos[j];
      let luz = lt + (elegidos[j + 1] - media) * (t.liso ? 0.6 : 0.9);
      if (t.vendas) { // franjas cruzadas con su sombra, como tiras de tela enrolladas
        const x = (o / 4) % w, y = Math.floor(o / 4 / w), a = frac((x + y * 0.6) / periodo), b = frac((x * 0.45 - y) / (periodo * 1.7));
        luz += a < 0.1 ? -0.2 : a < 0.18 ? 0.05 : 0;
        if (b < 0.05) luz -= 0.12;
      }
      const c = rgb(ht, st, Math.min(0.97, Math.max(0.03, luz)));
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
    }
  }
  cx.putImageData(datos, 0, 0);
  return lienzo;
}

// ---- Accesorios: piezas simples fundidas en una sola malla con el sombreado ya pintado en sus colores ----
const LUZ = new THREE.Vector3(0.35, 0.9, 0.5).normalize();
const MATERIAL = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
function parte(g: THREE.BufferGeometry, color: string, pos = [0, 0, 0], rot = [0, 0, 0], esc = [1, 1, 1]) {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])), new THREE.Vector3(...esc)));
  const plano = g.index ? g.toNonIndexed() : g;
  if (!plano.attributes.normal) plano.computeVertexNormals();
  if (!plano.attributes.uv) plano.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(plano.attributes.position.count * 2), 2));
  const c = new THREE.Color(color), n = plano.attributes.normal, col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const k = 0.62 + 0.38 * Math.max(0, n.getX(i) * LUZ.x + n.getY(i) * LUZ.y + n.getZ(i) * LUZ.z);
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  plano.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return plano;
}
const fundir = (partes: THREE.BufferGeometry[]) => new THREE.Mesh(mergeGeometries(partes), MATERIAL);

function calabaza(r: number, conCara: boolean) {
  const g = new THREE.SphereGeometry(r, 32, 16), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const a = Math.atan2(v.z, v.x); v.x *= 1 + 0.07 * Math.cos(a * 8); v.z *= 1 + 0.07 * Math.cos(a * 8); p.setXYZ(i, v.x, v.y * 0.78, v.z); }
  g.computeVertexNormals();
  const partes = [parte(g, '#f07a1a'), parte(new THREE.CylinderGeometry(r * 0.09, r * 0.14, r * 0.4, 8), '#4f7a2a', [0, r * 0.88, 0], [0, 0, 0.3]),
    parte(new THREE.SphereGeometry(r * 0.22, 10, 6), '#6fae3a', [r * 0.25, r * 0.78, 0], [0, 0, 0], [1, 0.25, 0.6])];
  if (conCara) {
    const ojo = () => new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-1, -0.7), new THREE.Vector2(1, -0.7), new THREE.Vector2(0, 0.9)]));
    const boca = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-1, 0.2), new THREE.Vector2(-0.5, 0), new THREE.Vector2(-0.25, 0.25), new THREE.Vector2(0, 0), new THREE.Vector2(0.25, 0.25), new THREE.Vector2(0.5, 0), new THREE.Vector2(1, 0.2), new THREE.Vector2(0.4, -0.45), new THREE.Vector2(-0.4, -0.45)]));
    partes.push(parte(ojo(), '#2a1408', [-r * 0.33, r * 0.2, r * 0.97], [-0.2, -0.3, 0], [r * 0.16, r * 0.16, 1]),
      parte(ojo(), '#2a1408', [r * 0.33, r * 0.2, r * 0.97], [-0.2, 0.3, 0], [r * 0.16, r * 0.16, 1]),
      parte(boca, '#2a1408', [0, -r * 0.18, r * 1.0], [0.1, 0, 0], [r * 0.45, r * 0.4, 1]));
  }
  return partes;
}

function alaMurcielago(largo: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.05); s.lineTo(0.3, 0.32); s.lineTo(0.7, 0.4); s.lineTo(1, 0.22);
  s.quadraticCurveTo(0.9, 0.0, 0.8, 0.0); s.quadraticCurveTo(0.7, -0.08, 0.55, -0.02); s.quadraticCurveTo(0.42, -0.12, 0.28, -0.05); s.quadraticCurveTo(0.15, -0.12, 0, -0.08);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  g.scale(largo, largo, largo);
  return g;
}

function fantasma(t: number) {
  const g = new THREE.CylinderGeometry(0.5, 0.62, 0.8, 20, 1, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, p.getY(i) - 0.08 * Math.sin(a * 6)); }
  g.computeVertexNormals();
  const cabeza = new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const ojo = (x: number) => parte(new THREE.SphereGeometry(0.08, 10, 8), '#1b1424', [x, 0.42, 0.42], [0, 0, 0], [1, 1.3, 0.5]);
  const m = fundir([parte(g, '#f4f1ff', [0, 0, 0]), parte(cabeza, '#f4f1ff', [0, 0.4, 0]), ojo(-0.17), ojo(0.17),
    parte(new THREE.SphereGeometry(0.06, 8, 6), '#ff9fb4', [-0.3, 0.3, 0.4], [0, 0, 0], [1, 0.6, 0.4]), parte(new THREE.SphereGeometry(0.06, 8, 6), '#ff9fb4', [0.3, 0.3, 0.4], [0, 0, 0], [1, 0.6, 0.4])]);
  m.userData.fase = t;
  return m;
}

/** Un palo de `grosor` entre dos puntos. */
function barra(desde: THREE.Vector3, hasta: THREE.Vector3, grosor: number, color: string) {
  const dir = hasta.clone().sub(desde), g = new THREE.CylinderGeometry(grosor, grosor, dir.length(), 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(...desde.clone().add(hasta).multiplyScalar(0.5).toArray());
  return parte(g, color);
}
const estrella = () => new THREE.ShapeGeometry(new THREE.Shape(Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 + Math.PI / 2, d = i % 2 ? 0.45 : 1;
  return new THREE.Vector2(Math.cos(a) * d, Math.sin(a) * d);
})));

interface Medidas { tope: number; radio: number; frente: number; torso: number; cuello: THREE.Vector3; suelo: number; sueloCabeza: number; pechoAdelante: number }
const mayor = (lista: THREE.Vector3[], f: (q: THREE.Vector3) => number) => lista.reduce((max, q) => Math.max(max, f(q)), -Infinity);

/** Mide la cabeza (en el espacio del hueso de la cabeza) y el torso (en el del pecho) con las mallas ya vestidas
 *  (los chibis tienen una sola; los avatares de VRoid traen cara, cuerpo y pelo por separado). */
function medir(vrm: VRM, mallas: THREE.SkinnedMesh[], cabeza: THREE.Object3D, pecho: THREE.Object3D, raiz: THREE.Object3D): Medidas {
  raiz.updateMatrixWorld(true);
  const v = new THREE.Vector3(), enCabeza: THREE.Vector3[] = [], enPecho: THREE.Vector3[] = [];
  for (const malla of mallas) {
    malla.skeleton.update();
    const usados = malla.geometry.index ? new Set(malla.geometry.index.array) : Array.from({ length: malla.geometry.attributes.position.count }, (_, i) => i);
    for (const i of usados) {
      malla.getVertexPosition(i, v); v.applyMatrix4(malla.matrixWorld);
      enCabeza.push(cabeza.worldToLocal(v.clone())); enPecho.push(pecho.worldToLocal(v.clone()));
    }
  }
  const tope = mayor(enCabeza, (q) => q.y);
  const arriba = enCabeza.filter((q) => q.y > tope * 0.35);
  const cuello = pecho.worldToLocal((vrm.humanoid.getNormalizedBoneNode('neck') ?? cabeza).getWorldPosition(new THREE.Vector3()));
  const base = pecho.getWorldPosition(new THREE.Vector3()), piso = raiz.getWorldPosition(new THREE.Vector3());
  const suelo = pecho.worldToLocal(new THREE.Vector3(base.x, piso.y, base.z)).y;
  const torso = mayor(enPecho.filter((q) => q.y < cuello.y && q.y > suelo * 0.5), (q) => Math.hypot(q.x, q.z));
  const sobreCabeza = cabeza.getWorldPosition(new THREE.Vector3()), sueloCabeza = cabeza.worldToLocal(new THREE.Vector3(sobreCabeza.x, piso.y, sobreCabeza.z)).y;
  const pechoAdelante = mayor(enPecho.filter((q) => q.y < cuello.y && q.y > 0 && Math.abs(q.x) < torso * 0.3), (q) => q.z);
  return { tope, radio: mayor(arriba, (q) => Math.abs(q.x)), frente: mayor(arriba, (q) => q.z), torso, cuello, suelo, sueloCabeza, pechoAdelante };
}

/** Viste a un chibi recién creado con su disfraz de Halloween (si tiene uno). */
export function vestirHalloween(k: Kenney, id: string) {
  const d = DISFRACES[id];
  if (!d) return;
  const vrm = k.grupo.userData.vrm as VRM;
  let malla: THREE.SkinnedMesh | undefined;
  k.grupo.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && !malla) malla = o as THREE.SkinnedMesh; });
  if (!malla) return;
  const g = malla.geometry, pieza = piezas(g), material = malla.material as THREE.MeshBasicMaterial, vieja = material.map!;
  const tex = new THREE.CanvasTexture(repintar(vieja.image as HTMLCanvasElement, g, pieza, d.tenir));
  tex.flipY = vieja.flipY; tex.colorSpace = vieja.colorSpace; tex.wrapS = vieja.wrapS; tex.wrapT = vieja.wrapT;
  material.map = tex; material.needsUpdate = true; vieja.dispose();
  if (d.fantasma) { material.transparent = true; material.opacity = 0.72; material.color.set(d.fantasma); }
  if (d.ocultar?.length) {
    const fuera = new Set(d.ocultar), idx = g.index!.array, quedan: number[] = [];
    for (let t = 0; t < idx.length; t += 3) if (!fuera.has(pieza[idx[t]])) quedan.push(idx[t], idx[t + 1], idx[t + 2]);
    g.setIndex(quedan);
  }
  const hueso = (n: string) => vrm.humanoid.getNormalizedBoneNode(n as never);
  // Los VRM viejos (0.x) quedan girados media vuelta: sus huesos miran hacia -Z. Los accesorios van en un marco que mira al frente.
  const giro = vrm.meta?.metaVersion === '0' ? Math.PI : 0;
  const marco = (n: THREE.Object3D) => { const o = new THREE.Object3D(); o.rotation.y = giro; n.add(o); return o; };
  const cabeza = marco(hueso('head')!), pecho = marco(hueso('upperChest') ?? hueso('chest') ?? hueso('spine')!);
  const mallas: THREE.SkinnedMesh[] = [];
  k.grupo.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) mallas.push(o as THREE.SkinnedMesh); });
  const m = medir(vrm, mallas, cabeza, pecho, k.grupo), r = m.radio;
  const vivos: ((t: number) => void)[] = [];
  for (const a of d.accesorios) {
    switch (a[0]) {
      case 'calabaza': { const c = fundir(calabaza(r * 0.86, true)); c.position.set(0, m.tope * 1.0, 0); cabeza.add(c); break; }
      case 'bruja': {
        const s = fundir([parte(new THREE.CylinderGeometry(r * 1.3, r * 1.3, r * 0.06, 32), a[1]),
          parte(new THREE.ConeGeometry(r * 0.66, r * 1.5, 24), a[1], [r * 0.08, r * 0.75, 0], [0, 0, -0.22]),
          parte(new THREE.CylinderGeometry(r * 0.64, r * 0.67, r * 0.16, 24), a[2], [0, r * 0.1, 0]),
          parte(new THREE.BoxGeometry(r * 0.2, r * 0.15, r * 0.04), '#ffd34d', [0, r * 0.1, r * 0.66])]);
        s.position.set(0, m.tope * 0.86, -r * 0.04); s.rotation.x = -0.12; cabeza.add(s); break;
      }
      case 'paja': {
        // el gorro del chibi se pinta de paja y esto le pone el ala ancha
        const ala = new THREE.RingGeometry(r * 0.85, r * 1.55, 32, 1); ala.rotateX(-Math.PI / 2);
        const s = fundir([parte(ala, '#d9b45a')]);
        s.position.set(0, m.tope * 0.55, 0); s.rotation.set(-0.08, 0, 0.06); cabeza.add(s); break;
      }
      case 'cuernos': case 'orejasLobo': {
        const lobo = a[0] === 'orejasLobo', partes: THREE.BufferGeometry[] = [];
        for (const lado of [-1, 1]) {
          if (lobo) partes.push(parte(new THREE.ConeGeometry(r * 0.28, r * 0.55, 4), a[1], [lado * r * 0.55, m.tope * 0.92, 0], [0, Math.PI / 4, -lado * 0.35], [1, 1, 0.5]),
            parte(new THREE.ConeGeometry(r * 0.17, r * 0.36, 4), '#e8a0a8', [lado * r * 0.55, m.tope * 0.9, r * 0.07], [0, Math.PI / 4, -lado * 0.35], [1, 1, 0.3]));
          else partes.push(parte(new THREE.ConeGeometry(r * 0.13, r * 0.42, 12), a[1], [lado * r * 0.42, m.tope * 0.95, r * 0.15], [0.2, 0, -lado * 0.45]));
        }
        cabeza.add(fundir(partes)); break;
      }
      case 'alas': {
        const alas = [-1, 1].map((lado) => { const w = fundir([parte(alaMurcielago(r * 1.3), a[1])]); w.scale.x = lado; const p = new THREE.Group(); p.add(w); p.position.set(lado * m.torso * 0.25, m.cuello.y * 0.55, -m.torso * 0.9); pecho.add(p); return p; });
        vivos.push((t) => alas.forEach((p, i) => { p.rotation.y = (i ? -1 : 1) * (0.5 + 0.25 * Math.sin(t * 5)); }));
        break;
      }
      case 'capa': {
        const alto = (m.cuello.y - m.suelo) * 0.82, rt = m.torso * 0.75, rb = m.torso * 1.25;
        const fuera = new THREE.CylinderGeometry(rt, rb, alto, 20, 1, true, Math.PI / 2, Math.PI);
        const dentro = new THREE.CylinderGeometry(rt * 0.96, rb * 0.96, alto, 20, 1, true, Math.PI / 2, Math.PI);
        const cuello = new THREE.CylinderGeometry(rt * 1.5, rt * 0.95, r * 0.5, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8);
        const c = fundir([parte(fuera, a[1], [0, -alto / 2, 0]), parte(dentro, a[2], [0, -alto / 2, 0]), parte(cuello, a[1], [0, r * 0.22, 0])]);
        c.position.set(0, m.cuello.y, -m.torso * 0.1); pecho.add(c); break;
      }
      case 'cubeta': {
        const mano = hueso('rightHand');
        if (!mano) break;
        const c = fundir([...calabaza(r * 0.32, true), parte(new THREE.TorusGeometry(r * 0.3, r * 0.025, 6, 16, Math.PI), '#3a2a20', [0, r * 0.08, 0])]);
        const asa = new THREE.Group(); asa.add(c); c.position.y = -r * 0.3; mano.add(asa);
        const q = new THREE.Quaternion();
        vivos.push(() => { asa.parent!.getWorldQuaternion(q); asa.quaternion.copy(q.invert()).multiply(k.grupo.quaternion); });
        break;
      }
      case 'mago': {
        const H = r * 2, R = r * 0.62, partes = [parte(new THREE.CylinderGeometry(r * 1.25, r * 1.25, r * 0.06, 32), a[1]),
          parte(new THREE.ConeGeometry(R, H, 24), a[1], [0, H / 2, 0]), parte(new THREE.CylinderGeometry(R * 0.98, R, r * 0.14, 24), '#ffd34d', [0, r * 0.08, 0])];
        for (const [f, alto, tam] of [[-0.5, 0.35, 0.16], [0.35, 0.55, 0.12], [-0.1, 1.0, 0.11], [0.55, 1.2, 0.08], [-0.35, 1.45, 0.08]]) {
          const rc = R * (1 - (alto * r) / H) * 1.02;
          partes.push(parte(estrella(), '#ffd34d', [Math.sin(f) * rc, alto * r, Math.cos(f) * rc], [0, f, 0], [tam * r, tam * r, 1]));
        }
        const s = fundir(partes); s.position.set(0, m.tope * 0.86, 0); s.rotation.x = -0.08; cabeza.add(s); break;
      }
      case 'sabana': {
        // Sábana de fantasma: una cúpula sobre la cabeza que cae hasta las rodillas, con bordes ondulados y dos ojos
        const R = r * 1.12, arriba = m.tope * 1.03, abajo = m.sueloCabeza * 0.5, perfil = [new THREE.Vector2(0.001, arriba)];
        for (let i = 1; i <= 12; i++) { const ang = (i / 12) * (Math.PI / 2); perfil.push(new THREE.Vector2(Math.sin(ang) * R, arriba - R + Math.cos(ang) * R)); }
        perfil.push(new THREE.Vector2(R * 1.35, abajo));
        const g = new THREE.LatheGeometry(perfil, 32), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - abajo) < 1e-4) p.setY(i, abajo + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 7) * R * 0.08);
        g.computeVertexNormals();
        const yOjo = arriba - R * 0.55, zOjo = Math.sqrt(Math.max(0, R * R - (yOjo - (arriba - R)) ** 2 - (0.3 * R) ** 2)) + r * 0.02;
        const ojo = (x: number) => parte(new THREE.CircleGeometry(R * 0.11, 16), NOCHE, [x, yOjo, zOjo], [0, x > 0 ? 0.3 : -0.3, 0], [1, 1.4, 1]);
        const chapa = (x: number) => parte(new THREE.CircleGeometry(R * 0.08, 12), '#ffb3c6', [x, yOjo - R * 0.24, zOjo - r * 0.03], [0, x > 0 ? 0.4 : -0.4, 0], [1.3, 0.7, 1]);
        cabeza.add(fundir([parte(g, '#ffffff'), ojo(-0.3 * R), ojo(0.3 * R), chapa(-0.48 * R), chapa(0.48 * R)])); break;
      }
      case 'tornillos': {
        const partes: THREE.BufferGeometry[] = [];
        for (const lado of [-1, 1]) partes.push(parte(new THREE.CylinderGeometry(r * 0.07, r * 0.07, r * 0.36, 8), '#9aa0a8', [lado * r * 0.95, m.tope * 0.14, 0], [0, 0, Math.PI / 2]),
          parte(new THREE.CylinderGeometry(r * 0.13, r * 0.13, r * 0.08, 6), '#7a8088', [lado * r * 1.12, m.tope * 0.14, 0], [0, 0, Math.PI / 2]));
        cabeza.add(fundir(partes)); break;
      }
      case 'patasArana': {
        const s = m.torso, lados = [-1, 1].map((lado) => {
          const partes: THREE.BufferGeometry[] = [], V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
          for (let i = 0; i < 4; i++) {
            const dz = (i - 1.5) * s * 0.45, base = V(lado * s * 0.25, m.cuello.y * 0.45, -s * 0.75), rodilla = V(lado * s * 1.25, m.cuello.y * 0.45 + s * 0.7, -s * 0.9 + dz), pie = V(lado * s * 1.9, m.cuello.y * 0.45 - s * 0.5, -s * 0.8 + dz * 1.4);
            partes.push(barra(base, rodilla, s * 0.07, a[1]), barra(rodilla, pie, s * 0.055, a[1]));
          }
          partes.push(parte(new THREE.SphereGeometry(s * 0.4, 12, 8), a[1], [0, m.cuello.y * 0.45, -s * 0.85], [0, 0, 0], [1, 0.9, 1.1]));
          const g = fundir(partes); pecho.add(g); return g;
        });
        vivos.push((t) => lados.forEach((g, i) => { g.rotation.z = (i ? -1 : 1) * 0.06 * Math.sin(t * 6 + i); }));
        break;
      }
      case 'alasHada': {
        const ala = (color: string, claro: string) => fundir([
          parte(new THREE.CircleGeometry(r * 1.05, 24), color, [r * 0.95, r * 0.55, 0], [0, 0, 0.5], [1, 0.62, 1]),
          parte(new THREE.CircleGeometry(r * 0.7, 20), color, [r * 0.65, -r * 0.4, 0], [0, 0, -0.6], [1, 0.62, 1]),
          parte(new THREE.CircleGeometry(r * 0.45, 16), claro, [r * 0.95, r * 0.55, 0.002], [0, 0, 0.5], [1, 0.62, 1])]);
        const alas = [-1, 1].map((lado) => { const w = ala(a[1], '#d8b4ff'); w.scale.x = lado; const p = new THREE.Group(); p.add(w); p.position.set(lado * m.torso * 0.15, m.cuello.y * 0.6, -m.torso * 0.9); pecho.add(p); return p; });
        vivos.push((t) => alas.forEach((p, i) => { p.rotation.y = (i ? -1 : 1) * (0.2 + 0.25 * Math.sin(t * 3.2)); }));
        break;
      }
      case 'guadana': {
        const mano = hueso('rightHand');
        if (!mano) break;
        const hoja = new THREE.TorusGeometry(r * 1.0, r * 0.12, 4, 20, Math.PI * 0.8);
        const c = fundir([parte(new THREE.CylinderGeometry(r * 0.09, r * 0.09, r * 3.6, 8), '#5a3e2b', [0, r * 1.0, 0]),
          parte(hoja, '#d8dce4', [-r * 1.0, r * 2.75, 0], [0, 0, 0], [1, 0.5, 0.6])]);
        c.position.z = r * 0.4; // un poco por delante, para que se vea de frente
        const asa = new THREE.Group(); asa.add(c); mano.add(asa);
        const q = new THREE.Quaternion();
        vivos.push(() => { asa.parent!.getWorldQuaternion(q); asa.quaternion.copy(q.invert()).multiply(k.grupo.quaternion); });
        break;
      }
      case 'tricornio': {
        const s = fundir([parte(new THREE.CylinderGeometry(r * 1.3, r * 1.3, r * 0.08, 3), NOCHE, [0, 0, 0], [0, 0, 0], [1, 1, 0.9]),
          parte(new THREE.CylinderGeometry(r * 1.32, r * 1.32, r * 0.04, 3), '#ffd34d', [0, -r * 0.01, 0], [0, 0, 0], [1, 1, 0.9]),
          parte(new THREE.SphereGeometry(r * 0.72, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), NOCHE, [0, 0, 0], [0, 0, 0], [1, 0.75, 1]),
          parte(new THREE.CircleGeometry(r * 0.14, 14), HUESO, [0, r * 0.3, r * 0.64], [-0.4, 0, 0])]);
        s.position.set(0, m.tope * 0.82, 0); cabeza.add(s); break;
      }
      case 'corona': {
        const partes = [parte(new THREE.CylinderGeometry(r * 0.45, r * 0.45, r * 0.16, 20, 1, true), '#ffd34d')];
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          partes.push(parte(new THREE.ConeGeometry(r * 0.1, r * 0.3, 6), '#ffd34d', [Math.sin(ang) * r * 0.45, r * 0.22, Math.cos(ang) * r * 0.45]),
            parte(new THREE.SphereGeometry(r * 0.05, 8, 6), i % 2 ? '#c0283c' : '#7a3fb0', [Math.sin(ang) * r * 0.47, 0, Math.cos(ang) * r * 0.47]));
        }
        const c = fundir(partes); c.position.set(0, m.tope + r * a[1], 0); c.rotation.z = 0.12; cabeza.add(c); break;
      }
      case 'flores': {
        const colores = ['#ff4f9a', '#ffb020', '#b46bff', '#ff6b3d'], partes: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 1.2 - Math.PI * 0.1; // un arco sobre la frente y los costados
          partes.push(parte(new THREE.SphereGeometry(r * (i % 2 ? 0.13 : 0.17), 10, 8), colores[i % 4], [Math.cos(ang) * r * 0.92, m.tope * 0.8, Math.sin(ang) * r * 0.7], [0, 0, 0], [1, 0.75, 1]));
        }
        cabeza.add(fundir(partes)); break;
      }
      case 'cola': {
        const cadera = hueso('hips');
        if (!cadera) break;
        const c = fundir([parte(new THREE.SphereGeometry(m.torso * 0.32, 12, 10), a[1], [0, 0, -m.torso * 0.75], [0, 0, 0], [1, 1, 2.4]),
          parte(new THREE.SphereGeometry(m.torso * 0.2, 10, 8), '#d8d2c4', [0, 0, -m.torso * 1.45], [0, 0, 0], [1, 1, 1.6])]);
        const base = marco(cadera), meneo = new THREE.Group(); meneo.rotation.x = -0.6; meneo.add(c); base.add(meneo);
        vivos.push((t) => { meneo.rotation.y = 0.35 * Math.sin(t * 4); });
        break;
      }
      case 'orejasZorro': {
        // Orejas altas y puntiagudas, con el interior claro y un mechón en la base
        const partes: THREE.BufferGeometry[] = [];
        for (const lado of [-1, 1]) {
          const pos = [lado * r * 0.52, m.tope * 0.9, -r * 0.05], rot = [-0.12, lado * 0.25, -lado * 0.32];
          partes.push(parte(new THREE.ConeGeometry(r * 0.27, r * 0.78, 4, 1), a[1], pos, rot, [1, 1, 0.42]),
            parte(new THREE.ConeGeometry(r * 0.17, r * 0.55, 4, 1), a[2], [pos[0] - lado * r * 0.01, pos[1] - r * 0.06, pos[2] + r * 0.06], rot, [1, 1, 0.25]),
            parte(new THREE.SphereGeometry(r * 0.13, 8, 6), a[2], [pos[0] * 0.92, pos[1] - r * 0.3, pos[2] + r * 0.1], [0, 0, 0], [1.2, 0.8, 0.6]));
        }
        cabeza.add(fundir(partes)); break;
      }
      case 'colasZorro': {
        // Varias colas esponjosas en abanico, cada una con la punta blanca, que se mecen desfasadas
        const cadera = hueso('hips');
        if (!cadera) break;
        // tamaño por el ancho de caderas (el pelo largo de VRoid inflaría la medida del torso)
        const piernaI = hueso('leftUpperLeg'), piernaD = hueso('rightUpperLeg');
        k.grupo.updateMatrixWorld(true);
        const ancho = piernaI && piernaD ? piernaI.getWorldPosition(new THREE.Vector3()).distanceTo(piernaD.getWorldPosition(new THREE.Vector3())) / Math.max(1e-6, cadera.getWorldScale(new THREE.Vector3()).x) : m.torso;
        const n = a[2], s = Math.min(m.torso * 1.2, ancho * 1.7), base = marco(cadera), colas: THREE.Group[] = [], apertura = n > 1 ? 2.1 : 0;
        for (let i = 0; i < n; i++) {
          const abre = n === 1 ? 0 : (i / (n - 1) - 0.5) * apertura, partes: THREE.BufferGeometry[] = [];
          for (let j = 0; j < 5; j++) { // bulto que engorda y adelgaza hacia la punta
            const k = j / 4, grosor = s * (0.22 + 0.2 * Math.sin(k * Math.PI * 0.85)), z = -s * (0.45 + k * 1.15), y = s * 0.35 * k * k;
            partes.push(parte(new THREE.SphereGeometry(grosor, 10, 8), j === 4 ? '#f6f1e8' : a[1], [0, y, z], [0, 0, 0], [1, 1, 1.35]));
          }
          const cola = new THREE.Group(); cola.add(fundir(partes)); cola.rotation.set(0.95, abre, abre * 0.5);
          base.add(cola); colas.push(cola);
        }
        vivos.push((t) => colas.forEach((c, i) => { c.rotation.y = (n === 1 ? 0 : (i / (n - 1) - 0.5) * apertura) + 0.18 * Math.sin(t * 3 + i * 1.3); }));
        break;
      }
      case 'costillas': {
        // Pijama de esqueleto: esternón y tres pares de costillas por delante del pecho
        const s = m.torso, z = m.pechoAdelante + s * 0.04, arriba = m.cuello.y * 0.6, abajo = m.suelo * 0.15;
        const partes = [barra(new THREE.Vector3(0, arriba, z), new THREE.Vector3(0, abajo, z), s * 0.08, HUESO)];
        for (let i = 0; i < 3; i++) for (const lado of [-1, 1]) {
          const y = arriba + (abajo - arriba) * (0.12 + i * 0.3);
          partes.push(barra(new THREE.Vector3(0, y, z), new THREE.Vector3(lado * s * 0.7, y - s * 0.12, z - s * 0.2), s * 0.065, HUESO));
        }
        pecho.add(fundir(partes)); break;
      }
      case 'fantasmita': {
        const f = fantasma(Math.random() * 6), escala = 0.32;
        f.scale.setScalar(escala); k.grupo.add(f);
        vivos.push((t) => { const fa = f.userData.fase + t; f.position.set(0.85 + 0.08 * Math.sin(fa * 0.7), 1.55 + 0.1 * Math.sin(fa * 2), -0.25); f.rotation.y = -0.4 + 0.2 * Math.sin(fa); });
        break;
      }
    }
  }
  if (vivos.length) {
    const avanzar = k.grupo.userData.avanzar as (dt: number) => void;
    let t = 0;
    k.grupo.userData.avanzar = (dt: number) => { avanzar(dt); t += dt; for (const f of vivos) f(t); };
    k.grupo.userData.avanzar(0);
  }
}
