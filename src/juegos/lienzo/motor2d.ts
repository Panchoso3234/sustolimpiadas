import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { crearMesa, type Mesa } from '../tablero/mesa';
import { ajustesPartida, type Contexto } from '../marco';
import { esLiviano } from '../../nucleo/preferencias';

// Motor 2D para los juegos de mucho movimiento dibujados en un lienzo (Flappy Colibrí, Corte Maestro, Fusión de Gemas,
// Horda Infinita). Se apoya en la mesa del sitio (marcador, sonidos, pausa y reloj) y agrega:
// · física a paso fijo (1/120 s): la misma semilla da exactamente lo mismo en cualquier equipo (duelos justos);
// · un lienzo nítido que llena la caja (coordenadas lógicas: ALTO unidades de alto; el ancho sale de la pantalla);
// · entrada unificada: puntero (mouse o dedo, con su estela) y teclas;
// · sensación de golpe: temblor, cuadros congelados, partículas y textos que flotan;
// · con `pixel`, el mundo se dibuja en un lienzo chico y se agranda sin suavizar (pixel art, muy liviano); los textos y
//   la interfaz van encima, nítidos;
// · con `tres: true`, una capa Three.js debajo del lienzo 2D (que queda transparente, para textos y partículas). La capa 3D
//   mide cuántos cuadros por segundo logra y baja sola la resolución si el equipo no da abasto. Sin WebGL, el juego dibuja en 2D.

export const PASO = 1 / 120;
export interface Particula { x: number; y: number; vx: number; vy: number; vida: number; dura: number; tam: number; color: string; gravedad: number; forma: 'punto' | 'chispa' | 'gota' }
export interface Flotante { x: number; y: number; texto: string; color: string; tam: number; vida: number; dura: number }
export interface Puntero { x: number; y: number; abajo: boolean; estela: { x: number; y: number; t: number }[]; /** 'mouse', 'touch' o 'pen' */ tipo: string; /** El puntero está sobre el lienzo. */ dentro: boolean }

