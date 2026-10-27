import * as THREE from 'three';
import { figuraFantasma, grabadora } from '../fantasma';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, mmss } from '../reflejos/motor';

// Motor A · Carreras de obstáculos (versión 2, 26-10). El personaje corre y salta en 3D por una pista hecha de bloques.
// Resuelve una vez el control, los choques, las caídas, los puntos de control, la cámara, la lava que sube y el puntaje;
// cada juego solo describe su pista (ver pistas.ts). Todo lo que se mueve depende del reloj de la partida y de la semilla:
// dos personas con la misma semilla enfrentan exactamente lo mismo (requisito del duelo diferido).

/** Un bloque de la pista. `y` es la altura de su cara de arriba; `h` es cuánto baja desde ahí. */
export interface Bloque {
  x: number; y: number; z: number; w: number; h: number; d: number; color: string;
  /**
   * cae: se desploma poco después de pisarlo · control: punto de reaparición · meta: llegada · vapor: lanza hacia arriba y adelante
   * falsa / real: puertas (solo se prueban corriendo de frente; la falsa rebota y devuelve al último control)
   */
  tipo?: 'cae' | 'control' | 'meta' | 'falsa' | 'real' | 'vapor';
  /** Se mueve de ida y vuelta por un eje: cuánto se aleja, qué tan rápido y desde qué punto del ciclo parte. */
  mueve?: { eje: 'x' | 'y' | 'z'; amp: number; vel: number; fase: number };
  /** Puertas: lleva la marca de "por aquí" (acierta 2 de cada 3 veces). */
  marca?: boolean;
  /** Solo se dibuja (adornos: no choca). */
  adorno?: boolean;
}
/** Barra que gira alrededor de un eje vertical: a ras de suelo hay que saltarla; las altas (`alta`) se pasan agachado. */
export interface Barra { x: number; y: number; z: number; largo: number; vel: number; fase: number; alta?: boolean }
/** Roca que rueda hacia el jugador por un carril, desde `z0` hasta `z1`, y vuelve a salir arriba. */
export interface Roca { x: number; y: number; z0: number; z1: number; vel: number; fase: number; radio: number }
/** Martillo que cuelga de un arco y barre de lado a lado. */
export interface Martillo { x: number; y: number; z: number; largo: number; amp: number; vel: number; fase: number }
export interface Gema { x: number; y: number; z: number; valor: number }
/** Un hito de la pista (tramo o muro superado): al cruzar su `z` por primera vez da sus puntos. */
export interface Hito { z: number; puntos: number; nombre: string }
export interface Pista {
  bloques: Bloque[];
  barras?: Barra[];
  rocas?: Roca[];
  martillos?: Martillo[];
  gemas?: Gema[];
  hitos: Hito[];
  inicio: [number, number, number];
  /** Lava que sube (altura = desde + vel·t + acel·t²/2): si te alcanza, la partida termina con lo que llevas. */
  lava?: { desde: number; vel: number; acel: number };
  cielo: string;
  /** Color de lo que hay debajo de la pista. */
  abismo: string;
  /** Lo que se avisa al caer ("¡A la lava!"). */
  caida: string;
  limite: number;
  /** Cuánto de la pista lleva recorrido el jugador, de 0 a 1. */
  progreso(x: number, y: number, z: number): number;
  /** Bono al llegar: por cada segundo que sobra del límite, y por cada metro de ventaja sobre la lava. */
  bono: { porSegundo: number; porMetroLava?: number; limpio: number };
  /** Puntaje para bronce, plata y oro. */
  medallas: [number, number, number];
  escenario: 'volcan' | 'castillo';
}

const RADIO = 0.38, ALTO = 1.7, VEL = 7.4, GRAVEDAD = -30, SALTO = 11, CORTE = 4.5, ESCALON = 0.3, DEMORA_CAIDA = 0.5;
const BUFFER = 0.15, COYOTE = 0.12, BARRIDA = 0.45, VEL_BARRIDA = 1.3;
const CAMARA = 'susto.carreras.camara', AYUDA = 'susto.carreras.ayuda';
const DEV = import.meta.env.DEV, prueba = DEV ? new URLSearchParams(location.search) : null;

