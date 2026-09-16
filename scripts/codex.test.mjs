import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { CodexService } from "../test-results/unit/service.mjs";
import { CodexRpc } from "../test-results/unit/rpc.mjs";
process.env.HEIS_CODEX_BINARY = resolve("scripts/fixtures/codex-mock.mjs");
const waitFor = async (fn) => {
  const deadline = Date.now() + 5000;
  while (!fn()) {
    if (Date.now() > deadline) throw new Error("Timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "sai-unit-"));
  process.env.HEIS_TEST_LOG = join(dir, "wire.jsonl");
  const service = new CodexService(
    dir,
    () => {},
    async () => {},
  );
  service.addProject(dir);
  await service.refresh();
  return {
    dir,
    service,
    cleanup: async () => {
      service.dispose();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test("streams, persists, resumes the same provider thread, and retains configured permissions", async () => {
  const { dir, service, cleanup } = await setup();
  let reopened;
  try {
    assert.equal(service.snapshot().codex.state, "ready");
    const id = await service.send({ project: dir, text: "hello" });
    await waitFor(() => service.snapshot().threads[0].status === "idle");
    assert.equal(
      service.snapshot().threads[0].items.at(-1).text,
      "Hello from Codex.",
    );
    const providerId = service.snapshot().threads[0].providerId;
    service.dispose();
    reopened = new CodexService(
      dir,
      () => {},
      async () => {},
    );
    await reopened.send({ threadId: id, project: dir, text: "follow up" });
    await waitFor(() => reopened.snapshot().threads[0].status === "idle");
    assert.equal(reopened.snapshot().threads[0].providerId, providerId);
    const wire = (await readFile(join(dir, "wire.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.ok(
      wire.some(
        (m) => m.method === "thread/resume" && m.params.threadId === providerId,
      ),
    );
    assert.ok(
      wire
        .filter((m) => ["thread/start", "thread/resume"].includes(m.method))
        .every(
          (m) =>
            m.params.sandbox === "workspace-write" &&
            m.params.approvalsReviewer === "user" &&
            m.params.approvalPolicy === "on-request",
        ),
    );
    await assert.rejects(
      reopened.send({ project: "/not-selected", text: "x" }),
      /folder picker/,
    );
  } finally {
    reopened?.dispose();
    await cleanup();
  }
});
test("approvals require an explicit valid answer and user questions round-trip", async () => {
  const { dir, service, cleanup } = await setup();
  try {
    const id = await service.send({ project: dir, text: "approval-input" });
    await waitFor(() => service.snapshot().threads[0].requests.length === 1);
    const request = service.snapshot().threads[0].requests[0];
    assert.equal(request.kind, "command");
    await assert.rejects(
      service.answer({
        threadId: "wrong",
        requestId: request.id,
        decision: "accept",
      }),
    );
    await service.answer({
      threadId: id,
      requestId: request.id,
      decision: "accept",
    });
    await waitFor(
      () => service.snapshot().threads[0].requests[0]?.kind === "input",
    );
    const question = service.snapshot().threads[0].requests[0];
    await assert.rejects(
      service.answer({ threadId: id, requestId: question.id, answers: {} }),
    );
    await service.answer({
      threadId: id,
      requestId: question.id,
      answers: { color: "Blue" },
    });
    await waitFor(() => service.snapshot().threads[0].status === "idle");
    await assert.rejects(
      service.answer({
        threadId: id,
        requestId: request.id,
        decision: "accept",
      }),
    );
  } finally {
    await cleanup();
  }
});
test("file-change denial, interruption, busy guard, and process crash recovery", async () => {
  const { dir, service, cleanup } = await setup();
  try {
    const id = await service.send({ project: dir, text: "approval-file" });
    await waitFor(() => service.snapshot().threads[0].requests.length > 0);
    await service.answer({
      threadId: id,
      requestId: service.snapshot().threads[0].requests[0].id,
      decision: "decline",
    });
    await waitFor(() => service.snapshot().threads[0].status === "idle");
    await service.send({ threadId: id, project: dir, text: "hold" });
    await assert.rejects(
      service.send({ project: dir, text: "another" }),
      /current turn/,
    );
    await service.stop(id);
    await waitFor(() => service.snapshot().threads[0].status === "idle");
    assert.ok(
      service
        .snapshot()
        .threads[0].items.some((i) => i.text === "Turn stopped."),
    );
    await service.send({ threadId: id, project: dir, text: "crash" });
    await waitFor(() => service.snapshot().codex.state === "error");
    assert.equal(service.snapshot().threads[0].status, "error");
    await service.send({ threadId: id, project: dir, text: "recovered" });
    await waitFor(() => service.snapshot().threads[0].status === "idle");
  } finally {
    await cleanup();
  }
});
test("missing login is actionable and login cancellation clears pending state", async () => {
  process.env.HEIS_TEST_SIGNED_OUT = "1";
  const { service, cleanup } = await setup();
  try {
    assert.equal(service.snapshot().codex.state, "signed-out");
    await service.login();
    assert.equal(service.snapshot().codex.loginPending, true);
    await service.cancelLogin();
    assert.equal(service.snapshot().codex.loginPending, false);
  } finally {
    delete process.env.HEIS_TEST_SIGNED_OUT;
    await cleanup();
  }
});
test("RPC timeout closes ambiguous requests instead of replaying them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sai-rpc-"));
  const binary = join(dir, "silent");
  await writeFile(binary, "#!/bin/sh\nexec sleep 20\n", { mode: 0o700 });
  const rpc = new CodexRpc(
    binary,
    () => {},
    () => {},
  );
  try {
    await assert.rejects(rpc.request("initialize", {}, 50), /did not respond/);
    await assert.rejects(rpc.request("turn/start", {}), /disconnected/);
  } finally {
    rpc.close();
    await rm(dir, { recursive: true, force: true });
  }
});
