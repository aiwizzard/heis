import type { EditorSnapshot, EditorJob } from "./editor";
export const DESIGN_MODELS = {
  generate: "heis-image-standard",
  edit: "heis-image-edit-standard",
  upscale: "heis-image-upscale",
  "remove-background": "heis-remove-background",
  expand: "heis-expand-image",
  layers: "heis-image-layers",
} as const;
export type DesignAction = keyof typeof DESIGN_MODELS;
export interface DesignSession {
  version: 1;
  id: string;
  projectId: string;
  revision: number;
  name: string;
  brief: string;
  width: number;
  height: number;
  colors: string;
  referenceAssetIds: string[];
  cards: { assetId: string; x: number; y: number }[];
  jobs: {
    providerJobId: string;
    action: DesignAction;
    sourceAssetId?: string;
    prompt: string;
  }[];
}
export type DesignPatch = Partial<
  Pick<
    DesignSession,
    | "name"
    | "brief"
    | "width"
    | "height"
    | "colors"
    | "referenceAssetIds"
    | "cards"
  >
>;
export interface DesignSnapshot {
  session: DesignSession;
  project: EditorSnapshot;
  jobs: EditorJob[];
}
export interface DesignGeneration {
  projectId: string;
  sessionId: string;
  revision: number;
  action: DesignAction;
  sourceAssetId?: string;
  prompt: string;
  layers?: number;
  upscaleFactor?: number;
}
export interface DesignBridge {
  designOpen(
    projectId?: string,
    sessionId?: string,
    sourceUrl?: string,
  ): Promise<DesignSnapshot>;
  designList(projectId: string): Promise<{ id: string; name: string }[]>;
  designCreate(projectId: string): Promise<DesignSnapshot>;
  designUpdate(
    projectId: string,
    sessionId: string,
    revision: number,
    patch: DesignPatch,
  ): Promise<DesignSnapshot>;
  designImport(projectId: string, sessionId: string): Promise<DesignSnapshot>;
  designFrame(
    projectId: string,
    sessionId: string,
    assetId: string,
    seconds: number,
  ): Promise<DesignSnapshot>;
  designGenerate(request: DesignGeneration): Promise<DesignSnapshot>;
  designInsert(
    projectId: string,
    sessionId: string,
    assetId: string,
    sequenceId: string,
    frame: number,
    duration: number,
    expectedRevision: number,
    replaceClipId?: string,
  ): Promise<DesignSnapshot>;
}
