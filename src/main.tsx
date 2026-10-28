import { render, type ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './estilos.css';
import { Ajustes, Recorrido, mostrarRecorridoAlInicio } from './Ajustes';
import { Campana } from './Campana';
import { Inicio } from './Inicio';
import { entrar, salir, useSesion } from './nucleo/supabase';
import { escucharConectados, iniciarPresencia } from './nucleo/presencia';
import './nucleo/preferencias';

// Las secciones pesadas (la isla y el creador en 3D, los juegos, la arena) se descargan recién al entrar a ellas:
// así la portada abre rápido aunque la conexión sea lenta.
const cargadas = new Map<string, ComponentType<Record<string, unknown>>>();
function Seccion({ clave, cargar, props = {} }: { clave: string; cargar: () => Promise<ComponentType<Record<string, unknown>>>; props?: Record<string, unknown> }) {
  const [C, setC] = useState(() => cargadas.get(clave) ?? null);
  useEffect(() => {
    if (C) return;
    let vigente = true;
    cargar().then((c) => { cargadas.set(clave, c); if (vigente) setC(() => c); });
    return () => { vigente = false; };
  }, [clave]);
  return C ? <C {...props} /> : <div class="pagina"><p class="tenue">Cargando…</p></div>;
}
type Comp = ComponentType<Record<string, unknown>>;
const Isla = () => <Seccion clave="isla" cargar={() => import('./isla/Isla').then((m) => m.Isla as unknown as Comp)} />;
const Creador = () => <Seccion clave="creador" cargar={() => import('./personaje/Creador').then((m) => m.Creador as unknown as Comp)} />;
const Arena = () => <Seccion clave="arena" cargar={() => import('./paginas').then((m) => m.Arena as unknown as Comp)} />;
const Admin = () => <Seccion clave="admin" cargar={() => import('./paginas').then((m) => m.Admin as unknown as Comp)} />;
const Portal = (p: { sub: string; extra: string }) => <Seccion clave="portal" cargar={() => import('./juegos/Portal').then((m) => m.Portal as unknown as Comp)} props={p} />;
const Progreso = (p: { sub: string }) => <Seccion clave="progreso" cargar={() => import('./Progreso').then((m) => m.Progreso as unknown as Comp)} props={p} />;
const PanelConectados = (p: { cerrar: () => void; yo: string | null }) => <Seccion clave="conectados" cargar={() => import('./Conectados').then((m) => m.PanelConectados as unknown as Comp)} props={p} />;
const Diario = (p: { sub: string }) => <Seccion clave="diario" cargar={() => import('./Diario').then((m) => m.Diario as unknown as Comp)} props={p} />;
const Gachapon = (p: { sub: string }) => <Seccion clave="gachapon" cargar={() => import('./Gachapon').then((m) => m.Gachapon as unknown as Comp)} props={p} />;
const Perfil = (p: { id: string }) => <Seccion clave="perfil" cargar={() => import('./Perfil').then((m) => m.Perfil as unknown as Comp)} props={p} />;

// Si se publicó una versión nueva mientras la página estaba abierta, los archivos de los juegos cambian de nombre y la
// pestaña vieja ya no los encuentra ("No se pudo cargar el juego"). Se recarga sola una vez para traer la versión nueva.
window.addEventListener('vite:preloadError', (ev) => {
  try { if (Date.now() - Number(sessionStorage.getItem('susto.recarga') ?? 0) < 60000) return; sessionStorage.setItem('susto.recarga', String(Date.now())); } catch { return; }
  ev.preventDefault();
  location.reload();
});

const RUTAS = [
  { ruta: 'isla', titulo: 'Isla' },
  { ruta: 'personaje', titulo: 'Mi personaje' },
  { ruta: 'juegos', titulo: 'Juegos' },
  { ruta: 'progreso', titulo: 'Progreso' },
  { ruta: 'diario', titulo: '¡El Diario!' },
  { ruta: 'gachapon', titulo: 'Gachapón' },
  { ruta: 'arena', titulo: 'Arena' },
];

const rutaActual = () => location.hash.replace(/^#\/?/, '') || 'inicio';

function App() {
  const [ruta, setRuta] = useState(rutaActual);
  const sesion = useSesion();
  const [recorrido, setRecorrido] = useState(mostrarRecorridoAlInicio);
  // Lista de miembros (derecha): se recuerda si la dejaste abierta; la primera vez, abierta solo en pantallas anchas
  const [panel, setPanelCrudo] = useState(() => { try { const v = localStorage.getItem('susto.panelMiembros'); return v ? v === 'si' : window.innerWidth >= 1280; } catch { return false; } });
  const setPanel = (si: boolean) => { setPanelCrudo(si); try { localStorage.setItem('susto.panelMiembros', si ? 'si' : 'no'); } catch { /* sin almacenamiento */ } };
  const [enLinea, setEnLinea] = useState(0);
  useEffect(() => escucharConectados((l) => setEnLinea(l.filter((c) => c.estado === 'activo').length)), []);
  useEffect(() => { if (!sesion.cargando) iniciarPresencia(sesion.usuarioId ? { id: sesion.usuarioId, nombre: sesion.perfil?.nombre ?? 'Participante' } : null); }, [sesion.cargando, sesion.usuarioId, sesion.perfil?.nombre]);
  useEffect(() => {
    const f = () => setRuta(rutaActual());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const [seccion, sub = '', extra = ''] = ruta.split('/');
  const enlaces = sesion.perfil?.rol === 'admin' ? [...RUTAS, { ruta: 'admin', titulo: 'Admin' }] : RUTAS;

  return (
    <>
      <header class="barra">
        <a class="marca" href="#/inicio">Las Sustolimpiadas</a>
        <nav>
          {enlaces.map((e) => <a key={e.ruta} href={`#/${e.ruta}`} class={seccion === e.ruta ? 'activa' : ''} aria-current={seccion === e.ruta ? 'page' : undefined}>{e.titulo}</a>)}
          <a href="guia.html" title="Todo lo que hay que saber del torneo">Guía</a>
        </nav>
        <div class="cuenta">
          {sesion.cargando ? null : sesion.usuarioId
            ? <><Campana yo={sesion.usuarioId} /><a class="nombre" href="#/perfil" title="Mi perfil">{sesion.perfil?.nombre ?? 'Mi perfil'}</a><button class="boton" onClick={() => salir()}>Salir</button></>
            : <button class="boton principal" onClick={() => entrar()}>Entrar<span class="solo-ancho"> con Discord</span></button>}
          <button class={`boton boton-miembros${panel ? ' activa' : ''}`} aria-pressed={panel} onClick={() => setPanel(!panel)} title="Quién está conectado" aria-label={`Miembros: ${enLinea} en línea`}><i class="punto" aria-hidden="true" />{enLinea}</button>
          <a class="boton" href="#/ajustes" aria-label="Ajustes" title="Ajustes">⚙</a>
        </div>
      </header>
      <div class="cuerpo">
      <main>
        {seccion === 'personaje' ? <Creador />
          : seccion === 'juegos' ? <Portal sub={sub} extra={extra} />
          : seccion === 'arena' ? <Arena />
          : seccion === 'admin' ? <Admin />
          : seccion === 'progreso' ? <Progreso sub={sub} />
          : seccion === 'diario' ? <Diario sub={sub} />
          : seccion === 'gachapon' ? <Gachapon sub={sub} />
          : seccion === 'perfil' ? <Perfil key={sub} id={sub} />
          : seccion === 'ajustes' ? <Ajustes alVerRecorrido={() => setRecorrido(true)} />
          : seccion === 'isla' ? <Isla />
          : <Inicio />}
      </main>
      {panel && <PanelConectados cerrar={() => setPanel(false)} yo={sesion.usuarioId} />}
      </div>
      {recorrido && <Recorrido alCerrar={() => setRecorrido(false)} />}
    </>
  );
}

render(<App />, document.getElementById('app')!);
