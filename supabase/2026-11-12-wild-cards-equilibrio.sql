-- Las Sustolimpiadas · 12 de noviembre · WILD CARDS 2.1: EQUILIBRIO
-- Opiniones de la comunidad (Palta, LewVan, Chui, Hishore) y simulación con el motor:
--   · Fuera los robos: Trampa, Contraataque y Agujero Negro dejan de salir (quedan solo por el historial).
--   · Tipo nuevo «Misión»: Encargo (rara), Contrato (épica) y Hazaña (legendaria). La misión se sortea en la columna dado.
--   · Legendarias hasta +22 base (antes hasta +42) y Lluvia de Estrellas hasta +15.
--   · Probabilidad de legendaria: 0 % en los puestos 1-2, 3 % en 3-5, 15 % en 6-8 y 30 % en 9-12.
-- Requiere haber ejecutado antes 2026-11-11-wild-cards.sql y 2026-11-12-wild-cards-2.sql. Se puede ejecutar más de una vez.
-- Las cartas ya sorteadas no se tocan. Va en una sola transacción: si algo falla, no se aplica nada.
-- Generado desde src/juegos/wildcards.ts (las pruebas comprueban que coincidan).

-- Antes: ¿ya se sortearon cartas del cruce 8? (si sale más de 0, avisar antes de seguir)
select count(*) as cartas_ya_sorteadas_cruce_8 from public.wild_cards where cruce = 8;

begin;

