import { CAJONES, COCINA, LISTO, SE_PICA, type Cosa, type Ingrediente, type Receta } from './cocinaRecetas';

// Un cocinero de máquina para Cocina Caótica (solo para pruebas y para la flecha del tutorial): mira el pedido más
// antiguo, decide a qué estación ir (y si hay que mantener la acción) y busca el camino por el piso.

export interface EncimaP { cosa?: Cosa; plato?: Cosa[] }
export interface EstP { tipo: string; cx: number; cz: number; encima: EncimaP; fuego?: number }
export interface VistaPiloto { mano: EncimaP; estaciones: EstP[]; pedidos: Receta[]; desde?: [number, number] }

const alcanzable = (s: EstP) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => COCINA[s.cz + dz]?.[s.cx + dx] === '.');
const listo = (k: Cosa) => k.estado === LISTO[k.ing];
const vacia = (s: EstP) => !s.encima.cosa && !s.encima.plato && !s.fuego;
const cajon = (v: VistaPiloto, ing: Ingrediente) => v.estaciones.find((s) => CAJONES[s.tipo] === ing);
/** Lo que el plato todavía no tiene de la receta (null si el plato trae algo que no va). */
const falta = (plato: Cosa[], r: Receta): Ingrediente[] | null =>
  plato.every((k) => r.ings.includes(k.ing) && listo(k)) ? r.ings.filter((i) => !plato.some((k) => k.ing === i)) : null;

/** A qué estación ir ahora y si hay que mantener la acción (picar, apagar). */
export function decidir(v: VistaPiloto): { est: EstP; mantener: boolean } | null {
  const ir = (est: EstP | undefined, mantener = false) => (est ? { est, mantener } : null);
  // Las estaciones de un tipo, de la más cercana a la más lejana (sin las que no se alcanzan)
  const dist = distancias(...(v.desde ?? [6, 6])), lejos = (s: EstP) => Math.min(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => dist.get(`${s.cx + dx},${s.cz + dz}`) ?? 999));
  const de = (t: string) => v.estaciones.filter((s) => s.tipo === t && alcanzable(s)).sort((a, b) => lejos(a) - lejos(b));
  const fuego = v.estaciones.find((s) => s.fuego);
  if (fuego) return ir(fuego, true);
  const pedidos = v.pedidos;
  if (!pedidos.length && !v.mano.cosa && !v.mano.plato) return null;
  const olla = de('O')[0], sopa = olla?.encima.cosa;
  const mesonLibre = de('#').find(vacia);
  // El plato de trabajo: uno sobre un mesón que sirva para algún pedido (el que menos le falte)
  const platos = de('#').filter((s) => s.encima.plato).map((s) => ({ s, f: Math.min(...pedidos.map((r) => falta(s.encima.plato!, r)?.length ?? 99)) })).sort((a, b) => a.f - b.f);
  const trabajo = platos[0] && platos[0].f < 99 ? platos[0].s : undefined;
  const faltaTrabajo = new Set<Ingrediente>(trabajo ? pedidos.flatMap((r) => falta(trabajo.encima.plato!, r) ?? []) : pedidos.flatMap((r) => r.ings));
  const necesita = (ing: Ingrediente) => pedidos.some((r) => r.ings.includes(ing) || (ing === 'tomate' && r.ings.includes('sopa')));

  if (v.mano.plato) {
    const p = v.mano.plato;
    if (pedidos.some((r) => falta(p, r)?.length === 0)) return ir(de('E')[0]);
    const quiere = pedidos.map((r) => falta(p, r)).filter((f): f is Ingrediente[] => !!f);
    if (!quiere.length) return ir(de('X')[0]);
    const q = new Set(quiere.flat());
    if (q.has('sopa') && sopa?.estado === 'cocido') return ir(olla);
    const asada = de('F').find((s) => s.encima.cosa?.ing === 'carne' && s.encima.cosa.estado === 'cocido');
    if (q.has('carne') && asada) return ir(asada);
    const picado = de('K').find((s) => s.encima.cosa && q.has(s.encima.cosa.ing) && listo(s.encima.cosa));
    if (picado) return ir(picado);
    if (q.has('pan')) return ir(cajon(v, 'pan'));
    return ir(mesonLibre);
  }
  if (v.mano.cosa) {
    const k = v.mano.cosa;
    if (k.estado === 'quemado' || !necesita(k.ing)) return ir(de('X')[0]);
    if (k.ing === 'tomate' && k.estado === 'picado' && olla && (!sopa || (sopa.estado === 'crudo' && (sopa.n ?? 0) < 2)) && pedidos.some((r) => r.ings.includes('sopa')) && (sopa || !faltaTrabajo.has('tomate'))) return ir(olla);
    if (!listo(k)) {
      if (k.estado === 'crudo' && SE_PICA.includes(k.ing)) return ir(de('K').find(vacia) ?? mesonLibre);
      if (k.ing === 'carne') return ir(de('F').find(vacia) ?? mesonLibre);
      return ir(de('X')[0]);
    }
    if (trabajo && faltaTrabajo.has(k.ing) && pedidos.some((r) => falta(trabajo.encima.plato!.concat(k), r) !== null)) return ir(trabajo);
    return ir(de('D')[0]);
  }
  // Manos libres
  const porPicar = de('K').find((s) => s.encima.cosa?.estado === 'crudo' && SE_PICA.includes(s.encima.cosa.ing));
  if (porPicar) return ir(porPicar, true);
  const paraEntregar = platos.find((x) => pedidos.some((r) => falta(x.s.encima.plato!, r)?.length === 0));
  if (paraEntregar) return ir(paraEntregar.s);
  const asada = de('F').find((s) => s.encima.cosa?.ing === 'carne' && s.encima.cosa.estado !== 'picado');
  if (asada && (asada.encima.cosa!.estado === 'quemado' || necesita('carne'))) return ir(asada);
  const suelto = [...de('K'), ...de('#'), ...de('D')].find((s) => s.encima.cosa && listo(s.encima.cosa) && necesita(s.encima.cosa.ing) && s.encima.cosa.ing !== 'sopa');
  if (suelto) return ir(suelto);
  const paraAsar = [...de('K'), ...de('#')].find((s) => s.encima.cosa?.ing === 'carne' && s.encima.cosa.estado === 'picado');
  if (paraAsar && de('F').some(vacia)) return ir(paraAsar);
  if (sopa?.estado === 'quemado') return ir(olla);
  if (sopa?.estado === 'cocido' && faltaTrabajo.has('sopa')) return ir(trabajo ?? de('D')[0]);
  // Ir a buscar lo que falta (lo que ya se está picando, asando o hirviendo no cuenta)
  const enCamino = new Set<Ingrediente>(v.estaciones.flatMap((s) => (s.encima.cosa && s.tipo !== 'O' && !CAJONES[s.tipo] ? [s.encima.cosa.ing] : [])));
  if (sopa && ((sopa.n ?? 0) >= 2 || sopa.estado === 'cocido')) enCamino.add('sopa');
  for (const r of pedidos) {
    const f = trabajo ? falta(trabajo.encima.plato!, r) : r.ings;
    if (!f) continue;
    for (const ing of f) {
      if (enCamino.has(ing)) continue;
      if (ing === 'sopa') { if (!sopa || (sopa.estado === 'crudo' && (sopa.n ?? 0) < 2)) return ir(cajon(v, 'tomate')); continue; }
      return ir(cajon(v, ing));
    }
    if (trabajo) break;
  }
  return null;
}

