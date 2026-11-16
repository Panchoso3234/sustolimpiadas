// Pruebas del sorteo de juegos por jugador (máximo 1 vez y NO_TOCAR). Correr: node pruebas/sorteo-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_VECES, NO_TOCAR, elegirJuego, vecesDe, vecesPorJugador } from '../src/juegos/sorteoJuegos';

const JUEGOS = Array.from({ length: 30 }, (_, i) => `j${i}`);
const tabla = JUEGOS.map((juego) => ({ juego, p: 1 / JUEGOS.length }));
const duelo = (cruce: number, juego: string, a: string, b: string, estado = 'cerrado') => ({ cruce, juego, a_perfil: a, b_perfil: b, estado });

test('el máximo es 1 vez', () => assert.equal(MAX_VECES, 1));

test('cuenta por jugador, sin anulados ni amistosos (sin cruce)', () => {
  const v = vecesPorJugador([duelo(1, 'j1', 'x', 'y'), duelo(2, 'j1', 'x', 'z'), duelo(3, 'j2', 'x', 'y', 'anulado'), { ...duelo(0, 'j3', 'x', 'y'), cruce: null }]);
  assert.equal(vecesDe(v, 'x', 'j1'), 2); assert.equal(vecesDe(v, 'y', 'j1'), 1); assert.equal(vecesDe(v, 'x', 'j2'), 0); assert.equal(vecesDe(v, 'x', 'j3'), 0);
});

test('nunca elige un juego que cualquiera de los dos ya jugó (10.000 sorteos al azar)', () => {
  const historial = [...Array(8)].flatMap((_, c) => [duelo(c + 1, `j${c}`, 'a', `r${c}`), duelo(c + 1, `j${c + 10}`, `s${c}`, 'b')]);
  const v = vecesPorJugador(historial);
  for (let i = 0; i < 10000; i++) {
    const { juego, forzado } = elegirJuego(tabla, 'a', 'b', v);
    assert.equal(forzado, false);
    assert.equal(vecesDe(v, 'a', juego) + vecesDe(v, 'b', juego), 0, juego);
  }
});

test('NO_TOCAR: a andy y a Leona nunca les toca Mercado Loco, aunque no lo hayan jugado', () => {
  const t = [{ juego: 'mercado', p: 0.99 }, { juego: 'pesca', p: 0.01 }];
  for (const id of Object.keys(NO_TOCAR)) for (let i = 0; i < 2000; i++) assert.equal(elegirJuego(t, id, 'otro', new Map()).juego, 'pesca');
});

test('si no queda ningún juego libre, relaja la regla y avisa (forzado), pero respeta NO_TOCAR', () => {
  const v = vecesPorJugador([duelo(1, 'mercado', 'otro', 'z'), duelo(2, 'pesca', 'otro', 'z')]);
  const r = elegirJuego([{ juego: 'mercado', p: 0.5 }, { juego: 'pesca', p: 0.5 }], '40b6ec64-ddf4-475c-898c-a8826a7835f5', 'otro', v);
  assert.deepEqual(r, { juego: 'pesca', forzado: true });
});

test('respeta las probabilidades entre los juegos libres', () => {
  const t = [{ juego: 'raro', p: 0.1 }, { juego: 'comun', p: 0.9 }, { juego: 'jugado', p: 5 }];
  const v = vecesPorJugador([duelo(1, 'jugado', 'a', 'z')]);
  let comun = 0; for (let i = 0; i < 20000; i++) if (elegirJuego(t, 'a', 'b', v).juego === 'comun') comun++;
  assert.ok(comun / 20000 > 0.87 && comun / 20000 < 0.93, String(comun / 20000));
});
