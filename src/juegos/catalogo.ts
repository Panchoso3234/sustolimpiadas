// Los juegos del portal. Un juego está `listo` cuando su motor lo tiene construido (tiene instrucciones de cómo se juega).
export type Motor = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

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
  rodillos: 2000, puertas: 2000, huevo: 3400, sumo: 1600, futbol: 3000, faro: 1800, bajo: 1000, torre: 2400, cocos: 2600, cangrejos: 1700, numeros: 1300, tinta: 1700, eco: 2800, parejas: 1000, buscaconchas: 1800, luces: 1800,
  cartero: 1000, cofre: 1300, palabra: 1000, totem: 1000, catapulta: 2800, bolos: 750, minigolf: 1000,
  karts: 2300, tren: 9000, tanques: 7500, bombas: 4200, agujero: 14000, serpientes: 5000, defensa: 6500, museo: 5000, tiro: 9000, cocina: 6000, billar: 8000, triples: 9000, calabazas: 3500, laberinto: 5000, escobas: 4000,
};

export const MOTORES: Record<Motor, { nombre: string; color: string }> = {
  D: { nombre: 'Reflejos y ritmo', color: '#ff9a2e' },
  E: { nombre: 'Tablero y memoria', color: '#6fd6b4' },
  F: { nombre: 'Decisión', color: '#ffe08a' },
  C: { nombre: 'Puntería y lanzamiento', color: '#7fb4ff' },
  A: { nombre: 'Carreras de obstáculos', color: '#ef5565' },
  B: { nombre: 'Arena con física', color: '#c79bff' },
  G: { nombre: 'Arcade y acción', color: '#4fd1ff' },
};

/** El orden en que se construyen y se muestran los motores. */
export const ORDEN_MOTORES: Motor[] = ['G', 'D', 'E', 'F', 'C', 'A', 'B'];

const j = (numero: number, id: string, nombre: string, motor: Motor, idea: string, premia: string, controles = '', extra: Partial<Juego> = {}): Juego =>
  ({ id, numero, nombre, motor, idea, premia, controles, unidad: 'puntos', listo: controles !== '', ...extra });

