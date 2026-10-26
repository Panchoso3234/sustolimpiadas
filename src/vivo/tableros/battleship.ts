import { generador } from '../../nucleo/azar';
import type { Mesa } from '../../juegos/tablero/mesa';
import { CASILLAS_FLOTA, FLOTA, LADO, aFlote, esHorizontal, flotaValida, moverBalsa, radar, recibirDisparo, repartirFlota, type Balsa, type Resultado } from '../reglas';
import { entero, otro, type Lado, type Reglas } from '../tablero';

// Battleship en vivo: la batalla naval clásica en un mar de 10 × 10 con cinco balsas (5, 4, 3, 3 y 2).
// Primero cada uno ubica su flota (a mano o al azar); después se dispara por turnos, con reloj. Una vez por batalla
// se puede usar el radar: dice cuántas casillas con balsa hay en un cuadrado de 3 × 3, sin dañarlas.
// La mitad de las batallas son Salvo: disparas tantas veces por turno como balsas te queden a flote.
// shortcut: las flotas viajan en el estado y alguien con la consola podría verlas; la pantalla nunca las muestra
export const UBICAR = 60, TURNO = 20;
const LADOS: Lado[] = ['a', 'b'];
export interface EstadoBattleship { semilla: string; salvo: boolean; flotas: Record<Lado, Balsa[] | null>; tiros: Record<Lado, number[]>; turno: Lado; quedan: number; radar: Record<Lado, { i: number; n: number } | null>; plazo: number }
export interface Tiro { i: number; res: Resultado; hundida?: number[] }

/** Los tiros que recibió una flota, con su resultado (para dibujarlos). */
export const tirosA = (flota: Balsa[], tiros: number[]): Tiro[] => tiros.map((i, k) => { const r = recibirDisparo(flota, tiros.slice(0, k), i); return { i, res: r.resultado, hundida: r.hundida }; });

/** Un mar dibujado: sus casillas son botones. Lo usan el vivo y el desafío. */
export function marBattleship(m: Mesa, padre: HTMLElement, titulo: string, tocar: (i: number) => void) {
  const caja = m.el('div', 'mar-caja', padre), sigla = m.el('div', 'sigla', caja, titulo), mar = m.el('div', 'mar', caja), restan = m.el('div', 'chico', caja), pie = m.el('div', 'chico tenue', caja);
  mar.style.setProperty('--lado', String(LADO));
  const casillas = Array.from({ length: LADO * LADO }, (_, i) => {
    const b = m.el('button', 'agua-c', mar);
    b.setAttribute('aria-label', `Fila ${Math.floor(i / LADO) + 1}, columna ${(i % LADO) + 1}`);
    b.addEventListener('click', () => tocar(i));
    return b;
  });
  /** `barcos`: casillas con balsa a la vista; `elegida`: la balsa que se está moviendo; `puedo`: qué casillas se pueden tocar. */
  return (o: { tiros: Tiro[]; barcos?: Set<number>; elegida?: Set<number>; radar?: { i: number; n: number } | null; puedo: (i: number) => boolean; titulo?: string; pie?: string }) => {
    if (o.titulo) sigla.textContent = o.titulo;
    pie.textContent = o.pie ?? '';
    // Qué balsas siguen a flote en este mar (se sabe por las hundidas, como en el juego de mesa)
    const hundidasLargos = o.tiros.filter((t) => t.hundida).map((t) => t.hundida!.length), quedan = [...FLOTA];
    for (const l of hundidasLargos) { const i = quedan.indexOf(l); if (i >= 0) quedan.splice(i, 1); }
    restan.textContent = quedan.length ? `A flote: ${quedan.map((l) => '■'.repeat(l)).join('  ')}` : 'Flota hundida';
    const hundidas = new Set(o.tiros.flatMap((t) => t.hundida ?? [])), ultimo = o.tiros[o.tiros.length - 1]?.i;
    const zona = o.radar ? new Set([-LADO - 1, -LADO, -LADO + 1, -1, 0, 1, LADO - 1, LADO, LADO + 1].map((d) => o.radar!.i + d).filter((v) => v >= 0 && v < LADO * LADO && Math.abs((v % LADO) - (o.radar!.i % LADO)) <= 1)) : null;
    casillas.forEach((b, i) => {
      const tiro = o.tiros.find((t) => t.i === i);
      b.className = `agua-c${o.barcos?.has(i) ? ' barco' : ''}${o.elegida?.has(i) ? ' elegida' : ''}${tiro ? ` ${tiro.res}` : ''}${hundidas.has(i) ? ' hundido' : ''}${i === ultimo ? ' ultimo' : ''}${zona?.has(i) ? ' radar' : ''}`;
      b.textContent = o.radar && i === o.radar.i ? String(o.radar.n) : '';
      b.disabled = !o.puedo(i);
    });
  };
}

