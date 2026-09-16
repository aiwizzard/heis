import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function launch(extraEnv = {}) {
 const env = { ...process.env, ...extraEnv }; delete env.ELECTRON_RUN_AS_NODE;
 return spawn(require('electron'), ['.'], { stdio: 'inherit', env });
}
if (process.argv[1]?.endsWith('start-desktop.mjs')) {
 const child = launch(); child.on('error', e => {console.error(e);process.exit(1)});
 child.on('exit', code => process.exit(code ?? 1));
 for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
}
