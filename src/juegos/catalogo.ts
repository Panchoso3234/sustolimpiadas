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
  cocos: 2200, cangrejos: 1500, tambores: 16000, semaforo: 1000, parejas: 1000, buscaconchas: 1000, luces: 1170,
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
  j(1, 'puente', 'Puente Colgante', 'A', 'Tablones que se caen un segundo después de pisarlos.', 'Ritmo y decisión'),
  j(2, 'rodillos', 'Rodillos del Volcán', 'A', 'Barras giratorias que te barren: saltar o agacharse.', 'Sincronía'),
  j(3, 'puertas', 'Puertas Falsas', 'A', 'Filas de puertas: unas se abren, otras son pared.', 'Memoria y arrojo'),
  j(4, 'lava', 'Sube la Lava', 'A', 'Escalar plataformas mientras la lava sube.', 'Ruta y sangre fría'),
  j(5, 'huevo', 'Caza del Huevo', 'B', 'Huevos al centro; cada equipo los lleva a su nido. Se pueden robar del nido ajeno.', 'Reparto de roles'),
  j(6, 'sumo', 'Sumo de Balsas', 'B', 'Empujar a los demás fuera de una balsa que se achica.', 'Posición'),
  j(7, 'futbol', 'Fútbol de Cocos', 'B', 'Dos equipos, un coco gigante, dos arcos.', 'Coordinación'),
  j(8, 'faro', 'Rey del Faro', 'B', 'Sumas mientras estés dentro de la zona iluminada, que se mueve.', 'Aguante'),
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
  j(15, 'tambores', 'Tambores de la Isla', 'D', 'Golpea cada tambor justo cuando la marca llega a él.', 'Oído',
    'Teclas D, F, J y K, o toca los tambores. Mientras más exacto el golpe, más puntos. Sube el volumen: el ritmo se escucha.'),
  j(16, 'semaforo', 'Semáforo Tiki', 'D', 'Toca apenas el tiki grande abra los ojos en verde. Hay señales falsas.', 'Autocontrol',
    'Toca la pantalla o aprieta Espacio solo cuando el tiki del centro se ponga verde. Los otros colores y los tikis chicos son trampa: si tocas antes, pierdes la ronda. Son 10 rondas.'),
  j(17, 'parejas', 'Parejas del Arrecife', 'E', 'Memoria de 10 parejas, con cartas que cambian de lugar cuando fallas mucho.', 'Memoria',
    'Da vuelta dos cartas: si son iguales, se quedan. Cada cuatro fallos, dos cartas boca abajo intercambian su lugar (verás cuáles). Menos tiempo y menos fallos, más puntos.'),
  j(18, 'buscaconchas', 'Buscaconchas', 'E', 'Despeja la arena sin pisar ninguno de los 12 erizos.', 'Deducción',
    'Cada número dice cuántos erizos hay alrededor. Clic para destapar; clic derecho, o el botón Banderín, para marcar un erizo. Pisar un erizo termina la partida.'),
  j(19, 'luces', 'Luces del Faro', 'E', 'Tres tableros: apaga todas las luces. Cada toque cambia también las vecinas.', 'Lógica',
    'Toca una luz y cambian ella y sus cuatro vecinas. Apaga el tablero completo para pasar al siguiente. Tienes tres minutos para los tres.'),
  j(20, 'cartero', 'Ruta del Cartero', 'E', 'Reparte en las ocho casas y vuelve al correo por el camino más corto.', 'Optimización',
    'Toca las casas en el orden en que quieres visitarlas; el recorrido se dibuja solo. Puedes deshacer. Al entregar se compara tu ruta con la mejor posible.'),
  j(21, 'cofre', 'El Cofre o la Ola', 'F', 'Diez cofres: sigue sacando tesoro o plántate antes de que llegue la ola.', 'Manejo del riesgo',
    'En cada cofre eliges: Sacar más (suma monedas, pero sube el riesgo) o Plantarte (guardas lo sacado). Si llega la ola, pierdes lo de ese cofre.'),
  j(22, 'bajo', 'El Más Bajo', 'F', 'Todos eligen un número en secreto; gana el más bajo que nadie repitió.', 'Leer al grupo', '', { soloVivo: true }),
  j(23, 'subasta', 'Subasta a Ciegas', 'F', 'Pujar en secreto por cofres de valor oculto.', 'No sobrepagar', '', { soloVivo: true }),
  j(24, 'palabra', 'Palabra del Día', 'F', 'Adivina la palabra de 5 letras en 6 intentos.', 'Descarte',
    'Escribe una palabra de 5 letras y aprieta Enter. Verde: letra en su lugar. Amarillo: está, pero en otro lugar. Gris: no está.'),
];

export const juegoPorId = (id: string) => JUEGOS.find((x) => x.id === id);

/** Tipos de enfrentamiento. Con `base`, se juega en diferido sobre ese juego individual; sin `base`, necesita juego en vivo. */
export interface TipoVersus { id: string; modo: '1v1' | '3v3'; nombre: string; idea: string; base?: string }

