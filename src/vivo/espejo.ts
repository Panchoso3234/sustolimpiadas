// El "espejo": cómo ve cada uno la pantalla del otro en un duelo en vivo, sin repetir el juego del rival.
// Los juegos 3D mandan una foto pequeña de su lienzo; los de mesa (hechos con HTML) mandan su HTML,
// que quien lo recibe limpia antes de mostrarlo (viene de otra persona: nada de scripts, eventos ni enlaces externos).

let lienzoChico: HTMLCanvasElement | null = null;

/** Foto (JPEG pequeño) del lienzo más grande del juego, o el HTML de su mesa. */
export function capturar(caja: HTMLElement, ancho: number): { img?: string; html?: string } | null {
  // Los juegos de mesa son HTML (su único lienzo es el personaje de la esquina): se copia la mesa
  const mesa = caja.querySelector('.mesa');
  if (mesa) return { html: mesa.outerHTML.slice(0, 80000) };
  const lienzos = [...caja.querySelectorAll('canvas')].filter((c) => c.width > 60 && c.height > 60).sort((a, b) => b.width * b.height - a.width * a.height);
  if (lienzos.length) {
    const fuente = lienzos[0];
    lienzoChico ??= document.createElement('canvas');
    lienzoChico.width = ancho;
    lienzoChico.height = Math.round((ancho * fuente.height) / fuente.width);
    const g = lienzoChico.getContext('2d');
    if (!g) return null;
    try { g.drawImage(fuente, 0, 0, lienzoChico.width, lienzoChico.height); return { img: lienzoChico.toDataURL('image/jpeg', 0.55) }; } catch { return null; }
  }
  return null;
}

// Incluye un SVG sencillo (el mapa del Cartero): figuras y texto, sin enlaces ni <use>
const ETIQUETAS = new Set(['DIV', 'SPAN', 'BUTTON', 'IMG', 'P', 'B', 'I', 'EM', 'STRONG', 'SMALL', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'LABEL', 'SECTION',
  'SVG', 'G', 'LINE', 'POLYLINE', 'POLYGON', 'PATH', 'CIRCLE', 'RECT', 'ELLIPSE', 'TEXT', 'TSPAN']);
const ATRIBUTOS = new Set(['class', 'style', 'alt', 'aria-label', 'disabled', 'hidden', 'data-cartas', 'src',
  'viewbox', 'preserveaspectratio', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'd', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'fill-opacity', 'transform', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline']);

/** Limpia el HTML de la mesa del rival: solo etiquetas y atributos inofensivos; imágenes solo del propio sitio. */
export function limpiar(html: string): HTMLElement | null {
  if (typeof html !== 'string') return null;
  const raiz = new DOMParser().parseFromString(html, 'text/html').body.firstElementChild;
  if (!(raiz instanceof HTMLElement) || raiz.tagName !== 'DIV') return null;
  const repasar = (el: Element) => {
    for (const hijo of [...el.children]) { if (!ETIQUETAS.has(hijo.tagName.toUpperCase())) hijo.remove(); else repasar(hijo); }
    for (const a of [...el.attributes]) {
      const v = a.value;
      const malo = !ATRIBUTOS.has(a.name.toLowerCase())
        // Sin direcciones externas: ni url(), ni image-set(), ni escapes de CSS (\75 rl) que las disfracen
        || /url\s*\(|image-set|image\s*\(|expression|@import|javascript:|\\/i.test(v)
        || (a.name === 'src' && (el.tagName !== 'IMG' || !/^\/(?!\/)[\w\-./%]*$/.test(v)));
      if (malo) el.removeAttribute(a.name);
    }
  };
  repasar(raiz);
  return document.importNode(raiz, true) as HTMLElement;
}

/** Pruebas del limpiador: devuelve la lista de fallas. */
export function probarEspejo(): string[] {
  const fallas: string[] = [], igual = (que: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) fallas.push(`${que}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  const x = limpiar('<div class="mesa numeros"><button class="numero" onclick="alert(1)">3</button><script>alert(2)</script><img src="/figuras/a.png" onerror="alert(3)"><img src="https://malo.com/x.png"><a href="javascript:alert(4)">x</a><span style="background:url(https://malo.com)">y</span></div>');
  igual('espejo: sin eventos ni scripts', x?.outerHTML, '<div class="mesa numeros"><button class="numero">3</button><img src="/figuras/a.png"><img><span>y</span></div>');
  const svg = limpiar('<div><svg viewBox="0 0 10 10"><line x1="0" y1="0" x2="5" y2="5" stroke="red"></line><use href="#x"></use><circle r="2" fill="url(https://malo.com)" onclick="x()"></circle></svg></div>');
  igual('espejo: svg sencillo sí, enlaces no', svg?.outerHTML, '<div><svg viewBox="0 0 10 10"><line x1="0" y1="0" x2="5" y2="5" stroke="red"></line><circle r="2"></circle></svg></div>');
  igual('espejo: estilos con escapes no pasan', limpiar('<div><span style="background:\\75 rl(https://malo.com)">z</span><span style="background:image-set(\'https://malo.com\')">w</span></div>')?.outerHTML, '<div><span>z</span><span>w</span></div>');
  igual('espejo: la raíz debe ser un div', limpiar('<img src=x onerror=alert(1)>'), null);
  return fallas;
}
