const crypto = require("node:crypto");
const http = require("node:http");

class McpBridge {
  private server: any = null;
  private url: string | null = null;
  private readonly token = crypto.randomBytes(32).toString("base64url");
  private readonly handlers: Record<string, (args: any) => Promise<any>>;
  constructor(handlers: Record<string, (args: any) => Promise<any>>) { this.handlers = handlers; }
  start(): Promise<{ url: string; token: string }> {
    if (this.url) return Promise.resolve({ url: this.url, token: this.token });
    return new Promise((resolve, reject) => {
      this.server = http.createServer((request: any, response: any) => void this.handle(request, response));
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => { const address = this.server.address(); this.url = `http://127.0.0.1:${address.port}`; resolve({ url: this.url!, token: this.token }); });
    });
  }
  private async handle(request: any, response: any): Promise<void> {
    if (request.method !== "POST" || request.headers.authorization !== `Bearer ${this.token}`) { response.writeHead(401).end(JSON.stringify({ error: "Unauthorized" })); return; }
    const name = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname.replace(/^\/tools\//, ""));
    const handler = this.handlers[name];
    if (!handler) { response.writeHead(404).end(JSON.stringify({ error: "Unknown Heis tool" })); return; }
    let raw = "";
    request.on("data", (chunk: Buffer) => { raw += String(chunk); if (raw.length > 1_000_000) request.destroy(); });
    request.on("end", async () => { try { const result = await handler(raw ? JSON.parse(raw) : {}); response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result)); } catch (error: any) { response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error?.message ?? "Heis tool failed." })); } });
  }
  stop(): void { this.server?.close(); this.server = null; this.url = null; }
}
module.exports = { McpBridge };
