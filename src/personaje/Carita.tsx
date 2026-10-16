import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../nucleo/supabase';
import { normalizarAspecto } from './catalogo';
import { retratoVrm } from './vrm';

// Retrato chico del personaje de una persona, para las tablas: el de la galería si es un avatar anime,
// o una foto de la cabeza si lo armó pieza por pieza. Se recuerda mientras dure la visita.

const caras = new Map<string, Promise<string>>();

function caraDe(perfil: string): Promise<string> {
  let cara = caras.get(perfil);
  if (!cara) {
    cara = (async () => {
      const { data } = await supabase.from('personajes').select('apariencia').eq('perfil_id', perfil).maybeSingle();
      if (!data) return '';
      const a = normalizarAspecto(data.apariencia);
      if (a.vrm) return retratoVrm(a.vrm);
      const { foto } = await import('./miniaturas');
      return (await foto(a, 64, 'cabeza')).toDataURL();
    })().catch(() => '');
    caras.set(perfil, cara);
  }
  return cara;
}

export function Carita({ perfil, tam = 28 }: { perfil: string; tam?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let vigente = true;
    caraDe(perfil).then((s) => { if (vigente) setSrc(s); });
    return () => { vigente = false; };
  }, [perfil]);
  return src
    ? <img class="cara" src={src} alt="" width={tam} height={tam} loading="lazy" />
    : <span class="cara vacia" style={`width:${tam}px;height:${tam}px`} aria-hidden="true" />;
}
