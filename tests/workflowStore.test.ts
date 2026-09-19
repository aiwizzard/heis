import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EditorService } from "../electron/editor/service";
import { validateWorkflow } from "@heis/core";
import type {
  GenerationRequest,
  GenerationJob,
  ProjectAsset,
  WorkflowSnapshot,
} from "@heis/core";
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "heis-workflow-")),
    directory = path.join(root, "film"),
    userData = path.join(root, "data"),
    options = { userData, resources: root };
  let editor = new EditorService(options);
  const initial = editor.create(directory, "Film");
  editor.dispose();
  fs.writeFileSync(path.join(directory, "media", "input.png"), "image");
  initial.project.assets = [
    {
      id: "source",
      kind: "image",
      name: "Source",
      path: "media/input.png",
      durationSeconds: 0,
      width: 256,
      height: 256,
      hasAudio: false,
    },
  ];
  fs.writeFileSync(
    path.join(directory, "project.heis.json"),
    JSON.stringify(initial.project),
  );
  editor = new EditorService(options);
  editor.open(directory);
  const projectId = initial.project.id;
  const accepted = new Map<
    string,
    { request: GenerationRequest; job: GenerationJob }
  >();
  let submissions = 0,
    uploads = 0,
    cancels = 0,
    ambiguous = false,
    hold = false,
    failVideo = false,
    failDownload = false;
  const provider = {
    async upload() {
      uploads++;
      return { url: "https://example.test/source.png" };
    },
    async submit(request: GenerationRequest) {
      submissions++;
      const key = request.billing.idempotencyKey;
      let entry = accepted.get(key);
      if (!entry) {
        const id = "job-" + (accepted.size + 1);
        entry = {
          request,
          job: {
            id,
            status: "succeeded",
            outputs: [
              {
                id: "out",
                kind:
                  request.operation === "image-to-video" ? "video" : "image",
                url: "https://example.test/" + id,
              },
            ],
            reservedCredits: 1,
            createdAt: "now",
            updatedAt: "now",
          },
        };
        accepted.set(key, entry);
      }
      if (ambiguous) {
        ambiguous = false;
        throw new Error("Response lost after acceptance");
      }
      return entry.job;
    },
    async getJob(id: string) {
      const entry = [...accepted.values()].find((e) => e.job.id === id)!;
      if (hold) return { ...entry.job, status: "running" as const };
      if (failVideo && entry.request.operation === "image-to-video") {
        failVideo = false;
        entry.job = {
          ...entry.job,
          status: "failed",
          error: { code: "FAILED", message: "Provider failure" },
        };
      }
      return entry.job;
    },
    async cancel(id: string) {
      cancels++;
      const e = [...accepted.values()].find((e) => e.job.id === id);
      if (e) e.job.status = "cancelled";
    },
  };
  function attach(e: EditorService) {
    e.workflows.setProvider(provider);
    e.capture = async (id, urls, jobId) => {
      if (failDownload) {
        failDownload = false;
        throw new Error("Download disconnected");
      }
      const session = (e as any).session(id);
      if (
        session.project.assets.some(
          (a: ProjectAsset) => a.sourceJobId === jobId + ":0",
        )
      )
        return;
      const entry = [...accepted.values()].find((e) => e.job.id === jobId)!;
      const kind =
          entry.request.operation === "image-to-video" ? "video" : "image",
        relative = "media/" + jobId + (kind === "video" ? ".mp4" : ".png");
      fs.writeFileSync(path.join(directory, relative), "fixture");
      session.project.assets.push({
        id: jobId,
        kind,
        name: jobId,
        path: relative,
        durationSeconds: kind === "video" ? 5 : 0,
        width: 256,
        height: 256,
        hasAudio: false,
        sourceJobId: jobId + ":0",
      });
      session.saved = false;
      e.flush(id);
    };
  }
  attach(editor);
  let d = editor.workflows.create(projectId);
  d = editor.workflows.save(
    projectId,
    d.definition.id,
    0,
    "Test chain",
    d.definition.nodes.map((n) => ({
      ...n,
      assetId: n.kind === "image-input" ? "source" : undefined,
      prompt:
        n.kind === "image-edit"
          ? "Make orange"
          : n.kind === "image-to-video"
            ? "Slow pan"
            : "",
    })),
  );
  const api = {
    root,
    directory,
    userData,
    projectId,
    get editor() {
      return editor;
    },
    get doc() {
      return editor.workflows.snapshot(projectId, d.definition.id);
    },
    get accepted() {
      return accepted;
    },
    get submissions() {
      return submissions;
    },
    get uploads() {
      return uploads;
    },
    get cancels() {
      return cancels;
    },
    set ambiguous(v: boolean) {
      ambiguous = v;
    },
    set hold(v: boolean) {
      hold = v;
    },
    set failVideo(v: boolean) {
      failVideo = v;
    },
    set failDownload(v: boolean) {
      failDownload = v;
    },
    start() {
      return editor.workflows.start(
        projectId,
        d.definition.id,
        api.doc.definition.revision,
      );
    },
    async drain(runId: string) {
      for (let i = 0; i < 40; i++) {
        await editor.workflows.tick(projectId, d.definition.id, runId);
        await new Promise((r) => setTimeout(r, 1));
        if (api.doc.runs.find((r) => r.id === runId)!.status !== "running")
          return api.doc;
      }
      throw new Error("run did not finish");
    },
    reopen() {
      editor.dispose();
      editor = new EditorService(options);
      attach(editor);
      editor.open(directory);
    },
    cleanup() {
      editor.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
  return api;
}
test("workflow graph rejects cycles, incompatible inputs, unsupported nodes and stale saves", () => {
  const x = setup();
  try {
    const g = x.doc.definition;
    assert.throws(
      () =>
        validateWorkflow({
          ...g,
          nodes: g.nodes.map((n) =>
            n.id === "edit" ? { ...n, source: "edit" } : n,
          ),
        }),
      /cycle/,
    );
    assert.throws(
      () =>
        validateWorkflow({
          ...g,
          nodes: g.nodes.map((n) =>
            n.id === "edit" ? { ...n, source: "video" } : n,
          ),
        }),
      /image output/,
    );
    assert.throws(
      () =>
        validateWorkflow({
          ...g,
          nodes: g.nodes.map((n) =>
            n.id === "edit" ? ({ ...n, kind: "shell" } as any) : n,
          ),
        }),
      /Unsupported/,
    );
    assert.throws(
      () => x.editor.workflows.save(x.projectId, g.id, 0, "stale", g.nodes),
      /changed/,
    );
    assert.equal(x.submissions, 0);
  } finally {
    x.cleanup();
  }
});
test("complete chain persists local outputs, keeps timeline unchanged, then inserts undoably", async () => {
  const x = setup();
  try {
    const d = x.start(),
      run = d.runs[0];
    await x.drain(run.id);
    assert.equal(x.doc.runs[0].status, "succeeded");
    assert.equal(x.accepted.size, 2);
    assert.equal(x.doc.project.project.sequences[0].clips.length, 0);
    const p = x.doc.project.project;
    let inserted = x.editor.workflows.insert(
      x.projectId,
      d.definition.id,
      run.id,
      "job-2",
      p.activeSequenceId,
      10,
      p.revision,
    );
    assert.equal(inserted.project.project.sequences[0].clips[0].duration, 150);
    assert.equal(inserted.project.project.sequences[0].clips[0].start, 10);
    x.editor.history(x.projectId, inserted.project.project.revision, false);
    assert.equal(x.doc.project.project.sequences[0].clips.length, 0);
    x.reopen();
    assert.equal(x.doc.runs[0].status, "succeeded");
    assert.equal(x.doc.runs[0].steps.at(-1)!.assetIds[0], "job-2");
  } finally {
    x.cleanup();
  }
});
test("ambiguous submission retry reuses the exact saved billing key and does not duplicate paid work", async () => {
  const x = setup();
  try {
    x.ambiguous = true;
    const d = x.start(),
      run = d.runs[0];
    await x.drain(run.id);
    assert.equal(x.doc.runs[0].status, "failed");
    const original = x.doc.runs[0].steps[1].request!;
    x.reopen();
    await x.editor.workflows.retry(x.projectId, d.definition.id, run.id);
    await x.drain(run.id);
    assert.equal(x.accepted.size, 2);
    assert.equal(x.submissions, 3);
    assert.deepEqual(x.doc.runs[0].steps[1].request, original);
    assert.equal(x.doc.runs[0].status, "succeeded");
  } finally {
    x.cleanup();
  }
});
test("download retry and downstream failure preserve successful upstream nodes", async () => {
  const x = setup();
  try {
    x.failDownload = true;
    let d = x.start();
    const run = d.runs[0];
    await x.drain(run.id);
    assert.equal(x.accepted.size, 1);
    await x.editor.workflows.retry(x.projectId, d.definition.id, run.id);
    x.failVideo = true;
    await x.drain(run.id);
    assert.equal(x.doc.runs[0].steps[1].status, "succeeded");
    assert.equal(x.doc.runs[0].steps[2].status, "failed");
    assert.equal(x.accepted.size, 2);
    await x.editor.workflows.retry(x.projectId, d.definition.id, run.id);
    await x.drain(run.id);
    assert.equal(x.accepted.size, 3);
    assert.equal(x.doc.runs[0].status, "succeeded");
    assert.equal(x.doc.runs[0].steps[1].providerJobId, "job-1");
  } finally {
    x.cleanup();
  }
});
test("restart resumes an approved pending job without resubmitting and uses immutable graph", async () => {
  const x = setup();
  try {
    x.hold = true;
    const d = x.start(),
      run = d.runs[0];
    await x.editor.workflows.tick(x.projectId, d.definition.id, run.id);
    await x.editor.workflows.tick(x.projectId, d.definition.id, run.id);
    assert.equal(x.accepted.size, 1);
    x.editor.workflows.save(
      x.projectId,
      d.definition.id,
      d.definition.revision,
      "Changed",
      d.definition.nodes.map((n) => ({ ...n, prompt: "Different" })),
    );
    x.reopen();
    x.hold = false;
    await x.drain(run.id);
    assert.equal(x.submissions, 2);
    assert.equal(
      [...x.accepted.values()][1].request.inputs.positivePrompt,
      "Slow pan",
    );
    assert.equal(x.doc.definition.name, "Changed");
  } finally {
    x.cleanup();
  }
});
test("cancellation stops downstream execution and transferred runs cannot authorize spending", async () => {
  const x = setup();
  let other: EditorService | undefined;
  try {
    x.hold = true;
    const d = x.start(),
      run = d.runs[0];
    await x.editor.workflows.tick(x.projectId, d.definition.id, run.id);
    await x.editor.workflows.tick(x.projectId, d.definition.id, run.id);
    await x.editor.workflows.cancel(x.projectId, d.definition.id, run.id);
    assert.equal(x.cancels, 1);
    assert.equal(x.doc.runs[0].status, "cancelled");
    assert.equal(x.accepted.size, 1);
    other = new EditorService({
      userData: path.join(x.root, "other"),
      resources: x.root,
    });
    other.open(x.directory);
    assert.throws(
      () => other!.workflows.retryPlan(x.projectId, d.definition.id, run.id),
      /approval/,
    );
    assert.equal(x.accepted.size, 1);
  } finally {
    other?.dispose();
    x.cleanup();
  }
});

test("shorter replacements require a trim choice and preserve placement and transforms", async () => {
  const x = setup();
  try {
    const d = x.start(),
      run = d.runs[0];
    await x.drain(run.id);
    const p = x.doc.project.project;
    let state = x.editor.workflows.insert(
      x.projectId,
      d.definition.id,
      run.id,
      "job-1",
      p.activeSequenceId,
      20,
      p.revision,
    );
    const clip = state.project.project.sequences[0].clips[0];
    x.editor.command({
      projectId: x.projectId,
      expectedRevision: state.project.project.revision,
      label: "Extend still",
      edits: [
        {
          type: "clip.update",
          sequenceId: p.activeSequenceId,
          id: clip.id,
          patch: { duration: 300, opacity: 0.4, x: 0.42 },
        },
      ],
    });
    const revision = x.doc.project.project.revision;
    assert.throws(
      () =>
        x.editor.workflows.insert(
          x.projectId,
          d.definition.id,
          run.id,
          "job-2",
          p.activeSequenceId,
          0,
          revision,
          clip.id,
        ),
      /shorter/,
    );
    state = x.editor.workflows.insert(
      x.projectId,
      d.definition.id,
      run.id,
      "job-2",
      p.activeSequenceId,
      0,
      revision,
      clip.id,
      "trim",
    );
    const replaced = state.project.project.sequences[0].clips[0];
    assert.equal(replaced.duration, 150);
    assert.equal(replaced.start, 20);
    assert.equal(replaced.opacity, 0.4);
    assert.equal(replaced.x, 0.42);
  } finally {
    x.cleanup();
  }
});
test("switching active projects never redirects workflow results", async () => {
  const x = setup();
  try {
    const d = x.start(),
      run = d.runs[0],
      other = x.editor.create(path.join(x.root, "other-project"), "Other");
    await x.drain(run.id);
    assert.equal(x.doc.runs[0].status, "succeeded");
    assert.equal(x.editor.snapshot(other.project.id).project.assets.length, 0);
    assert.equal(x.editor.activeProjectId, other.project.id);
    assert.equal(x.doc.project.project.assets.length, 3);
  } finally {
    x.cleanup();
  }
});
test("newer workflow versions are rejected without modifying the record", () => {
  const x = setup();
  try {
    const d = x.doc,
      file = path.join(x.directory, "workflows", d.definition.id + ".json");
    const text = JSON.stringify({
      ...d,
      definition: { ...d.definition, version: 99 },
    });
    fs.writeFileSync(file, text);
    assert.throws(
      () => x.editor.workflows.read(x.projectId, d.definition.id),
      /Unsupported/,
    );
    assert.equal(fs.readFileSync(file, "utf8"), text);
  } finally {
    x.cleanup();
  }
});
