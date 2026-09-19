import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EditorService } from "../electron/editor/service";
import {
  validateWorkflow,
  workflowCapabilities,
  workflowInputs,
  workflowTemplates,
  migrateWorkflow,
  getCapability,
  validateGenerationRequest,
} from "@heis/core";
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
                kind: getCapability(request.modelId)!.outputKind,
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
      const kind = getCapability(entry.request.modelId)!.outputKind,
        relative =
          "media/" +
          jobId +
          (kind === "video" ? ".mp4" : kind === "audio" ? ".wav" : ".png");
      fs.writeFileSync(path.join(directory, relative), "fixture");
      session.project.assets.push({
        id: jobId,
        kind,
        name: jobId,
        path: relative,
        durationSeconds: kind === "image" ? 0 : 5,
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

test("all managed workflow capabilities build valid provider requests and all templates validate", () => {
  for (const c of workflowCapabilities) {
    const n = {
      id: "tool",
      kind: "managed" as const,
      modelId: c.id,
      name: c.name,
      prompt: "A cinematic example",
      duration: 5 as const,
      x: 0,
      y: 0,
    };
    const capability = getCapability(c.id)!;
    assert.doesNotThrow(
      () =>
        validateGenerationRequest({
          modelId: c.id,
          operation: capability.operation,
          inputs: workflowInputs(
            n,
            c.ports.map((p, i) => "https://example.test/" + i),
            "A cinematic example",
          ),
          billing: {
            mode: "managed",
            accountId: "test",
            idempotencyKey: "test",
          },
        }),
      c.id,
    );
  }
  for (const t of workflowTemplates)
    assert.doesNotThrow(
      () =>
        validateWorkflow(
          {
            version: 1,
            id: "t",
            projectId: "p",
            revision: 0,
            name: t.name,
            nodes: t.nodes,
          },
          false,
        ),
      t.id,
    );
});
test("graph history persists, rejects stale revisions and never changes existing run snapshots", () => {
  const x = setup();
  try {
    const before = x.doc.definition;
    x.start();
    x.editor.workflows.save(
      x.projectId,
      before.id,
      before.revision,
      "Renamed",
      before.nodes,
    );
    const undone = x.editor.workflows.history(
      x.projectId,
      before.id,
      before.revision + 1,
      false,
    );
    assert.equal(undone.definition.name, before.name);
    assert.equal(undone.runs[0].graph.name, before.name);
    assert.throws(
      () =>
        x.editor.workflows.history(
          x.projectId,
          before.id,
          before.revision,
          false,
        ),
      /changed/,
    );
    x.reopen();
    const redone = x.editor.workflows.history(
      x.projectId,
      before.id,
      undone.definition.revision,
      true,
    );
    assert.equal(redone.definition.name, "Renamed");
  } finally {
    x.cleanup();
  }
});
test("legacy migration strips credentials, warns about model replacements and preserves originals", () => {
  const old = {
    name: "Legacy",
    data: {
      nodes: [
        {
          id: "a",
          type: "textNode",
          data: {
            selectedModel: { id: "text-passthrough" },
            formValues: { text: "Hello", api_key: "secret" },
          },
        },
        {
          id: "b",
          type: "audioNode",
          data: {
            selectedModel: { id: "old-voice" },
            formValues: { api_key: "secret" },
          },
        },
      ],
    },
    edges: [{ source: "a", target: "b" }],
  };
  const before = JSON.stringify(old),
    m = migrateWorkflow(old);
  assert.equal(JSON.stringify(old), before);
  assert.ok(!JSON.stringify(m).includes("secret"));
  assert.ok(m.warnings.some((w) => w.includes("heis-speech-standard")));
  assert.equal(m.nodes[1].promptSource, "a");
  assert.throws(
    () =>
      migrateWorkflow({
        nodes: [
          {
            id: "api",
            type: "apiNode",
            data: { formValues: { api_key: "secret" } },
          },
        ],
        edges: [],
      }),
    /arbitrary API/,
  );
});
test("text concatenation runs free, is persisted, and validates connections", async () => {
  const x = setup();
  try {
    const base = { prompt: "", duration: 5 as const, x: 0, y: 0 };
    const nodes = [
      {
        ...base,
        id: "a",
        name: "a",
        kind: "text-input" as const,
        prompt: "Hello",
      },
      {
        ...base,
        id: "b",
        name: "b",
        kind: "text-input" as const,
        prompt: "world",
      },
      {
        ...base,
        id: "join",
        name: "join",
        kind: "text-concat" as const,
        sources: ["a", "b"],
      },
      {
        ...base,
        id: "out",
        name: "out",
        kind: "output" as const,
        source: "join",
      },
    ];
    x.editor.workflows.save(
      x.projectId,
      x.doc.definition.id,
      x.doc.definition.revision,
      "Text",
      nodes,
    );
    assert.equal(
      x.editor.workflows.plan(
        x.projectId,
        x.doc.definition.id,
        x.doc.definition.revision,
      ).credits,
      0,
    );
    const run = x.start().runs.at(-1)!;
    const d = await x.drain(run.id);
    assert.equal(d.runs.at(-1)!.status, "succeeded");
    assert.equal(d.runs.at(-1)!.steps.at(-1)!.text, "Hello\nworld");
    assert.equal(x.submissions, 0);
    x.reopen();
    assert.equal(x.doc.runs.at(-1)!.steps.at(-1)!.text, "Hello\nworld");
  } finally {
    x.cleanup();
  }
});
test("generated text feeds speech, audio inserts undoably and no text JSON is imported as media", async () => {
  const x = setup(),
    original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ text: "Spoken text" }));
  try {
    const base = { prompt: "", duration: 5 as const, x: 0, y: 0 };
    x.editor.workflows.save(
      x.projectId,
      x.doc.definition.id,
      x.doc.definition.revision,
      "Narration",
      [
        {
          ...base,
          id: "writer",
          name: "Writer",
          kind: "managed",
          modelId: "heis-text-standard",
          prompt: "Write a script",
        },
        {
          ...base,
          id: "voice",
          name: "Voice",
          kind: "managed",
          modelId: "heis-speech-standard",
          promptSource: "writer",
        },
        { ...base, id: "out", name: "Output", kind: "output", source: "voice" },
      ],
    );
    const run = x.start().runs.at(-1)!;
    const d = await x.drain(run.id);
    assert.equal(d.runs.at(-1)!.status, "succeeded", d.runs.at(-1)!.message);
    assert.equal(x.submissions, 2);
    assert.equal(
      [...x.accepted.values()][1].request.inputs.speech.text,
      "Spoken text",
    );
    assert.equal(d.project.project.assets.length, 2);
    const asset = d.project.project.assets.find((a) => a.kind === "audio")!,
      p = d.project.project;
    const inserted = x.editor.workflows.insert(
      x.projectId,
      d.definition.id,
      run.id,
      asset.id,
      p.activeSequenceId,
      0,
      p.revision,
    );
    assert.equal(
      inserted.project.project.sequences[0].tracks.find(
        (t) => t.id === inserted.project.project.sequences[0].clips[0].trackId,
      )!.kind,
      "audio",
    );
    x.editor.history(x.projectId, inserted.project.project.revision, false);
    assert.equal(
      x.editor.snapshot(x.projectId).project.sequences[0].clips.length,
      0,
    );
  } finally {
    globalThis.fetch = original;
    x.cleanup();
  }
});

