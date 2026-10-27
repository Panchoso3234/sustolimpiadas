// El Susto Diario: las páginas como imágenes (1080 × 1350, buenas para Discord y el celular). Son árboles de elementos
// al estilo React ({ type, props }) que Satori convierte en SVG y resvg en PNG. Estética de tabloide deportivo con
// noche de Halloween: papel, tinta, naranja calabaza, morado y sellos rojos. Sin emojis (la tipografía no los tiene).
import { miles, type Edicion, type Nota } from './periodista.ts';

export interface Nodo { type: string; props: Record<string, unknown> }
export interface Pagina { nombre: string; ancho: number; alto: number; arbol: Nodo }

const C = { papel: '#f4ead5', papel2: '#eadcbf', tinta: '#17131f', gris: '#5d5566', naranja: '#ff7a1a', morado: '#4b2276', rojo: '#d7263d', amarillo: '#ffd23c', verde: '#2e9e6b', noche: '#1b1430' };
const ANCHO = 1080, ALTO = 1350;
type Estilo = Record<string, string | number>;
/** Un elemento: `hijos` puede ser texto o una lista. */
const h = (type: string, style: Estilo, hijos?: unknown, extra: Record<string, unknown> = {}): Nodo => ({ type, props: { style: { display: 'flex', ...style }, children: hijos, ...extra } });
/** Los nombres sin emojis (la tipografía no los dibuja). */
export const limpio = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+/g, ' ').trim() || 'Participante';
const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Foto de una persona: su avatar de Discord en círculo, o sus iniciales si no tiene. */
function foto(e: Edicion, id: string, tam: number, borde: string): Nodo {
  const p = e.personas[id], nombre = limpio(p?.nombre ?? '?');
  const url = p?.avatar ? p.avatar.replace(/\.(webp|gif)(\?.*)?$/, '.png').replace(/(\?.*)?$/, '?size=256') : null;
  const marco: Estilo = { width: tam, height: tam, borderRadius: tam / 2, border: `${Math.round(tam / 18)}px solid ${borde}`, overflow: 'hidden', flexShrink: 0 };
  if (url) return h('div', marco, [{ type: 'img', props: { src: url, width: tam, height: tam, style: { width: tam, height: tam, objectFit: 'cover' } } }]);
  const iniciales = nombre.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  return h('div', { ...marco, background: C.morado, color: C.amarillo, alignItems: 'center', justifyContent: 'center', fontFamily: 'Alfa', fontSize: tam * 0.38 }, iniciales);
}
const sello = (texto: string, color = C.rojo, giro = -4, tam = 30): Nodo => h('div', { background: color, color: '#fff', fontFamily: 'Alfa', fontSize: tam, padding: '8px 22px', transform: `rotate(${giro}deg)`, border: '4px solid #fff', boxShadow: '0 6px 0 rgba(0,0,0,.25)', letterSpacing: 2 }, texto);

/** Cabecera del diario: nombre, fecha, número y cruce. */
function cabecera(e: Edicion, seccion: string): Nodo {
  return h('div', { flexDirection: 'column', width: '100%' }, [
    h('div', { justifyContent: 'space-between', alignItems: 'center', background: C.tinta, color: C.papel, fontFamily: 'Nunito', fontWeight: 800, fontSize: 22, padding: '10px 40px', letterSpacing: 1 }, [
      h('div', {}, `EDICIÓN N.º ${e.numero} · CRUCE ${e.cruce}`), h('div', { color: C.amarillo }, seccion.toUpperCase()), h('div', {}, `${e.desde.split('-').reverse().slice(0, 2).join('/')} AL ${e.hasta.split('-').reverse().slice(0, 2).join('/')} · JORNADA ${e.jornada}`),
    ]),
    h('div', { justifyContent: 'center', alignItems: 'center', padding: '18px 40px 10px', borderBottom: `6px solid ${C.tinta}` }, [
      h('div', { fontFamily: 'Alfa', fontSize: 104, color: C.tinta, letterSpacing: -2, lineHeight: 1 }, 'EL SUSTO'),
      h('div', { fontFamily: 'Alfa', fontSize: 104, color: C.naranja, letterSpacing: -2, lineHeight: 1, marginLeft: 22 }, 'DIARIO'),
    ]),
    h('div', { justifyContent: 'center', fontFamily: 'Nunito', fontWeight: 800, fontSize: 20, color: C.gris, padding: '6px 0', letterSpacing: 4, borderBottom: `2px solid ${C.tinta}` }, 'EL DIARIO OFICIAL DE LAS SUSTOLIMPIADAS · LO QUE PASÓ, SIN FILTRO'),
  ]);
}
const pie = (texto: string): Nodo => h('div', { marginTop: 'auto', background: C.naranja, color: C.tinta, fontFamily: 'Nunito', fontWeight: 800, fontSize: 22, padding: '14px 40px', justifyContent: 'center' }, texto);
const fondo = (hijos: Nodo[]): Nodo => h('div', { width: ANCHO, height: ALTO, flexDirection: 'column', background: C.papel, color: C.tinta, fontFamily: 'Nunito' }, hijos);

