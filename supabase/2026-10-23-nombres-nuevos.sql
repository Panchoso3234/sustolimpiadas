-- Las Sustolimpiadas · 23 de octubre: nombres nuevos de los juegos. El bot de Discord usa la tabla nombres_juegos, así que
-- con esto los avisos dicen lo mismo que la web. Ejecutar UNA vez en el SQL Editor de Supabase (al final publica el aviso de los cambios).

insert into public.nombres_juegos (id, nombre) values
  ('rodillos', 'Lava Loca'),
  ('puertas', 'Puertas Falsas'),
  ('huevo', 'Caza del Huevo'),
  ('sumo', 'Al Agua Pato'),
  ('futbol', 'Fuchibol'),
  ('faro', 'Rey del Faro'),
  ('totem', 'Tiro al Tótem'),
  ('catapulta', 'Angry Birds'),
  ('bolos', 'Bolos Playeros'),
  ('minigolf', 'Minigolf'),
  ('cocos', '¡Atrápalos si puedes!'),
  ('cangrejos', 'Mata-Cangrejos'),
  ('numeros', 'Cazanúmeros'),
  ('tinta', 'Tinta Tramposa'),
  ('parejas', 'Memoria de Pez'),
  ('buscaconchas', 'Erizos Ocultos'),
  ('luces', 'Luces del Faro'),
  ('cartero', 'Ruta del Cartero'),
  ('cofre', 'El Cofre o la Ola'),
  ('torre', 'Torre Tambaleante'),
  ('palabra', 'La Palabra Secreta'),
  ('eco', 'Eco del Templo'),
  ('karts', 'Carreras de Autos'),
  ('tren', 'Subway Surfers'),
  ('tanques', 'Guerra de Tanques'),
  ('bombas', 'Bomberman'),
  ('agujero', 'Agujero Negro'),
  ('serpientes', 'Serpientes'),
  ('defensa', 'Tower Defense'),
  ('museo', 'Golpe Maestro'),
  ('tiro', 'Galería de Tiro'),
  ('cocina', 'OverCookeados'),
  ('billar', 'Pool'),
  ('triples', 'Lanzamiento de Triples'),
  ('calabazas', 'Torre de Calabazas'),
  ('laberinto', 'Laberinto Embrujado'),
  ('escobas', 'Carrera de Escobas'),
  ('bloques', 'TETRIX'),
  ('bestias', 'PUCHAMON')
on conflict (id) do update set nombre = excluded.nombre;

-- El Más Bajo sale del torneo
delete from public.nombres_juegos where id = 'bajo';

select public.avisar_discord($mensaje$**Los juegos cambian de nombre**
Desde hoy la página y los avisos de este canal usan el mismo nombre para cada juego (ya no hay nombres de duelo aparte). Tus marcas, récords y duelos siguen igual.

- Rodillos del Volcán ahora se llama **Lava Loca**
- Sumo de Balsas ahora se llama **Al Agua Pato**
- Catapulta de Sandías ahora se llama **Angry Birds**
- Bolos de Coco ahora se llama **Bolos Playeros**
- Minigolf del Volcán ahora se llama **Minigolf**
- Cocos al Vuelo ahora se llama **¡Atrápalos si puedes!**
- Parejas del Arrecife ahora se llama **Memoria de Pez**
- Palabra del Día ahora se llama **La Palabra Secreta**
- Gran Premio ahora se llama **Carreras de Autos**
- Fuga del Tren ahora se llama **Subway Surfers**
- Tanques de Juguete ahora se llama **Guerra de Tanques**
- Bombas ahora se llama **Bomberman**
- Defensa de la Torre ahora se llama **Tower Defense**
- Ladrón del Museo ahora se llama **Golpe Maestro**
- Cocina Caótica ahora se llama **OverCookeados**
- Billar ahora se llama **Pool**
- Triples ahora se llama **Lanzamiento de Triples**
- Bestiario ahora se llama **PUCHAMON**

Además, **El Más Bajo** sale del torneo (no le tocó a nadie en el cruce 1).
Si en un aviso ves un nombre que no reconoces, búscalo en Juegos de la página: es el mismo.$mensaje$);
