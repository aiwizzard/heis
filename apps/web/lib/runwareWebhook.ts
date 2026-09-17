import { creditsForProviderCost } from "@heis/core";
import { copyRemoteAsset } from "./r2";
import { createAdminClient } from "./supabase";

function output(data: Record<string, any>): { url?: string; kind: string } {
  if (data.imageURL) return { url: data.imageURL, kind: "image" };
  if (data.videoURL) return { url: data.videoURL, kind: "video" };
  if (data.audioURL) return { url: data.audioURL, kind: "audio" };
  return { kind: "other" };
}

export async function processRunwareWebhook(data: Record<string, any>) {
  const eventId = String(data.taskUUID ?? "");
  if (!eventId) throw new Error("Missing taskUUID");
  const admin = createAdminClient();
  const claim = await admin.rpc("claim_webhook", { p_provider: "runware", p_event_id: eventId });
  if (claim.error) throw claim.error;
  if (!claim.data) return { duplicate: true };

  try {
    const jobResult = await admin.from("generation_jobs").select("*").eq("provider_job_id", eventId).single();
    if (jobResult.error) throw jobResult.error;
    const job = jobResult.data;
    if (job.status === "cancelled") {
      await admin.from("processed_webhooks").update({status:"processed",processed_at:new Date().toISOString()}).eq("provider","runware").eq("event_id",eventId);
      return {cancelled:true};
    }
    if (data.error || data.errors?.length) {
      await admin.from("upload_assets").delete().eq("user_id",job.user_id).eq("object_key",`users/${job.user_id}/jobs/${job.id}/reservation`);
      await admin.rpc("release_generation_credits", { p_job_id: job.id, p_reason: "provider_failed" });
      await admin.from("generation_jobs").update({ status: "failed", error_code: "PROVIDER_FAILED", error_message: data.error?.message ?? data.errors?.[0]?.message ?? "Generation failed." }).eq("id", job.id);
    } else {
      const providerCost = Number(data.cost ?? 0);
      if (!Number.isFinite(providerCost) || providerCost < 0) throw new Error("Runware returned an invalid cost.");
      const settledCredits = creditsForProviderCost(providerCost);
      const asset = output(data);
      if (!asset.url) throw new Error("Provider returned no output");
      if (asset.url) {
        const existingAsset = await admin.from("media_assets").select("id").eq("job_id", job.id).eq("source_url", asset.url).maybeSingle();
        if (!existingAsset.data) {
          const copied = await copyRemoteAsset({ userId: job.user_id, jobId: job.id, sourceUrl: asset.url, kind: asset.kind });
          const stored = await admin.rpc("finalize_cloud_output", { p_user_id: job.user_id, p_job_id: job.id, p_kind: asset.kind, p_object_key: copied.objectKey, p_source_url: asset.url });
          if (stored.error) throw stored.error;
        }
      }
      const settlement = await admin.rpc("settle_generation_credits", { p_job_id: job.id, p_final_credits: settledCredits, p_provider_cost: providerCost });
      if (settlement.error) throw settlement.error;
      await admin.from("generation_jobs").update({ status: "succeeded" }).eq("id", job.id);
    }
    await admin.from("processed_webhooks").update({ status: "processed", processed_at: new Date().toISOString() }).eq("provider", "runware").eq("event_id", eventId);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await admin.from("processed_webhooks").update({ status: "failed", last_error: message }).eq("provider", "runware").eq("event_id", eventId);
    throw error;
  }
}
