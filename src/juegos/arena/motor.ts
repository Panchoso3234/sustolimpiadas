import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { esDaltonico } from '../../nucleo/preferencias';
import { aspectoAleatorio } from '../../personaje/catalogo';
import type { Kenney } from '../../personaje/kenney';
import { crearMando } from '../mando';
import type { Contexto, Partida, Resultado } from '../marco';
import { crearEscenario, limitar, mmss, type Escenario } from '../reflejos/motor';

// Motor B · Arena con física. Varios personajes (tú y rivales manejados por la máquina) se mueven y se empujan en una
// cancha vista desde arriba. Resuelve una vez el movimiento, la embestida, los choques, los bordes, la cámara y el reloj;
// cada juego solo pone sus reglas y le dice a cada rival hacia dónde ir (ver juegos.ts).

export interface Ente {
  id: number; x: number; z: number; vx: number; vz: number; r: number; masa: number;
  /** Equipo del personaje; -1 para pelotas y otras cosas sueltas. */
  equipo: number;
  humano: boolean; vivo: boolean;
  /** Hasta cuándo no puede moverse (tras un golpe fuerte). */
  aturdido: number;
  /** Cuándo puede volver a embestir. */
  recarga: number;
  /** Quién lo tocó por última vez y cuándo. */
  tocadoPor: number; tocadoEn: number;
  /** Contadores propios de cada juego. */
  dato: Record<string, number>;
  k?: Kenney; malla?: THREE.Object3D;
}
export interface Orden { x: number; z: number; embestir?: boolean; /** De 0 a 0,8: cuánto se cargó la embestida. */ carga?: number }
export interface Mundo { e: Escenario; entes: Ente[]; cosas: Ente[]; yo: Ente; r: () => number; ancho: number; fondo: number; cosa(r: number, masa: number, malla: THREE.Object3D, x: number, z: number): Ente }
export interface Arena {
  /** Medidas de la cancha. Con `radio`, es redonda y sin bordes: quien sale, cae. */
  ancho: number; fondo: number; radio?: number;
  suelo: string; cielo: string; playa?: boolean;
  dura: number;
  /** Equipo de cada personaje; el primero es el jugador. */
  equipos: number[];
  salida(i: number, equipo: number): [number, number];
  preparar(m: Mundo): void | Promise<void>;
  rival(m: Mundo, ente: Ente, t: number): Orden;
  paso(m: Mundo, t: number, dt: number): void;
  choque?(m: Mundo, a: Ente, b: Ente, fuerza: number, t: number): void;
  /** Multiplica el roce de un personaje (menos de 1: resbala). */
  roce?(m: Mundo, x: Ente, t: number): number;
  termino?(m: Mundo, t: number): boolean;
  marcador(m: Mundo, t: number): { extra: string; puntos: number };
  resultado(m: Mundo, t: number): Resultado;
}

