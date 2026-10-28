import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearCarrera, type Barra, type Bloque, type Gema, type Hito, type Martillo, type Roca } from './motor';

// Las dos carreras (versión 2, 26-10). Cada una arma su pista con la semilla: mismo recorrido para todos los que la juegan.

const PIEDRA = '#4f3d38', PIEDRA_2 = '#5e4741', CONTROL = '#7a6a62', TABLON = '#8a5a35', VAPOR = '#c9c2bd';

/**
 * Lava Loca: subir por un volcán que se derrumba, sobre un mar de lava. Siete tramos sacados de una bolsa de doce tipos
 * (los dos primeros, de los fáciles). Cada tramo empieza con un punto de control y unos escalones. La lava no sube (26-10: mataba
 * muy rápido); caer cuesta el tiempo de volver al control y el bono de tramo limpio.
 */
export function rodillos(c: Contexto): Promise<Partida> {
  const r = generador(c.semilla), bloques: Bloque[] = [], barras: Barra[] = [], rocas: Roca[] = [], martillos: Martillo[] = [], gemas: Gema[] = [], hitos: Hito[] = [];
  const nivel = c.nivel, rango = (a: number, b: number) => a + r() * (b - a), signo = () => (r() < 0.5 ? -1 : 1);
  const piso = (x: number, y: number, z0: number, largo: number, w = 8, extra: Partial<Bloque> = {}) => bloques.push({ x, y, z: z0 - largo / 2, w, h: 1, d: largo, color: r() < 0.5 ? PIEDRA : PIEDRA_2, ...extra });
  const gema = (x: number, y: number, z: number, valor = 25) => gemas.push({ x, y, z, valor });

  // Cada tramo recibe dónde empieza (z, y) y devuelve su largo
  type Tramo = (z: number, y: number) => number;
  const TRAMOS: Record<string, Tramo> = {
    barras(z, y) {
      piso(0, y, z, 18);
      for (let b = 0; b < 3; b++) barras.push({ x: rango(-1, 1), y, z: z - 4 - b * 5, largo: 7.4, vel: signo() * (1.3 + nivel * 0.12 + r() * 0.4), fase: r() * 6.28, alta: b > 0 && r() < 0.4 });
      gema(signo() * 2.4, y, z - 12); // no al borde: un golpe de barra ahí te bota a la lava sin remedio
      return 18;
    },
    dobles(z, y) {
      piso(0, y, z, 16);
      for (let b = 0; b < 2; b++) {
        const zb = z - 5 - b * 7, vel = signo() * (1.2 + nivel * 0.1 + r() * 0.3), fase = r() * 6.28;
        barras.push({ x: 0, y, z: zb, largo: 7.4, vel, fase }, { x: 0, y, z: zb, largo: 7.4, vel, fase: fase + Math.PI / 2, alta: true });
      }
      gema(0, y, z - 8.5, 50);
      return 16;
    },
    tablones(z, y) {
      // Dos carriles de tablones que se hunden: no hay que detenerse
      for (let i = 0; i < 6; i++) for (const x of [-2, 2]) bloques.push({ x, y, z: z - 1.3 - i * 2.5, w: 3, h: 0.5, d: 2.1, color: TABLON, tipo: 'cae' });
      gema(-2, y, z - 1.3 - 5 * 2.5, 50);
      return 14.85;
    },
    moviles(z, y) {
      piso(0, y, z, 3);
      for (let i = 0; i < 3; i++) bloques.push({ x: 0, y, z: z - 5 - i * 4, w: 2.8, h: 0.6, d: 2.6, color: TABLON, mueve: { eje: 'x', amp: 2.2, vel: 0.9 + nivel * 0.06 + r() * 0.2, fase: r() * 6.28 } });
      piso(0, y, z - 16, 2);
      gema(0, y, z - 13, 25);
      return 18;
    },
    angosta(z, y) {
      // Pasarela angosta en zigzag, con una gema al borde de cada quiebre
      const tramos = 4;
      for (let i = 0; i < tramos; i++) { const x = i % 2 ? 1.6 : -1.6; piso(x, y, z - i * 4.2, 4.6, 2.0); if (i > 0) piso((x + (i % 2 ? -1.6 : 1.6)) / 2, y, z - i * 4.2 + 0.2, 0.8, 4.7); }
      gema(1.6, y, z - 12.6, 50);
      return tramos * 4.2;
    },
    columnas(z, y) {
      piso(0, y, z, 3);
      // La gema va sobre la tercera columna (antes flotaba entre columnas y no había dónde pararse para tomarla)
      for (let i = 0; i < 5; i++) { const x = (i % 2 ? 1 : -1) * rango(0.5, 1.8); bloques.push({ x, y: y + 0.4, z: z - 4.5 - i * 2.9, w: 1.9, h: 4, d: 1.9, color: PIEDRA_2, mueve: { eje: 'y', amp: 0.5, vel: 1.1 + r() * 0.4, fase: r() * 6.28 } }); if (i === 2) gema(x, y + 2.4, z - 4.5 - i * 2.9, 50); }
      piso(0, y, z - 18.5, 2.5);
      return 20;
    },
    islas(z, y) {
      let zz = z - 1.2;
      piso(0, y, z, 2.4);
      for (let i = 0; i < 5; i++) { zz -= rango(3.3, 3.9); const x = rango(-1.4, 1.4); bloques.push({ x, y: y + rango(-0.2, 0.2), z: zz, w: 3.0, h: 2, d: 3.0, color: PIEDRA }); if (i === 3) gema(x, y, zz, 25); }
      piso(0, y, zz - 2.6, 2.4);
      return z - (zz - 3.8);
    },
    rocas(z, y) {
      piso(0, y, z, 18, 7);
      for (let i = 0; i < 3; i++) rocas.push({ x: -2.3 + i * 2.3, y, z0: z - 17.5, z1: z - 0.5, vel: 5 + nivel * 0.3 + r() * 1.5, fase: r() * 17, radio: 0.75 });
      gema(signo() * 1.15, y, z - 9, 25); // entre dos carriles de rocas, lejos del borde
      return 18;
    },
    martillos(z, y) {
      piso(0, y, z, 17);
      for (let i = 0; i < 3; i++) {
        const zm = z - 4 - i * 4.8;
        martillos.push({ x: 0, y: y + 5, z: zm, largo: 4.1, amp: 1.0, vel: 1.5 + nivel * 0.08 + r() * 0.4, fase: r() * 6.28 });
        // El arco del martillo (adorno)
        bloques.push({ x: -4.3, y: y + 5.3, z: zm, w: 0.4, h: 5.3, d: 0.4, color: '#3a2c28', adorno: true }, { x: 4.3, y: y + 5.3, z: zm, w: 0.4, h: 5.3, d: 0.4, color: '#3a2c28', adorno: true }, { x: 0, y: y + 5.5, z: zm, w: 9, h: 0.4, d: 0.4, color: '#3a2c28', adorno: true });
      }
      gema(0, y, z - 14, 50);
      return 17;
    },
    vapor(z, y) {
      // Un abismo que solo se cruza con la grieta de vapor (o con un salto perfecto desde el borde, más arriesgado)
      piso(0, y, z, 5);
      bloques.push({ x: rango(-1.8, 1.8), y: y + 0.01, z: z - 4, w: 1.6, h: 1, d: 1.4, color: VAPOR, tipo: 'vapor' });
      piso(0, y + 1.6, z - 10, 4);
      gema(0, y + 3.4, z - 8, 75);
      return 14;
    },
    atajo(z, y) {
      // Izquierda: tablones que se hunden, derecho y corto, con gema grande. Derecha: piedra firme pero con muros que obligan a dar la vuelta
      piso(0, y, z, 2);
      for (let i = 0; i < 5; i++) bloques.push({ x: -2.6, y, z: z - 3.1 - i * 2.3, w: 2.2, h: 0.5, d: 2, color: TABLON, tipo: 'cae' });
      gema(-2.6, y, z - 7.7, 75);
      piso(2.4, y, z - 2, 12, 3.4);
      for (let i = 0; i < 3; i++) bloques.push({ x: i % 2 ? 3.3 : 1.5, y: y + 1.6, z: z - 4.5 - i * 3.3, w: 1.8, h: 1.6, d: 0.6, color: PIEDRA_2 });
      piso(0, y, z - 14, 2);
      return 16;
    },
    mixto(z, y) {
      piso(0, y, z, 18);
      barras.push({ x: 0, y, z: z - 4.5, largo: 7.4, vel: signo() * (1.6 + nivel * 0.12), fase: r() * 6.28 });
      martillos.push({ x: 0, y: y + 5, z: z - 10, largo: 4.1, amp: 1.0, vel: 1.6 + r() * 0.4, fase: r() * 6.28 });
      bloques.push({ x: 0, y: y + 5.5, z: z - 10, w: 9, h: 0.4, d: 0.4, color: '#3a2c28', adorno: true });
      barras.push({ x: 0, y, z: z - 15, largo: 7.4, vel: signo() * (1.8 + nivel * 0.12), fase: r() * 6.28, alta: true });
      gema(signo() * 2.6, y, z - 7.5, 25);
      return 18;
    },
  };
  const FACILES = ['barras', 'rocas', 'tablones', 'angosta'], DIFICILES = ['dobles', 'islas', 'moviles', 'columnas', 'martillos', 'vapor', 'atajo', 'mixto'];
  const mezclar = (l: string[]) => l.map((x) => [r(), x] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  // Solo en pruebas: ?tramos=vapor,islas arma la pista con esos tramos, en ese orden
  const forzados = import.meta.env.DEV ? new URLSearchParams(location.search).get('tramos')?.split(',').filter((x) => x in TRAMOS) : null;
  // 28-10: 3 fáciles y 4 difíciles (antes 2 y 5: muchos abandonaban a mitad de camino)
  const orden = forzados?.length ? forzados : [...mezclar(FACILES).slice(0, 3), ...mezclar(DIFICILES).slice(0, 4)];

  // Salida
  bloques.push({ x: 0, y: 0, z: 1.5, w: 8, h: 1, d: 4, color: CONTROL, tipo: 'control' });
  let z = -0.5, y = 0;
  orden.forEach((tipo, i) => {
    // Escalones de subida y punto de control al empezar cada tramo
    if (i > 0) for (let s = 1; s <= 3; s++) bloques.push({ x: 0, y: y + s * 0.3, z: z - (s - 1) * 0.9 - 0.45, w: 8, h: 1 + s * 0.3, d: 0.9, color: CONTROL });
    if (i > 0) { y += 0.9; z -= 2.7; }
    bloques.push({ x: 0, y, z: z - 1.2, w: 8, h: 1, d: 2.4, color: CONTROL, tipo: 'control' });
    z -= 2.4;
    const largo = TRAMOS[tipo](z, y);
    z -= largo;
    hitos.push({ z, puntos: 100, nombre: `Tramo ${i + 1} de ${orden.length}` });
  });
  bloques.push({ x: 0, y, z: z - 2.5, w: 8, h: 1, d: 5, color: '#ffd23c', tipo: 'meta' });
  const fin = z - 2.5;
  return crearCarrera(c, {
    bloques, barras, rocas, martillos, gemas, hitos, inicio: [0, 0.1, 1.5], cielo: '#3a2026', abismo: '#ff5a1e', caida: '¡A la lava!',
    limite: 150, escenario: 'volcan', medallas: [900, 1250, 1550], ayuda: true,
    bono: { porSegundo: 5, limpio: 30 },
    progreso: (_x, _y, zz) => zz / fin,
  });
}

/**
 * Puertas Falsas: doce muros en cuatro secciones (de 4, 4, 5 y 6 puertas). Se prueba una puerta corriendo de frente:
 * la buena se abre; la falsa te rebota y te devuelve al comienzo de la sección, con sus puertas cerradas otra vez.
 * Hay que recordar cuáles eran. Una marca brillante dice "por aquí", y acierta 2 de cada 3 veces. En la última sección las
 * puertas se deslizan de lado a lado.
 */
export function puertas(c: Contexto): Promise<Partida> {
  const r = generador(c.semilla), bloques: Bloque[] = [], gemas: Gema[] = [], hitos: Hito[] = [];
  const ANCHO = 9.2, ENTRE = 6.5, SECCIONES = [4, 4, 5, 6], MUROS = 3;
  const COLORES = ['#c79bff', '#b58af0'];
  let z = 1, muro = 0;
  bloques.push({ x: 0, y: 0.02, z: 1, w: ANCHO, h: 1, d: 3, color: '#4a3a70', tipo: 'control' });
  SECCIONES.forEach((n, s) => {
    const largo = MUROS * ENTRE + 3;
    bloques.push({ x: 0, y: 0, z: z - 1.5 - largo / 2, w: ANCHO, h: 1, d: largo + 1, color: '#3b2d5c' });
    if (s > 0) bloques.push({ x: 0, y: 0.02, z: z - 1.5, w: ANCHO, h: 1, d: 2, color: '#4a3a70', tipo: 'control' });
    const mueve = s === SECCIONES.length - 1 ? { amp: 1.3, vel: 0.9 + c.nivel * 0.1 + r() * 0.3, fase: r() * 6.28 } : null;
    for (let m = 0; m < MUROS; m++, muro++) {
      const zm = z - 4 - m * ENTRE, ancho = ANCHO / n, buena = Math.floor(r() * n);
      // Dos buenas: los primeros muros en las jornadas tempranas, y uno al azar por sección (con una gema detrás de la segunda)
      const dos = (muro < Math.max(0, 3 - c.nivel)) || r() < 0.22;
      let segunda = Math.floor(r() * n); if (segunda === buena) segunda = (buena + 1) % n;
      // La marca: 2 de cada 3 veces está en la buena
      const marcada = r() < 2 / 3 ? buena : (buena + 1 + Math.floor(r() * (n - 1))) % n;
      const mov = mueve ? { eje: 'x' as const, ...mueve } : undefined;
      for (let i = 0; i < n; i++) {
        const real = i === buena || (dos && i === segunda);
        bloques.push({ x: -ANCHO / 2 + ancho * (i + 0.5), y: 3.2, z: zm, w: ancho - 0.08, h: 3.2, d: 0.45, color: COLORES[i % 2], tipo: real ? 'real' : 'falsa', marca: i === marcada, mueve: mov });
        if (dos && i === segunda) gemas.push({ x: -ANCHO / 2 + ancho * (i + 0.5), y: 0, z: zm - 1.4, valor: 50 });
      }
      // Si las puertas se deslizan, en las orillas hay paneles falsos para que nunca quede un hueco
      if (mov) for (const lado of [-1, 1]) bloques.push({ x: lado * (ANCHO / 2 + mueve!.amp / 2 + 0.05), y: 3.2, z: zm, w: mueve!.amp + 0.1, h: 3.2, d: 0.45, color: '#5c4a86', tipo: 'falsa', mueve: mov });
      hitos.push({ z: zm - 0.6, puntos: 80, nombre: `Sección ${s + 1} · muro ${m + 1} de ${MUROS}` });
    }
    z -= largo;
  });
  bloques.push({ x: 0, y: 0.03, z: z - 2, w: ANCHO, h: 1, d: 4, color: '#ffd23c', tipo: 'meta' });
  const fin = z - 2;
  return crearCarrera(c, {
    bloques, gemas, hitos, inicio: [0, 0.1, 1.2], cielo: '#1a1230', abismo: '#0b0718', caida: '¡Al vacío!',
    limite: 120 - (c.nivel - 1) * 10, escenario: 'castillo', medallas: [900, 1300, 1700],
    bono: { porSegundo: 5, limpio: 40 },
    progreso: (_x, _y, zz) => zz / fin,
  });
}
