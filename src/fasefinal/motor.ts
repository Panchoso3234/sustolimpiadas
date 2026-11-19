// Motor de la FASE FINAL (gala simulada, lunes 23-11). Puro y determinista: la misma semilla da exactamente la misma
// simulación, así cualquiera puede repetirla cuando se revele la semilla. Reglas aprobadas por Pancho el 19-11 (vault,
// «Fase Final - planificación.md», punto 4): etapas largas, mérito suave, mochila de la Cornucopia, traiciones raras,
// banquete el Día 3 o 4, eventos de arena desde el Día 2 y seguro anti-eternidad el Día 5.
import { generador } from '../nucleo/azar';

export type Etapa = 'bano' | 'dia' | 'noche' | 'banquete' | 'arena';
export type Atributo = 'Velocidad' | 'Fuerza' | 'Precisión' | 'Agilidad' | 'Astucia' | 'Temple' | 'Instinto';
export type Categoria = 'arma' | 'supervivencia' | 'comida' | 'ingenio';

/** La mochila de la Cornucopia: objetos realistas (decisión de Pancho). */
export const OBJETOS: Record<string, Categoria> = {
  cuchillo: 'arma', machete: 'arma', hacha: 'arma', lanza: 'arma', 'arco con flechas': 'arma', 'cuchillos arrojadizos': 'arma', garrote: 'arma', honda: 'arma',
  botiquín: 'supervivencia', 'chaqueta térmica': 'supervivencia', linterna: 'supervivencia', carpa: 'supervivencia', cantimplora: 'supervivencia', 'botas de montaña': 'supervivencia', 'gafas de visión nocturna': 'supervivencia',
  raciones: 'comida', pan: 'comida', 'frutos secos': 'comida', 'olla con sopa': 'comida', 'botella de agua': 'comida',
  mapa: 'ingenio', cuerda: 'ingenio', 'trampa de alambre': 'ingenio', bengala: 'ingenio', silbato: 'ingenio', 'radio con una sola llamada': 'ingenio', binoculares: 'ingenio',
};

export interface Tributo {
  id: string; nombre: string;
  /** Poder de 0 a 1 (sale de la Fase 1: puntaje personal y récords). */
  poder: number;
  /** Equipo de la Fase 1 («distrito de origen»), solo para mostrar. */
  distrito?: string;
  /** Atributo principal (cambia el TIPO de evento, no la supervivencia). */
  atributo?: Atributo | null;
}

/**
 * Un evento del banco. El texto usa {1}, {2}… para los tributos. `muere`: los que mueren; `autores`: los que matan
 * (eligen por mérito). `requiere`: condiciones de un puesto (objeto de una categoría o un atributo). `da`: el objeto
 * que recibe un puesto. `traicion`: el {1} y el {2} son pareja y el {1} ataca al {2}.
 */
export interface Evento {
  id: string; etapas: Etapa[]; texto: string;
  muere?: number[]; autores?: number[];
  requiere?: { puesto: number; categoria?: Categoria; atributo?: Atributo }[];
  da?: { puesto: number; objeto: string }[];
  traicion?: boolean; pareja?: boolean;
  /** Solo para eventos de arena: a qué escenario pertenece. */
  escenario?: string;
}
export interface Escenario { id: string; titulo: string; intro: string }

export interface LineaGala { texto: string; tributos: string[]; muertos: string[] }
export interface PasoGala { tipo: Etapa | 'caidos'; titulo: string; intro?: string; lineas: LineaGala[] }
export interface ResultadoGala { pasos: PasoGala[]; ganador: string; caidas: string[]; sobrevivenBano: string[]; top3: string[] }

/** Un paracaídas del público: desde qué etapa (índice de paso) ayuda a ese tributo. */
export interface Patrocinio { tributo: string; desdePaso: number; fuerza: 1 | 2 }

/** Exponente del mérito (ver wVictima). Se puede ajustar para calibrar. */
export let INTENSIDAD = 2;
export const ponerIntensidad = (x: number) => { INTENSIDAD = x; };

const n = (e: Evento) => Math.max(...[...e.texto.matchAll(/\{(\d)\}/g)].map((m) => Number(m[1])));

/** Probabilidad de traición por etapa (decisión de Pancho): rara al principio, ~25 % en el banquete, ~50 % en la Noche 3. */
function probTraicion(tipo: Etapa, numero: number) {
  if (tipo === 'banquete') return 0.25;
  if (tipo === 'noche' && numero >= 3) return 0.5;
  return numero >= 2 ? 0.08 : 0.03;
}

