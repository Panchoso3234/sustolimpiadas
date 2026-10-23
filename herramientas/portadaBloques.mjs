// Portada de Lluvia de Bloques (public/juegos/bloques.png, 640 × 360), dibujada en un lienzo.
// Con el sitio corriendo: node herramientas/portadaBloques.mjs
import { writeFileSync } from 'node:fs';
import { abrir, limpiarPerfiles } from '../pruebas/navegador.mjs';

const p = await abrir('http://localhost:5173/#/ajustes', { ancho: 700, alto: 400 });
await new Promise((r) => setTimeout(r, 2500));
const url = await p.js(`(() => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d');
  const cielo = g.createLinearGradient(0, 0, 0, 360); cielo.addColorStop(0, '#140b24'); cielo.addColorStop(1, '#3a1a3a'); g.fillStyle = cielo; g.fillRect(0, 0, 640, 360);
  g.fillStyle = '#fff4c8'; g.beginPath(); g.arc(540, 70, 34, 0, 7); g.fill();
  const C = ['', '#9a6bff', '#ff8a2a', '#3fe07a', '#ff5a8a', '#ffd23c', '#4aa8ff', '#e8e2d0', '#5a5866'];
  const S = ['', '|', '●', '▲', 'S', 'Z', '◆', '✚', '✝'];
  const L = 22, x0 = 210, y0 = 22;
  g.fillStyle = '#120e22'; g.fillRect(x0 - 6, y0 - 6, L * 10 + 12, L * 14 + 12);
  g.strokeStyle = '#b17cff'; g.lineWidth = 5; g.strokeRect(x0 - 6, y0 - 6, L * 10 + 12, L * 14 + 12);
  g.strokeStyle = '#2e2650'; g.lineWidth = 1; for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(x0 + i * L, y0); g.lineTo(x0 + i * L, y0 + L * 14); g.stroke(); } for (let j = 0; j <= 14; j++) { g.beginPath(); g.moveTo(x0, y0 + j * L); g.lineTo(x0 + L * 10, y0 + j * L); g.stroke(); }
  const bloque = (cx, cy, k) => { const x = x0 + cx * L, y = y0 + cy * L; g.fillStyle = C[k]; g.beginPath(); g.roundRect(x + 1, y + 1, L - 2, L - 2, 4); g.fill(); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + 3, y + 3, L - 8, 4); g.fillStyle = 'rgba(20,10,30,0.55)'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(S[k], x + L / 2, y + L / 2 + 1); };
  const filas = ['8888888.88', '6668838888', '6213335.22', '1213.5522.', '12..55..7.', '1....4477.', '......47..'];
  filas.forEach((f, i) => [...f].forEach((ch, x) => { if (ch !== '.') bloque(x, 13 - i, Number(ch)); }));
  [[4, 2], [3, 3], [4, 3], [5, 3]].forEach(([x, y]) => bloque(x, y, 3));
  g.globalAlpha = 0.18; [[4, 6], [3, 7], [4, 7], [5, 7]].forEach(([x, y]) => { g.fillStyle = '#fff'; g.fillRect(x0 + x * L + 1, y0 + y * L + 1, L - 2, L - 2); }); g.globalAlpha = 1;
  for (const lado of [-1, 1]) { const cx = 320 + lado * 215; g.fillStyle = '#1c1c22'; g.beginPath(); g.ellipse(cx, 300, 62, 46, 0, 0, Math.PI); g.fill(); g.fillStyle = '#5aff8a'; g.beginPath(); g.ellipse(cx, 300, 52, 12, 0, 0, 7); g.fill();
    for (let i = 0; i < 3; i++) { g.fillStyle = '#e8761a'; g.beginPath(); g.ellipse(cx + lado * (78 + i * 26), 336 - i * 4, 18 - i * 2, 14 - i * 2, 0, 0, 7); g.fill(); } }
  g.fillStyle = 'rgba(255,240,200,0.9)'; g.font = 'bold 13px sans-serif'; g.textAlign = 'left';
  return c.toDataURL('image/png');
})()`);
writeFileSync('public/juegos/bloques.png', Buffer.from(url.split(',')[1], 'base64'));
console.log('listo: public/juegos/bloques.png');
p.cerrar();
await limpiarPerfiles();
