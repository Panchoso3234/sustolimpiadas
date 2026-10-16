// Prepara los avatares chibi para el sitio: node herramientas/chibis.mjs
// Baja los 16 diseños de "Xmas Chibis" (VRM, CC0 según el registro Open Source Avatars de ToxSam:
// https://github.com/ToxSam/open-source-avatars), cambia su textura PNG por una JPG más liviana y guarda
// un retrato de cada uno. Deja todo en public/avatares/chibis/. Necesita Windows (usa PowerShell para las imágenes).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REGISTRO = 'https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data/avatars/xmas-chibis.json';
const PUERTAS = ['https://gateway.pinata.cloud/ipfs/', 'https://cloudflare-ipfs.com/ipfs/'];
const VARIANTE = process.argv[2] ?? 'Neutral';
const SALIDA = 'public/avatares/chibis', TMP = join(tmpdir(), 'chibis');
mkdirSync(SALIDA, { recursive: true }); mkdirSync(TMP, { recursive: true });

const bajar = async (url) => {
  for (const p of PUERTAS) {
    try { const r = await fetch(url.replace('https://dweb.link/ipfs/', p)); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch { /* otra puerta */ }
  }
  throw new Error(`no se pudo bajar ${url}`);
};
/** Convierte o achica una imagen con System.Drawing (PNG → JPG, al tamaño pedido; con `cuadrado`, recorta al centro). */
const imagen = (entrada, salida, lado, cuadrado = false) => execFileSync('powershell', ['-NoProfile', '-Command', `
  Add-Type -AssemblyName System.Drawing
  $im = [System.Drawing.Image]::FromFile('${entrada}')
  $s = [math]::Min($im.Width, $im.Height)
  $b = New-Object System.Drawing.Bitmap ${lado}, ${lado}
  $g = [System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode = 'HighQualityBicubic'
  if (${cuadrado ? '$true' : '$false'}) { $g.DrawImage($im, (New-Object System.Drawing.Rectangle 0,0,${lado},${lado}), (New-Object System.Drawing.Rectangle ([int](($im.Width-$s)/2)), 0, $s, $s), 'Pixel') } else { $g.DrawImage($im, 0, 0, ${lado}, ${lado}) }
  $c = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $p = New-Object System.Drawing.Imaging.EncoderParameters 1; $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 88L
  $b.Save('${salida}', $c, $p); $im.Dispose(); $b.Dispose()`]);

/** Rehace el GLB cambiando la imagen `cual` por bytes JPG nuevos (se reacomodan los bloques del binario). */
function cambiarImagen(glb, cual, jpg) {
  const largoJson = glb.readUInt32LE(12), json = JSON.parse(glb.slice(20, 20 + largoJson).toString()), bin = glb.slice(20 + largoJson + 8);
  const vistas = json.bufferViews.map((v, i) => (i === json.images[cual].bufferView ? jpg : bin.slice(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)));
  const partes = []; let pos = 0;
  vistas.forEach((datos, i) => { const relleno = (4 - (pos % 4)) % 4; if (relleno) { partes.push(Buffer.alloc(relleno)); pos += relleno; } json.bufferViews[i].byteOffset = pos; json.bufferViews[i].byteLength = datos.length; partes.push(datos); pos += datos.length; });
  const relleno = (4 - (pos % 4)) % 4; if (relleno) partes.push(Buffer.alloc(relleno));
  const nuevoBin = Buffer.concat(partes);
  json.buffers[0].byteLength = nuevoBin.length;
  json.images[cual].mimeType = 'image/jpeg';
  let texto = Buffer.from(JSON.stringify(json)); texto = Buffer.concat([texto, Buffer.alloc((4 - (texto.length % 4)) % 4, 0x20)]);
  const cab = Buffer.alloc(12), cj = Buffer.alloc(8), cb = Buffer.alloc(8);
  cj.writeUInt32LE(texto.length, 0); cj.write('JSON', 4); cb.writeUInt32LE(nuevoBin.length, 0); cb.write('BIN\0', 4);
  cab.write('glTF', 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + texto.length + 8 + nuevoBin.length, 8);
  return Buffer.concat([cab, cj, texto, cb, nuevoBin]);
}

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
