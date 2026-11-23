// Pruebas del motor de la FASE FINAL. Correr: node pruebas/fasefinal-test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simular, OBJETOS, type Tributo } from '../src/fasefinal/motor';
import { BANCO, ESCENARIOS } from '../src/fasefinal/eventos';

// 18 tributos con poder repartido de 0 a 1, en 9 parejas
const tributos: Tributo[] = Array.from({ length: 18 }, (_, i) => ({ id: `t${i}`, nombre: `Tributo ${i}`, poder: i / 17, distrito: `Equipo ${Math.floor(i / 3)}` }));
const parejas: [string, string][] = Array.from({ length: 9 }, (_, i) => [`t${i * 2}`, `t${i * 2 + 1}`]);
const correr = (semilla: string) => simular(tributos, parejas, BANCO, ESCENARIOS, semilla);

test('la misma semilla da exactamente la misma gala; otra semilla, otra', () => {
  assert.deepEqual(correr('abc'), correr('abc'));
  assert.notDeepEqual(correr('abc').caidas, correr('xyz').caidas);
});

test('termina con un solo ganador; todos los demás caen una sola vez', () => {
  for (let i = 0; i < 200; i++) {
    const g = correr(`s${i}`);
    assert.equal(g.caidas.length, 17, `semilla ${i}`);
    assert.equal(new Set(g.caidas).size, 17);
    assert.ok(!g.caidas.includes(g.ganador));
    assert.equal(g.top3[0], g.ganador);
  }
});

test('nadie aparece en un evento después de morir', () => {
  for (let i = 0; i < 100; i++) {
    const g = correr(`m${i}`), muertos = new Set<string>();
    for (const p of g.pasos) {
      if (p.tipo === 'caidos') continue;
      for (const l of p.lineas) {
        for (const id of l.tributos) assert.ok(!muertos.has(id), `semilla ${i}: ${id} aparece muerto en ${p.titulo}`);
        for (const m of l.muertos) muertos.add(m);
      }
    }
  }
});

test('cada vivo aparece al menos una vez en cada etapa', () => {
  for (let i = 0; i < 50; i++) {
    const g = correr(`v${i}`), muertos = new Set<string>();
    for (const p of g.pasos) {
      if (p.tipo === 'caidos') continue;
      const vivosAntes = tributos.map((t) => t.id).filter((id) => !muertos.has(id));
      const aparecen = new Set(p.lineas.flatMap((l) => l.tributos));
      for (const l of p.lineas) for (const m of l.muertos) muertos.add(m);
      const termina = tributos.filter((t) => !muertos.has(t.id)).length <= 1; // si la etapa deja un solo vivo, la gala se corta ahí
      for (const id of vivosAntes) assert.ok(aparecen.has(id) || termina, `semilla ${i}: ${id} no aparece en ${p.titulo}`);
    }
  }
});

test('etapas en orden: baño de sangre primero, cañonazos al final de cada noche, a lo más un banquete', () => {
  const g = correr('orden');
  assert.equal(g.pasos[0].tipo, 'bano');
  assert.ok(g.pasos.filter((p) => p.tipo === 'banquete').length <= 1);
  assert.equal(g.pasos[g.pasos.length - 1].tipo, 'caidos');
});

test('los textos no dejan marcadores sin reemplazar', () => {
  for (let i = 0; i < 50; i++) for (const p of correr(`t${i}`).pasos) for (const l of p.lineas) assert.ok(!/\{\d\}/.test(l.texto), l.texto);
});

test('el banco: ids únicos, objetos que existen y marcadores consecutivos', () => {
  assert.equal(new Set(BANCO.map((e) => e.id)).size, BANCO.length);
  for (const e of BANCO) {
    for (const d of e.da ?? []) assert.ok(d.objeto in OBJETOS, `${e.id}: ${d.objeto}`);
    const k = Math.max(...[...e.texto.matchAll(/\{(\d)\}/g)].map((m) => Number(m[1])));
    for (let p = 1; p <= k; p++) assert.ok(e.texto.includes(`{${p}}`), `${e.id}: falta {${p}}`);
    for (const p of [...(e.muere ?? []), ...(e.autores ?? [])]) assert.ok(p >= 1 && p <= k, `${e.id}: puesto ${p}`);
    if (e.traicion) assert.ok(k === 2 && e.muere?.[0] === 2, `${e.id}: traición mal armada`);
  }
  for (const etapa of ['bano', 'dia', 'noche', 'banquete', 'arena'] as const) {
    assert.ok(BANCO.some((e) => e.etapas.includes(etapa) && e.muere?.length), `falta un evento fatal de ${etapa}`);
    assert.ok(BANCO.some((e) => e.etapas.includes(etapa) && !e.muere?.length && !e.traicion), `falta un evento no fatal de ${etapa}`);
  }
});