const piso = (cx: number, cz: number) => COCINA[cz]?.[cx] === '.';
/** Pasos por el piso desde una casilla hasta todas las demás. */
function distancias(cx: number, cz: number) {
  const d = new Map<string, number>([[`${cx},${cz}`, 0]]), cola: [number, number][] = [[cx, cz]];
  while (cola.length) {
    const [x, z] = cola.shift()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + dx},${z + dz}`; if (!d.has(k) && piso(x + dx, z + dz)) { d.set(k, d.get(`${x},${z}`)! + 1); cola.push([x + dx, z + dz]); } }
  }
  return d;
}
/** La siguiente casilla del camino hacia el piso de al lado de una estación (la misma si ya estás ahí), o null. */
export function rumbo(cx: number, cz: number, est: { cx: number; cz: number }): [number, number] | null {
  const meta = (x: number, z: number) => Math.abs(x - est.cx) + Math.abs(z - est.cz) === 1;
  if (meta(cx, cz) && piso(cx, cz)) return [cx, cz];
  const previo = new Map<string, string | null>([[`${cx},${cz}`, null]]), cola: [number, number][] = [[cx, cz]];
  while (cola.length) {
    const [x, z] = cola.shift()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = x + dx, b = z + dz, k = `${a},${b}`;
      if (previo.has(k) || !piso(a, b)) continue;
      previo.set(k, `${x},${z}`);
      if (meta(a, b)) {
        let paso = k;
        while (previo.get(paso) !== `${cx},${cz}` && previo.get(paso)) paso = previo.get(paso)!;
        return paso.split(',').map(Number) as [number, number];
      }
      cola.push([a, b]);
    }
  }
  return null;
}
