import { useEffect, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { fechaChile, generador, horaChile, textoHora } from '../nucleo/azar';
import { supabase, useSesion, type Rol } from '../nucleo/supabase';
import { PREMIOS, limpiarVitrina, premio, refrescarVitrina, vitrinas, type Vitrina } from '../juegos/progreso';
import { crearBarrio } from './barrio';
import { normalizarPersonaje, personajeAleatorio, type Personaje } from '../personaje/catalogo';
import { crearKenney, type Kenney } from '../personaje/kenney';
import { liberar } from '../personaje/modelo';
import { CASAS, EVENTOS, casaDe, climaDe, conversacion, estadoDe, type Estado, type Pose } from './cerebro';
import { LETRAS, NOMBRES_LETRAS, crearMundo } from './mundo';
import { alCambiarVolumen, volumenMusica } from '../juegos/sonido';

interface Habitante {
  clave: string; rol: Rol; personaje: Personaje;
  grupo: THREE.Group; kenney: Kenney; nombre: THREE.Sprite; emote: THREE.Sprite | null; simbolo: string;
  accesorio: THREE.Object3D | null; pose: string; saludo: number; estado: Estado | null;
}
interface Ficha { clave: string; nombre: string; rol: Rol; personalidad: string; frase: string; haciendo: string }
interface Fila { clave: string; nombre: string; rol: Rol; haciendo: string }
interface Panel { sigla: string; titulo: string; lineas: string[]; lista?: { t: string; d?: string; ahora?: boolean }[]; enlace?: { texto: string; href: string } }

const NOMBRES_MUESTRA = ['Coco', 'Brisa', 'Tiki', 'Nube', 'Lava', 'Marea', 'Faro', 'Palma', 'Sol', 'Luna', 'Arena', 'Bambú'];
const CLIMAS = ['Despejado', 'Nublado', 'Lluvia'];
const ESCALA = 1.25; // en la isla los personajes van más grandes para distinguirse desde lejos
const PI = Math.PI, PI_2 = Math.PI / 2;
const CALIDAD = 'susto.calidad';

const INFO: Record<string, Panel> = {
  tabla: { sigla: 'Plaza', titulo: 'Tabla de posiciones', lineas: ['Aquí se suman los puntos de la liga: solo cuentan los duelos oficiales de los cruces.', 'Cada jornada vale más que la anterior: ×1, ×1,25, ×1,5 y ×2.'], enlace: { texto: 'Ver la tabla de posiciones', href: '#/juegos/posiciones' } },
  ruleta: { sigla: 'Plaza', titulo: 'La ruleta de juegos', lineas: ['El portal de juegos tiene tres modos: individual, uno contra uno y equipo contra equipo.', 'En individual, cada día hay un desafío igual para todos. En los versus, cada lado juega el mismo desafío a su hora y con un solo intento.'], enlace: { texto: 'Ir al portal de juegos', href: '#/juegos' } },
  arena: { sigla: 'Montaña', titulo: 'El portón de la Arena', lineas: ['Está sellado hasta que termine la liga (28 de noviembre); la fecha de la final se anuncia por Discord.', 'Entran 12: los participantes de los 4 mejores equipos (el staff no entra) y los mejores puntajes personales.', 'Ahí adentro se definen los siete premios. Cada punto que ganes mejora lo que recibirás al entrar.'] },
  fuente: { sigla: 'Plaza', titulo: 'La fuente', lineas: ['El centro de ValRigo. Dicen que si tiras una moneda y pides un cinco estrellas, a veces funciona.'] },
  escenario: { sigla: 'Plaza', titulo: 'El escenario', lineas: ['Aquí se canta y se baila. Al cerrar cada jornada, aquí se celebra a los líderes de la semana.'] },
  atril: { sigla: 'Plaza', titulo: 'El atril de Rigo', lineas: ['Rigo pinta aquí el retrato del líder de cada semana.', 'Uno de los siete premios del torneo es una comisión suya.'] },
  alcaldia: { sigla: 'Pueblo', titulo: 'La Alcaldía', lineas: ['Desde aquí Vale anuncia las jornadas. El reloj de la torre marca la hora real de Chile.', 'Las seis bendiciones lunares del torneo son regalo suyo.'] },
  cafe: { sigla: 'Pueblo', titulo: 'La cafetería', lineas: ['El lugar favorito de los glotones, y donde se arman los mejores chismes de la isla.'] },
  mercado: { sigla: 'Pueblo', titulo: 'El mercado', lineas: ['Frutas, dulces y cosas que nadie necesita. Más adelante se podrá comprar aquí con la moneda de la isla.'] },
  faro: { sigla: 'Acantilado oeste', titulo: 'El faro', lineas: ['El punto más alto de la costa. De noche su luz barre toda la isla.', 'Los soñadores y los tímidos suben seguido.'], enlace: { texto: 'Jugar Luces del Faro', href: '#/juegos/luces' } },
  molino: { sigla: 'Colina este', titulo: 'El molino', lineas: ['Gira siempre, haya viento o no. Desde su colina se ve el muelle y la granja.'] },
  granja: { sigla: 'Noreste', titulo: 'La granja', lineas: ['Granero, huerto y seis ovejas que no le temen a nadie.'] },
  camping: { sigla: 'Sureste', titulo: 'El campamento', lineas: ['Dos carpas y una fogata chica. El mejor lugar para ver las estrellas.'] },
  muelle: { sigla: 'Costa este', titulo: 'El muelle', lineas: ['Aquí se pesca con paciencia. Si miras un rato, verás saltar a los peces.'] },
  lago: { sigla: 'Este', titulo: 'El lago', lineas: ['Agua quieta, un islote con su árbol y un embarcadero. Los tranquilos vienen a pescar.'] },
  ruinas: { sigla: 'Bosque del noroeste', titulo: 'Las ruinas', lineas: ['Columnas rotas y una cabeza de piedra que nadie sabe quién talló.', 'Dicen que son más antiguas que el portón de la arena.'] },
  barrio: { sigla: 'Suroeste', titulo: 'Barrio de los Participantes', lineas: ['Cada inscrito tiene aquí su casita, con su nombre, su título y su nivel del pase de temporada.', 'Los adornos (calabazas, farolas, fantasma mascota, caldero, murciélagos, trofeo y hasta una torre) se ganan subiendo de nivel en el pase.', 'Toca una casa para ver de quién es.'], enlace: { texto: 'Ver mi pase de temporada', href: '#/progreso/pase' } },
  cementerio: { sigla: 'Noreste', titulo: 'El cementerio', lineas: ['De día no pasa nada. De noche aparecen tres fantasmas y los habitantes vienen a contar historias.', 'Será el centro de la Noche de Brujas del 30 de octubre.'] },
  caleta: { sigla: 'Costa oeste', titulo: 'La caleta', lineas: ['Dos chozas sobre pilotes, pescado secándose al sol y un bote azul.'], enlace: { texto: 'Jugar Mata-Cangrejos', href: '#/juegos/cangrejos' } },
};

function etiqueta(texto: string, fondo: string, color: string, alto: number): THREE.Sprite {
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  const fuente = '800 40px Nunito, sans-serif';
  g.font = fuente;
  c.width = Math.ceil(g.measureText(texto).width) + 44;
  c.height = 64;
  g.font = fuente;
  if (fondo) { g.fillStyle = fondo; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 24); g.fill(); }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(texto, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set((alto * c.width) / c.height, alto, 1);
  s.renderOrder = 10;
  return s;
}

function quitarSprite(escena: THREE.Scene, s: THREE.Sprite | null) {
  if (!s) return;
  escena.remove(s);
  s.material.map?.dispose();
  s.material.dispose();
}

/** Objeto que acompaña a una actividad: diario, caña o micrófono. */
function accesorioDe(pose: string): THREE.Object3D | null {
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const g = new THREE.Group();
  if (pose === 'leer') {
    const hoja = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.02), mat('#f3ecdc'));
    hoja.position.set(0, 0.78, 0.4); hoja.rotation.x = -0.5;
    g.add(hoja);
    for (let i = 0; i < 4; i++) { const linea = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.025), mat('#8a94a8')); linea.position.set(0, 0.68 + i * 0.065, 0.36 + i * 0.035); linea.rotation.x = -0.5; g.add(linea); }
  } else if (pose === 'pescar') {
    const vara = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 2.1, 6), mat('#7a5230'));
    vara.position.set(0.3, 1.2, 0.95); vara.rotation.x = 0.95;
    const hilo = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2.3, 4), mat('#f3ecdc'));
    hilo.position.set(0.3, 0.65, 1.8);
    g.add(vara, hilo);
  } else if (pose === 'cantar') {
    const mango = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), mat('#1f1b2b'));
    mango.position.set(0.1, 1.08, 0.36); mango.rotation.x = 0.5;
    const bola = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mat('#8a94a8'));
    bola.position.set(0.1, 1.18, 0.31);
    g.add(mango, bola);
  } else return null;
  g.traverse((o) => { o.castShadow = true; });
  g.scale.setScalar(0.55); // las medidas de arriba son para un cuerpo de 1,8; los modelos miden 1
  return g;
}

