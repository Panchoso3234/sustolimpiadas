// Corre las pruebas del motor de Wild Cards: node pruebas/wildcards-test.mjs
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entrada = fileURLToPath(new URL('./wildcards.test.ts', import.meta.url));
const salida = join(tmpdir(), 'wildcards.test.mjs');
const armar = spawnSync('npx', ['esbuild', `"${entrada}"`, '--bundle', '--platform=node', '--format=esm', `--outfile="${salida}"`, '--log-level=error'], { stdio: 'inherit', shell: true });
if (armar.status) process.exit(armar.status);
const r = spawnSync(process.execPath, ['--test', salida], { stdio: 'inherit', env: { ...process.env, WC_RAIZ: fileURLToPath(new URL('..', import.meta.url)) } });
process.exit(r.status ?? 1);
