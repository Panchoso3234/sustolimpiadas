import { azar, horaChile } from '../nucleo/azar';
import { SEMILLA_ISLA } from '../nucleo/config';

// Geografía de ValRigo y "cerebro" de sus habitantes. Todo sale de la semilla y de la hora, sin estado guardado:
// dos personas que abren la isla al mismo tiempo ven a cada personaje en el mismo lugar.

export const BLOQUE = 5 * 60 * 1000; // cada 5 minutos cada personaje elige qué hacer
const VELOCIDAD = 2.5; // unidades por segundo al caminar
const PI = Math.PI;

export interface Punto { x: number; z: number }
export const CENTRO: Punto = { x: 0, z: 2 }; // la fuente de la plaza
export const ANILLO = 12; // radio del camino circular
export const RADIO_PUEBLO = 27; // hasta aquí el terreno es plano

const suave = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
const rad = (grados: number) => (grados * PI) / 180;

/** Punto a `r` unidades del centro de la plaza, con el ángulo en grados medido desde el frente (+Z). */
export const polar = (grados: number, r: number): Punto => ({ x: CENTRO.x + Math.sin(rad(grados)) * r, z: CENTRO.z + Math.cos(rad(grados)) * r });

/** Distancia del centro de la isla a la orilla, según la dirección. */
export function costa(ang: number): number {
  return 1.5 * (74 + 6 * Math.sin(2 * ang + 0.8) + 4.5 * Math.sin(3 * ang + 0.5) + 2.5 * Math.sin(5 * ang + 2));
}
/** Punto a `tierraAdentro` unidades de la orilla (negativo = mar adentro), en la dirección dada. */
export const borde = (grados: number, tierraAdentro: number): Punto => { const a = rad(grados), r = costa(a) - tierraAdentro; return { x: Math.sin(a) * r, z: Math.cos(a) * r }; };

export const RIO: Punto[] = [{ x: -20, z: -62 }, { x: -44, z: -40 }, { x: -58, z: -10 }, { x: -54, z: 22 }, { x: -46, z: 52 }, { x: -40, z: 80 }, { x: -36, z: 114 }];
export const PUENTE: Punto = { x: -53.8, z: 23.2 }; // camino al faro
export const PUENTE_NORTE: Punto = { x: -56.4, z: -13.4 }; // camino a las ruinas
export const PUENTES = [PUENTE, PUENTE_NORTE];

export function distTramo(x: number, z: number, a: Punto, b: Punto): number {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}
export function distRio(x: number, z: number): number {
  let d = 1e9;
  for (let i = 1; i < RIO.length; i++) d = Math.min(d, distTramo(x, z, RIO[i - 1], RIO[i]));
  return d;
}

export const SITIOS = {
  tablero: { x: 0, z: -6.5 }, eventos: { x: 0, z: 10.4 }, ruleta: { x: -8, z: -3 }, atril: { x: 8, z: -3 }, kiosko: { x: 7.5, z: 9 }, escenario: { x: -7.5, z: 9 },
  cafe: polar(52, 17.5), mercado: polar(126, 16.5), cancha: polar(-90, 17), torre: polar(-142, 21), laguna: polar(-16, 20),
  playa: borde(-4, 5), fogata: borde(12, 5.5), mar: borde(5, -9), muelle: { x: 106, z: 2 },
  faro: { x: -86, z: 26 }, molino: { x: 78, z: -20 }, granja: { x: 48, z: -44 }, camping: { x: 46, z: 62 }, cascada: { x: -22, z: -54 },
  volcan: { x: 0, z: -78 }, porton: { x: 0, z: -46 },
  lago: { x: 52, z: 22 }, ruinas: { x: -72, z: -32 }, cementerio: { x: 72, z: -64 }, caleta: borde(-63, 6),
  /** Barrio de los Participantes: una casita por inscrito, adornada con lo que ganó en el pase de temporada. */
  barrio: { x: -22, z: 52 },
};

