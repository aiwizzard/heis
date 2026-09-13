import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { requireUser } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const { client, user } = await requireUser(request);
    const { plan } = await request.json();
    const config = plan === "lifetime" ? { price: env.stripeLifetimePriceId(), mode: "payment" as const } : plan === "creator" ? { price: env.stripeCreatorPriceId(), mode: "subscription" as const } : plan === "topup" ? { price: env.stripeTopupPriceId(), mode: "payment" as const } : null;
    if (!config) return NextResponse.json({ error: { code: "INVALID_PLAN", message: "Unknown billing plan." } }, { status: 400 });
    if (plan === "topup") {
      const creator = await client.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle();
      if (!creator.data || !["active", "trialing"].includes(creator.data.status)) {
        return NextResponse.json({ error: { code: "CREATOR_REQUIRED", message: "Top-up credits require an active Creator subscription." } }, { status: 403 });
      }
    }
    const stripe = new Stripe(env.stripeSecretKey());
    const origin = new URL(request.url).origin;
    const profile = await client.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
    const session = await stripe.checkout.sessions.create({
      mode: config.mode,
      ...(profile.data?.stripe_customer_id ? { customer: profile.data.stripe_customer_id } : { customer_email: user.email }),
      line_items: [{ price: config.price, quantity: 1 }],
      success_url: `${origin}/account?checkout=success`, cancel_url: `${origin}/account?checkout=cancelled`,
      automatic_tax: { enabled: true }, allow_promotion_codes: true,
      metadata: { user_id: user.id, plan },
      ...(config.mode === "subscription" ? { subscription_data: { metadata: { user_id: user.id, plan } } } : {}),
    }, { idempotencyKey });
    return NextResponse.json({ url: session.url });
  } catch (error) { return apiError(error); }
}