-- ───────── Catálogo ─────────
insert into public.wc_cartas (id, nombre, emoji, rareza, tipo, efecto) values
  ('escudo', 'Escudo de Arena', '🛡️', 'comun', 'auto', 'Cada derrota suma +2 base.'),
  ('hinchada', 'La Hinchada', '📣', 'comun', 'auto', '+2 base por cada duelo ganado.'),
  ('consuelo', 'Premio de Consuelo', '🧃', 'comun', 'auto', 'Si el equipo gana 0 o 1 duelo: +5 base.'),
  ('dado', 'Dado de la Suerte', '🎲', 'comun', 'auto', 'Se tira un dado de 1 a 6 y se suma lo que salga.'),
  ('bebida', 'Bebida Energética', '🥤', 'comun', 'auto', 'Si el equipo gana al menos un duelo: +3 base.'),
  ('pelo', 'Por un Pelo', '🪶', 'comun', 'auto', '+2 base por cada duelo ganado 2-1.'),
  ('cancha', 'Elige tu Cancha', '🎯', 'comun', 'decision', 'El equipo elige el juego de 1 de sus duelos.'),
  ('segunda', 'Segunda Vuelta', '🔁', 'comun', 'decision', 'Un jugador repite 1 ronda y se queda con su mejor puntaje.'),
  ('moneda', 'Moneda al Aire', '🪙', 'comun', 'auto', 'Se lanza una moneda: cara +6 base, sello nada.'),
  ('madrugador', 'Madrugador', '🌅', 'comun', 'auto', '+2 base por cada duelo del equipo que termine antes del último día del cruce.'),
  ('caballeros', 'Pacto de Caballeros', '🤝', 'comun', 'auto', 'Cada empate suma +3 base (máximo +6).'),
  ('honor', 'Ronda de Honor', '🎖️', 'comun', 'auto', '+2 base por cada ronda ganada en un duelo perdido (máximo +6).'),
  ('mosqueteros', 'Tres Mosqueteros', '🤺', 'comun', 'auto', 'Si los 3 jugadores del equipo juegan su duelo: +5 base.'),
  ('calentamiento', 'Calentamiento', '🏃', 'comun', 'auto', 'Si el equipo no pierde ningún duelo 0-2: +3 base.'),
  ('boleto', 'Boleto de Entrada', '🎟️', 'comun', 'auto', '+3 base, pase lo que pase.'),
  ('amuleto', 'Amuleto', '🍀', 'comun', 'auto', 'Si el equipo pierde la serie: +3 base.'),
  ('primer_golpe', 'Primer Golpe', '👊', 'comun', 'auto', 'Si el equipo gana el primer duelo del cruce que se cierra: +3 base.'),
  ('cierre_oro', 'Cierre de Oro', '🏁', 'comun', 'auto', 'Si el equipo gana el último duelo del cruce que se cierra: +3 base.'),
  ('paciencia', 'Paciencia', '🐢', 'comun', 'auto', '+2 base por cada duelo que se va a 3 rondas.'),
  ('pancarta', 'Pancarta', '🪧', 'comun', 'auto', '+2 base por cada duelo ganado 2-0.'),
  ('libreta', 'Libreta de Récords', '📓', 'comun', 'auto', '+2 base por cada duelo perdido en que el equipo igual sumó más puntaje de juego que el rival.'),
  ('abrazo', 'Abrazo de Grupo', '🫂', 'comun', 'auto', 'Si el cruce termina con 1 victoria, 1 empate y 1 derrota: +5 base.'),
  ('sorteo_chico', 'Sorteo Chico', '🎁', 'comun', 'auto', 'Se tira un dado de 6: si sale 5 o 6, +6 base.'),
  ('ultimo_aliento', 'Último Aliento', '💨', 'comun', 'auto', 'Si el equipo pierde los 3 duelos: +6 base.'),
  ('doble_nada', 'Doble o Nada', '⚡', 'rara', 'decision', 'Se marca 1 duelo antes de jugarlo: si lo gana, +14 base; si no, nada (nunca resta).'),
  ('muralla', 'La Muralla', '🧱', 'rara', 'auto', 'Cada derrota suma +4 base.'),
  ('iman', 'Imán', '🧲', 'rara', 'auto', '+4 base por cada duelo ganado.'),
  ('barrida', 'Barrida', '🧹', 'rara', 'auto', 'Si el equipo gana los 3 duelos: +14 base.'),
  ('encargo', 'Encargo', '📜', 'rara', 'auto', 'Misión al azar: ganar un duelo 2-0, terminar los 3 duelos antes del último día o ganar una ronda en cada duelo. Si la cumple, +10 base.'),
  ('cambio_rivales', 'Cambio de Rivales', '🔀', 'rara', 'decision', 'El equipo decide quién de los suyos juega contra quién.'),
  ('ruleta', 'Ruleta Rusa', '🎰', 'rara', 'auto', 'Se gira otra vez: 50 % gana además una carta Épica, 50 % nada.'),
  ('dado_grande', 'Dado Grande', '🎳', 'rara', 'auto', 'Se tiran dos dados de 6 y se suma el total (de 2 a 12).'),
  ('remontada', 'Remontada', '📈', 'rara', 'auto', 'Si el equipo está del puesto 7 hacia abajo: +4 base por cada duelo ganado.'),
  ('ola', 'Ola de Rondas', '🌊', 'rara', 'auto', '+2 base por cada ronda ganada en el cruce (máximo +12).'),
  ('fortaleza', 'Fortaleza', '🏰', 'rara', 'auto', 'Si el equipo no pierde ningún duelo: +12 base.'),
  ('caja', 'Caja Misteriosa', '📦', 'rara', 'auto', 'Al revelar se sortea un premio entre +2 y +14 base.'),
  ('seguro', 'Seguro de Vida', '🦺', 'rara', 'auto', 'Si el equipo pierde la serie: +10 base.'),
  ('tictac', 'Tic-Tac', '⏱️', 'rara', 'auto', '+4 base por cada duelo del equipo que termine antes del último día del cruce.'),
  ('golpe_mesa', 'Golpe de Mesa', '🔨', 'rara', 'auto', '+4 base por cada duelo ganado 2-0.'),
  ('espejo', 'Espejo', '🪞', 'rara', 'auto', 'Copia la carta del rival si es común o rara y da puntos sola. Si no se puede copiar, +6 base.'),
  ('comodin', 'Comodín', '🤹', 'rara', 'auto', 'Al revelar, se convierte en la carta común que más puntos le habría dado.'),
  ('bis', 'Bis', '🎤', 'rara', 'decision', 'Dos jugadores distintos repiten 1 ronda cada uno y se quedan con su mejor puntaje.'),
  ('racha', 'En Racha', '🔥', 'epica', 'auto', 'Todos los puntos del equipo en el cruce valen ×1,25.'),
  ('contrato', 'Contrato', '📑', 'epica', 'auto', 'Si cumple 2 de estas 3 misiones: ganar un duelo 2-0, terminar los 3 duelos antes del último día o ganar una ronda en cada duelo: +16 base.'),
  ('sed', 'Sed de Sangre', '🩸', 'epica', 'auto', 'Si el equipo gana la serie (2 o 3 duelos): +15 base.'),
  ('congelar', 'Congelar', '🧊', 'epica', 'auto', 'La carta del rival no se aplica este cruce (no sirve contra legendarias).'),
  ('doble_carta', 'Doble Carta', '🃏', 'epica', 'auto', 'En vez de esta, el equipo recibe 2 cartas (común o rara) y usa ambas.'),
  ('revancha', 'Revancha Total', '🔄', 'epica', 'decision', 'Un duelo perdido se vuelve a jugar completo, con un desafío nuevo, y vale el segundo.'),
  ('fenix', 'Fénix', '☄️', 'epica', 'auto', 'Si el equipo pierde los 3 duelos: +20 base.'),
  ('todo_nada', 'Todo o Nada', '💣', 'epica', 'decision', 'Se marcan 2 duelos antes de jugarlos: si gana los dos, +25 base; si no, nada (nunca resta).'),
  ('pacto_hierro', 'Pacto de Hierro', '⛓️', 'epica', 'auto', 'Si los 3 duelos terminan igual (3 victorias, 3 empates o 3 derrotas): +20 base.'),
  ('estrellas', 'Lluvia de Estrellas', '🌠', 'epica', 'auto', '+3 base por cada duelo ganado y +1 por cada ronda ganada (máximo +15).'),
  ('gran_angular', 'Gran Angular', '🔭', 'epica', 'auto', '+8 base por cada duelo ganado, si el rival está más arriba en la tabla.'),
  ('corona', 'La Corona', '👑', 'legendaria', 'auto', 'Todos los puntos del equipo en el cruce valen ×1,3.'),
  ('hazana', 'Hazaña', '🏛️', 'legendaria', 'auto', 'Misión al azar: ganar los 3 duelos, ganar 2 duelos 2-0 o ganarle la serie a un equipo de más arriba. Si la cumple, +20 base; si no, +6.'),
  ('mano', 'Mano de Dios', '✋', 'legendaria', 'decision', 'Elige cualquier carta común, rara o épica, y además +6 base.'),
  ('big_bang', 'Big Bang', '💥', 'legendaria', 'auto', 'Se tiran dos dados de 6 y se suma el total más 6 (de 8 a 18).'),
  ('leyenda', 'Leyenda Viva', '🏆', 'legendaria', 'auto', '+6 base por cada duelo ganado y +4 más si gana los 3.'),
  ('tridente', 'Tridente', '🔱', 'legendaria', 'auto', 'Cada derrota suma +4 base y cada victoria también.'),
  ('eclipse', 'Eclipse', '🌑', 'legendaria', 'auto', 'Anula la carta del rival (también las legendarias) y suma +6 base.'),
  ('supernova', 'Supernova', '🌟', 'legendaria', 'auto', '+6 base de entrada y +4 por cada duelo ganado.'),
  ('titan', 'Titán', '🗿', 'legendaria', 'auto', '+6 base de entrada y cada derrota suma +4 más.'),
  ('boveda', 'Bóveda del Dragón', '🐉', 'legendaria', 'auto', 'Se tiran tres dados de 6 y se suma el total (de 3 a 18).'),
  ('rey_isla', 'Rey de la Isla', '🏝️', 'legendaria', 'auto', '+15 base si el equipo está del puesto 9 al 12; si no, +8 base.')
