import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar, mmss } from '../reflejos/motor';
import { AN, CELDA, CLASES, COLS, FILAS, FO, R_TANQUE, TABLEROS, celda, centro, chocarMuros as chocarMurosEn, crearBloques, mallaDardo, mallaMina, mallaTanque, montarSala, type Clase } from './tanquesPiezas';

// Tanques de Juguete: ocho oleadas de tanques enemigos sobre una mesa en un cuarto de niño. Las balas de espuma rebotan en
// las paredes (una vez las tuyas), rompen cajas y se anulan si chocan con una del otro bando. Los enemigos no se dañan
// entre ellos (sin fuego amigo): cada baja es tuya. Hay patrullas, francotiradores que tiran de rebote, minadores,
// kamikazes, blindados que solo se dañan por los lados o por atrás, y un jefe con escudo giratorio. Las cajas sueltan
// potenciadores. Tus minas estallan a los 6 s o al pisarlas (y te dañan si estás cerca). Tienes tres vidas.

const DURA = 330, VIDAS = 3, MAX_VIDAS = 5;
/** Las oleadas: los primeros salen juntos y el resto llega de a poco. */
const OLEADAS: Clase[][] = [
  ['marron', 'marron'],
  ['gris', 'gris', 'marron'],
  ['verde', 'gris', 'minador'],
  ['rojo', 'gris', 'kamikaze', 'marron'],
  ['blindado', 'verde', 'rojo', 'kamikaze'],
  ['minador', 'blindado', 'rojo', 'rojo', 'verde'],
  ['blindado', 'blindado', 'kamikaze', 'kamikaze', 'verde', 'gris'],
  ['jefe', 'rojo', 'verde', 'minador'],
];
type Poder = 'escudo' | 'doble' | 'rebote' | 'velocidad' | 'vida' | 'mina';
const PODERES: Record<Poder, { color: string; nombre: string; letra: string }> = {
  escudo: { color: '#5ad1ff', nombre: 'Escudo', letra: 'E' }, doble: { color: '#ffd23c', nombre: 'Bala doble', letra: 'D' }, rebote: { color: '#3fe07a', nombre: 'Rebote extra', letra: 'R' },
  velocidad: { color: '#ff7ab8', nombre: 'Velocidad', letra: 'V' }, vida: { color: '#ef5565', nombre: '+1 vida', letra: '♥' }, mina: { color: '#ff9a2e', nombre: 'Mina gigante', letra: 'M' },
};

