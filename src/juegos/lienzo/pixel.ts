// Pixel art para los juegos de lienzo (estilo 8 bits). Todo se dibuja una sola vez, al partir, en canvas pequeños;
// en cada cuadro el juego solo los copia con drawImage (lo más barato que hay). Sin archivos ni recursos de terceros.

/** Paleta común (32 colores), para que los juegos se vean de una misma familia. */
export const PAL = {
  negro: '#0e0b16', noche: '#1b1630', violetaOscuro: '#3a2a5a', violeta: '#7a3ad0', lila: '#b06bff',
  azulOscuro: '#1d3a6e', azul: '#2f6bd8', celeste: '#7fb4ff', hielo: '#bfe9ff', blanco: '#f4f1ea',
  grisOscuro: '#3e3e4a', gris: '#7a7a86', grisClaro: '#b9b9c6',
  verdeOscuro: '#1e5c2a', verde: '#3fa34d', verdeClaro: '#7fd85a', menta: '#7cffcb',
  cafeOscuro: '#4a2c14', cafe: '#8a5a32', madera: '#b07a48', arena: '#e3b07a',
  rojoOscuro: '#7a0f2b', rojo: '#e8325a', rosado: '#ff8fc8', durazno: '#ffb38a',
  naranjo: '#ff8a2a', naranjoOscuro: '#c95a10', amarillo: '#ffd23c', crema: '#fff1c9', dorado: '#c98a00',
  piel: '#ffd9b3', pielOscura: '#c98a5a',
} as const;

export type Sprite = HTMLCanvasElement;

export function crearSprite(w: number, h: number, dibujar: (g: CanvasRenderingContext2D) => void): Sprite {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  dibujar(g);
  return cv;
}

/** Sprite desde texto: cada carácter es un píxel ('.' o ' ' es transparente). */
export function desdeTexto(filas: string[], colores: Record<string, string>): Sprite {
  const w = Math.max(...filas.map((f) => f.length));
  return crearSprite(w, filas.length, (g) => filas.forEach((fila, y) => [...fila].forEach((ch, x) => { const c = colores[ch]; if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); } })));
}

// Tramado ordenado 4 × 4: mezcla dos tonos sin degradados (el sombreado clásico del pixel art)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const tramado = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

export interface Tonos { borde: string; sombra: string; base: string; luz: string; brillo?: string }

/** Esfera (o elipse) sombreada con luz arriba a la izquierda, contorno de 1 píxel y brillo. */
export function bola(rx: number, ry: number, t: Tonos, extra?: (g: CanvasRenderingContext2D, w: number, h: number) => void): Sprite {
  const w = Math.ceil(rx * 2) + 2, h = Math.ceil(ry * 2) + 2, cx = w / 2, cy = h / 2;
  const dentro = (x: number, y: number) => { const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry; return nx * nx + ny * ny <= 1; };
  return crearSprite(w, h, (g) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!dentro(x, y)) continue;
      const borde = !dentro(x - 1, y) || !dentro(x + 1, y) || !dentro(x, y - 1) || !dentro(x, y + 1);
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const luz = -0.55 * nx - 0.6 * ny + 0.58 * nz, u = tramado(x, y);
      let c = luz < 0.05 + u * 0.25 ? t.sombra : luz < 0.62 + u * 0.18 ? t.base : t.luz;
      if (t.brillo && nx > -0.62 && nx < -0.28 && ny > -0.66 && ny < -0.34) c = t.brillo;
      g.fillStyle = borde ? t.borde : c; g.fillRect(x, y, 1, 1);
    }
    extra?.(g, w, h);
  });
}

/** Media fruta vista desde el corte: borde de piel, pulpa, centro y semillas (la cara plana hacia abajo del sprite). */
export function media(r: number, piel: string, pulpa: string, centro: string, semilla: string, nSemillas: number): Sprite {
  const w = Math.ceil(r * 2) + 2, h = Math.ceil(r) + 2, cx = w / 2;
  return crearSprite(w, h, (g) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - cx) / r, ny = (h - 1 - y) / r, d = nx * nx + ny * ny;
      if (d > 1) continue;
      g.fillStyle = d > 0.72 ? piel : d < 0.12 + tramado(x, y) * 0.06 ? centro : pulpa;
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = semilla;
    for (let i = 0; i < nSemillas; i++) { const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, nSemillas - 1)), d = r * 0.5; g.fillRect(Math.round(cx + Math.cos(a) * d) - 1, Math.round(h - 1 - Math.sin(a) * d * 0.9), 1, 2); }
  });
}

const siluetas = new WeakMap<Sprite, Sprite>(), espejos = new WeakMap<Sprite, Sprite>(), giros = new WeakMap<Sprite, Sprite[]>();
/** El mismo sprite en blanco: el destello de un golpe. */
export function silueta(s: Sprite, color = '#ffffff'): Sprite {
  let o = siluetas.get(s);
  if (!o) { o = crearSprite(s.width, s.height, (g) => { g.drawImage(s, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, s.width, s.height); }); siluetas.set(s, o); }
  return o;
}
/** El sprite mirando al otro lado. */
export function espejo(s: Sprite): Sprite {
  let o = espejos.get(s);
  if (!o) { o = crearSprite(s.width, s.height, (g) => { g.translate(s.width, 0); g.scale(-1, 1); g.drawImage(s, 0, 0); }); espejos.set(s, o); }
  return o;
}
/** El sprite girado, en 16 pasos (se calculan una vez, sin suavizar, para que siga siendo pixel art). */
export function girado(s: Sprite, angulo: number): Sprite {
  let lista = giros.get(s);
  if (!lista) {
    const lado = Math.ceil(Math.hypot(s.width, s.height)) + 2;
    lista = Array.from({ length: 16 }, (_, i) => crearSprite(lado, lado, (g) => { g.translate(lado / 2, lado / 2); g.rotate((i / 16) * Math.PI * 2); g.drawImage(s, -s.width / 2, -s.height / 2); }));
    giros.set(s, lista);
  }
  const i = ((Math.round((angulo / (Math.PI * 2)) * 16) % 16) + 16) % 16;
  return lista[i];
}
/** Mezcla dos colores "#rrggbb" (k de 0 a 1). */
export function mezcla(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), f = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1)}`;
}
