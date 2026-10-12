import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './estilos.css';
import { Galeria } from './Galeria';
import { Isla } from './isla/Isla';
import { entrar, salir, useSesion } from './nucleo/supabase';
import { Portal } from './juegos/Portal';
import { Admin, Arena } from './paginas';
import { Creador } from './personaje/Creador';

const RUTAS = [
  { ruta: 'isla', titulo: 'Isla' },
  { ruta: 'personaje', titulo: 'Mi personaje' },
  { ruta: 'juegos', titulo: 'Juegos' },
  { ruta: 'arena', titulo: 'Arena' },
];

const rutaActual = () => location.hash.replace(/^#\/?/, '') || 'isla';

function App() {
  const [ruta, setRuta] = useState(rutaActual);
  const sesion = useSesion();
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
        </nav>
        <div class="cuenta">
          {sesion.cargando ? null : sesion.usuarioId
            ? <><span class="nombre">{sesion.perfil?.nombre ?? 'Sesión iniciada'}</span><button class="boton" onClick={() => salir()}>Salir</button></>
            : <button class="boton principal" onClick={() => entrar()}>Entrar con Discord</button>}
        </div>
      </header>
      <main>
        {seccion === 'personaje' ? <Creador />
          : seccion === 'juegos' ? <Portal sub={sub} extra={extra} />
          : seccion === 'arena' ? <Arena />
          : seccion === 'admin' ? <Admin />
          : seccion === 'modelos' ? <Galeria />
          : <Isla />}
      </main>
    </>
  );
}

render(<App />, document.getElementById('app')!);
