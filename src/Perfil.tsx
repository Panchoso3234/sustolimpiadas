import { useEffect, useState } from 'preact/hooks';
import { fechaChile } from './nucleo/azar';
import { supabase, useSesion } from './nucleo/supabase';
import { JUEGOS, MOTORES, juegoPorId, nombreVersus } from './juegos/catalogo';
import * as V from './juegos/duelos';
import { PUNTOS_BASE, leerPuntos, puntosVersus, type Puntos } from './juegos/puntos';
import { cargarDatos, logros, premio, vitrinas, type Logro, type Vitrina } from './juegos/progreso';
import { Firma } from './Progreso';
import { cuentaParaLaLiga } from './juegos/liga';

// Perfil de una persona: estadísticas, insignias, resumen de la semana, mejores marcas, duelos e historial.
// Todo se calcula de las marcas y enfrentamientos que ya existen; no guarda nada nuevo.

interface Marca { juego: string; puntaje: number; fecha: string; creado: string }
interface Datos { nombre: string; marcas: Marca[]; duelos: { e: V.Enfrentamiento; lado: V.Lado }[]; personas: V.Persona[]; equipos: V.Equipo[]; puntos: Puntos; logros: Logro[]; vitrina: Vitrina | null }

async function cargar(id: string): Promise<Datos> {
  const [{ data: perfil }, { data: marcas }, personas, equipos, { lista }, puntos, progreso, todas] = await Promise.all([
    supabase.from('perfiles').select('nombre').eq('id', id).maybeSingle(),
    supabase.from('marcas').select('juego,puntaje,fecha,creado').eq('perfil_id', id).order('creado', { ascending: false }).limit(2000),
    V.listarPersonas(), V.listarEquipos(), V.listarEnfrentamientos(), leerPuntos().catch(() => PUNTOS_BASE),
    cargarDatos(id), vitrinas().catch(() => new Map<string, Vitrina>()),
  ]);
  const duelos = lista.map((e) => ({ e, lado: V.ladoDe(e, id, equipos) })).filter((x): x is { e: V.Enfrentamiento; lado: V.Lado } => x.lado !== null);
  return { nombre: (perfil as { nombre: string } | null)?.nombre ?? 'Participante', marcas: (marcas as Marca[] | null) ?? [], duelos, personas, equipos, puntos, logros: logros(progreso), vitrina: todas.get(id) ?? null };
}

const corta = (f: string) => f.split('-').reverse().slice(0, 2).join('/');

