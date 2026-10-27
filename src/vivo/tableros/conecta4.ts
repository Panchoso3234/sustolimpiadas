import { generador } from '../../nucleo/azar';
import type { Mesa } from '../../juegos/tablero/mesa';
import { COLUMNAS, FILAS, SACAR, esSacar, ganadasPerdidas, jugarConchas, legales, nombreJugada, type EstadoConchas } from '../reglas';
import { entero, type Lado, type Reglas } from '../tablero';

// CONECTA4 en vivo: el Cuatro en Línea de siempre, por turnos y con reloj por jugada (si se acaba, la concha cae sola
// en la columna libre más central). La mitad de las partidas son Pop Out: puedes sacar una concha tuya del fondo.
export const TURNO = 15;
export interface EstadoConecta4 { popout: boolean; jugadas: number[]; plazo: number }

/** El tablero de conchas con sus botones, para el vivo y el desafío. `jugar` recibe la jugada (columna, o SACAR + columna). */
export function tableroConecta4(m: Mesa, jugar: (j: number) => void) {
  const cabeza = m.el('div', 'sigla', m.tablero), turno = m.el('p', 'vivo-turno', m.tablero), caja = m.el('div', 'tablero-conchas', m.tablero);
  caja.setAttribute('aria-label', 'Tablero de CONECTA4');
  const columnas = Array.from({ length: COLUMNAS }, (_, col) => {
    const b = m.el('button', 'conchas-col', caja);
    b.setAttribute('aria-label', `Poner en la columna ${col + 1}`);
    b.addEventListener('click', () => jugar(col));
    return { b, conchas: Array.from({ length: FILAS }, () => m.el('span', 'concha', b)).reverse() }; // [fila 0 = abajo]
  });
  const fila = m.el('div', 'conchas-sacar', m.tablero);
  const sacar = Array.from({ length: COLUMNAS }, (_, col) => {
    const b = m.el('button', 'boton chico', fila, '⬇ Sacar');
    b.setAttribute('aria-label', `Sacar tu concha del fondo de la columna ${col + 1}`);
    b.addEventListener('click', () => jugar(SACAR + col));
    return b;
  });
  const nota = m.el('p', 'chico tenue', m.tablero);
  let vistas = 0;
  /** `yo`: mi ficha (1 o 2), o null si miro. */
  return (e: EstadoConchas, o: { popout: boolean; jugadas: number[]; yo: 1 | 2 | null; puedo: boolean; titulo: string; texto: string; rival?: string }) => {
    cabeza.textContent = o.titulo;
    turno.textContent = o.texto;
    turno.classList.toggle('mio', o.puedo);
    const posibles = o.puedo ? legales(e.tablero, e.turno, o.popout) : [], ultima = o.jugadas[o.jugadas.length - 1];
    // Pop Out: si la última jugada fue sacar, esa columna se marca y baja con una animación (si no, parece que las conchas cambian solas)
    const sacada = ultima !== undefined && esSacar(ultima) ? ultima - SACAR : -1, nueva = o.jugadas.length !== vistas;
    vistas = o.jugadas.length;
    columnas.forEach(({ b, conchas }, col) => {
      b.disabled = !posibles.includes(col);
      b.classList.toggle('sacada', col === sacada);
      if (nueva && col === sacada) { b.classList.remove('baja'); void b.offsetWidth; b.classList.add('baja'); }
      conchas.forEach((s, f) => {
        const v = e.tablero[f][col], gana = e.ganador > 0 && e.linea.some(([lf, lc]) => lf === f && lc === col);
        s.className = `concha${v ? ` j${v}` : ''}${gana ? ' gana' : ''}${ultima === col && v && (f === FILAS - 1 || !e.tablero[f + 1][col]) ? ' ultima' : ''}`;
      });
    });
    fila.hidden = !o.popout;
    sacar.forEach((b, col) => { b.disabled = !posibles.includes(SACAR + col); });
    const terminada = !!e.ganador || e.empate;
    // Al final: las jugadas ganadoras que se pasaron
    const perdidas = terminada ? ganadasPerdidas(o.jugadas, o.popout) : [];
    const quien = (o.jugadas.length % 2 === 1 ? 1 : 2) === o.yo ? 'Sacaste' : `${o.rival ?? 'Tu rival'} sacó`;
    nota.textContent = !terminada && sacada >= 0 ? `⬇ ${quien} una concha propia del fondo de la columna ${sacada + 1}: las de arriba bajaron un lugar.`
      : terminada && perdidas.length
      ? perdidas.map((x) => `En la jugada ${x.n}, ${x.quien === o.yo ? 'tú' : o.yo ? 'tu rival' : x.quien === 1 ? 'el primero' : 'el segundo'} pudo ganar (${nombreJugada(x.jugada)}).`).join(' ')
      : o.popout ? 'Pop Out: en tu turno puedes poner una concha o sacar una tuya de la fila de abajo. Si al sacar quedan cuatro en línea de los dos, gana quien sacó.' : '';
  };
}

