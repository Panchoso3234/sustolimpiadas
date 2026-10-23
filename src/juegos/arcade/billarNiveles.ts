// Billar sin dependencias (para poder revisarlo y probarlo con `node`): la mesa, sus troneras, los desafíos y la física.
// La mesa mide ANCHO × FONDO (el paño entre las bandas), centrada en 0.

export const ANCHO = 11, FONDO = 5.6, RADIO = 0.2;
/** Cuánto le corta cada tronera a las bandas: las de las esquinas miden ~2 bolas de boca; las del medio, un poco más. */
export const ESQUINA = 0.6, LATERAL = 0.46;
/** Dónde va la bola blanca al empezar (y al volver después de caer en una tronera). */
export const SALIDA: [number, number] = [-ANCHO / 4, 0];

type P = [number, number];
/** Una tronera: las dos puntas de su boca (a y b), el centro de la boca, hacia dónde queda el hoyo y el centro del hoyo. */
export interface Tronera { a: P; b: P; m: P; n: P; t: P; ancho: number; hoyo: P; radio: number; esquina: boolean }
/** Un tramo de banda: va de `a` a `b`; las mandíbulas de las troneras también son tramos. */
export interface Tramo { a: P; b: P; mandibula: boolean }

const W = ANCHO / 2, F = FONDO / 2;
const norma = ([x, z]: P): P => { const l = Math.hypot(x, z); return [x / l, z / l]; };
const tronera = (a: P, b: P, n: P, hoyo: P, radio: number, esquina: boolean): Tronera => {
  const m: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], nn = norma(n);
  return { a, b, m, n: nn, t: [-nn[1], nn[0]], ancho: Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, hoyo, radio, esquina };
};
export const TRONERAS: Tronera[] = [];
export const TRAMOS: Tramo[] = [];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  // Esquina: la boca va en diagonal; cada punta tiene una mandíbula que se abre hacia el hoyo
  const a: P = [sx * (W - ESQUINA), sz * F], b: P = [sx * W, sz * (F - ESQUINA)];
  TRONERAS.push(tronera(a, b, [sx, sz], [sx * (W + 0.07), sz * (F + 0.07)], 0.4, true));
  TRAMOS.push({ a, b: [a[0] + sx * 0.32, a[1] + sz * 0.42], mandibula: true }, { a: b, b: [b[0] + sx * 0.42, b[1] + sz * 0.32], mandibula: true });
}
for (const sz of [-1, 1]) {
  // Lateral: una abertura en la banda larga, con mandíbulas que se cierran un poco hacia adentro
  const a: P = [-LATERAL, sz * F], b: P = [LATERAL, sz * F];
  TRONERAS.push(tronera(a, b, [0, sz], [0, sz * (F + 0.24)], 0.37, false));
  TRAMOS.push({ a, b: [-LATERAL + 0.09, sz * (F + 0.42)], mandibula: true }, { a: b, b: [LATERAL - 0.09, sz * (F + 0.42)], mandibula: true });
}
// Las bandas: las largas cortadas por la tronera del medio, las cortas enteras entre esquinas
for (const sz of [-1, 1]) TRAMOS.push({ a: [-(W - ESQUINA), sz * F], b: [-LATERAL, sz * F], mandibula: false }, { a: [LATERAL, sz * F], b: [W - ESQUINA, sz * F], mandibula: false });
for (const sx of [-1, 1]) TRAMOS.push({ a: [sx * W, -(F - ESQUINA)], b: [sx * W, F - ESQUINA], mandibula: false });

export type Regla = 'todas' | 'orden' | 'negra';
export interface BolaInicial { x: number; z: number; n: number; dorada?: boolean; negra?: boolean }
export interface Desafio { nombre: string; regla: Regla; tiros: number; bolas: BolaInicial[] }

/** Un triángulo de bolas con la punta en `x0` mirando a la blanca. */
const triangulo = (x0: number, filas: number, desde = 1): BolaInicial[] => {
  const bolas: BolaInicial[] = [], d = RADIO * 2.02;
  for (let f = 0; f < filas; f++) for (let i = 0; i <= f; i++) bolas.push({ x: x0 + f * d * 0.866, z: (i - f / 2) * d, n: desde + bolas.length });
  return bolas;
};
const PEGADA = F - RADIO - 0.01; // una bola apoyada en la banda larga

