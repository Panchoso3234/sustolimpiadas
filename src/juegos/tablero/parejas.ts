import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { barajar, crearMesa, mmss } from './mesa';

// Parejas del Arrecife: tres tableros que crecen (6, 8 y 10 parejas). Desde el segundo aparecen medusas: cartas sin
// pareja que, al abrirlas, te hacen perder puntos y tapan lo que tenías abierto. Cada cuatro fallos, dos cartas
// boca abajo cambian de lugar a la vista de todos. Figuras del Fish Pack de Kenney.
const FIGURAS = ['fish_blue', 'fish_brown', 'fish_green', 'fish_grey', 'fish_grey_long_a', 'fish_orange', 'fish_pink', 'fish_red', 'fish_green_skeleton', 'seaweed_orange_b'];
const NIVELES = [6, 8, 10], LIMITE = 180, CADA = 4, MEDUSA = 'medusa';
const TOTAL = NIVELES.reduce((a, b) => a + b, 0);

const ruta = (figura: string) => `${import.meta.env.BASE_URL}figuras/${figura}.png`;

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'parejas', c.aspecto), r = generador(c.semilla);
  const grilla = m.el('div', 'cartas', m.tablero);
  let lista: { boton: HTMLButtonElement; figura: string; lista: boolean }[] = [];
  let abiertas: number[] = [], bloqueo = false, fallos = 0, hechas = 0, enNivel = 0, nivel = 0, medusas = 0, terminado = false;

  const pintar = (i: number) => {
    const cara = lista[i].boton.querySelector('.cara')!;
    cara.replaceChildren();
    if (lista[i].figura === MEDUSA) { cara.textContent = '🪼'; return; }
    const dibujo = m.el('img', '', cara as HTMLElement);
    dibujo.src = ruta(lista[i].figura);
    dibujo.alt = '';
  };
  const mostrar = (i: number, si: boolean) => lista[i].boton.classList.toggle('abierta', si);
  const puntaje = (t: number) => Math.max(0, hechas * 25 + (hechas === TOTAL ? Math.max(0, Math.round(400 - 2 * t - 10 * fallos)) : 0) - medusas * 25);

  /** Arma el tablero del nivel: sus parejas y, desde el segundo, medusas (una más en las últimas jornadas). */
  const armar = () => {
    const parejas = NIVELES[nivel], trampas = nivel === 0 ? 0 : nivel === 1 ? 1 : c.nivel >= 3 ? 2 : 1;
    const figuras = barajar(FIGURAS, r).slice(0, parejas);
    const mazo = barajar([...figuras, ...figuras, ...Array<string>(trampas).fill(MEDUSA)], r);
    grilla.replaceChildren();
    grilla.dataset.cartas = String(mazo.length);
    lista = mazo.map((figura, i) => {
      const boton = m.el('button', 'carta', grilla);
      boton.setAttribute('aria-label', `Carta ${i + 1}`);
      m.el('span', 'cara', boton);
      boton.addEventListener('click', () => tocar(i));
      return { boton, figura, lista: false };
    });
    lista.forEach((_, i) => pintar(i));
    abiertas = [];
    enNivel = 0;
    // Se muestran un momento al empezar cada tablero
    bloqueo = true;
    lista.forEach((_, i) => mostrar(i, true));
    m.despues(1.4 + nivel * 0.3, () => { lista.forEach((_, i) => mostrar(i, false)); bloqueo = false; });
  };

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    const t = m.reloj();
    m.detener();
    c.alTerminar({
      puntaje: puntaje(t),
      lineas: [['Parejas', `${hechas} de ${TOTAL}`], ['Tablero', `${Math.min(nivel + 1, NIVELES.length)} de ${NIVELES.length}`], ['Fallos', String(fallos)], ['Medusas', String(medusas)], ['Tiempo', mmss(t)]],
      detalle: { parejas: hechas, tablero: nivel + 1, fallos, medusas, seg: Math.round(t) },
    });
  };

  // Dos cartas boca abajo intercambian su figura; se marcan un momento para que se note cuáles fueron
  const cambiar = () => {
    const libres = lista.map((x, i) => (x.lista ? -1 : i)).filter((i) => i >= 0), a = libres[Math.floor(r() * libres.length)];
    const resto = libres.filter((i) => i !== a && lista[i].figura !== lista[a]?.figura), b = resto[Math.floor(r() * resto.length)];
    if (a === undefined || b === undefined) return;
    [lista[a].figura, lista[b].figura] = [lista[b].figura, lista[a].figura];
    for (const i of [a, b]) {
      pintar(i);
      lista[i].boton.classList.add('cambia');
      m.despues(1.4, () => lista[i].boton.classList.remove('cambia'));
    }
    m.hud.aviso('¡Dos cartas cambiaron de lugar!', 'oro', 1.4);
  };

  function tocar(i: number) {
    if (terminado || bloqueo || lista[i].lista || abiertas.includes(i) || m.reloj() <= 0) return;
    m.sonido.toque();
    mostrar(i, true);
    if (lista[i].figura === MEDUSA) {
      // La medusa pica: resta puntos, se queda a la vista y tapa lo que estaba abierto
      medusas++;
      lista[i].lista = true;
      lista[i].boton.classList.add('lista', 'medusa');
      m.sonido.mal();
      m.hud.aviso('¡Medusa! −25', 'mal', 0.9);
      for (const k of abiertas) mostrar(k, false);
      abiertas = [];
      return;
    }
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
      if (++enNivel < NIVELES[nivel]) return;
      if (++nivel >= NIVELES.length) return terminar();
      m.hud.aviso(`Tablero ${nivel + 1}: ${NIVELES[nivel]} parejas y medusas`, 'oro', 1.4);
      bloqueo = true;
      m.despues(0.9, armar);
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
  m.hud.puntos(`0 / ${TOTAL}`);
  m.alTic((t) => {
    m.hud.tiempo(mmss(LIMITE - t));
    m.hud.puntos(`${hechas} / ${TOTAL}`);
    m.hud.extra(`Tablero ${Math.min(nivel + 1, NIVELES.length)} · ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}`);
    if (t >= LIMITE) terminar();
  });
  return {
    empezar() { m.empezar(); armar(); },
    destruir: m.destruir,
  };
}
