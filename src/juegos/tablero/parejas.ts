import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { barajar, crearMesa, mmss, relojHud } from './mesa';

// Memoria de Pez (versión 2, 27-10): cuatro tableros que crecen (6, 8, 10 y 12 parejas) en 4 minutos.
// · Cada pareja vale 30 y la racha (parejas seguidas sin fallar) suma 10 más por cada una, hasta +50.
// · Fallar resta 5; la medusa (sin pareja) resta 30, corta la racha y tapa lo que tenías abierto. Las medusas se ven
//   marcadas en la vista inicial y nunca cambian de lugar.
// · Desde el segundo tablero hay un pez dorado (su pareja vale 80) y estrellas de mar: al abrir una, muestra un
//   instante dos cartas que todavía no encuentras.
// · Tableros 1 a 3: cada cuatro fallos, dos cartas cambian de lugar a la vista. Tablero 4: corriente marina, cada tres
//   fallos una fila entera se corre un lugar.
// · Al terminar, 2 puntos por cada segundo que sobre. Todo sale de la semilla: mismo mazo para todos.
const FIGURAS = ['fish_blue', 'fish_brown', 'fish_green', 'fish_grey', 'fish_grey_long_a', 'fish_orange', 'fish_pink', 'fish_red', 'fish_green_skeleton', 'seaweed_orange_b', '🐙', '🦀'];
const TABLEROS = [{ parejas: 6, medusas: 0, estrellas: 0, columnas: 4 }, { parejas: 8, medusas: 1, estrellas: 1, columnas: 6 }, { parejas: 10, medusas: 2, estrellas: 2, columnas: 6 }, { parejas: 12, medusas: 2, estrellas: 2, columnas: 7 }];
const LIMITE = 240, CADA = 4, CORRIENTE = 3, MEDUSA = 'medusa', ESTRELLA = 'estrella';
const PUNTOS = { pareja: 30, racha: 10, rachaMax: 50, fallo: 5, medusa: 30, dorado: 80, segundo: 2 };
const TOTAL = TABLEROS.reduce((a, b) => a + b.parejas, 0);

