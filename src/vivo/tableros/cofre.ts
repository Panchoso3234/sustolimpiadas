import { generador } from '../../nucleo/azar';
import { type Lado, type Reglas } from '../tablero';

// El Cofre o la Ola en vivo, como concurso: los mismos cofres y la misma ola para los dos. En cada sacada los dos
// eligen en secreto "Sacar" o "Plantarme" y se revela a la vez. Quien se planta guarda; a quien saca le puede
// tocar la ola. Seis cofres; gana quien junta más monedas.
// shortcut: la elección viaja en el estado y alguien con la consola podría verla; la pantalla solo dice "ya eligió"
const COFRES = 6, PASOS = 10, PLAZO = 12, PAUSA = 1.6;
const MARES = { calma: { icono: '☀️', nombre: 'Mar en calma', base: 0.03, sube: 0.05, paga: 1 }, oleaje: { icono: '🌤️', nombre: 'Oleaje', base: 0.06, sube: 0.07, paga: 1.2 }, tormenta: { icono: '⛈️', nombre: 'Tormenta', base: 0.12, sube: 0.1, paga: 1.5 } };
type Mar = keyof typeof MARES;
type Eleccion = 'sacar' | 'plantar';
const LADOS: Lado[] = ['a', 'b'];
export interface EstadoCofre { semilla: string; cofre: number; paso: number; mano: Record<Lado, number>; total: Record<Lado, number>; activo: Record<Lado, boolean>; elige: Record<Lado, Eleccion | null>; plazo: number; revela: number; ola: Record<Lado, boolean> }
export function cofresVivo(semilla: string) {
  const r = generador(`${semilla}|cofre-vivo`);
  return Array.from({ length: COFRES }, () => {
    const suerte = r(), mar: Mar = suerte < 0.35 ? 'calma' : suerte < 0.75 ? 'oleaje' : 'tormenta', monedas: number[] = [];
    let ola = PASOS;
    for (let paso = 0; paso < PASOS; paso++) { monedas.push(Math.round((6 + Math.floor(r() * 10) + 2 * paso) * MARES[mar].paga)); if (ola === PASOS && r() < Math.min(0.9, MARES[mar].base + MARES[mar].sube * paso)) ola = paso; }
    return { monedas, ola, mar };
  });
}
const nuevoCofre = (e: EstadoCofre, t: number): EstadoCofre => ({ ...e, cofre: e.cofre + 1, paso: 0, mano: { a: 0, b: 0 }, activo: { a: true, b: true }, elige: { a: null, b: null }, plazo: t + PLAZO, revela: 0, ola: { a: false, b: false } });

/** Se revela la sacada: cada uno recibe lo suyo según lo que eligió. */
function revelar(e: EstadoCofre, t: number): EstadoCofre {
  const c = cofresVivo(e.semilla)[e.cofre], mano = { ...e.mano }, total = { ...e.total }, activo = { ...e.activo }, ola = { a: false, b: false };
  for (const l of LADOS) {
    if (!e.activo[l]) continue;
    const elige = e.elige[l] ?? (mano[l] > 0 ? 'plantar' : 'sacar'); // quien no eligió a tiempo se planta si tiene algo
    if (elige === 'plantar') { total[l] += mano[l]; mano[l] = 0; activo[l] = false; continue; }
    if (e.paso >= c.ola) { mano[l] = 0; activo[l] = false; ola[l] = true; continue; }
    mano[l] += c.monedas[e.paso];
  }
  const paso = e.paso + 1;
  // Llegar a la última sacada sin ola guarda todo lo que quede en la mano
  if (paso >= PASOS) for (const l of LADOS) if (activo[l]) { total[l] += mano[l]; mano[l] = 0; activo[l] = false; }
  return { ...e, paso, mano, total, activo, ola, elige: { a: null, b: null }, revela: t + PAUSA };
}

