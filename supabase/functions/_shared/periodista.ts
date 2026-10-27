// La Cuarta (el diario del torneo): el periodista. Recibe lo que pasó en un cruce (duelos con sus rondas, tabla, récords, ausencias) y
// escribe la edición: portada, crónicas, la figura, la polémica, el termómetro de la tabla, los números, la columna del
// editor, la agenda y la crónica (repaso del cruce y la previa del siguiente, con leña al fuego). Sin dependencias ni IA: plantillas con mucha variación, elegidas con una semilla
// (así la misma edición sale igual si se vuelve a generar). Toda cifra sale de los datos; nunca se inventa un resultado.
// Tono de tabloide deportivo: picante con lo que pasó en la cancha, nunca con las personas.
import { CRUCES, calendarioDeEquipos } from './calendario.ts';
import { puntuar, reparto, resultadosCruce, type Pronostico } from './tsukibet.ts';

export const NOMBRE_DIARIO = 'La Cuarta';

// ───────── Lo que entra ─────────
export interface Persona { id: string; nombre: string; avatar: string | null }
export interface EquipoD { id: number; nombre: string; miembros: string[]; capitan: string | null }
export interface RondaD { ronda: number; lado: 'a' | 'b'; puntaje: number; terminado: boolean }
export interface DueloD { id: number; cruce: number; juego: string; a: string; b: string; ganador: 'a' | 'b' | 'empate' | null; estado: string; puntosA: number; puntosB: number; noJugo: 'a' | 'b' | 'ambos' | null; muerteSubita: number; jornada: number; rondas: RondaD[] }
export interface AusenciaD { cruce: number; jornada: number; perfil: string; equipoRival: number; ausente: string }
export interface MarcaD { perfil: string; juego: string; puntaje: number; fecha: string }
export interface Datos {
  cruce: number; numero: number;
  personas: Persona[]; equipos: EquipoD[];
  /** Todos los duelos oficiales de la liga (de todos los cruces). */
  duelos: DueloD[]; ausencias: AusenciaD[];
  /** Marcas individuales: las del cruce y, para saber si algo es récord histórico, el mejor puntaje previo de cada juego. */
  marcasCruce: MarcaD[]; mejorPrevio: Record<string, number>;
  juegos: Record<string, string>;
  puntos: { victoria: number; empate: number; derrota: number; multiplicadores: number[] };
  /** TSUKIBET (los de este cruce y el siguiente) y las declaraciones antes de los duelos (sin las ocultas). */
  pronosticos?: Pronostico[]; declaraciones?: { enf: number; perfil: string; texto: string }[];
}

// ───────── Lo que sale ─────────
export type Tipo = 'muerte' | 'remontada' | 'batacazo' | 'agonica' | 'paliza' | 'empate' | 'ausente' | 'derbi' | 'normal';
export interface Nota { tipo: Tipo; seccion: string; titular: string; bajada: string; cuerpo: string; protagonistas: string[]; cifra: string; puntaje: number; duelo: number | null; sello: string }
export interface Cruce { a: number; b: number; ga: number; gb: number; bono: number | null; duelos: { a: string; b: string; juego: string; res: string; ganador: 'a' | 'b' | 'empate' | null }[] }
export interface Termo { equipo: number; puesto: number; antes: number; puntos: number; delta: number; final: boolean }
export interface Record_ { juego: string; persona: string; puntaje: number; historico: boolean }
export interface Cifra { etiqueta: string; valor: string; detalle: string }
export interface Barra { etiqueta: string; valor: number }
export interface Previa { a: number; b: number; titular: string; texto: string; derbi: boolean; duelos: { a: string; b: string; juego: string }[] }
export interface Cronica { titulo: string; entrada: string; repaso: string[]; previas: Previa[] }
export interface Edicion {
  nombre: string; numero: number; cruce: number; desde: string; hasta: string; jornada: number; generado: string;
  portada: Nota; notas: Nota[]; figura: Nota | null; caido: Nota | null; polemica: Nota | null;
  cruces: Cruce[]; termometro: Termo[]; records: Record_[]; estadisticas: Cifra[]; juegosMasJugados: Barra[]; mejoresJugadores: { persona: string; ganados: number; jugados: number; puntos: number }[];
  columna: { titulo: string; texto: string }; agenda: { cruce: number; desde: string; hasta: string; parejas: { a: number; b: number; derbi: boolean }[] } | null;
  cronica: Cronica;
  tsukibet: { participantes: number; plenos: string[]; tabla: { persona: string; puntos: number; aciertos: number }[] } | null;
  ticker: string[];
  personas: Record<string, { nombre: string; avatar: string | null; equipo: number | null }>;
  equipos: Record<number, string>;
  juegos: Record<string, string>;
}