// Salidas del pueblo: puntos libres por donde parten los caminos al resto de la isla
const SALIDA = { sur: polar(4, 30), este: polar(90, 30), oeste: polar(-52, 30), norte: polar(180, 26), noreste: polar(160, 30), noroeste: polar(-160, 30) };
const HACIA_GRANJA: Punto = { x: 43, z: -38 }, HACIA_LAGO: Punto = { x: 43, z: 13 }, TRAS_PUENTE: Punto = { x: -62, z: 36 };

// Las siete casas club, repartidas por la isla. La puerta mira hacia donde llega su camino.
export const CASAS: { x: number; z: number; puerta: Punto; acceso: Punto[]; donde: string }[] = [
  { x: 62, z: -33, puerta: { x: 57.6, z: -35.4 }, acceso: [SALIDA.noreste, HACIA_GRANJA], donde: 'junto a la granja' },
  { x: -76, z: 8, puerta: { x: -72.4, z: 10.6 }, acceso: [SALIDA.oeste, PUENTE, { x: -66, z: 19 }], donde: 'en el risco del faro' },
  { ...borde(24, 13), puerta: borde(24.6, 17.4), acceso: [SALIDA.sur], donde: 'frente a la playa sur' },
  { x: 65, z: 34, puerta: { x: 61.4, z: 31.2 }, acceso: [SALIDA.este, HACIA_LAGO], donde: 'a orillas del lago' },
  { x: -80, z: -46, puerta: { x: -76.4, z: -43.4 }, acceso: [SALIDA.noroeste, PUENTE_NORTE], donde: 'entre las ruinas del bosque' },
  { x: 27, z: -60, puerta: { x: 24.8, z: -56.2 }, acceso: [SALIDA.noreste], donde: 'en la ladera de la montaña' },
  { x: -66, z: 51, puerta: { x: -64.6, z: 46.8 }, acceso: [SALIDA.oeste, PUENTE, TRAS_PUENTE], donde: 'en la caleta de pescadores' },
];

const CERROS = [{ ...SITIOS.volcan, h: 12, s: 24 }, { ...SITIOS.faro, h: 8, s: 14 }, { ...SITIOS.molino, h: 6, s: 14 }];
// Explanadas: el terreno se aplana alrededor de cada construcción fuera del pueblo
const PLANOS = [
  { ...SITIOS.faro, r: 3.6 }, { ...SITIOS.molino, r: 4.2 }, { ...SITIOS.granja, r: 8.5 }, { ...SITIOS.porton, r: 4.5 }, { ...SITIOS.camping, r: 5 }, { ...SITIOS.cascada, r: 3 },
  { ...SITIOS.lago, r: 10 }, { ...SITIOS.ruinas, r: 7 }, { ...SITIOS.cementerio, r: 7 }, { ...SITIOS.barrio, r: 16 }, ...CASAS.map((c) => ({ x: c.x, z: c.z, r: 6.5 })),
].map((p) => ({ ...p, h: 0 }));

function relieve(x: number, z: number): number {
  const d = costa(Math.atan2(x, z)) - Math.hypot(x, z); // cuánto falta para la orilla; negativo = en el mar
  let h = d < 0 ? -1.6 * (1 - suave((d + 10) / 10)) : d < 8 ? suave(d / 8) * 1.2 : 1.2 + suave((d - 8) / 5) * 0.3;
  const firme = suave(d / 6); // cerca de la orilla los cerros se cortan en acantilado
  for (const c of CERROS) h += c.h * Math.exp(-((x - c.x) ** 2 + (z - c.z) ** 2) / (2 * c.s * c.s)) * firme;
  h += (Math.sin(x * 0.13 + 1) * Math.cos(z * 0.11) + Math.sin(x * 0.05 - z * 0.07) * 0.8) * 0.55 * suave((d - 10) / 10);
  const pueblo = 1 - suave((Math.hypot(x - CENTRO.x, z - CENTRO.z) - RADIO_PUEBLO) / 9);
  return h + (1.5 - h) * pueblo;
}
for (const p of PLANOS) p.h = relieve(p.x, p.z);

/** Altura del suelo sin contar el cauce del río. */
export function sueloFirme(x: number, z: number): number {
  let h = relieve(x, z);
  for (const p of PLANOS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + 4) h += (p.h - h) * (1 - suave((d - p.r) / 4));
  }
  return h;
}

