// Los datos de Bestiario, sin dependencias (para revisarlos con `node`): los tipos y su tabla de eficacia, los ataques
// y las 30 criaturas. Todo es propio; la lógica sigue la de los juegos clásicos de batallas de criaturas: cada criatura
// ataca sobre todo con ataques de su tipo (que pegan x1,5) y los tipos se ganan entre sí según la tabla.

export type Tipo = 'normal' | 'fuego' | 'agua' | 'planta' | 'electrico' | 'hielo' | 'lucha' | 'veneno' | 'tierra' | 'volador' | 'psiquico' | 'bicho' | 'roca' | 'fantasma' | 'dragon';
export type Stat = 'at' | 'def' | 'ate' | 'dfe' | 'vel';
export type EstadoAlterado = 'quemado' | 'paralizado' | 'dormido' | 'envenenado' | 'toxico' | 'congelado';

export const TIPOS: Record<Tipo, { nombre: string; color: string }> = {
  normal: { nombre: 'Normal', color: '#a8a77a' }, fuego: { nombre: 'Fuego', color: '#ee8130' }, agua: { nombre: 'Agua', color: '#6390f0' },
  planta: { nombre: 'Planta', color: '#7ac74c' }, electrico: { nombre: 'Eléctrico', color: '#f7d02c' }, hielo: { nombre: 'Hielo', color: '#96d9d6' },
  lucha: { nombre: 'Lucha', color: '#c22e28' }, veneno: { nombre: 'Veneno', color: '#a33ea1' }, tierra: { nombre: 'Tierra', color: '#e2bf65' },
  volador: { nombre: 'Volador', color: '#a98ff3' }, psiquico: { nombre: 'Psíquico', color: '#f95587' }, bicho: { nombre: 'Bicho', color: '#a6b91a' },
  roca: { nombre: 'Roca', color: '#b6a136' }, fantasma: { nombre: 'Fantasma', color: '#735797' }, dragon: { nombre: 'Dragón', color: '#6f35fc' },
};

/** Eficacia del tipo atacante contra el defensor (lo que no aparece vale x1). */
const TABLA: Partial<Record<Tipo, Partial<Record<Tipo, number>>>> = {
  normal: { roca: 0.5, fantasma: 0 },
  fuego: { fuego: 0.5, agua: 0.5, planta: 2, hielo: 2, bicho: 2, roca: 0.5, dragon: 0.5 },
  agua: { fuego: 2, agua: 0.5, planta: 0.5, tierra: 2, roca: 2, dragon: 0.5 },
  electrico: { agua: 2, electrico: 0.5, planta: 0.5, tierra: 0, volador: 2, dragon: 0.5 },
  planta: { fuego: 0.5, agua: 2, planta: 0.5, veneno: 0.5, tierra: 2, volador: 0.5, bicho: 0.5, roca: 2, dragon: 0.5 },
  hielo: { fuego: 0.5, agua: 0.5, planta: 2, hielo: 0.5, tierra: 2, volador: 2, dragon: 2 },
  lucha: { normal: 2, hielo: 2, veneno: 0.5, volador: 0.5, psiquico: 0.5, bicho: 0.5, roca: 2, fantasma: 0 },
  veneno: { planta: 2, veneno: 0.5, tierra: 0.5, roca: 0.5, fantasma: 0.5 },
  tierra: { fuego: 2, electrico: 2, planta: 0.5, veneno: 2, volador: 0, bicho: 0.5, roca: 2 },
  volador: { electrico: 0.5, planta: 2, lucha: 2, bicho: 2, roca: 0.5 },
  psiquico: { lucha: 2, veneno: 2, psiquico: 0.5 },
  bicho: { fuego: 0.5, planta: 2, lucha: 0.5, veneno: 0.5, volador: 0.5, psiquico: 2, fantasma: 0.5 },
  roca: { fuego: 2, hielo: 2, lucha: 0.5, tierra: 0.5, volador: 2, bicho: 2 },
  fantasma: { normal: 0, psiquico: 2, fantasma: 2 },
  dragon: { dragon: 2 },
};
export const eficacia = (ataque: Tipo, defensor: Tipo[]) => defensor.reduce((m, t) => m * (TABLA[ataque]?.[t] ?? 1), 1);

/** Efectos de un ataque. `prob` en %: si falta, el efecto es seguro. */
export interface Efecto {
  estado?: EstadoAlterado; confusion?: boolean; retroceso?: boolean; prob?: number;
  /** Cambios de estadísticas: al rival o a quien ataca. */
  stats?: Partial<Record<Stat, number>>; aQuien?: 'rival' | 'yo';
  drena?: number; rebote?: number; cura?: number; protege?: boolean; dobleSiEstado?: boolean; descongela?: boolean;
}
export interface Ataque { nombre: string; tipo: Tipo; cat: 'fisico' | 'especial' | 'estado'; poder: number; precision: number; pp: number; prioridad?: number; critico?: boolean; efecto?: Efecto; texto: string }

