// Pruebas del motor de Wild Cards 2.0. Correr: node pruebas/wildcards-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularLiga } from '../src/juegos/liga';
import { PUNTOS_BASE } from '../src/juegos/puntos';
import { CARTAS, PROBABILIDADES, RETIRADAS, TECHO, TIRADAS, rarezasPara, rarezaPorAzar, calcularAjustes, duelosDelCruce, textosRevelacion, type DueloEquipo, type CartaJugada } from '../src/juegos/wildcards';

// Equipo 1 contra equipo 2. Helpers para armar duelos (rondas del ganador 2-0 salvo que se diga otra cosa).
let id = 0;
const gana1 = (rondas: [number, number] = [2, 0], extra: Partial<DueloEquipo> = {}): DueloEquipo => ({ id: ++id, a: 1, b: 2, ganador: 'a', noJugo: null, rondasA: rondas[0], rondasB: rondas[1], ...extra });
const gana2 = (rondas: [number, number] = [0, 2], extra: Partial<DueloEquipo> = {}): DueloEquipo => ({ id: ++id, a: 1, b: 2, ganador: 'b', noJugo: null, rondasA: rondas[0], rondasB: rondas[1], ...extra });
const empate = (): DueloEquipo => ({ id: ++id, a: 1, b: 2, ganador: 'empate', noJugo: null, rondasA: 1, rondasB: 1 });
const carta = (equipo: number, c: string, extra: Partial<CartaJugada> = {}): CartaJugada => ({ id: ++id, equipo, carta: c, ...extra });
/** Puntos de cada equipo (con multiplicador 1, salvo que se diga otro: así se leen en puntos base). */
const ajuste = (duelos: DueloEquipo[], cartas: CartaJugada[], mult = 1) => {
  const r = calcularAjustes(duelos, cartas, mult);
  return { e1: r.find((x) => x.equipo === 1)?.puntos ?? 0, e2: r.find((x) => x.equipo === 2)?.puntos ?? 0 };
};
const p1 = (duelos: DueloEquipo[], c: string, extra: Partial<CartaJugada> = {}) => ajuste(duelos, [carta(1, c, extra)]).e1;

// ───────── Catálogo ─────────
test('catálogo: 64 cartas (24 comunes, 18 raras, 11 épicas y 11 legendarias), sin ids repetidos ni Cambio de Órbita', () => {
  const n = (r: string) => CARTAS.filter((c) => c.rareza === r).length;
  assert.equal(CARTAS.length, 64);
  assert.deepEqual([n('comun'), n('rara'), n('epica'), n('legendaria')], [24, 18, 11, 11]);
  assert.equal(new Set(CARTAS.map((c) => c.id)).size, 64);
  assert.ok(!CARTAS.some((c) => c.id === 'orbita'));
  assert.deepEqual(RETIRADAS, ['orbita']);
  for (const c of CARTAS) assert.match(c.id, /^[a-z_]{2,20}$/, c.id);
  for (const c of CARTAS) assert.ok(c.efecto.length <= 200 && c.nombre.length <= 40, c.id);
});

test('como mucho 8 cartas de decisión', () => assert.equal(CARTAS.filter((c) => c.tipo === 'decision').length, 8));

test('probabilidades: cada grupo suma 100 y la legendaria es 2, 5, 16 y 28 %', () => {
  for (const g of PROBABILIDADES) assert.equal(g.comun + g.rara + g.epica + g.legendaria, 100);
  assert.deepEqual([1, 2, 3, 5, 6, 8, 9, 12].map((p) => rarezasPara(p).legendaria), [2, 2, 5, 5, 16, 16, 28, 28]);
});

test('la rareza por azar reparte exactamente según la tabla (misma regla que el SQL)', () => {
  for (const puesto of [1, 4, 7, 12]) {
    const cuenta = { comun: 0, rara: 0, epica: 0, legendaria: 0 };
    for (let i = 0; i < 10000; i++) cuenta[rarezaPorAzar(puesto, i / 100)]++;
    const g = rarezasPara(puesto);
    assert.deepEqual(cuenta, { comun: g.comun * 100, rara: g.rara * 100, epica: g.epica * 100, legendaria: g.legendaria * 100 }, `puesto ${puesto}`);
  }
});

