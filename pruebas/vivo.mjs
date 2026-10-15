// Uso: node pruebas/vivo.mjs <grupo>   (con `npm run dev` corriendo en el puerto 5173)
import { abrir, hasta } from './navegador.mjs';

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

const grupos = {
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
      const fallas = await p.js('[...window.__vivo.probarAsientos(), ...(window.__vivo.probarSala?.() ?? ["falta probarSala"]), ...(window.__vivo.probarTableros?.() ?? ["falta probarTableros"])]');
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
process.exit(malas ? 1 : 0);
