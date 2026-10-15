import { azar } from '../../nucleo/azar';
import { COLOR_LADO, entero, esLado, otro, type Lado, type Reglas } from '../tablero';

// Tinta Tramposa en vivo: veinte rondas con la misma palabra para los dos. Gana la ronda quien responde bien
// primero; quien se equivoca queda fuera de esa ronda. Cada tanto la regla se da vuelta y vale lo que DICE.
const COLORES: [string, string][] = [['Rojo', '#e5484d'], ['Azul', '#3b82f6'], ['Verde', '#30a46c'], ['Amarillo', '#d9a400'], ['Morado', '#9b59d0'], ['Naranjo', '#f76b15']];
const RONDAS = 20, PAUSA = 0.9;
export interface EstadoTinta { semilla: string; k: number; fuera: Lado[]; ganadas: (Lado | null)[]; pausa: number }
export function rondaTinta(semilla: string, k: number) {
  const n = k >= 8 ? 6 : 4, color = Math.floor(azar(semilla, 'tinta', k, 'c') * n), engana = azar(semilla, 'tinta', k, 'e') < 0.75;
  const texto = engana ? (color + 1 + Math.floor(azar(semilla, 'tinta', k, 't') * (n - 1))) % n : color;
  return { color, texto, n, alReves: k >= 6 && azar(semilla, 'tinta', k, 'r') < 0.25 };
}
const correcta = (semilla: string, k: number) => { const r = rondaTinta(semilla, k); return r.alReves ? r.texto : r.color; };

export const tinta: Reglas<EstadoTinta> = {
  id: 'tinta', nombre: 'Tinta Tramposa', idea: 'La misma palabra para los dos: el punto es de quien responde bien primero.',
  inicial(semilla) { return { semilla, k: 0, fuera: [], ganadas: [], pausa: 0 }; },
  accion(e, a, lado, t) {
    if (t < 0 || e.pausa || e.k >= RONDAS || e.fuera.includes(lado) || !entero(a.i, 0, COLORES.length)) return null;
    if (a.i !== correcta(e.semilla, e.k)) { const fuera = [...e.fuera, lado]; return { ...e, fuera, pausa: fuera.length === 2 ? t + PAUSA : 0, ganadas: fuera.length === 2 ? [...e.ganadas, null] : e.ganadas }; }
    return { ...e, ganadas: [...e.ganadas, lado], pausa: t + PAUSA };
  },
  tic(e, t) { return e.pausa && t >= e.pausa ? { ...e, k: e.k + 1, fuera: [], pausa: 0 } : null; },
  marcador(e) { return { a: e.ganadas.filter((g) => g === 'a').length, b: e.ganadas.filter((g) => g === 'b').length, fin: e.k >= RONDAS }; },
  valido(x): x is EstadoTinta { const e = x as EstadoTinta; return !!e && typeof e.semilla === 'string' && entero(e.k, 0, RONDAS + 1) && Array.isArray(e.fuera) && e.fuera.every(esLado) && Array.isArray(e.ganadas) && e.ganadas.every((g) => g === null || esLado(g)) && typeof e.pausa === 'number'; },
  dibujar(m, enviar, yo) {
    const ayuda = m.el('p', 'tinta-ayuda', m.tablero), palabra = m.el('div', 'tinta-palabra', m.tablero), barra = m.el('div', 'tinta-botones', m.tablero);
    const botones = COLORES.map(([nombre], i) => { const b = m.el('button', 'boton grande', barra, `${i + 1} · ${nombre}`); b.addEventListener('click', () => enviar({ i })); return b; });
    m.escuchar('keydown', (ev) => { const i = Number(ev.key) - 1; if (i >= 0 && i < COLORES.length && !botones[i].hidden && !ev.repeat) enviar({ i }); });
    return (e, t, nombres) => {
      const r = rondaTinta(e.semilla, Math.min(e.k, RONDAS - 1)), ultima = e.ganadas[e.ganadas.length - 1];
      ayuda.textContent = r.alReves ? '¿Qué color DICE la palabra?' : '¿De qué color está pintada la palabra?';
      ayuda.classList.toggle('reves', r.alReves);
      palabra.textContent = t < 0 ? '…' : COLORES[r.texto][0];
      palabra.style.color = COLORES[r.color][1];
      palabra.style.textShadow = e.pausa && ultima ? `0 0 18px ${COLOR_LADO[ultima]}` : '';
      botones.forEach((b, i) => { b.hidden = i >= r.n; b.disabled = !yo || !!e.pausa || e.fuera.includes(yo); });
      const sc = tinta.marcador(e, t);
      m.hud.tiempo(`Ronda ${Math.min(e.k + 1, RONDAS)} de ${RONDAS}`);
      m.hud.extra(e.pausa ? (ultima ? `¡Punto para ${nombres[ultima]}!` : 'Nadie acertó') : yo && e.fuera.includes(yo) ? 'Fallaste: espera la próxima' : yo && e.fuera.includes(otro(yo)) ? 'Tu rival falló: ¡tranquilo!' : '');
      m.hud.puntos(`${nombres.a} ${sc.a} · ${sc.b} ${nombres.b}`);
    };
  },
};
