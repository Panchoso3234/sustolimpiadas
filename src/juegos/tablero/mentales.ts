import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { barajar, crearMesa, mmss } from './mesa';

// Cuatro juegos de mente rápida, fuera de la playa: atención, autocontrol, memoria y cálculo.
// Todo lo que aparece (números, colores, secuencia, cuentas) sale de la semilla: mismo desafío para todos.

/** Cazanúmeros: tocar del 1 al 25 en orden, lo más rápido posible. */
export async function numeros(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'neon', c.aspecto), LIMITE = 60, TOTAL = 25;
  const orden = barajar(Array.from({ length: TOTAL }, (_, i) => i + 1), generador(c.semilla));
  const grilla = m.el('div', 'numeros', m.tablero);
  let sigue = 1, errores = 0, terminado = false;
  const terminar = () => {
    if (terminado) return;
    terminado = true;
    const t = m.reloj(), hechos = sigue - 1;
    m.detener();
    c.alTerminar({
      puntaje: hechos === TOTAL ? Math.max(100, Math.round(1300 - 28 * t - 30 * errores)) : hechos * 4,
      lineas: [['Números', `${hechos} de ${TOTAL}`], ['Errores', String(errores)], ['Tiempo', `${t.toFixed(1)} s`]],
      detalle: { hechos, errores, seg: Math.round(t * 10) / 10 },
    });
  };
  for (const n of orden) {
    const b = m.el('button', 'numero', grilla, String(n));
    b.addEventListener('click', () => {
      if (terminado || m.reloj() <= 0 || b.disabled) return;
      if (n !== sigue) { errores++; m.sonido.mal(); b.classList.add('error'); m.despues(0.25, () => b.classList.remove('error')); return; }
      b.disabled = true;
      sigue++;
      m.sonido.toque();
      if (sigue > TOTAL) terminar();
    });
  }
  m.alTic((t) => {
    m.hud.tiempo(mmss(LIMITE - t));
    m.hud.extra(`Busca el ${Math.min(sigue, TOTAL)}`);
    m.hud.puntos(`${sigue - 1} / ${TOTAL}`);
    if (t >= LIMITE) terminar();
  });
  return { empezar: m.empezar, destruir: m.destruir };
}

const COLORES: [string, string][] = [['Rojo', '#e5484d'], ['Azul', '#3b82f6'], ['Verde', '#30a46c'], ['Amarillo', '#d9a400']];

/** Tinta Tramposa: responder de qué color está pintada la palabra, no lo que dice. */
export async function tinta(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'neon', c.aspecto), r = generador(c.semilla), LIMITE = 45;
  m.el('p', 'tinta-ayuda', m.tablero, '¿De qué color está pintada la palabra?');
  const palabra = m.el('div', 'tinta-palabra', m.tablero), barra = m.el('div', 'tinta-botones', m.tablero);
  let color = 0, puntos = 0, racha = 0, mejor = 0, buenas = 0, malas = 0, terminado = false;
  const nueva = () => {
    color = Math.floor(r() * 4);
    const texto = r() < 0.75 ? (color + 1 + Math.floor(r() * 3)) % 4 : color; // tres de cada cuatro engañan
    palabra.textContent = COLORES[texto][0];
    palabra.style.color = COLORES[color][1];
  };
  const responder = (i: number) => {
    if (terminado || m.reloj() <= 0) return;
    if (i === color) { buenas++; racha++; mejor = Math.max(mejor, racha); puntos += 10 + Math.min(racha, 10); m.sonido.toque(); }
    else { malas++; racha = 0; puntos = Math.max(0, puntos - 8); m.sonido.mal(); }
    nueva();
  };
  COLORES.forEach(([nombre], i) => m.el('button', 'boton grande', barra, `${i + 1} · ${nombre}`).addEventListener('click', () => responder(i)));
  m.escuchar('keydown', (e) => { const i = Number(e.key) - 1; if (i >= 0 && i < 4 && !e.repeat) { e.preventDefault(); responder(i); } });
  nueva();
  m.alTic((t) => {
    m.hud.tiempo(mmss(LIMITE - t));
    m.hud.extra(racha >= 3 ? `racha ${racha}` : '');
    m.hud.puntos(`${puntos} pts`);
    if (t < LIMITE || terminado) return;
    terminado = true;
    m.detener();
    c.alTerminar({ puntaje: puntos, lineas: [['Aciertos', String(buenas)], ['Errores', String(malas)], ['Mejor racha', String(mejor)]], detalle: { buenas, malas, racha: mejor } });
  });
  return { empezar: m.empezar, destruir: m.destruir };
}

