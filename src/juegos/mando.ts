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
  /**
   * Después de usar un gesto (cambiar de carril, saltar): la palanca vuelve al centro y queda trabada en esa dirección
   * mientras el dedo siga avanzando hacia allá. Un deslizamiento largo cuenta una sola vez; para repetir hay que
   * detenerse, devolverse o levantar el dedo.
   */
  reanclar(): void;
}

const TECLAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1],
};

/** `palancaConMouse: false`: el clic del mouse no hace de palanca (el juego dirige con el cursor, como Serpientes). */
export function crearMando(e: Escenario, caja: HTMLElement, etiqueta: string, agacharse?: string, { palancaConMouse = true } = {}): Mando {
  const pulsadas = new Set<string>();
  let ultimo = { x: 0, y: 0 }, palanca: { x0: number; y0: number; x: number; z: number; sx: number; sz: number } | null = null, accion = false, apretada = false, abajo = false, botonAbajo = false;

  e.escuchar(window, 'keydown', (ev) => {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (k === ' ') { if (!ev.repeat) accion = true; apretada = true; ev.preventDefault(); }
    else if (agacharse && (k === 'Shift' || k === 'c')) { abajo = true; ev.preventDefault(); }
    else if (TECLAS[k]) { pulsadas.add(k); ev.preventDefault(); }
  });
  e.escuchar(window, 'keyup', (ev) => { if (ev.key === ' ') apretada = false; if (ev.key === 'Shift' || ev.key.toLowerCase() === 'c') abajo = false; pulsadas.delete(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key); });
  e.escuchar(window, 'blur', () => { pulsadas.clear(); abajo = false; });

  // La palanca se ve donde apoyas el dedo (solo en pantallas táctiles)
  const aro = document.createElement('div'), perilla = document.createElement('i');
  aro.className = 'palanca-visual'; aro.hidden = true; aro.appendChild(perilla); caja.appendChild(aro);
  const pintarPalanca = () => {
    if (!palanca || !tactil) { aro.hidden = true; return; }
    const r = caja.getBoundingClientRect();
    aro.hidden = false; aro.style.left = `${palanca.x0 - r.left}px`; aro.style.top = `${palanca.y0 - r.top}px`;
    perilla.style.transform = `translate(${palanca.x * 34}px, ${palanca.z * 34}px)`;
  };
  let tactil = false;
  e.escuchar(e.lienzo, 'pointerdown', (ev) => { if (!palancaConMouse && ev.pointerType === 'mouse') return; tactil = ev.pointerType === 'touch'; ultimo = { x: ev.clientX, y: ev.clientY }; palanca = { x0: ev.clientX, y0: ev.clientY, x: 0, z: 0, sx: 0, sz: 0 }; e.lienzo.setPointerCapture(ev.pointerId); pintarPalanca(); });
  e.escuchar(e.lienzo, 'pointermove', (ev) => {
    if (!palanca) return;
    ultimo = { x: ev.clientX, y: ev.clientY };
    // Trabada: el centro sigue al dedo mientras avance en la misma dirección; si retrocede más de 10 px, se destraba ahí
    const trabar = (d: number, s: 'sx' | 'sz', c: 'x0' | 'y0', v: number) => {
      if (!palanca![s]) return;
      if (Math.sign(d) === palanca![s]) palanca![c] = v;
      else if (Math.abs(d) > 10) { palanca![s] = 0; palanca![c] = v; }
    };
    trabar(ev.clientX - palanca.x0, 'sx', 'x0', ev.clientX);
    trabar(ev.clientY - palanca.y0, 'sz', 'y0', ev.clientY);
    const s = 55 / sensibilidad(), dx = (ev.clientX - palanca.x0) / s, dz = (ev.clientY - palanca.y0) / s, largo = Math.max(1, Math.hypot(dx, dz));
    palanca.x = dx / largo;
    palanca.z = dz / largo;
    pintarPalanca();
  });
  const soltar = () => { palanca = null; pintarPalanca(); };
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
    reanclar() { if (palanca) palanca = { x0: ultimo.x, y0: ultimo.y, x: 0, z: 0, sx: Math.abs(palanca.x) > 0.3 ? Math.sign(palanca.x) : 0, sz: Math.abs(palanca.z) > 0.3 ? Math.sign(palanca.z) : 0 }; },
  };
}
