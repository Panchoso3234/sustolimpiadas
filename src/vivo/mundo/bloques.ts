import type { Contexto, Partida, Resultado } from '../../juegos/marco';
import { crearEscenario, mmss } from '../../juegos/reflejos/motor';
import { ALTO, ANCHO, OCULTAS, basuraPendiente, caerYa, comprimir, descomprimir, guardar, girar, mover, nuevo, paso, recibir, sombra, type Asiento, type Estado, type Pieza } from '../../juegos/arcade/bloquesNucleo';
import { crearControles, crearFondo, crearSonidos, crearTableroVisual } from '../../juegos/arcade/bloquesVista';
import { entre, num, type Lado } from './red';

// TETRIX en vivo, cara a cara: los dos tableros lado a lado (el tuyo a la izquierda) y del mismo tamaño.
// Cada uno juega su tablero en su navegador (sin demora al mover) y manda su estado unas 10 veces por segundo; el rival
// y los espectadores lo dibujan. Las líneas que completas le mandan filas de basura (lápidas) al rival: se cuenta el
// total mandado, así un mensaje perdido no hace perder ataques. Gana quien hace que el otro se llene hasta arriba (KO);
// desde los 2 minutos sube basura a los dos (muerte súbita) y a los 3 minutos gana el mejor puntaje.

const DURA = 180, SUBITA = 120, BONO_KO = 2500;
interface Remoto { tablero: number[]; pieza: Pieza | null; cola: number[]; guardada: number; puntos: number; lineas: number; mandadas: number; pendiente: number; ko: boolean; t: number }

const valido = (d: Record<string, unknown>): boolean =>
  typeof d.s === 'string' && d.s.length === ANCHO * (ALTO - OCULTAS) && /^[.IOTSZJLXC]+$/.test(d.s) && num(d.pts) && entre(d.ln, 0, 9999) && entre(d.m, 0, 99999)
  && entre(d.pe, 0, 999) && typeof d.ko === 'boolean' && num(d.t) && Array.isArray(d.c) && (d.c as unknown[]).length <= 6 && (d.c as unknown[]).every((x) => entre(x, 0, 6)) && entre(d.g, -1, 6)
  && (d.p === null || (Array.isArray(d.p) && d.p.length === 4 && (d.p as unknown[]).every((x) => Number.isInteger(x) && Math.abs(x as number) < 40)));

