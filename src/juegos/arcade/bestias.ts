import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import { supabase } from '../../nucleo/supabase';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { crearEscenario, sombra } from '../reflejos/motor';
import { ATAQUES, ELEGIBLES, ESPECIES, INICIALES, TIPOS, eficacia, especie, formaANivel, nivelEvolucion, type EstadoAlterado, type Stat, type Tipo } from './bestiasDatos';
import { elegirAccion, elegirReemplazo, type Nivel } from './bestiasIA';
import { crearEfectos } from './bestiasEfectos';
import { animarBestia, crearBestia, sacudir, type Bestia } from './bestiasModelo';
import { acciones, activo, ataqueDe, cambiar, necesitaCambio, nuevoCombate, resolverTurno, tipos, type Accion, type Combate, type Evento, type Miembro, type Texto } from './bestiasNucleo';

// Bestiario: batallas de criaturas al estilo clásico, de frente. Eliges 3 criaturas de 6 sorteadas y subes una torre de
// rivales cada vez más listos. Tu criatura de espaldas abajo a la izquierda y la rival de frente arriba a la derecha,
// sus cuadros de vida, el cuadro de texto y el menú Luchar / Equipo / Objetos.

const COMBATES = 5, NIVEL_INICIAL = 18, SUBE = 8, TUTORIAL = 'susto.bestias.tutorial';
/** Cuántos niveles menos que tu equipo traen los rivales (como en los juegos clásicos, la torre se puede ganar). */
const DESVENTAJA = [4, 4, 3, 2, 1];
const RIVALES: { nombre: string; nivel: Nivel; jefe?: boolean }[] = [
  { nombre: 'Excursionista Toño', nivel: 'facil' }, { nombre: 'Pescadora Ema', nivel: 'facil' }, { nombre: 'Domador Bruno', nivel: 'normal' },
  { nombre: 'Científica Lía', nivel: 'dificil' }, { nombre: 'Guardiana del Cielo', nivel: 'dificil', jefe: true },
];
const STAT: Record<Stat, string> = { at: 'El Ataque', def: 'La Defensa', ate: 'El Ataque Esp.', dfe: 'La Defensa Esp.', vel: 'La Velocidad' };
const SIGLA: Record<EstadoAlterado, [string, string]> = { quemado: ['QUE', '#ee8130'], paralizado: ['PAR', '#d8b020'], dormido: ['DOR', '#8a8a9a'], envenenado: ['ENV', '#a33ea1'], toxico: ['TOX', '#7a1a8a'], congelado: ['CON', '#5ab8d8'] };
const ICONO: Record<Tipo, string> = { normal: '●', fuego: '🔥', agua: '💧', planta: '🌿', electrico: '⚡', hielo: '❄️', lucha: '👊', veneno: '☠️', tierra: '⛰️', volador: '🪶', psiquico: '🔮', bicho: '🐛', roca: '🪨', fantasma: '👻', dragon: '🐉' };
const chip = (t: Tipo) => `<span class="b-tipo" style="background:${TIPOS[t].color}">${ICONO[t]} ${TIPOS[t].nombre}</span>`;
const P_JUGADOR = new THREE.Vector3(-1.95, 0, 1.25), P_RIVAL = new THREE.Vector3(1.95, 0, -1.6), P_VITRINA = new THREE.Vector3(0.25, 0, 0.6);

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 8.6, alto: 4.9, centro: [0, 0.95, 0], inclinacion: 0.2, sinPlaya: true });
  const parametros = new URLSearchParams(location.search), piloto = import.meta.env.DEV && parametros.has('piloto');
  const aceleracion = import.meta.env.DEV ? Math.max(1, Number(parametros.get('rapido')) || 1) : 1;
  const r = generador(`${c.semilla}|bestias`);

  // ── Las dos plataformas y la vitrina (el escenario de fondo lo arma bestiasEfectos) ──
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
    <div class="b-caja b-rival"><div class="b-nombre"></div><div class="b-tipos"></div><div class="b-vida"><span>PS</span><i><u></u><b></b></i></div><div class="b-equipo"></div></div>
    <div class="b-caja b-mia"><div class="b-nombre"></div><div class="b-tipos"></div><div class="b-vida"><span>PS</span><i><u></u><b></b></i></div><div class="b-numeros"></div><div class="b-equipo"></div></div>
    <div class="b-abajo"><div class="b-texto"></div><div class="b-menu"></div></div>
    <div class="b-panel"></div>
    <div class="b-herramientas"><button data-h="vel" title="Velocidad de los textos y animaciones">x1</button><button data-h="tipos">Tabla de tipos</button><button data-h="log">Historial</button></div>
    <div class="b-hoja"></div>`;
  const $ = (s: string) => raiz.querySelector<HTMLElement>(s)!;
  const cajas = [$('.b-mia'), $('.b-rival')], elTexto = $('.b-texto'), elMenu = $('.b-menu'), panel = $('.b-panel'), abajo = $('.b-abajo');

  // ── Animaciones con promesas: `await animar(seg, k => ...)` ──
  let velocidad = aceleracion;
  try { if (localStorage.getItem('susto.bestias.vel') === '2') velocidad = aceleracion * 2; } catch { /* sin almacenamiento */ }
  let vivo = true;
  const tareas: { t: number; dur: number; f: (k: number) => void; listo: () => void }[] = [];
  const animar = (dur: number, f: (k: number) => void = () => {}) => new Promise<void>((listo) => tareas.push({ t: 0, dur, f, listo }));
  const esperar = (seg: number) => animar(seg);
  let escalaTiempo = 1;
  const fx = crearEfectos(e, animar);
  fx.escenario(0);
  // Resplandor para el fuego, los rayos y los orbes (en equipos lentos se dibuja directo)
  let composer: EffectComposer | null = null;
  if (!e.liviano && !(import.meta.env.DEV && parametros.has('sinbrillo'))) {
    composer = new EffectComposer(e.render, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
    composer.addPass(new RenderPass(e.escena, e.camara));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.45, 0.88);
    composer.addPass(bloom); composer.addPass(new OutputPass());
    e.usarDibujo(() => composer!.render(), (w, h) => { composer!.setPixelRatio(e.render.getPixelRatio()); composer!.setSize(w, h); });
  }
  // Calidad automática: si en los primeros segundos el juego va lento, se apaga el resplandor y se dibuja directo
  let medidos = 0, tiempoMedido = 0;
  const revisarRendimiento = (dt: number) => {
    if (!composer || medidos > 150 || (import.meta.env.DEV && parametros.has('brillo'))) return;
    if (dt > 0 && dt < 0.5) { medidos++; tiempoMedido += dt; }
    if (medidos === 150 && tiempoMedido / medidos > 1 / 40) { composer.dispose(); composer = null; e.usarDibujo(() => e.render.render(e.escena, e.camara), () => {}); }
  };
  // La cámara se mueve suave hacia donde pasa la acción
  const foco = { x: 0, y: 0.95, z: 0, a: 1 }, camaraYa = { ...foco };
  const enfocar = (x = 0, y = 0.95, z = 0, a = 1) => Object.assign(foco, { x, y, z, a });
  const sombras = [sombra(0.55), sombra(0.55)];
  for (const sm of sombras) { (sm.material as THREE.MeshBasicMaterial).color.set('#1a1a10'); e.escena.add(sm); }
  const vidaFantasma = [1, 1];

  // ── Herramientas: velocidad x2, tabla de tipos e historial del combate ──
  const hoja = $('.b-hoja'), historial: string[] = [];
  const botonVel = raiz.querySelector<HTMLButtonElement>('[data-h="vel"]')!;
  const pintarVel = () => { botonVel.textContent = velocidad > aceleracion ? '⏩ x2' : '▶ x1'; };
  pintarVel();
  const TODOS = Object.keys(TIPOS) as Tipo[];
  const abrirHoja = (que: 'tipos' | 'log') => {
    hoja.innerHTML = que === 'tipos'
      ? `<h3>Tabla de tipos <small>ataque ↓ contra defensa →</small></h3><div class="b-tabla" style="--n:${TODOS.length}"><span></span>${TODOS.map((t) => `<span class="b-cab" style="background:${TIPOS[t].color}" title="${TIPOS[t].nombre}">${ICONO[t]}</span>`).join('')}${TODOS.map((a) => `<span class="b-cab" style="background:${TIPOS[a].color}">${ICONO[a]} ${TIPOS[a].nombre}</span>${TODOS.map((d) => { const x = eficacia(a, [d]); return `<span class="b-ef${x === 2 ? ' muy' : x === 0 ? ' nulo' : x < 1 ? ' poco' : ''}">${x === 2 ? '2' : x === 0 ? '0' : x < 1 ? '½' : ''}</span>`; }).join('')}`).join('')}</div><p>2 = muy eficaz · ½ = poco eficaz · 0 = no afecta. Los ataques del mismo tipo que la criatura pegan x1,5.</p>`
      : `<h3>Historial del combate</h3><ol>${historial.slice(-40).map((x) => `<li>${x}</li>`).join('') || '<li>Todavía no pasa nada.</li>'}</ol>`;
    hoja.insertAdjacentHTML('beforeend', '<button class="boton">Cerrar</button>');
    hoja.classList.add('visible');
    if (que === 'log') { const ol = hoja.querySelector('ol'); ol?.lastElementChild?.scrollIntoView({ block: 'end' }); }
  };
  const cerrarHoja = () => hoja.classList.remove('visible');
  hoja.addEventListener('click', (ev) => { if ((ev.target as HTMLElement).tagName === 'BUTTON' || ev.target === hoja) cerrarHoja(); });
  raiz.querySelector('.b-herramientas')!.addEventListener('click', (ev) => {
    const h = (ev.target as HTMLElement).closest('button')?.dataset.h;
    if (h === 'vel') { velocidad = velocidad > aceleracion ? aceleracion : aceleracion * 2; try { localStorage.setItem('susto.bestias.vel', velocidad > aceleracion ? '2' : '1'); } catch { /* sin almacenamiento */ } pintarVel(); }
    else if (h === 'tipos' || h === 'log') abrirHoja(h);
  });

  // ── Entrada: teclado, toque y control; los menús escuchan aquí ──
  let escenaActual = 0;
  let alTeclear: ((k: string) => void) | null = null, apurar = false, agotado = false, cerrarMenu: (() => void) | null = null;
  e.escuchar(window, 'keydown', (ev) => {
    const k = ev.key === ' ' ? 'Enter' : ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'w', 'a', 's', 'd', 'Backspace'].includes(k)) ev.preventDefault();
    if (hoja.classList.contains('visible')) { if (k === 'Escape' || k === 'Enter') cerrarHoja(); return; }
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
  const menu = <T,>(opciones: { html: string; valor: T; no?: boolean; clase?: string; info?: string }[], columnas: number, volver: boolean, donde: HTMLElement = elMenu): Promise<T | null> => new Promise((listo) => {
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
    const marcar = () => { botones.forEach((b, i) => b.classList.toggle('foco', i === foco)); const inf = opciones[foco]?.info; if (inf) elTexto.textContent = inf; };
    const fin = (v: T | null) => { alTeclear = null; cerrarMenu = null; donde.innerHTML = ''; listo(v); };
    cerrarMenu = () => fin(null);
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
    if (pausa > 0 || !historial.length || historial[historial.length - 1] !== texto) historial.push(texto);
    if (historial.length > 120) historial.shift();
    elTexto.textContent = '';
    let mostrado = 0;
    await new Promise<void>((listo) => {
      tareas.push({ t: 0, dur: 99, f: () => {}, listo: () => {} });
      const tarea = tareas[tareas.length - 1];
      tarea.f = () => {
        const cps = 55 * (apurar ? 4 : 1);
        const meta = Math.min(texto.length, Math.floor(tarea.t * cps));
        if (meta !== mostrado) { if (!apurar && Math.floor(meta / 3) !== Math.floor(mostrado / 3) && /\w/.test(texto[meta - 1] ?? '')) e.sonido.tono(1300 + (meta % 5) * 40, 0.012, { tipo: 'square', vol: 0.012 }); mostrado = meta; elTexto.textContent = texto.slice(0, meta); }
        if (meta >= texto.length && tarea.t * cps >= texto.length + pausa * cps / (apurar ? 3 : 1)) { tarea.dur = 0; listo(); }
      };
    });
    elTexto.textContent = texto;
  };

  // ── Las criaturas en escena ──
  /** Mi lado en el motor (0, salvo el jugador B en vivo) y su lugar en pantalla: 0 abajo a la izquierda, 1 arriba a la derecha. */
  let YO = 0, duenos: [string, string] | null = null;
  const S = (lado: number) => (lado === YO ? 0 : 1);
  const modelos: (Bestia | null)[] = [null, null], enEscena = [0, 0];
  let enVitrina: Bestia | null = null;
  const poner = (ladoMotor: number, n: number) => {
    const lado = S(ladoMotor);
    modelos[lado]?.grupo.removeFromParent();
    const b = crearBestia(n), p = lado === 0 ? P_JUGADOR : P_RIVAL;
    b.grupo.position.copy(p);
    // Tu criatura mira hacia la rival (se ve de espaldas); la rival te mira a ti
    const hacia = lado === 0 ? P_RIVAL : P_JUGADOR;
    b.grupo.rotation.y = lado === 0 ? Math.atan2(hacia.x - p.x, hacia.z - p.z) + 0.3 : -0.45;
    if (lado === 0) b.grupo.scale.setScalar(c.caja.clientWidth / Math.max(1, c.caja.clientHeight) < 1.6 ? 0.92 : 1.15);
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

  /** Aparece en un destello, cae desde arriba y aterriza aplastándose un poco. */
  const entrar = async (lado: number, n: number) => {
    const b = poner(lado, n), s = b.grupo.scale.x, y0 = b.grupo.position.y;
    e.chispas(b.grupo.position.x, 0.6, b.grupo.position.z, ['#ffffff', '#ffe36b', TIPOS[especie(n).tipos[0]].color], 22, 3.5);
    grito(n);
    await animar(0.5, (k) => { b.grupo.scale.setScalar(s * Math.min(1, 0.3 + k * 1.4)); b.grupo.position.y = y0 + (1 - k * k) * 0.9; });
    b.grupo.position.y = y0; b.pose.estira = -0.22; sacudir(b, 1);
    fx.onda(new THREE.Vector3(b.grupo.position.x, 0.08, b.grupo.position.z), '#ffffff', 1.4, 0.4);
    await esperar(0.12); b.pose.estira = 0;
  };
  const salir = async (ladoMotor: number) => {
    const lado = S(ladoMotor), b = modelos[lado];
    if (!b) return;
    const s = b.grupo.scale.x;
    await animar(0.3, (k) => b.grupo.scale.setScalar(s * (1 - k)));
    b.grupo.removeFromParent(); modelos[lado] = null;
  };

  // ── Cuadros de vida ──
  let combate: Combate | null = null;
  const vidaMostrada = [1, 1];
  const nombre = (lado: number, n?: number) => `${especie(n ?? activo(combate!, lado).n).nombre}${duenos ? ` de ${duenos[lado]}` : S(lado) === 1 ? ' rival' : ''}`;
  const quienManda = (lado: number) => (duenos ? duenos[lado] : RIVALES[numCombate].nombre);
  const pintarCaja = (lado: number) => {
    if (!combate) return;
    const yo = activo(combate, lado), sp = especie(yo.n), caja = cajas[S(lado)];
    caja.querySelector('.b-nombre')!.innerHTML = `${sp.nombre} <small>Nv.${yo.nivel}</small>${yo.estado ? ` <em style="background:${SIGLA[yo.estado][1]}">${SIGLA[yo.estado][0]}</em>` : ''}`;
    caja.querySelector('.b-tipos')!.innerHTML = sp.tipos.map(chip).join('');
    caja.querySelector('.b-equipo')!.innerHTML = combate.lados[lado].equipo.map((l) => `<i class="${l.ps > 0 ? (l.estado ? 'mal' : 'bien') : 'fuera'}"></i>`).join('');
    pintarVida(lado);
  };
  const pintarVida = (lado: number) => {
    if (!combate) return;
    const yo = activo(combate, lado), k = vidaMostrada[S(lado)], barra = cajas[S(lado)].querySelector<HTMLElement>('.b-vida b')!;
    barra.style.width = `${Math.max(0, k) * 100}%`;
    barra.style.background = k > 0.5 ? '#3fd06a' : k > 0.2 ? '#f2c22c' : '#e8423a';
    if (S(lado) === 0) cajas[0].querySelector('.b-numeros')!.textContent = `${Math.round(k * yo.max)} / ${yo.max}`;
  };
  const vidaHacia = async (lado: number) => {
    if (!combate) return;
    const yo = activo(combate, lado), desde = vidaMostrada[S(lado)], hasta = yo.ps / yo.max;
    await animar(Math.min(0.9, 0.25 + Math.abs(hasta - desde) * 1.2), (k) => { vidaMostrada[S(lado)] = desde + (hasta - desde) * k; pintarVida(lado); });
  };

  // ── Ataques: los especiales con su efecto por tipo; los físicos toman impulso, corren e impactan ──
  const centroDe = (lugar: number) => { const m = modelos[lugar], base = lugar === 0 ? P_JUGADOR : P_RIVAL; return base.clone().setY(m ? m.alto * m.grupo.scale.y * 0.55 : 0.7); };
  const especial = async (lado: number, tipo: Tipo, falla: boolean) => {
    const m = modelos[S(lado)], a = centroDe(S(lado)), b = centroDe(1 - S(lado));
    if (falla) b.add(new THREE.Vector3(1.2, 0.4, 0.6));
    if (m) { m.pose.estira = 0.15; m.pose.inclina = -0.12; }
    e.sonido.tono(700, 0.3, { tipo: 'sawtooth', vol: 0.05, hasta: 300 });
    await fx.especial(tipo, a, b);
    if (m) { m.pose.estira = 0; m.pose.inclina = 0; }
  };
  const embestida = async (lado: number, tipo: Tipo, falla: boolean) => {
    const m = modelos[S(lado)];
    if (!m) return;
    const p0 = m.grupo.position.clone(), objetivo = S(lado) === 0 ? P_RIVAL : P_JUGADOR, destino = objetivo.clone().lerp(p0, falla ? 0.4 : 0.55);
    m.pose.estira = -0.2; m.pose.inclina = 0.15; await esperar(0.14);
    m.pose.estira = 0.18; m.pose.inclina = 0.3;
    await animar(0.18, (k) => m.grupo.position.lerpVectors(p0, destino, k * k));
    if (!falla) fx.impacto(tipo, centroDe(1 - S(lado)), tipo === 'lucha');
    await animar(0.22, (k) => m.grupo.position.lerpVectors(destino, p0, k));
    m.grupo.position.copy(p0); m.pose.estira = 0; m.pose.inclina = 0;
  };
  const recibir = async (lado: number, fuerte: boolean) => {
    const m = modelos[S(lado)];
    if (!m) return;
    if (fuerte) e.temblar(0.35);
    e.sonido.ruido(0.14, fuerte ? 0.2 : 0.12); e.sonido.tono(fuerte ? 160 : 120, 0.12, { tipo: 'square', vol: 0.08, hasta: 60 });
    const p0 = m.grupo.position.clone(), atras = p0.clone().sub(S(lado) === 0 ? P_RIVAL : P_JUGADOR).setY(0).normalize().multiplyScalar(fuerte ? 0.35 : 0.2);
    sacudir(m, fuerte ? 1.6 : 1); m.pose.estira = -0.15;
    await animar(0.5, (k) => { m.grupo.visible = k > 0.75 || Math.floor(k * 8) % 2 === 0; m.grupo.position.copy(p0).addScaledVector(atras, Math.sin(Math.min(1, k * 1.5) * Math.PI)); });
    m.grupo.visible = true; m.grupo.position.copy(p0); m.pose.estira = 0;
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
  const FALLA = new Set(['falla', 'noAfecta', 'seProtegio']);
  const contar = async (ev: Evento, sig?: Evento) => {
    switch (ev.t) {
      case 'ataque': {
        const at = ev.ataque === 'forcejeo' ? null : ATAQUES[ev.ataque], tipo = at?.tipo ?? 'normal';
        await decir(`¡${nombre(ev.lado)} usó ${at?.nombre ?? 'Forcejeo'}!`, 0.25);
        const falla = sig?.t === 'texto' && FALLA.has(sig.clave);
        // La cámara se acerca un poco a la acción
        const pa = S(ev.lado) === 0 ? P_JUGADOR : P_RIVAL; enfocar(pa.x * 0.18, 0.95, pa.z * 0.18, 0.94);
        if (at?.cat === 'estado') { const m = modelos[S(ev.lado)]; if (m) { m.pose.estira = 0.12; fx.estallido(centroDe(S(ev.lado)), [TIPOS[tipo].color, '#ffffff'], 18, 2.2, 0.22); e.sonido.tono(520, 0.2, { tipo: 'triangle', vol: 0.08, hasta: 900 }); } await esperar(0.35); if (m) m.pose.estira = 0; }
        else if (at?.cat === 'especial') await especial(ev.lado, tipo, falla);
        else await embestida(ev.lado, tipo, falla);
        enfocar();
        break;
      }
      case 'daño': {
        if (ev.propio === 'estado') await decir(`¡${nombre(ev.lado)} sufre por ${activo(combate!, ev.lado).estado === 'quemado' ? 'la quemadura' : 'el veneno'}!`, 0.2);
        const blanco = modelos[S(ev.lado)], cb = centroDe(S(ev.lado));
        if (ev.critico) { escalaTiempo = 0.35; enfocar(cb.x * 0.5, 0.85, cb.z * 0.5, 0.8); fx.destello('#ffffff', 0.45); }
        if (blanco && ev.ps > 0) e.flotante(`-${ev.ps}`, cb.x, cb.y + 0.6, cb.z, ev.critico || ev.efic > 1 ? 'mal' : '');
        await Promise.all([recibir(ev.lado, ev.efic > 1 || ev.critico), vidaHacia(ev.lado)]);
        if (ev.critico) { escalaTiempo = 1; enfocar(); }
        if (ev.propio === 'rebote') await decir(`¡${nombre(ev.lado)} también se hizo daño!`);
        if (ev.critico) { await decir('¡Un golpe crítico!'); if (S(ev.lado) === 1) criticos++; }
        if (!ev.propio && ev.efic > 1) { await decir('¡Es muy eficaz!'); if (S(ev.lado) === 1) eficaces++; }
        if (!ev.propio && ev.efic < 1) await decir('No es muy eficaz…');
        break;
      }
      case 'cura': { const m = modelos[S(ev.lado)]; if (m) e.chispas(m.grupo.position.x, 0.6, m.grupo.position.z, ['#8affb0', '#ffffff'], 16, 2); e.sonido.tono(660, 0.3, { tipo: 'triangle', vol: 0.08, hasta: 1320 }); await vidaHacia(ev.lado); await decir(`${nombre(ev.lado)} recuperó PS.`); break; }
      case 'estado': pintarCaja(ev.lado); e.sonido.tono(300, 0.25, { tipo: 'square', vol: 0.06, hasta: 200 }); await decir(`¡${nombre(ev.lado)} ${ESTADO_TEXTO[ev.estado]}!`); break;
      case 'confusion': await decir(`¡${nombre(ev.lado)} se confundió!`); break;
      case 'stat': {
        const m = modelos[S(ev.lado)];
        if (m && !ev.tope) { fx.aura(m.grupo.position, ev.cambio > 0); e.sonido.tono(ev.cambio > 0 ? 400 : 700, 0.25, { tipo: 'triangle', vol: 0.07, hasta: ev.cambio > 0 ? 800 : 350 }); }
        await decir(ev.tope ? `¡${STAT[ev.stat]} de ${nombre(ev.lado)} no puede ${ev.cambio > 0 ? 'subir' : 'bajar'} más!` : `¡${STAT[ev.stat]} de ${nombre(ev.lado)} ${ev.cambio > 0 ? 'subió' : 'bajó'}${Math.abs(ev.cambio) >= 2 ? ' mucho' : ''}!`);
        break;
      }
      case 'cambio': {
        const L = combate!.lados[ev.lado], n = L.equipo[ev.a].n;
        if (modelos[S(ev.lado)]) { if (S(ev.lado) === 0 && !duenos) await decir(`¡Vuelve, ${especie(enEscena[S(ev.lado)]).nombre}!`, 0.2); await salir(ev.lado); }
        await decir(S(ev.lado) === 0 && !duenos ? `¡Adelante, ${especie(n).nombre}!` : `¡${quienManda(ev.lado)} envió a ${especie(n).nombre}!`, 0.2);
        vidaMostrada[S(ev.lado)] = L.equipo[ev.a].ps / L.equipo[ev.a].max; pintarCaja(ev.lado);
        await entrar(ev.lado, n);
        marcarVista(n);
        break;
      }
      case 'debilitado': {
        const m = modelos[S(ev.lado)];
        if (m) { grito(activo(combate!, ev.lado).n, 0.6); sacudir(m, 1.5); const y0 = m.grupo.position.y, lado2 = S(ev.lado) === 0 ? -1 : 1; await animar(0.8, (k) => { m.grupo.rotation.z = lado2 * Math.min(1, k * 1.6) * 1.35; m.grupo.position.y = y0 - Math.max(0, k - 0.55) * 2.2; }); fx.estallido(new THREE.Vector3(m.grupo.position.x, 0.2, m.grupo.position.z), ['#d8cdb2', '#ffffff'], 12, 1.2, 0.3); m.grupo.removeFromParent(); modelos[S(ev.lado)] = null; }
        pintarCaja(ev.lado);
        await decir(`¡${nombre(ev.lado)} se debilitó!`);
        break;
      }
      case 'texto': await decir(TEXTOS[ev.clave](nombre(ev.lado))); break;
      case 'fin': break;
    }
  };
  const contarTodo = async (evs: Evento[]) => { for (const [i, ev] of evs.entries()) { if (!vivo) return; await contar(ev, evs[i + 1]); } };

  // ── Menús del turno ──
  const menuAtaques = async (): Promise<Accion | null> => {
    const yo = activo(combate!, YO), el = activo(combate!, 1 - YO);
    if (yo.pp.every((p) => p <= 0)) return { tipo: 'atacar', i: -1 };
    return menu(especie(yo.n).ataques.map((id, i) => {
      const at = ataqueDe(yo, i), ef = at.cat === 'estado' ? -1 : eficacia(at.tipo, tipos(el));
      const pista = ef < 0 ? '' : ef === 0 ? '<u class="nulo">No afecta</u>' : ef > 1 ? '<u class="muy">Muy eficaz</u>' : ef < 1 ? '<u class="poco">Poco eficaz</u>' : '';
      const info = `${at.nombre}: ${at.cat === 'estado' ? 'de estado' : `${at.cat === 'fisico' ? 'físico' : 'especial'}, poder ${at.poder}`}${at.precision ? `, precisión ${at.precision} %` : ', nunca falla'}${at.prioridad ? ', golpea primero' : ''}. ${at.texto}`;
      return { html: `<strong>${at.nombre}</strong><span style="background:${TIPOS[at.tipo].color}">${ICONO[at.tipo]} ${TIPOS[at.tipo].nombre}</span><small>PP ${yo.pp[i]}/${at.pp}</small>${pista}`, valor: { tipo: 'atacar', i } as Accion, no: yo.pp[i] <= 0, clase: 'b-ataque', info };
    }), 2, true);
  };
  const menuEquipo = async (forzado: boolean): Promise<number | null> => {
    const L = combate!.lados[YO];
    if (!forzado) await decir('¿A quién quieres mandar?', 0);
    return menu(L.equipo.map((l, a) => ({ html: `<strong>${especie(l.n).nombre}</strong>${especie(l.n).tipos.map(chip).join('')}<small>PS ${l.ps}/${l.max}${l.estado ? ` · ${SIGLA[l.estado][0]}` : ''}${a === L.activo ? ' · en combate' : ''}</small>`, valor: a, no: l.ps <= 0 || a === L.activo, clase: 'b-miembro' })), 1, !forzado);
  };
  const turnoJugador = async (): Promise<Accion> => {
    if (piloto) return elegirAccion(combate!, YO, c.vivo ? 'normal' : 'dificil');
    for (;;) {
      // En vivo, si se acabó el tiempo del turno, juega la máquina por ti
      if (agotado) return elegirAccion(combate!, YO, 'normal');
      const L = combate!.lados[YO];
      await decir(`¿Qué hará ${especie(activo(combate!, YO).n).nombre}?`, 0);
      const quiere = await menu([{ html: 'Luchar', valor: 'luchar' }, { html: 'Equipo', valor: 'equipo' }, { html: `Objetos <small>${L.pociones + L.curas}</small>`, valor: 'objetos' }, ...(c.vivo ? [] : [{ html: 'Rendirse', valor: 'rendirse' }])], 2, false);
      if (quiere === 'luchar') { const a = await menuAtaques(); if (a) return a; }
      if (quiere === 'equipo') { const a = await menuEquipo(false); if (a !== null) return { tipo: 'cambiar', a }; }
      if (quiere === 'objetos') {
        const posibles = acciones(combate!, YO);
        const o = await menu([
          { html: `<strong>Poción</strong><small>Cura la mitad de los PS · quedan ${L.pociones}</small>`, valor: 'pocion' as const, no: !posibles.some((x) => x.tipo === 'objeto' && x.cual === 'pocion') },
          { html: `<strong>Cura Total</strong><small>Quita estados y confusión · quedan ${L.curas}</small>`, valor: 'cura' as const, no: !posibles.some((x) => x.tipo === 'objeto' && x.cual === 'cura') },
        ], 1, true);
        if (o) return { tipo: 'objeto', cual: o };
      }
      if (quiere === 'rendirse') { await decir('¿Seguro que quieres rendirte? Se termina la torre.', 0); if (await menu([{ html: 'No, sigo', valor: false }, { html: 'Sí, me rindo', valor: true }], 2, false)) { rendido = true; return { tipo: 'atacar', i: 0 }; } }
    }
  };

  // ── Criaturas vistas (se guardan en este navegador): las que no has visto salen en el Bestiario como silueta ──
  const VISTAS = 'susto.bestias.vistas';
  const vistas = new Set<number>((() => { try { return JSON.parse(localStorage.getItem(VISTAS) ?? '[]') as number[]; } catch { return []; } })());
  let cuenta: string | null = null, guardarCuenta = 0;
  const subirVistas = () => { if (cuenta) supabase.from('bestiario_vistas').upsert({ perfil_id: cuenta, vistas: [...vistas].sort((a, b) => a - b), actualizado: new Date().toISOString() }).then(() => {}, () => {}); };
  const marcarVista = (n: number) => { if (vistas.has(n)) return; vistas.add(n); try { localStorage.setItem(VISTAS, JSON.stringify([...vistas])); } catch { /* sin almacenamiento */ } clearTimeout(guardarCuenta); guardarCuenta = window.setTimeout(subirVistas, 1500); };
  // Al abrir: se juntan las vistas de la cuenta con las de este navegador (si la tabla no existe todavía, queda solo local)
  supabase.auth.getSession().then(async ({ data }) => {
    cuenta = data.session?.user.id ?? null;
    if (!cuenta) return;
    const { data: fila, error } = await supabase.from('bestiario_vistas').select('vistas').eq('perfil_id', cuenta).maybeSingle();
    if (error) { cuenta = null; return; }
    const antes = vistas.size;
    for (const n of (fila?.vistas as number[] | undefined) ?? []) if (n >= 1 && n <= ESPECIES.length) vistas.add(n);
    try { localStorage.setItem(VISTAS, JSON.stringify([...vistas])); } catch { /* sin almacenamiento */ }
    if (!fila || vistas.size !== antes || (fila.vistas as number[]).length !== vistas.size) subirVistas();
  }, () => {});
  /** Pinta una criatura entera de un color (silueta blanca al evolucionar, negra si no la has visto) o la devuelve a sus colores. */
  const BLANCO = new THREE.MeshBasicMaterial({ color: '#ffffff' }), NEGRO = new THREE.MeshBasicMaterial({ color: '#1a1626' });
  const silueta = (b: Bestia, m: THREE.Material | null) => b.grupo.traverse((o) => {
    const x = o as THREE.Mesh;
    if (!x.isMesh) return;
    if (m) { x.userData.original ??= x.material; x.material = m; } else if (x.userData.original) x.material = x.userData.original;
  });

  // ── Elegir equipo y Bestiario ──
  const fichaHTML = (n: number) => {
    const sp = especie(n), total = Object.values(sp.base).reduce((s, v) => s + v, 0), barras = [['PS', sp.base.ps], ['Ataque', sp.base.at], ['Defensa', sp.base.def], ['At. Esp.', sp.base.ate], ['Def. Esp.', sp.base.dfe], ['Velocidad', sp.base.vel]] as [string, number][];
    const previa = ESPECIES.find((x) => x.evoluciona === n);
    if (!vistas.has(n)) return `<header><b>N.º ${String(n).padStart(3, '0')}</b><h3>???</h3></header><p>Todavía no has visto esta criatura. Sube la torre para descubrirla: aparecen en los equipos rivales y al evolucionar.</p>`;
    return `<header><b>N.º ${String(n).padStart(3, '0')}</b><h3>${sp.nombre}</h3>${sp.tipos.map(chip).join('')}</header>
      <p>${sp.descripcion}</p>
      <p class="b-evo">${sp.legendaria ? 'Criatura legendaria' : !previa && !sp.evoluciona ? 'No evoluciona' : `${previa ? `Evoluciona de ${previa.nombre}` : 'Primera etapa'}${sp.evoluciona ? ` · evoluciona a ${vistas.has(sp.evoluciona) ? especie(sp.evoluciona).nombre : '???'} en el Nv. ${nivelEvolucion(sp)}` : ' · etapa final'}`}</p>
      <div class="b-stats">${barras.map(([k, v]) => `<span>${k}</span><i><b style="width:${Math.min(100, (v / 140) * 100)}%;background:${v >= 100 ? '#3fd06a' : v >= 70 ? '#f2c22c' : '#ee8130'}"></b></i><em>${v}</em>`).join('')}<span>Total</span><i></i><em>${total}</em></div>
      <ul class="b-ataques">${sp.ataques.map((id) => { const at = ATAQUES[id]; return `<li><span style="background:${TIPOS[at.tipo].color}">${TIPOS[at.tipo].nombre}</span><strong>${at.nombre}</strong><small>${at.cat === 'estado' ? 'Estado' : `${at.cat === 'fisico' ? 'Físico' : 'Especial'} · ${at.poder}`}${at.precision ? ` · ${at.precision}%` : ''}</small><p>${at.texto}</p></li>`; }).join('')}</ul>`;
  };
  const bestiario = async (desde: number) => {
    let n = desde, filtro = -1;
    panel.className = 'b-panel visible b-bestiario';
    // Con un filtro, solo se recorren las criaturas vistas de ese tipo
    const pasa = (x: number) => filtro < 0 || (vistas.has(x) && especie(x).tipos.includes(TODOS[filtro]));
    for (;;) {
      verEnVitrina(n);
      if (!vistas.has(n) && enVitrina) silueta(enVitrina, NEGRO);
      panel.innerHTML = `<div class="b-ficha"><p class="b-vistas">Vistas: ${vistas.size} / ${ESPECIES.length}</p>${fichaHTML(n)}</div><div class="b-nav"></div>`;
      const v = await menu([{ html: '◀ Anterior', valor: -1 }, { html: `${n} / ${ESPECIES.length}`, valor: 0 }, { html: 'Siguiente ▶', valor: 1 }, { html: filtro < 0 ? 'Filtro: todos los tipos' : `Filtro: ${ICONO[TODOS[filtro]]} ${TIPOS[TODOS[filtro]].nombre}`, valor: 2, clase: 'b-filtro' }], 3, true, panel.querySelector<HTMLElement>('.b-nav')!);
      if (v === null) return;
      if (v === 2) {
        // Siguiente tipo que tenga alguna criatura vista
        for (let i = 0; i <= TODOS.length; i++) { filtro = filtro + 1 >= TODOS.length ? -1 : filtro + 1; if (filtro < 0 || ESPECIES.some((x) => pasa(x.n))) break; }
        if (!pasa(n)) n = ESPECIES.find((x) => pasa(x.n))?.n ?? n;
        continue;
      }
      for (let i = 0; i < ESPECIES.length; i++) { n = ((n - 1 + v + ESPECIES.length) % ESPECIES.length) + 1; if (v === 0 || pasa(n)) break; }
      if (v !== 0 && vistas.has(n)) grito(n);
    }
  };
  const elegirEquipo = async (): Promise<number[]> => {
    const sorteo = [...INICIALES].sort(() => r() - 0.5).slice(0, 6), elegidos: number[] = [];
    for (const n of sorteo) marcarVista(n);
    if (piloto) return sorteo.slice(0, 3);
    abajo.classList.add('oculto');
    let foco = sorteo[0];
    for (;;) {
      panel.className = 'b-panel visible b-elegir';
      verEnVitrina(foco);
      panel.innerHTML = `<div class="b-lista"><h2>Elige tu equipo <small>${elegidos.length} / 3</small></h2><p>Empiezan en el Nv. ${NIVEL_INICIAL} y suben de nivel con cada victoria: así evolucionan. El primero que elijas sale a combatir. Te esperan ${COMBATES} rivales y, al final, una criatura legendaria.</p><div class="b-opciones"></div></div><div class="b-ficha">${fichaHTML(foco)}</div>`;
      const opciones = [
        ...sorteo.map((n) => ({ html: `<strong>${especie(n).nombre}</strong>${especie(n).tipos.map(chip).join('')}${elegidos.includes(n) ? `<b class="b-marca">${elegidos.indexOf(n) + 1}</b>` : ''}`, valor: n, clase: elegidos.includes(n) ? 'elegido' : '' })),
        { html: `<strong>Ver Bestiario (${vistas.size}/${ESPECIES.length})</strong>`, valor: -1, clase: 'b-especial' },
        { html: elegidos.length === 3 ? '<strong>¡A la torre!</strong>' : '<strong>Elige 3</strong>', valor: -2, no: elegidos.length !== 3, clase: 'b-listo' },
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
  let puntos = 0, numCombate = 0, ganados = 0, evoluciones = 0, rendido = false, terminado = false, musica = false;
  const modo = (combatiendo: boolean) => {
    vitrina.visible = !combatiendo; for (const p of plataformas) p.visible = combatiendo;
    for (const caja of cajas) caja.classList.toggle('visible', combatiendo);
  };
  /** La evolución clásica: la silueta blanca alterna entre la forma vieja y la nueva cada vez más rápido y aparece la nueva. */
  const evolucionar = async (de: number, a: number) => {
    modo(false);
    verEnVitrina(de);
    const viejo = enVitrina!, nuevo = crearBestia(a);
    nuevo.grupo.position.copy(P_VITRINA); nuevo.grupo.scale.setScalar(Math.min(1.4, 1.7 / nuevo.alto)); nuevo.grupo.visible = false; e.escena.add(nuevo.grupo);
    await decir(`¿Eh? ¡${especie(de).nombre} está evolucionando!`, 0.5);
    silueta(viejo, BLANCO); silueta(nuevo, BLANCO);
    let ultimo = -1;
    await animar(3.4, (k) => {
      const cambios = Math.floor(k * k * 26);
      viejo.grupo.visible = cambios % 2 === 0; nuevo.grupo.visible = !viejo.grupo.visible;
      if (cambios !== ultimo) { ultimo = cambios; e.sonido.tono(400 + cambios * 30, 0.08, { tipo: 'triangle', vol: 0.06 }); if (cambios % 3 === 0) e.chispas(P_VITRINA.x, 0.9, P_VITRINA.z, ['#ffffff', '#fff2a0'], 6, 2.5); }
      if (enVitrina) animarBestia(nuevo, k * 3);
    });
    viejo.grupo.removeFromParent(); nuevo.grupo.visible = true; enVitrina = nuevo;
    await animar(0.4, (k) => { if (k > 0.5) silueta(nuevo, null); });
    silueta(nuevo, null);
    e.chispas(P_VITRINA.x, 1, P_VITRINA.z, ['#ffffff', '#ffe36b', TIPOS[especie(a).tipos[0]].color], 40, 4.5); grito(a);
    [523, 659, 784, 1046, 1318].forEach((f, i) => e.sonido.tono(f, 0.22, { tipo: 'square', vol: 0.05, cuando: (e.sonido.ctx?.currentTime ?? 0) + i * 0.11 }));
    marcarVista(a); evoluciones++;
    await decir(`¡Felicidades! Tu ${especie(de).nombre} evolucionó a ${especie(a).nombre}.`, 1);
    await decir(`${especie(a).nombre} aprendió ${especie(a).ataques.filter((id) => !especie(de).ataques.includes(id)).map((id) => ATAQUES[id].nombre).join(', ') || 'nuevos movimientos'}.`, 0.8);
    nuevo.grupo.removeFromParent(); enVitrina = null;
  };
  /** El equipo del rival: tres líneas sorteadas, en la forma que les toca a su nivel (la jefa trae a la legendaria). */
  const equipoRival = (nivel: number, jefe: boolean): Miembro[] => {
    const bases: number[] = [];
    while (bases.length < (jefe ? 2 : 3)) { const n = INICIALES[Math.floor(r() * INICIALES.length)]; if (!bases.includes(n)) bases.push(n); }
    const suyo: Miembro[] = bases.map((n) => ({ n: formaANivel(n, nivel), nivel }));
    if (jefe) suyo.push({ n: ESPECIES.find((x) => x.legendaria)!.n, nivel: nivel + 3 });
    return suyo;
  };
  const pelear = async (equipo: { n: number; nivel: number }[]) => {
    const rival = RIVALES[numCombate], nivel = equipo[0].nivel - DESVENTAJA[numCombate], suyo = equipoRival(nivel, !!rival.jefe), azarIA = generador(`${c.semilla}|ia|${numCombate}`);
    combate = nuevoCombate(`${c.semilla}|torre|${numCombate}`, equipo, suyo);
    // Los rivales traen menos objetos: ninguno al principio y una Poción los dos últimos
    combate.lados[1].pociones = numCombate >= 3 ? 1 : 0; combate.lados[1].curas = 0;
    eficaces = 0; criticos = 0;
    modo(true);
    escenaActual = numCombate; fx.escenario(escenaActual);
    for (const caja of cajas) caja.classList.remove('visible');
    e.hud.tiempo(`Rival ${numCombate + 1} / ${COMBATES}`); e.hud.extra(rival.nombre);
    await decir(rival.jefe ? '¡La Guardiana del Cielo te espera en la cima de la torre! Una criatura legendaria baja de las nubes…' : `¡${rival.nombre} quiere combatir!`);
    const primera = (suyo[0] as { n: number }).n;
    vidaMostrada[1] = 1; pintarCaja(1); cajas[1].classList.add('visible');
    await decir(`¡${rival.nombre} envió a ${especie(primera).nombre}!`, 0.2); await entrar(1, primera); marcarVista(primera);
    vidaMostrada[0] = 1; pintarCaja(0); cajas[0].classList.add('visible');
    await decir(`¡Adelante, ${especie(equipo[0].n).nombre}!`, 0.2); await entrar(0, equipo[0].n);
    // Tutorial (solo la primera vez en este navegador)
    let tutorial = false;
    try { tutorial = numCombate === 0 && !piloto && !localStorage.getItem(TUTORIAL); } catch { /* sin almacenamiento */ }
    if (tutorial) {
      await decir('Consejo: en tu turno elige Luchar y un ataque. Cada ataque tiene su tipo y el menú te avisa si es muy eficaz contra el rival.', 1.2);
      await decir('Los ataques del mismo tipo que tu criatura pegan más fuerte. Si te toca un rival difícil, cambia de criatura en Equipo.', 1.2);
      await decir('Las Pociones curan la mitad de la vida. ¡Ganar hace subir de nivel a tu equipo y así evoluciona!', 1.2);
      try { localStorage.setItem(TUTORIAL, '1'); } catch { /* sin almacenamiento */ }
    }
    musica = true;
    while (combate.ganador === null && vivo && !rendido) {
      const mia = await turnoJugador();
      if (rendido) break;
      const suya = elegirAccion(combate, 1, rival.nivel, azarIA);
      elMenu.innerHTML = '';
      await contarTodo(resolverTurno(combate, [mia, suya]));
      if (combate.ganador !== null) break;
      if (necesitaCambio(combate, 1)) { const evs: Evento[] = []; cambiar(combate, 1, elegirReemplazo(combate, 1), evs); await contarTodo(evs); marcarVista(activo(combate, 1).n); }
      if (necesitaCambio(combate, 0)) { await decir('¡Elige a tu siguiente criatura!', 0); const a = piloto ? elegirReemplazo(combate, 0) : await menuEquipo(true); const evs: Evento[] = []; cambiar(combate, 0, a ?? elegirReemplazo(combate, 0), evs); await contarTodo(evs); }
    }
    musica = false;
    const gane = combate.ganador === 0 && !rendido;
    if (gane) {
      const L = combate.lados[0], vivas = L.equipo.filter((l) => l.ps > 0), vida = vivas.reduce((s, l) => s + l.ps / l.max, 0) / 3;
      const premio = 1000 + vivas.length * 250 + Math.round(vida * 300) + Math.max(0, 20 - combate.turno) * 15 + eficaces * 20 + criticos * 10 + (rival.jefe ? 2000 : 0);
      puntos += premio; ganados++;
      e.hud.puntos(puntos);
      e.sonido.bien(); [523, 659, 784, 1046].forEach((f, i) => e.sonido.tono(f, 0.2, { tipo: 'square', vol: 0.06, cuando: (e.sonido.ctx?.currentTime ?? 0) + i * 0.12 }));
      e.flotante(`+${premio}`, 0, 2.2, 0, 'oro');
      const ganadora = modelos[0];
      if (ganadora) for (let i = 0; i < 2; i++) { ganadora.pose.estira = -0.2; await esperar(0.1); ganadora.pose.estira = 0.2; sacudir(ganadora, 0.6); await animar(0.35, (k) => { ganadora.grupo.position.y = Math.sin(k * Math.PI) * 0.4; }); ganadora.grupo.position.y = 0; ganadora.pose.estira = 0; }
      await decir(rival.jefe ? `¡Venciste a la criatura legendaria y a la Guardiana del Cielo! Ganas ${premio} puntos.` : `¡Derrotaste a ${rival.nombre}! Ganas ${premio} puntos.`, 1.2);
    } else if (!rendido) await decir('¡Ya no te quedan criaturas! Fin de la torre.', 1.2);
    for (const lado of [0, 1]) { modelos[lado]?.grupo.removeFromParent(); modelos[lado] = null; }
    return gane;
  };
  const terminar = () => {
    if (terminado) return;
    terminado = true;
    e.detener();
    c.alTerminar({ puntaje: puntos, lineas: [['Rivales vencidos', `${ganados} / ${COMBATES}`], ['Evoluciones', String(evoluciones)], ['Resultado', ganados === COMBATES ? '¡Torre superada!' : rendido ? 'Te rendiste' : 'Te derrotaron']], detalle: { ganados, evoluciones } });
  };
  const jugar = async () => {
    modo(false);
    const equipo = (await elegirEquipo()).map((n) => ({ n, nivel: NIVEL_INICIAL }));
    for (numCombate = 0; numCombate < COMBATES && vivo && !rendido; numCombate++) {
      if (!(await pelear(equipo))) break;
      if (numCombate === COMBATES - 1) break;
      // Después de cada victoria: el equipo sube de nivel, descansa y las que alcanzan su nivel evolucionan
      for (const m of equipo) m.nivel += SUBE;
      await decir(`¡Tu equipo subió al Nv. ${equipo[0].nivel} y descansó!`, 0.8);
      for (const m of equipo) { const forma = formaANivel(m.n, m.nivel); if (forma !== m.n) { await evolucionar(m.n, forma); m.n = forma; } }
      await decir(RIVALES[numCombate + 1].jefe ? 'Queda la cima de la torre…' : '¡Siguiente rival!', 0.5);
    }
    if (ganados === COMBATES) { puntos += 1500; e.hud.puntos(puntos); await decir('¡Superaste la torre completa! +1500 puntos.', 1.5); }
    terminar();
  };

  // ── En vivo, cara a cara ──
  // Cada jugador elige su equipo del mismo sorteo y, en cada turno, su acción. Cada uno manda su historial completo
  // (equipo, acciones de todos los turnos y reemplazos) unas veces por segundo: si se pierde un mensaje, el siguiente lo
  // trae. Con los dos historiales y la misma semilla, los dos navegadores y los espectadores resuelven el mismo combate.
  type LadoVivo = 'a' | 'b';
  interface Historial { equipo: number[]; acciones: Accion[]; reemplazos: number[] }
  const TURNO_SEG = 30, EQUIPO_SEG = 45, REEMPLAZO_SEG = 20;
  let reloj = 0, atrasado = false;
  const accionValida = (x: unknown): x is Accion => {
    const a = x as Record<string, unknown>;
    if (!a || typeof a !== 'object') return false;
    if (a.tipo === 'atacar') return Number.isInteger(a.i) && (a.i as number) >= -1 && (a.i as number) <= 3;
    if (a.tipo === 'cambiar') return Number.isInteger(a.a) && (a.a as number) >= 0 && (a.a as number) <= 2;
    return a.tipo === 'objeto' && (a.cual === 'pocion' || a.cual === 'cura');
  };
  const historialValido = (d: Record<string, unknown>, sorteo: number[]): d is Record<string, unknown> & Historial =>
    Array.isArray(d.equipo) && d.equipo.length <= 3 && (d.equipo as unknown[]).every((n) => sorteo.includes(n as number)) && new Set(d.equipo).size === d.equipo.length
    && Array.isArray(d.acciones) && d.acciones.length <= 400 && (d.acciones as unknown[]).every(accionValida)
    && Array.isArray(d.reemplazos) && d.reemplazos.length <= 6 && (d.reemplazos as unknown[]).every((x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 2);
  /** Espera hasta que se cumpla algo (revisa diez veces por segundo). */
  const hastaQue = (f: () => boolean) => new Promise<void>((listo) => { const i = window.setInterval(() => { if (f() || !vivo) { clearInterval(i); listo(); } }, 100); });
  /** Corre una cuenta regresiva en el marcador; al llegar a cero cierra el menú abierto (y juega la máquina). */
  const cuentaAtras = (seg: number) => {
    agotado = false;
    const hasta = performance.now() + seg * 1000;
    const i = window.setInterval(() => { const q = Math.max(0, Math.ceil((hasta - performance.now()) / 1000)); e.hud.tiempo(`${q} s`); if (q <= 0) { agotado = true; cerrarMenu?.(); clearInterval(i); } }, 250);
    return () => { clearInterval(i); agotado = false; e.hud.tiempo(''); };
  };
  const enVivo = async () => {
    const v = c.vivo!, yoL: LadoVivo | null = v.rol === 'espectador' ? null : v.rol, otroL: LadoVivo = yoL === 'b' ? 'a' : 'b';
    YO = yoL === 'b' ? 1 : 0;
    duenos = yoL ? null : [v.nombres.a, v.nombres.b];
    // El mismo sorteo para los dos: 8 criaturas en su última etapa, al Nv. 50
    const sorteo = [...ELEGIBLES].sort(() => r() - 0.5).slice(0, 8);
    const mio: Historial = { equipo: [], acciones: [], reemplazos: [] }, remotos: Record<LadoVivo, Historial | null> = { a: null, b: null };
    const GUARDADO = `susto.bestias.vivo.${c.semilla}.${yoL}`;
    if (yoL) try { const g = JSON.parse(sessionStorage.getItem(GUARDADO) ?? 'null') as Record<string, unknown> | null; if (g && historialValido(g, sorteo)) Object.assign(mio, { equipo: g.equipo, acciones: g.acciones, reemplazos: g.reemplazos }); } catch { /* sin almacenamiento */ }
    const enviar = () => { if (!yoL) return; v.enviar('mundo', { equipo: mio.equipo, acciones: mio.acciones, reemplazos: mio.reemplazos }); try { sessionStorage.setItem(GUARDADO, JSON.stringify(mio)); } catch { /* sin almacenamiento */ } };
    v.alRecibir((tipo, d, lado) => { if (tipo === 'mundo' && lado && lado !== yoL && historialValido(d, sorteo)) { const prev = remotos[lado]; if (!prev || d.acciones.length >= prev.acciones.length) remotos[lado] = { equipo: d.equipo, acciones: d.acciones, reemplazos: d.reemplazos }; } });
    reloj = window.setInterval(enviar, v.directo() ? 400 : 900);
    const de = (l: LadoVivo): Historial | null => (l === yoL ? mio : remotos[l]);
    e.hud.extra(`${v.nombres.a} vs ${v.nombres.b}`);

    // 1. Equipos (si recargué la página, ya lo tenía elegido)
    if (yoL && mio.equipo.length !== 3) {
      const parar = cuentaAtras(EQUIPO_SEG);
      mio.equipo = await elegirEquipoVivo(sorteo);
      parar(); enviar();
    }
    await decir(yoL ? `Esperando que ${v.nombres[otroL]} elija su equipo…` : 'Los entrenadores eligen sus equipos…', 0);
    await hastaQue(() => (de('a')?.equipo.length ?? 0) === 3 && (de('b')?.equipo.length ?? 0) === 3);
    if (!vivo) return;
    combate = nuevoCombate(`${c.semilla}|vivo`, de('a')!.equipo, de('b')!.equipo);
    for (const n of [...de('a')!.equipo, ...de('b')!.equipo]) marcarVista(n);
    modo(true);
    escenaActual = Math.floor(r() * 5); fx.escenario(escenaActual);
    for (const caja of cajas) caja.classList.remove('visible');
    await decir(`¡Comienza el duelo! ${v.nombres.a} contra ${v.nombres.b}.`, 0.6);
    for (const lado of [1 - YO, YO]) {
      const n = activo(combate, lado).n, quien = lado === 0 ? v.nombres.a : v.nombres.b;
      vidaMostrada[S(lado)] = 1; pintarCaja(lado); cajas[S(lado)].classList.add('visible');
      await decir(S(lado) === 0 && yoL ? `¡Adelante, ${especie(n).nombre}!` : `¡${quien} envió a ${especie(n).nombre}!`, 0.2);
      await entrar(lado, n);
    }
    musica = true;
    const usados = [0, 0];
    /** Reemplazos pendientes: primero elijo el mío (si me toca y no lo tenía ya), después se aplican los dos en orden. */
    const reemplazar = async (narrar: boolean) => {
      const necesitan = [0, 1].filter((lado) => necesitaCambio(combate!, lado));
      if (yoL && necesitan.includes(YO) && mio.reemplazos.length <= usados[YO]) {
        await decir('¡Elige a tu siguiente criatura!', 0);
        const parar = cuentaAtras(REEMPLAZO_SEG);
        const a = piloto ? elegirReemplazo(combate!, YO) : await menuEquipo(true);
        parar();
        mio.reemplazos.push(a ?? elegirReemplazo(combate!, YO)); enviar();
      }
      for (const lado of necesitan) {
        const l: LadoVivo = lado === 0 ? 'a' : 'b';
        if ((de(l)?.reemplazos.length ?? 0) <= usados[lado]) await decir(l === yoL ? '…' : `${v.nombres[l]} elige su siguiente criatura…`, 0);
        await hastaQue(() => (de(l)?.reemplazos.length ?? 0) > usados[lado]);
        if (!vivo) return;
        const evs: Evento[] = [];
        cambiar(combate!, lado, de(l)!.reemplazos[usados[lado]++], evs);
        if (narrar) await contarTodo(evs);
      }
    };
    let refrescar = false;
    // 2. Turnos
    while (combate.ganador === null && vivo) {
      const t = combate.turno + 1, largoA = de('a')?.acciones.length ?? 0, largoB = de('b')?.acciones.length ?? 0;
      // Ponerse al día sin narrar: el espectador que va dos turnos atrás o el jugador que recargó la página
      const silencioso = Math.min(largoA, largoB) >= t && (yoL ? mio.acciones.length > t : Math.min(largoA, largoB) > t + 1);
      if (silencioso) {
        resolverTurno(combate, [de('a')!.acciones[t - 1], de('b')!.acciones[t - 1]]);
        if (combate.ganador === null) {
          // Los reemplazos que ya están en los historiales se aplican; si falta alguno, se sigue narrando desde aquí
          for (const lado of [0, 1].filter((x) => necesitaCambio(combate!, x))) { const h = de(lado === 0 ? 'a' : 'b'); if (h && h.reemplazos.length > usados[lado]) cambiar(combate, lado, h.reemplazos[usados[lado]++], []); }
        }
        refrescar = true;
        continue;
      }
      if (refrescar) {
        // Después de ponerse al día: la escena y los cuadros muestran el combate como va
        refrescar = false;
        for (const lado of [0, 1]) { const x = activo(combate, lado); modelos[S(lado)]?.grupo.removeFromParent(); modelos[S(lado)] = null; if (x.ps > 0) poner(lado, x.n); vidaMostrada[S(lado)] = x.ps / x.max; pintarCaja(lado); cajas[S(lado)].classList.add('visible'); }
      }
      if ([0, 1].some((x) => necesitaCambio(combate!, x))) { await reemplazar(true); continue; }
      // Un espectador que va un poco atrás ve la narración más rápido hasta alcanzar el turno en curso
      atrasado = !yoL && Math.min(largoA, largoB) > t;
      if (yoL && !mio.acciones[t - 1]) {
        const parar = cuentaAtras(TURNO_SEG);
        const accion = await turnoJugador();
        parar();
        mio.acciones[t - 1] = accion; enviar();
      }
      elMenu.innerHTML = '';
      if ((de(otroL)?.acciones.length ?? 0) < t || (!yoL && (de('a')?.acciones.length ?? 0) < t)) await decir(yoL ? `Esperando a ${v.nombres[otroL]}…` : 'Los entrenadores eligen…', 0);
      await hastaQue(() => (de('a')?.acciones.length ?? 0) >= t && (de('b')?.acciones.length ?? 0) >= t);
      if (!vivo) return;
      await contarTodo(resolverTurno(combate, [de('a')!.acciones[t - 1], de('b')!.acciones[t - 1]]));
      if (combate.ganador !== null) break;
      await reemplazar(true);
    }
    musica = false;
    if (!vivo || combate.ganador === null) return;
    // 3. Resultado: el ganador siempre queda arriba (3000 + sus criaturas en pie y vida); el que pierde, según el daño que hizo
    const g = combate.ganador, ganador = g === 0 ? v.nombres.a : v.nombres.b, Lg = combate.lados[g], Lp = combate.lados[1 - g];
    const vivas = Lg.equipo.filter((l) => l.ps > 0).length, vida = Lg.equipo.reduce((s, l) => s + l.ps / l.max, 0) / 3;
    const pGanador = 3000 + vivas * 1000 + Math.round(vida * 1000), pPerdedor = Math.round((1 - vida) * 2500) + Lp.equipo.filter((l) => l.ps > 0).length * 100;
    e.sonido.bien();
    await decir(yoL ? (YO === g ? `¡Ganaste el duelo contra ${v.nombres[otroL]}!` : `${ganador} ganó el duelo. ¡Buen combate!`) : `¡${ganador} gana el duelo!`, 1.2);
    if (yoL) try { sessionStorage.removeItem(GUARDADO); } catch { /* sin almacenamiento */ }
    if (yoL && !terminado) {
      terminado = true;
      e.detener();
      const gane = YO === g;
      c.alTerminar({ puntaje: gane ? pGanador : pPerdedor, lineas: [['Resultado', gane ? '¡Ganaste el duelo!' : 'Perdiste el duelo'], ['Criaturas en pie', String(combate.lados[YO].equipo.filter((l) => l.ps > 0).length)], ['Turnos', String(combate.turno)]], detalle: { gane, turnos: combate.turno } });
    }
  };
  /** Elegir 3 del sorteo en vivo (con la misma pantalla de la torre, sin Bestiario y con tiempo). */
  const elegirEquipoVivo = async (sorteo: number[]): Promise<number[]> => {
    const elegidos: number[] = [];
    if (piloto) return sorteo.slice(0, 3);
    abajo.classList.add('oculto');
    let foco = sorteo[0];
    while (!agotado) {
      panel.className = 'b-panel visible b-elegir';
      verEnVitrina(foco);
      panel.innerHTML = `<div class="b-lista"><h2>Elige tu equipo <small>${elegidos.length} / 3</small></h2><p>Duelo cara a cara, Nv. 50. Los dos eligen del mismo sorteo; tu rival no ve tu equipo hasta que empieza. El primero que elijas sale a combatir.</p><div class="b-opciones"></div></div><div class="b-ficha">${fichaHTML(foco)}</div>`;
      const opciones = [
        ...sorteo.map((n) => ({ html: `<strong>${especie(n).nombre}</strong>${especie(n).tipos.map(chip).join('')}${elegidos.includes(n) ? `<b class="b-marca">${elegidos.indexOf(n) + 1}</b>` : ''}`, valor: n, clase: elegidos.includes(n) ? 'elegido' : '' })),
        { html: elegidos.length === 3 ? '<strong>¡Listo!</strong>' : '<strong>Elige 3</strong>', valor: -2, no: elegidos.length !== 3, clase: 'b-listo' },
      ];
      const donde = panel.querySelector<HTMLElement>('.b-opciones')!;
      const p = menu(opciones, 2, false, donde);
      donde.querySelectorAll('button').forEach((b, i) => b.addEventListener('pointerenter', () => { const n = opciones[i]?.valor; if (n > 0 && n !== foco) { foco = n; verEnVitrina(n); panel.querySelector('.b-ficha')!.innerHTML = fichaHTML(n); } }));
      const v = await p;
      if (v === -2) break;
      if (v !== null && v > 0) { foco = v; if (elegidos.includes(v)) elegidos.splice(elegidos.indexOf(v), 1); else if (elegidos.length < 3) { elegidos.push(v); grito(v); } }
    }
    // Si se acabó el tiempo, se completa con las primeras del sorteo
    for (const n of sorteo) if (elegidos.length < 3 && !elegidos.includes(n)) elegidos.push(n);
    panel.className = 'b-panel'; abajo.classList.remove('oculto');
    enVitrina?.grupo.removeFromParent(); enVitrina = null;
    return elegidos;
  };

  // ── Cada cuadro ──
  let paso = -1;
  const TEMAS: [number[], number[]][] = [
    [[131, 131, 156, 175, 131, 131, 196, 175], [523, 659, 784, 659]], [[147, 147, 165, 196, 147, 147, 220, 196], [587, 740, 880, 740]],
    [[110, 110, 131, 147, 110, 110, 165, 147], [440, 523, 659, 523]], [[98, 98, 117, 131, 98, 98, 147, 131], [392, 466, 587, 466]],
    [[123, 123, 147, 165, 123, 165, 185, 220], [494, 622, 740, 988]],
  ];
  e.alCuadro((t, dt) => {
    leerControl();
    revisarRendimiento(dt);
    const k = Math.min(dt, 0.1) * velocidad * (apurar ? 2 : 1) * (piloto ? 3 : 1) * (atrasado ? 4 : 1) * escalaTiempo;
    for (let i = tareas.length - 1; i >= 0; i--) {
      const x = tareas[i];
      x.t += k;
      x.f(Math.min(1, x.t / x.dur));
      if (x.t >= x.dur) { tareas.splice(i, 1); x.listo(); }
    }
    fx.actualizar(k);
    for (const [i, m] of modelos.entries()) if (m) animarBestia(m, t, i * 1.3);
    if (enVitrina) { animarBestia(enVitrina, t); enVitrina.grupo.rotation.y = Math.sin(t * 0.6) * 0.6; }
    // Cámara suave
    const ck = 1 - Math.exp(-4 * Math.min(dt, 0.1));
    camaraYa.x += (foco.x - camaraYa.x) * ck; camaraYa.y += (foco.y - camaraYa.y) * ck; camaraYa.z += (foco.z - camaraYa.z) * ck; camaraYa.a += (foco.a - camaraYa.a) * ck;
    e.enfocar(camaraYa.x, camaraYa.y, camaraYa.z, camaraYa.a);
    // Sombras bajo las criaturas, estados que se ven y la vida que baja con retraso
    for (let lugar = 0; lugar < 2; lugar++) {
      const m = modelos[lugar], sm = sombras[lugar];
      sm.visible = !!m && m.grupo.visible;
      if (m) { const alto = m.alto * m.grupo.scale.y, y = m.grupo.position.y + (m.flota ? m.alto * 0.2 : 0); sm.position.set(m.grupo.position.x, 0.06, m.grupo.position.z); sm.scale.setScalar(alto * 0.75 / (1 + Math.max(0, y) * 1.5)); }
      const lado = lugar === 0 ? YO : 1 - YO, luchador = combate ? activo(combate, lado) : null;
      const visible = !!m && !!luchador && luchador.n === enEscena[lugar] && luchador.ps > 0;
      fx.estados(lugar, visible ? luchador!.estado : null, visible && luchador!.confusion > 0, visible ? m!.grupo.position : null, m ? m.alto * m.grupo.scale.y : 1, k);
      if (vidaFantasma[lugar] > vidaMostrada[lugar]) vidaFantasma[lugar] = Math.max(vidaMostrada[lugar], vidaFantasma[lugar] - k * 0.45); else vidaFantasma[lugar] = vidaMostrada[lugar];
      const u = cajas[lugar].querySelector<HTMLElement>('.b-vida u'); if (u) u.style.width = `${Math.max(0, vidaFantasma[lugar]) * 100}%`;
    }
    // Música: tema de batalla según el escenario; en los menús, una versión tranquila
    if (e.sonido.ctx && !terminado) {
      const [bajo, arpegio] = TEMAS[escenaActual % 5], ritmo = musica ? 0.16 : 0.3, s2 = Math.floor(t / ritmo);
      if (s2 !== paso) { paso = s2; const f = bajo[Math.floor(s2 / 4) % 8]; if (s2 % 2 === 0) e.sonido.tono(f, musica ? 0.14 : 0.25, { tipo: 'triangle', vol: musica ? 0.06 : 0.035 }); if (musica || s2 % 2 === 1) e.sonido.tono(arpegio[s2 % 4] * (Math.floor(s2 / 32) % 2 ? 1.122 : 1), 0.08, { tipo: musica ? 'square' : 'sine', vol: musica ? 0.016 : 0.02 }); }
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
  // Escena de combate para fotografiar escenarios y ataques (solo en desarrollo): "?efectos=1" y window.__efectos
  if (import.meta.env.DEV && parametros.has('efectos')) {
    (window as unknown as Record<string, unknown>).__efectos = {
      armar(a: number, b: number, escena: number) { modo(true); escenaActual = escena; fx.escenario(escena); poner(0, a); poner(1, b); abajo.classList.add('oculto'); },
      ataque(tipo: Tipo) { const de = centroDe(0), a = centroDe(1); fx.especial(tipo, de, a); },
      estado(estado: EstadoAlterado | null) { combate = nuevoCombate('x', [enEscena[0]], [enEscena[1]]); activo(combate, 1).estado = estado; },
    };
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
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__bestias = () => ({ tri: e.render.info.render.triangles, llamadas: e.render.info.render.calls, puntos, numCombate, ganados, terminado, combate: combate ? { turno: combate.turno, ganador: combate.ganador, yo: activo(combate, 0).n, el: activo(combate, 1).n, ps: combate.lados.map((L) => L.equipo.map((l) => l.ps)).join('|') } : null, texto: elTexto.textContent, ver: verEnVitrina });

  return {
    empezar() { e.empezar(); if (c.vivo) enVivo(); else if (!parametros.has('galeria') && !parametros.has('retrato') && !parametros.has('efectos')) jugar(); },
    destruir() { vivo = false; clearInterval(reloj); composer?.dispose(); e.destruir(); },
  };
}
