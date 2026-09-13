import type { AgentStatus, AgentThread, AgentThreadInput, AgentTurnInput, EntitlementSnapshot, GenerationJob, GenerationRequest, ModelCapability, ResultEnvelope } from "@heis/core";

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
        status(): Promise<ResultEnvelope<AgentStatus>>;
        startThread(input: AgentThreadInput): Promise<ResultEnvelope<AgentThread>>;
        startTurn(threadId: string, input: AgentTurnInput): Promise<ResultEnvelope<unknown>>;
        interrupt(threadId: string, turnId: string): Promise<ResultEnvelope<void>>;
        respondToServerRequest(id: number | string, result: unknown): Promise<ResultEnvelope<void>>;
        resolveApproval(id: string, decision: { approved: boolean; mode?: "managed" | "byok" }): Promise<ResultEnvelope<void>>;
        stop(): Promise<ResultEnvelope<void>>;
        onEvent(callback: (event: unknown) => void): () => void;
        onApprovalRequired(callback: (request: { id: string; tool: string; args: unknown }) => void): () => void;
      };
      generation: {
        listCapabilities(mode: "managed" | "byok"): Promise<ResultEnvelope<readonly ModelCapability[]>>;
        upload(mode: "managed" | "byok", file: { name: string; type: string; bytes: ArrayBuffer }): Promise<ResultEnvelope<{ url: string }>>;
        getBalance(): Promise<ResultEnvelope<{ balance: number | null }>>;
        submit(request: GenerationRequest): Promise<ResultEnvelope<GenerationJob>>;
        getJob(mode: "managed" | "byok", jobId: string): Promise<ResultEnvelope<GenerationJob>>;
        cancel(mode: "managed" | "byok", jobId: string): Promise<ResultEnvelope<void>>;
      };
    };
  }
}

export {};
