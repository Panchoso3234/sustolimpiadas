import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { mat } from '../punteria/fisica';
import { crearEscenario, mmss } from '../reflejos/motor';

// Galería de Tiro: un puesto de feria de noche. Patos, dianas y botellas pasan por tres rieles y otras dianas asoman
// desde el mostrador. Apuntas y disparas con el clic (o tocando la pantalla); el rifle tiene seis tiros y hay que
// recargar. Aciertos seguidos suben el multiplicador; las bombas restan y lo cortan. Tres rondas que se ponen difíciles.

// EXTRA_MAX: lo más que los relojes alargan una ronda (sin tope, un buen tirador la estiraba casi sin fin)
const RONDAS = 3, DURA_RONDA = 35, PAUSA = 3, BALAS = 6, RECARGA = 0.9, BORDE = 8.6, EXTRA_MAX = 6;
type Tipo = 'pato' | 'diana' | 'botella' | 'dorado' | 'bomba' | 'reloj' | 'asoma';
const VALOR: Record<Tipo, number> = { pato: 10, diana: 15, botella: 20, dorado: 100, bomba: -50, reloj: 10, asoma: 25 };
// Cada riel: altura, profundidad, sentido y rapidez (el de arriba, más lejos y más rápido)
const RIELES = [{ y: 1.75, z: 0, dir: 1, vel: 1 }, { y: 3.3, z: -1.2, dir: -1, vel: 1.25 }, { y: 4.85, z: -2.4, dir: 1, vel: 1.55 }];
/** Qué sale en cada ronda (probabilidades acumuladas en este orden). */
const MEZCLA: Partial<Record<Tipo, number>>[] = [
  { pato: 0.7, diana: 0.3 },
  { pato: 0.42, diana: 0.25, botella: 0.2, reloj: 0.06, bomba: 0.07 },
  { pato: 0.3, diana: 0.2, botella: 0.2, bomba: 0.13, reloj: 0.05, dorado: 0.12 },
];

