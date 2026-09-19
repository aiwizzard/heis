import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EditorService } from "../electron/editor/service";
test("local workflow composition joins mixed-rate portrait and silent clips with synchronized audio", async () => {
  const runtime = path.resolve("build/media-runtime", process.arch),
    ffmpeg = path.join(runtime, "ffmpeg"),
    ffprobe = path.join(runtime, "ffprobe");
  assert.ok(
    fs.existsSync(ffmpeg),
    "Packaged FFmpeg is required for workflow media tests",
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heis-workflow-media-")),
    editor = new EditorService({
      userData: path.join(root, "data"),
      resources: root,
      ffmpeg,
      ffprobe,
    });
  const command = (args: string[]) => {
    const r = spawnSync(ffmpeg, ["-v", "error", "-y", ...args]);
    assert.equal(r.status, 0, r.stderr.toString());
    return r.stdout;
  };
  try {
    const red = path.join(root, "red.mp4"),
      blue = path.join(root, "blue.mp4");
    command([
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=180x320:r=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      "-t",
      "1",
      "-c:v",
      "mpeg4",
      "-c:a",
      "aac",
      red,
    ]);
    command([
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=60",
      "-t",
      "1",
      "-c:v",
      "mpeg4",
      blue,
    ]);
    const p = editor.create(path.join(root, "project"), "Mixed media").project,
      assets = await editor.importFiles(p.id, [red, blue]);
    const graph = editor.workflows.template(p.id, "combine");
    editor.workflows.save(
      p.id,
      graph.definition.id,
      0,
      graph.definition.name,
      graph.definition.nodes.map((n) => ({
        ...n,
        assetId:
          n.id === "first"
            ? assets[0].id
            : n.id === "second"
              ? assets[1].id
              : undefined,
      })),
    );
    editor.workflows.setProvider({
      upload: async () => {
        throw new Error("Unexpected upload");
      },
      submit: async () => {
        throw new Error("Unexpected charge");
      },
      getJob: async () => {
        throw new Error("Unexpected provider job");
      },
      cancel: async () => {},
    });
    const run = editor.workflows.start(p.id, graph.definition.id, 1).runs[0];
    for (let i = 0; i < 300; i++) {
      await editor.workflows.tick(p.id, graph.definition.id, run.id);
      if (
        editor.workflows.snapshot(p.id, graph.definition.id).runs[0].status !==
        "running"
      )
        break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const done = editor.workflows.snapshot(p.id, graph.definition.id);
    assert.equal(done.runs[0].status, "succeeded", done.runs[0].message);
    const result = done.project.project.assets.find(
      (a) => a.sourceJobId === "workflow:" + run.id + ":combine",
    )!;
    assert.ok(result);
    assert.ok(Math.abs(result.durationSeconds - 2) < 1 / 30);
    assert.equal(result.width, 1280);
    assert.equal(result.height, 720);
    assert.ok(result.hasAudio);
    const output = path.join(done.project.directory, result.path);
    for (const [time, channel] of [
      ["0.5", 0],
      ["1.5", 2],
    ] as const) {
      const pixel = command([
        "-ss",
        time,
        "-i",
        output,
        "-vf",
        "crop=2:2:iw/2:ih/2",
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ]);
      assert.ok(pixel[channel] > 200, "Source order and color preserved");
    }
    const samples = command([
      "-i",
      output,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-f",
      "f32le",
      "pipe:1",
    ]);
    const energy = (start: number, end: number) => {
      let sum = 0,
        count = 0;
      for (
        let i = start * 48000;
        i < end * 48000 && i * 4 < samples.length;
        i++
      ) {
        sum += samples.readFloatLE(i * 4) ** 2;
        count++;
      }
      return sum / count;
    };
    assert.ok(energy(0.2, 0.8) > 0.001);
    assert.ok(energy(1.2, 1.8) < 0.00001);
    editor.flush(p.id);
    assert.equal(done.project.project.sequences[0].clips.length, 0);
  } finally {
    editor.dispose();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
