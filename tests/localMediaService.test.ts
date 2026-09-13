import assert from "node:assert/strict";
import test from "node:test";

const { highlightWindows, safeExtension } = require("../electron/lib/localMediaService");

test("local clipping creates bounded deterministic highlight windows", () => {
  const windows = highlightWindows(60, 3);
  assert.equal(windows.length, 3);
  assert.deepEqual(windows.map((window: any) => [window.start, window.end]), [[8.333, 21.667], [23.333, 36.667], [38.333, 51.667]]);
  assert.ok(windows.every((window: any) => window.start >= 0 && window.end <= 60));
});

test("local clipping caps requested highlights and handles short videos", () => {
  const windows = highlightWindows(4, 50);
  assert.equal(windows.length, 10);
  assert.ok(windows.every((window: any) => window.end <= 4));
});

test("local media imports sanitize file extensions", () => {
  assert.equal(safeExtension("clip.MOV", "video/quicktime"), ".mov");
  assert.equal(safeExtension("clip.bad/ext", "video/mp4"), ".mp4");
});