on conflict (id) do update set nombre = excluded.nombre, emoji = excluded.emoji, rareza = excluded.rareza, tipo = excluded.tipo, efecto = excluded.efecto, activa = true;
update public.wc_cartas set activa = false where id in ('orbita', 'trampa', 'contraataque', 'agujero');

-- ───────── Probabilidades ─────────
insert into public.wc_probabilidades (desde, hasta, comun, rara, epica, legendaria) values
  (1, 2, 70, 22, 8, 0),
  (3, 5, 60, 25, 12, 3),
  (6, 8, 40, 30, 15, 15),
  (9, 12, 20, 28, 22, 30)
on conflict (desde) do update set hasta = excluded.hasta, comun = excluded.comun, rara = excluded.rara, epica = excluded.epica, legendaria = excluded.legendaria;

-- ───────── Tiradas (y misiones): las decide la base al sortear la carta ─────────
create or replace function public.wc_tirar(p_carta text) returns smallint
language sql volatile set search_path = '' as $$
  select (case p_carta
    when 'dado' then 1 + floor(random() * 6)   -- dado: 1 a 6
    when 'moneda' then 1 + floor(random() * 2)   -- moneda: 1 a 2
    when 'sorteo_chico' then 1 + floor(random() * 6)   -- sorteo_chico: 1 a 6
    when 'dado_grande' then 2 + floor(random() * 6) + floor(random() * 6)   -- dado_grande: 2 a 12
    when 'caja' then 2 + floor(random() * 13)   -- caja: 2 a 14
    when 'big_bang' then 2 + floor(random() * 6) + floor(random() * 6)   -- big_bang: 2 a 12
    when 'boveda' then 3 + floor(random() * 6) + floor(random() * 6) + floor(random() * 6)   -- boveda: 3 a 18
    when 'encargo' then 1 + floor(random() * 3)   -- encargo: 1 a 3
    when 'hazana' then 1 + floor(random() * 3)   -- hazana: 1 a 3
  end)::smallint;
$$;
revoke all on function public.wc_tirar(text) from public, anon, authenticated;

commit;

-- Comprobación: 64 cartas activas (24, 18, 11, 11), 4 retiradas, y la tabla de probabilidades nueva
select rareza, count(*) filter (where activa) as activas, count(*) filter (where not activa) as retiradas from public.wc_cartas group by rareza order by 1;
select * from public.wc_probabilidades order by desde;
