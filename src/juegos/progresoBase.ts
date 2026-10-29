// Lo puro del progreso: logros y experiencia del pase. Lo usan la web (progreso.ts) y la función "gachapon" de Supabase,
// que calcula el nivel y las recompensas en el servidor (así nadie puede inventarse su nivel).
import { horaChile } from '../nucleo/azar.ts';
import { JUEGOS, ORDEN_MOTORES, TODOS, TOPES, juegoPorId } from './catalogo.ts';

/** Lo mínimo de un duelo que necesitan los logros y la experiencia. */
export interface DueloP { estado: string; ganador: string | null; creado?: string }
/** Lo que se lee del detalle de cada partida (solo estas claves: el recorrido grabado pesa y aquí no hace falta). */
export const CLAVES = ['altura', 'caidas', 'pisos', 'espantados', 'puesto', 'choques', 'metros', 'eliminadas', 'vivo', 'punteria', 'niveles', 'chuzas', 'gano', 'venceLider', 'acerto', 'intentos', 'llego'] as const;
export interface Marca { juego: string; puntaje: number; fecha: string; creado: string; d: Partial<Record<(typeof CLAVES)[number], unknown>> }
export interface Datos<E extends DueloP = DueloP> { id: string; nombre: string; marcas: Marca[]; duelos: { e: E; lado: 'a' | 'b' }[] }


/** Solo cuentan los juegos del catálogo, también los retirados: lo ya jugado no se pierde (inventar nombres de juego no suma). */
const VALIDOS = new Set(TODOS.map((j) => j.id));
// ───────── Logros ─────────
export type Categoria = 'Primeros pasos' | 'Constancia' | 'Duelos y fantasmas' | 'Hazañas' | 'Expertos' | 'Secretos';
export interface Logro { id: string; nombre: string; como: string; icono: string; categoria: Categoria; secreto?: boolean; tiene: boolean }

/** Días seguidos más largos jugados (fechas "AAAA-MM-DD"). */
export function rachaDias(fechas: string[]): number {
  const dias = [...new Set(fechas)].sort().map((f) => Date.parse(f) / 864e5);
  let mejor = 0, actual = 0;
  dias.forEach((d, i) => { actual = i && d - dias[i - 1] === 1 ? actual + 1 : 1; mejor = Math.max(mejor, actual); });
  return mejor;
}

