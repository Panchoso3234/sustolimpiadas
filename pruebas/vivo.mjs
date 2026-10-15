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
    return { 'el anfitrión conecta directo': listo, 'los mensajes llegan a todos': llegan, 'sin duplicados': sinDuplicados };
  } finally { a.cerrar(); b.cerrar(); c.cerrar(); }
}

const grupos = {
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
      await a.js('location.reload()');
      const vuelve = await hasta(async () => (await a.js('window.__sala?.directos() ?? 0')) >= 1, 25000);
      await b.js(`window.__sala.enviarPrueba('tras-recarga')`);
      const llega = await hasta(async () => ((await a.js('window.__sala?.recibidos')) ?? []).includes('tras-recarga'));
      return { 'el anfitrión se reconecta': vuelve, 'los mensajes siguen llegando': llega };
    } finally { a.cerrar(); b.cerrar(); }
  },
  async asientos() {
    const p = await abrir(`${BASE}#/juegos/vivo`);
    try {
      await hasta(() => p.js('!!window.__vivo'));
      const fallas = await p.js('window.__vivo.probarAsientos()');
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
