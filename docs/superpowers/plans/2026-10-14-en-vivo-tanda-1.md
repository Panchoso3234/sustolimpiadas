# En vivo · Tanda 1 (base, Partidas en línea, Conchas y Balsas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la base del juego en vivo (conexión directa con respaldo, sala con asientos y espectadores 👁, pestaña Partidas en línea, salas oficiales que dan puntos) y pasar Cuatro Conchas y Batalla de Balsas a esa base.

**Architecture:** La sala usa un canal de Supabase Realtime solo para presencia (quién está, quién quiere jugar o mirar) y señalización. Los mensajes del juego van por WebRTC en estrella: el anfitrión se conecta directo con cada persona y reenvía; si una conexión directa no se logra, ese tráfico va por broadcast de Supabase. Los mensajes llevan un id para descartar duplicados. Un canal de presencia global (`vivo:salas`) lista las salas activas para la pestaña Partidas en línea. Las salas oficiales (`enf-<id>`) fijan los asientos según el enfrentamiento y guardan el resultado con las funciones de siempre (`empezar_ronda`/`terminar_ronda`).

**Tech Stack:** Vite 8 + TypeScript + Preact 11, Supabase Realtime (presencia y broadcast), WebRTC (`RTCPeerConnection`, `RTCDataChannel`), Edge sin ventana con CDP para las pruebas.

**Spec:** `docs/superpowers/specs/2026-10-14-en-vivo-1v1-design.md`

## Global Constraints
- Todo en español: textos, nombres de archivos y variables, comentarios (igual que el resto del código).
- Supabase gratis: 100 mensajes por segundo en todo el proyecto y 20 mensajes de presencia por segundo. Los datos del juego no pasan por Supabase, salvo como respaldo.
- STUN: `stun:stun.l.google.com:19302`. Sin TURN.
- Nada nuevo que ejecutar en Supabase (`supabase/esquema.sql` no cambia).
- Comprobar con `npx tsc --noEmit` y `npx vite build`; servidor de prueba en el puerto 5173 (`npm run dev`).
- No publicar (no hacer push) sin el visto bueno de Pancho.
- Las claves secretas nunca van en el código (aquí no hay ninguna nueva).
- Mismo estilo de código: líneas largas y densas, comentarios de una línea en español que explican el porqué.

## Review Focus
1. **Un espectador que entra antes que el segundo jugador** no debe quitarle el asiento: entrar por "Mirar" siempre deja mirando. (Task 2: prueba de asientos.)
2. **El anfitrión recarga la página a media partida:** la partida debe seguir y el enlace debe reconectarse con el nuevo anfitrión, sin mensajes duplicados. (Task 3: prueba de recarga.)
3. **Una red sin conexión directa:** con `?sinDirecto=1` en una pestaña, las jugadas igual deben llegar a todos. (Task 3: prueba de respaldo.)
4. **Sala oficial abierta por alguien que no es parte del enfrentamiento:** no se puede sentar; solo mira. (Task 2: prueba de asientos fijos.)
5. **Muchas pestañas de la misma persona:** cuenta una vez, en el ojo y en los asientos. (Task 2: prueba de persona duplicada.)

---

### Task 1: Banco de pruebas con varias pestañas

**Files:**
- Create: `pruebas/navegador.mjs`
- Create: `pruebas/vivo.mjs`

**Interfaces:**
- Produces: `abrir(url, {ancho, alto}) → Promise<Pagina>` con `pagina.js(expr)`, `pagina.foto(ruta)`, `pagina.clic(selector)`, `pagina.cerrar()`; `esperar(ms)`; y `pruebas/vivo.mjs <grupo>`, que corre las pruebas de un grupo y termina con código 1 si alguna falla.

- [ ] **Step 1: Escribir el ayudante de navegador**

```js
// pruebas/navegador.mjs
// Abre páginas en Edge sin ventana y las maneja por el protocolo de depuración (CDP). Solo para pruebas locales.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function abrir(url, { ancho = 1280, alto = 720 } = {}) {
  const puerto = 9400 + Math.floor(Math.random() * 500), perfil = mkdtempSync(join(tmpdir(), 'edge-'));
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, `--window-size=${ancho},${alto}`, '--use-angle=d3d11', 'about:blank'], { stdio: 'ignore' });
  let lista;
  for (let i = 0; i < 60; i++) { try { lista = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json(); if (lista.some((p) => p.type === 'page')) break; } catch {} await esperar(250); }
  const ws = new WebSocket(lista.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pendientes = new Map(), errores = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; pendientes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url });
  return {
    errores,
    async js(expr) { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; },
    async clic(selector) { return this.js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true; })()`); },
    async foto(ruta) { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(ruta, Buffer.from(r.result.data, 'base64')); },
    cerrar() { ws.close(); edge.kill(); },
  };
}

/** Repite una condición hasta que sea verdadera o se acabe el tiempo. */
export async function hasta(f, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (await f()) return true; await esperar(300); }
  return false;
}
```

- [ ] **Step 2: Escribir el corredor de pruebas con un grupo de humo**

```js
// pruebas/vivo.mjs
// Uso: node pruebas/vivo.mjs <grupo>   (con `npm run dev` corriendo en el puerto 5173)
import { abrir, hasta } from './navegador.mjs';

const BASE = 'http://localhost:5173/';
const grupos = {
  async humo() {
    const p = await abrir(`${BASE}#/juegos/vivo`);
    try { return { 'la pestaña En vivo carga': await hasta(() => p.js(`!!document.querySelector('.vivo-lista, .rejilla-juegos')`)) }; } finally { p.cerrar(); }
  },
};

