import type { EntitlementSnapshot } from "./types";

export const DEVICE_LIMIT = 3;
export const OFFLINE_GRACE_DAYS = 30;

export function canUseCachedEntitlement(snapshot: EntitlementSnapshot, now = new Date()): boolean {
  const validUntil = new Date(snapshot.validUntil);
  return Number.isFinite(validUntil.getTime()) && validUntil >= now && Boolean(snapshot.signature);
}

export function resolveAccess(input: { plan?: import("./plans").PlanId } = {}): Omit<EntitlementSnapshot, "accountId" | "installationId" | "checkedAt" | "validUntil" | "signature"> {
  const plan = input.plan === "creator" || input.plan === "pro" ? input.plan : "free";
  return { mode: plan, deviceLimit: DEVICE_LIMIT, canEdit: true, canExport: true, canUseManagedGeneration: plan !== "free" };
}
