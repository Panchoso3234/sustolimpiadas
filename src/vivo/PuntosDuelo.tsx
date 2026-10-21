import { useEffect, useState } from 'preact/hooks';
import * as V from '../juegos/duelos';
import { cuentaParaLaLiga } from '../juegos/liga';
import { leerPuntos, puntosVersus } from '../juegos/puntos';

// Al terminar un enfrentamiento oficial: cuántos puntos del torneo se lleva cada jugador y para qué casa.
// El servidor cierra el enfrentamiento cuando los dos guardaron su resultado; se espera a que eso pase.
export function PuntosDuelo({ id }: { id: number }) {
  const [texto, setTexto] = useState<string[] | null>(null);
  useEffect(() => {
    let vigente = true, intentos = 0;
    const mirar = async () => {
      const e = await V.unEnfrentamiento(id);
      if (!vigente) return;
      if (!e || e.estado !== 'cerrado' || !e.ganador) { if (++intentos < 30) setTimeout(mirar, 4000); return; }
      if (!e.oficial) return setTexto(['Amistoso: no suma puntos del torneo.']);
      if (!cuentaParaLaLiga(e)) return setTexto(['Duelo de prueba (anterior al inicio de la liga): no suma puntos.']);
      const [p, personas, equipos] = await Promise.all([leerPuntos(), V.listarPersonas(), V.listarEquipos()]);
      if (!vigente) return;
      setTexto((['a', 'b'] as V.Lado[]).map((l) => {
        const perfil = l === 'a' ? e.a_perfil : e.b_perfil, como = e.ganador === 'empate' ? 'empata' : e.ganador === l ? 'gana' : 'pierde';
        const nombre = V.nombreLado(e, l, personas, equipos), casa = equipos.find((q) => perfil && q.miembros.includes(perfil))?.nombre;
        if (e.no_jugo === l || e.no_jugo === 'ambos') return `${nombre} no jugó: 0 puntos`;
        const pts = puntosVersus(p, como, e.jornada);
        return `+${pts} puntos para ${nombre}${casa ? ` y para su equipo, ${casa}` : ' (no tiene equipo: no suman a la tabla)'}`;
      }));
    };
    mirar();
    return () => { vigente = false; };
  }, [id]);
  if (!texto) return <p class="tenue chico">Cuando los dos resultados estén guardados, aquí verás los puntos del torneo.</p>;
  return <ul class="duelo-puntos">{texto.map((t) => <li key={t}>{t}</li>)}</ul>;
}
