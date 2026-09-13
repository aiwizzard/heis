const LEGACY_STORAGE_KEY = "heis_local_workflows_v1";

function projects() {
  if (!window.heis?.projects) throw new Error("Local Heis project storage is available in the desktop application.");
  return window.heis.projects;
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function migrateLegacyWorkflows(): Promise<void> {
  const serialized = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!serialized) return;
  let records: any[] = [];
  try { records = JSON.parse(serialized); } catch { window.localStorage.removeItem(LEGACY_STORAGE_KEY); return; }
  if (Array.isArray(records)) {
    for (const record of records.slice(0, 250)) unwrap(await projects().saveWorkflow(record));
  }
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export async function getTemplateWorkflows() { return []; }
export async function getPublishedWorkflows() { return []; }
export async function getUserWorkflows() {
  await migrateLegacyWorkflows();
  return unwrap(await projects().listWorkflows());
}
export async function createWorkflow(_legacyApiKey: string, payload: any) { return unwrap(await projects().saveWorkflow(payload)); }
export async function updateWorkflowName(_legacyApiKey: string, workflowId: string, name: string) { return unwrap(await projects().renameWorkflow(workflowId, name)); }
export async function deleteWorkflow(_legacyApiKey: string, workflowId: string) { return unwrap(await projects().deleteWorkflow(workflowId)); }
export async function getWorkflowInputs(_legacyApiKey: string, workflowId: string) {
  unwrap(await projects().getWorkflow(workflowId));
  return { input_data: { type: "object", properties: {} } };
}
export async function getAllNodeSchemas(_legacyApiKey: string, workflowId: string) {
  unwrap(await projects().getWorkflow(workflowId));
  return { categories: {} };
}
export async function getWorkflowData(_legacyApiKey: string, workflowId: string) { return unwrap(await projects().getWorkflow(workflowId)); }
export async function executeWorkflow() {
  throw new Error("Workflow execution is unavailable while Heis migrates nodes to its local and managed workflow engines.");
}
