import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { createDownloadUrl } from "@/lib/r2";
import { requireUser } from "@/lib/supabase";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { client } = await requireUser(request);
    const { jobId } = await params;
    const result = await client.from("generation_jobs").select("*, media_assets(*)").eq("id", jobId).single();
    if (result.error) return NextResponse.json({ error: { code: "JOB_NOT_FOUND", message: "Generation job not found." } }, { status: 404 });
    const mediaAssets = await Promise.all((result.data.media_assets ?? []).map(async (asset: any) => ({
      id: asset.id,
      kind: asset.kind,
      url: await createDownloadUrl(asset.object_key),
      mimeType: asset.mime_type,
      sizeBytes: asset.size_bytes,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.duration_seconds,
      expiresAt: asset.delete_after,
    })));
    return NextResponse.json({ ...result.data, media_assets: undefined, outputs: mediaAssets });
  } catch (error) { return apiError(error); }
}
