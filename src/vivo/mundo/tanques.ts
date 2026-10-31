import * as THREE from 'three';
import { azar } from '../../nucleo/azar';
import { AN, CLASES, COLS, FILAS, FO, R_TANQUE, TABLEROS, celda, centro, chocarMuros as chocarMurosEn, crearBloques, mallaDardo, mallaMina, mallaTanque, montarSala } from '../../juegos/arcade/tanquesPiezas';
import { crearMando } from '../../juegos/mando';
import type { Contexto, Partida } from '../../juegos/marco';
import { crearEscenario, limitar, mmss } from '../../juegos/reflejos/motor';
import { crearMundo, entre, num, suave, suaveAngulo, type JuegoMundo, type Lado } from './red';

// Tanques de Juguete en vivo, en el mismo mundo: los dos jugadores y dos tanques de máquina (que atacan a ambos)
// en el tablero de la tercera oleada. Tres vidas cada uno y tres minutos. Puntos: 1000 por vida que te quede,
// 300 por cada vez que le das al rival y 100 por tanque de máquina: gana quien sigue en pie (o quien tenga más vidas).

const DURA = 180, VIDAS = 3, VEL = 4.2, BALA = 10, RECARGA = 0.28, MAX_BALAS = 5, VUELVE_BOT = 5;
type Quien = 'a' | 'b' | 'gris' | 'verde';
interface Tq { quien: Quien; x: number; z: number; ang: number; mira: number; vivo: boolean; vidas: number; recarga: number; inv: number; vuelve: number; bajas: number; derribos: number; dest: { x: number; z: number } | null }
interface Bala { x: number; z: number; vx: number; vz: number; rebotes: number; de: number }
interface Mina { id: number; x: number; z: number; cuando: number; de: number }
export interface EstadoTanques { semilla: string; nivel: number; t: number; n: number; tq: Tq[]; balas: Bala[]; minas: Mina[]; grilla: string[]; disparos: Record<Lado, number>; puestas: Record<Lado, number>; sig: number }
export interface EntradaTanques { x: number; z: number; mira: number | null; disparo: number; mina: number }

const SALIDAS = [centro(1, 6), centro(COLS - 2, 5), centro(10, 0), centro(9, FILAS - 1)];
const ANGULO_SALIDA = [Math.PI / 2, -Math.PI / 2, Math.PI, 0];
const QUIENES: Quien[] = ['a', 'b', 'gris', 'verde'];
const indice = (l: Lado) => (l === 'a' ? 0 : 1);
const solido = (e: EstadoTanques, cx: number, cz: number) => cx < 0 || cz < 0 || cx >= COLS || cz >= FILAS || e.grilla[cz][cx] !== '.';
const girarHacia = (desde: number, hacia: number, max: number) => { let d = hacia - desde; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return desde + limitar(d, -max, max); };
const aLaVista = (e: EstadoTanques, a: { x: number; z: number }, b: { x: number; z: number }) => {
  const pasos = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3);
  for (let i = 1; i < pasos; i++) if (solido(e, ...celda(a.x + ((b.x - a.x) * i) / pasos, a.z + ((b.z - a.z) * i) / pasos))) return false;
  return true;
};
/** El blanco más cercano de un tanque: los de máquina apuntan a los jugadores; los jugadores, a cualquiera. */
const blancoDe = (e: EstadoTanques, i: number) => {
  const yo = e.tq[i], posibles = e.tq.filter((o, k) => k !== i && o.vivo && (i < 2 || k < 2));
  const vistos = posibles.filter((o) => aLaVista(e, yo, o));
  return (vistos.length ? vistos : posibles).sort((p, q) => Math.hypot(p.x - yo.x, p.z - yo.z) - Math.hypot(q.x - yo.x, q.z - yo.z))[0];
};
export const puntaje = (e: EstadoTanques, l: Lado) => { const x = e.tq[indice(l)]; return x.vidas * 1000 + x.derribos * 300 + x.bajas * 100; };

