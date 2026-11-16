// La tabla de posiciones como imagen · Edge Function de Supabase (Deno), 15-11.
// La llama la base (public.avisar_tabla, por pg_net) en el resumen de cada cruce, la tabla semanal y la revelación de
// Wild Cards. Dibuja la tabla (_shared/tabla.ts) con Satori + resvg, la sube al bucket público "diario" (carpeta tabla/)
// y publica en el canal pedido el texto del aviso con la imagen. Si algo falla, publica el texto con la tabla en texto
// (`respaldo`): nunca queda un aviso vacío. Con `probar: true` solo genera la imagen y devuelve su enlace (no publica).
// Seguridad: solo responde con la clave x-diario-clave (secretos.diario_clave), igual que el Diario.
// Se despliega con: npx supabase functions deploy tabla --no-verify-jwt --project-ref glkoujvomcnpqdpakbxa
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import satori from 'npm:satori@0.10.14';
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2';
import { FUENTES } from '../_shared/portadas.ts';
import { ANCHO, altoTabla, arbolTabla, type FilaTabla } from '../_shared/tabla.ts';
import { ALTOS, arbolTarjeta, cargarFotos, type Tarjeta } from '../_shared/tarjetas.ts';

let wasm: Promise<void> | null = null;
let fuentes: Promise<{ name: string; weight: 400 | 800; style: 'normal'; data: ArrayBuffer }[]> | null = null;
const preparar = () => {
  wasm ??= initWasm(fetch('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm'));
  fuentes ??= Promise.all(FUENTES.map(async (f) => ({ name: f.name, weight: f.weight, style: 'normal' as const, data: await (await fetch(f.url)).arrayBuffer() })));
  return Promise.all([wasm, fuentes]);
};
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

// Bot 2.0 (15-11): con `tipo` (duelo, record, mvp o cuenta) y `datos` dibuja esa tarjeta en vez de la tabla.
interface Pedido { texto?: string; canal?: string; titulo?: string; subtitulo?: string; filas?: FilaTabla[]; respaldo?: string; probar?: boolean; tipo?: Tarjeta['tipo']; datos?: unknown }

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const p = await req.json().catch(() => ({})) as Pedido;
  const canal = /^[a-z_-]{1,30}$/.test(p.canal ?? '') ? p.canal! : 'general';
  const { data: secretos } = await db.from('secretos').select('clave, valor').in('clave', ['diario_clave', `discord_webhook_${canal}`, 'discord_webhook']);
  const secreto = (k: string) => secretos?.find((s) => s.clave === k)?.valor as string | undefined;
  if (!secreto('diario_clave') || req.headers.get('x-diario-clave') !== secreto('diario_clave')) return json({ error: 'no autorizado' }, 401);
  const filas = (p.filas ?? []).filter((f) => Number.isFinite(f?.pos) && typeof f?.nombre === 'string').slice(0, 30);
  const texto = (p.texto ?? '').slice(0, 1990);

  // ── 1. La imagen ──
  let imagen: string | null = null, falla = '';
  try {
    const [, fts] = await preparar();
    let arbol: unknown, alto: number;
    if (p.tipo && p.tipo in ALTOS && p.datos && typeof p.datos === 'object') {
      const t = await cargarFotos({ tipo: p.tipo, datos: p.datos } as Tarjeta);
      arbol = arbolTarjeta(t); alto = ALTOS[p.tipo];
    } else {
      if (!filas.length) throw new Error('sin filas');
      arbol = arbolTabla({ titulo: p.titulo ?? 'Tabla de equipos', subtitulo: p.subtitulo, filas }); alto = altoTabla(filas.length);
    }
    const svg = await satori(arbol as any, { width: ANCHO, height: alto, fonts: fts });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: ANCHO } }).render().asPng();
    const ruta = `tabla/${p.tipo ?? "tabla"}-${Date.now()}.png`;
    const { error } = await db.storage.from('diario').upload(ruta, png, { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`subir: ${error.message}`);
    imagen = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/diario/${ruta}`;
  } catch (e) { falla = String((e as Error)?.message ?? e); }
  if (p.probar) return json({ ok: !!imagen, imagen, falla });

  // ── 2. Publicar: el texto con la imagen; si la imagen falló, el texto con la tabla en texto ──
  const webhook = secreto(`discord_webhook_${canal}`) ?? secreto('discord_webhook');
  if (!webhook?.startsWith('https://discord.com/api/webhooks/')) return json({ error: `falta el webhook del canal ${canal}` }, 500);
  const cuerpo = imagen
    ? { content: texto, embeds: [{ image: { url: imagen }, color: 0xffc83d }], allowed_mentions: { parse: ['users'] } }
    : { content: `${texto}\n\n${p.respaldo ?? ''}`.slice(0, 1990), allowed_mentions: { parse: ['users'] } };
  const r = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  return json({ ok: r.ok, imagen, falla, discord: r.status });
});
