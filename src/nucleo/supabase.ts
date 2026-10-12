import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'preact/hooks';
import { SUPABASE_CLAVE_PUBLICA, SUPABASE_URL } from './config';

// PKCE devuelve "?code=" en vez de "#access_token=", así no choca con las rutas "#/...".
export const supabase = createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, { auth: { flowType: 'pkce' } });

export type Rol = 'admin' | 'guardian' | 'jugador';
export interface Perfil { id: string; nombre: string; avatar_url: string | null; rol: Rol }
export interface Sesion { cargando: boolean; usuarioId: string | null; perfil: Perfil | null }

let sesion: Sesion = { cargando: true, usuarioId: null, perfil: null };
const oyentes = new Set<() => void>();

function poner(nueva: Sesion) {
  sesion = nueva;
  oyentes.forEach((f) => f());
}

async function cargar(s: Session | null) {
  if (!s) return poner({ cargando: false, usuarioId: null, perfil: null });
  const { data } = await supabase.from('perfiles').select('id,nombre,avatar_url,rol').eq('id', s.user.id).maybeSingle();
  poner({ cargando: false, usuarioId: s.user.id, perfil: (data as Perfil | null) ?? null });
}

// El setTimeout evita llamar a supabase dentro de su propio aviso de sesión.
supabase.auth.onAuthStateChange((_evento, s) => { setTimeout(() => cargar(s), 0); });

export function useSesion(): Sesion {
  const [valor, setValor] = useState(sesion);
  useEffect(() => {
    const f = () => setValor(sesion);
    oyentes.add(f);
    f();
    return () => { oyentes.delete(f); };
  }, []);
  return valor;
}

export function entrar() {
  return supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.origin + location.pathname } });
}

export function salir() {
  return supabase.auth.signOut();
}
