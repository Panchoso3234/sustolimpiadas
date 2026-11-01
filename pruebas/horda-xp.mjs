// Horda Infinita: la experiencia nunca se pierde, aunque queden cientos de cristales en el suelo
// (reporte de LewVan, 2026-10-31: pasado un tope se borraban los cristales más viejos y perdió unos 5 niveles).
// Toda la experiencia soltada debe quedar recogida o en el suelo, y los cristales en el suelo no pasan de 300.
// node pruebas/horda-xp.mjs [segundos=150]  (con el servidor de desarrollo en el puerto 5173)
import { abrir, esperar, hasta, limpiarPerfiles } from './navegador.mjs';

const segundos = Number(process.argv[2] ?? 150), salida = {};
const caso = async (piloto) => {
  const p = await abrir(`http://localhost:5173/?auto=1&piloto=${piloto}#/juegos/horda`, { ancho: 900, alto: 560 });
  try {
    await hasta(() => p.js("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Práctica'))"), 60000);
    await p.js("[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Práctica')).click(), 1");
    await hasta(() => p.js('!!window.__horda'), 60000);
    let maxCristales = 0, x;
    for (let n = 0; n < segundos / 3; n++) { await esperar(3000); x = await p.js('window.__horda()'); maxCristales = Math.max(maxCristales, x.cristales); if (x.terminado) break; }
    const cuadra = x.xpSoltada === x.xpRecogida + x.xpSuelo;
    console.log(piloto, `${x.seg} s · nivel ${x.nivel} · soltada ${x.xpSoltada} = recogida ${x.xpRecogida} + suelo ${x.xpSuelo} · cristales máx ${maxCristales}`);
    salida[`piloto ${piloto}: no se pierde experiencia (${x.xpSoltada} soltada, ${x.xpRecogida + x.xpSuelo} recogida o en el suelo)`] = cuadra && x.xpSoltada > 0;
    salida[`piloto ${piloto}: cristales en el suelo ≤ 300 (máx ${maxCristales})`] = maxCristales <= 300;
    salida[`piloto ${piloto}: sin errores`] = !p.errores.length;
    if (p.errores.length) console.log(p.errores.slice(0, 3));
  } catch (err) { console.log('falló:', err?.message ?? err); } finally { p.cerrar(); }
};
await Promise.all(['torpe', 'bueno'].map(caso));
for (const [k, v] of Object.entries(salida)) console.log(`${v ? 'OK  ' : 'MAL '} ${k}`);
await limpiarPerfiles();
process.exit(Object.values(salida).length === 6 && Object.values(salida).every(Boolean) ? 0 : 1);
