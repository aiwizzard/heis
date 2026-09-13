const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    IPC_IMPORT,
    inlineIpcChannels,
} = require(path.join(process.cwd(), 'scripts', 'finalize-electron-preload'));

test('inlineIpcChannels removes workspace imports from the sandboxed preload', (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heis-preload-'));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const preloadPath = path.join(tempDir, 'preload.js');
    fs.writeFileSync(
        preloadPath,
        `${IPC_IMPORT}\ncontextBridge.exposeInMainWorld('heis', IPC_CHANNELS);\n`
    );

    inlineIpcChannels({
        preloadPath,
        ipcChannels: { authGetSession: 'auth:get-session' },
    });

    const output = fs.readFileSync(preloadPath, 'utf8');
    assert.doesNotMatch(output, /require\(['"]@heis\/core['"]\)/);
    assert.match(output, /Object\.freeze\(\{"authGetSession":"auth:get-session"\}\)/);
    assert.match(output, /contextBridge\.exposeInMainWorld\('heis'/);
});

test('inlineIpcChannels fails when the expected preload import changes', (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heis-preload-'));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const preloadPath = path.join(tempDir, 'preload.js');
    fs.writeFileSync(preloadPath, 'const preload = true;\n');

    assert.throws(
        () => inlineIpcChannels({ preloadPath, ipcChannels: {} }),
        /Expected exactly one @heis\/core IPC import/
    );
});
