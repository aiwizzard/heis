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
  const assistantPanel = page.getByRole("complementary", {
    name: "Editing assistant",
  });
  await assistantPanel.waitFor();
  const assistantBounds = await assistantPanel.boundingBox();
  const timelineBounds = await page.locator(".heis-timeline").boundingBox();
  assert.ok(
    assistantBounds.x < timelineBounds.x,
    "Assistant is left of timeline",
  );
  assert.ok(
    Math.abs(
      assistantBounds.y +
        assistantBounds.height -
        timelineBounds.y -
        timelineBounds.height,
    ) < 2,
    "Assistant spans the full editor height",
  );
  const divider = await page.getByLabel("Resize assistant").boundingBox();
  await page.mouse.move(divider.x + 2, divider.y + 60);
  await page.mouse.down();
  await page.mouse.move(divider.x + 42, divider.y + 60);
  await page.mouse.up();
  assert.ok(
    (await assistantPanel.boundingBox()).width > assistantBounds.width + 30,
  );
  await page
    .getByRole("button", { name: "Collapse assistant", exact: true })
    .click();
  assert.equal(await assistantPanel.isVisible(), false);
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  assert.equal(await assistantPanel.isVisible(), true);
  assert.equal(await page.locator(".heis-inspector").isVisible(), true);
  await page
    .getByRole("button", { name: "Collapse assistant", exact: true })
    .click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByText("footage.mp4", { exact: true })
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "＋ Add", exact: true }).click();
  await page.locator(".heis-timeline-clip").first().waitFor();
  assert.equal(await page.locator(".heis-timeline-clip").count(), 2);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas.heis-filmstrip');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const first = ctx.getImageData(0, 0, 96, 54).data;
    const last = ctx.getImageData(canvas.width - 96, 0, 96, 54).data;
    return last.some((v, i) => i % 4 === 3 && v > 0) && first.some((v, i) => v !== last[i]);
  });
  const mediaUrl = await app.evaluate(({}, directory) => {
    const fs = process.mainModule.require("node:fs");
    const id = JSON.parse(
      fs.readFileSync(directory + "/project.heis.json", "utf8"),
    ).id;
    const file = fs
      .readdirSync(directory + "/cache")
      .find((n) => n.endsWith(".mp4"));
    return "heis-project://" + id + "/cache/" + file;
  }, project);
  const range = await page.evaluate(async (url) => {
    const r = await fetch(url, { headers: { Range: "bytes=0-31" } });
    return { status: r.status, size: (await r.arrayBuffer()).byteLength };
  }, mediaUrl);
  assert.deepEqual(range, { status: 206, size: 32 });
  const playhead = page.getByRole("slider", { name: "Timeline playhead" });
  const coordinates = () =>
    page.locator(".heis-scrub-ruler").evaluate((el) => ({
      left: el.getBoundingClientRect().left,
      top: el.getBoundingClientRect().top,
      px: parseFloat(el.children[1].style.left) / 60,
    }));
  const waitFrame = async (frame) => {
    await page.waitForFunction(
      (f) =>
        document
          .querySelector('[aria-label="Timeline playhead"]')
          .getAttribute("aria-valuenow") === String(f),
      frame,
    );
    assert.equal(await playhead.getAttribute("aria-valuenow"), String(frame));
  };
  const canvasFrame = () =>
    page.getByLabel("Video preview").evaluate((el) => el.toDataURL());
  let ruler = await coordinates();
  await page.mouse.move(ruler.left + 15 * ruler.px, ruler.top + 12);
  await page.mouse.down();
  await waitFrame(15);
  await page.waitForTimeout(250);
  const earlyFrame = await canvasFrame();
  await page.mouse.move(ruler.left + 60 * ruler.px, ruler.top + 70, {
    steps: 12,
  });
  await waitFrame(60);
  await page.waitForFunction(
    (before) =>
      document.querySelector('[aria-label="Video preview"]').toDataURL() !==
      before,
    earlyFrame,
  );
  assert.notEqual(
    await canvasFrame(),
    earlyFrame,
    "Video preview changes before releasing the scrub",
  );
  await page.mouse.up();
  const handle = await playhead.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(ruler.left + 30 * ruler.px, ruler.top + 60, {
    steps: 8,
  });
  await waitFrame(30);
  await page.mouse.move(ruler.left - 20, ruler.top + 60);
  await waitFrame(0);
  await page.mouse.move(ruler.left + 200 * ruler.px, ruler.top + 60);
  await waitFrame(89);
  await page.mouse.up();
  await page
    .locator(".heis-timeline-scroll")
    .evaluate((el) => (el.scrollLeft = 30));
  ruler = await coordinates();
  await page.mouse.move(ruler.left + 30 * ruler.px, ruler.top + 12);
  await page.mouse.down();
  await page.mouse.move(ruler.left + 45 * ruler.px, ruler.top + 65, {
    steps: 5,
  });
  await waitFrame(45);
  await page.mouse.up();
  await page
    .locator(".heis-timeline-scroll")
    .evaluate((el) => (el.scrollLeft = 0));
  await playhead.focus();
  await page.keyboard.press("ArrowLeft");
  await waitFrame(44);
  await page.keyboard.press("Home");
  await waitFrame(0);
  await page
    .locator(".heis-track-lane")
    .first()
    .click({ position: { x: 400, y: 60 } });
  await page
    .getByRole("button", { name: "＋ video track", exact: true })
    .click();
  await page.getByRole("button", { name: "Move track Video 2" }).waitFor();
  const sourceRow = page.locator(".heis-track").filter({
    has: page.getByRole("button", {
      name: "Move track Video 1",
      exact: true,
    }),
  });
  const destinationRow = page.locator(".heis-track").filter({
    has: page.getByRole("button", {
      name: "Move track Video 2",
      exact: true,
    }),
  });
  const destinationId = await destinationRow.getAttribute("data-track-row");
  const originalClip = sourceRow.locator(".heis-timeline-clip");
  const clipId = await originalClip.getAttribute("data-clip-id");
  const dragClip = async () => {
    const a = await sourceRow.locator(".heis-timeline-clip").boundingBox(),
      b = await destinationRow.locator(".heis-track-lane").boundingBox();
    const x = a.x + a.width / 2;
    await page.mouse.move(x, a.y + 25);
    await page.mouse.down();
    await page.mouse.move(x, b.y + 30, { steps: 8 });
    return { a, b };
  };
  const { a, b } = await dragClip();
  await page.waitForFunction(
    ({ id, y }) => {
      const box = document
        .querySelector(`[data-clip-id="${id}"]`)
        ?.getBoundingClientRect();
      return box && Math.abs(box.y - y) < 4;
    },
    { id: clipId, y: b.y + 5 },
  );
  const movingBox = await page
    .locator(`[data-clip-id="${clipId}"]`)
    .boundingBox();
  assert.ok(
    Math.abs(movingBox.y - (b.y + 5)) < 4,
    "Clip follows the pointer into the destination before drop",
  );
  assert.equal(await destinationRow.locator(".heis-drop-preview").count(), 1);
  assert.equal(
    await sourceRow.locator(`[data-clip-id="${clipId}"]`).count(),
    1,
    "Project clip stays in its original track until committed",
  );
  await page.mouse.up();
  await page.waitForFunction(
    ({ clipId, destinationId }) =>
      document.querySelector(`[data-clip-id="${clipId}"]`)?.parentElement
        .dataset.trackId === destinationId,
    { clipId, destinationId },
  );
  await page.getByRole("button", { name: "↶", exact: true }).click();
  await sourceRow.locator(`[data-clip-id="${clipId}"]`).waitFor();
  await dragClip();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await page.locator(".heis-timeline-clip.dragging").count(), 0);
  assert.equal(
    await sourceRow.locator(`[data-clip-id="${clipId}"]`).count(),
    1,
  );
  await destinationRow
    .getByRole("button", { name: "Lock track", exact: true })
    .click();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-track-row="${id}"]`)
        .classList.contains("locked"),
    destinationId,
  );
  await dragClip();
  assert.equal(
    await page.locator(".heis-timeline-clip.invalid-drop").count(),
    2,
  );
  await page.mouse.up();
  assert.equal(
    await sourceRow.locator(`[data-clip-id="${clipId}"]`).count(),
    1,
  );
  await destinationRow
    .getByRole("button", { name: "Lock track", exact: true })
    .click();
  await page.waitForFunction(
    (id) =>
      !document
        .querySelector(`[data-track-row="${id}"]`)
        .classList.contains("locked"),
    destinationId,
  );
  const grip = await destinationRow
      .getByRole("button", { name: "Move track Video 2" })
      .boundingBox(),
    bottom = await sourceRow.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    grip.x + grip.width / 2,
    grip.y +
      grip.height / 2 +
      bottom.y -
      (await destinationRow.boundingBox()).y,
    { steps: 8 },
  );
  assert.equal(await page.locator(".heis-track.reordering").count(), 1);
  assert.notEqual(
    await destinationRow.evaluate((el) => el.style.transform),
    "translateY(0px)",
  );
  await page.mouse.up();
  await page.waitForFunction(
    (id) =>
      document.querySelector(".heis-track:last-of-type")?.dataset.trackRow ===
        id ||
      Array.from(document.querySelectorAll("[data-track-row]")).at(-1)?.dataset
        .trackRow === id,
    destinationId,
  );
  assert.equal(
    await page
      .locator("[data-track-row]")
      .last()
      .getAttribute("data-track-row"),
    destinationId,
  );
  await page.getByRole("button", { name: "↶", exact: true }).click();
  await page.waitForFunction(
    (id) => document.querySelector("[data-track-row]")?.dataset.trackRow === id,
    destinationId,
  );
  await page.locator(`[data-clip-id="${clipId}"]`).click();
  const exposure = page.getByRole("slider", { name: "Exposure", exact: true });
  await exposure.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await mkdir("test-results/editor", { recursive: true });
  await page.screenshot({ path: "test-results/editor/color-sliders.png" });
  const beforeColor = await canvasFrame();
  const sliderBox = await exposure.boundingBox();
  await page.mouse.move(sliderBox.x + sliderBox.width / 2, sliderBox.y + sliderBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sliderBox.x + 6.5 + (sliderBox.width - 13) * (3.7 / 6), sliderBox.y + sliderBox.height / 2, { steps: 5 });
  await page.waitForFunction(before => document.querySelector('[aria-label="Video preview"]').toDataURL() !== before, beforeColor);
  await page.mouse.up();
  await page.getByRole("button", { name: "↶", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#color-exposure').value === "0");
  await page.getByRole("button", { name: "↷", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#color-exposure').value === "0.7");
  await page.getByRole("button", { name: "Copy color", exact: true }).click();
  await page.getByRole("button", { name: "Reset color", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#color-exposure').value === "0");
  await page.getByRole("button", { name: "Paste color to selected", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#color-exposure').value === "0.7");
  await page.getByRole("button", { name: "↶", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#color-exposure').value === "0");
  await page.getByRole("button", { name: "↷", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#color-exposure').value === "0.7");
  await page.waitForTimeout(250);
  const correctedFrame = await canvasFrame();
  await page.getByRole("button", { name: "Show original", exact: true }).click();
  await page.waitForFunction(before => document.querySelector('[aria-label="Video preview"]').toDataURL() !== before, correctedFrame);
  await page.getByRole("button", { name: "Show corrected", exact: true }).click();
  await page.waitForFunction(expected => document.querySelector('[aria-label="Video preview"]').toDataURL() === expected, correctedFrame);
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
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await page.screenshot({ path: "test-results/editor/editor.png" });
  await page
    .getByRole("button", { name: "Collapse assistant", exact: true })
    .click();
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
