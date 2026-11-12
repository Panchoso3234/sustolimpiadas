// Pruebas de la visión de Golpe Maestro. Correr: node pruebas/museo-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NIVELES } from '../src/juegos/arcade/museoNiveles';
import { crearVision, CELDA, centro, celda, COLS, FILAS } from '../src/juegos/arcade/museoVision';

type P = { x: number; z: number };
const conMapa = (mapa: string[]) => crearVision((cx, cz) => cx < 0 || cz < 0 || cx >= COLS || cz >= FILAS || mapa[cz]?.[cx] === '#');
const vacio = Array.from({ length: FILAS }, () => '.'.repeat(COLS));
const poner = (muros: [number, number][]) => vacio.map((f, z) => [...f].map((c, x) => (muros.some(([a, b]) => a === x && b === z) ? '#' : c)).join(''));

test('ve de punta a punta cuando no hay nada en medio', () => {
  const v = conMapa(vacio);
  assert.equal(v.aLaVista(centro(2, 2), centro(6, 2)), true);
  assert.equal(v.aLaVista(centro(2, 2), centro(5, 5)), true);
});

test('un muro en medio corta la vista', () => assert.equal(conMapa(poner([[4, 2]])).aLaVista(centro(2, 2), centro(6, 2)), false));

test('rozar la esquina de un muro también corta la vista (antes se la saltaba)', () => {
  // Muro en (5,5). La línea pasa justo por su esquina de arriba a la izquierda, en diagonal
  const v = conMapa(poner([[5, 5]])), esquina = { x: centro(5, 5).x - CELDA / 2, z: centro(5, 5).z - CELDA / 2 };
  const a = { x: esquina.x - 2, z: esquina.z + 2 }, b = { x: esquina.x + 2, z: esquina.z - 2 };
  assert.equal(v.aLaVista(a, b), false);
});

test('no se ve por el hueco diagonal entre dos muros que se tocan en la esquina', () => {
  const v = conMapa(poner([[6, 5], [5, 6]]));
  assert.equal(v.aLaVista(centro(5, 5), centro(6, 6)), false);
});

test('el alcance de un rayo termina justo en la cara del muro', () => {
  const v = conMapa(poner([[8, 3]])), o = centro(3, 3);
  const d = v.alcance(o.x, o.z, Math.PI / 2, 20); // hacia +x
  assert.ok(Math.abs(o.x + d - (centro(8, 3).x - CELDA / 2)) < 1e-6, `alcance ${d}`);
});

test('el alcance no pasa del radio de visión', () => assert.equal(conMapa(vacio).alcance(centro(3, 3).x, centro(3, 3).z, 0, 2.5), 2.5));

test('en los tres pisos reales, nunca «te ve» con un muro de por medio', () => {
  for (const [n, nivel] of NIVELES.entries()) {
    const v = conMapa(nivel.mapa), muros: [number, number][] = [];
    nivel.mapa.forEach((f, z) => [...f].forEach((c, x) => { if (c === '#') muros.push([x, z]); }));
    // Oráculo: el segmento corta (o roza) alguna caja de muro, revisando todas
    const toca = (a: P, b: P) => muros.some(([cx, cz]) => {
      const c = centro(cx, cz), x0 = c.x - CELDA / 2, x1 = c.x + CELDA / 2, z0 = c.z - CELDA / 2, z1 = c.z + CELDA / 2;
      let t0 = 0, t1 = 1; const dx = b.x - a.x, dz = b.z - a.z;
      for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dz, a.z - z0], [dz, z1 - a.z]]) {
        if (p === 0) { if (q < 0) return false; } else { const r = q / p; if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); if (t0 > t1) return false; }
      }
      return t1 - t0 > 1e-9;
    });
    let malos = 0, revisados = 0;
    const libres: P[] = [];
    for (let cz = 0; cz < FILAS; cz++) for (let cx = 0; cx < COLS; cx++) if (nivel.mapa[cz][cx] !== '#') for (const [fx, fz] of [[0.2, 0.2], [0.5, 0.5], [0.8, 0.3], [0.3, 0.8]]) libres.push({ x: centro(cx, cz).x + (fx - 0.5) * CELDA, z: centro(cx, cz).z + (fz - 0.5) * CELDA });
    for (const a of libres) for (const b of libres) {
      if (Math.hypot(a.x - b.x, a.z - b.z) > 6) continue;
      revisados++;
      if (v.aLaVista(a, b) && toca(a, b)) malos++;
    }
    assert.equal(malos, 0, `piso ${n + 1}: ${malos} de ${revisados} pares ven a través de un muro`);
  }
});

test('celda() y centro() son inversas', () => { const p = centro(7, 4); assert.deepEqual(celda(p.x, p.z), [7, 4]); });
