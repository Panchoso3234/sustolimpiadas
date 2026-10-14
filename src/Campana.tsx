import { useEffect, useRef, useState } from 'preact/hooks';
import { fechaChile } from './nucleo/azar';
import { avisosVistos, guardarPuestos, marcarAvisos, puestosVistos } from './nucleo/preferencias';
import { JUEGOS, nombreVersus } from './juegos/catalogo';
import * as V from './juegos/duelos';
import { marcaLocal, tablaDelDia } from './juegos/marcas';

// Campana de avisos: retos recibidos, plazos por vencer, resultados, si alguien te superó en la tabla de hoy
// y el resumen de la semana. Se calcula con lo que ya hay en la base; lo leído se recuerda en este navegador.

interface Aviso { clave: string; texto: string; enlace: string }

async function calcular(yo: string): Promise<Aviso[]> {
  const hoy = fechaChile(Date.now()), manana = fechaChile(Date.now() + 864e5);
  const [equipos, personas, { lista }] = await Promise.all([V.listarEquipos(), V.listarPersonas(), V.listarEnfrentamientos()]);
  const mios = lista.map((e) => ({ e, lado: V.ladoDe(e, yo, equipos) })).filter((x): x is { e: V.Enfrentamiento; lado: V.Lado } => x.lado !== null);
  const pendientes = mios.filter((x) => x.e.estado === 'pendiente');
  const marcas = await V.marcasDe(pendientes.map((x) => x.e.id));
  const rival = (e: V.Enfrentamiento, lado: V.Lado) => V.nombreLado(e, lado === 'a' ? 'b' : 'a', personas, equipos);
  const avisos: Aviso[] = [];

  for (const { e, lado } of pendientes) {
    const hechas = marcas.filter((m) => m.enfrentamiento_id === e.id && m.perfil_id === yo && m.terminado).length;
    if (hechas >= (e.modo === '1v1' ? e.rondas : 1)) continue;
    const enlace = `#/juegos/duelo/${e.id}`;
    if (e.plazo && e.plazo <= manana) avisos.push({ clave: `plazo-${e.id}-${e.plazo}`, texto: `Vence ${e.plazo <= hoy ? 'hoy' : 'mañana'}: ${nombreVersus(e.modo, e.juego)} contra ${rival(e, lado)}`, enlace });
    avisos.push({ clave: `reto-${e.id}`, texto: `${e.oficial ? 'Enfrentamiento oficial' : e.creado_por === yo ? 'Tu reto' : 'Te retaron'}: ${nombreVersus(e.modo, e.juego)} contra ${rival(e, lado)}`, enlace });
  }
  for (const { e, lado } of mios.filter((x) => x.e.estado === 'cerrado').slice(0, 10)) {
    const como = e.ganador === 'empate' ? 'Empataste' : e.ganador === lado ? 'Ganaste' : 'Perdiste';
    avisos.push({ clave: `fin-${e.id}`, texto: `${como} ${nombreVersus(e.modo, e.juego)} contra ${rival(e, lado)}`, enlace: `#/juegos/duelo/${e.id}` });
  }

  // ¿Alguien te superó hoy? Solo en los juegos que jugaste hoy en este navegador
  const puestos = puestosVistos(), nuevos: Record<string, number> = {};
  for (const j of JUEGOS.filter((x) => x.listo && marcaLocal(x.id, hoy))) {
    const { filas } = await tablaDelDia(j.id, hoy);
    const puesto = filas.findIndex((f) => f.perfil === yo);
    if (puesto < 0) continue;
    const clave = `${j.id}|${hoy}`, antes = puestos[clave];
    if (antes !== undefined && puesto > antes) avisos.push({ clave: `superado-${clave}-${puesto}`, texto: `Te superaron en ${j.nombre}: ahora vas ${puesto + 1}° de ${filas.length}`, enlace: `#/juegos/${j.id}` });
    nuevos[clave] = puesto;
  }
  guardarPuestos(nuevos);

  // Resumen de la semana: uno por jornada (las jornadas cambian los viernes)
  const semana = Math.floor((Date.parse(hoy) - Date.parse('2026-10-16')) / (7 * 864e5));
  avisos.push({ clave: `semana-${semana}`, texto: 'Tu resumen de la semana está listo', enlace: '#/perfil' });
  return avisos;
}

export function Campana({ yo }: { yo: string }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [vistos, setVistos] = useState(avisosVistos);
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let vigente = true;
    const refrescar = () => calcular(yo).then((a) => { if (vigente) setAvisos(a); }).catch(() => undefined);
    refrescar();
    const reloj = setInterval(refrescar, 90_000);
    window.addEventListener('hashchange', refrescar);
    return () => { vigente = false; clearInterval(reloj); window.removeEventListener('hashchange', refrescar); };
  }, [yo]);
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierta(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierta]);

  const nuevos = avisos.filter((a) => !vistos.includes(a.clave)).length;
  const leer = () => { marcarAvisos(avisos.map((a) => a.clave)); setVistos(avisosVistos()); };
  return (
    <div class="campana" ref={caja}>
      <button class="boton" aria-expanded={abierta} aria-label={`Avisos${nuevos ? `: ${nuevos} nuevos` : ''}`} onClick={() => { if (abierta) leer(); setAbierta(!abierta); }}>
        🔔{nuevos > 0 && <i class="globo">{nuevos}</i>}
      </button>
      {abierta && (
        <div class="campana-lista" role="dialog" aria-label="Avisos">
          {!avisos.length ? <p class="tenue chico">Sin avisos por ahora.</p> : (
            <ul>
              {avisos.map((a) => (
                <li key={a.clave} class={vistos.includes(a.clave) ? '' : 'nuevo'}>
                  <a href={a.enlace} onClick={() => { leer(); setAbierta(false); }}>{a.texto}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