test("cancelled local composition restarts its local job on approved resume", async () => {
  const x = setup();
  try {
    const p = (x.editor as any).session(x.projectId).project;
    p.assets[0].kind = "video";
    p.assets[0].durationSeconds = 2;
    const d = x.doc;
    const nodes = [
      { ...d.definition.nodes[0], kind: "video-input" as const },
      {
        ...d.definition.nodes[1],
        id: "combine",
        kind: "video-combine" as const,
        source: "input",
      },
      { ...d.definition.nodes[3], source: "combine" },
    ];
    x.editor.workflows.save(
      x.projectId,
      d.definition.id,
      d.definition.revision,
      "Local",
      nodes,
    );
    let attempts = 0;
    const jobs: any[] = [];
    x.editor.jobs = () => jobs;
    x.editor.cancel = (id: string) => {
      jobs.find((j) => j.id === id).status = "cancelled";
    };
    x.editor.workflowCombine = (_id, _assets, marker) => {
      attempts++;
      const job: any = { id: "local-" + attempts, status: "running" };
      jobs.push(job);
      if (attempts === 2) {
        p.assets.push({ ...p.assets[0], id: "combined", sourceJobId: marker });
        job.status = "succeeded";
      }
      return job;
    };
    const run = x.start().runs.at(-1)!;
    for (let i = 0; i < 5 && !attempts; i++)
      await x.editor.workflows.tick(x.projectId, d.definition.id, run.id);
    assert.equal(attempts, 1);
    await x.editor.workflows.cancel(x.projectId, d.definition.id, run.id);
    assert.equal(jobs[0].status, "cancelled");
    await x.editor.workflows.retry(x.projectId, d.definition.id, run.id);
    const done = await x.drain(run.id);
    assert.equal(done.runs.at(-1)!.status, "succeeded");
    assert.equal(attempts, 2);
    assert.equal(x.submissions, 0);
  } finally {
    x.cleanup();
  }
});
