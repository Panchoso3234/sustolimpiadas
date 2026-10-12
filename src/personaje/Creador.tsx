import { useEffect, useRef, useState } from 'preact/hooks';
import { esApropiado } from '../nucleo/filtro';
import { entrar, supabase, useSesion } from '../nucleo/supabase';
import * as C from './catalogo';
import type { Aspecto, Personaje } from './catalogo';
import { crearKenney, type Kenney, type Ranura } from './kenney';
import { miniatura, tarjeta, type Encuadre } from './miniaturas';
import { crearVisor } from './visor';

const BORRADOR = 'susto.personaje';
const numerados = (palabra: string) => C.BASES.map((_, i) => `${palabra} ${i + 1}`);

type Campo =
  | { k: keyof Aspecto; tipo: 'opcion'; etiqueta: string; opciones: string[]; mini: Encuadre }
  | { k: keyof Aspecto; tipo: 'color'; etiqueta: string; paleta: string[] }
  | { k: keyof Aspecto; tipo: 'rango'; etiqueta: string; min: string; max: string };

const SECCIONES: { id: string; titulo: string; campos: Campo[] }[] = [
  { id: 'base', titulo: 'Cabeza y cuerpo', campos: [
    { k: 'cabeza', tipo: 'opcion', etiqueta: 'Cabeza', opciones: numerados('Cabeza'), mini: 'cabeza' },
    { k: 'cuerpo', tipo: 'opcion', etiqueta: 'Cuerpo', opciones: numerados('Cuerpo'), mini: 'cuerpo' },
  ] },
  { id: 'colores', titulo: 'Colores', campos: [] },
  { id: 'cabeza', titulo: 'En la cabeza', campos: [
    { k: 'sombrero', tipo: 'opcion', etiqueta: 'Sombrero', opciones: C.SOMBREROS, mini: 'cabeza' },
    { k: 'colorSombrero', tipo: 'color', etiqueta: 'Color del sombrero', paleta: C.COLORES_ROPA },
    { k: 'lentes', tipo: 'opcion', etiqueta: 'Lentes', opciones: C.ANTEOJOS, mini: 'cabeza' },
  ] },
  { id: 'extras', titulo: 'Accesorios', campos: [
    { k: 'objeto', tipo: 'opcion', etiqueta: 'En la mano', opciones: C.OBJETOS, mini: 'cuerpo' },
    { k: 'espalda', tipo: 'opcion', etiqueta: 'En la espalda', opciones: C.ESPALDAS, mini: 'espalda' },
    { k: 'colorAccesorio', tipo: 'color', etiqueta: 'Color de los accesorios', paleta: C.COLORES_ROPA },
  ] },
  { id: 'cuerpo', titulo: 'Tamaño', campos: [
    { k: 'altura', tipo: 'rango', etiqueta: 'Altura', min: 'Bajo', max: 'Alto' },
    { k: 'contextura', tipo: 'rango', etiqueta: 'Contextura', min: 'Delgado', max: 'Macizo' },
  ] },
];
const POSES = [['idle', 'Quieto'], ['walk', 'Caminar'], ['sit', 'Sentarse'], ['emote-yes', 'Saludar'], ['jump', 'Saltar']];

function leerBorrador(): Personaje {
  try {
    const crudo = localStorage.getItem(BORRADOR);
    if (crudo) return C.normalizarPersonaje(JSON.parse(crudo));
  } catch { /* sin almacenamiento: se parte de cero */ }
  return C.personajeAleatorio();
}

function Mini({ aspecto, campo, indice, tipo }: { aspecto: Aspecto; campo: keyof Aspecto; indice: number; tipo: Encuadre }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let vigente = true;
    miniatura(aspecto, campo, indice, tipo).then((url) => { if (vigente) setSrc(url); }).catch(() => undefined);
    return () => { vigente = false; };
  }, [aspecto, campo, indice, tipo]);
  return src ? <img src={src} alt="" width="72" height="72" /> : <div class="hueco" />;
}

