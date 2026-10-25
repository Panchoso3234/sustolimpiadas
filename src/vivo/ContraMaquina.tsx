import { useEffect, useState } from 'preact/hooks';
import { COLUMNAS, FILAS, LADO, disparoMaquina, filaLibre, jugadaMaquina, jugarConchas, recibirDisparo, repartirFlota, type Balsa, type Dificultad, type Resultado } from './reglas';

// Modo individual de Cuatro Conchas en Línea y Batalla de Balsas: contra la máquina, en este navegador.
// Es para practicar: no guarda marcas ni cuenta para nada (solo se recuerda cuántas ganaste, en este navegador).

const NOMBRES = { conchas: 'Cuatro Conchas en Línea', balsas: 'Batalla de Balsas' } as const;
type Juego = keyof typeof NOMBRES;
const DIFICULTADES: [Dificultad, string][] = [['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil']];
type Cuenta = Record<Dificultad, { g: number; p: number; e: number }>;
const clave = (j: Juego) => `susto.maquina.${j}`;

function leerCuenta(j: Juego): Cuenta {
  const vacia: Cuenta = { facil: { g: 0, p: 0, e: 0 }, normal: { g: 0, p: 0, e: 0 }, dificil: { g: 0, p: 0, e: 0 } };
  try { return { ...vacia, ...JSON.parse(localStorage.getItem(clave(j)) ?? '{}') }; } catch { return vacia; }
}

export const esContraMaquina = (j: string): j is Juego => j in NOMBRES;

export function ContraMaquina({ juego }: { juego: Juego }) {
  const [dificultad, setDificultad] = useState<Dificultad>('normal');
  const [partida, setPartida] = useState(0);
  const [cuenta, setCuenta] = useState(() => leerCuenta(juego));
  const anotar = (r: 'g' | 'p' | 'e') => {
    const nueva = { ...cuenta, [dificultad]: { ...cuenta[dificultad], [r]: cuenta[dificultad][r] + 1 } };
    setCuenta(nueva);
    try { localStorage.setItem(clave(juego), JSON.stringify(nueva)); } catch { /* sin almacenamiento */ }
  };
  const c = cuenta[dificultad];
  return (
    <>
      <h1>{NOMBRES[juego]} · contra la máquina</h1>
      <p>Modo individual para practicar: no guarda marcas ni da puntos. Para jugar contra otra persona, crea una sala en <a href="#/juegos/vivo">En vivo</a>.</p>
      <nav class="modos sub-modos" aria-label="Dificultad">
        {DIFICULTADES.map(([d, t]) => <button key={d} type="button" class={dificultad === d ? 'activa' : ''} aria-pressed={dificultad === d} onClick={() => { setDificultad(d); setPartida((n) => n + 1); }}><b>{t}</b></button>)}
      </nav>
      <p class="tenue chico">En {DIFICULTADES.find(([d]) => d === dificultad)![1].toLowerCase()} llevas {c.g} {c.g === 1 ? 'victoria' : 'victorias'}, {c.p} {c.p === 1 ? 'derrota' : 'derrotas'}{juego === 'conchas' ? ` y ${c.e} ${c.e === 1 ? 'empate' : 'empates'}` : ''} (en este navegador).</p>
      {juego === 'conchas'
        ? <Conchas key={`${dificultad}-${partida}`} dificultad={dificultad} empiezoYo={partida % 2 === 0} fin={anotar} otra={() => setPartida((n) => n + 1)} />
        : <Balsas key={`${dificultad}-${partida}`} dificultad={dificultad} fin={anotar} otra={() => setPartida((n) => n + 1)} />}
    </>
  );
}

