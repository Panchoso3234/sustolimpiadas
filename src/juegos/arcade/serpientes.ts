import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { bosque, cielo, halo } from '../decorado';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, mmss } from '../reflejos/motor';

// Serpientes: un jardín de noche al estilo Slither.io. Tu serpiente y ocho de máquina comen bolitas brillantes para crecer.
// Si tu cabeza toca el cuerpo de otra, mueres; si otra choca contigo, se deshace en comida. Cabeza contra cabeza pierde la
// más chica. Acelerar cuesta largo. Tres minutos y una sola vida. Todos los cuerpos se dibujan como una sola malla de instancias.
// Al morir, el cuerpo revienta de la cabeza a la cola y deja su comida desparramada; si caes tú, la cámara se acerca en
// cámara lenta antes del resultado.

const RADIO = 44, DURA = 180, BOTS = 8, MAX_SEG = 2600, COMIDA = 420, EXTRA = 700, PASO_RASTRO = 0.3, VEL = 6.4, TURBO = 11.5, GIRO = 3.6;
const COLORES = ['#ff7ab8', '#5ad1ff', '#ffd23c', '#3fc79a', '#c79bff', '#ff9a2e', '#ef5565', '#7fe0ff', '#b6f36b'];
const NOMBRES = ['Medusa', 'Fideo', 'Zigzag', 'Cuncuna', 'Tallarín', 'Manguera', 'Culebrón', 'Espiral'];
const CAMARA_LENTA = 1.8; // segundos entre tu caída y el resultado

