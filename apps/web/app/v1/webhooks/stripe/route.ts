import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase";

function unix(value?: number | null) { return value ? new Date(value * 1000).toISOString() : null; }

async function subscriptionOwner(admin: ReturnType<typeof createAdminClient>, stripe: Stripe, subscriptionId: string) {
  const stored = await admin.from("subscriptions").select("user_id, current_period_end").eq("stripe_subscription_id", subscriptionId).maybeSingle();
  if (stored.data) return stored.data;
  const remote: any = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = remote.metadata?.user_id;
  if (!userId) return null;
  await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: remote.id,
    stripe_customer_id: String(remote.customer),
    status: remote.status,
    current_period_start: unix(remote.current_period_start),
    current_period_end: unix(remote.current_period_end),
    cancel_at_period_end: Boolean(remote.cancel_at_period_end),
  }, { onConflict: "user_id" });
  return { user_id: userId, current_period_end: unix(remote.current_period_end) };
}

export async function POST(request: Request) {
  const stripe = new Stripe(env.stripeSecretKey());
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature", { status: 400 });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, env.stripeWebhookSecret()); }
  catch { return new Response("Invalid Stripe signature", { status: 400 }); }
  const admin = createAdminClient();
  const claim = await admin.rpc("claim_webhook", { p_provider: "stripe", p_event_id: event.id });
  if (claim.error) return NextResponse.json({ error: "Could not claim webhook" }, { status: 500 });
  if (!claim.data) return NextResponse.json({ duplicate: true });
  try {
    const object: any = event.data.object;
    if (event.type === "checkout.session.completed") {
      const userId = object.metadata?.user_id; const plan = object.metadata?.plan;
      if (userId && object.customer) await admin.from("profiles").update({ stripe_customer_id: String(object.customer) }).eq("id", userId);
      if (userId && plan === "lifetime") await admin.from("entitlements").upsert({ user_id: userId, kind: "lifetime", active: true, source_id: object.id }, { onConflict: "user_id,kind" });
      if (userId && plan === "topup") {
        const wallet = await admin.from("credit_wallets").upsert({ user_id: userId, kind: "purchased", source_id: object.id, balance: 1000, granted_credits: 1000 }, { onConflict: "user_id,kind,source_id" }).select("id").single();
        if (wallet.data) await admin.from("credit_ledger").upsert({ user_id: userId, wallet_id: wallet.data.id, kind: "grant", amount: 1000, idempotency_key: `stripe:${object.id}` }, { onConflict: "user_id,idempotency_key,wallet_id,kind" });
      }
    }
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const userId = object.metadata?.user_id;
      if (userId) {
        const active = ["active", "trialing"].includes(object.status);
        await admin.from("subscriptions").upsert({ user_id: userId, stripe_subscription_id: object.id, stripe_customer_id: String(object.customer), status: object.status, current_period_start: unix(object.current_period_start), current_period_end: unix(object.current_period_end), cancel_at_period_end: Boolean(object.cancel_at_period_end) }, { onConflict: "user_id" });
        await admin.from("entitlements").upsert({ user_id: userId, kind: "creator", active, source_id: object.id, ends_at: unix(object.current_period_end) }, { onConflict: "user_id,kind" });
      }
    }
    if (event.type === "invoice.paid") {
      const subscriptionId = typeof object.parent?.subscription_details?.subscription === "string" ? object.parent.subscription_details.subscription : typeof object.subscription === "string" ? object.subscription : null;
      if (subscriptionId) {
        const subscription = await subscriptionOwner(admin, stripe, subscriptionId);
        if (subscription) {
          const wallet = await admin.from("credit_wallets").upsert({ user_id: subscription.user_id, kind: "monthly", source_id: object.id, balance: 2000, granted_credits: 2000, expires_at: subscription.current_period_end }, { onConflict: "user_id,kind,source_id" }).select("id").single();
          if (wallet.data) await admin.from("credit_ledger").upsert({ user_id: subscription.user_id, wallet_id: wallet.data.id, kind: "grant", amount: 2000, idempotency_key: `stripe:${object.id}` }, { onConflict: "user_id,idempotency_key,wallet_id,kind" });
        }
      }
    }
    await admin.from("processed_webhooks").update({ status: "processed", processed_at: new Date().toISOString() }).eq("provider", "stripe").eq("event_id", event.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await admin.from("processed_webhooks").update({ status: "failed", last_error: message }).eq("provider", "stripe").eq("event_id", event.id);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
