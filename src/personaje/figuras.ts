import type { Receta } from './figura';

// Las recetas de las figuras chibi: creaciones de fans, sin fines comerciales, inspiradas en personajes de
// Genshin Impact, Honkai: Star Rail y Zenless Zone Zero (© HoYoverse). Agregar un personaje = agregar una receta.

export const FIGURAS: Record<string, Receta> = {
  firefly: {
    nombre: 'Firefly', juego: 'Honkai: Star Rail', ojos: '#2fc4c0', boca: 'sonrisa',
    pelo: { color: '#eef0f6', punta: '#cfeee6', peinado: 'largo' },
    ropa: { arriba: '#1e2229', abajo: '#9fe3cc', falda: true, borde: '#ffffff', mangas: '#ffffff', guantes: '#1e2229', medias: '#1e2229', zapatos: '#f2f2f2' },
    accesorios: [{ tipo: 'cintillo', color: '#15171c' }, { tipo: 'lazo', color: '#7fd8bd', lado: -1, alto: 0.32 }, { tipo: 'corbata', color: '#7fd8bd' }],
  },
  furina: {
    nombre: 'Furina', juego: 'Genshin Impact', ojos: ['#2a5fd0', '#7fd2ff'], boca: 'abierta',
    pelo: { color: '#f4f6fc', punta: '#8cc8ff', peinado: 'medio' },
    ropa: { arriba: '#24345e', abajo: '#f4f6fc', mangas: '#24345e', guantes: '#ffffff', medias: '#1d2440', zapatos: '#1d2440' },
    accesorios: [{ tipo: 'sombrero', color: '#1d2440', cinta: '#8cc8ff', inclinado: 0.3 }, { tipo: 'corbata', color: '#8cc8ff' }],
  },
};
