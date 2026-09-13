'use client';

import { useState } from 'react';

export type AccessStage = 'loading' | 'desktop-required' | 'sign-in' | 'byok' | 'upgrade' | 'ready';

interface HeisAccessModalProps {
  stage: AccessStage;
  onGoogle: () => Promise<void>;
  onMagicLink: (email: string) => Promise<void>;
  onSaveRunwareKey: (key: string) => Promise<void>;
}

export default function HeisAccessModal({ stage, onGoogle, onMagicLink, onSaveRunwareKey }: HeisAccessModalProps) {
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
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

  const needsKey = stage === 'byok';
  const desktopRequired = stage === 'desktop-required';
  const upgradeRequired = stage === 'upgrade';

  return (
    <div className="min-h-screen bg-[#030303] flex items-center justify-center px-4 font-inter text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-8 shadow-2xl">
        <div className="mb-7">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-400">Heis access</p>
          <h1 className="text-2xl font-semibold">
            {needsKey ? 'Connect your Runware key' : desktopRequired ? 'Open the Heis desktop app' : upgradeRequired ? 'Generation access required' : 'Sign in to Heis'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/45">
            {needsKey
              ? 'Your key is encrypted by macOS and is never exposed to the studio renderer.'
              : desktopRequired
                ? 'The editor uses a secure Electron bridge and is not available as a browser application.'
                : upgradeRequired
                  ? 'Your projects remain readable and exportable. Activate Creator or Lifetime access to generate again.'
                  : 'Sign in to activate this Mac and start your trial or use an existing purchase.'}
          </p>
        </div>

        {needsKey ? (
          <form onSubmit={(event) => { event.preventDefault(); void run(() => onSaveRunwareKey(key)); }} className="space-y-4">
            <input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Runware API key" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-cyan-400/50" />
            <button disabled={busy || !key.trim()} className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-black disabled:opacity-40">Save encrypted key</button>
            <a href="https://my.runware.ai/" target="_blank" rel="noreferrer" className="block text-center text-sm text-cyan-300 hover:text-cyan-200">Create or manage a Runware key</a>
          </form>
        ) : !desktopRequired && !upgradeRequired ? (
          <div className="space-y-5">
            <button disabled={busy} onClick={() => void run(onGoogle)} className="w-full rounded-lg bg-white px-4 py-3 font-semibold text-black disabled:opacity-40">Continue with Google</button>
            <form onSubmit={(event) => { event.preventDefault(); void run(() => onMagicLink(email), 'Check your email to finish signing in.'); }} className="space-y-3">
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-cyan-400/50" />
              <button disabled={busy} className="w-full rounded-lg border border-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-40">Email me a sign-in link</button>
            </form>
          </div>
        ) : upgradeRequired ? (
          <a href="https://heis.app/account" target="_blank" rel="noreferrer" className="block w-full rounded-lg bg-cyan-400 px-4 py-3 text-center font-semibold text-black">Open Heis account</a>
        ) : null}

        {message && <p className="mt-5 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/70">{message}</p>}
      </div>
    </div>
  );
}
