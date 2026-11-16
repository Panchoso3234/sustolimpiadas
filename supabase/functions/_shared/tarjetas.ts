// Bot de Discord 2.0 (15-11): tarjetas para el canal «anuncios bot». Árboles al estilo React que Satori convierte en
// SVG y resvg en PNG (como la tabla y La Cuarta). Puro, para poder probarlo con node. Sin emojis (la fuente no los tiene).
import { limpio, pts } from './tabla.ts';

interface Nodo { type: string; props: Record<string, unknown> }
type Estilo = Record<string, string | number>;
export interface Persona { nombre: string; avatar?: string | null; equipo?: string | null }
export interface DatosDuelo { cruce?: number | null; juego: string; ganador: 'a' | 'b' | 'empate'; a: Persona & { rondas: number; pts: number }; b: Persona & { rondas: number; pts: number }; mult?: number }
export interface DatosRecord { juego: string; persona: Persona; puntaje: number; anterior: number; de: string; duelo: boolean }
export interface DatosMvp { jornada: number; jugador: Persona & { puntos: number; victorias: number }; equipo?: { nombre: string; sube: number; puesto: number } | null; ganador?: Persona & { victorias: number } | null }
export interface DatosCuenta { dias: number; fecha: string; filas: { pos: number; nombre: string; puntos: number }[]; septimo?: { nombre: string; puntos: number } | null }
export type Tarjeta = { tipo: 'duelo'; datos: DatosDuelo } | { tipo: 'record'; datos: DatosRecord } | { tipo: 'mvp'; datos: DatosMvp } | { tipo: 'cuenta'; datos: DatosCuenta };

const C = { fondo: '#141a2e', caja: '#1d2540', oro: '#ffc83d', texto: '#f4f1ea', tenue: '#9aa6c4', verde: '#3fd17a', rojo: '#ff5a6e', morado: '#b46cff', azul: '#4aa8ff' };
const h = (type: string, style: Estilo, hijos?: unknown, extra: Record<string, unknown> = {}): Nodo => ({ type, props: { style: { display: 'flex', ...style }, children: hijos, ...extra } });
const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const nombre = (s: string, n = 22) => recortar(limpio(s), n);

/** Avatar de Discord en círculo (en PNG), o las iniciales si no hay. */
function foto(p: Persona, tam: number, borde: string): Nodo {
  const url = p.avatar?.startsWith('data:') ? p.avatar : null; // ya descargado por cargarFotos
  const marco = { width: tam, height: tam, borderRadius: tam / 2, border: `${Math.round(tam / 18)}px solid ${borde}` };
  if (url) return h('img', { ...marco, objectFit: 'cover' }, undefined, { src: url, width: tam, height: tam });
  const ini = (limpio(p.nombre).match(/\p{L}+/gu) ?? ['?']).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  return h('div', { ...marco, alignItems: 'center', justifyContent: 'center', background: C.caja, color: C.texto, fontFamily: 'Alfa', fontSize: tam * 0.38 }, ini);
}
const cabeza = (arriba: string, titulo: string, color = C.oro) => [
  h('div', { fontSize: 24, fontWeight: 800, color, letterSpacing: 4 }, arriba),
  h('div', { fontFamily: 'Alfa', fontSize: 56, color: C.texto, marginTop: 8 }, recortar(titulo, 32)),
];
const lienzo = (alto: number, hijos: Nodo[]) => h('div', { flexDirection: 'column', width: 1080, height: alto, background: C.fondo, padding: '44px 56px', fontFamily: 'Nunito' }, hijos);

function duelo(d: DatosDuelo): Nodo {
  const lado = (p: DatosDuelo['a'], gana: boolean) => h('div', { flexDirection: 'column', alignItems: 'center', width: 360 }, [
    foto(p, 170, gana ? C.oro : C.caja),
    h('div', { fontSize: 34, fontWeight: 800, color: C.texto, marginTop: 18 }, nombre(p.nombre, 18)),
    h('div', { fontSize: 22, color: C.tenue, marginTop: 4 }, nombre(p.equipo ?? 'sin equipo', 26)),
    h('div', { fontSize: 26, fontWeight: 800, color: gana ? C.verde : C.tenue, marginTop: 14 }, `+${pts(p.pts)} pts`),
  ]);
  const titulo = d.ganador === 'empate' ? 'Empate' : `Gana ${nombre(d[d.ganador].nombre, 20)}`;
  return lienzo(ALTOS.duelo, [
    ...cabeza(`DUELO TERMINADO${d.cruce ? ` · CRUCE ${d.cruce}` : ''}`, titulo),
    h('div', { fontSize: 26, color: C.tenue, marginTop: 6 }, `${d.juego}${d.mult && d.mult !== 1 ? ` · puntos x${String(d.mult).replace('.', ',')}` : ''}`),
    h('div', { alignItems: 'center', justifyContent: 'space-between', marginTop: 40 }, [
      lado(d.a, d.ganador === 'a'),
      h('div', { fontFamily: 'Alfa', fontSize: 96, color: C.oro }, `${d.a.rondas}-${d.b.rondas}`),
      lado(d.b, d.ganador === 'b'),
    ]),
  ]);
}

