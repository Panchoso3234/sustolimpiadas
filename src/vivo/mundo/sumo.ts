import * as THREE from 'three';
import { azar, generador } from '../../nucleo/azar';
import { aspectoAleatorio } from '../../personaje/catalogo';
import type { Kenney } from '../../personaje/kenney';
import { COLOR_EQUIPO } from '../../juegos/arena/motor';
import { crearMando } from '../../juegos/mando';
import type { Contexto, Partida } from '../../juegos/marco';
import { crearEscenario, mmss } from '../../juegos/reflejos/motor';
import { crearMundo, suave, type JuegoMundo, type Lado } from './red';

// Sumo de Balsas en vivo, en el mismo mundo: los dos jugadores y cuatro de máquina sobre la misma balsa que se achica.
// Los de máquina empujan a cualquiera. Puntos: 150 por cada uno que botes, 6 por segundo en pie y 400 si quedas en pie
// al final. La física es la del Sumo individual (motor de arena), escrita sobre un estado que viaja por la red.

const R0 = 9, DURA = 70, ACEL = 46, ROCE = 5.5, VEL = 7.6, IMPULSO = 10, RECARGA = 1.1, RADIO = 0.55, CUERPOS = 6;
interface Cuerpo { x: number; z: number; vx: number; vz: number; vivo: boolean; aturdido: number; recarga: number; embiste: number; cargaGolpe: number; fuerte: number; tocadoPor: number; tocadoEn: number; cayo: number | null; botados: number }
export interface EstadoSumo { semilla: string; nivel: number; t: number; n: number; c: Cuerpo[]; coco: { x: number; z: number } | null; proximo: number; golpes: Record<Lado, number> }
export interface EntradaSumo { x: number; z: number; golpe: number; carga: number }

const radio = (e: EstadoSumo) => Math.max(3.6, R0 - 0.078 * (1 + (e.nivel - 1) * 0.1) * e.t);
const LADOS: Lado[] = ['a', 'b'];
const indice = (l: Lado) => (l === 'a' ? 0 : 1);
const vivos = (e: EstadoSumo) => e.c.filter((x) => x.vivo).length;
const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

