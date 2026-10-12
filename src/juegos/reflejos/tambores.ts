import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, mmss } from './motor';
import { crearTambor } from './piezas';

// Tambores de la Isla: cuatro tambores, cuatro carriles. Las marcas ruedan hacia el aro de cada carril y hay que
// golpear justo cuando llegan. La canción (el patrón de marcas y su melodía) sale de la semilla del día.
const PULSO = 0.625; // 96 pulsos por minuto
const CARRILES = [-4.5, -1.5, 1.5, 4.5], COLORES = ['#ef5565', '#ffb02e', '#3fc79a', '#5a9bff'], GRAVES = [140, 185, 235, 300];
const LEJOS = -24, V = 12, VENTANA = 0.18, ENTRADA = 8, FINAL = 136; // en medios pulsos
const TECLAS: Record<string, number> = { d: 0, f: 1, j: 2, k: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
const ESCALA = [262, 294, 330, 392, 440, 523, 587];

interface Marca { medio: number; carril: number; t: number; o?: THREE.Mesh; juicio?: string }

function cancion(semilla: string): { marcas: Marca[]; melodia: number[] } {
  const r = generador(semilla), marcas: Marca[] = [];
  const melodia = Array.from({ length: 16 }, () => (r() < 0.7 ? Math.floor(r() * ESCALA.length) : -1));
  let previo = -1;
  for (let medio = ENTRADA; medio < FINAL; medio++) {
    const avance = (medio - ENTRADA) / (FINAL - ENTRADA), enPulso = medio % 2 === 0;
    const u = r(), elegido = Math.floor(r() * 4), extra = r();
    if (u >= (enPulso ? 0.7 + 0.25 * avance : 0.08 + 0.42 * avance)) continue;
    const carril = elegido === previo ? (elegido + 1 + Math.floor(extra * 3)) % 4 : elegido;
    previo = carril;
    marcas.push({ medio, carril, t: 0 });
    if (enPulso && extra < 0.03 + 0.1 * avance) marcas.push({ medio, carril: (carril + 2) % 4, t: 0 });
  }
  return { marcas, melodia };
}

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 14.5, alto: 15.5, centro: [0, 0.6, -2.4], inclinacion: 0.56 });
  const { marcas, melodia } = cancion(c.semilla);

  const [k] = await Promise.all([
    e.personaje(c.aspecto, 3.6),
    e.modelo('tree_palmTall', -9.5, -6, 10, 0.5), e.modelo('tree_palmBend', 9.8, -11, 10, 3.2), e.modelo('tree_palmDetailedTall', -10.5, -19, 10.5, 1.8), e.modelo('tree_palmTall', 10.5, -22, 10, 4.4),
    e.modelo('rocks-sand-a', 11.5, -9, 1.2, 0.6, 'pirata'), e.modelo('rocks-sand-b', -8.6, -12, 0.9, 2.2, 'pirata'),
  ]);
  k.grupo.position.set(-8.4, 0, -3.5);
  k.grupo.rotation.y = 0.6;

  const tambores = CARRILES.map((x, i) => {
    const t = crearTambor(COLORES[i]);
    t.grupo.position.set(x, 0, 3.9);
    e.escena.add(t.grupo);
    // Carril y aro donde hay que golpear
    const carril = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 26), new THREE.MeshBasicMaterial({ color: COLORES[i], transparent: true, opacity: 0.16, depthWrite: false }));
    carril.rotation.x = -Math.PI / 2;
    carril.position.set(x, 0.05, -11.6);
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.2, 24), new THREE.MeshBasicMaterial({ color: COLORES[i] }));
    aro.rotation.x = -Math.PI / 2;
    aro.position.set(x, 0.07, 0);
    e.escena.add(carril, aro);
    return { ...t, pulso: 0 };
  });
  const geoMarca = new THREE.CylinderGeometry(0.85, 0.85, 0.32, 14);
  const matMarca = COLORES.map((color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.5, flatShading: true }));

  let puntos = 0, racha = 0, mejorRacha = 0, terminado = false, desfase = 0, fin = Infinity, audioCero = 0, atrasoVisto = 0;
  const ajustar = (d: number) => {
    for (const m of marcas) m.t = d + m.medio * (PULSO / 2);
    fin = d + FINAL * (PULSO / 2) + 1.2;
  };
  const cuenta: Record<string, number> = { Perfecto: 0, Bien: 0, Casi: 0, Falla: 0, 'Al aire': 0 };

  const golpear = (carril: number) => {
    const t = e.reloj();
    if (terminado || t <= 0) return;
    const tambor = tambores[carril];
    tambor.pulso = 1;
    e.sonido.tono(GRAVES[carril], 0.24, { hasta: GRAVES[carril] * 0.55, vol: 0.55 });
    e.sonido.ruido(0.03, 0.12);
    const m = marcas.find((x) => x.carril === carril && !x.juicio && Math.abs(x.t - t) <= VENTANA);
    if (!m) {
      // Golpear sin marca resta: así no sirve aporrear los cuatro tambores
      cuenta['Al aire']++; racha = 0;
      puntos = Math.max(0, puntos - 10);
      e.flotante('al aire −10', CARRILES[carril], 2.6, 3.9, 'mal');
      return;
    }
    const error = Math.abs(m.t - t);
    m.juicio = error <= 0.05 ? 'Perfecto' : error <= 0.1 ? 'Bien' : 'Casi';
    cuenta[m.juicio]++;
    racha++;
    mejorRacha = Math.max(mejorRacha, racha);
    puntos += (m.juicio === 'Perfecto' ? 100 : m.juicio === 'Bien' ? 60 : 25) + Math.min(racha, 20) * 2;
    e.flotante(m.juicio === 'Perfecto' ? '¡Perfecto!' : m.juicio, CARRILES[carril], 2.6, 3.9, m.juicio === 'Perfecto' ? 'oro' : m.juicio === 'Bien' ? 'bien' : '');
    if (m.o) { e.escena.remove(m.o); m.o = undefined; }
  };

  e.escuchar(window, 'keydown', (ev) => {
    const carril = TECLAS[ev.key.toLowerCase()];
    if (carril === undefined || ev.repeat) return;
    ev.preventDefault();
    golpear(carril);
  });
  e.escuchar(e.lienzo, 'pointerdown', (ev) => {
    const p = e.enSuelo(ev);
    if (p) golpear(limitar(Math.round((p.x + 4.5) / 3), 0, 3));
  });

  const terminar = () => {
    terminado = true;
    e.detener();
    k.animar('emote-yes');
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Perfectos', String(cuenta.Perfecto)], ['Buenos', String(cuenta.Bien)], ['Casi', String(cuenta.Casi)], ['Falladas', `${cuenta.Falla} de ${marcas.length}`], ['Golpes al aire', String(cuenta['Al aire'])], ['Mejor racha', String(mejorRacha)]],
      detalle: { perfectos: cuenta.Perfecto, buenos: cuenta.Bien, casi: cuenta.Casi, fallas: cuenta.Falla, aire: cuenta['Al aire'], racha: mejorRacha, total: marcas.length },
    });
  };

  e.hud.puntos(0);
  e.hud.extra('D  F  J  K');

  e.alCuadro((t, dt) => {
    for (const tambor of tambores) {
      tambor.pulso = Math.max(0, tambor.pulso - dt * 5);
      tambor.grupo.scale.set(1 + tambor.pulso * 0.08, 1 - tambor.pulso * 0.12, 1 + tambor.pulso * 0.08);
      tambor.aro.emissiveIntensity = tambor.pulso * 0.9;
    }
    if (terminado || t <= 0) return;
    // El sonido puede tardar unos instantes en arrancar: mientras dura la entrada se mide ese atraso y se corrigen las marcas
    const ctx = e.sonido.ctx;
    if (ctx && t < 2) {
      const atraso = Math.max(0, t - (ctx.currentTime - audioCero));
      if (Math.abs(atraso - atrasoVisto) > 0.004) { atrasoVisto = atraso; ajustar(desfase + atraso); }
    }
    for (const m of marcas) {
      if (m.t - t > -LEJOS / V) break;
      if (m.juicio) continue;
      if (t - m.t > VENTANA) {
        m.juicio = 'Falla';
        cuenta.Falla++; racha = 0;
        if (m.o) { e.escena.remove(m.o); m.o = undefined; }
        continue;
      }
      if (!m.o) { m.o = new THREE.Mesh(geoMarca, matMarca[m.carril]); e.escena.add(m.o); }
      m.o.position.set(CARRILES[m.carril], 0.25, (t - m.t) * V);
    }
    k.animar(racha >= 8 ? 'jump' : 'idle');
    e.hud.tiempo(mmss(fin - t));
    e.hud.puntos(puntos);
    if (t > 3) e.hud.extra(racha >= 3 ? `racha ${racha}` : '');
    if (t >= fin) terminar();
  });

  return {
    empezar() {
      e.empezar();
      const ctx = e.sonido.ctx;
      // Lo que se programa ahora suena un instante después (y un poco más tarde según el equipo de sonido):
      // las marcas se corren esa misma cantidad para que lleguen al aro justo con el pulso que se oye
      desfase = 0.08 + (ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0);
      ajustar(desfase);
      e.hud.aviso('Escucha el pulso…', '', 2.2);
      if (!ctx) return;
      audioCero = ctx.currentTime;
      const cero = audioCero + 0.08;
      for (let medio = 0; medio < FINAL; medio++) {
        const cuando = cero + medio * (PULSO / 2);
        if (medio % 2 === 0) {
          e.sonido.tono(125, 0.2, { hasta: 45, vol: 0.5, cuando });
          if (medio < ENTRADA) e.sonido.tono(1200, 0.05, { tipo: 'square', vol: 0.08, cuando });
          else if (medio % 4 === 2) e.sonido.ruido(0.07, 0.1, cuando);
        } else e.sonido.ruido(0.03, 0.04, cuando);
        const nota = melodia[medio % melodia.length];
        if (medio >= ENTRADA && nota >= 0) e.sonido.tono(ESCALA[nota], 0.22, { tipo: 'triangle', vol: 0.07, cuando });
      }
    },
    destruir: e.destruir,
  };
}
