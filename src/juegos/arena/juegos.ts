import * as THREE from 'three';
import type { Contexto, Partida } from '../marco';
import { COLOR_EQUIPO, crearArena, detrasDe, lejos, limitar, type Ente, type Mundo, type Obstaculo, type Orden } from './motor';
import { crearBalsa } from './balsa';
import { OBSTACULOS_GRANJA, acantilado, balon, estadio, granja, type Estadio, type Faro } from './escenarios';

// Los cuatro juegos de arena. Se juegan contra rivales manejados por la máquina (y con compañeros de máquina en los de equipo).

const mat = (color: string, brillo = 0) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, emissive: color, emissiveIntensity: brillo });
const disco = (radio: number, color: string, opacidad = 1) => {
  const d = new THREE.Mesh(new THREE.CircleGeometry(radio, 28), new THREE.MeshBasicMaterial({ color, transparent: opacidad < 1, opacity: opacidad }));
  d.rotation.x = -Math.PI / 2;
  d.position.y = 0.05;
  return d;
};
const cercano = <T extends { x: number; z: number }>(desde: { x: number; z: number }, lista: T[]): T | undefined => {
  let mejor: T | undefined, d = Infinity;
  for (const o of lista) { const l = lejos(desde, o); if (l < d) { d = l; mejor = o; } }
  return mejor;
};
const SOLOS = [0, 1, 2, 3, 4, 5], EQUIPOS = [0, 0, 0, 1, 1, 1];

/** Sumo de Balsas: seis sobre una balsa redonda que se achica. Empuja a los demás al agua y no caigas tú. */
export function sumo(c: Contexto): Promise<Partida> {
  const R0 = 9, DURA = 70, radio = (t: number) => Math.max(3.6, R0 - 0.078 * (1 + (c.nivel - 1) * 0.1) * t);
  let balsa: ReturnType<typeof crearBalsa>, fuerza: { x: number; z: number; malla: THREE.Mesh } | null = null, proximo = 8;
  const vivos = (m: Mundo) => m.entes.filter((x) => x.vivo).length;
  const sobrevive = (m: Mundo, t: number) => m.yo.dato.cayo ?? t;
  const puntaje = (m: Mundo, t: number) => (m.yo.dato.botados ?? 0) * 150 + Math.round(sobrevive(m, t)) * 6 + (m.yo.vivo && (vivos(m) === 1 || t >= DURA) ? 400 : 0);
  return crearArena(c, {
    ancho: R0 * 2, fondo: R0 * 2, radio: R0, suelo: '', cielo: '#3fa9d6', dura: DURA, equipos: SOLOS,
    salida: (i) => [Math.sin(i * 1.047) * 5.6, Math.cos(i * 1.047) * 5.6],
    preparar(m) {
      balsa = crearBalsa(m.e.escena);
    },
    rival(m, x, t): Orden {
      if (Math.hypot(x.x, x.z) > radio(t) - 1.7) return { x: 0, z: 0 }; // primero, no caerse
      const otro = cercano(x, m.entes.filter((o) => o.vivo && o !== x));
      return otro ? { x: otro.x, z: otro.z, embestir: lejos(x, otro) < 3.4, carga: 0.2 + (c.nivel - 1) * 0.08 + m.r() * 0.5 } : { x: 0, z: 0 };
    },
    // Cerca del borde la balsa está mojada: se resbala
    roce: (_m, x, t) => (Math.hypot(x.x, x.z) > radio(t) - 1.5 ? 0.35 : 1),
    paso(m, t) {
      const R = radio(t);
      balsa.actualizar(R, t);
      // Cada 10 segundos aparece un coco de fuerza: quien lo toma pesa el doble por 6 segundos
      if (!fuerza && t >= proximo) {
        const a = m.r() * 6.28, d = m.r() * (R - 2);
        fuerza = { x: Math.sin(a) * d, z: Math.cos(a) * d, malla: new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), mat('#ffc93c', 0.5)) };
        fuerza.malla.position.set(fuerza.x, 0.5, fuerza.z);
        m.e.escena.add(fuerza.malla);
      }
      if (fuerza) {
        fuerza.malla.rotation.y = t * 3;
        const toma = m.entes.find((x) => x.vivo && lejos(x, fuerza!) < 1);
        if (toma) {
          toma.dato.fuerte = t + 6;
          m.e.escena.remove(fuerza.malla);
          fuerza = null;
          proximo = t + 10;
          if (toma === m.yo) { m.e.sonido.efecto('campana', 0.5); m.e.hud.aviso('¡Coco de fuerza!', 'oro', 1); }
        }
      }
      for (const x of m.entes) x.masa = t < (x.dato.fuerte ?? 0) ? 2.2 : 1;
      for (const x of m.entes) {
        if (!x.vivo || Math.hypot(x.x, x.z) <= R + 0.15) continue;
        x.vivo = false;
        m.e.chispas(x.x, 0, x.z, ['#ffffff', '#9fd8ff', '#2a9fd6'], 22, 5); // ¡al agua!
        if (x === m.yo) { x.dato.cayo = t; m.e.sonido.mal(); continue; }
        if (t - x.tocadoEn < 2.5 && x.tocadoPor === m.yo.id) { m.yo.dato.botados = (m.yo.dato.botados ?? 0) + 1; m.e.sonido.bien(); m.e.flotante('+150', x.x, 1.5, x.z, 'oro'); }
      }
    },
    termino: (m) => !m.yo.vivo || vivos(m) <= 1,
    marcador: (m, t) => ({ extra: `${vivos(m)} en pie`, puntos: puntaje(m, t) }),
    resultado: (m, t) => ({
      puntaje: puntaje(m, t),
      lineas: [['Resultado', m.yo.vivo ? 'Último en pie' : `Caíste a los ${Math.round(sobrevive(m, t))} s`], ['Rivales que botaste', String(m.yo.dato.botados ?? 0)], ['Quedaban en pie', String(vivos(m))]],
      detalle: { botados: m.yo.dato.botados ?? 0, seg: Math.round(sobrevive(m, t)), gano: m.yo.vivo },
    }),
  });
}

