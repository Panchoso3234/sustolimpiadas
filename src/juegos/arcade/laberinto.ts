import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { halo, ladrillo, nocheEmbrujada } from '../decorado';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario, mmss, sombra } from '../reflejos/motor';

// Laberinto Embrujado: un laberinto de piedra de noche, con tu linterna como única luz. Junta todas las velas para
// abrir la reja de salida y pasar al piso siguiente (más grande y con más fantasmas). La linterna se gasta: las pilas
// la recargan, y un destello (Espacio) espanta a los fantasmas cercanos. Si un fantasma te toca pierdes una vida.
// Los laberintos salen de la semilla: el mismo para todos en un mismo desafío.

const DURA = 150, VIDAS = 3, T = 2.4, VEL = 4.3, RADIO = 0.42, ALTO_MURO = 1.7;
interface Fantasma { g: THREE.Group; cuerpo: THREE.Mesh; x: number; z: number; hacia: { i: number; j: number } | null; susto: number; fase: number }
interface Cosa { x: number; z: number; malla: THREE.Object3D; tomada: boolean }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 14, alto: 10, centro: [0, 0, 0], inclinacion: 1.1, sinPlaya: true });
  e.camara.far = 260; e.camara.updateProjectionMatrix();
  const mando = crearMando(e, c.caja, 'Linterna');
  const r0 = generador(`${c.semilla}|laberinto`);
  const noche = await nocheEmbrujada(e.escena, r0, { ancho: 50, fondo: 50, desde: 2, hasta: 18, niebla: [30, 120] });
  // Más oscuro que el resto de la noche: la luz la pone tu linterna
  e.escena.traverse((o) => { const l = o as THREE.Light; if (l.isLight && !(l as THREE.PointLight).isPointLight) l.intensity *= 0.55; });

  const [k] = await Promise.all([e.personaje(c.aspecto, 1.25)]);
  const sombraYo = sombra(0.45); e.escena.add(sombraYo);
  const linterna = new THREE.PointLight('#ffd9a0', 30, 12, 1.6);
  e.escena.add(linterna);
  const farolito = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe2a8' }));
  e.escena.add(farolito);
  const destello = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 32), new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  destello.rotation.x = -Math.PI / 2; e.escena.add(destello);

  // Materiales que se reusan en cada piso
  const texMuro = ladrillo('#5d5a70', '#2b2838', 4), texPiso = ladrillo('#34303f', '#1f1b27', 3);
  texPiso.repeat.set(32, 32);
  const matMuro = new THREE.MeshLambertMaterial({ map: texMuro }), matTapa = mat('#8a84a3'); // tapas claras: de arriba se distingue bien qué es muro y qué es pasillo
  const geoMuro = new THREE.BoxGeometry(T, ALTO_MURO, T), geoTapa = new THREE.BoxGeometry(T + 0.12, 0.18, T + 0.12);
  const resplandorVela = new THREE.SpriteMaterial({ map: halo('rgba(255,190,90,0.9)'), depthWrite: false, blending: THREE.AdditiveBlending });
  const resplandorPila = new THREE.SpriteMaterial({ map: halo('rgba(120,255,170,0.9)'), depthWrite: false, blending: THREE.AdditiveBlending });
  const matFantasma = new THREE.MeshLambertMaterial({ color: '#eef2ff', emissive: '#8890b8', transparent: true, opacity: 0.85 });
  const matAsustado = new THREE.MeshLambertMaterial({ color: '#7fb4ff', emissive: '#2a4cc0', transparent: true, opacity: 0.8 });
  const geoCabeza = new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), geoFalda = new THREE.CylinderGeometry(0.55, 0.7, 0.9, 14, 1, true);
  const geoOjo = new THREE.SphereGeometry(0.09, 6, 4), matOjo = new THREE.MeshBasicMaterial({ color: '#141020' });

  // ── Estado de la partida y del piso ──
  let N = 0, mapa: boolean[][] = [], salida = { i: 0, j: 0 }, grupoPiso: THREE.Group | null = null;
  let velas: Cosa[] = [], pilas: Cosa[] = [], fantasmas: Fantasma[] = [], reja: THREE.Mesh | null = null, portal: THREE.Mesh | null = null;
  const yo = { x: 0, z: 0, ang: 0, vidas: VIDAS, invencible: 0 };
  let piso = 0, bateria = 1, puntos = 0, velasTotal = 0, espantados = 0, pisos = 0, empezado = false, terminado = false, abierta = false, avisoPila = false;

  const enMundo = (i: number) => (i - N) * T; // el centro de la casilla i (el laberinto queda centrado en el origen)
  const casilla = (x: number) => Math.round(x / T + N);
  const libre = (i: number, j: number) => i >= 0 && j >= 0 && i <= 2 * N && j <= 2 * N && !mapa[i][j];

  /** Arma un piso nuevo: laberinto por "backtracking" con algunos atajos, velas, pilas, fantasmas y la reja de salida. */
  const armarPiso = () => {
    if (grupoPiso) { e.escena.remove(grupoPiso); grupoPiso.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); }); }
    for (const f of fantasmas) e.escena.remove(f.g);
    const r = generador(`${c.semilla}|laberinto|${piso}`);
    N = 6 + Math.min(3, piso) + (c.nivel > 2 ? 1 : 0);
    const L = 2 * N + 1;
    mapa = Array.from({ length: L }, () => Array(L).fill(true));
    const pila: [number, number][] = [[1, 1]];
    mapa[1][1] = false;
    while (pila.length) {
      const [i, j] = pila[pila.length - 1];
      const vecinos = ([[2, 0], [-2, 0], [0, 2], [0, -2]] as const).map(([a, b]) => [i + a, j + b] as [number, number]).filter(([a, b]) => a > 0 && b > 0 && a < L - 1 && b < L - 1 && mapa[a][b]);
      if (!vecinos.length) { pila.pop(); continue; }
      const [a, b] = vecinos[Math.floor(r() * vecinos.length)];
      mapa[(i + a) / 2][(j + b) / 2] = false; mapa[a][b] = false;
      pila.push([a, b]);
    }
    // Atajos: se abren algunos muros sueltos para que haya vueltas por donde escapar
    for (let n = 0; n < N * 2; n++) {
      const i = 1 + Math.floor(r() * (L - 2)), j = 1 + Math.floor(r() * (L - 2));
      if (mapa[i][j] && ((i % 2 === 1 && j % 2 === 0) || (i % 2 === 0 && j % 2 === 1))) mapa[i][j] = false;
    }
    salida = { i: L - 2, j: L - 2 };

    const g = new THREE.Group();
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(L * T + 8, L * T + 8), new THREE.MeshLambertMaterial({ map: texPiso }));
    suelo.rotation.x = -Math.PI / 2; g.add(suelo);
    const muros: [number, number][] = [];
    for (let i = 0; i < L; i++) for (let j = 0; j < L; j++) if (mapa[i][j]) muros.push([i, j]);
    const bloques = new THREE.InstancedMesh(geoMuro, matMuro, muros.length), tapas = new THREE.InstancedMesh(geoTapa, matTapa, muros.length), o = new THREE.Object3D();
    muros.forEach(([i, j], n) => {
      o.position.set(enMundo(i), ALTO_MURO / 2, enMundo(j)); o.updateMatrix(); bloques.setMatrixAt(n, o.matrix);
      o.position.y = ALTO_MURO + 0.09; o.updateMatrix(); tapas.setMatrixAt(n, o.matrix);
    });
    g.add(bloques, tapas);
    // Casillas libres, de la más lejana a la entrada a la más cercana: ahí van las velas
    const libres: [number, number][] = [];
    for (let i = 1; i < L - 1; i++) for (let j = 1; j < L - 1; j++) if (!mapa[i][j] && (i + j > 4) && !(i === salida.i && j === salida.j)) libres.push([i, j]);
    const sacar = () => libres.splice(Math.floor(r() * libres.length), 1)[0];
    velas = Array.from({ length: 6 + N }, () => {
      const [i, j] = sacar(), v = new THREE.Group();
      const cera = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8), mat('#f4ecd8')); cera.position.y = 0.25;
      const llama = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), new THREE.MeshBasicMaterial({ color: '#ffcf5a' })); llama.position.y = 0.6;
      const luz = new THREE.Sprite(resplandorVela); luz.scale.setScalar(1.6); luz.position.y = 0.6;
      const plato = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 10), mat('#8a7a5a'));
      v.add(cera, llama, luz, plato); v.position.set(enMundo(i), 0, enMundo(j)); g.add(v);
      return { x: v.position.x, z: v.position.z, malla: v, tomada: false };
    });
    velasTotal = velas.length;
    pilas = Array.from({ length: 3 }, () => {
      const [i, j] = sacar(), p = new THREE.Group();
      const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.45, 10), mat('#3fc79a')), polo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), mat('#d8dde8'));
      tubo.position.y = 0.45; polo.position.y = 0.72;
      const luz = new THREE.Sprite(resplandorPila); luz.scale.setScalar(1.4); luz.position.y = 0.5;
      p.add(tubo, polo, luz); p.position.set(enMundo(i), 0, enMundo(j)); g.add(p);
      return { x: p.position.x, z: p.position.z, malla: p, tomada: false };
    });
    // Reja de salida (cerrada hasta juntar todas las velas) con su portal
    const sx = enMundo(salida.i), sz = enMundo(salida.j);
    for (const d of [-1, 1]) { const poste = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.6, 0.35), mat('#2a2633')); poste.position.set(sx + d * 0.9, 1.3, sz); g.add(poste); }
    const arco = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 16, Math.PI), mat('#2a2633')); arco.position.set(sx, 2.6, sz); g.add(arco);
    reja = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.5), new THREE.MeshBasicMaterial({ color: '#1a1422', transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    reja.position.set(sx, 1.25, sz); g.add(reja);
    portal = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), new THREE.MeshBasicMaterial({ color: '#b17cff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    portal.position.set(sx, 1.3, sz + 0.02); g.add(portal);
    e.escena.add(g);
    grupoPiso = g;
    abierta = false;
    // Fantasmas: nacen lejos de la entrada
    const cuantos = 2 + Math.min(4, piso + c.nivel);
    fantasmas = Array.from({ length: cuantos }, (_, n) => {
      const lejos = libres.filter(([a, b]) => a + b > N * 2), [i, j] = lejos.length ? lejos[Math.floor(r() * lejos.length)] : sacar();
      const f = new THREE.Group(), cabeza = new THREE.Mesh(geoCabeza, matFantasma), falda = new THREE.Mesh(geoFalda, matFantasma);
      cabeza.position.y = 0.9; falda.position.y = 0.45; f.add(cabeza, falda);
      for (const d of [-1, 1]) { const ojo = new THREE.Mesh(geoOjo, matOjo); ojo.position.set(d * 0.2, 1.1, 0.48); ojo.scale.set(1, 1.6, 0.5); f.add(ojo); }
      f.position.set(enMundo(i), 0, enMundo(j)); e.escena.add(f);
      return { g: f, cuerpo: cabeza, x: f.position.x, z: f.position.z, hacia: null, susto: 0, fase: n * 1.7 };
    });
    yo.x = enMundo(1); yo.z = enMundo(1); yo.ang = 0;
  };
  armarPiso();

  /** Paso del camino más corto (por casillas) desde (i, j) hacia el destino; null si está muy lejos. */
  const hacia = (i: number, j: number, di: number, dj: number, tope: number): { i: number; j: number } | null => {
    const L = 2 * N + 1, previo = new Map<number, number>(), cola = [i * L + j];
    previo.set(i * L + j, -1);
    for (let n = 0; n < cola.length; n++) {
      const a = cola[n], ai = Math.floor(a / L), aj = a % L;
      if (ai === di && aj === dj) {
        let paso = a, largo = 0;
        while (previo.get(paso) !== i * L + j && previo.get(paso) !== -1) { paso = previo.get(paso)!; largo++; }
        return largo > tope ? null : { i: Math.floor(paso / L), j: paso % L };
      }
      for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const b = (ai + x) * L + aj + y; if (libre(ai + x, aj + y) && !previo.has(b)) { previo.set(b, a); cola.push(b); } }
    }
    return null;
  };

  const terminar = (porque: string) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    k.animar(porque === 'Se acabó el tiempo' ? 'emote-yes' : 'die', true);
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Pisos superados', String(pisos)], ['Velas', String(puntosVelas)], ['Fantasmas espantados', String(espantados)], ['Fin', porque]],
      detalle: { pisos, velas: puntosVelas, espantados, vidas: yo.vidas },
    });
  };
  let puntosVelas = 0;

  // Solo en pruebas: "?piloto=1" camina solo hacia la vela más cercana
  const automatico = import.meta.env.DEV && new URLSearchParams(location.search).has('piloto');
  const camara = (dt: number, ya = false) => {
    const objetivo = new THREE.Vector3(yo.x, 19, yo.z + 8.5);
    e.camara.position.lerp(objetivo, ya ? 1 : 1 - Math.exp(-6 * dt));
    e.camara.lookAt(yo.x, 0, yo.z - 0.6);
  };
  camara(0, true);
  e.hud.tiempo(mmss(DURA)); e.hud.puntos(0);
  let caminando = false;

  e.alCuadro((t, dt) => {
    noche.avanzar(t);
    const paso = Math.min(dt, 0.05);
    if (empezado && !terminado && t > 0) {
      // Movimiento con choque contra los muros, un eje a la vez para resbalar por las paredes
      let mx = mando.x, mz = mando.z;
      if (automatico) { const v = velas.find((x) => !x.tomada) ?? { x: enMundo(salida.i), z: enMundo(salida.j) }; const p = hacia(casilla(yo.x), casilla(yo.z), casilla(v.x), casilla(v.z), 999); if (p) { mx = enMundo(p.i) - yo.x; mz = enMundo(p.j) - yo.z; } }
      const largo = Math.hypot(mx, mz);
      if (largo > 0.15) {
        const v = (VEL * paso * Math.min(1, largo)) / Math.max(1, largo);
        const choca = (x: number, z: number) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([a, b]) => !libre(casilla(x + a * RADIO), casilla(z + b * RADIO)));
        if (!choca(yo.x + mx * v, yo.z)) yo.x += mx * v;
        if (!choca(yo.x, yo.z + mz * v)) yo.z += mz * v;
        yo.ang = Math.atan2(mx, mz);
      }
      if (largo > 0.15 !== caminando) { caminando = largo > 0.15; k.animar(caminando ? 'walk' : 'idle'); }
      // Linterna: se gasta sola; el destello espanta a los fantasmas cercanos
      bateria = Math.max(0, bateria - paso / 85);
      if (mando.tomarAccion()) {
        if (bateria >= 0.15) {
          bateria -= 0.15;
          destello.position.set(yo.x, 0.3, yo.z); destello.userData.desde = t;
          e.sonido.tono(1200, 0.25, { tipo: 'triangle', vol: 0.12, hasta: 400 });
          for (const f of fantasmas) if (Math.hypot(f.x - yo.x, f.z - yo.z) < 6) { f.susto = t + 4; f.hacia = null; }
        } else e.hud.aviso('Sin pila para el destello', '', 0.8);
      }
      if (bateria < 0.2 && !avisoPila) { avisoPila = true; e.hud.aviso('¡Se acaba la pila! Busca una verde', '', 1.4); }
      if (bateria > 0.3) avisoPila = false;
      // Velas y pilas
      for (const v of velas) if (!v.tomada && Math.hypot(v.x - yo.x, v.z - yo.z) < 0.85) {
        v.tomada = true; v.malla.visible = false; puntos += 50; puntosVelas++;
        e.flotante('+50', v.x, 1, v.z, 'bien'); e.sonido.tono(880, 0.12, { tipo: 'sine', vol: 0.12 }); e.sonido.tono(1320, 0.16, { tipo: 'sine', vol: 0.1, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.08 });
        if (velas.every((x) => x.tomada)) { abierta = true; e.hud.aviso('¡La reja se abrió! Busca la salida', 'oro', 1.6); e.sonido.bien(); }
      }
      for (const p of pilas) if (!p.tomada && Math.hypot(p.x - yo.x, p.z - yo.z) < 0.85) { p.tomada = true; p.malla.visible = false; bateria = Math.min(1, bateria + 0.45); e.hud.aviso('🔋 +45 %', 'oro', 0.8); e.sonido.efecto('campana', 0.5); }
      // Salida: con la reja abierta, se pasa al piso siguiente
      if (abierta && Math.hypot(enMundo(salida.i) - yo.x, enMundo(salida.j) - yo.z) < 1) {
        pisos++; piso++; puntos += 300;
        e.chispas(yo.x, 1, yo.z, ['#b17cff', '#ffd23c', '#ffffff'], 40, 6);
        e.hud.aviso(`¡Piso ${piso + 1}! +300`, 'oro', 1.6);
        armarPiso(); camara(0, true);
      }
      // Fantasmas: de casilla en casilla; si te ven cerca te persiguen, y si están asustados huyen
      const vel = 2.4 + Math.min(1.4, piso * 0.3) + (c.nivel - 1) * 0.15;
      const mi = casilla(yo.x), mj = casilla(yo.z);
      for (const f of fantasmas) {
        const asustado = t < f.susto;
        if (!f.hacia || Math.hypot(enMundo(f.hacia.i) - f.x, enMundo(f.hacia.j) - f.z) < 0.05) {
          const fi = casilla(f.x), fj = casilla(f.z);
          const opciones = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => ({ i: fi + a, j: fj + b })).filter((p) => libre(p.i, p.j));
          const persigue = !asustado && t > yo.invencible && t > 4 ? hacia(fi, fj, mi, mj, 6 + piso) : null; // los primeros segundos no persiguen
          if (persigue) f.hacia = persigue;
          else if (asustado) f.hacia = opciones.sort((a, b) => Math.hypot(b.i - mi, b.j - mj) - Math.hypot(a.i - mi, a.j - mj))[0] ?? null;
          else {
            const atras = f.g.userData.previo as { i: number; j: number } | undefined, sin = opciones.filter((p) => !atras || p.i !== atras.i || p.j !== atras.j);
            f.hacia = (sin.length ? sin : opciones)[Math.floor(Math.random() * (sin.length || opciones.length))] ?? null;
          }
          f.g.userData.previo = { i: fi, j: fj };
        }
        if (f.hacia) {
          const dx = enMundo(f.hacia.i) - f.x, dz = enMundo(f.hacia.j) - f.z, d = Math.hypot(dx, dz), v = Math.min(d, (asustado ? vel * 0.6 : vel) * paso);
          if (d > 0) { f.x += (dx / d) * v; f.z += (dz / d) * v; f.g.rotation.y = Math.atan2(dx, dz); }
        }
        f.cuerpo.material = asustado ? matAsustado : matFantasma;
        (f.g.children[1] as THREE.Mesh).material = f.cuerpo.material;
        f.g.position.set(f.x, 0.25 + Math.sin(t * 3 + f.fase) * 0.15, f.z);
        // ¿Te tocó?
        if (Math.hypot(f.x - yo.x, f.z - yo.z) < 0.85) {
          if (asustado) {
            espantados++; puntos += 100;
            e.flotante('+100 ¡Buu!', f.x, 1.6, f.z, 'oro'); e.chispas(f.x, 1, f.z, ['#ffffff', '#7fb4ff'], 24, 5); e.sonido.bien();
            const [i, j] = [2 * N - 1, 1]; f.x = enMundo(i); f.z = enMundo(j); f.hacia = null; f.susto = 0;
          } else if (t > yo.invencible) {
            yo.vidas--; yo.invencible = t + 2.5;
            e.temblar(0.7); e.sonido.mal(); e.chispas(yo.x, 1, yo.z, ['#ffffff', '#b17cff'], 24, 5);
            if (yo.vidas <= 0) return terminar('Te atraparon los fantasmas');
            e.hud.aviso(`¡Buuu! Te quedan ${yo.vidas}`, '', 1.3);
            yo.x = enMundo(1); yo.z = enMundo(1);
          }
        }
      }
      if (t >= DURA) return terminar('Se acabó el tiempo');
      e.hud.tiempo(mmss(DURA - t));
      e.hud.extra(`Piso ${piso + 1} · 🕯️ ${puntosVelasPiso()}/${velasTotal} · 🔦 ${Math.round(bateria * 100)} % · ${'❤️'.repeat(yo.vidas)}`);
      e.hud.puntos(puntos);
    }
    // Dibujo: personaje, su luz (más chica con poca pila) y la reja
    k.grupo.position.set(yo.x, 0, yo.z); k.grupo.rotation.y = yo.ang;
    k.grupo.visible = t > yo.invencible || Math.sin(t * 30) > 0;
    sombraYo.position.set(yo.x, 0.04, yo.z);
    farolito.position.set(yo.x + Math.sin(yo.ang + 0.7) * 0.35, 0.95, yo.z + Math.cos(yo.ang + 0.7) * 0.35);
    linterna.position.set(farolito.position.x, 2.2, farolito.position.z);
    linterna.distance = 4 + bateria * 10; linterna.intensity = 10 + bateria * 26;
    const dd = t - (destello.userData.desde ?? -9);
    (destello.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - dd * 1.6); destello.scale.setScalar(1 + dd * 18);
    if (reja && portal) { (reja.material as THREE.MeshBasicMaterial).opacity = abierta ? Math.max(0, (reja.material as THREE.MeshBasicMaterial).opacity - dt) : 0.9; (portal.material as THREE.MeshBasicMaterial).opacity = abierta ? 0.55 + Math.sin(t * 4) * 0.2 : 0; portal.rotation.z = t; }
    for (const v of velas) if (!v.tomada) v.malla.children[1].scale.y = 1 + Math.sin(t * 14 + v.x) * 0.2;
    for (const p of pilas) if (!p.tomada) { p.malla.rotation.y = t * 2; p.malla.position.y = Math.sin(t * 3 + p.x) * 0.1; }
    camara(dt);
  });
  const puntosVelasPiso = () => velas.filter((v) => v.tomada).length;

  return { empezar() { e.empezar(); empezado = true; k.animar('idle'); e.hud.aviso('¡Junta las velas!', 'oro', 1.2); }, destruir: e.destruir };
}
