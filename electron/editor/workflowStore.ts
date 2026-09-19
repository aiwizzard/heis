import { migrateWorkflow, workflowTemplates } from "@heis/core";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  workflowModel,
  workflowInputs,
  workflowOutput,
  workflowMediaSources,
  workflowDependencies,
  validateWorkflow,
  validateGenerationRequest,
  getCapability,
  reserveCredits,
  newTrack,
  newClip,
  fps,
} from "@heis/core";
import type {
  ProjectWorkflowDefinition,
  WorkflowNode,
  WorkflowDocument,
  ProjectWorkflowRun,
  WorkflowSnapshot,
  GenerationRequest,
  GenerationJob,
  EditorEdit,
} from "@heis/core";
import type { EditorService } from "./service";
export interface WorkflowProvider {
  submit(r: GenerationRequest): Promise<GenerationJob>;
  getJob(id: string): Promise<GenerationJob>;
  cancel(id: string): Promise<void>;
  upload(f: {
    name: string;
    type: string;
    bytes: Uint8Array;
  }): Promise<{ url: string }>;
}
export class WorkflowStore {
  private provider?: WorkflowProvider;
  private busy = new Set<string>();
  private timers = new Map<string, NodeJS.Timeout>();
  private disposed = false;
  private approvals: Record<string, string> = {};
  private approvalPath: string;
  constructor(
    private editor: EditorService,
    userData: string,
  ) {
    fs.mkdirSync(userData, { recursive: true });
    this.approvalPath = path.join(userData, "workflow-run-approvals.json");
    try {
      const saved = JSON.parse(fs.readFileSync(this.approvalPath, "utf8"));
      this.approvals =
        saved && typeof saved === "object" && !Array.isArray(saved)
          ? saved
          : {};
    } catch {
      this.approvals = {};
    }
  }
  private digest(run: ProjectWorkflowRun) {
    return createHash("sha256").update(JSON.stringify(run)).digest("hex");
  }
  private authorized(run: ProjectWorkflowRun) {
    return this.approvals[run.id] === this.digest(run);
  }
  private approve(run: ProjectWorkflowRun) {
    this.approvals[run.id] = this.digest(run);
    const temp = this.approvalPath + "." + randomUUID() + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(this.approvals), {
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temp, this.approvalPath);
  }
  private check(run: ProjectWorkflowRun) {
    if (!this.authorized(run))
      throw new Error(
        "This run has no matching local approval record. Start a new run to authorize this workflow; its previous results are preserved.",
      );
  }
  setProvider(p: WorkflowProvider) {
    this.provider = p;
  }
  private folder(projectId: string) {
    const root = this.editor.snapshot(projectId).directory,
      folder = path.join(root, "workflows");
    fs.mkdirSync(folder, { recursive: true });
    if (
      fs.realpathSync(folder) !== path.join(fs.realpathSync(root), "workflows")
    )
      throw new Error("External workflow folders are not supported.");
    return folder;
  }
  private file(projectId: string, id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid workflow ID.");
    return path.join(this.folder(projectId), id + ".json");
  }
  private write(doc: WorkflowDocument) {
    const file = this.file(doc.definition.projectId, doc.definition.id),
      temp = file + "." + randomUUID() + ".tmp";
    const serialized = JSON.stringify(doc);
    if (Buffer.byteLength(serialized) > 20 * 1024 * 1024)
      throw new Error(
        "Workflow history exceeds the 20 MB limit. Create a new workflow.",
      );
    fs.writeFileSync(temp, serialized, { mode: 0o600, flag: "wx" });
    fs.renameSync(temp, file);
  }
  read(projectId: string, id: string): WorkflowDocument {
    const file = this.file(projectId, id);
    if (
      fs.lstatSync(file).isSymbolicLink() ||
      fs.statSync(file).size > 20 * 1024 * 1024
    )
      throw new Error("Invalid workflow file.");
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      d.definition?.version !== 1 ||
      d.definition.id !== id ||
      d.definition.projectId !== projectId ||
      !Number.isSafeInteger(d.definition.revision) ||
      !Array.isArray(d.runs)
    )
      throw new Error(
        "Unsupported or damaged workflow. Original file preserved.",
      );
    validateWorkflow(d.definition, false);
    for (const run of d.runs) {
      if (
        !run ||
        typeof run.id !== "string" ||
        run.graph?.id !== id ||
        run.graph?.projectId !== projectId ||
        !["running", "failed", "cancelled", "succeeded"].includes(run.status) ||
        !Array.isArray(run.steps)
      )
        throw new Error("Damaged workflow run. Original file preserved.");
      const order = validateWorkflow(run.graph);
      if (
        JSON.stringify(order.map((n) => n.id)) !==
          JSON.stringify(run.steps.map((s: any) => s?.nodeId)) ||
        run.steps.some(
          (s: any) =>
            !["pending", "running", "succeeded", "failed"].includes(s.status) ||
            !Array.isArray(s.assetIds) ||
            s.assetIds.some((a: any) => typeof a !== "string"),
        )
      )
        throw new Error("Damaged workflow step. Original file preserved.");
    }
    return d;
  }
  list(projectId: string) {
    return fs
      .readdirSync(this.folder(projectId))
      .filter((f) => /^[a-f0-9-]{36}\.json$/.test(f))
      .map((f) => {
        const d = this.read(projectId, f.slice(0, -5));
        return { id: d.definition.id, name: d.definition.name };
      });
  }
  create(projectId: string) {
    const nodes: WorkflowNode[] = [
      {
        id: "input",
        kind: "image-input",
        name: "Project image",
        prompt: "",
        duration: 5,
        x: 30,
        y: 40,
      },
      {
        id: "edit",
        kind: "image-edit",
        name: "Edit image",
        source: "input",
        prompt: "",
        duration: 5,
        x: 340,
        y: 40,
      },
      {
        id: "video",
        kind: "image-to-video",
        name: "Animate image",
        source: "edit",
        prompt: "",
        duration: 5,
        x: 650,
        y: 40,
      },
      {
        id: "output",
        kind: "output",
        name: "Result",
        source: "video",
        prompt: "",
        duration: 5,
        x: 960,
        y: 40,
      },
    ];
    const d: WorkflowDocument = {
      definition: {
        version: 1,
        id: randomUUID(),
        projectId,
        revision: 0,
        name: "Image to video workflow",
        nodes,
      },
      runs: [],
    };
    this.write(d);
    return this.snapshot(projectId, d.definition.id);
  }
  snapshot(projectId: string, id: string): WorkflowSnapshot {
    const d = this.read(projectId, id);
    for (const r of d.runs)
      if (r.status === "running" && !this.authorized(r)) {
        r.status = "failed";
        r.message =
          "Local approval could not be verified. Start a new run; previous results are preserved.";
      }
    return { ...d, project: this.editor.snapshot(projectId) };
  }
  save(
    projectId: string,
    id: string,
    revision: number,
    name: string,
    nodes: WorkflowNode[],
  ) {
    const d = this.read(projectId, id);
    if (d.definition.revision !== revision)
      throw new Error("Workflow changed. Reload before saving.");
    const graph = {
      ...d.definition,
      name,
      nodes: structuredClone(nodes),
      revision: revision + 1,
    };
    validateWorkflow(graph, false);
    d.history ||= { undo: [], redo: [] };
    d.history.undo.push(d.definition);
    d.history.undo = d.history.undo.slice(-50);
    d.history.redo = [];
    d.definition = graph;
    this.write(d);
    return this.snapshot(projectId, id);
  }
  importGraph(projectId: string, record: unknown) {
    const migrated = migrateWorkflow(record);
    const definition = {
      version: 1 as const,
      id: randomUUID(),
      projectId,
      revision: 0,
      name: migrated.name,
      nodes: migrated.nodes,
    };
    validateWorkflow(definition, false);
    this.write({ definition, runs: [] });
    return {
      snapshot: this.snapshot(projectId, definition.id),
      warnings: migrated.warnings,
    };
  }
  template(projectId: string, templateId: string) {
    const t = workflowTemplates.find((t) => t.id === templateId);
    if (!t) throw new Error("Unknown workflow template.");
    const definition = {
      version: 1 as const,
      id: randomUUID(),
      projectId,
      revision: 0,
      name: t.name,
      nodes: structuredClone(t.nodes),
    };
    this.write({ definition, runs: [] });
    return this.snapshot(projectId, definition.id);
  }
  history(projectId: string, id: string, revision: number, redo: boolean) {
    const d = this.read(projectId, id);
    if (d.definition.revision !== revision)
      throw new Error("Workflow changed. Reload before undo.");
    d.history ||= { undo: [], redo: [] };
    const from = redo ? d.history.redo : d.history.undo,
      to = redo ? d.history.undo : d.history.redo;
    const graph = from.pop();
    if (!graph) throw new Error("No workflow changes to undo or redo.");
    validateWorkflow(graph, false);
    to.push(d.definition);
    d.definition = { ...graph, id, projectId, revision: revision + 1 };
    this.write(d);
    return this.snapshot(projectId, id);
  }
  plan(projectId: string, id: string, revision: number) {
    const d = this.read(projectId, id);
    if (d.definition.revision !== revision)
      throw new Error("Workflow changed. Review the latest graph.");
    validateWorkflow(d.definition);
    for (const n of d.definition.nodes)
      if (n.kind.endsWith("-input") && n.kind !== "text-input")
        this.media(projectId, n.assetId!, n.kind.replace("-input", ""));
    if (d.runs.some((r) => r.status === "running" && this.authorized(r)))
      throw new Error("This workflow already has a running job.");
    return {
      graph: structuredClone(d.definition),
      credits: this.estimate(d.definition.nodes),
    };
  }
  private estimate(nodes: WorkflowNode[]) {
    return nodes.reduce(
      (sum, n) =>
        sum +
        (workflowModel(n)
          ? reserveCredits(
              getCapability(workflowModel(n)!)!.maximumEstimatedCostUsd,
            )
          : 0),
      0,
    );
  }
  start(projectId: string, id: string, revision: number) {
    const { graph } = this.plan(projectId, id, revision),
      d = this.read(projectId, id);
    const run: ProjectWorkflowRun = {
      id: randomUUID(),
      graph,
      status: "running",
      createdAt: new Date().toISOString(),
      steps: validateWorkflow(graph).map((n) => ({
        nodeId: n.id,
        status: "pending",
        assetIds: [],
      })),
    };
    d.runs.push(run);
    this.write(d);
    this.approve(run);
    this.schedule(projectId, id, run.id, 0);
    return this.snapshot(projectId, id);
  }
  private media(projectId: string, id: string, kind?: string) {
    const p = this.editor.snapshot(projectId).project,
      a = p.assets.find(
        (a) => a.id === id && (!kind || a.kind === kind) && !a.missing,
      );
    if (!a) throw new Error("Relink or choose available project media.");
    const file = this.editor.resolveMedia(
      `heis-project://${projectId}/${a.path.split("/").map(encodeURIComponent).join("/")}`,
    );
    return { asset: a, file };
  }
  private update(
    projectId: string,
    id: string,
    runId: string,
    change: (r: ProjectWorkflowRun) => void,
  ) {
    const d = this.read(projectId, id),
      r = d.runs.find((r) => r.id === runId);
    if (!r) throw new Error("Workflow run not found.");
    this.check(r);
    change(r);
    this.write(d);
    this.approve(r);
    return r;
  }
  private schedule(projectId: string, id: string, runId: string, delay = 2000) {
    if (this.disposed || !this.provider || this.timers.has(runId)) return;
    this.timers.set(
      runId,
      setTimeout(() => {
        this.timers.delete(runId);
        void this.tick(projectId, id, runId);
      }, delay),
    );
    this.timers.get(runId)!.unref();
  }
  resumeProject(projectId: string) {
    if (this.disposed) return;
    try {
      for (const w of this.list(projectId)) {
        for (const r of this.read(projectId, w.id).runs)
          if (r.status === "running" && this.authorized(r))
            this.schedule(projectId, w.id, r.id, 0);
      }
    } catch {
      /* Keep incompatible records intact; opening the workspace reports the error. */
    }
  }
  async tick(projectId: string, id: string, runId: string) {
    if (this.disposed || !this.provider || this.busy.has(runId)) return;
    this.busy.add(runId);
    let nodeId: string | undefined;
    try {
      let run = this.read(projectId, id).runs.find((r) => r.id === runId)!;
      if (!run || run.status !== "running") return;
      this.check(run);
      const step = run.steps.find((s) => s.status !== "succeeded");
      if (!step) {
        this.update(projectId, id, runId, (r) => {
          r.status = "succeeded";
        });
        return;
      }
      nodeId = step.nodeId;
      const node = run.graph.nodes.find((n) => n.id === nodeId)!;
      const done = (assetIds: string[], text?: string) => {
        this.update(projectId, id, runId, (r) => {
          if (r.status === "running") {
            const s = r.steps.find((s) => s.nodeId === nodeId)!;
            s.status = "succeeded";
            s.assetIds = assetIds;
            s.text = text;
            s.message = undefined;
          }
        });
        this.schedule(projectId, id, runId, 0);
      };
      if (node.kind.endsWith("-input")) {
        if (node.kind === "text-input") {
          done([], node.prompt);
          return;
        }
        const { asset } = this.media(
          projectId,
          node.assetId!,
          node.kind.replace("-input", ""),
        );
        done([asset.id]);
        return;
      }
      const sourceIds = workflowMediaSources(node),
        sources = sourceIds.map(
          (id) => run.steps.find((s) => s.nodeId === id)!,
        );
      for (const id of workflowDependencies(node))
        if (run.steps.find((s) => s.nodeId === id)?.status !== "succeeded")
          throw new Error("An upstream result is unavailable.");
      const sourceAssets = sources.map(
        (s, i) => s.assetIds[node.sourceIndices?.[i] || 0],
      );
      const prompt = [
        node.prompt,
        node.promptSource
          ? run.steps.find((s) => s.nodeId === node.promptSource)?.text
          : undefined,
      ]
        .filter(Boolean)
        .join("\n");
      if (prompt.length > 16000)
        throw new Error("Combined prompt exceeds 16,000 characters.");
      if (node.kind === "text-concat") {
        const value = [node.prompt, ...sources.map((s) => s.text || "")]
          .filter(Boolean)
          .join("\n");
        if (value.length > 16000)
          throw new Error("Combined text exceeds 16,000 characters.");
        done([], value);
        return;
      }
      if (node.kind === "output") {
        done([...sources[0].assetIds], sources[0].text);
        return;
      }
      if (node.kind === "video-combine") {
        const marker = "workflow:" + runId + ":" + nodeId;
        const result = this.editor
          .snapshot(projectId)
          .project.assets.find((a) => a.sourceJobId === marker);
        if (result) {
          done([result.id]);
          return;
        }
        let job = step.localJobId
          ? this.editor.jobs(projectId).find((j) => j.id === step.localJobId)
          : undefined;
        if (job?.status === "failed" || job?.status === "cancelled")
          throw new Error(
            job.message || "Local composition interrupted. Resume to retry.",
          );
        if (job?.status === "succeeded")
          throw new Error(
            "Local composition has no available output. Resume to retry.",
          );
        if (!job) {
          job = this.editor.workflowCombine(projectId, sourceAssets, marker);
          this.update(projectId, id, runId, (r) => {
            const s = r.steps.find((s) => s.nodeId === nodeId)!;
            s.localJobId = job!.id;
            s.status = "running";
          });
        }
        this.schedule(projectId, id, runId);
        return;
      }
      if (!step.request) {
        const urls: string[] = [];
        for (const assetId of sourceAssets) {
          const { asset, file } = this.media(projectId, assetId);
          const max = asset.kind === "image" ? 20 : 500;
          if (fs.statSync(file).size > max * 1024 * 1024)
            throw new Error(`Input exceeds the ${max} MB upload limit.`);
          const types: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".m4a": "audio/mp4",
            ".aac": "audio/aac",
            ".ogg": "audio/ogg",
          };
          const type = types[path.extname(file).toLowerCase()];
          if (!type)
            throw new Error(
              "Convert this input to a supported image, video or audio format.",
            );
          const uploaded = await this.provider.upload({
            name: asset.name,
            type,
            bytes: await fs.promises.readFile(file),
          });
          urls.push(uploaded.url);
          if (
            this.disposed ||
            this.read(projectId, id).runs.find((r) => r.id === runId)
              ?.status !== "running"
          )
            return;
        }
        const capability = getCapability(workflowModel(node)!)!;
        const request: GenerationRequest = {
          modelId: capability.id,
          operation: capability.operation,
          inputs: workflowInputs(node, urls, prompt),
          billing: {
            mode: "managed",
            accountId: "desktop",
            idempotencyKey: randomUUID(),
          },
        };
        validateGenerationRequest(request);
        run = this.update(projectId, id, runId, (r) => {
          if (r.status === "running") {
            const s = r.steps.find((s) => s.nodeId === nodeId)!;
            s.request = request;
            s.status = "running";
          }
        });
      }
      run = this.read(projectId, id).runs.find((r) => r.id === runId)!;
      if (run.status !== "running") return;
      let active = run.steps.find((s) => s.nodeId === nodeId)!;
      if (!active.providerJobId) {
        const job = await this.provider.submit(active.request!);
        if (this.disposed) return;
        run = this.update(projectId, id, runId, (r) => {
          r.steps.find((s) => s.nodeId === nodeId)!.providerJobId = job.id;
        });
        if (run.status !== "running") {
          await this.provider.cancel(job.id);
          return;
        }
        active = run.steps.find((s) => s.nodeId === nodeId)!;
      }
      const result = await this.provider.getJob(active.providerJobId!);
      if (this.disposed) return;
      if (
        this.read(projectId, id).runs.find((r) => r.id === runId)!.status !==
        "running"
      )
        return;
      if (result.status === "failed" || result.status === "cancelled") {
        this.update(projectId, id, runId, (r) => {
          const s = r.steps.find((s) => s.nodeId === nodeId)!;
          s.terminalFailure = true;
        });
        throw new Error(
          result.error?.message || "Provider job " + result.status,
        );
      }
      if (result.status === "succeeded") {
        const urls = result.outputs.flatMap((o) => (o.url ? [o.url] : []));
        if (!urls.length)
          throw new Error("Provider completed without a downloadable result.");
        if (workflowOutput(node) === "text") {
          const url = new URL(urls[0]);
          if (url.protocol !== "https:")
            throw new Error("Text output must use HTTPS.");
          const response = await fetch(url, {
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok || !response.body)
            throw new Error("Could not download generated text.");
          const reader = response.body.getReader();
          let bytes = 0;
          const chunks: Uint8Array[] = [];
          try {
            for (;;) {
              const part = await reader.read();
              if (part.done) break;
              bytes += part.value.length;
              if (bytes > 100000)
                throw new Error("Generated text is too large.");
              chunks.push(part.value);
            }
          } finally {
            await reader.cancel();
          }
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (
            typeof parsed.text !== "string" ||
            !parsed.text.trim() ||
            parsed.text.length > 64000
          )
            throw new Error("Provider returned invalid text.");
          done([], parsed.text);
          return;
        }
        await this.editor.capture(projectId, urls, active.providerJobId!);
        if (this.disposed) return;
        const assets = this.editor
          .snapshot(projectId)
          .project.assets.filter((a) =>
            a.sourceJobId?.startsWith(active.providerJobId + ":"),
          );
        const expected = workflowOutput(node);
        if (!assets.length || assets.some((a) => a.kind !== expected))
          throw new Error(
            "Provider returned the wrong media type for this node.",
          );
        this.editor.flush(projectId);
        this.update(projectId, id, runId, (r) => {
          if (r.status === "running") {
            const s = r.steps.find((s) => s.nodeId === nodeId)!;
            s.status = "succeeded";
            s.assetIds = assets.map((a) => a.id);
            s.message = undefined;
          }
        });
        this.schedule(projectId, id, runId, 0);
      } else this.schedule(projectId, id, runId);
    } catch (e) {
      try {
        if (
          !this.disposed &&
          this.authorized(
            this.read(projectId, id).runs.find((r) => r.id === runId)!,
          )
        )
          this.update(projectId, id, runId, (r) => {
            if (r.status === "running") {
              r.status = "failed";
              r.message = String(e);
              const s = r.steps.find((s) => s.nodeId === nodeId);
              if (s) {
                s.status = "failed";
                s.message = String(e);
              }
            }
          });
      } catch {
        // Preserve damaged or externally modified records. Opening the workspace reports the error.
      }
    } finally {
      this.busy.delete(runId);
    }
  }
  retryPlan(projectId: string, id: string, runId: string) {
    const d = this.read(projectId, id),
      r = d.runs.find((r) => r.id === runId);
    if (!r) throw new Error("Workflow run not found.");
    this.check(r);
    if (
      !["failed", "cancelled"].includes(r.status) ||
      this.busy.has(runId) ||
      d.runs.some((r) => r.status === "running" && this.authorized(r))
    )
      throw new Error("Wait for the current run to stop before retrying.");
    return {
      run: r,
      credits: this.estimate(
        r.graph.nodes.filter(
          (n) => r.steps.find((s) => s.nodeId === n.id)?.status !== "succeeded",
        ),
      ),
    };
  }
  async retry(projectId: string, id: string, runId: string) {
    const { run } = this.retryPlan(projectId, id, runId);
    this.busy.add(runId);
    try {
      if (run.status === "cancelled")
        for (const s of run.steps)
          if (s.providerJobId && s.status !== "succeeded") {
            const job = await this.provider?.getJob(s.providerJobId);
            if (job?.status === "cancelled" || job?.status === "failed")
              this.update(projectId, id, runId, (r) => {
                r.steps.find(
                  (step) => step.nodeId === s.nodeId,
                )!.terminalFailure = true;
              });
          }
      this.update(projectId, id, runId, (r) => {
        r.status = "running";
        r.message = undefined;
        r.cancelRequested = false;
        for (const s of r.steps)
          if (s.status !== "succeeded") {
            s.status = "pending";
            s.message = undefined;
            s.localJobId = undefined;
            if (s.terminalFailure) {
              s.request = undefined;
              s.providerJobId = undefined;
              s.terminalFailure = false;
            }
          }
      });
    } finally {
      this.busy.delete(runId);
    }
    this.schedule(projectId, id, runId, 0);
    return this.snapshot(projectId, id);
  }

  async cancel(projectId: string, id: string, runId: string) {
    const r = this.update(projectId, id, runId, (r) => {
      if (r.status !== "running") throw new Error("This run is not running.");
      r.status = "cancelled";
      r.cancelRequested = true;
      r.message =
        "Stopped. Completed results are retained. An in-flight submission may still incur provider charges.";
    });
    clearTimeout(this.timers.get(runId));
    this.timers.delete(runId);
    for (const step of r.steps)
      if (step.localJobId && step.status !== "succeeded")
        this.editor.cancel(step.localJobId);
    for (const s of r.steps)
      if (s.providerJobId && s.status !== "succeeded") {
        try {
          await this.provider?.cancel(s.providerJobId);
        } catch (e) {
          this.update(projectId, id, runId, (r) => {
            r.message =
              "Stopped locally. Provider cancellation could not be confirmed: " +
              String(e);
          });
        }
      }
    return this.snapshot(projectId, id);
  }
  insert(
    projectId: string,
    id: string,
    runId: string,
    assetId: string,
    sequenceId: string,
    frame: number,
    revision: number,
    replaceClipId?: string,
    fit: "preserve" | "trim" = "preserve",
  ) {
    const doc = this.read(projectId, id),
      run = doc.runs.find((r) => r.id === runId);
    if (
      !run?.steps.some(
        (s) => s.status === "succeeded" && s.assetIds.includes(assetId),
      )
    )
      throw new Error("Choose a completed result from this run.");
    const p = this.editor.snapshot(projectId).project,
      a = p.assets.find((a) => a.id === assetId && !a.missing),
      seq = p.sequences.find((s) => s.id === sequenceId);
    if (!a || !seq || !Number.isSafeInteger(frame) || frame < 0)
      throw new Error("Invalid timeline destination or missing result.");
    const length =
      a.kind === "image"
        ? Math.round(5 * fps(seq))
        : Math.floor(a.durationSeconds * fps(seq));
    if (length < 1) throw new Error("Result is too short.");
    const edits: EditorEdit[] = [];
    if (replaceClipId) {
      const c = seq.clips.find((c) => c.id === replaceClipId);
      if (
        !c?.assetId ||
        seq.tracks.find((t) => t.id === c.trackId)?.kind !==
          (a.kind === "audio" ? "audio" : "video")
      )
        throw new Error("Choose a video or image clip.");
      if (c.linkId)
        throw new Error("Detach linked audio before replacing this clip.");
      if (a.kind !== "image" && length < c.duration && fit !== "trim")
        throw new Error(
          "Result is shorter than the clip. Choose Trim to result length.",
        );
      edits.push({
        type: "clip.update",
        sequenceId,
        id: c.id,
        patch: {
          assetId,
          name: a.name,
          sourceIn: 0,
          duration:
            a.kind === "image" ? c.duration : Math.min(length, c.duration),
        },
      });
    } else {
      const track = newTrack(
          randomUUID(),
          a.kind === "audio" ? "audio" : "video",
          "Workflow result",
        ),
        clip = newClip(randomUUID(), track.id, frame, length, a.name);
      clip.assetId = assetId;
      edits.push(
        { type: "track.add", sequenceId, track },
        { type: "clip.add", sequenceId, clip },
      );
      if (a.hasAudio && a.kind !== "audio") {
        const audio = newTrack(randomUUID(), "audio", "Workflow audio"),
          ac = newClip(randomUUID(), audio.id, frame, length, a.name);
        ac.assetId = assetId;
        ac.linkId = clip.linkId = randomUUID();
        edits.push(
          { type: "track.add", sequenceId, track: audio },
          { type: "clip.add", sequenceId, clip: ac },
        );
      }
    }
    this.editor.command({
      projectId,
      expectedRevision: revision,
      label: replaceClipId
        ? "Replace with workflow result"
        : "Add workflow result",
      edits,
    });
    return this.snapshot(projectId, id);
  }
  dispose() {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
