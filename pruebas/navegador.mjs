// Abre páginas en Edge sin ventana y las maneja por el protocolo de depuración (CDP). Solo para pruebas locales.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function abrir(url, { ancho = 1280, alto = 720 } = {}) {
  const puerto = 9400 + Math.floor(Math.random() * 500), perfil = mkdtempSync(join(tmpdir(), 'edge-'));
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, `--window-size=${ancho},${alto}`, '--use-angle=d3d11', 'about:blank'], { stdio: 'ignore' });
  let lista;
  for (let i = 0; i < 60; i++) { try { lista = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json(); if (lista.some((p) => p.type === 'page')) break; } catch {} await esperar(250); }
  const ws = new WebSocket(lista.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pendientes = new Map(), errores = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; pendientes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url });
  return {
    errores,
    async js(expr) { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; },
    async clic(selector) { return this.js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true; })()`); },
    async foto(ruta) { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(ruta, Buffer.from(r.result.data, 'base64')); },
    cerrar() { ws.close(); edge.kill(); },
  };
}

/** Repite una condición hasta que sea verdadera o se acabe el tiempo. */
export async function hasta(f, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { try { if (await f()) return true; } catch { /* la página todavía carga */ } await esperar(300); }
  return false;
}