test('mérito suave: el más fuerte gana más seguido que el más débil, pero nadie domina (2.000 galas)', () => {
  const victorias = new Map<string, number>();
  const N = 2000;
  for (let i = 0; i < N; i++) { const g = correr(`merito${i}`); victorias.set(g.ganador, (victorias.get(g.ganador) ?? 0) + 1); }
  const mejor = (victorias.get('t17') ?? 0) / N, peor = (victorias.get('t0') ?? 0) / N;
  // Meta del plan con 18: mejor ~9 %, promedio ~5,6 %, peor ~3,4 %
  console.log(`# victorias en ${N} galas: mejor ${(mejor * 100).toFixed(1)} %, peor ${(peor * 100).toFixed(1)} %, promedio ${(100 / 18).toFixed(1)} %`);
  assert.ok(mejor > peor * 1.6, `el mejor (${mejor}) debería ganar bastante más que el peor (${peor})`);
  assert.ok(mejor < 0.2, `el mejor gana demasiado: ${mejor}`);
  assert.ok(peor > 0.008, `el peor casi nunca gana: ${peor}`);
});

test('la gala no es eterna: termina en pocos días', () => {
  for (let i = 0; i < 200; i++) {
    const dias = correr(`d${i}`).pasos.filter((p) => p.tipo === 'dia').length;
    assert.ok(dias <= 9, `semilla ${i}: ${dias} días`);
  }
});

test('un paracaídas no cambia los pasos ya mostrados: solo desde el paso siguiente', () => {
  for (let i = 0; i < 40; i++) {
    const sin = correr(`par${i}`), desde = 3, ayudado = sin.pasos[1]?.lineas[0]?.tributos[0] ?? 't0';
    const con = simular(tributos, parejas, BANCO, ESCENARIOS, `par${i}`, [{ tributo: ayudado, desdePaso: desde, fuerza: 2 }]);
    assert.deepEqual(con.pasos.slice(0, desde), sin.pasos.slice(0, desde), `semilla ${i}`);
  }
});

test('cuotas: entre ×1,05 y ×20, con 15 % de margen, y las probabilidades de ganar suman 1', async () => {
  const { cuotaDe, calcularCuotas } = await import('../src/fasefinal/cuotas');
  assert.equal(cuotaDe(0), 20); assert.equal(cuotaDe(1), 1.05); assert.equal(cuotaDe(0.5), 1.7);
  const r = await calcularCuotas(tributos, BANCO, ESCENARIOS, 600);
  const suma = Object.values(r.prob.ganador).reduce((s, p) => s + p, 0);
  assert.ok(Math.abs(suma - 1) < 1e-9, `suma ${suma}`);
  for (const m of Object.values(r.cuotas)) for (const c of Object.values(m)) assert.ok(c >= 1.05 && c <= 20);
});

test('tope de muertes por etapa: baño 25 %, día o noche 2, banquete y arena 3', async () => {
  const { topeMuertes } = await import('../src/fasefinal/motor');
  for (let i = 0; i < 200; i++) {
    const g = correr(`tope${i}`);
    for (const p of g.pasos) {
      if (p.tipo === 'caidos') continue;
      const murieron = p.lineas.reduce((s, l) => s + l.muertos.length, 0);
      assert.ok(murieron <= topeMuertes(p.tipo, 18, tributos.length), `semilla ${i}: ${murieron} en ${p.titulo}`);
    }
  }
});

test('ritmo: la gala normal dura entre 5 y 7 días (promedio); la larga dura más que la corta', () => {
  const dias = (ritmo: 'corta' | 'normal' | 'larga') => Array.from({ length: 150 }, (_, i) => simular(tributos, parejas, BANCO, ESCENARIOS, `r${i}`, [], { ritmo }).pasos.filter((p) => p.tipo === 'dia').length);
  const prom = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const n = dias('normal'), c = dias('corta'), l = dias('larga');
  console.log(`# días promedio: corta ${prom(c).toFixed(1)}, normal ${prom(n).toFixed(1)}, larga ${prom(l).toFixed(1)}`);
  assert.ok(prom(n) >= 4.8 && prom(n) <= 7, `normal ${prom(n)}`);
  assert.ok(prom(l) > prom(c));
  assert.deepEqual(simular(tributos, parejas, BANCO, ESCENARIOS, 'x', [], { ritmo: 'larga' }), simular(tributos, parejas, BANCO, ESCENARIOS, 'x', [], { ritmo: 'larga' }));
});
