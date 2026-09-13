import { schedules, task } from "@trigger.dev/sdk";
import { processRunwareWebhook } from "../../lib/runwareWebhook";
import { deleteManagedAsset } from "../../lib/r2";
import { createAdminClient } from "../../lib/supabase";

export const processRunwareOutput = task({
  id: "process-runware-output",
  maxDuration: 1800,
  retry: { maxAttempts: 5, minTimeoutInMs: 2_000, maxTimeoutInMs: 60_000, factor: 2 },
  run: async (payload: { event: Record<string, any> }) => processRunwareWebhook(payload.event),
});

export const purgeExpiredManagedMedia = schedules.task({
  id: "purge-expired-managed-media",
  cron: "17 3 * * *",
  maxDuration: 1800,
  run: async () => {
    const admin = createAdminClient();
    const expired = await admin.from("media_assets").select("id, object_key").lte("delete_after", new Date().toISOString()).limit(500);
    if (expired.error) throw expired.error;
    let deleted = 0;
    for (const asset of expired.data ?? []) {
      await deleteManagedAsset(asset.object_key);
      const removed = await admin.from("media_assets").delete().eq("id", asset.id);
      if (removed.error) throw removed.error;
      deleted += 1;
    }
    const uploads = await admin.from("upload_assets").select("id, object_key").lte("delete_after", new Date().toISOString()).limit(500);
    if (uploads.error) throw uploads.error;
    for (const asset of uploads.data ?? []) {
      await deleteManagedAsset(asset.object_key);
      const removed = await admin.from("upload_assets").delete().eq("id", asset.id);
      if (removed.error) throw removed.error;
      deleted += 1;
    }
    return { deleted };
  },
});
