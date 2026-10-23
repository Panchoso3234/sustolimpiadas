import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './estilos.css';
import { Ajustes, Recorrido, mostrarRecorridoAlInicio } from './Ajustes';
import { Campana } from './Campana';
import { Galeria } from './Galeria';
import { Isla } from './isla/Isla';
import { entrar, salir, useSesion } from './nucleo/supabase';
import { Portal } from './juegos/Portal';
import { Admin, Arena } from './paginas';
import { Perfil } from './Perfil';
import { Progreso } from './Progreso';
import { Creador } from './personaje/Creador';
import './nucleo/preferencias';

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
  { ruta: 'arena', titulo: 'Arena' },
];

const rutaActual = () => location.hash.replace(/^#\/?/, '') || 'isla';

function App() {
  const [ruta, setRuta] = useState(rutaActual);
  const sesion = useSesion();
  const [recorrido, setRecorrido] = useState(mostrarRecorridoAlInicio);
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
        <a class="marca" href="#/isla">Las Sustolimpiadas</a>
        <nav>
          {enlaces.map((e) => <a key={e.ruta} href={`#/${e.ruta}`} class={seccion === e.ruta ? 'activa' : ''} aria-current={seccion === e.ruta ? 'page' : undefined}>{e.titulo}</a>)}
          <a href="guia.html" title="Todo lo que hay que saber del torneo">Guía</a>
        </nav>
        <div class="cuenta">
          {sesion.cargando ? null : sesion.usuarioId
            ? <><Campana yo={sesion.usuarioId} /><a class="nombre" href="#/perfil" title="Mi perfil">{sesion.perfil?.nombre ?? 'Mi perfil'}</a><button class="boton" onClick={() => salir()}>Salir</button></>
            : <button class="boton principal" onClick={() => entrar()}>Entrar<span class="solo-ancho"> con Discord</span></button>}
          <a class="boton" href="#/ajustes" aria-label="Ajustes" title="Ajustes">⚙</a>
        </div>
      </header>
      <main>
        {seccion === 'personaje' ? <Creador />
          : seccion === 'juegos' ? <Portal sub={sub} extra={extra} />
          : seccion === 'arena' ? <Arena />
          : seccion === 'admin' ? <Admin />
          : seccion === 'progreso' ? <Progreso sub={sub} />
          : seccion === 'perfil' ? <Perfil key={sub} id={sub} />
          : seccion === 'ajustes' ? <Ajustes alVerRecorrido={() => setRecorrido(true)} />
          : seccion === 'modelos' ? <Galeria />
          : <Isla />}
      </main>
      {recorrido && <Recorrido alCerrar={() => setRecorrido(false)} />}
    </>
  );
}

render(<App />, document.getElementById('app')!);
