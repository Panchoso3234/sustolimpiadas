import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar } from '../reflejos/motor';
import { arrastre, caja, guia, mat, pasos, rapier, seguir, type Cuerpo } from './fisica';

// Bolos de Coco: cinco turnos de dos tiros sobre una pista de arena inclinada hacia un lado.
// La inclinación de cada turno sale de la semilla. Desde el tercer turno hay una roca en la pista, y al coco se le puede
// dar efecto (curva a un lado) para esquivarla o para pelear contra la pendiente.
// Diez puntos por bolo, +50 por chuza y +20 por semichuza.
const TURNOS = 5, FONDO = -19, EMPUJE_EFECTO = 0.09, LINEA = 3.2, ANCHO = 2.6, VEL_MIN = 11, VEL_MAX = 24, ASIENTO = 5.2;

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 9.5, alto: 18.5, centro: [0, 0.4, -5.4], inclinacion: 0.6 });
  const R = await rapier(), r = generador(c.semilla);
  const pendientes = Array.from({ length: TURNOS }, (_, i) => Math.round((r() * 2 - 1) * (1.2 + i * 0.5) * (1 + (c.nivel - 1) * 0.12) * 10) / 10);
  const rocas = Array.from({ length: TURNOS }, (_, i) => (i >= 2 ? (r() * 2 - 1) * 1.7 : null));
  const mundo = new R.World({ x: 0, y: -22, z: 0 }), cuerpos: Cuerpo[] = [];
  mundo.createCollider(R.ColliderDesc.cuboid(40, 1, 40).setTranslation(0, -1, 0).setFriction(0.5));

  const [k] = await Promise.all([e.personaje(c.aspecto, 2.4), e.modelo('tree_palmTall', -7.5, -17, 10, 0.5), e.modelo('tree_palmBend', 7.8, -19, 10, 3.4), e.modelo('rocks-sand-a', -8, -11, 0.9, 0.6, 'pirata'), e.modelo('rocks-sand-b', 6, -4, 0.7, 2, 'pirata')]);

  k.grupo.position.set(-4.3, 0, 2.2);
  k.grupo.rotation.y = Math.PI * 0.85;

  // Pista y flecha de la inclinación
  const pista = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO * 2 + 1.2, 28), new THREE.MeshStandardMaterial({ color: '#e3c88c', roughness: 1 }));
  pista.rotation.x = -Math.PI / 2;
  pista.position.set(0, 0.03, -9);
  const raya = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO * 2 + 1.2, 0.14), new THREE.MeshBasicMaterial({ color: '#b88a4a' }));
  raya.rotation.x = -Math.PI / 2;
  raya.position.set(0, 0.05, LINEA - 0.9);
  const flecha = new THREE.Group(), cuerpoFlecha = caja(1.6, 0.12, 0.3, '#ef5565'), punta = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 4), mat('#ef5565'));
  punta.rotation.z = -Math.PI / 2;
  punta.position.x = 1.1;
  flecha.add(cuerpoFlecha, punta);
  flecha.position.set(0, 0.35, -6);
  e.escena.add(pista, raya, flecha);

  // Roca en la pista (desde el tercer turno): se mueve de lugar en cada turno
  const roca = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), mat('#8d8a99'));
  roca.scale.set(1, 0.75, 1);
  e.escena.add(roca);
  const cuerpoRoca = mundo.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -5, -9));
  mundo.createCollider(R.ColliderDesc.ball(0.7).setFriction(0.4).setRestitution(0.4), cuerpoRoca);

  // Efecto: el coco se va curvando hacia un lado mientras rueda
  let efecto = 0;
  const panel = document.createElement('div');
  panel.className = 'bolos-efecto';
  const opciones: [number, string][] = [[-1, '↶ Curva izq.'], [0, 'Recto'], [1, 'Curva der. ↷']];
  const botonesEfecto = opciones.map(([valor, texto]) => {
    const b = document.createElement('button');
    b.className = 'boton';
    b.textContent = texto;
    b.addEventListener('click', () => ponerEfecto(valor));
    panel.appendChild(b);
    return b;
  });
  const ponerEfecto = (valor: number) => { efecto = valor; botonesEfecto.forEach((b, i) => { b.setAttribute('aria-pressed', String(opciones[i][0] === valor)); b.classList.toggle('principal', opciones[i][0] === valor); }); };
  ponerEfecto(0);
  c.caja.appendChild(panel);
  e.escuchar(window, 'keydown', (ev) => { if (lanzada >= 0) return; if (ev.key === 'a' || ev.key === 'A') ponerEfecto(Math.max(-1, efecto - 1)); if (ev.key === 'd' || ev.key === 'D') ponerEfecto(Math.min(1, efecto + 1)); });

  // Diez bolos en triángulo
  const moldeBolo = new THREE.Group(), tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 8), mat('#f3ecdc')), franja = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.26, 0.2, 8), mat('#ef5565'));
  franja.position.y = 0.3;
  moldeBolo.add(tronco, franja);
  const bolos: { c: Cuerpo; x: number; z: number; caido: boolean }[] = [];
  for (let fila = 0; fila < 4; fila++) for (let i = 0; i <= fila; i++) {
    const x = (i - fila / 2) * 1.05, z = FONDO - fila * 0.92;
    const cuerpo = mundo.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, 0.7, z).setLinearDamping(0.2).setAngularDamping(0.4));
    mundo.createCollider(R.ColliderDesc.cylinder(0.7, 0.27).setDensity(0.55).setFriction(0.5).setRestitution(0.25), cuerpo);
    const malla = moldeBolo.clone();
    e.escena.add(malla);
    const par = { cuerpo, malla };
    cuerpos.push(par);
    bolos.push({ c: par, x, z, caido: false });
  }

  const bola = mundo.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 0.55, LINEA).setCcdEnabled(true).setLinearDamping(0.12).setAngularDamping(0.3));
  mundo.createCollider(R.ColliderDesc.ball(0.55).setDensity(2.6).setFriction(0.5).setRestitution(0.2), bola);
  const coco = await e.pieza('comida', 'coconut', 1.1);
  e.escena.add(coco);
  cuerpos.push({ cuerpo: bola, malla: coco });

  const puntosGuia = guia(e.escena, 7);
  let turno = 0, tirada = 0, puntos = 0, chuzas = 0, semis = 0, botados = 0, enTurno = 0, terminado = false, empezado = false, lanzada = -1, salida = 0;

  const parar = (cuerpo: (typeof bolos)[number]['c']['cuerpo'], x: number, y: number, z: number) => {
    cuerpo.setTranslation({ x, y, z }, true);
    cuerpo.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    cuerpo.setLinvel({ x: 0, y: 0, z: 0 }, true);
    cuerpo.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };
  const reponerBola = () => { parar(bola, salida, 0.55, LINEA); lanzada = -1; };
  const armar = () => {
    for (const b of bolos) { b.caido = false; b.c.malla.visible = true; b.c.cuerpo.setEnabled(true); parar(b.c.cuerpo, b.x, 0.7, b.z); }
    enTurno = 0;
  };
  const anunciar = () => {
    const p = pendientes[turno];
    mundo.gravity = { x: p, y: -22, z: 0 };
    flecha.rotation.y = p >= 0 ? 0 : Math.PI;
    flecha.scale.setScalar(0.5 + Math.abs(p) / 3);
    flecha.visible = Math.abs(p) > 0.05;
    const x = rocas[turno];
    roca.visible = x !== null;
    roca.position.set(x ?? 0, 0.45, -9);
    cuerpoRoca.setTranslation({ x: x ?? 0, y: x === null ? -5 : 0.5, z: -9 }, true);
    e.hud.tiempo(`Turno ${turno + 1} de ${TURNOS} · tiro ${tirada + 1}`);
    e.hud.extra(`${Math.abs(p) < 0.05 ? 'Pista pareja' : `Inclinada ${p > 0 ? '→' : '←'} ${Math.abs(p).toFixed(1)}`}${x !== null ? ' · roca en la pista' : ''}`);
  };

  const velocidad = (dx: number, dy: number, fuerza: number) => {
    const rapidez = VEL_MIN + (VEL_MAX - VEL_MIN) * fuerza, largo = Math.hypot(dx, dy) || 1;
    return { x: limitar(-dx / largo, -0.5, 0.5) * rapidez, z: -Math.max(0.5, dy / largo) * rapidez }; // tirar hacia abajo = lanzar hacia el fondo
  };
  const tiro = arrastre(e, () => empezado && !terminado && lanzada < 0, (t) => {
    if (t.dy <= 0.02) return;
    const v = velocidad(t.dx, t.dy, t.fuerza);
    bola.setLinvel({ x: v.x, y: 0, z: v.z }, true);
    bola.setAngvel({ x: v.z / 0.55, y: 0, z: -v.x / 0.55 }, true);
    lanzada = e.reloj();
    e.gesto(k, 'attack-melee-right', 0.6);
    if (!e.sonido.efecto('soltar')) e.sonido.ruido(0.2, 0.15);
  });
  // Dónde se apoya el dedo decide desde qué lado de la línea sale el coco
  e.escuchar(e.lienzo, 'pointerdown', (ev) => {
    if (!empezado || terminado || lanzada >= 0) return;
    const p = e.enSuelo(ev);
    if (p) { salida = limitar(p.x, -ANCHO + 0.4, ANCHO - 0.4); reponerBola(); }
  });

  const terminar = () => {
    terminado = true;
    e.detener();
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Bolos botados', `${botados} de ${TURNOS * 10}`], ['Chuzas', String(chuzas)], ['Semichuzas', String(semis)]],
      detalle: { botados, chuzas, semis },
    });
  };

  // Cuando todo se aquieta se cuentan los bolos caídos y se pasa al tiro o turno siguiente
  const contar = () => {
    let nuevos = 0;
    for (const b of bolos) {
      if (b.caido) continue;
      const q = b.c.cuerpo.rotation(), p = b.c.cuerpo.translation(), derecho = 1 - 2 * (q.x * q.x + q.z * q.z);
      if (derecho < 0.8 || p.y < 0.4 || Math.hypot(p.x - b.x, p.z - b.z) > 0.9) { b.caido = true; nuevos++; b.c.malla.visible = false; b.c.cuerpo.setEnabled(false); }
      else parar(b.c.cuerpo, b.x, 0.7, b.z); // el que quedó en pie vuelve a su sitio, bien parado
    }
    if (nuevos) e.sonido.efecto('tabla');
    enTurno += nuevos;
    botados += nuevos;
    let gana = nuevos * 10, texto = nuevos ? `${nuevos} ${nuevos === 1 ? 'bolo' : 'bolos'}` : 'Ninguno';
    if (enTurno === 10 && tirada === 0) { gana += 50; chuzas++; texto = '¡Chuza! +50'; e.sonido.bien(); }
    else if (enTurno === 10) { gana += 20; semis++; texto = '¡Semichuza! +20'; e.sonido.bien(); }
    else if (!nuevos) e.sonido.mal();
    puntos += gana;
    e.hud.aviso(texto, nuevos ? 'oro' : 'mal', 1.1);
    e.hud.puntos(puntos);
    if (enTurno === 10 || tirada === 1) { turno++; tirada = 0; if (turno >= TURNOS) return terminar(); armar(); } else tirada = 1;
    salida = 0;
    reponerBola();
    anunciar();
  };

  // Mientras rueda hacia los bolos, el efecto lo empuja de a poco hacia un lado
  const avanzar = pasos(mundo, () => { if (lanzada >= 0 && efecto && bola.translation().z > FONDO + 1) bola.applyImpulse({ x: efecto * EMPUJE_EFECTO, y: 0, z: 0 }, true); });
  armar();
  anunciar();
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    seguir(cuerpos);
    const v = tiro.tirando && tiro.dy > 0.02 ? velocidad(tiro.dx, tiro.dy, tiro.fuerza) : null;
    puntosGuia.forEach((p, i) => { p.visible = !!v && tiro.fuerza > 0.12 && lanzada < 0; if (v) { const s = (i + 1) * 0.07; p.position.set(salida + v.x * s, 0.3, LINEA + v.z * s); } });
    if (terminado || t <= 0) return;
    if (lanzada < 0) return; // antes del tiro no corre la física: nada se desliza solo por la pendiente
    avanzar(dt);
    const p = bola.translation();
    if (t - lanzada > ASIENTO || (p.z < FONDO - 6 && t - lanzada > 3.6) || Math.abs(p.x) > 12) contar();
  });

  return {
    empezar() { e.empezar(); empezado = true; },
    destruir() { e.destruir(); mundo.free(); },
  };
}
