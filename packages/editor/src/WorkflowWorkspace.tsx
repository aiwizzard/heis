import React, { useEffect, useRef, useState } from "react";
import type {
  EditorBridge,
  WorkflowSnapshot,
  WorkflowNode,
  WorkflowNodeKind,
} from "@heis/core";
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
}: {
  bridge: EditorBridge;
  projectId?: string;
  legacy?: LegacyWorkflow[];
}) {
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
          )
            setData(next);
        })
        .catch((e) => {
          if (mounted.current) setError(String(e));
        });
    }, 1200);
    return () => clearInterval(timer);
  }, [bridge, busy]);
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
  function add(kind: WorkflowNodeKind) {
    const source = [...nodes]
      .reverse()
      .find((n) =>
        kind === "output"
          ? n.kind !== "output"
          : n.kind === "image-input" || n.kind === "image-edit",
      );
    setNodes([
      ...nodes,
      {
        id: crypto.randomUUID(),
        kind,
        name:
          kind === "image-edit"
            ? "Edit image"
            : kind === "image-to-video"
              ? "Animate image"
              : kind === "output"
                ? "Result"
                : "Project image",
        source: kind === "image-input" ? undefined : source?.id,
        prompt: "",
        duration: 5,
        x: 30 + (nodes.length % 4) * 310,
        y: 40 + Math.floor(nodes.length / 4) * 300,
      },
    ]);
    setDirty(true);
  }
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
                .filter((n) => n.source)
                .map((n) => {
                  const src = nodes.find((s) => s.id === n.source);
                  return src ? (
                    <path
                      key={n.id}
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
                  {n.kind === "image-input" ? (
                    <>
                      <label>
                        Project image
                        <select
                          aria-label={"Project image " + n.id}
                          value={n.assetId || ""}
                          onChange={(e) =>
                            change(n.id, { assetId: e.target.value })
                          }
                        >
                          <option value="">Choose an image</option>
                          {p.assets
                            .filter((a) => a.kind === "image")
                            .map((a) => (
                              <option
                                key={a.id}
                                value={a.id}
                                disabled={a.missing}
                              >
                                {a.name}
                                {a.missing ? " (missing)" : ""}
                              </option>
                            ))}
                        </select>
                      </label>
                      {image && !image.missing && (
                        <img
                          src={assetUrl(p.id, image.path)}
                          alt={image.name}
                        />
                      )}
                    </>
                  ) : (
                    <label>
                      Input
                      <select
                        aria-label={"Input for " + n.name}
                        value={n.source || ""}
                        onChange={(e) =>
                          change(n.id, { source: e.target.value })
                        }
                      >
                        <option value="">Connect a node</option>
                        {nodes
                          .filter(
                            (src) =>
                              src.id !== n.id &&
                              src.kind !== "output" &&
                              (n.kind === "output" ||
                                src.kind !== "image-to-video"),
                          )
                          .map((src) => (
                            <option key={src.id} value={src.id}>
                              {src.name} ({src.id.slice(0, 8)})
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {(n.kind === "image-edit" || n.kind === "image-to-video") && (
                    <label>
                      Prompt
                      <textarea
                        aria-label={n.name + " prompt"}
                        value={n.prompt}
                        onChange={(e) =>
                          change(n.id, { prompt: e.target.value })
                        }
                        placeholder={
                          n.kind === "image-edit"
                            ? "Describe the image edit"
                            : "Describe the motion"
                        }
                      />
                    </label>
                  )}
                  {n.kind === "image-to-video" && (
                    <label>
                      Duration
                      <select
                        aria-label="Video duration"
                        value={n.duration}
                        onChange={(e) =>
                          change(n.id, {
                            duration: Number(e.target.value) as 5 | 10,
                          })
                        }
                      >
                        <option value={5}>5 seconds</option>
                        <option value={10}>10 seconds</option>
                      </select>
                    </label>
                  )}
                  {n.kind === "output" && (
                    <p>
                      Keep the result in your project library, then choose
                      whether to insert it.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </main>
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
                          ?.kind === "video",
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
              Project images, image editing, image-to-video and outputs. Other
              node types and the workflow-building assistant are not yet
              enabled.
            </p>
          </details>
          {!!legacy.length && (
            <details>
              <summary>Earlier workflows ({legacy.length})</summary>
              <p>
                These records are preserved. Legacy nodes cannot run through the
                new provider yet.
              </p>
              {legacy.map((w) => (
                <details key={w.id}>
                  <summary>{w.name}</summary>
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
