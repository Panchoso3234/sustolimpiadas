import { generador } from '../../nucleo/azar';
import { jugadaMaquina, jugarConchas, legales, type Dificultad } from '../../vivo/reglas';
import { tableroConecta4, TURNO } from '../../vivo/tableros/conecta4';
import type { Contexto, Partida } from '../marco';
import { crearMesa } from './mesa';

// CONECTA4 · Desafío: cinco partidas contra la máquina, cada vez más difícil, alternando quién empieza y con una en
// modo Pop Out. La máquina sale de la semilla: los dos rivales de un duelo enfrentan exactamente a la misma.
// Ganar vale según la partida, más un bono por ganar en pocas jugadas; el empate vale algo. Reloj de 15 s por jugada.
const PARTIDAS: { dif: Dificultad; empiezo: boolean; popout: boolean; vale: number }[] = [
  { dif: 'facil', empiezo: true, popout: false, vale: 250 },
  { dif: 'normal', empiezo: false, popout: false, vale: 300 },
  { dif: 'normal', empiezo: true, popout: true, vale: 300 },
  { dif: 'normal', empiezo: false, popout: false, vale: 400 },
  { dif: 'dificil', empiezo: true, popout: false, vale: 500 },
];
const RAPIDEZ = 10, EMPATE = 0.3, PIENSA = 0.6;
const NOMBRE_DIF: Record<Dificultad, string> = { facil: 'fácil', normal: 'normal', dificil: 'difícil' };

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'conecta4', c.aspecto);
  const marcador = m.el('div', 'desafio-marcador', m.tablero), chips = PARTIDAS.map((p, i) => m.el('span', '', marcador, `${i + 1}. ${NOMBRE_DIF[p.dif]}${p.popout ? ' · Pop Out' : ''}`));
  let k = 0, jugadas: number[] = [], plazo = TURNO, piensaHasta = -1, terminado = false, cerrada = false, total = 0, ganadas = 0, empates = 0, repitiendo = -1;
  const resumen: string[] = [];
  let azar = generador(`${c.semilla}|c4|0`);
  const conf = () => PARTIDAS[k % PARTIDAS.length], yo = () => (conf().empiezo ? 1 : 2);
  const jugar = (j: number) => {
    const e = jugarConchas(jugadas, conf().popout);
    if (terminado || cerrada || repitiendo >= 0 || m.reloj() <= 0 || e.turno !== yo() || e.ganador || e.empate || !legales(e.tablero, e.turno, conf().popout).includes(j)) return;
    poner(j);
  };
  const pintar = tableroConecta4(m, jugar);
  const botones = m.el('div', 'fila centro', m.tablero), repetir = m.el('button', 'boton', botones, '⟲ Ver repetición'), seguir = m.el('button', 'boton principal', botones, 'Siguiente partida');
  botones.hidden = true;

  const poner = (j: number) => {
    jugadas = [...jugadas, j];
    plazo = m.reloj() + TURNO;
    m.sonido.toque();
    const e = jugarConchas(jugadas, conf().popout);
    if (e.ganador || e.empate) cerrar(e.ganador === yo() ? 'g' : e.empate ? 'e' : 'p');
    else if (e.turno !== yo()) piensaHasta = m.reloj() + PIENSA;
  };
  const cerrar = (r: 'g' | 'e' | 'p') => {
    cerrada = true;
    const p = conf(), mias = jugadas.filter((_, i) => (i % 2 === 0) === p.empiezo).length;
    const pts = r === 'g' ? p.vale + Math.max(0, 21 - mias) * RAPIDEZ : r === 'e' ? Math.round(p.vale * EMPATE) : 0;
    total += pts;
    if (r === 'g') { ganadas++; m.sonido.bien(); m.hud.aviso(`¡Ganaste en ${mias} jugadas! +${pts}`, 'oro', 2); }
    else if (r === 'e') { empates++; m.hud.aviso(`Empate · +${pts}`, '', 2); }
    else { m.sonido.mal(); m.hud.aviso('Ganó la máquina', 'mal', 2); }
    if (k < PARTIDAS.length) { resumen.push(`${r === 'g' ? 'Ganada' : r === 'e' ? 'Empate' : 'Perdida'} · ${pts}`); chips[k].className = r === 'g' ? 'gano' : r === 'p' ? 'perdio' : ''; }
    botones.hidden = false;
    seguir.textContent = !c.libre && k === PARTIDAS.length - 1 ? 'Ver resultado' : 'Siguiente partida';
    const esta = k;
    m.despues(9, () => { if (k === esta && cerrada && repitiendo < 0) siguiente(); });
  };
  const siguiente = () => {
    if (terminado || !cerrada) return;
    k++;
    if (!c.libre && k >= PARTIDAS.length) return terminar();
    jugadas = []; cerrada = false; botones.hidden = true; repitiendo = -1;
    azar = generador(`${c.semilla}|c4|${k}`);
    plazo = m.reloj() + TURNO;
    piensaHasta = conf().empiezo ? -1 : m.reloj() + PIENSA;
    m.hud.aviso(`Partida ${k + 1}: ${conf().empiezo ? 'empiezas tú' : 'empieza la máquina'}${conf().popout ? ' · Pop Out: se puede sacar una concha propia de abajo' : ''}`, 'oro', conf().popout ? 3.5 : 1.8);
  };
  seguir.addEventListener('click', siguiente);
  repetir.addEventListener('click', () => { if (cerrada) repitiendo = 0; });

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    m.detener();
    c.alTerminar({
      puntaje: total,
      lineas: [['Partidas ganadas', `${ganadas} de ${PARTIDAS.length}`], ['Empates', String(empates)], ...resumen.map((x, i) => [`${i + 1}. ${NOMBRE_DIF[PARTIDAS[i].dif]}${PARTIDAS[i].popout ? ' (Pop Out)' : ''}`, x] as [string, string])],
      detalle: { version: 2, ganadas, empates, partidas: resumen },
    });
  };

  m.hud.tiempo(`${TURNO} s`);
  piensaHasta = conf().empiezo ? -1 : PIENSA;
  m.alTic((t) => {
    if (terminado) return;
    const p = conf(), e = jugarConchas(jugadas, p.popout), fin = !!e.ganador || e.empate;
    // La repetición: una jugada cada 0,35 s
    if (repitiendo >= 0) { repitiendo = Math.min(jugadas.length, repitiendo + 0.29); }
    const vista = repitiendo >= 0 ? jugadas.slice(0, Math.floor(repitiendo)) : jugadas, ev = repitiendo >= 0 ? jugarConchas(vista, p.popout) : e;
    if (repitiendo >= jugadas.length) repitiendo = -1;
    if (!fin && t > 0) {
      if (e.turno !== yo() && piensaHasta >= 0 && t >= piensaHasta) { piensaHasta = -1; poner(jugadaMaquina(jugadas, p.dif, azar, p.popout)); return; }
      // Se acabó tu tiempo: la concha cae sola en la columna libre más central
      if (e.turno === yo() && t >= plazo) { m.hud.aviso('¡Se acabó el tiempo! Jugó el reloj', 'mal', 1.2); poner(legales(e.tablero, e.turno, false)[0] ?? legales(e.tablero, e.turno, p.popout)[0]); return; }
    }
    chips.forEach((ch, i) => ch.classList.toggle('actual', i === k % PARTIDAS.length && !c.libre));
    const miTurno = !fin && e.turno === yo() && t > 0;
    pintar(ev, {
      popout: p.popout, jugadas: vista, yo: yo(), puedo: miTurno && repitiendo < 0, rival: 'La máquina',
      titulo: `Partida ${k + 1}${c.libre ? '' : ` de ${PARTIDAS.length}`} · máquina ${NOMBRE_DIF[p.dif]} · ${p.popout ? 'Pop Out' : 'clásico'} · tú eres ${yo() === 1 ? 'naranja' : 'blanca'}`,
      texto: repitiendo >= 0 ? `Repetición: jugada ${Math.floor(repitiendo)} de ${jugadas.length}` : fin ? (e.empate ? 'Empate: el tablero se llenó.' : e.ganador === yo() ? '¡Ganaste!' : 'Ganó la máquina.') : miTurno ? 'Tu turno' : 'La máquina está pensando…',
    });
    m.hud.tiempo(miTurno ? `${Math.max(0, Math.ceil(plazo - t))} s` : '—');
    m.hud.extra(`Partida ${k + 1}${c.libre ? '' : `/${PARTIDAS.length}`} · ${ganadas} ${ganadas === 1 ? 'ganada' : 'ganadas'}`);
    m.hud.puntos(String(total));
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__conecta4 = { estado: () => ({ k, jugadas: [...jugadas], yo: yo(), popout: conf().popout, total, cerrada, terminado }), jugar, siguiente };
  return { empezar() { m.empezar(); plazo = TURNO; }, destruir: m.destruir };
}
