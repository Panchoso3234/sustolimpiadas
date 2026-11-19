// Foto de la Fase 1 para la FASE FINAL: con qué llega cada tributo. Pura (recibe los datos ya cargados).
// Poder (0 a 1): 70 % el puntaje personal de la liga y 30 % los récords históricos (top 3 de cada juego).
// Atributo principal: la categoría de juegos donde mejor le fue en duelos, con A = (ganados + 1,5) / (jugados + 3) y
// al menos 2 duelos (una tasa, no la cantidad: Arcade tiene 28 juegos y Carreras solo 2). Título: de datos reales.
import { TODOS, type Motor } from '../juegos/catalogo';
import type { Atributo, Tributo } from './motor';

export const ATRIBUTO_DE: Record<Motor, Atributo> = { A: 'Velocidad', B: 'Fuerza', C: 'Precisión', D: 'Agilidad', E: 'Astucia', F: 'Temple', G: 'Instinto' };

export interface FichaTributo extends Tributo {
  avatar: string | null; titulo: string; puntos: number; ganados: number; jugados: number; primeros: number; podios: number;
  atributos: Partial<Record<Atributo, number>>; entrada: 'equipo' | 'especial';
}
interface Jugador { id: string; nombre: string; puntos: number; equipo: { nombre: string } | null; clasifica: '' | 'equipo' | 'especial' }
interface Duelo { juego: string; modo: string; oficial: boolean; estado: string; ganador: string | null; a_perfil: string | null; b_perfil: string | null }
interface Fila { perfil: string; puntaje: number }

// Con TODOS (también los retirados): hay récords y duelos de juegos que ya salieron, como Al Agua Pato
const motorDe = new Map(TODOS.map((j) => [j.id, j.motor]));
const nombreJuego = new Map(TODOS.map((j) => [j.id, j.nombre]));

export function armarFicha(personal: Jugador[], duelos: Duelo[], records: Map<string, Fila[]> | null, avatares: Map<string, string | null>): FichaTributo[] {
  const clasificados = personal.filter((j) => j.clasifica);
  const base = clasificados.map((j) => {
    const mios = duelos.filter((d) => d.oficial && d.modo === '1v1' && d.estado === 'cerrado' && (d.a_perfil === j.id || d.b_perfil === j.id));
    const gana = (d: Duelo) => d.ganador === (d.a_perfil === j.id ? 'a' : 'b');
    const porMotor = new Map<Motor, { g: number; n: number }>(), porJuego = new Map<string, number>();
    for (const d of mios) {
      const m = motorDe.get(d.juego); if (!m) continue;
      const x = porMotor.get(m) ?? { g: 0, n: 0 }; x.n++; if (gana(d)) { x.g++; porJuego.set(d.juego, (porJuego.get(d.juego) ?? 0) + 1); }
      porMotor.set(m, x);
    }
    const atributos: Partial<Record<Atributo, number>> = {};
    for (const [m, x] of porMotor) atributos[ATRIBUTO_DE[m]] = (x.g + 1.5) / (x.n + 3);
    const elegible = [...porMotor].filter(([, x]) => x.n >= 2).sort((a, b) => (b[1].g + 1.5) / (b[1].n + 3) - (a[1].g + 1.5) / (a[1].n + 3));
    let primeros = 0, podios = 0, juegoRecord = '';
    for (const [juego, filas] of records ?? []) {
      const i = filas.findIndex((f) => f.perfil === j.id);
      if (i === 0) { primeros++; if (!juegoRecord) juegoRecord = juego; }
      if (i >= 0 && i < 3) podios++;
    }
    const mejorJuego = [...porJuego].sort((a, b) => b[1] - a[1])[0];
    const ganados = mios.filter(gana).length;
    const titulo = juegoRecord ? `Récord de ${nombreJuego.get(juegoRecord) ?? juegoRecord}`
      : mejorJuego && mejorJuego[1] >= 2 ? `Imbatible en ${nombreJuego.get(mejorJuego[0]) ?? mejorJuego[0]}`
      : ganados ? `${ganados} ${ganados === 1 ? 'duelo ganado' : 'duelos ganados'} en la liga` : 'Llega con hambre de revancha';
    return { j, ganados, jugados: mios.length, primeros, podios, atributos, atributo: elegible[0] ? ATRIBUTO_DE[elegible[0][0]] : null, titulo };
  });
  // Poder normalizado entre los tributos (0 = el que llega más débil, 1 = el más fuerte)
  const norm = (xs: number[]) => { const mn = Math.min(...xs), mx = Math.max(...xs); return xs.map((x) => (mx > mn ? (x - mn) / (mx - mn) : 0.5)); };
  const pPuntos = norm(base.map((b) => b.j.puntos)), pRecords = norm(base.map((b) => 3 * b.primeros + b.podios));
  return base.map((b, i) => ({
    id: b.j.id, nombre: b.j.nombre, distrito: b.j.equipo?.nombre ?? 'Sin equipo', poder: Math.round((0.7 * pPuntos[i] + 0.3 * pRecords[i]) * 1000) / 1000,
    atributo: b.atributo, avatar: avatares.get(b.j.id) ?? null, titulo: b.titulo, puntos: b.j.puntos, ganados: b.ganados, jugados: b.jugados,
    primeros: b.primeros, podios: b.podios, atributos: b.atributos, entrada: b.j.clasifica as 'equipo' | 'especial',
  }));
}
