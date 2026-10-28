import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../nucleo/supabase';
import { objeto, type Objeto, type Pieza } from '../../supabase/functions/_shared/gachapon.ts';

// Cómo se ven los objetos del Gachapón: marco del avatar, aura en línea, placa y color del nombre, emblema, título,
// portada del perfil y burbuja de las declaraciones. Todo es CSS y SVG propio (sin imágenes de nadie): cada objeto trae
// sus colores (--x1..--x3) y su estilo, y estilos.css hace el resto (clases gx-*).

export interface VitrinaG { perfil_id: string; nivel: number; marco: string | null; placa: string | null; tinta: string | null; portada: string | null; emblema: string | null; titulo: string | null; aura: string | null; burbuja: string | null }
export const PIEZAS: { pieza: Pieza; nombre: string }[] = [
  { pieza: 'marco', nombre: 'Marco del avatar' }, { pieza: 'aura', nombre: 'Aura en línea' }, { pieza: 'tinta', nombre: 'Color del nombre' },
  { pieza: 'placa', nombre: 'Placa del nombre' }, { pieza: 'emblema', nombre: 'Emblema' }, { pieza: 'titulo', nombre: 'Título' },
  { pieza: 'portada', nombre: 'Portada del perfil' }, { pieza: 'burbuja', nombre: 'Burbuja de declaración' },
];
export const COLOR_RAREZA: Record<number, string> = { 3: '#5aa9ff', 4: '#b36bff', 5: '#ffcf4a' };
/** El símbolo de cada conjunto de 5★ (caracteres de texto, no emojis). */
const SIMBOLO: Record<string, string> = { luna: '☾', abismo: '◈', kitsune: '✿', corona: '♛', nebula: '✦', fenix: '✺', boreal: '✧', bosque: '❦', neon: 'ϟ' };

// ───────── Las vitrinas de todos (se piden una vez y se refrescan cada 2 minutos) ─────────
let cache: { cuando: number; datos: Promise<Map<string, VitrinaG>> } | null = null;
export function vitrinasGacha(fresca = false): Promise<Map<string, VitrinaG>> {
  if (!fresca && cache && Date.now() - cache.cuando < 120_000) return cache.datos;
  const datos = (async () => {
    const { data } = await supabase.from('gacha_vitrina').select('perfil_id,nivel,marco,placa,tinta,portada,emblema,titulo,aura,burbuja');
    return new Map(((data ?? []) as VitrinaG[]).map((v) => [v.perfil_id, v]));
  })();
  cache = { cuando: Date.now(), datos };
  return datos;
}
export function useVitrinasGacha(): Map<string, VitrinaG> {
  const [m, setM] = useState<Map<string, VitrinaG>>(new Map());
  useEffect(() => {
    let vivo = true;
    const traer = (fresca = false) => vitrinasGacha(fresca).then((x) => { if (vivo) setM(x); });
    traer();
    const r = setInterval(() => traer(true), 120_000);
    const alCambiar = () => traer(true);
    window.addEventListener('gacha-vitrina', alCambiar);
    return () => { vivo = false; clearInterval(r); window.removeEventListener('gacha-vitrina', alCambiar); };
  }, []);
  return m;
}
/** Avisar a toda la página que alguien cambió lo que lleva puesto. */
export const avisarVitrina = () => { cache = null; window.dispatchEvent(new Event('gacha-vitrina')); };

const vars = (o: Objeto | null, p: string) => (o ? `--${p}1:${o.c[0]};--${p}2:${o.c[1]};--${p}3:${o.c[2]};` : '');
const estiloDe = (o: Objeto | null) => (o ? (o.rareza === 5 ? `leyenda gx-${o.estilo}` : o.estilo) : '');

// ───────── Emblemas (SVG propios) ─────────
const ICONOS: Record<string, string> = {
  estrella: 'M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z',
  luna: 'M15 2a10 10 0 1 0 7 17A8 8 0 0 1 15 2z',
  rayo: 'M13 2L4 14h7l-1 8 9-12h-7z',
  corazon: 'M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z',
  calavera: 'M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v4h10v-4c1.5-1 3-3 3-6a8 8 0 0 0-8-8zM7.5 11a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0zM13.3 11a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0z',
  diamante: 'M6 3h12l4 6-10 12L2 9z',
  llama: 'M12 2s6 5 6 11a6 6 0 0 1-12 0c0-3 2-5 2-5s0 3 2 4c0-4 2-7 2-10z',
  hoja: 'M20 4C9 4 4 10 4 17c0 1 0 2 .5 3C6 14 10 10 16 8c-5 3-8 7-9.5 12.5C17 20 20 12 20 4z',
  corona: 'M3 18h18l-1.5-10-4.5 4-3-6-3 6-4.5-4zM3 20h18v2H3z',
  ojo: 'M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
  ola: 'M2 13c2.5 0 3-3 5-3s2.5 3 5 3 3-3 5-3 2.5 3 5 3v8H2z',
  flor: 'M12 3a3 3 0 0 1 3 3 3 3 0 0 1 3 3 3 3 0 0 1-1 2.2A3 3 0 0 1 15 17a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-2-5.8A3 3 0 0 1 6 9a3 3 0 0 1 3-3 3 3 0 0 1 3-3zm0 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  copo: 'M11 2h2v5l3-2 1 1.7-4 2.6v2.4l2-1.2 1 1.7-3 1.8 3 1.8-1 1.7-2-1.2v2.4l4 2.6-1 1.7-3-2v5h-2v-5l-3 2-1-1.7 4-2.6v-2.4l-2 1.2-1-1.7 3-1.8-3-1.8 1-1.7 2 1.2V9.3L7 6.7 8 5l3 2z',
};
export function Emblema({ o, tam = 16 }: { o: Objeto | null; tam?: number }) {
  if (!o?.icono || !ICONOS[o.icono]) return null;
  return <svg class={`gx-emblema${o.rareza === 5 ? ' leyenda' : ''}`} viewBox="0 0 24 24" width={tam} height={tam} style={`--e1:${o.c[0]}`} aria-hidden="true"><path d={ICONOS[o.icono]} fill-rule="evenodd" /></svg>;
}

