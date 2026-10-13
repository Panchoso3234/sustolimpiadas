// Los juegos del portal. Un juego está `listo` cuando su motor lo tiene construido (tiene instrucciones de cómo se juega).
export type Motor = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface Juego {
  id: string;
  numero: number;
  nombre: string;
  motor: Motor;
  idea: string;
  premia: string;
  /** Cómo se juega, en una o dos frases, para la pantalla previa. */
  controles: string;
  /** Con qué palabra se lee el puntaje ("puntos", "segundos"…). */
  unidad: string;
  listo: boolean;
  soloVivo?: boolean;
}

/** Puntaje que nadie debería superar jugando limpio: sobre esto, la marca se muestra como dudosa al organizador. */
export const TOPES: Record<string, number> = {
  puente: 2000, rodillos: 2000, puertas: 2000, lava: 2000, huevo: 3000, sumo: 1600, futbol: 3000, faro: 1800, bajo: 1000, subasta: 2500, cocos: 2600, cangrejos: 1700, numeros: 1300, tinta: 1700, eco: 2100, calculo: 1800, parejas: 1000, buscaconchas: 1000, luces: 1170,
  cartero: 1000, cofre: 900, palabra: 1000, totem: 1000, catapulta: 1400, bolos: 750, minigolf: 1000,
};

export const MOTORES: Record<Motor, { nombre: string; color: string }> = {
  D: { nombre: 'Reflejos y ritmo', color: '#ff9a2e' },
  E: { nombre: 'Tablero y memoria', color: '#6fd6b4' },
  F: { nombre: 'Decisión', color: '#ffe08a' },
  C: { nombre: 'Puntería y lanzamiento', color: '#7fb4ff' },
  A: { nombre: 'Carreras de obstáculos', color: '#ef5565' },
  B: { nombre: 'Arena con física', color: '#c79bff' },
};

/** El orden en que se construyen y se muestran los motores. */
export const ORDEN_MOTORES: Motor[] = ['D', 'E', 'F', 'C', 'A', 'B'];

const j = (numero: number, id: string, nombre: string, motor: Motor, idea: string, premia: string, controles = '', extra: Partial<Juego> = {}): Juego =>
  ({ id, numero, nombre, motor, idea, premia, controles, unidad: 'puntos', listo: controles !== '', ...extra });

