import { useEffect, useState } from 'preact/hooks';
import { escucharConectados, type Conectado } from '../nucleo/presencia';
import * as V from './duelos';

/** "Avisar a mi rival": le llega en la campana y en Discord que lo esperan en vivo (una vez cada 10 minutos). */
export function BotonAvisar({ id }: { id: number }) {
  const [estado, setEstado] = useState<'' | 'enviando' | 'listo' | string>('');
  const avisar = async () => { setEstado('enviando'); const error = await V.avisarRival(id); setEstado(error ?? 'listo'); };
  if (estado && estado !== 'enviando') return <span class={`chico ${estado === 'listo' ? 'aviso-ok-texto' : 'tenue'}`}>{estado === 'listo' ? 'Avisado: le llegó en la web y en Discord.' : estado}</span>;
  return <button class="boton" disabled={estado === 'enviando'} onClick={avisar} title="Le llega en la campana de la web y en Discord">Avisar a mi rival</button>;
}

/** Si el rival está en la web ahora (la lista de miembros): para saber si vale la pena jugar en vivo. */
export function EstadoRival({ id }: { id: string | null }) {
  const [estado, setEstado] = useState<Conectado['estado'] | null>(null);
  useEffect(() => escucharConectados((l) => setEstado(l.find((c) => c.id === id)?.estado ?? null)), [id]);
  if (!estado) return null;
  return <span class={`rival-estado ${estado}`}><i aria-hidden="true" />{estado === 'activo' ? 'En línea ahora' : 'Ausente'}</span>;
}

const enChile = (iso: string) => new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
/** "AAAA-MM-DDTHH:MM" en la hora de este equipo, para el campo de fecha y hora. */
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Agendar un duelo: proponer una hora, que el rival la confirme, y a los dos les llega un recordatorio 10 minutos antes. */
export function Agenda({ id, yo, plazo }: { id: number; yo: string; plazo: string | null }) {
  const [agenda, setAgenda] = useState<V.Agenda | null | undefined>(null);
  const [abierto, setAbierto] = useState(false), [hora, setHora] = useState(''), [aviso, setAviso] = useState('');
  const cargar = () => V.agendaDe(id).then(setAgenda);
  useEffect(() => { cargar(); }, [id]);
  if (agenda === undefined) return null; // la base todavía no tiene agendas
  const proponer = async () => {
    if (!hora) return setAviso('Elige el día y la hora.');
    const error = await V.agendarDuelo(id, new Date(hora));
    setAviso(error ?? 'Hora propuesta: le llegó a tu rival en la web y en Discord.');
    if (!error) { setAbierto(false); cargar(); }
  };
  const confirmar = async () => { const error = await V.confirmarAgenda(id); setAviso(error ?? 'Confirmado: 10 minutos antes les llega un recordatorio a los dos.'); if (!error) cargar(); };
  const min = local(new Date(Date.now() + 16 * 60000)), max = plazo ? `${plazo}T23:59` : undefined;
  const vigente = agenda && Date.parse(agenda.hora) > Date.now() - 60 * 60000;
  return (
    <div class="agenda">
      {vigente && agenda && (
        <span class={`agenda-hora${agenda.confirmada ? ' ok' : ''}`}>
          {agenda.confirmada ? 'Agendado' : agenda.propuso === yo ? 'Propusiste' : 'Tu rival propone'}: <b>{enChile(agenda.hora)}</b>{agenda.confirmada ? '' : ' (sin confirmar)'}
        </span>
      )}
      {vigente && agenda && !agenda.confirmada && agenda.propuso !== yo && <button class="boton principal" onClick={confirmar}>Confirmar hora</button>}
      {!abierto
        ? <button class="boton" onClick={() => { setAbierto(true); setAviso(''); }}>{vigente ? 'Otra hora' : 'Agendar'}</button>
        : (
          <span class="agenda-form">
            <input class="texto" type="datetime-local" aria-label="Día y hora para jugar en vivo" value={hora} min={min} max={max} onInput={(e) => setHora(e.currentTarget.value)} />
            <button class="boton principal" onClick={proponer}>Proponer</button>
            <button class="boton" onClick={() => setAbierto(false)}>Cancelar</button>
          </span>
        )}
      {aviso && <span class="chico tenue">{aviso}</span>}
    </div>
  );
}
