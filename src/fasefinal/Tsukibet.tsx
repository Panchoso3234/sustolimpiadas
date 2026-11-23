import { useEffect, useState } from 'preact/hooks';
import { useSesion } from '../nucleo/supabase';
import { MERCADOS, type Mercado } from './cuotas';
import * as FF from './ffDatos';

// TSUKIBET de la FASE FINAL, para el público: pronóstico gratis (arma el ranking), apuesta con protogemas y paracaídas
// durante la simulación. Las reglas las controla la base (ffDatos → supabase/2026-11-20-fase-final-tsukibet.sql).

const ORDEN: Mercado[] = ['ganador', 'primero', 'sobrevive', 'top3'];
const PUNTOS: Record<Mercado, string> = { ganador: '10 puntos', primero: '5 puntos', sobrevive: '1 punto por acierto', top3: '3 puntos' };

export function Tsukibet() {
  const sesion = useSesion();
  const [sims, setSims] = useState<FF.SimFF[] | null>(null);
  const [sim, setSim] = useState(1);
  const [pron, setPron] = useState<Awaited<ReturnType<typeof FF.misPronosticos>>>([]);
  const [apuestas, setApuestas] = useState<FF.ApuestaFF[]>([]);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [rank, setRank] = useState<Awaited<ReturnType<typeof FF.ranking>>>([]);
  const [aviso, setAviso] = useState(''); const [error, setError] = useState('');
  const cargar = async () => {
    const [s, p, a, r, g] = await Promise.all([FF.listarSims(), sesion.usuarioId ? FF.misPronosticos() : [], sesion.usuarioId ? FF.misApuestas() : [], FF.ranking(), FF.miSaldo(sesion.usuarioId)]);
    setSims(s); setPron(p); setApuestas(a); setRank(r); setSaldo(g);
  };
  useEffect(() => { cargar(); const id = setInterval(cargar, 15000); return () => clearInterval(id); }, [sesion.usuarioId]);
  if (!sims) return <p class="tenue">Cargando TSUKIBET…</p>;
  if (!sims.length) return null; // todavía no se publica: no se muestra nada
  const s = sims.find((x) => x.n === sim) ?? sims[0];
  const nombre = (id: string) => s.tributos.find((t) => t.id === id)?.nombre ?? '—';
  const listo = (txt: string | null, ok: string) => { if (txt) { setError(txt); setAviso(''); } else { setAviso(ok); setError(''); } cargar(); };
  const mio = (m: Mercado) => pron.find((x) => x.sim === s.n && x.mercado === m)?.eleccion;
  const apostadoAqui = apuestas.filter((a) => a.sim === s.n && a.estado === 'viva').reduce((t, a) => t + a.monto, 0);
  const juegan = s.participantes ?? s.tributos.map((t) => t.id);

  return (
    <section class="ff-tsukibet">
      <h2>🌙 TSUKIBET · FASE FINAL</h2>
      <p class="chico">Pronostica gratis y suma puntos para el ranking del público (premios: 1.600, 960 y 640 protogemas y el título «Pronosticador de la Fase Final»; 160 a quien pronostique en 4 o más simulaciones). Si quieres, apuesta protogemas: hasta 320 por simulación. Todo cierra cuando empieza cada simulación.</p>
      {sesion.usuarioId && saldo != null && <p class="chico">Tus protogemas: <b>{saldo.toLocaleString('es-CL')}</b></p>}
      {!sesion.usuarioId && <p class="aviso">Entra con Discord para pronosticar y apostar.</p>}
      {error && <p class="aviso error" role="alert">{error}</p>}
      {aviso && <p class="aviso ok" role="status">{aviso}</p>}
      <nav class="ff-pestanas" aria-label="Simulaciones">
        {sims.map((x) => <button key={x.n} class={x.n === s.n ? 'activa' : ''} onClick={() => setSim(x.n)}>Simulación {x.n}{x.estado === 'abierta' ? '' : x.estado === 'cerrada' ? ' · en curso' : ' · terminada'}</button>)}
      </nav>

      {s.estado === 'abierta' && (
        <div class="ff-mercados">
          {ORDEN.map((m) => (
            <div key={m} class="ff-mercado">
              <h3>{MERCADOS[m]} <span class="tenue chico">· pronóstico: {PUNTOS[m]}</span></h3>
              {m === 'sobrevive'
                ? <Elegir3 tributos={s.tributos} actual={(mio(m) as string[] | undefined) ?? []} alGuardar={async (ids) => listo(await FF.pronosticar(s.n, m, ids), 'Pronóstico guardado.')} />
                : <select value={(mio(m) as string | undefined) ?? ''} onChange={async (ev) => listo(await FF.pronosticar(s.n, m, ev.currentTarget.value), 'Pronóstico guardado.')} disabled={!sesion.usuarioId}>
                    <option value="">Elige un tributo…</option>{s.tributos.map((t) => <option key={t.id} value={t.id}>{t.nombre} (×{s.cuotas[m]?.[t.id] ?? '—'})</option>)}
                  </select>}
              <Apostar s={s} m={m} queda={320 - apostadoAqui} alApostar={async (tributo, monto) => listo(await FF.apostar(s.n, m, tributo, monto), `Apuesta hecha: ${monto} protogemas.`)} activo={!!sesion.usuarioId} />
            </div>
          ))}
        </div>
      )}

      {s.estado === 'cerrada' && (
        <div class="ff-mercado">
          <h3>🪂 Mandar un paracaídas</h3>
          <p class="chico">{s.paracaidas_abiertos ? 'Ayuda a un tributo desde el paso siguiente. 160 protogemas (normal) o 320 (grande). Una vez por simulación y 3 en toda la noche; las gemas se queman.' : 'Los paracaídas se abren entre el Día 1 y la Noche 3 de la simulación.'}</p>
          {s.paracaidas_abiertos && <Paracaidas tributos={juegan.map((id) => ({ id, nombre: nombre(id) }))} alMandar={async (t, n) => listo(await FF.mandarParacaidas(s.n, t, n), '¡Paracaídas en camino!')} />}
        </div>
      )}

      {s.estado === 'pagada' && s.resultado && (
        <p>Ganador: <b>{nombre(s.resultado.ganador)}</b> · primer caído: {nombre(s.resultado.primero)} · top 3: {s.resultado.top3.map(nombre).join(', ')}</p>
      )}

      {apuestas.some((a) => a.sim === s.n) && (
        <div class="tabla-caja"><table class="tabla"><thead><tr><th>Tu apuesta</th><th>Tributo</th><th>Monto</th><th>Cuota</th><th>Estado</th></tr></thead>
          <tbody>{apuestas.filter((a) => a.sim === s.n).map((a) => <tr key={a.id}><td>{MERCADOS[a.mercado]}</td><td>{nombre(a.tributo)}</td><td>{a.monto}</td><td>×{a.cuota}</td><td>{a.estado === 'ganada' ? `✅ +${a.pago}` : a.estado === 'perdida' ? '❌' : a.estado === 'devuelta' ? '↩️ devuelta' : 'en juego'}</td></tr>)}</tbody></table></div>
      )}

      {rank.length > 0 && <>
        <h3>Ranking del público</h3>
        <ol class="ff-ranking">{rank.slice(0, 10).map((r) => <li key={r.perfil_id}><b>{r.nombre}</b> · {r.puntos} pts <span class="tenue chico">({r.sims} simulaciones)</span></li>)}</ol>
      </>}
    </section>
  );
}

