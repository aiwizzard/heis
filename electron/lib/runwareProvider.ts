const crypto = require("node:crypto");
const { STARTER_RUNWARE_CATALOG, getCapability } = require("@heis/core");

const RUNWARE_API_URL = "https://api.runware.ai/v1";

function outputKindForResult(result: any): "image" | "video" | "audio" | "other" {
  if (result.imageURL) return "image";
  if (result.videoURL) return "video";
  if (result.audioURL) return "audio";
  return "other";
}

function outputUrl(result: any): string | undefined {
  return result.imageURL ?? result.videoURL ?? result.audioURL ?? result.outputURL;
}

function normalizeRunwareJob(jobId: string, result: any, createdAt: string): any {
  const now = new Date().toISOString();
  const url = outputUrl(result);
  return {
    id: jobId,
    providerJobId: result.taskUUID ?? jobId,
    status: "succeeded",
    reservedCredits: 0,
    settledCredits: typeof result.cost === "number" ? Math.ceil(result.cost * 200) : undefined,
    outputs: url ? [{ id: result.imageUUID ?? result.videoUUID ?? result.audioUUID ?? crypto.randomUUID(), kind: outputKindForResult(result), url }] : [],
    createdAt,
    updatedAt: now,
  };
}

class RunwareByokProvider {
  private readonly secureStore: any;
  private readonly jobs = new Map<string, any>();

  constructor(secureStore: any) {
    this.secureStore = secureStore;
  }

  async listCapabilities(): Promise<readonly any[]> {
    return STARTER_RUNWARE_CATALOG;
  }

  async upload(file: { type: string; bytes: ArrayBuffer | Uint8Array }): Promise<{ url: string }> {
    const bytes = Buffer.from(file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes));
    return { url: `data:${file.type || "application/octet-stream"};base64,${bytes.toString("base64")}` };
  }

  async submit(request: any): Promise<any> {
    const capability = getCapability(request?.modelId);
    if (!capability || !capability.enabled) throw new Error("Unknown or disabled model capability.");
    if (request.operation !== capability.operation) throw new Error("Model capability does not support this operation.");
    const apiKey = this.secureStore.get("runwareApiKey");
    if (!apiKey) throw new Error("RUNWARE_API_KEY_REQUIRED");

    const taskUUID = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const payload = {
      ...request.inputs,
      taskType: capability.outputKind === "image" ? "imageInference" : capability.outputKind === "video" ? "videoInference" : "audioInference",
      taskUUID,
      model: capability.providerModelId,
      deliveryMethod: "sync",
      includeCost: true,
    };
    const response = await fetch(RUNWARE_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify([payload]),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok || body.errors?.length) {
      const message = body.errors?.[0]?.message ?? `Runware request failed with HTTP ${response.status}.`;
      throw new Error(message);
    }
    const result = body.data?.find((item: any) => item.taskUUID === taskUUID) ?? body.data?.[0];
    if (!result) throw new Error("Runware returned no generation result.");
    const job = normalizeRunwareJob(taskUUID, result, createdAt);
    this.jobs.set(job.id, job);
    return job;
  }

  async getJob(jobId: string): Promise<any> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("JOB_NOT_FOUND");
    return job;
  }

  async cancel(): Promise<void> {
    throw new Error("A synchronous BYOK generation cannot be cancelled after submission.");
  }
}

class ManagedMediaProvider {
  private readonly authSession: any;
  private readonly baseUrl: string;

  constructor(authSession: any, baseUrl = process.env.HEIS_API_URL ?? "http://127.0.0.1:3001") {
    this.authSession = authSession;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(pathname: string, init: RequestInit = {}): Promise<any> {
    const accessToken = this.authSession.getAccessToken();
    if (!accessToken) throw new Error("HEIS_AUTH_REQUIRED");
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message ?? body.error ?? `Heis API failed with HTTP ${response.status}.`);
    return body;
  }

  listCapabilities(): Promise<readonly any[]> { return this.request("/v1/generations/capabilities"); }
  async getBalance(): Promise<{ balance: number }> {
    const account = await this.request("/v1/account");
    return { balance: (account.creditWallets ?? []).reduce((total: number, wallet: any) => total + Number(wallet.balance ?? 0), 0) };
  }
  async upload(file: { name: string; type: string; bytes: ArrayBuffer | Uint8Array }): Promise<{ url: string }> {
    const bytes = Buffer.from(file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes));
    const signed = await this.request("/v1/uploads", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: bytes.byteLength }),
    });
    const response = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: bytes });
    if (!response.ok) throw new Error(`Managed upload failed with HTTP ${response.status}.`);
    return { url: signed.assetUrl };
  }
  submit(request: any): Promise<any> {
    return this.request("/v1/generations", { method: "POST", headers: { "Idempotency-Key": request.billing.idempotencyKey }, body: JSON.stringify(request) });
  }
  getJob(jobId: string): Promise<any> { return this.request(`/v1/jobs/${encodeURIComponent(jobId)}`); }
  async cancel(jobId: string): Promise<void> { await this.request(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } }); }
}

module.exports = { ManagedMediaProvider, RunwareByokProvider, normalizeRunwareJob };
