import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { planForPrice } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase";
function unix(value: number) { if (!Number.isFinite(value)) throw new Error("Missing billing period"); return new Date(value * 1000).toISOString(); }
function checked(result: any) { if (result.error) throw result.error; return result.data; }

export async function POST(request: Request) {
  const stripe = new Stripe(env.stripeSecretKey());
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature", { status: 400 });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, env.stripeWebhookSecret()); }
  catch { return new Response("Invalid Stripe signature", { status: 400 }); }
  const admin = createAdminClient();
  try {
    if (!checked(await admin.rpc("claim_webhook", { p_provider: "stripe", p_event_id: event.id }))) return NextResponse.json({ duplicate: true });
    const object: any = event.data.object;
    const syncSubscription = async (id: string) => {
      // Fetch current Stripe state so a delayed event cannot restore a cancelled plan.
      const remote = await stripe.subscriptions.retrieve(id);
      const item = remote.items.data[0];
      const plan = item && planForPrice(item.price.id);
      if (!plan || remote.items.data.length !== 1 || item.quantity !== 1) throw new Error("Unsupported subscription price");
      const userId = remote.metadata.user_id;
      if (!userId) throw new Error("Subscription owner missing");
      checked(await admin.from("subscriptions").upsert({ user_id: userId, plan_id: plan, stripe_subscription_id: remote.id, stripe_customer_id: String(remote.customer), status: remote.status, current_period_start: unix(item.current_period_start), current_period_end: unix(item.current_period_end), cancel_at_period_end: remote.cancel_at_period_end }, { onConflict: "user_id" }));
      checked(await admin.from("profiles").update({ stripe_customer_id: String(remote.customer) }).eq("id", userId));
      return { userId, plan, remote };
    };
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) await syncSubscription(object.id);
    if (event.type === "checkout.session.completed" && object.mode === "subscription" && typeof object.subscription === "string") await syncSubscription(object.subscription);
    if (event.type === "invoice.paid") {
      const id = object.parent?.subscription_details?.subscription ?? object.subscription;
      if (typeof id === "string" && ["subscription_create", "subscription_cycle"].includes(object.billing_reason)) {
        const owner = await syncSubscription(id);
        const invoice = await stripe.invoices.retrieve(object.id, { expand: ["lines.data"] });
        const lines: any[] = invoice.lines.data;
        const line = lines.find((line) => planForPrice(line.pricing?.price_details?.price ?? line.price?.id));
        const plan = line && planForPrice(line.pricing?.price_details?.price ?? line.price?.id);
        if (!line || !plan || invoice.status !== "paid") throw new Error("Invalid paid subscription invoice");
        checked(await admin.rpc("grant_subscription_credits", { p_user_id: owner.userId, p_plan: plan, p_invoice_id: invoice.id, p_period_start: unix(line.period.start), p_period_end: unix(line.period.end) }));
      }
    }
    checked(await admin.from("processed_webhooks").update({ status: "processed", processed_at: new Date().toISOString() }).eq("provider", "stripe").eq("event_id", event.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    await admin.from("processed_webhooks").update({ status: "failed", last_error: error instanceof Error ? error.message : "Processing failed" }).eq("provider", "stripe").eq("event_id", event.id);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
