const { app } = require("electron");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const MIN_CODEX_VERSION = "0.142.0";

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number); const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function candidateCodexPaths(): string[] {
  const executable = process.platform === "win32" ? "codex.exe" : "codex";
  return [
    executable,
    path.join(os.homedir(), ".local", "bin", executable),
    path.join("/opt/homebrew/bin", executable),
    path.join("/usr/local/bin", executable),
  ];
}

function execFileResult(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, args, { timeout: 10_000 }, (error: any, stdout: string, stderr: string) => {
      if (error) reject(error);
      else resolve({ stdout: String(stdout).trim(), stderr: String(stderr).trim() });
    });
  });
}

async function findCodex(): Promise<{ executablePath: string; version: string } | null> {
  for (const candidate of candidateCodexPaths()) {
    try {
      const result = await execFileResult(candidate, ["--version"]);
      const version = result.stdout.match(/\d+\.\d+\.\d+/)?.[0] ?? result.stdout;
      return { executablePath: candidate, version };
    } catch {}
  }
  return null;
}

class CodexAppServer {
  private process: any = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private readonly onEvent: (event: any) => void;
  private readonly bridge: any;
  private readonly secureStore: any;

  constructor(onEvent: (event: any) => void, bridge: any, secureStore: any) {
    this.onEvent = onEvent;
    this.bridge = bridge;
    this.secureStore = secureStore;
  }

  async status(): Promise<any> {
    const found = await findCodex();
    if (!found) return { available: false, authenticated: false, reason: "Codex CLI is not installed." };
    if (compareVersions(found.version, MIN_CODEX_VERSION) < 0) return { available: true, authenticated: false, outdated: true, minimumVersion: MIN_CODEX_VERSION, ...found, reason: `Codex CLI ${MIN_CODEX_VERSION} or later is required.` };
    try {
      const login = await execFileResult(found.executablePath, ["login", "status"]);
      return { available: true, authenticated: /logged in|authenticated/i.test(`${login.stdout}\n${login.stderr}`), ...found };
    } catch {
      return { available: true, authenticated: false, ...found, reason: "Codex CLI is not signed in." };
    }
  }

  async start(): Promise<void> {
    if (this.process) return;
    const found = await findCodex();
    if (!found) throw new Error("CODEX_CLI_NOT_FOUND");
    if (compareVersions(found.version, MIN_CODEX_VERSION) < 0) throw new Error(`CODEX_CLI_UPDATE_REQUIRED_${MIN_CODEX_VERSION}`);
    const mcpServerPath = path.join(__dirname, "../mcp/heisMcpServer.js");
    if (app.isPackaged && !fs.existsSync(mcpServerPath)) throw new Error("HEIS_MCP_SERVER_NOT_FOUND");
    const args = ["app-server", "--stdio"];
    if (fs.existsSync(mcpServerPath)) {
      args.push(
        "-c", `mcp_servers.heis.command=${JSON.stringify(process.execPath)}`,
        "-c", `mcp_servers.heis.args=${JSON.stringify([mcpServerPath])}`,
      );
    }
    const bridge = await this.bridge.start();
    const env = { ...process.env, HEIS_MCP_BRIDGE_URL: bridge.url, HEIS_MCP_BRIDGE_TOKEN: bridge.token };
    const openaiApiKey = this.secureStore.get("openaiApiKey");
    if (openaiApiKey) env.OPENAI_API_KEY = openaiApiKey;
    if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = "1";
    this.process = childProcess.spawn(found.executablePath, args, { stdio: ["pipe", "pipe", "pipe"], env });
    this.process.once("exit", (code: number) => this.failAll(new Error(`Codex app-server exited with code ${code}.`)));
    this.process.stderr.on("data", (chunk: Buffer) => this.onEvent({ type: "diagnostic", message: String(chunk) }));
    const lines = readline.createInterface({ input: this.process.stdout });
    lines.on("line", (line: string) => this.handleLine(line));
    await this.request("initialize", { clientInfo: { name: "heis", title: "Heis", version: app.getVersion() } });
    this.notify("initialized", {});
  }

  private handleLine(line: string): void {
    try {
      const message = JSON.parse(line);
      if (typeof message.id === "number" && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id)!;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? "Codex request failed."));
        else pending.resolve(message.result);
      } else if (message.method) this.onEvent(message);
    } catch {
      this.onEvent({ type: "diagnostic", message: "Codex returned malformed JSON." });
    }
  }

  private failAll(error: Error): void {
    this.process = null;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private request(method: string, params: any): Promise<any> {
    if (!this.process?.stdin?.writable) return Promise.reject(new Error("CODEX_APP_SERVER_NOT_RUNNING"));
    const id = this.nextId++;
    this.process.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  private notify(method: string, params: any): void {
    this.process.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  async startThread(input: any): Promise<any> {
    await this.start();
    const result = await this.request("thread/start", { cwd: input.cwd, model: input.model, serviceName: "heis" });
    return { id: result.thread.id, title: input.title };
  }

  async startTurn(threadId: string, input: any): Promise<any> {
    return this.request("turn/start", { threadId, input: [{ type: "text", text: input.text }] });
  }

  async interrupt(threadId: string, turnId: string): Promise<void> {
    await this.request("turn/interrupt", { threadId, turnId });
  }

  stop(): void {
    if (!this.process) return;
    this.process.kill();
    this.failAll(new Error("Codex app-server stopped."));
  }
}

module.exports = { CodexAppServer, MIN_CODEX_VERSION, candidateCodexPaths, compareVersions, findCodex };