/** Fuchibol: tres contra tres en un estadio con público. Tú atacas hacia la derecha. Desde la jornada 3, dos postes saltarines en la mitad. */
export function futbol(c: Contexto): Promise<Partida> {
  const ANCHO = 26, FONDO = 15, ARCO = 2.7, DURA = 90, goles = [0, 0];
  let pelota: Ente, propios = 0, quieta = 0, pases = 0, cancha: Estadio;
  const postes: Obstaculo[] = c.nivel >= 3 ? [{ x: 0, z: -4.6, r: 0.45, rebote: 1.5 }, { x: 0, z: 4.6, r: 0.45, rebote: 1.5 }] : [];
  const SITIOS: [number, number][] = [[-3, 0], [-7, -4], [-10, 3]];
  const salida = (i: number, equipo: number): [number, number] => { const [x, z] = SITIOS[i % 3]; return equipo === 0 ? [x, z] : [-x, -z]; };
  const puntaje = () => Math.max(0, goles[0] * 150 - goles[1] * 60 + propios * 100 + (goles[0] > goles[1] ? 250 : goles[0] === goles[1] ? 80 : 0));
  return crearArena(c, {
    ancho: ANCHO, fondo: FONDO, suelo: '#5fb86a', cielo: '#2d6b3a', dura: DURA, equipos: EQUIPOS, salida, sinSuelo: true, obstaculos: postes,
    segunda: {
      etiqueta: 'Pasar',
      // Pase: si estás junto a la pelota, sale hacia el compañero más adelantado (un poco por delante de él)
      accion(m, t) {
        if (lejos(m.yo, pelota) > 1.9) { m.e.hud.aviso('Acércate a la pelota para pasar', '', 0.8); return; }
        const companero = m.entes.filter((o) => o.equipo === 0 && o !== m.yo).sort((a, b) => b.x - a.x)[0];
        if (!companero) return;
        const destino = { x: companero.x + 1.5, z: companero.z }, d = lejos(pelota, destino) || 1;
        pelota.vx = ((destino.x - pelota.x) / d) * 14; pelota.vz = ((destino.z - pelota.z) / d) * 14;
        pelota.tocadoPor = m.yo.id; pelota.tocadoEn = t;
        pases++;
        m.e.sonido.efecto('soltar', 0.5);
      },
    },
    async preparar(m) {
      const bola = balon(0.9);
      bola.position.y = 0.9;
      pelota = m.cosa(0.9, 0.45, bola, 0, 0);
      cancha = await estadio(m, ARCO, [COLOR_EQUIPO[0], COLOR_EQUIPO[1]]);
      for (const p of postes) { const g = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 1.4, 12), mat('#ffb02e', 0.3)); g.position.set(p.x, 0.7, p.z); p.malla = g; m.e.escena.add(g); }
    },
    rival(m, x): Orden {
      const meta = { x: x.equipo === 0 ? ANCHO / 2 : -ANCHO / 2, z: 0 }, cerca = lejos(x, pelota);
      // El tercero de cada equipo cuida el arco, salvo que la pelota le llegue
      if (x.id % 3 === 2 && cerca > 5) return { x: -meta.x * 0.62 + pelota.x * 0.15, z: pelota.z * 0.6 };
      // Solo el más cercano del equipo va a la pelota; el otro se abre para recibir
      const companeros = m.entes.filter((o) => o.equipo === x.equipo && o.id % 3 !== 2);
      const voy = companeros.every((o) => lejos(o, pelota) >= cerca - 0.01);
      if (!voy) return { x: limitar(pelota.x + Math.sign(meta.x) * 4, -ANCHO / 2 + 2, ANCHO / 2 - 2), z: -pelota.z * 0.5 };
      // Pegada a una orilla: se le entra desde adentro, sin empujarla contra la pared
      const orilla = Math.abs(pelota.z) > FONDO / 2 - 2.2;
      const bienPuesto = (pelota.x - x.x) * Math.sign(meta.x) > 0.2;
      if (orilla) return { x: pelota.x - Math.sign(meta.x) * 0.8, z: pelota.z - Math.sign(pelota.z) * 1.1, embestir: bienPuesto && cerca < 2 };
      return { ...(bienPuesto ? { x: pelota.x, z: pelota.z } : detrasDe(pelota, meta, 1.6)), embestir: bienPuesto && cerca < 2.2 + (c.nivel - 1) * 0.2 };
    },
    paso(m, t, dt) {
      // Si la pelota queda casi quieta junto a un borde por 2,5 segundos, se saca hacia el centro
      const junto = Math.abs(pelota.z) > FONDO / 2 - 1.7 || Math.abs(pelota.x) > ANCHO / 2 - 1.7;
      quieta = junto && Math.hypot(pelota.vx, pelota.vz) < 1.2 ? quieta + dt : 0;
      if (quieta > 2.5) {
        quieta = 0;
        pelota.x *= 0.7; pelota.z *= 0.45; pelota.vx = pelota.vz = 0;
        for (const x of m.entes) if (lejos(x, pelota) < 2.6) { const d = lejos(x, pelota) || 1; x.vx += ((x.x - pelota.x) / d) * 6; x.vz += ((x.z - pelota.z) / d) * 6; }
        m.e.hud.aviso('Saque', '', 0.8);
      }
      if (Math.abs(pelota.x) < ANCHO / 2 - pelota.r - 0.02 || Math.abs(pelota.z) > ARCO) return;
      const equipo = pelota.x > 0 ? 0 : 1;
      goles[equipo]++;
      if (equipo === 0 && pelota.tocadoPor === m.yo.id) { propios++; m.e.flotante('¡Gol tuyo! +100', pelota.x, 2, pelota.z, 'oro'); }
      m.e.hud.aviso(equipo === 0 ? '¡GOOOL de tu equipo!' : 'Gol rival', equipo === 0 ? 'oro' : 'mal', 1.4);
      m.e.chispas(pelota.x, 1.5, pelota.z, [COLOR_EQUIPO[equipo], '#ffffff', '#ffd23c'], 60, 8);
      m.e.temblar(0.5);
      cancha.festejar(equipo);
      cancha.marcador(goles[0], goles[1]);
      if (equipo === 0) m.e.sonido.bien(); else m.e.sonido.mal();
      // Saque del medio
      for (const x of [...m.entes, pelota]) { x.vx = x.vz = 0; x.aturdido = t + 0.6; }
      pelota.x = pelota.z = 0;
      m.entes.forEach((x, i) => { [x.x, x.z] = salida(i, x.equipo); });
    },
    marcador: () => ({ extra: `Tu equipo ${goles[0]} · ${goles[1]} Rival`, puntos: puntaje() }),
    resultado: () => ({
      puntaje: puntaje(),
      lineas: [['Marcador', `${goles[0]} a ${goles[1]}`], ['Goles tuyos', String(propios)], ['Pases', String(pases)], ['Resultado', goles[0] > goles[1] ? 'Victoria' : goles[0] === goles[1] ? 'Empate' : 'Derrota']],
      detalle: { favor: goles[0], contra: goles[1], propios, pases },
    }),
  });
}

