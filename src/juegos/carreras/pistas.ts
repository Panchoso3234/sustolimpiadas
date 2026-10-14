import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearCarrera, type Barra, type Bloque } from './motor';

// Las cuatro carreras. Cada una arma su pista con la semilla del día: mismo recorrido para todos.

/** Puente Colgante: tablones sobre el río que ceden medio segundo después de pisarlos. No se puede dudar.
 *  Desde la quinta fila, algunos tablones solitarios van y vienen de lado. */
export function puente(c: Contexto): Promise<Partida> {
  const r = generador(c.semilla), bloques: Bloque[] = [{ x: 0, y: 0, z: 0, w: 7, h: 1, d: 5, color: '#8a5a38', tipo: 'control' }];
  const CARRILES = [-2.3, 0, 2.3], FILAS = 23, PASO = 3.3; // entre filas queda un hueco que obliga a saltar
  let previos = [1];
  for (let f = 1; f <= FILAS; f++) {
    const z = -2.5 - f * PASO;
    if (f % 8 === 0) { bloques.push({ x: 0, y: 0, z, w: 7, h: 0.6, d: 1.8, color: '#8a5a38', tipo: 'control' }); previos = [0, 1, 2]; continue; }
    // Cada fila tiene uno o dos tablones, siempre con alguno al alcance desde la fila anterior
    const base = previos[Math.floor(r() * previos.length)], paso = Math.floor(r() * 3) - 1, uno = Math.max(0, Math.min(2, base + paso)), otro = Math.floor(r() * 3), doble = r() < 0.4;
    previos = doble && otro !== uno ? [uno, otro] : [uno];
    const vaivén = f >= 5 && previos.length === 1 && r() < 0.35 + c.nivel * 0.05;
    for (const carril of previos) bloques.push({ x: CARRILES[carril], y: 0, z, w: 1.9, h: 0.3, d: 1.7, color: vaivén ? '#d9a35a' : f % 2 ? '#c99655' : '#b98548', tipo: 'cae', mueve: vaivén ? { eje: 'x', amp: 1.1, vel: 1.5, fase: r() * 6.28 } : undefined });
  }
  const fin = -2.5 - (FILAS + 1) * PASO - 1.5;
  bloques.push({ x: 0, y: 0, z: fin, w: 7, h: 1, d: 5, color: '#ffd23c', tipo: 'meta' });
  return crearCarrera(c, { bloques, inicio: [0, 0.1, 0.5], cielo: '#bfe8ff', abismo: '#3fa9d6', limite: 90, ritmo: 32, progreso: (_x, _y, z) => z / fin });
}

/** Rodillos del Volcán: una pasarela con barras que giran. Las bajas se saltan; desde el segundo tramo hay barras
 *  altas (naranjas) que se pasan agachado. A tiempo, o se sale volando. */
export function rodillos(c: Contexto): Promise<Partida> {
  const r = generador(c.semilla), bloques: Bloque[] = [], barras: Barra[] = [], TRAMO = 21, TRAMOS = 3;
  for (let i = 0; i < TRAMOS; i++) {
    const z0 = -i * (TRAMO + 2.2);
    bloques.push({ x: 0, y: 0, z: z0, w: 8, h: 1, d: 3, color: '#6b5a52', tipo: 'control' }, { x: 0, y: 0, z: z0 - 1.5 - (TRAMO - 3) / 2, w: 8, h: 1, d: TRAMO - 3, color: '#4a3f3a' });
    for (let b = 0; b < 3; b++) {
      const sentido = r() < 0.5 ? -1 : 1;
      barras.push({ x: (r() - 0.5) * 2, y: 0, z: z0 - 5 - b * 5.6, largo: 7.4, vel: sentido * (1.5 + i * 0.35 + r() * 0.4), fase: r() * 6.28, alta: i > 0 && r() < 0.45 });
    }
  }
  const fin = -TRAMOS * (TRAMO + 2.2);
  bloques.push({ x: 0, y: 0, z: fin - 1, w: 8, h: 1, d: 5, color: '#ffd23c', tipo: 'meta' });
  return crearCarrera(c, { bloques, barras, inicio: [0, 0.1, 0.6], cielo: '#3a2530', abismo: '#ff6a1e', limite: 90, ritmo: 30, progreso: (_x, _y, z) => z / fin });
}