/** Cuántos deberían caer en una etapa (sin reloj: el final llega por la suma de etapas). */
function metaMuertes(tipo: Etapa, vivos: number, total: number, r: () => number) {
  const f = tipo === 'bano' ? 0.28 + r() * 0.08 : tipo === 'banquete' ? 0.25 : tipo === 'arena' ? 0.3 + r() * 0.1 : 0.1 + r() * 0.1;
  const base = tipo === 'bano' ? total : vivos;
  return Math.min(vivos - 1, Math.max(tipo === 'bano' ? 2 : vivos > 2 ? 1 : 1, Math.round(base * f)));
}

export function simular(tributos: Tributo[], parejas: [string, string][], banco: Evento[], escenarios: Escenario[], semilla: string, patrocinios: Patrocinio[] = []): ResultadoGala {
  const r = generador(`fase-final|${semilla}`);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const pesado = <T,>(xs: T[], peso: (x: T) => number): T => {
    const ws = xs.map((x) => Math.max(0.0001, peso(x))), tot = ws.reduce((s, w) => s + w, 0);
    let k = r() * tot;
    for (let i = 0; i < xs.length; i++) { k -= ws[i]; if (k <= 0) return xs[i]; }
    return xs[xs.length - 1];
  };
  const porId = new Map(tributos.map((t) => [t.id, t]));
  const nombre = (id: string) => porId.get(id)!.nombre;
  const pareja = new Map<string, string>();
  for (const [a, b] of parejas) { pareja.set(a, b); pareja.set(b, a); }
  const vivos = new Set(tributos.map((t) => t.id));
  const mochila = new Map<string, string[]>(tributos.map((t) => [t.id, []]));
  const botiquinUsado = new Set<string>();
  const visto = new Map<string, number>(tributos.map((t) => [t.id, 0])); // última etapa en que apareció
  const caidas: string[] = [], pendientesCanon: string[] = [], pasos: PasoGala[] = [];
  let sobrevivenBano: string[] = [];

  const cat = (id: string) => (mochila.get(id) ?? []).map((o) => OBJETOS[o]);
  /** M: modificador por objetos y patrocinios; nunca baja de 0,80. */
  const M = (id: string, tipo: Etapa, paso: number) => {
    let m = 1;
    const c = cat(id);
    if (c.includes('arma')) m *= 0.95;
    if (c.includes('supervivencia')) m *= 0.95;
    if (c.includes('comida') && (tipo === 'noche' || tipo === 'dia')) m *= 0.95;
    if ((mochila.get(id) ?? []).includes('mapa') && (tipo === 'banquete' || tipo === 'arena')) m *= 0.9;
    for (const p of patrocinios) if (p.tributo === id && paso >= p.desdePaso) m *= p.fuerza === 2 ? 0.88 : 0.93;
    return Math.max(0.8, m);
  };
  // Mérito suave (fórmula aprobada) elevado a INTENSIDAD: en cada evento solo compiten 2 o 3, así que sin el exponente el
  // efecto se diluye. Calibrado para la meta del plan con 18 tributos: mejor ~9 %, promedio ~5,6 %, peor ~3,4 %.
  const wVictima = (id: string, tipo: Etapa, paso: number) => ((1.2 - 0.4 * porId.get(id)!.poder) * M(id, tipo, paso)) ** INTENSIDAD;
  const wAutor = (id: string) => ((0.8 + 0.4 * porId.get(id)!.poder) * (cat(id).includes('arma') ? 1.3 : 1)) ** INTENSIDAD;
  const cumple = (id: string, req?: { categoria?: Categoria; atributo?: Atributo }) => !req || ((!req.categoria || cat(id).includes(req.categoria)) && (!req.atributo || porId.get(id)!.atributo === req.atributo));

  /** Arma una línea con un evento y un grupo; devuelve null si el grupo no sirve para ese evento. */
  function aplicar(e: Evento, grupo: string[], tipo: Etapa, paso: number): LineaGala | null {
    const k = n(e);
    if (grupo.length !== k) return null;
    // Puestos: víctimas por mérito (w_v), autores por mérito (w_a), el resto al azar
    const libres = [...grupo], asignado = new Map<number, string>();
    const tomar = (puesto: number, peso: (id: string) => number) => {
      const req = e.requiere?.find((x) => x.puesto === puesto);
      const aptos = libres.filter((id) => cumple(id, req));
      if (!aptos.length) return false;
      const id = pesado(aptos, peso); asignado.set(puesto, id); libres.splice(libres.indexOf(id), 1); return true;
    };
    if (e.traicion || e.pareja) {
      const [a, b] = grupo;
      if (pareja.get(a) !== b) return null;
      if (e.traicion) { const victima = pesado([a, b], (id) => wVictima(id, tipo, paso)); asignado.set(2, victima); asignado.set(1, victima === a ? b : a); }
      else { asignado.set(1, a); asignado.set(2, b); }
      libres.length = 0;
    }
    for (const p of e.muere ?? []) if (!asignado.has(p) && !tomar(p, (id) => wVictima(id, tipo, paso))) return null;
    for (const p of e.autores ?? []) if (!asignado.has(p) && !tomar(p, wAutor)) return null;
    for (let p = 1; p <= k; p++) if (!asignado.has(p) && !tomar(p, () => 1)) return null;
    for (const req of e.requiere ?? []) if (!cumple(asignado.get(req.puesto)!, req)) return null;
    let texto = e.texto.replace(/\{(\d)\}/g, (_, d) => nombre(asignado.get(Number(d))!));
    const muertos: string[] = [];
    for (const p of e.muere ?? []) {
      const id = asignado.get(p)!;
      if ((mochila.get(id) ?? []).includes('botiquín') && !botiquinUsado.has(id) && r() < 0.4) {
        botiquinUsado.add(id); texto += ` Pero ${nombre(id)} saca el botiquín a tiempo y se salva.`; continue;
      }
      muertos.push(id);
    }
    for (const d of e.da ?? []) { const id = asignado.get(d.puesto)!; const m = mochila.get(id)!; if (m.length < 2 && !muertos.includes(id)) m.push(d.objeto); }
    return { texto, tributos: [...asignado.values()], muertos };
  }

  /** Una etapa completa: cada vivo aparece al menos una vez (y algunos, una segunda), con la meta de caídos. */
  function etapa(tipo: Etapa, numero: number, titulo: string, intro?: string, escenario?: string) {
    const paso = pasos.length, lineas: LineaGala[] = [];
    const vivosAntes = [...vivos];
    const meta = metaMuertes(tipo, vivos.size, tributos.length, r);
    let murieron = 0;
    const candidatos = banco.filter((e) => e.etapas.includes(tipo) && (tipo !== 'arena' || !e.escenario || e.escenario === escenario));
    // Traiciones primero (raras al principio)
    for (const a of vivosAntes) {
      const b = pareja.get(a);
      // Si los 2 últimos son pareja, se enfrentan sí o sí
      const final = vivos.size === 2;
      if (!b || a > b || !vivos.has(a) || !vivos.has(b) || (!final && r() >= probTraicion(tipo, numero))) continue;
      const opciones = candidatos.filter((e) => e.traicion);
      const l = opciones.length ? aplicar(pick(opciones), [a, b], tipo, paso) : null;
      if (l) { lineas.push(l); for (const m of l.muertos) { vivos.delete(m); caidas.push(m); pendientesCanon.push(m); murieron++; } for (const id of l.tributos) visto.set(id, paso); }
    }
    // Cola: todos los vivos que no aparecieron, los que llevan más rato sin aparecer van primero (un poco favorecidos)
    let cola = [...vivos].filter((id) => !lineas.some((l) => l.tributos.includes(id)));
    cola = cola.map((id) => [id, r() + (paso - (visto.get(id) ?? 0)) * 0.15] as const).sort((x, y) => y[1] - x[1]).map(([id]) => id);
    const extra = Math.floor(vivos.size * r() * 0.5); // apariciones extra: ~1 a 1,5 eventos por vivo
    let extras = 0, seguridad = 0;
    while ((cola.length || extras < extra) && vivos.size > 1 && seguridad++ < 400) {
      const enCola = cola.length > 0;
      const t = enCola ? cola[0] : pesado([...vivos], (id) => 1 + (paso - (visto.get(id) ?? 0)) * 0.3);
      if (!vivos.has(t)) { cola.shift(); continue; }
      const quedan = (enCola ? cola.length : 1) + (extra - extras);
      const pFatal = vivos.size <= 1 ? 0 : Math.min(0.9, Math.max(0, (meta - murieron) / Math.max(1, quedan)) * 1.6);
      const quiereFatal = r() < pFatal;
      let linea: LineaGala | null = null;
      for (let intento = 0; intento < 30 && !linea; intento++) {
        const opciones = candidatos.filter((e) => !e.traicion && !!e.muere?.length === quiereFatal && n(e) <= vivos.size);
        if (!opciones.length) break;
        const e = pick(opciones), k = n(e);
        const otrosCola = cola.filter((id) => id !== t && vivos.has(id)), otrosVivos = [...vivos].filter((id) => id !== t);
        const fuente = enCola && otrosCola.length >= k - 1 ? otrosCola : otrosVivos;
        if (fuente.length < k - 1) continue;
        const grupo = [t];
        const resto = [...fuente];
        while (grupo.length < k) { const x = e.pareja && grupo.length === 1 ? pareja.get(t) : pick(resto); if (!x || !resto.includes(x)) break; grupo.push(x); resto.splice(resto.indexOf(x), 1); }
        linea = aplicar(e, grupo, tipo, paso);
      }
      if (!linea) linea = { texto: `${nombre(t)} pasa la ${tipo === 'noche' ? 'noche' : 'jornada'} en silencio, atento a cualquier ruido.`, tributos: [t], muertos: [] };
      lineas.push(linea);
      for (const id of linea.tributos) { visto.set(id, paso); cola = cola.filter((x) => x !== id); }
      for (const m of linea.muertos) { vivos.delete(m); caidas.push(m); pendientesCanon.push(m); murieron++; }
      if (!enCola) extras++;
    }
    // Mochila de la Cornucopia: 45 % a 60 % de tomar un objeto según el mérito, 10 % de un segundo, máximo 2
    if (tipo === 'bano') {
      for (const id of vivos) {
        const m = mochila.get(id)!;
        if (m.length < 2 && r() < 0.45 + 0.15 * porId.get(id)!.poder) m.push(pick(Object.keys(OBJETOS)));
        if (m.length < 2 && r() < 0.1) m.push(pick(Object.keys(OBJETOS)));
      }
      sobrevivenBano = [...vivos];
    }
    pasos.push({ tipo, titulo, intro, lineas });
  }
  function canonazos(titulo: string) {
    const lista = pendientesCanon.splice(0);
    pasos.push({ tipo: 'caidos', titulo, lineas: lista.length ? lista.map((id) => ({ texto: `${nombre(id)}${porId.get(id)!.distrito ? ` · ${porId.get(id)!.distrito}` : ''}`, tributos: [id], muertos: [] })) : [{ texto: 'Hoy no sonó ningún cañonazo.', tributos: [], muertos: [] }] });
  }

  // ── La gala ──
  etapa('bano', 1, 'El baño de sangre');
  const diaBanquete = 3 + Math.floor(r() * 2);
  const arenaUsadas = new Set<string>();
  for (let dia = 1; vivos.size > 1 && dia <= 20; dia++) {
    etapa('dia', dia, `Día ${dia}`);
    if (vivos.size > 1 && dia === diaBanquete) etapa('banquete', dia, 'El banquete', 'Al amanecer suena la trompeta: en la Cornucopia esperan mochilas con lo que cada uno más necesita.');
    // Eventos de arena desde el Día 2; el Día 5 es seguro si quedan más de 4
    const forzar = dia >= 5 && vivos.size > 4;
    if (vivos.size > 1 && dia >= 2 && escenarios.length && (forzar || r() < 0.22)) {
      const libres = escenarios.filter((x) => !arenaUsadas.has(x.id)), esc = pick(libres.length ? libres : escenarios);
      arenaUsadas.add(esc.id);
      etapa('arena', dia, esc.titulo, esc.intro, esc.id);
    }
    if (vivos.size > 1) etapa('noche', dia, `Noche ${dia}`);
    canonazos(`Cañonazos · Noche ${dia}`);
  }
  // Si quedara más de uno por el tope de días (no debería pasar), el de más mérito gana
  if (vivos.size > 1) { const quedan = [...vivos].sort((a, b) => porId.get(b)!.poder - porId.get(a)!.poder); for (const id of quedan.slice(1)) { vivos.delete(id); caidas.push(id); } }
  const ganador = [...vivos][0];
  return { pasos, ganador, caidas, sobrevivenBano, top3: [ganador, ...caidas.slice(-2).reverse()] };
}
