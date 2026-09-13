const fs = require('node:fs');
const path = require('node:path');

const IPC_IMPORT = "const { IPC_CHANNELS } = require('@heis/core');";

function inlineIpcChannels({ preloadPath, ipcChannels }) {
    const source = fs.readFileSync(preloadPath, 'utf8');
    const importCount = source.split(IPC_IMPORT).length - 1;

    if (importCount !== 1) {
        throw new Error(
            `Expected exactly one @heis/core IPC import in ${preloadPath}, found ${importCount}.`
        );
    }

    const replacement = `const IPC_CHANNELS = Object.freeze(${JSON.stringify(ipcChannels)});`;
    fs.writeFileSync(preloadPath, source.replace(IPC_IMPORT, replacement));
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
    inlineIpcChannels,
};
