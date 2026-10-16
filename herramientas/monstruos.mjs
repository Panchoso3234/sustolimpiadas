// Prepara los monstruos de Halloween para el sitio: node herramientas/monstruos.mjs
// Baja 5 diseños "Cute" de "Halloween Rising" (Polygonal Mind, VRM, CC0 según el registro Open Source Avatars de ToxSam:
// https://github.com/ToxSam/open-source-avatars) y pasa sus texturas PNG a JPG. Deja todo en public/avatares/monstruos/.
// Los retratos se sacan después con node herramientas/retratos.mjs (con el sitio corriendo).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bajar, cambiarImagen, imagen, leerGlb } from './glb.mjs';

const REGISTRO = 'https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data/avatars/halloween-rising.json';
// Debe calzar con MONSTRUOS en src/personaje/vrm.ts
const ELEGIDOS = ['Mocking Spit: Grape', 'Mimic Slime: Orange', 'Esktix: Midnight', 'Harvester: Lavender', 'Wendigo: Star Sky'];
const SALIDA = 'public/avatares/monstruos', TMP = join(tmpdir(), 'monstruos');
mkdirSync(SALIDA, { recursive: true }); mkdirSync(TMP, { recursive: true });

const lista = await (await fetch(REGISTRO)).json();
for (const [n, nombre] of ELEGIDOS.entries()) {
  const id = `monstruo-${String(n + 1).padStart(2, '0')}`, a = lista.find((x) => x.name === nombre);
  if (!a) { console.log('falta', nombre); continue; }
  if (existsSync(join(SALIDA, `${id}.vrm`))) { console.log('ya estaba', id); continue; }
  let glb = await bajar(a.model_file_url);
  // Cada imagen PNG (color y relieve) pasa a JPG: la de color a 1024 px y las demás a 512 (el juego no usa relieve)
  for (const [cual, im] of leerGlb(glb).json.images.entries()) {
    if (/thumbnail/i.test(im.name ?? '')) continue;
    const png = join(TMP, `${id}-${cual}.png`), jpg = join(TMP, `${id}-${cual}.jpg`);
    writeFileSync(png, leerGlb(glb).bytesImagen(cual));
    imagen(png, jpg, /albedo/i.test(im.name ?? '') ? 1024 : 512);
    glb = cambiarImagen(glb, cual, readFileSync(jpg));
  }
  writeFileSync(join(SALIDA, `${id}.vrm`), glb);
  console.log('listo', id, nombre, `${(glb.length / 1e6).toFixed(1)} MB`);
}
rmSync(TMP, { recursive: true, force: true });
