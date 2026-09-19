import React, { Suspense, lazy, useEffect, useState } from "react";
import { EditorAccount, type AccountBridge } from "./EditorAccount";
import type { EditorBridge } from "@heis/core";
import { EditorApp } from "./EditorApp";
import type { GenerationBridge } from "./GeneratePanel";

// Legacy studios deliberately remain outside the strict editor package boundary.
export function DesktopEditor({
  bridge,
  legacy,
  assistant,
  renderTool,
  generationApi,
  accountApi,
}: {
  accountApi?: AccountBridge;
  bridge: EditorBridge;
  generationApi?: GenerationBridge;
  legacy: React.ReactNode;
  assistant: (directory: string) => React.ReactNode;
  renderTool: (
    id: string,
    projectId: string | null,
    onResult: (urls: string[], jobId: string) => void,
    input?: { url: string; name: string },
  ) => React.ReactNode;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null),
    [standalone, setStandalone] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false),
    [signedIn, setSignedIn] = useState(false),
    [accessRevision, setAccessRevision] = useState(0);
  const refreshAccount = () => {
    if (accountApi)
      void accountApi.auth
        .getSession()
        .then((result) => setSignedIn(result.ok && !!result.value))
        .catch(() => {});
    setAccessRevision((v) => v + 1);
  };
  useEffect(() => {
    if (!accountApi) return;
    refreshAccount();
    return accountApi.auth.onEvent((event) => {
      if (
        [
          "signed-in",
          "signed-out",
          "entitlement-refreshed",
          "entitlement-error",
        ].includes(event.type)
      ) {
        refreshAccount();
        if (event.type === "entitlement-refreshed") setAccountOpen(false);
      }
    });
  }, [accountApi]);
  useEffect(() => {
    void bridge
      .status()
      .then((s) => setEnabled(s.enabled))
      .catch(() => setEnabled(false));
  }, [bridge]);
  if (enabled === null)
    return <div style={{ background: "#191a1e", height: "100vh" }} />;
  if (!enabled) return <>{legacy}</>;
  if (standalone)
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div
          style={{ padding: "8px 90px", background: "#202125", color: "#ddd" }}
        >
          <button onClick={() => setStandalone(false)}>← Projects</button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>{legacy}</div>
      </div>
    );
  return (
    <>
      <EditorApp
        onAccount={accountApi ? () => setAccountOpen(true) : undefined}
        accountLabel={signedIn ? "Account" : "Sign in"}
        accessRevision={accessRevision}
        bridge={bridge}
        generationApi={generationApi}
        onLegacy={() => setStandalone(true)}
        renderAssistant={assistant}
        renderTool={renderTool}
      />
      {accountOpen && accountApi && (
        <EditorAccount
          api={accountApi}
          signedIn={signedIn}
          onClose={() => setAccountOpen(false)}
          onRefresh={refreshAccount}
        />
      )}
    </>
  );
}
