import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMesa, mmss } from './mesa';

// Ruta del Cartero: salir del correo, pasar por las nueve casas y volver, caminando lo menos posible por las calles
// (primero a lo ancho y después a lo alto). Las casas urgentes (⏰) deben estar entre las primeras entregas.
// La mejor ruta posible se calcula probando todos los órdenes que respetan las urgentes (a lo más 362.880: un instante).
const CASAS = 9, LIMITE = 150, ANCHO = 100, ALTO = 64, URGENTES_ANTES = 4, SVG = 'http://www.w3.org/2000/svg';
interface P { x: number; y: number }
const dist = (a: P, b: P) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/** Puntos de una caminata por las calles: de cada parada a la siguiente, a lo ancho y luego a lo alto. */
const porCalles = (lista: P[]) => lista.flatMap((p, i) => (i === 0 ? [p] : [{ x: p.x, y: lista[i - 1].y }, p]));

function pueblo(semilla: string): P[] {
  const r = generador(semilla), puntos: P[] = [];
  // El primero es el correo. Ninguna casa queda pegada a otra.
  for (let intento = 0; puntos.length < CASAS + 1 && intento < 4000; intento++) {
    const p = { x: 7 + r() * (ANCHO - 14), y: 7 + r() * (ALTO - 14) };
    if (puntos.every((q) => dist(p, q) > 16)) puntos.push(p);
  }
  return puntos;
}

function largo(puntos: P[], orden: number[]): number {
  let total = 0, previo = 0;
  for (const i of orden) { total += dist(puntos[previo], puntos[i]); previo = i; }
  return total + dist(puntos[previo], puntos[0]);
}

