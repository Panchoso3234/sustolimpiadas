import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { aspectoAleatorio } from '../../personaje/catalogo';
import type { Kenney } from '../../personaje/kenney';
import { bosque, cielo, halo, ladrillo } from '../decorado';
import { mat } from '../punteria/fisica';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, mmss } from '../reflejos/motor';

// Bombas: tú contra tres rivales de máquina en el patio de un castillo, al estilo Bomberman. Tres rondas.
// Las bombas estallan en cruz; rompen cajas (que a veces sueltan mejoras) y encadenan otras bombas.
// Desde el segundo 90 de cada ronda, el patio se va cerrando desde el borde hacia el centro.

const COLS = 15, FILAS = 13, CELDA = 1.6, MECHA = 2.4, FUEGO = 0.55, RONDAS = 3, DURA_RONDA = 120, CIERRE = 90;
type Mejora = 'bomba' | 'llama' | 'vel' | 'patear';
const ICONO: Record<Mejora, string> = { bomba: '💣', llama: '🔥', vel: '👟', patear: '🦶' };
const COLOR_MEJORA: Record<Mejora, string> = { bomba: '#3f8cff', llama: '#ff6a1e', vel: '#3fc79a', patear: '#c79bff' };
const COLORES = ['#3f8cff', '#ef5565', '#3fc79a', '#ffb02e'];
const ESQUINAS: [number, number][] = [[1, 1], [COLS - 2, FILAS - 2], [COLS - 2, 1], [1, FILAS - 2]];