/** Calidad de la capa 3D: 0 alta, 1 media, 2 baja (resolución de la imagen). */
const RESOLUCION = [2, 1.25, 0.85];
let texBrillo: THREE.Texture | null = null;
/** Un degradado radial blanco: con mezcla aditiva hace de brillo barato (sin postproceso). */
export function texturaBrillo(): THREE.Texture {
  if (texBrillo) return texBrillo;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (texBrillo = new THREE.CanvasTexture(cv));
}
/** Textura dibujada una sola vez con canvas 2D. */
export function texturaDe(ancho: number, alto: number, dibujar: (g: CanvasRenderingContext2D) => void, repetir = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = ancho; cv.height = alto;
  dibujar(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function crearTres(lienzo2d: HTMLCanvasElement) {
  let render: THREE.WebGLRenderer;
  const liviano = esLiviano() || matchMedia('(pointer: coarse)').matches;
  try { render = new THREE.WebGLRenderer({ antialias: !liviano, alpha: false, preserveDrawingBuffer: ajustesPartida.foto, powerPreference: liviano ? 'low-power' : 'high-performance' }); }
  catch { return null; }
  render.outputColorSpace = THREE.SRGBColorSpace;
  render.toneMapping = THREE.NeutralToneMapping; // conserva los colores saturados (ACES los lava)
  render.domElement.className = 'lienzo2d-canvas lienzo3d';
  lienzo2d.before(render.domElement);
  const escena = new THREE.Scene();
  let entorno: THREE.Texture | null = null;
  const base = new THREE.OrthographicCamera(0, 1280, 0, -720, -3000, 3000);
  return {
    /** La cámara de siempre (el motor la ajusta); un juego puede poner la suya en `camara` y manejarla él. */
    base,
    render, escena, calidad: esLiviano() ? 2 : liviano ? 1 : 0,
    /** Cámara ortográfica alineada con las coordenadas lógicas: x a la derecha, y hacia arriba (usar -y del juego). */
    camara: base as THREE.Camera,
    /** Mapa de entorno (una habitación con luces) para reflejos de gemas y metales; se genera una sola vez. */
    entorno() {
      if (!entorno) { const pm = new THREE.PMREMGenerator(render); entorno = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
      return entorno;
    },
  };
}
export type Tres = NonNullable<ReturnType<typeof crearTres>>;

export function crearMotor2D(c: Contexto, clase: string, opciones: { alto?: number; fondo?: string; tres?: boolean; /** Unidades lógicas por píxel del arte (por ejemplo 4: 720 de alto son 180 píxeles). */ pixel?: (ancho: number) => number } = {}) {
  const mesa: Mesa = crearMesa(c.caja, `lienzo2d ${clase}`, c.aspecto);
  const ALTO = opciones.alto ?? 720;
  const lienzo = mesa.el('canvas', 'lienzo2d-canvas', mesa.tablero);
  const tres = opciones.tres ? crearTres(lienzo) : null;
  if (tres) lienzo.classList.add('encima');
  const g = lienzo.getContext('2d', { alpha: !!tres })!;
  const alMedir: (() => void)[] = [];
  let ancho = 1280, escala = 1, dpr = 1, k = 1;
  const pix = opciones.pixel ? document.createElement('canvas') : null, gp = pix ? pix.getContext('2d', { alpha: false })! : null;
  const medir = () => {
    const caja = mesa.tablero.getBoundingClientRect(), w = Math.max(320, caja.width || c.caja.clientWidth || 960), h = Math.max(240, caja.height || c.caja.clientHeight || 540);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    lienzo.width = Math.round(w * dpr); lienzo.height = Math.round(h * dpr);
    lienzo.style.width = `${w}px`; lienzo.style.height = `${h}px`;
    escala = (h * dpr) / ALTO; ancho = (w * dpr) / escala;
    if (pix && opciones.pixel) { k = opciones.pixel(ancho); pix.width = Math.ceil(ancho / k); pix.height = Math.ceil(ALTO / k); gp!.imageSmoothingEnabled = false; }
    if (tres) {
      const resolucion = Math.min(window.devicePixelRatio || 1, RESOLUCION[tres.calidad], Math.sqrt(2.4e6 / (w * h)));
      tres.render.setPixelRatio(resolucion); tres.render.setSize(w, h, false);
      tres.render.domElement.style.width = `${w}px`; tres.render.domElement.style.height = `${h}px`;
      const cam = tres.base;
      { cam.left = 0; cam.right = ancho; cam.top = 0; cam.bottom = -ALTO; cam.updateProjectionMatrix(); }
    }
    for (const f of alMedir) f();
  };
  medir();
  const observador = new ResizeObserver(medir);
  observador.observe(mesa.tablero);

  // ── Entrada ──
  const puntero: Puntero = { x: 0, y: 0, abajo: false, estela: [], tipo: 'mouse', dentro: false };
  const teclas = new Set<string>();
  const alTocar: ((x: number, y: number) => void)[] = [], alSoltar: ((x: number, y: number) => void)[] = [], alTecla: ((k: string) => void)[] = [];
  const aLogico = (ev: PointerEvent) => { const b = lienzo.getBoundingClientRect(); return [((ev.clientX - b.left) * dpr) / escala, ((ev.clientY - b.top) * dpr) / escala] as const; };
  lienzo.style.touchAction = 'none';
  lienzo.addEventListener('pointerdown', (ev) => { ev.preventDefault(); lienzo.setPointerCapture?.(ev.pointerId); const [x, y] = aLogico(ev); puntero.x = x; puntero.y = y; puntero.tipo = ev.pointerType; puntero.dentro = true; puntero.abajo = true; puntero.estela = [{ x, y, t: tiempo }]; for (const f of alTocar) f(x, y); });
  lienzo.addEventListener('pointerleave', () => { puntero.dentro = false; });
  lienzo.addEventListener('pointermove', (ev) => { const [x, y] = aLogico(ev); puntero.x = x; puntero.y = y; puntero.tipo = ev.pointerType; puntero.dentro = true; if (puntero.abajo) puntero.estela.push({ x, y, t: tiempo }); });
  const soltar = (ev: PointerEvent) => { if (!puntero.abajo) return; const [x, y] = aLogico(ev); puntero.abajo = false; for (const f of alSoltar) f(x, y); };
  lienzo.addEventListener('pointerup', soltar); lienzo.addEventListener('pointercancel', soltar);
  mesa.escuchar('keydown', (ev) => { if (ev.repeat) return; const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key; teclas.add(k); if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) ev.preventDefault(); for (const f of alTecla) f(k); });
  mesa.escuchar('keyup', (ev) => { teclas.delete(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key); });

  // ── Efectos ──
  const particulas: Particula[] = [], flotantes: Flotante[] = [], sacudida = { x: 0, y: 0 };
  const rotulos = new Map<string, { cv: HTMLCanvasElement; w: number; h: number }>();
  let temblor = 0, congeladoHasta = 0, tiempo = 0, calma = false;
  try { calma = localStorage.getItem('susto.calma') === 'si' || matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* sin almacenamiento */ }
  const efectos = {
    temblar(f: number) { if (!calma) temblor = Math.max(temblor, f); },
    congelar(ms: number) { if (!calma) congeladoHasta = Math.max(congeladoHasta, performance.now() + ms); },
    chispas(x: number, y: number, colores: string[], n: number, fuerza: number, o: Partial<Particula> = {}) {
      if (particulas.length > 900) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = fuerza * (0.35 + Math.random() * 0.65);
        particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0, dura: 0.4 + Math.random() * 0.5, tam: 3 + Math.random() * 4, color: colores[i % colores.length], gravedad: 600, forma: 'punto', ...o });
      }
    },
    flotar(x: number, y: number, texto: string, color = '#fff6c9', tam = 34) { flotantes.push({ x, y, texto, color, tam, vida: 0, dura: 0.9 }); },
  };

  // ── Bucle ──
  let pixeles: ((gp: CanvasRenderingContext2D, alfa: number) => void)[] = [];
  let pasos: ((dt: number) => void)[] = [], dibujos: ((g: CanvasRenderingContext2D, alfa: number) => void)[] = [], antes3d: ((alfa: number) => void)[] = [];
  // Rendimiento: cada 2 s se mira el tiempo medio por cuadro; si pasa de 22 ms (menos de ~45 por segundo) dos veces
  // seguidas, baja la calidad. Los primeros 3 s no cuentan (ahí se compilan los shaders). Nunca vuelve a subir.
  let medidos = 0, sumaMs = 0, lentas = 0, previo = performance.now(), desde = performance.now() + 3000;
  const medirRendimiento = () => {
    const ahora = performance.now(), d = ahora - previo; previo = ahora;
    if (!tres || d > 250 || document.hidden || ahora < desde) return;
    sumaMs += d; medidos++;
    if (sumaMs < 2000) return;
    const medio = sumaMs / medidos; sumaMs = 0; medidos = 0;
    lentas = medio > 22 ? lentas + 1 : 0;
    if (lentas >= 2 && tres.calidad < 2) { tres.calidad++; lentas = 0; medir(); }
  };
  const perfil = { antes: 0, render: 0, paso: 0, d2: 0, n: 0 };
  let corriendo = false, acum = 0, ultimo = 0, cuadro = 0, vivo = true;
  const bucle = () => {
    if (!vivo) return;
    cuadro = requestAnimationFrame(bucle);
    const ahora = mesa.reloj(); // se congela con la pausa
    let dt = Math.min(0.1, Math.max(0, ahora - ultimo));
    ultimo = ahora;
    if (performance.now() < congeladoHasta) dt = 0;
    const tp = performance.now();
    if (corriendo) { acum += dt; while (acum >= PASO) { acum -= PASO; tiempo += PASO; for (const f of pasos) f(PASO); } }
    // Efectos (en tiempo real, también al congelar)
    for (let i = particulas.length - 1; i >= 0; i--) { const p = particulas[i]; p.vida += dt; if (p.vida >= p.dura) { particulas.splice(i, 1); continue; } p.vy += p.gravedad * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (let i = flotantes.length - 1; i >= 0; i--) { const f = flotantes[i]; f.vida += dt; if (f.vida >= f.dura) flotantes.splice(i, 1); }
    puntero.estela = puntero.estela.filter((p) => tiempo - p.t < 0.14);
    temblor *= Math.pow(0.02, dt);
    perfil.paso += performance.now() - tp;
    medirRendimiento();
    dibujar();
  };
  const dibujar = () => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    const tx = temblor > 0.3 ? (Math.random() - 0.5) * temblor : 0, ty = temblor > 0.3 ? (Math.random() - 0.5) * temblor : 0;
    if (tres) {
      g.clearRect(0, 0, lienzo.width, lienzo.height);
      sacudida.x = tx; sacudida.y = ty;
      const t0 = performance.now();
      for (const f of antes3d) f(acum / PASO);
      const t1 = performance.now();
      if (tres.camara === tres.base) { tres.base.position.set(-tx, ty, 1000); tres.base.updateMatrixWorld(); }
      tres.render.render(tres.escena, tres.camara);
      perfil.antes += t1 - t0; perfil.render += performance.now() - t1; perfil.n++;
    } else { g.fillStyle = opciones.fondo ?? '#0e1424'; g.fillRect(0, 0, lienzo.width, lienzo.height); }
    if (pix && gp) {
      // Mundo en píxeles: el juego dibuja en coordenadas lógicas sobre el lienzo chico; las partículas son cuadrados
      const t0 = performance.now();
      gp.setTransform(1, 0, 0, 1, 0, 0); gp.fillStyle = opciones.fondo ?? '#0e1424'; gp.fillRect(0, 0, pix.width, pix.height);
      gp.setTransform(1 / k, 0, 0, 1 / k, 0, 0);
      for (const f of pixeles) f(gp, acum / PASO);
      for (const p of particulas) { gp.fillStyle = p.color; const lado = Math.max(k, Math.round(p.tam * (1 - p.vida / p.dura * 0.5) / k) * k); gp.fillRect(Math.round(p.x / k) * k - lado / 2, Math.round(p.y / k) * k - lado / 2, lado, lado); }
      // Se agranda sin suavizar; el temblor se mueve de a un píxel entero
      g.imageSmoothingEnabled = false;
      g.setTransform(escala, 0, 0, escala, Math.round(tx / k) * k * escala, Math.round(ty / k) * k * escala);
      g.drawImage(pix, 0, 0, pix.width * k, pix.height * k);
      perfil.antes += performance.now() - t0;
    }
    g.setTransform(escala, 0, 0, escala, tx * escala, ty * escala);
    const td = performance.now();
    for (const f of dibujos) f(g, acum / PASO);
    perfil.d2 += performance.now() - td; if (!tres) perfil.n++;
    // Partículas y textos encima de todo
    if (!pix) for (const p of particulas) {
      const k = 1 - p.vida / p.dura;
      g.globalAlpha = Math.max(0, k);
      g.fillStyle = p.color;
      if (p.forma === 'chispa') { g.strokeStyle = p.color; g.lineWidth = p.tam * 0.5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke(); }
      else { g.beginPath(); g.arc(p.x, p.y, p.tam * (p.forma === 'gota' ? 1 : k + 0.2), 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const f of flotantes) {
      const k = f.vida / f.dura, s = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - (k - 0.15) * 0.15;
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.font = `900 ${Math.round(f.tam * s)}px Nunito, sans-serif`;
      g.lineWidth = 6; g.strokeStyle = 'rgba(10,14,30,.75)'; g.strokeText(f.texto, f.x, f.y - k * 50);
      g.fillStyle = f.color; g.fillText(f.texto, f.x, f.y - k * 50);
    }
    g.globalAlpha = 1;
  };
  cuadro = requestAnimationFrame(bucle);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__lienzo = () => ({ calidad: tres?.calidad ?? null, msAntes: +(perfil.antes / perfil.n).toFixed(2), msRender: +(perfil.render / perfil.n).toFixed(2), msPaso: +(perfil.paso / perfil.n).toFixed(2), ms2d: +(perfil.d2 / perfil.n).toFixed(2), llamadas: tres?.render.info.render.calls });

  return {
    mesa, g, lienzo, puntero, teclas, efectos, particulas, tres, sacudida,
    get ancho() { return ancho; }, ALTO,
    /** Modo píxel: unidades lógicas por píxel del arte. */
    get k() { return k; },
    /** Modo píxel: el mundo (coordenadas lógicas, sobre el lienzo chico). Se dibuja antes que `alDibujar`. */
    alPixel(f: (gp: CanvasRenderingContext2D, alfa: number) => void) { pixeles.push(f); },
    /** Modo píxel: dibuja un sprite (canvas de su tamaño en píxeles) centrado en (x, y), alineado a la grilla. */
    sprite(img: CanvasImageSource & { width: number; height: number }, x: number, y: number, escalaSprite = 1) {
      if (!gp) return;
      const w = img.width * k * escalaSprite, h = img.height * k * escalaSprite;
      gp.drawImage(img, Math.round((x - w / 2) / k) * k, Math.round((y - h / 2) / k) * k, w, h);
    },
    get tiempo() { return tiempo; },
    get calma() { return calma; },
    /** Lógica a paso fijo (1/120 s). */
    alPaso(f: (dt: number) => void) { pasos.push(f); },
    /** Dibujo (cada cuadro). `alfa`: cuánto se avanzó hacia el próximo paso, para suavizar. */
    alDibujar(f: (g: CanvasRenderingContext2D, alfa: number) => void) { dibujos.push(f); },
    /**
     * Texto grande con borde, guardado como imagen: escribir texto con borde en cada cuadro es lo más caro del lienzo 2D.
     * Se dibuja centrado en (x, y), en coordenadas lógicas.
     */
    rotulo(texto: string, x: number, y: number, tam: number, color = '#ffffff', alfa = 1) {
      const clave = `${texto}|${tam}|${color}|${escala.toFixed(3)}`;
      let img = rotulos.get(clave);
      if (!img) {
        const cv = document.createElement('canvas'), cg = cv.getContext('2d')!, fuente = `900 ${tam}px Nunito, sans-serif`;
        cg.font = fuente;
        const w = cg.measureText(texto).width + tam * 0.5, h = tam * 1.5;
        cv.width = Math.ceil(w * escala); cv.height = Math.ceil(h * escala);
        cg.scale(escala, escala); cg.font = fuente; cg.textAlign = 'center'; cg.textBaseline = 'middle';
        cg.lineWidth = tam * 0.16; cg.strokeStyle = 'rgba(14,20,36,.85)'; cg.lineJoin = 'round'; cg.strokeText(texto, w / 2, h / 2);
        cg.fillStyle = color; cg.fillText(texto, w / 2, h / 2);
        img = { cv, w, h };
        if (rotulos.size > 80) rotulos.delete(rotulos.keys().next().value!);
        rotulos.set(clave, img);
      }
      g.globalAlpha = alfa; g.drawImage(img.cv, x - img.w / 2, y - img.h / 2, img.w, img.h); g.globalAlpha = 1;
    },
    /** Capa 3D: actualizar mallas justo antes de cada imagen (solo si hay `tres`). */
    antes3d(f: (alfa: number) => void) { antes3d.push(f); },
    /** Después de cada cambio de tamaño (para cámaras propias). */
    alMedir(f: () => void) { alMedir.push(f); f(); },
    alTocar(f: (x: number, y: number) => void) { alTocar.push(f); },
    alSoltar(f: (x: number, y: number) => void) { alSoltar.push(f); },
    alTecla(f: (k: string) => void) { alTecla.push(f); },
    empezar() { mesa.empezar(); medir(); ultimo = mesa.reloj(); corriendo = true; desde = performance.now() + 3000; if (tres) tres.render.compile(tres.escena, tres.camara); },
    detener() { corriendo = false; mesa.detener(); },
    destruir() {
      vivo = false; cancelAnimationFrame(cuadro); observador.disconnect(); pasos = []; dibujos = []; antes3d = [];
      if (tres) {
        tres.escena.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []; for (const x of mats) { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); } });
        tres.render.dispose(); tres.render.forceContextLoss();
      }
      mesa.destruir();
    },
  };
}
export type Motor2D = ReturnType<typeof crearMotor2D>;