export const sumoMundo: JuegoMundo<EstadoSumo, EntradaSumo> = {
  inicial(semilla, nivel) {
    const c = Array.from({ length: CUERPOS }, (_, i) => ({ x: Math.sin(i * 1.047) * 5.6, z: Math.cos(i * 1.047) * 5.6, vx: 0, vz: 0, vivo: true, aturdido: 0, recarga: 0, embiste: 0, cargaGolpe: 0, fuerte: 0, tocadoPor: -1, tocadoEn: -9, cayo: null, botados: 0 }));
    return { semilla, nivel, t: 0, n: 0, c, coco: null, proximo: 8, golpes: { a: 0, b: 0 } };
  },
  quieto: () => ({ x: 0, z: 0, golpe: 0, carga: 0 }),
  paso(e, ent, dt) {
    const azarito = () => azar(e.semilla, 'sumo', e.n++);
    e.t += dt;
    const t = e.t, R = radio(e);
    for (let i = 0; i < CUERPOS; i++) {
      const x = e.c[i];
      if (!x.vivo) continue;
      let ox: number, oz: number, embestir = false, carga = 0.25;
      if (i < 2) {
        // Jugador: va hacia donde apunta su mando; cada golpe nuevo es una embestida
        const lado = LADOS[i], d = ent[lado];
        ox = x.x + d.x * 9; oz = x.z + d.z * 9;
        if (d.golpe > e.golpes[lado]) { e.golpes[lado] = d.golpe; embestir = true; carga = Math.min(0.8, Math.max(0, d.carga)); }
      } else if (Math.hypot(x.x, x.z) > R - 1.7) { ox = 0; oz = 0; } // primero, no caerse
      else {
        let otro: Cuerpo | null = null, dist = Infinity;
        for (const o of e.c) { if (o === x || !o.vivo) continue; const l = Math.hypot(o.x - x.x, o.z - x.z); if (l < dist) { dist = l; otro = o; } }
        ox = otro?.x ?? 0; oz = otro?.z ?? 0;
        embestir = dist < 3.4; carga = 0.2 + (e.nivel - 1) * 0.08 + azarito() * 0.5;
      }
      let dx = ox - x.x, dz = oz - x.z;
      const largo = Math.hypot(dx, dz);
      if (largo > 0.25) { dx /= largo; dz /= largo; } else dx = dz = 0;
      if (t >= x.aturdido) {
        const fuerza = i < 2 ? 1 : 0.86 + (e.nivel - 1) * 0.03;
        x.vx += dx * ACEL * fuerza * dt; x.vz += dz * ACEL * fuerza * dt;
        if (embestir && t >= x.recarga && largo > 0.25) {
          const f = IMPULSO * (1 + carga * 1.6);
          x.vx += dx * f; x.vz += dz * f;
          x.recarga = t + RECARGA; x.embiste = t + 0.35; x.cargaGolpe = carga;
        }
      }
    }
    for (const x of e.c) {
      if (!x.vivo) continue;
      // Cerca del borde la balsa está mojada: se resbala
      const roce = Math.hypot(x.x, x.z) > R - 1.5 ? 0.35 : 1, freno = Math.max(0, 1 - ROCE * roce * dt);
      x.vx *= freno; x.vz *= freno;
      const rapidez = Math.hypot(x.vx, x.vz), tope = VEL * 2.2;
      if (rapidez > tope) { x.vx *= tope / rapidez; x.vz *= tope / rapidez; }
      x.x += x.vx * dt; x.z += x.vz * dt;
    }
    // Choques: se separan y se reparten el golpe según su masa; quien embiste empuja de verdad
    const masa = (x: Cuerpo) => (t < x.fuerte ? 2.2 : 1);
    for (let i = 0; i < CUERPOS; i++) for (let k = i + 1; k < CUERPOS; k++) {
      const p = e.c[i], q = e.c[k];
      if (!p.vivo || !q.vivo) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), junto = RADIO * 2;
      if (d >= junto || d === 0) continue;
      const nx = dx / d, nz = dz / d, mp = masa(p), mq = masa(q), total = mp + mq, sobra = junto - d;
      p.x -= nx * sobra * (mq / total); p.z -= nz * sobra * (mq / total);
      q.x += nx * sobra * (mp / total); q.z += nz * sobra * (mp / total);
      const acerca = (p.vx - q.vx) * nx + (p.vz - q.vz) * nz;
      if (acerca <= 0) continue;
      const j = (1.6 * acerca) / total;
      p.vx -= j * mq * nx; p.vz -= j * mq * nz;
      q.vx += j * mp * nx; q.vz += j * mp * nz;
      p.tocadoPor = k; q.tocadoPor = i; p.tocadoEn = q.tocadoEn = t;
      for (const [golpea, recibe, s] of [[p, q, 1], [q, p, -1]] as const) {
        if (t >= golpea.embiste) continue;
        recibe.vx += nx * s * 9.5; recibe.vz += nz * s * 9.5;
        recibe.aturdido = t + 0.35;
        golpea.embiste = 0;
      }
    }
    // Coco de fuerza: cada 10 s; quien lo toma pesa el doble por 6 s
    if (!e.coco && t >= e.proximo) { const a = azarito() * 6.28, d = azarito() * (R - 2); e.coco = { x: Math.sin(a) * d, z: Math.cos(a) * d }; }
    if (e.coco) { const toma = e.c.find((x) => x.vivo && Math.hypot(x.x - e.coco!.x, x.z - e.coco!.z) < 1); if (toma) { toma.fuerte = t + 6; e.coco = null; e.proximo = t + 10; } }
    // Quien sale de la balsa, cae. Si un jugador lo empujó hace poco, se lo anota
    e.c.forEach((x, i) => {
      if (!x.vivo || Math.hypot(x.x, x.z) <= R + 0.15) return;
      x.vivo = false;
      if (i < 2) x.cayo = t;
      if (t - x.tocadoEn < 2.5 && x.tocadoPor >= 0 && x.tocadoPor < 2 && x.tocadoPor !== i) e.c[x.tocadoPor].botados++;
    });
  },
  terminado: (e) => e.t >= DURA || (!e.c[0].vivo && !e.c[1].vivo) || vivos(e) <= 1,
  resultado(e, lado) {
    const x = e.c[indice(lado)], seg = Math.round(Math.min(x.cayo ?? e.t, DURA)), gano = x.vivo && (vivos(e) <= 1 || e.t >= DURA);
    const puntaje = x.botados * 150 + seg * 6 + (gano ? 400 : 0);
    return { puntaje, lineas: [['Resultado', x.vivo ? 'Quedaste en pie' : `Caíste a los ${seg} s`], ['Botaste', String(x.botados)]], detalle: { botados: x.botados, seg, enPie: x.vivo } };
  },
  valido(x): x is EstadoSumo {
    const e = x as EstadoSumo;
    return !!e && typeof e.semilla === 'string' && num(e.t) && num(e.n) && num(e.nivel) && Array.isArray(e.c) && e.c.length === CUERPOS && e.c.every((o) => o && num(o.x) && num(o.z) && num(o.vx) && num(o.vz) && typeof o.vivo === 'boolean' && num(o.botados))
      && (e.coco === null || (num(e.coco?.x) && num(e.coco?.z))) && !!e.golpes && num(e.golpes.a) && num(e.golpes.b);
  },
  entradaValida(x): x is EntradaSumo { const i = x as EntradaSumo; return !!i && num(i.x) && num(i.z) && Math.abs(i.x) <= 1.5 && Math.abs(i.z) <= 1.5 && Number.isInteger(i.golpe) && num(i.carga); },

  async escena(c, e0, yo) {
    const v = c.vivo!, inclinacion = 0.98;
    const e = crearEscenario(c.caja, { ancho: R0 * 2 + 3, alto: R0 * 2 * Math.sin(inclinacion) + 4.5, centro: [0, 0.6, 0.6], inclinacion, sinPlaya: true });
    e.escena.background = new THREE.Color('#3fa9d6');
    const mando = yo ? crearMando(e, c.caja, 'Embestir') : null;
    const balsa = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 30), new THREE.MeshStandardMaterial({ color: '#b98548', roughness: 0.8, flatShading: true }));
    balsa.position.y = -0.22;
    const coco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: '#ffc93c', emissive: '#ffc93c', emissiveIntensity: 0.5, flatShading: true }));
    e.escena.add(balsa, coco);
    // Cada uno con su personaje; los de máquina, sorteados con la semilla. Aro azul o rojo para los jugadores; el tuyo, más grueso
    const colorDe = (i: number) => (i === 0 ? '#3f8cff' : i === 1 ? '#ef5565' : COLOR_EQUIPO[(i + 1) % COLOR_EQUIPO.length]);
    const figuras: { k: Kenney; aro: THREE.Mesh; x: number; z: number; vivo: boolean }[] = await Promise.all(e0.c.map(async (o, i) => {
      const aspecto = i === 0 ? v.aspectos.a : i === 1 ? v.aspectos.b : aspectoAleatorio(generador(`${e0.semilla}|rival${i}`));
      const k = await e.personaje(aspecto, 1.9), mio = yo !== null && i === indice(yo);
      const aro = new THREE.Mesh(new THREE.RingGeometry(0.5, mio ? 0.86 : i < 2 ? 0.78 : 0.66, 20), new THREE.MeshBasicMaterial({ color: colorDe(i), side: THREE.DoubleSide }));
      aro.rotation.x = -Math.PI / 2;
      e.escena.add(aro);
      return { k, aro, x: o.x, z: o.z, vivo: true };
    }));
    let carga = 0, golpe = 0, cargaSalida = 0, ultimo = performance.now();
    return {
      alCuadro: e.alCuadro,
      entrada() {
        const ahora = performance.now(), dt = Math.min(0.1, (ahora - ultimo) / 1000);
        ultimo = ahora;
        if (!mando) return sumoMundo.quieto();
        // Mantener carga la embestida (hasta 0,8 s); al soltar, sale
        if (mando.pulsada) carga = Math.min(0.8, carga + dt);
        const toque = mando.tomarAccion();
        if (!mando.pulsada && (carga > 0 || toque)) { golpe++; cargaSalida = carga || 0.25; carga = 0; }
        return { x: mando.x, z: mando.z, golpe, carga: cargaSalida };
      },
      dibujar(es, dt) {
        const R = radio(es);
        balsa.scale.set(R, 1, R);
        coco.visible = !!es.coco;
        if (es.coco) { coco.position.set(es.coco.x, 0.5, es.coco.z); coco.rotation.y += dt * 3; }
        es.c.forEach((o, i) => {
          const f = figuras[i], antes = f.x, antesZ = f.z;
          f.x = suave(f.x, o.x, dt); f.z = suave(f.z, o.z, dt);
          if (f.vivo && !o.vivo) { e.chispas(f.x, 0.3, f.z, ['#ffffff', '#9fd8ff'], 18, 4); if (yo && i === indice(yo)) e.sonido.mal(); }
          f.vivo = o.vivo;
          f.k.grupo.visible = f.aro.visible = o.vivo;
          f.k.grupo.position.set(f.x, 0, f.z);
          f.aro.position.set(f.x, 0.06, f.z);
          const vx = (f.x - antes) / Math.max(dt, 1e-3), vz = (f.z - antesZ) / Math.max(dt, 1e-3), rapidez = Math.hypot(vx, vz);
          if (rapidez > 0.8) f.k.grupo.rotation.y = Math.atan2(vx, vz);
          f.k.animar(es.t < o.aturdido ? 'emote-no' : rapidez > 1.2 ? 'sprint' : 'idle');
          f.aro.scale.setScalar(es.t < o.fuerte ? 1.35 : 1);
        });
        if (yo) figuras[indice(yo)].aro.scale.multiplyScalar(1 + carga * 0.7);
        e.hud.tiempo(mmss(DURA - es.t));
        // Los puntos de los dos arriba, para que también los vean los espectadores
        e.hud.extra(`${v.nombres.a} ${sumoMundo.resultado(es, 'a').puntaje} · ${sumoMundo.resultado(es, 'b').puntaje} ${v.nombres.b} · ${vivos(es)} en pie`);
        e.hud.puntos(yo ? sumoMundo.resultado(es, yo).puntaje : 0);
      },
      empezar: () => e.empezar(),
      destruir: () => e.destruir(),
    };
  },
};

export const sumo = (c: Contexto): Promise<Partida> => crearMundo(c, sumoMundo);