test('el catálogo del SQL 2.0 es el mismo del motor (no se desincronizan)', () => {
  const sql = readFileSync(`${process.env.WC_RAIZ ?? '.'}/supabase/2026-11-12-wild-cards-2.sql`, 'utf8');
  const q = (s: string) => s.replace(/'/g, "''");
  for (const k of CARTAS) assert.ok(sql.includes(`('${k.id}', '${q(k.nombre)}', '${k.emoji}', '${k.rareza}', '${k.tipo}', '${q(k.efecto)}')`), k.id);
  for (const g of PROBABILIDADES) assert.ok(sql.includes(`(${g.desde}, ${g.hasta}, ${g.comun}, ${g.rara}, ${g.epica}, ${g.legendaria})`), `grupo ${g.desde}`);
  for (const [k, [a, b]] of Object.entries(TIRADAS)) assert.ok(sql.includes(`when '${k}' then ${a} +`) && sql.includes(`-- ${k}: ${a} a ${b}`), `tirada ${k}`);
});

// ───────── Techos: ninguna carta pasa el máximo de su rareza ─────────
test('ninguna carta de puntos pasa el techo de su rareza, en todos los resultados posibles', () => {
  const res = ['v21', 'v20', 'e', 'd12', 'd02', 'nj'] as const;
  const duelo = (r: (typeof res)[number], i: number): DueloEquipo => {
    const base = { id: 1000 + i, a: 1, b: 2, noJugo: null, antes: i % 2 === 0, orden: i, sumaA: r.startsWith('d') ? 900 : 100, sumaB: 500 } as const;
    if (r === 'v21') return { ...base, ganador: 'a', rondasA: 2, rondasB: 1 };
    if (r === 'v20') return { ...base, ganador: 'a', rondasA: 2, rondasB: 0 };
    if (r === 'e') return { ...base, ganador: 'empate', rondasA: 1, rondasB: 1 };
    if (r === 'd12') return { ...base, ganador: 'b', rondasA: 1, rondasB: 2 };
    if (r === 'd02') return { ...base, ganador: 'b', rondasA: 0, rondasB: 2 };
    return { ...base, ganador: 'b', noJugo: 'a', rondasA: 0, rondasB: 0 };
  };
  const sinTope = new Set(['racha', 'corona', 'trampa', 'contraataque', 'ruleta', 'doble_carta', 'congelar']);
  for (const k of CARTAS.filter((x) => !sinTope.has(x.id))) {
    let maximo = 0;
    for (const a of res) for (const b of res) for (const c of res) {
      const ds = [duelo(a, 0), duelo(b, 1), duelo(c, 2)];
      const [mn, mx] = TIRADAS[k.id] ?? [0, 0];
      for (const dado of [mn, mx]) for (const puesto of [1, 12]) {
        const extra: Partial<CartaJugada> = { dado, puesto, duelo: 1000, duelos: [1000, 1001] };
        // El robo del Agujero Negro va al rival; aquí se mira solo lo que suma el propio equipo
        maximo = Math.max(maximo, ajuste(ds, [carta(1, k.id, extra), carta(2, 'boleto', { puesto: 1 })]).e1);
      }
    }
    assert.ok(maximo <= TECHO[k.rareza], `${k.nombre}: ${maximo} > ${TECHO[k.rareza]}`);
  }
});

// ───────── Una prueba por carta ─────────
test('sin cartas no cambia nada', () => assert.deepEqual(ajuste([gana1(), gana2(), gana1()], []), { e1: 0, e2: 0 }));
test('el multiplicador de la jornada se aplica al final', () => {
  assert.equal(p1([gana2(), gana2()], 'escudo'), 4);
  assert.equal(ajuste([gana2(), gana2()], [carta(1, 'escudo')], 2).e1, 8);
});
test('Escudo de Arena: +2 por derrota; no salva la ausencia', () => {
  assert.equal(p1([gana2(), gana2(), gana1()], 'escudo'), 4);
  assert.equal(p1([{ ...gana2(), noJugo: 'a' }], 'escudo'), 0);
});
test('La Hinchada: +2 por duelo ganado', () => assert.equal(p1([gana1(), gana1(), gana2()], 'hinchada'), 4));
test('Premio de Consuelo: +5 solo si gana 0 o 1', () => { assert.equal(p1([gana1(), gana2(), gana2()], 'consuelo'), 5); assert.equal(p1([gana1(), gana1()], 'consuelo'), 0); });
test('Dado de la Suerte: suma la tirada', () => assert.equal(p1([gana2()], 'dado', { dado: 6 }), 6));
test('Bebida Energética: +3 si gana al menos uno', () => { assert.equal(p1([gana1(), gana2()], 'bebida'), 3); assert.equal(p1([gana2()], 'bebida'), 0); });
test('Por un Pelo: +2 por cada victoria 2-1', () => assert.equal(p1([gana1([2, 1]), gana1([2, 0]), gana2()], 'pelo'), 2));
test('cartas de decisión sin puntos no suman nada', () => { for (const k of ['cancha', 'segunda', 'cambio_rivales', 'revancha', 'bis']) assert.equal(p1([gana1(), gana1()], k), 0, k); });
test('Moneda al Aire: cara (2) da +6, sello (1) nada', () => { assert.equal(p1([gana2()], 'moneda', { dado: 2 }), 6); assert.equal(p1([gana2()], 'moneda', { dado: 1 }), 0); });
test('Madrugador: +2 por duelo que terminó antes del último día', () => assert.equal(p1([gana1(undefined, { antes: true }), gana2(undefined, { antes: true }), gana1()], 'madrugador'), 4));
test('Pacto de Caballeros: +3 por empate, máximo +6', () => { assert.equal(p1([empate(), gana1()], 'caballeros'), 3); assert.equal(p1([empate(), empate(), empate()], 'caballeros'), 6); });
test('Ronda de Honor: +2 por ronda ganada en duelos perdidos, máximo +6', () => { assert.equal(p1([gana2([1, 2]), gana2([1, 2]), gana1()], 'honor'), 4); assert.equal(p1([gana2([1, 2]), gana2([1, 2]), gana2([1, 2]), gana2([1, 2])], 'honor'), 6); });
test('Tres Mosqueteros: +5 si los 3 juegan', () => { assert.equal(p1([gana1(), gana2(), empate()], 'mosqueteros'), 5); assert.equal(p1([gana1(), gana2(), { ...gana2(), noJugo: 'a' }], 'mosqueteros'), 0); });
test('Calentamiento: +3 si no pierde ningún 0-2', () => { assert.equal(p1([gana2([1, 2]), gana1()], 'calentamiento'), 3); assert.equal(p1([gana2([0, 2])], 'calentamiento'), 0); });
test('Boleto de Entrada: +3 siempre', () => assert.equal(p1([gana2(), gana2()], 'boleto'), 3));
test('Amuleto: +3 si pierde la serie', () => { assert.equal(p1([gana2(), gana2(), gana1()], 'amuleto'), 3); assert.equal(p1([gana1(), gana1(), gana2()], 'amuleto'), 0); });
test('Primer Golpe y Cierre de Oro: ganar el primer o el último duelo del cruce en cerrarse', () => {
  const ds = [gana1(undefined, { orden: 0 }), gana2(undefined, { orden: 1 }), gana1(undefined, { orden: 2 })];
  assert.equal(p1(ds, 'primer_golpe'), 3); assert.equal(p1(ds, 'cierre_oro'), 3);
  assert.equal(p1([gana2(undefined, { orden: 0 }), gana1(undefined, { orden: 1 })], 'primer_golpe'), 0);
});
test('Paciencia: +2 por duelo a 3 rondas', () => assert.equal(p1([gana1([2, 1]), gana2([1, 2]), gana1([2, 0])], 'paciencia'), 4));
test('Pancarta: +2 por victoria 2-0', () => assert.equal(p1([gana1([2, 0]), gana1([2, 1])], 'pancarta'), 2));
test('Libreta de Récords: +2 por derrota con más puntaje de juego', () => assert.equal(p1([gana2(undefined, { sumaA: 900, sumaB: 500 }), gana2(undefined, { sumaA: 100, sumaB: 500 })], 'libreta'), 2));
test('Abrazo de Grupo: +5 con 1 victoria, 1 empate y 1 derrota', () => { assert.equal(p1([gana1(), empate(), gana2()], 'abrazo'), 5); assert.equal(p1([gana1(), gana1(), gana2()], 'abrazo'), 0); });
test('Sorteo Chico: +6 si el dado sale 5 o 6', () => { assert.equal(p1([gana2()], 'sorteo_chico', { dado: 5 }), 6); assert.equal(p1([gana2()], 'sorteo_chico', { dado: 4 }), 0); });
test('Último Aliento y Fénix: solo si pierde los 3', () => {
  assert.equal(p1([gana2(), gana2(), gana2()], 'ultimo_aliento'), 6); assert.equal(p1([gana2(), gana2(), gana2()], 'fenix'), 20);
  assert.equal(p1([gana2(), gana2(), gana1()], 'fenix'), 0);
});
test('Doble o Nada: ganado +14, perdido vale 0 (−4), empate nada', () => {
  const g = gana1(), p = gana2(), e = empate();
  assert.equal(p1([g, p], 'doble_nada', { duelo: g.id }), 14);
  assert.equal(p1([g, p], 'doble_nada', { duelo: p.id }), -4);
  assert.equal(p1([e], 'doble_nada', { duelo: e.id }), 0);
});
test('La Muralla: +4 por derrota', () => assert.equal(p1([gana2(), gana2(), gana2()], 'muralla'), 12));
test('Imán: +4 por victoria', () => assert.equal(p1([gana1(), gana2()], 'iman'), 4));
test('Barrida: +14 solo con 3 de 3', () => { assert.equal(p1([gana1(), gana1(), gana1()], 'barrida'), 14); assert.equal(p1([gana1(), gana1(), gana2()], 'barrida'), 0); });
test('Trampa: el rival pierde 2 por cada duelo que pierde contra este equipo', () => assert.deepEqual(ajuste([gana1(), gana1(), gana2()], [carta(1, 'trampa')]), { e1: 0, e2: -4 }));
test('Dado Grande, Caja Misteriosa: suman la tirada', () => { assert.equal(p1([gana2()], 'dado_grande', { dado: 12 }), 12); assert.equal(p1([gana2()], 'caja', { dado: 14 }), 14); });
test('Remontada: +4 por victoria solo del puesto 7 hacia abajo', () => { assert.equal(p1([gana1(), gana1()], 'remontada', { puesto: 7 }), 8); assert.equal(p1([gana1(), gana1()], 'remontada', { puesto: 6 }), 0); });
test('Ola de Rondas: +2 por ronda ganada, máximo +12', () => { assert.equal(p1([gana1([2, 1]), gana2([1, 2])], 'ola'), 6); assert.equal(p1([gana1(), gana1(), gana1(), gana1()], 'ola'), 12); });
test('Fortaleza: +12 si no pierde ninguno', () => { assert.equal(p1([gana1(), empate(), gana1()], 'fortaleza'), 12); assert.equal(p1([gana1(), gana2()], 'fortaleza'), 0); });
test('Seguro de Vida: +10 si pierde la serie', () => assert.equal(p1([gana2(), gana2()], 'seguro'), 10));
test('Tic-Tac: +4 por duelo terminado antes del último día', () => assert.equal(p1([gana1(undefined, { antes: true }), gana2(undefined, { antes: true }), gana2()], 'tictac'), 8));
test('Golpe de Mesa: +4 por victoria 2-0', () => assert.equal(p1([gana1([2, 0]), gana1([2, 0]), gana1([2, 1])], 'golpe_mesa'), 8));
test('Espejo: copia la común o rara del rival; si no puede, +6', () => {
  assert.deepEqual(ajuste([gana1(), gana1(), gana2()], [carta(1, 'espejo'), carta(2, 'iman')]), { e1: 8, e2: 4 });
  assert.equal(ajuste([gana1()], [carta(1, 'espejo'), carta(2, 'sed')]).e1, 6);
  assert.equal(ajuste([gana1()], [carta(1, 'espejo')]).e1, 6);
  assert.equal(ajuste([gana1()], [carta(1, 'espejo'), carta(2, 'espejo')]).e1, 6);
});
test('Comodín: se vuelve la común que más le habría dado', () => {
  assert.equal(p1([gana1(), gana1(), gana1()], 'comodin'), 6); // La Hinchada: 3 × 2
  assert.equal(p1([gana2(), gana2(), gana2()], 'comodin'), 6); // Escudo o Último Aliento
});
test('En Racha: los puntos del cruce ×1,25 (incluido el bono)', () => assert.equal(p1([gana1(), gana1(), gana2()], 'racha'), 5.75)); // (7+7+4+5) × 0,25
test('Contraataque: −5 al rival por cada duelo ganado', () => assert.equal(ajuste([gana1(), gana1(), gana2()], [carta(1, 'contraataque')]).e2, -10));
test('Sed de Sangre: +15 si gana la serie', () => { assert.equal(p1([gana1(), gana1(), gana2()], 'sed'), 15); assert.equal(p1([gana1(), gana2()], 'sed'), 0); });
test('Congelar anula la carta del rival, pero no una legendaria; dos Congelar se anulan', () => {
  assert.equal(ajuste([gana2()], [carta(1, 'congelar'), carta(2, 'iman')]).e2, 0);
  assert.equal(ajuste([gana2()], [carta(1, 'congelar'), carta(2, 'supernova')]).e2, 21);
  assert.deepEqual(ajuste([gana1()], [carta(1, 'congelar'), carta(1, 'iman'), carta(2, 'congelar'), carta(2, 'iman')]), { e1: 0, e2: 0 });
});
test('Congelar también anula las cartas que salieron de una Doble Carta del rival', () => {
  const madre = carta(2, 'doble_carta');
  assert.equal(ajuste([gana2()], [carta(1, 'congelar'), madre, carta(2, 'iman', { origen: madre.id })]).e2, 0);
});
test('Todo o Nada: +25 si gana los dos duelos marcados; si no, nada', () => {
  const a = gana1(), b = gana1(), c = gana2();
  assert.equal(p1([a, b, c], 'todo_nada', { duelos: [a.id, b.id] }), 25);
  assert.equal(p1([a, b, c], 'todo_nada', { duelos: [a.id, c.id] }), 0);
});
test('Pacto de Hierro: +20 si los 3 terminan igual', () => { assert.equal(p1([empate(), empate(), empate()], 'pacto_hierro'), 20); assert.equal(p1([gana1(), gana1(), empate()], 'pacto_hierro'), 0); });
test('Lluvia de Estrellas: +5 por victoria y +2 por ronda, máximo +25', () => { assert.equal(p1([gana1([2, 1]), gana2([1, 2])], 'estrellas'), 11); assert.equal(p1([gana1(), gana1(), gana1()], 'estrellas'), 25); });
test('Gran Angular: +8 por victoria si el rival está más arriba', () => {
  assert.equal(ajuste([gana1(), gana1()], [carta(1, 'gran_angular', { puesto: 9 }), carta(2, 'boleto', { puesto: 2 })]).e1, 16);
  assert.equal(ajuste([gana1(), gana1()], [carta(1, 'gran_angular', { puesto: 2 }), carta(2, 'boleto', { puesto: 9 })]).e1, 0);
});
test('La Corona: los puntos del cruce ×1,3', () => assert.equal(p1([gana1(), gana1(), gana2()], 'corona'), 6.9)); // 23 × 0,3
test('Agujero Negro: +6 propio y −6 al rival por cada duelo ganado', () => assert.deepEqual(ajuste([gana1(), gana1(), gana2()], [carta(1, 'agujero')]), { e1: 12, e2: -12 }));
test('Mano de Dios: +6 y además la carta elegida, que no se puede congelar', () => {
  const m = carta(1, 'mano');
  assert.equal(ajuste([gana1()], [m, carta(1, 'iman', { origen: m.id })]).e1, 10);
  assert.equal(ajuste([gana1()], [m, carta(1, 'iman', { origen: m.id }), carta(2, 'congelar')]).e1, 10);
});
test('Big Bang y Bóveda del Dragón: la tirada ×3 y ×2', () => { assert.equal(p1([gana2()], 'big_bang', { dado: 12 }), 36); assert.equal(p1([gana2()], 'boveda', { dado: 18 }), 36); });
test('Leyenda Viva: +12 por victoria y +6 con barrida', () => { assert.equal(p1([gana1(), gana1(), gana2()], 'leyenda'), 24); assert.equal(p1([gana1(), gana1(), gana1()], 'leyenda'), 42); });
test('Tridente: +6 por cada victoria y cada derrota (no por empate)', () => assert.equal(p1([gana1(), gana2(), empate()], 'tridente'), 12));
test('Eclipse: +12 y anula todas las cartas del rival, también las legendarias; dos Eclipse se anulan', () => {
  assert.deepEqual(ajuste([gana2()], [carta(1, 'eclipse'), carta(2, 'supernova')]), { e1: 12, e2: 0 });
  assert.deepEqual(ajuste([gana2()], [carta(1, 'eclipse'), carta(2, 'eclipse')]), { e1: 12, e2: 12 });
  assert.equal(ajuste([gana2()], [carta(1, 'eclipse'), carta(2, 'congelar')]).e1, 12); // el Congelar del rival queda anulado
});
test('Supernova: +14 y +7 por victoria', () => assert.equal(p1([gana1(), gana1(), gana2()], 'supernova'), 28));
test('Titán: +10 y +9 por derrota', () => assert.equal(p1([gana2(), gana2(), gana1()], 'titan'), 28));
test('Rey de la Isla: +30 del puesto 9 al 12; si no, +15', () => { assert.equal(p1([gana2()], 'rey_isla', { puesto: 9 }), 30); assert.equal(p1([gana2()], 'rey_isla', { puesto: 8 }), 15); });

// ───────── Reglas generales ─────────
test('un robo nunca deja al rival bajo 0 puntos en el cruce', () => {
  const r = ajuste([gana1(), gana1(), gana1()], [carta(1, 'agujero'), carta(1, 'contraataque')]);
  assert.equal(r.e2, -12); // perdió los 3 (12 base); los robos (18 + 15) lo dejarían en −21, pero el mínimo es 0
});
test('una carta anulada por Pancho no hace nada', () => assert.equal(p1([gana1()], 'iman', { anulada: true }), 0));
test('equipos que no tienen cartas de otro enfrentamiento no se ven afectados', () => {
  const otro: DueloEquipo = { id: ++id, a: 3, b: 4, ganador: 'a', noJugo: null, rondasA: 2, rondasB: 0 };
  const r = calcularAjustes([gana1(), otro], [carta(1, 'agujero')], 1.5);
  assert.equal(r.find((x) => x.equipo === 4)?.puntos ?? 0, 0);
});
test('cada ajuste trae el detalle de qué carta lo produjo, con la tirada', () => {
  const r = calcularAjustes([gana1()], [carta(1, 'iman'), carta(1, 'dado', { dado: 5 })], 1.5);
  const t = r.find((x) => x.equipo === 1)!.detalle.join(' ');
  assert.match(t, /Imán/); assert.match(t, /salió 5/);
});

// ───────── Datos de la base ─────────
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
test('duelosDelCruce con rondas: hora de cierre (antes del plazo), orden y puntaje de juego', () => {
  const equipoDe = new Map([['p1', 10], ['p2', 20], ['p3', 10], ['p4', 20]]);
  const base = { modo: '1v1', oficial: true, estado: 'cerrado', no_jugo: null, cruce: 8, plazo: '2026-11-15' } as const;
  const r = duelosDelCruce(8, [
    { ...base, id: 1, a_perfil: 'p1', b_perfil: 'p2', ganador: 'a', puntos_a: 2, puntos_b: 0 },
    { ...base, id: 2, a_perfil: 'p3', b_perfil: 'p4', ganador: 'b', puntos_a: 0, puntos_b: 2 },
  ], equipoDe, [], [
    { enfrentamiento_id: 1, lado: 'a', puntaje: 300, creado: '2026-11-13T20:00:00Z' },
    { enfrentamiento_id: 1, lado: 'b', puntaje: 100, creado: '2026-11-14T01:00:00Z' },
    { enfrentamiento_id: 2, lado: 'a', puntaje: 50, creado: '2026-11-15T15:00:00Z' },  // último día: no cuenta como «antes»
    { enfrentamiento_id: 2, lado: 'b', puntaje: 80, creado: '2026-11-15T16:00:00Z' },
  ]);
  assert.deepEqual(r.map((d) => [d.id, d.antes, d.orden, d.sumaA, d.sumaB]), [[1, true, 0, 300, 100], [2, false, 1, 50, 80]]);
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
  const cartas = Array.from({ length: 12 }, (_, i) => ({ equipo: i + 1, carta: CARTAS[i * 5].id, rareza: CARTAS[i * 5].rareza }));
  const ajustes = cartas.map((x) => ({ equipo: x.equipo, puntos: -4.5 + x.equipo, detalle: ['🧲 Imán: +4 base', '🪤 Trampa del rival: −2 base', 'línea larga '.repeat(8)] }));
  const textos = textosRevelacion(8, cartas, ajustes, nombres);
  assert.ok(textos.length >= 2);
  for (const t of textos) assert.ok(t.length <= 1900, `largo ${t.length}`);
  const todo = textos.join('\n');
  for (const n of nombres.values()) assert.ok(todo.includes(n), n);
  assert.match(textos[0], /CRUCE 8/);
  assert.match(todo, /\+7,5/);
});
