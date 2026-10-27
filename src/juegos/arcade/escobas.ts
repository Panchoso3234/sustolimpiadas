import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { bosque, halo, nocheEmbrujada, pasto, type Planta } from '../decorado';
import { figuraFantasma, grabadora } from '../fantasma';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario, limitar, mmss } from '../reflejos/motor';

// Carrera de Escobas (versión 2, 27-10): una carrera de unos 90 s, de noche, contra tres brujas de máquina, en tres
// zonas: el bosque (árboles secos y murciélagos), el cementerio (lápidas altas y fantasmas que cruzan) y la tormenta
// (rayos que avisan antes de caer). Se vuela solo hacia adelante; tú subes, bajas y te corres a los lados.
// · Aros: 50, y el combo suma 10 por cada aro seguido sin fallar (hasta 100); los dorados valen 150 y dan turbo.
// · Cada tres aros cargas una calabaza de turbo (hasta 3). Volar justo detrás de una bruja te da rebufo.
// · Las brujas usan sus turbos y no te esperan: son más rápidas en las jornadas altas.
// El recorrido (curvas, aros, obstáculos y turbos de las brujas) sale de la semilla: el mismo para todos.

const LARGO = 2700, VEL = 27, TURBO = 42, LENTO = 13, LADO = 13, ALTO_MIN = 1.6, ALTO_MAX = 20, RADIO_ARO = 2.3, RADIO_DORADO = 1.6, TOPE = 200, REFERENCIA = 130, ANCHO = 13;
const PREMIO = [800, 500, 300, 150], ZONAS = ['El bosque', 'El cementerio', 'La tormenta'];
const PUNTOS = { aro: 50, combo: 10, comboMax: 50, dorado: 150, dulce: 10, segundo: 10 };
/** Zona del recorrido según la distancia (cada una, un tercio). */
const zonaDe = (z: number) => (z > -LARGO / 3 ? 0 : z > (-2 * LARGO) / 3 ? 1 : 2);
interface Aro { x: number; y: number; z: number; malla: THREE.Mesh; pasado: boolean; dorado: boolean }
interface Obstaculo { tipo: 'arbol' | 'bichos' | 'lapida' | 'fantasma' | 'rayo'; x: number; y: number; z: number; alto: number; malla: THREE.Object3D; golpeado: boolean; fase: number; aviso?: THREE.Object3D }
interface Bruja { g: THREE.Group; z: number; vel: number; fase: number; nombre: string; turbos: number[] }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 10, alto: 6, centro: [0, 0, 0], inclinacion: 0.2, sinPlaya: true });
  e.camara.fov = 62; e.camara.far = 420; e.camara.updateProjectionMatrix();
  const mando = crearMando(e, c.caja, 'Turbo');
  const r = generador(`${c.semilla}|escobas`);
  const f1 = r() * 6.28, f2 = r() * 6.28, f3 = r() * 6.28;
  /** El centro del recorrido a una distancia z (negativa hacia adelante). */
  const centro = (z: number) => ({ x: Math.sin(z * 0.011 + f1) * 16 + Math.sin(z * 0.029 + f2) * 5, y: 8 + Math.sin(z * 0.018 + f3) * 4 });

  // ── El valle: pasto oscuro, bosque a los lados del recorrido, lápidas y calabazas, y el castillo al final ──
  const noche = await nocheEmbrujada(e.escena, r, { ancho: 70, fondo: LARGO, centro: [0, -LARGO / 2], desde: 4, hasta: 40, niebla: [70, 260], luna: [-40, 70, -LARGO - 160] });
  const texPasto = pasto('#273f27', '#213722', 6); texPasto.repeat.set(20, 400);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(400, LARGO + 600), new THREE.MeshLambertMaterial({ map: texPasto }));
  suelo.rotation.x = -Math.PI / 2; suelo.position.z = -LARGO / 2; e.escena.add(suelo);
  const filas = (n: number, desde: number, hasta: number, alto: [number, number]): Planta[] => Array.from({ length: n }, () => {
    const z = 40 - r() * (LARGO + 140), lado = r() < 0.5 ? -1 : 1;
    return { x: centro(z).x + lado * (desde + r() * (hasta - desde)), z, alto: alto[0] + r() * (alto[1] - alto[0]), giro: r() * 6.28 };
  });
  await Promise.all([
    bosque(e.escena, 'naturaleza', 'tree_default_dark', filas(170, 16, 70, [7, 13])),
    bosque(e.escena, 'naturaleza', 'tree_detailed_fall', filas(130, 16, 70, [7, 12])),
    bosque(e.escena, 'naturaleza', 'tree_pineRoundC', filas(150, 20, 90, [9, 16])),
    bosque(e.escena, 'naturaleza', 'stone_tallB', filas(120, 6, 30, [1, 1.6])),
    bosque(e.escena, 'naturaleza', 'crop_pumpkin', filas(90, 5, 26, [0.8, 1.3])),
  ]);
  // El castillo de la meta: torres con techos en punta y ventanas encendidas
  const meta = centro(-LARGO), castillo = new THREE.Group();
  const ventana = new THREE.MeshBasicMaterial({ color: '#ffcf5a' });
  for (const [dx, alto, ancho] of [[-14, 26, 6], [-6, 34, 7], [4, 40, 8], [13, 28, 6], [20, 22, 5]] as const) {
    const torre = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, ancho), mat('#2b2638')); torre.position.set(dx, alto / 2, 0); castillo.add(torre);
    const techo = new THREE.Mesh(new THREE.ConeGeometry(ancho * 0.8, ancho * 1.6, 4), mat('#4a1f5c')); techo.position.set(dx, alto + ancho * 0.8, 0); techo.rotation.y = Math.PI / 4; castillo.add(techo);
    for (let y = 6; y < alto - 3; y += 6) { const v = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.6), ventana); v.position.set(dx + (r() - 0.5) * ancho * 0.5, y, ancho / 2 + 0.02); castillo.add(v); }
  }
  castillo.position.set(meta.x, 0, -LARGO - 45); e.escena.add(castillo);
  // Arco de llegada con banderines
  const arco = new THREE.Mesh(new THREE.TorusGeometry(7, 0.5, 8, 32, Math.PI), new THREE.MeshLambertMaterial({ color: '#ff9a2e', emissive: '#7a3a00' }));
  arco.position.set(meta.x, meta.y - 6, -LARGO); e.escena.add(arco);
  const brilloMeta = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(255,160,60,0.6)'), depthWrite: false, blending: THREE.AdditiveBlending }));
  brilloMeta.scale.setScalar(26); brilloMeta.position.set(meta.x, meta.y, -LARGO - 1); e.escena.add(brilloMeta);

  // ── Aros, dulces y obstáculos ──
  const geoAro = new THREE.TorusGeometry(RADIO_ARO, 0.18, 8, 28), geoDorado = new THREE.TorusGeometry(RADIO_DORADO, 0.2, 8, 28), matAro = new THREE.MeshBasicMaterial({ color: '#ffb02e' }), matDorado = new THREE.MeshBasicMaterial({ color: '#fff06a' }), matAroListo = new THREE.MeshBasicMaterial({ color: '#5a4a6a', transparent: true, opacity: 0.4 });
  const aros: Aro[] = [];
  for (let z = -60, n = 0; z > -LARGO + 30; z -= 38 + r() * 18, n++) {
    const dorado = n % 6 === 5, p = centro(z), x = p.x + (r() - 0.5) * (dorado ? 12 : 9), y = limitar(p.y + (r() - 0.5) * (dorado ? 9 : 6), ALTO_MIN + 1, ALTO_MAX - 2);
    const m = new THREE.Mesh(dorado ? geoDorado : geoAro, dorado ? matDorado : matAro); m.position.set(x, y, z); e.escena.add(m);
    const luz = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(dorado ? 'rgba(255,240,120,0.55)' : 'rgba(255,170,60,0.35)'), depthWrite: false, blending: THREE.AdditiveBlending })); luz.scale.setScalar(dorado ? 9 : 7); m.add(luz);
    aros.push({ x, y, z, malla: m, pasado: false, dorado });
  }
  // Dulces: caramelos en fila entre aro y aro
  const DULCES = 200, dulces = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial(), DULCES), posDulce: { x: number; y: number; z: number; tomado: boolean }[] = [];
  const tonos = ['#ef5565', '#3fc79a', '#b17cff', '#ffd23c'], tono = new THREE.Color(), o = new THREE.Object3D();
  for (let i = 0; posDulce.length < DULCES; i++) {
    const a = aros[i % aros.length], b = aros[(i % aros.length) + 1];
    if (!b) break;
    for (let q = 1; q <= 4 && posDulce.length < DULCES; q++) { const k = q / 5; posDulce.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, tomado: false }); dulces.setColorAt(posDulce.length - 1, tono.set(tonos[q % 4])); }
  }
  dulces.count = posDulce.length; dulces.frustumCulled = false; e.escena.add(dulces);
  const obstaculos: Obstaculo[] = [];
  const geoTronco = new THREE.CylinderGeometry(0.35, 0.8, 1, 7), matTronco = mat('#3b2a22'), geoRama = new THREE.CylinderGeometry(0.12, 0.25, 4, 5);
  const geoAla = new THREE.ConeGeometry(0.5, 1.4, 3), matBicho = new THREE.MeshBasicMaterial({ color: '#130d1c' }), ojitos = new THREE.MeshBasicMaterial({ color: '#ff3b2f' });
  const matLapida = mat('#7d7889'), matFantasma = new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0.7 }), matRayo = new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.85 }), matAviso = new THREE.MeshBasicMaterial({ color: '#ffe36a', transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  for (let z = -120; z > -LARGO + 60; z -= 45 + r() * 35) {
    const p = centro(z), lado = (r() - 0.5) * 2, zona = zonaDe(z), dado = r();
    if (zona === 1 && dado < 0.5) {
      // Lápida alta que sale del suelo
      const x = p.x + lado * 5, alto = p.y + 0.5 + r() * 5, g = new THREE.Group();
      const piedra = new THREE.Mesh(new THREE.BoxGeometry(2.2, alto, 0.8), matLapida); piedra.position.y = alto / 2; g.add(piedra);
      const cruz = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.4), matLapida), brazo = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.4), matLapida); cruz.position.y = alto + 0.8; brazo.position.y = alto + 1; g.add(cruz, brazo);
      g.position.set(x, 0, z); e.escena.add(g);
      obstaculos.push({ tipo: 'lapida', x, y: 0, z, alto: alto + 1.6, malla: g, golpeado: false, fase: 0 });
      continue;
    }
    if (zona === 1) {
      // Fantasma que cruza el camino de lado a lado
      const y = limitar(p.y + (r() - 0.5) * 6, ALTO_MIN + 1, ALTO_MAX - 2), g = new THREE.Group();
      const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), matFantasma), cola = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 12), matFantasma); cola.position.y = -1.1; cola.rotation.x = Math.PI;
      for (const d of [-0.35, 0.35]) { const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: '#1a1030' })); ojo.position.set(d, 0.2, 1.0); g.add(ojo); }
      g.add(cuerpo, cola); g.position.set(p.x, y, z); e.escena.add(g);
      obstaculos.push({ tipo: 'fantasma', x: p.x, y, z, alto: 0, malla: g, golpeado: false, fase: r() * 6.28 });
      continue;
    }
    if (zona === 2 && dado < 0.6) {
      // Rayo: un círculo amarillo avisa y después cae una columna de luz
      const x = p.x + lado * 3.5, g = new THREE.Group(), columna = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 10, 1, true), matRayo);
      columna.position.y = 30; columna.visible = false; g.add(columna);
      const aviso = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.15, 6, 24), matAviso); aviso.rotation.x = Math.PI / 2; aviso.position.y = p.y; g.add(aviso);
      g.position.set(x, 0, z); e.escena.add(g);
      obstaculos.push({ tipo: 'rayo', x, y: 0, z, alto: 0, malla: columna, golpeado: false, fase: r() * 3.2, aviso });
      continue;
    }
    if (dado < 0.55) {
      // Árbol seco gigante que sale del suelo justo en el camino, con ramas
      const x = p.x + lado * 5, alto = p.y + 1 + r() * 6, g = new THREE.Group();
      const tronco = new THREE.Mesh(geoTronco, matTronco); tronco.scale.y = alto; tronco.position.y = alto / 2; g.add(tronco);
      for (let n = 0; n < 4; n++) { const rama = new THREE.Mesh(geoRama, matTronco); rama.position.set(Math.cos(n * 1.6) * 1.2, alto * (0.55 + n * 0.1), Math.sin(n * 1.6) * 1.2); rama.rotation.set(Math.sin(n * 1.6) * 0.9, 0, -Math.cos(n * 1.6) * 0.9); g.add(rama); }
      g.position.set(x, 0, z); e.escena.add(g);
      obstaculos.push({ tipo: 'arbol', x, y: 0, z, alto, malla: g, golpeado: false, fase: 0 });
    } else {
      // Bandada de murciélagos que revolotea en el camino
      const x = p.x + lado * 4, y = limitar(p.y + (r() - 0.5) * 5, ALTO_MIN + 1, ALTO_MAX - 2), g = new THREE.Group();
      for (let n = 0; n < 5; n++) {
        const b = new THREE.Group(), ala1 = new THREE.Mesh(geoAla, matBicho), ala2 = new THREE.Mesh(geoAla, matBicho);
        ala1.rotation.z = Math.PI / 2; ala1.position.x = 0.6; ala2.rotation.z = -Math.PI / 2; ala2.position.x = -0.6;
        const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 3), ojitos); ojo.position.set(0, 0.1, 0.25);
        b.add(ala1, ala2, ojo); b.position.set(Math.cos(n * 1.3) * 1.2, Math.sin(n * 2.1) * 0.8, Math.sin(n * 1.3) * 1.2); b.userData.fase = n; g.add(b);
      }
      g.position.set(x, y, z); e.escena.add(g);
      obstaculos.push({ tipo: 'bichos', x, y, z, alto: 0, malla: g, golpeado: false, fase: 0 });
    }
  }

  // ── Escobas: la tuya (con tu personaje sentado) y las de las brujas rivales ──
  const escoba = (pelo: string) => {
    const g = new THREE.Group(), palo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), mat('#7a5232'));
    palo.rotation.x = Math.PI / 2; g.add(palo);
    const paja = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1, 8, 1, true), mat(pelo)); paja.rotation.x = -Math.PI / 2; paja.position.z = 1.5; g.add(paja);
    const atado = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 8), mat('#3b2a22')); atado.rotation.x = Math.PI / 2; atado.position.z = 1.0; g.add(atado);
    return g;
  };
  const k = await e.personaje(c.aspecto, 1.2);
  const yoG = new THREE.Group(), miEscoba = escoba('#e8c46a');
  e.escena.remove(k.grupo); k.grupo.position.set(0, -0.15, 0.15); k.grupo.rotation.y = Math.PI; yoG.add(miEscoba, k.grupo); e.escena.add(yoG);
  k.animar('sit');
  const estela = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(120,200,255,0.7)'), depthWrite: false, blending: THREE.AdditiveBlending })); estela.position.z = 1.8; yoG.add(estela);
  const NOMBRES = ['Brujilda', 'Morgana', 'Calabacina'], CAPAS = ['#5a2a7a', '#1f6b4a', '#a83a2a'];
  const brujas: Bruja[] = NOMBRES.map((nombre, i) => {
    const g = new THREE.Group(); g.add(escoba('#d9b45a'));
    const vestido = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1, 8), mat(CAPAS[i])); vestido.position.set(0, 0.35, 0.1); g.add(vestido);
    const cara = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), mat('#9fd18a')); cara.position.set(0, 1, 0.1); g.add(cara);
    const ala = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12), mat('#16121f')); ala.position.set(0, 1.18, 0.1); g.add(ala);
    const sombrero = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 10), mat('#16121f')); sombrero.position.set(0, 1.55, 0.15); sombrero.rotation.x = 0.25; g.add(sombrero);
    e.escena.add(g);
    // Cada bruja usa cuatro turbos de 2 s en momentos que salen de la semilla
    const turbos = [0, 1, 2, 3].map((k) => 10 + k * 18 + r() * 12);
    return { g, z: -4 - i * 3, vel: VEL + 4.5 + i * 1.2 + (c.nivel - 1) * 0.8, fase: i * 2.1, nombre, turbos };
  });

  /** Dónde va una bruja (sigue el recorrido con un vaivén). */
  const posBruja = (b: Bruja, t: number) => { const p = centro(b.z); return { x: p.x + Math.sin(t * 0.9 + b.fase) * 4, y: p.y + Math.cos(t * 0.7 + b.fase) * 1.5 }; };
  /** Un rayo cae 0,4 s de cada 3,2 (justo después de que su círculo avisa). */
  const cae = (ob: Obstaculo, t: number) => { const f = (t + ob.fase) % 3.2; return f >= 1.2 && f < 1.6; };

  // ── Estado ──
  const yo = { x: 0, y: centro(0).y, z: 0, vx: 0, vy: 0, lento: 0, turbo: 0, cargas: 1 };
  yo.x = centro(0).x;
  let empezado = false, terminado = false, arosPasados = 0, dorados = 0, combo = 0, mejorCombo = 0, ptsAros = 0, dulcesTomados = 0, choques = 0, zonaAhora = 0, rebufo = 0;
  const puesto = () => 1 + brujas.filter((b) => b.z < yo.z).length;
  const terminar = (t: number, llego: boolean) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    const p = llego ? puesto() : 4, bono = llego ? Math.max(0, Math.round((REFERENCIA - t) * PUNTOS.segundo)) : 0;
    c.alTerminar({
      puntaje: PREMIO[p - 1] + ptsAros + dulcesTomados * PUNTOS.dulce + bono,
      lineas: [['Puesto', llego ? `${p}º de 4 (+${PREMIO[p - 1]})` : 'No llegaste'], ['Tiempo', llego ? `${t.toFixed(1)} s (+${bono})` : '—'], ['Aros', `${arosPasados} de ${aros.length}, ${dorados} dorados (+${ptsAros})`], ['Mejor combo', String(mejorCombo)], ['Dulces', `${dulcesTomados} (+${dulcesTomados * PUNTOS.dulce})`], ['Choques', String(choques)]],
      detalle: { version: 2, puesto: p, seg: Math.round(t * 10) / 10, aros: arosPasados, dorados, combo: mejorCombo, dulces: dulcesTomados, choques, ruta: ruta.final() },
    });
  };
  const usarTurbo = (t: number) => {
    if (yo.cargas <= 0 || t < yo.turbo) return;
    yo.cargas--; yo.turbo = t + 2;
    e.sonido.tono(160, 0.6, { tipo: 'sawtooth', vol: 0.12, hasta: 640 });
    e.hud.aviso('¡Turbo de calabaza!', 'oro', 0.8);
  };
  // Solo en pruebas: "?piloto=1" vuela solo por los aros
  const automatico = import.meta.env.DEV && new URLSearchParams(location.search).has('piloto');

  // Fantasma del líder (si se juega contra él) y grabación del propio recorrido
  const ruta = grabadora(), lider = c.fantasma ? figuraFantasma(e.escena, c.fantasma, 1.4) : null;
  const mira = new THREE.Vector3();
  const camara = (dt: number, ya = false) => {
    const objetivo = new THREE.Vector3(yo.x, yo.y + 2.4, yo.z + 7.5);
    e.camara.position.lerp(objetivo, ya ? 1 : 1 - Math.exp(-7 * dt));
    mira.set(yo.x, yo.y + 0.4, yo.z - 10);
    e.camara.lookAt(mira);
  };
  camara(0, true);
  e.hud.tiempo('0:00'); e.hud.puntos(0);

  e.alCuadro((t, dt) => {
    noche.avanzar(t);
    const paso = Math.min(dt, 0.05);
    if (empezado && !terminado && t > 0) {
      ruta.anotar(t, yo.x, yo.y - 0.5, yo.z); lider?.mover(t);
      // Dirección: lados y arriba/abajo; adelante va solo
      let mx = mando.x, my = -mando.z;
      if (automatico) { const a = aros.find((x) => !x.pasado && x.z < yo.z); if (a) { mx = limitar((a.x - yo.x) / 3, -1, 1); my = limitar((a.y - yo.y) / 3, -1, 1); } if (yo.cargas > 0 && t > 3) usarTurbo(t); }
      if (mando.tomarAccion()) usarTurbo(t);
      yo.vx += (mx * LADO - yo.vx) * Math.min(1, paso * 6);
      yo.vy += (my * LADO * 0.8 - yo.vy) * Math.min(1, paso * 6);
      const c0 = centro(yo.z);
      yo.x = limitar(yo.x + yo.vx * paso, c0.x - ANCHO, c0.x + ANCHO); // más allá empieza el bosque: la cámara se metería en los árboles
      yo.y = limitar(yo.y + yo.vy * paso, ALTO_MIN, ALTO_MAX);
      // Rebufo: justo detrás de una bruja se vuela más rápido
      rebufo = brujas.some((b) => { const bp = posBruja(b, t), dz = yo.z - b.z; return dz > 1 && dz < 9 && Math.abs(bp.x - yo.x) < 2.5 && Math.abs(bp.y - yo.y) < 2.2; }) ? Math.min(1, rebufo + paso * 2) : Math.max(0, rebufo - paso * 2);
      const v = t < yo.lento ? LENTO : t < yo.turbo ? TURBO : VEL + Math.min(4, arosPasados * 0.1) + rebufo * 4;
      const antes = yo.z;
      yo.z -= v * paso;
      // Aros: se cuentan al cruzar su plano cerca del centro
      for (const a of aros) {
        if (a.pasado || a.z > antes || a.z < yo.z) continue;
        a.pasado = true;
        if (Math.hypot(a.x - yo.x, a.y - yo.y) < (a.dorado ? RADIO_DORADO : RADIO_ARO) + 0.3) {
          arosPasados++; combo++; mejorCombo = Math.max(mejorCombo, combo); a.malla.material = matAroListo;
          const pts = (a.dorado ? PUNTOS.dorado : PUNTOS.aro) + Math.min(PUNTOS.comboMax, PUNTOS.combo * (combo - 1));
          ptsAros += pts;
          if (a.dorado) { dorados++; if (yo.cargas < 3) yo.cargas++; e.hud.aviso('✨ ¡Aro dorado! +1 🎃', 'oro', 0.9); }
          else if (arosPasados % 3 === 0 && yo.cargas < 3) { yo.cargas++; e.hud.aviso('+1 🎃 turbo', 'oro', 0.7); }
          e.flotante(`+${pts}`, a.x, a.y + 1.5, a.z, 'bien'); e.sonido.tono(990, 0.1, { tipo: 'triangle', vol: 0.12 }); e.sonido.tono(1480, 0.12, { tipo: 'triangle', vol: 0.1, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.06 });
        } else { a.malla.material = matAroListo; if (combo >= 3) e.hud.aviso(`Se cortó el combo de ${combo}`, '', 0.8); combo = 0; }
      }
      posDulce.forEach((d, i) => {
        if (d.tomado || Math.abs(d.z - yo.z) > 1.2 || Math.hypot(d.x - yo.x, d.y - yo.y) > 1.3) return;
        d.tomado = true; dulcesTomados++;
        o.scale.setScalar(0); o.updateMatrix(); dulces.setMatrixAt(i, o.matrix); dulces.instanceMatrix.needsUpdate = true;
        if (dulcesTomados % 2) e.sonido.tono(1300 + (i % 5) * 80, 0.05, { tipo: 'sine', vol: 0.06 });
      });
      // Obstáculos: árbol (del suelo a su alto) o bandada (una esfera)
      for (const ob of obstaculos) {
        if (ob.golpeado || Math.abs(ob.z - yo.z) > 1.4) continue;
        const toca = ob.tipo === 'arbol' ? Math.abs(ob.x - yo.x) < 1.3 && yo.y < ob.alto + 0.6
          : ob.tipo === 'lapida' ? Math.abs(ob.x - yo.x) < 1.6 && yo.y < ob.alto + 0.4
          : ob.tipo === 'fantasma' ? Math.hypot(ob.malla.position.x - yo.x, ob.y - yo.y) < 1.9
          : ob.tipo === 'rayo' ? cae(ob, t) && Math.abs(ob.x - yo.x) < 2.2
          : Math.hypot(ob.x - yo.x, ob.y - yo.y) < 2;
        if (!toca) continue;
        ob.golpeado = true; choques++; yo.lento = t + 1.1; yo.turbo = 0;
        e.temblar(0.6); e.sonido.mal(); e.chispas(yo.x, yo.y, yo.z - 1, ob.tipo === 'arbol' ? ['#3b2a22', '#7a5232'] : ['#130d1c', '#ff3b2f'], 18, 5);
        combo = 0;
        e.hud.aviso({ arbol: '¡Contra el árbol!', bichos: '¡Murciélagos!', lapida: '¡Contra la lápida!', fantasma: '¡Te atravesó un fantasma!', rayo: '¡Rayo!' }[ob.tipo], '', 0.8);
      }
      // Brujas rivales: siguen el recorrido con su ritmo y se apuran si te alejas
      // Brujas: su ritmo, sus turbos y un pequeño empujón si quedan muy atrás (no te esperan si van adelante)
      for (const b of brujas) {
        const turbo = b.turbos.some((k) => t >= k && t < k + 2), atras = b.z - yo.z > 60 ? 3 : 0;
        b.z -= (turbo ? TURBO - 4 : b.vel + atras + Math.sin(t * 0.7 + b.fase) * 1.5) * paso;
      }
      const zona = zonaDe(yo.z);
      if (zona !== zonaAhora) { zonaAhora = zona; e.hud.aviso(`Zona ${zona + 1}: ${ZONAS[zona]}`, 'oro', 1.6); }
      if (yo.z <= -LARGO) { e.chispas(yo.x, yo.y, yo.z, ['#ff9a2e', '#ffd23c', '#b17cff'], 50, 8); e.sonido.bien(); return terminar(t, true); }
      if (t >= TOPE) return terminar(t, false);
      e.hud.tiempo(mmss(t));
      e.hud.extra(`${puesto()}º de 4 · ${ZONAS[zonaAhora]} · ${'🎃'.repeat(yo.cargas)}${'·'.repeat(3 - yo.cargas)}${combo >= 2 ? ` · combo ×${combo}` : ''}${rebufo > 0.5 ? ' · rebufo' : ''}`);
      e.hud.puntos(ptsAros + dulcesTomados * PUNTOS.dulce);
    }
    // Dibujo
    const inclina = limitar(-yo.vx / LADO, -1, 1) * 0.5, cabecea = limitar(yo.vy / LADO, -1, 1) * 0.3;
    yoG.position.set(yo.x, yo.y + Math.sin(t * 3) * 0.08, yo.z); yoG.rotation.set(cabecea, 0, inclina);
    estela.material.opacity = t < yo.turbo ? 0.6 : 0.25; estela.scale.setScalar(t < yo.turbo ? 1.8 : 1.2); // con turbo brilla, pero sin tapar al jugador
    for (const b of brujas) {
      const p = posBruja(b, t);
      b.g.position.set(p.x, p.y, b.z); b.g.rotation.z = Math.sin(t * 0.9 + b.fase) * 0.25;
    }
    // Fantasmas que cruzan y rayos que avisan y caen
    for (const ob of obstaculos) {
      if (Math.abs(ob.z - yo.z) > 200) continue;
      if (ob.tipo === 'fantasma') { ob.malla.position.x = ob.x + Math.sin(t * 1.1 + ob.fase) * 7; ob.malla.position.y = ob.y + Math.sin(t * 2 + ob.fase) * 0.4; }
      if (ob.tipo === 'rayo') { const f = (t + ob.fase) % 3.2; ob.malla.visible = cae(ob, t); if (ob.aviso) { ob.aviso.visible = f > 0.6 && f < 1.6; ob.aviso.scale.setScalar(1 + Math.sin(t * 14) * 0.08); } if (ob.malla.visible && Math.abs(ob.z - yo.z) < 60 && Math.random() < 0.1) e.chispas(ob.x, 1, ob.z, ['#ffffff', '#cfe8ff'], 6, 4); }
    }
    for (const ob of obstaculos) if (ob.tipo === 'bichos') ob.malla.visible = ob.z < yo.z + 1.5; // ya pasados, tapan la cámara
    for (const ob of obstaculos) if (ob.tipo === 'bichos' && Math.abs(ob.z - yo.z) < 120) ob.malla.children.forEach((b) => { b.rotation.y = t * 3 + b.userData.fase; b.children[0].rotation.x = Math.sin(t * 18 + b.userData.fase) * 0.6; b.children[1].rotation.x = -Math.sin(t * 18 + b.userData.fase) * 0.6; });
    for (const a of aros) if (!a.pasado && Math.abs(a.z - yo.z) < 200) a.malla.rotation.z = t * 0.8;
    for (let i = 0; i < posDulce.length; i++) {
      const d = posDulce[i];
      if (d.tomado || d.z - yo.z > 160 || yo.z - d.z > 160) continue;
      if (d.z > yo.z + 1) { o.scale.setScalar(0); o.updateMatrix(); dulces.setMatrixAt(i, o.matrix); continue; } // ya quedó atrás: si no, pasa gigante junto a la cámara
      o.position.set(d.x, d.y + Math.sin(t * 3 + i) * 0.15, d.z); o.rotation.set(0, t * 2 + i, 0); o.scale.setScalar(1); o.updateMatrix(); dulces.setMatrixAt(i, o.matrix);
    }
    dulces.instanceMatrix.needsUpdate = true;
    if (dulces.instanceColor) dulces.instanceColor.needsUpdate = true;
    camara(dt);
  });

  return { empezar() { e.empezar(); empezado = true; e.hud.aviso('¡A volar!', 'oro', 1); }, destruir: e.destruir };
}
