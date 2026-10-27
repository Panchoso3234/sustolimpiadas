import { useEffect, useState } from 'preact/hooks';
import { supabase, useSesion } from './nucleo/supabase';
import type { Edicion, Nota } from '../supabase/functions/_shared/periodista.ts';
import { CRUCES } from '../supabase/functions/_shared/calendario.ts';

// La Cuarta (el diario del torneo) en la web: el archivo de ediciones (una por cruce) y cada edición completa, con estilo de tabloide.
// Las redacta y dibuja la función "diario" de Supabase al terminar cada cruce. La organización ve también los
// borradores y puede generarlos o publicarlos desde aquí. Las reacciones de los lectores alimentan la mejora continua.

interface Fila { cruce: number; numero: number; estado: 'borrador' | 'publicado'; contenido: Edicion; imagenes: string[]; publicado: string | null }
const REACCIONES = [['buena', 'Buenísima'], ['polemica', 'Quiero más polémica'], ['numeros', 'Quiero más números'], ['floja', 'Floja']] as const;
const miles = (n: number) => Math.round(n).toLocaleString('es-CL');
const fecha = (f: string) => f.split('-').reverse().slice(0, 2).join('/');

export function Diario({ sub }: { sub: string }) {
  const sesion = useSesion(), admin = sesion.perfil?.rol === 'admin';
  const [filas, setFilas] = useState<Fila[] | null>(null), [aviso, setAviso] = useState('');
  const cargar = () => supabase.from('diario_ediciones').select('cruce,numero,estado,contenido,imagenes,publicado').order('cruce', { ascending: false }).then(({ data, error }) => { if (error) setAviso('Todavía no hay diario (falta ejecutar su SQL).'); setFilas((data ?? []) as Fila[]); });
  useEffect(() => { cargar(); }, [sesion.usuarioId]);
  const pedir = async (cruce: number, publicar: boolean) => {
    setAviso(publicar ? `Publicando la edición del cruce ${cruce}…` : `Generando el borrador del cruce ${cruce}…`);
    const { error } = await supabase.rpc('pedir_diario', { p_cruce: cruce, p_publicar: publicar });
    if (error) return setAviso(`No se pudo: ${error.message}`);
    setAviso(publicar ? 'Pedido enviado: en unos segundos sale en Discord y aquí.' : 'Pedido enviado: el borrador aparece aquí en unos segundos.');
    setTimeout(cargar, 9000);
  };
  if (filas === null) return <div class="pagina"><p class="tenue">Cargando el diario…</p></div>;
  const n = Number(sub);
  const fila = filas.find((x) => x.cruce === n);
  if (sub && fila) return <EdicionVista fila={fila} admin={admin} pedir={pedir} aviso={aviso} />;
  const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), terminados = CRUCES.filter((c) => c.hasta < hoy);
  return (
    <div class="pagina diario-portal">
      <header class="diario-mancheta"><span>LA</span> <b>CUARTA</b></header>
      <p class="diario-lema">El diario oficial de las Sustolimpiadas · una edición al terminar cada cruce · lo que pasó, sin filtro</p>
      {aviso && <p class="aviso atencion">{aviso}</p>}
      {!filas.length && <p class="tenue">La primera edición sale apenas termine el próximo cruce. Aquí vas a encontrar todas.</p>}
      <div class="diario-archivo">
        {filas.map((x) => (
          <a key={x.cruce} class={`diario-tarjeta${x.estado === 'borrador' ? ' borrador' : ''}`} href={`#/diario/${x.cruce}`}>
            {x.imagenes[0] && <img src={x.imagenes[0]} alt="" loading="lazy" />}
            <span class="sigla">Edición N.º {x.numero} · cruce {x.cruce}{x.estado === 'borrador' ? ' · BORRADOR' : ''}</span>
            <b>{x.contenido.portada.titular}</b>
          </a>
        ))}
      </div>
      {admin && (
        <section class="bloque diario-redaccion">
          <h2>Redacción (solo organización)</h2>
          <p class="tenue chico">Al terminar cada cruce, el diario sale solo a las 00:20. Aquí puedes generar un borrador para revisarlo o publicar a mano.</p>
          <div class="fila">{terminados.slice(-3).reverse().map((c) => <span key={c.n} class="fila"><button class="boton" onClick={() => pedir(c.n, false)}>Borrador cruce {c.n}</button><button class="boton principal" onClick={() => pedir(c.n, true)}>Publicar cruce {c.n}</button></span>)}</div>
        </section>
      )}
    </div>
  );
}