function mejorRuta(puntos: P[], urgentes: number[]): number {
  let mejor = Infinity;
  const orden: number[] = [], usada = new Array<boolean>(puntos.length).fill(false);
  const probar = (acumulado: number, previo: number) => {
    if (acumulado >= mejor) return;
    if (orden.length >= URGENTES_ANTES && urgentes.some((u) => !usada[u])) return; // una urgente quedó para después
    if (orden.length === puntos.length - 1) { mejor = Math.min(mejor, acumulado + dist(puntos[previo], puntos[0])); return; }
    for (let i = 1; i < puntos.length; i++) {
      if (usada[i]) continue;
      usada[i] = true; orden.push(i);
      probar(acumulado + dist(puntos[previo], puntos[i]), i);
      usada[i] = false; orden.pop();
    }
  };
  probar(0, 0);
  return mejor;
}

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'cartero', c.aspecto), puntos = pueblo(c.semilla), casas = puntos.length - 1;
  const r = generador(`${c.semilla}|urgentes`), urgentes: number[] = [];
  while (urgentes.length < (c.nivel >= 3 ? 3 : 2)) { const u = 1 + Math.floor(r() * casas); if (!urgentes.includes(u)) urgentes.push(u); }
  const optimo = mejorRuta(puntos, urgentes);
  const atrasadas = () => urgentes.filter((u) => { const k = ruta.indexOf(u); return k < 0 || k >= URGENTES_ANTES; }).length;
  const ruta: number[] = [];
  let terminado = false;

  const lienzo = document.createElementNS(SVG, 'svg');
  lienzo.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
  lienzo.setAttribute('class', 'mapa');
  m.tablero.appendChild(lienzo);
  const forma = (tag: string, atributos: Record<string, string | number>, texto?: string) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, String(v));
    if (texto) e.textContent = texto;
    lienzo.appendChild(e);
    return e;
  };
  // Calles de fondo
  const calles: string[] = [];
  for (let x = 4; x < ANCHO; x += 8) calles.push(`M${x} 0 V${ALTO}`);
  for (let y = 4; y < ALTO; y += 8) calles.push(`M0 ${y} H${ANCHO}`);
  forma('path', { class: 'calles', d: calles.join(' ') });
  const camino = forma('polyline', { class: 'camino', fill: 'none' }), vuelta = forma('polyline', { class: 'camino vuelta', fill: 'none' });
  const marcas = puntos.map((p, i) => {
    const g = forma('g', { class: i === 0 ? 'correo' : 'casa', transform: `translate(${p.x} ${p.y})`, tabindex: i === 0 ? -1 : 0, role: 'button', 'aria-label': i === 0 ? 'Correo' : `Casa ${i}` });
    const pieza = (tag: string, a: Record<string, string | number>, texto?: string) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); if (texto) e.textContent = texto; g.appendChild(e); return e; };
    pieza('circle', { r: 6.5, class: 'zona' });
    if (i === 0) { pieza('rect', { x: -4, y: -3, width: 8, height: 6, rx: 1, class: 'cuerpo' }); pieza('path', { d: 'M-4 -3 L0 0.6 L4 -3', class: 'sobre' }); }
    else { pieza('rect', { x: -3.2, y: -1.2, width: 6.4, height: 4.6, class: 'cuerpo' }); pieza('path', { d: 'M-4.3 -1 L0 -4.8 L4.3 -1 Z', class: 'techo' }); }
    const numero = pieza('text', { y: 8.6, class: 'orden' });
    if (urgentes.includes(i)) { g.classList.add('urgente'); pieza('text', { y: -6.2, class: 'reloj' }, '⏰'); g.setAttribute('aria-label', `Casa ${i}, urgente`); }
    if (i > 0) { g.addEventListener('click', () => visitar(i)); g.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); visitar(i); } }); }
    return { g, numero };
  });

  const barra = m.el('div', 'fila centro', m.tablero);
  const deshacer = m.el('button', 'boton', barra, 'Deshacer'), borrar = m.el('button', 'boton', barra, 'Borrar ruta'), entregar = m.el('button', 'boton principal', barra, 'Entregar');
  const metros = (d: number) => Math.round(d * 10);

  const pintar = () => {
    const texto = (lista: P[]) => porCalles(lista).map((p) => `${p.x},${p.y}`).join(' ');
    camino.setAttribute('points', texto([0, ...ruta].map((i) => puntos[i])));
    const completa = ruta.length === casas, ultima = puntos[ruta[ruta.length - 1] ?? 0];
    vuelta.setAttribute('points', texto([ultima, puntos[0]]));
    vuelta.style.display = completa ? '' : 'none';
    marcas.forEach(({ g, numero }, i) => { const puesto = ruta.indexOf(i); g.classList.toggle('visitada', puesto >= 0); numero.textContent = puesto >= 0 ? String(puesto + 1) : ''; });
    entregar.disabled = !completa;
    const tarde = ruta.length >= URGENTES_ANTES ? atrasadas() : 0;
    m.hud.extra(`${completa ? `${metros(largo(puntos, ruta))} m` : `${ruta.length} de ${casas} casas`}${tarde ? ` · ⏰ ${tarde} atrasada${tarde > 1 ? 's' : ''}` : ''}`);
  };

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    const t = m.reloj(), completa = ruta.length === casas, mia = completa ? largo(puntos, ruta) : 0, tarde = completa ? atrasadas() : 0;
    m.detener();
    if (completa) m.sonido.fanfarria(); else m.sonido.mal();
    c.alTerminar({
      puntaje: completa ? Math.max(0, Math.round(Math.min(1000, (1000 * optimo) / mia)) - Math.min(200, Math.max(0, Math.round(t - 30))) - 120 * tarde) : 0,
      lineas: [['Tu ruta', completa ? `${metros(mia)} m` : 'Sin terminar'], ['Mejor posible', `${metros(optimo)} m`], ['De más', completa ? `${Math.round((mia / optimo - 1) * 100)} %` : '—'], ['Urgentes atrasadas', String(tarde)], ['Tiempo', mmss(t)]],
      detalle: { ruta, metros: metros(mia), optimo: metros(optimo), atrasadas: tarde, seg: Math.round(t) },
    });
  };

  function visitar(i: number) {
    if (terminado || m.reloj() <= 0 || ruta.includes(i)) return;
    ruta.push(i);
    m.sonido.toque();
    pintar();
  }
  deshacer.addEventListener('click', () => { if (!terminado) { ruta.pop(); pintar(); } });
  borrar.addEventListener('click', () => { if (!terminado) { ruta.length = 0; pintar(); } });
  entregar.addEventListener('click', () => { if (ruta.length === casas) terminar(); });

  pintar();
  m.hud.tiempo(mmss(LIMITE));
  m.hud.puntos('✉');
  m.alTic((t) => { m.hud.tiempo(mmss(LIMITE - t)); if (t >= LIMITE) terminar(); });
  return { empezar: m.empezar, destruir: m.destruir };
}
