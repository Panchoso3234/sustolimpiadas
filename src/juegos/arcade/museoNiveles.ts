// Los tres pisos de Ladrón del Museo, sin dependencias (para poder revisarlos con `node`).
// Mapa: # muro · . piso · S salida del ladrón · X puerta de escape (se abre al tomar el tesoro) · o botín · T tesoro.
// Guardias: recorren sus puntos (columna, fila) ida y vuelta. Cámaras: miran hacia `ang` y barren ± `barre`.
// Láseres: celdas que se encienden y se apagan.

export interface Nivel {
  nombre: string;
  mapa: string[];
  guardias: [number, number][][];
  camaras: { x: number; z: number; ang: number; barre: number }[];
  laseres: { celdas: [number, number][]; prendido: number; apagado: number; desfase: number }[];
}

const ABAJO = 0, DERECHA = Math.PI / 2, ARRIBA = Math.PI;

export const NIVELES: Nivel[] = [
  {
    nombre: 'Sala de las Joyas',
    mapa: [
      '##################',
      '#S....#..........#',
      '#.....#..o....o..#',
      '#.....#..........#',
      '#..o.....###.....#',
      '#........#T#.....#',
      '####..####.#..o..#',
      '#........#.#.....#',
      '#..o.....#.......#',
      '#........#....o..#',
      '#o.......#......X#',
      '##################',
    ],
    guardias: [[[12, 1], [16, 1], [16, 9], [12, 9]]],
    camaras: [{ x: 1, z: 7, ang: DERECHA, barre: 0.8 }],
    laseres: [],
  },
  {
    nombre: 'Galería de Pinturas',
    mapa: [
      '##################',
      '#S.....#...o.....#',
      '#......#.........#',
      '#..o...#...###...#',
      '#......#...#T#...#',
      '#..........#.#...#',
      '###.####.....#.o.#',
      '#o.....#.....#...#',
      '#......#..o......#',
      '#...o..####.######',
      '#......#........X#',
      '##################',
    ],
    guardias: [[[1, 5], [10, 5]], [[15, 1], [15, 8], [9, 8]]],
    camaras: [{ x: 8, z: 1, ang: ABAJO + 0.5, barre: 0.7 }],
    laseres: [{ celdas: [[11, 9]], prendido: 2, apagado: 1.4, desfase: 0 }],
  },
  {
    nombre: 'La Bóveda',
    mapa: [
      '##################',
      '#S..#.....o....#.#',
      '#...#.###.###..#.#',
      '#.o.#.#o.....#...#',
      '#...#.#.##.#.#.o.#',
      '#.....#.#T.#.#...#',
      '###.###.####.###.#',
      '#o..#.........#..#',
      '#...#.#####.#.#..#',
      '#.......o...#....#',
      '#...#...#...#...X#',
      '##################',
    ],
    guardias: [[[5, 7], [13, 7]], [[16, 1], [16, 9]], [[1, 9], [7, 9]]],
    camaras: [{ x: 5, z: 1, ang: ABAJO, barre: 0.6 }, { x: 9, z: 9, ang: ARRIBA, barre: 0.7 }],
    laseres: [{ celdas: [[3, 6]], prendido: 1.8, apagado: 1.3, desfase: 0 }, { celdas: [[12, 6]], prendido: 1.6, apagado: 1.2, desfase: 0.8 }],
  },
];

/** Revisa que cada piso se pueda jugar: medidas, una salida, un tesoro, una puerta, todo alcanzable y rondas sin muros. */
export function revisar(n: Nivel): string[] {
  const malos: string[] = [], m = n.mapa, at = (x: number, z: number) => m[z]?.[x] ?? '#';
  if (m.length !== 12 || m.some((f) => f.length !== 18)) malos.push('medidas');
  for (const c of 'STX') if (m.join('').split(c).length !== 2) malos.push(`una sola ${c}`);
  const s = m.findIndex((f) => f.includes('S')), visto = new Set([`${m[s].indexOf('S')},${s}`]), cola = [[m[s].indexOf('S'), s]];
  while (cola.length) { const [x, z] = cola.pop()!; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + dx},${z + dz}`; if (at(x + dx, z + dz) !== '#' && !visto.has(k)) { visto.add(k); cola.push([x + dx, z + dz]); } } }
  m.forEach((f, z) => [...f].forEach((c, x) => { if (c !== '#' && !visto.has(`${x},${z}`)) malos.push(`${c} sin camino en ${x},${z}`); }));
  for (const g of n.guardias) for (let i = 0; i < g.length - 1; i++) {
    const [ax, az] = g[i], [bx, bz] = g[i + 1];
    if (ax !== bx && az !== bz) malos.push(`ronda en diagonal ${ax},${az}`);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let z = Math.min(az, bz); z <= Math.max(az, bz); z++) if (at(x, z) === '#') malos.push(`ronda choca en ${x},${z}`);
  }
  for (const c of n.camaras) if (at(c.x, c.z) === '#') malos.push(`cámara en muro ${c.x},${c.z}`);
  for (const l of n.laseres) for (const [x, z] of l.celdas) if (at(x, z) === '#') malos.push(`láser en muro ${x},${z}`);
  return malos;
}
