import { NextResponse } from "next/server";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { requireUser } from "@/lib/supabase";

export async function DELETE(request: Request, { params }: { params: Promise<{ installationId: string }> }) {
  try {
    requireIdempotencyKey(request);
    const { client } = await requireUser(request);
    const { installationId } = await params;
    const result = await client.rpc("deactivate_device", { p_installation_id: installationId });
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
