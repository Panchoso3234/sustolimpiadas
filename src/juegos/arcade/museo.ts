import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { aspectoAleatorio } from '../../personaje/catalogo';
import type { Kenney } from '../../personaje/kenney';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario, limitar, mmss, sombra } from '../reflejos/motor';
import { NIVELES } from './museoNiveles';

// Ladrón del Museo: tres pisos de un museo de noche. Junta el botín, roba el tesoro de cada piso y escapa por la puerta
// sin que te vean los guardias ni las cámaras, y sin tocar los láseres encendidos. Correr hace ruido (los guardias vienen
// a mirar); en puntillas no te oyen. Si el ojo se llena, te atrapan: vuelves al comienzo del piso. Tres vidas y 5 minutos.

const COLS = 18, FILAS = 12, CELDA = 1.2, AN = COLS * CELDA, FO = FILAS * CELDA, DURA = 300, R = 0.34;
const VISTA = 4.4 * CELDA, MEDIO = 0.55, OIDO = 2.6 * CELDA, VEL = 3.6, PUNTILLAS = 1.7, VEL_GUARDIA = 1.7;
const centro = (cx: number, cz: number) => ({ x: -AN / 2 + (cx + 0.5) * CELDA, z: -FO / 2 + (cz + 0.5) * CELDA });
const celda = (x: number, z: number): [number, number] => [Math.floor((x + AN / 2) / CELDA), Math.floor((z + FO / 2) / CELDA)];
const girar = (desde: number, hacia: number, max: number) => { let d = hacia - desde; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return desde + limitar(d, -max, max); };

