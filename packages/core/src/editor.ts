import { validColor, type ColorCorrection } from "./editorColor";
import type { WorkflowBridge } from "./workflow";
import type { DesignBridge } from "./design";
import type { TranscriptCue, RankedHighlight } from "./highlights";

export const EDITOR_SCHEMA_VERSION = 1;
export type FrameRate = { numerator: number; denominator: number };
export type TrackKind = "video" | "audio" | "title" | "caption";
export interface ProjectAsset {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
  path: string;
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
  proxyPath?: string;
  thumbnailPath?: string;
  waveform?: number[];
  missing?: boolean;
  sourceJobId?: string;
  sourceUrl?: string;
  colorMatrix?: "bt709" | "bt601" | "bt2020";
}
export interface TextStyle {
  text: string;
  fontSize: number;
  color: string;
  background: string;
  align: "left" | "center" | "right";
  fontFamily: string;
}
export interface TimelineClip {
  id: string;
  trackId: string;
  assetId?: string;
  name: string;
  start: number;
  duration: number;
  sourceIn: number;
  linkId?: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  color?: ColorCorrection;
  fit: "fit" | "fill";
  crop: { left: number; right: number; top: number; bottom: number };
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  text?: TextStyle;
  captionSourceId?: string;
  captionOrigin?: "manual" | "source" | "sequence";
  needsReview?: boolean;
}
export interface CaptionCue {
  start: number;
  duration: number;
  text: string;
  sourceClipId?: string;
}
export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  volume: number;
  role: "dialogue" | "music" | "sfx";
}
export interface Sequence {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRate: FrameRate;
  tracks: Track[];
  clips: TimelineClip[];
}
export interface EditorProject {
  schemaVersion: number;
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  activeSequenceId: string;
  assets: ProjectAsset[];
  sequences: Sequence[];
}
export type EditorEdit =
  | { type: "rename"; name: string }
  | { type: "asset.add"; asset: ProjectAsset }
  | { type: "sequence.add"; sequence: Sequence }
  | { type: "sequence.select"; id: string }
  | {
      type: "sequence.update";
      id: string;
      patch: Partial<Pick<Sequence, "name" | "width" | "height" | "frameRate">>;
    }
  | { type: "track.add"; sequenceId: string; track: Track }
  | { type: "track.move"; sequenceId: string; id: string; index: number }
  | {
      type: "track.update";
      sequenceId: string;
      id: string;
      patch: Partial<Omit<Track, "id" | "kind">>;
    }
  | { type: "clip.add"; sequenceId: string; clip: TimelineClip }
  | {
      type: "clip.update";
      sequenceId: string;
      id: string;
      linked?: boolean;
      patch: Partial<Omit<TimelineClip, "id">>;
    }
  | {
      type: "clip.split";
      sequenceId: string;
      id: string;
      frame: number;
      newId: string;
    }
  | {
      type: "clip.remove";
      sequenceId: string;
      ids: string[];
      ripple?: boolean;
    };
export interface EditorCommand {
  projectId: string;
  expectedRevision: number;
  label: string;
  edits: EditorEdit[];
}
export interface ToolContext {
  projectId: string;
  sequenceId: string;
  selectedClipIds: string[];
  assetIds: string[];
  frame?: number;
}
export interface ToolResult {
  projectId: string;
  jobId: string;
  assets: ProjectAsset[];
}
export interface EditorJob {
  id: string;
  projectId: string;
  kind:
    | "export"
    | "transcribe"
    | "import"
    | "generation"
    | "source-transcript"
    | "clipping"
    | "workflow";
  transcript?: { duration: number; cues: TranscriptCue[] };
  status: "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  message?: string;
  output?: string;
  providerJobId?: string;
  request?: {
    sequenceId?: string;
    clipIds?: string[];
    files?: string[];
    destination?: string;
    sourceUrl?: string;
    ranges?: RankedHighlight[];
  };
}
export interface EditorSnapshot {
  project: EditorProject;
  canUndo: boolean;
  canRedo: boolean;
  saved: boolean;
  directory: string;
}
export interface RecentEditorProject {
  id: string;
  name: string;
  directory: string;
  updatedAt: string;
}
export interface EditorRuntimeStatus {
  enabled: boolean;
  ffmpeg: boolean;
  whisper: boolean;
  model: boolean;
}
export type EditorEvent =
  | { type: "project"; snapshot: EditorSnapshot }
  | { type: "job"; job: EditorJob }
  | { type: "error"; message: string };
