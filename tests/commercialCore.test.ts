import assert from "node:assert/strict";
import test from "node:test";
import { canUseCachedEntitlement, creditsForProviderCost, getCapability, planCreditDebits, resolveAccess } from "../packages/core/src/index";

test("provider costs are converted to credits with a 2x markup", () => {
  assert.equal(creditsForProviderCost(0), 0);
  assert.equal(creditsForProviderCost(0.004), 1);
  assert.equal(creditsForProviderCost(0.0251), 6);
  assert.equal(creditsForProviderCost(1), 200);
});

test("credit debits consume trial, monthly, then purchased balances", () => {
  assert.deepEqual(planCreditDebits([
    { kind: "purchased", available: 100 },
    { kind: "monthly", available: 20 },
    { kind: "trial", available: 5 },
  ], 30), [
    { kind: "trial", amount: 5 },
    { kind: "monthly", amount: 20 },
    { kind: "purchased", amount: 5 },
  ]);
});

test("expired credit wallets are not consumed", () => {
  assert.throws(() => planCreditDebits([
    { kind: "trial", available: 100, expiresAt: "2025-01-01T00:00:00.000Z" },
  ], 1, new Date("2026-01-01T00:00:00.000Z")), /INSUFFICIENT_CREDITS/);
});

test("cancelled creators retain read and export access", () => {
  assert.deepEqual(resolveAccess({ hasLifetime: false, creatorActive: false, trialActive: false }), {
    mode: "read-only", deviceLimit: 3, canEdit: false, canExport: true,
    canUseManagedGeneration: false, canUseByokGeneration: false,
  });
});

test("lifetime owners retain BYOK access", () => {
  const access = resolveAccess({ hasLifetime: true, creatorActive: false, trialActive: false });
  assert.equal(access.canEdit, true);
  assert.equal(access.canUseByokGeneration, true);
  assert.equal(access.canUseManagedGeneration, false);
});

test("cached entitlement requires a signature and unexpired validity", () => {
  const base = {
    accountId: "user-1", installationId: "install-1", mode: "lifetime" as const,
    checkedAt: "2026-01-01T00:00:00.000Z", validUntil: "2026-02-01T00:00:00.000Z",
    deviceLimit: 3, canEdit: true, canExport: true, canUseManagedGeneration: false,
    canUseByokGeneration: true, signature: "signature",
  };
  assert.equal(canUseCachedEntitlement(base, new Date("2026-01-15T00:00:00.000Z")), true);
  assert.equal(canUseCachedEntitlement(base, new Date("2026-02-02T00:00:00.000Z")), false);
  assert.equal(canUseCachedEntitlement({ ...base, signature: "" }, new Date("2026-01-15T00:00:00.000Z")), false);
});

test("lip sync catalog separates image and video input models", () => {
  const video = getCapability("heis-lipsync-video");
  const image = getCapability("heis-lipsync-image");
  assert.equal(video?.operation, "lip-sync");
  assert.equal(video?.providerModelId, "sync:lipsync-2@1");
  assert.equal(image?.operation, "lip-sync");
  assert.equal(image?.providerModelId, "creatify:aurora@fast");
});

test("audio catalog separates speech and music billing operations", () => {
  const speech = getCapability("heis-speech-standard");
  const music = getCapability("heis-music-standard");
  assert.equal(speech?.operation, "text-to-speech");
  assert.equal(speech?.providerModelId, "minimax:speech@2.8");
  assert.equal(music?.operation, "text-to-music");
  assert.equal(music?.providerModelId, "minimax:music@2.6");
});

test("marketing video catalog supports multimodal references", () => {
  const marketing = getCapability("heis-marketing-video");
  assert.equal(marketing?.operation, "reference-to-video");
  assert.equal(marketing?.providerModelId, "alibaba:wan@3.0");
  assert.equal(marketing?.maximumEstimatedCostUsd, 3);
});

test("motion control catalog uses Seedance reference video generation", () => {
  const motion = getCapability("heis-motion-control");
  assert.equal(motion?.operation, "motion-control");
  assert.equal(motion?.providerModelId, "bytedance:seedance@2.5");
  assert.equal(motion?.maximumEstimatedCostUsd, 9);
});

test("recast has an independently configurable Seedance capability", () => {
  const recast = getCapability("heis-recast");
  assert.equal(recast?.operation, "motion-control");
  assert.equal(recast?.providerModelId, "bytedance:seedance@2.5");
  assert.equal(recast?.parameters.find((parameter) => parameter.name === "duration")?.default, "auto");
});

test("motion graphics generation and remix use separate Seedance capabilities", () => {
  const generate = getCapability("heis-motion-graphics");
  const remix = getCapability("heis-motion-graphics-edit");
  assert.equal(generate?.operation, "text-to-video");
  assert.equal(generate?.providerModelId, "bytedance:seedance@2.5");
  assert.equal(generate?.maximumEstimatedCostUsd, 7);
  assert.equal(remix?.operation, "video-to-video");
  assert.equal(remix?.providerModelId, "bytedance:seedance@2.5");
  assert.equal(remix?.parameters.find((parameter) => parameter.name === "duration")?.default, "auto");
});
