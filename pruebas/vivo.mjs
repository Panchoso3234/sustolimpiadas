// Uso: node pruebas/vivo.mjs <grupo>   (con `npm run dev` corriendo en el puerto 5173)
import { abrir, hasta, limpiarPerfiles } from './navegador.mjs';

const BASE = 'http://localhost:5173/';
async function probarMensajes(extraMirar) {
  const sala = `conchas-T${Math.floor(Math.random() * 900 + 100)}`;
  const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c${extraMirar}#/juegos/mirar/${sala}`);
  try {
    const listo = await hasta(async () => (await a.js('window.__sala?.directos() ?? 0')) >= (extraMirar ? 1 : 2), 20000);
    // Las tres pestañas tienen que estar dentro de la sala (presencia de 3) antes de mandar nada
    await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 3 && (await c.js('window.__sala?.presentes() ?? 0')) >= 3, 20000);
    await b.js(`window.__sala.enviarPrueba('hola-b')`);
    await c.js(`window.__sala.enviarPrueba('hola-c')`);
    const llegan = await hasta(async () => {
      const ra = await a.js('window.__sala.recibidos'), rb = await b.js('window.__sala.recibidos'), rc = await c.js('window.__sala.recibidos');
      return ra.includes('hola-b') && ra.includes('hola-c') && rc.includes('hola-b') && rb.includes('hola-c');
    }, 15000);
    const sinDuplicados = ((await c.js('window.__sala?.recibidos')) ?? []).filter((x) => x === 'hola-b').length === 1;
    const senales = Math.max(await a.js('window.__sala?.senales?.() ?? 99'), await b.js('window.__sala?.senales?.() ?? 99'));
    return { 'el anfitrión conecta directo': listo, 'los mensajes llegan a todos': llegan, 'sin duplicados': sinDuplicados, 'pocas señales por Supabase (≤ 3 por conexión)': extraMirar ? true : senales <= 6 };
  } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
}

