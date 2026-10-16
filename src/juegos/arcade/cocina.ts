import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario, limitar, mmss, sombra } from '../reflejos/motor';
import { CAJONES, COCINA, EMOJI, LISTO, RECETAS, SE_PICA, calza, type Cosa, type Receta } from './cocinaRecetas';

// Cocina Caótica: llegan pedidos con tiempo límite. Tomas ingredientes de los cajones, los picas en la tabla, la carne
// se cocina en la plancha (¡y se quema si la olvidas!), armas el plato y lo entregas en la ventanilla. Cada vez llegan
// más pedidos y recetas más largas. Un turno de tres minutos y medio.

const COLS = COCINA[0].length, FILAS = COCINA.length, CELDA = 1.3, AN = COLS * CELDA, FO = FILAS * CELDA, DURA = 210;
const PICAR = 1.3, COCER = 4.5, QUEMAR = 9, ALCANCE = 1.25, VEL = 4.4, R = 0.36;
const centro = (cx: number, cz: number) => ({ x: -AN / 2 + (cx + 0.5) * CELDA, z: -FO / 2 + (cz + 0.5) * CELDA });
const celda = (x: number, z: number): [number, number] => [Math.floor((x + AN / 2) / CELDA), Math.floor((z + FO / 2) / CELDA)];

