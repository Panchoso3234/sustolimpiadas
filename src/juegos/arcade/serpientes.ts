import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { bosque, cielo, halo } from '../decorado';
import { crearMando } from '../mando';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, mmss } from '../reflejos/motor';

// Serpientes: un jardín de noche al estilo Slither.io. Tu serpiente y ocho de máquina comen bolitas brillantes para crecer.
// Si tu cabeza toca el cuerpo de otra, mueres; si otra choca contigo, se deshace en comida. Acelerar cuesta largo.
// Tres minutos y una sola vida. Todos los cuerpos se dibujan como una sola malla de instancias.

const RADIO = 44, DURA = 180, BOTS = 8, MAX_SEG = 1500, COMIDA = 420, PASO_RASTRO = 0.3, VEL = 6.4, TURBO = 11.5, GIRO = 3.6;
const COLORES = ['#ff7ab8', '#5ad1ff', '#ffd23c', '#3fc79a', '#c79bff', '#ff9a2e', '#ef5565', '#7fe0ff', '#b6f36b'];
const NOMBRES = ['Medusa', 'Fideo', 'Zigzag', 'Cuncuna', 'Tallarín', 'Manguera', 'Culebrón', 'Espiral'];

interface Serpiente { id: number; humano: boolean; x: number; z: number; ang: number; masa: number; rastro: { x: number; z: number }[]; viva: boolean; vuelve: number; color: THREE.Color; claro: THREE.Color; cabeza: THREE.Group; ojos: THREE.Object3D[]; turbo: boolean; gasta: number; mejor: number; muertes: number; meta: number; piensa: number; nombre: string }
interface Bolita { x: number; z: number; valor: number; activa: boolean; color: THREE.Color; fija: boolean }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 30, alto: 20, centro: [0, 0, 0], inclinacion: 1.15, sinPlaya: true });
  e.camara.far = 300;
  e.camara.updateProjectionMatrix();
  cielo(e.escena, '#03060f', '#0f2a22', '#081526');
  const mando = crearMando(e, c.caja, 'Turbo');
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
  e.escena.add(afuera, piso, borde);
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
  const bolitas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshBasicMaterial(), COMIDA + 300);
  bolitas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bolitas.frustumCulled = false;
  e.escena.add(cuerpos, bolitas);

  const enArena = () => { const a = r() * 6.28, d = Math.sqrt(r()) * (RADIO - 2); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; };
  const comida: Bolita[] = Array.from({ length: COMIDA + 300 }, (_, i) => ({ ...enArena(), valor: 1, activa: i < COMIDA, color: new THREE.Color(COLORES[i % COLORES.length]), fija: i < COMIDA }));
  const soltar = (x: number, z: number, valor: number, color: THREE.Color) => { const b = comida.find((f) => !f.fija && !f.activa); if (b) Object.assign(b, { x, z, valor, activa: true, color: color.clone() }); };

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
    return { id: i, humano: i === 0, x: 0, z: 0, ang: 0, masa: 10, rastro: [], viva: true, vuelve: 0, color: base, claro: base.clone().lerp(new THREE.Color('#ffffff'), 0.35), cabeza: grupo, ojos, turbo: false, gasta: 0, mejor: 10, muertes: 0, meta: 0, piensa: 0, nombre: i === 0 ? 'Tú' : NOMBRES[i - 1] };
  });
  const yo = serpientes[0];
  const nacer = (s: Serpiente) => {
    let p = enArena();
    for (let k = 0; k < 20 && Math.hypot(p.x - yo.x, p.z - yo.z) < 16 && !s.humano; k++) p = enArena();
    if (s.humano) p = { x: 0, z: 0 };
    s.x = p.x; s.z = p.z; s.ang = r() * 6.28; s.masa = s.humano ? 10 : 8 + r() * 30 * (0.6 + c.nivel * 0.15); s.viva = true; s.mejor = Math.max(s.mejor, s.masa);
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

  // Grilla de segmentos para los choques
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
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of grilla.get(llave(x + a * CELDA, z + b * CELDA)) ?? []) if (q.s !== s && Math.hypot(q.x - x, q.z - z) < radio + q.r * 0.85) return q.s;
    return null;
  };

  // Puntería con mouse: la serpiente va hacia donde apunta el cursor visto desde el centro de la pantalla (como en
  // slither). Antes apuntaba a un punto fijo del mapa y, al pasarlo con turbo, se daba vuelta sola.
  let mouse: { x: number; z: number } | null = null, mouseHasta = 0, apretado = false;
  e.escuchar(e.lienzo, 'pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const caja = e.lienzo.getBoundingClientRect(), dx = ev.clientX - (caja.left + caja.width / 2), dy = ev.clientY - (caja.top + caja.height / 2);
    if (Math.hypot(dx, dy) > 12) { mouse = { x: dx, z: dy }; mouseHasta = e.reloj() + 3; }
  });
  e.escuchar(e.lienzo, 'pointerdown', (ev) => { if (ev.pointerType === 'mouse') apretado = true; });
  e.escuchar(window, 'pointerup', () => { apretado = false; });

  let empezado = false, terminado = false, eliminadas = 0;
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
      lineas: [['Largo máximo', String(Math.round(yo.mejor))], ['Serpientes eliminadas', String(eliminadas)], ['Resultado', vivo ? 'Sobreviviste (+300)' : `Caíste a los ${Math.round(t)} s`], ['Puesto al final', `${puesto}º de ${serpientes.length}`]],
      detalle: { largo: Math.round(yo.mejor), eliminadas, vivo, seg: Math.round(t) },
    });
  };
  const morir = (s: Serpiente, t: number, por: Serpiente | null) => {
    s.viva = false;
    s.cabeza.visible = false;
    const n = segmentos(s), k = espacio(s);
    for (let i = 0; i < n; i += 2) { const p = s.rastro[i * k]; if (p) soltar(p.x + (Math.random() - 0.5), p.z + (Math.random() - 0.5), 2 + Math.floor(s.masa / 40), i % 4 ? s.color : s.claro); }
    e.chispas(s.x, 1, s.z, [`#${s.color.getHexString()}`, '#ffffff'], 26, 6);
    if (por === yo && s !== yo) { eliminadas++; e.hud.aviso(`¡Eliminaste a ${s.nombre}! +200`, 'oro', 1.3); e.sonido.bien(); e.temblar(0.3); }
    if (s === yo) { e.temblar(0.8); e.sonido.mal(); return terminar(t, false); }
    s.vuelve = t + 3;
  };

  /** Hacia dónde va un bot: comida delante, esquivar cuerpos y el borde, y a veces cortarle el paso al jugador. */
  const pensar = (s: Serpiente, t: number) => {
    const peligro = (ang: number, d: number) => { const x = s.x + Math.sin(ang) * d, z = s.z + Math.cos(ang) * d; return Math.hypot(x, z) > RADIO - 2 || !!tocaCuerpo(s, x, z, grosor(s) + 0.4); };
    for (const d of [2, 4.5]) if (peligro(s.ang, d)) {
      const izq = [0.6, 1.2, 1.8].filter((a) => !peligro(s.ang + a, d)).length, der = [0.6, 1.2, 1.8].filter((a) => !peligro(s.ang - a, d)).length;
      s.meta = s.ang + (izq >= der ? 1.4 : -1.4); s.turbo = false; s.piensa = t + 0.25; return;
    }
    if (t < s.piensa) return;
    s.piensa = t + 0.3 + Math.random() * 0.3;
    // Atacar: si es más grande y el jugador está cerca, se le cruza por delante
    if (yo.viva && s.masa > yo.masa * 1.2 && Math.hypot(yo.x - s.x, yo.z - s.z) < 9 && Math.random() < 0.3 + c.nivel * 0.1) {
      const delante = { x: yo.x + Math.sin(yo.ang) * 4, z: yo.z + Math.cos(yo.ang) * 4 };
      s.meta = Math.atan2(delante.x - s.x, delante.z - s.z); s.turbo = s.masa > 20; return;
    }
    let mejor: Bolita | null = null, nota = 0;
    for (const b of comida) { if (!b.activa) continue; const d = Math.hypot(b.x - s.x, b.z - s.z); if (d > 14) continue; const n = b.valor / (1 + d); if (n > nota) { nota = n; mejor = b; } }
    s.meta = mejor ? Math.atan2(mejor.x - s.x, mejor.z - s.z) : s.ang + (Math.random() - 0.5);
    s.turbo = !!mejor && mejor.valor > 2 && s.masa > 25;
  };

  // Flecha suave delante de tu cabeza: muestra hacia dónde apuntas, para que nunca parezca que gira sola
  const flecha = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1, 3), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
  flecha.rotation.order = 'YXZ';
  flecha.rotation.x = Math.PI / 2;
  e.escena.add(flecha);
  const o = new THREE.Object3D(), objetivo = new THREE.Vector3();
  const camara = (dt: number, ya = false) => {
    const alto = Math.min(34, 17 + yo.masa * 0.06);
    objetivo.set(yo.x, alto, yo.z + alto * 0.42);
    e.camara.position.lerp(objetivo, ya ? 1 : 1 - Math.exp(-5 * dt));
    e.camara.lookAt(yo.x, 0, yo.z);
  };
  e.hud.tiempo(mmss(DURA));
  e.hud.puntos(0);
  camara(0, true);
  let reindexar = 0;
  e.alCuadro((t, dt) => {
    const paso = Math.min(dt, 0.05);
    if (empezado && !terminado) {
      if (t > reindexar) { indexar(); reindexar = t + 0.05; }
      for (const s of serpientes) {
        if (!s.viva) { if (!s.humano && t > s.vuelve) nacer(s); continue; }
        // Dirección
        if (s.humano && !automatico) {
          const mx = mando.x, mz = mando.z;
          if (mouse && t < mouseHasta && Math.hypot(mx, mz) < 0.3) s.meta = Math.atan2(mouse.x, mouse.z);
          else if (Math.hypot(mx, mz) > 0.3) s.meta = Math.atan2(mx, mz);
          else s.meta = s.ang;
          s.turbo = mando.pulsada || apretado;
        } else pensar(s, t);
        let dif = s.meta - s.ang;
        while (dif > Math.PI) dif -= Math.PI * 2;
        while (dif < -Math.PI) dif += Math.PI * 2;
        s.ang += Math.max(-GIRO * paso, Math.min(GIRO * paso, dif)) * (s.humano ? 1 : 0.9 + c.nivel * 0.03);
        // Turbo: más rápido, pero va soltando comida
        const corre = s.turbo && s.masa > 12;
        if (corre && t > s.gasta) { s.gasta = t + 0.18; s.masa -= 1; const cola = s.rastro[segmentos(s) * espacio(s)] ?? s.rastro[s.rastro.length - 1]; soltar(cola.x, cola.z, 1, s.claro); }
        const v = corre ? TURBO : VEL;
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
            if (b.fija) Object.assign(b, enArena(), { activa: true });
            if (s.humano && Math.random() < 0.5) e.sonido.tono(700 + Math.random() * 500, 0.05, { tipo: 'sine', vol: 0.06 });
          }
        }
        // Choques: contra el borde o el cuerpo de otra
        if (Math.hypot(s.x, s.z) > RADIO) { morir(s, t, null); if (terminado) return; continue; }
        const choca = tocaCuerpo(s, s.x, s.z, grosor(s) * 0.9);
        if (choca) { morir(s, t, choca); if (terminado) return; }
      }
      if (t >= DURA) return terminar(t, true);
      const orden = [...serpientes].filter((s) => s.viva).sort((a, b) => b.masa - a.masa);
      e.hud.tiempo(mmss(DURA - t));
      e.hud.extra(`Largo ${Math.round(yo.masa)} · ${orden.indexOf(yo) + 1}º de ${orden.length}${yo.turbo && yo.masa > 12 ? ' · ¡Turbo!' : ''}`);
      e.hud.puntos(puntaje());
    }
    // Dibujo de los cuerpos (de la cola a la cabeza, con franjas)
    let n = 0;
    for (const s of serpientes) {
      if (!s.viva) continue;
      const total = segmentos(s), k = espacio(s), gr = grosor(s);
      for (let i = total - 1; i >= 1 && n < MAX_SEG; i--) {
        const p = s.rastro[i * k] ?? s.rastro[s.rastro.length - 1], ondula = Math.sin(t * 6 - i * 0.5) * 0.06;
        const fino = 1 - (i / total) * 0.35;
        o.position.set(p.x, gr * fino, p.z); o.scale.setScalar(gr * fino * (1 + ondula)); o.updateMatrix();
        cuerpos.setMatrixAt(n, o.matrix);
        cuerpos.setColorAt(n++, Math.floor(i / 3) % 2 ? s.claro : s.color);
      }
      s.cabeza.position.set(s.x, gr * 1.05, s.z);
      s.cabeza.rotation.y = s.ang;
      s.cabeza.scale.setScalar(gr * 1.05);
      // Las pupilas miran hacia donde quiere ir
      const mira = Math.max(-0.12, Math.min(0.12, (s.meta - s.ang) * 0.2));
      s.ojos.forEach((ojo, j) => { ojo.position.x = (j ? 1 : -1) * 0.48 + mira; });
    }
    cuerpos.count = n;
    cuerpos.instanceMatrix.needsUpdate = true;
    if (cuerpos.instanceColor) cuerpos.instanceColor.needsUpdate = true;
    let m = 0;
    for (const b of comida) {
      if (!b.activa) continue;
      o.position.set(b.x, 0.3 + Math.sin(t * 3 + b.x) * 0.08, b.z); o.scale.setScalar((b.valor > 1 ? 1.6 : 1) * (1 + Math.sin(t * 5 + b.z) * 0.15)); o.updateMatrix();
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
    borde.material.color.setHSL(0.9 + Math.sin(t) * 0.05, 1, 0.65);
    camara(dt);
  });

  return { empezar() { e.empezar(); empezado = true; e.hud.aviso('¡A comer!', 'oro', 1); }, destruir: e.destruir };
}
