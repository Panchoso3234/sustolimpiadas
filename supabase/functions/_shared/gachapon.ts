// Gachapón de Las Sustolimpiadas: catálogo, banners, probabilidades y economía. Compartido por la web, la función
// "gachapon" (Deno) y el generador del SQL (las tablas gacha_objetos y gacha_banners se llenan desde aquí).
// Modelo de los juegos de Hoyoverse: 5★ 0,6 % (desde la tirada 74 sube 6 % por tirada; garantizado en la 90),
// 4★ 5,1 % (garantizado cada 10), 50/50 en el destacado del banner de evento y garantía si se pierde.
// Todo es cosmético para la cuenta: nada da ventaja en los juegos. Sin dinero real, nunca.

// ───────── Probabilidades (las mismas que usa la base en gacha_tirar) ─────────
export const TASAS = {
  base5: 0.006, desde5: 74, sube5: 0.06, duro5: 90,
  base4: 0.051, desde4: 9, sube4: 0.51, duro4: 10,
  destacado5: 0.5, destacado4: 0.5,
} as const;
/** Probabilidad de 5★ en la tirada número `n` desde el último 5★ (1 a 90). */
export const prob5 = (n: number) => (n >= TASAS.duro5 ? 1 : n >= TASAS.desde5 ? Math.min(1, TASAS.base5 + TASAS.sube5 * (n - TASAS.desde5 + 1)) : TASAS.base5);
/** Probabilidad de 4★ (o más) en la tirada número `n` desde el último 4★ (1 a 10). */
export const prob4 = (n: number) => (n >= TASAS.duro4 ? 1 : n >= TASAS.desde4 ? TASAS.base4 + TASAS.sube4 : TASAS.base4);

// ───────── Economía ─────────
export const ECONOMIA = {
  precioDeseo: 160,          // protogemas por 1 deseo
  polvoPorDeseo: 5,          // polvo estelar por 1 deseo
  polvo4: 5, polvo5: 20,     // polvo que deja cada 4★ y cada 5★
  mision: 150, bonoMisiones: 200, misionesPorDia: 4, // 4 × 150 + 200 = 800 al día
  nivel: 300, nivelHito: 400, // cada nivel 300; los múltiplos de 5, 400
  dueloGanadoDeseos: 2, plenoDeseos: 5, aciertoTsukibet: 40,
  bienvenidaDeseos: 10,
  logro: { 'Primeros pasos': 100, Constancia: 160, 'Duelos y fantasmas': 200, 'Hazañas': 240, Expertos: 200, Secretos: 320 } as Record<string, number>,
  principianteMax: 20, principianteCosto10: 8, // Primer Deseo: 20 tiradas, 10 por 8 deseos
} as const;

// ───────── Objetos ─────────
export type Rareza = 3 | 4 | 5;
/** Dónde se luce: marco del avatar, placa detrás del nombre, color del nombre, portada del perfil, emblema junto al nombre,
 * título, aura cuando está en línea y burbuja de las declaraciones. */
export type Pieza = 'marco' | 'placa' | 'tinta' | 'portada' | 'emblema' | 'titulo' | 'aura' | 'burbuja';
export interface Objeto {
  id: string; nombre: string; rareza: Rareza; piezas: Pieza[]; serie: string; descripcion: string;
  /** Colores (c1 a c3) y estilo visual de cada pieza; la web los convierte en clases y variables CSS. */
  c: [string, string, string]; estilo: string; icono?: string; texto?: string;
  /** Solo en este banner (de evento); si no, está en el permanente. */
  exclusivo?: string;
}
const O = (id: string, nombre: string, rareza: Rareza, piezas: Pieza[], serie: string, c: [string, string, string], estilo: string, descripcion: string, extra: Partial<Objeto> = {}): Objeto =>
  ({ id, nombre, rareza, piezas, serie, c, estilo, descripcion, ...extra });
const TODO: Pieza[] = ['marco', 'placa', 'tinta', 'portada', 'aura', 'emblema', 'titulo', 'burbuja'];

