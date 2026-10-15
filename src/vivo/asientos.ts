// Quién juega, quién mira y quién hace de anfitrión en una sala en vivo. Sin nada de red: se puede probar sola.

export type Quiere = 'jugar' | 'mirar';
/** `listo` es la partida para la que marcó Listo (0 si no marcó): así un Listo viejo no hace partir la revancha. */
export interface Presente { clave: string; id: string; nombre: string; desde: number; listo: number; quiere: Quiere }
export interface Reparto { jugadores: string[]; espectadores: Presente[]; anfitrion: string | null }

/** Una persona con varias pestañas cuenta una vez: la que llegó primero. */
export function unicos(presentes: Presente[]): Presente[] {
  const vistos = new Map<string, Presente>();
  for (const p of [...presentes].sort((a, b) => a.desde - b.desde)) if (!vistos.has(p.id)) vistos.set(p.id, p);
  return [...vistos.values()];
}

/**
 * Asientos: si la partida empezó, los de la partida; si la sala es oficial, los dos del enfrentamiento;
 * si no, los dos primeros que entraron a jugar. El anfitrión es la pestaña del primer jugador presente
 * (si no hay jugadores, la más antigua).
 */
export function repartir(presentes: Presente[], asientos: [string, string] | null, fijos: [string, string] | null): Reparto {
  const gente = unicos(presentes);
  const jugadores = asientos ?? fijos ?? gente.filter((p) => p.quiere === 'jugar').slice(0, 2).map((p) => p.id);
  const espectadores = gente.filter((p) => !jugadores.includes(p.id));
  const primero = jugadores.map((id) => gente.find((p) => p.id === id)).find((p) => p) ?? gente[0];
  return { jugadores, espectadores, anfitrion: primero?.clave ?? null };
}

/** Primera ronda que falta por jugar (de 1 a `total`), o null si ya se jugaron todas. */
export function rondaSiguiente(jugadas: number[], total: number): number | null {
  for (let r = 1; r <= total; r++) if (!jugadas.includes(r)) return r;
  return null;
}

/** Si los dos marcaron Listo, pero para rondas distintas (uno ya jugó una ronda a su hora). */
export const rondasDistintas = (mio: number, rival: number) => mio > 0 && rival > 0 && mio !== rival;

/** Pruebas de las reglas: devuelve la lista de fallas. */
export function probarAsientos(): string[] {
  const p = (id: string, desde: number, quiere: Quiere = 'jugar', clave = `${id}:${desde}`): Presente => ({ clave, id, nombre: id, desde, listo: 0, quiere });
  const fallas: string[] = [], igual = (que: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) fallas.push(`${que}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  // 1. Los dos primeros que quieren jugar se sientan; quien entró a mirar no quita asiento
  let r = repartir([p('ana', 1), p('espia', 2, 'mirar'), p('beto', 3)], null, null);
  igual('amistoso: asientos', r.jugadores, ['ana', 'beto']);
  igual('amistoso: espectadores', r.espectadores.map((x) => x.id), ['espia']);
  igual('amistoso: anfitrión', r.anfitrion, 'ana:1');
  // 2. Con la partida empezada, los asientos no cambian aunque llegue gente
  r = repartir([p('carla', 0), p('ana', 1), p('beto', 3)], ['ana', 'beto'], null);
  igual('empezada: asientos', r.jugadores, ['ana', 'beto']);
  igual('empezada: carla mira', r.espectadores.map((x) => x.id), ['carla']);
  // 3. Sala oficial: solo los dos del enfrentamiento juegan, aunque otro llegue antes y quiera jugar
  r = repartir([p('intruso', 0), p('beto', 2)], null, ['ana', 'beto']);
  igual('oficial: asientos fijos', r.jugadores, ['ana', 'beto']);
  igual('oficial: intruso mira', r.espectadores.map((x) => x.id), ['intruso']);
  igual('oficial: anfitrión es beto (ana no está)', r.anfitrion, 'beto:2');
  // 4. Una persona con dos pestañas cuenta una vez
  r = repartir([p('ana', 1), p('ana', 5, 'jugar', 'ana:otra'), p('beto', 3), p('carla', 4, 'mirar'), p('carla', 6, 'mirar', 'carla:otra')], null, null);
  igual('pestañas: asientos', r.jugadores, ['ana', 'beto']);
  igual('pestañas: un solo espectador', r.espectadores.length, 1);
  // 5. Sala vacía
  igual('vacía: sin anfitrión', repartir([], null, null).anfitrion, null);
  // 6. Rondas de un enfrentamiento oficial
  igual('rondas: primera', rondaSiguiente([], 3), 1);
  igual('rondas: salta las jugadas', rondaSiguiente([1, 2], 3), 3);
  igual('rondas: listos en rondas distintas', rondasDistintas(2, 1), true);
  igual('rondas: sin listo del rival no cuenta', rondasDistintas(2, 0), false);
  igual('rondas: no quedan', rondaSiguiente([1, 2, 3], 3), null);
  return fallas;
}