interface Tanque {
  clase: Clase | 'yo'; x: number; z: number; ang: number; mira: number; vida: number; max: number; recarga: number; destino: { x: number; z: number } | null;
  cuerpo: THREE.Group; torreta: THREE.Object3D; sombra: THREE.Mesh; canon: THREE.Mesh; rodar: (d: number) => void; vivo: boolean;
  retro: number; humo: number; huella: number; minaEn: number; rebote: number | null; piensaRebote: number; furia: boolean; barra: THREE.Mesh | null;
}
interface Bala { x: number; z: number; vx: number; vz: number; rebotes: number; reb0: number; jugador: boolean; de: Tanque; malla: THREE.Object3D }
interface Mina { x: number; z: number; cuando: number; armada: number; enemiga: boolean; gigante: boolean; malla: THREE.Object3D }
interface Item { tipo: Poder; x: number; z: number; malla: THREE.Group; hasta: number }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: AN + 2.5, alto: FO * Math.sin(1.0) + 4, centro: [0, 0, 0.5], inclinacion: 1.0, sinPlaya: true });
  const mando = crearMando(e, c.caja, 'Disparar', 'Mina');
  const r = generador(`${c.semilla}|tanques`);

  // ── La pieza y el tablero ──
  const [, tablero] = await Promise.all([montarSala(e), crearBloques(e)]);
  let grilla: string[][] = [];
  let dentro = 0; // cuadros en que un tanque terminó con el centro dentro de un bloque (debe ser 0)
  const solido = (cx: number, cz: number) => cx < 0 || cz < 0 || cx >= COLS || cz >= FILAS || grilla[cz][cx] !== '.';
  const armar = (n: number) => { grilla = TABLEROS[n % TABLEROS.length].map((f) => f.split('')); tablero.armar(grilla); };

  // ── Tanques ──
  const barraGeo = new THREE.PlaneGeometry(0.9, 0.1);
  const crearTanque = (clase: Clase | 'yo', x: number, z: number): Tanque => {
    const pieza = mallaTanque(e, clase === 'yo' ? '#3f8cff' : CLASES[clase].color, { jefe: clase === 'jefe', franja: clase === 'yo', clase: clase === 'yo' ? '' : clase });
    const vida = clase === 'yo' ? 1 : CLASES[clase].vida;
    let barra: THREE.Mesh | null = null;
    if (vida > 1) { barra = new THREE.Mesh(barraGeo, new THREE.MeshBasicMaterial({ color: '#3fe07a', depthTest: false })); barra.renderOrder = 5; e.escena.add(barra); }
    return { clase, x, z, ang: 0, mira: 0, vida, max: vida, recarga: 1 + r() * 1.5, destino: null, ...pieza, vivo: true, retro: 0, humo: 0, huella: 0, minaEn: 0, rebote: null, piensaRebote: 0, furia: false, barra };
  };
  const quitar = (t: Tanque) => { t.vivo = false; e.escena.remove(t.cuerpo, t.torreta, t.sombra); if (t.barra) e.escena.remove(t.barra); };

  // ── Efectos: huellas, restos, ondas y astillas ──
  const huellas = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.32), new THREE.MeshBasicMaterial({ color: '#5a4630', transparent: true, opacity: 0.32, depthWrite: false }), 240);
  huellas.count = 0; e.escena.add(huellas);
  let huellaN = 0;
  const o3 = new THREE.Object3D();
  const marcarHuella = (t: Tanque) => {
    for (const lado of [-1, 1]) {
      o3.position.set(t.x + Math.cos(t.ang) * 0.5 * lado, 0.012, t.z - Math.sin(t.ang) * 0.5 * lado); o3.rotation.set(-Math.PI / 2, 0, t.ang); o3.updateMatrix();
      huellas.setMatrixAt(huellaN % 240, o3.matrix); huellaN++;
    }
    huellas.count = Math.min(240, huellaN); huellas.instanceMatrix.needsUpdate = true;
  };
  const restos: { m: THREE.Mesh; hasta: number }[] = [];
  const ondas = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; e.escena.add(m); return { m, t0: -9, tam: 1 }; });
  const astillas = Array.from({ length: 24 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.22), new THREE.MeshLambertMaterial({ color: '#c99a4a' })); m.visible = false; e.escena.add(m); return { m, vx: 0, vy: 0, vz: 0, vida: 0 }; });
  let astillaN = 0;

  // Balas de espuma (del paquete Blaster) y minas
  const dardo0 = await mallaDardo(e);
  const balas: Bala[] = [], minas: Mina[] = [], marcas: THREE.Mesh[] = [], items: Item[] = [];
  let reloj = 0; // reloj de la simulación
  const TONO: Record<string, number> = { yo: 520, marron: 260, gris: 300, verde: 420, rojo: 340, minador: 280, kamikaze: 200, blindado: 220, jefe: 160 };
  const disparar = (t: Tanque, ahora: number, angulos?: number[]) => {
    const jugador = t.clase === 'yo';
    const datos = jugador ? { bala: 10, rebotes: 1 + (ahora < poderes.rebote ? 1 : 0) } : CLASES[t.clase as Clase];
    const propias = balas.filter((b) => b.de === t).length;
    if (jugador ? propias >= (ahora < poderes.doble ? 8 : 5) : propias >= (t.clase === 'jefe' ? 10 : 2)) return;
    const salir = (ang: number, corrido = 0) => {
      const dx = Math.sin(ang), dz = Math.cos(ang), x = t.x + dx * 0.8 + dz * corrido, z = t.z + dz * 0.8 - dx * corrido;
      if (solido(...celda(x, z))) return; // el cañón está pegado a una pared
      const g = new THREE.Group(), d = dardo0.clone();
      g.add(d);
      g.rotation.y = ang;
      g.position.set(x, 0.66, z);
      e.escena.add(g);
      balas.push({ x, z, vx: dx * datos.bala, vz: dz * datos.bala, rebotes: datos.rebotes, reb0: datos.rebotes, jugador, de: t, malla: g });
      if (jugador) disparos++;
    };
    for (const a of angulos ?? [t.mira]) {
      if (jugador && ahora < poderes.doble) { salir(a, -0.16); salir(a, 0.16); } else salir(a);
    }
    t.retro = 1;
    e.sonido.tono(TONO[t.clase], 0.08, { tipo: 'square', vol: jugador ? 0.1 : 0.06, hasta: TONO[t.clase] / 2 });
    t.recarga = ahora + (jugador ? 0.28 : (CLASES[t.clase as Clase].cada / (1 + (c.nivel - 1) * 0.12)) * (t.furia ? 0.6 : 1) * (0.8 + r() * 0.4));
  };
  const onda = (x: number, z: number, tam: number) => { const w = ondas.reduce((a, b) => (a.t0 < b.t0 ? a : b)); w.t0 = reloj; w.tam = tam; w.m.position.set(x, 0.05, z); w.m.visible = true; };
  const explotar = (x: number, z: number, grande = false) => {
    e.chispas(x, 0.6, z, ['#ff9a2e', '#ffd23c', '#3a3a44', '#ffffff'], grande ? 46 : 28, grande ? 7 : 5);
    e.temblar(grande ? 0.7 : 0.4);
    e.sonido.ruido(0.35, 0.25);
    onda(x, z, grande ? 3.4 : 2.2);
    const marca = new THREE.Mesh(new THREE.CircleGeometry(grande ? 1.1 : 0.7, 12), new THREE.MeshBasicMaterial({ color: '#3a2a20', transparent: true, opacity: 0.35, depthWrite: false }));
    marca.rotation.x = -Math.PI / 2;
    marca.position.set(x, 0.01, z);
    e.escena.add(marca);
    marcas.push(marca);
    if (marcas.length > 18) e.escena.remove(marcas.shift()!);
  };
  const soltarPoder = (x: number, z: number) => {
    const tipos = Object.keys(PODERES) as Poder[], tipo = tipos[Math.floor(r() * tipos.length)], datos = PODERES[tipo];
    const g = new THREE.Group(), gema = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshStandardMaterial({ color: datos.color, emissive: datos.color, emissiveIntensity: 0.5, flatShading: true }));
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 6, 20), new THREE.MeshBasicMaterial({ color: '#ffffff' })); aro.rotation.x = Math.PI / 2;
    g.add(gema, aro); g.position.set(x, 0.5, z); e.escena.add(g);
    items.push({ tipo, x, z, malla: g, hasta: reloj + 14 });
  };
  const romperCaja = (cx: number, cz: number, delJugador: boolean) => {
    if (!tablero.romper(cx, cz)) return false;
    grilla[cz][cx] = '.';
    const p = centro(cx, cz);
    e.chispas(p.x, 0.5, p.z, ['#c99a4a', '#8a5a38', '#ffd23c'], 14, 4);
    for (let i = 0; i < 4; i++) { const a = astillas[astillaN++ % astillas.length]; a.m.visible = true; a.m.position.set(p.x, 0.5, p.z); a.vx = (r() - 0.5) * 5; a.vz = (r() - 0.5) * 5; a.vy = 3 + r() * 2; a.vida = 1; }
    e.sonido.efecto('madera', 0.6);
    if (delJugador && r() < 0.32) soltarPoder(p.x, p.z);
    return true;
  };

  // ── Estado de la partida ──
  let yo = crearTanque('yo', 0, 0), enemigos: Tanque[] = [], cola: Clase[] = [], proximo = 0, oleada = -1, vidas = VIDAS, invencible = 0, empezado = false, terminado = false, pausaHasta = 0, minaAntes = false;
  let puntos = 0, bajas = 0, disparos = 0, impactos = 0, carambolas = 0, combo = 0, ultimaBaja = -9, mejorCombo = 0, penal = 0, escudo = 0, velocidad = 1;
  const poderes = { doble: 0, rebote: 0, velocidad: 0, mina: false };
  const desglose = { bajas: 0, oleadas: 0, extras: 0 };
  const SALIDA = centro(1, Math.floor(FILAS / 2));
  const libresLejos = () => { const l: { x: number; z: number }[] = []; grilla.forEach((f, cz) => f.forEach((t, cx) => { const p = centro(cx, cz); if (t === '.' && cx >= COLS - 8 && Math.hypot(p.x - yo.x, p.z - yo.z) > 6 && !enemigos.some((x) => x.vivo && Math.hypot(x.x - p.x, x.z - p.z) < 1.5)) l.push(p); })); return l; };
  const sumar = (clase: Clase, ahora: number) => {
    const libres = libresLejos(), p = libres.splice(Math.floor(r() * libres.length), 1)[0] ?? centro(COLS - 2, 1 + Math.floor(r() * (FILAS - 2)));
    const t = crearTanque(clase, p.x, p.z); t.ang = t.mira = -Math.PI / 2; t.recarga = ahora + 1.5 + r() * 1.5; t.minaEn = ahora + 3;
    enemigos.push(t); e.chispas(p.x, 0.6, p.z, ['#ffffff', CLASES[clase].color], 14, 3);
  };
  const resumen = (lista: Clase[]) => { const n = new Map<string, number>(); for (const k of lista) n.set(CLASES[k].nombre, (n.get(CLASES[k].nombre) ?? 0) + 1); return [...n].map(([k, v]) => `${v} ${k}`).join(', '); };
  const nuevaOleada = (ahora: number) => {
    oleada++;
    for (const b of balas) e.escena.remove(b.malla);
    balas.length = 0;
    for (const m of minas) e.escena.remove(m.malla);
    minas.length = 0;
    for (const it of items) e.escena.remove(it.malla);
    items.length = 0;
    for (const en of enemigos) quitar(en);
    enemigos = [];
    armar(oleada);
    yo.x = SALIDA.x; yo.z = SALIDA.z; yo.ang = yo.mira = Math.PI / 2;
    cola = [...OLEADAS[oleada]];
    for (let i = 0; i < Math.min(2, cola.length); i++) sumar(cola.shift()!, ahora);
    proximo = ahora + 4;
    pausaHasta = ahora + 2.2;
    e.hud.aviso(oleada === OLEADAS.length - 1 ? '¡Oleada final: el Jefe!' : `Oleada ${oleada + 1}: ${resumen(OLEADAS[oleada])}`, 'oro', 2);
  };

  const chocarMuros = (t: Tanque) => chocarMurosEn(t, solido);
  /** Si hay línea de tiro directa entre dos puntos (sin bloques ni cajas en medio). */
  const aLaVista = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const pasos = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3);
    for (let i = 1; i < pasos; i++) if (solido(...celda(a.x + ((b.x - a.x) * i) / pasos, a.z + ((b.z - a.z) * i) / pasos))) return false;
    return true;
  };
  const girarHacia = (desde: number, hacia: number, max: number) => { let d = hacia - desde; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return desde + limitar(d, -max, max); };
  /** Recorre el camino de una bala (con rebotes) y devuelve sus tramos; lo usan la mira y los francotiradores. */
  const trayecto = (x: number, z: number, ang: number, rebotes: number, largo: number) => {
    let vx = Math.sin(ang), vz = Math.cos(ang), queda = largo, rb = rebotes;
    const puntosRuta = [{ x, z }];
    while (queda > 0) {
      const nx = x + vx * 0.15, nz = z + vz * 0.15, [cx, cz] = celda(x, z), [ax, az] = celda(nx, nz);
      if (solido(ax, az)) {
        if (rb-- <= 0) break;
        if (ax !== cx && solido(ax, cz)) vx = -vx; else if (az !== cz && solido(cx, az)) vz = -vz; else { vx = -vx; vz = -vz; }
        puntosRuta.push({ x, z });
        continue;
      }
      x = nx; z = nz; queda -= 0.15;
    }
    puntosRuta.push({ x, z });
    return puntosRuta;
  };
  /** El francotirador busca un tiro de rebote que pase cerca de ti. */
  const buscarRebote = (en: Tanque) => {
    const datos = CLASES[en.clase as Clase];
    for (let i = 0; i < 72; i++) {
      const ang = (i / 72) * Math.PI * 2, ruta = trayecto(en.x + Math.sin(ang) * 0.8, en.z + Math.cos(ang) * 0.8, ang, datos.rebotes, 26);
      for (let k = 1; k < ruta.length; k++) {
        const a = ruta[k - 1], b = ruta[k], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, u = limitar(((yo.x - a.x) * dx + (yo.z - a.z) * dz) / l2, 0, 1);
        if (k > 1 && Math.hypot(a.x + dx * u - yo.x, a.z + dz * u - yo.z) < 0.45) return ang;
      }
    }
    return null;
  };

  // ── Puntería: con mouse, donde apunta; con el control, la palanca derecha; en pantalla táctil, al enemigo más cercano ──
  let apuntaMouse: { x: number; z: number } | null = null, usaMouse = false, quiereDisparar = false;
  e.escuchar(e.lienzo, 'pointermove', (ev) => { if (ev.pointerType !== 'mouse') return; usaMouse = true; const p = e.enSuelo(ev, 0.6); if (p) apuntaMouse = { x: p.x, z: p.z }; });
  // Un clic con el mouse dispara (y no mueve el tanque): se atrapa antes de que llegue a la palanca
  const alClic = (ev: PointerEvent) => { if (ev.pointerType !== 'mouse' || ev.target !== e.lienzo) return; ev.stopPropagation(); usaMouse = true; const p = e.enSuelo(ev, 0.6); if (p) apuntaMouse = { x: p.x, z: p.z }; quiereDisparar = true; };
  c.caja.addEventListener('pointerdown', alClic, true);
  const autoMira = () => { const vistos = enemigos.filter((x) => x.vivo && aLaVista(yo, x)); const blanco = (vistos.length ? vistos : enemigos.filter((x) => x.vivo)).sort((a, b) => Math.hypot(a.x - yo.x, a.z - yo.z) - Math.hypot(b.x - yo.x, b.z - yo.z))[0]; return blanco ? Math.atan2(blanco.x - yo.x, blanco.z - yo.z) : yo.ang; };

  // ── Interfaz: línea de mira con el primer rebote, aviso de balas que vienen, minimapa y botón ⏩ ──
  const mira = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.55 }));
  e.escena.add(mira);
  const alerta = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 28), new THREE.MeshBasicMaterial({ color: '#ff3b2e', transparent: true, opacity: 0.7, depthWrite: false })); alerta.rotation.x = -Math.PI / 2; alerta.visible = false; e.escena.add(alerta);
  const burbuja = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), new THREE.MeshBasicMaterial({ color: '#5ad1ff', transparent: true, opacity: 0.25, depthWrite: false })); burbuja.visible = false; e.escena.add(burbuja);
  const placas = [0, 1].map(() => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.14), new THREE.MeshStandardMaterial({ color: '#c9a2ff', emissive: '#7a3ae0', emissiveIntensity: 0.6, transparent: true, opacity: 0.85 })); p.visible = false; e.escena.add(p); return p; });
  const mapa = document.createElement('canvas'); mapa.width = 140; mapa.height = 84; mapa.className = 'kart-mapa'; mapa.style.width = '140px'; mapa.style.height = '84px'; c.caja.appendChild(mapa);
  const rapido = document.createElement('button'); rapido.className = 'boton';
  Object.assign(rapido.style, { position: 'absolute', right: '12px', top: '64px', padding: '6px 10px', fontSize: '.85rem', zIndex: '3' });
  rapido.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); velocidad = velocidad === 1 ? 2 : 1; });
  c.caja.appendChild(rapido);
  const pintarMapa = () => {
    const g = mapa.getContext('2d')!, k = 7;
    g.fillStyle = 'rgba(20,32,58,.75)'; g.fillRect(0, 0, 140, 84);
    grilla.forEach((f, cz) => f.forEach((t, cx) => { if (t !== '.') { g.fillStyle = t === '#' ? '#c9c0b0' : '#a0703c'; g.fillRect(cx * k, cz * k, k - 1, k - 1); } }));
    const punto = (x: number, z: number, color: string, rr: number) => { g.fillStyle = color; g.beginPath(); g.arc(((x + AN / 2) / CELDA) * k, ((z + FO / 2) / CELDA) * k, rr, 0, 6.3); g.fill(); };
    for (const en of enemigos) if (en.vivo) punto(en.x, en.z, CLASES[en.clase as Clase].color, en.clase === 'jefe' ? 4 : 3);
    for (const it of items) punto(it.x, it.z, PODERES[it.tipo].color, 2);
    for (const b of balas) punto(b.x, b.z, b.jugador ? '#ffffff' : '#ff6a6a', 1.2);
    if (yo.vivo) { punto(yo.x, yo.z, '#3f8cff', 3.5); g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.stroke(); }
  };

  // ── Daño y bajas ──
  const terminar = (t: number, gano: boolean) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    const precision = disparos ? impactos / disparos : 0;
    const bonoVidas = gano ? vidas * 250 : 0, bonoTiempo = gano ? Math.max(0, Math.round((DURA - t) * 3)) : 0, bonoPrecision = Math.round(precision * (gano ? 600 : 250));
    puntos = Math.max(0, puntos + bonoVidas + bonoTiempo + bonoPrecision);
    c.alTerminar({
      puntaje: puntos,
      lineas: [
        ['Resultado', gano ? `¡Ganaste las ${OLEADAS.length} oleadas!` : `Llegaste a la oleada ${oleada + 1}`],
        ['Tanques destruidos', `${bajas} (${desglose.bajas} pts)`],
        ['Oleadas superadas', `${desglose.oleadas} pts`],
        ['Carambolas y combos', `${carambolas} carambolas · mejor combo ×${mejorCombo} (${desglose.extras} pts)`],
        ['Precisión', `${Math.round(precision * 100)} % (+${bonoPrecision})`],
        ...(penal ? [['Fuego propio', `−${penal}`] as [string, string]] : []),
        ['Vidas y tiempo', gano ? `${vidas} vidas (+${bonoVidas}) · +${bonoTiempo}` : '—'],
      ],
      detalle: { oleada: oleada + 1, bajas, vidas, gano, precision: Math.round(precision * 100) },
    });
  };
  /** Daña un tanque. `delJugador`: la bala o mina era tuya; `rebotada`: la bala venía de un rebote. */
  const danar = (tq: Tanque, delJugador: boolean, rebotada: boolean, porMina = false) => {
    if (tq === yo) {
      if (reloj < invencible) return;
      if (escudo > 0) { escudo--; e.chispas(yo.x, 0.8, yo.z, ['#5ad1ff', '#ffffff'], 18, 4); e.sonido.tono(900, 0.15, { tipo: 'triangle', vol: 0.1, hasta: 300 }); invencible = reloj + 0.6; return; }
      explotar(tq.x, tq.z); dejarRestos(tq); quitar(tq);
      vidas--; invencible = reloj + 3;
      if (delJugador) { penal += 100; puntos -= 100; }
      e.hud.aviso(delJugador ? (porMina ? `¡Tu propia mina! −100 · quedan ${vidas}` : `¡Tu propia bala! −100 · quedan ${vidas}`) : vidas > 0 ? `¡Te dieron! Quedan ${vidas}` : '¡Fuera de combate!', 'mal', 1.4);
      e.sonido.mal();
      if (vidas <= 0) terminar(reloj, false);
      return;
    }
    if (delJugador) impactos++;
    if (--tq.vida > 0) {
      e.chispas(tq.x, 0.8, tq.z, ['#ffffff', CLASES[tq.clase as Clase].color], 12, 4); e.temblar(0.2); e.sonido.efecto('golpe', 0.5);
      if (tq.clase === 'jefe' && !tq.furia && tq.vida <= tq.max / 2) {
        // El jefe se enfurece: escudo giratorio, ráfagas y refuerzos
        tq.furia = true; e.hud.aviso('¡El Jefe se enfurece!', 'mal', 1.6); e.temblar(0.6);
        sumar('gris', reloj); sumar('kamikaze', reloj);
      }
      return;
    }
    explotar(tq.x, tq.z, tq.clase === 'jefe'); dejarRestos(tq); quitar(tq);
    if (!delJugador) return;
    const datos = CLASES[tq.clase as Clase];
    let valor = datos.valor;
    puntos += valor; desglose.bajas += valor; bajas++;
    combo = reloj - ultimaBaja < 2.5 ? combo + 1 : 1; ultimaBaja = reloj; mejorCombo = Math.max(mejorCombo, combo);
    let extra = 0;
    if (rebotada) { carambolas++; extra += 75; e.hud.aviso('¡Carambola! +75', 'oro', 1); }
    if (combo >= 2) { extra += combo * 40; if (!rebotada) e.hud.aviso(`¡Combo ×${combo}! +${combo * 40}`, 'oro', 1); }
    puntos += extra; desglose.extras += extra; valor += extra;
    e.flotante(`+${valor}`, tq.x, 1.5, tq.z, 'oro');
  };
  const dejarRestos = (tq: Tanque) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.18, 1.05), new THREE.MeshLambertMaterial({ color: '#2a2622', transparent: true, opacity: 0.85 }));
    m.position.set(tq.x, 0.09, tq.z); m.rotation.y = tq.ang + 0.3; e.escena.add(m); restos.push({ m, hasta: reloj + 6 });
  };

  // ── Piloto de prueba (solo en desarrollo): "?piloto=1" juega solo; "?rapido=N" acelera ──
  const parametros = new URLSearchParams(location.search), piloto = import.meta.env.DEV && parametros.has('piloto');
  const aceleracion = import.meta.env.DEV ? Math.max(1, Number(parametros.get('rapido')) || 1) : 1;
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tanques = () => ({ oleada: oleada + 1, vidas, puntos, bajas, disparos, impactos, terminado, reloj, cola: cola.length, enemigos: enemigos.filter((x) => x.vivo).map((x) => ({ clase: x.clase, celda: celda(x.x, x.z), ve: aLaVista(x, yo) })), yo: celda(yo.x, yo.z), dentro });
  const pilotear = (): { mx: number; mz: number; dispara: boolean } => {
    const vivos = enemigos.filter((x) => x.vivo), cerca = vivos.sort((a, b) => Math.hypot(a.x - yo.x, a.z - yo.z) - Math.hypot(b.x - yo.x, b.z - yo.z))[0];
    if (!yo.destino || Math.hypot(yo.destino.x - yo.x, yo.destino.z - yo.z) < 0.4 || r() < 0.02) {
      let mejor: { x: number; z: number } | null = null, nota = -Infinity;
      const [cx, cz] = celda(yo.x, yo.z);
      for (let a = cx - 3; a <= cx + 3; a++) for (let b = cz - 3; b <= cz + 3; b++) {
        if (solido(a, b)) continue;
        const p = centro(a, b);
        if (!aLaVista(yo, p)) continue; // solo lugares a los que se llega en línea recta
        const d = cerca ? Math.hypot(p.x - cerca.x, p.z - cerca.z) : 5, n = (cerca && aLaVista(p, cerca) ? 2 : 0) - Math.abs(d - 5) * 0.3 + r() * 0.4;
        if (n > nota) { nota = n; mejor = p; }
      }
      yo.destino = mejor;
    }
    const peligro = balas.find((b) => !b.jugador && Math.hypot(b.x - yo.x, b.z - yo.z) < 3 && (yo.x - b.x) * b.vx + (yo.z - b.z) * b.vz > 0);
    let mx = 0, mz = 0;
    if (peligro) { const s = (yo.x - peligro.x) * peligro.vz - (yo.z - peligro.z) * peligro.vx > 0 ? 1 : -1; mx = peligro.vz * s; mz = -peligro.vx * s; }
    else if (yo.destino) { mx = yo.destino.x - yo.x; mz = yo.destino.z - yo.z; }
    const l = Math.hypot(mx, mz) || 1;
    return { mx: mx / l, mz: mz / l, dispara: !!cerca && aLaVista(yo, cerca) };
  };

  // ── Un paso de la simulación ──
  const simular = (paso: number) => {
    reloj += paso;
    const t = reloj;
    // Jugador: mover, apuntar, disparar y dejar minas
    if (yo.vivo) {
      const auto = piloto ? pilotear() : null;
      const mx = auto ? auto.mx : mando.x, mz = auto ? auto.mz : mando.z, largo = Math.hypot(mx, mz);
      if (largo > 0.15) {
        yo.ang = girarHacia(yo.ang, Math.atan2(mx, mz), 9 * paso);
        const v = 4.2 * (t < poderes.velocidad ? 1.45 : 1), antes = { x: yo.x, z: yo.z };
        yo.x += (mx / Math.max(1, largo)) * v * paso; yo.z += (mz / Math.max(1, largo)) * v * paso;
        chocarMuros(yo);
        const anduvo = Math.hypot(yo.x - antes.x, yo.z - antes.z); yo.rodar(anduvo); yo.huella += anduvo;
        if (yo.huella > 0.45) { yo.huella = 0; marcarHuella(yo); }
      }
      const [rx, rz] = mando.derecha;
      if (Math.hypot(rx, rz) > 0.4) { usaMouse = false; yo.mira = Math.atan2(rx, rz); }
      else yo.mira = usaMouse && apuntaMouse && !piloto ? Math.atan2(apuntaMouse.x - yo.x, apuntaMouse.z - yo.z) : autoMira();
      if ((quiereDisparar || mando.tomarAccion() || (Math.hypot(rx, rz) > 0.4 && mando.pulsada) || auto?.dispara) && t > yo.recarga && t > pausaHasta) disparar(yo, t);
      quiereDisparar = false;
      if (mando.agachado && !minaAntes && minas.filter((m) => !m.enemiga).length < 2 && t > pausaHasta) {
        const m = mallaMina();
        const gigante = poderes.mina; poderes.mina = false;
        if (gigante) m.scale.setScalar(1.6);
        m.position.set(yo.x, 0, yo.z);
        e.escena.add(m);
        minas.push({ x: yo.x, z: yo.z, cuando: t + 6, armada: t, enemiga: false, gigante, malla: m });
        e.sonido.efecto('click', 0.5);
      }
      minaAntes = mando.agachado;
      // Potenciadores: se recogen al pasar encima
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (t > it.hasta) { e.escena.remove(it.malla); items.splice(i, 1); continue; }
        if (Math.hypot(it.x - yo.x, it.z - yo.z) > 0.8) continue;
        if (it.tipo === 'escudo') escudo = 2; else if (it.tipo === 'vida') vidas = Math.min(MAX_VIDAS, vidas + 1); else if (it.tipo === 'mina') poderes.mina = true; else poderes[it.tipo] = t + (it.tipo === 'rebote' ? 15 : 12);
        e.hud.aviso(PODERES[it.tipo].nombre, 'oro', 1); e.sonido.bien(); e.chispas(it.x, 0.8, it.z, [PODERES[it.tipo].color, '#ffffff'], 18, 4);
        e.escena.remove(it.malla); items.splice(i, 1);
      }
    } else if (t > invencible - 2) {
      // Reaparece en la salida
      yo = crearTanque('yo', SALIDA.x, SALIDA.z);
      yo.ang = yo.mira = Math.PI / 2;
    }
    // Llegan los que faltan de la oleada
    if (cola.length && t > proximo) { sumar(cola.shift()!, t); proximo = t + 3.5; }
    // Enemigos: se mueven buscando tiro, giran la torreta y disparan si te ven
    if (t > pausaHasta) for (const en of enemigos) {
      if (!en.vivo) continue;
      const datos = CLASES[en.clase as Clase];
      if (datos.vel > 0) {
        // Esquiva balas tuyas que vienen directo a él
        const peligro = en.clase !== 'kamikaze' && balas.find((b) => b.jugador && Math.hypot(b.x - en.x, b.z - en.z) < 3.5 && (en.x - b.x) * b.vx + (en.z - b.z) * b.vz > 0);
        if (peligro) { const s = (en.x - peligro.x) * peligro.vz - (en.z - peligro.z) * peligro.vx > 0 ? 1 : -1; en.destino = { x: en.x + peligro.vz * s * 0.3, z: en.z - peligro.vx * s * 0.3 }; }
        if (en.clase === 'kamikaze' && yo.vivo) en.destino = { x: yo.x, z: yo.z };
        else if (!en.destino || Math.hypot(en.destino.x - en.x, en.destino.z - en.z) < 0.4 || r() < paso * 0.25) {
          // Busca un lugar con tiro hacia ti, a su distancia preferida (flanquea y se cubre)
          const prefiere = en.clase === 'rojo' ? 3.5 : en.clase === 'minador' ? 6 : 5;
          let mejor: { x: number; z: number } | null = null, nota = -Infinity;
          const [cx, cz] = celda(en.x, en.z);
          for (let a = cx - 4; a <= cx + 4; a++) for (let b = cz - 4; b <= cz + 4; b++) {
            if (solido(a, b)) continue;
            const p = centro(a, b);
            if (!aLaVista(en, p)) continue; // solo lugares a los que se llega en línea recta (antes se trababan contra un bloque)
            const d = Math.hypot(p.x - yo.x, p.z - yo.z), n = (yo.vivo && aLaVista(p, yo) ? 2 : 0) - Math.abs(d - prefiere) * 0.25 + r() * 0.8;
            if (n > nota) { nota = n; mejor = p; }
          }
          en.destino = mejor;
        }
        if (en.destino) {
          const objetivo = Math.atan2(en.destino.x - en.x, en.destino.z - en.z);
          en.ang = girarHacia(en.ang, objetivo, (en.clase === 'blindado' ? 2.5 : 5) * paso);
          const antes = { x: en.x, z: en.z }, vel = datos.vel * (en.furia ? 1.4 : 1);
          en.x += Math.sin(en.ang) * vel * paso; en.z += Math.cos(en.ang) * vel * paso;
          chocarMuros(en);
          const anduvo = Math.hypot(en.x - antes.x, en.z - antes.z); en.rodar(anduvo); en.huella += anduvo;
          if (en.huella > 0.55) { en.huella = 0; marcarHuella(en); }
          if (anduvo < vel * paso * 0.3) { const [cx, cz] = celda(en.x, en.z), lado = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [cx + a, cz + b]).filter(([a, b]) => !solido(a, b)); const q = lado[Math.floor(r() * lado.length)]; en.destino = q ? centro(q[0], q[1]) : null; } // atascado: se corre a una celda vecina libre
        }
      }
      // Kamikaze: estalla al llegar a ti
      if (en.clase === 'kamikaze') {
        if (yo.vivo && Math.hypot(yo.x - en.x, yo.z - en.z) < 1) {
          explotar(en.x, en.z, true); quitar(en);
          const [cx, cz] = celda(en.x, en.z);
          for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) romperCaja(a, b, false);
          if (Math.hypot(yo.x - en.x, yo.z - en.z) < 1.8) danar(yo, false, false);
          if (terminado) return;
        }
        continue;
      }
      // Minador: deja minas negras por donde pasa
      if (en.clase === 'minador' && t > en.minaEn && minas.filter((m) => m.enemiga).length < 3) {
        en.minaEn = t + 4.5;
        const m = mallaMina(true); m.position.set(en.x, 0, en.z); e.escena.add(m);
        minas.push({ x: en.x, z: en.z, cuando: t + 9, armada: t + 1.2, enemiga: true, gigante: false, malla: m });
      }
      const ve = yo.vivo && aLaVista(en, yo), adelanto = ve ? Math.hypot(yo.x - en.x, yo.z - en.z) / datos.bala : 0;
      const blanco = { x: yo.x + Math.sin(yo.ang) * adelanto * 2, z: yo.z + Math.cos(yo.ang) * adelanto * 2 };
      // El francotirador, si no te ve, busca un tiro de rebote
      if (en.clase === 'verde' && !ve && t > en.piensaRebote) { en.piensaRebote = t + 1.2; en.rebote = yo.vivo ? buscarRebote(en) : null; }
      const quiere = ve ? Math.atan2(blanco.x - en.x, blanco.z - en.z) : en.rebote ?? en.mira + 0.5;
      en.mira = girarHacia(en.mira, quiere, (en.clase === 'verde' ? 3 : 2) * paso);
      const apuntado = Math.abs(girarHacia(en.mira, quiere, 9) - en.mira) < 0.12;
      if (t > en.recarga && apuntado && (ve || (en.clase === 'verde' && en.rebote !== null))) {
        if (en.clase === 'jefe' && en.furia) disparar(en, t, [-0.5, -0.25, 0, 0.25, 0.5].map((d) => en.mira + d));
        else if (en.clase === 'jefe') disparar(en, t, [en.mira - 0.25, en.mira, en.mira + 0.25]);
        else disparar(en, t);
        if (en.clase === 'verde') en.rebote = null;
      }
    }
    // Choques entre tanques
    const todos = [yo, ...enemigos].filter((x) => x.vivo);
    for (let i = 0; i < todos.length; i++) for (let k = i + 1; k < todos.length; k++) {
      const a = todos[i], b = todos[k], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), junto = R_TANQUE * 2;
      if (d >= junto || d === 0) continue;
      const s = (junto - d) / 2;
      a.x -= (dx / d) * s; a.z -= (dz / d) * s; b.x += (dx / d) * s; b.z += (dz / d) * s;
    }
    // El empujón entre tanques puede meter a uno en un bloque: se vuelven a revisar las paredes (antes quedaba dentro, imposible de matar)
    for (const t of todos) chocarMuros(t);
    for (const t of todos) if (solido(...celda(t.x, t.z))) dentro++;
    // Balas: avanzan en tramos cortos (no atraviesan paredes delgadas), rebotan, rompen cajas, se anulan con las del
    // otro bando y dañan solo al bando contrario (sin fuego amigo entre enemigos; las tuyas sí pueden dañarte)
    const jefe = enemigos.find((x) => x.vivo && x.clase === 'jefe' && x.furia);
    for (let i = balas.length - 1; i >= 0; i--) {
      const b = balas[i];
      let fuera = false;
      const tramos = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vz) * paso) / 0.2)), dt2 = paso / tramos;
      for (let s = 0; s < tramos && !fuera; s++) {
        const nx = b.x + b.vx * dt2, nz = b.z + b.vz * dt2, [cx, cz] = celda(b.x, b.z), [ax, az] = celda(nx, nz);
        if (solido(ax, az)) {
          if (romperCaja(ax, az, b.jugador)) fuera = true;
          else if (b.rebotes-- > 0) {
            if (ax !== cx && solido(ax, cz)) b.vx = -b.vx; else if (az !== cz && solido(cx, az)) b.vz = -b.vz; else { b.vx = -b.vx; b.vz = -b.vz; }
            e.sonido.tono(b.jugador ? 760 : 640, 0.03, { tipo: 'square', vol: 0.04 });
          } else fuera = true;
        } else { b.x = nx; b.z = nz; }
        // El escudo giratorio del jefe frena tus balas
        if (!fuera && b.jugador && jefe) for (const p of placas) if (p.visible && Math.hypot(p.position.x - b.x, p.position.z - b.z) < 0.42) { fuera = true; e.chispas(b.x, 0.6, b.z, ['#c9a2ff', '#ffffff'], 6, 2); }
        if (!fuera) for (let k = balas.length - 1; k >= 0; k--) {
          const o = balas[k];
          if (o === b || o.jugador === b.jugador || Math.hypot(o.x - b.x, o.z - b.z) > 0.35) continue;
          e.chispas(b.x, 0.66, b.z, ['#ffffff', '#ffd23c'], 8, 3); e.sonido.tono(1200, 0.04, { tipo: 'triangle', vol: 0.06 });
          e.escena.remove(o.malla);
          balas.splice(k, 1);
          if (k < i) i--;
          fuera = true;
          break;
        }
        if (!fuera) for (const tq of [yo, ...enemigos]) {
          if (!tq.vivo || Math.hypot(tq.x - b.x, tq.z - b.z) > R_TANQUE * (tq.clase === 'jefe' ? 1.35 : 1)) continue;
          const esYo = tq === yo;
          if (!b.jugador && !esYo) continue; // sin fuego amigo
          if (esYo && b.jugador && b.rebotes === b.reb0) continue; // tu bala recién salida no te toca
          if (esYo && reloj < invencible) continue;
          fuera = true;
          // Blindado: de frente no le entra
          if (tq.clase === 'blindado') {
            const len = Math.hypot(b.vx, b.vz), frente = -(Math.sin(tq.ang) * b.vx + Math.cos(tq.ang) * b.vz) / len;
            if (frente > 0.5) { e.chispas(b.x, 0.7, b.z, ['#dfe6ee', '#ffffff'], 8, 3); e.sonido.tono(1500, 0.05, { tipo: 'triangle', vol: 0.08 }); if (b.jugador) e.flotante('¡Blindado!', tq.x, 1.4, tq.z, ''); break; }
          }
          danar(tq, b.jugador, b.rebotes < b.reb0);
          if (terminado) return;
          break;
        }
      }
      b.malla.position.set(b.x, 0.66, b.z);
      b.malla.rotation.y = Math.atan2(b.vx, b.vz);
      if (fuera) { e.escena.remove(b.malla); balas.splice(i, 1); }
    }
    // Minas: las tuyas estallan a su hora o si un enemigo pasa encima; las enemigas, si tú pasas encima
    for (let i = minas.length - 1; i >= 0; i--) {
      const m = minas[i];
      const pisada = t > m.armada && (m.enemiga ? yo.vivo && Math.hypot(yo.x - m.x, yo.z - m.z) < 0.8 : enemigos.some((x) => x.vivo && Math.hypot(x.x - m.x, x.z - m.z) < 0.8));
      (m.malla.children[1] as THREE.Mesh).visible = Math.sin(t * (m.cuando - t < 2 ? 25 : 8)) > 0;
      if (t < m.cuando && !pisada) continue;
      explotar(m.x, m.z, true);
      e.escena.remove(m.malla);
      minas.splice(i, 1);
      const radio = m.gigante ? 3.2 : m.enemiga ? 1.8 : 2.2, [cx, cz] = celda(m.x, m.z), r2 = m.gigante ? 2 : 1;
      for (let a = cx - r2; a <= cx + r2; a++) for (let b = cz - r2; b <= cz + r2; b++) romperCaja(a, b, !m.enemiga);
      for (const tq of [yo, ...enemigos]) {
        if (!tq.vivo || Math.hypot(tq.x - m.x, tq.z - m.z) > radio) continue;
        if (m.enemiga && tq !== yo) continue; // sin fuego amigo
        danar(tq, !m.enemiga, false, true);
        if (terminado) return;
      }
    }
    // ¿Oleada ganada?
    if (!cola.length && enemigos.every((x) => !x.vivo) && t > pausaHasta) {
      puntos += 300; desglose.oleadas += 300;
      e.sonido.bien();
      e.chispas(yo.x, 1, yo.z, ['#ffd23c', '#3f8cff', '#ffffff'], 40, 6);
      if (oleada >= OLEADAS.length - 1) return terminar(t, true);
      nuevaOleada(t);
    }
    if (t >= DURA) return terminar(t, false);
  };

  nuevaOleada(0);
  e.hud.tiempo(mmss(DURA));
  const v3 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  e.alCuadro((t, dt) => {
    if (empezado && !terminado) {
      const paso = Math.min(dt, 0.05);
      for (let k = 0; k < velocidad * aceleracion && !terminado; k++) simular(paso);
      if (!terminado) {
        const vivos = enemigos.filter((x) => x.vivo).length + cola.length, propias = balas.filter((b) => b.jugador).length, max = reloj < poderes.doble ? 8 : 5;
        const activos = [escudo ? `escudo ×${escudo}` : '', reloj < poderes.doble ? 'doble' : '', reloj < poderes.rebote ? 'rebote' : '', reloj < poderes.velocidad ? 'veloz' : '', poderes.mina ? 'mina gigante' : ''].filter(Boolean).join(', ');
        e.hud.tiempo(mmss(Math.max(0, DURA - reloj)));
        e.hud.extra(`Oleada ${oleada + 1}/${OLEADAS.length} · ${'♥'.repeat(Math.max(0, vidas))} · quedan ${vivos} · balas ${'●'.repeat(Math.max(0, max - propias))}${'○'.repeat(Math.min(max, propias))}${activos ? ` · ${activos}` : ''}`);
        e.hud.puntos(Math.max(0, puntos));
      }
    }
    rapido.textContent = velocidad === 1 ? '⏩ x2' : '▶ x1';
    // Dibujo de los tanques: cañón que retrocede, humo si están dañados y barra de vida
    for (const tq of [yo, ...enemigos]) {
      if (!tq.vivo) continue;
      tq.cuerpo.position.set(tq.x, 0, tq.z);
      tq.cuerpo.rotation.y = tq.ang;
      tq.torreta.position.set(tq.x, 0, tq.z);
      tq.torreta.rotation.y = tq.mira;
      tq.sombra.position.set(tq.x, 0.02, tq.z);
      tq.retro = Math.max(0, tq.retro - dt * 6);
      tq.canon.position.z = 0.45 - tq.retro * 0.16;
      if (tq.vida < tq.max && t > tq.humo) { tq.humo = t + 0.25; e.chispas(tq.x, 0.9, tq.z, ['#55555c', '#8a8a92'], 2, 0.8); }
      if (tq.barra) { tq.barra.position.set(tq.x, 1.5, tq.z); tq.barra.scale.x = Math.max(0.02, tq.vida / tq.max); tq.barra.lookAt(e.camara.position); }
      if (tq === yo) tq.cuerpo.visible = tq.torreta.visible = reloj > invencible - 2.4 || Math.sin(t * 30) > 0;
    }
    // Escudo del jefe furioso: dos placas que giran a su alrededor
    const jefe = enemigos.find((x) => x.vivo && x.clase === 'jefe');
    placas.forEach((p, i) => { p.visible = !!jefe?.furia; if (jefe && p.visible) { const a = t * 2.4 + i * Math.PI; p.position.set(jefe.x + Math.sin(a) * 1.05, 0.6, jefe.z + Math.cos(a) * 1.05); p.rotation.y = a; } });
    burbuja.visible = yo.vivo && escudo > 0; burbuja.position.set(yo.x, 0.5, yo.z);
    // Aviso: una bala enemiga viene hacia ti
    const viene = yo.vivo && balas.some((b) => !b.jugador && Math.hypot(b.x - yo.x, b.z - yo.z) < 3 && (yo.x - b.x) * b.vx + (yo.z - b.z) * b.vz > 0);
    alerta.visible = viene; if (viene) { alerta.position.set(yo.x, 0.04, yo.z); (alerta.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 25) * 0.3; }
    // Mira: hasta la primera pared y un tramo del rebote
    mira.visible = yo.vivo && empezado && !terminado;
    if (mira.visible) {
      const ruta = trayecto(yo.x + Math.sin(yo.mira) * 0.8, yo.z + Math.cos(yo.mira) * 0.8, yo.mira, 1, 9);
      for (let i = 0; i < 3; i++) { const p = ruta[Math.min(i, ruta.length - 1)]; v3[i].set(p.x, 0.66, p.z); }
      if (ruta.length > 2) { const a = ruta[1], b = ruta[2], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, f = Math.min(1, 2.2 / l); v3[2].set(a.x + (b.x - a.x) * f, 0.66, a.z + (b.z - a.z) * f); }
      mira.geometry.setFromPoints(v3); mira.computeLineDistances();
    }
    // Efectos: potenciadores que giran, restos que se apagan, ondas y astillas
    for (const it of items) { it.malla.rotation.y = t * 2; it.malla.position.y = 0.5 + Math.sin(t * 3 + it.x) * 0.12; it.malla.visible = it.hasta - reloj > 3 || Math.sin(t * 16) > 0; }
    for (let i = restos.length - 1; i >= 0; i--) { const rr = restos[i], q = rr.hasta - reloj; (rr.m.material as THREE.MeshLambertMaterial).opacity = Math.min(0.85, q / 2); if (q <= 0) { e.escena.remove(rr.m); restos.splice(i, 1); } }
    for (const w of ondas) { const edad = reloj - w.t0; w.m.visible = edad < 0.45; if (w.m.visible) { w.m.scale.setScalar(0.3 + (edad / 0.45) * w.tam); (w.m.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - edad / 0.45); } }
    for (const a of astillas) { if (!a.m.visible) continue; a.vida -= dt; a.vy -= 14 * dt; a.m.position.x += a.vx * dt; a.m.position.y = Math.max(0.05, a.m.position.y + a.vy * dt); a.m.position.z += a.vz * dt; a.m.rotation.x += dt * 8; if (a.vida <= 0) a.m.visible = false; }
    pintarMapa();
  });

  return {
    empezar() { e.empezar(); empezado = true; pausaHasta = reloj + 1.2; },
    destruir() { c.caja.removeEventListener('pointerdown', alClic, true); e.destruir(); },
  };
}