/** Altura del suelo en un punto de la isla (lo que pisan los personajes). */
export function terreno(x: number, z: number): number {
  if (Math.abs(z - 2) < 1.3 && x > 88 && x < 108.5) return 1.08; // muelle
  let h = sueloFirme(x, z);
  if (h > 0.2) {
    const dr = distRio(x, z);
    if (dr < 3.2 && PUENTES.every((p) => Math.hypot(x - p.x, z - p.z) > 2.6)) h -= 1.0 * (1 - suave(dr / 3.2));
  }
  return h;
}

export const casaDe = (clave: string) => Math.floor(azar(SEMILLA_ISLA, clave, 'casa') * CASAS.length);

/** Asientos de los cuatro bancos de la plaza, mirando a la fuente. */
export const BANCOS = [45, 135, 225, 315].map((grados) => ({ grados, ...polar(grados, 5.6) }));
const ASIENTOS = BANCOS.flatMap((b) => [-0.55, 0.55].map((lado) => {
  const a = rad(b.grados);
  return { x: b.x + Math.cos(a) * lado, z: b.z - Math.sin(a) * lado, rumbo: a + PI };
}));

export type Pose = 'pie' | 'sentado' | 'acostado' | 'nadar' | 'cantar' | 'bailar' | 'leer' | 'pescar';

export interface Lugar {
  id: string;
  x: number; z: number; r: number;
  rmin?: number; // si existe, los puntos caen en un aro entre rmin y r
  verbo: string;
  peso: number;
  pose: Pose;
  emote?: string;
  y?: number; // altura fija; si falta se usa el terreno
  cuando?: 'dia' | 'noche';
  gusto?: Record<string, number>; // multiplicador según personalidad
  puntos?: { x: number; z: number; rumbo: number }[]; // posiciones exactas (asientos)
  acceso?: Punto[]; // camino desde el pueblo hasta el lugar, para los que quedan fuera
}

