const STORAGE_KEY = "heis_local_workflows_v1";
const MAX_WORKFLOWS = 250;

interface StoredWorkflow {
  id: string;
  workflow_id: string;
  name: string;
  category: string;
  thumbnail?: string;
  data: { nodes: unknown[] };
  edges: unknown[];
  created_at: string;
  updated_at: string;
  is_owner: true;
  is_published: false;
  is_template: false;
}

function readWorkflows(): StoredWorkflow[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_WORKFLOWS) : [];
  } catch {
    return [];
  }
}

function writeWorkflows(workflows: StoredWorkflow[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows.slice(0, MAX_WORKFLOWS)));
}

function findWorkflow(workflowId: string): StoredWorkflow {
  const workflow = readWorkflows().find((item) => item.id === workflowId);
  if (!workflow) throw new Error("Workflow not found in this local Heis installation.");
  return workflow;
}

export async function getTemplateWorkflows() { return []; }
export async function getPublishedWorkflows() { return []; }
export async function getUserWorkflows() { return readWorkflows(); }

export async function createWorkflow(_legacyApiKey: string, payload: any) {
  const workflows = readWorkflows();
  const workflowId = String(payload.workflow_id ?? "").trim() || crypto.randomUUID();
  const existing = workflows.find((item) => item.id === workflowId);
  const now = new Date().toISOString();
  const next: StoredWorkflow = {
    id: workflowId,
    workflow_id: workflowId,
    name: String(payload.name ?? existing?.name ?? "Untitled Workflow").slice(0, 120),
    category: String(payload.category ?? existing?.category ?? "General").slice(0, 80),
    data: payload.data && Array.isArray(payload.data.nodes) ? payload.data : existing?.data ?? { nodes: [] },
    edges: Array.isArray(payload.edges) ? payload.edges : existing?.edges ?? [],
    created_at: existing?.created_at ?? now,
    updated_at: now,
    is_owner: true,
    is_published: false,
    is_template: false,
  };
  writeWorkflows([next, ...workflows.filter((item) => item.id !== workflowId)]);
  return { workflow_id: workflowId };
}

export async function updateWorkflowName(_legacyApiKey: string, workflowId: string, name: string) {
  const normalized = name.trim().slice(0, 120);
  if (!normalized) throw new Error("Workflow name is required.");
  const workflows = readWorkflows();
  if (!workflows.some((item) => item.id === workflowId)) throw new Error("Workflow not found.");
  writeWorkflows(workflows.map((item) => item.id === workflowId ? { ...item, name: normalized, updated_at: new Date().toISOString() } : item));
  return { workflow_id: workflowId, name: normalized };
}

export async function deleteWorkflow(_legacyApiKey: string, workflowId: string) {
  const workflows = readWorkflows();
  writeWorkflows(workflows.filter((item) => item.id !== workflowId));
  return { workflow_id: workflowId, deleted: true };
}

export async function getWorkflowInputs(_legacyApiKey: string, workflowId: string) {
  findWorkflow(workflowId);
  return { input_data: { type: "object", properties: {} } };
}

export async function getAllNodeSchemas(_legacyApiKey: string, workflowId: string) {
  findWorkflow(workflowId);
  return { categories: {} };
}

export async function getWorkflowData(_legacyApiKey: string, workflowId: string) {
  return findWorkflow(workflowId);
}

export async function executeWorkflow() {
  throw new Error("Workflow execution is unavailable while Heis migrates nodes to its local and managed workflow engines.");
}
