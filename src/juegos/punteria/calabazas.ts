import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { ladrillo, nocheEmbrujada, pasto } from '../decorado';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, mmss, sombra } from '../reflejos/motor';
import { caja, mat, pasos, rapier, seguir, type Cuerpo } from './fisica';

// Torre de Calabazas: un gancho va y viene sobre una tabla que se balancea en lo alto de un pilar del cementerio.
// Se suelta la pieza (calabazas de tres formas, cajas de dulces y tablones) y hay que apilarla lo más alto posible.
// Se ve de lado; todo se mueve en un plano. Cuenta la altura que la torre sostiene quieta y cada pieza que queda arriba.
// Tres piezas al suelo o 2 minutos y se acaba. Las piezas salen de la semilla: la misma torre para todos.

const DURA = 120, VIDAS = 3, GRAVEDAD = -14, TABLA_Y = 3.2, TABLA_ANCHO = 6;
type Forma = 'redonda' | 'ancha' | 'alta' | 'caja' | 'tablon';
const FORMAS: Forma[] = ['redonda', 'redonda', 'ancha', 'alta', 'caja', 'tablon'];
interface Pieza { c: Cuerpo; forma: Forma; mitad: number; quieta: number; arriba: boolean; caida: boolean; sonó: boolean }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 15, alto: 13, centro: [0, 5.6, 0], inclinacion: 0.1, sinPlaya: true });
  const R = await rapier(), r = generador(`${c.semilla}|calabazas`);
  const mundo = new R.World({ x: 0, y: GRAVEDAD, z: 0 }), cuerpos: Cuerpo[] = [];
  const plano = () => R.RigidBodyDesc.dynamic().enabledTranslations(true, true, false).enabledRotations(false, false, true);
  mundo.createCollider(R.ColliderDesc.cuboid(60, 1, 6).setTranslation(0, -1, 0).setFriction(0.9));

  // ── El cementerio: pasto de noche, camino de piedra, reja y el pilar con la tabla ──
  const noche = await nocheEmbrujada(e.escena, r, { ancho: 26, fondo: 6, centro: [0, -8], desde: 1, hasta: 16, soloAtras: true, niebla: [30, 110], luna: [-14, 22, -60] });
  const texPasto = pasto('#2f4a2c', '#284226', 4); texPasto.repeat.set(10, 6);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshLambertMaterial({ map: texPasto }));
  suelo.rotation.x = -Math.PI / 2; suelo.position.z = -12; e.escena.add(suelo);
  const texPiedra = ladrillo('#8f8aa0', '#3b3648', 5);
  const pilar = new THREE.Mesh(new THREE.BoxGeometry(2.2, TABLA_Y - 0.25, 2.2), new THREE.MeshLambertMaterial({ map: texPiedra }));
  pilar.position.set(0, (TABLA_Y - 0.25) / 2, 0); e.escena.add(pilar);
  const remate = caja(2.7, 0.3, 2.7, '#6d6680'); remate.position.set(0, TABLA_Y - 0.4, 0); e.escena.add(remate);
  mundo.createCollider(R.ColliderDesc.cuboid(1.1, (TABLA_Y - 0.25) / 2, 1.1).setTranslation(0, (TABLA_Y - 0.25) / 2, 0));
  const piso = sombra(1.8); piso.position.y = 0.03; e.escena.add(piso);
  // Reja de hierro detrás, con puntas
  for (let x = -13; x <= 13; x += 0.6) {
    const barra = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2, 0.07), mat('#1c1826')); barra.position.set(x, 1, -4.5); e.escena.add(barra);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), mat('#1c1826')); punta.position.set(x, 2.1, -4.5); e.escena.add(punta);
  }
  for (const y of [0.4, 1.7]) { const riel = new THREE.Mesh(new THREE.BoxGeometry(26, 0.08, 0.08), mat('#1c1826')); riel.position.set(0, y, -4.5); e.escena.add(riel); }
  // El arco de la entrada, al fondo
  for (const x of [-9, -6]) { const poste = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.2, 0.7), new THREE.MeshLambertMaterial({ map: texPiedra })); poste.position.set(x, 2.1, -5); e.escena.add(poste); }
  const dintel = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.22, 6, 16, Math.PI), mat('#4a4458')); dintel.position.set(-7.5, 4.2, -5); e.escena.add(dintel);

  // La tabla: se balancea despacio (más con cada pieza); la física la mueve a mano
  const tabla = new THREE.Mesh(new THREE.BoxGeometry(TABLA_ANCHO, 0.35, 2.2), new THREE.MeshLambertMaterial({ map: ladrillo('#9a6a3e', '#6b4728', 1) }));
  e.escena.add(tabla);
  const cuerpoTabla = mundo.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, TABLA_Y, 0));
  mundo.createCollider(R.ColliderDesc.cuboid(TABLA_ANCHO / 2, 0.175, 1.1).setFriction(1.1), cuerpoTabla);
  const quicio = caja(0.5, 0.5, 2.3, '#4a4458'); quicio.position.set(0, TABLA_Y - 0.3, 0); quicio.rotation.z = Math.PI / 4; e.escena.add(quicio);

  // El gancho: un brazo de grúa de madera que cruza arriba, con una cadena que va y viene
  const viga = caja(16, 0.35, 0.35, '#5a3b22'); e.escena.add(viga);
  const cadena = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1), mat('#9aa0b0')); e.escena.add(cadena);
  const garra = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 12), mat('#9aa0b0')); e.escena.add(garra);

  // ── Piezas ──
  const [moldeCalabaza, k] = await Promise.all([e.pieza('naturaleza', 'crop_pumpkin', 1), e.personaje(c.aspecto, 1.8)]);
  k.grupo.position.set(-5.5, 0, 0.6); k.grupo.rotation.y = 0.6; k.animar('idle');
  const caraTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d')!;
    g.fillStyle = '#ffd23c'; g.beginPath(); g.moveTo(14, 26); g.lineTo(24, 14); g.lineTo(28, 28); g.fill(); g.beginPath(); g.moveTo(50, 26); g.lineTo(40, 14); g.lineTo(36, 28); g.fill();
    g.beginPath(); g.moveTo(12, 38); for (let i = 0; i <= 8; i++) g.lineTo(12 + i * 5, i % 2 ? 46 : 38); g.lineTo(52, 50); g.lineTo(12, 50); g.fill();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const matCara = new THREE.MeshBasicMaterial({ map: caraTex, transparent: true, depthWrite: false });
  const COLORES_CAJA = ['#8e44ad', '#ef5565', '#3fc79a', '#ff9a2e'];
  /** Medidas: media altura y forma del colisionador. La figura sale del modelo de calabaza estirado o de cajas. */
  const armar = (forma: Forma): { malla: THREE.Object3D; mitad: number; colision: () => InstanceType<typeof R.ColliderDesc> } => {
    const g = new THREE.Group();
    if (forma === 'caja' || forma === 'tablon') {
      const [w, h] = forma === 'caja' ? [1.1, 1.1] : [2.6, 0.32];
      const cuerpo = caja(w, h, 1.2, forma === 'caja' ? COLORES_CAJA[Math.floor(r() * COLORES_CAJA.length)] : '#7a5232');
      g.add(cuerpo);
      if (forma === 'caja') { const cinta = caja(w + 0.02, 0.16, 1.22, '#ffd23c'); const cinta2 = caja(0.16, h + 0.02, 1.22, '#ffd23c'); g.add(cinta, cinta2); }
      else for (const x of [-0.9, 0, 0.9]) { const clavo = caja(0.08, 0.34, 1.24, '#3a2516'); clavo.position.x = x; g.add(clavo); }
      return { malla: g, mitad: h / 2, colision: () => R.ColliderDesc.cuboid(w / 2, h / 2, 0.6) };
    }
    const [radio, alto] = forma === 'redonda' ? [0.62, 1.0] : forma === 'ancha' ? [0.9, 0.7] : [0.45, 1.45];
    const m = moldeCalabaza.clone(); m.scale.set(radio * 2, alto, radio * 2); g.add(m);
    const cara = new THREE.Mesh(new THREE.PlaneGeometry(radio * 1.3, alto * 0.75), matCara); cara.position.z = radio * 0.98; g.add(cara);
    return { malla: g, mitad: alto / 2, colision: () => R.ColliderDesc.cylinder(alto / 2, radio * 0.92) };
  };

  const piezas: Pieza[] = [];
  let colgada: ReturnType<typeof armar> & { forma: Forma } = { ...armar(FORMAS[0]), forma: FORMAS[0] };
  e.escena.add(colgada.malla);
  const proxima = () => { const forma = FORMAS[Math.floor(r() * FORMAS.length)]; colgada = { ...armar(forma), forma }; e.escena.add(colgada.malla); };

  let empezado = false, terminado = false, vidas = VIDAS, colocadas = 0, alturaMax = 0, alturaAhora = 0, listoEn = 0, ganchoX = 0, techo = TABLA_Y + 4, foco = 5.6, zoom = 1, faseGancho = 0;
  const puntaje = () => Math.round(alturaMax * 100) + colocadas * 20;
  const terminar = (porque: string) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    k.animar(alturaMax > 4 ? 'emote-yes' : 'emote-no');
    c.alTerminar({
      puntaje: puntaje(),
      lineas: [['Altura máxima', `${alturaMax.toFixed(2)} m`], ['Piezas arriba', String(colocadas)], ['Piezas al suelo', String(VIDAS - vidas)], ['Fin', porque]],
      detalle: { altura: Math.round(alturaMax * 100) / 100, colocadas, caidas: VIDAS - vidas },
    });
  };

  const soltar = () => {
    if (!empezado || terminado || e.reloj() < listoEn) return;
    const pos = colgada.malla.position, cuerpo = mundo.createRigidBody(plano().setTranslation(pos.x, pos.y, 0).setLinearDamping(0.1).setAngularDamping(0.8).setCcdEnabled(true));
    mundo.createCollider(colgada.colision().setFriction(1.2).setRestitution(0).setDensity(colgada.forma === 'tablon' ? 0.7 : 1), cuerpo);
    const par = { cuerpo, malla: colgada.malla };
    cuerpos.push(par);
    piezas.push({ c: par, forma: colgada.forma, mitad: colgada.mitad, quieta: 0, arriba: false, caida: false, sonó: false });
    listoEn = e.reloj() + 0.9;
    e.sonido.tono(520, 0.12, { tipo: 'triangle', vol: 0.15, hasta: 260 });
    e.gesto(k, 'emote-yes', 0.5);
    proxima();
  };
  e.escuchar(e.lienzo, 'pointerdown', soltar);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__gancho = () => ganchoX; // pruebas: soltar cuando pasa por el centro
  e.escuchar(window, 'keydown', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter' || ev.key === 'ArrowDown') && !ev.repeat) { ev.preventDefault(); soltar(); } });
  const boton = document.createElement('button');
  boton.className = 'boton mando-accion';
  boton.textContent = 'Soltar';
  boton.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); soltar(); });
  c.caja.appendChild(boton);

  const avanzar = pasos(mundo), giroTabla = new THREE.Quaternion(), EJE_Z = new THREE.Vector3(0, 0, 1);
  e.hud.tiempo(mmss(DURA));
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    noche.avanzar(t);
    // La tabla se balancea: casi nada al principio y cada vez más con la torre
    const amplitud = Math.min(0.09, 0.012 + colocadas * 0.0035 + (c.nivel - 1) * 0.008), giro = empezado ? Math.sin(t * 0.55) * amplitud : 0;
    cuerpoTabla.setNextKinematicRotation(giroTabla.setFromAxisAngle(EJE_Z, giro));
    tabla.position.set(0, TABLA_Y, 0); tabla.rotation.z = giro;
    // El gancho va y viene más rápido mientras más piezas hay arriba; siempre sobre lo más alto de la torre
    const ancho = 2.6 + Math.min(1.8, colocadas * 0.12), rapidez = 1.1 + Math.min(1.4, colocadas * 0.07) + (c.nivel - 1) * 0.12;
    if (empezado && !terminado) faseGancho += dt * rapidez;
    const x = Math.sin(faseGancho) * ancho;
    ganchoX = x;
    techo += (Math.max(TABLA_Y + 4, TABLA_Y + alturaAhora + 3.6) - techo) * (1 - Math.exp(-2 * dt));
    viga.position.set(0, techo + 2.2, -0.2);
    cadena.scale.y = 2.2; cadena.position.set(x, techo + 1.1, 0);
    garra.position.set(x, techo, 0);
    colgada.malla.visible = t >= listoEn || !empezado;
    colgada.malla.position.set(x, techo - colgada.mitad - 0.25, 0);
    colgada.malla.rotation.set(0, 0, Math.sin(faseGancho * 2) * 0.06);
    if (empezado && !terminado && t > 0) {
      avanzar(dt);
      seguir(cuerpos);
      // Qué piezas están quietas sobre la torre y cuáles se cayeron
      let alto = 0, arriba = 0;
      for (const p of piezas) {
        if (p.caida) continue;
        const pos = p.c.cuerpo.translation(), v = p.c.cuerpo.linvel();
        if (!p.sonó && Math.abs(v.y) < 0.5 && pos.y < techo - 1) { p.sonó = true; if (!e.sonido.efecto('madera', 0.5)) e.sonido.tono(200, 0.08, { tipo: 'square', vol: 0.08 }); }
        if (pos.y < TABLA_Y - 0.8) {
          p.caida = true; vidas--;
          e.chispas(pos.x, 0.6, 0, ['#ff9a2e', '#ffd23c', '#5a3b22'], 22, 5);
          e.temblar(0.4); e.sonido.mal();
          e.hud.aviso(vidas > 0 ? `¡Se cayó! Quedan ${vidas}` : '¡La torre se vino abajo!', vidas > 0 ? '' : 'oro', 1.2);
          setTimeout(() => { const i = cuerpos.indexOf(p.c); if (i >= 0 && !terminado) { cuerpos.splice(i, 1); mundo.removeRigidBody(p.c.cuerpo); e.escena.remove(p.c.malla); } }, 2500);
          continue;
        }
        p.quieta = Math.hypot(v.x, v.y) < 0.18 ? p.quieta + dt : 0;
        if (p.quieta > 0.45) {
          arriba++;
          // Lo alto de la pieza (su mitad, inclinada) sobre la tabla
          const q = p.c.cuerpo.rotation(), inclina = Math.abs(2 * Math.asin(Math.min(1, Math.abs(q.z))));
          alto = Math.max(alto, pos.y + p.mitad * Math.abs(Math.cos(inclina)) + 0.3 * Math.abs(Math.sin(inclina)) - (TABLA_Y + 0.175));
          if (!p.arriba) { p.arriba = true; e.flotante('+20', pos.x, pos.y + 1, 0, 'bien'); }
        }
      }
      colocadas = Math.max(colocadas, arriba);
      alturaAhora = alto;
      if (alto > alturaMax + 0.01) { if (Math.floor(alto) > Math.floor(alturaMax) && alto >= 1) { e.hud.aviso(`¡${Math.floor(alto)} metros!`, 'oro', 1); e.sonido.bien(); } alturaMax = alto; }
      if (vidas <= 0) terminar('Tres piezas al suelo');
      else if (t >= DURA) terminar('Se acabó el tiempo');
      e.hud.tiempo(mmss(DURA - t));
      e.hud.extra(`Altura ${alturaAhora.toFixed(1)} m · récord ${alturaMax.toFixed(1)} m · ${'🎃'.repeat(Math.max(0, vidas))}`);
      e.hud.puntos(puntaje());
    } else seguir(cuerpos);
    // La cámara sube con la torre y se aleja un poco cuando ya es alta
    const suave = 1 - Math.exp(-2 * dt);
    foco += (Math.max(5.6, TABLA_Y + alturaAhora + 1.2) - foco) * suave;
    zoom += (Math.max(1, (alturaAhora + 9) / 13) - zoom) * suave;
    e.enfocar(0, foco, 0, zoom);
  });

  return {
    empezar() { e.empezar(); empezado = true; e.hud.aviso('¡A apilar!', 'oro', 1); },
    destruir() { e.destruir(); mundo.free(); },
  };
}
