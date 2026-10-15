import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearCarrera, type Barra, type Bloque } from './motor';

// Las dos carreras. Cada una arma su pista con la semilla del día: mismo recorrido para todos.


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

