import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, mmss } from './motor';

// Torre Tambaleante: un bloque va y viene sobre la torre; al tocar, cae. Lo que sobresale se corta y cae al vacío,
// así que el bloque siguiente es más chico. Soltarlo justo encima (un "perfecto") conserva el tamaño y da racha.
// 16-11: el puntaje no cambió; se arreglaron los clics fantasma (botón derecho y el clic que devuelve la ventana) y
// se sumaron ayudas visuales, avisos y limpieza de los trozos que caen.
const ALTO = 0.7, LADO = 4, AMPLITUD = 6, MAXIMO = 50, LIMITE = 120, PERFECTO = 0.14, CALMA = 400;
type Eje = 'x' | 'z';
interface Piso { x: number; z: number; w: number; d: number; malla: THREE.Mesh }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 14, alto: 12, centro: [0, 2, 0], inclinacion: 0.5, sinPlaya: true });
  e.escena.background = new THREE.Color('#24375f');
  const r = generador(c.semilla), tono = r();
  const perfecto = PERFECTO - (c.nivel - 1) * 0.015, apuro = 1 + (c.nivel - 1) * 0.07; // cada jornada: margen más justo y bloques más rápidos
  const k = await e.personaje(c.aspecto, 1.5);
  k.grupo.position.set(2.7, 0, 2.7);
  k.grupo.rotation.y = 0.8;

  const base = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3, 6.4), new THREE.MeshStandardMaterial({ color: '#6b5a52', flatShading: true }));
  base.position.y = -1.5;
  e.escena.add(base);
  const caja = new THREE.BoxGeometry(1, ALTO, 1); // una sola geometría para todos los bloques (antes, una por bloque)
  const bloque = (w: number, d: number, piso: number) => {
    const m = new THREE.Mesh(caja, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((tono + piso * 0.035) % 1, 0.6, 0.58), flatShading: true }));
    m.scale.set(w, 1, d);
    e.escena.add(m);
    return m;
  };
  const altura = (n: number) => n * ALTO + ALTO / 2;
  const pisos: Piso[] = [{ x: 0, z: 0, w: LADO, d: LADO, malla: bloque(LADO, LADO, 0) }];
  pisos[0].malla.position.set(0, altura(0), 0);
  // Guía: el contorno del piso de abajo a la altura del bloque que se mueve (muestra dónde se va a cortar)
  const guia = new THREE.LineSegments(new THREE.EdgesGeometry(caja), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45 }));
  guia.visible = false;
  e.escena.add(guia);
  const cayendo: { m: THREE.Mesh; vy: number; gx: number; gz: number }[] = [];
  const caer = (m: THREE.Mesh) => cayendo.push({ m, vy: 0, gx: (r() - 0.5) * 4, gz: (r() - 0.5) * 4 });
  let actual: Piso | null = null, eje: Eje = 'x', fase = 0, vel = 4, perfectos = 0, racha = 0, mejorRacha = 0, puntos = 0, terminado = false, empezado = false;
  let fin = 'Se acabó el tiempo', avisoFinal = false;

  const nuevo = () => {
    const previo = pisos[pisos.length - 1];
    eje = pisos.length % 2 ? 'x' : 'z';
    actual = { ...previo, malla: bloque(previo.w, previo.d, pisos.length) };
    fase = r() * Math.PI * 2;
    vel = Math.min(10, 4 + pisos.length * 0.13) * apuro;
    guia.scale.set(previo.w, 1, previo.d);
    guia.position.set(previo.x, altura(pisos.length), previo.z);
    guia.visible = true;
  };
  const terminar = () => {
    if (terminado) return;
    terminado = true;
    guia.visible = false;
    e.detener();
    k.animar('emote-yes');
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Pisos', String(pisos.length - 1)], ['Perfectos', String(perfectos)], ['Mejor racha', String(mejorRacha)], ['Fin', fin]],
      detalle: { pisos: pisos.length - 1, perfectos, racha: mejorRacha },
    });
  };
  const soltar = () => {
    if (terminado || !empezado || !actual || e.reloj() <= 0) return;
    const previo = pisos[pisos.length - 1], tam = eje === 'x' ? 'w' : 'd', delta = actual[eje] - previo[eje];
    const y = altura(pisos.length);
    if (Math.abs(delta) < perfecto) {
      actual[eje] = previo[eje];
      perfectos++; racha++;
      mejorRacha = Math.max(mejorRacha, racha);
      if (racha >= 3) actual[tam] = Math.min(LADO, actual[tam] + 0.15); // la racha devuelve un poco de tamaño
      puntos += 45 + Math.min(racha, 10) * 2;
      e.sonido.tono(520 * Math.pow(1.06, Math.min(racha, 12)), 0.12, { tipo: 'triangle', vol: 0.1 }); // más agudo con la racha
      e.flotante(racha >= 2 ? `¡Perfecto ×${racha}!` : '¡Perfecto!', actual.x, y + 1, actual.z, 'oro');
      e.chispas(actual.x, y + ALTO / 2, actual.z, ['#ffe08a', '#ffffff', '#7ad8ff'], racha >= 5 ? 28 : 14, 4);
      if (racha >= 5) e.temblar(0.15);
      e.gesto(k, 'emote-yes', 0.8);
    } else {
      const queda = actual[tam] - Math.abs(delta), signo = Math.sign(delta);
      if (queda <= 0) { caer(actual.malla); actual = null; fin = 'Se cayó un bloque'; e.sonido.mal(); e.temblar(0.5); return terminar(); }
      // El trozo que sobresale se corta y cae
      const trozo = bloque(eje === 'x' ? Math.abs(delta) : actual.w, eje === 'z' ? Math.abs(delta) : actual.d, pisos.length);
      trozo.position.set(actual.x, y, actual.z);
      trozo.position[eje] = actual[eje] + (signo * queda) / 2; // el corte va del borde del piso de abajo al borde del bloque
      caer(trozo);
      actual[tam] = queda;
      actual[eje] = previo[eje] + delta / 2;
      if (racha >= 3) e.hud.aviso(`Racha cortada en ${racha}`, 'mal', 0.9);
      else if (Math.abs(delta) < perfecto * 2) e.flotante('¡Casi!', actual.x, y + 1, actual.z);
      racha = 0;
      puntos += 25;
      if (queda < 0.6) e.hud.aviso('¡Bloque chico: apunta!', 'mal', 1);
      if (!e.sonido.efecto('madera', 0.6)) e.sonido.tono(260 + pisos.length * 8, 0.08, { tipo: 'square', vol: 0.12 });
    }
    actual.malla.scale.set(actual.w, 1, actual.d);
    actual.malla.position.set(actual.x, y, actual.z);
    pisos.push(actual);
    actual = null;
    if (pisos.length > MAXIMO) { fin = `¡Cima! (${MAXIMO} pisos)`; e.chispas(0, altura(pisos.length), 0, ['#ffe08a', '#ff7ab8', '#7ad8ff'], 40, 7); return terminar(); }
    nuevo();
  };

  // Clics fantasma: solo cuenta el botón principal (o un toque) y no el clic con que vuelves a la ventana o pestaña
  let fuera = false, vuelta = 0;
  const salir = () => { fuera = true; clearTimeout(vuelta); };
  const volver = () => { clearTimeout(vuelta); vuelta = window.setTimeout(() => { fuera = false; }, CALMA); };
  e.escuchar(window, 'blur', salir);
  e.escuchar(window, 'focus', volver);
  e.escuchar(e.lienzo, 'contextmenu', (ev) => ev.preventDefault());
  e.escuchar(e.lienzo, 'pointerdown', (ev) => {
    if (ev.button !== 0 || !ev.isPrimary) return;
    if (fuera) { fuera = false; clearTimeout(vuelta); e.hud.aviso('Clic para volver: no cuenta', '', 0.8); return; }
    soltar();
  });
  e.escuchar(window, 'keydown', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) { ev.preventDefault(); fuera = false; soltar(); } });

  const mira = new THREE.Vector3();
  e.hud.tiempo('Piso 0');
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    const cima = pisos.length * ALTO;
    mira.set(7.5, cima + 6.5, 9.5);
    e.camara.position.lerp(mira, Math.min(1, 3 * dt));
    e.camara.lookAt(0, cima - 0.5, 0);
    // Los trozos caen girando y se borran al salir de la vista (antes quedaban en la escena toda la partida)
    for (let i = cayendo.length - 1; i >= 0; i--) {
      const x = cayendo[i];
      x.vy -= 22 * dt; x.m.position.y += x.vy * dt; x.m.rotation.x += x.gx * dt; x.m.rotation.z += x.gz * dt;
      if (x.m.position.y < cima - 25) { e.escena.remove(x.m); (x.m.material as THREE.Material).dispose(); cayendo.splice(i, 1); }
    }
    if (!empezado || terminado) return;
    if (actual) {
      fase += (dt * vel) / AMPLITUD;
      const previo = pisos[pisos.length - 1];
      actual[eje] = previo[eje] + Math.sin(fase) * AMPLITUD;
      actual.malla.position.set(actual.x, altura(pisos.length), actual.z);
      guia.material.opacity = 0.3 + 0.2 * Math.sin(t * 6);
    }
    const resta = LIMITE - t;
    if (!avisoFinal && resta <= 10) { avisoFinal = true; e.hud.aviso('¡Quedan 10 segundos!', 'mal', 1.2); }
    e.hud.tiempo(`Piso ${pisos.length - 1}`);
    e.hud.extra(`${mmss(resta)}${racha >= 2 ? ` · racha ${racha}` : ''}`);
    e.hud.puntos(puntos);
    if (t >= LIMITE) terminar();
  });

  return {
    empezar() { e.empezar(); empezado = true; nuevo(); e.hud.aviso('Clic, toque o Espacio', '', 1.6); },
    destruir() { caja.dispose(); guia.geometry.dispose(); e.destruir(); },
  };
}
