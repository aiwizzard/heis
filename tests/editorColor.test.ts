import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyColor,
  colorFilter,
  neutralColor,
  validColor,
} from "../packages/core/src/editorColor";

test("neutral color preserves pixels and alpha; correction validates bounds", () => {
  const data = new Uint8ClampedArray([0, 128, 255, 123, 64, 32, 16, 255]);
  const before = data.slice();
  applyColor(data, neutralColor);
  assert.deepEqual(data, before);
  assert.equal(colorFilter(neutralColor), "");
  assert.equal(validColor({ ...neutralColor, exposure: 4 }), false);
  assert.equal(validColor({ ...neutralColor, tint: NaN }), false);
  applyColor(data, { ...neutralColor, saturation: 0 });
  assert.equal(data[0], data[1]);
  assert.equal(data[1], data[2]);
  assert.equal(data[3], 123);
});

test("FFmpeg correction matches preview pixel processing", () => {
  const binary = resolve(`build/media-runtime/${process.arch}/ffmpeg`);
  assert.ok(
    existsSync(binary),
    "Pinned FFmpeg is required for color agreement",
  );
  const input = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < input.length; i += 4) {
    input[i] = (i * 13) % 256;
    input[i + 1] = (i * 7 + 37) % 256;
    input[i + 2] = (i * 19 + 91) % 256;
    input[i + 3] = 255;
  }
  for (const color of [
    {
      ...neutralColor,
      exposure: 0.7,
      contrast: 23,
      shadows: 30,
      highlights: -42,
      temperature: 25,
      tint: -12,
      saturation: 135,
    },
    {
      ...neutralColor,
      exposure: -1.2,
      contrast: -30,
      shadows: -30,
      highlights: 65,
      temperature: -55,
      tint: 40,
      saturation: 0,
    },
  ]) {
    const output = spawnSync(
      binary,
      [
        "-v",
        "error",
        "-f",
        "rawvideo",
        "-pixel_format",
        "rgba",
        "-video_size",
        "16x16",
        "-i",
        "pipe:0",
        "-vf",
        colorFilter(color).slice(1),
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "pipe:1",
      ],
      { input },
    );
    assert.equal(output.status, 0, output.stderr.toString());
    const expected = new Uint8ClampedArray(input);
    applyColor(expected, color);
    assert.equal(output.stdout.length, expected.length);
    assert.ok(
      expected.every((value, i) => Math.abs(value - output.stdout[i]) <= 2),
      "Preview and export differ by at most two byte levels",
    );
  }
});
