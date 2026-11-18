import { useEffect } from 'preact/hooks';

/** Mientras `activo`, el elemento con la clase `enfocada` tapa todo el sitio en celulares y tablets (ver `.enfocada`
 *  en estilos.css). Es la pantalla completa de los iPhone: Safari no la permite en páginas, solo en videos. */
export function usarEnfocado(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    document.body.classList.add('enfocado');
    return () => document.body.classList.remove('enfocado');
  }, [activo]);
}
