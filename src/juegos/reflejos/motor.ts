import * as THREE from 'three';
import { cargar, type Origen as Paquete } from '../../nucleo/modelos';
import type { Aspecto } from '../../personaje/catalogo';
import { crearKenney, type Kenney } from '../../personaje/kenney';
import { alCambiarVolumen, cargarMuestras, tocarMuestra, volumen } from '../sonido';
import { ajustesPartida } from '../marco';

// Motor D · Reflejos y ritmo. Resuelve una sola vez lo que comparten sus cuatro juegos: una playa pequeña en 3D,
// la cámara que se acomoda a cualquier pantalla, el reloj de la partida, el marcador, los textos que saltan,
// los sonidos y los toques. Cada juego solo agrega sus piezas y sus reglas.

/** Qué parte del mundo tiene que caber siempre en pantalla, sea un monitor ancho o un celular parado. */
export interface Encuadre { ancho: number; alto: number; centro: [number, number, number]; inclinacion: number; /** Sin arena, mar ni barco: para juegos con otro ambiente. */ sinPlaya?: boolean }

export interface Tono { tipo?: OscillatorType; vol?: number; cuando?: number; hasta?: number }

export type Escenario = ReturnType<typeof crearEscenario>;

const ARENA = '#f2deae', MAR = '#58c0ea', CIELO = '#a6e0ff';

