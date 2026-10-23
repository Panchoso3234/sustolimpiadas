import * as THREE from 'three';
import { mat } from '../punteria/fisica';
import type { Escenario } from '../reflejos/motor';
import type { EstadoAlterado, Tipo } from './bestiasDatos';

// Efectos de Bestiario: partículas que brillan, un ataque distinto para cada tipo (llamas, chorros, hojas, rayos,
// cristales, rocas, grietas, remolinos, ondas, haces…), lo que se ve sobre una criatura con un problema de estado y los
// cinco escenarios de la torre (pradera, playa, bosque, cueva y la cima entre las nubes).

type Animar = (dur: number, f?: (k: number) => void) => Promise<void>;
const lienzo = (tam: number, pintar: (g: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = c.height = tam; pintar(c.getContext('2d')!); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const PUNTO = lienzo(64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const HOJA = lienzo(64, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(32, 32, 28, 12, 0.6, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(10, 46); g.lineTo(54, 18); g.stroke(); });
const ZETA = lienzo(64, (g) => { g.fillStyle = '#fff'; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', 32, 34); });
const ESTRELLA = lienzo(64, (g) => { g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 12 : 28; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.fill(); });
const BURBUJA = lienzo(64, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(255,255,255,.35)'; g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(24, 22, 6, 0, Math.PI * 2); g.fill(); });

export const COLOR_TIPO: Record<Tipo, [string, string]> = {
  normal: ['#ffffff', '#d8d4c0'], fuego: ['#ff7a1a', '#ffd23c'], agua: ['#4a9aff', '#bfe6ff'], planta: ['#5ac83a', '#c8f08a'], electrico: ['#ffe23c', '#ffffff'],
  hielo: ['#9ae8ff', '#ffffff'], lucha: ['#ff5a3a', '#ffd0a0'], veneno: ['#b04ad8', '#e8a0ff'], tierra: ['#c89a50', '#8a6a3a'], volador: ['#d8e8ff', '#ffffff'],
  psiquico: ['#ff5aa8', '#ffc0e8'], bicho: ['#a6d01a', '#e8ff8a'], roca: ['#a8925a', '#d8c8a0'], fantasma: ['#7a4ab8', '#2a1a3a'], dragon: ['#7a4aff', '#c8a0ff'],
};

export function crearEfectos(e: Escenario, animar: Animar) {
  // ── Partículas: un montón de sprites reutilizables que brillan (mezcla aditiva) ──
  interface Particula { s: THREE.Sprite; v: THREE.Vector3; vida: number; total: number; tam: number; crece: number; gravedad: number; gira: number; base: number }
  const vivas: Particula[] = [], libres: THREE.Sprite[] = [], mats = new Map<string, THREE.SpriteMaterial>();
  const material = (color: string, tex: THREE.Texture, suma: boolean) => {
    const k = `${color}${tex.id}${suma}`;
    let m = mats.get(k);
    if (!m) { m = new THREE.SpriteMaterial({ map: tex, color: suma ? new THREE.Color(color).multiplyScalar(2.2) : color, transparent: true, depthWrite: false, blending: suma ? THREE.AdditiveBlending : THREE.NormalBlending }); mats.set(k, m); }
    return m;
  };
  const emitir = (p: THREE.Vector3, v: THREE.Vector3, color: string, tam: number, vida: number, o: { tex?: THREE.Texture; suma?: boolean; crece?: number; gravedad?: number; gira?: number } = {}) => {
    if (vivas.length > 520) return;
    const s = libres.pop() ?? new THREE.Sprite();
    s.material = material(color, o.tex ?? PUNTO, o.suma ?? true);
    s.position.copy(p); s.scale.setScalar(tam); s.material.rotation = 0; s.visible = true;
    if (!s.parent) e.escena.add(s);
    vivas.push({ s, v: v.clone(), vida, total: vida, tam, crece: o.crece ?? 0, gravedad: o.gravedad ?? 0, gira: o.gira ?? 0, base: Math.random() * 6 });
  };
  const azar = (a: number) => (Math.random() - 0.5) * a;
  const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // Ondas de choque, mallas que caen o se clavan y haces: cada una con su propia actualización
  const tareas: ((dt: number) => boolean)[] = [];
  /** Hace algo después de unos segundos del reloj del juego. */
  const despues = (seg: number, f: () => void) => { let t = 0; tareas.push((dt) => { t += dt; if (t < seg) return true; f(); return false; }); };
  const onda = (p: THREE.Vector3, color: string, tam = 1.6, dur = 0.45, vertical = false) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(p); if (!vertical) m.rotation.x = -Math.PI / 2; else m.lookAt(e.camara.position);
    e.escena.add(m);
    let t = 0;
    tareas.push((dt) => { t += dt; const k = t / dur; m.scale.setScalar(0.1 + k * tam); (m.material as THREE.MeshBasicMaterial).opacity = 1 - k; if (k >= 1) { m.removeFromParent(); m.geometry.dispose(); return false; } return true; });
  };
  const estallido = (p: THREE.Vector3, colores: string[], n = 22, fuerza = 2.6, tam = 0.28, tex?: THREE.Texture) => { for (let i = 0; i < n; i++) { const d = v3(azar(2), Math.random() * 1.4, azar(2)).normalize().multiplyScalar(fuerza * (0.4 + Math.random() * 0.6)); emitir(p, d, colores[i % colores.length], tam * (0.6 + Math.random() * 0.8), 0.45 + Math.random() * 0.35, { gravedad: -4, tex }); } };

  /** El golpe al llegar: onda en el piso, estallido del color del tipo y destello. */
  const impacto = (tipo: Tipo, b: THREE.Vector3, fuerte = false) => {
    const [c1, c2] = COLOR_TIPO[tipo];
    onda(v3(b.x, 0.08, b.z), c1, fuerte ? 2.6 : 1.8);
    onda(v3(b.x, b.y, b.z), c2, fuerte ? 1.6 : 1.1, 0.3, true);
    estallido(b, [c1, c2, '#ffffff'], fuerte ? 34 : 22, fuerte ? 3.6 : 2.6, 0.3, tipo === 'lucha' || tipo === 'normal' ? ESTRELLA : undefined);
  };

  /** Lo que lanza un ataque especial de cada tipo, de `a` hacia `b`. Termina cuando llega. */
  const especial = async (tipo: Tipo, a: THREE.Vector3, b: THREE.Vector3) => {
    const [c1, c2] = COLOR_TIPO[tipo], dir = b.clone().sub(a), largo = dir.length(), u = dir.clone().normalize();
    const curva = (k: number, alto = 0.6) => a.clone().lerp(b, k).add(v3(0, Math.sin(k * Math.PI) * alto, 0));
    switch (tipo) {
      case 'fuego': // un chorro de llamas que se agranda
        await animar(0.75, (k) => { for (let i = 0; i < 4; i++) { const v = u.clone().multiplyScalar(largo * 1.6).add(v3(azar(1.2), azar(0.8) + 0.3, azar(1.2))); emitir(a, v, i % 2 ? c1 : c2, 0.18, 0.55, { crece: 1.6 }); } if (k > 0.5) emitir(b, v3(azar(1), 1.2, azar(1)), c1, 0.3, 0.4, { crece: 1 }); });
        break;
      case 'agua': // chorro en arco, con gotas que caen
        await animar(0.7, (k) => { for (let i = 0; i < 3; i++) { const v = u.clone().multiplyScalar(largo * 1.55).add(v3(azar(0.4), 2.6 + azar(0.4), azar(0.4))); emitir(a, v, i % 2 ? c1 : c2, 0.16, 0.65, { gravedad: -8 }); } if (k > 0.55) emitir(b, v3(azar(2), 2.5, azar(2)), c2, 0.12, 0.5, { gravedad: -9 }); });
        onda(v3(b.x, 0.08, b.z), c1, 2.2);
        break;
      case 'planta': // hojas que giran en espiral hacia el rival
        for (let i = 0; i < 14; i++) despues(i * 0.035, () => emitir(a.clone().add(v3(azar(0.4), azar(0.4), azar(0.4))), u.clone().multiplyScalar(largo * 1.5).add(v3(azar(1.4), 0.6 + azar(0.6), azar(1.4))), i % 2 ? c1 : '#3a9a2a', 0.26, 0.7, { tex: HOJA, suma: false, gira: 9 }));
        await animar(0.7);
        break;
      case 'electrico': { // un rayo que cae del cielo sobre el rival
        const puntos: THREE.Vector3[] = [], arriba = v3(b.x + azar(0.6), 6, b.z + azar(0.6));
        for (let i = 0; i <= 14; i++) puntos.push(arriba.clone().lerp(b, i / 14).add(i && i < 14 ? v3(azar(0.7), 0, azar(0.7)) : v3()));
        await animar(0.32, () => { for (let i = 0; i < 14; i++) for (let k = 0; k < 3; k++) emitir(puntos[i].clone().lerp(puntos[i + 1], k / 3), v3(), Math.random() < 0.5 ? c1 : c2, 0.3, 0.12); });
        destello('#fffbe0', 0.25);
        break;
      }
      case 'hielo': { // cristales que vuelan y se clavan
        const cristales: THREE.Mesh[] = [];
        for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), new THREE.MeshBasicMaterial({ color: i % 2 ? c1 : c2, transparent: true, opacity: 0.9 })); m.position.copy(a); e.escena.add(m); cristales.push(m); }
        await animar(0.5, (k) => cristales.forEach((m, i) => { const ki = Math.min(1, k * 1.3 - i * 0.05); m.position.copy(curva(Math.max(0, ki), 0.3)).add(v3(Math.sin(i * 2.1) * 0.25 * (1 - ki), Math.cos(i * 1.7) * 0.2 * (1 - ki), 0)); m.lookAt(b); m.rotateX(Math.PI / 2); }));
        for (const m of cristales) { m.removeFromParent(); m.geometry.dispose(); }
        estallido(b, [c1, c2], 26, 2.4, 0.2);
        break;
      }
      case 'roca': case 'tierra': await caerRocas(tipo, b); break;
      case 'volador': // un remolino alrededor del rival
        await animar(0.8, (k) => { for (let i = 0; i < 3; i++) { const ang = k * 30 + i * 2.1, r = 0.6 - k * 0.2; emitir(v3(b.x + Math.cos(ang) * r, 0.1 + k * 1.6 + i * 0.1, b.z + Math.sin(ang) * r), v3(-Math.sin(ang) * 2, 1, Math.cos(ang) * 2), i % 2 ? c1 : c2, 0.18, 0.35); } });
        break;
      case 'psiquico': { // ondas de color que viajan hacia el rival
        for (let i = 0; i < 5; i++) despues(i * 0.09, () => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? c1 : c2).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.copy(a); m.lookAt(b); e.escena.add(m); let t = 0; tareas.push((dt) => { t += dt; const k = t / 0.55; m.position.copy(a.clone().lerp(b, Math.min(1, k))); m.scale.setScalar(1 + k * 2); (m.material as THREE.MeshBasicMaterial).opacity = 1 - k * 0.8; if (k >= 1) { m.removeFromParent(); m.geometry.dispose(); return false; } return true; }); });
        await animar(0.9);
        break;
      }
      case 'fantasma': { // una esfera oscura que avanza ondulando y deja una estela
        const orbe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: '#2a1440' })); e.escena.add(orbe);
        await animar(0.7, (k) => { orbe.position.copy(curva(k, 0.4)).add(v3(0, Math.sin(k * 18) * 0.12, 0)); emitir(orbe.position, v3(azar(0.4), azar(0.4), azar(0.4)), c1, 0.34, 0.45, { crece: 0.6 }); });
        orbe.removeFromParent(); orbe.geometry.dispose();
        estallido(b, [c1, '#ffffff'], 20, 2.2, 0.32);
        break;
      }
      case 'dragon': { // un haz que sale de la boca
        const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1, 14, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(c1).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        e.escena.add(haz);
        await animar(0.6, (k) => { const l = largo * Math.min(1, k * 2.2); haz.position.copy(a).add(u.clone().multiplyScalar(l / 2)); haz.scale.set(1 + Math.sin(k * 40) * 0.25, l, 1 + Math.sin(k * 40) * 0.25); haz.quaternion.setFromUnitVectors(v3(0, 1, 0), u); emitir(a.clone().add(u.clone().multiplyScalar(l * Math.random())), v3(azar(0.8), azar(0.8), azar(0.8)), c2, 0.2, 0.3); });
        haz.removeFromParent(); haz.geometry.dispose();
        break;
      }
      case 'veneno': // burbujas de lodo en arco
        await animar(0.65, () => { for (let i = 0; i < 2; i++) emitir(a, u.clone().multiplyScalar(largo * 1.5).add(v3(azar(0.8), 2.4 + azar(0.6), azar(0.8))), i % 2 ? c1 : c2, 0.22, 0.7, { tex: BURBUJA, suma: false, gravedad: -7 }); });
        estallido(b, [c1, c2], 18, 2, 0.25, BURBUJA);
        break;
      case 'bicho': // un enjambre que zumba hacia el rival
        await animar(0.7, (k) => { for (let i = 0; i < 4; i++) emitir(curva(k, 0.3).add(v3(azar(0.7), azar(0.7), azar(0.7))), v3(azar(3), azar(3), azar(3)), i % 2 ? c1 : c2, 0.1, 0.25); });
        break;
      default: { // normal y lucha: una esfera de energía
        const bola = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color: c1 })); e.escena.add(bola);
        await animar(0.42, (k) => { bola.position.copy(curva(k)); emitir(bola.position, v3(), c2, 0.3, 0.25); });
        bola.removeFromParent(); bola.geometry.dispose();
      }
    }
    impacto(tipo, b);
  };
  /** Rocas que caen sobre el rival (roca) o el suelo que se agrieta bajo él (tierra). */
  const caerRocas = async (tipo: Tipo, b: THREE.Vector3) => {
    const [c1, c2] = COLOR_TIPO[tipo];
    if (tipo === 'tierra') {
      const grietas: THREE.Mesh[] = [];
      for (let i = 0; i < 7; i++) { const g = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.1), new THREE.MeshBasicMaterial({ color: '#2a1a10' })); const ang = (i / 7) * Math.PI * 2; g.position.set(b.x, 0.03, b.z); g.rotation.y = ang; e.escena.add(g); grietas.push(g); }
      e.temblar(0.6);
      await animar(0.6, (k) => { grietas.forEach((g, i) => { const ang = (i / 7) * Math.PI * 2; g.scale.z = 1 + k * 14; g.position.set(b.x + Math.sin(ang) * k * 0.7, 0.03, b.z + Math.cos(ang) * k * 0.7); }); if (Math.random() < 0.6) emitir(v3(b.x + azar(1.4), 0.1, b.z + azar(1)), v3(azar(1), 1.5 + Math.random(), azar(1)), Math.random() < 0.5 ? c1 : c2, 0.35, 0.6, { suma: false, crece: 1.2, gravedad: -2 }); });
      despues(0.7, () => { for (const g of grietas) { g.removeFromParent(); g.geometry.dispose(); } });
      return;
    }
    const rocas: { m: THREE.Mesh; vy: number; listo: boolean }[] = [];
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.1), mat(i % 2 ? '#8a7a5a' : '#a8925a')); m.position.set(b.x + azar(1), 3 + i * 0.5, b.z + azar(0.8)); e.escena.add(m); rocas.push({ m, vy: 0, listo: false }); }
    await animar(0.9, () => {
      for (const r of rocas) {
        if (r.listo) continue;
        r.vy -= 0.025; r.m.position.y += r.vy; r.m.rotation.x += 0.2; r.m.rotation.z += 0.15;
        if (r.m.position.y <= 0.1) { r.listo = true; r.m.position.y = 0.1; e.temblar(0.18); estallido(r.m.position, [c1, c2], 6, 1.4, 0.18); }
      }
    });
    despues(0.5, () => { for (const r of rocas) { r.m.removeFromParent(); r.m.geometry.dispose(); } });
  };

  // ── Destello de pantalla (rayos y golpes críticos) ──
  const capa = document.createElement('div');
  capa.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .25s;z-index:1';
  e.lienzo.parentElement?.appendChild(capa);
  let calma = false;
  const destello = (color: string, fuerza = 0.5) => {
    if (calma) return; capa.style.transition = 'none'; capa.style.background = color; capa.style.opacity = String(fuerza); requestAnimationFrame(() => { capa.style.transition = 'opacity .35s'; capa.style.opacity = '0'; }); };

  // ── Estados sobre la criatura (se llama en cada cuadro con su posición y alto) ──
  const hielos: (THREE.Mesh | null)[] = [null, null], estrellas: THREE.Sprite[][] = [[], []], acumulado = [0, 0];
  const estados = (lugar: number, estado: EstadoAlterado | null, confuso: boolean, centro: THREE.Vector3 | null, medida: THREE.Vector3 | null, giro: number, dt: number) => {
    const alto = medida?.y ?? 1;
    acumulado[lugar] += dt;
    const tic = (cada: number) => { if (acumulado[lugar] < cada) return false; acumulado[lugar] = 0; return true; };
    // Congelado: una capa de hielo encima
    if (estado === 'congelado' && centro) {
      if (!hielos[lugar]) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#bff0ff', transparent: true, opacity: 0.35, depthWrite: false })); e.escena.add(m); hielos[lugar] = m; }
      hielos[lugar]!.position.set(centro.x, alto * 0.5, centro.z); hielos[lugar]!.scale.set((medida?.x ?? 1) * 0.6, alto * 0.6, (medida?.z ?? 1) * 0.6); hielos[lugar]!.rotation.y = giro;
    } else if (hielos[lugar]) { hielos[lugar]!.removeFromParent(); hielos[lugar] = null; }
    // Confundido: estrellitas que giran sobre la cabeza
    if (confuso && centro) {
      while (estrellas[lugar].length < 3) { const s = new THREE.Sprite(material('#ffe36b', ESTRELLA, false)); s.scale.setScalar(0.18); e.escena.add(s); estrellas[lugar].push(s); }
      estrellas[lugar].forEach((s, i) => { const a = performance.now() / 300 + (i / 3) * Math.PI * 2; s.position.set(centro.x + Math.cos(a) * 0.32, alto + 0.15, centro.z + Math.sin(a) * 0.32); });
    } else { for (const s of estrellas[lugar]) s.removeFromParent(); estrellas[lugar] = []; }
    if (!centro || !estado) return;
    const arriba = v3(centro.x + azar(alto * 0.5), alto * (0.4 + Math.random() * 0.5), centro.z + azar(alto * 0.4));
    if (estado === 'quemado' && tic(0.12)) emitir(arriba, v3(azar(0.2), 0.9, azar(0.2)), Math.random() < 0.5 ? '#ff7a1a' : '#ffd23c', 0.16, 0.5, { crece: -0.6 });
    if (estado === 'dormido' && tic(0.9)) emitir(v3(centro.x + 0.2, alto * 0.95, centro.z), v3(0.25, 0.45, 0), '#d8e8ff', 0.22, 1.6, { tex: ZETA, suma: false, crece: 0.5 });
    if (estado === 'paralizado' && tic(0.3)) for (let i = 0; i < 4; i++) emitir(arriba, v3(azar(3), azar(3), azar(3)), '#ffe23c', 0.12, 0.18);
    if ((estado === 'envenenado' || estado === 'toxico') && tic(0.35)) emitir(arriba, v3(azar(0.2), 0.6, azar(0.2)), estado === 'toxico' ? '#8a2ab0' : '#c060e8', 0.14, 0.8, { tex: BURBUJA, suma: false });
  };
  /** Escudo de Protección: una burbuja que aparece y se desvanece. */
  const escudo = (centro: THREE.Vector3, radio: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#8ad8ff').multiplyScalar(1.6), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(centro); e.escena.add(m);
    let t = 0;
    tareas.push((dt) => { t += dt; const k = t / 1.1; m.scale.setScalar(radio * (0.6 + Math.min(1, k * 4) * 0.4)); (m.material as THREE.MeshBasicMaterial).opacity = 0.35 * (k < 0.7 ? 1 : (1 - k) / 0.3); if (k >= 1) { m.removeFromParent(); m.geometry.dispose(); return false; } return true; });
    onda(centro, '#bff0ff', radio * 1.6, 0.5, true);
  };
  /** Aura que sube (rojo) o baja (azul) al cambiar una estadística. */
  const aura = (centro: THREE.Vector3, sube: boolean) => { onda(v3(centro.x, 0.08, centro.z), sube ? '#ff8a3a' : '#5a8aff', 1.6, 0.6); for (let i = 0; i < 16; i++) emitir(v3(centro.x + azar(0.9), sube ? 0.1 : 1.4, centro.z + azar(0.6)), v3(0, sube ? 1.8 : -1.6, 0), sube ? '#ff8a3a' : '#5a8aff', 0.16, 0.6); };

  // ── Ambiente de cada escenario (polen, hojas, chispas de cristal, viento) ──
  let ambiente: { color: string; tex?: THREE.Texture; v: THREE.Vector3; cada: number; suma: boolean } | null = null, ambienteT = 0;

  /** Cada cuadro: mueve las partículas, las ondas y el ambiente. */
  const actualizar = (dt: number) => {
    for (let i = vivas.length - 1; i >= 0; i--) {
      const p = vivas[i];
      p.vida -= dt;
      if (p.vida <= 0) { p.s.visible = false; libres.push(p.s); vivas.splice(i, 1); continue; }
      p.v.y += p.gravedad * dt;
      p.s.position.addScaledVector(p.v, dt);
      const k = p.vida / p.total;
      p.s.scale.setScalar(Math.max(0.01, p.tam * (1 + p.crece * (1 - k))));
      p.s.material.opacity = Math.min(1, k * 1.6);
      if (p.gira) p.s.material.rotation = p.base + (1 - k) * p.gira;
    }
    for (let i = tareas.length - 1; i >= 0; i--) if (!tareas[i](dt)) tareas.splice(i, 1);
    if (ambiente) { ambienteT += dt; while (ambienteT > ambiente.cada) { ambienteT -= ambiente.cada; emitir(v3(azar(14), 0.3 + Math.random() * 3, -2 + azar(8)), ambiente.v.clone().add(v3(azar(0.3), azar(0.2), azar(0.3))), ambiente.color, 0.1, 5, { tex: ambiente.tex, suma: ambiente.suma, gira: ambiente.tex === HOJA ? 4 : 0 }); } }
  };

  // ── Escenarios ──
  let grupo: THREE.Group | null = null;
  const luces = e.escena.children.filter((o) => (o as THREE.Light).isLight) as THREE.Light[];
  const cielo = (arriba: string, medio: string, abajo: string) => { const c = document.createElement('canvas'); c.width = 2; c.height = 256; const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, arriba); gr.addColorStop(0.6, medio); gr.addColorStop(1, abajo); g.fillStyle = gr; g.fillRect(0, 0, 2, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const NOMBRES = ['Pradera', 'Playa', 'Bosque', 'Cueva de cristal', 'Cima de la torre'];
  // Plataformas: tierra, superficie y anillo de cada escenario, con su decoración encima
  let plataformas: THREE.Group[] = [];
  const ESTILO: [string, string, string][] = [['#b0905a', '#a8e07a', '#8acb5a'], ['#c8a870', '#f0dcaa', '#e0c890'], ['#6a5030', '#6aa050', '#4a8a3a'], ['#4a4458', '#7a7488', '#9a90b0'], ['#c8bca8', '#f2eee6', '#d8c890']];
  const vestirPlataformas = (grupos: THREE.Group[]) => { plataformas = grupos; };
  const decorar = (i: number) => {
    for (const p of plataformas) {
      const [tierra, cara, anillo] = p.children as THREE.Mesh[], [c1, c2, c3] = ESTILO[i % 5];
      tierra.material = mat(c1); cara.material = mat(c2); anillo.material = mat(c3);
      p.getObjectByName('deco')?.removeFromParent();
      const deco = new THREE.Group(); deco.name = 'deco'; p.add(deco);
      const radio = (cara.geometry as THREE.CylinderGeometry).parameters.radiusTop;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + 0.3, r = radio * (0.8 + (k % 3) * 0.06), x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.sin(a) > 0.55) continue; // nada delante de la criatura
        const pieza = i % 5 === 0 ? new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(['#ff8ac8', '#ffe36b', '#ffffff'][k % 3]))
          : i % 5 === 1 ? new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 5), mat(k % 2 ? '#ffb0c0' : '#fff4e8'))
          : i % 5 === 2 ? new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(k % 2 ? '#d9443a' : '#c8a070'))
          : i % 5 === 3 ? new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(['#7af0ff', '#c87aff'][k % 2]).multiplyScalar(1.8) }))
          : new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12), mat('#e8c060'));
        pieza.position.set(x, 0.09, z); if (i % 5 === 4) pieza.rotation.x = Math.PI / 2; deco.add(pieza);
      }
    }
    // Color de la escena y viñeta (con CSS, que no cuesta en equipos lentos)
    e.lienzo.style.filter = ['saturate(1.08)', 'saturate(1.12) brightness(1.03)', 'saturate(0.95) contrast(1.05)', 'saturate(1.1) contrast(1.08)', 'sepia(0.12) saturate(1.15)'][i % 5];
    vineta.style.background = `radial-gradient(ellipse at center, transparent 55%, ${['rgba(20,40,10,.22)', 'rgba(20,40,60,.18)', 'rgba(10,30,20,.32)', 'rgba(10,0,30,.45)', 'rgba(60,20,40,.3)'][i % 5]} 100%)`;
  };
  const vineta = document.createElement('div');
  vineta.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1';
  e.lienzo.parentElement?.insertBefore(vineta, e.lienzo.nextSibling);
  const escenario = (i: number) => {
    grupo?.removeFromParent();
    const g = new THREE.Group(); grupo = g; e.escena.add(g);
    const caja = (geo: THREE.BufferGeometry, color: string | THREE.Material, x: number, y: number, z: number, esc: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0]) => { const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color); m.position.set(x, y, z); m.scale.set(...esc); m.rotation.set(...rot); g.add(m); return m; };
    const suelo = (color: string) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color })); m.rotation.x = -Math.PI / 2; g.add(m); };
    const arbol = (x: number, z: number, s = 1, pino = false) => { caja(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.9 * s, 8), '#7a4a2a', x, 0.45 * s, z); if (pino) for (let k = 0; k < 3; k++) caja(new THREE.ConeGeometry((0.9 - k * 0.22) * s, 1.1 * s, 9), k % 2 ? '#2f6a3a' : '#3a7a44', x, (1.1 + k * 0.62) * s, z); else caja(new THREE.SphereGeometry(0.78 * s, 12, 10), '#4a9a3a', x, 1.35 * s, z, [1, 1.12, 1]); };
    const cerro = (x: number, z: number, s: number, color: string) => caja(new THREE.SphereGeometry(s, 24, 12), new THREE.MeshLambertMaterial({ color }), x, 0, z, [1, 0.45, 1]);
    const [hemi, sol] = [luces.find((l) => (l as THREE.HemisphereLight).isHemisphereLight), luces.find((l) => (l as THREE.DirectionalLight).isDirectionalLight)];
    const luz = (h: number, s: number, color = '#fff3d6') => { if (hemi) hemi.intensity = h; if (sol) { sol.intensity = s; sol.color.set(color); } };
    e.escena.fog = null;
    switch (i % 5) {
      case 0: // Pradera con flores
        e.escena.background = cielo('#5fb4ec', '#bfe6ff', '#f2fbff'); luz(1.7, 1.9);
        suelo('#8fd06a');
        caja(new THREE.PlaneGeometry(2.4, 60), new THREE.MeshLambertMaterial({ color: '#d8c890' }), 0, 0.005, -8, [1, 1, 1], [-Math.PI / 2, 0, 0.5]);
        for (const [x, z, s, col] of [[-9, -16, 6, '#6ab84a'], [-2, -20, 8, '#5aa83e'], [8, -17, 7, '#72c052'], [15, -22, 9, '#5aa83e']] as [number, number, number, string][]) cerro(x, z, s, col);
        for (const [x, z] of [[-6.5, -5], [-7.5, -2], [6.8, -6], [7.6, -3.2], [-5.2, -8], [5.4, -9]]) arbol(x, z);
        for (let k = 0; k < 40; k++) caja(new THREE.SphereGeometry(0.06, 6, 5), ['#ff8ac8', '#ffe36b', '#ffffff', '#ff6a5a'][k % 4], azar(16), 0.05, -1 - Math.random() * 9);
        ambiente = { color: '#fff6c8', v: v3(0.3, 0.1, 0), cada: 0.25, suma: true };
        break;
      case 1: // Playa con mar, palmeras y rocas
        e.escena.background = cielo('#3fa8e8', '#a8e0ff', '#fff8e0'); luz(1.8, 2.0);
        suelo('#f0d9a0');
        caja(new THREE.PlaneGeometry(200, 60), new THREE.MeshLambertMaterial({ color: '#3a9ad8' }), 0, 0.02, -38, [1, 1, 1], [-Math.PI / 2, 0, 0]);
        caja(new THREE.PlaneGeometry(200, 1.4), new THREE.MeshBasicMaterial({ color: '#eafaff' }), 0, 0.03, -8.3, [1, 1, 1], [-Math.PI / 2, 0, 0]);
        for (const [x, z] of [[-6.6, -4.5], [7, -5], [-8.5, -1.5]]) { for (let k = 0; k < 5; k++) caja(new THREE.CylinderGeometry(0.12, 0.15, 0.6, 8), '#a87a4a', x + k * 0.08, 0.3 + k * 0.55, z, [1, 1, 1], [0, 0, -0.12]); for (let k = 0; k < 6; k++) caja(new THREE.ConeGeometry(0.22, 1.5, 5), '#3a9a3a', x + 0.4 + Math.cos(k) * 0.6, 2.9, z + Math.sin(k) * 0.6, [1, 1, 1], [Math.PI / 2 - 0.4, k, 0]); }
        for (const [x, z, s] of [[-4.5, -7, 0.7], [5.5, -8, 0.9], [9, -3, 0.5]]) caja(new THREE.DodecahedronGeometry(s), '#9a8a7a', x, s * 0.4, z);
        ambiente = { color: '#ffffff', v: v3(0.6, 0.05, 0), cada: 0.35, suma: true };
        break;
      case 2: // Bosque profundo con niebla
        e.escena.background = cielo('#3a6a5a', '#8ab8a0', '#c8e0c8'); luz(1.3, 1.4, '#e8ffd8');
        e.escena.fog = new THREE.Fog('#a8c8b0', 9, 30);
        suelo('#5a9a4a');
        for (let k = 0; k < 26; k++) { const x = (k % 2 ? -1 : 1) * (4.5 + Math.random() * 9), z = -2 - Math.random() * 16; arbol(x, z, 1 + Math.random() * 0.8, true); }
        for (let k = 0; k < 8; k++) { const x = azar(9), z = -3 - Math.random() * 5; caja(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 6), '#f4ead8', x, 0.08, z); caja(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#d9443a', x, 0.15, z); }
        ambiente = { color: '#9ad87a', tex: HOJA, v: v3(0.25, -0.3, 0), cada: 0.3, suma: false };
        break;
      case 3: // Cueva de cristales
        e.escena.background = cielo('#120e22', '#2a2440', '#3a3050'); luz(0.9, 1.1, '#c8b8ff');
        e.escena.fog = new THREE.Fog('#2a2440', 8, 26);
        suelo('#4a4458');
        for (let k = 0; k < 16; k++) { const lado = k % 2 ? -1 : 1; caja(new THREE.DodecahedronGeometry(1.4 + Math.random() * 1.6), '#5a5268', lado * (5.5 + Math.random() * 6), 0.6, -2 - Math.random() * 14); }
        for (let k = 0; k < 14; k++) { const col = ['#7af0ff', '#c87aff', '#ff7ad8'][k % 3]; caja(new THREE.ConeGeometry(0.18, 0.9 + Math.random() * 0.8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.9) }), (k % 2 ? -1 : 1) * (3.6 + Math.random() * 4), 0.4, -1 - Math.random() * 9, [1, 1, 1], [azar(0.5), 0, azar(0.5)]); }
        ambiente = { color: '#9ad8ff', v: v3(0, 0.25, 0), cada: 0.18, suma: true };
        break;
      case 4: // Cima de la torre, entre las nubes, al atardecer
        e.escena.background = cielo('#4a3a8a', '#ff8a6a', '#ffd8a0'); luz(1.5, 2.0, '#ffd0a0');
        suelo('#e8e4f4');
        for (let k = 0; k < 60; k++) caja(new THREE.SphereGeometry(0.8 + Math.random() * 1.4, 10, 8), new THREE.MeshLambertMaterial({ color: '#fff6f0' }), azar(40), -0.4 + Math.random() * 0.4, -3 - Math.random() * 30);
        caja(new THREE.CylinderGeometry(5.5, 5.8, 0.4, 40), '#c8bca8', 0, -0.18, -0.2);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; if (Math.sin(a) > 0.5) continue; caja(new THREE.CylinderGeometry(0.22, 0.26, 2.6, 10), '#e8dcc8', Math.cos(a) * 5.2, 1.3, -0.2 + Math.sin(a) * 4.2); }
        ambiente = { color: '#ffffff', v: v3(1.4, 0.05, 0), cada: 0.12, suma: true };
        { const sol = new THREE.Sprite(new THREE.SpriteMaterial({ map: PUNTO, color: new THREE.Color('#ffd8a0').multiplyScalar(2.2), depthWrite: false, blending: THREE.AdditiveBlending })); sol.position.set(-9, 5, -40); sol.scale.setScalar(16); g.add(sol); }
        break;
    }
    decorar(i);
    return NOMBRES[i % 5];
  };

  return { emitir, onda, impacto, especial, destello, estados, aura, escudo, actualizar, escenario, estallido, vestirPlataformas, despues, calmar: (b: boolean) => { calma = b; } };
}
export type Efectos = ReturnType<typeof crearEfectos>;
