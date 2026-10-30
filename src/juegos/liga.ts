import { fechaChile } from '../nucleo/azar';
import { EX_MIEMBROS, equipoParaPuntos, type Ausencia, type Persona, type Equipo, type Enfrentamiento } from './duelos';
import { puntosVersus, type Puntos } from './puntos';

// La liga del torneo (desde el 21 de octubre de 2026). 12 equipos de 3: 8 con un capitán del staff y 4 solo de participantes.
// Todos contra todos en 11 cruces (dos por semana, hasta el 28 de noviembre): en cada cruce se juegan 6 enfrentamientos de equipo contra equipo (3 duelos 1v1,
// al mejor de 3); con 12 equipos nadie descansa. La tabla oficial suma SOLO duelos oficiales creados desde el inicio:
//  · cada duelo: ganar, empatar o perder según la tabla ajustes (hoy 7, 6 y 4) y no jugar 0, por el multiplicador de la jornada; van al jugador y a su equipo;
//  · bono de cruce: +5 (por el multiplicador) al equipo que gana 2 de los 3 duelos de su enfrentamiento.
// A la final (12 lugares) pasan los participantes de los 4 mejores equipos, sin el staff, y se completa con el mejor
// puntaje personal. El staff juega y suma para su equipo, pero nunca clasifica.

export const INICIO = '2026-10-21';
export const BONO_CRUCE = 5, EQUIPOS_A_LA_FINAL = 4, CUPOS_FINAL = 12;

import { CRUCES, calendarioLiga, calendarioDeEquipos } from '../../supabase/functions/_shared/calendario.ts';
export { CRUCES, calendarioLiga, calendarioDeEquipos };
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

/** Si un duelo cuenta para la tabla oficial: oficial, creado desde el inicio y ya cerrado. */
export const cuentaParaLaLiga = (e: Enfrentamiento) => e.oficial && e.modo === '1v1' && fechaChile(Date.parse(e.creado)) >= INICIO && e.estado === 'cerrado' && !!e.ganador;

export interface LineaEquipo { equipo: Equipo; puntos: number; porJornada: number[]; bonos: number; ganados: number; empatados: number; perdidos: number; sinJugar: number; capitan: string | null }
export interface LineaJugador { id: string; nombre: string; equipo: Equipo | null; puntos: number; ganados: number; empatados: number; perdidos: number; sinJugar: number; staff: boolean; clasifica: '' | 'equipo' | 'especial' }

/** Quién es staff: el capitán de cada equipo y las cuentas de administración y guardianes. */
export const esStaff = (id: string, equipos: Equipo[], personas: Persona[]) => equipos.some((q) => q.capitan === id) || personas.some((p) => p.id === id && p.rol !== 'jugador');

export function calcularLiga(equipos: Equipo[], personas: Persona[], duelos: Enfrentamiento[], p: Puntos, ausencias: Ausencia[] = []) {
  const equipoDe = (id: string | null) => equipoParaPuntos(equipos, id);
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
  // Victorias por ausencia: quien estaba gana (puntos de victoria y cuenta para el bono); el equipo del ausente suma un "sin jugar"
  for (const a of ausencias) {
    const j = jugador(a.perfil_id), pts = puntosVersus(p, 'gana', a.jornada);
    j.puntos += pts; j.ganados++;
    const linea = j.equipo ? lineas.get(j.equipo.id) : undefined;
    if (linea) { linea.puntos += pts; linea.porJornada[a.jornada - 1] += pts; linea.ganados++; }
    const rival = lineas.get(a.equipo_rival);
    if (rival) rival.sinJugar++;
    if (j.equipo && j.equipo.id !== a.equipo_rival) {
      const clave = `${a.cruce}|${Math.min(j.equipo.id, a.equipo_rival)}|${Math.max(j.equipo.id, a.equipo_rival)}`;
      const reg = enfrentamientos.get(clave) ?? { jornada: a.jornada, victorias: new Map<number, number>() };
      reg.victorias.set(j.equipo.id, (reg.victorias.get(j.equipo.id) ?? 0) + 1);
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
  // Un equipo que se disolvió (sin integrantes) sigue en el calendario para no reordenarlo, pero no en la tabla
  const tabla = [...lineas.values()].filter((l) => l.equipo.miembros.length || l.equipo.pendientes?.length).sort((a, b) => b.puntos - a.puntos || b.ganados - a.ganados);
  const personal = [...jugadores.values()].sort((a, b) => b.puntos - a.puntos || b.ganados - a.ganados);
  // Quiénes van a la final si el torneo terminara hoy: participantes (sin staff) de los 4 primeros, más los mejores personales
  const hayPuntos = tabla.some((l) => l.puntos > 0);
  if (hayPuntos) {
    const top = new Set(tabla.slice(0, EQUIPOS_A_LA_FINAL).map((l) => l.equipo.id));
    for (const j of personal) if (!j.staff && !(j.id in EX_MIEMBROS) && j.equipo && top.has(j.equipo.id)) j.clasifica = 'equipo';
    let libres = CUPOS_FINAL - personal.filter((j) => j.clasifica).length;
    for (const j of personal) { if (libres <= 0) break; if (!j.staff && !(j.id in EX_MIEMBROS) && !j.clasifica && j.puntos > 0) { j.clasifica = 'especial'; libres--; } }
  }
  return { tabla, personal };
}
