import * as THREE from 'three';
import { cargar, sembrar, type Origen } from '../nucleo/modelos';

// Piezas de ambientación que comparten los juegos 3D: cielos, texturas pintadas por código (pasto, ladrillo, lava),
// bosques de modelos de Kenney dibujados como instancias y humo liviano. Todo pensado para una gráfica integrada:
// texturas chicas, nada de luces extra ni sombras.

/** Cielo en degradado (una textura de 2 × 256 px como fondo de la escena). */
export function cielo(escena: THREE.Scene, arriba: string, abajo: string, medio?: string) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 2; lienzo.height = 256;
  const g = lienzo.getContext('2d')!, d = g.createLinearGradient(0, 0, 0, 256);
  d.addColorStop(0, arriba);
  if (medio) d.addColorStop(0.55, medio);
  d.addColorStop(1, abajo);
  g.fillStyle = d;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(lienzo);
  tex.colorSpace = THREE.SRGBColorSpace;
  escena.background = tex;
}

const pintar = (tam: number, dibujar: (g: CanvasRenderingContext2D) => void, repetir = true) => {
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = tam;
  dibujar(lienzo.getContext('2d')!);
  const tex = new THREE.CanvasTexture(lienzo);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repetir) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
};

/** Pasto cortado en franjas, con motas. `franjas` por cada repetición. */
export function pasto(claro: string, oscuro: string, franjas = 2) {
  return pintar(128, (g) => {
    for (let i = 0; i < franjas; i++) { g.fillStyle = i % 2 ? oscuro : claro; g.fillRect((i * 128) / franjas, 0, 128 / franjas, 128); }
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,40,0'},0.06)`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  });
}

/** Muro de ladrillos o piedras: filas desfasadas con junta. */
export function ladrillo(piedra: string, junta: string, filas = 4) {
  return pintar(128, (g) => {
    g.fillStyle = junta; g.fillRect(0, 0, 128, 128);
    const alto = 128 / filas;
    for (let f = 0; f < filas; f++) for (let c = -1; c < 3; c++) {
      const x = c * 64 + (f % 2) * 32, tono = 0.88 + Math.random() * 0.24;
      g.fillStyle = piedra; g.globalAlpha = 1; g.fillRect(x + 3, f * alto + 3, 58, alto - 6);
      g.fillStyle = tono > 1 ? '#ffffff' : '#000000'; g.globalAlpha = Math.abs(1 - tono); g.fillRect(x + 3, f * alto + 3, 58, alto - 6);
    }
    g.globalAlpha = 1;
  });
}

/** Lava: manchas brillantes sobre rojo oscuro. Para que fluya, mover `offset` en cada cuadro. */
export function lava() {
  return pintar(128, (g) => {
    g.fillStyle = '#b8240c'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * 128, y = Math.random() * 128, r = 6 + Math.random() * 16;
      for (const [dx, dy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) {
        const d = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        d.addColorStop(0, i % 3 ? '#ffb02e' : '#fff07a'); d.addColorStop(1, 'rgba(255,90,20,0)');
        g.fillStyle = d; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  });
}

/** Mancha redonda que se desvanece en el borde (luz en el suelo, resplandor). */
export function halo(color: string) {
  return pintar(128, (g) => {
    const d = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    d.addColorStop(0, color); d.addColorStop(0.55, color); d.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = d; g.fillRect(0, 0, 128, 128);
  }, false);
}

export interface Planta { x: number; z: number; alto: number; giro?: number; y?: number }

/** Muchas copias de un modelo como instancias (un dibujo por material). Cada una con su alto. */
export async function bosque(escena: THREE.Object3D, paquete: Origen, nombre: string, puntos: Planta[]): Promise<THREE.Group> {
  const modelo = await cargar(paquete, nombre), medida = new THREE.Box3().setFromObject(modelo), alto = Math.max(0.01, medida.max.y - medida.min.y);
  const g = sembrar(modelo, puntos.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z, s: p.alto / alto, giro: p.giro ?? 0 })));
  escena.add(g);
  return g;
}

/** Puntos sueltos en un anillo alrededor de un rectángulo, para rodear una cancha de adornos. */
export function alrededor(r: () => number, cuantos: number, ancho: number, fondo: number, desde: number, hasta: number, alto: [number, number]): Planta[] {
  return Array.from({ length: cuantos }, () => {
    const a = r() * Math.PI * 2, d = desde + r() * (hasta - desde);
    const x = Math.cos(a) * (ancho / 2 + d), z = Math.sin(a) * (fondo / 2 + d);
    return { x, z, alto: alto[0] + r() * (alto[1] - alto[0]), giro: r() * 6.28 };
  });
}

/** Humo: unas pocas bolas que suben, crecen y se desvanecen. Llamar `avanzar(dt)` en cada cuadro. */
export function humo(escena: THREE.Scene, x: number, y: number, z: number, color = '#9a8a86', cuantas = 6, escala = 1) {
  const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.5, flatShading: true, depthWrite: false });
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const bolas = Array.from({ length: cuantas }, (_, i) => { const b = new THREE.Mesh(geo, mat.clone()); b.userData.t = i / cuantas; escena.add(b); return b; });
  return {
    avanzar(dt: number, ritmo = 1) {
      for (const b of bolas) {
        const t = (b.userData.t = (b.userData.t + dt * 0.12 * ritmo) % 1);
        b.position.set(x + Math.sin(t * 5 + b.id) * 0.8 * escala, y + t * 7 * escala, z + Math.cos(t * 4 + b.id) * 0.5 * escala);
        b.scale.setScalar((0.7 + t * 2.4) * escala);
        (b.material as THREE.MeshLambertMaterial).opacity = 0.55 * (1 - t);
      }
    },
  };
}