// ───────── Página 1: la portada ─────────
function portada(e: Edicion): Nodo {
  const p = e.portada, [g, q] = p.protagonistas;
  const secundarias = e.notas.slice(1, 4);
  return fondo([
    cabecera(e, 'Portada'),
    // Cinta de última hora
    h('div', { background: C.rojo, color: '#fff', fontFamily: 'Nunito', fontWeight: 800, fontSize: 24, padding: '10px 40px', alignItems: 'center' }, [h('div', { fontFamily: 'Alfa', marginRight: 18 }, 'ÚLTIMA HORA'), h('div', {}, recortar(limpio(e.ticker[1] ?? e.ticker[0] ?? ''), 70))]),
    // Fotos de los protagonistas con el sello de la noticia
    h('div', { justifyContent: 'center', alignItems: 'center', padding: '34px 40px 10px', position: 'relative' }, [
      g ? foto(e, g, 270, C.naranja) : h('div', {}, ''),
      h('div', { fontFamily: 'Alfa', fontSize: 70, color: C.morado, margin: '0 26px' }, q ? 'VS' : ''),
      q ? foto(e, q, 210, C.gris) : h('div', {}, ''),
      h('div', { position: 'absolute', top: 30, right: 60 }, [sello(p.sello, C.rojo, 6, 34)]),
      p.cifra ? h('div', { position: 'absolute', bottom: 0, left: 70, background: C.amarillo, color: C.tinta, fontFamily: 'Alfa', fontSize: 42, padding: '10px 24px', transform: 'rotate(-6deg)', border: `4px solid ${C.tinta}` }, p.cifra) : h('div', {}, ''),
    ]),
    // Titular y bajada
    h('div', { flexDirection: 'column', padding: '18px 48px 0' }, [
      h('div', { fontFamily: 'Nunito', fontWeight: 800, fontSize: 24, color: C.naranja, letterSpacing: 3 }, p.seccion.toUpperCase()),
      h('div', { fontFamily: 'Alfa', fontSize: limpio(p.titular).length > 60 ? 58 : 68, lineHeight: 1.04, color: C.tinta, marginTop: 6 }, limpio(p.titular)),
      h('div', { fontFamily: 'Nunito', fontSize: 30, lineHeight: 1.3, color: '#3a3342', marginTop: 16 }, limpio(p.bajada)),
    ]),
    // Tres notas más
    h('div', { padding: '26px 40px 26px', marginTop: 'auto' }, secundarias.map((n, i) => h('div', { flex: 1, flexDirection: 'column', padding: '14px 16px', borderLeft: `3px solid ${i ? C.tinta : C.papel}` }, [
      h('div', { fontFamily: 'Nunito', fontWeight: 800, fontSize: 18, color: C.rojo, letterSpacing: 2 }, n.sello),
      h('div', { fontFamily: 'Alfa', fontSize: 25, lineHeight: 1.15, marginTop: 6 }, recortar(limpio(n.titular), 70)),
    ]))),
    pie('La edición completa, con estadísticas y la tabla, en la web'),
  ]);
}

