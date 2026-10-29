import { useEffect, useState } from 'preact/hooks';
import { fechaChile } from './nucleo/azar';
import { useSesion } from './nucleo/supabase';
import { juegoPorId, nombreVersus } from './juegos/catalogo';
import * as V from './juegos/duelos';
import { CRUCES, cruceDe } from './juegos/liga';
import { escucharSalas, type InfoSala } from './vivo/vestibulo';

// Inicio: la portada liviana con la que abre el sitio (antes abría directo en la isla 3D, lo más pesado de todo).
// Muestra lo que cada persona necesita al entrar: el cruce en curso, sus duelos pendientes, quién juega en vivo y las
// novedades. La isla se descarga recién al entrar a ella; aquí solo se precarga su código cuando la página ya está quieta.

/** Las últimas novedades del sitio (la más reciente primero). */
const NOVEDADES: { fecha: string; texto: string }[] = [
  { fecha: '2026-10-29', texto: 'Flappy Colibrí, Corte Maestro, Horda Infinita y Fusión de Gemas pasan a pixel art de 8 bits: mucho más livianos, fluidos hasta en celulares modestos. Horda Infinita ahora se mueve con el mouse (apunta hacia donde quieres ir) y la hoja de Corte Maestro deja un corte más limpio.' },
  { fecha: '2026-10-29', texto: 'Cuatro juegos nuevos: Flappy Colibrí (un solo botón, cuatro mundos y medallas), Corte Maestro (corta fruta al vuelo en 90 s), Fusión de Gemas (fusiona tres iguales en una rejilla hexagonal) y Horda Infinita (sobrevive a la horda y evoluciona tus armas). Todos con duelo 1v1, versión 3v3 y modo libre.' },
  { fecha: '2026-10-29', texto: 'Se retiran del torneo 10 juegos: PUCHAMON, Cazanúmeros, Tinta Tramposa, Memoria de Pez, Erizos Ocultos, Carrera de Escobas, Torre de Calabazas, Caza del Huevo, Al Agua Pato y Fuchibol. Lo que ya jugaste en ellos sigue contando para tu nivel.' },
  { fecha: '2026-10-28', texto: 'Lava Loca más llevable: obstáculos más lentos, plataformas más anchas, 3 tramos fáciles y ayuda automática tras 3 caídas en el mismo tramo. Subway Surfers: ya no se sube de un salto a un tren sin rampa.' },
  { fecha: '2026-10-27', texto: 'TSUKIBET (en Progreso): pronostica quién gana cada enfrentamiento del próximo cruce. Y antes de cada duelo puedes dejar tu declaración en Mis enfrentamientos: tu rival la ve y La Cuarta la cita.' },
  { fecha: '2026-10-27', texto: 'Nueva sección ¡El Diario!: La Cuarta, el diario del torneo, sale al terminar cada cruce con lo que pasó, estadísticas, la tabla y la crónica de lo que se viene. Ordenado por jornadas y para leer de corrido.' },
  { fecha: '2026-10-26', texto: 'CONECTA4 y Battleship ya son juegos del torneo: desafío contra la máquina que da puntos, en vivo contra otra persona y en el sorteo de los cruces. Con Pop Out, Salvo, radar y reloj.' },
  { fecha: '2026-10-26', texto: 'Bomberman 2.0 (tres arenas, mejoras clásicas, calavera y puntaje por puesto) y Angry Birds 2.0 (diez niveles con piedra, hielo, sandías especiales y viento). Sus marcas antiguas se borran.' },
  { fecha: '2026-10-26', texto: 'Ya no hay partidas dudosas: todo puntaje cuenta para los récords y la Copa. El cruce 2 va del 26 al 28 de octubre y el 3 del 29 al 31.' },
  { fecha: '2026-10-25', texto: 'Lista de miembros a la derecha: quién está en línea y qué está jugando.' },
  { fecha: '2026-10-25', texto: 'Modo libre en 10 juegos, siete duelos 1v1 nuevos y Cuatro Conchas y Batalla de Balsas contra la máquina.' },
  { fecha: '2026-10-25', texto: 'Pestañas Récords y Copa Individual (aparte del torneo): cada lunes el bot anuncia el podio de la semana.' },
  { fecha: '2026-10-25', texto: 'En vivo: sala de espera nueva, cuenta común, botón Avisar a mi rival y muerte súbita si un duelo queda empatado.' },
  { fecha: '2026-10-25', texto: 'Victorias por ausencia: si tu rival de cruce nunca entró a la web, la organización te da la victoria al cerrar el cruce.' },
  { fecha: '2026-10-25', texto: 'Subway Surfers 3.0: la pausa funciona, un deslizamiento cambia un solo carril, poder nuevo (la tabla), misiones, túneles y vallas dobles.' },
  { fecha: '2026-10-25', texto: 'Botón Reglas en todos los juegos: pausa la partida y al cerrarlo cuenta 3, 2, 1.' },
  { fecha: '2026-10-24', texto: 'Los juegos tienen nombres nuevos, y el bot de Discord usa los mismos que la web.' },
];

/** Cuánto falta para el fin del día de una fecha "AAAA-MM-DD" (23:59 de Chile). */
function cuantoFalta(hasta: string, ahora: number): string {
  const ms = Date.parse(`${hasta}T23:59:59-03:00`) - ahora;
  if (ms <= 0) return 'vence hoy';
  const h = Math.floor(ms / 36e5), d = Math.floor(h / 24);
  return d >= 1 ? `quedan ${d} ${d === 1 ? 'día' : 'días'} y ${h % 24} h` : `quedan ${h} h ${Math.floor((ms % 36e5) / 6e4)} min`;
}

