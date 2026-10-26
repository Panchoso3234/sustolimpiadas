import { generador } from '../../nucleo/azar';
import { CASILLAS_FLOTA, LADO, aFlote, disparoMaquina, radar, recibirDisparo, repartirFlota, type Balsa, type Dificultad } from '../../vivo/reglas';
import { marBattleship, tirosA, ubicador, UBICAR, TURNO } from '../../vivo/tableros/battleship';
import type { Contexto, Partida } from '../marco';
import { crearMesa } from './mesa';

// Battleship · Desafío: tres batallas contra la máquina en un mar de 10 × 10 (la última en modo Salvo).
// La flota de la máquina y su puntería salen de la semilla: los dos rivales de un duelo enfrentan lo mismo.
// Ganar una batalla vale 400, más un bono por hundir en pocos tiros y por cada casilla tuya que quede a flote;
// si pierdes, suman tus aciertos. Una vez por batalla puedes usar el radar. Acertar da otro disparo (también a la máquina).
const BATALLAS: { dif: Dificultad; salvo: boolean }[] = [{ dif: 'normal', salvo: false }, { dif: 'dificil', salvo: false }, { dif: 'dificil', salvo: true }];
const PUNTOS = { gana: 400, porTiro: 8, tirosPar: 65, intacta: 10, acierto: 8 }, PIENSA = 0.45;
const NOMBRE_DIF: Record<Dificultad, string> = { facil: 'fácil', normal: 'normal', dificil: 'difícil' };

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMesa(c.caja, 'battleship', c.aspecto);
  const marcador = m.el('div', 'desafio-marcador', m.tablero), chips = BATALLAS.map((b, i) => m.el('span', '', marcador, `${i + 1}. ${NOMBRE_DIF[b.dif]}${b.salvo ? ' · Salvo' : ''}`));
  const estado = m.el('p', 'vivo-turno', m.tablero), mares = m.el('div', 'mares', m.tablero), opciones = m.el('div', 'fila centro', m.tablero);
  let k = 0, mia: Balsa[] | null = null, suya: Balsa[] = [], misTiros: number[] = [], suyosTiros: number[] = [], miTurno = true, quedan = 1, plazo = UBICAR;
  let usoRadar: { i: number; n: number } | null = null, modoRadar = false, piensaHasta = -1, cerrada = false, terminado = false, total = 0, ganadas = 0;
  const resumen: string[] = [];
  let azar = generador(`${c.semilla}|bs-maq|0`);
  const conf = () => BATALLAS[k % BATALLAS.length];
  const u = ubicador(m, m.tablero, repartirFlota(generador(`${c.semilla}|bs-mia|0`)), (f) => { if (!mia && m.reloj() > 0) empezarBatalla(f); });
  const pintarMio = marBattleship(m, mares, 'Tu mar', (i) => { if (!mia) u.tocar(i); });
  const pintarSuyo = marBattleship(m, mares, 'Mar de la máquina', (i) => disparar(i));
  const botonRadar = m.el('button', 'boton', opciones, '📡 Usar radar'), seguir = m.el('button', 'boton principal', opciones, 'Siguiente batalla');
  botonRadar.addEventListener('click', () => { modoRadar = !modoRadar; });
  seguir.addEventListener('click', () => siguiente());

  const armar = () => {
    suya = repartirFlota(generador(`${c.semilla}|bs-suya|${k}`));
    azar = generador(`${c.semilla}|bs-maq|${k}`);
    mia = null; misTiros = []; suyosTiros = []; usoRadar = null; modoRadar = false; cerrada = false; piensaHasta = -1;
    plazo = m.reloj() + UBICAR;
  };
  const disparosMios = () => (conf().salvo && mia ? aFlote(mia, suyosTiros) : 1);
  const disparosSuyos = () => (conf().salvo ? aFlote(suya, misTiros) : 1);
  function empezarBatalla(f: Balsa[]) {
    mia = f; miTurno = true; quedan = disparosMios(); plazo = m.reloj() + TURNO;
    m.hud.aviso(`¡A la batalla!${conf().salvo ? ` Salvo: ${quedan} disparos por turno` : ''}`, 'oro', 1.4);
  }
  const hundidaToda = (flota: Balsa[], tiros: number[]) => flota.every((b) => b.casillas.every((x) => tiros.includes(x)));
  function disparar(i: number) {
    if (terminado || cerrada || !mia || !miTurno || misTiros.includes(i) || m.reloj() <= 0) return;
    if (modoRadar) { if (usoRadar) return; modoRadar = false; usoRadar = { i, n: radar(suya, i) }; m.sonido.tono(880, 0.2, 'sine', 0.15); return; }
    const r = recibirDisparo(suya, misTiros, i);
    misTiros = [...misTiros, i];
    if (r.resultado === 'agua') m.sonido.toque(); else { m.sonido.bien(); m.hud.aviso(r.resultado === 'hundido' ? '¡Hundida! Disparas otra vez' : '¡Tocado! Disparas otra vez', 'oro', 1); }
    if (r.fin) return cerrar(true);
    if (r.resultado === 'agua' && --quedan <= 0) { miTurno = false; quedan = disparosSuyos(); piensaHasta = m.reloj() + PIENSA; }
    plazo = m.reloj() + TURNO;
  }
  const tiroMaquina = () => {
    const i = disparoMaquina(tirosA(mia!, suyosTiros), conf().dif, azar), r = recibirDisparo(mia!, suyosTiros, i);
    suyosTiros = [...suyosTiros, i];
    if (r.resultado !== 'agua') m.sonido.mal();
    if (r.fin) return cerrar(false);
    if (r.resultado === 'agua' && --quedan <= 0) { miTurno = true; quedan = disparosMios(); plazo = m.reloj() + TURNO; } else piensaHasta = m.reloj() + PIENSA;
  };
  function cerrar(gane: boolean) {
    cerrada = true;
    const intactas = mia!.flatMap((b) => b.casillas).filter((x) => !suyosTiros.includes(x)).length, aciertos = misTiros.filter((x) => suya.some((b) => b.casillas.includes(x))).length;
    const pts = gane ? PUNTOS.gana + Math.max(0, PUNTOS.tirosPar - misTiros.length) * PUNTOS.porTiro + intactas * PUNTOS.intacta : aciertos * PUNTOS.acierto;
    total += pts;
    if (gane) { ganadas++; m.hud.aviso(`¡Hundiste la flota en ${misTiros.length} tiros! +${pts}`, 'oro', 2.2); } else m.hud.aviso(`La máquina hundió tu flota · ${aciertos} aciertos: +${pts}`, 'mal', 2.2);
    if (k < BATALLAS.length) { resumen.push(`${gane ? `Ganada en ${misTiros.length} tiros` : `Perdida, ${aciertos} de ${CASILLAS_FLOTA} aciertos`} · ${pts}`); chips[k].className = gane ? 'gano' : 'perdio'; }
    seguir.textContent = !c.libre && k === BATALLAS.length - 1 ? 'Ver resultado' : 'Siguiente batalla';
    const esta = k;
    m.despues(8, () => { if (k === esta && cerrada) siguiente(); });
  }
  function siguiente() {
    if (terminado || !cerrada) return;
    k++;
    if (!c.libre && k >= BATALLAS.length) return terminar();
    armar();
    m.hud.aviso(`Batalla ${k + 1}${conf().salvo ? ' · Salvo' : ''}: ubica tu flota`, 'oro', 1.8);
  }
  const terminar = () => {
    if (terminado) return;
    terminado = true;
    m.detener();
    c.alTerminar({
      puntaje: total,
      lineas: [['Batallas ganadas', `${ganadas} de ${BATALLAS.length}`], ...resumen.map((x, i) => [`${i + 1}. Máquina ${NOMBRE_DIF[BATALLAS[i].dif]}${BATALLAS[i].salvo ? ' (Salvo)' : ''}`, x] as [string, string])],
      detalle: { version: 1, ganadas, batallas: resumen },
    });
  };

  armar();
  plazo = UBICAR;
  m.alTic((t) => {
    if (terminado) return;
    if (t > 0 && !cerrada) {
      // Se acabó el tiempo de ubicar: la flota queda como está
      if (!mia && t >= plazo) empezarBatalla(u.flota());
      else if (mia && !miTurno && t >= piensaHasta) tiroMaquina();
      // Se acabó tu turno: el reloj dispara a una casilla al azar
      else if (mia && miTurno && t >= plazo) { const libres = [...Array(LADO * LADO).keys()].filter((i) => !misTiros.includes(i)); modoRadar = false; m.hud.aviso('¡Se acabó el tiempo! Disparó el reloj', 'mal', 1); disparar(libres[Math.floor(azar() * libres.length)]); }
    }
    const puedo = !!mia && miTurno && !cerrada && t > 0;
    chips.forEach((ch, i) => ch.classList.toggle('actual', i === k % BATALLAS.length && !c.libre));
    u.mostrar(!mia && !cerrada);
    const resta = Math.max(0, Math.ceil(plazo - t));
    estado.classList.toggle('mio', puedo || !mia);
    estado.textContent = cerrada ? (hundidaToda(suya, misTiros) ? '¡Ganaste la batalla!' : 'La máquina ganó esta batalla.')
      : !mia ? `Batalla ${k + 1}: ubica tu flota y aprieta Flota lista (${resta} s)` : puedo ? `Tu turno: ${quedan} ${quedan === 1 ? 'disparo' : 'disparos'} · ${resta} s` : 'La máquina apunta…';
    const flotaMia = mia ?? u.flota();
    pintarMio({ titulo: 'Tu mar', tiros: tirosA(flotaMia, suyosTiros), barcos: new Set(flotaMia.flatMap((b) => b.casillas)), elegida: mia ? undefined : u.elegida(), puedo: () => !mia && !cerrada });
    pintarSuyo({
      titulo: `Mar de la máquina (${NOMBRE_DIF[conf().dif]})`, tiros: tirosA(suya, misTiros), barcos: new Set(cerrada ? suya.flatMap((b) => b.casillas) : []), radar: usoRadar,
      puedo: (i) => puedo && !misTiros.includes(i), pie: modoRadar ? 'Radar: toca el centro del cuadrado de 3 × 3 que quieres revisar.' : usoRadar ? `Radar: ${usoRadar.n} casillas con balsa alrededor de la marcada.` : '',
    });
    botonRadar.hidden = !puedo || !!usoRadar;
    botonRadar.classList.toggle('principal', modoRadar);
    seguir.hidden = !cerrada;
    m.hud.tiempo(puedo || !mia ? `${resta} s` : '—');
    m.hud.extra(`Batalla ${k + 1}${c.libre ? '' : `/${BATALLAS.length}`}${conf().salvo ? ' · Salvo' : ''} · tiros ${misTiros.length}`);
    m.hud.puntos(String(total));
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__battleship = { estado: () => ({ k, mia: !!mia, miTurno, quedan, misTiros: [...misTiros], suya: suya.map((b) => [...b.casillas]), total, cerrada, terminado }), disparar, listo: () => { if (!mia) empezarBatalla(u.flota()); }, siguiente };
  return { empezar() { m.empezar(); plazo = UBICAR; }, destruir: m.destruir };
}
