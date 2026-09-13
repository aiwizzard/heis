const fs = require('node:fs');
const path = require('node:path');

const IPC_IMPORT = "const { IPC_CHANNELS } = require('@heis/core');";
const INLINED_IPC_CHANNELS = /const IPC_CHANNELS = Object\.freeze\(\{[^\n]*\}\);/g;

function inlineIpcChannels({ preloadPath, ipcChannels }) {
    const source = fs.readFileSync(preloadPath, 'utf8');
    const importCount = source.split(IPC_IMPORT).length - 1;
    const inlineCount = source.match(INLINED_IPC_CHANNELS)?.length ?? 0;

    if (importCount + inlineCount !== 1) {
        throw new Error(
            `Expected exactly one IPC channel declaration in ${preloadPath}, found ${importCount + inlineCount}.`
        );
    }

    const replacement = `const IPC_CHANNELS = Object.freeze(${JSON.stringify(ipcChannels)});`;
    const updatedSource = importCount === 1
        ? source.replace(IPC_IMPORT, replacement)
        : source.replace(INLINED_IPC_CHANNELS, replacement);
    fs.writeFileSync(preloadPath, updatedSource);
}

function main() {
    const repoRoot = path.resolve(__dirname, '..');
    const preloadPath = path.join(repoRoot, 'dist-electron', 'preload.js');
    const { IPC_CHANNELS } = require('@heis/core');

    inlineIpcChannels({ preloadPath, ipcChannels: IPC_CHANNELS });
    console.log(`Made Electron preload self-contained at ${preloadPath}`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

module.exports = {
    IPC_IMPORT,
    INLINED_IPC_CHANNELS,
    inlineIpcChannels,
};
