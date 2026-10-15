# Diseño · Todos los duelos 1v1 en vivo y "Partidas en línea"

Fecha: 2026-10-14 · Pedido por Pancho · Estado: **por aprobar**

## 1. Objetivo
Que cada duelo 1v1 se juegue **en vivo** (los dos conectados a la vez), adaptado a lo que mejor le sienta a cada juego, y que cualquiera pueda **mirar** las partidas desde una pestaña nueva, **Partidas en línea**, con un ojo 👁 que cuenta a los espectadores. Cada juego tiene su foto, igual que en Individual.

## 2. Decisiones de Pancho (2026-10-14)
- **Dan puntos del torneo.** Un duelo oficial lo sigue creando la Mesa de control; jugarlo en vivo cuenta igual que en diferido.
- **El diferido queda de respaldo.** Si los dos no coinciden antes del plazo, cada uno puede jugar su ronda a su hora, como hoy.
- **Conexión directa y gratis.** Los juegos se hablan navegador a navegador (WebRTC). Supabase se usa solo para presentarse, contar espectadores y listar salas. Si una red no logra la conexión directa, esa partida sigue por Supabase, más lenta.
- **Agujero Negro va por turnos:** "Es el turno de Pancho" (Vale mira) y después al revés.

## 3. Por qué conexión directa
Supabase gratis permite **100 mensajes por segundo en todo el proyecto**, y cada mensaje entregado a cada persona cuenta. Un juego de acción con 5 espectadores ya usa ~70 por segundo, así que dos partidas a la vez superan el límite y Supabase corta las conexiones. Con WebRTC los datos del juego no pasan por Supabase.
- Para encontrarse, los navegadores usan el servidor público STUN de Google (`stun:stun.l.google.com:19302`), que ve la IP de cada jugador. No hay servidor TURN pagado: en las redes que bloquean la conexión directa (estimado: 1 de cada 10), la partida usa el **respaldo por Supabase** con menos mensajes (6 fotos por segundo en vez de 15).

## 4. Piezas

### 4.1 Enlace (`src/vivo/enlace.ts`)
- Topología en estrella: el **anfitrión** (lado A, quien entra primero o el lado A del enfrentamiento) tiene una conexión directa con cada persona de la sala (rival y espectadores) y reenvía lo que haga falta.
- Dos canales por conexión: uno **fiable** (eventos: jugadas, turnos, fin) y uno **rápido** (fotos del estado y entradas, sin reintento).
- La señalización (ofertas e ICE) viaja por el canal de Supabase de la sala: son unos pocos mensajes al conectar.
- Respaldo automático: si a los 6 s no hay conexión directa con alguien, sus mensajes van por Supabase broadcast con ritmo reducido.
- API: `enviar(tipo, datos, {fiable})`, `alRecibir((tipo, datos, de) => …)`, `estado(de)`.

### 4.2 Sala en vivo (`src/vivo/sala.ts`, ampliada)
- Presencia: asientos A y B; el resto son espectadores. El ojo 👁 cuenta a los espectadores conectados.
- Flujo: entrar → elegir asiento o mirar → **Listo** los dos → el anfitrión envía `partir` → cuenta 3-2-1 a la vez → partida → resultado de ambos → **revancha** o siguiente ronda.
- Avisos grandes compartidos: "Es el turno de Pancho", "¡Ronda 2!".
- Reconexión: quien vuelve en menos de 30 s recupera su asiento y la sala le envía el estado actual. Si se cae el anfitrión, la partida se pausa 30 s; si no vuelve, el rival gana por abandono.
- Se mantienen las reglas de hoy de las salas de Cuatro Conchas y Balsas (asientos por orden de llegada, invitados sin cuenta solo en amistosos).

