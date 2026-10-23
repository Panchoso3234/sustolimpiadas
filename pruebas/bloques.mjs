// Prueba el núcleo de TETRIX sin navegador: node pruebas/bloques.mjs
import { patadas, ANCHO, ALTO, OCULTAS, nuevo, celdas, mover, girar, bajar, caerYa, guardar, recibir, paso, sombra, basuraPendiente, comprimir, descomprimir, asentar } from '../src/juegos/arcade/bloquesNucleo.ts';

let malos = 0;
const ver = (nombre, ok, extra = '') => { malos += ok ? 0 : 1; console.log(`${ok ? 'OK  ' : 'MAL '} ${nombre}${extra ? ` · ${extra}` : ''}`); };
const vacio = (e) => { e.tablero.fill(0); };
const poner = (e, filas) => { // filas desde abajo: '#' lleno, '.' vacío
  filas.slice().reverse().forEach((f, k) => { const y = ALTO - 1 - k; [...f].forEach((ch, x) => { e.tablero[y * ANCHO + x] = ch === '#' ? 8 : 0; }); });
};

// 1) Misma semilla, mismas piezas; otra semilla, otras
{
  const a = nuevo('duelo|1'), b = nuevo('duelo|1'), c = nuevo('otra');
  const sec = (e) => { const l = []; for (let i = 0; i < 21; i++) { l.push(e.pieza.t); caerYa(e); if (e.perdio) break; } return l.join(''); };
  const sa = sec(a), sb = sec(b), sc = sec(c);
  ver('la misma semilla da las mismas piezas', sa === sb, sa);
  ver('otra semilla da otras', sa !== sc);
  const bolsa = sa.slice(0, 7).split('').sort().join('');
  ver('cada bolsa de 7 trae las 7 piezas', bolsa === '0123456', bolsa);
}
// 2) Giros: 4 giros vuelven a la misma forma; girar junto a la pared se acomoda (no se sale)
{
  const e = nuevo('giros');
  const antes = JSON.stringify(celdas(e.pieza).sort());
  for (let i = 0; i < 4; i++) girar(e, 1);
  ver('cuatro giros vuelven a la forma inicial', JSON.stringify(celdas(e.pieza).sort()) === antes || e.pieza.t === 1);
  for (let i = 0; i < 6; i++) mover(e, -1);
  let ok = true;
  for (let i = 0; i < 4; i++) { girar(e, 1); if (celdas(e.pieza).some(([x]) => x < 0 || x >= ANCHO)) ok = false; }
  ver('girar pegado a la pared no sale del tablero', ok);
  e.pieza = { t: 0, r: 1, x: -1, y: 5, especial: null };
  ver('la pieza larga vertical pegada a la pared puede girar', girar(e, 1) && celdas(e.pieza).every(([x]) => x >= 0 && x < ANCHO));
}
// 3) Líneas: completar una fila la borra y suma
{
  const e = nuevo('lineas'); vacio(e);
  poner(e, ['####.#####']);
  e.pieza = { t: 0, r: 1, x: 2, y: 5, especial: null }; // la larga vertical cae en el hueco de la columna 4
  const s = sombra(e); const asiento = caerYa(e);
  ver('una línea completa se borra', asiento && asiento.lineas.length === 1, `puntos ${e.puntos}`);
  ver('después de borrar queda lo de arriba', e.tablero.slice((ALTO - 1) * ANCHO).filter((c) => c).length === 1);
}
// 4) Cuádruple y ataque
{
  const e = nuevo('cuadruple'); vacio(e);
  poner(e, ['#.........', '#########.', '#########.', '#########.', '#########.']);
  e.pieza = { t: 0, r: 1, x: 7, y: 3, especial: null };
  const a = caerYa(e);
  ver('cuádruple: 4 líneas y ataque de 4', a && a.lineas.length === 4 && a.ataque === 4, `ataque ${a?.ataque}`);
}
// 5) Basura: llega con hueco, se cancela con tus líneas y sube cuando no haces líneas
{
  const e = nuevo('basura');
  recibir(e, 3, 1, 0);
  ver('basura pendiente', basuraPendiente(e) === 3);
  vacio(e); poner(e, ['#########.', '#########.']);
  e.pieza = { t: 0, r: 1, x: 7, y: 3, especial: null };
  caerYa(e); // un doble: ataque 1 → cancela 1
  ver('tus líneas cancelan basura', basuraPendiente(e) === 2, `quedan ${basuraPendiente(e)}`);
  e.pieza = { t: 1, r: 0, x: 0, y: 2, especial: null };
  caerYa(e); // sin líneas: entra la basura
  const abajo = e.tablero.slice((ALTO - 1) * ANCHO);
  ver('la basura sube por abajo con un hueco', abajo.filter((c) => c === 8).length === ANCHO - 1, abajo.join(''));
}
// 6) Gravedad y asentado con demora
{
  const e = nuevo('gravedad'), y0 = e.pieza.y;
  for (let i = 0; i < 60; i++) paso(e, 1 / 60);
  ver('la pieza cae con el tiempo', e.pieza.y > y0);
  let asentadas = 0; const piezas0 = e.piezas;
  for (let i = 0; i < 60 * 600 && !e.perdio; i++) paso(e, 1 / 60);
  ver('sin tocar nada, el tablero termina lleno (pierde)', e.perdio, `piezas ${e.piezas - piezas0}`);
}
// 7) Guardar: una vez por pieza
{
  const e = nuevo('guardar'), t0 = e.pieza.t;
  ver('guardar la primera vez', guardar(e) && e.guardada === t0);
  ver('no se puede guardar dos veces seguidas', !guardar(e));
}
// 8) Compresión del tablero para la red
{
  const e = nuevo('red'); for (let i = 0; i < 8; i++) caerYa(e);
  const s = comprimir(e), d = descomprimir(s);
  ver('comprimir y descomprimir', d.join() === e.tablero.slice(OCULTAS * ANCHO).join() && s.length === ANCHO * (ALTO - OCULTAS));
}
// 9) Giro maestro: la T entra girada bajo un alero y completa dos líneas
{
  const e = nuevo('maestro'); vacio(e);
  poner(e, ['###.......', '##...#####', '###.######']);
  e.pieza = { t: 2, r: 2, x: 2, y: ALTO - 3, especial: null };
  e.ultimoGiro = true;
  const a = asentar(e);
  ver('giro maestro reconocido', !!a && a.maestro && a.lineas.length === 2, a?.texto);
}
// 10) SRS: un giro maestro doble con jugadas de verdad (bajar la T parada y girarla dentro del hueco)
{
  const e = nuevo('srs'); vacio(e);
  poner(e, ['##........', '#...######', '##.#######']);
  e.pieza = { t: 2, r: 1, x: 1, y: 2, especial: null };
  while (bajar(e));
  const giro = girar(e, 1), a = asentar(e);
  ver('SRS: la T entra girando al hueco y hace un giro maestro doble', giro && !!a && a.maestro && a.lineas.length === 2, a?.texto);
}
// 11) SRS: el orden de las patadas (0 → derecha: en su lugar, izquierda y después arriba a la izquierda)
{
  const e = nuevo('patadas'); vacio(e);
  e.tablero[12 * ANCHO + 5] = 8; e.tablero[12 * ANCHO + 4] = 8;
  e.pieza = { t: 2, r: 0, x: 4, y: 10, especial: null };
  const ok = girar(e, 1);
  ver('SRS: con las dos primeras tapadas, la T sube un casillero a la izquierda', ok && e.pieza.x === 3 && e.pieza.y === 9 && e.pieza.r === 1, JSON.stringify(e.pieza));
}
// 12) Media vuelta (SRS+) y tablas completas
{
  const e = nuevo('media'); const t0 = e.pieza.t;
  ver('media vuelta desde la salida', t0 === 1 || (girar(e, 2) && e.pieza.r === 2));
  const tamanos = [patadas(2, 0, 1).length, patadas(0, 0, 1).length, patadas(2, 0, 2).length, patadas(0, 1, 3).length];
  ver('tablas: 5 patadas por giro y 6 en la media vuelta', tamanos.join() === '5,5,6,6', tamanos.join());
}
console.log(malos ? `${malos} pruebas fallaron` : 'Todo bien');
process.exit(malos ? 1 : 0);
