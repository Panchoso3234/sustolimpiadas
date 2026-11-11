// Pruebas del motor de Wild Cards. Correr: node pruebas/wildcards-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularLiga } from '../src/juegos/liga';
import { PUNTOS_BASE } from '../src/juegos/puntos';
import { CARTAS, PROBABILIDADES, rarezasPara, rarezaPorAzar, calcularAjustes, duelosDelCruce, textosRevelacion, type DueloEquipo, type CartaJugada } from '../src/juegos/wildcards';

// Equipo 1 contra equipo 2. Helpers para armar duelos (rondas del ganador 2-0 salvo que se diga otra cosa).
let id = 0;
const gana1 = (rondas: [number, number] = [2, 0]): DueloEquipo => ({ id: ++id, a: 1, b: 2, ganador: 'a', noJugo: null, rondasA: rondas[0], rondasB: rondas[1] });
const gana2 = (rondas: [number, number] = [0, 2]): DueloEquipo => ({ id: ++id, a: 1, b: 2, ganador: 'b', noJugo: null, rondasA: rondas[0], rondasB: rondas[1] });
const empate = (): DueloEquipo => ({ id: ++id, a: 1, b: 2, ganador: 'empate', noJugo: null, rondasA: 1, rondasB: 1 });
const carta = (equipo: number, c: string, extra: Partial<CartaJugada> = {}): CartaJugada => ({ id: ++id, equipo, carta: c, ...extra });
const ajuste = (duelos: DueloEquipo[], cartas: CartaJugada[], mult = 1.5) => {
  const r = calcularAjustes(duelos, cartas, mult);
  return { e1: r.find((x) => x.equipo === 1)?.puntos ?? 0, e2: r.find((x) => x.equipo === 2)?.puntos ?? 0 };
};

test('catálogo: 25 cartas, 8 comunes, 7 raras, 6 épicas y 4 legendarias, sin ids repetidos', () => {
  const n = (r: string) => CARTAS.filter((c) => c.rareza === r).length;
  assert.equal(CARTAS.length, 25);
  assert.deepEqual([n('comun'), n('rara'), n('epica'), n('legendaria')], [8, 7, 6, 4]);
  assert.equal(new Set(CARTAS.map((c) => c.id)).size, 25);
});

test('probabilidades: cada grupo suma 100 y la legendaria respeta lo pedido por Pancho', () => {
  for (const g of PROBABILIDADES) assert.equal(g.comun + g.rara + g.epica + g.legendaria, 100);
  assert.deepEqual([1, 2, 3, 5, 6, 8, 9, 12].map((p) => rarezasPara(p).legendaria), [2, 2, 3, 3, 10, 10, 20, 20]);
});

test('la rareza por azar reparte exactamente según la tabla (misma regla que el SQL)', () => {
  for (const puesto of [1, 4, 7, 12]) {
    const cuenta = { comun: 0, rara: 0, epica: 0, legendaria: 0 };
    for (let i = 0; i < 10000; i++) cuenta[rarezaPorAzar(puesto, i / 100)]++; // r de 0 a 99,99 en pasos de 0,01
    const g = rarezasPara(puesto);
    assert.deepEqual(cuenta, { comun: g.comun * 100, rara: g.rara * 100, epica: g.epica * 100, legendaria: g.legendaria * 100 }, `puesto ${puesto}`);
  }
});

test('el catálogo del SQL es el mismo del motor (no se desincronizan)', () => {
  const sql = readFileSync(`${process.env.WC_RAIZ ?? '.'}/supabase/2026-11-11-wild-cards.sql`, 'utf8'); // WC_RAIZ: la pone wildcards-test.mjs
  for (const k of CARTAS) assert.ok(sql.includes(`('${k.id}', '${k.nombre.replace(/'/g, "''")}', '${k.emoji}', '${k.rareza}', '${k.tipo}', '${k.efecto.replace(/'/g, "''")}')`), k.id);
  for (const g of PROBABILIDADES) assert.ok(sql.includes(`(${g.desde}, ${g.hasta}, ${g.comun}, ${g.rara}, ${g.epica}, ${g.legendaria})`), `grupo ${g.desde}`);
});

