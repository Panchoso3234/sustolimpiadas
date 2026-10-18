import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Origen } from '../../nucleo/modelos';
import { cielo } from '../decorado';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, mmss } from '../reflejos/motor';

// Agujero Negro: eres un agujero en el suelo de una ciudad y tienes dos minutos para tragarte todo lo que quepa.
// Cada cosa cabe cuando es más chica que tú: conos, gente, faroles, autos y, al final, edificios enteros.
// Dos agujeros rivales compiten: el más grande se puede tragar al más chico (que vuelve a la mitad de su tamaño).
// Todo lo de la ciudad se dibuja como instancias: un dibujo por tipo de objeto, no por objeto.

const BLOQUES = 7, PASO = 18, VEREDA = 1.6, MAPA = (BLOQUES * PASO) / 2, DURA = 120, R0 = 1, R_MAX = 10;
interface Tipo { id: string; paquete: Origen; nombre: string; tam: number; por?: 'alto' | 'largo'; r: number; valor: number }
const TIPOS: Tipo[] = [
  { id: 'cono', paquete: 'juguetes', nombre: 'item-cone', tam: 0.7, r: 0.25, valor: 1 },
  { id: 'pilon', paquete: 'carreras', nombre: 'pylon', tam: 0.6, r: 0.25, valor: 1 },
  { id: 'farol', paquete: 'pueblo', nombre: 'lantern', tam: 2.6, r: 0.3, valor: 2 },
  { id: 'valla', paquete: 'carreras', nombre: 'barrierWhite', tam: 0.7, r: 0.4, valor: 2 },
  { id: 'sombrilla', paquete: 'ciudad', nombre: 'detail-parasol-a', tam: 2.2, r: 0.55, valor: 2 },
  { id: 'barril', paquete: 'pirata', nombre: 'barrel', tam: 0.9, r: 0.45, valor: 2 },
  { id: 'banca', paquete: 'pueblo', nombre: 'stall-bench', tam: 1.6, por: 'largo', r: 0.6, valor: 3 },
  { id: 'arbol', paquete: 'naturaleza', nombre: 'tree_default', tam: 4, r: 0.8, valor: 5 },
  { id: 'pino', paquete: 'naturaleza', nombre: 'tree_pineRoundA', tam: 4.5, r: 0.85, valor: 5 },
  { id: 'puesto', paquete: 'pueblo', nombre: 'stall-red', tam: 2.4, por: 'largo', r: 1.05, valor: 6 },
  { id: 'auto', paquete: 'juguetes', nombre: 'vehicle-racer', tam: 3.2, por: 'largo', r: 1.35, valor: 10 },
  { id: 'auto2', paquete: 'juguetes', nombre: 'vehicle-suv', tam: 3.3, por: 'largo', r: 1.4, valor: 10 },
  { id: 'camion', paquete: 'juguetes', nombre: 'vehicle-truck', tam: 4.4, por: 'largo', r: 1.9, valor: 16 },
  { id: 'fuente', paquete: 'pueblo', nombre: 'fountain-round', tam: 3.4, por: 'largo', r: 1.6, valor: 12 },
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((l): Tipo => ({ id: `edificio-${l}`, paquete: 'ciudad', nombre: `building-${l}`, tam: 4.4, por: 'largo', r: 2.5, valor: 35 })),
  { id: 'torre-a', paquete: 'ciudad', nombre: 'building-skyscraper-a', tam: 3.8, por: 'largo', r: 3.0, valor: 70 },
  { id: 'torre-b', paquete: 'ciudad', nombre: 'building-skyscraper-b', tam: 3.8, por: 'largo', r: 3.4, valor: 120 },
];

