import * as THREE from 'three';
import { liberar } from './modelo';

/** Vista 3D de un solo personaje, que se gira arrastrando. */
export function crearVisor(contenedor: HTMLElement) {
  const render = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  render.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  contenedor.appendChild(render.domElement);
  render.domElement.style.touchAction = 'pan-y';
  render.domElement.style.cursor = 'grab';

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camara.position.set(0, 1.3, 6.2);
  camara.lookAt(0, 1.15, 0);
  escena.add(new THREE.HemisphereLight('#ffffff', '#5a6a9a', 1.6));
  const sol = new THREE.DirectionalLight('#ffffff', 1.7);
  sol.position.set(2, 4, 3);
  escena.add(sol);
  const piso = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18 }));
  piso.rotation.x = -Math.PI / 2;
  escena.add(piso);

  const pivote = new THREE.Group();
  escena.add(pivote);
  let modelo: THREE.Group | null = null;
  let giro = 0.4, arrastrando = false, ultimoX = 0, vivo = true;

  const dom = render.domElement;
  dom.addEventListener('pointerdown', (e) => { arrastrando = true; ultimoX = e.clientX; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointermove', (e) => { if (arrastrando) { giro += (e.clientX - ultimoX) * 0.012; ultimoX = e.clientX; } });
  const soltar = () => { arrastrando = false; };
  dom.addEventListener('pointerup', soltar);
  dom.addEventListener('pointercancel', soltar);

  const medir = () => {
    const w = contenedor.clientWidth, h = contenedor.clientHeight;
    if (!w || !h) return;
    render.setSize(w, h);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  };
  const observador = new ResizeObserver(medir);
  observador.observe(contenedor);
  medir();

  let anterior = 0;
  const paso = (ms: number) => {
    if (!arrastrando) giro += 0.004;
    pivote.rotation.y = giro;
    const dt = Math.min(0.1, (ms - anterior) / 1000);
    anterior = ms;
    // Un modelo con animaciones propias trae su función para avanzar; los demás solo rebotan un poco
    if (modelo?.userData.avanzar) modelo.userData.avanzar(dt);
    else if (modelo) modelo.position.y = Math.abs(Math.sin(ms / 500)) * 0.025;
    render.render(escena, camara);
  };
  const cuadro = (ms: number) => { if (!vivo) return; paso(ms); requestAnimationFrame(cuadro); };
  requestAnimationFrame(cuadro);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__paso = (g?: number) => { if (g !== undefined) giro = g; paso(0); }; // para capturas de prueba

  return {
    poner(nuevo: THREE.Group) {
      if (modelo) { pivote.remove(modelo); liberar(modelo); }
      modelo = nuevo;
      pivote.add(nuevo);
    },
    destruir() {
      vivo = false;
      observador.disconnect();
      if (modelo) liberar(modelo);
      render.dispose();
      dom.remove();
    },
  };
}