test('sin cartas no cambia nada', () => assert.deepEqual(ajuste([gana1(), gana2(), gana1()], []), { e1: 0, e2: 0 }));

test('Escudo de Arena: +1 base por derrota, por el multiplicador', () => {
  assert.equal(ajuste([gana2(), gana2(), gana1()], [carta(1, 'escudo')]).e1, 3); // 2 derrotas × 1 × 1,5
  assert.equal(ajuste([gana2(), gana2(), gana1()], [carta(1, 'escudo')], 2).e1, 4);
});

test('una derrota por no presentarse no la salva el Escudo', () => {
  const d: DueloEquipo = { id: ++id, a: 1, b: 2, ganador: 'b', noJugo: 'a', rondasA: 0, rondasB: 0 };
  assert.equal(ajuste([d], [carta(1, 'escudo')]).e1, 0);
});

test('La Hinchada: +1 por duelo ganado', () => assert.equal(ajuste([gana1(), gana1(), gana2()], [carta(1, 'hinchada')]).e1, 3));

test('Premio de Consuelo: +3 solo si gana 0 o 1 duelo', () => {
  assert.equal(ajuste([gana1(), gana2(), gana2()], [carta(1, 'consuelo')]).e1, 4.5);
  assert.equal(ajuste([gana1(), gana1(), gana2()], [carta(1, 'consuelo')]).e1, 0);
});

test('Dado de la Suerte: suma lo que salió en el dado', () => assert.equal(ajuste([gana2()], [carta(1, 'dado', { dado: 4 })]).e1, 6));

test('Bebida Energética: +2 si gana al menos un duelo', () => {
  assert.equal(ajuste([gana1(), gana1()], [carta(1, 'bebida')]).e1, 3);
  assert.equal(ajuste([gana2()], [carta(1, 'bebida')]).e1, 0);
});

test('Por un Pelo: +1 por cada duelo ganado 2-1', () => assert.equal(ajuste([gana1([2, 1]), gana1([2, 0]), gana2()], [carta(1, 'pelo')]).e1, 1.5));

test('cartas de decisión sin puntos no suman nada', () => {
  for (const c of ['cancha', 'segunda', 'cambio_rivales', 'revancha', 'ruleta', 'doble_carta']) assert.equal(ajuste([gana1()], [carta(1, c)]).e1, 0, c);
});

test('Doble o Nada: el duelo marcado ganado vale doble; perdido vale 0', () => {
  const g = gana1(), p = gana2();
  assert.equal(ajuste([g, p], [carta(1, 'doble_nada', { duelo: g.id })]).e1, 10.5); // +7 × 1,5
  assert.equal(ajuste([g, p], [carta(1, 'doble_nada', { duelo: p.id })]).e1, -6); // −4 × 1,5
});

test('La Muralla: cada derrota vale como empate', () => assert.equal(ajuste([gana2(), gana2(), gana2()], [carta(1, 'muralla')]).e1, 9));

test('Imán: +2 por duelo ganado', () => assert.equal(ajuste([gana1(), gana2()], [carta(1, 'iman')]).e1, 3));

test('Barrida: +8 solo con 3 de 3', () => {
  assert.equal(ajuste([gana1(), gana1(), gana1()], [carta(1, 'barrida')]).e1, 12);
  assert.equal(ajuste([gana1(), gana1(), gana2()], [carta(1, 'barrida')]).e1, 0);
});

test('Trampa: el rival pierde 1 por cada duelo que pierde contra este equipo', () => assert.deepEqual(ajuste([gana1(), gana1(), gana2()], [carta(1, 'trampa')]), { e1: 0, e2: -3 }));

test('En Racha: los puntos del cruce ×1,25 (incluido el bono)', () => {
  // 3 victorias: 21 + bono 5 = 26 base → +6,5 base → × 1,5 = 9,75
  assert.equal(ajuste([gana1(), gana1(), gana1()], [carta(1, 'racha')]).e1, 9.75);
});

test('Contraataque: −2 al rival por cada duelo ganado', () => assert.equal(ajuste([gana1(), gana1(), gana2()], [carta(1, 'contraataque')]).e2, -6));

