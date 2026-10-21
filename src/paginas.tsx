import { useEffect, useState } from 'preact/hooks';
import { AjustePuntos, Enfrentamientos, Equipos, Marcas } from './juegos/Mesa';
import { Sorteo } from './juegos/Sorteo';
import { MesaLiga } from './juegos/MesaLiga';
import { Dashboard, Planificacion } from './juegos/Panel';
import { supabase, useSesion, type Perfil, type Rol } from './nucleo/supabase';

export function Arena() {
  return (
    <div class="pagina arena">
      <div class="porton" aria-hidden="true"><span /><span /></div>
      <div class="sigla">Fase 2</div>
      <h1>La Arena está sellada</h1>
      <p>El portón del volcán se abre cuando termine la liga (28 de noviembre); la fecha de la final se anuncia por Discord. Entran 12: los participantes de los 4 mejores equipos (el staff no entra) y, para completar, los mejores puntajes personales. Ahí se definen los siete premios.</p>
      <p class="tenue">Cada punto que ganes en las jornadas mejora lo que recibirás al entrar.</p>
    </div>
  );
}

const ROLES: Rol[] = ['jugador', 'guardian', 'admin'];
// En la base el staff sigue guardado como "guardian"; en pantalla se llama staff
const NOMBRE_ROL: Record<Rol, string> = { jugador: 'Jugador', guardian: 'Staff', admin: 'Organizador' };
const SECCIONES = [['dashboard', '📊 Dashboard'], ['plan', '📅 Planificación'], ['personas', 'Personas'], ['sorteo', '🎡 Sorteo de equipos'], ['liga', '🏆 Liga (cruces)'], ['equipos', 'Equipos'], ['enfrentamientos', 'Enfrentamientos'], ['marcas', 'Marcas'], ['puntos', 'Puntos']] as const;
type Seccion = (typeof SECCIONES)[number][0];

