import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar } from '../reflejos/motor';
import { caja, mat } from './fisica';

// Tiro al Tótem: diez flechas a una diana. El viento de cada flecha sale de la semilla; la flecha se desvía hacia
// donde sopla y además cae un poco, así que hay que apuntar corrido. La mira se mece: también hay que elegir el momento.
// Desde la flecha 4 el viento también sopla hacia arriba o abajo, y desde la 5 la diana se mueve de lado a lado.
const FLECHAS = 10, RADIO = 2.4, Z = -6, ALTO = 4.6, POR_NUDO = 0.32, CAIDA = 0.3, VUELO = 0.42, PLAZO = 12;
const ANILLOS = ['#f3ecdc', '#2b3047', '#3f8cff', '#ef5565', '#ffd23c'];

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 12, alto: 10, centro: [0, 4.4, Z], inclinacion: 0.03 });
  const r = generador(c.semilla);
  const vientos = Array.from({ length: FLECHAS }, (_, i) => Math.round((r() * 2 - 1) * (3 + 0.6 * i) * 10) / 10);
  const vientosY = Array.from({ length: FLECHAS }, (_, i) => (i >= 3 ? Math.round((r() * 2 - 1) * 1.6 * 10) / 10 : 0));
  const MUEVE = 1.1 + 0.3 * c.nivel, mueve = (n: number) => n >= 4;
  const diana = new THREE.Group();
  e.escena.add(diana);

  const [k] = await Promise.all([
    e.personaje(c.aspecto, 2.2),
    e.modelo('barrel', -6.6, -6.4, 1.4, 0.3, 'pirata'), e.modelo('boat-row-small', 10, -22, 1.5, 1, 'pirata'),
    e.modelo('tree_palmTall', -8.5, -11, 11, 0.5), e.modelo('tree_palmBend', 8.8, -12, 11, 3.4), e.modelo('rocks-sand-b', 9, -11, 1, 0.6, 'pirata'),
  ]);
  k.grupo.position.set(-5.2, 0, -5);
  k.grupo.rotation.y = 2.6;
  k.animar('holding-right');

  // El tótem: cabezas talladas apiladas que sostienen la diana, y un águila con las alas abiertas arriba
  const cara = (y: number, alto: number, color: string, boca: string) => {
    const g = new THREE.Group(), bloque = new THREE.Mesh(new THREE.BoxGeometry(1.5, alto, 1), mat(color));
    g.add(bloque);
    for (const x of [-0.33, 0.33]) { const ojo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.08), mat('#f3ecdc')), pupila = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.1), mat('#1a1a22')); ojo.position.set(x, alto * 0.18, 0.5); pupila.position.set(x, alto * 0.18, 0.52); g.add(ojo, pupila); }
    const nariz = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 4), mat('#3a2a20')); nariz.rotation.x = Math.PI / 2; nariz.position.set(0, -alto * 0.02, 0.58); g.add(nariz);
    const labio = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.08), mat(boca)); labio.position.set(0, -alto * 0.28, 0.5); g.add(labio);
    for (const x of [-0.25, 0, 0.25]) { const diente = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.1), mat('#f3ecdc')); diente.position.set(x, -alto * 0.28, 0.53); g.add(diente); }
    g.position.set(0, y, Z - 0.45);
    return g;
  };
  const altoCara = (ALTO - RADIO - 0.2) / 3;
  ['#b5653a', '#3f8c7a', '#c9a227'].forEach((color, i) => diana.add(cara(altoCara * (i + 0.5), altoCara * 0.96, color, ['#ef5565', '#ffd23c', '#3f8cff'][i])));
  const aguila = new THREE.Group(), cabeza = cara(0, 0.9, '#ef5565', '#ffd23c');
  cabeza.position.set(0, 0, 0); aguila.add(cabeza);
  const pico = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 4), mat('#ffd23c')); pico.rotation.x = Math.PI / 2; pico.position.set(0, -0.05, 0.75); aguila.add(pico);
  for (const lado of [-1, 1]) for (let k2 = 0; k2 < 3; k2++) { const pluma = new THREE.Mesh(new THREE.BoxGeometry(1.1 - k2 * 0.2, 0.32, 0.18), mat(['#3f8cff', '#ffd23c', '#ef5565'][k2])); pluma.position.set(lado * (1.25 + k2 * 0.35), 0.15 - k2 * 0.22, 0); pluma.rotation.z = lado * (0.35 + k2 * 0.12); aguila.add(pluma); }
  aguila.position.set(0, ALTO + RADIO + 0.65, Z - 0.45);
  diana.add(aguila);
  // La diana: paja trenzada con anillos de colores (una textura) y los números de cada anillo
  const lienzo = document.createElement('canvas'); lienzo.width = lienzo.height = 512;
  const g = lienzo.getContext('2d')!;
  ANILLOS.forEach((color, i) => { g.fillStyle = color; g.beginPath(); g.arc(256, 256, 256 * (1 - i / ANILLOS.length), 0, Math.PI * 2); g.fill(); });
  for (let i = 0; i < 1400; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * 250; g.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'; g.lineWidth = 2; g.beginPath(); g.moveTo(256 + Math.cos(a) * d, 256 + Math.sin(a) * d); g.lineTo(256 + Math.cos(a + 0.05) * d, 256 + Math.sin(a + 0.05) * d); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
  ANILLOS.forEach((_, i) => { g.beginPath(); g.arc(256, 256, 256 * (1 - i / ANILLOS.length) - 1, 0, Math.PI * 2); g.stroke(); });
  const texDiana = new THREE.CanvasTexture(lienzo); texDiana.colorSpace = THREE.SRGBColorSpace;
  const cara0 = new THREE.Mesh(new THREE.CircleGeometry(RADIO, 48), new THREE.MeshLambertMaterial({ map: texDiana }));
  cara0.position.set(0, ALTO, Z + 0.01);
  diana.add(cara0);
  // Antorchas tiki a los lados, con fuego que titila
  const llamas: THREE.Mesh[] = [];
  for (const x of [-4.4, 4.4]) {
    const palo = caja(0.16, 3.2, 0.16, '#6f4826'); palo.position.set(x, 1.6, Z + 0.5);
    const copa = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.18, 0.45, 8), mat('#c9b25a')); copa.position.set(x, 3.4, Z + 0.5);
    const llama = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.8, 7), new THREE.MeshBasicMaterial({ color: '#ffb02e' })); llama.position.set(x, 3.95, Z + 0.5);
    const centro = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.45, 6), new THREE.MeshBasicMaterial({ color: '#fff2a0' })); centro.position.y = -0.1; llama.add(centro);
    e.escena.add(palo, copa, llama); llamas.push(llama);
  }
  const respaldo = new THREE.Mesh(new THREE.CylinderGeometry(RADIO + 0.2, RADIO + 0.2, 0.3, 40), mat('#a06a3c'));
  respaldo.rotation.x = Math.PI / 2;
  respaldo.position.set(0, ALTO, Z - 0.17);
  diana.add(respaldo);

  // Veleta: una manga que apunta hacia donde sopla el viento y crece con su fuerza
  const mastil = caja(0.12, 2.6, 0.12, '#6f4826'), manga = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.5, 8), mat('#ff9a2e'));
  mastil.position.set(3.9, ALTO + 2.2, Z);
  manga.geometry.translate(0, 0.75, 0);
  manga.position.set(3.9, ALTO + 3.3, Z);
  e.escena.add(mastil, manga);

  const mira = new THREE.Group(), trazo = new THREE.MeshBasicMaterial({ color: '#14203a' });
  const aro = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 24), trazo);
  mira.add(aro, new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.05), trazo), new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.7), trazo));
  mira.position.set(0, ALTO, Z + 0.2);
  e.escena.add(mira);

  const moldeFlecha = new THREE.Group(), asta = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), mat('#e9dcc0'));
  asta.rotation.x = Math.PI / 2;
  asta.position.z = 0.75;
  const punta = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), new THREE.MeshStandardMaterial({ color: '#c9ccd6', metalness: 0.7, roughness: 0.3 }));
  punta.rotation.x = -Math.PI / 2; punta.position.z = -0.08;
  moldeFlecha.add(asta, punta);
  for (let i = 0; i < 3; i++) { const pluma = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.34), mat(i ? '#ffffff' : '#ef5565')); pluma.position.set(0, 0, 1.38); const eje = new THREE.Group(); eje.rotation.z = (i / 3) * Math.PI * 2; pluma.position.y = 0.08; eje.add(pluma); eje.position.z = 0; moldeFlecha.add(eje); }

  const apunte = new THREE.Vector2(0, ALTO), plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z), toque = new THREE.Vector3();
  const mover = (ev: PointerEvent) => { if (e.apuntar(ev).ray.intersectPlane(plano, toque)) apunte.set(limitar(toque.x, -5, 5), limitar(toque.y, 0.8, 8.5)); };
  e.escuchar(e.lienzo, 'pointermove', mover);

  let sacudida = 0;
  let flecha = 0, puntos = 0, centros = 0, fallidas = 0, mejor = 0, terminado = false, turno = 0.5, libre = 0;
  let vuelo: { o: THREE.Object3D; desde: THREE.Vector3; hasta: THREE.Vector3; t0: number } | null = null;
  const tiros: number[] = [];

  const anunciar = () => {
    const v = vientos[flecha], vy = vientosY[flecha];
    e.hud.tiempo(`Flecha ${flecha + 1} de ${FLECHAS}`);
    e.hud.extra(`${Math.abs(v) < 0.05 ? 'Sin viento' : `Viento ${v > 0 ? '→' : '←'} ${Math.abs(v).toFixed(1)}`}${Math.abs(vy) >= 0.05 ? ` · ${vy > 0 ? '↑' : '↓'} ${Math.abs(vy).toFixed(1)}` : ''}${mueve(flecha) ? ' · diana en movimiento' : ''}`);
    manga.rotation.z = (v >= 0 ? -Math.PI / 2 : Math.PI / 2) + (v >= 0 ? 1 : -1) * Math.atan2(vy, Math.max(0.5, Math.abs(v)));
    manga.scale.set(1, 0.35 + Math.abs(v) / 6, 1);
  };

  const disparar = (t: number) => {
    if (terminado || vuelo || t < libre || t <= 0) return;
    const o = moldeFlecha.clone();
    e.escena.add(o);
    vuelo = { o, desde: new THREE.Vector3(mira.position.x * 0.3, 2.2, 9), hasta: new THREE.Vector3(mira.position.x + vientos[flecha] * POR_NUDO, mira.position.y - CAIDA + vientosY[flecha] * POR_NUDO, Z + 0.06), t0: t };
    e.sonido.ruido(0.12, 0.18);
    e.gesto(k, 'attack-melee-right', 0.5, 'holding-right');
  };
  e.escuchar(e.lienzo, 'pointerdown', (ev) => { mover(ev); disparar(e.reloj()); });
  e.escuchar(window, 'keydown', (ev) => { if (ev.key === ' ' && !ev.repeat) { ev.preventDefault(); disparar(e.reloj()); } });

  const terminar = () => {
    terminado = true;
    e.detener();
    k.animar('emote-yes');
    c.alTerminar({
      puntaje: puntos,
      lineas: [['Flechas al centro', String(centros)], ['Mejor flecha', String(mejor)], ['Fuera de la diana', String(fallidas)]],
      detalle: { tiros },
    });
  };

  if (import.meta.env.DEV) (window as unknown as { __juego: Record<string, unknown> }).__juego.estado = () => ({ apunte: apunte.toArray(), mira: mira.position.toArray(), tiros, vuelo: vuelo?.hasta.toArray() });
  anunciar();
  e.hud.puntos(0);
  e.alCuadro((t, dt) => {
    llamas.forEach((l, i) => { const f2 = 1 + Math.sin(t * 13 + i * 2.1) * 0.12; l.scale.set(f2, 1 + Math.sin(t * 17 + i) * 0.18, f2); });
    sacudida = Math.max(0, sacudida - dt * 4); cara0.position.z = Z + 0.01 - Math.sin(sacudida * 20) * sacudida * 0.08;
    aguila.children.forEach((p, i) => { if (i > 1) p.rotation.x = Math.sin(t * 3 + i) * 0.05; });
    // La mira sigue al dedo pero se mece; cada flecha se mece un poco más
    const meneo = (0.34 + flecha * 0.03) * (1 + (c.nivel - 1) * 0.1);
    mira.position.x = apunte.x + (Math.sin(t * 1.7) + Math.sin(t * 2.9) * 0.5) * meneo;
    mira.position.y = apunte.y + Math.cos(t * 1.3) * meneo * 0.8;
    mira.visible = !vuelo && !terminado && t > 0;
    diana.position.x = mueve(flecha) && !terminado ? Math.sin(t * 0.9) * MUEVE : diana.position.x * 0.9;
    if (terminado || t <= 0) return;
    if (vuelo) {
      const q = limitar((t - vuelo.t0) / VUELO, 0, 1);
      vuelo.o.position.lerpVectors(vuelo.desde, vuelo.hasta, q);
      vuelo.o.position.y += Math.sin(q * Math.PI) * 0.7;
      if (q < 1) { e.chispas(vuelo.o.position.x, vuelo.o.position.y, vuelo.o.position.z + 0.6, ['#ffffff', '#fff2a0'], 1, 0.4); return; }
      vuelo.o.position.copy(vuelo.hasta);
      const d = Math.hypot(vuelo.hasta.x - diana.position.x, vuelo.hasta.y - ALTO), gana = d > RADIO ? 0 : Math.max(10, Math.ceil((1 - d / RADIO) * 10) * 10);
      if (!gana) { fallidas++; e.escena.remove(vuelo.o); }
      else { diana.attach(vuelo.o); sacudida = 1; e.chispas(vuelo.hasta.x, vuelo.hasta.y, Z + 0.3, gana >= 90 ? ['#ffd23c', '#ffffff', '#ef5565'] : ['#d9b46a', '#8a5a38'], gana >= 90 ? 30 : 10, gana >= 90 ? 5 : 2.5); } // la flecha queda clavada y se mueve con la diana
      if (gana >= 90) centros++;
      mejor = Math.max(mejor, gana);
      puntos += gana;
      tiros.push(gana);
      e.flotante(gana ? `+${gana}` : 'Fuera', vuelo.hasta.x, vuelo.hasta.y + 0.5, Z, gana >= 90 ? 'oro' : gana ? 'bien' : 'mal');
      if (gana >= 90) e.sonido.bien(); else if (gana) { if (!e.sonido.efecto('madera')) e.sonido.tono(300, 0.08, { tipo: 'square', vol: 0.12 }); } else e.sonido.mal();
      e.hud.puntos(puntos);
      vuelo = null;
      flecha++;
      if (flecha >= FLECHAS) return terminar();
      libre = t + 0.5;
      turno = t;
      anunciar();
    } else if (t - turno > PLAZO) disparar(t); // nadie se queda pegado apuntando
  });

  return { empezar: e.empezar, destruir: e.destruir };
}
