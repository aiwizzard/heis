import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { EditorService } from "../electron/editor/service";
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heis-editor-test-"));
  const service = new EditorService({
    userData: path.join(root, "data"),
    resources: root,
  });
  return {
    root,
    service,
    cleanup: () => {
      service.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
test("project save, reopen, undo/redo and relocation preserve revisions", () => {
  const { root, service, cleanup } = setup();
  try {
    let s = service.create(path.join(root, "film.heis"), "Film");
    s = service.command({
      projectId: s.project.id,
      expectedRevision: 0,
      label: "Rename",
      edits: [{ type: "rename", name: "Renamed" }],
    });
    assert.equal(s.project.revision, 1);
    s = service.history(s.project.id, 1, false);
    assert.equal(s.project.name, "Film");
    s = service.history(s.project.id, 2, true);
    assert.equal(s.project.name, "Renamed");
    service.flush(s.project.id);
    service.close();
    assert.equal(
      service.open(path.join(root, "film.heis")).project.name,
      "Renamed",
    );
    service.close();
    fs.cpSync(path.join(root, "film.heis"), path.join(root, "moved.heis"), {
      recursive: true,
    });
    assert.equal(
      service.open(path.join(root, "moved.heis")).project.name,
      "Renamed",
    );
  } finally {
    cleanup();
  }
});
test("newer manifests remain untouched", () => {
  const { root, service, cleanup } = setup();
  try {
    const s = service.create(path.join(root, "film.heis"), "Film");
    service.close();
    const file = path.join(root, "film.heis", "project.heis.json");
    const text = JSON.stringify({ ...s.project, schemaVersion: 99 });
    fs.writeFileSync(file, text);
    assert.throws(() => service.open(path.dirname(file)), /version/);
    assert.equal(fs.readFileSync(file, "utf8"), text);
  } finally {
    cleanup();
  }
});
test("agent commands cannot register arbitrary asset paths", () => {
  const { root, service, cleanup } = setup();
  try {
    const s = service.create(path.join(root, "film.heis"), "Film");
    assert.throws(
      () =>
        service.command({
          projectId: s.project.id,
          expectedRevision: 0,
          label: "bad",
          edits: [
            {
              type: "asset.add",
              asset: {
                id: "x",
                path: "media/x.mp4",
                name: "x",
                kind: "video",
                durationSeconds: 1,
                width: 100,
                height: 100,
                hasAudio: false,
              },
            },
          ],
        }),
      /import/,
    );
  } finally {
    cleanup();
  }
});
test("a corrupt manifest recovers the previous valid save", () => {
  const { root, service, cleanup } = setup();
  let second: EditorService | undefined;
  try {
    const directory = path.join(root, "film.heis"),
      s = service.create(directory, "Original");
    service.command({
      projectId: s.project.id,
      expectedRevision: 0,
      label: "Rename",
      edits: [{ type: "rename", name: "Latest" }],
    });
    service.flush(s.project.id);
    service.close();
    fs.writeFileSync(path.join(directory, "project.heis.json"), "{interrupted");
    second = new EditorService({
      userData: path.join(root, "other"),
      resources: root,
    });
    assert.equal(second.open(directory).project.name, "Original");
  } finally {
    second?.dispose();
    cleanup();
  }
});
test("new cache paths cannot escape through a directory symlink", () => {
  const { root, service, cleanup } = setup();
  try {
    const directory = path.join(root, "film.heis");
    service.create(directory, "Film");
    fs.rmSync(path.join(directory, "cache"), { recursive: true });
    fs.mkdirSync(path.join(root, "outside"));
    fs.symlinkSync(path.join(root, "outside"), path.join(directory, "cache"));
    assert.throws(
      () => service.safePath(directory, "cache/escape.png"),
      /External/,
    );
  } finally {
    cleanup();
  }
});
test("standalone library does not replace the active project or appear in recent projects", () => {
  const { root, service, cleanup } = setup();
  try {
    const project = service.create(path.join(root, "film.heis"), "Film");
    const library = service.library();
    assert.notEqual(library.projectId, project.project.id);
    assert.equal(service.activeProjectId, project.project.id);
    assert.equal(service.list().length, 1);
  } finally {
    cleanup();
  }
});
