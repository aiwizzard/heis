const crypto = require("node:crypto");
const os = require("node:os");

class LicenseService {
  private readonly authSession: any;
  private readonly entitlementStore: any;
  private readonly installationStore: any;
  private readonly baseUrl: string;

  constructor(authSession: any, entitlementStore: any, installationStore: any, baseUrl = process.env.HEIS_API_URL ?? "http://127.0.0.1:3001") {
    this.authSession = authSession;
    this.entitlementStore = entitlementStore;
    this.installationStore = installationStore;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async refresh(): Promise<any> {
    const accessToken = this.authSession.getAccessToken();
    if (!accessToken) throw new Error("HEIS_AUTH_REQUIRED");
    const response = await fetch(`${this.baseUrl}/v1/devices/activate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ installationId: this.installationStore.get(), deviceName: os.hostname() || "Mac" }),
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message ?? `Entitlement refresh failed with HTTP ${response.status}.`);
    this.entitlementStore.set(body);
    return body;
  }
}

module.exports = { LicenseService };
