// Catálogo de piezas del personaje. Agregar una opción = agregar un nombre aquí y su dibujo en cara.ts o modelo.ts.
// Las opciones nuevas van siempre AL FINAL de cada lista: los personajes guardados usan el número de posición.

export const CABEZAS = ['Redonda', 'Ovalada', 'Ancha', 'Baja', 'Cuadrada', 'Corazón', 'Larga', 'Pera'];
export const OJOS = ['Puntos', 'Redondos', 'Almendra', 'Felices', 'Dormidos', 'Brillantes', 'Pestañas', 'Entrecerrados', 'Enojados', 'Tristes', 'Mini', 'Guiño', 'Rasgados', 'Estrellas', 'Equis', 'Espiral', 'Coquetos'];
export const CEJAS = ['Rectas', 'Arqueadas', 'Enojadas', 'Tristes', 'Gruesas', 'Finas', 'Cortas', 'Sin cejas', 'Unicejo', 'Con corte'];
export const NARICES = ['Sin nariz', 'Punto', 'Línea', 'Curva', 'Triángulo', 'Redonda', 'Respingada', 'Grande', 'Aguileña'];
export const BOCAS = ['Sonrisa', 'Carcajada', 'Seria', 'Triste', 'Sorpresa', 'Dientes', 'Lengua', 'Gatito', 'De lado', 'Chiquita', 'Labios', 'Colmillo', 'Vampiro', 'Cosida', 'Beso', 'Mueca'];
export const DETALLES = ['Ninguno', 'Pecas', 'Rubor', 'Lunar', 'Cicatriz', 'Ojeras', 'Pintura', 'Lágrima', 'Curita', 'Costuras'];
export const BARBAS = ['Sin barba', 'Bigote', 'Candado', 'Barba llena', 'Barba corta', 'Patillas', 'Chivo', 'Mostacho'];
export const LENTES = ['Sin lentes', 'Redondos', 'Cuadrados', 'De sol', 'Monóculo', 'Gruesos', 'Corazones', 'Parche', 'Aviador'];
export const PELOS = ['Calvo', 'Corto', 'Flequillo', 'Melena', 'Largo', 'Cola', 'Dos coletas', 'Moños', 'Afro', 'Mohicano', 'Puntas', 'Hongo', 'Trenzas', 'Rapado', 'Tupé', 'Rizos', 'Chonguito', 'Bob', 'De lado', 'Rastas'];
export const SOMBREROS = ['Nada', 'Gorra', 'Copa', 'Corona', 'Gorro de lana', 'Bruja', 'Cuernos', 'Aureola', 'Orejas de gato', 'Lazo', 'Calabaza', 'Vaquero', 'Pañuelo', 'Audífonos', 'Casco', 'Chef', 'Antenas'];
export const ROPAS = ['Polera', 'Rayas', 'Universitaria', 'Capucha', 'Overol', 'Vestido', 'Musculosa', 'Traje', 'Camisa', 'Bufanda', 'Deportiva', 'Esqueleto', 'Poncho'];
export const OBJETOS = ['Nada', 'Globo', 'Espada', 'Varita', 'Paleta', 'Bandera', 'Farol calabaza'];
export const ESPALDAS = ['Nada', 'Mochila', 'Alas de ángel', 'Alas de murciélago', 'Cola', 'Capa'];
export const PERSONALIDADES = ['Competitivo', 'Tranquilo', 'Payaso', 'Tímido', 'Soñador', 'Glotón'];

export const PIELES = ['#ffe0c4', '#f8cfa8', '#eab98c', '#d49a6a', '#b07a4f', '#8a5a38', '#5e3b25', '#b9e6c9', '#c9c2f5', '#f5b8c8'];
export const COLORES_PELO = ['#1c1a22', '#4a2f1d', '#7a4a26', '#b8813f', '#e8c56a', '#f3ecdc', '#c0392b', '#ff7ab8', '#7b5cff', '#2f9bff', '#3fbf7f', '#9aa3b5'];
export const COLORES_OJOS = ['#1c1a22', '#5a3a1f', '#2f7dd1', '#3fa66b', '#8a8f9c', '#b0412f', '#8a4fd1', '#e0a52a'];
export const COLORES_ROPA = ['#ef5565', '#ff9a2e', '#ffd84a', '#5fc46a', '#2fb8a8', '#3f8cff', '#7b5cff', '#ff7ab8', '#f3ecdc', '#8a94a8', '#2b3047', '#6b4a2b'];

