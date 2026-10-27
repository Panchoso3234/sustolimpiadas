import { useEffect, useState } from 'preact/hooks';
import { supabase, useSesion } from './nucleo/supabase';
import type { Edicion, Nota } from '../supabase/functions/_shared/periodista.ts';
import { CRUCES, JORNADAS } from './juegos/liga';
import { diarioLeido, marcarDiario } from './nucleo/preferencias';

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
  const cargar = () => supabase.from('diario_ediciones').select('cruce,numero,estado,contenido,imagenes,publicado').order('cruce', { ascending: false }).then(({ data, error }) => { if (error && admin) setAviso('Todavía no hay diario (falta ejecutar su SQL).'); setFilas((data ?? []) as Fila[]); });
  useEffect(() => { cargar(); }, [sesion.usuarioId]);
  const pedir = async (cruce: number, publicar: boolean) => {
    setAviso(publicar ? `Publicando la edición del cruce ${cruce}…` : `Generando el borrador del cruce ${cruce}…`);
    const { error } = await supabase.rpc('pedir_diario', { p_cruce: cruce, p_publicar: publicar });
    if (error) return setAviso(`No se pudo: ${error.message}`);
    setAviso(publicar ? 'Pedido enviado: en unos segundos sale en Discord y aquí.' : 'Pedido enviado: el borrador aparece aquí en unos segundos.');
    setTimeout(cargar, 9000);
  };
  if (filas === null) return <div class="pagina"><p class="tenue">Cargando el diario…</p></div>;
  const fila = /^\d+$/.test(sub) ? filas.find((x) => x.cruce === Number(sub)) : undefined;
  if (fila) {
    // Para leer de corrido: la edición anterior y la siguiente (en orden de cruce)
    const orden = [...filas].sort((a, b) => a.cruce - b.cruce), i = orden.indexOf(fila);
    return <EdicionVista fila={fila} admin={admin} pedir={pedir} aviso={aviso} anterior={orden[i - 1]?.cruce ?? null} siguiente={orden[i + 1]?.cruce ?? null} />;
  }
  const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), terminados = CRUCES.filter((c) => c.hasta < hoy);
  // Las jornadas que ya empezaron; se abre la pedida en la ruta (#/diario/j2) o la última con ediciones
  const jornadas = JORNADAS.filter((j) => j.desde <= hoy || filas.some((x) => j.cruces.includes(x.cruce)));
  const pedida = /^j\d$/.test(sub) ? Number(sub.slice(1)) : null;
  const conEdiciones = jornadas.filter((j) => filas.some((x) => j.cruces.includes(x.cruce)));
  const elegida = jornadas.find((j) => j.n === pedida) ?? conEdiciones[conEdiciones.length - 1] ?? jornadas[jornadas.length - 1] ?? JORNADAS[0];
  const leidas = diarioLeido(), deLaJornada = filas.filter((x) => elegida.cruces.includes(x.cruce)).sort((a, b) => a.cruce - b.cruce);
  return (
    <div class="pagina diario-portal">
      <header class="diario-mancheta"><span>¡EL</span> <b>DIARIO!</b></header>
      <p class="diario-lema">Las ediciones de La Cuarta, jornada por jornada · una al terminar cada cruce · lo que pasó, sin filtro</p>
      {aviso && <p class="aviso atencion">{aviso}</p>}
      <nav class="diario-jornadas" aria-label="Jornadas">
        {jornadas.map((j) => {
          const nuevas = filas.filter((x) => j.cruces.includes(x.cruce) && x.estado === 'publicado' && !leidas.includes(x.cruce)).length;
          return <a key={j.n} class={`diario-jornada${j === elegida ? ' activa' : ''}`} href={`#/diario/j${j.n}`} aria-current={j === elegida ? 'page' : undefined}>Jornada {j.n}{nuevas > 0 && <i class="globo">{nuevas}</i>}</a>;
        })}
      </nav>
      <h2 class="diario-seccion">Jornada {elegida.n} <span class="chico tenue">· del {fecha(elegida.desde)} al {fecha(elegida.hasta)} · cruces {elegida.cruces.join(', ')}</span></h2>
      {!deLaJornada.length && <p class="tenue">Todavía no hay ediciones en esta jornada. Sale una apenas termine cada cruce: {elegida.cruces.map((c) => `cruce ${c}`).join(', ')}.</p>}
      <div class="diario-archivo">
        {deLaJornada.map((x) => (
          <a key={x.cruce} class={`diario-tarjeta${x.estado === 'borrador' ? ' borrador' : ''}`} href={`#/diario/${x.cruce}`}>
            {x.estado === 'publicado' && !leidas.includes(x.cruce) && <span class="diario-sello">NUEVA</span>}
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

const PAGINAS: Record<string, string> = { portada: 'Portada', resultados: 'Resultados', estadisticas: 'Estadísticas', tabla: 'La tabla', cronica: 'Crónica' };

function EdicionVista({ fila, admin, pedir, aviso, anterior, siguiente }: { fila: Fila; admin: boolean; pedir: (c: number, p: boolean) => void; aviso: string; anterior: number | null; siguiente: number | null }) {
  const e = fila.contenido, nombre = (id: string) => e.personas[id]?.nombre ?? '?';
  const [copiado, setCopiado] = useState(false);
  useEffect(() => { if (fila.estado === 'publicado') marcarDiario(fila.cruce); window.scrollTo(0, 0); }, [fila.cruce]);
  const copiar = () => navigator.clipboard?.writeText(location.href).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }).catch(() => undefined);
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
      {!fila.imagenes.length && <header class="diario-mancheta"><span>LA</span> <b>CUARTA</b></header>}
      {fila.estado === 'borrador' && <p class="aviso atencion">BORRADOR: solo la organización lo ve.</p>}
      {admin && <div class="fila"><button class="boton" onClick={() => pedir(e.cruce, false)}>Generar de nuevo</button><button class="boton principal" onClick={() => pedir(e.cruce, true)}>{fila.estado === 'publicado' ? 'Publicar otra vez en Discord' : 'Publicar en Discord'}</button>{aviso && <span class="tenue chico">{aviso}</span>}</div>}

      {/* La edición se lee de corrido: las páginas una debajo de la otra, como una tira */}
      {fila.imagenes.length > 0 && (
        <div class="diario-tira">
          {fila.imagenes.map((src, i) => {
            const pagina = src.split('/').pop()!.split('.')[0];
            return <img key={src} src={src} loading={i ? 'lazy' : 'eager'} width={1080} height={1350} alt={i === 0 ? `Portada de La Cuarta, cruce ${e.cruce}: ${e.portada.titular}` : `La Cuarta, cruce ${e.cruce}: ${PAGINAS[pagina] ?? 'página'}`} />;
          })}
        </div>
      )}

      <details class="diario-texto" open={!fila.imagenes.length}>
      <summary>Leer la edición en texto (con todos los duelos y estadísticas)</summary>
      <section class="diario-portada">
        <NotaVista e={e} n={e.portada} grande />
      </section>

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

      {e.tsukibet && (
        <section class="diario-columna">
          <span class="sigla">TSUKIBET del cruce {e.cruce}</span>
          <h3>{e.tsukibet.plenos.length ? `Pleno para ${e.tsukibet.plenos.map(nombre).join(', ')}` : 'Nadie hizo pleno'}</h3>
          <p>{e.tsukibet.participantes} personas pronosticaron. <a href="#/progreso/tsukibet">Ver la tabla completa</a></p>
          <ol class="diario-lista">{e.tsukibet.tabla.map((t) => <li key={t.persona}><b>{nombre(t.persona)}</b> · {t.puntos} pts · {t.aciertos} aciertos</li>)}</ol>
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
      </details>

      <section class="bloque diario-encuesta">
        <h2>¿Qué te pareció esta edición?</h2>
        {sesion.usuarioId ? <div class="fila">{REACCIONES.map(([k, t]) => <button key={k} class={`boton${mio === k ? ' principal' : ''}`} onClick={() => votar(k)}>{t} <span class="tenue">{votos[k] ?? 0}</span></button>)}</div> : <p class="tenue chico">Entra con Discord para opinar.</p>}
        <p class="tenue chico">Tus respuestas nos ayudan a mejorar el diario en cada edición.</p>
      </section>
      <nav class="fila diario-pasar" aria-label="Otras ediciones">
        {anterior !== null && <a class="boton" href={`#/diario/${anterior}`}>← Edición del cruce {anterior}</a>}
        <a class="boton" href={`#/diario/j${JORNADAS.find((j) => j.cruces.includes(e.cruce))?.n ?? 1}`}>Volver a la jornada</a>
        <button class="boton" onClick={copiar}>{copiado ? 'Enlace copiado' : 'Copiar enlace'}</button>
        {siguiente !== null && <a class="boton principal" href={`#/diario/${siguiente}`}>Edición del cruce {siguiente} →</a>}
      </nav>
    </div>
  );
}
