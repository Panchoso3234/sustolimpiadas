import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, piloto } from './motor2d';
import { desdeTexto } from './pixel';

// Teclas del Faro (04-11): cuatro carriles de teclas negras que bajan cada vez más rápido junto a un faro, de noche.
// Toca solo las negras, siempre la de más abajo primero (D, F, J y K, o con el dedo o el mouse en su carril). Tocar el
// blanco o dejar pasar una negra quita una vida (3). Hay teclas dobles (dos en la misma fila), teclas largas que se
// mantienen apretadas (puntos mientras las sostienes), racha que sube el valor de cada tecla, "fiebre" con puntaje
// doble al llenar la barra, tres canciones cada vez más rápidas (una por minuto) y destellos en cada acierto. Cada
// acierto toca la siguiente nota de la melodía, pero el juego se gana igual en silencio. 3 minutos.
// Todo sale de la semilla: en un duelo, la misma secuencia de teclas a la misma velocidad.
//
// Nunca hay una fila imposible: las filas no se encimen (una tecla larga ocupa sus filas sola) y las dobles van en
// carriles distintos.

const H = 720, RH = 150, DURA = 180, VIDAS = 3, FIEBRE_LLENA = 40, FIEBRE_DURA = 10;
const TECLAS = ['d', 'f', 'j', 'k'];
const CANCIONES = [{ nombre: 'Marea baja', desde: 0, v0: 2.1, sube: 0.012 }, { nombre: 'Viento norte', desde: 60, v0: 3.1, sube: 0.014 }, { nombre: 'Tormenta', desde: 120, v0: 4.1, sube: 0.016 }];
// Melodía (pentatónica, en semitonos MIDI): avanza una nota por acierto
const MELODIA = [69, 72, 74, 76, 79, 76, 74, 72, 69, 67, 69, 72, 74, 72, 69, 64, 67, 69, 72, 76, 74, 72, 74, 69];
interface Fila { inicio: number; largo: number; carriles: number[]; hechas: number[]; perdida: boolean; sostenido: number; error: number }

