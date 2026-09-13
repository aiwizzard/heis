const { BrowserWindow, ipcMain } = require("electron");
const { fail, IPC_CHANNELS, ok } = require("@heis/core");
const { AuthSession } = require("./authSession");
const { CodexAppServer } = require("./codexAppServer");
const { EntitlementStore } = require("./entitlementStore");
const { InstallationStore } = require("./installationStore");
const { LicenseService } = require("./licenseService");
const { DesktopAuth } = require("./desktopAuth");
const { ManagedMediaProvider, RunwareByokProvider } = require("./runwareProvider");
const { McpBridge } = require("./mcpBridge");
const { SecureStore } = require("./secureStore");

function errorEnvelope(error: any): any {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return fail(message.replace(/[^A-Z0-9_]/g, "_").slice(0, 80) || "UNKNOWN_ERROR", message);
}

function handle(channel: string, handler: (...args: any[]) => any): void {
  ipcMain.handle(channel, async (_event: any, ...args: any[]) => {
    try { return ok(await handler(...args)); }
    catch (error) { return errorEnvelope(error); }
  });
}

function register(localMediaService?: any): { dispose: () => void; handleAuthCallback: (url: string) => Promise<void> } {
  const secureStore = new SecureStore();
  const authSession = new AuthSession(secureStore);
  const entitlementStore = new EntitlementStore();
  const installationStore = new InstallationStore();
  const licenseService = new LicenseService(authSession, entitlementStore, installationStore);
  const desktopAuth = new DesktopAuth(authSession, secureStore, (event: any) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.authEvent, event);
    if (event.type === "signed-in") {
      void licenseService.refresh().then((snapshot: any) => {
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.authEvent, { type: "entitlement-refreshed", snapshot });
      }).catch((error: any) => {
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.authEvent, { type: "entitlement-error", message: error?.message ?? String(error) });
      });
    }
  });
  void desktopAuth.restore().then(async () => {
    if (!authSession.getAccessToken()) return;
    try {
      const snapshot = await licenseService.refresh();
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.authEvent, { type: "entitlement-refreshed", snapshot });
    } catch (error: any) {
      const snapshot = entitlementStore.get();
      if (snapshot) {
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.authEvent, { type: "entitlement-refreshed", snapshot, cached: true });
      } else {
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.authEvent, { type: "entitlement-error", message: error?.message ?? String(error) });
      }
    }
  });
  const byokProvider = new RunwareByokProvider(secureStore);
  const managedProvider = new ManagedMediaProvider(authSession);
  const providerFor = (mode: string) => {
    const entitlement = entitlementStore.get();
    if (!entitlement) throw new Error("VALID_ENTITLEMENT_REQUIRED");
    if (mode === "byok") {
      if (!entitlement.canUseByokGeneration) throw new Error("BYOK_ACCESS_REQUIRED");
      return byokProvider;
    }
    if (!entitlement.canUseManagedGeneration) throw new Error("MANAGED_ACCESS_REQUIRED");
    return managedProvider;
  };
  const pendingApprovals = new Map<string, { resolve: (value: any) => void; timer: any }>();
  const requestApproval = (tool: string, args: any) => new Promise<any>((resolve, reject) => {
    const id = require("node:crypto").randomUUID();
    const timer = setTimeout(() => { pendingApprovals.delete(id); reject(new Error("Heis approval timed out.")); }, 120_000);
    pendingApprovals.set(id, { resolve, timer });
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.codexApprovalRequired, { id, tool, args });
  });
  const bridge = new McpBridge({
    heis_list_capabilities: async () => ({ byok: await byokProvider.listCapabilities(), managed: await managedProvider.listCapabilities().catch(() => []) }),
    heis_project_info: async () => ({ available: false, message: "Open-project context is not connected yet." }),
    heis_generate: async (args: any) => {
      const approval = await requestApproval("heis_generate", args);
      if (!approval?.approved) throw new Error("Generation was declined by the user.");
      const mode = approval.mode === "managed" ? "managed" : "byok";
      const provider = providerFor(mode);
      return provider.submit({ operation: args.operation, modelId: args.modelId, inputs: args.inputs, billing: { mode, accountId: authSession.getUserId() ?? "local", idempotencyKey: require("node:crypto").randomUUID() } });
    },
    heis_export: async (args: any) => {
      const approval = await requestApproval("heis_export", args);
      if (!approval?.approved) throw new Error("Export was declined by the user.");
      throw new Error("Project export is not connected to the agent yet.");
    },
  });
  const codex = new CodexAppServer((event: any) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.codexEvent, event);
  }, bridge, secureStore);

  handle(IPC_CHANNELS.secretHas, (name: string) => secureStore.has(name));
  handle(IPC_CHANNELS.secretSet, (name: string, value: string) => secureStore.set(name, value));
  handle(IPC_CHANNELS.secretDelete, (name: string) => secureStore.delete(name));
  handle(IPC_CHANNELS.authGetSession, () => authSession.get());
  handle(IPC_CHANNELS.authSetSession, () => { throw new Error("DIRECT_SESSION_IMPORT_DISABLED"); });
  handle(IPC_CHANNELS.authClearSession, () => desktopAuth.signOut());
  handle(IPC_CHANNELS.authStartOAuth, (provider: "google") => desktopAuth.startOAuth(provider));
  handle(IPC_CHANNELS.authSendMagicLink, (email: string) => desktopAuth.sendMagicLink(email));
  handle(IPC_CHANNELS.entitlementGet, () => entitlementStore.get());
  handle(IPC_CHANNELS.entitlementSet, (snapshot: any) => entitlementStore.set(snapshot));
  handle(IPC_CHANNELS.entitlementRefresh, () => licenseService.refresh());
  handle(IPC_CHANNELS.codexStatus, () => codex.status());
  handle(IPC_CHANNELS.codexStartThread, (input: any) => codex.startThread(input));
  handle(IPC_CHANNELS.codexStartTurn, (threadId: string, input: any) => codex.startTurn(threadId, input));
  handle(IPC_CHANNELS.codexInterrupt, (threadId: string, turnId: string) => codex.interrupt(threadId, turnId));
  handle(IPC_CHANNELS.codexRespondToServerRequest, (id: number | string, result: any) => codex.respondToServerRequest(id, result));
  handle(IPC_CHANNELS.codexResolveApproval, (id: string, decision: any) => {
    const pending = pendingApprovals.get(id);
    if (!pending) throw new Error("APPROVAL_NOT_FOUND");
    clearTimeout(pending.timer); pendingApprovals.delete(id); pending.resolve(decision);
  });
  handle(IPC_CHANNELS.codexStop, () => codex.stop());
  handle(IPC_CHANNELS.generationListCapabilities, (mode: string) => providerFor(mode).listCapabilities());
  handle(IPC_CHANNELS.generationUpload, (mode: string, file: any) => {
    if (!file || typeof file.name !== "string" || typeof file.type !== "string" || !(file.bytes instanceof ArrayBuffer || ArrayBuffer.isView(file.bytes))) throw new Error("INVALID_UPLOAD");
    if (file.bytes.byteLength > 500 * 1024 * 1024) throw new Error("UPLOAD_TOO_LARGE");
    return providerFor(mode).upload(file);
  });
  handle(IPC_CHANNELS.generationGetBalance, async () => {
    const entitlement = entitlementStore.get();
    if (!entitlement?.canUseManagedGeneration) return { balance: null };
    return managedProvider.getBalance();
  });
  handle(IPC_CHANNELS.generationSubmit, (request: any) => providerFor(request?.billing?.mode).submit(request));
  handle(IPC_CHANNELS.generationGetJob, (mode: string, jobId: string) => providerFor(mode).getJob(jobId));
  handle(IPC_CHANNELS.generationCancel, (mode: string, jobId: string) => providerFor(mode).cancel(jobId));
  handle(IPC_CHANNELS.exportImportMedia, (file: any) => {
    if (!localMediaService) throw new Error("LOCAL_MEDIA_UNAVAILABLE");
    return localMediaService.importMedia(file);
  });
  handle(IPC_CHANNELS.exportClipHighlights, (request: any) => {
    if (!localMediaService) throw new Error("LOCAL_MEDIA_UNAVAILABLE");
    return localMediaService.clipHighlights(request);
  });

  return { handleAuthCallback: (url: string) => desktopAuth.handleCallback(url), dispose: () => { codex.stop(); bridge.stop(); } };
}

module.exports = { register };