// ───────── Avatar con marco y aura ─────────
export function Avatar({ v, enLinea = false, children, tam = 34 }: { v: Partial<VitrinaG> | null | undefined; enLinea?: boolean; children: ComponentChildren; tam?: number }) {
  const m = objeto(v?.marco), a = enLinea ? objeto(v?.aura) : null;
  if (!m && !a) return <>{children}</>;
  return (
    <span class={`gx-avatar${m ? ` gx-marco gx-m-${estiloDe(m)}` : ''}${a ? ` gx-aura gx-a-${estiloDe(a)}` : ''}`} style={`${vars(m, 'm')}${vars(a, 'a')}--tam:${tam}px`}>
      {children}
      {m?.rareza === 5 && <i class="gx-orbe" aria-hidden="true">{SIMBOLO[m.estilo] ?? '✦'}</i>}
    </span>
  );
}

// ───────── Nombre con color, placa, emblema y título ─────────
export function Nombre({ v, nombre, titulo = false, extra }: { v: Partial<VitrinaG> | null | undefined; nombre: string; titulo?: boolean; extra?: string }) {
  const t = objeto(v?.tinta), p = objeto(v?.placa), e = objeto(v?.emblema), ti = titulo ? objeto(v?.titulo) : null;
  return (
    <span class={`gx-firma${p ? ` gx-placa gx-p-${estiloDe(p)}` : ''}`} style={`${vars(p, 'p')}${vars(t, 't')}`}>
      <span class="gx-linea">
        <span class={t ? `gx-tinta gx-t-${estiloDe(t)}` : ''}>{nombre}</span>{extra}
        <Emblema o={e} />
      </span>
      {ti?.texto && <small class={`gx-titulo r${ti.rareza}`}>{ti.texto}</small>}
    </span>
  );
}

// ───────── Portada del perfil ─────────
export function Portada({ id, children }: { id: string | null | undefined; children?: ComponentChildren }) {
  const o = objeto(id);
  return (
    <div class={`gx-portada${o ? ` gx-b-${estiloDe(o)}` : ' gx-b-vacia'}`} style={vars(o, 'b')}>
      {o?.rareza === 5 && <span class="gx-lluvia" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={`--i:${i}`}>{SIMBOLO[o.estilo] ?? '✦'}</i>)}</span>}
      {children}
    </div>
  );
}

/** Clases y variables de la burbuja de declaración de alguien. */
export function burbuja(v: Partial<VitrinaG> | null | undefined): { class: string; style: string } {
  const o = objeto(v?.burbuja);
  return o ? { class: ` gx-burbuja gx-u-${estiloDe(o)}`, style: vars(o, 'u') } : { class: '', style: '' };
}

/** Cómo se ve un objeto solo (para el Gachapón, la colección y el resultado de una tirada). */
export function Muestra({ o, nombre = 'Tu nombre', cara }: { o: Objeto; nombre?: string; cara?: ComponentChildren }) {
  const avatar = cara ?? <span class="gx-cara-muestra" aria-hidden="true" />;
  if (o.rareza === 5) {
    const v = { marco: o.id, aura: o.id, tinta: o.id, placa: o.id, emblema: o.id, titulo: o.id };
    return (
      <Portada id={o.id}>
        <span class="gx-muestra-perfil"><Avatar v={v} enLinea tam={64}>{avatar}</Avatar><Nombre v={v} nombre={nombre} titulo /></span>
      </Portada>
    );
  }
  const pieza = o.piezas[0];
  const v = { [pieza]: o.id } as Partial<VitrinaG>;
  if (pieza === 'portada') return <Portada id={o.id} />;
  if (pieza === 'marco' || pieza === 'aura') return <span class="gx-muestra"><Avatar v={v} enLinea tam={56}>{avatar}</Avatar></span>;
  if (pieza === 'burbuja') { const b = burbuja(v); return <p class={`declaracion${b.class}`} style={b.style}>«Este duelo es mío»</p>; }
  if (pieza === 'emblema') return <span class="gx-muestra"><Emblema o={o} tam={44} /></span>;
  return <span class="gx-muestra"><Nombre v={v} nombre={nombre} titulo={pieza === 'titulo'} /></span>;
}