/** Postura del cuerpo según la actividad. Devuelve cuánto subir o bajar al personaje. */
function posar(h: Habitante, e: Estado, seg: number): number {
  const f = seg + h.grupo.id, k = h.kenney;
  h.grupo.rotation.set(0, e.rumbo, 0);
  if (e.caminando) { k.animar('walk'); return 0; }
  if (seg < h.saludo) { k.animar('emote-yes'); return 0; }
  const pose: Pose = e.pose;
  // Las animaciones son las del paquete; nadar, cantar y bailar no vienen, así que se arman con las más parecidas
  switch (pose) {
    case 'sentado': k.animar('sit'); return e.lugar.id === 'banco' ? 0.5 : e.lugar.id === 'fogata' ? 0.3 : 0;
    case 'acostado': k.animar('die', true); return 0.05;
    case 'nadar': k.animar('sprint'); h.grupo.rotation.x = 1.2; return 0.9 + Math.sin(f * 2) * 0.06;
    case 'cantar': k.animar('emote-yes'); return Math.abs(Math.sin(f * 4.5)) * 0.15;
    case 'bailar': k.animar('jump'); h.grupo.rotation.y = e.rumbo + Math.sin(f * 3) * 0.4; return 0;
    case 'leer': k.animar('holding-both'); return 0;
    case 'pescar': k.animar('holding-right'); return 0;
    default: k.animar('idle'); return 0;
  }
}