### 4.3 Partidas en línea (pestaña nueva del portal)
- Canal de presencia global `vivo:salas`: cada anfitrión publica `{codigo, juego, a, b, estado, turno, espectadores, oficial}` y lo actualiza al cambiar.
- La pestaña muestra tarjetas con la **foto del juego**, "Pancho vs Vale", el estado (esperando rival, jugando, turno de X, terminada), 👁 N y un botón **Mirar** (o **Jugar** si falta un rival y la sala es amistosa).
- Pestañas del portal: Individual · Versus 1v1 · Versus 3v3 · En vivo (crear salas amistosas) · **Partidas en línea** · Posiciones.

### 4.4 Contrato de juego en vivo (`src/juegos/marco.ts`)
- `Contexto.vivo?: { rol: 'a' | 'b' | 'espectador'; nombres: {a, b}; aspectos: {a, b}; enviar; alRecibir; avisar(texto) }`.
- `Resultado.vivo?: { a: number; b: number; ganador: 'a' | 'b' | 'empate' }`: el juego entrega el puntaje de los dos.
- Cada juego elige uno de cuatro patrones, con ayudantes en `src/vivo/patrones.ts`:
  1. **Mismo mundo**: el anfitrión simula todo; el rival envía sus entradas 20 veces por segundo y el anfitrión envía fotos del estado 15 veces por segundo. El rival y los espectadores dibujan interpolando con 100 ms de atraso, y el jugador B ve su propio personaje sin demora (predicción).
  2. **Por turnos**: quien juega su turno manda en ese momento y envía fotos de su estado; los demás miran ese mismo juego.
  3. **En paralelo**: cada uno simula su propia partida con la misma semilla y envía un resumen (puntaje y lo necesario para dibujar al rival como fantasma o en pantalla dividida) 8 veces por segundo.
  4. **Tablero compartido**: el anfitrión decide y reparte los eventos; los tableros se dibujan a partir de esos eventos.
- Los espectadores cargan el mismo juego en modo `espectador`: sin controles y dibujando lo que llega. En los juegos en paralelo pueden alternar entre "Mirar a Pancho" y "Mirar a Vale".

### 4.5 Puntos oficiales
- Un enfrentamiento oficial 1v1 tiene su sala fija `enf-<id>` y se abre con el botón **Jugar en vivo** en Versus 1v1, junto a "Jugar a mi hora".
- Cada ronda en vivo usa la semilla de siempre (`empezar_ronda`). Al terminar, **cada jugador guarda su propio puntaje** con `terminar_ronda`, y el servidor cierra el enfrentamiento como hoy (`resolver_enfrentamiento`). **No hay que ejecutar nada nuevo en Supabase.**
- En los juegos de mismo mundo, el anfitrión calcula los dos puntajes y cada uno guarda el suyo. Si alguien lo altera, la Mesa de control lo ve como hoy y lo resuelve Pancho.
- Un enfrentamiento a 3 o 5 rondas se juega seguido en la misma sala, ronda tras ronda.
- Los amistosos (pestaña En vivo) no guardan puntos y admiten invitados sin cuenta.

