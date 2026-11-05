import type { Cancion, Nota } from './canciones';

// Teclas del Faro (04-11): convierte un archivo del jugador en una canción para practicar (no se sube a ningún lado).
// · MIDI (.mid): se leen las notas con su tiempo y duración; de cada momento queda la nota más aguda (la melodía) y,
//   si suena un acorde fuerte, una segunda nota (tecla doble). Se ignora la batería (canal 10).
// · Audio (.mp3, .ogg, .wav…): se detectan los golpes (subidas bruscas de energía) y cada uno es una tecla; la canción
//   suena de fondo.

const MIN_ESPACIO = 0.12; // segundos mínimos entre dos teclas (más rápido no se puede tocar)

export async function cargarArchivo(archivo: File): Promise<Cancion> {
  const nombre = archivo.name.replace(/\.[^.]+$/, '');
  const datos = await archivo.arrayBuffer();
  const esMidi = /\.midi?$/i.test(archivo.name) || new TextDecoder().decode(new Uint8Array(datos, 0, 4)) === 'MThd';
  return esMidi ? desdeMidi(datos, nombre) : desdeAudio(datos, nombre);
}

// ── MIDI ──
export function desdeMidi(buf: ArrayBuffer, nombre: string): Cancion {
  const v = new DataView(buf);
  let p = 0;
  const leer4 = () => { const s = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3)); p += 4; return s; };
  if (leer4() !== 'MThd') throw new Error('No es un archivo MIDI');
  const largoCab = v.getUint32(p); p += 4;
  const pistas = v.getUint16(p + 2), division = v.getUint16(p + 4); p += largoCab;
  if (division & 0x8000) throw new Error('Este MIDI usa tiempo SMPTE (no soportado)');
  const eventos: { tick: number; tipo: 'on' | 'off' | 'tempo'; nota?: number; vel?: number; canal?: number; mpq?: number }[] = [];
  for (let n = 0; n < pistas && p < v.byteLength; n++) {
    const id = leer4(), largo = v.getUint32(p); p += 4;
    const fin = p + largo;
    if (id !== 'MTrk') { p = fin; continue; }
    let tick = 0, estado = 0;
    const vlq = () => { let x = 0, b = 0; do { b = v.getUint8(p++); x = (x << 7) | (b & 0x7f); } while (b & 0x80); return x; };
    while (p < fin) {
      tick += vlq();
      let b = v.getUint8(p);
      if (b & 0x80) { estado = b; p++; } else b = estado; // estado corrido
      const tipo = b & 0xf0, canal = b & 0x0f;
      if (b === 0xff) { const meta = v.getUint8(p++), l = vlq(); if (meta === 0x51 && l === 3) eventos.push({ tick, tipo: 'tempo', mpq: (v.getUint8(p) << 16) | (v.getUint8(p + 1) << 8) | v.getUint8(p + 2) }); p += l; if (meta === 0x2f) break; continue; }
      if (b === 0xf0 || b === 0xf7) { p += vlq(); continue; }
      if (tipo === 0x90 || tipo === 0x80) { const nota = v.getUint8(p++), vel = v.getUint8(p++); eventos.push({ tick, tipo: tipo === 0x90 && vel > 0 ? 'on' : 'off', nota, vel, canal }); continue; }
      p += tipo === 0xc0 || tipo === 0xd0 ? 1 : 2;
    }
    p = fin;
  }
  eventos.sort((a, b) => a.tick - b.tick || (a.tipo === 'tempo' ? -1 : 0));
  // Ticks a segundos (con los cambios de tempo)
  let mpq = 500000, ultimoTick = 0, segs = 0;
  const abiertas = new Map<string, { t: number; vel: number }>(), notas: (Nota & { vel: number })[] = [];
  for (const e of eventos) {
    segs += ((e.tick - ultimoTick) * mpq) / division / 1e6; ultimoTick = e.tick;
    if (e.tipo === 'tempo') { mpq = e.mpq!; continue; }
    if (e.canal === 9) continue; // batería
    const clave = `${e.canal}|${e.nota}`;
    if (e.tipo === 'on') abiertas.set(clave, { t: segs, vel: e.vel! });
    else { const a = abiertas.get(clave); if (a) { notas.push({ t: a.t, midi: e.nota!, dur: Math.max(0.05, segs - a.t), vel: a.vel }); abiertas.delete(clave); } }
  }
  if (!notas.length) throw new Error('El MIDI no tiene notas');
  notas.sort((a, b) => a.t - b.t || b.midi - a.midi);
  // Melodía: en cada momento, la más aguda; si dos suenan juntas y fuerte, la segunda va como tecla doble
  const melodia: Nota[] = [];
  let i = 0;
  const inicio = notas[0].t - 2; // 2 s de entrada
  while (i < notas.length) {
    const grupo = [notas[i]]; let k = i + 1;
    while (k < notas.length && notas[k].t - notas[i].t < 0.03) grupo.push(notas[k++]);
    i = k;
    const t = grupo[0].t - inicio, ultima = melodia[melodia.length - 1];
    if (ultima && t - ultima.t < MIN_ESPACIO) continue;
    const alta = grupo[0];
    melodia.push({ t, midi: alta.midi, dur: alta.dur });
    if (grupo.length >= 3 && alta.vel > 90) melodia.push({ t, midi: grupo[1].midi, dur: grupo[1].dur });
  }
  // Las notas no se pisan: cada una dura hasta la siguiente, como mucho
  for (let n = 0; n < melodia.length; n++) { const sig = melodia.find((x, j) => j > n && x.t > melodia[n].t); if (sig) melodia[n].dur = Math.min(melodia[n].dur, sig.t - melodia[n].t); }
  const ultima = melodia[melodia.length - 1];
  return { id: `midi:${nombre}`, titulo: nombre, japones: '', es: 'Tu canción', nivel: 2, bpm: Math.round(60e6 / mpq), notas: melodia, acomp: [], duracion: ultima.t + ultima.dur + 1 };
}