export function crearEscenario(caja: HTMLElement, encuadre: Encuadre) {
  // En vivo se conserva la imagen del lienzo para poder sacarle fotos (el espejo del rival)
  const render = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: ajustesPartida.foto });
  render.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const lienzo = render.domElement;
  lienzo.style.touchAction = 'none';
  caja.appendChild(lienzo);

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(CIELO);
  escena.add(new THREE.HemisphereLight('#ffffff', '#e8c98a', 1.7));
  const sol = new THREE.DirectionalLight('#fff3d6', 1.9);
  sol.position.set(4, 9, 6);
  escena.add(sol);

  // Playa: arena al frente, mar al fondo
  const plano = (color: string, ancho: number, fondo: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, fondo), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, z);
    escena.add(m);
    return m;
  };
  const arena = plano(ARENA, 400, 400, 0, 0), mar = plano(MAR, 400, 160, 0.02, -110), espuma = plano('#eafaff', 400, 1.2, 0.03, -29.6);
  arena.visible = mar.visible = espuma.visible = !encuadre.sinPlaya;

  // Un barco pirata fondeado mar adentro. Si el modelo no carga, la playa queda igual.
  if (!encuadre.sinPlaya) cargar('pirata', 'ship-pirate-small').then((modelo) => {
    const barco = modelo.clone(), caja3 = new THREE.Box3().setFromObject(modelo), s = 9 / Math.max(0.01, caja3.max.y - caja3.min.y);
    barco.scale.setScalar(s);
    barco.position.set(19, -caja3.min.y * s - 0.7, -56);
    barco.rotation.y = 2.3;
    escena.add(barco);
  }).catch(() => {});

  const FOV = 40, camara = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
  const centro = new THREE.Vector3(...encuadre.centro);
  const medir = () => {
    const w = caja.clientWidth, h = caja.clientHeight;
    if (!w || !h) return;
    // En pantallas grandes se dibuja a menos píxeles (unos 1,1 millones) y el navegador lo agranda: en una gráfica integrada se nota mucho más la fluidez que la nitidez
    render.setPixelRatio(Math.min(window.devicePixelRatio, ajustesPartida.vivo ? 1 : 1.5, Math.sqrt(1.1e6 / (w * h))));
    render.setSize(w, h);
    camara.aspect = w / h;
    const media = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const d = Math.max(encuadre.alto / 2 / media, encuadre.ancho / 2 / (media * camara.aspect));
    camara.position.set(centro.x, centro.y + Math.sin(encuadre.inclinacion) * d, centro.z + Math.cos(encuadre.inclinacion) * d);
    camara.lookAt(centro);
    camara.updateProjectionMatrix();
  };
  const observador = new ResizeObserver(medir);
  observador.observe(caja);
  medir();

  // Marcador
  const crear = (clase: string, padre: HTMLElement = caja) => { const e = document.createElement('div'); e.className = clase; padre.appendChild(e); return e; };
  const barra = crear('juego-hud');
  const elTiempo = crear('dato', barra), elExtra = crear('dato centro', barra), elPuntos = crear('dato', barra);
  const elAviso = crear('juego-aviso');
  let borrarAviso = 0;

  // Sonido: un solo contexto, que nace con la partida (ya hubo un toque en "Jugar")
  let ctx: AudioContext | null = null, salida: GainNode | null = null, muestras: Record<string, AudioBuffer> = {};
  const sonido = {
    get ctx() { return ctx; },
    tono(frec: number, dura: number, o: Tono = {}) {
      if (!ctx || !salida) return;
      const t = o.cuando ?? ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o.tipo ?? 'sine';
      osc.frequency.setValueAtTime(frec, t);
      if (o.hasta) osc.frequency.exponentialRampToValueAtTime(o.hasta, t + dura);
      g.gain.setValueAtTime(o.vol ?? 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dura);
      osc.connect(g).connect(salida);
      osc.start(t);
      osc.stop(t + dura + 0.02);
    },
    ruido(dura: number, vol = 0.2, cuando?: number) {
      if (!ctx || !salida) return;
      const t = cuando ?? ctx.currentTime, n = Math.ceil(ctx.sampleRate * dura), datos = ctx.createBuffer(1, n, ctx.sampleRate), canal = datos.getChannelData(0);
      for (let i = 0; i < n; i++) canal[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const fuente = ctx.createBufferSource(), g = ctx.createGain();
      fuente.buffer = datos;
      g.gain.value = vol;
      fuente.connect(g).connect(salida);
      fuente.start(t);
    },
    /** Efecto grabado. Devuelve falso si todavía no cargó o el navegador no lo soporta: ahí cada juego usa su tono. */
    efecto(nombre: string, vol = 0.8): boolean { return !!ctx && !!salida && tocarMuestra(ctx, salida, muestras, nombre, vol); },
    bien() { if (sonido.efecto('bien')) return; sonido.tono(660, 0.09, { tipo: 'triangle', vol: 0.25 }); sonido.tono(990, 0.14, { tipo: 'triangle', vol: 0.2, cuando: (ctx?.currentTime ?? 0) + 0.07 }); },
    mal() { if (sonido.efecto('mal')) return; sonido.tono(190, 0.25, { tipo: 'sawtooth', vol: 0.2, hasta: 90 }); },
  };

  // Reloj de la partida: tiempo real desde `empezar`, así el juego no se alarga en un equipo lento
  let vivo = true, corriendo = false, inicio = 0, salto = 0, fijo = 0, previo = performance.now();
  const reloj = () => (corriendo ? (performance.now() - inicio) / 1000 + salto : fijo);
  const tareas: ((t: number, dt: number) => void)[] = [], animados: THREE.Object3D[] = [], limpiezas: (() => void)[] = [];

  // Chispas y confeti: un solo grupo de cubitos (una instancia cada uno), así cien chispas cuestan un solo dibujo
  const CHISPAS = 180;
  let chispas: THREE.InstancedMesh | null = null, siguiente = 0, temblor = 0;
  const vidaChispa = new Float32Array(CHISPAS), velChispa = new Float32Array(CHISPAS * 3), posChispa = new Float32Array(CHISPAS * 3);
  const unaChispa = new THREE.Object3D(), colorChispa = new THREE.Color(), camaraQuieta = new THREE.Vector3();
  const moverChispas = (dt: number) => {
    if (!chispas) return;
    let vivas = 0;
    for (let i = 0; i < CHISPAS; i++) {
      if (vidaChispa[i] <= 0) continue;
      vivas++;
      vidaChispa[i] -= dt;
      velChispa[i * 3 + 1] -= 14 * dt;
      for (let k = 0; k < 3; k++) posChispa[i * 3 + k] += velChispa[i * 3 + k] * dt;
      unaChispa.position.fromArray(posChispa, i * 3);
      unaChispa.rotation.set(vidaChispa[i] * 9, vidaChispa[i] * 7, 0);
      unaChispa.scale.setScalar(Math.max(0, Math.min(1, vidaChispa[i] * 2)));
      unaChispa.updateMatrix();
      chispas.setMatrixAt(i, unaChispa.matrix);
    }
    chispas.visible = vivas > 0;
    chispas.instanceMatrix.needsUpdate = true;
  };

  const paso = () => {
    const ahora = performance.now(), dt = Math.min(0.1, (ahora - previo) / 1000);
    previo = ahora;
    const t = reloj();
    mar.position.y = 0.02 + Math.sin(ahora / 900) * 0.015;
    espuma.position.z = -29.6 + Math.sin(ahora / 1300) * 0.5;
    for (const f of tareas) f(t, dt);
    for (const o of animados) o.userData.avanzar?.(dt);
    moverChispas(dt);
    // La cámara tiembla solo mientras se dibuja este cuadro: cada juego la sigue moviendo a su manera
    if (temblor > 0.01) {
      camaraQuieta.copy(camara.position);
      camara.position.x += (Math.random() - 0.5) * temblor;
      camara.position.y += (Math.random() - 0.5) * temblor;
      temblor *= Math.pow(0.002, dt);
      render.render(escena, camara);
      camara.position.copy(camaraQuieta);
    } else render.render(escena, camara);
  };
  const cuadro = () => { if (!vivo) return; paso(); requestAnimationFrame(cuadro); };
  requestAnimationFrame(cuadro);

  const rayo = new THREE.Raycaster(), ndc = new THREE.Vector2(), proyectado = new THREE.Vector3();
  const suelo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const api = {
    escena, camara, lienzo, sonido, reloj,
    hud: {
      tiempo(texto: string) { if (elTiempo.textContent !== texto) elTiempo.textContent = texto; },
      puntos(n: number) { const texto = `${n} pts`; if (elPuntos.textContent !== texto) elPuntos.textContent = texto; },
      extra(texto: string) { if (elExtra.textContent !== texto) elExtra.textContent = texto; },
      /** Texto grande al centro, que se va solo. */
      aviso(texto: string, clase = '', seg = 1.1) {
        elAviso.textContent = texto;
        elAviso.className = `juego-aviso visible ${clase}`;
        clearTimeout(borrarAviso);
        borrarAviso = window.setTimeout(() => { elAviso.className = 'juego-aviso'; }, seg * 1000);
      },
    },
    /** Texto chico que sale de un punto del mundo y sube ("+12"). */
    flotante(texto: string, x: number, y: number, z: number, clase = '') {
      proyectado.set(x, y, z).project(camara);
      const e = crear(`juego-flotante ${clase}`);
      e.textContent = texto;
      e.style.left = `${(proyectado.x * 0.5 + 0.5) * 100}%`;
      e.style.top = `${(-proyectado.y * 0.5 + 0.5) * 100}%`;
      e.addEventListener('animationend', () => e.remove());
    },
    alCuadro(f: (t: number, dt: number) => void) { tareas.push(f); },
    /** Escucha un evento y lo suelta solo al cerrar el juego. */
    escuchar<K extends keyof WindowEventMap>(donde: Window | HTMLElement, tipo: K, f: (e: WindowEventMap[K]) => void) {
      donde.addEventListener(tipo, f as EventListener);
      limpiezas.push(() => donde.removeEventListener(tipo, f as EventListener));
    },
    /** Rayo desde la cámara hacia donde apunta el toque. */
    apuntar(e: { clientX: number; clientY: number }) {
      const r = lienzo.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rayo.setFromCamera(ndc, camara);
      return rayo;
    },
    /** Punto del suelo (o de un plano a otra altura) bajo el toque. */
    enSuelo(e: { clientX: number; clientY: number }, altura = 0): THREE.Vector3 | null {
      suelo.constant = -altura;
      return api.apuntar(e).ray.intersectPlane(suelo, new THREE.Vector3());
    },
    /** Un modelo de Kenney llevado a la altura pedida y apoyado en el suelo. */
    async modelo(nombre: string, x: number, z: number, alto: number, giro = 0, paquete: Paquete = 'naturaleza'): Promise<THREE.Object3D> {
      const base = await cargar(paquete, nombre), o = base.clone();
      const caja3 = new THREE.Box3().setFromObject(base), escala = alto / Math.max(0.01, caja3.max.y - caja3.min.y);
      o.scale.setScalar(escala);
      o.position.set(x, -caja3.min.y * escala, z);
      o.rotation.y = giro;
      escena.add(o);
      return o;
    },
    /** Una pieza de un paquete apoyada en el suelo y centrada (los modelos de carreras traen su origen en una esquina).
     *  `tam` es su alto, o su lado horizontal más largo con `por: 'largo'`. No se agrega a la escena. */
    async objeto(paquete: Paquete, nombre: string, tam: number, por: 'alto' | 'largo' = 'alto'): Promise<THREE.Group> {
      const base = await cargar(paquete, nombre), o = base.clone(), caja3 = new THREE.Box3().setFromObject(base), g = new THREE.Group();
      const medida = caja3.getSize(new THREE.Vector3()), centro = caja3.getCenter(new THREE.Vector3());
      const s = tam / Math.max(0.01, por === 'alto' ? medida.y : Math.max(medida.x, medida.z));
      o.scale.setScalar(s);
      o.position.set(-centro.x * s, -caja3.min.y * s, -centro.z * s);
      g.add(o);
      return g;
    },
    /** Estallido de chispas o confeti desde un punto. */
    chispas(x: number, y: number, z: number, colores: string[], cuantas = 24, fuerza = 6) {
      if (!chispas) {
        chispas = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), new THREE.MeshBasicMaterial(), CHISPAS);
        chispas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        chispas.frustumCulled = false;
        unaChispa.scale.setScalar(0);
        unaChispa.updateMatrix();
        for (let i = 0; i < CHISPAS; i++) { chispas.setMatrixAt(i, unaChispa.matrix); chispas.setColorAt(i, colorChispa.set('#ffffff')); }
        escena.add(chispas);
      }
      for (let n = 0; n < cuantas; n++) {
        const i = siguiente++ % CHISPAS, a = Math.random() * 6.28, sube = 0.5 + Math.random();
        posChispa[i * 3] = x; posChispa[i * 3 + 1] = y; posChispa[i * 3 + 2] = z;
        velChispa[i * 3] = Math.cos(a) * fuerza * (0.4 + Math.random() * 0.6);
        velChispa[i * 3 + 1] = sube * fuerza;
        velChispa[i * 3 + 2] = Math.sin(a) * fuerza * (0.4 + Math.random() * 0.6);
        vidaChispa[i] = 0.8 + Math.random() * 0.7;
        chispas.setColorAt(i, colorChispa.set(colores[n % colores.length]));
      }
      chispas.instanceColor!.needsUpdate = true;
    },
    /** Sacudón de cámara (0,3 es suave; 1, un choque fuerte). */
    temblar(fuerza: number) { temblor = Math.max(temblor, fuerza); },
    /** Una pieza suelta de un paquete, centrada en su origen y con su lado más largo de tamaño `tam`. */
    async pieza(paquete: Paquete, nombre: string, tam: number): Promise<THREE.Group> {
      const base = await cargar(paquete, nombre), o = base.clone(), caja3 = new THREE.Box3().setFromObject(base), g = new THREE.Group();
      const medida = caja3.getSize(new THREE.Vector3()), centro = caja3.getCenter(new THREE.Vector3()), s = tam / Math.max(medida.x, medida.y, medida.z, 0.01);
      o.scale.setScalar(s);
      o.position.copy(centro).multiplyScalar(-s);
      g.add(o);
      return g;
    },
    /** El personaje del jugador llevado a la altura pedida, con sus animaciones andando. */
    async personaje(aspecto: Aspecto, alto: number): Promise<Kenney> {
      const k = await crearKenney(aspecto);
      k.grupo.updateMatrixWorld(true);
      const medida = new THREE.Box3();
      k.grupo.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && m.visible) { m.geometry.computeBoundingBox(); medida.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)); } });
      if (!medida.isEmpty()) k.grupo.scale.multiplyScalar(alto / Math.max(0.01, medida.max.y - medida.min.y));
      escena.add(k.grupo);
      animados.push(k.grupo);
      return k;
    },
    /** Una animación corta y de vuelta a estar quieto. */
    gesto(k: Kenney, nombre: string, seg = 0.8, luego = 'idle') {
      k.animar(nombre);
      clearTimeout(k.grupo.userData.vuelta);
      k.grupo.userData.vuelta = window.setTimeout(() => k.animar(luego), seg * 1000);
    },
    empezar() {
      try {
        ctx = new AudioContext();
        const master = (salida = ctx.createGain());
        master.gain.value = 0.6 * volumen();
        master.connect(ctx.destination);
        muestras = cargarMuestras(ctx);
        limpiezas.push(alCambiarVolumen(() => { master.gain.value = 0.6 * volumen(); }));
      } catch { ctx = null; }
      inicio = performance.now();
      corriendo = true;
    },
    /** Congela el reloj al terminar la partida; la escena se sigue viendo detrás del resultado. */
    detener() { fijo = reloj(); corriendo = false; },
    destruir() {
      vivo = false;
      observador.disconnect();
      clearTimeout(borrarAviso);
      for (const f of limpiezas) f();
      ctx?.close().catch(() => {});
      render.dispose();
      render.forceContextLoss();
      caja.replaceChildren();
    },
  };

  // Individual: al cambiar de pestaña el reloj se congela y sigue al volver (en un enfrentamiento corre igual)
  let pausado = false;
  const alCambiarVista = () => {
    if (!ajustesPartida.pausable) return;
    if (document.hidden && corriendo) { fijo = reloj(); corriendo = false; pausado = true; }
    else if (!document.hidden && pausado) { pausado = false; salto = fijo; inicio = previo = performance.now(); corriendo = true; api.hud.aviso('Pausa: sigues donde quedaste', '', 1.4); }
  };
  document.addEventListener('visibilitychange', alCambiarVista);
  limpiezas.push(() => document.removeEventListener('visibilitychange', alCambiarVista));

  // Para probar sin esperar: adelantar el reloj y dibujar un cuadro a mano
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__juego = { saltar: (s: number) => { salto += s; }, cuadro: paso, reloj, vista: alCambiarVista };
  return api;
}

/** Sombra redonda barata bajo una pieza (sin mapas de sombra, que pesan en una gráfica integrada). */
export function sombra(radio: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radio, 20), new THREE.MeshBasicMaterial({ color: '#7a5a2a', transparent: true, opacity: 0.28, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  return m;
}

export const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const mmss = (seg: number) => { const s = Math.max(0, Math.ceil(seg)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
