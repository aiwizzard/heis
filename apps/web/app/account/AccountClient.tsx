"use client";
import StoragePanel from "./StoragePanel";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
export default function AccountClient() {
  const [account, setAccount] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void load(); }, []);
  async function token() { const { data } = await getBrowserClient().auth.getSession(); if (!data.session) throw new Error("Please sign in again."); return data.session.access_token; }
  async function load() {
    try { setError(""); const response = await fetch("/v1/account", { headers: { Authorization: `Bearer ${await token()}` } }); if (!response.ok) throw new Error("Could not load your account."); setAccount(await response.json()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load your account."); }
  }
  async function billing(plan?: "creator" | "pro") {
    setBusy(true); setError("");
    try {
      const response = await fetch(plan ? (account.subscription && !["canceled","incomplete_expired"].includes(account.subscription.status) ? "/v1/billing/change-plan" : "/v1/billing/checkout") : "/v1/billing/portal", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, ...(plan ? { body: JSON.stringify({plan}) } : {}) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "Billing could not be opened."); if(body.url) window.location.assign(body.url); else { setNotice(`Plan change scheduled for ${new Date(body.effectiveAt).toLocaleDateString()}. Your current credits remain available until then.`); await load(); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Billing failed."); } finally { setBusy(false); }
  }
  if (!account) return <div className="card">{error || "Loading account..."}{error && <button onClick={load}>Try again</button>}</div>;
  const credits = account.plan === "free" ? 0 : account.creditWallets.reduce((sum: number, wallet: any) => sum + wallet.balance, 0);
  const gb = (bytes: number) => (bytes / 1024 ** 3).toLocaleString(undefined,{maximumFractionDigits:2});
  const hasSubscription = account.subscription && !["canceled","incomplete_expired"].includes(account.subscription.status);
  return <>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    <div className="card"><h2>{account.user.email}</h2><p>{account.plans[account.plan].name} plan · <strong>{credits.toLocaleString()}</strong> credits available</p><p className="muted">Cloud storage: {gb(account.storage.usedBytes)} / {gb(account.storage.limitBytes)} GB</p><progress aria-label="Cloud storage used" value={account.storage.usedBytes} max={account.storage.limitBytes} /><p className="muted">Local files are unlimited. {account.devices.length} of 3 Macs connected.</p></div>
    <section className="plans">{Object.values(account.plans).map((plan: any)=><article className="card" key={plan.id}><h2>{plan.name}</h2><div className="price">${plan.monthlyUsd}{plan.id !== 'free' && <small>/month</small>}</div><p>{plan.monthlyCredits.toLocaleString()} generation credits / month</p><p>{gb(plan.storageBytes)} GB cloud storage</p><p className="muted">Codex and local projects included. Connect your own Codex account.</p>{plan.id === 'free' ? <p>{account.plan === 'free' ? 'Your current plan' : 'Free desktop access is always included'}</p> : <button disabled={busy || account.plan === plan.id} className="button" onClick={()=>void billing(plan.id)}>{account.plan === plan.id ? 'Current plan' : hasSubscription ? `Switch to ${plan.name} at renewal` : `Subscribe to ${plan.name}`}</button>}</article>)}</section>
    <p className="muted">Credits renew each billing month and expire at the end of that period. No rollover or automatic overage charges. Cancel through the billing portal; local projects and Codex remain available on Free. Cloud media is retained for up to 30 days.</p>
    <StoragePanel onChange={load} />
    {account.subscription && <button disabled={busy} className="button secondary" onClick={()=>void billing()}>Manage billing</button>}
  </>;
}