/** Ubicar la flota a mano: toca una balsa para elegirla y después la casilla donde la quieres; Girar la pone de pie o acostada. */
export function ubicador(m: Mesa, padre: HTMLElement, inicial: Balsa[], listo: (f: Balsa[]) => void) {
  let flota = inicial, elegida = -1;
  const fila = m.el('div', 'fila', padre), girar = m.el('button', 'boton', fila, 'Girar'), azar = m.el('button', 'boton', fila, 'Al azar'), ok = m.el('button', 'boton principal', fila, 'Flota lista');
  const ayuda = m.el('p', 'chico tenue', padre, 'Toca una balsa para elegirla y después la casilla donde la quieres. Las balsas no se pueden tocar entre sí (ni en diagonal).');
  const tocar = (i: number) => {
    const k = flota.findIndex((b) => b.casillas.includes(i));
    if (k >= 0) { elegida = k === elegida ? -1 : k; return; }
    if (elegida < 0) return;
    const nueva = moverBalsa(flota, elegida, i, esHorizontal(flota[elegida]));
    if (nueva) flota = nueva; else m.hud.aviso('No cabe ahí', 'mal', 0.9);
  };
  girar.addEventListener('click', () => {
    if (elegida < 0) return void m.hud.aviso('Primero toca una balsa', '', 0.9);
    const nueva = moverBalsa(flota, elegida, Math.min(...flota[elegida].casillas), !esHorizontal(flota[elegida]));
    if (nueva) flota = nueva; else m.hud.aviso('Al girar choca o se sale', 'mal', 0.9);
  });
  azar.addEventListener('click', () => { flota = repartirFlota(); elegida = -1; });
  ok.addEventListener('click', () => listo(flota));
  return {
    tocar,
    flota: () => flota,
    elegida: () => new Set(elegida >= 0 ? flota[elegida].casillas : []),
    mostrar(si: boolean) { fila.hidden = ayuda.hidden = !si; },
  };
}

const flotaAzar = (e: EstadoBattleship, l: Lado) => repartirFlota(generador(`${e.semilla}|flota-${l}`));
/** Cuántos disparos tiene `l` en su turno: uno, o en Salvo tantos como balsas propias a flote. */
const disparosDe = (e: EstadoBattleship, l: Lado) => (e.salvo && e.flotas[l] ? aFlote(e.flotas[l]!, e.tiros[otro(l)]) : 1);
/** Si `l` ya hundió toda la flota del otro. */
const hundio = (e: EstadoBattleship, l: Lado) => !!e.flotas[otro(l)] && e.flotas[otro(l)]!.every((b) => b.casillas.every((k) => e.tiros[l].includes(k)));
const terminada = (e: EstadoBattleship) => LADOS.some((l) => hundio(e, l));
const aciertos = (e: EstadoBattleship, l: Lado) => (e.flotas[otro(l)] ? e.tiros[l].filter((i) => e.flotas[otro(l)]!.some((b) => b.casillas.includes(i))).length : 0);
const empezar = (e: EstadoBattleship, t: number): EstadoBattleship => ({ ...e, turno: 'a', quedan: disparosDe(e, 'a'), plazo: t + TURNO });

