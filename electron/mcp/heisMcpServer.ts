const readline = require("node:readline");

const TOOLS = [
  { name: "heis_list_capabilities", description: "List generation capabilities available in Heis.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "heis_generate", description: "Submit an image, video, or audio generation. The Heis app asks the user to approve spending first.", inputSchema: { type: "object", required: ["operation", "modelId", "inputs"], properties: { operation: { type: "string" }, modelId: { type: "string" }, inputs: { type: "object" } } }, annotations: { readOnlyHint: false, openWorldHint: true } },
  { name: "heis_project_info", description: "Read summary information about the open Heis project.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "heis_export", description: "Export the active Heis project. The app asks before replacing an existing file.", inputSchema: { type: "object", properties: { destination: { type: "string" }, format: { type: "string" } } }, annotations: { readOnlyHint: false } },
];

async function bridgeCall(tool: string, args: any): Promise<any> {
  const url = process.env.HEIS_MCP_BRIDGE_URL;
  const token = process.env.HEIS_MCP_BRIDGE_TOKEN;
  if (!url || !token) throw new Error("Heis MCP bridge is unavailable.");
  const response = await fetch(`${url}/tools/${encodeURIComponent(tool)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Heis tool failed with HTTP ${response.status}.`);
  return body;
}

async function dispatch(message: any): Promise<any> {
  if (message.method === "initialize") return { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "heis", version: "0.1.0" } };
  if (message.method === "tools/list") return { tools: TOOLS };
  if (message.method === "tools/call") {
    const result = await bridgeCall(message.params?.name, message.params?.arguments);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
  if (message.method === "ping") return {};
  throw new Error(`Unsupported MCP method: ${message.method}`);
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", async (line: string) => {
  let message: any;
  try { message = JSON.parse(line); }
  catch { return; }
  if (message.id === undefined) return;
  try {
    const result = await dispatch(message);
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`);
  } catch (error: any) {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: error?.message ?? "MCP request failed." } })}\n`);
  }
});