// ── Audio ──
async function desdeAudio(buf: ArrayBuffer, nombre: string): Promise<Cancion> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const audio = await ctx.decodeAudioData(buf.slice(0)).catch(() => { throw new Error('No se pudo leer el audio'); });
  const golpes = detectarGolpes(audio);
  if (golpes.length < 10) throw new Error('No se encontraron suficientes golpes en el audio');
  const notas: Nota[] = golpes.map((g, n) => ({ t: g.t, midi: 60 + g.banda * 4, dur: Math.min(0.9, (golpes[n + 1]?.t ?? g.t + 0.3) - g.t) }));
  return { id: `audio:${nombre}`, titulo: nombre, japones: '', es: 'Tu canción', nivel: 2, bpm: 0, notas, acomp: [], duracion: audio.duration, audio };
}

/** Golpes: subidas de energía (flujo) por encima de un umbral que se adapta a la canción. banda 0 grave, 1 media, 2 aguda. */
export function detectarGolpes(audio: AudioBuffer): { t: number; banda: number; fuerza: number }[] {
  const sr = audio.sampleRate, hop = Math.round(sr * 0.01), canales = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  const n = Math.floor(audio.length / hop), bandas = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  let bajo = 0, medio = 0, previo = 0;
  for (let f = 0; f < n; f++) {
    let eb = 0, em = 0, ea = 0;
    for (let s = f * hop; s < (f + 1) * hop; s++) {
      let x = 0; for (const ch of canales) x += ch[s]; x /= canales.length;
      bajo += 0.03 * (x - bajo); medio += 0.25 * (x - medio); // filtros de un polo: grave (<~200 Hz) y medio
      const agudo = x - previo; previo = x;
      eb += bajo * bajo; em += (medio - bajo) ** 2; ea += agudo * agudo;
    }
    bandas[0][f] = Math.sqrt(eb / hop); bandas[1][f] = Math.sqrt(em / hop); bandas[2][f] = Math.sqrt(ea / hop);
  }
  const flujo = new Float32Array(n), cual = new Uint8Array(n);
  for (let f = 1; f < n; f++) { let mejor = 0; for (let b = 0; b < 3; b++) { const d = Math.max(0, bandas[b][f] - bandas[b][f - 1]) / (b === 2 ? 1.6 : 1); flujo[f] += d; if (d > mejor) { mejor = d; cual[f] = b; } } }
  const golpes: { t: number; banda: number; fuerza: number }[] = [], ventana = 50;
  for (let f = 1; f < n - 1; f++) {
    let suma = 0, suma2 = 0, c = 0;
    for (let k = Math.max(0, f - ventana); k < Math.min(n, f + ventana); k++) { suma += flujo[k]; suma2 += flujo[k] ** 2; c++; }
    const media = suma / c, desv = Math.sqrt(Math.max(0, suma2 / c - media * media));
    if (flujo[f] > media + 1.7 * desv && flujo[f] >= flujo[f - 1] && flujo[f] > flujo[f + 1]) {
      const t = (f * hop) / sr;
      if (!golpes.length || t - golpes[golpes.length - 1].t >= 0.2) golpes.push({ t, banda: cual[f], fuerza: flujo[f] });
    }
  }
  return golpes;
}