test('Sed de Sangre: +6 si gana la serie', () => {
  assert.equal(ajuste([gana1(), gana1(), gana2()], [carta(1, 'sed')]).e1, 9);
  assert.equal(ajuste([gana1(), gana2(), gana2()], [carta(1, 'sed')]).e1, 0);
});

test('Congelar anula la carta del rival, pero no una legendaria', () => {
  assert.equal(ajuste([gana2(), gana2(), gana2()], [carta(1, 'congelar'), carta(2, 'barrida')]).e2, 0);
  assert.ok(ajuste([gana2(), gana2(), gana2()], [carta(1, 'congelar'), carta(2, 'corona')]).e2 > 0);
});

test('Congelar también anula las cartas que salieron de una Doble Carta del rival', () => {
  const madre = carta(2, 'doble_carta');
  assert.equal(ajuste([gana2(), gana2()], [carta(1, 'congelar'), madre, carta(2, 'iman', { origen: madre.id })]).e2, 0);
});

test('dos Congelar se anulan entre sí', () => assert.deepEqual(ajuste([gana1()], [carta(1, 'congelar'), carta(2, 'congelar')]), { e1: 0, e2: 0 }));

test('La Corona: los puntos del cruce ×1,5', () => {
  // 1 victoria y 2 derrotas: 7 + 4 + 4 = 15 → +7,5 base → × 1,5 = 11,25
  assert.equal(ajuste([gana1(), gana2(), gana2()], [carta(1, 'corona')]).e1, 11.25);
});

test('Agujero Negro: +3 propio y −3 al rival por cada duelo ganado', () => assert.deepEqual(ajuste([gana1(), gana1(), gana2()], [carta(1, 'agujero')]), { e1: 9, e2: -9 }));

test('Cambio de Órbita: si el rival hizo más, se intercambian los totales', () => {
  // equipo 1: 4+4+4 = 12; equipo 2: 7+7+7+5 = 26 → diferencia 14 × 1,5 = 21
  assert.deepEqual(ajuste([gana2(), gana2(), gana2()], [carta(1, 'orbita')]), { e1: 21, e2: -21 });
  assert.deepEqual(ajuste([gana1(), gana1(), gana1()], [carta(1, 'orbita')]), { e1: 0, e2: 0 });
});

test('dos Cambio de Órbita se cancelan', () => assert.deepEqual(ajuste([gana2(), gana2()], [carta(1, 'orbita'), carta(2, 'orbita')]), { e1: 0, e2: 0 }));

test('Mano de Dios: +4 y además la carta elegida', () => {
  const madre = carta(1, 'mano');
  assert.equal(ajuste([gana1(), gana2()], [madre, carta(1, 'iman', { origen: madre.id })]).e1, 9); // (4 + 2) × 1,5
});

test('la carta elegida con Mano de Dios no se puede congelar', () => {
  const madre = carta(1, 'mano');
  assert.equal(ajuste([gana1(), gana2()], [carta(2, 'congelar'), madre, carta(1, 'iman', { origen: madre.id })]).e1, 9);
});

test('un robo nunca deja al rival bajo 0 puntos en el cruce', () => {
  // equipo 2 no se presentó a nada: 0 puntos; el Agujero Negro no le puede quitar más
  const d = (): DueloEquipo => ({ id: ++id, a: 1, b: 2, ganador: 'a', noJugo: 'b', rondasA: 0, rondasB: 0 });
  assert.equal(ajuste([d(), d(), d()], [carta(1, 'agujero')]).e2, 0);
});

test('una carta anulada por Pancho no hace nada', () => assert.equal(ajuste([gana1()], [carta(1, 'iman', { anulada: true })]).e1, 0));

test('un empate cuenta como empate para todas las cartas (no es victoria ni derrota)', () => {
  assert.equal(ajuste([empate()], [carta(1, 'escudo'), carta(2, 'hinchada')]).e1, 0);
  assert.equal(ajuste([empate()], [carta(1, 'escudo'), carta(2, 'hinchada')]).e2, 0);
});

test('equipos que no tienen cartas de otro enfrentamiento no se ven afectados', () => {
  const otro: DueloEquipo = { id: ++id, a: 3, b: 4, ganador: 'a', noJugo: null, rondasA: 2, rondasB: 0 };
  const r = calcularAjustes([gana1(), otro], [carta(1, 'agujero')], 1.5);
  assert.equal(r.find((x) => x.equipo === 4)?.puntos ?? 0, 0);
});

