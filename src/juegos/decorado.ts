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

export interface Noche { /** Llamar en cada cuadro: parpadean las calabazas y vuelan los murciélagos. */ avanzar(t: number): void }

/**
 * Noche de Halloween para los juegos de octubre: cielo morado con luna y estrellas, niebla, luces bajadas, y alrededor de
 * la zona de juego (`ancho` × `fondo`, centrada en `centro`) árboles oscuros y otoñales, lápidas, calabazas encendidas y
 * murciélagos. Todo en instancias; solo la luna y los halos son sprites.
 */
export async function nocheEmbrujada(escena: THREE.Scene, r: () => number, z: { ancho: number; fondo: number; centro?: [number, number]; desde?: number; hasta?: number; luna?: [number, number, number]; niebla?: [number, number]; /** Vista de lado: nada por delante de la zona, que taparía el juego. */ soloAtras?: boolean }): Promise<Noche> {
  const [cx, cz] = z.centro ?? [0, 0], desde = z.desde ?? 2, hasta = z.hasta ?? 14;
  cielo(escena, '#07061a', '#4a2350', '#1c1240');
  escena.fog = new THREE.Fog('#24163f', ...(z.niebla ?? [40, 140]));
  // Las luces de día del motor se bajan y se tiñen de luna
  escena.traverse((o) => {
    const luz = o as THREE.Light;
    if (!luz.isLight) return;
    luz.intensity *= (luz as THREE.HemisphereLight).isHemisphereLight ? 0.55 : 0.5;
    luz.color.lerp(new THREE.Color('#9fb4ff'), 0.5);
  });
  const naranja = new THREE.PointLight('#ff9a3c', 1.2, 0, 0);
  naranja.position.set(cx, 6, cz + z.fondo * 0.6);
  escena.add(naranja);

  // Luna con su resplandor y estrellas
  const [lx, ly, lz] = z.luna ?? [cx - z.ancho * 0.6, 34, cz - z.fondo / 2 - 70];
  const brillo = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(255,236,190,0.55)'), depthWrite: false, fog: false }));
  brillo.scale.setScalar(34); brillo.position.set(lx, ly, lz); escena.add(brillo);
  const luna = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false }));
  luna.position.set(lx, ly, lz + 0.5); luna.lookAt(cx, 0, cz + 40); escena.add(luna);
  const estrellas = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i++) {
    const a = r() * Math.PI * 2, b = 0.15 + r() * 1.2, d = 230;
    estrellas.set([cx + Math.cos(a) * Math.cos(b) * d, Math.sin(b) * d * 0.6 + 10, cz + Math.sin(a) * Math.cos(b) * d], i * 3);
  }
  const geoEstrellas = new THREE.BufferGeometry(); geoEstrellas.setAttribute('position', new THREE.BufferAttribute(estrellas, 3));
  escena.add(new THREE.Points(geoEstrellas, new THREE.PointsMaterial({ color: '#ffffff', size: 1.1, sizeAttenuation: false, fog: false })));

  // Bosque alrededor: oscuros, otoñales y pinos, más lápidas y calabazas
  const anillo = (n: number, d0: number, d1: number, alto: [number, number]) => alrededor(r, n, z.ancho, z.fondo, d0, d1, alto).map((p) => ({ ...p, x: p.x + cx, z: p.z + cz })).filter((p) => !z.soloAtras || p.z < cz - z.fondo / 2);
  const arboles = anillo(70, desde + 3, hasta + 10, [4, 8]);
  await Promise.all([
    bosque(escena, 'naturaleza', 'tree_default_dark', arboles.filter((_, i) => i % 3 === 0)),
    bosque(escena, 'naturaleza', 'tree_detailed_fall', arboles.filter((_, i) => i % 3 === 1)),
    bosque(escena, 'naturaleza', 'tree_pineRoundC', arboles.filter((_, i) => i % 3 === 2).map((p) => ({ ...p, alto: p.alto * 1.2 }))),
    bosque(escena, 'naturaleza', 'stone_tallB', anillo(26, desde, desde + 6, [0.9, 1.4])),
    bosque(escena, 'naturaleza', 'statue_obelisk', anillo(6, desde + 1, desde + 7, [1.8, 2.6])),
    bosque(escena, 'naturaleza', 'rock_largeA', anillo(10, desde + 2, hasta, [1, 2.2])),
  ]);
  const calabazas = anillo(16, desde - 0.5, desde + 5, [0.7, 1.1]);
  await bosque(escena, 'naturaleza', 'crop_pumpkin', calabazas);
  const resplandor = new THREE.SpriteMaterial({ map: halo('rgba(255,150,40,0.8)'), depthWrite: false, blending: THREE.AdditiveBlending });
  const luces = calabazas.map((p) => { const s = new THREE.Sprite(resplandor); s.position.set(p.x, p.alto * 0.6, p.z); s.scale.setScalar(p.alto * 2.4); escena.add(s); return s; });

  // Murciélagos: dos alas que aletean, dando vueltas lejos
  const geoAla = new THREE.BufferGeometry();
  geoAla.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.25, 0, 0, 0.3, 1.1, 0.15, 0.1, 0, 0, 0.3, 0.7, 0, 0.45, 1.1, 0.15, 0.1]), 3));
  geoAla.computeVertexNormals();
  const matAla = new THREE.MeshBasicMaterial({ color: '#120c1c', side: THREE.DoubleSide });
  const bichos = Array.from({ length: 9 }, (_, i) => {
    const g = new THREE.Group(), izq = new THREE.Mesh(geoAla, matAla), der = new THREE.Mesh(geoAla, matAla);
    der.scale.x = -1;
    const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), matAla);
    g.add(izq, der, cuerpo);
    g.scale.setScalar(0.9 + r() * 0.8);
    escena.add(g);
    return { g, izq, der, radio: z.ancho * 0.4 + 6 + r() * 14, alto: 9 + r() * 10, vel: 0.25 + r() * 0.35, fase: (i / 9) * Math.PI * 2 };
  });

  return {
    avanzar(t: number) {
      luces.forEach((s, i) => { s.material.opacity = 1; s.scale.setScalar(calabazas[i].alto * (2.2 + Math.sin(t * 9 + i * 2.3) * 0.15 + Math.sin(t * 23 + i) * 0.08)); });
      naranja.intensity = 1.1 + Math.sin(t * 7) * 0.08;
      for (const b of bichos) {
        const a = b.fase + t * b.vel;
        b.g.position.set(cx + Math.cos(a) * b.radio, b.alto + Math.sin(t * 1.3 + b.fase) * 1.5, cz - z.fondo * 0.3 + Math.sin(a) * b.radio * 0.6);
        b.g.rotation.y = -a;
        const aleteo = Math.sin(t * 16 + b.fase * 5) * 0.7;
        b.izq.rotation.z = aleteo; b.der.rotation.z = -aleteo;
      }
    },
  };
}
