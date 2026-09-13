import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { requireUser } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { client, user } = await requireUser(request);
    const [subscription, entitlements, wallets, devices] = await Promise.all([
      client.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      client.from("entitlements").select("*").eq("user_id", user.id),
      client.from("credit_wallets").select("kind, balance, expires_at").eq("user_id", user.id).gt("balance", 0),
      client.from("device_activations").select("installation_id, device_name, activated_at, last_seen_at").eq("user_id", user.id).is("deactivated_at", null),
    ]);
    return NextResponse.json({ user: { id: user.id, email: user.email }, subscription: subscription.data, entitlements: entitlements.data ?? [], creditWallets: wallets.data ?? [], devices: devices.data ?? [] });
  } catch (error) { return apiError(error); }
}