/** Abanico de visión que se corta en los muros. */
interface Cono { malla: THREE.Mesh; radio: number; mover(x: number, z: number, ang: number): void }
interface Guardia { k: Kenney; cono: Cono; ronda: { x: number; z: number }[]; i: number; paso: number; x: number; z: number; ang: number; espera: number; ruta: { x: number; z: number }[]; modo: 'ronda' | 'investiga' | 'vuelve'; ve: boolean }
interface Camara { x: number; z: number; ang: number; base: number; barre: number; cono: Cono }
interface Laser { celdas: [number, number][]; prendido: number; apagado: number; desfase: number; mallas: THREE.Mesh[] }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: AN + 1.5, alto: FO * Math.sin(1.12) + 3.6, centro: [0, 0, 0.3], inclinacion: 1.12, sinPlaya: true });
  e.escena.background = new THREE.Color('#141a2e');
  const mando = crearMando(e, c.caja, 'Puntillas');
  const dificultad = 1 + (c.nivel - 1) * 0.1;

  // Piso de mármol a cuadros (una textura) bajo todos los niveles
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g2 = cv.getContext('2d')!;
  for (let i = 0; i < 4; i++) { g2.fillStyle = i % 3 ? '#d9d2c4' : '#b9b0a0'; g2.fillRect((i % 2) * 32, Math.floor(i / 2) * 32, 32, 32); }
  g2.strokeStyle = 'rgba(120,110,100,0.35)'; g2.lineWidth = 1;
  for (let i = 0; i < 6; i++) { g2.beginPath(); g2.moveTo(Math.random() * 64, 0); g2.bezierCurveTo(Math.random() * 64, 20, Math.random() * 64, 44, Math.random() * 64, 64); g2.stroke(); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(COLS / 2, FILAS / 2); tex.colorSpace = THREE.SRGBColorSpace;
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(AN, FO), new THREE.MeshLambertMaterial({ map: tex }));
  piso.rotation.x = -Math.PI / 2;
  e.escena.add(piso);
  // De noche: luz más baja y fría
  e.escena.traverse((o) => { if ((o as THREE.Light).isLight) (o as THREE.Light).intensity *= 0.75; });

  const yo = await e.personaje(c.aspecto, 1.25);
  const sombraYo = sombra(0.4); e.escena.add(sombraYo);
  let px = 0, pz = 0, ang = 0;

  // ── Lo que cambia con cada piso ──
  let grilla: string[] = [], nivel = -1, piezas = new THREE.Group(), guardias: Guardia[] = [], camaras: Camara[] = [], laseres: Laser[] = [];
  let botin = new Map<string, THREE.Object3D>(), tesoro: THREE.Object3D | null = null, tieneTesoro = false, puerta: THREE.Mesh | null = null, salida = { x: 0, z: 0 }, limpio = true;
  const solido = (cx: number, cz: number) => cx < 0 || cz < 0 || cx >= COLS || cz >= FILAS || grilla[cz][cx] === '#';
  const aLaVista = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const pasos = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
    for (let i = 1; i < pasos; i++) if (solido(...celda(a.x + ((b.x - a.x) * i) / pasos, a.z + ((b.z - a.z) * i) / pasos))) return false;
    return true;
  };
  /** Camino más corto por el piso (de celda en celda) entre dos puntos. */
  const rutaHacia = (desde: { x: number; z: number }, hasta: { x: number; z: number }) => {
    const [ax, az] = celda(desde.x, desde.z), [bx, bz] = celda(hasta.x, hasta.z), previo = new Map<string, string>([[`${ax},${az}`, '']]), cola = [[ax, az]];
    while (cola.length) {
      const [x, z] = cola.shift()!;
      if (x === bx && z === bz) break;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + dx},${z + dz}`; if (!solido(x + dx, z + dz) && !previo.has(k)) { previo.set(k, `${x},${z}`); cola.push([x + dx, z + dz]); } }
    }
    const ruta: { x: number; z: number }[] = [];
    for (let k = `${bx},${bz}`; previo.has(k) && previo.get(k) !== ''; k = previo.get(k)!) { const [x, z] = k.split(',').map(Number); ruta.unshift(centro(x, z)); }
    return ruta;
  };
  const RAYOS = 18;
  const cono = (radio: number, color: string): Cono => {
    const pos = new Float32Array((RAYOS + 2) * 3), indices: number[] = [];
    for (let k = 0; k < RAYOS; k++) indices.push(0, k + 2, k + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(indices);
    const malla = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
    malla.frustumCulled = false;
    return {
      malla, radio,
      mover(x, z, ang) {
        pos[0] = x; pos[1] = 0.05; pos[2] = z;
        for (let k = 0; k <= RAYOS; k++) {
          const a = ang - MEDIO + (2 * MEDIO * k) / RAYOS, dx = Math.sin(a), dz = Math.cos(a);
          let d = 0.15;
          while (d < radio && !solido(...celda(x + dx * d, z + dz * d))) d += 0.15;
          pos[(k + 1) * 3] = x + dx * d; pos[(k + 1) * 3 + 1] = 0.05; pos[(k + 1) * 3 + 2] = z + dz * d;
        }
        geo.attributes.position.needsUpdate = true;
      },
    };
  };
  const gema = (color: string, tam: number) => new THREE.Mesh(new THREE.OctahedronGeometry(tam), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, flatShading: true, roughness: 0.3 }));

  const armarNivel = async (n: number) => {
    e.escena.remove(piezas);
    for (const gd of guardias) e.escena.remove(gd.k.grupo);
    piezas = new THREE.Group(); e.escena.add(piezas);
    nivel = n; grilla = NIVELES[n].mapa; tieneTesoro = false; limpio = true; botin = new Map();
    const colores = ['#ff5a7a', '#5ad1ff', '#7dff8a', '#c79bff', '#ffd23c'];
    const muros = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA, 1.1, CELDA), mat('#e9e0cf'), COLS * FILAS), techo = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA * 1.01, 0.08, CELDA * 1.01), mat('#7a2e3a'), COLS * FILAS), o = new THREE.Object3D();
    let i = 0;
    grilla.forEach((fila, cz) => [...fila].forEach((t, cx) => {
      const p = centro(cx, cz);
      if (t === '#') { o.position.set(p.x, 0.55, p.z); o.updateMatrix(); muros.setMatrixAt(i, o.matrix); o.position.y = 1.12; o.updateMatrix(); techo.setMatrixAt(i++, o.matrix); }
      if (t === 'S') { px = p.x; pz = p.z; }
      if (t === 'o') { const v = gema(colores[(cx + cz) % colores.length], 0.27); v.position.set(p.x, 0.55, p.z); piezas.add(v); botin.set(`${cx},${cz}`, v); }
      if (t === 'T') {
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.6, 10), mat('#f4efe4')); pedestal.position.set(p.x, 0.3, p.z);
        tesoro = gema('#9ff3ff', 0.34); tesoro.position.set(p.x, 0.95, p.z);
        const halo = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24), new THREE.MeshBasicMaterial({ color: '#9ff3ff', transparent: true, opacity: 0.5, side: THREE.DoubleSide })); halo.rotation.x = -Math.PI / 2; halo.position.set(p.x, 0.04, p.z);
        tesoro.userData.halo = halo;
        piezas.add(pedestal, tesoro, halo);
      }
      if (t === 'X') { salida = p; puerta = new THREE.Mesh(new THREE.BoxGeometry(CELDA * 0.9, 0.06, CELDA * 0.9), new THREE.MeshBasicMaterial({ color: '#ef4b4b' })); puerta.position.set(p.x, 0.04, p.z); piezas.add(puerta); }
    }));
    muros.count = techo.count = i;
    piezas.add(muros, techo);
    // Cuadros en algunos muros (pintados por código), cada uno con su lámpara y un charco de luz en el piso
    const cuadros = ['#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f', '#9b5de5'];
    const obra = (semilla: number) => {
      const cv2 = document.createElement('canvas'); cv2.width = 64; cv2.height = 44;
      const gg = cv2.getContext('2d')!;
      gg.fillStyle = cuadros[semilla % 5]; gg.fillRect(0, 0, 64, 44);
      for (let i = 0; i < 5; i++) { gg.fillStyle = cuadros[(semilla + i + 1) % 5]; const tipo = (semilla + i) % 3, x = (semilla * 13 + i * 17) % 52, y = (semilla * 7 + i * 11) % 34; if (tipo === 0) { gg.beginPath(); gg.arc(x + 6, y + 6, 6 + (i % 3) * 2, 0, Math.PI * 2); gg.fill(); } else if (tipo === 1) gg.fillRect(x, y, 10 + i * 2, 6 + i); else { gg.beginPath(); gg.moveTo(x, y + 12); gg.lineTo(x + 8, y); gg.lineTo(x + 16, y + 12); gg.fill(); } }
      const tx = new THREE.CanvasTexture(cv2); tx.colorSpace = THREE.SRGBColorSpace; return tx;
    };
    const resplandor = (() => { const c3 = document.createElement('canvas'); c3.width = c3.height = 64; const g3 = c3.getContext('2d')!, gr = g3.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,230,160,0.45)'); gr.addColorStop(1, 'rgba(255,230,160,0)'); g3.fillStyle = gr; g3.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c3); })();
    // Jarrones y bustos sobre algunos muros interiores (como vitrinas)
    grilla.forEach((fila, cz) => [...fila].forEach((t, cx) => {
      if (t !== '#' || cx === 0 || cz === 0 || cx === COLS - 1 || cz === FILAS - 1 || (cx * 5 + cz * 11) % 4) return;
      const p = centro(cx, cz), jarron = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.14, 0], [0.2, 0.12], [0.12, 0.3], [0.09, 0.38], [0.13, 0.44], [0, 0.44]].map(([x, y]) => new THREE.Vector2(x, y)), 10), mat(['#3d85c6', '#e07a5f', '#f2cc8f', '#81b29a'][(cx + cz) % 4]));
      jarron.position.set(p.x, 1.16, p.z); piezas.add(jarron);
    }));
    // Cordón de terciopelo alrededor del tesoro
    grilla.forEach((fila, cz) => { const cx = fila.indexOf('T'); if (cx < 0) return; const p = centro(cx, cz); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 6), new THREE.MeshStandardMaterial({ color: '#d9b84a', metalness: 0.7, roughness: 0.3 })); poste.position.set(p.x + dx * 0.48, 0.3, p.z + dz * 0.48); piezas.add(poste); } for (const [w, d, dx, dz] of [[0.96, 0.04, 0, -0.48], [0.96, 0.04, 0, 0.48], [0.04, 0.96, -0.48, 0], [0.04, 0.96, 0.48, 0]]) { const cordon = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), mat('#a01a2a')); cordon.position.set(p.x + dx, 0.5, p.z + dz); piezas.add(cordon); } });
    // Cartel verde de SALIDA sobre la puerta de escape
    const cartel = document.createElement('canvas'); cartel.width = 128; cartel.height = 40;
    const gc = cartel.getContext('2d')!; gc.fillStyle = '#1f8a4c'; gc.fillRect(0, 0, 128, 40); gc.fillStyle = '#ffffff'; gc.font = 'bold 26px sans-serif'; gc.textAlign = 'center'; gc.textBaseline = 'middle'; gc.fillText('SALIDA', 64, 21);
    const texCartel = new THREE.CanvasTexture(cartel); texCartel.colorSpace = THREE.SRGBColorSpace;
    const salidaCartel = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshBasicMaterial({ map: texCartel }));
    salidaCartel.position.set(salida.x, 1.45, salida.z); salidaCartel.rotation.x = -0.6; piezas.add(salidaCartel);
    grilla.forEach((fila, cz) => [...fila].forEach((t, cx) => {
      if (t !== '#' || cz === 0 || (cx * 7 + cz * 3) % 3) return;
      const abajo = grilla[cz + 1]?.[cx];
      if (abajo !== '.' && abajo !== 'o') return;
      const p = centro(cx, cz), marco = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.62, 0.05), mat('#c9a227')), lienzo = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.5), new THREE.MeshBasicMaterial({ map: obra(cx * 3 + cz + n) }));
      marco.position.set(p.x, 0.6, p.z + CELDA / 2 + 0.03); lienzo.position.set(p.x, 0.6, p.z + CELDA / 2 + 0.06);
      const lampara = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: '#ffe9a0' })); lampara.position.set(p.x, 1.0, p.z + CELDA / 2 + 0.08);
      const charco = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: resplandor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); charco.rotation.x = -Math.PI / 2; charco.position.set(p.x, 0.02, p.z + CELDA * 0.95);
      piezas.add(marco, lienzo, lampara, charco);
    }));
    // Guardias: un personaje con gorra azul y su linterna
    const datos = NIVELES[n];
    guardias = await Promise.all(datos.guardias.map(async (ronda, k) => {
      const kk = await e.personaje({ ...aspectoAleatorio(generador(`${c.semilla}|guardia${n}|${k}`)) }, 1.3), puntos = ronda.map(([x, z]) => centro(x, z));
      // La gorra va dentro del personaje (que está escalado): se compensa para que mida lo mismo en el mundo
      const gorra = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.1, 12), mat('#1f3a8a')), s = kk.grupo.scale.y; gorra.scale.setScalar(1 / s); gorra.position.y = 1.3 / s; kk.grupo.add(gorra);
      const c2 = cono(VISTA, '#fff3a0'); piezas.add(c2.malla);
      return { k: kk, cono: c2, ronda: puntos, i: 1 % puntos.length, paso: 1, x: puntos[0].x, z: puntos[0].z, ang: 0, espera: 0, ruta: [], modo: 'ronda' as const, ve: false };
    }));
    camaras = datos.camaras.map((cm) => {
      const p = centro(cm.x, cm.z), caja = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.4), mat('#2a2a33')), luz = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: '#ff3b2e' }));
      caja.position.set(p.x, 1.0, p.z); luz.position.set(p.x, 1.14, p.z); piezas.add(caja, luz);
      const c2 = cono(VISTA * 1.05, '#ff9a9a'); piezas.add(c2.malla);
      return { x: p.x, z: p.z, ang: cm.ang, base: cm.ang, barre: cm.barre, cono: c2 };
    });
    laseres = datos.laseres.map((l) => ({ ...l, mallas: l.celdas.map(([cx, cz]) => {
      const p = centro(cx, cz), cruzaX = solido(cx - 1, cz) && solido(cx + 1, cz);
      const m = new THREE.Mesh(new THREE.BoxGeometry(cruzaX ? CELDA : 0.05, 0.05, cruzaX ? 0.05 : CELDA), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }));
      m.position.set(p.x, 0.45, p.z); piezas.add(m);
      for (const lado of [-1, 1]) { const emisor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), mat('#2a2a33')); emisor.position.set(p.x + (cruzaX ? lado * CELDA / 2 : 0), 0.35, p.z + (cruzaX ? 0 : lado * CELDA / 2)); const foco = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff2a2a' })); foco.position.copy(emisor.position).setY(0.45); piezas.add(emisor, foco); }
      return m;
    }) }));
    ang = Math.PI / 2;
    e.hud.aviso(`Piso ${n + 1}: ${datos.nombre}`, 'oro', 1.6);
  };

  // ── Partida ──
  let puntos = 0, vidas = 3, ojo = 0, quieto = 0, empezado = false, terminado = false, robados = 0;
  const terminar = (t: number, gano: boolean) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    const bono = gano ? Math.round((DURA - t) * 3) + vidas * 150 : 0;
    puntos += bono;
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Resultado', gano ? '¡Escapaste con los tres tesoros!' : `Llegaste al piso ${nivel + 1}`], ['Piezas robadas', String(robados)], ['Vidas que te quedaron', String(vidas)], ['Bono de tiempo y vidas', String(bono)]],
      detalle: { piso: nivel + 1, robados, vidas, gano },
    });
  };
  const atrapado = (t: number, por: string) => {
    vidas--; limpio = false; ojo = 0; quieto = t + 1.2;
    e.temblar(0.6); e.sonido.mal();
    e.sonido.tono(880, 0.5, { tipo: 'square', vol: 0.12, hasta: 440 });
    e.escena.background = new THREE.Color('#5a1020');
    setTimeout(() => { e.escena.background = new THREE.Color('#141a2e'); }, 450);
    e.hud.aviso(vidas > 0 ? `¡${por}! Quedan ${vidas} ♥` : '¡Te atraparon!', 'mal', 1.4);
    if (vidas <= 0) return terminar(t, false);
    const s = grilla.findIndex((f) => f.includes('S')), p = centro(grilla[s].indexOf('S'), s);
    px = p.x; pz = p.z;
    for (const gd of guardias) { gd.x = gd.ronda[0].x; gd.z = gd.ronda[0].z; gd.i = 1 % gd.ronda.length; gd.paso = 1; gd.ruta = []; gd.modo = 'ronda'; gd.espera = t + 1; }
  };

  await armarNivel(0);
  let cargando = false;
  e.hud.tiempo(mmss(DURA)); e.hud.puntos(0);

  e.alCuadro((t, dt) => {
    const paso = Math.min(dt, 0.05);
    for (const v of botin.values()) v.rotation.y += paso * 2;
    if (tesoro) { tesoro.rotation.y += paso * 1.5; tesoro.position.y = 0.95 + Math.sin(t * 2) * 0.06; }
    for (const l of laseres) { const on = (t + l.desfase) % (l.prendido + l.apagado) < l.prendido; for (const m of l.mallas) { m.visible = on || Math.sin(t * 20) > 0.6; (m.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.3; m.userData.on = on; } }
    if (empezado && !terminado && !cargando) {
      // El ladrón: corre o va en puntillas, y choca con los muros
      const puntillas = mando.pulsada, mx = mando.x, mz = mando.z, largo = Math.hypot(mx, mz), mueve = largo > 0.15 && t > quieto;
      if (mueve) {
        const v = (puntillas ? PUNTILLAS : VEL) / Math.max(1, largo);
        px += mx * v * paso; pz += mz * v * paso;
        const [cx, cz] = celda(px, pz);
        for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
          if (!solido(a, b)) continue;
          const p = centro(a, b), qx = limitar(px, p.x - CELDA / 2, p.x + CELDA / 2), qz = limitar(pz, p.z - CELDA / 2, p.z + CELDA / 2), dx = px - qx, dz = pz - qz, d = Math.hypot(dx, dz);
          if (d < R && d > 0) { px = qx + (dx / d) * R; pz = qz + (dz / d) * R; }
        }
        ang = girar(ang, Math.atan2(mx, mz), paso * 12);
      }
      yo.grupo.position.set(px, 0, pz); yo.grupo.rotation.y = ang; sombraYo.position.set(px, 0.03, pz);
      yo.animar(!mueve ? 'idle' : puntillas ? 'walk' : 'sprint');
      const [cx, cz] = celda(px, pz);
      // Botín, tesoro y puerta
      const gemaAqui = botin.get(`${cx},${cz}`);
      if (gemaAqui) { piezas.remove(gemaAqui); botin.delete(`${cx},${cz}`); puntos += 50; robados++; e.flotante('+50', px, 1.4, pz, 'oro'); e.sonido.tono(1300, 0.08, { tipo: 'triangle', vol: 0.12, hasta: 1900 }); e.chispas(px, 0.6, pz, ['#ffd23c', '#ffffff'], 10, 3); }
      if (tesoro && grilla[cz][cx] === 'T') {
        piezas.remove(tesoro, tesoro.userData.halo); tesoro = null; tieneTesoro = true; puntos += 300; robados++;
        (puerta!.material as THREE.MeshBasicMaterial).color.set('#3fe07a');
        e.chispas(px, 1, pz, ['#9ff3ff', '#ffffff', '#ffd23c'], 40, 6); e.sonido.bien();
        e.hud.aviso('¡Tesoro! La puerta se abrió', 'oro', 1.4);
      }
      if (tieneTesoro && Math.hypot(px - salida.x, pz - salida.z) < CELDA * 0.6) {
        const bono = 200 + (limpio ? 250 : 0);
        puntos += bono;
        e.chispas(px, 1, pz, ['#ffd23c', '#3f8cff', '#ffffff', '#ef5565'], 50, 7); e.sonido.efecto('campana', 0.6);
        e.flotante(limpio ? `+${bono} ¡Fantasma!` : `+${bono}`, px, 1.6, pz, 'oro');
        if (nivel >= NIVELES.length - 1) return terminar(t, true);
        cargando = true;
        armarNivel(nivel + 1).then(() => { cargando = false; quieto = t + 1.2; });
        return;
      }
      // Láseres encendidos: alarma al tocarlos
      for (const l of laseres) if (l.mallas[0].userData.on && l.celdas.some(([a, b]) => a === cx && b === cz) && t > quieto) return atrapado(t, 'Tocaste un láser');
      // Guardias: hacen su ronda; si oyen pasos, van a mirar; si te ven, se detienen a mirarte
      let visto = false, cerca = false;
      for (const gd of guardias) {
        const oye = mueve && !puntillas && Math.hypot(px - gd.x, pz - gd.z) < OIDO;
        if (oye && gd.modo !== 'investiga') { gd.ruta = rutaHacia(gd, { x: px, z: pz }); gd.modo = 'investiga'; }
        let meta: { x: number; z: number } | null = null;
        if (gd.ve) gd.ang = girar(gd.ang, Math.atan2(px - gd.x, pz - gd.z), paso * 5);
        else if (t < gd.espera) { /* se queda mirando */ }
        else if (gd.ruta.length) meta = gd.ruta[0];
        else if (gd.modo === 'investiga') { gd.modo = 'vuelve'; gd.ruta = rutaHacia(gd, gd.ronda[gd.i]); meta = gd.ruta[0] ?? null; if (!meta) gd.modo = 'ronda'; }
        else { gd.modo = 'ronda'; meta = gd.ronda[gd.i]; }
        if (meta) {
          const dx = meta.x - gd.x, dz = meta.z - gd.z, d = Math.hypot(dx, dz), v = VEL_GUARDIA * dificultad * (gd.modo === 'investiga' ? 1.35 : 1) * paso;
          if (d < v) {
            gd.x = meta.x; gd.z = meta.z;
            if (gd.ruta.length) {
              gd.ruta.shift();
              // Llegó donde oyó algo: se queda mirando un rato; o volvió a su ronda
              if (!gd.ruta.length) { if (gd.modo === 'investiga') gd.espera = t + 2.2; else gd.modo = 'ronda'; }
            } else {
              if (gd.ronda.length > 1) { if (gd.i + gd.paso >= gd.ronda.length || gd.i + gd.paso < 0) gd.paso = -gd.paso; gd.i += gd.paso; }
              gd.espera = t + 0.7;
            }
          } else { gd.x += (dx / d) * v; gd.z += (dz / d) * v; gd.ang = girar(gd.ang, Math.atan2(dx, dz), paso * 8); }
        }
        const d = Math.hypot(px - gd.x, pz - gd.z), frente = Math.abs(girar(gd.ang, Math.atan2(px - gd.x, pz - gd.z), 9) - gd.ang);
        gd.ve = t > quieto && d < VISTA && frente < MEDIO && aLaVista(gd, { x: px, z: pz });
        visto ||= gd.ve; cerca ||= gd.ve && d < 2 * CELDA;
        gd.k.grupo.position.set(gd.x, 0, gd.z); gd.k.grupo.rotation.y = gd.ang;
        gd.k.animar(meta ? (gd.modo === 'investiga' ? 'sprint' : 'walk') : 'idle');
        gd.cono.mover(gd.x, gd.z, gd.ang);
        (gd.cono.malla.material as THREE.MeshBasicMaterial).color.set(gd.ve ? '#ff5a5a' : '#fff3a0');
      }
      for (const cm of camaras) {
        cm.ang = cm.base + Math.sin(t * 0.7 * dificultad) * cm.barre;
        cm.cono.mover(cm.x, cm.z, cm.ang);
        const d = Math.hypot(px - cm.x, pz - cm.z), ve = t > quieto && d < VISTA * 1.05 && Math.abs(girar(cm.ang, Math.atan2(px - cm.x, pz - cm.z), 9) - cm.ang) < MEDIO && aLaVista(cm, { x: px, z: pz });
        visto ||= ve;
        (cm.cono.malla.material as THREE.MeshBasicMaterial).color.set(ve ? '#ff3a3a' : '#ff9a9a');
      }
      // El ojo se llena mientras te ven (de cerca, muy rápido) y baja de a poco cuando te escondes
      ojo = visto ? Math.min(1, ojo + paso * (cerca ? 3.5 : 1.6) * dificultad) : Math.max(0, ojo - paso * 0.6);
      if (visto && ojo > 0.25) limpio = false;
      if (ojo >= 1) return atrapado(t, 'Te vieron');
      if (t >= DURA) return terminar(t, false);
      e.hud.tiempo(mmss(DURA - t));
      e.hud.extra(`Piso ${nivel + 1}/3 · ${'♥'.repeat(vidas)} · 👁 ${'●'.repeat(Math.round(ojo * 5))}${'○'.repeat(5 - Math.round(ojo * 5))}${tieneTesoro ? ' · ¡A la puerta!' : ''}`);
      e.hud.puntos(puntos);
    }
  });

  return { empezar() { e.empezar(); empezado = true; quieto = 1; }, destruir: e.destruir };
}