// ───────── Página 2: resultados del cruce ─────────
function resultados(e: Edicion): Nodo {
  const nombre = (id: string) => recortar(limpio(e.personas[id]?.nombre ?? '?'), 16);
  return fondo([
    cabecera(e, 'Resultados'),
    h('div', { fontFamily: 'Alfa', fontSize: 40, padding: '14px 40px 4px' }, `Así terminó el cruce ${e.cruce}`),
    h('div', { flexDirection: 'column', padding: '4px 40px', gap: 10 }, e.cruces.slice(0, 6).map((c) => h('div', { flexDirection: 'column', background: '#fffaf0', border: `3px solid ${C.tinta}`, borderRadius: 14, padding: '6px 18px', boxShadow: `0 5px 0 ${C.papel2}` }, [
      h('div', { alignItems: 'center', justifyContent: 'space-between' }, [
        h('div', { fontFamily: 'Alfa', fontSize: 28, color: c.ga > c.gb ? C.tinta : C.gris, width: 300 }, e.equipos[c.a] ?? '?'),
        h('div', { fontFamily: 'Alfa', fontSize: 38, color: C.naranja }, `${c.ga} - ${c.gb}`),
        h('div', { fontFamily: 'Alfa', fontSize: 28, color: c.gb > c.ga ? C.tinta : C.gris, width: 300, justifyContent: 'flex-end' }, e.equipos[c.b] ?? '?'),
      ]),
      h('div', { justifyContent: 'space-between', fontSize: 17, color: C.gris, marginTop: 2 }, [
        h('div', { flexDirection: 'column' }, c.duelos.slice(0, 3).map((d) => h('div', {}, `${nombre(d.a)} ${d.res} ${nombre(d.b)} · ${recortar(e.juegos[d.juego] ?? d.juego, 20)}`))),
        c.bono != null ? h('div', { alignSelf: 'center', background: C.verde, color: '#fff', fontWeight: 800, fontSize: 18, padding: '6px 12px', borderRadius: 999 }, `BONO ${e.equipos[c.bono] ?? ''}`.toUpperCase()) : h('div', {}, ''),
      ]),
    ]))),
    pie('Cada duelo al mejor de 3 · el bono es para quien gana 2 de 3'),
  ]);
}

// ───────── Página 3: estadísticas ─────────
function estadisticas(e: Edicion): Nodo {
  const max = Math.max(1, ...e.juegosMasJugados.map((b) => b.valor));
  const fichas = e.estadisticas.slice(0, 8);
  return fondo([
    cabecera(e, 'Estadísticas'),
    h('div', { fontFamily: 'Alfa', fontSize: 50, padding: '20px 40px 10px' }, 'Los números del cruce'),
    h('div', { flexWrap: 'wrap', padding: '0 30px', gap: 16, justifyContent: 'center' }, fichas.map((f, i) => h('div', { width: 238, height: 176, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: i % 3 === 0 ? C.noche : i % 3 === 1 ? C.morado : C.naranja, color: i % 3 === 2 ? C.tinta : C.papel, borderRadius: 18, padding: 12 }, [
      h('div', { fontFamily: 'Alfa', fontSize: 50, color: i % 3 === 2 ? C.tinta : C.amarillo }, recortar(f.valor, 10)),
      h('div', { fontWeight: 800, fontSize: 21, marginTop: 4, textAlign: 'center' }, f.etiqueta),
      h('div', { fontSize: 16, opacity: 0.85, textAlign: 'center', marginTop: 2 }, recortar(limpio(f.detalle), 34)),
    ]))),
    h('div', { fontFamily: 'Alfa', fontSize: 34, padding: '26px 40px 8px' }, 'Lo más jugado del cruce'),
    h('div', { flexDirection: 'column', padding: '0 40px', gap: 10 }, e.juegosMasJugados.map((b) => h('div', { alignItems: 'center' }, [
      h('div', { width: 270, fontWeight: 800, fontSize: 22 }, recortar(e.juegos[b.etiqueta] ?? b.etiqueta, 22)),
      h('div', { height: 30, width: Math.max(12, Math.round((b.valor / max) * 620)), background: C.naranja, borderRadius: 8, border: `3px solid ${C.tinta}` }, ''),
      h('div', { fontFamily: 'Alfa', fontSize: 24, marginLeft: 12 }, miles(b.valor)),
    ]))),
    // Récords del cruce y los mejores de la liga, en dos columnas
    h('div', { padding: '22px 40px 0', gap: 24 }, [
      h('div', { flex: 1, flexDirection: 'column', background: '#fffaf0', border: `3px solid ${C.tinta}`, borderRadius: 14, padding: '12px 18px' }, [
        h('div', { fontFamily: 'Alfa', fontSize: 26, color: C.rojo }, 'Récords del cruce'),
        ...e.records.slice(0, 4).map((x) => h('div', { fontSize: 19, marginTop: 4, justifyContent: 'space-between' }, [h('div', { fontWeight: 800 }, recortar(`${e.juegos[x.juego] ?? x.juego}${x.historico ? ' (histórico)' : ''}`, 30)), h('div', {}, `${recortar(limpio(e.personas[x.persona]?.nombre ?? '?'), 14)} · ${miles(x.puntaje)}`)])),
      ]),
      h('div', { flex: 1, flexDirection: 'column', background: C.noche, color: C.papel, borderRadius: 14, padding: '12px 18px' }, [
        h('div', { fontFamily: 'Alfa', fontSize: 26, color: C.amarillo }, 'Los mejores de la liga'),
        ...e.mejoresJugadores.slice(0, 4).map((x, i) => h('div', { fontSize: 19, marginTop: 4, justifyContent: 'space-between' }, [h('div', { fontWeight: 800 }, `${i + 1}. ${recortar(limpio(e.personas[x.persona]?.nombre ?? '?'), 18)}`), h('div', {}, `${x.ganados}/${x.jugados} · ${miles(x.puntos)} pts`)])),
      ]),
    ]),
    pie('Partidas individuales del cruce y duelos oficiales'),
  ]);
}