// Arma una sala de Cuatro Conchas con dos jugadores listos y un espectador; devuelve las pestañas y quién parte
async function armarConchas(letra) {
  const sala = `conchas-${letra}${Math.floor(Math.random() * 900 + 100)}`;
  const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
  const listo = (p) => hasta(() => p.js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === '¡Listo!'); if (b) b.click(); return !!b; })()`), 20000);
  await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 3, 20000);
  await listo(a); await listo(b);
  await hasta(() => a.js(`!!document.querySelector('.conchas')`), 20000);
  const parte = (await a.js(`!document.querySelector('.conchas-col')?.disabled`)) ? [a, b] : [b, a];
  return { sala, a, b, c, parte, listo };
}
const columna = (p, i) => hasta(() => p.js(`(() => { const c = document.querySelectorAll('.conchas-col')[${i}]; if (!c || c.disabled) return false; c.click(); return true; })()`));
const jugadas = async (p, sala) => JSON.parse((await p.js(`localStorage.getItem('susto.vivo.${sala}')`)) ?? '{}');

const listoTablero = (p) => hasta(() => p.js(`(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '¡Listo!'); if (x) x.click(); return !!x; })()`), 20000);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
// Estrategia de prueba de cada tablero, corre dentro de la página de cada jugador. No repite una jugada sobre el mismo estado.
const ESTRATEGIA = {
  parejas: `if (e.turno !== yo || e.tapa) return; const libre = (i) => e.cartas[i] !== 'medusa' && !e.duenas[i];
    const i = e.abiertas.length ? e.cartas.findIndex((f, j) => j !== e.abiertas[0] && f === e.cartas[e.abiertas[0]] && libre(j)) : e.cartas.findIndex((_, j) => libre(j)); a = { i };`,
  eco: `const m = await import('/src/vivo/tableros/eco.ts'); if (e.turno !== yo || e.perdio || t < m.finMuestra(e)) return; const s = m.secuenciaEco(e.semilla)[e.paso];
    a = { i: yo === 'b' && e.largo === 2 ? (s + 1) % 6 : s };`,
  cofre: `if (!e.activo[yo] || e.elige[yo] || e.revela) return; a = { elige: e.mano[yo] > 0 ? 'plantar' : 'sacar' };`,
};
const jugada = (juego) => `(async () => { const T = window.__tablero; const e = T?.estado(), yo = T?.lado(), t = T?.t() ?? -1; let a = null;
  if (!e || !yo || t < 0.3) return; ${ESTRATEGIA[juego]}
  const firma = JSON.stringify(e); if (!a || window.__firma === firma) return; window.__firma = firma; T.enviar(a); })()`;

const grupos = {
  // Parejas completa entre dos, con un espectador que entra tarde: todos terminan con el mismo marcador
  async parejas() {
    const sala = `parejas-P${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`);
    let c;
    try {
      await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 2, 20000);
      for (const p of [a, b]) await listoTablero(p);
      await hasta(() => a.js('window.__tablero?.estado() != null'), 20000);
      c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
      // Juega quien tiene el turno: busca una pareja libre que sabe dónde está (lo hace el banco de pruebas, no el juego)
      for (let k = 0; k < 80; k++) {
        if (await a.js('document.querySelector(".tablero-fin") != null')) break;
        const e = await a.js('window.__tablero.estado()'), t = await a.js('window.__tablero.t()');
        if (!e || t < 0 || e.tapa || e.abiertas.length) { await pausa(400); continue; }
        const quien = e.turno === (await a.js('window.__tablero.lado()')) ? a : b;
        const libre = e.cartas.findIndex((f, i) => f !== 'medusa' && !e.duenas[i]), par = e.cartas.findIndex((f, i) => i !== libre && f === e.cartas[libre] && !e.duenas[i]);
        if (libre < 0) break;
        await quien.js(`window.__tablero.enviar({ i: ${libre} })`); await pausa(250);
        await quien.js(`window.__tablero.enviar({ i: ${par} })`); await pausa(350);
      }
      const fin = await hasta(async () => { const fa = await a.js('document.querySelector(".tablero-fin")?.textContent'), fc = await c.js('document.querySelector(".tablero-fin")?.textContent'); return !!fa && fa === fc; }, 20000);
      const espectadorVioTablero = (await c.js('document.querySelectorAll(".carta.lista").length')) > 0;
      return { 'termina con el mismo resultado para todos': fin, 'el que entró tarde ve el tablero': espectadorVioTablero };
    } finally { a.cerrar(); b.cerrar(); c?.cerrar(); }
  },
  // Los juegos de mesa de punta a punta, con un espectador: los tres ven el mismo resultado
  async tableros() {
    const salida = {};
    for (const juego of ['parejas', 'eco', 'cofre']) {
      const sala = `${juego}-T${Math.floor(Math.random() * 900 + 100)}`;
      const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
      try {
        await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 3, 20000);
        for (const p of [a, b]) await listoTablero(p);
        const fin = Date.now() + 90000;
        while (Date.now() < fin && !(await a.js('document.querySelector(".tablero-fin") != null'))) {
          for (const p of [a, b]) await p.js(jugada(juego));
          await pausa(300);
        }
        const texto = (p) => p.js('document.querySelector(".tablero-fin")?.textContent');
        salida[`${juego}: termina igual para los tres`] = await hasta(async () => { const [x, y, z] = [await texto(a), await texto(b), await texto(c)]; return !!x && x === y && x === z; }, 20000);
        if (juego === 'eco') {
          await a.js(`[...document.querySelectorAll('button')].find((y) => y.textContent === 'Revancha')?.click()`);
          salida['revancha: los dos vuelven a marcar Listo'] = await hasta(async () => (await b.js(`[...document.querySelectorAll('button')].some((y) => y.textContent === '¡Listo!') && !document.querySelector('.tablero-fin')`)), 15000);
        }
      } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
    }
    return salida;
  },
  async duelos() {
    const salida = {};
    for (const [juego, formato] of [['numeros', 'dividida'], ['totem', 'turnos']]) {
      const sala = `${juego}-D${Math.floor(Math.random() * 900 + 100)}`;
      const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
      try {
        await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 3, 20000);
        for (const p of [a, b]) await listoTablero(p);
        await hasta(async () => (await a.js('window.__duelo?.lado()')) != null && (await b.js('window.__duelo?.lado()')) != null, 20000);
        const [pa, pb] = (await a.js('window.__duelo.lado()')) === 'a' ? [a, b] : [b, a];
        const fase = (p) => p.js('window.__duelo.fase()');
        if (formato === 'dividida') {
          salida[`${juego}: los dos juegan a la vez`] = await hasta(async () => (await fase(pa)) === 'jugando' && (await fase(pb)) === 'jugando', 40000);
          salida[`${juego}: el espectador ve las dos pantallas`] = await hasta(() => c.js('window.__duelo.foto("a") && window.__duelo.foto("b")'), 20000);
          salida[`${juego}: cada uno ve la pantalla del otro`] = await hasta(async () => (await pa.js('window.__duelo.foto("b")')) && (await pb.js('window.__duelo.foto("a")')), 20000);
          await pa.js('window.__duelo.terminar(120)'); await pb.js('window.__duelo.terminar(80)');
        } else {
          salida[`${juego}: primero juega uno y el otro mira`] = await hasta(async () => (await fase(pa)) === 'jugando' && (await fase(pb)) === 'nada', 40000);
          salida[`${juego}: se anuncia el turno`] = await hasta(async () => /Es el turno de/.test((await c.js('document.querySelector(".duelo-turno")?.textContent')) ?? ''), 10000);
          salida[`${juego}: el espectador ve al que juega`] = await hasta(() => c.js('window.__duelo.foto("a")'), 20000);
          await pa.js('window.__duelo.terminar(50)');
          salida[`${juego}: después le toca al otro`] = await hasta(async () => (await fase(pb)) === 'jugando', 40000);
          await pb.js('window.__duelo.terminar(70)');
        }
        const texto = (p) => p.js('document.querySelector(".duelo-fin")?.textContent');
        salida[`${juego}: termina igual para los tres`] = await hasta(async () => { const [x, y, z] = [await texto(a), await texto(b), await texto(c)]; return !!x && x === y && x === z; }, 20000);
      } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
    }
    return salida;
  },
  // Mismo mundo (Sumo y Tanques): el anfitrión simula, el mando del otro llega, el espectador ve lo mismo y, si el anfitrión se va, el otro sigue
  async mundo() {
    const salida = {};
    for (const juego of ['sumo', 'tanques']) {
      const sala = `${juego}-W${Math.floor(Math.random() * 900 + 100)}`;
      const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
      const cerradas = new Set();
      try {
        await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 3, 20000);
        for (const p of [a, b]) await listoTablero(p);
        salida[`${juego}: los tres arman el mismo mundo`] = await hasta(async () => (await a.js('window.__duelo?.fase()')) === 'jugando' && (await b.js('window.__duelo?.fase()')) === 'jugando' && (await c.js('window.__duelo?.fase()')) === 'jugando', 60000);
        await hasta(async () => ((await a.js('window.__mundo.estado().t')) ?? 0) > 0.2, 20000);
        const sim = (await a.js('window.__mundo.simulo()')) ? a : b, otro = sim === a ? b : a, i = (await otro.js('window.__duelo.lado()')) === 'a' ? 0 : 1;
        const x = (p) => p.js(`(window.__mundo.estado().c ?? window.__mundo.estado().tq)[${i}].x`);
        const x0 = await x(sim);
        await otro.js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))`); await pausa(900); await otro.js(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft' }))`);
        salida[`${juego}: el mando del otro llega al que simula`] = await hasta(async () => (await x(sim)) < x0 - 1, 5000);
        salida[`${juego}: el espectador va al día`] = Math.abs((await sim.js('window.__mundo.estado().t')) - (await c.js('window.__mundo.estado().t'))) < 1;
        if (juego === 'sumo') {
          const texto = (p) => p.js('document.querySelector(".duelo-fin")?.textContent');
          salida['sumo: termina igual para los tres'] = await hasta(async () => { const [u, v, w] = [await texto(a), await texto(b), await texto(c)]; return !!u && u === v && u === w; }, 100000);
        } else {
          // El anfitrión recarga: vuelve con un mundo nuevo y atrasado; los demás no retroceden y él sigue desde el de ellos
          const t1 = await otro.js('window.__mundo.estado().t');
          await sim.js('location.reload()');
          salida['tanques: si el anfitrión recarga, el mundo sigue donde iba'] = await hasta(async () => (await otro.js('window.__mundo.estado().t')) > t1 + 3 && ((await sim.js('window.__mundo?.estado()?.t')) ?? 0) > t1, 60000);
          const t0 = await otro.js('window.__mundo.estado().t');
          sim.cerrar(); cerradas.add(sim);
          salida['tanques: si el anfitrión se va, el otro sigue simulando'] = await hasta(async () => (await otro.js('window.__mundo.simulo()')) && (await otro.js('window.__mundo.estado().t')) > t0 + 3, 40000);
        }
      } finally { for (const p of [a, b, c]) if (!cerradas.has(p)) p.cerrar(); }
    }
    return salida;
  },
  // El anfitrión se va a media partida: el otro sigue desde el mismo estado y con el reloj adelantado
  async relevo() {
    // Eco: a (el anfitrión) repite y se va; b sigue con su turno sin perderlo por el plazo mientras cambia el anfitrión
    const sala = `eco-R${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`);
    // La jugada correcta se calcula dentro de la página (por eso la función async)
    const primera = `(async () => window.__tablero.enviar({ i: (await import('/src/vivo/tableros/eco.ts')).secuenciaEco(window.__tablero.estado().semilla)[0] }))()`;
    try {
      await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 2, 20000);
      for (const p of [a, b]) await listoTablero(p);
      await hasta(async () => (await b.js('window.__tablero?.estado() != null')) && ((await b.js('window.__tablero?.t()')) ?? -9) > 2, 20000);
      if ((await a.js('window.__tablero.lado()')) !== 'a' || !(await a.js('window.__sala.esAnfitrion()'))) return { 'a es el anfitrión y parte': false };
      await a.js(primera);
      await hasta(async () => (await b.js('window.__tablero.estado()?.turno')) === 'b');
      const tAntes = await b.js('window.__tablero.t()');
      a.cerrar();
      await pausa(8000); // más que el plazo del turno: con a desconectado no corre
      const sigue = await hasta(async () => { await b.js(primera); return (await b.js('window.__tablero.estado()?.largo')) === 2; }, 30000);
      const reloj = (await b.js('window.__tablero.t()')) > tAntes + 3;
      if (!sigue) console.log(JSON.stringify({ e: await b.js('window.__tablero.estado()'), t: await b.js('window.__tablero.t()'), tAntes, sala: await b.js('window.__sala.depurar()'), fin: await b.js('document.querySelector(".tablero-fin")?.textContent') }));
      return { 'el otro jugador toma el mando': sigue, 'el reloj no vuelve a cero': reloj, 'nadie pierde por el plazo mientras el otro está desconectado': (await b.js('window.__tablero.estado()?.perdio')) === null };
    } finally { b.cerrar(); }
  },
  // Un espectador manda acciones y un estado falso: no cambian el tablero
  async intrusoTablero() {
    const sala = `eco-I${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
    try {
      await hasta(async () => (await a.js('window.__sala?.presentes() ?? 0')) >= 3, 20000);
      for (const p of [a, b]) await listoTablero(p);
      await hasta(async () => (await a.js('window.__tablero?.estado() != null')) && ((await a.js('window.__tablero?.t()')) ?? -9) > 1, 20000);
      await c.js(`window.__sala.enviarCrudo('accion', { partida: 1, a: { i: 0 } })`);
      await c.js(`window.__sala.enviarCrudo('estado', { partida: 1, asientos: ['inv-a', 'inv-b'], v: 999, e: { semilla: 'x', largo: 1, turno: 'a', paso: 0, muestra: 0, perdio: 'a', aciertos: { a: 0, b: 0 } }, t: 50, fin: { a: 0, b: 250 } })`);
      await pausa(2500);
      return { 'el espectador no cambia nada': (await a.js('window.__tablero.estado()?.perdio')) === null && !(await a.js('document.querySelector(".tablero-fin")')) };
    } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
  },
  // Un espectador manda mensajes falsos: los jugadores no deben cambiar su partida
  async intruso() {
    const { sala, a, b, c } = await armarConchas('I');
    try {
      await c.js(`window.__sala.enviarCrudo('jugada', { partida: 1, n: 0, col: 3 })`);
      await c.js(`window.__sala.enviarCrudo('revancha', { partida: 2, asientos: ['inv-c', 'inv-a'] })`);
      await c.js(`window.__sala.enviarCrudo('historia', { partida: 1, asientos: ['inv-a', 'inv-b'], jugadas: [0, 1, 0, 1, 0, 1, 0], disparos: [], flotasListas: [], pendiente: null, abandono: null })`);
      await c.js(`window.__sala.enviarCrudo('historia', { partida: 9, jugadas: 'x' })`);
      await new Promise((r) => setTimeout(r, 3000));
      const ea = await jugadas(a, sala), eb = await jugadas(b, sala);
      const vivas = (await a.js(`!!document.querySelector('.conchas')`)) && (await b.js(`!!document.querySelector('.conchas')`));
      return { 'las jugadas falsas no entran': (ea.jugadas ?? []).length === 0 && (eb.jugadas ?? []).length === 0, 'la revancha falsa no entra': ea.partida === 1 && eb.partida === 1, 'la página sigue funcionando': vivas };
    } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
  },
  // Tras ganar, la revancha pide Listo otra vez a los dos y parte el otro jugador
  async revancha() {
    const { a, b, c, parte, listo } = await armarConchas('V');
    try {
      for (let k = 0; k < 4; k++) { await columna(parte[0], 0); if (k < 3) await columna(parte[1], 1); }
      await hasta(() => a.js(`document.querySelector('.vivo-fin')?.textContent?.includes('Ganó') ?? false`));
      await hasta(() => a.js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Revancha'); if (b) b.click(); return !!b; })()`));
      const pideListo = (await listo(a)) && (await listo(b));
      await hasta(() => a.js(`!!document.querySelector('.conchas')`), 20000);
      const parteOtro = await hasta(async () => (await parte[1].js(`!document.querySelector('.conchas-col')?.disabled`)) && (await parte[0].js(`!!document.querySelector('.conchas-col')?.disabled`)), 10000);
      return { 'la revancha pide Listo a los dos': pideListo, 'en la revancha parte el otro': parteOtro };
    } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
  },
  // Un jugador se va: a los 30 s el otro gana, y al volver el resultado sigue firme
  async abandono() {
    const { sala, a, b, c } = await armarConchas('A');
    try {
      b.cerrar();
      const gana = await hasta(() => a.js(`document.querySelector('.vivo-fin')?.textContent?.includes('abandono') ?? false`), 45000);
      const b2 = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`);
      try {
        const veFin = await hasta(() => b2.js(`document.querySelector('.vivo-fin')?.textContent?.includes('abandono') ?? false`), 20000);
        await new Promise((r) => setTimeout(r, 4000));
        const sigue = await a.js(`document.querySelector('.vivo-fin')?.textContent?.includes('abandono') ?? false`);
        return { 'gana por abandono': gana, 'quien vuelve ve el resultado': veFin, 'el resultado no se borra al volver': sigue };
      } finally { b2.cerrar(); }
    } finally { a.cerrar(); c.cerrar(); }
  },
  // Si la conexión directa se corta, el anfitrión la vuelve a armar
  async cortar() {
    const { a, b, c } = await armarConchas('C');
    try {
      await hasta(async () => (await a.js('window.__sala?.directos() ?? 0')) >= 2, 20000);
      const anfitrion = (await a.js('window.__sala.esAnfitrion()')) ? a : b;
      await anfitrion.js('window.__sala.cortar()');
      const vuelve = await hasta(async () => (await anfitrion.js('window.__sala?.directos() ?? 0')) >= 2, 20000);
      return { 'la conexión directa se rearma': vuelve };
    } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
  },
  async fotos() {
    const clic = (p, texto) => hasta(() => p.js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === ${JSON.stringify(texto)} && !x.disabled); if (b) b.click(); return !!b; })()`), 20000);
    const casilla = (p, mar, i) => hasta(() => p.js(`(() => { const c = [...document.querySelectorAll('.mar-caja')].find((k) => k.querySelector('.sigla')?.textContent.startsWith('Mar de'))?.querySelectorAll('.agua-c')[${i}]; if (!c || c.disabled) return false; c.click(); return true; })()`));
    const columna = (p, i) => hasta(() => p.js(`(() => { const c = document.querySelectorAll('.conchas-col')[${i}]; if (!c || c.disabled) return false; c.click(); return true; })()`));
    // Para la foto: una copia del tablero, grande y centrada sobre un fondo, con un letrero de En vivo
    const encuadrar = (p, sel, titulo, zoom) => p.js(`(() => { const original = document.querySelector(${JSON.stringify(sel)}), capa = document.createElement('div'), copia = original.cloneNode(true), letrero = document.createElement('div'); capa.style.cssText = 'position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%, #2a5a96, #0d1830)'; copia.style.width = getComputedStyle(original).width; copia.style.transform = 'scale(${zoom})'; letrero.textContent = ${JSON.stringify('🔴 EN VIVO · ')} + ${JSON.stringify(titulo)}; letrero.style.cssText = 'position:absolute;top:22px;left:26px;font:800 30px Nunito,sans-serif;color:#fff;background:#ef5565;padding:6px 16px;border-radius:99px'; capa.append(copia, letrero); document.body.append(capa); return true; })()`);
    const tam = { ancho: 1280, alto: 720, escala: 0.5 }, n = () => Math.floor(Math.random() * 900 + 100);
    // Cuatro Conchas: una partida a medio camino
    let sala = `conchas-F${n()}`, a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`, tam), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`, tam);
    try {
      await clic(a, '¡Listo!'); await clic(b, '¡Listo!');
      await hasta(() => a.js(`!!document.querySelector('.conchas')`), 20000);
      const parte = (await a.js(`!document.querySelector('.conchas-col')?.disabled`)) ? [a, b] : [b, a];
      for (const [x, y] of [[3, 3], [2, 4], [4, 2], [3, 5], [1, 3]]) { await columna(parte[0], x); await columna(parte[1], y); }
      await encuadrar(a, '.conchas', 'Cuatro Conchas', 1.25); await a.foto('public/juegos/conchas.png');
    } finally { a.cerrar(); b.cerrar(); }
    // Batalla de Balsas: flotas puestas y algunos disparos
    sala = `balsas-F${n()}`; a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`, tam); b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`, tam);
    try {
      await clic(a, '¡Listo!'); await clic(b, '¡Listo!');
      for (const p of [a, b]) { await clic(p, 'Repartir mis balsas'); await clic(p, 'Flota lista'); }
      const parte = (await a.js(`[...document.querySelectorAll('.mar-caja')[1]?.querySelectorAll('.agua-c') ?? []].some((c) => !c.disabled)`)) ? [a, b] : [b, a];
      let tiros = 0;
      for (const [x, y] of [[0, 5], [9, 14], [18, 23], [27, 32], [36, 41]]) { tiros += (await casilla(parte[0], 1, x)) ? 1 : 0; tiros += (await casilla(parte[1], 1, y)) ? 1 : 0; }
      const anchos = await a.js(`[...document.querySelectorAll('.mar')].map((m) => Math.round(m.getBoundingClientRect().width))`);
      await encuadrar(a, '.mares', 'Batalla de Balsas', 1.15); await a.foto('public/juegos/balsas.png');
      return { 'fotos de Conchas y Balsas': true, 'los dos mares tienen el mismo ancho': anchos.length === 2 && anchos[0] === anchos[1] && anchos[0] > 200, 'se alternan los disparos': tiros === 10 };
    } finally { a.cerrar(); b.cerrar(); }
  },
  async partida() {
    const sala = `conchas-P${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
    const listo = (p) => hasta(() => p.js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === '¡Listo!'); if (b) b.click(); return !!b; })()`), 20000);
    const columna = (p, i) => hasta(() => p.js(`(() => { const c = document.querySelectorAll('.conchas-col')[${i}]; if (!c || c.disabled) return false; c.click(); return true; })()`));
    try {
      await listo(a); await listo(b);
      const empieza = await hasta(() => a.js(`!!document.querySelector('.conchas')`), 20000);
      // Quien parte juega en la columna 1 y el otro en la 2, cuatro veces: gana el que parte
      const parte = (await a.js(`!document.querySelector('.conchas-col')?.disabled`)) ? [a, b] : [b, a];
      for (let k = 0; k < 4; k++) { await columna(parte[0], 0); if (k < 3) await columna(parte[1], 1); }
      const gana = await hasta(() => c.js(`document.querySelector('.vivo-fin')?.textContent?.includes('Ganó') ?? false`));
      const ojo = await a.js(`document.querySelector('.vivo-ojo')?.textContent`);
      return { 'la partida empieza para los dos': empieza, 'el espectador ve el final': gana, 'el ojo cuenta 1': ojo === '👁 1' };
    } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
  },
  async vestibulo() {
    const sala = `conchas-V${Math.floor(Math.random() * 900 + 100)}`;
    const mira = await abrir(`${BASE}?invitado=z#/juegos/en-linea`), a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`);
    try {
      const aparece = await hasta(() => mira.js(`[...document.querySelectorAll('.partida-en-linea')].some((e) => e.dataset.codigo === ${JSON.stringify(sala)})`), 20000);
      const conFoto = await mira.js(`!!document.querySelector('.partida-en-linea[data-codigo="${sala}"] img.foto')`);
      a.cerrar();
      const desaparece = await hasta(() => mira.js(`![...document.querySelectorAll('.partida-en-linea')].some((e) => e.dataset.codigo === ${JSON.stringify(sala)})`), 20000);
      return { 'la sala aparece en Partidas en línea': aparece, 'la tarjeta tiene foto': conFoto, 'desaparece al cerrarse': desaparece };
    } finally { mira.cerrar(); }
  },
  async ojo() {
    const sala = `balsas-O${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), c = await abrir(`${BASE}?invitado=c#/juegos/mirar/${sala}`);
    try {
      const uno = await hasta(async () => (await a.js(`document.querySelector('.vivo-ojo')?.textContent`)) === '👁 1', 20000);
      const ofrece = await hasta(() => c.js(`!!document.querySelector('.vivo-quiero')`));
      await c.clic('.vivo-quiero');
      const cero = await hasta(async () => (await a.js(`document.querySelector('.vivo-ojo')?.textContent`)) === '👁 0');
      return { 'el ojo cuenta al espectador': uno, 'puede pedir asiento libre': ofrece, 'al sentarse deja de contar': cero };
    } finally { a.cerrar(); c.cerrar(); }
  },
  // Tres pestañas en la misma sala: dos juegan y una mira. Los mensajes llegan a todos, sin duplicados.
  async enlace() { return probarMensajes(''); },
  // Igual, pero la pestaña que mira no puede conectarse directo: sus mensajes van por Supabase
  async respaldo() { return probarMensajes('&sinDirecto=1'); },
  async recarga() {
    const sala = `conchas-R${Math.floor(Math.random() * 900 + 100)}`;
    const a = await abrir(`${BASE}?invitado=a#/juegos/vivo/${sala}`), b = await abrir(`${BASE}?invitado=b#/juegos/vivo/${sala}`);
    try {
      await hasta(async () => (await a.js('window.__sala?.directos() ?? 0')) >= 1, 20000);
      // Se marca la página vieja: hasta que no cargue la nueva, la vieja todavía responde "conectada"
      await a.js('window.__vieja = true; location.reload()');
      const vuelve = await hasta(async () => !(await a.js('window.__vieja ?? false')) && (await a.js('window.__sala?.directos() ?? 0')) >= 1, 25000);
      await b.js(`window.__sala.enviarPrueba('tras-recarga')`);
      const llega = await hasta(async () => ((await a.js('window.__sala?.recibidos')) ?? []).includes('tras-recarga'));
      return { 'el anfitrión se reconecta': vuelve, 'los mensajes siguen llegando': llega };
    } finally { a.cerrar(); b.cerrar(); }
  },
  async asientos() {
    const p = await abrir(`${BASE}#/juegos/vivo`);
    try {
      await hasta(() => p.js('!!window.__vivo'));
      const fallas = await p.js('[...window.__vivo.probarAsientos(), ...(window.__vivo.probarSala?.() ?? ["falta probarSala"]), ...(window.__vivo.probarTableros?.() ?? ["falta probarTableros"]), ...(window.__vivo.probarEspejo?.() ?? ["falta probarEspejo"])]');
      for (const f of fallas ?? []) console.log('  ', f);
      return { 'reglas de asientos': Array.isArray(fallas) && fallas.length === 0 };
    } finally { p.cerrar(); }
  },
  async humo() {
    const p = await abrir(`${BASE}#/juegos/vivo`);
    try { return { 'la pestaña En vivo carga': await hasta(() => p.js(`!!document.querySelector('.vivo-lista, .rejilla-juegos')`)) }; } finally { p.cerrar(); }
  },
};

const grupo = process.argv[2] ?? 'humo';
const resultados = await grupos[grupo]();
let malas = 0;
for (const [nombre, ok] of Object.entries(resultados)) { console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`); if (!ok) malas++; }
await limpiarPerfiles();
process.exit(malas ? 1 : 0);
