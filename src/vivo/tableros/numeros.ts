import { generador } from '../../nucleo/azar';
import { barajar } from '../../juegos/tablero/mesa';
import { COLOR_LADO, entero, esLado, type Lado, type Reglas } from '../tablero';

// Cazanúmeros en vivo: un solo tablero para los dos. El número que sigue es de quien lo toca primero;
// tocar uno adelantado resta. Cada cinco números, las fichas que quedan cambian de lugar.
const TOTAL = 25, LIMITE = 75, CADA = 5;
export interface EstadoNumeros { semilla: string; orden: number[]; sigue: number; duenos: (Lado | null)[]; errores: Record<Lado, number>; mezclas: number }
const lugares = (semilla: string, mezclas: number) => barajar(Array.from({ length: TOTAL }, (_, i) => i + 1), generador(`${semilla}|numeros-vivo|${mezclas}`));

export const numeros: Reglas<EstadoNumeros> = {
  id: 'numeros', nombre: 'Cazanúmeros', idea: 'Un tablero para los dos: el número que sigue es de quien lo toca primero.',
  inicial(semilla) { return { semilla, orden: lugares(semilla, 0), sigue: 1, duenos: Array(TOTAL).fill(null), errores: { a: 0, b: 0 }, mezclas: 0 }; },
  accion(e, a, lado, t) {
    if (t < 0 || !entero(a.n, 1, TOTAL + 1) || e.sigue > TOTAL) return null;
    const n = a.n as number;
    if (n < e.sigue) return null; // ya lo tomó alguien (los dos lo tocaron casi a la vez): sin castigo
    if (n > e.sigue) return { ...e, errores: { ...e.errores, [lado]: e.errores[lado] + 1 } };
    const sigue = e.sigue + 1, mezcla = (sigue - 1) % CADA === 0 && sigue <= TOTAL;
    return { ...e, sigue, duenos: e.duenos.map((d, i) => (i === n - 1 ? lado : d)), mezclas: e.mezclas + (mezcla ? 1 : 0), orden: mezcla ? lugares(e.semilla, e.mezclas + 1) : e.orden };
  },
  marcador(e, t) {
    const de = (l: Lado) => e.duenos.filter((d) => d === l).length * 10 - e.errores[l] * 3;
    return { a: de('a'), b: de('b'), fin: e.sigue > TOTAL || t >= LIMITE };
  },
  valido(x): x is EstadoNumeros {
    const e = x as EstadoNumeros;
    return !!e && typeof e.semilla === 'string' && Array.isArray(e.orden) && e.orden.length === TOTAL && entero(e.sigue, 1, TOTAL + 2) && Array.isArray(e.duenos) && e.duenos.length === TOTAL && e.duenos.every((d) => d === null || esLado(d)) && !!e.errores && Number.isInteger(e.mezclas);
  },
  dibujar(m, enviar) {
    const grilla = m.el('div', 'numeros', m.tablero);
    const botones = Array.from({ length: TOTAL }, () => { const b = m.el('button', 'numero', grilla); b.addEventListener('click', () => enviar({ n: Number(b.textContent) })); return b; });
    let antes = '';
    return (e, t, nombres) => {
      const firma = `${e.mezclas}|${e.sigue}`;
      if (firma !== antes) {
        antes = firma;
        e.orden.forEach((n, i) => {
          const b = botones[i], dueno = e.duenos[n - 1];
          b.textContent = String(n);
          b.disabled = !!dueno;
          b.style.background = dueno ? COLOR_LADO[dueno] : '';
          b.style.opacity = dueno ? '0.55' : '';
        });
      }
      const sc = numeros.marcador(e, t);
      m.hud.tiempo(`${Math.max(0, Math.ceil(LIMITE - Math.max(0, t)))} s`);
      m.hud.extra(`Busca el ${Math.min(e.sigue, TOTAL)}`);
      m.hud.puntos(`${nombres.a} ${sc.a} · ${sc.b} ${nombres.b}`);
    };
  },
};
