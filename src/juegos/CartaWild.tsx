import { MISIONES, RAREZAS, cartaPorId, type Rareza } from './wildcards';
import './wildcards.css';

/**
 * Una Wild Card como naipe coleccionable. Boca abajo muestra solo el color de su rareza; de frente, el emoji, el nombre y el efecto.
 * El giro es CSS (transform 3D) y se apaga con "reducir movimiento".
 */
export function CartaWild({ carta, rareza, deFrente = true, tam = 'normal', dado, nota }: {
  carta?: string | null; rareza: Rareza; deFrente?: boolean; tam?: 'normal' | 'chica' | 'grande'; dado?: number | null; nota?: string;
}) {
  const k = carta ? cartaPorId(carta) : undefined, r = RAREZAS[rareza];
  const visible = deFrente && !!k;
  return (
    <div class={`wc-carta wc-${rareza} wc-${tam}${visible ? ' de-frente' : ''}`} style={{ '--wc-color': r.color }} role="img"
      aria-label={visible ? `${k!.nombre}, carta ${r.nombre.toLowerCase()}: ${k!.efecto}` : `Carta ${r.nombre.toLowerCase()} boca abajo`}>
      <div class="wc-giro">
        <div class="wc-cara wc-dorso" aria-hidden="true">
          <span class="wc-dorso-marca">?</span>
          <span class="wc-rareza">{r.nombre}</span>
        </div>
        <div class="wc-cara wc-frente" aria-hidden="true">
          {k && <>
            <span class="wc-rareza">{r.nombre}</span>
            <span class="wc-emoji">{k.emoji}</span>
            <b class="wc-nombre">{k.nombre}</b>
            {tam !== 'chica' && <span class="wc-efecto">{k.efecto}{dado ? (MISIONES[k.id] ? ` Tu misión: ${MISIONES[k.id][dado - 1]}.` : ` Salió ${dado}.`) : ''}</span>}
            {tam !== 'chica' && k.tipo === 'decision' && <span class="wc-tipo">Se decide antes de jugar</span>}
          </>}
        </div>
      </div>
      {nota && <span class="wc-nota">{nota}</span>}
    </div>
  );
}
