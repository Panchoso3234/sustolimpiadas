import * as THREE from 'three';
import { azar } from '../nucleo/azar';
import { premio, type Vitrina } from '../juegos/progreso';
import { SITIOS, terreno } from './cerebro';

// Barrio de los Participantes: alrededor de la plaza de la calabaza gigante, una casita por cada inscrito.
// La casa muestra su nombre, su título y su nivel del pase, y lleva los adornos que eligió (calabazas, farolas,
// fantasma mascota, caldero, murciélagos, telarañas, árbol embrujado, trofeo y hasta una torre al nivel 30).
// Las casas se arman una vez al cargar la isla con lo que diga la vitrina de cada uno.

const COLORES = ['#e8573a', '#3fa3dc', '#8a5ce6', '#2fae86', '#e85aa2', '#7ab33c', '#ff9a2e', '#5a6acf', '#c94a6a', '#3fb8b0'];
const PAREDES = ['#f6e7d2', '#e8f1f8', '#efe6ff', '#e2f6ea', '#fff0e0', '#f1e8dc'];
/** Anillos de casas: radio y cuántas caben (cada casa ocupa unos 3,8 m de arco). */
const ANILLOS = [{ r: 7.4, n: 10 }, { r: 11.6, n: 16 }, { r: 15.4, n: 22 }];

export interface Vecino { clave: string; nombre: string; vitrina: Vitrina | null }