const en = (p: Punto) => ({ x: p.x, z: p.z });
export const LUGARES: Lugar[] = [
  { id: 'tabla', x: 0, z: -3.6, r: 2, verbo: 'mirando la tabla', peso: 3, pose: 'pie', gusto: { Competitivo: 3 } },
  { id: 'eventos', x: 0, z: 8, r: 1.4, verbo: 'leyendo el tablón de eventos', peso: 1.2, pose: 'pie' },
  { id: 'fuente', ...en(CENTRO), r: 3.6, rmin: 2.9, verbo: 'junto a la fuente', peso: 2, pose: 'pie' },
  { id: 'banco', ...en(CENTRO), r: 0, verbo: 'descansando en un banco', peso: 2.5, pose: 'sentado', puntos: ASIENTOS, gusto: { Tranquilo: 2.5, Tímido: 1.5 } },
  { id: 'kiosko', x: 7.5, z: 11.3, r: 1.3, verbo: 'leyendo el diario', peso: 2, pose: 'leer' },
  { id: 'escenario', x: -7.5, z: 9.2, r: 1, verbo: 'cantando en el escenario', peso: 1.4, pose: 'cantar', emote: '♪', y: 2.0, gusto: { Payaso: 3.5, Tímido: 0.2 } },
  { id: 'publico', x: -7.5, z: 12.8, r: 1.8, verbo: 'bailando frente al escenario', peso: 1.4, pose: 'bailar', emote: '♪', gusto: { Payaso: 2 } },
  { id: 'ruleta', x: -8, z: -0.9, r: 1.2, verbo: 'mirando la ruleta de juegos', peso: 1, pose: 'pie', gusto: { Competitivo: 2 } },
  { id: 'atril', x: 8, z: -0.9, r: 1.2, verbo: 'mirando el cuadro de Rigo', peso: 1, pose: 'pie', gusto: { Soñador: 2.5 } },
  { id: 'cafe', ...polar(52, 14.2), r: 1.5, verbo: 'tomando algo en la cafetería', peso: 2, pose: 'pie', gusto: { Glotón: 3.5 } },
  { id: 'mercado', ...polar(126, 14), r: 1.4, verbo: 'comprando en el mercado', peso: 1.5, pose: 'pie', gusto: { Glotón: 2.5 } },
  { id: 'cancha', ...en(SITIOS.cancha), r: 1.8, verbo: 'entrenando en la cancha', peso: 2, pose: 'bailar', gusto: { Competitivo: 3.5 } },
  { id: 'torre', ...polar(-142, 16.8), r: 1.4, verbo: 'mirando el reloj de la alcaldía', peso: 0.7, pose: 'pie' },
  { id: 'laguna', ...polar(-16, 16.6), r: 1.3, verbo: 'mirando la laguna', peso: 1.2, pose: 'pie', gusto: { Tímido: 3, Soñador: 2 } },
  { id: 'paseo', ...en(CENTRO), r: ANILLO, rmin: ANILLO, verbo: 'paseando por el pueblo', peso: 3, pose: 'pie' },
  // Fuera del pueblo
  { id: 'playa', ...en(SITIOS.playa), r: 4, verbo: 'tomando sol en la playa', peso: 2, pose: 'acostado', cuando: 'dia', gusto: { Tranquilo: 2.5 }, acceso: [SALIDA.sur] },
  { id: 'mar', ...en(SITIOS.mar), r: 3.5, verbo: 'nadando', peso: 2, pose: 'nadar', cuando: 'dia', acceso: [SALIDA.sur] },
  { id: 'fogata', ...en(SITIOS.fogata), r: 2.5, rmin: 2.1, verbo: 'junto a la fogata', peso: 6, pose: 'sentado', cuando: 'noche', acceso: [SALIDA.sur] },
  { id: 'camping', x: 46, z: 58.6, r: 2, verbo: 'en el campamento', peso: 1.2, pose: 'sentado', gusto: { Soñador: 2, Tranquilo: 1.5 }, acceso: [SALIDA.sur] },
  { id: 'muelle', ...en(SITIOS.muelle), r: 0.8, verbo: 'pescando en el muelle', peso: 1.2, pose: 'pescar', emote: '…', y: 1.08, gusto: { Tranquilo: 2 }, acceso: [SALIDA.este] },
  { id: 'molino', x: 74.5, z: -17.5, r: 1.6, verbo: 'mirando girar el molino', peso: 1, pose: 'pie', gusto: { Soñador: 2.5 }, acceso: [SALIDA.este] },
  { id: 'faro', x: -83, z: 28.6, r: 1.3, verbo: 'mirando el mar desde el faro', peso: 1.2, pose: 'pie', gusto: { Soñador: 3, Tímido: 2 }, acceso: [SALIDA.oeste, PUENTE] },
  { id: 'granja', x: 44.5, z: -40, r: 2.2, verbo: 'visitando a las ovejas de la granja', peso: 1.2, pose: 'pie', gusto: { Glotón: 2, Tranquilo: 1.5 }, acceso: [SALIDA.noreste] },
  { id: 'cascada', ...en(SITIOS.cascada), r: 1.6, verbo: 'escuchando la cascada', peso: 1, pose: 'pie', gusto: { Tímido: 2.5, Soñador: 2 }, acceso: [SALIDA.noroeste] },
  { id: 'porton', x: 0, z: -41.8, r: 1.6, verbo: 'mirando el portón de la arena', peso: 1.2, pose: 'pie', gusto: { Competitivo: 2.5 }, acceso: [SALIDA.norte] },
  { id: 'lago', x: 45.2, z: 15.2, r: 1.4, verbo: 'pescando en el lago', peso: 1.2, pose: 'pescar', emote: '…', gusto: { Tranquilo: 2, Tímido: 1.5 }, acceso: [SALIDA.este] },
  { id: 'ruinas', x: -68, z: -30, r: 2.4, verbo: 'explorando las ruinas', peso: 1.1, pose: 'pie', gusto: { Soñador: 2.5, Competitivo: 1.5 }, acceso: [SALIDA.noroeste, PUENTE_NORTE] },
  { id: 'cementerio', x: 68.5, z: -61, r: 2.2, verbo: 'contando historias en el cementerio', peso: 2.5, pose: 'pie', cuando: 'noche', gusto: { Payaso: 2 }, acceso: [SALIDA.noreste, HACIA_GRANJA] },
  { id: 'barrio', ...en(SITIOS.barrio), r: 3.4, verbo: 'paseando por el Barrio de los Participantes', peso: 1.6, pose: 'pie', gusto: { Competitivo: 1.5, Payaso: 1.5 }, acceso: [SALIDA.sur] },
  { id: 'caleta', ...en(borde(-63, 9.5)), r: 1.8, verbo: 'mirando las redes en la caleta', peso: 1, pose: 'pie', gusto: { Glotón: 1.5 }, acceso: [SALIDA.oeste, PUENTE, TRAS_PUENTE] },
];
// Cada casa es también un lugar: de día se pasa a verla y de madrugada se duerme frente a ella
const EN_CASA: Lugar[] = CASAS.map((c) => ({ id: 'casa', x: c.puerta.x, z: c.puerta.z, r: 1.6, verbo: `en su casa club, ${c.donde}`, peso: 0, pose: 'pie', acceso: c.acceso }));
const DORMIR: Lugar[] = CASAS.map((c) => ({ id: 'dormir', x: c.puerta.x, z: c.puerta.z, r: 1.4, verbo: 'durmiendo frente a su casa', peso: 0, pose: 'acostado', emote: 'Zzz', acceso: c.acceso }));

