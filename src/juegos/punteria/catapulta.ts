import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario } from '../reflejos/motor';
import { arrastre, caja, guia, mat, pasos, rapier, seguir, type Cuerpo } from './fisica';

// Catapulta de Sandías: cuatro sandías contra tres torres de cajas. Se ve de lado; todo se mueve en un solo plano.
// Si botas todas las cajas aparece un segundo nivel: tres torres nuevas, una sobre una plataforma que sube y baja,
// y tres sandías más. Las torres (dónde, qué tan altas) salen de la semilla. Suma cada caja que cae de su plataforma.
const SANDIAS = 4, EXTRA = 3, NIVELES = 2, ORIGEN = { x: -12, y: 2.4 }, VEL_MAX = 25, GRAVEDAD = -16, ESPERA = 4.2;

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 31, alto: 13.5, centro: [0.5, 5.2, 0], inclinacion: 0.06 });
  const R = await rapier(), r = generador(c.semilla);
  const mundo = new R.World({ x: 0, y: GRAVEDAD, z: 0 }), cuerpos: Cuerpo[] = [];
  const plano = () => R.RigidBodyDesc.dynamic().enabledTranslations(true, true, false).enabledRotations(false, false, true);

  mundo.createCollider(R.ColliderDesc.cuboid(60, 1, 6).setTranslation(0, -1, 0).setFriction(0.9));

  const [k] = await Promise.all([
    e.personaje(c.aspecto, 2.6),
    e.modelo('tree_palmTall', -15.5, -6, 12, 0.5), e.modelo('tree_palmBend', 16.5, -7, 12, 3.4), e.modelo('tree_palmDetailedTall', -4, -9, 12.5, 1.8),
    e.modelo('rocks-sand-c', -7, -5, 1.6, 0.6, 'pirata'),
  ]);

  k.grupo.position.set(ORIGEN.x - 1.7, 0, 1.3);
  k.grupo.rotation.y = Math.PI / 2;

  // Catapulta (solo se ve; la sandía sale desde la cuchara)
  const base = caja(2.6, 0.5, 1.6, '#8a5a38'), brazo = caja(0.3, 2.8, 0.3, '#a06a3c');
  base.position.set(ORIGEN.x - 0.6, 0.25, 0);
  brazo.position.set(ORIGEN.x - 0.5, 1.4, 0);
  brazo.rotation.z = 0.5;
  e.escena.add(base, brazo);

  // Torres de un nivel. Lo de cada nivel se guarda en `restos` para retirarlo al pasar al siguiente.
  let cajas: { c: Cuerpo; techo: () => number; caida: boolean }[] = [];
  const restos: (() => void)[] = [];
  let movil: { cuerpo: InstanceType<typeof R.RigidBody>; malla: THREE.Object3D; x: number; y: number } | null = null;
  const geoCaja = new THREE.BoxGeometry(1, 1, 1), bordes = new THREE.LineSegments(new THREE.EdgesGeometry(geoCaja), new THREE.LineBasicMaterial({ color: '#6b4a2b' }));
  const armar = (nivel: number) => {
    for (const quitar of restos) quitar();
    restos.length = 0;
    cajas = [];
    movil = null;
    const conMovil = nivel > 0 ? 1 + Math.floor(r() * 2) : -1;
    for (let i = 0; i < 3; i++) {
      const x = 2.5 + i * 5 + r() * 1.2, alto = 1 + Math.floor(r() * 3) * 0.9, ancho = 2.6, columnas = 1 + Math.floor(r() * 2), pisos = 2 + Math.floor(r() * 3) + nivel + Math.floor((c.nivel - 1) / 2);
      const tarima = caja(ancho, alto, 2.4, i === conMovil ? '#7a8fb0' : '#9a97a6');
      e.escena.add(tarima);
      let techo: () => number, arriba = alto;
      if (i === conMovil) {
        // Plataforma que sube y baja: la física la mueve a mano en cada cuadro
        const y = alto / 2 + 0.6, cuerpo = mundo.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, 0));
        mundo.createCollider(R.ColliderDesc.cuboid(ancho / 2, alto / 2, 1.2).setFriction(0.9), cuerpo);
        tarima.position.set(x, y, 0);
        movil = { cuerpo, malla: tarima, x, y };
        techo = () => cuerpo.translation().y + alto / 2;
        arriba = y + alto / 2;
        restos.push(() => { mundo.removeRigidBody(cuerpo); e.escena.remove(tarima); });
      } else {
        const piso = mundo.createCollider(R.ColliderDesc.cuboid(ancho / 2, alto / 2, 1.2).setTranslation(x, alto / 2, 0).setFriction(0.9));
        tarima.position.set(x, alto / 2, 0);
        techo = () => alto;
        restos.push(() => { mundo.removeCollider(piso, false); e.escena.remove(tarima); });
      }
      for (let col = 0; col < columnas; col++) for (let piso = 0; piso < pisos; piso++) {
        const cx = x + (columnas === 1 ? 0 : (col - 0.5) * 1.06), cy = arriba + 0.5 + piso * 1.001;
        const cuerpo = mundo.createRigidBody(plano().setTranslation(cx, cy, 0).setLinearDamping(0.25).setAngularDamping(0.9));
        mundo.createCollider(R.ColliderDesc.cuboid(0.5, 0.5, 0.5).setFriction(0.7).setRestitution(0.05).setDensity(1.1), cuerpo);
        const malla = new THREE.Mesh(geoCaja, mat(piso % 2 ? '#c99655' : '#b98548'));
        malla.add(bordes.clone());
        e.escena.add(malla);
        const par = { cuerpo, malla };
        cuerpos.push(par);
        cajas.push({ c: par, techo, caida: false });
        restos.push(() => { mundo.removeRigidBody(cuerpo); e.escena.remove(malla); cuerpos.splice(cuerpos.indexOf(par), 1); });
      }
    }
  };
  armar(0);

  const moldeSandia = await e.pieza('comida', 'watermelon', 1.3);
  const enCuchara = moldeSandia.clone();
  enCuchara.position.set(ORIGEN.x, ORIGEN.y, 0);
  e.escena.add(enCuchara);

  const puntosGuia = guia(e.escena, 9);
  let desdeNivel = 0, quedan = SANDIAS, botadas = 0, botadasNivel = 0, nivel = 0, terminado = false, cerrando = false, enVuelo: { c: Cuerpo; desde: number } | null = null, empezado = false;
  const velocidad = (dx: number, dy: number, fuerza: number) => {
    const largo = Math.hypot(dx, dy) || 1;
    return { x: (-dx / largo) * VEL_MAX * fuerza, y: (dy / largo) * VEL_MAX * fuerza }; // tirar atrás y abajo = salir adelante y arriba
  };
  const tiro = arrastre(e, () => empezado && !terminado && !cerrando && !enVuelo && quedan > 0, (t) => {
    const v = velocidad(t.dx, t.dy, t.fuerza);
    if (v.x <= 0.5) return; // hacia atrás no vale
    const cuerpo = mundo.createRigidBody(plano().setTranslation(ORIGEN.x, ORIGEN.y, 0).setCcdEnabled(true).setLinearDamping(0.02).setAngularDamping(0.6));
    mundo.createCollider(R.ColliderDesc.ball(0.6).setDensity(3.2).setFriction(0.8).setRestitution(0.15), cuerpo);
    cuerpo.setLinvel({ x: v.x, y: v.y, z: 0 }, true);
    cuerpo.setAngvel({ x: 0, y: 0, z: -4 }, true);
    const malla = moldeSandia.clone();
    e.escena.add(malla);
    const par = { cuerpo, malla };
    cuerpos.push(par);
    enVuelo = { c: par, desde: e.reloj() };
    quedan--;
    e.gesto(k, 'attack-melee-right', 0.6);
    if (!e.sonido.efecto('soltar')) e.sonido.ruido(0.15, 0.2);
    e.sonido.tono(180, 0.25, { hasta: 420, vol: 0.2 });
  });

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    e.detener();
    const limpio = nivel >= NIVELES;
    c.alTerminar({
      puntaje: botadas * 40 + (limpio ? quedan * 80 : 0),
      lineas: [['Cajas botadas', String(botadas)], ['Niveles despejados', `${Math.min(nivel, NIVELES)} de ${NIVELES}`], ['Sandías sobrantes', String(quedan)], ['Premio por sandías sobrantes', limpio ? `+${quedan * 80}` : '—']],
      detalle: { botadas, niveles: Math.min(nivel, NIVELES), sobrantes: quedan },
    });
  };

  const avanzar = pasos(mundo);
  e.hud.tiempo(`🍉 × ${SANDIAS}`);
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    seguir(cuerpos);
    enCuchara.visible = !enVuelo && quedan > 0 && !terminado;
    // Guía: los primeros instantes del vuelo, como si no hubiera nada en el camino
    const v = tiro.tirando ? velocidad(tiro.dx, tiro.dy, tiro.fuerza) : null;
    puntosGuia.forEach((p, i) => {
      p.visible = !!v && v.x > 0.5 && tiro.fuerza > 0.12;
      if (v) { const s = (i + 1) * 0.09; p.position.set(ORIGEN.x + v.x * s, ORIGEN.y + v.y * s + 0.5 * GRAVEDAD * s * s, 0); }
    });
    if (terminado || t <= 0) return;
    if (movil) {
      // La fase parte en cero con cada nivel: con el reloj del juego la plataforma saltaba de golpe al nacer y reventaba su torre
      const y = movil.y + Math.sin((t - desdeNivel) * (1.1 + (c.nivel - 1) * 0.15)) * 0.9;
      movil.cuerpo.setNextKinematicTranslation({ x: movil.x, y, z: 0 });
      movil.malla.position.y = y;
    }
    avanzar(dt);
    for (const k of cajas) {
      if (k.caida) continue;
      const p = k.c.cuerpo.translation();
      if (p.y < k.techo() + 0.15) { k.caida = true; botadas++; botadasNivel++; e.flotante('+40', p.x, p.y + 1, 0, 'bien'); if (!e.sonido.efecto('madera', 0.6)) e.sonido.tono(300 + botadasNivel * 20, 0.08, { tipo: 'square', vol: 0.1 }); }
    }
    e.hud.tiempo(`🍉 × ${quedan}`);
    e.hud.puntos(botadas * 40);
    e.hud.extra(`Nivel ${Math.min(nivel + 1, NIVELES)} · ${botadasNivel} de ${cajas.length} cajas`);
    if (enVuelo) {
      const p = enVuelo.c.cuerpo.translation(), quieta = enVuelo.c.cuerpo.isSleeping() || (t - enVuelo.desde > 1.2 && Math.hypot(enVuelo.c.cuerpo.linvel().x, enVuelo.c.cuerpo.linvel().y) < 0.25);
      if (t - enVuelo.desde > ESPERA || p.x > 26 || p.x < -20 || quieta) {
        // La sandía usada se retira para no estorbar el tiro siguiente
        e.escena.remove(enVuelo.c.malla);
        mundo.removeRigidBody(enVuelo.c.cuerpo);
        cuerpos.splice(cuerpos.indexOf(enVuelo.c), 1);
        enVuelo = null;
        if (botadasNivel === cajas.length) {
          nivel++;
          if (nivel >= NIVELES) { cerrando = true; e.alCuadro(cierre(t + 1.4)); }
          else {
            quedan += EXTRA;
            botadasNivel = 0;
            e.hud.aviso(`¡Nivel ${nivel + 1}! Torres nuevas y +${EXTRA} sandías`, 'oro', 1.8);
            armar(nivel);
            desdeNivel = t;
          }
        } else if (quedan === 0) { cerrando = true; e.alCuadro(cierre(t + 1.4)); }
      }
    }
  });
  // Tras la última sandía se esperan unos instantes: puede que alguna caja siga cayendo
  const cierre = (cuando: number) => (t: number) => { if (t >= cuando) terminar(); };

  return {
    empezar() { e.empezar(); empezado = true; },
    destruir() { e.destruir(); mundo.free(); },
  };
}
