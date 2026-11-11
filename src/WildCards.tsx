import { useEffect, useState } from 'preact/hooks';
import { CartaWild } from './juegos/CartaWild';
import * as V from './juegos/duelos';
import { CRUCES } from './juegos/liga';
import * as W from './juegos/wcDatos';
import { CARTAS, DESDE_CRUCE, PROBABILIDADES, RAREZAS, puntosChile, type Rareza } from './juegos/wildcards';

// Página pública de las Wild Cards: qué son, cómo funcionan, las 25 cartas con sus probabilidades y el álbum de cada cruce.

const ORDEN: Rareza[] = ['comun', 'rara', 'epica', 'legendaria'];
const ABANICO: [string, Rareza][] = [['escudo', 'comun'], ['doble_nada', 'rara'], ['congelar', 'epica'], ['corona', 'legendaria']];

export function WildCards() {
  const [cartas, setCartas] = useState<W.WildCard[]>([]);
  const [ajustes, setAjustes] = useState<W.AjusteGuardado[]>([]);
  const [equipos, setEquipos] = useState<V.Equipo[]>([]);
  useEffect(() => { Promise.all([W.listarWildCards(), W.listarAjustesCartas(), V.listarEquipos()]).then(([c, a, e]) => { setCartas(c); setAjustes(a); setEquipos(e); }); }, []);
  const nombre = (id: number) => equipos.find((q) => q.id === id)?.nombre ?? `Equipo ${id}`;
  const cruces = [...new Set(cartas.map((c) => c.cruce))].sort((a, b) => b - a);
  const desde = CRUCES.find((c) => c.n === DESDE_CRUCE);

  return (
    <div class="pagina pagina-ancha wc-pagina">
      <section class="wc-portada">
        <div class="wc-abanico" aria-hidden="true">
          {ABANICO.map(([id, r]) => <CartaWild key={id} carta={id} rareza={r} tam="chica" />)}
        </div>
        <div class="wc-portada-texto">
          <h1>Wild Cards</h1>
          <p class="wc-bajada">Desde el cruce {DESDE_CRUCE}{desde ? ` (${V.fechaCorta(desde.desde)})` : ''}, cada equipo recibe una carta antes de enfrentar a su rival. Algunas suman, otras le quitan puntos al otro equipo y las legendarias pueden dar vuelta la tabla.</p>
          <p class="tenue">Los equipos de más abajo tienen más probabilidad de sacar cartas fuertes: la pelea por los 6 cupos de la final sigue abierta hasta el último cruce.</p>
        </div>
      </section>

      <h2>Cómo funciona</h2>
      <ol class="wc-pasos">
        <li><b>Se sortea.</b> Antes de cada cruce, la organización gira una ruleta por equipo. La rareza depende del puesto en la tabla y el resultado lo decide el servidor, no la ruleta.</li>
        <li><b>Boca abajo.</b> Todos ven la rareza de cada carta. Las cartas que se deciden antes de jugar se muestran al tiro; las demás quedan ocultas hasta el final del cruce (tu equipo sí ve la suya).</li>
        <li><b>Se juega.</b> Los duelos se juegan como siempre. Las cartas de decisión (elegir el juego, apostar un duelo, cambiar rivales…) se usan antes de que se juegue ese duelo.</li>
        <li><b>Se revela.</b> Al cerrar el cruce se dan vuelta todas, se suman sus puntos (por el multiplicador de la jornada) y sale el anuncio en Discord con la tabla nueva.</li>
      </ol>

      <h2>Probabilidad según tu puesto</h2>
      <div class="tabla-caja">
        <table class="tabla wc-prob">
          <thead><tr><th>Puesto</th>{ORDEN.map((r) => <th key={r} style={{ color: RAREZAS[r].color }}>{RAREZAS[r].nombre}</th>)}</tr></thead>
          <tbody>{PROBABILIDADES.map((g) => <tr key={g.desde}><td>{g.desde}.º a {g.hasta}.º</td>{ORDEN.map((r) => <td key={r}>{g[r]} %</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p class="chico tenue">Dentro de cada rareza, todas las cartas tienen la misma probabilidad. Los puntos «base» se multiplican por la jornada: ×1,5 en los cruces 7 a 9 y ×2 en los cruces 10 y 11.</p>

      {ORDEN.map((r) => (
        <section key={r} class="wc-rareza-grupo">
          <h2 style={{ color: RAREZAS[r].color }}>{RAREZAS[r].nombre}: {CARTAS.filter((c) => c.rareza === r).length} cartas</h2>
          <div class="wc-grilla">{CARTAS.filter((c) => c.rareza === r).map((c) => <CartaWild key={c.id} carta={c.id} rareza={r} />)}</div>
        </section>
      ))}

      <h2>Álbum</h2>
      {!cruces.length && <p class="tenue">Todavía no se sortea ninguna carta. Las primeras salen en el cruce {DESDE_CRUCE}.</p>}
      {cruces.map((n) => {
        const delCruce = cartas.filter((c) => c.cruce === n && c.origen == null);
        return (
          <section key={n} class="wc-album">
            <h3>Cruce {n}</h3>
            <div class="wc-album-grilla">
              {delCruce.map((c) => {
                const a = ajustes.find((x) => x.cruce === n && x.equipo_id === c.equipo_id), hijas = cartas.filter((h) => h.origen === c.id);
                return (
                  <div key={c.id} class="wc-album-item">
                    <div class="wc-album-cartas">
                      <CartaWild carta={c.carta} rareza={c.rareza} dado={c.dado} tam="chica" deFrente={!!c.carta} nota={c.anulada ? 'anulada' : undefined} />
                      {hijas.map((h) => <CartaWild key={h.id} carta={h.carta} rareza={h.rareza} tam="chica" deFrente={!!h.carta} />)}
                    </div>
                    <b>{nombre(c.equipo_id)}</b>
                    <span class={a ? (a.puntos >= 0 ? 'wc-suma' : 'wc-resta') : 'tenue chico'}>{a ? `${puntosChile(a.puntos)} pts` : c.revelada ? 'sin efecto' : 'se revela al cerrar'}</span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
