import { sensibilidad } from '../nucleo/preferencias';
import type { Escenario } from './reflejos/motor';

// Controles compartidos por los juegos donde se maneja al personaje (carreras y arena):
//  · teclado: flechas o WASD para moverse, Espacio para la acción (saltar o embestir), Shift o C para agacharse;
//  · pantalla táctil o mouse: arrastrar desde cualquier punto hace de palanca, y hay un botón para la acción;
//  · control (gamepad): palanca izquierda o cruceta para moverse, A / R1 / R2 para la acción y B / X / L1 / L2 para el segundo botón.

export interface Mando {
  /** Dirección pedida, cada eje entre -1 y 1. `z` negativo es "hacia el fondo". */
  readonly x: number;
  readonly z: number;
  /** Si la acción está apretada en este momento. */
  readonly pulsada: boolean;
  /** Verdadero una sola vez por cada pulsación de la acción. */
  tomarAccion(): boolean;
  /** Si está agachado (solo en los juegos que piden el segundo botón). */
  readonly agachado: boolean;
  /** La palanca derecha del control (x, z), o [0, 0] si no se usa. */
  readonly derecha: [number, number];
}

const TECLAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1],
};

/** `palancaConMouse: false`: el clic del mouse no hace de palanca (el juego dirige con el cursor, como Serpientes). */
export function crearMando(e: Escenario, caja: HTMLElement, etiqueta: string, agacharse?: string, { palancaConMouse = true } = {}): Mando {
  const pulsadas = new Set<string>();
  let palanca: { x0: number; y0: number; x: number; z: number } | null = null, accion = false, apretada = false, abajo = false, botonAbajo = false;

  e.escuchar(window, 'keydown', (ev) => {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (k === ' ') { if (!ev.repeat) accion = true; apretada = true; ev.preventDefault(); }
    else if (agacharse && (k === 'Shift' || k === 'c')) { abajo = true; ev.preventDefault(); }
    else if (TECLAS[k]) { pulsadas.add(k); ev.preventDefault(); }
  });
  e.escuchar(window, 'keyup', (ev) => { if (ev.key === ' ') apretada = false; if (ev.key === 'Shift' || ev.key.toLowerCase() === 'c') abajo = false; pulsadas.delete(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key); });
  e.escuchar(window, 'blur', () => { pulsadas.clear(); abajo = false; });

  e.escuchar(e.lienzo, 'pointerdown', (ev) => { if (!palancaConMouse && ev.pointerType === 'mouse') return; palanca = { x0: ev.clientX, y0: ev.clientY, x: 0, z: 0 }; e.lienzo.setPointerCapture(ev.pointerId); });
  e.escuchar(e.lienzo, 'pointermove', (ev) => {
    if (!palanca) return;
    const s = 55 / sensibilidad(), dx = (ev.clientX - palanca.x0) / s, dz = (ev.clientY - palanca.y0) / s, largo = Math.max(1, Math.hypot(dx, dz));
    palanca.x = dx / largo;
    palanca.z = dz / largo;
  });
  const soltar = () => { palanca = null; };
  e.escuchar(e.lienzo, 'pointerup', soltar);
  e.escuchar(e.lienzo, 'pointercancel', soltar);

  const boton = document.createElement('button');
  boton.className = 'boton mando-accion';
  boton.textContent = etiqueta;
  boton.addEventListener('pointerdown', (ev) => { ev.preventDefault(); accion = true; apretada = true; });
  for (const fin of ['pointerup', 'pointerleave', 'pointercancel']) boton.addEventListener(fin, () => { apretada = false; });
  caja.appendChild(boton);
  if (agacharse) {
    const b2 = document.createElement('button');
    b2.className = 'boton mando-accion segunda';
    b2.textContent = agacharse;
    b2.addEventListener('pointerdown', (ev) => { ev.preventDefault(); botonAbajo = true; });
    for (const fin of ['pointerup', 'pointerleave', 'pointercancel']) b2.addEventListener(fin, () => { botonAbajo = false; });
    caja.appendChild(b2);
  }

  // Control: se lee en cada consulta (la API no avisa los cambios); el borde de la acción se detecta aquí
  // El control cuenta recién cuando alguien lo usa de verdad (un botón o la palanca a fondo): uno conectado y olvidado,
  // con la palanca un poco descentrada, ya no maneja solo
  let padAccion = false, padAbajo = false, padX = 0, padZ = 0, padRX = 0, padRZ = 0, padActivo = false;
  const leerControl = () => {
    const pad = typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()].find((p) => p?.connected) : null;
    if (!pad) { padAccion = padAbajo = false; padX = padZ = padRX = padRZ = 0; return; }
    const b = (i: number) => !!pad.buttons[i]?.pressed, zona = (v = 0) => (Math.abs(v) < 0.25 ? 0 : v);
    padActivo ||= pad.buttons.some((x) => x.pressed) || pad.axes.some((v) => Math.abs(v) > 0.6);
    if (!padActivo) return;
    padX = Math.max(-1, Math.min(1, zona(pad.axes[0]) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0)));
    padZ = Math.max(-1, Math.min(1, zona(pad.axes[1]) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0)));
    padRX = zona(pad.axes[2]); padRZ = zona(pad.axes[3]);
    const ahora = b(0) || b(5) || b(7);
    if (ahora && !padAccion) accion = true;
    padAccion = ahora;
    padAbajo = b(1) || b(2) || b(4) || b(6);
  };
  const eje = (i: 0 | 1) => {
    leerControl();
    let v = i === 0 ? padX : padZ;
    for (const k of pulsadas) v += TECLAS[k][i];
    return Math.max(-1, Math.min(1, v + (palanca ? (i === 0 ? palanca.x : palanca.z) : 0)));
  };
  return {
    get x() { return eje(0); },
    get z() { return eje(1); },
    get pulsada() { leerControl(); return apretada || padAccion; },
    get agachado() { leerControl(); return abajo || botonAbajo || padAbajo; },
    get derecha(): [number, number] { leerControl(); return [padRX, padRZ]; },
    tomarAccion() { leerControl(); const si = accion; accion = false; return si; },
  };
}