export const tanquesMundo: JuegoMundo<EstadoTanques, EntradaTanques> = {
  inicial(semilla, nivel) {
    const tq = QUIENES.map((quien, i): Tq => ({ quien, x: SALIDAS[i].x, z: SALIDAS[i].z, ang: ANGULO_SALIDA[i], mira: ANGULO_SALIDA[i], vivo: true, vidas: i < 2 ? VIDAS : 1, recarga: i < 2 ? 0 : 2 + azar(semilla, 'tq', i) * 2, inv: 0, vuelve: 0, bajas: 0, derribos: 0, dest: null }));
    return { semilla, nivel, t: 0, n: 0, tq, balas: [], minas: [], grilla: [...TABLEROS[2]], disparos: { a: 0, b: 0 }, puestas: { a: 0, b: 0 }, sig: 0 };
  },
  quieto: () => ({ x: 0, z: 0, mira: null, disparo: 0, mina: 0 }),
  tiempo: (e) => e.t,
  paso(e, ent, dt) {
    const azarito = () => azar(e.semilla, 'tanques', e.n++);
    e.t += dt;
    const t = e.t, romper = (cx: number, cz: number) => { if (cx < 0 || cz < 0 || cx >= COLS || cz >= FILAS || e.grilla[cz][cx] !== 'c') return false; e.grilla[cz] = e.grilla[cz].slice(0, cx) + '.' + e.grilla[cz].slice(cx + 1); return true; };
    const chocarMuros = (q: Tq) => chocarMurosEn(q, (cx, cz) => solido(e, cx, cz));
    const disparar = (i: number) => {
      const q = e.tq[i], datos = i < 2 ? { bala: BALA, rebotes: 1 } : CLASES[q.quien as 'gris' | 'verde'];
      if (e.balas.filter((b) => b.de === i).length >= (i < 2 ? MAX_BALAS : 2)) return;
      const dx = Math.sin(q.mira), dz = Math.cos(q.mira), x = q.x + dx * 0.8, z = q.z + dz * 0.8;
      if (solido(e, ...celda(x, z))) return;
      e.balas.push({ x, z, vx: dx * datos.bala, vz: dz * datos.bala, rebotes: datos.rebotes, de: i });
      q.recarga = t + (i < 2 ? RECARGA : (CLASES[q.quien as 'gris' | 'verde'].cada / (1 + (e.nivel - 1) * 0.12)) * (0.8 + azarito() * 0.4));
    };
    /** Un tanque recibe un golpe; `de` es quien lo causó (o -1). */
    const golpear = (k: number, de: number) => {
      const q = e.tq[k];
      if (!q.vivo || (k < 2 && t < q.inv)) return;
      q.vivo = false;
      q.vidas = Math.max(0, q.vidas - (k < 2 ? 1 : 0));
      q.vuelve = t + (k < 2 ? 1 : VUELVE_BOT);
      if (de >= 0 && de < 2 && de !== k) { if (k < 2) e.tq[de].derribos++; else e.tq[de].bajas++; }
    };
    // Reaparecen: los jugadores (si les quedan vidas) en su salida, con 2 s de escudo; los de máquina, más tarde
    e.tq.forEach((q, i) => {
      if (q.vivo || t < q.vuelve || (i < 2 && q.vidas <= 0)) return;
      Object.assign(q, { vivo: true, x: SALIDAS[i].x, z: SALIDAS[i].z, ang: ANGULO_SALIDA[i], mira: ANGULO_SALIDA[i], inv: t + 2, dest: null, recarga: t + (i < 2 ? 0 : 1.5) });
    });
    // Jugadores: mover, apuntar, disparar y dejar minas
    (['a', 'b'] as Lado[]).forEach((l) => {
      const i = indice(l), q = e.tq[i], d = ent[l];
      if (!q.vivo) { e.disparos[l] = Math.max(e.disparos[l], d.disparo); e.puestas[l] = Math.max(e.puestas[l], d.mina); return; }
      const largo = Math.hypot(d.x, d.z);
      if (largo > 0.15) {
        q.ang = girarHacia(q.ang, Math.atan2(d.x, d.z), 9 * dt);
        q.x += (d.x / Math.max(1, largo)) * VEL * dt; q.z += (d.z / Math.max(1, largo)) * VEL * dt;
        chocarMuros(q);
      }
      const blanco = blancoDe(e, i);
      q.mira = d.mira ?? (blanco ? Math.atan2(blanco.x - q.x, blanco.z - q.z) : q.ang);
      if (d.disparo > e.disparos[l]) { e.disparos[l] = d.disparo; if (t > q.recarga) disparar(i); }
      if (d.mina > e.puestas[l]) { e.puestas[l] = d.mina; if (e.minas.filter((m) => m.de === i).length < 2) e.minas.push({ id: e.sig++, x: q.x, z: q.z, cuando: t + 6, de: i }); }
    });
    // De máquina: se mueven (el gris), giran la torreta hacia el jugador más cercano y disparan si lo ven
    for (let i = 2; i < 4; i++) {
      const q = e.tq[i];
      if (!q.vivo) continue;
      const datos = CLASES[q.quien as 'gris' | 'verde'];
      if (datos.vel > 0) {
        if (!q.dest || Math.hypot(q.dest.x - q.x, q.dest.z - q.z) < 0.4 || azarito() < dt * 0.25) {
          const libres: { x: number; z: number }[] = [], [cx, cz] = celda(q.x, q.z);
          for (let a = cx - 4; a <= cx + 4; a++) for (let b = cz - 4; b <= cz + 4; b++) if (!solido(e, a, b)) libres.push(centro(a, b));
          q.dest = libres[Math.floor(azarito() * libres.length)] ?? null;
        }
        if (q.dest) {
          q.ang = girarHacia(q.ang, Math.atan2(q.dest.x - q.x, q.dest.z - q.z), 5 * dt);
          const antes = { x: q.x, z: q.z };
          q.x += Math.sin(q.ang) * datos.vel * dt; q.z += Math.cos(q.ang) * datos.vel * dt;
          chocarMuros(q);
          if (Math.hypot(q.x - antes.x, q.z - antes.z) < datos.vel * dt * 0.3) q.dest = null;
        }
      }
      const blanco = blancoDe(e, i), ve = !!blanco && aLaVista(e, q, blanco);
      q.mira = girarHacia(q.mira, ve ? Math.atan2(blanco!.x - q.x, blanco!.z - q.z) : q.mira + 0.5, (q.quien === 'verde' ? 3 : 2) * dt);
      const apuntado = ve && Math.abs(girarHacia(q.mira, Math.atan2(blanco!.x - q.x, blanco!.z - q.z), 9) - q.mira) < 0.15;
      if (t > q.recarga && t > 1.5 && (apuntado || (q.quien === 'verde' && azarito() < dt * 0.6))) disparar(i);
    }
    // Choques entre tanques
    const vivos = e.tq.filter((q) => q.vivo);
    for (let i = 0; i < vivos.length; i++) for (let k = i + 1; k < vivos.length; k++) {
      const a = vivos[i], b = vivos[k], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), junto = R_TANQUE * 2;
      if (d >= junto || d === 0) continue;
      const s = (junto - d) / 2;
      a.x -= (dx / d) * s; a.z -= (dz / d) * s; b.x += (dx / d) * s; b.z += (dz / d) * s;
    }
    // El empujón puede meter a uno en un bloque o sacarlo de la mesa (las torretas no se mueven solas): se revisan las paredes
    for (const q of vivos) chocarMuros(q);
    // Balas: avanzan, rebotan, rompen cajas, se anulan entre sí y le dan a los tanques
    for (let i = e.balas.length - 1; i >= 0; i--) {
      const b = e.balas[i];
      let fuera = false;
      const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt, [cx, cz] = celda(b.x, b.z), [ax, az] = celda(nx, nz);
      if (solido(e, ax, az)) {
        if (romper(ax, az)) fuera = true;
        else if (b.rebotes-- > 0) { if (ax !== cx && solido(e, ax, cz)) b.vx = -b.vx; else if (az !== cz && solido(e, cx, az)) b.vz = -b.vz; else { b.vx = -b.vx; b.vz = -b.vz; } }
        else fuera = true;
      } else { b.x = nx; b.z = nz; }
      if (!fuera) for (let k = i - 1; k >= 0; k--) {
        const o = e.balas[k];
        if (Math.hypot(o.x - b.x, o.z - b.z) > 0.35) continue;
        e.balas.splice(k, 1); i--; fuera = true; break;
      }
      if (!fuera) for (let k = 0; k < e.tq.length; k++) {
        const q = e.tq[k];
        if (!q.vivo || Math.hypot(q.x - b.x, q.z - b.z) > R_TANQUE) continue;
        if (k < 2 && t < q.inv) continue;
        fuera = true;
        golpear(k, b.de);
        break;
      }
      if (fuera) e.balas.splice(i, 1);
    }
    // Minas: estallan a los 6 s o si otro tanque pasa encima; rompen cajas y golpean a todos cerca
    for (let i = e.minas.length - 1; i >= 0; i--) {
      const m = e.minas[i], pisada = e.tq.some((q, k) => q.vivo && k !== m.de && Math.hypot(q.x - m.x, q.z - m.z) < 0.8);
      if (t < m.cuando && !pisada) continue;
      e.minas.splice(i, 1);
      const [cx, cz] = celda(m.x, m.z);
      for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) romper(a, b);
      e.tq.forEach((q, k) => { if (q.vivo && Math.hypot(q.x - m.x, q.z - m.z) <= 2.2) golpear(k, m.de); });
    }
  },
  terminado: (e) => e.t >= DURA || e.tq[0].vidas <= 0 || e.tq[1].vidas <= 0,
  resultado(e, l) {
    const x = e.tq[indice(l)];
    return { puntaje: puntaje(e, l), lineas: [['Vidas que te quedaron', String(x.vidas)], ['Veces que le diste al rival', String(x.derribos)], ['Tanques de máquina', String(x.bajas)]], detalle: { vidas: x.vidas, derribos: x.derribos, bajas: x.bajas } };
  },
  valido(x): x is EstadoTanques {
    const e = x as EstadoTanques;
    // Viene de otra persona: se revisa todo lo que lee la simulación (un dato roto la detendría para todos)
    return !!e && typeof e.semilla === 'string' && e.semilla.length < 200 && num(e.t) && entre(e.n, 0, 1e9) && entre(e.nivel, 1, 4) && entre(e.sig, 0, 1e9) && Array.isArray(e.tq) && e.tq.length === 4
      && e.tq.every((q, i) => !!q && q.quien === QUIENES[i] && [q.x, q.z, q.ang, q.mira, q.recarga, q.inv, q.vuelve].every(num) && typeof q.vivo === 'boolean' && entre(q.vidas, 0, VIDAS) && entre(q.bajas, 0, 999) && entre(q.derribos, 0, 999) && (q.dest === null || (!!q.dest && num(q.dest.x) && num(q.dest.z))))
      && Array.isArray(e.balas) && e.balas.length < 60 && e.balas.every((b) => !!b && [b.x, b.z, b.vx, b.vz].every(num) && entre(b.rebotes, -1, 3) && entre(b.de, 0, 3))
      && Array.isArray(e.minas) && e.minas.length <= 4 && e.minas.every((m) => !!m && entre(m.id, 0, 1e9) && [m.x, m.z, m.cuando].every(num) && entre(m.de, 0, 3))
      && Array.isArray(e.grilla) && e.grilla.length === FILAS && e.grilla.every((f) => typeof f === 'string' && /^[.#c]{20}$/.test(f))
      && !!e.disparos && !!e.puestas && [e.disparos.a, e.disparos.b, e.puestas.a, e.puestas.b].every((n) => entre(n, 0, 1e9));
  },
  entradaValida(x): x is EntradaTanques { const i = x as EntradaTanques; return !!i && num(i.x) && num(i.z) && Math.abs(i.x) <= 1.5 && Math.abs(i.z) <= 1.5 && (i.mira === null || num(i.mira)) && Number.isInteger(i.disparo) && Number.isInteger(i.mina); },

  async escena(c, e0, yo) {
    const v = c.vivo!;
    const e = crearEscenario(c.caja, { ancho: AN + 2.5, alto: FO * Math.sin(1.0) + 4, centro: [0, 0, 0.5], inclinacion: 1.0, sinPlaya: true });
    const mando = yo ? crearMando(e, c.caja, 'Disparar', 'Mina') : null;
    const [, tablero, dardo0] = await Promise.all([montarSala(e), crearBloques(e), mallaDardo(e)]);
    let grilla = [...e0.grilla];
    tablero.armar(grilla.map((f) => f.split('')));
    const COLORES = ['#3f8cff', '#ef5565', CLASES.gris.color, CLASES.verde.color];
    const tanques = e0.tq.map((q, i) => ({ ...mallaTanque(e, COLORES[i], { franja: yo !== null && i === indice(yo) }), x: q.x, z: q.z, ang: q.ang, mira: q.mira, vivo: true }));
    const balas: THREE.Object3D[] = [], minas = new Map<number, THREE.Group>();
    let ultimo: EstadoTanques | null = null, llego = performance.now();
    const explotar = (x: number, z: number, grande = false) => { e.chispas(x, 0.6, z, ['#ff9a2e', '#ffd23c', '#3a3a44', '#ffffff'], grande ? 46 : 28, grande ? 7 : 5); e.temblar(grande ? 0.7 : 0.4); e.sonido.ruido(0.35, 0.25); };

    // Puntería con mouse (un clic dispara); en pantalla táctil apunta solo al más cercano
    let apunta: { x: number; z: number } | null = null, clics = 0, disparos = 0, puestas = 0, minaAntes = false;
    e.escuchar(e.lienzo, 'pointermove', (ev) => { if (ev.pointerType !== 'mouse') return; const p = e.enSuelo(ev, 0.6); if (p) apunta = { x: p.x, z: p.z }; });
    const alClic = (ev: PointerEvent) => { if (!yo || ev.pointerType !== 'mouse' || ev.target !== e.lienzo) return; ev.stopPropagation(); const p = e.enSuelo(ev, 0.6); if (p) apunta = { x: p.x, z: p.z }; clics++; };
    c.caja.addEventListener('pointerdown', alClic, true);

    return {
      alCuadro: e.alCuadro,
      entrada() {
        if (!mando || !yo) return tanquesMundo.quieto();
        if (mando.tomarAccion()) clics++;
        if (clics) { disparos += clics; clics = 0; e.sonido.tono(520, 0.08, { tipo: 'square', vol: 0.1, hasta: 260 }); }
        if (mando.agachado && !minaAntes) puestas++;
        minaAntes = mando.agachado;
        const yoT = tanques[indice(yo)];
        return { x: mando.x, z: mando.z, mira: apunta ? Math.atan2(apunta.x - yoT.x, apunta.z - yoT.z) : null, disparo: disparos, mina: puestas };
      },
      dibujar(es, dt) {
        // Si recargué, mis disparos y minas siguen contando desde donde quedaron
        if (yo) { disparos = Math.max(disparos, es.disparos[yo]); puestas = Math.max(puestas, es.puestas[yo]); }
        if (es !== ultimo) { ultimo = es; llego = performance.now(); }
        const desde = (performance.now() - llego) / 1000; // lo que pasó desde el último estado: las balas se adelantan
        // Cajas rotas
        es.grilla.forEach((fila, cz) => { if (fila === grilla[cz]) return; for (let cx = 0; cx < COLS; cx++) if (grilla[cz][cx] === 'c' && fila[cx] === '.' && tablero.romper(cx, cz)) { const p = centro(cx, cz); e.chispas(p.x, 0.5, p.z, ['#c99a4a', '#8a5a38', '#ffd23c'], 14, 4); } });
        grilla = [...es.grilla];
        es.tq.forEach((q, i) => {
          const m = tanques[i];
          if (m.vivo && !q.vivo) { explotar(m.x, m.z); if (yo && i === indice(yo)) e.hud.aviso(q.vidas > 0 ? `¡Te dieron! Quedan ${q.vidas}` : '¡Fuera de combate!', 'mal', 1.2); }
          if (!m.vivo && q.vivo) { m.x = q.x; m.z = q.z; }
          m.vivo = q.vivo;
          m.x = suave(m.x, q.x, dt); m.z = suave(m.z, q.z, dt); m.ang = suaveAngulo(m.ang, q.ang, dt); m.mira = suaveAngulo(m.mira, q.mira, dt);
          const ve = q.vivo && (i > 1 || es.t >= q.inv - 0.4 || Math.sin(es.t * 30) > 0);
          m.cuerpo.visible = m.torreta.visible = ve; m.sombra.visible = q.vivo;
          m.cuerpo.position.set(m.x, 0, m.z); m.cuerpo.rotation.y = m.ang;
          m.torreta.position.set(m.x, 0, m.z); m.torreta.rotation.y = m.mira;
          m.sombra.position.set(m.x, 0.02, m.z);
        });
        while (balas.length < es.balas.length) { const g = new THREE.Group(); g.add(dardo0.clone()); e.escena.add(g); balas.push(g); }
        balas.forEach((g, i) => { const b = es.balas[i]; g.visible = !!b; if (b) { g.position.set(b.x + b.vx * Math.min(desde, 0.2), 0.66, b.z + b.vz * Math.min(desde, 0.2)); g.rotation.y = Math.atan2(b.vx, b.vz); } });
        for (const m of es.minas) { let g = minas.get(m.id); if (!g) { g = mallaMina(); e.escena.add(g); minas.set(m.id, g); } g.position.set(m.x, 0, m.z); (g.children[1] as THREE.Mesh).visible = Math.sin(es.t * (m.cuando - es.t < 2 ? 25 : 8)) > 0; }
        for (const [id, g] of minas) if (!es.minas.some((m) => m.id === id)) { explotar(g.position.x, g.position.z, true); e.escena.remove(g); minas.delete(id); }
        e.hud.tiempo(mmss(DURA - es.t));
        const vidas = (l: Lado) => '♥'.repeat(es.tq[indice(l)].vidas);
        e.hud.extra(`${v.nombres.a} ${vidas('a')} ${puntaje(es, 'a')} · ${puntaje(es, 'b')} ${vidas('b')} ${v.nombres.b}`);
        e.hud.puntos(yo ? puntaje(es, yo) : 0);
      },
      empezar: () => e.empezar(),
      destruir() { c.caja.removeEventListener('pointerdown', alClic, true); e.destruir(); },
    };
  },
};

export const tanques = (c: Contexto): Promise<Partida> => crearMundo(c, tanquesMundo);
