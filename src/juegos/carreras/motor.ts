import * as THREE from 'three';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, mmss } from '../reflejos/motor';

// Motor A · Carreras de obstáculos. El personaje corre y salta en 3D por una pista hecha de bloques.
// Resuelve una vez el control, los choques, las caídas, los puntos de control, la cámara que lo sigue y el puntaje;
// cada juego solo describe su pista (ver pistas.ts).

/** Un bloque de la pista. `y` es la altura de su cara de arriba; `h` es cuánto baja desde ahí. */
export interface Bloque {
  x: number; y: number; z: number; w: number; h: number; d: number; color: string;
  /** cae: se desploma poco después de pisarlo · control: punto de reaparición · meta: llegada · falsa: puerta que es pared · real: puerta que se abre */
  tipo?: 'cae' | 'control' | 'meta' | 'falsa' | 'real';
}
/** Barra que gira a ras de suelo alrededor de un eje vertical: hay que saltarla. */
export interface Barra { x: number; y: number; z: number; largo: number; vel: number; fase: number }
export interface Pista {
  bloques: Bloque[];
  barras?: Barra[];
  inicio: [number, number, number];
  /** Lava que sube: tocarla termina la partida. */
  lava?: { desde: number; vel: number; acel: number };
  cielo: string;
  /** Color de lo que hay debajo de la pista. */
  abismo: string;
  limite: number;
  /** Cuánto de la pista lleva recorrido el jugador, de 0 a 1. */
  progreso(x: number, y: number, z: number): number;
}

const RADIO = 0.38, ALTO = 1.7, VEL = 7.4, GRAVEDAD = -30, SALTO = 11, ESCALON = 0.3, DEMORA_CAIDA = 0.5;