## 5. Cada juego
| Juego | Patrón | Cómo se juega en vivo | Quién gana |
|---|---|---|---|
| Tanques de Juguete | Mismo mundo | Los dos + 2 tanques de máquina que atacan a ambos; 3 vidas cada uno; tablero de la oleada 3 | Quien queda en pie; si se acaba el tiempo (3 min), más vidas y después más bajas |
| Bombas | Mismo mundo | Los dos + 2 de máquina; 3 rondas; mejoras | Más rondas ganadas |
| Serpientes | Mismo mundo | Los dos + 6 de máquina; si mueres, vuelves chico a los 3 s; 3 min | Largo máximo + 200 por eliminación |
| Sumo de Balsas | Mismo mundo | Los dos + 4 de máquina; mejor de 3 rondas | Más rondas sobreviviendo |
| Gran Premio | Mismo mundo | Dos karts + 4 de máquina; choques y plátanos entre ustedes; 3 vueltas | Quien llega antes |
| Agujero Negro | Por turnos | "Es el turno de Pancho" (2 min, Vale mira) y después Vale; misma ciudad | Más puntos tragados |
| Minigolf del Volcán | Por turnos | Las dos pelotas en la misma cancha, golpe a golpe; tarjeta hoyo a hoyo | Menos golpes |
| Bolos de Coco | Por turnos | Turnos alternados en la misma pista; marcador de boliche | Más palos |
| Tiro al Tótem | Por turnos | Flecha y flecha, mismo viento en cada ronda | Más puntos |
| El Cofre o la Ola | Tablero compartido | Los mismos cofres; cada uno elige en secreto y se revela a la vez | Más tesoro |
| Parejas del Arrecife | Tablero compartido | Memorice clásico: un tablero, por turnos; si aciertas, sigues | Más parejas |
| Cazanúmeros | Tablero compartido | Un tablero: cada número es de quien lo toca primero | Más números |
| Tinta Tramposa | Tablero compartido | La misma palabra a la vez; el punto es de quien responde bien primero | Más puntos |
| Mata-Cangrejos | Tablero compartido | Mismos cangrejos; cada uno es de quien le pega primero | Más cangrejos |
| Eco del Templo | Por turnos | "Simón dice": la secuencia crece y la repiten por turnos | Quien falla después |
| Cocos al Vuelo | Mismo mundo | Misma playa y los dos personajes; cada coco es de quien lo atrapa | Más puntos |
| Torre Tambaleante | En paralelo | Las dos torres una al lado de la otra en la escena, creciendo a la vez | Torre más alta |
| Ruta del Cartero | En paralelo | El mismo pueblo; los espectadores ven las dos rutas dibujándose | Ruta mejor puntuada |
| Fuga del Tren | En paralelo | Mismas vías; ves a tu rival como corredor fantasma; si uno choca, mira al otro | Más metros + monedas |
| Cuatro Conchas en Línea | Por turnos (ya existe) | Pasa a la sala nueva con espectadores y Partidas en línea | Cuatro en línea |
| Batalla de Balsas | Por turnos (ya existe) | Igual | Hunde todo |

Juegos que hoy no tienen 1v1 (Fuchibol, Caza del Huevo, Rey del Faro, El Más Bajo, etc.) quedan fuera de este diseño. Algunos serían muy buenos en vivo más adelante.

## 6. Fotos
Las tarjetas de En vivo y de Partidas en línea usan `public/juegos/<juego>.png`. Faltan dos fotos nuevas: Cuatro Conchas en Línea y Batalla de Balsas.

## 7. Tandas (cada una se revisa con Pancho antes de seguir)
1. **Base:** enlace WebRTC con respaldo, sala ampliada (asientos, espectadores, 👁, reconexión, abandono, revancha), Partidas en línea, contrato `vivo`, botón "Jugar en vivo" en los oficiales, y Cuatro Conchas y Balsas pasadas a la sala nueva con sus fotos.
2. **Tablero compartido y por turnos:** Parejas, Cazanúmeros, Tinta, Mata-Cangrejos, Eco, Cofre, Tótem, Bolos, Minigolf y Agujero Negro.
3. **Mismo mundo:** Tanques, Bombas, Serpientes, Sumo, Cocos y Gran Premio.
4. **En paralelo:** Torre, Cartero y Fuga del Tren.

## 8. Pruebas
- Para cada juego: dos pestañas de Edge sin ventana (`?invitado=a` y `?invitado=b`) más una tercera que mira. Se comprueba que los tres ven lo mismo, que el ojo cuenta 1, que el resultado coincide, y que la reconexión funciona al recargar a medio juego.
- Rendimiento en la Iris Xe con un jugador y un espectador abiertos.
- Conteo de mensajes de Supabase por partida, para confirmar que queda muy por debajo del límite.

## 9. Riesgos
- Las redes que bloquean la conexión directa juegan más lento por el respaldo. En los juegos de acción se notará.
- En los juegos de mismo mundo, quien no es anfitrión tiene ~50–150 ms de atraso en lo que hace el otro. Se suaviza dibujando su propio personaje sin demora.
- Es mucho trabajo: cuatro tandas y varias sesiones. Hasta terminar, el diferido sigue funcionando igual.