const numeros = (x: unknown) => !!x && LADOS.every((l) => typeof (x as Record<Lado, unknown>)[l] === 'number');
export const cofre: Reglas<EstadoCofre> = {
  id: 'cofre', nombre: 'El Cofre o la Ola', idea: 'Concurso: los mismos cofres; en cada sacada los dos eligen en secreto y se revela a la vez.',
  inicial(semilla) { return nuevoCofre({ semilla, cofre: -1, paso: 0, mano: { a: 0, b: 0 }, total: { a: 0, b: 0 }, activo: { a: true, b: true }, elige: { a: null, b: null }, plazo: 0, revela: 0, ola: { a: false, b: false } }, 0); },
  accion(e, a, lado, t) {
    if (t < 0 || e.revela || e.cofre >= COFRES || !e.activo[lado] || e.elige[lado] || (a.elige !== 'sacar' && a.elige !== 'plantar')) return null;
    if (a.elige === 'plantar' && e.mano[lado] === 0) return null;
    const elige = { ...e.elige, [lado]: a.elige as Eleccion }, faltan = LADOS.filter((l) => e.activo[l] && !elige[l]);
    return faltan.length ? { ...e, elige } : revelar({ ...e, elige }, t);
  },
  tic(e, t) {
    if (e.cofre >= COFRES) return null;
    if (e.revela) {
      if (t < e.revela) return null;
      return e.activo.a || e.activo.b ? { ...e, revela: 0, ola: { a: false, b: false }, plazo: t + PLAZO } : nuevoCofre(e, t);
    }
    return t >= e.plazo ? revelar(e, t) : null;
  },
  marcador(e) { return { a: e.total.a, b: e.total.b, fin: e.cofre >= COFRES }; },
  valido(x): x is EstadoCofre { const e = x as EstadoCofre; return !!e && typeof e.semilla === 'string' && Number.isInteger(e.cofre) && Number.isInteger(e.paso) && numeros(e.mano) && numeros(e.total) && !!e.activo && !!e.elige && typeof e.plazo === 'number' && typeof e.revela === 'number' && !!e.ola; },
  dibujar(m, enviar, yo) {
    const titulo = m.el('div', 'sigla', m.tablero), cielo = m.el('div', 'cofre-mar', m.tablero), dibujo = m.el('div', 'cofre-dibujo', m.tablero);
    const foto = m.el('img', '', dibujo);
    foto.alt = 'Cofre';
    // Import diferido: así la lista de tableros no arrastra Three.js a otras pantallas
    import('../../nucleo/modelos').then((x) => x.fotoModelo('pirata', 'chest', 256)).then((src) => { foto.src = src; }).catch(() => {});
    const manos = m.el('div', 'cofre-pozo', m.tablero), barra = m.el('div', 'fila centro', m.tablero);
    const sacar = m.el('button', 'boton principal grande', barra, 'Sacar más'), plantar = m.el('button', 'boton grande', barra, 'Plantarme');
    sacar.addEventListener('click', () => enviar({ elige: 'sacar' }));
    plantar.addEventListener('click', () => enviar({ elige: 'plantar' }));
    return (e, t, nombres) => {
      if (e.cofre >= COFRES) return;
      const c = cofresVivo(e.semilla)[e.cofre], mar = MARES[c.mar];
      titulo.textContent = `Cofre ${e.cofre + 1} de ${COFRES} · sacada ${Math.min(e.paso + 1, PASOS)}`;
      cielo.textContent = `${mar.icono} ${mar.nombre}`;
      cielo.className = `cofre-mar ${c.mar}`;
      const estado = (l: Lado) => (e.ola[l] ? '🌊 ¡se lo llevó la ola!' : !e.activo[l] ? `guardó (total ${e.total[l]})` : e.revela ? `${e.mano[l]} en la mano` : e.elige[l] ? (l === yo ? `elegiste ${e.elige[l] === 'sacar' ? 'sacar' : 'plantarte'}` : 'ya eligió') : 'pensando…');
      manos.textContent = `${nombres.a}: ${estado('a')} · ${nombres.b}: ${estado('b')}`;
      const puede = !!yo && e.activo[yo] && !e.elige[yo] && !e.revela && t >= 0;
      sacar.disabled = !puede;
      plantar.disabled = !puede || !yo || e.mano[yo] === 0;
      m.hud.tiempo(e.revela ? '¡Se revela!' : `${Math.max(0, Math.ceil(e.plazo - t))} s para elegir`);
      m.hud.extra(yo ? `Tu mano: ${e.mano[yo]}` : '');
      m.hud.puntos(`${nombres.a} ${e.total.a} · ${e.total.b} ${nombres.b}`);
    };
  },
};
