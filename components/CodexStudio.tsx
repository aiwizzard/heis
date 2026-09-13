'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { AgentStatus } from '@heis/core';

type CodexStatus = AgentStatus & { outdated?: boolean; minimumVersion?: string };
type ChatMessage = { id: string; role: 'user' | 'assistant' | 'status' | 'error'; text: string };
type CodexWireEvent = {
  type?: string;
  requestId?: number | string;
  method?: string;
  message?: string;
  params?: Record<string, any>;
};

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export default function CodexStudio() {
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [cwd, setCwd] = useState('');
  const [prompt, setPrompt] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turnId, setTurnId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(async () => {
    if (!window.heis) return;
    setStatus(unwrap(await window.heis.codex.status()) as CodexStatus);
  }, []);

  useEffect(() => {
    setCwd(localStorage.getItem('heis_codex_cwd') ?? '');
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  useEffect(() => {
    if (!window.heis) return undefined;
    return window.heis.codex.onEvent((rawEvent) => {
      const event = rawEvent as CodexWireEvent;
      if (event.type === 'server-request') return;
      if (event.type === 'diagnostic') return;

      if (event.method === 'item/agentMessage/delta') {
        const delta = String(event.params?.delta ?? '');
        if (!delta) return;
        setMessages((current) => {
          const last = current[current.length - 1];
          if (last?.role === 'assistant' && last.id === 'streaming') {
            return [...current.slice(0, -1), { ...last, text: last.text + delta }];
          }
          return [...current, { id: 'streaming', role: 'assistant', text: delta }];
        });
      } else if (event.method === 'item/completed' && event.params?.item?.type === 'agentMessage') {
        const text = String(event.params.item.text ?? '');
        setMessages((current) => {
          const withoutStreaming = current.filter((message) => message.id !== 'streaming');
          return text ? [...withoutStreaming, { id: crypto.randomUUID(), role: 'assistant', text }] : withoutStreaming;
        });
      } else if (event.method === 'turn/completed') {
        const turn = event.params?.turn;
        if (turn?.status === 'failed') {
          setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'error', text: turn.error?.message ?? 'Codex turn failed.' }]);
        }
        setBusy(false);
        setTurnId(null);
      } else if (event.method === 'error') {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'error', text: String(event.params?.error?.message ?? 'Codex reported an error.') }]);
        setBusy(false);
      }
    });
  }, []);

  const saveOpenAIKey = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.heis || !openaiKey.trim()) return;
    unwrap(await window.heis.secrets.set('openaiApiKey', openaiKey.trim()));
    setOpenaiKey('');
    await refreshStatus();
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = prompt.trim();
    const projectDirectory = cwd.trim();
    if (!window.heis || !text || !projectDirectory || busy) return;

    setPrompt('');
    setBusy(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text }]);
    localStorage.setItem('heis_codex_cwd', projectDirectory);

    try {
      let activeThreadId = threadId;
      if (!activeThreadId) {
        const thread = unwrap(await window.heis.codex.startThread({ cwd: projectDirectory, title: 'Heis creative agent' }));
        activeThreadId = thread.id;
        setThreadId(thread.id);
      }
      const turn = unwrap(await window.heis.codex.startTurn(activeThreadId, { text })) as { turn?: { id?: string } };
      setTurnId(turn.turn?.id ?? null);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'error', text: error instanceof Error ? error.message : 'Could not start Codex.' }]);
      setBusy(false);
    }
  };

  const interrupt = async () => {
    if (!window.heis || !threadId || !turnId) return;
    unwrap(await window.heis.codex.interrupt(threadId, turnId));
  };

  if (!status) return <div className="flex h-full items-center justify-center text-white/40">Checking Codex...</div>;

  if (!status.available || status.outdated || !status.authenticated) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Codex setup</p>
          <h2 className="mt-2 text-2xl font-semibold">Connect Codex to Heis</h2>
          <p className="mt-3 text-sm leading-6 text-white/50">{status.reason ?? 'Sign in through the Codex CLI or store an OpenAI API key for the agent.'}</p>
          <div className="mt-5 rounded-lg bg-black/40 p-4 font-mono text-sm text-white/70">
            <div>npm install -g @openai/codex</div>
            <div>codex login</div>
          </div>
          <form onSubmit={saveOpenAIKey} className="mt-5 flex gap-2">
            <input type="password" value={openaiKey} onChange={(event) => setOpenaiKey(event.target.value)} placeholder="Or enter an OpenAI API key" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/50" />
            <button disabled={!openaiKey.trim()} className="rounded-lg bg-cyan-400 px-4 py-3 text-sm font-semibold text-black disabled:opacity-40">Save key</button>
          </form>
          <div className="mt-4 flex items-center justify-between">
            <a href="https://developers.openai.com/codex/cli" target="_blank" rel="noreferrer" className="text-sm text-cyan-300">Installation guide</a>
            <button onClick={() => void refreshStatus()} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5">Check again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#030303]">
      <div className="border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="font-semibold">Heis Agent</h2><p className="text-xs text-white/35">Codex {status.version}</p></div>
          {busy && turnId && <button onClick={() => void interrupt()} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-300">Stop</button>}
        </div>
        <input value={cwd} onChange={(event) => { setCwd(event.target.value); setThreadId(null); }} placeholder="Project folder, for example /Users/you/Projects/heis-project" className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 outline-none focus:border-cyan-400/50" />
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {messages.length === 0 && <div className="mx-auto mt-16 max-w-lg text-center text-sm leading-6 text-white/35">Ask Codex to plan a scene, generate media through approved Heis tools, or work with files in the selected project folder.</div>}
        {messages.map((message) => (
          <div key={message.id} className={`max-w-3xl whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'ml-auto bg-cyan-400 text-black' : message.role === 'error' ? 'border border-red-400/20 bg-red-400/10 text-red-200' : 'bg-white/[0.05] text-white/80'}`}>{message.text}</div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="border-t border-white/10 p-4">
        <div className="mx-auto flex max-w-4xl gap-3">
          <textarea rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What should Codex do?" className="min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-cyan-400/50" />
          <button disabled={busy || !prompt.trim() || !cwd.trim()} className="rounded-xl bg-cyan-400 px-5 font-semibold text-black disabled:opacity-40">Send</button>
        </div>
      </form>
    </div>
  );
}
