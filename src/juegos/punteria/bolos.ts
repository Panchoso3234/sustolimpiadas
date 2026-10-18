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

  const [k] = await Promise.all([e.personaje(c.aspecto, 2.4), e.modelo('tree_palmTall', -8, -17, 7, 0.5), e.modelo('tree_palmBend', 8.2, -19, 7, 3.4), e.modelo('rocks-sand-a', -8, -11, 0.9, 0.6, 'pirata'), e.modelo('rocks-sand-b', 6, -4, 0.7, 2, 'pirata')]);

  k.grupo.position.set(-4.3, 0, 2.2);
  k.grupo.rotation.y = Math.PI * 0.85;

  // Pista y flecha de la inclinación
  // Pista de tablas de madera, con las flechitas y puntos para apuntar
  const lienzo = document.createElement('canvas'); lienzo.width = 256; lienzo.height = 1024;
  const g = lienzo.getContext('2d')!;
  for (let i = 0; i < 16; i++) { g.fillStyle = ['#e2b878', '#d9ad6c', '#e8c189', '#dcb072'][i % 4]; g.fillRect(i * 16, 0, 16, 1024); g.fillStyle = 'rgba(110,70,30,0.35)'; g.fillRect(i * 16 + 15, 0, 1, 1024); g.fillRect(i * 16, (i * 173) % 1024, 16, 1); }
  g.fillStyle = '#c0483a';
  for (let i = -3; i <= 3; i++) { const x = 128 + i * 26, y = 640 - Math.abs(i) * 30; g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x - 8, y); g.lineTo(x + 8, y); g.fill(); }
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(128 + i * 36, 860, 4, 0, Math.PI * 2); g.fill(); }
  const texPista = new THREE.CanvasTexture(lienzo); texPista.colorSpace = THREE.SRGBColorSpace; texPista.anisotropy = 8;
  const pista = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO * 2 + 1.2, 28), new THREE.MeshStandardMaterial({ map: texPista, roughness: 0.55 }));
  // Canaletas de bambú a los lados (con sus nudos)
  for (const lado of [-1, 1]) {
    const x = lado * (ANCHO + 0.85), cana = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 28, 10), mat('#c9b25a'));
    cana.rotation.x = Math.PI / 2; cana.position.set(x, 0.2, -9); e.escena.add(cana);
    for (let z = 4; z > -23; z -= 2.2) { const nudo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 12), mat('#9a8338')); nudo.position.set(x, 0.2, z); e.escena.add(nudo); }
  }
  // Arco tiki detrás de los bolos, con su letrero y guirnalda de luces
  const arco = new THREE.Group();
  for (const lado of [-1, 1]) { const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.6, 8), mat('#8a5a38')); poste.position.set(lado * 3.8, 2.3, 0); arco.add(poste); const cara = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.5), mat(lado < 0 ? '#c0483a' : '#3f8cff')); cara.position.set(lado * 3.8, 4.7, 0); arco.add(cara); for (const ox of [-0.14, 0.14]) { const ojo = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: '#ffffff' })); ojo.position.set(lado * 3.8 + ox, 4.85, 0.27); arco.add(ojo); } }
  const viga = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.35, 0.4), mat('#6b4423')); viga.position.y = 4.1; arco.add(viga);
  const cartel = document.createElement('canvas'); cartel.width = 512; cartel.height = 96;
  const gc = cartel.getContext('2d')!; gc.fillStyle = '#2b1d10'; gc.fillRect(0, 0, 512, 96); gc.font = 'bold 60px sans-serif'; gc.textAlign = 'center'; gc.textBaseline = 'middle';
  [...'BOLOS DE COCO'].forEach((l, i) => { gc.fillStyle = ['#ffd23c', '#ff7a3c', '#3fe07a', '#5ad1ff'][i % 4]; gc.fillText(l, 40 + i * 36, 50); });
  const texCartel = new THREE.CanvasTexture(cartel); texCartel.colorSpace = THREE.SRGBColorSpace;
  const letrero = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.2), new THREE.MeshBasicMaterial({ map: texCartel })); letrero.position.set(0, 3.35, 0.22); arco.add(letrero);
  const focos: THREE.Mesh[] = [];
  for (let i = 0; i < 15; i++) { const x = -3.6 + i * 0.514, foco = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); foco.position.set(x, 4.35 - Math.sin((i / 14) * Math.PI) * 0.0 + 0.0, 0.25); arco.add(foco); focos.push(foco); }
  arco.position.set(0, -0.9, FONDO - 3.6); arco.scale.setScalar(0.82); // más bajo, para que el letrero quepa en la pantalla
  e.escena.add(arco);
  // Antorchas tiki con fuego que titila
  const llamas: THREE.Mesh[] = [];
  for (const [x, z] of [[-4.9, 0.5], [4.9, 0.5], [-4.9, -11], [4.9, -11], [-4.9, -21], [4.9, -21]]) {
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), mat('#8a5a38')); palo.position.set(x, 1.3, z);
    const copa = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.14, 0.4, 8), mat('#c9b25a')); copa.position.set(x, 2.75, z);
    const llama = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 7), new THREE.MeshBasicMaterial({ color: '#ffb02e' })); llama.position.set(x, 3.2, z);
    const centro = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), new THREE.MeshBasicMaterial({ color: '#fff2a0' })); centro.position.set(0, -0.08, 0); llama.add(centro);
    e.escena.add(palo, copa, llama); llamas.push(llama);
  }
  pista.rotation.x = -Math.PI / 2;
  pista.position.set(0, 0.03, -9);
  const raya = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO * 2 + 1.2, 0.14), new THREE.MeshBasicMaterial({ color: '#d9443a' }));
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
  const perfil = [[0, -0.7], [0.2, -0.7], [0.27, -0.48], [0.3, -0.22], [0.24, 0.05], [0.14, 0.27], [0.135, 0.42], [0.165, 0.56], [0.12, 0.67], [0, 0.71]].map(([x, y]) => new THREE.Vector2(x, y));
  const blanco = new THREE.MeshStandardMaterial({ color: '#fbf6ea', roughness: 0.35 });
  const moldeBolo = new THREE.Group(), tronco = new THREE.Mesh(new THREE.LatheGeometry(perfil, 14), blanco);
  moldeBolo.add(tronco);
  for (const y of [0.24, 0.34]) { const franja = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.17, 0.05, 14), mat('#ef5565')); franja.position.y = y; moldeBolo.add(franja); }
  const bolos: { c: Cuerpo; x: number; z: number; caido: boolean }[] = [];
  for (let fila = 0; fila < 4; fila++) for (let i = 0; i <= fila; i++) {
    const x = (i - fila / 2) * 1.05, z = FONDO - fila * 0.92;
    const cuerpo = mundo.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, 0.7, z).setLinearDamping(0.2).setAngularDamping(0.4).setSleeping(true)); // dormidos hasta que algo los toque: no tiemblan ni se caen solos
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
    if (enTurno === 10 && tirada === 0) { gana += 50; chuzas++; texto = '¡Chuza! +50'; e.sonido.bien(); e.chispas(0, 1.5, FONDO - 1.4, ['#ffd23c', '#ef5565', '#3fe07a', '#5ad1ff', '#ffffff'], 70, 8); e.temblar(0.5); }
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
    llamas.forEach((l, i) => { const f = 1 + Math.sin(t * 13 + i * 2.1) * 0.12 + Math.sin(t * 23 + i) * 0.06; l.scale.set(f, 1 + Math.sin(t * 17 + i) * 0.18, f); });
    focos.forEach((f, i) => (f.material as THREE.MeshBasicMaterial).color.setHSL((i * 0.13 + t * 0.2) % 1, 0.9, Math.sin(t * 4 + i) > 0 ? 0.65 : 0.45));
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