function Foto({ e, id, tam = 56 }: { e: Edicion; id: string; tam?: number }) {
  const p = e.personas[id];
  if (p?.avatar) return <img class="diario-foto" src={p.avatar} alt="" width={tam} height={tam} style={`width:${tam}px;height:${tam}px`} />;
  return <span class="diario-foto inicial" style={`width:${tam}px;height:${tam}px;font-size:${tam * 0.4}px`}>{(p?.nombre ?? '?').slice(0, 1)}</span>;
}
function NotaVista({ e, n, grande = false }: { e: Edicion; n: Nota; grande?: boolean }) {
  return (
    <article class={`diario-nota ${n.tipo}${grande ? ' grande' : ''}`}>
      <span class="diario-sello">{n.sello}</span>
      <div class="fila diario-fotos">{n.protagonistas.slice(0, 2).map((id) => <Foto key={id} e={e} id={id} tam={grande ? 84 : 48} />)}{n.cifra && <span class="diario-cifra">{n.cifra}</span>}</div>
      <span class="sigla">{n.seccion}</span>
      <h3>{n.titular}</h3>
      <p>{n.bajada}</p>
      {n.cuerpo && <p class="chico tenue">{n.cuerpo}</p>}
    </article>
  );
}

function EdicionVista({ fila, admin, pedir, aviso }: { fila: Fila; admin: boolean; pedir: (c: number, p: boolean) => void; aviso: string }) {
  const e = fila.contenido, nombre = (id: string) => e.personas[id]?.nombre ?? '?';
  const [grande, setGrande] = useState<string | null>(null);
  const [votos, setVotos] = useState<Record<string, number>>({}), [mio, setMio] = useState<string | null>(null);
  const sesion = useSesion();
  useEffect(() => {
    supabase.from('diario_votos').select('voto,perfil_id').eq('cruce', fila.cruce).then(({ data }) => {
      const c: Record<string, number> = {};
      for (const v of data ?? []) c[v.voto] = (c[v.voto] ?? 0) + 1;
      setVotos(c); setMio((data ?? []).find((v) => v.perfil_id === sesion.usuarioId)?.voto ?? null);
    });
  }, [fila.cruce, sesion.usuarioId]);
  const votar = async (voto: string) => {
    if (!sesion.usuarioId) return;
    const { error } = await supabase.from('diario_votos').upsert({ cruce: fila.cruce, perfil_id: sesion.usuarioId, voto });
    if (!error) { setVotos((v) => ({ ...v, ...(mio ? { [mio]: Math.max(0, (v[mio] ?? 1) - 1) } : {}), [voto]: (v[voto] ?? 0) + 1 })); setMio(voto); }
  };
  const maxJ = Math.max(1, ...e.juegosMasJugados.map((b) => b.valor));
  return (
    <div class="pagina diario">
      <div class="diario-ticker" aria-hidden="true"><div>{[...e.ticker, ...e.ticker].map((t, i) => <span key={i}>{t}</span>)}</div></div>
      <header class="diario-cabeza">
        <span>Edición N.º {e.numero} · Cruce {e.cruce}</span><span>{fecha(e.desde)} al {fecha(e.hasta)} · Jornada {e.jornada}</span>
      </header>
      <header class="diario-mancheta"><span>LA</span> <b>CUARTA</b></header>
      <p class="diario-lema">El diario oficial de las Sustolimpiadas · lo que pasó, sin filtro</p>
      {fila.estado === 'borrador' && <p class="aviso atencion">BORRADOR: solo la organización lo ve.</p>}
      {admin && <div class="fila"><button class="boton" onClick={() => pedir(e.cruce, false)}>Generar de nuevo</button><button class="boton principal" onClick={() => pedir(e.cruce, true)}>{fila.estado === 'publicado' ? 'Publicar otra vez en Discord' : 'Publicar en Discord'}</button>{aviso && <span class="tenue chico">{aviso}</span>}</div>}

      <section class="diario-portada">
        <NotaVista e={e} n={e.portada} grande />
      </section>
      <div class="diario-imagenes">{fila.imagenes.map((src) => <button key={src} class="diario-mini" onClick={() => setGrande(src)} aria-label="Ver página en grande"><img src={src} alt="Página del diario" loading="lazy" /></button>)}</div>
      {grande && <div class="diario-visor" onClick={() => setGrande(null)} role="dialog" aria-label="Página del diario"><img src={grande} alt="" /></div>}

      <h2 class="diario-seccion">Lo que pasó</h2>
      <div class="diario-notas">{e.notas.slice(1, 9).map((n, i) => <NotaVista key={i} e={e} n={n} />)}</div>

      <div class="diario-destacados">
        {e.figura && <NotaVista e={e} n={e.figura} />}
        {e.caido && <NotaVista e={e} n={e.caido} />}
        {e.polemica && <NotaVista e={e} n={e.polemica} />}
      </div>

      <h2 class="diario-seccion">Resultados del cruce</h2>
      <div class="diario-cruces">{e.cruces.map((c, i) => (
        <div key={i} class="diario-cruce">
          <div class="fila"><b class={c.ga >= c.gb ? '' : 'tenue'}>{e.equipos[c.a]}</b><span class="diario-marcador">{c.ga} - {c.gb}</span><b class={c.gb >= c.ga ? '' : 'tenue'}>{e.equipos[c.b]}</b></div>
          <ul>{c.duelos.map((d, k) => <li key={k} class="chico">{nombre(d.a)} <b>{d.res}</b> {nombre(d.b)} · <span class="tenue">{e.juegos[d.juego] ?? d.juego}</span></li>)}</ul>
          {c.bono != null && <span class="diario-bono">Bono para {e.equipos[c.bono]}</span>}
        </div>
      ))}</div>

      <h2 class="diario-seccion">Los números del cruce</h2>
      <div class="diario-cifras">{e.estadisticas.map((s, i) => <div key={i} class={`diario-ficha t${i % 3}`}><b>{s.valor}</b><span>{s.etiqueta}</span><small>{s.detalle}</small></div>)}</div>
      <div class="diario-dos">
        <div>
          <h3>Lo más jugado</h3>
          {e.juegosMasJugados.map((b) => <div key={b.etiqueta} class="diario-barra"><span>{b.etiqueta}</span><i style={`width:${(b.valor / maxJ) * 100}%`} /><b>{miles(b.valor)}</b></div>)}
        </div>
        <div>
          <h3>Récords del cruce</h3>
          <ul class="diario-lista">{e.records.map((x, i) => <li key={i}><b>{e.juegos[x.juego] ?? x.juego}</b>{x.historico && <span class="diario-chip">histórico</span>} · {nombre(x.persona)} · {miles(x.puntaje)}</li>)}</ul>
          <h3>Los mejores de la liga</h3>
          <ol class="diario-lista">{e.mejoresJugadores.map((x) => <li key={x.persona}><b>{nombre(x.persona)}</b> · {x.ganados} de {x.jugados} · {miles(x.puntos)} pts</li>)}</ol>
        </div>
      </div>

      <h2 class="diario-seccion">El termómetro</h2>
      <table class="tabla diario-tabla"><tbody>{e.termometro.map((t) => (
        <tr key={t.equipo} class={t.final ? 'zona-final' : ''}><td>{t.puesto}</td><td><b>{e.equipos[t.equipo]}</b></td><td class={t.delta > 0 ? 'sube' : t.delta < 0 ? 'baja' : 'tenue'}>{t.delta > 0 ? `▲ ${t.delta}` : t.delta < 0 ? `▼ ${-t.delta}` : '='}</td><td><b>{miles(t.puntos)}</b></td></tr>
      ))}</tbody></table>

      <blockquote class="diario-columna"><span class="sigla">Columna del editor</span><h3>{e.columna.titulo}</h3><p>{e.columna.texto}</p></blockquote>

      {e.agenda && (
        <section class="diario-agenda">
          <h2>Se viene el cruce {e.agenda.cruce} <span class="chico">({fecha(e.agenda.desde)} al {fecha(e.agenda.hasta)})</span></h2>
          <div class="fila">{e.agenda.parejas.map((p, i) => <span key={i} class={`diario-pareja${p.derbi ? ' derbi' : ''}`}>{e.equipos[p.a]} vs {e.equipos[p.b]}{p.derbi ? ' · DERBI' : ''}</span>)}</div>
        </section>
      )}

      {e.cronica && (
        <section class="diario-cronica">
          <h2 class="diario-seccion">Crónica · {e.cronica.titulo}</h2>
          <p class="diario-entrada">{e.cronica.entrada}</p>
          {e.cronica.repaso.length > 0 && <><h3>Lo que dejó el cruce {e.cruce}</h3><ul class="diario-lista">{e.cronica.repaso.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
          {e.cronica.previas.length > 0 && <h3>Lo que se viene{e.agenda ? `: cruce ${e.agenda.cruce}` : ''}</h3>}
          <div class="diario-previas">{e.cronica.previas.map((p, i) => (
            <article key={i} class={`diario-previa${p.derbi ? ' derbi' : ''}`}>
              {p.derbi && <span class="diario-sello">DERBI</span>}
              <h4>{p.titular}</h4>
              <p>{p.texto}</p>
              {p.duelos.length > 0 && <ul>{p.duelos.map((x, j) => <li key={j}><b>{nombre(x.a)}</b> vs <b>{nombre(x.b)}</b> · {e.juegos[x.juego] ?? x.juego}</li>)}</ul>}
            </article>
          ))}</div>
        </section>
      )}

      <section class="bloque diario-encuesta">
        <h2>¿Qué te pareció esta edición?</h2>
        {sesion.usuarioId ? <div class="fila">{REACCIONES.map(([k, t]) => <button key={k} class={`boton${mio === k ? ' principal' : ''}`} onClick={() => votar(k)}>{t} <span class="tenue">{votos[k] ?? 0}</span></button>)}</div> : <p class="tenue chico">Entra con Discord para opinar.</p>}
        <p class="tenue chico">Tus respuestas nos ayudan a mejorar el diario en cada edición.</p>
      </section>
      <p><a class="boton" href="#/diario">Todas las ediciones</a></p>
    </div>
  );
}