const a = (nombre: string, tipo: Tipo, cat: Ataque['cat'], poder: number, precision: number, pp: number, texto: string, efecto?: Efecto, extra: Partial<Ataque> = {}): Ataque => ({ nombre, tipo, cat, poder, precision, pp, texto, efecto, ...extra });
/** precisión 0 = nunca falla. */
export const ATAQUES: Record<string, Ataque> = {
  // Normal
  placaje: a('Placaje', 'normal', 'fisico', 40, 100, 35, 'Embiste con todo el cuerpo.'),
  aranazo: a('Arañazo', 'normal', 'fisico', 40, 100, 35, 'Araña con garras afiladas.'),
  ataqueRapido: a('Ataque Rápido', 'normal', 'fisico', 40, 100, 30, 'Tan veloz que siempre golpea primero.', undefined, { prioridad: 1 }),
  mordisco: a('Mordisco', 'normal', 'fisico', 60, 100, 25, 'Muerde fuerte. Puede hacer retroceder.', { retroceso: true, prob: 30 }),
  golpeCuerpo: a('Golpe Cuerpo', 'normal', 'fisico', 85, 100, 15, 'Se lanza con todo su peso. Puede paralizar.', { estado: 'paralizado', prob: 30 }),
  dobleFilo: a('Doble Filo', 'normal', 'fisico', 120, 100, 15, 'Embestida brutal que también lo daña a él.', { rebote: 1 / 3 }),
  grunido: a('Gruñido', 'normal', 'estado', 0, 100, 40, 'Gruñe con ternura: baja el Ataque del rival.', { stats: { at: -1 }, aQuien: 'rival' }),
  malicioso: a('Malicioso', 'normal', 'estado', 0, 100, 30, 'Mirada intimidante: baja la Defensa del rival.', { stats: { def: -1 }, aQuien: 'rival' }),
  fortaleza: a('Fortaleza', 'normal', 'estado', 0, 0, 30, 'Endurece el cuerpo: sube su Defensa.', { stats: { def: 1 }, aQuien: 'yo' }),
  danzaEspada: a('Danza Espada', 'normal', 'estado', 0, 0, 20, 'Danza de combate: sube mucho su Ataque.', { stats: { at: 2 }, aQuien: 'yo' }),
  desarrollo: a('Desarrollo', 'normal', 'estado', 0, 0, 20, 'Crece: sube su Ataque y su Ataque Especial.', { stats: { at: 1, ate: 1 }, aQuien: 'yo' }),
  proteccion: a('Protección', 'normal', 'estado', 0, 0, 10, 'Se protege de todo este turno. Seguido, falla más.', { protege: true }, { prioridad: 4 }),
  recuperacion: a('Recuperación', 'normal', 'estado', 0, 0, 10, 'Recupera la mitad de sus PS.', { cura: 0.5 }),
  // Fuego
  ascuas: a('Ascuas', 'fuego', 'especial', 40, 100, 25, 'Lanza brasas. Puede quemar.', { estado: 'quemado', prob: 10 }),
  ruedaFuego: a('Rueda Fuego', 'fuego', 'fisico', 60, 100, 25, 'Rueda envuelto en llamas. Puede quemar.', { estado: 'quemado', prob: 10, descongela: true }),
  lanzallamas: a('Lanzallamas', 'fuego', 'especial', 90, 100, 15, 'Un chorro de fuego intenso. Puede quemar.', { estado: 'quemado', prob: 10 }),
  llamarada: a('Llamarada', 'fuego', 'especial', 110, 85, 5, 'Una enorme llamarada en forma de estrella. Puede quemar.', { estado: 'quemado', prob: 10 }),
  fuegoFatuo: a('Fuego Fatuo', 'fuego', 'estado', 0, 85, 15, 'Llamas tenues que queman al rival.', { estado: 'quemado' }),
  embestidaIgnea: a('Embestida Ígnea', 'fuego', 'fisico', 120, 100, 15, 'Carga en llamas que también lo daña a él.', { rebote: 1 / 3, estado: 'quemado', prob: 10, descongela: true }),
  // Agua
  pistolaAgua: a('Pistola Agua', 'agua', 'especial', 40, 100, 25, 'Dispara un chorro de agua.'),
  hidropulso: a('Hidropulso', 'agua', 'especial', 60, 100, 20, 'Onda de agua. Puede confundir.', { confusion: true, prob: 20 }),
  surf: a('Surf', 'agua', 'especial', 90, 100, 15, 'Una gran ola que arrasa con el rival.'),
  hidrocanon: a('Hidrocañón', 'agua', 'especial', 110, 80, 5, 'Un cañonazo de agua a presión.'),
  acuaJet: a('Acua Jet', 'agua', 'fisico', 40, 100, 20, 'Se lanza a toda velocidad: golpea primero.', undefined, { prioridad: 1 }),
  cascada: a('Cascada', 'agua', 'fisico', 80, 100, 15, 'Carga con la fuerza de una cascada. Puede hacer retroceder.', { retroceso: true, prob: 20 }),
  refugio: a('Refugio', 'agua', 'estado', 0, 0, 40, 'Se mete en su caparazón: sube su Defensa.', { stats: { def: 1 }, aQuien: 'yo' }),
  // Planta
  latigoCepa: a('Látigo Cepa', 'planta', 'fisico', 45, 100, 25, 'Azota con lianas.'),
  hojaAfilada: a('Hoja Afilada', 'planta', 'fisico', 55, 95, 25, 'Lanza hojas cortantes. Golpes críticos frecuentes.', undefined, { critico: true }),
  absorcionMayor: a('Absorción Mayor', 'planta', 'especial', 75, 100, 10, 'Absorbe energía: recupera la mitad del daño.', { drena: 0.5 }),
  esferaFloral: a('Esfera Floral', 'planta', 'especial', 90, 100, 10, 'Una esfera de energía natural. Puede bajar la Def. Esp.', { stats: { dfe: -1 }, aQuien: 'rival', prob: 10 }),
  somnifero: a('Somnífero', 'planta', 'estado', 0, 75, 15, 'Esparce un polvo que duerme al rival.', { estado: 'dormido' }),
  mazoMadera: a('Mazo Madera', 'planta', 'fisico', 120, 100, 15, 'Golpea con un tronco. También lo daña a él.', { rebote: 1 / 3 }),
  // Eléctrico
  impactrueno: a('Impactrueno', 'electrico', 'especial', 40, 100, 30, 'Una descarga eléctrica. Puede paralizar.', { estado: 'paralizado', prob: 10 }),
  chispa: a('Chispa', 'electrico', 'fisico', 65, 100, 20, 'Placaje cargado de electricidad. Puede paralizar.', { estado: 'paralizado', prob: 30 }),
  rayo: a('Rayo', 'electrico', 'especial', 90, 100, 15, 'Un potente rayo. Puede paralizar.', { estado: 'paralizado', prob: 10 }),
  trueno: a('Trueno', 'electrico', 'especial', 110, 70, 10, 'Cae un trueno feroz. Puede paralizar.', { estado: 'paralizado', prob: 30 }),
  ondaTrueno: a('Onda Trueno', 'electrico', 'estado', 0, 90, 20, 'Una débil descarga que paraliza.', { estado: 'paralizado' }),
  descargaTotal: a('Descarga Total', 'electrico', 'fisico', 120, 100, 15, 'Embiste electrificado. También lo daña a él.', { rebote: 1 / 3, estado: 'paralizado', prob: 10 }),
  // Hielo
  polvoNieve: a('Polvo Nieve', 'hielo', 'especial', 40, 100, 25, 'Sopla nieve helada. Puede congelar.', { estado: 'congelado', prob: 10 }),
  rayoHielo: a('Rayo Hielo', 'hielo', 'especial', 90, 100, 10, 'Un rayo helado. Puede congelar.', { estado: 'congelado', prob: 10 }),
  ventisca: a('Ventisca', 'hielo', 'especial', 110, 70, 5, 'Una tormenta de nieve. Puede congelar.', { estado: 'congelado', prob: 10 }),
  canoHelado: a('Canto Helado', 'hielo', 'fisico', 40, 100, 30, 'Lanza trozos de hielo: golpea primero.', undefined, { prioridad: 1 }),
  colmilloHielo: a('Colmillo Hielo', 'hielo', 'fisico', 65, 95, 15, 'Muerde con colmillos helados. Puede congelar.', { estado: 'congelado', prob: 10 }),
  // Lucha
  golpeKarate: a('Golpe Kárate', 'lucha', 'fisico', 50, 100, 25, 'Golpe de canto. Críticos frecuentes.', undefined, { critico: true }),
  punoVeloz: a('Puño Veloz', 'lucha', 'fisico', 40, 100, 30, 'Un puñetazo rapidísimo: golpea primero.', undefined, { prioridad: 1 }),
  demolicion: a('Demolición', 'lucha', 'fisico', 75, 100, 15, 'Un golpe que rompe barreras.'),
  sumision: a('Sumisión', 'lucha', 'fisico', 80, 80, 20, 'Llave de lucha que también lo daña a él.', { rebote: 1 / 4 }),
  aQuemarropa: a('A Quemarropa', 'lucha', 'fisico', 120, 100, 5, 'Lucha sin guardia: baja su Defensa y su Def. Esp.', { stats: { def: -1, dfe: -1 }, aQuien: 'yo' }),
  corpulencia: a('Corpulencia', 'lucha', 'estado', 0, 0, 20, 'Tensa los músculos: sube su Ataque y su Defensa.', { stats: { at: 1, def: 1 }, aQuien: 'yo' }),
  // Veneno
  acido: a('Ácido', 'veneno', 'especial', 40, 100, 30, 'Rocía ácido. Puede bajar la Def. Esp.', { stats: { dfe: -1 }, aQuien: 'rival', prob: 10 }),
  bombaLodo: a('Bomba Lodo', 'veneno', 'especial', 90, 100, 10, 'Lanza lodo tóxico. Puede envenenar.', { estado: 'envenenado', prob: 30 }),
  puyaNociva: a('Puya Nociva', 'veneno', 'fisico', 80, 100, 20, 'Pincha con una púa venenosa. Puede envenenar.', { estado: 'envenenado', prob: 30 }),
  toxico: a('Tóxico', 'veneno', 'estado', 0, 90, 10, 'Envenena gravemente: el daño crece cada turno.', { estado: 'toxico' }),
  // Tierra
  disparoLodo: a('Disparo Lodo', 'tierra', 'especial', 55, 95, 15, 'Lanza barro: baja la Velocidad del rival.', { stats: { vel: -1 }, aQuien: 'rival' }),
  tierraViva: a('Tierra Viva', 'tierra', 'especial', 90, 100, 10, 'El suelo estalla bajo el rival. Puede bajar la Def. Esp.', { stats: { dfe: -1 }, aQuien: 'rival', prob: 10 }),
  terremoto: a('Terremoto', 'tierra', 'fisico', 100, 100, 10, 'Un terremoto sacude todo.'),
  // Volador
  picotazo: a('Picotazo', 'volador', 'fisico', 35, 100, 35, 'Pica con su pico.'),
  tornado: a('Tornado', 'volador', 'especial', 40, 100, 35, 'Agita las alas y levanta un remolino.'),
  ataqueAla: a('Ataque Ala', 'volador', 'fisico', 60, 100, 35, 'Golpea con las alas extendidas.'),
  golpeAereo: a('Golpe Aéreo', 'volador', 'fisico', 60, 0, 20, 'Un ataque veloz que nunca falla.'),
  aveBrava: a('Ave Brava', 'volador', 'fisico', 120, 100, 15, 'Se lanza en picada. También lo daña a él.', { rebote: 1 / 3 }),
  vendaval: a('Vendaval', 'volador', 'especial', 110, 70, 10, 'Un viento huracanado. Puede confundir.', { confusion: true, prob: 30 }),
  respiro: a('Respiro', 'volador', 'estado', 0, 0, 10, 'Aterriza a descansar: recupera la mitad de sus PS.', { cura: 0.5 }),
  // Psíquico
  confusion: a('Confusión', 'psiquico', 'especial', 50, 100, 25, 'Una onda mental. Puede confundir.', { confusion: true, prob: 10 }),
  psicorrayo: a('Psicorrayo', 'psiquico', 'especial', 65, 100, 20, 'Un rayo extraño. Puede confundir.', { confusion: true, prob: 10 }),
  psiquico: a('Psíquico', 'psiquico', 'especial', 90, 100, 10, 'Una fuerza mental poderosa. Puede bajar la Def. Esp.', { stats: { dfe: -1 }, aQuien: 'rival', prob: 10 }),
  psicocorte: a('Psicocorte', 'psiquico', 'fisico', 70, 100, 20, 'Cuchillas de energía mental. Críticos frecuentes.', undefined, { critico: true }),
  hipnosis: a('Hipnosis', 'psiquico', 'estado', 0, 60, 20, 'Un vaivén hipnótico que duerme al rival.', { estado: 'dormido' }),
  agilidad: a('Agilidad', 'psiquico', 'estado', 0, 0, 30, 'Relaja el cuerpo: sube mucho su Velocidad.', { stats: { vel: 2 }, aQuien: 'yo' }),
  pazMental: a('Paz Mental', 'psiquico', 'estado', 0, 0, 20, 'Medita: sube su Ataque Esp. y su Def. Esp.', { stats: { ate: 1, dfe: 1 }, aQuien: 'yo' }),
  // Bicho
  picadura: a('Picadura', 'bicho', 'fisico', 60, 100, 20, 'Pica con fuerza.'),
  tijeraCruzada: a('Tijera Cruzada', 'bicho', 'fisico', 80, 100, 15, 'Corta en cruz con sus pinzas.'),
  zumbido: a('Zumbido', 'bicho', 'especial', 90, 100, 10, 'Un zumbido ensordecedor. Puede bajar la Def. Esp.', { stats: { dfe: -1 }, aQuien: 'rival', prob: 10 }),
  danzaAleteo: a('Danza Aleteo', 'bicho', 'estado', 0, 0, 20, 'Baile de alas: sube su At. Esp., Def. Esp. y Velocidad.', { stats: { ate: 1, dfe: 1, vel: 1 }, aQuien: 'yo' }),
  hiloPegajoso: a('Hilo Pegajoso', 'bicho', 'estado', 0, 95, 40, 'Enreda al rival: baja mucho su Velocidad.', { stats: { vel: -2 }, aQuien: 'rival' }),
  // Roca
  lanzarrocas: a('Lanzarrocas', 'roca', 'fisico', 50, 90, 15, 'Arroja piedras.'),
  avalancha: a('Avalancha', 'roca', 'fisico', 75, 90, 10, 'Cae un alud de rocas. Puede hacer retroceder.', { retroceso: true, prob: 30 }),
  rocaAfilada: a('Roca Afilada', 'roca', 'fisico', 100, 80, 5, 'Clava rocas puntiagudas. Críticos frecuentes.', undefined, { critico: true }),
  poderPasado: a('Poder Pasado', 'roca', 'especial', 60, 100, 5, 'Un poder antiguo. Puede subir todas sus estadísticas.', { stats: { at: 1, def: 1, ate: 1, dfe: 1, vel: 1 }, aQuien: 'yo', prob: 10 }),
  pulimento: a('Pulimento', 'roca', 'estado', 0, 0, 20, 'Pule su cuerpo: sube mucho su Velocidad.', { stats: { vel: 2 }, aQuien: 'yo' }),
  // Fantasma
  lenguetazo: a('Lengüetazo', 'fantasma', 'fisico', 30, 100, 30, 'Lame con una lengua fría. Puede paralizar.', { estado: 'paralizado', prob: 30 }),
  punoSombra: a('Puño Sombra', 'fantasma', 'fisico', 60, 0, 20, 'Un puño desde las sombras que nunca falla.'),
  bolaSombra: a('Bola Sombra', 'fantasma', 'especial', 80, 100, 15, 'Lanza una esfera oscura. Puede bajar la Def. Esp.', { stats: { dfe: -1 }, aQuien: 'rival', prob: 20 }),
  infortunio: a('Infortunio', 'fantasma', 'especial', 65, 100, 10, 'El doble de fuerte si el rival tiene un problema de estado.', { dobleSiEstado: true }),
  rayoConfuso: a('Rayo Confuso', 'fantasma', 'estado', 0, 100, 10, 'Un rayo siniestro que confunde.', { confusion: true }),
  // Dragón
  dragoaliento: a('Dragoaliento', 'dragon', 'especial', 60, 100, 20, 'Exhala una ráfaga. Puede paralizar.', { estado: 'paralizado', prob: 30 }),
  garraDragon: a('Garra Dragón', 'dragon', 'fisico', 80, 100, 15, 'Desgarra con garras afiladas.'),
  pulsoDragon: a('Pulso Dragón', 'dragon', 'especial', 85, 100, 10, 'Una onda de choque desde la boca.'),
  danzaDragon: a('Danza Dragón', 'dragon', 'estado', 0, 0, 20, 'Danza mística: sube su Ataque y su Velocidad.', { stats: { at: 1, vel: 1 }, aQuien: 'yo' }),
  cometaDragon: a('Cometa Dragón', 'dragon', 'especial', 130, 90, 5, 'Cometas desde el cielo. Baja mucho su At. Esp.', { stats: { ate: -2 }, aQuien: 'yo' }),
};
/** Si no le quedan PP a ningún ataque, forcejea. */
export const FORCEJEO: Ataque = a('Forcejeo', 'normal', 'fisico', 50, 0, 1, 'Último recurso: también lo daña a él.', { rebote: 1 / 4 });

