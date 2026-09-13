import { NextResponse } from "next/server";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { createUploadUrl } from "@/lib/r2";
import { requireUser } from "@/lib/supabase";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "audio/mpeg", "audio/wav"]);
export async function POST(request: Request) {
  try {
    requireIdempotencyKey(request);
    const { user } = await requireUser(request);
    const body = await request.json();
    if (!ALLOWED_TYPES.has(body.contentType) || typeof body.fileName !== "string") return NextResponse.json({ error: { code: "INVALID_UPLOAD", message: "Unsupported upload type." } }, { status: 400 });
    return NextResponse.json(await createUploadUrl(user.id, body.fileName, body.contentType));
  } catch (error) { return apiError(error); }
}
