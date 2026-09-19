import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { generateKeyPairSync, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright-core';
const require = createRequire(import.meta.url);
const userData = await mkdtemp(join(tmpdir(), 'heis-desktop-smoke-'));
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const entitlement = { accountId:'test', installationId:'test', mode:'creator', checkedAt:new Date().toISOString(), validUntil:new Date(Date.now()+3600000).toISOString(), deviceLimit:3, canEdit:true, canExport:true, canUseManagedGeneration:true };
entitlement.signature = sign(null, Buffer.from(JSON.stringify(entitlement,Object.keys(entitlement).sort())),privateKey).toString('base64');
if(process.env.HEIS_TEST_FREE !== '1') await writeFile(join(userData,'entitlement.json'),JSON.stringify(entitlement));
const env = {...process.env, HEIS_DISABLE_UPDATES:"1", HEIS_ENTITLEMENT_PUBLIC_KEY:publicKey.export({type:'spki',format:'pem'}), HEIS_CODEX_BINARY:resolve('scripts/fixtures/codex-mock.mjs')};
if(process.env.HEIS_TEST_REAL_CODEX === '1') delete env.HEIS_CODEX_BINARY;
delete env.ELECTRON_RUN_AS_NODE; delete env.HEIS_DEV_SERVER_URL;
const packaged = process.env.HEIS_TEST_EXECUTABLE;
const app = await electron.launch({executablePath:packaged || require('electron'),args:[...(packaged?[]:['.']),'--user-data-dir='+userData],env});

const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForURL('heis-app://app/**');
  await app.evaluate(({ ipcMain }) => {
    globalThis.layerRequests = [];
    ipcMain.removeHandler('generation:upload');
    ipcMain.handle('generation:upload', () => ({ ok: true, value: { url: 'https://layers.test/source.png' } }));
    ipcMain.removeHandler('generation:submit');
    ipcMain.handle('generation:submit', (_event, request) => {
      globalThis.layerRequests.push(request);
      return { ok: true, value: { id: 'layers-test', status: 'submitted', outputs: [] } };
    });
    ipcMain.removeHandler('generation:get-job');
    ipcMain.handle('generation:get-job', () => ({ ok: true, value: globalThis.layerFailure
      ? { id: 'layers-test', status: 'failed', error: { message: 'Layer provider is unavailable. Retry later.' } }
      : { id: 'layers-test', status: 'succeeded', outputs: [0,1,2,3].map(i => ({ id: String(i), url: `https://layers.test/layer-${i}.png`, kind: 'image' })) } }));
  });
  const sharp = require('sharp');
  const fixture = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 100, g: 120, b: 170, alpha: .5 } } }).png().toBuffer();
  await page.route('https://layers.test/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: fixture, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('heis-app://app/studio/layers');
  const separate = page.getByRole('button', { name: 'Separate layers', exact: true });
  await separate.waitFor();
  assert.equal(await separate.isDisabled(), true);
  await page.locator('.image-layers input[type=file]').setInputFiles({ name: 'source.png', mimeType: 'image/png', buffer: fixture });
  await page.getByAltText('Source image').waitFor();
  await page.getByLabel('Requested layers').selectOption('4');
  page.once('dialog', dialog => dialog.dismiss());
  await separate.click();
  await page.getByLabel('Image layers workspace').getByRole('alert').filter({ hasText: 'Generation cancelled.' }).waitFor();
  assert.equal(await app.evaluate(() => globalThis.layerRequests.length), 0);
  page.once('dialog', dialog => dialog.accept());
  await separate.click();
  await page.getByRole('heading', { name: '4 layers ready' }).waitFor();
  const requests = await app.evaluate(() => globalThis.layerRequests);
  assert.equal(requests[0].modelId, 'heis-image-layers');
  assert.deepEqual(requests[0].inputs.settings, { layers: 4 });
  assert.equal(requests[0].inputs.outputFormat, 'TIFF');
  await page.getByRole('button', { name: 'Layer 3', exact: true }).click();
  assert.match(await page.getByAltText('Layer 3').getAttribute('src'), /layer-2/);
  await mkdir('test-results/layers', { recursive: true });
  assert.ok(await page.locator('.image-layers header').evaluate(e => e.getBoundingClientRect().top >= 0), 'Selecting a layer keeps the header visible');
  await page.locator('[data-testid=global-notification-stack] button[aria-label]').evaluateAll(buttons => buttons.forEach(b => b.click()));
  await page.screenshot({ path: 'test-results/layers/workspace.png' });
  await app.evaluate(({ session }, dir) => { session.defaultSession.on('will-download', (_event, item) => { item.setSavePath(dir + '/layer-3.png'); globalThis.layerDownloadName = item.getFilename(); }); }, userData);
  await page.getByRole('button', { name: 'Download layer 3', exact: true }).click();
  await page.waitForTimeout(1000);

  assert.equal(await app.evaluate(() => globalThis.layerDownloadName), 'layer-3.png');
  assert.ok(require('node:fs').statSync(join(userData, 'layer-3.png')).size > 0);
  await page.getByRole('button', { name: 'Use light theme', exact: true }).click();
  await page.screenshot({ path: 'test-results/layers/workspace-light.png' });
  await app.evaluate(() => { globalThis.layerFailure = true; });
  page.once('dialog', dialog => dialog.accept());
  await separate.click();
  await page.getByLabel('Image layers workspace').getByRole('alert').filter({ hasText: 'Layer provider is unavailable.' }).waitFor();
  assert.equal(await separate.isEnabled(), true);
  assert.equal(await page.getByRole('heading', { name: '4 layers ready' }).count(), 1, 'Failure preserves previous results');
  assert.deepEqual(errors, []);
  console.log('Layers desktop smoke passed: import, approval cancellation, request, results, selection, download, themes, retryable failure.');
} finally { await app.close(); await rm(userData, { recursive: true, force: true }); }