export interface Apariencia {
  piel: string;
  cabeza: number;
  ojos: number;
  colorOjos: string;
  cejas: number;
  nariz: number;
  boca: number;
  detalle: number;
  barba: number;
  lentes: number;
  pelo: number;
  colorPelo: string;
  sombrero: number;
  colorSombrero: string;
  ropa: number;
  colorRopa: string;
  colorRopa2: string;
  colorPantalon: string;
  colorZapatos: string;
  objeto: number;
  espalda: number;
  altura: number;
  contextura: number;
}

// ───────── Personajes con modelos de Kenney (los que usa el sitio) ─────────
export const BASES = ['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f'];
export const ANTEOJOS = ['Sin lentes', 'Lentes', 'Lentes de sol', 'Mascarilla'];

/** Cómo se ve un personaje: cabeza y cuerpo de Kenney, colores cambiados y accesorios. Es lo que se guarda en la base. */
export interface Aspecto {
  cabeza: number;
  cuerpo: number;
  colores: Record<string, string>; // grupo de color del modelo → color elegido
  sombrero: number;
  colorSombrero: string;
  lentes: number;
  objeto: number;
  espalda: number;
  colorAccesorio: string;
  altura: number;
  contextura: number;
  /** Si es un personaje preseleccionado (ver presets.ts): su id. Esos no se editan. */
  preset?: string;
}

export interface Personaje {
  nombre: string;
  apariencia: Aspecto;
  personalidad: string;
  voz: number;
  frase: string;
}

export function aspectoBase(): Aspecto {
  return { cabeza: 0, cuerpo: 6, colores: {}, sombrero: 0, colorSombrero: COLORES_ROPA[0], lentes: 0, objeto: 0, espalda: 0, colorAccesorio: COLORES_ROPA[5], altura: 0.5, contextura: 0.5 };
}

/** Los datos que vienen de la base o del navegador no son de confianza: se ajustan a rangos válidos. */
export function normalizarAspecto(dato: unknown): Aspecto {
  const base = aspectoBase();
  if (!dato || typeof dato !== 'object') return base;
  const d = dato as Record<string, unknown>;
  const entero = (v: unknown, max: number, porDefecto: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max - 1, Math.max(0, Math.floor(v))) : porDefecto);
  const unidad = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
  const colores: Record<string, string> = {};
  if (d.colores && typeof d.colores === 'object') {
    for (const [k, v] of Object.entries(d.colores as Record<string, unknown>).slice(0, 24)) if (/^(cabeza|cuerpo)\|[a-z0-9]{1,10}$/.test(k) && esColor(v)) colores[k] = v.toLowerCase();
  }
  return {
    cabeza: entero(d.cabeza, BASES.length, base.cabeza), cuerpo: entero(d.cuerpo, BASES.length, base.cuerpo), colores,
    sombrero: entero(d.sombrero, SOMBREROS.length, 0), colorSombrero: esColor(d.colorSombrero) ? d.colorSombrero.toLowerCase() : base.colorSombrero,
    lentes: entero(d.lentes, ANTEOJOS.length, 0), objeto: entero(d.objeto, OBJETOS.length, 0), espalda: entero(d.espalda, ESPALDAS.length, 0),
    colorAccesorio: esColor(d.colorAccesorio) ? d.colorAccesorio.toLowerCase() : base.colorAccesorio, altura: unidad(d.altura), contextura: unidad(d.contextura),
    ...(typeof d.preset === 'string' && /^[a-z0-9-]{2,24}$/.test(d.preset) ? { preset: d.preset } : {}),
  };
}

export function aspectoAleatorio(r: () => number = Math.random): Aspecto {
  const n = (total: number) => Math.floor(r() * total);
  const raro = (total: number, prob: number) => (r() < prob ? 1 + n(total - 1) : 0);
  return {
    cabeza: n(BASES.length), cuerpo: n(BASES.length), colores: {}, sombrero: raro(SOMBREROS.length, 0.35), colorSombrero: COLORES_ROPA[n(COLORES_ROPA.length)],
    lentes: raro(ANTEOJOS.length, 0.2), objeto: raro(OBJETOS.length, 0.2), espalda: raro(ESPALDAS.length, 0.2), colorAccesorio: COLORES_ROPA[n(COLORES_ROPA.length)],
    altura: r(), contextura: r(),
  };
}

const LIMITES: Partial<Record<keyof Apariencia, number>> = {
  cabeza: CABEZAS.length, ojos: OJOS.length, cejas: CEJAS.length, nariz: NARICES.length, boca: BOCAS.length,
  detalle: DETALLES.length, barba: BARBAS.length, lentes: LENTES.length, pelo: PELOS.length,
  sombrero: SOMBREROS.length, ropa: ROPAS.length, objeto: OBJETOS.length, espalda: ESPALDAS.length,
};

