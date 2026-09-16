import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

export type RpcMessage = {
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: { message: string; code: number };
};
// Codex uses newline-delimited JSON-RPC without a jsonrpc header, as in T3 Code.
export class CodexRpc {
  private child: ChildProcessWithoutNullStreams;
  private nextId = 0;
  private ended = false;
  private pending = new Map<
    number,
    {
      resolve(value: any): void;
      reject(error: Error): void;
      timer: NodeJS.Timeout;
    }
  >();
  constructor(
    binary: string,
    onMessage: (message: RpcMessage) => void,
    private onExit: (error: Error) => void,
    launch: { args?: string[]; env?: NodeJS.ProcessEnv } = {},
  ) {
    this.child = spawn(binary, ["app-server", ...(launch.args ?? [])], {
      stdio: "pipe",
      windowsHide: true,
      env: { ...process.env, ...launch.env },
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      if (this.ended || !line.trim()) return;
      let message: RpcMessage;
      try {
        message = JSON.parse(line);
      } catch {
        this.fail(
          new Error(
            "Codex returned an invalid protocol message. Reconnect to continue.",
          ),
        );
        return;
      }
      if (message === null || typeof message !== "object") {
        this.fail(new Error("Invalid Codex response."));
        return;
      }
      if (message.method) {
        onMessage(message);
        return;
      }
      const pending =
        typeof message.id === "number"
          ? this.pending.get(message.id)
          : undefined;
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id as number);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    // Drain stderr without sending credential-bearing diagnostics to the renderer.
    this.child.stderr.resume();
    this.child.stdin.on("error", (error) => this.fail(error));
    this.child.on("error", (error) =>
      this.fail(new Error(`Could not start Codex: ${error.message}`)),
    );
    this.child.on("exit", (code) =>
      this.fail(
        new Error(
          `Codex disconnected (exit ${code ?? "signal"}). Reconnect to continue.`,
        ),
      ),
    );
  }
  request(method: string, params?: unknown, timeout = 45000): Promise<any> {
    if (this.ended) return Promise.reject(new Error("Codex is disconnected."));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A timed-out turn may have started. Close the connection rather than replay it.
        this.fail(
          new Error(
            `Codex did not respond to ${method}. Reconnect before trying again.`,
          ),
        );
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }
  write(message: RpcMessage) {
    if (this.ended) throw new Error("Codex is disconnected.");
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }
  private fail(error: Error) {
    if (this.ended) return;
    this.close(error);
    this.onExit(error);
  }
  close(error = new Error("Codex connection closed.")) {
    if (this.ended) return;
    this.ended = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.child.stdin.end();
    const child = this.child;
    child.kill();
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }, 2000);
    timer.unref();
  }
}
