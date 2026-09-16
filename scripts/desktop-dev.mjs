import { createServer } from 'vite';
import { spawnSync } from 'node:child_process';
import { launch } from './start-desktop.mjs';
for(const script of ['build:core','build:electron']) {
 const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',['run',script],{stdio:'inherit'});
 if(result.status !== 0) process.exit(result.status ?? 1);
}
const server=await createServer();await server.listen();server.printUrls();
const child=launch({HEIS_DEV_SERVER_URL:server.resolvedUrls.local[0]});
child.on('exit',async code=>{await server.close();process.exit(code??0)});
child.on('error',async error=>{console.error(error);await server.close();process.exit(1)});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
