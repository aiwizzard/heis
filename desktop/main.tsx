import React from "react";
import { createRoot } from "react-dom/client";
import StandaloneShell from "../components/StandaloneShell";
import CodexStudio from "../components/CodexStudio";
import EditorToolWorkspace from "../components/EditorToolWorkspace";
import { DesktopEditor } from "../packages/editor/src/DesktopEditor";
import type { EditorBridge } from "@heis/core";
import "../app/globals.css";
import "./desktop.css";
const locale = location.pathname.startsWith("/zh/") ? "zh" : "en";
const slug = location.pathname
  .split("/")
  .filter(Boolean)
  .slice(locale === "zh" ? 2 : 1);
const bridge = (window as unknown as { heisEditor: EditorBridge }).heisEditor;
const legacy = <StandaloneShell locale={locale} routeParams={{ slug }} />;
createRoot(document.getElementById("root")!).render(
  bridge && slug.length === 0 ? (
    <DesktopEditor
      bridge={bridge}
      generationApi={window.heis?.generation}
      accountApi={window.heis}
      legacy={legacy}
      assistant={(directory) => (
        <CodexStudio projectDirectory={directory} compact />
      )}
      renderTool={(id, projectId, onResult, input) => (
        <EditorToolWorkspace
          key={`${projectId}-${id}`}
          id={id}
          projectId={projectId}
          locale={locale}
          input={input}
          onResult={onResult}
        />
      )}
    />
  ) : (
    legacy
  ),
);
