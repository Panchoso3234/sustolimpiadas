import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMesa, mmss } from './mesa';

// Ruta del Cartero: salir del correo, pasar por las ocho casas y volver, caminando lo menos posible.
// La mejor ruta posible se calcula probando todos los órdenes (son 40.320: un instante).
const CASAS = 8, LIMITE = 150, ANCHO = 100, ALTO = 64, SVG = 'http://www.w3.org/2000/svg';
interface P { x: number; y: number }
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function pueblo(semilla: string): P[] {
  const r = generador(semilla), puntos: P[] = [];
  // El primero es el correo. Ninguna casa queda pegada a otra.
  for (let intento = 0; puntos.length < CASAS + 1 && intento < 4000; intento++) {
    const p = { x: 7 + r() * (ANCHO - 14), y: 7 + r() * (ALTO - 14) };
    if (puntos.every((q) => dist(p, q) > 13)) puntos.push(p);
  }
  return puntos;
}

function largo(puntos: P[], orden: number[]): number {
  let total = 0, previo = 0;
  for (const i of orden) { total += dist(puntos[previo], puntos[i]); previo = i; }
  return total + dist(puntos[previo], puntos[0]);
}

function mejorRuta(puntos: P[]): number {
  let mejor = Infinity;
  const orden: number[] = [], usada = new Array<boolean>(puntos.length).fill(false);
  const probar = (acumulado: number, previo: number) => {
    if (acumulado >= mejor) return;
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
  const m = crearMesa(c.caja, 'cartero'), puntos = pueblo(c.semilla), casas = puntos.length - 1, optimo = mejorRuta(puntos);
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
  const camino = forma('polyline', { class: 'camino', fill: 'none' }), vuelta = forma('line', { class: 'camino vuelta' });
  const marcas = puntos.map((p, i) => {
    const g = forma('g', { class: i === 0 ? 'correo' : 'casa', transform: `translate(${p.x} ${p.y})`, tabindex: i === 0 ? -1 : 0, role: 'button', 'aria-label': i === 0 ? 'Correo' : `Casa ${i}` });
    const pieza = (tag: string, a: Record<string, string | number>, texto?: string) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); if (texto) e.textContent = texto; g.appendChild(e); return e; };
    pieza('circle', { r: 6.5, class: 'zona' });
    if (i === 0) { pieza('rect', { x: -4, y: -3, width: 8, height: 6, rx: 1, class: 'cuerpo' }); pieza('path', { d: 'M-4 -3 L0 0.6 L4 -3', class: 'sobre' }); }
    else { pieza('rect', { x: -3.2, y: -1.2, width: 6.4, height: 4.6, class: 'cuerpo' }); pieza('path', { d: 'M-4.3 -1 L0 -4.8 L4.3 -1 Z', class: 'techo' }); }
    const numero = pieza('text', { y: 8.6, class: 'orden' });
    if (i > 0) { g.addEventListener('click', () => visitar(i)); g.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); visitar(i); } }); }
    return { g, numero };
  });

  const barra = m.el('div', 'fila centro', m.tablero);
  const deshacer = m.el('button', 'boton', barra, 'Deshacer'), borrar = m.el('button', 'boton', barra, 'Borrar ruta'), entregar = m.el('button', 'boton principal', barra, 'Entregar');
  const metros = (d: number) => Math.round(d * 10);

  const pintar = () => {
    camino.setAttribute('points', [0, ...ruta].map((i) => `${puntos[i].x},${puntos[i].y}`).join(' '));
    const completa = ruta.length === casas, ultima = puntos[ruta[ruta.length - 1] ?? 0];
    for (const [k, valor] of Object.entries({ x1: ultima.x, y1: ultima.y, x2: puntos[0].x, y2: puntos[0].y })) vuelta.setAttribute(k, String(valor));
    vuelta.style.display = completa ? '' : 'none';
    marcas.forEach(({ g, numero }, i) => { const puesto = ruta.indexOf(i); g.classList.toggle('visitada', puesto >= 0); numero.textContent = puesto >= 0 ? String(puesto + 1) : ''; });
    entregar.disabled = !completa;
    m.hud.extra(completa ? `${metros(largo(puntos, ruta))} m` : `${ruta.length} de ${casas} casas`);
  };

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    const t = m.reloj(), completa = ruta.length === casas, mia = completa ? largo(puntos, ruta) : 0;
    m.detener();
    if (completa) m.sonido.fanfarria(); else m.sonido.mal();
    c.alTerminar({
      puntaje: completa ? Math.max(0, Math.round((1000 * optimo) / mia) - Math.min(200, Math.max(0, Math.round(t - 30)))) : 0,
      lineas: [['Tu ruta', completa ? `${metros(mia)} m` : 'Sin terminar'], ['Mejor posible', `${metros(optimo)} m`], ['De más', completa ? `${Math.round((mia / optimo - 1) * 100)} %` : '—'], ['Tiempo', mmss(t)]],
      detalle: { ruta, metros: metros(mia), optimo: metros(optimo), seg: Math.round(t) },
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
