import React, { useEffect, useRef, useState } from "react";
import type {
  EditorBridge,
  WorkflowSnapshot,
  WorkflowNode,
  WorkflowNodeKind,
} from "@heis/core";
import {
  workflowCapabilities,
  workflowDependencies,
  workflowTemplates,
  migrateWorkflow,
} from "@heis/core";
import { WorkflowNodeControls } from "./WorkflowNodeControls";
import { assetUrl } from "./Preview";
import "./workflow.css";
export interface LegacyWorkflow {
  id: string;
  name: string;
  record: unknown;
}
export function WorkflowWorkspace({
  bridge,
  projectId,
  legacy = [],
  assistant,
}: {
  bridge: EditorBridge;
  projectId?: string;
  legacy?: LegacyWorkflow[];
  assistant?: (
    projectId: string,
    workflowId: string,
    directory: string,
  ) => React.ReactNode;
}) {
  const [migration, setMigration] = useState<{
    record: unknown;
    models: Record<string, string>;
  } | null>(null);
  const [showAssistant, setShowAssistant] = useState(false),
    [notice, setNotice] = useState("");
  const [data, setData] = useState<WorkflowSnapshot>(),
    [list, setList] = useState<{ id: string; name: string }[]>([]),
    [nodes, setNodes] = useState<WorkflowNode[]>([]),
    [name, setName] = useState(""),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [runId, setRunId] = useState(""),
    [frame, setFrame] = useState(0),
    [clipId, setClipId] = useState(""),
    [fit, setFit] = useState<"preserve" | "trim">("preserve"),
    [resultId, setResultId] = useState("");
  const mounted = useRef(true),
    current = useRef(data),
    token = useRef(0),
    draftRevision = useRef(0);
  current.current = data;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function apply(next: WorkflowSnapshot, graph = false) {
    setData(next);
    if (graph) {
      draftRevision.current = next.definition.revision;
      setNodes(next.definition.nodes);
      setName(next.definition.name);
      setDirty(false);
      setResultId("");
      setRunId(next.runs.at(-1)?.id || "");
    }
  }
  async function work(fn: () => Promise<WorkflowSnapshot>, graph = false) {
    const t = ++token.current;
    setBusy(true);
    setError("");
    try {
      const d = await fn();
      if (mounted.current && token.current === t) apply(d, graph);
      return d;
    } catch (e) {
      if (mounted.current && token.current === t) setError(String(e));
    } finally {
      if (mounted.current && token.current === t) setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    void bridge
      .workflowOpen(projectId)
      .then((d) => {
        if (live) apply(d, true);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [projectId, bridge]);
  useEffect(() => {
    if (!data) return;
    let live = true;
    void bridge
      .workflowList(data.definition.projectId)
      .then((l) => {
        if (live) setList(l);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [data?.definition.id, data?.definition.name]);
  useEffect(() => {
    const timer = setInterval(() => {
      const d = current.current;
      if (!d || busy) return;
      void bridge
        .workflowOpen(d.definition.projectId, d.definition.id)
        .then((next) => {
          if (
            mounted.current &&
            current.current?.definition.id === next.definition.id
          ) {
            setData(next);
            if (!dirty && next.definition.revision !== draftRevision.current)
              apply(next, true);
          }
        })
        .catch((e) => {
          if (mounted.current) setError(String(e));
        });
    }, 1200);
    return () => clearInterval(timer);
  }, [bridge, busy, dirty]);
  if (!data)
    return (
      <div className="heis-workflow">{error || "Opening workflows..."}</div>
    );
  const { definition: g, project } = data,
    p = project.project,
    sequence = p.sequences.find((s) => s.id === p.activeSequenceId)!;
  const run = data.runs.find((r) => r.id === runId) || data.runs.at(-1),
    resultIds = [
      ...new Set(
        run?.steps
          .filter(
            (s) =>
              s.status === "succeeded" &&
              run.graph.nodes.find((n) => n.id === s.nodeId)?.kind !==
                "image-input",
          )
          .flatMap((s) => s.assetIds) || [],
      ),
    ],
    result = p.assets.find((a) => a.id === (resultId || resultIds.at(-1)));
  const change = (id: string, patch: Partial<WorkflowNode>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    setDirty(true);
  };
  async function save() {
    return bridge.workflowSave(
      g.projectId,
      g.id,
      draftRevision.current,
      name,
      nodes,
    );
  }
  function add(value: string) {
    const capability = workflowCapabilities.find((c) => c.id === value),
      kind = capability ? "managed" : (value as WorkflowNodeKind);
    setNodes([
      ...nodes,
      {
        id: crypto.randomUUID(),
        kind,
        name: capability?.name || kind.replaceAll("-", " "),
        modelId: capability?.id,
        prompt: "",
        duration: 5,
        x: 30 + (nodes.length % 4) * 310,
        y: 40 + Math.floor(nodes.length / 4) * 500,
      },
    ]);
    setDirty(true);
  }
  async function importGraph(record: unknown) {
    setMigration({ record, models: {} });
    setError("");
  }
  function migrationPreview() {
    if (!migration) return;
    try {
      return migrateWorkflow({ migration });
    } catch (e) {
      return { error: String(e) };
    }
  }
  const migrationResult = migrationPreview();
  const legacyNodes = migration
    ? (migration.record as any)?.data?.nodes ||
      (migration.record as any)?.nodes ||
      []
    : [];

  return (
    <div className="heis-workflow">
      <header>
        <strong>Workflow Studio</strong>
        <select
          aria-label="Workflow"
          disabled={busy || dirty}
          value={g.id}
          onChange={(e) =>
            void work(() => bridge.workflowOpen(p.id, e.target.value), true)
          }
        >
          {list.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <button
          disabled={busy || dirty}
          onClick={() => void work(() => bridge.workflowCreate(p.id), true)}
        >
          New workflow
        </button>
        <input
          aria-label="Workflow name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
        <button disabled={busy || !dirty} onClick={() => void work(save, true)}>
          Save workflow
        </button>
        <button
          disabled={busy || !dirty}
          onClick={() => void work(() => bridge.workflowOpen(p.id, g.id), true)}
        >
          Discard changes
        </button>
        <button
          disabled={busy || data.runs.some((r) => r.status === "running")}
          onClick={() =>
            void work(async () => {
              const saved = dirty ? await save() : data;
              if (dirty) apply(saved, true);
              const next = await bridge.workflowRun(
                p.id,
                g.id,
                saved.definition.revision,
              );
              return next;
            }, true)
          }
        >
          Review and run
        </button>
      </header>
      <div className="workflow-toolbar">
        <button
          disabled={busy || dirty || !data.history?.undo.length}
          onClick={() =>
            void work(
              () => bridge.workflowHistory(p.id, g.id, g.revision, false),
              true,
            )
          }
        >
          Undo graph
        </button>
        <button
          disabled={busy || dirty || !data.history?.redo.length}
          onClick={() =>
            void work(
              () => bridge.workflowHistory(p.id, g.id, g.revision, true),
              true,
            )
          }
        >
          Redo graph
        </button>
        <select
          aria-label="Workflow template"
          value=""
          disabled={busy || dirty}
          onChange={(e) => {
            if (e.target.value)
              void work(
                () => bridge.workflowTemplate(p.id, e.target.value),
                true,
              );
          }}
        >
          <option value="">New from template</option>
          {workflowTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label>
          Import graph
          <input
            aria-label="Import workflow JSON"
            type="file"
            accept=".json,application/json"
            disabled={busy || dirty}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 2_000_000)
                  setError("Workflow JSON must be under 2 MB.");
                else
                  void f
                    .text()
                    .then((t) => importGraph(JSON.parse(t)))
                    .catch((e) => setError(String(e)));
              }
              e.target.value = "";
            }}
          />
        </label>
        <button
          onClick={() => {
            const url = URL.createObjectURL(
                new Blob([JSON.stringify({ ...g, nodes, name }, null, 2)], {
                  type: "application/json",
                }),
              ),
              a = document.createElement("a");
            a.href = url;
            a.download = "workflow.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Export graph
        </button>
        {assistant && (
          <button
            disabled={busy || dirty}
            onClick={() => setShowAssistant(!showAssistant)}
          >
            {showAssistant ? "Close assistant" : "Workflow assistant"}
          </button>
        )}

        <span>
          {dirty ? "Unsaved graph changes" : "Saved locally"} · {p.name}
        </span>
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void bridge
              .importMedia(p.id)
              .catch((e) => setError(String(e)))
              .finally(() => setBusy(false));
          }}
        >
          Import project media
        </button>
        <select
          aria-label="Add workflow node"
          value=""
          onChange={(e) => {
            if (e.target.value) add(e.target.value as WorkflowNodeKind);
          }}
        >
          <option value="">Add node</option>
          <option value="text-input">Text</option>
          <option value="video-input">Project video</option>
          <option value="audio-input">Project audio</option>
          <option value="text-concat">Concatenate text</option>
          <option value="video-combine">Combine videos locally</option>
          {workflowCapabilities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="image-input">Project image</option>
          <option value="image-edit">Image edit</option>
          <option value="image-to-video">Image to video</option>
          <option value="output">Output</option>
        </select>
        <span>
          Connect nodes using their input menus. Drag their headers to arrange.
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {dirty && g.revision !== draftRevision.current && (
        <p role="alert">
          The saved graph changed. Export or discard your draft before reloading
          the assistant's changes.
        </p>
      )}
      {migration && (
        <section
          className="workflow-migration"
          role="dialog"
          aria-label="Review workflow migration"
        >
          <h3>Review imported graph</h3>
          <p>
            Original records are preserved. Choose managed replacements for
            legacy provider nodes. Media must be relinked to this project.
          </p>
          {legacyNodes
            .filter(
              (n: any) =>
                [
                  "textNode",
                  "imageNode",
                  "videoNode",
                  "audioNode",
                  "apiNode",
                ].includes(n.type) &&
                !String(n.data?.selectedModel?.id || "").includes(
                  "passthrough",
                ),
            )
            .map((n: any) => (
              <label key={n.id}>
                {n.id}: {n.data?.selectedModel?.name || n.type}
                <select
                  aria-label={"Replacement for " + n.id}
                  value={migration.models[n.id] || ""}
                  onChange={(e) =>
                    setMigration({
                      ...migration,
                      models: { ...migration.models, [n.id]: e.target.value },
                    })
                  }
                >
                  <option value="">Suggested compatible model</option>
                  {workflowCapabilities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          {migrationResult &&
            ("error" in migrationResult ? (
              <p role="alert">{migrationResult.error}</p>
            ) : (
              <ul>
                {migrationResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ))}
          <button
            disabled={busy || !migrationResult || "error" in migrationResult}
            onClick={() =>
              void work(async () => {
                const result = await bridge.workflowImport(p.id, { migration });
                setNotice(result.warnings.join(" "));
                setMigration(null);
                return result.snapshot;
              }, true)
            }
          >
            Create reviewed copy
          </button>
          <button onClick={() => setMigration(null)}>Cancel import</button>
        </section>
      )}
      <div className="workflow-body">
        <main
          className="workflow-canvas"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain"),
              rect = e.currentTarget.getBoundingClientRect();
            change(id, {
              x: Math.max(
                0,
                Math.min(
                  5000,
                  e.clientX - rect.left + e.currentTarget.scrollLeft - 100,
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  5000,
                  e.clientY - rect.top + e.currentTarget.scrollTop - 15,
                ),
              ),
            });
          }}
        >
          <div
            style={{
              position: "relative",
              minWidth: Math.max(1300, ...nodes.map((n) => n.x + 310)),
              minHeight: Math.max(650, ...nodes.map((n) => n.y + 310)),
            }}
          >
            <svg
              className="workflow-wires"
              width="100%"
              height="100%"
              aria-hidden="true"
            >
              {nodes
                .flatMap((n) =>
                  workflowDependencies(n).map((source) => ({ ...n, source })),
                )
                .map((n) => {
                  const src = nodes.find((s) => s.id === n.source);
                  return src ? (
                    <path
                      key={n.id + ":" + n.source}
                      d={`M ${src.x + 270} ${src.y + 40} C ${src.x + 300} ${src.y + 40}, ${n.x - 40} ${n.y + 40}, ${n.x} ${n.y + 40}`}
                      stroke="#9dc477"
                      strokeWidth="2"
                      fill="none"
                    />
                  ) : null;
                })}
            </svg>
            {nodes.map((n) => {
              const state = run?.steps.find((s) => s.nodeId === n.id),
                image = p.assets.find((a) => a.id === n.assetId);
              return (
                <article
                  className="workflow-node"
                  key={n.id}
                  style={{ left: n.x, top: n.y }}
                >
                  <div
                    className="workflow-node-heading"
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", n.id)
                    }
                  >
                    <strong>{n.name}</strong>
                    <button
                      aria-label={"Remove " + n.name}
                      onClick={() => {
                        setNodes(nodes.filter((x) => x.id !== n.id));
                        setDirty(true);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <span className="workflow-kind">
                    {n.kind.replaceAll("-", " ")}
                    {state ? " · " + state.status : ""}
                  </span>
                  <WorkflowNodeControls
                    node={n}
                    nodes={nodes}
                    project={p}
                    change={change}
                  />
                </article>
              );
            })}
          </div>
        </main>
        {showAssistant && assistant && (
          <aside className="workflow-assistant">
            {assistant(p.id, g.id, project.directory)}
          </aside>
        )}
        <aside className="workflow-results">
          <h3>Runs and results</h3>
          <select
            aria-label="Workflow run"
            value={run?.id || ""}
            onChange={(e) => {
              setRunId(e.target.value);
              setResultId("");
            }}
          >
            <option value="" disabled>
              No runs yet
            </option>
            {[...data.runs].reverse().map((r) => (
              <option value={r.id} key={r.id}>
                {new Date(r.createdAt).toLocaleString()} · {r.status}
              </option>
            ))}
          </select>
          {run && (
            <>
              <p role="status">Run {run.status}</p>
              {run.message && <p>{run.message}</p>}
              {run.graph.revision !== g.revision && (
                <p>
                  This run uses the saved graph from revision{" "}
                  {run.graph.revision}.
                </p>
              )}
              <ol>
                {run.steps.map((s) => (
                  <li key={s.nodeId}>
                    <strong>
                      {run.graph.nodes.find((n) => n.id === s.nodeId)?.name}
                    </strong>
                    <span>{s.status}</span>
                    {s.message && <p>{s.message}</p>}
                  </li>
                ))}
              </ol>
              {run.status === "running" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void work(() => bridge.workflowCancel(p.id, g.id, run.id))
                  }
                >
                  Cancel run
                </button>
              ) : (
                ["failed", "cancelled"].includes(run.status) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void work(() => bridge.workflowRetry(p.id, g.id, run.id))
                    }
                  >
                    Review and resume
                  </button>
                )
              )}
            </>
          )}
          {run?.steps
            .filter((s) => s.status === "succeeded" && s.text !== undefined)
            .map((s) => (
              <details key={s.nodeId}>
                <summary>
                  {run.graph.nodes.find((n) => n.id === s.nodeId)?.name} text
                </summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>{s.text}</pre>
                <button
                  onClick={() => {
                    const url = URL.createObjectURL(
                        new Blob([s.text || ""], { type: "text/plain" }),
                      ),
                      a = document.createElement("a");
                    a.href = url;
                    a.download = "workflow-text.txt";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Save text
                </button>
              </details>
            ))}
          {!!resultIds.length && (
            <>
              <label>
                Result
                <select
                  aria-label="Workflow result"
                  value={result?.id || ""}
                  onChange={(e) => setResultId(e.target.value)}
                >
                  {resultIds.map((id) => {
                    const a = p.assets.find((a) => a.id === id);
                    return (
                      <option key={id} value={id}>
                        {a?.kind}: {a?.name || "Missing media"}
                      </option>
                    );
                  })}
                </select>
              </label>
              {result &&
                !result.missing &&
                (result.kind === "image" ? (
                  <img
                    src={assetUrl(p.id, result.path)}
                    alt="Workflow result"
                  />
                ) : result.kind === "audio" ? (
                  <audio controls src={assetUrl(p.id, result.path)} />
                ) : (
                  <video
                    controls
                    preload="metadata"
                    src={assetUrl(p.id, result.proxyPath || result.path)}
                    poster={
                      result.thumbnailPath
                        ? assetUrl(p.id, result.thumbnailPath)
                        : undefined
                    }
                  />
                ))}
              <label>
                Start frame
                <input
                  aria-label="Result start frame"
                  type="number"
                  min="0"
                  value={frame}
                  onChange={(e) => setFrame(Number(e.target.value))}
                />
              </label>
              <button
                disabled={busy || !projectId || !result || !run}
                onClick={() =>
                  void work(() =>
                    bridge.workflowInsert(
                      p.id,
                      g.id,
                      run!.id,
                      result!.id,
                      sequence.id,
                      frame,
                      p.revision,
                    ),
                  )
                }
              >
                Add result to timeline
              </button>
              <label>
                Replace clip
                <select
                  aria-label="Workflow replacement clip"
                  value={clipId}
                  onChange={(e) => setClipId(e.target.value)}
                >
                  <option value="">Choose a clip</option>
                  {sequence.clips
                    .filter(
                      (c) =>
                        c.assetId &&
                        sequence.tracks.find((t) => t.id === c.trackId)
                          ?.kind ===
                          (result?.kind === "audio" ? "audio" : "video"),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Shorter result
                <select
                  aria-label="Shorter result"
                  value={fit}
                  onChange={(e) =>
                    setFit(e.target.value as "preserve" | "trim")
                  }
                >
                  <option value="preserve">
                    Keep clip length (reject shorter result)
                  </option>
                  <option value="trim">Trim to result length</option>
                </select>
              </label>
              <button
                disabled={busy || !projectId || !result || !run || !clipId}
                onClick={() =>
                  void work(() =>
                    bridge.workflowInsert(
                      p.id,
                      g.id,
                      run!.id,
                      result!.id,
                      sequence.id,
                      frame,
                      p.revision,
                      clipId,
                      fit,
                    ),
                  )
                }
              >
                Replace chosen clip
              </button>
              <p>
                Replacement keeps visual properties. Detach linked audio first.
              </p>
              {!projectId && (
                <p>
                  Standalone results stay in your local library. Open a project
                  to insert them.
                </p>
              )}
            </>
          )}
          <details>
            <summary>Supported nodes</summary>
            <p>
              Text, image, video and audio inputs; managed generation and media
              tools; text concatenation; local video combining; project outputs.
              Managed runs require approval. Local-only runs are free.
            </p>
          </details>
          {!!legacy.length && (
            <details>
              <summary>Earlier workflows ({legacy.length})</summary>
              <p>
                Create a reviewed copy using supported managed models. Original
                records remain preserved. Arbitrary API nodes must be replaced
                before import.
              </p>
              {legacy.map((w) => (
                <details key={w.id}>
                  <summary>{w.name}</summary>
                  <button
                    disabled={busy || dirty}
                    onClick={() => void importGraph(w.record)}
                  >
                    Review migration
                  </button>
                  <button
                    onClick={() => {
                      const url = URL.createObjectURL(
                          new Blob([JSON.stringify(w.record, null, 2)], {
                            type: "application/json",
                          }),
                        ),
                        a = document.createElement("a");
                      a.href = url;
                      a.download = "workflow-" + w.id + ".json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    Download original graph
                  </button>
                  <pre>{JSON.stringify(w.record, null, 2)}</pre>
                </details>
              ))}
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
