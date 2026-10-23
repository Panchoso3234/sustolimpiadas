import { eficacia, especie } from './bestiasDatos';
import { acciones, activo, ataqueDe, calcularDano, efectiva, tipos, type Accion, type Combate, type Luchador } from './bestiasNucleo';

// El rival de máquina de Bestiario (y el piloto de prueba). Fácil: ataca casi al azar. Normal: busca el ataque que más
// daña (con eficacia y remate) y usa estados con criterio. Difícil: además cambia de criatura cuando está en
// desventaja, se cura a tiempo y no desperdicia subidas.
export type Nivel = 'facil' | 'normal' | 'dificil';

/** Fracción de los PS del defensor que le quita el mejor ataque del atacante (en promedio, sin crítico). */
export function mejorGolpe(at: Luchador, def: Luchador) {
  let mejor = 0;
  especie(at.n).ataques.forEach((_, i) => {
    const x = ataqueDe(at, i);
    if (x.cat === 'estado' || at.pp[i] <= 0) return;
    mejor = Math.max(mejor, (calcularDano(at, def, x, false, 92).dano * (x.precision ? x.precision / 100 : 1)) / Math.max(1, def.ps));
  });
  return mejor;
}

/** Qué tan bueno es usar el ataque `i` ahora. */
function nota(c: Combate, lado: number, i: number) {
  const yo = activo(c, lado), el = activo(c, 1 - lado), x = ataqueDe(yo, i), ef = x.efecto, acierto = x.precision ? x.precision / 100 : 1;
  if (x.cat !== 'estado') {
    const { dano, efic } = calcularDano(yo, el, x, false, 92);
    if (efic === 0) return -1;
    let v = Math.min(1, dano / Math.max(1, el.ps)) * acierto;
    if (dano >= el.ps) v += 0.5 * acierto + (x.prioridad ?? 0) * 0.2;
    if (ef?.rebote) v -= Math.min(1, (dano * ef.rebote) / Math.max(1, yo.ps)) * 0.4;
    if (ef?.stats && ef.aQuien === 'yo' && ef.prob === undefined) v -= 0.08;
    return v;
  }
  if (ef?.cura) return yo.ps / yo.max < 0.5 ? 0.7 : 0.02;
  if (ef?.protege) return 0.03;
  if (ef?.estado) {
    if (el.estado || eficacia(x.tipo, tipos(el)) === 0) return -1;
    const inmune = { quemado: 'fuego', paralizado: 'electrico', congelado: 'hielo', envenenado: 'veneno', toxico: 'veneno', dormido: '' }[ef.estado];
    if (inmune && tipos(el).includes(inmune as never)) return -1;
    const valor = ef.estado === 'dormido' ? 0.5 : ef.estado === 'paralizado' ? (efectiva(el, 'vel') > efectiva(yo, 'vel') ? 0.45 : 0.3) : ef.estado === 'quemado' ? (el.stats.at > el.stats.ate ? 0.45 : 0.15) : 0.32;
    return valor * acierto;
  }
  if (ef?.confusion) return el.confusion ? -1 : 0.25 * acierto;
  if (ef?.stats && ef.aQuien === 'yo') {
    const subidas = Object.keys(ef.stats).reduce((s, k) => s + yo.etapas[k as keyof typeof yo.etapas], 0);
    return yo.ps / yo.max > 0.6 && subidas < 2 && mejorGolpe(el, yo) < 0.5 ? 0.38 : 0.02;
  }
  if (ef?.stats) return 0.12 * acierto;
  return 0;
}

export function elegirAccion(c: Combate, lado: number, nivel: Nivel, r: () => number = Math.random): Accion {
  const L = c.lados[lado], yo = activo(c, lado), el = activo(c, 1 - lado), posibles = acciones(c, lado);
  const ataques = posibles.filter((a): a is Extract<Accion, { tipo: 'atacar' }> => a.tipo === 'atacar');
  if (ataques.length === 1 && ataques[0].i < 0) return ataques[0];
  if (nivel === 'facil' && r() < 0.5) {
    const utiles = ataques.filter((a) => nota(c, lado, a.i) > 0);
    return (utiles.length ? utiles : ataques)[Math.floor(r() * (utiles.length || ataques.length))];
  }
  const ruido = nivel === 'facil' ? 0.3 : nivel === 'normal' ? 0.06 : 0.02;
  const notas = ataques.map((a) => ({ a, v: nota(c, lado, a.i) + r() * ruido })).sort((x, y) => y.v - x.v);
  const mejor = notas[0];
  if (nivel !== 'facil') {
    // Curarse si está muy herido y no puede rematar antes
    const remata = mejor.v > 1 && efectiva(yo, 'vel') >= efectiva(el, 'vel');
    if (!remata && L.pociones > 0 && yo.ps / yo.max < 0.3 && mejorGolpe(el, yo) < 1 + yo.max / 2 / Math.max(1, yo.ps) && r() < (nivel === 'dificil' ? 0.75 : 0.4)) return { tipo: 'objeto', cual: 'pocion' };
    if (L.curas > 0 && (yo.estado === 'dormido' || yo.estado === 'toxico' || yo.estado === 'congelado') && yo.ps / yo.max > 0.4 && r() < (nivel === 'dificil' ? 0.6 : 0.25)) return { tipo: 'objeto', cual: 'cura' };
  }
  if (nivel === 'dificil') {
    // Cambiar si el rival le pega muy fuerte y alguien del equipo aguanta mejor y le pega más
    // Cambiar solo si el rival lo deja fuera de combate antes de que pueda rematarlo, y hay alguien que aguanta ese golpe
    const peligro = mejorGolpe(el, yo), masLento = efectiva(el, 'vel') > efectiva(yo, 'vel');
    if (peligro >= 1 && masLento && mejor.v < 1) {
      const opciones = L.equipo.map((l, a) => ({ a, l })).filter(({ a, l }) => a !== L.activo && l.ps > 0 && mejorGolpe(el, l) < 0.4)
        .map(({ a, l }) => ({ a, v: mejorGolpe(l, el) - mejorGolpe(el, l) })).sort((x, y) => y.v - x.v);
      if (opciones[0] && opciones[0].v > 0.2) return { tipo: 'cambiar', a: opciones[0].a };
    }
  }
  return mejor.a;
}

/** A quién mandar cuando se debilita la que estaba: la que mejor le gana a la criatura del rival. */
export function elegirReemplazo(c: Combate, lado: number): number {
  const L = c.lados[lado], el = activo(c, 1 - lado);
  return L.equipo.map((l, a) => ({ a, l })).filter(({ l }) => l.ps > 0)
    .map(({ a, l }) => ({ a, v: mejorGolpe(l, el) - mejorGolpe(el, l) * 0.8 + l.ps / l.max * 0.2 })).sort((x, y) => y.v - x.v)[0]?.a ?? L.activo;
}
