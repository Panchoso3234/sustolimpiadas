import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario } from '../reflejos/motor';
import { ATAQUES, ELEGIBLES, ESPECIES, TIPOS, eficacia, especie, type EstadoAlterado, type Stat, type Tipo } from './bestiasDatos';
import { elegirAccion, elegirReemplazo, type Nivel } from './bestiasIA';
import { animarBestia, crearBestia, type Bestia } from './bestiasModelo';
import { NIVEL, acciones, activo, ataqueDe, cambiar, necesitaCambio, nuevoCombate, resolverTurno, tipos, type Accion, type Combate, type Evento, type Texto } from './bestiasNucleo';

// Bestiario: batallas de criaturas al estilo clásico, de frente. Eliges 3 criaturas de 6 sorteadas y subes una torre de
// rivales cada vez más listos. Tu criatura de espaldas abajo a la izquierda y la rival de frente arriba a la derecha,
// sus cuadros de vida, el cuadro de texto y el menú Luchar / Equipo / Objetos.

const COMBATES = 3;
const RIVALES: { nombre: string; nivel: Nivel }[] = [{ nombre: 'Excursionista Toño', nivel: 'facil' }, { nombre: 'Domadora Ema', nivel: 'normal' }, { nombre: 'Maestro Bruno', nivel: 'dificil' }];
const STAT: Record<Stat, string> = { at: 'El Ataque', def: 'La Defensa', ate: 'El Ataque Esp.', dfe: 'La Defensa Esp.', vel: 'La Velocidad' };
const SIGLA: Record<EstadoAlterado, [string, string]> = { quemado: ['QUE', '#ee8130'], paralizado: ['PAR', '#d8b020'], dormido: ['DOR', '#8a8a9a'], envenenado: ['ENV', '#a33ea1'], toxico: ['TOX', '#7a1a8a'], congelado: ['CON', '#5ab8d8'] };
const chip = (t: Tipo) => `<span class="b-tipo" style="background:${TIPOS[t].color}">${TIPOS[t].nombre}</span>`;
const P_JUGADOR = new THREE.Vector3(-1.95, 0, 1.25), P_RIVAL = new THREE.Vector3(1.95, 0, -1.6), P_VITRINA = new THREE.Vector3(0.25, 0, 0.6);

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 8.6, alto: 4.9, centro: [0, 0.95, 0], inclinacion: 0.2, sinPlaya: true });
  const parametros = new URLSearchParams(location.search), piloto = import.meta.env.DEV && parametros.has('piloto');
  const aceleracion = import.meta.env.DEV ? Math.max(1, Number(parametros.get('rapido')) || 1) : 1;
  const r = generador(`${c.semilla}|bestias`);

  // ── El escenario: cielo, pasto, cerros, árboles, nubes y las dos plataformas ──
  const cielo = document.createElement('canvas'); cielo.width = 2; cielo.height = 256;
  const gc = cielo.getContext('2d')!, grad = gc.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5fb4ec'); grad.addColorStop(0.6, '#bfe6ff'); grad.addColorStop(1, '#f2fbff'); gc.fillStyle = grad; gc.fillRect(0, 0, 2, 256);
  const texCielo = new THREE.CanvasTexture(cielo); texCielo.colorSpace = THREE.SRGBColorSpace; e.escena.background = texCielo;
  const pasto = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: '#8fd06a' })); pasto.rotation.x = -Math.PI / 2; e.escena.add(pasto);
  const camino = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 60), new THREE.MeshLambertMaterial({ color: '#d8c890' })); camino.rotation.x = -Math.PI / 2; camino.rotation.z = 0.5; camino.position.set(0, 0.005, -8); e.escena.add(camino);
  for (const [x, z, s, col] of [[-9, -16, 6, '#6ab84a'], [-2, -20, 8, '#5aa83e'], [8, -17, 7, '#72c052'], [15, -22, 9, '#5aa83e']] as [number, number, number, string][]) { const cerro = new THREE.Mesh(new THREE.SphereGeometry(s, 24, 12), new THREE.MeshLambertMaterial({ color: col })); cerro.scale.y = 0.45; cerro.position.set(x, 0, z); e.escena.add(cerro); }
  for (const [x, z] of [[-6.5, -5], [-7.5, -2], [6.8, -6], [7.6, -3.2], [-5.2, -8], [5.4, -9]]) {
    const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8), mat('#8a5a38')); tronco.position.set(x, 0.4, z);
    const copa = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), mat('#4a9a3a')); copa.position.set(x, 1.25, z); copa.scale.y = 1.15;
    e.escena.add(tronco, copa);
  }
  const nubes: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const n = new THREE.Group();
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.6 + (k % 2) * 0.3, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })); b.position.set(k * 0.7 - 1, (k % 2) * 0.3, 0); n.add(b); }
    n.position.set(-14 + i * 7, 6 + (i % 3), -18 - (i % 2) * 4); e.escena.add(n); nubes.push(n);
  }
  const plataforma = (p: THREE.Vector3, ancho: number) => {
    const g = new THREE.Group();
    const tierra = new THREE.Mesh(new THREE.CylinderGeometry(ancho, ancho * 0.92, 0.16, 32), mat('#b0905a')); tierra.position.y = -0.06;
    const cesped = new THREE.Mesh(new THREE.CylinderGeometry(ancho * 0.97, ancho, 0.05, 32), mat('#a8e07a')); cesped.position.y = 0.03;
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(ancho * 0.72, 0.03, 6, 40), mat('#8acb5a')); anillo.rotation.x = Math.PI / 2; anillo.position.y = 0.06;
    g.add(tierra, cesped, anillo); g.scale.z = 0.55; g.position.copy(p); e.escena.add(g);
    return g;
  };
  const plataformas = [plataforma(P_JUGADOR, 1.25), plataforma(P_RIVAL, 1.15)], vitrina = plataforma(P_VITRINA, 1.2);

  // ── La interfaz: cuadros de vida, cuadro de texto, menú y paneles ──
  const raiz = document.createElement('div'); raiz.className = 'bestias'; c.caja.appendChild(raiz);
  raiz.innerHTML = `
    <div class="b-caja b-rival"><div class="b-nombre"></div><div class="b-tipos"></div><div class="b-vida"><span>PS</span><i><b></b></i></div><div class="b-equipo"></div></div>
    <div class="b-caja b-mia"><div class="b-nombre"></div><div class="b-tipos"></div><div class="b-vida"><span>PS</span><i><b></b></i></div><div class="b-numeros"></div><div class="b-equipo"></div></div>
    <div class="b-abajo"><div class="b-texto"></div><div class="b-menu"></div></div>
    <div class="b-panel"></div>`;
  const $ = (s: string) => raiz.querySelector<HTMLElement>(s)!;
  const cajas = [$('.b-mia'), $('.b-rival')], elTexto = $('.b-texto'), elMenu = $('.b-menu'), panel = $('.b-panel'), abajo = $('.b-abajo');

  // ── Animaciones con promesas: `await animar(seg, k => ...)` ──
  const velocidad = aceleracion;
  let vivo = true;
  const tareas: { t: number; dur: number; f: (k: number) => void; listo: () => void }[] = [];
  const animar = (dur: number, f: (k: number) => void = () => {}) => new Promise<void>((listo) => tareas.push({ t: 0, dur, f, listo }));
  const esperar = (seg: number) => animar(seg);

  // ── Entrada: teclado, toque y control; los menús escuchan aquí ──
  let alTeclear: ((k: string) => void) | null = null, apurar = false;
  e.escuchar(window, 'keydown', (ev) => {
    const k = ev.key === ' ' ? 'Enter' : ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'w', 'a', 's', 'd', 'Backspace'].includes(k)) ev.preventDefault();
    if (k === 'Enter') apurar = true;
    alTeclear?.({ w: 'ArrowUp', s: 'ArrowDown', a: 'ArrowLeft', d: 'ArrowRight', Backspace: 'Escape' }[k] ?? k);
  });
  e.escuchar(window, 'keyup', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') apurar = false; });
  e.escuchar(abajo, 'pointerdown', () => { apurar = true; if (!elMenu.childElementCount) alTeclear?.('Enter'); });
  e.escuchar(window, 'pointerup', () => { apurar = false; });
  let padAntes: Record<string, boolean> = {};
  const leerControl = () => {
    const pad = typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()].find((p) => p?.connected) : null;
    if (!pad) return;
    const ahora: Record<string, boolean> = { Enter: !!pad.buttons[0]?.pressed, Escape: !!pad.buttons[1]?.pressed, ArrowUp: !!pad.buttons[12]?.pressed || pad.axes[1] < -0.6, ArrowDown: !!pad.buttons[13]?.pressed || pad.axes[1] > 0.6, ArrowLeft: !!pad.buttons[14]?.pressed || pad.axes[0] < -0.6, ArrowRight: !!pad.buttons[15]?.pressed || pad.axes[0] > 0.6 };
    for (const [k, v] of Object.entries(ahora)) if (v && !padAntes[k]) alTeclear?.(k);
    apurar = ahora.Enter || apurar;
    padAntes = ahora;
  };

  /** Un menú de botones: flechas para moverse, Enter para elegir, Esc para volver (si se puede). */
  const menu = <T,>(opciones: { html: string; valor: T; no?: boolean; clase?: string }[], columnas: number, volver: boolean, donde: HTMLElement = elMenu): Promise<T | null> => new Promise((listo) => {
    donde.innerHTML = '';
    donde.style.setProperty('--columnas', String(columnas));
    let foco = Math.max(0, opciones.findIndex((o) => !o.no));
    const botones = opciones.map((o, i) => {
      const b = document.createElement('button'); b.className = `b-opcion ${o.clase ?? ''}`; b.innerHTML = o.html; b.disabled = !!o.no;
      b.addEventListener('pointerenter', () => { if (!o.no) { foco = i; marcar(); } });
      b.addEventListener('click', (ev) => { ev.stopPropagation(); if (!o.no) elegir(i); });
      donde.appendChild(b); return b;
    });
    if (volver) { const b = document.createElement('button'); b.className = 'b-opcion b-volver'; b.textContent = '← Volver'; b.addEventListener('click', (ev) => { ev.stopPropagation(); fin(null); }); donde.appendChild(b); }
    const marcar = () => botones.forEach((b, i) => b.classList.toggle('foco', i === foco));
    const fin = (v: T | null) => { alTeclear = null; donde.innerHTML = ''; listo(v); };
    const elegir = (i: number) => { e.sonido.tono(988, 0.05, { tipo: 'square', vol: 0.05 }); fin(opciones[i].valor); };
    marcar();
    alTeclear = (k) => {
      const mover = (d: number) => { let i = foco; for (let n = 0; n < opciones.length; n++) { i = (i + d + opciones.length) % opciones.length; if (!opciones[i].no) break; } foco = i; marcar(); e.sonido.tono(660, 0.025, { tipo: 'square', vol: 0.03 }); };
      if (k === 'ArrowRight') mover(1); else if (k === 'ArrowLeft') mover(-1); else if (k === 'ArrowDown') mover(columnas); else if (k === 'ArrowUp') mover(-columnas);
      else if (k === 'Enter') elegir(foco); else if (k === 'Escape' && volver) fin(null);
    };
  });

  /** Escribe un mensaje letra por letra; sigue solo (o antes con Enter / un toque). */
  const decir = async (texto: string, pausa = 0.75) => {
    elTexto.textContent = '';
    let mostrado = 0;
    await new Promise<void>((listo) => {
      tareas.push({ t: 0, dur: 99, f: () => {}, listo: () => {} });
      const tarea = tareas[tareas.length - 1];
      tarea.f = () => {
        const cps = 55 * (apurar ? 4 : 1);
        const meta = Math.min(texto.length, Math.floor(tarea.t * cps));
        if (meta !== mostrado) { mostrado = meta; elTexto.textContent = texto.slice(0, meta); }
        if (meta >= texto.length && tarea.t * cps >= texto.length + pausa * cps / (apurar ? 3 : 1)) { tarea.dur = 0; listo(); }
      };
    });
    elTexto.textContent = texto;
  };

  // ── Las criaturas en escena ──
  const modelos: (Bestia | null)[] = [null, null], enEscena = [0, 0];
  let enVitrina: Bestia | null = null;
  const poner = (lado: number, n: number) => {
    modelos[lado]?.grupo.removeFromParent();
    const b = crearBestia(n), p = lado === 0 ? P_JUGADOR : P_RIVAL;
    b.grupo.position.copy(p);
    // Tu criatura mira hacia la rival (se ve de espaldas); la rival te mira a ti
    const hacia = lado === 0 ? P_RIVAL : P_JUGADOR;
    b.grupo.rotation.y = lado === 0 ? Math.atan2(hacia.x - p.x, hacia.z - p.z) + 0.3 : -0.45;
    if (lado === 0) b.grupo.scale.setScalar(1.15);
    e.escena.add(b.grupo); modelos[lado] = b; enEscena[lado] = n;
    return b;
  };
  const verEnVitrina = (n: number) => {
    enVitrina?.grupo.removeFromParent();
    enVitrina = crearBestia(n); enVitrina.grupo.position.copy(P_VITRINA);
    const s = Math.min(1.4, 1.7 / enVitrina.alto); enVitrina.grupo.scale.setScalar(s);
    e.escena.add(enVitrina.grupo);
  };
  const grito = (n: number, grave = 1) => {
    const f = (260 + ((n * 97) % 420)) * grave * (especie(n).legendaria ? 0.5 : 1), ctx = e.sonido.ctx?.currentTime ?? 0;
    e.sonido.tono(f, 0.16, { tipo: 'square', vol: 0.07, hasta: f * 1.4 });
    e.sonido.tono(f * 1.25, 0.22, { tipo: 'sawtooth', vol: 0.05, hasta: f * 0.8, cuando: ctx + 0.13 });
  };

  /** Aparece con un destello y un saltito. */
  const entrar = async (lado: number, n: number) => {
    const b = poner(lado, n), s = b.grupo.scale.x;
    e.chispas(b.grupo.position.x, 0.6, b.grupo.position.z, ['#ffffff', '#ffe36b', TIPOS[especie(n).tipos[0]].color], 22, 3.5);
    grito(n);
    await animar(0.45, (k) => { b.grupo.scale.setScalar(s * Math.min(1, k * 1.2)); b.grupo.position.y = Math.sin(k * Math.PI) * 0.35; });
    b.grupo.position.y = 0;
  };
  const salir = async (lado: number) => {
    const b = modelos[lado];
    if (!b) return;
    const s = b.grupo.scale.x;
    await animar(0.3, (k) => b.grupo.scale.setScalar(s * (1 - k)));
    b.grupo.removeFromParent(); modelos[lado] = null;
  };

  // ── Cuadros de vida ──
  let combate: Combate | null = null;
  const vidaMostrada = [1, 1];
  const nombre = (lado: number, n?: number) => `${especie(n ?? activo(combate!, lado).n).nombre}${lado === 1 ? ' rival' : ''}`;
  const pintarCaja = (lado: number) => {
    if (!combate) return;
    const yo = activo(combate, lado), sp = especie(yo.n), caja = cajas[lado];
    caja.querySelector('.b-nombre')!.innerHTML = `${sp.nombre} <small>Nv.${NIVEL}</small>${yo.estado ? ` <em style="background:${SIGLA[yo.estado][1]}">${SIGLA[yo.estado][0]}</em>` : ''}`;
    caja.querySelector('.b-tipos')!.innerHTML = sp.tipos.map(chip).join('');
    caja.querySelector('.b-equipo')!.innerHTML = combate.lados[lado].equipo.map((l) => `<i class="${l.ps > 0 ? (l.estado ? 'mal' : 'bien') : 'fuera'}"></i>`).join('');
    pintarVida(lado);
  };
  const pintarVida = (lado: number) => {
    if (!combate) return;
    const yo = activo(combate, lado), k = vidaMostrada[lado], barra = cajas[lado].querySelector<HTMLElement>('.b-vida b')!;
    barra.style.width = `${Math.max(0, k) * 100}%`;
    barra.style.background = k > 0.5 ? '#3fd06a' : k > 0.2 ? '#f2c22c' : '#e8423a';
    if (lado === 0) cajas[0].querySelector('.b-numeros')!.textContent = `${Math.round(k * yo.max)} / ${yo.max}`;
  };
  const vidaHacia = async (lado: number) => {
    if (!combate) return;
    const yo = activo(combate, lado), desde = vidaMostrada[lado], hasta = yo.ps / yo.max;
    await animar(Math.min(0.9, 0.25 + Math.abs(hasta - desde) * 1.2), (k) => { vidaMostrada[lado] = desde + (hasta - desde) * k; pintarVida(lado); });
  };

  // ── Efectos de ataque: embestida (físico) o un proyectil del color de su tipo (especial) ──
  const proyectil = async (desde: number, tipo: Tipo) => {
    const a = (desde === 0 ? P_JUGADOR : P_RIVAL).clone().setY(0.7), b = (desde === 0 ? P_RIVAL : P_JUGADOR).clone().setY(0.7);
    const bola = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color: TIPOS[tipo].color }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45 }));
    bola.add(halo); e.escena.add(bola);
    await animar(0.42, (k) => { bola.position.lerpVectors(a, b, k); bola.position.y += Math.sin(k * Math.PI) * 0.6; bola.scale.setScalar(0.8 + Math.sin(k * 30) * 0.15); if (Math.random() < 0.5) e.chispas(bola.position.x, bola.position.y, bola.position.z, [TIPOS[tipo].color], 1, 0.8); });
    bola.removeFromParent();
    e.chispas(b.x, b.y, b.z, [TIPOS[tipo].color, '#ffffff'], 20, 3.2);
  };
  const embestida = async (lado: number) => {
    const m = modelos[lado];
    if (!m) return;
    const p0 = m.grupo.position.clone(), destino = (lado === 0 ? P_RIVAL : P_JUGADOR).clone().lerp(p0, 0.55);
    await animar(0.32, (k) => m.grupo.position.lerpVectors(p0, destino, Math.sin(k * Math.PI)));
    m.grupo.position.copy(p0);
  };
  const recibir = async (lado: number, fuerte: boolean) => {
    const m = modelos[lado];
    if (!m) return;
    if (fuerte) e.temblar(0.35);
    e.sonido.ruido(0.14, fuerte ? 0.2 : 0.12); e.sonido.tono(fuerte ? 160 : 120, 0.12, { tipo: 'square', vol: 0.08, hasta: 60 });
    await animar(0.5, (k) => { m.grupo.visible = Math.floor(k * 8) % 2 === 0; });
    m.grupo.visible = true;
  };

  /** Cuenta un evento del combate: texto, animación y cuadros. */
  const TEXTOS: Record<Texto, (n: string) => string> = {
    falla: (n) => `¡El ataque de ${n} falló!`, noAfecta: (n) => `No afecta a ${n}…`, seProtegio: (n) => `¡${n} se protegió!`, protege: (n) => `¡${n} se está protegiendo!`,
    retrocede: (n) => `¡${n} retrocedió y no pudo atacar!`, dormido: (n) => `${n} está profundamente dormido.`, despierta: (n) => `¡${n} se despertó!`,
    congelado: (n) => `¡${n} está congelado!`, descongela: (n) => `¡${n} ya no está congelado!`, paralizado: (n) => `¡${n} está paralizado! No se puede mover.`,
    confundido: (n) => `${n} está confundido…`, sinConfusion: (n) => `¡${n} ya no está confundido!`, seGolpea: () => '¡Está tan confundido que se hirió a sí mismo!',
    sinEfecto: () => 'No tuvo efecto.', yaTiene: (n) => `No tuvo efecto en ${n}.`, pocion: (n) => `¡Se usó una Poción en ${n}!`, cura: (n) => `¡${n} se curó!`,
    forcejeo: (n) => `¡A ${n} no le quedan PP!`, sinPP: (n) => `¡A ${n} no le quedan PP!`, curaEstado: (n) => `¡${n} se curó de todos sus problemas!`,
  };
  const ESTADO_TEXTO: Record<EstadoAlterado, string> = { quemado: 'se quemó', paralizado: 'está paralizado. Quizás no pueda moverse', dormido: 'se durmió', envenenado: 'fue envenenado', toxico: 'fue gravemente envenenado', congelado: 'quedó congelado' };
  let eficaces = 0, criticos = 0;
  const contar = async (ev: Evento) => {
    switch (ev.t) {
      case 'ataque': {
        const at = ev.ataque === 'forcejeo' ? null : ATAQUES[ev.ataque], tipo = at?.tipo ?? 'normal';
        await decir(`¡${nombre(ev.lado)} usó ${at?.nombre ?? 'Forcejeo'}!`, 0.25);
        if (at?.cat === 'estado') { const m = modelos[ev.lado]; if (m) { e.chispas(m.grupo.position.x, 0.8, m.grupo.position.z, [TIPOS[tipo].color, '#ffffff'], 14, 2.2); e.sonido.tono(520, 0.2, { tipo: 'triangle', vol: 0.08, hasta: 900 }); } await esperar(0.35); }
        else if (at?.cat === 'especial') { e.sonido.tono(700, 0.3, { tipo: 'sawtooth', vol: 0.05, hasta: 300 }); await proyectil(ev.lado, tipo); }
        else await embestida(ev.lado);
        break;
      }
      case 'daño': {
        if (ev.propio === 'estado') await decir(`¡${nombre(ev.lado)} sufre por ${activo(combate!, ev.lado).estado === 'quemado' ? 'la quemadura' : 'el veneno'}!`, 0.2);
        await Promise.all([recibir(ev.lado, ev.efic > 1 || ev.critico), vidaHacia(ev.lado)]);
        if (ev.propio === 'rebote') await decir(`¡${nombre(ev.lado)} también se hizo daño!`);
        if (ev.critico) { await decir('¡Un golpe crítico!'); if (ev.lado === 1) criticos++; }
        if (!ev.propio && ev.efic > 1) { await decir('¡Es muy eficaz!'); if (ev.lado === 1) eficaces++; }
        if (!ev.propio && ev.efic < 1) await decir('No es muy eficaz…');
        break;
      }
      case 'cura': { const m = modelos[ev.lado]; if (m) e.chispas(m.grupo.position.x, 0.6, m.grupo.position.z, ['#8affb0', '#ffffff'], 16, 2); e.sonido.tono(660, 0.3, { tipo: 'triangle', vol: 0.08, hasta: 1320 }); await vidaHacia(ev.lado); await decir(`${nombre(ev.lado)} recuperó PS.`); break; }
      case 'estado': pintarCaja(ev.lado); e.sonido.tono(300, 0.25, { tipo: 'square', vol: 0.06, hasta: 200 }); await decir(`¡${nombre(ev.lado)} ${ESTADO_TEXTO[ev.estado]}!`); break;
      case 'confusion': await decir(`¡${nombre(ev.lado)} se confundió!`); break;
      case 'stat': {
        const m = modelos[ev.lado];
        if (m && !ev.tope) { for (let i = 0; i < 6; i++) e.chispas(m.grupo.position.x + (Math.random() - 0.5) * 0.6, ev.cambio > 0 ? 0.2 : 1.4, m.grupo.position.z, [ev.cambio > 0 ? '#ff8a3a' : '#5a8aff'], 1, 1.2); e.sonido.tono(ev.cambio > 0 ? 400 : 700, 0.25, { tipo: 'triangle', vol: 0.07, hasta: ev.cambio > 0 ? 800 : 350 }); }
        await decir(ev.tope ? `¡${STAT[ev.stat]} de ${nombre(ev.lado)} no puede ${ev.cambio > 0 ? 'subir' : 'bajar'} más!` : `¡${STAT[ev.stat]} de ${nombre(ev.lado)} ${ev.cambio > 0 ? 'subió' : 'bajó'}${Math.abs(ev.cambio) >= 2 ? ' mucho' : ''}!`);
        break;
      }
      case 'cambio': {
        const L = combate!.lados[ev.lado], n = L.equipo[ev.a].n;
        if (modelos[ev.lado]) { if (ev.lado === 0) await decir(`¡Vuelve, ${especie(enEscena[ev.lado]).nombre}!`, 0.2); await salir(ev.lado); }
        await decir(ev.lado === 0 ? `¡Adelante, ${especie(n).nombre}!` : `¡${RIVALES[numCombate].nombre} envió a ${especie(n).nombre}!`, 0.2);
        vidaMostrada[ev.lado] = L.equipo[ev.a].ps / L.equipo[ev.a].max; pintarCaja(ev.lado);
        await entrar(ev.lado, n);
        break;
      }
      case 'debilitado': {
        const m = modelos[ev.lado];
        if (m) { grito(activo(combate!, ev.lado).n, 0.6); const y0 = m.grupo.position.y; await animar(0.55, (k) => { m.grupo.position.y = y0 - k * 1.2; m.grupo.scale.y = m.grupo.scale.x * (1 - k * 0.6); }); m.grupo.removeFromParent(); modelos[ev.lado] = null; }
        pintarCaja(ev.lado);
        await decir(`¡${nombre(ev.lado)} se debilitó!`);
        break;
      }
      case 'texto': await decir(TEXTOS[ev.clave](nombre(ev.lado))); break;
      case 'fin': break;
    }
  };
  const contarTodo = async (evs: Evento[]) => { for (const ev of evs) { if (!vivo) return; await contar(ev); } };

  // ── Menús del turno ──
  const menuAtaques = async (): Promise<Accion | null> => {
    const yo = activo(combate!, 0), el = activo(combate!, 1);
    if (yo.pp.every((p) => p <= 0)) return { tipo: 'atacar', i: -1 };
    return menu(especie(yo.n).ataques.map((id, i) => {
      const at = ataqueDe(yo, i), ef = at.cat === 'estado' ? -1 : eficacia(at.tipo, tipos(el));
      const pista = ef < 0 ? '' : ef === 0 ? '<u class="nulo">No afecta</u>' : ef > 1 ? '<u class="muy">Muy eficaz</u>' : ef < 1 ? '<u class="poco">Poco eficaz</u>' : '';
      return { html: `<strong>${at.nombre}</strong><span style="background:${TIPOS[at.tipo].color}">${TIPOS[at.tipo].nombre}</span><small>PP ${yo.pp[i]}/${at.pp}</small>${pista}`, valor: { tipo: 'atacar', i } as Accion, no: yo.pp[i] <= 0, clase: 'b-ataque' };
    }), 2, true);
  };
  const menuEquipo = async (forzado: boolean): Promise<number | null> => {
    const L = combate!.lados[0];
    if (!forzado) await decir('¿A quién quieres mandar?', 0);
    return menu(L.equipo.map((l, a) => ({ html: `<strong>${especie(l.n).nombre}</strong>${especie(l.n).tipos.map(chip).join('')}<small>PS ${l.ps}/${l.max}${l.estado ? ` · ${SIGLA[l.estado][0]}` : ''}${a === L.activo ? ' · en combate' : ''}</small>`, valor: a, no: l.ps <= 0 || a === L.activo, clase: 'b-miembro' })), 1, !forzado);
  };
  const turnoJugador = async (): Promise<Accion> => {
    if (piloto) return elegirAccion(combate!, 0, 'dificil');
    for (;;) {
      const L = combate!.lados[0];
      await decir(`¿Qué hará ${especie(activo(combate!, 0).n).nombre}?`, 0);
      const quiere = await menu([{ html: 'Luchar', valor: 'luchar' }, { html: 'Equipo', valor: 'equipo' }, { html: `Objetos <small>${L.pociones + L.curas}</small>`, valor: 'objetos' }, { html: 'Rendirse', valor: 'rendirse' }], 2, false);
      if (quiere === 'luchar') { const a = await menuAtaques(); if (a) return a; }
      if (quiere === 'equipo') { const a = await menuEquipo(false); if (a !== null) return { tipo: 'cambiar', a }; }
      if (quiere === 'objetos') {
        const posibles = acciones(combate!, 0);
        const o = await menu([
          { html: `<strong>Poción</strong><small>Cura la mitad de los PS · quedan ${L.pociones}</small>`, valor: 'pocion' as const, no: !posibles.some((x) => x.tipo === 'objeto' && x.cual === 'pocion') },
          { html: `<strong>Cura Total</strong><small>Quita estados y confusión · quedan ${L.curas}</small>`, valor: 'cura' as const, no: !posibles.some((x) => x.tipo === 'objeto' && x.cual === 'cura') },
        ], 1, true);
        if (o) return { tipo: 'objeto', cual: o };
      }
      if (quiere === 'rendirse') { await decir('¿Seguro que quieres rendirte? Se termina la torre.', 0); if (await menu([{ html: 'No, sigo', valor: false }, { html: 'Sí, me rindo', valor: true }], 2, false)) { rendido = true; return { tipo: 'atacar', i: 0 }; } }
    }
  };

  // ── Elegir equipo y Bestiario ──
  const fichaHTML = (n: number) => {
    const sp = especie(n), total = Object.values(sp.base).reduce((s, v) => s + v, 0), barras = [['PS', sp.base.ps], ['Ataque', sp.base.at], ['Defensa', sp.base.def], ['At. Esp.', sp.base.ate], ['Def. Esp.', sp.base.dfe], ['Velocidad', sp.base.vel]] as [string, number][];
    const previa = ESPECIES.find((x) => x.evoluciona === n);
    return `<header><b>N.º ${String(n).padStart(3, '0')}</b><h3>${sp.nombre}</h3>${sp.tipos.map(chip).join('')}</header>
      <p>${sp.descripcion}</p>
      <p class="b-evo">${sp.legendaria ? 'Criatura legendaria' : `${previa ? `Evoluciona de ${previa.nombre}` : 'Primera etapa'}${sp.evoluciona ? ` · evoluciona a ${especie(sp.evoluciona).nombre}` : ' · etapa final'}`}</p>
      <div class="b-stats">${barras.map(([k, v]) => `<span>${k}</span><i><b style="width:${Math.min(100, (v / 140) * 100)}%;background:${v >= 100 ? '#3fd06a' : v >= 70 ? '#f2c22c' : '#ee8130'}"></b></i><em>${v}</em>`).join('')}<span>Total</span><i></i><em>${total}</em></div>
      <ul class="b-ataques">${sp.ataques.map((id) => { const at = ATAQUES[id]; return `<li><span style="background:${TIPOS[at.tipo].color}">${TIPOS[at.tipo].nombre}</span><strong>${at.nombre}</strong><small>${at.cat === 'estado' ? 'Estado' : `${at.cat === 'fisico' ? 'Físico' : 'Especial'} · ${at.poder}`}${at.precision ? ` · ${at.precision}%` : ''}</small><p>${at.texto}</p></li>`; }).join('')}</ul>`;
  };
  const bestiario = async (desde: number) => {
    let n = desde;
    panel.className = 'b-panel visible b-bestiario';
    for (;;) {
      verEnVitrina(n);
      panel.innerHTML = `<div class="b-ficha">${fichaHTML(n)}</div><div class="b-nav"></div>`;
      const v = await menu([{ html: '◀ Anterior', valor: -1 }, { html: `${n} / ${ESPECIES.length}`, valor: 0 }, { html: 'Siguiente ▶', valor: 1 }], 3, true, panel.querySelector<HTMLElement>('.b-nav')!);
      if (v === null) return;
      n = ((n - 1 + v + ESPECIES.length) % ESPECIES.length) + 1;
      if (v !== 0) grito(n);
    }
  };
  const elegirEquipo = async (): Promise<number[]> => {
    const sorteo = [...ELEGIBLES].sort(() => r() - 0.5).slice(0, 6), elegidos: number[] = [];
    if (piloto) return sorteo.slice(0, 3);
    abajo.classList.add('oculto');
    let foco = sorteo[0];
    for (;;) {
      panel.className = 'b-panel visible b-elegir';
      verEnVitrina(foco);
      panel.innerHTML = `<div class="b-lista"><h2>Elige tu equipo <small>${elegidos.length} / 3</small></h2><p>El primero que elijas sale a combatir. Te esperan ${COMBATES} rivales cada vez más difíciles.</p><div class="b-opciones"></div></div><div class="b-ficha">${fichaHTML(foco)}</div>`;
      const opciones = [
        ...sorteo.map((n) => ({ html: `<strong>${especie(n).nombre}</strong>${especie(n).tipos.map(chip).join('')}${elegidos.includes(n) ? `<b class="b-marca">${elegidos.indexOf(n) + 1}</b>` : ''}`, valor: n, clase: elegidos.includes(n) ? 'elegido' : '' })),
        { html: '<strong>Ver Bestiario (30)</strong>', valor: -1, clase: 'b-especial' },
        { html: elegidos.length === 3 ? '<strong>¡A combatir!</strong>' : '<strong>Elige 3</strong>', valor: -2, no: elegidos.length !== 3, clase: 'b-listo' },
      ];
      const donde = panel.querySelector<HTMLElement>('.b-opciones')!;
      const p = menu(opciones, 2, false, donde);
      // Al pasar por una opción se ve su ficha y su modelo
      donde.querySelectorAll('button').forEach((b, i) => b.addEventListener('pointerenter', () => { const n = opciones[i]?.valor; if (n > 0 && n !== foco) { foco = n; verEnVitrina(n); panel.querySelector('.b-ficha')!.innerHTML = fichaHTML(n); } }));
      const original = alTeclear;
      alTeclear = (k) => { original?.(k); const b = donde.querySelector('.foco'); const i = [...donde.querySelectorAll('button')].indexOf(b as HTMLButtonElement); const n = opciones[i]?.valor; if (n > 0 && n !== foco) { foco = n; verEnVitrina(n); panel.querySelector('.b-ficha')!.innerHTML = fichaHTML(n); } };
      const v = await p;
      if (v === -2) break;
      if (v === -1) { await bestiario(foco); continue; }
      if (v !== null && v > 0) { foco = v; if (elegidos.includes(v)) elegidos.splice(elegidos.indexOf(v), 1); else if (elegidos.length < 3) { elegidos.push(v); grito(v); } }
    }
    panel.className = 'b-panel'; abajo.classList.remove('oculto');
    enVitrina?.grupo.removeFromParent(); enVitrina = null;
    return elegidos;
  };

  // ── La torre ──
  let puntos = 0, numCombate = 0, ganados = 0, rendido = false, terminado = false, musica = false;
  const modo = (combatiendo: boolean) => {
    vitrina.visible = !combatiendo; for (const p of plataformas) p.visible = combatiendo;
    for (const caja of cajas) caja.classList.toggle('visible', combatiendo);
  };
  const pelear = async (equipo: number[]) => {
    const rival = RIVALES[numCombate], pool = ELEGIBLES.filter((n) => !equipo.includes(n) || r() < 0.3), suyo: number[] = [];
    while (suyo.length < 3) { const n = pool[Math.floor(r() * pool.length)]; if (!suyo.includes(n)) suyo.push(n); }
    combate = nuevoCombate(`${c.semilla}|torre|${numCombate}`, equipo, suyo);
    eficaces = 0; criticos = 0;
    modo(true);
    for (const caja of cajas) caja.classList.remove('visible');
    e.hud.tiempo(`Rival ${numCombate + 1} / ${COMBATES}`); e.hud.extra(rival.nombre);
    await decir(`¡${rival.nombre} quiere combatir!`);
    vidaMostrada[1] = 1; pintarCaja(1); cajas[1].classList.add('visible');
    await decir(`¡${rival.nombre} envió a ${especie(suyo[0]).nombre}!`, 0.2); await entrar(1, suyo[0]);
    vidaMostrada[0] = 1; pintarCaja(0); cajas[0].classList.add('visible');
    await decir(`¡Adelante, ${especie(equipo[0]).nombre}!`, 0.2); await entrar(0, equipo[0]);
    musica = true;
    while (combate.ganador === null && vivo && !rendido) {
      const mia = await turnoJugador();
      if (rendido) break;
      const suya = elegirAccion(combate, 1, rival.nivel);
      elMenu.innerHTML = '';
      await contarTodo(resolverTurno(combate, [mia, suya]));
      if (combate.ganador !== null) break;
      if (necesitaCambio(combate, 1)) { const evs: Evento[] = []; cambiar(combate, 1, elegirReemplazo(combate, 1), evs); await contarTodo(evs); }
      if (necesitaCambio(combate, 0)) { await decir('¡Elige a tu siguiente criatura!', 0); const a = piloto ? elegirReemplazo(combate, 0) : await menuEquipo(true); const evs: Evento[] = []; cambiar(combate, 0, a ?? elegirReemplazo(combate, 0), evs); await contarTodo(evs); }
    }
    musica = false;
    const gane = combate.ganador === 0 && !rendido;
    if (gane) {
      const L = combate.lados[0], vivas = L.equipo.filter((l) => l.ps > 0), vida = vivas.reduce((s, l) => s + l.ps / l.max, 0) / 3;
      const premio = 1000 + vivas.length * 250 + Math.round(vida * 300) + Math.max(0, 20 - combate.turno) * 15 + eficaces * 20 + criticos * 10;
      puntos += premio; ganados++;
      e.hud.puntos(puntos);
      e.sonido.bien(); [523, 659, 784, 1046].forEach((f, i) => e.sonido.tono(f, 0.2, { tipo: 'square', vol: 0.06, cuando: (e.sonido.ctx?.currentTime ?? 0) + i * 0.12 }));
      e.flotante(`+${premio}`, 0, 2.2, 0, 'oro');
      await decir(`¡Derrotaste a ${rival.nombre}! Ganas ${premio} puntos.`, 1.2);
    } else if (!rendido) await decir('¡Ya no te quedan criaturas! Fin de la torre.', 1.2);
    for (const lado of [0, 1]) { modelos[lado]?.grupo.removeFromParent(); modelos[lado] = null; }
    return gane;
  };
  const terminar = () => {
    if (terminado) return;
    terminado = true;
    e.detener();
    c.alTerminar({ puntaje: puntos, lineas: [['Rivales vencidos', `${ganados} / ${COMBATES}`], ['Resultado', ganados === COMBATES ? '¡Torre superada!' : rendido ? 'Te rendiste' : 'Te derrotaron']], detalle: { ganados } });
  };
  const jugar = async () => {
    modo(false);
    const equipo = await elegirEquipo();
    for (numCombate = 0; numCombate < COMBATES && vivo && !rendido; numCombate++) {
      if (numCombate > 0) await decir('Tu equipo descansó y está como nuevo. ¡Siguiente rival!', 0.8);
      if (!(await pelear(equipo))) break;
    }
    if (ganados === COMBATES) { puntos += 1500; e.hud.puntos(puntos); await decir('¡Superaste la torre completa! +1500 puntos.', 1.5); }
    terminar();
  };

  // ── Cada cuadro ──
  let paso = -1;
  const BAJO = [131, 131, 156, 175, 131, 131, 196, 175], ARPEGIO = [523, 659, 784, 659];
  e.alCuadro((t, dt) => {
    leerControl();
    const k = Math.min(dt, 0.1) * velocidad * (apurar ? 2 : 1) * (piloto ? 3 : 1);
    for (let i = tareas.length - 1; i >= 0; i--) {
      const x = tareas[i];
      x.t += k;
      x.f(Math.min(1, x.t / x.dur));
      if (x.t >= x.dur) { tareas.splice(i, 1); x.listo(); }
    }
    for (const [i, m] of modelos.entries()) if (m) animarBestia(m, t, i * 1.3);
    if (enVitrina) { animarBestia(enVitrina, t); enVitrina.grupo.rotation.y = Math.sin(t * 0.6) * 0.6; }
    for (const [i, n] of nubes.entries()) n.position.x = ((n.position.x + dt * (0.3 + i * 0.05) + 20) % 40) - 20;
    // Música de batalla: bajo y arpegio en ocho pasos
    if (musica && e.sonido.ctx) {
      const s = Math.floor(t / 0.16);
      if (s !== paso) { paso = s; const f = BAJO[Math.floor(s / 4) % 8]; if (s % 2 === 0) e.sonido.tono(f, 0.14, { tipo: 'triangle', vol: 0.06 }); e.sonido.tono(ARPEGIO[s % 4] * (Math.floor(s / 32) % 2 ? 1.122 : 1), 0.08, { tipo: 'square', vol: 0.016 }); }
    }
  });

  // Para revisar las 30 criaturas juntas (solo en desarrollo): "?galeria=1"
  if (import.meta.env.DEV && parametros.has('galeria')) {
    for (const p of [...plataformas, vitrina]) p.visible = false;
    abajo.classList.add('oculto');
    const pagina = Math.max(1, Number(parametros.get('galeria')) || 1) - 1, etiquetas: [HTMLElement, THREE.Vector3][] = [];
    ESPECIES.slice(pagina * 6, pagina * 6 + 6).forEach((sp, i) => {
      const b = crearBestia(sp.n), p = new THREE.Vector3(((i % 3) - 1) * 3.1, 0, i < 3 ? -1.6 : 1.5);
      b.grupo.position.copy(p); b.grupo.rotation.y = 0.45; b.grupo.scale.setScalar(Math.min(1.15, 1.45 / b.alto)); e.escena.add(b.grupo); e.alCuadro((t) => animarBestia(b, t, i));
      const el = document.createElement('div'); el.className = 'b-tipo'; el.style.cssText = `position:absolute;transform:translate(-50%,0);background:${TIPOS[sp.tipos[0]].color};font-size:.9rem`; el.textContent = `${sp.n}. ${sp.nombre}`; raiz.appendChild(el); etiquetas.push([el, p]);
    });
    const v = new THREE.Vector3();
    e.alCuadro(() => { e.camara.position.set(0, 2.7, 8.2); e.camara.lookAt(0, 0.75, 0); for (const [el, p] of etiquetas) { v.copy(p).project(e.camara); el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; el.style.top = `${(-v.y * 0.5 + 0.5) * 100 + 1}%`; } });
  }
  // Retrato de una sola criatura en primer plano (solo en desarrollo): "?retrato=1" y window.__retrato(n)
  if (import.meta.env.DEV && parametros.has('retrato')) {
    for (const p of [...plataformas, vitrina]) p.visible = false;
    abajo.classList.add('oculto');
    let actual: Bestia | null = null, giro = 0.5;
    const etiqueta = document.createElement('div'); etiqueta.className = 'b-tipo'; etiqueta.style.cssText = 'position:absolute;left:12px;top:70px;font-size:1.1rem;padding:4px 12px'; raiz.appendChild(etiqueta);
    const mostrar = (n: number, angulo = 0.5) => {
      actual?.grupo.removeFromParent();
      actual = crearBestia(n); giro = angulo; actual.grupo.rotation.y = giro; e.escena.add(actual.grupo);
      const sp = especie(n); etiqueta.textContent = `${n}. ${sp.nombre}`; etiqueta.style.background = TIPOS[sp.tipos[0]].color;
    };
    mostrar(Number(parametros.get('retrato')) || 1);
    (window as unknown as Record<string, unknown>).__retrato = mostrar;
    e.alCuadro((t) => { if (!actual) return; animarBestia(actual, t); const a = actual.alto; e.camara.position.set(0, a * 0.75 + 0.15, a * 2.3 + 0.6); e.camara.lookAt(0, a * 0.5, 0); });
  }
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__bestias = () => ({ puntos, numCombate, ganados, terminado, combate: combate ? { turno: combate.turno, ganador: combate.ganador, yo: activo(combate, 0).n, el: activo(combate, 1).n } : null, texto: elTexto.textContent, ver: verEnVitrina });

  return {
    empezar() { e.empezar(); if (!parametros.has('galeria') && !parametros.has('retrato')) jugar(); },
    destruir() { vivo = false; e.destruir(); },
  };
}
