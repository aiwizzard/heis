import { accountPlan, PLANS } from "@/lib/plans";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { requireUser } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const [subscription, wallets, devices, uploads, media] = await Promise.all([
      client.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      client.from("credit_wallets").select("kind, balance, expires_at").eq("user_id", user.id).gt("balance", 0).eq("kind", "monthly").gt("expires_at", new Date().toISOString()),
      client.from("device_activations").select("installation_id, device_name, activated_at, last_seen_at").eq("user_id", user.id).is("deactivated_at", null),
      client.from("upload_assets").select("size_bytes").eq("user_id", user.id),
      client.from("media_assets").select("size_bytes").eq("user_id", user.id),
    ]);
    for (const result of [subscription,wallets,devices,uploads,media]) if (result.error) throw result.error;
    const plan = await accountPlan(client,user.id);
    const usedBytes = [...(uploads.data ?? []),...(media.data ?? [])].reduce((sum,item)=>sum+Number(item.size_bytes ?? 0),0);
    return NextResponse.json({ user: { id: user.id, email: user.email }, subscription: subscription.data, plan, plans: PLANS, storage: { usedBytes, limitBytes: PLANS[plan].storageBytes }, creditWallets: wallets.data ?? [], devices: devices.data ?? [] });
  } catch (error) { return apiError(error); }
}
