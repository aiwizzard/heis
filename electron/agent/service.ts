import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Snapshot,
  Thread,
  SendInput,
  RequestAnswer,
  ChatItem,
  PendingRequest,
} from "./types";
import { CodexRpc, type RpcMessage } from "./rpc";

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const busy = (thread: Thread) =>
  ["starting", "running", "waiting"].includes(thread.status);
const LIMIT = 200000;
export class CodexService {
  private state: Snapshot = {
    revision: 0,
    projects: [],
    threads: [],
    codex: { state: "connecting", message: "Connecting to Codex..." },
    models: [],
  };
  private rpc?: CodexRpc;
  private connecting?: Promise<void>;
  private loaded = new Set<string>();
  private turns = new Map<string, string>();
  private pending = new Map<
    string,
    { wireId: number | string; threadId: string; kind: PendingRequest["kind"] }
  >();
  private timer?: NodeJS.Timeout;
  private file: string;
  private binary?: string;
  private imported = false;
  private loginId?: string;
  private stopping = new Set<string>();
  private disposed = false;
  constructor(
    directory: string,
    private publish: (snapshot: Snapshot) => void,
    private openLogin: (url: string) => Promise<void>,
    private bundledBinary?: string,
    private launch?: () => Promise<{ args?: string[]; env?: NodeJS.ProcessEnv }>,
  ) {
    this.file = path.join(directory, "workspace.json");
    if (existsSync(this.file)) {
      // Preserve corrupt files instead of silently overwriting conversation history.
      const saved = JSON.parse(readFileSync(this.file, "utf8"));
      if (
        !Array.isArray(saved.projects) ||
        !Array.isArray(saved.threads) ||
        saved.version !== 1
      )
        throw new Error(
          "Unsupported workspace file. Back up workspace.json before restoring it.",
        );
      this.state.projects = saved.projects.filter(
        (p: unknown) => typeof p === "string",
      );
      this.state.threads = saved.threads.map((t: Thread) => ({
        ...t,
        status: busy(t) ? "error" : t.status,
        error: busy(t)
          ? "Heis closed during this turn. Send a new message to resume the conversation."
          : t.error,
        requests: [],
      }));
      this.binary = saved.binary;
      this.imported = !!saved.imported;
    }
  }
  snapshot() {
    return structuredClone(this.state);
  }
  private changed(immediate = true) {
    if (this.disposed) return;
    if (!immediate) {
      this.timer ??= setTimeout(() => {
        this.timer = undefined;
        this.changed();
      }, 60);
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
    this.state.revision++;
    try {
      writeFileSync(
        this.file + ".tmp",
        JSON.stringify({
          version: 1,
          projects: this.state.projects,
          threads: this.state.threads,
          binary: this.binary,
          imported: this.imported,
        }),
        { mode: 0o600 },
      );
      renameSync(this.file + ".tmp", this.file);
    } catch (error) {
      this.state.codex.message = `Workspace could not be saved: ${errorText(error)}`;
    }
    this.publish(this.snapshot());
  }
  addProject(project: string) {
    if (!this.state.projects.includes(project))
      this.state.projects.push(project);
    this.changed();
  }
  importDrafts(data: any) {
    if (this.imported) return;
    if (data && Array.isArray(data.threads)) {
      for (const t of data.threads) {
        if (!t || typeof t.note !== "string" || typeof t.title !== "string")
          continue;
        this.state.threads.push({
          id: randomUUID(),
          title: t.title.slice(0, 100),
          project: null,
          draft: t.note.slice(0, LIMIT),
          items: [],
          requests: [],
          status: "idle",
        });
      }
    }
    this.imported = true;
    this.changed();
  }
  private resolveBinary() {
    const candidates = [
      process.env.HEIS_CODEX_BINARY,
      this.binary,
      this.bundledBinary,
      ...(process.env.PATH ?? "")
        .split(path.delimiter)
        .filter(Boolean)
        .map((p) =>
          path.join(p, process.platform === "win32" ? "codex.exe" : "codex"),
        ),
      path.join(homedir(), ".local/bin/codex"),
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      path.join(homedir(), ".cargo/bin/codex"),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        /* Try next install location. */
      }
    }
    throw new Error(
      "Codex CLI was not found. Install Codex, or choose its executable in Connection settings.",
    );
  }
  async chooseBinary(binary: string) {
    if (this.state.threads.some(busy))
      throw new Error("Stop the current turn before changing Codex.");
    this.binary = binary;
    this.rpc?.close();
    this.rpc = undefined;
    this.loaded.clear();
    this.changed();
    await this.refresh();
  }
  async reconnect() {
    if(this.state.threads.some(busy)) throw new Error('Stop the current turn before reconnecting.');
    this.rpc?.close(); this.rpc = undefined; this.loaded.clear();
    await this.refresh();
  }
  async refresh() {
    if (this.connecting) return this.connecting;
    if (
      this.rpc &&
      this.state.threads.some(
        (t) => t.status === "running" || t.status === "waiting",
      )
    )
      return;
    this.connecting = this.connect().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }
  private async connect() {
    try {
      if (!this.rpc) {
        this.state.codex = {
          state: "connecting",
          message: "Connecting to Codex...",
        };
        this.changed();
        const binary = this.resolveBinary();
        const launch = await this.launch?.();
        const rpc = new CodexRpc(
          binary,
          (m) => this.message(m),
          (error) => {
            if (this.rpc !== rpc) return;
            this.rpc = undefined;
            this.loaded.clear();
            this.turns.clear();
            this.pending.clear();
            this.stopping.clear();
            this.loginId = undefined;
            this.state.codex = {
              state: "error",
              message: error.message,
              binary,
            };
            for (const thread of this.state.threads)
              if (busy(thread)) {
                thread.status = "error";
                thread.error = error.message;
                thread.requests = [];
              }
            this.changed();
          },
          launch,
        );
        this.rpc = rpc;
        await rpc.request("initialize", {
          clientInfo: { name: "heis_desktop", title: "Heis", version: "2.0.0" },
          capabilities: { experimentalApi: true },
        });
        rpc.write({ method: "initialized", params: {} });
        this.state.codex.binary = binary;
      }
      const account = await this.rpc.request("account/read", {});
      const authenticated =
        !!account.account || account.requiresOpenaiAuth === false;
      this.state.codex = {
        state: authenticated ? "ready" : "signed-out",
        binary: this.state.codex.binary,
        message: authenticated
          ? "Codex connected"
          : "Sign in with ChatGPT, or run codex login in your terminal.",
        account:
          account.account?.type === "chatgpt"
            ? [account.account.email, account.account.planType]
                .filter(Boolean)
                .join(" · ")
            : account.account?.type,
        loginPending: !!this.loginId,
      };
      this.changed();
      if (authenticated) {
        const models = await this.rpc.request("model/list", {});
        this.state.models = (models.data ?? [])
          .filter((m: any) => typeof m.model === "string")
          .map((m: any) => ({
            id: m.model,
            name: text(m.displayName) || m.model,
            isDefault: !!m.isDefault,
          }));
        this.changed();
      }
    } catch (error) {
      this.rpc?.close();
      this.rpc = undefined;
      this.loaded.clear();
      this.state.codex = { state: "error", message: errorText(error) };
      this.changed();
    }
  }
  async login() {
    await this.refresh();
    if (!this.rpc) throw new Error(this.state.codex.message);
    if (this.loginId) return;
    const response = await this.rpc.request("account/login/start", {
      type: "chatgpt",
    });
    this.loginId = response.loginId;
    this.state.codex.loginPending = true;
    this.changed();
    try {
      await this.openLogin(response.authUrl);
    } catch (error) {
      await this.cancelLogin();
      throw error;
    }
  }
  async cancelLogin() {
    if (this.loginId && this.rpc)
      await this.rpc.request("account/login/cancel", { loginId: this.loginId });
    this.loginId = undefined;
    this.state.codex.loginPending = false;
    this.changed();
  }
  async send(input: SendInput) {
    if (
      !input ||
      typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > LIMIT ||
      typeof input.project !== "string"
    )
      throw new Error("Enter a message and choose a project.");
    if (!this.state.projects.includes(input.project))
      throw new Error("Choose this project using the folder picker first.");
    if (
      input.model !== undefined &&
      (typeof input.model !== "string" || input.model.length > 200)
    )
      throw new Error("Invalid model.");
    if (this.state.threads.some(busy))
      throw new Error("Wait for the current turn or stop it first.");
    let thread = input.threadId
      ? this.state.threads.find((t) => t.id === input.threadId)
      : undefined;
    if (input.threadId && !thread)
      throw new Error("Conversation was not found.");
    if (thread?.providerId && thread.project !== input.project)
      throw new Error(
        "A conversation stays in its original project. Start a new thread to change projects.",
      );
    if (!thread) {
      thread = {
        id: randomUUID(),
        title: input.text.trim().split("\n")[0].slice(0, 70),
        project: input.project,
        items: [],
        requests: [],
        status: "idle",
      };
      this.state.threads.unshift(thread);
    }
    thread.project = input.project;
    thread.status = "starting";
    thread.error = undefined;
    thread.draft = input.text;
    this.changed();
    try {
      if (!(await stat(input.project)).isDirectory())
        throw new Error("The project folder no longer exists.");
      await this.refresh();
      if (!this.rpc || this.state.codex.state !== "ready")
        throw new Error(this.state.codex.message);
      const rpc = this.rpc;
      const params = {
        cwd: input.project,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        approvalsReviewer: "user",
        ...(input.model ? { model: input.model } : {}),
      };
      if (!thread.providerId || !this.loaded.has(thread.providerId)) {
        const response = await rpc.request(
          thread.providerId ? "thread/resume" : "thread/start",
          {
            ...params,
            ...(thread.providerId ? { threadId: thread.providerId } : {}),
          },
        );
        for (const turn of response.thread.turns ?? []) {
          for (const item of turn.items ?? []) this.upsertItem(thread, item);
        }
        thread.providerId = response.thread.id;
        thread.model = response.model;
        this.loaded.add(thread.providerId!);
        this.changed();
      }
      if (this.stopping.delete(thread.id)) {
        thread.status = "idle";
        this.changed();
        return thread.id;
      }
      thread.items.push({
        id: randomUUID(),
        role: "user",
        text: input.text.trim(),
      });
      thread.draft = undefined;
      thread.status = "running";
      this.changed();
      const response = await rpc.request("turn/start", {
        threadId: thread.providerId,
        input: [{ type: "text", text: input.text.trim() }],
        ...(input.model ? { model: input.model } : {}),
      });
      if (input.model) thread.model = input.model;
      // Completion may arrive before the request response, so do not resurrect a completed turn.
      if (busy(thread)) {
        this.turns.set(thread.id, response.turn.id);
        if (this.stopping.delete(thread.id)) await this.stop(thread.id);
      }
      this.changed();
      return thread.id;
    } catch (error) {
      thread.status = "error";
      thread.error = errorText(error);
      thread.requests = [];
      this.stopping.delete(thread.id);
      this.changed();
      throw error;
    }
  }
  async stop(id: string) {
    const thread = this.state.threads.find((t) => t.id === id);
    if (!thread || !busy(thread)) return;
    const turnId = this.turns.get(id);
    if (!turnId) {
      this.stopping.add(id);
      return;
    }
    await this.rpc?.request("turn/interrupt", {
      threadId: thread.providerId,
      turnId,
    });
    this.clearRequests(thread);
    this.changed();
  }
  async answer(input: RequestAnswer) {
    const pending = this.pending.get(input?.requestId);
    const thread = this.state.threads.find((t) => t.id === input?.threadId);
    if (!pending || !thread || pending.threadId !== thread.id || !busy(thread))
      throw new Error("This request is no longer active.");
    const request = thread.requests.find((r) => r.id === input.requestId)!;
    let result: unknown;
    if (pending.kind === "input") {
      const answers: Record<string, { answers: string[] }> = {};
      for (const q of request.questions ?? []) {
        const value = input.answers?.[q.id];
        if (typeof value !== "string" || !value.trim() || value.length > 20000)
          throw new Error("Answer each question before submitting.");
        answers[q.id] = { answers: [value] };
      }
      result = { answers };
    } else {
      if (
        !["accept", "decline", "cancel"].includes(input.decision ?? "") ||
        (input.decision === "accept" && !request.canAccept)
      )
        throw new Error("Invalid approval decision.");
      result = { decision: input.decision };
    }
    if (!this.rpc) throw new Error("Codex disconnected.");
    this.rpc.write({ id: pending.wireId, result });
    this.pending.delete(input.requestId);
    thread.requests = thread.requests.filter((r) => r.id !== input.requestId);
    thread.status = thread.requests.length ? "waiting" : "running";
    this.changed();
  }
  private clearRequests(thread: Thread) {
    for (const request of thread.requests) {
      const p = this.pending.get(request.id);
      if (p && this.rpc) {
        try {
          this.rpc.write({
            id: p.wireId,
            result:
              p.kind === "input" ? { answers: {} } : { decision: "cancel" },
          });
        } catch {
          /* Already disconnected. */
        }
      }
      this.pending.delete(request.id);
    }
    thread.requests = [];
  }
  private message(message: RpcMessage) {
    const p = message.params ?? {};
    if (message.method === "account/login/completed") {
      this.loginId = undefined;
      if (!p.success) {
        this.state.codex.loginPending = false;
        this.state.codex.message = text(p.error) || "Sign-in cancelled.";
        this.changed();
      } else void this.refresh();
      return;
    }
    const thread = this.state.threads.find((t) => t.providerId === p.threadId);
    if (message.id !== undefined) {
      if (!thread || !busy(thread)) {
        this.rpc?.write({
          id: message.id,
          error: {
            code: -32601,
            message: "No active Heis conversation for this request.",
          },
        });
        return;
      }
      let kind: PendingRequest["kind"];
      if (message.method === "item/commandExecution/requestApproval")
        kind = "command";
      else if (message.method === "item/fileChange/requestApproval")
        kind = "file";
      else if (message.method === "item/tool/requestUserInput") kind = "input";
      else {
        this.rpc?.write({
          id: message.id,
          error: {
            code: -32601,
            message:
              "Heis does not support this request. No permission was granted.",
          },
        });
        thread.items.push({
          id: randomUUID(),
          role: "system",
          text: `Unsupported Codex request: ${message.method}. No permission was granted.`,
        });
        this.changed();
        return;
      }
      const id = randomUUID();
      const item = thread.items.find((i) => i.id === p.itemId);
      thread.requests.push({
        id,
        kind,
        title:
          kind === "command"
            ? "Allow this command?"
            : kind === "file"
              ? "Allow these file changes?"
              : "Codex needs your input",
        detail: [
          text(p.reason),
          text(p.command),
          text(p.cwd),
          kind === "file" ? item?.text || text(p.grantRoot) : "",
        ]
          .filter(Boolean)
          .join("\n"),
        questions: kind === "input" ? p.questions : undefined,
        canAccept:
          !Array.isArray(p.availableDecisions) ||
          p.availableDecisions.includes("accept"),
      });
      this.pending.set(id, { wireId: message.id, threadId: thread.id, kind });
      thread.status = "waiting";
      this.changed();
      return;
    }
    if (!thread) return;
    switch (message.method) {
      case "serverRequest/resolved": {
        for (const [id, request] of this.pending) {
          if (
            request.threadId === thread.id &&
            request.wireId === p.requestId
          ) {
            this.pending.delete(id);
            thread.requests = thread.requests.filter(
              (request) => request.id !== id,
            );
          }
        }
        if (thread.status === "waiting" && !thread.requests.length)
          thread.status = "running";
        this.changed();
        return;
      }
      case "turn/started":
        this.turns.set(thread.id, p.turn.id);
        break;
      case "turn/completed":
        // Final items are a fallback for providers that omit some streaming notifications.
        for (const item of p.turn.items ?? []) this.upsertItem(thread, item);
        this.turns.delete(thread.id);
        this.stopping.delete(thread.id);
        this.clearRequests(thread);
        thread.status = p.turn.status === "failed" ? "error" : "idle";
        thread.error = p.turn.error?.message;
        if (p.turn.status === "interrupted")
          thread.items.push({
            id: randomUUID(),
            role: "system",
            text: "Turn stopped.",
          });
        this.changed();
        return;
      case "item/started":
      case "item/completed":
        this.upsertItem(thread, p.item);
        break;
      case "item/agentMessage/delta":
        this.delta(thread, p.itemId, "assistant", p.delta);
        break;
      case "item/commandExecution/outputDelta":
        this.delta(thread, p.itemId, "tool", p.delta);
        break;
      case "error":
        thread.error = text(p.error?.message) || "Codex reported an error.";
        if (!p.willRetry) {
          thread.status = "error";
          this.clearRequests(thread);
        }
        break;
      default:
        return;
    }
    this.changed(false);
  }
  private delta(
    thread: Thread,
    id: string,
    role: ChatItem["role"],
    delta: unknown,
  ) {
    let item = thread.items.find((i) => i.id === id);
    if (!item) {
      item = { id, role, text: "" };
      thread.items.push(item);
    }
    item.text = (item.text + text(delta)).slice(-LIMIT);
  }
  private upsertItem(thread: Thread, raw: any) {
    if (!raw || typeof raw.id !== "string" || raw.type === "userMessage")
      return;
    let item: ChatItem;
    if (raw.type === "agentMessage")
      item = { id: raw.id, role: "assistant", text: text(raw.text) };
    else if (raw.type === "commandExecution")
      item = {
        id: raw.id,
        role: "tool",
        title: text(raw.command) || "Command",
        state: raw.status,
        text: text(raw.aggregatedOutput),
      };
    else if (raw.type === "fileChange")
      item = {
        id: raw.id,
        role: "tool",
        title: "File changes",
        state: raw.status,
        text: (raw.changes ?? [])
          .map((c: any) => `${text(c.path)}\n${text(c.diff)}`)
          .join("\n\n"),
      };
    else if (raw.type === "mcpToolCall")
      item = {
        id: raw.id,
        role: "tool",
        title: `${text(raw.server)} / ${text(raw.tool)}`,
        state: raw.status,
        text: raw.error
          ? JSON.stringify(raw.error)
          : raw.result
            ? JSON.stringify(raw.result)
            : "Working...",
      };
    else return;
    item.text = item.text.slice(-LIMIT);
    const old = thread.items.find((i) => i.id === item.id);
    if (old) Object.assign(old, item.text ? item : { ...item, text: old.text });
    else thread.items.push(item);
  }
  dispose() {
    for (const thread of this.state.threads)
      if (busy(thread)) {
        this.clearRequests(thread);
        thread.status = "error";
        thread.error =
          "Heis closed during this turn. Send a new message to resume.";
      }
    this.changed();
    this.disposed = true;
    clearTimeout(this.timer);
    this.rpc?.close();
    this.rpc = undefined;
  }
}