export async function crear(c: Contexto): Promise<Partida> {
  const m = crearMotor2D(c, 'teclas', { fondo: '#0b1026', pixel: (ancho) => (ancho < 500 ? 2 : 3) });
  const bot = piloto();
  const r = generador(`${c.semilla}|teclas`);

  // ── Estado ──
  let filas: Fila[] = [], siguiente = 0, ultimoCarril = -1;
  let s = -2.2; // filas recorridas (la fila n llega al fondo cuando s = n)
  let fase: 'juego' | 'fin' = 'juego', vidas = VIDAS, puntos = 0, aciertos = 0, racha = 0, mejorRacha = 0, errores = 0, largas = 0, fiebres = 0;
  let fiebre = 0, fiebreHasta = 0, cancion = 0, nota = 0, invulnerable = 0;
  let sostiene: { fila: Fila; carril: number } | null = null;
  const destello = [0, 0, 0, 0], rojo = [0, 0, 0, 0];
  const prueba = { imposibles: 0, encimadas: 0 };

  const velocidad = (t: number) => { const k = CANCIONES[cancionDe(t)]; return k.v0 + (t - k.desde) * k.sube; };
  const cancionDe = (t: number) => (t >= 120 ? 2 : t >= 60 ? 1 : 0);
  const generar = () => {
    const t = m.tiempo + Math.max(0, siguiente - s) / Math.max(2, velocidad(m.tiempo)); // cuándo va a llegar, más o menos
    const larga = t > 15 && r() < 0.12, doble = !larga && t > 35 && r() < 0.16;
    let carril = Math.floor(r() * 4);
    if (carril === ultimoCarril && r() < 0.6) carril = (carril + 1 + Math.floor(r() * 3)) % 4;
    const carriles = [carril];
    if (doble) carriles.push((carril + 1 + Math.floor(r() * 3)) % 4);
    if (new Set(carriles).size !== carriles.length) prueba.imposibles++;
    const fila: Fila = { inicio: siguiente, largo: larga ? 2 + Math.floor(r() * 2) : 1, carriles, hechas: [], perdida: false, sostenido: 0, error: 0 };
    const previa = filas[filas.length - 1];
    if (previa && previa.inicio + previa.largo > fila.inicio) prueba.encimadas++;
    filas.push(fila); siguiente += fila.largo; ultimoCarril = carriles[carriles.length - 1];
  };
  while (siguiente < 8) generar();
  const pendiente = () => filas.find((f) => !f.perdida && f.hechas.length < f.carriles.length) ?? null;
  const fondoDe = (f: Fila) => H - (f.inicio - s) * RH; // borde de abajo de la fila, en pantalla
  const enFiebre = () => m.tiempo < fiebreHasta;

  // ── Tocar ──
  const valor = () => (10 + Math.min(30, Math.floor(racha / 10) * 5)) * (enFiebre() ? 2 : 1);
  function tocar(carril: number) {
    if (fase !== 'juego') return;
    const f = pendiente();
    if (!f || fondoDe(f) < 40) return; // todavía no asoma: no castiga
    if (f.carriles.includes(carril) && !f.hechas.includes(carril)) {
      f.hechas.push(carril); aciertos++; racha++; mejorRacha = Math.max(mejorRacha, racha);
      const v = valor(); puntos += v;
      if (!enFiebre()) { fiebre++; if (fiebre >= FIEBRE_LLENA) { fiebre = 0; fiebreHasta = m.tiempo + FIEBRE_DURA; fiebres++; m.mesa.hud.aviso('¡FIEBRE! Puntaje doble', 'oro', 1.4); m.efectos.temblar(6); } }
      if (f.largo > 1) { sostiene = { fila: f, carril }; largas++; }
      destello[carril] = 1;
      const [x, y] = centroCarril(carril, Math.min(H - 40, fondoDe(f) - RH / 2));
      m.efectos.chispas(x, y, enFiebre() ? ['#ffd23c', '#ff8a2a', '#ffffff'] : ['#ffd23c', '#fff6c9'], 8, 220);
      if (racha % 25 === 0) m.efectos.flotar(x, y - 30, `Racha ${racha}`, '#ffd23c', 26);
      const hz = 440 * Math.pow(2, (MELODIA[nota++ % MELODIA.length] - 69) / 12);
      m.mesa.sonido.tono(hz, 0.22, 'triangle', 0.06); if (enFiebre()) m.mesa.sonido.tono(hz * 2, 0.12, 'sine', 0.025);
    } else fallo(carril, f, 'Tocaste el blanco');
  }
  function fallo(carril: number, f: Fila | null, motivo: string) {
    if (m.tiempo < invulnerable) return; // un respiro de medio segundo después de cada error
    errores++; racha = 0; fiebre = Math.max(0, fiebre - 10); rojo[carril] = 1; invulnerable = m.tiempo + 0.5;
    if (f) f.error = 1;
    if (!c.libre) vidas--;
    m.mesa.hud.aviso(c.libre ? motivo : `${motivo} · ${vidas} ${vidas === 1 ? 'vida' : 'vidas'}`, 'mal', 1); m.mesa.sonido.mal(); m.efectos.temblar(10);
    if (vidas <= 0) terminar('Sin vidas');
  }
  const soltar = () => {
    if (!sostiene) return;
    const f = sostiene.fila, bonus = Math.round(f.sostenido * f.largo * 15) * (enFiebre() ? 2 : 1);
    if (bonus > 0) { puntos += bonus; const [x, y] = centroCarril(sostiene.carril, Math.max(80, Math.min(H - 60, fondoDe(f) - f.largo * RH))); m.efectos.flotar(x, y, `+${bonus}`, '#7cffcb', 24); }
    sostiene = null;
  };

  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    const t = m.tiempo;
    if (!c.libre && t >= DURA) { soltar(); terminar('Se acabó la canción'); return; }
    const nueva = c.libre ? Math.min(2, cancionDe(t)) : cancionDe(t);
    if (nueva !== cancion) { cancion = nueva; m.mesa.hud.aviso(`Canción ${cancion + 1}: ${CANCIONES[cancion].nombre} · más rápido`, 'oro', 1.6); }
    s += velocidad(c.libre ? Math.min(t, 175) : t) * dt;
    while (siguiente < s + 9) generar();
    // Tecla larga: suma mientras se mantiene, hasta que su punta de arriba llega al fondo
    if (sostiene) {
      const f = sostiene.fila, apretada = bot ? botSostiene : m.teclas.has(TECLAS[sostiene.carril]) || (m.puntero.abajo && carrilEn(m.puntero.x) === sostiene.carril);
      f.sostenido = Math.min(1, Math.max(f.sostenido, (s - f.inicio) / Math.max(0.5, f.largo - 0.6)));
      if (!apretada || f.sostenido >= 1) soltar();
    }
    // Se pasó una negra
    for (const f of filas) if (!f.perdida && f.hechas.length < f.carriles.length && s > f.inicio + 0.92) { f.perdida = true; fallo(f.carriles.find((k) => !f.hechas.includes(k)) ?? 0, f, 'Se te pasó una'); }
    filas = filas.filter((f) => s < f.inicio + f.largo + 1);
    for (let i = 0; i < 4; i++) { destello[i] = Math.max(0, destello[i] - dt * 5); rojo[i] = Math.max(0, rojo[i] - dt * 3); }
    if (bot) pilotar();
    m.mesa.hud.puntos(String(puntos));
    if (!c.libre) { const q = Math.max(0, DURA - t); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`${c.libre ? '' : `${'♥'.repeat(Math.max(0, vidas))} · `}racha ${racha}${enFiebre() ? ' · ×2' : ''}`); // corto, para el celular
  });
  m.alTecla((k) => { const i = TECLAS.indexOf(k); if (i >= 0 && !bot) tocar(i); });
  m.alTocar((x) => { if (!bot) tocar(carrilEn(x)); });

  // ── Bots: el bueno toca cada tecla al llegar a la zona de abajo y mantiene las largas; el torpe llega tarde y se equivoca ──
  const rb = generador('bot-teclas');
  let botSostiene = false, botEspera = 0;
  function pilotar() {
    const torpe = bot === 'torpe';
    if (sostiene) { botSostiene = torpe ? rb() > 0.012 : true; return; }
    const f = pendiente();
    if (!f || m.tiempo < botEspera) return;
    const llega = fondoDe(f);
    if (llega < (torpe ? 560 : 430)) return;
    botEspera = m.tiempo + (torpe ? 0.08 + rb() * 0.22 : 0.03);
    const falta = f.carriles.filter((k) => !f.hechas.includes(k));
    if (torpe && rb() < 0.06) { tocar((falta[0] + 1 + Math.floor(rb() * 3)) % 4); return; }
    if (torpe && rb() < 0.25) return; // se distrae
    botSostiene = true; tocar(falta[0]);
  }

  // ── Dibujo ──
  const anchoTablero = () => Math.min(m.ancho - 24, 520), x0 = () => (m.ancho - anchoTablero()) / 2;
  const carrilEn = (x: number) => Math.max(0, Math.min(3, Math.floor(((x - x0()) / anchoTablero()) * 4)));
  const centroCarril = (i: number, y: number) => [x0() + ((i + 0.5) * anchoTablero()) / 4, y] as const;
  const FARO = desdeTexto([
    '....YYY....', '...YYYYY...', '..OOOOOOO..', '...OWWWO...', '...ORRRO...', '...OWWWO...', '...ORRRO...', '..OWWWWWO..', '..ORRRRRO..', '..OWWWWWO..',
    '..ORRRRRO..', '.OWWWWWWWO.', '.ORRRRRRRO.', '.OWWWWWWWO.', 'GGGGGGGGGGG', 'GGGGGGGGGGG',
  ], { Y: '#fff1a8', O: '#1b1630', W: '#f4f1ea', R: '#e8325a', G: '#3e3e4a' });
  const ESTRELLAS = Array.from({ length: 50 }, (_, i) => [((i * 197) % 997) / 997, ((i * 113) % 541) / 541 * 0.55, i % 3] as const);
  m.alPixel((gp) => {
    const k = m.k, px = (v: number) => Math.round(v / k) * k, t = m.tiempo, ancho = m.ancho, fiebreOn = enFiebre();
    // Cielo y mar de noche (bandas, sin degradados)
    const cielo = fiebreOn ? ['#2a1040', '#3a1650', '#4a1c58'] : ['#0b1026', '#111a3a', '#18244a'];
    for (let i = 0; i < 3; i++) { gp.fillStyle = cielo[i]; gp.fillRect(0, px((H * 0.6 * i) / 3), ancho, px((H * 0.6) / 3) + k); }
    for (const [ex, ey, n] of ESTRELLAS) if (Math.sin(t * 1.5 + n * 2 + ex * 9) > -0.4) { gp.fillStyle = n ? '#7fb4ff' : '#fff6c9'; gp.fillRect(px(ex * ancho), px(ey * H), k, k); }
    for (let y = H * 0.6, i = 0; y < H; y += 24, i++) { gp.fillStyle = i % 2 ? '#0e2a4a' : '#123458'; gp.fillRect(0, px(y), ancho, px(24) + k); }
    // El faro a un costado (si hay espacio) con su haz que gira; en celular, solo el haz
    const lado = x0() > 70, fx = lado ? x0() / 2 : ancho - 30, fy = H * 0.6 - 30;
    const ang = t * 0.9, largo = ancho * 0.9, abre = 0.13;
    gp.globalAlpha = fiebreOn ? 0.22 : 0.12; gp.fillStyle = fiebreOn ? '#ffd23c' : '#fff1a8';
    gp.beginPath(); gp.moveTo(fx, fy - 40); gp.lineTo(fx + Math.cos(ang - abre) * largo, fy - 40 + Math.sin(ang - abre) * largo * 0.35); gp.lineTo(fx + Math.cos(ang + abre) * largo, fy - 40 + Math.sin(ang + abre) * largo * 0.35); gp.closePath(); gp.fill();
    gp.globalAlpha = 1;
    if (lado) m.sprite(FARO, fx, fy, Math.min(3, x0() / 30));
    // Tablero: cuatro carriles color marfil con líneas
    const w = anchoTablero(), xi = x0(), lw = w / 4;
    gp.fillStyle = '#e9e1cc'; gp.fillRect(px(xi), 0, px(w), H);
    for (let i = 0; i < 4; i++) {
      if (destello[i] > 0) { gp.fillStyle = `rgba(255,210,60,${destello[i] * 0.35})`; gp.fillRect(px(xi + i * lw), 0, px(lw), H); }
      if (rojo[i] > 0) { gp.fillStyle = `rgba(232,50,90,${rojo[i] * 0.55})`; gp.fillRect(px(xi + i * lw), 0, px(lw), H); }
    }
    gp.fillStyle = '#b9ad90'; for (let i = 0; i <= 4; i++) gp.fillRect(px(xi + i * lw) - (i === 4 ? k : 0), 0, k, H);
    // Teclas
    for (const f of filas) {
      const fondo = fondoDe(f), alto = f.largo * RH, arriba = fondo - alto;
      if (fondo < 0 || arriba > H) continue;
      for (const carril of f.carriles) {
        const hecha = f.hechas.includes(carril), x = px(xi + carril * lw + k), ancho2 = px(lw) - 2 * k, y = px(arriba + k), alto2 = px(alto) - 2 * k;
        if (hecha && f.largo === 1) { gp.fillStyle = 'rgba(20,24,44,.18)'; gp.fillRect(x, y, ancho2, alto2); continue; }
        gp.fillStyle = f.error > 0 && !hecha ? '#7a0f2b' : fiebreOn ? '#3a1650' : '#14182c'; gp.fillRect(x, y, ancho2, alto2);
        gp.fillStyle = fiebreOn ? '#ffd23c' : '#c98a00'; gp.fillRect(x, y, ancho2, k); // filo dorado
        if (f.largo > 1) {
          gp.fillStyle = '#7fb4ff'; gp.fillRect(px(x + ancho2 / 2) - k, y + 4 * k, 2 * k, alto2 - 8 * k);
          if (hecha) { const lleno = alto2 * f.sostenido; gp.fillStyle = '#7cffcb'; gp.fillRect(px(x + ancho2 / 2) - 2 * k, px(y + alto2 - lleno), 4 * k, px(lleno)); }
        }
      }
    }
    // Línea de abajo (donde las teclas se escapan)
    gp.fillStyle = 'rgba(232,50,90,.5)'; gp.fillRect(px(xi), H - 2 * k, px(w), 2 * k);
  });
  m.alDibujar((g) => {
    if (fase !== 'juego') return;
    // Barra de fiebre a la izquierda del tablero (o arriba en celular)
    const xi = x0(), w = anchoTablero(), lleno = enFiebre() ? (fiebreHasta - m.tiempo) / FIEBRE_DURA : fiebre / FIEBRE_LLENA;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(xi, 64, w, 8);
    g.fillStyle = enFiebre() ? '#ff8a2a' : '#ffd23c'; g.fillRect(xi, 64, w * Math.max(0, Math.min(1, lleno)), 8);
    if (!bot && m.tiempo < 6) {
      const tam = Math.round(Math.min(22, m.ancho / 22));
      m.rotulo('Toca solo las negras, la de más abajo primero', m.ancho / 2, H * 0.42, tam, '#fff6c9');
      m.rotulo(m.ancho > 600 ? 'Teclas D  F  J  K, o toca su carril · mantén las largas' : 'Toca su carril · mantén las largas', m.ancho / 2, H * 0.42 + tam * 1.6, Math.round(tam * 0.8), '#ffffff');
    }
    if (m.ancho > 600) for (let i = 0; i < 4; i++) m.rotulo(TECLAS[i].toUpperCase(), xi + ((i + 0.5) * w) / 4, H - 96, 22, 'rgba(20,24,44,.55)');
  });

  let terminado = false;
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin';
    m.detener();
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Resultado', porque], ['Teclas tocadas', String(aciertos)], ['Mejor racha', String(mejorRacha)], ['Teclas largas', String(largas)], ['Fiebres', String(fiebres)], ['Canción a la que llegaste', `${cancion + 1}: ${CANCIONES[cancion].nombre}`], ['Errores', String(errores)]],
      detalle: { aciertos, racha: mejorRacha, largas, fiebres, cancion: cancion + 1, errores },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__teclas = () => ({ fase, puntos, aciertos, racha, errores, vidas, cancion, terminado, seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); },
    destruir() { m.destruir(); },
  };
}
