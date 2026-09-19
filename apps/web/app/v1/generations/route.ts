import { accountPlan } from "@/lib/plans";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { reserveCredits, validateGenerationRequest, highlightProviderInput, type HighlightRequest } from "@heis/core";
import { env } from "@/lib/env";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { createAdminClient, requireUser } from "@/lib/supabase";

function taskType(operation: string, outputKind: string) {
  if (operation === "rank-highlights" || operation === "generate-text") return "textInference";
  if (operation === "upscale") return "upscale";
  if (operation === "remove-background") return "removeBackground";
  if (outputKind === "image") return "imageInference";
  if (outputKind === "video") return "videoInference";
  return "audioInference";
}

export async function POST(request: Request) {
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const { client, user } = await requireUser(request);
    const admin = createAdminClient();
    const body = await request.json();
    if (await accountPlan(client, user.id) === "free") {
      return NextResponse.json({ error: { code: "SUBSCRIPTION_REQUIRED", message: "Subscribe to Creator or Pro to use Heis generation credits." } }, { status: 403 });
    }
    let capability;
    try {
      capability = validateGenerationRequest({
        ...body,
        billing: { ...body.billing, accountId: user.id, idempotencyKey },
      });
    } catch {
      return NextResponse.json({ error: { code: "INVALID_GENERATION_REQUEST", message: "The generation request does not match the selected capability." } }, { status: 400 });
    }

    const existing = await client.from("generation_jobs").select("*").eq("user_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing.data) return NextResponse.json(existing.data);

    // Validate provider configuration before reserving credits or storage.
    const webhookURL = `${env.publicApiUrl()}/v1/webhooks/runware?token=${encodeURIComponent(env.runwareWebhookToken())}`;
    const providerKey = env.runwareApiKey();
    const jobId = crypto.randomUUID();
    const providerJobId = crypto.randomUUID();
    const reservedCredits = reserveCredits(capability.maximumEstimatedCostUsd);
    const storageKey = `users/${user.id}/jobs/${jobId}/reservation`;
    const storage = await admin.rpc("reserve_cloud_storage", { p_user_id:user.id, p_object_key:storageKey, p_mime_type:"application/octet-stream", p_size_bytes:500*1024*1024 });
    if (storage.error) return NextResponse.json({error:{code:"STORAGE_LIMIT_REACHED",message:"Free at least 500 MB of cloud storage before starting a generation."}},{status:409});
    const releaseStorage = () => admin.from("upload_assets").delete().eq("user_id",user.id).eq("object_key",storageKey);
    const inserted = await client.from("generation_jobs").insert({
      id: jobId, user_id: user.id, provider: "runware", provider_job_id: providerJobId,
      operation: body.operation, model_id: body.modelId, status: "queued",
      reserved_credits: reservedCredits, request_payload: body.inputs, idempotency_key: idempotencyKey,
    }).select("*").single();
    if (inserted.error) { await releaseStorage(); throw inserted.error; }

    const reservation = await client.rpc("reserve_generation_credits", { p_job_id: jobId, p_amount: reservedCredits, p_idempotency_key: idempotencyKey });
    if (reservation.error) {
      await releaseStorage();
      await admin.from("generation_jobs").update({ status: "failed", error_code: "INSUFFICIENT_CREDITS", error_message: reservation.error.message }).eq("id", jobId);
      return NextResponse.json({ error: { code: "INSUFFICIENT_CREDITS", message: "Not enough credits for this generation." } }, { status: 402 });
    }

    const providerResponse = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: { Authorization: `Bearer ${providerKey}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ ...(capability.operation === "rank-highlights" ? { ...highlightProviderInput(body.inputs as HighlightRequest), deliveryMethod: "async" } : capability.operation === "generate-text" ? {messages:[{role:"user",content:body.inputs.prompt}],settings:{maxTokens:4096},deliveryMethod:"async"} : body.inputs), taskType: taskType(capability.operation, capability.outputKind), taskUUID: providerJobId, model: capability.providerModelId, webhookURL, includeCost: true }]),
    });
    const providerBody = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok || providerBody.errors?.length) {
      await releaseStorage();
      await admin.rpc("release_generation_credits", { p_job_id: jobId, p_reason: "provider_submission_failed" });
      await admin.from("generation_jobs").update({ status: "failed", error_code: "PROVIDER_SUBMISSION_FAILED", error_message: providerBody.errors?.[0]?.message ?? "Runware rejected the job." }).eq("id", jobId);
      return NextResponse.json({ error: { code: "PROVIDER_SUBMISSION_FAILED", message: "The generation provider rejected this job." } }, { status: 502 });
    }
    const updated = await admin.from("generation_jobs").update({ status: "submitted" }).eq("id", jobId).select("*").single();
    if (updated.error) throw updated.error;
    return NextResponse.json(updated.data, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