export function Inicio() {
  const sesion = useSesion(), yo = sesion.usuarioId;
  const [ahora, setAhora] = useState(Date.now());
  const [mios, setMios] = useState<{ e: V.Enfrentamiento; rival: string }[] | null>(null);
  const [salas, setSalas] = useState<InfoSala[] | null>(null);
  useEffect(() => { const r = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(r); }, []);
  useEffect(() => escucharSalas(setSalas), []);
  useEffect(() => {
    if (!yo) { setMios(null); return; }
    let vigente = true;
    Promise.all([V.listarEnfrentamientos('1v1'), V.listarPersonas()]).then(([{ lista }, personas]) => {
      if (!vigente) return;
      const nombre = (id: string | null) => personas.find((p) => p.id === id)?.nombre ?? 'tu rival';
      setMios(lista.filter((e) => e.estado === 'pendiente' && (e.a_perfil === yo || e.b_perfil === yo))
        .sort((a, b) => (a.plazo ?? '9').localeCompare(b.plazo ?? '9'))
        .map((e) => ({ e, rival: nombre(e.a_perfil === yo ? e.b_perfil : e.a_perfil) })));
    }).catch(() => { if (vigente) setMios([]); });
    return () => { vigente = false; };
  }, [yo]);
  // Con la portada ya dibujada y el navegador libre, se baja el código de la isla para que entrar a ella sea rápido
  useEffect(() => {
    const precargar = () => { void import('./isla/Isla'); };
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = ric ? ric(precargar, { timeout: 8000 }) : window.setTimeout(precargar, 4000);
    return () => { if (!ric) clearTimeout(id); };
  }, []);

  const hoy = fechaChile(ahora), cruce = cruceDe(hoy), enCurso = cruce && hoy >= cruce.desde;
  return (
    <div class="pagina inicio">
      <header class="inicio-cabeza">
        <span class="sigla">Torneo de minijuegos · 21 de octubre al 28 de noviembre</span>
        <h1>{sesion.perfil?.nombre ? `Hola, ${sesion.perfil.nombre}` : 'Las Sustolimpiadas'}</h1>
      </header>

      {cruce && (
        <section class={`inicio-cruce${enCurso ? ' en-curso' : ''}`}>
          <div>
            <b>{enCurso ? `Cruce ${cruce.n} de ${CRUCES.length} en curso` : `El cruce ${cruce.n} parte el ${V.fechaCorta(cruce.desde)}`}</b>
            <span class="tenue">{enCurso ? `Hasta el ${V.fechaCorta(cruce.hasta)} a las 23:59 · ${cuantoFalta(cruce.hasta, ahora)}` : 'Los duelos aparecen apenas se sortean.'}</span>
          </div>
          <a class="boton" href="#/juegos/posiciones">Ver la tabla oficial</a>
        </section>
      )}

      <section class="bloque">
        <h2>Mis duelos pendientes</h2>
        {!yo ? <p class="tenue">Entra con Discord para ver tus duelos.</p>
          : !mios ? <p class="tenue">Buscando tus duelos…</p>
          : !mios.length ? <p class="tenue">No tienes duelos pendientes. Mientras tanto, practica en Juegos.</p>
          : (
            <ul class="inicio-duelos">
              {mios.slice(0, 6).map(({ e, rival }) => (
                <li key={e.id}>
                  <span><b>{nombreVersus(e.modo, e.juego)}</b> contra {rival}<span class="tenue chico">{e.oficial ? ` · cruce ${e.cruce ?? '-'}` : ' · amistoso'}{e.plazo ? ` · hasta el ${V.fechaCorta(e.plazo)}` : ''}</span></span>
                  <a class="boton principal" href="#/juegos/1v1">Jugar</a>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section class="bloque">
        <h2>En vivo ahora</h2>
        {!salas ? <p class="tenue">Buscando partidas…</p> : !salas.length ? <p class="tenue">Nadie está jugando en vivo en este momento.</p> : (
          <ul class="inicio-duelos">
            {salas.slice(0, 5).map((s) => (
              <li key={s.codigo}>
                <span><b>{juegoPorId(s.juego)?.nombre ?? s.juego}</b> · {s.a || '¿?'} contra {s.b || '¿?'}<span class="tenue chico"> · {s.estado === 'jugando' ? 'jugando' : s.estado === 'esperando' ? 'esperando rival' : 'terminada'} · {s.espectadores} mirando</span></span>
                <a class="boton" href={`#/juegos/mirar/${s.codigo}`}>Mirar</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav class="inicio-accesos" aria-label="Accesos">
        <a class="tarjeta" style="--tono:var(--calabaza)" href="#/juegos"><h3>Juegos</h3><p class="tenue">37 minijuegos para practicar y subir tu marca del día.</p></a>
        <a class="tarjeta" style="--tono:var(--sangre)" href="#/juegos/1v1"><h3>Mis duelos</h3><p class="tenue">Tus enfrentamientos de la liga y retos amistosos.</p></a>
        <a class="tarjeta" style="--tono:#4fd1ff" href="#/juegos/vivo"><h3>En vivo</h3><p class="tenue">Juega con alguien conectado al mismo tiempo o mira partidas.</p></a>
        <a class="tarjeta" style="--tono:var(--alga)" href="#/isla"><h3>La isla</h3><p class="tenue">El mundo 3D con los personajes de todos. Carga más lento.</p></a>
      </nav>

      <section class="bloque">
        <h2>Novedades</h2>
        <ul class="inicio-novedades">
          {NOVEDADES.slice(0, 6).map((n, i) => <li key={i}><span class="tenue chico">{V.fechaCorta(n.fecha)}</span> {n.texto}</li>)}
        </ul>
      </section>
    </div>
  );
}
