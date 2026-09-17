const crypto = require("node:crypto");

class ManagedMediaProvider {
  private readonly authSession: any;
  private readonly baseUrl: string;

  constructor(authSession: any, baseUrl = process.env.HEIS_API_URL ?? "https://app.heis.studio") {
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

module.exports = { ManagedMediaProvider };