/** Todos los tramos de camino, para pintarlos en el suelo. */
export function caminos(): [Punto, Punto][] {
  const tramos: [Punto, Punto][] = [];
  const desdeAnillo = (p: Punto): Punto => { const a = Math.atan2(p.x - CENTRO.x, p.z - CENTRO.z); return { x: CENTRO.x + Math.sin(a) * 6.5, z: CENTRO.z + Math.cos(a) * 6.5 }; };
  for (const p of [polar(52, 15.5), polar(126, 15), polar(-90, 14), polar(-142, 18), polar(-16, 17), ...Object.values(SALIDA)]) tramos.push([desdeAnillo(p), p]);
  for (const l of [...LUGARES, ...EN_CASA]) if (l.acceso) { const ruta = [...l.acceso, { x: l.x, z: l.z }]; for (let i = 1; i < ruta.length; i++) tramos.push([ruta[i - 1], ruta[i]]); }
  return tramos;
}

export function esDeNoche(hora: number): boolean {
  return hora < 6.5 || hora >= 20;
}

interface Destino { x: number; z: number; lugar: Lugar; rumbo?: number }

function destino(clave: string, personalidad: string, bloque: number): Destino {
  const hora = horaChile(bloque * BLOQUE);
  const a = azar(SEMILLA_ISLA, clave, bloque, 'a'), b = azar(SEMILLA_ISLA, clave, bloque, 'b');

  // De madrugada casi todos duermen frente a su casa
  const mia = casaDe(clave);
  if (hora >= 0.75 && hora < 6.75 && azar(SEMILLA_ISLA, clave, bloque, 'sueño') < 0.85) {
    return { x: DORMIR[mia].x + (a - 0.5) * 2.6, z: DORMIR[mia].z + (b - 0.5) * 2.6, lugar: DORMIR[mia], rumbo: a * PI * 2 };
  }
  // Cada tanto se da una vuelta por su propia casa
  if (azar(SEMILLA_ISLA, clave, bloque, 'hogar') < 0.12) return { x: EN_CASA[mia].x + (a - 0.5) * 2.4, z: EN_CASA[mia].z + (b - 0.5) * 2.4, lugar: EN_CASA[mia] };

  const noche = esDeNoche(hora);
  const opciones = LUGARES.filter((l) => !l.cuando || (l.cuando === 'noche') === noche);
  const pesoDe = (l: Lugar) => l.peso * (l.gusto?.[personalidad] ?? 1);
  let tiro = azar(SEMILLA_ISLA, clave, bloque, 'lugar') * opciones.reduce((s, l) => s + pesoDe(l), 0);
  let lugar = opciones[opciones.length - 1];
  for (const l of opciones) { tiro -= pesoDe(l); if (tiro <= 0) { lugar = l; break; } }

  if (lugar.puntos) return { ...lugar.puntos[Math.floor(a * lugar.puntos.length)], lugar };
  const min = lugar.rmin ?? 0, radio = lugar.rmin !== undefined ? min + b * (lugar.r - min) : Math.sqrt(b) * lugar.r, ang = a * PI * 2;
  return { x: lugar.x + Math.sin(ang) * radio, z: lugar.z + Math.cos(ang) * radio, lugar };
}

