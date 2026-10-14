import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { barajar, crearMesa, mmss } from './mesa';

// Luces del Faro: cinco tableros seguidos. Cada toque cambia la luz tocada y sus cuatro vecinas.
// Resolver un tablero con pocos toques (cerca del par, los toques con que se armó) da un bono.
// Cada tablero se arma partiendo de todo apagado y aplicando toques al azar, así siempre tiene solución.
const TABLEROS = [{ lado: 4, toques: 5 }, { lado: 5, toques: 7 }, { lado: 5, toques: 9 }, { lado: 6, toques: 10 }, { lado: 6, toques: 12 }], LIMITE = 240;

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'luces', c.aspecto), r = generador(c.semilla);
  const armados = TABLEROS.map(({ lado, toques }) => {
    const luz = new Array<boolean>(lado * lado).fill(false);
    for (const i of barajar(luz.map((_, k) => k), r).slice(0, toques)) cambiar(luz, lado, i);
    if (!luz.some(Boolean)) cambiar(luz, lado, 0); // por si los toques se anularon entre sí
    return { lado, luz, minimo: toques };
  });
  function cambiar(luz: boolean[], lado: number, i: number) {
    const x = i % lado, y = Math.floor(i / lado);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < lado && ny < lado) luz[ny * lado + nx] = !luz[ny * lado + nx];
    }
  }

  const titulo = m.el('div', 'sigla', m.tablero), grilla = m.el('div', 'faro', m.tablero);
  m.el('p', 'chico', m.tablero, 'Meta: dejar todas las luces apagadas (oscuras). Al lograrlo pasas al tablero siguiente.');
  let actual = 0, resueltos = 0, toques = 0, enTablero = 0, bonos = 0, terminado = false, botones: HTMLButtonElement[] = [];

  const pintar = () => { const { luz } = armados[actual]; botones.forEach((b, i) => { b.classList.toggle('encendida', luz[i]); b.setAttribute('aria-pressed', String(luz[i])); }); };
  const montar = () => {
    const { lado } = armados[actual];
    titulo.textContent = `Tablero ${actual + 1} de ${TABLEROS.length} · par: ${armados[actual].minimo} toques`;
    enTablero = 0;
    grilla.replaceChildren();
    grilla.style.setProperty('--lado', String(lado));
    botones = Array.from({ length: lado * lado }, (_, i) => {
      const b = m.el('button', 'luz', grilla);
      b.setAttribute('aria-label', `Luz ${i + 1}`);
      b.addEventListener('click', () => tocar(i));
      return b;
    });
    pintar();
  };

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    const t = m.reloj(), todos = resueltos === TABLEROS.length;
    m.detener();
    if (todos) m.sonido.fanfarria();
    c.alTerminar({
      puntaje: resueltos * 200 + bonos + (todos ? Math.round(Math.max(0, LIMITE - t) * 1.5) : 0),
      lineas: [['Tableros apagados', `${resueltos} de ${TABLEROS.length}`], ['Bono por pocos toques', String(bonos)], ['Toques', String(toques)], ['Tiempo', mmss(t)]],
      detalle: { resueltos, toques, bonos, seg: Math.round(t) },
    });
  };

  function tocar(i: number) {
    if (terminado || m.reloj() <= 0) return;
    const { luz, lado } = armados[actual];
    cambiar(luz, lado, i);
    toques++;
    enTablero++;
    m.sonido.toque();
    pintar();
    if (luz.some(Boolean)) return;
    resueltos++;
    const par = armados[actual].minimo, bono = enTablero <= par ? 80 : enTablero <= par + 2 ? 40 : 0;
    bonos += bono;
    m.sonido.bien();
    if (bono) m.hud.aviso(`¡Con ${enTablero} toques! +${bono}`, 'oro', 1.2);
    if (resueltos === TABLEROS.length) return terminar();
    if (!bono) m.hud.aviso(`¡Apagado! Va el tablero ${actual + 2} de ${TABLEROS.length}`, 'oro', 1.6);
    actual++;
    montar();
  }

  montar();
  m.hud.tiempo(mmss(LIMITE));
  m.alTic((t) => {
    m.hud.tiempo(mmss(LIMITE - t));
    m.hud.extra(`${enTablero} toques en este tablero`);
    m.hud.puntos(`${resueltos} / ${TABLEROS.length}`);
    if (t >= LIMITE) terminar();
  });
  return { empezar: m.empezar, destruir: m.destruir };
}