interface Cosa { tipo: number; i: number; x: number; z: number; giro: number; vivo: boolean; cae: number; hoyo: Hoyo | null; mueve?: { eje: 'x' | 'z'; vel: number } }
interface Hoyo { id: number; x: number; z: number; r: number; color: string; puntos: number; tragados: number; rivales: number; humano: boolean; vuelve: number; disco: THREE.Mesh; aro: THREE.Mesh; meta: { x: number; z: number } | null; piensa: number }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 20, alto: 14, centro: [0, 0, 0], inclinacion: 1, sinPlaya: true });
  e.camara.far = 400;
  e.camara.updateProjectionMatrix();
  cielo(e.escena, '#7fb8ec', '#e4f2ff');
  e.escena.fog = new THREE.Fog('#d6e9fb', 90, 230);
  const mando = crearMando(e, c.caja, 'Turbo');
  const r = generador(`${c.semilla}|ciudad`);

  // ── El suelo de la ciudad pintado en una sola textura: calles, veredas, parques y líneas ──
  const PX = 1024, aPx = (v: number) => ((v + MAPA) / (MAPA * 2)) * PX;
  const tipoBloque: ('edificios' | 'parque' | 'plaza')[][] = Array.from({ length: BLOQUES }, () => Array.from({ length: BLOQUES }, () => { const s = r(); return s < 0.6 ? 'edificios' : s < 0.82 ? 'parque' : 'plaza'; }));
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = PX;
  const g = lienzo.getContext('2d')!;
  g.fillStyle = '#4b4e58'; g.fillRect(0, 0, PX, PX);
  const bloque = (bx: number, bz: number) => { const x0 = -MAPA + bx * PASO + 2.5, z0 = -MAPA + bz * PASO + 2.5; return { x0, z0, x1: x0 + PASO - 5, z1: z0 + PASO - 5 }; };
  for (let bx = 0; bx < BLOQUES; bx++) for (let bz = 0; bz < BLOQUES; bz++) {
    const { x0, z0, x1, z1 } = bloque(bx, bz), t = tipoBloque[bx][bz];
    g.fillStyle = '#c9c3b6'; g.fillRect(aPx(x0), aPx(z0), aPx(x1) - aPx(x0), aPx(z1) - aPx(z0));
    g.fillStyle = t === 'parque' ? '#77b865' : t === 'plaza' ? '#d9c9a3' : '#b3ada0';
    g.fillRect(aPx(x0 + VEREDA), aPx(z0 + VEREDA), aPx(x1 - VEREDA) - aPx(x0 + VEREDA), aPx(z1 - VEREDA) - aPx(z0 + VEREDA));
  }
  g.strokeStyle = '#f2e7a0'; g.lineWidth = 2; g.setLineDash([10, 10]);
  for (let k = 0; k <= BLOQUES; k++) { const v = aPx(-MAPA + k * PASO); g.beginPath(); g.moveTo(v, 0); g.lineTo(v, PX); g.moveTo(0, v); g.lineTo(PX, v); g.stroke(); }
  const telaSuelo = new THREE.CanvasTexture(lienzo);
  telaSuelo.colorSpace = THREE.SRGBColorSpace;
  telaSuelo.anisotropy = 8;
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(MAPA * 2, MAPA * 2), new THREE.MeshLambertMaterial({ map: telaSuelo }));
  suelo.rotation.x = -Math.PI / 2;
  const afuera = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: '#6aa85a' }));
  afuera.rotation.x = -Math.PI / 2;
  afuera.position.y = -0.05;
  e.escena.add(afuera, suelo);

  // ── Dónde va cada cosa ──
  const cosas: Cosa[] = [], porTipo = TIPOS.map(() => 0);
  const poner = (id: string, x: number, z: number, giro = r() * 6.28, mueve?: Cosa['mueve']) => { const tipo = TIPOS.findIndex((t) => t.id === id); cosas.push({ tipo, i: porTipo[tipo]++, x, z, giro, vivo: true, cae: -1, hoyo: null, mueve }); };
  const edificios = TIPOS.filter((t) => t.id.startsWith('edificio')).map((t) => t.id);
  for (let bx = 0; bx < BLOQUES; bx++) for (let bz = 0; bz < BLOQUES; bz++) {
    const { x0, z0, x1, z1 } = bloque(bx, bz), t = tipoBloque[bx][bz], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // Faroles y conos por la vereda
    for (let s = x0 + 2; s < x1; s += 5) { poner('farol', s, z0 + 0.6, 0); poner('farol', s, z1 - 0.6, 0); }
    for (let k = 0; k < 3; k++) poner(r() < 0.5 ? 'cono' : 'pilon', x0 + 0.8 + r() * (x1 - x0 - 1.6), r() < 0.5 ? z0 + 0.9 : z1 - 0.9);
    if (t === 'edificios') {
      // Edificios mirando a la calle por los cuatro lados; al centro, una torre si el bloque tiene suerte
      for (const [ax, az, gi] of [[0, -1, Math.PI], [0, 1, 0], [-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2]] as const) for (let k = -1; k <= 1; k++) {
        if (r() < 0.2) continue;
        const x = ax ? cx + ax * 4.2 : cx + k * 4.4, z = az ? cz + az * 4.2 : cz + k * 4.4;
        if (ax && k !== 0) continue; // los lados cortos llevan uno al medio
        poner(edificios[Math.floor(r() * edificios.length)], x, z, gi);
      }
      if (r() < 0.45) poner(r() < 0.5 ? 'torre-a' : 'torre-b', cx, cz, 0);
      else for (let k = 0; k < 3; k++) poner('sombrilla', cx + (r() - 0.5) * 3, cz + (r() - 0.5) * 3);
    } else if (t === 'parque') {
      poner('fuente', cx, cz, 0);
      for (let k = 0; k < 7; k++) { const a = r() * 6.28, d = 3 + r() * 2.5; poner(r() < 0.5 ? 'arbol' : 'pino', cx + Math.cos(a) * d, cz + Math.sin(a) * d); }
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.78; poner('banca', cx + Math.cos(a) * 2.3, cz + Math.sin(a) * 2.3, -a); }
    } else {
      for (let k = 0; k < 4; k++) poner('puesto', cx + (k % 2 ? 2.6 : -2.6), cz + (k < 2 ? -2.4 : 2.4), k < 2 ? 0 : Math.PI);
      for (let k = 0; k < 5; k++) poner(r() < 0.5 ? 'barril' : 'sombrilla', cx + (r() - 0.5) * 7, cz + (r() - 0.5) * 7);
      for (let k = 0; k < 3; k++) poner('valla', cx + (r() - 0.5) * 8, cz + (r() - 0.5) * 8);
    }
  }
  // Autos estacionados junto a la vereda y algunos que circulan
  for (let k = 0; k <= BLOQUES; k++) for (let m = 0; m < BLOQUES; m++) {
    const linea = -MAPA + k * PASO, tramo = -MAPA + m * PASO + PASO / 2;
    if (r() < 0.55) poner(r() < 0.5 ? 'auto' : 'auto2', tramo + (r() - 0.5) * 8, linea + (r() < 0.5 ? 1.7 : -1.7), r() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    if (r() < 0.3) poner(r() < 0.75 ? 'auto2' : 'camion', linea + (r() < 0.5 ? 1.7 : -1.7), tramo + (r() - 0.5) * 8, r() < 0.5 ? 0 : Math.PI);
  }
  for (let k = 0; k < 14; k++) {
    const linea = -MAPA + (1 + Math.floor(r() * (BLOQUES - 1))) * PASO, sentido = r() < 0.5 ? 1 : -1, eje = r() < 0.5 ? 'x' as const : 'z' as const, pos = (r() - 0.5) * MAPA * 2, carril = sentido * -1.1;
    poner(r() < 0.8 ? 'auto' : 'camion', eje === 'x' ? pos : linea + carril, eje === 'x' ? linea + carril : pos, eje === 'x' ? (sentido > 0 ? Math.PI / 2 : -Math.PI / 2) : sentido > 0 ? 0 : Math.PI, { eje, vel: sentido * (5 + r() * 3) });
  }

  // ── Instancias por tipo (cada malla del modelo, una vez por cosa) ──
  const lotes = await Promise.all(TIPOS.map(async (tipo, k) => {
    const modelo = await e.objeto(tipo.paquete, tipo.nombre, tipo.tam, tipo.por);
    modelo.updateMatrixWorld(true);
    const partes: { malla: THREE.InstancedMesh; base: THREE.Matrix4 }[] = [];
    modelo.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const malla = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, porTipo[k]));
      malla.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Sin recorte por cámara: la esfera que envuelve las instancias se calcula una sola vez y, al moverse o tragarse
      // las cosas, quedaba vieja; entonces se dejaban de dibujar grupos enteros (parpadeo, edificios invisibles)
      malla.frustumCulled = false;
      e.escena.add(malla);
      partes.push({ malla, base: m.matrixWorld.clone() });
    });
    return partes;
  }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), esc = new THREE.Vector3(), eje = new THREE.Euler(), cambiados = new Set<number>();
  const dibujar = (o: Cosa, y = 0, s = 1, inclina = 0) => {
    pos.set(o.x, y, o.z); eje.set(inclina, o.giro, inclina * 0.6); q.setFromEuler(eje); esc.setScalar(s);
    m4.compose(pos, q, esc);
    for (const p of lotes[o.tipo]) p.malla.setMatrixAt(o.i, m4.clone().multiply(p.base));
    cambiados.add(o.tipo);
  };
  for (const o of cosas) dibujar(o);

  // Una grilla para encontrar rápido lo que hay cerca de cada agujero
  const CELDA = 6, grilla = new Map<number, Cosa[]>(), llave = (x: number, z: number) => Math.floor((x + 300) / CELDA) * 1000 + Math.floor((z + 300) / CELDA);
  const indexar = () => { grilla.clear(); for (const o of cosas) if (o.vivo && o.cae < 0) { const k = llave(o.x, o.z); (grilla.get(k) ?? grilla.set(k, []).get(k)!).push(o); } };
  const cerca = (x: number, z: number, radio: number) => {
    const lista: Cosa[] = [], n = Math.ceil(radio / CELDA);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) lista.push(...(grilla.get(llave(x + a * CELDA, z + b * CELDA)) ?? []));
    return lista;
  };
  indexar();

  // ── Gente que camina por las veredas (instancias propias: cuerpo y cabeza) ──
  const GENTE = 140, cuerpos = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.6, 3, 8), new THREE.MeshLambertMaterial(), GENTE), cabezas = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: '#f1c9a5' }), GENTE);
  cuerpos.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cabezas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cuerpos.frustumCulled = cabezas.frustumCulled = false;
  e.escena.add(cuerpos, cabezas);
  const ROPA = ['#ef5565', '#3f8cff', '#3fc79a', '#ffb02e', '#c79bff', '#26365c', '#ffffff'], color = new THREE.Color();
  const gente = Array.from({ length: GENTE }, (_, i) => {
    const bx = Math.floor(r() * BLOQUES), bz = Math.floor(r() * BLOQUES), b = bloque(bx, bz);
    cuerpos.setColorAt(i, color.set(ROPA[i % ROPA.length]));
    return { b, s: r(), vel: (0.025 + r() * 0.02) * (r() < 0.5 ? 1 : -1), vivo: true, cae: -1, x: 0, z: 0, hoyo: null as Hoyo | null, susto: 0 };
  });
  if (cuerpos.instanceColor) cuerpos.instanceColor.needsUpdate = true;
  const enVereda = (b: { x0: number; z0: number; x1: number; z1: number }, s: number) => {
    const w = b.x1 - b.x0 + 1, d = b.z1 - b.z0 + 1, total = 2 * (w + d), p = (((s % 1) + 1) % 1) * total;
    if (p < w) return [b.x0 - 0.5 + p, b.z0 - 0.5];
    if (p < w + d) return [b.x1 + 0.5, b.z0 - 0.5 + p - w];
    if (p < 2 * w + d) return [b.x1 + 0.5 - (p - w - d), b.z1 + 0.5];
    return [b.x0 - 0.5, b.z1 + 0.5 - (p - 2 * w - d)];
  };

  // ── Los agujeros ──
  const crearHoyo = (id: number, x: number, z: number, colorAro: string, humano: boolean): Hoyo => {
    const disco = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#07070c' }));
    const aro = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 40), new THREE.MeshBasicMaterial({ color: colorAro }));
    disco.rotation.x = aro.rotation.x = -Math.PI / 2;
    e.escena.add(disco, aro);
    return { id, x, z, r: R0, color: colorAro, puntos: 0, tragados: 0, rivales: 0, humano, vuelve: 0, disco, aro, meta: null, piensa: 0 };
  };
  const hoyos = [crearHoyo(0, 0, PASO / 2 + 0.1, '#ffd23c', true), crearHoyo(1, -MAPA + PASO, -MAPA + PASO, '#ef5565', false), crearHoyo(2, MAPA - PASO, MAPA - PASO, '#5ad1ff', false)];
  const yo = hoyos[0];

  let empezado = false, terminado = false, turboHasta = 0, recarga = 0;
  // Solo en pruebas: "?piloto=1" maneja tu agujero como a los rivales
  const automatico = import.meta.env.DEV && new URLSearchParams(location.search).has('piloto');
  const terminar = () => {
    terminado = true;
    e.detener();
    const orden = [...hoyos].sort((a, b) => b.r - a.r), puesto = orden.indexOf(yo) + 1;
    c.alTerminar({
      puntaje: yo.puntos + yo.rivales * 300 + (puesto === 1 ? 500 : 0),
      lineas: [['Cosas tragadas', String(yo.tragados)], ['Rivales tragados', String(yo.rivales)], ['Tamaño final', `${yo.r.toFixed(1)} m`], ['Puesto', `${puesto}º de 3${puesto === 1 ? ' (+500)' : ''}`]],
      detalle: { tragados: yo.tragados, rivales: yo.rivales, radio: Math.round(yo.r * 10) / 10, puesto },
    });
  };
  // Cuesta más crecer mientras más grande eres: así los rascacielos llegan hacia el final
  // Lo que viene: con qué tamaño te puedes tragar cada cosa grande (se traga lo que mide menos del 92 % de tu radio)
  const METAS: [string, number][] = [['árboles', 0.8], ['puestos', 1.05], ['autos', 1.4], ['camiones', 1.9], ['edificios', 2.5], ['rascacielos', 3.0], ['el rascacielos grande', 3.4]];
  const proxima = (radio: number) => { const m = METAS.find(([, tr]) => tr >= radio * 0.92); return m ? ` · Para ${m[0]}: falta ${Math.max(0.1, m[1] / 0.92 - radio).toFixed(1)} m` : ' · ¡Te cabe todo!'; };
  const crecer = (h: Hoyo, valor: number) => { h.r = Math.min(R_MAX, Math.sqrt(h.r * h.r + (valor * 0.06) / (1 + h.r * h.r * 0.04))); };

  const objetivo = new THREE.Vector3(), mira = new THREE.Vector3();
  const camara = (dt: number, ya = false) => {
    objetivo.set(yo.x, 11 + yo.r * 3.4, yo.z + 8.5 + yo.r * 2.6);
    e.camara.position.lerp(objetivo, ya ? 1 : 1 - Math.exp(-4 * dt));
    mira.set(yo.x, 0, yo.z - 1);
    e.camara.lookAt(mira);
  };

  e.hud.tiempo(mmss(DURA));
  e.hud.puntos(0);
  camara(0, true);
  let reindexar = 0;
  e.alCuadro((t, dt) => {
    const paso = Math.min(dt, 0.05);
    // Autos que circulan (dan la vuelta al llegar al borde)
    for (const o of cosas) {
      if (!o.mueve || !o.vivo || o.cae >= 0) continue;
      if (o.mueve.eje === 'x') { o.x += o.mueve.vel * paso; if (Math.abs(o.x) > MAPA) o.x = -Math.sign(o.x) * MAPA; }
      else { o.z += o.mueve.vel * paso; if (Math.abs(o.z) > MAPA) o.z = -Math.sign(o.z) * MAPA; }
      dibujar(o);
    }
    if (empezado && !terminado) {
      // Jugador
      if (mando.tomarAccion() && t > recarga) { turboHasta = t + 1.2; recarga = t + 5; e.sonido.tono(200, 0.4, { tipo: 'sawtooth', vol: 0.1, hasta: 500 }); }
      const vel = (6.5 + yo.r * 0.45) * (t < turboHasta ? 1.7 : 1);
      if (t >= yo.vuelve && !automatico) { yo.x = limitar(yo.x + mando.x * vel * paso, -MAPA + 1, MAPA - 1); yo.z = limitar(yo.z + mando.z * vel * paso, -MAPA + 1, MAPA - 1); }
      // Rivales: buscan lo más jugoso que les cabe, escapan de los más grandes y persiguen a los más chicos
      for (const h of hoyos) {
        if ((h.humano && !automatico) || t < h.vuelve) continue;
        const amenaza = hoyos.find((o) => o !== h && t >= o.vuelve && o.r > h.r * 1.15 && Math.hypot(o.x - h.x, o.z - h.z) < 10 + o.r);
        const presa = hoyos.find((o) => o !== h && t >= o.vuelve && h.r > o.r * 1.25 && Math.hypot(o.x - h.x, o.z - h.z) < 14);
        if (t > h.piensa || !h.meta) {
          h.piensa = t + 0.5;
          let mejor: Cosa | null = null, nota = 0;
          for (const o of cerca(h.x, h.z, 22)) { const tipo = TIPOS[o.tipo]; if (tipo.r >= h.r * 0.9) continue; const n = tipo.valor / (4 + Math.hypot(o.x - h.x, o.z - h.z)); if (n > nota) { nota = n; mejor = o; } }
          h.meta = mejor ? { x: mejor.x, z: mejor.z } : { x: (r() - 0.5) * MAPA * 1.6, z: (r() - 0.5) * MAPA * 1.6 };
        }
        let dx = h.meta.x - h.x, dz = h.meta.z - h.z;
        if (presa) { dx = presa.x - h.x; dz = presa.z - h.z; }
        if (amenaza) { dx = h.x - amenaza.x; dz = h.z - amenaza.z; }
        const d = Math.hypot(dx, dz) || 1, v = (6 + h.r * 0.42) * (0.82 + (c.nivel - 1) * 0.05);
        if (d < 0.5) h.meta = null;
        h.x = limitar(h.x + (dx / d) * v * paso, -MAPA + 1, MAPA - 1); h.z = limitar(h.z + (dz / d) * v * paso, -MAPA + 1, MAPA - 1);
      }
      // Tragar cosas
      for (const h of hoyos) {
        if (t < h.vuelve) continue;
        for (const o of cerca(h.x, h.z, h.r + 5)) {
          const tipo = TIPOS[o.tipo];
          if (!o.vivo || o.cae >= 0 || tipo.r >= h.r * 0.92 || Math.hypot(o.x - h.x, o.z - h.z) > h.r - tipo.r * 0.3) continue;
          o.cae = t; o.hoyo = h;
          if (h === yo) { yo.puntos += tipo.valor; yo.tragados++; if (tipo.valor >= 10) { e.flotante(`+${tipo.valor}`, o.x, 2, o.z, 'oro'); e.temblar(Math.min(0.5, tipo.valor / 120)); } e.sonido.tono(500 - Math.min(400, tipo.valor * 4), 0.12, { tipo: 'sine', vol: 0.12, hasta: 120 }); }
          crecer(h, tipo.valor);
        }
        // Gente
        for (const p of gente) {
          if (!p.vivo || p.cae >= 0 || Math.hypot(p.x - h.x, p.z - h.z) > h.r - 0.15 || h.r < 0.5) continue;
          p.cae = t; p.hoyo = h;
          crecer(h, 2);
          if (h === yo) { yo.puntos += 2; yo.tragados++; e.sonido.tono(880, 0.08, { tipo: 'triangle', vol: 0.08, hasta: 300 }); }
        }
      }
      // Un agujero grande se traga a uno chico
      for (const a of hoyos) for (const b of hoyos) {
        if (a === b || t < a.vuelve || t < b.vuelve || a.r < b.r * 1.2 || Math.hypot(a.x - b.x, a.z - b.z) > a.r - b.r * 0.4) continue;
        crecer(a, b.r * b.r * 3);
        if (a === yo) { yo.rivales++; e.hud.aviso('¡Te tragaste un rival! +300', 'oro', 1.3); e.chispas(b.x, 1, b.z, [b.color, '#ffffff'], 40, 6); e.temblar(0.6); }
        if (b === yo) { e.hud.aviso('¡Te tragaron! Vuelves a la mitad', 'mal', 1.6); e.temblar(0.8); e.sonido.mal(); }
        b.r = Math.max(R0, b.r * 0.5);
        b.vuelve = t + 2;
        b.x = (r() - 0.5) * MAPA * 1.6; b.z = (r() - 0.5) * MAPA * 1.6;
      }
      if (t > reindexar) { indexar(); reindexar = t + 0.25; }
      if (t >= DURA) return terminar();
      const orden = [...hoyos].sort((a, b) => b.r - a.r);
      e.hud.tiempo(mmss(DURA - t));
      e.hud.extra(`Tamaño ${yo.r.toFixed(1)} m · ${orden.indexOf(yo) + 1}º de 3${proxima(yo.r)}${t < recarga ? '' : ' · Turbo listo'}`);
      e.hud.puntos(yo.puntos + yo.rivales * 300);
    }
    // Lo que va cayendo: se acerca al centro, se inclina, se achica y se hunde
    for (const o of cosas) {
      if (o.cae < 0 || !o.vivo) continue;
      const k = Math.min(1, (t - o.cae) / 0.7), h = o.hoyo!;
      o.x += (h.x - o.x) * Math.min(1, paso * 6); o.z += (h.z - o.z) * Math.min(1, paso * 6);
      if (k >= 1) { o.vivo = false; dibujar(o, -50, 0.0001); continue; }
      dibujar(o, -k * k * 3, 1 - k * 0.6, k * 0.9);
    }
    // Gente: camina, se asusta cerca de un agujero y cae si la alcanza
    const o3 = new THREE.Object3D();
    gente.forEach((p, i) => {
      if (p.vivo && p.cae < 0) {
        const susto = hoyos.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < h.r + 3);
        p.s += p.vel * paso * (susto ? 3 : 1);
        [p.x, p.z] = enVereda(p.b, p.s);
        o3.position.set(p.x, 0.52 + Math.abs(Math.sin(t * 9 + i)) * 0.06, p.z); o3.scale.setScalar(1);
      } else if (p.vivo) {
        const k = Math.min(1, (t - p.cae) / 0.5), h = p.hoyo!;
        p.x += (h.x - p.x) * paso * 6; p.z += (h.z - p.z) * paso * 6;
        o3.position.set(p.x, 0.5 - k * 2, p.z); o3.scale.setScalar(1 - k * 0.7);
        if (k >= 1) p.vivo = false;
      } else o3.scale.setScalar(0.0001);
      o3.updateMatrix();
      cuerpos.setMatrixAt(i, o3.matrix);
      o3.position.y += 0.62; o3.updateMatrix();
      cabezas.setMatrixAt(i, o3.matrix);
    });
    cuerpos.instanceMatrix.needsUpdate = cabezas.instanceMatrix.needsUpdate = true;
    for (const k of cambiados) for (const p of lotes[k]) p.malla.instanceMatrix.needsUpdate = true;
    cambiados.clear();
    // Agujeros
    for (const h of hoyos) {
      const visible = t >= h.vuelve || Math.sin(t * 20) > 0;
      h.disco.visible = h.aro.visible = visible;
      h.disco.position.set(h.x, 0.04, h.z); h.disco.scale.setScalar(h.r);
      h.aro.position.set(h.x, 0.05, h.z); h.aro.scale.setScalar(h.r * (1 + Math.sin(t * 4) * 0.015));
    }
    camara(dt);
  });

  return { empezar() { e.empezar(); empezado = true; e.hud.aviso('¡Trágate la ciudad!', 'oro', 1.2); }, destruir: e.destruir };
}
