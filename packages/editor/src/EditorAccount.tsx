import React, { useState, useRef, useEffect } from "react";
import type { EntitlementSnapshot, ResultEnvelope } from "@heis/core";
import { accessMessage } from "./accessMessages";
export interface AccountBridge {
  auth: {
    getSession(): Promise<ResultEnvelope<{ userId: string | null } | null>>;
    startGoogle(): Promise<ResultEnvelope<void>>;
    sendMagicLink(email: string): Promise<ResultEnvelope<void>>;
    onEvent(
      callback: (event: { type: string; [key: string]: unknown }) => void,
    ): () => void;
  };
  entitlements: {
    get(): Promise<ResultEnvelope<EntitlementSnapshot | null>>;
    refresh(): Promise<ResultEnvelope<EntitlementSnapshot>>;
  };
}
export function EditorAccount({
  api,
  signedIn,
  onClose,
  onRefresh,
}: {
  api: AccountBridge;
  signedIn: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (
    action: () => Promise<ResultEnvelope<unknown>>,
    success: string,
  ) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      if (!result.ok) throw new Error(result.error.message);
      setMessage(success);
      onRefresh();
    } catch (error) {
      setMessage(accessMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      aria-label={signedIn ? "Heis account" : "Sign in to Heis"}
      className="heis-account-backdrop"
      onCancel={onClose}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <section className="heis-account-dialog">
        <header>
          <h2>{signedIn ? "Your Heis account" : "Sign in to Heis"}</h2>
          <button aria-label="Close account" onClick={onClose}>
            ×
          </button>
        </header>
        <p>
          {signedIn
            ? "Manage your generation plan and refresh your access."
            : "Sign in to generate assets directly in this project. Editing and export remain free."}
        </p>
        {signedIn ? (
          <>
            <a
              href="https://app.heis.studio/account"
              target="_blank"
              rel="noreferrer"
            >
              Manage plan and credits ↗
            </a>
            <button
              disabled={busy}
              onClick={() =>
                void run(
                  () => api.entitlements.refresh(),
                  "Your account access is up to date.",
                )
              }
            >
              Refresh access
            </button>
          </>
        ) : (
          <>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(
                  () => api.auth.startGoogle(),
                  "Finish signing in in your browser. This editor will update automatically.",
                )
              }
            >
              Continue with Google
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => api.auth.sendMagicLink(email),
                  "Check your email for a sign-in link. Keep this editor open.",
                );
              }}
            >
              <label>
                Email address
                <input
                  autoFocus
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <button disabled={busy}>Email me a sign-in link</button>
            </form>
          </>
        )}
        {message && <p role="status">{message}</p>}
        <button onClick={onClose}>Back to editing</button>
      </section>
    </dialog>
  );
}
