import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const { ProjectService } = require("../electron/lib/projectService");

test("project service persists workflow create, rename, update, and delete", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heis-project-service-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const service = new ProjectService(directory);
  const created = service.saveWorkflow({ name: "First", data: { nodes: [{ id: "node-1" }] }, edges: [] });
  assert.equal(service.listWorkflows().length, 1);
  assert.equal(service.getWorkflow(created.workflow_id).name, "First");
  service.renameWorkflow(created.workflow_id, "Renamed");
  service.saveWorkflow({ workflow_id: created.workflow_id, name: "Renamed", data: { nodes: [{ id: "node-2" }] }, edges: [{ source: "a", target: "b" }] });
  assert.equal(service.getWorkflow(created.workflow_id).data.nodes[0].id, "node-2");
  assert.equal(service.getWorkflow(created.workflow_id).edges.length, 1);
  service.deleteWorkflow(created.workflow_id);
  assert.equal(service.listWorkflows().length, 0);
});

test("project service rejects missing workflows and empty names", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heis-project-service-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const service = new ProjectService(directory);
  assert.throws(() => service.getWorkflow("missing"), /WORKFLOW_NOT_FOUND/);
  const created = service.saveWorkflow({ name: "Valid", data: { nodes: [] }, edges: [] });
  assert.throws(() => service.renameWorkflow(created.workflow_id, "   "), /WORKFLOW_NAME_REQUIRED/);
});
