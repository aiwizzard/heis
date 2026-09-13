import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { apiError, requireIdempotencyKey } from "@/lib/http";
import { requireUser } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const { client, user } = await requireUser(request);
    const profile = await client.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    if (!profile.data?.stripe_customer_id) return NextResponse.json({ error: { code: "NO_BILLING_ACCOUNT", message: "No Stripe customer exists for this account." } }, { status: 404 });
    const stripe = new Stripe(env.stripeSecretKey());
    const session = await stripe.billingPortal.sessions.create({ customer: profile.data.stripe_customer_id, return_url: `${new URL(request.url).origin}/account` }, { idempotencyKey });
    return NextResponse.json({ url: session.url });
  } catch (error) { return apiError(error); }
}
