import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { barajar, crearMesa, mmss } from './mesa';

// Luces del Faro: tres tableros seguidos. Cada toque cambia la luz tocada y sus cuatro vecinas.
// Cada tablero se arma partiendo de todo apagado y aplicando toques al azar, así siempre tiene solución.
const TABLEROS = [{ lado: 4, toques: 5 }, { lado: 5, toques: 7 }, { lado: 5, toques: 9 }], LIMITE = 180;

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'luces'), r = generador(c.semilla);
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
  let actual = 0, resueltos = 0, toques = 0, terminado = false, botones: HTMLButtonElement[] = [];

  const pintar = () => { const { luz } = armados[actual]; botones.forEach((b, i) => { b.classList.toggle('encendida', luz[i]); b.setAttribute('aria-pressed', String(luz[i])); }); };
  const montar = () => {
    const { lado } = armados[actual];
    titulo.textContent = `Tablero ${actual + 1} de ${TABLEROS.length}`;
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
      puntaje: resueltos * 300 + (todos ? Math.round(Math.max(0, LIMITE - t) * 1.5) : 0),
      lineas: [['Tableros apagados', `${resueltos} de ${TABLEROS.length}`], ['Toques', String(toques)], ['Tiempo', mmss(t)]],
      detalle: { resueltos, toques, seg: Math.round(t) },
    });
  };

  function tocar(i: number) {
    if (terminado || m.reloj() <= 0) return;
    const { luz, lado } = armados[actual];
    cambiar(luz, lado, i);
    toques++;
    m.sonido.toque();
    pintar();
    if (luz.some(Boolean)) return;
    resueltos++;
    m.sonido.bien();
    if (resueltos === TABLEROS.length) return terminar();
    m.hud.aviso('¡Apagado!', 'bien', 0.9);
    actual++;
    montar();
  }

  montar();
  m.hud.tiempo(mmss(LIMITE));
  m.alTic((t) => {
    m.hud.tiempo(mmss(LIMITE - t));
    m.hud.extra(`${toques} toques`);
    m.hud.puntos(`${resueltos} / ${TABLEROS.length}`);
    if (t >= LIMITE) terminar();
  });
  return { empezar: m.empezar, destruir: m.destruir };
}
