import { NextResponse } from "next/server";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { createUploadUrl } from "@/lib/r2";
import { requireUser } from "@/lib/supabase";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "audio/mpeg", "audio/wav"]);
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export async function POST(request: Request) {
  try {
    const requestId = requireIdempotencyKey(request);
    const { user } = await requireUser(request);
    const body = await request.json();
    if (!ALLOWED_TYPES.has(body.contentType) || typeof body.fileName !== "string" || !Number.isInteger(body.sizeBytes) || body.sizeBytes <= 0 || body.sizeBytes > MAX_UPLOAD_BYTES) return NextResponse.json({ error: { code: "INVALID_UPLOAD", message: "Unsupported upload type or size." } }, { status: 400 });
    const signed = await createUploadUrl(user.id, body.fileName, body.contentType, body.sizeBytes, requestId);
    return NextResponse.json(signed);
  } catch (error) { if (error instanceof Error && error.message.includes("STORAGE_LIMIT_REACHED")) return NextResponse.json({ error: { code: "STORAGE_LIMIT_REACHED", message: "Your cloud storage is full. Delete files or change your plan." } }, { status: 409 }); return apiError(error); }
}