const v = (modo: '1v1' | '3v3', id: string, nombre: string, idea: string, base?: string): TipoVersus => ({ id, modo, nombre, idea, base });

export const VERSUS: TipoVersus[] = [
  v('1v1', 'duelo-tiki', 'Duelo Tiki', 'Las mismas diez señales para los dos: gana quien reacciona mejor sin caer en las trampas.', 'semaforo'),
  v('1v1', 'cangrejos-dos', 'Cangrejos a Dos Manos', 'El mismo tablero de cangrejos y tortugas; gana quien caza más.', 'cangrejos'),
  v('1v1', 'pulso', 'Pulso de Tambores', 'La misma canción para ambos; gana el más exacto.', 'tambores'),
  v('1v1', 'duelo-cocos', 'Duelo de Cocos', 'La misma lluvia de cocos y cangrejos para los dos.', 'cocos'),
  v('1v1', 'parejas-duelo', 'Parejas cara a cara', 'El mismo mazo: gana quien lo limpia más rápido y con menos fallos.', 'parejas'),
  v('1v1', 'bolos-duelo', 'Bolos cara a cara', 'La misma pista inclinada; gana quien bota más.', 'bolos'),
  v('1v1', 'totem-duelo', 'Tiro al Tótem por turnos', 'Los mismos vientos para los dos arqueros.', 'totem'),
  v('1v1', 'cofre-duelo', 'El Cofre o la Ola en duelo', 'Las mismas olas escondidas: gana quien se planta mejor.', 'cofre'),
  v('1v1', 'cartero-duelo', 'Carteros rivales', 'El mismo pueblo; gana la ruta más corta.', 'cartero'),
  v('1v1', 'golf-duelo', 'Minigolf mano a mano', 'Los mismos seis hoyos; gana quien usa menos golpes.', 'minigolf'),
  v('1v1', 'conchas-linea', 'Cuatro Conchas en Línea', 'Por turnos, el primero en alinear cuatro.'),
  v('1v1', 'balsas', 'Batalla de Balsas', 'Batalla naval: esconde tus balsas y hunde las del rival.'),
  v('1v1', 'sumo-1v1', 'Sumo de Balsas 1v1', 'Empuja a tu rival fuera de la balsa.'),
  v('1v1', 'carrera', 'Carrera cara a cara', 'El mismo circuito de obstáculos, al mismo tiempo.'),
  v('3v3', 'cocos-equipo', 'Cosecha en Equipo', 'Cada integrante atrapa cocos; se suman los tres.', 'cocos'),
  v('3v3', 'coro', 'Tambores en Coro', 'La misma canción para los seis; suma el equipo completo.', 'tambores'),
  v('3v3', 'caceria', 'Cacería de Cangrejos', 'Cada integrante limpia el mismo tablero; suma el equipo.', 'cangrejos'),
  v('3v3', 'tikis-cadena', 'Tikis en Cadena', 'Los reflejos de los tres, sumados.', 'semaforo'),
  v('3v3', 'arqueros', 'Arqueros del Tótem', 'Treinta flechas por equipo con los mismos vientos.', 'totem'),
  v('3v3', 'bolos-equipo', 'Torneo de Bolos', 'Cada integrante juega sus cinco turnos; suma el equipo.', 'bolos'),
  v('3v3', 'asedio', 'Asedio de Sandías', 'Los tres disparan a las mismas torres; suman las cajas botadas.', 'catapulta'),
  v('3v3', 'fareros', 'Fareros', 'Los tres apagan los mismos tableros de luces.', 'luces'),
  v('3v3', 'conchas-equipo', 'Buscaconchas en Equipo', 'El mismo campo de erizos para todos; suma el equipo.', 'buscaconchas'),
  v('3v3', 'tesoro', 'Tesoro Compartido', 'Las mismas olas para los seis: suma lo que guardó cada equipo.', 'cofre'),
  v('3v3', 'huevo', 'Caza del Huevo', 'Huevos al centro; cada equipo los lleva a su nido y roba del ajeno.'),
  v('3v3', 'futbol', 'Fútbol de Cocos', 'Un coco gigante y dos arcos.'),
  v('3v3', 'faro', 'Rey del Faro', 'Suma el equipo que más tiempo pasa en la zona iluminada.'),
  v('3v3', 'sumo-equipos', 'Sumo de Balsas por equipos', 'Tres contra tres en una balsa que se achica.'),
  v('3v3', 'bandera', 'Captura la Bandera', 'Robar la bandera rival y traerla a la base.'),
];

/** Nombre con que se muestra un enfrentamiento: el del tipo de versus si existe, o el del juego. */
export function nombreVersus(modo: string, juego: string): string {
  return VERSUS.find((t) => t.modo === modo && t.base === juego)?.nombre ?? juegoPorId(juego)?.nombre ?? juego;
}
