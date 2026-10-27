// El Susto Diario · Edge Function de Supabase (Deno).
// La llama la base (pg_net) al terminar un cruce, o la Mesa con el botón "Generar borrador" / "Publicar".
// 1) Junta los datos del cruce con la llave de servicio. 2) Redacta la edición (periodista.ts). 3) Dibuja las cuatro
// páginas (portadas.ts) con Satori y resvg. 4) Las guarda en el bucket público "diario". 5) Guarda la edición en
// diario_ediciones. 6) Si se pide publicar, la manda al canal del Diario por su webhook (secretos.discord_webhook_diario).
// Seguridad: solo responde si trae la clave x-diario-clave que vive en secretos.diario_clave (nadie más la conoce).
// Se despliega con: npx supabase functions deploy diario --no-verify-jwt --project-ref glkoujvomcnpqdpakbxa
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import satori from 'npm:satori@0.10.14';
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2';
import { mensajeDiscord, redactar, type Datos } from '../_shared/periodista.ts';
import { FUENTES, paginas } from '../_shared/portadas.ts';

const WEB = 'https://panchoso3234.github.io/sustolimpiadas/';
let wasm: Promise<void> | null = null;
let fuentes: Promise<{ name: string; weight: 400 | 800; style: 'normal'; data: ArrayBuffer }[]> | null = null;
const preparar = () => {
  wasm ??= initWasm(fetch('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm'));
  fuentes ??= Promise.all(FUENTES.map(async (f) => ({ name: f.name, weight: f.weight, style: 'normal' as const, data: await (await fetch(f.url)).arrayBuffer() })));
  return Promise.all([wasm, fuentes]);
};
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: secretos } = await db.from('secretos').select('clave, valor').in('clave', ['diario_clave', 'discord_webhook_diario']);
  const secreto = (k: string) => secretos?.find((s) => s.clave === k)?.valor as string | undefined;
  if (!secreto('diario_clave') || req.headers.get('x-diario-clave') !== secreto('diario_clave')) return json({ error: 'no autorizado' }, 401);
  const pedido = await req.json().catch(() => ({})) as { cruce?: number; publicar?: boolean };
  const cruce = Number(pedido.cruce);
  if (!Number.isInteger(cruce) || cruce < 1 || cruce > 30) return json({ error: 'cruce inválido' }, 400);

  // ── 1. Los datos ──
  const todas = async <T,>(tabla: string, columnas: string, filtro?: (q: any) => any): Promise<T[]> => {
    let salida: T[] = [];
    for (let desde = 0; ; desde += 1000) {
      let q = db.from(tabla).select(columnas).range(desde, desde + 999);
      if (filtro) q = filtro(q);
      const { data, error } = await q;
      if (error) throw new Error(`${tabla}: ${error.message}`);
      salida = salida.concat((data ?? []) as T[]);
      if (!data || data.length < 1000) return salida;
    }
  };
  const [per, eq, mi, enf, aus, nom, ajustes] = await Promise.all([
    todas<any>('perfiles', 'id,nombre,avatar_url'), todas<any>('equipos', 'id,nombre,capitan'), todas<any>('equipo_miembros', 'perfil_id,equipo_id'),
    todas<any>('enfrentamientos', 'id,juego,estado,cruce,a_perfil,b_perfil,ganador,puntos_a,puntos_b,no_jugo,muerte_subita,jornada', (q) => q.eq('oficial', true).eq('modo', '1v1').not('cruce', 'is', null)),
    todas<any>('ausencias', 'cruce,jornada,perfil_id,equipo_rival,ausente'), todas<any>('nombres_juegos', 'id,nombre'),
    db.from('ajustes').select('valor').eq('clave', 'puntos').maybeSingle().then((r) => r.data?.valor ?? {}),
  ]);
  const rondas = enf.length ? await todas<any>('enfrentamiento_marcas', 'enfrentamiento_id,ronda,lado,puntaje,terminado', (q) => q.in('enfrentamiento_id', enf.filter((e: any) => e.cruce <= cruce).map((e: any) => e.id))) : [];
  const { CRUCES } = await import('../_shared/calendario.ts');
  const fechas = CRUCES.find((c) => c.n === cruce);
  if (!fechas) return json({ error: 'cruce sin fechas' }, 400);
  const [marcasCruce, previas] = await Promise.all([
    todas<any>('marcas', 'perfil_id,juego,puntaje,fecha', (q) => q.gte('fecha', fechas.desde).lte('fecha', fechas.hasta)),
    todas<any>('marcas', 'juego,puntaje', (q) => q.lt('fecha', fechas.desde)),
  ]);
  const mejorPrevio: Record<string, number> = {};
  for (const m of previas) mejorPrevio[m.juego] = Math.max(mejorPrevio[m.juego] ?? 0, m.puntaje);
  const p = ajustes as Record<string, unknown>, num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
  const datos: Datos = {
    cruce, numero: cruce,
    personas: per.map((x: any) => ({ id: x.id, nombre: x.nombre, avatar: x.avatar_url })),
    equipos: eq.map((q: any) => ({ id: q.id, nombre: q.nombre, capitan: q.capitan, miembros: mi.filter((m: any) => m.equipo_id === q.id).map((m: any) => m.perfil_id) })),
    duelos: enf.map((e: any) => ({ id: e.id, cruce: e.cruce, juego: e.juego, a: e.a_perfil, b: e.b_perfil, ganador: e.ganador, estado: e.estado, puntosA: e.puntos_a, puntosB: e.puntos_b, noJugo: e.no_jugo, muerteSubita: e.muerte_subita ?? 0, jornada: e.jornada, rondas: rondas.filter((r: any) => r.enfrentamiento_id === e.id).map((r: any) => ({ ronda: r.ronda, lado: r.lado, puntaje: r.puntaje, terminado: r.terminado })) })),
    ausencias: aus.map((a: any) => ({ cruce: a.cruce, jornada: a.jornada, perfil: a.perfil_id, equipoRival: a.equipo_rival, ausente: a.ausente })),
    marcasCruce: marcasCruce.map((m: any) => ({ perfil: m.perfil_id, juego: m.juego, puntaje: m.puntaje, fecha: m.fecha })), mejorPrevio,
    juegos: Object.fromEntries(nom.map((x: any) => [x.id, x.nombre])),
    puntos: { victoria: num(p.victoria, 7), empate: num(p.empate, 6), derrota: num(p.derrota, 4), multiplicadores: Array.isArray(p.multiplicadores) ? (p.multiplicadores as number[]) : [1, 1.25, 1.5, 2] },
  };

  // ── 2 y 3. Redactar y dibujar ──
  const edicion = redactar(datos);
  const [, fts] = await preparar();
  const imagenes: string[] = [], version = Date.now();
  for (const pag of paginas(edicion)) {
    const svg = await satori(pag.arbol as any, { width: pag.ancho, height: pag.alto, fonts: fts });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: pag.ancho } }).render().asPng();
    const ruta = `cruce-${cruce}/${pag.nombre}.png`;
    const { error } = await db.storage.from('diario').upload(ruta, png, { contentType: 'image/png', upsert: true });
    if (error) return json({ error: `subir ${ruta}: ${error.message}` }, 500);
    imagenes.push(`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/diario/${ruta}?v=${version}`);
  }

  // ── 4. Guardar la edición ──
  const publicar = pedido.publicar === true, webhook = secreto('discord_webhook_diario');
  const { data: previa } = await db.from('diario_ediciones').select('estado').eq('cruce', cruce).maybeSingle();
  const estado = publicar || previa?.estado === 'publicado' ? 'publicado' : 'borrador';
  const { error: errGuardar } = await db.from('diario_ediciones').upsert({ cruce, numero: edicion.numero, estado, contenido: edicion, imagenes, actualizado: new Date().toISOString(), ...(publicar ? { publicado: new Date().toISOString() } : {}) });
  if (errGuardar) return json({ error: `guardar: ${errGuardar.message}` }, 500);

  // ── 5. Publicar en Discord: el texto y las cuatro páginas como galería ──
  let discord = 'no se pidió';
  if (publicar) {
    if (!webhook?.startsWith('https://discord.com/api/webhooks/')) discord = 'falta el webhook del Diario (secretos.discord_webhook_diario)';
    else {
      const enlace = `${WEB}#/diario/${cruce}`;
      const r = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: mensajeDiscord(edicion, enlace), embeds: imagenes.map((url) => ({ url: enlace, image: { url } })), allowed_mentions: { parse: [] } }) });
      discord = r.ok ? 'publicado' : `Discord respondió ${r.status}`;
    }
  }
  return json({ ok: true, cruce, estado, imagenes, discord, portada: edicion.portada.titular });
});
