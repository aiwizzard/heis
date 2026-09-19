import {
  validateWorkflow,
  type WorkflowNode,
  type ProjectWorkflowDefinition,
} from "./workflow";
import {
  workflowCapabilities,
  workflowOutput,
  workflowModel,
} from "./workflowCapabilities";
const node = (
  id: string,
  kind: WorkflowNode["kind"],
  extra: Partial<WorkflowNode> = {},
): WorkflowNode => ({
  id,
  kind,
  name: id,
  prompt: "",
  duration: 5,
  x: 30,
  y: 40,
  ...extra,
});
export const workflowTemplates = [
  {
    id: "image-video",
    name: "Image edit and animation",
    nodes: [
      node("image", "image-input"),
      node("edit", "image-edit", {
        source: "image",
        prompt: "A cinematic product photograph",
      }),
      node("video", "image-to-video", {
        source: "edit",
        prompt: "Slow cinematic camera movement",
      }),
      node("result", "output", { source: "video" }),
    ],
  },
  {
    id: "text-image",
    name: "Write a prompt and generate an image",
    nodes: [
      node("brief", "text-input", {
        prompt: "Describe a cinematic coastal landscape in one image prompt.",
      }),
      node("writer", "managed", {
        modelId: "heis-text-standard",
        promptSource: "brief",
      }),
      node("image", "managed", {
        modelId: "heis-image-standard",
        promptSource: "writer",
      }),
      node("result", "output", { source: "image" }),
    ],
  },
  {
    id: "speech",
    name: "Script to speech",
    nodes: [
      node("script", "text-input", { prompt: "Welcome to our story." }),
      node("voice", "managed", {
        modelId: "heis-speech-standard",
        promptSource: "script",
      }),
      node("result", "output", { source: "voice" }),
    ],
  },
  {
    id: "music",
    name: "Generate music",
    nodes: [
      node("music", "managed", {
        modelId: "heis-music-standard",
        prompt: "Warm instrumental piano and strings",
      }),
      node("result", "output", { source: "music" }),
    ],
  },
  {
    id: "combine",
    name: "Combine video clips locally",
    nodes: [
      node("first", "video-input"),
      node("second", "video-input"),
      node("combine", "video-combine", { sources: ["first", "second"] }),
      node("result", "output", { source: "combine" }),
    ],
  },
  {
    id: "layers",
    name: "Separate image layers",
    nodes: [
      node("image", "image-input"),
      node("layers", "managed", {
        modelId: "heis-image-layers",
        options: { layers: 4 },
      }),
      node("result", "output", { source: "layers" }),
    ],
  },
  {
    id: "lipsync",
    name: "Lip sync a video",
    nodes: [
      node("video", "video-input"),
      node("audio", "audio-input"),
      node("sync", "managed", {
        modelId: "heis-lipsync-video",
        sources: ["video", "audio"],
      }),
      node("result", "output", { source: "sync" }),
    ],
  },
].map((t) => ({
  ...t,
  nodes: t.nodes.map((n, i) => ({
    ...n,
    ...(t.id === "layers" && n.id === "layers" ? { source: "image" } : {}),
    x: 30 + i * 310,
  })),
}));
export function migrateWorkflow(record: unknown): {
  name: string;
  nodes: WorkflowNode[];
  warnings: string[];
} {
  if (!record || typeof record !== "object")
    throw new Error("Choose a workflow JSON object.");
  const envelope = record as any,
    r = envelope.migration?.record || envelope,
    overrides = envelope.migration?.models || {},
    modern = r.definition || r;
  if (modern.version === 1 && Array.isArray(modern.nodes)) {
    const nodes: WorkflowNode[] = modern.nodes.map((n: any) => ({
      id: n.id,
      kind: n.kind,
      name: n.name,
      prompt: n.prompt,
      duration: n.duration,
      x: n.x,
      y: n.y,
      source: n.source,
      sources: n.sources,
      sourceIndices: n.sourceIndices,
      promptSource: n.promptSource,
      modelId: n.modelId,
      options: n.options,
      assetId: undefined,
    }));
    validateWorkflow({ ...modern, nodes }, false);
    return {
      name: modern.name,
      nodes,
      warnings: [
        "Imported media inputs must be linked to this project. Run history and approvals are not imported.",
      ],
    };
  }
  const old = r.data?.nodes || r.nodes,
    edges = r.edges || r.data?.edges || [];
  if (
    !Array.isArray(old) ||
    !old.length ||
    old.length > 40 ||
    !Array.isArray(edges)
  )
    throw new Error("This file does not contain a supported workflow graph.");
  const warnings: string[] = [
    "This is a new copy. Original records are unchanged. Provider credentials and remote media URLs are not imported.",
  ];
  const nodes: WorkflowNode[] = old.map((n: any, i: number) => {
    const model = n.data?.selectedModel?.id || "",
      form = n.data?.formValues || {},
      kind = n.type,
      passthrough =
        String(model).includes("passthrough") || kind === "uploadNode";
    let k: WorkflowNode["kind"] = "managed",
      modelId: string | undefined;
    if (kind === "concatNode") k = "text-concat";
    else if (kind === "vidConcatNode") k = "video-combine";
    else if (passthrough) {
      k =
        kind === "textNode"
          ? "text-input"
          : kind === "videoNode"
            ? "video-input"
            : kind === "audioNode"
              ? "audio-input"
              : "image-input";
      warnings.push(`${n.id}: choose the local input again.`);
    } else {
      modelId = workflowCapabilities.find(
        (c) => c.id === (overrides[n.id] || model),
      )?.id;
      if (overrides[n.id] && !modelId)
        throw new Error("Choose a listed managed capability.");
      if (overrides[n.id])
        warnings.push(
          `${n.id}: reviewed replacement ${modelId}; original ${model || kind}.`,
        );
      if (!modelId) {
        modelId =
          kind === "textNode"
            ? "heis-text-standard"
            : kind === "imageNode"
              ? edges.some(
                  (e: any) =>
                    String(e.target) === String(n.id) &&
                    old.find((s: any) => s.id === e.source)?.type ===
                      "imageNode",
                )
                ? "heis-image-edit-standard"
                : "heis-image-standard"
              : kind === "videoNode"
                ? edges.some(
                    (e: any) =>
                      String(e.target) === String(n.id) &&
                      old.find((s: any) => s.id === e.source)?.type ===
                        "imageNode",
                  )
                  ? "heis-video-standard"
                  : "heis-video-text-standard"
                : kind === "audioNode"
                  ? "heis-speech-standard"
                  : undefined;
        if (!modelId)
          throw new Error(
            `Node ${n.id} uses an arbitrary API. Replace it with a supported managed capability before importing.`,
          );
        warnings.push(
          `${n.id}: ${model || kind} is replaced by ${modelId}. Review the model and prompt before running.`,
        );
      }
    }
    return node(String(n.id), k, {
      name: String(n.data?.label || n.id).slice(0, 120),
      modelId,
      prompt: String(form.prompt || form.text || n.data?.text || "").slice(
        0,
        16000,
      ),
      x: 30 + (i % 4) * 310,
      y: 40 + Math.floor(i / 4) * 400,
    });
  });
  for (const n of nodes) {
    const incoming = edges
      .filter((e: any) => String(e.target) === n.id)
      .map((e: any) => nodes.find((s) => s.id === String(e.source)))
      .filter(Boolean) as WorkflowNode[];
    if (n.kind.endsWith("-input")) continue;
    const texts = incoming.filter((s) => workflowOutput(s) === "text"),
      media = incoming.filter((s) => workflowOutput(s) !== "text");
    if (n.kind === "text-concat") n.sources = texts.map((s) => s.id);
    else if (n.kind === "video-combine") n.sources = media.map((s) => s.id);
    else {
      const ports =
        workflowCapabilities.find((c) => c.id === workflowModel(n))?.ports ||
        [];
      n.sources = ports.map(
        (p) => media.find((s) => workflowOutput(s) === p.kind)?.id || "",
      );
      if (texts.length > 1)
        throw new Error(
          `Node ${n.id} has multiple text inputs. Add a text concatenation node before importing.`,
        );
      n.promptSource = texts[0]?.id;
      if (media.length > ports.length)
        throw new Error(
          `Node ${n.id} needs a managed model accepting its media inputs. Update that legacy model before importing.`,
        );
    }
  }
  for (const n of [...nodes])
    if (!edges.some((e: any) => String(e.source) === n.id))
      nodes.push(
        node("result-" + n.id, "output", {
          source: n.id,
          x: Math.min(4900, n.x + 310),
          y: n.y,
        }),
      );
  const name = String(r.name || "Imported workflow").slice(0, 120);
  validateWorkflow(
    { version: 1, id: "import", projectId: "import", revision: 0, name, nodes },
    false,
  );
  return { name, nodes, warnings };
}
