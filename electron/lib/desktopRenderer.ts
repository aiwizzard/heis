const { app, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
function desktopUrl(): string {
 if (!app.isPackaged && process.env.HEIS_DEV_SERVER_URL) {
  const url = new URL(process.env.HEIS_DEV_SERVER_URL);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') throw new Error('Invalid desktop development URL');
  return url.origin;
 }
 return 'heis-app://app';
}
function installDesktopProtocol(): void {
 const root = app.isPackaged ? path.join(process.resourcesPath, 'desktop') : path.join(app.getAppPath(), 'dist-desktop');
 protocol.handle('heis-app', async (request) => {
  try {
   const url = new URL(request.url);
   if(url.hostname !== 'app' || !['GET','HEAD'].includes(request.method)) return new Response('Not found',{status:404});
   const pathname = decodeURIComponent(url.pathname);
   let file = path.resolve(root, '.' + pathname);
   if(file !== root && !file.startsWith(root + path.sep)) return new Response('Forbidden',{status:403});
   if(pathname === '/' || /^\/(zh\/)?studio(\/|$)/.test(pathname)) file=path.join(root,'index.html');
   if(!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found',{status:404});
   return net.fetch(pathToFileURL(file).href);
  } catch { return new Response('Invalid request',{status:400}); }
 });
}
module.exports={desktopUrl,installDesktopProtocol};