function record(d: DatosRecord): Nodo {
  return lienzo(ALTOS.record, [
    ...cabeza(`NUEVO RÉCORD${d.duelo ? ' · EN DUELO' : ''}`, d.juego, C.verde),
    h('div', { alignItems: 'center', marginTop: 44 }, [
      foto(d.persona, 200, C.oro),
      h('div', { flexDirection: 'column', marginLeft: 44 }, [
        h('div', { fontSize: 40, fontWeight: 800, color: C.texto }, nombre(d.persona.nombre, 20)),
        h('div', { fontSize: 24, color: C.tenue, marginTop: 4 }, nombre(d.persona.equipo ?? '', 28)),
        h('div', { fontFamily: 'Alfa', fontSize: 92, color: C.oro, marginTop: 10 }, pts(d.puntaje)),
        h('div', { fontSize: 26, color: C.tenue, marginTop: 4 }, `Antes: ${pts(d.anterior)} de ${nombre(d.de, 20)}`),
      ]),
    ]),
  ]);
}

function mvp(d: DatosMvp): Nodo {
  const bloque = (titulo: string, cuerpo: Nodo[], color: string) => h('div', { flexDirection: 'column', background: C.caja, borderRadius: 24, padding: '24px 30px', marginTop: 22, borderLeft: `10px solid ${color}` }, [
    h('div', { fontSize: 22, fontWeight: 800, color, letterSpacing: 3 }, titulo), ...cuerpo,
  ]);
  const j = d.jugador;
  return lienzo(ALTOS.mvp, [
    ...cabeza(`FIN DE LA JORNADA ${d.jornada}`, 'MVP de la jornada'),
    h('div', { alignItems: 'center', marginTop: 34 }, [
      foto(j, 220, C.oro),
      h('div', { flexDirection: 'column', marginLeft: 44 }, [
        h('div', { fontFamily: 'Alfa', fontSize: 58, color: C.oro }, nombre(j.nombre, 16)),
        h('div', { fontSize: 26, color: C.tenue, marginTop: 4 }, nombre(j.equipo ?? '', 28)),
        h('div', { fontSize: 34, fontWeight: 800, color: C.texto, marginTop: 14 }, `${pts(j.puntos)} pts · ${j.victorias} ${j.victorias === 1 ? 'victoria' : 'victorias'}`),
      ]),
    ]),
    ...(d.equipo ? [bloque('EL EQUIPO QUE MÁS SUBIÓ', [h('div', { fontSize: 38, fontWeight: 800, color: C.texto, marginTop: 8 }, `${nombre(d.equipo.nombre, 26)}  +${d.equipo.sube} (ahora ${d.equipo.puesto}.º)`)], C.verde)] : []),
    ...(d.ganador ? [bloque('MÁS VICTORIAS EN LA JORNADA', [h('div', { alignItems: 'center', marginTop: 10 }, [foto(d.ganador, 70, C.azul), h('div', { fontSize: 36, fontWeight: 800, color: C.texto, marginLeft: 20 }, `${nombre(d.ganador.nombre, 20)} · ${d.ganador.victorias}`)])], C.azul)] : []),
  ]);
}

function cuenta(d: DatosCuenta): Nodo {
  const brecha = d.septimo && d.filas[5] ? d.filas[5].puntos - d.septimo.puntos : null;
  return lienzo(ALTOS.cuenta, [
    ...cabeza('CUENTA REGRESIVA', d.dias > 0 ? `${d.dias} ${d.dias === 1 ? 'día' : 'días'} para la final` : 'Último día de cruces'),
    h('div', { fontSize: 26, color: C.tenue, marginTop: 6 }, `Fin de los cruces: ${d.fecha} · si terminara hoy, clasifican:`),
    h('div', { flexDirection: 'column', marginTop: 26 }, d.filas.slice(0, 6).map((f) => h('div', { alignItems: 'center', height: 74, marginBottom: 10, padding: '0 26px', borderRadius: 18, background: C.caja, borderLeft: `10px solid ${C.oro}` }, [
      h('div', { width: 60, fontFamily: 'Alfa', fontSize: 32, color: C.oro }, `${f.pos}.`),
      h('div', { flex: 1, fontSize: 34, fontWeight: 800, color: C.texto }, nombre(f.nombre, 28)),
      h('div', { fontFamily: 'Alfa', fontSize: 36, color: C.texto }, pts(f.puntos)),
    ]))),
    ...(d.septimo && brecha != null ? [h('div', { marginTop: 18, fontSize: 30, fontWeight: 800, color: C.rojo }, `7.º ${nombre(d.septimo.nombre, 24)} está a ${pts(brecha)} pts del corte`)] : []),
  ]);
}

/** Descarga cada avatar antes de dibujar: si Discord ya no lo tiene (avatar cambiado) quedan las iniciales. */
export async function cargarFotos(t: Tarjeta): Promise<Tarjeta> {
  const personas: Persona[] = [];
  const d = t.datos as unknown as Record<string, unknown>;
  for (const k of ['a', 'b', 'persona', 'jugador', 'ganador']) if (d[k] && typeof d[k] === 'object') personas.push(d[k] as Persona);
  await Promise.all(personas.map(async (p) => {
    if (!p.avatar) return;
    try {
      const r = await fetch(p.avatar.replace(/\.(webp|gif)(\?.*)?$/, '.png').replace(/(\?.*)?$/, '?size=256'));
      const tipo = r.headers.get('content-type') ?? '';
      if (!r.ok || !tipo.startsWith('image/')) { p.avatar = null; return; }
      const b = new Uint8Array(await r.arrayBuffer());
      let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      p.avatar = `data:${tipo};base64,${btoa(bin)}`;
    } catch { p.avatar = null; }
  }));
  return t;
}

export const ALTOS: Record<Tarjeta['tipo'], number> = { duelo: 640, record: 560, mvp: 820, cuenta: 900 };
export function arbolTarjeta(t: Tarjeta): Nodo {
  switch (t.tipo) {
    case 'duelo': return duelo(t.datos);
    case 'record': return record(t.datos);
    case 'mvp': return mvp(t.datos);
    case 'cuenta': return cuenta(t.datos);
  }
}