export const JUEGOS: Juego[] = [
  j(1, 'rodillos', 'Rodillos del Volcán', 'A', 'Una pasarela sobre la lava con barras que giran: unas se saltan y otras se pasan agachado.', 'Sincronía',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Salta las barras rojas con Espacio o el botón Saltar; pasa las naranjas (altas) agachado, manteniendo Shift, C o el botón Agacharse. Si te alcanzan, sales volando. Cada tramo empieza en un punto de control. La figura blanca transparente es el fantasma de ritmo: corre al paso de una buena marca. Con el botón Cámara (o la tecla V) miras desde arriba.'),
  j(2, 'puertas', 'Puertas Falsas', 'A', 'Seis muros de cuatro puertas: una o dos se abren, las demás son pared.', 'Memoria y arrojo',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Corre contra una puerta para probarla. Recuerda cuáles abrían: si te caes, vuelves al último punto de control. La figura blanca transparente es el fantasma de ritmo: corre al paso de una buena marca. Con el botón Cámara (o la tecla V) miras desde arriba.'),
  j(3, 'huevo', 'Caza del Huevo', 'B', 'Tres contra tres: lleva huevos del centro a tu nido, roba del nido rival y bota al que lleve uno.', 'Reparto de roles',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Pasa sobre un huevo para tomarlo y llévalo al círculo de tu color. Embiste con Espacio o el botón: si chocas a un rival cargado, lo suelta. A los 40 y a los 60 segundos aparece un huevo dorado que vale 3. Juegas con dos compañeros de máquina; en cada equipo uno junta huevos, otro caza a quien lleve uno y otro cuida el nido.'),
  j(4, 'sumo', 'Sumo de Balsas', 'B', 'Seis sobre una balsa que se achica. Empuja a los demás al agua y no caigas.', 'Posición',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Embiste con Espacio o el botón Embestir; si lo mantienes apretado, cargas un empujón más fuerte. Cerca del borde la balsa resbala, y el coco dorado te hace más pesado unos segundos. Suma botar rivales y aguantar; el último en pie se lleva el premio mayor.'),
  j(5, 'futbol', 'Fuchibol', 'B', 'Tres contra tres con un coco gigante. Tu equipo ataca hacia la derecha.', 'Coordinación',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Empuja el coco con el cuerpo; embiste con Espacio o el botón para pegarle (mantenlo apretado para un tiro cargado). Con el botón Pasar, o Shift / C, le pasas el coco a tu compañero más adelantado. Tu aro es el blanco. Dura 90 segundos.'),
  j(6, 'faro', 'Rey del Faro', 'B', 'De noche, la luz del faro recorre la cancha: suma quien se mantiene dentro.', 'Aguante',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Quédate dentro del círculo de luz y saca a los demás embistiendo con Espacio o el botón. La luz se achica con el tiempo y, a ratos, parpadea, se apaga y reaparece en otro lado: anticípate. Dura un minuto.'),
  j(7, 'totem', 'Tiro al Tótem', 'C', 'Diez flechas a la diana, con un viento que cambia en cada tiro.', 'Cálculo',
    'Mueve la mira con el mouse o el dedo y toca para disparar. El viento empuja la flecha hacia donde apunta la veleta: apunta al lado contrario. La mira nunca se queda quieta. Desde la flecha 4 el viento también sopla hacia arriba o abajo (↑ ↓), y desde la 5 la diana se mueve.'),
  j(8, 'catapulta', 'Catapulta de Sandías', 'C', 'Cuatro sandías para botar las torres; si las botas todas, viene un segundo nivel con una plataforma que se mueve.', 'Estimación',
    'Arrastra hacia atrás y suelta: mientras más lejos tires, más fuerza. La línea punteada muestra por dónde sale la sandía. Cada caja que cae de su plataforma suma. Si botas todas pasas al nivel 2 (con 3 sandías más); las sandías que te sobren al final dan premio.'),
  j(9, 'bolos', 'Bolos de Coco', 'C', 'Cinco turnos de bolos en una pista larga, con la arena inclinada, rocas y efecto.', 'Precisión',
    'Arrastra hacia atrás y suelta para lanzar el coco. La pista está inclinada hacia donde apunta la flecha: compensa. Con los botones de abajo (o las teclas A y D) le das efecto para que se curve. Desde el tercer turno hay una roca en la pista. Tienes dos tiros por turno.'),
  j(10, 'minigolf', 'Minigolf del Volcán', 'C', 'Seis hoyos al pie de un volcán: muros, pozas de lava, hongos que rebotan, portales y un gólem de piedra que se cruza. El recorrido cambia en cada partida.', 'Planificación',
    'Arrastra hacia atrás y suelta para golpear la pelota. Cada hoyo tiene su par: menos golpes, más puntos. Los hongos devuelven la pelota con fuerza, los portales la teletransportan y caer a la lava cuesta un golpe. El gólem va y viene: calcula cuándo pasar. Con el botón Vista libre (o la tecla V) giras y acercas la cámara para estudiar el hoyo.'),
  j(11, 'cocos', 'Cocos al Vuelo', 'D', 'Atrapa los cocos que caen de las palmeras y esquiva los cangrejos.', 'Reacción sostenida',
    'Mueve a tu personaje con el mouse, el dedo o las flechas. Un aro en la arena avisa dónde cae cada cosa (rojo: cangrejo). Cada coco seguido vale más; la bola azul es un imán y la rosada da una vida. Dura 60 segundos o hasta quedarte sin vidas.'),
  j(12, 'cangrejos', 'Mata-Cangrejos', 'D', 'Pégale a los cangrejos que asoman, no a las tortugas.', 'Reacción con freno',
    'Toca o haz clic sobre los cangrejos antes de que se escondan. Algunos amagan: se esconden un instante y vuelven a salir. Pegarle a una tortuga resta puntos. Dura 45 segundos.'),
  j(13, 'numeros', 'Cazanúmeros', 'D', 'Veinticinco números revueltos: tócalos del 1 al 25 lo más rápido que puedas.', 'Atención y velocidad',
    'Toca los números en orden, partiendo por el 1. Arriba dice cuál toca. Cada tantos aciertos las fichas cambian de lugar. Equivocarse resta puntos. Tienes un minuto.'),
  j(14, 'tinta', 'Tinta Tramposa', 'D', 'La palabra dice un color, pero está pintada de otro. Responde el color de la tinta.', 'Autocontrol',
    'Aprieta el botón (o las teclas 1 a 6) del color con que está PINTADA la palabra, no el que dice. Ojo: a ratos la regla se invierte y vale lo que DICE (te avisa arriba). Después de 10 respuestas entran dos colores más. Dura 45 segundos.'),
  j(15, 'parejas', 'Parejas del Arrecife', 'E', 'Tres tableros de 6, 8 y 10 parejas, con medusas tramposas y cartas que cambian de lugar.', 'Memoria',
    'Da vuelta dos cartas: si son iguales, se quedan. La medusa no tiene pareja: abrirla resta puntos y tapa lo que tenías abierto. Cada cuatro fallos, dos cartas boca abajo intercambian su lugar (verás cuáles). Termina los tres tableros rápido para el bono.'),
  j(16, 'buscaconchas', 'Erizos Ocultos', 'E', 'Bajo la arena hay ×1, ×2, ×3 y erizos. Las pistas de cada fila y columna te dicen dónde cavar.', 'Deducción',
    'Cada fila y columna muestra cuánto suman sus números y cuántos erizos tiene (🦔). Tus monedas de la ronda se multiplican por cada número que destapas. Destapa todos los ×2 y ×3 para ganar la ronda, o Plántate para guardar lo que llevas. Pisar un erizo pierde lo de la ronda. Clic derecho (o el botón) marca una sospecha. Son 5 rondas en 4 minutos.'),
  j(17, 'luces', 'Luces del Faro', 'E', 'Cinco tableros: apaga todas las luces. Cada toque cambia también las vecinas.', 'Lógica',
    'Toca una luz y cambian ella y sus cuatro vecinas. Apaga el tablero completo para pasar al siguiente. Si lo logras con pocos toques (el par aparece arriba) ganas un bono. Tienes cuatro minutos para los cinco.'),
  j(18, 'cartero', 'Ruta del Cartero', 'E', 'Reparte en las nueve casas por las calles y vuelve al correo por el camino más corto. Las urgentes van primero.', 'Optimización',
    'Toca las casas en el orden en que quieres visitarlas; el recorrido va por las calles y se dibuja solo. Las casas con ⏰ deben estar entre tus primeras 4 entregas (cada una atrasada resta 120). Puedes deshacer. Al entregar se compara tu ruta con la mejor posible.'),
  j(19, 'cofre', 'El Cofre o la Ola', 'F', 'Diez cofres: sigue sacando tesoro o plántate antes de que llegue la ola.', 'Manejo del riesgo',
    'En cada cofre eliges: Sacar más (suma monedas, pero sube el riesgo) o Plantarte (guardas lo sacado). Arriba ves cómo está el mar (en tormenta hay más riesgo y paga más) y cuánto podría salir. Tienes dos catalejos que te dicen si la próxima sacada es segura. Si llega la ola, pierdes lo de ese cofre.'),
  j(20, 'bajo', 'El Más Bajo', 'F', 'Seis jugadores eligen un número en secreto; gana el más bajo que nadie repitió.', 'Leer al grupo',
    'Elige un número del 1 al 10. Ganas la ronda (100 puntos) si es el más bajo que ningún rival eligió; si nadie lo repitió pero no era el más bajo, sumas 20. Son 10 rondas contra cinco rivales de máquina, cada uno con su manía; Marea va por el número que más usas y Faro copia tu último número.'),
  j(21, 'torre', 'Torre Tambaleante', 'D', 'Un bloque va y viene sobre la torre: suéltalo justo encima. Lo que sobresale, se corta.', 'Precisión y temple',
    'Toca la pantalla, haz clic o aprieta Espacio para soltar el bloque. Si sobresale, se corta y el siguiente es más chico; si cae justo encima es un perfecto y suma racha. Cada piso va más rápido.'),
  j(22, 'palabra', 'Palabra del Día', 'F', 'Adivina la palabra de 5 letras en 6 intentos.', 'Descarte',
    'Escribe una palabra de 5 letras y aprieta Enter. Verde: letra en su lugar. Amarillo: está, pero en otro lugar. Gris: no está. Si la palabra no está en el diccionario te avisa; con Enter otra vez la usas igual.'),
  j(23, 'eco', 'Eco del Templo', 'E', 'Seis piedras se encienden en secuencia. Repítela; cada ronda suma una más, y algunas van al revés.', 'Memoria de secuencias',
    'Mira el orden en que brillan las piedras y repítelo tocándolas. Desde la ronda 4, una de cada tres se repite al revés (de la última a la primera) y vale el doble. Un error termina la partida.'),
  j(24, 'karts', 'Gran Premio', 'G', 'Carrera en karts contra cinco rivales en cuatro pistas largas: derrapes con mini turbo, cajas de objetos, plátanos y monedas.', 'Manejo y estrategia',
    'Tu kart acelera solo. Dobla con las flechas, A/D, arrastrando el dedo o con un control (palanca o cruceta); frena con la flecha abajo. Mantén Espacio, el botón Derrapar o A/R1 del control mientras doblas para derrapar: la cola patina y, mientras derrapas, la dirección cierra o abre la curva. Al soltar sales con mini turbo (chispas azules: corto; naranjas: más largo; moradas: el más largo). Las cajas de colores te dan un objeto (🔥 turbo o 🍌 plátano) que usas con Shift, C, el botón Objeto o B/L1 del control. Cada moneda sube un poco tu velocidad máxima. Si chocas con la valla rebotas y pierdes velocidad. Puesto, monedas y tiempo dan puntos.'),
  j(25, 'tren', 'Fuga del Tren', 'G', 'Corre por tres vías esquivando trenes, saltando vallas y rodando bajo barras. Súbete a los techos por las rampas.', 'Reflejos y lectura',
    'Corres solo. Cambia de vía con las flechas, A/D o deslizando a los lados. Salta con Espacio, la flecha arriba o deslizando hacia arriba; rueda con Shift, la flecha abajo o deslizando hacia abajo. Las vallas rojas se saltan y las barras naranjas se pasan rodando. Los trenes con rampa se suben y se recorren por el techo; los que tienen luz roja vienen de frente. Las burbujas dan poderes: 🧲 imán, 👟 súper salto, ×2 monedas y 🛡️ escudo. Si rozas un tren de costado, el inspector se acerca: dos veces seguidas y te atrapa.'),
  j(26, 'tanques', 'Tanques de Juguete', 'G', 'Cinco oleadas de tanques enemigos sobre una mesa de juegos: balas que rebotan, cajas que se rompen, minas y un jefe al final.', 'Puntería y estrategia',
    'Mueve tu tanque azul con WASD, las flechas o arrastrando el dedo. Con mouse, apuntas donde está el cursor y disparas con clic; en celular, el botón Disparar apunta solo al enemigo más cercano. Tus balas rebotan una vez y rompen cajas; si dos balas chocan, se anulan. Con Shift, C o el botón Mina dejas una mina que estalla a los 6 s o cuando un enemigo la pisa (¡aléjate!). Tienes 3 vidas y 4 minutos para las 5 oleadas.'),
  j(27, 'bombas', 'Bombas', 'G', 'Tú contra tres rivales en el patio de un castillo: bombas en cruz, cajas que esconden mejoras y un patio que se cierra. Tres rondas.', 'Táctica y nervios',
    'Muévete con las flechas, WASD o arrastrando el dedo. Pon una bomba con Espacio o el botón Bomba: estalla en cruz a los 2 segundos y rompe cajas. ¡Sal de la línea de fuego! Las cajas a veces sueltan mejoras: 💣 más bombas, 🔥 llama más larga, 👟 más velocidad y 🦶 patear bombas (camina contra una). Gana la ronda quien queda en pie; desde el segundo 90 el patio se cierra desde el borde. Son 3 rondas.'),
  j(28, 'agujero', 'Agujero Negro', 'G', 'Eres un agujero en una ciudad: trágate conos, gente, autos y edificios enteros mientras creces. Dos agujeros rivales compiten contigo.', 'Ruta y ambición',
    'Mueve tu agujero (borde amarillo) con las flechas, WASD o arrastrando el dedo. Todo lo que es más chico que tú cae adentro y te hace crecer: empieza por conos, gente y faroles, sigue con autos y termina con edificios. Si eres bastante más grande que un rival, te lo tragas (+300); si él es más grande, te traga a ti y vuelves a la mitad de tu tamaño. Con Espacio o el botón Turbo aceleras un momento (cada 5 s). Tienes 2 minutos.'),
  j(29, 'serpientes', 'Serpientes', 'G', 'Un jardín de noche: come bolitas brillantes, crece y encierra a las otras ocho serpientes sin chocar con nadie.', 'Astucia y reflejos',
    'Tu serpiente sigue al mouse; también puedes usar las flechas o arrastrar el dedo. Come las bolitas para crecer. Mantén Espacio, el clic o el botón Turbo para acelerar (cuesta un poco de largo). Si tu cabeza toca el cuerpo de otra serpiente o el borde, pierdes; si otra choca contra tu cuerpo, se deshace en comida (+200). Una sola vida y 3 minutos: cuentan tu largo máximo y las que elimines; sobrevivir suma 300.'),
  j(30, 'defensa', 'Defensa de la Torre', 'G', 'Babosas de colores bajan por el camino hacia tu castillo: pon torres, mejóralas y aguanta diez oleadas. La última trae al Rey Babosa.', 'Estrategia y cálculo',
    'Elige una torre abajo (o con las teclas 1, 2 y 3) y toca el pasto para ponerla: la Ballesta dispara rápido, el Hielo congela y el Mortero golpea en área. Toca una torre tuya para mejorarla (hasta nivel 3). Las babosas sueltan monedas. Entre oleadas puedes apretar Espacio o ¡Oleada! para adelantar la siguiente y ganar monedas extra. Si llegan 20 babosas al castillo, pierdes.'),
  j(31, 'museo', 'Ladrón del Museo', 'G', 'Tres pisos de un museo de noche: junta el botín, roba el tesoro de cada piso y escapa sin que te vean los guardias, las cámaras ni los láseres.', 'Sigilo y paciencia',
    'Muévete con las flechas, WASD o arrastrando el dedo. Las gemas se toman al pasar; el tesoro abre la puerta verde de escape. Mantén Espacio o el botón Puntillas para caminar sin ruido: si corres cerca de un guardia, viene a mirar. Si un guardia o una cámara te ve, el ojo se llena; si se llena, te atrapan y vuelves al inicio del piso. Los láseres rojos se prenden y se apagan: cruza cuando estén apagados. Escapar de un piso sin que te vean da bono de Fantasma.'),
  j(32, 'tiro', 'Galería de Tiro', 'G', 'Un puesto de feria de noche: patos, dianas y botellas pasan por tres rieles. Seis tiros por carga, multiplicador por racha y bombas que no hay que tocar.', 'Puntería y sangre fría',
    'Apunta con el mouse y dispara con el clic (en celular, toca el blanco). El rifle tiene 6 tiros: recarga con Espacio, R, el clic derecho o el botón Recargar. Patos 10, dianas 15, botellas 20 y el pato dorado 100. Cada cuatro aciertos seguidos sube el multiplicador (hasta x4); fallar lo corta. Las bombas restan 50 y el reloj suma 3 segundos (hasta 6 por ronda). Desde la ronda 2 asoman dianas detrás del mostrador. Al final, bono por puntería.'),
  j(33, 'cocina', 'Cocina Caótica', 'G', 'Llegan pedidos con tiempo límite: toma ingredientes, pícalos, cocina la carne sin quemarla, arma el plato y entrégalo. Cada vez más rápido.', 'Orden bajo presión',
    'Muévete con las flechas, WASD o arrastrando el dedo. Espacio o el botón Tomar/Dejar sirve para todo: tomar de un cajón, dejar en un mesón, juntar en un plato, entregar en la ventanilla verde o botar en la basura. En la tabla, mantén Espacio para picar. La carne picada va a la plancha: se cocina sola y se quema si la dejas mucho. Los pedidos están arriba con su tiempo; si se acaba, pierdes el cliente. Entregar rápido da propina.'),
  j(34, 'billar', 'Billar', 'G', 'Seis desafíos en una mesa de pool con tiros contados: embocarlas todas, en orden, entre postes, la negra al final, el triángulo y bolas de oro.', 'Cálculo y pulso',
    'Arrastra desde cualquier parte de la mesa hacia atrás, como una honda, y suelta para tirar: mientras más arrastras, más fuerte. La línea blanca muestra hacia dónde va la bola blanca. Con el teclado: ← → para apuntar y mantén Espacio para cargar la fuerza. Cada bola vale 100 (las de oro, 300); varias en un tiro dan bono y la blanca adentro resta 50. Superar un desafío da bono por los tiros que te sobraron.'),
  j(35, 'triples', 'Triples', 'G', 'Concurso de triples: cinco estaciones con cinco balones, el último vale doble. Tres rondas de un minuto; en la segunda salen balones de oro y en la final el aro se mueve.', 'Ritmo y precisión',
    'Mantén apretado (clic, Espacio, tocar la pantalla o el botón Lanzar) y el medidor de la derecha sube y baja: suelta cuando esté en la zona verde. Más al centro de la zona, ¡perfecto! El balón normal vale 100, el de rayas (el último de cada carro) 200 y el de oro 300. Encestar sin tocar el aro da +50 y tres canastas seguidas suman bono de racha. En la ronda final el aro se mueve: suelta cuando venga hacia ti.'),
  j(36, 'calabazas', 'Torre de Calabazas', 'C', 'En un cementerio de noche, un gancho va y viene sobre una tabla que se balancea: suelta calabazas, cajas de dulces y tablones y apílalos lo más alto que puedas.', 'Pulso y paciencia',
    'Toca la pantalla, haz clic o aprieta Espacio (o el botón Soltar) para soltar la pieza que cuelga del gancho. Hay calabazas redondas, anchas y altas, cajas de dulces y tablones largos que sirven de puente. La tabla se balancea cada vez más y el gancho se apura. Cuenta la altura que la torre sostiene quieta (100 por metro) y cada pieza que queda arriba (+20). Tres piezas al suelo o 2 minutos y se acaba.'),
  j(37, 'laberinto', 'Laberinto Embrujado', 'G', 'Un laberinto de piedra de noche y tu linterna como única luz: junta las velas, abre la reja y escapa piso tras piso mientras los fantasmas te buscan.', 'Orientación y sangre fría',
    'Muévete con las flechas, WASD o arrastrando el dedo. Pasa sobre las velas para juntarlas (+50); con todas, la reja morada del fondo se abre y pasas al piso siguiente (+300), más grande y con más fantasmas. Tu linterna se gasta: las pilas verdes la recargan. Con Espacio o el botón Linterna lanzas un destello que asusta a los fantasmas cercanos (se ponen azules y huyen): si tocas uno asustado, lo espantas (+100). Si te toca uno normal pierdes una de tus 3 vidas. Tienes 2 minutos y medio.'),
  j(38, 'escobas', 'Carrera de Escobas', 'G', 'Una carrera en escoba de noche por un valle embrujado contra tres brujas: pasa por los aros, junta dulces, esquiva árboles secos y murciélagos y llega primero al castillo.', 'Reflejos y trazada',
    'La escoba vuela sola hacia adelante. Muévete a los lados con las flechas, A/D o arrastrando el dedo, y sube o baja con arriba/abajo, W/S o arrastrando hacia arriba y abajo. Cada aro suma 50 y cada tres aros cargas una calabaza de turbo (hasta 3): úsala con Espacio o el botón Turbo. Los dulces suman 10. Los árboles secos y las bandadas de murciélagos te frenan. Al llegar suman el puesto (600, 400, 250 o 120) y un bono por tiempo.'),
];

/** Juegos que en celular se ven mucho mejor de lado: avisan al partir si el teléfono está parado. */
export const HORIZONTALES = new Set(['catapulta', 'billar', 'karts', 'tiro', 'defensa', 'cocina', 'triples', 'escobas']);

export const juegoPorId = (id: string) => JUEGOS.find((x) => x.id === id);

/** Tipos de enfrentamiento. Con `base`, se juega en diferido sobre ese juego individual; sin `base`, necesita juego en vivo. */
export interface TipoVersus { id: string; modo: '1v1' | '3v3'; nombre: string; idea: string; base?: string; /** Se juega solo en vivo (sala `enf-<id>`). */ vivo?: boolean }

// Los duelos 1v1 de un juego individual se llaman igual que el juego (antes tenían nombre propio y se confundían)
const v = (modo: '1v1' | '3v3', id: string, nombre: string, idea: string, base?: string, vivo = false): TipoVersus =>
  ({ id, modo, nombre: (modo === '1v1' && base && !vivo && juegoPorId(base)?.nombre) || nombre, idea, base, vivo });

export const VERSUS: TipoVersus[] = [
  v('1v1', 'duelo-tinta', 'Duelo de Tinta', 'Las mismas palabras tramposas para los dos: gana quien acierta más sin caer.', 'tinta'),
  v('1v1', 'cangrejos-dos', 'Cangrejos a Dos Manos', 'El mismo tablero de cangrejos y tortugas; gana quien caza más.', 'cangrejos'),
  v('1v1', 'carrera-numeros', 'Carrera de Números', 'El mismo tablero revuelto; gana quien llega primero al 25.', 'numeros'),
  v('1v1', 'eco-duelo', 'Duelo de Ecos', 'La misma secuencia; gana quien la sigue más lejos.', 'eco'),
  v('1v1', 'duelo-cocos', 'Duelo de Cocos', 'La misma lluvia de cocos y cangrejos para los dos.', 'cocos'),
  v('1v1', 'parejas-duelo', 'Parejas cara a cara', 'El mismo mazo: gana quien lo limpia más rápido y con menos fallos.', 'parejas'),
  v('1v1', 'bolos-duelo', 'Bolos cara a cara', 'La misma pista inclinada; gana quien bota más.', 'bolos'),
  v('1v1', 'totem-duelo', 'Tiro al Tótem por turnos', 'Los mismos vientos para los dos arqueros.', 'totem'),
  v('1v1', 'cofre-duelo', 'El Cofre o la Ola en duelo', 'Las mismas olas escondidas: gana quien se planta mejor.', 'cofre'),
  v('1v1', 'cartero-duelo', 'Carteros rivales', 'El mismo pueblo; gana la ruta más corta.', 'cartero'),
  v('1v1', 'golf-duelo', 'Minigolf mano a mano', 'Los mismos seis hoyos; gana quien usa menos golpes.', 'minigolf'),
  v('1v1', 'conchas-linea', 'Cuatro Conchas en Línea', 'Por turnos, el primero en alinear cuatro.', 'conchas', true),
  v('1v1', 'balsas', 'Batalla de Balsas', 'Batalla naval: esconde tus balsas y hunde las del rival.', 'balsas', true),
  v('1v1', 'sumo-1v1', 'Sumo de Balsas 1v1', 'Los mismos cinco rivales de máquina para cada uno; gana quien aguanta y bota más.', 'sumo'),
  v('1v1', 'karts-duelo', 'Duelo de Karts', 'La misma pista y los mismos rivales: gana quien llega mejor.', 'karts'),
  v('1v1', 'tren-duelo', 'Fuga en Paralelo', 'Las mismas vías y los mismos trenes: gana quien llega más lejos.', 'tren'),
  v('1v1', 'tanques-duelo', 'Duelo de Tanques', 'Las mismas cinco oleadas: gana quien hace más puntos.', 'tanques'),
  v('1v1', 'bombas-duelo', 'Duelo de Bombas', 'Los mismos patios y los mismos rivales: gana quien hace más puntos.', 'bombas'),
  v('1v1', 'agujero-duelo', 'Duelo de Agujeros', 'La misma ciudad para los dos: gana quien traga más.', 'agujero'),
  v('1v1', 'defensa-duelo', 'Duelo de Castillos', 'Las mismas oleadas para los dos: gana quien defienda mejor.', 'defensa'),
  v('1v1', 'museo-duelo', 'Ladrones Rivales', 'El mismo museo y los mismos guardias: gana el mejor botín.', 'museo'),
  v('1v1', 'tiro-duelo', 'Duelo de Pistoleros', 'Los mismos blancos para los dos: gana la mejor puntería.', 'tiro'),
  v('1v1', 'cocina-duelo', 'Duelo de Chefs', 'Los mismos pedidos para los dos: gana la cocina con más puntos.', 'cocina'),
  v('1v1', 'billar-duelo', 'Mesa contra Mesa', 'Por turnos, los mismos desafíos: gana quien emboque mejor.', 'billar'),
  v('1v1', 'triples-duelo', 'Duelo de Triples', 'Los mismos carros de balones para los dos: gana quien enceste más.', 'triples'),
  v('1v1', 'serpientes-duelo', 'Duelo de Serpientes', 'El mismo jardín y las mismas rivales: gana la serpiente con más puntos.', 'serpientes'),
  v('1v1', 'calabazas-duelo', 'Duelo de Calabazas', 'Por turnos, las mismas piezas en el mismo orden: gana la torre más alta.', 'calabazas'),
  v('1v1', 'laberinto-duelo', 'Laberinto en Paralelo', 'El mismo laberinto y los mismos fantasmas: gana quien llega más lejos.', 'laberinto'),
  v('1v1', 'escobas-duelo', 'Duelo de Escobas', 'El mismo valle y las mismas brujas: gana quien hace más puntos.', 'escobas'),
  v('1v1', 'torre-duelo', 'Duelo de Torres', 'El mismo ritmo para los dos; gana la torre más alta.', 'torre'),
  v('3v3', 'cocos-equipo', 'Cosecha en Equipo', 'Cada integrante atrapa cocos; se suman los tres.', 'cocos'),
  v('3v3', 'eco-cadena', 'Eco en Cadena', 'La misma secuencia para los seis; suma hasta dónde llegó cada uno.', 'eco'),
  v('3v3', 'caceria', 'Cacería de Cangrejos', 'Cada integrante limpia el mismo tablero; suma el equipo.', 'cangrejos'),
  v('3v3', 'tinta-equipo', 'Tinta en Equipo', 'Las mismas palabras tramposas; suma el equipo.', 'tinta'),
  v('3v3', 'arqueros', 'Arqueros del Tótem', 'Treinta flechas por equipo con los mismos vientos.', 'totem'),
  v('3v3', 'bolos-equipo', 'Torneo de Bolos', 'Cada integrante juega sus cinco turnos; suma el equipo.', 'bolos'),
  v('3v3', 'asedio', 'Asedio de Sandías', 'Los tres disparan a las mismas torres; suman las cajas botadas.', 'catapulta'),
  v('3v3', 'fareros', 'Fareros', 'Los tres apagan los mismos tableros de luces.', 'luces'),
  v('3v3', 'conchas-equipo', 'Erizos Ocultos en Equipo', 'El mismo campo de erizos para todos; suma el equipo.', 'buscaconchas'),
  v('3v3', 'tesoro', 'Tesoro Compartido', 'Las mismas olas para los seis: suma lo que guardó cada equipo.', 'cofre'),
  v('3v3', 'huevo', 'Caza del Huevo', 'Cada integrante juega su partida contra la máquina; suman los tres.', 'huevo'),
  v('3v3', 'futbol', 'Fuchibol', 'Cada integrante juega su partido contra la máquina; suman los tres.', 'futbol'),
  v('3v3', 'faro', 'Rey del Faro', 'La misma luz y los mismos rivales para todos; suma el equipo.', 'faro'),
  v('3v3', 'sumo-equipos', 'Sumo de Balsas por equipos', 'Cada integrante sube a la balsa por su cuenta; suma el equipo.', 'sumo'),
  v('3v3', 'relevos', 'Carrera de Relevos', 'Los tres corren los Rodillos del Volcán; suma el equipo.', 'rodillos'),
  v('3v3', 'karts-equipo', 'Escudería', 'Los tres corren el mismo Gran Premio; suma el equipo.', 'karts'),
  v('3v3', 'tren-equipo', 'Expreso en Equipo', 'Los tres corren las mismas vías; suma el equipo.', 'tren'),
  v('3v3', 'tanques-equipo', 'Batallón', 'Los tres enfrentan las mismas oleadas; suma el equipo.', 'tanques'),
  v('3v3', 'bombas-equipo', 'Escuadrón Bombero', 'Los tres juegan los mismos patios; suma el equipo.', 'bombas'),
  v('3v3', 'agujero-equipo', 'Apetito de Equipo', 'Los tres se tragan la misma ciudad; suma el equipo.', 'agujero'),
  v('3v3', 'defensa-equipo', 'Murallas en Equipo', 'Los tres defienden las mismas oleadas; suma el equipo.', 'defensa'),
  v('3v3', 'museo-equipo', 'Banda de Ladrones', 'Los tres asaltan el mismo museo; suma el equipo.', 'museo'),
  v('3v3', 'tiro-equipo', 'Feria en Equipo', 'Los tres disparan en el mismo puesto; suma el equipo.', 'tiro'),
  v('3v3', 'cocina-equipo', 'Brigada de Cocina', 'Los tres cocinan los mismos pedidos; suma el equipo.', 'cocina'),
  v('3v3', 'billar-equipo', 'Club de Billar', 'Los tres juegan los mismos desafíos; suma el equipo.', 'billar'),
  v('3v3', 'triples-equipo', 'Concurso por Equipos', 'Los tres tiran los mismos carros; suma el equipo.', 'triples'),
  v('3v3', 'serpientes-equipo', 'Nido de Serpientes', 'Los tres juegan el mismo jardín; suma el equipo.', 'serpientes'),
  v('3v3', 'calabazas-equipo', 'Huerto en Equipo', 'Cada integrante levanta su torre de calabazas con las mismas piezas; suman los tres.', 'calabazas'),
  v('3v3', 'laberinto-equipo', 'Cazafantasmas', 'Los tres recorren el mismo laberinto; suma el equipo.', 'laberinto'),
  v('3v3', 'escobas-equipo', 'Aquelarre', 'Los tres vuelan la misma carrera; suma el equipo.', 'escobas'),
  v('3v3', 'torre-equipo', 'Torres en Equipo', 'Cada integrante levanta su torre; suman los tres.', 'torre'),
  v('3v3', 'bandera', 'Captura la Bandera', 'Robar la bandera rival y traerla a la base.'),
];

/** Nombre con que se muestra un enfrentamiento: el del tipo de versus si existe, o el del juego. */
export function nombreVersus(modo: string, juego: string): string {
  return VERSUS.find((t) => t.modo === modo && t.base === juego)?.nombre ?? juegoPorId(juego)?.nombre ?? juego;
}