const ruta = (figura: string) => `${import.meta.env.BASE_URL}figuras/${figura}.png`;
const esEmoji = (f: string) => !/^[a-z_]+$/.test(f);

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'parejas', c.aspecto), r = generador(c.semilla), limite = c.libre ? Infinity : LIMITE;
  const titulo = m.el('div', 'sigla', m.tablero), grilla = m.el('div', 'cartas', m.tablero);
  let lista: { boton: HTMLButtonElement; figura: string; lista: boolean; dorada: boolean }[] = [];
  let abiertas: number[] = [], bloqueo = false, fallos = 0, fallosTablero = 0, hechas = 0, enNivel = 0, nivel = 0, medusas = 0, racha = 0, mejorRacha = 0, puntos = 0, dorados = 0, terminado = false;
  const porTablero: number[] = [];

  const pintar = (i: number) => {
    const { figura } = lista[i], cara = lista[i].boton.querySelector('.cara')!;
    cara.replaceChildren();
    if (figura === MEDUSA) { cara.textContent = '🪼'; return; }
    if (figura === ESTRELLA) { cara.textContent = '⭐'; return; }
    if (esEmoji(figura)) { cara.textContent = figura; return; }
    const dibujo = m.el('img', '', cara as HTMLElement);
    dibujo.src = ruta(figura);
    dibujo.alt = '';
  };
  const mostrar = (i: number, si: boolean) => lista[i].boton.classList.toggle('abierta', si);
  const sumar = (pts: number, texto?: string, clase = '') => { puntos = Math.max(0, puntos + pts); if (texto) m.hud.aviso(texto, clase, 0.9); };

  /** Arma el tablero: sus parejas (una dorada desde el segundo), medusas y estrellas de mar. */
  const armar = () => {
    const tb = TABLEROS[nivel], figuras = barajar(FIGURAS, r).slice(0, tb.parejas), dorada = nivel > 0 ? figuras[Math.floor(r() * figuras.length)] : '';
    const mazo = barajar([...figuras, ...figuras, ...Array<string>(tb.medusas).fill(MEDUSA), ...Array<string>(tb.estrellas).fill(ESTRELLA)], r);
    grilla.replaceChildren();
    grilla.dataset.cartas = String(mazo.length);
    grilla.style.gridTemplateColumns = `repeat(${tb.columnas}, 1fr)`;
    grilla.style.maxWidth = `${tb.columnas * 78}px`;
    titulo.textContent = `Tablero ${nivel + 1} de ${TABLEROS.length} · ${tb.parejas} parejas${tb.medusas ? ` · ${tb.medusas} ${tb.medusas === 1 ? 'medusa' : 'medusas'}` : ''}${nivel === TABLEROS.length - 1 ? ' · corriente marina' : ''}`;
    lista = mazo.map((figura, i) => {
      const boton = m.el('button', 'carta', grilla);
      boton.setAttribute('aria-label', `Carta ${i + 1}`);
      m.el('span', 'cara', boton);
      boton.addEventListener('click', () => tocar(i));
      return { boton, figura, lista: false, dorada: figura === dorada };
    });
    lista.forEach((x, i) => { pintar(i); x.boton.classList.toggle('dorada', x.dorada); });
    abiertas = []; enNivel = 0; fallosTablero = 0;
    // Se muestran un momento al empezar cada tablero; las medusas quedan marcadas para que se vean bien
    bloqueo = true;
    lista.forEach((x, i) => { mostrar(i, true); if (x.figura === MEDUSA) x.boton.classList.add('avisa'); });
    m.despues(1.5 + nivel * 0.35, () => { lista.forEach((x, i) => { mostrar(i, false); x.boton.classList.remove('avisa'); }); bloqueo = false; });
  };

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    const t = m.reloj(), sobra = hechas === TOTAL && Number.isFinite(limite) ? Math.max(0, Math.round(limite - t)) : 0;
    if (sobra) puntos += sobra * PUNTOS.segundo;
    m.detener();
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Parejas', `${hechas} de ${TOTAL}`], ['Tablero', `${Math.min(nivel + 1, TABLEROS.length)} de ${TABLEROS.length}`], ['Mejor racha', String(mejorRacha)], ['Peces dorados', String(dorados)], ['Fallos', String(fallos)], ['Medusas', String(medusas)], ['Tiempo', `${mmss(t)}${sobra ? ` (+${sobra * PUNTOS.segundo})` : ''}`]],
      detalle: { version: 2, parejas: hechas, tablero: nivel + 1, fallos, medusas, racha: mejorRacha, dorados, seg: Math.round(t), porTablero },
    });
  };

  const libres = () => lista.map((x, i) => (x.lista || x.figura === MEDUSA || x.figura === ESTRELLA ? -1 : i)).filter((i) => i >= 0);
  const marcar = (i: number) => { lista[i].boton.classList.add('cambia'); m.despues(1.4, () => lista[i].boton.classList.remove('cambia')); };
  // Dos cartas boca abajo intercambian su figura; se marcan un momento para que se note cuáles fueron
  const cambiar = () => {
    const l = libres(), a = l[Math.floor(r() * l.length)], resto = l.filter((i) => i !== a && lista[i].figura !== lista[a]?.figura), b = resto[Math.floor(r() * resto.length)];
    if (a === undefined || b === undefined) return;
    [lista[a].figura, lista[b].figura] = [lista[b].figura, lista[a].figura];
    [lista[a].dorada, lista[b].dorada] = [lista[b].dorada, lista[a].dorada];
    for (const i of [a, b]) { pintar(i); lista[i].boton.classList.toggle('dorada', lista[i].dorada); marcar(i); }
    m.hud.aviso('¡Dos cartas cambiaron de lugar!', 'oro', 1.4);
  };
  // Corriente marina: las cartas boca abajo de una fila se corren un lugar a la derecha
  const corriente = () => {
    const col = TABLEROS[nivel].columnas, filas = Math.ceil(lista.length / col), fila = Math.floor(r() * filas);
    const enFila = libres().filter((i) => Math.floor(i / col) === fila);
    if (enFila.length < 2) return;
    const figs = enFila.map((i) => [lista[i].figura, lista[i].dorada] as const);
    enFila.forEach((i, k) => { [lista[i].figura, lista[i].dorada] = figs[(k - 1 + figs.length) % figs.length]; pintar(i); lista[i].boton.classList.toggle('dorada', lista[i].dorada); marcar(i); });
    m.hud.aviso(`🌊 ¡Corriente! La fila ${fila + 1} se corrió un lugar`, 'oro', 1.6);
  };

  function tocar(i: number) {
    if (terminado || bloqueo || lista[i].lista || abiertas.includes(i) || m.reloj() <= 0) return;
    m.sonido.toque();
    mostrar(i, true);
    const fig = lista[i].figura;
    if (fig === MEDUSA) {
      // La medusa pica: resta, corta la racha, se queda a la vista y tapa lo que estaba abierto
      medusas++; racha = 0;
      lista[i].lista = true;
      lista[i].boton.classList.add('lista', 'medusa');
      m.sonido.mal();
      sumar(-PUNTOS.medusa, `¡Medusa! −${PUNTOS.medusa}`, 'mal');
      for (const k of abiertas) mostrar(k, false);
      abiertas = [];
      return;
    }
    if (fig === ESTRELLA) {
      // La estrella de mar ilumina un instante dos cartas que no has encontrado
      lista[i].lista = true;
      lista[i].boton.classList.add('lista', 'estrella');
      const l = libres().filter((k) => !abiertas.includes(k)), a = l[Math.floor(r() * l.length)], b = l.filter((k) => k !== a)[Math.floor(r() * (l.length - 1))];
      for (const k of [a, b]) if (k !== undefined) { mostrar(k, true); lista[k].boton.classList.add('ilumina'); }
      bloqueo = true;
      m.hud.aviso('⭐ La estrella de mar te muestra dos cartas', 'oro', 1.2);
      m.despues(1.1, () => { for (const k of [a, b]) if (k !== undefined && !lista[k].lista) { mostrar(k, false); lista[k].boton.classList.remove('ilumina'); } bloqueo = false; });
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
      hechas++; racha++; mejorRacha = Math.max(mejorRacha, racha);
      const bono = Math.min(PUNTOS.rachaMax, PUNTOS.racha * (racha - 1)), dorada = lista[a].dorada;
      if (dorada) dorados++;
      sumar((dorada ? PUNTOS.dorado : PUNTOS.pareja) + bono, dorada ? `🐟 ¡Pez dorado! +${PUNTOS.dorado + bono}` : racha >= 2 ? `Racha ×${racha} · +${PUNTOS.pareja + bono}` : undefined, 'oro');
      m.sonido.bien();
      if (++enNivel < TABLEROS[nivel].parejas) return;
      porTablero.push(Math.round(m.reloj()));
      if (++nivel >= TABLEROS.length) return terminar();
      m.hud.aviso(`Tablero ${nivel + 1}: ${TABLEROS[nivel].parejas} parejas${nivel === TABLEROS.length - 1 ? ' y corriente marina' : ''}`, 'oro', 1.6);
      bloqueo = true;
      m.despues(1, armar);
      return;
    }
    fallos++; fallosTablero++; racha = 0;
    sumar(-PUNTOS.fallo);
    bloqueo = true;
    m.despues(0.8, () => {
      mostrar(a, false);
      mostrar(b, false);
      abiertas = [];
      bloqueo = false;
      if (terminado) return;
      if (nivel === TABLEROS.length - 1) { if (fallosTablero % CORRIENTE === 0) corriente(); }
      else if (fallos % CADA === 0) cambiar();
    });
  }

  m.hud.tiempo(relojHud(limite, 0));
  m.hud.puntos('0 pts');
  m.alTic((t) => {
    m.hud.tiempo(relojHud(limite, t));
    m.hud.puntos(`${puntos} pts`);
    m.hud.extra(`${hechas}/${TOTAL}${racha >= 2 ? ` · racha ×${racha}` : ''}`);
    if (t >= limite) terminar();
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__parejas = { cartas: () => lista.map((x) => ({ f: x.figura, lista: x.lista, dorada: x.dorada })), tocar: (i: number) => tocar(i), estado: () => ({ nivel, hechas, puntos, fallos, medusas, racha, bloqueo, terminado }) };
  return {
    empezar() { m.empezar(); armar(); },
    destruir: m.destruir,
  };
}