/** Lo que hay sobre un mesón, una tabla o la plancha: una cosa suelta o un plato con cosas. */
interface Encima { cosa?: Cosa; plato?: Cosa[] }
interface Estacion { tipo: string; cx: number; cz: number; x: number; z: number; encima: Encima; malla: THREE.Group | null; barra: THREE.Mesh | null }
interface Pedido { receta: Receta; desde: number; dura: number; tarjeta: HTMLElement }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: AN + 1, alto: FO * Math.sin(1.08) + 3.2, centro: [0, 0, 0.4], inclinacion: 1.08, sinPlaya: true });
  e.escena.background = new THREE.Color('#4a3550');
  const mando = crearMando(e, c.caja, 'Tomar / Dejar');
  const r = generador(`${c.semilla}|cocina`), apuro = 1 + (c.nivel - 1) * 0.08;

  // ── La cocina: piso a cuadros, mesones y estaciones ──
  const piso = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA, 0.1, CELDA), new THREE.MeshLambertMaterial(), COLS * FILAS);
  const o = new THREE.Object3D(), tono = new THREE.Color();
  let n = 0;
  for (let cz = 0; cz < FILAS; cz++) for (let cx = 0; cx < COLS; cx++) { const p = centro(cx, cz); o.position.set(p.x, -0.05, p.z); o.updateMatrix(); piso.setMatrixAt(n, o.matrix); piso.setColorAt(n++, tono.set((cx + cz) % 2 ? '#f2efe6' : '#7fb0c9')); }
  e.escena.add(piso);
  const estaciones: Estacion[] = [], porCelda = new Map<string, Estacion>();
  const COLOR: Record<string, string> = { '#': '#c98d55', K: '#c98d55', F: '#55555f', D: '#c98d55', E: '#3fae6a', X: '#4a4a55', L: '#7ab648', T: '#d9443a', M: '#c26a5a', P: '#d9a35a', Q: '#f2c94c' };
  const mesones = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA * 0.98, 0.9, CELDA * 0.98), new THREE.MeshLambertMaterial(), COLS * FILAS);
  const cubiertas = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA, 0.08, CELDA), new THREE.MeshLambertMaterial(), COLS * FILAS);
  n = 0;
  COCINA.forEach((fila, cz) => [...fila].forEach((t, cx) => {
    if (t === '.') return;
    const p = centro(cx, cz);
    o.position.set(p.x, 0.45, p.z); o.updateMatrix(); mesones.setMatrixAt(n, o.matrix); mesones.setColorAt(n, tono.set(CAJONES[t] ? '#8a5a38' : COLOR[t] === '#c98d55' ? '#a0703c' : COLOR[t]));
    o.position.set(p.x, 0.94, p.z); o.updateMatrix(); cubiertas.setMatrixAt(n, o.matrix); cubiertas.setColorAt(n++, tono.set(t === '#' || t === 'D' ? '#e8d5b0' : t === 'K' ? '#f4efe4' : COLOR[t]));
    const est: Estacion = { tipo: t, cx, cz, x: p.x, z: p.z, encima: {}, malla: null, barra: null };
    estaciones.push(est); porCelda.set(`${cx},${cz}`, est);
  }));
  mesones.count = cubiertas.count = n;
  e.escena.add(mesones, cubiertas);

  // Pared del fondo con azulejos, una ventana y ollas colgadas; paredes bajas a los lados
  const azulejo = document.createElement('canvas'); azulejo.width = azulejo.height = 64;
  const ga = azulejo.getContext('2d')!; ga.fillStyle = '#c9c2b4'; ga.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 4; i++) for (let k2 = 0; k2 < 4; k2++) { ga.fillStyle = (i + k2) % 5 ? '#f4f1ea' : '#9fd8e8'; ga.fillRect(i * 16 + 1, k2 * 16 + 1, 14, 14); }
  const texAzulejo = new THREE.CanvasTexture(azulejo); texAzulejo.wrapS = texAzulejo.wrapT = THREE.RepeatWrapping; texAzulejo.repeat.set(AN / 1.2, 2.5); texAzulejo.colorSpace = THREE.SRGBColorSpace;
  const fondo = new THREE.Mesh(new THREE.BoxGeometry(AN + 1.2, 3, 0.3), new THREE.MeshLambertMaterial({ map: texAzulejo })); fondo.position.set(0, 1.5, -FO / 2 - 0.15); e.escena.add(fondo);
  const ventana = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ color: '#9fe0ff' })); ventana.position.set(-AN / 4, 2.2, -FO / 2 + 0.04); const marcoV = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 0.05), mat('#8a5a38')); marcoV.position.set(-AN / 4, 2.2, -FO / 2 - 0.01); e.escena.add(marcoV, ventana);
  for (let i = 0; i < 4; i++) { const olla = new THREE.Mesh(new THREE.CylinderGeometry(0.28 - i * 0.03, 0.28 - i * 0.03, 0.06, 16), new THREE.MeshStandardMaterial({ color: i % 2 ? '#c9ccd6' : '#b87333', metalness: 0.6, roughness: 0.35 })); olla.rotation.x = Math.PI / 2; olla.position.set(AN / 8 + i * 0.75, 2.1 - i * 0.04, -FO / 2 + 0.05); const mango = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.04), mat('#2a2a33')); mango.position.set(AN / 8 + i * 0.75, 2.5 - i * 0.04, -FO / 2 + 0.05); e.escena.add(olla, mango); }
  for (const lado of [-1, 1]) { const muro = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, FO + 0.6), new THREE.MeshLambertMaterial({ map: texAzulejo })); muro.position.set(lado * (AN / 2 + 0.15), 0.7, 0); e.escena.add(muro); }

  // ── Ingredientes: enteros y picados (en trocitos), y sus colores al cocinarse ──
  const colorDe = (k: Cosa) => (k.estado === 'quemado' ? '#2a2a2a' : k.ing === 'carne' ? (k.estado === 'cocido' ? '#7a4a2a' : '#d9706a') : { lechuga: '#6cc04a', tomate: '#e8423a', pan: '#e0a85a', queso: '#f5cf4a' }[k.ing]);
  const malla = (k: Cosa): THREE.Group => {
    const g = new THREE.Group(), m = mat(colorDe(k));
    if (k.estado === 'picado' || (k.ing === 'carne' && k.estado !== 'crudo')) {
      if (k.ing === 'carne') { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 12), m); h.position.y = 0.05; g.add(h); }
      else for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.13), m); t.position.set((i % 2 - 0.5) * 0.18, 0.04, (Math.floor(i / 2) - 0.5) * 0.18); t.rotation.y = i; g.add(t); }
    } else if (k.ing === 'pan') { const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), m); b.scale.y = 0.55; b.position.y = 0.1; g.add(b); }
    else if (k.ing === 'queso') { const q = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 3), m); q.position.y = 0.08; g.add(q); }
    else if (k.ing === 'carne') { const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.26), m); c2.position.y = 0.07; g.add(c2); }
    else { const s = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), m); if (k.ing === 'lechuga') s.scale.set(1.2, 0.8, 1.2); s.position.y = 0.17; g.add(s); }
    return g;
  };
  const mallaPlato = (cosas: Cosa[]) => {
    const g = new THREE.Group(), plato = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.06, 18), mat('#ffffff'));
    plato.position.y = 0.03; g.add(plato);
    cosas.forEach((k, i) => { const m = malla(k); m.scale.setScalar(0.75); m.position.set(Math.cos(i * 2.1) * 0.12, 0.06 + i * 0.06, Math.sin(i * 2.1) * 0.12); g.add(m); });
    return g;
  };
  const flechas: THREE.Mesh[] = [], hornallas = new Map<Estacion, THREE.Mesh>();
  // Lo fijo de cada estación: el ingrediente sobre su cajón, la pila de platos, el tacho y la ventanilla
  for (const est of estaciones) {
    const ing = CAJONES[est.tipo];
    if (ing) {
      // Cajón de madera con listones, lleno de su ingrediente
      for (const lado of [-1, 1]) { const liston = new THREE.Mesh(new THREE.BoxGeometry(CELDA * 0.9, 0.22, 0.06), mat('#8a5a38')); liston.position.set(est.x, 1.06, est.z + lado * CELDA * 0.42); e.escena.add(liston); }
      for (const [dx, dz, s2] of [[-0.2, -0.12, 1], [0.2, -0.1, 0.95], [0, 0.16, 1.05], [-0.22, 0.2, 0.85], [0.24, 0.22, 0.9]]) { const m = malla({ ing, estado: 'crudo', avance: 0 }); m.scale.setScalar(s2 * 0.9); m.position.set(est.x + dx, 0.98, est.z + dz); m.rotation.y = dx * 9; e.escena.add(m); }
    }
    if (est.tipo === 'F') {
      // Hornalla: aro negro que se pone rojo mientras cocina
      const hornalla = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 20), new THREE.MeshStandardMaterial({ color: '#222228', emissive: '#ff3a1a', emissiveIntensity: 0 }));
      hornalla.rotation.x = Math.PI / 2; hornalla.position.set(est.x, 0.99, est.z); e.escena.add(hornalla); hornallas.set(est, hornalla);
    }
    if (est.tipo === 'K') { const tabla = new THREE.Mesh(new THREE.BoxGeometry(CELDA * 0.8, 0.06, CELDA * 0.6), mat('#d9a35a')); tabla.position.set(est.x, 0.99, est.z); const cuchillo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.07), mat('#c9ccd6')); cuchillo.position.set(est.x + 0.25, 1.03, est.z - 0.28); cuchillo.rotation.y = 0.5; e.escena.add(tabla, cuchillo); }
    if (est.tipo === 'E') { const campana = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d9b84a', metalness: 0.6, roughness: 0.3 })); campana.position.set(est.x - 0.3, 0.98, est.z + 0.3); e.escena.add(campana); }
    if (est.tipo === 'D') for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.05, 18), mat('#ffffff')); p.position.set(est.x, 1.0 + i * 0.06, est.z); e.escena.add(p); }
    if (est.tipo === 'X') { const tacho = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.3, 14, 1, true), mat('#2a2a33')); tacho.position.set(est.x, 1.1, est.z); const tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14), mat('#3fae6a')); tapa.position.set(est.x + 0.35, 1.3, est.z); tapa.rotation.z = 1.1; e.escena.add(tacho, tapa); }
    if (est.tipo === 'E') { const flecha = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.4, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' })); flecha.position.set(est.x, 1.6, est.z); flecha.rotation.z = Math.PI; e.escena.add(flecha); flechas.push(flecha); }
    if (est.tipo === 'K' || est.tipo === 'F') { const barra = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.12), new THREE.MeshBasicMaterial({ color: '#3fe07a' })); barra.position.set(est.x, 1.9, est.z); barra.visible = false; e.escena.add(barra); est.barra = barra; }
  }
  const dibujarEncima = (est: Estacion) => {
    if (est.tipo === 'E') return;
    if (est.malla) e.escena.remove(est.malla);
    est.malla = est.encima.plato ? mallaPlato(est.encima.plato) : est.encima.cosa ? malla(est.encima.cosa) : null;
    if (est.malla) { est.malla.position.set(est.x, 0.98, est.z); e.escena.add(est.malla); }
  };

  // ── El cocinero ──
  const yo = await e.personaje(c.aspecto, 1.35), sombraYo = sombra(0.4);
  // Gorro de chef (dentro del personaje escalado: se compensa la escala)
  const gorro = new THREE.Group(), escalaYo = yo.grupo.scale.y;
  const banda = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 14), mat('#ffffff')), copa = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), mat('#ffffff'));
  copa.position.y = 0.2; copa.scale.y = 0.8; gorro.add(banda, copa);
  gorro.scale.setScalar(1 / escalaYo); gorro.position.y = 1.36 / escalaYo; yo.grupo.add(gorro);
  e.escena.add(sombraYo);
  const inicio = centro(6, 6);
  let px = inicio.x, pz = inicio.z, ang = Math.PI;
  let mano: Encima = {}, enMano: THREE.Group | null = null;
  const dibujarMano = () => { if (enMano) e.escena.remove(enMano); enMano = mano.plato ? mallaPlato(mano.plato) : mano.cosa ? malla(mano.cosa) : null; if (enMano) e.escena.add(enMano); };
  const humo: THREE.Mesh[] = [];

  // ── Pedidos (tarjetas arriba) ──
  const tablero = document.createElement('div');
  tablero.className = 'cocina-pedidos';
  c.caja.appendChild(tablero);
  const pedidos: Pedido[] = [];
  let proximo = 1, puntos = 0, entregados = 0, perdidos = 0, empezado = false, terminado = false, picando: Estacion | null = null;
  const nuevoPedido = (t: number) => {
    const posibles = RECETAS.filter((x) => t >= x.desde), receta = posibles[Math.floor(r() * posibles.length)];
    const tarjeta = document.createElement('div');
    tarjeta.className = 'cocina-pedido';
    tarjeta.innerHTML = `<b>${receta.emoji}</b><span>${receta.nombre}</span><small>${receta.ings.map((i) => EMOJI[i]).join('')}</small><i></i>`;
    tablero.appendChild(tarjeta);
    pedidos.push({ receta, desde: t, dura: Math.max(42, 62 - t / 10) / apuro, tarjeta });
  };

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    e.detener();
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Platos entregados', String(entregados)], ['Pedidos perdidos', String(perdidos)]],
      detalle: { entregados, perdidos },
    });
  };

  /** La acción: tomar, dejar, juntar en el plato, entregar o botar, según dónde estés y qué tengas. */
  const accion = (est: Estacion, t: number) => {
    const ing = CAJONES[est.tipo], aqui = est.encima;
    const alPlato = (plato: Cosa[], k: Cosa) => {
      if (k.estado !== LISTO[k.ing] || plato.some((x) => x.ing === k.ing)) { e.hud.aviso(k.estado !== LISTO[k.ing] ? `Primero ${k.ing === 'carne' && k.estado === 'picado' ? 'cocínala' : k.estado === 'quemado' ? 'bótalo' : 'pícalo'}` : 'Ya tiene eso', 'mal', 0.8); return false; }
      plato.push(k); return true;
    };
    if (ing) { if (!mano.cosa && !mano.plato) { mano = { cosa: { ing, estado: 'crudo', avance: 0 } }; e.sonido.efecto('click', 0.5); } else if (mano.plato && ing === 'pan' && alPlato(mano.plato, { ing, estado: 'crudo', avance: 0 })) { /* el pan va directo al plato */ } }
    else if (est.tipo === 'D') { if (!mano.cosa && !mano.plato) mano = { plato: [] }; else if (mano.cosa && alPlato([], mano.cosa)) mano = { plato: [mano.cosa] }; }
    else if (est.tipo === 'X') { if (mano.cosa) mano = {}; else if (mano.plato) mano = { plato: [] }; e.sonido.tono(160, 0.12, { tipo: 'sawtooth', vol: 0.06 }); }
    else if (est.tipo === 'E') {
      if (!mano.plato?.length) return;
      const i = pedidos.findIndex((p) => calza(mano.plato!, p.receta));
      if (i < 0) { e.hud.aviso('Nadie pidió eso', 'mal', 0.9); e.sonido.mal(); return; }
      const p = pedidos[i], queda = 1 - (t - p.desde) / p.dura, valor = Math.round(p.receta.valor * (1 + queda * 0.5));
      puntos += valor; entregados++;
      p.tarjeta.remove(); pedidos.splice(i, 1);
      mano = {};
      e.flotante(`+${valor}`, est.x, 2, est.z, 'oro'); e.chispas(est.x, 1.5, est.z, ['#ffd23c', '#3fe07a', '#ffffff'], 26, 5); e.sonido.bien();
    } else {
      // Mesón, tabla o plancha: dejar, tomar o juntar
      if (est.tipo === 'F' && mano.cosa && mano.cosa.ing !== 'carne') { e.hud.aviso('En la plancha solo va la carne', 'mal', 0.9); return; }
      if (est.tipo === 'F' && mano.cosa?.ing === 'carne' && mano.cosa.estado === 'crudo') { e.hud.aviso('Pica la carne primero', 'mal', 0.9); return; }
      if (est.tipo === 'K' && mano.plato) { e.hud.aviso('Deja el plato en un mesón', 'mal', 0.8); return; }
      if (!aqui.cosa && !aqui.plato) { if (mano.cosa || mano.plato) { est.encima = mano; mano = {}; e.sonido.efecto('madera', 0.4); } }
      else if (!mano.cosa && !mano.plato) { mano = aqui; est.encima = {}; e.sonido.efecto('click', 0.4); }
      else if (mano.plato && aqui.cosa) { if (alPlato(mano.plato, aqui.cosa)) est.encima = {}; }
      else if (mano.cosa && aqui.plato) { if (alPlato(aqui.plato, mano.cosa)) mano = {}; }
      dibujarEncima(est);
    }
    dibujarMano();
  };

  e.hud.tiempo(mmss(DURA)); e.hud.puntos(0);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cocina = () => ({ px, pz, ang, celda: celda(px, pz), mano: JSON.stringify(mano), puntos, pedidos: pedidos.map((p) => p.receta.nombre), ir(cx: number, cz: number, mira: number) { const p = centro(cx, cz); px = p.x; pz = p.z; ang = mira; } });
  e.alCuadro((t, dt) => {
    const paso = Math.min(dt, 0.05);
    for (const f of flechas) f.position.y = 1.6 + Math.sin(t * 4) * 0.12;
    for (const h of humo) { h.position.y += paso * 0.8; h.scale.multiplyScalar(1 + paso * 0.6); (h.material as THREE.MeshBasicMaterial).opacity -= paso * 0.5; }
    while (humo.length && (humo[0].material as THREE.MeshBasicMaterial).opacity <= 0) e.escena.remove(humo.shift()!);
    if (!empezado || terminado) return;
    // Moverse, chocando con los mesones
    const mx = mando.x, mz = mando.z, largo = Math.hypot(mx, mz);
    if (largo > 0.15) {
      px += (mx / Math.max(1, largo)) * VEL * paso; pz += (mz / Math.max(1, largo)) * VEL * paso;
      const [cx, cz] = celda(px, pz);
      for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
        if ((COCINA[b]?.[a] ?? '#') === '.') continue;
        const p = centro(a, b), qx = limitar(px, p.x - CELDA / 2, p.x + CELDA / 2), qz = limitar(pz, p.z - CELDA / 2, p.z + CELDA / 2), dx = px - qx, dz = pz - qz, d = Math.hypot(dx, dz);
        if (d < R && d > 0) { px = qx + (dx / d) * R; pz = qz + (dz / d) * R; }
      }
      let d = Math.atan2(mx, mz) - ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      ang += limitar(d, -paso * 14, paso * 14);
    }
    yo.grupo.position.set(px, 0, pz); yo.grupo.rotation.y = ang; sombraYo.position.set(px, 0.02, pz);
    yo.animar(largo > 0.15 ? 'sprint' : mano.cosa || mano.plato ? 'holding-both' : 'idle');
    if (enMano) enMano.position.set(px + Math.sin(ang) * 0.45, 1.0, pz + Math.cos(ang) * 0.45);
    // La estación que tienes enfrente (la más cercana a un paso delante tuyo)
    const fx = px + Math.sin(ang) * 0.7, fz = pz + Math.cos(ang) * 0.7;
    let frente: Estacion | null = null, mejor = ALCANCE;
    for (const est of estaciones) { const d = Math.hypot(est.x - fx, est.z - fz); if (d < mejor && Math.hypot(est.x - px, est.z - pz) < ALCANCE + 0.5) { mejor = d; frente = est; } }
    // En la tabla, con las manos libres y algo por picar, mantener la acción pica; si no, la acción toma o deja
    const porPicar = frente?.tipo === 'K' && !mano.cosa && !mano.plato && frente.encima.cosa && frente.encima.cosa.estado === 'crudo' && SE_PICA.includes(frente.encima.cosa.ing);
    const toque = mando.tomarAccion();
    if (porPicar && mando.pulsada) {
      const k = frente!.encima.cosa!;
      k.avance += paso / PICAR;
      if (picando !== frente || Math.floor(t * 6) !== Math.floor((t - paso) * 6)) e.sonido.tono(900 + r() * 200, 0.03, { tipo: 'square', vol: 0.05 });
      picando = frente;
      if (k.avance >= 1) { k.estado = 'picado'; k.avance = 0; dibujarEncima(frente!); e.chispas(frente!.x, 1.1, frente!.z, [colorDe(k), '#ffffff'], 10, 2.5); }
    } else { picando = null; if (toque && frente && !porPicar) accion(frente, t); }
    // Tablas y planchas: su barra de avance; la carne se cocina sola y se quema si te olvidas
    for (const est of estaciones) {
      const k = est.encima.cosa;
      const hornalla = hornallas.get(est);
      if (hornalla) (hornalla.material as THREE.MeshStandardMaterial).emissiveIntensity = k?.ing === 'carne' && k.estado !== 'crudo' ? 0.6 + Math.sin(t * 8) * 0.25 : 0;
      if (est.tipo === 'F' && k?.ing === 'carne' && k.estado !== 'quemado') {
        k.avance += paso;
        const antes = k.estado;
        if (k.avance >= QUEMAR) k.estado = 'quemado'; else if (k.avance >= COCER) k.estado = 'cocido';
        if (antes !== k.estado) {
          dibujarEncima(est);
          if (k.estado === 'cocido') { e.sonido.efecto('campana', 0.4); e.flotante('¡Lista!', est.x, 1.8, est.z, 'oro'); }
          else { e.sonido.mal(); e.hud.aviso('¡Se quemó la carne!', 'mal', 1); e.temblar(0.3); }
        }
        if (Math.floor(t * 4) !== Math.floor((t - paso) * 4)) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: k.estado === 'quemado' ? '#333333' : '#ffffff', transparent: true, opacity: 0.6, depthWrite: false })); h.position.set(est.x + (r() - 0.5) * 0.3, 1.2, est.z); e.escena.add(h); humo.push(h); }
      }
      if (est.barra) {
        const avance = est.tipo === 'K' ? (k?.estado === 'crudo' ? k.avance : 0) : k?.ing === 'carne' && k.estado !== 'quemado' ? k.avance / (k.estado === 'cocido' ? QUEMAR : COCER) : 0;
        est.barra.visible = avance > 0.01;
        est.barra.scale.x = Math.max(0.01, Math.min(1, avance)); est.barra.position.x = est.x - (1 - est.barra.scale.x) * 0.45;
        (est.barra.material as THREE.MeshBasicMaterial).color.set(est.tipo === 'F' && k?.estado === 'cocido' ? '#ff6a3a' : '#3fe07a');
        est.barra.lookAt(e.camara.position);
      }
    }
    // Pedidos: llegan cada vez más seguido; si se acaba su tiempo, se pierden
    if (t >= proximo && pedidos.length < 4) { nuevoPedido(t); proximo = t + Math.max(11, 24 - t / 12) / apuro; }
    for (let i = pedidos.length - 1; i >= 0; i--) {
      const p = pedidos[i], queda = 1 - (t - p.desde) / p.dura;
      (p.tarjeta.lastElementChild as HTMLElement).style.width = `${Math.max(0, queda) * 100}%`;
      p.tarjeta.classList.toggle('apuro', queda < 0.3);
      if (queda <= 0) { p.tarjeta.remove(); pedidos.splice(i, 1); perdidos++; puntos = Math.max(0, puntos - 20); e.hud.aviso(`Se fue un cliente: ${p.receta.nombre}`, 'mal', 1.1); e.sonido.mal(); }
    }
    if (t >= DURA) return terminar();
    e.hud.tiempo(mmss(DURA - t));
    e.hud.extra(`${entregados} entregados${frente ? ` · ${{ K: 'Tabla: mantén para picar', F: 'Plancha', D: 'Platos', E: 'Entrega', X: 'Basura', '#': 'Mesón' }[frente.tipo] ?? `Cajón de ${EMOJI[CAJONES[frente.tipo]]}`}` : ''}`);
    e.hud.puntos(puntos);
  });

  return { empezar() { e.empezar(); empezado = true; }, destruir: e.destruir };
}

