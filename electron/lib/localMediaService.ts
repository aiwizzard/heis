const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MEDIA_NAME = /^[a-f0-9-]{36}\.[a-z0-9]{1,8}$/;
const RATIOS: Readonly<Record<string, number>> = {
  "9:16": 9 / 16,
  "16:9": 16 / 9,
  "1:1": 1,
  "4:5": 4 / 5,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
};

function safeExtension(name: string, mimeType: string): string {
  const fromName = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "");
  if (/^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  if (mimeType === "video/quicktime") return ".mov";
  if (mimeType === "video/webm") return ".webm";
  return ".mp4";
}

function highlightWindows(durationSeconds: number, requestedCount: number): any[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("VIDEO_DURATION_UNAVAILABLE");
  const count = Math.min(10, Math.max(1, Math.floor(requestedCount || 3)));
  const windowLength = Math.min(15, Math.max(1, durationSeconds / Math.max(count * 1.5, 1)));
  return Array.from({ length: count }, (_, index) => {
    const center = durationSeconds * ((index + 1) / (count + 1));
    const start = Math.max(0, Math.min(durationSeconds - windowLength, center - windowLength / 2));
    const end = Math.min(durationSeconds, start + windowLength);
    return {
      label: `Highlight #${index + 1}`,
      start_time: Number(start.toFixed(3)),
      end_time: Number(end.toFixed(3)),
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      score: Number((1 - index * 0.01).toFixed(2)),
    };
  });
}

function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code: number) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `Media command failed with code ${code}.`)));
  });
}

class LocalMediaService {
  private readonly mediaDirectory: string;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;

  constructor(userDataPath: string, resourcesPath: string, environment: NodeJS.ProcessEnv = process.env) {
    this.mediaDirectory = path.join(userDataPath, "media");
    this.ffmpegPath = environment.HEIS_FFMPEG_PATH || path.join(resourcesPath, "ffmpeg", "ffmpeg");
    this.ffprobePath = environment.HEIS_FFPROBE_PATH || path.join(resourcesPath, "ffmpeg", "ffprobe");
  }

  private async binary(preferred: string, developmentFallback: string): Promise<string> {
    try { await fs.access(preferred); return preferred; }
    catch {
      if (process.env.NODE_ENV !== "production") return developmentFallback;
      throw new Error("LOCAL_FFMPEG_NOT_INSTALLED");
    }
  }

  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.mediaDirectory, { recursive: true });
  }

  resolveUrl(rawUrl: string): string {
    const url = new URL(rawUrl);
    const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (url.protocol !== "heis-media:" || url.hostname !== "asset" || !MEDIA_NAME.test(name)) throw new Error("INVALID_LOCAL_MEDIA_URL");
    return path.join(this.mediaDirectory, name);
  }

  private mediaUrl(name: string): string {
    return `heis-media://asset/${encodeURIComponent(name)}`;
  }

  async importMedia(file: { name: string; type: string; bytes: ArrayBuffer | Uint8Array }): Promise<any> {
    if (!file || typeof file.name !== "string" || typeof file.type !== "string" || !(file.bytes instanceof ArrayBuffer || ArrayBuffer.isView(file.bytes))) throw new Error("INVALID_LOCAL_MEDIA_IMPORT");
    const bytes = Buffer.from(file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes));
    if (bytes.byteLength > 500 * 1024 * 1024) throw new Error("LOCAL_MEDIA_TOO_LARGE");
    await this.ensureDirectory();
    const name = `${crypto.randomUUID()}${safeExtension(file.name, file.type)}`;
    await fs.writeFile(path.join(this.mediaDirectory, name), bytes, { flag: "wx" });
    return { id: name, url: this.mediaUrl(name), mimeType: file.type };
  }

  async clipHighlights(request: any): Promise<any> {
    const inputPath = this.resolveUrl(String(request?.sourceUrl ?? ""));
    await fs.access(inputPath);
    const ffprobe = await this.binary(this.ffprobePath, "ffprobe");
    const probe = JSON.parse(await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "json", inputPath]));
    const coordinates = highlightWindows(Number(probe?.format?.duration), Number(request?.numHighlights));
    const jobId = crypto.randomUUID();
    if (request?.returnCoordinatesOnly) return { id: jobId, outputs: [], coordinates };
    const ffmpeg = await this.binary(this.ffmpegPath, "ffmpeg");
    const ratio = RATIOS[String(request?.aspectRatio)] ?? RATIOS["9:16"];
    await this.ensureDirectory();
    const outputs: string[] = [];
    for (const coordinate of coordinates) {
      const outputName = `${crypto.randomUUID()}.mp4`;
      const outputPath = path.join(this.mediaDirectory, outputName);
      const crop = `crop='if(gt(a,${ratio}),ih*${ratio},iw)':'if(gt(a,${ratio}),ih,iw/${ratio})'`;
      await run(ffmpeg, ["-y", "-ss", String(coordinate.start), "-i", inputPath, "-t", String(coordinate.end - coordinate.start), "-vf", crop, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", outputPath]);
      outputs.push(this.mediaUrl(outputName));
    }
    return { id: jobId, outputs, coordinates };
  }
}

module.exports = { LocalMediaService, highlightWindows, safeExtension };
