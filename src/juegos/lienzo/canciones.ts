import { generador } from '../../nucleo/azar';

// Repertorio de Teclas del Faro (04-11): 20 canciones originales "estilo anisong / J-pop", compuestas por un pequeño
// compositor con las recetas del género:
// · progresiones típicas: 王道進行 (IV–V–iii–vi), 小室進行 (vi–IV–V–I), カノン進行 (I–V–vi–iii–IV–I–IV–V),
//   丸サ進行 (IV–III–vi–I, con el III mayor) y otras comunes (I–V–vi–IV, ii–V–I);
// · forma de canción japonesa: intro, Aメロ (verso, registro bajo), Bメロ (puente que sube) y サビ (coro, agudo, con
//   notas largas al final de cada frase);
// · frases de 2 compases que se repiten transpuestas al acorde (lo que hace que un coro "pegue");
// · tempos de opening (110 a 190 BPM), más rápidos y densos mientras más alto el nivel.
// Nada de esto es copia de ninguna canción: las melodías salen de una semilla fija por canción (siempre la misma).

export interface Nota { t: number; midi: number; dur: number }
export interface Cancion {
  id: string; titulo: string; romaji: string; es: string; nivel: 1 | 2 | 3; bpm: number;
  /** Melodía (lo que se toca): t y dur en segundos desde el inicio de la canción. */
  notas: Nota[];
  /** Acompañamiento (bajo y acordes) que suena solo. */
  acomp: (Nota & { vol: number })[];
  duracion: number;
  /** Solo las cargadas desde un mp3: el audio suena de fondo. */
  audio?: AudioBuffer;
}

type Acorde = number | 'III';
interface Def { id: string; titulo: string; romaji: string; es: string; nivel: 1 | 2 | 3; bpm: number; tono: number; A: Acorde[]; B: Acorde[]; S: Acorde[] }
const OUDOU: Acorde[] = [4, 5, 3, 6], KOMURO: Acorde[] = [6, 4, 5, 1], CANON: Acorde[] = [1, 5, 6, 3, 4, 1, 4, 5], MARUSA: Acorde[] = [4, 'III', 6, 1];
const POP: Acorde[] = [1, 5, 6, 4], DOS_CINCO: Acorde[] = [2, 5, 1, 1], SUBE: Acorde[] = [4, 5, 6, 6], TRISTE: Acorde[] = [6, 4, 1, 5];

