import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { alrededor, bosque, cielo } from '../decorado';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario, sombra } from '../reflejos/motor';

// Defensa de la Torre: babosas de colores bajan por un camino de tierra hacia tu castillo. Pones torres en el pasto
// (ballesta, hielo y mortero), las mejoras con las monedas que sueltan y aguantas diez oleadas; la última trae un jefe.
// Si llegan veinte babosas al castillo, pierdes.

const COLS = 16, FILAS = 10, CELDA = 1.4, AN = COLS * CELDA, FO = FILAS * CELDA, OLEADAS = 10, VIDAS = 20, PAUSA = 7;
// El camino, de celda en celda (columna, fila): entra por la izquierda y llega al castillo abajo a la derecha
const VUELTAS: [number, number][] = [[-1, 1], [3, 1], [3, 7], [7, 7], [7, 2], [12, 2], [12, 6], [9, 6], [9, 8], [14, 8]];
type Tipo = 'ballesta' | 'hielo' | 'mortero';
const TORRES: Record<Tipo, { nombre: string; costo: number; alcance: number; cada: number; dano: number; color: string; tecla: string }> = {
  ballesta: { nombre: 'Ballesta', costo: 50, alcance: 3.4, cada: 0.55, dano: 2, color: '#c98a4a', tecla: '1' },
  hielo: { nombre: 'Hielo', costo: 70, alcance: 2.8, cada: 0.9, dano: 1, color: '#7fd8ff', tecla: '2' },
  mortero: { nombre: 'Mortero', costo: 110, alcance: 4.4, cada: 2, dano: 5, color: '#5a5a66', tecla: '3' },
};
type Clase = 'verde' | 'rapida' | 'gorda' | 'jefe';
const BABOSAS: Record<Clase, { vida: number; vel: number; monedas: number; puntos: number; color: string; tam: number; dano: number }> = {
  verde: { vida: 6, vel: 1.5, monedas: 5, puntos: 10, color: '#5ed36a', tam: 0.42, dano: 1 },
  rapida: { vida: 4, vel: 2.7, monedas: 6, puntos: 15, color: '#ffd23c', tam: 0.36, dano: 1 },
  gorda: { vida: 24, vel: 0.95, monedas: 12, puntos: 30, color: '#b07ae8', tam: 0.58, dano: 2 },
  jefe: { vida: 260, vel: 0.7, monedas: 100, puntos: 400, color: '#ef4b4b', tam: 0.95, dano: 10 },
};

/** Qué trae cada oleada: más babosas y más variadas a medida que avanza. */
export function oleada(n: number): Clase[] {
  const lista: Clase[] = [];
  for (let i = 0; i < 6 + Math.round(n * 1.6); i++) lista.push(n >= 3 && i % 4 === 3 ? 'rapida' : n >= 5 && i % 5 === 4 ? 'gorda' : 'verde');
  if (n >= 7) for (let i = 0; i < n - 5; i++) lista.push('gorda');
  if (n === OLEADAS - 1) lista.push('jefe');
  return lista;
}

const centro = (cx: number, cz: number) => ({ x: -AN / 2 + (cx + 0.5) * CELDA, z: -FO / 2 + (cz + 0.5) * CELDA });
const celda = (x: number, z: number): [number, number] => [Math.floor((x + AN / 2) / CELDA), Math.floor((z + FO / 2) / CELDA)];