interface Jugador { id: number; x: number; z: number; vivo: boolean; bombas: number; llama: number; vel: number; patear: boolean; k: Kenney; aro: THREE.Mesh; camino: [number, number][]; piensa: number; humano: boolean; mejoras: number; eliminados: number }
interface Bomba { cx: number; cz: number; x: number; z: number; t: number; de: Jugador; llama: number; malla: THREE.Group; desliza: [number, number] | null; libres: Set<number> }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: COLS * CELDA + 1, alto: FILAS * CELDA * Math.sin(1.05) + 3.5, centro: [0, 0, 0.6], inclinacion: 1.05, sinPlaya: true });
  cielo(e.escena, '#6fa8dc', '#d9ecff');
  const mando = crearMando(e, c.caja, 'Bomba');
  const r = generador(`${c.semilla}|bombas`);
  const AN = COLS * CELDA, FO = FILAS * CELDA;
  const centro = (cx: number, cz: number) => ({ x: -AN / 2 + (cx + 0.5) * CELDA, z: -FO / 2 + (cz + 0.5) * CELDA });
  const celda = (x: number, z: number): [number, number] => [Math.floor((x + AN / 2) / CELDA), Math.floor((z + FO / 2) / CELDA)];

  // ── El patio: losas, pasto alrededor, muralla de piedra, antorchas y banderines ──
  const losa = ladrillo('#cdbfa6', '#a8987e', 2);
  losa.repeat.set(COLS / 2, FILAS / 2);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(AN, FO), new THREE.MeshLambertMaterial({ map: losa }));
  piso.rotation.x = -Math.PI / 2;
  const pasto = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: '#6aa85a' }));
  pasto.rotation.x = -Math.PI / 2;
  pasto.position.y = -0.02;
  e.escena.add(pasto, piso);
  await bosque(e.escena, 'naturaleza', 'tree_pineRoundA', Array.from({ length: 30 }, () => { const a = r() * 6.28; return { x: Math.cos(a) * (AN / 2 + 4 + r() * 10), z: Math.sin(a) * (FO / 2 + 4 + r() * 8), alto: 4 + r() * 3, giro: r() * 6 }; }));

  // Bloques: muros firmes (piedra) y cajas que se rompen (madera), como instancias
  const piedra = ladrillo('#9a97a6', '#6d6a78', 3);
  // Caja de madera: tablones, marco oscuro y refuerzo en X
  const madera = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#c99a5a' : '#bb8c4f'; g.fillRect(0, i * 16, 64, 16); }
    g.strokeStyle = '#7a4b2c'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
    g.lineWidth = 5; g.beginPath(); g.moveTo(6, 6); g.lineTo(58, 58); g.moveTo(58, 6); g.lineTo(6, 58); g.stroke();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const firmes = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA, 1.5, CELDA).translate(0, 0.75, 0), new THREE.MeshLambertMaterial({ map: piedra }), COLS * FILAS);
  const cajas = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA * 0.92, 1.2, CELDA * 0.92).translate(0, 0.6, 0), new THREE.MeshLambertMaterial({ map: madera }), COLS * FILAS);
  cajas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  e.escena.add(firmes, cajas);
  // Antorchas en las esquinas de la muralla
  const brillo = new THREE.SpriteMaterial({ map: halo('rgba(255,170,60,0.85)'), depthWrite: false, blending: THREE.AdditiveBlending });
  const llamas: THREE.Sprite[] = [];
  for (const [cx, cz] of [[0, 0], [COLS - 1, 0], [0, FILAS - 1], [COLS - 1, FILAS - 1], [7, 0], [7, FILAS - 1]]) {
    const p = centro(cx, cz), palo = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 6), mat('#5d3a22')), fuego = new THREE.Sprite(brillo);
    palo.position.set(p.x, 1.95, p.z);
    fuego.position.set(p.x, 2.55, p.z);
    fuego.scale.set(1.6, 1.6, 1);
    e.escena.add(palo, fuego);
    llamas.push(fuego);
  }

  // ── Estado del tablero ──
  // 0 libre · 1 muro · 2 caja · 3 cierre (muro que cae al final de la ronda)
  let tablero: number[][] = [];
  const mejoras = new Map<number, { tipo: Mejora; malla: THREE.Group }>();
  const fuego = new Map<number, number>(); // celda → hasta cuándo arde
  const quienQuemo = new Map<number, Jugador>(); // celda → dueño de la bomba que la incendió
  const clave = (cx: number, cz: number) => cz * COLS + cx;
  const bombas: Bomba[] = [];
  const geoFuego = new THREE.BoxGeometry(CELDA * 0.92, 0.9, CELDA * 0.92);
  const matFuego = new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.85 });
  const llamarada = new THREE.InstancedMesh(geoFuego, matFuego, COLS * FILAS);
  llamarada.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  e.escena.add(llamarada);
  const o = new THREE.Object3D();

  const pintarBloques = () => {
    let f = 0, k = 0;
    tablero.forEach((fila, cz) => fila.forEach((v, cx) => {
      const p = centro(cx, cz);
      o.position.set(p.x, 0, p.z); o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0); o.updateMatrix();
      if (v === 1 || v === 3) firmes.setMatrixAt(f++, o.matrix);
      if (v === 2) cajas.setMatrixAt(k++, o.matrix);
    }));
    firmes.count = f; cajas.count = k;
    firmes.instanceMatrix.needsUpdate = cajas.instanceMatrix.needsUpdate = true;
  };
  const armarTablero = (ronda: number) => {
    const rr = generador(`${c.semilla}|ronda${ronda}`);
    tablero = Array.from({ length: FILAS }, (_, cz) => Array.from({ length: COLS }, (_, cx) => {
      if (cx === 0 || cz === 0 || cx === COLS - 1 || cz === FILAS - 1 || (cx % 2 === 0 && cz % 2 === 0)) return 1;
      // Las esquinas de salida quedan libres para poder poner la primera bomba y escapar
      if (ESQUINAS.some(([ex, ez]) => Math.abs(ex - cx) + Math.abs(ez - cz) <= 1)) return 0;
      return rr() < 0.7 ? 2 : 0;
    }));
    for (const m of mejoras.values()) e.escena.remove(m.malla);
    mejoras.clear();
    fuego.clear();
    for (const b of bombas) e.escena.remove(b.malla);
    bombas.length = 0;
    pintarBloques();
  };

  // ── Jugadores ──
  const personajes = await Promise.all([0, 1, 2, 3].map((i) => e.personaje(i === 0 ? c.aspecto : aspectoAleatorio(generador(`${c.semilla}|bombista${i}`)), 1.5)));
  const jugadores: Jugador[] = personajes.map((k, i) => {
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.45, i === 0 ? 0.72 : 0.6, 20), new THREE.MeshBasicMaterial({ color: COLORES[i], side: THREE.DoubleSide }));
    aro.rotation.x = -Math.PI / 2;
    e.escena.add(aro);
    return { id: i, x: 0, z: 0, vivo: true, bombas: 1, llama: 2, vel: 3.6, patear: false, k, aro, camino: [], piensa: 0, humano: i === 0, mejoras: 0, eliminados: 0 };
  });
  const yo = jugadores[0];
  const reiniciar = () => jugadores.forEach((j, i) => {
    const p = centro(...ESQUINAS[i]);
    Object.assign(j, { x: p.x, z: p.z, vivo: true, bombas: 1, llama: 2, vel: 3.6, patear: false, camino: [], piensa: 0 });
    j.k.grupo.visible = j.aro.visible = true;
    j.k.grupo.scale.y = Math.abs(j.k.grupo.scale.x);
    j.k.animar('idle');
  });

  const bombaEn = (cx: number, cz: number) => bombas.find((b) => b.cx === cx && b.cz === cz);
  /** Si un jugador puede pararse en la celda (las bombas que acaba de dejar no lo atrapan). */
  const pasable = (cx: number, cz: number, j?: Jugador) => {
    if (cx < 0 || cz < 0 || cx >= COLS || cz >= FILAS || tablero[cz][cx] !== 0) return false;
    const b = bombaEn(cx, cz);
    return !b || (!!j && b.libres.has(j.id));
  };

  const ponerBomba = (j: Jugador) => {
    const [cx, cz] = celda(j.x, j.z);
    if (bombaEn(cx, cz) || bombas.filter((b) => b.de === j).length >= j.bombas) return;
    const p = centro(cx, cz), g = new THREE.Group(), cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), mat('#26262e')), mecha = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), mat('#c9a86a'));
    cuerpo.position.y = 0.5; mecha.position.y = 1.08;
    const tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), mat(COLORES[j.id]));
    tapa.position.y = 0.97;
    g.add(cuerpo, mecha, tapa);
    g.position.set(p.x, 0, p.z);
    e.escena.add(g);
    // Quien está sobre la celda al ponerla puede salir de ella
    const libres = new Set(jugadores.filter((x) => x.vivo && celda(x.x, x.z).every((v, i) => v === [cx, cz][i])).map((x) => x.id));
    bombas.push({ cx, cz, x: p.x, z: p.z, t: e.reloj() + MECHA, de: j, llama: j.llama, malla: g, desliza: null, libres });
    if (j.humano) e.sonido.efecto('click', 0.5);
  };

  /** Celdas que alcanzaría una explosión en cruz. */
  const cruz = (cx: number, cz: number, llama: number) => {
    const lista: [number, number][] = [[cx, cz]];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= llama; k++) {
      const x = cx + dx * k, z = cz + dz * k, v = tablero[z]?.[x];
      if (v === undefined || v === 1 || v === 3) break;
      lista.push([x, z]);
      if (v === 2) break;
    }
    return lista;
  };
  const estallar = (b: Bomba, t: number) => {
    const i = bombas.indexOf(b);
    if (i < 0) return;
    bombas.splice(i, 1);
    e.escena.remove(b.malla);
    for (const [x, z] of cruz(b.cx, b.cz, b.llama)) {
      fuego.set(clave(x, z), t + FUEGO);
      quienQuemo.set(clave(x, z), b.de);
      if (tablero[z][x] === 2) {
        tablero[z][x] = 0;
        const p = centro(x, z);
        e.chispas(p.x, 0.8, p.z, ['#c99a5a', '#8a5a38', '#ffd23c'], 8, 4);
        // A veces la caja suelta una mejora
        if (r() < 0.32) {
          const tipo = (['bomba', 'llama', 'vel', 'patear'] as Mejora[])[Math.floor(r() * (r() < 0.85 ? 3 : 4))];
          const g = new THREE.Group(), gema = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshLambertMaterial({ color: COLOR_MEJORA[tipo], emissive: COLOR_MEJORA[tipo], emissiveIntensity: 0.35, flatShading: true }));
          gema.position.y = 0.7;
          g.add(gema);
          g.position.set(p.x, 0, p.z);
          e.escena.add(g);
          mejoras.set(clave(x, z), { tipo, malla: g });
          g.userData.nace = t + FUEGO; // no la quema el mismo fuego que la soltó
        }
      } else {
        const m = mejoras.get(clave(x, z));
        if (m && t > m.malla.userData.nace) { e.escena.remove(m.malla); mejoras.delete(clave(x, z)); }
      }
      const otra = bombaEn(x, z);
      if (otra) otra.t = Math.min(otra.t, t + 0.08); // reacción en cadena
    }
    pintarBloques();
    e.chispas(b.x, 1, b.z, ['#ff6a1e', '#ffd23c', '#3a3a44'], 22, 6);
    e.temblar(0.35);
    e.sonido.ruido(0.4, 0.28);
  };

  // ── Máquina: peligro, huida y a quién atacar ──
  const peligro = () => {
    const p = new Set<number>();
    for (const b of bombas) for (const [x, z] of cruz(b.cx, b.cz, b.llama)) p.add(clave(x, z));
    for (const k of fuego.keys()) p.add(k);
    return p;
  };
  const buscar = (j: Jugador, desde: [number, number], meta: (x: number, z: number) => boolean, evitar: Set<number>, max = 60): [number, number][] | null => {
    const previo = new Map<number, number>(), cola: [number, number][] = [desde];
    previo.set(clave(...desde), -1);
    while (cola.length) {
      const [x, z] = cola.shift()!;
      if (meta(x, z)) { const camino: [number, number][] = []; let k = clave(x, z); while (k !== clave(...desde)) { camino.unshift([k % COLS, Math.floor(k / COLS)]); k = previo.get(k)!; } return camino; }
      if (previo.size > max * 4) break;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = clave(nx, nz);
        if (previo.has(k) || !pasable(nx, nz, j) || (evitar.has(k) && fuego.has(k))) continue;
        previo.set(k, clave(x, z));
        cola.push([nx, nz]);
      }
    }
    return null;
  };
  const pensar = (j: Jugador, t: number) => {
    const aqui = celda(j.x, j.z), riesgo = peligro();
    if (riesgo.has(clave(...aqui))) { j.camino = buscar(j, aqui, (x, z) => !riesgo.has(clave(x, z)), riesgo) ?? []; return; }
    const rivales = jugadores.filter((x) => x.vivo && x !== j);
    // ¿Vale la pena una bomba aquí? (junto a una caja o con un rival en la línea de fuego) — solo si hay por dónde huir
    const alcance = cruz(aqui[0], aqui[1], j.llama), util = alcance.some(([x, z]) => tablero[z][x] === 2) || rivales.some((x) => alcance.some(([a, b]) => clave(a, b) === clave(...celda(x.x, x.z))));
    if (util && bombas.filter((b) => b.de === j).length < j.bombas && r() < 0.5 + c.nivel * 0.08) {
      const nuevo = new Set(riesgo);
      for (const [x, z] of alcance) nuevo.add(clave(x, z));
      const huida = buscar(j, aqui, (x, z) => !nuevo.has(clave(x, z)), nuevo, 20);
      if (huida && huida.length <= 4) { ponerBomba(j); j.camino = huida; return; }
    }
    // Si no: una mejora cercana, una caja para romper o acercarse al rival más cercano
    const objetivo = buscar(j, aqui, (x, z) => !riesgo.has(clave(x, z)) && (mejoras.has(clave(x, z)) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => tablero[z + dz]?.[x + dx] === 2) || rivales.some((rv) => clave(...celda(rv.x, rv.z)) === clave(x, z))), riesgo)
      ?? buscar(j, aqui, (x, z) => !riesgo.has(clave(x, z)) && Math.abs(x - 7) + Math.abs(z - 6) < 3, riesgo);
    j.camino = (objetivo ?? []).filter((p) => !riesgo.has(clave(...p))).slice(0, 6);
    j.piensa = t + 0.25 + r() * 0.3;
  };

  // ── Movimiento sobre la grilla: avanza por los pasillos y se acomoda al centro de la fila o columna ──
  const mover = (j: Jugador, dx: number, dz: number, dt: number) => {
    const paso = j.vel * dt, [cx, cz] = celda(j.x, j.z), p = centro(cx, cz);
    if (Math.abs(dx) > Math.abs(dz)) {
      const s = Math.sign(dx), sig = [cx + s, cz] as const;
      if (Math.abs(j.z - p.z) > 0.05) { j.z += Math.sign(p.z - j.z) * Math.min(paso, Math.abs(p.z - j.z)); return; }
      if (pasable(sig[0], sig[1], j) || s * (p.x - j.x) > 0.02) j.x += s * Math.min(paso, pasable(sig[0], sig[1], j) ? paso : Math.abs(p.x - j.x));
      else if (j.patear && j.humano) { const b = bombaEn(...sig); if (b && !b.desliza) b.desliza = [s, 0]; }
      j.k.grupo.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (dz) {
      const s = Math.sign(dz), sig = [cx, cz + s] as const;
      if (Math.abs(j.x - p.x) > 0.05) { j.x += Math.sign(p.x - j.x) * Math.min(paso, Math.abs(p.x - j.x)); return; }
      if (pasable(sig[0], sig[1], j) || s * (p.z - j.z) > 0.02) j.z += s * Math.min(paso, pasable(sig[0], sig[1], j) ? paso : Math.abs(p.z - j.z));
      else if (j.patear && j.humano) { const b = bombaEn(...sig); if (b && !b.desliza) b.desliza = [0, s]; }
      j.k.grupo.rotation.y = s > 0 ? 0 : Math.PI;
    }
  };

  // ── Rondas ──
  let ronda = 0, inicioRonda = 0, ganadas = 0, empezado = false, terminado = false, entreRondas = -1, cierres = 0, sobrevivido = 0;
  const ordenCierre: [number, number][] = [];
  { // espiral desde el borde hacia adentro
    let x0 = 1, z0 = 1, x1 = COLS - 2, z1 = FILAS - 2;
    while (x0 <= x1 && z0 <= z1) {
      for (let x = x0; x <= x1; x++) ordenCierre.push([x, z0]);
      for (let z = z0 + 1; z <= z1; z++) ordenCierre.push([x1, z]);
      for (let x = x1 - 1; x >= x0; x--) ordenCierre.push([x, z1]);
      for (let z = z1 - 1; z > z0; z--) ordenCierre.push([x0, z]);
      x0++; z0++; x1--; z1--;
    }
  }
  const nuevaRonda = (t: number) => {
    armarTablero(ronda);
    reiniciar();
    inicioRonda = t; cierres = 0;
    e.hud.aviso(ronda === RONDAS - 1 ? '¡Ronda final!' : `Ronda ${ronda + 1}`, 'oro', 1.4);
  };
  const morir = (j: Jugador, t: number, por?: Jugador) => {
    if (!j.vivo) return;
    j.vivo = false;
    j.aro.visible = false;
    j.k.animar('die', true);
    setTimeout(() => { if (!j.vivo) j.k.grupo.visible = false; }, 900);
    e.chispas(j.x, 1.2, j.z, [COLORES[j.id], '#ffffff'], 20, 5);
    if (por === yo && j !== yo) { yo.eliminados++; e.flotante('+150', j.x, 2, j.z, 'oro'); }
    if (j === yo) { e.sonido.mal(); sobrevivido += t - inicioRonda; e.hud.aviso('¡Te alcanzó!', 'mal', 1.2); }
  };
  const puntaje = () => ganadas * 400 + yo.eliminados * 150 + yo.mejoras * 20 + Math.round(sobrevivido * 2);
  const terminar = () => {
    terminado = true;
    e.detener();
    c.alTerminar({
      puntaje: puntaje(),
      lineas: [['Rondas ganadas', `${ganadas} de ${RONDAS}`], ['Rivales que eliminaste', String(yo.eliminados)], ['Mejoras tomadas', String(yo.mejoras)], ['Tiempo con vida', `${Math.round(sobrevivido)} s`]],
      detalle: { ganadas, eliminados: yo.eliminados, mejoras: yo.mejoras, seg: Math.round(sobrevivido) },
    });
  };
  const cerrarRonda = (t: number) => {
    const vivos = jugadores.filter((x) => x.vivo);
    if (yo.vivo) sobrevivido += t - inicioRonda;
    if (yo.vivo && vivos.length === 1) { ganadas++; e.hud.aviso('¡Ganaste la ronda!', 'oro', 1.6); e.chispas(yo.x, 1.5, yo.z, ['#ffd23c', '#3f8cff', '#ffffff'], 50, 7); e.sonido.bien(); yo.k.animar('emote-yes'); }
    else if (yo.vivo) e.hud.aviso('Se acabó el tiempo', '', 1.4);
    entreRondas = t + 2.2;
  };

  armarTablero(0);
  reiniciar();
  e.hud.tiempo(mmss(DURA_RONDA));
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    for (const f of llamas) f.scale.setScalar(1.5 + Math.sin(t * 13 + f.position.x) * 0.15);
    if (empezado && !terminado) {
      if (entreRondas >= 0) {
        if (t < entreRondas) return;
        entreRondas = -1;
        if (++ronda >= RONDAS) return terminar();
        nuevaRonda(t);
      }
      const tr = t - inicioRonda;
      // Movimiento
      for (const j of jugadores) {
        if (!j.vivo) continue;
        let dx = 0, dz = 0;
        if (j.humano) { dx = mando.x; dz = mando.z; if (mando.tomarAccion()) ponerBomba(j); }
        else {
          if (t > j.piensa || !j.camino.length) pensar(j, t);
          const sig = j.camino[0];
          if (sig) { const p = centro(...sig); dx = p.x - j.x; dz = p.z - j.z; if (Math.hypot(dx, dz) < 0.08) { j.camino.shift(); dx = dz = 0; } else if (!pasable(sig[0], sig[1], j)) j.camino = []; }
        }
        const moviendo = Math.abs(dx) > 0.15 || Math.abs(dz) > 0.15;
        if (moviendo) mover(j, dx, dz, Math.min(dt, 0.05));
        j.k.animar(moviendo ? 'sprint' : 'idle');
        // Mejoras
        const [cx, cz] = celda(j.x, j.z), m = mejoras.get(clave(cx, cz));
        if (m) {
          e.escena.remove(m.malla); mejoras.delete(clave(cx, cz));
          if (m.tipo === 'bomba') j.bombas = Math.min(6, j.bombas + 1);
          if (m.tipo === 'llama') j.llama = Math.min(7, j.llama + 1);
          if (m.tipo === 'vel') j.vel = Math.min(6.2, j.vel + 0.55);
          if (m.tipo === 'patear') j.patear = true;
          if (j.humano) { j.mejoras++; e.sonido.efecto('campana', 0.5); e.flotante(ICONO[m.tipo], j.x, 2, j.z, 'oro'); }
        }
        // Las bombas dejan de ser "propias" apenas el jugador sale de su celda
        for (const b of bombas) if (b.libres.has(j.id) && (b.cx !== cx || b.cz !== cz)) b.libres.delete(j.id);
      }
      // Bombas: deslizan si las patearon, y estallan a su hora
      for (const b of [...bombas]) {
        b.malla.scale.setScalar(1 + Math.max(0, Math.sin((t - b.t) * 18)) * 0.12 * (b.t - t < 1 ? 2 : 1));
        if (b.desliza) {
          const p = centro(b.cx + b.desliza[0], b.cz + b.desliza[1]), libre = tablero[b.cz + b.desliza[1]]?.[b.cx + b.desliza[0]] === 0 && !bombaEn(b.cx + b.desliza[0], b.cz + b.desliza[1]) && !jugadores.some((x) => x.vivo && clave(...celda(x.x, x.z)) === clave(b.cx + b.desliza![0], b.cz + b.desliza![1]));
          if (!libre) b.desliza = null;
          else { b.x += Math.sign(p.x - b.x) * Math.min(Math.abs(p.x - b.x), 9 * dt); b.z += Math.sign(p.z - b.z) * Math.min(Math.abs(p.z - b.z), 9 * dt); if (Math.hypot(p.x - b.x, p.z - b.z) < 0.01) { b.cx += b.desliza[0]; b.cz += b.desliza[1]; } }
          b.malla.position.set(b.x, 0, b.z);
        }
        if (t >= b.t) estallar(b, t);
        else if (Math.random() < dt * 20) e.chispas(b.x, 1.25, b.z, ['#ffd23c', '#ff6a1e'], 1, 1.2);
      }
      // Fuego: dibuja las llamas y quema a quien esté dentro
      let n = 0;
      for (const [k, hasta] of [...fuego]) {
        if (t > hasta) { fuego.delete(k); continue; }
        const x = k % COLS, z = Math.floor(k / COLS), p = centro(x, z), vida = (hasta - t) / FUEGO;
        o.position.set(p.x, 0.45, p.z); o.scale.set(vida, 0.4 + vida, vida); o.updateMatrix();
        llamarada.setMatrixAt(n++, o.matrix);
        for (const j of jugadores) if (j.vivo && clave(...celda(j.x, j.z)) === k) morir(j, t, quienQuemo.get(k));
      }
      llamarada.count = n;
      llamarada.instanceMatrix.needsUpdate = true;
      // El patio se cierra al final de la ronda
      if (tr > CIERRE) {
        const deben = Math.min(ordenCierre.length, Math.floor((tr - CIERRE) / 0.32));
        let cambio = false;
        while (cierres < deben) {
          const [x, z] = ordenCierre[cierres++];
          if (tablero[z][x] === 1) continue;
          tablero[z][x] = 3; cambio = true;
          const b = bombaEn(x, z); if (b) { e.escena.remove(b.malla); bombas.splice(bombas.indexOf(b), 1); }
          const m = mejoras.get(clave(x, z)); if (m) { e.escena.remove(m.malla); mejoras.delete(clave(x, z)); }
          for (const j of jugadores) if (j.vivo && clave(...celda(j.x, j.z)) === clave(x, z)) morir(j, t);
          const p = centro(x, z); e.chispas(p.x, 1.4, p.z, ['#9a97a6', '#6d6a78'], 4, 2);
        }
        if (cambio) { pintarBloques(); e.temblar(0.08); }
        if (cierres === 1) e.hud.aviso('¡El patio se está cerrando!', 'mal', 1.4);
      }
      const vivos = jugadores.filter((x) => x.vivo);
      if (!yo.vivo || vivos.length <= 1 || tr >= DURA_RONDA) cerrarRonda(t);
      e.hud.tiempo(mmss(DURA_RONDA - tr));
      e.hud.extra(`Ronda ${ronda + 1}/${RONDAS} · ${ICONO.bomba}${yo.bombas} ${ICONO.llama}${yo.llama}${yo.patear ? ' ' + ICONO.patear : ''}`);
      e.hud.puntos(puntaje());
    }
    for (const j of jugadores) { j.k.grupo.position.set(j.x, 0, j.z); j.aro.position.set(j.x, 0.03, j.z); }
    for (const m of mejoras.values()) { m.malla.rotation.y = t * 2; m.malla.position.y = Math.sin(t * 3 + m.malla.position.x) * 0.12; }
  });

  return { empezar() { e.empezar(); empezado = true; inicioRonda = e.reloj(); e.hud.aviso('Ronda 1', 'oro', 1.2); }, destruir: e.destruir };
}
