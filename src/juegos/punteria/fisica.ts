import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Escenario } from '../reflejos/motor';

// Motor C · Puntería y lanzamiento. Lo común de sus juegos: el gesto de "tirar hacia atrás y soltar"
// y el puente entre el motor de física (Rapier) y lo que se dibuja.

let cargado: Promise<typeof RAPIER> | null = null;
/** El motor de física pesa: se descarga y se enciende recién cuando un juego lo pide. */
export const rapier = () => (cargado ??= RAPIER.init().then(() => RAPIER));

export interface Cuerpo { cuerpo: RAPIER.RigidBody; malla: THREE.Object3D }

/** Lleva cada figura a donde la física dejó su cuerpo. */
export function seguir(lista: Cuerpo[]) {
  for (const { cuerpo, malla } of lista) {
    const p = cuerpo.translation(), q = cuerpo.rotation();
    malla.position.set(p.x, p.y, p.z);
    malla.quaternion.set(q.x, q.y, q.z, q.w);
  }
}

/** Avanza la física a pasos fijos de 1/60 s, sin importar a cuántos cuadros vaya el equipo. */
export function pasos(mundo: RAPIER.World, alPaso?: () => void) {
  let resto = 0;
  mundo.timestep = 1 / 60;
  return (dt: number) => {
    resto = Math.min(resto + dt, 0.25);
    while (resto >= 1 / 60) { mundo.step(); alPaso?.(); resto -= 1 / 60; }
  };
}

export interface Tiro { tirando: boolean; dx: number; dy: number; fuerza: number; inicio: { clientX: number; clientY: number } | null }

/**
 * Gesto de honda: se apoya el dedo (o el mouse), se arrastra hacia atrás y se suelta.
 * `dx`/`dy` van en fracción de pantalla (derecha y abajo positivos) y `fuerza` de 0 a 1.
 */
export function arrastre(e: Escenario, puede: () => boolean, alSoltar: (t: Tiro) => void): Tiro {
  const tiro: Tiro = { tirando: false, dx: 0, dy: 0, fuerza: 0, inicio: null };
  const TOPE = 0.38;
  const medir = (ev: PointerEvent) => {
    if (!tiro.inicio) return;
    const r = e.lienzo.getBoundingClientRect(), escala = Math.min(r.width, r.height);
    tiro.dx = (ev.clientX - tiro.inicio.clientX) / escala;
    tiro.dy = (ev.clientY - tiro.inicio.clientY) / escala;
    tiro.fuerza = Math.min(1, Math.hypot(tiro.dx, tiro.dy) / TOPE);
  };
  e.escuchar(e.lienzo, 'pointerdown', (ev) => {
    if (!puede()) return;
    tiro.inicio = { clientX: ev.clientX, clientY: ev.clientY };
    tiro.tirando = true;
    tiro.dx = tiro.dy = tiro.fuerza = 0;
    e.lienzo.setPointerCapture(ev.pointerId);
  });
  e.escuchar(e.lienzo, 'pointermove', medir);
  const soltar = (ev: PointerEvent) => {
    if (!tiro.tirando) return;
    medir(ev);
    tiro.tirando = false;
    if (tiro.fuerza > 0.12 && puede()) alSoltar(tiro);
    tiro.fuerza = 0;
  };
  e.escuchar(e.lienzo, 'pointerup', soltar);
  e.escuchar(e.lienzo, 'pointercancel', () => { tiro.tirando = false; tiro.fuerza = 0; });
  return tiro;
}

/** Fila de puntos que muestra por dónde saldrá el tiro. */
export function guia(escena: THREE.Scene, cuantos: number, color = '#ffffff'): THREE.Mesh[] {
  const geo = new THREE.SphereGeometry(0.13, 8, 6), mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  return Array.from({ length: cuantos }, () => { const p = new THREE.Mesh(geo, mat); p.visible = false; escena.add(p); return p; });
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
export const mat = (color: string) => {
  let m = mats.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }); mats.set(color, m); }
  return m;
};
export const caja = (ancho: number, alto: number, fondo: number, color: string) => new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, fondo), mat(color));
