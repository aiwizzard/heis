import { getCapability, STARTER_RUNWARE_CATALOG } from "./catalog";
import type { WorkflowNode } from "./workflow";
export type WorkflowValueKind = "image" | "video" | "audio" | "text";
export interface WorkflowCapability {
  id: string;
  name: string;
  output: WorkflowValueKind;
  ports: { name: string; kind: WorkflowValueKind }[];
}
const portKinds: Record<string, WorkflowValueKind[]> = {
  "heis-image-edit-standard": ["image"],
  "heis-image-upscale": ["image"],
  "heis-remove-background": ["image"],
  "heis-expand-image": ["image"],
  "heis-image-layers": ["image"],
  "heis-video-standard": ["image"],
  "heis-video-transform": ["video"],
  "heis-marketing-video": ["image"],
  "heis-motion-control": ["video", "image"],
  "heis-recast": ["video", "image"],
  "heis-motion-graphics-edit": ["video"],
  "heis-lipsync-video": ["video", "audio"],
  "heis-lipsync-image": ["image", "audio"],
};
export const workflowCapabilities: WorkflowCapability[] =
  STARTER_RUNWARE_CATALOG.filter(
    (c) => c.enabled && c.operation !== "rank-highlights",
  ).map((c) => ({
    id: c.id,
    name: c.displayName,
    output:
      c.operation === "generate-text"
        ? "text"
        : (c.outputKind as WorkflowValueKind),
    ports: (portKinds[c.id] || []).map((kind, i) => ({
      name: kind + " " + (i + 1),
      kind,
    })),
  }));
