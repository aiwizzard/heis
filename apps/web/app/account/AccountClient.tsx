"use client";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
export default function AccountClient() {
  const [account, setAccount] = useState<any>(null); const [error, setError] = useState("");
  useEffect(() => { void load(); }, []);
  async function token() { const { data } = await getBrowserClient().auth.getSession(); if (!data.session) throw new Error("Please sign in again."); return data.session.access_token; }
  async function load() { try { const response = await fetch("/v1/account", { headers: { Authorization: `Bearer ${await token()}` } }); if (!response.ok) throw new Error("Could not load your account."); setAccount(await response.json()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load your account."); } }
  async function checkout(plan: "lifetime" | "creator" | "topup") {
    setError(""); const response = await fetch("/v1/billing/checkout", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ plan }) }); const body = await response.json(); if (!response.ok) return setError(body.error?.message ?? "Checkout failed."); window.location.assign(body.url);
  }
  async function portal() { const response = await fetch("/v1/billing/portal", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Idempotency-Key": crypto.randomUUID() } }); const body = await response.json(); if (!response.ok) return setError(body.error?.message ?? "Billing portal failed."); window.location.assign(body.url); }
  if (error) return <div className="card"><p>{error}</p><button className="button secondary" onClick={load}>Try again</button></div>;
  if (!account) return <div className="card">Loading account...</div>;
  const credits = account.creditWallets.reduce((sum: number, wallet: any) => sum + wallet.balance, 0);
  return <><div className="card"><h2>{account.user.email}</h2><p><strong>{credits}</strong> credits available</p><p className="muted">{account.devices.length} of 3 Macs active</p></div><section className="plans"><article className="card"><h2>Lifetime</h2><div className="price">$99</div><button className="button" onClick={() => checkout("lifetime")}>Buy Heis 1.x</button></article><article className="card"><h2>Creator</h2><div className="price">$29/mo</div><button className="button" onClick={() => checkout("creator")}>Subscribe</button></article><article className="card"><h2>Top-up</h2><div className="price">$10</div><button className="button" onClick={() => checkout("topup")}>Add 1,000 credits</button></article></section>{account.subscription && <button className="button secondary" onClick={portal}>Manage billing</button>}</>;
}
