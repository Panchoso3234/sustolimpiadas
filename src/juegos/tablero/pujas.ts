import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMesa } from './mesa';

// Juego de decisión contra rivales de máquina. Lo que eligen los rivales sale de la semilla, pero dos de ellos se
// adaptan a ti: Marea va por el número que más usas y Faro copia el último que elegiste. Repetir una costumbre cuesta.

const RIVALES = ['Coco', 'Brisa', 'Tiki', 'Marea', 'Faro'];

/** El Más Bajo: todos eligen un número del 1 al 10 en secreto. Gana la ronda el más bajo que nadie más eligió. */
export async function bajo(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'neon', c.aspecto), r = generador(c.semilla), RONDAS = 10;
  // Cada rival tiene su manía: unos van siempre a lo bajo, otros se cuidan
  const manias = RIVALES.map(() => 0.5 + r() * 1.3);
  const jugadas = Array.from({ length: RONDAS }, () => manias.map((k) => {
    const pesos = Array.from({ length: 10 }, (_, n) => 1 / (n + 1) ** k), total = pesos.reduce((a, b) => a + b, 0);
    let dado = r() * total, n = 0;
    while (n < 9 && (dado -= pesos[n]) > 0) n++;
    return n + 1;
  }));
  const dados = Array.from({ length: RONDAS }, () => [r(), r()]);
  const titulo = m.el('div', 'sigla', m.tablero);
  m.el('p', 'chico tenue', m.tablero, 'Ojo: Marea estudia el número que más usas y Faro copia el último que elegiste.');
  const botones = m.el('div', 'bajo-numeros', m.tablero), mesa = m.el('div', 'bajo-mesa', m.tablero), nota = m.el('p', 'chico', m.tablero);
  let ronda = 0, puntos = 0, ganadas = 0, unicas = 0, espera = false, terminado = false;
  const elecciones: number[] = [];

  const pintar = () => { titulo.textContent = `Ronda ${Math.min(ronda + 1, RONDAS)} de ${RONDAS}`; m.hud.tiempo(`Ronda ${Math.min(ronda + 1, RONDAS)}/${RONDAS}`); m.hud.puntos(`${puntos} pts`); };
  const elegir = (mio: number) => {
    if (terminado || espera || m.reloj() <= 0) return;
    espera = true;
    // Los rivales que se adaptan miran lo que elegiste en las rondas anteriores
    const rivales = [...jugadas[ronda]], antes = [...elecciones];
    if (antes.length) {
      const veces = new Map<number, number>();
      for (const n of antes) veces.set(n, (veces.get(n) ?? 0) + 1);
      const moda = [...veces].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      if (dados[ronda][0] < 0.55 + 0.05 * c.nivel) rivales[3] = moda;
      if (dados[ronda][1] < 0.5) rivales[4] = antes[antes.length - 1];
    }
    elecciones.push(mio);
    const todas = [mio, ...rivales], unicos = todas.filter((n) => todas.indexOf(n) === todas.lastIndexOf(n)), menor = unicos.length ? Math.min(...unicos) : 0;
    mesa.replaceChildren();
    todas.forEach((n, i) => {
      const ficha = m.el('div', `bajo-ficha${n === menor ? ' gana' : unicos.includes(n) ? '' : ' repetida'}`, mesa);
      m.el('b', '', ficha, String(n));
      m.el('span', '', ficha, i === 0 ? 'Tú' : RIVALES[i - 1]);
    });
    if (mio === menor) { puntos += 100; ganadas++; m.sonido.bien(); nota.textContent = `Ganaste la ronda con el ${mio}: +100.`; }
    else if (unicos.includes(mio)) { puntos += 20; unicas++; m.sonido.toque(); nota.textContent = `Nadie repitió tu ${mio}, pero el ${menor} era más bajo: +20.`; }
    else { m.sonido.mal(); nota.textContent = menor ? `Alguien más eligió el ${mio}. Ganó el ${menor}.` : 'Todos se repitieron: nadie gana la ronda.'; }
    ronda++;
    pintar();
    m.despues(2.4, () => {
      espera = false;
      if (ronda < RONDAS) return;
      terminado = true;
      m.detener();
      c.alTerminar({ puntaje: puntos, lineas: [['Rondas ganadas', `${ganadas} de ${RONDAS}`], ['Únicas sin ganar', String(unicas)], ['Repetidas', String(RONDAS - ganadas - unicas)]], detalle: { elecciones, ganadas } });
    });
  };
  for (let n = 1; n <= 10; n++) m.el('button', 'boton grande', botones, String(n)).addEventListener('click', () => elegir(n));
  nota.textContent = 'Elige un número. Gana el más bajo que nadie más haya elegido.';
  pintar();
  return { empezar: m.empezar, destruir: m.destruir };
}
