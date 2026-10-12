// Volumen de los juegos: un solo interruptor de silencio que recuerdan todos los motores.
const CLAVE = 'susto.silencio';
let callado = false;
try { callado = localStorage.getItem(CLAVE) === '1'; } catch { /* sin almacenamiento */ }
const oyentes = new Set<() => void>();

export const estaCallado = () => callado;
export const volumen = () => (callado ? 0 : 1);

export function silenciar(si: boolean) {
  callado = si;
  try { localStorage.setItem(CLAVE, si ? '1' : '0'); } catch { /* sin almacenamiento */ }
  oyentes.forEach((f) => f());
}

/** Avisa cuando cambia el silencio. Devuelve cómo dejar de escuchar. */
export function alCambiarVolumen(f: () => void): () => void {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

/** Cierre de partida: una subida corta, más larga y brillante si fue la mejor marca del día. */
export function fanfarria(mejor: boolean) {
  if (callado) return;
  try {
    const ctx = new AudioContext(), salida = ctx.createGain(), notas = mejor ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    salida.gain.value = 0.5;
    salida.connect(ctx.destination);
    notas.forEach((frec, i) => {
      const t = ctx.currentTime + 0.05 + i * 0.11, osc = ctx.createOscillator(), g = ctx.createGain(), dura = i === notas.length - 1 ? 0.5 : 0.18;
      osc.type = 'triangle';
      osc.frequency.value = frec;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dura);
      osc.connect(g).connect(salida);
      osc.start(t);
      osc.stop(t + dura + 0.02);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1800);
  } catch { /* sin sonido */ }
}

// Efectos grabados (Interface Sounds e Impact Sounds de Kenney, CC0). Los archivos se bajan una sola vez;
// si el navegador no puede con el formato, cada juego sigue usando sus tonos generados.
const EFECTOS = ['click', 'bien', 'mal', 'soltar', 'golpe', 'madera', 'suave', 'tabla', 'campana', 'leve'];
const crudos = new Map<string, Promise<ArrayBuffer | null>>();

export function cargarMuestras(ctx: AudioContext): Record<string, AudioBuffer> {
  const listas: Record<string, AudioBuffer> = {};
  for (const nombre of EFECTOS) {
    let crudo = crudos.get(nombre);
    if (!crudo) { crudo = fetch(`${import.meta.env.BASE_URL}sonidos/${nombre}.ogg`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null); crudos.set(nombre, crudo); }
    crudo.then((bytes) => (bytes ? ctx.decodeAudioData(bytes.slice(0)) : null)).then((buffer) => { if (buffer) listas[nombre] = buffer; }).catch(() => {});
  }
  return listas;
}

/** Toca un efecto si ya está cargado. Devuelve si sonó. */
export function tocarMuestra(ctx: AudioContext, salida: AudioNode, muestras: Record<string, AudioBuffer>, nombre: string, vol = 0.8): boolean {
  const buffer = muestras[nombre];
  if (!buffer) return false;
  const fuente = ctx.createBufferSource(), g = ctx.createGain();
  fuente.buffer = buffer;
  g.gain.value = vol;
  fuente.connect(g).connect(salida);
  fuente.start();
  return true;
}
