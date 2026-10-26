import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario } from '../reflejos/motor';
import { arrastre, caja, guia, mat, pasos, rapier, seguir, type Cuerpo } from './fisica';

// Angry Birds (versión 2, 26-10): diez niveles con arquitectura (puentes, casas, pirámide, búnker, castillo, un ascensor),
// hechos de madera, piedra y hielo, con calabazas-monstruo escondidas como objetivo. Cada nivel trae sus sandías:
// normales, explosivas (toca la pantalla en el aire y estallan) y triples (toca y se dividen en tres). Desde el nivel 8 hay viento.
// Los diseños son fijos (la semilla solo los corre unos centímetros y elige el viento): el puntaje máximo es el mismo en
// todas las partidas, y dos rivales de un duelo juegan exactamente lo mismo.

type Material = 'madera' | 'piedra' | 'hielo';
type Sandia = 'normal' | 'explosiva' | 'triple';
interface Pieza { x: number; y: number; w: number; h: number; m: Material }
interface Base { x: number; w: number; h: number; mueve?: { amp: number; vel: number } }
interface Nivel { nombre: string; piezas: Pieza[]; calabazas: { x: number; y: number }[]; bases: Base[]; sandias: Sandia[]; viento: number }

const ORIGEN = { x: -12, y: 2.4 }, VEL_MAX = 26, GRAVEDAD = -16, ESPERA = 3.2, R_CALABAZA = 0.45;
/** Puntos: calabaza, pieza derribada, nivel limpio, sandía que sobra y cada objeto de más en un combo (desde el 5.º de un tiro). */
const PUNTOS = { calabaza: 150, pieza: 15, limpio: 200, sobrante: 100, combo: 10 };
const DENSIDAD: Record<Material, number> = { madera: 1, piedra: 3, hielo: 0.7 };
const COLOR: Record<Material, string> = { madera: '#b98548', piedra: '#8d8a96', hielo: '#a8dcf5' };
const ICONO: Record<Sandia, string> = { normal: '🍉', explosiva: '💥', triple: '🔱' };

