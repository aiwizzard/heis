import { NextResponse } from "next/server";

export function apiError(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return NextResponse.json({ error: { code: "REQUEST_FAILED", message } }, { status: 500 });
}

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value || value.length > 200) throw new Response("A valid Idempotency-Key header is required.", { status: 400 });
  return value;
}
