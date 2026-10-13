import { azar } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMesa, mmss } from './mesa';
import { PALABRAS } from './palabras';

// Palabra del Día: adivinar una palabra de cinco letras en seis intentos. Se acepta cualquier combinación de letras
// (no hay diccionario que rechace palabras), así que conviene escribir palabras de verdad para descartar bien.
const LETRAS = 5, INTENTOS = 6, FILAS = ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'];
type Pista = 'verde' | 'amarilla' | 'gris';
const VALOR: Record<Pista, number> = { gris: 0, amarilla: 1, verde: 2 };

function pistas(intento: string[], secreta: string[]): Pista[] {
  const resultado: Pista[] = intento.map((l, i) => (l === secreta[i] ? 'verde' : 'gris'));
  const sobran = secreta.filter((_, i) => resultado[i] !== 'verde');
  intento.forEach((l, i) => {
    const k = resultado[i] === 'verde' ? -1 : sobran.indexOf(l);
    if (k >= 0) { resultado[i] = 'amarilla'; sobran.splice(k, 1); }
  });
  return resultado;
}

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'palabra', c.aspecto);
  const secreta = [...PALABRAS[Math.floor(azar(c.semilla, 'palabra') * PALABRAS.length)]];
  const grilla = m.el('div', 'letras', m.tablero);
  const celdas = Array.from({ length: INTENTOS }, () => Array.from({ length: LETRAS }, () => m.el('div', 'letra', grilla)));
  const teclado = m.el('div', 'teclado', m.tablero), teclas = new Map<string, HTMLButtonElement>(), mejor = new Map<string, Pista>();
  let fila = 0, actual: string[] = [], terminado = false;

  FILAS.forEach((letras, n) => {
    const linea = m.el('div', 'linea', teclado);
    if (n === 2) m.el('button', 'tecla ancha', linea, 'Enter').addEventListener('click', () => pulsar('Enter'));
    for (const l of letras) { const b = m.el('button', 'tecla', linea, l); b.addEventListener('click', () => pulsar(l)); teclas.set(l, b); }
    if (n === 2) { const b = m.el('button', 'tecla ancha', linea, '⌫'); b.setAttribute('aria-label', 'Borrar'); b.addEventListener('click', () => pulsar('Backspace')); }
  });

  const terminar = (acerto: boolean) => {
    terminado = true;
    const t = m.reloj();
    m.detener();
    if (acerto) m.sonido.fanfarria(); else m.sonido.mal();
    c.alTerminar({
      puntaje: acerto ? (INTENTOS + 1 - fila) * 150 + Math.max(0, 100 - Math.floor(t / 3)) : 0,
      lineas: [['Resultado', acerto ? `Adivinada en ${fila} ${fila === 1 ? 'intento' : 'intentos'}` : 'No adivinada'], ['La palabra era', secreta.join('')], ['Tiempo', mmss(t)]],
      detalle: { acerto, intentos: fila, seg: Math.round(t) },
    });
  };

  function pulsar(tecla: string) {
    if (terminado || m.reloj() <= 0) return;
    if (tecla === 'Backspace') { actual.pop(); }
    else if (tecla === 'Enter') {
      if (actual.length < LETRAS) return m.hud.aviso('Faltan letras', 'mal', 0.8);
      const p = pistas(actual, secreta);
      actual.forEach((l, i) => {
        celdas[fila][i].classList.add(p[i]);
        if (VALOR[p[i]] >= VALOR[mejor.get(l) ?? 'gris']) { mejor.set(l, p[i]); const b = teclas.get(l); if (b) b.className = `tecla ${p[i]}`; }
      });
      fila++;
      const acerto = p.every((x) => x === 'verde');
      actual = [];
      if (acerto || fila === INTENTOS) return terminar(acerto);
      m.sonido.toque();
    } else if (actual.length < LETRAS) actual.push(tecla);
    for (let i = 0; i < LETRAS; i++) if (fila < INTENTOS) celdas[fila][i].textContent = actual[i] ?? '';
  }

  m.escuchar('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tecla = e.key === 'Enter' || e.key === 'Backspace' ? e.key : e.key.toUpperCase();
    if (tecla === 'Enter' || tecla === 'Backspace' || (tecla.length === 1 && /[A-ZÑ]/.test(tecla))) { e.preventDefault(); pulsar(tecla); }
  });

  m.hud.puntos(`${INTENTOS} intentos`);
  m.alTic((t) => { m.hud.tiempo(mmss(t)); m.hud.puntos(`${INTENTOS - fila} ${INTENTOS - fila === 1 ? 'intento' : 'intentos'}`); });
  return { empezar: m.empezar, destruir: m.destruir };
}