// "Bandas" reemplaza al viejo desafío de postes (en una mesa de billar no hay nada sobre el paño): mismas bolas y
// tiros que tenía, así el puntaje máximo no cambia.
export const DESAFIOS: Desafio[] = [
  { nombre: 'Calentando', regla: 'todas', tiros: 5, bolas: [{ x: 2, z: 0, n: 1 }, { x: 3.4, z: -1.6, n: 2 }, { x: 3.6, z: 1.7, n: 3 }] },
  { nombre: 'En orden', regla: 'orden', tiros: 7, bolas: [{ x: 1, z: -1.2, n: 1 }, { x: 3.8, z: 1.5, n: 2 }, { x: -1.5, z: 1.8, n: 3 }, { x: 4.3, z: -1.9, n: 4 }] },
  { nombre: 'Pegadas a la banda', regla: 'todas', tiros: 6, bolas: [{ x: 2.6, z: -PEGADA, n: 1 }, { x: -1.4, z: PEGADA, n: 2 }, { x: W - RADIO - 0.01, z: 0.8, n: 3 }, { x: 1.4, z: 0.7, n: 4 }] },
  { nombre: 'La negra al final', regla: 'negra', tiros: 8, bolas: [...triangulo(2.4, 3).map((b, i) => (i === 4 ? { ...b, n: 8, negra: true } : b))] },
  { nombre: 'El triángulo', regla: 'todas', tiros: 10, bolas: triangulo(2.2, 4) },
  { nombre: 'Bolas de oro', regla: 'todas', tiros: 6, bolas: [{ x: 1.5, z: -1.5, n: 1 }, { x: 1.5, z: 1.5, n: 2 }, { x: 3.2, z: 0, n: 3, dorada: true }, { x: 4.4, z: -2, n: 4 }, { x: 4.4, z: 2, n: 5 }, { x: -2, z: -2.1, n: 6, dorada: true }] },
];

/** Revisa que cada desafío se pueda jugar: bolas dentro de la mesa, sin encimarse ni tapar troneras ni la salida. */
export function revisar(d: Desafio): string[] {
  const malos: string[] = [], todas: P[] = [...d.bolas.map((b): P => [b.x, b.z]), SALIDA];
  for (const [x, z] of todas) {
    if (Math.abs(x) > W - RADIO + 0.001 || Math.abs(z) > F - RADIO + 0.001) malos.push(`fuera de la mesa ${x},${z}`);
    for (const t of TRONERAS) if (Math.hypot(x - t.m[0], z - t.m[1]) < t.ancho + RADIO + 0.2) malos.push(`tapa una tronera ${x},${z}`);
  }
  todas.forEach(([x, z], i) => todas.forEach(([x2, z2], k) => { if (k > i && Math.hypot(x - x2, z - z2) < RADIO * 2 - 0.001) malos.push(`encimadas ${x.toFixed(2)},${z.toFixed(2)}`); }));
  if (d.regla === 'negra' && d.bolas.filter((b) => b.negra).length !== 1) malos.push('una negra');
  if (new Set(d.bolas.map((b) => b.n)).size !== d.bolas.length) malos.push('números repetidos');
  return malos;
}

// ───────── Física ─────────
// Cada bola tiene su velocidad (vx, vz) y la velocidad de su punto de apoyo debida al giro (gx, gz): si son iguales la
// bola rueda; si no, patina y el roce del paño las va igualando (así funcionan el corrido, el retroceso y la bola
// "muerta" que se queda clavada). `lado` es el efecto lateral, que se nota al pegar en una banda.

export interface BolaFisica { x: number; z: number; vx: number; vz: number; gx: number; gz: number; lado: number; dentro: boolean; cae: number; tronera: number; bandas: number }
export type Evento = { tipo: 'choque'; i: number; k: number; fuerza: number } | { tipo: 'banda'; i: number; fuerza: number; punta: boolean } | { tipo: 'tronera'; i: number; tronera: number };