export async function bloques(c: Contexto): Promise<Partida> {
  const v = c.vivo!, yo: Lado | null = v.rol === 'espectador' ? null : v.rol, rival: Lado = yo === 'b' ? 'a' : 'b';
  const izquierda: Lado = yo ?? 'a', derecha: Lado = izquierda === 'a' ? 'b' : 'a';
  const VIS = ALTO - OCULTAS;
  const e = crearEscenario(c.caja, { ancho: 48, alto: VIS + 4.4, centro: [0, VIS / 2 + 0.9, 0], inclinacion: 0.05, sinPlaya: true });
  const fondo = crearFondo(e, 48);
  const vistas: Record<Lado, ReturnType<typeof crearTableroVisual>> = {
    [izquierda]: crearTableroVisual(e, -12, yo ? `${v.nombres[izquierda]} (tú)` : v.nombres[izquierda]),
    [derecha]: crearTableroVisual(e, 12, v.nombres[derecha]),
  } as Record<Lado, ReturnType<typeof crearTableroVisual>>;
  const sonidos = crearSonidos(e, c.semilla);
  // Mi tablero (los espectadores no juegan): sin especiales ni eventos, para que sea parejo
  const est: Estado | null = yo ? nuevo(c.semilla) : null;
  const remotos: Record<Lado, Remoto | null> = { a: null, b: null };
  let empezado = false, terminado = false, vistas2 = 0, recibidas = 0, ultimaSubita = SUBITA, envio = 0, avisoSubita = false;

  const efectos = (a: Asiento | null) => {
    if (!a || !yo) return;
    if (a.lineas.length) { vistas[yo].lineas(a.lineas); sonidos.lineas(a.lineas.length); fondo.burbujas(a.lineas.length); } else sonidos.asentar();
    if (a.ataque > 0) e.hud.aviso(`¡${a.ataque} ${a.ataque === 1 ? 'lápida' : 'lápidas'} para ${v.nombres[rival]}!${a.texto ? ` · ${a.texto}` : ''}`, 'oro', 1);
    else if (a.texto) e.hud.aviso(a.texto, '', 0.9);
  };
  const actuar = (f: () => unknown) => { if (est && empezado && !terminado && !est.perdio) f(); };
  const controles = yo ? crearControles(e, c.caja, {
    mover: (dx) => actuar(() => { if (mover(est!, dx)) sonidos.mover(); }),
    girar: (d) => actuar(() => { if (girar(est!, d)) sonidos.girar(); }),
    caer: () => actuar(() => { sonidos.caer(); efectos(caerYa(est!)); }),
    guardar: () => actuar(() => { if (guardar(est!)) sonidos.girar(); }),
    hechizo: () => undefined, // en vivo no hay hechizo: es mano a mano
  }) : null;

  const terminar = (porque: 'ko' | 'gane' | 'tiempo') => {
    if (terminado || !est || !yo) return;
    terminado = true;
    const otro = remotos[rival]?.puntos ?? 0;
    // El puntaje refleja al ganador: el KO suma un bono y quien cae no puede quedar sobre lo que el rival ya tenía + el bono
    const puntaje = porque === 'gane' ? est.puntos + BONO_KO : porque === 'ko' ? Math.min(est.puntos, otro + BONO_KO - 1) : est.puntos;
    if (porque === 'ko') { sonidos.mal(); e.hud.aviso('¡KO! Se llenó tu tablero', 'mal', 2.5); vistas[yo].sacudir(); }
    if (porque === 'gane') { e.hud.aviso(`¡KO a ${v.nombres[rival]}! +${BONO_KO}`, 'oro', 2.5); e.sonido.bien(); }
    const r: Resultado = {
      puntaje,
      lineas: [['Resultado', porque === 'gane' ? '¡Ganaste por KO!' : porque === 'ko' ? 'Te dejaron KO' : 'Se acabó el tiempo'], ['Líneas', String(est.lineas)], ['Lápidas mandadas', String(est.mandadas)], ['Cuádruples', String(est.cuadruples)], ['Giros maestros', String(est.maestros)]],
      detalle: { lineas: est.lineas, mandadas: est.mandadas, ko: porque, puntos: est.puntos },
    };
    c.alTerminar(r);
  };

  v.alRecibir((tipo, d, lado) => {
    if (tipo !== 'mundo' || !lado || lado === yo || !valido(d)) return;
    const pieza = d.p ? { t: (d.p as number[])[0], r: (d.p as number[])[1], x: (d.p as number[])[2], y: (d.p as number[])[3], especial: null } : null;
    const tablero = [...Array(ANCHO * OCULTAS).fill(0), ...descomprimir(d.s as string)];
    remotos[lado] = { tablero, pieza: pieza && pieza.t >= 0 && pieza.t <= 6 ? pieza : null, cola: d.c as number[], guardada: d.g as number, puntos: d.pts as number, lineas: d.ln as number, mandadas: d.m as number, pendiente: d.pe as number, ko: d.ko as boolean, t: d.t as number };
    // Los ataques del rival: llega la diferencia con lo que ya recibí (si un mensaje se pierde, llega con el siguiente)
    if (est && lado === rival && !terminado) {
      const nuevas = (d.m as number) - recibidas;
      if (nuevas > 0 && nuevas < 60) { recibir(est, nuevas, recibidas); recibidas = d.m as number; e.sonido.tono(110, 0.2, { tipo: 'square', vol: 0.08 }); }
      if (d.ko) terminar('gane');
    }
  });
  const mandar = () => {
    if (!est || !yo) return;
    const p = est.pieza;
    v.enviar('mundo', { s: comprimir(est), p: p ? [p.t, p.r, p.x, p.y] : null, c: est.cola.slice(0, 5), g: est.guardada, pts: est.puntos, ln: est.lineas, m: est.mandadas, pe: basuraPendiente(est), ko: est.perdio, t: est.tiempo });
  };
  // Los envíos van con su propio reloj (si la pestaña queda atrás, el rival igual ve el tablero)
  const reloj = setInterval(() => { if (empezado && est) { const ahora = performance.now(); if (ahora - envio > (v.directo() ? 90 : 200)) { envio = ahora; mandar(); } } }, 50);

  e.alCuadro((t, dt) => {
    const paso2 = Math.min(dt, 0.05);
    if (empezado && est && !terminado) {
      controles?.tic(paso2);
      efectos(paso(est, paso2, controles?.bajando() ?? false));
      // Muerte súbita: desde los 2 minutos sube una fila de lápidas cada 10 s
      if (est.tiempo >= ultimaSubita) { if (!avisoSubita) { avisoSubita = true; e.hud.aviso('¡Muerte súbita! Sube basura a los dos', 'mal', 2); } ultimaSubita += 10; recibir(est, 1, 1000 + Math.round(est.tiempo), 0); }
      if (est.perdio) terminar('ko');
      else if (est.tiempo >= DURA) terminar('tiempo');
      sonidos.musica(t, est.nivel, true);
    }
    // Dibujo: mi tablero (si juego) y el del rival como llega
    for (const lado of ['a', 'b'] as Lado[]) {
      if (lado === yo && est) vistas[lado].dibujar({ tablero: est.tablero, pieza: est.pieza, sombra: sombra(est), cola: est.cola, guardada: est.guardada, hechizo: 0, hechizoActivo: false, pendiente: basuraPendiente(est), niebla: false, perdio: est.perdio }, t, dt);
      else { const r = remotos[lado]; vistas[lado].dibujar(r ? { tablero: r.tablero, pieza: r.pieza, sombra: null, cola: r.cola, guardada: r.guardada, hechizo: 0, hechizoActivo: false, pendiente: r.pendiente, niebla: false, perdio: r.ko } : { tablero: Array(ANCHO * ALTO).fill(0), pieza: null, sombra: null, cola: [], guardada: -1, hechizo: 0, hechizoActivo: false, pendiente: 0, niebla: false, perdio: false }, t, dt); }
    }
    fondo.avanzar(t, false);
    if (empezado) {
      const ra = yo && est ? est.puntos : remotos.a?.puntos ?? 0, a = yo === 'a' ? ra : remotos.a?.puntos ?? 0, b = yo === 'b' && est ? est.puntos : remotos.b?.puntos ?? 0;
      const tiempo = est ? est.tiempo : Math.max(remotos.a?.t ?? 0, remotos.b?.t ?? 0);
      e.hud.tiempo(mmss(Math.max(0, DURA - tiempo)));
      e.hud.extra(`${v.nombres.a} ${a} · ${b} ${v.nombres.b}${tiempo >= SUBITA ? ' · ¡muerte súbita!' : ''}`);
      e.hud.puntos(yo && est ? est.puntos : 0);
    }
    vistas2++;
  });

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__bloquesVivo = () => ({ yo, mio: est ? { puntos: est.puntos, lineas: est.lineas, mandadas: est.mandadas, perdio: est.perdio, pendiente: basuraPendiente(est), recibidas } : null, rival: remotos[rival] ? { puntos: remotos[rival]!.puntos, mandadas: remotos[rival]!.mandadas, ko: remotos[rival]!.ko } : null, terminado, cuadros: vistas2 });
  // Para pruebas: un piloto que juega solo en vivo (?piloto=1, solo en desarrollo)
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('piloto') && est) {
    const { mejorJugada } = await import('../../juegos/arcade/bloquesIA');
    let cada = 0;
    e.alCuadro((_t, dt) => { cada += dt; if (cada < 0.35 || !empezado || terminado || !est.pieza) return; cada = 0; const m = mejorJugada(est); if (m) { est.pieza = { ...est.pieza, r: m.r, x: m.x }; efectos(caerYa(est)); } });
  }
  return {
    empezar() { e.empezar(); empezado = true; e.hud.aviso(yo ? '¡A tirarle lápidas!' : 'Mirando el duelo', 'oro', 1.2); },
    destruir() { clearInterval(reloj); controles?.destruir(); e.destruir(); },
  };
}
