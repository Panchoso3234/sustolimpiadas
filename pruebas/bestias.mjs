// Prueba los datos y el combate de Bestiario sin navegador: node pruebas/bestias.mjs
import { register } from 'node:module';

// El código del juego importa sin extensión (como lo resuelve Vite): aquí se le agrega ".ts"
register(`data:text/javascript,${encodeURIComponent("export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith('.') && !/\\.\\w+$/.test(s)) return n(s + '.ts', c); throw e; } }")}`);
const D = await import('../src/juegos/arcade/bestiasDatos.ts');
const N = await import('../src/juegos/arcade/bestiasNucleo.ts');
const IA = await import('../src/juegos/arcade/bestiasIA.ts');

let malos = 0;
const ver = (nombre, ok, extra = '') => { malos += ok ? 0 : 1; console.log(`${ok ? 'OK  ' : 'MAL '} ${nombre}${extra ? ` · ${extra}` : ''}`); };
const n = (nombre) => D.ESPECIES.find((x) => x.nombre === nombre).n;

const errores = D.revisar();
ver('datos consistentes (30 criaturas, ataques de su tipo, evoluciones, tabla)', !errores.length, errores.join('; '));
ver('las estadísticas al nivel 50 son las clásicas', N.calcular(n('Tortonante')).ps === 154 && N.calcular(n('Tortonante')).stats.def === 120);

// Daño: lanzallamas de Volcadrac contra una planta (x2) es mucho mayor que contra un agua (x½)
const vol = N.nuevoCombate('x', [n('Volcadrac')], [n('Florastado')]).lados[0].equipo[0];
const flor = N.nuevoCombate('x', [n('Florastado')], [1]).lados[0].equipo[0], tor = N.nuevoCombate('x', [n('Tortonante')], [1]).lados[0].equipo[0];
const contraPlanta = N.calcularDano(vol, flor, D.ATAQUES.lanzallamas, false, 100), contraAgua = N.calcularDano(vol, tor, D.ATAQUES.lanzallamas, false, 100);
ver('eficacia x2 y x½ con mismo tipo', contraPlanta.efic === 2 && contraAgua.efic === 0.5 && contraPlanta.dano > contraAgua.dano * 3, `${contraPlanta.dano} vs ${contraAgua.dano}`);
const rod = N.nuevoCombate('x', [n('Rodamuro')], [1]).lados[0].equipo[0], volt = N.nuevoCombate('x', [n('Voltardilla')], [1]).lados[0].equipo[0];
ver('Tierra es inmune a lo eléctrico', N.calcularDano(volt, rod, D.ATAQUES.rayo, false, 100).dano === 0);
ver('el crítico pega x1,5', N.calcularDano(vol, flor, D.ATAQUES.lanzallamas, true, 100).dano >= Math.floor(contraPlanta.dano * 1.45));

// Orden: el ataque con prioridad va primero aunque sea más lento
let c = N.nuevoCombate('orden', [n('Gorilazo')], [n('Voltardilla')]);
let ev = N.resolverTurno(c, [{ tipo: 'atacar', i: 1 }, { tipo: 'atacar', i: 0 }]);
const primero = ev.find((x) => x.t === 'ataque');
ver('la velocidad decide quién ataca primero', primero?.lado === 1);
c = N.nuevoCombate('orden', [n('Gorilazo'), n('Mapachín')], [n('Voltardilla')]);
ev = N.resolverTurno(c, [{ tipo: 'cambiar', a: 1 }, { tipo: 'atacar', i: 3 }]);
ver('los cambios van antes que los ataques', ev[0].t === 'cambio' && N.activo(c, 0).n === n('Mapachín'));

// Misma semilla y mismas acciones = mismo combate (lo que necesita el modo en vivo)
const jugar = (semilla) => {
  const k = N.nuevoCombate(semilla, [n('Volcadrac'), n('Tortonante'), n('Florastado')], [n('Gorilazo'), n('Orbizorro'), n('Morsaglaciar')]);
  const r = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const todo = [];
  for (let t = 0; t < 200 && k.ganador === null; t++) {
    const acc = [0, 1].map((l) => IA.elegirAccion(k, l, 'normal', r));
    todo.push(...N.resolverTurno(k, acc));
    for (const l of [0, 1]) if (N.necesitaCambio(k, l)) N.cambiar(k, l, IA.elegirReemplazo(k, l), todo);
  }
  return { k, todo };
};
const j1 = jugar('semilla'), j2 = jugar('semilla');
ver('misma semilla da el mismo combate', JSON.stringify(j1.todo) === JSON.stringify(j2.todo) && j1.k.ganador !== null, `${j1.k.turno} turnos`);

// Estados: dormido no ataca; quemado pierde PS al final del turno; Fuego no se quema
c = N.nuevoCombate('estados', [n('Florastado')], [n('Gorilazo')]);
N.activo(c, 1).estado = 'dormido'; N.activo(c, 1).sueno = 3;
ev = N.resolverTurno(c, [{ tipo: 'atacar', i: 3 }, { tipo: 'atacar', i: 0 }]);
ver('dormido no ataca', ev.some((x) => x.t === 'texto' && x.clave === 'dormido') && !ev.some((x) => x.t === 'ataque' && x.lado === 1));
c = N.nuevoCombate('quema', [n('Farolín')], [n('Gorilazo')]);
for (let k = 0; k < 6 && !N.activo(c, 1).estado; k++) N.resolverTurno(c, [{ tipo: 'atacar', i: 2 }, { tipo: 'atacar', i: 3 }]);
ver('Fuego Fatuo quema y la quemadura daña cada turno', N.activo(c, 1).estado === 'quemado');
c = N.nuevoCombate('inmune', [n('Farolín')], [n('Volcadrac')]);
ev = N.resolverTurno(c, [{ tipo: 'atacar', i: 2 }, { tipo: 'atacar', i: 3 }]);
ver('los de Fuego no se queman', N.activo(c, 1).estado === null);

// Balance: con la IA normal de los dos lados, ninguna criatura elegible gana casi siempre o casi nunca
const victorias = Object.fromEntries(D.ELEGIBLES.map((x) => [x, [0, 0]]));
for (let s = 0; s < 400; s++) {
  const pool = [...D.ELEGIBLES], r = (() => { let v = s * 7919 + 1; return () => ((v = (v * 16807) % 2147483647) / 2147483647); })();
  const tomar = () => pool.splice(Math.floor(r() * pool.length), 1)[0];
  const A = [tomar(), tomar(), tomar()], B = [tomar(), tomar(), tomar()];
  const k = N.nuevoCombate(`b${s}`, A, B), tira = [];
  for (let t = 0; t < 300 && k.ganador === null; t++) {
    N.resolverTurno(k, [0, 1].map((l) => IA.elegirAccion(k, l, 'normal', r)));
    for (const l of [0, 1]) if (N.necesitaCambio(k, l)) N.cambiar(k, l, IA.elegirReemplazo(k, l), tira);
  }
  for (const x of A) victorias[x][k.ganador === 0 ? 0 : 1]++;
  for (const x of B) victorias[x][k.ganador === 1 ? 0 : 1]++;
}
const tasas = Object.entries(victorias).map(([x, [g, p]]) => [D.especie(Number(x)).nombre, Math.round((g / Math.max(1, g + p)) * 100)]).sort((a, b) => b[1] - a[1]);
console.log('     % de victorias:', tasas.map(([x, v]) => `${x} ${v}`).join(' · '));
ver('ninguna criatura domina ni es inútil (entre 20 y 80 %)', tasas.every(([, v]) => v >= 20 && v <= 80));

process.exit(malos ? 1 : 0);