const grupo = process.argv[2] ?? 'humo';
const resultados = await grupos[grupo]();
let malas = 0;
for (const [nombre, ok] of Object.entries(resultados)) { console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`); if (!ok) malas++; }
process.exit(malas ? 1 : 0);
```

- [ ] **Step 3: Correr el humo**

Run: `node pruebas/vivo.mjs humo` (con el servidor de prueba encendido)
Expected: `OK   la pestaña En vivo carga`

- [ ] **Step 4: Commit**

```bash
git add pruebas/navegador.mjs pruebas/vivo.mjs
git commit -m "Pruebas: banco con varias pestañas de Edge para el juego en vivo"
```

---

### Task 2: Asientos, espectadores y anfitrión (reglas puras)

**Files:**
- Create: `src/vivo/asientos.ts`
- Modify: `src/vivo/PantallaVivo.tsx` (expone `window.__vivo.probarAsientos` solo en desarrollo)
- Modify: `pruebas/vivo.mjs` (grupo `asientos`)

**Interfaces:**
- Produces:
  - `type Quiere = 'jugar' | 'mirar'`
  - `interface Presente { clave: string; id: string; nombre: string; desde: number; listo: boolean; quiere: Quiere }`
  - `interface Reparto { jugadores: string[]; espectadores: Presente[]; anfitrion: string | null }`
  - `repartir(presentes: Presente[], asientos: [string, string] | null, fijos: [string, string] | null): Reparto`, donde `anfitrion` es la `clave` (pestaña) del anfitrión.
  - `unicos(presentes: Presente[]): Presente[]`: una persona con varias pestañas cuenta una vez (la que llegó primero).
  - `probarAsientos(): string[]`: lista de fallas (vacía si todo está bien).

- [ ] **Step 1: Escribir las pruebas primero (dentro del mismo módulo, como `reglas.ts`)**

```ts
// src/vivo/asientos.ts (parte final)
/** Pruebas de las reglas: devuelve la lista de fallas. */
export function probarAsientos(): string[] {
  const p = (id: string, desde: number, quiere: Quiere = 'jugar', clave = `${id}:${desde}`): Presente => ({ clave, id, nombre: id, desde, listo: false, quiere });
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
  return fallas;
}
```

- [ ] **Step 2: Exponer las pruebas en desarrollo y agregar el grupo `asientos`**

En `src/vivo/PantallaVivo.tsx`, al final del archivo:

```ts
// Solo en pruebas: las reglas de asientos se pueden correr desde el banco de pruebas
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__vivo = { probarAsientos };
```

(con `import { probarAsientos } from './asientos';` arriba). En `pruebas/vivo.mjs`, dentro de `grupos`:

```js
  async asientos() {
    const p = await abrir(`${BASE}#/juegos/vivo`);
    try {
      await hasta(() => p.js('!!window.__vivo'));
      const fallas = await p.js('window.__vivo.probarAsientos()');
      for (const f of fallas) console.log('  ', f);
      return { 'reglas de asientos': Array.isArray(fallas) && fallas.length === 0 };
    } finally { p.cerrar(); }
  },
```

- [ ] **Step 3: Correr y ver que falla**

Run: `node pruebas/vivo.mjs asientos`
Expected: FALLA (el módulo todavía no tiene `repartir`; `npx tsc --noEmit` también falla).

- [ ] **Step 4: Escribir las reglas**

```ts
// src/vivo/asientos.ts (parte inicial)
// Quién juega, quién mira y quién hace de anfitrión en una sala en vivo. Sin nada de red: se puede probar sola.

export type Quiere = 'jugar' | 'mirar';
export interface Presente { clave: string; id: string; nombre: string; desde: number; listo: boolean; quiere: Quiere }
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
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx tsc --noEmit && node pruebas/vivo.mjs asientos`
Expected: `OK   reglas de asientos`

- [ ] **Step 6: Commit**

```bash
git add src/vivo/asientos.ts src/vivo/PantallaVivo.tsx pruebas/vivo.mjs
git commit -m "En vivo: reglas de asientos, espectadores y anfitrión, con pruebas"
```

---

### Task 3: Enlace directo (WebRTC en estrella) con respaldo, y sala nueva

**Files:**
- Create: `src/vivo/enlace.ts`
- Modify: `src/vivo/sala.ts` (reescrita: presencia con `quiere`, señalización y enlace)
- Modify: `pruebas/vivo.mjs` (grupos `enlace` y `respaldo`)

**Interfaces:**
- Consumes: `Presente`, `Quiere`, `repartir`, `unicos` (Task 2).
- Produces:
  - `crearEnlace(canal: RealtimeChannel, yo: string, opciones?: { sinDirecto?: boolean }): Enlace`
  - `interface Enlace { enviar(tipo: string, datos: Record<string, unknown>, para?: string): void; alRecibir(f: (tipo: string, datos: Record<string, unknown>, de: string) => void): void; actualizar(claves: string[], anfitrion: string | null): void; directo(clave: string): boolean; cerrar(): void }`
  - `unirse(codigo: string, yo: { id: string; nombre: string }, quiere: Quiere, alCambio: (p: Presente[]) => void, alMensaje: (evento: string, datos: Record<string, unknown>, de: string) => void, fijos?: [string, string] | null): Sala`
  - `interface Sala { presentes(): Presente[]; clave: string; enviar(evento: string, datos: Record<string, unknown>): void; marcarListo(si: boolean): void; quiero(q: Quiere): void; directo(clave: string): boolean; salir(): void }`
  - `nuevoCodigo(juego: string): string` (sin cambios)
  - En desarrollo, `window.__sala` expone `{ directos(): number, recibidos: string[] }` para el banco de pruebas.

- [ ] **Step 1: Escribir las pruebas de enlace y respaldo**

En `pruebas/vivo.mjs`, dentro de `grupos`:

```js
  // Tres pestañas en la misma sala: dos juegan y una mira. Los mensajes llegan a todos, sin duplicados.
  async enlace() { return probarMensajes(''); },
  // Igual, pero la pestaña que mira no puede conectarse directo: sus mensajes van por Supabase
  async respaldo() { return probarMensajes('&sinDirecto=1'); },
```

y antes de `const grupos`:

```js
async function probarMensajes(extraMirar) {
  const sala = `conchas-T${Math.floor(Math.random() * 900 + 100)}`;
  const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c${extraMirar}#/juegos/mirar/${sala}`);
  try {
    const listo = await hasta(async () => (await a.js('window.__sala?.directos() ?? 0')) >= (extraMirar ? 1 : 2), 20000);
    await b.js(`window.__sala.enviarPrueba('hola-b')`);
    await c.js(`window.__sala.enviarPrueba('hola-c')`);
    const llegan = await hasta(async () => {
      const ra = await a.js('window.__sala.recibidos'), rb = await b.js('window.__sala.recibidos'), rc = await c.js('window.__sala.recibidos');
      return ra.includes('hola-b') && ra.includes('hola-c') && rc.includes('hola-b') && rb.includes('hola-c');
    }, 15000);
    const sinDuplicados = (await c.js('window.__sala.recibidos')).filter((x) => x === 'hola-b').length === 1;
    return { 'el anfitrión conecta directo': listo, 'los mensajes llegan a todos': llegan, 'sin duplicados': sinDuplicados };
  } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
}
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node pruebas/vivo.mjs enlace`
Expected: FALLA (no existe `window.__sala` ni la ruta `#/juegos/mirar`).

