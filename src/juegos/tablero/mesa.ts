import type { Aspecto } from '../../personaje/catalogo';
import { foto } from '../../personaje/miniaturas';
import { alCambiarVolumen, cargarMuestras, tocarMuestra, volumen } from '../sonido';
import { ajustesPartida } from '../marco';

// Motores E y F · Tablero, memoria y decisión. Son juegos de mesa: no necesitan 3D, así que se arman con elementos
// de la página (livianos en cualquier equipo). Esto resuelve lo común: el fondo, el marcador, el reloj y los sonidos.

export type Mesa = ReturnType<typeof crearMesa>;

export function crearMesa(caja: HTMLElement, clase: string, aspecto?: Aspecto) {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, clases = '', padre?: HTMLElement, texto?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (clases) e.className = clases;
    if (texto !== undefined) e.textContent = texto;
    padre?.appendChild(e);
    return e;
  };
  const fondo = el('div', `mesa ${clase}`, caja);
  // El tablero no se ve hasta que parte la partida, para que nadie lo estudie durante la cuenta regresiva
  const tablero = el('div', 'mesa-tablero oculta', fondo);
  const barra = el('div', 'juego-hud', caja), elTiempo = el('div', 'dato', barra), elExtra = el('div', 'dato centro', barra), elPuntos = el('div', 'dato', barra);
  const elAviso = el('div', 'juego-aviso', caja);
  // El personaje del jugador mira la partida desde una esquina y reacciona a aciertos y errores
  const retrato = el('div', 'mesa-avatar', caja);
  if (aspecto) foto(aspecto, 180, 'cabeza').then((imagen) => retrato.appendChild(imagen)).catch(() => {});
  const animo = (gesto: string) => { retrato.classList.remove('feliz', 'triste'); void retrato.offsetWidth; retrato.classList.add(gesto); };
  let borrarAviso = 0;

  let ctx: AudioContext | null = null, salida: GainNode | null = null, muestras: Record<string, AudioBuffer> = {};
  const efecto = (nombre: string, vol = 0.8) => !!ctx && !!salida && tocarMuestra(ctx, salida, muestras, nombre, vol);
  const tono = (frec: number, dura: number, tipo: OscillatorType = 'triangle', vol = 0.22, espera = 0) => {
    if (!ctx || !salida) return;
    const t = ctx.currentTime + espera, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frec, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dura);
    osc.connect(g).connect(salida);
    osc.start(t);
    osc.stop(t + dura + 0.02);
  };

  let corriendo = false, inicio = 0, fijo = 0, salto = 0, latido = 0;
  const reloj = () => (corriendo ? (performance.now() - inicio) / 1000 + salto : fijo);
  const tics: ((t: number) => void)[] = [], limpiezas: (() => void)[] = [];

  const api = {
    tablero, el, reloj,
    hud: {
      tiempo(texto: string) { if (elTiempo.textContent !== texto) elTiempo.textContent = texto; },
      puntos(texto: string) { if (elPuntos.textContent !== texto) elPuntos.textContent = texto; },
      extra(texto: string) { if (elExtra.textContent !== texto) elExtra.textContent = texto; },
      aviso(texto: string, clases = '', seg = 1.2) {
        elAviso.textContent = texto;
        elAviso.className = `juego-aviso visible ${clases}`;
        clearTimeout(borrarAviso);
        borrarAviso = window.setTimeout(() => { elAviso.className = 'juego-aviso'; }, seg * 1000);
      },
    },
    sonido: {
      tono,
      efecto,
      toque() { if (efecto('click', 0.6)) return; tono(520, 0.06, 'triangle', 0.15); },
      bien() { animo('feliz'); if (efecto('bien')) return; tono(660, 0.09); tono(990, 0.14, 'triangle', 0.18, 0.07); },
      mal() { animo('triste'); if (efecto('mal')) return; tono(180, 0.25, 'sawtooth', 0.16); },
      fanfarria() { /* el cierre lo toca la sala, igual para todos los juegos */ },
    },
    /** Se llama diez veces por segundo mientras corre la partida. */
    alTic(f: (t: number) => void) { tics.push(f); },
    escuchar<K extends keyof WindowEventMap>(tipo: K, f: (e: WindowEventMap[K]) => void) {
      window.addEventListener(tipo, f as EventListener);
      limpiezas.push(() => window.removeEventListener(tipo, f as EventListener));
    },
    despues(seg: number, f: () => void) { const id = window.setTimeout(f, seg * 1000); limpiezas.push(() => clearTimeout(id)); },
    empezar() {
      try {
        ctx = new AudioContext();
        const master = (salida = ctx.createGain());
        master.gain.value = 0.6 * volumen();
        master.connect(ctx.destination);
        muestras = cargarMuestras(ctx);
        limpiezas.push(alCambiarVolumen(() => { master.gain.value = 0.6 * volumen(); }));
      } catch { ctx = null; }
      tablero.classList.remove('oculta');
      inicio = performance.now();
      corriendo = true;
      latido = window.setInterval(() => { const t = reloj(); for (const f of tics) f(t); }, 100);
    },
    detener() { fijo = reloj(); corriendo = false; clearInterval(latido); },
    destruir() {
      clearInterval(latido);
      clearTimeout(borrarAviso);
      for (const f of limpiezas) f();
      ctx?.close().catch(() => {});
      caja.replaceChildren();
    },
  };
  // Individual: al cambiar de pestaña el reloj se congela y sigue al volver; el tablero se tapa para no estudiarlo en pausa
  let pausado = false;
  const alCambiarVista = () => {
    if (!ajustesPartida.pausable) return;
    if (document.hidden && corriendo) { fijo = reloj(); corriendo = false; pausado = true; tablero.classList.add('oculta'); }
    else if (!document.hidden && pausado) { pausado = false; salto = fijo; inicio = performance.now(); corriendo = true; tablero.classList.remove('oculta'); api.hud.aviso('Pausa: sigues donde quedaste', '', 1.4); }
  };
  document.addEventListener('visibilitychange', alCambiarVista);
  limpiezas.push(() => document.removeEventListener('visibilitychange', alCambiarVista));
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__juego = { saltar: (s: number) => { salto += s; }, reloj, cuadro: () => {}, vista: alCambiarVista };
  return api;
}

export const mmss = (seg: number) => { const s = Math.max(0, Math.ceil(seg)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Baraja con la semilla: mismo orden para todos. */
export function barajar<T>(lista: T[], r: () => number): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [copia[i], copia[k]] = [copia[k], copia[i]]; }
  return copia;
}