export function workflowModel(n: WorkflowNode) {
  return n.kind === "image-edit"
    ? "heis-image-edit-standard"
    : n.kind === "image-to-video"
      ? "heis-video-standard"
      : n.kind === "managed"
        ? n.modelId
        : undefined;
}
export function workflowMediaSources(n: WorkflowNode) {
  return n.sources ?? (n.source ? [n.source] : []);
}
export function workflowDependencies(n: WorkflowNode) {
  return [
    ...new Set([
      ...workflowMediaSources(n),
      ...(n.promptSource ? [n.promptSource] : []),
    ]),
  ];
}
export function workflowOutput(n: WorkflowNode): WorkflowValueKind | undefined {
  if (n.kind.endsWith("-input"))
    return n.kind.replace("-input", "") as WorkflowValueKind;
  if (n.kind === "text-concat") return "text";
  if (n.kind === "video-combine") return "video";
  return workflowCapabilities.find((c) => c.id === workflowModel(n))?.output;
}
export function workflowInputs(
  n: WorkflowNode,
  urls: string[],
  prompt: string,
): Record<string, unknown> {
  const opts = n.options || {},
    width = Number(opts.width) || 1024,
    height = Number(opts.height) || 1024;
  const videoWidth = Number(opts.width) || 1280,
    videoHeight = Number(opts.height) || 720;
  switch (workflowModel(n)) {
    case "heis-text-standard":
      return { prompt };
    case "heis-image-standard":
      return { positivePrompt: prompt, width, height };
    case "heis-image-edit-standard":
      return {
        positivePrompt: prompt,
        seedImage: urls[0],
        strength: Number(opts.strength ?? 0.8),
        width,
        height,
      };
    case "heis-image-upscale":
      return {
        inputs: { image: urls[0] },
        upscaleFactor: Number(opts.upscaleFactor) || 2,
        settings: { enhancementStrength: "medium" },
      };
    case "heis-remove-background":
      return {
        inputs: { image: urls[0] },
        outputFormat: "PNG",
        settings: { alphaMatting: true, returnOnlyMask: false },
      };
    case "heis-expand-image":
      return {
        inputs: { image: urls[0] },
        outpaint: { top: 256, right: 256, bottom: 256, left: 256 },
        settings: { autoCrop: true },
      };
    case "heis-image-layers":
      return {
        positivePrompt: prompt || "Separate the image into transparent layers.",
        inputs: { referenceImages: [urls[0]] },
        settings: { layers: Number(opts.layers) || 4 },
        outputFormat: "TIFF",
      };
    case "heis-video-standard":
      return { positivePrompt: prompt, inputs: urls[0], duration: n.duration };
    case "heis-video-text-standard":
      return {
        positivePrompt: prompt,
        duration: n.duration,
        aspectRatio: opts.aspectRatio || "16:9",
      };
    case "heis-video-transform":
      return { positivePrompt: prompt, inputs: urls[0], resolution: "720p" };
    case "heis-marketing-video":
      return {
        positivePrompt: prompt,
        inputs: { referenceImages: [urls[0]] },
        width: videoWidth,
        height: videoHeight,
        duration: n.duration,
        settings: { audio: true },
      };
    case "heis-motion-control":
      return {
        positivePrompt: prompt,
        inputs: { referenceVideos: [urls[0]], referenceImages: [urls[1]] },
        duration: n.duration,
        settings: { audio: true },
      };
    case "heis-recast":
      return {
        positivePrompt: prompt,
        inputs: { referenceVideos: [urls[0]], referenceImages: [urls[1]] },
        duration: "auto",
        settings: { audio: true },
      };
    case "heis-motion-graphics":
      return {
        positivePrompt: prompt,
        width: videoWidth,
        height: videoHeight,
        duration: n.duration,
        settings: { audio: false },
      };
    case "heis-motion-graphics-edit":
      return {
        positivePrompt: prompt,
        inputs: { video: urls[0] },
        duration: "auto",
        resolution: "720p",
        settings: { operation: "edit", audio: false },
      };
    case "heis-lipsync-video":
      return {
        inputs: { video: urls[0], audio: urls[1] },
        providerSettings: { sync: { syncMode: "remap", temperature: 0.55 } },
      };
    case "heis-lipsync-image":
      return {
        positivePrompt: prompt || "Natural speaking motion.",
        inputs: { image: urls[0], audio: urls[1] },
      };
    case "heis-speech-standard":
      if (prompt.length > 5000)
        throw new Error("Speech is limited to 5,000 characters.");
      return {
        speech: { text: prompt, voice: opts.voice || "English_CalmWoman" },
      };
    case "heis-music-standard":
      if (prompt.length > 2000)
        throw new Error("Music prompts are limited to 2,000 characters.");
      return {
        positivePrompt: prompt,
        settings: { instrumental: opts.instrumental !== false },
      };
    default:
      throw new Error("Choose an available managed capability.");
  }
}
export function validateWorkflowOptions(n: WorkflowNode) {
  const o = n.options || {};
  if (
    !o ||
    typeof o !== "object" ||
    Array.isArray(o) ||
    Object.keys(o).some((k) => !workflowOptionKeys(n).includes(k))
  )
    throw new Error("Unsupported node options.");
  for (const key of ["width", "height"])
    if (
      o[key] !== undefined &&
      (!Number.isInteger(o[key]) ||
        Number(o[key]) < 256 ||
        Number(o[key]) > 2048 ||
        Number(o[key]) % (workflowOutput(n) === "video" ? 8 : 64))
    )
      throw new Error(
        "Dimensions must be between 256 and 2048, in multiples of 64 for images or 8 for videos.",
      );
  if (
    o.strength !== undefined &&
    (typeof o.strength !== "number" || o.strength < 0 || o.strength > 1)
  )
    throw new Error("Invalid edit strength.");
  if (
    o.layers !== undefined &&
    (!Number.isInteger(o.layers) ||
      Number(o.layers) < 2 ||
      Number(o.layers) > 10)
  )
    throw new Error("Choose 2 to 10 layers.");
  if (
    o.upscaleFactor !== undefined &&
    ![2, 3, 4, 5, 6].includes(Number(o.upscaleFactor))
  )
    throw new Error("Choose a 2 to 6 upscale factor.");
  if (
    o.voice !== undefined &&
    (typeof o.voice !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(o.voice))
  )
    throw new Error("Invalid voice ID.");
  if (
    o.aspectRatio !== undefined &&
    !["16:9", "9:16", "1:1"].includes(String(o.aspectRatio))
  )
    throw new Error("Invalid aspect ratio.");
  if (o.instrumental !== undefined && typeof o.instrumental !== "boolean")
    throw new Error("Invalid music setting.");
}

export function workflowOptionKeys(n: WorkflowNode): string[] {
  switch (workflowModel(n)) {
    case "heis-image-standard":
      return ["width", "height"];
    case "heis-image-edit-standard":
      return ["width", "height", "strength"];
    case "heis-image-upscale":
      return ["upscaleFactor"];
    case "heis-image-layers":
      return ["layers"];
    case "heis-marketing-video":
    case "heis-motion-graphics":
      return ["width", "height"];
    case "heis-video-text-standard":
      return ["aspectRatio"];
    case "heis-speech-standard":
      return ["voice"];
    case "heis-music-standard":
      return ["instrumental"];
    default:
      return [];
  }
}
