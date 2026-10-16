// Revisa que los desafíos de Billar se puedan jugar: node pruebas/billar.mjs
import { DESAFIOS, revisar } from '../src/juegos/arcade/billarNiveles.ts';
let malos = 0;
for (const d of DESAFIOS) { const r = revisar(d); console.log(`${r.length ? 'FALLA' : 'OK  '} ${d.nombre}${r.length ? ': ' + r.join(', ') : ''}`); malos += r.length; }
process.exit(malos ? 1 : 0);
