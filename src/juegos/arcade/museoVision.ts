// Visión de Golpe Maestro (guardias y cámaras), sin dependencias para poder probarla con `node`.
// Una sola regla para lo que se dibuja y lo que se decide: el rayo avanza celda por celda (sin saltos) y se corta en
// el primer muro que toca, incluso si solo roza una esquina. Antes se revisaba la línea a saltos de 0,25 y se colaba por
// las esquinas de los muros (reporte de Infinite, 11-11).

export const COLS = 18, FILAS = 12, CELDA = 1.2, AN = COLS * CELDA, FO = FILAS * CELDA;
export const centro = (cx: number, cz: number) => ({ x: -AN / 2 + (cx + 0.5) * CELDA, z: -FO / 2 + (cz + 0.5) * CELDA });
export const celda = (x: number, z: number): [number, number] => [Math.floor((x + AN / 2) / CELDA), Math.floor((z + FO / 2) / CELDA)];

const EPS = 1e-9;

export function crearVision(solido: (cx: number, cz: number) => boolean) {
  /** Distancia desde (x, z) en la dirección (dx, dz) (unitaria) hasta el primer muro, o `max` si no hay ninguno antes. */
  function rayo(x: number, z: number, dx: number, dz: number, max: number) {
    let [ix, iz] = celda(x, z);
    if (solido(ix, iz)) return 0;
    const pasoX = dx > 0 ? 1 : -1, pasoZ = dz > 0 ? 1 : -1;
    const bordeX = -AN / 2 + (ix + (pasoX > 0 ? 1 : 0)) * CELDA, bordeZ = -FO / 2 + (iz + (pasoZ > 0 ? 1 : 0)) * CELDA;
    let tX = dx !== 0 ? (bordeX - x) / dx : Infinity, tZ = dz !== 0 ? (bordeZ - z) / dz : Infinity;
    const dtX = dx !== 0 ? CELDA / Math.abs(dx) : Infinity, dtZ = dz !== 0 ? CELDA / Math.abs(dz) : Infinity;
    for (;;) {
      const t = Math.min(tX, tZ);
      if (t >= max) return max;
      if (Math.abs(tX - tZ) < EPS) {
        // Pasa justo por una esquina: tocar cualquiera de las tres celdas vecinas ya corta la vista
        if (solido(ix + pasoX, iz) || solido(ix, iz + pasoZ) || solido(ix + pasoX, iz + pasoZ)) return t;
        ix += pasoX; iz += pasoZ; tX += dtX; tZ += dtZ;
      } else if (tX < tZ) { ix += pasoX; if (solido(ix, iz)) return t; tX += dtX; }
      else { iz += pasoZ; if (solido(ix, iz)) return t; tZ += dtZ; }
    }
  }
  /** Distancia desde (x, z) mirando hacia `ang` (como atan2(dx, dz)) hasta el primer muro, tope `max`. */
  const alcance = (x: number, z: number, ang: number, max: number) => rayo(x, z, Math.sin(ang), Math.cos(ang), max);
  /** `b` se ve desde `a` si el rayo llega hasta `b` sin tocar ningún muro. */
  const aLaVista = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < EPS) return true;
    return rayo(a.x, a.z, (b.x - a.x) / d, (b.z - a.z) / d, d) >= d - EPS;
  };
  return { aLaVista, alcance };
}
