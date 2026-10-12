import * as THREE from 'three';
import type { Aspecto, Personaje } from './catalogo';
import { ALTO, crearKenney } from './kenney';
import { liberar } from './modelo';

// Fotos del personaje: miniaturas del creador y la tarjeta para compartir.
// Se usa un solo renderizador fuera de pantalla para todas.

export type Encuadre = 'cabeza' | 'cuerpo' | 'espalda';

let taller: { render: THREE.WebGLRenderer; escena: THREE.Scene; camara: THREE.PerspectiveCamera } | null = null;

function abrirTaller() {
  if (!taller) {
    const render = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    render.setPixelRatio(1);
    const escena = new THREE.Scene();
    escena.add(new THREE.HemisphereLight('#ffffff', '#5a6a9a', 1.6));
    const sol = new THREE.DirectionalLight('#ffffff', 2);
    sol.position.set(2, 4, 3);
    escena.add(sol);
    taller = { render, escena, camara: new THREE.PerspectiveCamera(30, 1, 0.1, 50) };
  }
  return taller;
}

export async function foto(a: Aspecto, tam: number, encuadre: Encuadre): Promise<HTMLCanvasElement> {
  const k = await crearKenney(a);
  // Desde aquí todo es de corrido, sin esperas: así dos fotos nunca se mezclan en el mismo renderizador
  const { render, escena, camara } = abrirTaller();
  render.setSize(tam, tam, false);
  k.grupo.userData.avanzar(0);
  k.grupo.rotation.y = encuadre === 'espalda' ? 2.6 : 0.4;
  escena.add(k.grupo);
  if (encuadre === 'cabeza') { camara.position.set(0, ALTO * 0.76, 3.6); camara.lookAt(0, ALTO * 0.74, 0); }
  else { camara.position.set(0, ALTO * 0.6, 5.6); camara.lookAt(0, ALTO * 0.58, 0); }
  render.render(escena, camara);
  escena.remove(k.grupo);
  liberar(k.grupo);
  const copia = document.createElement('canvas');
  copia.width = copia.height = tam;
  copia.getContext('2d')!.drawImage(render.domElement, 0, 0);
  return copia;
}

const guardadas = new Map<string, Promise<string>>();

/** Imagen de cómo se vería el personaje con la opción `i` en el campo `k`. */
export function miniatura(a: Aspecto, k: keyof Aspecto, i: number, tipo: Encuadre): Promise<string> {
  const b = { ...a, [k]: i, altura: 0.5, contextura: 0.5 };
  const clave = tipo + JSON.stringify(b);
  let url = guardadas.get(clave);
  if (!url) {
    if (guardadas.size > 500) guardadas.clear();
    url = foto(b, 96, tipo).then((c) => c.toDataURL());
    guardadas.set(clave, url);
  }
  return url;
}

function partir(g: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (g.measureText(prueba).width > ancho && actual) { lineas.push(actual); actual = palabra; } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Tarjeta de 1000×560 para compartir en Discord. */
export async function tarjeta(p: Personaje): Promise<HTMLCanvasElement> {
  const retrato = await foto(p.apariencia, 720, 'cuerpo');
  const W = 1000, H = 560, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const fondo = g.createLinearGradient(0, 0, W, H);
  fondo.addColorStop(0, '#14203a'); fondo.addColorStop(1, '#2c4478');
  g.fillStyle = fondo; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.5)';
  for (let i = 0; i < 60; i++) g.fillRect((i * 173) % W, (i * 97) % 300, 2, 2);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(245, 506, 190, 26, 0, 0, Math.PI * 2); g.fill();
  g.drawImage(retrato, -115, -100);

  const x = 500, ancho = W - x - 50;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffe08a'; g.font = '26px Graduate, serif';
  g.fillText('LAS SUSTOLIMPIADAS', x, 96);
  let tam = 84;
  const nombre = p.nombre.trim() || 'Sin nombre';
  do { g.font = `${tam}px "Alfa Slab One", serif`; tam -= 4; } while (g.measureText(nombre).width > ancho && tam > 28);
  g.fillStyle = '#ff9a2e'; g.fillText(nombre, x, 200);
  g.fillStyle = '#f3ecdc'; g.font = '800 30px Nunito, sans-serif';
  g.fillText(p.personalidad, x, 252);
  if (p.frase.trim()) {
    g.fillStyle = '#ffe08a'; g.font = 'italic 600 30px Nunito, sans-serif';
    partir(g, `“${p.frase.trim()}”`, ancho).slice(0, 3).forEach((linea, i) => g.fillText(linea, x, 318 + i * 40));
  }
  g.fillStyle = '#a9b6d6'; g.font = '600 24px Nunito, sans-serif';
  g.fillText('Isla ValRigo · 13 oct – 13 nov 2026', x, 470);
  g.fillStyle = '#f3ecdc'; g.font = '800 26px Nunito, sans-serif';
  g.fillText('Crea el tuyo y entra al torneo', x, 508);
  return c;
}
