// Revisa que los tres pisos de Ladrón del Museo se puedan jugar: node pruebas/museo.mjs
import { NIVELES, revisar } from '../src/juegos/arcade/museoNiveles.ts';
let malos = 0;
for (const n of NIVELES) { const r = revisar(n); console.log(`${r.length ? 'FALLA' : 'OK  '} ${n.nombre}${r.length ? ': ' + r.join(', ') : ''}`); malos += r.length; }
process.exit(malos ? 1 : 0);