export const OBJETOS: Objeto[] = [
  // ── 5★ de evento (conjuntos completos: marco, placa, nombre, portada, aura, emblema, título y burbuja) ──
  O('luna-carmesi', 'Luna Carmesí', 5, TODO, 'Velo de Medianoche', ['#ff2e4d', '#5b0a1e', '#ffd1dc'], 'luna', 'Una luna roja se levanta detrás de tu nombre. Los murciélagos dan vueltas a tu avatar cuando estás en línea.', { exclusivo: 'velo-medianoche', icono: 'luna', texto: 'Hija de la Luna Carmesí' }),
  O('leviatan-abisal', 'Leviatán Abisal', 5, TODO, 'Marea Estelar', ['#00e5ff', '#03153a', '#7cffcb'], 'abismo', 'Luz bioluminiscente del fondo del mar: tu nombre brilla como una medusa y tu portada es el abismo.', { exclusivo: 'marea-estelar', icono: 'ola', texto: 'Señor del Abismo' }),
  O('kitsune-sakura', 'Kitsune de Nueve Colas', 5, TODO, 'Sakura Eterna', ['#ff8fc8', '#3a0f2e', '#ffe08a'], 'kitsune', 'Fuego de zorro y pétalos de cerezo que caen sin parar sobre tu perfil.', { exclusivo: 'kitsune-sakura', icono: 'flor', texto: 'Kitsune de Nueve Colas' }),
  O('corona-campeon', 'Corona del Campeón', 5, TODO, 'Coronación', ['#ffd23c', '#3b2500', '#fff6c9'], 'corona', 'Oro líquido y una corona que gira sobre tu avatar. Para quien llega a la final.', { exclusivo: 'coronacion', icono: 'corona', texto: 'Soberano de las Sustolimpiadas' }),
  // ── 5★ permanentes: Los Cinco Eternos ──
  O('nebula-violeta', 'Nébula Violeta', 5, TODO, 'Los Cinco Eternos', ['#b36bff', '#1a0b3d', '#ff7ae0'], 'nebula', 'Polvo de estrellas violeta que gira lento alrededor de tu avatar.', { icono: 'estrella', texto: 'Hija de la Nébula' }),
  O('fenix-solar', 'Fénix Solar', 5, TODO, 'Los Cinco Eternos', ['#ff7a1a', '#3d0f00', '#ffd23c'], 'fenix', 'Llamas que suben por tu marco y un nombre que arde.', { icono: 'llama', texto: 'Renacido del Fuego' }),
  O('glaciar-boreal', 'Glaciar Boreal', 5, TODO, 'Los Cinco Eternos', ['#9be7ff', '#06243d', '#e8fbff'], 'boreal', 'Una aurora boreal cruza tu portada; tu marco es hielo que destella.', { icono: 'copo', texto: 'Guardián del Norte' }),
  O('bosque-esmeralda', 'Bosque Esmeralda', 5, TODO, 'Los Cinco Eternos', ['#3ddc84', '#062814', '#d4ff7a'], 'bosque', 'Luciérnagas y hojas vivas: tu perfil respira como un bosque encantado.', { icono: 'hoja', texto: 'Espíritu del Bosque' }),
  O('neon-cibernetico', 'Neón Cibernético', 5, TODO, 'Los Cinco Eternos', ['#00f0ff', '#14001f', '#ff2bd6'], 'neon', 'Líneas de neón que parpadean y un nombre con interferencia digital.', { icono: 'rayo', texto: 'Fantasma en la Red' }),

  // ── 4★ marcos ──
  O('marco-murcielagos', 'Marco Vuelo de Murciélagos', 4, ['marco'], 'Velo de Medianoche', ['#ff2e4d', '#2a0a14', '#ffffff'], 'orbita', 'Dos murciélagos dan vueltas alrededor de tu avatar.', { exclusivo: 'velo-medianoche' }),
  O('marco-coral', 'Marco Arrecife', 4, ['marco'], 'Marea Estelar', ['#ff7f6a', '#00e5ff', '#ffffff'], 'doble', 'Coral y espuma de mar en dos anillos.', { exclusivo: 'marea-estelar' }),
  O('marco-torii', 'Marco Torii', 4, ['marco'], 'Sakura Eterna', ['#e8392f', '#2b0b0b', '#ffd23c'], 'gema', 'Cuatro faroles rojos custodian tu avatar.', { exclusivo: 'kitsune-sakura' }),
  O('marco-laurel', 'Marco Laurel Dorado', 4, ['marco'], 'Coronación', ['#ffd23c', '#7a5200', '#ffffff'], 'pulso', 'Laureles de oro que laten despacio.', { exclusivo: 'coronacion' }),
  O('marco-prisma', 'Marco Prisma', 4, ['marco'], 'Firmamento', ['#ff5f6d', '#ffc371', '#47e5bc'], 'petalos', 'Un arcoíris que gira sin parar.'),
  O('marco-eclipse', 'Marco Eclipse', 4, ['marco'], 'Firmamento', ['#ffd23c', '#000000', '#ff7a1a'], 'pulso', 'Una corona solar que respira.'),
  O('marco-runas', 'Marco Runas', 4, ['marco'], 'Firmamento', ['#7cffcb', '#0a2a24', '#ffffff'], 'punteado', 'Runas que giran alrededor de tu avatar.'),
  O('marco-cometa', 'Marco Cometa', 4, ['marco'], 'Firmamento', ['#9be7ff', '#2b4cff', '#ffffff'], 'orbita', 'Un cometa que orbita tu avatar.'),
  O('marco-sakura', 'Marco Pétalo', 4, ['marco'], 'Firmamento', ['#ff8fc8', '#ffe0f0', '#ffffff'], 'petalos', 'Pétalos rosados en remolino.'),
  // ── 4★ placas (fondo detrás del nombre) ──
  O('placa-niebla', 'Placa Niebla de Medianoche', 4, ['placa'], 'Velo de Medianoche', ['#2a0a14', '#ff2e4d', '#5b0a1e'], 'brillo', 'Niebla roja que pasa detrás de tu nombre.', { exclusivo: 'velo-medianoche' }),
  O('placa-burbujas', 'Placa Burbujas', 4, ['placa'], 'Marea Estelar', ['#03153a', '#00e5ff', '#7cffcb'], 'puntos', 'Burbujas que suben detrás de tu nombre.', { exclusivo: 'marea-estelar' }),
  O('placa-abanico', 'Placa Abanico', 4, ['placa'], 'Sakura Eterna', ['#3a0f2e', '#ff8fc8', '#ffe08a'], 'olas', 'Un abanico japonés con olas de oro.', { exclusivo: 'kitsune-sakura' }),
  O('placa-podio', 'Placa Podio', 4, ['placa'], 'Coronación', ['#3b2500', '#ffd23c', '#fff6c9'], 'rayas', 'Rayas de oro de podio.', { exclusivo: 'coronacion' }),
  O('placa-galaxia', 'Placa Galaxia', 4, ['placa'], 'Firmamento', ['#0b0628', '#6b4cff', '#ff7ae0'], 'brillo', 'Una galaxia pasa detrás de tu nombre.'),
  O('placa-atardecer', 'Placa Atardecer', 4, ['placa'], 'Firmamento', ['#ff7a1a', '#ff2e8a', '#4b2276'], 'liso', 'El cielo de la isla a las 7 de la tarde.'),
  O('placa-matrix', 'Placa Código', 4, ['placa'], 'Firmamento', ['#001a0a', '#3ddc84', '#a6ffcb'], 'rayas', 'Lluvia de código verde.'),
  O('placa-arcade', 'Placa Arcade', 4, ['placa'], 'Firmamento', ['#14001f', '#ff2bd6', '#00f0ff'], 'puntos', 'Píxeles de máquina de monedas.'),
  // ── 4★ nombres con degradado ──
  O('tinta-sangre', 'Tinta Sangre de Luna', 4, ['tinta'], 'Velo de Medianoche', ['#ff2e4d', '#ffd1dc', '#ff2e4d'], 'degradado', 'Tu nombre en rojo luna.', { exclusivo: 'velo-medianoche' }),
  O('tinta-marea', 'Tinta Marea', 4, ['tinta'], 'Marea Estelar', ['#00e5ff', '#7cffcb', '#2b4cff'], 'degradado', 'Tu nombre como el mar.', { exclusivo: 'marea-estelar' }),
  O('tinta-cerezo', 'Tinta Cerezo', 4, ['tinta'], 'Sakura Eterna', ['#ff8fc8', '#ffe08a', '#ff5fa2'], 'degradado', 'Rosado cerezo con brillo de oro.', { exclusivo: 'kitsune-sakura' }),
  O('tinta-oro', 'Tinta Oro', 4, ['tinta'], 'Coronación', ['#ffd23c', '#fff6c9', '#c9a227'], 'degradado', 'Tu nombre en oro.', { exclusivo: 'coronacion' }),
  O('tinta-arcoiris', 'Tinta Arcoíris', 4, ['tinta'], 'Firmamento', ['#ff5f6d', '#ffc371', '#47e5bc'], 'degradado', 'Todos los colores en tu nombre.'),
  O('tinta-plasma', 'Tinta Plasma', 4, ['tinta'], 'Firmamento', ['#ff2bd6', '#00f0ff', '#b36bff'], 'degradado', 'Rosa y celeste eléctricos.'),
  O('tinta-lava', 'Tinta Lava', 4, ['tinta'], 'Firmamento', ['#ff7a1a', '#ffd23c', '#ff2e4d'], 'degradado', 'Tu nombre recién salido del volcán.'),
  O('tinta-hielo', 'Tinta Escarcha', 4, ['tinta'], 'Firmamento', ['#e8fbff', '#9be7ff', '#5aa9ff'], 'degradado', 'Frío que se ve.'),
  // ── 4★ auras (cuando estás en línea), burbujas y portadas ──
  O('aura-fuego-fatuo', 'Aura Fuego Fatuo', 4, ['aura'], 'Firmamento', ['#5aa9ff', '#9be7ff', '#ffffff'], 'halo', 'Una llama azul rodea tu avatar cuando estás en línea.'),
  O('aura-solar', 'Aura Solar', 4, ['aura'], 'Firmamento', ['#ffd23c', '#ff7a1a', '#ffffff'], 'halo', 'Brillas como el sol cuando estás en línea.'),
  O('aura-toxica', 'Aura Tóxica', 4, ['aura'], 'Firmamento', ['#a6ff00', '#3ddc84', '#ffffff'], 'halo', 'Verde radiactivo: cuidado, está en línea.'),
  O('aura-rosa', 'Aura Corazón', 4, ['aura'], 'Sakura Eterna', ['#ff5fa2', '#ff8fc8', '#ffffff'], 'halo', 'Un halo rosado cuando estás en línea.', { exclusivo: 'kitsune-sakura' }),
  O('burbuja-comic', 'Burbuja Cómic', 4, ['burbuja'], 'Firmamento', ['#ffd23c', '#17131f', '#ffffff'], 'comic', 'Tus declaraciones como viñeta de cómic.'),
  O('burbuja-pergamino', 'Burbuja Pergamino', 4, ['burbuja'], 'Firmamento', ['#f4ead5', '#7a5200', '#3a2a12'], 'pergamino', 'Tus declaraciones escritas en pergamino.'),
  O('burbuja-neon', 'Burbuja Neón', 4, ['burbuja'], 'Firmamento', ['#ff2bd6', '#14001f', '#00f0ff'], 'neon', 'Tus declaraciones en un letrero de neón.'),
  O('portada-cumbre', 'Portada Cumbre Nevada', 4, ['portada'], 'Firmamento', ['#9be7ff', '#2b4cff', '#ffffff'], 'montana', 'Montañas al amanecer en tu perfil.'),
  O('portada-ciudad', 'Portada Ciudad Nocturna', 4, ['portada'], 'Firmamento', ['#ff2bd6', '#14001f', '#ffd23c'], 'ciudad', 'Edificios y ventanas encendidas.'),
  O('portada-playa', 'Portada Isla al Atardecer', 4, ['portada'], 'Firmamento', ['#ff7a1a', '#4b2276', '#ffd23c'], 'playa', 'El sol se esconde en el mar.'),

  // ── 3★ títulos ──
  ...([
    ['tit-rey-lag', 'Rey del Lag'], ['tit-intocable', 'El Intocable'], ['tit-mano-seda', 'Mano de Seda'], ['tit-30', 'Pesadilla del 3-0'],
    ['tit-ultimo', 'Último en Rendirse'], ['tit-tryhard', 'Tryhard Certificado'], ['tit-casual', 'Casual de Corazón'], ['tit-insomne', 'Insomne Profesional'],
    ['tit-suerte', 'Bendecido por el RNG'], ['tit-mala-suerte', 'Maldito por el RNG'], ['tit-revancha', 'Pide Revancha'], ['tit-calabaza', 'Calabaza con Patas'],
    ['tit-estratega', 'Gran Estratega'], ['tit-velocista', 'Dedos Rápidos'], ['tit-fantasma', 'Fantasma del Portal'], ['tit-tsukibet', 'Vidente de TSUKIBET'],
  ] as const).map(([id, texto]) => O(id, `Título «${texto}»`, 3, ['titulo'], 'Títulos', ['#cbd5ff', '#233760', '#ffffff'], 'titulo', 'Un título para lucir bajo tu nombre.', { texto })),
  // ── 3★ emblemas (junto al nombre) ──
  ...([
    ['emb-estrella', 'Estrella', 'estrella', '#ffd23c'], ['emb-luna', 'Luna', 'luna', '#e8fbff'], ['emb-rayo', 'Rayo', 'rayo', '#ffd23c'], ['emb-corazon', 'Corazón', 'corazon', '#ff5fa2'],
    ['emb-calavera', 'Calavera', 'calavera', '#f3ecdc'], ['emb-diamante', 'Diamante', 'diamante', '#9be7ff'], ['emb-llama', 'Llama', 'llama', '#ff7a1a'], ['emb-hoja', 'Hoja', 'hoja', '#3ddc84'],
    ['emb-corona', 'Corona', 'corona', '#ffd23c'], ['emb-ojo', 'Ojo', 'ojo', '#b36bff'],
  ] as const).map(([id, nombre, icono, c]) => O(id, `Emblema ${nombre}`, 3, ['emblema'], 'Emblemas', [c, '#233760', '#ffffff'], 'emblema', 'Un emblema junto a tu nombre.', { icono })),
  // ── 3★ colores de nombre ──
  ...([
    ['col-menta', 'Menta', '#6fd6b4'], ['col-calabaza', 'Calabaza', '#ff9a2e'], ['col-lavanda', 'Lavanda', '#c3a6ff'], ['col-cielo', 'Cielo', '#7cc8ff'],
    ['col-rosa', 'Chicle', '#ff8fc8'], ['col-limon', 'Limón', '#e6ff6b'], ['col-coral', 'Coral', '#ff7f6a'], ['col-plata', 'Plata', '#dfe6f3'],
  ] as const).map(([id, nombre, c]) => O(id, `Color ${nombre}`, 3, ['tinta'], 'Colores', [c, c, c], 'solido', 'Un color para tu nombre.')),
];
export const objeto = (id: string | null | undefined) => (id ? OBJETOS.find((o) => o.id === id) ?? null : null);

