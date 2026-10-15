import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, mmss } from '../reflejos/motor';
import { AN, CELDA, CLASES, COLS, FILAS, FO, R_TANQUE, TABLEROS, celda, centro, crearBloques, mallaDardo, mallaMina, mallaTanque, montarSala, type Clase } from './tanquesPiezas';

// Tanques de Juguete: cinco oleadas de tanques enemigos sobre una mesa de juegos. Las balas de espuma rebotan en las
// paredes (una vez las tuyas), rompen cajas y se anulan si chocan entre sí. Las minas estallan a los 6 s o al pisarlas.
// Cada oleada trae su propio tablero de bloques; la última, un tanque jefe. Tienes tres vidas.

const DURA = 240;
const OLEADAS: Clase[][] = [['marron', 'marron'], ['gris', 'gris', 'marron'], ['verde', 'gris', 'gris', 'marron'], ['rojo', 'rojo', 'verde', 'gris'], ['jefe', 'rojo', 'verde']];

interface Tanque { clase: Clase | 'yo'; x: number; z: number; ang: number; mira: number; vida: number; recarga: number; destino: { x: number; z: number } | null; cuerpo: THREE.Group; torreta: THREE.Object3D; sombra: THREE.Mesh; vivo: boolean }
interface Bala { x: number; z: number; vx: number; vz: number; rebotes: number; de: Tanque; malla: THREE.Object3D }
interface Mina { x: number; z: number; cuando: number; malla: THREE.Object3D }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: AN + 2.5, alto: FO * Math.sin(1.0) + 4, centro: [0, 0, 0.5], inclinacion: 1.0, sinPlaya: true });
  const mando = crearMando(e, c.caja, 'Disparar', 'Mina');
  const r = generador(`${c.semilla}|tanques`);

  // ── La pieza y el tablero ──
  const [, tablero] = await Promise.all([montarSala(e), crearBloques(e)]);
  let grilla: string[][] = [];
  const solido = (cx: number, cz: number) => cx < 0 || cz < 0 || cx >= COLS || cz >= FILAS || grilla[cz][cx] !== '.';
  const armar = (n: number) => { grilla = TABLEROS[n].map((f) => f.split('')); tablero.armar(grilla); };

  // ── Tanques: cuerpo con orugas, torreta y cañón ──
  const crearTanque = (clase: Clase | 'yo', x: number, z: number): Tanque => {
    const { cuerpo, torreta, sombra } = mallaTanque(e, clase === 'yo' ? '#3f8cff' : CLASES[clase].color, { jefe: clase === 'jefe', franja: clase === 'yo' });
    return { clase, x, z, ang: 0, mira: 0, vida: clase === 'yo' ? 1 : CLASES[clase].vida, recarga: 1 + r() * 1.5, destino: null, cuerpo, torreta, sombra, vivo: true };
  };
  const quitar = (t: Tanque) => { t.vivo = false; e.escena.remove(t.cuerpo, t.torreta, t.sombra); };

  // Balas de espuma (del paquete Blaster) y minas
  const dardo0 = await mallaDardo(e);
  const balas: Bala[] = [], minas: Mina[] = [], marcas: THREE.Mesh[] = [];
  const disparar = (t: Tanque, ahora: number) => {
    const datos = t.clase === 'yo' ? { bala: 10, rebotes: 1 } : CLASES[t.clase];
    const propias = balas.filter((b) => b.de === t).length;
    if (t.clase === 'yo' ? propias >= 5 : propias >= (t.clase === 'jefe' ? 6 : 2)) return;
    const salir = (ang: number) => {
      const dx = Math.sin(ang), dz = Math.cos(ang), x = t.x + dx * 0.8, z = t.z + dz * 0.8;
      if (solido(...celda(x, z))) return; // el cañón está pegado a una pared
      const g = new THREE.Group(), d = dardo0.clone();
      g.add(d);
      g.rotation.y = ang;
      g.position.set(x, 0.66, z);
      e.escena.add(g);
      balas.push({ x, z, vx: dx * datos.bala, vz: dz * datos.bala, rebotes: datos.rebotes, de: t, malla: g });
    };
    salir(t.mira);
    if (t.clase === 'jefe') { salir(t.mira - 0.25); salir(t.mira + 0.25); }
    if (t.clase === 'yo') e.sonido.tono(520, 0.08, { tipo: 'square', vol: 0.1, hasta: 260 }); else e.sonido.tono(300, 0.08, { tipo: 'square', vol: 0.06, hasta: 160 });
    t.recarga = ahora + (t.clase === 'yo' ? 0.28 : CLASES[t.clase].cada / (1 + (c.nivel - 1) * 0.12) * (0.8 + r() * 0.4));
  };
  const explotar = (x: number, z: number, grande = false) => {
    e.chispas(x, 0.6, z, ['#ff9a2e', '#ffd23c', '#3a3a44', '#ffffff'], grande ? 46 : 28, grande ? 7 : 5);
    e.temblar(grande ? 0.7 : 0.4);
    e.sonido.ruido(0.35, 0.25);
    const marca = new THREE.Mesh(new THREE.CircleGeometry(grande ? 1.1 : 0.7, 12), new THREE.MeshBasicMaterial({ color: '#3a2a20', transparent: true, opacity: 0.35, depthWrite: false }));
    marca.rotation.x = -Math.PI / 2;
    marca.position.set(x, 0.01, z);
    e.escena.add(marca);
    marcas.push(marca);
    if (marcas.length > 18) e.escena.remove(marcas.shift()!);
  };
  const romperCaja = (cx: number, cz: number) => {
    if (!tablero.romper(cx, cz)) return false;
    grilla[cz][cx] = '.';
    const p = centro(cx, cz);
    e.chispas(p.x, 0.5, p.z, ['#c99a4a', '#8a5a38', '#ffd23c'], 14, 4);
    e.sonido.efecto('madera', 0.6);
    return true;
  };

  // ── Estado de la partida ──
  let yo = crearTanque('yo', 0, 0), enemigos: Tanque[] = [], oleada = -1, vidas = 3, invencible = 0, puntos = 0, bajas = 0, empezado = false, terminado = false, pausaHasta = 0, minaAntes = false;
  const SALIDA = centro(1, Math.floor(FILAS / 2));
  const nuevaOleada = (ahora: number) => {
    oleada++;
    for (const b of balas) e.escena.remove(b.malla);
    balas.length = 0;
    for (const m of minas) e.escena.remove(m.malla);
    minas.length = 0;
    armar(oleada);
    yo.x = SALIDA.x; yo.z = SALIDA.z; yo.ang = yo.mira = Math.PI / 2;
    const libres: { x: number; z: number }[] = [];
    grilla.forEach((f, cz) => f.forEach((t, cx) => { if (t === '.' && cx >= COLS - 7) libres.push(centro(cx, cz)); }));
    enemigos = OLEADAS[oleada].map((clase) => { const p = libres.splice(Math.floor(r() * libres.length), 1)[0]; const t = crearTanque(clase, p.x, p.z); t.ang = t.mira = -Math.PI / 2; t.recarga = ahora + 2 + r() * 2; return t; });
    pausaHasta = ahora + 1.6;
    e.hud.aviso(oleada === OLEADAS.length - 1 ? '¡Oleada final: el Jefe!' : `Oleada ${oleada + 1}`, 'oro', 1.6);
  };

  /** Empuja un tanque fuera de los bloques y de los bordes. */
  const chocarMuros = (t: Tanque) => {
    const [cx, cz] = celda(t.x, t.z);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
      if (!solido(a, b)) continue;
      const p = centro(a, b), px = limitar(t.x, p.x - CELDA / 2, p.x + CELDA / 2), pz = limitar(t.z, p.z - CELDA / 2, p.z + CELDA / 2), dx = t.x - px, dz = t.z - pz, d = Math.hypot(dx, dz);
      if (d >= R_TANQUE) continue;
      if (d === 0) { t.x += Math.sign(t.x - p.x || 1) * 0.05; continue; }
      t.x = px + (dx / d) * R_TANQUE; t.z = pz + (dz / d) * R_TANQUE;
    }
  };
  /** Si hay línea de tiro directa entre dos puntos (sin bloques ni cajas en medio). */
  const aLaVista = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const pasos = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3);
    for (let i = 1; i < pasos; i++) if (solido(...celda(a.x + ((b.x - a.x) * i) / pasos, a.z + ((b.z - a.z) * i) / pasos))) return false;
    return true;
  };
  const girarHacia = (desde: number, hacia: number, max: number) => { let d = hacia - desde; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return desde + limitar(d, -max, max); };

  // ── Puntería: con mouse, donde apunta; en pantalla táctil, al enemigo visible más cercano ──
  let apuntaMouse: { x: number; z: number } | null = null, usaMouse = false, quiereDisparar = false;
  e.escuchar(e.lienzo, 'pointermove', (ev) => { if (ev.pointerType !== 'mouse') return; usaMouse = true; const p = e.enSuelo(ev, 0.6); if (p) apuntaMouse = { x: p.x, z: p.z }; });
  // Un clic con el mouse dispara (y no mueve el tanque): se atrapa antes de que llegue a la palanca
  const alClic = (ev: PointerEvent) => { if (ev.pointerType !== 'mouse' || ev.target !== e.lienzo) return; ev.stopPropagation(); usaMouse = true; const p = e.enSuelo(ev, 0.6); if (p) apuntaMouse = { x: p.x, z: p.z }; quiereDisparar = true; };
  c.caja.addEventListener('pointerdown', alClic, true);
  const autoMira = () => { const vistos = enemigos.filter((x) => x.vivo && aLaVista(yo, x)); const blanco = (vistos.length ? vistos : enemigos.filter((x) => x.vivo)).sort((a, b) => Math.hypot(a.x - yo.x, a.z - yo.z) - Math.hypot(b.x - yo.x, b.z - yo.z))[0]; return blanco ? Math.atan2(blanco.x - yo.x, blanco.z - yo.z) : yo.ang; };

  const terminar = (t: number, gano: boolean) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    const bonoVidas = gano ? vidas * 250 : 0, bonoTiempo = gano ? Math.max(0, Math.round((DURA - t) * 3)) : 0;
    puntos += bonoVidas + bonoTiempo;
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Resultado', gano ? '¡Ganaste las 5 oleadas!' : `Llegaste a la oleada ${oleada + 1}`], ['Tanques destruidos', String(bajas)], ['Vidas que te quedaron', String(gano ? vidas : 0)], ['Bono de vidas y tiempo', String(bonoVidas + bonoTiempo)]],
      detalle: { oleada: oleada + 1, bajas, vidas, gano },
    });
  };

  nuevaOleada(0);
  e.hud.tiempo(mmss(DURA));
  e.alCuadro((t, dt) => {
    if (empezado && !terminado) {
      const paso = Math.min(dt, 0.05);
      // Jugador: mover, apuntar, disparar y dejar minas
      if (yo.vivo) {
        const mx = mando.x, mz = mando.z, largo = Math.hypot(mx, mz);
        if (largo > 0.15) {
          yo.ang = girarHacia(yo.ang, Math.atan2(mx, mz), 9 * paso);
          yo.x += (mx / Math.max(1, largo)) * 4.2 * paso; yo.z += (mz / Math.max(1, largo)) * 4.2 * paso;
          chocarMuros(yo);
        }
        yo.mira = usaMouse && apuntaMouse ? Math.atan2(apuntaMouse.x - yo.x, apuntaMouse.z - yo.z) : autoMira();
        if ((quiereDisparar || mando.tomarAccion()) && t > yo.recarga && t > pausaHasta) disparar(yo, t);
        quiereDisparar = false;
        if (mando.agachado && !minaAntes && minas.length < 2 && t > pausaHasta) {
          const m = mallaMina();
          m.position.set(yo.x, 0, yo.z);
          e.escena.add(m);
          minas.push({ x: yo.x, z: yo.z, cuando: t + 6, malla: m });
          e.sonido.efecto('click', 0.5);
        }
        minaAntes = mando.agachado;
      } else if (t > invencible - 2) {
        // Reaparece en la salida
        yo = crearTanque('yo', SALIDA.x, SALIDA.z);
        yo.ang = yo.mira = Math.PI / 2;
      }
      // Enemigos: se mueven, giran la torreta y disparan si te ven
      if (t > pausaHasta) for (const en of enemigos) {
        if (!en.vivo) continue;
        const datos = CLASES[en.clase as Clase];
        if (datos.vel > 0) {
          // Esquiva balas que vienen directo a él
          const peligro = balas.find((b) => b.de !== en && Math.hypot(b.x - en.x, b.z - en.z) < 3.5 && (en.x - b.x) * b.vx + (en.z - b.z) * b.vz > 0);
          if (peligro) { const s = (en.x - peligro.x) * peligro.vz - (en.z - peligro.z) * peligro.vx > 0 ? 1 : -1; en.destino = { x: en.x + peligro.vz * s * 0.3, z: en.z - peligro.vx * s * 0.3 }; }
          if (!en.destino || Math.hypot(en.destino.x - en.x, en.destino.z - en.z) < 0.4 || r() < paso * 0.25) {
            const libres: { x: number; z: number }[] = [];
            const [cx, cz] = celda(en.x, en.z);
            for (let a = cx - 4; a <= cx + 4; a++) for (let b = cz - 4; b <= cz + 4; b++) if (!solido(a, b)) libres.push(centro(a, b));
            en.destino = libres[Math.floor(r() * libres.length)] ?? null;
          }
          if (en.destino) {
            const objetivo = Math.atan2(en.destino.x - en.x, en.destino.z - en.z);
            en.ang = girarHacia(en.ang, objetivo, 5 * paso);
            const antes = { x: en.x, z: en.z };
            en.x += Math.sin(en.ang) * datos.vel * paso; en.z += Math.cos(en.ang) * datos.vel * paso;
            chocarMuros(en);
            if (Math.hypot(en.x - antes.x, en.z - antes.z) < datos.vel * paso * 0.3) en.destino = null; // atascado: busca otro lado
          }
        }
        const ve = yo.vivo && aLaVista(en, yo), adelanto = ve ? Math.hypot(yo.x - en.x, yo.z - en.z) / datos.bala : 0;
        const blanco = { x: yo.x + Math.sin(yo.ang) * adelanto * 2, z: yo.z + Math.cos(yo.ang) * adelanto * 2 };
        en.mira = girarHacia(en.mira, ve ? Math.atan2(blanco.x - en.x, blanco.z - en.z) : en.mira + 0.5, (en.clase === 'verde' ? 3 : 2) * paso);
        const apuntado = Math.abs(girarHacia(en.mira, Math.atan2(yo.x - en.x, yo.z - en.z), 9) - en.mira) < 0.15;
        // Los francotiradores también prueban tiros de rebote aunque no te vean
        if (t > en.recarga && ((ve && apuntado) || (en.clase === 'verde' && r() < paso * 0.6))) disparar(en, t);
      }
      // Choques entre tanques
      const todos = [yo, ...enemigos].filter((x) => x.vivo);
      for (let i = 0; i < todos.length; i++) for (let k = i + 1; k < todos.length; k++) {
        const a = todos[i], b = todos[k], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), junto = R_TANQUE * 2;
        if (d >= junto || d === 0) continue;
        const s = (junto - d) / 2;
        a.x -= (dx / d) * s; a.z -= (dz / d) * s; b.x += (dx / d) * s; b.z += (dz / d) * s;
      }
      // Balas: avanzan, rebotan en los bloques, rompen cajas, se anulan entre sí y destruyen tanques
      for (let i = balas.length - 1; i >= 0; i--) {
        const b = balas[i];
        let fuera = false;
        const nx = b.x + b.vx * paso, nz = b.z + b.vz * paso, [cx, cz] = celda(b.x, b.z), [ax, az] = celda(nx, nz);
        if (solido(ax, az)) {
          if (romperCaja(ax, az)) fuera = true;
          else if (b.rebotes-- > 0) {
            if (ax !== cx && solido(ax, cz)) b.vx = -b.vx; else if (az !== cz && solido(cx, az)) b.vz = -b.vz; else { b.vx = -b.vx; b.vz = -b.vz; }
            e.sonido.tono(700, 0.03, { tipo: 'square', vol: 0.04 });
          } else fuera = true;
        } else { b.x = nx; b.z = nz; }
        b.malla.position.set(b.x, 0.66, b.z);
        b.malla.rotation.y = Math.atan2(b.vx, b.vz);
        if (!fuera) for (let k = i - 1; k >= 0; k--) {
          const o = balas[k];
          if (Math.hypot(o.x - b.x, o.z - b.z) > 0.35) continue;
          e.chispas(b.x, 0.66, b.z, ['#ffffff', '#ffd23c'], 8, 3);
          e.escena.remove(o.malla);
          balas.splice(k, 1);
          i--;
          fuera = true;
          break;
        }
        if (!fuera) for (const tq of [yo, ...enemigos]) {
          if (!tq.vivo || Math.hypot(tq.x - b.x, tq.z - b.z) > R_TANQUE * (tq.clase === 'jefe' ? 1.35 : 1)) continue;
          if (tq === yo && t < invencible) continue;
          fuera = true;
          if (--tq.vida > 0) { e.chispas(tq.x, 0.8, tq.z, ['#ffffff', CLASES[tq.clase as Clase].color], 12, 4); e.temblar(0.2); e.sonido.efecto('golpe', 0.5); break; }
          explotar(tq.x, tq.z, tq.clase === 'jefe');
          quitar(tq);
          if (tq === yo) {
            vidas--;
            invencible = t + 3;
            e.hud.aviso(vidas > 0 ? `¡Te dieron! Quedan ${vidas}` : '¡Fuera de combate!', 'mal', 1.2);
            e.sonido.mal();
            if (vidas <= 0) return terminar(t, false);
          } else if (b.de === yo) {
            const valor = CLASES[tq.clase as Clase].valor;
            puntos += valor; bajas++;
            e.flotante(`+${valor}`, tq.x, 1.5, tq.z, 'oro');
          }
          break;
        }
        if (fuera) { e.escena.remove(b.malla); balas.splice(i, 1); }
      }
      // Minas: estallan a su hora o si un enemigo pasa encima
      for (let i = minas.length - 1; i >= 0; i--) {
        const m = minas[i], pisada = enemigos.some((x) => x.vivo && Math.hypot(x.x - m.x, x.z - m.z) < 0.8);
        (m.malla.children[1] as THREE.Mesh).visible = Math.sin(t * (m.cuando - t < 2 ? 25 : 8)) > 0;
        if (t < m.cuando && !pisada) continue;
        explotar(m.x, m.z, true);
        e.escena.remove(m.malla);
        minas.splice(i, 1);
        const [cx, cz] = celda(m.x, m.z);
        for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) romperCaja(a, b);
        for (const tq of [yo, ...enemigos]) {
          if (!tq.vivo || Math.hypot(tq.x - m.x, tq.z - m.z) > 2.2 || (tq === yo && t < invencible)) continue;
          if (--tq.vida > 0) continue;
          explotar(tq.x, tq.z);
          quitar(tq);
          if (tq === yo) { vidas--; invencible = t + 3; e.hud.aviso(vidas > 0 ? `¡Tu propia mina! Quedan ${vidas}` : '¡Fuera de combate!', 'mal', 1.2); if (vidas <= 0) return terminar(t, false); }
          else { const valor = CLASES[tq.clase as Clase].valor; puntos += valor; bajas++; e.flotante(`+${valor}`, tq.x, 1.5, tq.z, 'oro'); }
        }
      }
      // ¿Oleada ganada?
      if (enemigos.every((x) => !x.vivo) && t > pausaHasta) {
        puntos += 300;
        e.sonido.bien();
        e.chispas(yo.x, 1, yo.z, ['#ffd23c', '#3f8cff', '#ffffff'], 40, 6);
        if (oleada >= OLEADAS.length - 1) return terminar(t, true);
        nuevaOleada(t);
      }
      if (t >= DURA) return terminar(t, false);
      e.hud.tiempo(mmss(DURA - t));
      e.hud.extra(`Oleada ${oleada + 1}/5 · ${'♥'.repeat(Math.max(0, vidas))}`);
      e.hud.puntos(puntos);
    }
    // Dibujo
    for (const tq of [yo, ...enemigos]) {
      if (!tq.vivo) continue;
      tq.cuerpo.position.set(tq.x, 0, tq.z);
      tq.cuerpo.rotation.y = tq.ang;
      tq.torreta.position.set(tq.x, 0, tq.z);
      tq.torreta.rotation.y = tq.mira;
      tq.sombra.position.set(tq.x, 0.02, tq.z);
      if (tq === yo) tq.cuerpo.visible = tq.torreta.visible = t > invencible - 2.4 || Math.sin(t * 30) > 0;
    }
  });

  return {
    empezar() { e.empezar(); empezado = true; pausaHasta = 1.2; },
    destruir() { c.caja.removeEventListener('pointerdown', alClic, true); e.destruir(); },
  };
}
