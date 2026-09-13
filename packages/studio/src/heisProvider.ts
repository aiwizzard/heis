type BillingMode = "managed" | "byok";

interface LipSyncStudioModel {
  id: string;
  name: string;
  category: "image" | "video";
  hasPrompt: boolean;
  hasSeed: boolean;
  description: string;
  inputs?: { resolution?: { default?: string; enum?: readonly string[] } };
}

interface AudioStudioInput {
  type: "string" | "boolean";
  title: string;
  description?: string;
  default?: string | boolean;
  enum?: readonly string[];
  examples?: readonly string[];
}

interface AudioStudioModel {
  id: string;
  name: string;
  description: string;
  required: readonly string[];
  inputs: Readonly<Record<string, AudioStudioInput>>;
}

interface MotionControlStudioModel {
  id: string;
  name: string;
  description: string;
  maxDuration: number;
  minDuration: number;
  defaultDuration: number;
  maxImages: number;
  supportsAudio: boolean;
  supportsBitrate: boolean;
  supportsQuality: boolean;
  supportsSeed: boolean;
  aspectRatios: readonly string[];
  defaultAspectRatio: string;
}

export const lipsyncModels: readonly LipSyncStudioModel[] = [
  {
    id: "heis-lipsync-image",
    name: "Heis Portrait Lip Sync",
    category: "image",
    hasPrompt: true,
    hasSeed: false,
    inputs: {},
    description: "Animate a portrait from supplied speech using Runware Aurora Fast.",
  },
  {
    id: "heis-lipsync-video",
    name: "Heis Video Lip Sync",
    category: "video",
    hasPrompt: false,
    hasSeed: false,
    inputs: {},
    description: "Synchronize an existing speaker video to supplied speech using Sync Lipsync 2.",
  },
] as const;

export const imageLipSyncModels = lipsyncModels.filter((model) => model.category === "image");
export const videoLipSyncModels = lipsyncModels.filter((model) => model.category === "video");
export const getResolutionsForLipSyncModel = (id: string): readonly string[] => {
  void id;
  return [];
};

export const audioModels: readonly AudioStudioModel[] = [
  {
    id: "heis-speech-standard",
    name: "Heis Speech Standard",
    description: "Natural multilingual speech using MiniMax Speech 2.8.",
    required: ["prompt"],
    inputs: {
      prompt: { type: "string", title: "Text", description: "Enter up to 5,000 characters to speak.", examples: ["Welcome to Heis. Let us build something remarkable."] },
      voice: { type: "string", title: "Voice", default: "English_CalmWoman", enum: ["English_CalmWoman", "English_ConfidentWoman", "English_CaptivatingStoryteller", "English_PlayfulGirl", "English_expressive_narrator"] },
    },
  },
  {
    id: "heis-music-standard",
    name: "Heis Music Standard",
    description: "Prompt-driven songs and instrumental tracks using MiniMax Music 2.6.",
    required: ["prompt"],
    inputs: {
      prompt: { type: "string", title: "Music prompt", description: "Describe the genre, mood, instrumentation, tempo, and vocal style.", examples: ["Warm cinematic ambient music with soft piano, restrained strings, and no vocals."] },
      instrumental: { type: "boolean", title: "Instrumental", description: "Generate music without vocals.", default: true },
      lyrics: { type: "string", title: "Lyrics", description: "Optional lyrics when Instrumental is off." },
    },
  },
];

export const getAudioModelById = (id: string) => audioModels.find((model) => model.id === id);

export const motionControlModels: readonly MotionControlStudioModel[] = [
  {
    id: "heis-motion-control",
    name: "Heis Motion Control",
    description: "Transfer motion, camera movement, and performance from a video to referenced characters or products using Seedance 2.5.",
    maxDuration: 30,
    minDuration: 4,
    defaultDuration: 5,
    maxImages: 30,
    supportsAudio: true,
    supportsBitrate: false,
    supportsQuality: false,
    supportsSeed: true,
    aspectRatios: ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"],
    defaultAspectRatio: "16:9",
  },
];

export const getMotionControlModelById = (id: string) => motionControlModels.find((model) => model.id === id) ?? motionControlModels[0];

