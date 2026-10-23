import * as THREE from 'three';
import { fundir } from '../../nucleo/fundir';
import type { Contexto, Partida } from '../marco';
import { arrastre, mat } from '../punteria/fisica';
import { crearEscenario, mmss } from '../reflejos/motor';
import { ANCHO, DESAFIOS, FONDO, RADIO, SALIDA, TRAMOS, TRONERAS, golpear, lugarLibre, paso, quietas, type BolaFisica, type Desafio, type Evento } from './billarNiveles';

// Billar: seis desafíos sobre una mesa de pool, cada uno con tiros contados: embocarlas todas, en orden, pegadas a la
// banda, la negra al final, el triángulo completo y bolas de oro. Arrastras hacia atrás desde la bola blanca (como una
// honda) y sueltas; con el teclado, ← → apuntan y Espacio carga. El círculo de abajo elige dónde le pega el taco a la
// blanca: arriba corre, abajo retrocede, a los lados cambia el rebote en las bandas (W/S y Q/E con el teclado).
// Varias bolas en un tiro dan bono; la blanca adentro resta. La física está en billarNiveles.ts (se prueba con node).

const DURA = 300, ALTO_PANO = 0.37, PASOS = 10;
interface Bola extends BolaFisica { n: number; dorada: boolean; negra: boolean; blanca: boolean; malla: THREE.Mesh; desde: [number, number] }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: ANCHO + 3.4, alto: (FONDO + 3.2) * Math.sin(1.2) + 1.8, centro: [0, 0, 0.2], inclinacion: 1.2, sinPlaya: true });
  e.escena.background = new THREE.Color('#171c2c');

  // ── Texturas pintadas en canvas: paño, madera con veta, parquet ──
  const pintar = (w: number, h: number, f: (g: CanvasRenderingContext2D) => void, repetir: [number, number] = [1, 1]) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; f(cv.getContext('2d')!);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repetir); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const texPano = pintar(64, 64, (g) => { g.fillStyle = '#1f8a4c'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 400; i++) { g.fillStyle = (i * 7919) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; g.fillRect((i * 37) % 64, (i * 53) % 64, 2, 2); } }, [8, 4]);
  const texMadera = pintar(256, 64, (g) => {
    g.fillStyle = '#6b3a1f'; g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 26; i++) { g.strokeStyle = i % 3 ? 'rgba(40,18,6,0.28)' : 'rgba(150,90,50,0.25)'; g.lineWidth = 1 + (i % 3); g.beginPath(); const y = (i * 2.6) % 64; g.moveTo(0, y); for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.2); g.stroke(); }
  }, [3, 1]);
  const madera = new THREE.MeshStandardMaterial({ map: texMadera, roughness: 0.4, metalness: 0.05 });
  const bronce = new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.3, metalness: 0.65 });
  const goma = new THREE.MeshStandardMaterial({ color: '#1b7c44', roughness: 0.75 });

  // ── La mesa: paño, bandas que siguen la forma real de las troneras, marco de madera con diamantes, patas ──
  const mesa = new THREE.Group();
  const pano = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO + 0.8, FONDO + 0.8), new THREE.MeshLambertMaterial({ map: texPano }));
  pano.rotation.x = -Math.PI / 2; pano.position.y = ALTO_PANO;
  e.escena.add(pano);
  // Charcos de luz de las lámparas sobre el paño
  const texLuz = pintar(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,240,200,0.3)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  for (const x of [-ANCHO / 3, 0, ANCHO / 3]) { const charco = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO * 0.5, FONDO * 1.1), new THREE.MeshBasicMaterial({ map: texLuz, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); charco.rotation.x = -Math.PI / 2; charco.position.set(x, ALTO_PANO + 0.004, 0); e.escena.add(charco); }
  // Bandas de goma: una caja por tramo, apoyada por detrás de la línea donde rebota la bola
  for (const t of TRAMOS) {
    const [ax, az] = t.a, [bx, bz] = t.b, largo = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    let px = -(bz - az) / largo, pz = (bx - ax) / largo;
    // La caja va del lado contrario a donde rueda la bola: el centro de la mesa (bandas) o el hoyo (mandíbulas)
    const ref = t.mandibula ? TRONERAS.reduce((a, b) => (Math.hypot(b.hoyo[0] - mx, b.hoyo[1] - mz) < Math.hypot(a.hoyo[0] - mx, a.hoyo[1] - mz) ? b : a)).hoyo : [0, 0];
    if ((ref[0] - mx) * px + (ref[1] - mz) * pz > 0) { px = -px; pz = -pz; }
    const b = new THREE.Mesh(new THREE.BoxGeometry(largo + 0.04, 0.17, 0.24), goma);
    b.position.set(mx + px * 0.12, ALTO_PANO + 0.085, mz + pz * 0.12); b.rotation.y = -Math.atan2(bz - az, bx - ax);
    mesa.add(b);
  }
  const W = ANCHO / 2, F = FONDO / 2;
  for (const [w, d, x, z] of [[ANCHO + 1.5, 0.55, 0, -F - 0.5], [ANCHO + 1.5, 0.55, 0, F + 0.5], [0.55, FONDO + 0.45, -W - 0.5, 0], [0.55, FONDO + 0.45, W + 0.5, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, d), madera); b.position.set(x, ALTO_PANO + 0.12, z); mesa.add(b); }
  const cuerpoMesa = new THREE.Mesh(new THREE.BoxGeometry(ANCHO + 1.5, 0.75, FONDO + 1.5), madera); cuerpoMesa.position.y = -0.03; mesa.add(cuerpoMesa);
  const faldon = new THREE.Mesh(new THREE.BoxGeometry(ANCHO + 1.1, 0.3, FONDO + 1.1), mat('#4a2612')); faldon.position.y = -0.55; mesa.add(faldon);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) { const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 2.1, 12), madera); pata.position.set(x * (W + 0.25), -1.35, z * (F + 0.25)); mesa.add(pata); const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 12), bronce); pie.position.set(x * (W + 0.25), -2.34, z * (F + 0.25)); mesa.add(pie); }
  // Diamantes de nácar en las cuatro bandas (sirven para calcular los tiros de banda)
  const nacar = new THREE.MeshBasicMaterial({ color: '#f4e6c8' });
  for (let i = 1; i < 8; i++) if (i !== 4) for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.06, 4), nacar); d.rotation.x = -Math.PI / 2; d.position.set(-W + (i * ANCHO) / 8, ALTO_PANO + 0.255, s * (F + 0.5)); mesa.add(d); }
  for (let i = 1; i < 4; i++) for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.06, 4), nacar); d.rotation.x = -Math.PI / 2; d.position.set(s * (W + 0.5), ALTO_PANO + 0.255, -F + (i * FONDO) / 4); mesa.add(d); }
  // Troneras: el hoyo negro sobre el marco, con su borde de cuero y bronce
  for (const t of TRONERAS) {
    const hoyo = new THREE.Mesh(new THREE.CircleGeometry(t.radio + 0.05, 24), new THREE.MeshBasicMaterial({ color: '#07070a' })); hoyo.rotation.x = -Math.PI / 2; hoyo.position.set(t.hoyo[0], ALTO_PANO + 0.256, t.hoyo[1]);
    const cuero = new THREE.Mesh(new THREE.RingGeometry(t.radio + 0.05, t.radio + 0.13, 24), mat('#2a1a10')); cuero.rotation.x = -Math.PI / 2; cuero.position.set(t.hoyo[0], ALTO_PANO + 0.257, t.hoyo[1]);
    const aro = new THREE.Mesh(new THREE.RingGeometry(t.radio + 0.13, t.radio + 0.2, 24, 1, 0, Math.PI * 2), bronce); aro.rotation.x = -Math.PI / 2; aro.position.set(t.hoyo[0], ALTO_PANO + 0.258, t.hoyo[1]);
    // El paño de la garganta se oscurece hacia el hoyo
    const garganta = new THREE.Mesh(new THREE.CircleGeometry(t.ancho + 0.05, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false })); garganta.rotation.x = -Math.PI / 2; garganta.position.set((t.m[0] + t.hoyo[0]) / 2, ALTO_PANO + 0.003, (t.m[1] + t.hoyo[1]) / 2);
    mesa.add(hoyo, cuero, aro, garganta);
  }
  // Tizas en dos esquinas y el triángulo apoyado en el marco
  for (const [x, z] of [[-W - 0.45, F + 0.48], [W + 0.45, -F - 0.48]]) { const tiza = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), mat('#3a7bd5')); tiza.position.set(x, ALTO_PANO + 0.33, z); tiza.rotation.y = 0.4; mesa.add(tiza); }
  const triang = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.035, 4, 3), mat('#c9a227')); triang.rotation.x = -Math.PI / 2; triang.position.set(W - 1.2, ALTO_PANO + 0.29, -F - 0.5); mesa.add(triang);
  fundir(mesa);
  e.escena.add(mesa);

  // ── El salón: parquet, alfombra, paredes con zócalo, cuadros, taquero, marcador, barra, sillas, plantas y lámparas ──
  const salon = new THREE.Group();
  const parquet = pintar(128, 128, (g) => { g.fillStyle = '#7a4a2a'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 8; i++) for (let k = 0; k < 4; k++) { g.fillStyle = ['#7a4a2a', '#6e4224', '#86522e'][(i + k) % 3]; g.fillRect(i * 16, (k * 32 + (i % 2) * 16) % 128, 16, 32); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(i * 16, k * 32 + (i % 2) * 16, 1, 32); } }, [14, 14]);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshLambertMaterial({ map: parquet })); piso.rotation.x = -Math.PI / 2; piso.position.y = -2.4; e.escena.add(piso);
  const texAlfombra = pintar(128, 64, (g) => { g.fillStyle = '#7a2424'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#d9a35a'; g.lineWidth = 3; g.strokeRect(6, 6, 116, 52); g.strokeStyle = 'rgba(217,163,90,0.5)'; g.lineWidth = 1; g.strokeRect(12, 12, 104, 40); });
  const alfombra = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO + 6, FONDO + 6), new THREE.MeshLambertMaterial({ map: texAlfombra })); alfombra.rotation.x = -Math.PI / 2; alfombra.position.y = -2.39; e.escena.add(alfombra);
  const pared = new THREE.Mesh(new THREE.BoxGeometry(44, 11, 0.4), mat('#2a3a33')); pared.position.set(0, 3, -F - 3.4); salon.add(pared);
  const zocalo = new THREE.Mesh(new THREE.BoxGeometry(44, 1.4, 0.5), madera); zocalo.position.set(0, -1.7, -F - 3.15); salon.add(zocalo);
  for (const x of [-22, 22]) { const lateral = new THREE.Mesh(new THREE.BoxGeometry(0.4, 11, 26), mat('#24332c')); lateral.position.set(x * 0.5 + Math.sign(x) * 0.5, 3, 4); salon.add(lateral); }
  // Cuadros
  for (const [x, color] of [[-6.5, '#d9a35a'], [-3.8, '#3f8cff'], [6.5, '#ef5565']] as const) { const marco = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 0.08), bronce); marco.position.set(x, 3.4, -F - 3.15); const cuadro = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.05), mat(color)); cuadro.position.set(x, 3.4, -F - 3.1); salon.add(marco, cuadro); }
  // Taquero de pared con tacos
  const taquero = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.25), madera); taquero.position.set(3.3, 0.4, -F - 3.05); salon.add(taquero);
  const repisa = taquero.clone(); repisa.position.y = 3.2; salon.add(repisa);
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 3.2, 6), mat(i % 2 ? '#d9a35a' : '#a8743c')); t.position.set(2.3 + i * 0.4, 1.8, -F - 2.95); salon.add(t); }
  // Marcador de pared: dos hileras de cuentas
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 0.1), madera); tablero.position.set(-1, 3.3, -F - 3.1); salon.add(tablero);
  for (const y of [3.5, 3.1]) { const alambre = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.8, 4), mat('#c0c0c0')); alambre.rotation.z = Math.PI / 2; alambre.position.set(-1, y, -F - 3.0); salon.add(alambre); for (let i = 0; i < 12; i++) { const cuenta = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(i % 4 < 2 ? '#d93a2f' : '#f4e6c8')); cuenta.position.set(-2.3 + i * 0.16 + (i > 6 ? 0.6 : 0), y, -F - 2.98); salon.add(cuenta); } }
  // Barra con botellas y pisos altos (al fondo a la derecha)
  const barra = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 1), madera); barra.position.set(9.5, -1.6, -F - 2); salon.add(barra);
  const cubierta = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 1.2), mat('#1a1a22')); cubierta.position.set(9.5, -0.75, -F - 2); salon.add(cubierta);
  for (let i = 0; i < 9; i++) { const botella = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.45, 8), mat(['#3fa34d', '#8a2a2a', '#d9a35a', '#5ad1ff'][i % 4])); botella.position.set(7.4 + i * 0.45, 0.1, -F - 2.85); salon.add(botella); }
  const estante = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 0.4), madera); estante.position.set(9.4, -0.18, -F - 2.85); salon.add(estante);
  // Sillas de bar, sillas a los costados y mesitas con vasos
  const silla = (x: number, z: number, alta: boolean) => {
    const s = new THREE.Group(), alto = alta ? 1.5 : 0.9;
    const asiento = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 12), mat('#8a2a2a')); asiento.position.y = -2.4 + alto; s.add(asiento);
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, alto, 6), bronce); poste.position.y = -2.4 + alto / 2; s.add(poste);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 12), bronce); base.position.y = -2.37; s.add(base);
    if (!alta) { const respaldo = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.08), mat('#8a2a2a')); respaldo.position.set(0, -2.4 + alto + 0.35, -0.3); s.add(respaldo); }
    s.position.set(x, 0, z); salon.add(s);
  };
  for (let i = 0; i < 3; i++) silla(8 + i * 1.3, -F - 1.1, true);
  silla(-W - 2.2, -0.8, false); silla(-W - 2.2, 1.2, false); silla(W + 2.2, 1.6, false);
  for (const [x, z] of [[-W - 2.4, -2.6], [W + 2.4, -0.6]]) {
    const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), bronce); pata.position.set(x, -1.8, z);
    const cubierta2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.07, 16), madera); cubierta2.position.set(x, -1.2, z);
    const vaso = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.28, 10), new THREE.MeshStandardMaterial({ color: '#f2c12e', transparent: true, opacity: 0.8 })); vaso.position.set(x + 0.15, -1.02, z);
    salon.add(pata, cubierta2, vaso);
  }
  // Plantas en las esquinas
  for (const [x, z] of [[-W - 3.4, -F - 2.2], [W + 3.2, F + 2.6], [-W - 3.2, F + 2.8]]) {
    const maceta = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.8, 10), mat('#b5562a')); maceta.position.set(x, -2, z); salon.add(maceta);
    for (let i = 0; i < 6; i++) { const hoja = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.4, 5), mat(i % 2 ? '#2e8a4f' : '#3fa34d')); hoja.position.set(x + Math.cos(i) * 0.25, -1.1, z + Math.sin(i) * 0.25); hoja.rotation.set(Math.sin(i) * 0.5, 0, Math.cos(i) * 0.5); salon.add(hoja); }
  }
  // Lámparas colgantes con pantalla verde sobre el fondo (la luz cálida cae en la mesa como charcos)
  for (const x of [-ANCHO / 3, 0, ANCHO / 3]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 4), mat('#222222')); cable.position.set(x, 5.4, -F - 1.4); salon.add(cable);
    const pantalla = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#1f6b3a', roughness: 0.5, side: THREE.DoubleSide })); pantalla.position.set(x, 3.7, -F - 1.4); salon.add(pantalla);
    const foco = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3c4' })); foco.position.set(x, 3.5, -F - 1.4); salon.add(foco);
  }
  fundir(salon);
  e.escena.add(salon);
  // Letrero de neón (aparte: su material brilla)
  const texNeon = pintar(256, 64, (g) => { g.fillStyle = '#1a2620'; g.fillRect(0, 0, 256, 64); g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ff5ad1'; g.shadowBlur = 14; g.fillStyle = '#ffb3f0'; g.fillText('★ BILLAR ★', 128, 34); });
  const letrero = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: texNeon })); letrero.position.set(-5.2, 4.9, -F - 3.15); e.escena.add(letrero);
  const calida = new THREE.PointLight('#ffd9a0', 6, 16, 1.6); calida.position.set(0, 4, 0); e.escena.add(calida);

  // Sombra suave bajo cada bola
  const texSombra = pintar(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const geoSombra = new THREE.PlaneGeometry(RADIO * 3, RADIO * 3), matSombra = new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false });

  // ── Bolas, con su número pintado ──
  const COLORES = ['#f2c12e', '#2a5bd7', '#d93a2f', '#7a3fb0', '#f0812a', '#2e9a4f', '#8a2a2a', '#1a1a1a', '#f2c12e', '#2a5bd7'];
  const textura = (color: string, n: number, dorada: boolean) => pintar(128, 64, (x) => {
    x.fillStyle = dorada ? '#ffcf3a' : color; x.fillRect(0, 0, 128, 64);
    if (n > 8 && !dorada) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 14); x.fillRect(0, 50, 128, 14); } // las rayadas
    for (const cx of [32, 96]) { x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx, 32, 13, 0, Math.PI * 2); x.fill(); x.fillStyle = '#1a1a1a'; x.font = 'bold 18px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(dorada ? '★' : String(n), cx, 33); }
  });
  const geo = new THREE.SphereGeometry(RADIO, 22, 16);
  let bolas: Bola[] = [], desafio: Desafio = DESAFIOS[0], nivel = -1, tiros = 0, siguiente = 1;
  const nueva = (x: number, z: number, n: number, color: string, extra: Partial<Bola> = {}): Bola => {
    const malla = new THREE.Mesh(geo, extra.blanca ? new THREE.MeshStandardMaterial({ color: '#fbfaf2', roughness: 0.12 }) : new THREE.MeshStandardMaterial({ map: textura(color, n, !!extra.dorada), roughness: 0.12, metalness: extra.dorada ? 0.5 : 0, emissive: extra.dorada ? '#a86a00' : '#000000', emissiveIntensity: 0.3 }));
    malla.position.set(x, ALTO_PANO + RADIO, z);
    malla.rotation.set(n * 1.3, n * 2.1, 0);
    const sombraBola = new THREE.Mesh(geoSombra, matSombra); sombraBola.rotation.x = -Math.PI / 2; malla.userData.sombra = sombraBola;
    e.escena.add(malla, sombraBola);
    return { x, z, vx: 0, vz: 0, gx: 0, gz: 0, lado: 0, dentro: false, cae: 0, tronera: 0, bandas: 0, n, dorada: false, negra: false, blanca: false, malla, desde: [x, z], ...extra };
  };
  const armar = (i: number) => {
    for (const b of bolas) e.escena.remove(b.malla, b.malla.userData.sombra);
    nivel = i; desafio = DESAFIOS[i]; tiros = desafio.tiros; siguiente = 1;
    bolas = [nueva(SALIDA[0], SALIDA[1], 0, '#ffffff', { blanca: true }), ...desafio.bolas.map((b) => nueva(b.x, b.z, b.n, b.negra ? '#1a1a1a' : COLORES[(b.n - 1) % COLORES.length], { dorada: !!b.dorada, negra: !!b.negra }))];
    efecto.alto = efecto.lado = 0; pintarEfecto();
    e.hud.aviso(`Desafío ${i + 1}: ${desafio.nombre}`, 'oro', 1.6);
  };
  const blanca = () => bolas[0];

  // ── Taco, guía y control del efecto ──
  const taco = new THREE.Group(), vara = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.065, 4.2, 10), mat('#d9a35a')), punta = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.1, 10), mat('#3a6ad9'));
  const empunadura = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.068, 1.3, 10), mat('#1a1a22')); empunadura.rotation.x = Math.PI / 2; empunadura.position.z = -3.5;
  vara.rotation.x = Math.PI / 2; vara.position.z = -2.1; punta.rotation.x = Math.PI / 2; punta.position.z = 0.02;
  taco.add(vara, punta, empunadura); taco.position.y = ALTO_PANO + RADIO + 0.05; e.escena.add(taco);
  const punto = () => { const p = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })); p.rotation.x = -Math.PI / 2; e.escena.add(p); return p; };
  const puntos = Array.from({ length: 30 }, punto);
  const rumboObjetivo = Array.from({ length: 8 }, () => { const p = punto(); (p.material as THREE.MeshBasicMaterial).color.set('#ffe08a'); return p; });
  const rumboBlanca = Array.from({ length: 5 }, () => { const p = punto(); (p.material as THREE.MeshBasicMaterial).opacity = 0.35; return p; });
  const fantasma = new THREE.Mesh(new THREE.RingGeometry(RADIO - 0.03, RADIO, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  fantasma.rotation.x = -Math.PI / 2; e.escena.add(fantasma);
  // El círculo del efecto: dónde le pega el taco a la blanca
  const efecto = { alto: 0, lado: 0 };
  const panel = document.createElement('div');
  Object.assign(panel.style, { position: 'absolute', left: '12px', bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))', display: 'flex', alignItems: 'flex-end', gap: '8px', userSelect: 'none' });
  const circulo = document.createElement('div');
  Object.assign(circulo.style, { position: 'relative', width: '76px', height: '76px', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #ffffff, #d9d4c4)', border: '3px solid #14203a', boxShadow: '0 2px 8px rgba(0,0,0,.4)', cursor: 'crosshair', touchAction: 'none' });
  circulo.title = 'Efecto: arriba corre, abajo retrocede, a los lados cambia el rebote (W/S, Q/E; doble clic para centrar)';
  const marca = document.createElement('div');
  Object.assign(marca.style, { position: 'absolute', width: '14px', height: '14px', marginLeft: '-7px', marginTop: '-7px', borderRadius: '50%', background: '#d93a2f', border: '2px solid #fff', pointerEvents: 'none' });
  circulo.appendChild(marca);
  const etiqueta = document.createElement('div');
  Object.assign(etiqueta.style, { position: 'absolute', top: '-20px', left: '0', width: '100%', textAlign: 'center', font: '800 11px Nunito, sans-serif', color: '#f3ecdc', textShadow: '0 1px 2px #000' });
  circulo.appendChild(etiqueta);
  const barra2 = document.createElement('div'), lleno = document.createElement('div');
  Object.assign(barra2.style, { position: 'relative', width: '14px', height: '76px', borderRadius: '7px', background: 'rgba(20,32,58,.7)', border: '2px solid rgba(255,255,255,.35)', overflow: 'hidden' });
  Object.assign(lleno.style, { position: 'absolute', left: '0', bottom: '0', width: '100%', height: '0%', background: 'linear-gradient(#ef5565, #ffd23c, #3fe07a)' });
  barra2.appendChild(lleno);
  panel.append(circulo, barra2);
  c.caja.appendChild(panel);
  const pintarEfecto = () => {
    marca.style.left = `${50 + efecto.lado * 38}%`; marca.style.top = `${50 - efecto.alto * 38}%`;
    etiqueta.textContent = efecto.alto > 0.25 ? 'Corrido' : efecto.alto < -0.25 ? 'Retroceso' : Math.abs(efecto.lado) > 0.25 ? 'Efecto lateral' : 'Al centro';
  };
  const elegirEfecto = (ev: PointerEvent) => {
    const r2 = circulo.getBoundingClientRect(); let x = ((ev.clientX - r2.left) / r2.width) * 2 - 1, y = -(((ev.clientY - r2.top) / r2.height) * 2 - 1);
    const l = Math.hypot(x, y); if (l > 0.85) { x *= 0.85 / l; y *= 0.85 / l; }
    efecto.lado = Math.abs(x) < 0.12 ? 0 : x; efecto.alto = Math.abs(y) < 0.12 ? 0 : y; pintarEfecto();
  };
  let eligiendo = false;
  circulo.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); eligiendo = true; circulo.setPointerCapture(ev.pointerId); elegirEfecto(ev); });
  circulo.addEventListener('pointermove', (ev) => { if (eligiendo) elegirEfecto(ev); });
  circulo.addEventListener('pointerup', () => { eligiendo = false; });
  circulo.addEventListener('dblclick', () => { efecto.alto = efecto.lado = 0; pintarEfecto(); });
  pintarEfecto();

  // ── Estado ──
  let puntaje = 0, rodando = false, apunta = 0, carga = 0, cargando = false, empezado = false, terminado = false, falta = false, pasar = 0;
  /** Lo que pasó en el tiro: bolas embocadas (y si venían de banda) y a cuántas tocó la blanca. */
  let caidas: Bola[] = [], tocadas = new Set<number>(), devolver: { b: Bola; x: number; z: number }[] = [];
  const puede = () => empezado && !terminado && !rodando && pasar === 0;
  const tirar = (fuerza: number, ang: number) => {
    if (!puede() || fuerza < 0.05) return;
    for (const b of bolas) b.bandas = 0;
    golpear(blanca(), ang, fuerza, efecto.alto, efecto.lado);
    rodando = true; tiros--; caidas = []; tocadas = new Set(); devolver = []; falta = false;
    e.sonido.tono(220 + fuerza * 260, 0.05, { tipo: 'square', vol: 0.12 + fuerza * 0.12 });
    e.sonido.tono(900, 0.03, { tipo: 'triangle', vol: 0.08 });
  };
  const tiro = arrastre(e, puede, (t) => tirar(t.fuerza, Math.atan2(-t.dx, -t.dy)));
  const teclas = new Set<string>();
  e.escuchar(window, 'keydown', (ev) => {
    teclas.add(ev.key);
    if (ev.key === ' ') { ev.preventDefault(); if (puede() && !cargando) { cargando = true; carga = 0; } }
    const k = ev.key.toLowerCase(), ajuste = (v: number, d: number) => Math.max(-0.85, Math.min(0.85, Math.round((v + d) * 4) / 4));
    if (k === 'w') efecto.alto = ajuste(efecto.alto, 0.25); else if (k === 's') efecto.alto = ajuste(efecto.alto, -0.25);
    else if (k === 'q') efecto.lado = ajuste(efecto.lado, -0.25); else if (k === 'e') efecto.lado = ajuste(efecto.lado, 0.25);
    else if (k === 'r') efecto.alto = efecto.lado = 0;
    pintarEfecto();
  });
  e.escuchar(window, 'keyup', (ev) => { teclas.delete(ev.key); if (ev.key === ' ' && cargando) { cargando = false; tirar(carga, apunta); carga = 0; } });

  const terminar = (t: number) => {
    if (terminado) return;
    terminado = true;
    e.detener();
    c.alTerminar({ puntaje, lineas: [['Desafíos superados', `${nivel + (bolas.slice(1).every((b) => b.dentro) ? 1 : 0)} de ${DESAFIOS.length}`], ['Tiempo', mmss(t)]], detalle: { nivel: nivel + 1 } });
  };
  const volverALaMesa = (b: Bola, x: number, z: number) => {
    const [px, pz] = lugarLibre(bolas, x, z, b);
    Object.assign(b, { x: px, z: pz, vx: 0, vz: 0, gx: 0, gz: 0, lado: 0, dentro: false, cae: 0 });
    b.malla.visible = true; b.malla.scale.setScalar(1);
  };
  /** Cuando todo se detiene: se cuentan las bolas del tiro y se ve si el desafío se ganó o se acabaron los tiros. */
  const alDetenerse = (t: number) => {
    rodando = false;
    for (const d of devolver) volverALaMesa(d.b, d.x, d.z);
    const n = caidas.length;
    if (n > 1) { const bono = (n - 1) * 50; puntaje += bono; e.hud.aviso(`¡${n === 2 ? 'Doble' : n === 3 ? 'Triple' : `${n} de un tiro`}! +${bono}`, 'oro', 1.2); }
    else if (caidas.some((b) => b.bandas > 0)) e.hud.aviso('¡De banda!', 'oro', 1);
    else if (tocadas.size >= 2 && n) e.hud.aviso('¡Carambola!', 'oro', 1);
    if (blanca().dentro) {
      puntaje = Math.max(0, puntaje - 50); e.hud.aviso('¡La blanca adentro! −50', 'mal', 1.1);
      volverALaMesa(blanca(), SALIDA[0], SALIDA[1]);
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
    b.desde = [b.x, b.z]; // de aquí parte su caída hacia el hoyo
    e.sonido.tono(150, 0.12, { tipo: 'sine', vol: 0.22, hasta: 90 });
    e.sonido.tono(420, 0.05, { tipo: 'triangle', vol: 0.06, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.12 });
    if (b.blanca) { e.sonido.mal(); return; }
    // En orden: la que no toca vuelve a la mesa (donde estaba al empezar) y no suma
    if (desafio.regla === 'orden' && b.n !== siguiente) {
      const origen = desafio.bolas.find((x) => x.n === b.n)!;
      devolver.push({ b, x: origen.x, z: origen.z });
      e.hud.aviso(`Primero la ${siguiente}`, 'mal', 1); e.sonido.mal(); return;
    }
    caidas.push(b);
    if (desafio.regla === 'orden') siguiente++;
    if (b.negra && bolas.some((x) => !x.blanca && !x.negra && !x.dentro)) falta = true;
    const valor = b.dorada ? 300 : 100;
    puntaje += valor;
    e.flotante(`+${valor}`, b.x, 1, b.z, 'oro'); e.chispas(b.x, 0.5, b.z, b.dorada ? ['#ffd23c', '#ffffff'] : ['#ffffff', '#3fe07a'], 14, 3);
  };
  const eventos: Evento[] = [];
  const atender = () => {
    for (const ev of eventos) {
      if (ev.tipo === 'tronera') embocar(bolas[ev.i]);
      else if (ev.tipo === 'banda') { if (ev.fuerza > 0.8) e.sonido.tono(ev.punta ? 260 : 170, 0.05, { tipo: 'triangle', vol: Math.min(0.12, ev.fuerza / 40) }); }
      else {
        if (ev.i === 0) tocadas.add(ev.k);
        e.sonido.tono(1500 + Math.min(600, ev.fuerza * 60), 0.025, { tipo: 'sine', vol: Math.min(0.28, ev.fuerza / 22) });
      }
    }
    eventos.length = 0;
  };

  /** La guía: hasta lo primero que toca el tiro; si es una bola, hacia dónde sale ella y (corto) hacia dónde va la blanca. */
  const guia = (ang: number) => {
    const dx = Math.sin(ang), dz = Math.cos(ang), b = blanca();
    let d = 0, contra: Bola | null = null, fin = false;
    for (; d < 13 && !fin; d += 0.02) {
      const x = b.x + dx * d, z = b.z + dz * d;
      for (const o of bolas) if (o !== b && !o.dentro && Math.hypot(o.x - x, o.z - z) < RADIO * 2) { contra = o; fin = true; }
      for (const t of TRAMOS) { const ux = t.b[0] - t.a[0], uz = t.b[1] - t.a[1], l2 = ux * ux + uz * uz, u = Math.max(0, Math.min(1, ((x - t.a[0]) * ux + (z - t.a[1]) * uz) / l2)); if (Math.hypot(x - t.a[0] - ux * u, z - t.a[1] - uz * u) < RADIO) fin = true; }
      for (const t of TRONERAS) { const rx = x - t.m[0], rz = z - t.m[1]; if (rx * t.n[0] + rz * t.n[1] > 0 && Math.abs(rx * t.t[0] + rz * t.t[1]) < t.ancho) fin = true; }
    }
    const gx = b.x + dx * d, gz = b.z + dz * d;
    puntos.forEach((p, i) => { const f = ((i + 1) / puntos.length) * d; p.visible = f < d - 0.12; p.position.set(b.x + dx * f, ALTO_PANO + 0.01, b.z + dz * f); });
    fantasma.visible = true; fantasma.position.set(gx, ALTO_PANO + 0.01, gz);
    for (const p of [...rumboObjetivo, ...rumboBlanca]) p.visible = false;
    if (contra) {
      const nx = (contra.x - gx) / (RADIO * 2), nz = (contra.z - gz) / (RADIO * 2);
      rumboObjetivo.forEach((p, i) => { const f = 0.25 + i * 0.18; p.visible = true; p.position.set(contra!.x + nx * f, ALTO_PANO + 0.01, contra!.z + nz * f); });
      // La blanca sale por la tangente; con corrido se abre hacia adelante y con retroceso hacia atrás
      const tx = dx - nx * (dx * nx + dz * nz), tz = dz - nz * (dx * nx + dz * nz), tl = Math.hypot(tx, tz);
      if (tl > 0.05) {
        let ux = tx / tl, uz = tz / tl;
        ux += dx * efecto.alto * 0.6; uz += dz * efecto.alto * 0.6;
        const ul = Math.hypot(ux, uz); ux /= ul; uz /= ul;
        rumboBlanca.forEach((p, i) => { const f = 0.2 + i * 0.16; p.visible = true; p.position.set(gx + ux * f, ALTO_PANO + 0.01, gz + uz * f); });
      }
    }
  };

  armar(0);
  e.hud.tiempo(mmss(DURA)); e.hud.puntos(0);
  const eje = new THREE.Vector3();
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__billar = { bolas: () => bolas.map((b) => ({ n: b.n, x: b.x, z: b.z, dentro: b.dentro })), tirar: (f: number, a: number) => tirar(f, a), estado: () => ({ nivel, tiros, puntaje, rodando }) };
  e.alCuadro((t, dt) => {
    const dtf = Math.min(dt, 0.05);
    // Bolas que caen: se van hundiendo y rodando hacia el centro del hoyo
    for (const b of bolas) if (b.cae > 0) {
      b.cae += dtf;
      const k = Math.min(1, b.cae / 0.38), h = TRONERAS[b.tronera].hoyo;
      b.malla.position.set(b.desde[0] + (h[0] - b.desde[0]) * k, ALTO_PANO + RADIO - k * k * 0.45, b.desde[1] + (h[1] - b.desde[1]) * k);
      b.malla.scale.setScalar(1 - k * 0.25);
      if (k >= 1) { b.malla.visible = false; b.cae = -1; }
    }
    if (!empezado || terminado) return;
    if (pasar && t >= pasar) {
      pasar = 0;
      const gano = bolas.slice(1).every((b) => b.dentro);
      if (nivel >= DESAFIOS.length - 1 && (gano || tiros <= 0 || falta)) return terminar(t);
      armar(gano || tiros <= 0 || falta ? nivel + 1 : nivel);
    }
    if (rodando) {
      for (let s = 0; s < PASOS; s++) paso(bolas, dtf / PASOS, eventos);
      atender();
      if (quietas(bolas)) alDetenerse(t);
    }
    // Las bolas giran según su giro (no según cuánto avanzan): se ve el retroceso y el corrido
    for (const b of bolas) {
      if (b.dentro) { (b.malla.userData.sombra as THREE.Mesh).visible = false; continue; }
      const g = Math.hypot(b.gx, b.gz);
      if (g > 0.001) b.malla.rotateOnWorldAxis(eje.set(b.gz / g, 0, -b.gx / g), (g * dtf) / RADIO);
      b.malla.position.set(b.x, ALTO_PANO + RADIO, b.z);
      const sb = b.malla.userData.sombra as THREE.Mesh; sb.visible = b.malla.visible; sb.position.set(b.x + 0.05, ALTO_PANO + 0.01, b.z + 0.06);
    }
    // Apuntar: arrastrando (como honda) o con ← → y Espacio
    const listo = puede();
    if (teclas.has('ArrowLeft') || teclas.has('a')) apunta += dtf * (teclas.has('Shift') ? 0.25 : 1.4);
    if (teclas.has('ArrowRight') || teclas.has('d')) apunta -= dtf * (teclas.has('Shift') ? 0.25 : 1.4);
    if (cargando) carga = Math.min(1, carga + dtf / 1.2);
    if (tiro.tirando && tiro.fuerza > 0.03) apunta = Math.atan2(-tiro.dx, -tiro.dy);
    const fuerza = tiro.tirando ? tiro.fuerza : carga;
    lleno.style.height = `${Math.round(fuerza * 100)}%`;
    taco.visible = listo;
    for (const p of [...puntos, ...rumboObjetivo, ...rumboBlanca]) p.visible = false;
    fantasma.visible = false;
    if (listo) {
      const b = blanca(), atras = RADIO + 0.05 + fuerza * 0.8;
      // El taco se inclina un poco y apunta al punto de la blanca que eligió el efecto
      taco.position.set(b.x - Math.sin(apunta) * atras + Math.cos(apunta) * efecto.lado * RADIO * 0.6, ALTO_PANO + RADIO + 0.05 + efecto.alto * RADIO * 0.6, b.z - Math.cos(apunta) * atras - Math.sin(apunta) * efecto.lado * RADIO * 0.6);
      taco.rotation.set(-0.08, apunta, 0, 'YXZ');
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
