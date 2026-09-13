"use client";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase-browser";
export default function LoginForm() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function emailLogin(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const redirectTo = `${window.location.origin}/auth/callback?next=/account`;
    const { error } = await getBrowserClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setMessage(error ? error.message : "Check your email for the secure sign-in link."); setBusy(false);
  }
  async function googleLogin() {
    setBusy(true);
    const { error } = await getBrowserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=/account` } });
    if (error) { setMessage(error.message); setBusy(false); }
  }
  return <div className="card"><form onSubmit={emailLogin}><label htmlFor="email">Email address</label><input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button className="button" disabled={busy} type="submit">Email me a sign-in link</button></form><p className="muted">or</p><button className="button secondary" disabled={busy} onClick={googleLogin}>Continue with Google</button>{message && <p>{message}</p>}</div>;
}
