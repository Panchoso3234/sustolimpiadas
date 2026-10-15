// Uso: node pruebas/vivo.mjs <grupo>   (con `npm run dev` corriendo en el puerto 5173)
import { abrir, hasta } from './navegador.mjs';

const BASE = 'http://localhost:5173/';
const grupos = {
  async asientos() {
    const p = await abrir(`${BASE}#/juegos/vivo`);
    try {
      await hasta(() => p.js('!!window.__vivo'));
      const fallas = await p.js('window.__vivo.probarAsientos()');
      for (const f of fallas ?? []) console.log('  ', f);
      return { 'reglas de asientos': Array.isArray(fallas) && fallas.length === 0 };
    } finally { p.cerrar(); }
  },
  async humo() {
    const p = await abrir(`${BASE}#/juegos/vivo`);
    try { return { 'la pestaña En vivo carga': await hasta(() => p.js(`!!document.querySelector('.vivo-lista, .rejilla-juegos')`)) }; } finally { p.cerrar(); }
  },
};

const grupo = process.argv[2] ?? 'humo';
const resultados = await grupos[grupo]();
let malas = 0;
for (const [nombre, ok] of Object.entries(resultados)) { console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`); if (!ok) malas++; }
process.exit(malas ? 1 : 0);
