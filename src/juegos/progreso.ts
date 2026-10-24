import { fechaChile, horaChile } from '../nucleo/azar';
import { supabase } from '../nucleo/supabase';
import { JUEGOS, ORDEN_MOTORES, TOPES, juegoPorId } from './catalogo';
import * as V from './duelos';

// Progreso de cada participante: logros, experiencia del pase de temporada y resumen de la semana.
// Todo se calcula de las partidas y duelos que ya están guardados en la base (lo mismo que ve cualquiera en un perfil).
// Lo único propio que se guarda es la "vitrina": qué título, marco y efecto lleva puestos y qué decora su casa.

/** Lo que se lee del detalle de cada partida (solo estas claves: el recorrido grabado pesa y aquí no hace falta). */
const CLAVES = ['altura', 'caidas', 'pisos', 'espantados', 'puesto', 'choques', 'metros', 'eliminadas', 'vivo', 'punteria', 'niveles', 'chuzas', 'gano', 'venceLider', 'acerto', 'intentos', 'llego'] as const;
export interface Marca { juego: string; puntaje: number; fecha: string; creado: string; d: Partial<Record<(typeof CLAVES)[number], unknown>> }
export interface Datos { id: string; nombre: string; marcas: Marca[]; duelos: { e: V.Enfrentamiento; lado: V.Lado }[] }

export async function cargarDatos(id: string): Promise<Datos> {
  const columnas = ['juego', 'puntaje', 'fecha', 'creado', ...CLAVES.map((k) => `${k}:detalle->${k}`)].join(',');
  const [{ data: perfil }, { data: filas }, equipos, { lista }] = await Promise.all([
    supabase.from('perfiles').select('nombre').eq('id', id).maybeSingle(),
    supabase.from('marcas').select(columnas).eq('perfil_id', id).order('creado', { ascending: false }).limit(3000),
    V.listarEquipos(), V.listarEnfrentamientos(),
  ]);
  const marcas = ((filas ?? []) as unknown as Record<string, unknown>[]).map((f) => {
    const d: Marca['d'] = {};
    for (const k of CLAVES) if (f[k] !== null && f[k] !== undefined) d[k] = f[k];
    return { juego: f.juego as string, puntaje: f.puntaje as number, fecha: f.fecha as string, creado: f.creado as string, d };
  });
  const duelos = lista.map((e) => ({ e, lado: V.ladoDe(e, id, equipos) })).filter((x): x is { e: V.Enfrentamiento; lado: V.Lado } => x.lado !== null);
  return { id, nombre: (perfil as { nombre: string } | null)?.nombre ?? 'Participante', marcas, duelos };
}

// ───────── Logros ─────────
export type Categoria = 'Primeros pasos' | 'Constancia' | 'Duelos y fantasmas' | 'Hazañas' | 'Expertos' | 'Secretos';
export interface Logro { id: string; nombre: string; como: string; icono: string; categoria: Categoria; secreto?: boolean; tiene: boolean }