const DEFS: Def[] = [
  { id: 'yoake', titulo: '灯台の夜明け', romaji: 'Tōdai no Yoake', es: 'Amanecer del faro', nivel: 1, bpm: 116, tono: 60, A: POP, B: [4, 5, 4, 5], S: OUDOU },
  { id: 'aoikaze', titulo: '青い風のメロディ', romaji: 'Aoi Kaze no Merodī', es: 'Melodía del viento azul', nivel: 1, bpm: 122, tono: 62, A: CANON, B: SUBE, S: OUDOU },
  { id: 'sakura', titulo: '桜色の約束', romaji: 'Sakurairo no Yakusoku', es: 'Promesa color cerezo', nivel: 1, bpm: 112, tono: 65, A: KOMURO, B: [4, 5, 3, 6], S: CANON },
  { id: 'namioto', titulo: '波音リフレイン', romaji: 'Namioto Rifurein', es: 'Estribillo del oleaje', nivel: 1, bpm: 126, tono: 57, A: TRISTE, B: SUBE, S: KOMURO },
  { id: 'ameagari', titulo: '雨上がりの空', romaji: 'Ameagari no Sora', es: 'El cielo después de la lluvia', nivel: 1, bpm: 118, tono: 64, A: DOS_CINCO, B: [4, 5, 4, 5], S: POP },
  { id: 'gekko', titulo: '月光ステップ', romaji: 'Gekkō Suteppu', es: 'Paso a la luz de la luna', nivel: 1, bpm: 132, tono: 59, A: MARUSA, B: OUDOU, S: MARUSA },
  { id: 'saigo', titulo: '最後の光', romaji: 'Saigo no Hikari', es: 'La última luz', nivel: 1, bpm: 108, tono: 61, A: CANON, B: [4, 5, 3, 6], S: CANON },
  { id: 'saida', titulo: '夏空サイダー', romaji: 'Natsuzora Saidā', es: 'Sidra del cielo de verano', nivel: 2, bpm: 148, tono: 62, A: POP, B: SUBE, S: OUDOU },
  { id: 'mirai', titulo: '未来へジャンプ', romaji: 'Mirai e Janpu', es: 'Salto al futuro', nivel: 2, bpm: 152, tono: 64, A: KOMURO, B: [4, 5, 4, 5], S: OUDOU },
  { id: 'hokago', titulo: '放課後ファンファーレ', romaji: 'Hōkago Fanfāre', es: 'Fanfarria después de clases', nivel: 2, bpm: 144, tono: 60, A: DOS_CINCO, B: SUBE, S: POP },
  { id: 'niji', titulo: '虹色シグナル', romaji: 'Nijiiro Shigunaru', es: 'Señal arcoíris', nivel: 2, bpm: 156, tono: 65, A: CANON, B: OUDOU, S: KOMURO },
  { id: 'nagareboshi', titulo: '流れ星キャッチャー', romaji: 'Nagareboshi Kyatchā', es: 'Atrapa estrellas fugaces', nivel: 2, bpm: 160, tono: 63, A: TRISTE, B: SUBE, S: OUDOU },
  { id: 'neon', titulo: '真夜中ネオン', romaji: 'Mayonaka Neon', es: 'Neón de medianoche', nivel: 2, bpm: 140, tono: 58, A: MARUSA, B: [4, 5, 3, 6], S: MARUSA },
  { id: 'hoshikuzu', titulo: '星屑ダッシュ', romaji: 'Hoshikuzu Dasshu', es: 'Carrera de polvo estelar', nivel: 3, bpm: 174, tono: 62, A: POP, B: SUBE, S: OUDOU },
  { id: 'roketto', titulo: '夢見るロケット', romaji: 'Yumemiru Roketto', es: 'Cohete soñador', nivel: 3, bpm: 168, tono: 64, A: KOMURO, B: [4, 5, 4, 5], S: CANON },
  { id: 'raimei', titulo: '雷鳴ハート', romaji: 'Raimei Hāto', es: 'Corazón de trueno', nivel: 3, bpm: 182, tono: 57, A: TRISTE, B: OUDOU, S: KOMURO },
  { id: 'honoo', titulo: '炎のカウントダウン', romaji: 'Honoo no Kauntodaun', es: 'Cuenta regresiva de fuego', nivel: 3, bpm: 178, tono: 59, A: DOS_CINCO, B: SUBE, S: OUDOU },
  { id: 'doragon', titulo: '秘密のドラゴン', romaji: 'Himitsu no Doragon', es: 'El dragón secreto', nivel: 3, bpm: 186, tono: 61, A: MARUSA, B: OUDOU, S: TRISTE },
  { id: 'mugen', titulo: '無限ビート', romaji: 'Mugen Bīto', es: 'Ritmo infinito', nivel: 3, bpm: 190, tono: 60, A: CANON, B: SUBE, S: OUDOU },
  { id: 'hagane', titulo: '鋼の翼', romaji: 'Hagane no Tsubasa', es: 'Alas de acero', nivel: 3, bpm: 172, tono: 63, A: KOMURO, B: [4, 5, 3, 6], S: MARUSA },
];

// Ritmos de un compás en corcheas ('x' = nota nueva, '.' = sigue la anterior o silencio al final de frase)
const RITMOS: Record<1 | 2 | 3, string[]> = {
  1: ['x.x.x.x.', 'x.x.x...', 'x.xx.x..', 'x.x.xx..', 'x...x.x.', 'x.x.x.x.'],
  2: ['x.x.x.x.', 'x.xx.x..', 'x..x..x.', 'x.x.xx..', 'xx.x.x..', 'x.x.x.xx'],
  3: ['x.xxx.x.', 'xx.x.xx.', 'x.xx.xx.', 'xxx.x.x.', 'x.x.xxx.', 'x..x..xx'],
};
const CIERRE: Record<1 | 2 | 3, string> = { 1: 'x.......', 2: 'x.x.....', 3: 'x.xx....' };
const MAYOR = [0, 2, 4, 5, 7, 9, 11];

/** Altura MIDI del grado i de la escala (i puede pasar de 7: sube de octava). */
const altura = (tono: number, i: number) => tono + 12 * Math.floor(i / 7) + MAYOR[((i % 7) + 7) % 7];
/** Grados (índices de escala) de las notas del acorde, en cualquier octava. */
const notasDe = (a: Acorde) => { const g = (a === 'III' ? 3 : a) - 1; return [g, g + 2, g + 4].map((x) => ((x % 7) + 7) % 7); };

