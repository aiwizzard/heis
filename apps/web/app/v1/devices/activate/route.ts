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
    const [entitlements, subscription, trial] = await Promise.all([
      client.from("entitlements").select("kind, active").eq("user_id", user.id),
      client.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle(),
      client.from("trial_grants").select("expires_at").eq("user_id", user.id).maybeSingle(),
    ]);
    const hasLifetime = entitlements.data?.some((item) => item.kind === "lifetime" && item.active) ?? false;
    const creatorActive = ["active", "trialing"].includes(subscription.data?.status ?? "");
    const trialActive = Boolean(trial.data?.expires_at && new Date(trial.data.expires_at) > new Date());
    return NextResponse.json(signEntitlement({ accountId: user.id, installationId: body.installationId, hasLifetime, creatorActive, trialActive }));
  } catch (error) { return apiError(error); }
}
