import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, mmss, sombra } from './motor';
import { crearCangrejo, crearCanasta, crearCoco } from './piezas';

// Cocos al Vuelo: el personaje lleva una canasta en la cabeza y corre de lado a lado.
// Lo que cae (y cuándo) sale de la semilla del día, así el desafío es idéntico para todos.
const DURA = 60, ANCHO = 6.5, CIMA = 13.5, TALLA = 3.1, ATRAPA = TALLA + 0.75, V_MAX = 13, VIDAS = 3;
const RADIO_COCO = 1.05, RADIO_CANGREJO = 0.9;

type Tipo = 'coco' | 'dorado' | 'cangrejo';
interface Caida { t: number; llega: number; x: number; v: number; tipo: Tipo; o?: THREE.Object3D; resuelto?: boolean; atrapado?: boolean; fin?: number; lado?: number }

function programa(semilla: string): Caida[] {
  const r = generador(semilla), lista: Caida[] = [];
  let llega = 2.6, x = 0;
  while (llega < DURA) {
    const avance = llega / DURA, v = 6 + 5 * avance, intervalo = 1.05 - 0.6 * avance + r() * 0.25;
    // Cada coco queda al alcance desde el anterior: nunca hay uno imposible
    x = limitar(x + (r() * 2 - 1) * V_MAX * 0.7 * intervalo, -ANCHO, ANCHO);
    const caida = (CIMA - ATRAPA) / v;
    lista.push({ llega, t: llega - caida, x, v, tipo: r() < 0.07 ? 'dorado' : 'coco' });
    const conCangrejo = r() < 0.2 + 0.35 * avance, lado = r() < 0.5 ? -1 : 1, lejos = 1.95 + r() * 1.6, desfase = (r() - 0.5) * 0.3;
    if (conCangrejo) {
      // El cangrejo cae cerca del coco, pero siempre deja un lado libre para atraparlo
      const cx = Math.abs(x + lado * lejos) > ANCHO ? x - lado * lejos : x + lado * lejos;
      lista.push({ llega: llega + desfase, t: llega + desfase - caida, x: cx, v, tipo: 'cangrejo' });
    }
    llega += intervalo;
  }
  return lista.sort((a, b) => a.t - b.t);
}

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: ANCHO * 2 + 3.5, alto: 15, centro: [0, 6.9, 0], inclinacion: 0.05 });
  const caidas = programa(c.semilla), totalCocos = caidas.filter((x) => x.tipo !== 'cangrejo').length;

  const [k] = await Promise.all([
    e.personaje(c.aspecto, TALLA),
    e.modelo('boat-row-large', -13.5, -24, 1.7, 0.7, 'pirata'), e.modelo('barrel', 10.8, -4.2, 1.5, 0.4, 'pirata'),
    e.modelo('tree_palmTall', -6.2, -3.5, 15.5, 0.4), e.modelo('tree_palmBend', 0.5, -5, 15, 2.2), e.modelo('tree_palmDetailedTall', 6.4, -3.8, 15.5, 4),
    e.modelo('tree_palmTall', -12.5, -7, 13, 1.3), e.modelo('tree_palmDetailedTall', 12.8, -7.5, 13.5, 5.2),
    e.modelo('rocks-sand-a', -10.5, -2.5, 2.2, 1, 'pirata'), e.modelo('rocks-sand-b', 9.6, -1.6, 0.9, 2, 'pirata'), e.modelo('rocks-sand-c', 15, -4, 2.6, 3, 'pirata'),
  ]);
  const canasta = crearCanasta(), mancha = sombra(1.1);
  e.escena.add(canasta, mancha);

  const moldes: Record<Tipo, THREE.Group> = { coco: await e.pieza('comida', 'coconut', 1), dorado: crearCoco(true), cangrejo: crearCangrejo() };
  let px = 0, objetivo = 0, tecla = 0, puntos = 0, racha = 0, mejorRacha = 0, vidas = VIDAS, atrapados = 0, dorados = 0, golpes = 0, terminado = false, aturdido = 0;

  // El dedo o el mouse marcan hacia dónde correr; las flechas también sirven
  const apuntarA = (ev: PointerEvent) => {
    const rayo = e.apuntar(ev).ray;
    if (Math.abs(rayo.direction.z) > 0.001) objetivo = limitar(rayo.origin.x + rayo.direction.x * (-rayo.origin.z / rayo.direction.z), -ANCHO, ANCHO);
  };
  e.escuchar(e.lienzo, 'pointermove', apuntarA);
  e.escuchar(e.lienzo, 'pointerdown', apuntarA);
  const DIR: Record<string, number> = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
  e.escuchar(window, 'keydown', (ev) => { if (DIR[ev.key]) { tecla = DIR[ev.key]; ev.preventDefault(); } });
  e.escuchar(window, 'keyup', (ev) => { if (DIR[ev.key] === tecla) { tecla = 0; objetivo = px; } });

  const terminar = (t: number) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    k.animar(vidas > 0 ? 'emote-yes' : 'die', vidas <= 0);
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Cocos atrapados', `${atrapados} de ${totalCocos}`], ['Cocos dorados', String(dorados)], ['Mejor racha', String(mejorRacha)], ['Cangrejazos', String(golpes)]],
      detalle: { atrapados, total: totalCocos, dorados, golpes, racha: mejorRacha, seg: Math.round(t * 10) / 10 },
    });
  };

  e.hud.tiempo(mmss(DURA));
  e.hud.puntos(0);
  e.hud.extra('♥'.repeat(VIDAS));

  e.alCuadro((t, dt) => {
    // Personaje
    if (!terminado) {
      if (tecla) objetivo = limitar(px + tecla * 3, -ANCHO, ANCHO);
      const paso = limitar(objetivo - px, -V_MAX * dt, V_MAX * dt), andando = Math.abs(objetivo - px) > 0.15;
      px += paso;
      if (t < aturdido) k.animar('emote-no');
      else k.animar(andando ? 'sprint' : 'idle');
      k.grupo.rotation.y = andando ? Math.sign(paso) * 1.1 : 0;
    }
    k.grupo.position.x = px;
    canasta.position.set(px, ATRAPA - 0.7, 0);
    mancha.position.x = px;
    if (terminado) return;

    for (const f of caidas) {
      if (f.t > t) break;
      if (f.fin !== undefined && t > f.fin) { if (f.o) { e.escena.remove(f.o); f.o = undefined; } continue; }
      if (f.atrapado) continue;
      if (!f.o) { f.o = moldes[f.tipo].clone(); e.escena.add(f.o); }
      const y = CIMA - f.v * (t - f.t);
      // El momento en que pasa por la canasta decide todo
      if (!f.resuelto && y <= ATRAPA) {
        f.resuelto = true;
        const dx = Math.abs(f.x - px);
        if (f.tipo === 'cangrejo') {
          if (dx < RADIO_CANGREJO) {
            vidas--; golpes++; racha = 0; aturdido = t + 0.5;
            e.sonido.mal();
            e.hud.aviso('¡Cangrejazo!', 'mal', 0.7);
            e.flotante('−1 vida', f.x, ATRAPA + 0.6, 0, 'mal');
            f.atrapado = true; e.escena.remove(f.o); f.o = undefined;
            if (vidas <= 0) return terminar(t);
            continue;
          }
        } else if (dx < RADIO_COCO) {
          racha++; atrapados++;
          mejorRacha = Math.max(mejorRacha, racha);
          const gana = f.tipo === 'dorado' ? 40 : 10 + Math.min(racha, 15);
          if (f.tipo === 'dorado') dorados++;
          puntos += gana;
          e.sonido.tono(f.tipo === 'dorado' ? 880 : 420 + Math.min(racha, 15) * 22, 0.1, { tipo: 'triangle', vol: 0.25 });
          e.sonido.efecto(f.tipo === 'dorado' ? 'campana' : 'suave', 0.5);
          e.flotante(`+${gana}`, f.x, ATRAPA + 0.6, 0, f.tipo === 'dorado' ? 'oro' : 'bien');
          f.atrapado = true; e.escena.remove(f.o); f.o = undefined;
          continue;
        } else racha = 0;
      }
      if (f.tipo === 'cangrejo' && y <= 0) {
        // El que no te pegó se va caminando de lado
        f.fin ??= f.llega + 2.6;
        f.lado ??= f.x >= px ? 1 : -1;
        const piso = f.t + CIMA / f.v;
        f.o.position.set(f.x + f.lado * 5 * (t - piso), Math.abs(Math.sin(t * 16)) * 0.08, 0);
        f.o.rotation.set(0, 0, 0);
      } else if (y <= 0.45) {
        f.fin ??= t + 0.5;
        f.o.position.set(f.x, 0.45, 0);
      } else {
        f.o.position.set(f.x, y, 0);
        if (f.tipo !== 'cangrejo') f.o.rotation.set(t * 3 + f.x, t * 2, 0);
        else f.o.rotation.z = Math.sin(t * 9 + f.x) * 0.35;
      }
    }

    e.hud.tiempo(mmss(DURA - t));
    e.hud.puntos(puntos);
    e.hud.extra(`${'♥'.repeat(vidas)}${'♡'.repeat(VIDAS - vidas)}${racha >= 3 ? `  racha ${racha}` : ''}`);
    if (t >= DURA + 1.2) terminar(t);
  });

  return { empezar: e.empezar, destruir: e.destruir };
}
