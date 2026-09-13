const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    stageNextStandalone,
} = require(path.join(process.cwd(), 'scripts', 'stage-next-standalone'));

test('stageNextStandalone copies static and public assets beside the standalone server', (t) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heis-next-stage-'));
    t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

    fs.mkdirSync(path.join(repoRoot, '.next', 'standalone'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, '.next', 'standalone', 'server.js'), '');

    fs.mkdirSync(path.join(repoRoot, '.next', 'static', 'chunks'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, '.next', 'static', 'chunks', 'desktop.js'), 'chunk');

    fs.mkdirSync(path.join(repoRoot, 'public'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'public', 'banner.png'), 'banner');

    stageNextStandalone(repoRoot);

    assert.equal(
        fs.readFileSync(
            path.join(repoRoot, '.next', 'standalone', '.next', 'static', 'chunks', 'desktop.js'),
            'utf8'
        ),
        'chunk'
    );
    assert.equal(
        fs.readFileSync(path.join(repoRoot, '.next', 'standalone', 'public', 'banner.png'), 'utf8'),
        'banner'
    );
});

test('stageNextStandalone fails clearly before a standalone build exists', (t) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heis-next-stage-'));
    t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

    assert.throws(
        () => stageNextStandalone(repoRoot),
        /Next\.js standalone output is missing/
    );
});
