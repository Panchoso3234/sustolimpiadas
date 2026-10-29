import * as THREE from 'three';
import { supabase } from '../nucleo/supabase';

// Fantasma del líder: los juegos de recorrido graban por dónde pasó el jugador y lo guardan junto a la marca.
// Quien juega "contra el líder" recibe la misma semilla (el mismo recorrido) y ve esa grabación como una figura
// transparente con su nombre.
// La base acepta hasta 8.000 bytes de detalle por partida, así que el recorrido va comprimido: diferencias en
// decímetros como enteros de 16 bits, en base64, y como mucho 500 puntos (si la partida es larga, se toma uno de cada
// dos y el intervalo se duplica). Un minuto de partida queda en ~1,9 KB.

/** Juegos que graban su recorrido y se pueden jugar contra el fantasma del líder. */
// Puertas Falsas no: su fantasma mostraría las puertas buenas
export const CON_FANTASMA = new Set(['escobas', 'tren', 'karts', 'rodillos', 'colibri']);
const PASO = 0.25, MAX_PUNTOS = 500;

export interface Fantasma { nombre: string; puntaje: number; semilla: string; paso: number; ruta: number[] }
/** Así queda en `detalle.ruta`: el intervalo entre puntos y las diferencias codificadas. */
export interface RutaGuardada { p: number; d: string }

export function codificar(puntos: number[], paso: number): RutaGuardada {
  let lista = puntos;
  while (lista.length / 3 > MAX_PUNTOS) { lista = lista.filter((_, i) => Math.floor(i / 3) % 2 === 0); paso *= 2; }
  const enteros = new Int16Array(lista.length);
  const previo = [0, 0, 0];
  lista.forEach((v, i) => { const dm = Math.round(v * 10), d = Math.max(-32768, Math.min(32767, dm - previo[i % 3])); enteros[i] = d; previo[i % 3] += d; });
  const bytes = new Uint8Array(enteros.buffer);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return { p: paso, d: btoa(bin) };
}

export function decodificar(r: unknown): { paso: number; ruta: number[] } | null {
  const x = r as Partial<RutaGuardada> | null;
  if (!x || typeof x.p !== 'number' || !(x.p > 0 && x.p < 10) || typeof x.d !== 'string' || x.d.length > 12000) return null;
  try {
    const bin = atob(x.d), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const enteros = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2)), ruta: number[] = [], suma = [0, 0, 0];
    enteros.forEach((d, i) => { suma[i % 3] += d; ruta.push(suma[i % 3] / 10); });
    return ruta.length >= 6 ? { paso: x.p, ruta: ruta.slice(0, ruta.length - (ruta.length % 3)) } : null;
  } catch { return null; }
}

/** Anota la posición del jugador cada `PASO` segundos; `final()` da lo que va a `detalle.ruta`. */
export function grabadora() {
  const puntos: number[] = [];
  let proximo = 0;
  return {
    anotar(t: number, x: number, y: number, z: number) {
      if (t < proximo || puntos.length >= 6000) return;
      proximo = t + PASO;
      puntos.push(x, y, z);
    },
    final: (): RutaGuardada => codificar(puntos, PASO),
  };
}

/** El líder del día en un juego, si su mejor marca trae recorrido grabado (y no es uno mismo). */
export async function liderDelDia(juego: string, fecha: string, yo: string | null): Promise<Fantasma | null> {
  // Solo en pruebas: la última partida jugada en este navegador hace de líder (sin tocar la tabla real)
  if (import.meta.env.DEV) { try { const f = JSON.parse(localStorage.getItem(`susto.fantasmaPrueba.${juego}`) ?? 'null'); if (f) return f as Fantasma; } catch { /* nada */ } }
  const { data } = await supabase.from('marcas').select('perfil_id,puntaje,detalle,perfiles(nombre)').eq('juego', juego).eq('fecha', fecha).order('puntaje', { ascending: false }).limit(6);
  for (const f of data ?? []) {
    const d = f.detalle as { ruta?: unknown; semilla?: unknown } | null, rel = f.perfiles as unknown as { nombre: string } | { nombre: string }[] | null;
    if (f.perfil_id === yo) continue;
    const r = decodificar(d?.ruta);
    if (!r || typeof d?.semilla !== 'string') continue;
    return { nombre: (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre) ?? 'Líder', puntaje: f.puntaje as number, semilla: d.semilla, ...r };
  }
  return null;
}

/** Cartel con el nombre, que siempre mira a la cámara. */
function cartel(texto: string): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(20,32,58,0.75)'; g.beginPath(); g.roundRect(4, 8, 248, 48, 20); g.fill();
  g.font = 'bold 28px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#bfe8ff';
  g.fillText(`👻 ${texto}`.slice(0, 22), 128, 33);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false, transparent: true, sizeAttenuation: false }));
  s.scale.set(0.2, 0.05, 1); // tamaño fijo en pantalla: se lee aunque el fantasma vaya lejos
  return s;
}

/**
 * La figura del fantasma: cuerpo transparente que brilla, con su nombre arriba. `mover(t)` la pone donde iba el líder
 * a esa altura de la partida (entre dos puntos grabados se interpola) y avisa cuando lo pasas o te pasa.
 */
export function figuraFantasma(escena: THREE.Scene, f: Fantasma, alto = 1.6) {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: '#9fdcff', transparent: true, opacity: 0.38, depthWrite: false });
  const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(alto * 0.2, alto * 0.55, 4, 10), mat);
  cuerpo.position.y = alto * 0.5; g.add(cuerpo);
  const ojos = new THREE.MeshBasicMaterial({ color: '#14203a', transparent: true, opacity: 0.7 });
  for (const d of [-1, 1]) { const o = new THREE.Mesh(new THREE.SphereGeometry(alto * 0.035, 6, 4), ojos); o.position.set(d * alto * 0.08, alto * 0.78, -alto * 0.18); g.add(o); }
  const nombre = cartel(f.nombre); nombre.position.y = alto * 1.25; g.add(nombre);
  g.visible = false;
  escena.add(g);
  const n = Math.floor(f.ruta.length / 3), duracion = (n - 1) * f.paso, previo = new THREE.Vector3();
  return {
    /** Dónde iba el líder a los `t` segundos, o null si ya terminó su recorrido. */
    mover(t: number): THREE.Vector3 | null {
      if (t < 0 || n < 2) { g.visible = false; return null; }
      const k = Math.min(t / f.paso, n - 1), i = Math.min(n - 2, Math.floor(k)), a = k - i, r = f.ruta;
      previo.copy(g.position);
      g.position.set(r[i * 3] + (r[i * 3 + 3] - r[i * 3]) * a, r[i * 3 + 1] + (r[i * 3 + 4] - r[i * 3 + 1]) * a, r[i * 3 + 2] + (r[i * 3 + 5] - r[i * 3 + 2]) * a);
      const dx = g.position.x - previo.x, dz = g.position.z - previo.z;
      if (Math.hypot(dx, dz) > 0.001) g.rotation.y = Math.atan2(dx, dz) + Math.PI;
      g.visible = t <= duracion + 1.5;
      mat.opacity = 0.3 + Math.sin(t * 4) * 0.08;
      return t <= duracion ? g.position : null;
    },
    ocultar() { g.visible = false; },
  };
}
