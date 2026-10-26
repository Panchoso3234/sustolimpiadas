import type { Lado, Reglas } from '../tablero';
import { parejas } from './parejas';
import { eco, finMuestra, plazoEco, secuenciaEco } from './eco';
import { cofre, cofresVivo } from './cofre';
import { conecta4, TURNO as TURNO_C4 } from './conecta4';
import { battleship, UBICAR as UBICAR_BS } from './battleship';
import { repartirFlota } from '../reglas';

// Los juegos de mesa que se juegan en vivo. La clave es el id del juego (el mismo de su foto y de su versus).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TABLEROS: Record<string, Reglas<any>> = { parejas, eco, cofre, conchas: conecta4, balsas: battleship };

/** Pruebas de las reglas de los tableros: devuelve la lista de fallas. */
export function probarTableros(): string[] {
  const fallas: string[] = [], igual = (que: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) fallas.push(`${que}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  // Parejas
  let p = parejas.inicial('prueba', 1);
  const par = (f: string) => p.cartas.map((x, i) => (x === f ? i : -1)).filter((i) => i >= 0);
  const [x, y] = par(p.cartas.find((f) => f !== 'medusa')!);
  igual('parejas: no es tu turno', parejas.accion(p, { i: x }, 'b', 1), null);
  p = parejas.accion(p, { i: x }, 'a', 1)!; p = parejas.accion(p, { i: y }, 'a', 1.5)!;
  igual('parejas: acierto suma y sigue el turno', [p.puntos.a, p.turno], [1, 'a']);
  const otraFigura = p.cartas.find((f, i) => f !== 'medusa' && !p.duenas[i] && f !== p.cartas[x])!, [u] = par(otraFigura), v = p.cartas.findIndex((f, i) => f !== 'medusa' && f !== otraFigura && !p.duenas[i]);
  p = parejas.accion(p, { i: u }, 'a', 2)!; p = parejas.accion(p, { i: v }, 'a', 2.2)!;
  igual('parejas: fallo espera antes de pasar', p.turno, 'a');
  igual('parejas: tocar mientras se tapan no vale', parejas.accion(p, { i: x }, 'a', 2.5), null);
  p = parejas.tic!(p, 3.5)!;
  igual('parejas: tras el fallo pasa el turno', [p.turno, p.abiertas.length], ['b', 0]);
  const m = p.cartas.indexOf('medusa');
  p = parejas.accion(p, { i: m }, 'b', 4)!;
  igual('parejas: la medusa resta y pasa el turno', [p.puntos.b, p.turno], [-1, 'a']);
  igual('parejas: estado roto no vale', parejas.valido({ cartas: 'x' }), false);
  // Eco
  let ec = eco.inicial('prueba', 1);
  const sec = secuenciaEco('prueba');
  igual('eco: mientras se muestra no se toca', eco.accion(ec, { i: sec[0] }, 'a', 0.1), null);
  ec = eco.accion(ec, { i: sec[0] }, 'a', finMuestra(ec) + 0.1)!;
  igual('eco: tras repetir A, le toca a B con la misma secuencia', [ec.turno, ec.largo], ['b', 1]);
  ec = eco.accion(ec, { i: sec[0] }, 'b', finMuestra(ec) + 0.1)!;
  igual('eco: tras los dos, la secuencia crece y vuelve A', [ec.turno, ec.largo], ['a', 2]);
  ec = eco.accion(ec, { i: (sec[0] + 1) % 6 }, 'a', finMuestra(ec) + 0.1)!;
  igual('eco: equivocarse termina', [ec.perdio, eco.marcador(ec, 30).fin], ['a', true]);
  // Cofre
  igual('cofre: plantarse sin monedas no se puede', cofre.accion(cofre.inicial('prueba', 1), { elige: 'plantar' }, 'a', 1), null);
  let co = cofre.accion(cofre.inicial('prueba', 1), { elige: 'sacar' }, 'a', 1)!;
  igual('cofre: se espera al otro', co.revela, 0);
  co = cofre.accion(co, { elige: 'sacar' }, 'b', 1.2)!;
  const ola0 = cofresVivo('prueba')[0].ola === 0;
  igual('cofre: se revela y suman los dos (o se los lleva la ola)', [co.mano.a > 0 || ola0, co.revela > 0], [true, true]);
  igual('cofre: cambiar de elección en la pausa no vale', cofre.accion(co, { elige: 'sacar' }, 'a', 1.3), null);
  igual('cofre: quien no elige a tiempo, sin monedas, saca', cofre.tic!(cofre.inicial('prueba', 1), 13)!.revela > 0, true);
  igual('eco: quien no repite a tiempo pierde', eco.tic!(eco.inicial('x', 1), plazoEco(eco.inicial('x', 1)) + 0.1)?.perdio, 'a');
  igual('cofre: un cofre fuera de rango no vale', cofre.valido({ ...cofre.inicial('x', 1), cofre: -2 }), false);
  // CONECTA4
  let c4 = { ...conecta4.inicial('prueba', 1), popout: false };
  igual('conecta4: no es tu turno', conecta4.accion(c4, { j: 3 }, 'b', 1), null);
  for (const [j, l, t] of [[0, 'a', 1], [1, 'b', 2], [0, 'a', 3], [1, 'b', 4], [0, 'a', 5], [1, 'b', 6]] as [number, Lado, number][]) c4 = conecta4.accion(c4, { j }, l, t)!;
  igual('conecta4: sacar sin Pop Out no vale', conecta4.accion(c4, { j: 7 }, 'a', 7), null);
  c4 = conecta4.accion(c4, { j: 0 }, 'a', 7)!;
  igual('conecta4: cuatro en línea gana', conecta4.marcador(c4, 7), { a: 2, b: 0, fin: true });
  igual('conecta4: el reloj juega solo al centro', conecta4.tic!(conecta4.inicial('prueba', 1), TURNO_C4 + 0.1)!.jugadas, [3]);
  // Battleship
  let bs = battleship.inicial('prueba', 1);
  const flotaA = repartirFlota(), flotaB = repartirFlota();
  igual('battleship: flota inválida no vale', battleship.accion(bs, { flota: [{ casillas: [0, 1] }] }, 'a', 1), null);
  bs = battleship.accion(bs, { flota: flotaA }, 'a', 1)!;
  bs = battleship.accion(bs, { flota: flotaB }, 'b', 2)!;
  igual('battleship: empieza a', [bs.turno, bs.quedan], ['a', bs.salvo ? 5 : 1]);
  bs = battleship.accion(bs, { radar: 44 }, 'a', 3)!;
  igual('battleship: radar una vez', [bs.radar.a !== null, battleship.accion(bs, { radar: 45 }, 'a', 3)], [true, null]);
  bs = { ...bs, salvo: false, quedan: 1 };
  for (const i of flotaB.flatMap((b) => b.casillas)) { if (bs.turno === 'b') bs = battleship.accion(bs, { i: bs.tiros.b.length }, 'b', 4)!; bs = battleship.accion(bs, { i }, 'a', 4)!; }
  igual('battleship: hundir todo gana', battleship.marcador(bs, 5), { a: 117, b: bs.tiros.b.filter((i) => flotaA.some((b) => b.casillas.includes(i))).length, fin: true });
  const bsUb = battleship.tic!(battleship.inicial('prueba', 1), UBICAR_BS + 0.1)!;
  igual('battleship: sin ubicar a tiempo se reparte sola', [!!bsUb.flotas.a, !!bsUb.flotas.b], [true, true]);
  return fallas;
}