interface Babosa { clase: Clase; vida: number; max: number; d: number; lento: number; viva: boolean; malla: THREE.Group; cuerpo: THREE.Mesh; piel: THREE.Material; barra: THREE.Mesh; salto: number }
interface Torre { tipo: Tipo; nivel: number; cx: number; cz: number; x: number; z: number; recarga: number; malla: THREE.Group; cabeza: THREE.Object3D; estrellas: THREE.Group }
interface Tiro { x: number; z: number; y: number; desde: { x: number; z: number }; hacia: { x: number; z: number }; blanco: Babosa | null; t: number; dura: number; tipo: Tipo; dano: number; malla: THREE.Mesh }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: AN + 2, alto: FO * Math.sin(1.05) + 3.4, centro: [0, 0, 0.4], inclinacion: 1.05, sinPlaya: true });
  cielo(e.escena, '#bfe8ff', '#e8f7ff');
  const r = generador(`${c.semilla}|defensa`), fuerza = 1 + (c.nivel - 1) * 0.12;

  // ── El camino: puntos y largo de cada tramo ──
  const puntos = VUELTAS.map(([cx, cz]) => centro(cx, cz)), tramos: number[] = [];
  for (let i = 1; i < puntos.length; i++) tramos.push(Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].z - puntos[i - 1].z));
  const LARGO = tramos.reduce((a, b) => a + b, 0);
  const enCamino = (d: number) => {
    for (let i = 0; i < tramos.length; i++) {
      if (d <= tramos[i]) { const f = d / tramos[i], a = puntos[i], b = puntos[i + 1]; return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, ang: Math.atan2(b.x - a.x, b.z - a.z) }; }
      d -= tramos[i];
    }
    const p = puntos[puntos.length - 1];
    return { x: p.x, z: p.z, ang: 0 };
  };
  const camino = new Set<string>();
  for (let i = 1; i < VUELTAS.length; i++) {
    const [ax, az] = VUELTAS[i - 1], [bx, bz] = VUELTAS[i];
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let z = Math.min(az, bz); z <= Math.max(az, bz); z++) if (x >= 0) camino.add(`${x},${z}`);
  }

  // ── El prado: pasto a cuadros, camino de tierra, árboles alrededor y el castillo ──
  const pasto = new THREE.InstancedMesh(new THREE.BoxGeometry(CELDA * 0.98, 0.3, CELDA * 0.98), new THREE.MeshLambertMaterial(), COLS * FILAS);
  const o = new THREE.Object3D(), tono = new THREE.Color();
  let n = 0;
  for (let cz = 0; cz < FILAS; cz++) for (let cx = 0; cx < COLS; cx++) {
    const p = centro(cx, cz), tierra = camino.has(`${cx},${cz}`);
    o.position.set(p.x, tierra ? -0.2 : -0.15, p.z); o.updateMatrix();
    pasto.setMatrixAt(n, o.matrix);
    pasto.setColorAt(n++, tono.set(tierra ? ((cx + cz) % 2 ? '#d9b07a' : '#d2a670') : (cx + cz) % 2 ? '#7cc85a' : '#72bf51'));
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(AN + 1, 0.6, FO + 1), mat('#6a4a2e'));
  base.position.y = -0.62;
  e.escena.add(pasto, base);
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat('#8fd06c'));
  suelo.rotation.x = -Math.PI / 2; suelo.position.y = -0.9;
  e.escena.add(suelo);
  const fin = puntos[puntos.length - 1], inicio = centro(0, 1);
  const portal = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.14, 8, 24), new THREE.MeshBasicMaterial({ color: '#b46cff' }));
  portal.position.set(inicio.x - CELDA * 0.6, 0.7, inicio.z); portal.rotation.y = Math.PI / 2;
  e.escena.add(portal);
  await bosque(e.escena, 'pueblo', 'tree', alrededor(r, 26, AN + 1, FO + 1, 1.2, 5, [1.2, 2.2]).map((p) => ({ ...p, y: -0.9 }))).catch(() => null);
  // El castillo: torre de piedra con almenas, techo rojo y bandera
  const castillo = new THREE.Group(), piedra = mat('#c9c0b0');
  const torreon = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.9, 10), piedra);
  torreon.position.y = 0.95; castillo.add(torreon);
  for (let i = 0; i < 8; i++) { const almena = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), piedra), a = (i / 8) * Math.PI * 2; almena.position.set(Math.cos(a) * 0.72, 2.05, Math.sin(a) * 0.72); castillo.add(almena); }
  const techo = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1, 10), mat('#d9443a')); techo.position.y = 2.6; castillo.add(techo);
  const asta = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7), mat('#5a3a22')); asta.position.y = 3.4; castillo.add(asta);
  const bandera = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ color: '#ffd23c', side: THREE.DoubleSide })); bandera.position.set(0.26, 3.6, 0); castillo.add(bandera);
  const puerta = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.1), mat('#5a3a22')); puerta.position.set(-0.6, 0.35, 0.45); puerta.rotation.y = -0.9; castillo.add(puerta);
  castillo.position.set(fin.x + CELDA * 0.9, 0, fin.z);
  castillo.scale.setScalar(0.72); // es lo más alto de la cancha: en el borde de la foto se ve muy inclinado
  const sombraCastillo = sombra(1.1);
  sombraCastillo.position.set(fin.x + CELDA * 0.9, 0.04, fin.z);
  e.escena.add(castillo, sombraCastillo);

  // ── Babosas: un cuerpo blando con ojos y su barra de vida ──
  const geoCuerpo = new THREE.SphereGeometry(1, 14, 10), geoOjo = new THREE.SphereGeometry(0.22, 8, 6), geoPupila = new THREE.SphereGeometry(0.11, 6, 5);
  const blanco = new THREE.MeshBasicMaterial({ color: '#ffffff' }), negro = new THREE.MeshBasicMaterial({ color: '#1a1a22' });
  const babosas: Babosa[] = [], hieloMat = new THREE.MeshStandardMaterial({ color: '#a8e6ff', roughness: 0.8, flatShading: true, emissive: '#5fc8ff', emissiveIntensity: 0.35 });
  const nacer = (clase: Clase, ola: number) => {
    const datos = BABOSAS[clase], g = new THREE.Group(), cuerpo = new THREE.Mesh(geoCuerpo, mat(datos.color));
    cuerpo.scale.set(1, 0.75, 1.1); cuerpo.position.y = 0.7;
    g.add(cuerpo);
    for (const lado of [-1, 1]) { const ojo = new THREE.Mesh(geoOjo, blanco), pupila = new THREE.Mesh(geoPupila, negro); ojo.position.set(lado * 0.38, 1.05, 0.78); pupila.position.set(lado * 0.38, 1.07, 0.96); g.add(ojo, pupila); }
    if (clase === 'jefe') { const corona = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.6, 5), mat('#ffd23c')); corona.position.y = 1.6; g.add(corona); }
    g.scale.setScalar(datos.tam);
    const barra = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.12), new THREE.MeshBasicMaterial({ color: '#3fe07a' }));
    barra.position.y = 2.3; g.add(barra);
    g.add(sombra(0.9));
    e.escena.add(g);
    const vida = Math.round(datos.vida * (1 + ola * 0.16) * fuerza);
    babosas.push({ clase, vida, max: vida, d: 0, lento: 0, viva: true, malla: g, cuerpo, piel: cuerpo.material as THREE.Material, barra, salto: r() * 6 });
  };

  // ── Torres ──
  const torres = new Map<string, Torre>();
  const armarTorre = (tipo: Tipo, cx: number, cz: number): Torre => {
    const p = centro(cx, cz), g = new THREE.Group(), pie = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.7, 8), mat('#b8b0a2'));
    pie.position.y = 0.35; g.add(pie);
    const cabeza = new THREE.Group();
    if (tipo === 'ballesta') {
      const caja = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.8), mat('#8a5a38')), arco = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 14, Math.PI), mat('#5a3a22'));
      arco.rotation.x = -Math.PI / 2; arco.position.z = 0.28; cabeza.add(caja, arco);
    } else if (tipo === 'hielo') {
      const cristal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: '#9fe6ff', emissive: '#4fc8ff', emissiveIntensity: 0.6, flatShading: true }));
      cristal.position.y = 0.25; cabeza.add(cristal);
    } else {
      const canon = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.6, 10), mat('#3a3a44'));
      canon.rotation.x = 0.6; canon.position.y = 0.2; cabeza.add(canon);
    }
    cabeza.position.y = 0.95; g.add(cabeza);
    const estrellas = new THREE.Group(); estrellas.position.y = 0.75; g.add(estrellas);
    g.position.set(p.x, 0, p.z);
    e.escena.add(g);
    e.chispas(p.x, 0.8, p.z, ['#ffffff', TORRES[tipo].color, '#ffd23c'], 16, 4);
    return { tipo, nivel: 1, cx, cz, x: p.x, z: p.z, recarga: 0, malla: g, cabeza, estrellas };
  };
  const alcance = (t: Torre) => TORRES[t.tipo].alcance + (t.nivel - 1) * 0.45;
  const mejora = (t: Torre) => Math.round(TORRES[t.tipo].costo * 0.8 * t.nivel);

  // ── Disparos ──
  const tiros: Tiro[] = [];
  const geoTiro = new THREE.SphereGeometry(0.13, 8, 6);
  const disparar = (t: Torre, b: Babosa) => {
    const pos = enCamino(b.d), dano = TORRES[t.tipo].dano * (1 + (t.nivel - 1) * 0.6);
    // El mortero apunta adonde estará la babosa cuando caiga la bala
    const hacia = t.tipo === 'mortero' ? enCamino(Math.min(LARGO, b.d + BABOSAS[b.clase].vel * (b.lento > 0 ? 0.5 : 1) * 0.9)) : pos;
    const malla = new THREE.Mesh(geoTiro, new THREE.MeshBasicMaterial({ color: t.tipo === 'hielo' ? '#bff0ff' : t.tipo === 'mortero' ? '#2a2a30' : '#ffd8a0' }));
    if (t.tipo === 'mortero') malla.scale.setScalar(1.8);
    e.escena.add(malla);
    tiros.push({ x: t.x, z: t.z, y: 1.1, desde: { x: t.x, z: t.z }, hacia: { x: hacia.x, z: hacia.z }, blanco: t.tipo === 'mortero' ? null : b, t: 0, dura: t.tipo === 'mortero' ? 0.9 : 0.25, tipo: t.tipo, dano, malla });
    t.cabeza.rotation.y = Math.atan2(pos.x - t.x, pos.z - t.z);
    if (t.tipo === 'mortero') e.sonido.tono(120, 0.18, { tipo: 'square', vol: 0.12, hasta: 60 }); else e.sonido.tono(t.tipo === 'hielo' ? 1200 : 700, 0.05, { tipo: 'triangle', vol: 0.06 });
  };

  // ── Estado ──
  let monedas = 120, vidas = VIDAS, marcador = 0, bajas = 0, ola = -1, cola: Clase[] = [], proximoNacer = 0, pausaHasta = 3, empezado = false, terminado = false, elegido: Tipo = 'ballesta';
  const terminar = (gano: boolean) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    const bono = gano ? 500 + vidas * 30 : 0;
    marcador += bono;
    c.alTerminar({
      puntaje: marcador,
      lineas: [['Resultado', gano ? '¡Defendiste el castillo!' : `Caíste en la oleada ${ola + 1}`], ['Babosas derrotadas', String(bajas)], ['Vidas del castillo', String(Math.max(0, vidas))], ['Bono final', String(bono)]],
      detalle: { oleada: ola + 1, bajas, vidas: Math.max(0, vidas), gano },
    });
  };
  const siguienteOleada = (t: number, apurada: boolean) => {
    if (apurada) { const extra = Math.max(0, Math.round((pausaHasta - t) * 3)); if (extra) { monedas += extra; e.hud.aviso(`¡Al ataque! +${extra} 🪙`, 'oro', 1.1); } }
    ola++;
    cola = oleada(ola);
    proximoNacer = t + 0.4;
    pausaHasta = Infinity;
    if (!apurada) e.hud.aviso(ola === OLEADAS - 1 ? '¡Oleada final: el Rey Babosa!' : `Oleada ${ola + 1}`, 'oro', 1.4);
    e.sonido.efecto('campana', 0.4);
  };

  // ── Barra de torres (y teclas 1, 2 y 3) y botón para adelantar la oleada ──
  const barra = document.createElement('div');
  barra.className = 'defensa-barra';
  const botones = (Object.keys(TORRES) as Tipo[]).map((tipo) => {
    const b = document.createElement('button');
    b.className = 'boton';
    b.innerHTML = `<b>${TORRES[tipo].tecla}</b> ${TORRES[tipo].nombre} <small>${TORRES[tipo].costo} 🪙</small>`;
    b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); elegido = tipo; });
    barra.appendChild(b);
    return { tipo, b };
  });
  c.caja.appendChild(barra);
  const ya = document.createElement('button');
  ya.className = 'boton mando-accion';
  ya.textContent = '¡Oleada!';
  let pideOleada = false;
  ya.addEventListener('pointerdown', (ev) => { ev.preventDefault(); pideOleada = true; });
  c.caja.appendChild(ya);
  e.escuchar(window, 'keydown', (ev) => {
    const t = (Object.keys(TORRES) as Tipo[]).find((k) => TORRES[k].tecla === ev.key);
    if (t) elegido = t;
    if (ev.key === ' ') { pideOleada = true; ev.preventDefault(); }
  });

  // Fantasma de la torre bajo el mouse, con su alcance
  const fantasma = new THREE.Mesh(new THREE.RingGeometry(0.1, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  fantasma.rotation.x = -Math.PI / 2; fantasma.visible = false;
  e.escena.add(fantasma);
  let bajo: [number, number] | null = null;
  const libre = (cx: number, cz: number) => cx >= 0 && cz >= 0 && cx < COLS && cz < FILAS && !camino.has(`${cx},${cz}`);
  e.escuchar(e.lienzo, 'pointermove', (ev) => { const p = e.enSuelo(ev); bajo = p ? celda(p.x, p.z) : null; });
  e.escuchar(e.lienzo, 'pointerleave', () => { bajo = null; });
  e.escuchar(e.lienzo, 'pointerdown', (ev) => {
    if (!empezado || terminado) return;
    const p = e.enSuelo(ev);
    if (!p) return;
    const [cx, cz] = celda(p.x, p.z), clave = `${cx},${cz}`, hay = torres.get(clave);
    if (hay) {
      // Tocar una torre la mejora (hasta nivel 3)
      if (hay.nivel >= 3) { e.hud.aviso('Torre al máximo', '', 0.8); return; }
      const costo = mejora(hay);
      if (monedas < costo) { e.hud.aviso(`Faltan ${costo - monedas} 🪙`, 'mal', 0.8); e.sonido.mal(); return; }
      monedas -= costo; hay.nivel++;
      const estrella = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffd23c' }));
      estrella.position.set((hay.nivel - 2.5) * 0.3, 0, 0.62); hay.estrellas.add(estrella);
      hay.malla.scale.setScalar(1 + (hay.nivel - 1) * 0.1);
      e.chispas(hay.x, 1.2, hay.z, ['#ffd23c', '#ffffff'], 20, 5); e.sonido.bien();
      return;
    }
    if (!libre(cx, cz)) return;
    const costo = TORRES[elegido].costo;
    if (monedas < costo) { e.hud.aviso(`Faltan ${costo - monedas} 🪙`, 'mal', 0.8); e.sonido.mal(); return; }
    monedas -= costo;
    torres.set(clave, armarTorre(elegido, cx, cz));
    e.sonido.efecto('madera', 0.6);
  });

  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    portal.rotation.z += dt * 2;
    bandera.rotation.y = Math.sin(t * 3) * 0.3;
    for (const { tipo, b } of botones) { b.classList.toggle('activo', tipo === elegido); b.classList.toggle('caro', monedas < TORRES[tipo].costo); }
    ya.style.visibility = empezado && !terminado && pausaHasta !== Infinity ? 'visible' : 'hidden';
    // Fantasma: verde si se puede construir, dorado sobre una torre (mejora), oculto en el camino
    const hay = bajo && torres.get(`${bajo[0]},${bajo[1]}`);
    fantasma.visible = !!bajo && (!!hay || libre(...bajo));
    if (bajo && fantasma.visible) {
      const p = centro(...bajo), radio = hay ? alcance(hay) : TORRES[elegido].alcance;
      fantasma.position.set(p.x, 0.06, p.z); fantasma.scale.setScalar(radio);
      (fantasma.material as THREE.MeshBasicMaterial).color.set(hay ? '#ffd23c' : monedas >= TORRES[elegido].costo ? '#ffffff' : '#ff6a6a');
    }
    if (!empezado || terminado) return;
    const paso = Math.min(dt, 0.05);
    // Oleadas: una pausa para construir y después salen de a una
    if (pausaHasta !== Infinity && (t >= pausaHasta || pideOleada)) siguienteOleada(t, pideOleada && t < pausaHasta);
    pideOleada = false;
    if (cola.length && t >= proximoNacer) { nacer(cola.shift()!, ola); proximoNacer = t + (ola < 4 ? 0.85 : 0.6); }
    // Babosas: avanzan (más lento si están congeladas) y saltitan
    for (const b of babosas) {
      if (!b.viva) continue;
      const datos = BABOSAS[b.clase];
      b.d += datos.vel * (b.lento > t ? 0.45 : 1) * paso;
      const p = enCamino(b.d), brinco = Math.abs(Math.sin(t * 7 + b.salto));
      b.malla.position.set(p.x, brinco * 0.15, p.z);
      b.malla.rotation.y = p.ang;
      b.cuerpo.scale.set(1 + brinco * 0.12, 0.75 - brinco * 0.1, 1.1);
      b.cuerpo.material = b.lento > t ? hieloMat : b.piel;
      b.barra.scale.x = Math.max(0.01, b.vida / b.max); b.barra.position.x = -(1 - b.barra.scale.x) / 2;
      b.barra.lookAt(e.camara.position);
      if (b.d >= LARGO) {
        b.viva = false; e.escena.remove(b.malla);
        vidas -= datos.dano;
        e.temblar(datos.dano > 2 ? 0.8 : 0.3); e.sonido.mal();
        e.flotante(`-${datos.dano} ❤`, fin.x, 2, fin.z, 'mal');
        if (vidas <= 0) return terminar(false);
      }
    }
    // Torres: apuntan a la babosa más avanzada que tengan a tiro
    for (const tr of torres.values()) {
      if (tr.tipo === 'hielo') tr.cabeza.rotation.y += paso * 1.5;
      if (t < tr.recarga) continue;
      let mejor: Babosa | null = null;
      for (const b of babosas) { if (!b.viva) continue; const p = enCamino(b.d); if (Math.hypot(p.x - tr.x, p.z - tr.z) <= alcance(tr) && (!mejor || b.d > mejor.d)) mejor = b; }
      if (!mejor) continue;
      disparar(tr, mejor);
      tr.recarga = t + TORRES[tr.tipo].cada / (1 + (tr.nivel - 1) * 0.15);
    }
    // Balas: las de ballesta y hielo siguen a su blanco; las del mortero caen en arco y golpean en área
    const golpear = (b: Babosa, dano: number) => {
      if (!b.viva) return;
      b.vida -= dano;
      if (b.vida > 0) return;
      b.viva = false; e.escena.remove(b.malla);
      const datos = BABOSAS[b.clase], p = enCamino(b.d);
      monedas += datos.monedas; marcador += datos.puntos; bajas++;
      e.chispas(p.x, 0.6, p.z, [datos.color, '#ffffff', '#ffd23c'], b.clase === 'jefe' ? 60 : 14, b.clase === 'jefe' ? 8 : 4);
      e.flotante(`+${datos.monedas} 🪙`, p.x, 1.4, p.z, 'oro');
      e.sonido.tono(b.clase === 'jefe' ? 200 : 520, 0.12, { tipo: 'sine', vol: 0.12, hasta: b.clase === 'jefe' ? 80 : 900 });
      if (b.clase === 'jefe') e.temblar(1);
    };
    for (let i = tiros.length - 1; i >= 0; i--) {
      const s = tiros[i];
      s.t += paso;
      if (s.blanco) { const p = enCamino(s.blanco.d); s.hacia = { x: p.x, z: p.z }; }
      const f = Math.min(1, s.t / s.dura);
      s.x = s.desde.x + (s.hacia.x - s.desde.x) * f; s.z = s.desde.z + (s.hacia.z - s.desde.z) * f;
      s.y = s.tipo === 'mortero' ? 1.1 + Math.sin(f * Math.PI) * 3 : 1.1 - f * 0.5;
      s.malla.position.set(s.x, s.y, s.z);
      if (f < 1) continue;
      e.escena.remove(s.malla); tiros.splice(i, 1);
      if (s.tipo === 'mortero') {
        e.chispas(s.x, 0.3, s.z, ['#ff9a2e', '#ffd23c', '#3a3a44'], 22, 5); e.temblar(0.15); e.sonido.ruido(0.25, 0.18);
        for (const b of babosas) { const p = enCamino(b.d); if (b.viva && Math.hypot(p.x - s.x, p.z - s.z) < 1.4) golpear(b, s.dano); }
      } else if (s.blanco) {
        if (s.tipo === 'hielo') s.blanco.lento = t + 2.2;
        golpear(s.blanco, s.dano);
      }
    }
    // ¿Oleada terminada?
    if (pausaHasta === Infinity && !cola.length && babosas.every((b) => !b.viva)) {
      babosas.length = 0;
      marcador += 100; monedas += 25 + ola * 5;
      e.sonido.bien();
      e.chispas(fin.x, 2.5, fin.z, ['#ffd23c', '#3f8cff', '#ffffff', '#ef5565'], 40, 6);
      if (ola >= OLEADAS - 1) return terminar(true);
      pausaHasta = t + PAUSA;
      e.hud.aviso(`¡Oleada ${ola + 1} superada! +${25 + ola * 5} 🪙`, 'oro', 1.4);
    }
    const espera = pausaHasta !== Infinity ? ` · sigue en ${Math.ceil(pausaHasta - t)}` : '';
    e.hud.tiempo(`❤ ${Math.max(0, vidas)}`);
    e.hud.extra(`Oleada ${Math.max(1, ola + 1)}/${OLEADAS} · ${monedas} 🪙${espera}`);
    e.hud.puntos(marcador);
  });

  e.hud.tiempo(`❤ ${VIDAS}`);
  e.hud.extra(`Pon torres en el pasto · ${monedas} 🪙`);
  return { empezar() { e.empezar(); empezado = true; }, destruir: e.destruir };
}
