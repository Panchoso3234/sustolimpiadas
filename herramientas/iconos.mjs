// Íconos del sitio (PNG desde public/icono.svg) y la imagen que muestra Discord al compartir el link (1200×630,
// una foto de la isla con el nombre del torneo). Con el sitio corriendo: node herramientas/iconos.mjs
import { writeFileSync } from 'node:fs';
import { abrir, limpiarPerfiles } from '../pruebas/navegador.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Íconos: el SVG dibujado en un lienzo a cada tamaño
const p = await abrir('http://localhost:5173/#/ajustes', { ancho: 600, alto: 600 });
await pausa(2500);
const iconos = JSON.parse(await p.js(`(async () => {
  const img = new Image(); img.src = 'icono.svg'; await img.decode();
  const salida = {};
  for (const lado of [180, 192, 512]) {
    const c = document.createElement('canvas'); c.width = c.height = lado;
    c.getContext('2d').drawImage(img, 0, 0, lado, lado);
    salida[lado] = c.toDataURL('image/png');
  }
  return JSON.stringify(salida);
})()`));
for (const [lado, url] of Object.entries(iconos)) writeFileSync(`public/icono-${lado}.png`, Buffer.from(url.split(',')[1], 'base64'));
p.cerrar();

// 2. Portada para compartir: la isla sin botones, con el título encima
const q = await abrir('http://localhost:5173/#/isla', { ancho: 1200, alto: 630 });
await pausa(10000);
await q.js(`(() => {
  localStorage.setItem('susto.recorrido', 'true');
  document.querySelector('.recorrido')?.remove();
  const estilo = document.createElement('style');
  estilo.textContent = '.barra, .isla-hud, .isla-botones, .isla-menu, .isla-ayuda { display: none !important; }';
  document.head.append(estilo);
  const titulo = document.createElement('div');
  titulo.style.cssText = 'position:fixed;left:0;right:0;bottom:0;padding:40px 56px 44px;background:linear-gradient(transparent,rgba(12,19,36,.92) 45%);font-family:Nunito,sans-serif;color:#fdf3e1;z-index:9';
  titulo.innerHTML = '<div style="font:88px/1 \\'Alfa Slab One\\',serif;color:#f58a24;text-shadow:0 4px 0 #2a1408">Las Sustolimpiadas</div><div style="font-size:34px;font-weight:800;margin-top:12px">35 minijuegos · duelos en vivo · tu personaje en la isla</div>';
  document.body.append(titulo);
  return true;
})()`);
await pausa(2500);
await q.foto('public/portada.png');
q.cerrar();
await limpiarPerfiles();
console.log('listo');
