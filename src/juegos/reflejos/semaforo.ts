import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar } from './motor';
import { crearTiki, type Tiki } from './piezas';

// Semáforo Tiki: diez rondas. Hay que tocar apenas el tiki del centro abre la boca y enciende los ojos en verde.
// Antes aparecen señales falsas (otros colores en el centro, o verde en los tikis chicos): tocar con ellas pierde la ronda.
const RONDAS = 10, PLAZO = 1.0, PAUSA = 1.3, ANTICIPO = 100; // menos de 100 ms no es reflejo, es adivinar
const VERDE = '#39e06a', ROJO = '#ff4b4b', AMARILLO = '#ffd23c', CELESTE = '#4bc8ff', APAGADO = '#2b2118';

interface Falsa { t: number; dura: number; donde: number; color: string }
interface Ronda { espera: number; falsas: Falsa[] }

function programa(semilla: string): Ronda[] {
  const r = generador(semilla);
  return Array.from({ length: RONDAS }, (_, i) => {
    const espera = 1.8 + r() * 3.2, cuantas = Math.min(3, Math.floor(r() * (1.2 + i * 0.35))), falsas: Falsa[] = [];
    for (let k = 0; k < 3; k++) {
      const u = r(), lugar = r(), cuando = r();
      if (k >= cuantas) continue;
      const t = 0.5 + cuando * (espera - 1.3);
      if (i < 2 || lugar >= 0.45) falsas.push({ t, dura: 0.42, donde: 0, color: i < 2 || lugar < 0.75 ? ROJO : u < 0.5 ? AMARILLO : CELESTE });
      else falsas.push({ t, dura: 0.42, donde: u < 0.5 ? 1 : 2, color: VERDE });
    }
    return { espera, falsas };
  });
}

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 16, alto: 10.5, centro: [0, 4, 0], inclinacion: 0.07 });
  const rondas = programa(c.semilla);

  const [k] = await Promise.all([
    e.personaje(c.aspecto, 2.5),
    e.modelo('chest', -3.4, 2.2, 1.1, 0.5, 'pirata'), e.modelo('boat-row-small', 12, -22, 1.5, 2.2, 'pirata'),
    e.modelo('tree_palmTall', -10.5, -5, 12, 0.5), e.modelo('tree_palmBend', 10.8, -6, 12, 3.4), e.modelo('tree_palmDetailedTall', -3, -9, 12.5, 1.8), e.modelo('tree_palmTall', 4.5, -11, 12, 4.4),
    e.modelo('rocks-sand-c', -8.8, -1.5, 1.6, 0.6, 'pirata'), e.modelo('rocks-sand-a', 8.6, 1.5, 0.8, 2.2, 'pirata'),
  ]);
  k.grupo.position.set(3.1, 0, 1.4);
  k.grupo.rotation.y = -0.5;

  const tikis: Tiki[] = [[0, 0, 7.4], [-6, -0.6, 4.2], [6, -0.6, 4.2]].map(([x, z, alto]) => {
    const t = crearTiki();
    t.grupo.position.set(x, 0, z);
    t.grupo.scale.setScalar(alto);
    e.escena.add(t.grupo);
    return t;
  });
  const encender = (t: Tiki, color: string | null, boca = false) => {
    t.ojos.color.set(color ?? APAGADO);
    t.ojos.emissive.set(color ?? '#000000');
    t.boca.scale.y = boca ? 1 : 0.15;
  };

  let puntos = 0, ronda = 0, inicio = 0.8, visto = 0, fase: 'espera' | 'verde' | 'pausa' = 'espera', hasta = 0, terminado = false, empezado = false;
  const tiempos: number[] = []; // ms de cada ronda; -1 si tocó antes, 0 si no alcanzó

  const cerrar = (t: number, ms: number, texto: string, clase: string, gana = 0) => {
    tiempos.push(ms);
    puntos += gana;
    e.hud.puntos(puntos);
    fase = 'pausa';
    hasta = t + PAUSA;
    for (const tiki of tikis) encender(tiki, null);
    e.hud.aviso(texto, clase, PAUSA - 0.15);
    if (gana) { e.sonido.bien(); e.gesto(k, 'emote-yes', 1); } else { e.sonido.mal(); e.gesto(k, 'emote-no', 1); }
  };

  const tocar = (marca: number) => {
    if (terminado || !empezado) return;
    const t = e.reloj();
    if (fase === 'espera' && t >= inicio) return cerrar(t, -1, '¡Antes de tiempo!', 'mal');
    if (fase !== 'verde') return;
    const ms = Math.round(marca - visto);
    if (ms < ANTICIPO) return cerrar(t, -1, '¡Antes de tiempo!', 'mal');
    const gana = limitar(Math.round(140 - ms / 4), 0, 100);
    cerrar(t, ms, `${ms} ms · +${gana}`, gana >= 60 ? 'oro' : 'bien', gana);
  };
  e.escuchar(e.lienzo, 'pointerdown', (ev) => tocar(ev.timeStamp));
  e.escuchar(window, 'keydown', (ev) => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) { ev.preventDefault(); tocar(ev.timeStamp); } });

  const terminar = () => {
    terminado = true;
    e.detener();
    const buenas = tiempos.filter((ms) => ms > 0);
    c.alTerminar({
      puntaje: puntos,
      lineas: [
        ['Rondas logradas', `${buenas.length} de ${RONDAS}`],
        ['Reacción media', buenas.length ? `${Math.round(buenas.reduce((a, b) => a + b, 0) / buenas.length)} ms` : '—'],
        ['Mejor reacción', buenas.length ? `${Math.min(...buenas)} ms` : '—'],
        ['Antes de tiempo', String(tiempos.filter((ms) => ms < 0).length)],
        ['Muy lento', String(tiempos.filter((ms) => ms === 0).length)],
      ],
      detalle: { tiempos },
    });
  };

  if (import.meta.env.DEV) (window as unknown as { __juego: Record<string, unknown> }).__juego.estado = () => ({ fase, ronda });
  e.hud.tiempo(`Ronda 1 de ${RONDAS}`);
  e.hud.puntos(0);

  e.alCuadro((t) => {
    if (terminado || !empezado) return;
    const actual = rondas[ronda];
    if (fase === 'pausa') {
      if (t < hasta) return;
      if (++ronda >= RONDAS) return terminar();
      fase = 'espera';
      inicio = t;
      e.hud.tiempo(`Ronda ${ronda + 1} de ${RONDAS}`);
      return;
    }
    const dentro = t - inicio;
    if (fase === 'espera') {
      // Señales falsas de esta ronda
      for (let i = 0; i < tikis.length; i++) {
        const falsa = actual.falsas.find((f) => f.donde === i && dentro >= f.t && dentro < f.t + f.dura);
        const antes = tikis[i].grupo.userData.falsa as Falsa | undefined;
        if (falsa !== antes) {
          tikis[i].grupo.userData.falsa = falsa;
          encender(tikis[i], falsa?.color ?? null, falsa?.donde !== 0 && !!falsa);
          if (falsa) e.sonido.tono(falsa.donde === 0 ? 660 : 880, 0.14, { tipo: 'triangle', vol: 0.3 });
        }
      }
      if (dentro >= actual.espera) {
        fase = 'verde';
        for (const tiki of tikis) { encender(tiki, null); tiki.grupo.userData.falsa = undefined; }
        encender(tikis[0], VERDE, true);
        e.sonido.tono(880, 0.14, { tipo: 'triangle', vol: 0.3 });
        visto = performance.now();
      }
    } else if (dentro >= actual.espera + PLAZO) cerrar(t, 0, 'Muy lento', 'mal');
    e.hud.puntos(puntos);
  });

  return { empezar() { e.empezar(); empezado = true; }, destruir: e.destruir };
}
