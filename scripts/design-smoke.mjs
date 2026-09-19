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
  HEIS_EDITOR: "1",
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
const app = await electron.launch({
  executablePath: packaged || require("electron"),
  args: [...(packaged ? [] : ["."]), "--user-data-dir=" + userData],
  env,
});

const errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  const fixturePath = join(userData, "reference.png");
  await require("sharp")({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 200, g: 100, b: 40, alpha: 1 },
    },
  })
    .png()
    .toFile(fixturePath);
  await app.evaluate(({ app, dialog }, fixture) => {
    const req = process.mainModule.require.bind(process.mainModule);
    const { ManagedMediaProvider } = req(
      app.getAppPath() + "/dist-electron/lib/runwareProvider.js",
    );
    globalThis.designRequests = [];
    globalThis.approveDesign = false;
    ManagedMediaProvider.prototype.submit = async function (request) {
      globalThis.designRequests.push(request);
      return {
        id: "design-job-" + globalThis.designRequests.length,
        status: "submitted",
      };
    };
    ManagedMediaProvider.prototype.upload = async function () {
      return { url: "https://design.test/reference.png" };
    };
    ManagedMediaProvider.prototype.getJob = async function (id) {
      return {
        id,
        status: "succeeded",
        outputs: [{ url: "https://design.test/result.png", kind: "image" }],
      };
    };
    const original = globalThis.fetch;
    globalThis.fetch = async (url, ...rest) =>
      String(url).startsWith("https://design.test/")
        ? new Response(req("node:fs").readFileSync(fixture), {
            headers: { "Content-Type": "image/png" },
          })
        : original(url, ...rest);
    dialog.showMessageBox = async () => ({
      response: globalThis.approveDesign ? 1 : 0,
    });
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fixture],
    });
    dialog.showSaveDialog = async (options) => ({
      canceled: false,
      filePath:
        app.getPath("userData") +
        (options.title === "Export video" ? "/design.mp4" : "/Design.heis"),
    });
  }, fixturePath);
  await page
    .getByRole("textbox", { name: "New project name" })
    .fill("Design film");
  await page
    .getByRole("button", { name: "＋ New project", exact: true })
    .click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page
    .getByRole("button", { name: "Design agent Workflow", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import references", exact: true })
    .click();
  await page.locator(".design-card").waitFor({ timeout: 60000 });
  await page.locator(".design-card").click();
  await page.getByLabel("Design prompt").fill("A bold orange thumbnail");
  await page.getByRole("button", { name: "Review generation" }).click();
  await page.getByRole("alert").filter({ hasText: "cancelled" }).waitFor();
  assert.equal(await app.evaluate(() => globalThis.designRequests.length), 0);
  await app.evaluate(() => {
    globalThis.approveDesign = true;
  });
  await page.getByRole("button", { name: "Review generation" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".design-card").length === 2,
    {},
    { timeout: 60000 },
  );
  await page.locator(".design-card").last().click();
  await page
    .getByRole("button", { name: "Add to timeline", exact: true })
    .click();
  await page.getByLabel("Replace clip").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Replace chosen clip" }).click();
  await page.getByLabel("Enable chat and share selected references").check();
  await page
    .getByLabel("Codex model")
    .locator('option[value="test-model"]')
    .waitFor({ state: "attached" });
  await page.getByLabel("Message Codex").fill("design-tool");
  await page.getByRole("button", { name: "Send to Codex" }).click();
  await page.getByText("Hello from Codex.", { exact: true }).waitFor();
  const scope = await page.evaluate(async () => {
    const threads = (await window.heisAgent.snapshot()).threads;
    const t = threads.find((t) => t.design);
    return t.design;
  });
  assert.ok(scope?.sessionId);
  const board = await page.evaluate(
    async (scope) =>
      window.heisEditor.designOpen(scope.projectId, scope.sessionId),
    scope,
  );
  assert.equal(board.project.project.sequences[0].clips.length, 1);
  await page.waitForFunction(
    () => document.querySelectorAll(".design-card").length === 3,
    {},
    { timeout: 60000 },
  );
  assert.equal(await app.evaluate(() => globalThis.designRequests.length), 2);
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".design-card").length === 0,
  );
  await page.getByLabel("Design session").selectOption(scope.sessionId);
  await page.locator(".design-card").first().waitFor();
  await mkdir("test-results/design", { recursive: true });
  await page.locator(".design-settings").evaluate((e) => {
    e.scrollTop = 0;
  });
  await page.getByLabel("Enable chat and share selected references").check();
  await page.screenshot({ path: "test-results/design/workspace.png" });
  await page
    .getByRole("button", { name: "← Back to edit", exact: true })
    .click();
  await page.getByRole("button", { name: "Export ↗", exact: true }).click();
  await page
    .getByRole("button", { name: "Show in Finder", exact: true })
    .waitFor({ timeout: 90000 });
  assert.ok(require("node:fs").statSync(join(userData, "design.mp4")).size > 0);
  assert.deepEqual(errors, []);
  console.log(
    "Design desktop smoke passed: references, denied/approved generation, local output, board switching, chat, insertion/replacement, export.",
  );
} catch (error) {
  console.log(
    await (
      await app.firstWindow()
    ).evaluate(async () => JSON.stringify(await window.heisAgent.snapshot())),
  );
  console.log(
    await (await app.firstWindow()).locator('[role="alert"]').allTextContents(),
  );
  throw error;
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
