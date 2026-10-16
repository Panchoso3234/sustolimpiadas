// Revisa que la cocina de Cocina Caótica se pueda jugar: node pruebas/cocina.mjs
import { revisar } from '../src/juegos/arcade/cocinaRecetas.ts';
const malos = revisar();
console.log(malos.length ? `FALLA ${malos.join(', ')}` : 'OK   la cocina y sus recetas');
process.exit(malos.length ? 1 : 0);
