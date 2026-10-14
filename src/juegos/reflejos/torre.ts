import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario } from './motor';

// Torre Tambaleante: un bloque va y viene sobre la torre; al tocar, cae. Lo que sobresale se corta y cae al vacío,
// así que el bloque siguiente es más chico. Soltarlo justo encima (un "perfecto") conserva el tamaño y da racha.
const ALTO = 0.7, LADO = 4, AMPLITUD = 6, MAXIMO = 50, LIMITE = 120, PERFECTO = 0.14;
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
  const bloque = (w: number, d: number, piso: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, ALTO, 1), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((tono + piso * 0.035) % 1, 0.6, 0.58), flatShading: true }));
    m.scale.set(w, 1, d);
    e.escena.add(m);
    return m;
  };
  const altura = (n: number) => n * ALTO + ALTO / 2;
  const pisos: Piso[] = [{ x: 0, z: 0, w: LADO, d: LADO, malla: bloque(LADO, LADO, 0) }];
  pisos[0].malla.position.set(0, altura(0), 0);
  const cayendo: { m: THREE.Mesh; vy: number }[] = [];
  let actual: Piso | null = null, eje: Eje = 'x', fase = 0, vel = 4, perfectos = 0, racha = 0, mejorRacha = 0, puntos = 0, terminado = false, empezado = false;

  const nuevo = () => {
    const previo = pisos[pisos.length - 1];
    eje = pisos.length % 2 ? 'x' : 'z';
    actual = { ...previo, malla: bloque(previo.w, previo.d, pisos.length) };
    fase = r() * Math.PI * 2;
    vel = Math.min(10, 4 + pisos.length * 0.13) * apuro;
  };
  const terminar = () => {
    if (terminado) return;
    terminado = true;
    e.detener();
    k.animar('emote-yes');
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Pisos', String(pisos.length - 1)], ['Perfectos', String(perfectos)], ['Mejor racha', String(mejorRacha)]],
      detalle: { pisos: pisos.length - 1, perfectos, racha: mejorRacha },
    });
  };
  const soltar = () => {
    if (terminado || !empezado || !actual || e.reloj() <= 0) return;
    const previo = pisos[pisos.length - 1], tam = eje === 'x' ? 'w' : 'd', delta = actual[eje] - previo[eje];
    if (Math.abs(delta) < perfecto) {
      actual[eje] = previo[eje];
      perfectos++; racha++;
      mejorRacha = Math.max(mejorRacha, racha);
      if (racha >= 3) actual[tam] = Math.min(LADO, actual[tam] + 0.15); // la racha devuelve un poco de tamaño
      puntos += 45 + Math.min(racha, 10) * 2;
      e.sonido.bien();
      e.flotante('¡Perfecto!', actual.x, altura(pisos.length) + 1, actual.z, 'oro');
      e.gesto(k, 'emote-yes', 0.8);
    } else {
      const queda = actual[tam] - Math.abs(delta), signo = Math.sign(delta);
      if (queda <= 0) { cayendo.push({ m: actual.malla, vy: 0 }); actual = null; e.sonido.mal(); return terminar(); }
      // El trozo que sobresale se corta y cae
      const trozo = bloque(eje === 'x' ? Math.abs(delta) : actual.w, eje === 'z' ? Math.abs(delta) : actual.d, pisos.length);
      trozo.position.set(actual.x, altura(pisos.length), actual.z);
      trozo.position[eje] = actual[eje] + (signo * queda) / 2; // el corte va del borde del piso de abajo al borde del bloque
      cayendo.push({ m: trozo, vy: 0 });
      actual[tam] = queda;
      actual[eje] = previo[eje] + delta / 2;
      racha = 0;
      puntos += 25;
      if (!e.sonido.efecto('madera', 0.6)) e.sonido.tono(260 + pisos.length * 8, 0.08, { tipo: 'square', vol: 0.12 });
    }
    actual.malla.scale.set(actual.w, 1, actual.d);
    actual.malla.position.set(actual.x, altura(pisos.length), actual.z);
    pisos.push(actual);
    actual = null;
    if (pisos.length > MAXIMO) return terminar();
    nuevo();
  };
  e.escuchar(e.lienzo, 'pointerdown', soltar);
  e.escuchar(window, 'keydown', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) { ev.preventDefault(); soltar(); } });

  const mira = new THREE.Vector3();
  e.hud.tiempo('Piso 0');
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    const cima = pisos.length * ALTO;
    mira.set(7.5, cima + 6.5, 9.5);
    e.camara.position.lerp(mira, Math.min(1, 3 * dt));
    e.camara.lookAt(0, cima - 0.5, 0);
    for (const x of cayendo) { x.vy -= 22 * dt; x.m.position.y += x.vy * dt; x.m.rotation.x += dt; x.m.visible = x.m.position.y > -12; }
    if (!empezado || terminado) return;
    if (actual) {
      fase += (dt * vel) / AMPLITUD;
      const previo = pisos[pisos.length - 1];
      actual[eje] = previo[eje] + Math.sin(fase) * AMPLITUD;
      actual.malla.position.set(actual.x, altura(pisos.length), actual.z);
    }
    e.hud.tiempo(`Piso ${pisos.length - 1}`);
    e.hud.extra(racha >= 2 ? `racha ${racha}` : '');
    e.hud.puntos(puntos);
    if (t >= LIMITE) terminar();
  });

  return { empezar() { e.empezar(); empezado = true; nuevo(); }, destruir: e.destruir };
}
