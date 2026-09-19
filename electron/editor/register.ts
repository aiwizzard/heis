import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  shell,
} from "electron";
import { pathToFileURL } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { EditorService } from "./service";
import { drawEditorText } from "@heis/core";
import type { EditorCommand, Sequence, TimelineClip } from "@heis/core";
const { handleTrusted } = require("../lib/trustedIpc");

async function rasterize(
  clip: TimelineClip,
  sequence: Sequence,
  destination: string,
) {
  const window = new BrowserWindow({
    show: false,
    width: 16,
    height: 16,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await window.loadURL("data:text/html,<html><body></body></html>");
    const font = await fs.readFile(
      path.join(
        app.isPackaged
          ? path.join(process.resourcesPath, "desktop")
          : path.join(app.getAppPath(), "public"),
        "fonts",
        "dm-sans-latin.woff2",
      ),
    );
    const data = await window.webContents.executeJavaScript(
      `(async () => { const font=new FontFace('Heis Sans','url(data:font/woff2;base64,${font.toString("base64")})');document.fonts.add(await font.load()); const canvas=document.createElement('canvas'); canvas.width=${sequence.width}; canvas.height=${sequence.height}; (${drawEditorText.toString()})(canvas.getContext('2d'),${JSON.stringify(clip)},${JSON.stringify({ width: sequence.width, height: sequence.height })}); return canvas.toDataURL('image/png').split(',')[1]; })()`,
    );
    await fs.writeFile(destination, Buffer.from(data, "base64"));
  } finally {
    window.destroy();
  }
}
export function registerEditor(): EditorService {
  const runtimeDirectory = app.isPackaged
    ? path.join(process.resourcesPath, "media-runtime")
    : path.join(app.getAppPath(), "build", "media-runtime", process.arch);
  const service = new EditorService({
    userData: app.getPath("userData"),
    resources: process.resourcesPath,
    ffmpeg:
      process.env.HEIS_FFMPEG_PATH || path.join(runtimeDirectory, "ffmpeg"),
    ffprobe:
      process.env.HEIS_FFPROBE_PATH || path.join(runtimeDirectory, "ffprobe"),
    whisper:
      process.env.HEIS_WHISPER_PATH ||
      path.join(runtimeDirectory, "whisper-cli"),
    model: process.env.HEIS_WHISPER_MODEL,
    rasterize,
    onEvent: (event) => {
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send("editor:event", event);
    },
  });
  protocol.handle("heis-project", (request) =>
    net.fetch(pathToFileURL(service.resolveMedia(request.url)).toString()),
  );
  const handlers: Record<string, (...args: any[]) => unknown> = {
    status: () => service.status(),
    chooseClippingSource: async () => {
      const projectId = service.destinationProjectId();
      const selected = await dialog.showOpenDialog({ title: "Choose a spoken video", properties: ["openFile"], filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm", "m4v"] }] });
      if (selected.canceled) return null;
      const [asset] = await service.importFiles(projectId, selected.filePaths);
      return { url: `heis-project://${projectId}/${asset.path.split("/").map(encodeURIComponent).join("/")}`, name: asset.name };
    },
    transcribeSource: (sourceUrl: string) => service.transcribeSource(sourceUrl),
    extractHighlights: (sourceUrl: string, ranges: any) => service.extractHighlights(sourceUrl, ranges),
    library: () => service.library(),
    importLibrary: (id: string, assetId: string) =>
      service.importLibrary(id, assetId),
    setContext: (context: any) => service.setContext(context),
    list: () => service.list(),
    create: async (name: string) => {
      const result = await dialog.showSaveDialog({
        title: "Create Heis project",
        defaultPath: `${name.trim() || "Untitled"}.heis`,
        buttonLabel: "Create project",
      });
      return result.canceled || !result.filePath
        ? null
        : service.create(result.filePath, name);
    },
    open: async (directory?: string) => {
      if (directory && !service.list().some((p) => p.directory === directory))
        throw new Error("Choose a project with Open Project");
      const result = directory
        ? { canceled: false, filePaths: [directory] }
        : await dialog.showOpenDialog({
            title: "Open Heis project",
            properties: ["openDirectory"],
          });
      return result.canceled ? null : service.open(result.filePaths[0]);
    },
    close: () => service.close(),
    command: (command: EditorCommand) => service.command(command),
    undo: (id: string, revision: number) =>
      service.history(id, revision, false),
    redo: (id: string, revision: number) => service.history(id, revision, true),
    importMedia: async (id: string) => {
      const result = await dialog.showOpenDialog({
        title: "Import media",
        properties: ["openFile", "multiSelections"],
      });
      if (!result.canceled) service.importJob(id, result.filePaths);
    },
    relink: async (id: string, assetId: string) => {
      const result = await dialog.showOpenDialog({
        title: "Relink media",
        properties: ["openFile"],
      });
      if (!result.canceled)
        await service.relink(id, assetId, result.filePaths[0]);
    },
    export: async (id: string, sequenceId: string) => {
      const result = await dialog.showSaveDialog({
        title: "Export video",
        defaultPath: `${service.snapshot(id).project.name}.mp4`,
        filters: [{ name: "MP4 video", extensions: ["mp4"] }],
      });
      return result.canceled || !result.filePath
        ? null
        : service.exportProject(id, sequenceId, result.filePath);
    },
    transcribe: (id: string, sequenceId: string, clipIds: string[]) =>
      service.transcribe(id, sequenceId, clipIds),
    importCaptions: async (id: string, sequenceId: string) => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Subtitles", extensions: ["srt", "vtt"] }],
      });
      if (!result.canceled)
        service.importCaptions(
          id,
          sequenceId,
          await fs.readFile(result.filePaths[0], "utf8"),
        );
    },
    exportCaptions: async (id: string, sequenceId: string) => {
      const result = await dialog.showSaveDialog({
        defaultPath: "captions.srt",
        filters: [
          { name: "SubRip", extensions: ["srt"] },
          { name: "WebVTT", extensions: ["vtt"] },
        ],
      });
      if (!result.canceled && result.filePath)
        await fs.writeFile(
          result.filePath,
          service.subtitles(
            id,
            sequenceId,
            path.extname(result.filePath) === ".vtt",
          ),
        );
    },
    cancel: (id: string) => service.cancel(id),
    retry: (id: string) => service.retry(id),
    jobs: (id: string) => service.jobs(id),
    reveal: (id: string) => shell.showItemInFolder(service.output(id)),
    capture: (id: string, urls: string[], jobId: string) =>
      service.capture(id, urls, jobId),
  };
  for (const [name, handler] of Object.entries(handlers))
    handleTrusted(`editor:${name}`, (_event: unknown, ...args: unknown[]) =>
      handler(...args),
    );
  app.on("before-quit", () => service.dispose());
  app.on("browser-window-created", (_event, window) =>
    window.on("close", () => {
      if (
        window.webContents.getURL().startsWith("heis-app:") ||
        window.webContents.getURL().startsWith("http://127.0.0.1")
      )
        service.close();
    }),
  );
  return service;
}
