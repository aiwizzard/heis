const { contextBridge, ipcRenderer } = require('electron');
const { IPC_CHANNELS } = require('@heis/core');

function invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('heis', {
    auth: {
        getSession: () => invoke(IPC_CHANNELS.authGetSession),
        clearSession: () => invoke(IPC_CHANNELS.authClearSession),
        startGoogle: () => invoke(IPC_CHANNELS.authStartOAuth, 'google'),
        sendMagicLink: (email) => invoke(IPC_CHANNELS.authSendMagicLink, email),
        onEvent: (callback) => {
            const listener = (_, event) => callback(event);
            ipcRenderer.on(IPC_CHANNELS.authEvent, listener);
            return () => ipcRenderer.removeListener(IPC_CHANNELS.authEvent, listener);
        },
    },
    entitlements: {
        get: () => invoke(IPC_CHANNELS.entitlementGet),
        set: (snapshot) => invoke(IPC_CHANNELS.entitlementSet, snapshot),
        refresh: () => invoke(IPC_CHANNELS.entitlementRefresh),
    },
    secrets: {
        has: (name) => invoke(IPC_CHANNELS.secretHas, name),
        set: (name, value) => invoke(IPC_CHANNELS.secretSet, name, value),
        delete: (name) => invoke(IPC_CHANNELS.secretDelete, name),
    },
    codex: {
        status: () => invoke(IPC_CHANNELS.codexStatus),
        startThread: (input) => invoke(IPC_CHANNELS.codexStartThread, input),
        startTurn: (threadId, input) => invoke(IPC_CHANNELS.codexStartTurn, threadId, input),
        interrupt: (threadId, turnId) => invoke(IPC_CHANNELS.codexInterrupt, threadId, turnId),
        respondToServerRequest: (id, result) => invoke(IPC_CHANNELS.codexRespondToServerRequest, id, result),
        resolveApproval: (id, decision) => invoke(IPC_CHANNELS.codexResolveApproval, id, decision),
        stop: () => invoke(IPC_CHANNELS.codexStop),
        onEvent: (callback) => {
            const listener = (_, event) => callback(event);
            ipcRenderer.on(IPC_CHANNELS.codexEvent, listener);
            return () => ipcRenderer.removeListener(IPC_CHANNELS.codexEvent, listener);
        },
        onApprovalRequired: (callback) => {
            const listener = (_, request) => callback(request);
            ipcRenderer.on(IPC_CHANNELS.codexApprovalRequired, listener);
            return () => ipcRenderer.removeListener(IPC_CHANNELS.codexApprovalRequired, listener);
        },
    },
    generation: {
        listCapabilities: (mode) => invoke(IPC_CHANNELS.generationListCapabilities, mode),
        upload: (mode, file) => invoke(IPC_CHANNELS.generationUpload, mode, file),
        getBalance: () => invoke(IPC_CHANNELS.generationGetBalance),
        submit: (request) => invoke(IPC_CHANNELS.generationSubmit, request),
        getJob: (mode, jobId) => invoke(IPC_CHANNELS.generationGetJob, mode, jobId),
        cancel: (mode, jobId) => invoke(IPC_CHANNELS.generationCancel, mode, jobId),
    },
    export: {
        importMedia: (file) => invoke(IPC_CHANNELS.exportImportMedia, file),
        clipHighlights: (request) => invoke(IPC_CHANNELS.exportClipHighlights, request),
    },
    projects: {
        listWorkflows: () => invoke(IPC_CHANNELS.projectsListWorkflows),
        getWorkflow: (workflowId) => invoke(IPC_CHANNELS.projectsGetWorkflow, workflowId),
        saveWorkflow: (payload) => invoke(IPC_CHANNELS.projectsSaveWorkflow, payload),
        renameWorkflow: (workflowId, name) => invoke(IPC_CHANNELS.projectsRenameWorkflow, workflowId, name),
        deleteWorkflow: (workflowId) => invoke(IPC_CHANNELS.projectsDeleteWorkflow, workflowId),
    },
});

contextBridge.exposeInMainWorld('localAI', {
    isElectron: true,

    // ── sd.cpp engine ──────────────────────────────────────────────────────
    getBinaryStatus: () => ipcRenderer.invoke('local-ai:binary-status'),
    downloadBinary: () => ipcRenderer.invoke('local-ai:download-binary'),

    listModels: () => ipcRenderer.invoke('local-ai:list-models'),
    downloadModel: (modelId) => ipcRenderer.invoke('local-ai:download-model', modelId),
    downloadAuxiliary: (auxKey) => ipcRenderer.invoke('local-ai:download-auxiliary', auxKey),
    deleteModel: (modelId) => ipcRenderer.invoke('local-ai:delete-model', modelId),
    cancelDownload: (modelId) => ipcRenderer.invoke('local-ai:cancel-download', modelId),

    generate: (params) => ipcRenderer.invoke('local-ai:generate', params),
    cancelGeneration: () => ipcRenderer.invoke('local-ai:cancel-generation'),

    // ── Wan2GP engine (remote Gradio server) ───────────────────────────────
    wan2gp: {
        getConfig:  () => ipcRenderer.invoke('wan2gp:get-config'),
        setUrl:     (url) => ipcRenderer.invoke('wan2gp:set-url', url),
        probe:      (url) => ipcRenderer.invoke('wan2gp:probe', url),
        listModels: () => ipcRenderer.invoke('wan2gp:list-models'),
        generate:   (params) => ipcRenderer.invoke('wan2gp:generate', params),
        cancelGeneration: () => ipcRenderer.invoke('wan2gp:cancel-generation'),
        uploadFile: (payload) => ipcRenderer.invoke('wan2gp:upload-file', payload),
    },

    // Progress events — both engines emit on local-ai:progress
    onProgress: (callback) => {
        const listener = (_, data) => callback(data);
        ipcRenderer.on('local-ai:progress', listener);
        return () => ipcRenderer.removeListener('local-ai:progress', listener);
    },
    onDownloadProgress: (callback) => {
        const listener = (_, data) => callback(data);
        ipcRenderer.on('local-ai:download-progress', listener);
        return () => ipcRenderer.removeListener('local-ai:download-progress', listener);
    },
});

contextBridge.exposeInMainWorld('heisAgent', {
 platform:process.platform,
 chooseDirectory:()=>invoke('heis-agent:choose-directory'),
 snapshot:()=>invoke('heis-agent:snapshot'), refreshCodex:()=>invoke('heis-agent:refresh'),
 login:()=>invoke('heis-agent:login'), cancelLogin:()=>invoke('heis-agent:cancel-login'),
 chooseCodex:()=>invoke('heis-agent:choose-codex'), send:input=>invoke('heis-agent:send',input),
 stop:id=>invoke('heis-agent:stop',id),answer:input=>invoke('heis-agent:answer',input),
 importDrafts:data=>invoke('heis-agent:import-drafts',data),
 onSnapshot:callback=>{const listener=(_,state)=>callback(state);ipcRenderer.on('heis-agent:snapshot',listener);return()=>ipcRenderer.removeListener('heis-agent:snapshot',listener);},
});