- [ ] **Step 3: Escribir el enlace**

```ts
// src/vivo/enlace.ts
import type { RealtimeChannel } from '@supabase/supabase-js';

// Enlace de juego en estrella: el anfitrión se conecta directo (WebRTC) con cada pestaña de la sala y reenvía lo que
// le llega. Supabase solo lleva la señalización. Si con alguien no hay conexión directa, el mensaje viaja por el
// broadcast del canal (respaldo). Cada mensaje lleva un id: así se descartan los que lleguen por los dos caminos.

const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
type Datos = Record<string, unknown>;
interface Mensaje { n: string; tipo: string; datos: Datos; de: string; para?: string }
interface Par { pc: RTCPeerConnection; dc: RTCDataChannel | null; pendientes: RTCIceCandidateInit[] }

export interface Enlace {
  enviar(tipo: string, datos: Datos, para?: string): void;
  alRecibir(f: (tipo: string, datos: Datos, de: string) => void): void;
  /** Con quiénes hay que estar conectado ahora (claves de pestaña) y quién es el anfitrión. */
  actualizar(claves: string[], anfitrion: string | null): void;
  directo(clave: string): boolean;
  cerrar(): void;
}

export function crearEnlace(canal: RealtimeChannel, yo: string, opciones: { sinDirecto?: boolean } = {}): Enlace {
  const pares = new Map<string, Par>(), vistos = new Set<string>(), oyentes: ((tipo: string, datos: Datos, de: string) => void)[] = [];
  let anfitrion: string | null = null, contador = 0;
  const senal = (para: string, datos: Datos) => canal.send({ type: 'broadcast', event: 'senal', payload: { de: yo, para, ...datos } });
  const abierto = (clave: string) => pares.get(clave)?.dc?.readyState === 'open';

  const entregar = (m: Mensaje, porDirecto: boolean) => {
    if (vistos.has(m.n)) return;
    vistos.add(m.n);
    if (vistos.size > 2000) vistos.delete(vistos.values().next().value as string);
    if (!m.para || m.para === yo) for (const f of oyentes) f(m.tipo, m.datos, m.de);
    // El anfitrión reenvía lo que le llegó directo a quienes no lo tienen
    if (yo === anfitrion && porDirecto) salir(m, m.de);
  };
  /** Manda un mensaje: directo a quien se pueda y, si falta alguien, también por el respaldo. */
  const salir = (m: Mensaje, excepto?: string) => {
    const texto = JSON.stringify(m);
    const destinos = yo === anfitrion ? [...pares.keys()].filter((k) => k !== excepto && (!m.para || m.para === k)) : anfitrion && anfitrion !== yo ? [anfitrion] : [];
    let faltan = destinos.length === 0 && !excepto;
    for (const k of destinos) { if (abierto(k)) pares.get(k)!.dc!.send(texto); else faltan = true; }
    if (faltan) canal.send({ type: 'broadcast', event: 'msg', payload: m });
  };

  const crearPar = (clave: string, inicio: boolean): Par => {
    const pc = new RTCPeerConnection({ iceServers: ICE }), par: Par = { pc, dc: null, pendientes: [] };
    pc.onicecandidate = (ev) => { if (ev.candidate) senal(clave, { ice: ev.candidate.toJSON() }); };
    const preparar = (dc: RTCDataChannel) => { par.dc = dc; dc.onmessage = (ev) => { try { entregar(JSON.parse(ev.data), true); } catch { /* mensaje roto */ } }; };
    if (inicio) {
      preparar(pc.createDataChannel('juego'));
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => senal(clave, { sdp: pc.localDescription!.toJSON() })).catch(() => undefined);
    } else pc.ondatachannel = (ev) => preparar(ev.channel);
    pares.set(clave, par);
    return par;
  };
  const cerrarPar = (clave: string) => { pares.get(clave)?.pc.close(); pares.delete(clave); };

  canal.on('broadcast', { event: 'senal' }, async ({ payload }) => {
    const d = payload as { de: string; para: string; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
    if (d.para !== yo || opciones.sinDirecto) return;
    let par = pares.get(d.de);
    try {
      if (d.sdp?.type === 'offer') { if (par) cerrarPar(d.de); par = crearPar(d.de, false); await par.pc.setRemoteDescription(d.sdp); await par.pc.setLocalDescription(await par.pc.createAnswer()); senal(d.de, { sdp: par.pc.localDescription!.toJSON() }); }
      else if (d.sdp?.type === 'answer' && par) await par.pc.setRemoteDescription(d.sdp);
      if (d.ice && par) { if (par.pc.remoteDescription) await par.pc.addIceCandidate(d.ice); else par.pendientes.push(d.ice); }
      if (par?.pc.remoteDescription) for (const ice of par.pendientes.splice(0)) await par.pc.addIceCandidate(ice);
    } catch { /* señal tardía o de una conexión ya cerrada */ }
  });
  canal.on('broadcast', { event: 'msg' }, ({ payload }) => entregar(payload as Mensaje, false));

  return {
    enviar(tipo, datos, para) { const m: Mensaje = { n: `${yo}:${++contador}`, tipo, datos, de: yo, para }; vistos.add(m.n); salir(m); },
    alRecibir(f) { oyentes.push(f); },
    actualizar(claves, nuevo) {
      anfitrion = nuevo;
      // El anfitrión ofrece conexión a cada pestaña; los demás solo esperan la del anfitrión
      const deseadas = opciones.sinDirecto ? [] : yo === anfitrion ? claves.filter((k) => k !== yo) : nuevo ? [nuevo] : [];
      for (const k of [...pares.keys()]) if (!deseadas.includes(k)) cerrarPar(k);
      if (yo === anfitrion) for (const k of deseadas) if (!pares.has(k)) crearPar(k, true);
    },
    directo: abierto,
    cerrar() { for (const k of [...pares.keys()]) cerrarPar(k); },
  };
}
```