export function Perfil({ id }: { id: string }) {
  const sesion = useSesion(), quien = id || sesion.usuarioId;
  const [datos, setDatos] = useState<Datos | null>(null);
  useEffect(() => { setDatos(null); if (quien) cargar(quien).then(setDatos); }, [quien]);

  if (!quien) return <div class="pagina"><div class="sigla">Perfil</div><h1>Entra con Discord para ver tu perfil</h1></div>;
  if (!datos) return <div class="pagina"><p class="tenue">Cargando…</p></div>;

  const propio = quien === sesion.usuarioId, d = datos;
  const hoy = fechaChile(Date.now()), desde = fechaChile(Date.now() - 6 * 864e5);
  const semana = d.marcas.filter((m) => m.fecha >= desde && m.fecha <= hoy);
  const mejores = new Map<string, Marca>();
  for (const m of d.marcas) if (!mejores.has(m.juego) || m.puntaje > mejores.get(m.juego)!.puntaje) mejores.set(m.juego, m);
  const cerrados = d.duelos.filter((x) => x.e.estado === 'cerrado');
  const g = cerrados.filter((x) => x.e.ganador === x.lado).length, em = cerrados.filter((x) => x.e.ganador === 'empate').length, p = cerrados.length - g - em;
  // Lo que sus duelos oficiales 1v1 le han dado a su casa (en Posiciones se suman al equipo de cada jugador)
  const casa = d.equipos.find((q) => q.miembros.includes(quien));
  // Solo duelos de la liga (oficiales desde el 21 de octubre); no jugar da 0
  const aporte = Math.round(cerrados.filter((x) => cuentaParaLaLiga(x.e) && x.e.no_jugo !== x.lado && x.e.no_jugo !== 'ambos').reduce((t, x) => t + puntosVersus(d.puntos, x.e.ganador === 'empate' ? 'empata' : x.e.ganador === x.lado ? 'gana' : 'pierde', x.e.jornada), 0) * 100) / 100;
  const duelosSemana = cerrados.filter((x) => fechaChile(Date.parse(x.e.creado)) >= desde);
  const lista = d.logros, ganadas = lista.filter((x) => x.tiene).length, pct = Math.round((ganadas / lista.length) * 100);
  const favorito = [...semana.reduce((m, x) => m.set(x.juego, (m.get(x.juego) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0];

  return (
    <div class="pagina perfil">
      <div class="sigla">{propio ? 'Mi perfil' : 'Perfil'}</div>
      <h1><Firma nombre={d.nombre} vitrina={d.vitrina} /></h1>
      {d.vitrina && <p class="tenue">Nivel <b>{d.vitrina.nivel}</b> del pase de temporada{premio('efecto', d.vitrina.efecto) ? ` · ${premio('efecto', d.vitrina.efecto)!.icono} al ganar` : ''}{propio && <> · <a href="#/progreso">Ver mi progreso</a></>}</p>}
      {casa && <p class="tenue">Casa: <b>{casa.nombre}</b></p>}
      <div class="cifras">
        <div><b>{d.marcas.length}</b><span>partidas</span></div>
        <div><b>{mejores.size}</b><span>juegos distintos</span></div>
        <div><b>{new Set(d.marcas.map((m) => m.fecha)).size}</b><span>días jugados</span></div>
        <div><b>{g}-{em}-{p}</b><span>duelos (G-E-P)</span></div>
        <div><b>{aporte}</b><span>{casa ? `pts de duelos para ${casa.nombre}` : 'pts de duelos para su casa'}</span></div>
        <div><b>{pct}%</b><span>logros ({ganadas}/{lista.length})</span></div>
      </div>

      <section class="bloque">
        <h2>Resumen de la semana</h2>
        {semana.length || duelosSemana.length
          ? <p>En los últimos 7 días: <b>{semana.length}</b> {semana.length === 1 ? 'partida' : 'partidas'} en <b>{new Set(semana.map((m) => m.juego)).size}</b> {new Set(semana.map((m) => m.juego)).size === 1 ? 'juego' : 'juegos'}
            {favorito ? <>, sobre todo <b>{juegoPorId(favorito[0])?.nombre ?? favorito[0]}</b></> : null}
            {duelosSemana.length ? <> · {duelosSemana.length} {duelosSemana.length === 1 ? 'duelo cerrado' : 'duelos cerrados'}, {duelosSemana.filter((x) => x.e.ganador === x.lado).length} ganados</> : null}.</p>
          : <p class="tenue">Sin partidas en los últimos 7 días.</p>}
      </section>

      <section class="bloque">
        <h2>Logros <span class="tenue chico">{ganadas} de {lista.length} · {pct}%</span></h2>
        <div class="pase-barra"><span style={`width:${pct}%`} /></div>
        <ul class="insignias">
          {lista.filter((x) => x.tiene).map((x) => <li key={x.id} class="tiene" title={x.como}><b>{x.icono} {x.nombre}</b><span>{x.como}</span></li>)}
        </ul>
        {!ganadas && <p class="tenue">Todavía sin logros.</p>}
        {propio && <a class="boton" href="#/progreso/logros">Ver todos mis logros</a>}
      </section>

      <section class="bloque">
        <h2>Mejores marcas</h2>
        {!mejores.size ? <p class="tenue">Todavía no hay marcas.</p> : (
          <div class="tabla-caja"><table class="tabla">
            <thead><tr><th>Juego</th><th>Mejor marca</th><th>Día</th></tr></thead>
            <tbody>{JUEGOS.filter((j) => mejores.has(j.id)).map((j) => <tr key={j.id}><td style={`border-left:4px solid ${MOTORES[j.motor].color}`}><a href={`#/juegos/${j.id}`}>{j.nombre}</a></td><td><b>{mejores.get(j.id)!.puntaje}</b> {j.unidad}</td><td>{corta(mejores.get(j.id)!.fecha)}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section class="bloque">
        <h2>Duelos</h2>
        {!d.duelos.length ? <p class="tenue">Sin enfrentamientos todavía.</p> : (
          <ul class="duelos">
            {d.duelos.slice(0, 15).map(({ e, lado }) => {
              const como = e.estado !== 'cerrado' ? '' : e.ganador === 'empate' ? 'empata' : e.ganador === lado ? 'gana' : 'pierde';
              const rival = V.nombreLado(e, lado === 'a' ? 'b' : 'a', d.personas, d.equipos);
              return (
                <li key={e.id} class={como}>
                  <a class="quienes" href={`#/juegos/duelo/${e.id}`}><b>{e.estado === 'pendiente' ? 'Pendiente' : e.estado === 'anulado' ? 'Anulado' : como === 'gana' ? 'Ganó' : como === 'empata' ? 'Empate' : 'Perdió'}</b><span>{nombreVersus(e.modo, e.juego)} contra {rival}</span></a>
                  <span class="tenue chico">{e.oficial ? `jornada ${e.jornada}` : 'amistoso'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section class="bloque">
        <h2>Historial</h2>
        {!d.marcas.length ? <p class="tenue">Todavía no hay partidas.</p> : (
          <div class="tabla-caja"><table class="tabla">
            <thead><tr><th>Día</th><th>Juego</th><th>Marca</th></tr></thead>
            <tbody>{d.marcas.slice(0, 30).map((m, i) => <tr key={i}><td>{corta(m.fecha)}</td><td>{juegoPorId(m.juego)?.nombre ?? m.juego}</td><td>{m.puntaje}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
