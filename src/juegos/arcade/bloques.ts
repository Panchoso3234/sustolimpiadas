import type { Contexto, Partida } from '../marco';
import { crearEscenario, mmss } from '../reflejos/motor';
import { mejorJugada } from './bloquesIA';
import { ALTO, OCULTAS, basuraPendiente, caerYa, guardar, girar, hechizar, mover, nuevo, paso, sombra, vaciar, type Asiento, type Estado } from './bloquesNucleo';
import { crearControles, crearFondo, crearSonidos, crearTableroVisual } from './bloquesVista';

// TETRIX, modo individual (también es la ronda del 1v1 diferido): 3 minutos para hacer el mejor puntaje con
// las piezas de la semilla del día. Hay piezas especiales (bomba, calabaza y fantasma), eventos de Halloween que se
// anuncian antes (niebla, viento y lluvia de lápidas), la barra del hechizo (8 s sin gravedad y puntos al doble) y un
// desafío del día con bono.

const DURA = 180;
const EVENTOS: Record<string, string> = { niebla: 'Niebla: no ves arriba', viento: 'Viento: empuja tus piezas', lapidas: 'Lluvia de lápidas' };
const OBJETIVOS: Record<string, (m: number) => string> = { cuadruples: (m) => `haz ${m} cuádruples`, lineas: (m) => `llega a ${m} líneas`, combo: (m) => `encadena un combo ×${m}`, maestros: (m) => `haz ${m} giros maestros` };

