import * as THREE from 'three';
import { figuraFantasma, grabadora } from '../fantasma';
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
  /** Se mueve de ida y vuelta por un eje: cuánto se aleja, qué tan rápido y desde qué punto del ciclo parte. */
  mueve?: { eje: 'x' | 'y' | 'z'; amp: number; vel: number; fase: number };
}
/** Barra que gira alrededor de un eje vertical: a ras de suelo hay que saltarla; las altas (`alta`) se pasan agachado. */
export interface Barra { x: number; y: number; z: number; largo: number; vel: number; fase: number; alta?: boolean }
export interface Pista {
  bloques: Bloque[];
  barras?: Barra[];
  inicio: [number, number, number];
  /** Lava que sube: tocarla termina la partida. */
  lava?: { desde: number; vel: number; acel: number };
  cielo: string;
  /** Color de lo que hay debajo de la pista. */
  abismo: string;
  /** Lo que se avisa al caer ("¡A la lava!"). */
  caida: string;
  limite: number;
  /** Segundos en que el fantasma de ritmo llega a la meta (el ritmo de una buena marca). */
  ritmo: number;
  /** Cuánto de la pista lleva recorrido el jugador, de 0 a 1. */
  progreso(x: number, y: number, z: number): number;
}

const RADIO = 0.38, ALTO = 1.7, VEL = 7.4, GRAVEDAD = -30, SALTO = 11, ESCALON = 0.3, DEMORA_CAIDA = 0.5;

