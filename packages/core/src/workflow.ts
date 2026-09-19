import {
  workflowCapabilities,
  workflowDependencies,
  workflowMediaSources,
  workflowOutput,
  workflowModel,
  validateWorkflowOptions,
} from "./workflowCapabilities";
import type { EditorSnapshot, GenerationRequest } from "./index";
export type WorkflowNodeKind =
  | "text-input"
  | "video-input"
  | "audio-input"
  | "text-concat"
  | "video-combine"
  | "managed"
  | "image-input"
  | "image-edit"
  | "image-to-video"
  | "output";
export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  name: string;
  source?: string;
  sources?: string[];
  sourceIndices?: number[];
  promptSource?: string;
  modelId?: string;
  options?: Record<string, unknown>;
  assetId?: string;
  prompt: string;
  duration: 5 | 10;
  x: number;
  y: number;
}
export interface ProjectWorkflowDefinition {
  version: 1;
  id: string;
  projectId: string;
  revision: number;
  name: string;
  nodes: WorkflowNode[];
}
export interface WorkflowStep {
  nodeId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  request?: GenerationRequest;
  providerJobId?: string;
  assetIds: string[];
  terminalFailure?: boolean;
  text?: string;
  localJobId?: string;
  message?: string;
}
export interface ProjectWorkflowRun {
  id: string;
  graph: ProjectWorkflowDefinition;
  status: "running" | "failed" | "cancelled" | "succeeded";
  createdAt: string;
  steps: WorkflowStep[];
  message?: string;
  cancelRequested?: boolean;
}
export interface WorkflowDocument {
  definition: ProjectWorkflowDefinition;
  runs: ProjectWorkflowRun[];
  history?: {
    undo: ProjectWorkflowDefinition[];
    redo: ProjectWorkflowDefinition[];
  };
}
export interface WorkflowSnapshot extends WorkflowDocument {
  project: EditorSnapshot;
}
export interface WorkflowBridge {
  workflowImport(
    projectId: string,
    record: unknown,
  ): Promise<{ snapshot: WorkflowSnapshot; warnings: string[] }>;
  workflowTemplate(
    projectId: string,
    templateId: string,
  ): Promise<WorkflowSnapshot>;
  workflowHistory(
    projectId: string,
    workflowId: string,
    revision: number,
    redo: boolean,
  ): Promise<WorkflowSnapshot>;
  workflowOpen(
    projectId?: string,
    workflowId?: string,
  ): Promise<WorkflowSnapshot>;
  workflowList(projectId: string): Promise<{ id: string; name: string }[]>;
  workflowCreate(projectId: string): Promise<WorkflowSnapshot>;
  workflowSave(
    projectId: string,
    workflowId: string,
    revision: number,
    name: string,
    nodes: WorkflowNode[],
  ): Promise<WorkflowSnapshot>;
  workflowRun(
    projectId: string,
    workflowId: string,
    revision: number,
  ): Promise<WorkflowSnapshot>;
  workflowRetry(
    projectId: string,
    workflowId: string,
    runId: string,
  ): Promise<WorkflowSnapshot>;
  workflowCancel(
    projectId: string,
    workflowId: string,
    runId: string,
  ): Promise<WorkflowSnapshot>;
  workflowInsert(
    projectId: string,
    workflowId: string,
    runId: string,
    assetId: string,
    sequenceId: string,
    frame: number,
    revision: number,
    replaceClipId?: string,
    fit?: "preserve" | "trim",
  ): Promise<WorkflowSnapshot>;
}
export const WORKFLOW_MODELS = {
  "image-edit": "heis-image-edit-standard",
  "image-to-video": "heis-video-standard",
} as const;
export function validateWorkflow(
  graph: ProjectWorkflowDefinition,
  requireInputs = true,
): WorkflowNode[] {
  if (
    !graph ||
    graph.version !== 1 ||
    typeof graph.name !== "string" ||
    !graph.name.trim() ||
    graph.name.length > 120 ||
    !Array.isArray(graph.nodes) ||
    !graph.nodes.length ||
    graph.nodes.length > 50
  )
    throw new Error("Invalid workflow. Use 1 to 50 nodes and a name.");
  const ids = new Set<string>();
  const kinds = [
    "text-input",
    "image-input",
    "video-input",
    "audio-input",
    "text-concat",
    "video-combine",
    "managed",
    "image-edit",
    "image-to-video",
    "output",
  ];
  for (const n of graph.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !n.id ||
      n.id.length > 80 ||
      ids.has(n.id) ||
      !kinds.includes(n.kind)
    )
      throw new Error("Unsupported or duplicate workflow node.");
    ids.add(n.id);
    if (
      typeof n.name !== "string" ||
      n.name.length > 120 ||
      typeof n.prompt !== "string" ||
      n.prompt.length > 16000 ||
      ![5, 10].includes(n.duration) ||
      ![n.x, n.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 5000)
    )
      throw new Error("Invalid node settings.");
    if (
      n.sources &&
      (!Array.isArray(n.sources) ||
        n.sources.length > 20 ||
        n.sources.some((s) => typeof s !== "string"))
    )
      throw new Error("Invalid connections.");
    if (
      n.sourceIndices &&
      (!Array.isArray(n.sourceIndices) ||
        n.sourceIndices.length > 20 ||
        n.sourceIndices.some((i) => !Number.isInteger(i) || i < 0 || i > 99))
    )
      throw new Error("Invalid output selection.");
    validateWorkflowOptions(n);
    if (
      n.kind === "managed" &&
      !workflowCapabilities.some((c) => c.id === n.modelId)
    )
      throw new Error("Choose an available managed capability.");
    if (
      requireInputs &&
      n.kind.endsWith("-input") &&
      n.kind !== "text-input" &&
      (!n.assetId || typeof n.assetId !== "string")
    )
      throw new Error("Choose media for every input node.");
    if (
      requireInputs &&
      (n.kind === "text-input" || workflowModel(n)) &&
      !n.prompt.trim() &&
      !n.promptSource &&
      ![
        "heis-image-upscale",
        "heis-remove-background",
        "heis-expand-image",
        "heis-image-layers",
        "heis-lipsync-video",
        "heis-lipsync-image",
      ].includes(workflowModel(n) || "")
    )
      throw new Error("Describe the result for every generation or text node.");
  }
  const ordered: WorkflowNode[] = [],
    visiting = new Set<string>(),
    done = new Set<string>();
  const visit = (n: WorkflowNode) => {
    if (done.has(n.id)) return;
    if (visiting.has(n.id))
      throw new Error("Workflow connections contain a cycle.");
    visiting.add(n.id);
    const media = workflowMediaSources(n),
      ports = workflowCapabilities.find(
        (c) => c.id === workflowModel(n),
      )?.ports;
    if (n.kind.endsWith("-input") && (media.length || n.promptSource))
      throw new Error("Input nodes cannot have incoming connections.");
    if (ports && media.length !== ports.length)
      throw new Error(
        `Connect the ${ports.length} media inputs for ${n.name}.`,
      );
    if (
      ["output", "text-concat", "video-combine"].includes(n.kind) &&
      !media.length
    )
      throw new Error("Connect every processing and output node.");
    if (n.kind === "output" && media.length !== 1)
      throw new Error("An output node accepts one connection.");
    for (const [i, id] of media.entries()) {
      const src = graph.nodes.find((s) => s.id === id);
      if (!src || src.kind === "output")
        throw new Error("Connect a valid source node.");
      const expected =
        ports?.[i]?.kind ||
        (n.kind === "text-concat"
          ? "text"
          : n.kind === "video-combine"
            ? "video"
            : undefined);
      if (expected && workflowOutput(src) !== expected)
        throw new Error(`This connection requires an ${expected} output.`);
      visit(src);
    }
    if (n.sourceIndices && n.sourceIndices.length > media.length)
      throw new Error("Output indices exceed input connections.");
    if (n.promptSource && !workflowModel(n))
      throw new Error("Only generation nodes accept prompt connections.");
    if (n.promptSource) {
      const src = graph.nodes.find((s) => s.id === n.promptSource);
      if (!src || workflowOutput(src) !== "text")
        throw new Error("Prompt connection requires text.");
      visit(src);
    }
    visiting.delete(n.id);
    done.add(n.id);
    ordered.push(n);
  };
  graph.nodes.forEach(visit);
  if (!graph.nodes.some((n) => n.kind === "output"))
    throw new Error("Add an output node.");
  const used = new Set<string>();
  const mark = (id: string) => {
    if (used.has(id)) return;
    used.add(id);
    workflowDependencies(graph.nodes.find((n) => n.id === id)!).forEach(mark);
  };
  graph.nodes.filter((n) => n.kind === "output").forEach((n) => mark(n.id));
  if (used.size !== graph.nodes.length)
    throw new Error(
      "Connect every node to an output before saving or running.",
    );
  return ordered;
}
