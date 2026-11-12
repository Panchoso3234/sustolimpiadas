// Corre las pruebas de visión de Golpe Maestro: node pruebas/museo-test.mjs
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entrada = fileURLToPath(new URL('./museo-vision.test.ts', import.meta.url));
const salida = join(tmpdir(), 'museo-vision.test.mjs');
const armar = spawnSync('npx', ['esbuild', `"${entrada}"`, '--bundle', '--platform=node', '--format=esm', `--outfile="${salida}"`, '--log-level=error'], { stdio: 'inherit', shell: true });
if (armar.status) process.exit(armar.status);
const r = spawnSync(process.execPath, ['--test', salida], { stdio: 'inherit' });
process.exit(r.status ?? 1);
