// Gachapón · Edge Function de Supabase (Deno). Calcula en el servidor el nivel del pase, los logros, las misiones del día,
// los duelos ganados y los plenos de TSUKIBET de quien la llama, y acredita lo que le corresponde (protogemas y deseos).
// Cada recompensa tiene un motivo único en gacha_movimientos: aunque se llame mil veces, se cobra una sola vez.
// Acciones: { accion: 'estado' } (mira sin cobrar) y { accion: 'reclamar' } (cobra lo pendiente).
// Se despliega con: npx supabase functions deploy gachapon --no-verify-jwt --use-api --project-ref glkoujvomcnpqdpakbxa
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { ECONOMIA, MISIONES } from '../_shared/gachapon.ts';
import { clavePareja, puntuar, resultadosCruce } from '../_shared/tsukibet.ts';
import { CRUCES, calendarioDeEquipos } from '../_shared/calendario.ts';
import { CLAVES, experiencia, logros, type Datos, type Marca } from '../../../src/juegos/progresoBase.ts';
import { JUEGOS } from '../../../src/juegos/catalogo.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fechaChile = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
/** Azar con semilla (mulberry32 sobre un hash): las misiones del día salen siempre iguales para la misma persona. */
function azar(semilla: string) {
  let h = 1779033703 ^ semilla.length;
  for (let i = 0; i < semilla.length; i++) { h = Math.imul(h ^ semilla.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quien } = await db.auth.getUser(jwt);
  const yo = quien?.user?.id;
  if (!yo) return json({ error: 'Hay que entrar con Discord.' }, 401);
  const { accion } = await req.json().catch(() => ({})) as { accion?: string };
  const ahora = Date.now(), hoy = fechaChile(ahora);

  // ── Datos de la persona ──
  const columnas = ['juego', 'puntaje', 'fecha', 'creado', ...CLAVES.map((k) => `${k}:detalle->${k}`)].join(',');
  const [marcasR, enfR, miembrosR, equiposR, ausR, tsukiR, declR, rondasR, votosR, edicionesR, misionesR, movR, billR] = await Promise.all([
    db.from('marcas').select(columnas).eq('perfil_id', yo).order('creado', { ascending: false }).limit(3000),
    db.from('enfrentamientos').select('id,modo,estado,ganador,oficial,cruce,a_perfil,b_perfil,a_equipo,b_equipo,creado,rondas').limit(3000),
    db.from('equipo_miembros').select('perfil_id,equipo_id'),
    db.from('equipos').select('id'),
    db.from('ausencias').select('cruce,perfil_id,equipo_rival'),
    db.from('tsukibet').select('cruce,perfil_id,equipo_a,equipo_b,ganador'),
    db.from('declaraciones').select('enfrentamiento_id,creado').eq('perfil_id', yo),
    db.from('enfrentamiento_marcas').select('enfrentamiento_id,creado,terminado').eq('perfil_id', yo),
    db.from('diario_votos').select('cruce,creado').eq('perfil_id', yo),
    db.from('diario_ediciones').select('cruce').eq('estado', 'publicado'),
    db.from('gacha_misiones').select('ids').eq('perfil_id', yo).eq('fecha', hoy).maybeSingle(),
    db.from('gacha_movimientos').select('motivo').eq('perfil_id', yo).limit(5000),
    db.from('gacha_billetera').select('protogemas,deseos,polvo').eq('perfil_id', yo).maybeSingle(),
  ]);
  if (movR.error) return json({ error: 'El Gachapón todavía no está activado en la base de datos.' }, 503);
  const marcas: Marca[] = ((marcasR.data ?? []) as Record<string, unknown>[]).map((f) => {
    const d: Marca['d'] = {};
    for (const k of CLAVES) if (f[k] !== null && f[k] !== undefined) d[k] = f[k];
    return { juego: f.juego as string, puntaje: f.puntaje as number, fecha: f.fecha as string, creado: f.creado as string, d };
  });
  const miembros = (miembrosR.data ?? []) as { perfil_id: string; equipo_id: number }[];
  const equipoDe = (id: string) => miembros.find((m) => m.perfil_id === id)?.equipo_id ?? null;
  const miEquipo = equipoDe(yo);
  const enf = (enfR.data ?? []) as any[];
  const duelos = enf.map((e) => ({ e, lado: (e.modo === '1v1' ? (e.a_perfil === yo ? 'a' : e.b_perfil === yo ? 'b' : null) : miEquipo != null && e.a_equipo === miEquipo ? 'a' : miEquipo != null && e.b_equipo === miEquipo ? 'b' : null) as 'a' | 'b' | null }))
    .filter((x): x is { e: any; lado: 'a' | 'b' } => x.lado !== null);
  const datos: Datos = { id: yo, nombre: '', marcas, duelos };
  const lista = logros(datos), ganados = lista.filter((l) => l.tiene);
  const xp = experiencia(datos, ganados.length);

  // ── Lo que le corresponde (motivo → recompensa) ──
  const esperado = new Map<string, { protogemas?: number; deseos?: number; texto: string }>();
  esperado.set('bienvenida', { deseos: ECONOMIA.bienvenidaDeseos, texto: 'Regalo de inauguración' });
  for (let n = 2; n <= xp.nivel; n++) esperado.set(`nivel-${n}`, { protogemas: n % 5 === 0 ? ECONOMIA.nivelHito : ECONOMIA.nivel, texto: `Subiste al nivel ${n}` });
  for (const l of ganados) esperado.set(`logro-${l.id}`, { protogemas: ECONOMIA.logro[l.categoria] ?? 100, texto: `Logro: ${l.nombre}` });
  for (const { e, lado } of duelos) if (e.oficial && e.estado === 'cerrado' && e.ganador === lado) esperado.set(`duelo-${e.id}`, { deseos: ECONOMIA.dueloGanadoDeseos, texto: 'Ganaste un duelo oficial' });
  // TSUKIBET: 40 por acierto y 5 deseos por pleno (solo cuando el cruce ya terminó entero)
  const picks = ((tsukiR.data ?? []) as any[]).map((t) => ({ cruce: t.cruce, perfil: t.perfil_id, a: Number(t.equipo_a), b: Number(t.equipo_b), ganador: Number(t.ganador), marcador: null }));
  for (const c of CRUCES.filter((x) => x.desde <= hoy && picks.some((p) => p.cruce === x.n && p.perfil === yo))) {
    const res = resultadosCruce(c.n, enf.map((e) => ({ cruce: e.cruce, a: e.a_perfil, b: e.b_perfil, ganador: e.ganador, estado: e.estado })), ((ausR.data ?? []) as any[]).map((x) => ({ cruce: x.cruce, perfil: x.perfil_id, equipoRival: x.equipo_rival })), equipoDe);
    for (const p of picks.filter((x) => x.cruce === c.n && x.perfil === yo)) {
      const r = res.get(clavePareja(p.a, p.b));
      if (r?.terminado && r.ganador === p.ganador) esperado.set(`tsuki-${c.n}-${clavePareja(p.a, p.b)}`, { protogemas: ECONOMIA.aciertoTsukibet, texto: `Acierto en TSUKIBET (cruce ${c.n})` });
    }
    const todos = [...res.values()].every((r) => r.terminado);
    const mia = puntuar(picks.filter((x) => x.cruce === c.n), res).find((t) => t.perfil === yo);
    if (c.hasta < hoy && todos && mia?.perfecto) esperado.set(`pleno-${c.n}`, { deseos: ECONOMIA.plenoDeseos, texto: `PLENO en TSUKIBET (cruce ${c.n})` });
  }

  // ── Misiones del día: se eligen una vez (y quedan guardadas) entre las que se pueden hacer hoy ──
  const deHoy = marcas.filter((m) => m.fecha === hoy);
  const pendientes = duelos.filter((x) => x.e.estado === 'pendiente' && x.e.modo === '1v1');
  const abierto = CRUCES.find((c) => c.desde > hoy && Date.parse(c.desde) - Date.parse(hoy) <= 7 * 864e5);
  const misPicks = abierto ? picks.filter((p) => p.cruce === abierto.n && p.perfil === yo).length : 0;
  const declaradas = new Set(((declR.data ?? []) as any[]).map((d) => Number(d.enfrentamiento_id)));
  const empezadas = new Set(((rondasR.data ?? []) as any[]).map((r) => Number(r.enfrentamiento_id)));
  const votadas = new Set(((votosR.data ?? []) as any[]).map((v) => v.cruce));
  const r = azar(`misiones|${hoy}|${yo}`), juegosListos = JUEGOS.filter((j) => j.listo);
  const juegoDia = juegosListos[Math.floor(azar(`juego|${hoy}`)() * juegosListos.length)];
  let ids = (misionesR.data?.ids as string[] | undefined) ?? null;
  if (!ids) {
    const extra = ['partidas-8', 'juegos-2', 'mejor-marca'];
    if (pendientes.some((x) => x.e.rondas > 0)) extra.push('ronda-duelo', 'ronda-duelo');
    if (abierto && misPicks < 3) extra.push('tsukibet', 'tsukibet');
    if (pendientes.some((x) => !declaradas.has(x.e.id) && !empezadas.has(x.e.id))) extra.push('declara');
    if (((edicionesR.data ?? []) as any[]).some((e) => !votadas.has(e.cruce))) extra.push('vota-cuarta');
    const elegidas: string[] = [];
    while (elegidas.length < ECONOMIA.misionesPorDia - 2 && extra.length) { const k = extra.splice(Math.floor(r() * extra.length), 1)[0]; if (!elegidas.includes(k)) elegidas.push(k); }
    ids = ['partidas-3', `juego-dia:${juegoDia?.id ?? 'tren'}`, ...elegidas];
    await db.from('gacha_misiones').upsert({ perfil_id: yo, fecha: hoy, ids });
  }
  const mejorAntes = new Map<string, number>();
  for (const m of marcas.filter((x) => x.fecha < hoy)) mejorAntes.set(m.juego, Math.max(mejorAntes.get(m.juego) ?? 0, m.puntaje));
  const hecha = (id: string): [number, number] => {
    const [tipo, extra] = id.split(':');
    switch (tipo) {
      case 'partidas-3': return [Math.min(3, deHoy.length), 3];
      case 'partidas-8': return [Math.min(8, deHoy.length), 8];
      case 'juegos-2': return [Math.min(2, new Set(deHoy.map((m) => m.juego)).size), 2];
      case 'juego-dia': return [deHoy.some((m) => m.juego === extra) ? 1 : 0, 1];
      case 'mejor-marca': return [deHoy.some((m) => mejorAntes.has(m.juego) && m.puntaje > mejorAntes.get(m.juego)!) ? 1 : 0, 1];
      case 'ronda-duelo': return [((rondasR.data ?? []) as any[]).some((x) => fechaChile(Date.parse(x.creado)) === hoy) ? 1 : 0, 1];
      case 'tsukibet': return [Math.min(3, misPicks), 3];
      case 'declara': return [((declR.data ?? []) as any[]).some((x) => fechaChile(Date.parse(x.creado)) === hoy) ? 1 : 0, 1];
      case 'vota-cuarta': return [((votosR.data ?? []) as any[]).some((x) => fechaChile(Date.parse(x.creado)) === hoy) ? 1 : 0, 1];
      default: return [0, 1];
    }
  };
  const misiones = ids.map((id) => {
    const [va, meta] = hecha(id), [tipo, extra] = id.split(':');
    const texto = (MISIONES[tipo] ?? id).replace('{juego}', JUEGOS.find((j) => j.id === extra)?.nombre ?? extra ?? '');
    if (va >= meta) esperado.set(`mision-${hoy}-${id}`, { protogemas: ECONOMIA.mision, texto: `Misión: ${texto}` });
    return { id, texto, va, meta, hecha: va >= meta, protogemas: ECONOMIA.mision };
  });
  if (misiones.every((m) => m.hecha)) esperado.set(`misiones-${hoy}`, { protogemas: ECONOMIA.bonoMisiones, texto: 'Todas las misiones del día' });

  // ── Cobrar ──
  const cobrados = new Set(((movR.data ?? []) as { motivo: string }[]).map((m) => m.motivo));
  const porCobrar = [...esperado].filter(([motivo]) => !cobrados.has(motivo)).map(([motivo, v]) => ({ motivo, ...v }));
  let cobrado: typeof porCobrar = [];
  if (accion === 'reclamar' && porCobrar.length) {
    const { data, error } = await db.from('gacha_movimientos').upsert(porCobrar.map((p) => ({ perfil_id: yo, motivo: p.motivo, protogemas: p.protogemas ?? 0, deseos: p.deseos ?? 0 })), { onConflict: 'perfil_id,motivo', ignoreDuplicates: true }).select('motivo');
    if (error) return json({ error: `No se pudo cobrar: ${error.message}` }, 500);
    const entraron = new Set(((data ?? []) as { motivo: string }[]).map((m) => m.motivo));
    cobrado = porCobrar.filter((p) => entraron.has(p.motivo));
  }
  // El nivel que se muestra en la lista de miembros lo pone siempre el servidor
  await db.from('gacha_vitrina').upsert({ perfil_id: yo, nivel: xp.nivel, xp: xp.total, actualizado: new Date().toISOString() }, { onConflict: 'perfil_id' });
  const { data: billetera } = accion === 'reclamar' ? await db.from('gacha_billetera').select('protogemas,deseos,polvo').eq('perfil_id', yo).maybeSingle() : billR;
  const yaCobrados = new Set([...cobrados, ...cobrado.map((c) => c.motivo)]);
  return json({
    nivel: xp.nivel, xp: xp.total, enNivel: xp.enNivel, paraSubir: xp.paraSubir,
    billetera: billetera ?? { protogemas: 0, deseos: 0, polvo: 0 },
    misiones: misiones.map((m) => ({ ...m, cobrada: yaCobrados.has(`mision-${hoy}-${m.id}`) })),
    bonoMisiones: { protogemas: ECONOMIA.bonoMisiones, cobrado: yaCobrados.has(`misiones-${hoy}`) },
    porCobrar: accion === 'reclamar' ? porCobrar.filter((p) => !yaCobrados.has(p.motivo)) : porCobrar,
    cobrado,
  });
});
