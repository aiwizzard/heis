import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
const output = resolve("test-results/unit/workflow-webhook.mjs");
await build({
  entryPoints: ["apps/web/lib/runwareWebhook.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "hosted-fixtures",
      setup(b) {
        b.onResolve({ filter: /^\.\/(r2|supabase|layeredImage)$/ }, (args) => ({
          path: args.path,
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents: args.path.endsWith("supabase")
            ? "export const createAdminClient=()=>globalThis.workflowWebhookHarness.admin;"
            : args.path.endsWith("r2")
              ? 'export const storeAnalysisAsset=async value=>{globalThis.workflowWebhookHarness.stored.push(value);return "result.json";};export const copyRemoteAsset=()=>{throw Error("unexpected media download")};export const storeLayerAsset=()=>{throw Error("unexpected layer storage")};'
              : 'export class InvalidLayeredImageError extends Error{};export const fetchLayeredImage=()=>{throw Error("unexpected layers")};',
          loader: "js",
        }));
      },
    },
  ],
});
const { processRunwareWebhook } = await import("file://" + output);
function setup({
  duplicate = false,
  status = "submitted",
  existing = false,
  failStorage = false,
} = {}) {
  const events = [],
    stored = [],
    job = { id: "job", user_id: "user", status, operation: "generate-text" };
  const admin = {
    rpc: async (name, args) => {
      events.push({ name, args });
      return {
        data: name === "claim_webhook" ? !duplicate : true,
        error:
          name === "finalize_cloud_output" && failStorage
            ? new Error("storage disconnected")
            : null,
      };
    },
    from: (table) => {
      let action = "select",
        payload;
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        update(value) {
          action = "update";
          payload = value;
          return q;
        },
        delete() {
          action = "delete";
          return q;
        },
        single: async () => ({ data: job }),
        maybeSingle: async () => ({ data: existing ? { id: "asset" } : null }),
        then(ok, no) {
          events.push({ table, action, payload });
          return Promise.resolve({ data: null, error: null }).then(ok, no);
        },
      };
      return q;
    },
  };
  globalThis.workflowWebhookHarness = { admin, events, stored };
  return globalThis.workflowWebhookHarness;
}
test("text webhook stores Unicode JSON once and settles the reported provider cost", async () => {
  const h = setup();
  assert.deepEqual(
    await processRunwareWebhook({
      taskUUID: "event",
      text: "Hello 世界",
      cost: 0.01,
    }),
    { ok: true },
  );
  assert.equal(h.stored[0].value.text, "Hello 世界");
  assert.equal(
    h.events.find((e) => e.name === "finalize_cloud_output").args.p_kind,
    "other",
  );
  assert.equal(
    h.events.find((e) => e.name === "settle_generation_credits").args
      .p_provider_cost,
    0.01,
  );
  assert.ok(
    h.events.some(
      (e) => e.table === "generation_jobs" && e.payload?.status === "succeeded",
    ),
  );
});
test("duplicate and cancelled text callbacks cannot store or settle again", async () => {
  for (const options of [{ duplicate: true }, { status: "cancelled" }]) {
    const h = setup(options);
    await processRunwareWebhook({
      taskUUID: "event",
      text: "Hello",
      cost: 0.01,
    });
    assert.equal(h.stored.length, 0);
    assert.ok(!h.events.some((e) => e.name === "settle_generation_credits"));
  }
});
test("invalid text returns the reservation and fails with a text-specific error", async () => {
  for (const text of ["", {}, "x".repeat(64001)]) {
    const h = setup();
    assert.deepEqual(
      await processRunwareWebhook({ taskUUID: "event", text, cost: 0.01 }),
      { failed: true },
    );
    assert.ok(h.events.some((e) => e.name === "release_generation_credits"));
    assert.ok(
      h.events.some((e) => e.payload?.error_code === "INVALID_TEXT_OUTPUT"),
    );
    assert.ok(!h.events.some((e) => e.name === "settle_generation_credits"));
  }
});
test("retry after durable text storage reuses the existing output", async () => {
  const h = setup({ existing: true });
  await processRunwareWebhook({ taskUUID: "event", text: "Hello", cost: 0.01 });
  assert.equal(h.stored.length, 0);
  assert.ok(!h.events.some((e) => e.name === "finalize_cloud_output"));
  assert.ok(h.events.some((e) => e.name === "settle_generation_credits"));
});
test("failed storage leaves the callback retryable without settling credits", async () => {
  const h = setup({ failStorage: true });
  await assert.rejects(
    () =>
      processRunwareWebhook({ taskUUID: "event", text: "Hello", cost: 0.01 }),
    /storage disconnected/,
  );
  assert.ok(
    h.events.some(
      (e) => e.table === "processed_webhooks" && e.payload?.status === "failed",
    ),
  );
  assert.ok(!h.events.some((e) => e.name === "settle_generation_credits"));
});