// ───────── Banners ─────────
export type Grupo = 'evento' | 'permanente' | 'principiante';
export interface Banner { id: string; nombre: string; grupo: Grupo; lema: string; desde: string; hasta: string; destacado5: string | null; destacados4: string[]; c: [string, string, string] }
const fecha = (f: string) => `${f}T00:00:00-03:00`;
export const BANNERS: Banner[] = [
  { id: 'velo-medianoche', nombre: 'Velo de Medianoche', grupo: 'evento', lema: 'Cuando la luna se tiñe de rojo, algo despierta.', desde: fecha('2026-10-27'), hasta: fecha('2026-11-03'), destacado5: 'luna-carmesi', destacados4: ['marco-murcielagos', 'placa-niebla', 'tinta-sangre'], c: ['#ff2e4d', '#2a0a14', '#ffd1dc'] },
  { id: 'marea-estelar', nombre: 'Marea Estelar', grupo: 'evento', lema: 'En lo más hondo del mar, las estrellas también brillan.', desde: fecha('2026-11-03'), hasta: fecha('2026-11-11'), destacado5: 'leviatan-abisal', destacados4: ['marco-coral', 'placa-burbujas', 'tinta-marea'], c: ['#00e5ff', '#03153a', '#7cffcb'] },
  { id: 'kitsune-sakura', nombre: 'Sakura Eterna', grupo: 'evento', lema: 'Nueve colas, mil pétalos, un solo zorro.', desde: fecha('2026-11-11'), hasta: fecha('2026-11-20'), destacado5: 'kitsune-sakura', destacados4: ['marco-torii', 'placa-abanico', 'tinta-cerezo'], c: ['#ff8fc8', '#3a0f2e', '#ffe08a'] },
  { id: 'coronacion', nombre: 'Coronación', grupo: 'evento', lema: 'Solo uno se lleva la corona.', desde: fecha('2026-11-20'), hasta: fecha('2026-11-30'), destacado5: 'corona-campeon', destacados4: ['marco-laurel', 'placa-podio', 'tinta-oro'], c: ['#ffd23c', '#3b2500', '#fff6c9'] },
  { id: 'firmamento', nombre: 'Firmamento Eterno', grupo: 'permanente', lema: 'Los Cinco Eternos esperan a quien mire al cielo.', desde: fecha('2026-10-27'), hasta: fecha('2027-12-31'), destacado5: null, destacados4: [], c: ['#b36bff', '#0b0628', '#9be7ff'] },
  { id: 'primer-deseo', nombre: 'Primer Deseo', grupo: 'principiante', lema: '20 deseos con descuento para empezar: 10 por solo 8.', desde: fecha('2026-10-27'), hasta: fecha('2027-12-31'), destacado5: null, destacados4: [], c: ['#ffd23c', '#14203a', '#9be7ff'] },
];
export const banner = (id: string) => BANNERS.find((b) => b.id === id) ?? null;
/** Banners abiertos en un momento (ms). */
export const bannersActivos = (ahora: number) => BANNERS.filter((b) => Date.parse(b.desde) <= ahora && ahora < Date.parse(b.hasta));
/** Lo que puede salir en un banner, por rareza. */
export function pozo(b: Banner) {
  const permanentes = OBJETOS.filter((o) => !o.exclusivo);
  const p5 = permanentes.filter((o) => o.rareza === 5), p4 = permanentes.filter((o) => o.rareza === 4), p3 = permanentes.filter((o) => o.rareza === 3);
  if (b.grupo !== 'evento') return { cinco: p5, cuatro: p4, tres: p3, destacado5: null, destacados4: [] as Objeto[] };
  const d4 = b.destacados4.map((id) => objeto(id)!).filter(Boolean);
  return { cinco: p5, cuatro: p4, tres: p3, destacado5: objeto(b.destacado5), destacados4: d4 };
}

// ───────── Misiones diarias ─────────
export interface MisionDef { id: string; texto: string }
export const MISIONES: Record<string, string> = {
  'partidas-3': 'Juega 3 partidas',
  'partidas-8': 'Juega 8 partidas',
  'juegos-2': 'Juega 2 juegos distintos',
  'juego-dia': 'Juega {juego}',
  'mejor-marca': 'Supera tu mejor marca en cualquier juego',
  'ronda-duelo': 'Juega una ronda de uno de tus duelos',
  'tsukibet': 'Haz 3 pronósticos en TSUKIBET',
  'declara': 'Deja una declaración antes de un duelo',
  'vota-cuarta': 'Vota en la encuesta de La Cuarta',
};
