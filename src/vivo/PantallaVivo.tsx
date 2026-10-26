import { useEffect, useState } from 'preact/hooks';
import { useSesion } from '../nucleo/supabase';
import { nuevoCodigo } from './sala';
import { TABLEROS, probarTableros } from './tableros';
import { SalaTablero } from './SalaTablero';
import { SalaDuelo } from './SalaDuelo';
import { DUELOS } from './formatos';
import { probarEspejo } from './espejo';
import { JUEGOS as CATALOGO, RETIRADOS } from '../juegos/catalogo';
import { probarAsientos } from './asientos';
import * as V from '../juegos/duelos';
import { MisEnVivo } from '../juegos/PantallaVersus';
import { NOMBRES as CONTRA_MAQUINA } from './ContraMaquina';

/** Nombre de cada juego que se puede jugar en vivo (para la lista de partidas en línea). */
export const NOMBRES_VIVO: Record<string, string> = { ...Object.fromEntries(CATALOGO.map((j) => [j.id, j.nombre])), ...Object.fromEntries(Object.values(TABLEROS).map((t) => [t.id, t.nombre])) };

/** Asientos válidos: dos personas distintas y, en un oficial, justo las dos del enfrentamiento. */
export const asientosValidos = (a: unknown, fijos: [string, string] | null): a is [string, string] =>
  Array.isArray(a) && a.length === 2 && a.every((x) => typeof x === 'string') && a[0] !== a[1] && (!fijos || (fijos.includes(a[0]) && fijos.includes(a[1])));
/** En un oficial, lo guardado en el navegador vale solo si es de la ronda que el servidor dice que toca. */
export const debeReiniciar = (guardada: number, primera: number, oficial: boolean) => (oficial ? guardada !== primera : guardada < primera);

