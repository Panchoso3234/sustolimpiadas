import { useState } from 'preact/hooks';
import { esDaltonico, marcarRecorrido, ponerDaltonico, recorridoVisto } from './nucleo/preferencias';
import { estaCallado, nivelVolumen, ponerVolumen, silenciar } from './juegos/sonido';

// Ajustes de cada persona (quedan en este navegador) y el recorrido de bienvenida de la primera visita.

export function Ajustes({ alVerRecorrido }: { alVerRecorrido(): void }) {
  const [nivel, setNivel] = useState(nivelVolumen);
  const [callado, setCallado] = useState(estaCallado);
  const [daltonico, setDaltonico] = useState(esDaltonico);
  return (
    <div class="pagina">
      <div class="sigla">Ajustes</div>
      <h1>Ajustes</h1>
      <p class="tenue">Se guardan en este navegador. La calidad de la isla se elige en la misma isla.</p>
      <section class="bloque formulario ajustes">
        <label>Volumen de los juegos: {Math.round(nivel * 100)} %
          <input type="range" min={0} max={100} step={5} value={Math.round(nivel * 100)} onInput={(e) => { const n = Number(e.currentTarget.value) / 100; ponerVolumen(n); setNivel(n); }} />
        </label>
        <label class="casilla"><input type="checkbox" checked={callado} onChange={(e) => { silenciar(e.currentTarget.checked); setCallado(e.currentTarget.checked); }} /> Silenciar todo</label>
        <label class="casilla"><input type="checkbox" checked={daltonico} onChange={(e) => { ponerDaltonico(e.currentTarget.checked); setDaltonico(e.currentTarget.checked); }} /> Modo daltónico (cambia verde y rojo por azul y naranjo, en la página y en los equipos de la arena)</label>
        <button class="boton" onClick={alVerRecorrido}>Ver de nuevo el recorrido de bienvenida</button>
      </section>
    </div>
  );
}

const PASOS = [
  { titulo: '¡Bienvenida a Las Sustolimpiadas!', texto: 'Un torneo del servidor, del 13 de octubre al 13 de noviembre. Te mostramos lo principal en cuatro pasos.', enlace: '#/isla' },
  { titulo: 'La isla', texto: 'Aquí vive el personaje de cada participante. Toca los edificios para ver qué hay y a las personas para conocerlas.', enlace: '#/isla' },
  { titulo: 'Tu personaje', texto: 'En "Mi personaje" lo armas a tu gusto. Entra con Discord para guardarlo y aparecer en la isla.', enlace: '#/personaje' },
  { titulo: 'Los juegos', texto: 'En "Juegos" están los individuales (vale tu mejor marca del día), los duelos 1v1 y los de equipo 3v3. La campana 🔔 te avisa de retos y resultados.', enlace: '#/juegos' },
  { titulo: 'La tabla y tu perfil', texto: 'En "Posiciones" ves cómo va el torneo, y en tu nombre (arriba) tu perfil con estadísticas e insignias. ¡A jugar!', enlace: '#/juegos/posiciones' },
];

export function Recorrido({ alCerrar }: { alCerrar(): void }) {
  const [paso, setPaso] = useState(0);
  const cerrar = () => { marcarRecorrido(true); alCerrar(); };
  const p = PASOS[paso], ultimo = paso === PASOS.length - 1;
  return (
    <div class="recorrido" role="dialog" aria-modal="true" aria-labelledby="recorrido-titulo">
      <div class="recorrido-panel">
        <div class="sigla">Paso {paso + 1} de {PASOS.length}</div>
        <h2 id="recorrido-titulo">{p.titulo}</h2>
        <p>{p.texto}</p>
        <div class="fila">
          <button class="boton principal" onClick={() => { if (ultimo) cerrar(); else { setPaso(paso + 1); location.hash = PASOS[paso + 1].enlace; } }}>{ultimo ? '¡Listo!' : 'Siguiente'}</button>
          {!ultimo && <button class="boton" onClick={cerrar}>Saltar</button>}
        </div>
      </div>
    </div>
  );
}

export const mostrarRecorridoAlInicio = () => !recorridoVisto() && !new URLSearchParams(location.search).has('auto');
