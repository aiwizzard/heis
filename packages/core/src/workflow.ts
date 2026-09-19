import type { EditorSnapshot, GenerationRequest } from "./index";
export type WorkflowNodeKind =
  | "image-input"
  | "image-edit"
  | "image-to-video"
  | "output";
export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  name: string;
  source?: string;
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
}
export interface WorkflowSnapshot extends WorkflowDocument {
  project: EditorSnapshot;
}
export interface WorkflowBridge {
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
    graph.nodes.length > 30
  )
    throw new Error("Invalid workflow. Use 1 to 30 nodes and a name.");
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !n.id ||
      n.id.length > 80 ||
      ids.has(n.id) ||
      !["image-input", "image-edit", "image-to-video", "output"].includes(
        n.kind,
      )
    )
      throw new Error("Unsupported or duplicate workflow node.");
    ids.add(n.id);
    if (
      typeof n.name !== "string" ||
      n.name.length > 120 ||
      typeof n.prompt !== "string" ||
      n.prompt.length > 8000 ||
      ![5, 10].includes(n.duration) ||
      ![n.x, n.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 5000)
    )
      throw new Error("Invalid node settings.");
    if (
      requireInputs &&
      n.kind === "image-input" &&
      (!n.assetId || typeof n.assetId !== "string")
    )
      throw new Error("Choose an image for every input node.");
    if (
      requireInputs &&
      (n.kind === "image-edit" || n.kind === "image-to-video") &&
      !n.prompt.trim()
    )
      throw new Error("Describe the result for every generation node.");
  }
  const ordered: WorkflowNode[] = [],
    visiting = new Set<string>(),
    done = new Set<string>();
  const visit = (n: WorkflowNode) => {
    if (done.has(n.id)) return;
    if (visiting.has(n.id))
      throw new Error("Workflow connections contain a cycle.");
    visiting.add(n.id);
    if (n.kind !== "image-input") {
      const source = graph.nodes.find((s) => s.id === n.source);
      if (!source) throw new Error("Connect every processing and output node.");
      if (
        source.kind === "output" ||
        ((n.kind === "image-edit" || n.kind === "image-to-video") &&
          source.kind === "image-to-video")
      )
        throw new Error("This connection requires an image output.");
      visit(source);
    } else if (n.source)
      throw new Error("Input nodes cannot have incoming connections.");
    visiting.delete(n.id);
    done.add(n.id);
    ordered.push(n);
  };
  graph.nodes.forEach(visit);
  if (!graph.nodes.some((n) => n.kind === "output"))
    throw new Error("Add an output node.");
  // Every paid node must contribute to a declared output.
  const used = new Set<string>();
  const mark = (id: string) => {
    if (used.has(id)) return;
    used.add(id);
    const n = graph.nodes.find((n) => n.id === id)!;
    if (n.source) mark(n.source);
  };
  graph.nodes.filter((n) => n.kind === "output").forEach((n) => mark(n.id));
  if (used.size !== graph.nodes.length)
    throw new Error(
      "Connect every node to an output before saving or running.",
    );
  return ordered;
}
