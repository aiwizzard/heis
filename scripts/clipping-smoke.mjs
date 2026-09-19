import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { generateKeyPairSync, sign } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { _electron as electron } from "playwright-core";
const require = createRequire(import.meta.url);
const userData = await mkdtemp(join(tmpdir(), "heis-desktop-smoke-"));
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const entitlement = {
  accountId: "test",
  installationId: "test",
  mode: "creator",
  checkedAt: new Date().toISOString(),
  validUntil: new Date(Date.now() + 3600000).toISOString(),
  deviceLimit: 3,
  canEdit: true,
  canExport: true,
  canUseManagedGeneration: true,
};
entitlement.signature = sign(
  null,
  Buffer.from(JSON.stringify(entitlement, Object.keys(entitlement).sort())),
  privateKey,
).toString("base64");
if (process.env.HEIS_TEST_FREE !== "1")
  await writeFile(
    join(userData, "entitlement.json"),
    JSON.stringify(entitlement),
  );
const env = {
  ...process.env,
  HEIS_DISABLE_UPDATES: "1",
  HEIS_ENTITLEMENT_PUBLIC_KEY: publicKey.export({
    type: "spki",
    format: "pem",
  }),
  HEIS_CODEX_BINARY: resolve("scripts/fixtures/codex-mock.mjs"),
};
if (process.env.HEIS_TEST_REAL_CODEX === "1") delete env.HEIS_CODEX_BINARY;
delete env.ELECTRON_RUN_AS_NODE;
delete env.HEIS_DEV_SERVER_URL;
const packaged = process.env.HEIS_TEST_EXECUTABLE;
const { spawnSync } = require("node:child_process");
const runtime = resolve(`build/media-runtime/${process.arch}`);
const speech = join(userData, "speech.aiff"),
  video = join(userData, "interview.mp4");
const spoken = spawnSync("/usr/bin/say", [
  "-o",
  speech,
  "Welcome to the editing studio. Here is a useful tip for making better videos. Start each clip with a clear question, give one practical example, and finish with a complete answer. You can trim distractions while keeping the meaning intact. Always listen to your final edit before sharing it.",
]);
assert.equal(spoken.status, 0);
const made = spawnSync(join(runtime, "ffmpeg"), [
  "-v",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "color=c=navy:s=640x360:r=30",
  "-i",
  speech,
  "-shortest",
  "-c:v",
  "h264_videotoolbox",
  "-allow_sw",
  "1",
  "-c:a",
  "aac",
  video,
]);
assert.equal(made.status, 0, made.stderr.toString());
const app = await electron.launch({
  executablePath: packaged || require("electron"),
  args: [...(packaged ? [] : ["."]), "--user-data-dir=" + userData],
  env,
});

const errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForURL("heis-app://app/**");
  await app.evaluate(({ ipcMain, dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
    globalThis.highlightRequests = [];
    ipcMain.removeHandler("generation:submit");
    ipcMain.handle("generation:submit", (_event, request) => {
      globalThis.highlightRequests.push(request);
      return {
        ok: true,
        value: { id: "highlight-test", status: "submitted", outputs: [] },
      };
    });
    ipcMain.removeHandler("generation:get-job");
    ipcMain.handle("generation:get-job", () => ({
      ok: true,
      value: {
        id: "highlight-test",
        status: "succeeded",
        outputs: [
          {
            id: "analysis",
            kind: "other",
            url: "https://clipping.test/highlights.json",
          },
        ],
      },
    }));
  }, video);
  await page.route("https://clipping.test/highlights.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        highlights: [
          {
            start: 0,
            end: 6,
            title: "Editing tip",
            reason: "A practical introduction to the technique.",
            score: 88,
          },
          {
            start: 7,
            end: 13,
            title: "Complete answer",
            reason: "An actionable recommendation.",
            score: 81,
          },
        ],
      }),
    }),
  );
  await page.goto("heis-app://app/studio/clipping");
  await page
    .getByRole("heading", { name: "AI clipping", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Choose video", exact: true }).click();
  await page
    .getByText("interview.mp4", { exact: true })
    .waitFor({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Transcribe video", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Transcribe again", exact: true })
    .waitFor({ timeout: 180000 });
  await page.getByText(/Review transcript/).click();
  assert.match(
    await page.locator(".heis-clipping-transcript").innerText(),
    /studio|videos|answer/i,
  );
  await page.getByLabel("Min seconds", { exact: true }).fill("5");
  await page.getByLabel("Max seconds", { exact: true }).fill("15");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Find highlights", exact: true })
    .click();
  assert.equal(
    await app.evaluate(() => globalThis.highlightRequests.length),
    0,
  );
  page.once("dialog", (d) => {
    assert.match(d.message(), /transcript/);
    return d.accept();
  });
  await page
    .getByRole("button", { name: "Find highlights", exact: true })
    .click();
  await page
    .locator("article strong")
    .filter({ hasText: "Editing tip" })
    .waitFor();
  const request = await app.evaluate(() => globalThis.highlightRequests[0]);
  assert.equal(request.operation, "rank-highlights");
  assert.ok(request.inputs.transcript.cues.length > 0);
  assert.equal(request.inputs.minDuration, 5);
  await page
    .getByRole("button", { name: "Preview range", exact: true })
    .first()
    .click();
  assert.ok(
    await page.locator(".heis-clipping video").evaluate((v) => !v.paused),
  );
  await page.getByLabel("end (s)", { exact: true }).first().fill("5");
  await page.getByRole("checkbox").nth(1).uncheck();
  await page
    .getByRole("button", { name: "Create 1 selected clips", exact: true })
    .click();
  await app.evaluate(
    ({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: destination,
      });
    },
    join(userData, "Other.heis"),
  );
  const other = await page.evaluate(() =>
    window.heisEditor.create("Other project"),
  );
  await page
    .getByRole("status")
    .filter({ hasText: "1 clips saved" })
    .waitFor({ timeout: 60000 });
  assert.equal(other.project.assets.length, 0);
  const library = await page.evaluate(() => window.heisEditor.library());
  assert.equal(library.assets.length, 2);
  const output = library.assets.find((a) => a.name === "Editing tip");
  assert.ok(output);
  assert.ok(Math.abs(output.durationSeconds - 5) < 0.1);
  assert.equal(output.width, 640);
  assert.equal(output.height, 360);
  assert.equal(output.hasAudio, true);
  await mkdir("test-results/clipping", { recursive: true });
  await page.screenshot({ path: "test-results/clipping/workspace.png" });
  await page.reload();
  await page
    .getByRole("heading", { name: "AI clipping", exact: true })
    .waitFor();
  const sourceUrl = `heis-project://${library.projectId}/${library.assets[0].path.split("/").map(encodeURIComponent).join("/")}`;
  await page
    .getByLabel("Previously imported videos", { exact: true })
    .selectOption(sourceUrl);
  await page
    .locator("article strong")
    .filter({ hasText: "Editing tip" })
    .waitFor();
  assert.equal(
    await app.evaluate(() => globalThis.highlightRequests.length),
    1,
    "Saved analysis restores without a second paid request",
  );
  assert.equal(
    await page.getByLabel("end (s)", { exact: true }).first().inputValue(),
    "5",
    "Manual timing correction survives reload",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Clipping smoke passed: real local transcription, approved mocked ranking, preview, edited selection, real MP4/audio extraction and saved-analysis recovery.",
  );
} catch (error) {
  const p = await app.firstWindow();
  console.error(await p.locator("body").innerText());
  throw error;
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
