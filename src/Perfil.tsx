import { useEffect, useState } from 'preact/hooks';
import { fechaChile, horaChile } from './nucleo/azar';
import { supabase, useSesion } from './nucleo/supabase';
import { JUEGOS, MOTORES, ORDEN_MOTORES, juegoPorId, nombreVersus } from './juegos/catalogo';
import * as V from './juegos/duelos';

// Perfil de una persona: estadísticas, insignias, resumen de la semana, mejores marcas, duelos e historial.
// Todo se calcula de las marcas y enfrentamientos que ya existen; no guarda nada nuevo.

interface Marca { juego: string; puntaje: number; fecha: string; creado: string }
interface Datos { nombre: string; marcas: Marca[]; duelos: { e: V.Enfrentamiento; lado: V.Lado }[]; personas: V.Persona[]; equipos: V.Equipo[] }

async function cargar(id: string): Promise<Datos> {
  const [{ data: perfil }, { data: marcas }, personas, equipos, { lista }] = await Promise.all([
    supabase.from('perfiles').select('nombre').eq('id', id).maybeSingle(),
    supabase.from('marcas').select('juego,puntaje,fecha,creado').eq('perfil_id', id).order('creado', { ascending: false }).limit(2000),
    V.listarPersonas(), V.listarEquipos(), V.listarEnfrentamientos(),
  ]);
  const duelos = lista.map((e) => ({ e, lado: V.ladoDe(e, id, equipos) })).filter((x): x is { e: V.Enfrentamiento; lado: V.Lado } => x.lado !== null);
  return { nombre: (perfil as { nombre: string } | null)?.nombre ?? 'Participante', marcas: (marcas as Marca[] | null) ?? [], duelos, personas, equipos };
}

interface Insignia { nombre: string; como: string; tiene: boolean }

function insignias(d: Datos): Insignia[] {
  const juegos = new Set(d.marcas.map((m) => m.juego)), dias = new Set(d.marcas.map((m) => m.fecha));
  const porDia = new Map<string, number>();
  for (const m of d.marcas) porDia.set(m.fecha, (porDia.get(m.fecha) ?? 0) + 1);
  const motores = new Set([...juegos].map((j) => juegoPorId(j)?.motor).filter(Boolean));
  const victorias = d.duelos.filter((x) => x.e.estado === 'cerrado' && x.e.ganador === x.lado).length;
  const abiertos = JUEGOS.filter((j) => j.listo).length;
  const horas = d.marcas.map((m) => horaChile(Date.parse(m.creado)));
  return [
    { nombre: 'Primer paso', como: 'Juega tu primera partida', tiene: d.marcas.length > 0 },
    { nombre: 'Constante', como: 'Juega en 5 días distintos', tiene: dias.size >= 5 },
    { nombre: 'Explorador', como: 'Prueba 10 juegos distintos', tiene: juegos.size >= 10 },
    { nombre: 'Todoterreno', como: 'Juega al menos un juego de cada tipo', tiene: ORDEN_MOTORES.every((m) => motores.has(m)) },
    { nombre: 'Coleccionista', como: `Juega los ${abiertos} juegos abiertos`, tiene: juegos.size >= abiertos },
    { nombre: 'Maratón', como: 'Juega 20 partidas en un mismo día', tiene: [...porDia.values()].some((n) => n >= 20) },
    { nombre: 'Duelista', como: 'Gana un enfrentamiento', tiene: victorias >= 1 },
    { nombre: 'Campeón de duelos', como: 'Gana 5 enfrentamientos', tiene: victorias >= 5 },
    { nombre: 'Madrugador', como: 'Juega antes de las 8 de la mañana', tiene: horas.some((h) => h >= 5 && h < 8) },
    { nombre: 'Noctámbulo', como: 'Juega pasada la medianoche', tiene: horas.some((h) => h < 4) },
  ];
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
  const duelosSemana = cerrados.filter((x) => fechaChile(Date.parse(x.e.creado)) >= desde);
  const lista = insignias(d), ganadas = lista.filter((x) => x.tiene).length;
  const favorito = [...semana.reduce((m, x) => m.set(x.juego, (m.get(x.juego) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0];

  return (
    <div class="pagina perfil">
      <div class="sigla">{propio ? 'Mi perfil' : 'Perfil'}</div>
      <h1>{d.nombre}</h1>
      <div class="cifras">
        <div><b>{d.marcas.length}</b><span>partidas</span></div>
        <div><b>{mejores.size}</b><span>juegos distintos</span></div>
        <div><b>{new Set(d.marcas.map((m) => m.fecha)).size}</b><span>días jugados</span></div>
        <div><b>{g}-{em}-{p}</b><span>duelos (G-E-P)</span></div>
        <div><b>{ganadas}/{lista.length}</b><span>insignias</span></div>
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
        <h2>Insignias</h2>
        <ul class="insignias">
          {lista.map((x) => <li key={x.nombre} class={x.tiene ? 'tiene' : ''} title={x.como}><b>{x.tiene ? '★' : '☆'} {x.nombre}</b><span>{x.como}</span></li>)}
        </ul>
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