async function cargarHabitantes(): Promise<{ lista: { clave: string; rol: Rol; personaje: Personaje }[]; muestra: boolean }> {
  const { data } = await supabase.from('personajes').select('perfil_id,nombre,apariencia,personalidad,voz,frase,perfiles(rol)');
  if (data && data.length) {
    return {
      muestra: false,
      lista: data.map((fila) => {
        const rel = fila.perfiles as unknown as { rol: Rol } | { rol: Rol }[] | null;
        const rol = (Array.isArray(rel) ? rel[0]?.rol : rel?.rol) ?? 'jugador';
        return { clave: fila.perfil_id as string, rol, personaje: normalizarPersonaje(fila) };
      }),
    };
  }
  // Sin inscritos todavía: la isla queda vacía. Solo en pruebas (?muestra=1) se llena con personajes inventados.
  if (!new URLSearchParams(location.search).has('muestra')) return { muestra: false, lista: [] };
  return {
    muestra: true,
    lista: NOMBRES_MUESTRA.map((nombre, i) => ({ clave: `muestra-${i}`, rol: 'jugador' as Rol, personaje: personajeAleatorio(generador(`muestra-${i}`), nombre) })),
  };
}

const diasHasta = (fecha: string, hoy: string) => Math.round((Date.parse(fecha) - Date.parse(hoy)) / 86400000);
function proximoEvento(hoy: string): string {
  const e = EVENTOS.find((x) => x.fecha >= hoy);
  if (!e) return 'El torneo terminó. ¡Gracias por jugar!';
  if (e.porAnunciar) return `Lo que viene: ${e.nombre} (fecha por anunciar)`;
  const dias = diasHasta(e.fecha, hoy);
  return dias === 0 ? `Hoy: ${e.nombre}` : dias === 1 ? `Mañana: ${e.nombre}` : `Faltan ${dias} días para ${e.nombre}`;
}
const fechaLarga = (fecha: string) => new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

// baja: sin sombras · media: sombras livianas · alta: sombras nítidas · ultra: además oclusión ambiental y contorno
const NIVELES = ['baja', 'media', 'alta', 'ultra'];
const AJUSTES = [
  { pixeles: 0.8, sombras: 0, cada: 0 }, // un poco menos de nitidez: en tarjetas de video integradas es lo que más alivia
  { pixeles: 1, sombras: 1024, cada: 3 },
  { pixeles: 1.5, sombras: 2048, cada: 2 },
  { pixeles: 2, sombras: 2048, cada: 1 },
];
function calidadAutomatica(): boolean {
  try { const v = localStorage.getItem(CALIDAD + '2'); return !v || v === 'auto'; } catch { return true; }
}
function calidadInicial(): number {
  try { const v = NIVELES.indexOf(localStorage.getItem(CALIDAD + '2') ?? ''); if (v >= 0) return v; } catch { /* sin almacenamiento */ }
  return window.innerWidth >= 760 && (navigator.hardwareConcurrency ?? 4) > 4 ? 1 : 0; // media en PC, baja en celular
}

