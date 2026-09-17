import { accountPlan } from "@/lib/plans";
import { NextResponse } from "next/server";
import { signEntitlement } from "@/lib/entitlements";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { requireUser } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    requireIdempotencyKey(request);
    const { client, user } = await requireUser(request);
    const body = await request.json();
    if (!body.installationId || typeof body.installationId !== "string") return NextResponse.json({ error: { code: "INVALID_INSTALLATION", message: "installationId is required." } }, { status: 400 });
    const activated = await client.rpc("activate_device", { p_installation_id: body.installationId, p_device_name: String(body.deviceName ?? "Mac").slice(0, 120) });
    if (activated.error) return NextResponse.json({ error: { code: "DEVICE_LIMIT", message: activated.error.message } }, { status: 409 });
    const plan = await accountPlan(client, user.id);
    return NextResponse.json(signEntitlement({ accountId: user.id, installationId: body.installationId, plan }));
  } catch (error) { return apiError(error); }
}
