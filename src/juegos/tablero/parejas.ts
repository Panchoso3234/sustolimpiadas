import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { barajar, crearMesa, mmss } from './mesa';

// Parejas del Arrecife: 10 parejas. Cada cuatro fallos, dos cartas boca abajo cambian de lugar a la vista de todos.
// Figuras del Fish Pack de Kenney
const FIGURAS = ['fish_blue', 'fish_brown', 'fish_green', 'fish_grey', 'fish_grey_long_a', 'fish_orange', 'fish_pink', 'fish_red', 'fish_green_skeleton', 'seaweed_orange_b'], LIMITE = 180, CADA = 4;

const ruta = (figura: string) => `${import.meta.env.BASE_URL}figuras/${figura}.png`;

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'parejas', c.aspecto), r = generador(c.semilla);
  const mazo = barajar([...FIGURAS, ...FIGURAS], r);
  const grilla = m.el('div', 'cartas', m.tablero);
  let abiertas: number[] = [], bloqueo = false, fallos = 0, hechas = 0, terminado = false;
  const lista: { boton: HTMLButtonElement; figura: string; lista: boolean }[] = mazo.map((figura, i) => {
    const boton = m.el('button', 'carta', grilla);
    boton.setAttribute('aria-label', `Carta ${i + 1}`);
    const dibujo = m.el('img', '', m.el('span', 'cara', boton));
    dibujo.src = ruta(figura);
    dibujo.alt = '';
    boton.addEventListener('click', () => tocar(i));
    return { boton, figura, lista: false };
  });
  const mostrar = (i: number, si: boolean) => lista[i].boton.classList.toggle('abierta', si);
  const puntaje = (t: number) => (hechas === FIGURAS.length ? Math.max(0, Math.round(1000 - 8 * t - 20 * fallos)) : hechas * 40);

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    const t = m.reloj();
    m.detener();
    if (hechas === FIGURAS.length) m.sonido.fanfarria();
    c.alTerminar({
      puntaje: puntaje(t),
      lineas: [['Parejas', `${hechas} de ${FIGURAS.length}`], ['Fallos', String(fallos)], ['Tiempo', mmss(t)]],
      detalle: { parejas: hechas, fallos, seg: Math.round(t) },
    });
  };

  // Dos cartas boca abajo intercambian su figura; se marcan un momento para que se note cuáles fueron
  const cambiar = () => {
    const libres = lista.map((x, i) => (x.lista ? -1 : i)).filter((i) => i >= 0), a = libres[Math.floor(r() * libres.length)], resto = libres.filter((i) => i !== a && lista[i].figura !== lista[a].figura);
    const b = resto[Math.floor(r() * resto.length)];
    if (a === undefined || b === undefined) return;
    [lista[a].figura, lista[b].figura] = [lista[b].figura, lista[a].figura];
    for (const i of [a, b]) {
      lista[i].boton.querySelector('img')!.src = ruta(lista[i].figura);
      lista[i].boton.classList.add('cambia');
      m.despues(1.4, () => lista[i].boton.classList.remove('cambia'));
    }
    m.hud.aviso('¡Dos cartas cambiaron de lugar!', 'oro', 1.4);
  };

  function tocar(i: number) {
    if (terminado || bloqueo || lista[i].lista || abiertas.includes(i) || m.reloj() <= 0) return;
    m.sonido.toque();
    mostrar(i, true);
    abiertas.push(i);
    if (abiertas.length < 2) return;
    const [a, b] = abiertas;
    if (lista[a].figura === lista[b].figura) {
      lista[a].lista = lista[b].lista = true;
      lista[a].boton.classList.add('lista');
      lista[b].boton.classList.add('lista');
      abiertas = [];
      hechas++;
      m.sonido.bien();
      if (hechas === FIGURAS.length) terminar();
      return;
    }
    fallos++;
    bloqueo = true;
    m.despues(0.8, () => {
      mostrar(a, false);
      mostrar(b, false);
      abiertas = [];
      bloqueo = false;
      if (fallos % CADA === 0 && !terminado) cambiar();
    });
  }

  m.hud.tiempo(mmss(LIMITE));
  m.hud.puntos(`0 / ${FIGURAS.length}`);
  m.alTic((t) => {
    m.hud.tiempo(mmss(LIMITE - t));
    m.hud.puntos(`${hechas} / ${FIGURAS.length}`);
    m.hud.extra(`${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}`);
    if (t >= LIMITE) terminar();
  });
  return {
    empezar() {
      m.empezar();
      bloqueo = true;
      lista.forEach((_, i) => mostrar(i, true));
      m.despues(1.6, () => { lista.forEach((x, i) => { if (!x.lista) mostrar(i, false); }); bloqueo = false; });
    },
    destruir: m.destruir,
  };
}
