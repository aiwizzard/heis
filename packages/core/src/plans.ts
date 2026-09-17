export type PlanId = "free" | "creator" | "pro";
export const PLANS = {
  free: { id: "free", name: "Free", monthlyUsd: 0, monthlyCredits: 0, storageBytes: 1024 ** 3 },
  creator: { id: "creator", name: "Creator", monthlyUsd: 24, monthlyCredits: 2000, storageBytes: 25 * 1024 ** 3 },
  pro: { id: "pro", name: "Pro", monthlyUsd: 59, monthlyCredits: 6000, storageBytes: 100 * 1024 ** 3 },
} as const;
export function subscriptionPlan(subscription: { plan_id?: string; status?: string; current_period_end?: string | null } | null | undefined, now = Date.now()): PlanId {
  if (!subscription || subscription.status !== "active" || !subscription.current_period_end || !(new Date(subscription.current_period_end).getTime() > now)) return "free";
  return subscription.plan_id === "creator" || subscription.plan_id === "pro" ? subscription.plan_id : "free";
}