export function Isla() {
  const sesion = useSesion();
  // Quien entra deja al día su nivel y logros en la vitrina: así su casa del barrio se ve como va
  useEffect(() => { if (sesion.usuarioId) refrescarVitrina(sesion.usuarioId).catch(() => {}); }, [sesion.usuarioId]);
  const caja = useRef<HTMLDivElement>(null);
  const mando = useRef<{ seguir(clave: string): void; foto(): string; fichaDe(clave: string): void; lista(): Fila[]; calidad(nivel: number): void } | null>(null);
  // Calidad automática: baja sola si el equipo no alcanza ~30 cuadros por segundo y sube si sobra (sin pasar de alta)
  const autoRef = useRef(calidadAutomatica());
  const [auto, setAuto] = useState(autoRef.current);
  const sonido = useRef<{ ctx: AudioContext; volumen: GainNode } | null>(null);
  const [hud, setHud] = useState({ hora: '', cantidad: 0, muestra: false, listo: false, clima: 0, evento: '' });
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [siguiendo, setSiguiendo] = useState('');
  const [imagen, setImagen] = useState('');
  const [conSonido, setConSonido] = useState(false);
  const [menu, setMenu] = useState(false); // en el celular los botones se juntan en un menú
  const [nivel, setNivel] = useState(calidadInicial);
  const seguido = useRef('');
  const hablar = useRef(false);
  seguido.current = siguiendo;
  hablar.current = conSonido;

  useEffect(() => {
    const cont = caja.current!;
    const consulta = new URLSearchParams(location.search);
    const parametro = Number(consulta.get('hora'));
    const horaFija = consulta.has('hora') && Number.isFinite(parametro) ? parametro : null; // ?hora=22 para probar la noche
    const hoy = fechaChile(Date.now());
    const clima = (consulta.has('clima') ? Number(consulta.get('clima')) : climaDe(hoy)) as 0 | 1 | 2;

    const render = new THREE.WebGLRenderer({ antialias: true });
    render.toneMapping = THREE.ACESFilmicToneMapping;
    render.toneMappingExposure = 1.05;
    render.shadowMap.enabled = true;
    render.shadowMap.type = THREE.PCFSoftShadowMap;
    cont.appendChild(render.domElement);
    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(42, 1, 1, 2200);
    camara.position.set(0, 70, 150);
    const control = new OrbitControls(camara, render.domElement);
    control.target.set(0, 3, 2);
    control.enablePan = false;
    control.enableDamping = true;
    control.minDistance = 7;
    control.maxDistance = 470;
    control.maxPolarAngle = PI / 2.08;
    control.autoRotate = true; // la cámara gira siempre; solo se detiene mientras la arrastras
    control.autoRotateSpeed = 0.45;

    const mundo = crearMundo(escena, clima);
    const habitantes: Habitante[] = [];
    let barrio: ReturnType<typeof crearBarrio> | null = null, vits = new Map<string, Vitrina>();
    let globo: THREE.Sprite | null = null, textoGlobo = '', vivo = true, ultimoHud = 0;
    setHud((v) => ({ ...v, clima, evento: proximoEvento(hoy) }));

    // Marcas de selección: un aro bajo el personaje seguido y un rombo sobre lo que apunta el mouse
    const aro = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 8, 36), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.9, depthWrite: false }));
    aro.rotation.x = PI_2;
    const rombo = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshBasicMaterial({ color: '#ffe08a' }));
    aro.visible = rombo.visible = false;
    escena.add(aro, rombo);
    const caja3 = new THREE.Box3();

    // Post-proceso (solo en calidad ultra): oclusión ambiental y contorno de lo seleccionado
    let composer: EffectComposer | null = null, contorno: OutlinePass | null = null, nivelActual = 0, cuadros = 0;
    const aplicarCalidad = (n: number) => {
      nivelActual = n;
      render.setPixelRatio(Math.min(window.devicePixelRatio, AJUSTES[n].pixeles));
      render.shadowMap.enabled = n > 0;
      mundo.calidad(n > 0, AJUSTES[n].sombras || 1024);
      escena.traverse((o) => { const mat = (o as THREE.Mesh).material as THREE.Material | undefined; if (mat && !Array.isArray(mat)) mat.needsUpdate = true; });
      composer?.dispose();
      composer = null; contorno = null;
      if (n === 3) {
        try {
          const w = Math.max(1, cont.clientWidth), h = Math.max(1, cont.clientHeight);
          composer = new EffectComposer(render, new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType }));
          composer.addPass(new RenderPass(escena, camara));
          const ao = new GTAOPass(escena, camara, w, h);
          ao.blendIntensity = 0.85;
          ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 12 });
          composer.addPass(ao);
          contorno = new OutlinePass(new THREE.Vector2(w, h), escena, camara);
          contorno.edgeStrength = 4; contorno.edgeThickness = 1.6; contorno.edgeGlow = 0.3;
          contorno.visibleEdgeColor.set('#ffe08a'); contorno.hiddenEdgeColor.set('#7a5a20');
          composer.addPass(contorno);
          composer.addPass(new OutputPass());
        } catch { composer = null; contorno = null; } // si el equipo no lo soporta, se dibuja sin post-proceso
      }
      medir();
    };

    cargarHabitantes().then(async ({ lista, muestra }) => {
      const armados = await Promise.all(lista.map((h) => crearKenney(h.personaje.apariencia)));
      if (!vivo) return;
      for (const [i, h] of lista.entries()) {
        const kenney = armados[i], grupo = kenney.grupo;
        grupo.scale.multiplyScalar(ESCALA);
        grupo.rotation.order = 'YXZ';
        grupo.userData.clave = h.clave;
        const guardian = h.rol === 'guardian';
        const nombre = etiqueta(h.personaje.nombre || 'Sin nombre', guardian ? '#ffe08a' : 'rgba(20,32,58,.82)', guardian ? '#14203a' : '#f3ecdc', 0.6);
        if (guardian) {
          const aura = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 28), new THREE.MeshBasicMaterial({ color: '#ffe08a' }));
          aura.rotation.x = PI_2;
          aura.scale.setScalar(0.6);
          aura.position.y = 1.22;
          grupo.add(aura);
        }
        escena.add(grupo, nombre);
        habitantes.push({ ...h, grupo, kenney, nombre, emote: null, simbolo: '', accesorio: null, pose: '', saludo: 0, estado: null });
      }
      setHud((v) => ({ ...v, cantidad: lista.length, muestra, listo: true }));
      // El barrio: una casa por inscrito, con lo que lleva puesto del pase (en la muestra, adornos al azar)
      vits = await vitrinas().catch(() => new Map<string, Vitrina>());
      if (muestra || (import.meta.env.DEV && new URLSearchParams(location.search).has('adornos'))) lista.forEach((h, i) => vits.set(h.clave, limpiarVitrina({ nivel: 4 + ((i * 7) % 27), logros: (i * 11) % 60, titulo: PREMIOS.filter((x) => x.tipo === 'titulo')[i % 10].id, marco: PREMIOS.filter((x) => x.tipo === 'marco')[i % 7].id, deco: PREMIOS.filter((x) => x.tipo === 'deco' && (x.nivel * (i + 3)) % 4 !== 0).map((x) => x.id) })));
      if (vivo) barrio = crearBarrio(escena, lista.map((h) => ({ clave: h.clave, nombre: h.personaje.nombre, vitrina: vits.get(h.clave) ?? null })));
    }).catch(() => setHud((v) => ({ ...v, listo: true })));

    function medir() {
      const w = cont.clientWidth, h = cont.clientHeight;
      if (!w || !h) return;
      render.setSize(w, h);
      composer?.setSize(w, h);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
    }
    const observador = new ResizeObserver(medir);
    observador.observe(cont);
    aplicarCalidad(calidadInicial());

    const haciendo = (e: Estado) => (e.caminando ? `yendo a: ${e.lugar.verbo}` : e.lugar.verbo);
    const filasAhora = (): Fila[] => habitantes.map((h) => ({ clave: h.clave, nombre: h.personaje.nombre || 'Sin nombre', rol: h.rol, haciendo: h.estado ? haciendo(h.estado) : '' }));
    const irA = (h: Habitante) => {
      const p = h.grupo.position;
      if (camara.position.distanceTo(p) > 45) camara.position.set(p.x + 8, p.y + 9, p.z + 16);
      control.target.set(p.x, p.y + 1.6, p.z);
    };
    const abrirFicha = (h: Habitante) => {
      const e = estadoDe(h.clave, h.personaje.personalidad, Date.now());
      setPanel(null);
      setFicha({ clave: h.clave, nombre: h.personaje.nombre || 'Sin nombre', rol: h.rol, personalidad: h.personaje.personalidad, frase: h.personaje.frase, haciendo: haciendo(e) });
      setSiguiendo(h.clave);
      irA(h);
      h.saludo = Date.now() / 1000 + 2.2;
      if (hablar.current && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(h.personaje.frase || `Hola, soy ${h.personaje.nombre}`);
        u.lang = 'es-CL'; u.pitch = 0.3 + h.personaje.voz * 1.5; u.rate = 1.05;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      }
    };

    /** Contenido del panel que se abre al tocar un edificio o un tablón. */
    const infoDe = (id: string): Panel | null => {
      if (id === 'eventos') {
        const proximo = EVENTOS.find((x) => x.fecha >= hoy);
        return { sigla: 'Plaza', titulo: 'Tablón de eventos', lineas: ['La liga tiene 11 cruces de equipos, dos por semana (miércoles a sábado y domingo a martes), en 4 jornadas.'], lista: EVENTOS.map((e) => ({ t: `${e.porAnunciar ? 'Fecha por anunciar' : fechaLarga(e.fecha)} · ${e.nombre}`, d: e.detalle, ahora: e === proximo })) };
      }
      if (id === 'diario') {
        const despiertos = habitantes.filter((h) => h.estado && h.estado.lugar.id !== 'dormir');
        const notas = despiertos.slice(0, 4).map((h) => `${h.personaje.nombre} fue visto ${haciendo(h.estado!)}.`);
        return { sigla: `Edición del ${fechaLarga(hoy)}`, titulo: 'El Diario de ValRigo', lineas: [`Hoy el día está ${CLIMAS[clima].toLowerCase()} y en la isla viven ${habitantes.length} habitantes.`, `${proximoEvento(hoy)}.`, 'El portón de la arena sigue sellado. Vecinos aseguran haber oído ruidos de noche.', ...notas, 'Cuando empiecen las jornadas, aquí saldrán los resultados, las rachas y los récords.'] };
      }
      if (id.startsWith('hogar-')) {
        const clave = id.slice(6), h = habitantes.find((x) => x.clave === clave), v = vits.get(clave), t = premio('titulo', v?.titulo);
        const adornos = (v?.deco ?? []).map((d) => premio('deco', d)).filter(Boolean).map((d) => `${d!.icono} ${d!.nombre}`);
        return { sigla: 'Barrio de los Participantes', titulo: `Casa de ${h?.personaje.nombre || 'alguien'}`, lineas: [t ? `${t.icono} ${t.nombre}` : 'Todavía sin título del pase.', `Nivel ${v?.nivel ?? 1} del pase · ${v?.logros ?? 0} logros.`, adornos.length ? 'Adornos de la casa:' : 'Sin adornos todavía: se ganan en el pase de temporada.'], lista: adornos.map((t) => ({ t })), enlace: clave.startsWith('muestra') ? undefined : { texto: 'Ver su perfil', href: `#/perfil/${clave}` } };
      }
      if (id.startsWith('casa-')) {
        const i = Number(id.slice(5));
        const vecinos = habitantes.filter((h) => casaDe(h.clave) === i);
        return {
          sigla: `Casa club ${LETRAS[i]}`, titulo: `Casa ${NOMBRES_LETRAS[i]}`,
          lineas: [`Está ${CASAS[i].donde}.`, 'El nombre y el elemento definitivos de esta casa todavía no se anuncian: la letra es provisoria.', 'Integrantes oficiales: se sortean el viernes 16 de octubre, tres por casa.', vecinos.length ? 'Mientras tanto, aquí duermen:' : 'Por ahora nadie duerme aquí.'],
          lista: vecinos.map((h) => ({ t: h.personaje.nombre || 'Sin nombre', d: h.personaje.personalidad })),
        };
      }
      return INFO[id] ?? null;
    };

    // Toques y mouse: personajes primero, luego edificios y tablones
    const rayo = new THREE.Raycaster(), puntero = new THREE.Vector2();
    const apuntar = (e: PointerEvent) => {
      const r = render.domElement.getBoundingClientRect();
      puntero.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rayo.setFromCamera(puntero, camara);
    };
    const raizCon = (o: THREE.Object3D | null, campo: string): THREE.Object3D | null => { while (o && !o.userData[campo]) o = o.parent; return o; };
    let abajo = { x: 0, y: 0 }, sobre: THREE.Object3D | null = null, ultimoMov = 0;
    const alBajar = (e: PointerEvent) => { abajo = { x: e.clientX, y: e.clientY }; control.autoRotate = false; };
    const alSubir = (e: PointerEvent) => {
      control.autoRotate = true;
      if (Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y) > 6) return;
      apuntar(e);
      const persona = raizCon(rayo.intersectObjects(habitantes.map((h) => h.grupo), true)[0]?.object ?? null, 'clave');
      const h = persona && habitantes.find((x) => x.clave === persona.userData.clave);
      if (h) return abrirFicha(h);
      const cosa = raizCon(rayo.intersectObjects([...mundo.interactivos, ...(barrio?.interactivos ?? [])], true)[0]?.object ?? null, 'info');
      setFicha(null);
      setPanel(cosa ? infoDe(cosa.userData.info) : null);
    };
    const alMover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons || performance.now() - ultimoMov < 90) return;
      ultimoMov = performance.now();
      apuntar(e);
      sobre = raizCon(rayo.intersectObjects(habitantes.map((h) => h.grupo), true)[0]?.object ?? null, 'clave')
        ?? raizCon(rayo.intersectObjects([...mundo.interactivos, ...(barrio?.interactivos ?? [])], true)[0]?.object ?? null, 'info');
      render.domElement.style.cursor = sobre ? 'pointer' : 'grab';
    };
    render.domElement.addEventListener('pointerdown', alBajar);
    render.domElement.addEventListener('pointerup', alSubir);
    render.domElement.addEventListener('pointercancel', () => { control.autoRotate = true; });
    render.domElement.addEventListener('pointermove', alMover);

    let cuadroAnterior = Date.now();
    const paso = () => {
      const ahora = Date.now(), seg = ahora / 1000, dt = Math.min(0.1, (ahora - cuadroAnterior) / 1000);
      cuadroAnterior = ahora;
      const hora = horaFija ?? horaChile(ahora);
      barrio?.actualizar(seg, mundo.actualizar(hora, ahora));

      for (const h of habitantes) {
        const e = estadoDe(h.clave, h.personaje.personalidad, ahora), g = h.grupo;
        h.estado = e;
        const extra = posar(h, e, seg);
        g.userData.avanzar(dt);
        const nadando = !e.caminando && e.pose === 'nadar', echado = !e.caminando && e.pose === 'acostado';
        g.position.set(e.x, (nadando ? -0.75 : e.y) + extra, e.z);

        // Accesorio y emote cambian solo cuando cambia la actividad
        const pose = e.caminando ? 'caminar' : e.pose;
        if (pose !== h.pose) {
          h.pose = pose;
          if (h.accesorio) { g.remove(h.accesorio); liberar(h.accesorio); }
          h.accesorio = h.personaje.apariencia.objeto === 0 || pose === 'leer' ? accesorioDe(pose) : null;
          if (h.accesorio) g.add(h.accesorio);
        }
        const simbolo = e.caminando ? '' : e.lugar.emote ?? '';
        if (simbolo !== h.simbolo) {
          quitarSprite(escena, h.emote);
          h.emote = simbolo ? etiqueta(simbolo, '', simbolo === 'Zzz' ? '#bfe6ff' : '#ffe08a', 0.8) : null;
          if (h.emote) escena.add(h.emote);
          h.simbolo = simbolo;
        }
        const tope = echado ? e.y + 1.5 : nadando ? 1.5 : e.y + extra + 3.25;
        h.nombre.position.set(e.x, tope, e.z);
        if (h.emote) h.emote.position.set(e.x + 0.5, tope + 0.75 + Math.sin(seg * 2 + g.id) * 0.12, e.z);
      }

      const habla = conversacion(ahora, habitantes.map((h) => ({ nombre: h.personaje.nombre, frase: h.personaje.frase, lugar: h.estado?.lugar.id ?? '', despierto: h.estado?.lugar.id !== 'dormir' })));
      if (habla) {
        if (habla.texto !== textoGlobo) {
          quitarSprite(escena, globo);
          globo = etiqueta(habla.texto, '#f3ecdc', '#14203a', 0.78);
          textoGlobo = habla.texto;
          escena.add(globo);
        }
        const quien = habitantes[habla.indice], p = quien.nombre.position;
        globo!.position.set(p.x, p.y + 0.9, p.z);
        globo!.visible = true;
        // El habitante quieto más cercano se gira a escuchar
        let oyente: Habitante | null = null, cerca = 5;
        for (const h of habitantes) {
          if (h === quien || !h.estado || h.estado.caminando || h.estado.pose !== 'pie') continue;
          const d = Math.hypot(h.estado.x - quien.estado!.x, h.estado.z - quien.estado!.z);
          if (d < cerca) { cerca = d; oyente = h; }
        }
        if (oyente) oyente.grupo.rotation.y = Math.atan2(quien.estado!.x - oyente.estado!.x, quien.estado!.z - oyente.estado!.z);
      } else if (globo) globo.visible = false;

      const meta = seguido.current ? habitantes.find((h) => h.clave === seguido.current) : undefined;
      if (meta) control.target.lerp(new THREE.Vector3(meta.grupo.position.x, meta.grupo.position.y + 1.6, meta.grupo.position.z), 0.08);
      if (contorno) contorno.selectedObjects = [sobre, meta?.grupo].filter((o): o is THREE.Object3D => !!o);
      aro.visible = !!meta?.estado && meta.estado.y > 0.1;
      if (meta?.estado) { aro.position.set(meta.estado.x, meta.estado.y + 0.1, meta.estado.z); aro.scale.setScalar(1 + Math.sin(seg * 4) * 0.08); }
      rombo.visible = !!sobre && !sobre.userData.clave;
      if (rombo.visible) {
        if (sobre!.userData.alto === undefined) { caja3.setFromObject(sobre!); sobre!.userData.alto = caja3.max.y; sobre!.userData.cx = (caja3.min.x + caja3.max.x) / 2; sobre!.userData.cz = (caja3.min.z + caja3.max.z) / 2; }
        rombo.position.set(sobre!.userData.cx, sobre!.userData.alto + 1.4 + Math.sin(seg * 3) * 0.25, sobre!.userData.cz);
        rombo.rotation.y = seg * 2;
      }

      if (ahora - ultimoHud > 1000) { ultimoHud = ahora; setHud((v) => ({ ...v, hora: textoHora(hora) })); }
      control.update();
      if (nivelActual > 0 && cuadros++ % AJUSTES[nivelActual].cada === 0) mundo.refrescarSombras();
      if (composer) composer.render(); else render.render(escena, camara);
    };
    let previo = performance.now(), promedio = 16, malos = 0, buenos = 0, cuenta = 0;
    const medidor = new URLSearchParams(location.search).has('medir') ? document.createElement('div') : null;
    if (medidor) { medidor.className = 'isla-medidor'; cont.appendChild(medidor); }
    const cronometrar = (ahora: number) => {
      const ms = ahora - previo;
      previo = ahora;
      if (ms > 250) return; // pestaña recién vuelta a la vista: no cuenta
      promedio += (ms - promedio) * 0.05;
      if (medidor && cuenta++ % 15 === 0) medidor.textContent = `${Math.round(1000 / promedio)} cuadros/s · ${promedio.toFixed(1)} ms por cuadro · ${render.info.render.calls} dibujos · ${Math.round(render.info.render.triangles / 1000)} mil triángulos · calidad ${NIVELES[nivelActual]}${autoRef.current ? ' (automática)' : ''}`;
      if (!autoRef.current) return;
      if (promedio > 34) { malos++; buenos = 0; } else if (promedio < 15) { buenos++; malos = 0; } else malos = buenos = 0;
      const cambiar = (n: number) => { malos = buenos = 0; aplicarCalidad(n); setNivel(n); };
      if (malos > 90 && nivelActual > 0) cambiar(nivelActual - 1);
      else if (buenos > 480 && nivelActual < 2) cambiar(nivelActual + 1);
    };
    const cuadro = (ahora: number) => { if (!vivo) return; cronometrar(ahora); paso(); requestAnimationFrame(cuadro); };
    requestAnimationFrame(cuadro);
    if (import.meta.env.DEV) Object.assign(window, { __paso: paso, __camara: camara, __control: control, __calidad: aplicarCalidad, __render: render, __escena: escena }); // para capturas de prueba

    mando.current = {
      seguir(clave) { const h = habitantes.find((x) => x.clave === clave); if (h) irA(h); },
      foto() { paso(); return render.domElement.toDataURL('image/png'); },
      fichaDe(clave) { const h = habitantes.find((x) => x.clave === clave); if (h) abrirFicha(h); },
      lista: filasAhora,
      calidad: aplicarCalidad,
    };
    const refrescarLista = setInterval(() => setFilas((actual) => actual && filasAhora()), 2000);

    return () => {
      vivo = false;
      clearInterval(refrescarLista);
      observador.disconnect();
      control.dispose();
      composer?.dispose();
      mando.current = null;
      liberar(escena);
      render.dispose();
      render.domElement.remove();
    };
  }, []);

  // Sonido de olas hecho con ruido filtrado; se detiene al salir de la isla
  const dejarDeOir = useRef<(() => void) | null>(null);
  useEffect(() => () => { dejarDeOir.current?.(); sonido.current?.ctx.close(); if ('speechSynthesis' in window) speechSynthesis.cancel(); }, []);
  const alternarSonido = () => {
    if (!sonido.current) {
      const ctx = new AudioContext(), ruido = ctx.createBufferSource(), datos = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), canal = datos.getChannelData(0);
      for (let i = 0; i < canal.length; i++) canal[i] = Math.random() * 2 - 1;
      ruido.buffer = datos; ruido.loop = true;
      const filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 520;
      const marea = ctx.createGain(), vaiven = ctx.createOscillator(), fuerza = ctx.createGain(), volumen = ctx.createGain();
      marea.gain.value = 0.5; vaiven.frequency.value = 0.13; fuerza.gain.value = 0.35; volumen.gain.value = 0;
      vaiven.connect(fuerza).connect(marea.gain);
      ruido.connect(filtro).connect(marea).connect(volumen).connect(ctx.destination);
      ruido.start(); vaiven.start();
      // Música: un tema tranquilo que se repite sin corte ("Calm Loop" de wipics, dominio público), con las olas muy bajas de fondo
      const musica = ctx.createGain();
      musica.gain.value = volumenMusica();
      musica.connect(ctx.destination);
      dejarDeOir.current = alCambiarVolumen(() => musica.gain.setTargetAtTime(volumenMusica(), ctx.currentTime, 0.2));
      fetch(`${import.meta.env.BASE_URL}musica/calma.mp3`).then((r) => r.arrayBuffer()).then((datosAudio) => ctx.decodeAudioData(datosAudio)).then((tema) => {
        const fuente = ctx.createBufferSource();
        fuente.buffer = tema; fuente.loop = true;
        fuente.connect(musica);
        fuente.start();
      }).catch(() => undefined);
      sonido.current = { ctx, volumen };
    }
    const prender = !conSonido;
    if (prender) sonido.current.ctx.resume(); else sonido.current.ctx.suspend();
    sonido.current.volumen.gain.setTargetAtTime(prender ? 0.07 : 0, sonido.current.ctx.currentTime, 0.4);
    setConSonido(prender);
  };
  const elegirCalidad = (valor: string) => {
    const automatica = valor === 'auto';
    autoRef.current = automatica;
    setAuto(automatica);
    try { localStorage.setItem(CALIDAD + '2', automatica ? 'auto' : NIVELES[Number(valor)]); } catch { /* sin almacenamiento */ }
    if (!automatica) { setNivel(Number(valor)); mando.current?.calidad(Number(valor)); }
  };

  const seguir = (clave: string) => { setSiguiendo(clave); if (clave) mando.current?.seguir(clave); };
  const miClave = sesion.usuarioId ?? '';

  return (
    <div class="isla">
      <div class="isla-lienzo" ref={caja} />
      <div class="isla-hud">
        <span class="sigla">Isla ValRigo</span>
        <span>{hud.hora && `${hud.hora} · ${CLIMAS[hud.clima]}`}{hud.listo && ` · ${hud.cantidad} habitantes`}</span>
        <span class="evento">{hud.evento}</span>
        {hud.muestra && <span class="tenue chico">Habitantes de muestra, solo para pruebas.</span>}
        {hud.listo && hud.cantidad === 0 && <span class="tenue chico">La isla espera a sus primeros habitantes: crea tu personaje en “Mi personaje”.</span>}
      </div>
      <button class="boton isla-menu" aria-expanded={menu} aria-controls="isla-botones" aria-label={menu ? 'Cerrar opciones' : 'Opciones de la isla'} onClick={() => setMenu(!menu)}>{menu ? '✕' : '☰'}</button>
      <div class={`isla-botones${menu ? ' abierto' : ''}`} id="isla-botones">
        <button class="boton" aria-pressed={!!filas} onClick={() => setFilas(filas ? null : mando.current?.lista() ?? [])}>Habitantes</button>
        {miClave && <button class="boton" onClick={() => (siguiendo === miClave ? seguir('') : mando.current?.fichaDe(miClave))}>{siguiendo === miClave ? 'Dejar de seguir' : 'Mi personaje'}</button>}
        <button class="boton" onClick={() => setImagen(mando.current?.foto() ?? '')}>Foto</button>
        <button class="boton" aria-pressed={conSonido} onClick={alternarSonido}>{conSonido ? 'Música: sí' : 'Música: no'}</button>
        <label class="boton isla-calidad">Calidad
          <select value={auto ? 'auto' : String(nivel)} onChange={(e) => elegirCalidad(e.currentTarget.value)}>
            <option value="auto">Automática ({NIVELES[nivel]})</option>
            {NIVELES.map((n, i) => <option key={n} value={String(i)}>{n[0].toUpperCase() + n.slice(1)}</option>)}
          </select>
        </label>
      </div>
      {filas && (
        <div class="isla-lista">
          {filas.map((f) => (
            <button key={f.clave} class={siguiendo === f.clave ? 'elegida' : ''} onClick={() => mando.current?.fichaDe(f.clave)}>
              <b>{f.nombre}{f.rol === 'guardian' && ' ★'}</b><span>{f.haciendo}</span>
            </button>
          ))}
          {filas.length === 0 && <p class="tenue chico">Cargando…</p>}
        </div>
      )}
      <p class="isla-ayuda tenue chico">Arrastra para girar · rueda o pellizco para acercar · toca un personaje, una casa o un tablón</p>
      {ficha && (
        <div class="ficha" role="dialog" aria-label={`Ficha de ${ficha.nombre}`}>
          <button class="cerrar" aria-label="Cerrar ficha" onClick={() => { setFicha(null); setSiguiendo(''); }}>×</button>
          <div class="sigla">{ficha.rol === 'guardian' ? 'Staff' : ficha.rol === 'admin' ? 'Organizador' : 'Habitante'}</div>
          <h3>{ficha.nombre}</h3>
          <p>{ficha.personalidad} · ahora está {ficha.haciendo}</p>
          {ficha.frase && <p class="cita">“{ficha.frase}”</p>}
          <button class="boton" onClick={() => seguir(siguiendo === ficha.clave ? '' : ficha.clave)}>{siguiendo === ficha.clave ? 'Dejar de seguir' : 'Seguir con la cámara'}</button>
        </div>
      )}
      {panel && (
        <div class="ficha panel" role="dialog" aria-label={panel.titulo}>
          <button class="cerrar" aria-label="Cerrar" onClick={() => setPanel(null)}>×</button>
          <div class="sigla">{panel.sigla}</div>
          <h3>{panel.titulo}</h3>
          {panel.lineas.map((linea) => <p key={linea}>{linea}</p>)}
          {panel.lista && panel.lista.length > 0 && (
            <ul>{panel.lista.map((item) => <li key={item.t} class={item.ahora ? 'ahora' : ''}><b>{item.t}</b>{item.d && <span>{item.d}</span>}</li>)}</ul>
          )}
          {panel.enlace && <a class="boton principal" href={panel.enlace.href}>{panel.enlace.texto}</a>}
        </div>
      )}
      {imagen && (
        <div class="telon" role="dialog" aria-label="Foto de la isla" onClick={() => setImagen('')}>
          <div class="ventana" onClick={(e) => e.stopPropagation()}>
            <img src={imagen} alt="Foto de la isla ValRigo" />
            <div class="fila">
              <a class="boton principal" href={imagen} download="valrigo.png">Descargar foto</a>
              <button class="boton" onClick={() => setImagen('')}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
