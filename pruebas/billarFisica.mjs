// Prueba la física del Billar sin navegador: node pruebas/billarFisica.mjs
import { ANCHO, FONDO, RADIO, FUERZA, TRONERAS, golpear, paso, quietas } from '../src/juegos/arcade/billarNiveles.ts';

const W = ANCHO / 2, F = FONDO / 2;
const bola = (x, z) => ({ x, z, vx: 0, vz: 0, gx: 0, gz: 0, lado: 0, dentro: false, cae: 0, tronera: 0, bandas: 0 });
const correr = (bolas, seg = 12) => { const ev = []; for (let t = 0; t < seg && !quietas(bolas); t += 0.005) paso(bolas, 0.005, ev); return ev; };
const tirarA = (b, x, z, fuerza, alto = 0, lado = 0) => golpear(b, Math.atan2(x - b.x, z - b.z), fuerza, alto, lado);
let malos = 0;
const ver = (nombre, ok, extra = '') => { malos += ok ? 0 : 1; console.log(`${ok ? 'OK  ' : 'MAL '} ${nombre}${extra ? ` · ${extra}` : ''}`); };

// 1) Tiros rectos a cada tronera, flojos y fuertes: entran
for (const [i, t] of TRONERAS.entries()) for (const f of [0.25, 1]) {
  const b = bola(t.m[0] - t.n[0] * 2.5, t.m[1] - t.n[1] * 2.5);
  tirarA(b, t.hoyo[0], t.hoyo[1], f);
  correr([b]);
  ver(`recto a la tronera ${i + 1} (${t.esquina ? 'esquina' : 'lateral'}, fuerza ${f})`, b.dentro);
}
// 2) Una bola que pega en la punta de la mandíbula con mal ángulo rebota (no se cuela)
{
  const t = TRONERAS.find((x) => !x.esquina), b = bola(t.a[0] - RADIO * 0.95, 0);
  tirarA(b, t.a[0] - RADIO * 0.95, t.a[1] + 1, 0.5);
  correr([b]);
  ver('pega en la punta de la lateral y rebota', !b.dentro, `queda en ${b.x.toFixed(2)}, ${b.z.toFixed(2)}`);
}
// 3) A fuerza máxima contra cada banda y en diagonal: nada atraviesa
for (const [x, z] of [[W + 3, 0.3], [-W - 3, -0.5], [1.7, F + 3], [-2.3, -F - 3], [W, F - 1.6], [-W + 1.3, -F]]) {
  const b = bola(0.4, 0.2);
  tirarA(b, x, z, 1);
  correr([b]);
  const dentroDeMesa = b.dentro || (Math.abs(b.x) <= W - RADIO + 0.001 && Math.abs(b.z) <= F - RADIO + 0.001);
  ver(`fuerza máxima hacia ${x.toFixed(1)}, ${z.toFixed(1)}`, dentroDeMesa, b.dentro ? 'cayó en una tronera' : `quedó en ${b.x.toFixed(2)}, ${b.z.toFixed(2)}`);
}
// 4) Bola muerta, corrido y retroceso en un tiro recto lleno (medido 1 s después del choque)
for (const [nombre, alto, cumple] of [['sin efecto: la blanca se queda casi clavada', 0, (bl) => Math.abs(bl.x + 1.2) < 0.25], ['corrido: la blanca sigue de largo', 0.8, (bl) => bl.x > -0.3], ['retroceso: la blanca vuelve', -0.8, (bl) => bl.x < -1.8]]) {
  const bl = bola(-1.5, 0), ob = bola(-0.8, 0), ev = [];
  tirarA(bl, 0, 0, 0.6, alto);
  for (let t = 0; t < 5 && !ev.some((x) => x.tipo === 'choque'); t += 0.005) paso([bl, ob], 0.005, ev);
  for (let t = 0; t < 1; t += 0.005) paso([bl, ob], 0.005, ev);
  ver(nombre, cumple(bl), `blanca en x=${bl.x.toFixed(2)}, la otra en x=${ob.x.toFixed(2)}`);
}
// 5) Tiro cortado: la blanca sin efecto sale a ~90° de la bola objetivo
{
  const bl = bola(-2, 0), ob = bola(0, 0.2);
  tirarA(bl, 0, 0, 0.35);
  const ev = [];
  for (let t = 0; t < 5 && !ev.some((x) => x.tipo === 'choque'); t += 0.002) paso([bl, ob], 0.002, ev);
  for (let t = 0; t < 0.004; t += 0.002) paso([bl, ob], 0.002, ev);
  const ang = (Math.acos((bl.vx * ob.vx + bl.vz * ob.vz) / (Math.hypot(bl.vx, bl.vz) * Math.hypot(ob.vx, ob.vz))) * 180) / Math.PI;
  ver('regla de los 90°', Math.abs(ang - 90) < 8, `${ang.toFixed(1)}°`);
}
// 6) Bola en el labio de la tronera, casi quieta: termina cayendo
{
  const t = TRONERAS[0], b = bola(t.m[0] + t.n[0] * 0.02, t.m[1] + t.n[1] * 0.02);
  b.vx = t.t[0] * 0.05; b.vz = t.t[1] * 0.05; b.gx = b.vx; b.gz = b.vz;
  correr([b], 4);
  ver('la del labio cae', b.dentro);
}
// 7) Todo se detiene sin temblar
{
  const bolas = [bola(-2.7, 0), ...Array.from({ length: 10 }, (_, i) => bola(2.2 + Math.floor(Math.sqrt(2 * i + 0.25) - 0.5) * 0.35, 0))];
  // un triángulo aproximado (sin encimarse)
  let k = 1; for (let f = 0; f < 4; f++) for (let j = 0; j <= f; j++) { bolas[k].x = 2.2 + f * RADIO * 2.02 * 0.866; bolas[k].z = (j - f / 2) * RADIO * 2.02; k++; }
  tirarA(bolas[0], 2.2, 0, 1);
  let t = 0; const ev = [];
  for (; t < 20 && !quietas(bolas); t += 0.005) paso(bolas, 0.005, ev);
  const antes = bolas.map((b) => [b.x, b.z]);
  for (let i = 0; i < 400; i++) paso(bolas, 0.005, ev);
  const mueve = Math.max(...bolas.map((b, i) => Math.hypot(b.x - antes[i][0], b.z - antes[i][1])));
  ver('la apertura se detiene y no tiembla', t < 20 && mueve < 0.001, `se detuvo a los ${t.toFixed(1)} s, embocó ${bolas.filter((b) => b.dentro).length}`);
}
console.log(malos ? `${malos} pruebas fallaron` : 'Todo bien');
process.exit(malos ? 1 : 0);