export function Creador() {
  const sesion = useSesion();
  const [p, setP] = useState<Personaje>(leerBorrador);
  const [paraMinis, setParaMinis] = useState<Aspecto>(p.apariencia); // se actualiza con retraso para no redibujar decenas de miniaturas en cada movimiento
  const [seccion, setSeccion] = useState('base');
  const [ranuras, setRanuras] = useState<Ranura[]>([]);
  const [pose, setPose] = useState('idle');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [imagenTarjeta, setImagenTarjeta] = useState('');
  const caja = useRef<HTMLDivElement>(null);
  const visor = useRef<ReturnType<typeof crearVisor> | null>(null);
  const actual = useRef<Kenney | null>(null);
  const poseActual = useRef(pose);
  poseActual.current = pose;

  useEffect(() => {
    visor.current = crearVisor(caja.current!);
    return () => { visor.current?.destruir(); visor.current = null; };
  }, []);

  useEffect(() => {
    let vigente = true;
    crearKenney(p.apariencia).then((k) => {
      if (!vigente) return;
      actual.current = k;
      k.animar(poseActual.current);
      visor.current?.poner(k.grupo);
      setRanuras(k.ranuras);
    }).catch(() => setAviso({ tipo: 'error', texto: 'No se pudieron cargar los modelos del personaje. Revisa tu conexión y recarga la página.' }));
    try { localStorage.setItem(BORRADOR, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
    const espera = setTimeout(() => setParaMinis(p.apariencia), 300);
    return () => { vigente = false; clearTimeout(espera); };
  }, [p]);

  useEffect(() => { actual.current?.animar(pose); }, [pose]);

  // Al iniciar sesión se trae el personaje ya guardado, si existe.
  useEffect(() => {
    if (!sesion.usuarioId) return;
    let vigente = true;
    supabase.from('personajes').select('nombre,apariencia,personalidad,voz,frase').eq('perfil_id', sesion.usuarioId).maybeSingle()
      .then(({ data }) => {
        if (!vigente) return;
        if (data) setP(C.normalizarPersonaje(data));
        else if (sesion.perfil) setP((antes) => (antes.nombre ? antes : { ...antes, nombre: sesion.perfil!.nombre.slice(0, 24) }));
      });
    return () => { vigente = false; };
  }, [sesion.usuarioId]);

  const cambiar = (k: keyof Aspecto, v: number | string) => setP((antes) => ({ ...antes, apariencia: { ...antes.apariencia, [k]: v } }));
  const pintar = (id: string, color: string) => setP((antes) => ({ ...antes, apariencia: { ...antes.apariencia, colores: { ...antes.apariencia.colores, [id]: color } } }));
  const despintar = () => setP((antes) => ({ ...antes, apariencia: { ...antes.apariencia, colores: {} } }));
  // Al cambiar de cabeza o de cuerpo sus colores son otros: se limpian los de esa parte
  const cambiarBase = (k: 'cabeza' | 'cuerpo', v: number) => setP((antes) => ({
    ...antes, apariencia: { ...antes.apariencia, [k]: v, colores: Object.fromEntries(Object.entries(antes.apariencia.colores).filter(([id]) => !id.startsWith(k))) },
  }));

  const probarVoz = () => {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(p.frase || `Hola, soy ${p.nombre || 'nuevo en la isla'}`);
    u.lang = 'es-CL';
    u.pitch = 0.3 + p.voz * 1.5;
    u.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  const textoValido = (): boolean => {
    if (esApropiado(p.nombre) && esApropiado(p.frase)) return true;
    setAviso({ tipo: 'error', texto: 'El nombre o la frase tienen una palabra que no se permite en la isla. Cámbiala para continuar.' });
    return false;
  };

  const guardar = async () => {
    if (!sesion.usuarioId) return;
    const nombre = p.nombre.trim();
    if (!nombre) { setSeccion('ser'); return setAviso({ tipo: 'error', texto: 'Ponle un nombre a tu personaje antes de guardar.' }); }
    if (!textoValido()) return;
    setGuardando(true);
    const { error } = await supabase.from('personajes').upsert({
      perfil_id: sesion.usuarioId, nombre, apariencia: p.apariencia, personalidad: p.personalidad, voz: p.voz, frase: p.frase.trim(),
    });
    setGuardando(false);
    setAviso(error
      ? { tipo: 'error', texto: `No se pudo guardar: ${error.message}` }
      : { tipo: 'ok', texto: `Guardado. ${nombre} ya vive en ValRigo.` });
  };

  const abrirTarjeta = () => { if (textoValido()) tarjeta(p).then((c) => setImagenTarjeta(c.toDataURL('image/png'))).catch(() => undefined); };

  const actualSeccion = SECCIONES.find((s) => s.id === seccion);

  return (
    <div class="creador">
      <div class="creador-vista">
        <div class="visor" ref={caja} />
        <div class="fila poses">
          {POSES.map(([id, nombre]) => <button key={id} class={`boton ${pose === id ? 'principal' : ''}`} aria-pressed={pose === id} onClick={() => setPose(id)}>{nombre}</button>)}
        </div>
        <p class="tenue chico">Arrastra para girar · 144 combinaciones de cabeza y cuerpo, más colores y accesorios</p>
        <div class="fila">
          <button class="boton" onClick={() => setP((a) => ({ ...C.personajeAleatorio(), nombre: a.nombre, frase: a.frase }))}>Al azar</button>
          <button class="boton" onClick={abrirTarjeta}>Tarjeta para compartir</button>
          {sesion.usuarioId
            ? <button class="boton principal" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar personaje'}</button>
            : <button class="boton principal" onClick={() => entrar()}>Entrar con Discord para guardar</button>}
        </div>
        {aviso && <p class={`aviso ${aviso.tipo}`} role="status">{aviso.texto}</p>}
        {sesion.usuarioId && !sesion.perfil && !sesion.cargando &&
          <p class="aviso error">Tu sesión está iniciada, pero la base de datos aún no tiene tu perfil. Avísale a Pancho.</p>}
      </div>

      <div class="creador-panel">
        <div class="pestanas" role="tablist">
          {SECCIONES.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === seccion} class={s.id === seccion ? 'activa' : ''} onClick={() => setSeccion(s.id)}>{s.titulo}</button>
          ))}
          <button role="tab" aria-selected={seccion === 'ser'} class={seccion === 'ser' ? 'activa' : ''} onClick={() => setSeccion('ser')}>Personalidad</button>
        </div>

        {actualSeccion && actualSeccion.campos.map((campo) => {
          const valor = p.apariencia[campo.k];
          return (
            <div class="campo" key={campo.k}>
              <div class="sigla">{campo.etiqueta}{campo.tipo === 'opcion' && ` · ${campo.opciones.length}`}</div>
              {campo.tipo === 'opcion' && (
                <div class="opciones">
                  {campo.opciones.map((nombre, i) => (
                    <button key={nombre} class={valor === i ? 'elegida' : ''} aria-pressed={valor === i}
                      onClick={() => (campo.k === 'cabeza' || campo.k === 'cuerpo' ? cambiarBase(campo.k, i) : cambiar(campo.k, i))}>
                      <Mini aspecto={paraMinis} campo={campo.k} indice={i} tipo={campo.mini} />
                      <span>{nombre}</span>
                    </button>
                  ))}
                </div>
              )}
              {campo.tipo === 'color' && (
                <div class="colores">
                  {campo.paleta.map((color) => (
                    <button key={color} class={valor === color ? 'elegida' : ''} style={{ background: color }} aria-label={`Color ${color}`} aria-pressed={valor === color} onClick={() => cambiar(campo.k, color)} />
                  ))}
                  <label class="color-libre">Otro<input type="color" value={valor as string} onInput={(e) => cambiar(campo.k, e.currentTarget.value)} /></label>
                </div>
              )}
              {campo.tipo === 'rango' && (
                <div class="rango">
                  <span class="tenue chico">{campo.min}</span>
                  <input type="range" min="0" max="1" step="0.05" value={valor as number} aria-label={campo.etiqueta} onInput={(e) => cambiar(campo.k, Number(e.currentTarget.value))} />
                  <span class="tenue chico">{campo.max}</span>
                </div>
              )}
            </div>
          );
        })}

        {seccion === 'colores' && (
          <>
            {(['cabeza', 'cuerpo'] as const).map((parte) => (
              <div class="campo" key={parte}>
                <div class="sigla">{parte === 'cabeza' ? 'Colores de la cabeza' : 'Colores del cuerpo'}</div>
                <div class="colores">
                  {ranuras.filter((r) => r.parte === parte).map((r) => (
                    <label key={r.id} class="color-libre grande" title="Cambiar este color">
                      <input type="color" value={p.apariencia.colores[r.id] ?? r.color} aria-label={`Un color de ${parte === 'cabeza' ? 'la cabeza' : 'el cuerpo'}`} onInput={(e) => pintar(r.id, e.currentTarget.value)} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <p class="tenue chico">Cada cuadro es un color que usa tu personaje: piel, pelo, polera, pantalón, zapatos. Tócalo para cambiarlo; se conservan sus luces y sombras.</p>
            <button class="boton" onClick={despintar}>Volver a los colores originales</button>
          </>
        )}

        {seccion === 'ser' && (
          <>
            <div class="campo">
              <label class="sigla" for="p-nombre">Nombre del personaje</label>
              <input id="p-nombre" class="texto" maxLength={24} value={p.nombre} placeholder="Cómo te verán en la isla" onInput={(e) => setP({ ...p, nombre: e.currentTarget.value })} />
            </div>
            <div class="campo">
              <div class="sigla">Personalidad</div>
              <div class="opciones sin-imagen">
                {C.PERSONALIDADES.map((nombre) => (
                  <button key={nombre} class={p.personalidad === nombre ? 'elegida' : ''} aria-pressed={p.personalidad === nombre} onClick={() => setP({ ...p, personalidad: nombre })}><span>{nombre}</span></button>
                ))}
              </div>
              <p class="tenue chico">Define qué prefiere hacer tu personaje en la isla y cómo habla.</p>
            </div>
            <div class="campo">
              <label class="sigla" for="p-frase">Frase típica</label>
              <input id="p-frase" class="texto" maxLength={60} value={p.frase} placeholder="Lo que tu personaje dice seguido" onInput={(e) => setP({ ...p, frase: e.currentTarget.value })} />
            </div>
            <div class="campo">
              <div class="sigla">Voz</div>
              <div class="rango">
                <span class="tenue chico">Grave</span>
                <input type="range" min="0" max="1" step="0.05" value={p.voz} aria-label="Tono de voz" onInput={(e) => setP({ ...p, voz: Number(e.currentTarget.value) })} />
                <span class="tenue chico">Aguda</span>
              </div>
              <button class="boton" onClick={probarVoz}>Escuchar</button>
            </div>
          </>
        )}
      </div>

      {imagenTarjeta && (
        <div class="telon" role="dialog" aria-label="Tarjeta para compartir" onClick={() => setImagenTarjeta('')}>
          <div class="ventana" onClick={(e) => e.stopPropagation()}>
            <img src={imagenTarjeta} alt={`Tarjeta de ${p.nombre || 'tu personaje'}`} />
            <div class="fila">
              <a class="boton principal" href={imagenTarjeta} download={`${(p.nombre.trim() || 'personaje').replace(/[^\w-]+/g, '_')}-sustolimpiadas.png`}>Descargar imagen</a>
              <button class="boton" onClick={() => setImagenTarjeta('')}>Cerrar</button>
            </div>
            <p class="tenue chico">Descárgala y pégala en Discord para invitar a más gente.</p>
          </div>
        </div>
      )}
    </div>
  );
}
