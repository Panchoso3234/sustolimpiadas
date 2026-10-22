import { fechaChile } from '../nucleo/azar';
import type { Persona, Equipo, Enfrentamiento } from './duelos';
import { puntosVersus, type Puntos } from './puntos';

// La liga del torneo (desde el 21 de octubre de 2026). 11 equipos de 3: 8 con un capitán del staff y 3 solo de participantes.
// Todos contra todos en 11 cruces (dos por semana, hasta el 28 de noviembre): en cada cruce se juegan 5 enfrentamientos de equipo contra equipo (3 duelos 1v1,
// al mejor de 3) y descansa un equipo. La tabla oficial suma SOLO duelos oficiales creados desde el inicio:
//  · cada duelo: ganar 10, empatar 6, perder 3 y no jugar 0, por el multiplicador de la jornada; van al jugador y a su equipo;
//  · bono de cruce: +5 (por el multiplicador) al equipo que gana 2 de los 3 duelos de su enfrentamiento.
// A la final (12 lugares) pasan los participantes de los 4 mejores equipos, sin el staff, y se completa con el mejor
// puntaje personal. El staff juega y suma para su equipo, pero nunca clasifica.

export const INICIO = '2026-10-21';
export const BONO_CRUCE = 5, EQUIPOS_A_LA_FINAL = 4, CUPOS_FINAL = 12;

/**
 * Los 11 cruces, dos por semana para no agobiar: miércoles a sábado (4 días) y domingo a martes (3 días).
 * Así cada persona juega 1 o 2 duelos por semana. La liga termina el sábado 28 de noviembre.
 */
export const CRUCES = [
  { n: 1, desde: '2026-10-21', hasta: '2026-10-24' }, { n: 2, desde: '2026-10-25', hasta: '2026-10-27' },
  { n: 3, desde: '2026-10-28', hasta: '2026-10-31' }, { n: 4, desde: '2026-11-01', hasta: '2026-11-03' },
  { n: 5, desde: '2026-11-04', hasta: '2026-11-07' }, { n: 6, desde: '2026-11-08', hasta: '2026-11-10' },
  { n: 7, desde: '2026-11-11', hasta: '2026-11-14' }, { n: 8, desde: '2026-11-15', hasta: '2026-11-17' },
  { n: 9, desde: '2026-11-18', hasta: '2026-11-21' }, { n: 10, desde: '2026-11-22', hasta: '2026-11-24' },
  { n: 11, desde: '2026-11-25', hasta: '2026-11-28' },
];
export const FIN = '2026-11-28';
/** Las cuatro jornadas (cada una con su multiplicador) agrupan cruces: 1-3, 4-6, 7-9 y 10-11. */
export const JORNADAS = [
  { n: 1, desde: '2026-10-21', hasta: '2026-10-31', cruces: [1, 2, 3] },
  { n: 2, desde: '2026-11-01', hasta: '2026-11-10', cruces: [4, 5, 6] },
  { n: 3, desde: '2026-11-11', hasta: '2026-11-21', cruces: [7, 8, 9] },
  { n: 4, desde: '2026-11-22', hasta: '2026-11-28', cruces: [10, 11] },
];

/** Jornada (1 a 4) de una fecha "AAAA-MM-DD"; antes del inicio cuenta como la 1. */
export const jornadaDe = (fecha: string) => JORNADAS.find((j) => fecha <= j.hasta)?.n ?? 4;
/** El cruce que corre en una fecha (o el próximo, si todavía no empieza). */
export const cruceDe = (fecha: string) => CRUCES.find((c) => fecha <= c.hasta) ?? null;

/**
 * Calendario de todos contra todos (método del círculo): para cada cruce, las parejas de equipos y el que descansa.
 * Con un número impar de equipos se agrega un "descanso"; así cada equipo descansa exactamente una vez.
 */
export function calendarioLiga<T>(equipos: T[]): { parejas: [T, T][]; descansa: T | null }[] {
  const lista: (T | null)[] = [...equipos];
  if (lista.length % 2) lista.push(null);
  const n = lista.length, rondas: { parejas: [T, T][]; descansa: T | null }[] = [];
  for (let r = 0; r < n - 1; r++) {
    const parejas: [T, T][] = [];
    let descansa: T | null = null;
    for (let i = 0; i < n / 2; i++) {
      const a = lista[i], b = lista[n - 1 - i];
      if (a === null) descansa = b; else if (b === null) descansa = a;
      else parejas.push(r % 2 ? [b, a] : [a, b]); // alternar quién es "A" para que nadie sea siempre el mismo lado
    }
    rondas.push({ parejas, descansa });
    lista.splice(1, 0, lista.pop()!); // el primero queda fijo; los demás giran
  }
  return rondas;
}

/** El calendario oficial: equipos del más nuevo al más antiguo, así el último equipo armado (Equipo 11, sin cuentas todavía) descansa en el cruce 1. */
export const calendarioDeEquipos = (equipos: { id: number }[]) => calendarioLiga([...equipos].sort((a, b) => b.id - a.id).map((q) => q.id));

/** Si un duelo cuenta para la tabla oficial: oficial, creado desde el inicio y ya cerrado. */
export const cuentaParaLaLiga = (e: Enfrentamiento) => e.oficial && e.modo === '1v1' && fechaChile(Date.parse(e.creado)) >= INICIO && e.estado === 'cerrado' && !!e.ganador;