interface Serpiente { id: number; humano: boolean; x: number; z: number; ang: number; masa: number; rastro: { x: number; z: number }[]; viva: boolean; vuelve: number; color: THREE.Color; claro: THREE.Color; cabeza: THREE.Group; ojos: THREE.Object3D[]; turbo: boolean; corre: boolean; gasta: number; mejor: number; muertes: number; meta: number; piensa: number; nombre: string }
interface Bolita { x: number; z: number; vx: number; vz: number; valor: number; activa: boolean; color: THREE.Color; fija: boolean }
/** Un cuerpo que revienta: sus segmentos desaparecen de la cabeza a la cola con un destello. */
interface Cadaver { pts: { x: number; z: number }[]; gr: number; color: THREE.Color; claro: THREE.Color; t0: number; reventados: number }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 30, alto: 20, centro: [0, 0, 0], inclinacion: 1.15, sinPlaya: true });
  e.camara.far = 300;
  e.camara.updateProjectionMatrix();
  cielo(e.escena, '#03060f', '#0f2a22', '#081526');
  const mando = crearMando(e, c.caja, 'Turbo', undefined, { palancaConMouse: false });
  const r = generador(`${c.semilla}|serpientes`);

  // ── El jardín: pasto oscuro con dibujo, borde que brilla, hongos y luciérnagas ──
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#132a1d'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { g.fillStyle = (i + k) % 2 ? '#16321f' : '#11261a'; g.beginPath(); g.arc(i * 32 + 16 + (k % 2) * 16, k * 32 + 16, 14, 0, 6.3); g.fill(); }
  const tela = new THREE.CanvasTexture(cv); tela.wrapS = tela.wrapT = THREE.RepeatWrapping; tela.repeat.set(24, 24); tela.colorSpace = THREE.SRGBColorSpace;
  const piso = new THREE.Mesh(new THREE.CircleGeometry(RADIO, 64), new THREE.MeshLambertMaterial({ map: tela }));
  piso.rotation.x = -Math.PI / 2;
  const afuera = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshLambertMaterial({ color: '#0a160f' }));
  afuera.rotation.x = -Math.PI / 2; afuera.position.y = -0.05;
  const borde = new THREE.Mesh(new THREE.TorusGeometry(RADIO, 0.35, 8, 96), new THREE.MeshBasicMaterial({ color: '#ff5ab8' }));
  borde.rotation.x = Math.PI / 2; borde.position.y = 0.3;
  // Franja de advertencia por dentro del borde: se ve dónde termina el jardín antes de tocarlo
  const franja = new THREE.Mesh(new THREE.RingGeometry(RADIO - 3, RADIO, 96), new THREE.MeshBasicMaterial({ color: '#ff3a6e', transparent: true, opacity: 0.12, depthWrite: false }));
  franja.rotation.x = -Math.PI / 2; franja.position.y = 0.02;
  e.escena.add(afuera, piso, franja, borde);
  e.escena.traverse((o) => { const l = o as THREE.Light; if (l.isLight) l.intensity *= 0.55; });
  await Promise.all([
    bosque(e.escena, 'naturaleza', 'mushroom_redTall', Array.from({ length: 40 }, () => { const a = r() * 6.28, d = RADIO + 1.5 + r() * 6; return { x: Math.cos(a) * d, z: Math.sin(a) * d, alto: 1 + r() * 2, giro: r() * 6 }; })),
    bosque(e.escena, 'naturaleza', 'tree_pineRoundB', Array.from({ length: 36 }, () => { const a = r() * 6.28, d = RADIO + 9 + r() * 18; return { x: Math.cos(a) * d, z: Math.sin(a) * d, alto: 6 + r() * 5, giro: r() * 6 }; })),
  ]);
  const luciernagas = new Float32Array(240);
  for (let i = 0; i < 80; i++) { const a = r() * 6.28, d = r() * RADIO * 1.3; luciernagas.set([Math.cos(a) * d, 0.8 + r() * 3, Math.sin(a) * d], i * 3); }
  const geoLuz = new THREE.BufferGeometry(); geoLuz.setAttribute('position', new THREE.BufferAttribute(luciernagas, 3));
  const puntosLuz = new THREE.Points(geoLuz, new THREE.PointsMaterial({ map: halo('rgba(220,255,140,1)'), size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  e.escena.add(puntosLuz);

  // ── Cuerpos y comida como instancias ──
  const cuerpos = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), new THREE.MeshLambertMaterial({ emissive: '#222222' }), MAX_SEG);
  cuerpos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cuerpos.frustumCulled = false;
  const bolitas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshBasicMaterial(), COMIDA + EXTRA);
  bolitas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bolitas.frustumCulled = false;
  e.escena.add(cuerpos, bolitas);
  // Ondas que se expanden donde revienta una serpiente
  const ondas = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; e.escena.add(m);
    return { m, t0: -9 };
  });
  const onda = (x: number, z: number, color: THREE.Color, t: number) => {
    const o2 = ondas.reduce((a, b) => (a.t0 < b.t0 ? a : b));
    o2.t0 = t; o2.m.position.set(x, 0.15, z); (o2.m.material as THREE.MeshBasicMaterial).color.copy(color).lerp(new THREE.Color('#ffffff'), 0.4); o2.m.visible = true;
  };

  const enArena = () => { const a = r() * 6.28, d = Math.sqrt(r()) * (RADIO - 2); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; };
  const comida: Bolita[] = Array.from({ length: COMIDA + EXTRA }, (_, i) => ({ ...enArena(), vx: 0, vz: 0, valor: 1, activa: i < COMIDA, color: new THREE.Color(COLORES[i % COLORES.length]), fija: i < COMIDA }));
  const soltar = (x: number, z: number, valor: number, color: THREE.Color, vx = 0, vz = 0) => { const b = comida.find((f) => !f.fija && !f.activa); if (b) { Object.assign(b, { x, z, vx, vz, valor, activa: true }); b.color.copy(color); } };

  // ── Serpientes ──
  const tu = c.aspecto.colores ? Object.values(c.aspecto.colores)[0] : undefined;
  const crearCabeza = (color: string) => {
    const grupo = new THREE.Group(), base = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
    base.scale.set(1.15, 0.9, 1.25);
    grupo.add(base);
    const ojos: THREE.Object3D[] = [];
    for (const lado of [-1, 1]) {
      const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })), pupila = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: '#10141c' }));
      ojo.position.set(lado * 0.48, 0.55, 0.65); pupila.position.set(lado * 0.48, 0.6, 0.92);
      grupo.add(ojo, pupila);
      ojos.push(pupila);
    }
    e.escena.add(grupo);
    return { grupo, ojos };
  };
  const serpientes: Serpiente[] = Array.from({ length: BOTS + 1 }, (_, i) => {
    const color = i === 0 ? tu ?? '#ffd23c' : COLORES[i % COLORES.length], { grupo, ojos } = crearCabeza(color);
    const base = new THREE.Color(color);
    return { id: i, humano: i === 0, x: 0, z: 0, ang: 0, masa: 10, rastro: [], viva: true, vuelve: 0, color: base, claro: base.clone().lerp(new THREE.Color('#ffffff'), 0.35), cabeza: grupo, ojos, turbo: false, corre: false, gasta: 0, mejor: 10, muertes: 0, meta: 0, piensa: 0, nombre: i === 0 ? 'Tú' : NOMBRES[i - 1] };
  });
  const yo = serpientes[0];
  const nacer = (s: Serpiente) => {
    let p = enArena();
    for (let k = 0; k < 20 && Math.hypot(p.x - yo.x, p.z - yo.z) < 16 && !s.humano; k++) p = enArena();
    if (s.humano) p = { x: 0, z: 0 };
    s.x = p.x; s.z = p.z; s.ang = r() * 6.28; s.meta = s.ang; s.masa = s.humano ? 10 : 8 + r() * 30 * (0.6 + c.nivel * 0.15); s.viva = true; s.mejor = Math.max(s.mejor, s.masa);
    s.rastro = Array.from({ length: 200 }, (_, k) => ({ x: s.x - Math.sin(s.ang) * k * PASO_RASTRO, z: s.z - Math.cos(s.ang) * k * PASO_RASTRO }));
    s.cabeza.visible = true;
  };
  serpientes.forEach(nacer);
  // Tu avatar va montado sobre tu cabeza
  const jinete = await e.personaje(c.aspecto, 1.3);
  jinete.animar('sit');

  const grosor = (s: Serpiente) => 0.42 + Math.min(0.75, s.masa * 0.0045);
  const segmentos = (s: Serpiente) => Math.min(150, 8 + Math.floor(s.masa / 2));
  const espacio = (s: Serpiente) => Math.max(1, Math.round((grosor(s) * 1.05) / PASO_RASTRO));

  // Grilla de segmentos para los choques (se arma en cada cuadro: antes se armaba cada 0,05 s y a toda velocidad
  // los choques usaban posiciones viejas)
  const CELDA = 2.5, grilla = new Map<number, { s: Serpiente; x: number; z: number; r: number }[]>(), llave = (x: number, z: number) => Math.floor((x + 100) / CELDA) * 1000 + Math.floor((z + 100) / CELDA);
  const indexar = () => {
    grilla.clear();
    for (const s of serpientes) {
      if (!s.viva) continue;
      const n = segmentos(s), k = espacio(s), gr = grosor(s);
      for (let i = 2; i < n; i++) { const p = s.rastro[i * k]; if (!p) break; const l = llave(p.x, p.z); (grilla.get(l) ?? grilla.set(l, []).get(l)!).push({ s, x: p.x, z: p.z, r: gr }); }
    }
  };
  const tocaCuerpo = (s: Serpiente, x: number, z: number, radio: number) => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of grilla.get(llave(x + a * CELDA, z + b * CELDA)) ?? []) if (q.s !== s && q.s.viva && Math.hypot(q.x - x, q.z - z) < radio + q.r * 0.85) return q.s;
    return null;
  };

  // Puntería con mouse: la serpiente va hacia el punto del jardín que está bajo el cursor, medido desde su cabeza.
  // Antes se medía desde el centro de la pantalla, pero la cámara va un poco atrasada (más con turbo): con el cursor
  // cerca de la cabeza la serpiente se iba para otro lado. Además el clic ya no hace de palanca (eso también la desviaba).
  let cursor: { x: number; y: number } | null = null, usaMouse = false, apretado = false;
  e.escuchar(e.lienzo, 'pointermove', (ev) => { if (ev.pointerType !== 'mouse') return; cursor = { x: ev.clientX, y: ev.clientY }; usaMouse = true; });
  e.escuchar(e.lienzo, 'pointerdown', (ev) => { if (ev.pointerType === 'mouse') { apretado = true; cursor = { x: ev.clientX, y: ev.clientY }; usaMouse = true; } });
  e.escuchar(window, 'pointerup', () => { apretado = false; });
  const rayo = new THREE.Raycaster(), suelo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), bajoCursor = new THREE.Vector3(), enPantalla = new THREE.Vector3(), ndc = new THREE.Vector2();
  /** El rumbo hacia el cursor, o null si el cursor está encima de la cabeza (ahí no se cambia de rumbo). */
  const rumboCursor = (): number | null => {
    if (!cursor) return null;
    const caja = e.lienzo.getBoundingClientRect();
    enPantalla.set(yo.x, 0, yo.z).project(e.camara);
    const hx = caja.left + ((enPantalla.x + 1) / 2) * caja.width, hy = caja.top + ((1 - enPantalla.y) / 2) * caja.height;
    if (Math.hypot(cursor.x - hx, cursor.y - hy) < 14) return null;
    ndc.set(((cursor.x - caja.left) / caja.width) * 2 - 1, -((cursor.y - caja.top) / caja.height) * 2 + 1);
    rayo.setFromCamera(ndc, e.camara);
    return rayo.ray.intersectPlane(suelo, bajoCursor) ? Math.atan2(bajoCursor.x - yo.x, bajoCursor.z - yo.z) : null;
  };

  // ── Minimapa y ranking en vivo ──
  const mapa = document.createElement('canvas');
  mapa.width = mapa.height = 120;
  mapa.className = 'kart-mapa';
  mapa.style.width = mapa.style.height = '120px';
  c.caja.appendChild(mapa);
  const ranking = document.createElement('div');
  Object.assign(ranking.style, { position: 'absolute', right: '12px', top: '64px', padding: '6px 10px', borderRadius: '12px', background: 'rgba(20,32,58,.62)', color: '#f3ecdc', font: '700 12px Nunito, sans-serif', lineHeight: '1.45', pointerEvents: 'none', minWidth: '120px' });
  c.caja.appendChild(ranking);
  let rankingEn = 0;
  const pintarMapa = () => {
    const m = mapa.getContext('2d')!, k = 54 / RADIO;
    m.clearRect(0, 0, 120, 120);
    m.fillStyle = 'rgba(10,22,15,.75)'; m.beginPath(); m.arc(60, 60, 56, 0, 6.3); m.fill();
    m.strokeStyle = '#ff5ab8'; m.lineWidth = 2; m.stroke();
    for (const s of serpientes) {
      if (!s.viva) continue;
      m.fillStyle = `#${s.color.getHexString()}`;
      m.beginPath(); m.arc(60 + s.x * k, 60 + s.z * k, s.humano ? 4.5 : 2.5 + Math.min(3, s.masa / 60), 0, 6.3); m.fill();
      if (s.humano) { m.strokeStyle = '#ffffff'; m.lineWidth = 1.5; m.stroke(); }
    }
  };

  let empezado = false, terminado = false, eliminadas = 0, caida = 0, asesino = '', avisoBorde = 0;
  // Solo en pruebas: "?piloto=1" maneja tu serpiente como a las de máquina
  const automatico = import.meta.env.DEV && new URLSearchParams(location.search).has('piloto');
  const puntaje = () => Math.round(yo.mejor * 10) + eliminadas * 200;
  const terminar = (t: number, vivo: boolean) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    const orden = [...serpientes].sort((a, b) => b.masa - a.masa), puesto = orden.indexOf(yo) + 1;
    c.alTerminar({
      puntaje: puntaje() + (vivo ? 300 : 0),
      lineas: [['Largo máximo', String(Math.round(yo.mejor))], ['Serpientes eliminadas', String(eliminadas)], ['Resultado', vivo ? 'Sobreviviste (+300)' : `Caíste a los ${Math.round(t)} s`], ...(vivo ? [] : [['Te eliminó', asesino] as [string, string]]), ['Puesto al final', `${puesto}º de ${serpientes.length}`]],
      detalle: { largo: Math.round(yo.mejor), eliminadas, vivo, seg: Math.round(t) },
    });
  };
  const cadaveres: Cadaver[] = [];
  const morir = (s: Serpiente, t: number, por: Serpiente | null) => {
    if (!s.viva) return;
    s.viva = false;
    s.cabeza.visible = false;
    const n = segmentos(s), k = espacio(s), pts: { x: number; z: number }[] = [];
    for (let i = 0; i < n; i++) { const p = s.rastro[i * k]; if (p) pts.push({ x: p.x, z: p.z }); }
    pts[0] = { x: s.x, z: s.z };
    cadaveres.push({ pts, gr: grosor(s), color: s.color.clone(), claro: s.claro.clone(), t0: t, reventados: 0 });
    // La comida queda donde estaba el cuerpo (unos 4/5 de su largo), con un empujón hacia afuera
    const piezas = Math.max(4, Math.ceil(pts.length / 2)), valor = Math.max(1, Math.round((s.masa * 0.8) / piezas));
    for (let i = 0; i < pts.length; i += 2) {
      const a = Math.random() * 6.28, f = 1.5 + Math.random() * 2.5;
      soltar(pts[i].x, pts[i].z, valor, i % 4 ? s.color : s.claro, Math.cos(a) * f, Math.sin(a) * f);
    }
    onda(s.x, s.z, s.color, t);
    e.chispas(s.x, 1, s.z, [`#${s.color.getHexString()}`, '#ffffff', '#ffe08a'], 40, 8);
    if (por === yo && s !== yo) {
      eliminadas++;
      e.hud.aviso(`¡Eliminaste a ${s.nombre}! +200`, 'oro', 1.4);
      e.flotante('+200', s.x, 2.5, s.z, 'oro');
      e.sonido.bien(); e.temblar(0.35);
      e.sonido.tono(220, 0.35, { tipo: 'sawtooth', vol: 0.1, hasta: 60 });
    } else if (s !== yo && Math.hypot(s.x - yo.x, s.z - yo.z) < 18) e.sonido.tono(320, 0.25, { tipo: 'triangle', vol: 0.06, hasta: 90 });
    if (s === yo) {
      // Tu caída: golpe, cámara lenta y la cámara se acerca; el resultado sale después
      caida = t;
      asesino = por ? por.nombre : 'el borde del jardín';
      e.hud.aviso(por ? `¡Te eliminó ${por.nombre}!` : '¡Chocaste con el borde!', 'mal', CAMARA_LENTA);
      e.temblar(0.9); e.sonido.mal();
      e.sonido.tono(160, 0.8, { tipo: 'sawtooth', vol: 0.14, hasta: 40 });
      return;
    }
    s.vuelve = t + 3;
  };

  /** Hacia dónde va un bot: esquivar cuerpos y el borde (mirando más lejos si va rápido), comer y a veces cortarle el paso al jugador. */
  const pensar = (s: Serpiente, t: number) => {
    const peligro = (ang: number, d: number) => { const x = s.x + Math.sin(ang) * d, z = s.z + Math.cos(ang) * d; return Math.hypot(x, z) > RADIO - 2.5 || !!tocaCuerpo(s, x, z, grosor(s) + 0.45); };
    const lejos = s.corre ? 1.6 : 1;
    for (const d of [1.6 * lejos, 3.2 * lejos, 5.2 * lejos]) if (peligro(s.ang, d)) {
      const izq = [0.5, 1, 1.6, 2.2].filter((a) => !peligro(s.ang + a, d)).length, der = [0.5, 1, 1.6, 2.2].filter((a) => !peligro(s.ang - a, d)).length;
      s.meta = s.ang + (izq >= der ? 1.5 : -1.5); s.turbo = false; s.piensa = t + 0.2; return;
    }
    if (t < s.piensa) return;
    s.piensa = t + 0.25 + Math.random() * 0.3;
    // Atacar: si es más grande y el jugador está cerca, se le cruza por delante
    if (yo.viva && s.masa > yo.masa * 1.15 && Math.hypot(yo.x - s.x, yo.z - s.z) < 10 && Math.random() < 0.35 + c.nivel * 0.1) {
      const delante = { x: yo.x + Math.sin(yo.ang) * (4 + yo.masa * 0.02), z: yo.z + Math.cos(yo.ang) * (4 + yo.masa * 0.02) };
      s.meta = Math.atan2(delante.x - s.x, delante.z - s.z); s.turbo = s.masa > 20; return;
    }
    let mejor: Bolita | null = null, nota = 0;
    for (const b of comida) { if (!b.activa) continue; const d = Math.hypot(b.x - s.x, b.z - s.z); if (d > 16 || Math.hypot(b.x, b.z) > RADIO - 3) continue; const n = b.valor / (1 + d); if (n > nota) { nota = n; mejor = b; } }
    s.meta = mejor ? Math.atan2(mejor.x - s.x, mejor.z - s.z) : s.ang + (Math.random() - 0.5);
    s.turbo = !!mejor && mejor.valor > 2 && s.masa > 25;
  };

  // Flecha suave delante de tu cabeza: muestra hacia dónde apuntas, para que nunca parezca que gira sola
  const flecha = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1, 3), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
  flecha.rotation.order = 'YXZ';
  flecha.rotation.x = Math.PI / 2;
  e.escena.add(flecha);
  const o = new THREE.Object3D(), objetivo = new THREE.Vector3(), tono = new THREE.Color(), blanco = new THREE.Color('#ffffff');
  const camara = (dt: number, ya = false) => {
    // Tras caer, la cámara baja y se acerca a donde reventaste
    const cerca = caida ? Math.min(1, (e.reloj() - caida) / 0.8) : 0;
    const alto = Math.min(34, 17 + yo.masa * 0.06) * (1 - cerca * 0.45);
    objetivo.set(yo.x, alto, yo.z + alto * 0.42);
    e.camara.position.lerp(objetivo, ya ? 1 : 1 - Math.exp(-(caida ? 3 : 7) * dt));
    e.camara.lookAt(yo.x, 0, yo.z);
  };
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__serpientes = () => ({ x: yo.x, z: yo.z, ang: yo.ang, meta: yo.meta, viva: yo.viva, masa: yo.masa, eliminadas, caida, vivas: serpientes.filter((s) => s.viva).length, cadaveres: cadaveres.length });
  e.hud.tiempo(mmss(DURA));
  e.hud.puntos(0);
  camara(0, true);
  e.alCuadro((t, dt) => {
    // Cámara lenta mientras caes (todo se mueve a un tercio de la velocidad)
    const lento = caida ? Math.max(0.3, 1 - (t - caida) * 1.6) : 1;
    const paso = Math.min(dt, 0.05) * lento;
    if (empezado && !terminado) {
      if (caida && t - caida >= CAMARA_LENTA) return terminar(caida, false);
      indexar();
      for (const s of serpientes) {
        if (!s.viva) { if (!s.humano && t > s.vuelve) nacer(s); continue; }
        // Dirección: la palanca/teclado/control si se usan; si no, el cursor
        if (s.humano && !automatico) {
          const mx = mando.x, mz = mando.z;
          if (Math.hypot(mx, mz) > 0.3) { s.meta = Math.atan2(mx, mz); usaMouse = false; }
          else if (usaMouse) s.meta = rumboCursor() ?? s.meta;
          else s.meta = s.ang;
          s.turbo = mando.pulsada || apretado;
        } else pensar(s, t);
        let dif = s.meta - s.ang;
        while (dif > Math.PI) dif -= Math.PI * 2;
        while (dif < -Math.PI) dif += Math.PI * 2;
        s.ang += Math.max(-GIRO * paso, Math.min(GIRO * paso, dif)) * (s.humano ? 1 : 0.9 + c.nivel * 0.03);
        // Turbo: más rápido, pero va soltando comida por la cola
        s.corre = s.turbo && s.masa > 12;
        if (s.corre && t > s.gasta) { s.gasta = t + 0.18; s.masa -= 1; const cola = s.rastro[segmentos(s) * espacio(s)] ?? s.rastro[s.rastro.length - 1]; soltar(cola.x, cola.z, 1, s.claro); }
        const v = s.corre ? TURBO : VEL;
        s.x += Math.sin(s.ang) * v * paso; s.z += Math.cos(s.ang) * v * paso;
        // Rastro: un punto nuevo cada tanto; se guarda lo justo para el largo actual
        const ult = s.rastro[0];
        let d = Math.hypot(s.x - ult.x, s.z - ult.z);
        // (tantos puntos como haga falta: con turbo o pocos cuadros por segundo la cabeza se despegaba del cuerpo)
        for (let a = s.rastro[0]; d >= PASO_RASTRO; a = s.rastro[0], d = Math.hypot(s.x - a.x, s.z - a.z)) {
          const k = PASO_RASTRO / d;
          s.rastro.unshift({ x: a.x + (s.x - a.x) * k, z: a.z + (s.z - a.z) * k });
        }
        s.rastro.length = Math.min(s.rastro.length, segmentos(s) * espacio(s) + 4);
        // Comer: la comida cercana se acerca a la boca
        const boca = grosor(s) + 0.5;
        for (const b of comida) {
          if (!b.activa) continue;
          const dx = s.x - b.x, dz = s.z - b.z, db = Math.hypot(dx, dz);
          if (db < boca + 1.4) { b.x += dx * Math.min(1, paso * 7); b.z += dz * Math.min(1, paso * 7); }
          if (db < boca) {
            b.activa = false; s.masa += b.valor; s.mejor = Math.max(s.mejor, s.masa);
            if (b.fija) Object.assign(b, enArena(), { activa: true, vx: 0, vz: 0 });
            if (s.humano && Math.random() < 0.5) e.sonido.tono(700 + Math.random() * 500, 0.05, { tipo: 'sine', vol: 0.06 });
          }
        }
        // Choques: contra el borde, el cuerpo de otra o cabeza contra cabeza (pierde la más chica)
        if (Math.hypot(s.x, s.z) > RADIO) { morir(s, t, null); continue; }
        const choca = tocaCuerpo(s, s.x, s.z, grosor(s) * 0.9);
        if (choca) { morir(s, t, choca); continue; }
        for (const otra of serpientes) {
          if (otra === s || !otra.viva || Math.hypot(otra.x - s.x, otra.z - s.z) > (grosor(s) + grosor(otra)) * 0.85) continue;
          if (s.masa <= otra.masa) morir(s, t, otra); else morir(otra, t, s);
          break;
        }
      }
      if (!caida && t >= DURA) return terminar(t, true);
      // Aviso del borde
      if (yo.viva && Math.hypot(yo.x, yo.z) > RADIO - 5 && t > avisoBorde) { avisoBorde = t + 2.5; e.hud.aviso('¡Cuidado con el borde!', 'mal', 0.9); }
      const vivas = serpientes.filter((s) => s.viva).sort((a, b) => b.masa - a.masa);
      e.hud.tiempo(mmss(Math.max(0, DURA - t)));
      e.hud.extra(yo.viva ? `Largo ${Math.round(yo.masa)} · ${vivas.indexOf(yo) + 1}º de ${vivas.length}${yo.corre ? ' · ¡Turbo!' : ''}` : 'Eliminada');
      e.hud.puntos(puntaje());
      if (t > rankingEn) {
        rankingEn = t + 0.3;
        ranking.innerHTML = '<div style="color:#ffe08a;letter-spacing:.06em">LOS MÁS LARGOS</div>' + vivas.slice(0, 5).map((s, i) => `<div style="color:${s.humano ? '#ffe08a' : `#${s.color.getHexString()}`}">${i + 1}. ${s.nombre} · ${Math.round(s.masa)}</div>`).join('') + (yo.viva && vivas.indexOf(yo) >= 5 ? `<div style="color:#ffe08a">${vivas.indexOf(yo) + 1}. Tú · ${Math.round(yo.masa)}</div>` : '');
      }
    }
    // Comida que salió despedida al reventar un cuerpo: se frena rápido y queda dentro del jardín
    for (const b of comida) {
      if (!b.activa || (!b.vx && !b.vz)) continue;
      b.x += b.vx * paso; b.z += b.vz * paso;
      const f = Math.pow(0.02, paso); b.vx *= f; b.vz *= f;
      if (Math.abs(b.vx) + Math.abs(b.vz) < 0.05) b.vx = b.vz = 0;
      const d = Math.hypot(b.x, b.z); if (d > RADIO - 1) { b.x *= (RADIO - 1) / d; b.z *= (RADIO - 1) / d; }
    }
    // Dibujo de los cuerpos (de la cola a la cabeza, con franjas; con turbo una ola de luz recorre el cuerpo)
    let n = 0;
    for (const s of serpientes) {
      if (!s.viva) continue;
      const total = segmentos(s), k = espacio(s), gr = grosor(s);
      for (let i = total - 1; i >= 1 && n < MAX_SEG; i--) {
        const p = s.rastro[i * k] ?? s.rastro[s.rastro.length - 1], ondula = Math.sin(t * 6 - i * 0.5) * 0.06;
        const fino = 1 - (i / total) * 0.35;
        o.position.set(p.x, gr * fino, p.z); o.scale.setScalar(gr * fino * (1 + ondula)); o.updateMatrix();
        cuerpos.setMatrixAt(n, o.matrix);
        tono.copy(Math.floor(i / 3) % 2 ? s.claro : s.color);
        if (s.corre) tono.lerp(blanco, Math.max(0, Math.sin(t * 18 - i * 0.6)) * 0.45);
        cuerpos.setColorAt(n++, tono);
      }
      s.cabeza.position.set(s.x, gr * 1.05, s.z);
      s.cabeza.rotation.y = s.ang;
      s.cabeza.scale.setScalar(gr * 1.05);
      // Las pupilas miran hacia donde quiere ir
      const mira = Math.max(-0.12, Math.min(0.12, Math.atan2(Math.sin(s.meta - s.ang), Math.cos(s.meta - s.ang)) * 0.2));
      s.ojos.forEach((ojo, j) => { ojo.position.x = (j ? 1 : -1) * 0.48 + mira; });
    }
    // Cuerpos que revientan: cada segmento se infla, destella y desaparece, de la cabeza a la cola
    for (let ci = cadaveres.length - 1; ci >= 0; ci--) {
      const cad = cadaveres[ci], edad = t - cad.t0, porSeg = Math.min(0.012, 0.6 / cad.pts.length);
      if (edad > cad.pts.length * porSeg + 0.4) { cadaveres.splice(ci, 1); continue; }
      cad.pts.forEach((p, i) => {
        const k = Math.max(0, Math.min(1, (edad - i * porSeg) / 0.35));
        if (k >= 1 || n >= MAX_SEG) return;
        const fino = 1 - (i / cad.pts.length) * 0.35, infla = 1 + Math.sin(k * Math.PI) * 0.45;
        o.position.set(p.x, cad.gr * fino, p.z); o.scale.setScalar(cad.gr * fino * infla * (1 - k * k)); o.updateMatrix();
        cuerpos.setMatrixAt(n, o.matrix);
        cuerpos.setColorAt(n++, tono.copy(i % 6 < 3 ? cad.color : cad.claro).lerp(blanco, Math.sin(k * Math.PI) * 0.7));
      });
      // Chispas al reventar, cada tres segmentos
      const ya = Math.min(cad.pts.length, Math.floor(edad / porSeg));
      for (; cad.reventados < ya; cad.reventados++) if (cad.reventados % 3 === 0) { const p = cad.pts[cad.reventados]; e.chispas(p.x, cad.gr, p.z, [`#${cad.color.getHexString()}`, '#ffffff'], 3, 3); }
    }
    cuerpos.count = n;
    cuerpos.instanceMatrix.needsUpdate = true;
    if (cuerpos.instanceColor) cuerpos.instanceColor.needsUpdate = true;
    for (const w of ondas) {
      const edad = t - w.t0;
      w.m.visible = edad < 0.6;
      if (!w.m.visible) continue;
      w.m.scale.setScalar(1 + edad * 14);
      (w.m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - edad / 0.6);
    }
    let m = 0;
    for (const b of comida) {
      if (!b.activa) continue;
      o.position.set(b.x, 0.3 + Math.sin(t * 3 + b.x) * 0.08, b.z); o.scale.setScalar((b.valor > 1 ? 1.3 + Math.min(1.2, b.valor * 0.12) : 1) * (1 + Math.sin(t * 5 + b.z) * 0.15)); o.updateMatrix();
      bolitas.setMatrixAt(m, o.matrix);
      bolitas.setColorAt(m++, b.color);
    }
    bolitas.count = m;
    bolitas.instanceMatrix.needsUpdate = true;
    if (bolitas.instanceColor) bolitas.instanceColor.needsUpdate = true;
    flecha.visible = yo.viva && empezado && !terminado;
    if (flecha.visible) {
      const lejos = grosor(yo) * 2 + 1.4, giro = Math.abs(Math.atan2(Math.sin(yo.meta - yo.ang), Math.cos(yo.meta - yo.ang)));
      flecha.position.set(yo.x + Math.sin(yo.meta) * lejos, 0.2, yo.z + Math.cos(yo.meta) * lejos);
      flecha.rotation.y = yo.meta;
      (flecha.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.min(1, giro) * 0.45;
    }
    jinete.grupo.visible = yo.viva;
    jinete.grupo.position.set(yo.x - Math.sin(yo.ang) * 0.2, grosor(yo) * 1.7, yo.z - Math.cos(yo.ang) * 0.2);
    jinete.grupo.rotation.y = yo.ang;
    for (let i = 0; i < 80; i++) luciernagas[i * 3 + 1] = 1 + Math.abs(Math.sin(t * 0.7 + i)) * 2.5;
    geoLuz.attributes.position.needsUpdate = true;
    // El borde late más fuerte cuando estás cerca
    const cercaBorde = yo.viva ? Math.max(0, 1 - (RADIO - Math.hypot(yo.x, yo.z)) / 6) : 0;
    borde.material.color.setHSL(0.9 + Math.sin(t * (1 + cercaBorde * 6)) * 0.05, 1, 0.65 + cercaBorde * 0.2);
    (franja.material as THREE.MeshBasicMaterial).opacity = 0.12 + cercaBorde * (0.25 + Math.sin(t * 10) * 0.1);
    pintarMapa();
    camara(dt);
  });

  return { empezar() { e.empezar(); empezado = true; e.hud.aviso('¡A comer!', 'oro', 1); }, destruir: e.destruir };
}