function requireDesktop() {
  if (!window.heis?.generation) throw new Error("Heis generation is available in the desktop application.");
  return window.heis;
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function mode(): Promise<BillingMode> {
  const heis = requireDesktop();
  const entitlement = unwrap(await heis.entitlements.get());
  if (!entitlement) throw new Error("Sign in to activate Heis before generating.");
  if (localStorage.getItem("heis_generation_mode") === "byok" && entitlement.canUseByokGeneration) return "byok";
  if (entitlement.canUseManagedGeneration) return "managed";
  if (entitlement.canUseByokGeneration) return "byok";
  throw new Error("Your current Heis entitlement does not include generation.");
}

function dimensions(aspectRatio = "1:1", shortEdge = 1024) {
  const [widthRatio, heightRatio] = aspectRatio.split(":").map(Number);
  if (!widthRatio || !heightRatio) return { width: shortEdge, height: shortEdge };
  if (widthRatio >= heightRatio) return { width: Math.round(shortEdge * widthRatio / heightRatio / 64) * 64, height: shortEdge };
  return { width: shortEdge, height: Math.round(shortEdge * heightRatio / widthRatio / 64) * 64 };
}

const MARKETING_VIDEO_DIMENSIONS: Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>> = {
  "720p": {
    "16:9": [1280, 720],
    "9:16": [720, 1280],
    "1:1": [960, 960],
    "4:3": [1104, 832],
    "3:4": [832, 1104],
  },
  "1080p": {
    "16:9": [1920, 1080],
    "9:16": [1080, 1920],
    "1:1": [1440, 1440],
    "4:3": [1648, 1248],
    "3:4": [1248, 1648],
  },
};

const MOTION_VIDEO_DIMENSIONS: Readonly<Record<string, readonly [number, number]>> = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [960, 960],
  "4:3": [1112, 834],
  "3:4": [834, 1112],
  "21:9": [1470, 630],
  "9:21": [630, 1470],
};

function marketingVideoDimensions(resolution: string, aspectRatio: string) {
  const tier = MARKETING_VIDEO_DIMENSIONS[resolution] ?? MARKETING_VIDEO_DIMENSIONS["720p"];
  const [width, height] = tier[aspectRatio] ?? tier["16:9"];
  return { width, height };
}

async function submit(operation: any, modelId: string, inputs: Record<string, unknown>, onRequestId?: (id: string) => void) {
  const heis = requireDesktop();
  const billingMode = await mode();
  let job: any = unwrap(await heis.generation.submit({
    operation,
    modelId,
    inputs,
    billing: { mode: billingMode, accountId: "desktop", idempotencyKey: crypto.randomUUID() },
  } as any));
  onRequestId?.(job.id);
  for (let attempt = 0; !["succeeded", "failed", "cancelled"].includes(job.status) && attempt < 900; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    job = unwrap(await heis.generation.getJob(billingMode, job.id));
  }
  if (job.status !== "succeeded") throw new Error(job.error?.message ?? `Generation ${job.status}.`);
  const url = job.outputs?.[0]?.url;
  if (!url) throw new Error("Generation completed without a media output.");
  return { ...job, request_id: job.id, url, outputs: job.outputs.map((asset: any) => asset.url) };
}

export async function uploadFile(_legacyApiKey: string, file: File, onProgress?: (progress: number) => void) {
  const heis = requireDesktop();
  onProgress?.(1);
  const billingMode = await mode();
  const result = unwrap(await heis.generation.upload(billingMode, { name: file.name, type: file.type, bytes: await file.arrayBuffer() }));
  onProgress?.(100);
  return result.url;
}

export async function generateImage(_legacyApiKey: string, params: any) {
  return submit("text-to-image", "heis-image-standard", { positivePrompt: params.prompt, ...dimensions(params.aspect_ratio), ...(params.seed && params.seed !== -1 ? { seed: params.seed } : {}) }, params.onRequestId);
}

export async function generateI2I(_legacyApiKey: string, params: any) {
  const seedImage = params.images_list?.[0] ?? params.image_url;
  return submit("image-to-image", "heis-image-edit-standard", { positivePrompt: params.prompt, seedImage, strength: params.strength ?? 0.8, ...dimensions(params.aspect_ratio) }, params.onRequestId);
}

export async function generateVideo(_legacyApiKey: string, params: any) {
  return submit("text-to-video", "heis-video-text-standard", { positivePrompt: params.prompt, duration: Number(params.duration) || 5, aspectRatio: params.aspect_ratio ?? "16:9" }, params.onRequestId);
}

export async function generateI2V(_legacyApiKey: string, params: any) {
  const input = params.image_url ?? params.images_list?.[0] ?? params.inputs;
  return submit("image-to-video", "heis-video-standard", { positivePrompt: params.prompt, inputs: input, duration: Number(params.duration) || 5 }, params.onRequestId);
}

export async function processV2V(_legacyApiKey: string, params: any) {
  const input = params.video_url ?? params.videos_list?.[0] ?? params.video_files?.[0] ?? params.inputs;
  return submit("video-to-video", "heis-video-transform", { positivePrompt: params.prompt, inputs: input, resolution: params.resolution ?? "720p" }, params.onRequestId);
}