/** Rey del Faro: de noche, la luz del faro recorre la cancha. Suma quien se mantiene dentro; los demás empujan para sacarte.
 *  La luz se achica con el tiempo y, a ratos, parpadea, se apaga y vuelve a aparecer en otro lado. */
export function faro(c: Contexto): Promise<Partida> {
  const ANCHO = 22, FONDO = 14, DURA = 60, APAGON = 1.4;
  let faroLuz: Faro, f1 = 0, f2 = 0, apagones: number[] = [], saltos = 0;
  const ritmoLuz = 1 + (c.nivel - 1) * 0.08, radio = (t: number) => Math.max(1.6, 2.7 - t * 0.018 * (1 + (c.nivel - 1) * 0.15));
  // Cada apagón hace saltar la luz a otra parte de su recorrido
  const centro = (t: number) => { const salto = apagones.filter((a) => t >= a + APAGON).length * 2.1; return { x: 7.6 * Math.sin(0.33 * ritmoLuz * t + f1 + salto), z: 4.3 * Math.sin(0.47 * ritmoLuz * t + f2 + salto) }; };
  const apagada = (t: number) => apagones.some((a) => t >= a && t < a + APAGON);
  const parpadea = (t: number) => apagones.some((a) => t >= a - 0.7 && t < a);
  const RADIO = 2.7;
  const tiempo = (x: Ente) => x.dato.seg ?? 0;
  const lider = (m: Mundo) => tiempo(m.yo) > 0 && m.entes.every((x) => tiempo(x) <= tiempo(m.yo)); // con 0 s en la luz nadie es rey
  const puntaje = (m: Mundo, fin = false) => Math.round(tiempo(m.yo) * 25) + (fin && lider(m) ? 250 : 0);
  return crearArena(c, {
    ancho: ANCHO, fondo: FONDO, suelo: '#22345a', cielo: '#070b18', dura: DURA, equipos: SOLOS, sinSuelo: true,
    salida: (i) => [(i % 3 - 1) * 6, i < 3 ? -4 : 4],
    async preparar(m) {
      f1 = m.r() * 6.28; f2 = m.r() * 6.28;
      apagones = [12, 24, 36, 48].map((s) => s + (m.r() - 0.5) * 4);
      m.e.escena.traverse((o) => { const l = o as THREE.Light; if (l.isLight) l.intensity *= 0.45; });
      faroLuz = await acantilado(m);
      const p0 = centro(0);
      faroLuz.luz(p0.x, p0.z, radio(0), 1);
      for (const x of m.entes) { x.dato.ox = (m.r() - 0.5) * 2.6; x.dato.oz = (m.r() - 0.5) * 2.6; }
    },
    rival(m, x, t): Orden {
      const p = centro(t), R = radio(t), intruso = cercano(x, m.entes.filter((o) => o !== x && lejos(o, p) < R));
      if (intruso && lejos(x, intruso) < 2 && lejos(x, p) < R + 1) return { x: intruso.x, z: intruso.z, embestir: true };
      return { x: p.x + x.dato.ox, z: p.z + x.dato.oz };
    },
    paso(m, t, dt) {
      const p = centro(t), R = radio(t), oscuro = apagada(t), titila = parpadea(t) && Math.sin(t * 40) > 0;
      faroLuz.luz(p.x, p.z, R, oscuro ? 0 : titila ? 0.35 : 1);
      const rey = m.entes.reduce((a, b) => (tiempo(b) > tiempo(a) ? b : a));
      faroLuz.corona(rey.x, rey.z, tiempo(rey) > 0 && rey.vivo);
      if (oscuro && saltos < apagones.filter((a) => t >= a).length) { saltos++; m.e.hud.aviso('¡Se apagó el faro!', '', 1); }
      if (!oscuro) for (const x of m.entes) if (lejos(x, p) < R) x.dato.seg = tiempo(x) + dt;
    },
    marcador: (m) => ({ extra: `${tiempo(m.yo).toFixed(1)} s en la luz${lider(m) ? ' · vas primero' : ''}`, puntos: puntaje(m) }),
    resultado: (m) => ({
      puntaje: puntaje(m, true),
      lineas: [['Tiempo en la luz', `${tiempo(m.yo).toFixed(1)} s`], ['Mejor rival', `${Math.max(...m.entes.slice(1).map(tiempo)).toFixed(1)} s`], ['Rey del faro', lider(m) ? 'Tú (+250)' : 'Un rival']],
      detalle: { seg: Math.round(tiempo(m.yo) * 10) / 10, gano: lider(m) },
    }),
  });
}

