import assert from "node:assert/strict";
import test from "node:test";
import { canUseCachedEntitlement, creditsForProviderCost, getCapability, planCreditDebits, resolveAccess, subscriptionPlan, PLANS, validateGenerationRequest } from "../packages/core/src/index";

test("provider costs are converted to credits with a 2x markup", () => {
  assert.equal(creditsForProviderCost(0), 0);
  assert.equal(creditsForProviderCost(0.004), 1);
  assert.equal(creditsForProviderCost(0.0251), 6);
  assert.equal(creditsForProviderCost(1), 200);
});

test("monthly balances debit the earliest expiry first", () => {
  assert.deepEqual(planCreditDebits([
    {kind:"monthly",available:20,expiresAt:"2027-02-01"},
    {kind:"monthly",available:5,expiresAt:"2027-01-01"},
  ],10,new Date("2026-01-01")),[{kind:"monthly",amount:5},{kind:"monthly",amount:5}]);
});

test("expired credit wallets are not consumed", () => {
  assert.throws(() => planCreditDebits([
    { kind: "monthly", available: 100, expiresAt: "2025-01-01T00:00:00.000Z" },
  ], 1, new Date("2026-01-01T00:00:00.000Z")), /INSUFFICIENT_CREDITS/);
});

test("free and cancelled subscribers keep editing and export without generation", () => {
  assert.deepEqual(resolveAccess(), {mode:"free",deviceLimit:3,canEdit:true,canExport:true,canUseManagedGeneration:false});
  assert.equal(subscriptionPlan({plan_id:"pro",status:"canceled",current_period_end:"2099-01-01"}),"free");
});
test("only active, recognized and unexpired paid subscriptions enable generation", () => {
  for(const status of ["trialing","past_due","unpaid","incomplete","canceled"]) assert.equal(subscriptionPlan({plan_id:"creator",status,current_period_end:"2099-01-01"}),"free");
  for(const date of ["invalid","2020-01-01"]) assert.equal(subscriptionPlan({plan_id:"creator",status:"active",current_period_end:date}),"free");
  assert.equal(subscriptionPlan({plan_id:"lifetime",status:"active",current_period_end:"2099-01-01"}),"free");
  assert.equal(subscriptionPlan({plan_id:"pro",status:"active",current_period_end:"2099-01-01"}),"pro");
  assert.equal(resolveAccess({plan:"pro"}).canUseManagedGeneration,true);
  assert.equal(PLANS.free.monthlyCredits,0);
});

test("cached entitlement requires a signature and unexpired validity", () => {
  const base = {
    accountId: "user-1", installationId: "install-1", mode: "free" as const,
    checkedAt: "2026-01-01T00:00:00.000Z", validUntil: "2026-02-01T00:00:00.000Z",
    deviceLimit: 3, canEdit: true, canExport: true, canUseManagedGeneration: false,
    signature: "signature",
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

test("image utility capabilities use verified Runware models", () => {
  const upscale = getCapability("heis-image-upscale");
  const removeBackground = getCapability("heis-remove-background");
  const expand = getCapability("heis-expand-image");
  assert.equal(upscale?.operation, "upscale");
  assert.equal(upscale?.providerModelId, "topazlabs:wonder@3.5");
  assert.equal(removeBackground?.operation, "remove-background");
  assert.equal(removeBackground?.providerModelId, "runware:109@1");
  assert.equal(expand?.operation, "expand-image");
  assert.equal(expand?.providerModelId, "bfl:flux@outpainting");
});

test("generation validation enforces catalog requirements and bounds", () => {
  const base = {
    operation: "text-to-image" as const,
    modelId: "heis-image-standard",
    billing: { mode: "managed" as const, accountId: "local", idempotencyKey: "request-1" },
  };
  assert.equal(validateGenerationRequest({ ...base, inputs: { positivePrompt: "A lake", width: 1024, height: 1024 } }).id, "heis-image-standard");
  assert.throws(() => validateGenerationRequest({ ...base, inputs: { width: 1024, height: 1024 } }), /MISSING_REQUIRED_PARAMETER_POSITIVEPROMPT/);
  assert.throws(() => validateGenerationRequest({ ...base, inputs: { positivePrompt: "A lake", width: 128, height: 1024 } }), /PARAMETER_BELOW_MINIMUM_WIDTH/);
  assert.throws(() => validateGenerationRequest({ ...base, operation: "text-to-video", inputs: { positivePrompt: "A lake", width: 1024, height: 1024 } }), /MODEL_OPERATION_MISMATCH/);
});

test("generation validation rejects invalid enum values", () => {
  assert.throws(() => validateGenerationRequest({
    operation: "video-to-video",
    modelId: "heis-motion-graphics-edit",
    inputs: { positivePrompt: "Change blue to red", inputs: { video: "https://example.com/video.mp4" }, duration: "ten", resolution: "720p", settings: { operation: "edit" } },
    billing: { mode: "managed", accountId: "user-1", idempotencyKey: "request-2" },
  }), /INVALID_PARAMETER_OPTION_DURATION/);
});
