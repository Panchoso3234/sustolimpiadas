// TSUKIBET: pronósticos de cada enfrentamiento de equipos de un cruce. Compartido por la web (pestaña TSUKIBET) y por
// La Cuarta (la función "diario"), para que los dos puntúen igual. Sin dependencias: Deno y Vite lo leen igual.
// Puntaje por enfrentamiento terminado: ganador correcto 3; marcador exacto +2; ir contra la mayoría (menos del 30 % eligió ese ganador) +1.

export interface Pronostico { cruce: number; perfil: string; a: number; b: number; ganador: number; marcador: string | null }
export interface DueloT { cruce: number | null; a: string | null; b: string | null; ganador: 'a' | 'b' | 'empate' | null; estado: string }
export interface AusenciaT { cruce: number; perfil: string; equipoRival: number }
export interface ResultadoPareja { a: number; b: number; ga: number; gb: number; terminado: boolean; ganador: number | null; marcador: string | null }
export interface PuntajeT { perfil: string; puntos: number; aciertos: number; exactos: number; contraCorriente: number; jugadas: number; perfecto: boolean }

export const MARCADORES = ['3-0', '2-1'] as const;
/** Clave de una pareja de equipos, sin importar el orden (el menor id primero, como se guarda en la base). */
export const clavePareja = (x: number, y: number) => `${Math.min(x, y)}|${Math.max(x, y)}`;

/** Cómo terminó cada enfrentamiento de equipos de un cruce (los equipos son los de hoy: los puntos van con la persona). */
export function resultadosCruce(cruce: number, duelos: DueloT[], ausencias: AusenciaT[], equipoDe: (perfil: string) => number | null): Map<string, ResultadoPareja> {
  const res = new Map<string, ResultadoPareja & { pendientes: number }>();
  const pareja = (x: number, y: number) => {
    const k = clavePareja(x, y);
    let r = res.get(k);
    if (!r) { r = { a: Math.min(x, y), b: Math.max(x, y), ga: 0, gb: 0, terminado: false, ganador: null, marcador: null, pendientes: 0 }; res.set(k, r); }
    return r;
  };
  const sumar = (r: ResultadoPareja, equipo: number) => { if (equipo === r.a) r.ga++; else if (equipo === r.b) r.gb++; };
  for (const d of duelos) {
    if (d.cruce !== cruce || !d.a || !d.b || d.estado === 'anulado') continue;
    const qa = equipoDe(d.a), qb = equipoDe(d.b);
    if (qa == null || qb == null || qa === qb) continue;
    const r = pareja(qa, qb);
    if (d.estado === 'pendiente' || !d.ganador) { r.pendientes++; continue; }
    if (d.ganador !== 'empate') sumar(r, d.ganador === 'a' ? qa : qb);
  }
  for (const x of ausencias) {
    if (x.cruce !== cruce) continue;
    const q = equipoDe(x.perfil);
    if (q == null || q === x.equipoRival) continue;
    sumar(pareja(q, x.equipoRival), q);
  }
  for (const r of res.values()) {
    r.terminado = r.pendientes === 0 && r.ga + r.gb > 0;
    r.ganador = !r.terminado || r.ga === r.gb ? null : r.ga > r.gb ? r.a : r.b;
    r.marcador = r.ganador == null ? null : `${Math.max(r.ga, r.gb)}-${Math.min(r.ga, r.gb)}`;
  }
  return res;
}

/** Qué parte de los pronósticos de una pareja va con el equipo `equipo` (0 a 1) y cuántos hay. */
export function reparto(pronosticos: Pronostico[], a: number, b: number, equipo: number) {
  const k = clavePareja(a, b), de = pronosticos.filter((p) => clavePareja(p.a, p.b) === k);
  return { total: de.length, parte: de.length ? de.filter((p) => p.ganador === equipo).length / de.length : 0 };
}

/** Puntaje de cada persona en un cruce (solo cuentan los enfrentamientos ya terminados). Ordenado de mayor a menor. */
export function puntuar(pronosticos: Pronostico[], resultados: Map<string, ResultadoPareja>): PuntajeT[] {
  const terminados = [...resultados.values()].filter((r) => r.terminado);
  const tabla = new Map<string, PuntajeT>();
  for (const p of pronosticos) {
    const t = tabla.get(p.perfil) ?? { perfil: p.perfil, puntos: 0, aciertos: 0, exactos: 0, contraCorriente: 0, jugadas: 0, perfecto: false };
    tabla.set(p.perfil, t);
    const r = resultados.get(clavePareja(p.a, p.b));
    if (!r?.terminado) continue;
    t.jugadas++;
    if (r.ganador == null || p.ganador !== r.ganador) continue;
    t.aciertos++; t.puntos += 3;
    if (p.marcador && p.marcador === r.marcador) { t.exactos++; t.puntos += 2; }
    if (reparto(pronosticos, r.a, r.b, r.ganador).parte < 0.3) { t.contraCorriente++; t.puntos += 1; }
  }
  for (const t of tabla.values()) t.perfecto = terminados.length > 0 && t.jugadas === terminados.length && t.aciertos === terminados.length;
  return [...tabla.values()].sort((x, y) => y.puntos - x.puntos || y.aciertos - x.aciertos);
}
