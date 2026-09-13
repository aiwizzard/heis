const { app } = require("electron");
const childProcess = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error: Error | undefined) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitUntilReady(url: string, processRef: any): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) throw new Error(`Desktop renderer exited with code ${processRef.exitCode}.`);
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out while starting the desktop renderer.");
}

class NextServer {
  private process: any = null;
  private url: string | null = null;

  async start(): Promise<string> {
    if (this.url) return this.url;
    const root = app.isPackaged ? path.join(process.resourcesPath, "next", "standalone") : path.join(app.getAppPath(), ".next", "standalone");
    const serverPath = path.join(root, "server.js");
    const port = await availablePort();
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1", HOSTNAME: "127.0.0.1", PORT: String(port), NODE_ENV: "production" };
    this.process = childProcess.spawn(process.execPath, [serverPath], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    this.process.stdout.on("data", (chunk: Buffer) => console.log(`[renderer] ${String(chunk).trimEnd()}`));
    this.process.stderr.on("data", (chunk: Buffer) => console.error(`[renderer] ${String(chunk).trimEnd()}`));
    this.url = `http://127.0.0.1:${port}`;
    await waitUntilReady(this.url, this.process);
    return this.url;
  }

  stop(): void {
    this.process?.kill(); this.process = null; this.url = null;
  }
}

module.exports = { NextServer, availablePort, waitUntilReady };
