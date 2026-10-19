// Clips: mientras se juega, el lienzo del juego se graba todo el rato con dos grabadoras desfasadas que se reinician
// cada 12 segundos. Así, al pedir un clip siempre hay una con entre 6 y 12 segundos de lo último que pasó.
// (Unir pedazos de video no sirve: cada grabación es un archivo completo por sí sola.) Nada sale del navegador.

const CICLO = 12000, DESFASE = 6000, CUADROS = 30, BITS = 2_500_000;

export interface Clips {
  /** Corta la grabadora que lleva más tiempo y entrega lo grabado (el video de los últimos segundos). */
  guardar(): Promise<{ blob: Blob; extension: string } | null>;
  detener(): void;
}

export function grabarClips(lienzo: HTMLCanvasElement): Clips | null {
  if (typeof MediaRecorder === 'undefined' || typeof lienzo.captureStream !== 'function') return null;
  const tipo = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  if (!tipo) return null;
  const extension = tipo.startsWith('video/mp4') ? 'mp4' : 'webm';
  let flujo: MediaStream;
  try { flujo = lienzo.captureStream(CUADROS); } catch { return null; }

  interface Ranura { rec: MediaRecorder | null; partes: Blob[]; desde: number; reloj: number; alCortar: ((b: Blob) => void) | null }
  const ranuras: Ranura[] = [0, 1].map(() => ({ rec: null, partes: [], desde: 0, reloj: 0, alCortar: null }));
  let vivo = true;

  const partir = (r: Ranura) => {
    if (!vivo) return;
    try {
      const rec = new MediaRecorder(flujo, { mimeType: tipo, videoBitsPerSecond: BITS });
      r.rec = rec; r.partes = []; r.desde = performance.now();
      rec.ondataavailable = (ev) => { if (ev.data.size) r.partes.push(ev.data); };
      rec.onstop = () => {
        const listo = r.alCortar; r.alCortar = null;
        if (listo) listo(new Blob(r.partes, { type: tipo }));
        partir(r);
      };
      rec.start(1000);
      clearTimeout(r.reloj);
      r.reloj = window.setTimeout(() => { if (r.rec?.state === 'recording') r.rec.stop(); }, CICLO);
    } catch { r.rec = null; }
  };
  partir(ranuras[0]);
  const segunda = window.setTimeout(() => partir(ranuras[1]), DESFASE);

  return {
    guardar() {
      const activas = ranuras.filter((r) => r.rec?.state === 'recording').sort((a, b) => a.desde - b.desde);
      const r = activas[0];
      if (!r || !r.rec) return Promise.resolve(null);
      return new Promise((listo) => {
        r.alCortar = (blob) => listo(blob.size ? { blob, extension } : null);
        clearTimeout(r.reloj);
        r.rec!.stop();
      });
    },
    detener() {
      vivo = false;
      clearTimeout(segunda);
      for (const r of ranuras) { clearTimeout(r.reloj); r.alCortar = null; if (r.rec?.state === 'recording') r.rec.stop(); }
      flujo.getTracks().forEach((t) => t.stop());
    },
  };
}

/** Entrega el clip: en celular abre "Compartir" (para mandarlo directo a Discord); en computador lo descarga. */
export async function entregarClip(blob: Blob, nombre: string): Promise<'compartido' | 'descargado'> {
  const archivo = new File([blob], nombre, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (matchMedia('(hover: none)').matches && nav.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: 'Las Sustolimpiadas' }); return 'compartido'; } catch { /* canceló: se descarga */ }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'descargado';
}