function Conchas({ dificultad, empiezoYo, fin, otra }: { dificultad: Dificultad; empiezoYo: boolean; fin: (r: 'g' | 'p' | 'e') => void; otra: () => void }) {
  const [jugadas, setJugadas] = useState<number[]>([]);
  const yo = empiezoYo ? 1 : 2, estado = jugarConchas(jugadas), terminada = !!estado.ganador || estado.empate, miTurno = estado.turno === yo && !terminada;
  useEffect(() => {
    if (terminada) { fin(estado.empate ? 'e' : estado.ganador === yo ? 'g' : 'p'); return; }
    if (miTurno) return;
    // La máquina "piensa" un poco para que se vea la jugada
    const t = setTimeout(() => setJugadas((js) => [...js, jugadaMaquina(js, dificultad)]), 450);
    return () => clearTimeout(t);
  }, [jugadas.length]);
  return (
    <>
      <p class={`vivo-turno${miTurno ? ' mio' : ''}`}>{terminada ? (estado.empate ? 'Empate: el tablero se llenó.' : estado.ganador === yo ? '¡Ganaste!' : 'Ganó la máquina.') : miTurno ? `Tu turno (eres ${yo === 1 ? 'azul' : 'rojo'})` : 'La máquina está pensando…'}</p>
      <div class="conchas" aria-label="Tablero de Cuatro Conchas">
        {Array.from({ length: COLUMNAS }, (_, col) => (
          <button key={col} class="conchas-col" disabled={!miTurno || filaLibre(estado.tablero, col) < 0} onClick={() => setJugadas([...jugadas, col])} aria-label={`Columna ${col + 1}`}>
            {Array.from({ length: FILAS }, (_, k) => FILAS - 1 - k).map((f) => {
              const v = estado.tablero[f][col], gana = estado.ganador > 0 && estado.linea.some(([lf, lc]) => lf === f && lc === col);
              return <span key={f} class={`concha${v ? ` j${v}` : ''}${gana ? ' gana' : ''}`} />;
            })}
          </button>
        ))}
      </div>
      {terminada && <div class="fila"><button class="boton principal" onClick={otra}>Otra partida</button></div>}
    </>
  );
}

interface Tiro { i: number; res: Resultado; hundida?: number[] }

function Balsas({ dificultad, fin, otra }: { dificultad: Dificultad; fin: (r: 'g' | 'p') => void; otra: () => void }) {
  const [mia, setMia] = useState<Balsa[]>(() => repartirFlota());
  const [suya] = useState<Balsa[]>(() => repartirFlota());
  const [listo, setListo] = useState(false);
  const [mios, setMios] = useState<Tiro[]>([]), [suyos, setSuyos] = useState<Tiro[]>([]);
  const hundiTodo = suya.every((b) => b.casillas.every((k) => mios.some((t) => t.i === k)));
  const meHundio = mia.every((b) => b.casillas.every((k) => suyos.some((t) => t.i === k)));
  const terminada = hundiTodo || meHundio, miTurno = listo && !terminada && mios.length === suyos.length;
  useEffect(() => {
    if (terminada) { fin(hundiTodo ? 'g' : 'p'); return; }
    if (!listo || mios.length === suyos.length) return;
    const t = setTimeout(() => setSuyos((s) => { const i = disparoMaquina(s, dificultad), r = recibirDisparo(mia, s.map((x) => x.i), i); return [...s, { i, res: r.resultado, hundida: r.hundida }]; }), 550);
    return () => clearTimeout(t);
  }, [mios.length, suyos.length, listo]);
  const disparar = (i: number) => { const r = recibirDisparo(suya, mios.map((x) => x.i), i); setMios([...mios, { i, res: r.resultado, hundida: r.hundida }]); };
  const mar = (titulo: string, tiros: Tiro[], barcos: Set<number>, puedo: boolean) => {
    const hundidas = new Set(tiros.flatMap((t) => t.hundida ?? []));
    return (
      <div class="mar-caja">
        <div class="sigla">{titulo}</div>
        <div class="mar">
          {Array.from({ length: LADO * LADO }, (_, i) => {
            const tiro = tiros.find((t) => t.i === i);
            return <button key={i} class={`agua-c${barcos.has(i) ? ' barco' : ''}${tiro ? ` ${tiro.res}` : ''}${hundidas.has(i) ? ' hundido' : ''}`} disabled={!puedo || !!tiro} onClick={() => disparar(i)} aria-label={`Fila ${Math.floor(i / LADO) + 1}, columna ${(i % LADO) + 1}`} />;
          })}
        </div>
      </div>
    );
  };
  // Al terminar se muestran las balsas de la máquina que no alcanzaste a hundir
  const suyasVisibles = terminada ? new Set(suya.flatMap((b) => b.casillas)) : new Set<number>();
  return (
    <>
      {!listo ? (
        <div class="fila">
          <button class="boton" onClick={() => setMia(repartirFlota())}>Otra distribución</button>
          <button class="boton principal" onClick={() => setListo(true)}>Flota lista</button>
        </div>
      ) : <p class={`vivo-turno${miTurno ? ' mio' : ''}`}>{terminada ? (hundiTodo ? `¡Ganaste! Hundiste toda la flota en ${mios.length} tiros.` : 'La máquina hundió tu flota.') : miTurno ? 'Tu turno: dispara al mar de la máquina' : 'La máquina apunta…'}</p>}
      <div class="mares">
        {mar('Tu mar', suyos, new Set(mia.flatMap((b) => b.casillas)), false)}
        {mar('Mar de la máquina', mios, suyasVisibles, miTurno)}
      </div>
      {terminada && <div class="fila"><button class="boton principal" onClick={otra}>Otra partida</button></div>}
    </>
  );
}
