import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  neutralColor,
  type ColorCorrection,
  fps,
  newClip,
  newSequence,
  newTrack,
  sequenceDuration,
} from "@heis/core";
import type {
  EditorBridge,
  EditorEdit,
  EditorSnapshot,
  EditorJob,
  ProjectAsset,
  TimelineClip,
  Sequence,
  Track,
  RecentEditorProject,
} from "@heis/core";
import { ColorPanel } from "./ColorPanel";
import { Filmstrip } from "./Filmstrip";
import { Preview, assetUrl } from "./Preview";
import { editorTools } from "./tools";
import { GeneratePanel, type GenerationBridge } from "./GeneratePanel";
import "./editor.css";

type ToolRender = (
  id: string,
  projectId: string | null,
  onResult: (urls: string[], jobId: string) => void,
  input?: { url: string; name: string },
) => React.ReactNode;
export interface EditorAppProps {
  bridge: EditorBridge;
  renderTool: ToolRender;
  renderAssistant: (directory: string) => React.ReactNode;
  onLegacy: () => void;
  generationApi?: GenerationBridge;
}
const uuid = () => crypto.randomUUID();
function timecode(frame: number, rate: number) {
  const seconds = Math.floor(frame / rate);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(frame % Math.round(rate)).padStart(2, "0")}`;
}
function savedLayout() {
  try {
    return {
      ...{
        left: 280,
        right: 270,
        bottom: 300,
        assistant: 340,
        assistantOpen: true,
      },
      ...JSON.parse(localStorage.getItem("heis.editor.layout") || "{}"),
    };
  } catch {
    return {
      left: 280,
      right: 270,
      bottom: 300,
      assistant: 340,
      assistantOpen: true,
    };
  }
}

export function EditorApp({
  bridge,
  renderTool,
  renderAssistant,
  onLegacy,
  generationApi,
}: EditorAppProps) {
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null),
    [recent, setRecent] = useState<RecentEditorProject[]>([]),
    [name, setName] = useState("Untitled project");
  const [colorDraft, setColorDraft] = useState<{ id: string; color: ColorCorrection }>();
  const [compareClip, setCompareClip] = useState<string>();
  const [copiedColor, setCopiedColor] = useState<ColorCorrection>();
  const [error, setError] = useState(""),
    [tab, setTab] = useState("Media"),
    [tool, setTool] = useState<string | null>(null),
    [assistant, setAssistant] = useState<boolean>(() => savedLayout().assistantOpen);
  const [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(false),
    [selection, setSelection] = useState<string[]>([]),
    [jobs, setJobs] = useState<EditorJob[]>([]);
  const [zoom, setZoom] = useState(65),
    [snap, setSnap] = useState(true),
    [layout, setLayout] = useState(savedLayout),
    [leftOpen, setLeftOpen] = useState(true),
    [rightOpen, setRightOpen] = useState(true),
    [meter, setMeter] = useState(0);
  const [library, setLibrary] = useState<{
    projectId: string;
    assets: ProjectAsset[];
  } | null>(null);
  const [generation, setGeneration] = useState(false),
    [busy, setBusy] = useState(false),
    [runtime, setRuntime] = useState({
      ffmpeg: true,
      whisper: true,
      model: true,
    });
  const current = useRef(snapshot);
  current.current = snapshot;
  const sequence = snapshot?.project.sequences.find(
      (s) => s.id === snapshot.project.activeSequenceId,
    ),
    clip = sequence?.clips.find((c) => selection.includes(c.id));
  const rate = sequence ? fps(sequence) : 30,
    duration = sequence ? sequenceDuration(sequence) : 1;
  useEffect(() => {
    if (snapshot && sequence && !playing)
      void bridge
        .setContext({
          projectId: snapshot.project.id,
          sequenceId: sequence.id,
          selectedClipIds: selection,
          assetIds: sequence.clips
            .filter((c) => selection.includes(c.id) && c.assetId)
            .map((c) => c.assetId!),
          frame,
        })
        .catch(() => {});
  }, [bridge, snapshot?.project.id, sequence?.id, selection, frame, playing]);
  const report = useCallback(
    (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    [],
  );
  const task = useCallback(
    async (work: () => Promise<unknown>) => {
      try {
        setError("");
        await work();
      } catch (e) {
        report(e);
      }
    },
    [report],
  );
  useEffect(() => {
    void task(async () => {
      setRecent(await bridge.list());
      setRuntime(await bridge.status());
    });
    return bridge.onEvent((event) => {
      if (event.type === "error") report(event.message);
      if (
        event.type === "project" &&
        current.current?.project.id === event.snapshot.project.id
      )
        setSnapshot(event.snapshot);
      if (
        event.type === "job" &&
        current.current?.project.id === event.job.projectId
      )
        setJobs((previous) => [
          event.job,
          ...previous.filter((j) => j.id !== event.job.id),
        ]);
    });
  }, [bridge, task, report]);
  useEffect(() => {
    localStorage.setItem(
      "heis.editor.layout",
      JSON.stringify({ ...layout, assistantOpen: assistant }),
    );
  }, [layout, assistant]);
  useEffect(() => {
    if (!playing || !sequence) return;
    const started = performance.now(),
      initial = frame;
    let request: number;
    const tick = () => {
      const next =
        initial + Math.floor(((performance.now() - started) / 1000) * rate);
      if (next >= duration) {
        setFrame(duration - 1);
        setPlaying(false);
        return;
      }
      setFrame(next);
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, sequence?.id, rate, duration]);
  const command = useCallback(
    async (label: string, edits: EditorEdit[]) => {
      const s = current.current;
      if (!s || !edits.length) return;
      setBusy(true);
      try {
        setError("");
        setSnapshot(
          await bridge.command({
            projectId: s.project.id,
            expectedRevision: s.project.revision,
            label,
            edits,
          }),
        );
      } catch (e) {
        report(e);
      } finally {
        setBusy(false);
      }
    },
    [bridge, report],
  );
  const history = (redo = false) =>
    task(async () => {
      if (!snapshot) return;
      setSnapshot(
        await (redo ? bridge.redo : bridge.undo)(
          snapshot.project.id,
          snapshot.project.revision,
        ),
      );
    });
  const patch = (changes: Partial<TimelineClip>) => {
    if (clip && sequence)
      void command("Edit clip", [
        {
          type: "clip.update",
          sequenceId: sequence.id,
          id: clip.id,
          patch: changes,
        },
      ]);
  };
  const remove = (ripple = false) => {
    if (sequence)
      void command(ripple ? "Ripple delete" : "Delete clips", [
        {
          type: "clip.remove",
          sequenceId: sequence.id,
          ids: selection,
          ripple,
        },
      ]);
    setSelection([]);
  };
  const split = () => {
    if (!clip || !sequence) return;
    void command("Split clip", [
      {
        type: "clip.split",
        sequenceId: sequence.id,
        id: clip.id,
        frame,
        newId: uuid(),
      },
    ]);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        ) ||
        tool ||
        !snapshot
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        void history(e.shiftKey);
      } else if (e.code === "Space") {
        e.preventDefault();
        setPlaying((v) => !v);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        setFrame((v) => Math.min(duration - 1, v + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        setFrame((v) => Math.max(0, v - 1));
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        remove(e.shiftKey);
      } else if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey)
        split();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const open = async (directory?: string) => {
    const result = await bridge.open(directory);
    if (result) {
      setSnapshot(result);
      setJobs(await bridge.jobs(result.project.id));
      setFrame(0);
      setSelection([]);
    }
  };
  const resize = (
    side: "left" | "right" | "bottom" | "assistant",
    e: React.PointerEvent,
  ) => {
    const initial = { ...layout },
      x = e.clientX,
      y = e.clientY;
    const move = (event: PointerEvent) =>
      setLayout({
        ...initial,
        [side]: Math.max(
          side === "bottom" ? 180 : side === "assistant" ? 280 : 200,
          Math.min(
            side === "bottom" ? 600 : 500,
            initial[side] +
              (side === "left" || side === "assistant"
                ? event.clientX - x
                : side === "right"
                  ? x - event.clientX
                  : y - event.clientY),
          ),
        ),
      });
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };
  const addAsset = (asset: ProjectAsset, trackId?: string, start = frame) => {
    if (!sequence) return;
    const edits: EditorEdit[] = [],
      kind = asset.kind === "audio" ? "audio" : "video";
    let track =
      sequence.tracks.find(
        (t) => t.id === trackId && t.kind === kind && !t.locked,
      ) || sequence.tracks.find((t) => t.kind === kind && !t.locked);
    if (!track) {
      track = newTrack(uuid(), kind, kind === "audio" ? "Audio" : "Video");
      edits.push({ type: "track.add", sequenceId: sequence.id, track });
    }
    const added = newClip(
      uuid(),
      track.id,
      start,
      asset.kind === "image"
        ? Math.round(rate * 5)
        : Math.max(1, Math.floor(asset.durationSeconds * rate)),
      asset.name,
    );
    added.assetId = asset.id;
    edits.push({ type: "clip.add", sequenceId: sequence.id, clip: added });
    if (asset.kind === "video" && asset.hasAudio) {
      let audioTrack = sequence.tracks.find(
        (t) => t.kind === "audio" && !t.locked,
      );
      if (!audioTrack) {
        audioTrack = newTrack(uuid(), "audio", "Audio");
        edits.push({
          type: "track.add",
          sequenceId: sequence.id,
          track: audioTrack,
        });
      }
      added.linkId = uuid();
      const audio = {
        ...structuredClone(added),
        id: uuid(),
        trackId: audioTrack.id,
      };
      edits.push({ type: "clip.add", sequenceId: sequence.id, clip: audio });
    }
    void command("Add media to timeline", edits);
    setSelection([added.id]);
  };
  const addText = (caption = false) => {
    if (!sequence) return;
    const track = newTrack(
        uuid(),
        caption ? "caption" : "title",
        caption ? "Captions" : "Titles",
      ),
      added = newClip(
        uuid(),
        track.id,
        frame,
        Math.round(rate * 3),
        caption ? "Caption" : "Title",
      );
    added.y = caption ? 0.88 : 0.5;
    added.text = {
      text: caption ? "Your caption" : "Your title",
      fontSize: caption ? 48 : 80,
      color: "#ffffff",
      background: "transparent",
      align: "center",
      fontFamily: "Heis Sans",
    };
    void command("Add text", [
      { type: "track.add", sequenceId: sequence.id, track },
      { type: "clip.add", sequenceId: sequence.id, clip: added },
    ]);
    setSelection([added.id]);
  };
  const capture = useCallback(
    (projectId: string | null) => (urls: string[], jobId: string) => {
      if (projectId) void task(() => bridge.capture(projectId, urls, jobId));
    },
    [bridge, task],
  );
  const duplicate = () => {
    if (!sequence) return;
    const links = new Map<string, string>();
    const selected = sequence.clips.filter((c) => selection.includes(c.id));
    const linked = new Set(selected.map((c) => c.linkId).filter(Boolean));
    const all = sequence.clips.filter(
      (c) => selection.includes(c.id) || (c.linkId && linked.has(c.linkId)),
    );
    const offset =
      Math.max(...all.map((c) => c.start + c.duration)) -
      Math.min(...all.map((c) => c.start));
    void command(
      "Duplicate clips",
      all.map((c) => {
        if (c.linkId && !links.has(c.linkId)) links.set(c.linkId, uuid());
        return {
          type: "clip.add",
          sequenceId: sequence.id,
          clip: {
            ...structuredClone(c),
            id: uuid(),
            start: c.start + offset,
            linkId: c.linkId ? links.get(c.linkId) : undefined,
          },
        };
      }),
    );
  };
  const transition = () => {
    if (!clip || !sequence) return;
    const previous = sequence.clips
      .filter(
        (c) =>
          c.trackId === clip.trackId &&
          c.id !== clip.id &&
          c.start < clip.start,
      )
      .sort((a, b) => b.start - a.start)[0];
    if (!previous) {
      setError("Select the second of two adjacent clips.");
      return;
    }
    const frames = Math.min(
      Math.round(rate * 0.5),
      clip.duration,
      previous.duration,
    );
    const overlap = previous.start + previous.duration - clip.start;
    if (overlap < 0) {
      setError("Place the clips next to each other first.");
      return;
    }
    void command("Cross dissolve", [
      {
        type: "clip.update",
        sequenceId: sequence.id,
        id: clip.id,
        patch: {
          start: previous.start + previous.duration - frames,
          fadeIn: frames,
        },
      },
      {
        type: "clip.update",
        sequenceId: sequence.id,
        id: previous.id,
        patch: { fadeOut: 0 },
      },
      ...sequence.clips
        .filter(
          (c) =>
            c.id !== previous.id &&
            previous.linkId &&
            c.linkId === previous.linkId,
        )
        .map((c) => ({
          type: "clip.update" as const,
          sequenceId: sequence.id,
          id: c.id,
          linked: false,
          patch: { fadeOut: frames },
        })),
    ]);
  };
  const onMeter = useCallback(
    (value: number) =>
      setMeter((old) => (Math.abs(old - value) > 0.015 ? value : old)),
    [],
  );
  const jobsView = (
    <div className="heis-jobs">
      {jobs.slice(0, 8).map((job) => (
        <div key={job.id} className="heis-job">
          <div>
            <strong>{job.kind}</strong>
            <span>
              {job.status === "running"
                ? `${Math.round(job.progress * 100)}%`
                : job.status}
            </span>
          </div>
          {job.status === "running" && (
            <>
              <progress max={1} value={job.progress} />
              <button onClick={() => void task(() => bridge.cancel(job.id))}>
                Cancel
              </button>
            </>
          )}
          {job.request && ["failed", "cancelled"].includes(job.status) && (
            <button onClick={() => void task(() => bridge.retry(job.id))}>
              Retry
            </button>
          )}
          {job.message && <small>{job.message}</small>}
          {job.output && job.status === "succeeded" && (
            <button onClick={() => void task(() => bridge.reveal(job.id))}>
              Show in Finder
            </button>
          )}
        </div>
      ))}
    </div>
  );
  if (!snapshot)
    return (
      <main className="heis-editor heis-project-home">
        <header className="heis-editor-bar">
          <img className="heis-wordmark" src="/brand/heis-wordmark-dark.svg" alt="Heis" height={26} draggable={false} />
          <div className="heis-bar-spacer" />
          <button onClick={onLegacy}>Standalone tools ↗</button>
        </header>
        <section className="heis-home-content">
          <h1>Make the next cut.</h1>
          <p>Bring your footage, ideas, and sound together.</p>
          <div className="heis-new-project">
            <input
              aria-label="New project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="primary"
              onClick={() =>
                void task(async () => {
                  const result = await bridge.create(name);
                  if (result) {
                    setSnapshot(result);
                    setJobs([]);
                  }
                })
              }
            >
              ＋ New project
            </button>
            <button onClick={() => void task(() => open())}>
              Open project
            </button>
          </div>
          <h2>Recent projects</h2>
          <div className="heis-project-grid">
            {recent.map((p) => (
              <button
                key={p.directory}
                className="heis-project-card"
                onClick={() => void task(() => open(p.directory))}
              >
                <div className="heis-project-cover">▤</div>
                <strong>{p.name}</strong>
                <small>{new Date(p.updatedAt).toLocaleDateString()}</small>
              </button>
            ))}
            {!recent.length && (
              <div className="heis-empty">
                Your projects will appear here.
                <br />
                Everything you import stays with your project.
              </div>
            )}
          </div>
          {!runtime.ffmpeg && (
            <p className="heis-warning">
              Media runtime is not installed. Set up FFmpeg before importing or
              exporting.
            </p>
          )}
        </section>
        {error && (
          <div role="alert" className="heis-error">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
      </main>
    );
  if (!sequence) return null;
  const project = snapshot.project;
  const trackPatch = (track: Track, patch: Partial<Track>) =>
    void command("Edit track", [
      { type: "track.update", sequenceId: sequence.id, id: track.id, patch },
    ]);
  return (
    <main
      className="heis-editor"
      style={
        {
          "--assistant": `${layout.assistant}px`,
          "--left": `${leftOpen ? layout.left : 0}px`,
          "--right": `${rightOpen ? layout.right : 0}px`,
          "--timeline": `${layout.bottom}px`,
        } as React.CSSProperties
      }
    >
      <header className="heis-editor-bar">
        <button
          aria-label="Projects"
          title="Projects"
          onClick={() =>
            void task(async () => {
              setPlaying(false);
              await bridge.close();
              setSnapshot(null);
              setRecent(await bridge.list());
            })
          }
        >
          ▦
        </button>
        <img className="heis-wordmark" src="/brand/heis-wordmark-dark.svg" alt="Heis" height={26} draggable={false} />
        <input
          className="heis-project-title"
          aria-label="Project name"
          key={project.id}
          defaultValue={project.name}
          onBlur={(e) => {
            if (e.target.value !== project.name)
              void command("Rename project", [
                { type: "rename", name: e.target.value },
              ]);
          }}
        />
        <span className="heis-save-status">
          {snapshot.saved ? "Saved" : "Saving…"}
        </span>
        <div className="heis-bar-spacer" />
        <button
          aria-label="Toggle media"
          title="Toggle media"
          onClick={() => setLeftOpen((v) => !v)}
        >
          ◧
        </button>
        <button
          aria-label="Toggle inspector"
          title="Toggle inspector"
          onClick={() => setRightOpen((v) => !v)}
        >
          ◨
        </button>
        <button
          disabled={!snapshot.canUndo || busy}
          onClick={() => void history()}
        >
          ↶
        </button>
        <button
          disabled={!snapshot.canRedo || busy}
          onClick={() => void history(true)}
        >
          ↷
        </button>
        <button
          className={assistant ? "active" : ""}
          aria-expanded={assistant}
          onClick={() => setAssistant((v) => !v)}
        >
          Assistant
        </button>
        <button
          className="primary"
          disabled={!sequence.clips.length}
          onClick={() =>
            void task(async () => {
              setPlaying(false);
              await bridge.export(project.id, sequence.id);
            })
          }
        >
          Export ↗
        </button>
      </header>
      <div className="heis-editor-body">
        <aside
          className="heis-assistant-panel"
          aria-label="Editing assistant"
          hidden={!assistant}
        >
          <header className="heis-assistant-heading">
            <strong>Assistant</strong>
            <button
              aria-label="Collapse assistant"
              onClick={() => setAssistant(false)}
            >
              ‹
            </button>
          </header>
          <div className="heis-assistant">
            {renderAssistant(snapshot.directory)}
          </div>
        </aside>
        {assistant && (
          <div
            className="heis-resize vertical"
            aria-label="Resize assistant"
            onPointerDown={(e) => resize("assistant", e)}
          />
        )}
        <div className="heis-editing-area">
          <section className="heis-workspace">
            <aside className="heis-media-panel" hidden={!leftOpen}>
              <nav className="heis-panel-tabs">
                {["Media", "Captions", "Audio", "Tools"].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </nav>
              {tab === "Media" || tab === "Audio" ? (
                <>
                  <div className="heis-panel-toolbar">
                    <button
                      onClick={() =>
                        void task(() => bridge.importMedia(project.id))
                      }
                    >
                      Import
                    </button>
                    <button
                      className={generation ? "active" : ""}
                      onClick={() => setGeneration((v) => !v)}
                    >
                      Generate
                    </button>
                    <button
                      className={library ? "active" : ""}
                      onClick={() => {
                        if (library) setLibrary(null);
                        else
                          void task(async () =>
                            setLibrary(await bridge.library()),
                          );
                      }}
                    >
                      Library
                    </button>
                    <span>
                      {
                        project.assets.filter(
                          (a) => tab === "Media" || a.kind === "audio",
                        ).length
                      }{" "}
                      assets
                    </span>
                  </div>
                  {library ? (
                    <div className="heis-asset-grid">
                      {library.assets.map((asset) => (
                        <div className="heis-asset" key={asset.id}>
                          {asset.thumbnailPath && (
                            <img
                              src={assetUrl(
                                library.projectId,
                                asset.thumbnailPath,
                              )}
                              alt=""
                            />
                          )}
                          <strong>{asset.name}</strong>
                          <button
                            onClick={() =>
                              void task(async () => {
                                await bridge.importLibrary(
                                  project.id,
                                  asset.id,
                                );
                                setLibrary(null);
                              })
                            }
                          >
                            Use in project
                          </button>
                        </div>
                      ))}
                      {!library.assets.length && (
                        <div className="heis-empty">
                          Standalone creations appear here.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="heis-asset-grid">
                      {project.assets
                        .filter((a) => tab === "Media" || a.kind === "audio")
                        .map((asset) => (
                          <div
                            className="heis-asset"
                            key={asset.id}
                            draggable={!asset.missing}
                            onDragStart={(e) =>
                              e.dataTransfer.setData(
                                "application/heis-asset",
                                asset.id,
                              )
                            }
                          >
                            <button
                              aria-label="Add to timeline"
                              title="Add to timeline"
                              onDoubleClick={() => addAsset(asset)}
                              onClick={() => setSelection([])}
                            >
                              {asset.thumbnailPath ? (
                                <img
                                  src={assetUrl(
                                    project.id,
                                    asset.thumbnailPath,
                                  )}
                                  alt=""
                                />
                              ) : (
                                <div className="heis-audio-art">♫</div>
                              )}
                              <strong>{asset.name}</strong>
                              <small>
                                {asset.kind} ·{" "}
                                {asset.durationSeconds.toFixed(1)}s
                              </small>
                            </button>
                            <div className="heis-asset-actions">
                              <button
                                disabled={asset.missing}
                                onClick={() => addAsset(asset)}
                              >
                                ＋ Add
                              </button>
                              {asset.missing ? (
                                <button
                                  onClick={() =>
                                    void task(() =>
                                      bridge.relink(project.id, asset.id),
                                    )
                                  }
                                >
                                  Relink
                                </button>
                              ) : (
                                clip && (
                                  <button
                                    onClick={() => {
                                      const shorter =
                                        asset.kind !== "image" &&
                                        Math.floor(
                                          asset.durationSeconds * rate,
                                        ) < clip.duration;
                                      if (
                                        shorter &&
                                        !window.confirm(
                                          "This asset is shorter. Trim the selected clip to fit the new source?",
                                        )
                                      )
                                        return;
                                      if (clip.linkId) {
                                        setError(
                                          "Detach linked audio before replacing this clip.",
                                        );
                                        return;
                                      }
                                      patch({
                                        assetId: asset.id,
                                        name: asset.name,
                                        sourceIn: 0,
                                        duration: shorter
                                          ? Math.max(
                                              1,
                                              Math.floor(
                                                asset.durationSeconds * rate,
                                              ),
                                            )
                                          : clip.duration,
                                        fadeIn: 0,
                                        fadeOut: 0,
                                      });
                                    }}
                                  >
                                    Replace
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        ))}
                      {!project.assets.length && (
                        <div className="heis-empty">
                          Import footage to start your edit.
                          <br />
                          Or generate something new.
                        </div>
                      )}
                    </div>
                  )}
                  {generation && generationApi ? (
                    <GeneratePanel api={generationApi} onAdvanced={setTool} />
                  ) : (
                    generation && (
                      <div className="heis-generate">
                        <strong>Create for this project</strong>
                        <div>
                          {["image", "video", "audio", "cinema"].map((id) => (
                            <button key={id} onClick={() => setTool(id)}>
                              {id === "cinema"
                                ? "Cinema"
                                : id[0].toUpperCase() + id.slice(1)}
                            </button>
                          ))}
                        </div>
                        <p>
                          Results are saved to your media library. Add them to
                          the timeline when ready.
                        </p>
                      </div>
                    )
                  )}
                </>
              ) : null}
              {tab === "Captions" && (
                <div className="heis-panel-content">
                  <h3>Tell the whole story.</h3>
                  <button
                    className="primary"
                    onClick={() =>
                      void task(() =>
                        bridge.transcribe(project.id, sequence.id, selection),
                      )
                    }
                  >
                    Transcribe {selection.length ? "selection" : "dialogue"}
                  </button>
                  {(!runtime.whisper || !runtime.model) && (
                    <small>
                      Requires the local Whisper runtime and base model.
                    </small>
                  )}
                  <button onClick={() => addText(true)}>
                    ＋ Manual caption
                  </button>
                  <button
                    onClick={() =>
                      void task(() =>
                        bridge.importCaptions(project.id, sequence.id),
                      )
                    }
                  >
                    Import SRT / VTT
                  </button>
                  <button
                    onClick={() =>
                      void task(() =>
                        bridge.exportCaptions(project.id, sequence.id),
                      )
                    }
                  >
                    Export subtitles
                  </button>
                  {sequence.clips
                    .filter((c) =>
                      sequence.tracks.some(
                        (t) => t.id === c.trackId && t.kind === "caption",
                      ),
                    )
                    .map((c) => (
                      <button
                        key={c.id}
                        className="heis-caption-row"
                        onClick={() => {
                          setSelection([c.id]);
                          setFrame(c.start);
                        }}
                      >
                        <small>
                          {timecode(c.start, rate)}{" "}
                          {c.needsReview ? " · Review timing" : ""}
                        </small>
                        {c.text?.text}
                      </button>
                    ))}
                </div>
              )}
              {tab === "Tools" && (
                <div className="heis-panel-content">
                  {editorTools.map((t) => (
                    <button
                      key={t.id}
                      disabled={!t.available}
                      title={t.note || t.name}
                      onClick={() => setTool(t.id)}
                    >
                      <span>{t.name}</span>
                      <small>{t.available ? t.group : t.note}</small>
                    </button>
                  ))}
                </div>
              )}
              {jobsView}
            </aside>
            <div
              className="heis-resize vertical"
              onPointerDown={(e) => resize("left", e)}
            />
            <div className="heis-preview">
              <div className="heis-preview-heading">
                <span>{sequence.name}</span>
                <small>
                  {sequence.width} × {sequence.height} ·{" "}
                  {rate.toFixed(rate % 1 ? 2 : 0)} fps
                </small>
              </div>
              <div className="heis-preview-surface">
                <Preview
                  project={project}
                  sequence={colorDraft && colorDraft.id === clip?.id ? { ...sequence, clips: sequence.clips.map(c => c.id === colorDraft.id ? { ...c, color: colorDraft.color } : c) } : sequence}
                  frame={frame}
                  playing={playing}
                  onMeter={onMeter}
                  bypassColorClipId={compareClip === clip?.id ? compareClip : undefined}
                />
                {!sequence.clips.length && (
                  <div className="heis-preview-empty">
                    <span>▤</span>
                    <h2>Your story starts here.</h2>
                    <p>Drag media onto the timeline to begin.</p>
                    <button
                      onClick={() =>
                        void task(() => bridge.importMedia(project.id))
                      }
                    >
                      Import footage
                    </button>
                  </div>
                )}
              </div>
              <div className="heis-transport">
                <code>
                  {timecode(frame, rate)}{" "}
                  <span>/ {timecode(duration, rate)}</span>
                </code>
                <div>
                  <button
                    aria-label="Start"
                    title="Start"
                    onClick={() => {
                      setPlaying(false);
                      setFrame(0);
                    }}
                  >
                    ⏮
                  </button>
                  <button
                    aria-label="Previous frame"
                    title="Previous frame"
                    onClick={() => {
                      setPlaying(false);
                      setFrame((v) => Math.max(0, v - 1));
                    }}
                  >
                    ◂
                  </button>
                  <button
                    aria-label="Play or pause"
                    title="Play or pause"
                    className="heis-play"
                    onClick={() => {
                      if (frame >= duration - 1) setFrame(0);
                      setPlaying((v) => !v);
                    }}
                  >
                    {playing ? "Ⅱ" : "▶"}
                  </button>
                  <button
                    aria-label="Next frame"
                    title="Next frame"
                    onClick={() => {
                      setPlaying(false);
                      setFrame((v) => Math.min(duration - 1, v + 1));
                    }}
                  >
                    ▸
                  </button>
                </div>
                <meter title="Audio output" min={0} max={1} value={meter} />
                <button
                  onClick={() => {
                    const canvas = document.querySelector(
                      ".heis-preview canvas",
                    );
                    void canvas?.requestFullscreen();
                  }}
                >
                  Fit ⛶
                </button>
              </div>
            </div>
            <div
              className="heis-resize vertical"
              onPointerDown={(e) => resize("right", e)}
            />
            <aside className="heis-inspector" hidden={!rightOpen}>
              <nav className="heis-panel-tabs">
                <button className="active">Inspector</button>
              </nav>
              <div className="heis-panel-content">
                {clip ? (
                  <>
                    <h3>{clip.name}</h3>
                    <small>
                      {selection.length > 1
                        ? `${selection.length} selected · inspecting first clip`
                        : "Clip properties"}
                    </small>
                    <Field
                      label="Start (frames)"
                      value={clip.start}
                      min={0}
                      onChange={(v) => patch({ start: Math.round(v) })}
                    />
                    <Field
                      label="Duration (frames)"
                      value={clip.duration}
                      min={1}
                      onChange={(v) => patch({ duration: Math.round(v) })}
                    />
                    {clip.assetId && (
                      <Field
                        label="Source in (frames)"
                        value={clip.sourceIn}
                        min={0}
                        onChange={(v) => patch({ sourceIn: Math.round(v) })}
                      />
                    )}
                    {clip.text && (
                      <>
                        <textarea
                          aria-label="Text"
                          key={`${clip.id}-text`}
                          defaultValue={clip.text.text}
                          onBlur={(e) =>
                            patch({
                              text: { ...clip.text!, text: e.target.value },
                            })
                          }
                        />
                        <Field
                          label="Font size"
                          value={clip.text.fontSize}
                          min={8}
                          max={500}
                          onChange={(v) =>
                            patch({ text: { ...clip.text!, fontSize: v } })
                          }
                        />
                        <label>
                          Font
                          <select
                            value={clip.text.fontFamily}
                            onChange={(e) =>
                              patch({
                                text: {
                                  ...clip.text!,
                                  fontFamily: e.target.value,
                                },
                              })
                            }
                          >
                            {[
                              "Heis Sans",
                              "Arial",
                              "Georgia",
                              "Times New Roman",
                              "monospace",
                            ].map((font) => (
                              <option key={font} value={font}>
                                {font}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Color
                          <input
                            type="color"
                            value={clip.text.color}
                            onChange={(e) =>
                              patch({
                                text: { ...clip.text!, color: e.target.value },
                              })
                            }
                          />
                        </label>
                        <label>
                          Background
                          <input
                            aria-label="Text background"
                            defaultValue={clip.text.background}
                            key={`${clip.id}-bg`}
                            onBlur={(e) =>
                              patch({
                                text: {
                                  ...clip.text!,
                                  background: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          Alignment
                          <select
                            value={clip.text.align}
                            onChange={(e) =>
                              patch({
                                text: {
                                  ...clip.text!,
                                  align: e.target.value as
                                    | "left"
                                    | "center"
                                    | "right",
                                },
                              })
                            }
                          >
                            {["left", "center", "right"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    {project.assets.some(a => a.id === clip.assetId && a.kind !== "audio") && <>
                      <h4>Color</h4>
                      <ColorPanel key={clip.id} value={clip.color} disabled={busy}
                        onPreview={color => { setColorDraft(color ? { id: clip.id, color } : undefined); if (color) setCompareClip(undefined); }}
                        onCommit={color => command("Adjust color", [{ type: "clip.update", sequenceId: sequence.id, id: clip.id, linked: false, patch: { color } }])} />
                      <button aria-pressed={compareClip === clip.id} onClick={() => setCompareClip(compareClip === clip.id ? undefined : clip.id)}>{compareClip === clip.id ? "Show corrected" : "Show original"}</button>
                      <button onClick={() => { setCompareClip(undefined); patch({ color: { ...neutralColor } }); }}>Reset color</button>
                      <button onClick={() => setCopiedColor({ ...neutralColor, ...clip.color })}>Copy color</button>
                      <button disabled={!copiedColor} onClick={() => { setCompareClip(undefined); void command("Paste color", sequence.clips.filter(c => selection.includes(c.id) && project.assets.some(a => a.id === c.assetId && a.kind !== "audio")).map(c => ({ type: "clip.update" as const, sequenceId: sequence.id, id: c.id, linked: false, patch: { color: { ...copiedColor! } } }))); }}>Paste color to selected</button>
                    </>}
                    <h4>Transform</h4>
                    <Field
                      label="X (%)"
                      value={clip.x * 100}
                      onChange={(v) => patch({ x: v / 100 })}
                    />
                    <Field
                      label="Y (%)"
                      value={clip.y * 100}
                      onChange={(v) => patch({ y: v / 100 })}
                    />
                    <Field
                      label="Scale (%)"
                      value={clip.scale * 100}
                      min={1}
                      max={2000}
                      onChange={(v) => patch({ scale: v / 100 })}
                    />
                    <Field
                      label="Rotation"
                      value={clip.rotation}
                      onChange={(v) => patch({ rotation: v })}
                    />
                    <Field
                      label="Opacity (%)"
                      value={clip.opacity * 100}
                      min={0}
                      max={100}
                      onChange={(v) => patch({ opacity: v / 100 })}
                    />
                    <label>
                      Sizing
                      <select
                        value={clip.fit}
                        onChange={(e) =>
                          patch({ fit: e.target.value as "fit" | "fill" })
                        }
                      >
                        <option value="fit">Fit</option>
                        <option value="fill">Fill</option>
                      </select>
                    </label>
                    {(["left", "right", "top", "bottom"] as const).map(
                      (side) => (
                        <Field
                          key={side}
                          label={`Crop ${side} (%)`}
                          value={clip.crop[side] * 100}
                          min={0}
                          max={99}
                          onChange={(v) =>
                            patch({ crop: { ...clip.crop, [side]: v / 100 } })
                          }
                        />
                      ),
                    )}
                    <h4>Audio and fades</h4>
                    <Field
                      label="Volume (%)"
                      value={clip.volume * 100}
                      min={0}
                      max={400}
                      onChange={(v) => patch({ volume: v / 100 })}
                    />
                    <label>
                      Mute
                      <input
                        type="checkbox"
                        checked={clip.muted}
                        onChange={(e) => patch({ muted: e.target.checked })}
                      />
                    </label>
                    <Field
                      label="Fade in (frames)"
                      value={clip.fadeIn}
                      min={0}
                      onChange={(v) => patch({ fadeIn: Math.round(v) })}
                    />
                    <Field
                      label="Fade out (frames)"
                      value={clip.fadeOut}
                      min={0}
                      onChange={(v) => patch({ fadeOut: Math.round(v) })}
                    />
                    <button onClick={transition}>
                      Cross dissolve with previous
                    </button>
                    {clip.linkId && (
                      <button onClick={() => patch({ linkId: "" })}>
                        Detach linked audio
                      </button>
                    )}
                    <h4>Clip tools</h4>
                    {editorTools
                      .filter((t) => t.group === "Clip" && t.available)
                      .map((t) => (
                        <button key={t.id} onClick={() => setTool(t.id)}>
                          {t.name} ↗
                        </button>
                      ))}
                  </>
                ) : (
                  <>
                    <h3>Project settings</h3>
                    <label>
                      Canvas
                      <select
                        value={`${sequence.width}x${sequence.height}`}
                        onChange={(e) => {
                          const [width, height] = e.target.value
                            .split("x")
                            .map(Number);
                          void command("Canvas preset", [
                            {
                              type: "sequence.update",
                              id: sequence.id,
                              patch: { width, height },
                            },
                          ]);
                        }}
                      >
                        <option value="1920x1080">
                          Landscape · 1920 × 1080
                        </option>
                        <option value="1080x1920">
                          Portrait · 1080 × 1920
                        </option>
                        <option value="1080x1080">Square · 1080 × 1080</option>
                        {!["1920x1080", "1080x1920", "1080x1080"].includes(
                          `${sequence.width}x${sequence.height}`,
                        ) && (
                          <option
                            value={`${sequence.width}x${sequence.height}`}
                          >
                            Custom
                          </option>
                        )}
                      </select>
                    </label>
                    <Field
                      label="Width"
                      value={sequence.width}
                      min={2}
                      max={7680}
                      step={2}
                      onChange={(v) =>
                        void command("Canvas width", [
                          {
                            type: "sequence.update",
                            id: sequence.id,
                            patch: { width: v },
                          },
                        ])
                      }
                    />
                    <Field
                      label="Height"
                      value={sequence.height}
                      min={2}
                      max={7680}
                      step={2}
                      onChange={(v) =>
                        void command("Canvas height", [
                          {
                            type: "sequence.update",
                            id: sequence.id,
                            patch: { height: v },
                          },
                        ])
                      }
                    />
                    <label>
                      Frame rate
                      <select
                        disabled={sequence.clips.length > 0}
                        value={sequence.frameRate.numerator}
                        onChange={(e) =>
                          void command("Frame rate", [
                            {
                              type: "sequence.update",
                              id: sequence.id,
                              patch: {
                                frameRate: {
                                  numerator: Number(e.target.value),
                                  denominator: 1,
                                },
                              },
                            },
                          ])
                        }
                      >
                        {[24, 25, 30, 50, 60].map((v) => (
                          <option key={v} value={v}>
                            {v} fps
                          </option>
                        ))}
                      </select>
                    </label>
                    <small>Set frame rate before adding clips.</small>
                    <h4>Tracks</h4>
                    {(["video", "audio", "title", "caption"] as const).map(
                      (kind) => (
                        <button
                          key={kind}
                          onClick={() =>
                            void command("Add track", [
                              {
                                type: "track.add",
                                sequenceId: sequence.id,
                                track: newTrack(
                                  uuid(),
                                  kind,
                                  `${kind[0].toUpperCase() + kind.slice(1)} ${sequence.tracks.filter((t) => t.kind === kind).length + 1}`,
                                ),
                              },
                            ])
                          }
                        >
                          ＋ {kind} track
                        </button>
                      ),
                    )}
                  </>
                )}
              </div>
            </aside>
          </section>
          <div
            className="heis-resize horizontal"
            onPointerDown={(e) => resize("bottom", e)}
          />
          <section className="heis-timeline">
            <div className="heis-sequence-tabs">
              {project.sequences.map((s) => (
                <button
                  key={s.id}
                  className={s.id === sequence.id ? "active" : ""}
                  onClick={() => {
                    setPlaying(false);
                    setFrame(0);
                    setSelection([]);
                    void command("Switch sequence", [
                      { type: "sequence.select", id: s.id },
                    ]);
                  }}
                  onDoubleClick={() => {
                    const name = window.prompt("Sequence name", s.name);
                    if (name)
                      void command("Rename sequence", [
                        { type: "sequence.update", id: s.id, patch: { name } },
                      ]);
                  }}
                >
                  {s.name}
                </button>
              ))}
              <button
                aria-label="New sequence"
                title="New sequence"
                onClick={() => {
                  setFrame(0);
                  setSelection([]);
                  void command("New sequence", [
                    {
                      type: "sequence.add",
                      sequence: newSequence(
                        uuid(),
                        `Sequence ${project.sequences.length + 1}`,
                      ),
                    },
                  ]);
                }}
              >
                ＋
              </button>
            </div>
            <div className="heis-timeline-toolbar">
              <button
                aria-label="Split (S)"
                title="Split (S)"
                disabled={!clip}
                onClick={split}
              >
                ✂ Split
              </button>
              <button disabled={!clip} onClick={duplicate}>
                Duplicate
              </button>
              <button disabled={!clip} onClick={() => remove()}>
                Delete
              </button>
              <button disabled={!clip} onClick={() => remove(true)}>
                Ripple delete
              </button>
              <button onClick={() => addText()}>T Title</button>
              <button
                className={snap ? "active" : ""}
                onClick={() => setSnap((v) => !v)}
              >
                Snap
              </button>
              <div className="heis-bar-spacer" />
              <small>Timeline zoom</small>
              <input
                aria-label="Timeline zoom"
                type="range"
                min={10}
                max={200}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </div>
            <Timeline
              sequence={sequence}
              frame={frame}
              zoom={zoom}
              snap={snap}
              selection={selection}
              setSelection={setSelection}
              seek={(v) => {
                setPlaying(false);
                setFrame(v);
              }}
              onCommand={command}
              trackPatch={trackPatch}
              onDrop={(id, track, start) => {
                const asset = project.assets.find((a) => a.id === id);
                if (asset) addAsset(asset, track, start);
              }}
              projectId={project.id}
              assets={project.assets}
            />
          </section>
        </div>
      </div>
      {error && (
        <div role="alert" className="heis-error">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {tool && (
        <div className="heis-tool-workspace">
          <header>
            <button onClick={() => setTool(null)}>← Back to edit</button>
            <strong>{editorTools.find((t) => t.id === tool)?.name}</strong>
            <small>Results will be saved to {project.name}</small>
          </header>
          <div>
            {renderTool(
              tool,
              project.id,
              capture(project.id),
              clip?.assetId
                ? {
                    url: assetUrl(
                      project.id,
                      project.assets.find((a) => a.id === clip.assetId)!.path,
                    ),
                    name: project.assets.find((a) => a.id === clip.assetId)!
                      .name,
                  }
                : undefined,
            )}
          </div>
        </div>
      )}
    </main>
  );
}
function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        aria-label={label}
        key={`${label}-${value}`}
        defaultValue={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n !== value) onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function Timeline({
  sequence,
  frame,
  zoom,
  snap,
  selection,
  setSelection,
  seek,
  onCommand,
  trackPatch,
  onDrop,
  assets,
  projectId,
}: {
  sequence: Sequence;
  frame: number;
  zoom: number;
  snap: boolean;
  selection: string[];
  setSelection: (ids: string[]) => void;
  seek: (f: number) => void;
  onCommand: (label: string, edits: EditorEdit[]) => Promise<void>;
  trackPatch: (track: Track, patch: Partial<Track>) => void;
  onDrop: (assetId: string, trackId: string, start: number) => void;
  assets: ProjectAsset[];
  projectId: string;
}) {
  const rate = fps(sequence),
    px = zoom / rate,
    width = Math.max(1200, (sequenceDuration(sequence) / rate + 10) * zoom),
    [ghost, setGhost] = useState<{
      id: string;
      delta: number;
      mode: string;
      dy: number;
      targetTrackId: string;
      valid: boolean;
      ids: string[];
      starts: Record<string, number>;
      originTrackId: string;
    } | null>(null);
  const [trackDrag, setTrackDrag] = useState<{
    id: string;
    from: number;
    to: number;
    dy: number;
    height: number;
    order: string[];
  } | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => () => dragCleanup.current?.(), []);
  const visualTracks = trackDrag
    ? trackDrag.order
        .map((id) => sequence.tracks.find((t) => t.id === id)!)
        .filter(Boolean)
    : [...sequence.tracks].reverse();
  const reorderTrack = (event: React.PointerEvent, track: Track) => {
    if (event.button !== 0 || !event.isPrimary || track.locked) return;
    event.preventDefault();
    event.stopPropagation();
    dragCleanup.current?.();
    const grabbed = event.currentTarget;
    grabbed.setPointerCapture(event.pointerId);
    const order = visualTracks.map((t) => t.id);
    const from = visualTracks.findIndex((t) => t.id === track.id),
      y = event.clientY;
    const height = event.currentTarget
      .closest(".heis-track")!
      .getBoundingClientRect().height;
    let to = from,
      dy = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      dy = e.clientY - y;
      to = Math.max(
        0,
        Math.min(visualTracks.length - 1, from + Math.round(dy / height)),
      );
      setTrackDrag({ id: track.id, from, to, dy, height, order });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      if (grabbed.hasPointerCapture(event.pointerId))
        grabbed.releasePointerCapture(event.pointerId);
      dragCleanup.current = null;
    };
    const cancel = () => {
      cleanup();
      setTrackDrag(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      cleanup();
      if (to === from) {
        setTrackDrag(null);
        return;
      }
      setTrackDrag({
        id: track.id,
        from,
        to,
        dy: (to - from) * height,
        height,
        order,
      });
      void onCommand("Reorder track", [
        {
          type: "track.move",
          sequenceId: sequence.id,
          id: track.id,
          index: visualTracks.length - 1 - to,
        },
      ]).finally(() => setTrackDrag(null));
    };
    dragCleanup.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    setTrackDrag({ id: track.id, from, to, dy, height, order });
  };
  const timeline = useRef<HTMLDivElement>(null);
  const scrubPointer = useRef<number | null>(null);
  const lastFrame = Math.max(0, sequenceDuration(sequence) - 1);
  const scrubTo = (clientX: number) => {
    const rect = timeline.current?.getBoundingClientRect();
    if (rect)
      seek(
        Math.min(
          lastFrame,
          Math.max(0, Math.round((clientX - rect.left - 150) / px)),
        ),
      );
  };
  const scrubEvents = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      e.stopPropagation();
      scrubPointer.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      scrubTo(e.clientX);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (scrubPointer.current === e.pointerId) scrubTo(e.clientX);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (scrubPointer.current !== e.pointerId) return;
      scrubTo(e.clientX);
      scrubPointer.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    onPointerCancel: () => {
      scrubPointer.current = null;
    },
    onLostPointerCapture: () => {
      scrubPointer.current = null;
    },
  };
  const drag = (
    event: React.PointerEvent,
    clip: TimelineClip,
    mode: "move" | "left" | "right",
  ) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    dragCleanup.current?.();
    if (sequence.tracks.find((t) => t.id === clip.trackId)?.locked) return;
    const ids = event.shiftKey
      ? [...new Set([...selection, clip.id])]
      : selection.includes(clip.id)
        ? selection
        : [clip.id];
    setSelection(ids);
    const grabbed = event.currentTarget;
    grabbed.setPointerCapture(event.pointerId);
    const x = event.clientX,
      y = event.clientY;
    const scroller = timeline.current?.parentElement;
    const scrollX = scroller?.scrollLeft || 0,
      scrollY = scroller?.scrollTop || 0;
    const links = new Set(
      sequence.clips
        .filter((c) => ids.includes(c.id))
        .map((c) => c.linkId)
        .filter(Boolean),
    );
    const moving = sequence.clips.filter(
      (c) => ids.includes(c.id) || (c.linkId && links.has(c.linkId)),
    );
    if (
      moving.some(
        (c) => sequence.tracks.find((t) => t.id === c.trackId)?.locked,
      )
    )
      return;
    let delta = 0,
      dy = 0,
      valid = true,
      targetTrackId = clip.trackId;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      const target = Array.from(
        timeline.current?.querySelectorAll<HTMLElement>("[data-track-id]") ||
          [],
      ).find((el) => {
        const r = el.getBoundingClientRect();
        return (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        );
      })?.dataset.trackId;
      const targetTrack = sequence.tracks.find((t) => t.id === target);
      valid =
        mode !== "move" ||
        Boolean(
          targetTrack &&
            !targetTrack.locked &&
            targetTrack.kind ===
              sequence.tracks.find((t) => t.id === clip.trackId)?.kind &&
            (ids.length === 1 || target === clip.trackId),
        );
      targetTrackId = valid && target ? target : clip.trackId;
      delta = Math.round(
        (e.clientX - x + (scroller?.scrollLeft || 0) - scrollX) / px,
      );
      dy =
        mode === "move" && ids.length === 1
          ? e.clientY - y + (scroller?.scrollTop || 0) - scrollY
          : 0;
      if (mode === "move")
        delta = Math.max(-Math.min(...moving.map((c) => c.start)), delta);
      if (snap && mode === "move") {
        const target = clip.start + delta;
        const positions = [
          frame,
          ...sequence.clips
            .filter((c) => !ids.includes(c.id))
            .flatMap((c) => [c.start, c.start + c.duration]),
        ];
        const near = positions.find((v) => Math.abs(v - target) * px < 8);
        if (near !== undefined) delta = near - clip.start;
      }
      setGhost({
        id: clip.id,
        delta,
        mode,
        dy,
        targetTrackId,
        valid,
        ids: moving.map((c) => c.id),
        starts: Object.fromEntries(moving.map((c) => [c.id, c.start])),
        originTrackId: clip.trackId,
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      if (grabbed.hasPointerCapture(event.pointerId))
        grabbed.releasePointerCapture(event.pointerId);
      dragCleanup.current = null;
    };
    const cancel = () => {
      cleanup();
      setGhost(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      cleanup();
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (!valid || (!delta && targetTrackId === clip.trackId)) {
        setGhost(null);
        return;
      }
      if (mode === "move") {
        const linked = new Set<string>();
        const edits: EditorEdit[] = [];
        for (const c of sequence.clips.filter((c) => ids.includes(c.id))) {
          if (c.linkId && linked.has(c.linkId)) continue;
          if (c.linkId) linked.add(c.linkId);
          edits.push({
            type: "clip.update",
            sequenceId: sequence.id,
            id: c.id,
            patch: {
              start: c.start + delta,
              ...(ids.length === 1 ? { trackId: targetTrackId } : {}),
            },
          });
        }
        void onCommand("Move clips", edits).finally(() => setGhost(null));
      } else {
        const patch =
          mode === "left"
            ? {
                start: clip.start + delta,
                sourceIn: clip.assetId ? clip.sourceIn + delta : 0,
                duration: clip.duration - delta,
              }
            : { duration: clip.duration + delta };
        void onCommand("Trim clip", [
          { type: "clip.update", sequenceId: sequence.id, id: clip.id, patch },
        ]).finally(() => setGhost(null));
      }
    };
    dragCleanup.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
  };
  return (
    <div
      className="heis-timeline-scroll"
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div
        ref={timeline}
        className={`heis-timeline-inner ${trackDrag ? "reordering-tracks" : ""}`}
        style={{ width: width + 150 }}
      >
        <div className="heis-ruler">
          <div className="heis-track-label">TRACKS</div>
          <div style={{ width }} className="heis-scrub-ruler" {...scrubEvents}>
            {Array.from({ length: Math.ceil(width / zoom / 2) }, (_, i) => (
              <span key={i} style={{ left: i * zoom * 2 }}>
                {timecode(Math.round(i * 2 * rate), rate)}
              </span>
            ))}
          </div>
        </div>
        {visualTracks.map((track, index) => (
          <div
            className={`heis-track ${track.locked ? "locked" : ""} ${trackDrag?.id === track.id ? "reordering" : ""}`}
            data-track-row={track.id}
            style={
              trackDrag
                ? {
                    transform: `translateY(${trackDrag.id === track.id ? trackDrag.dy : trackDrag.from < trackDrag.to && index > trackDrag.from && index <= trackDrag.to ? -trackDrag.height : trackDrag.from > trackDrag.to && index >= trackDrag.to && index < trackDrag.from ? trackDrag.height : 0}px)`,
                  }
                : undefined
            }
            key={track.id}
          >
            <div className="heis-track-label">
              <button
                className="heis-track-grip"
                aria-label={`Move track ${track.name}`}
                title="Drag to reorder track"
                disabled={track.locked}
                onPointerDown={(e) => reorderTrack(e, track)}
              >
                ⠿
              </button>
              <strong>{track.name}</strong>
              <div>
                <button
                  aria-label="Lock track"
                  title="Lock track"
                  className={track.locked ? "active" : ""}
                  onClick={() => trackPatch(track, { locked: !track.locked })}
                >
                  {track.locked ? "●" : "○"}
                </button>
                <button
                  title={track.kind === "audio" ? "Mute track" : "Hide track"}
                  className={track.hidden || track.muted ? "active" : ""}
                  onClick={() =>
                    trackPatch(
                      track,
                      track.kind === "audio"
                        ? { muted: !track.muted }
                        : { hidden: !track.hidden },
                    )
                  }
                >
                  {track.kind === "audio" ? "M" : "◉"}
                </button>
                {track.kind === "audio" && (
                  <select
                    aria-label="Audio role"
                    value={track.role}
                    onChange={(e) =>
                      trackPatch(track, {
                        role: e.target.value as Track["role"],
                      })
                    }
                  >
                    <option value="dialogue">Dialogue</option>
                    <option value="music">Music</option>
                    <option value="sfx">SFX</option>
                  </select>
                )}
              </div>
              {track.kind === "audio" && (
                <input
                  aria-label="Track volume"
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={track.volume}
                  onChange={(e) =>
                    trackPatch(track, { volume: Number(e.target.value) })
                  }
                />
              )}
            </div>
            <div
              className={`heis-track-lane ${ghost?.mode === "move" && ghost.valid && ghost.targetTrackId === track.id ? "drop-target" : ""}`}
              data-track-id={track.id}
              style={{ width }}
              onClick={() => setSelection([])}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("application/heis-asset");
                if (id)
                  onDrop(
                    id,
                    track.id,
                    Math.max(
                      0,
                      Math.round(
                        (e.clientX -
                          e.currentTarget.getBoundingClientRect().left) /
                          px,
                      ),
                    ),
                  );
              }}
            >
              {ghost?.mode === "move" &&
                ghost.valid &&
                ghost.targetTrackId === track.id && (
                  <div
                    className="heis-drop-preview"
                    style={{
                      left: (ghost.starts[ghost.id] + ghost.delta) * px,
                      width: Math.max(
                        8,
                        (sequence.clips.find((c) => c.id === ghost.id)
                          ?.duration || 1) * px,
                      ),
                    }}
                  />
                )}
              {sequence.clips
                .filter((c) => c.trackId === track.id)
                .map((c) => {
                  const g =
                      ghost &&
                      (ghost.id === c.id ||
                        (ghost.mode === "move" && ghost.ids.includes(c.id)))
                        ? ghost
                        : null,
                    start =
                      (g?.starts[c.id] ?? c.start) +
                      (g && g.mode !== "right" ? g.delta : 0),
                    length =
                      c.duration +
                      (g && g.mode === "right"
                        ? g.delta
                        : g && g.mode === "left"
                          ? -g.delta
                          : 0),
                    asset = assets.find((a) => a.id === c.assetId);
                  return (
                    <div
                      key={c.id}
                      className={`heis-timeline-clip ${track.kind} ${selection.includes(c.id) ? "selected" : ""} ${g?.mode === "move" ? "dragging" : ""} ${g && !g.valid ? "invalid-drop" : ""}`}
                      data-clip-id={c.id}
                      style={{
                        left: start * px,
                        transform:
                          g?.mode === "move" &&
                          g.id === c.id &&
                          c.trackId === g.originTrackId
                            ? `translateY(${g.dy}px)`
                            : undefined,
                        width: Math.max(8, length * px),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelection(
                          e.shiftKey
                            ? [...new Set([...selection, c.id])]
                            : [c.id],
                        );
                      }}
                      onPointerDown={(e) => drag(e, c, "move")}
                    >
                      <span
                        className="heis-trim left"
                        onPointerDown={(e) => drag(e, c, "left")}
                      />
                      {track.kind === "video" && asset && !asset.missing && <>
                        {asset.thumbnailPath && <img className="heis-filmstrip" src={assetUrl(projectId, asset.thumbnailPath)} alt="" draggable={false} />}
                        {asset.kind === "video" && <Filmstrip
                          src={assetUrl(projectId, asset.proxyPath || asset.path)}
                          sourceIn={(c.sourceIn + (g?.mode === "left" ? g.delta : 0)) / rate}
                          duration={length / rate}
                          sourceDuration={asset.durationSeconds}
                          width={length * px}
                        />}
                      </>}
                      <strong>{c.text?.text || c.name}</strong>
                      {asset?.waveform && track.kind === "audio" && (
                        <svg viewBox="0 0 1000 26" preserveAspectRatio="none">
                          {asset.waveform
                            .filter(
                              (_, i) =>
                                i %
                                  Math.max(
                                    1,
                                    Math.floor(asset.waveform!.length / 150),
                                  ) ===
                                0,
                            )
                            .map((v, i, all) => (
                              <line
                                key={i}
                                x1={(i / all.length) * 1000}
                                x2={(i / all.length) * 1000}
                                y1={13 - v * 13}
                                y2={13 + v * 13}
                                stroke="currentColor"
                                strokeWidth={3}
                              />
                            ))}
                        </svg>
                      )}
                      {c.linkId && <small>↔</small>}
                      <span
                        className="heis-trim right"
                        onPointerDown={(e) => drag(e, c, "right")}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
        <div
          className="heis-playhead"
          style={{ left: 150 + frame * px }}
          role="slider"
          aria-label="Timeline playhead"
          aria-valuemin={0}
          aria-valuemax={lastFrame}
          aria-valuenow={frame}
          aria-valuetext={timecode(frame, rate)}
          tabIndex={0}
          {...scrubEvents}
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
              return;
            e.preventDefault();
            e.stopPropagation();
            seek(
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? lastFrame
                  : Math.max(
                      0,
                      Math.min(
                        lastFrame,
                        frame + (e.key === "ArrowRight" ? 1 : -1),
                      ),
                    ),
            );
          }}
        >
          <span />
        </div>
      </div>
    </div>
  );
}