/** Pruebas de las reglas de la sala: devuelve la lista de fallas. */
export function probarSala(): string[] {
  const fallas: string[] = [], igual = (que: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) fallas.push(`${que}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  igual('oficial: ronda distinta se reinicia', debeReiniciar(3, 1, true), true);
  igual('oficial: misma ronda se conserva', debeReiniciar(2, 2, true), false);
  igual('amistoso: solo hacia adelante', debeReiniciar(3, 1, false), false);
  return fallas;
}

/** Quién soy: la cuenta de Discord, o un invitado con nombre al azar (las partidas en vivo son amistosas). */
export function identidadVivo(usuarioId: string | null, nombre: string | undefined): { id: string; nombre: string } {
  if (usuarioId) return { id: usuarioId, nombre: nombre ?? 'Participante' };
  // Solo en pruebas: "?invitado=b" da otra identidad, para jugar contra uno mismo en dos pestañas
  const prueba = import.meta.env.DEV ? new URLSearchParams(location.search).get('invitado') : null;
  if (prueba) return { id: `inv-${prueba}`, nombre: `Invitado ${prueba.toUpperCase()}` };
  try {
    let id = localStorage.getItem('susto.invitado');
    if (!id) { id = `inv-${Math.random().toString(36).slice(2, 6)}`; localStorage.setItem('susto.invitado', id); }
    return { id, nombre: `Invitado ${id.slice(4).toUpperCase()}` };
  } catch { return { id: `inv-${Math.random().toString(36).slice(2, 6)}`, nombre: 'Invitado' }; }
}

/** Datos de un enfrentamiento oficial que se juega en su sala `enf-<id>`. */
export interface Oficial {
  e: V.Enfrentamiento; personas: V.Persona[]; /** Rondas que ya abrí y que ya guardé, según el servidor. */ empezadas: number[]; jugadas: number[];
  /** Rondas que ya terminó el rival (null si la base todavía no tiene rondas_jugadas). */ rivalJugadas: number[] | null;
}
/** La ronda que toca en vivo: la primera que no terminaron los dos (así ambos llegan a la misma, sin importar lo que guardó cada navegador). */
export const rondaComun = (mias: number[], suyas: number[], total: number) => { for (let r = 1; r <= total; r++) if (!(mias.includes(r) && suyas.includes(r))) return r; return null; };

/** Sala de un enfrentamiento oficial: primero carga quiénes juegan y qué rondas faltan. */
function SalaOficial({ id, mirar }: { id: number; mirar: boolean }) {
  const sesion = useSesion();
  const [datos, setDatos] = useState<Oficial | null | 'no'>(null);
  useEffect(() => {
    if (sesion.cargando) return;
    Promise.all([V.unEnfrentamiento(id), V.listarPersonas(), V.marcasDe([id]), V.rondasJugadas(id)]).then(([e, personas, marcas, porLado]) => {
      if (!e || !e.a_perfil || !e.b_perfil || !(e.juego in TABLEROS || e.juego in DUELOS)) return setDatos('no');
      const mias = marcas.filter((m) => m.perfil_id === sesion.usuarioId), miLado = e.a_perfil === sesion.usuarioId ? 'a' : e.b_perfil === sesion.usuarioId ? 'b' : null;
      const rivalJugadas = porLado && miLado ? porLado.filter((x) => x.lado !== miLado).map((x) => x.ronda) : null;
      setDatos({ e, personas, empezadas: mias.map((m) => m.ronda), jugadas: mias.filter((m) => m.terminado).map((m) => m.ronda), rivalJugadas });
    });
  }, [id, sesion.cargando, sesion.usuarioId]);
  if (datos === null) return <p class="tenue">Cargando el enfrentamiento…</p>;
  if (datos === 'no') return <><h1>Enfrentamiento no encontrado</h1><p><a class="boton" href="#/juegos/1v1">Volver a Versus 1v1</a></p></>;
  if (datos.e.juego in DUELOS) return <SalaDuelo codigo={`enf-${id}`} mirar={mirar} oficial={datos} />;
  return datos.e.juego in TABLEROS ? <SalaTablero codigo={`enf-${id}`} mirar={mirar} oficial={datos} /> : null;
}

const SALA_VALIDA = new RegExp(`^(${[...Object.keys(TABLEROS), ...Object.keys(DUELOS)].join('|')})-[A-Z0-9]{4}$`, 'i');

export function Vivo({ codigo, mirar = false }: { codigo: string; mirar?: boolean }) {
  const [entrar, setEntrar] = useState('');
  if (/^enf-\d+$/.test(codigo)) return <SalaOficial key={codigo} id={Number(codigo.slice(4))} mirar={mirar} />;
  if (codigo && codigo.split('-')[0] in DUELOS) return <SalaDuelo key={codigo} codigo={codigo} mirar={mirar} />;
  if (codigo && codigo.split('-')[0] in TABLEROS) return <SalaTablero key={codigo} codigo={codigo} mirar={mirar} />;
  if (codigo) return <><h1>Sala no encontrada</h1><p><a class="boton" href="#/juegos/vivo">Volver al juego en vivo</a></p></>;
  const crear = (juego: string) => { location.hash = `#/juegos/vivo/${nuevoCodigo(juego)}`; };
  return (
    <>
      <h1>Juego en vivo</h1>
      <p>Partidas con otra persona conectada al mismo tiempo. Crea una sala y comparte el enlace; los dos primeros en entrar juegan y el resto puede mirar. Las salas que creas aquí son amistosas; tus enfrentamientos (los que dan puntos) están en la lista de abajo.</p>
      <div class="rejilla-juegos">
        {Object.entries(DUELOS).map(([id, formato]) => { const j = CATALOGO.find((x) => x.id === id); return j && (
          <div key={id} class="tarjeta" style="--tono:#ffe08a">
            <img class="foto" src={`${import.meta.env.BASE_URL}juegos/${id}.png`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <h3>{j.nombre}</h3>
            <p>{j.idea}</p>
            <span class="pie"><span class="premia">{formato === 'dividida' ? 'Pantalla dividida' : formato === 'turnos' ? 'Por turnos' : id === 'bloques' || id === 'bestias' ? 'Cara a cara' : 'Mismo mundo'}</span><button class="boton principal" onClick={() => crear(id)}>Crear sala</button></span>
          </div>
        ); })}
        {Object.values(TABLEROS).filter((r) => !RETIRADOS.has(r.id)).map((r) => (
          <div key={r.id} class="tarjeta" style="--tono:#ffe08a">
            <img class="foto" src={`${import.meta.env.BASE_URL}juegos/${r.id}.png`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <h3>{r.nombre}</h3>
            <p>{r.idea}</p>
            <span class="pie"><span class="premia">En vivo</span>{r.id in CONTRA_MAQUINA && <a class="boton" href={`#/juegos/maquina/${r.id}`}>Contra la máquina</a>}<button class="boton principal" onClick={() => crear(r.id)}>Crear sala</button></span>
          </div>
        ))}
      </div>
      <MisEnVivo />
      <section class="bloque">
        <h2>Entrar a una sala</h2>
        <div class="formulario">
          <label>Código de la sala<input class="texto" value={entrar} placeholder="por ejemplo conchas-K7QF" onInput={(e) => setEntrar(e.currentTarget.value.trim())} /></label>
          <button class="boton principal" disabled={!SALA_VALIDA.test(entrar)} onClick={() => { const [j, c] = entrar.split('-'); location.hash = `#/juegos/vivo/${j.toLowerCase()}-${c.toUpperCase()}`; }}>Entrar</button>
        </div>
      </section>
    </>
  );
}
// Solo en pruebas: las reglas de asientos se pueden correr desde el banco de pruebas
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__vivo = { probarAsientos, probarSala, probarTableros, probarEspejo };
