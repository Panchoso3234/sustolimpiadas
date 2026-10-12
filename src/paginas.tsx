import { useEffect, useState } from 'preact/hooks';
import { AjustePuntos, Enfrentamientos, Equipos, Marcas } from './juegos/Mesa';
import { supabase, useSesion, type Perfil, type Rol } from './nucleo/supabase';

export function Arena() {
  return (
    <div class="pagina arena">
      <div class="porton" aria-hidden="true"><span /><span /></div>
      <div class="sigla">Fase 2</div>
      <h1>La Arena está sellada</h1>
      <p>El portón del volcán se abre la noche del viernes 13 de noviembre. Entran 12: los tres mejores equipos completos y tres cupos especiales. Ahí se definen los siete premios.</p>
      <p class="tenue">Cada punto que ganes en las jornadas mejora lo que recibirás al entrar.</p>
    </div>
  );
}

const ROLES: Rol[] = ['jugador', 'guardian', 'admin'];
// En la base el staff sigue guardado como "guardian"; en pantalla se llama staff
const NOMBRE_ROL: Record<Rol, string> = { jugador: 'Jugador', guardian: 'Staff', admin: 'Organizador' };
const SECCIONES = [['personas', 'Personas'], ['equipos', 'Equipos'], ['enfrentamientos', 'Enfrentamientos'], ['marcas', 'Marcas'], ['puntos', 'Puntos']] as const;
type Seccion = (typeof SECCIONES)[number][0];

export function Admin() {
  const sesion = useSesion();
  const [seccion, setSeccion] = useState<Seccion>('personas');
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [personajes, setPersonajes] = useState<Record<string, { nombre: string; frase: string }>>({});
  const [porBorrar, setPorBorrar] = useState('');
  const [error, setError] = useState('');

  const cargar = async () => {
    const { data, error: e } = await supabase.from('perfiles').select('id,nombre,avatar_url,rol').order('nombre');
    if (e) setError(e.message); else setPerfiles((data as Perfil[]) ?? []);
    const { data: lista } = await supabase.from('personajes').select('perfil_id,nombre,frase');
    setPersonajes(Object.fromEntries((lista ?? []).map((f) => [f.perfil_id as string, { nombre: f.nombre as string, frase: f.frase as string }])));
  };
  useEffect(() => { cargar(); }, []);

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

  return (
    <div class="pagina">
      <div class="sigla">Mesa de control</div>
      <nav class="modos" aria-label="Secciones de la mesa de control">
        {SECCIONES.map(([id, titulo]) => <button key={id} class={seccion === id ? 'activa' : ''} onClick={() => setSeccion(id)}>{titulo}</button>)}
      </nav>
      {seccion === 'equipos' && <><h1>Equipos</h1><Equipos /></>}
      {seccion === 'enfrentamientos' && <><h1>Enfrentamientos</h1><Enfrentamientos /></>}
      {seccion === 'marcas' && <><h1>Marcas del día</h1><Marcas /></>}
      {seccion === 'puntos' && <><h1>Puntos del torneo</h1><AjustePuntos /></>}
      {seccion === 'personas' && <>
      <h1>Personas inscritas</h1>
      <p>Marca como staff a quienes juegan la Fase 1 pero no pasan a la Arena ni ganan premios. Si un nombre o una frase no corresponde, puedes borrar ese personaje; la persona podrá crear otro.</p>
      {error && <p class="aviso error">{error}</p>}
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
                  <td>{pj && <button class="boton" onClick={() => borrarPersonaje(p.id)}>{porBorrar === p.id ? 'Confirmar borrado' : 'Borrar personaje'}</button>}</td>
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
