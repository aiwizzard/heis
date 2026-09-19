import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise the production webhook with in-memory cloud/provider boundaries.
function harness() {
  const job: any = { id: "job", user_id: "user", operation: "decompose-layers", status: "submitted" };
  const assets: any[] = [];
  const writes: number[] = [];
  const calls: string[] = [];
  let processed = false, failIndex = -1, invalid = false;
  class InvalidLayeredImageError extends Error {}
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {}; let update: any;
      const query: any = {
        select() { return query; }, eq(key: string, value: unknown) { filters[key] = value; return query; },
        update(value: unknown) { update = value; return query; }, delete() { return query; },
        async single() { return { data: job }; },
        async maybeSingle() { return { data: assets.find(a => a.source === filters.source_url) }; },
        then(resolve: (result: unknown) => void) {
          if (table === "generation_jobs" && update) Object.assign(job, update);
          if (table === "processed_webhooks" && update) processed = update.status === "processed";
          return Promise.resolve({ data: null }).then(resolve);
        },
      }; return query;
    },
    async rpc(name: string, params: any) {
      calls.push(name);
      if (name === "claim_webhook") return { data: !processed };
      if (name === "finalize_cloud_output") assets.push({ id: params.p_object_key, source: params.p_source_url });
      return { data: true };
    },
  };
  const exports: any = {};
  const source = readFileSync("apps/web/lib/runwareWebhook.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports: Record<string, unknown> = {
    "@heis/core": { creditsForProviderCost: () => 12 },
    "./supabase": { createAdminClient: () => admin },
    "./r2": { storeLayerAsset: async ({ index }: { index: number }) => { if (index === failIndex) throw new Error("Storage temporarily unavailable"); writes.push(index); return `layer-${index}`; } },
    "./layeredImage": { InvalidLayeredImageError, fetchLayeredImage: async () => { if (invalid) throw new InvalidLayeredImageError("Flattened output"); return [Buffer.from("0"), Buffer.from("1"), Buffer.from("2")]; } },
  };
  new Function("require", "exports", compiled)((id: string) => { if (!(id in imports)) throw new Error(id); return imports[id]; }, exports);
  return { run: () => exports.processRunwareWebhook({ taskUUID: "task", imageURL: "https://im.runware.ai/layers.tiff", cost: .03 }), job, assets, writes, calls, fail: (index: number) => { failIndex = index; }, invalid: () => { invalid = true; } };
}

test("layer webhook saves every layer before settlement and deduplicates completion", async () => {
  const h = harness(); await h.run();
  assert.equal(h.job.status, "succeeded"); assert.equal(h.assets.length, 3);
  assert.deepEqual(h.writes, [0, 1, 2]);
  assert.ok(h.calls.lastIndexOf("finalize_cloud_output") < h.calls.indexOf("settle_generation_credits"));
  assert.deepEqual(await h.run(), { duplicate: true });
  assert.equal(h.calls.filter(c => c === "settle_generation_credits").length, 1);
});
test("partial download retry preserves completed layers and does not settle early", async () => {
  const h = harness(); h.fail(1); await assert.rejects(h.run(), /Storage/);
  assert.equal(h.job.status, "submitted"); assert.equal(h.assets.length, 1);
  assert.equal(h.calls.includes("settle_generation_credits"), false);
  h.fail(-1); await h.run();
  assert.deepEqual(h.writes, [0, 1, 2]); assert.equal(h.assets.length, 3);
});
test("invalid layer output fails the job and returns reserved credits", async () => {
  const h = harness(); h.invalid(); await h.run();
  assert.equal(h.job.status, "failed"); assert.equal(h.job.error_code, "INVALID_LAYER_OUTPUT");
  assert.equal(h.assets.length, 0); assert.ok(h.calls.includes("release_generation_credits"));
  assert.equal(h.calls.includes("settle_generation_credits"), false);
});
test("cancelled layer jobs do not download or settle", async () => {
  const h = harness(); h.job.status = "cancelled"; await h.run();
  assert.equal(h.writes.length, 0); assert.equal(h.calls.includes("settle_generation_credits"), false);
});
