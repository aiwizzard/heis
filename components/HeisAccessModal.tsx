'use client';

import { useState } from 'react';
import HeisBrand from './HeisBrand';

export type AccessStage = 'loading' | 'desktop-required' | 'sign-in' | 'upgrade' | 'ready';

interface HeisAccessModalProps {
  theme?: "light" | "dark";
  stage: AccessStage;
  onGoogle: () => Promise<void>;
  onMagicLink: (email: string) => Promise<void>;
  onContinueFree: () => void;
}

export default function HeisAccessModal({ theme = "dark", stage, onGoogle, onMagicLink, onContinueFree }: HeisAccessModalProps) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, successMessage = '') => {
    setBusy(true);
    setMessage('');
    try {
      await action();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The request failed.');
    } finally {
      setBusy(false);
    }
  };

  const desktopRequired = stage === 'desktop-required';
  const upgradeRequired = stage === 'upgrade';

  return (
    <div className="min-h-screen bg-[#030303] flex items-center justify-center px-4 font-inter text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-8 shadow-2xl">
        <div className="mb-7">
          <div className="mb-6"><HeisBrand theme={theme} height={36} /></div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-400">Heis access</p>
          <h1 className="text-2xl font-semibold">
            {desktopRequired ? 'Open the Heis desktop app' : upgradeRequired ? 'Generation access required' : 'Sign in to Heis'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/45">
            {desktopRequired ? 'Download Heis to work with Codex and local projects.' : upgradeRequired ? 'Subscribe to Creator or Pro for generation credits.' : 'Sign in for cloud storage and subscription credits. You can continue free without an account.'}
          </p>
        </div>

        {!desktopRequired && !upgradeRequired ? (
          <div className="space-y-5">
            <button disabled={busy} onClick={() => void run(onGoogle)} className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black disabled:opacity-40">Continue with Google</button>
            <form onSubmit={(event) => { event.preventDefault(); void run(() => onMagicLink(email), 'Check your email to finish signing in.'); }} className="space-y-3">
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-cyan-400/50" />
              <button disabled={busy} className="w-full rounded-lg border border-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-40">Email me a sign-in link</button>
            </form>
          </div>
        ) : upgradeRequired ? (
          <a href="https://app.heis.studio/account" target="_blank" rel="noreferrer" className="block w-full rounded-lg bg-cyan-400 px-4 py-3 text-center font-semibold text-black">Open Heis account</a>
        ) : null}

        {!desktopRequired && <button className="mt-5 w-full text-sm text-white/70" onClick={onContinueFree}>Continue free with Codex</button>}

        {message && <p className="mt-5 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/70">{message}</p>}
      </div>
    </div>
  );
}
