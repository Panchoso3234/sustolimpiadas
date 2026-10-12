import type { Apariencia } from './catalogo';

// La cara se dibuja en 2D sobre un lienzo de 1024×512 que envuelve la cabeza 3D.
// El centro del lienzo queda mirando al frente.
const W = 1024, H = 512, CX = W / 2, CY = H / 2;
const NEGRO = '#1c1a22';

/** Aclara u oscurece un color "#rrggbb". */
export function sombra(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function dibujarCara(g: CanvasRenderingContext2D, a: Apariencia, escala = 1) {
  g.save();
  g.scale(escala, escala);
  g.fillStyle = a.piel;
  g.fillRect(0, 0, W, H);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  const pielOscura = sombra(a.piel, 0.78);
  const pelo = a.colorPelo;
  const OY = CY - 6, SEP = 50, BY = CY + 54, NY = CY + 20;

  const elipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    g.fillStyle = color; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  };
  const trazo = (color: string, ancho: number, f: () => void) => {
    g.strokeStyle = color; g.lineWidth = ancho; g.beginPath(); f(); g.stroke();
  };

  // Detalles de piel
  if (a.detalle === 1) for (const s of [-1, 1]) for (const [dx, dy] of [[70, 18], [84, 26], [62, 30], [78, 38]]) elipse(CX + s * dx, CY + dy, 3, 3, pielOscura);
  if (a.detalle === 2) { g.globalAlpha = 0.45; for (const s of [-1, 1]) elipse(CX + s * 80, CY + 30, 22, 13, '#ff7a8a'); g.globalAlpha = 1; }
  if (a.detalle === 3) elipse(CX + 62, CY + 44, 4, 4, '#4a2f1d');
  if (a.detalle === 4) trazo(sombra(a.piel, 0.65), 4, () => { g.moveTo(CX + 38, OY - 34); g.lineTo(CX + 62, OY + 26); });
  if (a.detalle === 5) for (const s of [-1, 1]) trazo(sombra(a.piel, 0.7), 4, () => g.arc(CX + s * SEP, OY + 6, 18, 0.25 * Math.PI, 0.75 * Math.PI));

  if (a.detalle === 6) for (const s of [-1, 1]) for (const dy of [0, 14]) trazo('#ef5565', 7, () => { g.moveTo(CX + s * 62, CY + 22 + dy); g.lineTo(CX + s * 94, CY + 30 + dy); });
  if (a.detalle === 7) {
    g.fillStyle = '#5fb8ff'; g.beginPath(); g.moveTo(CX - SEP - 4, OY + 22); g.quadraticCurveTo(CX - SEP + 8, OY + 44, CX - SEP - 4, OY + 46); g.quadraticCurveTo(CX - SEP - 16, OY + 44, CX - SEP - 4, OY + 22); g.fill();
  }
  if (a.detalle === 8) {
    g.save(); g.translate(CX + 72, CY + 30); g.rotate(-0.4);
    g.fillStyle = '#f2cfa2'; g.beginPath(); g.roundRect(-24, -10, 48, 20, 7); g.fill();
    g.fillStyle = '#e0b888'; g.fillRect(-8, -10, 16, 20);
    g.restore();
  }
  if (a.detalle === 9) trazo('#3a2a35', 4, () => {
    g.moveTo(CX - 100, CY + 6); g.lineTo(CX - 58, CY + 42);
    for (let i = 0; i < 4; i++) { const x = CX - 94 + i * 11, y = CY + 11 + i * 9.5; g.moveTo(x + 7, y - 7); g.lineTo(x - 7, y + 7); }
  });

  // Barba (va debajo de la boca)
  if (a.barba === 6) elipse(CX, BY + 36, 17, 22, pelo);
  if (a.barba === 3 || a.barba === 4) {
    g.globalAlpha = a.barba === 4 ? 0.4 : 1;
    elipse(CX, CY + 96, 122, 74, pelo);
    g.fillStyle = pelo; g.fillRect(CX - 122, CY - 30, 26, 120); g.fillRect(CX + 96, CY - 30, 26, 120);
    elipse(CX, CY + 40, 60, 34, a.piel);
    g.globalAlpha = 1;
  }
  if (a.barba === 5) { g.fillStyle = pelo; g.fillRect(CX - 124, CY - 40, 22, 110); g.fillRect(CX + 102, CY - 40, 22, 110); }
  if (a.barba === 2) trazo(pelo, 9, () => g.ellipse(CX, BY + 2, 34, 26, 0, 0, Math.PI * 2));

  // Boca
  const rojo = '#b8323f';
  switch (a.boca) {
    case 0: trazo(NEGRO, 6, () => g.arc(CX, BY - 14, 30, 0.2 * Math.PI, 0.8 * Math.PI)); break;
    case 1:
      g.fillStyle = '#5a1a22'; g.beginPath(); g.arc(CX, BY - 6, 30, 0, Math.PI); g.closePath(); g.fill();
      elipse(CX, BY + 16, 15, 8, '#ff7a8a'); trazo(NEGRO, 5, () => { g.moveTo(CX - 30, BY - 6); g.lineTo(CX + 30, BY - 6); });
      break;
    case 2: trazo(NEGRO, 6, () => { g.moveTo(CX - 22, BY); g.lineTo(CX + 22, BY); }); break;
    case 3: trazo(NEGRO, 6, () => g.arc(CX, BY + 28, 28, 1.25 * Math.PI, 1.75 * Math.PI)); break;
    case 4: elipse(CX, BY + 2, 12, 16, '#5a1a22'); break;
    case 5:
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect(CX - 28, BY - 12, 56, 24, 10); g.fill();
      trazo(NEGRO, 4, () => { g.roundRect(CX - 28, BY - 12, 56, 24, 10); g.moveTo(CX - 28, BY); g.lineTo(CX + 28, BY); g.moveTo(CX - 9, BY - 12); g.lineTo(CX - 9, BY + 12); g.moveTo(CX + 9, BY - 12); g.lineTo(CX + 9, BY + 12); });
      break;
    case 6: trazo(NEGRO, 6, () => g.arc(CX, BY - 14, 30, 0.2 * Math.PI, 0.8 * Math.PI)); elipse(CX + 8, BY + 18, 10, 12, '#ff6a7a'); break;
    case 7: trazo(NEGRO, 5, () => { g.arc(CX - 12, BY - 4, 12, 0.1 * Math.PI, 0.9 * Math.PI); g.moveTo(CX + 24, BY); g.arc(CX + 12, BY - 4, 12, 0.1 * Math.PI, 0.9 * Math.PI); }); break;
    case 8: trazo(NEGRO, 6, () => { g.moveTo(CX - 22, BY + 4); g.quadraticCurveTo(CX + 6, BY + 8, CX + 26, BY - 12); }); break;
    case 9: trazo(NEGRO, 5, () => g.arc(CX, BY - 6, 9, 0.15 * Math.PI, 0.85 * Math.PI)); break;
    case 10:
      elipse(CX, BY + 4, 22, 11, rojo); elipse(CX - 10, BY - 4, 12, 8, rojo); elipse(CX + 10, BY - 4, 12, 8, rojo);
      trazo(sombra('#b8323f', 0.6), 3, () => { g.moveTo(CX - 22, BY + 1); g.quadraticCurveTo(CX, BY + 6, CX + 22, BY + 1); });
      break;
    case 11:
      trazo(NEGRO, 6, () => g.arc(CX, BY - 14, 30, 0.2 * Math.PI, 0.8 * Math.PI));
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(CX + 8, BY + 12); g.lineTo(CX + 14, BY + 26); g.lineTo(CX + 20, BY + 9); g.closePath(); g.fill();
      break;
    case 12:
      trazo(NEGRO, 6, () => g.arc(CX, BY - 14, 30, 0.2 * Math.PI, 0.8 * Math.PI));
      for (const s of [-1, 1]) { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(CX + s * 8, BY + 13); g.lineTo(CX + s * 14, BY + 30); g.lineTo(CX + s * 20, BY + 10); g.closePath(); g.fill(); }
      break;
    case 13: trazo(NEGRO, 5, () => { g.moveTo(CX - 28, BY); g.lineTo(CX + 28, BY); for (let x = -20; x <= 20; x += 10) { g.moveTo(CX + x, BY - 9); g.lineTo(CX + x, BY + 9); } }); break;
    case 14: elipse(CX, BY, 11, 14, rojo); elipse(CX - 3, BY - 5, 3, 3, '#ff9aa5'); break;
    case 15: trazo(NEGRO, 6, () => { g.moveTo(CX - 28, BY); g.quadraticCurveTo(CX - 14, BY - 14, CX, BY); g.quadraticCurveTo(CX + 14, BY + 14, CX + 28, BY); }); break;
  }
  if (a.barba === 7) for (const s of [-1, 1]) trazo(pelo, 10, () => { g.moveTo(CX, BY - 24); g.quadraticCurveTo(CX + s * 34, BY - 12, CX + s * 56, BY - 36); });

  if (a.barba === 1 || a.barba === 2 || a.barba === 5) {
    for (const s of [-1, 1]) trazo(pelo, 11, () => { g.moveTo(CX, BY - 24); g.quadraticCurveTo(CX + s * 20, BY - 30, CX + s * 36, BY - 14); });
  }

  // Nariz
  switch (a.nariz) {
    case 1: elipse(CX, NY, 4, 4, pielOscura); break;
    case 2: trazo(pielOscura, 5, () => { g.moveTo(CX, NY - 14); g.lineTo(CX, NY + 6); }); break;
    case 3: trazo(pielOscura, 5, () => g.arc(CX, NY - 4, 10, 0.15 * Math.PI, 0.85 * Math.PI)); break;
    case 4: g.fillStyle = pielOscura; g.beginPath(); g.moveTo(CX, NY - 14); g.lineTo(CX + 11, NY + 8); g.lineTo(CX - 11, NY + 8); g.closePath(); g.fill(); break;
    // las narices 5 a 8 tienen volumen y se arman en modelo.ts
  }

  // Ojos
  const abierto = (x: number, rx: number, ry: number, iris: number) => {
    elipse(x, OY, rx, ry, '#fff'); elipse(x, OY, iris, iris, a.colorOjos); elipse(x, OY, iris * 0.5, iris * 0.5, NEGRO);
    elipse(x - iris * 0.35, OY - iris * 0.4, iris * 0.28, iris * 0.28, '#fff');
  };
  const parpado = (x: number, s: number, interno: boolean) => {
    const xi = x - s * 22, xo = x + s * 22;
    g.fillStyle = a.piel; g.beginPath();
    if (interno) { g.moveTo(xi, OY - 24); g.lineTo(xo, OY - 24); g.lineTo(xo, OY - 14); g.lineTo(xi, OY + 2); }
    else { g.moveTo(xi, OY - 24); g.lineTo(xo, OY - 24); g.lineTo(xo, OY + 2); g.lineTo(xi, OY - 14); }
    g.closePath(); g.fill();
  };
  for (const s of [-1, 1]) {
    const x = CX + s * SEP;
    switch (a.ojos) {
      case 0: elipse(x, OY, 9, 13, NEGRO); elipse(x - 3, OY - 5, 3, 3, '#fff'); break;
      case 1: abierto(x, 17, 17, 10); break;
      case 2: abierto(x, 21, 12, 9); trazo(NEGRO, 4, () => g.ellipse(x, OY, 21, 12, 0, Math.PI, 2 * Math.PI)); break;
      case 3: trazo(NEGRO, 6, () => g.arc(x, OY + 8, 15, Math.PI, 2 * Math.PI)); break;
      case 4: trazo(NEGRO, 6, () => g.arc(x, OY - 8, 15, 0, Math.PI)); break;
      case 5:
        elipse(x, OY, 20, 24, '#fff'); elipse(x, OY + 2, 14, 18, a.colorOjos); elipse(x, OY + 3, 7, 10, NEGRO);
        elipse(x - 6, OY - 8, 5, 5, '#fff'); elipse(x + 6, OY + 9, 3, 3, '#fff');
        break;
      case 6:
        abierto(x, 17, 17, 10);
        trazo(NEGRO, 4, () => { for (const [dx, dy] of [[14, -12], [20, -5], [22, 3]]) { g.moveTo(x + s * dx, OY + dy); g.lineTo(x + s * (dx + 9), OY + dy - 6); } });
        break;
      case 7: abierto(x, 19, 8, 7); trazo(NEGRO, 5, () => { g.moveTo(x - 20, OY - 7); g.lineTo(x + 20, OY - 7); }); break;
      case 8: abierto(x, 17, 17, 10); parpado(x, s, true); trazo(NEGRO, 5, () => { g.moveTo(x - s * 20, OY + 2); g.lineTo(x + s * 20, OY - 14); }); break;
      case 9: abierto(x, 17, 17, 10); parpado(x, s, false); trazo(NEGRO, 5, () => { g.moveTo(x - s * 20, OY - 14); g.lineTo(x + s * 20, OY + 2); }); break;
      case 10: elipse(x, OY, 5, 5, NEGRO); break;
      case 11:
        if (s < 0) trazo(NEGRO, 6, () => g.arc(x, OY + 8, 15, Math.PI, 2 * Math.PI));
        else abierto(x, 17, 17, 10);
        break;
      case 12:
        g.save(); g.translate(x, OY); g.rotate(-s * 0.22);
        elipse(0, 0, 22, 9, '#fff'); elipse(0, 0, 8, 8, a.colorOjos); elipse(0, 0, 4, 4, NEGRO);
        trazo(NEGRO, 4, () => g.ellipse(0, 0, 22, 9, 0, Math.PI, 2 * Math.PI));
        g.restore();
        break;
      case 13:
        g.fillStyle = '#ffd84a'; g.strokeStyle = NEGRO; g.lineWidth = 3; g.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 8 : 19, ang = (i * Math.PI) / 5 - Math.PI / 2; g.lineTo(x + Math.cos(ang) * r, OY + Math.sin(ang) * r); }
        g.closePath(); g.fill(); g.stroke();
        break;
      case 14: trazo(NEGRO, 6, () => { g.moveTo(x - 12, OY - 12); g.lineTo(x + 12, OY + 12); g.moveTo(x + 12, OY - 12); g.lineTo(x - 12, OY + 12); }); break;
      case 15: trazo(NEGRO, 4, () => { for (let t = 0; t < 16; t += 0.3) g.lineTo(x + Math.cos(t) * t * 1.15, OY + Math.sin(t) * t * 1.15); }); break;
      case 16:
        trazo(NEGRO, 6, () => g.arc(x, OY - 8, 15, 0, Math.PI));
        trazo(NEGRO, 4, () => { for (const [dx, dy] of [[14, 2], [9, 9], [2, 12]]) { g.moveTo(x + s * dx, OY + dy - 6); g.lineTo(x + s * (dx + 7), OY + dy + 2); } });
        break;
    }
  }

  // Cejas: [inclinación, curva, grosor, largo]
  const ceja = [[0, 0, 7, 20], [0, 14, 7, 22], [11, 0, 8, 20], [-10, 5, 7, 20], [0, 7, 13, 22], [0, 9, 3, 22], [0, 3, 8, 11], null, [0, 2, 10, 22], [0, 6, 9, 21]][a.cejas];
  if (a.cejas === 8) trazo(sombra(pelo, 0.85), 10, () => { g.moveTo(CX - SEP, OY - 35); g.lineTo(CX + SEP, OY - 35); });
  if (ceja) {
    const [inc, curva, grosor, largo] = ceja;
    for (const s of [-1, 1]) {
      const x = CX + s * SEP, y = OY - 34;
      trazo(sombra(pelo, 0.85), grosor, () => { g.moveTo(x - s * largo, y + inc); g.quadraticCurveTo(x, y - curva, x + s * largo, y - inc * 0.3); });
    }
  }

  if (a.cejas === 9) trazo(a.piel, 6, () => { g.moveTo(CX + SEP + 12, OY - 48); g.lineTo(CX + SEP + 5, OY - 22); });

  // Lentes
  if (a.lentes === 6 || a.lentes === 8) {
    const marco = a.lentes === 6 ? '#d6336c' : '#d4a72c';
    for (const s of [-1, 1]) {
      const x = CX + s * SEP;
      g.fillStyle = a.lentes === 6 ? 'rgba(255,90,140,.55)' : 'rgba(40,50,70,.78)';
      g.strokeStyle = marco; g.lineWidth = 5; g.beginPath();
      if (a.lentes === 6) {
        const r = 24, y = OY + 2;
        g.moveTo(x, y + r); g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45); g.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r);
      } else g.ellipse(x, OY + 4, 28, 23, 0, 0, Math.PI * 2);
      g.fill(); g.stroke();
      trazo(marco, 5, () => { g.moveTo(x + s * 28, OY - 6); g.lineTo(x + s * 80, OY - 12); });
    }
    trazo(marco, 5, () => { g.moveTo(CX - SEP + 26, OY - 6); g.lineTo(CX + SEP - 26, OY - 6); });
  }
  if (a.lentes === 7) {
    trazo(NEGRO, 5, () => { g.moveTo(CX - 150, OY - 62); g.lineTo(CX + SEP, OY - 8); g.lineTo(CX + 150, OY + 22); });
    elipse(CX + SEP, OY, 25, 23, NEGRO);
  }
  if (a.lentes > 0 && a.lentes < 6) {
    const marco = a.lentes === 5 ? 9 : 5;
    if (a.lentes === 3) {
      for (const s of [-1, 1]) { g.fillStyle = NEGRO; g.beginPath(); g.roundRect(CX + s * SEP - 28, OY - 20, 56, 38, 12); g.fill(); }
    }
    trazo(NEGRO, marco, () => {
      if (a.lentes === 4) { g.arc(CX + SEP, OY, 27, 0, Math.PI * 2); g.moveTo(CX + SEP + 19, OY + 19); g.quadraticCurveTo(CX + 110, OY + 90, CX + 90, OY + 150); return; }
      for (const s of [-1, 1]) {
        const x = CX + s * SEP;
        if (a.lentes === 1) { g.moveTo(x + 27, OY); g.arc(x, OY, 27, 0, Math.PI * 2); }
        else g.roundRect(x - 28, OY - 20, 56, 38, a.lentes === 2 ? 6 : 12);
        g.moveTo(x + s * 28, OY - 4); g.lineTo(x + s * 80, OY - 10);
      }
      g.moveTo(CX - SEP + 28, OY - 2); g.lineTo(CX + SEP - 28, OY - 2);
    });
  }

  g.restore();
}