/** Cómo se ve: la forma del cuerpo, los colores y sus rasgos (los arma bestiasModelo). */
export interface Forma {
  cuerpo: 'cuadrupedo' | 'bipedo' | 'ave' | 'oruga' | 'capullo' | 'mariposa' | 'marino' | 'flotante' | 'serpiente' | 'rana';
  alto: number; color: string; panza: string; acento: string; ojos: 'tiernos' | 'feroces' | 'serenos';
  rasgos: string[];
}
export interface Especie {
  n: number; nombre: string; tipos: Tipo[];
  base: { ps: number } & Record<Stat, number>;
  ataques: string[]; etapa: 1 | 2 | 3; evoluciona?: number; legendaria?: boolean;
  descripcion: string; forma: Forma;
}

const e = (n: number, nombre: string, tipos: Tipo[], b: [number, number, number, number, number, number], ataques: string[], etapa: 1 | 2 | 3, evoluciona: number | undefined, descripcion: string, forma: Forma, legendaria = false): Especie =>
  ({ n, nombre, tipos, base: { ps: b[0], at: b[1], def: b[2], ate: b[3], dfe: b[4], vel: b[5] }, ataques, etapa, evoluciona, descripcion, forma, legendaria });
const f = (cuerpo: Forma['cuerpo'], alto: number, color: string, panza: string, acento: string, ojos: Forma['ojos'], rasgos: string[]): Forma => ({ cuerpo, alto, color, panza, acento, ojos, rasgos });

