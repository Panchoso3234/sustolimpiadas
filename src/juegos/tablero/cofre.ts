import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { fotoModelo } from '../../nucleo/modelos';
import { crearMesa } from './mesa';

// El Cofre o la Ola: diez cofres. En cada uno se puede seguir sacando monedas o plantarse.
// En qué sacada llega la ola de cada cofre ya viene decidido por la semilla: todos enfrentan las mismas olas.
const COFRES = 10, PASOS = 14;
const riesgo = (paso: number) => Math.min(0.9, 0.06 + 0.07 * paso); // probabilidad de ola al hacer la sacada número paso+1

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'cofre', c.aspecto), r = generador(c.semilla);
  const cofres = Array.from({ length: COFRES }, () => {
    const monedas: number[] = [];
    let ola = PASOS;
    for (let paso = 0; paso < PASOS; paso++) {
      monedas.push(6 + Math.floor(r() * 10) + 2 * paso);
      if (r() < riesgo(paso) && ola === PASOS) ola = paso;
    }
    return { monedas, ola };
  });

  const titulo = m.el('div', 'sigla', m.tablero), dibujo = m.el('div', 'cofre-dibujo', m.tablero);
  // El cofre es el del Pirate Kit de Kenney, fotografiado al vuelo
  const cofreFoto = m.el('img', '', dibujo);
  cofreFoto.alt = 'Cofre';
  fotoModelo('pirata', 'chest', 256).then((src) => { cofreFoto.src = src; }).catch(() => {});
  const pozo = m.el('div', 'cofre-pozo', m.tablero), aviso = m.el('p', 'cofre-riesgo', m.tablero);
  const barra = m.el('div', 'fila centro', m.tablero), sacar = m.el('button', 'boton principal grande', barra, 'Sacar más'), plantar = m.el('button', 'boton grande', barra, 'Plantarme');
  const historial = m.el('div', 'cofre-historial', m.tablero);
  let actual = 0, paso = 0, enMano = 0, total = 0, olas = 0, mayor = 0, espera = false, terminado = false;
  const decisiones: number[] = []; // sacadas hechas en cada cofre; negativo si se lo llevó la ola

  const pintar = () => {
    titulo.textContent = `Cofre ${Math.min(actual + 1, COFRES)} de ${COFRES}`;
    pozo.textContent = `${enMano} monedas en la mano`;
    aviso.textContent = `Riesgo de ola en la próxima sacada: ${Math.round(riesgo(paso) * 100)} %`;
    plantar.disabled = espera || enMano === 0;
    sacar.disabled = espera;
    m.hud.puntos(`${total} monedas`);
    m.hud.tiempo(`Cofre ${Math.min(actual + 1, COFRES)}/${COFRES}`);
  };

  const terminar = () => {
    terminado = true;
    m.detener();
    m.sonido.fanfarria();
    c.alTerminar({
      puntaje: total,
      lineas: [['Cofres guardados', `${COFRES - olas} de ${COFRES}`], ['Olas', String(olas)], ['Mejor cofre', `${mayor} monedas`]],
      detalle: { decisiones, olas },
    });
  };

  const siguiente = (texto: string, clase: string) => {
    m.el('span', `ficha ${clase}`, historial, texto);
    espera = true;
    pintar();
    m.despues(1.1, () => {
      actual++; paso = 0; enMano = 0; espera = false;
      dibujo.replaceChildren(cofreFoto);
      dibujo.className = 'cofre-dibujo';
      if (actual >= COFRES) return terminar();
      pintar();
    });
  };

  sacar.addEventListener('click', () => {
    if (terminado || espera || m.reloj() <= 0) return;
    const cofre = cofres[actual];
    if (paso >= cofre.ola) {
      olas++;
      decisiones.push(-(paso + 1));
      m.sonido.mal();
      dibujo.replaceChildren('🌊');
      dibujo.className = 'cofre-dibujo ola';
      m.hud.aviso(`¡La ola se llevó ${enMano} monedas!`, 'mal', 1);
      enMano = 0;
      return siguiente('🌊 0', 'mal');
    }
    enMano += cofre.monedas[paso];
    paso++;
    m.sonido.tono(440 + paso * 45, 0.09);
    dibujo.className = 'cofre-dibujo salta';
    void dibujo.offsetWidth;
    dibujo.className = 'cofre-dibujo';
    if (paso >= PASOS) return guardar();
    pintar();
  });
  const guardar = () => {
    total += enMano;
    mayor = Math.max(mayor, enMano);
    decisiones.push(paso);
    m.sonido.bien();
    siguiente(`+${enMano}`, 'bien');
  };
  plantar.addEventListener('click', () => { if (!terminado && !espera && enMano > 0) guardar(); });

  pintar();
  return { empezar: m.empezar, destruir: m.destruir };
}