const ficha = (l: Lado): 1 | 2 => (l === 'a' ? 1 : 2);
const ladoDe = (f: 1 | 2): Lado => (f === 1 ? 'a' : 'b');
/** La jugada que hace el reloj cuando se acaba el turno: la columna libre más central. */
const automatica = (e: EstadoConecta4, c: EstadoConchas) => legales(c.tablero, c.turno, false)[0] ?? legales(c.tablero, c.turno, e.popout)[0];

export const conecta4: Reglas<EstadoConecta4> = {
  id: 'conchas', nombre: 'CONECTA4', idea: 'Por turnos, deja caer conchas: gana quien alinea cuatro. Con reloj por jugada y, a veces, en modo Pop Out.',
  inicial(semilla) { return { popout: generador(`${semilla}|conecta4`)() < 0.5, jugadas: [], plazo: TURNO }; },
  accion(e, a, lado, t) {
    const c = jugarConchas(e.jugadas, e.popout);
    if (t < 0 || c.ganador || c.empate || ladoDe(c.turno) !== lado || !entero(a.j, 0, SACAR * 2) || !legales(c.tablero, c.turno, e.popout).includes(a.j as number)) return null;
    return { ...e, jugadas: [...e.jugadas, a.j as number], plazo: t + TURNO };
  },
  tic(e, t) {
    if (t < e.plazo) return null;
    const c = jugarConchas(e.jugadas, e.popout);
    if (c.ganador || c.empate) return null;
    const j = automatica(e, c);
    return j === undefined ? null : { ...e, jugadas: [...e.jugadas, j], plazo: t + TURNO };
  },
  marcador(e) {
    const c = jugarConchas(e.jugadas, e.popout), fin = !!c.ganador || c.empate;
    return { a: c.ganador === 1 ? 2 : c.empate ? 1 : 0, b: c.ganador === 2 ? 2 : c.empate ? 1 : 0, fin };
  },
  valido(x): x is EstadoConecta4 { const e = x as EstadoConecta4; return !!e && typeof e.popout === 'boolean' && Array.isArray(e.jugadas) && e.jugadas.every((j) => entero(j, 0, SACAR * 2)) && typeof e.plazo === 'number'; },
  dibujar(m, enviar, yo) {
    const pintar = tableroConecta4(m, (j) => enviar({ j }));
    return (e, t, nombres) => {
      const c = jugarConchas(e.jugadas, e.popout), terminada = !!c.ganador || c.empate, deTurno = ladoDe(c.turno);
      const puedo = !!yo && !terminada && t >= 0 && deTurno === yo, quedan = Math.max(0, Math.ceil(e.plazo - t));
      const nombre = (l: Lado) => (l === yo ? 'Tú' : nombres[l]);
      const texto = terminada ? (c.empate ? 'Empate: el tablero se llenó.' : `${nombre(ladoDe(c.ganador as 1 | 2))} ${ladoDe(c.ganador as 1 | 2) === yo ? 'ganaste' : 'ganó'} con cuatro en línea.`)
        : t < 0 ? 'Prepárate…' : `${puedo ? 'Tu turno' : `Turno de ${nombres[deTurno]}`} (${c.turno === 1 ? 'naranja' : 'blanca'}) · ${quedan} s`;
      pintar(c, { popout: e.popout, jugadas: e.jugadas, yo: yo ? ficha(yo) : null, puedo, rival: nombres[yo ? (yo === 'a' ? 'b' : 'a') : e.jugadas.length % 2 === 1 ? 'a' : 'b'], titulo: `${e.popout ? 'Pop Out' : 'Clásico'} · ${nombres.a} (naranja) contra ${nombres.b} (blanca)`, texto });
    };
  },
};