export async function crearCarrera(c: Contexto, pista: Pista): Promise<Partida> {
  const libre = !!c.libre;
  const e = crearEscenario(c.caja, { ancho: 10, alto: 10, centro: [0, 0, 0], inclinacion: 0.5, sinPlaya: true });
  e.escena.background = new THREE.Color(pista.cielo);
  e.escena.fog = new THREE.Fog(pista.cielo, 26, 70);
  const k = await e.personaje(c.aspecto, ALTO);
  // En el volcán siempre hay botón de agacharse: también sirve para la barrida
  const hayBajo = pista.escenario === 'volcan' || (pista.barras ?? []).some((b) => b.alta);
  const mando = crearMando(e, c.caja, 'Saltar', hayBajo ? 'Agacharse' : undefined);

  const abismo = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: pista.abismo }));
  abismo.rotation.x = -Math.PI / 2;
  e.escena.add(abismo);
  const fondoY = Math.min(...pista.bloques.map((b) => b.y - b.h)) - 9;
  abismo.position.y = fondoY;

  // Materiales: un leve cambio de tono por bloque para que la piedra y la madera no se vean planas
  const mats = new Map<string, THREE.MeshStandardMaterial>(), geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = (color: string, brillo = 0) => {
    const clave = `${color}|${brillo}`;
    let m = mats.get(clave);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, emissive: brillo ? color : '#000000', emissiveIntensity: brillo }); mats.set(clave, m); }
    return m;
  };
  const tono = (color: string, i: number) => { const c0 = new THREE.Color(color); c0.offsetHSL(0, 0, ((i * 37) % 9 - 4) * 0.012); return `#${c0.getHexString()}`; };
  const piezas = pista.bloques.map((b, i) => {
    const malla = new THREE.Mesh(geo, mat(b.tipo === 'falsa' || b.tipo === 'real' ? b.color : tono(b.color, i), b.tipo === 'vapor' ? 0.35 : 0));
    malla.scale.set(b.w, b.h, b.d);
    malla.position.set(b.x, b.y - b.h / 2, b.z);
    e.escena.add(malla);
    // Puertas: marco, manilla y (si la tiene) la marca de "por aquí"
    if (b.tipo === 'falsa' || b.tipo === 'real') {
      const manilla = new THREE.Mesh(geo, mat('#ffd23c', 0.3));
      manilla.scale.set(0.12 / b.w, 0.12 / b.h, 0.25 / b.d); manilla.position.set(0.3, -0.05, 0.55);
      malla.add(manilla);
      if (b.marca) { const runa = new THREE.Mesh(geo, mat('#7dffcf', 0.9)); runa.scale.set(0.3 / b.w, 0.3 / b.h, 0.1 / b.d); runa.position.set(0, 0.3, 0.55); malla.add(runa); }
    }
    return { b, malla, pisado: -1, fuera: false, base: { x: b.x, y: b.y, z: b.z } };
  });
  const moviles = piezas.filter((x) => x.b.mueve);
  const choca = (x: (typeof piezas)[number]) => !x.fuera && !x.b.adorno;
  let sobre: (typeof piezas)[number] | null = null; // la pieza donde está parado, para que lo lleve si se mueve
  const barras = (pista.barras ?? []).map((b) => {
    const malla = new THREE.Mesh(geo, mat(b.alta ? '#ffb02e' : '#ef5565')), altura = b.alta ? 1.3 : 0.45;
    malla.scale.set(b.largo, 0.5, 0.5);
    malla.position.set(b.x, b.y + altura, b.z);
    e.escena.add(malla);
    return { b, malla };
  });
  // Rocas que ruedan y martillos que barren
  const rocas = (pista.rocas ?? []).map((r) => {
    const malla = new THREE.Mesh(new THREE.DodecahedronGeometry(r.radio, 0), mat('#5b4a44'));
    e.escena.add(malla);
    return { r, malla };
  });
  const martillos = (pista.martillos ?? []).map((m) => {
    const grupo = new THREE.Group(), palo = new THREE.Mesh(geo, mat('#5a4a3a')), cabeza = new THREE.Mesh(geo, mat('#8a8f99'));
    palo.scale.set(0.18, m.largo, 0.18); palo.position.y = -m.largo / 2;
    cabeza.scale.set(1.4, 0.9, 0.9); cabeza.position.y = -m.largo;
    grupo.add(palo, cabeza); grupo.position.set(m.x, m.y, m.z);
    e.escena.add(grupo);
    return { m, grupo };
  });
  // Gemas: giran y brillan; al tocarlas suman
  const gemas = (pista.gemas ?? []).map((g) => {
    const malla = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), mat(g.valor >= 75 ? '#ff5ad1' : '#5ad1ff', 0.6));
    malla.position.set(g.x, g.y + 0.9, g.z);
    e.escena.add(malla);
    return { g, malla, tomada: false };
  });

  // Lava que sube: brilla y late
  const lavaOn = !!pista.lava && !libre;
  const lavaMat = new THREE.MeshStandardMaterial({ color: '#ff6a1e', emissive: '#ff3d00', emissiveIntensity: 0.9, roughness: 0.5 });
  const lava = lavaOn ? new THREE.Mesh(new THREE.PlaneGeometry(600, 600), lavaMat) : null;
  if (lava) { lava.rotation.x = -Math.PI / 2; e.escena.add(lava); }
  const alturaLava = (t: number) => (pista.lava ? pista.lava.desde + pista.lava.vel * t + 0.5 * pista.lava.acel * t * t : -Infinity);

  decorar(e.escena, pista, mat);

  const p = new THREE.Vector3(...pista.inicio), v = new THREE.Vector3(), control = p.clone();
  const sombraPies = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthWrite: false }));
  sombraPies.rotation.x = -Math.PI / 2;
  e.escena.add(sombraPies);
  let enSuelo = false, aire = 0, aturdido = 0, caidas = 0, fallos = 0, mejor = 0, terminado = false, empezado = false, rumbo = Math.PI;
  let sumado = 0, hitoSig = 0, limpioDesde = 0, pedidoSalto = -9, saltando = false, barridaHasta = 0, agachadoAntes = false, volverEn = 0;
  const parciales: number[] = [];
  const nombreHito = (i: number) => pista.hitos[i]?.nombre ?? '';

  // Fantasma del líder (si se juega contra él) y grabación del propio recorrido
  const ruta = grabadora(), lider = c.fantasma ? figuraFantasma(e.escena, c.fantasma, 1.7) : null;
  const medalla = (pts: number) => (pts >= pista.medallas[2] ? 'Oro' : pts >= pista.medallas[1] ? 'Plata' : pts >= pista.medallas[0] ? 'Bronce' : '—');
  const terminar = (t: number, llego: boolean, porque = '') => {
    if (terminado) return;
    terminado = true;
    e.detener();
    k.animar(llego ? 'emote-yes' : 'die', !llego);
    let bono = 0;
    if (llego) {
      bono += Math.max(0, Math.round((pista.limite - t) * pista.bono.porSegundo));
      if (lavaOn && pista.bono.porMetroLava) bono += Math.max(0, Math.round((p.y - alturaLava(t)) * pista.bono.porMetroLava));
    }
    const puntaje = Math.round(sumado + bono);
    const tramos = parciales.map((s, i) => `${i + 1}: ${s.toFixed(1)} s`).join(' · ');
    c.alTerminar({
      puntaje,
      lineas: [
        ['Resultado', llego ? 'Llegaste a la meta' : porque || 'Se acabó el tiempo'],
        ['Superados', `${hitoSig} de ${pista.hitos.length}`],
        ['Tiempo', `${t.toFixed(1)} s`],
        ['Caídas', String(caidas)],
        ...(pista.escenario === 'castillo' ? [['Puertas falsas', String(fallos)] as [string, string]] : []),
        ['Gemas', `${gemas.filter((g) => g.tomada).length} de ${gemas.length}`],
        ['Bono de llegada', llego ? `+${bono}` : '—'],
        ['Parciales', tramos || '—'],
        ['Medalla', medalla(puntaje)],
      ],
      detalle: { llego, avance: Math.round(mejor * 100), seg: Math.round(t * 10) / 10, caidas, fallos, hitos: hitoSig, gemas: gemas.filter((g) => g.tomada).length, version: 2, ruta: ruta.final() },
    });
  };
  /** Vuelve al último punto de control: los tablones se reponen y las puertas por delante se cierran otra vez. */
  const reaparecer = (t: number, cuenta: 'caida' | 'puerta') => {
    if (cuenta === 'caida') caidas++; else fallos++;
    limpioDesde = hitoSig + 1; // el tramo en curso ya no es "limpio"
    p.copy(control);
    v.set(0, 0, 0);
    sobre = null;
    for (const x of piezas) {
      if (x.b.tipo === 'cae') { x.pisado = -1; x.fuera = false; x.malla.position.y = x.b.y - x.b.h / 2; x.malla.visible = true; }
      if (x.b.tipo === 'real' && x.fuera && x.b.z < control.z) { x.fuera = false; x.malla.visible = true; }
    }
    if (cuenta === 'caida') { e.sonido.mal(); e.hud.aviso(pista.caida, 'mal', 0.7); }
    aturdido = t + 0.25;
    if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* sin vibración */ }
  };
  const golpe = (t: number, dx: number, dz: number, fuerza: number) => {
    v.set(dx * fuerza, 6.5, dz * fuerza);
    aturdido = t + 0.7;
    aire = 1;
    e.temblar(0.25);
    e.sonido.efecto('golpe') || e.sonido.mal();
  };

  // Controles de prueba (solo en desarrollo): ?inmortal=1 nada te golpea; ?oraculo=1 la puerta buena se ve
  const inmortal = DEV && prueba?.has('inmortal');
  if (DEV && prueba?.has('oraculo')) for (const x of piezas) if (x.b.tipo === 'real') x.malla.material = mat('#44ff88', 0.6);

  const paso = (t: number, dt: number) => {
    // Plataformas que se mueven: avanzan, y si estás parado encima te llevan con ellas
    for (const x of moviles) {
      const m = x.b.mueve!, antes = { x: x.b.x, y: x.b.y, z: x.b.z }, desvio = m.amp * Math.sin(m.vel * t + m.fase);
      x.b.x = x.base.x + (m.eje === 'x' ? desvio : 0); x.b.y = x.base.y + (m.eje === 'y' ? desvio : 0); x.b.z = x.base.z + (m.eje === 'z' ? desvio : 0);
      if (!x.fuera) x.malla.position.set(x.b.x, x.b.y - x.b.h / 2, x.b.z);
      if (sobre === x) { p.x += x.b.x - antes.x; p.y += x.b.y - antes.y; p.z += x.b.z - antes.z; }
    }
    // Puerta falsa: después del rebote se vuelve al control
    if (volverEn && t >= volverEn) { volverEn = 0; reaparecer(t, 'puerta'); }

    // Barrida: agacharse corriendo da un empujón corto, más rápido que caminar agachado
    const agachado = mando.agachado;
    if (agachado && !agachadoAntes && enSuelo && Math.hypot(v.x, v.z) > 5) { barridaHasta = t + BARRIDA; e.sonido.ruido(0.12, 0.08); }
    agachadoAntes = agachado;
    const barriendo = t < barridaHasta, bajo = agachado || barriendo;
    const rapidez = barriendo ? VEL * VEL_BARRIDA : agachado ? VEL * 0.55 : VEL;
    if (t >= aturdido) {
      if (barriendo) { const r = Math.hypot(v.x, v.z) || 1; v.x = (v.x / r) * rapidez; v.z = (v.z / r) * rapidez; }
      else {
        v.x += (mando.x * rapidez - v.x) * Math.min(1, 14 * dt);
        v.z += (mando.z * rapidez - v.z) * Math.min(1, 14 * dt);
      }
      // Salto con margen: si se pide un poco antes de tocar el suelo, sale apenas aterriza
      if (mando.tomarAccion()) pedidoSalto = t;
      if (t - pedidoSalto <= BUFFER && aire < COYOTE) { v.y = SALTO; aire = 1; saltando = true; pedidoSalto = -9; e.sonido.tono(420, 0.1, { tipo: 'triangle', vol: 0.15, hasta: 700 }); }
      // Salto variable: soltar el botón antes corta la subida
      if (saltando && !mando.pulsada && v.y > CORTE) v.y = CORTE;
    } else mando.tomarAccion();
    if (v.y <= 0) saltando = false;

    // De lado: los bloques a la altura del cuerpo empujan hacia afuera; las puertas se prueban corriendo de frente
    p.x += v.x * dt;
    p.z += v.z * dt;
    const alto = bajo ? 0.95 : ALTO;
    for (const x of piezas) {
      const b = x.b, dx = p.x - b.x, dz = p.z - b.z, mx = b.w / 2 + RADIO, mz = b.d / 2 + RADIO;
      if (!choca(x) || Math.abs(dx) >= mx || Math.abs(dz) >= mz || p.y >= b.y - ESCALON || p.y + alto <= b.y - b.h) continue;
      const deFrente = mz - Math.abs(dz) < mx - Math.abs(dx);
      if ((b.tipo === 'real' || b.tipo === 'falsa') && deFrente && dz > 0 && (v.z < -2.5 || mando.z < -0.5) && Math.abs(dx) < b.w / 2 && t >= aturdido) {
        if (b.tipo === 'real') { x.fuera = true; x.malla.visible = false; e.sonido.efecto('madera') || e.sonido.ruido(0.1, 0.2); e.flotante('¡Pasa!', b.x, b.y, b.z, 'bien'); continue; }
        // Falsa: rebota, aturde y devuelve al inicio de la sección
        x.malla.material = mat('#ff4d5e', 0.4);
        setTimeout(() => { x.malla.material = mat(b.color); }, 500);
        p.z = b.z + mz; golpe(t, 0, 1, 9); volverEn = t + 0.55;
        e.hud.aviso('¡Puerta falsa!', 'mal', 0.8);
        continue;
      }
      if (deFrente) { p.z = b.z + Math.sign(dz) * mz; v.z = 0; } else { p.x = b.x + Math.sign(dx) * mx; v.x = 0; }
    }

    // Hacia arriba y abajo: se aterriza en la cara superior del bloque que quede bajo los pies
    const antes = p.y;
    v.y += GRAVEDAD * dt;
    p.y += v.y * dt;
    enSuelo = false;
    sobre = null;
    for (const x of piezas) {
      const b = x.b;
      if (!choca(x) || v.y > 0 || Math.abs(p.x - b.x) > b.w / 2 + RADIO * 0.5 || Math.abs(p.z - b.z) > b.d / 2 + RADIO * 0.5 || antes < b.y - ESCALON || p.y > b.y) continue;
      p.y = b.y;
      v.y = 0;
      enSuelo = true;
      sobre = x;
      if (b.tipo === 'cae' && x.pisado < 0) x.pisado = t;
      if (b.tipo === 'vapor') { v.y = SALTO * 1.5; v.z -= 6; aire = 1; enSuelo = false; e.sonido.ruido(0.25, 0.15); e.chispas(p.x, p.y, p.z, ['#ffffff', '#dddddd'], 18, 5); }
      if (b.tipo === 'control' && (control.z !== b.z || control.x !== b.x)) { control.set(b.x, b.y + 0.1, b.z); e.hud.aviso('Punto de control', 'bien', 0.6); e.sonido.efecto('campana', 0.4); }
      if (b.tipo === 'meta') { cruzarHitos(t, true); return terminar(t, true); }
    }
    aire = enSuelo ? 0 : aire + dt;

    // Tablones que ceden
    for (const x of piezas) {
      if (x.b.tipo !== 'cae' || x.pisado < 0) continue;
      const desde = t - x.pisado - DEMORA_CAIDA;
      if (desde < 0) x.malla.position.x = x.b.x + Math.sin(t * 60) * 0.04;
      else { x.fuera = true; x.malla.position.y = x.b.y - x.b.h / 2 - 16 * desde * desde; x.malla.visible = desde < 1.2; if (sobre === x) sobre = null; }
    }
    // Barras que barren (la franja baja se salta; la alta se pasa agachado o barriendo)
    for (const { b, malla } of barras) {
      const a = b.fase + b.vel * t, ux = Math.cos(a), uz = Math.sin(a);
      malla.rotation.y = -a;
      const [desde, hasta] = b.alta ? [1.05, 1.55] : [0.15, 0.75], cabeza = p.y + alto;
      if (inmortal || p.y > b.y + hasta || cabeza < b.y + desde || t < aturdido) continue;
      const s = limitar((p.x - b.x) * ux + (p.z - b.z) * uz, -b.largo / 2, b.largo / 2), lx = p.x - (b.x + ux * s), lz = p.z - (b.z + uz * s);
      if (Math.hypot(lx, lz) > RADIO + 0.3) continue;
      const lado = Math.sign(b.vel) * Math.sign(s || 1);
      golpe(t, -uz * lado, ux * lado, 5 + Math.abs(b.vel * s) * 1.2);
    }
    // Rocas: ruedan hacia ti y vuelven a salir arriba
    for (const { r, malla } of rocas) {
      const largo = r.z1 - r.z0, z = r.z0 + (((r.vel * t + r.fase) % largo) + largo) % largo;
      malla.position.set(r.x, r.y + r.radio, z);
      malla.rotation.x = z / r.radio;
      if (inmortal || t < aturdido || Math.hypot(p.x - r.x, p.z - z) > r.radio + RADIO || p.y > r.y + r.radio * 1.6) continue;
      golpe(t, Math.sign(p.x - r.x || 1) * 0.6, 1, 7);
    }
    // Martillos: péndulos que barren de lado
    for (const { m, grupo } of martillos) {
      const ang = m.amp * Math.sin(m.vel * t + m.fase);
      grupo.rotation.z = ang;
      const hx = m.x + Math.sin(ang) * m.largo, hy = m.y - Math.cos(ang) * m.largo;
      if (inmortal || t < aturdido || Math.abs(p.z - m.z) > 0.8 || Math.abs(p.x - hx) > 1.0 || p.y > hy + 0.45 || p.y + alto < hy - 0.45) continue;
      golpe(t, Math.sign(Math.cos(m.vel * t + m.fase) * m.amp) || 1, 0, 9);
    }
    // Gemas
    for (const g of gemas) {
      if (g.tomada || Math.hypot(p.x - g.g.x, p.z - g.g.z) > 0.8 || Math.abs(p.y + 0.9 - (g.g.y + 0.9)) > 1.2) continue;
      g.tomada = true; g.malla.visible = false; sumado += g.g.valor;
      e.flotante(`+${g.g.valor}`, g.g.x, g.g.y + 1, g.g.z, 'oro'); e.sonido.tono(1200, 0.08, { tipo: 'triangle', vol: 0.18, hasta: 1800 });
    }

    cruzarHitos(t, false);
    // Caer de la pista devuelve al control (antes de que la lava cuente); la lava termina la partida si alcanza al control o a ti en la pista
    const hLava = lava ? alturaLava(t) : -Infinity;
    if (p.y < hLava + 0.05 && hLava >= control.y - 0.2) return terminar(t, false, 'Te alcanzó la lava');
    if (p.y < Math.max(hLava, Math.min(control.y - 3, fondoY + 5))) reaparecer(t, 'caida');
    mejor = Math.max(mejor, limitar(pista.progreso(p.x, p.y, p.z), 0, 1));
    if (!libre && t >= pista.limite) terminar(t, false);
  };
  /** Los hitos se cuentan al pasar su `z` (o todos los que falten al llegar a la meta). */
  function cruzarHitos(t: number, meta: boolean) {
    while (hitoSig < pista.hitos.length && (meta || p.z <= pista.hitos[hitoSig].z)) {
      const h = pista.hitos[hitoSig], limpio = limpioDesde <= hitoSig;
      sumado += h.puntos + (limpio ? pista.bono.limpio : 0);
      parciales.push(t - parciales.reduce((s, x) => s + x, 0));
      hitoSig++;
      limpioDesde = Math.max(limpioDesde, hitoSig);
      if (!meta) { e.hud.aviso(`${h.nombre} · ${parciales[parciales.length - 1].toFixed(1)} s${limpio ? ' · ¡limpio!' : ''}`, limpio ? 'oro' : 'bien', 1); if (limpio) e.sonido.bien(); }
    }
  }

  // Modo libre: las teclas 1 a 9 llevan al comienzo de cada tramo para practicarlo
  const controles = pista.bloques.filter((b) => b.tipo === 'control').sort((a, b) => b.z - a.z);
  if (libre) e.escuchar(window, 'keydown', (ev) => {
    const n = Number(ev.key);
    if (!Number.isInteger(n) || n < 1 || n > controles.length) return;
    const b = controles[n - 1];
    control.set(b.x, b.y + 0.1, b.z); p.copy(control); v.set(0, 0, 0);
    e.hud.aviso(`Tramo ${n}`, 'bien', 0.8);
  });

  // Cámara: detrás del personaje o desde arriba (botón o tecla V); se recuerda la elección
  let desdeArriba = false;
  try { desdeArriba = localStorage.getItem(CAMARA) === 'arriba'; } catch { /* sin almacenamiento */ }
  const botonCamara = document.createElement('button');
  botonCamara.className = 'boton camara-boton';
  const pintarCamara = () => { botonCamara.textContent = desdeArriba ? 'Cámara: arriba' : 'Cámara: atrás'; };
  const cambiarCamara = () => { desdeArriba = !desdeArriba; pintarCamara(); try { localStorage.setItem(CAMARA, desdeArriba ? 'arriba' : 'atras'); } catch { /* sin almacenamiento */ } };
  pintarCamara();
  botonCamara.addEventListener('click', () => { cambiarCamara(); botonCamara.blur(); });
  c.caja.appendChild(botonCamara);
  e.escuchar(window, 'keydown', (ev) => { if (ev.key === 'v' || ev.key === 'V') cambiarCamara(); });

  // La primera vez en una pantalla táctil: cómo moverse
  let ayuda: HTMLElement | null = null;
  try {
    if (matchMedia('(pointer: coarse)').matches && !localStorage.getItem(AYUDA)) {
      ayuda = document.createElement('div'); ayuda.className = 'carrera-ayuda'; ayuda.textContent = 'Arrastra el dedo en cualquier parte para moverte';
      c.caja.appendChild(ayuda); localStorage.setItem(AYUDA, '1');
    }
  } catch { /* sin almacenamiento */ }

  // Música: un pulso que se acelera cuando la lava se acerca (o a medida que pasa el tiempo)
  let proxPulso = 0, compas = 0;
  const musica = (t: number, peligro: number) => {
    if (t < proxPulso) return;
    const ahora = e.sonido.ctx?.currentTime ?? 0, notas = pista.escenario === 'volcan' ? [98, 98, 131, 117] : [110, 131, 123, 98];
    e.sonido.tono(65, 0.12, { tipo: 'sine', vol: 0.08, hasta: 40 });
    if (compas % 4 === 0) e.sonido.tono(notas[(compas / 4) % 4], 0.24, { tipo: 'triangle', vol: 0.045, cuando: ahora + 0.01 });
    compas++;
    proxPulso = Math.max(proxPulso, t - 1) + 60 / (96 + peligro * 70);
  };

  e.hud.tiempo(libre ? mmss(0) : mmss(pista.limite));
  e.hud.puntos(0);
  const mira = new THREE.Vector3();
  e.alCuadro((t, dt) => {
    if (empezado && !terminado) { const medio = Math.min(dt, 0.05) / 2; paso(t, medio); if (!terminado) paso(t + medio, medio); ruta.anotar(t, p.x, p.y, p.z); lider?.mover(t); }
    // Personaje y cámara
    const andando = Math.hypot(v.x, v.z) > 0.6;
    if (andando) rumbo = Math.atan2(v.x, v.z);
    k.grupo.position.copy(p);
    k.grupo.rotation.y = rumbo;
    k.grupo.scale.y = k.grupo.scale.x * ((mando.agachado || t < barridaHasta) && !terminado ? 0.6 : 1);
    for (const g of gemas) if (!g.tomada) { g.malla.rotation.y = t * 2; g.malla.position.y = g.g.y + 0.9 + Math.sin(t * 3 + g.g.z) * 0.12; }
    // La sombra cae en el bloque que está justo debajo: así se ve dónde vas a aterrizar
    let piso = -Infinity;
    for (const x of piezas) if (choca(x) && Math.abs(p.x - x.b.x) <= x.b.w / 2 && Math.abs(p.z - x.b.z) <= x.b.d / 2 && x.b.y <= p.y + 0.05) piso = Math.max(piso, x.b.y);
    sombraPies.visible = piso > -Infinity;
    sombraPies.position.set(p.x, piso + 0.03, p.z);
    sombraPies.scale.setScalar(Math.max(0.45, 1 - (p.y - piso) * 0.12));
    if (!terminado) k.animar(!enSuelo ? 'jump' : andando ? 'sprint' : 'idle');
    if (lava) { const h = alturaLava(empezado ? t : 0); lava.position.y = h; lavaMat.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.2; }
    // Con la pantalla parada (celular vertical) la cámara se aleja, para que entre todo el ancho de la pista
    const parada = e.lienzo.clientHeight > e.lienzo.clientWidth ? 1.55 : 1;
    if (desdeArriba) mira.set(p.x * 0.5, p.y + 15 * parada, p.z + 3.2 * parada); else mira.set(p.x * 0.35 * (2 - parada), p.y + 9.4 * parada, p.z + 9 * parada);
    e.camara.position.lerp(mira, empezado ? Math.min(1, 6 * dt) : 1);
    if (desdeArriba) e.camara.lookAt(p.x * 0.5, p.y, p.z - 2.5); else e.camara.lookAt(p.x * 0.35, p.y + 0.2, p.z - 5.6);
    if (!empezado || terminado) return;
    if (ayuda && t > 4) { ayuda.remove(); ayuda = null; }
    const aLava = lava ? p.y - alturaLava(t) : null;
    musica(t, aLava !== null ? limitar(1 - aLava / 8, 0, 1) : limitar(t / pista.limite, 0, 1));
    e.hud.tiempo(libre ? mmss(t) : mmss(pista.limite - t));
    e.hud.extra(`${nombreHito(Math.min(hitoSig, pista.hitos.length - 1))}${caidas ? ` · ${caidas} ${caidas === 1 ? 'caída' : 'caídas'}` : ''}${fallos ? ` · ${fallos} ${fallos === 1 ? 'falsa' : 'falsas'}` : ''}${aLava !== null ? ` · lava a ${Math.max(0, aLava).toFixed(1)} m` : ''}`);
    e.hud.puntos(Math.round(sumado));
  });

  if (DEV) (window as unknown as Record<string, unknown>).__carrera = () => ({ x: p.x, y: p.y, z: p.z, sumado, hitos: hitoSig, caidas, fallos, terminado, lava: lava ? alturaLava(e.reloj()) : null });
  // Solo en pruebas: las gemas y un salto directo a un punto (para revisar que cada gema se pueda tomar sin caer)
  if (DEV) Object.assign(window as unknown as Record<string, unknown>, { __gemas: () => gemas.map((g) => ({ ...g.g, tomada: g.tomada })), __ir: (x: number, y: number, z: number) => { p.set(x, y, z); v.set(0, 0, 0); } });
  // Solo en pruebas: dónde están las puertas buenas que siguen cerradas (para el bot que juega perfecto)
  // Solo en pruebas: los bloques donde se puede pisar (para el bot que recorre Lava Loca)
  if (DEV) (window as unknown as Record<string, unknown>).__pisos = () => piezas.filter((x) => choca(x) && x.b.tipo !== 'falsa' && x.b.tipo !== 'real').map((x) => ({ x: x.b.x, y: x.b.y, z: x.b.z, w: x.b.w, d: x.b.d, tipo: x.b.tipo ?? '' }));
  if (DEV) (window as unknown as Record<string, unknown>).__puertasBuenas = () => piezas.filter((x) => x.b.tipo === 'real' && !x.fuera).map((x) => ({ x: x.b.x, z: x.b.z, w: x.b.w }));
  return { empezar() { e.empezar(); empezado = true; }, destruir: e.destruir };
}

