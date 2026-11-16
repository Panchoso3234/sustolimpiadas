// Corre las pruebas del sorteo de juegos: node pruebas/sorteo-test.mjs
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entrada = fileURLToPath(new URL('./sorteo.test.ts', import.meta.url));
const salida = join(tmpdir(), 'sorteo.test.mjs');
const armar = spawnSync('npx', ['esbuild', `"${entrada}"`, '--bundle', '--platform=node', '--format=esm', `--outfile="${salida}"`, '--log-level=error'], { stdio: 'inherit', shell: true });
if (armar.status) process.exit(armar.status);
const r = spawnSync(process.execPath, ['--test', salida], { stdio: 'inherit' });
process.exit(r.status ?? 1);