export const FUERZA = 13; // velocidad del tiro más fuerte
const PATINA = 5.5, RUEDA = 0.42, AIRE = 0.05, REBOTE = 0.76, ROCE_BANDA = 0.96, CHOQUE = 0.95, EFECTO_BANDA = 0.2;

/** Golpe del taco: `fuerza` de 0 a 1 (curva suave: mucho control en los tiros flojos), `alto` de -1 (retroceso) a 1
 * (corrido) y `lado` de -1 a 1 (efecto a la izquierda o a la derecha). */
export function golpear(b: BolaFisica, ang: number, fuerza: number, alto: number, lado: number) {
  const v = FUERZA * (0.1 + 0.9 * Math.pow(Math.max(0, Math.min(1, fuerza)), 1.3));
  const a = ang - lado * 0.012; // con efecto lateral la blanca se desvía apenas al lado contrario
  b.vx = Math.sin(a) * v; b.vz = Math.cos(a) * v;
  b.gx = b.vx * alto * 1.6; b.gz = b.vz * alto * 1.6;
  b.lado = lado * v * 0.3;
  b.bandas = 0;
}

const cercano = (px: number, pz: number, t: Tramo): P => {
  const [ax, az] = t.a, dx = t.b[0] - ax, dz = t.b[1] - az, l2 = dx * dx + dz * dz;
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return [ax + dx * u, az + dz * u];
};

