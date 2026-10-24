import { generador } from '../../nucleo/azar';
import { barajar } from '../../juegos/tablero/mesa';
import { COLOR_LADO, entero, esLado, otro, type Lado, type Reglas } from '../tablero';

// Parejas en vivo: el memorice de siempre. Un tablero de diez parejas y dos medusas; por turnos se dan vuelta dos
// cartas; si son iguales, son tuyas y sigues; si no, se tapan y pasa el turno. La medusa resta una y pasa el turno.
const FIGURAS = ['fish_blue', 'fish_brown', 'fish_green', 'fish_grey', 'fish_grey_long_a', 'fish_orange', 'fish_pink', 'fish_red', 'fish_green_skeleton', 'seaweed_orange_b'];
const MEDUSA = 'medusa', LIMITE = 240, MIRA = 1.1;
export interface EstadoParejas { cartas: string[]; duenas: (Lado | 'x' | null)[]; abiertas: number[]; turno: Lado; puntos: Record<Lado, number>; tapa: number }

export const parejas: Reglas<EstadoParejas> = {
  id: 'parejas', nombre: 'Memoria de Pez', idea: 'Memorice por turnos: si aciertas, sigues. Cuidado con las medusas.',
  inicial(semilla) {
    const cartas = barajar([...FIGURAS, ...FIGURAS, MEDUSA, MEDUSA], generador(`${semilla}|parejas-vivo`));
    return { cartas, duenas: cartas.map(() => null), abiertas: [], turno: 'a', puntos: { a: 0, b: 0 }, tapa: 0 };
  },
  accion(e, a, lado, t) {
    const i = a.i;
    if (t < 0 || lado !== e.turno || e.tapa || !entero(i, 0, e.cartas.length) || e.duenas[i as number] || e.abiertas.includes(i as number)) return null;
    const k = i as number;
    if (e.cartas[k] === MEDUSA) return { ...e, duenas: e.duenas.map((d, j) => (j === k ? 'x' : d)), abiertas: [], turno: otro(lado), puntos: { ...e.puntos, [lado]: e.puntos[lado] - 1 } };
    const abiertas = [...e.abiertas, k];
    if (abiertas.length < 2) return { ...e, abiertas };
    const [x, y] = abiertas;
    if (e.cartas[x] === e.cartas[y]) return { ...e, abiertas: [], duenas: e.duenas.map((d, j) => (j === x || j === y ? lado : d)), puntos: { ...e.puntos, [lado]: e.puntos[lado] + 1 } };
    return { ...e, abiertas, tapa: t + MIRA }; // se ven un momento y después pasa el turno
  },
  tic(e, t) { return e.tapa && t >= e.tapa ? { ...e, abiertas: [], tapa: 0, turno: otro(e.turno) } : null; },
  marcador(e, t) { const pares = e.duenas.filter((d) => d === 'a' || d === 'b').length; return { a: e.puntos.a, b: e.puntos.b, fin: pares === FIGURAS.length * 2 || t >= LIMITE }; },
  valido(x): x is EstadoParejas {
    const e = x as EstadoParejas;
    return !!e && Array.isArray(e.cartas) && e.cartas.every((c) => typeof c === 'string') && Array.isArray(e.duenas) && e.duenas.length === e.cartas.length
      && Array.isArray(e.abiertas) && e.abiertas.every((i) => entero(i, 0, e.cartas.length)) && esLado(e.turno) && !!e.puntos && typeof e.tapa === 'number';
  },
  dibujar(m, enviar, yo) {
    const grilla = m.el('div', 'cartas', m.tablero);
    grilla.dataset.cartas = String(FIGURAS.length * 2 + 2);
    const botones = Array.from({ length: FIGURAS.length * 2 + 2 }, (_, i) => {
      const b = m.el('button', 'carta', grilla);
      b.setAttribute('aria-label', `Carta ${i + 1}`);
      m.el('span', 'cara', b);
      b.addEventListener('click', () => enviar({ i }));
      return b;
    });
    let antes = '';
    return (e, _t, nombres) => {
      const firma = JSON.stringify([e.duenas, e.abiertas]);
      if (firma !== antes) {
        antes = firma;
        botones.forEach((b, i) => {
          const visible = !!e.duenas[i] || e.abiertas.includes(i), cara = b.querySelector('.cara') as HTMLElement;
          b.classList.toggle('abierta', visible);
          b.classList.toggle('lista', !!e.duenas[i]);
          b.style.outline = e.duenas[i] === 'a' || e.duenas[i] === 'b' ? `3px solid ${COLOR_LADO[e.duenas[i] as Lado]}` : '';
          if (visible && !cara.childElementCount && !cara.textContent) {
            if (e.cartas[i] === MEDUSA) cara.textContent = '🪼';
            else { const img = m.el('img', '', cara); img.src = `${import.meta.env.BASE_URL}figuras/${e.cartas[i]}.png`; img.alt = ''; }
          }
          if (!visible) cara.replaceChildren();
        });
      }
      const mio = yo === e.turno;
      grilla.classList.toggle('bloqueada', !mio);
      m.hud.tiempo(`Turno de ${nombres[e.turno]}`);
      m.hud.extra(mio ? '¡Tu turno!' : '');
      m.hud.puntos(`${nombres.a} ${e.puntos.a} · ${e.puntos.b} ${nombres.b}`);
    };
  },
};