export async function crearCarrera(c: Contexto, pista: Pista): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 10, alto: 10, centro: [0, 0, 0], inclinacion: 0.5, sinPlaya: true });
  e.escena.background = new THREE.Color(pista.cielo);
  const k = await e.personaje(c.aspecto, ALTO);
  const mando = crearMando(e, c.caja, 'Saltar');

  const abismo = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: pista.abismo }));
  abismo.rotation.x = -Math.PI / 2;
  e.escena.add(abismo);
  const fondoY = Math.min(...pista.bloques.map((b) => b.y - b.h)) - 9;
  abismo.position.y = fondoY;

  const mats = new Map<string, THREE.MeshStandardMaterial>(), geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = (color: string) => { let m = mats.get(color); if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }); mats.set(color, m); } return m; };
  const piezas = pista.bloques.map((b) => {
    const malla = new THREE.Mesh(geo, mat(b.color));
    malla.scale.set(b.w, b.h, b.d);
    malla.position.set(b.x, b.y - b.h / 2, b.z);
    e.escena.add(malla);
    return { b, malla, pisado: -1, fuera: false };
  });
  const barras = (pista.barras ?? []).map((b) => {
    const malla = new THREE.Mesh(geo, mat('#ef5565')), eje = new THREE.Mesh(geo, mat('#5a4a3a'));
    malla.scale.set(b.largo, 0.5, 0.5);
    malla.position.set(b.x, b.y + 0.45, b.z);
    eje.scale.set(0.7, 0.9, 0.7);
    eje.position.set(b.x, b.y + 0.45, b.z);
    e.escena.add(malla, eje);
    return { b, malla };
  });
  const lava = pista.lava && new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: '#ff6a1e' }));
  if (lava) { lava.rotation.x = -Math.PI / 2; e.escena.add(lava); }

  const p = new THREE.Vector3(...pista.inicio), v = new THREE.Vector3(), control = p.clone();
  let enSuelo = false, aire = 0, aturdido = 0, caidas = 0, mejor = 0, terminado = false, empezado = false, rumbo = Math.PI;
  const solido = (x: (typeof piezas)[number]) => !x.fuera && x.b.tipo !== 'real';

  const terminar = (t: number, llego: boolean) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    k.animar(llego ? 'emote-yes' : 'die', !llego);
    c.alTerminar({
      puntaje: llego ? Math.max(300, Math.round(2000 - 20 * t - 40 * caidas)) : Math.round(600 * mejor),
      lineas: [['Resultado', llego ? 'Llegaste a la meta' : pista.lava ? 'Te alcanzó la lava' : 'Se acabó el tiempo'], ['Recorrido', `${Math.round((llego ? 1 : mejor) * 100)} %`], ['Tiempo', `${t.toFixed(1)} s`], ['Caídas', String(caidas)]],
      detalle: { llego, avance: Math.round(mejor * 100), seg: Math.round(t * 10) / 10, caidas },
    });
  };
  const reaparecer = () => {
    caidas++;
    p.copy(control);
    v.set(0, 0, 0);
    for (const x of piezas) if (x.b.tipo === 'cae') { x.pisado = -1; x.fuera = false; x.malla.position.y = x.b.y - x.b.h / 2; x.malla.visible = true; }
    e.sonido.mal();
    e.hud.aviso('¡Al agua!', 'mal', 0.7);
  };

  const paso = (t: number, dt: number) => {
    // Movimiento pedido
    if (t >= aturdido) {
      v.x += (mando.x * VEL - v.x) * Math.min(1, 14 * dt);
      v.z += (mando.z * VEL - v.z) * Math.min(1, 14 * dt);
      if (mando.tomarAccion() && aire < 0.12) { v.y = SALTO; aire = 1; e.sonido.tono(420, 0.1, { tipo: 'triangle', vol: 0.15, hasta: 700 }); }
    } else mando.tomarAccion();

    // De lado: los bloques a la altura del cuerpo empujan hacia afuera
    p.x += v.x * dt;
    p.z += v.z * dt;
    for (const x of piezas) {
      const b = x.b, dx = p.x - b.x, dz = p.z - b.z, mx = b.w / 2 + RADIO, mz = b.d / 2 + RADIO;
      if (Math.abs(dx) >= mx || Math.abs(dz) >= mz || p.y >= b.y - ESCALON || p.y + ALTO <= b.y - b.h) continue;
      if (b.tipo === 'real') { if (!x.fuera) { x.fuera = true; x.malla.visible = false; e.sonido.efecto('madera') || e.sonido.ruido(0.1, 0.2); e.flotante('¡Pasa!', b.x, b.y, b.z, 'bien'); } continue; }
      if (x.fuera) continue;
      if (b.tipo === 'falsa' && x.pisado < 0) { x.pisado = t; e.sonido.efecto('golpe', 0.6); } // suena una vez por puerta
      if (mx - Math.abs(dx) < mz - Math.abs(dz)) { p.x = b.x + Math.sign(dx) * mx; v.x = 0; } else { p.z = b.z + Math.sign(dz) * mz; v.z = 0; }
    }

    // Hacia arriba y abajo: se aterriza en la cara superior del bloque que quede bajo los pies
    const antes = p.y;
    v.y += GRAVEDAD * dt;
    p.y += v.y * dt;
    enSuelo = false;
    for (const x of piezas) {
      const b = x.b;
      if (!solido(x) || v.y > 0 || Math.abs(p.x - b.x) > b.w / 2 + RADIO * 0.5 || Math.abs(p.z - b.z) > b.d / 2 + RADIO * 0.5 || antes < b.y - ESCALON || p.y > b.y) continue;
      p.y = b.y;
      v.y = 0;
      enSuelo = true;
      if (b.tipo === 'cae' && x.pisado < 0) x.pisado = t;
      if (b.tipo === 'control' && control.z !== b.z) { control.set(b.x, b.y + 0.1, b.z); e.hud.aviso('Punto de control', 'bien', 0.8); e.sonido.efecto('campana', 0.4); }
      if (b.tipo === 'meta') return terminar(t, true);
    }
    aire = enSuelo ? 0 : aire + dt;

    // Tablones que ceden y barras que barren
    for (const x of piezas) {
      if (x.b.tipo !== 'cae' || x.pisado < 0) continue;
      const desde = t - x.pisado - DEMORA_CAIDA;
      if (desde < 0) x.malla.position.x = x.b.x + Math.sin(t * 60) * 0.04;
      else { x.fuera = true; x.malla.position.y = x.b.y - x.b.h / 2 - 16 * desde * desde; x.malla.visible = desde < 1.2; }
    }
    for (const { b, malla } of barras) {
      const a = b.fase + b.vel * t, ux = Math.cos(a), uz = Math.sin(a);
      malla.rotation.y = -a;
      if (p.y > b.y + 0.75 || p.y + ALTO < b.y + 0.15 || t < aturdido) continue;
      const s = limitar((p.x - b.x) * ux + (p.z - b.z) * uz, -b.largo / 2, b.largo / 2), lx = p.x - (b.x + ux * s), lz = p.z - (b.z + uz * s);
      if (Math.hypot(lx, lz) > RADIO + 0.3) continue;
      // La barra empuja en el sentido en que viene girando
      v.set(-uz * b.vel * s * 1.2, 6.5, ux * b.vel * s * 1.2);
      const lado = Math.sign(b.vel) * Math.sign(s || 1);
      v.x += -uz * lado * 5;
      v.z += ux * lado * 5;
      aturdido = t + 0.45;
      aire = 1;
      e.sonido.efecto('golpe') || e.sonido.mal();
    }

    if (lava) {
      lava.position.y = pista.lava!.desde + pista.lava!.vel * t + 0.5 * pista.lava!.acel * t * t;
      if (p.y < lava.position.y) return terminar(t, false);
    } else if (p.y < fondoY + 5) reaparecer();
    mejor = Math.max(mejor, limitar(pista.progreso(p.x, p.y, p.z), 0, 1));
    if (t >= pista.limite) terminar(t, false);
  };

  e.hud.tiempo(mmss(pista.limite));
  e.hud.puntos(0);
  const mira = new THREE.Vector3();
  e.alCuadro((t, dt) => {
    if (empezado && !terminado) { const medio = Math.min(dt, 0.05) / 2; paso(t, medio); if (!terminado) paso(t + medio, medio); }
    // Personaje y cámara
    const andando = Math.hypot(v.x, v.z) > 0.6;
    if (andando) rumbo = Math.atan2(v.x, v.z);
    k.grupo.position.copy(p);
    k.grupo.rotation.y = rumbo;
    if (!terminado) k.animar(!enSuelo ? 'jump' : andando ? 'sprint' : 'idle');
    mira.set(p.x * 0.55, p.y + 6.2, p.z + 10.5);
    e.camara.position.lerp(mira, empezado ? Math.min(1, 6 * dt) : 1);
    e.camara.lookAt(p.x * 0.55, p.y + 1.2, p.z - 4);
    if (!empezado || terminado) return;
    e.hud.tiempo(mmss(pista.limite - t));
    e.hud.extra(`${Math.round(mejor * 100)} % de la pista`);
    e.hud.puntos(Math.max(0, Math.round(2000 - 20 * t - 40 * caidas)));
  });

  return { empezar() { e.empezar(); empezado = true; }, destruir: e.destruir };
}
