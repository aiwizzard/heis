const { app, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ALLOWED_SECRET_NAMES = new Set([
  "openaiApiKey",
  "supabaseRefreshToken",
]);

type SecretName = "openaiApiKey" | "supabaseRefreshToken";

function assertSecretName(name: string): asserts name is SecretName {
  if (!ALLOWED_SECRET_NAMES.has(name)) throw new Error("Unsupported secret name.");
}

class SecureStore {
  private readonly filePath: string;

  constructor(filePath = path.join(app.getPath("userData"), "secure-store.json")) {
    this.filePath = filePath;
  }

  private readAll(): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch (error: any) {
      if (error?.code === "ENOENT") return {};
      throw error;
    }
  }

  private writeAll(values: Record<string, string>): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(values), { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    fs.chmodSync(this.filePath, 0o600);
  }

  set(name: string, value: string): void {
    assertSecretName(name);
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure operating-system storage is unavailable.");
    }
    if (!value.trim()) throw new Error("Secret value cannot be empty.");
    const values = this.readAll();
    values[name] = safeStorage.encryptString(value).toString("base64");
    this.writeAll(values);
  }

  get(name: string): string | null {
    assertSecretName(name);
    const encrypted = this.readAll()[name];
    if (!encrypted) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  }

  has(name: string): boolean {
    assertSecretName(name);
    return Boolean(this.readAll()[name]);
  }

  delete(name: string): void {
    assertSecretName(name);
    const values = this.readAll();
    delete values[name];
    this.writeAll(values);
  }
}

module.exports = { SecureStore, ALLOWED_SECRET_NAMES };
