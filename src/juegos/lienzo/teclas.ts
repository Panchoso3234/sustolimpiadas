import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearMotor2D, piloto } from './motor2d';
import { desdeTexto } from './pixel';
import { cancion as cancionPorId, REPERTORIO, type Cancion } from './canciones';
import { cargarArchivo } from './cargarCancion';

// Teclas del Faro (04-11): cuatro carriles de teclas negras que bajan junto a un faro, de noche. Cada tecla es una nota
// de una canción: al tocarla suena esa nota, y si las tocas todas a tiempo suena la canción completa (con su bajo y sus
// acordes de fondo). Las notas largas son teclas largas (se mantienen) y los acordes, teclas dobles. Toca solo las
// negras, siempre la de más abajo primero (D, F, J y K, o con el dedo o el mouse en su carril). Tocar el blanco o dejar
// pasar una negra quita una vida (3). Racha que sube el valor de cada tecla, "fiebre" con puntaje doble y tres canciones
// por partida: una tranquila, una media y una rápida (repertorio de 20 canciones originales estilo anisong, en
// `canciones.ts`). 3 minutos. Se gana igual en silencio.
// Torneo y duelos: las canciones salen de la semilla (los dos tocan las mismas). En práctica se elige la canción, o se
// carga un MIDI o un mp3 propio (solo en este navegador).
//
// Nunca hay una fila imposible: las teclas de una canción no se enciman (cada una mide hasta la siguiente) y las dobles
// van en carriles distintos.