function disparar(e: EstadoBattleship, l: Lado, i: number, t: number): EstadoBattleship {
  const tiros = { ...e.tiros, [l]: [...e.tiros[l], i] }, y = { ...e, tiros };
  if (terminada(y)) return { ...y, quedan: 0 };
  const quedan = e.quedan - 1;
  if (quedan > 0) return { ...y, quedan, plazo: t + TURNO };
  const sig = otro(l);
  return { ...y, turno: sig, quedan: disparosDe(y, sig), plazo: t + TURNO };
}

export const battleship: Reglas<EstadoBattleship> = {
  id: 'balsas', nombre: 'Battleship', idea: 'Esconde tus cinco balsas y hunde las del rival por turnos. Con radar, reloj y, a veces, modo Salvo.',
  inicial(semilla) { return { semilla, salvo: generador(`${semilla}|battleship`)() < 0.5, flotas: { a: null, b: null }, tiros: { a: [], b: [] }, turno: 'a', quedan: 0, radar: { a: null, b: null }, plazo: UBICAR }; },
  accion(e, a, lado, t) {
    if (t < 0) return null;
    // Ubicar
    if (!e.flotas.a || !e.flotas.b) {
      if (e.flotas[lado] || !flotaValida(a.flota)) return null;
      const y = { ...e, flotas: { ...e.flotas, [lado]: a.flota as Balsa[] } };
      return y.flotas.a && y.flotas.b ? empezar(y, t) : y;
    }
    if (terminada(e) || lado !== e.turno) return null;
    if (a.radar !== undefined) {
      if (e.radar[lado] || !entero(a.radar, 0, LADO * LADO)) return null;
      return { ...e, radar: { ...e.radar, [lado]: { i: a.radar as number, n: radar(e.flotas[otro(lado)]!, a.radar as number) } } };
    }
    if (!entero(a.i, 0, LADO * LADO) || e.tiros[lado].includes(a.i as number)) return null;
    return disparar(e, lado, a.i as number, t);
  },
  tic(e, t) {
    if (t < e.plazo || terminada(e)) return null;
    // Se acabó el tiempo de ubicar: la flota que falte se reparte sola
    if (!e.flotas.a || !e.flotas.b) return empezar({ ...e, flotas: { a: e.flotas.a ?? flotaAzar(e, 'a'), b: e.flotas.b ?? flotaAzar(e, 'b') } }, t);
    // Se acabó el turno: el reloj dispara a una casilla al azar (de la semilla)
    const libres = [...Array(LADO * LADO).keys()].filter((i) => !e.tiros[e.turno].includes(i));
    return disparar(e, e.turno, libres[Math.floor(generador(`${e.semilla}|${e.turno}|${e.tiros[e.turno].length}`)() * libres.length)], t);
  },
  marcador(e) {
    const fin = terminada(e);
    // Gana quien hunde toda la flota; el resto del puntaje son los aciertos
    return { a: aciertos(e, 'a') + (fin && hundio(e, 'a') ? 100 : 0), b: aciertos(e, 'b') + (fin && hundio(e, 'b') ? 100 : 0), fin };
  },
  valido(x): x is EstadoBattleship {
    const e = x as EstadoBattleship, lista = (v: unknown) => Array.isArray(v) && v.every((i) => entero(i, 0, LADO * LADO));
    return !!e && typeof e.semilla === 'string' && typeof e.salvo === 'boolean' && !!e.flotas && LADOS.every((l) => e.flotas[l] === null || flotaValida(e.flotas[l]))
      && !!e.tiros && LADOS.every((l) => lista(e.tiros[l])) && (e.turno === 'a' || e.turno === 'b') && Number.isInteger(e.quedan) && !!e.radar && typeof e.plazo === 'number';
  },
  dibujar(m, enviar, yo) {
    const estado = m.el('p', 'vivo-turno', m.tablero), mares = m.el('div', 'mares', m.tablero), opciones = m.el('div', 'fila', m.tablero);
    let ultimo: EstadoBattleship | null = null, modoRadar = false;
    const u = ubicador(m, m.tablero, repartirFlota(), (flota) => enviar({ flota }));
    const mio = marBattleship(m, mares, 'Tu mar', (i) => { if (ultimo && yo && !ultimo.flotas[yo]) u.tocar(i); });
    const suyo = marBattleship(m, mares, 'Mar del rival', (i) => { if (modoRadar) { modoRadar = false; enviar({ radar: i }); } else enviar({ i }); });
    const botonRadar = m.el('button', 'boton', opciones, '📡 Usar radar');
    botonRadar.addEventListener('click', () => { modoRadar = !modoRadar; });
    m.el('p', 'chico tenue', m.tablero, `Flota: balsas de ${FLOTA.join(', ')} casillas (${CASILLAS_FLOTA} en total). Las balsas no se tocan entre sí.`);
    return (e, t, nombres) => {
      ultimo = e;
      const ubicando = !e.flotas.a || !e.flotas.b, fin = terminada(e), quedan = Math.max(0, Math.ceil(e.plazo - t));
      const rival: Lado = yo ? otro(yo) : 'b', miLado: Lado = yo ?? 'a', miTurno = !!yo && !ubicando && !fin && e.turno === yo && t >= 0;
      const nombre = (l: Lado) => (l === yo ? 'Tú' : nombres[l]);
      estado.classList.toggle('mio', miTurno || (!!yo && ubicando && !e.flotas[yo]));
      estado.textContent = fin ? `${nombre(hundio(e, 'a') ? 'a' : 'b')} ${hundio(e, miLado) && yo ? 'hundiste' : 'hundió'} toda la flota.`
        : ubicando ? (yo && !e.flotas[yo] ? `Ubica tu flota · ${quedan} s (si no, se reparte sola)` : `Esperando a que ${yo ? 'tu rival' : 'los dos'} ubique su flota · ${quedan} s`)
        : `${e.salvo ? 'Salvo · ' : ''}${miTurno ? `Tu turno: ${e.quedan} ${e.quedan === 1 ? 'disparo' : 'disparos'}` : `Turno de ${nombres[e.turno]}`} · ${quedan} s`;
      u.mostrar(!!yo && ubicando && !e.flotas[yo]);
      const miFlota = yo ? e.flotas[yo] ?? u.flota() : e.flotas.a;
      mio({
        titulo: yo ? 'Tu mar' : `Mar de ${nombres.a}`, tiros: miFlota ? tirosA(miFlota, e.tiros[rival === 'a' && !yo ? 'b' : rival]) : [],
        barcos: new Set(miFlota && (yo || fin) ? miFlota.flatMap((b) => b.casillas) : []), elegida: yo && !e.flotas[yo] ? u.elegida() : undefined,
        radar: e.radar[rival], puedo: () => !!yo && ubicando && !e.flotas[yo], pie: e.radar[rival] ? `${nombre(rival)} usó el radar en tu mar.` : '',
      });
      const suFlota = e.flotas[yo ? rival : 'b'];
      suyo({
        titulo: yo ? 'Mar del rival' : `Mar de ${nombres.b}`, tiros: suFlota ? tirosA(suFlota, e.tiros[yo ?? 'a']) : [],
        barcos: new Set(fin && suFlota ? suFlota.flatMap((b) => b.casillas) : []), radar: e.radar[yo ?? 'a'],
        puedo: (i) => miTurno && !e.tiros[yo!].includes(i), pie: modoRadar ? 'Radar: toca el centro del cuadrado de 3 × 3 que quieres revisar.' : e.radar[miLado] ? `Radar: ${e.radar[miLado]!.n} casillas con balsa alrededor de la marcada.` : '',
      });
      botonRadar.hidden = !miTurno || !!e.radar[yo!];
      botonRadar.classList.toggle('principal', modoRadar);
    };
  },
};
