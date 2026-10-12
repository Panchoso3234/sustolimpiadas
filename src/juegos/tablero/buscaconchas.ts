import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { barajar, crearMesa, mmss } from './mesa';

// Buscaconchas: buscaminas en la arena. 9×9 casillas y 12 erizos; el primer toque nunca es un erizo.
const LADO = 9, ERIZOS = 12, LIMITE = 300, SEGURAS = LADO * LADO - ERIZOS;

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'buscaconchas'), r = generador(c.semilla);
  const orden = barajar(Array.from({ length: LADO * LADO }, (_, i) => i), r);
  const erizo = new Array<boolean>(LADO * LADO).fill(false);
  for (const i of orden.slice(0, ERIZOS)) erizo[i] = true;
  const abierta = new Array<boolean>(LADO * LADO).fill(false), bandera = new Array<boolean>(LADO * LADO).fill(false);
  let primera = true, modoBandera = false, destapadas = 0, terminado = false;

  const vecinas = (i: number) => {
    const x = i % LADO, y = Math.floor(i / LADO), lista: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < LADO && ny < LADO) lista.push(ny * LADO + nx);
    }
    return lista;
  };
  const cerca = (i: number) => vecinas(i).filter((k) => erizo[k]).length;

  const grilla = m.el('div', 'arena', m.tablero);
  grilla.style.setProperty('--bandera', `url(${import.meta.env.BASE_URL}figuras/bandera.png)`);
  grilla.style.setProperty('--lado', String(LADO));
  const casillas = erizo.map((_, i) => {
    const b = m.el('button', 'casilla', grilla);
    b.setAttribute('aria-label', `Casilla ${i + 1}`);
    b.addEventListener('click', () => (modoBandera ? marcar(i) : destapar(i)));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); marcar(i); });
    return b;
  });
  const barra = m.el('div', 'fila centro', m.tablero), botonBandera = m.el('button', 'boton', barra, 'Banderín: no');
  botonBandera.setAttribute('aria-pressed', 'false');
  botonBandera.addEventListener('click', () => {
    modoBandera = !modoBandera;
    botonBandera.textContent = `Banderín: ${modoBandera ? 'sí' : 'no'}`;
    botonBandera.setAttribute('aria-pressed', String(modoBandera));
  });

  const terminar = (gano: boolean) => {
    if (terminado) return;
    terminado = true;
    const t = m.reloj();
    m.detener();
    erizo.forEach((si, i) => { if (si) { casillas[i].textContent = ''; casillas[i].classList.remove('marcada'); casillas[i].classList.add('erizo'); } });
    if (gano) m.sonido.fanfarria(); else m.sonido.mal();
    c.alTerminar({
      puntaje: gano ? Math.max(300, Math.round(1000 - 5 * t)) : destapadas * 3,
      lineas: [['Resultado', gano ? 'Arena despejada' : t >= LIMITE ? 'Se acabó el tiempo' : 'Pisaste un erizo'], ['Casillas destapadas', `${destapadas} de ${SEGURAS}`], ['Tiempo', mmss(t)]],
      detalle: { gano, destapadas, seg: Math.round(t) },
    });
  };

  function marcar(i: number) {
    if (terminado || abierta[i] || m.reloj() <= 0) return;
    bandera[i] = !bandera[i];
    casillas[i].classList.toggle('marcada', bandera[i]);
  }

  function destapar(inicio: number) {
    if (terminado || abierta[inicio] || bandera[inicio] || m.reloj() <= 0) return;
    if (primera) {
      primera = false;
      // Si el primer toque cae en un erizo, ese erizo se muda a la primera casilla libre
      if (erizo[inicio]) { erizo[inicio] = false; erizo[erizo.findIndex((si, k) => !si && k !== inicio)] = true; }
    }
    if (erizo[inicio]) { casillas[inicio].classList.add('pisada'); return terminar(false); }
    m.sonido.toque();
    const cola = [inicio];
    while (cola.length) {
      const i = cola.pop()!;
      if (abierta[i] || bandera[i]) continue;
      abierta[i] = true;
      destapadas++;
      const n = cerca(i), b = casillas[i];
      b.classList.add('abierta', `n${n}`);
      b.textContent = n ? String(n) : '';
      if (n === 0) cola.push(...vecinas(i));
    }
    if (destapadas === SEGURAS) terminar(true);
  }

  m.hud.tiempo(mmss(LIMITE));
  m.alTic((t) => {
    m.hud.tiempo(mmss(LIMITE - t));
    m.hud.extra(`Erizos: ${ERIZOS - bandera.filter(Boolean).length}`);
    m.hud.puntos(`${destapadas} / ${SEGURAS}`);
    if (t >= LIMITE) terminar(false);
  });
  return { empezar: m.empezar, destruir: m.destruir };
}