test('duelosDelCruce: arma los duelos de equipo del cruce, con ausencias y sin amistosos ni otros cruces', () => {
  const equipoDe = new Map([['p1', 10], ['p2', 20], ['p3', 10]]);
  const base = { modo: '1v1', oficial: true, estado: 'cerrado', no_jugo: null } as const;
  const r = duelosDelCruce(8, [
    { ...base, id: 1, cruce: 8, a_perfil: 'p1', b_perfil: 'p2', ganador: 'a', puntos_a: 2, puntos_b: 1 },
    { ...base, id: 2, cruce: 7, a_perfil: 'p3', b_perfil: 'p2', ganador: 'a', puntos_a: 2, puntos_b: 0 },
    { ...base, id: 3, cruce: 8, a_perfil: 'p3', b_perfil: 'p2', ganador: 'b', puntos_a: 0, puntos_b: 2, oficial: false },
    { ...base, id: 4, cruce: 8, a_perfil: 'p3', b_perfil: 'p2', ganador: null, puntos_a: 0, puntos_b: 0, estado: 'pendiente' },
  ], equipoDe, [{ id: 9, cruce: 8, perfil_id: 'p3', equipo_rival: 20 }]);
  assert.deepEqual(r, [
    { id: 1, a: 10, b: 20, ganador: 'a', noJugo: null, rondasA: 2, rondasB: 1 },
    { id: -9, a: 10, b: 20, ganador: 'a', noJugo: 'b', rondasA: 0, rondasB: 0 },
  ]);
});

test('la tabla de la web suma los puntos revelados de las cartas en su jornada (cruce 8 → jornada 3)', () => {
  const equipos = [{ id: 1, nombre: 'Uno', miembros: ['p1'], capitan: null }, { id: 2, nombre: 'Dos', miembros: ['p2'], capitan: null }] as unknown as Parameters<typeof calcularLiga>[0];
  const { tabla } = calcularLiga(equipos, [], [], PUNTOS_BASE, [], [{ cruce: 8, equipo_id: 2, puntos: 9 }, { cruce: 8, equipo_id: 1, puntos: -4.5 }]);
  const dos = tabla.find((l) => l.equipo.id === 2)!, uno = tabla.find((l) => l.equipo.id === 1)!;
  assert.equal(dos.puntos, 9); assert.equal(dos.cartas, 9); assert.equal(dos.porJornada[2], 9);
  assert.equal(uno.puntos, -4.5); assert.equal(tabla[0].equipo.id, 2);
});

test('textosRevelacion: un mensaje por partes de menos de 1.900 caracteres, con cada equipo, su carta y sus puntos', () => {
  const nombres = new Map(Array.from({ length: 12 }, (_, i) => [i + 1, `Equipo número ${i + 1} con nombre largo`]));
  const cartas = Array.from({ length: 12 }, (_, i) => ({ equipo: i + 1, carta: CARTAS[i * 2].id, rareza: CARTAS[i * 2].rareza }));
  const ajustes = cartas.map((x) => ({ equipo: x.equipo, puntos: -4.5 + x.equipo, detalle: ['🧲 Imán: +2 base', '🪤 Trampa del rival: −1 base', 'línea larga '.repeat(8)] }));
  const textos = textosRevelacion(8, cartas, ajustes, nombres);
  assert.ok(textos.length >= 2, 'con 12 equipos y detalle no cabe en uno');
  for (const t of textos) assert.ok(t.length <= 1900, `largo ${t.length}`);
  const todo = textos.join('\n');
  for (const n of nombres.values()) assert.ok(todo.includes(n), n);
  assert.match(textos[0], /CRUCE 8/);
  assert.match(todo, /\+7,5/); // 12 − 4,5 en formato chileno
});

test('cada ajuste trae el detalle de qué carta lo produjo', () => {
  const r = calcularAjustes([gana1()], [carta(1, 'iman')], 1.5);
  assert.match(r.find((x) => x.equipo === 1)!.detalle.join(' '), /Imán/);
});
