const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('node:path');
const { CodexService } = require('./service');
const { handleTrusted } = require('../lib/trustedIpc');
function registerAgent(bridge: any, secureStore: any): { dispose(): void } {
 const service = new CodexService(app.getPath('userData'), (state: any) => {
  for(const win of BrowserWindow.getAllWindows()) win.webContents.send('heis-agent:snapshot',state);
 }, async (value: string) => {
  const url = new URL(value);
  if(url.protocol !== 'https:' || !['auth.openai.com','chatgpt.com','auth0.openai.com'].includes(url.hostname)) throw new Error('Unexpected authentication URL');
  await shell.openExternal(url.href);
 }, path.join(app.isPackaged ? path.join(process.resourcesPath,'codex-runtime') : path.join(app.getAppPath(),'dist-codex'),'bin',process.platform === 'win32' ? 'codex.exe' : 'codex'), async () => {
  const connection = await bridge.start();
  const mcp = path.join(__dirname,'../mcp/heisMcpServer.js');
  const env: NodeJS.ProcessEnv = { HEIS_MCP_BRIDGE_URL: connection.url, HEIS_MCP_BRIDGE_TOKEN: connection.token, ELECTRON_RUN_AS_NODE: '1' };
  const key = secureStore.get('openaiApiKey'); if(key) env.OPENAI_API_KEY=key;
  return {args:['-c',`mcp_servers.heis.command=${JSON.stringify(process.execPath)}`,'-c',`mcp_servers.heis.args=${JSON.stringify([mcp])}`],env};
 });
 const register = (name: string, fn: (...args: any[])=>any) => handleTrusted('heis-agent:'+name, (_event: any,...args: any[])=>fn(...args));
 register('snapshot',()=>service.snapshot());
 register('refresh',()=>service.reconnect());register('login',()=>service.login());register('cancel-login',()=>service.cancelLogin());
 register('send',(input:any)=>service.send(input));register('stop',(id:string)=>service.stop(id));register('answer',(input:any)=>service.answer(input));register('import-drafts',(input:any)=>service.importDrafts(input));
 register('choose-directory',async()=>{
  const owner=BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const result=await dialog.showOpenDialog(owner,{properties:['openDirectory'],title:'Choose an agent project'});
  const folder=result.canceled?null:result.filePaths[0];if(folder)service.addProject(folder);return folder;
 });
 register('choose-codex',async()=>{
  const result=await dialog.showOpenDialog({properties:['openFile'],title:'Choose Codex executable'});
  if(!result.canceled&&result.filePaths[0])await service.chooseBinary(result.filePaths[0]);
 });
 return {dispose:()=>service.dispose()};
}
module.exports={registerAgent};
