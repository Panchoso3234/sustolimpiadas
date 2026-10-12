import { useEffect, useState } from 'preact/hooks';
import { fotoModelo, listaModelos, type Paquete } from './nucleo/modelos';

const POR_PAGINA = 60;
const TITULOS: Record<Paquete, string> = { pueblo: 'Pueblo (Fantasy Town Kit)', naturaleza: 'Naturaleza (Nature Kit)' };

function Foto({ paquete, nombre }: { paquete: Paquete; nombre: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let vigente = true;
    setSrc('');
    fotoModelo(paquete, nombre).then((url) => { if (vigente) setSrc(url); }).catch(() => undefined);
    return () => { vigente = false; };
  }, [paquete, nombre]);
  return src ? <img src={src} alt="" width="160" height="160" /> : <div class="hueco" />;
}

/** Catálogo de los modelos descargados, para elegir cuáles van a la isla. */
export function Galeria() {
  const [lista, setLista] = useState<Record<Paquete, string[]> | null>(null);
  const [paquete, setPaquete] = useState<Paquete>('naturaleza');
  const [filtro, setFiltro] = useState('');
  const [pagina, setPagina] = useState(0);
  const [elegidos, setElegidos] = useState<string[]>([]);

  useEffect(() => { listaModelos().then(setLista).catch(() => setLista({ pueblo: [], naturaleza: [] })); }, []);
  if (!lista) return <div class="pagina"><p>Cargando modelos…</p></div>;

  const nombres = lista[paquete].filter((n) => n.toLowerCase().includes(filtro.trim().toLowerCase()));
  const paginas = Math.max(1, Math.ceil(nombres.length / POR_PAGINA)), actual = Math.min(pagina, paginas - 1);
  const visibles = nombres.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA);
  const alternar = (clave: string) => setElegidos((e) => (e.includes(clave) ? e.filter((x) => x !== clave) : [...e, clave]));

  return (
    <div class="pagina galeria">
      <div class="sigla">Modelos de artistas · Kenney · licencia CC0</div>
      <h1>Galería de modelos</h1>
      <p>Toca los que te gusten para marcarlos. Abajo se arma la lista con sus nombres: cópiala y pásasela a Claude para que los ponga en la isla.</p>
      <div class="fila">
        {(Object.keys(TITULOS) as Paquete[]).map((p) => (
          <button key={p} class={`boton ${p === paquete ? 'principal' : ''}`} onClick={() => { setPaquete(p); setPagina(0); }}>{TITULOS[p]} · {lista[p].length}</button>
        ))}
        <input id="g-filtro" class="texto" placeholder="Buscar por nombre (tree, rock, wall…)" aria-label="Buscar modelo" value={filtro} onInput={(e) => { setFiltro(e.currentTarget.value); setPagina(0); }} />
      </div>
      <div class="rejilla-modelos">
        {visibles.map((n) => {
          const clave = `${paquete}/${n}`;
          return (
            <button key={clave} class={elegidos.includes(clave) ? 'elegida' : ''} aria-pressed={elegidos.includes(clave)} onClick={() => alternar(clave)}>
              <Foto paquete={paquete} nombre={n} />
              <span>{n}</span>
            </button>
          );
        })}
      </div>
      {nombres.length === 0 && <p class="tenue">Ningún modelo calza con esa búsqueda.</p>}
      <div class="fila">
        <button class="boton" disabled={actual === 0} onClick={() => setPagina(actual - 1)}>Anterior</button>
        <span class="tenue">Página {actual + 1} de {paginas} · {nombres.length} modelos</span>
        <button class="boton" disabled={actual >= paginas - 1} onClick={() => setPagina(actual + 1)}>Siguiente</button>
      </div>
      {elegidos.length > 0 && (
        <div class="campo">
          <label class="sigla" for="g-elegidos">Marcados ({elegidos.length})</label>
          <textarea id="g-elegidos" class="texto" rows={4} readOnly value={elegidos.join(', ')} onFocus={(e) => e.currentTarget.select()} />
          <button class="boton" onClick={() => setElegidos([])}>Limpiar</button>
        </div>
      )}
    </div>
  );
}
