import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMesa, mmss } from './mesa';

// Ruta del Cartero (versión 2, 26-10): tres repartos seguidos, de 9, 11 y 13 casas. En cada uno hay que salir del correo,
// pasar por todas las casas y volver, caminando lo menos posible por las calles (primero a lo ancho y después a lo alto).
// Las casas urgentes (⏰) deben estar entre las primeras entregas. Cada reparto suma por precisión (qué tan cerca de la mejor
// ruta) y por rapidez (segundos que tardaste en ese reparto), así que dos rutas perfectas igual se separan por el tiempo.
// La mejor ruta se calcula exacta (programación dinámica sobre subconjuntos: con 13 casas, un instante).
const REPARTOS = [9, 11, 13], LIMITE = 180, ANCHO = 100, ALTO = 64, URGENTES_ANTES = 4, SVG = 'http://www.w3.org/2000/svg';
/** Puntos de un reparto: precisión (hasta 500, cae rápido si te alejas de la mejor), rapidez (hasta 300) y ruta perfecta (+100). */
const PRECISION = 500, RAPIDEZ = 300, POR_SEGUNDO = 8, PERFECTA = 100, ATRASADA = 120;
interface P { x: number; y: number }
const dist = (a: P, b: P) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/** Puntos de una caminata por las calles: de cada parada a la siguiente, a lo ancho y luego a lo alto. */
const porCalles = (lista: P[]) => lista.flatMap((p, i) => (i === 0 ? [p] : [{ x: p.x, y: lista[i - 1].y }, p]));

function pueblo(semilla: string, casas: number): P[] {
  const r = generador(semilla), puntos: P[] = [], separacion = casas > 9 ? 13 : 16;
  // El primero es el correo. Ninguna casa queda pegada a otra.
  for (let intento = 0; puntos.length < casas + 1 && intento < 6000; intento++) {
    const p = { x: 7 + r() * (ANCHO - 14), y: 7 + r() * (ALTO - 14) };
    if (puntos.every((q) => dist(p, q) > separacion)) puntos.push(p);
  }
  return puntos;
}

function largo(puntos: P[], orden: number[]): number {
  let total = 0, previo = 0;
  for (const i of orden) { total += dist(puntos[previo], puntos[i]); previo = i; }
  return total + dist(puntos[previo], puntos[0]);
}

/** La mejor ruta (largo y orden) que respeta las urgentes: Held-Karp con la regla de las urgentes en cada paso. */
export function mejorRuta(puntos: P[], urgentes: number[]): { largo: number; orden: number[] } {
  const n = puntos.length - 1, total = 1 << n, todasUrg = urgentes.reduce((m, u) => m | (1 << (u - 1)), 0);
  const costo = new Float64Array(total * n).fill(Infinity), padre = new Int16Array(total * n).fill(-1);
  const cuenta = (m: number) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
  const valida = (m: number) => cuenta(m) < URGENTES_ANTES || (m & todasUrg) === todasUrg;
  for (let i = 0; i < n; i++) if (valida(1 << i)) costo[(1 << i) * n + i] = dist(puntos[0], puntos[i + 1]);
  for (let m = 1; m < total; m++) for (let i = 0; i < n; i++) {
    const c0 = costo[m * n + i];
    if (!(m & (1 << i)) || c0 === Infinity) continue;
    for (let j = 0; j < n; j++) {
      if (m & (1 << j)) continue;
      const nm = m | (1 << j);
      if (!valida(nm)) continue;
      const c = c0 + dist(puntos[i + 1], puntos[j + 1]);
      if (c < costo[nm * n + j]) { costo[nm * n + j] = c; padre[nm * n + j] = i; }
    }
  }
  let mejor = Infinity, fin = 0;
  for (let i = 0; i < n; i++) { const c = costo[(total - 1) * n + i] + dist(puntos[i + 1], puntos[0]); if (c < mejor) { mejor = c; fin = i; } }
  const orden: number[] = [];
  for (let m = total - 1, i = fin; i >= 0;) { orden.unshift(i + 1); const p = padre[m * n + i]; m &= ~(1 << i); i = p; }
  return { largo: mejor, orden };
}