/** Eco del Templo: repetir una secuencia de piedras que crece de a una. Un error termina la partida. */
export async function eco(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'templo', c.aspecto), r = generador(c.semilla), MAXIMO = 20, TONOS = [262, 330, 392, 523];
  const secuencia = Array.from({ length: MAXIMO }, () => Math.floor(r() * 4));
  const grilla = m.el('div', 'eco', m.tablero);
  let ronda = 1, paso = 0, mostrando = true, terminado = false, puntos = 0;
  const pads = TONOS.map((_, i) => {
    const b = m.el('button', `eco-pad p${i}`, grilla);
    b.setAttribute('aria-label', `Piedra ${i + 1}`);
    b.addEventListener('click', () => tocar(i));
    return b;
  });
  const brillar = (i: number, seg: number) => { pads[i].classList.add('viva'); m.sonido.tono(TONOS[i], seg); m.despues(seg, () => pads[i].classList.remove('viva')); };
  const mostrar = () => {
    mostrando = true;
    paso = 0;
    const ritmo = Math.max(0.28, 0.55 - ronda * 0.015); // cada ronda va un poco más rápido
    for (let k = 0; k < ronda; k++) m.despues(0.7 + k * ritmo, () => { if (!terminado) brillar(secuencia[k], ritmo * 0.75); });
    m.despues(0.7 + ronda * ritmo, () => { mostrando = false; });
  };
  const terminar = () => {
    terminado = true;
    m.detener();
    c.alTerminar({ puntaje: puntos, lineas: [['Rondas completas', `${ronda - 1} de ${MAXIMO}`], ['Secuencia más larga', String(ronda - 1)]], detalle: { rondas: ronda - 1 } });
  };
  function tocar(i: number) {
    if (terminado || mostrando || m.reloj() <= 0) return;
    brillar(i, 0.2);
    if (i !== secuencia[paso]) { m.sonido.mal(); return terminar(); }
    if (++paso < ronda) return;
    puntos += 10 * ronda;
    if (++ronda > MAXIMO) return terminar();
    mostrar();
  }
  m.alTic(() => { m.hud.tiempo(`Ronda ${Math.min(ronda, MAXIMO)}`); m.hud.extra(mostrando ? 'Mira…' : 'Tu turno'); m.hud.puntos(`${puntos} pts`); });
  return { empezar() { m.empezar(); mostrar(); }, destruir: m.destruir };
}

/** Mercado Relámpago: sumas, restas y multiplicaciones contra el reloj. Cada cuatro cuentas sube la dificultad. */
export async function calculo(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'mercado', c.aspecto), r = generador(c.semilla), LIMITE = 60;
  const cuenta = m.el('div', 'calc-cuenta', m.tablero), visor = m.el('div', 'calc-visor', m.tablero), teclas = m.el('div', 'calc-teclas', m.tablero);
  let hechas = 0, respuesta = 0, escrito = '', puntos = 0, racha = 0, mejor = 0, buenas = 0, malas = 0, terminado = false;
  const pintar = () => { visor.textContent = escrito || '?'; };
  const nueva = () => {
    const nivel = Math.min(4, Math.floor(hechas / 4)), a = 2 + Math.floor(r() * (8 + nivel * 12)), b = 2 + Math.floor(r() * (8 + nivel * 8)), tipo = Math.floor(r() * 3);
    if (tipo === 0) { cuenta.textContent = `${a} + ${b}`; respuesta = a + b; }
    else if (tipo === 1 || nivel === 0) { cuenta.textContent = `${Math.max(a, b)} − ${Math.min(a, b)}`; respuesta = Math.abs(a - b); }
    else { const p = 2 + (a % 8), q = 2 + (b % 9); cuenta.textContent = `${p} × ${q}`; respuesta = p * q; }
    hechas++;
    escrito = '';
    pintar();
  };
  const pulsar = (tecla: string) => {
    if (terminado || m.reloj() <= 0) return;
    if (tecla === 'Backspace') escrito = escrito.slice(0, -1);
    else if (tecla === 'Enter') {
      if (!escrito) return;
      if (Number(escrito) === respuesta) { buenas++; racha++; mejor = Math.max(mejor, racha); puntos += 10 + Math.min(racha, 10) + Math.min(4, Math.floor(hechas / 4)) * 3; m.sonido.bien(); }
      else { malas++; racha = 0; puntos = Math.max(0, puntos - 5); m.sonido.mal(); }
      return nueva();
    } else if (escrito.length < 4) escrito += tecla;
    pintar();
  };
  for (const t of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Backspace', '0', 'Enter']) {
    m.el('button', `tecla${t === 'Enter' ? ' verde' : ''}`, teclas, t === 'Backspace' ? '⌫' : t === 'Enter' ? 'OK' : t).addEventListener('click', () => pulsar(t));
  }
  m.escuchar('keydown', (e) => { if (/^[0-9]$/.test(e.key) || e.key === 'Enter' || e.key === 'Backspace') { e.preventDefault(); pulsar(e.key); } });
  nueva();
  m.alTic((t) => {
    m.hud.tiempo(mmss(LIMITE - t));
    m.hud.extra(racha >= 3 ? `racha ${racha}` : '');
    m.hud.puntos(`${puntos} pts`);
    if (t < LIMITE || terminado) return;
    terminado = true;
    m.detener();
    c.alTerminar({ puntaje: puntos, lineas: [['Correctas', String(buenas)], ['Incorrectas', String(malas)], ['Mejor racha', String(mejor)]], detalle: { buenas, malas, racha: mejor } });
  });
  return { empezar: m.empezar, destruir: m.destruir };
}
