import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario, mmss, sombra } from '../reflejos/motor';

// Triples: concurso de triples. Cinco estaciones alrededor del arco con cinco balones cada una; el último de cada
// estación vale doble. Mantienes apretado para llenar el medidor y sueltas en la zona verde. Tres rondas de un minuto:
// en la segunda aparecen balones de oro y en la final el aro se mueve de lado a lado.

const RONDAS = 3, DURA = 60, POR_ESTACION = 5, G = 9.8, ANGULO = 0.92, ALTO_ARO = 3.05, ARO = 0.3, BOLA = 0.12, MANO = 2.2;
const ARO_Z = -7, TABLERO_Z = ARO_Z - 0.42, CARGA = 1.5, ZONA = 0.05, PERFECTO = 0.015;
// Estaciones: ángulo alrededor del aro y distancia (las esquinas, un poco más cerca)
const ESTACIONES = [[-1.2, 6.4], [-0.62, 6.8], [0, 7.1], [0.62, 6.8], [1.2, 6.4]] as const;
const vMin = 6, vMax = 11;
type Clase = 'normal' | 'dinero' | 'oro';
const VALOR: Record<Clase, number> = { normal: 100, dinero: 200, oro: 300 };
interface Balon { x: number; y: number; z: number; vx: number; vy: number; vz: number; clase: Clase; malla: THREE.Mesh; vida: number; toco: boolean; entro: boolean; antesY: number }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 15, alto: 7.5, centro: [0, 2.3, -4.5], inclinacion: 0.32, sinPlaya: true });
  e.escena.background = new THREE.Color('#1b2140');
  const r = generador(`${c.semilla}|triples`);

  // ── La cancha: parquet, líneas, aro con tablero y tribuna de fondo ──
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d')!;
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#d9a35a' : '#cf9a52'; g.fillRect(i * 16, 0, 16, 256); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3); tex.colorSpace = THREE.SRGBColorSpace;
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(22, 18), new THREE.MeshLambertMaterial({ map: tex }));
  piso.rotation.x = -Math.PI / 2; piso.position.z = -3; e.escena.add(piso);
  const linea = (geo: THREE.BufferGeometry, x: number, z: number) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z); e.escena.add(m); return m; };
  linea(new THREE.RingGeometry(6.35, 6.45, 64, 1, Math.PI * 1.08, Math.PI * 0.84), 0, ARO_Z); // la línea de tres, del lado del tirador
  const pintura = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.8), new THREE.MeshLambertMaterial({ color: '#c0483a' })); pintura.rotation.x = -Math.PI / 2; pintura.position.set(0, 0.005, ARO_Z + 2.9); e.escena.add(pintura);
  const tribuna = new THREE.Mesh(new THREE.BoxGeometry(26, 6, 1), mat('#2c3566')); tribuna.position.set(0, 3, -12.5); e.escena.add(tribuna);
  const publico = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshLambertMaterial(), 160), o = new THREE.Object3D(), tono = new THREE.Color();
  for (let i = 0; i < 160; i++) { o.position.set(-12 + (i % 40) * 0.62, 1.6 + Math.floor(i / 40) * 1.1, -12); o.updateMatrix(); publico.setMatrixAt(i, o.matrix); publico.setColorAt(i, tono.setHSL(r(), 0.6, 0.55)); }
  e.escena.add(publico);
  const aro = new THREE.Group();
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.06), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.88 }));
  tablero.position.set(0, ALTO_ARO + 0.4, TABLERO_Z - ARO_Z);
  const cuadro = new THREE.Mesh(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.6, 0.45, 0.07)), new THREE.LineBasicMaterial({ color: '#d9443a' }));
  cuadro.position.set(0, ALTO_ARO + 0.2, TABLERO_Z - ARO_Z + 0.01);
  const anillo = new THREE.Mesh(new THREE.TorusGeometry(ARO, 0.025, 8, 28), mat('#ff5a1e')); anillo.rotation.x = Math.PI / 2; anillo.position.y = ALTO_ARO;
  const red = new THREE.Mesh(new THREE.CylinderGeometry(ARO, ARO * 0.65, 0.45, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.7 })); red.position.y = ALTO_ARO - 0.23;
  const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, ALTO_ARO + 0.5), mat('#3a3a44')); poste.position.set(0, (ALTO_ARO + 0.5) / 2, TABLERO_Z - ARO_Z - 0.6);
  aro.add(tablero, cuadro, anillo, red, poste); aro.position.z = ARO_Z;
  e.escena.add(aro);

  // ── El tirador y su carro de balones ──
  const yo = await e.personaje(c.aspecto, 1.8), sombraYo = sombra(0.4); e.escena.add(sombraYo);
  const geoBola = new THREE.SphereGeometry(BOLA, 16, 12);
  const pelo = (clase: Clase) => new THREE.MeshStandardMaterial({ color: clase === 'oro' ? '#ffd23c' : clase === 'dinero' ? '#ffffff' : '#e8722a', emissive: clase === 'oro' ? '#a86a00' : '#000000', emissiveIntensity: 0.4, roughness: 0.6, metalness: clase === 'oro' ? 0.5 : 0 });
  const rayas = textura();
  function textura() { const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 32; const x = c2.getContext('2d')!; x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 32); for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#d9443a' : '#2a5bd7'; x.fillRect(i * 16, 0, 8, 32); } const t = new THREE.CanvasTexture(c2); t.colorSpace = THREE.SRGBColorSpace; return t; }
  const carro = new THREE.Group(); e.escena.add(carro);
  const enCarro: THREE.Mesh[] = [];

  // ── Medidor de fuerza (a la derecha) ──
  const medidor = document.createElement('div');
  medidor.className = 'triples-medidor';
  medidor.innerHTML = '<span class="zona"></span><span class="perfecto"></span><span class="nivel"></span>';
  c.caja.appendChild(medidor);
  const [zonaEl, perfEl, nivelEl] = [...medidor.children] as HTMLElement[];
  const boton = document.createElement('button');
  boton.className = 'boton mando-accion'; boton.textContent = 'Lanzar (mantén)';
  c.caja.appendChild(boton);

  // ── Estado ──
  let ronda = 0, estacion = 0, bola = 0, inicioRonda = 0, pausaHasta = 0, listoHasta = 0, cargando = false, carga = 0, desde = 0, puntos = 0, aciertos = 0, tiros = 0, racha = 0, siguienteRonda = 0, empezado = false, terminado = false;
  let rack: Clase[] = [];
  const balones: Balon[] = [];
  const aroX = (t: number) => (ronda === RONDAS - 1 ? Math.sin((t - inicioRonda) * 0.9) * 1.7 : 0);
  const posicion = () => { const [a, d] = ESTACIONES[estacion]; return { x: Math.sin(a) * d, z: ARO_Z + Math.cos(a) * d }; };
  /** La fuerza justa (de 0 a 1) para encestar desde la estación actual, al aro donde está ahora. */
  const ideal = (t: number) => {
    const p = posicion(), d = Math.hypot(aroX(t) - p.x, ARO_Z - p.z), dh = ALTO_ARO - MANO;
    const v = Math.sqrt((G * d * d) / (2 * Math.cos(ANGULO) ** 2 * (d * Math.tan(ANGULO) - dh)));
    return (v - vMin) / (vMax - vMin);
  };
  const armarRack = () => {
    rack = Array.from({ length: POR_ESTACION }, (_, i) => (i === POR_ESTACION - 1 ? 'dinero' : ronda === 1 && r() < 0.3 ? 'oro' : 'normal'));
    for (const m of enCarro) carro.remove(m);
    enCarro.length = 0;
    rack.forEach((clase, i) => { const m = new THREE.Mesh(geoBola, clase === 'dinero' ? new THREE.MeshStandardMaterial({ map: rayas }) : pelo(clase)); m.position.set(0.25 * (i - 2), 0.95, 0); carro.add(m); enCarro.push(m); });
    const p = posicion();
    yo.grupo.position.set(p.x, 0, p.z); sombraYo.position.set(p.x, 0.02, p.z);
    yo.grupo.rotation.y = Math.atan2(-p.x, ARO_Z - p.z);
    carro.position.set(p.x + Math.cos(yo.grupo.rotation.y) * 0.9, 0, p.z - Math.sin(yo.grupo.rotation.y) * 0.9);
    carro.rotation.y = yo.grupo.rotation.y;
    bola = 0;
  };
  const empezarRonda = (t: number) => {
    inicioRonda = t; estacion = 0; armarRack();
    e.hud.aviso(ronda === 0 ? '¡A tirar!' : ronda === 1 ? 'Ronda 2: ¡balones de oro!' : 'Ronda final: ¡el aro se mueve!', 'oro', 1.5);
  };

  const lanzar = (t: number) => {
    if (!cargando) return;
    cargando = false;
    if (bola >= POR_ESTACION || t < listoHasta || t < pausaHasta) return;
    // Cerca de la fuerza justa, la mano corrige un poco (como en los juegos de básquet); lejos, no
    const justo = ideal(t), error = carga - justo, p = Math.abs(error) < ZONA ? justo + error * 0.4 : carga;
    const v = vMin + p * (vMax - vMin), pos = posicion(), dirAng = Math.atan2(aroX(t) - pos.x, ARO_Z - pos.z);
    const clase = rack[bola], malla = new THREE.Mesh(geoBola, clase === 'dinero' ? new THREE.MeshStandardMaterial({ map: rayas }) : pelo(clase));
    e.escena.add(malla);
    carro.remove(enCarro[bola]);
    balones.push({ x: pos.x, y: MANO, z: pos.z, vx: Math.sin(dirAng) * Math.cos(ANGULO) * v, vy: Math.sin(ANGULO) * v, vz: Math.cos(dirAng) * Math.cos(ANGULO) * v, clase, malla, vida: 0, toco: false, entro: false, antesY: MANO });
    bola++; tiros++; listoHasta = t + 0.45;
    e.gesto(yo, 'jump', 0.5);
    e.sonido.tono(240, 0.08, { tipo: 'triangle', vol: 0.12 });
    if (Math.abs(error) < PERFECTO) e.hud.aviso('¡Perfecto!', 'oro', 0.5);
  };
  const apretar = () => { if (empezado && !terminado) { cargando = true; desde = e.reloj(); } };
  e.escuchar(e.lienzo, 'pointerdown', apretar);
  e.escuchar(window, 'pointerup', () => lanzar(e.reloj()));
  e.escuchar(window, 'keydown', (ev) => { if (ev.key === ' ') { ev.preventDefault(); if (!ev.repeat) apretar(); } });
  e.escuchar(window, 'keyup', (ev) => { if (ev.key === ' ') lanzar(e.reloj()); });
  boton.addEventListener('pointerdown', (ev) => { ev.preventDefault(); apretar(); });

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    e.detener();
    c.alTerminar({ puntaje: puntos, lineas: [['Canastas', `${aciertos} de ${tiros}`], ['Efectividad', `${tiros ? Math.round((aciertos / tiros) * 100) : 0} %`]], detalle: { aciertos, tiros } });
  };

  /** Rebotes del balón: piso, tablero y aro (un anillo); la canasta cuenta al cruzar el aro hacia abajo por dentro. */
  const fisica = (b: Balon, dt: number, t: number) => {
    b.antesY = b.y;
    b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    const ax = aroX(t);
    if (b.y < BOLA) { b.y = BOLA; b.vy = Math.abs(b.vy) * 0.6; b.vx *= 0.8; b.vz *= 0.8; if (Math.abs(b.vy) > 1) e.sonido.tono(120, 0.06, { tipo: 'sine', vol: 0.15 }); }
    if (b.z - BOLA < TABLERO_Z && b.z > TABLERO_Z - 0.3 && Math.abs(b.x - ax) < 0.9 && b.y > ALTO_ARO - 0.12 && b.y < ALTO_ARO + 0.93 && b.vz < 0) { b.z = TABLERO_Z + BOLA; b.vz = -b.vz * 0.7; b.toco = true; e.sonido.tono(180, 0.05, { tipo: 'square', vol: 0.08 }); }
    // El aro: el punto del anillo más cercano al balón
    const dx = b.x - ax, dz = b.z - ARO_Z, dh = Math.hypot(dx, dz) || 1e-6, px = ax + (dx / dh) * ARO, pz = ARO_Z + (dz / dh) * ARO;
    const nx = b.x - px, ny = b.y - ALTO_ARO, nz = b.z - pz, d = Math.hypot(nx, ny, nz), junto = BOLA + 0.025;
    if (d < junto && d > 0) {
      const ux = nx / d, uy = ny / d, uz = nz / d, hacia = b.vx * ux + b.vy * uy + b.vz * uz;
      b.x = px + ux * junto; b.y = ALTO_ARO + uy * junto; b.z = pz + uz * junto;
      if (hacia < 0) { b.vx -= 1.6 * hacia * ux; b.vy -= 1.6 * hacia * uy; b.vz -= 1.6 * hacia * uz; b.vx *= 0.85; b.vz *= 0.85; }
      if (!b.toco) e.sonido.tono(420, 0.08, { tipo: 'square', vol: 0.06 });
      b.toco = true;
    }
    if (!b.entro && b.antesY >= ALTO_ARO && b.y < ALTO_ARO && Math.hypot(b.x - ax, b.z - ARO_Z) < ARO - BOLA * 0.3) {
      b.entro = true; aciertos++; racha++;
      const limpio = !b.toco, bono = (limpio ? 50 : 0) + (racha >= 3 ? 25 * Math.min(4, racha - 2) : 0), valor = VALOR[b.clase] + bono;
      puntos += valor;
      e.flotante(`+${valor}${limpio ? ' ¡limpio!' : ''}`, ax, ALTO_ARO + 0.6, ARO_Z, 'oro');
      e.chispas(ax, ALTO_ARO - 0.3, ARO_Z, b.clase === 'oro' ? ['#ffd23c', '#ffffff'] : ['#ffffff', '#ff5a1e', '#3f8cff'], b.clase === 'normal' ? 16 : 34, 4);
      e.sonido.efecto(limpio ? 'campana' : 'bien', 0.5) || e.sonido.bien();
      red.scale.set(1, 1.25, 1);
    }
  };

  e.hud.tiempo(mmss(DURA)); e.hud.puntos(0);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__triples = { ideal: () => ideal(e.reloj()), estado: () => ({ puntos, aciertos, tiros }) };
  e.alCuadro((t, dt) => {
    const paso = Math.min(dt, 0.05);
    red.scale.y += (1 - red.scale.y) * Math.min(1, paso * 8);
    aro.position.x = aroX(t);
    for (let i = balones.length - 1; i >= 0; i--) {
      const b = balones[i];
      for (let s = 0; s < 4; s++) fisica(b, paso / 4, t);
      b.vida += paso;
      b.malla.position.set(b.x, b.y, b.z); b.malla.rotation.x -= paso * 8;
      if (b.vida > 2.6) { if (!b.entro) racha = 0; e.escena.remove(b.malla); balones.splice(i, 1); }
    }
    if (!empezado || terminado) { medidor.style.visibility = 'hidden'; return; }
    medidor.style.visibility = 'visible';
    // El medidor sube y baja mientras mantienes
    if (cargando) { const f = ((t - desde) / CARGA) % 2; carga = f < 1 ? f : 2 - f; } else carga = 0;
    const justo = ideal(t);
    nivelEl.style.height = `${carga * 100}%`;
    zonaEl.style.bottom = `${(justo - ZONA) * 100}%`; zonaEl.style.height = `${ZONA * 200}%`;
    perfEl.style.bottom = `${(justo - PERFECTO) * 100}%`; perfEl.style.height = `${PERFECTO * 200}%`;
    if (siguienteRonda && t >= siguienteRonda) { siguienteRonda = 0; empezarRonda(t); }
    if (t < pausaHasta) return;
    const queda = DURA - (t - inicioRonda);
    // Estación terminada: a la siguiente; ronda terminada (o sin tiempo): a la siguiente ronda
    if (bola >= POR_ESTACION && t >= listoHasta + 0.6 && estacion < ESTACIONES.length - 1) { estacion++; armarRack(); listoHasta = t + 0.4; }
    const fin = queda <= 0 || (bola >= POR_ESTACION && estacion >= ESTACIONES.length - 1 && t >= listoHasta + 2.4);
    if (fin) {
      if (ronda >= RONDAS - 1) return terminar();
      ronda++; pausaHasta = t + 2.5; cargando = false;
      siguienteRonda = t + 2.5;
      e.hud.aviso(queda <= 0 ? '¡Tiempo!' : '¡Ronda completa!', '', 1.2);
      return;
    }
    e.hud.tiempo(mmss(queda));
    e.hud.extra(`Ronda ${ronda + 1}/${RONDAS} · Estación ${estacion + 1}/5 · ${rack.slice(bola).map((k) => (k === 'dinero' ? '🔴' : k === 'oro' ? '🟡' : '🟠')).join('')}${racha >= 3 ? ` · racha ${racha}` : ''}`);
    e.hud.puntos(puntos);
  });

  return { empezar() { e.empezar(); empezado = true; empezarRonda(0); }, destruir: e.destruir };
}
