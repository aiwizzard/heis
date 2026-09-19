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
  const fixturePath = join(userData, "reference.png"),
    videoPath = join(userData, "generated.mp4");
  await require("sharp")({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 210, g: 95, b: 35, alpha: 1 },
    },
  })
    .png()
    .toFile(fixturePath);
  const ffmpeg = resolve(`build/media-runtime/${process.arch}/ffmpeg`);
  const produced = require("node:child_process").spawnSync(ffmpeg, [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=orange:s=320x180:r=30",
    "-t",
    "2",
    "-c:v",
    "mpeg4",
    videoPath,
  ]);
  assert.equal(produced.status, 0, produced.stderr.toString());
  await app.evaluate(
    ({ app, dialog }, files) => {
      const req = process.mainModule.require.bind(process.mainModule),
        { ManagedMediaProvider } = req(
          app.getAppPath() + "/dist-electron/lib/runwareProvider.js",
        );
      globalThis.workflowRequests = [];
      globalThis.workflowJobs = new Map();
      globalThis.workflowApprove = false;
      globalThis.workflowHold = false;
      ManagedMediaProvider.prototype.submit = async function (request) {
        let job = globalThis.workflowJobs.get(request.billing.idempotencyKey);
        if (!job) {
          job = {
            id: "workflow-job-" + (globalThis.workflowJobs.size + 1),
            request,
            status: "succeeded",
          };
          globalThis.workflowJobs.set(request.billing.idempotencyKey, job);
          globalThis.workflowRequests.push(request);
        }
        return { id: job.id, status: "submitted" };
      };
      ManagedMediaProvider.prototype.upload = async () => ({
        url: "https://workflow.test/source.png",
      });
      ManagedMediaProvider.prototype.getJob = async function (id) {
        const job = [...globalThis.workflowJobs.values()].find(
            (j) => j.id === id,
          ),
          video = job.request.operation === "image-to-video";
        return {
          id,
          status:
            job.status === "cancelled"
              ? "cancelled"
              : globalThis.workflowHold && video
                ? "running"
                : job.status,
          outputs: [
            {
              id: "out",
              kind: video ? "video" : "image",
              url: "https://workflow.test/" + id + (video ? ".mp4" : ".png"),
            },
          ],
          reservedCredits: 1,
        };
      };
      ManagedMediaProvider.prototype.cancel = async function (id) {
        const job = [...globalThis.workflowJobs.values()].find(
          (j) => j.id === id,
        );
        job.status = "cancelled";
      };
      const original = globalThis.fetch;
      globalThis.fetch = async (url, ...rest) =>
        String(url).startsWith("https://workflow.test/")
          ? new Response(
              req("node:fs").readFileSync(
                String(url).endsWith(".mp4") ? files.video : files.image,
              ),
              {
                headers: {
                  "Content-Type": String(url).endsWith(".mp4")
                    ? "video/mp4"
                    : "image/png",
                },
              },
            )
          : original(url, ...rest);
      dialog.showMessageBox = async () => ({
        response: globalThis.workflowApprove ? 1 : 0,
      });
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [files.image],
      });
      dialog.showSaveDialog = async (options) => ({
        canceled: false,
        filePath:
          app.getPath("userData") +
          (options.title === "Export video"
            ? "/workflow-export.mp4"
            : "/Workflow.heis"),
      });
    },
    { image: fixturePath, video: videoPath },
  );
  await page.evaluate(async () => {
    const result = await window.heis.projects.saveWorkflow({
      workflow_id: "old-workflow",
      name: "Earlier workflow",
      data: {
        nodes: [
          { id: "old", type: "legacy-api", data: { model: "legacy-model" } },
        ],
      },
      edges: [],
    });
    if (!result.ok) throw new Error(result.error.message);
  });
  await page
    .getByRole("textbox", { name: "New project name" })
    .fill("Workflow film");
  await page
    .getByRole("button", { name: "＋ New project", exact: true })
    .click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page
    .getByRole("button", { name: "Automation workflows Workflow", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import project media", exact: true })
    .click();
  await page
    .getByLabel("Project image input")
    .locator("option")
    .filter({ hasText: "reference.png" })
    .waitFor({ state: "attached", timeout: 60000 });
  await page
    .getByLabel("Project image input")
    .selectOption({ label: "reference.png" });
  await page.getByLabel("Edit image prompt").fill("Warm orange product scene");
  await page.getByLabel("Animate image prompt").fill("Slow camera move");
  await page
    .getByRole("button", { name: "Review and run", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "cancelled before submission" })
    .waitFor();
  assert.equal(await app.evaluate(() => globalThis.workflowRequests.length), 0);
  await app.evaluate(() => {
    globalThis.workflowApprove = true;
  });
  await page
    .getByRole("button", { name: "Review and run", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Run succeeded" })
    .waitFor({ timeout: 90000 });
  assert.equal(await app.evaluate(() => globalThis.workflowRequests.length), 2);
  await page
    .getByRole("button", { name: "Add result to timeline", exact: true })
    .click();
  const state = await page.evaluate(async () => {
    const list = await window.heisEditor.list();
    const snap = await window.heisEditor.workflowOpen(list[0].id);
    return {
      projectId: list[0].id,
      workflowId: snap.definition.id,
      runId: snap.runs[0].id,
      clips: snap.project.project.sequences[0].clips.length,
    };
  });
  assert.equal(state.clips, 1);
  await app.evaluate(() => {
    globalThis.workflowHold = true;
  });
  await page
    .getByRole("button", { name: "Review and run", exact: true })
    .click();
  await page.waitForFunction(
    async () => {
      const p = (await window.heisEditor.list())[0];
      const d = await window.heisEditor.workflowOpen(p.id);
      return d.runs.at(-1)?.steps.find((s) => s.nodeId === "video")
        ?.providerJobId;
    },
    {},
    { timeout: 60000 },
  );
  await page.getByRole("button", { name: "Cancel run", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Run cancelled" }).waitFor();
  await app.evaluate(() => {
    globalThis.workflowHold = false;
  });
  await page
    .getByRole("button", { name: "Review and resume", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Run succeeded" })
    .waitFor({ timeout: 60000 });
  assert.equal(
    await app.evaluate(() => globalThis.workflowRequests.length),
    5,
    "Cancelled video is retried without repeating its successful image edit",
  );
  await page.waitForFunction(
    () => document.querySelector(".workflow-results video")?.readyState >= 1,
    {},
    { timeout: 30000 },
  );
  await mkdir("test-results/workflow", { recursive: true });
  await page.screenshot({ path: "test-results/workflow/workspace.png" });
  await page
    .getByRole("button", { name: "← Back to edit", exact: true })
    .click();
  await page.getByRole("button", { name: "Export ↗", exact: true }).click();
  await page
    .getByRole("button", { name: "Show in Finder", exact: true })
    .waitFor({ timeout: 90000 });
  assert.ok(
    require("node:fs").statSync(join(userData, "workflow-export.mp4")).size > 0,
  );
  await page
    .getByRole("button", { name: "Automation workflows Workflow", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "Run succeeded" }).waitFor();
  assert.equal(await page.locator(".workflow-node").count(), 4);
  const preserved = await page.evaluate(async () =>
    window.heis.projects.getWorkflow("old-workflow"),
  );
  assert.ok(preserved.ok);
  assert.equal(preserved.value.data.nodes[0].type, "legacy-api");
  await page.goto("heis-app://app/studio/workflows");
  await page
    .getByRole("button", { name: "Review and run", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("status").filter({ hasText: "Run succeeded" }).count(),
    0,
    "Standalone workflows use their own library",
  );
  await page.getByText("Earlier workflows (1)", { exact: true }).click();
  await page.getByText("Earlier workflow", { exact: true }).click();
  await page.getByRole("button", { name: "Download original graph" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Workflow desktop smoke passed: approved chain, real local media, explicit timeline insertion/export, cancellation, resume without repeated upstream charges, and workspace reopening.",
  );
} catch (error) {
  console.log(
    await (await app.firstWindow()).locator('[role="alert"]').allTextContents(),
  );
  await mkdir("test-results/workflow", { recursive: true });
  await (
    await app.firstWindow()
  ).screenshot({ path: "test-results/workflow/failure.png" });
  throw error;
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
