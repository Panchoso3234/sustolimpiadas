import { useEffect, useState } from 'preact/hooks';
import { CartaWild } from './juegos/CartaWild';
import * as V from './juegos/duelos';
import { CRUCES } from './juegos/liga';
import * as W from './juegos/wcDatos';
import { CARTAS, DESDE_CRUCE, PROBABILIDADES, RAREZAS, TECHO, puntosChile, type Rareza } from './juegos/wildcards';

// Pestaña Wild Cards (Juegos → Wild Cards): qué son, qué significa «base», techos, probabilidades, las 64 cartas con
// filtros, preguntas frecuentes y el álbum de cada cruce. Misma estructura que el PDF «Wild Cards 2.0» aprobado por Pancho.

const ORDEN: Rareza[] = ['comun', 'rara', 'epica', 'legendaria'];
const ABANICO: [string, Rareza][] = [['hinchada', 'comun'], ['iman', 'rara'], ['estrellas', 'epica'], ['leyenda', 'legendaria']];
type FiltroTipo = 'todas' | 'auto' | 'decision';

const PREGUNTAS: [string, string][] = [
  ['¿Cuándo recibe mi equipo su carta?', 'Al empezar cada cruce, desde el cruce 8. La organización gira una ruleta por equipo en la Mesa de control y a todos los integrantes les llega un aviso en la campana.'],
  ['¿Quién decide qué carta sale?', 'El servidor, al azar. La ruleta de la web solo muestra lo que ya salió y no se puede volver a girar. Primero se sortea la rareza según el puesto del equipo en la tabla, y después una carta de esa rareza (todas tienen la misma probabilidad).'],
  ['¿El otro equipo ve mi carta?', 'Todos ven la rareza (el color). El nombre solo se ve en las cartas de decisión, porque se usan antes de jugar. Las demás quedan boca abajo hasta que se cierra el cruce; tu equipo sí ve la suya.'],
  ['¿Qué es una carta de decisión?', 'Una carta que se usa antes de jugar: elegir el juego de un duelo, apostar uno o dos duelos, repetir una ronda o reordenar quién juega contra quién. Avísale a la organización qué quiere hacer tu equipo, porque se aplica desde la Mesa de control antes de que se juegue ese duelo.'],
  ['¿Qué significa «+4 base»?', 'Que la carta suma 4 puntos antes de aplicar el multiplicador de la jornada. En la Jornada 3 (×1,5) esos 4 se vuelven 6 en la tabla; en la Jornada 4 (×2), 8. Más abajo hay un ejemplo completo.'],
  ['¿Y las cartas con ×1,25 o ×1,3?', 'Multiplican todos los puntos base del equipo en ese cruce (los de sus duelos y los de otras cartas) y después se aplica la jornada. Los dos multiplicadores se multiplican entre sí; no se suman.'],
  ['¿Puede una carta bajar mis puntos?', 'Solo tres cartas le quitan puntos al rival: Trampa, Contraataque y Agujero Negro. Y Doble o Nada hace que el duelo apostado valga 0 si se pierde. Aun así, ningún equipo baja de 0 puntos en un cruce por culpa de una carta.'],
  ['¿Qué pasa si no juego mi duelo?', 'Ese duelo cuenta como no jugado (0 puntos) y las cartas que premian derrotas no lo cuentan como derrota. Tres Mosqueteros, por ejemplo, exige que los tres jugadores jueguen.'],
  ['¿Cómo se combinan dos cartas?', 'Con Doble Carta, Ruleta Rusa o Mano de Dios un equipo puede tener más de una, y se aplican todas. El orden es fijo: Eclipse, luego Congelar, después los puntos de cada carta, los multiplicadores, los robos del rival y, al final, el mínimo de 0 y el multiplicador de la jornada.'],
  ['¿Qué hacen Congelar y Eclipse?', 'Congelar anula la carta del rival, salvo que sea legendaria. Eclipse es legendaria: anula todas las cartas del rival, también las legendarias, y además suma +12 base. Si los dos equipos tienen el mismo, se anulan entre sí.'],
  ['¿Cuándo se ven los puntos?', 'Cuando se cierran todos los duelos del cruce, la organización revela las cartas: se dan vuelta, se suman a la tabla oficial (columna 🃏) y sale el anuncio en Discord con el detalle de cada equipo.'],
  ['¿Por qué los de abajo sacan mejores cartas?', 'Para que la pelea por los 6 cupos de la Arena siga abierta hasta el final. Del puesto 9 al 12 la legendaria sale un 28 % de las veces; en los puestos 1 y 2, solo un 2 %.'],
];

