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
