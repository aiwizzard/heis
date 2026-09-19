import React, { useEffect, useRef, useState } from "react";
import type {
  DesignAction,
  DesignPatch,
  DesignSnapshot,
  EditorBridge,
} from "@heis/core";
import { assetUrl } from "./Preview";
import "./design.css";

export function DesignWorkspace({
  bridge,
  projectId,
  input,
  chat,
}: {
  bridge: EditorBridge;
  projectId?: string;
  input?: { url: string; name: string };
  chat: (
    directory: string,
    scope: { projectId: string; sessionId: string },
  ) => React.ReactNode;
}) {
  const [data, setData] = useState<DesignSnapshot>(),
    [sessions, setSessions] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [compare, setCompare] = useState(""),
    [prompt, setPrompt] = useState(""),
    [action, setAction] = useState<DesignAction>("generate"),
    [share, setShare] = useState(false),
    [video, setVideo] = useState(""),
    [seconds, setSeconds] = useState(0),
    [frame, setFrame] = useState(0),
    [duration, setDuration] = useState(150),
    [replacement, setReplacement] = useState("");
  const current = useRef(data);
  current.current = data;
  const mounted = useRef(true);
  const requestToken = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run(work: () => Promise<DesignSnapshot>) {
    const token = ++requestToken.current;
    setBusy(true);
    setError("");
    try {
      const next = await work();
      if (mounted.current && token === requestToken.current) setData(next);
      return next;
    } catch (e) {
      if (mounted.current && token === requestToken.current)
        setError(String(e));
    } finally {
      if (mounted.current && token === requestToken.current) setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    void bridge
      .designOpen(projectId, undefined, input?.url)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [bridge, projectId, input?.url]);
  useEffect(() => {
    if (!data) return;
    let live = true;
    void bridge.designList(data.session.projectId).then((s) => {
      if (live) setSessions(s);
    });
    return () => {
      live = false;
    };
  }, [data?.session.id, data?.session.name]);
  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => {
      const d = current.current;
      if (!d || busy) return;
      void bridge
        .designOpen(d.session.projectId, d.session.id)
        .then((next) => {
          if (
            mounted.current &&
            current.current?.session.id === next.session.id
          )
            setData(next);
        })
        .catch((e) => setError(String(e)));
    }, 2000);
    return () => clearInterval(id);
  }, [data?.session.id, busy]);
  useEffect(() => {
    setSelected("");
    setCompare("");
    setShare(false);
    setReplacement("");
  }, [data?.session.id]);
  if (!data)
    return (
      <div className="heis-design">
        {error || "Opening design workspace..."}
      </div>
    );
  const { session: s, project } = data,
    p = project.project,
    sequence = p.sequences.find((q) => q.id === p.activeSequenceId)!;
  const patch = (value: DesignPatch) =>
    run(() => bridge.designUpdate(s.projectId, s.id, s.revision, value));
  const assets = p.assets,
    chosen = assets.find((a) => a.id === selected);
  const preview = (id: string) => {
    const a = assets.find((a) => a.id === id);
    return a && !a.missing ? (
      <img src={assetUrl(p.id, a.path)} alt={a.name} />
    ) : (
      <p>Missing image. Relink it in Media.</p>
    );
  };
  return (
    <div className="heis-design">
      <header>
        <strong>Design Agent</strong>
        <select
          aria-label="Design session"
          value={s.id}
          onChange={(e) =>
            void run(() => bridge.designOpen(p.id, e.target.value))
          }
        >
          {sessions.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={() => void run(() => bridge.designCreate(p.id))}
        >
          New design
        </button>
        <span>Saved locally · {p.name}</span>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="design-columns">
        <aside className="design-settings">
          <label>
            Name
            <input
              key={s.id + "name"}
              defaultValue={s.name}
              onBlur={(e) => {
                if (e.target.value !== s.name)
                  void patch({ name: e.target.value });
              }}
            />
          </label>
          <label>
            Design brief
            <textarea
              key={s.id + "brief"}
              defaultValue={s.brief}
              placeholder="A thumbnail, title card, product visual..."
              onBlur={(e) => {
                if (e.target.value !== s.brief)
                  void patch({ brief: e.target.value });
              }}
            />
          </label>
          <label>
            Colors
            <input
              key={s.id + "colors"}
              defaultValue={s.colors}
              placeholder="Warm cream, charcoal, orange"
              onBlur={(e) => {
                if (e.target.value !== s.colors)
                  void patch({ colors: e.target.value });
              }}
            />
          </label>
          <label>
            Canvas size
            <select
              value={`${s.width}x${s.height}`}
              onChange={(e) => {
                const [width, height] = e.target.value.split("x").map(Number);
                void patch({ width, height });
              }}
            >
              <option value="1024x1024">Square 1024 × 1024</option>
              <option value="1536x864">Landscape 1536 × 864</option>
              <option value="864x1536">Portrait 864 × 1536</option>
            </select>
          </label>
          <button
            disabled={busy}
            onClick={() => void run(() => bridge.designImport(p.id, s.id))}
          >
            Import references
          </button>
          <label>
            Project image
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const id = e.target.value;
                void patch({
                  referenceAssetIds: [...new Set([...s.referenceAssetIds, id])],
                  cards: s.cards.some((c) => c.assetId === id)
                    ? s.cards
                    : [...s.cards, { assetId: id, x: 20, y: 20 }],
                });
              }}
            >
              <option value="">Choose an image</option>
              {assets
                .filter((a) => a.kind === "image" && !a.missing)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Video reference
            <select value={video} onChange={(e) => setVideo(e.target.value)}>
              <option value="">Choose footage</option>
              {assets
                .filter((a) => a.kind === "video" && !a.missing)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Frame time (seconds)
            <input
              type="number"
              min="0"
              step="0.1"
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            />
          </label>
          <button
            disabled={busy || !video}
            onClick={() =>
              void run(() => bridge.designFrame(p.id, s.id, video, seconds))
            }
          >
            Extract reference frame
          </button>
          <h3>References shared with chat</h3>
          {s.referenceAssetIds.map((id) => (
            <div key={id} className="design-ref">
              <span>
                {assets.find((a) => a.id === id)?.name || "Missing reference"}
              </span>
              <button
                aria-label="Remove reference"
                onClick={() =>
                  void patch({
                    referenceAssetIds: s.referenceAssetIds.filter(
                      (a) => a !== id,
                    ),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          <h3>Timeline placement</h3>
          <label>
            Start frame
            <input
              type="number"
              min="0"
              value={frame}
              onChange={(e) => setFrame(Number(e.target.value))}
            />
          </label>
          <label>
            Duration (frames)
            <input
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
          <button
            disabled={busy || !chosen || !projectId}
            onClick={() =>
              void run(() =>
                bridge.designInsert(
                  p.id,
                  s.id,
                  selected,
                  sequence.id,
                  frame,
                  duration,
                  p.revision,
                ),
              )
            }
          >
            Add to timeline
          </button>
          <label>
            Replace clip
            <select
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            >
              <option value="">Choose a clip</option>
              {sequence.clips
                .filter(
                  (c) =>
                    c.assetId &&
                    sequence.tracks.find((t) => t.id === c.trackId)?.kind ===
                      "video",
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            disabled={busy || !chosen || !replacement || !projectId}
            onClick={() =>
              void run(() =>
                bridge.designInsert(
                  p.id,
                  s.id,
                  selected,
                  sequence.id,
                  frame,
                  duration,
                  p.revision,
                  replacement,
                ),
              )
            }
          >
            Replace chosen clip
          </button>
          {!projectId && (
            <p>
              Outputs are saved in your local library. Open a project to insert
              them.
            </p>
          )}
        </aside>
        <main className="design-main">
          <div
            className="design-board"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              const rect = e.currentTarget.getBoundingClientRect();
              void patch({
                cards: s.cards.map((c) =>
                  c.assetId === id
                    ? {
                        ...c,
                        x: Math.max(
                          0,
                          Math.min(
                            5000,
                            e.clientX -
                              rect.left +
                              e.currentTarget.scrollLeft -
                              100,
                          ),
                        ),
                        y: Math.max(
                          0,
                          Math.min(
                            5000,
                            e.clientY -
                              rect.top +
                              e.currentTarget.scrollTop -
                              50,
                          ),
                        ),
                      }
                    : c,
                ),
              });
            }}
          >
            {!s.cards.length && (
              <div className="design-empty">
                <h2>Give your next video a visual direction</h2>
                <p>
                  Import references, describe a design, or work with the agent.
                  Variations stay here until you choose one.
                </p>
              </div>
            )}
            <div
              style={{
                position: "relative",
                minWidth: 900,
                minHeight: Math.max(600, ...s.cards.map((c) => c.y + 200)),
              }}
            >
              {s.cards.map((c) => (
                <button
                  className={
                    "design-card " + (selected === c.assetId ? "selected" : "")
                  }
                  style={{ left: c.x, top: c.y }}
                  key={c.assetId}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", c.assetId)
                  }
                  onClick={() => setSelected(c.assetId)}
                >
                  {preview(c.assetId)}
                  <span>{assets.find((a) => a.id === c.assetId)?.name}</span>
                </button>
              ))}
            </div>
          </div>
          {chosen && (
            <details>
              <summary>Inspect and compare: {chosen.name}</summary>
              <select
                aria-label="Compare image"
                value={compare}
                onChange={(e) => setCompare(e.target.value)}
              >
                <option value="">Choose comparison</option>
                {s.cards
                  .filter((c) => c.assetId !== selected)
                  .map((c) => (
                    <option value={c.assetId} key={c.assetId}>
                      {assets.find((a) => a.id === c.assetId)?.name}
                    </option>
                  ))}
              </select>
              <div className="design-comparison">
                {preview(selected)}
                {compare && preview(compare)}
              </div>
            </details>
          )}
          <form
            className="design-generate"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                bridge.designGenerate({
                  projectId: p.id,
                  sessionId: s.id,
                  revision: s.revision,
                  action,
                  sourceAssetId: action === "generate" ? undefined : selected,
                  prompt,
                }),
              );
            }}
          >
            <select
              aria-label="Design action"
              value={action}
              onChange={(e) => setAction(e.target.value as DesignAction)}
            >
              {(
                [
                  "generate",
                  "edit",
                  "upscale",
                  "remove-background",
                  "expand",
                  "layers",
                ] as DesignAction[]
              ).map((a) => (
                <option key={a} value={a}>
                  {a.replaceAll("-", " ")}
                </option>
              ))}
            </select>
            <textarea
              aria-label="Design prompt"
              placeholder="Describe the design or refinement"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button disabled={busy || (action !== "generate" && !chosen)}>
              Review generation
            </button>
          </form>
          <div className="design-jobs">
            {data.jobs.map((j) => (
              <div key={j.id}>
                <span>
                  {
                    s.jobs.find((x) => x.providerJobId === j.providerJobId)
                      ?.action
                  }
                  : {j.status}
                  {j.message ? " · " + j.message : ""}
                </span>
                {j.status === "running" && (
                  <button
                    onClick={() =>
                      void bridge.cancel(j.id).catch((e) => setError(String(e)))
                    }
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        </main>
        <aside className="design-chat">
          <label className="design-consent">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
            />
            Enable chat and share selected references with the agent on each
            message
          </label>
          {share ? (
            chat(project.directory, { projectId: p.id, sessionId: s.id })
          ) : (
            <p>
              Chat uses your existing agent login. Generation asks for separate
              spending approval.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
