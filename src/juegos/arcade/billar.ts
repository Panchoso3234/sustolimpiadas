import * as THREE from 'three';
import type { Contexto, Partida } from '../marco';
import { arrastre, mat } from '../punteria/fisica';
import { crearEscenario, mmss } from '../reflejos/motor';
import { ANCHO, BOCA, DESAFIOS, FONDO, RADIO, SALIDA, TRONERAS, type Desafio } from './billarNiveles';

// Billar: seis desafíos sobre una mesa de pool, cada uno con tiros contados: embocarlas todas, en orden, entre postes,
// la negra al final, el triángulo completo y bolas de oro. Arrastras hacia atrás desde la bola blanca (como una honda)
// y sueltas; con el teclado, ← → apuntan y Espacio carga. Varias bolas en un tiro dan bono; la blanca adentro resta.

const DURA = 300, FUERZA = 13, ROCE = 0.55, FRENO = 0.9, BANDA = 0.78, CHOQUE = 0.96;
interface Bola { x: number; z: number; vx: number; vz: number; n: number; dorada: boolean; negra: boolean; blanca: boolean; dentro: boolean; malla: THREE.Mesh; cae: number }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: ANCHO + 2.2, alto: (FONDO + 2) * Math.sin(1.2) + 1.6, centro: [0, 0, 0.2], inclinacion: 1.2, sinPlaya: true });
  e.escena.background = new THREE.Color('#1c2236');

  // ── La mesa: paño, bandas de madera, troneras y una lámpara ──
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!; g.fillStyle = '#1f8a4c'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 3); tex.colorSpace = THREE.SRGBColorSpace;
  const pano = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, FONDO), new THREE.MeshLambertMaterial({ map: tex }));
  pano.rotation.x = -Math.PI / 2;
  e.escena.add(pano);
  const madera = mat('#6b3a1f');
  for (const [w, d, x, z] of [[ANCHO + 1.4, 0.7, 0, -FONDO / 2 - 0.35], [ANCHO + 1.4, 0.7, 0, FONDO / 2 + 0.35], [0.7, FONDO, -ANCHO / 2 - 0.35, 0], [0.7, FONDO, ANCHO / 2 + 0.35, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), madera); b.position.set(x, 0.17, z); e.escena.add(b);
  }
  for (let i = 1; i < 8; i++) for (const lado of [-1, 1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), new THREE.MeshBasicMaterial({ color: '#f4e6c8' })); d.rotation.x = -Math.PI / 2; d.position.set(-ANCHO / 2 + (i * ANCHO) / 8, 0.36, lado * (FONDO / 2 + 0.35)); if (i !== 4) e.escena.add(d); }
  for (const [x, z] of TRONERAS) { const t = new THREE.Mesh(new THREE.CircleGeometry(BOCA + 0.06, 20), new THREE.MeshBasicMaterial({ color: '#0a0a0e' })); t.rotation.x = -Math.PI / 2; t.position.set(x, 0.37, z); e.escena.add(t); }
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat('#3a2a2a')); piso.rotation.x = -Math.PI / 2; piso.position.y = -2; e.escena.add(piso);

  // ── Bolas, con su número pintado ──
  const COLORES = ['#f2c12e', '#2a5bd7', '#d93a2f', '#7a3fb0', '#f0812a', '#2e9a4f', '#8a2a2a', '#1a1a1a', '#f2c12e', '#2a5bd7'];
  const textura = (color: string, n: number, dorada: boolean) => {
    const c2 = document.createElement('canvas'); c2.width = 128; c2.height = 64;
    const x = c2.getContext('2d')!;
    x.fillStyle = dorada ? '#ffcf3a' : color; x.fillRect(0, 0, 128, 64);
    for (const cx of [32, 96]) { x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx, 32, 13, 0, Math.PI * 2); x.fill(); x.fillStyle = '#1a1a1a'; x.font = 'bold 18px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(dorada ? '★' : String(n), cx, 33); }
    const t = new THREE.CanvasTexture(x.canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const geo = new THREE.SphereGeometry(RADIO, 20, 14);
  let bolas: Bola[] = [], postes: { x: number; z: number; r: number; malla: THREE.Mesh }[] = [], desafio: Desafio = DESAFIOS[0], nivel = -1, tiros = 0, siguiente = 1;
  const nueva = (x: number, z: number, n: number, color: string, extra: Partial<Bola> = {}): Bola => {
    const malla = new THREE.Mesh(geo, extra.blanca ? new THREE.MeshStandardMaterial({ color: '#fbfaf2', roughness: 0.3 }) : new THREE.MeshStandardMaterial({ map: textura(color, n, !!extra.dorada), roughness: 0.3, metalness: extra.dorada ? 0.5 : 0, emissive: extra.dorada ? '#a86a00' : '#000000', emissiveIntensity: 0.3 }));
    malla.position.set(x, 0.37 + RADIO, z);
    malla.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    e.escena.add(malla);
    return { x, z, vx: 0, vz: 0, n, dorada: false, negra: false, blanca: false, dentro: false, malla, cae: 0, ...extra };
  };
  const armar = (i: number) => {
    for (const b of bolas) e.escena.remove(b.malla);
    for (const p of postes) e.escena.remove(p.malla);
    nivel = i; desafio = DESAFIOS[i]; tiros = desafio.tiros; siguiente = 1;
    bolas = [nueva(SALIDA[0], SALIDA[1], 0, '#ffffff', { blanca: true }), ...desafio.bolas.map((b) => nueva(b.x, b.z, b.n, b.negra ? '#1a1a1a' : COLORES[(b.n - 1) % COLORES.length], { dorada: !!b.dorada, negra: !!b.negra }))];
    postes = (desafio.postes ?? []).map(([x, z, r]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 16), mat('#c9a227')); m.position.set(x, 0.57, z); e.escena.add(m); return { x, z, r, malla: m }; });
    e.hud.aviso(`Desafío ${i + 1}: ${desafio.nombre}`, 'oro', 1.6);
  };
  const blanca = () => bolas[0];

  // ── Taco y guía ──
  const taco = new THREE.Group(), vara = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 4.2, 10), mat('#d9a35a')), punta = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.1, 10), mat('#3a6ad9'));
  vara.rotation.x = Math.PI / 2; vara.position.z = -2.1; punta.rotation.x = Math.PI / 2; punta.position.z = 0.02;
  taco.add(vara, punta); taco.position.y = 0.37 + RADIO + 0.05; e.escena.add(taco);
  const puntos = Array.from({ length: 26 }, () => { const p = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })); p.rotation.x = -Math.PI / 2; e.escena.add(p); return p; });
  const fantasma = new THREE.Mesh(new THREE.RingGeometry(RADIO - 0.03, RADIO, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  fantasma.rotation.x = -Math.PI / 2; e.escena.add(fantasma);

  // ── Estado ──
  let puntaje = 0, rodando = false, apunta = 0, carga = 0, cargando = false, empezado = false, terminado = false, caidasTiro = 0, falta = false, pasar = 0;
  const quietas = () => bolas.every((b) => b.dentro || Math.hypot(b.vx, b.vz) < 0.03);
  const puede = () => empezado && !terminado && !rodando && pasar === 0;
  const tirar = (fuerza: number, ang: number) => {
    if (!puede() || fuerza < 0.05) return;
    const v = FUERZA * (0.15 + fuerza * 0.85);
    blanca().vx = Math.sin(ang) * v; blanca().vz = Math.cos(ang) * v;
    rodando = true; tiros--; caidasTiro = 0; falta = false;
    e.sonido.tono(300 + fuerza * 300, 0.06, { tipo: 'triangle', vol: 0.25 });
  };
  const tiro = arrastre(e, puede, (t) => tirar(t.fuerza, Math.atan2(-t.dx, -t.dy)));
  const teclas = new Set<string>();
  e.escuchar(window, 'keydown', (ev) => { teclas.add(ev.key); if (ev.key === ' ') { ev.preventDefault(); if (puede() && !cargando) { cargando = true; carga = 0; } } });
  e.escuchar(window, 'keyup', (ev) => { teclas.delete(ev.key); if (ev.key === ' ' && cargando) { cargando = false; tirar(carga, apunta); carga = 0; } });

  const terminar = (t: number) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    c.alTerminar({ puntaje, lineas: [['Desafíos superados', `${nivel + (bolas.slice(1).every((b) => b.dentro) ? 1 : 0)} de ${DESAFIOS.length}`], ['Tiempo', mmss(t)]], detalle: { nivel: nivel + 1 } });
  };
  /** Cuando todo se detiene: se cuentan las bolas del tiro y se ve si el desafío se ganó o se acabaron los tiros. */
  const alDetenerse = (t: number) => {
    rodando = false;
    if (caidasTiro > 1) { const bono = (caidasTiro - 1) * 50; puntaje += bono; e.hud.aviso(`¡${caidasTiro} de un tiro! +${bono}`, 'oro', 1.1); }
    if (blanca().dentro) {
      puntaje = Math.max(0, puntaje - 50); e.hud.aviso('¡La blanca adentro! −50', 'mal', 1.1);
      Object.assign(blanca(), { x: SALIDA[0], z: SALIDA[1], vx: 0, vz: 0, dentro: false, cae: 0 }); blanca().malla.visible = true; blanca().malla.scale.setScalar(1);
    }
    const quedan = bolas.slice(1).filter((b) => !b.dentro);
    if (falta && desafio.regla === 'negra') { e.hud.aviso('¡La negra antes de tiempo!', 'mal', 1.4); e.sonido.mal(); pasar = t + 1.6; return; }
    if (!quedan.length) {
      const bono = 200 + tiros * 80;
      puntaje += bono;
      e.chispas(0, 1, 0, ['#ffd23c', '#ffffff', '#3fe07a', '#ef5565'], 60, 7); e.sonido.efecto('campana', 0.6);
      e.hud.aviso(`¡Desafío superado! +${bono}`, 'oro', 1.5);
      pasar = t + 1.8;
      return;
    }
    if (tiros <= 0) { e.hud.aviso('Se acabaron los tiros', 'mal', 1.3); pasar = t + 1.6; }
  };

  const embocar = (b: Bola) => {
    b.dentro = true; b.cae = 0.001; b.vx = b.vz = 0;
    if (b.blanca) { e.sonido.mal(); return; }
    caidasTiro++;
    // En orden: la que no toca vuelve a la mesa (en su lugar de salida) y no suma
    if (desafio.regla === 'orden' && b.n !== siguiente) {
      const origen = desafio.bolas.find((x) => x.n === b.n)!;
      setTimeout(() => { Object.assign(b, { x: origen.x, z: origen.z, dentro: false, cae: 0 }); b.malla.visible = true; b.malla.scale.setScalar(1); }, 700);
      caidasTiro--; e.hud.aviso(`Primero la ${siguiente}`, 'mal', 1); e.sonido.mal(); return;
    }
    if (desafio.regla === 'orden') siguiente++;
    if (b.negra && bolas.some((x) => !x.blanca && !x.negra && !x.dentro)) falta = true;
    const valor = b.dorada ? 300 : 100;
    puntaje += valor;
    e.flotante(`+${valor}`, b.x, 1, b.z, 'oro'); e.chispas(b.x, 0.5, b.z, b.dorada ? ['#ffd23c', '#ffffff'] : ['#ffffff', '#3fe07a'], 14, 3);
    e.sonido.tono(520, 0.12, { tipo: 'sine', vol: 0.18, hasta: 260 });
  };

  /** Física de la mesa: roce, bandas (menos en la boca de las troneras), choques entre bolas y con los postes. */
  const fisica = (dt: number) => {
    for (const b of bolas) {
      if (b.dentro) continue;
      const v = Math.hypot(b.vx, b.vz);
      if (v > 0) { const nv = Math.max(0, v - (ROCE + v * FRENO * 0.12) * dt); b.vx *= nv / v; b.vz *= nv / v; }
      b.x += b.vx * dt; b.z += b.vz * dt;
      const boca = TRONERAS.find(([tx, tz]) => Math.hypot(b.x - tx, b.z - tz) < BOCA + RADIO * 0.6);
      if (boca) { if (Math.hypot(b.x - boca[0], b.z - boca[1]) < BOCA) embocar(b); continue; }
      const mx = ANCHO / 2 - RADIO, mz = FONDO / 2 - RADIO;
      if (Math.abs(b.x) > mx) { b.x = Math.sign(b.x) * mx; b.vx *= -BANDA; if (Math.abs(b.vx) > 1) e.sonido.tono(200, 0.04, { tipo: 'triangle', vol: 0.06 }); }
      if (Math.abs(b.z) > mz) { b.z = Math.sign(b.z) * mz; b.vz *= -BANDA; if (Math.abs(b.vz) > 1) e.sonido.tono(200, 0.04, { tipo: 'triangle', vol: 0.06 }); }
      for (const p of postes) {
        const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz), junto = p.r + RADIO;
        if (d >= junto || d === 0) continue;
        const nx = dx / d, nz = dz / d, hacia = b.vx * nx + b.vz * nz;
        b.x = p.x + nx * junto; b.z = p.z + nz * junto;
        if (hacia < 0) { b.vx -= 1.8 * hacia * nx; b.vz -= 1.8 * hacia * nz; }
      }
    }
    for (let i = 0; i < bolas.length; i++) for (let k = i + 1; k < bolas.length; k++) {
      const a = bolas[i], b = bolas[k];
      if (a.dentro || b.dentro) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), junto = RADIO * 2;
      if (d >= junto || d === 0) continue;
      const nx = dx / d, nz = dz / d, sobra = (junto - d) / 2;
      a.x -= nx * sobra; a.z -= nz * sobra; b.x += nx * sobra; b.z += nz * sobra;
      const acerca = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (acerca <= 0) continue;
      const j = ((1 + CHOQUE) / 2) * acerca;
      a.vx -= j * nx; a.vz -= j * nz; b.vx += j * nx; b.vz += j * nz;
      e.sonido.tono(1400, 0.03, { tipo: 'sine', vol: Math.min(0.25, acerca / 25) });
    }
  };

  /** La línea de la guía: hasta la primera bola o banda que encuentra el tiro. */
  const guia = (ang: number) => {
    const dx = Math.sin(ang), dz = Math.cos(ang), b = blanca();
    let d = 0, choca = false;
    for (; d < 9 && !choca; d += 0.05) {
      const x = b.x + dx * d, z = b.z + dz * d;
      if (Math.abs(x) > ANCHO / 2 - RADIO || Math.abs(z) > FONDO / 2 - RADIO) choca = true;
      for (const o of bolas) if (o !== b && !o.dentro && Math.hypot(o.x - x, o.z - z) < RADIO * 2) choca = true;
      for (const p of postes) if (Math.hypot(p.x - x, p.z - z) < p.r + RADIO) choca = true;
    }
    puntos.forEach((p, i) => { const f = (i + 1) / puntos.length * d; p.visible = f < d - 0.1; p.position.set(b.x + dx * f, 0.38, b.z + dz * f); });
    fantasma.visible = true; fantasma.position.set(b.x + dx * d, 0.38, b.z + dz * d);
  };

  armar(0);
  e.hud.tiempo(mmss(DURA)); e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    const paso = Math.min(dt, 0.05);
    // Bolas que caen: se achican en la tronera
    for (const b of bolas) if (b.cae > 0) { b.cae += paso; b.malla.scale.setScalar(Math.max(0.01, 1 - b.cae * 3)); if (b.cae > 0.35) { b.malla.visible = false; b.cae = -1; } }
    if (!empezado || terminado) return;
    if (pasar && t >= pasar) {
      pasar = 0;
      const gano = bolas.slice(1).every((b) => b.dentro);
      if (nivel >= DESAFIOS.length - 1 && (gano || tiros <= 0 || falta)) return terminar(t);
      armar(gano || tiros <= 0 || falta ? nivel + 1 : nivel);
    }
    if (rodando) {
      for (let s = 0; s < 4; s++) fisica(paso / 4);
      if (quietas()) { for (const b of bolas) b.vx = b.vz = 0; alDetenerse(t); }
    }
    // Las bolas ruedan de verdad: giran según lo que avanzan
    for (const b of bolas) {
      if (b.dentro && b.cae <= 0) continue;
      const v = Math.hypot(b.vx, b.vz);
      if (v > 0.001) b.malla.rotateOnWorldAxis(new THREE.Vector3(b.vz / v, 0, -b.vx / v), (v * paso) / RADIO);
      b.malla.position.set(b.x, 0.37 + RADIO, b.z);
    }
    // Apuntar: arrastrando (como honda) o con ← → y Espacio
    const listo = puede();
    if (teclas.has('ArrowLeft') || teclas.has('a')) apunta += paso * 1.6;
    if (teclas.has('ArrowRight') || teclas.has('d')) apunta -= paso * 1.6;
    if (cargando) carga = Math.min(1, carga + paso / 1.2);
    if (tiro.tirando && tiro.fuerza > 0.03) apunta = Math.atan2(-tiro.dx, -tiro.dy);
    const fuerza = tiro.tirando ? tiro.fuerza : carga;
    taco.visible = listo;
    for (const p of puntos) p.visible = false;
    fantasma.visible = false;
    if (listo) {
      const b = blanca();
      taco.position.set(b.x - Math.sin(apunta) * (RADIO + 0.05 + fuerza * 0.8), taco.position.y, b.z - Math.cos(apunta) * (RADIO + 0.05 + fuerza * 0.8));
      taco.rotation.y = apunta;
      guia(apunta);
    }
    if (t >= DURA) return terminar(t);
    e.hud.tiempo(mmss(DURA - t));
    const regla = desafio.regla === 'orden' ? ` · sigue la ${siguiente}` : desafio.regla === 'negra' ? ' · la negra al final' : '';
    e.hud.extra(`Desafío ${nivel + 1}/${DESAFIOS.length} · ${tiros} tiros${regla}${fuerza > 0.02 ? ` · fuerza ${Math.round(fuerza * 100)} %` : ''}`);
    e.hud.puntos(puntaje);
  });

  return { empezar() { e.empezar(); empezado = true; }, destruir: e.destruir };
}
