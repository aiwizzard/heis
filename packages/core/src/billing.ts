import type { CreditWalletKind } from "./types";

export const CREDITS_PER_CUSTOMER_USD = 100;
export const PROVIDER_COST_MARKUP = 2;
export const CREDITS_PER_PROVIDER_USD = CREDITS_PER_CUSTOMER_USD * PROVIDER_COST_MARKUP;

export interface CreditWalletBalance {
  kind: CreditWalletKind;
  available: number;
  expiresAt?: string;
}

export interface CreditDebit {
  kind: CreditWalletKind;
  amount: number;
}

export function creditsForProviderCost(costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd < 0) {
    throw new TypeError("Provider cost must be a non-negative finite number.");
  }
  if (costUsd === 0) return 0;
  return Math.max(1, Math.ceil(costUsd * CREDITS_PER_PROVIDER_USD));
}

export function reserveCredits(maximumEstimatedCostUsd: number): number {
  return creditsForProviderCost(maximumEstimatedCostUsd);
}

const WALLET_PRIORITY: Readonly<Record<CreditWalletKind, number>> = {
  monthly: 1,
};

export function planCreditDebits(
  wallets: readonly CreditWalletBalance[],
  requestedCredits: number,
  now = new Date(),
): CreditDebit[] {
  if (!Number.isSafeInteger(requestedCredits) || requestedCredits < 0) {
    throw new TypeError("Requested credits must be a non-negative safe integer.");
  }
  const usable = wallets
    .filter((wallet) => wallet.available > 0)
    .filter((wallet) => !wallet.expiresAt || new Date(wallet.expiresAt) > now)
    .sort((left, right) => {
      const priority = WALLET_PRIORITY[left.kind] - WALLET_PRIORITY[right.kind];
      if (priority !== 0) return priority;
      return (left.expiresAt ?? "9999").localeCompare(right.expiresAt ?? "9999");
    });
  let remaining = requestedCredits;
  const debits: CreditDebit[] = [];
  for (const wallet of usable) {
    if (remaining === 0) break;
    const amount = Math.min(wallet.available, remaining);
    debits.push({ kind: wallet.kind, amount });
    remaining -= amount;
  }
  if (remaining > 0) throw new Error("INSUFFICIENT_CREDITS");
  return debits;
}
