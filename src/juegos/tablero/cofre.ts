import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { fotoModelo } from '../../nucleo/modelos';
import { crearMesa } from './mesa';

// El Cofre o la Ola: diez cofres. En cada uno se puede seguir sacando monedas o plantarse.
// En qué sacada llega la ola de cada cofre ya viene decidido por la semilla: todos enfrentan las mismas olas.
// Para decidir con información: cada cofre muestra cómo está el mar (calma, oleaje o tormenta, cada uno con su riesgo;
// la tormenta paga más), cuánto podría salir en la próxima sacada, y hay dos catalejos que dicen si la próxima es segura.
const COFRES = 10, PASOS = 14, CATALEJOS = 2;
const MARES = {
  calma: { nombre: 'Mar en calma', icono: '☀️', base: 0.03, sube: 0.05, paga: 1 },
  oleaje: { nombre: 'Oleaje', icono: '🌤️', base: 0.06, sube: 0.07, paga: 1.2 },
  tormenta: { nombre: 'Tormenta', icono: '⛈️', base: 0.12, sube: 0.1, paga: 1.5 },
};
type Mar = keyof typeof MARES;
/** Probabilidad de ola al hacer la sacada número paso+1. */
const riesgo = (paso: number, mar: Mar) => Math.min(0.9, MARES[mar].base + MARES[mar].sube * paso);
const rango = (paso: number, mar: Mar) => [Math.round((6 + 2 * paso) * MARES[mar].paga), Math.round((15 + 2 * paso) * MARES[mar].paga)];

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'cofre', c.aspecto), r = generador(c.semilla);
  const cofres = Array.from({ length: COFRES }, () => {
    const monedas: number[] = [], suerte = r(), mar: Mar = suerte < 0.35 ? 'calma' : suerte < 0.75 - (c.nivel - 1) * 0.05 ? 'oleaje' : 'tormenta';
    let ola = PASOS;
    for (let paso = 0; paso < PASOS; paso++) {
      monedas.push(Math.round((6 + Math.floor(r() * 10) + 2 * paso) * MARES[mar].paga));
      if (r() < riesgo(paso, mar) && ola === PASOS) ola = paso;
    }
    return { monedas, ola, mar };
  });

  const titulo = m.el('div', 'sigla', m.tablero), cielo = m.el('div', 'cofre-mar', m.tablero), dibujo = m.el('div', 'cofre-dibujo', m.tablero);
  // El cofre es el del Pirate Kit de Kenney, fotografiado al vuelo
  const cofreFoto = m.el('img', '', dibujo);
  cofreFoto.alt = 'Cofre';
  fotoModelo('pirata', 'chest', 256).then((src) => { cofreFoto.src = src; }).catch(() => {});
  const pozo = m.el('div', 'cofre-pozo', m.tablero), aviso = m.el('p', 'cofre-riesgo', m.tablero);
  const barra = m.el('div', 'fila centro', m.tablero), sacar = m.el('button', 'boton principal grande', barra, 'Sacar más'), plantar = m.el('button', 'boton grande', barra, 'Plantarme');
  const mirar = m.el('button', 'boton', m.el('div', 'fila centro', m.tablero), '');
  const historial = m.el('div', 'cofre-historial', m.tablero);
  let actual = 0, paso = 0, enMano = 0, total = 0, olas = 0, mayor = 0, catalejos = CATALEJOS, espera = false, terminado = false;
  const decisiones: number[] = []; // sacadas hechas en cada cofre; negativo si se lo llevó la ola

  const pintar = () => {
    const cofre = cofres[Math.min(actual, COFRES - 1)], mar = MARES[cofre.mar], [desde, hasta] = rango(paso, cofre.mar);
    titulo.textContent = `Cofre ${Math.min(actual + 1, COFRES)} de ${COFRES}`;
    cielo.textContent = `${mar.icono} ${mar.nombre}${cofre.mar === 'tormenta' ? ' · paga más' : ''}`;
    cielo.className = `cofre-mar ${cofre.mar}`;
    pozo.textContent = `${enMano} monedas en la mano`;
    aviso.textContent = `Próxima sacada: ${desde} a ${hasta} monedas · riesgo de ola ${Math.round(riesgo(paso, cofre.mar) * 100)} %`;
    plantar.disabled = espera || enMano === 0;
    sacar.disabled = espera;
    mirar.textContent = `🔭 Catalejo (${catalejos})`;
    mirar.disabled = espera || catalejos === 0;
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
      detalle: { decisiones, olas, catalejos: CATALEJOS - catalejos },
    });
  };

  const siguiente = (texto: string, clase: string) => {
    const { ola } = cofres[actual];
    m.el('span', `pasada ${clase}`, historial, texto).title = ola >= PASOS ? 'En este cofre no venía ola' : `La ola venía en la sacada ${ola + 1}`;
    if (clase === 'bien') aviso.textContent = ola >= PASOS ? 'En este cofre no venía ola.' : `La ola venía en la sacada ${ola + 1}.`;
    espera = true;
    const mensaje = aviso.textContent;
    pintar();
    if (clase === 'bien') aviso.textContent = mensaje;
    m.despues(1.3, () => {
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
  // El catalejo dice la verdad sobre la próxima sacada de este cofre
  mirar.addEventListener('click', () => {
    if (terminado || espera || catalejos === 0 || m.reloj() <= 0) return;
    catalejos--;
    const viene = paso >= cofres[actual].ola;
    m.hud.aviso(viene ? '🔭 ¡Se ve una ola! Mejor plantarse' : '🔭 Mar tranquilo: la próxima es segura', viene ? 'mal' : 'bien', 1.6);
    pintar();
  });

  pintar();
  return { empezar: m.empezar, destruir: m.destruir };
}
