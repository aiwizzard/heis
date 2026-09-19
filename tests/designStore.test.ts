import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EditorService } from "../electron/editor/service";
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heis-design-"));
  let service = new EditorService({
    userData: path.join(root, "data"),
    resources: root,
  });
  const directory = path.join(root, "film");
  let snap = service.create(directory, "Film");
  service.close();
  const project = snap.project;
  project.assets = [
    {
      id: "image",
      name: "Reference",
      kind: "image",
      path: "media/image.png",
      durationSeconds: 0,
      width: 256,
      height: 256,
      hasAudio: false,
    },
  ];
  fs.writeFileSync(path.join(directory, "media/image.png"), "fixture");
  fs.writeFileSync(
    path.join(directory, "project.heis.json"),
    JSON.stringify(project),
  );
  service.dispose();
  service = new EditorService({
    userData: path.join(root, "data"),
    resources: root,
  });
  snap = service.open(directory);
  return {
    root,
    directory,
    service,
    id: snap.project.id,
    cleanup() {
      service.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
test("design sessions persist independently, validate revisions and preserve unsupported versions", () => {
  const x = setup();
  try {
    let d = x.service.designs.create(x.id);
    const id = d.session.id;
    d = x.service.designs.update(x.id, id, 0, {
      brief: "Warm orange",
      referenceAssetIds: ["image"],
    });
    assert.throws(
      () => x.service.designs.update(x.id, id, 0, { brief: "stale" }),
      /changed/,
    );
    assert.throws(
      () =>
        x.service.designs.update(x.id, id, 1, {
          referenceAssetIds: null,
        } as any),
      /references/,
    );
    assert.throws(
      () => x.service.designs.update(x.id, id, 1, { cards: [null] } as any),
      /layout/,
    );
    x.service.close();
    x.service.open(x.directory);
    assert.equal(x.service.designs.read(x.id, id).brief, "Warm orange");
    const file = path.join(x.directory, "designs", id + ".json");
    const text = JSON.stringify({ ...d.session, version: 99 });
    fs.writeFileSync(file, text);
    assert.throws(() => x.service.designs.read(x.id, id), /Unsupported/);
    assert.equal(fs.readFileSync(file, "utf8"), text);
  } finally {
    x.cleanup();
  }
});
test("design operations accept only board assets and fixed managed capabilities", () => {
  const x = setup();
  try {
    let d = x.service.designs.create(x.id);
    d = x.service.designs.addReferences(x.id, d.session.id, ["image"]);
    const base = {
      projectId: x.id,
      sessionId: d.session.id,
      revision: d.session.revision,
      prompt: "An orange poster",
    };
    assert.throws(
      () =>
        x.service.designs.plan({
          ...base,
          action: "edit",
          sourceAssetId: "foreign",
        }),
      /source/,
    );
    assert.throws(
      () =>
        x.service.designs.plan({
          ...base,
          action: "generate",
          sourceAssetId: "image",
        }),
      /Use Edit/,
    );
    assert.throws(
      () => x.service.designs.plan({ ...base, action: "shell" } as any),
      /Unsupported/,
    );
    for (const action of [
      "generate",
      "edit",
      "upscale",
      "remove-background",
      "expand",
      "layers",
    ] as const) {
      const req = x.service.designs.request(
        {
          ...base,
          action,
          sourceAssetId: action === "generate" ? undefined : "image",
        },
        "https://example.com/image.png",
      );
      assert.equal(req.billing.mode, "managed");
      assert.ok(req.modelId.startsWith("heis-"));
    }
    assert.equal(x.service.snapshot(x.id).project.sequences[0].clips.length, 0);
  } finally {
    x.cleanup();
  }
});
test("design insertion and replacement are explicit undoable edits preserving placement and transforms", () => {
  const x = setup();
  try {
    let d = x.service.designs.create(x.id);
    d = x.service.designs.addReferences(x.id, d.session.id, ["image"]);
    const seq = d.project.project.activeSequenceId;
    d = x.service.designs.insert(x.id, d.session.id, "image", seq, 30, 90, 0);
    let clip = d.project.project.sequences[0].clips[0];
    assert.equal(clip.start, 30);
    assert.equal(clip.duration, 90);
    x.service.command({
      projectId: x.id,
      expectedRevision: 1,
      label: "Transform",
      edits: [
        {
          type: "clip.update",
          sequenceId: seq,
          id: clip.id,
          patch: { opacity: 0.5 },
        },
      ],
    });
    d = x.service.designs.insert(
      x.id,
      d.session.id,
      "image",
      seq,
      0,
      1,
      2,
      clip.id,
    );
    clip = d.project.project.sequences[0].clips[0];
    assert.equal(clip.start, 30);
    assert.equal(clip.duration, 90);
    assert.equal(clip.opacity, 0.5);
    assert.throws(
      () => x.service.designs.insert(x.id, d.session.id, "image", seq, 0, 1, 2),
      /revision|changed/i,
    );
    x.service.history(x.id, 3, false);
    assert.equal(
      x.service.snapshot(x.id).project.sequences[0].clips[0].opacity,
      0.5,
    );
  } finally {
    x.cleanup();
  }
});
test("generation associations stay on the originating board and deduplicate completion events", () => {
  const x = setup();
  try {
    const a = x.service.designs.create(x.id),
      b = x.service.designs.create(x.id);
    const req = {
      projectId: x.id,
      sessionId: a.session.id,
      revision: 0,
      action: "generate" as const,
      prompt: "poster",
    };
    x.service.designs.track(req, "provider-1");
    x.service.designs.track(req, "provider-1");
    assert.equal(x.service.designs.read(x.id, a.session.id).jobs.length, 1);
    assert.equal(x.service.designs.read(x.id, b.session.id).jobs.length, 0);
    assert.equal(x.service.jobs(x.id).length, 1);
  } finally {
    x.cleanup();
  }
});
