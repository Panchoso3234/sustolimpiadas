import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../nucleo/supabase';
import { juegoPorId } from './catalogo';
import * as V from './duelos';
import { PUNTOS_BASE, leerPuntos, puntosPorPuesto, puntosVersus, type Puntos } from './puntos';

// Tabla de posiciones del torneo: suma por equipo los puntos de los tres modos.
//  · Individual: en cada jornada y cada juego vale la mejor marca del equipo (la de cualquiera de sus integrantes);
//    los equipos se ordenan por esa marca y reciben del máximo al mínimo.
//  · Versus oficial: ganar, empatar o perder. En 1v1 los puntos van al equipo de cada jugador.
// Todo se multiplica por la jornada.

interface MarcaEquipo { equipo_id: number; juego: string; jornada: number; puntaje: number }
interface Linea { equipo: V.Equipo; individual: number; versus: number; porJornada: number[]; jugados: number }

function calcular(equipos: V.Equipo[], marcas: MarcaEquipo[], duelos: V.Enfrentamiento[], p: Puntos): Linea[] {
  const lineas = new Map<number, Linea>(equipos.map((e) => [e.id, { equipo: e, individual: 0, versus: 0, porJornada: [0, 0, 0, 0], jugados: 0 }]));
  const sumar = (equipo: number | undefined, campo: 'individual' | 'versus', jornada: number, cuanto: number) => {
    const l = equipo === undefined ? undefined : lineas.get(equipo);
    if (!l || jornada < 1 || jornada > 4) return;
    l[campo] += cuanto;
    l.porJornada[jornada - 1] += cuanto;
  };

  // Individual: una tabla por (jornada, juego)
  const grupos = new Map<string, MarcaEquipo[]>();
  for (const m of marcas) { if (!juegoPorId(m.juego)) continue; const k = `${m.jornada}|${m.juego}`; grupos.set(k, [...(grupos.get(k) ?? []), m]); }
  for (const grupo of grupos.values()) {
    const orden = [...grupo].sort((a, b) => b.puntaje - a.puntaje);
    for (const m of orden) {
      const puesto = orden.findIndex((x) => x.puntaje === m.puntaje); // los empatados comparten el mejor puesto
      sumar(m.equipo_id, 'individual', m.jornada, puntosPorPuesto(p, puesto, orden.length) * (p.multiplicadores[m.jornada - 1] ?? 1));
    }
  }

  // Versus oficiales ya cerrados
  const equipoDe = (perfil: string | null) => equipos.find((e) => perfil && e.miembros.includes(perfil))?.id;
  for (const d of duelos) {
    if (!d.oficial || d.estado !== 'cerrado' || !d.ganador) continue;
    for (const lado of ['a', 'b'] as const) {
      const equipo = d.modo === '3v3' ? (lado === 'a' ? d.a_equipo : d.b_equipo) ?? undefined : equipoDe(lado === 'a' ? d.a_perfil : d.b_perfil);
      const como = d.ganador === 'empate' ? 'empata' : d.ganador === lado ? 'gana' : 'pierde';
      sumar(equipo, 'versus', d.jornada, puntosVersus(p, como, d.jornada));
      const l = equipo === undefined ? undefined : lineas.get(equipo);
      if (l) l.jugados++;
    }
  }
  return [...lineas.values()].sort((a, b) => b.individual + b.versus - (a.individual + a.versus));
}

const bonito = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-CL');

export function Posiciones() {
  const [estado, setEstado] = useState<{ lineas: Linea[]; personas: V.Persona[]; conMarcas: boolean } | null>(null);
  useEffect(() => {
    (async () => {
      await V.cerrarVencidos();
      const [equipos, personas, { lista }, puntos, marcas] = await Promise.all([
        V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos(), leerPuntos().catch(() => PUNTOS_BASE), supabase.rpc('marcas_por_equipo'),
      ]);
      setEstado({ lineas: calcular(equipos, (marcas.data as MarcaEquipo[] | null) ?? [], lista, puntos), personas, conMarcas: !marcas.error });
    })();
  }, []);

  return (
    <>
      <h1>Tabla de posiciones</h1>
      <p>Suma por equipo los puntos de los tres modos. En individual, cada jornada y cada juego cuenta la mejor marca del equipo: basta con que uno de los tres la haga. En versus suman los enfrentamientos oficiales ya cerrados.</p>
      {!estado ? <p class="tenue">Cargando…</p>
        : estado.lineas.length === 0 ? <p class="aviso atencion">Todavía no hay equipos: se sortean el viernes 16 de octubre, en La Llegada.</p>
        : (
          <>
            {!estado.conMarcas && <p class="aviso atencion">Por ahora solo se cuentan los versus: para sumar el modo individual falta ejecutar el último bloque de la base de datos.</p>}
            <div class="tabla-caja">
              <table class="tabla posiciones">
                <thead><tr><th>#</th><th>Equipo</th><th>J1</th><th>J2</th><th>J3</th><th>J4</th><th>Individual</th><th>Versus</th><th>Total</th></tr></thead>
                <tbody>
                  {estado.lineas.map((l, i) => (
                    <tr key={l.equipo.id}>
                      <td>{i + 1}</td>
                      <td><b>{l.equipo.nombre}</b><br /><span class="tenue chico">{l.equipo.miembros.map((id) => estado.personas.find((x) => x.id === id)?.nombre ?? 'Participante').join(', ') || 'Sin integrantes'}</span></td>
                      {l.porJornada.map((n, k) => <td key={k} class="tenue">{bonito(n)}</td>)}
                      <td>{bonito(l.individual)}</td>
                      <td>{bonito(l.versus)}</td>
                      <td><b class="total">{bonito(l.individual + l.versus)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="tenue chico">Las jornadas van de viernes a jueves desde el 16 de octubre. Las marcas hechas antes de esa fecha son de práctica y no suman.</p>
          </>
        )}
    </>
  );
}
