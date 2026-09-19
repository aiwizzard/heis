import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DESIGN_MODELS,
  getCapability,
  newClip,
  newTrack,
  validateGenerationRequest,
} from "@heis/core";
import type {
  DesignSession,
  DesignPatch,
  DesignSnapshot,
  DesignGeneration,
  GenerationRequest,
  EditorEdit,
} from "@heis/core";
import type { EditorService } from "./service";

export class DesignStore {
  constructor(private editor: EditorService) {}
  private directory(projectId: string) {
    const root = this.editor.snapshot(projectId).directory;
    const directory = path.join(root, "designs");
    fs.mkdirSync(directory, { recursive: true });
    if (
      fs.realpathSync(directory) !== path.join(fs.realpathSync(root), "designs")
    )
      throw new Error("External design folders are not supported.");
    return directory;
  }
  private file(projectId: string, id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new Error("Invalid design session ID.");
    return path.join(this.directory(projectId), `${id}.json`);
  }
  private write(session: DesignSession) {
    const file = this.file(session.projectId, session.id),
      tmp = `${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(session), { mode: 0o600, flag: "wx" });
    fs.renameSync(tmp, file);
  }
  list(projectId: string) {
    return fs
      .readdirSync(this.directory(projectId))
      .filter((f) => /^[a-f0-9-]{36}\.json$/.test(f))
      .map((f) => {
        const session = this.read(projectId, f.slice(0, -5));
        return { id: session.id, name: session.name };
      });
  }
  read(projectId: string, id: string): DesignSession {
    const file = this.file(projectId, id);
    if (fs.lstatSync(file).isSymbolicLink())
      throw new Error("External design files are not supported.");
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      s.version !== 1 ||
      s.projectId !== projectId ||
      s.id !== id ||
      !Number.isInteger(s.revision) ||
      !Array.isArray(s.cards) ||
      !Array.isArray(s.jobs) ||
      !Array.isArray(s.referenceAssetIds)
    )
      throw new Error(
        "Unsupported or damaged design session. Original file was preserved.",
      );
    return s;
  }
  create(projectId: string) {
    const session: DesignSession = {
      version: 1,
      id: randomUUID(),
      projectId,
      revision: 0,
      name: "Untitled design",
      brief: "",
      width: 1024,
      height: 1024,
      colors: "",
      referenceAssetIds: [],
      cards: [],
      jobs: [],
    };
    this.write(session);
    return this.snapshot(projectId, session.id);
  }
  snapshot(projectId: string, id: string): DesignSnapshot {
    const session = this.read(projectId, id),
      project = this.editor.snapshot(projectId);
    for (const job of session.jobs)
      this.editor.watchGeneration(projectId, job.providerJobId);
    const generated = project.project.assets.filter((a) =>
      session.jobs.some((j) =>
        a.sourceJobId?.startsWith(j.providerJobId + ":"),
      ),
    );
    let changed = false;
    for (const asset of generated)
      if (!session.cards.some((c) => c.assetId === asset.id)) {
        session.cards.push({
          assetId: asset.id,
          x: (session.cards.length % 3) * 230 + 20,
          y: Math.floor(session.cards.length / 3) * 190 + 20,
        });
        changed = true;
      }
    if (changed) {
      session.revision++;
      this.write(session);
    }
    return {
      session,
      project,
      jobs: this.editor
        .jobs(projectId)
        .filter((j) =>
          session.jobs.some((s) => s.providerJobId === j.providerJobId),
        ),
    };
  }
  update(projectId: string, id: string, revision: number, patch: DesignPatch) {
    const s = this.read(projectId, id),
      assets = this.editor.snapshot(projectId).project.assets;
    if (revision !== s.revision)
      throw new Error("Design changed. Refresh before editing.");
    const allowed = [
      "name",
      "brief",
      "width",
      "height",
      "colors",
      "referenceAssetIds",
      "cards",
    ];
    if (!patch || Object.keys(patch).some((k) => !allowed.includes(k)))
      throw new Error("Invalid design change.");
    for (const field of ["name", "brief", "colors"] as const)
      if (
        patch[field] !== undefined &&
        (typeof patch[field] !== "string" ||
          patch[field]!.length > (field === "brief" ? 8000 : 200))
      )
        throw new Error("Design text is too long.");
    for (const field of ["width", "height"] as const)
      if (
        patch[field] !== undefined &&
        (!Number.isInteger(patch[field]) ||
          patch[field]! < 256 ||
          patch[field]! > 2048 ||
          patch[field]! % 64)
      )
        throw new Error(
          "Design dimensions must be multiples of 64 between 256 and 2048.",
        );
    if (
      patch.referenceAssetIds !== undefined &&
      (!Array.isArray(patch.referenceAssetIds) ||
        patch.referenceAssetIds.length > 8 ||
        patch.referenceAssetIds.some(
          (id) =>
            !assets.some(
              (a) => a.id === id && a.kind === "image" && !a.missing,
            ),
        ))
    )
      throw new Error("Choose up to eight available image references.");
    if (
      patch.cards !== undefined &&
      (!Array.isArray(patch.cards) ||
        patch.cards.length > 200 ||
        patch.cards.some(
          (c) =>
            !c ||
            !assets.some((a) => a.id === c.assetId && a.kind === "image") ||
            !Number.isFinite(c.x) ||
            !Number.isFinite(c.y) ||
            c.x < 0 ||
            c.y < 0 ||
            c.x > 5000 ||
            c.y > 5000,
        ))
    )
      throw new Error("Invalid design card layout.");
    Object.assign(s, patch);
    s.revision++;
    this.write(s);
    return this.snapshot(projectId, id);
  }
  addReferences(projectId: string, id: string, assetIds: string[]) {
    const s = this.read(projectId, id);
    const refs = [...new Set([...s.referenceAssetIds, ...assetIds])];
    const cards = [...s.cards];
    for (const assetId of assetIds)
      if (!cards.some((c) => c.assetId === assetId))
        cards.push({
          assetId,
          x: (cards.length % 3) * 230 + 20,
          y: Math.floor(cards.length / 3) * 190 + 20,
        });
    return this.update(projectId, id, s.revision, {
      referenceAssetIds: refs,
      cards,
    });
  }
  plan(request: DesignGeneration) {
    const s = this.read(request.projectId, request.sessionId);
    if (s.revision !== request.revision)
      throw new Error(
        "Design changed. Review the latest design before generating.",
      );
    if (!Object.hasOwn(DESIGN_MODELS, request.action))
      throw new Error("Unsupported design action.");
    if (typeof request.prompt !== "string" || request.prompt.length > 8000)
      throw new Error("Invalid design prompt.");
    const capability = getCapability(DESIGN_MODELS[request.action])!;
    const asset = request.sourceAssetId
      ? this.editor
          .snapshot(request.projectId)
          .project.assets.find(
            (a) =>
              a.id === request.sourceAssetId &&
              a.kind === "image" &&
              !a.missing,
          )
      : undefined;
    if (
      request.action !== "generate" &&
      (!asset ||
        (!s.referenceAssetIds.includes(asset.id) &&
          !s.cards.some((c) => c.assetId === asset.id)))
    )
      throw new Error("Choose a source image on this design board.");
    if (request.action === "generate" && request.sourceAssetId)
      throw new Error("Use Edit to generate from a selected reference.");
    if (["generate", "edit"].includes(request.action) && !request.prompt.trim())
      throw new Error("Describe the design you want.");
    if (
      request.layers !== undefined &&
      (!Number.isInteger(request.layers) ||
        request.layers < 2 ||
        request.layers > 10)
    )
      throw new Error("Choose 2 to 10 layers.");
    if (
      request.upscaleFactor !== undefined &&
      ![2, 3, 4, 5, 6].includes(request.upscaleFactor)
    )
      throw new Error("Choose an upscale factor from 2 to 6.");
    return { session: s, capability, asset };
  }
  request(request: DesignGeneration, sourceUrl?: string): GenerationRequest {
    const { session: s, capability } = this.plan(request);
    const prompt = [
      s.brief,
      s.colors ? `Color direction: ${s.colors}` : "",
      request.prompt,
    ]
      .filter(Boolean)
      .join("\n");
    let inputs: Record<string, unknown>;
    switch (request.action) {
      case "generate":
        inputs = { positivePrompt: prompt, width: s.width, height: s.height };
        break;
      case "edit":
        inputs = {
          positivePrompt: prompt,
          seedImage: sourceUrl,
          strength: 0.8,
          width: s.width,
          height: s.height,
        };
        break;
      case "upscale":
        inputs = {
          inputs: { image: sourceUrl },
          upscaleFactor: request.upscaleFactor || 2,
          settings: { enhancementStrength: "medium" },
        };
        break;
      case "remove-background":
        inputs = {
          inputs: { image: sourceUrl },
          outputFormat: "PNG",
          settings: { alphaMatting: true, returnOnlyMask: false },
        };
        break;
      case "expand":
        inputs = {
          inputs: { image: sourceUrl },
          outpaint: { top: 256, right: 256, bottom: 256, left: 256 },
          settings: { autoCrop: true },
        };
        break;
      case "layers":
        inputs = {
          inputs: { referenceImages: [sourceUrl] },
          positivePrompt:
            prompt ||
            "Separate the image into independently editable RGBA layers, preserving composition and transparent edges.",
          settings: { layers: request.layers || 4 },
          outputFormat: "TIFF",
        };
        break;
    }
    const result: GenerationRequest = {
      operation: capability.operation,
      modelId: capability.id,
      inputs,
      billing: {
        mode: "managed",
        accountId: "desktop",
        idempotencyKey: randomUUID(),
      },
    };
    validateGenerationRequest(result);
    return result;
  }
  track(request: DesignGeneration, providerJobId: string) {
    const s = this.read(request.projectId, request.sessionId);
    if (!s.jobs.some((j) => j.providerJobId === providerJobId)) {
      s.jobs.push({
        providerJobId,
        action: request.action,
        sourceAssetId: request.sourceAssetId,
        prompt: request.prompt,
      });
      s.revision++;
      this.write(s);
    }
    this.editor.watchGeneration(request.projectId, providerJobId);
    return this.snapshot(request.projectId, request.sessionId);
  }
  insert(
    projectId: string,
    id: string,
    assetId: string,
    sequenceId: string,
    frame: number,
    duration: number,
    expectedRevision: number,
    replaceClipId?: string,
  ) {
    const snapshot = this.snapshot(projectId, id),
      project = snapshot.project.project;
    if (
      !snapshot.session.cards.some((c) => c.assetId === assetId) ||
      !project.assets.some(
        (a) => a.id === assetId && a.kind === "image" && !a.missing,
      )
    )
      throw new Error("Choose an available design image.");
    const sequence = project.sequences.find((s) => s.id === sequenceId);
    if (
      !sequence ||
      !Number.isSafeInteger(frame) ||
      frame < 0 ||
      !Number.isSafeInteger(duration) ||
      duration < 1
    )
      throw new Error("Invalid timeline destination.");
    const edits: EditorEdit[] = [];
    const asset = project.assets.find((a) => a.id === assetId)!;
    if (replaceClipId) {
      const clip = sequence.clips.find((c) => c.id === replaceClipId);
      if (
        !clip?.assetId ||
        sequence.tracks.find((t) => t.id === clip.trackId)?.kind !== "video"
      )
        throw new Error("Choose a video or image clip to replace.");
      edits.push({
        type: "clip.update",
        sequenceId,
        id: replaceClipId,
        patch: { assetId, name: asset.name },
      });
    } else {
      const track = newTrack(randomUUID(), "video", "Design");
      const clip = newClip(randomUUID(), track.id, frame, duration, asset.name);
      clip.assetId = assetId;
      edits.push(
        { type: "track.add", sequenceId, track },
        { type: "clip.add", sequenceId, clip },
      );
    }
    this.editor.command({
      projectId,
      expectedRevision,
      label: replaceClipId ? "Replace with design" : "Add design to timeline",
      edits,
    });
    return this.snapshot(projectId, id);
  }
}