/** Adornos del escenario (no chocan): volcán con rocas y brasas, o castillo con muros y antorchas. */
function decorar(escena: THREE.Scene, pista: Pista, mat: (color: string, brillo?: number) => THREE.MeshStandardMaterial) {
  const zs = pista.bloques.map((b) => b.z), zMin = Math.min(...zs), zMax = Math.max(...zs), ys = pista.bloques.map((b) => b.y), yMed = (Math.min(...ys) + Math.max(...ys)) / 2;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  let semilla = 7;
  const r = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  if (pista.escenario === 'volcan') {
    const cono = new THREE.Mesh(new THREE.ConeGeometry(38, 46, 9), mat('#3b2622'));
    cono.position.set(0, yMed + 2, zMin - 60); escena.add(cono);
    const crater = new THREE.Mesh(new THREE.ConeGeometry(9, 6, 9), mat('#ff5a1e', 0.9));
    crater.position.set(0, yMed + 23, zMin - 60); crater.rotation.x = Math.PI; escena.add(crater);
    const roca = new THREE.DodecahedronGeometry(1, 0);
    for (let z = zMax + 4; z > zMin - 10; z -= 4.5) for (const lado of [-1, 1]) {
      const m = new THREE.Mesh(roca, mat(r() < 0.5 ? '#4a3530' : '#5d4038'));
      const s = 0.8 + r() * 2.2;
      m.scale.set(s, s * (0.7 + r()), s); m.position.set(lado * (7 + r() * 9), yMed - 6 + r() * 5, z + r() * 3); m.rotation.set(r() * 3, r() * 3, 0);
      escena.add(m);
    }
  } else {
    for (let z = zMax + 4; z > zMin - 8; z -= 6) for (const lado of [-1, 1]) {
      const muro = new THREE.Mesh(geo, mat(r() < 0.5 ? '#2b2442' : '#332a4f'));
      muro.scale.set(1.2, 9, 6.05); muro.position.set(lado * 6.4, 3.5, z); escena.add(muro);
      const antorcha = new THREE.Mesh(geo, mat('#ffb347', 1.2));
      antorcha.scale.set(0.25, 0.45, 0.25); antorcha.position.set(lado * 5.7, 3.6, z - 3); escena.add(antorcha);
    }
  }
}