- [ ] **Step 4: Reescribir la sala**

```ts
// src/vivo/sala.ts
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../nucleo/supabase';
import { repartir, type Presente, type Quiere } from './asientos';
import { crearEnlace } from './enlace';

// Sala en vivo: la presencia de Supabase dice quién está, quién está listo y quién quiere jugar o mirar.
// Los mensajes del juego van por el enlace directo (con respaldo por Supabase). No guarda nada en la base.

export type { Presente } from './asientos';
export interface Sala {
  clave: string;
  presentes(): Presente[];
  enviar(evento: string, datos: Record<string, unknown>): void;
  marcarListo(si: boolean): void;
  quiero(q: Quiere): void;
  directo(clave: string): boolean;
  salir(): void;
}

/** Una pestaña = una clave: así la misma persona puede volver y retomar su asiento. */
const pestana = (() => { try { const k = sessionStorage.getItem('susto.pestana') ?? Math.random().toString(36).slice(2, 10); sessionStorage.setItem('susto.pestana', k); return k; } catch { return Math.random().toString(36).slice(2, 10); } })();

export function unirse(codigo: string, yo: { id: string; nombre: string }, quiere: Quiere, alCambio: (p: Presente[]) => void, alMensaje: (evento: string, datos: Record<string, unknown>, de: string) => void, fijos: [string, string] | null = null): Sala {
  const clave = `${yo.id}:${pestana}`;
  // `desde` se recuerda por persona y sala: si recarga, conserva su lugar en la fila
  const memoria = `susto.vivo.desde.${codigo}.${yo.id}`;
  let desde = Date.now();
  try { desde = Number(localStorage.getItem(memoria)) || desde; localStorage.setItem(memoria, String(desde)); } catch { /* sin almacenamiento */ }
  let listo = false, lista: Presente[] = [];
  const canal: RealtimeChannel = supabase.channel(`vivo:${codigo}`, { config: { presence: { key: clave }, broadcast: { self: false } } });
  const sinDirecto = import.meta.env.DEV && new URLSearchParams(location.search).has('sinDirecto');
  const enlace = crearEnlace(canal, clave, { sinDirecto });
  enlace.alRecibir((tipo, datos, de) => alMensaje(tipo, datos, de));

  const anunciar = () => canal.track({ id: yo.id, nombre: yo.nombre, desde, listo, quiere });
  canal.on('presence', { event: 'sync' }, () => {
    const estado = canal.presenceState<{ id: string; nombre: string; desde: number; listo: boolean; quiere: Quiere }>();
    lista = Object.entries(estado).flatMap(([k, metas]) => metas.map((m) => ({ clave: k, id: m.id, nombre: m.nombre, desde: m.desde, listo: m.listo, quiere: m.quiere ?? 'jugar' })));
    enlace.actualizar(lista.map((p) => p.clave), repartir(lista, null, fijos).anfitrion);
    alCambio(lista);
  });
  canal.subscribe((estado) => { if (estado === 'SUBSCRIBED') anunciar(); });

  const sala: Sala = {
    clave,
    presentes: () => lista,
    enviar(evento, datos) { enlace.enviar(evento, datos); },
    marcarListo(si) { listo = si; anunciar(); },
    quiero(q) { quiere = q; anunciar(); },
    directo: enlace.directo,
    salir() { enlace.cerrar(); canal.untrack(); supabase.removeChannel(canal); },
  };
  // Solo en pruebas: el banco de pruebas mide conexiones y mensajes
  if (import.meta.env.DEV) {
    const recibidos: string[] = [];
    enlace.alRecibir((tipo, datos) => { if (tipo === 'prueba') recibidos.push(String(datos.texto)); });
    (window as unknown as Record<string, unknown>).__sala = { directos: () => lista.filter((p) => enlace.directo(p.clave)).length, recibidos, enviarPrueba: (texto: string) => enlace.enviar('prueba', { texto }) };
  }
  return sala;
}

/** Código corto y legible para compartir (sin letras que se confunden). */
export function nuevoCodigo(juego: string): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `${juego}-${Array.from({ length: 4 }, () => letras[Math.floor(Math.random() * letras.length)]).join('')}`;
}
```

El anfitrión se calcula con `repartir(lista, null, fijos)`. Antes de que la partida empiece, coincide con el primer jugador. Una vez empezada, `PantallaVivo` usa los asientos guardados para todo lo demás. Si el primer jugador se va, el anfitrión pasa al otro jugador y el enlace se rearma solo con `actualizar`.

- [ ] **Step 5: Adaptar `PantallaVivo` a la sala nueva y agregar la ruta de mirar**

En `src/vivo/PantallaVivo.tsx`:
- `function SalaVivo({ codigo, mirar = false }: { codigo: string; mirar?: boolean })` y `unirse(codigo, yo, mirar ? 'mirar' : 'jugar', setPresentes, (evento, d) => { … })`; el resto del manejo de eventos no cambia.
- `export function Vivo({ codigo, mirar }: { codigo: string; mirar?: boolean })` pasa `mirar` a `SalaVivo`.
- Los asientos salen de `repartir(presentes, asientos, null)`: reemplazar `const sentados = (asientos ?? presentes.slice(0, 2).map((p) => p.id)) as string[];` por `const reparto = repartir(presentes, asientos, null), sentados = reparto.jugadores;`, y `listos` por `const listos = sentados.length === 2 && sentados.every((id) => presentes.find((p) => p.id === id)?.listo);`.
- Quien da la partida es el anfitrión: `if (asientos || !listos || reparto.anfitrion !== sala.current?.clave) return;` con `const a = sentados as [string, string];`.

En `src/juegos/Portal.tsx`: `if (sub === 'mirar') return <div class="pagina portal"><Vivo codigo={extra} mirar /></div>;`, antes de `const juego = juegoPorId(sub);`.

- [ ] **Step 6: Correr las pruebas**