export const JUEGOS: Juego[] = [
  j(1, 'puente', 'Puente Colgante', 'A', 'Cruza el río por tablones que ceden medio segundo después de pisarlos.', 'Ritmo y decisión',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Salta con Espacio o el botón Saltar. Entre fila y fila hay un hueco: sin saltar, te caes. Los tablones anchos son puntos de control.'),
  j(2, 'rodillos', 'Rodillos del Volcán', 'A', 'Una pasarela sobre la lava con barras que giran a ras de suelo.', 'Sincronía',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Salta las barras con Espacio o el botón Saltar: si te alcanzan, sales volando. Cada tramo empieza en un punto de control.'),
  j(3, 'puertas', 'Puertas Falsas', 'A', 'Seis muros de cuatro puertas: una o dos se abren, las demás son pared.', 'Memoria y arrojo',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Corre contra una puerta para probarla. Las puertas son las mismas durante todo el día: recuerda cuáles abrían.'),
  j(4, 'lava', 'Sube la Lava', 'A', 'Trepa de plataforma en plataforma mientras la lava sube cada vez más rápido.', 'Ruta y sangre fría',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Salta con Espacio o el botón Saltar. Si la lava te toca, se acaba: cuenta hasta dónde llegaste.'),
  j(5, 'huevo', 'Caza del Huevo', 'B', 'Tres contra tres: lleva huevos del centro a tu nido, roba del nido rival y bota al que lleve uno.', 'Reparto de roles',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Pasa sobre un huevo para tomarlo y llévalo al círculo de tu color. Embiste con Espacio o el botón: si chocas a un rival cargado, lo suelta. A los 40 segundos aparece un huevo dorado que vale 3. Juegas con dos compañeros de máquina.'),
  j(6, 'sumo', 'Sumo de Balsas', 'B', 'Seis sobre una balsa que se achica. Empuja a los demás al agua y no caigas.', 'Posición',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Embiste con Espacio o el botón Embestir (se recarga en un segundo). Suma botar rivales y aguantar; el último en pie se lleva el premio mayor.'),
  j(7, 'futbol', 'Fútbol de Cocos', 'B', 'Tres contra tres con un coco gigante. Tu equipo ataca hacia la derecha.', 'Coordinación',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Empuja el coco con el cuerpo; embiste con Espacio o el botón para pegarle fuerte. Tu aro es el blanco. Dura 90 segundos.'),
  j(8, 'faro', 'Rey del Faro', 'B', 'De noche, la luz del faro recorre la cancha: suma quien se mantiene dentro.', 'Aguante',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Quédate dentro del círculo de luz y saca a los demás embistiendo con Espacio o el botón. Dura un minuto.'),
  j(9, 'totem', 'Tiro al Tótem', 'C', 'Diez flechas a la diana, con un viento que cambia en cada tiro.', 'Cálculo',
    'Mueve la mira con el mouse o el dedo y toca para disparar. El viento empuja la flecha hacia donde apunta la veleta: apunta al lado contrario. La mira nunca se queda quieta.'),
  j(10, 'catapulta', 'Catapulta de Sandías', 'C', 'Cinco sandías para botar las torres de cajas de sus plataformas.', 'Estimación',
    'Arrastra hacia atrás y suelta: mientras más lejos tires, más fuerza. La línea punteada muestra por dónde sale la sandía. Cada caja que cae de su plataforma suma.'),
  j(11, 'bolos', 'Bolos de Coco', 'C', 'Cinco turnos de bolos en la playa, con la arena inclinada.', 'Precisión',
    'Arrastra hacia atrás y suelta para lanzar el coco. La pista está inclinada hacia donde apunta la flecha: compensa. Tienes dos tiros por turno.'),
  j(12, 'minigolf', 'Minigolf del Volcán', 'C', 'Seis hoyos con paredes, rebotes y pozas de lava. El recorrido cambia cada día.', 'Planificación',
    'Arrastra hacia atrás y suelta para golpear la pelota. Caer a la lava cuesta un golpe y vuelves al punto anterior. Menos golpes, más puntos.'),
  j(13, 'cocos', 'Cocos al Vuelo', 'D', 'Atrapa los cocos que caen de las palmeras y esquiva los cangrejos.', 'Reacción sostenida',
    'Mueve a tu personaje con el mouse, el dedo o las flechas. Cada coco seguido vale más; un cangrejo te quita una vida. Dura 60 segundos o hasta quedarte sin vidas.'),
  j(14, 'cangrejos', 'Mata-Cangrejos', 'D', 'Pégale a los cangrejos que asoman, no a las tortugas.', 'Reacción con freno',
    'Toca o haz clic sobre los cangrejos antes de que se escondan. Pegarle a una tortuga resta puntos. Dura 45 segundos.'),
  j(15, 'numeros', 'Cazanúmeros', 'D', 'Veinticinco números revueltos: tócalos del 1 al 25 lo más rápido que puedas.', 'Atención y velocidad',
    'Toca los números en orden, partiendo por el 1. Arriba dice cuál toca. Equivocarse resta puntos. Tienes un minuto.'),
  j(16, 'tinta', 'Tinta Tramposa', 'D', 'La palabra dice un color, pero está pintada de otro. Responde el color de la tinta.', 'Autocontrol',
    'Aprieta el botón (o las teclas 1 a 4) del color con que está PINTADA la palabra, no el que dice. Los aciertos seguidos valen más y cada error resta. Dura 45 segundos.'),
  j(17, 'parejas', 'Parejas del Arrecife', 'E', 'Memoria de 10 parejas, con cartas que cambian de lugar cuando fallas mucho.', 'Memoria',
    'Da vuelta dos cartas: si son iguales, se quedan. Cada cuatro fallos, dos cartas boca abajo intercambian su lugar (verás cuáles). Menos tiempo y menos fallos, más puntos.'),
  j(18, 'buscaconchas', 'Erizos Ocultos', 'E', 'Despeja la arena sin pisar ninguno de los 12 erizos.', 'Deducción',
    'Cada número dice cuántos erizos hay alrededor. Clic para destapar; clic derecho, o el botón Banderín, para marcar un erizo. Pisar un erizo termina la partida.'),
  j(19, 'luces', 'Luces del Faro', 'E', 'Tres tableros: apaga todas las luces. Cada toque cambia también las vecinas.', 'Lógica',
    'Toca una luz y cambian ella y sus cuatro vecinas. Apaga el tablero completo para pasar al siguiente. Tienes tres minutos para los tres.'),
  j(20, 'cartero', 'Ruta del Cartero', 'E', 'Reparte en las ocho casas y vuelve al correo por el camino más corto.', 'Optimización',
    'Toca las casas en el orden en que quieres visitarlas; el recorrido se dibuja solo. Puedes deshacer. Al entregar se compara tu ruta con la mejor posible.'),
  j(21, 'cofre', 'El Cofre o la Ola', 'F', 'Diez cofres: sigue sacando tesoro o plántate antes de que llegue la ola.', 'Manejo del riesgo',
    'En cada cofre eliges: Sacar más (suma monedas, pero sube el riesgo) o Plantarte (guardas lo sacado). Si llega la ola, pierdes lo de ese cofre.'),
  j(22, 'bajo', 'El Más Bajo', 'F', 'Seis jugadores eligen un número en secreto; gana el más bajo que nadie repitió.', 'Leer al grupo',
    'Elige un número del 1 al 10. Ganas la ronda (100 puntos) si es el más bajo que ningún rival eligió; si nadie lo repitió pero no era el más bajo, sumas 20. Son 10 rondas contra cinco rivales de máquina, cada uno con su manía.'),
  j(23, 'subasta', 'Subasta a Ciegas', 'F', 'Ocho cofres de valor oculto y tres rivales pujando contra ti.', 'No sobrepagar',
    'Ves una estimación del valor de cada cofre. Elige cuánto ofrecer y aprieta Pujar; gana quien más ofrece y paga lo ofrecido. Tu puntaje es la ganancia total: el valor real menos lo que pagaste. No pujar también es una jugada.'),
  j(24, 'palabra', 'Palabra del Día', 'F', 'Adivina la palabra de 5 letras en 6 intentos.', 'Descarte',
    'Escribe una palabra de 5 letras y aprieta Enter. Verde: letra en su lugar. Amarillo: está, pero en otro lugar. Gris: no está.'),
  j(25, 'eco', 'Eco del Templo', 'E', 'Cuatro piedras se encienden en secuencia. Repítela; cada ronda suma una más.', 'Memoria de secuencias',
    'Mira el orden en que brillan las piedras y repítelo tocándolas. Cada ronda la secuencia crece y va más rápido. Un error termina la partida.'),
  j(26, 'calculo', 'Mercado Relámpago', 'F', 'Sumas, restas y multiplicaciones contra el reloj, cada vez más difíciles.', 'Cálculo mental',
    'Escribe el resultado con el teclado o los botones y aprieta OK (Enter). Los aciertos seguidos valen más y cada error resta. Tienes un minuto.'),
];

/** Juegos de acertijo fijo: quien ya lo jugó conoce la solución, así que se juegan una sola vez al día. */
export const UNA_VEZ = new Set(['palabra', 'parejas', 'buscaconchas', 'luces', 'cartero', 'cofre', 'bajo', 'subasta']);

export const juegoPorId = (id: string) => JUEGOS.find((x) => x.id === id);

/** Tipos de enfrentamiento. Con `base`, se juega en diferido sobre ese juego individual; sin `base`, necesita juego en vivo. */
export interface TipoVersus { id: string; modo: '1v1' | '3v3'; nombre: string; idea: string; base?: string }

const v = (modo: '1v1' | '3v3', id: string, nombre: string, idea: string, base?: string): TipoVersus => ({ id, modo, nombre, idea, base });

export const VERSUS: TipoVersus[] = [
  v('1v1', 'duelo-tinta', 'Duelo de Tinta', 'Las mismas palabras tramposas para los dos: gana quien acierta más sin caer.', 'tinta'),
  v('1v1', 'cangrejos-dos', 'Cangrejos a Dos Manos', 'El mismo tablero de cangrejos y tortugas; gana quien caza más.', 'cangrejos'),
  v('1v1', 'carrera-numeros', 'Carrera de Números', 'El mismo tablero revuelto; gana quien llega primero al 25.', 'numeros'),
  v('1v1', 'eco-duelo', 'Duelo de Ecos', 'La misma secuencia; gana quien la sigue más lejos.', 'eco'),
  v('1v1', 'mercado-duelo', 'Regateo Relámpago', 'Las mismas cuentas; gana quien resuelve más.', 'calculo'),
  v('1v1', 'duelo-cocos', 'Duelo de Cocos', 'La misma lluvia de cocos y cangrejos para los dos.', 'cocos'),
  v('1v1', 'parejas-duelo', 'Parejas cara a cara', 'El mismo mazo: gana quien lo limpia más rápido y con menos fallos.', 'parejas'),
  v('1v1', 'bolos-duelo', 'Bolos cara a cara', 'La misma pista inclinada; gana quien bota más.', 'bolos'),
  v('1v1', 'totem-duelo', 'Tiro al Tótem por turnos', 'Los mismos vientos para los dos arqueros.', 'totem'),
  v('1v1', 'cofre-duelo', 'El Cofre o la Ola en duelo', 'Las mismas olas escondidas: gana quien se planta mejor.', 'cofre'),
  v('1v1', 'cartero-duelo', 'Carteros rivales', 'El mismo pueblo; gana la ruta más corta.', 'cartero'),
  v('1v1', 'golf-duelo', 'Minigolf mano a mano', 'Los mismos seis hoyos; gana quien usa menos golpes.', 'minigolf'),
  v('1v1', 'conchas-linea', 'Cuatro Conchas en Línea', 'Por turnos, el primero en alinear cuatro.'),
  v('1v1', 'balsas', 'Batalla de Balsas', 'Batalla naval: esconde tus balsas y hunde las del rival.'),
  v('1v1', 'sumo-1v1', 'Sumo de Balsas 1v1', 'Los mismos cinco rivales de máquina para cada uno; gana quien aguanta y bota más.', 'sumo'),
  v('1v1', 'carrera', 'Carrera cara a cara', 'El mismo puente de tablones para los dos; gana quien cruza más rápido.', 'puente'),
  v('1v1', 'lava-duelo', 'Duelo en la Lava', 'La misma escalera sobre la lava; gana quien llega más alto o más rápido.', 'lava'),
  v('1v1', 'subasta-duelo', 'Subasta en duelo', 'Los mismos cofres y postores; gana quien saca más ganancia.', 'subasta'),
  v('3v3', 'cocos-equipo', 'Cosecha en Equipo', 'Cada integrante atrapa cocos; se suman los tres.', 'cocos'),
  v('3v3', 'eco-cadena', 'Eco en Cadena', 'La misma secuencia para los seis; suma hasta dónde llegó cada uno.', 'eco'),
  v('3v3', 'caceria', 'Cacería de Cangrejos', 'Cada integrante limpia el mismo tablero; suma el equipo.', 'cangrejos'),
  v('3v3', 'mercado-equipo', 'Mercado en Equipo', 'Las mismas cuentas para todos; suma el equipo.', 'calculo'),
  v('3v3', 'tinta-equipo', 'Tinta en Equipo', 'Las mismas palabras tramposas; suma el equipo.', 'tinta'),
  v('3v3', 'arqueros', 'Arqueros del Tótem', 'Treinta flechas por equipo con los mismos vientos.', 'totem'),
  v('3v3', 'bolos-equipo', 'Torneo de Bolos', 'Cada integrante juega sus cinco turnos; suma el equipo.', 'bolos'),
  v('3v3', 'asedio', 'Asedio de Sandías', 'Los tres disparan a las mismas torres; suman las cajas botadas.', 'catapulta'),
  v('3v3', 'fareros', 'Fareros', 'Los tres apagan los mismos tableros de luces.', 'luces'),
  v('3v3', 'conchas-equipo', 'Erizos Ocultos en Equipo', 'El mismo campo de erizos para todos; suma el equipo.', 'buscaconchas'),
  v('3v3', 'tesoro', 'Tesoro Compartido', 'Las mismas olas para los seis: suma lo que guardó cada equipo.', 'cofre'),
  v('3v3', 'huevo', 'Caza del Huevo', 'Cada integrante juega su partida contra la máquina; suman los tres.', 'huevo'),
  v('3v3', 'futbol', 'Fútbol de Cocos', 'Cada integrante juega su partido contra la máquina; suman los tres.', 'futbol'),
  v('3v3', 'faro', 'Rey del Faro', 'La misma luz y los mismos rivales para todos; suma el equipo.', 'faro'),
  v('3v3', 'sumo-equipos', 'Sumo de Balsas por equipos', 'Cada integrante sube a la balsa por su cuenta; suma el equipo.', 'sumo'),
  v('3v3', 'relevos', 'Carrera de Relevos', 'Los tres corren los Rodillos del Volcán; suma el equipo.', 'rodillos'),
  v('3v3', 'bandera', 'Captura la Bandera', 'Robar la bandera rival y traerla a la base.'),
];

/** Nombre con que se muestra un enfrentamiento: el del tipo de versus si existe, o el del juego. */
export function nombreVersus(modo: string, juego: string): string {
  return VERSUS.find((t) => t.modo === modo && t.base === juego)?.nombre ?? juegoPorId(juego)?.nombre ?? juego;
}