/** Puntos de un reparto terminado. */
export function puntajeReparto(optimo: number, mia: number, segundos: number, atrasadas: number): number {
  const precision = Math.min(1, optimo / mia);
  return Math.max(0, Math.round(PRECISION * precision ** 4 + Math.max(0, RAPIDEZ - POR_SEGUNDO * segundos) + (mia <= optimo + 0.01 ? PERFECTA : 0) - ATRASADA * atrasadas));
}

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'cartero', c.aspecto), limite = c.libre ? Infinity : LIMITE;
  const lienzo = document.createElementNS(SVG, 'svg');
  lienzo.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
  lienzo.setAttribute('class', 'mapa');
  m.tablero.appendChild(lienzo);
  const barra = m.el('div', 'fila centro', m.tablero);
  const deshacer = m.el('button', 'boton', barra, 'Deshacer'), borrar = m.el('button', 'boton', barra, 'Borrar ruta'), entregar = m.el('button', 'boton principal', barra, 'Entregar');
  const metros = (d: number) => Math.round(d * 10);

  let reparto = 0, total = 0, desde = 0, terminado = false, pausa = false;
  let puntos: P[] = [], casas = 0, urgentes: number[] = [], optimo = { largo: 0, orden: [] as number[] };
  const ruta: number[] = [], resumen: { pts: number; mia: number; opt: number; seg: number; tarde: number }[] = [];
  let camino: Element, borde: Element, vuelta: Element, optima: Element, bici: Element, marcas: { g: Element; numero: Element }[] = [];
  const atrasadas = () => urgentes.filter((u) => { const k = ruta.indexOf(u); return k < 0 || k >= URGENTES_ANTES; }).length;

  const forma = (tag: string, atributos: Record<string, string | number>, texto?: string) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, String(v));
    if (texto) e.textContent = texto;
    lienzo.appendChild(e);
    return e;
  };

  /** Arma el pueblo de un reparto (todo sale de la semilla y del número de reparto: igual para los dos de un duelo). */
  const armar = () => {
    lienzo.replaceChildren();
    ruta.length = 0;
    const semilla = `${c.semilla}|reparto${reparto}`;
    puntos = pueblo(semilla, REPARTOS[reparto]); casas = puntos.length - 1;
    const r = generador(`${semilla}|urgentes`);
    urgentes = [];
    const cuantas = Math.min(URGENTES_ANTES - 1, (c.nivel >= 3 ? 3 : 2) + (reparto > 0 ? 1 : 0));
    while (urgentes.length < cuantas) { const u = 1 + Math.floor(r() * casas); if (!urgentes.includes(u)) urgentes.push(u); }
    optimo = mejorRuta(puntos, urgentes);
    // El barrio: manzanas con árboles y flores (una laguna y una plaza), y calles grises con línea al centro
    const b = generador(`${semilla}|barrio`), laguna = [Math.floor(b() * 12), Math.floor(b() * 8)], plaza = [(laguna[0] + 6) % 12, (laguna[1] + 3) % 8];
    for (let mx = 0; mx < 13; mx++) for (let my = 0; my < 8; my++) {
      const x0 = (mx - 1) * 8 + 4.8, y0 = (my - 1) * 8 + 4.8;
      if (mx === laguna[0] && my === laguna[1]) { forma('ellipse', { cx: x0 + 3.2, cy: y0 + 3.2, rx: 2.8, ry: 2.2, class: 'laguna' }); continue; }
      if (mx === plaza[0] && my === plaza[1]) { forma('rect', { x: x0 + 0.4, y: y0 + 0.4, width: 5.6, height: 5.6, rx: 1, class: 'plaza' }); forma('circle', { cx: x0 + 3.2, cy: y0 + 3.2, r: 1.2, class: 'pileta' }); continue; }
      for (let k = 0; k < 3; k++) { if (b() < 0.45) continue; const x = x0 + 0.9 + b() * 4.6, y = y0 + 0.9 + b() * 4.6; forma('circle', { cx: x + 0.25, cy: y + 0.35, r: 1.1, class: 'sombra-arbol' }); forma('circle', { cx: x, cy: y, r: 1.05, class: 'arbol' }); forma('circle', { cx: x - 0.3, cy: y - 0.3, r: 0.45, class: 'brillo' }); }
      for (let k = 0; k < 2; k++) if (b() < 0.5) forma('circle', { cx: x0 + b() * 6.4, cy: y0 + b() * 6.4, r: 0.35, class: `flor f${Math.floor(b() * 3)}` });
    }
    const calles: string[] = [];
    for (let x = 4; x < ANCHO; x += 8) calles.push(`M${x} 0 V${ALTO}`);
    for (let y = 4; y < ALTO; y += 8) calles.push(`M0 ${y} H${ANCHO}`);
    forma('path', { class: 'calles', d: calles.join(' ') });
    forma('path', { class: 'linea-calle', d: calles.join(' ') });
    optima = forma('polyline', { class: 'camino optima', fill: 'none' }); (optima as SVGElement).style.display = 'none';
    borde = forma('polyline', { class: 'camino-borde', fill: 'none' }); camino = forma('polyline', { class: 'camino', fill: 'none' }); vuelta = forma('polyline', { class: 'camino vuelta', fill: 'none' });
    bici = forma('circle', { r: 1.5, class: 'bici' });
    marcas = puntos.map((p, i) => {
      const g = forma('g', { class: i === 0 ? 'correo' : 'casa', transform: `translate(${p.x} ${p.y})`, tabindex: i === 0 ? -1 : 0, role: 'button', 'aria-label': i === 0 ? 'Correo' : `Casa ${i}` });
      const pieza = (tag: string, a: Record<string, string | number>, texto?: string) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); if (texto) e.textContent = texto; g.appendChild(e); return e; };
      pieza('circle', { r: 6.5, class: 'zona' });
      if (i === 0) {
        pieza('rect', { x: -4.6, y: -3.4, width: 9.2, height: 6.8, rx: 1, class: 'cuerpo' }); pieza('path', { d: 'M-4.6 -3.4 L0 0.6 L4.6 -3.4', class: 'sobre' });
        pieza('path', { d: 'M3.6 -3.4 V-8.6', class: 'asta' }); pieza('path', { d: 'M3.6 -8.6 L7 -7.6 L3.6 -6.6 Z', class: 'banderin' });
        pieza('text', { y: 5.6, class: 'rotulo' }, 'CORREO');
      } else {
        pieza('rect', { x: 1.6, y: -4.6, width: 1.1, height: 2.2, class: 'chimenea' });
        pieza('rect', { x: -3.2, y: -1.2, width: 6.4, height: 4.6, class: 'cuerpo' });
        pieza('path', { d: 'M-4.3 -1 L0 -4.8 L4.3 -1 Z', class: 'techo', style: `--techo: ${['#ef5565', '#3f8cff', '#8a5ad9', '#3fae6a', '#d9443a', '#2a9fd6'][i % 6]}` });
        pieza('rect', { x: -0.7, y: 1.1, width: 1.4, height: 2.3, class: 'puerta' });
        for (const x of [-2.5, 1.3]) pieza('rect', { x, y: 0, width: 1.2, height: 1.1, class: 'ventana' });
        pieza('text', { x: 4.4, y: -2.4, class: 'listo' }, '✔');
      }
      const numero = pieza('text', { y: 8.6, class: 'orden' });
      if (urgentes.includes(i)) { g.classList.add('urgente'); pieza('text', { y: -6.2, class: 'reloj' }, '⏰'); g.setAttribute('aria-label', `Casa ${i}, urgente`); }
      if (i > 0) { g.addEventListener('click', () => visitar(i)); g.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); visitar(i); } }); }
      return { g, numero };
    });
    desde = m.reloj();
    pausa = false;
    pintar();
    m.hud.aviso(`Reparto ${reparto + 1} de ${REPARTOS.length}: ${casas} casas${urgentes.length ? ` · ${urgentes.length} urgentes` : ''}`, 'oro', 1.4);
  };

  const texto = (lista: P[]) => porCalles(lista).map((p) => `${p.x},${p.y}`).join(' ');
  const pintar = () => {
    camino.setAttribute('points', texto([0, ...ruta].map((i) => puntos[i])));
    borde.setAttribute('points', camino.getAttribute('points')!);
    const fin = puntos[ruta[ruta.length - 1] ?? 0];
    bici.setAttribute('cx', String(fin.x + 4.6)); bici.setAttribute('cy', String(fin.y + 3.2));
    const completa = ruta.length === casas, ultima = puntos[ruta[ruta.length - 1] ?? 0];
    vuelta.setAttribute('points', texto([ultima, puntos[0]]));
    (vuelta as SVGElement).style.display = completa ? '' : 'none';
    marcas.forEach(({ g, numero }, i) => { const puesto = ruta.indexOf(i); g.classList.toggle('visitada', puesto >= 0); numero.textContent = puesto >= 0 ? String(puesto + 1) : ''; });
    entregar.disabled = !completa || pausa;
    const tarde = ruta.length >= URGENTES_ANTES ? atrasadas() : 0;
    m.hud.extra(`Reparto ${reparto + 1} de ${REPARTOS.length} · ${completa ? `${metros(largo(puntos, ruta))} m` : `${ruta.length} de ${casas} casas`}${tarde ? ` · ⏰ ${tarde} atrasada${tarde > 1 ? 's' : ''}` : ''}`);
    m.hud.puntos(`${total} pts`);
  };

  const terminar = (porque = '') => {
    if (terminado) return;
    terminado = true;
    const t = m.reloj();
    m.detener();
    if (resumen.length === REPARTOS.length) m.sonido.fanfarria(); else m.sonido.mal();
    c.alTerminar({
      puntaje: total,
      lineas: [
        ...resumen.map((x, i) => [`Reparto ${i + 1}`, `${x.pts} pts · ${metros(x.mia)} m (mejor ${metros(x.opt)} m) · ${x.seg.toFixed(1)} s${x.tarde ? ` · ${x.tarde} atrasada${x.tarde > 1 ? 's' : ''}` : ''}`] as [string, string]),
        ['Repartos completos', `${resumen.length} de ${REPARTOS.length}`],
        ['Rutas perfectas', String(resumen.filter((x) => x.mia <= x.opt + 0.01).length)],
        ['Tiempo', mmss(t)],
        ...(porque ? [['Fin', porque] as [string, string]] : []),
      ],
      detalle: { version: 2, repartos: resumen.length, perfectas: resumen.filter((x) => x.mia <= x.opt + 0.01).length, metros: resumen.map((x) => metros(x.mia)), optimos: resumen.map((x) => metros(x.opt)), seg: Math.round(t) },
    });
  };

  /** Entregar: suma el reparto, muestra un momento la mejor ruta (para aprender) y pasa al siguiente. */
  const entregarReparto = () => {
    if (terminado || pausa || ruta.length !== casas) return;
    const seg = m.reloj() - desde, mia = largo(puntos, ruta), tarde = atrasadas(), pts = puntajeReparto(optimo.largo, mia, seg, tarde);
    total += pts; resumen.push({ pts, mia, opt: optimo.largo, seg, tarde });
    const perfecta = mia <= optimo.largo + 0.01;
    m.hud.aviso(perfecta ? `¡Ruta perfecta! +${pts}` : `+${pts} · ${Math.round((mia / optimo.largo - 1) * 100)} % de más`, perfecta ? 'oro' : 'bien', 1.6);
    if (perfecta) m.sonido.bien(); else m.sonido.toque();
    // La mejor ruta se ve en verde y la tuya queda tenue detrás
    if (!perfecta) { optima.setAttribute('points', texto([0, ...optimo.orden, 0].map((i) => puntos[i]))); (optima as SVGElement).style.display = ''; for (const x of [camino, borde, vuelta]) (x as SVGElement).style.opacity = '0.25'; }
    pausa = true; pintar();
    reparto++;
    m.despues(perfecta ? 0.9 : 1.8, () => { if (terminado) return; if (reparto >= REPARTOS.length) terminar(); else armar(); });
  };

  function visitar(i: number) {
    if (terminado || pausa || m.reloj() <= 0 || ruta.includes(i)) return;
    ruta.push(i);
    m.sonido.toque();
    pintar();
  }
  deshacer.addEventListener('click', () => { if (!terminado && !pausa) { ruta.pop(); pintar(); } });
  borrar.addEventListener('click', () => { if (!terminado && !pausa) { ruta.length = 0; pintar(); } });
  entregar.addEventListener('click', entregarReparto);
  // Atajos: Z deshace, Enter entrega
  m.escuchar('keydown', (e) => { if (e.key === 'z' || e.key === 'Z') { deshacer.click(); } else if (e.key === 'Enter' && ruta.length === casas) { e.preventDefault(); entregarReparto(); } });

  armar();
  m.hud.tiempo(mmss(Number.isFinite(limite) ? limite : 0));
  m.alTic((t) => { m.hud.tiempo(mmss(Number.isFinite(limite) ? limite - t : t)); if (t >= limite) terminar('Se acabó el tiempo'); });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cartero = () => ({ reparto, total, casas, optimo: optimo.orden, ruta: [...ruta], terminado });
  return { empezar: m.empezar, destruir: m.destruir };
}
