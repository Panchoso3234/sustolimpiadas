// Filtro básico para nombres y frases. Corre en el navegador, así que alguien con conocimientos puede saltárselo:
// la defensa real es que el organizador puede borrar personajes desde el panel Admin.
const VETADAS = [
  'puta', 'puto', 'mierda', 'conchetumare', 'conchesumadre', 'ctm', 'csm', 'culiao', 'culiado', 'culia', 'maricon',
  'verga', 'zorra', 'nazi', 'hitler', 'violar', 'violacion', 'violador', 'pedofil', 'porno', 'nigger', 'nigga',
  'faggot', 'fuck', 'bitch', 'cunt',
];

export function esApropiado(texto: string): boolean {
  const limpio = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/[^a-zñ ]/g, ' ');
  const palabras = limpio.split(/\s+/).filter(Boolean);
  // "p u t a": las letras sueltas seguidas se juntan en una sola palabra
  const sueltas = palabras.filter((p) => p.length === 1).join('');
  return ![...palabras, sueltas].some((p) => VETADAS.some((v) => p.startsWith(v)));
}