export async function crear(c: Contexto): Promise<Partida> {
  const VIS = ALTO - OCULTAS;
  const e = crearEscenario(c.caja, { ancho: 22, alto: VIS + 3.6, centro: [0, VIS / 2 + 0.6, 0], inclinacion: 0.06, sinPlaya: true });
  const fondo = crearFondo(e, 22);
  const vista = crearTableroVisual(e, 0);
  const sonidos = crearSonidos(e, c.semilla);
  const est: Estado = nuevo(c.semilla, { especiales: true, eventos: true, objetivo: true });
  let empezado = false, terminado = false, anuncio: string | null = null, evento: string | null = null, avisoObjetivo = false;

  const efectos = (a: Asiento | null) => {
    if (!a) return;
    if (a.lineas.length) { vista.lineas(a.lineas, a.maestro ? ['#ff7ab8', '#ffffff'] : a.lineas.length >= 4 ? ['#ffe08a', '#ffffff', '#9a6bff'] : undefined); sonidos.lineas(a.lineas.length); fondo.burbujas(a.lineas.length); }
    else sonidos.asentar();
    if (a.bomba) { const p = vista.enMundo(a.bomba.x, a.bomba.y); e.chispas(p.x, p.y, p.z, ['#ff9a2e', '#ffd23c', '#3a3a44'], 40, 6); e.temblar(0.5); e.sonido.ruido(0.3, 0.2); }
    if (a.lineas.length >= 4 || a.maestro) e.temblar(0.4);
    if (a.texto) e.hud.aviso(a.texto, a.lineas.length >= 4 || a.maestro || a.limpio ? 'oro' : '', 1);
  };
  const actuar = (f: () => unknown) => { if (empezado && !terminado && !est.perdio) return f(); return undefined; };
  const controles = crearControles(e, c.caja, {
    mover: (dx) => actuar(() => { if (mover(est, dx)) sonidos.mover(); }),
    girar: (d) => actuar(() => { if (girar(est, d)) sonidos.girar(); }),
    caer: () => actuar(() => { sonidos.caer(); efectos(caerYa(est)); }),
    guardar: () => actuar(() => { if (guardar(est)) sonidos.girar(); }),
    hechizo: () => actuar(() => { if (hechizar(est)) { sonidos.hechizo(); e.hud.aviso('¡Hechizo! 8 s sin gravedad y puntos al doble', 'oro', 1.4); } else if (est.hechizo < 1) e.hud.aviso('El hechizo se carga con líneas', '', 0.8); }),
  });
  // Piloto de prueba (solo en desarrollo)
  const piloto = import.meta.env.DEV && new URLSearchParams(location.search).has('piloto');
  let pilotoEn = 0;
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__bloques = () => ({ puntos: est.puntos, lineas: est.lineas, nivel: est.nivel, perdio: est.perdio, terminado, tiempo: est.tiempo });

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    e.detener();
    if (est.perdio) sonidos.mal();
    c.alTerminar({
      puntaje: est.puntos,
      lineas: [['Líneas', String(est.lineas)], ['Nivel', String(est.nivel)], ['Cuádruples', String(est.cuadruples)], ['Giros maestros', String(est.maestros)], ['Mejor combo', `×${Math.max(0, est.mejorCombo)}`], ['Desafío del día', est.objetivo ? `${OBJETIVOS[est.objetivo.tipo](est.objetivo.meta)}: ${est.objetivo.hecho ? 'cumplido (+1500)' : `${est.objetivo.lleva}/${est.objetivo.meta}`}` : '—'], ['Fin', est.perdio ? 'Se llenó el tablero' : 'Se acabó el tiempo']],
      detalle: { lineas: est.lineas, nivel: est.nivel, cuadruples: est.cuadruples, maestros: est.maestros, combo: est.mejorCombo, piezas: est.piezas, objetivo: !!est.objetivo?.hecho },
    });
  };

  e.hud.tiempo(mmss(c.libre ? 0 : DURA)); e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    const paso2 = Math.min(dt, 0.05);
    if (empezado && !terminado) {
      controles.tic(paso2);
      if (piloto && est.pieza && est.tiempo > pilotoEn) {
        pilotoEn = est.tiempo + 0.12;
        const m = mejorJugada(est);
        if (m && est.pieza) { est.pieza = { ...est.pieza, r: m.r, x: m.x }; efectos(caerYa(est)); }
      }
      efectos(paso(est, paso2, controles.bajando()));
      // Avisos de eventos
      if (est.anuncio && anuncio !== est.anuncio) { anuncio = est.anuncio; e.hud.aviso(`Se viene: ${EVENTOS[est.anuncio]}`, 'mal', 1.6); }
      if (!est.anuncio) anuncio = null;
      if (est.evento !== evento) { evento = est.evento; if (evento === 'lapidas') { e.temblar(0.4); e.sonido.ruido(0.3, 0.15); } }
      if (!avisoObjetivo && est.objetivo && est.tiempo > 1) { avisoObjetivo = true; e.hud.aviso(`Desafío del día: ${OBJETIVOS[est.objetivo.tipo](est.objetivo.meta)}`, 'oro', 2.2); }
      if (c.libre && est.perdio) {
        // Modo libre: el caldero se vacía y se sigue (sin reloj)
        vaciar(est);
        e.hud.aviso('Caldero vacío: ¡sigue!', 'oro', 1.2);
      } else if (est.perdio || (est.tiempo >= DURA && !c.libre)) terminar();
      sonidos.musica(t, est.nivel, !terminado);
      const hech = est.tiempo < est.hechizoHasta ? ` · ✦ ${Math.ceil(est.hechizoHasta - est.tiempo)} s` : est.hechizo >= 1 ? ' · ✦ listo (E)' : ` · ✦ ${Math.round(est.hechizo * 100)} %`;
      const obj = est.objetivo ? ` · desafío ${est.objetivo.hecho ? '✓' : `${est.objetivo.lleva}/${est.objetivo.meta}`}` : '';
      e.hud.tiempo(mmss(c.libre ? est.tiempo : Math.max(0, DURA - est.tiempo)));
      e.hud.extra(`Nivel ${est.nivel} · ${est.lineas} líneas${hech}${obj}`);
      e.hud.puntos(est.puntos);
    }
    vista.dibujar({ tablero: est.tablero, pieza: est.pieza, sombra: sombra(est), cola: est.cola, especialSiguiente: est.especiales[0], guardada: est.guardada, hechizo: est.hechizo, hechizoActivo: est.tiempo < est.hechizoHasta, pendiente: basuraPendiente(est), niebla: est.evento === 'niebla', perdio: est.perdio }, t, dt);
    fondo.avanzar(t, est.tiempo < est.hechizoHasta);
  });

  return {
    empezar() { e.empezar(); empezado = true; e.hud.aviso('¡A encajar!', 'oro', 1); },
    destruir() { controles.destruir(); e.destruir(); },
  };
}