export function logros(d: Datos): Logro[] {
  const m = d.marcas, juegos = new Set(m.map((x) => x.juego)), dias = new Set(m.map((x) => x.fecha));
  const porDia = new Map<string, number>();
  for (const x of m) porDia.set(x.fecha, (porDia.get(x.fecha) ?? 0) + 1);
  const motores = new Set([...juegos].map((j) => juegoPorId(j)?.motor).filter(Boolean));
  const cerrados = d.duelos.filter((x) => x.e.estado === 'cerrado'), victorias = cerrados.filter((x) => x.e.ganador === x.lado).length;
  const horas = m.map((x) => horaChile(Date.parse(x.creado)));
  const abiertos = JUEGOS.filter((j) => j.listo).length, racha = rachaDias(m.map((x) => x.fecha));
  const alguna = (juego: string, f: (x: Marca) => boolean) => m.some((x) => x.juego === juego && f(x));
  const n = (v: unknown) => (typeof v === 'number' ? v : 0);
  const fantasmas = m.filter((x) => x.d.venceLider === true).length;
  const L = (id: string, categoria: Categoria, icono: string, nombre: string, como: string, tiene: boolean, secreto = false): Logro => ({ id, categoria, icono, nombre, como, tiene, secreto });
  const lista: Logro[] = [
    L('primer-paso', 'Primeros pasos', '👣', 'Primer paso', 'Juega tu primera partida', m.length > 0),
    L('calentando', 'Primeros pasos', '🔥', 'Calentando motores', 'Juega 25 partidas', m.length >= 25),
    L('incansable', 'Primeros pasos', '⚡', 'Incansable', 'Juega 100 partidas', m.length >= 100),
    L('leyenda', 'Primeros pasos', '🏛️', 'Leyenda del portal', 'Juega 300 partidas', m.length >= 300),
    L('explorador', 'Primeros pasos', '🧭', 'Explorador', 'Prueba 10 juegos distintos', juegos.size >= 10),
    L('coleccionista', 'Primeros pasos', '🗂️', 'Coleccionista', `Juega los ${abiertos} juegos`, juegos.size >= abiertos),
    L('todoterreno', 'Primeros pasos', '🎲', 'Todoterreno', 'Juega al menos un juego de cada tipo', ORDEN_MOTORES.every((x) => motores.has(x))),
    L('constante', 'Constancia', '📅', 'Constante', 'Juega en 5 días distintos', dias.size >= 5),
    L('fiel', 'Constancia', '💜', 'Fiel al torneo', 'Juega en 14 días distintos', dias.size >= 14),
    L('racha-3', 'Constancia', '🔗', 'Racha de tres', 'Juega 3 días seguidos', racha >= 3),
    L('racha-7', 'Constancia', '⛓️', 'Semana perfecta', 'Juega 7 días seguidos', racha >= 7),
    L('maraton', 'Constancia', '🏃', 'Maratón', 'Juega 20 partidas en un mismo día', [...porDia.values()].some((x) => x >= 20)),
    L('madrugador', 'Constancia', '🌅', 'Madrugador', 'Juega antes de las 8 de la mañana', horas.some((h) => h >= 5 && h < 8)),
    L('primer-duelo', 'Duelos y fantasmas', '🤝', 'Primer duelo', 'Termina un enfrentamiento', cerrados.length >= 1),
    L('duelista', 'Duelos y fantasmas', '⚔️', 'Duelista', 'Gana un enfrentamiento', victorias >= 1),
    L('campeon-duelos', 'Duelos y fantasmas', '🏆', 'Campeón de duelos', 'Gana 5 enfrentamientos', victorias >= 5),
    L('cazafantasmas', 'Duelos y fantasmas', '👻', 'Cazafantasmas', 'Gánale al fantasma del líder del día', fantasmas >= 1),
    L('exorcista', 'Duelos y fantasmas', '🕯️', 'Exorcista', 'Gánale 5 veces al fantasma del líder', fantasmas >= 5),
    L('torre-6', 'Hazañas', '🎃', 'Rascacielos de calabazas', 'Torre de Calabazas: levanta 6 metros', alguna('calabazas', (x) => n(x.d.altura) >= 6)),
    L('escapista', 'Hazañas', '🗝️', 'Escapista', 'Laberinto Embrujado: supera 2 pisos', alguna('laberinto', (x) => n(x.d.pisos) >= 2)),
    L('espanta', 'Hazañas', '🔦', 'Espantafantasmas', 'Laberinto Embrujado: espanta 3 fantasmas en una partida', alguna('laberinto', (x) => n(x.d.espantados) >= 3)),
    L('bruja', 'Hazañas', '🧹', 'Bruja suprema', 'Carrera de Escobas: llega primero', alguna('escobas', (x) => n(x.d.puesto) === 1)),
    L('riel', 'Hazañas', '🚂', 'Maratonista del riel', 'Subway Surfers: corre 1.500 metros', alguna('tren', (x) => n(x.d.metros) >= 1500)),
    L('depredador', 'Hazañas', '🐍', 'Depredador', 'Serpientes: elimina 3 serpientes en una partida', alguna('serpientes', (x) => n(x.d.eliminadas) >= 3)),
    L('superviviente', 'Hazañas', '🛡️', 'Superviviente', 'Serpientes: sigue viva cuando se acaba el tiempo', alguna('serpientes', (x) => x.d.vivo === true)),
    L('halcon', 'Hazañas', '🎯', 'Ojo de halcón', 'Galería de Tiro: termina con 85 % de puntería', alguna('tiro', (x) => n(x.d.punteria) >= 85)),
    L('demolicion', 'Hazañas', '🍉', 'Demolición total', 'Angry Birds: despeja los dos niveles', alguna('catapulta', (x) => n(x.d.niveles) >= 2)),
    L('chuzas', 'Hazañas', '🎳', 'Tres chuzas', 'Bolos Playeros: 3 chuzas en una partida', alguna('bolos', (x) => n(x.d.chuzas) >= 3)),
    L('podio', 'Hazañas', '🏎️', 'Bandera a cuadros', 'Carreras de Autos: gana la carrera', alguna('karts', (x) => n(x.d.puesto) === 1)),
    L('agujero', 'Hazañas', '🕳️', 'Apetito infinito', 'Agujero Negro: termina primero', alguna('agujero', (x) => n(x.d.puesto) === 1)),
    L('noctambulo', 'Secretos', '🦉', 'Noctámbulo', 'Juega pasada la medianoche', horas.some((h) => h < 4), true),
    L('halloween', 'Secretos', '🦇', 'Noche de Brujas', 'Juega el 31 de octubre', dias.has('2026-10-31'), true),
    L('pulso', 'Secretos', '🧘', 'Pulso de cirujano', 'Torre de Calabazas: 4 metros sin que se caiga ninguna pieza', alguna('calabazas', (x) => n(x.d.altura) >= 4 && n(x.d.caidas) === 0), true),
    L('vuelo-limpio', 'Secretos', '✨', 'Vuelo limpio', 'Carrera de Escobas: gana sin chocar con nada', alguna('escobas', (x) => n(x.d.puesto) === 1 && n(x.d.choques) === 0), true),
    L('cien', 'Secretos', '💯', 'Mil intentos… casi', 'Juega 50 partidas en un mismo día', [...porDia.values()].some((x) => x >= 50), true),
  ];
  // Experto en cada juego: llegar a un tercio del puntaje tope (el que casi nadie debería pasar jugando limpio)
  for (const j of JUEGOS.filter((x) => x.listo)) {
    const tope = TOPES[j.id];
    if (!tope) continue;
    const meta = Math.round((tope * 0.35) / 10) * 10;
    lista.push(L(`experto-${j.id}`, 'Expertos', '⭐', `Experto: ${j.nombre}`, `Haz ${meta} ${j.unidad} en ${j.nombre}`, alguna(j.id, (x) => x.puntaje >= meta)));
  }
  return lista;
}

