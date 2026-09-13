export const IPC_CHANNELS = {
  authGetSession: "auth:get-session",
  authSetSession: "auth:set-session",
  authClearSession: "auth:clear-session",
  authStartOAuth: "auth:start-oauth",
  authSendMagicLink: "auth:send-magic-link",
  authEvent: "auth:event",
  entitlementGet: "entitlements:get",
  entitlementSet: "entitlements:set",
  entitlementRefresh: "entitlements:refresh",
  secretHas: "secrets:has",
  secretSet: "secrets:set",
  secretDelete: "secrets:delete",
  codexStatus: "codex:status",
  codexStartThread: "codex:start-thread",
  codexStartTurn: "codex:start-turn",
  codexInterrupt: "codex:interrupt",
  codexRespondToServerRequest: "codex:respond-to-server-request",
  codexResolveApproval: "codex:resolve-approval",
  codexApprovalRequired: "codex:approval-required",
  codexStop: "codex:stop",
  generationListCapabilities: "generation:list-capabilities",
  generationUpload: "generation:upload",
  generationGetBalance: "generation:get-balance",
  generationSubmit: "generation:submit",
  generationGetJob: "generation:get-job",
  generationCancel: "generation:cancel",
  generationEvent: "generation:event",
  exportImportMedia: "export:import-media",
  exportClipHighlights: "export:clip-highlights",
  codexEvent: "codex:event",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type ResultEnvelope<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
export function ok<T>(value: T): ResultEnvelope<T> { return { ok: true, value }; }
export function fail(code: string, message: string): ResultEnvelope<never> { return { ok: false, error: { code, message } }; }
