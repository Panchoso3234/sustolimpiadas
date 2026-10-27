// Abre páginas en Edge sin ventana y las maneja por el protocolo de depuración (CDP). Solo para pruebas locales.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Perfiles temporales que todavía no se borran (Edge los suelta un rato después de cerrarse)
const perfilesVivos = new Set();
const borrarPerfil = (dir, intento = 0) => { try { rmSync(dir, { recursive: true, force: true }); perfilesVivos.delete(dir); } catch { if (intento < 10) setTimeout(() => borrarPerfil(dir, intento + 1), 700); } };
/** Antes de salir del script: espera a que se borren los perfiles (si no, se acumulan y llenan el disco). */
export async function limpiarPerfiles() { for (let i = 0; i < 20 && perfilesVivos.size; i++) { for (const d of perfilesVivos) borrarPerfil(d, 99); await esperar(500); } }

export async function abrir(url, { ancho = 1280, alto = 720, escala = 1 } = {}) {
  // Si Edge no arranca (por ejemplo, el puerto estaba ocupado), se intenta de nuevo con otro puerto
  // Cada Edge usa un perfil temporal; se borra al cerrar (antes se acumulaban y llenaron el disco)
  let edge, lista, perfil;
  for (let intento = 0; intento < 3 && !lista?.some((p) => p.type === 'page'); intento++) {
    if (edge) { edge.kill(); const viejo = perfil; setTimeout(() => borrarPerfil(viejo), 1500); }
    const puerto = 9400 + Math.floor(Math.random() * 500);
    perfil = mkdtempSync(join(tmpdir(), 'edge-'));
    perfilesVivos.add(perfil);
    edge = spawn(EDGE, ['--headless=new', '--mute-audio', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, `--window-size=${ancho},${alto}`, '--use-angle=d3d11', 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { try { lista = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json(); if (lista.some((p) => p.type === 'page')) break; } catch {} await esperar(250); }
  }
  const ws = new WebSocket(lista.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pendientes = new Map(), errores = [], consola = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
    // console.error de la página (no cuenta como error de la prueba, pero sirve para saber por qué algo falló)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consola.push(m.params.args.map((x) => x.description ?? x.value).join(' '));
    if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; pendientes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: escala, mobile: false });
  // Sin el recorrido de bienvenida: tapa la página en las pruebas
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('susto.recorrido', 'true') } catch {}" });
  await cdp('Page.navigate', { url });
  return {
    errores,
    cdp,
    consola,
    async js(expr) { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; },
    async clic(selector) { return this.js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true; })()`); },
    async foto(ruta) { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(ruta, Buffer.from(r.result.data, 'base64')); },
    // En Windows matar el proceso no siempre cierra la página: se pide a Edge que se cierre entero
    cerrar() { try { ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' })); } catch {} setTimeout(() => { ws.close(); edge.kill(); setTimeout(() => borrarPerfil(perfil), 1500); }, 300); },
  };
}

/** Repite una condición hasta que sea verdadera o se acabe el tiempo. */
export async function hasta(f, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { try { if (await f()) return true; } catch { /* la página todavía carga */ } await esperar(300); }
  return false;
}
