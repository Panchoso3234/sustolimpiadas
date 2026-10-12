import * as THREE from 'three';
import { generador } from '../../nucleo/azar';
import type { Contexto, Partida } from '../marco';
import { crearEscenario, limitar } from '../reflejos/motor';
import { caja, mat } from './fisica';

// Tiro al Tótem: diez flechas a una diana. El viento de cada flecha sale de la semilla; la flecha se desvía hacia
// donde sopla y además cae un poco, así que hay que apuntar corrido. La mira se mece: también hay que elegir el momento.
const FLECHAS = 10, RADIO = 2.4, Z = -6, ALTO = 4.6, POR_NUDO = 0.32, CAIDA = 0.3, VUELO = 0.42, PLAZO = 12;
const ANILLOS = ['#f3ecdc', '#2b3047', '#3f8cff', '#ef5565', '#ffd23c'];

export async function crear(c: Contexto): Promise<Partida> {
  const e = crearEscenario(c.caja, { ancho: 12, alto: 10, centro: [0, 4.4, Z], inclinacion: 0.03 });
  const r = generador(c.semilla);
  const vientos = Array.from({ length: FLECHAS }, (_, i) => Math.round((r() * 2 - 1) * (3 + 0.6 * i) * 10) / 10);

  const [k] = await Promise.all([
    e.personaje(c.aspecto, 2.2),
    e.modelo('barrel', -6.6, -6.4, 1.4, 0.3, 'pirata'), e.modelo('boat-row-small', 10, -22, 1.5, 1, 'pirata'),
    e.modelo('tree_palmTall', -8.5, -11, 11, 0.5), e.modelo('tree_palmBend', 8.8, -12, 11, 3.4), e.modelo('rocks-sand-b', 9, -11, 1, 0.6, 'pirata'),
  ]);
  k.grupo.position.set(-5.2, 0, -5);
  k.grupo.rotation.y = 2.6;
  k.animar('holding-right');

  // Diana sobre un poste
  const poste = caja(0.5, ALTO, 0.5, '#8a5a38');
  poste.position.set(0, ALTO / 2 - 0.3, Z - 0.4);
  e.escena.add(poste);
  ANILLOS.forEach((color, i) => {
    const disco = new THREE.Mesh(new THREE.CircleGeometry(RADIO * (1 - i / ANILLOS.length), 40), new THREE.MeshBasicMaterial({ color }));
    disco.position.set(0, ALTO, Z + i * 0.01);
    e.escena.add(disco);
  });
  const respaldo = new THREE.Mesh(new THREE.CylinderGeometry(RADIO + 0.2, RADIO + 0.2, 0.3, 40), mat('#a06a3c'));
  respaldo.rotation.x = Math.PI / 2;
  respaldo.position.set(0, ALTO, Z - 0.17);
  e.escena.add(respaldo);

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
  const plumas = caja(0.24, 0.24, 0.3, '#ef5565');
  plumas.position.z = 1.45;
  moldeFlecha.add(asta, plumas);

  const apunte = new THREE.Vector2(0, ALTO), plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z), toque = new THREE.Vector3();
  const mover = (ev: PointerEvent) => { if (e.apuntar(ev).ray.intersectPlane(plano, toque)) apunte.set(limitar(toque.x, -5, 5), limitar(toque.y, 0.8, 8.5)); };
  e.escuchar(e.lienzo, 'pointermove', mover);

  let flecha = 0, puntos = 0, centros = 0, fallidas = 0, mejor = 0, terminado = false, turno = 0.5, libre = 0;
  let vuelo: { o: THREE.Object3D; desde: THREE.Vector3; hasta: THREE.Vector3; t0: number } | null = null;
  const tiros: number[] = [];

  const anunciar = () => {
    const v = vientos[flecha];
    e.hud.tiempo(`Flecha ${flecha + 1} de ${FLECHAS}`);
    e.hud.extra(Math.abs(v) < 0.05 ? 'Sin viento' : `Viento ${v > 0 ? '→' : '←'} ${Math.abs(v).toFixed(1)}`);
    manga.rotation.z = v >= 0 ? -Math.PI / 2 : Math.PI / 2;
    manga.scale.set(1, 0.35 + Math.abs(v) / 6, 1);
  };

  const disparar = (t: number) => {
    if (terminado || vuelo || t < libre || t <= 0) return;
    const o = moldeFlecha.clone();
    e.escena.add(o);
    vuelo = { o, desde: new THREE.Vector3(mira.position.x * 0.3, 2.2, 9), hasta: new THREE.Vector3(mira.position.x + vientos[flecha] * POR_NUDO, mira.position.y - CAIDA, Z + 0.06), t0: t };
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
  e.alCuadro((t) => {
    // La mira sigue al dedo pero se mece; cada flecha se mece un poco más
    const meneo = 0.34 + flecha * 0.03;
    mira.position.x = apunte.x + (Math.sin(t * 1.7) + Math.sin(t * 2.9) * 0.5) * meneo;
    mira.position.y = apunte.y + Math.cos(t * 1.3) * meneo * 0.8;
    mira.visible = !vuelo && !terminado && t > 0;
    if (terminado || t <= 0) return;
    if (vuelo) {
      const q = limitar((t - vuelo.t0) / VUELO, 0, 1);
      vuelo.o.position.lerpVectors(vuelo.desde, vuelo.hasta, q);
      vuelo.o.position.y += Math.sin(q * Math.PI) * 0.7;
      if (q < 1) return;
      vuelo.o.position.copy(vuelo.hasta);
      const d = Math.hypot(vuelo.hasta.x, vuelo.hasta.y - ALTO), gana = d > RADIO ? 0 : Math.max(10, Math.ceil((1 - d / RADIO) * 10) * 10);
      if (!gana) { fallidas++; e.escena.remove(vuelo.o); }
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
