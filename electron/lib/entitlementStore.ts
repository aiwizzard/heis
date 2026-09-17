const { app } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function canonicalPayload(snapshot: any): string {
  const { signature: _signature, ...payload } = snapshot;
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function verifySnapshot(snapshot: any, publicKeyPem: string): boolean {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.signature || !publicKeyPem) return false;
  try {
    return crypto.verify(
      null,
      Buffer.from(canonicalPayload(snapshot)),
      crypto.createPublicKey(publicKeyPem),
      Buffer.from(snapshot.signature, "base64"),
    );
  } catch {
    return false;
  }
}

class EntitlementStore {
  private readonly filePath: string;
  private readonly publicKeyPem: string;

  constructor(options: { filePath?: string; publicKeyPem?: string } = {}) {
    this.filePath = options.filePath ?? path.join(app.getPath("userData"), "entitlement.json");
    this.publicKeyPem = options.publicKeyPem ?? process.env.HEIS_ENTITLEMENT_PUBLIC_KEY ?? "";
  }

  get(): any | null {
    try {
      const snapshot = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (!verifySnapshot(snapshot, this.publicKeyPem)) return null;
      if (!new Set(["free","creator","pro"]).has(snapshot.mode) || !(new Date(snapshot.validUntil).getTime() >= Date.now())) return null;
      return snapshot;
    } catch {
      return null;
    }
  }

  clear(): void { fs.rmSync(this.filePath, { force: true }); }

  set(snapshot: any): void {
    if (!verifySnapshot(snapshot, this.publicKeyPem)) {
      throw new Error("Entitlement signature is invalid.");
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(snapshot), { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }
}

module.exports = { EntitlementStore, canonicalPayload, verifySnapshot };