// ───────── Pase de temporada ─────────
export const NIVELES = 50;
/** Experiencia para pasar del nivel n al n+1 (sube un poco en cada nivel). */
export const costoNivel = (n: number) => 120 + 30 * (n - 1);

export interface Experiencia { total: number; nivel: number; enNivel: number; paraSubir: number; desglose: [string, number][] }

export function experiencia(d: Datos, cuantosLogros: number): Experiencia {
  const marcas = d.marcas.filter((x) => VALIDOS.has(x.juego));
  // Cada partida: 10 más hasta 30 según qué tan cerca del tope quedó; sobre el tope sigue sumando, cada vez menos (hasta 20 más). Se cuentan hasta 15 por juego al día (para que no
  // convenga repetir lo mismo sin parar).
  const vistas = new Map<string, number>();
  let partidas = 0;
  for (const x of [...marcas].reverse()) {
    const clave = `${x.fecha}|${x.juego}`, ya = vistas.get(clave) ?? 0;
    vistas.set(clave, ya + 1);
    if (ya >= 15) continue;
    const tope = TOPES[x.juego];
    const cerca = Math.max(0, x.puntaje) / (tope || 1);
    partidas += 10 + (!tope ? 10 : cerca <= 1 ? Math.round(30 * cerca) : 30 + Math.min(20, Math.round(10 * Math.log2(cerca))));
  }
  const dias = new Set(marcas.map((x) => x.fecha)).size * 20, juegos = new Set(marcas.map((x) => x.juego)).size * 40;
  const cerrados = d.duelos.filter((x) => x.e.estado === 'cerrado'), duelos = cerrados.length * 15 + cerrados.filter((x) => x.e.ganador === x.lado).length * 60;
  const deLogros = cuantosLogros * 50;
  const desglose: [string, number][] = [['Partidas', partidas], ['Días jugados', dias], ['Juegos distintos', juegos], ['Duelos', duelos], ['Logros', deLogros]];
  const total = desglose.reduce((s, [, v]) => s + v, 0);
  let nivel = 1, resto = total;
  while (nivel < NIVELES && resto >= costoNivel(nivel)) { resto -= costoNivel(nivel); nivel++; }
  return { total, nivel, enNivel: nivel >= NIVELES ? costoNivel(NIVELES - 1) : resto, paraSubir: nivel >= NIVELES ? costoNivel(NIVELES - 1) : costoNivel(nivel), desglose };
}