// ───────── Utilidades ─────────
/** Generador con semilla (mulberry32 sobre un hash del texto): la misma edición siempre redacta igual. */
function azar(semilla: string) {
  let h = 1779033703 ^ semilla.length;
  for (let i = 0; i < semilla.length; i++) { h = Math.imul(h ^ semilla.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const miles = (n: number) => Math.round(n).toLocaleString('es-CL');
const fechaLarga = (f: string) => { const [, m, d] = f.split('-').map(Number); return `${d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m - 1]}`; };
const jornadaDe = (fecha: string) => (fecha <= '2026-10-31' ? 1 : fecha <= '2026-11-10' ? 2 : fecha <= '2026-11-21' ? 3 : 4);
/** Rellena {X} con los valores. */
const llenar = (plantilla: string, v: Record<string, string>) => plantilla.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

// ───────── Plantillas (al menos 8 titulares y 6 leads por tipo de noticia) ─────────
const TITULARES: Record<Tipo, string[]> = {
  agonica: [
    '{G} sobrevivió: le ganó a {P} por apenas {M}', 'Por un pelo: {G} se impuso a {P} por {M}', '¡Al límite! {G} le arrancó el duelo a {P} por {M}',
    '{G} y {P} al borde del infarto: ganó {G} por {M}', 'Agónico: {G} le ganó a {P} con solo {M} de ventaja', '{P} lo tuvo en la mano y se le escapó: {G} ganó por {M}',
    'Final de foto en {J}: {G} por {M}', '{G} sufrió, pero ganó: {M} lo separaron de {P}', 'Ni un suspiro de diferencia: {G} a {P} por {M}',
  ],
  paliza: [
    'Paliza de {G}: le pasó por encima a {P}', '{G} no tuvo piedad con {P} en {J}', 'Baile en {J}: {G} goleó a {P}', 'Sin discusión: {G} aplastó a {P}',
    '{G} dio una exhibición y {P} solo pudo mirar', 'Demolición: {G} le sacó {M} a {P}', '{P} no encontró respuesta ante un {G} imparable', '{G} firmó la paliza del cruce en {J}',
  ],
  remontada: [
    '¡Remontada! {G} dio vuelta el duelo ante {P}', '{G} estaba contra las cuerdas y le ganó a {P}', 'De la lona a la gloria: {G} remontó a {P}', '{P} ganaba y {G} le dio vuelta la historia',
    'Épico: {G} perdió la primera y terminó ganándole a {P}', '{G} resucitó en {J} y dejó sin nada a {P}', 'Nunca des por muerto a {G}: remontada ante {P}', 'Vuelta y media: {G} dio vuelta su duelo con {P}',
  ],
  batacazo: [
    'Batacazo: {G} tumbó a {P}', '¡Sorpresa! {G}, desde abajo, le ganó a {P}', 'Nadie lo vio venir: {G} venció a {P}', 'El de abajo mordió: {G} derrotó a {P}',
    'Golpe en la tabla: {G} le ganó a {P}', '{EG} da la campanada con {G}', 'David contra Goliat: {G} se quedó con el duelo ante {P}', 'Se cayó el favorito: {P} perdió con {G}',
  ],
  muerte: [
    'Muerte súbita: {G} sobrevivió a {P}', 'Se necesitó una ronda extra y la ganó {G}', 'Tensión total: {G} y {P} se fueron a la muerte súbita', '{G} ganó el duelo más largo del cruce',
    'Ni tres rondas alcanzaron: {G} se impuso a {P} en la muerte súbita', 'Desempate de infarto en {J}: ganó {G}', '{P} cayó en la ronda que nadie quiere jugar', 'Al filo del final: {G} sobre {P}',
  ],
  empate: [
    'Nadie quiso perder: {A} y {B} empataron', 'Tablas en {J}: {A} y {B} se repartieron todo', 'Empate de guapos entre {A} y {B}', 'Ni para uno ni para otro: {A} y {B} igualaron',
    'Duelo sin dueño: {A} y {B} quedaron a mano', '{A} y {B}, idénticos en {J}', 'Empate y polémica: {A} contra {B}', 'Iguales hasta el final: {A} y {B}',
  ],
  ausente: [
    '{P} no se presentó y {G} ganó sin jugar', 'Silla vacía: {G} se llevó los puntos ante la ausencia de {P}', 'Victoria por ausencia para {G}', '{G} ganó por no presentación de {P}',
    'El duelo que no fue: {G} gana sin jugar', 'Se esperó a {P} y nunca llegó', '{G} suma sin despeinarse: {P} no jugó', 'Puntos regalados: {P} faltó a su duelo',
  ],
  derbi: [
    'Derbi de la tabla: {G} le ganó a {P}', 'Clásico de vecinos: {G} sobre {P}', '{G} ganó el duelo entre vecinos de la tabla', 'Duelo directo: {G} se impuso a {P}',
    'En la pelea de la tabla, {G} pudo más que {P}', '{EG} gana el duelo directo con {G}', 'Seis puntos en juego y se los llevó {G}', '{G} manda en el clásico ante {P}',
  ],
  normal: [
    '{G} cumplió ante {P}', '{G} se quedó con el duelo de {J}', 'Triunfo de {G} sobre {P}', '{G} le ganó a {P} en {J}',
    '{G} no falló: venció a {P}', 'Trabajo hecho: {G} sobre {P}', '{G} sumó para {EG} ante {P}', 'Victoria de {G} en {J}',
  ],
};
const LEADS: Record<Tipo, string[]> = {
  agonica: [
    '{G} se impuso {R} a {P} en {J}, y la diferencia final fue de apenas {M}. Un error más y la historia era otra.',
    'Fue un duelo que se decidió en los detalles. {G} superó a {P} en {J} {R}, con solo {M} de ventaja.',
    'Hubo que mirar el marcador dos veces: {G} le ganó a {P} {R} en {J} y los separaron {M}.',
    '{P} vendió cara la derrota. {G} terminó ganando {R} en {J}, por {M}.',
    'Nervios hasta el final en {J}: {G} superó {R} a {P} y la distancia fue de {M}.',
    'El duelo más apretado del cruce lo ganó {G}: {R} ante {P} en {J}, por {M}.',
  ],
  paliza: [
    '{G} pasó por encima de {P} en {J}: ganó {R} y le sacó {M} de diferencia.',
    'No hubo partido. {G} dominó de principio a fin y le ganó {R} a {P} en {J}, con {M} de ventaja.',
    '{G} jugó a otro ritmo: {R} sobre {P} en {J} y una diferencia de {M}.',
    'Exhibición de {G} en {J}. {P} no encontró la forma y perdió {R}, con {M} en contra.',
    'Contundente: {G} venció {R} a {P} en {J}. La diferencia, {M}, lo dice todo.',
    '{P} se quedó sin respuestas. {G} ganó {R} en {J} y se fue con {M} a favor.',
  ],
  remontada: [
    '{P} ganó la primera ronda y parecía tenerlo, pero {G} reaccionó y se quedó con el duelo {R} en {J}.',
    'Empezó perdiendo, se levantó y ganó: {G} dio vuelta su duelo con {P} en {J} ({R}).',
    '{G} perdió la ronda inicial en {J}, pero ganó las siguientes y terminó {R} sobre {P}.',
    'Remontada de manual en {J}: {G} arrancó abajo ante {P} y terminó ganando {R}.',
    'Cuando parecía que {P} se llevaba el duelo, {G} cambió la cara del {J} y ganó {R}.',
    'De menos a más: {G} superó a {P} {R} en {J} después de perder la primera ronda.',
  ],
  batacazo: [
    '{G}, de {EG} (puesto {PG} antes del cruce), le ganó a {P}, de {EP} (puesto {PP}), en {J}. Resultado: {R}.',
    'La tabla decía otra cosa, pero en {J} mandó {G}: {R} sobre {P}. {EG} venía desde el puesto {PG}; {EP}, desde el {PP}.',
    'Sorpresa en {J}: {G} superó {R} a {P}. Desde el puesto {PG}, {EG} le quitó puntos a {EP}, que venía {PP}.',
    'Nadie apostaba por {G} y terminó ganando {R} en {J} ante {P}, del equipo que venía {PP}.',
    '{G} se agrandó en {J} y le ganó {R} a {P}. {EG}, puesto {PG}, se dio el gusto ante {EP}, puesto {PP}.',
    'Golpe en {J}: {G} venció {R} a {P}, cuyo equipo venía bastante más arriba en la tabla.',
  ],
  muerte: [
    'Tres rondas no alcanzaron. {G} y {P} se fueron a la muerte súbita en {J} y ganó {G}.',
    'El duelo entre {G} y {P} en {J} terminó igualado y hubo que jugar más: se lo quedó {G}.',
    'Muerte súbita en {J}: {G} aguantó la presión y venció a {P}.',
    '{G} y {P} no se sacaron ventaja en {J} hasta la ronda extra, donde mandó {G}.',
    'Igualdad total entre {G} y {P} en {J}. La muerte súbita eligió a {G}.',
    'Duelo eterno en {J}: {G} le ganó a {P} en la ronda extra.',
  ],
  empate: [
    '{A} y {B} terminaron igualados en {J}. Ninguno pudo sacar diferencia.',
    'Empate en {J}: {A} y {B} se fueron con el mismo resultado.',
    'Ni {A} ni {B} se dejaron ganar en {J}. El duelo terminó en tablas.',
    '{A} contra {B} en {J} terminó sin ganador.',
    'Paridad absoluta en {J}: {A} y {B} quedaron empatados.',
    'El duelo de {J} entre {A} y {B} no tuvo dueño.',
  ],
  ausente: [
    '{G} ganó sin jugar: {P} no se presentó a su duelo de {J}.',
    'La ausencia de {P} le dio la victoria a {G} en {J}. Puntos que pesan en la tabla.',
    '{P} no jugó su duelo de {J} y los puntos fueron para {G}.',
    'Se esperó a {P} hasta el último día del cruce, pero no apareció: ganó {G}.',
    'Victoria por ausencia para {G} en {J}. {P} se quedó sin sumar.',
    '{G} se llevó los puntos de {J} porque {P} no jugó.',
  ],
  derbi: [
    'Duelo directo entre vecinos de la tabla: {G} ({EG}) le ganó {R} a {P} ({EP}) en {J}.',
    '{EG} y {EP} venían pegados en la tabla. En {J}, {G} desequilibró y ganó {R}.',
    '{G} se quedó con el clásico de {J}: {R} ante {P}, en un duelo que mueve la tabla.',
    'Partido de seis puntos: {G} venció {R} a {P} en {J} y {EG} sacó ventaja.',
    'En el duelo directo de la tabla, {G} pudo más: {R} sobre {P} en {J}.',
    '{G} ganó {R} en {J} y le quitó un rival directo a {EG}.',
  ],
  normal: [
    '{G} le ganó {R} a {P} en {J} y sumó para {EG}.',
    'Victoria de {G} sobre {P} en {J}, {R}.',
    '{G} cumplió en {J}: {R} ante {P}.',
    'En {J}, {G} superó a {P} {R}.',
    '{G} se quedó con su duelo de {J} ante {P}, {R}.',
    '{G} ganó {R} en {J} y {P} se quedó sin puntos.',
  ],
};
const SELLOS: Record<Tipo, string> = { muerte: 'MUERTE SÚBITA', remontada: 'REMONTADA', batacazo: 'BATACAZO', agonica: 'AL LÍMITE', paliza: 'PALIZA', empate: 'EMPATE', ausente: 'SILLA VACÍA', derbi: 'DERBI', normal: 'RESULTADO' };
const SECCIONES: Record<Tipo, string> = { muerte: 'Infarto', remontada: 'Épica', batacazo: 'Sorpresa', agonica: 'Al límite', paliza: 'Exhibición', empate: 'Tablas', ausente: 'La ausencia', derbi: 'El clásico', normal: 'Resultados' };

// ───────── Tabla de equipos (las mismas reglas que la web: los puntos van con la persona) ─────────
function tablaHasta(d: Datos, hasta: number) {
  const equipoDe = (id: string) => d.equipos.find((q) => q.miembros.includes(id))?.id ?? null;
  const pts = new Map<number, number>(d.equipos.map((q) => [q.id, 0])), ganados = new Map<number, number>(d.equipos.map((q) => [q.id, 0]));
  const victorias = new Map<string, Map<number, number>>(), jornadaClave = new Map<string, number>();
  const sumar = (q: number | null, p: number, gana = false) => { if (q == null || !pts.has(q)) return; pts.set(q, pts.get(q)! + p); if (gana) ganados.set(q, ganados.get(q)! + 1); };
  const pv = (res: 'gana' | 'empata' | 'pierde', j: number) => (res === 'gana' ? d.puntos.victoria : res === 'empata' ? d.puntos.empate : d.puntos.derrota) * (d.puntos.multiplicadores[j - 1] ?? 1);
  for (const x of d.duelos) {
    if (x.cruce > hasta || x.estado !== 'cerrado' || !x.ganador) continue;
    for (const lado of ['a', 'b'] as const) {
      const id = lado === 'a' ? x.a : x.b, noJugo = x.noJugo === lado || x.noJugo === 'ambos', res = x.ganador === 'empate' ? 'empata' : x.ganador === lado ? 'gana' : 'pierde';
      sumar(equipoDe(id), noJugo ? 0 : pv(res, x.jornada), res === 'gana' && !noJugo);
    }
    const qa = equipoDe(x.a), qb = equipoDe(x.b);
    if (qa != null && qb != null && qa !== qb && x.ganador !== 'empate') {
      const k = `${x.cruce}|${Math.min(qa, qb)}|${Math.max(qa, qb)}`, m = victorias.get(k) ?? new Map<number, number>(), g = x.ganador === 'a' ? qa : qb;
      m.set(g, (m.get(g) ?? 0) + 1); victorias.set(k, m); jornadaClave.set(k, x.jornada);
    }
  }
  for (const a of d.ausencias) {
    if (a.cruce > hasta) continue;
    const q = equipoDe(a.perfil);
    sumar(q, pv('gana', a.jornada), true);
    if (q != null && q !== a.equipoRival) { const k = `${a.cruce}|${Math.min(q, a.equipoRival)}|${Math.max(q, a.equipoRival)}`, m = victorias.get(k) ?? new Map<number, number>(); m.set(q, (m.get(q) ?? 0) + 1); victorias.set(k, m); jornadaClave.set(k, a.jornada); }
  }
  for (const [k, m] of victorias) for (const [q, v] of m) if (v >= 2) sumar(q, 5 * (d.puntos.multiplicadores[(jornadaClave.get(k) ?? 1) - 1] ?? 1));
  return d.equipos.filter((q) => q.miembros.length).map((q) => ({ equipo: q.id, puntos: Math.round(pts.get(q.id)! * 100) / 100, ganados: ganados.get(q.id)! }))
    .sort((a, b) => b.puntos - a.puntos || b.ganados - a.ganados);
}

// ───────── La redacción ─────────
export function redactar(d: Datos): Edicion {
  const r = azar(`diario|${d.cruce}|${d.numero}`), elegir = <T,>(l: T[]) => l[Math.floor(r() * l.length)];
  const fechas = CRUCES.find((c) => c.n === d.cruce) ?? { n: d.cruce, desde: '', hasta: '' }, jornada = jornadaDe(fechas.desde || '2026-10-21');
  const persona = (id: string) => d.personas.find((p) => p.id === id);
  const nombre = (id: string) => persona(id)?.nombre ?? 'Alguien';
  const equipoDe = (id: string) => d.equipos.find((q) => q.miembros.includes(id)) ?? null;
  const juego = (id: string) => d.juegos[id] ?? id;
  const antes = tablaHasta(d, d.cruce - 1), ahora = tablaHasta(d, d.cruce);
  // En el primer cruce no hay tabla previa: sin batacazos, derbis ni flechas de subida
  const hayTabla = antes.some((x) => x.puntos > 0);
  const puestoAntes = (q: number | null) => (q == null || !hayTabla ? 0 : antes.findIndex((x) => x.equipo === q) + 1);
  const delCruce = d.duelos.filter((x) => x.cruce === d.cruce);
  const cerrados = delCruce.filter((x) => x.estado === 'cerrado' && x.ganador);

  // Cada duelo: margen en puntos (suma de las rondas que jugaron los dos), rondas y el ángulo de la noticia
  const notas: Nota[] = [];
  for (const x of cerrados) {
    const ga = x.ganador === 'a', empate = x.ganador === 'empate', G = empate ? x.a : ga ? x.a : x.b, P = empate ? x.b : ga ? x.b : x.a;
    const rondasN = [...new Set(x.rondas.map((y) => y.ronda))].sort((a, b) => a - b);
    const por = (lado: 'a' | 'b', n: number) => x.rondas.find((y) => y.lado === lado && y.ronda === n && y.terminado)?.puntaje ?? null;
    const ambas = rondasN.filter((n) => por('a', n) !== null && por('b', n) !== null);
    const sumaG = ambas.reduce((s, n) => s + (por(ga || empate ? 'a' : 'b', n) ?? 0), 0), sumaP = ambas.reduce((s, n) => s + (por(ga || empate ? 'b' : 'a', n) ?? 0), 0);
    const margen = sumaG - sumaP, relativo = Math.max(sumaG, sumaP) > 0 ? Math.abs(margen) / Math.max(sumaG, sumaP) : 0;
    const rg = ga ? x.puntosA : x.puntosB, rp = ga ? x.puntosB : x.puntosA;
    const primeraParaP = ambas.length > 0 && (por(ga ? 'b' : 'a', ambas[0]) ?? 0) > (por(ga ? 'a' : 'b', ambas[0]) ?? 0);
    const qG = equipoDe(G), qP = equipoDe(P), pG = puestoAntes(qG?.id ?? null), pP = puestoAntes(qP?.id ?? null);
    const noJugo = x.noJugo && x.noJugo !== 'ambos';
    let tipo: Tipo = 'normal', puntaje = 30;
    if (empate) { tipo = 'empate'; puntaje = 62; }
    else if (noJugo) { tipo = 'ausente'; puntaje = 45; }
    else if (x.muerteSubita > 0) { tipo = 'muerte'; puntaje = 92; }
    else if (primeraParaP && rg >= 2) { tipo = 'remontada'; puntaje = 85; }
    else if (pG && pP && pG - pP >= 4) { tipo = 'batacazo'; puntaje = 78 + Math.min(10, pG - pP); }
    else if (ambas.length && relativo < 0.08) { tipo = 'agonica'; puntaje = 70 + (0.08 - relativo) * 250; }
    else if (ambas.length && rp === 0 && relativo > 0.35) { tipo = 'paliza'; puntaje = 58 + Math.min(20, relativo * 25); }
    else if (pG && pP && Math.abs(pG - pP) === 1) { tipo = 'derbi'; puntaje = 55; }
    const M = ambas.length ? `${miles(Math.abs(margen))} puntos` : `${rg} rondas a ${rp}`;
    const v = { G: nombre(G), P: nombre(P), A: nombre(x.a), B: nombre(x.b), J: juego(x.juego), M, R: empate ? 'empatado' : `${rg} a ${rp}`, EG: qG?.nombre ?? 'su equipo', EP: qP?.nombre ?? 'su equipo', PG: String(pG || '-'), PP: String(pP || '-') };
    const titular = llenar(elegir(TITULARES[tipo]), v), lead = llenar(elegir(LEADS[tipo]), v);
    const dijo = (id: string) => d.declaraciones?.find((y) => y.enf === x.id && y.perfil === id)?.texto;
    // Si habló antes y perdió, se lo recordamos; si ganó, lo había avisado
    const frase = empate ? '' : dijo(P) ? `${nombre(P)} había dicho: «${dijo(P)}». Perdió ${rg} a ${rp}. ` : dijo(G) ? `${nombre(G)} lo avisó antes: «${dijo(G)}». ` : '';
    if (frase) puntaje += dijo(P) ? 8 : 3;
    const detalle = ambas.map((n) => `Ronda ${n}: ${miles(por(ga || empate ? 'a' : 'b', n) ?? 0)} a ${miles(por(ga || empate ? 'b' : 'a', n) ?? 0)}`).join(' · ');
    notas.push({
      tipo, seccion: SECCIONES[tipo], titular, bajada: lead, cuerpo: `${frase}${detalle ? `${detalle}.` : ''}`.trim(), protagonistas: [G, P],
      cifra: ambas.length ? (tipo === 'paliza' ? `+${miles(Math.abs(margen))}` : `${miles(Math.abs(margen))} pts`) : `${rg}-${rp}`, puntaje, duelo: x.id, sello: SELLOS[tipo],
    });
  }
  // Victorias por ausencia del cruce (sin duelo creado: el rival nunca entró a la web)
  for (const a of d.ausencias.filter((x) => x.cruce === d.cruce)) {
    const v = { G: nombre(a.perfil), P: a.ausente, J: 'su duelo', M: '', R: '', EG: equipoDe(a.perfil)?.nombre ?? 'su equipo', EP: '', A: '', B: '', PG: '', PP: '' };
    notas.push({ tipo: 'ausente', seccion: SECCIONES.ausente, titular: llenar(elegir(TITULARES.ausente), v), bajada: llenar(elegir(LEADS.ausente), v), cuerpo: '', protagonistas: [a.perfil], cifra: 'W.O.', puntaje: 40, duelo: null, sello: SELLOS.ausente });
  }
  notas.sort((a, b) => b.puntaje - a.puntaje);

  // Los enfrentamientos de equipos (cuántos duelos ganó cada uno y quién se llevó el bono)
  const armarCruces = (n: number) => {
  const cruces: Cruce[] = [];
  for (const x of d.duelos.filter((y) => y.cruce === n)) {
    const qa = equipoDe(x.a)?.id, qb = equipoDe(x.b)?.id;
    if (qa == null || qb == null) continue;
    let c = cruces.find((y) => (y.a === qa && y.b === qb) || (y.a === qb && y.b === qa));
    if (!c) { c = { a: qa, b: qb, ga: 0, gb: 0, bono: null, duelos: [] }; cruces.push(c); }
    const invertido = c.a !== qa, ga = x.ganador === 'a', ganadorEquipo = x.ganador === 'empate' || !x.ganador ? null : ga ? qa : qb;
    if (ganadorEquipo === c.a) c.ga++; else if (ganadorEquipo === c.b) c.gb++;
    c.duelos.push({ a: invertido ? x.b : x.a, b: invertido ? x.a : x.b, juego: x.juego, res: x.ganador === 'empate' ? 'empate' : x.ganador ? (invertido ? `${x.puntosB}-${x.puntosA}` : `${x.puntosA}-${x.puntosB}`) : 'pendiente', ganador: !x.ganador ? null : x.ganador === 'empate' ? 'empate' : (x.ganador === 'a') !== invertido ? 'a' : 'b' });
  }
  for (const a of d.ausencias.filter((x) => x.cruce === n)) {
    const q = equipoDe(a.perfil)?.id;
    if (q == null) continue;
    let c = cruces.find((y) => (y.a === q && y.b === a.equipoRival) || (y.a === a.equipoRival && y.b === q));
    if (!c) { c = { a: q, b: a.equipoRival, ga: 0, gb: 0, bono: null, duelos: [] }; cruces.push(c); }
    if (c.a === q) c.ga++; else c.gb++;
  }
  for (const c of cruces) c.bono = c.ga >= 2 ? c.a : c.gb >= 2 ? c.b : null;
  return cruces;
  };
  const cruces = armarCruces(d.cruce);

  // Termómetro: cómo se movió la tabla
  const termometro: Termo[] = ahora.map((x, i) => { const p0 = hayTabla ? antes.findIndex((y) => y.equipo === x.equipo) + 1 : 0; return { equipo: x.equipo, puesto: i + 1, antes: p0 || i + 1, puntos: x.puntos, delta: (p0 || i + 1) - (i + 1), final: i < 4 }; });

  // Récords del cruce: el mejor puntaje de cada juego en estos días (y si superó lo que había antes)
  const porJuego = new Map<string, MarcaD>();
  for (const m of d.marcasCruce) { const b = porJuego.get(m.juego); if (!b || m.puntaje > b.puntaje) porJuego.set(m.juego, m); }
  const records: Record_[] = [...porJuego.values()].map((m) => ({ juego: m.juego, persona: m.perfil, puntaje: m.puntaje, historico: m.puntaje > (d.mejorPrevio[m.juego] ?? 0) }))
    .sort((a, b) => Number(b.historico) - Number(a.historico) || b.puntaje - a.puntaje).slice(0, 8);

  // Estadísticas del cruce
  const jugados = cerrados.filter((x) => !x.noJugo).length, sinJugar = cerrados.filter((x) => x.noJugo).length + d.ausencias.filter((x) => x.cruce === d.cruce).length;
  const rondasJugadas = delCruce.reduce((s, x) => s + new Set(x.rondas.filter((y) => y.terminado).map((y) => `${y.ronda}${y.lado}`)).size, 0);
  const activos = new Set(d.marcasCruce.map((m) => m.perfil)).size;
  const cuenta = new Map<string, number>(); for (const m of d.marcasCruce) cuenta.set(m.juego, (cuenta.get(m.juego) ?? 0) + 1);
  const juegosMasJugados = [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([j, n]) => ({ etiqueta: juego(j), valor: n }));
  const masAjustado = notas.filter((n) => n.tipo === 'agonica').sort((a, b) => b.puntaje - a.puntaje)[0];
  const remontadas = notas.filter((n) => n.tipo === 'remontada').length, bonos = cruces.filter((c) => c.bono != null).length;
  // Mejores jugadores de la liga hasta este cruce (puntos personales)
  const pv = (res: 'gana' | 'empata' | 'pierde', j: number) => (res === 'gana' ? d.puntos.victoria : res === 'empata' ? d.puntos.empate : d.puntos.derrota) * (d.puntos.multiplicadores[j - 1] ?? 1);
  const pj = new Map<string, { ganados: number; jugados: number; puntos: number }>();
  for (const x of d.duelos.filter((y) => y.cruce <= d.cruce && y.estado === 'cerrado' && y.ganador)) for (const lado of ['a', 'b'] as const) {
    const id = lado === 'a' ? x.a : x.b, noJ = x.noJugo === lado || x.noJugo === 'ambos', res = x.ganador === 'empate' ? 'empata' : x.ganador === lado ? 'gana' : 'pierde', s = pj.get(id) ?? { ganados: 0, jugados: 0, puntos: 0 };
    if (!noJ) { s.jugados++; s.puntos += pv(res, x.jornada); if (res === 'gana') s.ganados++; }
    pj.set(id, s);
  }
  for (const a of d.ausencias.filter((x) => x.cruce <= d.cruce)) { const s = pj.get(a.perfil) ?? { ganados: 0, jugados: 0, puntos: 0 }; s.ganados++; s.puntos += pv('gana', a.jornada); pj.set(a.perfil, s); }
  const mejoresJugadores = [...pj].map(([persona, s]) => ({ persona, ...s, puntos: Math.round(s.puntos * 100) / 100 })).sort((a, b) => b.puntos - a.puntos || b.ganados - a.ganados).slice(0, 5);
  const estadisticas: Cifra[] = [
    { etiqueta: 'Duelos jugados', valor: String(jugados), detalle: `de ${cerrados.length + d.ausencias.filter((x) => x.cruce === d.cruce).length}` },
    { etiqueta: 'Rondas disputadas', valor: miles(rondasJugadas), detalle: 'en los duelos del cruce' },
    { etiqueta: 'Partidas individuales', valor: miles(d.marcasCruce.length), detalle: `de ${activos} personas` },
    { etiqueta: 'Sin presentarse', valor: String(sinJugar), detalle: sinJugar === 1 ? 'duelo perdido por ausencia' : 'duelos perdidos por ausencia' },
    { etiqueta: 'Remontadas', valor: String(remontadas), detalle: 'perdían la primera ronda' },
    { etiqueta: 'Bonos de cruce', valor: String(bonos), detalle: `de ${cruces.length} enfrentamientos` },
    { etiqueta: 'El más ajustado', valor: masAjustado ? masAjustado.cifra : '—', detalle: masAjustado ? `${nombre(masAjustado.protagonistas[0])} sobre ${nombre(masAjustado.protagonistas[1])}` : 'ningún duelo al límite' },
    { etiqueta: 'Récords históricos', valor: String(records.filter((x) => x.historico).length), detalle: 'juegos con nueva mejor marca' },
  ];

  // La figura (el mejor ganador de la portada para abajo) y el que se quedó en el camino (el que perdió más ajustado)
  const ganadores = notas.filter((n) => n.duelo !== null && n.tipo !== 'empate' && n.tipo !== 'ausente');
  const figuraNota = ganadores.find((n) => n.tipo === 'paliza') ?? ganadores.find((n) => n.tipo === 'remontada') ?? ganadores[0] ?? null;
  const figura = figuraNota ? { ...figuraNota, seccion: 'La figura', titular: llenar(elegir(['{G}, la figura del cruce', '{G} se llevó todas las miradas', 'El cruce tiene nombre: {G}', '{G}, imparable', 'Aplausos para {G}']), { G: nombre(figuraNota.protagonistas[0]) }), sello: 'LA FIGURA' } : null;
  const caidoNota = notas.find((n) => n.tipo === 'agonica' || n.tipo === 'muerte') ?? null;
  const caido = caidoNota ? { ...caidoNota, seccion: 'Se quedó en el camino', titular: llenar(elegir(['A {P} le faltó tan poco', '{P} lo tuvo y se le fue', 'Duele: {P} cayó por la mínima', '{P}, a un suspiro de la victoria']), { P: nombre(caidoNota.protagonistas[1]) }), protagonistas: [caidoNota.protagonistas[1], caidoNota.protagonistas[0]], sello: 'POR LA MÍNIMA' } : null;
  const polemicaNota = notas.find((n) => n.tipo === 'ausente' || n.tipo === 'empate' || n.tipo === 'muerte') ?? null;
  const polemica = polemicaNota ? { ...polemicaNota, seccion: 'La polémica', sello: 'POLÉMICA' } : null;

  // Agenda: el próximo cruce y sus duelos de equipos (marca los derbis: equipos vecinos en la tabla)
  const proximo = CRUCES.find((c) => c.n === d.cruce + 1);
  const calendario = calendarioDeEquipos(d.equipos);
  const pares = proximo ? calendario[proximo.n - 1]?.parejas ?? [] : [];
  const puestoAhora = (q: number) => ahora.findIndex((x) => x.equipo === q) + 1;
  const agenda = proximo ? { cruce: proximo.n, desde: proximo.desde, hasta: proximo.hasta, parejas: pares.filter(([a, b]) => d.equipos.find((q) => q.id === a)?.miembros.length && d.equipos.find((q) => q.id === b)?.miembros.length).map(([a, b]) => ({ a, b, derbi: Math.abs(puestoAhora(a) - puestoAhora(b)) <= 1 })) } : null;

  // Portada
  const portada = notas[0] ?? { tipo: 'normal' as Tipo, seccion: 'Portada', titular: `Arranca el cruce ${d.cruce}`, bajada: 'Todavía no hay duelos cerrados.', cuerpo: '', protagonistas: [], cifra: '', puntaje: 0, duelo: null, sello: 'ÚLTIMA HORA' };
  const lider = ahora[0], equipoNombre = (q: number) => d.equipos.find((x) => x.id === q)?.nombre ?? `Equipo ${q}`;
  const sube = [...termometro].sort((a, b) => b.delta - a.delta)[0], cae = [...termometro].sort((a, b) => a.delta - b.delta)[0];

  // Columna del editor: opinión breve con remate
  const columna = {
    titulo: elegir(['Lo que nos dejó el cruce', 'La pluma de La Cuarta', 'Sin pelos en la lengua', 'Desde la tribuna', 'Opinión: así está la cosa']),
    texto: [
      lider ? `${equipoNombre(lider.equipo)} manda con ${miles(lider.puntos)} puntos${termometro[0]?.delta > 0 ? ' y además subió' : ''}.` : '',
      notas[0] ? `El cruce ${d.cruce} quedará marcado por ${notas[0].tipo === 'ausente' ? 'una silla vacía' : `el duelo entre ${nombre(notas[0].protagonistas[0])} y ${nombre(notas[0].protagonistas[1] ?? '')}`}.` : '',
      sube && sube.delta > 0 ? `${equipoNombre(sube.equipo)} es el equipo del momento: subió ${sube.delta} ${sube.delta === 1 ? 'puesto' : 'puestos'}.` : '',
      cae && cae.delta < 0 ? `Alarma en ${equipoNombre(cae.equipo)}: cayó ${-cae.delta} ${cae.delta === -1 ? 'lugar' : 'lugares'} y ya no puede regalar nada.` : '',
      sinJugar ? elegir([`Y un recado: ${sinJugar} ${sinJugar === 1 ? 'duelo se perdió' : 'duelos se perdieron'} por no presentarse. Así no se gana una liga.`, `Ojo con las ausencias: ${sinJugar} ${sinJugar === 1 ? 'duelo' : 'duelos'} sin jugar. Los puntos regalados duelen en diciembre.`]) : elegir(['Nadie faltó: así da gusto.', 'Todos se presentaron. Que siga así.']),
      proximo ? elegir([`Se viene el cruce ${proximo.n}. Nadie se puede dormir.`, `El cruce ${proximo.n} arranca el ${fechaLarga(proximo.desde)}. Afilen las garras.`, `Próxima parada: cruce ${proximo.n}. La tabla no perdona.`]) : 'Se acabó la fase de liga: que empiece la Arena.',
    ].filter(Boolean).join(' '),
  };

  // Crónica: el repaso de cada enfrentamiento y la previa del próximo cruce, echándole leña al fuego
  const historial = new Map<number, string[]>(); // por equipo: G, E o P en cada cruce jugado
  for (let n = 1; n <= d.cruce; n++) for (const c of armarCruces(n)) {
    const res = (mio: number, otro: number) => (mio > otro ? 'G' : mio < otro ? 'P' : 'E');
    historial.set(c.a, [...(historial.get(c.a) ?? []), res(c.ga, c.gb)]); historial.set(c.b, [...(historial.get(c.b) ?? []), res(c.gb, c.ga)]);
  }
  const forma = (q: number) => {
    const hq = historial.get(q) ?? [], ultimo = hq[hq.length - 1];
    let racha = 0; while (racha < hq.length && hq[hq.length - 1 - racha] === ultimo) racha++;
    if (!ultimo) return 'todavía no estrena su historial';
    if (ultimo === 'G') return racha >= 2 ? `viene con ${racha} cruces ganados al hilo` : 'viene de ganar su cruce';
    if (ultimo === 'P') return racha >= 2 ? `arrastra ${racha} cruces perdidos seguidos` : 'viene de perder su cruce';
    return 'viene de un empate que no dejó contento a nadie';
  };
  const puntosDe = (q: number) => ahora.find((x) => x.equipo === q)?.puntos ?? 0;
  const equipoId = (id: string) => equipoDe(id)?.id ?? null;
  const delCruceT = (d.pronosticos ?? []).filter((x) => x.cruce === d.cruce);
  const resT = resultadosCruce(d.cruce, d.duelos.map((x) => ({ cruce: x.cruce, a: x.a, b: x.b, ganador: x.ganador, estado: x.estado })), d.ausencias.map((x) => ({ cruce: x.cruce, perfil: x.perfil, equipoRival: x.equipoRival })), equipoId);
  const tablaT = puntuar(delCruceT, resT), plenos = tablaT.filter((t) => t.perfecto).map((t) => t.perfil);
  const tsukibet = delCruceT.length ? { participantes: tablaT.length, plenos, tabla: tablaT.slice(0, 5).map((t) => ({ persona: t.perfil, puntos: t.puntos, aciertos: t.aciertos })) } : null;
  const repaso = cruces.map((c) => {
    const A = equipoNombre(c.a), B = equipoNombre(c.b);
    const clave = notas.find((n) => n.duelo !== null && n.protagonistas.every((id) => [c.a, c.b].includes(equipoDe(id)?.id ?? -1)));
    const W = c.ga > c.gb ? A : B, L = c.ga > c.gb ? B : A, R = `${Math.max(c.ga, c.gb)}-${Math.min(c.ga, c.gb)}`;
    const base = c.ga === c.gb ? `${A} y ${B} firmaron tablas (${c.ga}-${c.gb}) y nadie se llevó el bono.`
      : `${llenar(elegir(Math.min(c.ga, c.gb) === 0 ? ['{W} pasó por encima de {L}: {R}', 'Barrida: {W} le ganó {R} a {L}', '{L} no pudo con {W}, que ganó {R}'] : ['{W} le ganó {R} a {L}', '{W} se impuso {R} ante {L}', '{L} lo peleó, pero {W} ganó {R}']), { W, L, R })}.${c.bono != null ? ` Bono de cruce para ${W}.` : ''}`;
    const ganadorQ = c.ga > c.gb ? c.a : c.gb > c.ga ? c.b : null, creian = ganadorQ != null ? reparto(delCruceT, c.a, c.b, ganadorQ) : null;
    const fe = creian && creian.total >= 3 && creian.parte < 0.3 ? ` En TSUKIBET solo el ${Math.round(creian.parte * 100)}% creía en ${W}.` : '';
    return `${base}${fe}${clave ? ` La nota: «${clave.titular}»` : ''}`;
  });
  const segundo = ahora[1], cuarto = ahora[3], quinto = ahora[4], restantes = CRUCES.length - d.cruce;
  const entrada = [
    lider && segundo ? (lider.puntos > segundo.puntos ? `${equipoNombre(lider.equipo)} lidera con ${miles(lider.puntos)} puntos y le saca ${miles(lider.puntos - segundo.puntos)} a ${equipoNombre(segundo.equipo)}.` : `${equipoNombre(lider.equipo)} y ${equipoNombre(segundo.equipo)} comparten la punta con ${miles(lider.puntos)} puntos: nadie manda solo.`) : '',
    cuarto && quinto ? (cuarto.puntos > quinto.puntos ? `La línea de la final está en ${miles(cuarto.puntos)} puntos: ${equipoNombre(quinto.equipo)} quedó a ${miles(cuarto.puntos - quinto.puntos)}, mirando desde afuera.` : `${equipoNombre(quinto.equipo)} tiene los mismos ${miles(cuarto.puntos)} puntos que ${equipoNombre(cuarto.equipo)}, pero hoy se queda afuera de la final por desempate.`) : '',
    tsukibet ? (plenos.length ? `En TSUKIBET pronosticaron ${tsukibet.participantes} personas y ${plenos.length === 1 ? `solo ${nombre(plenos[0])} acertó todo` : `${plenos.length} hicieron pleno`}.` : `En TSUKIBET pronosticaron ${tsukibet.participantes} personas y nadie acertó todo.`) : '',
    restantes > 0 ? `Quedan ${restantes} ${restantes === 1 ? 'cruce' : 'cruces'} de liga. ${elegir(['Nadie está a salvo.', 'Todavía hay tiempo para remontar, o para hundirse.', 'Aquí no hay calculadora que alcance.', 'Lo que viene no es para débiles.'])}` : 'Se terminó la liga: ahora manda la Arena.',
  ].filter(Boolean).join(' ');
  const jProx = proximo ? jornadaDe(proximo.desde) : jornada, mProx = d.puntos.multiplicadores[jProx - 1] ?? 1;
  const lenaUsada = new Set<string>(); // que la misma pulla no salga dos veces en la edición
  const previas: Previa[] = proximo && agenda ? agenda.parejas.map((p) => {
    const pa = puestoAhora(p.a), pb = puestoAhora(p.b), F = pa <= pb ? p.a : p.b, D = F === p.a ? p.b : p.a;
    const entre = (id: string) => [p.a, p.b].includes(equipoDe(id)?.id ?? -1);
    const duelosProx = d.duelos.filter((x) => x.cruce === proximo.n && entre(x.a) && entre(x.b));
    const enJuego = (duelosProx.length || 3) * d.puntos.victoria * mProx + 5 * mProx, gap = Math.abs(puntosDe(p.a) - puntosDe(p.b));
    const v = { A: equipoNombre(p.a), B: equipoNombre(p.b), F: equipoNombre(F), D: equipoNombre(D) };
    const titulares = Math.min(pa, pb) === 1 ? ['{F} pone el trono en juego ante {D}', '¿Quién le pone el cascabel a {F}? {D} lo intenta', 'El líder no duerme tranquilo: llega {D}', '{D} va por la cabeza de {F}']
      : (pa <= 4) !== (pb <= 4) ? ['{A} y {B}, duelo en la frontera de la final', 'La final se juega aquí: {A} contra {B}', '{D} va por el puesto de {F}', 'Uno entra, otro mira: {A} contra {B}']
      : p.derbi ? ['Derbi en la tabla: {A} contra {B}', 'Vecinos y enemigos: {A} y {B}', '{A} y {B}: el que pierde se queda atrás']
      : Math.abs(pa - pb) >= 5 ? ['{F} contra {D}: David contra Goliat', '¿Batacazo a la vista? {D} desafía a {F}', '{F} es favorito. {D} no leyó el guion']
      : ['{A} y {B} se ven las caras', 'Cuenta regresiva: {A} contra {B}', '{A} contra {B}: no hay margen para regalar'];
    const lena = ['Uno de los dos va a dormir mal esa noche.', 'Si {D} no gana aquí, que vaya pensando en otra cosa.', '{F} no puede regalar nada, y {D} lo sabe.', 'En el papel, {F} es favorito. Pero el papel aguanta todo.', 'Advertencia para {F}: los favoritos también se caen.', 'Para {D}, es la oportunidad de callar bocas.', 'Se aceptan apuestas. La nuestra la guardamos.', 'El que pierda, que no le eche la culpa al lag.'];
    const libres = lena.filter((x) => !lenaUsada.has(x)), pulla = elegir(libres.length ? libres : lena);
    lenaUsada.add(pulla);
    const texto = [
      `${v.A} llega ${pa}.º con ${miles(puntosDe(p.a))} puntos y ${forma(p.a)}; ${v.B} es ${pb}.º con ${miles(puntosDe(p.b))} y ${forma(p.b)}.`,
      gap ? `Los separan ${miles(gap)} puntos.` : 'Están igualados en puntos.',
      `En juego: hasta ${miles(enJuego)} puntos${mProx > 1 ? ` (jornada ${jProx}, todo vale x${mProx})` : ''}.`,
      llenar(pulla, v),
      (() => { const r = reparto((d.pronosticos ?? []).filter((x) => x.cruce === proximo.n), p.a, p.b, p.a); return r.total >= 3 ? `En TSUKIBET, el ${Math.round(Math.max(r.parte, 1 - r.parte) * 100)}% va con ${r.parte >= 0.5 ? v.A : v.B}.` : ''; })(),
      (() => { const f = d.declaraciones?.find((y) => duelosProx.some((x) => x.id === y.enf)); return f ? `Y ya hablaron: ${nombre(f.perfil)} dijo «${f.texto}».` : ''; })(),
    ].filter(Boolean).join(' ');
    return { a: p.a, b: p.b, titular: llenar(elegir(titulares), v), texto, derbi: p.derbi, duelos: duelosProx.map((x) => ({ a: x.a, b: x.b, juego: x.juego })) };
  }) : [];
  const cronica: Cronica = { titulo: elegir(['La crónica del cruce', 'Lo que pasó y lo que se viene', 'Leña al fuego', 'El cruce, contado de cerca']), entrada, repaso, previas };

  const ticker = [
    ...notas.slice(0, 6).map((n) => n.titular),
    ...records.filter((x) => x.historico).slice(0, 3).map((x) => `Récord histórico en ${juego(x.juego)}: ${nombre(x.persona)}, ${miles(x.puntaje)}`),
    lider ? `${equipoNombre(lider.equipo)}, líder con ${miles(lider.puntos)} puntos` : '',
  ].filter(Boolean);

  const usados = new Set<string>([...notas.flatMap((n) => n.protagonistas), ...records.map((x) => x.persona), ...mejoresJugadores.map((x) => x.persona), ...previas.flatMap((p) => p.duelos.flatMap((x) => [x.a, x.b])), ...(tsukibet?.tabla.map((t) => t.persona) ?? []), ...(d.declaraciones ?? []).map((x) => x.perfil)]);
  return {
    nombre: NOMBRE_DIARIO, numero: d.numero, cruce: d.cruce, desde: fechas.desde, hasta: fechas.hasta, jornada, generado: new Date().toISOString(),
    portada, notas, figura, caido, polemica, cruces, termometro, records, estadisticas, juegosMasJugados, mejoresJugadores, columna, agenda, cronica, tsukibet, ticker,
    personas: Object.fromEntries([...usados].map((id) => [id, { nombre: nombre(id), avatar: persona(id)?.avatar ?? null, equipo: equipoDe(id)?.id ?? null }])),
    equipos: Object.fromEntries(d.equipos.map((q) => [q.id, q.nombre])),
    juegos: d.juegos,
  };
}

/** Texto del mensaje de Discord que acompaña las imágenes (sin emojis, sin menciones a roles). */
export function mensajeDiscord(e: Edicion, enlace: string): string {
  const otros = e.notas.slice(1, 4).map((n) => `- ${n.titular}`).join('\n');
  return [`**${e.nombre} · Edición N.º ${e.numero} · Cruce ${e.cruce}**`, `**${e.portada.titular}**`, e.portada.bajada, otros ? `\nTambién en esta edición:\n${otros}` : '', `\nLa edición completa, con estadísticas y la tabla: ${enlace}`].filter(Boolean).join('\n').slice(0, 1990);
}
