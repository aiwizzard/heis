import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { PLANS, priceForPlan } from "@/lib/plans";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { requireUser } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const { client, user } = await requireUser(request);
    const { plan } = await request.json();
    if (plan !== "creator" && plan !== "pro") return NextResponse.json({ error: { code: "INVALID_PLAN", message: "Choose Creator or Pro. Free access needs no checkout." } }, { status: 400 });
    const existing = await client.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data && !["canceled", "incomplete_expired"].includes(existing.data.status)) return NextResponse.json({ error: { code: "MANAGE_SUBSCRIPTION", message: "Manage your existing subscription through the billing portal." } }, { status: 409 });
    const stripe = new Stripe(env.stripeSecretKey());
    const priceId = priceForPlan(plan);
    const price = await stripe.prices.retrieve(priceId);
    const selected = PLANS[plan as "creator" | "pro"];
    if (!price.active || price.currency !== "usd" || price.unit_amount !== selected.monthlyUsd * 100 || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) throw new Error("The subscription price is not configured correctly. Please contact support.");
    const profile = await client.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    if (profile.error) throw profile.error;
    const origin = env.publicApiUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(profile.data.stripe_customer_id ? { customer: profile.data.stripe_customer_id } : { customer_email: user.email }),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/account?checkout=success`, cancel_url: `${origin}/account?checkout=cancelled`,
      automatic_tax: { enabled: true },
      metadata: { user_id: user.id, plan }, subscription_data: { metadata: { user_id: user.id, plan } },
    }, { idempotencyKey: `${user.id}:${idempotencyKey}` });
    return NextResponse.json({ url: session.url });
  } catch (error) { return apiError(error); }
}