/** Los diez niveles. `j` corre las piezas unos centímetros (de la semilla) sin cambiar el diseño. */
function niveles(j: () => number, viento: (max: number) => number): Nivel[] {
  const lista: Nivel[] = [];
  const nuevo = (nombre: string, sandias: Sandia[], v = 0) => { const n: Nivel = { nombre, piezas: [], calabazas: [], bases: [], sandias, viento: v }; lista.push(n); return n; };
  const armar = (n: Nivel) => {
    const d = j();
    return {
      base: (x: number, w: number, h: number, mueve?: Base['mueve']) => { n.bases.push({ x: x + d, w, h, mueve }); return h; },
      bloque: (x: number, y: number, m: Material, w = 1, h = 1) => n.piezas.push({ x: x + d, y: y + h / 2, w, h, m }),
      pilar: (x: number, y: number, h: number, m: Material) => n.piezas.push({ x: x + d, y: y + h / 2, w: 0.45, h, m }),
      tablon: (x: number, y: number, w: number, m: Material) => n.piezas.push({ x: x + d, y: y + 0.15, w, h: 0.3, m }),
      cal: (x: number, y: number) => n.calabazas.push({ x: x + d, y: y + R_CALABAZA }),
    };
  };
  const casa = (b: ReturnType<typeof armar>, x: number, y: number, w: number, h: number, m: Material, techo: Material, dentro = true) => {
    b.pilar(x - w / 2 + 0.225, y, h, m); b.pilar(x + w / 2 - 0.225, y, h, m); b.tablon(x, y + h, w + 0.3, techo);
    if (dentro) b.cal(x, y);
  };
  { const b = armar(nuevo('Primer golpe', ['normal', 'normal', 'normal']));
    b.base(7, 2, 1); b.bloque(7, 1, 'madera'); b.bloque(7, 2, 'madera'); b.cal(7, 3);
    b.bloque(11, 0, 'madera'); b.bloque(11, 1, 'madera'); b.cal(11, 2); }
  { const b = armar(nuevo('El puente', ['normal', 'normal', 'normal']));
    b.pilar(5, 0, 2.4, 'madera'); b.pilar(9, 0, 2.4, 'madera'); b.tablon(7, 2.4, 4.8, 'madera'); b.cal(7, 0); b.cal(7, 2.7);
    b.bloque(12.5, 0, 'madera'); b.bloque(12.5, 1, 'madera'); b.cal(12.5, 2); }
  { const b = armar(nuevo('Las casitas', ['normal', 'normal', 'normal']));
    b.base(6, 3.4, 0.8); casa(b, 6, 0.8, 3, 2.2, 'madera', 'madera'); b.bloque(6, 3.3, 'madera', 1, 0.6);
    b.base(11.5, 2.6, 1.6); casa(b, 11.5, 1.6, 2.4, 2, 'madera', 'madera'); b.cal(11.5, 3.9); }
  { const b = armar(nuevo('Muralla de hielo', ['normal', 'normal', 'explosiva']));
    b.bloque(5, 0, 'piedra', 0.8, 1.6);
    casa(b, 9, 0, 3, 2.6, 'hielo', 'madera'); b.cal(9, 2.9);
    b.bloque(12.5, 0, 'hielo'); b.bloque(12.5, 1, 'hielo'); b.cal(12.5, 2); }
  { const b = armar(nuevo('La pirámide', ['normal', 'explosiva', 'triple']));
    for (let fila = 0; fila < 4; fila++) {
      const n = 5 - fila;
      for (let i = 0; i < n; i++) b.bloque(8.5 + (i - (n - 1) / 2) * 1.02, fila, fila % 2 || i === 0 || i === n - 1 ? 'piedra' : 'madera');
    }
    b.cal(8.5, 4); b.cal(5.2, 0); b.cal(11.8, 0); }
  { const b = armar(nuevo('La torre alta', ['normal', 'normal', 'triple']));
    b.pilar(6, 0, 4.5, 'piedra'); b.bloque(6.6, 0, 'piedra', 0.8, 1.4);
    const alto = b.base(12, 3, 4.2); casa(b, 12, alto, 2.4, 2, 'piedra', 'madera'); b.cal(12, alto + 2.3); }
  { const b = armar(nuevo('Puente colgante', ['normal', 'explosiva', 'normal']));
    b.base(4.5, 1.6, 3.2); b.base(13, 1.6, 3.2); b.tablon(8.75, 3.2, 9.4, 'madera');
    b.cal(7, 3.5); b.cal(10.5, 3.5); b.bloque(8.75, 3.5, 'hielo'); b.cal(8.75, 0); b.bloque(8.75, 0.9, 'madera', 1.4, 0.4); }
  { const b = armar(nuevo('El ascensor', ['normal', 'triple', 'explosiva'], viento(1.5)));
    casa(b, 6, 0, 2.6, 2.2, 'piedra', 'piedra'); b.bloque(6, 2.5, 'madera'); b.cal(6, 3.5);
    const alto = b.base(11.5, 2.6, 2, { amp: 1.2, vel: 1.1 }); b.bloque(11.5, alto, 'madera'); b.bloque(11.5, alto + 1, 'madera'); b.cal(11.5, alto + 2); }
  { const b = armar(nuevo('El búnker', ['explosiva', 'normal', 'triple', 'normal'], viento(2.5)));
    b.pilar(7, 0, 2.4, 'piedra'); b.pilar(10.5, 0, 2.4, 'piedra'); b.tablon(8.75, 2.4, 4.2, 'hielo');
    b.bloque(8, 2.7, 'madera'); b.bloque(9.5, 2.7, 'madera'); b.tablon(8.75, 3.7, 2.6, 'piedra');
    b.cal(8.25, 0); b.cal(9.3, 0);
    b.pilar(13.2, 0, 3, 'madera'); b.pilar(14.2, 0, 3, 'madera'); b.tablon(13.7, 3, 1.6, 'madera'); b.cal(13.7, 3.3); }
  { const b = armar(nuevo('El castillo', ['normal', 'triple', 'explosiva', 'normal', 'explosiva'], viento(3)));
    const piso = b.base(9.5, 9, 0.6);
    for (const x of [5.6, 13.4]) { for (let k = 0; k < 3; k++) b.bloque(x, piso + k, 'piedra'); b.cal(x, piso + 3); }
    casa(b, 9.5, piso, 3, 2.6, 'madera', 'piedra');
    casa(b, 9.5, piso + 2.9, 2, 1.8, 'hielo', 'madera');
    for (const x of [7.2, 11.8]) { b.bloque(x, piso, 'madera', 0.9, 0.9); b.bloque(x, piso + 0.9, 'hielo', 0.9, 0.9); }
    b.cal(9.5, piso + 5); b.cal(3.6, 0); }
  return lista;
}

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 31, alto: 14.5, centro: [0.5, 5.6, 0], inclinacion: 0.06 });
  const R = await rapier(), r = generador(c.semilla);
  const NIVELES = niveles(() => Math.round((r() - 0.5) * 6) / 10, (max) => Math.round((r() * 2 - 1) * max * 10) / 10);
  const mundo = new R.World({ x: 0, y: GRAVEDAD, z: 0 }), cuerpos: Cuerpo[] = [];
  const plano = () => R.RigidBodyDesc.dynamic().enabledTranslations(true, true, false).enabledRotations(false, false, true);
  mundo.createCollider(R.ColliderDesc.cuboid(60, 1, 6).setTranslation(0, -1, 0).setFriction(0.9));

  const [k, moldeCalabaza] = await Promise.all([
    e.personaje(c.aspecto, 2.6), e.pieza('naturaleza', 'crop_pumpkin', 0.95),
    e.modelo('tree_palmTall', -15.5, -6, 12, 0.5), e.modelo('tree_palmBend', 17.5, -7, 12, 3.4), e.modelo('tree_palmDetailedTall', -4, -9, 12.5, 1.8),
    e.modelo('rocks-sand-c', -7, -5, 1.6, 0.6, 'pirata'),
  ]);
  k.grupo.position.set(ORIGEN.x - 1.7, 0, 1.3);
  k.grupo.rotation.y = Math.PI / 2;
  const base = caja(2.6, 0.5, 1.6, '#8a5a38'), brazo = caja(0.3, 2.8, 0.3, '#a06a3c');
  base.position.set(ORIGEN.x - 0.6, 0.25, 0); brazo.position.set(ORIGEN.x - 0.5, 1.4, 0); brazo.rotation.z = 0.5;
  e.escena.add(base, brazo);

  // Materiales: el hielo se ve translúcido; los ojos de las calabazas brillan
  const matHielo = new THREE.MeshStandardMaterial({ color: COLOR.hielo, roughness: 0.15, transparent: true, opacity: 0.72, flatShading: true });
  const matDe = (m: Material) => (m === 'hielo' ? matHielo : mat(COLOR[m]));
  const geoCaja = new THREE.BoxGeometry(1, 1, 1);
  const bordes = (m: Material) => new THREE.LineSegments(new THREE.EdgesGeometry(geoCaja), new THREE.LineBasicMaterial({ color: m === 'madera' ? '#6b4a2b' : m === 'piedra' ? '#55525e' : '#e8f7ff' }));
  const ojo = new THREE.MeshBasicMaterial({ color: '#ffe23c' });

  // ── Estado del nivel ──
  interface PiezaViva { c: Cuerpo; p: Pieza; x0: number; y0: number; caida: boolean; rota: boolean; margen: number }
  interface Calabaza { c: Cuerpo; x0: number; y0: number; viva: boolean; margen: number }
  let piezas: PiezaViva[] = [], calabazas: Calabaza[] = [], moviles: { cuerpo: InstanceType<typeof R.RigidBody>; malla: THREE.Object3D; x: number; y: number; amp: number; vel: number }[] = [];
  const restos: (() => void)[] = [];
  let nivel = 0, total = 0, sandias: Sandia[] = [], desdeNivel = 0, disparos = 0, terminado = false, cerrando = false, empezado = false;
  const resumen: { pts: number; estrellas: number; limpio: boolean }[] = [];
  let ptsNivel = 0, combo = 0;

  // Solo una vez: quitar de nuevo un cuerpo ya quitado (hielo roto, calabaza reventada) deja trabado el mundo de Rapier
  const quitarCuerpo = (x: Cuerpo) => { const i = cuerpos.indexOf(x); if (i < 0) return; cuerpos.splice(i, 1); mundo.removeRigidBody(x.cuerpo); e.escena.remove(x.malla); };
  const armarNivel = (n: number) => {
    for (const quitar of restos) quitar();
    restos.length = 0; piezas = []; calabazas = []; moviles = [];
    const nv = NIVELES[n];
    for (const b of nv.bases) {
      const malla = caja(b.w, b.h, 2.4, b.mueve ? '#7a8fb0' : '#9a97a6'); malla.position.set(b.x, b.h / 2, 0); e.escena.add(malla);
      if (b.mueve) {
        const cuerpo = mundo.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(b.x, b.h / 2, 0));
        mundo.createCollider(R.ColliderDesc.cuboid(b.w / 2, b.h / 2, 1.2).setFriction(0.9), cuerpo);
        moviles.push({ cuerpo, malla, x: b.x, y: b.h / 2, amp: b.mueve.amp, vel: b.mueve.vel });
        restos.push(() => { mundo.removeRigidBody(cuerpo); e.escena.remove(malla); });
      } else {
        const col = mundo.createCollider(R.ColliderDesc.cuboid(b.w / 2, b.h / 2, 1.2).setTranslation(b.x, b.h / 2, 0).setFriction(0.9));
        restos.push(() => { mundo.removeCollider(col, false); e.escena.remove(malla); });
      }
    }
    const sobreMovil = (x: number) => nv.bases.some((b) => b.mueve && Math.abs(b.x - x) < b.w / 2 + 0.2);
    // Lo que va sobre el ascensor baja y sube con él: su caída se mide con más margen
    const margen = (x: number) => (sobreMovil(x) ? Math.max(...nv.bases.map((b) => b.mueve?.amp ?? 0)) : 0);
    for (const p of nv.piezas) {
      const cuerpo = mundo.createRigidBody(plano().setTranslation(p.x, p.y, 0).setLinearDamping(0.2).setAngularDamping(0.8).setSleeping(!sobreMovil(p.x)));
      mundo.createCollider(R.ColliderDesc.cuboid(p.w / 2, p.h / 2, 0.5).setFriction(p.m === 'hielo' ? 0.25 : 0.75).setRestitution(0.05).setDensity(DENSIDAD[p.m]), cuerpo);
      const malla = new THREE.Mesh(geoCaja, matDe(p.m)); malla.scale.set(p.w, p.h, 1); malla.add(bordes(p.m));
      e.escena.add(malla);
      const par = { cuerpo, malla }; cuerpos.push(par);
      const viva: PiezaViva = { c: par, p, x0: p.x, y0: p.y, caida: false, rota: false, margen: margen(p.x) };
      piezas.push(viva);
      restos.push(() => quitarCuerpo(par));
    }
    for (const q of nv.calabazas) {
      const cuerpo = mundo.createRigidBody(plano().setTranslation(q.x, q.y, 0).setLinearDamping(0.3).setAngularDamping(0.9).setSleeping(!sobreMovil(q.x)));
      mundo.createCollider(R.ColliderDesc.ball(R_CALABAZA).setDensity(0.6).setFriction(0.8), cuerpo);
      const malla = new THREE.Group(), cuerpoMalla = moldeCalabaza.clone(); cuerpoMalla.position.y = -R_CALABAZA; malla.add(cuerpoMalla);
      for (const d of [-1, 1]) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), ojo); o.position.set(d * 0.15, 0.08, 0.42); malla.add(o); }
      e.escena.add(malla);
      const par = { cuerpo, malla }; cuerpos.push(par);
      calabazas.push({ c: par, x0: q.x, y0: q.y, viva: true, margen: margen(q.x) });
      restos.push(() => quitarCuerpo(par));
    }
    sandias = [...nv.sandias];
    desdeNivel = e.reloj(); disparos = 0; ptsNivel = 0;
    e.hud.aviso(`Nivel ${n + 1} de ${NIVELES.length}: ${nv.nombre}${nv.viento ? ` · viento ${nv.viento > 0 ? '→' : '←'} ${Math.abs(nv.viento)}` : ''}`, 'oro', 2);
  };

  const sumar = (pts: number, x: number, y: number, texto?: string) => { ptsNivel += pts; total += pts; e.flotante(texto ?? `+${pts}`, x, y, 0, 'oro'); };
  const reventar = (q: Calabaza) => {
    if (!q.viva) return;
    q.viva = false; combo++;
    const p = q.c.cuerpo.translation();
    sumar(PUNTOS.calabaza, p.x, p.y + 1, `+${PUNTOS.calabaza}`);
    e.chispas(p.x, p.y, 0, ['#ff8a1e', '#ffd23c', '#3a7a2a'], 26, 6);
    e.sonido.tono(520, 0.18, { tipo: 'square', vol: 0.12, hasta: 160 });
    quitarCuerpo(q.c);
  };
  const romperHielo = (pz: PiezaViva) => {
    if (pz.rota) return;
    pz.rota = true;
    if (!pz.caida) { pz.caida = true; combo++; const p = pz.c.cuerpo.translation(); sumar(PUNTOS.pieza, p.x, p.y + 0.6); }
    const p = pz.c.cuerpo.translation();
    e.chispas(p.x, p.y, 0, ['#e8f7ff', '#a8dcf5'], 18, 5);
    e.sonido.tono(1600, 0.12, { tipo: 'triangle', vol: 0.1, hasta: 900 });
    quitarCuerpo(pz.c);
  };

  // ── Sandías en vuelo (una, o tres si se dividió) ──
  const moldeSandia = await e.pieza('comida', 'watermelon', 1.3);
  const enCuchara = moldeSandia.clone(); enCuchara.position.set(ORIGEN.x, ORIGEN.y, 0); e.escena.add(enCuchara);
  const puntosGuia = guia(e.escena, 10);
  const huella = guia(e.escena, 30, '#ffd23c'), marcas: { x: number; y: number }[] = [];
  (huella[0].material as THREE.MeshBasicMaterial).opacity = 0.45;
  let marcarEn = 0, foco = 0.5, zoom = 1;
  let vuelo: { cs: Cuerpo[]; desde: number; tipo: Sandia; usado: boolean } | null = null;
  const nuevaSandia = (x: number, y: number, vx: number, vy: number) => {
    const cuerpo = mundo.createRigidBody(plano().setTranslation(x, y, 0).setCcdEnabled(true).setLinearDamping(0.02).setAngularDamping(0.6));
    mundo.createCollider(R.ColliderDesc.ball(0.6).setDensity(3.2).setFriction(0.8).setRestitution(0.15), cuerpo);
    cuerpo.setLinvel({ x: vx, y: vy, z: 0 }, true); cuerpo.setAngvel({ x: 0, y: 0, z: -4 }, true);
    const malla = moldeSandia.clone(); e.escena.add(malla);
    const par = { cuerpo, malla }; cuerpos.push(par);
    return par;
  };
  const velocidad = (dx: number, dy: number, fuerza: number) => { const largo = Math.hypot(dx, dy) || 1; return { x: (-dx / largo) * VEL_MAX * fuerza, y: (dy / largo) * VEL_MAX * fuerza }; };
  const tiro = arrastre(e, () => empezado && !terminado && !cerrando && !vuelo && sandias.length > 0, (t) => {
    const v = velocidad(t.dx, t.dy, t.fuerza);
    if (v.x <= 0.5) return;
    const tipo = sandias[0];
    if (!c.libre) sandias.shift();
    vuelo = { cs: [nuevaSandia(ORIGEN.x, ORIGEN.y, v.x, v.y)], desde: e.reloj(), tipo, usado: false };
    disparos++; combo = 0;
    marcas.length = 0; for (const h of huella) h.visible = false;
    e.gesto(k, 'attack-melee-right', 0.6);
    if (!e.sonido.efecto('soltar')) e.sonido.ruido(0.15, 0.2);
    if (tipo !== 'normal') e.hud.aviso(tipo === 'explosiva' ? 'Toca la pantalla (o Espacio) para que estalle' : 'Toca la pantalla (o Espacio) para dividirla en tres', '', 1.2);
  });
  /** El poder de la sandía en vuelo: estallar o dividirse. */
  const usarPoder = () => {
    if (!vuelo || vuelo.usado || vuelo.tipo === 'normal' || e.reloj() - vuelo.desde < 0.15) return;
    vuelo.usado = true;
    const s = vuelo.cs[0], p = s.cuerpo.translation(), v = s.cuerpo.linvel();
    if (vuelo.tipo === 'triple') {
      for (const giro of [0.2, -0.2]) { const cs = Math.cos(giro), sn = Math.sin(giro); vuelo.cs.push(nuevaSandia(p.x, p.y, v.x * cs - v.y * sn, v.x * sn + v.y * cs)); }
      e.sonido.tono(900, 0.12, { tipo: 'triangle', vol: 0.12, hasta: 1300 });
      return;
    }
    // Explosiva: empuja todo lo cercano, revienta calabazas y rompe el hielo
    const RADIO = 3.2;
    for (const pz of piezas) {
      if (pz.rota) continue;
      const q = pz.c.cuerpo.translation(), dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d > RADIO) continue;
      if (pz.p.m === 'hielo' && d < 2.2) { romperHielo(pz); continue; }
      const f = (1 - d / RADIO) * 14 * pz.c.cuerpo.mass();
      pz.c.cuerpo.wakeUp(); pz.c.cuerpo.applyImpulse({ x: (dx / (d || 1)) * f, y: (dy / (d || 1)) * f + f * 0.3, z: 0 }, true);
    }
    for (const q of calabazas) if (q.viva) { const a = q.c.cuerpo.translation(); if (Math.hypot(a.x - p.x, a.y - p.y) < 1.8) reventar(q); }
    e.chispas(p.x, p.y, 0, ['#ff6a1e', '#ffd23c', '#3a3a44'], 40, 9); e.temblar(0.5); e.sonido.ruido(0.5, 0.3);
    quitarCuerpo(s); vuelo.cs.splice(0, 1);
  };
  e.escuchar(e.lienzo, 'pointerdown', () => usarPoder());
  e.escuchar(window, 'keydown', (ev) => { if (ev.key === ' ') { ev.preventDefault(); usarPoder(); } });

  // Viento: empuja las sandías en el aire (a pasos fijos, igual para todos)
  const avanzar = pasos(mundo, () => {
    const v = NIVELES[nivel]?.viento ?? 0;
    if (v && vuelo) for (const s of vuelo.cs) s.cuerpo.applyImpulse({ x: (v * s.cuerpo.mass()) / 60, y: 0, z: 0 }, true);
  });

  const estrellasDe = (limpio: boolean, sobran: number) => (!limpio ? 0 : sobran >= 2 ? 3 : sobran >= 1 ? 2 : 1);
  const cerrarNivel = (t: number) => {
    const limpio = calabazas.every((q) => !q.viva), sobran = c.libre ? 0 : sandias.length;
    if (limpio) { sumar(PUNTOS.limpio, 8, 7, `¡Nivel limpio! +${PUNTOS.limpio}`); if (sobran) sumar(sobran * PUNTOS.sobrante, 8, 6, `+${sobran * PUNTOS.sobrante} por ${sobran} ${sobran === 1 ? 'sandía' : 'sandías'}`); e.sonido.bien(); }
    else { e.hud.aviso('Quedaron calabazas: al siguiente nivel', 'mal', 1.4); e.sonido.mal(); }
    const estrellas = estrellasDe(limpio, sobran);
    resumen.push({ pts: ptsNivel, estrellas, limpio });
    if (limpio) e.hud.aviso(`${'★'.repeat(estrellas)}${'☆'.repeat(3 - estrellas)}  Nivel ${nivel + 1} · ${ptsNivel} pts`, 'oro', 1.8);
    nivel++;
    if (nivel >= NIVELES.length && !c.libre) { cerrando = true; e.alCuadro(cierre(t + 1.6)); return; }
    nivel %= NIVELES.length;
    cerrando = true;
    cambio = t + 1.8;
  };
  let cambio = -1, cerrarEn = -1;

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    e.detener();
    const estrellas = resumen.reduce((s, x) => s + x.estrellas, 0), limpios = resumen.filter((x) => x.limpio).length;
    c.alTerminar({
      puntaje: total,
      lineas: [
        ['Niveles limpios', `${limpios} de ${NIVELES.length}`],
        ['Estrellas', `${estrellas} de ${NIVELES.length * 3}`],
        ...resumen.map((x, i) => [`${i + 1}. ${NIVELES[i].nombre}`, `${x.pts} pts ${'★'.repeat(x.estrellas)}${'☆'.repeat(3 - x.estrellas)}`] as [string, string]),
      ],
      detalle: { version: 2, limpios, estrellas, niveles: resumen.map((x) => x.pts) },
    });
  };
  const cierre = (cuando: number) => (t: number) => { if (t >= cuando) terminar(); };

  // Solo en pruebas: ?nivel=N empieza en ese nivel
  if (import.meta.env.DEV) { const n = Number(new URLSearchParams(location.search).get('nivel')); if (n >= 1 && n <= NIVELES.length) nivel = n - 1; }
  armarNivel(nivel);
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    seguir(cuerpos);
    enCuchara.visible = !vuelo && sandias.length > 0 && !terminado && !cerrando;
    const nv = NIVELES[nivel] ?? NIVELES[0];
    // Guía: los primeros instantes del vuelo (con el viento incluido)
    const v = tiro.tirando ? velocidad(tiro.dx, tiro.dy, tiro.fuerza) : null;
    puntosGuia.forEach((p, i) => {
      p.visible = !!v && v.x > 0.5 && tiro.fuerza > 0.12;
      if (v) { const s = (i + 1) * 0.08; p.position.set(ORIGEN.x + v.x * s + 0.5 * nv.viento * s * s, ORIGEN.y + v.y * s + 0.5 * GRAVEDAD * s * s, 0); }
    });
    for (const g of calabazas) if (g.viva) g.c.malla.rotation.y = Math.sin(t * 2 + g.x0) * 0.25;
    if (terminado || t <= 0) return;
    if (cerrarEn > 0 && t >= cerrarEn) { cerrarEn = -1; cerrarNivel(t); }
    if (cambio > 0 && t >= cambio) { cambio = -1; cerrando = false; armarNivel(nivel); }
    for (const m of moviles) { const y = m.y + Math.sin((t - desdeNivel) * m.vel) * m.amp; m.cuerpo.setNextKinematicTranslation({ x: m.x, y, z: 0 }); m.malla.position.y = y; }
    avanzar(dt);
    // Lo que cae: piezas movidas o volcadas suman; calabazas golpeadas, caídas o tocadas por una sandía revientan
    const armado = disparos > 0 && t - desdeNivel > 0.5;
    if (armado) {
      for (const pz of piezas) {
        if (pz.caida || pz.rota) continue;
        const q = pz.c.cuerpo.translation(), giro = Math.abs(2 * Math.asin(Math.min(1, Math.abs(pz.c.cuerpo.rotation().z))));
        if (Math.abs(q.x - pz.x0) > 0.8 || q.y < pz.y0 - 0.8 - pz.margen || giro > 0.5) { pz.caida = true; combo++; sumar(PUNTOS.pieza, q.x, q.y + 0.6); if (!e.sonido.efecto('madera', 0.5)) e.sonido.tono(300, 0.06, { tipo: 'square', vol: 0.08 }); }
        if (pz.p.m === 'hielo') { const vel = pz.c.cuerpo.linvel(); if (Math.hypot(vel.x, vel.y) > 5.5) romperHielo(pz); }
      }
      for (const q of calabazas) {
        if (!q.viva) continue;
        const p = q.c.cuerpo.translation(), vel = q.c.cuerpo.linvel();
        const tocada = vuelo?.cs.some((s) => { const a = s.cuerpo.translation(), va = s.cuerpo.linvel(); return Math.hypot(a.x - p.x, a.y - p.y) < 1.1 && Math.hypot(va.x, va.y) > 2; });
        if (tocada || Math.hypot(vel.x, vel.y) > 4 + q.margen * 1.5 || p.y < q.y0 - 0.9 - q.margen || p.y < -2) reventar(q);
      }
      // El hielo se rompe al paso de una sandía rápida
      if (vuelo) for (const s of vuelo.cs) {
        const a = s.cuerpo.translation(), va = s.cuerpo.linvel();
        if (Math.hypot(va.x, va.y) < 4) continue;
        for (const pz of piezas) if (pz.p.m === 'hielo' && !pz.rota) { const q = pz.c.cuerpo.translation(); if (Math.abs(a.x - q.x) < pz.p.w / 2 + 0.7 && Math.abs(a.y - q.y) < pz.p.h / 2 + 0.7) romperHielo(pz); }
      }
    }
    const vivas = calabazas.filter((q) => q.viva).length;
    // La estructura puede seguir cayendo después de que la sandía se detuvo: si aplasta la última calabaza, el nivel se cierra solo
    if (!vuelo && !cerrando && disparos > 0 && vivas === 0) { cerrando = true; cerrarEn = t + 0.8; }
    e.hud.tiempo(c.libre ? '🍉 × ∞' : sandias.length ? sandias.map((s) => ICONO[s]).join('') : '—');
    e.hud.extra(`Nivel ${nivel + 1}/${NIVELES.length} · 🎃 ${vivas}${nv.viento ? ` · viento ${nv.viento > 0 ? '→' : '←'}${Math.abs(nv.viento)}` : ''}`);
    e.hud.puntos(total);
    if (vuelo) {
      const lider = vuelo.cs[0];
      if (lider) { const p = lider.cuerpo.translation(); if (t >= marcarEn && marcas.length < huella.length && p.x < 26 && p.y > -1) { marcas.push({ x: p.x, y: p.y }); marcarEn = t + 0.06; } }
      const quietas = vuelo.cs.every((s) => { const p = s.cuerpo.translation(), v2 = s.cuerpo.linvel(); return s.cuerpo.isSleeping() || p.x > 26 || p.x < -20 || p.y < -3 || (t - vuelo!.desde > 1 && Math.hypot(v2.x, v2.y) < 0.4); });
      if (t - vuelo.desde > ESPERA || quietas || !vuelo.cs.length) {
        for (const s of vuelo.cs) quitarCuerpo(s);
        vuelo = null;
        if (combo > 4) sumar((combo - 4) * PUNTOS.combo, 8, 8, `¡Combo de ${combo}! +${(combo - 4) * PUNTOS.combo}`);
        marcas.forEach((m, i) => { huella[i].position.set(m.x, m.y, 0); huella[i].visible = true; });
        // El nivel se cierra si no quedan calabazas o si no quedan sandías
        if (!cerrando && (calabazas.every((q) => !q.viva) || sandias.length === 0)) { cerrando = true; cerrarEn = t + 0.8; }
      }
    }
    // La cámara acompaña a la sandía y vuelve sola al encuadre
    const vuela = vuelo?.cs[0]?.cuerpo.translation(), suave = 1 - Math.exp(-3 * dt);
    foco += ((vuela ? 0.5 + (Math.min(vuela.x, 18) - 0.5) * 0.35 : 0.5) - foco) * suave;
    zoom += ((vuela ? 0.88 : 1) - zoom) * suave;
    e.enfocar(foco, 5.6, 0, zoom);
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__angry = () => ({ nivel, total, sandias: [...sandias], calabazas: calabazas.filter((q) => q.viva).map((q) => { const p = q.c.cuerpo.translation(); return { x: p.x, y: p.y }; }), vuelo: !!vuelo, terminado, cerrando });

  return { empezar() { e.empezar(); empezado = true; desdeNivel = e.reloj(); }, destruir() { e.destruir(); mundo.free(); } };
}
