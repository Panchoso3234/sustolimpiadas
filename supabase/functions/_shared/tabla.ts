// La tabla de posiciones como imagen para Discord (15-11). Árbol de elementos al estilo React que Satori convierte en
// SVG y resvg en PNG (igual que La Cuarta). Lo usa la Edge Function `tabla`; es puro para poder probarlo con node.
// Sin emojis: la tipografía no los dibuja (los nombres se limpian).

export interface FilaTabla { pos: number; nombre: string; puntos: number; antes?: number | null; cartas?: number | null }
export interface PedidoTabla { titulo: string; subtitulo?: string; filas: FilaTabla[]; corte?: number }
interface Nodo { type: string; props: Record<string, unknown> }
type Estilo = Record<string, string | number>;

const C = { fondo: '#141a2e', fila: '#1d2540', fila2: '#222b4a', oro: '#ffc83d', texto: '#f4f1ea', tenue: '#9aa6c4', verde: '#3fd17a', rojo: '#ff5a6e', morado: '#b46cff' };
export const ANCHO = 1080;
const h = (type: string, style: Estilo, hijos?: unknown): Nodo => ({ type, props: { style: { display: 'flex', ...style }, children: hijos } });
export const limpio = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+/g, ' ').trim() || 'Equipo';
const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Puntos a la chilena: 1.234,5 */
export const pts = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-CL', { maximumFractionDigits: 1 });

const ALTO_FILA = 78, CABEZA = 190, PIE = 86;
export const altoTabla = (n: number) => CABEZA + n * (ALTO_FILA + 8) + 40 + PIE;

/** Imagen de la tabla: puesto, nombre, cambio de puesto, puntos de Wild Cards y puntos; línea dorada en el corte. */
export function arbolTabla(p: PedidoTabla): Nodo {
  const corte = p.corte ?? 6;
  const fila = (f: FilaTabla, i: number): Nodo => {
    const dentro = f.pos <= corte, sube = f.antes != null ? f.antes - f.pos : 0;
    const cambio = f.antes == null || sube === 0
      ? h('div', { width: 92, justifyContent: 'center', color: C.tenue, fontSize: 26 }, '=')
      : h('div', { width: 92, justifyContent: 'center', alignItems: 'center', fontSize: 26, fontWeight: 800, color: sube > 0 ? C.verde : C.rojo, background: sube > 0 ? 'rgba(63,209,122,.14)' : 'rgba(255,90,110,.14)', borderRadius: 14, height: 44 }, `${sube > 0 ? '+' : '-'}${Math.abs(sube)}`);
    return h('div', { alignItems: 'center', height: ALTO_FILA, marginBottom: 8, padding: '0 28px', borderRadius: 18, background: i % 2 ? C.fila2 : C.fila, borderLeft: `10px solid ${dentro ? C.oro : 'transparent'}` }, [
      h('div', { width: 64, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', fontFamily: 'Alfa', fontSize: 32, color: dentro ? C.fondo : C.texto, background: dentro ? C.oro : 'rgba(255,255,255,.08)' }, String(f.pos)),
      h('div', { flex: 1, marginLeft: 26, fontSize: limpio(f.nombre).length > 22 ? 28 : 36, fontWeight: 800, color: C.texto, whiteSpace: 'nowrap', overflow: 'hidden' }, recortar(limpio(f.nombre), 30)),
      cambio,
      h('div', { width: 150, justifyContent: 'flex-end', fontSize: 24, fontWeight: 800, color: C.morado }, f.cartas ? `WC ${f.cartas > 0 ? '+' : ''}${pts(f.cartas)}` : ''),
      h('div', { width: 190, justifyContent: 'flex-end', fontFamily: 'Alfa', fontSize: 40, color: dentro ? C.oro : C.texto }, pts(f.puntos)),
    ]);
  };
  const filas: Nodo[] = [];
  p.filas.forEach((f, i) => {
    filas.push(fila(f, i));
    if (f.pos === corte && i < p.filas.length - 1) filas.push(h('div', { alignItems: 'center', margin: '6px 0 14px' }, [
      h('div', { flex: 1, height: 4, background: C.oro }),
      h('div', { margin: '0 18px', fontSize: 22, fontWeight: 800, color: C.oro, letterSpacing: 3 }, 'CORTE DE LA FINAL'),
      h('div', { flex: 1, height: 4, background: C.oro }),
    ]));
  });
  return h('div', { flexDirection: 'column', width: ANCHO, height: altoTabla(p.filas.length), background: C.fondo, padding: '44px 48px 0', fontFamily: 'Nunito' }, [
    h('div', { fontSize: 24, fontWeight: 800, color: C.oro, letterSpacing: 4 }, 'LAS SUSTOLIMPIADAS · TABLA DE EQUIPOS'),
    h('div', { fontFamily: 'Alfa', fontSize: 54, color: C.texto, marginTop: 10 }, recortar(p.titulo, 34)),
    h('div', { fontSize: 24, color: C.tenue, marginTop: 6, marginBottom: 24 }, p.subtitulo ?? ''),
    h('div', { flexDirection: 'column' }, filas),
    h('div', { marginTop: 'auto', height: PIE, alignItems: 'center', justifyContent: 'space-between', fontSize: 22, color: C.tenue }, [
      h('div', {}, `A la final pasan los ${corte} mejores equipos`),
      h('div', { color: C.verde }, '+N sube · -N baja'),
      h('div', { color: C.morado }, 'WC = Wild Cards del cruce'),
    ]),
  ]);
}
