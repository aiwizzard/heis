import crypto from "node:crypto";
import { DEVICE_LIMIT, OFFLINE_GRACE_DAYS, resolveAccess } from "@heis/core";
import { env } from "./env";

export function signEntitlement(input: { accountId: string; installationId: string; plan: "free" | "creator" | "pro" }) {
  const now = new Date();
  const validUntil = new Date(now.getTime() + OFFLINE_GRACE_DAYS * 86_400_000);
  const payload = {
    accountId: input.accountId,
    installationId: input.installationId,
    ...resolveAccess(input),
    deviceLimit: DEVICE_LIMIT,
    checkedAt: now.toISOString(),
    validUntil: validUntil.toISOString(),
  };
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const signature = crypto.sign(null, Buffer.from(canonical), env.entitlementPrivateKey()).toString("base64");
  return { ...payload, signature };
}