export function crearBarrio(escena: THREE.Scene, vecinos: Vecino[]) {
  const raiz = new THREE.Group(), interactivos: THREE.Object3D[] = [], animados: ((seg: number, noche: number) => void)[] = [];
  raiz.position.set(SITIOS.barrio.x, 0, SITIOS.barrio.z);
  escena.add(raiz);
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const m = (color: string) => { let x = mats.get(color); if (!x) { x = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }); mats.set(color, x); } return x; };
  const luces: THREE.MeshStandardMaterial[] = [];
  const brilla = (color: string) => { const x = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.1, roughness: 0.5 }); luces.push(x); return x; };
  const ventana = brilla('#ffd45a'), zapallo = brilla('#ff8a1e'), verdeBrujo = brilla('#7cff6a');
  const cubo = new THREE.BoxGeometry(1, 1, 1), bola = new THREE.IcosahedronGeometry(1, 1);
  const pon = (padre: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], e: [number, number, number] = [1, 1, 1], r: [number, number, number] = [0, 0, 0]) => {
    const o = new THREE.Mesh(geo, mat); o.position.set(...p); o.scale.set(...e); o.rotation.set(...r); o.castShadow = o.receiveShadow = true; padre.add(o); return o;
  };
  const cartel = (lineas: string[], ancho: number, alto: number) => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round((512 * alto) / ancho);
    const g = cv.getContext('2d')!;
    g.fillStyle = '#3a2516'; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#ffe08a'; g.lineWidth = 8; g.strokeRect(6, 6, cv.width - 12, cv.height - 12);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lineas.forEach((l, i) => {
      let tam = i === 0 ? 64 : 38;
      g.font = `${i === 0 ? 800 : 700} ${tam}px Nunito, sans-serif`;
      while (g.measureText(l).width > cv.width - 40 && tam > 14) { tam -= 2; g.font = `${i === 0 ? 800 : 700} ${tam}px Nunito, sans-serif`; }
      g.fillStyle = i === 0 ? '#f3ecdc' : '#ffe08a';
      g.fillText(l, cv.width / 2, (cv.height / (lineas.length + 1)) * (i + 1));
    });
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.MeshBasicMaterial({ map: t }));
  };

  vecinos.slice(0, ANILLOS.reduce((s, a) => s + a.n, 0)).forEach((v, i) => {
    // En qué anillo y en qué lugar del anillo va (dejando libre la entrada que mira al pueblo)
    let k = i, anillo = 0;
    while (k >= ANILLOS[anillo].n) { k -= ANILLOS[anillo].n; anillo++; }
    const { r, n } = ANILLOS[anillo], hueco = 0.5, a = Math.atan2(-SITIOS.barrio.x, -SITIOS.barrio.z) + hueco + ((k + 0.5) / n) * (Math.PI * 2 - hueco * 2) + anillo * 0.12;
    const x = Math.sin(a) * r, z = Math.cos(a) * r, y = terreno(SITIOS.barrio.x + x, SITIOS.barrio.z + z);
    const casa = new THREE.Group(); casa.position.set(x, y, z); casa.rotation.y = a + Math.PI; // la puerta mira a la plaza
    casa.userData.info = `hogar-${v.clave}`;
    raiz.add(casa); interactivos.push(casa);
    const tono = (x: string) => azar('barrio', v.clave, x);
    const color = COLORES[Math.floor(tono('color') * COLORES.length)], pared = m(PAREDES[Math.floor(tono('pared') * PAREDES.length)]);
    const vit = v.vitrina, deco = new Set(vit?.deco ?? []);
    // Casa: base, paredes, techo de cuatro aguas, puerta, ventanas y chimenea
    pon(casa, cubo, m('#8d8a99'), [0, 0.1, 0], [2.7, 0.2, 2.5]);
    pon(casa, cubo, pared, [0, 1.05, 0], [2.3, 1.7, 2.1]);
    pon(casa, new THREE.ConeGeometry(1.95, 1.35, 4), m(color), [0, 2.55, 0], [1, 1, 1], [0, Math.PI / 4, 0]);
    pon(casa, cubo, m(color), [0, 0.75, 1.06], [0.62, 1.1, 0.06]);
    pon(casa, cubo, ventana, [-0.72, 1.2, 1.06], [0.44, 0.44, 0.05]);
    pon(casa, cubo, ventana, [0.72, 1.2, 1.06], [0.44, 0.44, 0.05]);
    pon(casa, cubo, m('#a5523a'), [0.6, 2.6, -0.4], [0.32, 0.8, 0.32]);
    // Letrero con nombre, título y nivel
    const t = premio('titulo', vit?.titulo), letrero = cartel([v.nombre || 'Sin nombre', t ? `${t.icono} ${t.nombre}` : `Nivel ${vit?.nivel ?? 1}`, `Nivel ${vit?.nivel ?? 1} · 🏅 ${vit?.logros ?? 0}`].slice(0, t ? 3 : 2), 1.9, t ? 0.95 : 0.7);
    letrero.position.set(0, 0.95, 1.95); casa.add(letrero);
    for (const s of [-0.8, 0.8]) pon(casa, cubo, m('#5a3b22'), [s, 0.5, 1.92], [0.08, 1, 0.08]);
    // Banderín con el color de su marco del pase
    if (vit?.marco) { pon(casa, new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), m('#5a3b22'), [-1, 3.0, -0.6]); pon(casa, cubo, brilla({ calabaza: '#ff9a2e', telarana: '#d8dde8', fatuo: '#5ad1ff', luna: '#ffe08a', arcoiris: '#ff7ab8', dorado: '#ffd23c', aurora: '#3fe07a' }[vit.marco] ?? '#ffffff'), [-0.75, 3.5, -0.6], [0.5, 0.32, 0.03]); }
    // Adornos del pase
    if (deco.has('calabazas')) for (const s of [-1, 1]) { pon(casa, bola, zapallo, [s * 0.75, 0.38, 1.55], [0.3, 0.24, 0.3]); pon(casa, new THREE.CylinderGeometry(0.03, 0.05, 0.12, 5), m('#3f9d6b'), [s * 0.75, 0.66, 1.55]); }
    if (deco.has('farolas')) for (const s of [-1, 1]) { pon(casa, new THREE.CylinderGeometry(0.05, 0.06, 1.7, 6), m('#2a2633'), [s * 1.45, 0.85, 1.7]); pon(casa, bola, ventana, [s * 1.45, 1.78, 1.7], [0.17, 0.2, 0.17]); }
    if (deco.has('lapida')) { pon(casa, cubo, m('#8d8a99'), [1.65, 0.45, 0.2], [0.5, 0.7, 0.16]); pon(casa, new THREE.CylinderGeometry(0.25, 0.25, 0.16, 10), m('#8d8a99'), [1.65, 0.8, 0.2], [1, 1, 1], [Math.PI / 2, 0, 0]); }
    if (deco.has('caldero')) { pon(casa, bola, m('#1c1826'), [-1.65, 0.38, 0.9], [0.42, 0.34, 0.42]); pon(casa, new THREE.CylinderGeometry(0.33, 0.33, 0.05, 12), verdeBrujo, [-1.65, 0.62, 0.9]); }
    if (deco.has('arbol')) { const g = new THREE.Group(); g.position.set(-1.9, 0, -1.2); casa.add(g); pon(g, new THREE.CylinderGeometry(0.1, 0.2, 2.6, 6), m('#3a2f3a'), [0, 1.3, 0]); for (const [rz, ry, h] of [[0.9, 0, 1.8], [-0.8, 2, 2.2], [0.7, 4, 2.5]]) { const rama = new THREE.Group(); rama.position.y = h; rama.rotation.set(0, ry, rz); g.add(rama); pon(rama, new THREE.CylinderGeometry(0.03, 0.07, 1, 5), m('#3a2f3a'), [0, 0.5, 0]); } }
    if (deco.has('trofeo')) { pon(casa, cubo, m('#8d8a99'), [1.6, 0.35, 1.3], [0.45, 0.5, 0.45]); const oro = brilla('#ffd23c'); pon(casa, new THREE.CylinderGeometry(0.22, 0.08, 0.38, 10), oro, [1.6, 0.85, 1.3]); pon(casa, new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8), oro, [1.6, 0.64, 1.3]); }
    if (deco.has('torre')) { pon(casa, new THREE.CylinderGeometry(0.55, 0.6, 3.6, 10), pared, [1.25, 1.8, -0.9]); pon(casa, new THREE.ConeGeometry(0.75, 1.3, 10), m(color), [1.25, 4.2, -0.9]); pon(casa, cubo, ventana, [1.25, 2.8, -0.35], [0.24, 0.36, 0.05]); }
    if (deco.has('telaranas')) { const red = cartel(['🕸️'], 0.9, 0.9); (red.material as THREE.MeshBasicMaterial).transparent = true; (red.material as THREE.MeshBasicMaterial).opacity = 0.75; red.position.set(1.16, 1.5, 1.07); casa.add(red); }
    if (deco.has('fantasma')) {
      const mat = new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.7, depthWrite: false }), f = new THREE.Group();
      pon(f, bola, mat, [0, 0.3, 0], [0.32, 0.38, 0.32]); pon(f, new THREE.ConeGeometry(0.32, 0.5, 8), mat, [0, -0.05, 0], [1, 1, 1], [Math.PI, 0, 0]);
      casa.add(f);
      const fase = tono('fantasma') * 6;
      animados.push((seg) => { f.position.set(Math.sin(seg * 0.6 + fase) * 1.4, 2 + Math.sin(seg * 1.7 + fase) * 0.25, 1.6 + Math.cos(seg * 0.6 + fase) * 0.5); });
    }
    if (deco.has('murcielagos')) {
      const ala = new THREE.ConeGeometry(0.16, 0.45, 3), negro = m('#16121f');
      for (const s of [-1, 1]) {
        const b = new THREE.Group(); b.position.set(s * 0.5, 3.5, 0.3); casa.add(b);
        const i1 = pon(b, ala, negro, [0.2, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]), i2 = pon(b, ala, negro, [-0.2, 0, 0], [1, 1, 1], [0, 0, -Math.PI / 2]);
        const fase = tono(`m${s}`) * 6;
        animados.push((seg) => { const f = Math.sin(seg * 14 + fase) * 0.5; i1.rotation.x = f; i2.rotation.x = -f; b.position.y = 3.5 + Math.sin(seg * 2 + fase) * 0.15; });
      }
    }
  });
  animados.push((_seg, noche) => { for (const x of luces) x.emissiveIntensity = 0.1 + noche * 1.3; });
  return {
    interactivos,
    actualizar(seg: number, noche: number) { for (const f of animados) f(seg, noche); },
  };
}
