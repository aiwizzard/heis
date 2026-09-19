import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { EditorService } = require("../dist-electron/editor/service.js");
const { newClip } = require("../packages/core/dist/index.js");
const root = await mkdtemp(join(tmpdir(), "heis-caption-test-")),
  runtime = resolve(`build/media-runtime/${process.arch}`);
const service = new EditorService({
  userData: join(root, "data"),
  resources: runtime,
  ffmpeg: join(runtime, "ffmpeg"),
  ffprobe: join(runtime, "ffprobe"),
  whisper: join(runtime, "whisper-cli"),
  model: process.env.HEIS_WHISPER_MODEL,
});
try {
  const speech = join(root, "speech.aiff");
  const spoken = spawnSync("/usr/bin/say", [
    "-o",
    speech,
    "Welcome to the studio. Bring your footage, ideas, and sound together. Make the next cut.",
  ]);
  assert.equal(spoken.status, 0, spoken.stderr.toString());
  let project = service.create(join(root, "Captions.heis"), "Captions").project;
  const [asset] = await service.importFiles(project.id, [speech]);
  project = service.snapshot(project.id).project;
  const sequence = project.sequences[0];
  assert.ok(
    Math.max(...asset.waveform) > 0.01,
    "Waveform preserves speech amplitude",
  );
  const clip = newClip(
    "speech",
    sequence.tracks[1].id,
    30,
    Math.floor(asset.durationSeconds * 30),
    "Speech",
  );
  clip.assetId = asset.id;
  service.command({
    projectId: project.id,
    expectedRevision: project.revision,
    label: "Add speech",
    edits: [{ type: "clip.add", sequenceId: sequence.id, clip }],
  });
  const job = service.transcribe(project.id, sequence.id, [clip.id]);
  const deadline = Date.now() + 180000;
  while (
    service.jobs(project.id).find((j) => j.id === job.id).status ===
      "running" &&
    Date.now() < deadline
  )
    await new Promise((resolve) => setTimeout(resolve, 500));
  const finished = service.jobs(project.id).find((j) => j.id === job.id);
  assert.equal(finished.status, "succeeded", finished.message);
  const cues = service
    .snapshot(project.id)
    .project.sequences[0].clips.filter((c) => c.text);
  assert.ok(cues.length > 0);
  assert.match(cues.map((c) => c.text.text).join(" "), /studio|footage|sound/i);
  assert.ok(cues.every((c) => c.captionSourceId === clip.id));
  console.log(
    JSON.stringify({ passed: true, captions: cues.map((c) => c.text.text) }),
  );
} finally {
  service.dispose();
  await rm(root, { recursive: true, force: true });
}