// En modo daltónico, colores que se distinguen sin depender del rojo y el verde (paleta Okabe-Ito)
export const COLOR_EQUIPO = esDaltonico() ? ['#3f8cff', '#e69f00', '#f0e442', '#56b4e9', '#d55e00', '#cc79a7'] : ['#3f8cff', '#ef5565', '#3fc79a', '#ffb02e', '#c79bff', '#ff7ab8'];
const ACEL = 46, ROCE = 5.5, VEL = 7.6, IMPULSO = 10, RECARGA = 1.1;
export const lejos = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export async function crearArena(c: Contexto, a: Arena): Promise<Partida> {
  const inclinacion = 0.98;
  const e = crearEscenario(c.caja, { ancho: (a.radio ? a.radio * 2 : a.ancho) + 3, alto: (a.radio ? a.radio * 2 : a.fondo) * Math.sin(inclinacion) + 4.5, centro: [0, 0.6, 0.6], inclinacion, sinPlaya: !a.playa });
  e.escena.background = new THREE.Color(a.cielo);
  const mando = crearMando(e, c.caja, 'Embestir'), r = generador(c.semilla);

  if (!a.radio) {
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(a.ancho, a.fondo), new THREE.MeshStandardMaterial({ color: a.suelo, roughness: 1 }));
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.y = 0.03;
    const borde = new THREE.Mesh(new THREE.PlaneGeometry(a.ancho + 1.2, a.fondo + 1.2), new THREE.MeshBasicMaterial({ color: '#3a2a20' }));
    borde.rotation.x = -Math.PI / 2;
    borde.position.y = 0.01;
    e.escena.add(borde, suelo);
  }

  const nuevo = (id: number, equipo: number, radio: number, masa: number, x: number, z: number): Ente =>
    ({ id, x, z, vx: 0, vz: 0, r: radio, masa, equipo, humano: false, vivo: true, aturdido: 0, recarga: 0, tocadoPor: -1, tocadoEn: -9, dato: {} });
  const entes: Ente[] = a.equipos.map((equipo, i) => nuevo(i, equipo, 0.55, 1, ...a.salida(i, equipo)));
  entes[0].humano = true;
  const cosas: Ente[] = [];
  const m: Mundo = {
    e, entes, cosas, yo: entes[0], r, ancho: a.ancho, fondo: a.fondo,
    cosa(radio, masa, malla, x, z) { const o = nuevo(100 + cosas.length, -1, radio, masa, x, z); o.malla = malla; e.escena.add(malla); cosas.push(o); return o; },
  };

  // Los rivales llevan un aspecto sorteado con la semilla; el jugador, el suyo. Cada uno pisa un aro del color de su equipo.
  const personajes = await Promise.all(entes.map((x, i) => e.personaje(i === 0 ? c.aspecto : aspectoAleatorio(generador(`${c.semilla}|rival${i}`)), 1.9)));
  entes.forEach((x, i) => {
    x.k = personajes[i];
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.5, x.humano ? 0.82 : 0.68, 20), new THREE.MeshBasicMaterial({ color: x.humano ? '#ffffff' : COLOR_EQUIPO[x.equipo % COLOR_EQUIPO.length], side: THREE.DoubleSide }));
    aro.rotation.x = -Math.PI / 2;
    x.malla = aro;
    e.escena.add(aro);
    if (x.humano) { const base = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: COLOR_EQUIPO[x.equipo % COLOR_EQUIPO.length] })); base.rotation.x = -Math.PI / 2; base.position.z = -0.001; aro.add(base); }
  });
  await a.preparar(m);

  let terminado = false, empezado = false, resto = 0, carga = 0;
  const terminar = (t: number) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    m.yo.k?.animar('emote-yes');
    c.alTerminar(a.resultado(m, t));
  };

  const fisica = (t: number, dt: number) => {
    for (const x of entes) {
      if (!x.vivo) continue;
      let orden: Orden;
      if (x.humano) {
        // Mantener la acción carga la embestida (hasta 0,8 s); al soltar sale con más fuerza
        const toque = mando.tomarAccion();
        if (mando.pulsada) carga = Math.min(0.8, carga + dt);
        const suelta = !mando.pulsada && (carga > 0 || toque);
        orden = { x: x.x + mando.x * 9, z: x.z + mando.z * 9, embestir: suelta, carga };
        if (suelta) carga = 0;
      } else orden = a.rival(m, x, t);
      let dx = orden.x - x.x, dz = orden.z - x.z;
      const largo = Math.hypot(dx, dz);
      if (largo > 0.25) { dx /= largo; dz /= largo; } else dx = dz = 0;
      if (t >= x.aturdido) {
        const fuerza = x.humano ? 1 : 0.86; // los rivales corren un poco menos que tú
        x.vx += dx * ACEL * fuerza * dt;
        x.vz += dz * ACEL * fuerza * dt;
        if (orden.embestir && t >= x.recarga && largo > 0.25) {
          const fuerzaEmbestida = IMPULSO * (1 + (orden.carga ?? 0.25) * 1.6);
          x.vx += dx * fuerzaEmbestida; x.vz += dz * fuerzaEmbestida;
          x.recarga = t + RECARGA;
          x.dato.embiste = t + 0.35;
          if (x.humano) e.sonido.efecto('soltar', 0.5);
        }
      }
    }
    for (const x of [...entes, ...cosas]) {
      if (!x.vivo) continue;
      const freno = Math.max(0, 1 - (x.equipo < 0 ? 1.1 : ROCE * (a.roce?.(m, x, t) ?? 1)) * dt);
      x.vx *= freno; x.vz *= freno;
      const rapidez = Math.hypot(x.vx, x.vz), tope = x.equipo < 0 ? 22 : VEL * 2.2;
      if (rapidez > tope) { x.vx *= tope / rapidez; x.vz *= tope / rapidez; }
      x.x += x.vx * dt; x.z += x.vz * dt;
      if (!a.radio) {
        // Esquinas redondeadas: una pelota nunca queda atrapada en un rincón. Las pelotas rebotan más que la gente.
        const mx = a.ancho / 2 - x.r, mz = a.fondo / 2 - x.r, e2 = x.equipo < 0 ? 0.85 : 0.6, rc = 2.2;
        if (Math.abs(x.x) > mx) { x.x = Math.sign(x.x) * mx; x.vx *= -e2; }
        if (Math.abs(x.z) > mz) { x.z = Math.sign(x.z) * mz; x.vz *= -e2; }
        const cx = Math.sign(x.x) * (mx - rc), cz = Math.sign(x.z) * (mz - rc), ex = x.x - cx, ez = x.z - cz, de = Math.hypot(ex, ez);
        if (Math.abs(x.x) > mx - rc && Math.abs(x.z) > mz - rc && de > rc) {
          const nx = ex / de, nz = ez / de, hacia = x.vx * nx + x.vz * nz;
          x.x = cx + nx * rc; x.z = cz + nz * rc;
          if (hacia > 0) { x.vx -= (1 + e2) * hacia * nx; x.vz -= (1 + e2) * hacia * nz; }
        }
      }
    }
    // Choques entre círculos: se separan y se reparten el golpe según su masa
    const todos = [...entes, ...cosas].filter((x) => x.vivo);
    for (let i = 0; i < todos.length; i++) for (let k = i + 1; k < todos.length; k++) {
      const p = todos[i], q = todos[k], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), junto = p.r + q.r;
      if (d >= junto || d === 0) continue;
      const nx = dx / d, nz = dz / d, total = p.masa + q.masa, sobra = junto - d;
      p.x -= nx * sobra * (q.masa / total); p.z -= nz * sobra * (q.masa / total);
      q.x += nx * sobra * (p.masa / total); q.z += nz * sobra * (p.masa / total);
      const acerca = (p.vx - q.vx) * nx + (p.vz - q.vz) * nz;
      if (acerca <= 0) continue;
      const j = (1.6 * acerca) / total;
      p.vx -= j * q.masa * nx; p.vz -= j * q.masa * nz;
      q.vx += j * p.masa * nx; q.vz += j * p.masa * nz;
      p.tocadoPor = q.id; q.tocadoPor = p.id; p.tocadoEn = q.tocadoEn = t;
      a.choque?.(m, p, q, acerca, t);
      // Quien venía embistiendo empuja de verdad: el otro sale despedido (y aturdido, si es persona)
      for (const [golpea, recibe, s] of [[p, q, 1], [q, p, -1]] as const) {
        if (t >= (golpea.dato.embiste ?? 0)) continue;
        const empuje = recibe.equipo < 0 ? 12 : 9.5;
        recibe.vx += nx * s * empuje; recibe.vz += nz * s * empuje;
        if (recibe.equipo >= 0) recibe.aturdido = t + 0.35;
        golpea.dato.embiste = 0;
      }
      if (acerca > 5 && (p.humano || q.humano)) e.sonido.efecto('golpe', Math.min(0.8, acerca / 14));
    }
    a.paso(m, t, dt);
  };

  e.hud.tiempo(mmss(a.dura));
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    if (empezado && !terminado) {
      resto = Math.min(resto + dt, 0.1);
      while (resto >= 1 / 60 && !terminado) { fisica(t, 1 / 60); resto -= 1 / 60; }
      const marcador = a.marcador(m, t);
      e.hud.tiempo(mmss(a.dura - t));
      e.hud.extra(marcador.extra);
      e.hud.puntos(marcador.puntos);
      if (t >= a.dura || a.termino?.(m, t)) terminar(t);
    }
    m.yo.malla!.scale.setScalar(1 + carga * 0.7); // el aro del jugador crece mientras carga
    for (const x of entes) {
      const g = x.k!.grupo, rapidez = Math.hypot(x.vx, x.vz);
      g.visible = x.malla!.visible = x.vivo;
      g.position.set(x.x, 0, x.z);
      x.malla!.position.set(x.x, 0.06, x.z);
      if (rapidez > 0.8) g.rotation.y = Math.atan2(x.vx, x.vz);
      if (!terminado) x.k!.animar(t < x.aturdido ? 'emote-no' : rapidez > 1.2 ? 'sprint' : 'idle');
    }
    for (const x of cosas) { x.malla!.visible = x.vivo; x.malla!.position.x = x.x; x.malla!.position.z = x.z; x.malla!.rotation.x += x.vz * dt * 0.8; x.malla!.rotation.z -= x.vx * dt * 0.8; }
  });

  return { empezar() { e.empezar(); empezado = true; }, destruir: e.destruir };
}

/** Punto al que debe ir un rival para quedar a cierta distancia de otro punto, viniendo desde una dirección. */
export const detrasDe = (objeto: { x: number; z: number }, hacia: { x: number; z: number }, distancia: number): Orden => {
  const dx = hacia.x - objeto.x, dz = hacia.z - objeto.z, largo = Math.hypot(dx, dz) || 1;
  return { x: objeto.x - (dx / largo) * distancia, z: objeto.z - (dz / largo) * distancia };
};
export { limitar };
