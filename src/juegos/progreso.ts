import { fechaChile, horaChile } from '../nucleo/azar';
import { supabase } from '../nucleo/supabase';
import { CLAVES, NIVELES, experiencia, logros, rachaDias, type Datos as DatosBase, type Logro, type Marca } from './progresoBase';
import { JUEGOS, TOPES } from './catalogo';
export * from './progresoBase';
/** Los datos del progreso con los duelos completos (la web necesita más que la base). */
export type Datos = DatosBase<V.Enfrentamiento>;
import * as V from './duelos';

// Progreso de cada participante: logros, experiencia del pase de temporada y resumen de la semana.
// Todo se calcula de las partidas y duelos que ya están guardados en la base (lo mismo que ve cualquiera en un perfil).
// Lo único propio que se guarda es la "vitrina": qué título, marco y efecto lleva puestos y qué decora su casa.

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
  // Del 31 al 50 (27-10): sin decoraciones de la isla; títulos, marcos y efectos
  P(31, 'titulo', 'veterano', 'Veterano de Mil Partidas', '🎖️'),
  P(32, 'marco', 'obsidiana', 'Marco Obsidiana', '🖤'),
  P(33, 'efecto', 'estrellas', 'Lluvia de estrellas al ganar', '🌠'),
  P(34, 'titulo', 'domador', 'Domador de Rivales', '🦁'),
  P(35, 'marco', 'cristal', 'Marco Cristal', '💎'),
  P(36, 'titulo', 'mito', 'Mito Viviente', '🗿'),
  P(37, 'efecto', 'rayos', 'Rayos al ganar', '⚡'),
  P(38, 'titulo', 'tormenta', 'Ojo de la Tormenta', '🌀'),
  P(39, 'marco', 'magma', 'Marco Magma', '🌋'),
  P(40, 'titulo', 'astral', 'Viajero Astral', '🪐'),
  P(41, 'efecto', 'petalos', 'Pétalos al ganar', '🌸'),
  P(42, 'titulo', 'imparable', 'Imparable', '🚀'),
  P(43, 'marco', 'estelar', 'Marco Estelar', '✨'),
  P(44, 'titulo', 'reliquia', 'Reliquia del Torneo', '🏺'),
  P(45, 'efecto', 'cometa', 'Cometa al ganar', '☄️'),
  P(46, 'titulo', 'titan', 'Titán Sustolímpico', '🗻'),
  P(47, 'marco', 'eclipse', 'Marco Eclipse Total', '🌑'),
  P(48, 'titulo', 'oraculo', 'El Oráculo', '🔮'),
  P(49, 'efecto', 'supernova', 'Supernova al ganar', '💥'),
  P(50, 'marco', 'infinito', 'Marco Infinito', '♾️'),
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
