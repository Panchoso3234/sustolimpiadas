// Saca los retratos de la galería para los chibis disfrazados y los monstruos (256×256 JPG):
//   node herramientas/retratos.mjs            (con el sitio corriendo en localhost:5173)
//   node herramientas/retratos.mjs chibi-03-h monstruo-02   (solo algunos)
// Los deja en public/avatares/halloween/ (los dos disfraces) y public/avatares/monstruos/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { abrir, limpiarPerfiles } from '../pruebas/navegador.mjs';

const pedidos = process.argv.slice(2);
const p = await abrir('http://localhost:5173/#/juegos', { ancho: 600, alto: 600 });
await new Promise((r) => setTimeout(r, 4000));
const fotos = JSON.parse(await p.js(`(async () => {
  document.body.innerHTML = '';
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const { crearVrm, HALLOWEEN, HALLOWEEN2, MONSTRUOS } = await import('/src/personaje/vrm.ts');
  const pedidos = ${JSON.stringify(pedidos)}, ids = [...HALLOWEEN, ...HALLOWEEN2, ...MONSTRUOS].map(([id]) => id).filter((id) => !pedidos.length || pedidos.includes(id));
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(256, 256, false);
  const esc = new THREE.Scene(); esc.background = new THREE.Color('#2a1f4e');
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50), fotos = {};
  for (const id of ids) {
    const k = await crearVrm(id), monstruo = id.startsWith('monstruo-');
    esc.add(k.grupo); k.grupo.userData.avanzar(0.6);
    // Encuadre: la cara de los chibis (con su sombrero) o el cuerpo entero de los monstruos
    const caja = new THREE.Box3().setFromObject(k.grupo, true), alto = caja.max.y - caja.min.y;
    const cabeza = k.grupo.userData.vrm.humanoid.getNormalizedBoneNode('head').getWorldPosition(new THREE.Vector3()).y;
    // Monstruos: los redondos salen enteros; a los alargados se les centra en la cabeza
    const ancho = Math.max(caja.max.x - caja.min.x, caja.max.z - caja.min.z), redondo = ancho > alto * 0.8;
    const centro = !monstruo ? cabeza + 0.4 : redondo ? (caja.max.y + caja.min.y) / 2 : cabeza;
    const d = !monstruo ? 2.9 : redondo ? Math.max(alto, ancho) * 2 : (cabeza - caja.min.y) * 1.7;
    cam.position.set(0.25, centro + 0.05, d); cam.lookAt(0, centro, 0);
    r.render(esc, cam); fotos[id] = r.domElement.toDataURL('image/jpeg', 0.88);
    esc.remove(k.grupo);
  }
  return JSON.stringify(fotos);
})()`));
for (const [id, url] of Object.entries(fotos)) {
  const dir = `public/avatares/${id.startsWith('monstruo-') ? 'monstruos' : 'halloween'}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${id}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('listo', id);
}
if (p.errores.length) console.log('errores en la página:', p.errores.join('\n').slice(0, 800));
p.cerrar(); await limpiarPerfiles();