function Elegir3({ tributos, actual, alGuardar }: { tributos: { id: string; nombre: string }[]; actual: string[]; alGuardar: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(actual);
  useEffect(() => setSel(actual), [actual.join()]);
  const cambiar = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : x.length < 3 ? [...x, id] : x));
  return (
    <div>
      <div class="ff-chips">{tributos.map((t) => <button key={t.id} type="button" class={`ff-chip${sel.includes(t.id) ? " activa" : ""}`} aria-pressed={sel.includes(t.id)} onClick={() => cambiar(t.id)}>{t.nombre}</button>)}</div>
      <button class="boton" disabled={sel.length !== 3} onClick={() => alGuardar(sel)}>Guardar mis 3 ({sel.length}/3)</button>
    </div>
  );
}

function Apostar({ s, m, queda, alApostar, activo }: { s: FF.SimFF; m: Mercado; queda: number; alApostar: (tributo: string, monto: number) => Promise<void>; activo: boolean }) {
  const [tributo, setTributo] = useState(''); const [monto, setMonto] = useState(50); const [ocupado, setOcupado] = useState(false);
  if (!activo || queda < 10) return null;
  const cuota = s.cuotas[m]?.[tributo];
  return (
    <details class="ff-apostar"><summary>Apostar protogemas (te quedan {queda} en esta simulación)</summary>
      <div class="ff-controles">
        <select value={tributo} onChange={(ev) => setTributo(ev.currentTarget.value)}><option value="">Tributo…</option>{s.tributos.map((t) => <option key={t.id} value={t.id}>{t.nombre} (×{s.cuotas[m]?.[t.id] ?? '—'})</option>)}</select>
        <input type="number" min={10} max={queda} step={10} value={monto} onInput={(ev) => setMonto(Number(ev.currentTarget.value))} aria-label="Monto" />
        <button class="boton principal" disabled={ocupado || !tributo || monto < 10 || monto > queda} onClick={async () => { setOcupado(true); try { await alApostar(tributo, monto); setTributo(''); } finally { setOcupado(false); } }}>{ocupado ? 'Apostando…' : `Apostar${cuota ? ` (si gana: ${Math.floor(monto * cuota)})` : ''}`}</button>
      </div>
    </details>
  );
}

function Paracaidas({ tributos, alMandar }: { tributos: { id: string; nombre: string }[]; alMandar: (tributo: string, nivel: 1 | 2) => Promise<void> }) {
  const [t, setT] = useState(''); const [ocupado, setOcupado] = useState(false);
  const mandar = async (nivel: 1 | 2) => { setOcupado(true); try { await alMandar(t, nivel); } finally { setOcupado(false); } };
  return (
    <div class="ff-controles">
      <select value={t} onChange={(ev) => setT(ev.currentTarget.value)}><option value="">¿A quién?</option>{tributos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      <button class="boton" disabled={!t || ocupado} onClick={() => mandar(1)}>Paracaídas (160)</button>
      <button class="boton principal" disabled={!t || ocupado} onClick={() => mandar(2)}>Paracaídas grande (320)</button>
    </div>
  );
}
