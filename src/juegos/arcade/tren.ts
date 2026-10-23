import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { aspectoAleatorio } from '../../personaje/catalogo';
import { halo } from '../decorado';
import { figuraFantasma, grabadora } from '../fantasma';
import { crearMando } from '../mando';
import type { Contexto, Partida, Resultado } from '../marco';
import { crearEscenario, limitar, sombra } from '../reflejos/motor';
import { mat } from '../punteria/fisica';

// Fuga del Tren: corre sin parar por tres vías esquivando trenes. Se cambia de vía a los lados, se salta y se rueda.
// Los trenes detenidos con rampa se pueden subir y recorrer por el techo; los que vienen de frente avisan con luces.
// El mundo se arma por tramos de 60 m que salen de la semilla: el mismo recorrido para todos en un mismo desafío.
// Se juega hasta chocar (el escudo salva una vez; en práctica se reaparece una vez). Cuentan los metros (con la racha), las monedas y los bonos.
// Cada 1.000 m cambia el paisaje: ciudad, desierto, nieve y noche.

const CARRIL = 2.5, TRAMO = 60, TRAMOS = 6, ALTO_TREN = 2.7, LARGO_VAGON = 6, GRAVEDAD = 46, SALTO = 15.5, SUPER = 21;
type Tipo = 'tren' | 'viene' | 'baja' | 'alta';
interface Obstaculo { tipo: Tipo; carril: number; z: number; largo: number; rampa: boolean; malla: THREE.Object3D; luz?: THREE.Object3D; pasado?: boolean }
interface Poder { tipo: 'iman' | 'zapatillas' | 'doble' | 'escudo'; carril: number; z: number; y: number; malla: THREE.Object3D; tomado: boolean }
interface Tramo { k: number; grupo: THREE.Group; obstaculos: Obstaculo[]; monedas: { x: number; y: number; z: number; tomada: boolean; valor?: number }[]; poderes: Poder[] }
interface Bioma { nombre: string; cielo: [string, string]; niebla: string; pasto: string; vereda: string; edificios: string[]; luz: number }
const BIOMAS: Bioma[] = [
  { nombre: 'Ciudad', cielo: ['#ff9e7a', '#ffe2b0'], niebla: '#ffd2a6', pasto: '#7fb664', vereda: '#c7b9a6', edificios: ['#f2b880', '#e88a7a', '#9bc4e2', '#c9a8e8', '#f6dc8a', '#a8d8b0', '#e6e0d0'], luz: 1 },
  { nombre: 'Desierto', cielo: ['#e98a4a', '#ffe9b8'], niebla: '#f6d9a0', pasto: '#e3c27e', vereda: '#c9a66b', edificios: ['#e0b27a', '#d49a64', '#e8c99a', '#c98f5c'], luz: 1.08 },
  { nombre: 'Nieve', cielo: ['#8fb8e0', '#eef6ff'], niebla: '#dfeaf5', pasto: '#f2f6fb', vereda: '#c9d3dc', edificios: ['#b8463c', '#5c7fa8', '#e6e0d0', '#7a9a6a'], luz: 1 },
  { nombre: 'Noche', cielo: ['#0e1433', '#3a3f6e'], niebla: '#232a50', pasto: '#2f4a3a', vereda: '#5a5a6a', edificios: ['#4a4a6a', '#5a4a6a', '#3e566e', '#6a5a4a'], luz: 0.42 },
];
/** Paisaje de un tramo: cambia cada 1.000 m y vuelve a empezar después de la noche. */
const biomaDe = (kTramo: number) => Math.floor((kTramo * TRAMO + TRAMO / 2) / 1000) % BIOMAS.length;
const ICONO = { iman: '🧲', zapatillas: '👟', doble: '×2', escudo: '🛡️' } as const;
// Solo en pruebas: "?rampas=1" pone solo trenes con rampa, "?vel=34" fija la velocidad y "?paso=0.05" simula 20 cuadros/s
const DEV = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
const RAMPAS = !!DEV?.has('rampas'), VEL_FIJA = Number(DEV?.get('vel')) || 0, PASO_FIJO = Number(DEV?.get('paso')) || 0;
// "?metros=3000" parte más adelante (para revisar los paisajes sin correr todo)
const K0 = Math.floor((Number(DEV?.get('metros')) || 0) / TRAMO);

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 10, alto: 8, centro: [0, 0, 0], inclinacion: 0.4, sinPlaya: true });
  e.camara.fov = 58;
  e.camara.far = 330;
  e.camara.updateProjectionMatrix();
  // Cielo: una cúpula con degradé que sigue a la cámara; sus colores se mezclan al pasar de un paisaje a otro
  const cieloMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { arriba: { value: new THREE.Color(BIOMAS[0].cielo[0]) }, abajo: { value: new THREE.Color(BIOMAS[0].cielo[1]) } },
    vertexShader: 'varying float h; void main() { h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 arriba; uniform vec3 abajo; varying float h; void main() { gl_FragColor = vec4(mix(abajo, arriba, smoothstep(-0.05, 0.6, h)), 1.0);\n#include <colorspace_fragment>\n}',
  });
  const domo = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), cieloMat);
  domo.renderOrder = -1;
  e.escena.add(domo);
  e.escena.fog = new THREE.Fog(BIOMAS[0].niebla, 90, 300);
  e.escena.background = (e.escena.fog as THREE.Fog).color;
  const luces = e.escena.children.filter((o) => (o as THREE.Light).isLight).map((o) => ({ l: o as THREE.Light, base: (o as THREE.Light).intensity }));
  const mando = crearMando(e, c.caja, 'Saltar', 'Rodar');

  // ── Texturas: vías con durmientes sobre ripio, y fachadas con ventanas ──
  const pintar = (w: number, h: number, f: (g: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; f(cv.getContext('2d')!); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const vias = pintar(256, 64, (g) => {
    g.fillStyle = '#8c8279'; g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,30,20'},0.12)`; g.fillRect(Math.random() * 256, Math.random() * 64, 2, 2); }
    for (const cx of [43, 128, 213]) {
      g.fillStyle = '#6b4a2b'; for (const y of [6, 38]) g.fillRect(cx - 34, y, 68, 14);
      g.fillStyle = '#c9ccd4'; g.fillRect(cx - 22, 0, 5, 64); g.fillRect(cx + 17, 0, 5, 64);
    }
  });
  vias.repeat.set(1, TRAMO / 3);
  const fachada = pintar(64, 64, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#3b4a6b'; for (const x of [8, 36]) for (const y of [8, 36]) g.fillRect(x, y, 20, 18); g.fillStyle = 'rgba(255,240,170,0.9)'; g.fillRect(36, 8, 20, 18); });
  // De noche las ventanas se encienden: una segunda textura, negra salvo las ventanas, hace de brillo propio
  const ventanas = pintar(64, 64, (g) => { g.fillStyle = '#000000'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#ffd98a'; g.fillRect(36, 8, 20, 18); g.fillRect(8, 36, 20, 18); });
  const matVias = new THREE.MeshLambertMaterial({ map: vias });
  const matPasto = BIOMAS.map((b) => new THREE.MeshLambertMaterial({ color: b.pasto })), matVereda = BIOMAS.map((b) => new THREE.MeshLambertMaterial({ color: b.vereda }));
  const matHalo = new THREE.SpriteMaterial({ map: halo('rgba(255,214,140,0.9)'), depthWrite: false, blending: THREE.AdditiveBlending });
  // Flechas que brillan sobre las rampas y una franja en el techo de los trenes que se pueden subir
  const geoFlecha = new THREE.ConeGeometry(0.24, 0.5, 3), matFlecha = new THREE.MeshBasicMaterial({ color: '#ffe36b' });
  const matFranja = new THREE.MeshBasicMaterial({ color: '#3fe0a0', transparent: true, opacity: 0.55, depthWrite: false });

  // ── Modelos ──
  const r0 = generador(`${c.semilla}|tren`);
  const [loco, vagonA, vagonB, vagonC, bala] = await Promise.all([
    e.objeto('trenes', 'train-diesel-a', ALTO_TREN), e.objeto('trenes', 'train-carriage-box', ALTO_TREN), e.objeto('trenes', 'train-carriage-container-red', ALTO_TREN),
    e.objeto('trenes', 'train-carriage-container-blue', ALTO_TREN), e.objeto('trenes', 'train-electric-bullet-a', ALTO_TREN),
  ]);
  // Los modelos de tren vienen a lo largo del eje z: se estiran a un largo fijo por vagón
  for (const m of [loco, vagonA, vagonB, vagonC, bala]) { const caja = new THREE.Box3().setFromObject(m), s = caja.getSize(new THREE.Vector3()); m.scale.set((CARRIL * 0.82) / s.x * m.scale.x, m.scale.y, (LARGO_VAGON * 0.96) / s.z * m.scale.z); }
  const vagones = [vagonA, vagonB, vagonC];
  const k = await e.personaje(c.aspecto, 1.75), inspector = await e.personaje(aspectoAleatorio(generador(`${c.semilla}|inspector`)), 1.8);
  const sombraYo = sombra(0.55), escalaYo = k.grupo.scale.x;
  e.escena.add(sombraYo);
  const gorra = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.16, 10), mat('#26365c'));
  gorra.position.y = 1.85;
  inspector.grupo.add(gorra);

  // Monedas: una sola malla con instancias
  const MONEDAS = 140, monedas = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14), new THREE.MeshLambertMaterial({ color: '#ffc93c', emissive: '#a86b00', emissiveIntensity: 0.35 }), MONEDAS);
  monedas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  monedas.frustumCulled = false;
  e.escena.add(monedas);

  // ── Tramos: cada uno con sus vías, su paisaje y sus obstáculos ──
  const [arbolPino, arbol2, farol, cactus1, cactus2, arbolOscuro] = await Promise.all([e.objeto('naturaleza', 'tree_pineRoundC', 6), e.objeto('naturaleza', 'tree_default', 5.5), e.objeto('pueblo', 'lantern', 3.2),
    e.objeto('naturaleza', 'cactus_tall', 4.2), e.objeto('naturaleza', 'cactus_short', 2.6), e.objeto('naturaleza', 'tree_default_dark', 5.5)]);
  const ARBOLES = [[arbolPino, arbol2], [cactus1, cactus2], [arbolPino, arbolPino], [arbolOscuro, arbolPino]];
  const tramos: Tramo[] = [];
  const geoBaliza = new THREE.SphereGeometry(0.13, 8, 6), matBaliza = new THREE.MeshBasicMaterial({ color: '#ffb02e' });
  const ocupadaPrevia = [Infinity, Infinity, Infinity]; // por vía, hasta dónde llega lo último puesto (se comparte entre tramos)
  const crearTramo = (kTramo: number): Tramo => {
    const r = generador(`${c.semilla}|tramo${kTramo}`), grupo = new THREE.Group(), z0 = -kTramo * TRAMO, obstaculos: Obstaculo[] = [], lista: Tramo['monedas'] = [], poderes: Poder[] = [];
    const nb = biomaDe(kTramo), bioma = BIOMAS[nb], noche = bioma.nombre === 'Noche';
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(CARRIL * 3.4, TRAMO), matVias);
    piso.rotation.x = -Math.PI / 2;
    piso.position.set(0, 0.01, z0 - TRAMO / 2);
    grupo.add(piso);
    for (const lado of [-1, 1]) {
      const vereda = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, TRAMO), matVereda[nb]), pasto = new THREE.Mesh(new THREE.PlaneGeometry(60, TRAMO), matPasto[nb]);
      vereda.position.set(lado * (CARRIL * 1.7 + 1.5), 0.15, z0 - TRAMO / 2);
      pasto.rotation.x = -Math.PI / 2;
      pasto.position.set(lado * (CARRIL * 1.7 + 33), 0, z0 - TRAMO / 2);
      grupo.add(vereda, pasto);
      // Edificios de colores con ventanas, faroles y árboles
      for (let zz = 4; zz < TRAMO; zz += 9 + r() * 6) {
        if (r() < (nb === 1 ? 0.45 : 0.75)) {
          // En el desierto, casas bajas de adobe
          const alto = nb === 1 ? 3.5 + r() * 4 : 5 + r() * 12, ancho = 6 + r() * 4, tex = fachada.clone();
          tex.repeat.set(Math.round(ancho / 3), Math.round(alto / 3));
          tex.needsUpdate = true;
          const material = new THREE.MeshLambertMaterial({ color: bioma.edificios[Math.floor(r() * bioma.edificios.length)], map: tex });
          if (noche) { const brillo = ventanas.clone(); brillo.repeat.copy(tex.repeat); brillo.needsUpdate = true; material.emissive.set('#ffffff'); material.emissiveMap = brillo; material.emissiveIntensity = 0.9; }
          material.userData.propio = true;
          const edificio = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, 7), material);
          edificio.position.set(lado * (CARRIL * 1.7 + 4.5 + ancho / 2 + r() * 2), alto / 2, z0 - zz);
          const techo = new THREE.Mesh(new THREE.BoxGeometry(ancho + 0.4, 0.4, 7.4), mat(nb === 2 ? '#f4f8fc' : '#5d5560'));
          techo.position.set(edificio.position.x, alto + 0.2, edificio.position.z);
          grupo.add(edificio, techo);
        } else {
          const a = ARBOLES[nb][r() < 0.5 ? 0 : 1].clone();
          a.position.set(lado * (CARRIL * 1.7 + 6 + r() * 4), 0, z0 - zz);
          grupo.add(a);
        }
      }
      for (let zz = 10; zz < TRAMO; zz += 20) {
        const f = farol.clone(); f.position.set(lado * (CARRIL * 1.7 + 0.6), 0.3, z0 - zz); grupo.add(f);
        if (noche) { const luz = new THREE.Sprite(matHalo); luz.scale.set(3, 3, 1); luz.position.set(f.position.x, 3.1, f.position.z); grupo.add(luz); }
      }
    }
    // Obstáculos: el primer tramo queda libre para partir tranquilo
    if (kTramo > K0) {
      const dificultad = Math.min(1, kTramo / 12) + (c.nivel - 1) * 0.08;
      let zz = 6;
      // Hasta dónde llega (hacia el fondo) lo último puesto en cada vía: un tren largo ocupa varias filas
      // Sigue del tramo anterior: si no, un tren que viene de frente podía nacer detrás de uno detenido y atravesarlo
      const ocupada = ocupadaPrevia;
      while (zz < TRAMO - 8) {
        const zFila = z0 - zz, libres = [0, 1, 2].filter((x) => ocupada[x] > zFila + 1);
        if (!libres.length) { zz += 6; continue; }
        // Siempre queda una vía sin nada; a veces, en vez de libre, tiene algo que se salta o se pasa rodando
        const libre = libres[Math.floor(r() * libres.length)], pasable = !RAMPAS && r() < 0.15;
        for (let carril = 0; carril < 3; carril++) {
          if (!libres.includes(carril) || (carril === libre && !pasable)) continue;
          // Un tren que viene de frente solo en una vía despejada hacia el jugador
          let tipo: Tipo = r() < 0.12 + dificultad * 0.15 && ocupada[carril] > zFila + 45 && carril !== libre ? 'viene' : r() < 0.55 ? 'tren' : r() < 0.5 ? 'baja' : 'alta';
          if (carril === libre) tipo = r() < 0.5 ? 'baja' : 'alta';
          if (RAMPAS) tipo = 'tren';
          const z = zFila - r() * 3;
          if (tipo === 'tren' || tipo === 'viene') {
            const cabe = Math.max(1, Math.floor((z - (z0 - TRAMO + 2)) / LARGO_VAGON));
            const n = Math.min(cabe, tipo === 'viene' ? 2 : 1 + Math.floor(r() * 3)), g = new THREE.Group(), rampa = tipo === 'tren' && (r() < 0.55 || RAMPAS);
            ocupada[carril] = z - n * LARGO_VAGON - 2;
            for (let v = 0; v < n; v++) {
              const m = (v === 0 ? (tipo === 'viene' ? bala : loco) : vagones[Math.floor(r() * 3)]).clone();
              m.position.z = -v * LARGO_VAGON - LARGO_VAGON / 2;
              if (tipo === 'viene') m.rotation.y = Math.PI; // la locomotora mira hacia el jugador
              g.add(m);
            }
            if (rampa) {
              const ramp = new THREE.Mesh(new THREE.BoxGeometry(CARRIL * 0.8, 0.25, 5.6), mat('#a77b4f'));
              ramp.position.set(0, ALTO_TREN / 2, 2.75);
              ramp.rotation.x = Math.atan2(ALTO_TREN, 5.5);
              g.add(ramp);
              for (let q = 0; q < 3; q++) { const fl = new THREE.Mesh(geoFlecha, matFlecha); fl.rotation.x = -Math.PI / 2 + Math.atan2(ALTO_TREN, 5.5); fl.position.set(0, ALTO_TREN * (0.2 + q * 0.3) + 0.2, 4.6 - q * 1.7); g.add(fl); }
              const franja = new THREE.Mesh(new THREE.PlaneGeometry(CARRIL * 0.25, n * LARGO_VAGON - 1), matFranja);
              franja.rotation.x = -Math.PI / 2; franja.position.set(0, ALTO_TREN + 0.03, -(n * LARGO_VAGON) / 2); g.add(franja);
            }
            let luz: THREE.Object3D | undefined;
            if (tipo === 'viene') { luz = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(255,60,40,0.95)'), depthWrite: false, blending: THREE.AdditiveBlending })); luz.scale.set(2.5, 2.5, 1); luz.position.set(0, 2.3, 0.6); g.add(luz);
              // Franja roja sobre la vía, delante del tren: avisa por dónde viene antes de que se vea entero
              const franja = new THREE.Mesh(new THREE.PlaneGeometry(CARRIL * 0.7, 26), new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0.35, depthWrite: false }));
              (franja.material as THREE.MeshBasicMaterial).userData.propio = true; franja.rotation.x = -Math.PI / 2; franja.position.set(0, 0.06, 13.5); g.add(franja); luz.userData.franja = franja; }
            g.position.set((carril - 1) * CARRIL, 0, z);
            grupo.add(g);
            const largo = n * LARGO_VAGON;
            obstaculos.push({ tipo, carril, z, largo, rampa, malla: g, luz });
            // Monedas por el techo de los trenes con rampa
            // En los techos largos, la última es una moneda grande que vale 10
            if (rampa) for (let q = 0; q < n * 3; q++) lista.push({ x: (carril - 1) * CARRIL, y: ALTO_TREN + 0.8, z: z - 1 - q * 2, tomada: false, valor: n >= 2 && q === n * 3 - 1 ? 10 : undefined });
          } else {
            const g = new THREE.Group(), color = tipo === 'baja' ? '#e8443a' : '#ffb02e';
            if (tipo === 'baja') {
              for (const y of [0.4, 0.92]) { const tabla = new THREE.Mesh(new THREE.BoxGeometry(CARRIL * 0.86, 0.3, 0.18), mat(y > 0.5 ? '#f7f7f0' : color)); tabla.position.y = y; g.add(tabla); }
              // Dos balizas encendidas arriba: se distinguen de lejos aunque haya niebla
              for (const x of [-1, 1]) { const baliza = new THREE.Mesh(geoBaliza, matBaliza); baliza.position.set(x * CARRIL * 0.38, 1.15, 0); g.add(baliza); }
              for (const x of [-1, 1]) { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), mat('#5d5560')); pata.position.set(x * CARRIL * 0.38, 0.55, 0); g.add(pata); }
            } else {
              const barra = new THREE.Mesh(new THREE.BoxGeometry(CARRIL * 0.95, 0.5, 0.3), mat(color));
              barra.position.y = 1.55;
              const cartel = new THREE.Mesh(new THREE.BoxGeometry(CARRIL * 0.95, 0.9, 0.12), mat('#26365c'));
              cartel.position.y = 2.2;
              g.add(barra, cartel);
              for (const x of [-1, 1]) { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.16), mat('#5d5560')); pata.position.set(x * CARRIL * 0.48, 1.35, 0); g.add(pata); }
            }
            g.position.set((carril - 1) * CARRIL, 0, z);
            grupo.add(g);
            ocupada[carril] = z - 3;
            obstaculos.push({ tipo, carril, z, largo: 0.5, rampa: false, malla: g });
          }
        }
        // Una fila de monedas por la vía libre
        const zMonedas = z0 - zz - 2;
        if (r() < 0.8) for (let q = 0; q < 6; q++) lista.push({ x: (libre - 1) * CARRIL, y: 0.9, z: zMonedas - q * 2.2, tomada: false });
        zz += 22 - dificultad * 7 + r() * 6;
      }
      if (r() < 0.45) {
        const tipo = (['iman', 'zapatillas', 'doble', 'escudo'] as const)[Math.floor(r() * 4)], carril = Math.floor(r() * 3), z = z0 - TRAMO + 4;
        const malla = new THREE.Group(), burbuja = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshBasicMaterial({ color: { iman: '#ef5565', zapatillas: '#3fc79a', doble: '#ffd23c', escudo: '#5ad1ff' }[tipo], transparent: true, opacity: 0.75 }));
        malla.add(burbuja);
        malla.position.set((carril - 1) * CARRIL, 1.2, z);
        grupo.add(malla);
        poderes.push({ tipo, carril, z, y: 1.2, malla, tomado: false });
      }
    }
    e.escena.add(grupo);
    return { k: kTramo, grupo, obstaculos, monedas: lista, poderes };
  };
  for (let i = K0; i < K0 + TRAMOS; i++) tramos.push(crearTramo(i));
  const reciclar = () => {
    const viejo = tramos.shift()!;
    e.escena.remove(viejo.grupo);
    // Se liberan solo las piezas hechas para este tramo; las de los modelos se comparten entre tramos
    viejo.grupo.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (['BoxGeometry', 'PlaneGeometry', 'IcosahedronGeometry'].includes(m.geometry.type)) m.geometry.dispose();
      const material = m.material as THREE.MeshLambertMaterial;
      if (material.userData?.propio) { material.map?.dispose(); material.emissiveMap?.dispose(); material.dispose(); }
    });
    tramos.push(crearTramo(tramos[tramos.length - 1].k + 1));
  };

  // ── Estado del corredor ──
  const yo = { carril: 1, x: 0, y: 0, vy: 0, z: -K0 * TRAMO, rueda: 0, suelo: 0, tropiezo: -9, escudo: false, invencible: 0, accion: -9, combo: 0, techo: null as Obstaculo | null, aplasta: 0 };
  const poder: Record<Poder['tipo'], number> = { iman: 0, zapatillas: 0, doble: 0, escudo: 0 };
  // Opciones de este navegador: menos temblor y, solo en práctica, una partida más suave para aprender
  const OPCIONES = 'susto.tren.opciones', RECORD = 'susto.tren.record', op = { calma: false, suave: false };
  try { Object.assign(op, JSON.parse(localStorage.getItem(OPCIONES) ?? '{}')); } catch { /* sin almacenamiento */ }
  const suave = op.suave && !!c.practica, temblar = (f: number) => e.temblar(op.calma ? f * 0.25 : f);
  let record = 0;
  try { record = Number(localStorage.getItem(RECORD)) || 0; } catch { /* sin almacenamiento */ }
  let v = (suave ? 10 : 13) + (c.nivel - 1) * 0.6, empezado = false, terminado = false, monedasTotal = 0, previoX = 0, previoZ = 0, previoRueda = false, inicio = 0;
  // Puntos: la distancia cuenta con el multiplicador de la racha (sube cada 500 m sin roces ni choques) y se suman los bonos
  let puntosDist = 0, bonos = 0, rachaDesde = K0 * TRAMO, rachaNivel = 0, rachaMax = 0, revivido = false, reviveHasta = 0, cuenta = 0, finT = 0, atrapado = false, superoRecord = false, biomaVisto = Math.floor((K0 * TRAMO) / 1000), dobleToque = false;
  let resultado: Resultado | null = null;
  const multiplicador = () => 1 + rachaNivel * 0.5, puntaje = () => Math.round(puntosDist) + monedasTotal * 5 + bonos;
  const bajarRacha = () => { rachaNivel = Math.max(0, rachaNivel - 1); rachaDesde = -yo.z - rachaNivel * 500; };
  const panel = document.createElement('div');
  panel.className = 'tren-poderes';
  c.caja.appendChild(panel);

  const botonOp = document.createElement('button'), hoja = document.createElement('div');
  botonOp.className = 'tren-op'; botonOp.textContent = '⚙'; botonOp.title = 'Opciones';
  hoja.className = 'tren-hoja';
  hoja.innerHTML = '<b>Opciones</b><label><input type="checkbox" data-o="calma"> Menos temblor de cámara</label><label><input type="checkbox" data-o="suave"> Partida suave para aprender (solo en práctica, desde la próxima)</label><small>El volumen se cambia en ⚙ arriba a la derecha de la página.</small>';
  hoja.querySelectorAll('input').forEach((x) => {
    const clave = x.dataset.o as keyof typeof op;
    x.checked = op[clave];
    x.addEventListener('change', () => { op[clave] = x.checked; try { localStorage.setItem(OPCIONES, JSON.stringify(op)); } catch { /* sin almacenamiento */ } x.blur(); });
  });
  botonOp.addEventListener('click', () => { hoja.classList.toggle('visible'); botonOp.blur(); });
  c.caja.append(botonOp, hoja);

  // En pantallas táctiles, dos toques rápidos también ruedan
  let toque = { t: 0, x: 0, y: 0 }, ultimoToque = 0;
  e.escuchar(e.lienzo, 'pointerdown', (ev) => { toque = { t: performance.now(), x: ev.clientX, y: ev.clientY }; });
  e.escuchar(e.lienzo, 'pointerup', (ev) => {
    const ahora = performance.now();
    if (ahora - toque.t > 220 || Math.hypot(ev.clientX - toque.x, ev.clientY - toque.y) > 14) return;
    if (ahora - ultimoToque < 320) { dobleToque = true; ultimoToque = 0; } else ultimoToque = ahora;
  });

  // Tu récord de distancia en este navegador: una línea dorada sobre las vías
  if (record > 50) {
    const linea = new THREE.Mesh(new THREE.PlaneGeometry(CARRIL * 3.4, 0.6), new THREE.MeshBasicMaterial({ color: '#ffd23c', transparent: true, opacity: 0.85, depthWrite: false }));
    linea.rotation.x = -Math.PI / 2; linea.position.set(0, 0.06, -record);
    e.escena.add(linea);
    for (const x of [-1, 1]) { const brillo = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(255,210,60,0.95)'), depthWrite: false, blending: THREE.AdditiveBlending })); brillo.scale.set(2.4, 2.4, 1); brillo.position.set(x * CARRIL * 1.6, 1, -record); e.escena.add(brillo); }
  }

  const prueba = { techos: 0, tropiezos: 0, desdeTecho: 0, cruces: 0, fin: '' };
  if (DEV) (window as unknown as { __tren: () => unknown }).__tren = () => ({ ...prueba, metros: Math.round(-yo.z), v, terminado, puntaje: puntaje(), bonos, racha: rachaNivel, revivido, practica: !!c.practica });
  const terminar = (t: number, porque: string) => {
    if (terminado) return;
    prueba.fin = `${porque} · y ${yo.y.toFixed(2)} · suelo ${yo.suelo.toFixed(2)}`;
    terminado = true; finT = t; atrapado = porque.includes('inspector');
    botonOp.hidden = true; hoja.classList.remove('visible');
    k.animar('die', true);
    const metros = Math.round(-yo.z), nuevoRecord = metros > record;
    if (nuevoRecord) try { localStorage.setItem(RECORD, String(metros)); } catch { /* sin almacenamiento */ }
    // El resultado se entrega un momento después: antes la cámara muestra el choque de costado
    resultado = {
      puntaje: puntaje(),
      lineas: [['Distancia', `${metros} m${nuevoRecord && record ? ' · ¡récord personal!' : ''}`], ['Monedas', String(monedasTotal)], ['Racha máxima', `×${(1 + rachaMax * 0.5).toLocaleString('es-CL')}`],
        ['Bonos (justos y combos)', `+${bonos}`], ['Tiempo corriendo', `${Math.round(t - inicio)} s`], ['Fin', `${porque} (ibas a ${Math.round(v)} m/s)`]],
      detalle: { metros, monedas: monedasTotal, bonos, racha: rachaMax, seg: Math.round(t - inicio), ruta: ruta.final() },
    };
  };

  /** Altura del piso bajo el corredor en su vía (vías, techo de un tren o una rampa), en qué techo está y si choca de frente. */
  const pisoYChoque = (carril: number, z: number, y: number, alto: number): { piso: number; choca: Obstaculo | null; techo: Obstaculo | null } => {
    let piso = 0, choca: Obstaculo | null = null, techo: Obstaculo | null = null;
    for (const t of tramos) for (const o of t.obstaculos) {
      if (o.carril !== carril) continue;
      const frente = o.z + 0.4, fondo = o.z - o.largo;
      if (o.tipo === 'tren' || o.tipo === 'viene') {
        // La rampa va primero: su altura cuenta para entrar al techo (antes, a mucha velocidad, el final de la rampa se "atravesaba")
        const rampa = o.rampa && z <= o.z + 5.6 && z > frente - 0.6 ? limitar((o.z + 5.6 - z) / 5.6, 0, 1) * ALTO_TREN : 0;
        piso = Math.max(piso, rampa);
        if (z <= frente && z >= fondo) {
          // Margen al terminar la rampa: quien venía subiendo entra al techo aunque le falte un poco de altura
          if (Math.max(y, rampa) >= ALTO_TREN - 0.45 || (o.rampa && y >= ALTO_TREN * 0.55 && z > frente - 2)) { piso = Math.max(piso, ALTO_TREN); techo = o; }
          else if (!rampa) choca = o;
        }
      } else if (Math.abs(z - o.z) < 0.45) {
        if (o.tipo === 'baja' && y < 1.0) choca = o;
        if (o.tipo === 'alta' && y + alto > 1.35 && y < 2.6) choca = o;
      }
    }
    return { piso, choca, techo };
  };
  const MOTIVO: Record<Tipo, string> = {
    viene: 'Te pilló un tren de frente: los de luz roja avanzan hacia ti', tren: 'Chocaste con el frente de un vagón',
    baja: 'Tropezaste con una valla: las rojas se saltan', alta: 'Te golpeaste con una barra: las naranjas se pasan rodando',
  };
  /** Un choque sin escudo: en práctica se reaparece una vez, en la vía más despejada; si no, termina la carrera. */
  const caer = (t: number, porque: string) => {
    if (!c.practica || revivido) return terminar(t, porque);
    revivido = true; reviveHasta = t + 3; yo.invencible = t + 5; yo.tropiezo = -9; rachaNivel = 0; rachaDesde = -yo.z;
    k.animar('die', true);
    const libre = [yo.carril, 1, 0, 2].find((x) => [0, 3, 6, 9, 12, 15].every((d) => !pisoYChoque(x, yo.z - d, 0, 1.7).choca)) ?? yo.carril;
    yo.carril = libre; yo.x = (libre - 1) * CARRIL; yo.y = yo.vy = 0; yo.suelo = 0; yo.techo = null; yo.combo = 0;
  };

  const camaraMira = new THREE.Vector3(), objetivo = new THREE.Vector3();
  const ubicarCamara = (dt: number, inmediata = false) => {
    if (terminado) {
      objetivo.set(yo.x + 4.5, yo.y + 2.4, yo.z + 3.2);
      e.camara.position.lerp(objetivo, 1 - Math.exp(-3 * dt));
      camaraMira.set(yo.x, yo.y + 0.9, yo.z);
    } else {
      objetivo.set(yo.x * 0.55, Math.max(yo.y, yo.suelo) + 4.6, yo.z + 8.5);
      e.camara.position.lerp(objetivo, inmediata ? 1 : 1 - Math.exp(-8 * dt));
      camaraMira.set(yo.x * 0.75, Math.max(yo.y, yo.suelo) + 1.2, yo.z - 7);
    }
    e.camara.lookAt(camaraMira);
    // A más velocidad, la cámara abre un poco el ángulo
    const fov = 58 + limitar((v - 13) / 29, 0, 1) * 8;
    if (Math.abs(e.camara.fov - fov) > 0.05) { e.camara.fov = fov; e.camara.updateProjectionMatrix(); }
  };

  // El paisaje: cielo, niebla y luz se mezclan en los últimos 100 m antes de cada cambio
  const tono = new THREE.Color();
  const mezclar = (destino: THREE.Color, a: string, b: string, f: number) => destino.set(a).lerp(tono.set(b), f);
  const ambientar = (metros: number) => {
    const b = Math.max(0, metros) / 1000, i = Math.floor(b), f = THREE.MathUtils.smoothstep(b - i, 0.9, 1), A = BIOMAS[i % BIOMAS.length], B = BIOMAS[(i + 1) % BIOMAS.length];
    mezclar(cieloMat.uniforms.arriba.value, A.cielo[0], B.cielo[0], f);
    mezclar(cieloMat.uniforms.abajo.value, A.cielo[1], B.cielo[1], f);
    mezclar((e.escena.fog as THREE.Fog).color, A.niebla, B.niebla, f);
    const luz = A.luz + (B.luz - A.luz) * f;
    for (const { l, base } of luces) l.intensity = base * luz;
    domo.position.copy(e.camara.position);
  };

  // Líneas de viento que pasan a tu lado cuando vas muy rápido
  const VIENTO = 36, viento = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 2.4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }), VIENTO);
  viento.frustumCulled = false;
  e.escena.add(viento);
  const rafagas = Array.from({ length: VIENTO }, () => ({ x: (Math.random() - 0.5) * 12, y: 0.5 + Math.random() * 5, z: -Math.random() * 46 }));

  // Solo en pruebas: "?piloto=1" corre solo (elige la vía más despejada, salta vallas y rueda bajo barras)
  const automatico = import.meta.env.DEV && new URLSearchParams(location.search).has('piloto');
  let pulso = 0;
  const pilotar = (): [number, number] => {
    pulso = 1 - pulso; // suelta entre pedidos para que cada uno cuente como un toque nuevo
    if (!pulso) return [0, 0];
    if (RAMPAS) {
      // Prueba de rampas: sube a todos los trenes que pueda y, ya en el techo, a veces se cambia al de al lado
      const enTecho = yo.suelo >= ALTO_TREN - 0.01, todos = tramos.flatMap((t) => t.obstaculos);
      if (enTecho) return Math.sin(yo.z * 0.7) > 0.93 ? [yo.carril === 2 ? -1 : 1, 0] : [0, 0];
      if (yo.suelo > 0.01) return [0, 0];
      const subir = (x: number) => todos.some((o) => o.carril === x && o.z < yo.z - 8 && o.z > yo.z - 30) && !todos.some((o) => o.carril === x && o.z + 6 > yo.z && o.z - o.largo < yo.z + 1);
      if (!todos.some((o) => o.carril === yo.carril && o.z < yo.z && o.z > yo.z - 30)) { const x = [yo.carril - 1, yo.carril + 1].find((x) => x >= 0 && x <= 2 && subir(x)); if (x !== undefined) return [Math.sign(x - yo.carril), 0]; }
      return [0, 0];
    }
    const peligro = (carril: number, desde: number, hasta: number) => tramos.some((t) => t.obstaculos.some((o) => o.carril === carril && (o.tipo === 'tren' || o.tipo === 'viene') && !(o.rampa && o.z < yo.z - 4) && o.z - o.largo < yo.z - desde && o.z > yo.z - hasta && yo.y < ALTO_TREN - 0.4));
    if (peligro(yo.carril, 0, 16)) { const mejor = [yo.carril - 1, yo.carril + 1].filter((x) => x >= 0 && x <= 2 && !peligro(x, -2, 16)); if (mejor.length) return [Math.sign(mejor[0] - yo.carril), 0]; }
    const delante = tramos.flatMap((t) => t.obstaculos).find((o) => o.carril === yo.carril && o.z < yo.z && o.z > yo.z - 3.2);
    if (delante?.tipo === 'baja') return [0, -1];
    if (delante?.tipo === 'alta') return [0, 1];
    return [0, 0];
  };
  const m4 = new THREE.Object3D();
  e.hud.tiempo('0 m');
  e.hud.puntos(0);
  ubicarCamara(0, true);
  ambientar(0);
  // Fantasma del líder (si se juega contra él) y grabación del propio recorrido
  const ruta = grabadora(), lider = c.fantasma ? figuraFantasma(e.escena, c.fantasma, 1.75) : null;
  e.alCuadro((t, dt) => {
    if (terminado && resultado && t - finT > 1.6) { e.detener(); const r = resultado; resultado = null; c.alTerminar(r); }
    if (empezado && !terminado && t < reviveHasta) {
      // Práctica: cuenta regresiva para reaparecer
      const n = Math.ceil(reviveHasta - t);
      if (n !== cuenta) { cuenta = n; e.hud.aviso(`Reapareces en ${n}…`, 'oro', 0.9); }
    } else if (empezado && !terminado) {
      if (cuenta) { cuenta = 0; k.animar('sprint'); e.hud.aviso('¡Sigue! (te queda una vida menos)', 'oro', 0.9); }
      ruta.anotar(t, yo.x, yo.y, yo.z); lider?.mover(t);
      if (!inicio) inicio = t;
      // La velocidad sube sin parar; pasado 34 m/s, mucho más despacio, hasta 42
      v = VEL_FIJA || Math.min(42, v + dt * (0.16 + (c.nivel - 1) * 0.02) * (suave ? 0.6 : 1) * (v > 34 ? 0.3 : 1));
      const paso = PASO_FIJO || Math.min(dt, 0.05);
      // Controles: a los lados cambia de vía (uno por toque), arriba o Espacio salta, abajo o Shift rueda
      let mx = mando.x, mz = mando.z;
      if (automatico) [mx, mz] = pilotar();
      if (Math.abs(mx) > 0.5 && Math.abs(previoX) <= 0.5) {
        mando.reanclar();
        const nuevo = limitar(yo.carril + Math.sign(mx), 0, 2);
        if (nuevo !== yo.carril) {
          const lado = pisoYChoque(nuevo, yo.z, yo.y, 1.7), deCostado = !!lado.choca && lado.choca.tipo !== 'baja' && lado.choca.tipo !== 'alta';
          // A media rampa no cabes en la vía de al lado: rebota sin castigo
          if (deCostado && yo.suelo > 0.05) { e.sonido.efecto('leve', 0.3); e.hud.aviso('No cabes: hay un tren al lado', 'mal', 0.7); }
          else if (deCostado) {
            // Rozar un tren de costado: el inspector se acerca; si vuelve a pasar pronto, te atrapa
            if (t - yo.tropiezo < 3 && t > yo.invencible) { temblar(0.6); return caer(t, 'Te atrapó el inspector: dos roces seguidos'); }
            yo.tropiezo = t; prueba.tropiezos++; bajarRacha(); temblar(0.3); e.sonido.efecto('golpe', 0.6); e.hud.aviso('¡Uy! El inspector se acerca', 'mal', 0.9);
          } else { if (yo.suelo >= ALTO_TREN - 0.01) prueba.desdeTecho++; yo.carril = nuevo; e.sonido.efecto('leve', 0.4); }
        }
      }
      previoX = mx;
      const salto = mando.tomarAccion() || (mz < -0.6 && previoZ >= -0.6);
      const rueda = (mando.agachado && !previoRueda) || (mz > 0.6 && previoZ <= 0.6) || dobleToque;
      if (salto || rueda) mando.reanclar();
      previoZ = mz; previoRueda = mando.agachado; dobleToque = false;
      const enSuelo = yo.y <= yo.suelo + 0.01, enAire = yo.y > yo.suelo + 0.05;
      if (salto && enSuelo) { yo.vy = t < poder.zapatillas ? SUPER : SALTO; yo.rueda = 0; yo.accion = t; k.animar('jump', true); e.sonido.tono(420, 0.15, { tipo: 'triangle', vol: 0.15, hasta: 760 }); }
      if (rueda) { yo.rueda = t + 0.75; yo.accion = t; if (!enSuelo) yo.vy = -26; e.sonido.ruido(0.2, 0.08); }
      // Avance y gravedad en pasos de 25 cm como mucho: así nada se atraviesa aunque el juego vaya lento
      const pasos = Math.max(1, Math.ceil((v * paso) / 0.25)), sub = paso / pasos;
      for (let i = 0; i < pasos; i++) {
        yo.z -= v * sub;
        yo.x += ((yo.carril - 1) * CARRIL - yo.x) * Math.min(1, sub * 14);
        yo.vy -= GRAVEDAD * sub;
        yo.y += yo.vy * sub;
        const rodando = t < yo.rueda, { piso, choca, techo } = pisoYChoque(yo.carril, yo.z, yo.y, rodando ? 0.8 : 1.7);
        // Combo de techos: cada techo nuevo sin pisar las vías entre medio da un bono
        if (techo && techo !== yo.techo) {
          prueba.techos++; yo.combo++;
          if (yo.combo >= 2) { const b = Math.min(200, 50 * (yo.combo - 1)); bonos += b; e.hud.aviso(`Combo de techos ×${yo.combo}: +${b}`, 'oro', 0.9); }
        }
        if (techo) yo.techo = techo;
        else if (piso === 0 && yo.y <= 0.01) { yo.techo = null; yo.combo = 0; }
        yo.suelo = piso;
        if (yo.y <= piso) { yo.y = piso; yo.vy = 0; }
        if (choca && t > yo.invencible) {
          if (t < poder.escudo || yo.escudo) {
            poder.escudo = 0; yo.escudo = false; yo.invencible = t + 1.6; bajarRacha();
            e.chispas(yo.x, yo.y + 1, yo.z, ['#5ad1ff', '#ffffff'], 30, 6);
            e.hud.aviso('¡El escudo te salvó!', 'oro', 1.2);
            temblar(0.5);
          } else {
            temblar(1);
            e.sonido.efecto('golpe', 0.9);
            e.chispas(yo.x, yo.y + 1.2, yo.z - 0.6, ['#ffffff', '#ffd23c', '#ef5565'], 30, 5);
            return caer(t, MOTIVO[choca.tipo]);
          }
        }
      }
      // Al aterrizar: polvo y un pequeño aplastón
      if (enAire && yo.y <= yo.suelo + 0.01) { yo.aplasta = t + 0.16; e.chispas(yo.x, yo.suelo + 0.1, yo.z, ['#d8c8a8', '#ffffff'], 8, 2.5); }
      // Pasada justa: saltar o rodar en el último momento da un bono
      for (const tr of tramos) for (const o of tr.obstaculos) {
        if (o.pasado || (o.tipo !== 'baja' && o.tipo !== 'alta') || o.z < yo.z) continue;
        o.pasado = true;
        if (o.carril === yo.carril && t - yo.accion < 0.3) { bonos += 25; e.hud.aviso('¡Justo! +25', 'oro', 0.6); e.sonido.tono(880, 0.08, { tipo: 'triangle', vol: 0.08, hasta: 1320 }); }
      }
      // Racha: la distancia vale más mientras no choques ni roces
      puntosDist += v * paso * multiplicador();
      const nivelRacha = Math.min(4, Math.floor((-yo.z - rachaDesde) / 500));
      if (nivelRacha > rachaNivel) { rachaNivel = nivelRacha; rachaMax = Math.max(rachaMax, rachaNivel); e.hud.aviso(`¡Racha ×${multiplicador().toLocaleString('es-CL')}!`, 'oro', 1); e.sonido.efecto('campana', 0.5); }
      // Trenes que vienen de frente: avanzan hacia ti, avisan con su luz y sacan chispas de las ruedas
      for (const tr of tramos) for (const o of tr.obstaculos) {
        if (o.tipo !== 'viene') continue;
        const cerca = o.z - yo.z > -70 && o.z < yo.z + 5;
        if (cerca) { o.z += 12 * paso; o.malla.position.z = o.z; }
        if (DEV && cerca) for (const tr2 of tramos) for (const q of tr2.obstaculos) if (q !== o && q.carril === o.carril && q.z > o.z - o.largo && q.z - q.largo < o.z) prueba.cruces++;
        if (cerca && o.z - yo.z > -50 && Math.random() < 0.3) e.chispas(o.malla.position.x + (Math.random() < 0.5 ? -0.8 : 0.8), 0.25, o.z - 1, ['#ffd23c', '#ff8a2e'], 2, 2.5);
        if (o.luz) { o.luz.visible = Math.sin(t * 12) > 0; ((o.luz.userData.franja as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(t * 6)) * 0.3; }
        if (cerca && !o.malla.userData.aviso && o.z - yo.z > -60 && o.carril === yo.carril) { o.malla.userData.aviso = true; e.sonido.tono(330, 0.5, { tipo: 'sawtooth', vol: 0.12 }); e.sonido.tono(262, 0.6, { tipo: 'sawtooth', vol: 0.12, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.5 }); }
      }
      // Monedas y poderes
      const iman = t < poder.iman, valor = t < poder.doble ? 2 : 1;
      for (const tr of tramos) {
        for (const mo of tr.monedas) {
          if (mo.tomada) continue;
          const dz = mo.z - yo.z, dx = mo.x - yo.x, dy = mo.y - (yo.y + 0.9);
          if (iman && Math.abs(dz) < 12 && dz < 2) { mo.x += -dx * Math.min(1, paso * 8); mo.y -= dy * Math.min(1, paso * 8); mo.z -= dz * Math.min(1, paso * 6); }
          if (Math.abs(dz) < 1 && Math.abs(dx) < 1 && Math.abs(dy) < 1.3) {
            mo.tomada = true; monedasTotal += valor * (mo.valor ?? 1);
            if (mo.valor) { e.hud.aviso(`¡Moneda grande! +${valor * mo.valor}`, 'oro', 0.8); e.chispas(mo.x, mo.y, mo.z, ['#ffd23c', '#ffffff'], 14, 4); e.sonido.efecto('campana', 0.5); }
            else e.sonido.tono(1175, 0.06, { tipo: 'square', vol: 0.06 });
          }
        }
        for (const p of tr.poderes) {
          if (p.tomado || Math.abs(p.z - yo.z) > 1 || p.carril !== yo.carril || Math.abs(p.y - (yo.y + 0.9)) > 1.5) continue;
          p.tomado = true; p.malla.visible = false;
          poder[p.tipo] = t + (p.tipo === 'escudo' ? 999 : 10);
          if (p.tipo === 'escudo') yo.escudo = true;
          e.chispas(p.malla.position.x, 1.2, p.z, ['#ffffff', '#ffd23c'], 20, 4);
          e.sonido.efecto('campana', 0.6);
          e.hud.aviso({ iman: '¡Imán!', zapatillas: '¡Súper salto!', doble: '¡Monedas ×2!', escudo: '¡Escudo!' }[p.tipo], 'oro', 1);
        }
      }
      // Tramos nuevos por delante
      if (yo.z < -(tramos[0].k + 2) * TRAMO) reciclar();
      const metros = Math.round(-yo.z);
      if (record > 50 && !superoRecord && metros > record) { superoRecord = true; e.hud.aviso('¡Nuevo récord personal!', 'oro', 1.4); e.chispas(yo.x, 1.5, yo.z - 2, ['#ffd23c', '#ffffff', '#ff8a2e'], 30, 6); e.sonido.efecto('campana', 0.7); }
      if (Math.floor(metros / 1000) > biomaVisto) { biomaVisto = Math.floor(metros / 1000); const b = biomaVisto % BIOMAS.length; e.hud.aviso(`${['🏙️', '🏜️', '❄️', '🌙'][b]} ${BIOMAS[b].nombre}`, 'oro', 1.4); }
      e.hud.tiempo(`${metros} m`);
      e.hud.extra(`🪙 ${monedasTotal}${valor > 1 ? ' ×2' : ''}${rachaNivel ? ` · racha ×${multiplicador().toLocaleString('es-CL')}` : ''}`);
      e.hud.puntos(puntaje());
      const inspectorCerca = 3 - (t - yo.tropiezo);
      panel.innerHTML = (Object.keys(poder) as Poder['tipo'][]).filter((p) => t < poder[p]).map((p) => `<span>${ICONO[p]}${p === 'escudo' ? '' : ` ${Math.ceil(poder[p] - t)}`}</span>`).join('')
        + (inspectorCerca > 0 ? `<span class="tren-inspector" title="El inspector: otro roce antes de que se vacíe y te atrapa">👮<i style="width:${Math.round((inspectorCerca / 3) * 70)}px"></i></span>` : '');
    }

    // Dibujo: corredor, inspector, monedas, poderes, viento y paisaje
    const rodando = t < yo.rueda, enRampa = yo.suelo > 0.05 && yo.suelo < ALTO_TREN - 0.05 && yo.y <= yo.suelo + 0.05;
    k.grupo.position.set(yo.x, yo.y, yo.z);
    k.grupo.rotation.y = Math.PI + ((yo.carril - 1) * CARRIL - yo.x) * -0.25; // se inclina hacia la vía a la que va
    k.grupo.rotation.x = rodando ? 0.45 : enRampa ? -0.2 : 0; // al subir una rampa se echa hacia adelante
    k.grupo.scale.y = escalaYo * (rodando ? 0.55 : t < yo.aplasta ? 0.84 : 1);
    if (!terminado && empezado && t >= reviveHasta) k.animar(yo.y > yo.suelo + 0.05 ? 'jump' : 'sprint');
    k.grupo.visible = t > yo.invencible || Math.sin(t * 30) > 0;
    sombraYo.position.set(yo.x, yo.suelo + 0.05, yo.z);
    // El inspector te persigue al partir y vuelve a aparecer cuando tropiezas; si te atrapa, se queda a tu lado
    const persigue = empezado && !terminado && (t - inicio < 4 || t - yo.tropiezo < 3);
    inspector.grupo.visible = persigue || atrapado || (terminado && t - inicio < 6);
    if (atrapado) { inspector.grupo.position.set(yo.x + 0.9, yo.suelo, yo.z + 1); inspector.grupo.rotation.y = Math.PI * 0.75; inspector.animar('emote-no'); }
    else if (persigue) { inspector.grupo.position.set(yo.x * 0.8, 0, yo.z + 4 + Math.sin(t * 6) * 0.3); inspector.grupo.rotation.y = Math.PI; inspector.animar('sprint'); }
    else if (!empezado) { inspector.grupo.position.set(1.5, 0, 4); inspector.grupo.rotation.y = Math.PI; inspector.animar('emote-no'); }
    let n = 0;
    for (const tr of tramos) for (const mo of tr.monedas) {
      if (mo.tomada || n >= MONEDAS) continue;
      m4.position.set(mo.x, mo.y + Math.sin(t * 4 + mo.z) * 0.12, mo.z);
      m4.rotation.set(Math.PI / 2, 0, t * (mo.valor ? 6 : 4));
      m4.scale.setScalar(mo.valor ? 1.8 : 1);
      m4.updateMatrix();
      monedas.setMatrixAt(n++, m4.matrix);
    }
    monedas.count = n;
    monedas.instanceMatrix.needsUpdate = true;
    for (const tr of tramos) for (const p of tr.poderes) { p.malla.rotation.y = t * 2; p.malla.position.y = p.y + Math.sin(t * 3) * 0.2; }
    // En la nieve, las mismas piezas se vuelven copos que caen
    const nevando = Math.floor(-yo.z / 1000) % BIOMAS.length === 2, fuerza = nevando ? 1 : terminado || !empezado ? 0 : limitar((v - 24) / 12, 0, 1);
    (viento.material as THREE.MeshBasicMaterial).opacity = nevando ? 0.9 : fuerza * 0.45;
    viento.visible = fuerza > 0;
    if (fuerza > 0) {
      rafagas.forEach((r, i) => {
        r.z += (nevando ? v * 0.25 : v * 0.9) * dt;
        if (nevando) r.y = r.y - dt * 2.2 < 0 ? 6 : r.y - dt * 2.2;
        if (r.z > 6) { r.z -= 46; r.x = (Math.random() - 0.5) * 12; r.y = 0.5 + Math.random() * 5; }
        m4.position.set(yo.x + r.x, yo.y + r.y, yo.z + r.z); m4.rotation.set(0, 0, 0); if (nevando) m4.scale.set(2.5, 2.5, 0.04); else m4.scale.setScalar(1); m4.updateMatrix();
        viento.setMatrixAt(i, m4.matrix);
      });
      viento.instanceMatrix.needsUpdate = true;
    }
    ubicarCamara(dt);
    ambientar(-yo.z);
  });

  return {
    empezar() { e.empezar(); empezado = true; k.animar('sprint'); e.hud.aviso(suave ? '¡Corre! (partida suave)' : '¡Corre!', 'oro', 0.8); },
    destruir: e.destruir,
  };
}