export const ESPECIES: Especie[] = [
  e(1, 'Brasalín', ['fuego'], [39, 52, 43, 60, 50, 65], ['ascuas', 'aranazo', 'grunido', 'ruedaFuego'], 1, 2, 'Salamandra cría. Las brasas de su lomo brillan más fuerte cuando está contenta.', f('cuadrupedo', 0.75, '#f08a3a', '#ffd28a', '#ffd23c', 'tiernos', ['hocico-largo', 'llamas-lomo', 'cola-larga', 'mejillas'])),
  e(2, 'Brasaurio', ['fuego'], [58, 64, 58, 80, 65, 80], ['lanzallamas', 'ruedaFuego', 'garraDragon', 'danzaEspada'], 2, 3, 'Camina erguido y su cola arde como una antorcha. Es orgulloso y no se rinde nunca.', f('bipedo', 1.15, '#e0602a', '#ffc070', '#ffd23c', 'feroces', ['hocico-largo', 'llamas-lomo', 'cola-llama', 'cresta', 'garras'])),
  e(3, 'Volcadrac', ['fuego', 'dragon'], [78, 84, 78, 109, 85, 100], ['lanzallamas', 'pulsoDragon', 'tierraViva', 'respiro'], 3, undefined, 'Sus alas de brasa sueltan chispas al volar. Su llama alcanza para derretir rocas.', f('bipedo', 1.75, '#c8442a', '#ffb060', '#ffd23c', 'feroces', ['hocico-largo', 'alas-membrana', 'cuernos', 'cola-llama', 'llamas-lomo', 'garras'])),
  e(4, 'Conchín', ['agua'], [44, 48, 65, 50, 64, 43], ['pistolaAgua', 'placaje', 'refugio', 'mordisco'], 1, 5, 'Tortuguita de río. Cuando se asusta se mete en su concha y lanza chorros de agua.', f('cuadrupedo', 0.7, '#7ac8e8', '#f5e6b0', '#e8a07a', 'tiernos', ['caparazon', 'cola-corta'])),
  e(5, 'Caprazul', ['agua'], [59, 63, 80, 65, 80, 58], ['hidropulso', 'mordisco', 'refugio', 'acuaJet'], 2, 6, 'Sus orejas con forma de aleta le ayudan a nadar rapidísimo. Le encanta jugar en las olas.', f('bipedo', 1.1, '#4aa0d8', '#f5e6b0', '#c87a4a', 'feroces', ['caparazon', 'orejas-aleta', 'cola-aleta'])),
  e(6, 'Tortonante', ['agua'], [79, 83, 100, 85, 105, 78], ['surf', 'hidrocanon', 'rayoHielo', 'refugio'], 3, undefined, 'Los cañones de su caparazón disparan agua con fuerza para partir acero.', f('bipedo', 1.65, '#3a78c0', '#f0dca0', '#8a5a3a', 'feroces', ['caparazon', 'canones', 'orejas-aleta'])),
  e(7, 'Brotín', ['planta'], [45, 49, 49, 65, 65, 45], ['latigoCepa', 'placaje', 'somnifero', 'desarrollo'], 1, 8, 'Cervatillo del bosque. El brote de su frente se abre cuando toma sol.', f('cuadrupedo', 0.8, '#8ac860', '#f0e8c0', '#ffe070', 'tiernos', ['hocico-fino', 'patas-largas', 'brote', 'orejas-largas', 'manchas'])),
  e(8, 'Ramaciervo', ['planta'], [60, 62, 63, 80, 80, 60], ['hojaAfilada', 'absorcionMayor', 'somnifero', 'desarrollo'], 2, 9, 'Sus astas son ramas vivas. Cuida a los árboles jóvenes del bosque.', f('cuadrupedo', 1.2, '#6aa848', '#efe4b8', '#7a5a3a', 'serenos', ['hocico-fino', 'patas-largas', 'astas', 'orejas-largas', 'hojas-cuello', 'manchas'])),
  e(9, 'Florastado', ['planta', 'psiquico'], [80, 82, 83, 100, 100, 80], ['esferaFloral', 'psiquico', 'somnifero', 'pazMental'], 3, undefined, 'Guardián del bosque. Las flores de sus astas leen las emociones de quien se acerca.', f('cuadrupedo', 1.65, '#4f9a5a', '#efe4b8', '#ff9ad0', 'serenos', ['hocico-fino', 'patas-largas', 'astas-flor', 'hojas-cuello', 'orbe', 'orejas-largas'])),
  e(10, 'Chispardilla', ['electrico'], [40, 50, 40, 60, 50, 90], ['impactrueno', 'ataqueRapido', 'ondaTrueno', 'chispa'], 1, 11, 'Ardilla eléctrica. Guarda electricidad en su cola esponjosa y la suelta por las antenas.', f('bipedo', 0.7, '#f7d02c', '#fff2b0', '#4a5aa8', 'tiernos', ['hocico', 'orejas-puntas', 'cola-esponjosa', 'membrana'])),
  e(11, 'Voltardilla', ['electrico', 'volador'], [65, 75, 60, 95, 75, 125], ['rayo', 'vendaval', 'ondaTrueno', 'ataqueRapido'], 2, undefined, 'Planea entre las nubes de tormenta y se recarga con los relámpagos.', f('bipedo', 1.1, '#f0c020', '#fff2b0', '#4a5aa8', 'feroces', ['hocico', 'orejas-puntas', 'cola-esponjosa', 'membrana'])),
  e(12, 'Pío', ['normal', 'volador'], [40, 45, 40, 35, 35, 56], ['picotazo', 'tornado', 'ataqueRapido', 'malicioso'], 1, 13, 'Pajarito de plaza. Siempre anda en bandada y pía al amanecer.', f('ave', 0.62, '#c8915a', '#f5e0c0', '#f0a030', 'tiernos', ['pico', 'alas-plumas'])),
  e(13, 'Gorrazo', ['normal', 'volador'], [63, 60, 55, 50, 50, 71], ['ataqueAla', 'ataqueRapido', 'malicioso', 'respiro'], 2, 14, 'Defiende su territorio con picotazos. Su cresta se eriza cuando se enoja.', f('ave', 0.95, '#b07840', '#f0dcc0', '#f0a030', 'feroces', ['pico', 'alas-plumas', 'cresta'])),
  e(14, 'Halconcio', ['normal', 'volador'], [83, 95, 75, 60, 70, 101], ['aveBrava', 'golpeCuerpo', 'ataqueRapido', 'respiro'], 3, undefined, 'Rey del cielo. Ve a su presa desde lo alto y cae en picada a toda velocidad.', f('ave', 1.45, '#6a4428', '#f4efe4', '#d9a020', 'feroces', ['cabeza-clara', 'pico-gancho', 'alas-plumas', 'cola-plumas'])),
  e(15, 'Orugita', ['bicho'], [45, 30, 35, 20, 20, 45], ['placaje', 'hiloPegajoso', 'picadura', 'proteccion'], 1, 16, 'Oruga glotona. Come el triple de su peso en hojas cada día.', f('oruga', 0.62, '#a6c83a', '#f0f0a0', '#ffd23c', 'tiernos', ['antenas', 'manchas'])),
  e(16, 'Capullón', ['bicho'], [50, 20, 55, 25, 25, 30], ['fortaleza', 'picadura', 'hiloPegajoso', 'placaje'], 2, 17, 'Se queda quieto dentro de su capullo duro mientras se prepara para cambiar.', f('capullo', 0.8, '#c8b048', '#e8d890', '#8a7a30', 'serenos', [])),
  e(17, 'Vitralis', ['bicho', 'psiquico'], [60, 45, 50, 90, 80, 70], ['zumbido', 'psiquico', 'somnifero', 'danzaAleteo'], 3, undefined, 'Sus alas son transparentes como vitral. El polvo que sueltan hace dormir.', f('mariposa', 1.0, '#8a6ad0', '#c8b8f0', '#a0f0ff', 'tiernos', ['antenas', 'alas-cristal'])),
  e(18, 'Armadito', ['tierra'], [50, 75, 85, 20, 30, 40], ['aranazo', 'disparoLodo', 'fortaleza', 'lanzarrocas'], 1, 19, 'Vive en zonas secas. Se hace bolita para protegerse y rodar.', f('cuadrupedo', 0.75, '#d8b060', '#f5e0b0', '#a07a40', 'tiernos', ['hocico-fino', 'placas', 'orejas-puntas', 'garras'])),
  e(19, 'Rodamuro', ['tierra', 'roca'], [75, 100, 110, 45, 55, 65], ['terremoto', 'rocaAfilada', 'avalancha', 'pulimento'], 2, undefined, 'Sus placas son duras como roca. Al rodar abre túneles en la montaña.', f('cuadrupedo', 1.25, '#a88a50', '#e0c890', '#7a7a84', 'feroces', ['hocico-fino', 'placas', 'espinas-lomo', 'orejas-puntas', 'garras'])),
  e(20, 'Focanieve', ['hielo', 'agua'], [65, 45, 55, 45, 70, 45], ['polvoNieve', 'hidropulso', 'grunido', 'placaje'], 1, 21, 'Foca bebé de los mares fríos. Le encanta deslizarse de panza por el hielo.', f('marino', 0.75, '#d8f0ff', '#ffffff', '#7ab8e0', 'tiernos', ['bigotes', 'aletas'])),
  e(21, 'Morsaglaciar', ['hielo', 'agua'], [90, 70, 80, 95, 95, 70], ['rayoHielo', 'surf', 'canoHelado', 'proteccion'], 2, undefined, 'Sus colmillos de hielo rompen icebergs. Protege a las focas de su colonia.', f('marino', 1.4, '#a8d0e8', '#eef8ff', '#ffffff', 'serenos', ['bigotes', 'colmillos', 'aletas', 'espinas-hielo'])),
  e(22, 'Mentezorro', ['psiquico'], [40, 35, 30, 105, 55, 90], ['confusion', 'ataqueRapido', 'hipnosis', 'agilidad'], 1, 23, 'Zorrito que duerme casi todo el día, pero sueña con los pensamientos de los demás.', f('cuadrupedo', 0.75, '#f0b04a', '#fff0d0', '#f95587', 'serenos', ['hocico-fino', 'patas-largas', 'orejas-zorro', 'cola-esponjosa'])),
  e(23, 'Orbizorro', ['psiquico'], [60, 55, 60, 125, 95, 110], ['psiquico', 'bolaSombra', 'pazMental', 'recuperacion'], 2, undefined, 'Flota sin tocar el suelo. El orbe de su frente puede mover objetos con la mente.', f('cuadrupedo', 1.25, '#e0904a', '#fff0d0', '#f95587', 'serenos', ['hocico-fino', 'patas-largas', 'orejas-zorro', 'cola-esponjosa', 'orbe', 'flota'])),
  e(24, 'Mapachín', ['normal'], [85, 85, 70, 55, 65, 90], ['golpeCuerpo', 'demolicion', 'mordisco', 'danzaEspada'], 1, undefined, 'Pícaro y comilón. Lava todo lo que encuentra antes de comérselo.', f('bipedo', 0.95, '#8a8a90', '#e8e8e8', '#3a3a44', 'tiernos', ['hocico', 'orejas-redondas', 'mascara', 'cola-anillos'])),
  e(25, 'Ranoxa', ['veneno'], [55, 50, 45, 60, 45, 65], ['acido', 'puyaNociva', 'toxico', 'ataqueRapido'], 1, 26, 'Rana de colores vivos: sus manchas avisan que es venenosa.', f('rana', 0.6, '#b04ab0', '#f0c0f0', '#ffd23c', 'tiernos', ['manchas'])),
  e(26, 'Toxirana', ['veneno', 'agua'], [80, 70, 70, 95, 80, 80], ['bombaLodo', 'surf', 'toxico', 'proteccion'], 2, undefined, 'Infla la bolsa de su garganta para croar y lanzar chorros de lodo tóxico.', f('rana', 1.2, '#7a2a9a', '#e8b0f0', '#3ac0c0', 'feroces', ['manchas', 'bolsa-garganta', 'espinas-lomo'])),
  e(27, 'Puñomono', ['lucha'], [50, 80, 40, 35, 45, 70], ['golpeKarate', 'punoVeloz', 'malicioso', 'corpulencia'], 1, 28, 'Monito boxeador. Entrena todo el día golpeando troncos.', f('bipedo', 0.8, '#c88a5a', '#f5d8b0', '#d9443a', 'feroces', ['cara-mono', 'hocico', 'orejas-lado', 'guantes', 'cola-larga'])),
  e(28, 'Gorilazo', ['lucha'], [90, 125, 90, 50, 75, 65], ['aQuemarropa', 'demolicion', 'avalancha', 'corpulencia'], 2, undefined, 'Sus puños pueden partir un peñasco. Es tranquilo hasta que alguien lo desafía.', f('bipedo', 1.65, '#5a4a4a', '#9a8a80', '#d9443a', 'feroces', ['cara-mono', 'hocico', 'ceja', 'brazos-fuertes', 'orejas-lado', 'guantes', 'cinturon'])),
  e(29, 'Farolín', ['fantasma', 'fuego'], [60, 40, 75, 100, 95, 80], ['bolaSombra', 'lanzallamas', 'fuegoFatuo', 'rayoConfuso'], 1, undefined, 'Espíritu amable que guía a los viajeros perdidos con la luz de su farol.', f('flotante', 0.85, '#9a86c8', '#dcd2f2', '#ffb03c', 'tiernos', ['llama-farol', 'farol', 'ojos-brillo'])),
  e(30, 'Nubradón', ['dragon', 'volador'], [100, 110, 90, 120, 100, 90], ['cometaDragon', 'vendaval', 'lanzallamas', 'respiro'], 1, undefined, 'Legendario. Duerme sobre las nubes y su rugido trae tormentas de verano.', f('serpiente', 2.2, '#6f55d8', '#e8e8ff', '#ffffff', 'feroces', ['hocico-largo', 'cuernos', 'melena', 'nubes', 'bigotes-dragon']), true),
];
export const especie = (n: number) => ESPECIES[n - 1];

