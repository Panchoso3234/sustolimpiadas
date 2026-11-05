import type { Cancion, Nota } from './canciones';

// Clásicos de dominio público para Teclas del Faro (04-11): melodías principales de obras cuyos autores murieron hace
// más de 100 años (o tradicionales), escritas nota por nota. Se tocan con el sintetizador del juego, sin grabaciones.
// Formato: "Nota:duración" separadas por espacio; la duración va en semicorcheas (u = 1) o en corcheas (u = 2).
// "R" es silencio. tr sube o baja todo en semitonos. La melodía se repite hasta durar unos 45 segundos.

interface Clasica { id: string; titulo: string; autor: string; es: string; nivel: 1 | 2 | 3; bpm: number; u?: number; tr?: number; mel: string }

export const CLASICAS: Clasica[] = [
  { id: 'elisa', titulo: 'Für Elise', autor: 'Ludwig van Beethoven', es: 'Para Elisa', nivel: 2, bpm: 76,
    mel: 'E5:1 D#5:1 E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 A4:3 C4:1 E4:1 A4:1 B4:3 E4:1 G#4:1 B4:1 C5:3 E4:1 E5:1 D#5:1 E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 A4:3 C4:1 E4:1 A4:1 B4:3 E4:1 C5:1 B4:1 A4:4 B4:1 C5:1 D5:1 E5:3 G4:1 F5:1 E5:1 D5:3 F4:1 E5:1 D5:1 C5:3 E4:1 D5:1 C5:1 B4:3 E4:1 E5:2' },
  { id: 'alegria', titulo: 'Ode an die Freude', autor: 'Ludwig van Beethoven (Sinfonía n.º 9)', es: 'Himno de la Alegría', nivel: 1, bpm: 116, tr: 12,
    mel: 'E4:4 E4:4 F4:4 G4:4 G4:4 F4:4 E4:4 D4:4 C4:4 C4:4 D4:4 E4:4 E4:6 D4:2 D4:8 E4:4 E4:4 F4:4 G4:4 G4:4 F4:4 E4:4 D4:4 C4:4 C4:4 D4:4 E4:4 D4:6 C4:2 C4:8 D4:4 D4:4 E4:4 C4:4 D4:4 E4:2 F4:2 E4:4 C4:4 D4:4 E4:2 F4:2 E4:4 D4:4 C4:4 D4:4 G3:8 E4:4 E4:4 F4:4 G4:4 G4:4 F4:4 E4:4 D4:4 C4:4 C4:4 D4:4 E4:4 D4:6 C4:2 C4:8' },
  { id: 'quinta', titulo: 'Sinfonie Nr. 5', autor: 'Ludwig van Beethoven', es: 'Quinta Sinfonía', nivel: 3, bpm: 200,
    mel: 'R:2 G4:2 G4:2 G4:2 Eb4:8 R:2 F4:2 F4:2 F4:2 D4:12 R:2 G4:2 G4:2 G4:2 Eb4:2 Ab4:2 Ab4:2 Ab4:2 G4:2 Eb5:2 Eb5:2 Eb5:2 C5:8 R:2 G4:2 G4:2 G4:2 D4:2 Ab4:2 Ab4:2 Ab4:2 G4:2 F5:2 F5:2 F5:2 D5:8 R:4' },
  { id: 'luna', titulo: 'Mondscheinsonate', autor: 'Ludwig van Beethoven', es: 'Sonata Claro de Luna', nivel: 1, bpm: 58, u: 1,
    mel: 'G#3:2 C#4:2 E4:2 G#3:2 C#4:2 E4:2 G#3:2 C#4:2 E4:2 G#3:2 C#4:2 E4:2 G#3:2 C#4:2 E4:2 G#3:2 C#4:2 E4:2 G#3:2 C#4:2 E4:2 G#3:2 C#4:2 E4:2 A3:2 C#4:2 E4:2 A3:2 C#4:2 E4:2 A3:2 D4:2 F#4:2 A3:2 D4:2 F#4:2 G#3:2 C4:2 F#4:2 G#3:2 C#4:2 E4:2 G#3:2 C#4:2 D#4:2 F#3:2 C4:2 D#4:2 E3:2 G#3:2 C#4:2 G#3:2 C#4:2 E4:2 G#4:6 G#4:2 G#4:8' },
  { id: 'turca', titulo: 'Rondo alla turca', autor: 'Wolfgang Amadeus Mozart', es: 'Marcha Turca', nivel: 3, bpm: 120,
    mel: 'B4:1 A4:1 G#4:1 A4:1 C5:4 D5:1 C5:1 B4:1 C5:1 E5:4 F5:1 E5:1 D#5:1 E5:1 B5:1 A5:1 G#5:1 A5:1 B5:1 A5:1 G#5:1 A5:1 C6:4 A5:2 C6:2 B5:2 A5:2 G5:2 A5:2 B5:2 A5:2 G5:2 A5:2 B5:2 A5:2 G5:2 F#5:2 E5:4' },
  { id: 'serenata', titulo: 'Eine kleine Nachtmusik', autor: 'Wolfgang Amadeus Mozart', es: 'Pequeña serenata nocturna', nivel: 2, bpm: 132,
    mel: 'G4:4 R:2 D4:2 G4:4 R:2 D4:2 G4:2 D4:2 G4:2 B4:2 D5:4 R:4 C5:4 R:2 A4:2 C5:4 R:2 A4:2 C5:2 A4:2 F#4:2 A4:2 D4:4 R:4 G4:2 R:2 G4:4 B4:2 A4:2 G4:2 G4:2 F#4:2 F#4:4 A4:2 C5:2 F#4:2 A4:2 G4:2 G4:4 B4:2 A4:2 G4:2 G4:2 F#4:2 F#4:4 A4:2 C5:2 F#4:2 A4:2 G4:8' },
  { id: 'minueto', titulo: 'Menuet en sol majeur', autor: 'Christian Petzold (atrib. a J. S. Bach)', es: 'Minueto en sol', nivel: 1, bpm: 112, u: 2,
    mel: 'D5:2 G4:1 A4:1 B4:1 C5:1 D5:2 G4:2 G4:2 E5:2 C5:1 D5:1 E5:1 F#5:1 G5:2 G4:2 G4:2 C5:2 D5:1 C5:1 B4:1 A4:1 B4:2 C5:1 B4:1 A4:1 G4:1 F#4:2 G4:1 A4:1 B4:1 G4:1 A4:6 D5:2 G4:1 A4:1 B4:1 C5:1 D5:2 G4:2 G4:2 E5:2 C5:1 D5:1 E5:1 F#5:1 G5:2 G4:2 G4:2 C5:2 D5:1 C5:1 B4:1 A4:1 B4:2 C5:1 B4:1 A4:1 G4:1 A4:2 B4:1 A4:1 G4:1 F#4:1 G4:6' },
  { id: 'canon', titulo: 'Kanon in D', autor: 'Johann Pachelbel', es: 'Canon en re', nivel: 1, bpm: 92,
    mel: 'F#5:8 E5:8 D5:8 C#5:8 B4:8 A4:8 B4:8 C#5:8 D5:4 C#5:4 B4:4 A4:4 G4:4 F#4:4 G4:4 E4:4 D4:2 F#4:2 A4:2 G4:2 F#4:2 D4:2 F#4:2 E4:2 D4:2 B3:2 D4:2 A4:2 G4:2 B4:2 A4:2 G4:2 F#4:2 D4:2 E4:2 C#5:2 D5:2 F#5:2 A5:2 A4:2 B4:2 G4:2 A4:2 F#4:2 D4:2 D5:2 D5:6 C#5:2' },
  { id: 'cancan', titulo: 'Galop infernal (Can-Can)', autor: 'Jacques Offenbach', es: 'Can-Can', nivel: 3, bpm: 150,
    mel: 'C5:4 D5:2 F5:2 E5:2 D5:2 G5:4 G5:4 G5:2 A5:2 E5:2 F5:2 D5:4 D5:4 D5:2 F5:2 E5:2 D5:2 C5:2 C6:2 B5:2 A5:2 G5:2 F5:2 E5:2 D5:2 C5:4 D5:2 F5:2 E5:2 D5:2 G5:4 G5:4 G5:2 A5:2 E5:2 F5:2 D5:4 D5:4 D5:2 F5:2 E5:2 D5:2 C5:2 G5:2 D5:2 E5:2 C5:4' },
  { id: 'danubio', titulo: 'An der schönen blauen Donau', autor: 'Johann Strauss II', es: 'El Danubio Azul', nivel: 2, bpm: 168,
    mel: 'D4:4 D4:4 F#4:4 A4:4 A4:8 A5:4 A5:4 R:4 F#5:4 F#5:4 R:4 D4:4 D4:4 F#4:4 A4:4 A4:8 A5:4 A5:4 R:4 G5:4 G5:4 R:4 C#4:4 C#4:4 E4:4 B4:4 B4:8 B5:4 B5:4 R:4 G5:4 G5:4 R:4 C#4:4 C#4:4 E4:4 B4:4 B4:8 B5:4 B5:4 R:4 F#5:4 F#5:4 R:4 D4:4 D4:4 F#4:4 A4:4 D5:8 D6:4 D6:4 R:4 A5:4 A5:4 R:4' },
  { id: 'gruta', titulo: 'I Dovregubbens hall', autor: 'Edvard Grieg', es: 'En la gruta del rey de la montaña', nivel: 2, bpm: 138, tr: 12,
    mel: 'B3:2 C#4:2 D4:2 E4:2 F#4:2 D4:2 F#4:4 F4:2 C#4:2 F4:4 E4:2 C4:2 E4:4 B3:2 C#4:2 D4:2 E4:2 F#4:2 D4:2 F#4:2 B4:2 A4:2 F#4:2 D4:2 F#4:2 A4:8 F#4:2 G#4:2 A#4:2 B4:2 C#5:2 A#4:2 C#5:4 D5:2 A#4:2 D5:4 C#5:2 A#4:2 C#5:4 F#4:2 G#4:2 A#4:2 B4:2 C#5:2 A#4:2 C#5:2 F#5:2 E5:2 C#5:2 A#4:2 C#5:2 E5:8' },
  { id: 'tell', titulo: 'Guillaume Tell (Ouverture)', autor: 'Gioachino Rossini', es: 'Guillermo Tell', nivel: 3, bpm: 150,
    mel: 'G4:1 G4:1 G4:2 G4:1 G4:1 G4:2 G4:1 G4:1 C5:2 D5:2 E5:2 G4:1 G4:1 G4:2 G4:1 G4:1 G4:2 G4:1 G4:1 E5:2 D5:2 B4:2 G4:1 G4:1 G4:2 G4:1 G4:1 G4:2 G4:1 G4:1 C5:2 D5:2 E5:2 C5:2 E5:2 G5:4 G5:2 E5:2 C5:4' },
  { id: 'cuna', titulo: 'Wiegenlied', autor: 'Johannes Brahms', es: 'Canción de cuna', nivel: 1, bpm: 92, tr: 12,
    mel: 'E4:2 E4:2 G4:8 E4:2 E4:2 G4:8 E4:2 G4:2 C5:4 B4:6 A4:2 A4:4 G4:4 D4:2 E4:2 F4:4 D4:4 D4:2 E4:2 F4:8 D4:2 F4:2 B4:2 A4:2 G4:4 B4:4 C5:8' },
  { id: 'green', titulo: 'Greensleeves', autor: 'Tradicional inglesa', es: 'Mangas verdes', nivel: 1, bpm: 100, u: 2,
    mel: 'A4:2 C5:4 D5:2 E5:3 F5:1 E5:2 D5:4 B4:2 G4:3 A4:1 B4:2 C5:4 A4:2 A4:3 G#4:1 A4:2 B4:4 G#4:2 E4:4 A4:2 C5:4 D5:2 E5:3 F5:1 E5:2 D5:4 B4:2 G4:3 A4:1 B4:2 C5:3 B4:1 A4:2 G#4:3 F#4:1 G#4:2 A4:6' },
  { id: 'cucaracha', titulo: 'La Cucaracha', autor: 'Tradicional mexicana', es: 'La Cucaracha', nivel: 2, bpm: 132, u: 2, tr: 12,
    mel: 'C4:1 C4:1 C4:1 F4:3 A4:2 C4:1 C4:1 C4:1 F4:3 A4:4 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:4 C4:1 C4:1 C4:1 E4:3 G4:2 C4:1 C4:1 C4:1 E4:3 G4:4 C5:1 D5:1 C5:1 Bb4:1 A4:1 G4:1 F4:4' },
  { id: 'habanera', titulo: "L'amour est un oiseau rebelle", autor: 'Georges Bizet (Carmen)', es: 'Habanera', nivel: 2, bpm: 100,
    mel: 'D5:3 C#5:1 C5:2 C5:2 B4:3 Bb4:1 A4:2 A4:2 A4:2 G#4:2 G4:2 F4:2 E4:4 F4:2 E4:2 D5:3 C#5:1 C5:2 C5:2 B4:3 Bb4:1 A4:2 A4:2 A4:2 G#4:2 G4:2 F4:2 E4:8' },
  { id: 'primavera', titulo: 'La primavera', autor: 'Antonio Vivaldi', es: 'La Primavera', nivel: 2, bpm: 104, u: 2,
    mel: 'E5:2 G#5:2 G#5:2 G#5:2 F#5:1 E5:1 B5:6 B5:1 A5:1 G#5:2 G#5:2 G#5:2 F#5:1 E5:1 B5:6 B5:1 A5:1 G#5:2 A5:1 B5:1 A5:2 G#5:2 F#5:4 E5:2 G#5:2 G#5:2 G#5:2 F#5:1 E5:1 B5:6 B5:1 A5:1 G#5:2 A5:1 B5:1 A5:2 G#5:2 F#5:2 D#5:2 E5:4' },
  { id: 'mundo', titulo: 'Z Nového světa (Largo)', autor: 'Antonín Dvořák', es: 'Sinfonía del Nuevo Mundo', nivel: 1, bpm: 72, u: 2, tr: 12,
    mel: 'E4:3 G4:1 G4:4 E4:3 D4:1 C4:4 D4:2 E4:2 G4:2 E4:2 D4:8 E4:3 G4:1 G4:4 E4:3 D4:1 C4:4 D4:2 E4:2 D4:2 C4:2 C4:8' },
  { id: 'nupcial', titulo: 'Treulich geführt (Brautchor)', autor: 'Richard Wagner (Lohengrin)', es: 'Marcha nupcial', nivel: 1, bpm: 88,
    mel: 'C4:4 F4:3 F4:1 F4:8 C4:4 G4:3 E4:1 F4:8 C4:4 F4:3 Bb4:1 Bb4:4 A4:3 G4:1 F4:3 E4:1 F4:3 G4:1 F4:8', tr: 12 },
];

const NOTAS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (n: string) => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(n); if (!m) throw new Error(`Nota mala: ${n}`); return 12 * (Number(m[3]) + 1) + NOTAS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };

export function componerClasica(d: Clasica): Cancion {
  const semi = 15 / d.bpm * (d.u ?? 1), notas: Nota[] = [];
  const frase = d.mel.trim().split(/\s+/).map((tok) => { const [n, l] = tok.split(':'); return { n, l: Number(l) }; });
  const largoFrase = frase.reduce((a, x) => a + x.l, 0) * semi;
  let t = 1.6; // entrada
  for (let vuelta = 0; vuelta === 0 || t < 45; vuelta++) {
    for (const { n, l } of frase) { if (n !== 'R') notas.push({ t, midi: midi(n) + (d.tr ?? 0), dur: l * semi * 0.92 }); t += l * semi; }
    t += semi * 4; // respiro entre repeticiones
    if (largoFrase < 1) break;
  }
  return { id: d.id, titulo: d.titulo, japones: '', autor: d.autor, es: d.es, nivel: d.nivel, bpm: d.bpm, notas, acomp: [], duracion: t + 0.5 };
}