export function Admin() {
  const sesion = useSesion();
  const [seccion, setSeccion] = useState<Seccion>('dashboard');
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [personajes, setPersonajes] = useState<Record<string, { nombre: string; frase: string }>>({});
  const [porBorrar, setPorBorrar] = useState('');
  const [cuentaPorBorrar, setCuentaPorBorrar] = useState('');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const cargar = async () => {
    const { data, error: e } = await supabase.from('perfiles').select('id,nombre,avatar_url,rol').order('nombre');
    if (e) setError(e.message); else setPerfiles((data as Perfil[]) ?? []);
    const { data: lista } = await supabase.from('personajes').select('perfil_id,nombre,frase');
    setPersonajes(Object.fromEntries((lista ?? []).map((f) => [f.perfil_id as string, { nombre: f.nombre as string, frase: f.frase as string }])));
  };
  useEffect(() => { cargar(); }, []);

  // Solo en pruebas: "?sorteo" muestra el sorteo sin sesión (guardar fallará: lo protege la base)
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('panel')) return <div class="pagina pagina-ancha"><h1>Dashboard (prueba)</h1><Dashboard /><h1>Planificación (prueba)</h1><Planificacion /></div>;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('liga')) return <div class="pagina"><h1>Liga (prueba)</h1><MesaLiga /></div>;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('sorteo')) return <div class="pagina pagina-ancha"><h1>Sorteo de equipos (prueba)</h1><Sorteo /></div>;
  if (sesion.cargando) return <div class="pagina"><p>Cargando…</p></div>;
  if (sesion.perfil?.rol !== 'admin') return <div class="pagina"><h1>Sin permiso</h1><p>Esta sección es solo para el organizador.</p></div>;

  const cambiarRol = async (id: string, rol: Rol) => {
    setError('');
    const { error: e } = await supabase.from('perfiles').update({ rol }).eq('id', id);
    if (e) setError(e.message);
    cargar();
  };

  // Borrar pide dos toques: el primero arma el botón, el segundo confirma.
  const borrarPersonaje = async (id: string) => {
    if (porBorrar !== id) return setPorBorrar(id);
    setPorBorrar('');
    setError('');
    const { error: e } = await supabase.from('personajes').delete().eq('perfil_id', id);
    if (e) setError(e.message);
    cargar();
  };

  // Borrar la cuenta entera: también pide dos toques, y avisa qué se pierde
  const borrarCuenta = async (p: Perfil) => {
    if (cuentaPorBorrar !== p.id) return setCuentaPorBorrar(p.id);
    setCuentaPorBorrar('');
    setError(''); setAviso('');
    const { data, error: e } = await supabase.rpc('borrar_cuenta', { p_uid: p.id });
    if (e) setError(e.message.includes('borrar_cuenta') ? 'Falta ejecutar supabase/etapa-4.sql en Supabase.' : e.message);
    else if (data) setError(String(data));
    else setAviso(`Cuenta de ${p.nombre} borrada.`);
    cargar();
  };

  return (
    <div class={`pagina${seccion === 'sorteo' || seccion === 'plan' || seccion === 'dashboard' ? ' pagina-ancha' : ''}`}>
      <div class="sigla">Mesa de control</div>
      <nav class="modos" aria-label="Secciones de la mesa de control">
        {SECCIONES.map(([id, titulo]) => <button key={id} class={seccion === id ? 'activa' : ''} onClick={() => setSeccion(id)}>{titulo}</button>)}
      </nav>
      {seccion === 'dashboard' && <><h1>Dashboard</h1><Dashboard /></>}
      {seccion === 'plan' && <><h1>Planificación de la liga</h1><Planificacion /></>}
      {seccion === 'sorteo' && <><h1>Sorteo de equipos</h1><Sorteo /></>}
      {seccion === 'liga' && <><h1>Liga: cruces</h1><MesaLiga /></>}
      {seccion === 'equipos' && <><h1>Equipos</h1><Equipos /></>}
      {seccion === 'enfrentamientos' && <><h1>Enfrentamientos</h1><Enfrentamientos /></>}
      {seccion === 'marcas' && <><h1>Marcas del día</h1><Marcas /></>}
      {seccion === 'puntos' && <><h1>Puntos del torneo</h1><AjustePuntos /></>}
      {seccion === 'personas' && <>
      <h1>Personas inscritas</h1>
      <p>Marca como staff a quienes juegan la Fase 1 pero no pasan a la Arena ni ganan premios. Si un nombre o una frase no corresponde, puedes borrar ese personaje; la persona podrá crear otro.</p>
      <p class="chico tenue"><b>Borrar cuenta</b> elimina a la persona del torneo por completo: su perfil, personaje, marcas, equipo, vitrina y <b>los duelos donde jugaba</b> (también se le quitan al rival). Si vuelve a entrar con Discord, empieza de cero. No se puede deshacer.</p>
      {error && <p class="aviso error">{error}</p>}
      {aviso && <p class="aviso ok">{aviso}</p>}
      <div class="tabla-caja">
        <table class="tabla">
          <thead><tr><th>Discord</th><th>Rol</th><th>Personaje</th><th>Frase</th><th></th></tr></thead>
          <tbody>
            {perfiles.map((p) => {
              const pj = personajes[p.id];
              return (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>
                    <select id={`rol-${p.id}`} aria-label={`Rol de ${p.nombre}`} value={p.rol} disabled={p.id === sesion.usuarioId} onChange={(e) => cambiarRol(p.id, e.currentTarget.value as Rol)}>
                      {ROLES.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
                    </select>
                  </td>
                  <td>{pj ? pj.nombre : <span class="tenue">Sin personaje</span>}</td>
                  <td>{pj?.frase}</td>
                  <td class="acciones">
                    {pj && <button class="boton" onClick={() => borrarPersonaje(p.id)}>{porBorrar === p.id ? 'Confirmar borrado' : 'Borrar personaje'}</button>}
                    {p.id !== sesion.usuarioId && p.rol !== 'admin' && <button class={`boton${cuentaPorBorrar === p.id ? ' peligro' : ''}`} onBlur={() => setCuentaPorBorrar('')} onClick={() => borrarCuenta(p)}>{cuentaPorBorrar === p.id ? `¿Borrar a ${p.nombre}? Toca otra vez` : 'Borrar cuenta'}</button>}
                  </td>
                </tr>
              );
            })}
            {perfiles.length === 0 && <tr><td colSpan={5} class="tenue">Todavía no entra nadie.</td></tr>}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  );
}