/** Las que se pueden elegir para combatir: las de su última etapa (y las sin evolución), menos la legendaria. */
export const ELEGIBLES = ESPECIES.filter((x) => !x.evoluciona && !x.legendaria).map((x) => x.n);

/** Revisa que los datos sean consistentes: números, ataques existentes, tipos de los ataques y evoluciones. */
export function revisar(): string[] {
  const malos: string[] = [];
  ESPECIES.forEach((x, i) => {
    if (x.n !== i + 1) malos.push(`número de ${x.nombre}`);
    if (x.ataques.length !== 4 || new Set(x.ataques).size !== 4) malos.push(`${x.nombre}: necesita 4 ataques distintos`);
    for (const id of x.ataques) if (!ATAQUES[id]) malos.push(`${x.nombre}: no existe ${id}`);
    // Consistencia: al menos un ataque que daña de cada uno de sus tipos
    for (const t of x.tipos) if (!x.ataques.some((id) => ATAQUES[id]?.tipo === t && ATAQUES[id].cat !== 'estado')) malos.push(`${x.nombre}: sin ataque de tipo ${t}`);
    if (!x.ataques.some((id) => ATAQUES[id]?.cat !== 'estado')) malos.push(`${x.nombre}: sin ataques que dañen`);
    if (x.evoluciona && especie(x.evoluciona)?.etapa !== x.etapa + 1) malos.push(`${x.nombre}: evolución mal encadenada`);
    const total = Object.values(x.base).reduce((s, v) => s + v, 0);
    if (total < 190 || total > 620) malos.push(`${x.nombre}: total ${total}`);
  });
  if (ESPECIES.length !== 30) malos.push(`son ${ESPECIES.length} criaturas`);
  for (const t of Object.keys(TIPOS) as Tipo[]) if (!Object.values(ATAQUES).some((x) => x.tipo === t && x.cat !== 'estado')) malos.push(`tipo ${t} sin ataques`);
  if (eficacia('electrico', ['agua', 'volador']) !== 4 || eficacia('tierra', ['volador']) !== 0 || eficacia('fuego', ['agua', 'dragon']) !== 0.25) malos.push('tabla de eficacia');
  return malos;
}
