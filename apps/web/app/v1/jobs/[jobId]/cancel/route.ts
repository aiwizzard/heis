import { NextResponse } from "next/server";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { createAdminClient, requireUser } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    requireIdempotencyKey(request);
    const { client, user } = await requireUser(request);
    const { jobId } = await params;
    const job = await client.from("generation_jobs").select("status").eq("id", jobId).single();
    if (job.error) return NextResponse.json({ error: { code: "JOB_NOT_FOUND", message: "Generation job not found." } }, { status: 404 });
    if (!["queued", "submitted"].includes(job.data.status)) return NextResponse.json({ error: { code: "NOT_CANCELLABLE", message: "This job can no longer be cancelled." } }, { status: 409 });
    const cancelled = await client.rpc("cancel_generation_job", { p_job_id: jobId });
    if (cancelled.error) throw cancelled.error;
    await createAdminClient().from("upload_assets").delete().eq("user_id",user.id).eq("object_key",`users/${user.id}/jobs/${jobId}/reservation`);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
