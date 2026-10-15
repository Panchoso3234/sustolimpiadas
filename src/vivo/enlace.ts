import type { RealtimeChannel } from '@supabase/supabase-js';

// Enlace de juego en estrella: el anfitrión se conecta directo (WebRTC) con cada pestaña de la sala y reenvía lo que
// le llega. Supabase solo lleva la señalización. Si con alguien no hay conexión directa, el mensaje viaja por el
// broadcast del canal (respaldo). Cada mensaje lleva un id: así se descartan los que lleguen por los dos caminos.

const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
type Datos = Record<string, unknown>;
interface Mensaje { n: string; tipo: string; datos: Datos; de: string; para?: string }
interface Par { pc: RTCPeerConnection; dc: RTCDataChannel | null }

export interface Enlace {
  enviar(tipo: string, datos: Datos, para?: string): void;
  alRecibir(f: (tipo: string, datos: Datos, de: string) => void): void;
  /** Con quiénes hay que estar conectado ahora (claves de pestaña) y quién es el anfitrión. */
  actualizar(claves: string[], anfitrion: string | null): void;
  directo(clave: string): boolean;
  /** Avisa a la sala que esta pestaña acaba de entrar (o recargar): las conexiones viejas con ella están muertas. */
  saludar(): void;
  cerrar(): void;
  /** Solo para pruebas: cuántas señales mandó por Supabase y cortar las conexiones directas. */
  senales(): number;
  cortar(): void;
  depurar(): { anfitrion: string | null; pares: [string, string][] };
}

