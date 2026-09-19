import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { _electron as electron } from "playwright-core";
const require = createRequire(import.meta.url),
  root = await mkdtemp(join(tmpdir(), "heis-editor-smoke-"));
const ffmpeg =
    process.env.HEIS_FFMPEG_PATH ||
    resolve(`build/media-runtime/${process.arch}/ffmpeg`),
  ffprobe =
    process.env.HEIS_FFPROBE_PATH ||
    resolve(`build/media-runtime/${process.arch}/ffprobe`);
const source = join(root, "footage.mp4"),
  output = join(root, "finished.mp4"),
  project = join(root, "Film.heis");
const fixture = spawnSync(ffmpeg, [
  "-v",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  process.env.HEIS_EDITOR_BENCHMARK === "1"
    ? "testsrc2=size=1280x720:rate=30"
    : "testsrc2=size=320x180:rate=30",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=48000",
  "-t",
  "3",
  "-c:v",
  "mpeg4",
  "-c:a",
  "aac",
  source,
]);
assert.equal(fixture.status, 0, fixture.stderr?.toString());
const packaged = process.env.HEIS_TEST_EXECUTABLE;
const env = {
  ...process.env,
  HEIS_EDITOR: "1",
  HEIS_DISABLE_UPDATES: "1",
  HEIS_FFMPEG_PATH: ffmpeg,
  HEIS_FFPROBE_PATH: ffprobe,
  HEIS_CODEX_BINARY: resolve("scripts/fixtures/codex-mock.mjs"),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.HEIS_DEV_SERVER_URL;
if (packaged) {
  delete env.HEIS_FFMPEG_PATH;
  delete env.HEIS_FFPROBE_PATH;
}
const app = await electron.launch({
  executablePath: packaged || require("electron"),
  args: [...(packaged ? [] : ["."]), "--user-data-dir=" + join(root, "user")],
  env,
});
const errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByText("Make the next cut.").waitFor();
  await app.evaluate(
    ({ dialog }, paths) => {
      dialog.showSaveDialog = async (options) => ({
        canceled: false,
        filePath:
          options.title === "Export video" ? paths.output : paths.project,
      });
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [paths.source],
      });
    },
    { source, output, project },
  );
  await page
    .getByRole("textbox", { name: "New project name" })
    .fill("Palmier edit");
  await page
    .getByRole("button", { name: "＋ New project", exact: true })
    .click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByText("footage.mp4", { exact: true })
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "＋ Add", exact: true }).click();
  await page.locator(".heis-timeline-clip").first().waitFor();
  assert.equal(await page.locator(".heis-timeline-clip").count(), 2);
  await page.getByRole("button", { name: "T Title", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("A new kind of studio");
  await page.getByRole("textbox", { name: "Text", exact: true }).blur();
  await page.getByRole("button", { name: "Captions", exact: true }).click();
  await page
    .getByRole("button", { name: "＋ Manual caption", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text", exact: true })
    .fill("Hello, Heis.");
  await page.getByRole("textbox", { name: "Text", exact: true }).blur();
  await page.getByRole("button", { name: "Media", exact: true }).click();
  await page.getByRole("button", { name: "Play or pause" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Play or pause" }).click();
  await mkdir("test-results/editor", { recursive: true });
  await page.screenshot({ path: "test-results/editor/editor.png" });
  await page.getByRole("button", { name: "Export ↗", exact: true }).click();
  await page
    .getByRole("button", { name: "Show in Finder", exact: true })
    .waitFor({ timeout: 90000 });
  const probe = spawnSync(ffprobe, [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    output,
  ]);
  assert.equal(probe.status, 0, probe.stderr?.toString());
  const media = JSON.parse(probe.stdout.toString());
  assert.ok(Math.abs(Number(media.format.duration) - 3) < 1 / 30);
  assert.equal(media.streams.find((s) => s.codec_type === "video").width, 1920);
  assert.ok(media.streams.some((s) => s.codec_type === "audio"));
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForTimeout(350);
  const preview = await page
    .locator(".heis-preview canvas")
    .evaluate((canvas) => canvas.toDataURL("image/png").split(",")[1]);
  await writeFile(join(root, "preview.png"), Buffer.from(preview, "base64"));
  const compare = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-i",
      join(root, "preview.png"),
      "-i",
      output,
      "-lavfi",
      "[0:v]trim=end_frame=1,setpts=PTS-STARTPTS,format=rgb24[a];[1:v]trim=end_frame=1,setpts=PTS-STARTPTS,format=rgb24[b];[a][b]psnr",
      "-frames:v",
      "1",
      "-f",
      "null",
      "-",
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const psnr = /average:([\d.]+)/.exec(compare.stderr.toString());
  assert.equal(compare.status, 0, compare.stderr.toString());
  assert.ok(
    psnr && Number(psnr[1]) > 25,
    "Preview and exported frame agree above 25 dB PSNR: " +
      compare.stderr.toString(),
  );
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: /Palmier edit/ }).click();
  await page.locator(".heis-timeline-clip").first().waitFor();
  assert.equal(await page.locator(".heis-timeline-clip").count(), 4);
  if (process.env.HEIS_EDITOR_BENCHMARK === "1") {
    await page.evaluate(async (directory) => {
      const recent = await window.heisEditor.list();
      const snap = await window.heisEditor.open(
          recent.find((p) => p.name === "Palmier edit").directory,
        ),
        p = snap.project,
        base = p.sequences[0],
        source = base.clips.find((c) => c.assetId),
        sequence = structuredClone(base);
      sequence.id = crypto.randomUUID();
      sequence.name = "Ten minute benchmark";
      sequence.tracks = [];
      sequence.clips = [];
      for (let t = 0; t < 7; t++) {
        const track = {
          ...base.tracks[t < 3 ? 0 : 1],
          id: crypto.randomUUID(),
          name: t < 3 ? "Video " + (t + 1) : "Audio " + (t - 2),
          volume: t < 3 ? 1 : 0.15,
        };
        sequence.tracks.push(track);
        for (let i = 0; i < 200; i++)
          sequence.clips.push({
            ...structuredClone(source),
            id: crypto.randomUUID(),
            trackId: track.id,
            start: i * 90,
            duration: 90,
            sourceIn: 0,
            linkId: undefined,
            scale: t === 1 ? 0.8 : t === 2 ? 0.6 : 1,
          });
      }
      await window.heisEditor.command({
        projectId: p.id,
        expectedRevision: p.revision,
        label: "Benchmark fixture",
        edits: [{ type: "sequence.add", sequence }],
      });
    }, project);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "Play or pause" }).click();
    const sample = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0,
            previous = "",
            start = performance.now();
          function tick() {
            const text = document.querySelector(
              ".heis-transport code",
            ).textContent;
            if (text !== previous) {
              frames++;
              previous = text;
            }
            if (performance.now() - start < 8000) requestAnimationFrame(tick);
            else
              resolve({ frames, seconds: (performance.now() - start) / 1000 });
          }
          requestAnimationFrame(tick);
        }),
    );
    await page.getByRole("button", { name: "Play or pause" }).click();
    assert.ok(
      sample.frames / sample.seconds >= 24,
      "Timeline stays responsive with 3 video and 4 audio layers",
    );
    console.log(
      JSON.stringify({
        benchmark: {
          ...sample,
          observedTimelineFps: sample.frames / sample.seconds,
          projectMinutes: 10,
          clips: 1400,
        },
      }),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      output,
      screenshot: resolve("test-results/editor/editor.png"),
    }),
  );
} finally {
  await app.close();
  if (process.env.HEIS_KEEP_TEST_ARTIFACTS !== "1")
    await rm(root, { recursive: true, force: true });
}