const H = 720, RH = 150, LINEA = H - 130, DURA = 180, VIDAS = 3, FIEBRE_LLENA = 40, FIEBRE_DURA = 10, ENTRE = 2.4;
const TECLAS = ['d', 'f', 'j', 'k'];
interface Fila { t: number; dur: number; alto: number; pps: number; larga: boolean; carriles: number[]; midis: number[]; hechas: number[]; perdida: boolean; sostenido: number; error: number; cancion: number }
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export async function crear(c: Contexto): Promise<Partida> {
  const bot = piloto();
  const r = generador(`${c.semilla}|teclas`);
  // ── Canciones de la partida ──
  const elegir = c.practica && !c.fantasma && !bot ? await elegirCancion(c.caja) : null;
  const lista: Cancion[] = [];
  if (elegir) lista.push(elegir);
  else {
    const de = (n: 1 | 2 | 3) => { const l = REPERTORIO.filter((x) => x.nivel === n); return cancionPorId(l[Math.floor(r() * l.length)].id); };
    lista.push(de(1), de(2), de(3));
    while (lista.reduce((a, x) => a + x.duracion + ENTRE, 0) < DURA + 10) lista.push(de(3)); // por si las tres no alcanzan
  }
  const m = crearMotor2D(c, 'teclas', { fondo: '#0b1026', pixel: (ancho) => (ancho < 500 ? 2 : 3) });

  // ── Teclas de todas las canciones (con su tiempo absoluto) ──
  const filas: Fila[] = [], inicios: number[] = [], acomp: { t: number; midi: number; dur: number; vol: number }[] = [];
  const prueba = { imposibles: 0, encimadas: 0 };
  {
    let t0 = 1.2;
    lista.forEach((can, k) => {
      inicios.push(t0);
      const notas = [...can.notas].sort((a, b) => a.t - b.t || b.midi - a.midi);
      // Velocidad: una corchea de la canción mide ~95 unidades de pantalla (más rápida la canción, más rápido bajan)
      const gaps = notas.slice(1).map((x, i) => x.t - notas[i].t).filter((g) => g > 0.05).sort((a, b) => a - b);
      const corchea = can.bpm ? 30 / can.bpm : gaps[Math.floor(gaps.length * 0.3)] ?? 0.25;
      const pps = Math.max(380, Math.min(720, 95 / corchea));
      const propias: Fila[] = [];
      let carril = 1, previo = notas[0]?.midi ?? 60, n = 0;
      for (let i = 0; i < notas.length;) {
        const grupo = [notas[i]]; let j = i + 1;
        while (j < notas.length && notas[j].t - notas[i].t < 0.03) grupo.push(notas[j++]);
        i = j;
        const t = t0 + grupo[0].t, midi = grupo[0].midi;
        if (propias.length && t - propias[propias.length - 1].t < 0.1) continue;
        // Carril: sigue el dibujo de la melodía (sube a la derecha, baja a la izquierda); en audio, según el golpe
        if (can.audio) carril = (n + Math.round((midi - 60) / 4) * 2) % 4;
        else { const d = midi - previo; carril += d > 0 ? (d >= 5 ? 2 : 1) : d < 0 ? (d <= -5 ? -2 : -1) : 0; if (carril > 3) carril = 6 - carril; if (carril < 0) carril = -carril; carril = Math.max(0, Math.min(3, carril)); }
        previo = midi; n++;
        const carriles = [carril], midis = [midi];
        if (grupo.length > 1) { carriles.push((carril + 2) % 4); midis.push(grupo[1].midi); }
        if (new Set(carriles).size !== carriles.length) prueba.imposibles++;
        propias.push({ t, dur: Math.max(...grupo.map((x) => x.dur)), alto: 0, pps, larga: false, carriles, midis, hechas: [], perdida: false, sostenido: 0, error: 0, cancion: k });
      }
      // Alto de cada tecla: hasta la siguiente (sin encimarse); las notas largas son teclas largas
      propias.forEach((f, i) => {
        const hueco = (propias[i + 1]?.t ?? f.t + 1) - f.t;
        f.dur = Math.min(f.dur, hueco);
        f.larga = f.dur >= Math.max(0.42, corchea * 2.6) && !can.audio;
        f.alto = Math.max(36, Math.min(f.larga ? 460 : RH, (f.larga ? f.dur : hueco) * pps - 6));
        if (f.alto > hueco * pps) prueba.encimadas++;
      });
      filas.push(...propias);
      for (const a of can.acomp) acomp.push({ ...a, t: t0 + a.t });
      t0 += can.duracion + ENTRE;
    });
    acomp.sort((a, b) => a.t - b.t);
  }
  const finCanciones = inicios[inicios.length - 1] + lista[lista.length - 1].duracion;

  // ── Estado ──
  let fase: 'juego' | 'fin' = 'juego', vidas = VIDAS, puntos = 0, aciertos = 0, racha = 0, mejorRacha = 0, errores = 0, largas = 0, fiebres = 0;
  let fiebre = 0, fiebreHasta = 0, cancion = -1, invulnerable = 0, iAcomp = 0, desde = 0;
  let sostiene: { fila: Fila; carril: number } | null = null;
  const destello = [0, 0, 0, 0], rojo = [0, 0, 0, 0];
  const pendiente = () => { for (let i = desde; i < filas.length; i++) { const f = filas[i]; if (!f.perdida && f.hechas.length < f.carriles.length) return f; } return null; };
  const fondoDe = (f: Fila) => LINEA + (m.tiempo - f.t) * f.pps; // borde de abajo de la tecla: llega a la línea justo a su hora
  const enFiebre = () => m.tiempo < fiebreHasta;

  // ── Tocar ──
  const valor = () => (10 + Math.min(30, Math.floor(racha / 10) * 5)) * (enFiebre() ? 2 : 1);
  function tocar(carril: number) {
    if (fase !== 'juego') return;
    const f = pendiente();
    if (!f || fondoDe(f) < 40) return; // todavía no asoma: no castiga
    const i = f.carriles.indexOf(carril);
    if (i >= 0 && !f.hechas.includes(carril)) {
      f.hechas.push(carril); aciertos++; racha++; mejorRacha = Math.max(mejorRacha, racha);
      puntos += valor();
      if (!enFiebre()) { fiebre++; if (fiebre >= FIEBRE_LLENA) { fiebre = 0; fiebreHasta = m.tiempo + FIEBRE_DURA; fiebres++; m.mesa.hud.aviso('¡FIEBRE! Puntaje doble', 'oro', 1.4); m.efectos.temblar(6); } }
      if (f.larga) { sostiene = { fila: f, carril }; largas++; }
      destello[carril] = 1;
      const [x, y] = centroCarril(carril, Math.min(H - 40, fondoDe(f) - Math.min(f.alto, RH) / 2));
      m.efectos.chispas(x, y, enFiebre() ? ['#ffd23c', '#ff8a2a', '#ffffff'] : ['#ffd23c', '#fff6c9'], 8, 220);
      if (racha % 25 === 0) m.efectos.flotar(x, y - 30, `Racha ${racha}`, '#ffd23c', 26);
      // La nota de la canción (en audio cargado, la canción ya suena: solo un clic suave)
      if (lista[f.cancion].audio) m.mesa.sonido.tono(1200, 0.03, 'sine', 0.02);
      else { const nota = hz(f.midis[i]), dura = Math.min(0.9, Math.max(0.18, f.dur)); m.mesa.sonido.tono(nota, dura, 'triangle', 0.075); m.mesa.sonido.tono(nota * 2, dura * 0.6, 'sine', enFiebre() ? 0.03 : 0.015); }
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
    const f = sostiene.fila, bonus = Math.round(f.sostenido * f.dur * 40) * (enFiebre() ? 2 : 1);
    if (bonus > 0) { puntos += bonus; const [x, y] = centroCarril(sostiene.carril, Math.max(80, Math.min(H - 60, fondoDe(f) - f.alto))); m.efectos.flotar(x, y, `+${bonus}`, '#7cffcb', 24); }
    sostiene = null;
  };

  // Audio cargado: suena con su propio reproductor, alineado con el reloj del juego (y se pausa con la partida)
  let audioCtx: AudioContext | null = null, audioPrevio = -1, audioQuieto = 0;
  const tocarAudio = (k: number) => {
    const buf = lista[k].audio; if (!buf) return;
    try {
      audioCtx ??= new AudioContext();
      const fuente = audioCtx.createBufferSource(), vol = audioCtx.createGain(); vol.gain.value = 0.8;
      fuente.buffer = buf; fuente.connect(vol).connect(audioCtx.destination); fuente.start(0, Math.max(0, m.tiempo - inicios[k]));
    } catch { /* sin audio */ }
  };

  m.alPaso((dt) => {
    if (fase !== 'juego') return;
    const t = m.tiempo;
    if ((!c.libre && t >= DURA) || t > finCanciones + 1.5) { soltar(); terminar(t > finCanciones ? 'Terminó la canción' : 'Se acabó el tiempo'); return; }
    // Canción nueva
    let actual = -1; inicios.forEach((x, i) => { if (t >= x - 1) actual = i; });
    if (actual !== cancion && actual >= 0) { cancion = actual; const k = lista[cancion]; m.mesa.hud.aviso(`♪ ${k.titulo} · ${k.romaji}`, 'oro', 2.2); }
    if (cancion >= 0 && lista[cancion].audio && t >= inicios[cancion] && audioPrevio !== cancion) { audioPrevio = cancion; tocarAudio(cancion); }
    // Acompañamiento (bajo y acordes) a su hora
    while (iAcomp < acomp.length && acomp[iAcomp].t <= t + 0.05) { const a = acomp[iAcomp++]; if (a.t >= t - 0.1) m.mesa.sonido.tono(hz(a.midi), a.dur, 'triangle', a.vol, Math.max(0, a.t - t)); }
    // Tecla larga: suma mientras se mantiene, hasta que termina su nota
    if (sostiene) {
      const f = sostiene.fila, apretada = bot ? botSostiene : m.teclas.has(TECLAS[sostiene.carril]) || (m.puntero.abajo && carrilEn(m.puntero.x) === sostiene.carril);
      f.sostenido = Math.min(1, Math.max(f.sostenido, (t - f.t) / Math.max(0.2, f.dur - 0.08)));
      if (!apretada || f.sostenido >= 1) soltar();
    }
    // Se pasó una negra (su borde de arriba salió por abajo)
    for (let i = desde; i < filas.length; i++) {
      const f = filas[i];
      if (f.t - t > 3) break;
      if (!f.perdida && f.hechas.length < f.carriles.length && fondoDe(f) - Math.min(f.alto, RH) > H) { f.perdida = true; fallo(f.carriles.find((k) => !f.hechas.includes(k)) ?? 0, f, 'Se te pasó una'); }
    }
    while (desde < filas.length && fondoDe(filas[desde]) - filas[desde].alto > H + 20) desde++;
    for (let i = 0; i < 4; i++) { destello[i] = Math.max(0, destello[i] - dt * 5); rojo[i] = Math.max(0, rojo[i] - dt * 3); }
    if (bot) pilotar();
    m.mesa.hud.puntos(String(puntos));
    if (!c.libre) { const q = Math.max(0, Math.min(DURA, finCanciones + 1.5) - t); m.mesa.hud.tiempo(`${Math.floor(q / 60)}:${String(Math.floor(q % 60)).padStart(2, '0')}`); }
    m.mesa.hud.extra(`${c.libre ? '' : `${'♥'.repeat(Math.max(0, vidas))} · `}racha ${racha}${enFiebre() ? ' · ×2' : ''}`); // corto, para el celular
  });
  m.alTecla((k) => { const i = TECLAS.indexOf(k); if (i >= 0 && !bot) tocar(i); });
  m.alTocar((x) => { if (!bot) tocar(carrilEn(x)); });

  // ── Bots: el bueno toca cada tecla justo a su hora y mantiene las largas; el torpe llega tarde y se equivoca ──
  const rb = generador('bot-teclas');
  let botSostiene = false, botEspera = 0;
  function pilotar() {
    const torpe = bot === 'torpe';
    if (sostiene) { botSostiene = torpe ? rb() > 0.012 : true; return; }
    const f = pendiente();
    if (!f || m.tiempo < botEspera) return;
    if (fondoDe(f) < (torpe ? LINEA + 40 : LINEA - 10)) return;
    botEspera = m.tiempo + (torpe ? 0.08 + rb() * 0.22 : 0.02);
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
    // Línea del ritmo: la tecla llega aquí justo cuando suena su nota
    gp.fillStyle = 'rgba(201,138,0,.35)'; gp.fillRect(px(xi), px(LINEA), px(w), k);
    // Teclas (solo las que están en pantalla)
    for (let i = desde; i < filas.length; i++) {
      const f = filas[i], fondo = fondoDe(f), arriba = fondo - f.alto;
      if (fondo < 0) break;
      if (arriba > H) continue;
      for (const carril of f.carriles) {
        const hecha = f.hechas.includes(carril), x = px(xi + carril * lw + k), ancho2 = px(lw) - 2 * k, y = px(arriba + k), alto2 = px(f.alto) - 2 * k;
        if (hecha && !f.larga) { gp.fillStyle = 'rgba(20,24,44,.18)'; gp.fillRect(x, y, ancho2, alto2); continue; }
        gp.fillStyle = f.error > 0 && !hecha ? '#7a0f2b' : fiebreOn ? '#3a1650' : '#14182c'; gp.fillRect(x, y, ancho2, alto2);
        gp.fillStyle = fiebreOn ? '#ffd23c' : '#c98a00'; gp.fillRect(x, y, ancho2, k); // filo dorado
        if (f.larga) {
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
    // Pausa: el audio cargado se detiene si el reloj del juego se detiene
    if (audioCtx) { const quieto = m.tiempo === audioQuieto; audioQuieto = m.tiempo; if (quieto && audioCtx.state === 'running') audioCtx.suspend().catch(() => {}); else if (!quieto && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {}); }
    const xi = x0(), w = anchoTablero(), lleno = enFiebre() ? (fiebreHasta - m.tiempo) / FIEBRE_DURA : fiebre / FIEBRE_LLENA;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(xi, 64, w, 8);
    g.fillStyle = enFiebre() ? '#ff8a2a' : '#ffd23c'; g.fillRect(xi, 64, w * Math.max(0, Math.min(1, lleno)), 8);
    if (cancion >= 0) { const k = lista[cancion]; m.rotulo(`♪ ${k.titulo}`, m.ancho / 2, 90, Math.round(Math.min(18, m.ancho / 22)), 'rgba(255,246,201,.85)'); }
    if (!bot && m.tiempo < 6) {
      const tam = Math.round(Math.min(22, m.ancho / 22));
      m.rotulo('Toca solo las negras, la de más abajo primero', m.ancho / 2, H * 0.42, tam, '#fff6c9');
      m.rotulo(m.ancho > 600 ? 'Teclas D  F  J  K, o toca su carril · mantén las largas' : 'Toca su carril · mantén las largas', m.ancho / 2, H * 0.42 + tam * 1.6, Math.round(tam * 0.8), '#ffffff');
    }
    if (m.ancho > 600) for (let i = 0; i < 4; i++) m.rotulo(TECLAS[i].toUpperCase(), xi + ((i + 0.5) * w) / 4, LINEA + 30, 22, 'rgba(20,24,44,.4)');
  });

  let terminado = false;
  function terminar(porque: string) {
    if (terminado) return;
    terminado = true; fase = 'fin';
    m.detener(); audioCtx?.close().catch(() => {});
    const tocadas = lista.slice(0, cancion + 1).map((x) => x.titulo).join(' · ') || '—';
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Resultado', porque], ['Teclas tocadas', String(aciertos)], ['Mejor racha', String(mejorRacha)], ['Teclas largas', String(largas)], ['Fiebres', String(fiebres)], ['Canciones', tocadas], ['Errores', String(errores)]],
      detalle: { aciertos, racha: mejorRacha, largas, fiebres, cancion: cancion + 1, errores },
    });
  }

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__teclas = () => ({ fase, puntos, aciertos, racha, errores, vidas, cancion, canciones: lista.map((x) => x.id), terminado, seg: Math.round(m.tiempo), ...prueba });
  return {
    empezar() { m.empezar(); },
    destruir() { audioCtx?.close().catch(() => {}); m.destruir(); },
  };
}

/** Práctica: elegir una canción del repertorio, o cargar un MIDI o un mp3 propio. null = como en el torneo (3 al azar). */
function elegirCancion(caja: HTMLElement): Promise<Cancion | null> {
  return new Promise((listo) => {
    const panel = document.createElement('div');
    panel.className = 'teclas-elegir';
    const nombres = ['', 'Tranquilas', 'Medias', 'Rápidas'];
    panel.innerHTML = `<h3>Teclas del Faro · elige tu canción</h3>
      <div class="teclas-elegir-acciones"><button type="button" data-azar class="boton">Al azar (como en el torneo)</button>
      <label class="boton secundario">Cargar mi canción (MIDI o mp3)<input type="file" accept=".mid,.midi,audio/*" hidden /></label></div>
      <p class="teclas-elegir-error" hidden></p>
      ${[1, 2, 3].map((n) => `<h4>${nombres[n]}</h4><div class="teclas-elegir-lista">${REPERTORIO.filter((x) => x.nivel === n).map((x) => `<button type="button" data-id="${x.id}"><b lang="ja">${x.titulo}</b><span>${x.romaji} · ${x.es} · ${x.bpm} BPM</span></button>`).join('')}</div>`).join('')}
      <p class="tenue chico">Las canciones que cargas quedan solo en este navegador, para practicar. En el torneo y los duelos suenan las del repertorio.</p>`;
    caja.appendChild(panel);
    const cerrar = (x: Cancion | null) => { panel.remove(); listo(x); };
    const error = panel.querySelector<HTMLElement>('.teclas-elegir-error')!;
    panel.querySelector('[data-azar]')!.addEventListener('click', () => cerrar(null));
    for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-id]')) b.addEventListener('click', () => cerrar(cancionPorId(b.dataset.id!)));
    panel.querySelector<HTMLInputElement>('input[type=file]')!.addEventListener('change', async (e) => {
      const archivo = (e.target as HTMLInputElement).files?.[0];
      if (!archivo) return;
      error.hidden = false; error.textContent = `Leyendo ${archivo.name}…`;
      try { cerrar(await cargarArchivo(archivo)); }
      catch (err) { error.textContent = `No se pudo usar ese archivo: ${err instanceof Error ? err.message : err}`; }
    });
  });
}
