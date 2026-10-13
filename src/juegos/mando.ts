import type { Escenario } from './reflejos/motor';

// Controles compartidos por los juegos donde se maneja al personaje (carreras y arena):
//  · teclado: flechas o WASD para moverse, Espacio para la acción (saltar o embestir);
//  · pantalla táctil o mouse: arrastrar desde cualquier punto hace de palanca, y hay un botón para la acción.

export interface Mando {
  /** Dirección pedida, cada eje entre -1 y 1. `z` negativo es "hacia el fondo". */
  readonly x: number;
  readonly z: number;
  /** Verdadero una sola vez por cada pulsación de la acción. */
  tomarAccion(): boolean;
}

const TECLAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1],
};

export function crearMando(e: Escenario, caja: HTMLElement, etiqueta: string): Mando {
  const pulsadas = new Set<string>();
  let palanca: { x0: number; y0: number; x: number; z: number } | null = null, accion = false;

  e.escuchar(window, 'keydown', (ev) => {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (k === ' ') { if (!ev.repeat) accion = true; ev.preventDefault(); }
    else if (TECLAS[k]) { pulsadas.add(k); ev.preventDefault(); }
  });
  e.escuchar(window, 'keyup', (ev) => { pulsadas.delete(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key); });
  e.escuchar(window, 'blur', () => pulsadas.clear());

  e.escuchar(e.lienzo, 'pointerdown', (ev) => { palanca = { x0: ev.clientX, y0: ev.clientY, x: 0, z: 0 }; e.lienzo.setPointerCapture(ev.pointerId); });
  e.escuchar(e.lienzo, 'pointermove', (ev) => {
    if (!palanca) return;
    const dx = (ev.clientX - palanca.x0) / 55, dz = (ev.clientY - palanca.y0) / 55, largo = Math.max(1, Math.hypot(dx, dz));
    palanca.x = dx / largo;
    palanca.z = dz / largo;
  });
  const soltar = () => { palanca = null; };
  e.escuchar(e.lienzo, 'pointerup', soltar);
  e.escuchar(e.lienzo, 'pointercancel', soltar);

  const boton = document.createElement('button');
  boton.className = 'boton mando-accion';
  boton.textContent = etiqueta;
  boton.addEventListener('pointerdown', (ev) => { ev.preventDefault(); accion = true; });
  caja.appendChild(boton);

  const eje = (i: 0 | 1) => {
    let v = 0;
    for (const k of pulsadas) v += TECLAS[k][i];
    return Math.max(-1, Math.min(1, v + (palanca ? (i === 0 ? palanca.x : palanca.z) : 0)));
  };
  return {
    get x() { return eje(0); },
    get z() { return eje(1); },
    tomarAccion() { const si = accion; accion = false; return si; },
  };
}