export async function crearCarrera(c: Contexto, pista: Pista): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 10, alto: 10, centro: [0, 0, 0], inclinacion: 0.5, sinPlaya: true });
  e.escena.background = new THREE.Color(pista.cielo);
  const k = await e.personaje(c.aspecto, ALTO);
  const hayAltas = (pista.barras ?? []).some((b) => b.alta);
  const mando = crearMando(e, c.caja, 'Saltar', hayAltas ? 'Agacharse' : undefined);

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
    return { b, malla, pisado: -1, fuera: false, base: { x: b.x, y: b.y, z: b.z } };
  });
  const moviles = piezas.filter((x) => x.b.mueve);
  let sobre: (typeof piezas)[number] | null = null; // la pieza donde está parado, para que lo lleve si se mueve
  const barras = (pista.barras ?? []).map((b) => {
    const malla = new THREE.Mesh(geo, mat('#ef5565')), eje = new THREE.Mesh(geo, mat('#5a4a3a'));
    const altura = b.alta ? 1.3 : 0.45;
    malla.scale.set(b.largo, 0.5, 0.5);
    malla.position.set(b.x, b.y + altura, b.z);
    if (b.alta) malla.material = mat('#ffb02e');
    eje.scale.set(0.7, altura + 0.45, 0.7);
    eje.position.set(b.x, b.y + (altura + 0.45) / 2, b.z);
    e.escena.add(malla, eje);
    return { b, malla };
  });
  const lava = pista.lava && new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: '#ff6a1e' }));
  if (lava) { lava.rotation.x = -Math.PI / 2; e.escena.add(lava); }

  const p = new THREE.Vector3(...pista.inicio), v = new THREE.Vector3(), control = p.clone();
  const sombraPies = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }));
  sombraPies.rotation.x = -Math.PI / 2;
  e.escena.add(sombraPies);
  let enSuelo = false, aire = 0, aturdido = 0, caidas = 0, mejor = 0, terminado = false, empezado = false, rumbo = Math.PI;
  const solido = (x: (typeof piezas)[number]) => !x.fuera && x.b.tipo !== 'real';

  // Fantasma del líder (si se juega contra él) y grabación del propio recorrido
  const ruta = grabadora(), lider = c.fantasma ? figuraFantasma(e.escena, c.fantasma, 1.7) : null;
  const terminar = (t: number, llego: boolean) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    k.animar(llego ? 'emote-yes' : 'die', !llego);
    c.alTerminar({
      puntaje: llego ? Math.max(300, Math.round(2000 - 20 * t - 40 * caidas)) : Math.round(600 * mejor),
      lineas: [['Resultado', llego ? 'Llegaste a la meta' : pista.lava ? 'Te alcanzó la lava' : 'Se acabó el tiempo'], ['Recorrido', `${Math.round((llego ? 1 : mejor) * 100)} %`], ['Tiempo', `${t.toFixed(1)} s`], ['Caídas', String(caidas)]],
      detalle: { llego, avance: Math.round(mejor * 100), seg: Math.round(t * 10) / 10, caidas, ruta: ruta.final() },
    });
  };
  const reaparecer = () => {
    caidas++;
    p.copy(control);
    v.set(0, 0, 0);
    for (const x of piezas) if (x.b.tipo === 'cae') { x.pisado = -1; x.fuera = false; x.malla.position.y = x.b.y - x.b.h / 2; x.malla.visible = true; }
    e.sonido.mal();
    e.hud.aviso(pista.caida, 'mal', 0.7);
  };

  const paso = (t: number, dt: number) => {
    // Plataformas que se mueven: avanzan, y si estás parado encima te llevan con ellas
    for (const x of moviles) {
      const m = x.b.mueve!, antes = { x: x.b.x, y: x.b.y, z: x.b.z }, desvio = m.amp * Math.sin(m.vel * t + m.fase);
      x.b.x = x.base.x + (m.eje === 'x' ? desvio : 0); x.b.y = x.base.y + (m.eje === 'y' ? desvio : 0); x.b.z = x.base.z + (m.eje === 'z' ? desvio : 0);
      if (!x.fuera) x.malla.position.set(x.b.x, x.b.y - x.b.h / 2, x.b.z);
      if (sobre === x) { p.x += x.b.x - antes.x; p.y += x.b.y - antes.y; p.z += x.b.z - antes.z; }
    }
    // Movimiento pedido (agachado se avanza más lento)
    const rapidez = mando.agachado ? VEL * 0.55 : VEL;
    if (t >= aturdido) {
      v.x += (mando.x * rapidez - v.x) * Math.min(1, 14 * dt);
      v.z += (mando.z * rapidez - v.z) * Math.min(1, 14 * dt);
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
    sobre = null;
    for (const x of piezas) {
      const b = x.b;
      if (!solido(x) || v.y > 0 || Math.abs(p.x - b.x) > b.w / 2 + RADIO * 0.5 || Math.abs(p.z - b.z) > b.d / 2 + RADIO * 0.5 || antes < b.y - ESCALON || p.y > b.y) continue;
      p.y = b.y;
      v.y = 0;
      enSuelo = true;
      sobre = x;
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
      else { x.fuera = true; x.malla.position.y = x.b.y - x.b.h / 2 - 16 * desde * desde; x.malla.visible = desde < 1.2; if (sobre === x) sobre = null; }
    }
    for (const { b, malla } of barras) {
      const a = b.fase + b.vel * t, ux = Math.cos(a), uz = Math.sin(a);
      malla.rotation.y = -a;
      // Franja de alto que barre: baja (saltarla) o alta (pasar agachado)
      const [desde, hasta] = b.alta ? [1.05, 1.55] : [0.15, 0.75], cabeza = p.y + (mando.agachado ? 0.95 : ALTO);
      if (p.y > b.y + hasta || cabeza < b.y + desde || t < aturdido) continue;
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

  // Fantasma de ritmo: corre de la salida a la meta al paso de una buena marca, como referencia
  const meta = pista.bloques.find((b) => b.tipo === 'meta') ?? pista.bloques[pista.bloques.length - 1];
  const fantasma = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1, 4, 10), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false }));
  e.escena.add(fantasma);
  const salida = new THREE.Vector3(...pista.inicio), llegada = new THREE.Vector3(meta.x, meta.y, meta.z);

  // Cámara: detrás del personaje o desde arriba (botón o tecla V)
  let desdeArriba = false;
  const botonCamara = document.createElement('button');
  botonCamara.className = 'boton camara-boton';
  const pintarCamara = () => { botonCamara.textContent = desdeArriba ? 'Cámara: arriba' : 'Cámara: atrás'; };
  pintarCamara();
  botonCamara.addEventListener('click', () => { desdeArriba = !desdeArriba; pintarCamara(); botonCamara.blur(); });
  c.caja.appendChild(botonCamara);
  e.escuchar(window, 'keydown', (ev) => { if (ev.key === 'v' || ev.key === 'V') { desdeArriba = !desdeArriba; pintarCamara(); } });

  e.hud.tiempo(mmss(pista.limite));
  e.hud.puntos(0);
  const mira = new THREE.Vector3();
  e.alCuadro((t, dt) => {
    if (empezado && !terminado) { const medio = Math.min(dt, 0.05) / 2; paso(t, medio); if (!terminado) paso(t + medio, medio); ruta.anotar(t, p.x, p.y, p.z); lider?.mover(t); }
    // Personaje y cámara
    const andando = Math.hypot(v.x, v.z) > 0.6;
    if (andando) rumbo = Math.atan2(v.x, v.z);
    k.grupo.position.copy(p);
    k.grupo.rotation.y = rumbo;
    k.grupo.scale.y = k.grupo.scale.x * (mando.agachado && !terminado ? 0.6 : 1);
    fantasma.position.lerpVectors(salida, llegada, empezado ? limitar(t / pista.ritmo, 0, 1) : 0);
    fantasma.position.y += 0.85;
    fantasma.visible = !lider && empezado && !terminado && t < pista.ritmo + 1.5;
    // La sombra cae en el bloque que está justo debajo: así se ve dónde vas a aterrizar
    let piso = -Infinity;
    for (const x of piezas) if (solido(x) && Math.abs(p.x - x.b.x) <= x.b.w / 2 && Math.abs(p.z - x.b.z) <= x.b.d / 2 && x.b.y <= p.y + 0.05) piso = Math.max(piso, x.b.y);
    sombraPies.visible = piso > -Infinity;
    sombraPies.position.set(p.x, piso + 0.03, p.z);
    sombraPies.scale.setScalar(Math.max(0.45, 1 - (p.y - piso) * 0.12));
    if (!terminado) k.animar(!enSuelo ? 'jump' : andando ? 'sprint' : 'idle');
    if (desdeArriba) mira.set(p.x * 0.5, p.y + 15, p.z + 3.2); else mira.set(p.x * 0.35, p.y + 8.8, p.z + 8.4);
    e.camara.position.lerp(mira, empezado ? Math.min(1, 6 * dt) : 1);
    if (desdeArriba) e.camara.lookAt(p.x * 0.5, p.y, p.z - 2.5); else e.camara.lookAt(p.x * 0.35, p.y + 0.2, p.z - 5.2);
    if (!empezado || terminado) return;
    e.hud.tiempo(mmss(pista.limite - t));
    e.hud.extra(`${Math.round(mejor * 100)} % de la pista`);
    e.hud.puntos(Math.max(0, Math.round(2000 - 20 * t - 40 * caidas)));
  });

  return { empezar() { e.empezar(); empezado = true; }, destruir: e.destruir };
}
