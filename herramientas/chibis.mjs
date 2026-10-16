// Prepara los avatares chibi para el sitio: node herramientas/chibis.mjs
// Baja los 16 diseños de "Xmas Chibis" (VRM, CC0 según el registro Open Source Avatars de ToxSam:
// https://github.com/ToxSam/open-source-avatars), cambia su textura PNG por una JPG más liviana y guarda
// un retrato de cada uno. Deja todo en public/avatares/chibis/. Necesita Windows (usa PowerShell para las imágenes).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bajar, cambiarImagen, imagen } from './glb.mjs';

const REGISTRO = 'https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data/avatars/xmas-chibis.json';
const VARIANTE = process.argv[2] ?? 'Neutral';
const SALIDA = 'public/avatares/chibis', TMP = join(tmpdir(), 'chibis');
mkdirSync(SALIDA, { recursive: true }); mkdirSync(TMP, { recursive: true });

const lista = await (await fetch(REGISTRO)).json(), hechos = [];
for (let n = 1; n <= 16; n++) {
  const id = `chibi-${String(n).padStart(2, '0')}`, a = lista.find((x) => x.model_file_url.endsWith(`Avatar${String(n).padStart(2, '0')}_${VARIANTE}.vrm`));
  if (!a) { console.log('falta', id); continue; }
  if (!existsSync(join(SALIDA, `${id}.vrm`))) {
    const glb = await bajar(a.model_file_url), json = JSON.parse(glb.slice(20, 20 + glb.readUInt32LE(12)).toString());
    const cual = json.images.findIndex((im) => /albedo/i.test(im.name ?? '')), v = json.bufferViews[json.images[cual].bufferView];
    const png = join(TMP, `${id}.png`), jpg = join(TMP, `${id}.jpg`);
    writeFileSync(png, glb.slice(20 + glb.readUInt32LE(12) + 8 + (v.byteOffset ?? 0), 20 + glb.readUInt32LE(12) + 8 + (v.byteOffset ?? 0) + v.byteLength));
    imagen(png, jpg, 1024);
    writeFileSync(join(SALIDA, `${id}.vrm`), cambiarImagen(glb, cual, readFileSync(jpg)));
    const foto = join(TMP, `${id}-foto.png`);
    writeFileSync(foto, await bajar(a.thumbnail_url));
    imagen(foto, join(process.cwd(), SALIDA, `${id}.jpg`), 256, true);
  }
  hechos.push({ id, nombre: a.name, archivo: `${id}.vrm` });
  console.log('listo', id, a.name);
}
writeFileSync(join(SALIDA, 'chibis.json'), JSON.stringify(hechos, null, 2));
rmSync(TMP, { recursive: true, force: true });
