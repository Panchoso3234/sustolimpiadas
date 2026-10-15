import type { RealtimeChannel } from '@supabase/supabase-js';

// Enlace de juego en estrella: el anfitrión se conecta directo (WebRTC) con cada pestaña de la sala y reenvía lo que
// le llega. Supabase solo lleva la señalización. Si con alguien no hay conexión directa, el mensaje viaja por el
// broadcast del canal (respaldo). Cada mensaje lleva un id: así se descartan los que lleguen por los dos caminos.

const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
type Datos = Record<string, unknown>;
interface Mensaje { n: string; tipo: string; datos: Datos; de: string; para?: string }
interface Par { pc: RTCPeerConnection; dc: RTCDataChannel | null; pendientes: RTCIceCandidateInit[] }

export interface Enlace {
  enviar(tipo: string, datos: Datos, para?: string): void;
  alRecibir(f: (tipo: string, datos: Datos, de: string) => void): void;
  /** Con quiénes hay que estar conectado ahora (claves de pestaña) y quién es el anfitrión. */
  actualizar(claves: string[], anfitrion: string | null): void;
  directo(clave: string): boolean;
  cerrar(): void;
}

export function crearEnlace(canal: RealtimeChannel, yo: string, opciones: { sinDirecto?: boolean } = {}): Enlace {
  const pares = new Map<string, Par>(), intentos = new Map<string, number>(), vistos = new Set<string>(), oyentes: ((tipo: string, datos: Datos, de: string) => void)[] = [];
  let anfitrion: string | null = null, contador = 0;
  const senal = (para: string, datos: Datos) => canal.send({ type: 'broadcast', event: 'senal', payload: { de: yo, para, ...datos } });
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
    const pc = new RTCPeerConnection({ iceServers: ICE }), par: Par = { pc, dc: null, pendientes: [] };
    pc.onicecandidate = (ev) => { if (ev.candidate) senal(clave, { ice: ev.candidate.toJSON() }); };
    const preparar = (dc: RTCDataChannel) => { par.dc = dc; dc.onopen = () => intentos.delete(clave); dc.onmessage = (ev) => { try { entregar(JSON.parse(ev.data), true); } catch { /* mensaje roto */ } }; };
    if (inicio) {
      preparar(pc.createDataChannel('juego'));
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => senal(clave, { sdp: pc.localDescription!.toJSON() })).catch(() => undefined);
      // Si la oferta se perdió (la otra pestaña aún no escuchaba el canal), se vuelve a ofrecer unas veces
      const intento = (intentos.get(clave) ?? 0) + 1;
      intentos.set(clave, intento);
      if (intento <= 3) setTimeout(() => { if (pares.get(clave) === par && !abierto(clave)) { cerrarPar(clave); crearPar(clave, true); } }, 6000);
    } else pc.ondatachannel = (ev) => preparar(ev.channel);
    pares.set(clave, par);
    return par;
  };
  const cerrarPar = (clave: string) => { pares.get(clave)?.pc.close(); pares.delete(clave); };

  canal.on('broadcast', { event: 'senal' }, async ({ payload }) => {
    const d = payload as { de: string; para: string; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
    if (d.para !== yo || opciones.sinDirecto) return;
    let par = pares.get(d.de);
    try {
      if (d.sdp?.type === 'offer') { if (par) cerrarPar(d.de); par = crearPar(d.de, false); await par.pc.setRemoteDescription(d.sdp); await par.pc.setLocalDescription(await par.pc.createAnswer()); senal(d.de, { sdp: par.pc.localDescription!.toJSON() }); }
      else if (d.sdp?.type === 'answer' && par) await par.pc.setRemoteDescription(d.sdp);
      if (d.ice && par) { if (par.pc.remoteDescription) await par.pc.addIceCandidate(d.ice); else par.pendientes.push(d.ice); }
      if (par?.pc.remoteDescription) for (const ice of par.pendientes.splice(0)) await par.pc.addIceCandidate(ice);
    } catch { /* señal tardía o de una conexión ya cerrada */ }
  });
  canal.on('broadcast', { event: 'msg' }, ({ payload }) => entregar(payload as Mensaje, false));

  return {
    enviar(tipo, datos, para) { const m: Mensaje = { n: `${yo}:${Date.now().toString(36)}:${++contador}`, tipo, datos, de: yo, para }; vistos.add(m.n); salir(m); },
    alRecibir(f) { oyentes.push(f); },
    actualizar(claves, nuevo) {
      anfitrion = nuevo;
      // El anfitrión ofrece conexión a cada pestaña; los demás solo esperan la del anfitrión
      const deseadas = opciones.sinDirecto ? [] : yo === anfitrion ? claves.filter((k) => k !== yo) : nuevo ? [nuevo] : [];
      for (const k of [...pares.keys()]) if (!deseadas.includes(k)) cerrarPar(k);
      if (yo === anfitrion) for (const k of deseadas) if (!pares.has(k)) crearPar(k, true);
    },
    directo: abierto,
    cerrar() { for (const k of [...pares.keys()]) cerrarPar(k); },
  };
}
