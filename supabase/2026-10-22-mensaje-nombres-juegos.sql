-- Las Sustolimpiadas · 22 de octubre: el bot publica en Discord la guía de nombres (duelo → juego), sin mencionar a nadie
-- y desde ahora los avisos usan el mismo nombre del juego que la web. Ejecutar UNA vez (cada ejecución publica el mensaje).

insert into public.nombres_juegos (id, nombre) values
  ('tinta', 'Tinta Tramposa'),
  ('cangrejos', 'Mata-Cangrejos'),
  ('numeros', 'Cazanúmeros'),
  ('eco', 'Eco del Templo'),
  ('cocos', 'Cocos al Vuelo'),
  ('parejas', 'Parejas del Arrecife'),
  ('bolos', 'Bolos de Coco'),
  ('totem', 'Tiro al Tótem'),
  ('cofre', 'El Cofre o la Ola'),
  ('cartero', 'Ruta del Cartero'),
  ('minigolf', 'Minigolf del Volcán'),
  ('sumo', 'Sumo de Balsas'),
  ('karts', 'Gran Premio'),
  ('tren', 'Fuga del Tren'),
  ('tanques', 'Tanques de Juguete'),
  ('bombas', 'Bombas'),
  ('agujero', 'Agujero Negro'),
  ('defensa', 'Defensa de la Torre'),
  ('museo', 'Ladrón del Museo'),
  ('tiro', 'Galería de Tiro'),
  ('cocina', 'Cocina Caótica'),
  ('billar', 'Billar'),
  ('triples', 'Triples'),
  ('serpientes', 'Serpientes'),
  ('calabazas', 'Torre de Calabazas'),
  ('laberinto', 'Laberinto Embrujado'),
  ('escobas', 'Carrera de Escobas'),
  ('torre', 'Torre Tambaleante')
on conflict (id) do update set nombre = excluded.nombre;

select public.avisar_discord($mensaje$🎮 **¿Qué juego es mi duelo?** Guía de nombres
En el aviso del cruce, cada duelo aparece con su nombre de duelo. Este es el juego al que corresponde:

📍 **Juegos del Cruce 1**
• Duelo de Tinta → **Tinta Tramposa**
• Cangrejos a Dos Manos → **Mata-Cangrejos**
• Carrera de Números → **Cazanúmeros**
• Sumo de Balsas 1v1 → **Sumo de Balsas**
• Duelo de Karts → **Gran Premio**
• Fuga en Paralelo → **Fuga del Tren**
• Duelo de Tanques → **Tanques de Juguete**
• Duelo de Bombas → **Bombas**
• Duelo de Agujeros → **Agujero Negro**
• Duelo de Castillos → **Defensa de la Torre**
• Duelo de Pistoleros → **Galería de Tiro**
• Duelo de Chefs → **Cocina Caótica**
• Duelo de Serpientes → **Serpientes**
• Laberinto en Paralelo → **Laberinto Embrujado**
• Duelo de Torres → **Torre Tambaleante**

🗓️ **Los demás (pueden salir en los próximos cruces)**
• Duelo de Ecos → **Eco del Templo**
• Duelo de Cocos → **Cocos al Vuelo**
• Parejas cara a cara → **Parejas del Arrecife**
• Bolos cara a cara → **Bolos de Coco**
• Tiro al Tótem por turnos → **Tiro al Tótem**
• El Cofre o la Ola en duelo → **El Cofre o la Ola**
• Carteros rivales → **Ruta del Cartero**
• Minigolf mano a mano → **Minigolf del Volcán**
• Ladrones Rivales → **Ladrón del Museo**
• Mesa contra Mesa → **Billar**
• Duelo de Triples → **Triples**
• Duelo de Calabazas → **Torre de Calabazas**
• Duelo de Escobas → **Carrera de Escobas**

✅ Para que cuente, juégalo desde **Juegos → Versus 1v1 → Mis enfrentamientos** ("Jugar ronda" o "Jugar en vivo"). Si lo juegas desde el portal normal, es una partida individual y no suma al cruce.
Desde ahora la web y los avisos usan el **mismo nombre del juego**, para que no haya confusiones.$mensaje$);
