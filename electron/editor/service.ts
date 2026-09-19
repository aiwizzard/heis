import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  applyEditorCommand,
  newProject,
  newTrack,
  newClip,
  validateProject,
  fps,
  sequenceDuration,
  parseSubtitles,
  serializeSubtitles,
} from "@heis/core";
import type {
  EditorProject,
  EditorCommand,
  EditorEdit,
  EditorSnapshot,
  EditorJob,
  EditorEvent,
  ProjectAsset,
  Sequence,
  TimelineClip,
  RecentEditorProject,
  CaptionCue,
  ToolContext,
  RankedHighlight,
} from "@heis/core";

import { WorkflowStore } from "./workflowStore";
import { DesignStore } from "./designStore";

type Session = {
  directory: string;
  project: EditorProject;
  undo: EditorProject[];
  redo: EditorProject[];
  timer?: NodeJS.Timeout;
  saved: boolean;
};
export interface EditorOptions {
  userData: string;
  resources: string;
  ffmpeg?: string;
  ffprobe?: string;
  whisper?: string;
  model?: string;
  onEvent?: (event: EditorEvent) => void;
  rasterize?: (
    clip: TimelineClip,
    sequence: Sequence,
    destination: string,
  ) => Promise<void>;
}
export class EditorService {
  private sessions = new Map<string, Session>();
  private jobMap = new Map<string, EditorJob>();
  private children = new Map<string, Set<ChildProcess>>();
  private cancelled = new Set<string>();
  private controllers = new Map<string, AbortController>();
  private generationProvider?: {
    getJob(
      id: string,
    ): Promise<{
      status: string;
      outputs: readonly { url?: string }[];
      error?: { message: string };
    }>;
    cancel?(id: string): Promise<void>;
  };
  private watching = new Set<string>();
  private captures = new Map<string, Promise<void>>();
  private disposed = false;
  readonly designs = new DesignStore(this);
  readonly workflows: WorkflowStore;
  activeProjectId: string | null = null;
  activeContext: ToolContext | null = null;
  setContext(context: ToolContext) {
    if (context.projectId !== this.activeProjectId)
      throw new Error("Project is not active");
    this.activeContext = context;
  }
  private readonly indexPath: string;
  private videoEncoding(): string[] {
    return process.platform === "darwin"
      ? ["-c:v", "h264_videotoolbox", "-allow_sw", "1", "-b:v", "8000k"]
      : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"];
  }
  readonly ffmpeg: string;
  readonly ffprobe: string;
  readonly whisper: string;
  readonly model: string;
  constructor(private options: EditorOptions) {
    this.workflows = new WorkflowStore(this,options.userData);
    this.indexPath = path.join(options.userData, "editor-projects.json");
    this.ffmpeg =
      options.ffmpeg || path.join(options.resources, "media-runtime", "ffmpeg");
    this.ffprobe =
      options.ffprobe ||
      path.join(options.resources, "media-runtime", "ffprobe");
    this.whisper =
      options.whisper ||
      path.join(options.resources, "media-runtime", "whisper-cli");
    this.model =
      options.model ||
      path.join(options.userData, "editor-models", "ggml-base.bin");
    fs.mkdirSync(options.userData, { recursive: true });
  }
  status() {
    return {
      enabled: process.env.HEIS_EDITOR === "1",
      ffmpeg: fs.existsSync(this.ffmpeg) && fs.existsSync(this.ffprobe),
      whisper: fs.existsSync(this.whisper),
      model: fs.existsSync(this.model),
    };
  }
  private emit(event: EditorEvent) {
    this.options.onEvent?.(event);
  }
  private session(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new Error("Open the project first");
    return s;
  }
  snapshot(id: string): EditorSnapshot {
    const s = this.session(id);
    return {
      project: structuredClone(s.project),
      canUndo: s.undo.length > 0,
      canRedo: s.redo.length > 0,
      saved: s.saved,
      directory: s.directory,
    };
  }
  list(): RecentEditorProject[] {
    try {
      return JSON.parse(fs.readFileSync(this.indexPath, "utf8"));
    } catch {
      return [];
    }
  }
  destinationProjectId(): string {
    return this.activeProjectId || this.library().projectId;
  }
  library(): { projectId: string; assets: ProjectAsset[] } {
    const directory = path.join(
      fs.realpathSync(this.options.userData),
      "editor-library",
    );
    let session = [...this.sessions.values()].find(
      (s) => s.directory === directory,
    );
    if (!session) {
      const active = this.activeProjectId;
      const snapshot = fs.existsSync(path.join(directory, "project.heis.json"))
        ? this.open(directory)
        : this.create(directory, "Library");
      session = this.session(snapshot.project.id);
      this.activeProjectId = active;
    }
    return {
      projectId: session.project.id,
      assets: structuredClone(session.project.assets),
    };
  }
  async importLibrary(projectId: string, assetId: string) {
    const library = this.library(),
      s = this.session(library.projectId),
      asset = s.project.assets.find((a) => a.id === assetId);
    if (!asset) throw new Error("Library asset missing");
    await this.importFiles(projectId, [this.safePath(s.directory, asset.path)]);
  }
  private atomic(destination: string, data: unknown) {
    const temp = `${destination}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(temp, destination);
  }
  private index(s: Session) {
    if (
      s.directory ===
      path.join(fs.realpathSync(this.options.userData), "editor-library")
    )
      return;
    this.atomic(
      this.indexPath,
      [
        {
          id: s.project.id,
          name: s.project.name,
          directory: s.directory,
          updatedAt: s.project.updatedAt,
        },
        ...this.list().filter(
          (p) => p.directory !== s.directory && p.id !== s.project.id,
        ),
      ].slice(0, 100),
    );
  }
  create(directory: string, name: string): EditorSnapshot {
    if (fs.existsSync(path.join(directory, "project.heis.json")))
      throw new Error("This folder already contains a project");
    fs.mkdirSync(directory, { recursive: true });
    for (const part of ["media", "cache", "recovery"])
      fs.mkdirSync(path.join(directory, part), { recursive: true });
    const project = newProject(randomUUID(), name, randomUUID());
    this.sessions.set(project.id, {
      directory: fs.realpathSync(directory),
      project,
      undo: [],
      redo: [],
      saved: false,
    });
    this.activeProjectId = project.id;
    this.flush(project.id);
    return this.snapshot(project.id);
  }
  open(directory: string): EditorSnapshot {
    const real = fs.realpathSync(directory),
      file = path.join(real, "project.heis.json");
    if (fs.statSync(file).size > 25 * 1024 * 1024)
      throw new Error("Project manifest is too large");
    let project: EditorProject;
    let recovered = false;
    try {
      project = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      project = JSON.parse(
        fs.readFileSync(path.join(real, "recovery", "last-good.json"), "utf8"),
      );
      recovered = true;
    }
    validateProject(project);
    const existing = this.sessions.get(project.id);
    if (existing && existing.directory !== real) this.flush(project.id);
    if (!existing || existing.directory !== real) {
      for (const a of project.assets)
        a.missing = !fs.existsSync(this.safePath(real, a.path));
      this.sessions.set(project.id, {
        directory: real,
        project,
        undo: [],
        redo: [],
        saved: !recovered,
      });
    }
    this.activeProjectId = project.id;
    this.index(this.session(project.id));
    if (recovered)
      this.emit({
        type: "error",
        message:
          "Recovered the last saved project after an interrupted or damaged save. Review it before continuing.",
      });
    try {
      const jobs = JSON.parse(
        fs.readFileSync(path.join(real, "jobs.json"), "utf8"),
      ) as EditorJob[];
      for (const job of jobs)
        if (!this.jobMap.has(job.id))
          this.jobMap.set(
            job.id,
            job.status === "running" && job.kind !== "generation"
              ? {
                  ...job,
                  status: "failed",
                  message: "Interrupted by restart. Retry this operation.",
                }
              : job,
          );
    } catch {
      /* A project does not need a job history to open. */
    }
    for (const job of this.jobs(project.id))
      if (job.kind === "generation" && job.status === "running")
        void this.pollGeneration(job.id);
    this.workflows.resumeProject(project.id);
    return this.snapshot(project.id);
  }
  flush(id: string) {
    const s = this.session(id);
    if (s.timer) clearTimeout(s.timer);
    if (s.saved) return;
    validateProject(s.project);
    const destination = path.join(s.directory, "project.heis.json");
    if (fs.existsSync(destination)) {
      try {
        const previous = JSON.parse(fs.readFileSync(destination, "utf8"));
        validateProject(previous);
        this.atomic(
          path.join(s.directory, "recovery", "last-good.json"),
          previous,
        );
      } catch {
        /* Never overwrite recovery with a corrupt manifest. */
      }
    }
    this.atomic(destination, s.project);
    s.saved = true;
    this.index(s);
    this.emit({ type: "project", snapshot: this.snapshot(id) });
  }
  close() {
    for (const id of this.sessions.keys()) this.flush(id);
    this.activeProjectId = null;
  }
  dispose() {
    this.workflows.dispose();
    this.disposed = true;
    this.close();
    for (const id of this.children.keys()) this.cancel(id);
  }
  private changed(s: Session) {
    s.saved = false;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      try {
        this.flush(s.project.id);
      } catch (error) {
        this.emit({ type: "error", message: String(error) });
      }
    }, 1000);
    this.emit({ type: "project", snapshot: this.snapshot(s.project.id) });
  }
  command(command: EditorCommand): EditorSnapshot {
    const s = this.session(command.projectId),
      next = applyEditorCommand(s.project, command);
    // Paths may only enter the model through media import, never agent commands.
    for (const edit of command.edits)
      if (edit.type === "asset.add")
        throw new Error("Use media import to register assets");
    s.undo.push(s.project);
    s.undo = s.undo.slice(-100);
    s.redo = [];
    s.project = next;
    this.changed(s);
    return this.snapshot(command.projectId);
  }
  history(id: string, revision: number, redo: boolean): EditorSnapshot {
    const s = this.session(id);
    if (s.project.revision !== revision)
      throw new Error("Project changed. Refresh before editing.");
    const source = redo ? s.redo : s.undo,
      destination = redo ? s.undo : s.redo,
      previous = source.pop();
    if (previous) {
      destination.push(s.project);
      s.project = {
        ...previous,
        assets: s.project.assets,
        revision: s.project.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      this.changed(s);
    }
    return this.snapshot(id);
  }
  safePath(directory: string, relative: string): string {
    if (
      !/^(media|cache)\//.test(relative) ||
      relative.includes("\\") ||
      relative.split("/").includes("..")
    )
      throw new Error("Invalid project asset path");
    const absolute = path.resolve(directory, relative);
    if (!absolute.startsWith(path.resolve(directory) + path.sep))
      throw new Error("Invalid project path");
    let ancestor = absolute;
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const resolved = fs.realpathSync(ancestor),
      root = fs.realpathSync(directory);
    if (resolved !== root && !resolved.startsWith(root + path.sep))
      throw new Error("External asset links are not supported");
    return absolute;
  }
  resolveMedia(url: string): string {
    const parsed = new URL(url),
      id = parsed.hostname,
      s = this.session(id);
    const relative = decodeURIComponent(parsed.pathname.slice(1));
    if (
      !s.project.assets.some((a) =>
        [a.path, a.proxyPath, a.thumbnailPath].includes(relative),
      )
    )
      throw new Error("Unknown project asset");
    return this.safePath(s.directory, relative);
  }
  private async run(
    binary: string,
    args: string[],
    jobId?: string,
    onProgress?: (text: string) => void,
  ): Promise<Buffer> {
    if (!fs.existsSync(binary))
      throw new Error(
        `Media runtime missing: ${path.basename(binary)}. Install the packaged media runtime.`,
      );
    if (jobId && this.cancelled.has(jobId)) throw new Error("Cancelled");
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, { shell: false, windowsHide: true });
      if (jobId) {
        if (!this.children.has(jobId)) this.children.set(jobId, new Set());
        this.children.get(jobId)!.add(child);
      }
      const chunks: Buffer[] = [];
      let stderr = "",
        total = 0;
      child.stdout.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > 64 * 1024 * 1024) {
          child.kill();
          reject(new Error("Media analysis exceeded output limit"));
          return;
        }
        chunks.push(chunk);
        onProgress?.(chunk.toString());
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-12000);
      });
      child.once("error", reject);
      child.once("close", (code) => {
        if (jobId) this.children.get(jobId)?.delete(child);
        code === 0
          ? resolve(Buffer.concat(chunks))
          : reject(
              new Error(
                jobId && this.cancelled.has(jobId)
                  ? "Cancelled"
                  : stderr || "Media operation failed",
              ),
            );
      });
    });
  }
  private saveJobs(id: string) {
    const s = this.session(id);
    this.atomic(path.join(s.directory, "jobs.json"), this.jobs(id));
  }
  private update(job: EditorJob, patch: Partial<EditorJob>) {
    Object.assign(job, patch);
    this.saveJobs(job.projectId);
    this.emit({ type: "job", job: { ...job } });
  }
  private start(
    id: string,
    kind: EditorJob["kind"],
    work: (job: EditorJob) => Promise<void>,
  ): EditorJob {
    this.session(id);
    const job: EditorJob = {
      id: randomUUID(),
      projectId: id,
      kind,
      status: "running",
      progress: 0,
    };
    this.jobMap.set(job.id, job);
    this.update(job, {});
    void work(job)
      .then(() =>
        this.update(job, {
          status: this.cancelled.has(job.id) ? "cancelled" : "succeeded",
          progress: 1,
        }),
      )
      .catch((error) =>
        this.update(job, {
          status: this.cancelled.has(job.id) ? "cancelled" : "failed",
          message: String(error.message || error),
        }),
      )
      .finally(() => {
        this.children.delete(job.id);
        this.cancelled.delete(job.id);
      });
    return { ...job };
  }
  jobs(id: string): EditorJob[] {
    return [...this.jobMap.values()]
      .filter((j) => j.projectId === id)
      .map((j) => ({ ...j }));
  }
  cancel(id: string) {
    const job = this.jobMap.get(id);
    if (!job || job.status !== "running") return;
    this.cancelled.add(id);
    if (job.kind === "generation") {
      void this.generationProvider
        ?.cancel?.(job.providerJobId!)
        .catch((error) => this.emit({ type: "error", message: String(error) }));
      this.update(job, { status: "cancelled" });
    }
    this.controllers.get(id)?.abort();
    this.children.get(id)?.forEach((child) => child.kill("SIGTERM"));
  }
  retry(id: string): EditorJob {
    const job = this.jobMap.get(id);
    if (!job || !["failed", "cancelled"].includes(job.status) || !job.request)
      throw new Error("This job cannot be retried");
    const r = job.request;
    if (job.kind === "export" && r.sequenceId && r.destination)
      return this.exportProject(job.projectId, r.sequenceId, r.destination);
    if (job.kind === "source-transcript" && r.sourceUrl) return this.transcribeSource(r.sourceUrl);
    if (job.kind === "clipping" && r.sourceUrl && r.ranges) return this.extractHighlights(r.sourceUrl, r.ranges);
    if (job.kind === "transcribe" && r.sequenceId)
      return this.transcribe(job.projectId, r.sequenceId, r.clipIds || []);
    if (job.kind === "import" && r.files)
      return this.importJob(job.projectId, r.files);
    throw new Error("Submit a new generation to retry this job");
  }
  output(id: string) {
    const job = this.jobMap.get(id);
    if (!job || job.status !== "succeeded" || !job.output)
      throw new Error("No completed output");
    return job.output;
  }
  async importFiles(
    id: string,
    files: string[],
    jobId?: string,
  ): Promise<ProjectAsset[]> {
    const s = this.session(id),
      assets: ProjectAsset[] = [];
    for (const file of files) {
      const meta = JSON.parse(
        (
          await this.run(
            this.ffprobe,
            [
              "-v",
              "error",
              "-show_streams",
              "-show_format",
              "-of",
              "json",
              file,
            ],
            jobId,
          )
        ).toString(),
      );
      const visual = meta.streams?.find(
        (v: { codec_type: string }) => v.codec_type === "video",
      );
      const audio = meta.streams?.find(
        (v: { codec_type: string }) => v.codec_type === "audio",
      );
      if (!visual && !audio) throw new Error("Unsupported media");
      const image = /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file),
        assetId = randomUUID();
      const extension = path.extname(file).toLowerCase();
      if (!/^\.[a-z0-9]{1,8}$/.test(extension))
        throw new Error("Invalid media extension");
      const relative = `media/${assetId}${extension}`,
        destination = this.safePath(s.directory, relative);
      await fsp.copyFile(file, destination, fs.constants.COPYFILE_EXCL);
      const a: ProjectAsset = {
        id: assetId,
        name: path.basename(file),
        path: relative,
        kind: image ? "image" : visual ? "video" : "audio",
        durationSeconds: image
          ? 5
          : Number(
              meta.format?.duration || visual?.duration || audio?.duration,
            ),
        width: Number(visual?.width || 0),
        height: Number(visual?.height || 0),
        hasAudio: Boolean(audio),
      };
      a.colorMatrix =
        visual?.color_space === "bt709"
          ? "bt709"
          : visual?.color_space === "bt2020nc"
            ? "bt2020"
            : ["bt470bg", "smpte170m"].includes(visual?.color_space)
              ? "bt601"
              : a.width >= 1280 || a.height >= 720
                ? "bt709"
                : "bt601";
      if (!Number.isFinite(a.durationSeconds) || a.durationSeconds <= 0)
        throw new Error("Media duration is unavailable");
      if (visual) {
        a.thumbnailPath = `cache/${assetId}.jpg`;
        await this.run(
          this.ffmpeg,
          [
            "-v",
            "error",
            "-y",
            "-i",
            destination,
            "-frames:v",
            "1",
            "-vf",
            "scale=240:-2",
            this.safePath(s.directory, a.thumbnailPath),
          ],
          jobId,
        );
      }
      if (!image && visual) {
        // A constant-frame-rate H.264 proxy is predictable in Chromium, including MOV/HEVC sources.
        a.proxyPath = `cache/${assetId}.mp4`;
        await this.run(
          this.ffmpeg,
          [
            "-v",
            "error",
            "-y",
            "-i",
            destination,
            "-vf",
            `scale='min(1280,iw)':-2:in_color_matrix=${a.colorMatrix}:out_color_matrix=bt709,fps=30`,
            ...this.videoEncoding(),
            "-colorspace",
            "bt709",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-color_range",
            "tv",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            this.safePath(s.directory, a.proxyPath),
          ],
          jobId,
        );
      }
      if (audio) {
        const analysis = await this.run(
          this.ffmpeg,
          [
            "-v",
            "error",
            "-i",
            destination,
            "-vn",
            "-af",
            "aresample=48000,asetnsamples=n=4800:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-",
            "-f",
            "null",
            "-",
          ],
          jobId,
        );
        const peaks = [
          ...analysis.toString().matchAll(/Peak_level=([^\s]+)/g),
        ].map((match) => Math.pow(10, Number(match[1]) / 20));
        const step = Math.max(1, Math.ceil(peaks.length / 1000));
        a.waveform = [];
        for (let i = 0; i < peaks.length; i += step)
          a.waveform.push(
            Math.min(1, Math.max(0, ...peaks.slice(i, i + step))),
          );
      }
      s.project = applyEditorCommand(s.project, {
        projectId: id,
        expectedRevision: s.project.revision,
        label: "Import media",
        edits: [{ type: "asset.add", asset: a }],
      });
      assets.push(a);
      this.changed(s);
    }
    return assets;
  }
  importJob(id: string, files: string[]) {
    return this.start(id, "import", async (job) => {
      this.update(job, { request: { files } });
      await this.importFiles(id, files, job.id);
    });
  }
  async relink(id: string, assetId: string, file: string) {
    const s = this.session(id),
      previous = s.project.assets.find((a) => a.id === assetId);
    if (!previous) throw new Error("Asset missing");
    const [replacement] = await this.importFiles(id, [file]);
    const draft = structuredClone(s.project);
    draft.assets = draft.assets
      .filter((a) => a.id !== replacement.id)
      .map((a) => (a.id === assetId ? { ...replacement, id: assetId } : a));
    validateProject(draft);
    s.project = draft;
    this.changed(s);
  }
  async capture(id: string, urls: string[], jobId: string) {
    const key = JSON.stringify([id, jobId, urls]);
    const pending = this.captures.get(key);
    if (pending) return pending;
    const work = this.captureResults(id, urls, jobId);
    this.captures.set(key, work);
    try {
      await work;
    } finally {
      this.captures.delete(key);
    }
  }
  private async captureResults(id: string, urls: string[], jobId: string) {
    const s = this.session(id);
    if (
      urls.every((_, index) =>
        s.project.assets.some((a) => a.sourceJobId === `${jobId}:${index}`),
      )
    )
      return;
    for (const [index, url] of urls.entries()) {
      if (
        s.project.assets.some(
          (a) => a.sourceJobId === `${jobId}:${index}`,
        )
      )
        continue;
      const parsed = new URL(url);
      if (parsed.protocol !== "https:")
        throw new Error("Generated media must use HTTPS");
      const response = await fetch(url);
      if (!response.ok || !response.body)
        throw new Error("Could not download generated media");
      const mime = response.headers.get("content-type") || "",
        ext = mime.startsWith("image/jpeg")
          ? ".jpg"
          : mime.startsWith("image/webp")
          ? ".webp"
          : mime.startsWith("image/")
          ? ".png"
          : mime.startsWith("audio/")
            ? ".mp3"
            : ".mp4";
      const temporary = path.join(
        s.directory,
        "cache",
        `${randomUUID()}${ext}`,
      );
      try {
        await pipeline(
          Readable.fromWeb(response.body as never),
          fs.createWriteStream(temporary),
        );
        const [a] = await this.importFiles(id, [temporary]);
        a.sourceJobId = `${jobId}:${index}`;
        const stored = s.project.assets.find((v) => v.id === a.id)!;
        stored.sourceJobId = `${jobId}:${index}`;
        stored.sourceUrl = url;
        this.changed(s);
      } finally {
        await fsp.unlink(temporary).catch(() => {});
      }
    }
  }
  addCaptions(
    id: string,
    sequenceId: string,
    cues: CaptionCue[],
    name: string,
    automatic = false,
  ) {
    const s = this.session(id),
      track = newTrack(randomUUID(), "caption", name);
    const edits: EditorEdit[] = [{ type: "track.add", sequenceId, track }];
    for (const cue of cues) {
      const clip = newClip(
        randomUUID(),
        track.id,
        cue.start,
        cue.duration,
        "Caption",
      );
      clip.y = 0.88;
      clip.captionSourceId = cue.sourceClipId;
      clip.captionOrigin = automatic
        ? cue.sourceClipId
          ? "source"
          : "sequence"
        : "manual";
      clip.text = {
        text: cue.text,
        fontSize: 48,
        color: "#ffffff",
        background: "#000000b3",
        align: "center",
        fontFamily: "Heis Sans",
      };
      edits.push({ type: "clip.add", sequenceId, clip });
    }
    this.command({
      projectId: id,
      expectedRevision: s.project.revision,
      label: name,
      edits,
    });
  }
  importCaptions(id: string, sequenceId: string, text: string) {
    const sequence = this.session(id).project.sequences.find(
      (s) => s.id === sequenceId,
    );
    if (!sequence) throw new Error("Sequence missing");
    this.addCaptions(
      id,
      sequenceId,
      parseSubtitles(text, fps(sequence)),
      "Imported captions",
    );
  }
  subtitles(id: string, sequenceId: string, vtt: boolean) {
    const sequence = this.session(id).project.sequences.find(
      (s) => s.id === sequenceId,
    );
    if (!sequence) throw new Error("Sequence missing");
    const tracks = new Set(
      sequence.tracks
        .filter((t) => t.kind === "caption" && !t.hidden)
        .map((t) => t.id),
    );
    return serializeSubtitles(
      sequence.clips
        .filter((c) => tracks.has(c.trackId))
        .map((c) => ({
          start: c.start,
          duration: c.duration,
          text: c.text?.text || "",
        })),
      fps(sequence),
      vtt,
    );
  }
  async compile(
    project: EditorProject,
    sequence: Sequence,
    directory: string,
    job: EditorJob,
    audioOnly = false,
  ): Promise<{ args: string[]; graph: string; duration: number }> {
    const rate = fps(sequence),
      duration = sequenceDuration(sequence) / rate,
      args: string[] = [],
      filters: string[] = [],
      audioLabels: string[] = [];
    let input = 0,
      layer = 0,
      base = "base";
    if (!audioOnly)
      filters.push(
        `color=c=black:s=${sequence.width}x${sequence.height}:r=${sequence.frameRate.numerator}/${sequence.frameRate.denominator}:d=${duration},format=rgba[base]`,
      );
    for (const track of sequence.tracks)
      for (const clip of sequence.clips.filter((c) => c.trackId === track.id)) {
        const audio = track.kind === "audio";
        if (audioOnly && !audio) continue;
        if (
          audio &&
          (track.muted ||
            clip.muted ||
            (audioOnly && track.role !== "dialogue"))
        )
          continue;
        if (!audio && track.hidden) continue;
        const asset = project.assets.find((a) => a.id === clip.assetId),
          start = clip.start / rate,
          length = clip.duration / rate;
        let file: string;
        if (asset) {
          file = this.safePath(directory, asset.path);
          if (!fs.existsSync(file))
            throw new Error(`Missing media: ${asset.name}`);
        } else {
          if (!clip.text || !this.options.rasterize)
            throw new Error("Text rasterizer unavailable");
          file = path.join(directory, "cache", `${job.id}-${clip.id}.png`);
          await this.options.rasterize(clip, sequence, file);
        }
        if (asset?.kind === "image" || !asset) args.push("-loop", "1");
        args.push("-i", file);
        const index = input++;
        const label = `c${layer++}`;
        if (audio) {
          if (!asset?.hasAudio && asset?.kind !== "audio") continue;
          let chain = `[${index}:a]atrim=start=${clip.sourceIn / rate}:duration=${length},asetpts=PTS-STARTPTS,aresample=48000,volume=${clip.volume * track.volume}`;
          if (clip.fadeIn) chain += `,afade=t=in:d=${clip.fadeIn / rate}`;
          if (clip.fadeOut)
            chain += `,afade=t=out:st=${length - clip.fadeOut / rate}:d=${clip.fadeOut / rate}`;
          chain += `,adelay=${Math.round(start * 1000)}:all=1[${label}]`;
          filters.push(chain);
          audioLabels.push(`[${label}]`);
          continue;
        }
        let chain = `[${index}:v]trim=start=${asset?.kind === "video" ? clip.sourceIn / rate : 0}:duration=${length},setpts=PTS-STARTPTS,fps=${rate}${asset?.kind === "video" ? `,scale=in_color_matrix=${asset.colorMatrix || (asset.width >= 1280 || asset.height >= 720 ? "bt709" : "bt601")}` : ""},format=rgba`;
        if (asset) {
          const cw = asset.width * (1 - clip.crop.left - clip.crop.right),
            ch = asset.height * (1 - clip.crop.top - clip.crop.bottom);
          const scale =
            (clip.fit === "fill"
              ? Math.max(sequence.width / cw, sequence.height / ch)
              : Math.min(sequence.width / cw, sequence.height / ch)) *
            clip.scale;
          chain += `,crop=${Math.max(1, Math.round(cw))}:${Math.max(1, Math.round(ch))}:${Math.round(asset.width * clip.crop.left)}:${Math.round(asset.height * clip.crop.top)},scale=${Math.max(2, Math.round(cw * scale))}:${Math.max(2, Math.round(ch * scale))}:flags=bilinear,setsar=1`;
          if (clip.rotation)
            chain += `,rotate=${(clip.rotation * Math.PI) / 180}:ow=rotw(${(clip.rotation * Math.PI) / 180}):oh=roth(${(clip.rotation * Math.PI) / 180}):c=none`;
        }
        chain += `,colorchannelmixer=aa=${clip.opacity}`;
        if (clip.fadeIn) chain += `,fade=t=in:d=${clip.fadeIn / rate}:alpha=1`;
        if (clip.fadeOut)
          chain += `,fade=t=out:st=${length - clip.fadeOut / rate}:d=${clip.fadeOut / rate}:alpha=1`;
        chain += `,setpts=PTS+${start}/TB[${label}]`;
        filters.push(chain);
        const next = `v${layer}`;
        filters.push(
          `[${base}][${label}]overlay=x=${asset ? `${clip.x * sequence.width}-overlay_w/2` : "0"}:y=${asset ? `${clip.y * sequence.height}-overlay_h/2` : "0"}:enable='gte(t,${start})*lt(t,${start + length})':eof_action=pass:format=auto[${next}]`,
        );
        base = next;
      }
    if (audioLabels.length)
      filters.push(
        `${audioLabels.join("")}amix=inputs=${audioLabels.length}:normalize=0,apad,atrim=duration=${duration}[audio]`,
      );
    else
      filters.push(
        `anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[audio]`,
      );
    if (!audioOnly)
      filters.push(
        `[${base}]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[video]`,
      );
    return { args, graph: filters.join(";"), duration };
  }
  exportProject(
    id: string,
    sequenceId: string,
    destination: string,
  ): EditorJob {
    const s = this.session(id),
      project = structuredClone(s.project),
      sequence = project.sequences.find((s) => s.id === sequenceId);
    if (!sequence) throw new Error("Sequence missing");
    if (!sequence.clips.length) throw new Error("Add clips before exporting");
    this.flush(id);
    return this.start(id, "export", async (job) => {
      this.update(job, { request: { sequenceId, destination } });
      const temporary = path.join(
        path.dirname(destination),
        `.${path.basename(destination)}.${job.id}.mp4`,
      );
      try {
        const plan = await this.compile(project, sequence, s.directory, job);
        await this.run(
          this.ffmpeg,
          [
            "-v",
            "error",
            "-y",
            ...plan.args,
            "-filter_complex_threads",
            "1",
            "-filter_complex",
            plan.graph,
            "-map",
            "[video]",
            "-map",
            "[audio]",
            ...this.videoEncoding(),
            "-colorspace",
            "bt709",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-color_range",
            "tv",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-t",
            String(plan.duration),
            "-movflags",
            "+faststart",
            "-progress",
            "pipe:1",
            temporary,
          ],
          job.id,
          (text) => {
            const match = /out_time_us=(\d+)/.exec(text);
            if (match)
              this.update(job, {
                progress: Math.min(
                  0.99,
                  Number(match[1]) / 1e6 / plan.duration,
                ),
              });
          },
        );
        if (this.cancelled.has(job.id)) throw new Error("Cancelled");
        await fsp.rename(temporary, destination);
        job.output = destination;
      } finally {
        await fsp.unlink(temporary).catch(() => {});
      }
    });
  }
  setGenerationProvider(provider: {
    getJob(
      id: string,
    ): Promise<{
      status: string;
      outputs: readonly { url?: string }[];
      error?: { message: string };
    }>;
    cancel?(id: string): Promise<void>;
  }) {
    this.generationProvider = provider;
  }
  watchGeneration(projectId: string, providerJobId: string) {
    if (this.jobs(projectId).some((j) => j.providerJobId === providerJobId))
      return;
    const job: EditorJob = {
      id: randomUUID(),
      projectId,
      providerJobId,
      kind: "generation",
      status: "running",
      progress: 0,
    };
    this.jobMap.set(job.id, job);
    this.update(job, {});
    void this.pollGeneration(job.id);
  }
  private async pollGeneration(id: string) {
    if (this.watching.has(id) || !this.generationProvider) return;
    this.watching.add(id);
    const job = this.jobMap.get(id)!;
    try {
      while (!this.disposed && !this.cancelled.has(id)) {
        const result = await this.generationProvider.getJob(job.providerJobId!);
        if (this.cancelled.has(id) || this.disposed) return;
        if (result.status === "succeeded") {
          await this.capture(
            job.projectId,
            result.outputs.flatMap((o) => (o.url ? [o.url] : [])),
            job.providerJobId!,
          );
          this.update(job, { status: "succeeded", progress: 1 });
          return;
        }
        if (result.status === "failed" || result.status === "cancelled") {
          this.update(job, {
            status: result.status,
            message: result.error?.message,
          });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      this.update(job, { message: `Waiting to reconnect: ${String(error)}` });
      if (!this.disposed)
        setTimeout(() => void this.pollGeneration(id), 15000).unref();
    } finally {
      this.watching.delete(id);
    }
  }
  private async ensureModel(job: EditorJob) {
    if (fs.existsSync(this.model)) return;
    await fsp.mkdir(path.dirname(this.model), { recursive: true });
    const temporary = `${this.model}.${job.id}.part`;
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    try {
      this.update(job, {
        message: "Downloading the multilingual caption model (142 MiB)…",
      });
      const response = await fetch(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        { signal: controller.signal },
      );
      if (!response.ok || !response.body)
        throw new Error("Caption model download failed");
      const hash = createHash("sha1");
      let bytes = 0;
      const stream = Readable.fromWeb(response.body as never);
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        hash.update(chunk);
        if (bytes > 200 * 1024 * 1024)
          stream.destroy(new Error("Caption model exceeds expected size"));
      });
      await pipeline(stream, fs.createWriteStream(temporary), {
        signal: controller.signal,
      });
      if (hash.digest("hex") !== "465707469ff3a37a2b9b8d8f89f2f99de7299dac")
        throw new Error("Caption model checksum mismatch");
      await fsp.rename(temporary, this.model);
      this.update(job, { message: "Transcribing locally…" });
    } finally {
      this.controllers.delete(job.id);
      await fsp.unlink(temporary).catch(() => {});
    }
  }
  async designFrame(projectId: string, sessionId: string, assetId: string, seconds: number) {
    const s = this.session(projectId), asset = s.project.assets.find(a => a.id === assetId);
    if (!asset || asset.kind !== "video" || !Number.isFinite(seconds) || seconds < 0 || seconds >= asset.durationSeconds) throw new Error("Choose a valid frame from a project video.");
    const temporary = path.join(s.directory,"cache",`${randomUUID()}.png`);
    try {
      await this.run(this.ffmpeg,["-v","error","-y","-ss",String(seconds),"-i",this.safePath(s.directory,asset.path),"-frames:v","1",temporary]);
      const [frame] = await this.importFiles(projectId,[temporary]);
      return this.designs.addReferences(projectId,sessionId,[frame.id]);
    } finally { await fsp.unlink(temporary).catch(()=>{}); }
  }
  private clippingSource(sourceUrl: string) {
    const url = new URL(sourceUrl);
    if (url.protocol !== "heis-project:") throw new Error("Choose an imported project video.");
    const session = this.session(url.hostname);
    const asset = session.project.assets.find(a => a.path === decodeURIComponent(url.pathname.slice(1)));
    if (!asset || asset.kind !== "video" || asset.missing) throw new Error("Choose an available video source.");
    if (!asset.hasAudio) throw new Error("AI clipping needs spoken audio. This video has no audio track.");
    if (asset.durationSeconds <= 0 || asset.durationSeconds > 7200) throw new Error("Choose a spoken video up to two hours long.");
    return { session, asset, input: this.resolveMedia(sourceUrl) };
  }
  transcribeSource(sourceUrl: string): EditorJob {
    const { session, asset, input } = this.clippingSource(sourceUrl);
    if (!fs.existsSync(this.whisper)) throw new Error("Install the packaged Whisper runtime before analyzing video.");
    return this.start(session.project.id, "source-transcript", async job => {
      this.update(job, { request: { sourceUrl }, message: "Preparing local transcript…" });
      await this.ensureModel(job);
      const audio = path.join(session.directory, "cache", `${job.id}.wav`);
      const output = path.join(session.directory, "cache", job.id);
      try {
        await this.run(this.ffmpeg, ["-v", "error", "-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", audio], job.id);
        this.update(job, { progress: .25, message: "Transcribing speech locally…" });
        await this.run(this.whisper, ["-m", this.model, "-f", audio, "-l", "auto", "-osrt", "-of", output], job.id);
        const cues = parseSubtitles(await fsp.readFile(`${output}.srt`, "utf8"), 1000).map(c => ({ start: c.start / 1000, end: Math.min(asset.durationSeconds, (c.start + c.duration) / 1000), text: c.text })).filter(c => c.end > c.start);
        if (!cues.length) throw new Error("No speech was detected. Choose a video with clear dialogue.");
        this.update(job, { transcript: { duration: asset.durationSeconds, cues }, message: "Transcript ready for review." });
      } finally { await fsp.unlink(audio).catch(() => {}); await fsp.unlink(`${output}.srt`).catch(() => {}); }
    });
  }
  extractHighlights(sourceUrl: string, ranges: RankedHighlight[]): EditorJob {
    const { session, asset, input } = this.clippingSource(sourceUrl);
    if (!Array.isArray(ranges) || !ranges.length || ranges.length > 10 || ranges.some(r => !r || !Number.isFinite(r.start) || !Number.isFinite(r.end) || r.start < 0 || r.end > asset.durationSeconds || r.end - r.start < 1 || r.end - r.start > 180 || typeof r.title !== "string" || r.title.length > 120)) throw new Error("Choose 1 to 10 valid source ranges, each up to three minutes long.");
    const selected = structuredClone(ranges);
    return this.start(session.project.id, "clipping", async job => {
      this.update(job, { request: { sourceUrl, ranges: selected }, message: "Creating selected clips locally…" });
      for (const [index, range] of selected.entries()) {
        const temporary = path.join(session.directory, "cache", `${job.id}-${index}.mp4`);
        try {
          await this.run(this.ffmpeg, ["-v", "error", "-y", "-ss", String(range.start), "-i", input, "-t", String(range.end - range.start), "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", ...this.videoEncoding(), "-c:a", "aac", "-movflags", "+faststart", temporary], job.id);
          const [created] = await this.importFiles(session.project.id, [temporary], job.id);
          const stored = session.project.assets.find(a => a.id === created.id)!;
          stored.name = range.title || `Highlight ${index + 1}`;
          stored.sourceJobId = `${job.id}:${index}`;
          this.changed(session);
          this.update(job, { progress: (index + 1) / selected.length });
        } finally { await fsp.unlink(temporary).catch(() => {}); }
      }
      this.update(job, { message: `${selected.length} clips saved to the source project library. Add them to the timeline when ready.` });
    });
  }
  transcribe(id: string, sequenceId: string, clipIds: string[]): EditorJob {
    if (!fs.existsSync(this.whisper))
      throw new Error(
        "The packaged Whisper runtime is missing. Install the media runtime before transcribing.",
      );
    const s = this.session(id),
      project = structuredClone(s.project),
      sequence = project.sequences.find((s) => s.id === sequenceId);
    if (!sequence) throw new Error("Sequence missing");
    const revision = project.revision;
    if (clipIds.length) {
      const selected = new Set(clipIds);
      const links = new Set(
        sequence.clips
          .filter((c) => selected.has(c.id))
          .map((c) => c.linkId)
          .filter(Boolean),
      );
      sequence.clips = sequence.clips.filter(
        (c) => selected.has(c.id) || (c.linkId && links.has(c.linkId)),
      );
    }
    return this.start(id, "transcribe", async (job) => {
      this.update(job, { request: { sequenceId, clipIds } });
      await this.ensureModel(job);
      const audio = path.join(s.directory, "cache", `${job.id}.wav`),
        output = path.join(s.directory, "cache", job.id);
      const plan = await this.compile(
        project,
        sequence,
        s.directory,
        job,
        true,
      );
      await this.run(
        this.ffmpeg,
        [
          "-v",
          "error",
          "-y",
          ...plan.args,
          "-filter_complex",
          plan.graph,
          "-map",
          "[audio]",
          "-ac",
          "1",
          "-ar",
          "16000",
          audio,
        ],
        job.id,
      );
      await this.run(
        this.whisper,
        ["-m", this.model, "-f", audio, "-l", "auto", "-osrt", "-of", output],
        job.id,
      );
      const cues = parseSubtitles(
        await fsp.readFile(`${output}.srt`, "utf8"),
        fps(sequence),
      );
      if (this.session(id).project.revision !== revision) {
        job.output = `${output}.srt`;
        job.message =
          "Project changed during transcription. Import the generated subtitles after reviewing their timing.";
        return;
      }
      if (clipIds.length === 1)
        for (const cue of cues) cue.sourceClipId = clipIds[0];
      this.addCaptions(id, sequenceId, cues, "Automatic captions", true);
    });
  }
}