/** Un paso de física (corto: a toda velocidad una bola avanza menos que su radio). Anota lo que pasó en `eventos`. */
export function paso(bolas: BolaFisica[], dt: number, eventos: Evento[]) {
  bolas.forEach((b, i) => {
    if (b.dentro) return;
    // Roce del paño: patinando, frena fuerte y va pasando velocidad al giro (y al revés); rodando, frena suave
    const ux = b.vx - b.gx, uz = b.vz - b.gz, u = Math.hypot(ux, uz);
    if (u > 0.01) {
      const k = Math.min(1 / 3.5, (PATINA * dt) / u);
      b.vx -= ux * k; b.vz -= uz * k; b.gx += ux * k * 2.5; b.gz += uz * k * 2.5;
    } else {
      const v = Math.hypot(b.vx, b.vz), nv = Math.max(0, v - (RUEDA + AIRE * v) * dt), f = v ? nv / v : 0;
      b.vx *= f; b.vz *= f; b.gx = b.vx; b.gz = b.vz;
    }
    b.lado *= Math.exp(-0.7 * dt);
    if (Math.hypot(b.vx, b.vz) < 0.02 && Math.hypot(b.gx, b.gz) < 0.02) { b.vx = b.vz = b.gx = b.gz = 0; }
    b.x += b.vx * dt; b.z += b.vz * dt;

    // Troneras: pasada la boca, la bola cae cuando más de la mitad ya está sobre el hoyo; en el borde, si va lenta,
    // se tambalea y termina cayendo (la del labio)
    for (let k = 0; k < TRONERAS.length; k++) {
      const t = TRONERAS[k], rx = b.x - t.m[0], rz = b.z - t.m[1], hondo = rx * t.n[0] + rz * t.n[1], lat = rx * t.t[0] + rz * t.t[1];
      if (Math.abs(lat) > t.ancho + RADIO || hondo < -RADIO) continue;
      if (hondo > RADIO * 0.5 || Math.hypot(b.x - t.hoyo[0], b.z - t.hoyo[1]) < t.radio - RADIO * 0.3) { b.dentro = true; b.cae = 0.001; b.tronera = k; eventos.push({ tipo: 'tronera', i, tronera: k }); return; }
      if (hondo > -RADIO * 0.35 && Math.abs(lat) < t.ancho && Math.hypot(b.vx, b.vz) < 1.2) { b.vx += t.n[0] * 3 * dt; b.vz += t.n[1] * 3 * dt; b.gx = b.vx; b.gz = b.vz; }
    }
    // Bandas y mandíbulas: rebota lo que va hacia la banda; el efecto lateral cambia el ángulo de salida
    for (const t of TRAMOS) {
      const [qx, qz] = cercano(b.x, b.z, t), dx = b.x - qx, dz = b.z - qz, d = Math.hypot(dx, dz);
      if (d >= RADIO || d === 0) continue;
      const nx = dx / d, nz = dz / d, tx = -nz, tz = nx;
      b.x = qx + nx * RADIO; b.z = qz + nz * RADIO;
      const vn = b.vx * nx + b.vz * nz;
      if (vn >= 0) continue;
      const vt = b.vx * tx + b.vz * tz, nvt = vt * ROCE_BANDA + b.lado * EFECTO_BANDA * Math.min(1, -vn / 3), nvn = -vn * REBOTE;
      b.vx = nx * nvn + tx * nvt; b.vz = nz * nvn + tz * nvt;
      // El giro hacia adelante se pierde en parte contra la banda: después del rebote la bola patina un momento
      const gt = (b.gx * tx + b.gz * tz) * 0.9;
      b.gx = tx * gt + nx * nvn * 0.25; b.gz = tz * gt + nz * nvn * 0.25;
      b.lado *= 0.5;
      b.bandas++;
      const punta = t.mandibula && (Math.hypot(qx - t.a[0], qz - t.a[1]) < 0.02);
      eventos.push({ tipo: 'banda', i, fuerza: -vn, punta });
    }
    // Por si algo raro la saca de la mesa: cae en la tronera más cercana (nunca se pierde una bola)
    if (Math.abs(b.x) > W + 0.7 || Math.abs(b.z) > F + 0.7) {
      let k = 0; TRONERAS.forEach((t, j) => { if (Math.hypot(b.x - t.hoyo[0], b.z - t.hoyo[1]) < Math.hypot(b.x - TRONERAS[k].hoyo[0], b.z - TRONERAS[k].hoyo[1])) k = j; });
      b.dentro = true; b.cae = 0.001; b.tronera = k; eventos.push({ tipo: 'tronera', i, tronera: k });
    }
  });
  // Choques entre bolas (misma masa): se intercambian la parte de la velocidad que va de centro a centro; el giro se
  // queda en cada bola, por eso la blanca sale a 90° si iba patinando y luego corre o retrocede según su efecto
  for (let i = 0; i < bolas.length; i++) for (let k = i + 1; k < bolas.length; k++) {
    const a = bolas[i], b = bolas[k];
    if (a.dentro || b.dentro) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), junto = RADIO * 2;
    if (d >= junto || d === 0) continue;
    const nx = dx / d, nz = dz / d, sobra = (junto - d) / 2;
    a.x -= nx * sobra; a.z -= nz * sobra; b.x += nx * sobra; b.z += nz * sobra;
    const acerca = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
    if (acerca <= 0) continue;
    const j = ((1 + CHOQUE) / 2) * acerca;
    a.vx -= j * nx; a.vz -= j * nz; b.vx += j * nx; b.vz += j * nz;
    eventos.push({ tipo: 'choque', i, k, fuerza: acerca });
  }
}

export const quietas = (bolas: BolaFisica[]) => bolas.every((b) => b.dentro || (Math.hypot(b.vx, b.vz) < 0.02 && Math.hypot(b.gx, b.gz) < 0.02));

/** Un lugar libre para dejar una bola (la blanca después de caer, o una que vuelve a la mesa), lo más cerca de (x, z). */
export function lugarLibre(bolas: BolaFisica[], x: number, z: number, salvo?: BolaFisica): P {
  const libre = (px: number, pz: number) => Math.abs(px) < W - RADIO && Math.abs(pz) < F - RADIO && bolas.every((o) => o === salvo || o.dentro || Math.hypot(o.x - px, o.z - pz) > RADIO * 2.05);
  if (libre(x, z)) return [x, z];
  for (let r = 0.1; r < 4; r += 0.1) for (let a = 0; a < 6.28; a += 0.3) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (libre(px, pz)) return [px, pz]; }
  return [x, z];
}