/** Días seguidos más largos jugados (fechas "AAAA-MM-DD"). */
function rachaDias(fechas: string[]): number {
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
    L('adivino', 'Hazañas', '🔤', 'Adivino', 'La Palabra Secreta: acierta en 3 intentos o menos', alguna('palabra', (x) => x.d.acerto === true && n(x.d.intentos) <= 3)),
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
export const NIVELES = 30;
/** Experiencia para pasar del nivel n al n+1 (sube un poco en cada nivel). */
export const costoNivel = (n: number) => 120 + 30 * (n - 1);

export interface Experiencia { total: number; nivel: number; enNivel: number; paraSubir: number; desglose: [string, number][] }

export function experiencia(d: Datos, cuantosLogros: number): Experiencia {
  // Cada partida: 10 más hasta 30 según qué tan cerca del tope quedó; sobre el tope sigue sumando, cada vez menos (hasta 20 más). Se cuentan hasta 15 por juego al día (para que no
  // convenga repetir lo mismo sin parar).
  const vistas = new Map<string, number>();
  let partidas = 0;
  for (const x of [...d.marcas].reverse()) {
    const clave = `${x.fecha}|${x.juego}`, ya = vistas.get(clave) ?? 0;
    vistas.set(clave, ya + 1);
    if (ya >= 15) continue;
    const tope = TOPES[x.juego];
    const cerca = Math.max(0, x.puntaje) / (tope || 1);
    partidas += 10 + (!tope ? 10 : cerca <= 1 ? Math.round(30 * cerca) : 30 + Math.min(20, Math.round(10 * Math.log2(cerca))));
  }
  const dias = new Set(d.marcas.map((x) => x.fecha)).size * 20, juegos = new Set(d.marcas.map((x) => x.juego)).size * 40;
  const cerrados = d.duelos.filter((x) => x.e.estado === 'cerrado'), duelos = cerrados.length * 15 + cerrados.filter((x) => x.e.ganador === x.lado).length * 60;
  const deLogros = cuantosLogros * 50;
  const desglose: [string, number][] = [['Partidas', partidas], ['Días jugados', dias], ['Juegos distintos', juegos], ['Duelos', duelos], ['Logros', deLogros]];
  const total = desglose.reduce((s, [, v]) => s + v, 0);
  let nivel = 1, resto = total;
  while (nivel < NIVELES && resto >= costoNivel(nivel)) { resto -= costoNivel(nivel); nivel++; }
  return { total, nivel, enNivel: nivel >= NIVELES ? costoNivel(NIVELES - 1) : resto, paraSubir: nivel >= NIVELES ? costoNivel(NIVELES - 1) : costoNivel(nivel), desglose };
}

export type TipoPremio = 'titulo' | 'marco' | 'deco' | 'efecto';
export interface Premio { nivel: number; tipo: TipoPremio; id: string; nombre: string; icono: string }
const P = (nivel: number, tipo: TipoPremio, id: string, nombre: string, icono: string): Premio => ({ nivel, tipo, id, nombre, icono });
/** Lo que entrega cada nivel del pase. Los marcos tienen su estilo en estilos.css (`.marco-<id>`); las decoraciones se ven en la casa de la isla. */
export const PREMIOS: Premio[] = [
  P(1, 'titulo', 'aprendiz', 'Aprendiz de Brujo', '🪄'),
  P(2, 'marco', 'calabaza', 'Marco Calabaza', '🎃'),
  P(3, 'deco', 'calabazas', 'Calabazas en la entrada', '🎃'),
  P(4, 'titulo', 'cazadulces', 'Cazador de Dulces', '🍬'),
  P(5, 'efecto', 'dulces', 'Lluvia de dulces al ganar', '🍭'),
  P(6, 'deco', 'farolas', 'Farolas encendidas', '🏮'),
  P(7, 'marco', 'telarana', 'Marco Telaraña', '🕸️'),
  P(8, 'titulo', 'inquieto', 'Espíritu Inquieto', '👻'),
  P(9, 'deco', 'lapida', 'Lápida de recuerdo', '🪦'),
  P(10, 'marco', 'fatuo', 'Marco Fuego Fatuo', '🔵'),
  P(11, 'titulo', 'alma', 'Alma de la Fiesta', '🎉'),
  P(12, 'deco', 'fantasma', 'Fantasma mascota', '👻'),
  P(13, 'efecto', 'murcielagos', 'Murciélagos al ganar', '🦇'),
  P(14, 'titulo', 'maestro', 'Maestro del Portal', '🎮'),
  P(15, 'deco', 'caldero', 'Caldero burbujeante', '🧪'),
  P(16, 'marco', 'luna', 'Marco Luna Llena', '🌕'),
  P(17, 'titulo', 'leyenda', 'Leyenda Sustolímpica', '📜'),
  P(18, 'deco', 'murcielagos', 'Murciélagos en el techo', '🦇'),
  P(19, 'marco', 'arcoiris', 'Marco Arcoíris', '🌈'),
  P(20, 'titulo', 'inmortal', 'Inmortal', '💀'),
  P(21, 'deco', 'telaranas', 'Telarañas gigantes', '🕸️'),
  P(22, 'efecto', 'fuegos', 'Fuegos artificiales al ganar', '🎆'),
  P(23, 'titulo', 'pesadilla', 'Pesadilla de los Rivales', '😈'),
  P(24, 'deco', 'arbol', 'Árbol embrujado', '🌳'),
  P(25, 'marco', 'dorado', 'Marco Dorado', '🥇'),
  P(26, 'titulo', 'suprema', 'Calabaza Suprema', '👑'),
  P(27, 'deco', 'trofeo', 'Estatua del trofeo', '🏆'),
  P(28, 'marco', 'aurora', 'Marco Aurora', '🌌'),
  P(29, 'titulo', 'eterno', 'Sustolímpico Eterno', '♾️'),
  P(30, 'deco', 'torre', 'Torre de campeón en la casa', '🏰'),
];
export const premio = (tipo: TipoPremio, id: string | null | undefined) => (id ? PREMIOS.find((p) => p.tipo === tipo && p.id === id) ?? null : null);

// ───────── Vitrina: lo que cada uno lleva puesto ─────────
export interface Vitrina { titulo: string | null; marco: string | null; efecto: string | null; nivel: number; logros: number; deco: string[] }
export const VITRINA_VACIA: Vitrina = { titulo: null, marco: null, efecto: null, nivel: 1, logros: 0, deco: [] };
const LOCAL = 'susto.vitrina';

/** Solo se aceptan premios del nivel alcanzado (la base no lo puede comprobar: es un adorno). */
export function limpiarVitrina(v: Partial<Vitrina> | null | undefined): Vitrina {
  const nivel = Math.max(1, Math.min(NIVELES, Math.floor(Number(v?.nivel) || 1))), alcanza = (tipo: TipoPremio, id: unknown) => { const p = premio(tipo, typeof id === 'string' ? id : null); return p && p.nivel <= nivel ? p.id : null; };
  return {
    titulo: alcanza('titulo', v?.titulo), marco: alcanza('marco', v?.marco), efecto: alcanza('efecto', v?.efecto), nivel,
    logros: Math.max(0, Math.floor(Number(v?.logros) || 0)),
    deco: Array.isArray(v?.deco) ? v!.deco.filter((x) => alcanza('deco', x)).slice(0, 12) : [],
  };
}

let todas: Promise<Map<string, Vitrina>> | null = null, tablaLista = true;
/** Las vitrinas de todos (para mostrar títulos y marcos en tablas, perfiles y casas). Se piden una vez por visita. */
export function vitrinas(): Promise<Map<string, Vitrina>> {
  return (todas ??= (async () => {
    const { data, error } = await supabase.from('vitrinas').select('perfil_id,titulo,marco,efecto,nivel,logros,deco');
    if (error) tablaLista = false;
    return new Map((data ?? []).map((f) => [f.perfil_id as string, limpiarVitrina(f as Partial<Vitrina>)]));
  })());
}
/** Falso si la tabla de vitrinas todavía no se creó en Supabase (entonces solo se guarda en este navegador). */
export const vitrinasActivas = () => tablaLista;

export function vitrinaLocal(): Vitrina {
  try { return limpiarVitrina(JSON.parse(localStorage.getItem(LOCAL) ?? 'null')); } catch { return VITRINA_VACIA; }
}

export async function guardarVitrina(usuarioId: string | null, v: Vitrina): Promise<boolean> {
  const limpia = limpiarVitrina(v);
  try { localStorage.setItem(LOCAL, JSON.stringify(limpia)); } catch { /* sin almacenamiento */ }
  if (!usuarioId) return false;
  const { error } = await supabase.from('vitrinas').upsert({ perfil_id: usuarioId, ...limpia, actualizado: new Date().toISOString() });
  todas = null;
  if (error) tablaLista = false;
  return !error;
}

/** Recalcula nivel y logros de quien está conectado y los deja en su vitrina (lo usa la isla para su casa). */
export async function refrescarVitrina(usuarioId: string): Promise<Vitrina> {
  const d = await cargarDatos(usuarioId), lista = logros(d), ganados = lista.filter((x) => x.tiene).length, xp = experiencia(d, ganados);
  const actual = (await vitrinas()).get(usuarioId) ?? vitrinaLocal();
  const nueva = limpiarVitrina({ ...actual, nivel: xp.nivel, logros: ganados, deco: actual.deco.length ? actual.deco : PREMIOS.filter((p) => p.tipo === 'deco' && p.nivel <= xp.nivel).map((p) => p.id) });
  if (nueva.nivel !== actual.nivel || nueva.logros !== actual.logros || nueva.deco.join() !== actual.deco.join()) await guardarVitrina(usuarioId, nueva);
  return nueva;
}

// ───────── Resumen de la semana ─────────
export interface Semana { desde: string; hasta: string; partidas: number; juegos: number; dias: number; favorito: string | null; mejor: { juego: string; puntaje: number } | null; duelos: number; ganados: number; racha: number; nuevosLogros: number }

export function semana(d: Datos, lista: Logro[]): Semana {
  const hasta = fechaChile(Date.now()), desde = fechaChile(Date.now() - 6 * 864e5);
  const m = d.marcas.filter((x) => x.fecha >= desde && x.fecha <= hasta);
  const cuenta = new Map<string, number>();
  for (const x of m) cuenta.set(x.juego, (cuenta.get(x.juego) ?? 0) + 1);
  const favorito = [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  // La "mejor" marca de la semana: la que más se acerca al tope de su juego
  const mejor = m.reduce<Marca | null>((b, x) => (!b || x.puntaje / (TOPES[x.juego] ?? 1e9) > b.puntaje / (TOPES[b.juego] ?? 1e9) ? x : b), null);
  const duelos = d.duelos.filter((x) => x.e.estado === 'cerrado' && fechaChile(Date.parse(x.e.creado)) >= desde);
  // Logros que se lograron esta semana: los que no se cumplían con las partidas anteriores
  const antes = logros({ ...d, marcas: d.marcas.filter((x) => x.fecha < desde), duelos: d.duelos.filter((x) => fechaChile(Date.parse(x.e.creado)) < desde) }).filter((x) => x.tiene).length;
  return {
    desde, hasta, partidas: m.length, juegos: cuenta.size, dias: new Set(m.map((x) => x.fecha)).size, favorito,
    mejor: mejor ? { juego: mejor.juego, puntaje: mejor.puntaje } : null, duelos: duelos.length, ganados: duelos.filter((x) => x.e.ganador === x.lado).length,
    racha: rachaDias(m.map((x) => x.fecha)), nuevosLogros: Math.max(0, lista.filter((x) => x.tiene).length - antes),
  };
}

/** Solo en pruebas ("?muestra=1"): un participante inventado con dos semanas de partidas. */
export function datosDeMuestra(): Datos {
  const marcas: Marca[] = [], juegos = JUEGOS.filter((j) => j.listo);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let dia = 0; dia < 12; dia++) for (let n = 0; n < 6 + Math.floor(r() * 14); n++) {
    const j = juegos[Math.floor(r() * juegos.length)], fecha = fechaChile(Date.now() - dia * 864e5);
    marcas.push({ juego: j.id, puntaje: Math.round((TOPES[j.id] ?? 1000) * r() * 0.5), fecha, creado: `${fecha}T${String(9 + Math.floor(r() * 12)).padStart(2, '0')}:00:00-03:00`, d: { altura: r() * 7, puesto: 1 + Math.floor(r() * 3), pisos: Math.floor(r() * 3), venceLider: r() < 0.1 } });
  }
  return { id: 'muestra', nombre: 'Calabacín de Prueba', marcas, duelos: [] };
}