/** Camino dentro del pueblo usando el anillo de la plaza, para no cruzar por encima de las casas. */
function rutaPueblo(a: Punto, b: Punto): Punto[] {
  if (Math.hypot(b.x - a.x, b.z - a.z) < 9) return [a, b];
  const dentro = (p: Punto) => Math.hypot(p.x - CENTRO.x, p.z - CENTRO.z) <= ANILLO + 0.6;
  const angulo = (p: Punto) => Math.atan2(p.x - CENTRO.x, p.z - CENTRO.z);
  const enAnillo = (ang: number): Punto => ({ x: CENTRO.x + Math.sin(ang) * ANILLO, z: CENTRO.z + Math.cos(ang) * ANILLO });
  const da = dentro(a), db = dentro(b);
  if (da && db) return [a, b];
  if (da) return [a, enAnillo(angulo(b)), b];
  if (db) return [a, enAnillo(angulo(a)), b];
  const desde = angulo(a);
  let giro = angulo(b) - desde;
  while (giro > PI) giro -= 2 * PI;
  while (giro < -PI) giro += 2 * PI;
  const pasos = Math.max(1, Math.ceil(Math.abs(giro) / 0.26)), puntos = [a];
  for (let i = 0; i <= pasos; i++) puntos.push(enAnillo(desde + (giro * i) / pasos));
  puntos.push(b);
  return puntos;
}

/** Camino completo: sale del lugar por su acceso, cruza el pueblo por el anillo y entra al destino por el suyo. */
function ruta(a: Destino, b: Destino): Punto[] {
  if (a.lugar === b.lugar && Math.hypot(b.x - a.x, b.z - a.z) < 25) return [a, b];
  const salida: Punto[] = a.lugar.acceso ? [a, ...[...a.lugar.acceso].reverse()] : [a];
  const llegada: Punto[] = b.lugar.acceso ? [...b.lugar.acceso, b] : [b];
  const cruce = rutaPueblo(salida[salida.length - 1], llegada[0]);
  return [...salida.slice(0, -1), ...cruce, ...llegada.slice(1)];
}

interface Plan { bloque: number; desde: Destino; hacia: Destino; puntos: Punto[]; tramos: number[]; largo: number; salida: number }
const planes = new Map<string, Plan>();

function planDe(clave: string, personalidad: string, bloque: number): Plan {
  let plan = planes.get(clave);
  if (!plan || plan.bloque !== bloque) {
    const desde = destino(clave, personalidad, bloque - 1), hacia = destino(clave, personalidad, bloque);
    const puntos = ruta(desde, hacia), tramos: number[] = [];
    let largo = 0;
    for (let i = 1; i < puntos.length; i++) { const d = Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].z - puntos[i - 1].z); tramos.push(d); largo += d; }
    plan = { bloque, desde, hacia, puntos, tramos, largo, salida: azar(SEMILLA_ISLA, clave, bloque, 'salida') * 25000 }; // no parten todos a la vez
    planes.set(clave, plan);
  }
  return plan;
}

export interface Estado { x: number; y: number; z: number; rumbo: number; caminando: boolean; lugar: Lugar; pose: Pose }

