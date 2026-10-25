import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { barajar, crearMesa, mmss, relojHud } from './mesa';

// Erizos Ocultos: 5×5 casillas de arena. Bajo cada una hay un ×1, un ×2, un ×3 o un erizo. Al final de cada fila y
// columna se ve cuánto suman sus números y cuántos erizos tiene, así que se deduce en vez de adivinar.
// Las monedas de la ronda se multiplican por cada número destapado; destapando todos los ×2 y ×3 se gana la ronda.
// Plantarse guarda lo que llevas; pisar un erizo pierde lo de la ronda y baja la dificultad.
const LADO = 5, RONDAS = 5, LIMITE = 240;
// [cuántos ×2, cuántos ×3, cuántos erizos] por dificultad, como en el juego de cartas en que se inspira
const MEZCLAS: [number, number, number][][] = [
  [[3, 1, 6], [0, 3, 6], [5, 0, 6], [2, 2, 6], [4, 1, 6]],
  [[1, 3, 7], [6, 0, 7], [3, 2, 7], [0, 4, 7], [5, 1, 7]],
  [[2, 3, 8], [7, 0, 8], [4, 2, 8], [1, 4, 8], [6, 1, 8]],
  [[3, 3, 8], [0, 5, 8], [8, 0, 10], [5, 2, 10], [2, 4, 10]],
  [[7, 1, 10], [1, 5, 10], [4, 3, 10], [9, 0, 10], [6, 2, 10]],
];
const ERIZO = 0;

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'buscaconchas', c.aspecto), r = generador(c.semilla), limite = c.libre ? Infinity : LIMITE, rondas = c.libre ? Infinity : RONDAS;
  const grilla = m.el('div', 'voltorb', m.tablero);
  const barra = m.el('div', 'fila centro', m.tablero);
  const botonPlantar = m.el('button', 'boton principal', barra, 'Plantarse');
  const botonNota = m.el('button', 'boton', barra, 'Marcar erizo: no');
  botonNota.setAttribute('aria-pressed', 'false');

  let valores: number[] = [], abierta: boolean[] = [], nota: boolean[] = [], casillas: HTMLButtonElement[] = [];
  let ronda = 0, dificultad = Math.min(1, c.nivel - 1), monedas = 1, tocadas = 0, total = 0, ganadas = 0, pisadas = 0, terminado = false, pausa = false, modoNota = false;

  botonNota.addEventListener('click', () => { modoNota = !modoNota; botonNota.textContent = `Marcar erizo: ${modoNota ? 'sí' : 'no'}`; botonNota.setAttribute('aria-pressed', String(modoNota)); });
  botonPlantar.addEventListener('click', () => { if (!terminado && !pausa && tocadas > 0) cerrarRonda('plantado'); });

  const faltan = () => valores.some((v, i) => v > 1 && !abierta[i]);

  /** Reparte una ronda nueva y dibuja el tablero con las pistas de cada fila y columna. */
  const armar = () => {
    const opciones = MEZCLAS[dificultad], [dos, tres, erizos] = opciones[Math.floor(r() * opciones.length)];
    valores = barajar([...Array<number>(dos).fill(2), ...Array<number>(tres).fill(3), ...Array<number>(erizos).fill(ERIZO), ...Array<number>(LADO * LADO - dos - tres - erizos).fill(1)], r);
    abierta = valores.map(() => false);
    nota = valores.map(() => false);
    monedas = 1;
    tocadas = 0;
    grilla.replaceChildren();
    casillas = [];
    const pista = (lista: number[], clase: string) => {
      const p = m.el('div', `pista ${clase}`, grilla);
      m.el('b', '', p, String(lista.reduce((s, v) => s + v, 0)));
      m.el('span', '', p, `🦔 ${lista.filter((v) => v === ERIZO).length}`);
    };
    for (let y = 0; y < LADO; y++) {
      for (let x = 0; x < LADO; x++) {
        const i = y * LADO + x, b = m.el('button', 'casilla', grilla);
        b.setAttribute('aria-label', `Fila ${y + 1}, columna ${x + 1}`);
        b.addEventListener('click', () => (modoNota ? anotar(i) : destapar(i)));
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); anotar(i); });
        casillas.push(b);
      }
      pista(valores.slice(y * LADO, y * LADO + LADO), 'fila');
    }
    for (let x = 0; x < LADO; x++) pista(valores.filter((_, i) => i % LADO === x), 'columna');
    m.el('div', 'pista esquina', grilla);
    pausa = false;
  };

  const mostrarTodo = () => valores.forEach((v, i) => { if (!abierta[i]) { casillas[i].classList.add('vista', v === ERIZO ? 'erizo' : `n${v}`); casillas[i].textContent = v === ERIZO ? '' : `×${v}`; } });

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    const t = m.reloj();
    m.detener();
    c.alTerminar({
      puntaje: total,
      lineas: [['Rondas jugadas', `${Math.min(ronda, RONDAS)} de ${RONDAS}`], ['Rondas ganadas', String(ganadas)], ['Erizos pisados', String(pisadas)], ['Tiempo', mmss(t)]],
      detalle: { rondas: ronda, ganadas, pisadas, seg: Math.round(t) },
    });
  };

  /** Fin de una ronda: se guardan (o se pierden) las monedas y se sigue con la siguiente. */
  function cerrarRonda(como: 'ganada' | 'plantado' | 'erizo') {
    pausa = true;
    if (como === 'erizo') { pisadas++; dificultad = Math.max(0, dificultad - 1); m.sonido.mal(); m.hud.aviso('¡Erizo! Pierdes lo de esta ronda', 'mal', 1.4); }
    else {
      total += monedas;
      if (como === 'ganada') { ganadas++; dificultad = Math.min(MEZCLAS.length - 1, dificultad + 1); m.sonido.bien(); m.hud.aviso(`¡Ronda ganada! +${monedas}`, 'oro', 1.4); }
      else { m.sonido.toque(); m.hud.aviso(`Te plantaste: +${monedas}`, '', 1.2); }
    }
    mostrarTodo();
    ronda++;
    m.despues(1.8, () => { if (terminado) return; if (ronda >= rondas) terminar(); else armar(); });
  }

  function anotar(i: number) {
    if (terminado || pausa || abierta[i] || m.reloj() <= 0) return;
    nota[i] = !nota[i];
    casillas[i].classList.toggle('marcada', nota[i]);
  }

  function destapar(i: number) {
    if (terminado || pausa || abierta[i] || nota[i] || m.reloj() <= 0) return;
    abierta[i] = true;
    tocadas++;
    const v = valores[i], b = casillas[i];
    if (v === ERIZO) { b.classList.add('pisada', 'erizo'); return cerrarRonda('erizo'); }
    b.classList.add('abierta', `n${v}`);
    b.textContent = `×${v}`;
    monedas *= v;
    if (v > 1) m.sonido.tono(440 + v * 110, 0.12); else m.sonido.toque();
    if (!faltan()) cerrarRonda('ganada');
  }

  m.hud.tiempo(relojHud(limite, 0));
  m.alTic((t) => {
    m.hud.tiempo(relojHud(limite, t));
    m.hud.extra(`Ronda ${Math.min(ronda + 1, rondas)} · nivel ${dificultad + 1} · en juego: ${tocadas ? monedas : 0}`);
    m.hud.puntos(`${total} pts`);
    botonPlantar.disabled = pausa || tocadas === 0;
    if (t >= limite) terminar(); // lo que no alcanzaste a guardar se pierde
  });
  return { empezar() { m.empezar(); armar(); }, destruir: m.destruir };
}
