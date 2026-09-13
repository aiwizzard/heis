import type { EntitlementSnapshot } from "./types";

export const DEVICE_LIMIT = 3;
export const OFFLINE_GRACE_DAYS = 30;

export function canUseCachedEntitlement(snapshot: EntitlementSnapshot, now = new Date()): boolean {
  const validUntil = new Date(snapshot.validUntil);
  return Number.isFinite(validUntil.getTime()) && validUntil >= now && Boolean(snapshot.signature);
}

export function resolveAccess(input: {
  hasLifetime: boolean;
  creatorActive: boolean;
  trialActive: boolean;
}): Omit<EntitlementSnapshot, "accountId" | "installationId" | "checkedAt" | "validUntil" | "signature"> {
  const { hasLifetime, creatorActive, trialActive } = input;
  if (creatorActive) return { mode: "creator", deviceLimit: DEVICE_LIMIT, canEdit: true, canExport: true, canUseManagedGeneration: true, canUseByokGeneration: true };
  if (hasLifetime) return { mode: "lifetime", deviceLimit: DEVICE_LIMIT, canEdit: true, canExport: true, canUseManagedGeneration: false, canUseByokGeneration: true };
  if (trialActive) return { mode: "trial", deviceLimit: DEVICE_LIMIT, canEdit: true, canExport: true, canUseManagedGeneration: true, canUseByokGeneration: false };
  return { mode: "read-only", deviceLimit: DEVICE_LIMIT, canEdit: false, canExport: true, canUseManagedGeneration: false, canUseByokGeneration: false };
}
