import React, { useEffect, useRef, useState } from "react";
import {
  getCapability,
  reserveCredits,
  validateHighlightRequest,
} from "@heis/core";
import type {
  EditorBridge,
  EditorJob,
  GenerationJob,
  GenerationRequest,
  ResultEnvelope,
  HighlightRequest,
  RankedHighlight,
} from "@heis/core";
import "./clipping.css";
interface AnalysisAPI {
  submit(request: GenerationRequest): Promise<ResultEnvelope<GenerationJob>>;
  getJob(mode: "managed", id: string): Promise<ResultEnvelope<GenerationJob>>;
  cancel(mode: "managed", id: string): Promise<ResultEnvelope<void>>;
}
type Source = { url: string; name: string };
type SavedAnalysis = {
  id: string;
  duration: number;
  highlights?: RankedHighlight[];
};
const unwrap = <T,>(r: ResultEnvelope<T>): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));
const key = (url: string) => `heis-highlights:${url}`;
function readSaved(url: string): SavedAnalysis | null {
  try {
    return JSON.parse(localStorage.getItem(key(url)) || "null");
  } catch {
    return null;
  }
}
function save(url: string, data: SavedAnalysis) {
  localStorage.setItem(key(url), JSON.stringify(data));
}
export function ClippingWorkspace({
  bridge,
  api,
  input,
}: {
  bridge: EditorBridge;
  api: AnalysisAPI;
  input?: Source;
}) {
  const [source, setSource] = useState<Source | undefined>(input);
  const [library, setLibrary] = useState<Source[]>([]);
  const [transcript, setTranscript] =
    useState<HighlightRequest["transcript"]>();
  const [highlights, setHighlights] = useState<RankedHighlight[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [count, setCount] = useState(3),
    [minimum, setMinimum] = useState(15),
    [maximum, setMaximum] = useState(60);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [pendingLocal, setPendingLocal] = useState<EditorJob>();
  const [saved, setSaved] = useState<SavedAnalysis | null>(null);
  const active = useRef<{ local?: string; remote?: string }>({});
  const alive = useRef(true),
    player = useRef<HTMLVideoElement>(null),
    previewEnd = useRef<number | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    void bridge
      .library()
      .then((l) =>
        setLibrary(
          l.assets
            .filter((a) => a.kind === "video")
            .map((a) => ({
              name: a.name,
              url: `heis-project://${l.projectId}/${a.path.split("/").map(encodeURIComponent).join("/")}`,
            })),
        ),
      )
      .catch((e) => setError(String(e)));
  }, [bridge]);
  useEffect(() => {
    let abandoned = false;
    setTranscript(undefined);
    setHighlights([]);
    setSelected([]);
    setPendingLocal(undefined);
    setError("");
    setMessage("");
    if (!source) return;
    const previous = readSaved(source.url);
    setSaved(previous);
    if (previous?.highlights) {
      setHighlights(previous.highlights);
      setSelected(previous.highlights.map((_, i) => i));
    }
    void bridge
      .jobs(new URL(source.url).hostname)
      .then((jobs) => {
        if (abandoned) return;
        const matching = jobs.filter(
          (j) => j.request?.sourceUrl === source.url,
        );
        const ready = matching
          .filter(
            (j) => j.kind === "source-transcript" && j.status === "succeeded",
          )
          .at(-1);
        if (ready?.transcript) setTranscript(ready.transcript);
        setPendingLocal(matching.filter((j) => j.status === "running").at(-1));
      })
      .catch((e) => {
        if (!abandoned) setError(String(e));
      });
    return () => {
      abandoned = true;
    };
  }, [source?.url, bridge]);
  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      active.current = {};
      if (alive.current) setBusy(false);
    }
  };
  async function waitLocal(job: EditorJob) {
    active.current = { local: job.id };
    while (alive.current) {
      const current = (await bridge.jobs(job.projectId)).find(
        (j) => j.id === job.id,
      );
      if (!current) throw new Error("Local job is missing. Start again.");
      setMessage(current.message || "Processing locally…");
      if (current.status === "succeeded") {
        if (current.transcript) setTranscript(current.transcript);
        setPendingLocal(undefined);
        return;
      }
      if (current.status !== "running")
        throw new Error(current.message || `Job ${current.status}`);
      await pause();
    }
  }
  async function collectAnalysis(record: SavedAnalysis, origin: Source) {
    active.current = { remote: record.id };
    for (let i = 0; i < 900 && alive.current; i++) {
      const job = unwrap(await api.getJob("managed", record.id));
      if (job.status === "failed" || job.status === "cancelled")
        throw new Error(
          job.error?.message ||
            (job as GenerationJob & { error_message?: string }).error_message ||
            `Analysis ${job.status}`,
        );
      if (job.status === "succeeded") {
        if (!job.outputs[0]?.url) throw new Error("Analysis has no result.");
        const response = await fetch(job.outputs[0].url);
        if (!response.ok)
          throw new Error("Could not download analysis. Resume to retry.");
        const data = await response.json();
        if (
          !Array.isArray(data.highlights) ||
          data.highlights.length > 10 ||
          data.highlights.some(
            (h: RankedHighlight) =>
              !Number.isFinite(h.start) ||
              !Number.isFinite(h.end) ||
              h.start < 0 ||
              h.end <= h.start ||
              h.end > record.duration ||
              typeof h.title !== "string" ||
              typeof h.reason !== "string" ||
              !Number.isFinite(h.score),
          )
        )
          throw new Error("Invalid highlight response.");
        const completed = { ...record, highlights: data.highlights };
        save(origin.url, completed);
        setSaved(completed);
        setHighlights(data.highlights);
        setSelected(data.highlights.map((_: unknown, index: number) => index));
        setMessage(
          data.highlights.length
            ? "Review the suggestions before creating clips."
            : "No suitable highlights matched these settings. Try a wider duration range.",
        );
        return;
      }
      setMessage("AI is ranking the spoken moments…");
      await pause();
    }
    if (alive.current)
      throw new Error(
        "Analysis is still pending. Resume later without submitting a new paid request.",
      );
  }
  async function analyze() {
    if (!source || !transcript) return;
    const request = validateHighlightRequest({
      transcript,
      count,
      minDuration: minimum,
      maxDuration: maximum,
    });
    const estimate = reserveCredits(
      getCapability("heis-highlight-analysis")!.maximumEstimatedCostUsd,
    );
    if (
      !window.confirm(
        `Send this transcript to Heis's analysis provider and reserve up to ${estimate} credits? Video stays local. Unused credits are returned after completion.`,
      )
    )
      return;
    const job = unwrap(
      await api.submit({
        operation: "rank-highlights",
        modelId: "heis-highlight-analysis",
        inputs: { ...request },
        billing: {
          mode: "managed",
          accountId: "desktop",
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    );
    const record = { id: job.id, duration: request.transcript.duration };
    save(source.url, record);
    setSaved(record);
    await collectAnalysis(record, source);
  }
  const preview = (h: RankedHighlight) => {
    if (player.current) {
      player.current.currentTime = h.start;
      previewEnd.current = h.end;
      void player.current.play().catch((e) => setError(String(e)));
    }
  };
  return (
    <section className="heis-clipping" aria-label="AI clipping workspace">
      <header>
        <div>
          <h1>AI clipping</h1>
          <p>Find strong, self-contained moments in spoken video.</p>
        </div>
        <button
          disabled={busy}
          onClick={() =>
            void attempt(async () => {
              const picked = await bridge.chooseClippingSource();
              if (picked) setSource(picked);
            })
          }
        >
          Choose video
        </button>
      </header>
      <div className="heis-clipping-body">
        <main>
          {source ? (
            <video
              ref={player}
              src={source.url}
              controls
              onTimeUpdate={() => {
                if (
                  previewEnd.current !== undefined &&
                  player.current &&
                  player.current.currentTime >= previewEnd.current
                ) {
                  player.current.pause();
                  previewEnd.current = undefined;
                }
              }}
            />
          ) : (
            <div className="heis-clipping-empty">
              Choose an interview, podcast, talk, or tutorial to get started.
            </div>
          )}
          <p>{source?.name || "Your footage stays local."}</p>
          {!!library.length && (
            <label>
              Previously imported videos
              <select
                aria-label="Previously imported videos"
                disabled={busy}
                value={
                  library.some((v) => v.url === source?.url) ? source?.url : ""
                }
                onChange={(e) =>
                  setSource(library.find((v) => v.url === e.target.value))
                }
              >
                <option value="" disabled>
                  Choose from library
                </option>
                {library.map((v) => (
                  <option key={v.url} value={v.url}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {transcript && (
            <details>
              <summary>
                Review transcript ({transcript.cues.length} cues)
              </summary>
              <div className="heis-clipping-transcript">
                {transcript.cues.map((c, i) => (
                  <p key={i}>
                    <time>{c.start.toFixed(1)}s</time> {c.text}
                  </p>
                ))}
              </div>
            </details>
          )}
          <div role="status">{message}</div>
          {error && <p role="alert">{error}</p>}
        </main>
        <aside>
          <h2>1. Transcribe locally</h2>
          <p>
            Up to two hours of spoken video. First use downloads the local
            speech model.
          </p>
          <button
            disabled={!source || busy}
            onClick={() =>
              void attempt(async () => {
                await waitLocal(await bridge.transcribeSource(source!.url));
              })
            }
          >
            {transcript ? "Transcribe again" : "Transcribe video"}
          </button>
          {pendingLocal && (
            <button
              disabled={busy}
              onClick={() => void attempt(() => waitLocal(pendingLocal))}
            >
              Resume local task
            </button>
          )}
          <h2>2. Rank highlights</h2>
          <div className="heis-clipping-options">
            <label>
              Count
              <input
                type="number"
                min={1}
                max={10}
                value={count}
                disabled={busy}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <label>
              Min seconds
              <input
                type="number"
                min={5}
                max={180}
                value={minimum}
                disabled={busy}
                onChange={(e) => setMinimum(Number(e.target.value))}
              />
            </label>
            <label>
              Max seconds
              <input
                type="number"
                min={5}
                max={180}
                value={maximum}
                disabled={busy}
                onChange={(e) => setMaximum(Number(e.target.value))}
              />
            </label>
          </div>
          <p>
            Only the transcript is sent for paid AI analysis, after your
            approval. Scores express editorial preference, not predicted views.
            Visual action and silent footage are not analyzed.
          </p>
          <button
            disabled={!transcript || busy}
            onClick={() => void attempt(analyze)}
          >
            Find highlights
          </button>
          {saved && !saved.highlights && (
            <button
              disabled={busy || !source}
              onClick={() =>
                void attempt(() => collectAnalysis(saved, source!))
              }
            >
              Resume analysis
            </button>
          )}
          {busy && (
            <button
              disabled={!active.current.local && !active.current.remote}
              onClick={() => {
                const task = active.current;
                void (
                  task.local
                    ? bridge.cancel(task.local)
                    : task.remote
                      ? api.cancel("managed", task.remote).then(unwrap)
                      : Promise.resolve()
                ).catch((e) => setError(String(e)));
              }}
            >
              Cancel current task
            </button>
          )}
          {!!highlights.length && (
            <>
              <h2>3. Review and create</h2>
              {highlights.map((h, index) => (
                <article key={index}>
                  <label className="heis-clipping-pick">
                    <input
                      type="checkbox"
                      checked={selected.includes(index)}
                      disabled={busy}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, index]
                            : s.filter((i) => i !== index),
                        )
                      }
                    />
                    <strong>{h.title}</strong>
                    <span>{h.score}/100</span>
                  </label>
                  <p>{h.reason}</p>
                  <div className="heis-clipping-options">
                    {(["start", "end"] as const).map((field) => (
                      <label key={field}>
                        {field} (s)
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          disabled={busy}
                          value={h[field]}
                          onChange={(e) => {
                            const updated = highlights.map((v, i) =>
                              i === index
                                ? { ...v, [field]: Number(e.target.value) }
                                : v,
                            );
                            setHighlights(updated);
                            if (source && saved) {
                              const record = { ...saved, highlights: updated };
                              save(source.url, record);
                              setSaved(record);
                            }
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <button disabled={busy} onClick={() => preview(h)}>
                    Preview range
                  </button>
                </article>
              ))}
              <button
                className="heis-clipping-primary"
                disabled={busy || !selected.length}
                onClick={() =>
                  void attempt(async () => {
                    await waitLocal(
                      await bridge.extractHighlights(
                        source!.url,
                        selected.map((i) => highlights[i]),
                      ),
                    );
                  })
                }
              >
                Create {selected.length} selected clips
              </button>
              <p>
                Original framing is preserved. Clips are saved to the source
                project library; add them to the timeline when ready.
              </p>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
