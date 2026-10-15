# En vivo · Tanda 2a (juegos de mesa) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jugar en vivo Parejas del Arrecife, Cazanúmeros, Tinta Tramposa, Eco del Templo y El Cofre o la Ola, con espectadores, Partidas en línea y duelos oficiales que dan puntos (con el diferido de respaldo).

**Architecture:** Un motor común de "tablero en vivo": cada juego se escribe como reglas puras (`inicial`, `accion`, `tic`, `marcador`) más una función que dibuja el estado en la mesa de siempre (`crearMesa`). El anfitrión aplica las acciones de los dos jugadores, avanza el tiempo y reparte el estado (con número de versión) a todos; los demás solo dibujan. Una sala nueva, `SalaTablero`, hace de anfitriona para estos juegos con el mismo enlace, asientos, ojo, vestíbulo, abandono y guardado oficial de la tanda 1. Cuatro Conchas y Balsas siguen en su sala actual.

**Tech Stack:** Preact 11, TypeScript, Supabase Realtime + WebRTC (enlace de la tanda 1), pruebas con Edge sin ventana (`pruebas/vivo.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-14-en-vivo-1v1-design.md` (sección 5: "Tablero compartido" y "Por turnos" para estos cinco). Tanda 1 ya hecha en la rama `en-vivo-tanda-1`; esta tanda parte de ahí en `en-vivo-tanda-2`.

## Global Constraints
- Todo en español, mismo estilo de código (líneas densas, comentarios de una línea con el porqué).
- Supabase gratis: 100 mensajes/s en el proyecto y 20 de presencia/s. El estado del juego viaja por el enlace directo; por Supabase solo como respaldo.
- Nada nuevo que ejecutar en Supabase.
- El diferido sigue disponible para estos cinco juegos (decisión de Pancho): el 1v1 ofrece "Jugar en vivo" y también "Jugar a mi hora".
- Solo cuentan las acciones de quien está sentado; el estado solo se acepta del anfitrión o de un jugador, y con forma válida.
- No publicar sin el visto bueno de Pancho.

## Cambio de alcance (ruling previo, para que Pancho lo apruebe)
La tanda 2 del diseño juntaba 10 juegos. Se divide en dos:
- **2a (este plan):** los cinco de mesa, que comparten un motor de tablero (Parejas, Cazanúmeros, Tinta, Eco, Cofre).
- **2b (plan siguiente):** los cinco en 3D, que necesitan transmitir lo que se ve (Mata-Cangrejos, Tótem, Bolos, Minigolf, Agujero Negro). Mata-Cangrejos pasa a la 2b porque es 3D.

## Cómo se juega cada uno en vivo
| Juego | En vivo | Gana |
|---|---|---|
| Parejas | Memorice clásico: un tablero de 10 parejas + 2 medusas, por turnos; si aciertas, sigues; la medusa resta 1 y pasa el turno | Más parejas |
| Cazanúmeros | Un tablero: el número que sigue es de quien lo toca primero; tocar uno equivocado resta | Más números (×10, −3 por error) |
| Tinta Tramposa | 20 rondas: la misma palabra para los dos; el punto es de quien acierta primero; quien se equivoca queda fuera de esa ronda | Más rondas |
| Eco del Templo | La secuencia se muestra a los dos; la repite A, después B; luego crece. Pierde quien se equivoca primero | Quien no se equivoca |
| El Cofre | 6 cofres: en cada sacada los dos eligen en secreto "Sacar" o "Plantarme" y se revela a la vez; la ola es la misma para los dos | Más monedas |

## Review Focus
1. **El anfitrión se va a media partida:** otro toma el mando desde el último estado y el reloj sigue (no vuelve a 0). (Task 3: prueba `relevo`.)
2. **Los dos tocan el mismo número o aciertan la misma ronda al mismo tiempo:** gana el primero que llega al anfitrión; el segundo no recibe castigo. (Task 4: prueba pura de Cazanúmeros; Task 5: de Tinta.)
3. **Un espectador manda acciones:** no cambian nada. (Task 3: prueba `intrusoTablero`.)
4. **Alguien entra a mirar a media partida:** ve el tablero actual, no uno vacío. (Task 3: el espectador entra tarde en la prueba de Parejas.)
5. **Sala oficial con un jugador que ya jugó esa ronda en diferido:** no puede empezar en vivo; la sala lo dice. (Task 8: prueba pura `rondasDistintas`.)

---

### Task 1: Motor de tablero en vivo (reglas puras y su contrato)

**Files:**
- Create: `src/vivo/tablero.ts`
- Modify: `src/vivo/PantallaVivo.tsx` (exporta `asientosValidos` y el tipo `Oficial`)

**Interfaces:**
- Produces:
  - `type Lado = 'a' | 'b'`
  - `interface Marcador { a: number; b: number; fin: boolean }`
  - `interface Reglas<E> { id: string; nombre: string; idea: string; inicial(semilla: string, nivel: number): E; accion(e: E, a: Record<string, unknown>, lado: Lado, t: number): E | null; tic?(e: E, t: number): E | null; marcador(e: E, t: number): Marcador; valido(e: unknown): e is E; dibujar(m: Mesa, enviar: (a: Record<string, unknown>) => void, yo: Lado | null): (e: E, t: number, nombres: { a: string; b: string }) => void }`
  - `ladoDe(asientos: [string, string], id: string): Lado | null`
  - `const COLOR_LADO = { a: '#3f8cff', b: '#ef5565' }`

- [ ] **Step 1: Escribir el contrato**

```ts
// src/vivo/tablero.ts
import type { Mesa } from '../juegos/tablero/mesa';

// Motor de "tablero en vivo": cada juego son reglas puras más una forma de dibujarse en la mesa.
// El anfitrión aplica las acciones (con su reloj) y reparte el estado; los demás solo dibujan.
// Así cualquier juego de mesa se juega en vivo sin repetir la parte de red.

export type Lado = 'a' | 'b';
export interface Marcador { a: number; b: number; fin: boolean }
export interface Reglas<E> {
  id: string; nombre: string; idea: string;
  inicial(semilla: string, nivel: number): E;
  /** La acción de un lado en el segundo `t` de la partida; null si no corresponde (no es su turno, llegó tarde…). */
  accion(e: E, a: Record<string, unknown>, lado: Lado, t: number): E | null;
  /** Avance por tiempo, que corre solo el anfitrión diez veces por segundo; null si no cambia nada. */
  tic?(e: E, t: number): E | null;
  marcador(e: E, t: number): Marcador;
  /** Si un estado recibido tiene la forma de este juego (protege de mensajes rotos). */
  valido(e: unknown): e is E;
  /** Arma lo fijo una vez y devuelve cómo pintar cada estado. `yo` es null para quien mira. */
  dibujar(m: Mesa, enviar: (a: Record<string, unknown>) => void, yo: Lado | null): (e: E, t: number, nombres: { a: string; b: string }) => void;
}
export const COLOR_LADO: Record<Lado, string> = { a: '#3f8cff', b: '#ef5565' };
export const otro = (l: Lado): Lado => (l === 'a' ? 'b' : 'a');
export const ladoDe = (asientos: [string, string], id: string): Lado | null => (asientos[0] === id ? 'a' : asientos[1] === id ? 'b' : null);
export const entero = (x: unknown, desde: number, hasta: number) => Number.isInteger(x) && (x as number) >= desde && (x as number) < hasta;
export const esLado = (x: unknown): x is Lado => x === 'a' || x === 'b';
```

- [ ] **Step 2: Exportar lo compartido de la tanda 1**

En `PantallaVivo.tsx`: `export const asientosValidos = …` (antes era `const`) y `export interface Oficial …`.

- [ ] **Step 3: Comprobar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/vivo/tablero.ts src/vivo/PantallaVivo.tsx
git commit -m "En vivo: contrato del motor de tablero"
```

---

### Task 2: Parejas en vivo (reglas puras con pruebas)

**Files:**
- Create: `src/vivo/tableros/parejas.ts`
- Create: `src/vivo/tableros/index.ts`
- Modify: `src/vivo/PantallaVivo.tsx` (`__vivo.probarTableros`)
- Modify: `pruebas/vivo.mjs` (grupo `asientos` también corre `probarTableros`)

**Interfaces:**
- Consumes: `Reglas`, `Lado`, `otro`, `entero`, `esLado`, `COLOR_LADO` (Task 1); `barajar` (`src/juegos/tablero/mesa.ts`); `generador` (`src/nucleo/azar.ts`).
- Produces: `parejas: Reglas<EstadoParejas>`; `TABLEROS: Record<string, Reglas<any>>`; `probarTableros(): string[]`.

- [ ] **Step 1: Escribir las pruebas**

```ts
// src/vivo/tableros/index.ts (parte de pruebas)
export function probarTableros(): string[] {
  const fallas: string[] = [], igual = (que: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) fallas.push(`${que}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  // Parejas
  let p = parejas.inicial('prueba', 1);
  const par = (f: string) => p.cartas.map((x, i) => (x === f ? i : -1)).filter((i) => i >= 0);
  const [x, y] = par(p.cartas.find((f) => f !== 'medusa')!);
  igual('parejas: no es tu turno', parejas.accion(p, { i: x }, 'b', 1), null);
  p = parejas.accion(p, { i: x }, 'a', 1)!; p = parejas.accion(p, { i: y }, 'a', 1.5)!;
  igual('parejas: acierto suma y sigue el turno', [p.puntos.a, p.turno], [1, 'a']);
  const otraFigura = p.cartas.find((f, i) => f !== 'medusa' && !p.duenas[i] && f !== p.cartas[x])!, [u] = par(otraFigura), v = p.cartas.findIndex((f, i) => f !== 'medusa' && f !== otraFigura && !p.duenas[i]);
  p = parejas.accion(p, { i: u }, 'a', 2)!; p = parejas.accion(p, { i: v }, 'a', 2.2)!;
  igual('parejas: fallo espera antes de pasar', p.turno, 'a');
  igual('parejas: tocar mientras se tapan no vale', parejas.accion(p, { i: x }, 'a', 2.5), null);
  p = parejas.tic!(p, 3.5)!;
  igual('parejas: tras el fallo pasa el turno', [p.turno, p.abiertas.length], ['b', 0]);
  const m = p.cartas.indexOf('medusa');
  p = parejas.accion(p, { i: m }, 'b', 4)!;
  igual('parejas: la medusa resta y pasa el turno', [p.puntos.b, p.turno], [-1, 'a']);
  igual('parejas: estado roto no vale', parejas.valido({ cartas: 'x' }), false);
  return fallas;
}
```

Agregar `probarTableros` a `window.__vivo` y a la prueba `asientos` de `pruebas/vivo.mjs` (`[...probarAsientos(), ...probarSala(), ...probarTableros()]`).

- [ ] **Step 2: Correr y ver que falla**

Run: `npx tsc --noEmit; node pruebas/vivo.mjs asientos`
Expected: FALLA (no existe `parejas`).

- [ ] **Step 3: Escribir las reglas y el dibujo**

```ts
// src/vivo/tableros/parejas.ts
import { generador } from '../../nucleo/azar';
import { barajar } from '../../juegos/tablero/mesa';
import { COLOR_LADO, entero, esLado, otro, type Lado, type Reglas } from '../tablero';

// Parejas en vivo: el memorice de siempre. Un tablero de diez parejas y dos medusas; por turnos se dan vuelta dos
// cartas; si son iguales, son tuyas y sigues; si no, se tapan y pasa el turno. La medusa resta una y pasa el turno.
const FIGURAS = ['fish_blue', 'fish_brown', 'fish_green', 'fish_grey', 'fish_grey_long_a', 'fish_orange', 'fish_pink', 'fish_red', 'fish_green_skeleton', 'seaweed_orange_b'];
const MEDUSA = 'medusa', LIMITE = 240, MIRA = 1.1;
export interface EstadoParejas { cartas: string[]; duenas: (Lado | 'x' | null)[]; abiertas: number[]; turno: Lado; puntos: Record<Lado, number>; tapa: number }

export const parejas: Reglas<EstadoParejas> = {
  id: 'parejas', nombre: 'Parejas del Arrecife', idea: 'Memorice por turnos: si aciertas, sigues. Cuidado con las medusas.',
  inicial(semilla) {
    const cartas = barajar([...FIGURAS, ...FIGURAS, MEDUSA, MEDUSA], generador(`${semilla}|parejas-vivo`));
    return { cartas, duenas: cartas.map(() => null), abiertas: [], turno: 'a', puntos: { a: 0, b: 0 }, tapa: 0 };
  },
  accion(e, a, lado, t) {
    const i = a.i;
    if (t < 0 || lado !== e.turno || e.tapa || !entero(i, 0, e.cartas.length) || e.duenas[i as number] || e.abiertas.includes(i as number)) return null;
    const k = i as number;
    if (e.cartas[k] === MEDUSA) return { ...e, duenas: e.duenas.map((d, j) => (j === k ? 'x' : d)), abiertas: [], turno: otro(lado), puntos: { ...e.puntos, [lado]: e.puntos[lado] - 1 } };
    const abiertas = [...e.abiertas, k];
    if (abiertas.length < 2) return { ...e, abiertas };
    const [x, y] = abiertas;
    if (e.cartas[x] === e.cartas[y]) return { ...e, abiertas: [], duenas: e.duenas.map((d, j) => (j === x || j === y ? lado : d)), puntos: { ...e.puntos, [lado]: e.puntos[lado] + 1 } };
    return { ...e, abiertas, tapa: t + MIRA }; // se ven un momento y después pasa el turno
  },
  tic(e, t) { return e.tapa && t >= e.tapa ? { ...e, abiertas: [], tapa: 0, turno: otro(e.turno) } : null; },
  marcador(e, t) { const pares = e.duenas.filter((d) => d === 'a' || d === 'b').length; return { a: e.puntos.a, b: e.puntos.b, fin: pares === FIGURAS.length * 2 || t >= LIMITE }; },
  valido(x): x is EstadoParejas {
    const e = x as EstadoParejas;
    return !!e && Array.isArray(e.cartas) && e.cartas.every((c) => typeof c === 'string') && Array.isArray(e.duenas) && e.duenas.length === e.cartas.length
      && Array.isArray(e.abiertas) && e.abiertas.every((i) => entero(i, 0, e.cartas.length)) && esLado(e.turno) && !!e.puntos && typeof e.tapa === 'number';
  },
  dibujar(m, enviar, yo) {
    const grilla = m.el('div', 'cartas', m.tablero);
    grilla.dataset.cartas = String(FIGURAS.length * 2 + 2);
    const botones = Array.from({ length: FIGURAS.length * 2 + 2 }, (_, i) => {
      const b = m.el('button', 'carta', grilla);
      b.setAttribute('aria-label', `Carta ${i + 1}`);
      m.el('span', 'cara', b);
      b.addEventListener('click', () => enviar({ i }));
      return b;
    });
    let antes = '';
    return (e, t, nombres) => {
      const firma = JSON.stringify([e.duenas, e.abiertas]);
      if (firma !== antes) {
        antes = firma;
        botones.forEach((b, i) => {
          const visible = !!e.duenas[i] || e.abiertas.includes(i), cara = b.querySelector('.cara') as HTMLElement;
          b.classList.toggle('abierta', visible);
          b.classList.toggle('lista', !!e.duenas[i]);
          b.style.outline = e.duenas[i] === 'a' || e.duenas[i] === 'b' ? `3px solid ${COLOR_LADO[e.duenas[i] as Lado]}` : '';
          if (visible && !cara.childElementCount && !cara.textContent) {
            if (e.cartas[i] === MEDUSA) cara.textContent = '🪼';
            else { const img = m.el('img', '', cara); img.src = `${import.meta.env.BASE_URL}figuras/${e.cartas[i]}.png`; img.alt = ''; }
          }
          if (!visible) cara.replaceChildren();
        });
      }
      const mio = yo === e.turno;
      grilla.classList.toggle('bloqueada', !mio);
      m.hud.tiempo(`Turno de ${nombres[e.turno]}`);
      m.hud.extra(mio ? '¡Tu turno!' : '');
      m.hud.puntos(`${nombres.a} ${e.puntos.a} · ${e.puntos.b} ${nombres.b}`);
      void t;
    };
  },
};
```

```ts
// src/vivo/tableros/index.ts (parte inicial)
import type { Reglas } from '../tablero';
import { parejas } from './parejas';

// Los juegos de mesa que se juegan en vivo. La clave es el id del juego (el mismo de su foto y de su versus).
export const TABLEROS: Record<string, Reglas<any>> = { parejas }; // eslint-disable-line @typescript-eslint/no-explicit-any
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx tsc --noEmit && node pruebas/vivo.mjs asientos`
Expected: `OK   reglas de asientos`

- [ ] **Step 5: Commit**

```bash
git add src/vivo/tableros src/vivo/PantallaVivo.tsx pruebas/vivo.mjs
git commit -m "En vivo: Parejas como memorice por turnos (reglas puras con pruebas)"
```

---

### Task 3: `SalaTablero` (la sala que hace correr cualquier tablero en vivo)

**Files:**
- Create: `src/vivo/SalaTablero.tsx`
- Modify: `src/vivo/PantallaVivo.tsx` (`Vivo` lista también los tableros y enruta; `SalaOficial` elige la sala según el juego)
- Modify: `src/estilos.css`
- Modify: `pruebas/vivo.mjs` (grupos `parejas`, `relevo`, `intrusoTablero`)

**Interfaces:**
- Consumes: `TABLEROS`, `Reglas`, `ladoDe`, `otro` (Tasks 1-2); `unirse`, `repartir`, `anunciarSala`, `asientosValidos`, `Oficial`, `V.empezarRonda`, `V.terminarRonda` (tanda 1).
- Produces: componente `SalaTablero({ codigo, mirar, oficial }: { codigo: string; mirar?: boolean; oficial?: Oficial })`; en desarrollo `window.__tablero = { estado(): unknown, lado(): Lado | null, t(): number }`.

Mensajes de la sala:

| Mensaje | Quién lo manda | Qué lleva |
|---|---|---|
| `estado` | anfitrión | `{ partida, asientos, v, e, t, fin }`: el estado entero, con versión y segundo de partida |
| `accion` | jugador | `{ partida, a }`: lo que tocó |
| `revancha` | jugador | `{ partida }`: la siguiente, con Listo de nuevo |
| `abandono` | jugador | `{ partida, ganador }` |
| `pedir` | cualquiera | sin datos: el anfitrión responde con `estado` |

Reglas del anfitrión: cuando los dos están Listo para la partida actual, arma el estado inicial (en un oficial, antes pide la semilla con `empezarRonda`; en un amistoso la semilla es el código de la sala más el número de partida), lo manda y empieza a contar desde −3 (cuenta regresiva). Cada 100 ms corre `tic` y `marcador`; si algo cambió, sube la versión y manda el estado. Además lo manda cada 2 s, para quien llega tarde. Cuando cambia el anfitrión, el nuevo sigue desde el último estado y su `t`.

- [ ] **Step 1: Escribir las pruebas de punta a punta**

```js
// pruebas/vivo.mjs — dentro de grupos
  // Parejas completa entre dos, con un espectador que entra tarde: todos terminan con el mismo marcador
  async parejas() {
    const sala = `parejas-P${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`);
    let c;
    try {
      for (const p of [a, b]) await hasta(() => p.js(`(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '¡Listo!'); if (x) x.click(); return !!x; })()`), 20000);
      await hasta(() => a.js('window.__tablero?.estado() != null'), 20000);
      c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
      // Juega quien tiene el turno: busca una pareja libre que sabe dónde está (lo hace el banco de pruebas, no el juego)
      for (let k = 0; k < 80; k++) {
        const e = await a.js('window.__tablero.estado()'), t = await a.js('window.__tablero.t()');
        if (!e || (await a.js('document.querySelector(".tablero-fin") != null'))) break;
        const quien = e.turno === (await a.js('window.__tablero.lado()')) ? a : b;
        if (t < 0 || e.tapa) { await new Promise((r) => setTimeout(r, 400)); continue; }
        const libre = e.cartas.findIndex((f, i) => f !== 'medusa' && !e.duenas[i]), par = e.cartas.findIndex((f, i) => i !== libre && f === e.cartas[libre] && !e.duenas[i]);
        if (libre < 0) break;
        await quien.js(`window.__tablero.enviar({ i: ${libre} })`); await new Promise((r) => setTimeout(r, 250));
        await quien.js(`window.__tablero.enviar({ i: ${par} })`); await new Promise((r) => setTimeout(r, 350));
      }
      const fin = await hasta(async () => { const fa = await a.js('document.querySelector(".tablero-fin")?.textContent'), fc = await c.js('document.querySelector(".tablero-fin")?.textContent'); return !!fa && fa === fc; }, 20000);
      const espectadorVioTablero = await c.js('document.querySelectorAll(".carta.lista").length') > 0;
      return { 'termina con el mismo resultado para todos': fin, 'el que entró tarde ve el tablero': espectadorVioTablero };
    } finally { a.cerrar(); b.cerrar(); c?.cerrar(); }
  },
  // El anfitrión se va a media partida: el otro sigue desde el mismo estado y con el reloj adelantado
  async relevo() {
    const sala = `numeros-R${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`);
    try {
      for (const p of [a, b]) await hasta(() => p.js(`(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '¡Listo!'); if (x) x.click(); return !!x; })()`), 20000);
      await hasta(async () => ((await b.js('window.__tablero?.t()')) ?? -9) > 2, 20000);
      await b.js('window.__tablero.enviar({ n: 1 })');
      await hasta(async () => (await a.js('window.__tablero.estado()?.sigue')) === 2);
      const tAntes = await b.js('window.__tablero.t()');
      a.cerrar();
      await new Promise((r) => setTimeout(r, 4000));
      await b.js('window.__tablero.enviar({ n: 2 })');
      const sigue = await hasta(async () => (await b.js('window.__tablero.estado()?.sigue')) === 3, 15000);
      const reloj = (await b.js('window.__tablero.t()')) > tAntes + 3;
      return { 'el otro jugador toma el mando': sigue, 'el reloj no vuelve a cero': reloj };
    } finally { b.cerrar(); }
  },
  // Un espectador manda acciones: no cambian el tablero
  async intrusoTablero() {
    const sala = `numeros-I${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
    try {
      for (const p of [a, b]) await hasta(() => p.js(`(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '¡Listo!'); if (x) x.click(); return !!x; })()`), 20000);
      await hasta(async () => ((await a.js('window.__tablero?.t()')) ?? -9) > 1, 20000);
      await c.js(`window.__sala.enviarCrudo('accion', { partida: 1, a: { n: 1 } })`);
      await c.js(`window.__sala.enviarCrudo('estado', { partida: 1, asientos: ['inv-a', 'inv-b'], v: 999, e: { orden: [], sigue: 26, duenos: [], errores: { a: 0, b: 0 }, mezclas: 0 }, t: 50, fin: { a: 0, b: 250 } })`);
      await new Promise((r) => setTimeout(r, 2500));
      return { 'el espectador no cambia nada': (await a.js('window.__tablero.estado()?.sigue')) === 1 && !(await a.js('document.querySelector(".tablero-fin")')) };
    } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
  },
```

(`relevo` e `intrusoTablero` usan Cazanúmeros, de la Task 4; corren después de ella.)

- [ ] **Step 2: Correr `parejas` y ver que falla**

Run: `node pruebas/vivo.mjs parejas`
Expected: FALLA (no existe la sala de tablero).

- [ ] **Step 3: Escribir la sala**

```tsx
// src/vivo/SalaTablero.tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { useSesion } from '../nucleo/supabase';
import * as V from '../juegos/duelos';
import { crearMesa, type Mesa } from '../juegos/tablero/mesa';
import { repartir, rondaSiguiente } from './asientos';
import { asientosValidos, debeReiniciar, identidadVivo, type Oficial } from './PantallaVivo';
import { unirse, type Presente, type Sala } from './sala';
import { ladoDe, type Lado, type Marcador } from './tablero';
import { TABLEROS } from './tableros';
import { anunciarSala } from './vestibulo';

// La sala de los juegos de mesa en vivo. El anfitrión aplica las acciones, avanza el reloj y reparte el estado;
// los demás lo dibujan. Asientos, ojo, Partidas en línea, abandono y guardado oficial funcionan igual que en Conchas.
const ESPERA_ABANDONO = 30, CUENTA = 3;
interface Partida { partida: number; asientos: [string, string] | null; v: number; e: unknown; t: number; fin: { a: number; b: number } | null; abandono: string | null }
const nueva = (partida = 1): Partida => ({ partida, asientos: null, v: 0, e: null, t: -CUENTA, fin: null, abandono: null });

export function SalaTablero({ codigo, mirar = false, oficial }: { codigo: string; mirar?: boolean; oficial?: Oficial }) {
  const sesion = useSesion();
  const juego = oficial?.e.juego ?? codigo.split('-')[0], reglas = TABLEROS[juego];
  const yo = identidadVivo(sesion.usuarioId, sesion.perfil?.nombre);
  const fijos = oficial ? [oficial.e.a_perfil!, oficial.e.b_perfil!] as [string, string] : null;
  const quiere = mirar || (fijos && !fijos.includes(yo.id)) ? 'mirar' : 'jugar';
  const primera = oficial ? rondaSiguiente(oficial.jugadas, oficial.e.rondas) ?? oficial.e.rondas : 1;
  const [p, setP] = useState<Partida>(() => { let g = nueva(primera); try { g = { ...g, ...JSON.parse(localStorage.getItem(`susto.vivo.${codigo}`) ?? '{}') }; } catch { /* sin respaldo */ } return debeReiniciar(g.partida, primera, !!oficial) ? nueva(primera) : g; });
  const [presentes, setPresentes] = useState<Presente[]>([]);
  const [aviso, setAviso] = useState(''), [ahora, setAhora] = useState(Date.now()), [ausente, setAusente] = useState<number | null>(null);
  const sala = useRef<Sala | null>(null), est = useRef(p), recibido = useRef(performance.now()), anfitrionRef = useRef<string | null>(null), sentadosRef = useRef<string[]>([]);
  est.current = p;
  // `t` vale en el momento en que llegó (o se calculó) el estado: el reloj local lo adelanta
  const cambiar = (f: (x: Partida) => Partida) => setP((x) => { const y = f(x); if (y !== x) { est.current = y; recibido.current = performance.now(); } return y; });
  const tAhora = () => est.current.t + (est.current.fin ? 0 : (performance.now() - recibido.current) / 1000);

  useEffect(() => { try { localStorage.setItem(`susto.vivo.${codigo}`, JSON.stringify(p)); } catch { /* sin almacenamiento */ } }, [p]);
  useEffect(() => { const r = setInterval(() => setAhora(Date.now()), 250); return () => clearInterval(r); }, []);

  useEffect(() => {
    if (sesion.cargando || !reglas) return;
    let ultimoPedido = 0;
    const pedir = () => { if (Date.now() - ultimoPedido > 3000) { ultimoPedido = Date.now(); s.enviar('pedir', {}); } };
    const s = unirse(codigo, yo, quiere, setPresentes, (evento, d, de) => {
      const x = est.current, quien = de.split(':')[0], sentados = x.asientos ?? fijos ?? sentadosRef.current, sentado = sentados.includes(quien), deAnfitrion = de === anfitrionRef.current;
      // shortcut: el remitente se puede falsificar por el respaldo de Supabase; frena a un espectador común (ver tanda 1)
      if (evento === 'pedir') { if (x.asientos && s.clave === anfitrionRef.current) s.enviar('estado', { ...x, t: tAhora() }); return; }
      if (evento === 'estado') {
        if (!(deAnfitrion || sentado) || !Number.isInteger(d.partida) || !asientosValidos(d.asientos, fijos) || !reglas.valido(d.e) || !Number.isInteger(d.v) || typeof d.t !== 'number') return;
        if ((d.partida as number) < x.partida || ((d.partida as number) === x.partida && (d.v as number) <= x.v)) return;
        cambiar(() => ({ partida: d.partida as number, asientos: d.asientos as [string, string], v: d.v as number, e: d.e, t: d.t as number, fin: (d.fin as Partida['fin']) ?? null, abandono: typeof d.abandono === 'string' ? d.abandono : null }));
        return;
      }
      if (!sentado) return;
      if (evento === 'revancha') { if (d.partida === x.partida + 1) { cambiar(() => nueva(x.partida + 1)); s.marcarListo(0); } return; }
      if (evento === 'abandono') { if (d.partida === x.partida && typeof d.ganador === 'string' && x.asientos?.includes(d.ganador)) cambiar((y) => (y.abandono ? y : { ...y, abandono: d.ganador as string })); return; }
      if (evento === 'accion' && s.clave === anfitrionRef.current) {
        if (d.partida !== x.partida || !x.asientos || x.fin || x.abandono) { if ((d.partida as number) > x.partida) pedir(); return; }
        aplicar(ladoDe(x.asientos, quien), d.a as Record<string, unknown>);
      }
    }, fijos);
    sala.current = s;
    const t0 = setTimeout(() => s.enviar('pedir', {}), 800);
    return () => { clearTimeout(t0); s.salir(); };
  }, [codigo, sesion.cargando, yo.id]);

  /** El anfitrión aplica una acción y reparte el estado nuevo. */
  const aplicar = (lado: Lado | null, a: Record<string, unknown>) => {
    const x = est.current;
    if (!lado || !x.asientos || x.e == null || !a || typeof a !== 'object') return;
    const e = reglas.accion(x.e as never, a, lado, tAhora());
    if (!e) return;
    const y = { ...x, e, v: x.v + 1, t: tAhora() };
    cambiar(() => y);
    sala.current?.enviar('estado', y);
  };

  const { asientos } = p;
  const reparto = repartir(presentes, asientos, fijos), sentados = reparto.jugadores;
  sentadosRef.current = sentados;
  anfitrionRef.current = repartir(presentes, null, fijos).anfitrion;
  const soyAnfitrion = !!anfitrionRef.current && anfitrionRef.current === sala.current?.clave;
  const nombre = (id: string) => presentes.find((x) => x.id === id)?.nombre ?? oficial?.personas.find((x) => x.id === id)?.nombre ?? 'Jugador';
  const miLado = asientos ? ladoDe(asientos, yo.id) : null, soyJugador = sentados.includes(yo.id), rivalId = sentados.find((id) => id !== yo.id) ?? '';
  const listos = sentados.length === 2 && sentados.every((id) => presentes.some((x) => x.id === id && x.listo === p.partida));
  const yoListo = presentes.some((x) => x.id === yo.id && x.listo === p.partida);
  const rivalEnOtraRonda = !!oficial && presentes.some((x) => x.id === rivalId && x.listo > 0 && x.listo !== p.partida);

  // Abrir la ronda (oficial) y armar el estado inicial: lo hace el anfitrión cuando los dos están listos
  const abiertas = useRef(new Set(oficial?.empezadas ?? [])), guardadas = useRef(new Set(oficial?.jugadas ?? []));
  useEffect(() => {
    if (asientos || !listos || !soyAnfitrion) return;
    const a = (p.partida % 2 ? [...sentados] : [...sentados].reverse()) as [string, string];
    const arrancar = (semilla: string) => { const y: Partida = { ...est.current, asientos: a, e: reglas.inicial(semilla, oficial?.e.jornada ?? 1), v: 1, t: -CUENTA, fin: null, abandono: null }; cambiar(() => y); sala.current?.enviar('estado', y); };
    if (!oficial) return arrancar(`${codigo}|${p.partida}`);
    // En un oficial, la semilla la da el servidor (la misma para los dos): el anfitrión abre su ronda y la usa
    abiertas.current.add(p.partida);
    V.empezarRonda(oficial.e.id, p.partida).then((r) => { if (r.semilla) arrancar(r.semilla); else setAviso(r.error ?? 'No se pudo abrir la ronda.'); });
  }, [listos, !!asientos, soyAnfitrion]);
  // El otro jugador del oficial abre su propia ronda al ver el tablero
  useEffect(() => {
    if (!oficial || !asientos || !soyJugador || abiertas.current.has(p.partida)) return;
    abiertas.current.add(p.partida);
    V.empezarRonda(oficial.e.id, p.partida).then((r) => { if (r.error && !/ya jugaste/i.test(r.error)) setAviso(r.error); });
  }, [!!asientos, soyJugador, p.partida]);

  // Reloj del anfitrión: avanza el juego, revisa el final y reparte el estado (cada 2 s aunque no cambie)
  useEffect(() => {
    if (!soyAnfitrion || !asientos || p.fin || p.abandono) return;
    let ultimoEnvio = 0;
    const r = setInterval(() => {
      const x = est.current;
      if (x.e == null || x.fin || x.abandono) return;
      const t = tAhora(), e = reglas.tic?.(x.e as never, t) ?? x.e, m: Marcador = reglas.marcador(e as never, t);
      const cambio = e !== x.e || m.fin;
      if (!cambio && performance.now() - ultimoEnvio < 2000) return;
      const y = { ...x, e, t, v: x.v + (cambio ? 1 : 0), fin: m.fin ? { a: m.a, b: m.b } : null };
      if (cambio) cambiar(() => y); else { est.current = { ...x, t }; recibido.current = performance.now(); }
      sala.current?.enviar('estado', y);
      ultimoEnvio = performance.now();
    }, 100);
    return () => clearInterval(r);
  }, [soyAnfitrion, !!asientos, !!p.fin, !!p.abandono, p.partida]);

  // Abandono firme (igual que en Conchas)
  const rivalPresente = presentes.some((x) => x.id === rivalId), corre = !!asientos && soyJugador && !p.fin && !p.abandono && !rivalPresente && presentes.length > 0;
  useEffect(() => { setAusente((a) => (corre ? a ?? Date.now() : null)); }, [corre]);
  const quedan = ausente ? Math.max(0, ESPERA_ABANDONO - Math.floor((ahora - ausente) / 1000)) : null;
  useEffect(() => {
    if (quedan !== 0 || p.abandono || !soyJugador) return;
    cambiar((x) => ({ ...x, abandono: yo.id, v: x.v + 1 }));
    sala.current?.enviar('abandono', { partida: p.partida, ganador: yo.id });
  }, [quedan === 0]);

  // Guardar el resultado oficial: cada jugador guarda su propio puntaje
  const resultado = p.abandono ? { gano: p.abandono } : p.fin && asientos ? { gano: p.fin.a > p.fin.b ? asientos[0] : p.fin.b > p.fin.a ? asientos[1] : 'empate' } : null;
  useEffect(() => {
    if (!oficial || !resultado || !miLado || guardadas.current.has(p.partida)) return;
    guardadas.current.add(p.partida);
    const propio = p.abandono ? (p.abandono === yo.id ? 1 : 0) : p.fin![miLado];
    V.terminarRonda(oficial.e.id, p.partida, Math.max(0, Math.round(propio * 10)), { vivo: true, juego, abandono: !!p.abandono, marcador: p.fin }).then((error) => { if (error && !/no está en juego/i.test(error)) { guardadas.current.delete(p.partida); setAviso(`No se pudo guardar el resultado: ${error}`); } });
  }, [!!resultado, p.partida]);

  // Partidas en línea
  const anuncio = useRef<ReturnType<typeof anunciarSala> | null>(null);
  anuncio.current ??= anunciarSala();
  useEffect(() => () => anuncio.current?.cerrar(), []);
  useEffect(() => {
    anuncio.current?.poner(soyAnfitrion && reglas ? { codigo, juego, a: sentados[0] ? nombre(sentados[0]) : '', b: sentados[1] ? nombre(sentados[1]) : '', estado: !asientos ? 'esperando' : resultado ? 'terminada' : 'jugando', turno: '', espectadores: reparto.espectadores.length, oficial: !!oficial, desde: Date.now() } : null);
  });

  // La mesa: se arma una vez por partida y se repinta con cada estado y cada décima de segundo
  const caja = useRef<HTMLDivElement>(null), mesa = useRef<{ m: Mesa; pintar: (e: never, t: number, n: { a: string; b: string }) => void; partida: number } | null>(null);
  const enviarAccion = (a: Record<string, unknown>) => { if (!miLado) return; if (soyAnfitrion) aplicar(miLado, a); else sala.current?.enviar('accion', { partida: est.current.partida, a }); };
  const enviarRef = useRef(enviarAccion);
  enviarRef.current = enviarAccion;
  useEffect(() => {
    if (!caja.current || !asientos || p.e == null) return;
    if (mesa.current?.partida !== p.partida) {
      mesa.current?.m.destruir();
      const m = crearMesa(caja.current, `${juego} vivo-mesa`);
      m.empezar();
      mesa.current = { m, pintar: reglas.dibujar(m, (a) => enviarRef.current(a), miLado), partida: p.partida };
    }
    const n = { a: nombre(asientos[0]), b: nombre(asientos[1]) };
    mesa.current.pintar(p.e as never, tAhora(), n);
    const r = setInterval(() => mesa.current?.pintar(est.current.e as never, tAhora(), n), 100);
    return () => clearInterval(r);
  });
  useEffect(() => () => mesa.current?.m.destruir(), []);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tablero = { estado: () => est.current.e, lado: () => miLado, t: tAhora, enviar: (a: Record<string, unknown>) => enviarRef.current(a) };

  if (!reglas) return <><h1>Sala no encontrada</h1><p><a class="boton" href="#/juegos/vivo">Volver al juego en vivo</a></p></>;
  if (sesion.cargando) return <p class="tenue">Cargando…</p>;
  const t = tAhora();
  const textoFin = !resultado ? '' : p.abandono ? (p.abandono === yo.id ? '¡Ganaste por abandono!' : `${nombre(p.abandono)} ganó por abandono.`)
    : resultado.gano === 'empate' ? `Empate ${p.fin!.a} a ${p.fin!.b}` : `Ganó ${nombre(resultado.gano)} · ${p.fin!.a} a ${p.fin!.b}`;
  const revancha = () => { sala.current?.enviar('revancha', { partida: p.partida + 1 }); cambiar(() => nueva(p.partida + 1)); sala.current?.marcarListo(0); };

  return (
    <div class="vivo">
      <div class="sigla">{oficial ? `En vivo · oficial · ronda ${p.partida} de ${oficial.e.rondas}` : `En vivo · amistoso · sala ${codigo}`}</div>
      {aviso && <p class="aviso atencion">{aviso}</p>}
      <h1>{reglas.nombre}</h1>
      <div class="fila vivo-cabecera">
        <span class="vivo-ojo" title="Personas mirando">👁 {reparto.espectadores.length}</span>
        {!asientos && !soyJugador && sentados.length < 2 && !oficial && <button class="boton principal vivo-quiero" onClick={() => sala.current?.quiero('jugar')}>Quiero jugar</button>}
      </div>
      <p class="tenue">{reglas.idea}</p>
      <ul class="vivo-gente">
        {sentados.map((id, i) => <li key={id} class="juega"><b>{nombre(id)}{id === yo.id ? ' (tú)' : ''}</b><span class="tenue chico">{i === 0 ? 'Azul' : 'Rojo'}{!asientos ? (presentes.some((x) => x.id === id && x.listo === p.partida) ? ' · listo' : ' · esperando') : presentes.some((x) => x.id === id) ? '' : ' · desconectado'}</span></li>)}
      </ul>
      {!asientos && (sentados.length < 2 ? <p class="aviso atencion">Esperando a otra persona. Comparte el enlace de la sala.</p>
        : rivalEnOtraRonda ? <p class="aviso atencion">Tu rival está en otra ronda (ya jugó una a su hora): terminen esta ronda en diferido.</p>
        : soyJugador ? <button class="boton principal grande" onClick={() => sala.current?.marcarListo(yoListo ? 0 : p.partida)}>{yoListo ? 'Ya no estoy listo' : '¡Listo!'}</button>
        : <p class="tenue">La partida parte cuando los dos jugadores marquen Listo. Tú miras.</p>)}
      {quedan !== null && quedan > 0 && <p class="aviso atencion">{nombre(rivalId)} se desconectó. Si no vuelve en {quedan} s, ganas por abandono.</p>}
      {asientos && t < 0 && !resultado && <div class="tablero-cuenta">{Math.ceil(-t)}</div>}
      <div ref={caja} class="tablero-caja" />
      {textoFin && <p class="aviso ok vivo-fin tablero-fin">{textoFin}</p>}
      {resultado && (oficial && p.partida >= oficial.e.rondas
        ? <div class="fila"><a class="boton principal" href={`#/juegos/duelo/${oficial.e.id}`}>Enfrentamiento terminado: ver resultado</a></div>
        : soyJugador && <div class="fila"><button class="boton principal" onClick={revancha}>{oficial ? 'Siguiente ronda' : 'Revancha'}</button></div>)}
    </div>
  );
}
```

En `PantallaVivo.tsx`: exportar `identidad` como `identidadVivo` (alias) y `debeReiniciar` (ya exportada). `Vivo`: si el código empieza por un id de `TABLEROS`, renderiza `<SalaTablero codigo={codigo} mirar={mirar} />`; la lista de "Crear sala" muestra también los cinco tableros (con su foto). `SalaOficial`: si `TABLEROS[e.juego]`, renderiza `<SalaTablero codigo={`enf-${id}`} mirar={mirar} oficial={datos} />`; ya no exige `e.juego in JUEGOS` para esos. En `estilos.css`:

```css
.tablero-caja { position: relative; min-height: 420px; border-radius: 16px; overflow: hidden; }
.tablero-caja .mesa-avatar { display: none; }
.tablero-cuenta { font: 400 4rem var(--display); text-align: center; color: var(--luna); }
.vivo-mesa .cartas.bloqueada { opacity: .85; pointer-events: none; }
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx tsc --noEmit && node pruebas/vivo.mjs parejas`
Expected: los dos `OK`.

- [ ] **Step 5: Commit**

```bash
git add src/vivo/SalaTablero.tsx src/vivo/PantallaVivo.tsx src/estilos.css pruebas/vivo.mjs
git commit -m "En vivo: sala de tablero (anfitrión con reloj, estado versionado, espectadores, oficial) y Parejas jugable"
```

---

### Task 4: Cazanúmeros en vivo

**Files:**
- Create: `src/vivo/tableros/numeros.ts`
- Modify: `src/vivo/tableros/index.ts` (registro y pruebas)

**Interfaces:**
- Consumes: `Reglas`, `COLOR_LADO`, `entero`, `esLado`; `barajar`, `generador`.
- Produces: `numeros: Reglas<EstadoNumeros>` con `EstadoNumeros = { semilla: string; orden: number[]; sigue: number; duenos: (Lado | null)[]; errores: Record<Lado, number>; mezclas: number }` (la semilla viaja en el estado para que cualquier anfitrión vuelva a mezclar igual).

- [ ] **Step 1: Pruebas (agregar a `probarTableros`)**

```ts
  let n = numeros.inicial('prueba', 1);
  n = numeros.accion(n, { n: 1 }, 'a', 1)!;
  igual('números: el que sigue es tuyo', [n.duenos[0], n.sigue], ['a', 2]);
  igual('números: tocar uno ya tomado no castiga', numeros.accion(n, { n: 1 }, 'b', 1.1), null);
  n = numeros.accion(n, { n: 5 }, 'b', 1.2)!;
  igual('números: tocar uno adelantado resta', n.errores.b, 1);
  igual('números: antes de partir no vale', numeros.accion(numeros.inicial('x', 1), { n: 1 }, 'a', -1), null);
  igual('números: marcador', numeros.marcador(n, 2), { a: 10, b: -3, fin: false });
```

Run: `npx tsc --noEmit; node pruebas/vivo.mjs asientos` → FALLA.

- [ ] **Step 2: Reglas y dibujo**

```ts
// src/vivo/tableros/numeros.ts
import { generador } from '../../nucleo/azar';
import { barajar } from '../../juegos/tablero/mesa';
import { COLOR_LADO, entero, esLado, type Lado, type Reglas } from '../tablero';

// Cazanúmeros en vivo: un solo tablero para los dos. El número que sigue es de quien lo toca primero;
// tocar uno adelantado resta. Cada cinco números, las fichas que quedan cambian de lugar.
const TOTAL = 25, LIMITE = 75, CADA = 5;
export interface EstadoNumeros { semilla: string; orden: number[]; sigue: number; duenos: (Lado | null)[]; errores: Record<Lado, number>; mezclas: number }
const lugares = (semilla: string, mezclas: number) => barajar(Array.from({ length: TOTAL }, (_, i) => i + 1), generador(`${semilla}|numeros-vivo|${mezclas}`));

export const numeros: Reglas<EstadoNumeros> = {
  id: 'numeros', nombre: 'Cazanúmeros', idea: 'Un tablero para los dos: el número que sigue es de quien lo toca primero.',
  inicial(semilla) { return { semilla, orden: lugares(semilla, 0), sigue: 1, duenos: Array(TOTAL).fill(null), errores: { a: 0, b: 0 }, mezclas: 0 }; },
  accion(e, a, lado, t) {
    if (t < 0 || !entero(a.n, 1, TOTAL + 1) || e.sigue > TOTAL) return null;
    const n = a.n as number;
    if (n < e.sigue) return null; // ya lo tomó alguien (los dos lo tocaron casi a la vez): sin castigo
    if (n > e.sigue) return { ...e, errores: { ...e.errores, [lado]: e.errores[lado] + 1 } };
    const sigue = e.sigue + 1, mezcla = (sigue - 1) % CADA === 0 && sigue <= TOTAL;
    return { ...e, sigue, duenos: e.duenos.map((d, i) => (i === n - 1 ? lado : d)), mezclas: e.mezclas + (mezcla ? 1 : 0), orden: mezcla ? lugares(e.semilla, e.mezclas + 1) : e.orden };
  },
  marcador(e, t) {
    const de = (l: Lado) => e.duenos.filter((d) => d === l).length * 10 - e.errores[l] * 3;
    return { a: de('a'), b: de('b'), fin: e.sigue > TOTAL || t >= LIMITE };
  },
  valido(x): x is EstadoNumeros {
    const e = x as EstadoNumeros;
    return !!e && typeof e.semilla === 'string' && Array.isArray(e.orden) && e.orden.length === TOTAL && entero(e.sigue, 1, TOTAL + 2) && Array.isArray(e.duenos) && e.duenos.every((d) => d === null || esLado(d)) && !!e.errores;
  },
  dibujar(m, enviar) {
    const grilla = m.el('div', 'numeros', m.tablero);
    const botones = Array.from({ length: TOTAL }, () => { const b = m.el('button', 'numero', grilla); b.addEventListener('click', () => enviar({ n: Number(b.textContent) })); return b; });
    let antes = '';
    return (e, t, nombres) => {
      const firma = `${e.mezclas}|${e.sigue}`;
      if (firma !== antes) {
        antes = firma;
        e.orden.forEach((n, i) => {
          const b = botones[i], dueno = e.duenos[n - 1];
          b.textContent = String(n);
          b.disabled = !!dueno;
          b.style.background = dueno ? COLOR_LADO[dueno] : '';
          b.style.opacity = dueno ? '0.55' : '';
        });
      }
      const sc = numeros.marcador(e, t);
      m.hud.tiempo(`${Math.max(0, Math.ceil(LIMITE - Math.max(0, t)))} s`);
      m.hud.extra(`Busca el ${Math.min(e.sigue, TOTAL)}`);
      m.hud.puntos(`${nombres.a} ${sc.a} · ${sc.b} ${nombres.b}`);
    };
  },
};
```

Registrar en `TABLEROS`: `{ parejas, numeros }`.

- [ ] **Step 3: Pruebas**

Run: `npx tsc --noEmit && node pruebas/vivo.mjs asientos && node pruebas/vivo.mjs relevo && node pruebas/vivo.mjs intrusoTablero`
Expected: todo `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/vivo/tableros
git commit -m "En vivo: Cazanúmeros con un tablero compartido"
```

---

### Task 5: Tinta Tramposa en vivo

**Files:**
- Create: `src/vivo/tableros/tinta.ts`
- Modify: `src/vivo/tableros/index.ts`

**Interfaces:**
- Produces: `tinta: Reglas<EstadoTinta>` con `EstadoTinta = { semilla: string; k: number; fuera: Lado[]; ganadas: (Lado | null)[]; pausa: number }`, y `rondaTinta(semilla: string, k: number): { color: number; texto: number; n: number; alReves: boolean }`.

- [ ] **Step 1: Pruebas**

```ts
  let ti = tinta.inicial('prueba', 1);
  const r0 = rondaTinta('prueba', 0), bien = r0.alReves ? r0.texto : r0.color, mal = (bien + 1) % r0.n;
  ti = tinta.accion(ti, { i: mal }, 'a', 1)!;
  igual('tinta: quien se equivoca queda fuera de la ronda', [ti.fuera, tinta.accion(ti, { i: bien }, 'a', 1.1)], [['a'], null]);
  ti = tinta.accion(ti, { i: bien }, 'b', 1.2)!;
  igual('tinta: el primero que acierta gana la ronda', ti.ganadas[0], 'b');
  igual('tinta: el segundo acierto de la misma ronda no cuenta', tinta.accion(ti, { i: bien }, 'a', 1.25), null);
  ti = tinta.tic!(ti, 2.5)!;
  igual('tinta: tras la pausa viene la ronda siguiente', [ti.k, ti.fuera], [1, []]);
```

- [ ] **Step 2: Reglas y dibujo**

```ts
// src/vivo/tableros/tinta.ts
import { azar } from '../../nucleo/azar';
import { COLOR_LADO, entero, esLado, otro, type Lado, type Reglas } from '../tablero';

// Tinta Tramposa en vivo: veinte rondas con la misma palabra para los dos. Gana la ronda quien responde bien
// primero; quien se equivoca queda fuera de esa ronda. Cada tanto la regla se da vuelta y vale lo que DICE.
const COLORES: [string, string][] = [['Rojo', '#e5484d'], ['Azul', '#3b82f6'], ['Verde', '#30a46c'], ['Amarillo', '#d9a400'], ['Morado', '#9b59d0'], ['Naranjo', '#f76b15']];
const RONDAS = 20, PAUSA = 0.9;
export interface EstadoTinta { semilla: string; k: number; fuera: Lado[]; ganadas: (Lado | null)[]; pausa: number }
export function rondaTinta(semilla: string, k: number) {
  const n = k >= 8 ? 6 : 4, color = Math.floor(azar(semilla, 'tinta', k, 'c') * n), engana = azar(semilla, 'tinta', k, 'e') < 0.75;
  const texto = engana ? (color + 1 + Math.floor(azar(semilla, 'tinta', k, 't') * (n - 1))) % n : color;
  return { color, texto, n, alReves: k >= 6 && azar(semilla, 'tinta', k, 'r') < 0.25 };
}
const correcta = (semilla: string, k: number) => { const r = rondaTinta(semilla, k); return r.alReves ? r.texto : r.color; };

export const tinta: Reglas<EstadoTinta> = {
  id: 'tinta', nombre: 'Tinta Tramposa', idea: 'La misma palabra para los dos: el punto es de quien responde bien primero.',
  inicial(semilla) { return { semilla, k: 0, fuera: [], ganadas: [], pausa: 0 }; },
  accion(e, a, lado, t) {
    if (t < 0 || e.pausa || e.k >= RONDAS || e.fuera.includes(lado) || !entero(a.i, 0, COLORES.length)) return null;
    if (a.i !== correcta(e.semilla, e.k)) { const fuera = [...e.fuera, lado]; return { ...e, fuera, pausa: fuera.length === 2 ? t + PAUSA : 0, ganadas: fuera.length === 2 ? [...e.ganadas, null] : e.ganadas }; }
    return { ...e, ganadas: [...e.ganadas, lado], pausa: t + PAUSA };
  },
  tic(e, t) { return e.pausa && t >= e.pausa ? { ...e, k: e.k + 1, fuera: [], pausa: 0 } : null; },
  marcador(e) { return { a: e.ganadas.filter((g) => g === 'a').length, b: e.ganadas.filter((g) => g === 'b').length, fin: e.k >= RONDAS }; },
  valido(x): x is EstadoTinta { const e = x as EstadoTinta; return !!e && typeof e.semilla === 'string' && entero(e.k, 0, RONDAS + 1) && Array.isArray(e.fuera) && e.fuera.every(esLado) && Array.isArray(e.ganadas) && typeof e.pausa === 'number'; },
  dibujar(m, enviar, yo) {
    const ayuda = m.el('p', 'tinta-ayuda', m.tablero), palabra = m.el('div', 'tinta-palabra', m.tablero), barra = m.el('div', 'tinta-botones', m.tablero);
    const botones = COLORES.map(([nombre], i) => { const b = m.el('button', 'boton grande', barra, `${i + 1} · ${nombre}`); b.addEventListener('click', () => enviar({ i })); return b; });
    m.escuchar('keydown', (ev) => { const i = Number(ev.key) - 1; if (i >= 0 && i < COLORES.length && !botones[i].hidden && !ev.repeat) enviar({ i }); });
    return (e, t, nombres) => {
      const r = rondaTinta(e.semilla, Math.min(e.k, RONDAS - 1)), ultima = e.ganadas[e.ganadas.length - 1];
      ayuda.textContent = r.alReves ? '¿Qué color DICE la palabra?' : '¿De qué color está pintada la palabra?';
      ayuda.classList.toggle('reves', r.alReves);
      palabra.textContent = t < 0 ? '…' : COLORES[r.texto][0];
      palabra.style.color = COLORES[r.color][1];
      botones.forEach((b, i) => { b.hidden = i >= r.n; b.disabled = !yo || !!e.pausa || e.fuera.includes(yo); });
      const sc = tinta.marcador(e, t);
      m.hud.tiempo(`Ronda ${Math.min(e.k + 1, RONDAS)} de ${RONDAS}`);
      m.hud.extra(e.pausa ? (ultima ? `¡Punto para ${nombres[ultima]}!` : 'Nadie acertó') : yo && e.fuera.includes(yo) ? 'Fallaste: espera la próxima' : yo && e.fuera.includes(otro(yo)) ? 'Tu rival falló: ¡tranquilo!' : '');
      m.hud.puntos(`${nombres.a} ${sc.a} · ${sc.b} ${nombres.b}`);
      palabra.style.textShadow = e.pausa && ultima ? `0 0 18px ${COLOR_LADO[ultima]}` : '';
    };
  },
};
```

Registrar en `TABLEROS`.

- [ ] **Step 3: Pruebas** — Run: `npx tsc --noEmit && node pruebas/vivo.mjs asientos` → `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/vivo/tableros
git commit -m "En vivo: Tinta Tramposa por rondas, el punto para quien acierta primero"
```

---

### Task 6: Eco del Templo en vivo ("Simón dice" por turnos)

**Files:**
- Create: `src/vivo/tableros/eco.ts`
- Modify: `src/vivo/tableros/index.ts`

**Interfaces:**
- Produces: `eco: Reglas<EstadoEco>` con `EstadoEco = { semilla: string; largo: number; turno: Lado; paso: number; muestra: number; perdio: Lado | null; aciertos: Record<Lado, number> }` y `finMuestra(e: EstadoEco): number`.

- [ ] **Step 1: Pruebas**

```ts
  let ec = eco.inicial('prueba', 1);
  const sec = secuenciaEco('prueba');
  igual('eco: mientras se muestra no se toca', eco.accion(ec, { i: sec[0] }, 'a', 0.1), null);
  ec = eco.accion(ec, { i: sec[0] }, 'a', finMuestra(ec) + 0.1)!;
  igual('eco: tras repetir A, le toca a B con la misma secuencia', [ec.turno, ec.largo], ['b', 1]);
  ec = eco.accion(ec, { i: sec[0] }, 'b', finMuestra(ec) + 0.1)!;
  igual('eco: tras los dos, la secuencia crece y vuelve A', [ec.turno, ec.largo], ['a', 2]);
  ec = eco.accion(ec, { i: (sec[0] + 1) % 6 }, 'a', finMuestra(ec) + 0.1)!;
  igual('eco: equivocarse termina', [ec.perdio, eco.marcador(ec, 30).fin], ['a', true]);
```

- [ ] **Step 2: Reglas y dibujo**

```ts
// src/vivo/tableros/eco.ts
import { generador } from '../../nucleo/azar';
import { esLado, otro, type Lado, type Reglas } from '../tablero';

// Eco del Templo en vivo: "Simón dice" de a dos. La secuencia se muestra a todos, la repite A y después B
// (la misma), y entonces crece una piedra. Pierde el primero que se equivoca.
const PIEDRAS = 6, MAXIMO = 20, TONOS = [262, 330, 392, 523, 587, 659];
export interface EstadoEco { semilla: string; largo: number; turno: Lado; paso: number; muestra: number; perdio: Lado | null; aciertos: Record<Lado, number> }
export const secuenciaEco = (semilla: string) => { const r = generador(`${semilla}|eco-vivo`); return Array.from({ length: MAXIMO }, () => Math.floor(r() * PIEDRAS)); };
const ritmo = (largo: number) => Math.max(0.3, 0.55 - largo * 0.015);
export const finMuestra = (e: EstadoEco) => e.muestra + 0.7 + e.largo * ritmo(e.largo);

export const eco: Reglas<EstadoEco> = {
  id: 'eco', nombre: 'Eco del Templo', idea: '"Simón dice" de a dos: la misma secuencia para los dos, y crece. Pierde quien se equivoca primero.',
  inicial(semilla) { return { semilla, largo: 1, turno: 'a', paso: 0, muestra: 0, perdio: null, aciertos: { a: 0, b: 0 } }; },
  accion(e, a, lado, t) {
    if (e.perdio || lado !== e.turno || t < finMuestra(e) || !Number.isInteger(a.i)) return null;
    if (a.i !== secuenciaEco(e.semilla)[e.paso]) return { ...e, perdio: lado };
    const paso = e.paso + 1;
    if (paso < e.largo) return { ...e, paso };
    const aciertos = { ...e.aciertos, [lado]: e.aciertos[lado] + 1 };
    // Terminó su turno: le toca al otro con la misma secuencia, o crece si ya repitieron los dos
    if (lado === 'a') return { ...e, aciertos, turno: 'b', paso: 0, muestra: t + 0.6 };
    if (e.largo >= MAXIMO) return { ...e, aciertos, largo: e.largo + 1 };
    return { ...e, aciertos, turno: 'a', paso: 0, largo: e.largo + 1, muestra: t + 0.6 };
  },
  marcador(e) { return { a: e.aciertos.a * 10 + (e.perdio === 'b' ? 100 : 0), b: e.aciertos.b * 10 + (e.perdio === 'a' ? 100 : 0), fin: !!e.perdio || e.largo > MAXIMO }; },
  valido(x): x is EstadoEco { const e = x as EstadoEco; return !!e && typeof e.semilla === 'string' && Number.isInteger(e.largo) && esLado(e.turno) && Number.isInteger(e.paso) && typeof e.muestra === 'number' && (e.perdio === null || esLado(e.perdio)) && !!e.aciertos; },
  dibujar(m, enviar, yo) {
    const grilla = m.el('div', 'eco', m.tablero);
    const pads = TONOS.map((_, i) => { const b = m.el('button', `eco-pad p${i}`, grilla); b.setAttribute('aria-label', `Piedra ${i + 1}`); b.addEventListener('click', () => enviar({ i })); return b; });
    let sonado = '';
    return (e, t, nombres) => {
      const sec = secuenciaEco(e.semilla), paso = ritmo(e.largo), k = Math.floor((t - e.muestra - 0.7) / paso), mostrando = t < finMuestra(e);
      pads.forEach((b, i) => b.classList.toggle('viva', mostrando && k >= 0 && k < e.largo && sec[k] === i && (t - e.muestra - 0.7) % paso < paso * 0.75));
      // Cada piedra suena una vez mientras se muestra
      const marca = `${e.muestra}|${k}`;
      if (mostrando && k >= 0 && k < e.largo && marca !== sonado) { sonado = marca; m.sonido.tono(TONOS[sec[k]], paso * 0.7); }
      grilla.classList.toggle('bloqueada', yo !== e.turno || mostrando || !!e.perdio);
      m.hud.tiempo(`Secuencia de ${Math.min(e.largo, MAXIMO)}`);
      m.hud.extra(e.perdio ? '' : mostrando ? 'Miren…' : yo === e.turno ? '¡Tu turno! Repítela' : `Repite ${nombres[e.turno]}`);
      m.hud.puntos(`${nombres.a} ${e.aciertos.a} · ${e.aciertos.b} ${nombres.b}`);
      void otro;
    };
  },
};
```

Agregar `.vivo-mesa .eco.bloqueada { pointer-events: none; opacity: .8; }` a `estilos.css`. Registrar en `TABLEROS` y exportar `secuenciaEco`/`finMuestra` para las pruebas.

- [ ] **Step 3: Pruebas** — Run: `npx tsc --noEmit && node pruebas/vivo.mjs asientos` → `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/vivo/tableros src/estilos.css
git commit -m "En vivo: Eco del Templo como Simón dice por turnos"
```

---

### Task 7: El Cofre o la Ola en vivo (concurso)

**Files:**
- Create: `src/vivo/tableros/cofre.ts`
- Modify: `src/vivo/tableros/index.ts`

**Interfaces:**
- Produces: `cofre: Reglas<EstadoCofre>` con `EstadoCofre = { semilla: string; cofre: number; paso: number; mano: Record<Lado, number>; total: Record<Lado, number>; activo: Record<Lado, boolean>; elige: Record<Lado, 'sacar' | 'plantar' | null>; plazo: number; revela: number; ola: Record<Lado, boolean> }` y `cofresVivo(semilla: string): { monedas: number[]; ola: number; mar: 'calma' | 'oleaje' | 'tormenta' }[]`.

Reglas: 6 cofres de hasta 10 sacadas. En cada sacada, cada jugador activo elige en secreto; cuando eligieron los dos (o pasan 12 s: quien no eligió se planta si tiene monedas, si no saca), se revela. Quien se planta guarda su mano y sale del cofre. Quien saca: si esa sacada trae la ola, pierde la mano y sale; si no, suma. El cofre termina cuando no queda nadie activo o se llega a la sacada 10 (se guarda todo). Pausa de 1,6 s para ver lo revelado. La elección de cada uno viaja en el estado, pero la pantalla del rival solo muestra "ya eligió" (alguien con la consola podría verla: ruling anotado).

- [ ] **Step 1: Pruebas**

```ts
  let co = cofre.inicial('prueba', 1);
  co = cofre.accion(co, { elige: 'plantar' }, 'a', 1)!;
  igual('cofre: plantarse sin monedas no se puede', cofre.accion(cofre.inicial('prueba', 1), { elige: 'plantar' }, 'a', 1), null);
  co = cofre.inicial('prueba', 1);
  co = cofre.accion(co, { elige: 'sacar' }, 'a', 1)!;
  igual('cofre: se espera al otro', co.revela, 0);
  co = cofre.accion(co, { elige: 'sacar' }, 'b', 1.2)!;
  const ola0 = cofresVivo('prueba')[0].ola === 0;
  igual('cofre: se revela y suman los dos (o se los lleva la ola)', [co.mano.a > 0 || ola0, co.revela > 0], [true, true]);
  igual('cofre: cambiar de elección en la pausa no vale', cofre.accion(co, { elige: 'sacar' }, 'a', 1.3), null);
```

- [ ] **Step 2: Reglas y dibujo**

```ts
// src/vivo/tableros/cofre.ts
import { generador } from '../../nucleo/azar';
import { fotoModelo } from '../../nucleo/modelos';
import { esLado, type Lado, type Reglas } from '../tablero';

// El Cofre o la Ola en vivo, como concurso: los mismos cofres y la misma ola para los dos. En cada sacada los dos
// eligen en secreto "Sacar" o "Plantarme" y se revela a la vez. Quien se planta guarda; a quien saca le puede
// tocar la ola. Seis cofres; gana quien junta más monedas.
const COFRES = 6, PASOS = 10, PLAZO = 12, PAUSA = 1.6;
const MARES = { calma: { icono: '☀️', nombre: 'Mar en calma', base: 0.03, sube: 0.05, paga: 1 }, oleaje: { icono: '🌤️', nombre: 'Oleaje', base: 0.06, sube: 0.07, paga: 1.2 }, tormenta: { icono: '⛈️', nombre: 'Tormenta', base: 0.12, sube: 0.1, paga: 1.5 } };
type Mar = keyof typeof MARES;
type Eleccion = 'sacar' | 'plantar';
export interface EstadoCofre { semilla: string; cofre: number; paso: number; mano: Record<Lado, number>; total: Record<Lado, number>; activo: Record<Lado, boolean>; elige: Record<Lado, Eleccion | null>; plazo: number; revela: number; ola: Record<Lado, boolean> }
export function cofresVivo(semilla: string) {
  const r = generador(`${semilla}|cofre-vivo`);
  return Array.from({ length: COFRES }, () => {
    const suerte = r(), mar: Mar = suerte < 0.35 ? 'calma' : suerte < 0.75 ? 'oleaje' : 'tormenta', monedas: number[] = [];
    let ola = PASOS;
    for (let paso = 0; paso < PASOS; paso++) { monedas.push(Math.round((6 + Math.floor(r() * 10) + 2 * paso) * MARES[mar].paga)); if (ola === PASOS && r() < Math.min(0.9, MARES[mar].base + MARES[mar].sube * paso)) ola = paso; }
    return { monedas, ola, mar };
  });
}
const nuevoCofre = (e: EstadoCofre, t: number): EstadoCofre => ({ ...e, cofre: e.cofre + 1, paso: 0, mano: { a: 0, b: 0 }, activo: { a: true, b: true }, elige: { a: null, b: null }, plazo: t + PLAZO, revela: 0, ola: { a: false, b: false } });

/** Se revela la sacada: cada uno recibe lo suyo según lo que eligió. */
function revelar(e: EstadoCofre, t: number): EstadoCofre {
  const c = cofresVivo(e.semilla)[e.cofre], mano = { ...e.mano }, total = { ...e.total }, activo = { ...e.activo }, ola = { a: false, b: false };
  for (const l of ['a', 'b'] as Lado[]) {
    if (!e.activo[l]) continue;
    const elige = e.elige[l] ?? (mano[l] > 0 ? 'plantar' : 'sacar'); // quien no eligió a tiempo se planta si tiene algo
    if (elige === 'plantar') { total[l] += mano[l]; mano[l] = 0; activo[l] = false; continue; }
    if (e.paso >= c.ola) { mano[l] = 0; activo[l] = false; ola[l] = true; continue; }
    mano[l] += c.monedas[e.paso];
  }
  const paso = e.paso + 1;
  // Llegar a la última sacada sin ola guarda todo lo que quede en la mano
  if (paso >= PASOS) for (const l of ['a', 'b'] as Lado[]) if (activo[l]) { total[l] += mano[l]; mano[l] = 0; activo[l] = false; }
  return { ...e, paso, mano, total, activo, ola, elige: { a: null, b: null }, revela: t + PAUSA };
}

export const cofre: Reglas<EstadoCofre> = {
  id: 'cofre', nombre: 'El Cofre o la Ola', idea: 'Concurso: los mismos cofres; en cada sacada los dos eligen en secreto y se revela a la vez.',
  inicial(semilla) { return { ...nuevoCofre({ semilla, cofre: -1, paso: 0, mano: { a: 0, b: 0 }, total: { a: 0, b: 0 }, activo: { a: true, b: true }, elige: { a: null, b: null }, plazo: 0, revela: 0, ola: { a: false, b: false } }, 0), plazo: PLAZO }; },
  accion(e, a, lado, t) {
    if (t < 0 || e.revela || e.cofre >= COFRES || !e.activo[lado] || e.elige[lado] || (a.elige !== 'sacar' && a.elige !== 'plantar')) return null;
    if (a.elige === 'plantar' && e.mano[lado] === 0) return null;
    const elige = { ...e.elige, [lado]: a.elige as Eleccion }, faltan = (['a', 'b'] as Lado[]).filter((l) => e.activo[l] && !elige[l]);
    return faltan.length ? { ...e, elige } : revelar({ ...e, elige }, t);
  },
  tic(e, t) {
    if (e.cofre >= COFRES) return null;
    if (e.revela) {
      if (t < e.revela) return null;
      const sigue = e.activo.a || e.activo.b;
      return sigue ? { ...e, revela: 0, ola: { a: false, b: false }, plazo: t + PLAZO } : nuevoCofre(e, t);
    }
    return t >= e.plazo ? revelar(e, t) : null;
  },
  marcador(e) { return { a: e.total.a, b: e.total.b, fin: e.cofre >= COFRES }; },
  valido(x): x is EstadoCofre { const e = x as EstadoCofre; return !!e && typeof e.semilla === 'string' && Number.isInteger(e.cofre) && Number.isInteger(e.paso) && !!e.mano && !!e.total && !!e.activo && !!e.elige && typeof e.plazo === 'number' && typeof e.revela === 'number' && !!e.ola && (['a', 'b'] as const).every((l) => esLado(l)); },
  dibujar(m, enviar, yo) {
    const titulo = m.el('div', 'sigla', m.tablero), cielo = m.el('div', 'cofre-mar', m.tablero), dibujo = m.el('div', 'cofre-dibujo', m.tablero);
    const foto = m.el('img', '', dibujo);
    foto.alt = 'Cofre';
    fotoModelo('pirata', 'chest', 256).then((src) => { foto.src = src; }).catch(() => {});
    const manos = m.el('div', 'cofre-pozo', m.tablero), barra = m.el('div', 'fila centro', m.tablero);
    const sacar = m.el('button', 'boton principal grande', barra, 'Sacar más'), plantar = m.el('button', 'boton grande', barra, 'Plantarme');
    sacar.addEventListener('click', () => enviar({ elige: 'sacar' }));
    plantar.addEventListener('click', () => enviar({ elige: 'plantar' }));
    return (e, t, nombres) => {
      if (e.cofre >= COFRES) return;
      const c = cofresVivo(e.semilla)[e.cofre], mar = MARES[c.mar];
      titulo.textContent = `Cofre ${e.cofre + 1} de ${COFRES} · sacada ${Math.min(e.paso + 1, PASOS)}`;
      cielo.textContent = `${mar.icono} ${mar.nombre}`;
      cielo.className = `cofre-mar ${c.mar}`;
      const estado = (l: Lado) => (e.ola[l] ? '🌊 ¡se lo llevó la ola!' : !e.activo[l] ? `guardó (total ${e.total[l]})` : e.revela ? `${e.mano[l]} en la mano` : e.elige[l] ? (l === yo ? `elegiste ${e.elige[l] === 'sacar' ? 'sacar' : 'plantarte'}` : 'ya eligió') : 'pensando…');
      manos.textContent = `${nombres.a}: ${estado('a')} · ${nombres.b}: ${estado('b')}`;
      const puede = !!yo && e.activo[yo] && !e.elige[yo] && !e.revela && t >= 0;
      sacar.disabled = !puede;
      plantar.disabled = !puede || !yo || e.mano[yo] === 0;
      m.hud.tiempo(e.revela ? '¡Se revela!' : `${Math.max(0, Math.ceil(e.plazo - t))} s para elegir`);
      m.hud.extra(yo ? `Tu mano: ${e.mano[yo]}` : '');
      m.hud.puntos(`${nombres.a} ${e.total.a} · ${e.total.b} ${nombres.b}`);
    };
  },
};
```

Registrar en `TABLEROS`.

- [ ] **Step 3: Pruebas** — Run: `npx tsc --noEmit && node pruebas/vivo.mjs asientos` → `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/vivo/tableros
git commit -m "En vivo: El Cofre o la Ola como concurso de elecciones secretas"
```

---

### Task 8: Lista de En vivo, versus oficiales con respaldo diferido, pruebas de los cinco y notas

**Files:**
- Modify: `src/vivo/PantallaVivo.tsx` (`Vivo`: tarjetas de los cinco tableros; entrar por código)
- Modify: `src/juegos/PantallaVersus.tsx` (para los cinco: "Jugar en vivo" además de "Jugar a mi hora")
- Modify: `src/vivo/asientos.ts` (`rondasDistintas` y su prueba)
- Modify: `pruebas/vivo.mjs` (grupo `tableros`: una partida corta de cada uno con espectador)
- Modify (vault): `Estado del proyecto.md`, `Juego en vivo - diseño.md`

**Interfaces:**
- Consumes: `TABLEROS` (Tasks 2-7).
- Produces: `rondasDistintas(miListo: number, rivalListo: number): boolean`: true si los dos marcaron Listo para rondas distintas.

- [ ] **Step 1: Prueba pura**

```ts
  igual('rondas: listos en rondas distintas', rondasDistintas(2, 1), true);
  igual('rondas: sin listo del rival no cuenta', rondasDistintas(2, 0), false);
```

Run → FALLA. Implementar `export const rondasDistintas = (mio: number, rival: number) => mio > 0 && rival > 0 && mio !== rival;` y usarla en `SalaTablero` (reemplaza el cálculo de `rivalEnOtraRonda`). Run → `OK`.

- [ ] **Step 2: Lista y versus**
- `Vivo`: las tarjetas de "Crear sala" incluyen los cinco tableros (`TABLEROS`, nombre, idea y su foto `juegos/<id>.png`). El campo "Entrar a una sala" acepta `^(conchas|balsas|parejas|numeros|tinta|eco|cofre)-[A-Z0-9]{4}$`.
- `PantallaVersus` (Mis enfrentamientos): si `TABLEROS[e.juego]` y quedan rondas, además del botón de siempre aparece `<a class="boton" href={`#/juegos/vivo/enf-${e.id}`}>Jugar en vivo</a>`.

- [ ] **Step 3: Prueba de punta a punta de los cinco**

Grupo `tableros`: por cada juego abre dos jugadores y un espectador, marcan Listo y juegan hasta terminar con una estrategia de prueba (Parejas: busca pares; Cazanúmeros: el que tiene el turno de la prueba toca `estado.sigue`; Tinta: responde la correcta con `rondaTinta`; Eco: A repite bien y B se equivoca en la secuencia de 2; Cofre: los dos se plantan cuando tienen monedas). Comprueba que el texto `.tablero-fin` sea igual en las tres pestañas. Los juegos de tiempo usan `window.__juego.saltar` (no aplica: el reloj es del anfitrión), así que la prueba juega rápido y tiene topes de 90 s por juego.

Run: `node pruebas/vivo.mjs tableros` → todo `OK`.

- [ ] **Step 4: Batería completa y compilación**

Run: `for g in humo asientos enlace respaldo recarga ojo vestibulo partida intruso revancha cortar abandono parejas relevo intrusoTablero tableros; do node pruebas/vivo.mjs $g || exit 1; done; npx tsc --noEmit && npx vite build`
Expected: todo `OK` y compilación sin errores.

- [ ] **Step 5: Notas del Cerebro y commit**

Sección "En vivo, tanda 2a" en `Estado del proyecto.md`: qué se hizo, cómo se juega cada uno, la prueba manual oficial (crear un 1v1 de Cazanúmeros en la Mesa y usar "Jugar en vivo"), y lo pendiente (tanda 2b: Mata-Cangrejos, Tótem, Bolos, Minigolf, Agujero). En `Juego en vivo - diseño.md`: tanda 2a hecha, 2b siguiente.

```bash
git add src/vivo src/juegos/PantallaVersus.tsx pruebas/vivo.mjs
git commit -m "En vivo tanda 2a: los cinco juegos de mesa en la lista, oficiales con respaldo diferido y pruebas de punta a punta"
```