/** Caza del Huevo: huevos al centro; cada equipo los lleva a su nido. Se puede robar del nido ajeno y botar al que lleva uno. */
export function huevo(c: Contexto): Promise<Partida> {
  const ANCHO = 24, FONDO = 15, NIDO = 2.1, DURA = 80, DORADOS = [40, 60];
  interface Huevo { x: number; z: number; estado: 'suelo' | 'lleva' | 'nido'; quien: Ente | null; nido: number; valor: number; malla: THREE.Mesh }
  const huevos: Huevo[] = [], nidoDe = (equipo: number) => ({ x: equipo === 0 ? -10 : 10, z: 0 });
  let entregas = 0, robos = 0, dorados = 0;
  const obstaculos = OBSTACULOS_GRANJA();
  const geo = new THREE.IcosahedronGeometry(0.38, 1);
  const poner = (m: Mundo, x: number, z: number, valor: number) => {
    const malla = new THREE.Mesh(geo, valor > 1 ? mat('#ffc93c', 0.4) : mat('#fff8e6'));
    malla.scale.y = 1.25;
    m.e.escena.add(malla);
    huevos.push({ x, z, estado: 'suelo', quien: null, nido: -1, valor, malla });
  };
  const lleva = (x: Ente) => huevos.find((h) => h.quien === x);
  const puntos = (equipo: number) => huevos.filter((h) => h.estado === 'nido' && h.nido === equipo).reduce((s, h) => s + h.valor, 0);
  const tomar = (h: Huevo, x: Ente) => { h.estado = 'lleva'; h.quien = x; h.nido = -1; };
  const puntaje = (fin = false) => puntos(0) * 70 + entregas * 60 + (fin ? (puntos(0) > puntos(1) ? 250 : puntos(0) === puntos(1) ? 80 : 0) : 0);
  return crearArena(c, {
    ancho: ANCHO, fondo: FONDO, suelo: '#6cc070', cielo: '#2f7a45', dura: DURA, equipos: EQUIPOS, sinSuelo: true, obstaculos,
    salida: (i, equipo) => [(equipo === 0 ? -1 : 1) * 7.5, (i % 3 - 1) * 4],
    async preparar(m) {
      for (const equipo of [0, 1]) { const n = disco(NIDO, COLOR_EQUIPO[equipo], 0.45); n.position.x = nidoDe(equipo).x; m.e.escena.add(n); }
      await granja(m, obstaculos, [COLOR_EQUIPO[0], COLOR_EQUIPO[1]], [nidoDe(0), nidoDe(1)]);
      for (let i = 0; i < 9; i++) { const a = m.r() * 6.28, d = 0.6 + m.r() * 2.2; poner(m, Math.sin(a) * d, Math.cos(a) * d, 1); }
    },
    // Roles de los de máquina: recolector (junta huevos), cazador (persigue a quien lleva uno) y guardián (cuida el nido)
    rival(m, x): Orden {
      if (lleva(x)) return nidoDe(x.equipo);
      const rol = x.id % 3, propio = nidoDe(x.equipo);
      const ladron = cercano(x, m.entes.filter((o) => o.equipo !== x.equipo && lleva(o)));
      if (rol === 2) {
        const intruso = cercano(propio, m.entes.filter((o) => o.equipo !== x.equipo && lejos(o, propio) < 4.5));
        if (intruso) return { x: intruso.x, z: intruso.z, embestir: lejos(x, intruso) < 2.6 };
        return { x: propio.x + (x.equipo === 0 ? 2.6 : -2.6), z: m.yo.z * 0.3 };
      }
      if (ladron && rol === 1 && lejos(x, ladron) < 8 + c.nivel) return { x: ladron.x, z: ladron.z, embestir: lejos(x, ladron) < 2.6 };
      const suelto = cercano(x, huevos.filter((h) => h.estado === 'suelo'));
      if (suelto) return suelto;
      const ajeno = nidoDe(1 - x.equipo);
      return puntos(1 - x.equipo) > 0 ? ajeno : { x: 0, z: (x.id % 3 - 1) * 3 };
    },
    choque(m, a, b, fuerza, t) {
      if (a.equipo < 0 || b.equipo < 0 || a.equipo === b.equipo || fuerza < 3) return;
      // El que lleva un huevo y recibe el golpe de un rival con las manos libres, lo suelta
      for (const [golpeado, otro] of [[a, b], [b, a]]) {
        const h = lleva(golpeado);
        if (!h || lleva(otro)) continue;
        h.estado = 'suelo'; h.quien = null; h.x = golpeado.x; h.z = golpeado.z;
        golpeado.aturdido = t + 0.5;
        golpeado.dato.espera = t + 1;
        if (otro === m.yo) m.e.flotante('¡Lo soltó!', h.x, 2, h.z, 'bien');
      }
    },
    paso(m, t) {
      if (dorados < DORADOS.length && t >= DORADOS[dorados]) { dorados++; poner(m, 0, (m.r() - 0.5) * 4, 3); m.e.hud.aviso('¡Huevo dorado al centro! Vale 3', 'oro', 1.4); m.e.sonido.efecto('campana'); }
      for (const x of m.entes) {
        const h = lleva(x), libre = t >= (x.dato.espera ?? 0) && t >= x.aturdido;
        if (h) {
          if (lejos(x, nidoDe(x.equipo)) > NIDO) continue;
          h.estado = 'nido'; h.quien = null; h.nido = x.equipo;
          h.x = nidoDe(x.equipo).x + (m.r() - 0.5) * 2.4; h.z = (m.r() - 0.5) * 2.4;
          x.dato.espera = t + 0.4;
          if (x === m.yo) { entregas++; m.e.sonido.bien(); m.e.flotante(`+${h.valor}`, x.x, 2.4, x.z, 'oro'); }
          m.e.chispas(h.x, 0.6, h.z, h.valor > 1 ? ['#ffd23c', '#ffffff'] : [COLOR_EQUIPO[x.equipo], '#fff8e6'], h.valor > 1 ? 30 : 10, 4);
          continue;
        }
        if (!libre) continue;
        const suelto = huevos.find((o) => o.estado === 'suelo' && lejos(x, o) < 1);
        if (suelto) { tomar(suelto, x); if (x === m.yo) m.e.sonido.efecto('click'); continue; }
        // Robo: entrar con las manos libres al nido ajeno
        const robado = lejos(x, nidoDe(1 - x.equipo)) < NIDO ? huevos.find((o) => o.estado === 'nido' && o.nido === 1 - x.equipo) : undefined;
        if (robado) { tomar(robado, x); x.dato.espera = t + 0.3; if (x === m.yo) { robos++; m.e.flotante('¡Robado!', x.x, 2.4, x.z, 'bien'); } }
      }
      for (const h of huevos) {
        if (h.quien) { h.x = h.quien.x; h.z = h.quien.z; }
        h.malla.position.set(h.x, h.quien ? 2.5 : 0.45 + (h.estado === 'suelo' ? Math.abs(Math.sin(t * 3 + h.nido + h.x)) * 0.15 : 0), h.z);
        h.malla.rotation.y = t * (h.valor > 1 ? 3 : 0.8);
      }
    },
    marcador: () => ({ extra: `Tu nido ${puntos(0)} · ${puntos(1)} Rival`, puntos: puntaje() }),
    resultado: () => ({
      puntaje: puntaje(true),
      lineas: [['Nidos', `${puntos(0)} a ${puntos(1)}`], ['Huevos que llevaste', String(entregas)], ['Robos', String(robos)], ['Resultado', puntos(0) > puntos(1) ? 'Victoria' : puntos(0) === puntos(1) ? 'Empate' : 'Derrota']],
      detalle: { favor: puntos(0), contra: puntos(1), entregas, robos },
    }),
  });
}
