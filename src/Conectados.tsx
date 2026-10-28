import { useEffect, useState } from 'preact/hooks';
import * as V from './juegos/duelos';
import { escucharConectados, type Conectado } from './nucleo/presencia';
import { Carita } from './personaje/Carita';
import { Avatar, Nombre, useVitrinasGacha } from './gacha/cosmeticos';

// Panel de la derecha, como la lista de miembros de Discord: quién está en línea y qué hace, quién se ausentó
// y quiénes del torneo están desconectados.

const hace = (desde: number, ahora: number) => { const m = Math.floor((ahora - desde) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`; };

export function PanelConectados({ cerrar, yo }: { cerrar: () => void; yo: string | null }) {
  const [conectados, setConectados] = useState<Conectado[]>([]);
  const [datos, setDatos] = useState<{ personas: V.Persona[]; equipos: V.Equipo[] } | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const vit = useVitrinasGacha();
  const nivel = (id: string) => { const n = vit.get(id)?.nivel; return n ? <span class="nivel-chip" title="Nivel del pase de temporada">Nv {n}</span> : null; };
  useEffect(() => escucharConectados(setConectados), []);
  useEffect(() => { Promise.all([V.listarPersonas(), V.listarEquipos()]).then(([personas, equipos]) => setDatos({ personas, equipos })); }, []);
  useEffect(() => { const r = setInterval(() => setAhora(Date.now()), 30_000); return () => clearInterval(r); }, []);

  const equipoDe = (id: string) => datos?.equipos.find((q) => q.miembros.includes(id))?.nombre ?? null;
  const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');
  const enLinea = conectados.filter((c) => c.estado === 'activo').sort((a, b) => Number(b.actividad.juega) - Number(a.actividad.juega) || porNombre(a, b));
  const ausentes = conectados.filter((c) => c.estado === 'ausente').sort(porNombre);
  // Desconectados: los que juegan el torneo (están en un equipo) y no tienen ninguna pestaña abierta
  const ids = new Set(conectados.map((c) => c.id));
  const desconectados = (datos?.personas ?? []).filter((p) => !ids.has(p.id) && equipoDe(p.id)).sort(porNombre);

  const fila = (c: Conectado) => (
    <li key={c.id} class={`conectado ${c.estado}${c.actividad.juega ? ' juega' : ''}`}>
      <a class="conectado-cara" href={`#/perfil/${c.id}`} title={`Perfil de ${c.nombre}`}><Avatar v={vit.get(c.id)} enLinea={c.estado === 'activo'}><Carita perfil={c.id} tam={34} /></Avatar><i class="punto" aria-hidden="true" /></a>
      <div class="conectado-texto">
        <a class="conectado-nombre" href={`#/perfil/${c.id}`}><Nombre v={vit.get(c.id)} nombre={c.nombre} extra={c.id === yo ? ' (tú)' : undefined} />{nivel(c.id)}</a>
        <span class="conectado-actividad">
          {c.actividad.enlace && c.id !== yo ? <a href={c.actividad.enlace}>{c.actividad.texto}</a> : c.actividad.texto}
          {c.actividad.juega && <span class="tenue"> · {hace(c.actividad.desde, ahora)}</span>}
        </span>
      </div>
    </li>
  );
  return (
    <aside class="panel-conectados" aria-label="Personas conectadas">
      <header><b>Miembros</b><button class="boton" onClick={cerrar} aria-label="Cerrar la lista de miembros" title="Cerrar">×</button></header>
      <div class="panel-conectados-lista">
        <h4>En línea — {enLinea.length}</h4>
        {enLinea.length ? <ul>{enLinea.map(fila)}</ul> : <p class="tenue chico">Nadie por ahora.</p>}
        {ausentes.length > 0 && <><h4>Ausentes — {ausentes.length}</h4><ul>{ausentes.map(fila)}</ul></>}
        <h4>Desconectados — {datos ? desconectados.length : '…'}</h4>
        <ul>
          {desconectados.map((p) => (
            <li key={p.id} class="conectado fuera">
              <a class="conectado-cara" href={`#/perfil/${p.id}`}><Avatar v={vit.get(p.id)}><Carita perfil={p.id} tam={34} /></Avatar></a>
              <div class="conectado-texto"><a class="conectado-nombre" href={`#/perfil/${p.id}`}><Nombre v={vit.get(p.id)} nombre={p.nombre} />{nivel(p.id)}</a><span class="conectado-actividad tenue">{equipoDe(p.id)}</span></div>
            </li>
          ))}
        </ul>
        {!yo && <p class="tenue chico">Entra con Discord para aparecer en la lista.</p>}
      </div>
    </aside>
  );
}