export function crearEnlace(canal: RealtimeChannel, yo: string, opciones: { sinDirecto?: boolean } = {}): Enlace {
  const pares = new Map<string, Par>(), intentos = new Map<string, number>(), vistos = new Set<string>(), oyentes: ((tipo: string, datos: Datos, de: string) => void)[] = [];
  let anfitrion: string | null = null, contador = 0, enviadas = 0;
  const senal = (para: string, datos: Datos) => { enviadas++; canal.send({ type: 'broadcast', event: 'senal', payload: { de: yo, para, ...datos } }); };
  /** Espera a que el navegador junte sus rutas de red (o 2,5 s): así cada lado manda una sola señal con todo y cada conexión gasta 2 mensajes de Supabase. */
  const rutasListas = (pc: RTCPeerConnection) => new Promise<void>((listo) => {
    if (pc.iceGatheringState === 'complete') return listo();
    const tope = setTimeout(listo, 2500);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(tope); listo(); } });
  });
  const abierto = (clave: string) => pares.get(clave)?.dc?.readyState === 'open';

  const entregar = (m: Mensaje, porDirecto: boolean) => {
    if (vistos.has(m.n)) return;
    vistos.add(m.n);
    if (vistos.size > 2000) vistos.delete(vistos.values().next().value as string);
    if (!m.para || m.para === yo) for (const f of oyentes) f(m.tipo, m.datos, m.de);
    // El anfitrión reenvía lo que le llegó directo a quienes no lo tienen
    if (yo === anfitrion && porDirecto) salir(m, m.de);
  };
  /** Manda un mensaje: directo a quien se pueda y, si falta alguien, también por el respaldo. */
  const salir = (m: Mensaje, excepto?: string) => {
    const texto = JSON.stringify(m);
    const destinos = yo === anfitrion ? [...pares.keys()].filter((k) => k !== excepto && (!m.para || m.para === k)) : anfitrion && anfitrion !== yo ? [anfitrion] : [];
    // Sin destinos directos (sala recién armada, o sin conexión directa) todo va por el respaldo
    let faltan = destinos.length === 0 && !excepto;
    for (const k of destinos) { if (abierto(k)) pares.get(k)!.dc!.send(texto); else faltan = true; }
    if (faltan) canal.send({ type: 'broadcast', event: 'msg', payload: m });
  };

  const crearPar = (clave: string, inicio: boolean): Par => {
    const pc = new RTCPeerConnection({ iceServers: ICE }), par: Par = { pc, dc: null };
    const preparar = (dc: RTCDataChannel) => {
      par.dc = dc;
      dc.onopen = () => intentos.delete(clave);
      dc.onmessage = (ev) => { try { entregar(JSON.parse(ev.data), true); } catch { /* mensaje roto */ } };
      // Si la conexión directa muere y la pestaña sigue en la sala, el anfitrión la vuelve a ofrecer
      dc.onclose = () => { if (yo === anfitrion && pares.get(clave) === par) setTimeout(() => { if (pares.get(clave) === par) { intentos.delete(clave); cerrarPar(clave); crearPar(clave, true); } }, 1500); };
    };
    if (inicio) {
      preparar(pc.createDataChannel('juego'));
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => rutasListas(pc)).then(() => { if (pares.get(clave) === par) senal(clave, { sdp: pc.localDescription!.toJSON() }); }).catch(() => undefined);
      // Si la oferta se perdió (la otra pestaña aún no escuchaba el canal), se vuelve a ofrecer unas veces
      const intento = (intentos.get(clave) ?? 0) + 1;
      intentos.set(clave, intento);
      if (intento <= 3) setTimeout(() => { if (pares.get(clave) === par && !abierto(clave)) { cerrarPar(clave); crearPar(clave, true); } }, 8000);
    } else pc.ondatachannel = (ev) => preparar(ev.channel);
    pares.set(clave, par);
    return par;
  };
  const cerrarPar = (clave: string) => { pares.get(clave)?.pc.close(); pares.delete(clave); };

  canal.on('broadcast', { event: 'senal' }, async ({ payload }) => {
    const d = payload as { de: string; para: string; sdp?: RTCSessionDescriptionInit };
    if (d.para !== yo || opciones.sinDirecto) return;
    const par = pares.get(d.de);
    try {
      if (d.sdp?.type === 'offer') {
        // Solo se acepta la oferta de quien uno cree anfitrión: si dos pestañas se creen anfitrión a la vez (una
        // recargó), sus ofertas se cruzarían y la conexión quedaría rota. Si me equivoco, el reintento del anfitrión llega.
        if (d.de !== anfitrion) return;
        if (par) cerrarPar(d.de);
        const nuevo = crearPar(d.de, false);
        await nuevo.pc.setRemoteDescription(d.sdp);
        await nuevo.pc.setLocalDescription(await nuevo.pc.createAnswer());
        await rutasListas(nuevo.pc);
        if (pares.get(d.de) === nuevo) senal(d.de, { sdp: nuevo.pc.localDescription!.toJSON() });
      } else if (d.sdp?.type === 'answer' && par && !par.pc.remoteDescription) await par.pc.setRemoteDescription(d.sdp);
    } catch { /* señal tardía o de una conexión ya cerrada */ }
  });
  canal.on('broadcast', { event: 'msg' }, ({ payload }) => entregar(payload as Mensaje, false));
  // Una pestaña que recarga conserva su clave, pero su conexión anterior ya no existe aunque aquí siga "abierta":
  // se descarta para no mandarle mensajes que se perderían, y el anfitrión le ofrece una nueva
  canal.on('broadcast', { event: 'hola' }, ({ payload }) => {
    const de = (payload as { de: string }).de;
    if (!pares.has(de)) return;
    cerrarPar(de);
    intentos.delete(de);
    if (yo === anfitrion && !opciones.sinDirecto) crearPar(de, true);
  });

  return {
    enviar(tipo, datos, para) { const m: Mensaje = { n: `${yo}:${Date.now().toString(36)}:${++contador}`, tipo, datos, de: yo, para }; vistos.add(m.n); salir(m); },
    alRecibir(f) { oyentes.push(f); },
    actualizar(claves, nuevo) {
      anfitrion = nuevo;
      // El anfitrión ofrece conexión a cada pestaña; los demás solo esperan la del anfitrión
      const deseadas = opciones.sinDirecto ? [] : yo === anfitrion ? claves.filter((k) => k !== yo) : nuevo ? [nuevo] : [];
      for (const k of [...pares.keys()]) if (!deseadas.includes(k)) { cerrarPar(k); intentos.delete(k); } // si vuelve, parte con sus intentos de nuevo
      if (yo === anfitrion) for (const k of deseadas) if (!pares.has(k)) crearPar(k, true);
    },
    directo: abierto,
    saludar() { canal.send({ type: 'broadcast', event: 'hola', payload: { de: yo } }); },
    cerrar() { for (const k of [...pares.keys()]) cerrarPar(k); },
    senales: () => enviadas,
    depurar: () => ({ anfitrion, pares: [...pares].map(([k, p]) => [k, p.dc?.readyState ?? 'sin canal']) }),
    cortar() { for (const p of pares.values()) p.dc?.close(); },
  };
}