export interface LineaEquipo { equipo: Equipo; puntos: number; porJornada: number[]; bonos: number; ganados: number; empatados: number; perdidos: number; sinJugar: number; capitan: string | null }
export interface LineaJugador { id: string; nombre: string; equipo: Equipo | null; puntos: number; ganados: number; empatados: number; perdidos: number; sinJugar: number; staff: boolean; clasifica: '' | 'equipo' | 'especial' }

/** Quién es staff: el capitán de cada equipo y las cuentas de administración y guardianes. */
export const esStaff = (id: string, equipos: Equipo[], personas: Persona[]) => equipos.some((q) => q.capitan === id) || personas.some((p) => p.id === id && p.rol !== 'jugador');

export function calcularLiga(equipos: Equipo[], personas: Persona[], duelos: Enfrentamiento[], p: Puntos) {
  const equipoDe = (id: string | null) => equipos.find((q) => id && q.miembros.includes(id)) ?? null;
  const lineas = new Map<number, LineaEquipo>(equipos.map((q) => [q.id, { equipo: q, puntos: 0, porJornada: [0, 0, 0, 0], bonos: 0, ganados: 0, empatados: 0, perdidos: 0, sinJugar: 0, capitan: q.capitan ?? null }]));
  const jugadores = new Map<string, LineaJugador>();
  const jugador = (id: string) => {
    let j = jugadores.get(id);
    if (!j) { j = { id, nombre: personas.find((x) => x.id === id)?.nombre ?? 'Participante', equipo: equipoDe(id), puntos: 0, ganados: 0, empatados: 0, perdidos: 0, sinJugar: 0, staff: esStaff(id, equipos, personas), clasifica: '' }; jugadores.set(id, j); }
    return j;
  };
  for (const q of equipos) for (const id of q.miembros) jugador(id);
  // Victorias de cada equipo en cada enfrentamiento de cruce, para el bono
  const enfrentamientos = new Map<string, { jornada: number; victorias: Map<number, number> }>();
  for (const d of duelos) {
    if (!cuentaParaLaLiga(d)) continue;
    for (const lado of ['a', 'b'] as const) {
      const id = lado === 'a' ? d.a_perfil : d.b_perfil;
      if (!id) continue;
      const j = jugador(id), noJugo = d.no_jugo === lado || d.no_jugo === 'ambos';
      const como = d.ganador === 'empate' ? 'empata' : d.ganador === lado ? 'gana' : 'pierde';
      const pts = noJugo ? 0 : puntosVersus(p, como, d.jornada);
      j.puntos += pts;
      if (noJugo) j.sinJugar++; else if (como === 'gana') j.ganados++; else if (como === 'empata') j.empatados++; else j.perdidos++;
      const linea = j.equipo ? lineas.get(j.equipo.id) : undefined;
      if (linea) {
        linea.puntos += pts; linea.porJornada[d.jornada - 1] += pts;
        if (noJugo) linea.sinJugar++; else if (como === 'gana') linea.ganados++; else if (como === 'empata') linea.empatados++; else linea.perdidos++;
      }
    }
    // Enfrentamiento de cruce: los dos equipos y quién ganó este duelo
    const qa = equipoDe(d.a_perfil), qb = equipoDe(d.b_perfil);
    if (d.cruce && qa && qb && qa.id !== qb.id && d.ganador !== 'empate') {
      const clave = `${d.cruce}|${Math.min(qa.id, qb.id)}|${Math.max(qa.id, qb.id)}`;
      const reg = enfrentamientos.get(clave) ?? { jornada: d.jornada, victorias: new Map<number, number>() };
      const ganador = d.ganador === 'a' ? qa.id : qb.id;
      reg.victorias.set(ganador, (reg.victorias.get(ganador) ?? 0) + 1);
      enfrentamientos.set(clave, reg);
    }
  }
  // Bono de cruce: el equipo que llega a 2 victorias en su enfrentamiento
  for (const reg of enfrentamientos.values()) for (const [equipo, v] of reg.victorias) {
    const linea = lineas.get(equipo);
    if (!linea || v < 2) continue;
    const bono = BONO_CRUCE * (p.multiplicadores[reg.jornada - 1] ?? 1);
    linea.puntos += bono; linea.bonos += bono; linea.porJornada[reg.jornada - 1] += bono;
  }
  const tabla = [...lineas.values()].sort((a, b) => b.puntos - a.puntos || b.ganados - a.ganados);
  const personal = [...jugadores.values()].sort((a, b) => b.puntos - a.puntos || b.ganados - a.ganados);
  // Quiénes van a la final si el torneo terminara hoy: participantes (sin staff) de los 4 primeros, más los mejores personales
  const hayPuntos = tabla.some((l) => l.puntos > 0);
  if (hayPuntos) {
    const top = new Set(tabla.slice(0, EQUIPOS_A_LA_FINAL).map((l) => l.equipo.id));
    for (const j of personal) if (!j.staff && j.equipo && top.has(j.equipo.id)) j.clasifica = 'equipo';
    let libres = CUPOS_FINAL - personal.filter((j) => j.clasifica).length;
    for (const j of personal) { if (libres <= 0) break; if (!j.staff && !j.clasifica && j.puntos > 0) { j.clasifica = 'especial'; libres--; } }
  }
  return { tabla, personal };
}
