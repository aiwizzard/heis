import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { reserveCredits, validateGenerationRequest } from "@heis/core";
import { env } from "@/lib/env";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { createAdminClient, requireUser } from "@/lib/supabase";

function taskType(operation: string, outputKind: string) {
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
    const [subscription, trial] = await Promise.all([
      client.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle(),
      client.from("trial_grants").select("expires_at").eq("user_id", user.id).maybeSingle(),
    ]);
    const creatorActive = ["active", "trialing"].includes(subscription.data?.status ?? "");
    const trialActive = Boolean(trial.data?.expires_at && new Date(trial.data.expires_at).getTime() > Date.now());
    if (!creatorActive && !trialActive) {
      return NextResponse.json({ error: { code: "MANAGED_ACCESS_REQUIRED", message: "Managed generation requires an active trial or Creator subscription." } }, { status: 403 });
    }
    const capability = validateGenerationRequest({
      ...body,
      billing: { ...body.billing, accountId: user.id, idempotencyKey },
    });

    const existing = await client.from("generation_jobs").select("*").eq("user_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing.data) return NextResponse.json(existing.data);

    const jobId = crypto.randomUUID();
    const providerJobId = crypto.randomUUID();
    const reservedCredits = reserveCredits(capability.maximumEstimatedCostUsd);
    const inserted = await client.from("generation_jobs").insert({
      id: jobId, user_id: user.id, provider: "runware", provider_job_id: providerJobId,
      operation: body.operation, model_id: body.modelId, status: "queued",
      reserved_credits: reservedCredits, request_payload: body.inputs, idempotency_key: idempotencyKey,
    }).select("*").single();
    if (inserted.error) throw inserted.error;

    const reservation = await client.rpc("reserve_generation_credits", { p_job_id: jobId, p_amount: reservedCredits, p_idempotency_key: idempotencyKey });
    if (reservation.error) {
      await admin.from("generation_jobs").update({ status: "failed", error_code: "INSUFFICIENT_CREDITS", error_message: reservation.error.message }).eq("id", jobId);
      return NextResponse.json({ error: { code: "INSUFFICIENT_CREDITS", message: "Not enough credits for this generation." } }, { status: 402 });
    }

    const webhookURL = `${env.publicApiUrl()}/v1/webhooks/runware?token=${encodeURIComponent(env.runwareWebhookToken())}`;
    const providerResponse = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.runwareApiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ ...body.inputs, taskType: taskType(capability.operation, capability.outputKind), taskUUID: providerJobId, model: capability.providerModelId, webhookURL, includeCost: true }]),
    });
    const providerBody = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok || providerBody.errors?.length) {
      await client.rpc("release_generation_credits", { p_job_id: jobId, p_reason: "provider_submission_failed" });
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