export function aparienciaBase(): Apariencia {
  return {
    piel: PIELES[1], cabeza: 0, ojos: 1, colorOjos: COLORES_OJOS[1], cejas: 0, nariz: 1, boca: 0, detalle: 0,
    barba: 0, lentes: 0, pelo: 1, colorPelo: COLORES_PELO[1], sombrero: 0, colorSombrero: COLORES_ROPA[0],
    ropa: 0, colorRopa: COLORES_ROPA[5], colorRopa2: COLORES_ROPA[8], colorPantalon: COLORES_ROPA[10],
    colorZapatos: COLORES_ROPA[8], objeto: 0, espalda: 0, altura: 0.5, contextura: 0.5,
  };
}

export function personajeBase(): Personaje {
  return { nombre: '', apariencia: aspectoBase(), personalidad: PERSONALIDADES[1], voz: 0.5, frase: '' };
}

const esColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Los datos que vienen de la base o del navegador no son de confianza: se ajustan a rangos válidos. */
export function normalizarApariencia(dato: unknown): Apariencia {
  const base = aparienciaBase();
  if (!dato || typeof dato !== 'object') return base;
  const d = dato as Record<string, unknown>;
  const fuera = base as unknown as Record<string, unknown>;
  for (const k of Object.keys(base) as (keyof Apariencia)[]) {
    const v = d[k];
    if (typeof base[k] === 'string') {
      if (esColor(v)) fuera[k] = v.toLowerCase();
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      const max = LIMITES[k];
      fuera[k] = max ? Math.min(max - 1, Math.max(0, Math.floor(v))) : Math.min(1, Math.max(0, v));
    }
  }
  return base;
}

export function normalizarPersonaje(dato: unknown): Personaje {
  const base = personajeBase();
  if (!dato || typeof dato !== 'object') return base;
  const d = dato as Record<string, unknown>;
  return {
    nombre: typeof d.nombre === 'string' ? d.nombre.slice(0, 24) : '',
    apariencia: normalizarAspecto(d.apariencia),
    personalidad: PERSONALIDADES.includes(d.personalidad as string) ? (d.personalidad as string) : base.personalidad,
    voz: typeof d.voz === 'number' && Number.isFinite(d.voz) ? Math.min(1, Math.max(0, d.voz)) : 0.5,
    frase: typeof d.frase === 'string' ? d.frase.slice(0, 60) : '',
  };
}

export function personajeAleatorio(r: () => number = Math.random, nombre = ''): Personaje {
  return { nombre, personalidad: PERSONALIDADES[Math.floor(r() * PERSONALIDADES.length)], voz: r(), frase: '', apariencia: aspectoAleatorio(r) };
}

/** Apariencia al azar del modelo antiguo (hecho por código). Ya no la usa el sitio. */
export function aparienciaAleatoria(r: () => number = Math.random): Apariencia {
  const de = <T,>(lista: T[]): T => lista[Math.floor(r() * lista.length)];
  const n = (lista: unknown[]) => Math.floor(r() * lista.length);
  const raro = (lista: unknown[], prob: number) => (r() < prob ? 1 + Math.floor(r() * (lista.length - 1)) : 0);
  return {
    ...{
      piel: de(PIELES.slice(0, 7)), cabeza: n(CABEZAS), ojos: n(OJOS), colorOjos: de(COLORES_OJOS), cejas: n(CEJAS),
      nariz: n(NARICES), boca: n(BOCAS), detalle: raro(DETALLES, 0.35), barba: raro(BARBAS, 0.2), lentes: raro(LENTES, 0.25),
      pelo: n(PELOS), colorPelo: de(COLORES_PELO), sombrero: raro(SOMBREROS, 0.35), colorSombrero: de(COLORES_ROPA),
      ropa: n(ROPAS), colorRopa: de(COLORES_ROPA), colorRopa2: de(COLORES_ROPA), colorPantalon: de(COLORES_ROPA),
      colorZapatos: de(COLORES_ROPA), objeto: raro(OBJETOS, 0.25), espalda: raro(ESPALDAS, 0.25), altura: r(), contextura: r(),
    },
  };
}

/** Cantidad de combinaciones distintas sin contar colores libres ni cuerpo. */
export const COMBINACIONES = [CABEZAS, OJOS, CEJAS, NARICES, BOCAS, DETALLES, BARBAS, LENTES, PELOS, SOMBREROS, ROPAS, OBJETOS, ESPALDAS]
  .reduce((total, lista) => total * lista.length, 1);
