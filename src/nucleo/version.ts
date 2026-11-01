// Cada publicación lleva un número de versión (vite.config.ts lo escribe en version.json y en el código).
// Antes de empezar un intento de duelo, y al cambiar de pantalla, se compara con el publicado: si hay uno más nuevo,
// la página se recarga. Así nadie juega un duelo con una versión vieja que tenía errores ya arreglados
// (Dai jugó Horda con la pestaña abierta desde antes del arreglo, 2026-10-31).
declare const __VERSION__: string;

export async function hayVersionNueva(): Promise<boolean> {
  if (import.meta.env.DEV) return false;
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const { v } = (await r.json()) as { v?: string };
    return !!v && v !== __VERSION__;
  } catch { return false; } // sin conexión: se sigue con la que hay
}
