import { resolverPedido, type Pedido } from './bestiasMalla';

// Calcula las mallas orgánicas de Bestiario en segundo plano y las devuelve sin copiarlas (transferibles).
self.onmessage = (ev: MessageEvent<Pedido>) => {
  const r = resolverPedido(ev.data), buffers: ArrayBuffer[] = [];
  for (const m of Object.values(r.mallas)) if (m) buffers.push(m.pos.buffer as ArrayBuffer, m.nor.buffer as ArrayBuffer, m.col.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage(r, buffers);
};