export interface EditorBridge extends DesignBridge, WorkflowBridge {
  status(): Promise<EditorRuntimeStatus>;
  chooseClippingSource(): Promise<{ url: string; name: string } | null>;
  transcribeSource(sourceUrl: string): Promise<EditorJob>;
  extractHighlights(
    sourceUrl: string,
    ranges: RankedHighlight[],
  ): Promise<EditorJob>;
  setContext(context: ToolContext): Promise<void>;
  list(): Promise<RecentEditorProject[]>;
  library(): Promise<{ projectId: string; assets: ProjectAsset[] }>;
  importLibrary(projectId: string, assetId: string): Promise<void>;
  create(name: string): Promise<EditorSnapshot | null>;
  open(directory?: string): Promise<EditorSnapshot | null>;
  close(): Promise<void>;
  command(command: EditorCommand): Promise<EditorSnapshot>;
  undo(projectId: string, revision: number): Promise<EditorSnapshot>;
  redo(projectId: string, revision: number): Promise<EditorSnapshot>;
  importMedia(projectId: string): Promise<void>;
  relink(projectId: string, assetId: string): Promise<void>;
  export(projectId: string, sequenceId: string): Promise<EditorJob | null>;
  transcribe(
    projectId: string,
    sequenceId: string,
    clipIds: string[],
  ): Promise<EditorJob>;
  importCaptions(projectId: string, sequenceId: string): Promise<void>;
  exportCaptions(projectId: string, sequenceId: string): Promise<void>;
  cancel(jobId: string): Promise<void>;
  retry(jobId: string): Promise<EditorJob>;
  jobs(projectId: string): Promise<EditorJob[]>;
  reveal(jobId: string): Promise<void>;
  capture(projectId: string, urls: string[], jobId: string): Promise<void>;
  onEvent(callback: (event: EditorEvent) => void): () => void;
}
export function fps(sequence: Sequence): number {
  return sequence.frameRate.numerator / sequence.frameRate.denominator;
}
export function sequenceDuration(sequence: Sequence): number {
  return Math.max(1, ...sequence.clips.map((c) => c.start + c.duration));
}
export function newTrack(id: string, kind: TrackKind, name: string): Track {
  return {
    id,
    kind,
    name,
    locked: false,
    hidden: false,
    muted: false,
    volume: 1,
    role: "dialogue",
  };
}
export function newSequence(id: string, name = "Sequence 1"): Sequence {
  return {
    id,
    name,
    width: 1920,
    height: 1080,
    frameRate: { numerator: 30, denominator: 1 },
    tracks: [
      newTrack(`${id}-video`, "video", "Video 1"),
      newTrack(`${id}-audio`, "audio", "Audio 1"),
    ],
    clips: [],
  };
}
export function newProject(
  id: string,
  name: string,
  sequenceId: string,
): EditorProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id,
    name: name.trim() || "Untitled project",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    activeSequenceId: sequenceId,
    assets: [],
    sequences: [newSequence(sequenceId)],
  };
}
export function newClip(
  id: string,
  trackId: string,
  start: number,
  duration: number,
  name: string,
): TimelineClip {
  return {
    id,
    trackId,
    name,
    start,
    duration,
    sourceIn: 0,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    opacity: 1,
    fit: "fit",
    crop: { left: 0, right: 0, top: 0, bottom: 0 },
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function finite(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}
function integer(value: number, min = 0) {
  return Number.isSafeInteger(value) && value >= min;
}
export function validateProject(p: EditorProject): void {
  assert(
    p.schemaVersion === EDITOR_SCHEMA_VERSION,
    "Unsupported project version",
  );
  assert(
    typeof p.id === "string" && p.id.length > 0 && integer(p.revision),
    "Invalid project identity",
  );
  assert(
    typeof p.name === "string" &&
      p.name.trim().length > 0 &&
      p.name.length <= 200,
    "Invalid project name",
  );
  assert(
    Array.isArray(p.assets) &&
      Array.isArray(p.sequences) &&
      p.sequences.length > 0,
    "Invalid project contents",
  );
  const unique = (ids: string[]) =>
    ids.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(ids).size === ids.length;
  assert(
    unique(p.assets.map((a) => a.id)) && unique(p.sequences.map((s) => s.id)),
    "Duplicate asset or sequence IDs",
  );
  assert(
    p.sequences.some((s) => s.id === p.activeSequenceId),
    "Active sequence is missing",
  );
  for (const a of p.assets) {
    assert(
      ["video", "image", "audio"].includes(a.kind) &&
        finite(a.durationSeconds, 0, 1e9),
      "Invalid asset",
    );
    for (const file of [a.path, a.proxyPath, a.thumbnailPath].filter(
      Boolean,
    ) as string[])
      assert(
        !file.startsWith("/") &&
          !file.includes("\\") &&
          !file.split("/").includes("..") &&
          /^(media|cache)\//.test(file),
        "Invalid asset path",
      );
  }
  for (const s of p.sequences) {
    assert(
      integer(s.width, 2) &&
        integer(s.height, 2) &&
        s.width <= 7680 &&
        s.height <= 7680 &&
        s.width % 2 === 0 &&
        s.height % 2 === 0,
      "Resolution must use even dimensions between 2 and 7680",
    );
    assert(
      integer(s.frameRate.numerator, 1) &&
        integer(s.frameRate.denominator, 1) &&
        finite(fps(s), 1, 120),
      "Invalid frame rate",
    );
    assert(
      unique(s.tracks.map((t) => t.id)) && unique(s.clips.map((c) => c.id)),
      "Duplicate timeline IDs",
    );
    for (const t of s.tracks)
      assert(
        ["video", "audio", "title", "caption"].includes(t.kind) &&
          finite(t.volume, 0, 4),
        "Invalid track",
      );
    for (const c of s.clips) {
      const track = s.tracks.find((t) => t.id === c.trackId);
      assert(track, "Clip track is missing");
      assert(
        integer(c.start) && integer(c.duration, 1) && integer(c.sourceIn),
        "Clip times must be non-negative integer frames",
      );
      assert(
        finite(c.x, -10, 10) &&
          finite(c.y, -10, 10) &&
          finite(c.scale, 0.01, 20) &&
          finite(c.rotation, -3600, 3600) &&
          finite(c.opacity, 0, 1) &&
          finite(c.volume, 0, 4),
        "Invalid clip properties",
      );
      assert(!c.color || validColor(c.color), "Invalid color correction");
      assert(
        integer(c.fadeIn) &&
          integer(c.fadeOut) &&
          c.fadeIn + c.fadeOut <= c.duration,
        "Fades exceed clip length",
      );
      assert(
        ["fit", "fill"].includes(c.fit) &&
          Object.values(c.crop).every((v) => finite(v, 0, 0.99)) &&
          c.crop.left + c.crop.right < 1 &&
          c.crop.top + c.crop.bottom < 1,
        "Invalid crop",
      );
      if (c.assetId) {
        const a = p.assets.find((a) => a.id === c.assetId);
        assert(a, "Clip asset is missing");
        assert(
          track.kind === "audio"
            ? a.kind === "audio" || (a.kind === "video" && a.hasAudio)
            : track.kind === "video" && a.kind !== "audio",
          "Asset is incompatible with track",
        );
        if (a.kind !== "image")
          assert(
            c.sourceIn + c.duration <=
              Math.ceil(a.durationSeconds * fps(s)) + 1,
            "Clip exceeds source duration",
          );
      } else
        assert(
          c.text && ["title", "caption"].includes(track.kind),
          "Clip needs media or text",
        );
      if (c.text)
        assert(
          typeof c.text.text === "string" &&
            c.text.text.length <= 10000 &&
            finite(c.text.fontSize, 8, 500),
          "Invalid text",
        );
    }
  }
}
export function applyEditorCommand(
  project: EditorProject,
  command: EditorCommand,
): EditorProject {
  assert(
    command.projectId === project.id &&
      command.expectedRevision === project.revision,
    "Project changed. Refresh before applying this edit.",
  );
  assert(
    Array.isArray(command.edits) &&
      command.edits.length > 0 &&
      command.edits.length <= 10000,
    "Invalid edit batch",
  );
  const p: EditorProject = JSON.parse(JSON.stringify(project));
  for (const edit of command.edits) {
    if (edit.type === "rename") {
      p.name = edit.name.trim();
      continue;
    }
    if (edit.type === "asset.add") {
      p.assets.push(edit.asset);
      continue;
    }
    if (edit.type === "sequence.add") {
      p.sequences.push(edit.sequence);
      p.activeSequenceId = edit.sequence.id;
      continue;
    }
    if (edit.type === "sequence.select") {
      p.activeSequenceId = edit.id;
      continue;
    }
    if (edit.type === "sequence.update") {
      const s = p.sequences.find((s) => s.id === edit.id);
      assert(s, "Sequence missing");
      Object.assign(s, edit.patch);
      continue;
    }
    const s = p.sequences.find((s) => s.id === edit.sequenceId);
    assert(s, "Sequence missing");
    if (edit.type === "track.add") {
      s.tracks.push(edit.track);
      continue;
    }
    if (edit.type === "track.move") {
      const index = s.tracks.findIndex((t) => t.id === edit.id);
      assert(index >= 0, "Track missing");
      assert(!s.tracks[index].locked, "Track is locked");
      assert(
        integer(edit.index) && edit.index < s.tracks.length,
        "Invalid track position",
      );
      const [track] = s.tracks.splice(index, 1);
      s.tracks.splice(edit.index, 0, track);
      continue;
    }
    if (edit.type === "track.update") {
      const t = s.tracks.find((t) => t.id === edit.id);
      assert(t, "Track missing");
      Object.assign(t, edit.patch);
      continue;
    }
    if (edit.type === "clip.add") {
      assert(
        !s.tracks.find((t) => t.id === edit.clip.trackId)?.locked,
        "Track is locked",
      );
      s.clips.push(edit.clip);
      continue;
    }
    if (edit.type === "clip.remove") {
      const removed = s.clips.filter((c) => edit.ids.includes(c.id));
      const links = new Set(removed.map((c) => c.linkId).filter(Boolean));
      const all = s.clips.filter(
        (c) =>
          edit.ids.includes(c.id) ||
          (c.linkId && links.has(c.linkId)) ||
          (c.captionSourceId && edit.ids.includes(c.captionSourceId)),
      );
      assert(
        all.every((c) => !s.tracks.find((t) => t.id === c.trackId)?.locked),
        "Track is locked",
      );
      const removedIds = new Set(all.map((c) => c.id));
      s.clips = s.clips.filter((c) => !removedIds.has(c.id));
      if (edit.ripple && all.length) {
        const start = Math.min(...all.map((c) => c.start));
        const end = Math.max(...all.map((c) => c.start + c.duration));
        assert(
          !s.clips.some((c) => c.start < end && c.start + c.duration > start),
          "Ripple delete requires an empty range across tracks",
        );
        const shifted = s.clips.filter((c) => c.start >= end);
        assert(
          shifted.every(
            (c) => !s.tracks.find((t) => t.id === c.trackId)?.locked,
          ),
          "Track is locked",
        );
        shifted.forEach((c) => {
          c.start -= end - start;
        });
      }
      continue;
    }
    const c = s.clips.find((c) => c.id === edit.id);
    assert(c, "Clip missing");
    const linked = s.clips.filter(
      (other) =>
        other.id === c.id ||
        (!(edit.type === "clip.update" && edit.linked === false) &&
          c.linkId &&
          other.linkId === c.linkId),
    );
    assert(
      linked.every(
        (item) => !s.tracks.find((t) => t.id === item.trackId)?.locked,
      ),
      "Track is locked",
    );
    if (
      (edit.type === "clip.update" &&
        (edit.patch.start !== undefined ||
          edit.patch.sourceIn !== undefined ||
          edit.patch.duration !== undefined)) ||
      edit.type === "clip.split"
    )
      assert(
        s.clips
          .filter((item) => item.captionSourceId === c.id)
          .every(
            (item) => !s.tracks.find((t) => t.id === item.trackId)?.locked,
          ),
        "Associated caption track is locked",
      );
    if (edit.type === "clip.split") {
      assert(
        edit.frame > c.start && edit.frame < c.start + c.duration,
        "Split must be inside the clip",
      );
      const offset = edit.frame - c.start;
      for (const item of linked) {
        const right = {
          ...JSON.parse(JSON.stringify(item)),
          id: item.id === c.id ? edit.newId : `${edit.newId}-${item.id}`,
          start: item.start + offset,
          sourceIn: item.sourceIn + offset,
          duration: item.duration - offset,
          fadeIn: 0,
          linkId: item.linkId ? `${edit.newId}-link` : undefined,
        };
        item.duration = offset;
        item.fadeOut = 0;
        item.fadeIn = Math.min(item.fadeIn, offset);
        right.fadeOut = Math.min(right.fadeOut, right.duration);
        s.clips.push(right);
      }
      s.clips
        .filter((item) => item.captionSourceId === c.id)
        .forEach((item) => {
          item.needsReview = true;
        });
    } else if (edit.type === "clip.update") {
      if (edit.patch.trackId)
        assert(
          !s.tracks.find((t) => t.id === edit.patch.trackId)?.locked,
          "Target track is locked",
        );
      const delta = (edit.patch.start ?? c.start) - c.start;
      const timing =
        edit.patch.start !== undefined ||
        edit.patch.duration !== undefined ||
        edit.patch.sourceIn !== undefined;
      for (const item of linked) {
        if (item.id === c.id) continue;
        if (edit.patch.start !== undefined) item.start += delta;
        if (edit.patch.duration !== undefined)
          item.duration = edit.patch.duration;
        if (edit.patch.sourceIn !== undefined)
          item.sourceIn += edit.patch.sourceIn - c.sourceIn;
        for (const key of ["volume", "muted", "fadeIn", "fadeOut"] as const)
          if (edit.patch[key] !== undefined)
            (item as unknown as Record<string, unknown>)[key] = edit.patch[key];
        if (edit.patch.linkId !== undefined)
          item.linkId = edit.patch.linkId || undefined;
      }
      const oldStart = c.start;
      const oldSource = c.sourceIn;
      Object.assign(c, edit.patch);
      if (timing)
        for (const cue of s.clips.filter(
          (item) => item.captionSourceId === c.id,
        )) {
          cue.start += c.start - oldStart - (c.sourceIn - oldSource);
          const end = Math.min(c.start + c.duration, cue.start + cue.duration);
          cue.start = Math.max(c.start, cue.start);
          cue.duration = Math.max(0, end - cue.start);
        }
      s.clips = s.clips.filter((item) => item.duration > 0);
    } else throw new Error("Unknown editor command");
  }
  for (const sequence of p.sequences) {
    const original = project.sequences.find((s) => s.id === sequence.id);
    if (!original) continue;
    const timing = (s: Sequence) =>
      JSON.stringify(
        s.clips
          .filter((c) => c.assetId)
          .map((c) => [c.id, c.start, c.duration, c.sourceIn, c.assetId]),
      );
    if (timing(original) !== timing(sequence))
      sequence.clips
        .filter((c) => c.captionOrigin === "sequence")
        .forEach((c) => {
          c.needsReview = true;
        });
  }
  p.revision++;
  p.updatedAt = new Date().toISOString();
  validateProject(p);
  return p;
}
export interface RenderLayer {
  clip: TimelineClip;
  track: Track;
  asset?: ProjectAsset;
  sourceSeconds: number;
  alpha: number;
  gain: number;
}
export function renderFrame(
  project: EditorProject,
  sequence: Sequence,
  frame: number,
): RenderLayer[] {
  return sequence.tracks.flatMap((track) =>
    sequence.clips
      .filter(
        (c) =>
          c.trackId === track.id &&
          frame >= c.start &&
          frame < c.start + c.duration,
      )
      .map((clip) => {
        const local = frame - clip.start;
        const fade = Math.min(
          1,
          clip.fadeIn ? local / clip.fadeIn : 1,
          clip.fadeOut ? (clip.duration - local) / clip.fadeOut : 1,
        );
        return {
          clip,
          track,
          asset: project.assets.find((a) => a.id === clip.assetId),
          sourceSeconds: (clip.sourceIn + local) / fps(sequence),
          alpha: track.hidden ? 0 : clip.opacity * fade,
          gain:
            track.muted || clip.muted ? 0 : track.volume * clip.volume * fade,
        };
      }),
  );
}
export function parseSubtitles(text: string, frameRate: number): CaptionCue[] {
  const time = (s: string) => {
    const values = s.replace(",", ".").split(":").map(Number);
    return values.reduce((a, b) => a * 60 + b, 0);
  };
  return text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block.trim().split("\n");
      const index = lines.findIndex((l) => l.includes("-->"));
      if (index < 0) return [];
      const [a, b] = lines[index]
        .split("-->")
        .map((s) => s.trim().split(/\s/)[0]);
      const start = Math.round(time(a) * frameRate),
        end = Math.round(time(b) * frameRate);
      if (!integer(start) || !integer(end) || end <= start)
        throw new Error("Invalid subtitle timing");
      return [
        {
          start,
          duration: end - start,
          text: lines
            .slice(index + 1)
            .join("\n")
            .replace(/<[^>]+>/g, ""),
        },
      ];
    });
}
export function serializeSubtitles(
  cues: CaptionCue[],
  frameRate: number,
  vtt = false,
): string {
  const time = (frame: number) => {
    const ms = Math.round((frame / frameRate) * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${vtt ? "." : ","}${String(ms % 1000).padStart(3, "0")}`;
  };
  return (
    (vtt ? "WEBVTT\n\n" : "") +
    [...cues]
      .sort((a, b) => a.start - b.start)
      .map(
        (cue, i) =>
          `${i + 1}\n${time(cue.start)} --> ${time(cue.start + cue.duration)}\n${cue.text}\n`,
      )
      .join("\n")
  );
}