interface Blanco { tipo: Tipo; malla: THREE.Group; riel: number; x: number; vivo: boolean; caida: number; sube?: { desde: number; arriba: number } }

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 15.5, alto: 8.6, centro: [0, 3.1, -1], inclinacion: 0.1, sinPlaya: true });
  e.escena.background = new THREE.Color('#2b1d4e');
  e.lienzo.style.cursor = 'crosshair';
  const r = generador(`${c.semilla}|tiro`), apuro = 1 + (c.nivel - 1) * 0.08;

  // ── El puesto: pared a rayas, toldo, mostrador, rieles y guirnalda de luces ──
  const textura = (w: number, h: number, f: (g: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; f(cv.getContext('2d')!); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const rayas = textura(256, 64, (g) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f4e6c8' : '#c73e3a'; g.fillRect(i * 16, 0, 16, 64); } });
  const pared = new THREE.Mesh(new THREE.BoxGeometry(18, 7.5, 0.3), new THREE.MeshLambertMaterial({ map: rayas }));
  pared.position.set(0, 3.2, -3.3);
  const mostrador = new THREE.Mesh(new THREE.BoxGeometry(18, 1.25, 1), mat('#9a6332'));
  mostrador.position.set(0, 0.62, 1.4);
  const borde = new THREE.Mesh(new THREE.BoxGeometry(18.2, 0.12, 1.15), mat('#d9a35a')); borde.position.set(0, 1.28, 1.4);
  e.escena.add(pared, mostrador, borde);
  for (const lado of [-1, 1]) { const poste = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.6, 0.5), mat('#c73e3a')); poste.position.set(lado * 8.9, 3.4, 1.4); e.escena.add(poste); }
  for (let i = 0; i < 12; i++) { const lona = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.18, 1.8), mat(i % 2 ? '#f4e6c8' : '#c73e3a')); lona.position.set(-8.5 + i * 1.55, 6.75, -0.4); lona.rotation.x = 0.35; e.escena.add(lona); }
  for (const rl of RIELES) { const barra = new THREE.Mesh(new THREE.BoxGeometry(18, 0.12, 0.2), mat('#3a3a44')); barra.position.set(0, rl.y - 0.55, rl.z); e.escena.add(barra); }
  const focos: THREE.Mesh[] = [];
  for (let i = 0; i < 22; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: ['#ffd23c', '#ff5a7a', '#5ad1ff', '#7dff8a'][i % 4] })); f.position.set(-8.4 + i * 0.8, 6.3 - Math.sin((i % 11) / 10 * Math.PI) * 0.35, 0.4); focos.push(f); e.escena.add(f); }

  // ── Los blancos ──
  const diana = textura(64, 64, (g) => { for (let i = 4; i >= 1; i--) { g.fillStyle = i % 2 ? '#e8372f' : '#ffffff'; g.beginPath(); g.arc(32, 32, i * 7.8, 0, Math.PI * 2); g.fill(); } });
  const reloj = textura(64, 64, (g) => { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#2a6cf0'; g.lineWidth = 4; g.stroke(); g.strokeStyle = '#1a1a22'; g.beginPath(); g.moveTo(32, 32); g.lineTo(32, 12); g.moveTo(32, 32); g.lineTo(46, 38); g.stroke(); g.fillStyle = '#2a6cf0'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText('+3', 32, 56); });
  const disco = (map: THREE.Texture, radio: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, 0.08, 24), [mat('#ddd'), new THREE.MeshLambertMaterial({ map }), mat('#ddd')]); m.rotation.x = Math.PI / 2; return m; };
  const armar = (tipo: Tipo): THREE.Group => {
    const g = new THREE.Group();
    if (tipo === 'pato' || tipo === 'dorado') {
      const piel = tipo === 'dorado' ? new THREE.MeshStandardMaterial({ color: '#ffd23c', emissive: '#ffb000', emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4, flatShading: true }) : mat('#ffd84a');
      const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), piel); cuerpo.scale.set(0.55, 0.36, 0.28);
      const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), piel); cabeza.position.set(0.34, 0.4, 0);
      const pico = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 8), mat('#ff8a1e')); pico.rotation.z = -Math.PI / 2; pico.position.set(0.6, 0.38, 0);
      const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: '#1a1a22' })); ojo.position.set(0.42, 0.48, 0.18);
      g.add(cuerpo, cabeza, pico, ojo);
    } else if (tipo === 'diana' || tipo === 'asoma') {
      g.add(disco(diana, tipo === 'asoma' ? 0.48 : 0.42));
      const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9), mat('#5a3a22')); palo.position.y = -0.6; g.add(palo);
    } else if (tipo === 'reloj') g.add(disco(reloj, 0.4));
    else if (tipo === 'botella') {
      const vidrio = new THREE.MeshStandardMaterial({ color: '#3fbf6a', transparent: true, opacity: 0.85, roughness: 0.2 });
      const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 12), vidrio), cuello = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 0.28, 10), vidrio), tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 8), mat('#c73e3a'));
      cuello.position.y = 0.38; tapa.position.y = 0.54; g.add(cuerpo, cuello, tapa);
    } else {
      const bola = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), mat('#1e1e26')), mecha = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25), mat('#c9a227')), chispa = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: '#ff7a1e' }));
      mecha.position.set(0.1, 0.4, 0); mecha.rotation.z = -0.4; chispa.position.set(0.16, 0.52, 0); g.add(bola, mecha, chispa);
    }
    e.escena.add(g);
    return g;
  };
  const blancos: Blanco[] = [];
  const elegir = (ronda: number, riel: number): Tipo => {
    const mezcla = MEZCLA[ronda];
    let x = r(), ultimo: Tipo = 'pato';
    for (const [tipo, p] of Object.entries(mezcla) as [Tipo, number][]) { if (tipo === 'dorado' && riel !== 2) continue; ultimo = tipo; if ((x -= p) <= 0) return tipo; }
    return ultimo;
  };
  const poner = (ronda: number, riel: number, x: number) => {
    const tipo = elegir(ronda, riel), malla = armar(tipo), rl = RIELES[riel];
    malla.position.set(x, rl.y, rl.z);
    if (tipo === 'pato' || tipo === 'dorado') malla.scale.x = rl.dir;
    blancos.push({ tipo, malla, riel, x, vivo: true, caida: 0 });
  };
  const rapidez = (ronda: number, riel: number) => (1.5 + ronda * 0.55) * RIELES[riel].vel * apuro;
  const llenar = (ronda: number) => { for (let riel = 0; riel < 3; riel++) for (let x = -BORDE + 1; x < BORDE; x += 2.3) poner(ronda, riel, x + r() * 0.6); };

  // ── Disparo ──
  let balas = BALAS, recargaHasta = 0, racha = 0, tiros = 0, aciertos = 0, puntos = 0, ronda = 0, inicioRonda = 0, extra = 0, pausaHasta = 0, empezado = false, terminado = false;
  const multi = () => Math.min(4, 1 + Math.floor(racha / 4));
  const recargar = (t: number) => { if (balas === BALAS || t < recargaHasta) return; recargaHasta = t + RECARGA; e.sonido.tono(300, 0.08, { tipo: 'square', vol: 0.08 }); e.sonido.tono(500, 0.08, { tipo: 'square', vol: 0.08, cuando: (e.sonido.ctx?.currentTime ?? 0) + 0.5 }); };
  const disparar = (ev: PointerEvent) => {
    const t = e.reloj();
    if (!empezado || terminado || t < pausaHasta) return;
    if (t < recargaHasta) return;
    if (balas <= 0) { e.hud.aviso('¡Recarga!', 'mal', 0.6); e.sonido.tono(160, 0.06, { tipo: 'square', vol: 0.08 }); return; }
    balas--; tiros++;
    e.sonido.ruido(0.08, 0.25); e.sonido.tono(220, 0.1, { tipo: 'square', vol: 0.08, hasta: 90 });
    const rayo = e.apuntar(ev), vivos = blancos.filter((b) => b.vivo);
    const toque = rayo.intersectObjects(vivos.map((b) => b.malla), true)[0];
    const b = toque && vivos.find((x) => { let o: THREE.Object3D | null = toque.object; while (o) { if (o === x.malla) return true; o = o.parent; } return false; });
    if (!b) {
      racha = 0;
      const enPared = rayo.intersectObject(pared)[0];
      if (enPared) e.chispas(enPared.point.x, enPared.point.y, enPared.point.z + 0.2, ['#5a3a22', '#f4e6c8'], 5, 1.5);
      return;
    }
    b.vivo = false; b.caida = 0.001;
    const p = b.malla.position;
    if (b.tipo === 'bomba') {
      racha = 0; puntos = Math.max(0, puntos + VALOR.bomba);
      e.chispas(p.x, p.y, p.z, ['#ff9a2e', '#ffd23c', '#3a3a44'], 40, 6); e.temblar(0.8); e.sonido.ruido(0.4, 0.3); e.sonido.mal();
      e.flotante(String(VALOR.bomba), p.x, p.y + 0.6, p.z, 'mal');
      e.escena.remove(b.malla);
      return;
    }
    aciertos++; racha++;
    const valor = VALOR[b.tipo] * multi();
    puntos += valor;
    if (b.tipo === 'reloj' && extra < EXTRA_MAX) { extra += 3; e.hud.aviso('+3 segundos', 'oro', 0.8); }
    if (b.tipo === 'botella') { e.chispas(p.x, p.y, p.z, ['#3fbf6a', '#bff5cf', '#ffffff'], 22, 4); e.escena.remove(b.malla); e.sonido.tono(1800, 0.12, { tipo: 'triangle', vol: 0.1, hasta: 2600 }); }
    else { e.chispas(p.x, p.y, p.z, b.tipo === 'dorado' ? ['#ffd23c', '#ffffff', '#ffb000'] : ['#ffffff', '#ffd23c'], b.tipo === 'dorado' ? 40 : 12, 4); e.sonido.tono(b.tipo === 'dorado' ? 1500 : 900, 0.1, { tipo: 'triangle', vol: 0.12, hasta: 1300 }); }
    e.flotante(`+${valor}${multi() > 1 ? ` x${multi()}` : ''}`, p.x, p.y + 0.6, p.z, 'oro');
  };
  e.escuchar(e.lienzo, 'pointerdown', (ev) => { if (ev.button === 2) recargar(e.reloj()); else disparar(ev); });
  e.escuchar(e.lienzo, 'contextmenu', (ev) => ev.preventDefault());
  e.escuchar(window, 'keydown', (ev) => { if (ev.key === ' ' || ev.key.toLowerCase() === 'r') { recargar(e.reloj()); ev.preventDefault(); } });
  const boton = document.createElement('button');
  boton.className = 'boton mando-accion'; boton.textContent = 'Recargar';
  boton.addEventListener('pointerdown', (ev) => { ev.preventDefault(); recargar(e.reloj()); });
  c.caja.appendChild(boton);

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    e.detener();
    const punteria = tiros ? aciertos / tiros : 0, bono = Math.round(punteria * 300);
    puntos += bono;
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Aciertos', `${aciertos} de ${tiros}`], ['Puntería', `${Math.round(punteria * 100)} %`], ['Bono de puntería', String(bono)]],
      detalle: { aciertos, tiros, punteria: Math.round(punteria * 100) },
    });
  };

  llenar(0);
  // Para probar: dónde está en pantalla el primer blanco vivo de un riel
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__tiro = { blanco: (riel: number) => { const b = blancos.find((x) => x.vivo && x.riel === riel && Math.abs(x.x) < 5); if (!b) return null; const p = b.malla.position.clone().project(e.camara), rc = e.lienzo.getBoundingClientRect(); return { x: rc.left + (p.x * 0.5 + 0.5) * rc.width, y: rc.top + (-p.y * 0.5 + 0.5) * rc.height, tipo: b.tipo }; } };
  let proximaAsoma = 0;
  e.hud.tiempo(mmss(DURA_RONDA)); e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    const paso = Math.min(dt, 0.05);
    focos.forEach((f, i) => { (f.material as THREE.MeshBasicMaterial).color.setHSL(((i * 0.11 + t * 0.15) % 1), 0.9, Math.sin(t * 4 + i) > 0 ? 0.62 : 0.4); });
    if (recargaHasta && t >= recargaHasta) { balas = BALAS; recargaHasta = 0; }
    // Los blancos caídos se dan vuelta y desaparecen
    for (const b of blancos) if (!b.vivo && b.caida > 0) { b.caida += paso; b.malla.rotation.x = -Math.min(1, b.caida / 0.25) * Math.PI / 2; if (b.caida > 0.5) { e.escena.remove(b.malla); b.caida = -1; } }
    if (!empezado || terminado) return;
    if (t < pausaHasta) { e.hud.tiempo(mmss(DURA_RONDA)); return; }
    // Rieles: los blancos avanzan; al salir por un lado entra otro por el otro
    for (let riel = 0; riel < 3; riel++) {
      const rl = RIELES[riel], v = rapidez(ronda, riel) * rl.dir * paso;
      for (const b of blancos) if (b.vivo && b.riel === riel && !b.sube) { b.x += v; b.malla.position.x = b.x; b.malla.position.y = rl.y + (b.tipo === 'pato' || b.tipo === 'dorado' ? Math.abs(Math.sin(t * 6 + b.x)) * 0.08 : 0); }
      const enRiel = blancos.filter((b) => b.vivo && b.riel === riel && !b.sube);
      for (const b of enRiel) if (Math.abs(b.x) > BORDE + 0.5) { b.vivo = false; e.escena.remove(b.malla); }
      const entrada = -BORDE * rl.dir, cercano = Math.min(...enRiel.map((b) => Math.abs(b.x - entrada)), 99);
      if (cercano > 2.1 + r() * 0.8) poner(ronda, riel, entrada - rl.dir * 0.3);
    }
    // Desde la ronda 2, dianas que asoman detrás del mostrador
    if (ronda >= 1 && t >= proximaAsoma) {
      const b: Blanco = { tipo: 'asoma', malla: armar('asoma'), riel: -1, x: -7 + r() * 14, vivo: true, caida: 0, sube: { desde: t, arriba: ronda === 1 ? 1.5 : 1.15 } };
      b.malla.position.set(b.x, 0, 0.75); blancos.push(b);
      proximaAsoma = t + (ronda === 1 ? 2.2 : 1.5);
    }
    for (const b of blancos) if (b.vivo && b.sube) {
      const f = (t - b.sube.desde) / b.sube.arriba, alto = f < 0.2 ? f / 0.2 : f > 0.8 ? (1 - f) / 0.2 : 1;
      b.malla.position.y = 0.4 + Math.max(0, alto) * 1.75;
      if (f >= 1) { b.vivo = false; e.escena.remove(b.malla); }
    }
    for (let i = blancos.length - 1; i >= 0; i--) if (!blancos[i].vivo && blancos[i].caida <= 0) blancos.splice(i, 1);
    // Rondas
    const queda = DURA_RONDA + extra - (t - inicioRonda);
    if (queda <= 0) {
      if (ronda >= RONDAS - 1) return terminar();
      ronda++; inicioRonda = t + PAUSA; extra = 0; pausaHasta = t + PAUSA; balas = BALAS; recargaHasta = 0;
      for (const b of blancos) e.escena.remove(b.malla);
      blancos.length = 0;
      llenar(ronda);
      e.hud.aviso(ronda === RONDAS - 1 ? '¡Ronda final!' : `Ronda ${ronda + 1}`, 'oro', 1.6);
      e.sonido.efecto('campana', 0.5);
      return;
    }
    e.hud.tiempo(mmss(queda));
    e.hud.extra(`Ronda ${ronda + 1}/${RONDAS} · ${t < recargaHasta ? 'recargando…' : '●'.repeat(balas) + '○'.repeat(BALAS - balas)}${multi() > 1 ? ` · x${multi()}` : ''}`);
    e.hud.puntos(puntos);
  });

  return { empezar() { e.empezar(); empezado = true; inicioRonda = 0; }, destruir: e.destruir };
}
