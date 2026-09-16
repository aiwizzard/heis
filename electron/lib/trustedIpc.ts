const { BrowserWindow, ipcMain } = require('electron');
const { desktopUrl } = require('./desktopRenderer');
function isTrustedRenderer(event: any): boolean {
 const window = BrowserWindow.fromWebContents(event.sender);
 if(!window || event.senderFrame !== event.sender.mainFrame) return false;
 try { const expected = new URL(desktopUrl()); const actual = new URL(event.senderFrame.url);
 return actual.protocol === expected.protocol && actual.host === expected.host;
 } catch { return false; }
}
function handleTrusted(channel: string, handler: (...args: any[]) => any): void {
 ipcMain.handle(channel, (event: any, ...args: any[]) => {
  if(!isTrustedRenderer(event)) throw new Error('Untrusted renderer');
  return handler(event, ...args);
 });
}
module.exports = { handleTrusted, isTrustedRenderer };