/** Solo en pruebas: "?piloto=1" juega un bot bueno; "?piloto=torpe" uno malo. */
export const piloto = (): 'bueno' | 'torpe' | null => {
  if (!import.meta.env.DEV) return null;
  const p = new URLSearchParams(location.search).get('piloto');
  return p === 'torpe' ? 'torpe' : p !== null ? 'bueno' : null;
};

/** Mezcla dos colores "#rrggbb" (k de 0 a 1). */
export function mezclar(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), f = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1)}`;
}

/**
 * Música generada en el juego (sin archivos de nadie): bajo, arpegio y destellos sobre una progresión de 4 acordes,
 * a corcheas. `intensidad` (0 a 2) suma capas: 0 solo bajo, 1 + arpegio, 2 + destellos. Usa el sintetizador de la mesa.
 */
export function crearMusica(mesa: Mesa, tempo = 116) {
  const corchea = 30 / tempo;
  let acordes: number[][] = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], intensidad = 0, proxima = 0, n = 0, activa = true;
  const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
  mesa.alTic((t) => {
    if (!activa) return;
    if (proxima === 0) proxima = t;
    while (t >= proxima) {
      const ac = acordes[Math.floor(n / 8) % acordes.length], k = n % 8;
      if (k % 4 === 0) mesa.sonido.tono(hz(ac[0] - 12), corchea * 3.6, 'triangle', 0.09);
      if (intensidad >= 1) mesa.sonido.tono(hz(ac[k % 3] + (k >= 4 ? 12 : 0)), corchea * 0.9, 'sine', 0.045);
      if (intensidad >= 2 && (k === 3 || k === 7)) mesa.sonido.tono(hz(ac[2] + 24), corchea * 0.5, 'triangle', 0.03);
      proxima += corchea; n++;
    }
  });
  return {
    set intensidad(v: number) { intensidad = v; },
    /** Cambia la progresión (cada mundo tiene la suya): lista de acordes MIDI. */
    acordes(a: number[][]) { acordes = a; },
    parar() { activa = false; },
  };
}