export function estadoDe(clave: string, personalidad: string, ahora: number): Estado {
  const bloque = Math.floor(ahora / BLOQUE), plan = planDe(clave, personalidad, bloque);
  const t = ahora - bloque * BLOQUE - plan.salida, duracion = Math.min(BLOQUE * 0.75, (plan.largo / VELOCIDAD) * 1000);

  if (t > 0 && t < duracion && plan.largo > 0.2) {
    let resto = (t / duracion) * plan.largo, i = 0;
    while (i < plan.tramos.length - 1 && resto > plan.tramos[i]) { resto -= plan.tramos[i]; i++; }
    const p = plan.puntos[i], q = plan.puntos[i + 1], f = plan.tramos[i] ? resto / plan.tramos[i] : 0;
    const x = p.x + (q.x - p.x) * f, z = p.z + (q.z - p.z) * f;
    return { x, z, y: terreno(x, z), rumbo: Math.atan2(q.x - p.x, q.z - p.z), caminando: true, lugar: plan.hacia.lugar, pose: 'pie' };
  }
  const d = t <= 0 ? plan.desde : plan.hacia, l = d.lugar;
  // Parado mira hacia el centro del lugar; paseando, hacia cualquier lado
  const rumbo = d.rumbo ?? (l.id === 'paseo' ? azar(SEMILLA_ISLA, clave, bloque, 'giro') * PI * 2 : Math.atan2(l.x - d.x, l.z - d.z));
  return { x: d.x, z: d.z, y: l.y ?? terreno(d.x, d.z), rumbo, caminando: false, lugar: l, pose: l.pose };
}

const GENERALES = [
  '¿Leyeron el diario de hoy?', 'Esta semana ganamos, lo presiento.', 'Me tengo fe para los juegos.', '¡Qué linda está la isla hoy!',
  '{otro}, te desafío cuando abran los juegos.', '{otro} anda muy callado… algo trama.', 'Dicen que {otro} es buenísimo para la puntería.',
  'Ojalá me toque equipo con {otro}.', 'Yo vine por las bendiciones lunares.', '¿En qué casa me irá a tocar?', 'Necesito entrenar mis reflejos.',
  'Si gano, tiro en el banner que viene.', '{otro}, ¿ya elegiste tu gacha para la bendición?', 'Quiero la comisión de Rigo.',
  'Faltan días para La Llegada…', 'Alguien dígale a {otro} que no se vale practicar tanto.', 'Hoy amanecí con suerte.',
];
const POR_LUGAR: Record<string, string[]> = {
  tabla: ['Todavía está vacía… pronto estaré arriba.', 'Primer lugar o nada.', '{otro}, mira bien: ahí va a estar mi nombre.'],
  eventos: ['El viernes es La Llegada, no falten.', 'Anoten: Noche de Brujas el 30.', '¿Ya vieron qué viene esta semana?'],
  fuente: ['Tiré una moneda y pedí un cinco estrellas.', 'El agua está heladísima.'],
  banco: ['Qué rico sentarse un rato.', 'Desde aquí se ve todo el pueblo.'],
  kiosko: ['Dice aquí que el portón hizo ruido anoche.', 'El horóscopo me favorece.', 'Extra, extra: todavía no pasa nada.'],
  escenario: ['¡Esta va dedicada a {otro}!', '¡Arriba esas palmas!'],
  publico: ['¡Otra, otra!', '¡Temazo!'],
  ruleta: ['Que salga uno de reflejos, por favor.', 'Cualquiera menos el de memoria…', 'Esa ruleta me tiene nervioso.'],
  atril: ['Rigo pinta increíble.', 'Algún día saldré yo en ese cuadro.'],
  cafe: ['Un café y a entrenar.', '¿Alguien quiere una empanada?', 'Aquí se arman los mejores chismes.'],
  mercado: ['Estas frutas están carísimas.', 'Vine por una cosa y llevo cinco.'],
  cancha: ['¡Diez más!', 'El que no entrena, no clasifica.', '{otro}, ven a entrenar.'],
  torre: ['Vale manda desde ahí arriba.', 'Ese reloj nunca falla.'],
  laguna: ['Qué tranquilidad…', 'Creo que vi un pez dorado.'],
  playa: ['Cinco minutos más de sol.', 'Después entreno, lo prometo.'],
  mar: ['¡El agua está perfecta!', '¡Miren cómo nado!'],
  fogata: ['¿Alguien se sabe una historia de terror?', 'Dicen que en la arena penan.', 'Pásenme un malvavisco.', '{otro}, cuenta la del portón.'],
  camping: ['Esta noche duermo en la carpa.', 'Aquí sí que se ven las estrellas.'],
  muelle: ['Shhh, que espantan a los peces.', 'Hoy pica, hoy pica.'],
  molino: ['Podría mirarlo girar todo el día.', 'Aquí arriba corre un viento rico.'],
  faro: ['Desde aquí se ve hasta el velero.', 'Me gusta este silencio.', 'Qué alto está esto…'],
  granja: ['Esta oveja me cae bien.', '¿Se pueden adoptar?', 'Huele a campo.'],
  cascada: ['El agua viene helada de la montaña.', 'Aquí se piensa mejor.'],
  porton: ['Ese portón hizo un ruido raro…', '¿Alguien sabe qué hay adentro?', 'Cada día está más agrietado.', 'Yo voy a entrar ahí. Y voy a ganar.'],
  paseo: ['Voy dando una vuelta.', '¿Alguien ha visto a {otro}?'],
};

