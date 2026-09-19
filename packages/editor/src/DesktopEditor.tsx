import React, { Suspense, lazy, useEffect, useState } from "react";
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
}: {
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
    <EditorApp
      bridge={bridge}
      generationApi={generationApi}
      onLegacy={() => setStandalone(true)}
      renderAssistant={assistant}
      renderTool={renderTool}
    />
  );
}
