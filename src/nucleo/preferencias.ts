// Preferencias de cada persona que solo viven en su navegador: favoritos, modo daltónico, recorrido visto y avisos leídos.
const leer = <T>(clave: string, porDefecto: T): T => { try { const v = localStorage.getItem(clave); return v === null ? porDefecto : (JSON.parse(v) as T); } catch { return porDefecto; } };
const escribir = (clave: string, valor: unknown) => { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ } };

export const favoritos = (): string[] => leer('susto.favoritos', []);
export function alternarFavorito(juego: string): string[] {
  const lista = favoritos(), nueva = lista.includes(juego) ? lista.filter((j) => j !== juego) : [...lista, juego];
  escribir('susto.favoritos', nueva);
  return nueva;
}

export const esDaltonico = (): boolean => leer('susto.daltonico', false);
export function ponerDaltonico(si: boolean) {
  escribir('susto.daltonico', si);
  document.body.classList.toggle('daltonico', si);
}
document.body.classList.toggle('daltonico', esDaltonico());

export const recorridoVisto = (): boolean => leer('susto.recorrido', false);
export const marcarRecorrido = (visto: boolean) => escribir('susto.recorrido', visto);

/** Avisos ya vistos en la campana, por su clave. Se guardan los últimos 300. */
export const avisosVistos = (): string[] => leer('susto.avisos', []);
export const marcarAvisos = (claves: string[]) => escribir('susto.avisos', [...new Set([...avisosVistos(), ...claves])].slice(-300));

/** Último puesto conocido en la tabla de hoy de cada juego, para avisar si alguien te supera. */
export const puestosVistos = (): Record<string, number> => leer('susto.puestos', {});
export const guardarPuestos = (p: Record<string, number>) => escribir('susto.puestos', p);
