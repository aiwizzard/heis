import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newProject,
  newClip,
  newTrack,
  applyEditorCommand,
  parseSubtitles,
  serializeSubtitles,
  renderFrame,
  validateProject,
} from "../packages/core/src/editor";
import type { EditorProject, EditorEdit } from "../packages/core/src/editor";
function fixture(): EditorProject {
  const p = newProject("project", "Test", "seq");
  p.assets.push({
    id: "asset",
    name: "Footage",
    kind: "video",
    path: "media/a.mp4",
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    hasAudio: true,
  });
  const c = newClip("clip", "seq-video", 30, 120, "Footage");
  c.assetId = "asset";
  c.linkId = "link";
  p.sequences[0].clips.push(c, {
    ...structuredClone(c),
    id: "audio",
    trackId: "seq-audio",
  });
  return p;
}
function edit(p: EditorProject, edits: EditorEdit[]) {
  return applyEditorCommand(p, {
    projectId: p.id,
    expectedRevision: p.revision,
    label: "Test",
    edits,
  });
}
test("revision mismatch does not mutate the project", () => {
  const p = fixture();
  assert.throws(
    () =>
      applyEditorCommand(p, {
        projectId: p.id,
        expectedRevision: 9,
        label: "stale",
        edits: [{ type: "rename", name: "Changed" }],
      }),
    /changed/,
  );
  assert.equal(p.name, "Test");
});
test("linked split preserves source range and synchronizes audio", () => {
  const p = edit(fixture(), [
    {
      type: "clip.split",
      sequenceId: "seq",
      id: "clip",
      frame: 60,
      newId: "right",
    },
  ]);
  const clips = p.sequences[0].clips;
  assert.equal(clips.length, 4);
  assert.equal(clips.find((c) => c.id === "clip")!.duration, 30);
  assert.equal(clips.find((c) => c.id === "right")!.sourceIn, 30);
  assert.equal(clips.find((c) => c.id === "right-audio")!.start, 60);
  assert.equal(
    clips.find((c) => c.id === "right")!.linkId,
    clips.find((c) => c.id === "right-audio")!.linkId,
  );
});
test("trim cannot exceed source and locked linked tracks reject the entire batch", () => {
  const p = fixture();
  assert.throws(
    () =>
      edit(p, [
        {
          type: "clip.update",
          sequenceId: "seq",
          id: "clip",
          patch: { duration: 400 },
        },
      ]),
    /source/,
  );
  p.sequences[0].tracks[1].locked = true;
  assert.throws(
    () =>
      edit(p, [
        {
          type: "clip.update",
          sequenceId: "seq",
          id: "clip",
          patch: { start: 90 },
        },
      ]),
    /locked/,
  );
  assert.equal(p.sequences[0].clips[0].start, 30);
});
test("ripple delete closes an empty interval and removes linked media", () => {
  const p = fixture();
  const c = {
    ...structuredClone(p.sequences[0].clips[0]),
    id: "next",
    linkId: undefined,
    start: 150,
  };
  p.sequences[0].clips.push(c);
  const result = edit(p, [
    { type: "clip.remove", sequenceId: "seq", ids: ["clip"], ripple: true },
  ]);
  assert.equal(result.sequences[0].clips.length, 1);
  assert.equal(result.sequences[0].clips[0].start, 30);
});
test("source captions move with and clamp to their clip", () => {
  const p = fixture(),
    track = newTrack("captions", "caption", "Captions");
  p.sequences[0].tracks.push(track);
  const c = newClip("cue", track.id, 40, 40, "Caption");
  c.captionSourceId = "clip";
  c.text = {
    text: "Hello",
    fontSize: 48,
    color: "#fff",
    background: "transparent",
    align: "center",
    fontFamily: "Arial",
  };
  p.sequences[0].clips.push(c);
  const result = edit(p, [
    {
      type: "clip.update",
      sequenceId: "seq",
      id: "clip",
      patch: { start: 90 },
    },
  ]);
  assert.equal(
    result.sequences[0].clips.find((c) => c.id === "cue")!.start,
    100,
  );
});
test("subtitle round trips preserve Unicode and frame timing", () => {
  const text = "1\n00:00:01,000 --> 00:00:02,500\nHello, 世界\n";
  const cues = parseSubtitles(text, 30);
  assert.deepEqual(cues, [{ start: 30, duration: 45, text: "Hello, 世界" }]);
  assert.deepEqual(
    parseSubtitles(serializeSubtitles(cues, 30, true), 30),
    cues,
  );
});
test("render plan has exclusive out points and track mute/opacity", () => {
  const p = fixture();
  p.sequences[0].tracks[1].muted = true;
  p.sequences[0].clips[0].opacity = 0.4;
  const layers = renderFrame(p, p.sequences[0], 30);
  assert.equal(layers[0].alpha, 0.4);
  assert.equal(layers[1].gain, 0);
  assert.equal(renderFrame(p, p.sequences[0], 150).length, 0);
});
test("validation rejects unsafe paths and newer versions", () => {
  const p = fixture();
  p.assets[0].path = "media/../../secret";
  assert.throws(() => validateProject(p), /path/);
  p.schemaVersion = 2;
  assert.throws(() => validateProject(p), /version/);
});

test("track reordering preserves clips and validates positions and locks", () => {
  const p = fixture(),
    s = p.sequences[0];
  const moved = edit(p, [
    { type: "track.move", sequenceId: s.id, id: s.tracks[0].id, index: 1 },
  ]);
  assert.deepEqual(
    moved.sequences[0].tracks.map((t) => t.id),
    ["seq-audio", "seq-video"],
  );
  assert.deepEqual(moved.sequences[0].clips, s.clips);
  const restored = edit(moved, [
    { type: "track.move", sequenceId: s.id, id: "seq-video", index: 0 },
  ]);
  assert.deepEqual(restored.sequences[0].tracks, s.tracks);
  for (const index of [-1, 2, 0.5])
    assert.throws(() =>
      edit(p, [
        { type: "track.move", sequenceId: s.id, id: "seq-video", index },
      ]),
    );
  s.tracks[0].locked = true;
  assert.throws(
    () =>
      edit(p, [
        { type: "track.move", sequenceId: s.id, id: "seq-video", index: 1 },
      ]),
    /locked/,
  );
});
