import { generador } from '../../nucleo/azar';
import { entero, esLado, type Lado, type Reglas } from '../tablero';

// Eco del Templo en vivo: "Simón dice" de a dos. La secuencia se muestra a todos, la repite A y después B
// (la misma), y entonces crece una piedra. Pierde el primero que se equivoca.
const PIEDRAS = 6, MAXIMO = 20, TONOS = [262, 330, 392, 523, 587, 659];
export interface EstadoEco { semilla: string; largo: number; turno: Lado; paso: number; muestra: number; perdio: Lado | null; aciertos: Record<Lado, number> }
export const secuenciaEco = (semilla: string) => { const r = generador(`${semilla}|eco-vivo`); return Array.from({ length: MAXIMO }, () => Math.floor(r() * PIEDRAS)); };
const ritmo = (largo: number) => Math.max(0.3, 0.55 - largo * 0.015);
export const finMuestra = (e: EstadoEco) => e.muestra + 0.7 + e.largo * ritmo(e.largo);
/** Hasta cuándo puede repetir quien tiene el turno: 4 s más 1 s por piedra. */
export const plazoEco = (e: EstadoEco) => finMuestra(e) + 4 + e.largo;

export const eco: Reglas<EstadoEco> = {
  id: 'eco', nombre: 'Eco del Templo', idea: '"Simón dice" de a dos: la misma secuencia para los dos, y crece. Pierde quien se equivoca primero.',
  inicial(semilla) { return { semilla, largo: 1, turno: 'a', paso: 0, muestra: 0, perdio: null, aciertos: { a: 0, b: 0 } }; },
  accion(e, a, lado, t) {
    if (e.perdio || e.largo > MAXIMO || lado !== e.turno || t < finMuestra(e) || !entero(a.i, 0, PIEDRAS)) return null;
    if (a.i !== secuenciaEco(e.semilla)[e.paso]) return { ...e, perdio: lado };
    const paso = e.paso + 1;
    if (paso < e.largo) return { ...e, paso };
    const aciertos = { ...e.aciertos, [lado]: e.aciertos[lado] + 1 };
    // Terminó su turno: le toca al otro con la misma secuencia, o crece si ya repitieron los dos
    if (lado === 'a') return { ...e, aciertos, turno: 'b', paso: 0, muestra: t + 0.6 };
    if (e.largo >= MAXIMO) return { ...e, aciertos, largo: e.largo + 1 };
    return { ...e, aciertos, turno: 'a', paso: 0, largo: e.largo + 1, muestra: t + 0.6 };
  },
  // Quien no termina de repetir a tiempo pierde: así nadie puede congelar la partida
  tic(e, t) { return !e.perdio && e.largo <= MAXIMO && t >= plazoEco(e) ? { ...e, perdio: e.turno } : null; },
  marcador(e) { return { a: e.aciertos.a * 10 + (e.perdio === 'b' ? 100 : 0), b: e.aciertos.b * 10 + (e.perdio === 'a' ? 100 : 0), fin: !!e.perdio || e.largo > MAXIMO }; },
  valido(x): x is EstadoEco { const e = x as EstadoEco; return !!e && typeof e.semilla === 'string' && entero(e.largo, 1, MAXIMO + 2) && esLado(e.turno) && entero(e.paso, 0, MAXIMO) && typeof e.muestra === 'number' && (e.perdio === null || esLado(e.perdio)) && !!e.aciertos; },
  dibujar(m, enviar, yo) {
    const grilla = m.el('div', 'eco', m.tablero);
    const pads = TONOS.map((_, i) => { const b = m.el('button', `eco-pad p${i}`, grilla); b.setAttribute('aria-label', `Piedra ${i + 1}`); b.addEventListener('click', () => enviar({ i })); return b; });
    let sonado = '';
    return (e, t, nombres) => {
      const sec = secuenciaEco(e.semilla), paso = ritmo(e.largo), k = Math.floor((t - e.muestra - 0.7) / paso), mostrando = t < finMuestra(e);
      pads.forEach((b, i) => b.classList.toggle('viva', mostrando && k >= 0 && k < e.largo && sec[k] === i && (t - e.muestra - 0.7) % paso < paso * 0.75));
      // Cada piedra suena una vez mientras se muestra
      const marca = `${e.muestra}|${k}`;
      if (mostrando && k >= 0 && k < e.largo && marca !== sonado) { sonado = marca; m.sonido.tono(TONOS[sec[k]], paso * 0.7); }
      grilla.classList.toggle('bloqueada', yo !== e.turno || mostrando || !!e.perdio);
      m.hud.tiempo(`Secuencia de ${Math.min(e.largo, MAXIMO)}`);
      const quedan = Math.max(0, Math.ceil(plazoEco(e) - t));
      m.hud.extra(e.perdio ? '' : mostrando ? 'Miren…' : yo === e.turno ? `¡Tu turno! Repítela (${quedan} s)` : `Repite ${nombres[e.turno]} (${quedan} s)`);
      m.hud.puntos(`${nombres.a} ${e.aciertos.a} · ${e.aciertos.b} ${nombres.b}`);
    };
  },
};