export function WildCards() {
  const [cartas, setCartas] = useState<W.WildCard[]>([]);
  const [ajustes, setAjustes] = useState<W.AjusteGuardado[]>([]);
  const [equipos, setEquipos] = useState<V.Equipo[]>([]);
  const [rareza, setRareza] = useState<Rareza | 'todas'>('todas');
  const [tipo, setTipo] = useState<FiltroTipo>('todas');
  const [buscar, setBuscar] = useState('');
  useEffect(() => { Promise.all([W.listarWildCards(), W.listarAjustesCartas(), V.listarEquipos()]).then(([c, a, e]) => { setCartas(c); setAjustes(a); setEquipos(e); }); }, []);
  const nombre = (id: number) => equipos.find((q) => q.id === id)?.nombre ?? `Equipo ${id}`;
  const cruces = [...new Set(cartas.map((c) => c.cruce))].sort((a, b) => b - a);
  const desde = CRUCES.find((c) => c.n === DESDE_CRUCE);
  const cuantas = (r: Rareza) => CARTAS.filter((c) => c.rareza === r).length;
  const texto = buscar.trim().toLowerCase();
  const visibles = CARTAS.filter((c) => (rareza === 'todas' || c.rareza === rareza) && (tipo === 'todas' || c.tipo === tipo) && (!texto || `${c.nombre} ${c.efecto}`.toLowerCase().includes(texto)));

  return (
    <div class="wc-pagina">
      <section class="wc-portada">
        <div class="wc-abanico" aria-hidden="true">
          {ABANICO.map(([id, r]) => <CartaWild key={id} carta={id} rareza={r} tam="chica" />)}
        </div>
        <div class="wc-portada-texto">
          <h1>Wild Cards</h1>
          <p class="wc-bajada">Desde el cruce {DESDE_CRUCE}{desde ? ` (${V.fechaCorta(desde.desde)})` : ''}, cada equipo recibe una carta por cruce. Hay {CARTAS.length} cartas: la mayoría suma puntos, algunas se deciden antes de jugar y las legendarias pueden dar vuelta la tabla.</p>
          <p class="tenue">Los equipos de más abajo tienen más probabilidad de sacar cartas fuertes, así que la pelea por los 6 cupos de la final sigue abierta hasta el último cruce.</p>
        </div>
      </section>

      <div class="wc-cifras">
        <div><b>{CARTAS.length}</b>cartas</div>
        {ORDEN.map((r) => <div key={r}><b style={{ color: RAREZAS[r].color }}>{cuantas(r)}</b>{({ comun: 'comunes', rara: 'raras', epica: 'épicas', legendaria: 'legendarias' } as const)[r]}</div>)}
        <div><b>{CARTAS.filter((c) => c.tipo === 'decision').length}</b>de decisión</div>
      </div>

      <h2>Cómo funciona</h2>
      <ol class="wc-pasos">
        <li><b>Se sortea.</b> Al empezar el cruce, la organización gira una ruleta por equipo. La rareza depende del puesto en la tabla y el resultado lo decide el servidor, no la ruleta.</li>
        <li><b>Boca abajo.</b> Todos ven la rareza de cada carta. Las cartas de decisión se muestran al tiro; las demás quedan ocultas hasta el final del cruce (tu equipo sí ve la suya).</li>
        <li><b>Se juega.</b> Los duelos se juegan como siempre. Las cartas de decisión se usan antes de que se juegue el duelo que afectan: avísale a la organización.</li>
        <li><b>Se revela.</b> Al cerrar el cruce se dan vuelta todas, se suman sus puntos (por el multiplicador de la jornada) y sale el anuncio en Discord.</li>
      </ol>

      <section class="wc-caja">
        <h2>¿Qué significa «base»?</h2>
        <p>Los puntos <b>base</b> son los puntos <b>antes del multiplicador de la jornada</b>. Cada duelo da 7 si se gana, 6 si se empata, 4 si se pierde y 0 si no se juega; ganar la serie (2 o 3 duelos) suma 5 más. Las cartas se suman (o multiplican) ahí, y después todo se multiplica por la jornada: <b>×1,5 en los cruces 8 y 9</b> y <b>×2 en los cruces 10 y 11</b>.</p>
        <div class="tabla-caja">
          <table class="tabla">
            <thead><tr><th>Ejemplo: Jornada 4 (×2), el equipo gana 2 y pierde 1</th><th>Cálculo</th><th>En la tabla</th></tr></thead>
            <tbody>
              <tr><td>Sin carta: 7 + 7 + 4 + 5 de la serie = 23 base</td><td>23 × 2</td><td><b>46</b></td></tr>
              <tr><td>🧲 Imán (rara): +4 base por duelo ganado</td><td>(23 + 8) × 2</td><td><b>62</b> <span class="wc-suma">(+16)</span></td></tr>
              <tr><td>👑 La Corona (legendaria): todo ×1,3</td><td>23 × 1,3 × 2</td><td><b>59,8</b> <span class="wc-suma">(+13,8)</span></td></tr>
              <tr><td>🏆 Leyenda Viva (legendaria): +12 base por duelo ganado</td><td>(23 + 24) × 2</td><td><b>94</b> <span class="wc-suma">(+48)</span></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="wc-dos">
        <section class="wc-caja">
          <h2>Techos por rareza</h2>
          <p class="chico tenue">Lo más que suma una carta en un cruce, en puntos base.</p>
          <div class="tabla-caja">
            <table class="tabla">
              <thead><tr><th>Rareza</th><th>Cartas</th><th>Máximo</th><th>En la Jornada 4</th></tr></thead>
              <tbody>{ORDEN.map((r) => <tr key={r}><td style={{ color: RAREZAS[r].color }}>{RAREZAS[r].nombre}</td><td>{cuantas(r)}</td><td>+{TECHO[r]}</td><td>hasta +{TECHO[r] * 2}</td></tr>)}</tbody>
            </table>
          </div>
          <p class="chico tenue">Para comparar, un equipo saca como máximo 26 base con sus duelos (52 en la Jornada 4). Ningún multiplicador de carta pasa de ×1,3.</p>
        </section>
        <section class="wc-caja">
          <h2>Probabilidad según tu puesto</h2>
          <p class="chico tenue">Se usa el puesto del equipo en la tabla al momento de sortear.</p>
          <div class="tabla-caja">
            <table class="tabla wc-prob">
              <thead><tr><th>Puesto</th>{ORDEN.map((r) => <th key={r} style={{ color: RAREZAS[r].color }}>{RAREZAS[r].nombre}</th>)}</tr></thead>
              <tbody>{PROBABILIDADES.map((g) => <tr key={g.desde}><td>{g.desde}.º a {g.hasta}.º</td>{ORDEN.map((r) => <td key={r}>{g[r]} %</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>

      <h2>Las {CARTAS.length} cartas</h2>
      <div class="wc-filtros" role="group" aria-label="Filtrar cartas">
        <div class="wc-chips">
          {(['todas', ...ORDEN] as const).map((r) => (
            <button key={r} type="button" class={`wc-chip${rareza === r ? ' activa' : ''}`} aria-pressed={rareza === r} style={r === 'todas' ? undefined : { '--wc-color': RAREZAS[r].color }} onClick={() => setRareza(r)}>
              {r === 'todas' ? 'Todas' : RAREZAS[r].nombre}
            </button>
          ))}
        </div>
        <div class="wc-chips">
          {([['todas', 'Todos los tipos'], ['auto', 'Automáticas'], ['decision', 'De decisión']] as const).map(([t, txt]) => (
            <button key={t} type="button" class={`wc-chip${tipo === t ? ' activa' : ''}`} aria-pressed={tipo === t} onClick={() => setTipo(t)}>{txt}</button>
          ))}
        </div>
        <label class="wc-buscar">Buscar <input type="search" value={buscar} placeholder="Nombre o efecto" onInput={(e) => setBuscar(e.currentTarget.value)} /></label>
      </div>
      <p class="chico tenue" aria-live="polite">{visibles.length === CARTAS.length ? `Mostrando las ${CARTAS.length}.` : `${visibles.length} de ${CARTAS.length} cartas.`} «Automática» significa que se aplica sola al revelar; las de decisión se usan antes de jugar.</p>
      {ORDEN.filter((r) => visibles.some((c) => c.rareza === r)).map((r) => (
        <section key={r} class="wc-rareza-grupo">
          <h3 style={{ color: RAREZAS[r].color }}>{RAREZAS[r].nombre} · hasta +{TECHO[r]} base</h3>
          <div class="wc-grilla">
            {visibles.filter((c) => c.rareza === r).map((c) => (
              <figure key={c.id} class="wc-con-max">
                <CartaWild carta={c.id} rareza={r} />
                <figcaption>{c.tipo === 'decision' ? 'Se decide antes de jugar' : `Máximo ${c.max}`}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      {!visibles.length && <p class="tenue">Ninguna carta calza con ese filtro.</p>}

      <h2>Preguntas frecuentes</h2>
      <div class="wc-faq">
        {PREGUNTAS.map(([p, r]) => <details key={p}><summary>{p}</summary><p>{r}</p></details>)}
      </div>

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
