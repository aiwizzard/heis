import React from "react";
import {
  workflowOptionKeys,
  workflowCapabilities,
  workflowMediaSources,
  workflowModel,
  workflowOutput,
  type WorkflowNode,
  type EditorProject,
} from "@heis/core";
export function WorkflowNodeControls({
  node: n,
  nodes,
  project: p,
  change,
}: {
  node: WorkflowNode;
  nodes: WorkflowNode[];
  project: EditorProject;
  change: (id: string, patch: Partial<WorkflowNode>) => void;
}) {
  const optionKeys = workflowOptionKeys(n);
  const model = workflowCapabilities.find((c) => c.id === workflowModel(n)),
    sources = workflowMediaSources(n),
    input = n.kind.endsWith("-input"),
    multi = ["text-concat", "video-combine"].includes(n.kind);
  const ports =
    model?.ports ||
    (n.kind === "output"
      ? [{ name: "Input", kind: undefined }]
      : multi
        ? sources.map((_, i) => ({
            name: "Input " + (i + 1),
            kind: n.kind === "text-concat" ? "text" : "video",
          }))
        : []);
  const setSource = (i: number, id: string) => {
    const next = [...sources];
    next[i] = id;
    change(n.id, { source: undefined, sources: next });
  };
  return (
    <>
      <label>
        Name
        <input
          aria-label={"Name " + n.id}
          value={n.name}
          onChange={(e) => change(n.id, { name: e.target.value })}
        />
      </label>
      {n.kind === "managed" && (
        <label>
          Managed capability
          <select
            aria-label={"Capability " + n.id}
            value={n.modelId || ""}
            onChange={(e) =>
              change(n.id, {
                modelId: e.target.value,
                sources: [],
                source: undefined,
                sourceIndices: [],
                options: {},
              })
            }
          >
            {workflowCapabilities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {input && n.kind !== "text-input" && (
        <label>
          Project {workflowOutput(n)}
          <select
            aria-label={"Project " + workflowOutput(n) + " " + n.id}
            value={n.assetId || ""}
            onChange={(e) => change(n.id, { assetId: e.target.value })}
          >
            <option value="">Choose media</option>
            {p.assets
              .filter((a) => a.kind === workflowOutput(n))
              .map((a) => (
                <option key={a.id} value={a.id} disabled={a.missing}>
                  {a.name}
                  {a.missing ? " (missing)" : ""}
                </option>
              ))}
          </select>
        </label>
      )}
      {ports.map((port, i) => (
        <div key={i}>
          <label>
            {port.name}
            <select
              aria-label={"Input for " + n.name + (i ? " " + (i + 1) : "")}
              value={sources[i] || ""}
              onChange={(e) => setSource(i, e.target.value)}
            >
              <option value="">Connect a node</option>
              {nodes
                .filter(
                  (s) =>
                    s.id !== n.id &&
                    s.kind !== "output" &&
                    (!port.kind || workflowOutput(s) === port.kind),
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.id.slice(0, 8)})
                  </option>
                ))}
            </select>
          </label>
          {port.kind !== "text" && n.kind !== "output" && (
            <label>
              Output index (0 is first)
              <input
                type="number"
                min="0"
                max="99"
                value={n.sourceIndices?.[i] || 0}
                onChange={(e) => {
                  const indices = [...(n.sourceIndices || [])];
                  while (indices.length <= i) indices.push(0);
                  indices[i] = Number(e.target.value);
                  change(n.id, { sourceIndices: indices });
                }}
              />
            </label>
          )}
          {multi && (
            <button
              onClick={() =>
                change(n.id, {
                  sources: sources.filter((_, j) => j !== i),
                  sourceIndices: n.sourceIndices?.filter((_, j) => j !== i),
                })
              }
            >
              Remove input {i + 1}
            </button>
          )}
        </div>
      ))}
      {multi && (
        <button
          onClick={() =>
            change(n.id, { source: undefined, sources: [...sources, ""] })
          }
        >
          Add ordered input
        </button>
      )}
      {(model || n.kind === "text-input" || n.kind === "text-concat") && (
        <label>
          {n.kind === "text-input" ? "Text" : "Prompt"}
          <textarea
            aria-label={n.name + " prompt"}
            value={n.prompt}
            maxLength={16000}
            onChange={(e) => change(n.id, { prompt: e.target.value })}
          />
        </label>
      )}
      {model && (
        <label>
          Append text from
          <select
            aria-label={"Prompt source " + n.id}
            value={n.promptSource || ""}
            onChange={(e) =>
              change(n.id, { promptSource: e.target.value || undefined })
            }
          >
            <option value="">No text connection</option>
            {nodes
              .filter((s) => s.id !== n.id && workflowOutput(s) === "text")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {model &&
        [
          "heis-video-standard",
          "heis-video-text-standard",
          "heis-marketing-video",
          "heis-motion-control",
          "heis-motion-graphics",
        ].includes(model.id) && (
          <label>
            Duration
            <select
              aria-label="Video duration"
              value={n.duration}
              onChange={(e) =>
                change(n.id, { duration: Number(e.target.value) as 5 | 10 })
              }
            >
              <option value={5}>5 seconds</option>
              <option value={10}>10 seconds</option>
            </select>
          </label>
        )}
      {model && !!optionKeys.length && (
        <details>
          <summary>Advanced settings</summary>
          {optionKeys
            .filter((key) =>
              [
                "width",
                "height",
                "strength",
                "upscaleFactor",
                "layers",
              ].includes(key),
            )
            .map((key) => (
              <label key={key}>
                {key}
                <input
                  type="number"
                  step={key === "strength" ? ".1" : "1"}
                  value={String(n.options?.[key] ?? "")}
                  onChange={(e) => {
                    const options = { ...n.options };
                    if (e.target.value === "") delete options[key];
                    else options[key] = Number(e.target.value);
                    change(n.id, { options });
                  }}
                />
              </label>
            ))}
          {model.id === "heis-speech-standard" && (
            <label>
              Voice ID
              <input
                value={String(n.options?.voice || "English_CalmWoman")}
                onChange={(e) =>
                  change(n.id, {
                    options: { ...n.options, voice: e.target.value },
                  })
                }
              />
            </label>
          )}
          {model.id === "heis-music-standard" && (
            <label>
              <input
                type="checkbox"
                checked={n.options?.instrumental !== false}
                onChange={(e) =>
                  change(n.id, {
                    options: { ...n.options, instrumental: e.target.checked },
                  })
                }
              />
              Instrumental
            </label>
          )}
          {optionKeys.includes("aspectRatio") && (
            <label>
              Aspect ratio
              <select
                value={String(n.options?.aspectRatio || "16:9")}
                onChange={(e) =>
                  change(n.id, {
                    options: { ...n.options, aspectRatio: e.target.value },
                  })
                }
              >
                {["16:9", "9:16", "1:1"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          )}
        </details>
      )}
      {n.kind === "output" && (
        <p>
          Results stay in this project. Choose when to insert media into your
          timeline.
        </p>
      )}
      {n.kind === "video-combine" && (
        <p>
          Joins inputs in order, locally, with audio. Output is 1280 × 720 at 30
          fps.
        </p>
      )}
    </>
  );
}