// ───────── Página 4: la tabla (termómetro) y lo que viene ─────────
function tabla(e: Edicion): Nodo {
  return fondo([
    cabecera(e, 'La tabla'),
    h('div', { fontFamily: 'Alfa', fontSize: 50, padding: '18px 40px 8px' }, 'El termómetro'),
    h('div', { flexDirection: 'column', padding: '0 40px' }, e.termometro.slice(0, 12).map((t) => h('div', { alignItems: 'center', padding: '7px 14px', background: t.final ? '#ffe9c7' : t.puesto % 2 ? '#fffaf0' : C.papel, borderLeft: `8px solid ${t.final ? C.naranja : C.papel2}` }, [
      h('div', { fontFamily: 'Alfa', fontSize: 28, width: 54 }, String(t.puesto)),
      h('div', { fontWeight: 800, fontSize: 28, flex: 1 }, e.equipos[t.equipo] ?? '?'),
      h('div', { fontWeight: 800, fontSize: 24, width: 110, color: t.delta > 0 ? C.verde : t.delta < 0 ? C.rojo : C.gris }, t.delta > 0 ? `SUBE ${t.delta}` : t.delta < 0 ? `BAJA ${-t.delta}` : 'IGUAL'),
      h('div', { fontFamily: 'Alfa', fontSize: 28, width: 120, justifyContent: 'flex-end' }, miles(t.puntos)),
    ]))),
    h('div', { fontSize: 19, color: C.gris, padding: '8px 40px 0' }, 'En naranjo, los 4 equipos que hoy irían a la final.'),
    e.agenda ? h('div', { flexDirection: 'column', margin: '18px 40px 0', background: C.noche, color: C.papel, borderRadius: 18, padding: '16px 22px' }, [
      h('div', { fontFamily: 'Alfa', fontSize: 30, color: C.amarillo }, `Se viene el cruce ${e.agenda.cruce}`),
      h('div', { flexWrap: 'wrap', gap: 10, marginTop: 8 }, e.agenda.parejas.map((p) => h('div', { fontWeight: 800, fontSize: 20, padding: '6px 12px', borderRadius: 10, background: p.derbi ? C.naranja : 'rgba(255,255,255,.12)', color: p.derbi ? C.tinta : C.papel }, `${e.equipos[p.a]} vs ${e.equipos[p.b]}${p.derbi ? ' · DERBI' : ''}`))),
    ]) : h('div', {}, ''),
    pie(`${recortar(limpio(e.columna.titulo), 40)}: en la web`),
  ]);
}

/** Las cuatro páginas de una edición. */
export function paginas(e: Edicion): Pagina[] {
  return [
    { nombre: 'portada', ancho: ANCHO, alto: ALTO, arbol: portada(e) },
    { nombre: 'resultados', ancho: ANCHO, alto: ALTO, arbol: resultados(e) },
    { nombre: 'estadisticas', ancho: ANCHO, alto: ALTO, arbol: estadisticas(e) },
    { nombre: 'tabla', ancho: ANCHO, alto: ALTO, arbol: tabla(e) },
  ];
}
/** Las tipografías (libres, de Google Fonts por fontsource): titulares Alfa Slab One y texto Nunito. */
export const FUENTES = [
  { name: 'Alfa', url: 'https://cdn.jsdelivr.net/fontsource/fonts/alfa-slab-one@latest/latin-400-normal.woff', weight: 400 },
  { name: 'Nunito', url: 'https://cdn.jsdelivr.net/fontsource/fonts/nunito@latest/latin-400-normal.woff', weight: 400 },
  { name: 'Nunito', url: 'https://cdn.jsdelivr.net/fontsource/fonts/nunito@latest/latin-800-normal.woff', weight: 800 },
] as const;
export type { Nota };
