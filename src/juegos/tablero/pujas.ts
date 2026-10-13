import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMesa } from './mesa';

// Dos juegos de decisión contra rivales de máquina. Lo que eligen los rivales en cada ronda sale de la semilla,
// así que todos los jugadores enfrentan exactamente a los mismos rivales con las mismas jugadas.

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
  const titulo = m.el('div', 'sigla', m.tablero), botones = m.el('div', 'bajo-numeros', m.tablero), mesa = m.el('div', 'bajo-mesa', m.tablero), nota = m.el('p', 'chico', m.tablero);
  let ronda = 0, puntos = 0, ganadas = 0, unicas = 0, espera = false, terminado = false;
  const elecciones: number[] = [];

  const pintar = () => { titulo.textContent = `Ronda ${Math.min(ronda + 1, RONDAS)} de ${RONDAS}`; m.hud.tiempo(`Ronda ${Math.min(ronda + 1, RONDAS)}/${RONDAS}`); m.hud.puntos(`${puntos} pts`); };
  const elegir = (mio: number) => {
    if (terminado || espera || m.reloj() <= 0) return;
    espera = true;
    elecciones.push(mio);
    const todas = [mio, ...jugadas[ronda]], unicos = todas.filter((n) => todas.indexOf(n) === todas.lastIndexOf(n)), menor = unicos.length ? Math.min(...unicos) : 0;
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

/** Subasta a Ciegas: ocho cofres de valor oculto. Solo ves una estimación. Quien gana la puja suele ser quien más se equivocó. */
export async function subasta(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'mercado', c.aspecto), r = generador(c.semilla), COFRES = 8, POSTORES = 3, BOLSA = 400;
  const lotes = Array.from({ length: COFRES }, () => {
    const valor = 30 + Math.floor(r() * 121), pista = Math.round((valor * (0.72 + r() * 0.56)) / 5) * 5;
    // Cada rival hace su propia estimación y ofrece una parte de ella
    const ofertas = Array.from({ length: POSTORES }, () => Math.round((valor * (0.7 + r() * 0.6) * (0.55 + r() * 0.38)) / 5) * 5);
    return { valor, pista, ofertas };
  });
  const titulo = m.el('div', 'sigla', m.tablero), pista = m.el('div', 'calc-cuenta', m.tablero), ayuda = m.el('p', 'chico', m.tablero);
  const fila = m.el('div', 'fila centro', m.tablero), menos = m.el('button', 'boton grande', fila, '−5'), visor = m.el('div', 'calc-visor', fila), mas = m.el('button', 'boton grande', fila, '+5');
  const fila2 = m.el('div', 'fila centro', m.tablero), mucho = m.el('button', 'boton', fila2, '+25'), pujar = m.el('button', 'boton principal grande', fila2, 'Pujar'), pasar = m.el('button', 'boton', fila2, 'No pujar');
  const nota = m.el('p', 'cofre-riesgo', m.tablero), historial = m.el('div', 'cofre-historial', m.tablero);
  let actual = 0, oferta = 0, bolsa = BOLSA, ganancia = 0, ganados = 0, sobrepagos = 0, espera = false, terminado = false;
  const pujas: number[] = [];

  const pintar = () => {
    const lote = lotes[Math.min(actual, COFRES - 1)];
    titulo.textContent = `Cofre ${Math.min(actual + 1, COFRES)} de ${COFRES}`;
    pista.textContent = `≈ ${lote.pista}`;
    ayuda.textContent = 'Valor estimado en monedas (puede errar hasta un 28 %). Los otros tres postores tienen su propia estimación.';
    visor.textContent = String(oferta);
    for (const b of [menos, mas, mucho, pujar, pasar]) b.disabled = espera;
    m.hud.tiempo(`Bolsa: ${bolsa}`);
    m.hud.puntos(`${ganancia >= 0 ? '+' : ''}${ganancia}`);
  };
  const ajustar = (cuanto: number) => { if (!espera) { oferta = Math.max(0, Math.min(bolsa, oferta + cuanto)); pintar(); } };
  const cerrar = (mia: number) => {
    if (terminado || espera || m.reloj() <= 0) return;
    espera = true;
    pujas.push(mia);
    const lote = lotes[actual], mejorRival = Math.max(...lote.ofertas);
    if (mia > mejorRival) {
      const neto = lote.valor - mia;
      bolsa -= mia; ganancia += neto; ganados++;
      if (neto < 0) sobrepagos++;
      if (neto >= 0) m.sonido.bien(); else m.sonido.mal();
      nota.textContent = `Te lo llevaste por ${mia}. Valía ${lote.valor}: ${neto >= 0 ? `ganas ${neto}` : `pierdes ${-neto}`}. Los rivales ofrecieron ${lote.ofertas.join(', ')}.`;
      m.el('span', `pasada ${neto >= 0 ? 'bien' : 'mal'}`, historial, `${neto >= 0 ? '+' : ''}${neto}`);
    } else {
      m.sonido.toque();
      nota.textContent = `Se lo llevó un rival por ${mejorRival}. Valía ${lote.valor}${mejorRival > lote.valor ? ': pagó de más' : ''}.`;
      m.el('span', 'pasada', historial, '—');
    }
    pintar();
    m.despues(3, () => {
      actual++; oferta = 0; espera = false;
      if (actual < COFRES) return pintar();
      terminado = true;
      m.detener();
      c.alTerminar({
        puntaje: Math.max(0, ganancia * 5),
        lineas: [['Ganancia neta', `${ganancia} monedas`], ['Cofres ganados', `${ganados} de ${COFRES}`], ['Pagaste de más', String(sobrepagos)], ['Bolsa sin usar', String(bolsa)]],
        detalle: { pujas, ganancia, ganados },
      });
    });
  };
  menos.addEventListener('click', () => ajustar(-5));
  mas.addEventListener('click', () => ajustar(5));
  mucho.addEventListener('click', () => ajustar(25));
  pujar.addEventListener('click', () => cerrar(oferta));
  pasar.addEventListener('click', () => cerrar(0));
  nota.textContent = 'Gana el cofre quien más ofrece, y paga lo que ofreció. Tu ganancia es el valor real menos lo pagado.';
  pintar();
  return { empezar: m.empezar, destruir: m.destruir };
}
