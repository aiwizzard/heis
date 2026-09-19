const { handleTrusted } = require("./trustedIpc");
const { BrowserWindow, ipcMain } = require("electron");
const { fail, IPC_CHANNELS, ok } = require("@heis/core");
const { AuthSession } = require("./authSession");
const { registerAgent } = require("../agent/register");
const { EntitlementStore } = require("./entitlementStore");
const { InstallationStore } = require("./installationStore");
const { LicenseService } = require("./licenseService");
const { DesktopAuth } = require("./desktopAuth");
const { ManagedMediaProvider } = require("./runwareProvider");
const { McpBridge } = require("./mcpBridge");
const { SecureStore } = require("./secureStore");

function errorEnvelope(error: any): any {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return fail(message.replace(/[^A-Z0-9_]/g, "_").slice(0, 80) || "UNKNOWN_ERROR", message);
}

function handle(channel: string, handler: (...args: any[]) => any): void {
  handleTrusted(channel, async (_event: any, ...args: any[]) => {
    try { return ok(await handler(...args)); }
    catch (error) { return errorEnvelope(error); }
  });
}

function register(localMediaService?: any, projectService?: any, editorService?: any): { dispose: () => void; handleAuthCallback: (url: string) => Promise<void> } {
  const secureStore = new SecureStore();
  const authSession = new AuthSession(secureStore);
  const entitlementStore = new EntitlementStore();
  const installationStore = new InstallationStore();
  const licenseService = new LicenseService(authSession, entitlementStore, installationStore);
  const desktopAuth = new DesktopAuth(authSession, secureStore, (event: any) => {
    if (event.type === "signed-out") entitlementStore.clear();
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
  const managedProvider = new ManagedMediaProvider(authSession);
  editorService?.setGenerationProvider(managedProvider);
  const providerFor = (mode: string) => {
    const entitlement = entitlementStore.get();
    if (!entitlement) throw new Error("VALID_ENTITLEMENT_REQUIRED");
    if (mode !== "managed") throw new Error("UNSUPPORTED_BILLING_MODE");
    if (!entitlement.canUseManagedGeneration) throw new Error("MANAGED_ACCESS_REQUIRED");
    return managedProvider;
  };
  editorService?.workflows.setProvider({
    upload:(file:any)=>providerFor('managed').upload(file),
    submit:(request:any)=>providerFor('managed').submit(request),
    getJob:(id:string)=>managedProvider.getJob(id),
    cancel:(id:string)=>managedProvider.cancel(id),
  });
  const workflowApprovals = new Set<string>();
  const approveWorkflow = async (projectId:string,id:string,revision?:number,runId?:string) => {
    const key=projectId+':'+id;
    if(workflowApprovals.has(key))throw new Error('This workflow is already awaiting approval.');
    workflowApprovals.add(key);
    try {
      providerFor('managed');
      const plan=runId?editorService.workflows.retryPlan(projectId,id,runId):editorService.workflows.plan(projectId,id,revision);
      const graph=runId?plan.run.graph:plan.graph;
      const {dialog}=require('electron');
      const decision=await dialog.showMessageBox({type:'question',title:'Approve workflow',message:`${runId?'Resume':'Run'} ${graph.name}? Reserve up to ${plan.credits} credits for remaining steps.`,detail:'Input images and generated intermediate images will be uploaded to the managed provider. Completed steps are reused on retry. An interrupted submission is retried with its original billing key.\n\n'+graph.nodes.filter((n:any)=>n.prompt).map((n:any)=>n.name+': '+n.prompt).join('\n'),buttons:['Cancel','Run workflow'],defaultId:0,cancelId:0});
      if(decision.response!==1)throw new Error('Workflow run cancelled before submission.');
      return runId?await editorService.workflows.retry(projectId,id,runId):editorService.workflows.start(projectId,id,revision);
    } finally {workflowApprovals.delete(key);}
  };
  handleTrusted('editor:workflowRun',(_event:any,projectId:string,id:string,revision:number)=>approveWorkflow(projectId,id,revision));
  handleTrusted('editor:workflowRetry',(_event:any,projectId:string,id:string,runId:string)=>approveWorkflow(projectId,id,undefined,runId));
  const pendingApprovals = new Map<string, { resolve: (value: any) => void; timer: any }>();
  const requestApproval = (tool: string, args: any) => new Promise<any>((resolve, reject) => {
    const id = require("node:crypto").randomUUID();
    const timer = setTimeout(() => { pendingApprovals.delete(id); reject(new Error("Heis approval timed out.")); }, 120_000);
    pendingApprovals.set(id, { resolve, timer });
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNELS.codexApprovalRequired, { id, tool, args });
  });
  const submittingDesigns = new Set<string>();
  const designGenerate = async (original: any) => {
    const request = structuredClone(original);
    const submissionKey = `${request.projectId}:${request.sessionId}`;
    if (submittingDesigns.has(submissionKey)) throw new Error("A design submission is already awaiting approval or upload.");
    submittingDesigns.add(submissionKey);
    try {
    const provider = providerFor("managed");
    const plan = editorService.designs.plan(request);
    const credits = require("@heis/core").reserveCredits(plan.capability.maximumEstimatedCostUsd);
    const {dialog} = require("electron");
    const approval = await dialog.showMessageBox({type:"question",title:"Approve design generation",message:`Reserve up to ${credits} credits for ${request.action}?`,detail:`${request.prompt}\n${plan.asset ? 'The selected image will be uploaded to the generation provider. ' : ''}Results will be saved to ${plan.session.name}. Unused credits are returned.`,buttons:["Cancel","Generate"],defaultId:0,cancelId:0});
    if (approval.response !== 1) throw new Error("Design generation cancelled.");
    editorService.designs.plan(request);
    let sourceUrl;
    if (plan.asset) {
      const file=editorService.resolveMedia(`heis-project://${request.projectId}/${plan.asset.path.split('/').map(encodeURIComponent).join('/')}`);
      const fs=require('node:fs');
      if(fs.statSync(file).size>20*1024*1024)throw new Error('Reference exceeds the 20 MB image upload limit.');
      const ext=require('node:path').extname(file).toLowerCase();
      const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
      if(!mime[ext])throw new Error('Use a PNG, JPEG or WebP reference image.');
      sourceUrl=(await provider.upload({name:plan.asset.name,type:mime[ext],bytes:fs.readFileSync(file)})).url;
    }
    const generation=editorService.designs.request(request,sourceUrl);
    const job=await provider.submit(generation);
    return editorService.designs.track(request,job.id);
    } finally { submittingDesigns.delete(submissionKey); }
  };
  handleTrusted('editor:designGenerate',(_event:any,request:any)=>designGenerate(request));
  const designScope = () => { const scope=agent.activeDesign();if(!scope)throw new Error('Open a Design Agent conversation first.');return scope; };
  const rejectDesignMutation = () => { if(agent.activeDesign())throw new Error('Use design tools. Timeline insertion is controlled by the user.'); };
  const bridge = new McpBridge({
    heis_design_info: async () => {const s=designScope();return editorService.designs.snapshot(s.projectId,s.sessionId);},
    heis_design_generate: async (args:any) => {const s=designScope();return designGenerate({...args,...s});},
    heis_list_capabilities: async () => ({ managed: entitlementStore.get()?.canUseManagedGeneration ? await managedProvider.listCapabilities().catch(() => []) : [] }),
    heis_project_info: async () => agent.activeDesign() ? editorService.designs.snapshot(agent.activeDesign().projectId,agent.activeDesign().sessionId) : editorService?.activeProjectId ? { ...editorService.snapshot(editorService.activeProjectId), context: editorService.activeContext } : ({ available: Boolean(projectService), workflows: projectService?.listWorkflows().map((workflow: any) => ({ id: workflow.id, name: workflow.name, updatedAt: workflow.updated_at })) ?? [] }),
    heis_edit: async (args: any) => {
      rejectDesignMutation();
      if (!editorService?.activeProjectId || args.projectId !== editorService.activeProjectId) throw new Error("Open the target project first.");
      return editorService.command(args);
    },
    heis_jobs: async () => agent.activeDesign() ? editorService.jobs(agent.activeDesign().projectId) : editorService?.activeProjectId ? editorService.jobs(editorService.activeProjectId) : [],
    heis_generate: async (args: any) => {
      rejectDesignMutation();
      providerFor("managed");
      const approval = await requestApproval("heis_generate", args);
      if (!approval?.approved) throw new Error("Generation was declined by the user.");
      const mode = "managed";
      const provider = providerFor(mode);
      const projectId = editorService?.destinationProjectId();
      const job = await provider.submit({ operation: args.operation, modelId: args.modelId, inputs: args.inputs, billing: { mode, accountId: authSession.getUserId() ?? "local", idempotencyKey: require("node:crypto").randomUUID() } });
      if (projectId && args.operation !== "rank-highlights") editorService.watchGeneration(projectId, job.id);
      return job;
    },
    heis_export: async (args: any) => {
      rejectDesignMutation();
      const approval = await requestApproval("heis_export", args);
      if (!approval?.approved) throw new Error("Export was declined by the user.");
      if (!editorService?.activeProjectId) throw new Error("Open a video project first.");
      const snapshot = editorService.snapshot(editorService.activeProjectId);
      const { dialog } = require("electron");
      const result = await dialog.showSaveDialog({ title: "Export video", defaultPath: `${snapshot.project.name}.mp4`, filters: [{ name: "MP4", extensions: ["mp4"] }] });
      if (result.canceled || !result.filePath) throw new Error("Export cancelled.");
      return editorService.exportProject(snapshot.project.id, snapshot.project.activeSequenceId, result.filePath);
    },
  });
  const agent = registerAgent(bridge, secureStore, editorService);

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
  handle(IPC_CHANNELS.codexResolveApproval, (id: string, decision: any) => {
    const pending = pendingApprovals.get(id);
    if (!pending) throw new Error("APPROVAL_NOT_FOUND");
    clearTimeout(pending.timer); pendingApprovals.delete(id); pending.resolve(decision);
  });
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
  handle(IPC_CHANNELS.generationSubmit, async (request: any) => {
    const projectId = editorService?.destinationProjectId();
    const job = await providerFor(request?.billing?.mode).submit(request);
    if (projectId && request.operation !== "rank-highlights") editorService.watchGeneration(projectId, job.id);
    return job;
  });
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
  handle(IPC_CHANNELS.projectsListWorkflows, () => {
    if (!projectService) throw new Error("PROJECTS_UNAVAILABLE");
    return projectService.listWorkflows();
  });
  handle(IPC_CHANNELS.projectsGetWorkflow, (workflowId: string) => {
    if (!projectService) throw new Error("PROJECTS_UNAVAILABLE");
    return projectService.getWorkflow(workflowId);
  });
  handle(IPC_CHANNELS.projectsSaveWorkflow, (payload: any) => {
    if (!projectService) throw new Error("PROJECTS_UNAVAILABLE");
    return projectService.saveWorkflow(payload);
  });
  handle(IPC_CHANNELS.projectsRenameWorkflow, (workflowId: string, name: string) => {
    if (!projectService) throw new Error("PROJECTS_UNAVAILABLE");
    return projectService.renameWorkflow(workflowId, name);
  });
  handle(IPC_CHANNELS.projectsDeleteWorkflow, (workflowId: string) => {
    if (!projectService) throw new Error("PROJECTS_UNAVAILABLE");
    return projectService.deleteWorkflow(workflowId);
  });

  return { handleAuthCallback: (url: string) => desktopAuth.handleCallback(url), dispose: () => { agent.dispose(); bridge.stop(); } };
}

module.exports = { register };
