import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, mmss } from './motor';
import { crearCangrejo, crearHoyo, crearTortuga } from './piezas';

// Mata-Cangrejos: nueve hoyos en la arena. Asoman cangrejos (pegarles), tortugas (no pegarles) y, cada tanto,
// un cangrejo dorado que dura poco. Quién asoma, dónde y cuándo sale de la semilla del día.
const DURA = 45, PASO = 3.5, SUBE = 0.14, ABAJO = -1.05, ARRIBA = 0.38;

type Tipo = 'cangrejo' | 'dorado' | 'tortuga';
interface Asomo { t: number; hoyo: number; tipo: Tipo; dura: number; golpe?: number; cerrado?: boolean }

function programa(semilla: string): Asomo[] {
  const r = generador(semilla), lista: Asomo[] = [], libre = new Array<number>(9).fill(0);
  let t = 1.2;
  while (t < DURA - 1) {
    const avance = t / DURA, base = 1.05 - 0.55 * avance, dobles = r() < 0.15 + 0.3 * avance ? 2 : 1;
    for (let i = 0; i < 2; i++) {
      let hoyo = Math.floor(r() * 9);
      const u = r();
      if (i >= dobles) continue;
      for (let k = 0; k < 9 && libre[hoyo] > t; k++) hoyo = (hoyo + 1) % 9;
      if (libre[hoyo] > t) continue;
      const tipo: Tipo = u < 0.05 ? 'dorado' : u < 0.27 + 0.1 * avance ? 'tortuga' : 'cangrejo', dura = tipo === 'dorado' ? base * 0.6 : base;
      lista.push({ t, hoyo, tipo, dura });
      libre[hoyo] = t + dura + SUBE * 2 + 0.35;
    }
    t += 0.75 - 0.4 * avance + r() * 0.2;
  }
  return lista;
}

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: PASO * 2 + 4.6, alto: 12.6, centro: [0, 0.6, -0.2], inclinacion: 0.86 });
  const asomos = programa(c.semilla), totalCangrejos = asomos.filter((a) => a.tipo !== 'tortuga').length;

  const [k] = await Promise.all([
    e.personaje(c.aspecto, 3.4),
    e.modelo('tree_palmTall', -11.5, -8, 9, 0.5), e.modelo('tree_palmBend', 11.5, -8.5, 9, 3.4),
    e.modelo('rocks-sand-a', -10.5, 4.5, 1.2, 0.6, 'pirata'), e.modelo('rocks-sand-b', 8.6, 4.4, 0.7, 2.2, 'pirata'), e.modelo('rocks-sand-c', 10.5, -3, 1.3, 4.1, 'pirata'),
  ]);
  k.grupo.position.set(-8, 0, -1.5);
  k.grupo.rotation.y = 0.75;

  // Cada hoyo tiene sus tres bichos listos y escondidos; así no se crea nada a mitad de partida
  const blancos: THREE.Mesh[] = [], bichos: Record<Tipo, THREE.Group>[] = [];
  const zona = new THREE.Mesh(new THREE.SphereGeometry(1.35, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  for (let i = 0; i < 9; i++) {
    const x = ((i % 3) - 1) * PASO, z = (Math.floor(i / 3) - 1) * PASO, hoyo = crearHoyo();
    hoyo.position.set(x, 0, z);
    const blanco = zona.clone();
    blanco.position.set(x, 0.7, z);
    blanco.userData.hoyo = i;
    blancos.push(blanco);
    const trio = { cangrejo: crearCangrejo(), dorado: crearCangrejo(true), tortuga: crearTortuga() };
    for (const b of Object.values(trio)) { b.position.set(x, ABAJO, z); b.scale.setScalar(1.25); b.visible = false; e.escena.add(b); }
    bichos.push(trio);
    e.escena.add(hoyo, blanco);
  }
  e.lienzo.style.cursor = 'crosshair';

  let puntos = 0, racha = 0, mejorRacha = 0, cazados = 0, dorados = 0, tortugas = 0, sumaReaccion = 0, terminado = false;

  e.escuchar(e.lienzo, 'pointerdown', (ev) => {
    if (terminado) return;
    const t = e.reloj(), toque = e.apuntar(ev).intersectObjects(blancos)[0];
    if (!toque || t <= 0) return;
    const hoyo = toque.object.userData.hoyo as number;
    const a = asomos.find((x) => x.hoyo === hoyo && x.golpe === undefined && t >= x.t && t <= x.t + x.dura + SUBE * 2);
    if (!a) return;
    a.golpe = t;
    const { x, z } = toque.object.position;
    if (a.tipo === 'tortuga') {
      tortugas++; racha = 0;
      puntos = Math.max(0, puntos - 15);
      e.sonido.mal();
      e.flotante('−15', x, 1.8, z, 'mal');
      e.hud.aviso('¡Era una tortuga!', 'mal', 0.7);
      e.gesto(k, 'emote-no', 0.9);
      return;
    }
    racha++; cazados++;
    mejorRacha = Math.max(mejorRacha, racha);
    const reaccion = t - a.t;
    sumaReaccion += reaccion;
    const gana = a.tipo === 'dorado' ? 30 : 10 + Math.round(5 * limitar(1 - reaccion / a.dura, 0, 1)) + Math.min(racha, 10);
    if (a.tipo === 'dorado') dorados++;
    puntos += gana;
    if (!e.sonido.efecto('golpe')) e.sonido.ruido(0.08, 0.25);
    e.sonido.tono(a.tipo === 'dorado' ? 880 : 300 + Math.min(racha, 10) * 30, 0.1, { tipo: 'square', vol: 0.12 });
    e.flotante(`+${gana}`, x, 1.8, z, a.tipo === 'dorado' ? 'oro' : 'bien');
    if (racha % 5 === 0) e.gesto(k, 'emote-yes', 0.9);
  });

  const terminar = () => {
    terminado = true;
    e.detener();
    k.animar('emote-yes');
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Cangrejos', `${cazados} de ${totalCangrejos}`], ['Dorados', String(dorados)], ['Tortugas golpeadas', String(tortugas)], ['Mejor racha', String(mejorRacha)], ['Reacción media', cazados ? `${Math.round((sumaReaccion / cazados) * 1000)} ms` : '—']],
      detalle: { cazados, total: totalCangrejos, dorados, tortugas, racha: mejorRacha, reaccion: cazados ? Math.round((sumaReaccion / cazados) * 1000) : 0 },
    });
  };

  e.hud.tiempo(mmss(DURA));
  e.hud.puntos(0);

  e.alCuadro((t) => {
    if (terminado) return;
    for (const a of asomos) {
      if (a.t > t) break;
      if (a.cerrado) continue;
      const b = bichos[a.hoyo][a.tipo], fin = a.t + SUBE + a.dura + SUBE;
      if (a.golpe !== undefined) {
        // Golpeado: se aplasta y se hunde
        const q = limitar((t - a.golpe) / 0.28, 0, 1);
        b.scale.set(1.25 * (1 + 0.25 * (1 - q)), 1.25 * (0.4 + 0.2 * q), 1.25 * (1 + 0.25 * (1 - q)));
        b.position.y = ARRIBA + (ABAJO - ARRIBA) * q;
        if (q >= 1) { a.cerrado = true; b.visible = false; b.scale.setScalar(1.25); }
        continue;
      }
      if (t >= fin) {
        a.cerrado = true;
        b.visible = false;
        if (a.tipo === 'cangrejo') racha = 0; // se escapó
        continue;
      }
      const sube = limitar((t - a.t) / SUBE, 0, 1), baja = limitar((fin - t) / SUBE, 0, 1), q = Math.min(sube, baja);
      b.visible = true;
      b.position.y = ABAJO + (ARRIBA - ABAJO) * q + Math.sin(t * 9 + a.hoyo) * 0.04;
      b.rotation.y = Math.sin(t * 5 + a.hoyo * 2) * 0.25;
    }
    e.hud.tiempo(mmss(DURA - t));
    e.hud.puntos(puntos);
    e.hud.extra(racha >= 3 ? `racha ${racha}` : '');
    if (t >= DURA) terminar();
  });

  return { empezar: e.empezar, destruir: e.destruir };
}