export async function generateMarketingStudioAd(_legacyApiKey: string, params: any) {
  const referenceImages = Array.isArray(params.images_list) ? params.images_list.filter(Boolean).slice(0, 10) : [];
  const referenceVideos = Array.isArray(params.video_files) ? params.video_files.filter(Boolean).slice(0, 5) : [];
  if (!referenceImages.length) throw new Error("A product image is required for marketing video generation.");
  const userPrompt = String(params.prompt ?? "").trim();
  if (!userPrompt) throw new Error("A marketing script or prompt is required.");
  const referenceGuide = [
    "Use Image 1 as the primary product reference and preserve its branding, proportions, and packaging.",
    referenceImages.length > 1 ? "Use the remaining images as supporting subject, character, product, or style references in their supplied order." : "",
    referenceVideos.length ? "Use Video 1 as the format, pacing, motion, and camera reference without copying any visible branding or text from it." : "",
  ].filter(Boolean).join(" ");
  return submit("reference-to-video", "heis-marketing-video", {
    positivePrompt: `${referenceGuide} ${userPrompt}`,
    inputs: {
      referenceImages,
      ...(referenceVideos.length ? { referenceVideos } : {}),
    },
    ...marketingVideoDimensions(params.resolution ?? "720p", params.aspect_ratio ?? "16:9"),
    duration: Math.min(15, Math.max(4, Math.round(Number(params.duration) || 5))),
    settings: { audio: true },
  }, params.onRequestId);
}

export async function processMotionControl(_legacyApiKey: string, params: any) {
  const video = String(params.video_url ?? "").trim();
  const referenceImages = Array.isArray(params.images_list) ? params.images_list.filter(Boolean).slice(0, 30) : [];
  if (!video) throw new Error("A reference motion video is required.");
  if (!referenceImages.length) throw new Error("At least one character or product image is required.");
  const imageTags = referenceImages.map((_: unknown, index: number) => `@Image${index + 1}`).join(", ");
  const modePrompt = params.mode === "objects_swap"
    ? `Use @Video1 as the source scene and motion. Replace its characters, products, or clothing with the matching references ${imageTags} while preserving the rest of the scene.`
    : `Transfer the motion, choreography, performance timing, and camera movement from @Video1 to the subjects defined by ${imageTags}.`;
  const userPrompt = String(params.prompt ?? "").trim();
  const aspectRatio = String(params.aspect_ratio ?? "16:9");
  const size = MOTION_VIDEO_DIMENSIONS[aspectRatio];
  const seed = Number(params.seed);
  return submit("motion-control", "heis-motion-control", {
    positivePrompt: userPrompt ? `${modePrompt} ${userPrompt}` : modePrompt,
    inputs: { referenceVideos: [video], referenceImages },
    ...(size ? { width: size[0], height: size[1] } : { resolution: "720p" }),
    duration: Math.min(30, Math.max(4, Math.round(Number(params.duration) || 5))),
    settings: { audio: Boolean(params.generate_audio) },
    ...(Number.isInteger(seed) && seed >= 0 ? { seed } : {}),
  }, params.onRequestId);
}

export async function processLipSync(_legacyApiKey: string, params: any) {
  const audio = params.audio_url;
  if (!audio) throw new Error("An audio file is required for lip sync.");
  if (params.video_url) {
    return submit("lip-sync", "heis-lipsync-video", {
      inputs: { video: params.video_url, audio },
      providerSettings: { sync: { syncMode: "remap", temperature: 0.55 } },
    }, params.onRequestId);
  }
  if (params.image_url) {
    return submit("lip-sync", "heis-lipsync-image", {
      positivePrompt: params.prompt || "Natural speaking motion, accurate lip sync, subtle head movement, natural blinking, preserve the subject and background.",
      CFGScale: 1,
      inputs: { image: params.image_url, audio },
    }, params.onRequestId);
  }
  throw new Error("A source image or video is required for lip sync.");
}

export async function generateAudio(_legacyApiKey: string, params: any) {
  if (params._modelId === "heis-speech-standard") {
    const text = String(params.prompt ?? "").trim();
    if (!text) throw new Error("Text is required for speech generation.");
    if (text.length > 5_000) throw new Error("Speech text is limited to 5,000 characters in Heis.");
    return submit("text-to-speech", "heis-speech-standard", {
      speech: { text, voice: params.voice || "English_CalmWoman" },
    }, params.onRequestId);
  }
  if (params._modelId === "heis-music-standard") {
    const prompt = String(params.prompt ?? "").trim();
    if (!prompt) throw new Error("A music prompt is required.");
    if (prompt.length > 2_000) throw new Error("Music prompts are limited to 2,000 characters.");
    const instrumental = params.instrumental !== false;
    return submit("text-to-music", "heis-music-standard", {
      positivePrompt: prompt,
      settings: {
        instrumental,
        ...(!instrumental && String(params.lyrics ?? "").trim() ? { lyrics: String(params.lyrics).trim(), lyricsOptimizer: true } : {}),
      },
    }, params.onRequestId);
  }
  throw new Error("Select a supported Heis audio model.");
}

export async function getUserBalance() {
  const result = await requireDesktop().generation.getBalance();
  return unwrap(result);
}