const TURNO = 9000, VISIBLE = 6000;

/** Quién habla ahora y qué dice. Cambia cada 9 segundos y se muestra durante 6. */
export function conversacion(ahora: number, habitantes: { nombre: string; frase: string; lugar: string; despierto: boolean }[]): { indice: number; texto: string } | null {
  if (ahora % TURNO > VISIBLE) return null;
  const turno = Math.floor(ahora / TURNO);
  const despiertos = habitantes.map((h, i) => ({ h, i })).filter((x) => x.h.despierto);
  if (!despiertos.length) return null;
  const { h: quien, i: indice } = despiertos[Math.floor(azar(SEMILLA_ISLA, 'habla', turno) * despiertos.length)];
  const tiro = azar(SEMILLA_ISLA, 'tipo', turno);
  if (quien.frase && tiro < 0.25) return { indice, texto: quien.frase };
  const otros = habitantes.filter((_, i) => i !== indice);
  const propias = POR_LUGAR[quien.lugar] ?? [];
  const fuente = (tiro < 0.7 && propias.length ? propias : GENERALES).filter((f) => otros.length || !f.includes('{otro}'));
  const plantilla = fuente[Math.floor(azar(SEMILLA_ISLA, 'frase', turno) * fuente.length)] ?? GENERALES[0];
  const otro = otros.length ? otros[Math.floor(azar(SEMILLA_ISLA, 'otro', turno) * otros.length)].nombre : '';
  return { indice, texto: plantilla.replace('{otro}', otro || 'alguien') };
}

/** Clima del día, igual para todos: 0 despejado, 1 nublado, 2 lluvia. */
export function climaDe(fecha: string): 0 | 1 | 2 {
  const t = azar(SEMILLA_ISLA, 'clima', fecha);
  return t < 0.6 ? 0 : t < 0.86 ? 1 : 2;
}

export const EVENTOS = [
  { fecha: '2026-10-13', nombre: 'la apertura de inscripciones', detalle: 'Crear personaje, conocer la isla y probar los juegos sin puntos.' },
  { fecha: '2026-10-16', nombre: 'La Llegada y el sorteo de equipos', detalle: 'Noche en vivo: inicio oficial y sorteo de los equipos de tres.' },
  { fecha: '2026-10-23', nombre: 'la Noche de Trivia', detalle: 'Cierre de la Jornada 1 (puntos ×1).' },
  { fecha: '2026-10-30', nombre: 'la Noche de Brujas', detalle: 'Cierre de la Jornada 2 (puntos ×1,25). Isla embrujada.' },
  { fecha: '2026-11-06', nombre: 'La Gran Feria', detalle: 'Cierre de la Jornada 3 (puntos ×1,5).' },
  { fecha: '2026-11-12', nombre: 'el cierre de la Jornada 4', detalle: 'Última oportunidad de clasificar (puntos ×2).' },
  { fecha: '2026-11-13', nombre: 'la Arena', detalle: 'La final en una sola noche. Se definen los 7 premios.' },
];
