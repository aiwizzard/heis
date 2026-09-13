const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_WORKFLOWS = 250;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function cleanText(value: unknown, fallback: string, maximum: number): string {
  const text = String(value ?? fallback).trim();
  return (text || fallback).slice(0, maximum);
}

class ProjectService {
  private readonly directory: string;
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.directory = path.join(userDataPath, "projects");
    this.filePath = path.join(this.directory, "workflows.json");
  }

  private read(): any[] {
    try {
      const stat = fs.statSync(this.filePath);
      if (stat.size > MAX_FILE_BYTES) throw new Error("WORKFLOW_STORE_TOO_LARGE");
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return Array.isArray(parsed) ? parsed.slice(0, MAX_WORKFLOWS) : [];
    } catch (error: any) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  private write(workflows: any[]): void {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const serialized = JSON.stringify(workflows.slice(0, MAX_WORKFLOWS), null, 2);
    if (Buffer.byteLength(serialized) > MAX_FILE_BYTES) throw new Error("WORKFLOW_STORE_TOO_LARGE");
    const temporaryPath = `${this.filePath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
  }

  listWorkflows(): any[] { return this.read(); }

  getWorkflow(workflowId: string): any {
    const workflow = this.read().find((item) => item.id === workflowId);
    if (!workflow) throw new Error("WORKFLOW_NOT_FOUND");
    return workflow;
  }

  saveWorkflow(payload: any): { workflow_id: string } {
    const workflows = this.read();
    const workflowId = cleanText(payload?.workflow_id, "", 80) || crypto.randomUUID();
    const existing = workflows.find((item) => item.id === workflowId);
    const now = new Date().toISOString();
    const workflow = {
      id: workflowId,
      workflow_id: workflowId,
      name: cleanText(payload?.name, existing?.name ?? "Untitled Workflow", 120),
      category: cleanText(payload?.category, existing?.category ?? "General", 80),
      data: payload?.data && Array.isArray(payload.data.nodes) ? payload.data : existing?.data ?? { nodes: [] },
      edges: Array.isArray(payload?.edges) ? payload.edges : existing?.edges ?? [],
      created_at: existing?.created_at ?? now,
      updated_at: now,
      is_owner: true,
      is_published: false,
      is_template: false,
    };
    this.write([workflow, ...workflows.filter((item) => item.id !== workflowId)]);
    return { workflow_id: workflowId };
  }

  renameWorkflow(workflowId: string, name: string): { workflow_id: string; name: string } {
    const normalized = cleanText(name, "", 120);
    if (!normalized) throw new Error("WORKFLOW_NAME_REQUIRED");
    const workflows = this.read();
    if (!workflows.some((item) => item.id === workflowId)) throw new Error("WORKFLOW_NOT_FOUND");
    this.write(workflows.map((item) => item.id === workflowId ? { ...item, name: normalized, updated_at: new Date().toISOString() } : item));
    return { workflow_id: workflowId, name: normalized };
  }

  deleteWorkflow(workflowId: string): { workflow_id: string; deleted: true } {
    this.write(this.read().filter((item) => item.id !== workflowId));
    return { workflow_id: workflowId, deleted: true };
  }
}

module.exports = { ProjectService };
