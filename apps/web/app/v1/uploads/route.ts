import { NextResponse } from "next/server";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { createUploadUrl } from "@/lib/r2";
import { createAdminClient, requireUser } from "@/lib/supabase";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "audio/mpeg", "audio/wav"]);
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export async function POST(request: Request) {
  try {
    requireIdempotencyKey(request);
    const { user } = await requireUser(request);
    const body = await request.json();
    if (!ALLOWED_TYPES.has(body.contentType) || typeof body.fileName !== "string" || !Number.isInteger(body.sizeBytes) || body.sizeBytes <= 0 || body.sizeBytes > MAX_UPLOAD_BYTES) return NextResponse.json({ error: { code: "INVALID_UPLOAD", message: "Unsupported upload type or size." } }, { status: 400 });
    const signed = await createUploadUrl(user.id, body.fileName, body.contentType);
    const admin = createAdminClient();
    const tracked = await admin.from("upload_assets").insert({ user_id: user.id, object_key: signed.objectKey, mime_type: body.contentType, size_bytes: body.sizeBytes });
    if (tracked.error) throw tracked.error;
    return NextResponse.json(signed);
  } catch (error) { return apiError(error); }
}