Run: `npx tsc --noEmit && node pruebas/vivo.mjs enlace && node pruebas/vivo.mjs respaldo && node pruebas/vivo.mjs asientos`
Expected: todo `OK`.

- [ ] **Step 7: Prueba de recarga del anfitrión (Review Focus 2)**

Agregar a `grupos`:

```js
  async recarga() {
    const sala = `conchas-R${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`);
    try {
      await hasta(async () => (await a.js('window.__sala?.directos() ?? 0')) >= 1, 20000);
      await a.js('location.reload()');
      const vuelve = await hasta(async () => (await a.js('window.__sala?.directos() ?? 0')) >= 1, 25000);
      await b.js(`window.__sala.enviarPrueba('tras-recarga')`);
      const llega = await hasta(async () => (await a.js('window.__sala?.recibidos ?? []')).includes('tras-recarga'));
      return { 'el anfitrión se reconecta': vuelve, 'los mensajes siguen llegando': llega };
    } finally { a.cerrar(); b.cerrar(); }
  },
```

Run: `node pruebas/vivo.mjs recarga`
Expected: los dos `OK`.

- [ ] **Step 8: Commit**

```bash
git add src/vivo/enlace.ts src/vivo/sala.ts src/vivo/PantallaVivo.tsx src/juegos/Portal.tsx pruebas/vivo.mjs
git commit -m "En vivo: enlace directo entre navegadores con respaldo por Supabase, sala con jugar/mirar"
```

---

### Task 4: Ojo de espectadores, "Quiero jugar" y tarjetas con foto en la sala

**Files:**
- Modify: `src/vivo/PantallaVivo.tsx`
- Modify: `src/estilos.css`
- Modify: `pruebas/vivo.mjs` (grupo `ojo`)

**Interfaces:**
- Consumes: `repartir().espectadores` (Task 2), `Sala.quiero` (Task 3).
- Produces: elemento `.vivo-ojo` con el texto `👁 N`; botón `.vivo-quiero` ("Quiero jugar") visible solo para quien mira, con un asiento libre y antes de empezar.

- [ ] **Step 1: Escribir la prueba**

```js
  async ojo() {
    const sala = `balsas-O${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
    try {
      const uno = await hasta(async () => (await a.js(`document.querySelector('.vivo-ojo')?.textContent`)) === '👁 1');
      const ofrece = await hasta(() => c.js(`!!document.querySelector('.vivo-quiero')`));
      await c.clic('.vivo-quiero');
      const cero = await hasta(async () => (await a.js(`document.querySelector('.vivo-ojo')?.textContent`)) === '👁 0');
      return { 'el ojo cuenta al espectador': uno, 'puede pedir asiento libre': ofrece, 'al sentarse deja de contar': cero };
    } finally { a.cerrar(); c.cerrar(); }
  },
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node pruebas/vivo.mjs ojo`
Expected: FALLA (no existe `.vivo-ojo`).

- [ ] **Step 3: Implementar en la sala**

En el JSX de `SalaVivo`, debajo del título:

```tsx
<div class="fila vivo-cabecera">
  <span class="vivo-ojo" title="Personas mirando">👁 {reparto.espectadores.length}</span>
  {!asientos && !soyJugador && sentados.length < 2 && <button class="boton principal vivo-quiero" onClick={() => sala.current?.quiero('jugar')}>Quiero jugar</button>}
</div>
```

Y en la lista de gente, mostrar como "Mirando" a quien esté en `reparto.espectadores`. En `src/estilos.css`:

```css
.vivo-ojo { font: 800 1.05rem var(--cuerpo); background: var(--noche-2); border: 1px solid var(--linea); border-radius: 99px; padding: 4px 12px; }
```

- [ ] **Step 4: Tarjetas con foto en la pestaña En vivo**

En `Vivo`, cada tarjeta de juego lleva su foto como en el portal:

```tsx
<div key={j} class="tarjeta" style="--tono:#ffe08a">
  <img class="foto" src={`${import.meta.env.BASE_URL}juegos/${j}.png`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
  <h3>{JUEGOS[j].nombre}</h3>
  …
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx tsc --noEmit && node pruebas/vivo.mjs ojo && node pruebas/vivo.mjs enlace`
Expected: todo `OK`.

- [ ] **Step 6: Commit**

```bash
git add src/vivo/PantallaVivo.tsx src/estilos.css pruebas/vivo.mjs
git commit -m "En vivo: ojo con los espectadores, pedir asiento y fotos en las tarjetas"
```

---

### Task 5: Vestíbulo y pestaña "Partidas en línea"

**Files:**
- Create: `src/vivo/vestibulo.ts`
- Create: `src/vivo/PartidasEnLinea.tsx`
- Modify: `src/vivo/PantallaVivo.tsx` (el anfitrión anuncia su sala)
- Modify: `src/juegos/Portal.tsx` (pestaña nueva)
- Modify: `src/estilos.css`
- Modify: `pruebas/vivo.mjs` (grupo `vestibulo`)

**Interfaces:**
- Produces:
  - `interface InfoSala { codigo: string; juego: string; a: string; b: string; estado: 'esperando' | 'jugando' | 'terminada'; turno: string; espectadores: number; oficial: boolean; desde: number }`
  - `anunciarSala(): { poner(info: InfoSala | null): void; cerrar(): void }`
  - `escucharSalas(f: (lista: InfoSala[]) => void): () => void`
  - Componente `PartidasEnLinea()`.

- [ ] **Step 1: Escribir la prueba**

```js
  async vestibulo() {
    const sala = `conchas-V${Math.floor(Math.random() * 900 + 100)}`;
    const mira = await abrir(`${BASE}?invitado=z#/juegos/en-linea`), a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`);
    try {
      const aparece = await hasta(() => mira.js(`[...document.querySelectorAll('.partida-en-linea')].some((e) => e.dataset.codigo === ${JSON.stringify(sala)})`), 20000);
      const conFoto = await mira.js(`!!document.querySelector('.partida-en-linea[data-codigo=${JSON.stringify(sala)}] img.foto')`);
      a.cerrar();
      const desaparece = await hasta(() => mira.js(`![...document.querySelectorAll('.partida-en-linea')].some((e) => e.dataset.codigo === ${JSON.stringify(sala)})`), 20000);
      return { 'la sala aparece en Partidas en línea': aparece, 'la tarjeta tiene foto': conFoto, 'desaparece al cerrarse': desaparece };
    } finally { mira.cerrar(); }
  },
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node pruebas/vivo.mjs vestibulo`
Expected: FALLA (la pestaña no existe).

- [ ] **Step 3: Escribir el vestíbulo**

```ts
// src/vivo/vestibulo.ts
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../nucleo/supabase';

// El vestíbulo: un canal de presencia donde cada anfitrión anuncia su sala. Partidas en línea solo escucha.
// Son mensajes de presencia (el plan gratis permite 20 por segundo): se anuncia solo cuando algo cambia.

export interface InfoSala { codigo: string; juego: string; a: string; b: string; estado: 'esperando' | 'jugando' | 'terminada'; turno: string; espectadores: number; oficial: boolean; desde: number }
const CANAL = 'vivo:salas';

export function anunciarSala() {
  let canal: RealtimeChannel | null = null, ultimo = '', listo = false, pendiente: InfoSala | null = null;
  const enviar = () => { if (canal && listo) { if (pendiente) canal.track(pendiente); else canal.untrack(); } };
  return {
    poner(info: InfoSala | null) {
      const texto = JSON.stringify(info);
      if (texto === ultimo) return;
      ultimo = texto; pendiente = info;
      if (!canal && info) {
        canal = supabase.channel(CANAL, { config: { presence: { key: info.codigo } } });
        canal.subscribe((e) => { if (e === 'SUBSCRIBED') { listo = true; enviar(); } });
      } else enviar();
    },
    cerrar() { if (canal) { canal.untrack(); supabase.removeChannel(canal); } canal = null; listo = false; ultimo = ''; },
  };
}

export function escucharSalas(f: (lista: InfoSala[]) => void): () => void {
  const canal = supabase.channel(CANAL);
  canal.on('presence', { event: 'sync' }, () => {
    const estado = canal.presenceState<InfoSala>();
    // Si dos pestañas anuncian la misma sala (cambió el anfitrión), vale la más reciente
    const porSala = new Map<string, InfoSala>();
    for (const metas of Object.values(estado)) for (const m of metas) { const previa = porSala.get(m.codigo); if (!previa || m.desde > previa.desde) porSala.set(m.codigo, m); }
    f([...porSala.values()].sort((a, b) => (a.estado === 'jugando' ? 0 : 1) - (b.estado === 'jugando' ? 0 : 1) || b.espectadores - a.espectadores));
  });
  canal.subscribe();
  return () => { supabase.removeChannel(canal); };
}
```

- [ ] **Step 4: Escribir la pestaña**

```tsx
// src/vivo/PartidasEnLinea.tsx
import { useEffect, useState } from 'preact/hooks';
import { escucharSalas, type InfoSala } from './vestibulo';
import { NOMBRES_VIVO } from './PantallaVivo';

// Partidas en línea: todas las salas en vivo abiertas, para mirarlas (o sumarse si falta un rival en un amistoso).
const ESTADO: Record<InfoSala['estado'], string> = { esperando: 'Esperando rival', jugando: 'Jugando', terminada: 'Terminada' };

export function PartidasEnLinea() {
  const [salas, setSalas] = useState<InfoSala[] | null>(null);
  useEffect(() => escucharSalas(setSalas), []);
  return (
    <>
      <h1>Partidas en línea</h1>
      <p>Las partidas en vivo que se están jugando ahora. Entra a mirar: el ojo 👁 cuenta cuántas personas están mirando.</p>
      {!salas ? <p class="tenue">Buscando partidas…</p> : !salas.length ? <p class="tenue">No hay partidas en este momento. Crea una en la pestaña En vivo.</p> : (
        <div class="rejilla-juegos">
          {salas.map((s) => (
            <div key={s.codigo} class="tarjeta partida-en-linea" data-codigo={s.codigo} style="--tono:#4fd1ff">
              <img class="foto" src={`${import.meta.env.BASE_URL}juegos/${s.juego}.png`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <span class="vivo-ojo partida-ojo">👁 {s.espectadores}</span>
              <h3>{NOMBRES_VIVO[s.juego] ?? s.juego}</h3>
              <p><b>{s.a || '¿?'}</b> vs <b>{s.b || '¿?'}</b>{s.oficial ? ' · oficial' : ' · amistoso'}</p>
              <span class="pie">
                <span class="premia">{s.estado === 'jugando' && s.turno ? `Turno de ${s.turno}` : ESTADO[s.estado]}</span>
                <span class="fila">
                  {s.estado === 'esperando' && !s.oficial && <a class="estado" href={`#/juegos/vivo/${s.codigo}`}>Jugar</a>}
                  <a class="estado" href={`#/juegos/mirar/${s.codigo}`}>Mirar</a>
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```

En `PantallaVivo.tsx`, exportar `export const NOMBRES_VIVO: Record<string, string> = Object.fromEntries(Object.entries(JUEGOS).map(([k, v]) => [k, v.nombre]));`. Dentro de `SalaVivo`, el anfitrión anuncia:

```tsx
const anuncio = useRef(anunciarSala());
useEffect(() => () => anuncio.current.cerrar(), []);
useEffect(() => {
  const soyAnfitrion = reparto.anfitrion === sala.current?.clave;
  anuncio.current.poner(soyAnfitrion ? { codigo, juego, a: sentados[0] ? nombre(sentados[0]) : '', b: sentados[1] ? nombre(sentados[1]) : '', estado: !asientos ? 'esperando' : resultado ? 'terminada' : 'jugando', turno: asientos && !resultado ? nombre(turnoDe) : '', espectadores: reparto.espectadores.length, oficial: false, desde: Date.now() } : null);
});
```

(El `desde: Date.now()` cambia el texto en cada render, así que `poner` lo comparará siempre como distinto. Para evitarlo, `poner` compara sin `desde`: `const texto = JSON.stringify(info && { ...info, desde: 0 });`.)

En `Portal.tsx`, agregar a `MODOS`, después de `vivo`: `{ ruta: 'en-linea', titulo: 'Partidas en línea', bajada: 'Mirar en directo' }`, y en el render: `modo === 'en-linea' ? <PartidasEnLinea /> : …`. En `estilos.css`:

```css
.partida-ojo { position: absolute; top: 10px; right: 10px; z-index: 2; }
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx tsc --noEmit && node pruebas/vivo.mjs vestibulo && node pruebas/vivo.mjs ojo`
Expected: todo `OK`.

- [ ] **Step 6: Commit**

```bash
git add src/vivo/vestibulo.ts src/vivo/PartidasEnLinea.tsx src/vivo/PantallaVivo.tsx src/juegos/Portal.tsx src/estilos.css pruebas/vivo.mjs
git commit -m "Partidas en línea: lista de salas en vivo con foto, estado y espectadores"
```

---

### Task 6: Salas oficiales (dan puntos) para Cuatro Conchas y Balsas, y contrato `vivo`

**Files:**
- Modify: `src/juegos/catalogo.ts` (`TipoVersus.vivo`, base de Conchas y Balsas)
- Modify: `src/juegos/Mesa.tsx:144` (tipos que se pueden crear)
- Modify: `src/juegos/PantallaVersus.tsx` (jugables; botón "Jugar en vivo"; `Duelo` redirige)
- Modify: `src/vivo/PantallaVivo.tsx` (salas `enf-<id>`)
- Modify: `src/juegos/marco.ts` (tipos `ContextoVivo` y `Resultado.vivo`)
- Modify: `src/vivo/asientos.ts` (`rondaSiguiente` y su prueba)

**Interfaces:**
- Consumes: `repartir(…, fijos)` (Task 2), `V.empezarRonda`, `V.terminarRonda`, `V.unEnfrentamiento`, `V.listarPersonas` (de `src/juegos/duelos.ts`).
- Produces:
  - `TipoVersus.vivo?: boolean`
  - `rondaSiguiente(jugadas: number[], total: number): number | null`: primera ronda sin jugar (las rondas van de 1 a `total`), o `null` si ya no quedan.
  - `marco.ts`: `export interface ContextoVivo { rol: 'a' | 'b' | 'espectador'; nombres: { a: string; b: string }; enviar(tipo: string, datos: Record<string, unknown>): void; alRecibir(f: (tipo: string, datos: Record<string, unknown>, de: string) => void): void; avisar(texto: string): void }`, `Contexto.vivo?: ContextoVivo` y `Resultado.vivo?: { a: number; b: number; ganador: 'a' | 'b' | 'empate' }`. En esta tanda ningún juego los usa todavía: quedan listos para la tanda 2.

- [ ] **Step 1: Escribir la prueba de rondas**

Agregar a `probarAsientos()`:

```ts
  igual('rondas: primera', rondaSiguiente([], 3), 1);
  igual('rondas: salta las jugadas', rondaSiguiente([1, 2], 3), 3);
  igual('rondas: no quedan', rondaSiguiente([1, 2, 3], 3), null);
```

Run: `node pruebas/vivo.mjs asientos`
Expected: FALLA (`rondaSiguiente` no existe).

- [ ] **Step 2: Implementar `rondaSiguiente`**

```ts
/** Primera ronda que falta por jugar (de 1 a `total`), o null si ya se jugaron todas. */
export function rondaSiguiente(jugadas: number[], total: number): number | null {
  for (let r = 1; r <= total; r++) if (!jugadas.includes(r)) return r;
  return null;
}
```

Run: `node pruebas/vivo.mjs asientos` → `OK`.

- [ ] **Step 3: Catálogo, Mesa y Versus**

- `catalogo.ts`: `export interface TipoVersus { id: string; modo: '1v1' | '3v3'; nombre: string; idea: string; base?: string; vivo?: boolean }`. En `v(...)`, agregar un parámetro `vivo = false`. Las dos entradas pasan a `v('1v1', 'conchas-linea', 'Cuatro Conchas en Línea', 'Por turnos, el primero en alinear cuatro.', 'conchas', true)` y `v('1v1', 'balsas', 'Batalla de Balsas', 'Batalla naval: esconde tus balsas y hunde las del rival.', 'balsas', true)`.
- `Mesa.tsx:144` y `PantallaVersus.tsx:20`: el filtro pasa a `t.base && (t.vivo || juegoPorId(t.base)?.listo)`.
- `PantallaVersus.tsx`, en "Mis enfrentamientos": si `VERSUS.find((t) => t.modo === e.modo && t.base === e.juego)?.vivo`, el botón es `<a class="boton principal" href={`#/juegos/vivo/enf-${e.id}`}>Jugar en vivo</a>` en vez de "Jugar mi turno".
- `PantallaVersus.tsx:146`: la tarjeta especial de `conchas-linea`/`balsas` se queda, pero ahora con su foto (`juegos/conchas.png`, `juegos/balsas.png`).
- `Duelo`: si el juego es en vivo, `location.hash = `#/juegos/vivo/enf-${id}``.

- [ ] **Step 4: Sala oficial en `PantallaVivo`**

- `SalaVivo` recibe el código. Si empieza por `enf-`, primero carga `V.unEnfrentamiento(id)` y `V.listarPersonas()`, y deriva `juego = e.juego`, `fijos = [e.a_perfil, e.b_perfil]`, nombres desde personas y `total = e.rondas`.
- `unirse(codigo, yo, quiereJugar && (yo.id === fijos[0] || yo.id === fijos[1]) ? 'jugar' : 'mirar', …, fijos)`, y `repartir(presentes, asientos, fijos)`. Las salas oficiales exigen sesión de Discord para jugar; los invitados solo miran.
- Ronda en curso: `estado.partida` es el número de ronda. Al fijarse los asientos de una ronda, cada jugador llama una sola vez a `V.empezarRonda(id, ronda)`, recordándolo en `localStorage` (`susto.vivo.empezada.<codigo>.<ronda>`), para no volver a pedirla al recargar.
- Al haber resultado, cada jugador guarda una sola vez (`susto.vivo.guardada.<codigo>.<ronda>`) `V.terminarRonda(id, ronda, gane ? 1 : 0, { vivo: true, contra: rivalId, abandono: ganeAbandono })`. En un empate los dos guardan 0.
- El botón "Revancha" pasa a decir "Siguiente ronda" mientras `rondaSiguiente(jugadas, total)` no sea `null`; al terminar todas, aparece "Enfrentamiento terminado" con un enlace a `#/juegos/duelo/<id>` (resultado completo).
- El anuncio en el vestíbulo lleva `oficial: true` y el texto "Ronda N de M".

- [ ] **Step 5: Contrato en `marco.ts`**

```ts
/** Lo que reciben los juegos que se juegan en vivo (desde la tanda 2). */
export interface ContextoVivo {
  rol: 'a' | 'b' | 'espectador';
  nombres: { a: string; b: string };
  enviar(tipo: string, datos: Record<string, unknown>): void;
  alRecibir(f: (tipo: string, datos: Record<string, unknown>, de: string) => void): void;
  /** Aviso grande que ven todos en la sala ("Es el turno de Vale"). */
  avisar(texto: string): void;
}
```

Agregar `vivo?: ContextoVivo;` a `Contexto` y `vivo?: { a: number; b: number; ganador: 'a' | 'b' | 'empate' };` a `Resultado`.

- [ ] **Step 6: Comprobar**

Run: `npx tsc --noEmit && node pruebas/vivo.mjs asientos && node pruebas/vivo.mjs enlace`
Expected: todo `OK`. La partida oficial completa (con dos cuentas de Discord) la prueba Pancho a mano. Pasos para él en la nota del Cerebro (Task 7).

- [ ] **Step 7: Commit**

```bash
git add src/juegos/catalogo.ts src/juegos/Mesa.tsx src/juegos/PantallaVersus.tsx src/vivo/PantallaVivo.tsx src/juegos/marco.ts src/vivo/asientos.ts
git commit -m "En vivo: Cuatro Conchas y Balsas como duelos oficiales que dan puntos; contrato vivo para los juegos"
```

---

### Task 7: Fotos, prueba de punta a punta, notas y compilación

**Files:**
- Create: `public/juegos/conchas.png`, `public/juegos/balsas.png`
- Modify: `pruebas/vivo.mjs` (grupos `partida` y `fotos`)
- Modify (vault): `Estado del proyecto.md`, `Juego en vivo - diseño.md`

- [ ] **Step 1: Prueba de una partida completa de Cuatro Conchas con espectador**

```js
  async partida() {
    const sala = `conchas-P${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
    const listo = (p) => hasta(() => p.js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === '¡Listo!'); if (b) b.click(); return !!b; })()`));
    try {
      await listo(a); await listo(b);
      await hasta(() => a.js(`!!document.querySelector('.conchas')`), 20000);
      // A juega en la columna 1 y B en la 2, cuatro veces: gana A
      for (let k = 0; k < 4; k++) {
        await hasta(() => a.js(`(() => { const c = document.querySelectorAll('.conchas-col')[0]; if (c.disabled) return false; c.click(); return true; })()`));
        if (k < 3) await hasta(() => b.js(`(() => { const c = document.querySelectorAll('.conchas-col')[1]; if (c.disabled) return false; c.click(); return true; })()`));
      }
      const gana = await hasta(() => c.js(`document.querySelector('.vivo-fin')?.textContent?.includes('Ganó')`));
      await a.foto('public/juegos/conchas.png');
      return { 'el espectador ve el final': gana };
    } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
  },
```

Run: `node pruebas/vivo.mjs partida` → `OK`.

Agregar el grupo `fotos`, que abre las pestañas a 640 × 360. Para Conchas, repite la partida de arriba y saca `public/juegos/conchas.png` desde A antes de la última jugada. Para Balsas, en una sala `balsas-F…`, A y B marcan Listo, aprietan "Repartir mis balsas" y "Flota lista", y A dispara a tres casillas (`.mar-caja:last-child .agua-c` 0, 9 y 18, esperando su turno entre cada disparo, mientras B dispara a 5, 14 y 23); después se saca `public/juegos/balsas.png` desde A:

```js
  async fotos() {
    const turno = (p, mar, i) => hasta(() => p.js(`(() => { const c = document.querySelectorAll('.mar-caja')[${mar}]?.querySelectorAll('.agua-c')[${i}]; if (!c || c.disabled) return false; c.click(); return true; })()`));
    const clic = (p, texto) => hasta(() => p.js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === ${JSON.stringify(texto)} && !x.disabled); if (b) b.click(); return !!b; })()`));
    const sala = `balsas-F${Math.floor(Math.random() * 900 + 100)}`, tam = { ancho: 640, alto: 360 };
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`, tam), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`, tam);
    try {
      await clic(a, '¡Listo!'); await clic(b, '¡Listo!');
      for (const p of [a, b]) { await clic(p, 'Repartir mis balsas'); await clic(p, 'Flota lista'); }
      for (const [x, y] of [[0, 5], [9, 14], [18, 23]]) { await turno(a, 1, x); await turno(b, 1, y); }
      await a.foto('public/juegos/balsas.png');
      return { 'foto de Balsas': true };
    } finally { a.cerrar(); b.cerrar(); }
  },
```

Run: `node pruebas/vivo.mjs fotos` → `OK`, y revisar las dos fotos a la vista.

- [ ] **Step 2: Todas las pruebas, tipos y compilación**

Run: `for g in humo asientos enlace respaldo recarga ojo vestibulo partida; do node pruebas/vivo.mjs $g || exit 1; done; npx tsc --noEmit && npx vite build`
Expected: todo `OK` y la compilación termina sin errores.

- [ ] **Step 3: Notas del Cerebro**

- `Estado del proyecto.md`: sección "En vivo, tanda 1 (fecha, sin publicar)" con lo hecho y los pendientes. Incluye la prueba manual para Pancho: crear en la Mesa un 1v1 oficial de Cuatro Conchas entre dos cuentas, abrir "Jugar en vivo" en las dos, jugar, y ver que el enfrentamiento se cierra con sus puntos.
- `Juego en vivo - diseño.md`: marcar la tanda 1 como hecha y enlazar `pruebas/vivo.mjs`.

- [ ] **Step 4: Commit**

```bash
git add public/juegos/conchas.png public/juegos/balsas.png pruebas/vivo.mjs
git commit -m "En vivo tanda 1: fotos de Conchas y Balsas y prueba de partida completa con espectador"
```
