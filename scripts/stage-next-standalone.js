const fs = require('node:fs');
const path = require('node:path');

function copyDirectory(sourceDir, destinationDir, required = true) {
    if (!fs.existsSync(sourceDir)) {
        if (required) {
            throw new Error(`Missing required directory: ${sourceDir}`);
        }
        return false;
    }

    fs.mkdirSync(destinationDir, { recursive: true });
    fs.cpSync(sourceDir, destinationDir, {
        recursive: true,
        force: true,
    });
    return true;
}

function stageNextStandalone(repoRoot = path.resolve(__dirname, '..')) {
    const nextDir = path.join(repoRoot, '.next');
    const standaloneDir = path.join(nextDir, 'standalone');

    if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
        throw new Error(
            `Next.js standalone output is missing from ${standaloneDir}. Run next build first.`
        );
    }

    copyDirectory(
        path.join(nextDir, 'static'),
        path.join(standaloneDir, '.next', 'static')
    );
    copyDirectory(
        path.join(repoRoot, 'public'),
        path.join(standaloneDir, 'public'),
        false
    );

    return standaloneDir;
}

function main() {
    try {
        const standaloneDir = stageNextStandalone();
        console.log(`Staged Next.js desktop assets in ${standaloneDir}`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    copyDirectory,
    stageNextStandalone,
};
