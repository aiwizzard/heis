import type { AgentStatus, AgentThread, AgentThreadInput, AgentTurnInput, EntitlementSnapshot, GenerationJob, GenerationRequest, LocalClippingResult, LocalMediaImport, LocalWorkflowRecord, ModelCapability, ResultEnvelope } from "@heis/core";

declare global {
  interface Window {
    heis?: {
      auth: {
        getSession(): Promise<ResultEnvelope<{ accessToken: string; userId: string | null; expiresAt: number; hasRefreshToken: boolean } | null>>;
        clearSession(): Promise<ResultEnvelope<void>>;
        startGoogle(): Promise<ResultEnvelope<void>>;
        sendMagicLink(email: string): Promise<ResultEnvelope<void>>;
        onEvent(callback: (event: { type: string; [key: string]: unknown }) => void): () => void;
      };
      entitlements: {
        get(): Promise<ResultEnvelope<EntitlementSnapshot | null>>;
        set(snapshot: EntitlementSnapshot): Promise<ResultEnvelope<void>>;
        refresh(): Promise<ResultEnvelope<EntitlementSnapshot>>;
      };
      secrets: {
        has(name: "runwareApiKey" | "openaiApiKey"): Promise<ResultEnvelope<boolean>>;
        set(name: "runwareApiKey" | "openaiApiKey", value: string): Promise<ResultEnvelope<void>>;
        delete(name: "runwareApiKey" | "openaiApiKey"): Promise<ResultEnvelope<void>>;
      };
      codex: {
        resolveApproval(id: string, decision: { approved: boolean; mode?: "managed" }): Promise<ResultEnvelope<void>>;
        onApprovalRequired(callback: (request: { id: string; tool: string; args: unknown }) => void): () => void;
      };
      generation: {
        listCapabilities(mode: "managed"): Promise<ResultEnvelope<readonly ModelCapability[]>>;
        upload(mode: "managed", file: { name: string; type: string; bytes: ArrayBuffer }): Promise<ResultEnvelope<{ url: string }>>;
        getBalance(): Promise<ResultEnvelope<{ balance: number | null }>>;
        submit(request: GenerationRequest): Promise<ResultEnvelope<GenerationJob>>;
        getJob(mode: "managed", jobId: string): Promise<ResultEnvelope<GenerationJob>>;
        cancel(mode: "managed", jobId: string): Promise<ResultEnvelope<void>>;
      };
      export: {
        importMedia(file: { name: string; type: string; bytes: ArrayBuffer }): Promise<ResultEnvelope<LocalMediaImport>>;
        clipHighlights(request: { sourceUrl: string; numHighlights: number; aspectRatio: string; returnCoordinatesOnly: boolean }): Promise<ResultEnvelope<LocalClippingResult>>;
      };
      projects: {
        listWorkflows(): Promise<ResultEnvelope<LocalWorkflowRecord[]>>;
        getWorkflow(workflowId: string): Promise<ResultEnvelope<LocalWorkflowRecord>>;
        saveWorkflow(payload: unknown): Promise<ResultEnvelope<{ workflow_id: string }>>;
        renameWorkflow(workflowId: string, name: string): Promise<ResultEnvelope<{ workflow_id: string; name: string }>>;
        deleteWorkflow(workflowId: string): Promise<ResultEnvelope<{ workflow_id: string; deleted: true }>>;
      };
    };
  }
}

export {};
