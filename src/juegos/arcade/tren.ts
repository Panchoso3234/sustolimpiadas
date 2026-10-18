import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { aspectoAleatorio } from '../../personaje/catalogo';
import { cielo, halo } from '../decorado';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, sombra } from '../reflejos/motor';
import { mat } from '../punteria/fisica';

// Fuga del Tren: corre sin parar por tres vías esquivando trenes. Se cambia de vía a los lados, se salta y se rueda.
// Los trenes detenidos con rampa se pueden subir y recorrer por el techo; los que vienen de frente avisan con luces.
// El mundo se arma por tramos de 60 m que salen de la semilla: el mismo recorrido para todos en un mismo desafío.
// Se juega hasta chocar (el escudo salva una vez). Cuentan los metros y las monedas.

const CARRIL = 2.5, TRAMO = 60, TRAMOS = 6, ALTO_TREN = 2.7, LARGO_VAGON = 6, GRAVEDAD = 46, SALTO = 15.5, SUPER = 21;
type Tipo = 'tren' | 'viene' | 'baja' | 'alta';
interface Obstaculo { tipo: Tipo; carril: number; z: number; largo: number; rampa: boolean; malla: THREE.Object3D; luz?: THREE.Object3D }
interface Poder { tipo: 'iman' | 'zapatillas' | 'doble' | 'escudo'; carril: number; z: number; y: number; malla: THREE.Object3D; tomado: boolean }
interface Tramo { k: number; grupo: THREE.Group; obstaculos: Obstaculo[]; monedas: { x: number; y: number; z: number; tomada: boolean }[]; poderes: Poder[] }
const ICONO = { iman: '🧲', zapatillas: '👟', doble: '×2', escudo: '🛡️' } as const;

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 10, alto: 8, centro: [0, 0, 0], inclinacion: 0.4, sinPlaya: true });
  e.camara.fov = 58;
  e.camara.far = 330;
  e.camara.updateProjectionMatrix();
  cielo(e.escena, '#ff9e7a', '#ffe2b0', '#ffb98e');
  e.escena.fog = new THREE.Fog('#ffd2a6', 90, 300);
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
  const matVias = new THREE.MeshLambertMaterial({ map: vias }), matPasto = new THREE.MeshLambertMaterial({ color: '#7fb664' }), matVereda = new THREE.MeshLambertMaterial({ color: '#c7b9a6' });

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
  const arbolPino = await e.objeto('naturaleza', 'tree_pineRoundC', 6), arbol2 = await e.objeto('naturaleza', 'tree_default', 5.5), farol = await e.objeto('pueblo', 'lantern', 3.2);
  const COLORES_EDIFICIO = ['#f2b880', '#e88a7a', '#9bc4e2', '#c9a8e8', '#f6dc8a', '#a8d8b0', '#e6e0d0'];
  const tramos: Tramo[] = [];
  const ocupadaPrevia = [Infinity, Infinity, Infinity]; // por vía, hasta dónde llega lo último puesto (se comparte entre tramos)
  const crearTramo = (kTramo: number): Tramo => {
    const r = generador(`${c.semilla}|tramo${kTramo}`), grupo = new THREE.Group(), z0 = -kTramo * TRAMO, obstaculos: Obstaculo[] = [], lista: Tramo['monedas'] = [], poderes: Poder[] = [];
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(CARRIL * 3.4, TRAMO), matVias);
    piso.rotation.x = -Math.PI / 2;
    piso.position.set(0, 0.01, z0 - TRAMO / 2);
    grupo.add(piso);
    for (const lado of [-1, 1]) {
      const vereda = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, TRAMO), matVereda), pasto = new THREE.Mesh(new THREE.PlaneGeometry(60, TRAMO), matPasto);
      vereda.position.set(lado * (CARRIL * 1.7 + 1.5), 0.15, z0 - TRAMO / 2);
      pasto.rotation.x = -Math.PI / 2;
      pasto.position.set(lado * (CARRIL * 1.7 + 33), 0, z0 - TRAMO / 2);
      grupo.add(vereda, pasto);
      // Edificios de colores con ventanas, faroles y árboles
      for (let zz = 4; zz < TRAMO; zz += 9 + r() * 6) {
        if (r() < 0.75) {
          const alto = 5 + r() * 12, ancho = 6 + r() * 4, tex = fachada.clone();
          tex.repeat.set(Math.round(ancho / 3), Math.round(alto / 3));
          tex.needsUpdate = true;
          const material = new THREE.MeshLambertMaterial({ color: COLORES_EDIFICIO[Math.floor(r() * COLORES_EDIFICIO.length)], map: tex });
          material.userData.propio = true;
          const edificio = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, 7), material);
          edificio.position.set(lado * (CARRIL * 1.7 + 4.5 + ancho / 2 + r() * 2), alto / 2, z0 - zz);
          const techo = new THREE.Mesh(new THREE.BoxGeometry(ancho + 0.4, 0.4, 7.4), mat('#5d5560'));
          techo.position.set(edificio.position.x, alto + 0.2, edificio.position.z);
          grupo.add(edificio, techo);
        } else {
          const a = (r() < 0.5 ? arbolPino : arbol2).clone();
          a.position.set(lado * (CARRIL * 1.7 + 6 + r() * 4), 0, z0 - zz);
          grupo.add(a);
        }
      }
      for (let zz = 10; zz < TRAMO; zz += 20) { const f = farol.clone(); f.position.set(lado * (CARRIL * 1.7 + 0.6), 0.3, z0 - zz); grupo.add(f); }
    }
    // Obstáculos: el primer tramo queda libre para partir tranquilo
    if (kTramo > 0) {
      const dificultad = Math.min(1, kTramo / 12) + (c.nivel - 1) * 0.08;
      let zz = 6;
      // Hasta dónde llega (hacia el fondo) lo último puesto en cada vía: un tren largo ocupa varias filas
      // Sigue del tramo anterior: si no, un tren que viene de frente podía nacer detrás de uno detenido y atravesarlo
      const ocupada = ocupadaPrevia;
      while (zz < TRAMO - 8) {
        const zFila = z0 - zz, libres = [0, 1, 2].filter((x) => ocupada[x] > zFila + 1);
        if (!libres.length) { zz += 6; continue; }
        // Siempre queda una vía sin nada; a veces, en vez de libre, tiene algo que se salta o se pasa rodando
        const libre = libres[Math.floor(r() * libres.length)], pasable = r() < 0.15;
        for (let carril = 0; carril < 3; carril++) {
          if (!libres.includes(carril) || (carril === libre && !pasable)) continue;
          // Un tren que viene de frente solo en una vía despejada hacia el jugador
          let tipo: Tipo = r() < 0.12 + dificultad * 0.15 && ocupada[carril] > zFila + 45 && carril !== libre ? 'viene' : r() < 0.55 ? 'tren' : r() < 0.5 ? 'baja' : 'alta';
          if (carril === libre) tipo = r() < 0.5 ? 'baja' : 'alta';
          const z = zFila - r() * 3;
          if (tipo === 'tren' || tipo === 'viene') {
            const cabe = Math.max(1, Math.floor((z - (z0 - TRAMO + 2)) / LARGO_VAGON));
            const n = Math.min(cabe, tipo === 'viene' ? 2 : 1 + Math.floor(r() * 3)), g = new THREE.Group(), rampa = tipo === 'tren' && r() < 0.55;
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
            }
            let luz: THREE.Object3D | undefined;
            if (tipo === 'viene') { luz = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo('rgba(255,60,40,0.95)'), depthWrite: false, blending: THREE.AdditiveBlending })); luz.scale.set(2.5, 2.5, 1); luz.position.set(0, 2.3, 0.6); g.add(luz); }
            g.position.set((carril - 1) * CARRIL, 0, z);
            grupo.add(g);
            const largo = n * LARGO_VAGON;
            obstaculos.push({ tipo, carril, z, largo, rampa, malla: g, luz });
            // Monedas por el techo de los trenes con rampa
            if (rampa) for (let q = 0; q < n * 3; q++) lista.push({ x: (carril - 1) * CARRIL, y: ALTO_TREN + 0.8, z: z - 1 - q * 2, tomada: false });
          } else {
            const g = new THREE.Group(), color = tipo === 'baja' ? '#e8443a' : '#ffb02e';
            if (tipo === 'baja') {
              for (const y of [0.35, 0.8]) { const tabla = new THREE.Mesh(new THREE.BoxGeometry(CARRIL * 0.86, 0.28, 0.18), mat(y > 0.5 ? '#f7f7f0' : color)); tabla.position.y = y; g.add(tabla); }
              for (const x of [-1, 1]) { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1, 0.14), mat('#5d5560')); pata.position.set(x * CARRIL * 0.38, 0.5, 0); g.add(pata); }
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
  for (let i = 0; i < TRAMOS; i++) tramos.push(crearTramo(i));
  const reciclar = () => {
    const viejo = tramos.shift()!;
    e.escena.remove(viejo.grupo);
    // Se liberan solo las piezas hechas para este tramo; las de los modelos se comparten entre tramos
    viejo.grupo.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (['BoxGeometry', 'PlaneGeometry', 'IcosahedronGeometry'].includes(m.geometry.type)) m.geometry.dispose();
      const material = m.material as THREE.MeshLambertMaterial;
      if (material.userData?.propio) { material.map?.dispose(); material.dispose(); }
    });
    tramos.push(crearTramo(tramos[tramos.length - 1].k + 1));
  };

  // ── Estado del corredor ──
  const yo = { carril: 1, x: 0, y: 0, vy: 0, z: 0, rueda: 0, suelo: 0, tropiezo: -9, escudo: false, invencible: 0 };
  const poder: Record<Poder['tipo'], number> = { iman: 0, zapatillas: 0, doble: 0, escudo: 0 };
  let v = 13 + (c.nivel - 1) * 0.6, empezado = false, terminado = false, monedasTotal = 0, previoX = 0, previoZ = 0, previoRueda = false, inicio = 0;
  const panel = document.createElement('div');
  panel.className = 'tren-poderes';
  c.caja.appendChild(panel);

  const terminar = (t: number, porque: string) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    k.animar('die', true);
    const metros = Math.round(-yo.z);
    c.alTerminar({
      puntaje: metros + monedasTotal * 5,
      lineas: [['Distancia', `${metros} m`], ['Monedas', String(monedasTotal)], ['Tiempo corriendo', `${Math.round(t - inicio)} s`], ['Fin', porque]],
      detalle: { metros, monedas: monedasTotal, seg: Math.round(t - inicio) },
    });
  };

  /** Altura del piso bajo el corredor en su vía (vías, techo de un tren o una rampa) y si choca de frente. */
  const pisoYChoque = (carril: number, z: number, y: number, alto: number): { piso: number; choca: Obstaculo | null } => {
    let piso = 0, choca: Obstaculo | null = null;
    for (const t of tramos) for (const o of t.obstaculos) {
      if (o.carril !== carril) continue;
      const frente = o.z + 0.4, fondo = o.z - o.largo;
      if (o.tipo === 'tren' || o.tipo === 'viene') {
        if (o.rampa && z <= o.z + 5.6 && z > frente - 0.6) piso = Math.max(piso, limitar((o.z + 5.6 - z) / 5.6, 0, 1) * ALTO_TREN);
        if (z <= frente && z >= fondo) { if (y >= ALTO_TREN - 0.45) piso = Math.max(piso, ALTO_TREN); else if (!(o.rampa && z > frente - 0.6)) choca = o; }
      } else if (Math.abs(z - o.z) < 0.45) {
        if (o.tipo === 'baja' && y < 1.0) choca = o;
        if (o.tipo === 'alta' && y + alto > 1.35 && y < 2.6) choca = o;
      }
    }
    return { piso, choca };
  };

  const camaraMira = new THREE.Vector3();
  const ubicarCamara = (dt: number, inmediata = false) => {
    const objetivo = new THREE.Vector3(yo.x * 0.55, Math.max(yo.y, yo.suelo) + 4.6, yo.z + 8.5);
    e.camara.position.lerp(objetivo, inmediata ? 1 : 1 - Math.exp(-8 * dt));
    camaraMira.set(yo.x * 0.75, Math.max(yo.y, yo.suelo) + 1.2, yo.z - 7);
    e.camara.lookAt(camaraMira);
  };

  // Solo en pruebas: "?piloto=1" corre solo (elige la vía más despejada, salta vallas y rueda bajo barras)
  const automatico = import.meta.env.DEV && new URLSearchParams(location.search).has('piloto');
  let pulso = 0;
  const pilotar = (): [number, number] => {
    pulso = 1 - pulso; // suelta entre pedidos para que cada uno cuente como un toque nuevo
    if (!pulso) return [0, 0];
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
  e.alCuadro((t, dt) => {
    if (empezado && !terminado) {
      if (!inicio) inicio = t;
      v = Math.min(34, v + dt * (0.16 + (c.nivel - 1) * 0.02));
      const paso = Math.min(dt, 0.05);
      // Controles: a los lados cambia de vía (uno por toque), arriba o Espacio salta, abajo o Shift rueda
      let mx = mando.x, mz = mando.z;
      if (automatico) [mx, mz] = pilotar();
      if (Math.abs(mx) > 0.5 && Math.abs(previoX) <= 0.5) { const nuevo = limitar(yo.carril + Math.sign(mx), 0, 2); if (nuevo !== yo.carril) { const lado = pisoYChoque(nuevo, yo.z, yo.y, 1.7); if (lado.choca && lado.choca.tipo !== 'baja' && lado.choca.tipo !== 'alta') {
          // Rozar un tren de costado: el inspector se acerca; si vuelve a pasar pronto, te atrapa
          if (t - yo.tropiezo < 3 && t > yo.invencible) { e.temblar(0.6); return terminar(t, 'Te atrapó el inspector'); }
          yo.tropiezo = t; e.temblar(0.3); e.sonido.efecto('golpe', 0.6); e.hud.aviso('¡Uy! El inspector se acerca', 'mal', 0.9);
        } else { yo.carril = nuevo; e.sonido.efecto('leve', 0.4); } } }
      previoX = mx;
      const salto = mando.tomarAccion() || (mz < -0.6 && previoZ >= -0.6);
      const rueda = (mando.agachado && !previoRueda) || (mz > 0.6 && previoZ <= 0.6);
      previoZ = mz; previoRueda = mando.agachado;
      const enSuelo = yo.y <= yo.suelo + 0.01;
      if (salto && enSuelo) { yo.vy = t < poder.zapatillas ? SUPER : SALTO; yo.rueda = 0; k.animar('jump', true); e.sonido.tono(420, 0.15, { tipo: 'triangle', vol: 0.15, hasta: 760 }); }
      if (rueda) { yo.rueda = t + 0.75; if (!enSuelo) yo.vy = -26; e.sonido.ruido(0.2, 0.08); }
      // Avance y gravedad
      yo.z -= v * paso;
      yo.x += ((yo.carril - 1) * CARRIL - yo.x) * Math.min(1, paso * 14);
      yo.vy -= GRAVEDAD * paso;
      yo.y += yo.vy * paso;
      const rodando = t < yo.rueda, { piso, choca } = pisoYChoque(yo.carril, yo.z, yo.y, rodando ? 0.8 : 1.7);
      yo.suelo = piso;
      if (yo.y <= piso) { yo.y = piso; yo.vy = 0; }
      if (choca && t > yo.invencible) {
        if (t < poder.escudo || yo.escudo) {
          poder.escudo = 0; yo.escudo = false; yo.invencible = t + 1.6;
          e.chispas(yo.x, yo.y + 1, yo.z, ['#5ad1ff', '#ffffff'], 30, 6);
          e.hud.aviso('¡El escudo te salvó!', 'oro', 1.2);
          e.temblar(0.5);
        } else {
          e.temblar(1);
          e.sonido.efecto('golpe', 0.9);
          e.chispas(yo.x, yo.y + 1.2, yo.z - 0.6, ['#ffffff', '#ffd23c', '#ef5565'], 30, 5);
          return terminar(t, choca.tipo === 'viene' ? 'Te pilló un tren de frente' : choca.tipo === 'tren' ? 'Chocaste con un tren' : choca.tipo === 'baja' ? 'Tropezaste con una valla' : 'Te golpeaste con una barra');
        }
      }
      // Trenes que vienen de frente: avanzan hacia ti y avisan con su luz
      for (const tr of tramos) for (const o of tr.obstaculos) {
        if (o.tipo !== 'viene') continue;
        const cerca = o.z - yo.z > -70 && o.z < yo.z + 5;
        if (cerca) { o.z += 12 * paso; o.malla.position.z = o.z; }
        if (o.luz) o.luz.visible = Math.sin(t * 12) > 0;
        if (cerca && !o.malla.userData.aviso && o.z - yo.z > -60 && o.carril === yo.carril) { o.malla.userData.aviso = true; e.sonido.tono(330, 0.5, { tipo: 'sawtooth', vol: 0.12 }); e.sonido.tono(262, 0.6, { tipo: 'sawtooth', vol: 0.12, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.5 }); }
      }
      // Monedas y poderes
      const iman = t < poder.iman, valor = t < poder.doble ? 2 : 1;
      for (const tr of tramos) {
        for (const mo of tr.monedas) {
          if (mo.tomada) continue;
          const dz = mo.z - yo.z, dx = mo.x - yo.x, dy = mo.y - (yo.y + 0.9);
          if (iman && Math.abs(dz) < 12 && dz < 2) { mo.x += -dx * Math.min(1, paso * 8); mo.y -= dy * Math.min(1, paso * 8); mo.z -= dz * Math.min(1, paso * 6); }
          if (Math.abs(dz) < 1 && Math.abs(dx) < 1 && Math.abs(dy) < 1.3) { mo.tomada = true; monedasTotal += valor; e.sonido.tono(1175, 0.06, { tipo: 'square', vol: 0.06 }); }
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
      e.hud.tiempo(`${metros} m`);
      e.hud.extra(`🪙 ${monedasTotal}${valor > 1 ? ' ×2' : ''}`);
      e.hud.puntos(metros + monedasTotal * 5);
      panel.innerHTML = (Object.keys(poder) as Poder['tipo'][]).filter((p) => t < poder[p]).map((p) => `<span>${ICONO[p]}${p === 'escudo' ? '' : ` ${Math.ceil(poder[p] - t)}`}</span>`).join('');
    }

    // Dibujo: corredor, inspector, monedas y poderes
    const rodando = t < yo.rueda;
    k.grupo.position.set(yo.x, yo.y, yo.z);
    k.grupo.rotation.y = Math.PI + ((yo.carril - 1) * CARRIL - yo.x) * -0.25; // se inclina hacia la vía a la que va
    k.grupo.rotation.x = rodando ? 0.45 : 0;
    k.grupo.scale.y = escalaYo * (rodando ? 0.55 : 1);
    if (!terminado && empezado) k.animar(yo.y > yo.suelo + 0.05 ? 'jump' : 'sprint');
    k.grupo.visible = t > yo.invencible || Math.sin(t * 30) > 0;
    sombraYo.position.set(yo.x, yo.suelo + 0.05, yo.z);
    // El inspector te persigue al partir y vuelve a aparecer cuando tropiezas
    const persigue = empezado && !terminado && (t - inicio < 4 || t - yo.tropiezo < 3);
    inspector.grupo.visible = persigue || (terminado && t - inicio < 6);
    if (persigue) { inspector.grupo.position.set(yo.x * 0.8, 0, yo.z + 4 + Math.sin(t * 6) * 0.3); inspector.grupo.rotation.y = Math.PI; inspector.animar('sprint'); }
    else if (!empezado) { inspector.grupo.position.set(1.5, 0, 4); inspector.grupo.rotation.y = Math.PI; inspector.animar('emote-no'); }
    let n = 0;
    for (const tr of tramos) for (const mo of tr.monedas) {
      if (mo.tomada || n >= MONEDAS) continue;
      m4.position.set(mo.x, mo.y + Math.sin(t * 4 + mo.z) * 0.12, mo.z);
      m4.rotation.set(Math.PI / 2, 0, t * 4);
      m4.updateMatrix();
      monedas.setMatrixAt(n++, m4.matrix);
    }
    monedas.count = n;
    monedas.instanceMatrix.needsUpdate = true;
    for (const tr of tramos) for (const p of tr.poderes) { p.malla.rotation.y = t * 2; p.malla.position.y = p.y + Math.sin(t * 3) * 0.2; }
    ubicarCamara(dt);
  });

  return {
    empezar() { e.empezar(); empezado = true; k.animar('sprint'); e.hud.aviso('¡Corre!', 'oro', 0.8); },
    destruir: e.destruir,
  };
}