/** Puertas Falsas: seis muros de cuatro puertas. Solo una o dos se abren; las demás son pared. Memoria y arrojo. */
export function puertas(c: Contexto): Promise<Partida> {
  const r = generador(c.semilla), bloques: Bloque[] = [], MUROS = 6, ENTRE = 7.5, ANCHO = 9.2, PUERTA = ANCHO / 4;
  const largo = MUROS * ENTRE + 6;
  bloques.push({ x: 0, y: 0, z: -largo / 2 + 3, w: ANCHO, h: 1, d: largo, color: '#3b2d5c' }, { x: 0, y: 0.02, z: 1, w: ANCHO, h: 1, d: 3, color: '#4a3a70', tipo: 'control' });
  for (let m = 0; m < MUROS; m++) {
    const z = -4 - m * ENTRE, buena = Math.floor(r() * 4), segunda = Math.floor(r() * 4), dosBuenas = m < Math.max(0, 3 - c.nivel);
    for (let i = 0; i < 4; i++) {
      const real = i === buena || (dosBuenas && i === segunda);
      bloques.push({ x: -ANCHO / 2 + PUERTA * (i + 0.5), y: 3.2, z, w: PUERTA - 0.06, h: 3.2, d: 0.45, color: i % 2 ? '#c79bff' : '#b58af0', tipo: real ? 'real' : 'falsa' });
    }
    // Pasado cada muro, un punto de control: lo aprendido no se pierde
    bloques.push({ x: 0, y: 0.02, z: z - 1.6, w: ANCHO, h: 1, d: 1.4, color: '#4a3a70', tipo: 'control' });
  }
  const fin = -largo + 5;
  bloques.push({ x: 0, y: 0.03, z: fin, w: ANCHO, h: 1, d: 3, color: '#ffd23c', tipo: 'meta' });
  return crearCarrera(c, { bloques, inicio: [0, 0.1, 1.2], cielo: '#1a1230', abismo: '#0b0718', limite: 75 - (c.nivel - 1) * 5, ritmo: 30, progreso: (_x, _y, z) => z / fin });
}

/** Sube la Lava: una escalera de plataformas sueltas y la lava subiendo cada vez más rápido. Sin segundas oportunidades.
 *  Algunas plataformas van y vienen de lado y otras (agrietadas, más oscuras) se desmoronan al pisarlas. */
export function lava(c: Contexto): Promise<Partida> {
  const r = generador(c.semilla), bloques: Bloque[] = [{ x: 0, y: 0, z: 0, w: 6, h: 1, d: 5, color: '#5a4a44' }], PELDANOS = 32, SUBE = 1.35;
  let x = 0;
  for (let i = 1; i <= PELDANOS; i++) {
    x = Math.max(-5.5, Math.min(5.5, x + (r() < 0.5 ? -1 : 1) * (1.6 + r() * 1.7)));
    const ancho = i % 8 === 0 ? 4.2 : 2.5 - Math.min(0.7, i * 0.02), descanso = i % 8 === 0, suerte = r();
    const mueve = !descanso && i > 4 && suerte < 0.25 ? { eje: 'x' as const, amp: 1.2, vel: 1.3, fase: r() * 6.28 } : undefined;
    const cae = !descanso && !mueve && i > 6 && suerte < 0.45;
    bloques.push({ x, y: i * SUBE, z: (r() - 0.5) * 2, w: ancho, h: 0.4, d: 2.4, color: descanso ? '#8a7a70' : cae ? '#4a3a34' : mueve ? '#9a6a52' : i % 2 ? '#6b5a52' : '#7a675d', tipo: cae ? 'cae' : undefined, mueve });
  }
  const cima = (PELDANOS + 1) * SUBE;
  bloques.push({ x, y: cima, z: 0, w: 5, h: 0.5, d: 4, color: '#ffd23c', tipo: 'meta' });
  return crearCarrera(c, { bloques, inicio: [0, 0.1, 0.5], lava: { desde: -6.5, vel: 0.5, acel: 0.009 }, cielo: '#2a1a1e', abismo: '#ff6a1e', limite: 80, ritmo: 38, progreso: (_x, y) => y / cima });
}
