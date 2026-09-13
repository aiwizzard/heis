export const GENERATION_OPERATIONS = [
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "image-to-video",
  "video-to-video",
  "lip-sync",
  "motion-control",
  "text-to-speech",
  "text-to-music",
  "audio-to-video",
  "upscale",
  "remove-background",
  "expand-image",
] as const;

export type GenerationOperation = (typeof GENERATION_OPERATIONS)[number];
export type BillingMode = "trial" | "managed" | "byok";
export type JobStatus = "queued" | "submitted" | "running" | "succeeded" | "failed" | "cancelled";
export type MediaKind = "image" | "video" | "audio" | "other";
export type CreditWalletKind = "trial" | "monthly" | "purchased";

export interface BillingContext {
  mode: BillingMode;
  accountId: string;
  idempotencyKey: string;
}

export interface ModelParameter {
  name: string;
  type: "string" | "number" | "boolean" | "enum" | "media" | "media-list" | "object";
  required?: boolean;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  options?: readonly string[];
}

export interface ModelCapability {
  id: string;
  provider: "runware" | "local";
  providerModelId: string;
  displayName: string;
  operation: GenerationOperation;
  outputKind: MediaKind;
  parameters: readonly ModelParameter[];
  maximumEstimatedCostUsd: number;
  enabled: boolean;
}

export interface GenerationRequest {
  operation: GenerationOperation;
  modelId: string;
  inputs: Readonly<Record<string, unknown>>;
  billing: BillingContext;
}

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  url?: string;
  localPath?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  expiresAt?: string;
}

export interface GenerationError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface GenerationJob {
  id: string;
  providerJobId?: string;
  status: JobStatus;
  reservedCredits: number;
  settledCredits?: number;
  outputs: readonly MediaAsset[];
  error?: GenerationError;
  createdAt: string;
  updatedAt: string;
}

export interface MediaProvider {
  listCapabilities(): Promise<readonly ModelCapability[]>;
  submit(request: GenerationRequest): Promise<GenerationJob>;
  getJob(jobId: string): Promise<GenerationJob>;
  cancel(jobId: string): Promise<void>;
}

export interface AgentStatus {
  available: boolean;
  authenticated: boolean;
  version?: string;
  executablePath?: string;
  reason?: string;
}

export interface AgentThreadInput {
  cwd: string;
  model?: string;
  title?: string;
}

export interface AgentThread {
  id: string;
  title?: string;
}

export interface AgentTurnInput {
  text: string;
  attachments?: readonly MediaAsset[];
}

export type AgentEvent =
  | { type: "message-delta"; text: string }
  | { type: "tool-started"; tool: string }
  | { type: "tool-completed"; tool: string; success: boolean }
  | { type: "completed" }
  | { type: "error"; error: GenerationError };

export interface AgentProvider {
  getStatus(): Promise<AgentStatus>;
  startThread(input: AgentThreadInput): Promise<AgentThread>;
  send(threadId: string, input: AgentTurnInput): AsyncIterable<AgentEvent>;
  interrupt(threadId: string): Promise<void>;
}

export interface WorkflowDefinition {
  id: string;
  version: number;
  nodes: readonly Readonly<Record<string, unknown>>[];
  edges: readonly Readonly<Record<string, unknown>>[];
}

export interface WorkflowValidation {
  valid: boolean;
  errors: readonly { path: string; message: string }[];
}

export interface WorkflowContext {
  billing: BillingContext;
  projectDirectory: string;
}

export interface WorkflowRun {
  id: string;
  status: JobStatus;
  startedAt: string;
  completedAt?: string;
}

export interface WorkflowEngine {
  validate(definition: WorkflowDefinition): WorkflowValidation;
  run(definition: WorkflowDefinition, context: WorkflowContext): Promise<WorkflowRun>;
  cancel(runId: string): Promise<void>;
}

export interface EntitlementSnapshot {
  accountId: string;
  installationId: string;
  mode: "trial" | "lifetime" | "creator" | "read-only";
  checkedAt: string;
  validUntil: string;
  deviceLimit: number;
  canEdit: boolean;
  canExport: boolean;
  canUseManagedGeneration: boolean;
  canUseByokGeneration: boolean;
  signature: string;
}