function componer(d: Def): Cancion {
  const r = generador(`cancion|${d.id}`), corchea = 30 / d.bpm, compas = corchea * 8;
  const notas: Nota[] = [], acomp: Cancion['acomp'] = [];
  // Forma: lentas, intro + A + B + サビ + サビ; rápidas, intro + A + B + サビ + A + B + サビ (cerca de un minuto)
  const forma: ['I' | 'A' | 'B' | 'S', number][] = d.bpm < 140 ? [['I', 2], ['A', 8], ['B', 4], ['S', 8], ['S', 8]] : [['I', 2], ['A', 8], ['B', 4], ['S', 8], ['A', 8], ['B', 4], ['S', 8]];
  const rango = { A: [4, 9], B: [6, 11], S: [8, 14] } as const; // la サビ, una cuarta más arriba que el verso
  let compasN = 0, previo = 6;
  // Un motivo por sección (ritmo de 2 compases e intervalos), para que las frases se repitan
  const motivos = { A: [r(), r()], B: [r(), r()], S: [r(), r()] };
  for (const [sec, largo] of forma) {
    const prog = sec === 'I' ? d.A : d[sec];
    for (let b = 0; b < largo; b++, compasN++) {
      const acorde = prog[b % prog.length], t0 = compasN * compas, tonos = notasDe(acorde);
      // Acompañamiento: bajo en 1 y 3, acorde suave en 2 y 4 (y bajo en corcheas en el nivel 3)
      const raiz = altura(d.tono - 24, tonos[0]) + (acorde === 'III' ? 0 : 0);
      for (let q = 0; q < 4; q++) {
        if (q % 2 === 0 || d.nivel === 3) acomp.push({ t: t0 + q * corchea * 2, midi: raiz, dur: corchea * 1.8, vol: 0.07 });
        if (q % 2 === 1) for (const g of tonos) acomp.push({ t: t0 + q * corchea * 2, midi: altura(d.tono - 12, g) + (acorde === 'III' && g === 4 ? 1 : 0), dur: corchea * 1.2, vol: 0.022 });
      }
      if (sec === 'I') continue;
      // Ritmo: el motivo en los compases 1-2 y 3-4 (y 5-6 variado); cierre largo al final de cada frase de 4
      const finFrase = b % 4 === 3, lista = RITMOS[d.nivel], m = motivos[sec];
      const patron = finFrase ? CIERRE[d.nivel] : lista[Math.floor((b % 2 === 0 ? m[0] : m[1]) * lista.length + (b >= 4 && b < 6 && d.nivel > 1 ? 1 : 0)) % lista.length];
      const [lo, hi] = rango[sec];
      const onsets = [...patron].map((ch, i) => (ch === 'x' ? i : -1)).filter((i) => i >= 0);
      onsets.forEach((slot, n) => {
        const fuerte = slot === 0 || slot === 4, siguiente = onsets[n + 1] ?? 8;
        // Contorno: la サビ empieza arriba, el verso camina, el puente sube
        const objetivo = sec === 'B' ? lo + (b / largo) * (hi - lo) : sec === 'S' && b % 4 === 0 && slot === 0 ? hi - 1 : (lo + hi) / 2;
        let i = previo + (r() < 0.5 ? 1 : -1) * (r() < 0.25 ? 2 : 1);
        if (Math.abs(objetivo - i) > 3) i += Math.sign(objetivo - i);
        if (fuerte || finFrase) { // en tiempo fuerte, la nota del acorde más cercana
          let mejor = i, dist = 99;
          for (let k = lo - 2; k <= hi + 2; k++) if (tonos.includes(((k % 7) + 7) % 7) && Math.abs(k - i) < dist) { dist = Math.abs(k - i); mejor = k; }
          i = mejor;
        }
        i = Math.max(lo - 2, Math.min(hi + 2, i));
        previo = i;
        const dur = (siguiente - slot) * corchea * (finFrase && n === onsets.length - 1 ? 0.95 : 0.9);
        let midi = altura(d.tono, i);
        if (acorde === 'III' && ((i % 7) + 7) % 7 === 4) midi += 1; // la tercera del III mayor (sol# en do)
        notas.push({ t: t0 + slot * corchea, midi, dur });
      });
    }
  }
  return { id: d.id, titulo: d.titulo, romaji: d.romaji, es: d.es, nivel: d.nivel, bpm: d.bpm, notas, acomp, duracion: compasN * compas + 0.5 };
}

const cache = new Map<string, Cancion>();
export const REPERTORIO = DEFS.map((d) => ({ id: d.id, titulo: d.titulo, romaji: d.romaji, es: d.es, nivel: d.nivel, bpm: d.bpm }));
export function cancion(id: string): Cancion {
  let c = cache.get(id);
  if (!c) { const d = DEFS.find((x) => x.id === id) ?? DEFS[0]; c = componer(d); cache.set(id, c); }
  return c;
}
