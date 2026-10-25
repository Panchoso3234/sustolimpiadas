import { useState } from 'preact/hooks';
import * as V from './duelos';

/** "Avisar a mi rival": le llega en la campana y en Discord que lo esperan en vivo (una vez cada 10 minutos). */
export function BotonAvisar({ id }: { id: number }) {
  const [estado, setEstado] = useState<'' | 'enviando' | 'listo' | string>('');
  const avisar = async () => { setEstado('enviando'); const error = await V.avisarRival(id); setEstado(error ?? 'listo'); };
  if (estado && estado !== 'enviando') return <span class={`chico ${estado === 'listo' ? 'aviso-ok-texto' : 'tenue'}`}>{estado === 'listo' ? 'Avisado: le llegó en la web y en Discord.' : estado}</span>;
  return <button class="boton" disabled={estado === 'enviando'} onClick={avisar} title="Le llega en la campana de la web y en Discord">Avisar a mi rival</button>;
}
