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

/** Puntaje de referencia de cada juego para la experiencia del pase (cerca de él, más experiencia). Desde el 26-10 ya no marca partidas como dudosas: todo puntaje cuenta. */
export const TOPES: Record<string, number> = {
  rodillos: 1500, puertas: 1600, huevo: 3400, sumo: 1600, futbol: 3000, faro: 1800, bajo: 1000, torre: 2400, cocos: 2600, cangrejos: 1700, numeros: 1300, tinta: 1700, eco: 2800, parejas: 1000, buscaconchas: 1800, luces: 1800,
  cartero: 4200, cofre: 1300, palabra: 1000, totem: 1000, catapulta: 7000, bolos: 750, minigolf: 1000,
  karts: 2300, tren: 9000, tanques: 16000, bombas: 2500, agujero: 14000, serpientes: 5000, defensa: 10000, museo: 5000, tiro: 9000, cocina: 6000, billar: 8000, triples: 9000, calabazas: 3500, laberinto: 6000, escobas: 4000, conchas: 2400, balsas: 2200, bloques: 120000, bestias: 15000,
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

const TODOS: Juego[] = [
  j(1, 'rodillos', 'Lava Loca', 'A', 'Sube por un volcán que se derrumba, sobre un mar de lava: siete tramos de barras, martillos, rocas, tablones que se hunden e islas.', 'Sincronía',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Salta con Espacio o el botón Saltar: si lo sueltas antes, el salto es más corto. Las barras rojas se saltan; las naranjas (altas) se pasan agachado (Shift, C o el botón Agacharse), y si te agachas corriendo haces una barrida rápida. Si te caes a la lava vuelves al último punto de control: pierdes tiempo y el bono de tramo limpio. Tienes 2 minutos y medio. Suman los tramos superados (más si los pasas sin caerte), las gemas y, al llegar, el tiempo que te sobra. Las grietas de vapor te lanzan alto. Con el botón Cámara (o la tecla V) miras desde arriba.'),
  j(2, 'puertas', 'Puertas Falsas', 'A', 'Doce muros en cuatro secciones: elige una puerta y corre hacia ella. La falsa te devuelve al comienzo de la sección.', 'Memoria y arrojo',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Para probar una puerta hay que correr de frente hacia ella: rozarla de costado no la abre. La buena se abre; la falsa te rebota y te devuelve al comienzo de la sección (cada sección tiene tres muros) con sus puertas cerradas otra vez: recuerda cuáles eran. La marca verde brillante dice "por aquí", pero acierta solo 2 de cada 3 veces. En la última sección las puertas se deslizan. Suman los muros superados (más si los pasas al primer intento), las gemas y el tiempo que sobra. Con el botón Cámara (o la tecla V) miras desde arriba.'),
  j(3, 'huevo', 'Caza del Huevo', 'B', 'Tres contra tres: lleva huevos del centro a tu nido, roba del nido rival y bota al que lleve uno.', 'Reparto de roles',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Pasa sobre un huevo para tomarlo y llévalo al círculo de tu color. Embiste con Espacio o el botón: si chocas a un rival cargado, lo suelta. A los 40 y a los 60 segundos aparece un huevo dorado que vale 3. Juegas con dos compañeros de máquina; en cada equipo uno junta huevos, otro caza a quien lleve uno y otro cuida el nido.'),
  j(4, 'sumo', 'Al Agua Pato', 'B', 'Seis sobre una balsa que se achica. Empuja a los demás al agua y no caigas.', 'Posición',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Embiste con Espacio o el botón Embestir; si lo mantienes apretado, cargas un empujón más fuerte. Cerca del borde la balsa resbala, y el coco dorado te hace más pesado unos segundos. Suma botar rivales y aguantar; el último en pie se lleva el premio mayor.'),
  j(5, 'futbol', 'Fuchibol', 'B', 'Tres contra tres con un coco gigante. Tu equipo ataca hacia la derecha.', 'Coordinación',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Empuja el coco con el cuerpo; embiste con Espacio o el botón para pegarle (mantenlo apretado para un tiro cargado). Con el botón Pasar, o Shift / C, le pasas el coco a tu compañero más adelantado. Tu aro es el blanco. Dura 90 segundos.'),
  j(6, 'faro', 'Rey del Faro', 'B', 'De noche, la luz del faro recorre la cancha: suma quien se mantiene dentro.', 'Aguante',
    'Muévete con las flechas o WASD; en celular, arrastra el dedo. Quédate dentro del círculo de luz y saca a los demás embistiendo con Espacio o el botón. La luz se achica con el tiempo y, a ratos, parpadea, se apaga y reaparece en otro lado: anticípate. Dura un minuto.'),
  j(7, 'totem', 'Tiro al Tótem', 'C', 'Diez flechas a la diana, con un viento que cambia en cada tiro.', 'Cálculo',
    'Mueve la mira con el mouse o el dedo y toca para disparar. El viento empuja la flecha hacia donde apunta la veleta: apunta al lado contrario. La mira nunca se queda quieta. Desde la flecha 4 el viento también sopla hacia arriba o abajo (↑ ↓), y desde la 5 la diana se mueve.'),
  j(8, 'catapulta', 'Angry Birds', 'C', 'Diez niveles con puentes, casas, una pirámide, un búnker y un castillo de madera, piedra y hielo. Revienta las calabazas-monstruo con sandías normales, explosivas y triples; desde el nivel 8 sopla viento.', 'Estimación',
    'Arrastra hacia atrás y suelta: mientras más lejos tires, más fuerza. La línea punteada muestra por dónde sale la sandía. Con la 💥 o la 🔱 en el aire, toca la pantalla (o Espacio) para que estalle o se divida en tres. Calabaza 150, pieza botada 15, nivel limpio 200 y 100 por cada sandía que sobre; desde el 5.º objeto de un mismo tiro hay combo. La piedra pesa, el hielo se quiebra. Si no limpias un nivel, igual pasas al siguiente.'),
  j(9, 'bolos', 'Bolos Playeros', 'C', 'Cinco turnos de bolos en una pista larga, con la arena inclinada, rocas y efecto.', 'Precisión',
    'Arrastra hacia atrás y suelta para lanzar el coco. La pista está inclinada hacia donde apunta la flecha: compensa. Con los botones de abajo (o las teclas A y D) le das efecto para que se curve. Desde el tercer turno hay una roca en la pista. Tienes dos tiros por turno.'),
  j(10, 'minigolf', 'Minigolf', 'C', 'Seis hoyos al pie de un volcán: muros, pozas de lava, hongos que rebotan, portales y un gólem de piedra que se cruza. El recorrido cambia en cada partida.', 'Planificación',
    'Arrastra hacia atrás y suelta para golpear la pelota. Cada hoyo tiene su par: menos golpes, más puntos. Los hongos devuelven la pelota con fuerza, los portales la teletransportan y caer a la lava cuesta un golpe. El gólem va y viene: calcula cuándo pasar. Con el botón Vista libre (o la tecla V) giras y acercas la cámara para estudiar el hoyo.'),
  j(11, 'cocos', '¡Atrápalos si puedes!', 'D', 'Atrapa los cocos que caen de las palmeras y esquiva los cangrejos.', 'Reacción sostenida',
    'Mueve a tu personaje con el mouse, el dedo o las flechas. Un aro en la arena avisa dónde cae cada cosa (rojo: cangrejo). Cada coco seguido vale más; la bola azul es un imán y la rosada da una vida. Dura 60 segundos o hasta quedarte sin vidas.'),
  j(12, 'cangrejos', 'Mata-Cangrejos', 'D', 'Pégale a los cangrejos que asoman, no a las tortugas.', 'Reacción con freno',
    'Toca o haz clic sobre los cangrejos antes de que se escondan. Algunos amagan: se esconden un instante y vuelven a salir. Pegarle a una tortuga resta puntos. Dura 45 segundos.'),
  j(13, 'numeros', 'Cazanúmeros', 'D', 'Veinticinco números revueltos: tócalos del 1 al 25 lo más rápido que puedas.', 'Atención y velocidad',
    'Toca los números en orden, partiendo por el 1. Arriba dice cuál toca. Cada tantos aciertos las fichas cambian de lugar. Equivocarse resta puntos. Tienes un minuto.'),
  j(14, 'tinta', 'Tinta Tramposa', 'D', 'La palabra dice un color, pero está pintada de otro. Responde el color de la tinta.', 'Autocontrol',
    'Aprieta el botón (o las teclas 1 a 6) del color con que está PINTADA la palabra, no el que dice. Ojo: a ratos la regla se invierte y vale lo que DICE (te avisa arriba). Después de 10 respuestas entran dos colores más. Dura 45 segundos.'),
  j(15, 'parejas', 'Memoria de Pez', 'E', 'Tres tableros de 6, 8 y 10 parejas, con medusas tramposas y cartas que cambian de lugar.', 'Memoria',
    'Da vuelta dos cartas: si son iguales, se quedan. La medusa no tiene pareja: abrirla resta puntos y tapa lo que tenías abierto. Cada cuatro fallos, dos cartas boca abajo intercambian su lugar (verás cuáles). Termina los tres tableros rápido para el bono.'),
  j(16, 'buscaconchas', 'Erizos Ocultos', 'E', 'Bajo la arena hay ×1, ×2, ×3 y erizos. Las pistas de cada fila y columna te dicen dónde cavar.', 'Deducción',
    'Cada fila y columna muestra cuánto suman sus números y cuántos erizos tiene (🦔). Tus monedas de la ronda se multiplican por cada número que destapas. Destapa todos los ×2 y ×3 para ganar la ronda, o Plántate para guardar lo que llevas. Pisar un erizo pierde lo de la ronda. Clic derecho (o el botón) marca una sospecha. Son 5 rondas en 4 minutos.'),
  j(17, 'luces', 'Luces del Faro', 'E', 'Cinco tableros: apaga todas las luces. Cada toque cambia también las vecinas.', 'Lógica',
    'Toca una luz y cambian ella y sus cuatro vecinas. Apaga el tablero completo para pasar al siguiente. Si lo logras con pocos toques (el par aparece arriba) ganas un bono. Tienes cuatro minutos para los cinco.'),
  j(18, 'cartero', 'Ruta del Cartero', 'E', 'Cinco repartos seguidos, de 8 a 13 casas: recórrelas por las calles y vuelve al correo por el camino más corto. Las urgentes van primero y algunas casas tienen horario.', 'Optimización',
    'Toca las casas en el orden en que quieres visitarlas; el recorrido va por las calles y se dibuja solo. Las casas con ⏰ deben estar entre tus primeras 4 entregas (cada una atrasada resta 120). Desde el tercer reparto hay casas con horario (🕒5–8: solo reciben entre tu entrega 5 y la 8); fuera de horario también resta 120. Puedes deshacer (o la tecla Z) y entregar con Enter. Son cinco repartos (8, 10, 11, 12 y 13 casas) en 5 minutos. Cada reparto suma por precisión (hasta 500, y baja rápido si te alejas de la mejor ruta), por rapidez (hasta 300: 8 menos por cada segundo que tardes en ese reparto) y +100 si tu ruta es la mejor posible; cada ruta perfecta seguida suma 50 más que la anterior (racha). Si no fue perfecta, se te muestra un momento la mejor ruta.'),
  j(19, 'cofre', 'El Cofre o la Ola', 'F', 'Diez cofres: sigue sacando tesoro o plántate antes de que llegue la ola.', 'Manejo del riesgo',
    'En cada cofre eliges: Sacar más (suma monedas, pero sube el riesgo) o Plantarte (guardas lo sacado). Arriba ves cómo está el mar (en tormenta hay más riesgo y paga más) y cuánto podría salir. Tienes dos catalejos que te dicen si la próxima sacada es segura. Si llega la ola, pierdes lo de ese cofre.'),
  j(20, 'bajo', 'El Más Bajo', 'F', 'Seis jugadores eligen un número en secreto; gana el más bajo que nadie repitió.', 'Leer al grupo',
    'Elige un número del 1 al 10. Ganas la ronda (100 puntos) si es el más bajo que ningún rival eligió; si nadie lo repitió pero no era el más bajo, sumas 20. Son 10 rondas contra cinco rivales de máquina, cada uno con su manía; Marea va por el número que más usas y Faro copia tu último número.'),
  j(21, 'torre', 'Torre Tambaleante', 'D', 'Un bloque va y viene sobre la torre: suéltalo justo encima. Lo que sobresale, se corta.', 'Precisión y temple',
    'Toca la pantalla, haz clic o aprieta Espacio para soltar el bloque. Si sobresale, se corta y el siguiente es más chico; si cae justo encima es un perfecto y suma racha. Cada piso va más rápido.'),
  j(22, 'palabra', 'La Palabra Secreta', 'F', 'Adivina la palabra de 5 letras en 6 intentos.', 'Descarte',
    'Escribe una palabra de 5 letras y aprieta Enter. Verde: letra en su lugar. Amarillo: está, pero en otro lugar. Gris: no está. Si la palabra no está en el diccionario te avisa; con Enter otra vez la usas igual.'),
  j(23, 'eco', 'Eco del Templo', 'E', 'Seis piedras se encienden en secuencia. Repítela; cada ronda suma una más, y algunas van al revés.', 'Memoria de secuencias',
    'Mira el orden en que brillan las piedras y repítelo tocándolas. Desde la ronda 4, una de cada tres se repite al revés (de la última a la primera) y vale el doble. Un error termina la partida.'),
  j(24, 'karts', 'Carreras de Autos', 'G', 'Carrera en karts contra cinco rivales en cuatro pistas largas: derrapes con mini turbo, cajas de objetos, plátanos y monedas.', 'Manejo y estrategia',
    'Tu kart acelera solo. Dobla con las flechas, A/D, arrastrando el dedo o con un control (palanca o cruceta); frena con la flecha abajo. Mantén Espacio, el botón Derrapar o A/R1 del control mientras doblas para derrapar: la cola patina y, mientras derrapas, la dirección cierra o abre la curva. Al soltar sales con mini turbo (chispas azules: corto; naranjas: más largo; moradas: el más largo). Las cajas de colores te dan un objeto (🔥 turbo o 🍌 plátano) que usas con Shift, C, el botón Objeto o B/L1 del control. Cada moneda sube un poco tu velocidad máxima. Si chocas con la valla rebotas y pierdes velocidad. Puesto, monedas y tiempo dan puntos.'),
  j(25, 'tren', 'Subway Surfers', 'G', 'Corre por tres vías esquivando trenes, saltando vallas y rodando bajo barras. Súbete a los techos por las rampas.', 'Reflejos y lectura',
    'Corres solo. Cambia de vía con las flechas, A/D o deslizando a los lados. Salta con Espacio, la flecha arriba o deslizando hacia arriba; rueda con Shift, la flecha abajo o deslizando hacia abajo. Las vallas rojas se saltan y las barras naranjas se pasan rodando. Los trenes con rampa se suben y se recorren por el techo; los que tienen luz roja vienen de frente. Las burbujas dan poderes: 🧲 imán, 👟 súper salto, ×2 monedas, 🛡️ escudo y 🛹 tabla (8 s en que los choques no te detienen). Si rozas un tren de costado, el inspector se acerca: dos veces seguidas y te atrapa. Cada 500 m sin chocar ni rozar sube la racha (hasta ×3 los metros); saltar o rodar justo a tiempo, encadenar techos y las monedas grandes dan bonos. Cada partida trae 3 misiones (arriba a la izquierda) que dan +250 cada una. Desde los 1.500 m aparecen túneles (se pasan rodando) y vallas dobles. Cada 1.000 m cambia el paisaje. En ⚙ (dentro del juego) puedes bajar el temblor, quitar la música y ajustar la sensibilidad del deslizamiento.'),
  j(26, 'tanques', 'Guerra de Tanques', 'G', 'Ocho oleadas de tanques en un cuarto de juguetes: francotiradores que tiran de rebote, minadores, kamikazes, blindados, potenciadores en las cajas y un jefe con escudo giratorio.', 'Puntería y estrategia',
    'Mueve tu tanque azul con WASD, las flechas, la palanca del control o arrastrando el dedo. Con mouse, apuntas donde está el cursor y disparas con clic (la línea muestra el primer rebote); con control, apuntas con la palanca derecha; en celular, el botón Disparar apunta solo al enemigo más cercano. Tus balas rebotan una vez y rompen cajas; si chocan con una enemiga, se anulan. Los enemigos no se dañan entre ellos. Ojo: el Blindado no se daña de frente, el Kamikaze explota al tocarte y el Minador deja minas negras. Las cajas que rompes pueden soltar potenciadores (escudo, bala doble, rebote extra, velocidad, vida o mina gigante). Con Shift, C o el botón Mina dejas una mina que estalla a los 6 s o cuando un enemigo la pisa (¡aléjate! tu bala o tu mina te restan 100). Suman las bajas, las carambolas (bajas de rebote), los combos, cada oleada, la precisión y, si ganas, las vidas y el tiempo. 3 vidas y 5 minutos y medio para las 8 oleadas; ⏩ acelera.'),
  j(27, 'bombas', 'Bomberman', 'G', 'Bomberman de batalla: tú contra tres rivales en tres arenas (clásica, cintas transportadoras y túneles). Bombas en cruz, cajas con mejoras clásicas, la calavera y un patio que se cierra en espiral.', 'Táctica y nervios',
    'Muévete con las flechas, WASD o arrastrando el dedo. Pon una bomba con Espacio o el botón Bomba: estalla en cruz a los 2,6 segundos (el rojo marca lo que va a quemar). Mejoras: 💣 más bombas, 🔥 más fuego, 🌋 fuego máximo, 👟 patines, 🦶 patear (camina contra una bomba) y 🧤 guante (párate sobre tu bomba y apreta Bomba para lanzarla). La 💀 te maldice 12 s y se contagia. Desde el segundo 50 el patio se cierra. Por ronda: 1.º 300, 2.º 150, 3.º 50 (solo si rompiste cajas o eliminaste a alguien), rival 200, caja 10 y mejora 20. Son 3 rondas de 90 s.'),
  j(28, 'agujero', 'Agujero Negro', 'G', 'Eres un agujero en una ciudad: trágate conos, gente, autos y edificios enteros mientras creces. Dos agujeros rivales compiten contigo.', 'Ruta y ambición',
    'Mueve tu agujero (borde amarillo) con las flechas, WASD o arrastrando el dedo. Todo lo que es más chico que tú cae adentro y te hace crecer: empieza por conos, gente y faroles, sigue con autos y termina con edificios. Si eres bastante más grande que un rival, te lo tragas (+300); si él es más grande, te traga a ti y vuelves a la mitad de tu tamaño. Con Espacio o el botón Turbo aceleras un momento (cada 5 s). Tienes 2 minutos.'),
  j(29, 'serpientes', 'Serpientes', 'G', 'Un jardín de noche: come bolitas brillantes, crece y encierra a las otras ocho serpientes sin chocar con nadie.', 'Astucia y reflejos',
    'Tu serpiente va hacia donde apunta el mouse (la flecha blanca muestra el rumbo); también puedes usar las flechas, un control o arrastrar el dedo. Come las bolitas para crecer. Mantén Espacio, el clic, A/R1 del control o el botón Turbo para acelerar (cuesta un poco de largo). Si tu cabeza toca el cuerpo de otra serpiente o el borde (la franja roja avisa), pierdes; cabeza contra cabeza pierde la más chica. Si otra choca contra tu cuerpo, revienta en comida (+200). Una sola vida y 3 minutos: cuentan tu largo máximo y las que elimines; sobrevivir suma 300.'),
  j(30, 'defensa', 'Tower Defense', 'G', 'Babosas de colores (blindadas, con escudo, curanderas y madres que se dividen) bajan hacia tu castillo: combina cuatro torres, mejóralas y aguanta diez oleadas contra el Rey Babosa. Las monedas que no gastes suman al ganar.', 'Estrategia y cálculo',
    'Elige una torre abajo (o con las teclas 1 a 4) y toca el pasto para ponerla: la Ballesta dispara rápido (floja contra blindadas), el Hielo congela, el Mortero golpea en área y rompe blindajes, y el Rayo salta entre varias y rompe escudos. Toca una torre tuya para elegirla: puedes mejorarla (U, hasta nivel 3), venderla (V) o cambiar a quién apunta (T). Las babosas sueltan monedas (menos en las últimas oleadas); las curanderas curan a las cercanas, las madres sueltan crías y el Rey Babosa se enfurece a media vida. Entre oleadas puedes apretar Espacio o ¡Oleada! para adelantar la siguiente (monedas y puntos extra), y ⏩ (F) acelera el juego. Suman las bajas, los combos, cada oleada (más si no pierdes vidas) y, si ganas, las vidas y las monedas sin usar (2 puntos cada una). Si llegan 20 babosas al castillo, pierdes.'),
  j(31, 'museo', 'Golpe Maestro', 'G', 'Tres pisos de un museo de noche: junta el botín, roba el tesoro de cada piso y escapa sin que te vean los guardias, las cámaras ni los láseres.', 'Sigilo y paciencia',
    'Muévete con las flechas, WASD o arrastrando el dedo. Las gemas se toman al pasar; el tesoro abre la puerta verde de escape. Mantén Espacio o el botón Puntillas para caminar sin ruido: si corres cerca de un guardia, viene a mirar. Si un guardia o una cámara te ve, el ojo se llena; si se llena, te atrapan y vuelves al inicio del piso. Los láseres rojos se prenden y se apagan: cruza cuando estén apagados. Escapar de un piso sin que te vean da bono de Fantasma.'),
  j(32, 'tiro', 'Galería de Tiro', 'G', 'Un puesto de feria de noche: patos, dianas y botellas pasan por tres rieles. Seis tiros por carga, multiplicador por racha y bombas que no hay que tocar.', 'Puntería y sangre fría',
    'Apunta con el mouse y dispara con el clic (en celular, toca el blanco). El rifle tiene 6 tiros: recarga con Espacio, R, el clic derecho o el botón Recargar. Patos 10, dianas 15, botellas 20 y el pato dorado 100. Cada cuatro aciertos seguidos sube el multiplicador (hasta x4); fallar lo corta. Las bombas restan 50 y el reloj suma 3 segundos (hasta 6 por ronda). Desde la ronda 2 asoman dianas detrás del mostrador. Al final, bono por puntería.'),
  j(33, 'cocina', 'OverCookeados', 'G', 'Llegan clientes al comedor con pedidos y tiempo límite: pica, asa la carne sin quemarla, hierve la sopa, arma el plato y entrégalo. Propinas, combos y hora punta.', 'Orden bajo presión',
    'Muévete con las flechas, WASD, el control o arrastrando el dedo. Espacio (o el botón, que dice qué vas a hacer) sirve para todo: tomar de un cajón, dejar en un mesón, juntar en un plato, entregar en la ventanilla verde o botar en la basura. La estación que tienes enfrente se marca con un recuadro amarillo y su acción escrita encima. En la tabla, mantén Espacio para picar. La carne picada va a la plancha: se asa sola, se quema si la olvidas y, quemada, se prende fuego (mantén Espacio frente a ella para apagarlo). Para la sopa echa dos tomates picados en la olla y sírvela con un plato. Shift, B en el control o el botón Impulso te dan un empujón. Las tarjetas de arriba muestran cada receta paso a paso y marcan lo que ya tiene tu plato. Entregar rápido deja propina, entregar seguido arma combos y en la hora punta todo paga x1,5.'),
  j(34, 'billar', 'Pool', 'G', 'Seis desafíos en un salón de pool con tiros contados: embocarlas todas, en orden, pegadas a la banda, la negra al final, el triángulo y bolas de oro. Con efecto de taco: corrido, retroceso y lateral.', 'Cálculo y pulso',
    'Arrastra desde cualquier parte de la mesa hacia atrás, como una honda, y suelta para tirar: mientras más arrastras, más fuerte (la barra muestra la fuerza). La línea blanca muestra hacia dónde va la blanca; al tocar una bola, los puntos amarillos muestran hacia dónde sale ella y los tenues hacia dónde sigue la blanca. En el círculo de abajo eliges dónde le pega el taco a la blanca: arriba corre después del choque, abajo retrocede, al centro se queda clavada y a los lados cambia el rebote en las bandas (W/S y Q/E con el teclado, doble clic para centrar). Con el teclado: ← → apuntan (con Shift, fino) y mantén Espacio para cargar. Cada bola vale 100 (las de oro, 300); varias en un tiro dan bono y la blanca adentro resta 50. Superar un desafío da bono por los tiros que te sobraron.'),
  j(35, 'triples', 'Lanzamiento de Triples', 'G', 'Concurso de triples: cinco estaciones con cinco balones, el último vale doble. Tres rondas de un minuto; en la segunda salen balones de oro y en la final el aro se mueve.', 'Ritmo y precisión',
    'Mantén apretado (clic, Espacio, tocar la pantalla o el botón Lanzar) y el medidor de la derecha sube y baja: suelta cuando esté en la zona verde. Más al centro de la zona, ¡perfecto! El balón normal vale 100, el de rayas (el último de cada carro) 200 y el de oro 300. Encestar sin tocar el aro da +50 y tres canastas seguidas suman bono de racha. En la ronda final el aro se mueve: suelta cuando venga hacia ti.'),
  j(36, 'calabazas', 'Torre de Calabazas', 'C', 'En un cementerio de noche, un gancho va y viene sobre una tabla que se balancea: suelta calabazas, cajas de dulces y tablones y apílalos lo más alto que puedas.', 'Pulso y paciencia',
    'Toca la pantalla, haz clic o aprieta Espacio (o el botón Soltar) para soltar la pieza que cuelga del gancho. Hay calabazas redondas, anchas y altas, cajas de dulces y tablones largos que sirven de puente. La tabla se balancea cada vez más y el gancho se apura. Cuenta la altura que la torre sostiene quieta (100 por metro) y cada pieza que queda arriba (+20). Tres piezas al suelo o 2 minutos y se acaba.'),
  j(37, 'laberinto', 'Laberinto Embrujado', 'G', 'Con tu linterna como única luz: junta las velas, abre la reja y escapa piso tras piso (cripta, biblioteca y jardín) de cinco clases de fantasmas, con objetos, trampas y pasadizos secretos.', 'Orientación y sangre fría',
    'Muévete con las flechas, WASD, la palanca del control o arrastrando el dedo; tu linterna alumbra hacia donde caminas y la flecha amarilla del suelo apunta a la vela más cercana (morada: a la salida). Junta las velas (+50, con combo si las juntas seguidas); con 3 de cada 4 la reja morada se abre y pasas al piso siguiente (+300, más si lo haces rápido, sin perder vidas y +150 si juntaste todas). Cada piso superado te da 45 segundos más. La linterna se gasta: las pilas verdes la recargan. Un toque de Espacio (o del botón Linterna) lanza un destello corto; manteniéndolo, uno cargado que llega más lejos. Los destellos asustan a los fantasmas que ves (se ponen azules): si tocas uno asustado, lo espantas. Fantasmas: Errante, Cazador (ojos rojos, rápido), Atraviesamuros (verde, cruza paredes), Chillón (avisa a los demás) y la Dama de Blanco (solo la asusta el destello cargado). Objetos: reloj (+15 s), botas, amuleto (aguanta un toque), llave (abre la reja con la mitad de las velas) y mapa. Pegado a la pared puedes pasar rozando a un fantasma. Espantar muchos en el mismo piso vale cada vez menos (desde el quinto, la mitad). Ojo con las telarañas (frenan) y las tablas que crujen (atraen fantasmas); algunos muros esconden pasadizos. 3 vidas y 3 minutos; las vidas que te queden al final suman.'),
  j(38, 'escobas', 'Carrera de Escobas', 'G', 'Una carrera en escoba de noche por un valle embrujado contra tres brujas: pasa por los aros, junta dulces, esquiva árboles secos y murciélagos y llega primero al castillo.', 'Reflejos y trazada',
    'La escoba vuela sola hacia adelante. Muévete a los lados con las flechas, A/D o arrastrando el dedo, y sube o baja con arriba/abajo, W/S o arrastrando hacia arriba y abajo. Cada aro suma 50 y cada tres aros cargas una calabaza de turbo (hasta 3): úsala con Espacio o el botón Turbo. Los dulces suman 10. Los árboles secos y las bandadas de murciélagos te frenan. Al llegar suman el puesto (600, 400, 250 o 120) y un bono por tiempo.'),
  j(39, 'bloques', 'TETRIX', 'G', 'Piezas de cuatro bloques caen en un caldero embrujado: gíralas, encájalas y completa líneas. Con bombas, calabazas, piezas fantasma, eventos de Halloween y un hechizo. En vivo, cada línea le manda lápidas al rival.', 'Rapidez y planificación',
    'Mueve con ← → (o arrastrando el dedo), gira con ↑ o X (a la derecha), Z (a la izquierda) y A (media vuelta); ↓ baja rápido y Espacio la deja caer de una (o desliza rápido hacia abajo). C o Shift guarda una pieza para después. La sombra blanca muestra dónde caerá. Completar líneas suma (1, 2, 3 o 4 a la vez: el cuádruple vale mucho) y encadenarlas da combos; meter la pieza T girando en un hueco cerrado es un Giro maestro. La barra violeta se llena con líneas: con E activas el Hechizo (8 s sin gravedad y puntos al doble). Piezas especiales: la bomba rompe un cuadro de 3 × 3, la calabaza rellena su fila y la fantasma atraviesa bloques. Se anuncian eventos: niebla, viento y lluvia de lápidas. Tienes 3 minutos; cumple el desafío del día para un bono. En celular hay botones abajo; con control, la cruceta mueve, A y B giran y el gatillo deja caer.'),
  j(40, 'bestias', 'PUCHAMON', 'G', 'Batallas de criaturas de frente, por turnos: elige 3 de 6 crías sorteadas y sube una torre de 5 rivales. Ganar sube de nivel a tu equipo y las hace evolucionar; en la cima espera una criatura legendaria. 30 criaturas por descubrir.', 'Estrategia y conocimiento',
    'Con las flechas (o WASD, el mouse, el dedo o el control) te mueves por los menús; Enter o Espacio eligen y Esc vuelve. En tu turno: Luchar (4 ataques, cada uno con su tipo y sus PP; el menú avisa si es muy eficaz o poco eficaz), Equipo (cambiar de criatura), Objetos (2 Pociones que curan la mitad y 1 Cura Total) o Rendirse. Los ataques de su mismo tipo pegan x1,5 y la tabla de tipos multiplica (x2, x½ o no afecta). Ojo con los estados: quemado, paralizado, dormido, envenenado y congelado. Mantén Enter o el clic para apurar los textos. Tu equipo empieza en el Nv. 18 y sube 8 niveles con cada victoria: en el Nv. 30 y en el Nv. 45 las criaturas evolucionan (con ataques nuevos). El Bestiario guarda las criaturas que has visto. Ganar suma puntos por criaturas en pie, vida restante, rapidez y golpes eficaces; vencer a la legendaria y superar la torre dan bonos.'),
  j(41, 'conchas', 'CONECTA4', 'F', 'El Cuatro en Línea de siempre contra la máquina: cinco partidas cada vez más difíciles, alternando quién empieza y una en modo Pop Out. En vivo, contra otra persona.', 'Estrategia',
    'Toca una columna para dejar caer tu concha: gana quien alinea cuatro (en fila, columna o diagonal). En Pop Out también puedes sacar una concha tuya de la fila de abajo con el botón ⬇ Sacar. Tienes 15 s por jugada; si se acaban, la concha cae sola. Ganar vale 250 a 500 según la partida, más 10 por cada jugada menos de 21; el empate vale un 30 %. Al final se marca la jugada ganadora que se te pasó y puedes ver la repetición.'),
  j(42, 'balsas', 'Battleship', 'F', 'La batalla naval clásica: un mar de 10 × 10 con cinco balsas. Tres batallas contra la máquina (la última en modo Salvo), con radar; si aciertas, sigues disparando. En vivo, contra otra persona.', 'Deducción',
    'Primero ubica tu flota: toca una balsa y después la casilla donde la quieres (Girar la pone de pie o acostada; no se pueden tocar entre sí). Después dispara tocando el mar de la máquina: 20 s por turno. Si le atinas a una balsa, vuelves a disparar hasta fallar (la máquina también). El 📡 radar, una vez por batalla, dice cuántas casillas con balsa hay en un cuadrado de 3 × 3. En Salvo disparas tantas veces como balsas te queden. Ganar vale 400, más 8 por cada tiro menos de 65 y 10 por cada casilla tuya a flote; si pierdes, 8 por acierto.'),
];

/** Juegos que en celular se ven mucho mejor de lado: avisan al partir si el teléfono está parado. */
/** Juegos con modo libre (fase 4): sin reloj ni límite de vidas o intentos, no guarda nada. */
export const LIBRES = new Set(['rodillos', 'puertas', 'cartero', 'laberinto', 'tinta', 'numeros', 'parejas', 'buscaconchas', 'catapulta', 'minigolf', 'tren', 'serpientes', 'karts', 'bloques', 'bombas', 'conchas', 'balsas']);
export const HORIZONTALES = new Set(['catapulta', 'billar', 'karts', 'tiro', 'defensa', 'cocina', 'triples', 'escobas', 'bestias']);

/** Juegos retirados (El Más Bajo el 23-10; La Palabra Secreta y Luces del Faro el 24-10): no salen en la web ni en los sorteos,
 * ni sus modos 1v1 y 3v3, pero sus marcas viejas conservan el nombre. */
export const RETIRADOS = new Set(['bajo', 'palabra', 'luces', 'cofre', 'eco']);
export const JUEGOS = TODOS.filter((x) => !RETIRADOS.has(x.id));
export const juegoPorId = (id: string) => TODOS.find((x) => x.id === id);

/** Tipos de enfrentamiento. Con `base`, se juega en diferido sobre ese juego individual; sin `base`, necesita juego en vivo. */
export interface TipoVersus { id: string; modo: '1v1' | '3v3'; nombre: string; idea: string; base?: string; /** Se juega solo en vivo (sala `enf-<id>`). */ vivo?: boolean }

// Los duelos 1v1 de un juego individual se llaman igual que el juego (antes tenían nombre propio y se confundían)
const v = (modo: '1v1' | '3v3', id: string, nombre: string, idea: string, base?: string, vivo = false): TipoVersus =>
  ({ id, modo, nombre: (modo === '1v1' && base && !vivo && juegoPorId(base)?.nombre) || nombre, idea, base, vivo });

const TODOS_VERSUS: TipoVersus[] = [
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
  v('1v1', 'conchas-linea', 'CONECTA4', 'Los dos contra la misma máquina, o en vivo cara a cara: el primero en alinear cuatro.', 'conchas'),
  v('1v1', 'balsas', 'Battleship', 'Los dos contra la misma flota, o en vivo cara a cara: hunde las balsas del rival.', 'balsas'),
  v('1v1', 'sumo-1v1', 'Al Agua Pato 1v1', 'Los mismos cinco rivales de máquina para cada uno; gana quien aguanta y bota más.', 'sumo'),
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
  v('1v1', 'bestias-duelo', 'Duelo de Entrenadores', 'La misma torre para los dos (las mismas crías y los mismos rivales): gana quien suba más y con más puntos.', 'bestias'),
  v('1v1', 'bloques-duelo', 'Duelo de Bloques', 'Las mismas piezas para los dos; en vivo, cada línea le manda lápidas al rival.', 'bloques'),
  v('1v1', 'torre-duelo', 'Duelo de Torres', 'El mismo ritmo para los dos; gana la torre más alta.', 'torre'),
  // Fase 4 (25-10): los 7 individuales que no tenían duelo; entran a los sorteos de la liga desde el cruce que diga MesaLiga
  v('1v1', 'lava-duelo', 'Lava Loca', 'La misma pasarela y las mismas barras para los dos: gana quien llega más lejos.', 'rodillos'),
  v('1v1', 'puertas-duelo', 'Puertas Falsas', 'Los mismos muros y las mismas puertas falsas: gana quien pasa más.', 'puertas'),
  v('1v1', 'huevo-duelo', 'Caza del Huevo', 'La misma partida contra la máquina para los dos: gana quien junta más huevos.', 'huevo'),
  v('1v1', 'futbol-duelo', 'Fuchibol', 'El mismo partido contra la máquina para los dos: gana quien hace más puntos.', 'futbol'),
  v('1v1', 'faro-duelo', 'Rey del Faro', 'La misma luz y los mismos rivales: gana quien aguanta más dentro.', 'faro'),
  v('1v1', 'catapulta-duelo', 'Angry Birds', 'Los mismos diez niveles para los dos: gana quien hace más puntos.', 'catapulta'),
  v('1v1', 'erizos-duelo', 'Erizos Ocultos', 'El mismo campo de erizos para los dos: gana quien cava mejor.', 'buscaconchas'),
  v('3v3', 'cocos-equipo', 'Cosecha en Equipo', 'Cada integrante atrapa cocos; se suman los tres.', 'cocos'),
  v('3v3', 'eco-cadena', 'Eco en Cadena', 'La misma secuencia para los seis; suma hasta dónde llegó cada uno.', 'eco'),
  v('3v3', 'caceria', 'Cacería de Cangrejos', 'Cada integrante limpia el mismo tablero; suma el equipo.', 'cangrejos'),
  v('3v3', 'tinta-equipo', 'Tinta en Equipo', 'Las mismas palabras tramposas; suma el equipo.', 'tinta'),
  v('3v3', 'arqueros', 'Arqueros del Tótem', 'Treinta flechas por equipo con los mismos vientos.', 'totem'),
  v('3v3', 'bolos-equipo', 'Torneo de Bolos', 'Cada integrante juega sus cinco turnos; suma el equipo.', 'bolos'),
  v('3v3', 'asedio', 'Asedio de Sandías', 'Los tres juegan los mismos diez niveles; suma el equipo.', 'catapulta'),
  v('3v3', 'fareros', 'Fareros', 'Los tres apagan los mismos tableros de luces.', 'luces'),
  v('3v3', 'conchas-equipo', 'Erizos Ocultos en Equipo', 'El mismo campo de erizos para todos; suma el equipo.', 'buscaconchas'),
  v('3v3', 'tesoro', 'Tesoro Compartido', 'Las mismas olas para los seis: suma lo que guardó cada equipo.', 'cofre'),
  v('3v3', 'huevo', 'Caza del Huevo', 'Cada integrante juega su partida contra la máquina; suman los tres.', 'huevo'),
  v('3v3', 'futbol', 'Fuchibol', 'Cada integrante juega su partido contra la máquina; suman los tres.', 'futbol'),
  v('3v3', 'faro', 'Rey del Faro', 'La misma luz y los mismos rivales para todos; suma el equipo.', 'faro'),
  v('3v3', 'sumo-equipos', 'Al Agua Pato por equipos', 'Cada integrante sube a la balsa por su cuenta; suma el equipo.', 'sumo'),
  v('3v3', 'relevos', 'Carrera de Relevos', 'Los tres corren Lava Loca; suma el equipo.', 'rodillos'),
  v('3v3', 'karts-equipo', 'Escudería', 'Los tres corren la misma carrera de autos; suma el equipo.', 'karts'),
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
// Sin `base` (Captura la Bandera) todavía no hay juego: se oculta hasta que exista
export const VERSUS = TODOS_VERSUS.filter((t) => t.base && !RETIRADOS.has(t.base));

/** Nombre con que se muestra un enfrentamiento: el del tipo de versus si existe, o el del juego. */
export function nombreVersus(modo: string, juego: string): string {
  return juegoPorId(juego)?.nombre ?? VERSUS.find((t) => t.modo === modo && t.base === juego)?.nombre ?? juego;
}
