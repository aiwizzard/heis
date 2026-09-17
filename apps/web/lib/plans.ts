import { subscriptionPlan, PLANS } from "@heis/core";
import { env } from "./env";
export { subscriptionPlan, PLANS };
export function planForPrice(priceId: string): "creator" | "pro" | null {
  if (priceId === process.env.STRIPE_CREATOR_PRICE_ID) return "creator";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  return null;
}
export function priceForPlan(plan: "creator" | "pro") { return plan === "creator" ? env.stripeCreatorPriceId() : env.stripeProPriceId(); }
export async function accountPlan(client: any, userId: string) {
  const result = await client.from("subscriptions").select("plan_id,status,current_period_end").eq("user_id", userId).maybeSingle();
  if (result.error) throw result.error;
  return subscriptionPlan(result.data);
}
